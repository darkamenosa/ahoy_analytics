module Ahoy::Visit::Imports
  extend ActiveSupport::Concern

  class_methods do
    def imported_pages_aggregates(range)
      rows = AhoyAnalytics::ImportedPage.where(date: range).group(:page)
        .pluck(:page, Arel.sql("SUM(visitors), SUM(pageviews)"))
      rows.each_with_object({}) do |(page, visitors, pageviews), h|
        name = page.to_s.presence || "(unknown)"
        h[name] = { visitors: visitors.to_i, pageviews: pageviews.to_i }
      end
    end

    def imported_entry_aggregates(range)
      rows = AhoyAnalytics::ImportedEntryPage.where(date: range).group(:entry_page)
        .pluck(:entry_page, Arel.sql("SUM(visitors), SUM(entrances)"))
      rows.each_with_object({}) do |(page, visitors, entrances), h|
        name = page.to_s.presence || "(unknown)"
        h[name] = { visitors: visitors.to_i, entrances: entrances.to_i }
      end
    end

    def imported_exit_aggregates(range)
      rows = AhoyAnalytics::ImportedExitPage.where(date: range).group(:exit_page)
        .pluck(:exit_page, Arel.sql("SUM(visitors), SUM(exits), SUM(pageviews)"))
      rows.each_with_object({}) do |(page, visitors, exits, pageviews), h|
        name = page.to_s.presence || "(unknown)"
        h[name] = { visitors: visitors.to_i, exits: exits.to_i, pageviews: pageviews.to_i }
      end
    end

    def skip_imported_reason(query)
      query[:with_imported] ? "not_supported" : nil
    end
  end
end
