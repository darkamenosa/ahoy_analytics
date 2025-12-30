# frozen_string_literal: true

module AhoyAnalytics
  class SearchTermsController < AhoyAnalytics::BaseController
    def index
      # TODO(GSC): Real Google Search Console integration. Placeholder mirrors Plausible UX signals.
      return render(json: { errorCode: "not_configured", isAdmin: true }, status: :unprocessable_entity) unless gsc_configured?
      return render(json: { errorCode: "unsupported_filters" }, status: :unprocessable_entity) if unsupported_gsc_filters?(@query)

      limit, page = parsed_pagination
      search = normalized_search
      payload = cache_for([ :search_terms, limit, page, search, params[:order_by] ]) do
        search_terms_payload(@query, limit:, page:, search:)
      end

      range, = Ahoy::Visit.range_and_interval_for(@query[:period], nil, @query)
      if payload[:results].blank? && (Time.zone.now - range.begin < 72.hours)
        return render json: { errorCode: "period_too_recent" }, status: :unprocessable_entity
      end

      render json: camelize_keys(payload)
    end

    private
      def gsc_configured?
        configured = AhoyAnalytics.config.gsc_configured
        configured = instance_exec(&configured) if configured.respond_to?(:call)
        return configured unless configured.nil?

        # Prefer DB flag when available, then Rails config, then ENV
        db = AhoyAnalytics::Setting.get_bool("gsc_configured", fallback: nil)
        return db unless db.nil?
        v = Rails.configuration.x.analytics&.gsc_configured
        v = ENV["ANALYTICS_GSC_CONFIGURED"] if v.nil?
        ActiveModel::Type::Boolean.new.cast(v)
      end

      def unsupported_gsc_filters?(query)
        filters = (query[:filters] || {}).stringify_keys
        disallowed = %w[channel referrer utm_source utm_medium utm_campaign utm_content utm_term entry_page exit_page]
        return true if filters.keys.any? { |k| disallowed.include?(k) }
        adv = Array(query[:advanced_filters])
        return true if adv.any?
        false
      end
  end
end
