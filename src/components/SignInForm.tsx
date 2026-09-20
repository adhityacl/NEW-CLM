import React, { useState } from 'react';
import { authClient } from '../lib/auth-client';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { signInWithGoogle } from '../lib/googleAuthService';
import { Mail, Lock, User, Loader2, CheckCircle, Clock } from 'lucide-react';

interface SignInFormProps {
  onOpenPrivacyPolicy?: () => void;
  onOpenTermsOfService?: () => void;
}

export const SignInForm: React.FC<SignInFormProps> = ({ onOpenPrivacyPolicy, onOpenTermsOfService }) => {
  const { t } = useLanguage();
  const { login } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [registrationSuccess, setRegistrationSuccess] = useState(false);

  const handleOpenPrivacy = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onOpenPrivacyPolicy) {
      onOpenPrivacyPolicy();
    } else {
      if (typeof window !== 'undefined') {
        window.history.pushState(null, '', '/privacy');
        window.dispatchEvent(new Event('popstate'));
      }
    }
  };

  const handleOpenTerms = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onOpenTermsOfService) {
      onOpenTermsOfService();
    } else {
      if (typeof window !== 'undefined') {
        window.history.pushState(null, '', '/tos');
        window.dispatchEvent(new Event('popstate'));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isRegister) {
        const { data, error } = await authClient.signUp.email({
          name,
          email,
          password,
        });
        if (error) {
          const msg = (error.message || '').toLowerCase();
          const code = (error as any).code || '';
          if (code === 'BANNED_USER' || msg.includes('banned') || msg.includes('pending')) {
            // User was successfully created in database with pending approval status
            try { await (authClient.signOut as any)(); } catch (_) {}
            setRegistrationSuccess(true);
          } else if (code === 'USER_ALREADY_EXISTS' || msg.includes('already exists') || msg.includes('already in use')) {
            setError('Email sudah terdaftar. Silakan login atau gunakan email lain.');
          } else {
            setError(error.message || t('login.err_register_failed'));
          }
        } else {
          // Sign-up succeeded, user is active or first user/whitelisted
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
        setError('Email atau kata sandi salah. Silakan coba lagi.');
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
      // Masuk menggunakan Firebase Google Auth Popup yang terkonfigurasi (safeforwork-47.firebaseapp.com)
      const result = await signInWithGoogle();
      if (result && (result.profile?.email || result.sessionToken)) {
        window.location.reload();
        return;
      }
    } catch (err: any) {
      console.error('Google sign in error:', err);
      setError(err?.message || 'Gagal masuk dengan Google.');
    } finally {
      setLoading(false);
    }
  };

  // Registration success screen
  if (registrationSuccess) {
    return (
      <div className="w-full max-w-md flex flex-col items-center">
        <div className="w-full bg-white dark:bg-slate-900 rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800">
          <div className="p-8 text-center">
            <div className="mx-auto flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/40 mb-6">
              <Clock className="h-8 w-8 text-amber-600 dark:text-amber-400" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-3">
              {t('login.account_created_title')}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
              {t('login.account_pending_approval')}
              <br />{t('login.account_pending_approval_desc')}
            </p>
            <button
              onClick={() => {
                setRegistrationSuccess(false);
                setIsRegister(false);
                setError('');
                setName('');
                setPassword('');
              }}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              {t('login.back_to_login')}
            </button>
          </div>
        </div>

        {/* Footer Link on Success Screen */}
        <div className="mt-6 text-center space-y-2">
          <div className="flex items-center justify-center gap-3 text-[11px] text-slate-600 dark:text-slate-400">
            <button
              type="button"
              onClick={handleOpenPrivacy}
              className="text-[11px] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:underline transition-colors cursor-pointer"
            >
              <span>{t('footer.privacy_policy', 'Privacy Policy')}</span>
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={handleOpenTerms}
              className="text-[11px] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:underline transition-colors cursor-pointer"
            >
              <span>{t('footer.terms_of_service', 'Terms of Service')}</span>
            </button>
          </div>
          <p className="text-[11px] text-slate-600 dark:text-slate-400">
            2026 ACL. All rights reserved.
          </p>
        </div>
      </div>
    );
  }

  // Login and registration form
  return (
    <div className="w-full max-w-md flex flex-col items-center">
      <div className="w-full bg-white dark:bg-slate-900 rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-800">
        <div className="p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {isRegister ? t('login.create_account') : t('login.welcome')}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1.5 text-xs sm:text-sm">
              {isRegister ? t('login.fill_form_reg') : t('login.fill_form_login')}
            </p>
          </div>

          {error && (
            <div className={`mb-6 p-4 text-sm rounded-lg border ${
              error.includes('menunggu') || error.includes('pending')
                ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/50'
                : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-100 dark:border-red-900/50'
            }`}>
              {(error.includes('menunggu') || error.includes('pending')) && (
                <Clock className="inline h-4 w-4 mr-1.5 -mt-0.5" />
              )}
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {isRegister && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t('login.fullname_label')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <User className="h-5 w-5" />
                  </div>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    placeholder={t('login.fullname_placeholder')}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t('login.email_label')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="h-5 w-5" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  placeholder={t('login.email_placeholder')}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t('login.password_label')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-5 w-5" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-2 cursor-pointer"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : (isRegister ? t('login.btn_register') : t('login.btn_login'))}
            </button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200 dark:border-slate-800"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white dark:bg-slate-900 px-3 text-slate-500 dark:text-slate-400 font-semibold tracking-wider">
                {t('login.or_sign_in_with', 'atau masuk dengan')}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-xs"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            <span>{t('login.google_button', 'Masuk dengan Google')}</span>
          </button>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setIsRegister(!isRegister);
                setError('');
              }}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              {isRegister ? t('login.has_account_prompt') : t('login.no_account_prompt')}
            </button>
          </div>
        </div>
      </div>

      {/* Footer Link to Privacy Policy & Terms of Service */}
      <div className="mt-6 text-center space-y-2">
        <div className="flex items-center justify-center gap-3 text-[11px] text-slate-600 dark:text-slate-400">
          <button
            type="button"
            onClick={handleOpenPrivacy}
            className="text-[11px] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:underline transition-colors cursor-pointer"
          >
            <span>{t('footer.privacy_policy', 'Privacy Policy')}</span>
          </button>
          <span>•</span>
          <button
            type="button"
            onClick={handleOpenTerms}
            className="text-[11px] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:underline transition-colors cursor-pointer"
          >
            <span>{t('footer.terms_of_service', 'Terms of Service')}</span>
          </button>
        </div>
        <p className="text-[11px] text-slate-600 dark:text-slate-400">
          2026 ACL. All rights reserved.
        </p>
      </div>
    </div>
  );
};

