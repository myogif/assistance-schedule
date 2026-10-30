/**
 * Fetches live stock price data from Yahoo Finance for IDX-listed tickers.
 * Uses the public /v8/finance/chart endpoint (no auth required).
 */

/**
 * @param {string[]} tickers - IDX ticker codes without .JK suffix (e.g. ['BBCA', 'TLKM'])
 * @returns {Promise<Map<string, {price: string, change_pct: string, direction: 'up'|'down'|'flat'}>>}
 */
async function fetchStockPrices(tickers) {
  const result = new Map();

  const fetches = tickers.map(async (ticker) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}.JK?interval=1d&range=1d`;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return; // non-2xx → skip

      const json = await res.json();
      const chartResult = json?.chart?.result;
      if (!chartResult || chartResult.length === 0) return; // no data → skip

      const meta = chartResult[0]?.meta;
      if (!meta) return;

      const regularMarketPrice = meta.regularMarketPrice;
      const regularMarketChangePercent = meta.regularMarketChangePercent;

      if (regularMarketPrice == null || regularMarketChangePercent == null) return;

      const price = regularMarketPrice.toLocaleString('id-ID');
      const change_pct = Math.abs(regularMarketChangePercent).toFixed(2) + '%';
      const direction =
        regularMarketChangePercent > 0 ? 'up' : regularMarketChangePercent < 0 ? 'down' : 'flat';

      result.set(ticker, { price, change_pct, direction });
    } catch (_) {
      // Network error / timeout / parse error → skip ticker silently
    }
  });

  await Promise.allSettled(fetches);
  return result;
}

module.exports = { fetchStockPrices };
