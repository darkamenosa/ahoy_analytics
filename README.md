# AhoyAnalytics
Mountable analytics dashboard for Rails using Ahoy + Inertia (no SSR). Ships a
ready-to-run UI, live view, and a tracking script with prebuilt assets.

## Requirements
- Rails 8.1+
- A database supported by Ahoy Matey
- Action Cable mounted (for the live view)

## Installation
Add this line to your application's Gemfile:

```ruby
gem "ahoy_analytics"
```

Then run:

```bash
bundle
bin/rails generate ahoy_analytics:install
bin/rails db:migrate
```

The installer will:
- Mount the engine at the path you specify.
- Mount Action Cable at `/cable` if missing.
- Copy migrations.
- Add the tracking tag to `app/views/layouts/application.html.erb`.

### Important: Ahoy routes
Ahoy Matey automatically mounts `Ahoy::Engine` at `/ahoy` when `Ahoy.api = true`
(this engine sets it). **Do not mount `Ahoy::Engine` yourself** or you'll get a
route name conflict (`ahoy_engine`).

## Usage
With the default mount path:
- Analytics dashboard: `/admin/analytics`
- Live view: `/admin/analytics/live`

If you mount at a different path (e.g. `/analytics`), those routes shift
accordingly.

## Tracking script
The generator injects this tag in your main layout:

```erb
<%= ahoy_analytics_tracking_tag %>
```

Place it in `<head>` to ensure page views are tracked on every page. The script
posts to Ahoy's `/ahoy/visits` and `/ahoy/events` endpoints.

## Configuration
Edit `config/initializers/ahoy_analytics.rb`:

```ruby
AhoyAnalytics.configure do |config|
  config.mount_path = "/admin/analytics" # change this to mount elsewhere
  config.ahoy_path = "/ahoy"
  config.cable_path = "/cable"

  # Optional: enable Vite dev server for engine UI during development
  # config.use_vite_dev_server = Rails.env.development?

  # Optional: supply a contact email for geocoding requests (OpenStreetMap Nominatim)
  # config.geocode_email = ENV["AHOY_ANALYTICS_GEOCODE_EMAIL"]

  # Optional: pass user info to the header
  # config.user_context = -> { { role: "admin", email: current_user&.email.to_s } }

  # Optional: tweak site capabilities
  # config.site_context = -> { { has_goals: false, has_props: true } }
end
```

Other useful settings:
- `config.tracking_exclude_paths` (default excludes `/admin`, `/.well-known`,
  `/ahoy`, `/cable`, and the mount path)
- `config.tracking_include_paths` (override exclusions)
- `config.tracking_debug` (prints debug logs in the browser)

## Security
This engine does not enforce authentication or authorization.
Protect the mounted routes in your host app and ensure only authorized users can access the analytics UI and JSON endpoints.
If you enable Live updates, also protect Action Cable access to the `config.cable_stream` channel.
Action Cable authentication/authorization is app-owned and must be implemented in the host app.

## Database
PostgreSQL only. The engine relies on JSONB, `generate_series`, and timezone SQL functions.

## Live updates
The Live view uses Action Cable. Schedule this job to broadcast fresh data:

```ruby
AhoyAnalytics::UpdateJob.perform_later
```

Run it on a schedule (for example every 15–30 seconds) using your job runner.

If your app uses Solid Queue recurring jobs (`config/recurring.yml`), the
installer will add a default schedule of every 30 seconds for you. Otherwise,
configure the schedule manually.

## Assets
This engine ships prebuilt assets under `app/assets/ahoy_analytics/build`, so
host apps do not need Vite.

If you change the frontend:

```bash
npm install
npm run build
```

## GeoIP (optional)
To enable GeoLite2 city lookups, place the MaxMind database at
`db/geo/GeoLite2-City.mmdb` or set `MAXMIND_DB_PATH` to its location.

## Development
To use the dummy app with the Vite dev server:

```ruby
AhoyAnalytics.configure do |config|
  config.use_vite_dev_server = Rails.env.development?
end
```

Then run:

```bash
bin/dev
```

## Contributing
Contribution directions go here.

## License
The gem is available as open source under the terms of the MIT License.
