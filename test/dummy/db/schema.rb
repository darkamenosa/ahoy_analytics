# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2025_12_29_082148) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "action_mailbox_inbound_emails", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "message_checksum", null: false
    t.string "message_id", null: false
    t.integer "status", default: 0, null: false
    t.datetime "updated_at", null: false
    t.index [ "message_id", "message_checksum" ], name: "index_action_mailbox_inbound_emails_uniqueness", unique: true
  end

  create_table "action_text_rich_texts", force: :cascade do |t|
    t.text "body"
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.bigint "record_id", null: false
    t.string "record_type", null: false
    t.datetime "updated_at", null: false
    t.index [ "record_type", "record_id", "name" ], name: "index_action_text_rich_texts_uniqueness", unique: true
  end

  create_table "active_storage_attachments", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.bigint "record_id", null: false
    t.string "record_type", null: false
    t.index [ "blob_id" ], name: "index_active_storage_attachments_on_blob_id"
    t.index [ "record_type", "record_id", "name", "blob_id" ], name: "index_active_storage_attachments_uniqueness", unique: true
  end

  create_table "active_storage_blobs", force: :cascade do |t|
    t.bigint "byte_size", null: false
    t.string "checksum"
    t.string "content_type"
    t.datetime "created_at", null: false
    t.string "filename", null: false
    t.string "key", null: false
    t.text "metadata"
    t.string "service_name", null: false
    t.index [ "key" ], name: "index_active_storage_blobs_on_key", unique: true
  end

  create_table "active_storage_variant_records", force: :cascade do |t|
    t.bigint "blob_id", null: false
    t.string "variation_digest", null: false
    t.index [ "blob_id", "variation_digest" ], name: "index_active_storage_variant_records_uniqueness", unique: true
  end

  create_table "ahoy_events", force: :cascade do |t|
    t.string "name"
    t.jsonb "properties"
    t.datetime "time"
    t.bigint "user_id"
    t.bigint "visit_id"
    t.index "lower((properties ->> 'page'::text))", name: "index_ahoy_events_on_lower_page"
    t.index [ "name", "time" ], name: "index_ahoy_events_on_name_and_time"
    t.index [ "properties" ], name: "index_ahoy_events_on_properties", opclass: :jsonb_path_ops, using: :gin
    t.index [ "user_id" ], name: "index_ahoy_events_on_user_id"
    t.index [ "visit_id" ], name: "index_ahoy_events_on_visit_id"
  end

  create_table "ahoy_visits", force: :cascade do |t|
    t.string "app_version"
    t.string "browser"
    t.string "browser_version"
    t.string "city"
    t.string "country"
    t.string "device_type"
    t.string "hostname"
    t.string "ip"
    t.text "landing_page"
    t.float "latitude"
    t.float "longitude"
    t.string "os"
    t.string "os_version"
    t.string "platform"
    t.text "referrer"
    t.string "referring_domain"
    t.string "region"
    t.string "screen_size"
    t.datetime "started_at"
    t.text "user_agent"
    t.bigint "user_id"
    t.string "utm_campaign"
    t.string "utm_content"
    t.string "utm_medium"
    t.string "utm_source"
    t.string "utm_term"
    t.string "visit_token"
    t.string "visitor_token"
    t.index [ "latitude", "longitude" ], name: "index_ahoy_visits_on_coordinates", where: "((latitude IS NOT NULL) AND (longitude IS NOT NULL))"
    t.index [ "started_at" ], name: "index_ahoy_visits_on_started_at"
    t.index [ "user_id" ], name: "index_ahoy_visits_on_user_id"
    t.index [ "visit_token" ], name: "index_ahoy_visits_on_visit_token", unique: true
    t.index [ "visitor_token", "started_at" ], name: "index_ahoy_visits_on_visitor_token_and_started_at"
  end

  create_table "analytics_funnels", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "created_by_id"
    t.string "name", null: false
    t.jsonb "steps", default: [], null: false
    t.datetime "updated_at", null: false
    t.index [ "name" ], name: "index_analytics_funnels_on_name", unique: true
  end

  create_table "analytics_settings", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "key", null: false
    t.datetime "updated_at", null: false
    t.text "value"
    t.index [ "key" ], name: "index_analytics_settings_on_key", unique: true
  end

  create_table "imported_entry_pages", force: :cascade do |t|
    t.integer "bounces", default: 0, null: false
    t.date "date", null: false
    t.integer "entrances", default: 0, null: false
    t.text "entry_page", null: false
    t.integer "visit_duration", default: 0, null: false
    t.integer "visitors", default: 0, null: false
    t.index [ "date", "entry_page" ], name: "index_imported_entry_pages_on_date_and_entry_page"
  end

  create_table "imported_exit_pages", force: :cascade do |t|
    t.integer "bounces", default: 0, null: false
    t.date "date", null: false
    t.text "exit_page", null: false
    t.integer "exits", default: 0, null: false
    t.integer "pageviews", default: 0, null: false
    t.integer "visit_duration", default: 0, null: false
    t.integer "visitors", default: 0, null: false
    t.index [ "date", "exit_page" ], name: "index_imported_exit_pages_on_date_and_exit_page"
  end

  create_table "imported_pages", force: :cascade do |t|
    t.integer "bounces", default: 0, null: false
    t.date "date", null: false
    t.text "page", null: false
    t.integer "pageviews", default: 0, null: false
    t.bigint "total_time_on_page", default: 0, null: false
    t.bigint "total_time_on_page_visits", default: 0, null: false
    t.integer "visitors", default: 0, null: false
    t.index [ "date", "page" ], name: "index_imported_pages_on_date_and_page"
  end

  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
end
