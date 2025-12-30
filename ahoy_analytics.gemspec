require_relative "lib/ahoy_analytics/version"

Gem::Specification.new do |spec|
  spec.name        = "ahoy_analytics"
  spec.version     = AhoyAnalytics::VERSION
  spec.authors     = [ "Tuyen" ]
  spec.email       = [ "hxtxmu@gmail.com" ]
  spec.homepage    = "https://github.com/your-org/ahoy_analytics"
  spec.summary     = "Mountable analytics dashboard for Rails using Ahoy + Inertia"
  spec.description = "AhoyAnalytics provides a mountable Rails engine with an Inertia-based analytics UI and tracking script."
  spec.license     = "MIT"

  spec.metadata["homepage_uri"] = spec.homepage
  spec.metadata["source_code_uri"] = spec.homepage

  spec.files = Dir.chdir(File.expand_path(__dir__)) do
    Dir["{app,config,db,lib}/**/*", "MIT-LICENSE", "Rakefile", "README.md"]
  end

  spec.add_dependency "rails", ">= 8.1"
  spec.add_dependency "ahoy_matey"
  spec.add_dependency "inertia_rails"
  spec.add_dependency "device_detector"
  spec.add_dependency "maxminddb"
  spec.add_dependency "countries", "~> 8.0"
  spec.add_dependency "csv"

  spec.add_development_dependency "vite_rails"
end
