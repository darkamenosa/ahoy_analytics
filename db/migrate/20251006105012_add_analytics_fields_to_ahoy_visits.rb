class AddAnalyticsFieldsToAhoyVisits < ActiveRecord::Migration[8.1]
  def change
    change_table :ahoy_visits, bulk: true do |t|
      t.string  :screen_size
      t.string  :browser_version
      t.string  :hostname
    end

    add_index :ahoy_visits, :started_at unless index_exists?(:ahoy_visits, :started_at)
  end
end
