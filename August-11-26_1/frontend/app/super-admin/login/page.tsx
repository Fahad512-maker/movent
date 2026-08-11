'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { isAuthenticated, getAuthType } from '@/lib/auth';
import { HiEnvelope, HiLockClosed, HiEye, HiEyeSlash, HiShieldCheck } from 'react-icons/hi2';

export default function SuperAdminLoginPage() {
  const router = useRouter();
  const { superAdminLogin, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  // Starts true so the login form never flashes on screen while we're still
  // checking for an existing session — only set false once we're sure the
  // visitor is actually logged out.
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const type = getAuthType();
    if (isAuthenticated() && type) {
      const dest = type === 'super_admin' ? '/super-admin/dashboard' : type === 'admin' ? '/admin/dashboard' : '/dashboard';
      router.replace(dest);
      return;
    }
    setCheckingAuth(false);
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await superAdminLogin(email, password);
  };

  if (checkingAuth) return null;

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Left Panel */}
      <div style={{
        flex: '0 0 44%',
        background: 'linear-gradient(160deg, #0f172a 0%, #1e1b4b 50%, #1e293b 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 40px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative circles */}
        <div style={{ position: 'absolute', top: -80, right: -80, width: 280, height: 280, background: 'rgba(124,58,237,0.1)', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', bottom: -60, left: -60, width: 200, height: 200, background: 'rgba(167,139,250,0.08)', borderRadius: '50%' }} />

        <div style={{ position: 'relative', textAlign: 'center' }}>
          <div style={{
            width: 72, height: 72,
            background: 'linear-gradient(135deg, #7c3aed, #a78bfa)',
            borderRadius: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px',
            boxShadow: '0 12px 32px rgba(124,58,237,0.35)',
          }}>
            <HiShieldCheck size={36} color="#fff" />
          </div>

          <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 800, margin: '0 0 12px', letterSpacing: '-0.5px' }}>
            Super Admin
          </h1>
          <p style={{ color: '#94a3b8', fontSize: 15, margin: '0 0 48px', lineHeight: 1.6 }}>
            Manage packages, company admins,<br />and the entire Movent platform.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { icon: '📦', title: 'Packages', desc: 'Create and manage subscription plans' },
              { icon: '🏢', title: 'Companies', desc: 'Monitor all registered companies' },
              { icon: '👥', title: 'Admins', desc: 'Manage company administrators' },
            ].map(item => (
              <div key={item.title} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 18px',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.08)',
                textAlign: 'left',
              }}>
                <span style={{ fontSize: 22 }}>{item.icon}</span>
                <div>
                  <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 14 }}>{item.title}</div>
                  <div style={{ color: '#64748b', fontSize: 12 }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#fff',
        padding: '40px 48px',
      }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          <div style={{ marginBottom: 36 }}>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', margin: '0 0 8px', letterSpacing: '-0.5px' }}>
              Welcome back
            </h2>
            <p style={{ color: '#64748b', fontSize: 15, margin: 0 }}>
              Sign in to your super admin account
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 7 }}>
                Email address
              </label>
              <div style={{ position: 'relative' }}>
                <HiEnvelope size={17} color="#94a3b8" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="super@crm.com"
                  style={{
                    width: '100%',
                    padding: '12px 14px 12px 42px',
                    border: '1.5px solid #e2e8f0',
                    borderRadius: 10,
                    fontSize: 14,
                    outline: 'none',
                    boxSizing: 'border-box',
                    background: '#f8fafc',
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 28 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 7 }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <HiLockClosed size={17} color="#94a3b8" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  style={{
                    width: '100%',
                    padding: '12px 42px',
                    border: '1.5px solid #e2e8f0',
                    borderRadius: 10,
                    fontSize: 14,
                    outline: 'none',
                    boxSizing: 'border-box',
                    background: '#f8fafc',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#94a3b8' }}>
                  {showPwd ? <HiEyeSlash size={17} /> : <HiEye size={17} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '13px',
                background: loading ? '#c4b5fd' : 'linear-gradient(135deg, #7c3aed, #a78bfa)',
                border: 'none',
                borderRadius: 10,
                color: '#fff',
                fontSize: 15,
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                letterSpacing: '0.01em',
                boxShadow: loading ? 'none' : '0 4px 14px rgba(124,58,237,0.35)',
              }}>
              {loading ? 'Signing in...' : 'Sign in to Console'}
            </button>
          </form>

          <div style={{ marginTop: 32, padding: '16px', background: '#fdf4ff', borderRadius: 10, border: '1px solid #e9d5ff' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Default Credentials
            </div>
            <div style={{ fontSize: 13, color: '#6b21a8' }}>
              <strong>Email:</strong> super@crm.com<br />
              <strong>Password:</strong> SuperAdmin@123
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
