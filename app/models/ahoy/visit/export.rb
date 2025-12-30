require "csv"

module Ahoy::Visit::Export
  extend ActiveSupport::Concern

  class_methods do
    def csv_export(range, filters)
      visits = Ahoy::Visit.scoped_visits(range, filters)
      data = visits.group(Arel.sql("COALESCE(referring_domain, 'Direct / None')")).count
      CSV.generate do |csv|
        csv << %w[name visitors]
        data.sort_by { |_, v| -v }.each do |(name, v)|
          csv << [ csv_safe_value(name), v ]
        end
      end
    end

    def csv_safe_value(value)
      str = value.to_s
      str = "'#{str}" if str.match?(/\A[=+\-@]/)
      str
    end
  end
end
