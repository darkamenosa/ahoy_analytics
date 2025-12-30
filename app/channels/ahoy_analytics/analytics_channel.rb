# frozen_string_literal: true

module AhoyAnalytics
  class AnalyticsChannel < ActionCable::Channel::Base
    def subscribed
      stream_from AhoyAnalytics.config.cable_stream
    end
  end
end
