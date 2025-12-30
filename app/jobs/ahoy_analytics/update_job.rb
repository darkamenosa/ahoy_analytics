# frozen_string_literal: true

module AhoyAnalytics
  class UpdateJob < ApplicationJob
    queue_as :default

    def perform
      payload = AhoyAnalytics::LiveStats.build(now: Time.zone.now)
      ActionCable.server.broadcast(AhoyAnalytics.config.cable_stream, payload)
    end
  end
end
