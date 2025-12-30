# frozen_string_literal: true

module AhoyAnalytics
  class TopStatsController < AhoyAnalytics::BaseController
    def show
      cached = cache_for(:top_stats) { top_stats_payload(@query) }
      if cached[:top_stats]&.first&.dig(:name) == "Live visitors"
        cached[:top_stats][0][:value] = Ahoy::Visit.live_visitors_count
      end
      render json: camelize_keys(cached)
    end
  end
end
