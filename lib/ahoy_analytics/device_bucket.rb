module AhoyAnalytics
  module DeviceBucket
    # Map user agent device types to Plausible-like buckets
    # Using device_detector's device_type values
    MOBILE_TYPES = %w[smartphone feature\ phone portable\ media\ player phablet wearable camera].freeze
    TABLET_TYPES = %w[tablet car\ browser].freeze
    DESKTOP_TYPES = %w[desktop tv console].freeze

    module_function

    def classify(user_agent)
      return nil if user_agent.to_s.strip.empty?
      type = begin
        dd = DeviceDetector.new(user_agent.to_s)
        dd.device_type.to_s.downcase
      rescue StandardError
        ""
      end

      return "Mobile"  if MOBILE_TYPES.include?(type)
      return "Tablet"  if TABLET_TYPES.include?(type)
      return "Desktop" if DESKTOP_TYPES.include?(type)

      nil
    end

    # Fallback categorization from viewport width to bucket using Plausible's historic thresholds
    # <576 => Mobile, <992 => Tablet, <1440 => Laptop, else Desktop
    # We return only Mobile/Tablet/Desktop to align with current Plausible ingestion.
    def classify_from_viewport(size_string)
      return nil unless size_string.to_s =~ /^(\d+)x(\d+)$/
      width = Regexp.last_match(1).to_i
      return "Mobile"  if width < 576
      return "Tablet"  if width < 992
      # Historically this range was "Laptop"; normalize to Desktop for parity
      "Desktop"
    end
  end
end
