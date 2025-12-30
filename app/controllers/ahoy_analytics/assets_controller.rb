# frozen_string_literal: true

module AhoyAnalytics
  class AssetsController < ActionController::Base
    # Assets are static and safe to serve without CSRF checks.
    skip_forgery_protection

    def show
      build_root = AhoyAnalytics::Engine.root.join("app/assets/ahoy_analytics/build")
      images_root = AhoyAnalytics::Engine.root.join("app/assets/ahoy_analytics/images")
      requested = params[:path].to_s
      return head :not_found if requested.blank?

      # Rails routes glob without extension; add it back from the format
      if (fmt = params[:format].presence)
        requested = "#{requested}.#{fmt}" unless requested.end_with?(".#{fmt}")
      end

      candidate = safe_path(build_root, requested)
      return head :not_found if candidate.nil?

      if !candidate.file? && !requested.start_with?("assets/")
        alt = safe_path(build_root, File.join("assets", requested))
        candidate = alt if alt&.file?
      end

      if !candidate.file?
        candidate = safe_path(images_root, requested)
      end

      return head :not_found unless candidate.file?

      expires_in 1.year, public: true
      send_file candidate, type: Rack::Mime.mime_type(candidate.extname, "application/octet-stream"), disposition: "inline"
    end

    private

      def safe_path(root, requested)
        path = root.join(requested).cleanpath
        return nil unless path.to_s.start_with?(root.to_s)

        path
      end
  end
end
