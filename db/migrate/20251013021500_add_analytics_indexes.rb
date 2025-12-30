class AddAnalyticsIndexes < ActiveRecord::Migration[8.1]
  def change
    # Accelerate equality lookups on page path stored in event properties
    add_index :ahoy_events,
              "LOWER((properties->>'page'))",
              name: "index_ahoy_events_on_lower_page"

    # Speed up live map queries that require coordinates
    add_index :ahoy_visits,
              [ :latitude, :longitude ],
              where: "latitude IS NOT NULL AND longitude IS NOT NULL",
              name: "index_ahoy_visits_on_coordinates"
  end
end
