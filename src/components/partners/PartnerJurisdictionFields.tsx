import React, { useId } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useTenantSettings } from '../../context/TenantSettingsContext';
import type { PartyIdentifier } from '../../types';

export interface PartnerJurisdictionFieldsProps {
  country: string;
  entityType: string;
  identifiers: PartyIdentifier[];
  onCountryChange: (code: string) => void;
  onEntityTypeChange: (value: string) => void;
  onIdentifiersChange: (next: PartyIdentifier[]) => void;
}

const fieldClass =
  'block min-h-11 w-full bg-[#F7F8FA] dark:bg-slate-800 border border-[#E5E8EB] dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs leading-5 text-slate-900 dark:text-slate-100 font-medium focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-[#06C755] focus:ring-2 focus:ring-[#06C755]/20';
const labelClass = 'block font-bold text-slate-700 dark:text-slate-300 mb-1.5 text-xs';

/**
 * Country of incorporation, legal form and identifiers for a counterparty
 * (PRD §3.2.2). Identifier types and legal forms come from the selected
 * country's policy pack; values are stored as entered.
 */
export const PartnerJurisdictionFields: React.FC<PartnerJurisdictionFieldsProps> = ({
  country,
  entityType,
  identifiers,
  onCountryChange,
  onEntityTypeChange,
  onIdentifiersChange,
}) => {
  const { t } = useLanguage();
  const { countries } = useTenantSettings();
  const countryId = useId();
  const entityId = useId();
  const formsListId = useId();
  const pack = countries.find((c) => c.code === country);
  const schemes = (pack?.identifierSchemes || []).filter((s) => s.appliesTo.includes('organization'));

  const updateIdentifier = (index: number, patch: Partial<PartyIdentifier>) => {
    onIdentifiersChange(identifiers.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const addIdentifier = () => {
    const used = new Set(identifiers.map((i) => i.scheme));
    const next = schemes.find((s) => !used.has(s.key));
    onIdentifiersChange([...identifiers, { scheme: next?.key || 'other', value: '', country: country || '' }]);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={countryId} className={labelClass}>{t('form.partner.country', 'Country of incorporation')}</label>
          <select id={countryId} className={`${fieldClass} cursor-pointer`} value={country} onChange={(e) => onCountryChange(e.target.value)}>
            <option value="">{t('form.partner.country_unknown', 'Unknown / not stated')}</option>
            {countries.filter((c) => c.code !== 'INTL').map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={entityId} className={labelClass}>{t('form.partner.entity_type', 'Legal form')}</label>
          <input
            id={entityId}
            list={formsListId}
            className={fieldClass}
            value={entityType}
            placeholder={t('form.partner.entity_type_ph', 'e.g. Private Limited, Sendirian Berhad')}
            onChange={(e) => onEntityTypeChange(e.target.value)}
          />
          <datalist id={formsListId}>
            {(pack?.legalForms || []).map((form) => <option key={form} value={form} />)}
          </datalist>
        </div>
      </div>

      <fieldset>
        <legend className={labelClass}>{t('form.partner.identifiers', 'Registration & tax identifiers')}</legend>
        <p className="mb-2 text-xs text-slate-600 dark:text-slate-400">
          {t('form.partner.identifiers_hint', 'Stored as entered. Format hints come from the selected country pack.')}
        </p>
        <ul className="space-y-2">
          {identifiers.map((item, index) => {
            const scheme = schemes.find((s) => s.key === item.scheme);
            const schemeLabel = scheme?.label || t('form.partner.identifier_other', 'Other identifier');
            return (
              <li key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <select
                  aria-label={t('form.partner.identifier_scheme', 'Identifier type')}
                  className={`${fieldClass} cursor-pointer`}
                  value={item.scheme}
                  onChange={(e) => updateIdentifier(index, { scheme: e.target.value })}
                >
                  {schemes.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  <option value="other">{t('form.partner.identifier_other', 'Other identifier')}</option>
                </select>
                <input
                  aria-label={`${t('form.partner.identifier_value', 'Identifier value')}: ${schemeLabel}`}
                  className={fieldClass}
                  value={item.value}
                  placeholder={scheme?.example || ''}
                  onChange={(e) => updateIdentifier(index, { value: e.target.value, country: item.country || country })}
                />
                <button
                  type="button"
                  onClick={() => onIdentifiersChange(identifiers.filter((_, i) => i !== index))}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                  aria-label={`${t('form.partner.identifier_remove', 'Remove identifier')}: ${schemeLabel}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={addIdentifier}
          className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('form.partner.identifier_add', 'Add identifier')}
        </button>
      </fieldset>
    </div>
  );
};
