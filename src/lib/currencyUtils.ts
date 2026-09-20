export const SUPPORTED_CURRENCIES = [
  { code: 'IDR', label: 'IDR (Rupiah)', symbol: 'Rp', defaultRateToUsd: 0.000062 },
  { code: 'USD', label: 'USD (US Dollar)', symbol: '$', defaultRateToUsd: 1.0 },
  { code: 'EUR', label: 'EUR (Euro)', symbol: '€', defaultRateToUsd: 1.08 },
  { code: 'SGD', label: 'SGD (Singapore Dollar)', symbol: 'S$', defaultRateToUsd: 0.75 },
  { code: 'AUD', label: 'AUD (Australian Dollar)', symbol: 'A$', defaultRateToUsd: 0.65 },
  { code: 'GBP', label: 'GBP (British Pound)', symbol: '£', defaultRateToUsd: 1.28 },
  { code: 'JPY', label: 'JPY (Japanese Yen)', symbol: '¥', defaultRateToUsd: 0.0068 },
  { code: 'CNY', label: 'CNY (Chinese Yuan)', symbol: '¥', defaultRateToUsd: 0.14 },
  { code: 'HKD', label: 'HKD (Hong Kong Dollar)', symbol: 'HK$', defaultRateToUsd: 0.13 },
];

export function formatMoney(amount: number, curr = 'IDR'): string {
  const code = (curr || 'IDR').toUpperCase();
  try {
    return new Intl.NumberFormat(code === 'IDR' ? 'id-ID' : 'en-US', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: code === 'IDR' || code === 'JPY' ? 0 : 2,
    }).format(amount || 0);
  } catch {
    return `${code} ${(amount || 0).toLocaleString()}`;
  }
}

export function getDefaultUsdRate(currency: string): number {
  const code = (currency || 'IDR').toUpperCase();
  if (code === 'USD') return 1;
  const match = SUPPORTED_CURRENCIES.find((c) => c.code === code);
  return match ? match.defaultRateToUsd : (code === 'IDR' ? 0.000062 : 1);
}

export async function fetchHistoricalRate(
  currency: string,
  dateStr?: string
): Promise<{ rate: number; isFallback?: boolean }> {
  const code = (currency || 'IDR').toUpperCase();
  if (code === 'USD') return { rate: 1, isFallback: false };
  try {
    const params = new URLSearchParams({ currency: code });
    if (dateStr) params.append('date', dateStr);
    const res = await fetch(`/api/exchange-rate-historical?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      if (typeof data.rate === 'number' && !isNaN(data.rate) && data.rate > 0) {
        return { rate: data.rate, isFallback: Boolean(data.isFallback) };
      }
    }
  } catch (e) {
    console.warn('Failed to fetch historical exchange rate:', e);
  }
  return { rate: getDefaultUsdRate(code), isFallback: true };
}

export const getHistoricalUsdRate = fetchHistoricalRate;
