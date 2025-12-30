# frozen_string_literal: true

module AhoyAnalytics
  module SetCurrentRequest
    extend ActiveSupport::Concern

    included do
      before_action do
        AhoyAnalytics::Current.request = request
      end
    end

    def default_url_options
      { host: AhoyAnalytics::Current.request_host, protocol: AhoyAnalytics::Current.request_protocol }.compact_blank
    end
  end
end
