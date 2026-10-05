import React, { useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, LogOut, Monitor, Moon, Sun, Trash2, X } from 'lucide-react';
import { authClient } from '../../lib/auth-client';
import { useIdentity } from '../../context/AuthContext';
import { LANGUAGE_OPTIONS, useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { ModalFrame, ModalTitle } from '../ui/modal-frame';
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';

const fieldClass = 'block min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-accent focus:outline-none aria-[invalid=true]:border-rose-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';

const Header: React.FC<{ title: string; onClose: () => void }> = ({ title, onClose }) => {
  const { t } = useLanguage();
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
      <ModalTitle className="text-lg font-semibold text-slate-900 dark:text-white">{title}</ModalTitle>
      <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label={t('common.close', 'Close')}><X className="h-4 w-4" aria-hidden="true" /></Button>
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
 * Account Profile (PRD §6.7): update your own profile, change your own
 * password through Better Auth self-service, and review/revoke your own
 * sessions. Never the admin set-password path; OAuth-only accounts see their
 * sign-in method instead.
 */
export const AccountProfileDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useLanguage();
  const { identity, refreshUser } = useIdentity();
  const [tab, setTab] = useState('profile');
  const [sessions, setSessions] = useState<OwnSession[] | null>(null);
  const [sessionsError, setSessionsError] = useState(false);
  const [firstName, setFirstName] = useState(identity?.name.trim().split(/\s+/)[0] || '');
  const [lastName, setLastName] = useState(identity?.name.trim().split(/\s+/).slice(1).join(' ') || '');
  const [bio, setBio] = useState(identity?.bio || '');
  const name = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
  const [image, setImage] = useState(identity?.image || '');
  const [profileState, setProfileState] = useState<{ kind: 'idle' | 'saving' | 'saved' } | { kind: 'error'; message: string }>({ kind: 'idle' });
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [state, setState] = useState<{ kind: 'idle' | 'saving' | 'saved' } | { kind: 'error'; message: string }>({ kind: 'idle' });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ids = { first: useId(), last: useId(), email: useId(), bio: useId(), image: useId(), current: useId(), next: useId(), confirm: useId() };
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

  const selectImage = (file?: File) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/gif'].includes(file.type)) {
      setProfileState({ kind: 'error', message: t('tb.profile_photo_type', 'Choose a JPG, GIF, or PNG image.') });
      return;
    }
    if (file.size > 800 * 1024) {
      setProfileState({ kind: 'error', message: t('tb.profile_photo_size', 'The image must be 800 KB or smaller.') });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImage(reader.result);
        setProfileState({ kind: 'idle' });
      }
    };
    reader.onerror = () => setProfileState({ kind: 'error', message: t('tb.profile_photo_read_failed', 'The image could not be read.') });
    reader.readAsDataURL(file);
  };

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName) return;
    setProfileState({ kind: 'saving' });
    try {
      const { error } = await (authClient as any).updateUser({ name: nextName, image: image || null, bio: bio.trim() });
      if (error) {
        setProfileState({ kind: 'error', message: error.message || t('tb.profile_update_failed', 'The profile could not be updated.') });
        return;
      }
      setFirstName(firstName.trim());
      setLastName(lastName.trim());
      setBio(bio.trim());
      await refreshUser();
      setProfileState({ kind: 'saved' });
    } catch {
      setProfileState({ kind: 'error', message: t('tb.profile_update_failed', 'The profile could not be updated.') });
    }
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!current || next.length < 8 || next !== confirm || state.kind === 'saving') return;
    setState({ kind: 'saving' });
    try {
      const { error } = await (authClient as any).changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: false });
      if (error) setState({ kind: 'error', message: error.message || t('tb.password_change_failed', 'The password could not be changed.') });
      else {
        setState({ kind: 'saved' });
        setCurrent('');
        setNext('');
        setConfirm('');
        void loadSessions();
      }
    } catch {
      setState({ kind: 'error', message: t('tb.password_change_failed', 'The password could not be changed.') });
    }
  };

  const revoke = async (id: string) => {
    await fetch(`/api/me/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
    void loadSessions();
  };

  return (
    <ModalFrame onClose={onClose} className="max-w-3xl">
      <Header title={t('tb.account_profile', 'Account Profile')} onClose={onClose} />
      <div className="min-h-0 overflow-y-auto p-5 sm:p-6">
        <Tabs value={tab} onValueChange={setTab} className="gap-8">
          <TabsList aria-label={t('tb.account_profile', 'Account Profile')} className="h-auto w-full rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
            <TabsTrigger value="profile" className="min-h-11 flex-1 rounded-xl">{t('tb.profile_tab', 'Profile')}</TabsTrigger>
            <TabsTrigger value="security" className="min-h-11 flex-1 rounded-xl">{t('tb.security_tab', 'Security')}</TabsTrigger>
          </TabsList>
          <TabsContent value="profile">
        <form onSubmit={saveProfile} aria-label={t('tb.profile_details', 'Profile details')} className="flex flex-col gap-6">
          <div className="flex items-center gap-5">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-50 text-lg font-medium text-slate-900 dark:bg-slate-800 dark:text-slate-100">
                {image ? <img src={image} alt={t('tb.profile_photo', 'Profile photo')} className="h-full w-full object-cover" /> : [firstName, lastName].map(part => part.trim().charAt(0).toUpperCase()).join('') || (identity?.email || '?').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap gap-2">
                <input
                  ref={fileInputRef}
                  id={ids.image}
                  type="file"
                  accept="image/jpeg,image/gif,image/png"
                  aria-label={t('tb.upload_photo', 'Upload photo')}
                  className="hidden"
                  onChange={(event) => { selectImage(event.target.files?.[0]); event.target.value = ''; }}
                />
                <Button type="button" variant="outline" size="lg" disabled={profileState.kind === 'saving'} onClick={() => fileInputRef.current?.click()}>
                  {t('tb.upload_photo', 'Upload photo')}
                </Button>
                {image && (
                  <Button type="button" variant="ghost" size="lg" disabled={profileState.kind === 'saving'} onClick={() => { setImage(''); setProfileState({ kind: 'idle' }); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />{t('tb.remove_photo', 'Remove')}
                  </Button>
                )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('tb.profile_photo_hint', 'JPG, GIF or PNG. Max 800 KB.')}</p>
              </div>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label htmlFor={ids.first} className="mb-1.5 block text-sm text-slate-500 dark:text-slate-400">{t('tb.first_name', 'First Name')}</label>
              <input id={ids.first} type="text" autoComplete="given-name" maxLength={100} required disabled={profileState.kind === 'saving'} className={fieldClass} value={firstName} onChange={event => { setFirstName(event.target.value); setProfileState({ kind: 'idle' }); }} />
            </div>
            <div>
              <label htmlFor={ids.last} className="mb-1.5 block text-sm text-slate-500 dark:text-slate-400">{t('tb.last_name', 'Last Name')}</label>
              <input id={ids.last} type="text" autoComplete="family-name" maxLength={100} disabled={profileState.kind === 'saving'} className={fieldClass} value={lastName} onChange={event => { setLastName(event.target.value); setProfileState({ kind: 'idle' }); }} />
            </div>
          </div>
          <div>
            <label htmlFor={ids.email} className="mb-1.5 block text-sm text-slate-500 dark:text-slate-400">{t('tb.profile_email', 'Email')}</label>
            <input id={ids.email} type="email" autoComplete="email" readOnly className={`${fieldClass} text-slate-500 dark:text-slate-400`} value={identity?.email || ''} />
          </div>
          <div>
            <label htmlFor={ids.bio} className="mb-1.5 block text-sm text-slate-500 dark:text-slate-400">{t('tb.profile_bio', 'Bio')}</label>
            <textarea id={ids.bio} rows={3} maxLength={500} disabled={profileState.kind === 'saving'} className={`${fieldClass} min-h-24 resize-y`} value={bio} placeholder={t('tb.profile_bio_placeholder', 'Tell us about yourself')} onChange={event => { setBio(event.target.value); setProfileState({ kind: 'idle' }); }} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="lg" className="w-full bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200" disabled={!firstName.trim() || profileState.kind === 'saving'}>
              {profileState.kind === 'saving' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{t('tb.save_profile', 'Save profile')}
            </Button>
            <span aria-live="polite">{profileState.kind === 'saved' && <span className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />{t('tb.profile_saved', 'Profile updated.')}</span>}</span>
            {profileState.kind === 'error' && <span role="alert" className="flex items-center gap-2 text-sm text-rose-700 dark:text-rose-300"><AlertCircle className="h-4 w-4" aria-hidden="true" />{profileState.message}</span>}
          </div>
        </form>
          </TabsContent>
          <TabsContent value="security" className="space-y-6">
        {hasPassword ? (
          <form onSubmit={changePassword} aria-label={t('tb.change_password', 'Change password')} className="flex flex-col gap-8">
            <div className="grid gap-6">
              <div>
                <label htmlFor={ids.current} className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('tb.current_password', 'Current password')}</label>
                <input id={ids.current} type="password" autoComplete="current-password" required disabled={state.kind === 'saving'} placeholder={t('tb.current_password_placeholder', 'Enter current password')} className={fieldClass} value={current} onChange={(e) => { setCurrent(e.target.value); setState({ kind: 'idle' }); }} />
              </div>
              <div>
                <label htmlFor={ids.next} className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('tb.new_password', 'New password')}</label>
                <input id={ids.next} type="password" autoComplete="new-password" required minLength={8} disabled={state.kind === 'saving'} placeholder={t('tb.new_password_placeholder', 'Enter new password')} className={fieldClass} value={next} aria-invalid={next.length > 0 && next.length < 8} aria-describedby={`${ids.next}-hint`} onChange={(e) => { setNext(e.target.value); setState({ kind: 'idle' }); }} />
                <p id={`${ids.next}-hint`} className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">{t('tb.password_hint', 'At least 8 characters.')}</p>
              </div>
              <div>
                <label htmlFor={ids.confirm} className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('tb.confirm_password', 'Confirm Password')}</label>
                <input id={ids.confirm} type="password" autoComplete="new-password" required disabled={state.kind === 'saving'} placeholder={t('tb.confirm_password_placeholder', 'Confirm new password')} className={fieldClass} value={confirm} aria-invalid={confirm.length > 0 && confirm !== next} aria-describedby={confirm.length > 0 && confirm !== next ? `${ids.confirm}-error` : undefined} onChange={event => { setConfirm(event.target.value); setState({ kind: 'idle' }); }} />
                {confirm.length > 0 && confirm !== next && <p id={`${ids.confirm}-error`} className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">{t('tb.password_mismatch', 'Passwords do not match.')}</p>}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button type="submit" size="lg" className="w-full bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200" disabled={!current || next.length < 8 || next !== confirm || state.kind === 'saving'}>
                {state.kind === 'saving' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{t('tb.update_password', 'Update Password')}
              </Button>
              <span aria-live="polite">{state.kind === 'saved' && <span className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />{t('tb.password_changed', 'Password changed.')}</span>}</span>
              {state.kind === 'error' && <span role="alert" className="flex items-center gap-2 text-sm text-rose-700 dark:text-rose-300"><AlertCircle className="h-4 w-4" aria-hidden="true" />{state.message}</span>}
            </div>
          </form>
        ) : (
          <p className="text-sm text-slate-700 dark:text-slate-300">{t('tb.no_password', 'This account signs in with an identity provider and has no password to change here.')}</p>
        )}
        <details className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <summary className="cursor-pointer text-sm font-medium text-slate-600 dark:text-slate-300">{t('tb.your_sessions', 'Your sessions')}</summary>
          <p className="my-3 text-xs text-slate-500 dark:text-slate-400">
            {t('tb.sign_in_method', 'Sign-in method')}: {(identity?.signInMethods || []).map(m => m === 'password' ? t('tb.method_password', 'Email and password') : m === 'google' ? 'Google' : m).join(', ') || '—'}
          </p>
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
                {!s.current && <Button type="button" variant="ghost" size="sm" onClick={() => revoke(s.id)}><LogOut className="h-4 w-4" aria-hidden="true" />{t('tb.sign_out_session', 'Sign out')}</Button>}
              </li>
            ))}
          </ul>
        </details>
          </TabsContent>
        </Tabs>
      </div>
    </ModalFrame>
  );
};
