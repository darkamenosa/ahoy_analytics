# frozen_string_literal: true

module AhoyAnalytics
  class LiveController < AhoyAnalytics::ApplicationController
    def show
      render inertia: "admin/analytics/live", props: { initialStats: AhoyAnalytics::LiveStats.build(now: Time.zone.now) }
    end
  end
end
