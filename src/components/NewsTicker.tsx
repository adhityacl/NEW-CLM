import React, { useEffect, useState } from 'react';
import { Megaphone, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { getAuthHeaders } from '../App';

type TickerStatus = 'loading' | 'ready' | 'empty' | 'error';


/**
 * Optional dashboard news ticker: 5 short regulatory headlines for the
 * tenant's industry and country, generated server-side by the configured AI
 * provider and cached for 7 days (GET /api/dashboard/news-ticker). Hidden
 * when the tenant's `newsTicker` module is off or no AI key is configured.
 */
export const NewsTicker: React.FC = () => {
  const { t } = useLanguage();
  const [status, setStatus] = useState<TickerStatus>('loading');
  const [items, setItems] = useState<string[]>([]);

  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/dashboard/news-ticker', { headers: getAuthHeaders() });
        const text = await res.text();
        const data = text && !text.trim().startsWith('<') ? JSON.parse(text) : null;
        if (cancelled) return;
        const fetchedItems: string[] = Array.isArray(data?.items) ? data.items : [];
        if (!res.ok || fetchedItems.length === 0) {
          setStatus('empty');
          return;
        }
        setItems(fetchedItems);
        setStatus('ready');
      } catch (err) {
        console.error('Failed fetching news ticker:', err);
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const nudge = (direction: number) => {
    setActiveIndex((index) => (index + direction + items.length) % items.length);
  };

  // Nothing meaningful to show and nothing to retry inline (a transient
  // Gemini error or a not-yet-configured API key) — quietly omit the
  // ticker rather than leaving an empty bar or an error banner on the
  // dashboard's very first card.
  if (status === 'loading' || status === 'empty' || status === 'error') {
    return null;
  }

  const label = t('dashboard.news_ticker_label', 'Info Regulasi Terkini');

  return (
    <div
      className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl mb-3 flex flex-wrap sm:flex-nowrap items-stretch overflow-hidden"
      role="region"
      aria-label={label}
    >
      <div className="w-full sm:w-auto shrink-0 flex items-center gap-1.5 px-4 py-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs sm:text-sm font-bold whitespace-nowrap">
        <Megaphone className="w-4 h-4 shrink-0" />
        <span>{label}</span>
      </div>

      <div className="flex-1 min-w-0 px-4 py-2.5" aria-live="polite" aria-atomic="true">
        <p className="text-sm text-slate-700 dark:text-slate-300 break-words">{items[activeIndex]}</p>
        <span className="text-xs text-slate-500">{activeIndex + 1} / {items.length}</span>
      </div>

      <div className="shrink-0 flex items-center gap-0.5 pr-3 pl-1 bg-white dark:bg-slate-900">
        <button
          type="button"
          onClick={() => nudge(-1)}
          aria-label={t('dashboard.news_ticker_prev', 'Berita Sebelumnya')}
          title={t('dashboard.news_ticker_prev', 'Berita Sebelumnya')}
          disabled={items.length < 2}
          className="min-w-11 min-h-11 flex items-center justify-center disabled:opacity-40 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => nudge(1)}
          aria-label={t('dashboard.news_ticker_next', 'Berita Berikutnya')}
          title={t('dashboard.news_ticker_next', 'Berita Berikutnya')}
          disabled={items.length < 2}
          className="min-w-11 min-h-11 flex items-center justify-center disabled:opacity-40 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
