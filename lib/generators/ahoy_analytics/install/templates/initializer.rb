AhoyAnalytics.configure do |config|
  config.mount_path = "<%= @mount_path %>"
  config.ahoy_path = "<%= @ahoy_path %>"
  config.cable_path = "<%= @cable_path %>"
  config.cable_stream = "ahoy_analytics"
  # Optional: enable Vite dev server for engine UI while developing locally.
  # config.use_vite_dev_server = Rails.env.development?
  config.use_vite_dev_server = false

  config.tracking_exclude_paths = [
    "/admin",
    "/.well-known",
    config.ahoy_path,
    config.cable_path,
    config.mount_path
  ].compact.uniq

  # Optional: supply a contact email for geocoding requests (OpenStreetMap Nominatim).
  config.geocode_email = ENV["AHOY_ANALYTICS_GEOCODE_EMAIL"]
  # Optional: point to GeoLite2-City.mmdb for server-side GeoIP.
  # ENV["MAXMIND_DB_PATH"] = Rails.root.join("db/geo/GeoLite2-City.mmdb").to_s

  # Optional: provide current user info for the UI header.
  # config.user_context = -> { { role: "admin", email: current_user&.email.to_s } }

  # Optional: tweak site capabilities shown in the UI.
  # config.site_context = -> { { has_goals: false, has_props: true } }
end
