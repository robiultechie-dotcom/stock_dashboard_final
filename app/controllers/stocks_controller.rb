class StocksController < ApplicationController
  # Renders the single-page dashboard shell
  def index
  end

  # Handles autocomplete stock search
  def search
    results = market_service.search(params[:q])
    render json: { query: params[:q].to_s, results: results }
  end

  private

  def market_service
    @market_service ||= StockMarketService.new
  end
end