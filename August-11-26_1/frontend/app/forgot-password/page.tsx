'use client';

import { useState, ChangeEvent } from 'react';
import Link from 'next/link';
import api from '@/lib/axios';
import Container from '@/components/ui/Conatiner';
import LandingNavbar from '@/components/landing/Navbar';
import LandingFooter from '@/components/landing/Footer';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.post('/forgot-password', { email });
      // Always show the same success state, regardless of whether the
      // email was actually registered — never reveal account existence.
      setSent(true);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
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
                    <h2 style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-heading)' }}>Forgot Password</h2>
                    <p className="text-sm font-normal text-[var(--text-muted)]" style={{ textAlign: 'center' }}>
                      Enter your email and we&apos;ll send you a reset link
                    </p>
                  </div>
                </div>

                {sent ? (
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 14, color: 'var(--text-heading)', marginBottom: 20 }}>
                      If that email is registered, a password reset link has been sent. Check your inbox.
                    </p>
                    <Link href="/login" style={{ fontSize: 13, color: 'var(--brand-blue)', fontWeight: 600, textDecoration: 'none' }}>
                      ← Back to Login
                    </Link>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: 18 }}>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
                        Email address <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        type="email"
                        placeholder="you@company.com"
                        value={email}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                        required
                        autoFocus
                        style={{
                          width: '100%', height: 40,
                          border: `1px solid ${error ? 'var(--error-lable)' : 'var(--bg-blue-light1)'}`,
                          borderRadius: 4, paddingLeft: 12, paddingRight: 12, fontSize: 14, color: '#111827',
                          outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff',
                          transition: 'border-color 0.2s',
                        }}
                      />
                      {error && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 5 }}>{error}</div>}
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      style={{
                        width: '100%', outline: 'none', marginTop: 4, height: 42, borderRadius: 4, border: 'none',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        background: loading ? 'var(--brand-blue-light)' : 'var(--brand-gradient)',
                        color: '#fff', fontSize: 14, fontWeight: 600,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        transition: 'background 0.2s', fontFamily: 'inherit',
                      }}
                    >
                      {loading ? <><LoadingSpinner size="sm" /> Sending…</> : 'Send Reset Link'}
                    </button>

                    <div style={{ textAlign: 'center', marginTop: 18 }}>
                      <Link href="/login" style={{ fontSize: 13, color: 'var(--brand-blue)', fontWeight: 500, textDecoration: 'none' }}>
                        ← Back to Login
                      </Link>
                    </div>
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
