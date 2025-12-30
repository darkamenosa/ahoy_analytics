# frozen_string_literal: true

module AhoyAnalytics
  class ExportController < AhoyAnalytics::BaseController
    def show
      range, = Ahoy::Visit.range_and_interval_for(@query[:period], nil, @query)
      filters = @query[:filters] || {}
      csv = Ahoy::Visit.csv_export(range, filters)
      send_data(csv, filename: "analytics-export.csv", type: "text/csv")
    end
  end
end
