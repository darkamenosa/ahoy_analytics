AhoyAnalytics::Engine.routes.draw do
  root to: "analytics#show"
  get "/live", to: "live#show", as: :live
  get "/_/referrers/:source", to: "analytics#show", as: :referrers_dialog
  get "/_/:dialog", to: "analytics#show", as: :dialog

  resource :top_stats, only: [ :show ]
  resource :main_graph, only: [ :show ], controller: "main_graph"
  resources :sources, only: [ :index ]
  resources :search_terms, only: [ :index ]
  resources :referrers, only: [ :index ]
  resources :pages, only: [ :index ]
  resources :locations, only: [ :index ]
  resources :devices, only: [ :index ]
  resources :behaviors, only: [ :index ]
  resource :export, only: [ :show ]

  get "/assets/*path", to: "assets#show", as: :engine_asset
  get "/build/*path", to: "assets#show", as: :engine_build_asset
  get "/images/*path", to: "assets#show", as: :engine_image_asset
end
