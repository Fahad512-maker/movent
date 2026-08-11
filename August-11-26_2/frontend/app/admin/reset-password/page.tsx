'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { HiLockClosed, HiEye, HiEyeSlash } from 'react-icons/hi2';
import api from '@/lib/axios';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

function AdminResetPasswordContent() {
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
      await api.post('/admin/reset-password', {
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

  return (
    <div className="auth-screen" style={{ background: 'linear-gradient(135deg, #f5f3ff 0%, #f8fafc 50%, #fdf4ff 100%)' }}>
      <div className="auth-bg-blob" style={{ width: 400, height: 400, background: '#ede9fe', opacity: 0.6, top: -120, right: -100 }} />
      <div className="auth-bg-blob" style={{ width: 280, height: 280, background: '#fae8ff', opacity: 0.5, bottom: -60, left: -60 }} />

      <div className="auth-card">
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div
            style={{
              width: 52, height: 52, background: 'linear-gradient(135deg, #7c3aed, #a78bfa)', borderRadius: 14,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
              boxShadow: '0 8px 24px rgba(124,58,237,0.25)',
            }}
          >
            <span style={{ fontSize: 24, lineHeight: 1 }}>🛡️</span>
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.3px', marginBottom: 6 }}>Reset Password</h1>
          <p style={{ fontSize: '14px', color: '#94a3b8' }}>Choose a new password for your admin account</p>
        </div>

        {!token || !email ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '14px', color: '#ef4444', marginBottom: 20 }}>This password reset link is invalid.</p>
            <Link href="/admin/forgot-password" style={{ fontSize: '13px', color: '#7c3aed', fontWeight: 600, textDecoration: 'none' }}>
              Request a new link
            </Link>
          </div>
        ) : done ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '14px', color: '#374151', marginBottom: 20 }}>Your password has been reset. You can now log in.</p>
            <Link href="/admin/login" style={{ fontSize: '13px', color: '#7c3aed', fontWeight: 600, textDecoration: 'none' }}>
              Go to Admin Login →
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && <div style={{ marginBottom: 16, padding: '9px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, color: '#dc2626', fontSize: 13 }}>{error}</div>}

            <div style={{ marginBottom: 16 }}>
              <label className="form-label">New Password</label>
              <div style={{ position: 'relative' }}>
                
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-control"
                  placeholder="Min 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ paddingLeft: '38px', paddingRight: '44px' }}
                  required
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center', padding: 2 }}
                  tabIndex={-1}
                >
                  {showPassword ? <HiEyeSlash size={17} /> : <HiEye size={17} />}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label className="form-label">Confirm Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                className="form-control"
                placeholder="Repeat password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
              {confirm && password !== confirm && <div style={{ fontSize: '12px', color: '#ef4444', marginTop: 5 }}>Passwords do not match</div>}
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', height: 44, borderRadius: 10, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                background: loading ? '#c4b5fd' : 'linear-gradient(135deg, #7c3aed, #a78bfa)',
                color: '#fff', fontSize: '14.5px', fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: loading ? 'none' : '0 4px 14px rgba(124,58,237,0.3)',
                transition: 'all 0.2s',
              }}
            >
              {loading ? <><LoadingSpinner size="sm" /> Resetting…</> : 'Reset Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function AdminResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="auth-screen" style={{ background: 'linear-gradient(135deg, #f5f3ff 0%, #f8fafc 50%, #fdf4ff 100%)' }}>
        <div style={{ color: '#94a3b8', fontSize: 15 }}>Loading…</div>
      </div>
    }>
      <AdminResetPasswordContent />
    </Suspense>
  );
}
