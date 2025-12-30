module AhoyAnalytics
  class ApplicationController < ActionController::Base
    include InertiaRails::Controller
    include AhoyAnalytics::SetCurrentRequest

    layout "ahoy_analytics/application"
  end
end
