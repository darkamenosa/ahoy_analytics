# frozen_string_literal: true

module AhoyAnalytics
  class SourcesController < AhoyAnalytics::BaseController
    def index
      limit, page = parsed_pagination
      search = normalized_search
      payload = cache_for([ :sources, @query[:mode], limit, page, search, params[:order_by] ]) do
        sources_payload(@query, limit:, page:, search:)
      end
      render json: camelize_keys(payload)
    end
  end
end
