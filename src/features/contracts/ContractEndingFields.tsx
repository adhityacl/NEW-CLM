import { Upload } from 'lucide-react';
import { DateInput } from '../../components/DateInput';
import { useLanguage } from '../../context/LanguageContext';
import type { ContractLifecycleFields } from '../../lib/contractLifecycle';
import { useRef, useState } from 'react';
import { Button } from '../../components/ui/button';
import { openTerminationDocument } from '../../lib/terminationDocument';

export function ContractEndingFields({ terminated, date, endDate, reason, document, fileName, reading,
  onDate, onReason, onFile }: {
  terminated: boolean; date: string; endDate: string; reason: string;
  document?: ContractLifecycleFields['termination_document']; fileName?: string; reading?: boolean;
  onDate: (value: string) => void; onReason: (value: string) => void; onFile: (file: File | undefined) => void;
}) {
  const { t } = useLanguage();
  const [downloadError, setDownloadError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedFileName = fileName || document?.fileName;
  return <section className="space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900 dark:bg-emerald-950/20" aria-label={t(terminated ? 'termination.details' : 'termination.expired_details')}>
    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{t(terminated ? 'termination.details' : 'termination.expired_details')}</h3>
    <div>
      <label htmlFor="contract-ending-date" className="mb-1.5 block text-sm font-bold text-slate-700 dark:text-slate-300">{t(terminated ? 'termination.date' : 'termination.end_date')}{terminated && ' *'}</label>
      <DateInput id="contract-ending-date" value={terminated ? date : endDate} onChange={onDate} required={terminated} disabled={!terminated} focusColor="emerald" />
      {!terminated && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('termination.end_date_hint')}</p>}
    </div>
    <div>
      <label htmlFor="contract-termination-document" className="mb-1.5 block text-sm font-bold text-slate-700 dark:text-slate-300">{t('termination.document')}</label>
      <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-white/70 p-4 text-center dark:border-slate-700 dark:bg-slate-800/40">
        <Upload aria-hidden="true" className="mx-auto mb-2 size-6 text-accent-text" />
        <p className="mb-3 break-all text-sm text-slate-700 dark:text-slate-200">{fileName || document?.fileName || t('termination.choose_document')}</p>
        <input ref={fileInputRef} id="contract-termination-document" type="file" accept=".pdf,.doc,.docx" disabled={reading} tabIndex={-1}
          onChange={event => onFile(event.target.files?.[0])} className="sr-only" />
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button type="button" disabled={reading} onClick={() => fileInputRef.current?.click()}
            className="min-h-11 shrink-0 rounded-xl border-0 bg-accent-soft px-3.5 text-sm font-bold text-accent-text hover:bg-accent-soft/80 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-950">
            {t('termination.choose_file')}
          </Button>
          <span aria-live="polite" className="min-w-0 max-w-full break-all text-sm text-slate-500 dark:text-slate-400">
            {selectedFileName || t('termination.no_file')}
          </span>
        </div>
        {document && <Button type="button" variant="link" className="mt-2 min-h-11" onClick={async () => {
          try { await openTerminationDocument(document); setDownloadError(false); }
          catch { setDownloadError(true); }
        }}>{t('termination.saved_document')}: {document.fileName}</Button>}
        {downloadError && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">{t('termination.file_open_error')}</p>}
      </div>
    </div>
    <div>
      <label htmlFor="contract-termination-reason" className="mb-1.5 block text-sm font-bold text-slate-700 dark:text-slate-300">{t('termination.reason')}</label>
      <textarea id="contract-termination-reason" rows={3} value={reason} onChange={event => onReason(event.target.value)} maxLength={10000}
        className="w-full resize-y rounded-xl border border-hairline bg-white px-3.5 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
    </div>
  </section>;
}
