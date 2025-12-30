# frozen_string_literal: true

# MaxMind GeoLite2 City integration (attribution handled in the admin UI)
# Defaults to db/geo/GeoLite2-City.mmdb unless MAXMIND_DB_PATH is provided

require "maxminddb"
require "ipaddr"

module AhoyAnalytics
  DEFAULT_DB_RELATIVE_PATH = "db/geo/GeoLite2-City.mmdb"

  module MaxmindGeo
    extend self

    def reader
      path = database_path
      # Reuse the reader if we already opened this exact path
      if defined?(@reader) && @reader && @reader_path == path
        return @reader
      end

      @reader&.close if defined?(@reader) && @reader.respond_to?(:close)
      @reader = (path && File.exist?(path)) ? MaxMindDB.new(path.to_s) : nil
      @reader_path = path
      @reader
    rescue StandardError => e
      Rails.logger.warn("[AhoyAnalytics::MaxmindGeo] failed to open DB: #{e.class}: #{e.message}") if defined?(Rails)
      @reader = nil
    end

    def database_path
      env_path = ENV["MAXMIND_DB_PATH"]
      return env_path if env_path.present?

      return unless defined?(Rails) && Rails.respond_to?(:root) && Rails.root

      path = Rails.root.join(DEFAULT_DB_RELATIVE_PATH)
      path if path.exist?
    end

    def lookup(ip)
      r = reader
      return nil unless r
      return nil unless valid_ip?(ip)

      result = r.lookup(ip.to_s)
      return nil unless result&.found?

      {
        country_iso: result.country&.iso_code,
        city: result.city&.name,
        subdivisions: Array(result.subdivisions).map { |s| s.name || s.iso_code }.compact,
        latitude: result.location&.latitude,
        longitude: result.location&.longitude
      }
    rescue StandardError => e
      Rails.logger.debug("[AhoyAnalytics::MaxmindGeo] lookup failed for #{ip.inspect}: #{e.class}: #{e.message}") if defined?(Rails)
      nil
    end

    # Reject private, loopback, link‑local and unspecified addresses
    def valid_ip?(ip)
      ip = ip.to_s
      return false if ip.blank?
      addr = IPAddr.new(ip) rescue nil
      return false unless addr

      return false if addr.loopback? # 127.0.0.0/8, ::1
      return false if addr.private?  # 10/8, 172.16/12, 192.168/16, fc00::/7
      # Link‑local and unspecified
      return false if addr.link_local?
      return false if addr.ipv6? && (addr.to_s == "::")
      return false if addr.ipv4? && (addr.to_s == "0.0.0.0")
      true
    end
  end
end
