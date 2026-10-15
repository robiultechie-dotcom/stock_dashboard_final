require 'net/http'
require 'uri'
require 'json'
require 'cgi'

# Service to fetch and normalize data from Yahoo Finance API
class StockMarketService
  class Error < StandardError; end
  class InvalidSymbol < Error; end

  # Fetches up to 5 matching stocks for autocomplete
  def search(query)
    return [] if query.blank?

    url = URI("https://query2.finance.yahoo.com/v1/finance/search?q=#{CGI.escape(query)}&quotesCount=5")
    response = fetch_with_user_agent(url)
    data = JSON.parse(response.body)

    return [] unless data["quotes"]

    data["quotes"]
      .select { |q| q["quoteType"] == "EQUITY" || q["quoteType"] == "ETF" }
      .map { |q| { symbol: q["symbol"], name: q["shortname"] || q["longname"] } }
  rescue StandardError => e
    Rails.logger.error("Yahoo Search Error: #{e.message}")
    []
  end

  # Fetches historical chart data and current price metrics
  def chart_data(symbol:, range:)
    # Map UI ranges to Yahoo Finance specific formats
    mapping = {
      "1D" => { r: "1d", i: "5m" },
      "5D" => { r: "5d", i: "15m" },
      "1W" => { r: "5d", i: "15m" },
      "1M" => { r: "1mo", i: "1d" },
      "1Y" => { r: "1y", i: "1d" }
    }
    config = mapping[range] || mapping["1M"]

    url = URI("https://query2.finance.yahoo.com/v8/finance/chart/#{CGI.escape(symbol)}?range=#{config[:r]}&interval=#{config[:i]}")
    response = fetch_with_user_agent(url)
    body = JSON.parse(response.body)

    result = body.dig("chart", "result", 0)
    raise InvalidSymbol, "Could not fetch data for #{symbol}" unless result

    timestamps = result["timestamp"] || []
    quotes = result.dig("indicators", "quote", 0) || {}

    # Format candle data for Lightweight Charts
    candles = timestamps.map.with_index do |t, i|
      next if quotes["open"][i].nil?
      {
        time: t,
        open: quotes["open"][i].round(2),
        high: quotes["high"][i].round(2),
        low: quotes["low"][i].round(2),
        close: quotes["close"][i].round(2)
      }
    end.compact

    # Extract summary metrics
    meta = result["meta"]
    prev_close = meta["chartPreviousClose"] || meta["previousClose"] || 1
    current_price = meta["regularMarketPrice"]
    change = current_price - prev_close
    change_pct = (change / prev_close) * 100

    {
      candles: candles,
      latest: {
        price: current_price.round(2),
        change: change.round(2),
        change_percent: change_pct.round(2)
      }
    }
  rescue StandardError => e
    raise Error, "Failed to load chart data: #{e.message}"
  end

  private

  # Bypass basic bot protections using a standard browser User-Agent
  def fetch_with_user_agent(url)
    http = Net::HTTP.new(url.host, url.port)
    http.use_ssl = true
    request = Net::HTTP::Get.new(url)
    request["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/91.0.4472.124 Safari/537.36"
    http.request(request)
  end
end