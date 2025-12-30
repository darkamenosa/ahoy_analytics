# frozen_string_literal: true

require "digest"
require "cgi"
require "set"

module AhoyAnalytics
  # Holds shared analytics querying logic so subcontrollers stay thin.
  # Intentionally kept in controllers per team preference (not extracted to models/services).
  class BaseController < AhoyAnalytics::ApplicationController
      before_action :prepare_query

      private
        DEFAULT_LIMIT = 100
        MAX_LIMIT = 500
        MAX_SEARCH_LEN = 100
        ALLOWED_PERIODS = %w[realtime day 7d 28d 30d 91d month 6mo 12mo year all custom].freeze

        # Pagination and search helpers
        def parsed_pagination
          lim = params[:limit].to_i
          pg = params[:page].to_i
          lim = DEFAULT_LIMIT if lim <= 0 || lim > MAX_LIMIT
          pg = 1 if pg <= 0
          [ lim, pg ]
        end

        def normalized_search
          term = params[:search].to_s
          s = term.strip
          s = s[0, MAX_SEARCH_LEN]
          s.empty? ? nil : s
        end

        # Parse order_by using model's whitelist/normalization
        def parsed_order_by
          Ahoy::Visit.parsed_order_by(params[:order_by])
        end

        def initial_props(query)
          # Align initial Sources payload mode with URL-applied filters so SSR and hydration match.
          sources_mode = query[:mode]
          if sources_mode.blank?
            filters = query[:filters] || {}
            if filters["channel"].present?
              sources_mode = "channels"
            elsif filters["utm_medium"].present?
              sources_mode = "utm-medium"
            elsif filters["utm_source"].present?
              sources_mode = "utm-source"
            elsif filters["utm_campaign"].present?
              sources_mode = "utm-campaign"
            elsif filters["utm_content"].present?
              sources_mode = "utm-content"
            elsif filters["utm_term"].present?
              sources_mode = "utm-term"
            else
              sources_mode = "all"
            end
          end
          {
            site: camelize_keys(site_context),
            user: camelize_keys(user_context),
            query: camelize_keys(query),
            topStats: camelize_keys(top_stats_payload(query)),
            mainGraph: camelize_keys(main_graph_payload(query)),
            sources: camelize_keys(sources_payload(query.merge(mode: sources_mode))),
            pages: camelize_keys(pages_payload(query)),
            locations: camelize_keys(locations_payload(query)),
            devices: camelize_keys(devices_payload(query)),
            behaviors: camelize_keys(behaviors_payload(query))
          }
        end

        def prepare_query
          @query = default_query.merge(prepared_params(params))
        end

        def prepared_params(raw_params)
          labels = parse_labels_from_params
          filters, advanced_filters = parse_filters_from_params(raw_params)
          # Map numeric city id -> label if available (compat with Plausible URLs)
          if (city = filters["city"]).present? && city =~ /^\d+$/ && labels[city].present?
            filters["city"] = labels[city]
            labels["city"] = labels[city]
            labels.delete(city) # drop numeric key to avoid duplicating l= entries on FE
          end

          # Accept ISO 3166-2 region codes (e.g., "US-CA"). If a label is provided via l=region,<name>,
          # use it. Otherwise, attempt to resolve via ISO3166 subdivisions using either the code prefix
          # (before '-') or filters["country"].
          if (region_code = filters["region"]).present? && region_code =~ /^[A-Za-z]{2}-[A-Za-z0-9]{1,3}$/
            if labels["region"].present?
              filters["region"] = labels["region"]
            else
              cc_from_code = region_code.split("-", 2).first.upcase
              cc = (filters["country"].presence || cc_from_code).to_s.upcase
              if (country = ISO3166::Country.new(cc))
                if (sub = country.subdivisions[region_code])
                  filters["region"] = sub["name"]
                  labels["region"] = sub["name"]
                end
              end
            end
          end

          per = raw_params[:period]
          per = "day" unless ALLOWED_PERIODS.include?(per.to_s)

          {
            period: per,
            comparison: (raw_params[:comparison].to_s == "off" ? nil : raw_params[:comparison]),
            match_day_of_week: ActiveModel::Type::Boolean.new.cast(raw_params[:match_day_of_week]),
            date: raw_params[:date],
            from: raw_params[:from],
            to: raw_params[:to],
            metric: raw_params[:metric],
            interval: raw_params[:interval],
            mode: raw_params[:mode],
            funnel: raw_params[:funnel],
            dialog: raw_params[:dialog],
            with_imported: ActiveModel::Type::Boolean.new.cast(raw_params[:with_imported]),
            filters: filters,
            labels: labels,
            advanced_filters: advanced_filters
          }.compact
        end

        # Parse filters from Plausible-style URL params: multiple f entries: f=op,dimension,clause1[,clause2]
        # We currently map only simple equality (op == 'is') into a flat hash { dimension => clause }
        # Labels (l=dimension,label) are URL-only; not needed server-side.
        def parse_filters_from_params(raw_params)
          # Collect duplicates reliably from the raw query string
          cgi_map = CGI.parse(request.query_string.to_s)
          list = Array(cgi_map["f"]) # e.g., ["is,country,US", "is,region,New York"]
          # Fallback: include single :f if present in params
          f = raw_params[:f]
          list |= Array(f).compact if f.present?
          return [ {}, [] ] if list.empty?

          filters = {}
          advanced = []
          list.each do |token|
            parts = token.to_s.split(",")
            next if parts.length < 3
            op = parts[0].to_s
            dim = parts[1].to_s
            clause = parts[2].to_s
            next if dim.blank? || clause.blank?
            if op == "is"
              # Normalize Plausible-style dimensions we support plus goal
              if dim == "event:goal" || dim == "goal"
                filters["goal"] = clause
              else
                filters[dim] = clause
              end
            elsif [ "is_not", "contains" ].include?(op)
              advanced << [ op, dim, clause ]
            end
          end
          [ filters, advanced ]
        end

        # Parse labels from repeated l=dimension,label tokens in the query string.
        # For cities Plausible uses numeric ids as clauses; the label provides the human name.
        def parse_labels_from_params
          cgi_map = CGI.parse(request.query_string.to_s)
          list = Array(cgi_map["l"]) # e.g., ["country,United States", "2988507,Paris"]
          labels = {}
          list.each do |token|
            key, value = token.to_s.split(",", 2)
            next if key.blank? || value.blank?
            labels[key] = value
          end
          labels
        end

        # normalized_filter removed; implemented in Ahoy::Visit::Filters

        def default_query
          {
            period: "day",
            comparison: nil,
            match_day_of_week: true,
            filters: {},
            labels: {},
            with_imported: false
          }
        end

        def site_context
          defaults = {
            domain: request.host,
            timezone: Time.zone.name,
            has_goals: false,
            has_props: true,
            funnels_available: true,
            props_available: true,
            segments: SEGMENTS,
            flags: {
              dbip: true
            }
          }

          override = AhoyAnalytics.config.site_context
          return defaults unless override

          value = instance_exec(&override)
          value.is_a?(Hash) ? defaults.merge(value) : defaults
        end

        def user_context
          defaults = { role: "viewer", email: "unknown" }
          override = AhoyAnalytics.config.user_context
          return defaults unless override

          value = instance_exec(&override)
          value.is_a?(Hash) ? defaults.merge(value) : defaults
        end

        def devices_payload(query, limit: nil, page: nil, search: nil)
          Ahoy::Visit.devices_payload(query, limit: limit, page: page, search: search, order_by: parsed_order_by)
        end

        def behaviors_payload(query, limit: nil, page: nil, search: nil)
          Ahoy::Visit.behaviors_payload(query, limit: limit, page: page, search: search, order_by: parsed_order_by)
        end

        def sources_payload(query, limit: nil, page: nil, search: nil)
          Ahoy::Visit.sources_payload(query, limit: limit, page: page, search: search, order_by: parsed_order_by)
        end

        def pages_payload(query, limit: nil, page: nil, search: nil)
          Ahoy::Visit.pages_payload(query, limit: limit, page: page, search: search, order_by: parsed_order_by)
        end

        def locations_payload(query, limit: nil, page: nil, search: nil)
          Ahoy::Visit.locations_payload(query, limit: limit, page: page, search: search, order_by: parsed_order_by)
        end

        def main_graph_payload(query)
          Ahoy::Visit.main_graph_payload(query)
        end

        def top_stats_payload(query)
          Ahoy::Visit.top_stats_payload(query)
        end

        def search_terms_payload(query, limit:, page:, search: nil)
          Ahoy::Visit.search_terms_payload(query, limit: limit, page: page, search: search, order_by: parsed_order_by)
        end

        def referrers_payload(query, source, limit: nil, page: nil, search: nil)
          Ahoy::Visit.referrers_payload(query, source, limit: limit, page: page, search: search, order_by: parsed_order_by)
        end

        # --- Query helpers ---
        def cache_for(key)
          digest = Digest::SHA256.hexdigest(JSON.dump([ key, @query, Ahoy::Visit.analytics_data_version ]))
          Rails.cache.fetch([ :analytics, action_name, digest ], expires_in: 5.minutes) { yield }
        end

        def camelize_keys(value)
          case value
          when Array
            value.map { |item| camelize_keys(item) }
          when Hash
            value.each_with_object({}) do |(key, val), memo|
              memo[key.to_s.camelize(:lower)] = camelize_keys(val)
            end
          else
            value
          end
        end

        # Return a standard reason when imported data is requested but unsupported
        def skip_imported_reason
          @query[:with_imported] ? "not_supported" : nil
        end

        SEGMENTS = [
          { id: "all", name: "All visitors" }
        ].freeze
  end
end
