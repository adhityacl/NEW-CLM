import React, { useEffect, useId, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Globe2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useTenantSettings } from '../../context/TenantSettingsContext';
import { usePermissions } from '../../lib/permissions';
import { SUPPORTED_CURRENCIES } from '../../lib/currencyUtils';
import { buildDueDiligenceChecklist, localize, type TenantSettings } from '../../lib/policy';
import { DueDiligenceChecklistEditor } from './DueDiligenceChecklistEditor';

type SaveStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string };

function timezoneOptions(extra: string[]): string[] {
  let all: string[] = [];
  try {
    all = (Intl as any).supportedValuesOf?.('timeZone') || [];
  } catch {
    all = [];
  }
  return Array.from(new Set([...extra, 'UTC', ...all])).sort();
}

const fieldClass =
  'block min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-5 text-slate-900 focus:border-[#06C755] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';
const labelClass = 'mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300';
const hintClass = 'mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400';
const sectionClass = 'min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900';
/**
 * A native `<legend>` renders flush with its `<fieldset>`'s own border-box
 * top edge, ignoring the fieldset's padding — so a legend inside a
 * card-styled (bordered, rounded) fieldset visually sits on top of the
 * card's border instead of inside it. The fix: keep the visible "card"
 * (border/rounded/background/padding/shadow) on an inner `<div>` instead of
 * the `<fieldset>` itself, and reset the fieldset to an invisible wrapper.
 * `<legend>` stays the fieldset's first child (required for the accessible
 * group name) but now renders as a plain heading above the card, with no
 * border underneath it to overlap. `disabled` on the fieldset still
 * propagates to every descendant control regardless of this nesting.
 */
const fieldsetResetClass = 'min-w-0 border-0 p-0 m-0';
const legendClass = 'sr-only';
const sectionHeadingClass = 'mb-4 text-base font-semibold text-slate-900 dark:text-white';

/**
 * Organization & region settings (PRD §2.1, §3.3.5): country and industry
 * packs, language, time zone, currencies, lifecycle windows, reminders,
 * contract defaults, modules and the due-diligence checklist.
 */
export const OrganizationRegionSettings: React.FC = () => {
  const { t, language } = useLanguage();
  const { policy, countries, industries, status, saveSettings } = useTenantSettings();
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission('admin.access');
  const [draft, setDraft] = useState<TenantSettings>(policy.settings);
  const [remindersText, setRemindersText] = useState(policy.settings.reminderOffsetsDays.join(', '));
  const [save, setSave] = useState<SaveStatus>({ kind: 'idle' });
  const ids = {
    country: useId(), industry: useId(), language: useId(), timezone: useId(), tzList: useId(),
    currency: useId(), reporting: useId(), expiry: useId(), reminders: useId(), remindersHint: useId(),
    law: useId(), venue: useId(), error: useId(),
  };

  // Re-sync the form when another tenant is selected or after saving.
  useEffect(() => {
    setDraft(policy.settings);
    setRemindersText(policy.settings.reminderOffsetsDays.join(', '));
  }, [policy]);

  // Base pack items for the draft country/industry, before tenant overrides.
  const packChecklist = useMemo(
    () => buildDueDiligenceChecklist({ ...draft, ddOverrides: {}, customDueDiligence: [] }, { includeDisabled: true }),
    [draft.countryCode, draft.industry],
  );
  const tzOptions = useMemo(() => timezoneOptions(countries.map((c) => c.timezone)), [countries]);
  const selectedCountry = countries.find((c) => c.code === draft.countryCode);
  const packLaw = localize(policy.country.governingLaw, language);
  const packVenue = localize(policy.country.disputeVenue, language);
  const remindersValid = remindersText.split(',').map((v) => v.trim()).filter(Boolean).every((v) => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 730);

  const update = <K extends keyof TenantSettings>(key: K, value: TenantSettings[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setSave({ kind: 'idle' });
  };

  const onCountryChange = (code: string) => {
    const pack = countries.find((c) => c.code === code);
    // Changing country proposes that country's currency and time zone.
    setDraft((prev) => ({
      ...prev,
      countryCode: code,
      defaultCurrency: pack?.defaultCurrency || prev.defaultCurrency,
      timezone: pack?.timezone || prev.timezone,
      governingLaw: undefined,
      disputeVenue: undefined,
    }));
    setSave({ kind: 'idle' });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!remindersValid) {
      setSave({ kind: 'error', message: t('settings.region.invalid_reminders', 'Enter reminder days as whole numbers between 1 and 730.') });
      return;
    }
    setSave({ kind: 'saving' });
    try {
      await saveSettings({
        ...draft,
        reminderOffsetsDays: remindersText.split(',').map((v) => Number(v.trim())).filter((n) => n > 0),
      });
      setSave({ kind: 'saved' });
    } catch (err: any) {
      setSave({ kind: 'error', message: err?.message || String(err) });
    }
  };

  if (status === 'error') {
    return (
      <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
        {t('settings.region.load_error', 'Organization settings could not be loaded.')}
      </p>
    );
  }

  const moduleRows: Array<{ key: keyof TenantSettings['modules']; label: string }> = [
    { key: 'commercialDocuments', label: t('settings.region.module_commercial', '{docs}') },
    { key: 'spending', label: t('settings.region.module_spending', 'Partner spending & invoices') },
    { key: 'evaluation', label: t('settings.region.module_evaluation', 'Partner evaluation') },
    { key: 'aiAssistant', label: t('settings.region.module_ai', 'AI assistant, document parsing and contract review') },
    { key: 'newsTicker', label: t('settings.region.module_news', 'Regulatory news ticker (uses AI)') },
  ];

  return (
    <form onSubmit={submit} noValidate aria-busy={save.kind === 'saving' || status === 'loading'} className="flex min-w-0 flex-col gap-6">
      <div className={sectionClass}>
        <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
          <Globe2 className="h-5 w-5 text-[#06C755]" aria-hidden="true" />
          {t('settings.region.title', 'Organization & region')}
        </h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {t('settings.region.subtitle', 'These settings drive due-diligence checklists, currencies, dates, reminders, contract templates and AI prompts for {org}.', { org: policy.tenantName || '—' })}
        </p>
        {!canEdit && <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">{t('settings.region.admin_only', 'Only administrators can change organization settings.')}</p>}
      </div>

      <fieldset className={fieldsetResetClass} disabled={!canEdit}>
        <legend className={legendClass}>{t('settings.region.profile', 'Profile')}</legend>
        <div className={sectionClass}>
          <h3 className={sectionHeadingClass}>{t('settings.region.profile', 'Profile')}</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor={ids.country} className={labelClass}>{t('settings.region.country', 'Country / jurisdiction pack')}</label>
              <select id={ids.country} className={fieldClass} value={draft.countryCode} onChange={(e) => onCountryChange(e.target.value)}>
                {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={ids.industry} className={labelClass}>{t('settings.region.industry', 'Industry pack')}</label>
              <select id={ids.industry} className={fieldClass} value={draft.industry} onChange={(e) => update('industry', e.target.value as TenantSettings['industry'])}>
                {industries.map((i) => <option key={i.key} value={i.key}>{localize(i.name, language)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={ids.language} className={labelClass}>{t('settings.region.language', 'Default language for e-mails and AI answers')}</label>
              <select id={ids.language} className={fieldClass} value={draft.language} onChange={(e) => update('language', e.target.value as 'EN' | 'ID')}>
                <option value="EN">English</option>
                <option value="ID">Bahasa Indonesia</option>
              </select>
            </div>
            <div>
              <label htmlFor={ids.timezone} className={labelClass}>{t('settings.region.timezone', 'Time zone')}</label>
              <input id={ids.timezone} list={ids.tzList} className={fieldClass} value={draft.timezone} onChange={(e) => update('timezone', e.target.value)} aria-describedby={`${ids.timezone}-hint`} />
              <datalist id={ids.tzList}>{tzOptions.map((tz) => <option key={tz} value={tz} />)}</datalist>
              <p id={`${ids.timezone}-hint`} className={hintClass}>{t('settings.region.timezone_hint', 'IANA name, e.g. Asia/Singapore. Deadlines are calculated in this time zone.')}</p>
            </div>
            <div>
              <label htmlFor={ids.currency} className={labelClass}>{t('settings.region.default_currency', 'Default currency')}</label>
              <select id={ids.currency} className={fieldClass} value={draft.defaultCurrency} onChange={(e) => update('defaultCurrency', e.target.value)}>
                {SUPPORTED_CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={ids.reporting} className={labelClass}>{t('settings.region.reporting_currency', 'Reporting currency')}</label>
              <select id={ids.reporting} className={fieldClass} value={draft.reportingCurrency} onChange={(e) => update('reportingCurrency', e.target.value)}>
                {SUPPORTED_CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
              </select>
            </div>
          </div>
          {selectedCountry && (
            <p className={`${hintClass} mt-3`}>
              {selectedCountry.identifierSchemes.map((s) => s.label).join(' · ')}
            </p>
          )}
        </div>
      </fieldset>

      <fieldset className={fieldsetResetClass} disabled={!canEdit}>
        <legend className={legendClass}>{t('settings.region.lifecycle', 'Lifecycle & reminders')}</legend>
        <div className={sectionClass}>
          <h3 className={sectionHeadingClass}>{t('settings.region.lifecycle', 'Lifecycle & reminders')}</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor={ids.expiry} className={labelClass}>{t('settings.region.expiry_days', 'Mark as "expiring soon" when this many days remain')}</label>
              <input id={ids.expiry} type="number" min={1} max={730} className={fieldClass} value={draft.expiryWarningDays} onChange={(e) => update('expiryWarningDays', Number(e.target.value) || 1)} />
            </div>
            <div>
              <label htmlFor={ids.reminders} className={labelClass}>{t('settings.region.reminders', 'Send reminders this many days before expiry')}</label>
              <input
                id={ids.reminders}
                className={fieldClass}
                value={remindersText}
                inputMode="numeric"
                onChange={(e) => { setRemindersText(e.target.value); setSave({ kind: 'idle' }); }}
                aria-invalid={!remindersValid}
                aria-describedby={ids.remindersHint}
              />
              <p id={ids.remindersHint} className={hintClass}>{t('settings.region.reminders_hint', 'Comma separated, e.g. 90, 60, 30, 14')}</p>
            </div>
          </div>
        </div>
      </fieldset>

      <fieldset className={fieldsetResetClass} disabled={!canEdit}>
        <legend className={legendClass}>{t('settings.region.legal_defaults', 'Contract defaults')}</legend>
        <div className={sectionClass}>
          <h3 className={sectionHeadingClass}>{t('settings.region.legal_defaults', 'Contract defaults')}</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor={ids.law} className={labelClass}>{t('settings.region.governing_law', 'Governing law')}</label>
              <input id={ids.law} className={fieldClass} value={draft.governingLaw || ''} placeholder={packLaw} onChange={(e) => update('governingLaw', e.target.value || undefined)} aria-describedby={`${ids.law}-hint`} />
              <p id={`${ids.law}-hint`} className={hintClass}>{t('settings.region.pack_default', 'Pack default: {value}', { value: packLaw })}</p>
            </div>
            <div>
              <label htmlFor={ids.venue} className={labelClass}>{t('settings.region.dispute_venue', 'Dispute resolution forum')}</label>
              <input id={ids.venue} className={fieldClass} value={draft.disputeVenue || ''} placeholder={packVenue} onChange={(e) => update('disputeVenue', e.target.value || undefined)} aria-describedby={`${ids.venue}-hint`} />
              <p id={`${ids.venue}-hint`} className={hintClass}>{t('settings.region.pack_default', 'Pack default: {value}', { value: packVenue })}</p>
            </div>
          </div>
        </div>
      </fieldset>

      <fieldset className={fieldsetResetClass} disabled={!canEdit}>
        <legend className={legendClass}>{t('settings.region.modules', 'Modules')}</legend>
        <div className={sectionClass}>
          <h3 className={sectionHeadingClass}>{t('settings.region.modules', 'Modules')}</h3>
          <div className="grid gap-1 md:grid-cols-2">
            {moduleRows.map((row) => (
              <label key={row.key} className="inline-flex min-h-11 items-center gap-3 text-sm text-slate-800 dark:text-slate-200">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={draft.modules[row.key]}
                  onChange={(e) => update('modules', { ...draft.modules, [row.key]: e.target.checked })}
                />
                {row.label}
              </label>
            ))}
          </div>
        </div>
      </fieldset>

      <fieldset className={fieldsetResetClass} disabled={!canEdit}>
        <legend className={legendClass}>{t('settings.region.dd_title', 'Due-diligence checklist')}</legend>
        <div className={sectionClass}>
          <h3 className={sectionHeadingClass}>{t('settings.region.dd_title', 'Due-diligence checklist')}</h3>
          <p className={`${hintClass.replace('mt-1.5', 'mt-0')} mb-2`}>{t('settings.region.dd_desc', 'Items come from the core, country and industry packs. Mark items as required or hide them, and add your own.')}</p>
          <DueDiligenceChecklistEditor
            packItems={packChecklist}
            overrides={draft.ddOverrides}
            customItems={draft.customDueDiligence}
            disabled={!canEdit}
            onChange={({ overrides, customItems }) => setDraft((prev) => ({ ...prev, ddOverrides: overrides, customDueDiligence: customItems }))}
          />
        </div>
      </fieldset>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={!canEdit || save.kind === 'saving'}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#06C755] px-5 text-sm font-bold text-white hover:bg-[#05b34c] disabled:opacity-60"
        >
          {save.kind === 'saving' ? t('common.saving', 'Saving…') : t('settings.region.save', 'Save organization settings')}
        </button>
        <div aria-live="polite">
          {save.kind === 'saved' && (
            <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {t('settings.region.saved', 'Organization settings saved. Checklists and statuses were recalculated.')}
            </p>
          )}
        </div>
        {save.kind === 'error' && (
          <p id={ids.error} role="alert" className="flex items-center gap-2 text-sm text-rose-700 dark:text-rose-300">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            {save.message}
          </p>
        )}
      </div>
    </form>
  );
};
