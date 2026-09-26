import React, { useEffect, useId, useState } from 'react';
import { Dialog } from 'radix-ui';
import { ShieldAlert, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { GoogleCredentialsDialog } from './settings/GoogleCredentialsDialog';

interface DefaultPasswordBannerProps {
  /** Opens the user administration screen, for changing other accounts. */
  onOpenSecurity: () => void;
}

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'error'; message: string }
  | { kind: 'done' };

const MIN_PASSWORD_LENGTH = 8;

/**
 * First-run guidance for a superuser: shown while the Google credential files
 * aren't uploaded yet, or while an install upgraded from an older release still
 * uses the old shipped admin password. Hidden for everyone else.
 */
export const DefaultPasswordBanner: React.FC<DefaultPasswordBannerProps> = ({ onOpenSecurity }) => {
  const { t } = useLanguage();
  const [passwordActive, setPasswordActive] = useState(false);
  const [googleIncomplete, setGoogleIncomplete] = useState(false);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [state, setState] = useState<SaveState>({ kind: 'idle' });
  const currentId = useId();
  const nextId = useId();
  const confirmId = useId();
  const errorId = useId();

  const refresh = () =>
    fetch('/api/system/status', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setPasswordActive(Boolean(data?.defaultAdminPasswordActive));
        setGoogleIncomplete(Boolean(data?.googleSetupIncomplete));
      })
      .catch(() => undefined);

  useEffect(() => {
    refresh();
  }, []);

  if (!passwordActive && !googleIncomplete) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (next.length < MIN_PASSWORD_LENGTH) {
      setState({ kind: 'error', message: t('security.password_too_short', `Use at least ${MIN_PASSWORD_LENGTH} characters.`) });
      return;
    }
    if (next !== confirm) {
      setState({ kind: 'error', message: t('security.password_mismatch', 'The new passwords do not match.') });
      return;
    }
    setState({ kind: 'saving' });
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next, revokeOtherSessions: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || t('security.password_change_failed', 'The password could not be changed. Check the current password.'));
      }
      setState({ kind: 'done' });
      setPasswordActive(false);
      setOpen(false);
    } catch (err: any) {
      setState({ kind: 'error', message: err?.message || String(err) });
    }
  };

  const hasError = state.kind === 'error';

  return (
    <div
      role="alert"
      className="mb-5 flex flex-col gap-3 rounded-2xl border border-amber-400/60 bg-amber-50 p-4 text-amber-900 dark:border-amber-500/50 dark:bg-amber-950/40 dark:text-amber-200 sm:flex-row sm:items-center"
    >
      <ShieldAlert className="h-5 w-5 shrink-0" aria-hidden="true" />
      <p className="flex-1 text-sm">
        {passwordActive
          ? t(
              'security.default_password_warning',
              'You are signed in with the default administrator password. Change it before using this workspace with real data.',
            )
          : t(
              'google_setup.finish_setup',
              'Finish setup: upload your Google Service Account and OAuth Client JSON files to enable Drive, Sheets and Google sign-in.',
            )}
      </p>
      <div className="flex flex-wrap gap-2">
        {passwordActive && (
          <Dialog.Root open={open} onOpenChange={(value) => { setOpen(value); if (!value) setState({ kind: 'idle' }); }}>
            <Dialog.Trigger asChild>
              <Button type="button" size="sm" className="min-h-11">
                {t('security.change_password', 'Change password')}
              </Button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-1000 bg-slate-900/60" />
              <Dialog.Content className="fixed left-1/2 top-1/2 z-1001 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <Dialog.Title className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {t('security.change_password', 'Change password')}
                  </Dialog.Title>
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                      aria-label={t('common.close', 'Close')}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </Dialog.Close>
                </div>
                <Dialog.Description className="mb-4 text-sm text-slate-600 dark:text-slate-400">
                  {t('security.change_password_desc', 'Other sessions will be signed out after the change.')}
                </Dialog.Description>
                <form onSubmit={submit} noValidate aria-busy={state.kind === 'saving'} className="space-y-3">
                  {[
                    { id: currentId, label: t('security.current_password', 'Current password'), value: current, set: setCurrent, auto: 'current-password' },
                    { id: nextId, label: t('security.new_password', 'New password'), value: next, set: setNext, auto: 'new-password' },
                    { id: confirmId, label: t('security.confirm_password', 'Confirm new password'), value: confirm, set: setConfirm, auto: 'new-password' },
                  ].map((field) => (
                    <div key={field.id} className="space-y-1">
                      <Label htmlFor={field.id}>{field.label}</Label>
                      <Input
                        id={field.id}
                        type="password"
                        autoComplete={field.auto}
                        required
                        value={field.value}
                        onChange={(e) => field.set(e.target.value)}
                        aria-invalid={hasError}
                        aria-describedby={hasError ? errorId : undefined}
                      />
                    </div>
                  ))}
                  {hasError && (
                    <p id={errorId} role="alert" className="text-sm text-rose-700 dark:text-rose-300">
                      {state.message}
                    </p>
                  )}
                  <div className="flex justify-end gap-2 pt-2">
                    <Dialog.Close asChild>
                      <Button type="button" variant="outline" className="min-h-11">
                        {t('common.cancel', 'Cancel')}
                      </Button>
                    </Dialog.Close>
                    <Button type="submit" className="min-h-11" disabled={state.kind === 'saving'}>
                      {state.kind === 'saving' ? t('common.saving', 'Saving…') : t('security.save_password', 'Save password')}
                    </Button>
                  </div>
                </form>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        )}
        <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={onOpenSecurity}>
          {t('security.manage_users', 'Manage users')}
        </Button>
        <GoogleCredentialsDialog
          onClose={refresh}
          trigger={
            <Button type="button" size="sm" variant="outline" className="min-h-11">
              {t('google_setup.button', 'Hubungkan Google')}
            </Button>
          }
        />
      </div>
    </div>
  );
};
