import React from 'react';
import { ArrowUpRight, FileCheck2, ShieldCheck, type LucideIcon } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export interface OverviewMetric {
  label: string;
  value: number;
  total?: number;
  detail: string;
  icon: LucideIcon;
  tone: 'mint' | 'blue' | 'violet' | 'amber';
  onClick: () => void;
}

export function DashboardOverview({ greeting, expiring, metrics }: {
  greeting: string;
  expiring: number;
  metrics: OverviewMetric[];
}) {
  const { t } = useLanguage();
  return (
    <section className="dashboard-overview" aria-label={t('ui.overview')}>
      <div className="dashboard-welcome">
        <div className="dashboard-welcome-art" aria-hidden="true">
          <div className="dashboard-paper dashboard-paper-back" />
          <div className="dashboard-paper"><FileCheck2 size={36} strokeWidth={1.3} /><i /><i /><i /></div>
        </div>
        <span className="dashboard-welcome-badge"><ShieldCheck size={15} />{t('ui.overview')}</span>
        <div className="dashboard-welcome-copy">
          <h2>{greeting}</h2>
          <p>{expiring > 0 ? t('ui.review_summary', undefined, { count: expiring }) : t('ui.clear_summary')}</p>
        </div>
      </div>
      {metrics.map(({ label, value, total, detail, icon: Icon, tone, onClick }) => (
        <button type="button" key={tone} onClick={onClick} className={`dashboard-metric dashboard-metric-${tone}`}>
          <span className="dashboard-metric-heading"><span>{label}</span><span className="dashboard-metric-icon"><Icon size={20} strokeWidth={1.7} /></span></span>
          <span className="dashboard-metric-value">{value}<span>{total !== undefined ? `/ ${total}` : t('dashboard.need_notice')}</span></span>
          <span className="dashboard-metric-footer"><span>{detail}</span><ArrowUpRight size={16} className="shrink-0" /></span>
          {total !== undefined && <span className="dashboard-metric-track" aria-hidden="true"><span style={{ width: `${total > 0 ? Math.min(100, value / total * 100) : 0}%` }} /></span>}
        </button>
      ))}
    </section>
  );
}
