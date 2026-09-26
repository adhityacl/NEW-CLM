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
      scope: t('admin.system_level', 'System Level'),
      description: t('admin.highest_system_level_manage_user_accounts', 'Highest system level: Manage user accounts, roles, audit logs, and possesses all administrative, operational, and approval authorities globally.'),
      permissions: {
        user: ['create', 'read', 'update', 'delete', 'ban', 'set-role', 'set-password'],
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
      scope: t('admin.global_level', 'Global Level'),
      description: t('admin.review_edit_and_provide_final_approval', 'Review, edit, and provide final approval on all organizational documents.'),
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
      scope: t('admin.group_dept_level', 'Group / Dept Level'),
      description: t('admin.internal_department_approval_before_forwarding_t', 'Internal department approval before forwarding to the final approver.'),
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
      scope: t('admin.group_dept_level', 'Group / Dept Level'),
      description: t('admin.create_upload_and_revise_document_drafts', 'Create, upload, and revise document drafts in their respective department.'),
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
      scope: t('admin.restricted_read_only', 'Restricted / Read-Only'),
      description: t('admin.read_only_access_to_documents_that', 'Read-only access to documents that are in final or active status.'),
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
      label: t('admin.user_system_config', 'User & System Config'),
      desc: t('admin.add_users_edit_roles_system_settings', 'Add users, edit roles, system settings'),
      superuser: { type: 'allow', text: '✅' },
      admin: { type: 'deny', text: '❌' },
      manager: { type: 'deny', text: '❌' },
      editor: { type: 'deny', text: '❌' },
      viewer: { type: 'deny', text: '❌' },
    },
    {
      id: 'audit_log',
      label: t('admin.view_audit_log', 'View Audit Log'),
      desc: t('admin.audit_logs_security_event_timeline', 'Audit logs & security event timeline'),
      superuser: { type: 'allow', text: '✅' },
      admin: { type: 'allow', text: '✅' },
      manager: { type: 'deny', text: '❌' },
      editor: { type: 'deny', text: '❌' },
      viewer: { type: 'deny', text: '❌' },
    },
    {
      id: 'create_draft',
      label: t('admin.create_upload_draft', 'Create / Upload Draft'),
      desc: t('admin.create_partner_draft_contract_io_invoice', 'Create partner, draft contract, IO, invoice'),
      superuser: { type: 'global', text: t('admin.global', '📑 Global') },
      admin: { type: 'global', text: t('admin.global', '📑 Global') },
      manager: { type: 'group', text: t('admin.group', '🏢 Group') },
      editor: { type: 'group', text: t('admin.group', '🏢 Group') },
      viewer: { type: 'deny', text: '❌' },
    },
    {
      id: 'edit_draft',
      label: t('admin.edit_draft', 'Edit Draft'),
      desc: t('admin.edit_contract_partner_draft_before_finalization', 'Edit contract/partner draft before finalization'),
      superuser: { type: 'global', text: t('admin.global', '📑 Global') },
      admin: { type: 'global', text: t('admin.global', '📑 Global') },
      manager: { type: 'group', text: t('admin.group', '🏢 Group') },
      editor: { type: 'own', text: t('admin.own_draft', '👤 Own Draft') },
      viewer: { type: 'deny', text: '❌' },
    },
    {
      id: 'internal_approve',
      label: t('admin.internal_approve', 'Internal Approve'),
      desc: t('admin.initial_divisional_department_sign_off', 'Initial divisional/department sign-off'),
      superuser: { type: 'global', text: t('admin.global', '📑 Global') },
      admin: { type: 'global', text: t('admin.global', '📑 Global') },
      manager: { type: 'group', text: t('admin.group', '🏢 Group') },
      editor: { type: 'deny', text: '❌' },
      viewer: { type: 'deny', text: '❌' },
    },
    {
      id: 'final_approve',
      label: t('admin.final_approve', 'Final Approve'),
      desc: t('admin.executive_final_approval_signing_authority', 'Executive final approval / signing authority'),
      superuser: { type: 'global', text: t('admin.global', '📑 Global') },
      admin: { type: 'global', text: t('admin.global', '📑 Global') },
      manager: { type: 'deny', text: '❌' },
      editor: { type: 'deny', text: '❌' },
      viewer: { type: 'deny', text: '❌' },
    },
    {
      id: 'view_final_doc',
      label: t('admin.view_final_document', 'View Final Document'),
      desc: t('admin.view_final_signed_contracts_active_partners', 'View final signed contracts & active partners'),
      superuser: { type: 'global', text: t('admin.global', '📑 Global') },
      admin: { type: 'global', text: t('admin.global', '📑 Global') },
      manager: { type: 'group', text: t('admin.group', '🏢 Group') },
      editor: { type: 'group', text: t('admin.group', '🏢 Group') },
      viewer: { type: 'readonly', text: t('admin.read_only', '👁️ Read-Only') },
    },
    {
      id: 'archive_delete',
      label: t('admin.archive_delete', 'Archive / Delete'),
      desc: t('admin.permanently_remove_or_archive_items', 'Permanently remove or archive items'),
      superuser: { type: 'global', text: t('admin.global', '📑 Global') },
      admin: { type: 'global', text: t('admin.global', '📑 Global') },
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
              {t('admin.5_standard_rbac_role_architecture', '5 Standard RBAC Role Architecture')}
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            {t('admin.access_levels_responsibilities', 'Access Levels & Responsibilities')}
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
                      {role.scope || t('admin.system', 'System')}
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
              {t('admin.rbac_access_matrix_file_scoping', 'RBAC Access Matrix & File Scoping')}
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1 font-medium text-purple-700 dark:text-purple-300">
              {t('admin.global_semua_dept', '📑 Global = Semua Dept')}
            </span>
            <span>•</span>
            <span className="inline-flex items-center gap-1 font-medium text-blue-700 dark:text-blue-300">
              {t('admin.group_sesuai_internal_pic_dept', '🏢 Group = Sesuai Internal PIC Dept')}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4 w-[240px]">{t('admin.capability_action', 'Capability / Action')}</th>
                <th className="py-3 px-3 text-center">{t('admin.superuser', 'Superuser')}</th>
                <th className="py-3 px-3 text-center">{t('admin.admin', 'Admin')}</th>
                <th className="py-3 px-3 text-center">{t('admin.manager', 'Manager')}</th>
                <th className="py-3 px-3 text-center">{t('admin.editor', 'Editor')}</th>
                <th className="py-3 px-3 text-center">{t('admin.viewer', 'Viewer')}</th>
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
              {t('admin.scoping_rules_governed_by_internal_pic', 'Scoping Rules Governed by "Internal PIC" & "Departmens"')}
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {isID ? (
                <>
                  {t('admin.pada_formulir', 'Pada formulir')} <strong>{t('admin.add_new_partner', '"Add New Partner"')}</strong>{t('admin.isian', ', isian')} <strong>{t('admin.internal_pic', '"Internal PIC"')}</strong> {t('admin.secara_default_terisi_otomatis_sesuai_dengan', 'secara default terisi otomatis sesuai dengan')} <strong>{t('admin.departmens', 'Departmens')}</strong> {t('admin.di_mana_user_terdaftar_contoh', 'di mana user terdaftar (contoh:')} <em>{t('admin.commercial_marketing', 'Commercial & Marketing')}</em>{t('admin.pembatasan_akses_mitra_serta_semua_dokumen', '). Pembatasan akses mitra serta semua dokumen di bawahnya (')}<strong>{t('nav.contracts', 'Kontrak')}</strong>, <strong>{t('admin.insertion_order_io', 'Insertion Order / IO')}</strong>, <strong>{t('spending.col_invoice_doc', 'Invoice')}</strong>{t('admin.dll_otomatis_mengacu_pada_nilai', ', dll.) otomatis mengacu pada nilai')} <em>{t('form.partner.internal_pic', 'Internal PIC')}</em> {t('admin.pada_partner_tersebut', 'pada Partner tersebut.')}
                </>
              ) : (
                <>
                  {t('admin.on_the', 'On the')} <strong>{t('admin.add_new_partner', '"Add New Partner"')}</strong> {t('admin.form_the', 'form, the')} <strong>{t('admin.internal_pic', '"Internal PIC"')}</strong> {t('admin.field_defaults_automatically_to_the_user', 'field defaults automatically to the user\'s registered')} <strong>{t('admin.col_dept', 'Department')}</strong>{t('admin.access_control_for_the_partner_and', '. Access control for the partner and all child documents (')}<strong>{t('nav.contracts', 'Contracts')}</strong>, <strong>{t('admin.ios', 'IOs')}</strong>, <strong>{t('spending.invoice_suffix', 'Invoices')}</strong>{t('admin.inherits_from_the_partner_s_internal', ') inherits from the partner\'s internal PIC value.')}
                </>
              )}
            </p>
            <div className="pt-2 flex flex-wrap gap-2 text-[11px]">
              <span className="px-2.5 py-1 rounded bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 font-medium">
                {t('admin.superuser_admin_akses_global_semua_dept', 'Superuser & Admin: Akses Global (Semua Dept)')}
              </span>
              <span className="px-2.5 py-1 rounded bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 font-medium">
                {t('admin.manager_editor_akses_group_hanya_dept', 'Manager & Editor: Akses Group (Hanya Dept Terdaftar)')}
              </span>
              <span className="px-2.5 py-1 rounded bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300 font-medium">
                {t('admin.viewer_read_only_hanya_dokumen_final', 'Viewer: Read-Only (Hanya Dokumen Final Dept)')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Live Policy Tester */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <h4 className="font-semibold text-sm text-slate-900 dark:text-slate-100">
            {t('admin.rbac_tester_title', 'Uji Evaluasi Izin Akses (Live Permission Policy Checker)')}
          </h4>
        </div>

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
              <option value="superuser">{t('admin.superuser_system_level', 'Superuser (System Level)')}</option>
              <option value="admin">{t('admin.admin_global_level', 'Admin (Global Level)')}</option>
              <option value="manager">{t('admin.manager_group_level', 'Manager (Group Level)')}</option>
              <option value="editor">{t('admin.editor_group_level', 'Editor (Group Level)')}</option>
              <option value="viewer">{t('admin.viewer_restricted', 'Viewer (Restricted)')}</option>
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
              <option value="contract">{t('admin.contract', 'contract (')}{t('admin.contracts', 'Contracts')})</option>
              <option value="partner">{t('admin.partner', 'partner (')}{t('admin.partners', 'Partners')})</option>
              <option value="report">{t('admin.report', 'report (')}{t('admin.reports', 'Reports')})</option>
              <option value="user">{t('admin.user', 'user (')}{t('admin.users', 'Users')})</option>
              <option value="session">{t('admin.session', 'session (')}{t('admin.sessions', 'Sessions')})</option>
              <option value="organization">{t('admin.organization', 'organization (')}{t('admin.organizations', 'Organizations')})</option>
              <option value="team">{t('admin.team', 'team (')}{t('admin.departments', 'Departments')})</option>
              <option value="settings">{t('admin.settings', 'settings (')}{t('admin.settings_2', 'Settings')})</option>
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
              <option value="create">{t('admin.create_buat_baru', 'create (Buat baru)')}</option>
              <option value="read">{t('admin.read_lihat_baca', 'read (Lihat / Baca)')}</option>
              <option value="update">{t('admin.update_edit_revisi', 'update (Edit / Revisi)')}</option>
              <option value="delete">{t('admin.delete_hapus_hapus_permanen', 'delete (Hapus / Hapus permanen)')}</option>
              <option value="approve-internal">{t('admin.approve_internal_persetujuan_divisi', 'approve-internal (Persetujuan Divisi)')}</option>
              <option value="approve">{t('admin.approve_final_approval', 'approve (Final Approval)')}</option>
              <option value="archive">{t('admin.archive_arsipkan', 'archive (Arsipkan)')}</option>
              <option value="export">{t('admin.export_unduh_laporan', 'export (Unduh Laporan)')}</option>
              <option value="set-role">{t('admin.set_role_atur_peran_akun', 'set-role (Atur Peran Akun)')}</option>
              <option value="ban">{t('admin.ban_cekal_pengguna', 'ban (Cekal Pengguna)')}</option>
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
                    ? t('admin.allowed', 'ALLOWED')
                    : t('admin.forbidden_403', 'FORBIDDEN (403)')}
                </span>
              </div>
              <span className="font-mono text-[11px]">{isAllowed ? t('admin.200_ok', '200 OK') : '403'}</span>
            </div>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-xs font-mono text-slate-600 dark:text-slate-300">
          {t('admin.authclient_haspermission', 'authClient.hasPermission(')}{'{'} {t('admin.role_resource_action', 'role: "{testRole}", resource: "{testResource}", action: "{testAction}"', { testRole, testResource, testAction })} {'}'}{t('admin.text', ') =>')}{' '}
          <strong className={isAllowed ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
            {isAllowed ? t('admin.true_aksi_diizinkan', 'true (Aksi Diizinkan)') : t('admin.false_aksi_dibatasi', 'false (Aksi Dibatasi)')}
          </strong>
        </div>
      </div>
    </div>
  );
};
