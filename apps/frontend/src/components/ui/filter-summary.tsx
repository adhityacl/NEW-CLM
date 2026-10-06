import React from 'react';
import { useLanguage } from '../../context/LanguageContext';
export function FilterSummary({ filters, onReset }: { filters: { label: string; value: string; active: boolean }[]; onReset: () => void }) {
  const { t } = useLanguage();
  const active = filters.filter(filter => filter.active);
  if (!active.length) return null;
  return <div className="px-4 py-3 flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
    {active.map((filter, index) => <span key={index} className="max-w-full break-words rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-slate-700 dark:text-slate-200">{filter.label}: {filter.value}</span>)}
    <button type="button" onClick={onReset} className="min-h-11 px-3 font-semibold text-emerald-800 dark:text-emerald-300 underline underline-offset-2">{t('ui.reset_filters')}</button>
  </div>;
}
