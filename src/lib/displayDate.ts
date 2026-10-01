import { getActiveFormattingLocale } from './currencyUtils';
/** Date-only values must not shift to yesterday in negative UTC offsets. */
export function formatBusinessDate(value?: string | null, locale = getActiveFormattingLocale()): string {
  if (!value || /^\d{4}$/.test(value.trim())) return '—';
  const text = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  const local = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(text);
  const parts = iso ? [Number(iso[1]), Number(iso[2]), Number(iso[3])] : local ? [Number(local[3]), Number(local[2]), Number(local[1])] : null;
  if (!parts) return '—';
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '—';
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}
