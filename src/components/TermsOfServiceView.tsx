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

interface TermsOfServiceViewProps {
  onBack?: () => void;
}

export const TermsOfServiceView: React.FC<TermsOfServiceViewProps> = ({ onBack }) => {
  const { theme } = useTheme();
  const [lang, setLang] = useState<'ID' | 'EN'>('ID');

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-canvas text-[var(--foreground)] transition-colors py-8 px-4 sm:px-6 lg:px-8">
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
                <span>{lang === 'ID' ? 'Kembali ke Login' : 'Back to Login'}</span>
              </button>
            )}
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Scale className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>SiLegal • Terms of Service</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Language Toggle */}
            <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setLang('ID')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  lang === 'ID'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                🇮🇩 Bahasa Indonesia
              </button>
              <button
                type="button"
                onClick={() => setLang('EN')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  lang === 'EN'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                🇬🇧 English
              </button>
            </div>

            {/* Print Button */}
            <button
              type="button"
              onClick={handlePrint}
              title={lang === 'ID' ? 'Cetak / Simpan PDF' : 'Print / Save PDF'}
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
                {lang === 'ID' ? 'Dokumen Syarat & Ketentuan' : 'Terms of Service Document'}
              </div>
              <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                {lang === 'ID' ? 'Syarat & Ketentuan Layanan' : 'Terms of Service'}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                {lang === 'ID'
                  ? 'Ketentuan Penggunaan Sistem Manajemen Kontrak & Dokumen Legal (SiLegal)'
                  : 'Terms of Use for Corporate Contract & Legal Document Management System (SiLegal)'}
              </p>
            </div>

            <div className="text-xs text-slate-500 dark:text-slate-400 sm:text-right bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800">
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                {lang === 'ID' ? 'Entitas Pengelola:' : 'Operating Entity:'}
              </p>
              <p className="font-medium text-slate-600 dark:text-slate-300">{lang === 'ID' ? 'Tim Legal & Kepatuhan' : 'Legal & Compliance Team'}</p>
              <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                {lang === 'ID' ? 'Terakhir diperbarui: 29 Agustus 2026' : 'Last updated: August 29, 2026'}
              </p>
            </div>
          </div>

          {/* Quick Summary Highlights */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center gap-2.5 text-blue-600 dark:text-blue-400 mb-2">
                <Scale className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  {lang === 'ID' ? 'Penggunaan Resmi' : 'Authorized Usage'}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {lang === 'ID'
                  ? 'Akses terbatas untuk personel dan mitra resmi yang terdaftar sesuai dengan tingkat otorisasi (RBAC).'
                  : 'Access is restricted to authorized personnel and verified partners according to role permissions (RBAC).'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400 mb-2">
                <Shield className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  {lang === 'ID' ? 'Kerahasiaan Dokumen' : 'Confidentiality'}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {lang === 'ID'
                  ? 'Seluruh draft kontrak, addendum, dan dokumen due diligence bersifat rahasia dan milik perusahaan.'
                  : 'All contract drafts, addendums, and due diligence files are strictly confidential corporate assets.'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center gap-2.5 text-amber-600 dark:text-amber-400 mb-2">
                <AlertCircle className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  {lang === 'ID' ? 'Kepatuhan & Integrity' : 'System Integrity'}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {lang === 'ID'
                  ? 'Pengguna dilarang melakukan pemalsuan dokumen, bypass otorisasi, atau tindakan yang merusak keamanan.'
                  : 'Users are strictly prohibited from document forgery, authorization bypass, or unauthorized system alteration.'}
              </p>
            </div>
          </div>

          {/* Table of Contents */}
          <div className="p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 mb-8">
            <p className="text-xs font-bold text-blue-900 dark:text-blue-300 uppercase tracking-wider mb-2.5">
              {lang === 'ID' ? 'Daftar Isi Ketentuan:' : 'Table of Contents:'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <a href="#tos-1" className="text-blue-700 dark:text-blue-400 hover:underline">
                1. {lang === 'ID' ? 'Penerimaan Syarat & Perjanjian' : 'Acceptance of Terms'}
              </a>
              <a href="#tos-2" className="text-blue-700 dark:text-blue-400 hover:underline">
                2. {lang === 'ID' ? 'Hak Akses & Otorisasi Pengguna' : 'User Access & Authorization'}
              </a>
              <a href="#tos-3" className="text-blue-700 dark:text-blue-400 hover:underline">
                3. {lang === 'ID' ? 'Kerahasiaan Dokumen & Data Korporat' : 'Confidentiality & Corporate Assets'}
              </a>
              <a href="#tos-4" className="text-blue-700 dark:text-blue-400 hover:underline">
                4. {lang === 'ID' ? 'Kewajiban & Penggunaan yang Diperbolehkan' : 'User Obligations & Acceptable Use'}
              </a>
              <a href="#tos-5" className="text-blue-700 dark:text-blue-400 hover:underline">
                5. {lang === 'ID' ? 'Integrasi Google Workspace & Layanan Pihak Ketiga' : 'Google Workspace & 3rd Party Integration'}
              </a>
              <a href="#tos-6" className="text-blue-700 dark:text-blue-400 hover:underline">
                6. {lang === 'ID' ? 'Batasan Tanggung Jawab & Jaminan Service Level' : 'Limitation of Liability & SLAs'}
              </a>
              <a href="#tos-7" className="text-blue-700 dark:text-blue-400 hover:underline">
                7. {lang === 'ID' ? 'Perubahan Ketentuan & Pemutusan Akses' : 'Modifications & Access Termination'}
              </a>
              <a href="#tos-8" className="text-blue-700 dark:text-blue-400 hover:underline">
                8. {lang === 'ID' ? 'Hukum yang Berlaku & Kontak Legal' : 'Governing Law & Legal Contact'}
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
                  {lang === 'ID' ? 'Penerimaan Syarat & Perjanjian' : 'Acceptance of Terms'}
                </h2>
              </div>
              <p className="mb-3">
                {lang === 'ID'
                  ? 'Selamat datang di aplikasi SiLegal (Sistem Manajemen Kontrak & Dokumen Legal). Dengan mengakses, mendaftar, atau menggunakan platform SiLegal, Anda menyatakan bahwa Anda telah membaca, memahami, dan menyetujui untuk terikat oleh Syarat & Ketentuan Layanan ini.'
                  : 'Welcome to SiLegal (Corporate Legal Contract & Document Management System). By accessing, registering, or using the SiLegal platform, you confirm that you have read, understood, and agreed to be bound by these Terms of Service.'}
              </p>
              <p>
                {lang === 'ID'
                  ? 'Jika Anda menggunakan layanan ini atas nama perusahaan atau badan hukum lain, Anda menyatakan memiliki wewenang sah untuk mengikat badan hukum tersebut pada ketentuan ini.'
                  : 'If you are using this system on behalf of an organization or corporate entity, you represent and warrant that you possess full legal authority to bind that entity to these terms.'}
              </p>
            </section>

            {/* Section 2 */}
            <section id="tos-2" className="scroll-mt-6 border-t border-slate-100 dark:border-slate-800 pt-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-bold">
                  2
                </span>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {lang === 'ID' ? 'Hak Akses & Otorisasi Pengguna' : 'User Access & Authorization'}
                </h2>
              </div>
              <p className="mb-3">
                {lang === 'ID'
                  ? 'SiLegal menerapkan mekanisme otorisasi berlapis (Role-Based Access Control) untuk melindungi kerahasiaan operasional korporat:'
                  : 'SiLegal enforces Role-Based Access Controls (RBAC) to protect sensitive corporate operations:'}
              </p>
              <ul className="list-disc pl-5 space-y-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                <li>
                  <strong className="text-slate-800 dark:text-slate-200">
                    {lang === 'ID' ? 'Akun Pengguna Terverifikasi:' : 'Verified Account Requirement:'}
                  </strong>{' '}
                  {lang === 'ID'
                    ? 'Setiap pengguna wajib menggunakan email korporat resmi. Akun baru yang terdaftar memerlukan persetujuan Administrator sebelum akses diberikan.'
                    : 'All users must register with official corporate email addresses. Newly registered accounts require manual approval from an Administrator prior to access.'}
                </li>
                <li>
                  <strong className="text-slate-800 dark:text-slate-200">
                    {lang === 'ID' ? 'Keamanan Kredensial:' : 'Credential Security:'}
                  </strong>{' '}
                  {lang === 'ID'
                    ? 'Pengguna bertanggung jawab penuh atas kerahasiaan kata sandi dan seluruh aktivitas yang dilakukan menggunakan akun milik pengguna.'
                    : 'Users are strictly responsible for maintaining password confidentiality and for all activities conducted under their authenticated session.'}
                </li>
                <li>
                  <strong className="text-slate-800 dark:text-slate-200">
                    {lang === 'ID' ? 'Tingkatan Peran Akses:' : 'Access Hierarchy:'}
                  </strong>{' '}
                  {lang === 'ID'
                    ? 'Hak untuk menambah, menyunting, menyetujui, atau menghapus data kontrak serta dokumen due diligence dibatasi sesuai peran (Admin, Legal, Finance, Viewer).'
                    : 'Permissions to create, modify, approve, or purge contract metadata and due diligence files are strictly partitioned by assigned roles (Admin, Legal, Finance, Viewer).'}
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
                  {lang === 'ID' ? 'Kerahasiaan Dokumen & Data Korporat' : 'Confidentiality & Corporate Assets'}
                </h2>
              </div>
              <p className="mb-3">
                {lang === 'ID'
                  ? 'Seluruh naskah perjanjian, Perjanjian Kerjasama (PKS), Addendum, Insertion Order (IO), berkas verifikasi mitra (NIB, NPWP, Akta), serta informasi nilai transaksi yang tersimpan di dalam aplikasi SiLegal adalah rahasia dagang dan dokumen berhak cipta milik perusahaan atau mitranya.'
                  : 'All agreement drafts, Master Service Agreements (PKS), Addendums, Insertion Orders (IO), partner compliance files (NIB, Tax ID, Articles), and transaction values stored in SiLegal are strictly confidential corporate trade secrets.'}
              </p>
              <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-900 dark:text-amber-200">
                <strong>{lang === 'ID' ? 'Larangan Mengunduh / Mengedarkan Tanpa Izin:' : 'Prohibition Against Unauthorized Distribution:'}</strong>{' '}
                {lang === 'ID'
                  ? 'Dilarang keras menyalin, membagikan, atau mengunduh dokumen rahasia perusahaan untuk kepentingan pribadi atau pihak luar yang tidak memiliki Non-Disclosure Agreement (NDA) aktif.'
                  : 'Exporting, capturing, or distributing confidential files to third parties without active Non-Disclosure Agreements (NDA) or prior legal authorization is strictly prohibited.'}
              </div>
            </section>

            {/* Section 4 */}
            <section id="tos-4" className="scroll-mt-6 border-t border-slate-100 dark:border-slate-800 pt-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-bold">
                  4
                </span>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {lang === 'ID' ? 'Kewajiban & Penggunaan yang Diperbolehkan' : 'User Obligations & Acceptable Use'}
                </h2>
              </div>
              <p className="mb-3">
                {lang === 'ID'
                  ? 'Dalam mengoperasikan sistem SiLegal, pengguna setuju untuk:'
                  : 'When utilizing the SiLegal system, users covenant and agree to:'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-slate-900 dark:text-white">
                      {lang === 'ID' ? 'Keakuratan Metadata' : 'Metadata Integrity'}
                    </strong>
                    <span className="text-slate-500 dark:text-slate-400">
                      {lang === 'ID'
                        ? 'Memastikan nomor kontrak, tanggal berlaku, dan nilai komersial diinput sesuai dokumen fisik.'
                        : 'Ensuring official contract numbers, validity dates, and values match executed physical copies.'}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-slate-900 dark:text-white">
                      {lang === 'ID' ? 'Auditability' : 'Audit Trail Compliance'}
                    </strong>
                    <span className="text-slate-500 dark:text-slate-400">
                      {lang === 'ID'
                        ? 'Memahami bahwa seluruh aksi pengeditan dan pengunggahan dicatat dalam Log Audit.'
                        : 'Acknowledging that all document edits, approvals, and uploads generate audit trail entries.'}
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
                  {lang === 'ID'
                    ? 'Integrasi Google Workspace & Layanan Pihak Ketiga'
                    : 'Google Workspace & 3rd Party Integration'}
                </h2>
              </div>
              <p className="mb-3">
                {lang === 'ID'
                  ? 'Aplikasi menyediakan fitur otentikasi opsional Google OAuth 2.0 untuk sinkronisasi folder Google Drive dan Google Sheets:'
                  : 'The platform provides optional Google OAuth 2.0 authentication for Google Drive and Google Sheets synchronization:'}
              </p>
              <ul className="list-disc pl-5 space-y-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                <li>
                  {lang === 'ID'
                    ? 'Penggunaan otorisasi Google API terbatas semata-mata untuk mengorganisir dokumen PDF kontrak ke subfolder partner yang sesuai.'
                    : 'Google API authorizations are strictly scoped to archiving PDF contract files into structured partner folders.'}
                </li>
                <li>
                  {lang === 'ID'
                    ? 'Integrasi mematuhi penuh Google API Limited Use Policy dan Kebijakan Privasi aplikasi.'
                    : 'All integrations strictly adhere to the Google API Limited Use Policy and our Privacy Policy.'}
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
                  {lang === 'ID' ? 'Batasan Tanggung Jawab & Jaminan Service Level' : 'Limitation of Liability & SLAs'}
                </h2>
              </div>
              <p>
                {lang === 'ID'
                  ? 'Sistem SiLegal disediakan secara internal untuk mendukung ketaatan azas dan efisiensi legalitas. Perusahaan melakukan upaya terbaik untuk menjadwalkan pengingat masa berlaku (Notice Period), namun keputusan hukum formal tetap mengacu pada naskah fisik dan perjanjian tertulis yang ditandatangani para pihak.'
                  : 'The SiLegal system is deployed to facilitate contract governance. While automated expiration reminder workflows operate continuously, legal obligations and notice periods strictly defer to executed physical contracts.'}
              </p>
            </section>

            {/* Section 7 */}
            <section id="tos-7" className="scroll-mt-6 border-t border-slate-100 dark:border-slate-800 pt-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-bold">
                  7
                </span>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {lang === 'ID' ? 'Perubahan Ketentuan & Pemutusan Akses' : 'Modifications & Access Termination'}
                </h2>
              </div>
              <p>
                {lang === 'ID'
                  ? 'Perusahaan berhak memperbarui Syarat & Ketentuan ini sewaktu-waktu. Pengguna yang melanggar ketentuan kerahasiaan atau otorisasi dapat dikenakan tindakan penangguhan (suspend) atau pencabutan akun secara langsung oleh Administrator.'
                  : 'The Company reserves the right to amend these terms. Violation of confidentiality covenants or security policies will result in immediate account suspension or termination by System Administrators.'}
              </p>
            </section>

            {/* Section 8 */}
            <section id="tos-8" className="scroll-mt-6 border-t border-slate-100 dark:border-slate-800 pt-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-bold">
                  8
                </span>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {lang === 'ID' ? 'Hukum yang Berlaku & Kontak Legal' : 'Governing Law & Legal Contact'}
                </h2>
              </div>
              <p className="mb-4">
                {lang === 'ID'
                  ? 'Syarat & Ketentuan ini diatur dan ditafsirkan sesuai dengan hukum Republik Indonesia. Untuk pertanyaan lebih lanjut, silakan hubungi tim Legal Operations:'
                  : 'These Terms of Service are governed by and construed in accordance with the laws of the Republic of Indonesia. For legal inquiries, please contact:'}
              </p>

              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">
                    {lang === 'ID' ? 'Tim Legal & Kepatuhan' : 'Legal Operations & Compliance'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Legal Operations & Compliance Department
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-2">
                    Jakarta, Republik Indonesia
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <a
                    href="mailto:legal@company.com"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-sm"
                  >
                    <Mail className="w-4 h-4" />
                    <span>legal@company.com</span>
                  </a>
                </div>
              </div>
            </section>
          </div>

          {/* Footer of the Document */}
          <div className="mt-10 pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400 dark:text-slate-500">
            <p>2026 ACL. All rights reserved.</p>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
              >
                {lang === 'ID' ? '← Kembali ke Halaman Login' : '← Back to Login Screen'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
