import React, { useId, useMemo, useState } from 'react';
import { Ban, KeyRound, Pencil, Plus, Search, ShieldCheck, Trash2, UserCheck, X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useIdentity } from '../../context/AuthContext';
import { Button } from '@legalio/ui-components/button';
import { Badge } from '@legalio/ui-components/badge';
import { ModalFrame, ModalTitle } from '../ui/modal-frame';

/** Platform identity DTO from `GET /api/auth-console/users` (no tenant roles or memberships). */
export interface PlatformUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  platformRole: 'user' | 'superuser';
  banned: boolean;
  banReason: string | null;
  createdAt: string;
  sessionCount: number;
  primaryProvider: string | null;
  membershipCount: number;
}

const fieldClass = 'block min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-accent focus:outline-none aria-[invalid=true]:border-rose-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';
const labelClass = 'mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300';

/**
 * Global account directory (System Admin only, PRD §4.5.1). Account
 * lifecycle and platform role live here; organization membership is managed
 * through "Manage organization" → Members & Access, never from this table.
 */
export const PlatformUsersTab: React.FC<{
  users: PlatformUser[];
  onCreate: (input: { name: string; email: string; platformRole: 'user' | 'superuser'; password?: string }) => Promise<void>;
  onUpdate: (user: PlatformUser, input: { name: string; email: string; platformRole: 'user' | 'superuser' }) => Promise<void>;
  onResetPassword: (user: PlatformUser, password: string) => Promise<void>;
  onToggleBan: (user: PlatformUser) => Promise<void>;
  onDelete: (user: PlatformUser) => Promise<void>;
}> = ({ users, onCreate, onUpdate, onResetPassword, onToggleBan, onDelete }) => {
  const { t } = useLanguage();
  const { identity } = useIdentity();
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<null | { kind: 'create' } | { kind: 'edit'; user: PlatformUser } | { kind: 'password'; user: PlatformUser }>(null);
  const searchId = useId();
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [users, search]);

  return (
    <div className="flex flex-col gap-4">
      <div className="mobile-controls-bar flex flex-col items-stretch justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center">
        <div className="relative min-w-55 max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            id={searchId}
            type="search"
            aria-label={t('tb.search_accounts', 'Search accounts')}
            placeholder={t('tb.search_accounts', 'Search accounts...')}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-1 focus:ring-accent dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => setDialog({ kind: 'create' })}
          className="theme-action ui-button ui-button-lg font-medium text-white shadow-xs transition-colors"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>{t('tb.create_account', 'Create account')}</span>
        </button>
      </div>
      <div className="ds-table-surface overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <table className="ds-table w-full text-left border-collapse text-xs bg-white dark:bg-slate-900">
          <thead className="bg-slate-50 dark:bg-slate-800/50"><tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 h-12">
            <th scope="col" className="p-4 text-left text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">{t('tb.col_name', 'Name')}</th><th scope="col" className="p-4 text-left text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">{t('tb.col_email', 'Email')}</th>
            <th scope="col" className="p-4 text-left text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">{t('tb.col_platform_role', 'Platform role')}</th><th scope="col" className="p-4 text-left text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">{t('tb.col_organizations', 'Organizations')}</th>
            <th scope="col" className="p-4 text-left text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">{t('tb.col_account_status', 'Account status')}</th><th scope="col" className="pl-2 pr-6 py-4 text-right text-xs font-bold text-slate-700 dark:text-slate-300 align-middle">{t('tb.col_action', 'Action')}</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((u) => {
              const self = u.id === identity?.id;
              return (
                <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="py-4 px-4 text-left align-middle font-semibold text-slate-900 dark:text-slate-100">{u.name}{self && <span className="ml-2 text-xs text-slate-500">({t('tb.you', 'you')})</span>}</td>
                  <td className="py-4 px-4 text-left align-middle text-slate-600 dark:text-slate-400">{u.email}</td>
                  <td className="py-4 px-4 text-left align-middle text-slate-600 dark:text-slate-400">{u.platformRole === 'superuser'
                    ? <Badge variant="purple"><ShieldCheck className="mr-1 h-3 w-3" aria-hidden="true" />{t('tb.platform_administrator', 'Platform administrator')}</Badge>
                    : <Badge variant="secondary">{t('tb.platform_user', 'User')}</Badge>}</td>
                  <td className="py-4 px-4 text-left align-middle text-slate-600 dark:text-slate-400">{u.membershipCount}</td>
                  <td className="py-4 px-4 text-left align-middle text-slate-600 dark:text-slate-400">{u.banned
                    ? <Badge variant="danger">{u.banReason === 'PENDING_APPROVAL' ? t('tb.pending_approval', 'Pending approval') : t('tb.disabled', 'Disabled')}</Badge>
                    : <Badge variant="success">{t('tb.status_active', 'Active')}</Badge>}</td>
                  <td className="pl-2 pr-6 py-4 text-right align-middle">
                    {!self && (
                      <div className="flex items-center justify-end gap-1">
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-slate-500" onClick={() => setDialog({ kind: 'edit', user: u })} aria-label={t('tb.edit_account_for', 'Edit account of {name}', { name: u.name })}><Pencil className="h-3.5 w-3.5" aria-hidden="true" /></Button>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-slate-500" onClick={() => setDialog({ kind: 'password', user: u })} aria-label={t('tb.set_password_for', 'Set password for {name}', { name: u.name })}><KeyRound className="h-3.5 w-3.5" aria-hidden="true" /></Button>
                        <Button type="button" variant="ghost" size="icon" className={`h-7 text-slate-500 ${u.banned && u.banReason === 'PENDING_APPROVAL' ? 'w-auto px-2' : 'w-7'}`} onClick={() => onToggleBan(u)} aria-label={u.banned && u.banReason === 'PENDING_APPROVAL' ? t('onboarding.approve_account_for', 'Approve account of {name}', { name: u.name }) : u.banned ? t('tb.enable_account_for', 'Enable account of {name}', { name: u.name }) : t('tb.disable_account_for', 'Disable account of {name}', { name: u.name })}>
                          {u.banned ? <UserCheck className="h-3.5 w-3.5" aria-hidden="true" /> : <Ban className="h-3.5 w-3.5" aria-hidden="true" />}{u.banned && u.banReason === 'PENDING_APPROVAL' && t('onboarding.approve', 'Approve')}
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-slate-500" onClick={() => onDelete(u)} aria-label={t('tb.delete_account_for', 'Delete account of {name}', { name: u.name })}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {dialog?.kind === 'create' && <AccountDialog title={t('tb.create_account', 'Create account')} withPassword onClose={() => setDialog(null)}
        onSubmit={async (v) => { await onCreate(v); setDialog(null); }} />}
      {dialog?.kind === 'edit' && <AccountDialog title={t('tb.edit_account_for', 'Edit account of {name}', { name: dialog.user.name })} initial={dialog.user}
        onClose={() => setDialog(null)} onSubmit={async (v) => { await onUpdate(dialog.user, v); setDialog(null); }} />}
      {dialog?.kind === 'password' && <PasswordDialog user={dialog.user} onClose={() => setDialog(null)}
        onSubmit={async (p) => { await onResetPassword(dialog.user, p); setDialog(null); }} />}
    </div>
  );
};

const DialogShell: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => {
  const { t } = useLanguage();
  return (
    <ModalFrame onClose={onClose} className="max-w-lg">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <ModalTitle className="text-lg font-semibold text-slate-900 dark:text-white">{title}</ModalTitle>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label={t('common.close', 'Close')}><X className="h-4 w-4" aria-hidden="true" /></Button>
      </div>
      {children}
    </ModalFrame>
  );
};

const AccountDialog: React.FC<{
  title: string; initial?: PlatformUser; withPassword?: boolean; onClose: () => void;
  onSubmit: (v: { name: string; email: string; platformRole: 'user' | 'superuser'; password?: string }) => Promise<void>;
}> = ({ title, initial, withPassword, onClose, onSubmit }) => {
  const { t } = useLanguage();
  const [name, setName] = useState(initial?.name || '');
  const [email, setEmail] = useState(initial?.email || '');
  const [platformRole, setRole] = useState<'user' | 'superuser'>(initial?.platformRole || 'user');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = { name: useId(), email: useId(), role: useId(), password: useId() };
  const valid = name.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && (!password || password.length >= 8);
  return (
    <DialogShell title={title} onClose={onClose}>
      <form noValidate className="flex flex-col gap-4 p-5" onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        setBusy(true);
        setError(null);
        try { await onSubmit({ name: name.trim(), email: email.trim(), platformRole, ...(withPassword && password ? { password } : {}) }); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
      }}>
        <div><label htmlFor={ids.name} className={labelClass}>{t('tb.col_name', 'Name')}</label><input id={ids.name} className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label htmlFor={ids.email} className={labelClass}>{t('tb.col_email', 'Email')}</label><input id={ids.email} type="email" className={fieldClass} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div>
          <label htmlFor={ids.role} className={labelClass}>{t('tb.col_platform_role', 'Platform role')}</label>
          <select id={ids.role} className={fieldClass} value={platformRole} onChange={(e) => setRole(e.target.value as 'user' | 'superuser')}>
            <option value="user">{t('tb.platform_user', 'User')}</option>
            <option value="superuser">{t('tb.platform_administrator', 'Platform administrator')}</option>
          </select>
        </div>
        {withPassword && (
          <div>
            <label htmlFor={ids.password} className={labelClass}>{t('tb.initial_password', 'Initial password (optional)')}</label>
            <input id={ids.password} type="password" autoComplete="new-password" className={fieldClass} value={password} aria-invalid={password.length > 0 && password.length < 8} aria-describedby={`${ids.password}-hint`} onChange={(e) => setPassword(e.target.value)} />
            <p id={`${ids.password}-hint`} className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">{t('tb.password_hint', 'At least 8 characters.')}</p>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" size="lg" variant="outline" onClick={onClose}>{t('tb.cancel', 'Cancel')}</Button>
          <Button type="submit" size="lg" disabled={!valid || busy}>{t('tb.save', 'Save')}</Button>
        </div>
      </form>
    </DialogShell>
  );
};

const PasswordDialog: React.FC<{ user: PlatformUser; onClose: () => void; onSubmit: (password: string) => Promise<void> }> = ({ user, onClose, onSubmit }) => {
  const { t } = useLanguage();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  return (
    <DialogShell title={t('tb.set_password_for', 'Set password for {name}', { name: user.name })} onClose={onClose}>
      <form noValidate className="flex flex-col gap-4 p-5" onSubmit={async (e) => {
        e.preventDefault();
        if (password.length < 8) return;
        try { await onSubmit(password); } catch (err) { setError((err as Error).message); }
      }}>
        <div>
          <label htmlFor={id} className={labelClass}>{t('tb.new_password', 'New password')}</label>
          <input id={id} type="password" autoComplete="new-password" className={fieldClass} value={password} aria-invalid={password.length > 0 && password.length < 8} aria-describedby={`${id}-hint`} onChange={(e) => setPassword(e.target.value)} />
          <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">{t('tb.password_hint', 'At least 8 characters.')}</p>
        </div>
        {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" size="lg" variant="outline" onClick={onClose}>{t('tb.cancel', 'Cancel')}</Button>
          <Button type="submit" size="lg" disabled={password.length < 8}>{t('tb.save', 'Save')}</Button>
        </div>
      </form>
    </DialogShell>
  );
};
