# frozen_string_literal: true

module AhoyAnalytics
  class MainGraphController < AhoyAnalytics::BaseController
    def show
      payload = cache_for([ :main_graph, @query[:metric], @query[:interval] ]) { main_graph_payload(@query) }
      render json: camelize_keys(payload)
    end
  end
end
