class ApplicationController < ActionController::Base
  # Handle custom service errors globally to return clean JSON
  rescue_from StockMarketService::Error,         with: :render_service_error
  rescue_from StockMarketService::InvalidSymbol, with: :render_invalid_symbol

  private

  def render_invalid_symbol(exception)
    render json: { error: exception.message }, status: :not_found
  end

  def render_service_error(exception)
    render json: { error: exception.message }, status: :unprocessable_entity
  end
end