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

      def configure_live_updates
        recurring_path = "config/recurring.yml"
        unless File.exist?(recurring_path)
          say_status(:info, "config/recurring.yml not found. Configure AhoyAnalytics::UpdateJob schedule manually if you want live updates.", :yellow)
          return
        end

        added = insert_recurring_jobs(recurring_path)
        if added
          say_status(:insert, recurring_path, :green)
        else
          say_status(:identical, recurring_path, :blue)
        end
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

        def insert_recurring_jobs(path)
          require "yaml"

          contents = File.read(path)
          config = YAML.safe_load(contents, permitted_classes: [Symbol]) || {}

          added = false
          %w[development production].each do |env|
            config[env] ||= {}
            unless config[env].key?("ahoy_analytics_live_updates")
              # Create a new hash instance for each env to avoid YAML anchors/aliases
              config[env]["ahoy_analytics_live_updates"] = {
                "class" => "AhoyAnalytics::UpdateJob",
                "queue" => "default",
                "schedule" => "every 30 seconds"
              }
              added = true
            end
          end

          return false unless added

          # Preserve comments at the top of the file
          comment_lines = []
          contents.each_line do |line|
            break unless line.start_with?("#") || line.strip.empty?
            comment_lines << line
          end

          new_contents = comment_lines.join
          new_contents += "\n" if comment_lines.any? && !comment_lines.last.end_with?("\n\n")

          yaml_output = YAML.dump(config).sub(/\A---\n/, "")
          # Add blank line between top-level keys (environments)
          yaml_output = yaml_output.gsub(/^(\S+:)/) { |match| "\n#{match}" }.sub(/\A\n/, "")
          new_contents += yaml_output

          File.write(path, new_contents)
          true
        end
    end
  end
end
