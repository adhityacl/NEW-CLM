import React, { useCallback, useEffect, useState } from 'react';
import { Database, Download, Loader2, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';
import { Button, buttonVariants } from '@legalio/ui-components/button';
import { Input } from '@legalio/ui-components/input';
import { Card, CardContent, CardHeader, CardTitle } from '@legalio/ui-components/card';
import { ModalFrame, ModalTitle } from './ui/modal-frame';
import { useLanguage } from '../context/LanguageContext';
import { useConfirm } from '../context/ConfirmDialogContext';

interface Backup { id: string; createdAt: string; status: 'success' | 'failed'; sizeBytes: number; purpose: 'manual' | 'safety'; }
async function request(path = '', body?: unknown) {
  const res = await fetch(`/api/auth-console/backups${path}`, { credentials: 'include', cache: 'no-store', method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error);
  return data;
}
export function SQLiteBackupsPanel() {
  const { t, language } = useLanguage();
  const confirm = useConfirm();
  const [backups, setBackups] = useState<Backup[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<Backup | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [restoring, setRestoring] = useState(false);
  const refresh = useCallback(async () => {
    try { setBackups((await request()).backups); setError(''); }
    catch (err) { setError((err as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  async function create() {
    if (!(await confirm({ title: t('backup.create', 'Back up now'), description: t('backup.pause', 'Application requests will pause briefly while SQLite and uploaded documents are backed up.') }))) return;
    setBusy(true); setError(''); setMessage('');
    try { await request('', {}); await refresh(); setMessage(t('backup.created', 'Backup created successfully.')); }
    catch (err) { await refresh(); setError((err as Error).message); }
    finally { setBusy(false); }
  }
  async function restore() {
    if (!selected || confirmation !== 'RESTORE') return;
    setBusy(true); setError('');
    try {
      await request(`/${selected.id}/restore`, { confirmation });
      setSelected(null); setRestoring(true);
      setMessage(t('backup.restart', 'Restore prepared and safety backup created. The backend is restarting. If it is managed manually, start it again. Sign in again after restart.'));
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  const locale = language === 'ID' ? 'id-ID' : language === 'ZH' ? 'zh-CN' : 'en-US';
  return <div className="space-y-5">
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
        <CardTitle className="flex items-center gap-3"><Database className="h-5 w-5 text-accent-text" />{t('backup.title', 'Backup & Restore')}</CardTitle>
        <div className="flex gap-2"><Button variant="outline" disabled={busy || restoring} onClick={() => void refresh()} aria-label={t('backup.refresh', 'Refresh backups')}><RefreshCw className="h-4 w-4" /></Button><Button disabled={busy || restoring} onClick={() => void create()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}{t('backup.create', 'Back up now')}</Button></div>
      </CardHeader>
      <CardContent className="space-y-3"><p className="text-sm text-ink-soft">{t('backup.description', 'Full platform backup: SQLite, all organizations, accounts, settings and uploaded documents.')}</p><p className="flex items-start gap-2 text-sm text-ink-soft"><ShieldCheck className="h-5 w-5 shrink-0 text-accent-text" />{t('backup.storage', 'Backups are stored on this server. Download a copy and keep it securely outside the server. Backups contain sensitive data and are not encrypted.')}</p></CardContent>
    </Card>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</p>}
    {message && <p role="status" className="rounded-xl border border-hairline bg-surface p-4 text-sm text-ink">{message}{restoring && <a href="/sys?tab=admin-system-backups" className="ml-2 underline">{t('backup.reopen', 'Open console again')}</a>}</p>}
    <div className="overflow-x-auto rounded-2xl border border-hairline bg-surface shadow-sm">
      <table className="w-full text-left text-sm"><thead className="border-b border-hairline bg-surface-2 text-ink-soft"><tr>{['date', 'type', 'size', 'status', 'actions'].map((key) => <th key={key} className="px-5 py-4 font-semibold">{t(`backup.${key}`)}</th>)}</tr></thead><tbody className="divide-y divide-hairline">
        {loading ? <tr><td colSpan={5} className="p-6 text-center" role="status">{t('sys.loading', 'Loading…')}</td></tr> : !backups.length ? <tr><td colSpan={5} className="p-8 text-center text-ink-soft">{t('backup.empty', 'No backups yet.')}</td></tr> : backups.map((backup) => <tr key={backup.id}>
          <td className="px-5 py-5"><div>{new Date(backup.createdAt).toLocaleString(locale)}</div><div className="mt-1 font-mono text-xs text-ink-soft">{backup.id.slice(0, 8)}</div></td>
          <td className="px-5 py-5">{t(`backup.${backup.purpose}`)}</td><td className="px-5 py-5">{(backup.sizeBytes / 1024 / 1024).toFixed(2)} MB</td><td className="px-5 py-5">{t(`backup.${backup.status}`)}</td>
          <td className="px-5 py-5"><div className="flex items-center gap-2">{backup.status === 'success' && <><a className={buttonVariants('outline')} href={`/api/auth-console/backups/${backup.id}/download`} aria-disabled={busy || restoring} onClick={(event) => { if (busy || restoring) event.preventDefault(); }}><Download className="mr-2 h-4 w-4" />{t('backup.download', 'Download')}</a><Button variant="outline" disabled={busy || restoring} onClick={() => { setSelected(backup); setConfirmation(''); }}><RotateCcw className="mr-2 h-4 w-4" />{t('backup.restore', 'Restore')}</Button></>}</div></td>
        </tr>)}
      </tbody></table>
    </div>
    <>{selected && <ModalFrame onClose={() => { if (!busy) setSelected(null); }} className="max-w-lg"><div className="space-y-4 overflow-y-auto p-6"><ModalTitle className="text-xl font-semibold">{t('backup.restore', 'Restore')}</ModalTitle><p className="text-sm text-ink-soft">{t('backup.warning', 'This replaces the entire platform database and uploaded documents with the selected backup. A safety backup is created first. The backend stops and must restart; all users must sign in again using the restored accounts.')}</p>
      <p className="text-sm text-ink-soft">{selected && new Date(selected.createdAt).toLocaleString(locale)}</p>
      <label htmlFor="restore-confirmation" className="text-sm font-medium">{t('backup.confirm', 'Type RESTORE to confirm')}</label><Input id="restore-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={busy} autoComplete="off" />
      <div className="flex justify-end gap-3"><Button variant="outline" disabled={busy} onClick={() => setSelected(null)}>{t('backup.cancel', 'Cancel')}</Button><Button variant="destructive" disabled={busy || confirmation !== 'RESTORE'} onClick={() => void restore()}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('backup.restore', 'Restore')}</Button></div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div></ModalFrame>}</>
  </div>;
}
