require "ahoy_analytics/version"
require "ahoy"
require "inertia_rails"
require "countries"
require "ahoy_analytics/device_bucket"
require "ahoy_analytics/asset_manifest"
require "ahoy_analytics/maxmind_geo"
require "ahoy_analytics/ahoy_store"
require "ahoy_analytics/engine"

module AhoyAnalytics
  class Configuration
    attr_accessor :mount_path
    attr_accessor :cable_path
    attr_accessor :cable_stream
    attr_accessor :ahoy_path
    attr_accessor :tracking_exclude_paths
    attr_accessor :tracking_include_paths
    attr_accessor :tracking_hash_based_routing
    attr_accessor :tracking_debug
    attr_accessor :tracking_options
    attr_accessor :use_vite_dev_server
    attr_accessor :geocode_email
    attr_accessor :user_context
    attr_accessor :site_context
    attr_accessor :gsc_configured

    def initialize
      @mount_path = nil
      @cable_path = "/cable"
      @cable_stream = "ahoy_analytics"
      @ahoy_path = "/ahoy"
      @tracking_exclude_paths = [ "/admin", "/.well-known", "/ahoy", "/cable" ]
      @tracking_include_paths = []
      @tracking_hash_based_routing = false
      @tracking_debug = false
      @tracking_options = {}
      @use_vite_dev_server = false
      @geocode_email = nil
      @user_context = nil
      @site_context = nil
      @gsc_configured = nil
    end
  end

  def self.config
    @config ||= Configuration.new
  end

  def self.configure
    yield config
  end
end
