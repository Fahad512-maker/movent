'use client';

import { Suspense, useState, useEffect, ChangeEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { HiEye, HiEyeSlash } from 'react-icons/hi2';
import { FcGoogle } from 'react-icons/fc';
import { useAuth } from '@/hooks/useAuth';
import { isAuthenticated, getAuthType } from '@/lib/auth';
import toast from 'react-hot-toast';

import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Container from '@/components/ui/Conatiner';
import LandingNavbar from '@/components/landing/Navbar';
import LandingFooter from '@/components/landing/Footer';
import { FaArrowRight } from 'react-icons/fa6';

// Single login form for Company Admin AND staff/sub-users — the backend
// (Auth\UnifiedLoginController for password, GoogleAuthController for
// Google) decides which account type the credentials belong to. Super Admin
// keeps its own separate /super-admin/login, untouched by this component.
const GOOGLE_POPUP_URL = `${process.env.NEXT_PUBLIC_API_URL}/user/auth/google/redirect`;
const GOOGLE_MESSAGE_TYPE = 'google-oauth-result';

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  not_registered:     'Your Google account is not registered. Please contact your administrator.',
  client_account:     'This is a Client account. Please sign in from the Client Portal.',
  inactive_account:   'Your account has been deactivated',
  inactive_company:   'Your company account is inactive',
  email_not_verified: 'Your Google email is not verified. Please verify it with Google and try again.',
  payment_required:   'Please complete your payment to activate your account.',
  oauth_failed:       'Google sign-in failed. Please try again.',
};

function UnifiedLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { login, exchangeGoogleCode, resumePayment, loading, errors, paymentRequired } = useAuth();

  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  // Starts true so the login form never flashes on screen while we're still
  // checking for an existing session — only set false once we're sure the
  // visitor is actually logged out.
  const [checkingAuth, setCheckingAuth] = useState<boolean>(true);

  useEffect(() => {
    const type = getAuthType();
    if (isAuthenticated() && type) {
      const dest = type === 'admin' ? '/admin/dashboard' : type === 'super_admin' ? '/super-admin/dashboard' : '/dashboard';
      router.replace(dest);
      return;
    }
    setCheckingAuth(false);
  }, [router]);

  // Handles the return trip from the Google OAuth popup (see handleGoogleClick).
  // Runs in whichever window this page mounts in — the popup (which just
  // forwards the result to the main window and closes) or the main window
  // itself (fallback if the popup was blocked and it became a normal navigation).
  useEffect(() => {
    const googleExchange = searchParams.get('google_exchange');
    const googleError = searchParams.get('google_error');
    if (!googleExchange && !googleError) return;

    if (window.opener) {
      window.opener.postMessage({ type: GOOGLE_MESSAGE_TYPE, googleExchange, googleError }, window.location.origin);
      window.close();
      return;
    }

    if (googleExchange) exchangeGoogleCode(googleExchange);
    else if (googleError) toast.error(GOOGLE_ERROR_MESSAGES[googleError] ?? GOOGLE_ERROR_MESSAGES.oauth_failed);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Listens for the popup's postMessage handoff (no-op in the popup itself,
  // since it closes itself before this would ever fire there).
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== GOOGLE_MESSAGE_TYPE) return;
      const { googleExchange, googleError } = event.data;
      if (googleExchange) exchangeGoogleCode(googleExchange);
      else if (googleError) toast.error(GOOGLE_ERROR_MESSAGES[googleError] ?? GOOGLE_ERROR_MESSAGES.oauth_failed);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(email, password);
  };

  const handleGoogleClick = () => {
    // Must be the first synchronous statement in the click handler —
    // popup blockers kill popups opened after any await/async gap.
    window.open(GOOGLE_POPUP_URL, 'google_oauth', 'width=500,height=600');
  };

  if (checkingAuth) return null;

  return (
    <>
      <LandingNavbar />

      <div className="AuthBackground">
        <Container>
          <div style={{ width: '100%' }} className="LoginPage">
            <div
              style={{
                backgroundColor: 'var(--bg-white)',
                display: 'grid',
                gridTemplateColumns: '1fr',
                alignItems: 'center',
                borderRadius: 10,
                maxWidth: 500,
                margin: '0 auto',
              }}
              className="shadow-md border border-[var(--border-light)]"
            >
              <div className="loginForm" style={{ padding: '40px 48px' }}>
                <div className="flex items-center flex-col justify-center w-full gap-3">
                  <Link href="/" className="flex items-center gap-2 no-underline flex-shrink-0">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--brand-gradient)' }}>
                      <span className="text-white font-extrabold text-sm">M</span>
                    </div>
                    <span className="text-[19px] font-extrabold tracking-tight" style={{ color: 'var(--text-heading)' }}>
                      MOVENT<span style={{ color: 'var(--brand-blue)', textTransform: 'uppercase' }}>.io</span>
                    </span>
                  </Link>
                  <div className="flex items-center flex-col justify-center w-full mb-4">
                    <h2 className="Login_Heading" style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-heading)' }}>
                      Welcome Back
                    </h2>
                    <p className="text-sm font-normal text-[var(--text-muted)]">Sign in to continue your account</p>
                  </div>
                </div>

                <form onSubmit={handleSubmit}>
                  {/* Email */}
                  <div style={{ marginBottom: 18 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
                      Username or email address <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="email"
                        placeholder=""
                        value={email}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                        required
                        autoFocus
                        style={{
                          width: '100%', height: 40,
                          border: `1px solid ${errors.email ? 'var(--error-lable)' : 'var(--bg-blue-light1)'}`,
                          borderRadius: 4, paddingLeft: 12, paddingRight: 12, fontSize: 14, color: '#111827',
                          outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff',
                          transition: 'border-color 0.2s',
                        }}
                        onFocus={(e) => { e.target.style.borderColor = 'var(--brand-blue)'; }}
                        onBlur={(e) => { e.target.style.borderColor = errors.email ? 'var(--error-lable)' : 'var(--bg-blue-light1)'; }}
                      />
                    </div>
                    {errors.email && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{errors.email[0]}</div>}
                  </div>

                  {/* Password */}
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
                      Password <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                        required
                        style={{
                          width: '100%', height: 40,
                          border: `1px solid ${errors.email ? 'var(--error-lable)' : 'var(--bg-blue-light1)'}`,
                          borderRadius: 4, paddingLeft: 12, paddingRight: 12, fontSize: 14, color: '#111827',
                          outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff',
                          transition: 'border-color 0.2s',
                        }}
                        onFocus={(e) => { e.target.style.borderColor = 'var(--brand-blue)'; }}
                        onBlur={(e) => { e.target.style.borderColor = errors.email ? 'var(--error-lable)' : 'var(--bg-blue-light1)'; }}
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowPassword((prev) => !prev)}
                        style={{
                          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                          background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af',
                          display: 'flex', alignItems: 'center', padding: 2,
                        }}
                      >
                        {showPassword ? <HiEyeSlash size={16} /> : <HiEye size={16} />}
                      </button>
                    </div>
                    {errors.password && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{errors.password[0]}</div>}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Link href="/forgot-password" style={{ fontSize: 13, color: 'var(--brand-blue)', textDecoration: 'none', fontWeight: 500 }}>
                      Lost your password?
                    </Link>
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      width: '100%', outline: 'none', marginTop: '20px', height: 42, borderRadius: 4, border: 'none',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      background: loading ? 'var(--brand-blue-light)' : 'var(--brand-gradient)',
                      color: '#fff', fontSize: 14, fontWeight: 600,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      transition: 'background 0.2s', fontFamily: 'inherit',
                    }}
                  >
                    {loading ? (<><LoadingSpinner size="sm" /> Signing in...</>) : 'Log In'}
                  </button>

                  {/* Shown only when login was blocked because the matched
                      Company Admin account never finished checkout
                      (subscription_status='pending_payment') — re-verifies the
                      same credentials via a payment-scoped token. */}
                  {paymentRequired && (
                    <button
                      type="button"
                      onClick={() => resumePayment(email, password)}
                      disabled={loading}
                      style={{
                        width: '100%', height: 42, borderRadius: 4, marginTop: 10,
                        border: '1.5px solid var(--brand-blue)', background: '#fff', color: 'var(--brand-blue)',
                        fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      Complete Payment
                    </button>
                  )}

                  <div className="mt-4">
                    {/* Divider */}
                    <div className="flex items-center gap-4 mb-3 w-full">
                      <div className="flex-1 h-px bg-[var(--border)]" />
                      <span className="text-sm text-[var(--text-muted)] font-medium">or continue with</span>
                      <div className="flex-1 h-px bg-[var(--border)]" />
                    </div>

                    <div className="grid w-full grid-cols-1 mb-3 gap-2 sm:gap-4">
                      <button
                        style={{ fontSize: '0.7rem' }}
                        type="button"
                        onClick={handleGoogleClick}
                        className="h-10 text-nowrap w-full rounded-2 border border-[var(--border-light)] bg-white flex items-center justify-center gap-3 font-medium text-[var(--text-heading)] hover:border-[var(--brand-blue)] hover:shadow-sm transition-all"
                      >
                        <FcGoogle size={24} />
                        Continue with Google
                      </button>
                    </div>

                    <div className="w-full flex items-start justify-center gap-1">
                      <p className="text-sm font-normal text-[var(--text-muted)]">Don&apos;t have an account?</p>
                      <Link style={{ fontSize: '0.8rem' }} className="bg-transparent borde-0 outline-0 font-semibold text-[var(--brand-blue)]" href="/register">
                        Get Started
                      </Link>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </Container>
      </div>

      <LandingFooter />
    </>
  );
}

export default function UnifiedLoginForm() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ color: '#6b7280', fontSize: 15 }}>Loading…</div>
      </div>
    }>
      <UnifiedLoginContent />
    </Suspense>
  );
}
