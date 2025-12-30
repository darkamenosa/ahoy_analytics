# frozen_string_literal: true

module AhoyAnalytics
  class LocationsController < AhoyAnalytics::BaseController
    def index
      limit, page = parsed_pagination
      search = normalized_search
      payload = cache_for([ :locations_v2, @query[:mode], limit, page, search, params[:order_by] ]) do
        locations_payload(@query, limit:, page:, search:)
      end
      render json: camelize_keys(payload)
    end
  end
end
