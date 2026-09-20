import React, { useState } from 'react';
import {
  Shield,
  Check,
  X,
  ShieldCheck,
  CheckCircle2,
  AlertOctagon,
  FileCheck,
  Building2,
  Users,
  Eye,
  FileText,
  FilePenLine,
  Trash2,
  Sliders,
  Award,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

interface RbacMatrixProps {
  matrixData?: {
    statement: Record<string, string[]>;
    roles: Record<
      string,
      {
        name: string;
        scope?: string;
        description: string;
        permissions: Record<string, string[]>;
      }
    >;
  };
}

export const AdminRbacMatrixTab: React.FC<RbacMatrixProps> = ({ matrixData }) => {
  const { t, language } = useLanguage();
  const isID = language === 'ID';

  // 5 Standard Roles definitions
  const roles = matrixData?.roles || {
    superuser: {
      name: 'Superuser',
      scope: 'System Level',
      description: isID
        ? 'Akses tingkat sistem tertinggi: Kelola akun, peran, konfigurasi platform enterprise, serta memiliki seluruh hak akses operasional & persetujuan dokumen (seperti Admin) di semua divisi secara global.'
        : 'Highest system level: Manage user accounts, roles, audit logs, and possesses all administrative, operational, and approval authorities globally.',
      permissions: {
        user: ['create', 'read', 'update', 'delete', 'ban', 'impersonate', 'set-role', 'set-password'],
        session: ['list', 'revoke', 'delete'],
        organization: ['create', 'read', 'update', 'delete', 'set-active'],
        team: ['create', 'read', 'update', 'delete'],
        settings: ['read', 'update'],
        contract: ['create', 'read', 'update', 'delete', 'approve', 'archive'],
        partner: ['create', 'read', 'update', 'delete'],
        report: ['view', 'export'],
      },
    },
    admin: {
      name: 'Admin',
      scope: 'Global Level',
      description: isID
        ? 'Tinjau, edit, dan berikan persetujuan akhir (final approval) semua dokumen.'
        : 'Review, edit, and provide final approval on all organizational documents.',
      permissions: {
        user: ['read', 'list'],
        session: ['list'],
        organization: ['read'],
        team: ['read'],
        contract: ['create', 'read', 'update', 'delete', 'approve', 'archive'],
        partner: ['create', 'read', 'update', 'delete'],
        report: ['view', 'export'],
        settings: ['read'],
      },
    },
    manager: {
      name: 'Manager',
      scope: 'Group / Dept Level',
      description: isID
        ? 'Persetujuan internal tingkat grup/departemen sebelum ke Approver final.'
        : 'Internal department approval before forwarding to the final approver.',
      permissions: {
        user: ['read'],
        session: [],
        organization: ['read'],
        team: ['read'],
        contract: ['create', 'read', 'update', 'approve-internal'],
        partner: ['create', 'read', 'update'],
        report: ['view'],
        settings: [],
      },
    },
    editor: {
      name: 'Editor',
      scope: 'Group / Dept Level',
      description: isID
        ? 'Buat, unggah, dan revisi draf dokumen mitra dan kontrak di grupnya.'
        : 'Create, upload, and revise document drafts in their respective department.',
      permissions: {
        user: ['read'],
        session: [],
        organization: ['read'],
        team: ['read'],
        contract: ['create', 'read', 'update'],
        partner: ['create', 'read', 'update'],
        report: ['view'],
        settings: [],
      },
    },
    viewer: {
      name: 'Viewer',
      scope: 'Restricted / Read-Only',
      description: isID
        ? 'Hanya membaca dan melihat dokumen yang sudah berstatus final/aktif.'
        : 'Read-only access to documents that are in final or active status.',
      permissions: {
        user: ['read'],
        session: [],
        organization: ['read'],
        team: ['read'],
        contract: ['read'],
        partner: ['read'],
        report: ['view'],
        settings: [],
      },
    },
  };

  // 8 Capability Rows matching User's Exact RBAC Specification
  const rbacTableRows = [
    {
      id: 'system_config',
      label: isID ? 'User & System Config' : 'User & System Config',
      desc: isID ? 'Tambah user, ubah role, setting organisasi' : 'Add users, edit roles, system settings',
      superuser: { type: 'allow', text: '✅' },
      admin: { type: 'deny', text: '❌' },
      manager: { type: 'deny', text: '❌' },
      editor: { type: 'deny', text: '❌' },
      viewer: { type: 'deny', text: '❌' },
    },
    {
      id: 'audit_log',
      label: isID ? 'View Audit Log' : 'View Audit Log',
      desc: isID ? 'Melihat riwayat aktivitas dan log keamanan' : 'Audit logs & security event timeline',
      superuser: { type: 'allow', text: '✅' },
      admin: { type: 'allow', text: '✅' },
      manager: { type: 'deny', text: '❌' },
      editor: { type: 'deny', text: '❌' },
      viewer: { type: 'deny', text: '❌' },
    },
    {
      id: 'create_draft',
      label: isID ? 'Create / Upload Draft' : 'Create / Upload Draft',
      desc: isID ? 'Buat partner baru, draf kontrak, IO, invoice' : 'Create partner, draft contract, IO, invoice',
      superuser: { type: 'global', text: '📑 Global' },
      admin: { type: 'global', text: '📑 Global' },
      manager: { type: 'group', text: '🏢 Group' },
      editor: { type: 'group', text: '🏢 Group' },
      viewer: { type: 'deny', text: '❌' },
    },
    {
      id: 'edit_draft',
      label: isID ? 'Edit Draft' : 'Edit Draft',
      desc: isID ? 'Mengubah rincian draf dokumen yang belum final' : 'Edit contract/partner draft before finalization',
      superuser: { type: 'global', text: '📑 Global' },
      admin: { type: 'global', text: '📑 Global' },
      manager: { type: 'group', text: '🏢 Group' },
      editor: { type: 'own', text: '👤 Own Draft' },
      viewer: { type: 'deny', text: '❌' },
    },
    {
      id: 'internal_approve',
      label: isID ? 'Internal Approve' : 'Internal Approve',
      desc: isID ? 'Persetujuan awal di tingkat divisi/departemen' : 'Initial divisional/department sign-off',
      superuser: { type: 'global', text: '📑 Global' },
      admin: { type: 'global', text: '📑 Global' },
      manager: { type: 'group', text: '🏢 Group' },
      editor: { type: 'deny', text: '❌' },
      viewer: { type: 'deny', text: '❌' },
    },
    {
      id: 'final_approve',
      label: isID ? 'Final Approve' : 'Final Approve',
      desc: isID ? 'Persetujuan akhir eksekutif / penandatanganan' : 'Executive final approval / signing authority',
      superuser: { type: 'global', text: '📑 Global' },
      admin: { type: 'global', text: '📑 Global' },
      manager: { type: 'deny', text: '❌' },
      editor: { type: 'deny', text: '❌' },
      viewer: { type: 'deny', text: '❌' },
    },
    {
      id: 'view_final_doc',
      label: isID ? 'View Final Document' : 'View Final Document',
      desc: isID ? 'Akses baca dokumen berstatus aktif / signed' : 'View final signed contracts & active partners',
      superuser: { type: 'global', text: '📑 Global' },
      admin: { type: 'global', text: '📑 Global' },
      manager: { type: 'group', text: '🏢 Group' },
      editor: { type: 'group', text: '🏢 Group' },
      viewer: { type: 'readonly', text: '👁️ Read-Only' },
    },
    {
      id: 'archive_delete',
      label: isID ? 'Archive / Delete' : 'Archive / Delete',
      desc: isID ? 'Menghapus atau mengarsipkan partner/kontrak' : 'Permanently remove or archive items',
      superuser: { type: 'global', text: '📑 Global' },
      admin: { type: 'global', text: '📑 Global' },
      manager: { type: 'deny', text: '❌' },
      editor: { type: 'deny', text: '❌' },
      viewer: { type: 'deny', text: '❌' },
    },
  ];

  const renderBadge = (cell: { type: string; text: string }) => {
    switch (cell.type) {
      case 'allow':
        return (
          <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
            {cell.text}
          </span>
        );
      case 'deny':
        return (
          <span className="inline-flex items-center justify-center px-2 py-1 rounded-md text-xs font-semibold text-slate-400 dark:text-slate-500">
            {cell.text}
          </span>
        );
      case 'global':
        return (
          <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-md text-xs font-semibold bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300">
            {cell.text}
          </span>
        );
      case 'group':
        return (
          <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
            {cell.text}
          </span>
        );
      case 'own':
        return (
          <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
            {cell.text}
          </span>
        );
      case 'readonly':
        return (
          <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {cell.text}
          </span>
        );
      default:
        return <span>{cell.text}</span>;
    }
  };

  // State for live policy tester
  const [testRole, setTestRole] = useState('manager');
  const [testResource, setTestResource] = useState('contract');
  const [testAction, setTestAction] = useState('approve-internal');

  const roleObj = roles[testRole];
  const allowedActions = roleObj?.permissions[testResource] || [];
  const isAllowed = allowedActions.includes(testAction);

  return (
    <div className="space-y-6">
      {/* 5 Roles Cards Banner */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-emerald-600" />
            <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
              {isID ? 'Struktur 5 Peran (Role) Akses Utama' : '5 Standard RBAC Role Architecture'}
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            {isID ? 'Tingkat Akses & Tanggung Jawab' : 'Access Levels & Responsibilities'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {Object.entries(roles).slice(0, 5).map(([roleKey, role]) => {
            const colorClass =
              roleKey === 'superuser'
                ? 'border-red-200 dark:border-red-900/60 bg-red-50/40 dark:bg-red-950/20'
                : roleKey === 'admin'
                ? 'border-purple-200 dark:border-purple-900/60 bg-purple-50/40 dark:bg-purple-950/20'
                : roleKey === 'manager'
                ? 'border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20'
                : roleKey === 'editor'
                ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900';

            const dotClass =
              roleKey === 'superuser'
                ? 'bg-red-500'
                : roleKey === 'admin'
                ? 'bg-purple-500'
                : roleKey === 'manager'
                ? 'bg-blue-500'
                : roleKey === 'editor'
                ? 'bg-emerald-500'
                : 'bg-slate-400';

            return (
              <div
                key={roleKey}
                className={`rounded-xl border p-4 shadow-xs flex flex-col justify-between transition-all ${colorClass}`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotClass}`} />
                      <h4 className="font-bold text-xs text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                        {role.name}
                      </h4>
                    </div>
                  </div>
                  <div className="mb-2">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                      {role.scope || 'System'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {role.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main RBAC Matrix Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-600" />
            <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
              {isID ? 'Matriks Hak Akses (RBAC Matrix) & Pembatasan File Legal' : 'RBAC Access Matrix & File Scoping'}
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1 font-medium text-purple-700 dark:text-purple-300">
              📑 Global = Semua Dept
            </span>
            <span>•</span>
            <span className="inline-flex items-center gap-1 font-medium text-blue-700 dark:text-blue-300">
              🏢 Group = Sesuai Internal PIC Dept
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4 w-[240px]">{isID ? 'Hak Akses / Aksi' : 'Capability / Action'}</th>
                <th className="py-3 px-3 text-center">Superuser</th>
                <th className="py-3 px-3 text-center">Admin</th>
                <th className="py-3 px-3 text-center">Manager</th>
                <th className="py-3 px-3 text-center">Editor</th>
                <th className="py-3 px-3 text-center">Viewer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rbacTableRows.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="py-3.5 px-4 font-medium text-slate-900 dark:text-slate-100">
                    <div className="font-semibold">{row.label}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-normal">
                      {row.desc}
                    </div>
                  </td>
                  <td className="py-3.5 px-3 text-center">{renderBadge(row.superuser)}</td>
                  <td className="py-3.5 px-3 text-center">{renderBadge(row.admin)}</td>
                  <td className="py-3.5 px-3 text-center">{renderBadge(row.manager)}</td>
                  <td className="py-3.5 px-3 text-center">{renderBadge(row.editor)}</td>
                  <td className="py-3.5 px-3 text-center">{renderBadge(row.viewer)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Internal PIC & Department Scope Logic Explanation Card */}
      <div className="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-linear-to-r from-blue-50/60 via-white to-blue-50/30 dark:from-blue-950/30 dark:via-slate-900 dark:to-blue-950/20 p-5 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div className="space-y-1.5">
            <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
              {isID
                ? 'Logika Pembatasan Berdasarkan "Internal PIC" & "Departmens"'
                : 'Scoping Rules Governed by "Internal PIC" & "Departmens"'}
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {isID ? (
                <>
                  Pada formulir <strong>&quot;Add New Partner&quot;</strong>, isian <strong>&quot;Internal PIC&quot;</strong> secara default terisi otomatis sesuai dengan <strong>Departmens</strong> di mana user terdaftar (contoh: <em>Commercial &amp; Marketing</em>). Pembatasan akses mitra serta semua dokumen di bawahnya (<strong>Kontrak</strong>, <strong>Insertion Order / IO</strong>, <strong>Invoice</strong>, dll.) otomatis mengacu pada nilai <em>Internal PIC</em> pada Partner tersebut.
                </>
              ) : (
                <>
                  On the <strong>&quot;Add New Partner&quot;</strong> form, the <strong>&quot;Internal PIC&quot;</strong> field defaults automatically to the user&apos;s registered <strong>Department</strong>. Access control for the partner and all child documents (<strong>Contracts</strong>, <strong>IOs</strong>, <strong>Invoices</strong>) inherits from the partner&apos;s internal PIC value.
                </>
              )}
            </p>
            <div className="pt-2 flex flex-wrap gap-2 text-[11px]">
              <span className="px-2.5 py-1 rounded bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 font-medium">
                Superuser &amp; Admin: Akses Global (Semua Dept)
              </span>
              <span className="px-2.5 py-1 rounded bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 font-medium">
                Manager &amp; Editor: Akses Group (Hanya Dept Terdaftar)
              </span>
              <span className="px-2.5 py-1 rounded bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 font-medium">
                Viewer: Read-Only (Hanya Dokumen Final Dept)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Live Policy Tester */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
            {t('admin.rbac_tester_title', 'Uji Evaluasi Izin Akses (Live Permission Policy Checker)')}
          </h4>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          {t('admin.rbac_tester_desc', 'Pilih peran pengguna, sumber daya, dan aksi untuk memverifikasi apakah Better Auth Access Control mengizinkan atau menolak tindakan tersebut.')}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end mb-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              {t('admin.rbac_role_label', 'Peran Pengguna (Role)')}
            </label>
            <select
              value={testRole}
              onChange={(e) => setTestRole(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
            >
              <option value="superuser">Superuser (System Level)</option>
              <option value="admin">Admin (Global Level)</option>
              <option value="manager">Manager (Group Level)</option>
              <option value="editor">Editor (Group Level)</option>
              <option value="viewer">Viewer (Restricted)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              {t('admin.col_resource', 'Sumber Daya (Resource)')}
            </label>
            <select
              value={testResource}
              onChange={(e) => setTestResource(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
            >
              <option value="contract">contract ({isID ? 'Kontrak & Perjanjian' : 'Contracts'})</option>
              <option value="partner">partner ({isID ? 'Mitra / Vendor DD' : 'Partners'})</option>
              <option value="report">report ({isID ? 'Laporan Finansial' : 'Reports'})</option>
              <option value="user">user ({isID ? 'Akun Pengguna' : 'Users'})</option>
              <option value="session">session ({isID ? 'Sesi Login' : 'Sessions'})</option>
              <option value="organization">organization ({isID ? 'Organisasi' : 'Organizations'})</option>
              <option value="team">team ({isID ? 'Departmens / Tim' : 'Departments'})</option>
              <option value="settings">settings ({isID ? 'Konfigurasi Sistem' : 'Settings'})</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              {t('admin.rbac_action_label', 'Tindakan (Action)')}
            </label>
            <select
              value={testAction}
              onChange={(e) => setTestAction(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
            >
              <option value="create">create (Buat baru)</option>
              <option value="read">read (Lihat / Baca)</option>
              <option value="update">update (Edit / Revisi)</option>
              <option value="delete">delete (Hapus / Hapus permanen)</option>
              <option value="approve-internal">approve-internal (Persetujuan Divisi)</option>
              <option value="approve">approve (Final Approval)</option>
              <option value="archive">archive (Arsipkan)</option>
              <option value="export">export (Unduh Laporan)</option>
              <option value="set-role">set-role (Atur Peran Akun)</option>
              <option value="ban">ban (Cekal Pengguna)</option>
            </select>
          </div>

          <div className="sm:col-span-1">
            <div
              className={`p-2.5 rounded-lg border flex items-center justify-between text-xs font-medium ${
                isAllowed
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-300'
                  : 'bg-red-50 border-red-300 text-red-800 dark:bg-red-950/60 dark:border-red-800 dark:text-red-300'
              }`}
            >
              <div className="flex items-center gap-1.5">
                {isAllowed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertOctagon className="w-4 h-4 text-red-600" />
                )}
                <span>
                  {isAllowed
                    ? isID
                      ? 'DIIZINKAN (ALLOW)'
                      : 'ALLOWED'
                    : isID
                    ? 'DITOLAK (FORBIDDEN)'
                    : 'FORBIDDEN (403)'}
                </span>
              </div>
              <span className="font-mono text-[11px]">{isAllowed ? '200 OK' : '403'}</span>
            </div>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-xs font-mono text-slate-600 dark:text-slate-300">
          authClient.hasPermission({'{'} role: &quot;{testRole}&quot;, resource: &quot;{testResource}&quot;, action: &quot;{testAction}&quot; {'}'}) =&gt;{' '}
          <strong className={isAllowed ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
            {isAllowed ? 'true (Aksi Diizinkan)' : 'false (Aksi Dibatasi)'}
          </strong>
        </div>
      </div>
    </div>
  );
};
