'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { HiEye, HiEyeSlash } from 'react-icons/hi2';
import api from '@/lib/axios';
import Container from '@/components/ui/Conatiner';
import LandingNavbar from '@/components/landing/Navbar';
import LandingFooter from '@/components/landing/Footer';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const email = searchParams.get('email') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    setError('');
    try {
      await api.post('/user/reset-password', {
        email, token, password, password_confirmation: confirm,
      });
      setDone(true);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message || 'This password reset link is invalid or has expired.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 40, border: '1px solid var(--bg-blue-light1)',
    borderRadius: 4, paddingLeft: 12, paddingRight: 34, fontSize: 14, color: '#111827',
    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff',
    transition: 'border-color 0.2s',
  };

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
                    <h2 style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-heading)' }}>Reset Password</h2>
                    <p className="text-sm font-normal text-[var(--text-muted)]">Choose a new password for your account</p>
                  </div>
                </div>

                {!token || !email ? (
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 14, color: '#ef4444', marginBottom: 20 }}>This password reset link is invalid.</p>
                    <Link href="/forgot-password" style={{ fontSize: 13, color: 'var(--brand-blue)', fontWeight: 600, textDecoration: 'none' }}>
                      Request a new link
                    </Link>
                  </div>
                ) : done ? (
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 14, color: 'var(--text-heading)', marginBottom: 20 }}>
                      Your password has been reset. You can now log in.
                    </p>
                    <Link href="/login" style={{ fontSize: 13, color: 'var(--brand-blue)', fontWeight: 600, textDecoration: 'none' }}>
                      Go to Login →
                    </Link>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit}>
                    {error && (
                      <div style={{ marginBottom: 16, padding: '9px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, color: '#dc2626', fontSize: 13 }}>
                        {error}
                      </div>
                    )}

                    <div style={{ marginBottom: 16 }}>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
                        New Password <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <div style={{ position: 'relative' }}>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Min 8 characters"
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          required
                          autoFocus
                          style={inputStyle}
                        />
                        <button type="button" onClick={() => setShowPassword(v => !v)} tabIndex={-1} style={{
                          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                          background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', alignItems: 'center', padding: 2,
                        }}>
                          {showPassword ? <HiEyeSlash size={16} /> : <HiEye size={16} />}
                        </button>
                      </div>
                    </div>

                    <div style={{ marginBottom: 18 }}>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
                        Confirm Password <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Repeat password"
                        value={confirm}
                        onChange={e => setConfirm(e.target.value)}
                        required
                        style={{ ...inputStyle, paddingRight: 12, borderColor: confirm && password !== confirm ? 'var(--error-lable)' : 'var(--bg-blue-light1)' }}
                      />
                      {confirm && password !== confirm && (
                        <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>Passwords do not match</div>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      style={{
                        width: '100%', outline: 'none', height: 42, borderRadius: 4, border: 'none',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        background: loading ? 'var(--brand-blue-light)' : 'var(--brand-gradient)',
                        color: '#fff', fontSize: 14, fontWeight: 600,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        transition: 'background 0.2s', fontFamily: 'inherit',
                      }}
                    >
                      {loading ? <><LoadingSpinner size="sm" /> Resetting…</> : 'Reset Password'}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </Container>
      </div>
      <LandingFooter />
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ color: '#6b7280', fontSize: 15 }}>Loading…</div>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
