Rails.application.routes.draw do
  # Main dashboard view
  root "stocks#index"
  
  # API endpoints for frontend requests
  get "stocks/search", to: "stocks#search"
  get "stock_charts/show", to: "stock_charts#show"
end