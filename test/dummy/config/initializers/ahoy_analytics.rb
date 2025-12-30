# frozen_string_literal: true

AhoyAnalytics.configure do |config|
  config.use_vite_dev_server = Rails.env.development?
end
