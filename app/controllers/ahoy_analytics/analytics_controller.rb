# frozen_string_literal: true

module AhoyAnalytics
  class AnalyticsController < AhoyAnalytics::BaseController
    def show
      render inertia: "admin/analytics/show", props: initial_props(@query)
    end
  end
end
