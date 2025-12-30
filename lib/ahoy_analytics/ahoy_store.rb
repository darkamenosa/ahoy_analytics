# frozen_string_literal: true

class Ahoy::Store < Ahoy::DatabaseStore
  # Allow Ahoy::DatabaseStore to persist custom columns we added to ahoy_visits
  def visit_columns
    super + %i[hostname screen_size browser_version os_version]
  end
  # Enrich visits with geo and site info, then broadcast realtime update
  def track_visit(data)
    data = data.with_indifferent_access
    attrs = data.dup

    # Hostname from request or landing_page URL
    req = AhoyAnalytics::Current.request
    if req
      attrs[:hostname] ||= req.host
      host = attrs[:hostname].presence || req.host

      # Prefer the real landing page (first page URL), never the Ahoy API endpoints.
      # If landing_page is blank OR looks like an internal endpoint (e.g. /ahoy/visits),
      # replace with the Referer header which points to the actual page URL.
      begin
        lp = attrs[:landing_page].to_s
        if lp.blank? || internal_path?(lp)
          attrs[:landing_page] = req.referer if req.referer.present?
        end
      rescue StandardError
        # never block tracking
      end
      # Best-effort referrer domain if not set
      if req.referer.present?
        begin
          ref_host = URI.parse(req.referer).host
          # Replicate Plausible: ignore local and internal referrers entirely
          if local_host?(ref_host) || same_site_host?(ref_host, host)
            attrs[:referrer] = nil if attrs[:referrer].to_s == req.referer
            attrs[:referring_domain] = nil
          else
            attrs[:referring_domain] ||= ref_host
          end
        rescue URI::InvalidURIError
          # ignore
        end
      end

      # Build candidate IP list from request headers if available; otherwise, try the data payload
      candidates = []
      xff = nil
      %w[HTTP_CF_CONNECTING_IP HTTP_TRUE_CLIENT_IP HTTP_X_REAL_IP].each do |h|
        v = req.get_header(h)
        candidates << v if v.present?
      end
      xff = req.get_header("HTTP_X_FORWARDED_FOR").to_s
      candidates.concat(xff.split(",").map(&:strip)) if xff.present?
      candidates << req.get_header("REMOTE_ADDR")
      candidates << (req.ip rescue nil)
      candidates << (req.remote_ip rescue nil)
      # API path may not attach a controller/request to the store; use ip provided by Ahoy data
      ip_from_data = data[:ip].to_s.presence
      candidates << ip_from_data if ip_from_data
      candidates = candidates.compact.uniq

      client_ip = nil
      record = nil

      if defined?(AhoyAnalytics::MaxmindGeo)
        client_ip = candidates.find { |ip| AhoyAnalytics::MaxmindGeo.valid_ip?(ip) }
        # Secondary heuristic: some stacks append client IP at the RIGHT of XFF
        if client_ip.nil? && xff.present?
          xff.split(",").map(&:strip).reverse_each do |ip|
            if AhoyAnalytics::MaxmindGeo.valid_ip?(ip)
              client_ip = ip
              break
            end
          end
        end

        record = client_ip ? AhoyAnalytics::MaxmindGeo.lookup(client_ip) : nil

        if record
          attrs[:country]   ||= record[:country_iso]
          attrs[:region]    ||= record[:subdivisions]&.first
          attrs[:city]      ||= record[:city]
          attrs[:latitude]  ||= record[:latitude]
          attrs[:longitude] ||= record[:longitude]
        end
      end

      # Cloudflare country fallback is useful regardless of MaxMind availability
      begin
        cc = req.get_header("HTTP_CF_IPCOUNTRY").to_s.upcase.presence
        attrs[:country] ||= cc if cc
      rescue StandardError
      end

    else
      # No request object available (common for API-created visits)
      # Fallback: extract hostname from landing_page URL
      begin
        lp = (attrs[:landing_page] || data[:landing_page]).to_s
        if lp.present?
          attrs[:hostname] ||= URI.parse(lp).host
        end
      rescue URI::InvalidURIError
        # ignore
      end
    end

    # Prefer UA-derived device bucket like Plausible
    begin
      ua = (AhoyAnalytics::Current.request&.user_agent || attrs[:user_agent]).to_s
      bucket = AhoyAnalytics::DeviceBucket.classify(ua)
      attrs[:screen_size] = bucket if bucket.present?
    rescue StandardError
      # ignore UA parsing errors
    end

    # Extract browser_version and os_version using DeviceDetector (Plausible-style major.minor)
    begin
      ua_string = (AhoyAnalytics::Current.request&.user_agent || attrs[:user_agent]).to_s
      if ua_string.present? && defined?(DeviceDetector)
        detector = DeviceDetector.new(ua_string)
        # Browser version: take major.minor only (e.g., "120.0.6099" → "120.0")
        if detector.full_version.present?
          attrs[:browser_version] = major_minor_version(detector.full_version)
        end
        # OS version: take major.minor only (e.g., "10.15.7" → "10.15")
        if detector.os_full_version.present?
          attrs[:os_version] = major_minor_version(detector.os_full_version)
        end
      end
    rescue StandardError
      # never block tracking
    end

    result = super(attrs)

    # Post-create cleanup in case Ahoy overwrote attrs from request
    begin
      token = data[:visit_token]
      v = token.present? ? ::Ahoy::Visit.find_by(visit_token: token) : nil
      if v
        # Ensure hostname is set
        req_host = AhoyAnalytics::Current.request&.host
        if v.hostname.blank? && req_host.present?
          v.update_column(:hostname, req_host)
        end
        # Clear self-referrals if referring_domain equals the site host
        site_host = v.hostname.presence || req_host
        if local_host?(v.referring_domain) || same_site_host?(v.referring_domain, site_host)
          v.update_columns(referrer: nil, referring_domain: nil)
        end
      end
    rescue StandardError
      # never block tracking
    end

    result
  end

  # Capture screen_size into visit on first event we see it
  def track_event(data)
    data = data.with_indifferent_access

    # Pre-dedupe: eliminate duplicate pageview events for the same visit & page
    begin
      req = AhoyAnalytics::Current.request
      name = data[:name].to_s
      if name == "pageview"
        props = data[:properties].to_h.with_indifferent_access
        page_value = props[:page]
        token = data[:visit_token]
        event_time = begin
          t = data[:time]
          # Ahoy accepts integer seconds; tolerate float or nil
          t.present? ? Time.at(t.to_f).in_time_zone : Time.current
        rescue StandardError
          Time.current
        end
        # Suppress phantom root pageviews: if "/" is first and a non-root pageview
        # arrives shortly after for the same visit, drop the root event.
        begin
          if token.present? && page_value.present? && page_value.to_s != "/"
            if (v = ::Ahoy::Visit.find_by(visit_token: token))
              phantom = ::Ahoy::Event
                .where(visit_id: v.id, name: "pageview")
                .where("time BETWEEN ? AND ?", event_time - 2.seconds, event_time + 0.seconds)
                .where("ahoy_events.properties->>'page' = '/'")
                .where("coalesce(ahoy_events.properties->>'referrer','') = ''")
                .order(time: :desc)
                .first
              if phantom
                phantom.delete
                # landing_page should reflect the actual entry URL
                url_now = props[:url].to_s
                v.update_column(:landing_page, url_now) if url_now.present?
              end
            end
          end
        rescue StandardError
          # never block tracking
        end
        if token.present? && page_value.present?
          if (v = ::Ahoy::Visit.find_by(visit_token: token))
            # If a pageview for the same page exists within ±1s, treat it as duplicate and skip insert
            dup_exists = ::Ahoy::Event
              .where(visit_id: v.id, name: "pageview")
              .where("time BETWEEN ? AND ?", event_time - 1.second, event_time + 1.second)
              .where("ahoy_events.properties->>'page' = ?", page_value.to_s)
              .exists?

            if dup_exists
              # Best-effort landing_page correction even when skipping insert
              begin
                url = props[:url].to_s
                if url.present? && v.landing_page.present?
                  lp_path = begin
                    URI.parse(v.landing_page).path
                  rescue URI::InvalidURIError
                    v.landing_page.to_s
                  end
                  url_path = begin
                    URI.parse(url).path
                  rescue URI::InvalidURIError
                    url
                  end
                  if lp_path.to_s == "/" && url_path.present? && url_path != "/"
                    v.update_column(:landing_page, url)
                  end
                end
              rescue StandardError
              end
              return ::Ahoy::Event.new # sentinel; callers don't rely on the instance
            end
          end
        end
      end
    rescue StandardError
      # never block tracking
    end

    result = super(data)

    # Extract properties (data is already indifferent access)
    props = data[:properties].to_h.with_indifferent_access
    raw_size = props[:screen_size]

    event = result.is_a?(::Ahoy::Event) ? result : nil

    # Primary: set bucket from UA like Plausible
    ua_bucket = begin
      v = event&.visit
      AhoyAnalytics::DeviceBucket.classify(v&.user_agent.to_s)
    rescue StandardError
      nil
    end

    updated = false
    if ua_bucket.present? && event&.visit && event.visit.screen_size.blank?
      event.visit.update_column(:screen_size, ua_bucket)
      updated = true
    end

    # Secondary fallback: derive from viewport string (WxH) if UA failed
    unless updated
      token = data[:visit_token]
      fallback_bucket = AhoyAnalytics::DeviceBucket.classify_from_viewport(raw_size)
      if fallback_bucket.present?
        if event&.visit && event.visit.screen_size.blank?
          event.visit.update_column(:screen_size, fallback_bucket)
          updated = true
        elsif token.present?
          if (v = ::Ahoy::Visit.find_by(visit_token: token)) && v.screen_size.blank?
            v.update_column(:screen_size, fallback_bucket)
            updated = true
          end
        end
      end
    end

    # Correct landing_page when a visit is implicitly created with the API path
    # (e.g., "/ahoy/events" or "/ahoy/visits"). Prefer the event's page URL.
    begin
      # Prefer URL from the persisted event; fall back to the raw payload when
      # Ahoy returns something other than the event instance (varies by version).
      event_props = event&.properties.to_h.with_indifferent_access
      data_props = data[:properties].to_h.with_indifferent_access
      url = event_props[:url] || data_props[:url]

      # Find the visit either from the event association or via visit_token
      visit = event&.visit
      if visit.nil?
        token = data[:visit_token]
        visit = ::Ahoy::Visit.find_by(visit_token: token) if token.present?
      end

      if visit && url.present?
        lp = visit.landing_page.to_s
        needs_fix = lp.blank?
        unless needs_fix
          begin
            path = URI.parse(lp).path
          rescue URI::InvalidURIError
            path = lp.to_s
          end
          needs_fix ||= internal_path?(path)
          # If landing_page is root ('/') but the first pageview we see points
          # to a non-root path, treat that as the true entry page (Plausible-like).
          if !needs_fix && path.to_s == "/"
            begin
              url_path = URI.parse(url).path
            rescue URI::InvalidURIError
              url_path = url.to_s
            end
            needs_fix ||= url_path.present? && url_path != "/"
          end
        end
        visit.update_column(:landing_page, url) if needs_fix
        # Also clear self-referrals if referring_domain matches the site host derived from URL
        begin
          url_host = URI.parse(url).host
          if url_host.present? && same_site_host?(visit.referring_domain, url_host)
            visit.update_columns(referrer: nil, referring_domain: nil)
          end
        rescue URI::InvalidURIError
          # ignore
        end
      end
    rescue StandardError
      # Never block ingestion due to correction failures
    end

    # Fallback geo enrichment: if visit has no coordinates yet, attempt a one-time lookup
    begin
      if req
        visit = event&.visit
        if visit && visit.latitude.blank? && visit.longitude.blank?
          candidates = []
          %w[HTTP_CF_CONNECTING_IP HTTP_TRUE_CLIENT_IP HTTP_X_REAL_IP].each do |h|
            v = req.get_header(h)
            candidates << v if v.present?
          end
          xff = req.get_header("HTTP_X_FORWARDED_FOR").to_s
          candidates.concat(xff.split(",").map(&:strip)) if xff.present?
          candidates << req.get_header("REMOTE_ADDR")
          candidates << (req.ip rescue nil)
          candidates << (req.remote_ip rescue nil)
          candidates = candidates.compact.uniq

          if defined?(AhoyAnalytics::MaxmindGeo)
            client_ip = candidates.find { |ip| AhoyAnalytics::MaxmindGeo.valid_ip?(ip) }
            if client_ip.nil? && xff.present?
              xff.split(",").map(&:strip).reverse_each do |ip|
                if AhoyAnalytics::MaxmindGeo.valid_ip?(ip)
                  client_ip = ip
                  break
                end
              end
            end

            if client_ip && (geo = AhoyAnalytics::MaxmindGeo.lookup(client_ip))
              visit.update_columns(
                country:   visit.country.presence   || geo[:country_iso],
                region:    visit.region.presence    || geo[:subdivisions]&.first,
                city:      visit.city.presence      || geo[:city],
                latitude:  visit.latitude.presence  || geo[:latitude],
                longitude: visit.longitude.presence || geo[:longitude]
              )
            end
          end

          # Country-only fallback via Cloudflare header
          begin
            if visit.country.blank?
              cc = req.get_header("HTTP_CF_IPCOUNTRY").to_s.upcase.presence
              visit.update_column(:country, cc) if cc
            end
          rescue StandardError
          end
        end
      end
    rescue StandardError
      # Never block ingestion on geo failures
    end

    result
  end

  private
    # Detect internal/system paths that should never be used as landing pages
    def internal_path?(value)
      return false if value.blank?
      path = begin
        URI.parse(value).path
      rescue URI::InvalidURIError
        value.to_s
      end.to_s
      path.start_with?("/ahoy", "/cable", "/rails/", "/assets/", "/up", "/jobs", "/webhooks")
    end

    # Compare hostnames for self-referral cleanup (case-insensitive, ignoring www.)
    def same_site_host?(ref_host, site_host)
      return false if ref_host.to_s.strip.empty? || site_host.to_s.strip.empty?
      a = ref_host.to_s.downcase.sub(/^www\./, "")
      b = site_host.to_s.downcase.sub(/^www\./, "")
      a == b
    end

    def local_host?(host)
      h = host.to_s.downcase
      return true if h == "localhost"
      begin
        ip = IPAddr.new(h) rescue nil
        return true if ip && (ip.loopback? || ip.to_s == "0.0.0.0" || ip.to_s == "::1")
      rescue StandardError
      end
      false
    end

    # Extract major.minor version only (Plausible-style)
    # "120.0.6099.109" -> "120.0"
    # "10.15.7" -> "10.15"
    # "17" -> "17"
    def major_minor_version(version_string)
      return "" if version_string.blank?
      parts = version_string.to_s.split(".")
      parts.take(2).join(".")
    end
end
