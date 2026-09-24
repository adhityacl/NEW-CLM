import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Megaphone, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { getAuthHeaders } from '../App';

type TickerStatus = 'loading' | 'ready' | 'empty' | 'error';

const SCROLL_SPEED_PX_PER_SEC = 45;
const NUDGE_PX = 220;

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

  const trackRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const pausedRef = useRef(false);
  const rafRef = useRef<number | null>(null);

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

  // Rendered twice back-to-back so the track can scroll seamlessly: once it
  // has moved exactly one copy's width, wrapping the offset back to 0 is
  // invisible to the eye (the second copy is sitting exactly where the
  // first one started).
  const trackItems = useMemo(() => [...items, ...items], [items]);

  const wrap = (offset: number, loopWidth: number) => {
    if (loopWidth <= 0) return offset;
    const wrapped = offset % loopWidth;
    return wrapped > 0 ? wrapped - loopWidth : wrapped;
  };

  const applyOffset = () => {
    if (trackRef.current) {
      trackRef.current.style.transform = `translateX(${offsetRef.current}px)`;
    }
  };

  useEffect(() => {
    if (status !== 'ready' || items.length === 0) return;
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    pausedRef.current = !!prefersReducedMotion;

    let lastTime: number | null = null;
    const step = (time: number) => {
      if (lastTime === null) lastTime = time;
      const deltaSeconds = (time - lastTime) / 1000;
      lastTime = time;
      const loopWidth = (trackRef.current?.scrollWidth || 0) / 2;
      if (!pausedRef.current && loopWidth > 0) {
        offsetRef.current = wrap(offsetRef.current - SCROLL_SPEED_PX_PER_SEC * deltaSeconds, loopWidth);
        applyOffset();
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, items.length]);

  const nudge = (direction: 1 | -1) => {
    const loopWidth = (trackRef.current?.scrollWidth || 0) / 2;
    offsetRef.current = wrap(offsetRef.current - direction * NUDGE_PX, loopWidth);
    applyOffset();
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
      className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm mb-6 flex items-stretch overflow-hidden"
      role="region"
      aria-label={label}
    >
      <div className="shrink-0 flex items-center gap-1.5 px-5 bg-[#06C755] text-white text-xs sm:text-sm font-bold whitespace-nowrap">
        <Megaphone className="w-4 h-4 shrink-0" />
        <span>{label}</span>
      </div>

      <div
        className="flex-1 min-w-0 overflow-hidden py-3.5"
        onMouseEnter={() => { pausedRef.current = true; }}
        onMouseLeave={() => { pausedRef.current = false; }}
      >
        <div ref={trackRef} className="flex items-center whitespace-nowrap will-change-transform">
          {trackItems.map((text, i) => (
            <span
              key={i}
              className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 px-5 border-r border-slate-200 dark:border-slate-700 last:border-r-0"
            >
              {text}
            </span>
          ))}
        </div>
      </div>

      <div className="shrink-0 flex items-center gap-0.5 pr-3 pl-1 bg-white dark:bg-slate-900">
        <button
          type="button"
          onClick={() => nudge(-1)}
          aria-label={t('dashboard.news_ticker_prev', 'Berita Sebelumnya')}
          title={t('dashboard.news_ticker_prev', 'Berita Sebelumnya')}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => nudge(1)}
          aria-label={t('dashboard.news_ticker_next', 'Berita Berikutnya')}
          title={t('dashboard.news_ticker_next', 'Berita Berikutnya')}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
