import React, { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { formatDateTime, formatRelativeTime } from '../../lib/documentModel';

interface RelativeTimeProps {
  iso: string;
  className?: string;
}

/** "2 minutes ago", refreshed every 30s; the absolute time is in the tooltip. */
export const RelativeTime: React.FC<RelativeTimeProps> = ({ iso, className }) => {
  const { language } = useLanguage();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return (
    <time dateTime={iso} title={formatDateTime(iso, language)} className={className}>
      {formatRelativeTime(iso, language, now)}
    </time>
  );
};
