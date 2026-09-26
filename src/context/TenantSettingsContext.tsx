import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { useTenant } from './TenantContext';
import { useLanguage } from './LanguageContext';
import {
  defaultTenantSettings,
  formattingLocaleFor,
  getCountryPack,
  getIndustryPack,
  type CommercialDocumentProfile,
  type CounterpartyType,
  type DueDiligenceRequirement,
  type IdentifierScheme,
  type LocalizedText,
  type TenantSettings,
} from '../lib/policy';
import { setActiveFormattingLocale } from '../lib/currencyUtils';

export interface CountryOption {
  code: string;
  name: string;
  region: string;
  defaultCurrency: string;
  timezone: string;
  legalForms: string[];
  identifierSchemes: IdentifierScheme[];
}

export interface IndustryOption {
  key: string;
  name: LocalizedText;
  partnerCategories: string[];
  commercialDocument: CommercialDocumentProfile;
  counterpartyTypes: CounterpartyType[];
  contractCurrency: string | null;
}

export interface TenantPolicyView {
  tenantId: string;
  tenantName: string;
  settings: TenantSettings;
  country: {
    code: string;
    name: string;
    legalForms: string[];
    identifierSchemes: IdentifierScheme[];
    governingLaw: LocalizedText;
    disputeVenue: LocalizedText;
    dataProtectionLaw: string;
    indirectTaxName: string;
    stampDutyConvention: LocalizedText | null;
    weekend: number[];
    callingCode: string;
    formattingLocale: string;
  };
  industry: IndustryOption;
  dueDiligenceChecklist: Array<DueDiligenceRequirement & { disabled?: boolean }>;
}

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface TenantSettingsContextValue {
  status: LoadStatus;
  policy: TenantPolicyView;
  countries: CountryOption[];
  industries: IndustryOption[];
  /** Commercial document profile of the active tenant (e.g. Order Form, Purchase Order). */
  commercialDocument: CommercialDocumentProfile;
  refresh: () => Promise<void>;
  saveSettings: (settings: Partial<TenantSettings>, legalEntity?: string) => Promise<TenantPolicyView>;
}

/** Offline fallback built from bundled packs, used until the server answers. */
function localPolicyView(settings: TenantSettings = defaultTenantSettings()): TenantPolicyView {
  const country = getCountryPack(settings.countryCode);
  const industry = getIndustryPack(settings.industry);
  return {
    tenantId: '',
    tenantName: '',
    settings,
    country: {
      code: country.code,
      name: country.name,
      legalForms: country.legalForms,
      identifierSchemes: country.identifierSchemes,
      governingLaw: country.governingLaw,
      disputeVenue: country.disputeVenue,
      dataProtectionLaw: country.dataProtectionLaw,
      indirectTaxName: country.indirectTaxName,
      stampDutyConvention: country.stampDutyConvention || null,
      weekend: country.weekend,
      callingCode: country.callingCode,
      formattingLocale: country.formattingLocale,
    },
    industry: {
      key: industry.key,
      name: industry.name,
      partnerCategories: industry.partnerCategories,
      commercialDocument: industry.commercialDocument,
      counterpartyTypes: industry.counterpartyTypes,
      contractCurrency: industry.contractCurrency || null,
    },
    dueDiligenceChecklist: [],
  };
}

const TenantSettingsContext = createContext<TenantSettingsContextValue | undefined>(undefined);

export const TenantSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { activeTenantId } = useTenant();
  const { language, setDocumentTerminology } = useLanguage();
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [policy, setPolicy] = useState<TenantPolicyView>(() => localPolicyView());
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [industries, setIndustries] = useState<IndustryOption[]>([]);

  const refresh = useCallback(async () => {
    if (!user) {
      setStatus('idle');
      return;
    }
    setStatus('loading');
    try {
      const [settingsRes, packsRes] = await Promise.all([
        fetch('/api/tenant-settings', { cache: 'no-store' }),
        fetch('/api/policy-packs', { cache: 'no-cache' }),
      ]);
      if (!settingsRes.ok) throw new Error(`HTTP ${settingsRes.status}`);
      setPolicy((await settingsRes.json()) as TenantPolicyView);
      if (packsRes.ok) {
        const packs = await packsRes.json();
        setCountries(Array.isArray(packs.countries) ? packs.countries : []);
        setIndustries(Array.isArray(packs.industries) ? packs.industries : []);
      }
      setStatus('ready');
    } catch (err) {
      console.warn('Failed to load organization settings:', err);
      setStatus('error');
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh, activeTenantId]);

  // UI terminology for commercial documents follows the industry pack.
  const profile = policy.industry.commercialDocument;
  useEffect(() => {
    setDocumentTerminology({ doc: profile.label, docs: profile.plural, docShort: profile.prefix });
  }, [profile.label, profile.plural, profile.prefix, setDocumentTerminology]);

  // Number/date formatting follows the UI language and the tenant's country.
  useEffect(() => {
    setActiveFormattingLocale(formattingLocaleFor(language, policy.settings.countryCode));
  }, [language, policy.settings.countryCode]);

  const saveSettings = useCallback(async (settings: Partial<TenantSettings>, legalEntity?: string) => {
    const res = await fetch('/api/tenant-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings, ...(legalEntity !== undefined ? { legalEntity } : {}) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
    setPolicy(data as TenantPolicyView);
    return data as TenantPolicyView;
  }, []);

  return (
    <TenantSettingsContext.Provider
      value={{
        status,
        policy,
        countries,
        industries,
        commercialDocument: policy.industry.commercialDocument,
        refresh,
        saveSettings,
      }}
    >
      {children}
    </TenantSettingsContext.Provider>
  );
};

export function useTenantSettings(): TenantSettingsContextValue {
  const ctx = useContext(TenantSettingsContext);
  if (!ctx) throw new Error('useTenantSettings must be used within a TenantSettingsProvider');
  return ctx;
}
