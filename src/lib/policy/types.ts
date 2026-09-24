/**
 * Policy pack contracts (PRD §2.1, §4.2).
 *
 * Core code must never hardcode a country, currency, regulator, or industry
 * vocabulary. Anything that differs between jurisdictions or industries is
 * described here as data and resolved per tenant at runtime.
 */

export type IndustryKey =
  | 'general'
  | 'financial_services'
  | 'technology'
  | 'healthcare'
  | 'manufacturing'
  | 'retail'
  | 'media_advertising'
  | 'professional_services'
  | 'logistics'
  | 'energy'
  | 'education'
  | 'nonprofit';

export type SensitivityLevel = 'internal' | 'confidential' | 'restricted';

export interface LocalizedText {
  en: string;
  id?: string;
}

/** A tax, registration, or personal identifier scheme issued in a country. */
export interface IdentifierScheme {
  /** Stable key, e.g. `sg_uen`. Stored on partner identifiers. */
  key: string;
  label: string;
  category: 'tax' | 'registration' | 'personal' | 'other';
  appliesTo: Array<'organization' | 'individual'>;
  /** Optional format hint only — core never hard-validates (PRD §3.2.2). */
  pattern?: string;
  example?: string;
  sensitivity: SensitivityLevel;
}

/** One due-diligence evidence item a policy pack asks for. */
export interface DueDiligenceRequirement {
  /** Stable key, e.g. `certificate_of_incorporation`. */
  key: string;
  label: LocalizedText;
  required: boolean;
  /** The document normally carries an expiry date that must be tracked. */
  expires?: boolean;
  /** Legacy/alternate names used to match previously stored documents. */
  aliases?: string[];
  /** Only relevant when the counterparty is incorporated outside the tenant's country. */
  foreignCounterpartyOnly?: boolean;
  source?: 'core' | 'country' | 'industry' | 'tenant';
}

export interface CountryPack {
  /** ISO 3166-1 alpha-2, or `INTL` for the jurisdiction-neutral pack. */
  code: string;
  name: string;
  region: 'Southeast Asia' | 'South Asia' | 'East Asia' | 'Middle East' | 'International';
  /** ISO 4217. */
  defaultCurrency: string;
  /** BCP 47 locale used for number/date formatting. */
  formattingLocale: string;
  /** IANA timezone. */
  timezone: string;
  /** Days of week that are not business days (0 = Sunday). */
  weekend: number[];
  /** E.164 country calling code without `+`. */
  callingCode: string;
  legalForms: string[];
  identifierSchemes: IdentifierScheme[];
  dueDiligence: DueDiligenceRequirement[];
  governingLaw: LocalizedText;
  disputeVenue: LocalizedText;
  dataProtectionLaw: string;
  /** Name of the consumption tax, e.g. VAT, GST, SST. */
  indirectTaxName: string;
  /** Wet-ink stamp duty convention applies to executed paper copies. */
  stampDutyConvention?: LocalizedText;
  /** Regulators an AI reviewer should consider, per industry. */
  regulators?: Partial<Record<IndustryKey, string[]>>;
}

export interface CommercialDocumentProfile {
  /** Singular label, e.g. "Insertion Order", "Purchase Order". */
  label: string;
  plural: string;
  /** Short prefix for generated numbers, e.g. IO, PO, SOW. */
  prefix: string;
  pricingModels: string[];
  /** Label for the free-text "channel/scope" field. */
  channelLabel: string;
  channelPlaceholder: string;
}

export interface IndustryPack {
  key: IndustryKey;
  name: LocalizedText;
  partnerCategories: string[];
  dueDiligence: DueDiligenceRequirement[];
  commercialDocument: CommercialDocumentProfile;
  /** Topics an AI contract reviewer must cover for this industry. */
  aiReviewFocus: string[];
  /** Topic used by the optional dashboard news ticker. */
  newsTopic: string;
}

export interface TenantModules {
  commercialDocuments: boolean;
  spending: boolean;
  evaluation: boolean;
  aiAssistant: boolean;
  newsTicker: boolean;
}

export interface DueDiligenceOverride {
  required?: boolean;
  disabled?: boolean;
}

/** Tenant-level configuration. Everything is optional; packs supply defaults. */
export interface TenantSettings {
  countryCode: string;
  industry: IndustryKey;
  /** UI language: `EN` or `ID` (PRD §5.8 initial locales). */
  language: 'EN' | 'ID';
  timezone: string;
  defaultCurrency: string;
  reportingCurrency: string;
  /** A contract is "expiring" when this many days or fewer remain. */
  expiryWarningDays: number;
  /** Days-before-expiry at which reminders are sent. */
  reminderOffsetsDays: number[];
  modules: TenantModules;
  /** Optional overrides of the pack-provided governing law / venue text. */
  governingLaw?: string;
  disputeVenue?: string;
  ddOverrides: Record<string, DueDiligenceOverride>;
  customDueDiligence: DueDiligenceRequirement[];
}
