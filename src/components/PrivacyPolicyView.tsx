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

interface PrivacyPolicyViewProps {
  onBack?: () => void;
}

export const PrivacyPolicyView: React.FC<PrivacyPolicyViewProps> = ({ onBack }) => {
  const { theme } = useTheme();
  const [lang, setLang] = useState<'ID' | 'EN'>('ID');
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
                <span>{lang === 'ID' ? 'Kembali ke Login' : 'Back to Login'}</span>
              </button>
            )}
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>SiLegal • Privacy Policy</span>
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
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 mb-3">
                <Shield className="w-3.5 h-3.5" />
                {lang === 'ID' ? 'Dokumen Hukum & Kepatuhan' : 'Legal & Compliance Document'}
              </div>
              <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                {lang === 'ID' ? 'Kebijakan Privasi' : 'Privacy Policy'}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                {lang === 'ID'
                  ? 'Sistem Manajemen Kontrak Legal & Dokumen Korporat (SiLegal)'
                  : 'Enterprise Legal Contract & Corporate Document Management System (SiLegal)'}
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
              <div className="flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400 mb-2">
                <Lock className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  {lang === 'ID' ? 'Keamanan Korporasi' : 'Enterprise Security'}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {lang === 'ID'
                  ? 'Seluruh data kontrak dan dokumen due diligence dilindungi enkripsi data dan kontrol akses ketat (RBAC).'
                  : 'All contract data and due diligence documents are protected with encryption and strict Role-Based Access Controls (RBAC).'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center gap-2.5 text-blue-600 dark:text-blue-400 mb-2">
                <Cloud className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  {lang === 'ID' ? 'Kepatuhan Google API' : 'Google API Compliance'}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {lang === 'ID'
                  ? 'Penggunaan data Google Drive & Sheets mematuhi penuh Google API Limited Use Policy. Tidak ada penjualan data.'
                  : 'Google Drive & Sheets integration fully adheres to the Google API Limited Use Policy. No data is ever sold.'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center gap-2.5 text-amber-600 dark:text-amber-400 mb-2">
                <UserCheck className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  {lang === 'ID' ? 'Log Audit & Hak Data' : 'Audit Trail & Rights'}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {lang === 'ID'
                  ? 'Riwayat akses dicatat untuk transparansi audit. Anda berhak mengelola, memperbarui, atau menghapus otorisasi.'
                  : 'Immutable audit trails are maintained for transparency. Users retain full rights over data access and revocation.'}
              </p>
            </div>
          </div>

          {/* Table of Contents */}
          <div className="p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 mb-8">
            <p className="text-xs font-bold text-emerald-900 dark:text-emerald-300 uppercase tracking-wider mb-2.5">
              {lang === 'ID' ? 'Daftar Isi Kebijakan:' : 'Table of Contents:'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <a href="#section-1" className="text-emerald-700 dark:text-emerald-400 hover:underline">
                1. {lang === 'ID' ? 'Pendahuluan & Ruang Lingkup' : 'Introduction & Scope'}
              </a>
              <a href="#section-2" className="text-emerald-700 dark:text-emerald-400 hover:underline">
                2. {lang === 'ID' ? 'Informasi yang Kami Kumpulkan' : 'Information We Collect'}
              </a>
              <a href="#section-3" className="text-emerald-700 dark:text-emerald-400 hover:underline">
                3. {lang === 'ID' ? 'Tujuan & Cara Penggunaan Data' : 'How We Use Your Data'}
              </a>
              <a href="#section-4" className="text-emerald-700 dark:text-emerald-400 hover:underline font-semibold">
                4. {lang === 'ID' ? 'Kepatuhan Kebijakan Data Pengguna Google API' : 'Google API Limited Use Compliance'}
              </a>
              <a href="#section-5" className="text-emerald-700 dark:text-emerald-400 hover:underline">
                5. {lang === 'ID' ? 'Keamanan & Perlindungan Data' : 'Data Security & Protection'}
              </a>
              <a href="#section-6" className="text-emerald-700 dark:text-emerald-400 hover:underline">
                6. {lang === 'ID' ? 'Penyimpanan & Retensi Data' : 'Data Retention & Deletion'}
              </a>
              <a href="#section-7" className="text-emerald-700 dark:text-emerald-400 hover:underline">
                7. {lang === 'ID' ? 'Hak & Kendali Pengguna' : 'User Rights & Controls'}
              </a>
              <a href="#section-8" className="text-emerald-700 dark:text-emerald-400 hover:underline">
                8. {lang === 'ID' ? 'Kontak & Informasi Perusahaan' : 'Contact & Corporate Information'}
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
                  {lang === 'ID' ? 'Pendahuluan & Ruang Lingkup' : 'Introduction & Scope'}
                </h2>
              </div>
              <p className="mb-3">
                {lang === 'ID'
                  ? 'Kebijakan Privasi ini mengatur bagaimana platform SiLegal ("Aplikasi", "Kami", atau "Layanan") mengumpulkan, menggunakan, menyimpan, memproses, dan melindungi data pribadi serta informasi korporat pada aplikasi SiLegal (Sistem Manajemen Kontrak & Dokumen Legal).'
                  : 'This Privacy Policy governs how the SiLegal platform ("Application", "We", or "Service") collects, uses, stores, processes, and protects personal data and corporate information within the SiLegal application (Legal Contract & Document Management System).'}
              </p>
              <p>
                {lang === 'ID'
                  ? 'Aplikasi ini dirancang khusus untuk operasional manajemen kontrak internal, verifikasi kepatuhan vendor/partner (Due Diligence), penelusuran Insertion Order (IO), serta pengingat masa berlaku dan Notice Period sesuai hukum Republik Indonesia (termasuk UU No. 27 Tahun 2022 tentang Perlindungan Data Pribadi).'
                  : 'This application is dedicated to internal contract management, partner/vendor compliance verification (Due Diligence), Insertion Order (IO) tracking, and notice period alert workflows in compliance with applicable laws (including Indonesian Law No. 27/2022 on Personal Data Protection).'}
              </p>
            </section>

            {/* Section 2 */}
            <section id="section-2" className="scroll-mt-6 border-t border-slate-100 dark:border-slate-800 pt-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                  2
                </span>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {lang === 'ID' ? 'Informasi yang Kami Kumpulkan' : 'Information We Collect'}
                </h2>
              </div>
              <p className="mb-3">
                {lang === 'ID'
                  ? 'Kami hanya mengumpulkan data yang diperlukan secara sah untuk menjalankan operasional administrasi hukum dan kontrak:'
                  : 'We strictly collect information necessary for legitimate corporate legal administration and contract lifecycle operations:'}
              </p>
              <ul className="list-disc pl-5 space-y-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                <li>
                  <strong className="text-slate-800 dark:text-slate-200">
                    {lang === 'ID' ? 'Data Akun & Pengguna:' : 'Account & User Credentials:'}
                  </strong>{' '}
                  {lang === 'ID'
                    ? 'Nama lengkap, alamat email korporat, kredensial login terenkripsi, peran akses (Admin, Legal, Finance, Viewer), dan status akun.'
                    : 'Full name, corporate email address, hashed credentials, role-based authorization level, and account status.'}
                </li>
                <li>
                  <strong className="text-slate-800 dark:text-slate-200">
                    {lang === 'ID' ? 'Data Kontrak & Komersial:' : 'Contract & Commercial Metadata:'}
                  </strong>{' '}
                  {lang === 'ID'
                    ? 'Nomor kontrak resmi (misal: xx/PKS/xx/xxxx, xx/ADD/xx/xxxx), judul perjanjian, nama mitra/vendor, tanggal mulai, tanggal berakhir, nilai komersial, jangka waktu, dan klausul perpanjangan otomatis (auto-renewal).'
                    : 'Official contract registry numbers, agreement titles, partner names, commencement and expiration dates, commercial commitment values, duration terms, and auto-renewal stipulations.'}
                </li>
                <li>
                  <strong className="text-slate-800 dark:text-slate-200">
                    {lang === 'ID' ? 'Dokumen Due Diligence Legal Mitra:' : 'Partner Due Diligence Documentation:'}
                  </strong>{' '}
                  {lang === 'ID'
                    ? 'Berkas verifikasi identitas badan usaha mencakup NIB, NPWP Perusahaan, Akta Pendirian & Perubahan Terakhir, KTP Direksi/Penanggung Jawab, Rekening Bank Resmi, dan Non-Disclosure Agreement (NDA).'
                    : 'Corporate compliance files including Business Identification Number (NIB), Tax ID (NPWP), Articles of Incorporation, Director Identification (KTP/Passport), Official Bank Accounts, and Non-Disclosure Agreements (NDA).'}
                </li>
                <li>
                  <strong className="text-slate-800 dark:text-slate-200">
                    {lang === 'ID' ? 'Log Audit & Aktivitas Sistem:' : 'System & Audit Logs:'}
                  </strong>{' '}
                  {lang === 'ID'
                    ? 'Pencatatan stempel waktu (timestamp), riwayat pembuatan/pembaruan kontrak, pengunggahan berkas, alamat IP sesi, dan log notifikasi.'
                    : 'Timestamped records of contract actions, document uploads, session identifiers, IP addresses, and reminder dispatches.'}
                </li>
                <li>
                  <strong className="text-slate-800 dark:text-slate-200">
                    {lang === 'ID' ? 'Data Integrasi OAuth 2.0 (Google Workspace):' : 'OAuth 2.0 Integration Tokens:'}
                  </strong>{' '}
                  {lang === 'ID'
                    ? 'Token otentikasi sementara dari Google Identity untuk sinkronisasi Google Drive dan Google Sheets.'
                    : 'Temporary OAuth access tokens granted by users to enable structured Google Drive uploads and Google Sheets backups.'}
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
                  {lang === 'ID' ? 'Tujuan & Cara Penggunaan Data' : 'How We Use Your Data'}
                </h2>
              </div>
              <p className="mb-3">
                {lang === 'ID'
                  ? 'Data yang diproses digunakan semata-mata untuk kepentingan legalitas, manajemen arsip, dan mitigasi risiko operasional perusahaan:'
                  : 'All processed data is utilized strictly for corporate legal governance, digital archiving, and operational risk mitigation:'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-slate-900 dark:text-white">
                      {lang === 'ID' ? 'Manajemen Siklus Kontrak' : 'Contract Lifecycle Tracking'}
                    </strong>
                    <span className="text-slate-500 dark:text-slate-400">
                      {lang === 'ID'
                        ? 'Memantau tanggal aktif, addendum perpanjangan, dan peringatan notice period.'
                        : 'Tracking active dates, amendment addendums, and notice period deadlines.'}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-slate-900 dark:text-white">
                      {lang === 'ID' ? 'Pengarsipan Google Drive Berjenjang' : 'Tiered Google Drive Archiving'}
                    </strong>
                    <span className="text-slate-500 dark:text-slate-400">
                      {lang === 'ID'
                        ? 'Menyimpan berkas PDF kontrak dan DD ke folder partner yang tertata secara otomatis.'
                        : 'Organizing PDF contracts and compliance documents into structured partner subfolders.'}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-slate-900 dark:text-white">
                      {lang === 'ID' ? 'Sinkronisasi Spreadsheet Real-Time' : 'Real-Time Sheet Backup'}
                    </strong>
                    <span className="text-slate-500 dark:text-slate-400">
                      {lang === 'ID'
                        ? 'Memastikan backup data tabular akurat pada spreadsheet master perusahaan.'
                        : 'Maintaining synced tabular backups across authorized corporate master spreadsheets.'}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block text-slate-900 dark:text-white">
                      {lang === 'ID' ? 'Audit & Kepatuhan Internal' : 'Audit Trails & Compliance'}
                    </strong>
                    <span className="text-slate-500 dark:text-slate-400">
                      {lang === 'ID'
                        ? 'Memenuhi standar tata kelola perusahaan yang baik dan akuntabilitas hukum.'
                        : 'Fulfilling corporate governance compliance and legal accountability requirements.'}
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
                    {lang === 'ID'
                      ? 'Kepatuhan Khusus Kebijakan Data Pengguna Google API'
                      : 'Google API Services User Data Policy Compliance'}
                  </h2>
                </div>

                <div className="space-y-3 text-xs sm:text-sm text-blue-900 dark:text-blue-200">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {lang === 'ID'
                      ? 'Klausul Keterbukaan Penggunaan Terbatas (Limited Use Disclosure):'
                      : 'Limited Use Disclosure Requirement:'}
                  </p>
                  <blockquote className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900 text-xs font-mono text-slate-800 dark:text-slate-200 leading-relaxed">
                    {lang === 'ID'
                      ? 'Penggunaan dan transfer informasi yang diterima oleh aplikasi SiLegal dari Google APIs ke aplikasi lain akan sepenuhnya mematuhi Google API Services User Data Policy, termasuk ketentuan Limited Use (Penggunaan Terbatas).'
                      : "SiLegal's use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements."}
                  </blockquote>

                  <p>
                    {lang === 'ID'
                      ? 'Dalam integrasi Google Workspace (Google Drive & Google Sheets):'
                      : 'Specifically regarding Google Workspace integration (Google Drive & Sheets):'}
                  </p>

                  <ul className="list-disc pl-5 space-y-1.5 text-xs">
                    <li>
                      <strong>{lang === 'ID' ? 'Tidak Dijual / Tidak Dikomersialkan:' : 'No Sale of User Data:'}</strong>{' '}
                      {lang === 'ID'
                        ? 'Kami TIDAK AKAN PERNAH menjual, menyewakan, atau memperdagangkan data Google Anda kepada pihak ketiga manapun.'
                        : 'We NEVER sell, lease, or monetize your Google user data or uploaded files to any third party.'}
                    </li>
                    <li>
                      <strong>{lang === 'ID' ? 'Bukan untuk Iklan:' : 'No Advertising Usage:'}</strong>{' '}
                      {lang === 'ID'
                        ? 'Data dari Google API tidak pernah digunakan untuk penargetan iklan atau profil komersial.'
                        : 'Google API data is never used for serving advertisements or behavioral profiling.'}
                    </li>
                    <li>
                      <strong>{lang === 'ID' ? 'Tujuan Terbatas & Eksklusif:' : 'Exclusive Functional Scope:'}</strong>{' '}
                      {lang === 'ID'
                        ? 'Akses Google Drive hanya digunakan untuk mengunggah dan menyusun file PDF kontrak serta dokumen DD ke folder target yang Anda tentukan.'
                        : 'Google Drive access is strictly limited to saving and organizing PDF contract documents into designated partner subfolders.'}
                    </li>
                    <li>
                      <strong>{lang === 'ID' ? 'Pencabutan Akses Kapan Saja:' : 'Revocation Rights:'}</strong>{' '}
                      {lang === 'ID'
                        ? 'Pengguna dapat mencabut otorisasi Google OAuth kapan saja melalui menu Pengaturan aplikasi atau melalui Halaman Keamanan Akun Google Anda.'
                        : 'Users can revoke Google OAuth permissions at any time via the in-app Settings tab or your Google Account Security Dashboard.'}
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
                  {lang === 'ID' ? 'Keamanan & Perlindungan Data' : 'Data Security & Safeguards'}
                </h2>
              </div>
              <p className="mb-3">
                {lang === 'ID'
                  ? 'Kami menerapkan standar keamanan teknis dan organisasional tingkat korporat:'
                  : 'We enforce enterprise-grade technological and organizational safeguards:'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                  <KeyRound className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mb-1.5" />
                  <strong className="block text-slate-900 dark:text-white mb-1">
                    {lang === 'ID' ? 'Enkripsi Data' : 'End-to-End Encryption'}
                  </strong>
                  <span className="text-slate-500 dark:text-slate-400">
                    {lang === 'ID'
                      ? 'Enkripsi transmisi menggunakan protokol TLS/HTTPS 256-bit untuk semua transfer berkas.'
                      : 'Data in transit is protected via modern TLS/HTTPS 256-bit encryption protocols.'}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                  <UserCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mb-1.5" />
                  <strong className="block text-slate-900 dark:text-white mb-1">
                    {lang === 'ID' ? 'Kontrol Akses Berlapis (RBAC)' : 'Role-Based Access (RBAC)'}
                  </strong>
                  <span className="text-slate-500 dark:text-slate-400">
                    {lang === 'ID'
                      ? 'Hanya personil terverifikasi dengan izin khusus yang dapat mengakses dokumen komersial.'
                      : 'Only authorized legal and administrative personnel can access sensitive contract files.'}
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                  <Server className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mb-1.5" />
                  <strong className="block text-slate-900 dark:text-white mb-1">
                    {lang === 'ID' ? 'Log Audit Terpadu' : 'Immutable Audit Trails'}
                  </strong>
                  <span className="text-slate-500 dark:text-slate-400">
                    {lang === 'ID'
                      ? 'Setiap tindakan perubahan dokumen dan sesi masuk dicatat dalam Audit Log yang terlindungi.'
                      : 'All actions and modifications are recorded in tamper-resistant audit logs.'}
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
                  {lang === 'ID' ? 'Penyimpanan & Retensi Data' : 'Data Retention & Deletion'}
                </h2>
              </div>
              <p>
                {lang === 'ID'
                  ? 'Data kontrak dan dokumen pendukung disimpan selama jangka waktu keberlakuan kontrak ditambah periode retensi wajib dokumen korporat sesuai ketentuan perundang-undangan perpajakan dan hukum perusahaan yang berlaku di Indonesia (minimal 5-10 tahun sejak pengakhiran kontrak). Setelah masa retensi berakhir atau atas instruksi legal resmi, berkas akan diarsipkan atau dihapus secara aman.'
                  : 'Contract files and records are retained for the duration of the agreement plus mandatory legal and tax retention periods under Indonesian law (typically 5 to 10 years post-termination). Upon retention expiry or formal legal instruction, records are archived or securely purged.'}
              </p>
            </section>

            {/* Section 7 */}
            <section id="section-7" className="scroll-mt-6 border-t border-slate-100 dark:border-slate-800 pt-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                  7
                </span>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {lang === 'ID' ? 'Hak & Kendali Pengguna' : 'User Rights & Controls'}
                </h2>
              </div>
              <p className="mb-2">
                {lang === 'ID'
                  ? 'Sesuai Undang-Undang Perlindungan Data Pribadi (UU PDP), Anda memiliki hak untuk:'
                  : 'In accordance with applicable data protection legislation, you possess the right to:'}
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                <li>{lang === 'ID' ? 'Meminta konfirmasi dan akses terhadap data pribadi yang disimpan.' : 'Request access and confirmation regarding your stored personal details.'}</li>
                <li>{lang === 'ID' ? 'Meminta perbaikan atau pembaruan data yang tidak akurat.' : 'Request rectification of inaccurate or outdated information.'}</li>
                <li>{lang === 'ID' ? 'Menarik izin integrasi Google OAuth kapan saja melalui pengaturan.' : 'Revoke Google OAuth integration permissions at any time via Settings.'}</li>
                <li>{lang === 'ID' ? 'Mengunduh salinan cadangan data dalam format standar (Excel / CSV).' : 'Export backups of your data in standardized tabular formats (Excel/CSV).'}</li>
              </ul>
            </section>

            {/* Section 8 */}
            <section id="section-8" className="scroll-mt-6 border-t border-slate-100 dark:border-slate-800 pt-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                  8
                </span>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {lang === 'ID' ? 'Kontak & Informasi Perusahaan' : 'Contact & Corporate Information'}
                </h2>
              </div>
              <p className="mb-4">
                {lang === 'ID'
                  ? 'Jika Anda memiliki pertanyaan, klarifikasi hukum, atau permohonan hak data terkait Kebijakan Privasi ini, silakan hubungi tim Legal & Kepatuhan kami:'
                  : 'For any inquiries, legal clarifications, or privacy requests regarding this Privacy Policy, please contact our Legal & Compliance department:'}
              </p>

              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">
                    {lang === 'ID' ? 'Tim Legal & Kepatuhan' : 'Legal Operations & Compliance'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Legal Operations & Corporate Governance Division
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-2">
                    Jakarta, Republik Indonesia
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <a
                    href="mailto:legal@company.com"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-sm"
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
            <p>© 2026 SiLegal. All rights reserved.</p>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="text-emerald-600 dark:text-emerald-400 hover:underline font-semibold cursor-pointer"
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
