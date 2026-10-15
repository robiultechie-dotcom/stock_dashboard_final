import "@hotwired/turbo-rails"

const SEARCH_DEBOUNCE_MS = 300
const RANGES = ["1D", "5D", "1W", "1M", "1Y"]

class StockDashboard {
  constructor(root) {
    this.root = root
    
    // DOM Elements
    this.searchInput  = root.querySelector("#stock-search")
    this.suggestionBox = root.querySelector("#suggestions")
    this.searchStatus  = root.querySelector("#search-status")
    this.emptyState    = root.querySelector("#empty-state")
    this.summary       = root.querySelector("#stock-summary")
    this.chartCard     = root.querySelector("#chart-card")
    this.chartEl       = root.querySelector("#stock-chart")
    this.chartOverlay  = root.querySelector("#chart-loading")
    this.alertBox      = root.querySelector("#dashboard-alert")
    this.rangeButtons  = [...root.querySelectorAll(".range-btn")]

    // State Variables
    this.selectedStock = null
    this.activeRange   = "1M"
    this.suggestions   = []
    this.activeIndex   = -1
    this.debounceTimer = null
    this.searchSeq     = 0
    this.searchAbort   = null

    this.initChart()
    this.bindEvents()
  }

  // Initialize TradingView Lightweight Chart
  initChart() {
    this.chart = LightweightCharts.createChart(this.chartEl, {
      autoSize: true,
      layout: {
        background: { type: "solid", color: "transparent" },
        textColor: "#718096",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: "#edf2f7", style: LightweightCharts.LineStyle.SparseDotted },
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Magnet,
        vertLine: { width: 1, color: "#cbd5e0", style: LightweightCharts.LineStyle.Solid },
        horzLine: { width: 1, color: "#cbd5e0", style: LightweightCharts.LineStyle.Solid },
      },
      rightPriceScale: {
        borderColor: "#e2e8f0",
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: "#e2e8f0",
        timeVisible: true,
      },
    })

    this.candleSeries = this.chart.addCandlestickSeries({
      upColor: "#0ecb81",
      downColor: "#f6465d",
      borderVisible: false,
      wickUpColor: "#0ecb81",
      wickDownColor: "#f6465d",
    })
  }

  // Bind DOM events for input, keyboard navigation, and clicks
  bindEvents() {
    if (this.searchInput) {
      this.searchInput.addEventListener("input", () => this.onSearchInput())
      this.searchInput.addEventListener("keydown", (e) => this.onSearchKeydown(e))
    }

    // Close autocomplete dropdown when clicking outside the search box
    document.addEventListener("click", (e) => {
      if (!this.root.contains(e.target)) this.hideSuggestions()
    })

    this.rangeButtons.forEach((btn) =>
      btn.addEventListener("click", () => this.onRangeChange(btn))
    )
  }

  // Handle debounced search input
  onSearchInput() {
    const q = this.searchInput.value.trim()
    clearTimeout(this.debounceTimer)
    this.hideAlert()

    if (q.length < 2) { this.hideSuggestions(); return }

    this.setSearchStatus("searching")
    this.debounceTimer = setTimeout(() => this.fetchSuggestions(q), SEARCH_DEBOUNCE_MS)
  }

  // Fetch autocomplete suggestions from the backend API
  fetchSuggestions(q) {
    const seq = ++this.searchSeq
    if (this.searchAbort) this.searchAbort.abort()
    this.searchAbort = new AbortController()

    fetch(`/stocks/search?q=${encodeURIComponent(q)}`, {
      headers: { Accept: "application/json" },
      signal: this.searchAbort.signal
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error || "Search failed.")
        return body.results || []
      })
      .then((results) => {
        if (seq !== this.searchSeq) return
        this.renderSuggestions(results)
      })
      .catch((err) => {
        if (err.name === "AbortError" || seq !== this.searchSeq) return
        this.suggestions = []
        this.activeIndex = -1
        this.setSearchStatus("error", err.message)
      })
  }

  // Render the suggestion list in the DOM
  renderSuggestions(results) {
    this.suggestions = results
    this.suggestionBox.replaceChildren()
    this.activeIndex = -1

    if (this.suggestions.length === 0) {
      this.setSearchStatus("none")
      return
    }

    const fragment = document.createDocumentFragment()
    this.suggestions.forEach((item, i) => {
      const li = document.createElement("li")
      li.className = "list-group-item list-group-item-action"
      li.id = `suggestion-${i}`
      li.style.cursor = "pointer"

      const sym = document.createElement("span")
      sym.className = "fw-semibold"
      sym.textContent = item.symbol

      const name = document.createElement("span")
      name.className = "text-muted small ms-2"
      name.textContent = item.name

      li.append(sym, name)
      li.addEventListener("mousedown", (e) => { e.preventDefault(); this.selectStock(item) })
      fragment.appendChild(li)
    })

    this.suggestionBox.appendChild(fragment)
    this.setSearchStatus("list")
  }

  // Update search UI state (searching, error, none, list)
  setSearchStatus(state, message) {
    this.suggestionBox.classList.toggle("d-none", state !== "list")
    this.searchStatus.classList.toggle("d-none", state === "list" || state === "idle")
    this.searchStatus.classList.remove("text-danger")

    if (state === "searching") {
      this.searchStatus.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Searching...`
    } else if (state === "none") {
      this.searchStatus.textContent = "No matching companies found."
    } else if (state === "error") {
      this.searchStatus.textContent = message || "Search failed."
      this.searchStatus.classList.add("text-danger")
    }
  }

  hideSuggestions() {
    this.suggestions = []
    this.activeIndex = -1
    this.suggestionBox.classList.add("d-none")
    this.suggestionBox.replaceChildren()
    this.setSearchStatus("idle")
  }

  // Handle keyboard navigation inside the autocomplete dropdown
  onSearchKeydown(e) {
    const listOpen = !this.suggestionBox.classList.contains("d-none")
    if (e.key === "Escape") { this.hideSuggestions(); return }
    if (!listOpen) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      this.setActiveSuggestion(this.activeIndex + 1)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      this.setActiveSuggestion(this.activeIndex - 1)
    } else if (e.key === "Enter") {
      e.preventDefault()
      const item = this.suggestions[this.activeIndex]
      if (item) this.selectStock(item)
    }
  }

  // Highlight the selected suggestion
  setActiveSuggestion(index) {
    if (this.suggestions.length === 0) return
    this.activeIndex = (index + this.suggestions.length) % this.suggestions.length
    
    ;[...this.suggestionBox.children].forEach((li, i) => {
      li.classList.toggle("active", i === this.activeIndex)
      li.classList.toggle("bg-primary", i === this.activeIndex)
      li.classList.toggle("text-white", i === this.activeIndex)
    })
    this.suggestionBox.children[this.activeIndex].scrollIntoView({ block: "nearest" })
  }

  // Load chart data when a stock is selected
  selectStock(item) {
    this.selectedStock = item
    this.searchInput.value = `${item.symbol} — ${item.name}`
    this.hideSuggestions()

    this.summary.querySelector("#summary-symbol").textContent = item.symbol
    this.summary.querySelector("#summary-name").textContent = item.name

    this.emptyState.classList.add("d-none")
    this.summary.classList.remove("d-none")
    this.chartCard.classList.remove("d-none")
    this.loadChart()
  }

  // Handle date range button clicks
  onRangeChange(btn) {
    const range = btn.dataset.range
    if (!RANGES.includes(range) || range === this.activeRange) return

    this.activeRange = range
    this.rangeButtons.forEach((b) => b.classList.toggle("active", b === btn))
    if (this.selectedStock) this.loadChart()
  }

  // Fetch historical chart data from the backend API
  loadChart() {
    if (!this.selectedStock) return
    this.hideAlert()
    this.chartOverlay.classList.remove("d-none")

    const url = `/stock_charts/show?symbol=${encodeURIComponent(this.selectedStock.symbol)}&range=${encodeURIComponent(this.activeRange)}`

    fetch(url, { headers: { Accept: "application/json" } })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error || "Could not load chart data.")
        return body
      })
      .then((data) => this.renderChart(data))
      .catch((err) => this.showAlert(err.message))
      .finally(() => this.chartOverlay.classList.add("d-none"))
  }

  // Render the fetched data onto the chart and update summary
  renderChart(data) {
    if (!data.candles || data.candles.length === 0) {
      this.showAlert("The provider returned no price data for this range.")
      return
    }

    this.candleSeries.setData(data.candles)
    this.chart.timeScale().fitContent()

    const { price, change, change_percent: pct } = data.latest
    this.summary.querySelector("#summary-price").textContent = this.formatPrice(price)

    const changeEl = this.summary.querySelector("#summary-change")
    const sign = change >= 0 ? "+" : ""
    changeEl.textContent = `${sign}${this.formatPrice(change)} (${sign}${pct.toFixed(2)}%)`
    
    changeEl.classList.toggle("text-success", change >= 0)
    changeEl.classList.toggle("text-danger", change < 0)
  }

  formatPrice(n) {
    return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  showAlert(message) {
    this.alertBox.textContent = message
    this.alertBox.classList.remove("d-none")
  }

  hideAlert() {
    this.alertBox.classList.add("d-none")
    this.alertBox.textContent = ""
  }
}

// Initialize Dashboard
function initDashboard() {
  const root = document.getElementById("stock-dashboard")
  if (root && !root.dataset.initialized) {
    new StockDashboard(root)
    root.dataset.initialized = true
  }
}

document.addEventListener("turbo:load", initDashboard)
document.addEventListener("DOMContentLoaded", initDashboard)

// Ensure immediate execution
initDashboard()