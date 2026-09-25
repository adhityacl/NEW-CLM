import React, { useEffect, useState } from 'react';
import { Eye, GitCompare, History, RefreshCw, RotateCcw, Tag } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useAlertToast } from '../../context/AlertToastContext';
import { documentsApi, errorMessage } from '../../lib/documentsApi';
import { formatBytes, type DraftVersion } from '../../lib/documentModel';
import { RelativeTime } from './RelativeTime';
import { INPUT_CLASS } from './documentLabels';

interface DraftHistoryPanelProps {
  documentId: string | null;
  currentVersion: number | null;
  /** Bumped by the editor after every save so the list stays current. */
  refreshKey: number;
  canEdit: boolean;
  viewingVersion: number | null;
  onView: (version: number) => void;
  onCompare: (version: number) => void;
  onRestore: (version: number) => void;
}

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; drafts: DraftVersion[] };

const ACTION_BUTTON =
  'inline-flex items-center gap-1 px-2 min-h-11 sm:min-h-7 rounded-lg text-[10px] font-bold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer';

export const DraftHistoryPanel: React.FC<DraftHistoryPanelProps> = ({
  documentId,
  currentVersion,
  refreshKey,
  canEdit,
  viewingVersion,
  onView,
  onCompare,
  onRestore,
}) => {
  const { t } = useLanguage();
  const showAlert = useAlertToast();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<{ version: number; name: string; labels: string } | null>(null);

  useEffect(() => {
    if (!documentId) return;
    let cancelled = false;
    documentsApi
      .listDrafts(documentId)
      .then((drafts) => !cancelled && setState({ status: 'ready', drafts }))
      .catch((err) => !cancelled && setState({ status: 'error', message: errorMessage(err) }));
    return () => {
      cancelled = true;
    };
  }, [documentId, refreshKey, reloadKey]);

  if (!documentId) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400 p-3 border border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
        {t('documents.history.unsaved', 'Dokumen ini belum disimpan. Riwayat versi muncul setelah penyimpanan pertama (otomatis tiap 30 detik setelah ada perubahan).')}
      </p>
    );
  }

  const saveLabel = async () => {
    if (!editing) return;
    try {
      await documentsApi.updateDraft(documentId, editing.version, {
        draft_name: editing.name,
        labels: editing.labels.split(',').map((l) => l.trim()).filter(Boolean),
      });
      setEditing(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      showAlert({ title: t('documents.msg.action_failed', 'Aksi gagal'), description: errorMessage(err), variant: 'destructive' });
    }
  };

  const kindLabel = (draft: DraftVersion) =>
    draft.save_kind === 'restore'
      ? t('documents.history.kind_restore', 'Dipulihkan dari v{v}', { v: draft.restored_from ?? '?' })
      : draft.save_kind === 'auto'
        ? t('documents.history.kind_auto', 'Simpan otomatis')
        : t('documents.history.kind_manual', 'Simpan manual');

  return (
    <section className="space-y-2" aria-labelledby="draft-history-heading" aria-busy={state.status === 'loading'}>
      <h3 id="draft-history-heading" className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
        <History className="w-3.5 h-3.5 text-slate-400" aria-hidden />
        {t('documents.history.title', 'Riwayat Draf')}
      </h3>

      {state.status === 'loading' && (
        <div role="status" className="space-y-2">
          <span className="sr-only">{t('common.loading', 'Memuat…')}</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse motion-reduce:animate-none" />
          ))}
        </div>
      )}

      {state.status === 'error' && (
        <div role="alert" className="text-xs text-rose-700 dark:text-rose-300 space-y-2">
          <p>{state.message}</p>
          <button type="button" onClick={() => setReloadKey((k) => k + 1)} className={ACTION_BUTTON}>
            <RefreshCw className="w-3 h-3" aria-hidden /> {t('common.retry', 'Coba lagi')}
          </button>
        </div>
      )}

      {state.status === 'ready' && (
        <ol className="space-y-2">
          {state.drafts.map((draft) => {
            const isCurrent = draft.version_number === currentVersion;
            const isViewing = draft.version_number === viewingVersion;
            return (
              <li
                key={draft.version_number}
                className={`p-2.5 rounded-lg border text-xs space-y-1.5 ${
                  isViewing
                    ? 'border-blue-400 bg-blue-50/60 dark:border-blue-600 dark:bg-blue-950/30'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900 dark:text-white">
                    {t('documents.history.version', 'Versi {v}', { v: draft.version_number })}
                    {draft.draft_name && <span className="font-semibold text-emerald-700 dark:text-emerald-400"> · {draft.draft_name}</span>}
                  </span>
                  {isCurrent && (
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      {t('documents.history.current', 'Terkini')}
                    </span>
                  )}
                </div>
                {draft.labels.length > 0 && (
                  <ul className="flex flex-wrap gap-1" aria-label={t('documents.history.labels', 'Label')}>
                    {draft.labels.map((label) => (
                      <li key={label} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full border border-emerald-300 text-emerald-800 dark:border-emerald-700 dark:text-emerald-300">
                        {label}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  {kindLabel(draft)} · {draft.saved_by_name || '—'} · <RelativeTime iso={draft.saved_at} /> · {formatBytes(draft.file_size)}
                </p>

                {editing?.version === draft.version_number ? (
                  <form
                    className="space-y-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveLabel();
                    }}
                  >
                    <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                      {t('documents.history.name_label', 'Nama versi')}
                      <input
                        autoFocus
                        value={editing.name}
                        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                        placeholder="final-before-signature"
                        className={INPUT_CLASS}
                      />
                    </label>
                    <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                      {t('documents.history.labels_label', 'Label (pisahkan dengan koma)')}
                      <input
                        value={editing.labels}
                        onChange={(e) => setEditing({ ...editing, labels: e.target.value })}
                        placeholder="Legal Review, CFO Approved"
                        className={INPUT_CLASS}
                      />
                    </label>
                    <div className="flex gap-1">
                      <button type="submit" className={`${ACTION_BUTTON} bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700`}>
                        {t('common.save', 'Simpan')}
                      </button>
                      <button type="button" onClick={() => setEditing(null)} className={ACTION_BUTTON}>
                        {t('common.cancel', 'Batal')}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    <button type="button" onClick={() => onView(draft.version_number)} className={ACTION_BUTTON} aria-pressed={isViewing}>
                      <Eye className="w-3 h-3" aria-hidden /> {t('documents.history.view', 'Lihat')}
                    </button>
                    <button type="button" onClick={() => onCompare(draft.version_number)} className={ACTION_BUTTON}>
                      <GitCompare className="w-3 h-3" aria-hidden /> {t('documents.history.compare', 'Bandingkan')}
                    </button>
                    {canEdit && !isCurrent && (
                      <button type="button" onClick={() => onRestore(draft.version_number)} className={ACTION_BUTTON}>
                        <RotateCcw className="w-3 h-3" aria-hidden /> {t('documents.history.restore', 'Pulihkan')}
                      </button>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditing({ version: draft.version_number, name: draft.draft_name || '', labels: draft.labels.join(', ') })
                        }
                        className={ACTION_BUTTON}
                      >
                        <Tag className="w-3 h-3" aria-hidden /> {t('documents.history.name_action', 'Beri nama')}
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
};
