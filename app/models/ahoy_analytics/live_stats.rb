# frozen_string_literal: true

module AhoyAnalytics
  class LiveStats
    LIVE_WINDOW = 5.minutes

    def self.build(now: Time.zone.now)
      new(now).build
    end

    def initialize(now)
      @now = now
    end

    def build
      today_range = today
      yesterday_range = yesterday

      current_visitors = Ahoy::Visit.live_visitors_count

      today_sessions = Ahoy::Visit.where(started_at: today_range).count
      yesterday_sessions = Ahoy::Visit.where(started_at: yesterday_range).count

      today_visitors = Ahoy::Visit.where(started_at: today_range).distinct.count(:visitor_token)
      yesterday_visitors = Ahoy::Visit.where(started_at: yesterday_range).distinct.count(:visitor_token)

      today_pageviews = Ahoy::Event.where(name: "pageview", time: today_range).count
      yesterday_pageviews = Ahoy::Event.where(name: "pageview", time: yesterday_range).count

      buckets = 1.hour
      session_spark = Ahoy::Visit.sparkline_today_vs_yesterday(bucket: buckets, now: now, yesterday_full_day: true)
      pageview_spark = sparkline_events_today_vs_yesterday(bucket: buckets, now: now, yesterday_full_day: true)

      {
        currentVisitors: current_visitors,
        todayVisitors: {
          count: today_visitors,
          change: pct_change(yesterday_visitors, today_visitors)
        },
        todaySessions: {
          count: today_sessions,
          change: pct_change(yesterday_sessions, today_sessions),
          sparkline: session_spark
        },
        todayPageviews: {
          count: today_pageviews,
          change: pct_change(yesterday_pageviews, today_pageviews),
          sparkline: pageview_spark
        },
        sessionsByLocation: sessions_by_location(today_range),
        visitorDots: visitor_dots
      }
    end

    private

      attr_reader :now

      def today
        now.beginning_of_day..now
      end

      def yesterday
        (today.begin - 1.day)..today.begin
      end

      def sessions_by_location(range)
        Ahoy::Visit
          .where(started_at: range)
          .group(:country, :region, :city)
          .order(Arel.sql("COUNT(*) DESC"))
          .limit(5)
          .count
          .map do |(country, region, city), count|
            {
              country: country.to_s,
              region: region.to_s.presence,
              city: city.to_s.presence,
              countryCode: country.to_s,
              visitors: count
            }
          end
      end

      def visitor_dots
        Ahoy::Visit.live_dots(limit: 200, window: LIVE_WINDOW, now: now).sort_by { |dot| -dot[:ts].to_i }
      end

      def sparkline_events_today_vs_yesterday(bucket:, now:, yesterday_full_day: true)
        current_time = now || Time.zone.now
        start_today = current_time.beginning_of_day
        bucket_seconds = bucket.to_i
        bucket_count_today = (((current_time - start_today) / bucket).floor + 1)
          .clamp(1, 24 * 60 * 60 / bucket_seconds)
        full_day_buckets = (24 * 60 * 60) / bucket_seconds
        bucket_count_yday = yesterday_full_day ? full_day_buckets : bucket_count_today

        today_series = event_series_counts(
          start_at: start_today,
          buckets: bucket_count_today,
          bucket_seconds: bucket_seconds
        )

        yesterday_series = event_series_counts(
          start_at: start_today - 1.day,
          buckets: bucket_count_yday,
          bucket_seconds: bucket_seconds
        )

        { today: today_series, yesterday: yesterday_series }
      end

      def event_series_counts(start_at:, buckets:, bucket_seconds:)
        finish = start_at + (buckets - 1) * bucket_seconds
        sec = bucket_seconds.to_i
        sec = 1 if sec <= 0
        sec = 86_400 if sec > 86_400
        start_ts = ActiveRecord::Base.connection.quote("#{start_at.utc.strftime('%Y-%m-%d %H:%M:%S')}+00")
        finish_ts = ActiveRecord::Base.connection.quote("#{finish.utc.strftime('%Y-%m-%d %H:%M:%S')}+00")
        sql = <<~SQL.squish
          WITH series AS (
            SELECT generate_series(
              TIMESTAMPTZ #{start_ts},
              TIMESTAMPTZ #{finish_ts},
              INTERVAL '#{sec} seconds'
            ) AS bucket
          )
          SELECT
            s.bucket AS bucket,
            COUNT(e.id) AS value
          FROM series s
          LEFT JOIN ahoy_events e
            ON e.time >= s.bucket
           AND e.time < s.bucket + INTERVAL '#{sec} seconds'
           AND e.name = 'pageview'
          GROUP BY s.bucket
          ORDER BY s.bucket ASC
        SQL

        rows = ActiveRecord::Base.connection.exec_query(sql)
        rows.rows.map { |(_, value)| value.to_i }
      end

      def pct_change(previous, current)
        previous = previous.to_f
        current = current.to_f
        return 0 if previous <= 0

        (((current - previous) / previous) * 100).round
      end
  end
end
