class StockChartsController < ApplicationController
  # Returns historical chart data for the selected stock and date range
  def show
    data = market_service.chart_data(symbol: params[:symbol], range: params[:range])
    render json: data
  end

  private

  def market_service
    @market_service ||= StockMarketService.new
  end
end