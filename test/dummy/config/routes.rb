Rails.application.routes.draw do
  mount ActionCable.server => "/cable"
  mount AhoyAnalytics::Engine => "/admin/analytics"
end
