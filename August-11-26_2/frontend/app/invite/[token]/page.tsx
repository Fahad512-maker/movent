'use client';
import React, { useEffect, useState, Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/axios';

const inp: React.CSSProperties = { width: '100%', padding: '11px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', background: '#fafafa', color: '#0f172a', boxSizing: 'border-box' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' };

function AcceptInviteForm() {
  const params = useParams();
  const router = useRouter();
  const token  = params.token as string;

  const [name, setName]       = useState('');
  const [email, setEmail]     = useState('');
  const [pass, setPass]       = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [done, setDone]       = useState(false);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    api.get(`/invite/${token}`)
      .then(res => {
        setName(res.data.data.name ?? '');
        setEmail(res.data.data.email ?? '');
      })
      .catch(() => setInvalid(true))
      .finally(() => setLoading(false));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pass !== confirm) { setError('Passwords do not match'); return; }
    setSaving(true); setError('');
    try {
      await api.post(`/invite/${token}`, { password: pass, password_confirmation: confirm });
      setDone(true);
      setTimeout(() => router.push('/login'), 2500);
    } catch (err: unknown) {
      const ex = err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } };
      const msgs = ex.response?.data?.errors;
      if (msgs) setError(Object.values(msgs).flat().join(' · '));
      else setError(ex.response?.data?.message ?? 'Something went wrong');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 18, padding: '36px 32px', width: 400, maxWidth: '100%', boxShadow: '0 32px 64px rgba(0,0,0,0.28)' }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>Loading invite…</div>
        ) : invalid ? (
          <>
            <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 12 }}>❌</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#dc2626', textAlign: 'center', marginBottom: 8 }}>Invalid or Expired Link</div>
            <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>This invite link has expired or already been used. Ask your admin to resend it.</div>
          </>
        ) : done ? (
          <>
            <div style={{ fontSize: 42, textAlign: 'center', marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#059669', textAlign: 'center', marginBottom: 8 }}>Account Activated!</div>
            <div style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>Redirecting to login…</div>
          </>
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>👋</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Welcome, {name}!</div>
              <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>Set your password to activate your account</div>
            </div>

            <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>Signing in as</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{email}</div>
            </div>

            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, padding: '9px 12px', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
                {error}
              </div>
            )}

            <form onSubmit={submit}>
              <div style={{ marginBottom: 16 }}>
                <label style={lbl}>New Password</label>
                <input type="password" style={inp} value={pass} onChange={e => setPass(e.target.value)} placeholder="At least 8 characters" required minLength={8} />
              </div>
              <div style={{ marginBottom: 24 }}>
                <label style={lbl}>Confirm Password</label>
                <input type="password" style={inp} value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat password" required />
              </div>
              <button type="submit" disabled={saving} style={{ width: '100%', padding: '13px 0', borderRadius: 10, border: 'none', background: saving ? '#93c5fd' : 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Activating…' : 'Activate Account'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#94a3b8' }}>Loading…</div>
      </div>
    }>
      <AcceptInviteForm />
    </Suspense>
  );
}
