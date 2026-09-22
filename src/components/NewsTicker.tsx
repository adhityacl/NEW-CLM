import React, { useEffect, useRef, useState } from 'react';
import { Megaphone, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { getAuthHeaders } from '../App';

type TickerStatus = 'loading' | 'ready' | 'empty' | 'error';

const AUTO_ADVANCE_MS = 6000;

/**
 * Dashboard news ticker: 5 short headlines about current Indonesian
 * fintech-lending (Pindar/Pinjol) regulation, generated server-side via
 * Gemini and cached for 7 days (see GET /api/dashboard/news-ticker in
 * server.ts) — this component only fetches once and steps through them.
 */
export const NewsTicker: React.FC = () => {
  const { t } = useLanguage();
  const [status, setStatus] = useState<TickerStatus>('loading');
  const [items, setItems] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  useEffect(() => {
    if (status !== 'ready' || isPaused || items.length <= 1) return;
    timerRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % items.length);
    }, AUTO_ADVANCE_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status, isPaused, items.length]);

  const goPrev = () => setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
  const goNext = () => setActiveIndex((prev) => (prev + 1) % items.length);

  // Nothing meaningful to show and nothing to retry inline (a transient
  // Gemini error or a not-yet-configured API key) — quietly omit the
  // ticker rather than leaving an empty bar or an error banner on the
  // dashboard's very first card.
  if (status === 'loading' || status === 'empty' || status === 'error') {
    return null;
  }

  return (
    <div
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex items-center gap-3 px-3 py-2.5 mb-6"
      role="region"
      aria-label={t('dashboard.news_ticker_label', 'Info Regulasi Terkini')}
    >
      <span className="shrink-0 inline-flex items-center gap-1.5 bg-[#06C755] text-white text-[11px] font-bold px-3 py-1.5 rounded-lg whitespace-nowrap">
        <Megaphone className="w-3.5 h-3.5" />
        {t('dashboard.news_ticker_label', 'Info Regulasi Terkini')}
      </span>

      <div className="flex-1 min-w-0 overflow-hidden">
        <p
          key={activeIndex}
          className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 truncate animate-in fade-in slide-in-from-right-3 duration-500"
          title={items[activeIndex]}
        >
          {items[activeIndex]}
        </p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={goPrev}
          disabled={items.length <= 1}
          aria-label={t('dashboard.news_ticker_prev', 'Berita Sebelumnya')}
          title={t('dashboard.news_ticker_prev', 'Berita Sebelumnya')}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setIsPaused((p) => !p)}
          disabled={items.length <= 1}
          aria-label={isPaused ? t('dashboard.news_ticker_play', 'Putar Otomatis') : t('dashboard.news_ticker_pause', 'Jeda')}
          title={isPaused ? t('dashboard.news_ticker_play', 'Putar Otomatis') : t('dashboard.news_ticker_pause', 'Jeda')}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
        >
          {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={items.length <= 1}
          aria-label={t('dashboard.news_ticker_next', 'Berita Berikutnya')}
          title={t('dashboard.news_ticker_next', 'Berita Berikutnya')}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
