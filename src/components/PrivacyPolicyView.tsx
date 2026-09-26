import React, { useState, useEffect } from 'react';
import {
  Shield,
  ArrowLeft,
  Lock,
  FileText,
  Database,
  Cloud,
  CheckCircle2,
  ExternalLink,
  Mail,
  Building2,
  Printer,
  Globe,
  Eye,
  KeyRound,
  Server,
  UserCheck
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { LANGUAGE_OPTIONS, useLanguage } from '../context/LanguageContext';

interface PrivacyPolicyViewProps {
  onBack?: () => void;
}

export const PrivacyPolicyView: React.FC<PrivacyPolicyViewProps> = ({ onBack }) => {
  const { theme } = useTheme();
  const { t, language, setLanguage } = useLanguage();
  const [activeSection, setActiveSection] = useState<string>('intro');

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-[#F3F4F0] dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        {/* Top Navigation Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm print:hidden">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>{t('legal_privacy.back_to_login', 'Back to Login')}</span>
              </button>
            )}
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>{t('legal_privacy.silegal_privacy_policy', 'SiLegal • Privacy Policy')}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Language Toggle */}
            <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold">
              {LANGUAGE_OPTIONS.map((option) => (
                <button
                  key={option.code}
                  type="button"
                  lang={option.htmlLang}
                  aria-pressed={language === option.code}
                  onClick={() => setLanguage(option.code)}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    language === option.code
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {option.nativeName}
                </button>
              ))}
            </div>

            {/* Print Button */}
            <button
              type="button"
              onClick={handlePrint}
              title={t('legal_privacy.print_save_pdf', 'Print / Save PDF')}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Header Document Card */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-10 border border-slate-200 dark:border-slate-800 shadow-sm mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-6 mb-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 mb-3">
                <Shield className="w-3.5 h-3.5" />
                {t('legal_privacy.legal_compliance_document', 'Legal & Compliance Document')}
              </div>
              <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                {t('legal_privacy.privacy_policy', 'Privacy Policy')}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                {t('legal_privacy.enterprise_legal_contract_corporate_document_man', 'Enterprise Legal Contract & Corporate Document Management System (SiLegal)')}
              </p>
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400 sm:text-right bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800">
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                {t('legal_privacy.operating_entity', 'Operating Entity:')}
              </p>
              <p className="font-medium text-slate-600 dark:text-slate-300">{t('legal_privacy.legal_compliance_team', 'Legal & Compliance Team')}</p>
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                {t('legal_privacy.last_updated_august_29_2026', 'Last updated: August 29, 2026')}
              </p>
            </div>
          </div>

          {/* Quick Summary Highlights */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400 mb-2">
                <Lock className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  {t('legal_privacy.enterprise_security', 'Enterprise Security')}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {t('legal_privacy.all_contract_data_and_due_diligence', 'All contract data and due diligence documents are protected with encryption and strict Role-Based Access Controls (RBAC).')}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center gap-2.5 text-blue-600 dark:text-blue-400 mb-2">
                <Cloud className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  {t('legal_privacy.google_api_compliance', 'Google API Compliance')}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {t('legal_privacy.google_drive_sheets_integration_fully_adheres', 'Google Drive & Sheets integration fully adheres to the Google API Limited Use Policy. No data is ever sold.')}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center gap-2.5 text-amber-600 dark:text-amber-400 mb-2">
                <UserCheck className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  {t('legal_privacy.audit_trail_rights', 'Audit Trail & Rights')}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {t('legal_privacy.immutable_audit_trails_are_maintained_for', 'Immutable audit trails are maintained for transparency. Users retain full rights over data access and revocation.')}
              </p>
            </div>
          </div>

          {/* Table of Contents */}
          <div className="p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 mb-8">
            <p className="text-xs font-bold text-emerald-900 dark:text-emerald-300 uppercase tracking-wider mb-2.5">
              {t('legal_privacy.table_of_contents', 'Table of Contents:')}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <a href="#section-1" className="text-emerald-700 dark:text-emerald-400 hover:underline">
                1. {t('legal_privacy.introduction_scope', 'Introduction & Scope')}
              </a>
              <a href="#section-2" className="text-emerald-700 dark:text-emerald-400 hover:underline">
                2. {t('legal_privacy.information_we_collect', 'Information We Collect')}
              </a>
              <a href="#section-3" className="text-emerald-700 dark:text-emerald-400 hover:underline">
                3. {t('legal_privacy.how_we_use_your_data', 'How We Use Your Data')}
              </a>
              <a href="#section-4" className="text-emerald-700 dark:text-emerald-400 hover:underline font-semibold">
                4. {t('legal_privacy.google_api_limited_use_compliance', 'Google API Limited Use Compliance')}
              </a>
              <a href="#section-5" className="text-emerald-700 dark:text-emerald-400 hover:underline">
                5. {t('legal_privacy.data_security_protection', 'Data Security & Protection')}
              </a>
              <a href="#section-6" className="text-emerald-700 dark:text-emerald-400 hover:underline">
                6. {t('legal_privacy.data_retention_deletion', 'Data Retention & Deletion')}
              </a>
              <a href="#section-7" className="text-emerald-700 dark:text-emerald-400 hover:underline">
                7. {t('legal_privacy.user_rights_controls', 'User Rights & Controls')}
              </a>
              <a href="#section-8" className="text-emerald-700 dark:text-emerald-400 hover:underline">
                8. {t('legal_privacy.contact_corporate_information', 'Contact & Corporate Information')}
              </a>
            </div>
          </div>

          {/* Main Content Body */}
          <div className="space-y-8 text-slate-700 dark:text-slate-300 text-sm leading-relaxed">
            {/* Section 1 */}
            <section id="section-1" className="scroll-mt-6 border-t border-slate-100 dark:border-slate-800 pt-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                  1
                </span>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {t('legal_privacy.introduction_scope', 'Introduction & Scope')}
                </h2>
              </div>
              <p className="mb-3">
                {t('legal_privacy.this_privacy_policy_governs_how_the', 'This Privacy Policy governs how the SiLegal platform ("Application", "We", or "Service") collects, uses, stores, processes, and protects personal data and corporate information within the SiLegal application (Legal Contract & Document Management System).')}
              </p>
              <p>
                {t('legal_privacy.this_application_is_dedicated_to_internal', 'This application is dedicated to internal contract management, partner/vendor compliance verification (Due Diligence), Insertion Order (IO) tracking, and notice period alert workflows in compliance with applicable laws (including Indonesian Law No. 27/2022 on Personal Data Protection).')}
              </p>
            </section>

            {/* Section 2 */}
            <section id="section-2" className="scroll-mt-6 border-t border-slate-100 dark:border-slate-800 pt-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                  2
                </span>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {t('legal_privacy.information_we_collect', 'Information We Collect')}
                </h2>
              </div>
              <p className="mb-3">
                {t('legal_privacy.we_strictly_collect_information_necessary_for', 'We strictly collect information necessary for legitimate corporate legal administration and contract lifecycle operations:')}
              </p>
              <ul className="list-disc pl-5 space-y-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                <li>
                  <strong className="text-slate-800 dark:text-slate-200">
                    {t('legal_privacy.account_user_credentials', 'Account & User Credentials:')}
                  </strong>{' '}
                  {t('legal_privacy.full_name_corporate_email_address_hashed', 'Full name, corporate email address, hashed credentials, role-based authorization level, and account status.')}
                </li>
                <li>
                  <strong className="text-slate-800 dark:text-slate-200">
                    {t('legal_privacy.contract_commercial_metadata', 'Contract & Commercial Metadata:')}
                  </strong>{' '}
                  {t('legal_privacy.official_contract_registry_numbers_agreement_tit', 'Official contract registry numbers, agreement titles, partner names, commencement and expiration dates, commercial commitment values, duration terms, and auto-renewal stipulations.')}
                </li>
                <li>
                  <strong className="text-slate-800 dark:text-slate-200">
                    {t('legal_privacy.partner_due_diligence_documentation', 'Partner Due Diligence Documentation:')}
                  </strong>{' '}
                  {t('legal_privacy.corporate_compliance_files_including_business_id', 'Corporate compliance files including Business Identification Number (NIB), Tax ID (NPWP), Articles of Incorporation, Director Identification (KTP/Passport), Official Bank Accounts, and Non-Disclosure Agreements (NDA).')}
                </li>
                <li>
                  <strong className="text-slate-800 dark:text-slate-200">
                    {t('legal_privacy.system_audit_logs', 'System & Audit Logs:')}
                  </strong>{' '}
                  {t('legal_privacy.timestamped_records_of_contract_actions_document', 'Timestamped records of contract actions, document uploads, session identifiers, IP addresses, and reminder dispatches.')}
                </li>
                <li>
                  <strong className="text-slate-800 dark:text-slate-200">
                    {t('legal_privacy.oauth_2_0_integration_tokens', 'OAuth 2.0 Integration Tokens:')}
                  </strong>{' '}
                  {t('legal_privacy.temporary_oauth_access_tokens_granted_by', 'Temporary OAuth access tokens granted by users to enable structured Google Drive uploads and Google Sheets backups.')}
                </li>
              </ul>
            </section>

            {/* Section 3 */}
            <section id="section-3" className="scroll-mt-6 border-t border-slate-100 dark:border-slate-800 pt-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                  3
                </span>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {t('legal_privacy.how_we_use_your_data', 'How We Use Your Data')}
                </h2>
              </div>
              <p className="mb-3">
                {t('legal_privacy.all_processed_data_is_utilized_strictly', 'All processed data is utilized strictly for corporate legal governance, digital archiving, and operational risk mitigation:')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-slate-900 dark:text-white">
                      {t('legal_privacy.contract_lifecycle_tracking', 'Contract Lifecycle Tracking')}
                    </strong>
                    <span className="text-slate-500 dark:text-slate-400">
                      {t('legal_privacy.tracking_active_dates_amendment_addendums_and', 'Tracking active dates, amendment addendums, and notice period deadlines.')}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-slate-900 dark:text-white">
                      {t('legal_privacy.tiered_google_drive_archiving', 'Tiered Google Drive Archiving')}
                    </strong>
                    <span className="text-slate-500 dark:text-slate-400">
                      {t('legal_privacy.organizing_pdf_contracts_and_compliance_document', 'Organizing PDF contracts and compliance documents into structured partner subfolders.')}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-slate-900 dark:text-white">
                      {t('legal_privacy.real_time_sheet_backup', 'Real-Time Sheet Backup')}
                    </strong>
                    <span className="text-slate-500 dark:text-slate-400">
                      {t('legal_privacy.maintaining_synced_tabular_backups_across_author', 'Maintaining synced tabular backups across authorized corporate master spreadsheets.')}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-slate-900 dark:text-white">
                      {t('legal_privacy.audit_trails_compliance', 'Audit Trails & Compliance')}
                    </strong>
                    <span className="text-slate-500 dark:text-slate-400">
                      {t('legal_privacy.fulfilling_corporate_governance_compliance_and_l', 'Fulfilling corporate governance compliance and legal accountability requirements.')}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 4 - CRITICAL GOOGLE API LIMITED USE DISCLOSURE */}
            <section id="section-4" className="scroll-mt-6 border-t border-slate-100 dark:border-slate-800 pt-6">
              <div className="p-5 rounded-3xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60">
                <div className="flex items-center gap-2.5 mb-3">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">
                    4
                  </span>
                  <h2 className="text-lg font-bold text-blue-950 dark:text-blue-100">
                    {t('legal_privacy.google_api_services_user_data_policy', 'Google API Services User Data Policy Compliance')}
                  </h2>
                </div>

                <div className="space-y-3 text-xs sm:text-sm text-blue-900 dark:text-blue-200">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {t('legal_privacy.limited_use_disclosure_requirement', 'Limited Use Disclosure Requirement:')}
                  </p>
                  <blockquote className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900 text-xs font-mono text-slate-800 dark:text-slate-200 leading-relaxed">
                    {t('legal_privacy.silegal_s_use_and_transfer_to', 'SiLegal\'s use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.')}
                  </blockquote>

                  <p>
                    {t('legal_privacy.specifically_regarding_google_workspace_integrat', 'Specifically regarding Google Workspace integration (Google Drive & Sheets):')}
                  </p>

                  <ul className="list-disc pl-5 space-y-1.5 text-xs">
                    <li>
                      <strong>{t('legal_privacy.no_sale_of_user_data', 'No Sale of User Data:')}</strong>{' '}
                      {t('legal_privacy.we_never_sell_lease_or_monetize', 'We NEVER sell, lease, or monetize your Google user data or uploaded files to any third party.')}
                    </li>
                    <li>
                      <strong>{t('legal_privacy.no_advertising_usage', 'No Advertising Usage:')}</strong>{' '}
                      {t('legal_privacy.google_api_data_is_never_used', 'Google API data is never used for serving advertisements or behavioral profiling.')}
                    </li>
                    <li>
                      <strong>{t('legal_privacy.exclusive_functional_scope', 'Exclusive Functional Scope:')}</strong>{' '}
                      {t('legal_privacy.google_drive_access_is_strictly_limited', 'Google Drive access is strictly limited to saving and organizing PDF contract documents into designated partner subfolders.')}
                    </li>
                    <li>
                      <strong>{t('legal_privacy.revocation_rights', 'Revocation Rights:')}</strong>{' '}
                      {t('legal_privacy.users_can_revoke_google_oauth_permissions', 'Users can revoke Google OAuth permissions at any time via the in-app Settings tab or your Google Account Security Dashboard.')}
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Section 5 */}
            <section id="section-5" className="scroll-mt-6 border-t border-slate-100 dark:border-slate-800 pt-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                  5
                </span>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {t('legal_privacy.data_security_safeguards', 'Data Security & Safeguards')}
                </h2>
              </div>
              <p className="mb-3">
                {t('legal_privacy.we_enforce_enterprise_grade_technological_and', 'We enforce enterprise-grade technological and organizational safeguards:')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                  <KeyRound className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mb-1.5" />
                  <strong className="block text-slate-900 dark:text-white mb-1">
                    {t('legal_privacy.end_to_end_encryption', 'End-to-End Encryption')}
                  </strong>
                  <span className="text-slate-500 dark:text-slate-400">
                    {t('legal_privacy.data_in_transit_is_protected_via', 'Data in transit is protected via modern TLS/HTTPS 256-bit encryption protocols.')}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                  <UserCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mb-1.5" />
                  <strong className="block text-slate-900 dark:text-white mb-1">
                    {t('legal_privacy.role_based_access_rbac', 'Role-Based Access (RBAC)')}
                  </strong>
                  <span className="text-slate-500 dark:text-slate-400">
                    {t('legal_privacy.only_authorized_legal_and_administrative_personn', 'Only authorized legal and administrative personnel can access sensitive contract files.')}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                  <Server className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mb-1.5" />
                  <strong className="block text-slate-900 dark:text-white mb-1">
                    {t('legal_privacy.immutable_audit_trails', 'Immutable Audit Trails')}
                  </strong>
                  <span className="text-slate-500 dark:text-slate-400">
                    {t('legal_privacy.all_actions_and_modifications_are_recorded', 'All actions and modifications are recorded in tamper-resistant audit logs.')}
                  </span>
                </div>
              </div>
            </section>

            {/* Section 6 */}
            <section id="section-6" className="scroll-mt-6 border-t border-slate-100 dark:border-slate-800 pt-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                  6
                </span>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {t('legal_privacy.data_retention_deletion', 'Data Retention & Deletion')}
                </h2>
              </div>
              <p>
                {t('legal_privacy.contract_files_and_records_are_retained', 'Contract files and records are retained for the duration of the agreement plus mandatory legal and tax retention periods under Indonesian law (typically 5 to 10 years post-termination). Upon retention expiry or formal legal instruction, records are archived or securely purged.')}
              </p>
            </section>

            {/* Section 7 */}
            <section id="section-7" className="scroll-mt-6 border-t border-slate-100 dark:border-slate-800 pt-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                  7
                </span>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {t('legal_privacy.user_rights_controls', 'User Rights & Controls')}
                </h2>
              </div>
              <p className="mb-2">
                {t('legal_privacy.in_accordance_with_applicable_data_protection', 'In accordance with applicable data protection legislation, you possess the right to:')}
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                <li>{t('legal_privacy.request_access_and_confirmation_regarding_your', 'Request access and confirmation regarding your stored personal details.')}</li>
                <li>{t('legal_privacy.request_rectification_of_inaccurate_or_outdated', 'Request rectification of inaccurate or outdated information.')}</li>
                <li>{t('legal_privacy.revoke_google_oauth_integration_permissions_at', 'Revoke Google OAuth integration permissions at any time via Settings.')}</li>
                <li>{t('legal_privacy.export_backups_of_your_data_in', 'Export backups of your data in standardized tabular formats (Excel/CSV).')}</li>
              </ul>
            </section>

            {/* Section 8 */}
            <section id="section-8" className="scroll-mt-6 border-t border-slate-100 dark:border-slate-800 pt-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                  8
                </span>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {t('legal_privacy.contact_corporate_information', 'Contact & Corporate Information')}
                </h2>
              </div>
              <p className="mb-4">
                {t('legal_privacy.for_any_inquiries_legal_clarifications_or', 'For any inquiries, legal clarifications, or privacy requests regarding this Privacy Policy, please contact our Legal & Compliance department:')}
              </p>

              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">
                    {t('legal_privacy.legal_operations_compliance', 'Legal Operations & Compliance')}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {t('legal_privacy.legal_operations_corporate_governance_division', 'Legal Operations & Corporate Governance Division')}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-2">
                    {t('legal_privacy.jakarta_republik_indonesia', 'Jakarta, Republik Indonesia')}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <a
                    href="mailto:legal@company.com"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-sm"
                  >
                    <Mail className="w-4 h-4" />
                    <span>{t('legal_privacy.legal_company_com', 'legal@company.com')}</span>
                  </a>
                </div>
              </div>
            </section>
          </div>

          {/* Footer of the Document */}
          <div className="mt-10 pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400 dark:text-slate-500">
            <p>{t('legal_privacy.2026_silegal_all_rights_reserved', '© 2026 SiLegal. All rights reserved.')}</p>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="text-emerald-600 dark:text-emerald-400 hover:underline font-semibold cursor-pointer"
              >
                {t('legal_privacy.back_to_login_screen', '← Back to Login Screen')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
