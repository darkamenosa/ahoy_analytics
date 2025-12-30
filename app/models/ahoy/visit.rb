class Ahoy::Visit < ApplicationRecord
  self.table_name = "ahoy_visits"

  has_many :events, class_name: "Ahoy::Event"
  belongs_to :user, optional: true
  scope :with_coordinates, -> { where.not(latitude: nil, longitude: nil) }

  # Analytics concerns (move-first scaffolding; methods will be relocated verbatim)
  include Ahoy::Visit::Constants
  include Ahoy::Visit::Filters
  include Ahoy::Visit::Ranges
  include Ahoy::Visit::Series
  include Ahoy::Visit::Metrics
  include Ahoy::Visit::Sources
  include Ahoy::Visit::Pages
  include Ahoy::Visit::Locations
  include Ahoy::Visit::Devices
  include Ahoy::Visit::Ordering
  include Ahoy::Visit::Pagination
  include Ahoy::Visit::Imports
  include Ahoy::Visit::Export
  include Ahoy::Visit::CacheKey
  include Ahoy::Visit::UrlLabels

  # Calculates current live visitors based on recent activity
  # Prefers pageview events (more accurate), falls back to recent visits
  def self.live_visitors_count
    now = Time.zone.now
    recent_event_visit_ids = Ahoy::Event
      .where("time > ?", now - 5.minutes)
      .distinct
      .pluck(:visit_id)

    if recent_event_visit_ids.any?
      where(id: recent_event_visit_ids).distinct.count(:visitor_token)
    else
      where(started_at: (now - 5.minutes)..now).distinct.count(:visitor_token)
    end
  end

  def self.recent_with_coordinates(window: 5.minutes)
    now = Time.zone.now
    window_start = now - window

    scope = with_coordinates
    recent = scope.where(started_at: window_start..now)

    event_visit_ids = Ahoy::Event.where("time >= ?", window_start).pluck(:visit_id)
    if event_visit_ids.present?
      recent = recent.or(scope.where(id: event_visit_ids))
    end

    recent.distinct
  end

  def self.live_dots(limit: 200, window: 5.minutes, now: Time.zone.now)
    current_time = now || Time.zone.now
    window_start = current_time - window
    visits = recent_with_coordinates(window: window)
      .order(started_at: :desc)
      .limit(limit)

    event_times = Ahoy::Event
      .where(visit_id: visits.map(&:id))
      .where("time >= ?", window_start)
      .group(:visit_id)
      .maximum(:time)

    visits.map do |visit|
      last_activity = event_times[visit.id] || visit.started_at || current_time
      {
        lat: visit.latitude.to_f,
        lng: visit.longitude.to_f,
        city: visit.city.to_s.presence,
        type: "visitor",
        ts: (last_activity.to_f * 1000.0).to_i
      }
    end
  end

  # Return sparkline arrays for sessions today vs yesterday using time buckets
  # Example: { today: [0,2,1,...], yesterday: [1,0,3,...] }
  def self.sparkline_today_vs_yesterday(bucket: 15.minutes, now: Time.zone.now, yesterday_full_day: true)
    current_time = now || Time.zone.now
    start_today = current_time.beginning_of_day
    bucket_seconds = bucket.to_i
    # How many buckets have elapsed so far today (inclusive of current bucket)
    bucket_count_today = (((current_time - start_today) / bucket).floor + 1).clamp(1, 24 * 60 * 60 / bucket_seconds)
    full_day_buckets = (24 * 60 * 60) / bucket_seconds
    bucket_count_yday = yesterday_full_day ? full_day_buckets : bucket_count_today

    today_series = series_counts(
      table: table_name,
      column: "started_at",
      start_at: start_today,
      buckets: bucket_count_today,
      bucket_seconds: bucket_seconds
    )

    yesterday_series = series_counts(
      table: table_name,
      column: "started_at",
      start_at: start_today - 1.day,
      buckets: bucket_count_yday,
      bucket_seconds: bucket_seconds
    )

    { today: today_series, yesterday: yesterday_series }
  end

  # Internal: generic series counter used by sparkline helpers
  def self.series_counts(table:, column:, start_at:, buckets:, bucket_seconds:)
    finish = start_at + (buckets - 1) * bucket_seconds
    sec = bucket_seconds.to_i
    sec = 1 if sec <= 0
    sec = 86_400 if sec > 86_400
    start_ts = connection.quote("#{start_at.utc.strftime('%Y-%m-%d %H:%M:%S')}+00")
    finish_ts = connection.quote("#{finish.utc.strftime('%Y-%m-%d %H:%M:%S')}+00")
    tname = connection.quote_table_name(table)
    col = connection.quote_column_name(column)
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
        COUNT(t.id) AS value
      FROM series s
      LEFT JOIN #{tname} t
        ON t.#{col} >= s.bucket
       AND t.#{col} < s.bucket + INTERVAL '#{sec} seconds'
      GROUP BY s.bucket
      ORDER BY s.bucket ASC
    SQL

    rows = connection.exec_query(sql)
    rows.rows.map { |(_, value)| value.to_i }
  end
end
