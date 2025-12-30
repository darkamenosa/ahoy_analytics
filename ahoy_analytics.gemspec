require_relative "lib/ahoy_analytics/version"

Gem::Specification.new do |spec|
  spec.name        = "ahoy_analytics"
  spec.version     = AhoyAnalytics::VERSION
  spec.authors     = [ "Tom Ho" ]
  spec.email       = [ "hxtxmu@gmail.com" ]
  spec.homepage    = "https://github.com/darkamenosa/ahoy_analytics"
  spec.summary     = "Live analytics tracking for Rails apps. No third-party services, just plug and run."
  spec.description = "Live analytics tracking for Ruby on Rails apps. No need for third-party services, just plug and run."
  spec.license     = "MIT"

  spec.metadata["homepage_uri"] = spec.homepage
  spec.metadata["source_code_uri"] = spec.homepage

  spec.required_ruby_version = ">= 3.2"

  spec.files = Dir.chdir(File.expand_path(__dir__)) do
    Dir["{app,config,db,lib}/**/*", "MIT-LICENSE", "Rakefile", "README.md"]
  end

  spec.add_dependency "rails", "~> 8.1"
  spec.add_dependency "ahoy_matey", "~> 5.4"
  spec.add_dependency "inertia_rails", "~> 3.15"
  spec.add_dependency "device_detector", "~> 1.1"
  spec.add_dependency "maxminddb", "~> 0.1"
  spec.add_dependency "countries", "~> 8.0"
  spec.add_dependency "csv", "~> 3.3"

  spec.add_development_dependency "vite_rails", "~> 3.0"
end
