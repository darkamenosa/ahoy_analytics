module AhoyAnalytics
  module ApplicationHelper
    def ahoy_analytics_base_path
      request&.script_name.presence || AhoyAnalytics.config.mount_path.to_s
    end

    def ahoy_analytics_head_tags(entrypoint)
      # In dev mode with Vite, only include the client tag
      # CSS is imported by JS files and handled by Vite automatically
      return vite_client_tag if use_vite_dev_server?

      entry = ahoy_analytics_manifest.entry(entrypoint)
      css = Array(entry["css"])
      return nil if css.empty?

      safe_join(css.map { |path| stylesheet_link_tag(ahoy_analytics_asset_path(path), media: "all") })
    end

    def ahoy_analytics_body_tags(entrypoint)
      return vite_javascript_tag(entrypoint) if use_vite_dev_server?

      entry = ahoy_analytics_manifest.entry(entrypoint)
      javascript_include_tag(
        ahoy_analytics_asset_path(entry.fetch("file")),
        type: "module",
        defer: true,
        crossorigin: "anonymous"
      )
    end

    def ahoy_analytics_tracking_tag
      config = tracking_config
      config_json = json_escape(config.to_json)
      safe_join([
        javascript_tag("window.analyticsConfig = #{config_json};"),
        ahoy_analytics_body_tags("analytics-tracker")
      ])
    end

    def ahoy_analytics_window_config_tag
      config_json = json_escape(ahoy_analytics_window_config.to_json)
      javascript_tag("window.AhoyAnalytics = #{config_json};")
    end

    private

      def ahoy_analytics_manifest
        @ahoy_analytics_manifest ||= AhoyAnalytics::AssetManifest.new(
          path: AhoyAnalytics::Engine.root.join("app/assets/ahoy_analytics/build/.vite/manifest.json")
        )
      end

      def ahoy_analytics_asset_path(path)
        cleaned = path.to_s.sub(/\A\//, "")
        cleaned = cleaned.sub(/\Aassets\//, "")
        ahoy_analytics.engine_asset_path(path: cleaned)
      end

      def tracking_config
        ahoy_path = AhoyAnalytics.config.ahoy_path.to_s
        ahoy_path = "/#{ahoy_path}" unless ahoy_path.start_with?("/")
        exclude_paths = Array(AhoyAnalytics.config.tracking_exclude_paths)
        exclude_paths << AhoyAnalytics.config.mount_path if AhoyAnalytics.config.mount_path.present?
        exclude_paths = exclude_paths.compact.uniq

        base = {
          eventsEndpoint: "#{ahoy_path}/events",
          visitsEndpoint: "#{ahoy_path}/visits",
          excludePaths: exclude_paths,
          hashBasedRouting: AhoyAnalytics.config.tracking_hash_based_routing,
          debug: AhoyAnalytics.config.tracking_debug
        }

        include_paths = Array(AhoyAnalytics.config.tracking_include_paths).reject(&:blank?)
        base[:includePaths] = include_paths if include_paths.any?

        base.merge(AhoyAnalytics.config.tracking_options.to_h)
      end

      def ahoy_analytics_window_config
        {
          basePath: ahoy_analytics_base_path,
          cablePath: AhoyAnalytics.config.cable_path,
          geocodeEmail: AhoyAnalytics.config.geocode_email
        }.compact
      end

      def use_vite_dev_server?
        return false unless AhoyAnalytics.config.use_vite_dev_server

        respond_to?(:vite_client_tag) &&
          respond_to?(:vite_stylesheet_tag) &&
          respond_to?(:vite_javascript_tag)
      end
  end
end
