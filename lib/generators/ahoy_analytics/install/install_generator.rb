# frozen_string_literal: true

module AhoyAnalytics
  module Generators
    class InstallGenerator < Rails::Generators::Base
      source_root File.expand_path("templates", __dir__)

      class_option :path, type: :string, default: "/admin/analytics", desc: "Mount path for AhoyAnalytics"
      class_option :ahoy_path, type: :string, default: "/ahoy", desc: "Mount path for Ahoy"
      class_option :cable_path, type: :string, default: "/cable", desc: "Action Cable mount path"

      def add_routes
        add_route("mount AhoyAnalytics::Engine => #{normalized_path(options[:path]).inspect}", "AhoyAnalytics::Engine")
        add_route("mount ActionCable.server => #{normalized_path(options[:cable_path]).inspect}", "ActionCable.server")
      end

      def copy_initializer
        @mount_path = normalized_path(options[:path])
        @ahoy_path = normalized_path(options[:ahoy_path])
        @cable_path = normalized_path(options[:cable_path])
        template "initializer.rb", "config/initializers/ahoy_analytics.rb"
      end

      def insert_tracking_tag
        layout_path = "app/views/layouts/application.html.erb"
        return unless File.exist?(layout_path)

        layout = File.read(layout_path)
        return if layout.include?("ahoy_analytics_tracking_tag")

        inject_into_file layout_path, "\n    <%= ahoy_analytics_tracking_tag %>\n", before: "</head>"
      end

      def install_migrations
        rake "railties:install:migrations FROM=ahoy_analytics"
      end

      private

        def add_route(route_line, guard_text)
          routes_path = "config/routes.rb"
          return unless File.exist?(routes_path)
          return if File.read(routes_path).include?(guard_text)

          route(route_line)
        end

        def normalized_path(path)
          value = path.to_s.strip
          value = "/#{value}" unless value.start_with?("/")
          value.gsub(%r{/+$}, "")
        end
    end
  end
end
