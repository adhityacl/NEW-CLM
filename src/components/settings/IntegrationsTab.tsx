import React, { useEffect, useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, CircleSlash, FolderOpen, Info, Loader2, RefreshCw, Save, Sheet } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useIdentity } from '../../context/AuthContext';
import { usePermissions } from '../../lib/permissions';
import { registerDirtyCheck } from '../../lib/unsavedChanges';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { OrgApiError, orgApi, orgPath } from './orgApi';

/** `GET /api/organizations/:id/integrations/google` (PRD §9.2). */
interface IntegrationDto {
  organizationId: string;
  driveFolderId: string | null;
  spreadsheetId: string | null;
  providerConfigured: boolean;
  mappingConfigured: boolean;
  syncSupported: false;
  effectiveAutoSync: false;
  version: number;
}

const RESOURCE_ID = /^[A-Za-z0-9_-]{10,200}$/;
const fieldClass = 'block min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-sm text-slate-900 focus:border-accent focus:outline-none aria-[invalid=true]:border-rose-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';

const Status: React.FC<{ ok: boolean; label: string; okText: string; noText: string }> = ({ ok, label, okText, noText }) => (
  <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
    {ok ? <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" /> : <CircleSlash className="h-5 w-5 text-slate-400" aria-hidden="true" />}
    <div>
      <p className="text-sm font-semibold text-slate-900 dark:text-white">{label}</p>
      <p className="text-sm text-slate-600 dark:text-slate-400">{ok ? okText : noText}</p>
    </div>
  </div>
);

/**
 * Integrations tab (PRD §6.5): this organization's Drive folder and Sheet
 * mapping plus provider availability. No credentials, master resources or
 * provider forms; Google synchronization is honestly marked unavailable.
 */
export const IntegrationsTab: React.FC<{ organizationId: string }> = ({ organizationId }) => {
  const { t } = useLanguage();
  const { identity } = useIdentity();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission('tenant.integration.update');
  const queryClient = useQueryClient();
  const queryKey = ['org-integration', identity?.id, organizationId];
  const query = useQuery<IntegrationDto>({ queryKey, queryFn: ({ signal }) => orgApi(orgPath(organizationId, '/integrations/google'), { signal }), staleTime: 0 });
  const data = query.data;
  const [drive, setDrive] = useState('');
  const [sheet, setSheet] = useState('');
  const [state, setState] = useState<{ kind: 'idle' | 'saving' | 'saved' } | { kind: 'error'; message: string; conflict?: boolean }>({ kind: 'idle' });
  const ids = { drive: useId(), sheet: useId() };

  useEffect(() => {
    if (!data) return;
    setDrive(data.driveFolderId || '');
    setSheet(data.spreadsheetId || '');
  }, [data]);
  const dirty = Boolean(data) && (drive !== (data!.driveFolderId || '') || sheet !== (data!.spreadsheetId || ''));
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => registerDirtyCheck(() => dirtyRef.current), []);

  if (query.isError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
        {t('tb.integration_load_error', 'The integration status could not be loaded.')}
        <Button variant="outline" size="sm" onClick={() => query.refetch()}><RefreshCw className="h-4 w-4" aria-hidden="true" />{t('tb.retry', 'Retry')}</Button>
      </div>
    );
  }
  if (!data) return <div className="space-y-3" aria-busy="true"><Skeleton className="h-20 w-full" /><Skeleton className="h-40 w-full" /></div>;

  const driveValid = !drive.trim() || (RESOURCE_ID.test(drive.trim()) && !drive.startsWith('Folder_'));
  const sheetValid = !sheet.trim() || RESOURCE_ID.test(sheet.trim());

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!driveValid || !sheetValid) return;
    setState({ kind: 'saving' });
    try {
      const next = await orgApi<IntegrationDto>(orgPath(organizationId, '/integrations/google'), {
        method: 'PATCH',
        body: { expectedVersion: data.version, driveFolderId: drive.trim() || null, spreadsheetId: sheet.trim() || null },
      });
      queryClient.setQueryData(queryKey, next);
      setState({ kind: 'saved' });
      window.dispatchEvent(new CustomEvent('organization-updated'));
    } catch (err) {
      const conflict = err instanceof OrgApiError && err.code === 'VERSION_CONFLICT';
      setState({ kind: 'error', conflict, message: conflict ? t('tb.version_conflict', 'Someone else changed these settings. Reload to see the latest version, then reapply your change.') : (err as Error).message });
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section aria-labelledby="integration-status" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 id="integration-status" className="text-base font-semibold text-slate-900 dark:text-white">{t('tb.google_workspace', 'Google Workspace')}</h3>
          <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={`h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} aria-hidden="true" />{t('tb.refresh_status', 'Refresh status')}
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Status ok={data.providerConfigured} label={t('tb.provider_configured', 'Provider configured')}
            okText={t('tb.provider_yes', 'The platform has a Google connection.')} noText={t('tb.provider_no', 'Not configured by the platform administrator.')} />
          <Status ok={data.mappingConfigured} label={t('tb.mapping_configured', 'Resource mapping configured')}
            okText={t('tb.mapping_yes', 'This organization has a folder or sheet mapped. Access is not verified here.')} noText={t('tb.mapping_no', 'No folder or sheet is mapped yet.')} />
        </div>
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t('tb.sync_unavailable', 'Google synchronization is not available in this release. Records are stored in this application; the mapping only tells file uploads where to go.')}
        </p>
      </section>

      <form onSubmit={submit} noValidate aria-busy={state.kind === 'saving'} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <fieldset disabled={!canEdit || state.kind === 'saving'} className="m-0 min-w-0 border-0 p-0">
          <legend className="mb-4 text-base font-semibold text-slate-900 dark:text-white">{t('tb.resource_mapping', 'Resource mapping')}</legend>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor={ids.drive} className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300"><FolderOpen className="h-4 w-4" aria-hidden="true" />{t('tb.drive_folder_id', 'Drive folder ID')}</label>
              <input id={ids.drive} className={fieldClass} value={drive} aria-invalid={!driveValid} aria-describedby={`${ids.drive}-hint`} onChange={(e) => setDrive(e.target.value)} />
              <p id={`${ids.drive}-hint`} className={`mt-1.5 text-xs ${driveValid ? 'text-slate-600 dark:text-slate-400' : 'text-rose-700 dark:text-rose-300'}`}>
                {driveValid ? t('tb.resource_hint', 'The ID from the Google URL, 10–200 letters, digits, - or _. Leave empty to remove.') : t('tb.resource_invalid', 'This is not a valid Google resource ID.')}
              </p>
            </div>
            <div>
              <label htmlFor={ids.sheet} className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300"><Sheet className="h-4 w-4" aria-hidden="true" />{t('tb.sheet_id', 'Spreadsheet ID')}</label>
              <input id={ids.sheet} className={fieldClass} value={sheet} aria-invalid={!sheetValid} aria-describedby={`${ids.sheet}-hint`} onChange={(e) => setSheet(e.target.value)} />
              <p id={`${ids.sheet}-hint`} className={`mt-1.5 text-xs ${sheetValid ? 'text-slate-600 dark:text-slate-400' : 'text-rose-700 dark:text-rose-300'}`}>
                {sheetValid ? t('tb.resource_hint', 'The ID from the Google URL, 10–200 letters, digits, - or _. Leave empty to remove.') : t('tb.resource_invalid', 'This is not a valid Google resource ID.')}
              </p>
            </div>
          </div>
        </fieldset>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button type="submit" disabled={!canEdit || !dirty || !driveValid || !sheetValid || state.kind === 'saving'}>
            {state.kind === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
            {t('tb.save_mapping', 'Save mapping')}
          </Button>
          <div aria-live="polite">{state.kind === 'saved' && <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />{t('tb.saved', 'Saved.')}</p>}</div>
          {state.kind === 'error' && (
            <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-rose-700 dark:text-rose-300">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />{state.message}
              {state.conflict && <Button type="button" variant="outline" size="sm" onClick={() => { void query.refetch(); setState({ kind: 'idle' }); }}><RefreshCw className="h-4 w-4" aria-hidden="true" />{t('tb.reload', 'Reload')}</Button>}
            </div>
          )}
        </div>
      </form>
    </div>
  );
};
