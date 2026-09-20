// Standalone currency rates helper without external Google Sheets dependency
let globalRatesCache: Record<string, number> = {};
let lastGlobalRatesFetch = 0;

export async function fetchRealRates(): Promise<Record<string, number>> {
  if (Date.now() - lastGlobalRatesFetch < 3600000 && Object.keys(globalRatesCache).length > 0) {
    return globalRatesCache;
  }
  try {
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    if (res.ok) {
      const data = await res.json();
      globalRatesCache = data.rates || {};
      lastGlobalRatesFetch = Date.now();
    }
  } catch (e) {
    console.warn('Failed to fetch real-time exchange rates, using defaults', e);
  }
  return globalRatesCache;
}

export async function getHistoricalExchangeRatesBatch(
  _spreadsheetId: string,
  _token: string,
  items: { currency: string; invoice_date?: string }[]
): Promise<Record<string, number>> {
  const map: Record<string, number> = {};
  const rates = await fetchRealRates();
  
  for (const item of items) {
    const cur = (item.currency || 'IDR').toUpperCase();
    if (cur === 'USD') {
      map[`USD_${item.invoice_date || ''}`] = 1;
      continue;
    }
    
    // Convert to USD multiplier (e.g. 1 / 15000 for IDR)
    let rate = cur === 'IDR' ? 0.000062 : 1;
    if (rates[cur]) {
      rate = 1 / rates[cur];
    }
    
    map[`${cur}_${item.invoice_date || ''}`] = rate;
  }
  
  return map;
}

export async function getHistoricalExchangeRate(
  spreadsheetId: string,
  token: string,
  currency: string,
  invoiceDateStr?: string
): Promise<number> {
  const map = await getHistoricalExchangeRatesBatch(spreadsheetId, token, [{ currency, invoice_date: invoiceDateStr }]);
  return map[`${(currency || 'IDR').toUpperCase()}_${invoiceDateStr || ''}`] || ((currency || 'IDR').toUpperCase() === 'IDR' ? 0.000062 : 1);
}

export async function getExchangeRates(_spreadsheetId: string, _token: string, currencies: string[]): Promise<Record<string, number>> {
  const targetCurrencies = Array.from(new Set(currencies.filter(c => c && c !== 'USD')));
  if (targetCurrencies.length === 0) return {};
  
  const rates = await fetchRealRates();
  const result: Record<string, number> = {};
  
  targetCurrencies.forEach(cur => {
    if (rates[cur]) {
      result[cur] = 1 / rates[cur];
    } else {
      result[cur] = cur === 'IDR' ? 0.000062 : 1;
    }
  });
  
  return result;
}
