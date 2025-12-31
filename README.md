# AhoyAnalytics

> **Early Stage Project**
>
> Better to make it exist first, then improve later.
>
> This project is in active development with many assumptions baked in. Expect breaking changes. Best suited for small greenfield projects.
>
> **Current assumptions:**
> - PostgreSQL (required - uses JSONB, `generate_series`, timezone functions)
> - Solid Queue (for recurring jobs / live updates)
> - Action Cable (for real-time live view)
>
> More flexibility coming soon.

Mountable analytics dashboard for Rails using Ahoy + Inertia (no SSR). Ships a
ready-to-run UI, live view, and a tracking script with prebuilt assets.

## Video demo
[Watch the demo on YouTube](https://www.youtube.com/watch?v=KUuaJm3riaQ)

## Requirements
- Rails 8.1+
- PostgreSQL
- Solid Queue (for live updates via recurring jobs)
- Action Cable (for the live view)

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
PostgreSQL only. The engine relies on JSONB, `generate_series`, and timezone SQL functions. Other databases are not supported.

## Live updates
The Live view uses Action Cable. The installer configures Solid Queue to run `AhoyAnalytics::UpdateJob` every 30 seconds via `config/recurring.yml`.

If you're not using Solid Queue, schedule this job manually with your job runner:

```ruby
AhoyAnalytics::UpdateJob.perform_later
```

Run it every 15–30 seconds for real-time updates.

## Assets
This engine ships prebuilt assets under `app/assets/ahoy_analytics/build`, so
host apps do not need Vite.

If you change the frontend:

```bash
npm install
npm run build
```

## GeoIP (optional)
To enable GeoLite2 city lookups:

1. Create a free MaxMind account at https://www.maxmind.com/en/geolite2/signup
2. Go to "Download Files" and download **GeoLite2 City** (the `.mmdb` format)
3. Place the file at `db/geo/GeoLite2-City.mmdb` or set `MAXMIND_DB_PATH` to its location

```bash
mkdir -p db/geo
# Move your downloaded file
mv ~/Downloads/GeoLite2-City.mmdb db/geo/
```

The database is updated weekly by MaxMind. Consider setting up a cron job or using their `geoipupdate` tool to keep it current.

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
