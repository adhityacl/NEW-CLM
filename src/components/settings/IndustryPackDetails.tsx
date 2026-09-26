import React from 'react';
import { BookOpenCheck, Building2, ChevronDown, FileStack, Landmark, ListChecks, Scale, type LucideIcon } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { getCountryPack, getIndustryPack, localize, localizeName } from '../../lib/policy';

interface IndustryPackDetailsProps {
  industryKey: string;
  countryCode: string;
  /** Draft default currency, shown next to the pack's contract-currency convention. */
  defaultCurrency: string;
}

const listClass = 'list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-700 dark:text-slate-300';
const subtleClass = 'text-xs text-slate-600 dark:text-slate-400';
const chipClass =
  'inline-flex items-center rounded-full border border-slate-300 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200';

interface AccordionItemProps {
  icon: LucideIcon;
  title: string;
  /** Short digest shown on the closed row, e.g. "6 documents". */
  summary: string;
  children: React.ReactNode;
}

/** Native <details> keeps keyboard and screen-reader behaviour for free. Module-level so open state survives re-renders. */
const AccordionItem: React.FC<AccordionItemProps> = ({ icon: Icon, title, summary, children }) => (
  <details className="group border-b border-slate-200 last:border-b-0 dark:border-slate-700">
    <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#06C755] dark:hover:bg-slate-800/60 [&::-webkit-details-marker]:hidden">
      <Icon className="h-4 w-4 shrink-0 text-[#06C755]" aria-hidden="true" />
      <span className="min-w-0 flex-1 text-sm font-semibold text-slate-900 dark:text-white">{title}</span>
      <span className="hidden text-xs text-slate-600 sm:inline dark:text-slate-400">{summary}</span>
      <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
    </summary>
    <div className="px-4 pb-4 pt-1 sm:pl-11">
      <p className="mb-2 text-xs text-slate-600 sm:hidden dark:text-slate-400">{summary}</p>
      {children}
    </div>
  </details>
);

/**
 * What the selected industry pack contributes (core documents, due diligence, compliance,
 * counterparties, clause rules, currency & tax), combined with the selected country pack.
 * Reflects the unsaved draft so admins can compare packs before saving.
 */
export const IndustryPackDetails: React.FC<IndustryPackDetailsProps> = ({ industryKey, countryCode, defaultCurrency }) => {
  const { t, language } = useLanguage();
  const industry = getIndustryPack(industryKey);
  const country = getCountryPack(countryCode);
  const regulators = country.regulators?.[industry.key] || [];
  const identifierSchemes = country.identifierSchemes.filter((s) => s.appliesTo.some((type) => industry.counterpartyTypes.includes(type)));
  const counterpartyLabel = {
    organization: t('settings.region.industry_counterparty_organization', 'Badan usaha'),
    individual: t('settings.region.industry_counterparty_individual', 'Perorangan'),
  };

  return (
    <section
      aria-labelledby="industry-pack-details-heading"
      className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <h3 id="industry-pack-details-heading" className="text-base font-semibold text-slate-900 dark:text-white">
        {t('settings.region.industry_details_title', 'Isi industry pack: {name}', { name: localize(industry.name, language) })}
      </h3>
      <p className={`${subtleClass} mb-4 mt-1`}>
        {t(
          'settings.region.industry_details_desc',
          'Dipakai untuk checklist due diligence, kategori mitra, istilah dokumen, identifier pajak, dan review kontrak oleh AI. Regulator mengikuti negara {country}.',
          { country: localizeName(country.name, language) },
        )}
      </p>

      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
        <AccordionItem
          icon={FileStack}
          title={t('settings.region.industry_core_documents', 'Jenis Dokumen Utama (Core Documents)')}
          summary={t('settings.region.industry_summary_documents', '{n} dokumen · {label}', { n: industry.coreDocuments.length, label: industry.commercialDocument.label })}
        >
          <ul className={listClass}>
            {industry.coreDocuments.map((d) => (
              <li key={d.en}>{localize(d, language)}</li>
            ))}
          </ul>
          <p className={`${subtleClass} mt-2`}>
            {t('settings.region.industry_commercial_document', 'Dokumen komersial: {label} ({prefix})', {
              label: industry.commercialDocument.label,
              prefix: industry.commercialDocument.prefix,
            })}
          </p>
        </AccordionItem>

        <AccordionItem
          icon={ListChecks}
          title={t('settings.region.industry_due_diligence', 'Standar Due Diligence & Onboarding')}
          summary={
            industry.dueDiligence.length
              ? t('settings.region.industry_summary_dd', '{n} item · {required} wajib', {
                  n: industry.dueDiligence.length,
                  required: industry.dueDiligence.filter((d) => d.required).length,
                })
              : t('settings.region.industry_summary_dd_none', 'Hanya item inti & negara')
          }
        >
          {industry.dueDiligence.length === 0 ? (
            <p className={subtleClass}>{t('settings.region.industry_due_diligence_none', 'Hanya item inti dan item negara.')}</p>
          ) : (
            <ul className={listClass}>
              {industry.dueDiligence.map((d) => (
                <li key={d.key}>
                  {localize(d.label, language)}
                  {d.required && <span className="ml-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300">({t('settings.region.dd_required', 'Wajib')})</span>}
                  {d.expires && <span className="ml-1.5 text-xs text-slate-600 dark:text-slate-400">· {t('settings.region.industry_expires', 'ada masa berlaku')}</span>}
                </li>
              ))}
            </ul>
          )}
        </AccordionItem>

        <AccordionItem
          icon={Landmark}
          title={t('settings.region.industry_compliance', 'Wajib Regulasi & Standar Compliance')}
          summary={t('settings.region.industry_summary_compliance', '{regulators} regulator · {standards} standar', {
            regulators: regulators.length,
            standards: industry.complianceStandards.length,
          })}
        >
          <p className={`${subtleClass} mb-1`}>
            {t('settings.region.industry_regulators', 'Regulator ({country})', { country: localizeName(country.name, language) })}:{' '}
            <span className="text-slate-800 dark:text-slate-200">
              {regulators.length ? regulators.join(', ') : t('settings.region.industry_regulators_none', 'belum ada regulator khusus di pack negara ini')}
            </span>
          </p>
          <ul className={listClass}>
            {industry.complianceStandards.map((standard) => (
              <li key={standard}>{localizeName(standard, language)}</li>
            ))}
          </ul>
        </AccordionItem>

        <AccordionItem
          icon={Building2}
          title={t('settings.region.industry_entities', 'Tipe Mitra / Pihak Ketiga (Entities)')}
          summary={t('settings.region.industry_summary_entities', '{n} tipe mitra', { n: industry.partnerCategories.length })}
        >
          <ul className="flex flex-wrap gap-1.5" aria-label={t('settings.region.industry_entities', 'Tipe Mitra / Pihak Ketiga (Entities)')}>
            {industry.partnerCategories.map((category) => (
              <li key={category} className={chipClass}>
                {localizeName(category, language)}
              </li>
            ))}
          </ul>
          <p className={`${subtleClass} mt-2`}>
            {t('settings.region.industry_counterparty', 'Jenis pihak lawan: {types}', {
              types: industry.counterpartyTypes.map((type) => counterpartyLabel[type]).join(' & '),
            })}
          </p>
        </AccordionItem>

        <AccordionItem
          icon={Scale}
          title={t('settings.region.industry_clauses', 'Klausul Kritis & Rule Engine Logic')}
          summary={t('settings.region.industry_summary_rules', '{n} aturan', { n: industry.criticalClauses.length })}
        >
          <dl className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-2">
            {industry.criticalClauses.map((c) => (
              <div key={c.clause.en} className="min-w-0">
                <dt className="font-medium text-slate-900 dark:text-slate-100">{localize(c.clause, language)}</dt>
                <dd className="leading-relaxed text-slate-700 dark:text-slate-300">{localize(c.rule, language)}</dd>
              </div>
            ))}
          </dl>
        </AccordionItem>

        <AccordionItem
          icon={BookOpenCheck}
          title={t('settings.region.industry_currency_tax', 'Default Currency & Tax Identifier')}
          summary={`${defaultCurrency} · ${country.indirectTaxName}`}
        >
          <dl className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-3">
            <div>
              <dt className={subtleClass}>{t('settings.region.default_currency', 'Default currency')}</dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100">
                {defaultCurrency}
                {industry.contractCurrency && (
                  <span className="ml-1 font-normal text-slate-600 dark:text-slate-400">
                    {t('settings.region.industry_contract_currency', '(konvensi kontrak industri: {currency})', { currency: industry.contractCurrency })}
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className={subtleClass}>{t('settings.region.industry_indirect_tax', 'Pajak tidak langsung')}</dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100">{country.indirectTaxName}</dd>
            </div>
            <div>
              <dt className={subtleClass}>{t('settings.region.industry_identifiers', 'Identifier pihak lawan')}</dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100">
                {identifierSchemes.length ? identifierSchemes.map((s) => localizeName(s.label, language)).join(' · ') : '—'}
              </dd>
            </div>
          </dl>
          <ul className={`${listClass} mt-3`}>
            {industry.taxConsiderations.map((c) => (
              <li key={c.en}>{localize(c, language)}</li>
            ))}
          </ul>
        </AccordionItem>
      </div>
    </section>
  );
};
