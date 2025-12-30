# frozen_string_literal: true

require "json"

module AhoyAnalytics
  class AssetManifest
    class MissingManifestError < StandardError; end
    class MissingEntryError < StandardError; end

    def initialize(path:)
      @path = path
    end

    def entry(entrypoint)
      manifest = read_manifest
      key = resolve_entry_key(manifest, entrypoint)
      return manifest[key] if key

      raise MissingEntryError, "AhoyAnalytics manifest entry not found for #{entrypoint.inspect}"
    end

    private

      def read_manifest
        return @manifest if @manifest && @manifest_mtime == manifest_mtime

        @manifest = JSON.parse(File.read(@path))
        @manifest_mtime = manifest_mtime
        @manifest
      rescue Errno::ENOENT
        raise MissingManifestError, "AhoyAnalytics manifest not found at #{@path}"
      end

      def manifest_mtime
        File.mtime(@path)
      rescue Errno::ENOENT
        Time.at(0)
      end

      def resolve_entry_key(manifest, entrypoint)
        base = entrypoint.to_s.sub(/\.(t|j)sx?\z/, "")
        candidates = [
          "entrypoints/#{base}.tsx",
          "entrypoints/#{base}.ts",
          "entrypoints/#{base}.jsx",
          "entrypoints/#{base}.js",
          "#{base}.tsx",
          "#{base}.ts",
          "#{base}.jsx",
          "#{base}.js"
        ]

        candidates.find { |candidate| manifest.key?(candidate) }
      end
  end
end
