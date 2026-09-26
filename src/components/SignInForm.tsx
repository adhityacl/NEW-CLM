import React, { useEffect, useState } from 'react';
import { authClient } from '../lib/auth-client';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { LANGUAGE_OPTIONS, useLanguage, type Language } from '../context/LanguageContext';
import { signInWithGoogle } from '../lib/googleAuthService';
import { Mail, Lock, User, Loader2, Clock } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';

interface SignInFormProps {
  onOpenPrivacyPolicy?: () => void;
  onOpenTermsOfService?: () => void;
}

/**
 * Sign-in / registration screen.
 *
 * Refactored onto the shadcn design standard (Button/Input/Label/Alert +
 * shared tokens). Behaviour and the auth calls are unchanged; only the
 * presentation layer and a few redundant wrappers were touched.
 */
export const SignInForm: React.FC<SignInFormProps> = ({ onOpenPrivacyPolicy, onOpenTermsOfService }) => {
  const { t, language, setLanguage } = useLanguage();
  const { login } = useAuth();
  const { branding } = useTenant();
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  // True on a fresh install with no admin yet: this screen becomes "create the admin account".
  const [setupMode, setSetupMode] = useState(false);

  useEffect(() => {
    fetch('/api/system/public-status', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((status) => setSetupMode(Boolean(status?.needsSetup)))
      .catch(() => {});
  }, []);

  const handleOpenPrivacy = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onOpenPrivacyPolicy) {
      onOpenPrivacyPolicy();
    } else if (typeof window !== 'undefined') {
      window.history.pushState(null, '', '/privacy');
      window.dispatchEvent(new Event('popstate'));
    }
  };

  const handleOpenTerms = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onOpenTermsOfService) {
      onOpenTermsOfService();
    } else if (typeof window !== 'undefined') {
      window.history.pushState(null, '', '/tos');
      window.dispatchEvent(new Event('popstate'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (setupMode) {
        const res = await fetch('/api/system/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (data.error === 'ALREADY_SET_UP') setSetupMode(false);
          setError(data.message || t('login.setup_failed', 'Could not create the admin account.'));
          return;
        }
        await login(email, password);
      } else if (isRegister) {
        const { error } = await authClient.signUp.email({ name, email, password });
        if (error) {
          const msg = (error.message || '').toLowerCase();
          const code = (error as any).code || '';
          if (code === 'BANNED_USER' || msg.includes('banned') || msg.includes('pending')) {
            try { await (authClient.signOut as any)(); } catch (_) {}
            setRegistrationSuccess(true);
          } else if (code === 'USER_ALREADY_EXISTS' || msg.includes('already exists') || msg.includes('already in use')) {
            setError(t('login.email_sudah_terdaftar_silakan_login_atau', 'Email sudah terdaftar. Silakan login atau gunakan email lain.'));
          } else {
            setError(error.message || t('login.err_register_failed'));
          }
        } else {
          try { await (authClient.signOut as any)(); } catch (_) {}
          setRegistrationSuccess(true);
        }
      } else {
        await login(email, password);
      }
    } catch (err: any) {
      const msg = (err?.message || '').toLowerCase();
      const code = err?.code || '';
      if (code === 'BANNED_USER' || msg.includes('banned') || msg.includes('pending')) {
        setError(t('login.err_pending'));
      } else if (code === 'INVALID_EMAIL_OR_PASSWORD' || msg.includes('invalid') || msg.includes('credential')) {
        setError(t('login.email_atau_kata_sandi_salah_silakan', 'Email atau kata sandi salah. Silakan coba lagi.'));
      } else {
        setError(err.message || (isRegister ? t('login.err_register_failed') : t('login.err_failed')));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await signInWithGoogle();
      if (result.sessionToken) {
        window.location.reload();
        return;
      }
      // Google accepted, but the server refused (e.g. the account isn't invited).
      setError(t('login.gagal_masuk_dengan_google', 'Gagal masuk dengan Google.'));
    } catch (err: any) {
      console.error('Google sign in error:', err);
      setError(err?.message || t('login.gagal_masuk_dengan_google', 'Gagal masuk dengan Google.'));
    } finally {
      setLoading(false);
    }
  };

  const isPending = /menunggu|pending/i.test(error);

  if (registrationSuccess) {
    return (
      <div className="w-full max-w-md h-[calc(100dvh-var(--spacing)*20)]">
        <div className="w-full h-full flex flex-col rounded-t-[2rem] border border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)] shadow-sm overflow-hidden">
          <div className="px-8 py-6 flex-1 flex flex-col justify-center overflow-y-auto text-center">
            <div className="flex justify-center mb-6">
              <LanguageSwitcher language={language} setLanguage={setLanguage} t={t} />
            </div>
            <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-full bg-[var(--warning)]/10 mb-6">
              <Clock className="h-8 w-8 text-[var(--warning)]" />
            </div>
            <h1 className="text-2xl font-bold mb-3">{t('login.account_created_title')}</h1>
            <p className="text-[var(--muted-foreground)] mb-6 leading-relaxed">
              {t('login.account_pending_approval')}
              <br />{t('login.account_pending_approval_desc')}
            </p>
            <Button
              variant="link"
              className="text-sm"
              onClick={() => {
                setRegistrationSuccess(false);
                setIsRegister(false);
                setError('');
                setName('');
                setPassword('');
              }}
            >
              {t('login.back_to_login')}
            </Button>
            <LegalFooter onOpenPrivacy={handleOpenPrivacy} onOpenTerms={handleOpenTerms} t={t} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md h-[calc(100dvh-var(--spacing)*20)]">
      <div className="w-full h-full flex flex-col rounded-t-[2rem] border border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)] shadow-sm overflow-hidden">
        <div className="px-8 py-6 flex-1 flex flex-col justify-center overflow-y-auto">
          <div className="flex justify-center mb-6">
            <LanguageSwitcher language={language} setLanguage={setLanguage} t={t} />
          </div>
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold">
              {setupMode
                ? t('login.setup_title', 'Create your admin account')
                : isRegister ? t('login.create_account') : t('login.welcome_app', 'Welcome to {appName}', { appName: branding.appName })}
            </h1>
            <p className="text-[var(--muted-foreground)] mt-1.5 text-xs sm:text-sm">
              {setupMode
                ? t('login.setup_subtitle', 'First-time setup: this account will manage the whole workspace.')
                : isRegister ? t('login.fill_form_reg') : t('login.fill_form_login')}
            </p>
          </div>

          {error && (
            <Alert variant={isPending ? 'warning' : 'destructive'} className="mb-6">
              {isPending && <Clock className="h-4 w-4" />}
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {(isRegister || setupMode) && (
              <div className="space-y-1.5">
                <Label htmlFor="signin-name">{t('login.fullname_label')}</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)] pointer-events-none" />
                  <Input id="signin-name" type="text" required value={name} onChange={(e) => setName(e.target.value)} className="pl-9" placeholder={t('login.fullname_placeholder')} />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="signin-email">{t('login.email_label')}</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)] pointer-events-none" />
                <Input id="signin-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="pl-9" placeholder={t('login.email_placeholder')} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="signin-password">{t('login.password_label')}</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)] pointer-events-none" />
                <Input
                  id="signin-password"
                  type="password"
                  required
                  minLength={setupMode ? 8 : undefined}
                  autoComplete={setupMode ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <Button type="submit" size="lg" disabled={loading} className="w-full mt-2">
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : setupMode ? (
                t('login.setup_submit', 'Create admin account')
              ) : isRegister ? (
                t('login.btn_register')
              ) : (
                t('login.btn_login')
              )}
            </Button>
          </form>

          {!setupMode && (
            <>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[var(--border)]" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-[var(--card)] px-3 text-[var(--muted-foreground)] font-semibold tracking-wider">
                    {t('login.or_sign_in_with', 'atau masuk dengan')}
                  </span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full gap-3 bg-white text-slate-900 border-slate-200 hover:bg-slate-50"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                <span>{t('login.google_button', 'Masuk dengan Google')}</span>
              </Button>

              <div className="mt-6 text-center">
                <Button
                  type="button"
                  variant="link"
                  className="text-sm"
                  onClick={() => {
                    setIsRegister(!isRegister);
                    setError('');
                  }}
                >
                  {isRegister ? t('login.has_account_prompt') : t('login.no_account_prompt')}
                </Button>
              </div>
            </>
          )}

          <LegalFooter onOpenPrivacy={handleOpenPrivacy} onOpenTerms={handleOpenTerms} t={t} />
        </div>
      </div>
    </div>
  );
};

/** Same pill/segmented control as the in-app Header, so language switching looks the same before and after login. */
const LanguageSwitcher: React.FC<{ language: Language; setLanguage: (lang: Language) => void; t: (k: string, d?: string) => string }> = ({ language, setLanguage, t }) => (
  <div
    role="group"
    aria-label={t('header.switch_language', 'Pilih bahasa')}
    className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-full border border-slate-200/80 dark:border-slate-700/80 text-xs font-semibold mb-4"
  >
    {LANGUAGE_OPTIONS.map((option) => (
      <button
        key={option.code}
        type="button"
        lang={option.htmlLang}
        onClick={() => setLanguage(option.code)}
        className={`min-w-11 min-h-11 px-2.5 py-1.5 rounded-full transition-all cursor-pointer text-xs font-bold flex items-center justify-center focus-visible:ring-2 focus-visible:ring-[#06C755]/50 focus-visible:outline-none ${
          language === option.code
            ? 'bg-[#06C755] text-white shadow-2xs'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
        }`}
        title={option.nativeName}
        aria-label={option.nativeName}
        aria-pressed={language === option.code}
      >
        {option.label}
      </button>
    ))}
  </div>
);

const LegalFooter: React.FC<{ onOpenPrivacy: (e: React.MouseEvent) => void; onOpenTerms: (e: React.MouseEvent) => void; t: (k: string, d?: string) => string }> = ({ onOpenPrivacy, onOpenTerms, t }) => (
  <div className="mt-6 text-center">
    <p className="flex flex-wrap items-center justify-center gap-x-1 text-[11px] text-[var(--muted-foreground)]">
      <button type="button" onClick={onOpenPrivacy} className="hover:text-[var(--foreground)] hover:underline transition-colors cursor-pointer">
        {t('footer.privacy_policy', 'Privacy Policy')}
      </button>
      <span>{t('login.footer_and', 'and')}</span>
      <button type="button" onClick={onOpenTerms} className="hover:text-[var(--foreground)] hover:underline transition-colors cursor-pointer">
        {t('footer.terms_of_service', 'Terms of Service')}
      </button>
      <span>{t('login.footer_apply', 'apply')}</span>
    </p>
  </div>
);
