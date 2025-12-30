module AhoyAnalytics
  class Engine < ::Rails::Engine
    isolate_namespace AhoyAnalytics

    config.autoload_paths << root.join("lib")
    config.eager_load_paths << root.join("lib")

    initializer "ahoy_analytics.helpers" do
      ActiveSupport.on_load(:action_view) do
        include AhoyAnalytics::ApplicationHelper
      end
    end

    initializer "ahoy_analytics.ahoy" do
      config.to_prepare do
        Ahoy.api = true
        Ahoy.cookies = :none
        Ahoy.mask_ips = true
        Ahoy.track_bots = false
        Ahoy.geocode = false
        Ahoy.visit_duration = 30.minutes
        Ahoy.quiet = false
        Ahoy.server_side_visits = :when_needed

        Ahoy.exclude_method = lambda do |controller, request|
          req = request || controller&.request
          return true if req.nil?
          path = req.path.to_s

          ahoy_path = AhoyAnalytics.config.ahoy_path.to_s
          ahoy_path = "/#{ahoy_path}" unless ahoy_path.start_with?("/")
          return false if path.start_with?(ahoy_path)

          excluded = Array(AhoyAnalytics.config.tracking_exclude_paths)
          excluded << AhoyAnalytics.config.mount_path if AhoyAnalytics.config.mount_path.present?
          excluded.compact.any? { |prefix| path.start_with?(prefix.to_s) }
        end

        if defined?(Ahoy::VisitsController)
          Ahoy::VisitsController.skip_forgery_protection
          Ahoy::VisitsController.around_action do |controller, action|
            AhoyAnalytics::Current.set(request: controller.request) { action.call }
          end
        end

        if defined?(Ahoy::EventsController)
          Ahoy::EventsController.skip_forgery_protection
          Ahoy::EventsController.around_action do |controller, action|
            AhoyAnalytics::Current.set(request: controller.request) { action.call }
          end
        end
      end
    end
  end
end
