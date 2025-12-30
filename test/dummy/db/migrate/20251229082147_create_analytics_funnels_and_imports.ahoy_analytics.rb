# This migration comes from ahoy_analytics (originally 20251012090000)
class CreateAnalyticsFunnelsAndImports < ActiveRecord::Migration[8.1]
  def change
    create_table :analytics_funnels do |t|
      t.string  :name, null: false
      t.jsonb   :steps, null: false, default: []
      t.integer :created_by_id
      t.timestamps
    end

    add_index :analytics_funnels, :name, unique: true

    create_table :analytics_settings do |t|
      t.string :key, null: false
      t.text   :value
      t.timestamps
    end
    add_index :analytics_settings, :key, unique: true

    # Imported aggregates for optional GA/CSV imports. Minimal columns to support Pages/Entry/Exit parity
    create_table :imported_pages do |t|
      t.date   :date, null: false
      t.text   :page, null: false
      t.integer :visitors, default: 0, null: false
      t.integer :pageviews, default: 0, null: false
      t.integer :bounces, default: 0, null: false
      t.bigint  :total_time_on_page, default: 0, null: false # seconds
      t.bigint  :total_time_on_page_visits, default: 0, null: false
    end
    add_index :imported_pages, [ :date, :page ]

    create_table :imported_entry_pages do |t|
      t.date   :date, null: false
      t.text   :entry_page, null: false
      t.integer :visitors, default: 0, null: false
      t.integer :entrances, default: 0, null: false
      t.integer :bounces, default: 0, null: false
      t.integer :visit_duration, default: 0, null: false # average seconds rounded
    end
    add_index :imported_entry_pages, [ :date, :entry_page ]

    create_table :imported_exit_pages do |t|
      t.date   :date, null: false
      t.text   :exit_page, null: false
      t.integer :visitors, default: 0, null: false
      t.integer :exits, default: 0, null: false
      t.integer :pageviews, default: 0, null: false
      t.integer :bounces, default: 0, null: false
      t.integer :visit_duration, default: 0, null: false # average seconds rounded
    end
    add_index :imported_exit_pages, [ :date, :exit_page ]
  end
end
