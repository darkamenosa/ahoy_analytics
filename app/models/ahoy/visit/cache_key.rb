module Ahoy::Visit::CacheKey
  extend ActiveSupport::Concern

  class_methods do
    def analytics_data_version
      visit_time = Ahoy::Visit.maximum(:started_at)
      event_time = Ahoy::Event.maximum(:time)
      if visit_time || event_time
        [ visit_time, event_time ].compact.map { |time| time.utc.to_f }.max
      else
        [ Ahoy::Visit.maximum(:id), Ahoy::Event.maximum(:id) ].compact.max.to_i
      end
    end
  end
end
