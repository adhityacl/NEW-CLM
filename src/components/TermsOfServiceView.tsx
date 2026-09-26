import React, { useState, useEffect } from 'react';
import {
  FileText,
  ArrowLeft,
  Shield,
  CheckCircle2,
  Printer,
  Mail,
  Scale,
  Building2,
  AlertCircle,
  Clock,
  KeyRound,
  FileCheck
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { LANGUAGE_OPTIONS, useLanguage } from '../context/LanguageContext';

interface TermsOfServiceViewProps {
  onBack?: () => void;
}

export const TermsOfServiceView: React.FC<TermsOfServiceViewProps> = ({ onBack }) => {
  const { theme } = useTheme();
  const { t, language, setLanguage } = useLanguage();

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
                <span>{t('legal_terms.back_to_login', 'Back to Login')}</span>
              </button>
            )}
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Scale className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>{t('legal_terms.silegal_terms_of_service', 'SiLegal • Terms of Service')}</span>
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
              title={t('legal_terms.print_save_pdf', 'Print / Save PDF')}
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
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 mb-3">
                <FileCheck className="w-3.5 h-3.5" />
                {t('legal_terms.terms_of_service_document', 'Terms of Service Document')}
              </div>
              <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                {t('legal_terms.terms_of_service', 'Terms of Service')}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                {t('legal_terms.terms_of_use_for_corporate_contract', 'Terms of Use for Corporate Contract & Legal Document Management System (SiLegal)')}
              </p>
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400 sm:text-right bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800">
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                {t('legal_terms.operating_entity', 'Operating Entity:')}
              </p>
              <p className="font-medium text-slate-600 dark:text-slate-300">{t('legal_terms.legal_compliance_team', 'Legal & Compliance Team')}</p>
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                {t('legal_terms.last_updated_august_29_2026', 'Last updated: August 29, 2026')}
              </p>
            </div>
          </div>

          {/* Quick Summary Highlights */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center gap-2.5 text-blue-600 dark:text-blue-400 mb-2">
                <Scale className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  {t('legal_terms.authorized_usage', 'Authorized Usage')}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {t('legal_terms.access_is_restricted_to_authorized_personnel', 'Access is restricted to authorized personnel and verified partners according to role permissions (RBAC).')}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400 mb-2">
                <Shield className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  {t('legal_terms.confidentiality', 'Confidentiality')}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {t('legal_terms.all_contract_drafts_addendums_and_due', 'All contract drafts, addendums, and due diligence files are strictly confidential corporate assets.')}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center gap-2.5 text-amber-600 dark:text-amber-400 mb-2">
                <AlertCircle className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  {t('legal_terms.system_integrity', 'System Integrity')}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {t('legal_terms.users_are_strictly_prohibited_from_document', 'Users are strictly prohibited from document forgery, authorization bypass, or unauthorized system alteration.')}
              </p>
            </div>
          </div>

          {/* Table of Contents */}
          <div className="p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 mb-8">
            <p className="text-xs font-bold text-blue-900 dark:text-blue-300 uppercase tracking-wider mb-2.5">
              {t('legal_terms.table_of_contents', 'Table of Contents:')}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <a href="#tos-1" className="text-blue-700 dark:text-blue-400 hover:underline">
                1. {t('legal_terms.acceptance_of_terms', 'Acceptance of Terms')}
              </a>
              <a href="#tos-2" className="text-blue-700 dark:text-blue-400 hover:underline">
                2. {t('legal_terms.user_access_authorization', 'User Access & Authorization')}
              </a>
              <a href="#tos-3" className="text-blue-700 dark:text-blue-400 hover:underline">
                3. {t('legal_terms.confidentiality_corporate_assets', 'Confidentiality & Corporate Assets')}
              </a>
              <a href="#tos-4" className="text-blue-700 dark:text-blue-400 hover:underline">
                4. {t('legal_terms.user_obligations_acceptable_use', 'User Obligations & Acceptable Use')}
              </a>
              <a href="#tos-5" className="text-blue-700 dark:text-blue-400 hover:underline">
                5. {t('legal_terms.google_workspace_3rd_party_integration', 'Google Workspace & 3rd Party Integration')}
              </a>
              <a href="#tos-6" className="text-blue-700 dark:text-blue-400 hover:underline">
                6. {t('legal_terms.limitation_of_liability_slas', 'Limitation of Liability & SLAs')}
              </a>
              <a href="#tos-7" className="text-blue-700 dark:text-blue-400 hover:underline">
                7. {t('legal_terms.modifications_access_termination', 'Modifications & Access Termination')}
              </a>
              <a href="#tos-8" className="text-blue-700 dark:text-blue-400 hover:underline">
                8. {t('legal_terms.governing_law_legal_contact', 'Governing Law & Legal Contact')}
              </a>
            </div>
          </div>

          {/* Main Content Body */}
          <div className="space-y-8 text-slate-700 dark:text-slate-300 text-sm leading-relaxed">
            {/* Section 1 */}
            <section id="tos-1" className="scroll-mt-6 border-t border-slate-100 dark:border-slate-800 pt-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-bold">
                  1
                </span>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {t('legal_terms.acceptance_of_terms', 'Acceptance of Terms')}
                </h2>
              </div>
              <p className="mb-3">
                {t('legal_terms.welcome_to_silegal_corporate_legal_contract', 'Welcome to SiLegal (Corporate Legal Contract & Document Management System). By accessing, registering, or using the SiLegal platform, you confirm that you have read, understood, and agreed to be bound by these Terms of Service.')}
              </p>
              <p>
                {t('legal_terms.if_you_are_using_this_system', 'If you are using this system on behalf of an organization or corporate entity, you represent and warrant that you possess full legal authority to bind that entity to these terms.')}
              </p>
            </section>

            {/* Section 2 */}
            <section id="tos-2" className="scroll-mt-6 border-t border-slate-100 dark:border-slate-800 pt-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-bold">
                  2
                </span>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {t('legal_terms.user_access_authorization', 'User Access & Authorization')}
                </h2>
              </div>
              <p className="mb-3">
                {t('legal_terms.silegal_enforces_role_based_access_controls', 'SiLegal enforces Role-Based Access Controls (RBAC) to protect sensitive corporate operations:')}
              </p>
              <ul className="list-disc pl-5 space-y-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                <li>
                  <strong className="text-slate-800 dark:text-slate-200">
                    {t('legal_terms.verified_account_requirement', 'Verified Account Requirement:')}
                  </strong>{' '}
                  {t('legal_terms.all_users_must_register_with_official', 'All users must register with official corporate email addresses. Newly registered accounts require manual approval from an Administrator prior to access.')}
                </li>
                <li>
                  <strong className="text-slate-800 dark:text-slate-200">
                    {t('legal_terms.credential_security', 'Credential Security:')}
                  </strong>{' '}
                  {t('legal_terms.users_are_strictly_responsible_for_maintaining', 'Users are strictly responsible for maintaining password confidentiality and for all activities conducted under their authenticated session.')}
                </li>
                <li>
                  <strong className="text-slate-800 dark:text-slate-200">
                    {t('legal_terms.access_hierarchy', 'Access Hierarchy:')}
                  </strong>{' '}
                  {t('legal_terms.permissions_to_create_modify_approve_or', 'Permissions to create, modify, approve, or purge contract metadata and due diligence files are strictly partitioned by assigned roles (Admin, Legal, Finance, Viewer).')}
                </li>
              </ul>
            </section>

            {/* Section 3 */}
            <section id="tos-3" className="scroll-mt-6 border-t border-slate-100 dark:border-slate-800 pt-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-bold">
                  3
                </span>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {t('legal_terms.confidentiality_corporate_assets', 'Confidentiality & Corporate Assets')}
                </h2>
              </div>
              <p className="mb-3">
                {t('legal_terms.all_agreement_drafts_master_service_agreements', 'All agreement drafts, Master Service Agreements (PKS), Addendums, Insertion Orders (IO), partner compliance files (NIB, Tax ID, Articles), and transaction values stored in SiLegal are strictly confidential corporate trade secrets.')}
              </p>
              <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-900 dark:text-amber-200">
                <strong>{t('legal_terms.prohibition_against_unauthorized_distribution', 'Prohibition Against Unauthorized Distribution:')}</strong>{' '}
                {t('legal_terms.exporting_capturing_or_distributing_confidential', 'Exporting, capturing, or distributing confidential files to third parties without active Non-Disclosure Agreements (NDA) or prior legal authorization is strictly prohibited.')}
              </div>
            </section>

            {/* Section 4 */}
            <section id="tos-4" className="scroll-mt-6 border-t border-slate-100 dark:border-slate-800 pt-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-bold">
                  4
                </span>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {t('legal_terms.user_obligations_acceptable_use', 'User Obligations & Acceptable Use')}
                </h2>
              </div>
              <p className="mb-3">
                {t('legal_terms.when_utilizing_the_silegal_system_users', 'When utilizing the SiLegal system, users covenant and agree to:')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-slate-900 dark:text-white">
                      {t('legal_terms.metadata_integrity', 'Metadata Integrity')}
                    </strong>
                    <span className="text-slate-500 dark:text-slate-400">
                      {t('legal_terms.ensuring_official_contract_numbers_validity_date', 'Ensuring official contract numbers, validity dates, and values match executed physical copies.')}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-slate-900 dark:text-white">
                      {t('legal_terms.audit_trail_compliance', 'Audit Trail Compliance')}
                    </strong>
                    <span className="text-slate-500 dark:text-slate-400">
                      {t('legal_terms.acknowledging_that_all_document_edits_approvals', 'Acknowledging that all document edits, approvals, and uploads generate audit trail entries.')}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 5 */}
            <section id="tos-5" className="scroll-mt-6 border-t border-slate-100 dark:border-slate-800 pt-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-bold">
                  5
                </span>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {t('legal_terms.google_workspace_3rd_party_integration', 'Google Workspace & 3rd Party Integration')}
                </h2>
              </div>
              <p className="mb-3">
                {t('legal_terms.the_platform_provides_optional_google_oauth', 'The platform provides optional Google OAuth 2.0 authentication for Google Drive and Google Sheets synchronization:')}
              </p>
              <ul className="list-disc pl-5 space-y-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                <li>
                  {t('legal_terms.google_api_authorizations_are_strictly_scoped', 'Google API authorizations are strictly scoped to archiving PDF contract files into structured partner folders.')}
                </li>
                <li>
                  {t('legal_terms.all_integrations_strictly_adhere_to_the', 'All integrations strictly adhere to the Google API Limited Use Policy and our Privacy Policy.')}
                </li>
              </ul>
            </section>

            {/* Section 6 */}
            <section id="tos-6" className="scroll-mt-6 border-t border-slate-100 dark:border-slate-800 pt-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-bold">
                  6
                </span>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {t('legal_terms.limitation_of_liability_slas', 'Limitation of Liability & SLAs')}
                </h2>
              </div>
              <p>
                {t('legal_terms.the_silegal_system_is_deployed_to', 'The SiLegal system is deployed to facilitate contract governance. While automated expiration reminder workflows operate continuously, legal obligations and notice periods strictly defer to executed physical contracts.')}
              </p>
            </section>

            {/* Section 7 */}
            <section id="tos-7" className="scroll-mt-6 border-t border-slate-100 dark:border-slate-800 pt-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-bold">
                  7
                </span>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {t('legal_terms.modifications_access_termination', 'Modifications & Access Termination')}
                </h2>
              </div>
              <p>
                {t('legal_terms.the_company_reserves_the_right_to', 'The Company reserves the right to amend these terms. Violation of confidentiality covenants or security policies will result in immediate account suspension or termination by System Administrators.')}
              </p>
            </section>

            {/* Section 8 */}
            <section id="tos-8" className="scroll-mt-6 border-t border-slate-100 dark:border-slate-800 pt-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-bold">
                  8
                </span>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {t('legal_terms.governing_law_legal_contact', 'Governing Law & Legal Contact')}
                </h2>
              </div>
              <p className="mb-4">
                {t('legal_terms.these_terms_of_service_are_governed', 'These Terms of Service are governed by and construed in accordance with the laws of the Republic of Indonesia. For legal inquiries, please contact:')}
              </p>

              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">
                    {t('legal_terms.legal_operations_compliance', 'Legal Operations & Compliance')}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {t('legal_terms.legal_operations_compliance_department', 'Legal Operations & Compliance Department')}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-2">
                    {t('legal_terms.jakarta_republik_indonesia', 'Jakarta, Republik Indonesia')}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <a
                    href="mailto:legal@company.com"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-sm"
                  >
                    <Mail className="w-4 h-4" />
                    <span>{t('legal_terms.legal_company_com', 'legal@company.com')}</span>
                  </a>
                </div>
              </div>
            </section>
          </div>

          {/* Footer of the Document */}
          <div className="mt-10 pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400 dark:text-slate-500">
            <p>{t('legal_terms.2026_acl_all_rights_reserved', '2026 ACL. All rights reserved.')}</p>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
              >
                {t('legal_terms.back_to_login_screen', '← Back to Login Screen')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
