import React, { useEffect, useId, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, LogOut, Monitor, Moon, Sun, X } from 'lucide-react';
import { authClient } from '../../lib/auth-client';
import { useIdentity } from '../../context/AuthContext';
import { LANGUAGE_OPTIONS, useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { ModalFrame, ModalTitle } from '../ui/modal-frame';
import { Button } from '../ui/button';

const fieldClass = 'block min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-accent focus:outline-none aria-[invalid=true]:border-rose-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';

const Header: React.FC<{ title: string; onClose: () => void }> = ({ title, onClose }) => {
  const { t } = useLanguage();
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
      <ModalTitle className="text-lg font-semibold text-slate-900 dark:text-white">{title}</ModalTitle>
      <Button variant="ghost" size="icon" onClick={onClose} aria-label={t('common.close', 'Close')}><X className="h-4 w-4" aria-hidden="true" /></Button>
    </div>
  );
};

/** Personal theme and UI language, stored for this identity in this browser only (PRD §6.7). */
export const PreferencesDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t, language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();
  return (
    <ModalFrame onClose={onClose} className="max-w-lg">
      <Header title={t('tb.preferences', 'Preferences')} onClose={onClose} />
      <div className="flex flex-col gap-5 overflow-y-auto p-5">
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">{t('tb.theme', 'Theme')}</legend>
          <div className="grid grid-cols-2 gap-2">
            {([['light', t('tb.theme_light', 'Light'), Sun], ['dark', t('tb.theme_dark', 'Dark'), Moon]] as const).map(([value, label, Icon]) => (
              <button key={value} type="button" aria-pressed={theme === value} onClick={() => setTheme(value)}
                className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/40 ${theme === value ? 'border-accent bg-accent/10 text-accent-strong dark:text-accent' : 'border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200'}`}>
                <Icon className="h-4 w-4" aria-hidden="true" />{label}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">{t('tb.ui_language', 'Interface language')}</legend>
          <div className="grid gap-2">
            {LANGUAGE_OPTIONS.map((option) => (
              <button key={option.code} type="button" lang={option.htmlLang} aria-pressed={language === option.code} onClick={() => setLanguage(option.code)}
                className={`flex min-h-11 cursor-pointer items-center justify-between rounded-xl border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]/40 ${language === option.code ? 'border-accent bg-accent/10 text-accent-strong dark:text-accent' : 'border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200'}`}>
                {option.nativeName}{language === option.code && <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
              </button>
            ))}
          </div>
        </fieldset>
        <p className="text-xs text-slate-600 dark:text-slate-400">{t('tb.preferences_local', 'These preferences apply to your account in this browser only.')}</p>
      </div>
    </ModalFrame>
  );
};

interface OwnSession { id: string; createdAt: string; updatedAt: string; expiresAt: string; ipAddress: string | null; userAgent: string | null; current: boolean }

/**
 * Account Security (PRD §6.7): change your own password through Better Auth
 * self-service and review/revoke your own sessions. Never the admin
 * set-password path; OAuth-only accounts see their sign-in method instead.
 */
export const AccountSecurityDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useLanguage();
  const { identity } = useIdentity();
  const [sessions, setSessions] = useState<OwnSession[] | null>(null);
  const [sessionsError, setSessionsError] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [state, setState] = useState<{ kind: 'idle' | 'saving' | 'saved' } | { kind: 'error'; message: string }>({ kind: 'idle' });
  const ids = { current: useId(), next: useId() };
  const hasPassword = identity?.signInMethods.includes('password');

  const loadSessions = async () => {
    setSessionsError(false);
    try {
      const res = await fetch('/api/me/sessions', { cache: 'no-store' });
      if (!res.ok) throw new Error();
      setSessions((await res.json()).sessions);
    } catch {
      setSessionsError(true);
    }
  };
  useEffect(() => { void loadSessions(); }, []);

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (next.length < 8) return;
    setState({ kind: 'saving' });
    const { error } = await (authClient as any).changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: false });
    if (error) setState({ kind: 'error', message: error.message || t('tb.password_change_failed', 'The password could not be changed.') });
    else {
      setState({ kind: 'saved' });
      setCurrent('');
      setNext('');
      void loadSessions();
    }
  };

  const revoke = async (id: string) => {
    await fetch(`/api/me/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
    void loadSessions();
  };

  return (
    <ModalFrame onClose={onClose} className="max-w-2xl">
      <Header title={t('tb.account_security', 'Account security')} onClose={onClose} />
      <div className="flex flex-col gap-6 overflow-y-auto p-5">
        <section aria-labelledby="security-signin">
          <h3 id="security-signin" className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">{t('tb.sign_in_method', 'Sign-in method')}</h3>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {(identity?.signInMethods || []).map((m) => (m === 'password' ? t('tb.method_password', 'Email and password') : m === 'google' ? 'Google' : m)).join(', ') || '—'}
          </p>
        </section>
        {hasPassword ? (
          <form onSubmit={changePassword} noValidate aria-labelledby="security-password" className="flex flex-col gap-3">
            <h3 id="security-password" className="text-sm font-semibold text-slate-900 dark:text-white">{t('tb.change_password', 'Change password')}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={ids.current} className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('tb.current_password', 'Current password')}</label>
                <input id={ids.current} type="password" autoComplete="current-password" className={fieldClass} value={current} onChange={(e) => setCurrent(e.target.value)} />
              </div>
              <div>
                <label htmlFor={ids.next} className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('tb.new_password', 'New password')}</label>
                <input id={ids.next} type="password" autoComplete="new-password" className={fieldClass} value={next} aria-invalid={next.length > 0 && next.length < 8} aria-describedby={`${ids.next}-hint`} onChange={(e) => setNext(e.target.value)} />
                <p id={`${ids.next}-hint`} className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">{t('tb.password_hint', 'At least 8 characters.')}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={!current || next.length < 8 || state.kind === 'saving'}>
                {state.kind === 'saving' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{t('tb.change_password', 'Change password')}
              </Button>
              <span aria-live="polite">{state.kind === 'saved' && <span className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />{t('tb.password_changed', 'Password changed.')}</span>}</span>
              {state.kind === 'error' && <span role="alert" className="flex items-center gap-2 text-sm text-rose-700 dark:text-rose-300"><AlertCircle className="h-4 w-4" aria-hidden="true" />{state.message}</span>}
            </div>
          </form>
        ) : (
          <p className="text-sm text-slate-700 dark:text-slate-300">{t('tb.no_password', 'This account signs in with an identity provider and has no password to change here.')}</p>
        )}
        <section aria-labelledby="security-sessions">
          <h3 id="security-sessions" className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">{t('tb.your_sessions', 'Your sessions')}</h3>
          {sessionsError && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{t('tb.sessions_load_error', 'Sessions could not be loaded.')}</p>}
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {(sessions || []).map((s) => (
              <li key={s.id} className="flex min-h-12 items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <Monitor className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate text-slate-900 dark:text-slate-100">{s.userAgent || t('tb.unknown_device', 'Unknown device')}</span>
                    <span className="block text-xs text-slate-600 dark:text-slate-400">{new Date(s.updatedAt || s.createdAt).toLocaleString()}{s.current ? ` · ${t('tb.this_session', 'This session')}` : ''}</span>
                  </span>
                </span>
                {!s.current && <Button variant="ghost" size="sm" onClick={() => revoke(s.id)}><LogOut className="h-4 w-4" aria-hidden="true" />{t('tb.sign_out_session', 'Sign out')}</Button>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </ModalFrame>
  );
};
