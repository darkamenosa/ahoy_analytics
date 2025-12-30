# frozen_string_literal: true

module AhoyAnalytics
  class Current < ActiveSupport::CurrentAttributes
    attribute :request
    delegate :host, :protocol, to: :request, prefix: true, allow_nil: true
  end
end
