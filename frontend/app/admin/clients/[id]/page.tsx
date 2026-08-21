'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import api from '@/lib/axios';
import toast from 'react-hot-toast';
import { adminSalesChatService } from '@/lib/services/salesChatService';
import { ChatMessage } from '@/lib/services/adminProjectService';
import { ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENT_MB, fmtFileSize } from '@/components/admin/projects/shared';
import PhoneInput from '@/components/ui/PhoneInput';
import { ALL_COUNTRIES } from '@/lib/countries';

interface ClientData {
  id: number; name: string; email: string | null; phone: string | null;
  company_name: string | null; address: string | null; country: string | null; notes: string | null;
  portal_access: boolean; status: string; created_at: string;
  user: { id: number; email: string; is_active: boolean } | null;
  company: { id: number; name: string } | null;
}
interface ModulePerm { label: string; is_enabled: boolean; purchased: boolean }
interface Seat { limit: number | null; users_used: number; clients_total: number; can_add: boolean }

const MODULES = [
  { key: 'projects',  label: 'Projects',        desc: 'View projects, tasks, progress' },
  { key: 'invoices',  label: 'Invoices',         desc: 'View invoices and request payments' },
  { key: 'payments',  label: 'Payment History',  desc: 'Read-only payment record' },
  { key: 'documents', label: 'Documents',        desc: 'Download shared files' },
  { key: 'chat',      label: 'Chat',             desc: 'Message with your team' },
  { key: 'support',   label: 'Support Tickets',  desc: 'Raise and track issues' },
  { key: 'reports',   label: 'Reports',          desc: 'Project and invoice reports' },
];

const STATUS_C: Record<string, { bg: string; color: string }> = {
  active:   { bg: '#ecfdf5', color: '#059669' },
  inactive: { bg: '#f1f5f9', color: '#64748b' },
  blocked:  { bg: '#fef2f2', color: '#dc2626' },
};

const inp: React.CSSProperties = {
  padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8,
  fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', background: '#fff',
};
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 };
const card: React.CSSProperties = { background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '24px 28px', marginBottom: 20 };

export default function ClientDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const router   = useRouter();
  const [client, setClient]   = useState<ClientData | null>(null);
  const [perms,  setPerms]    = useState<Record<string, ModulePerm>>({});
  const [seat,   setSeat]     = useState<Seat | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<'info' | 'portal' | 'permissions' | 'chat' | 'messages'>('info');
  // Deep-link support (e.g. /admin/clients/21?tab=messages from the Project
  // Chat page's "Chat with Client" button). Read via window.location instead
  // of useSearchParams so this page doesn't need a Suspense boundary.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('tab');
    if (requested && ['info', 'portal', 'permissions', 'chat', 'messages'].includes(requested)) {
      setTab(requested as typeof tab);
    }
  }, []);

  // Sales Chat
  const [chat, setChat]         = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState('');
  const [chatFile, setChatFile] = useState<File | null>(null);
  const [sendingChat, setSendingChat] = useState(false);

  // Client Messages (restricted Direct Chat — see Client Communication Rules)
  const [dmThreads, setDmThreads]         = useState<any[]>([]);
  const [dmActiveThread, setDmActiveThread] = useState<any>(null);
  const [dmMessages, setDmMessages]       = useState<any[]>([]);
  const [dmText, setDmText]               = useState('');
  const [sendingDm, setSendingDm]         = useState(false);

  // Edit form
  const [form, setForm] = useState({
    name: '', email: '', phone: '', company_name: '', address: '', country: '', notes: '', status: 'active',
  });
  const [savingInfo,  setSavingInfo]  = useState(false);
  const [savingPerms, setSavingPerms] = useState(false);

  // Portal fields
  const [portalEmail, setPortalEmail]   = useState('');
  const [portalPwd,   setPortalPwd]     = useState('');
  const [showPwd,     setShowPwd]       = useState(false);
  const [savingPortal, setSavingPortal] = useState(false);
  const [loginUrl,    setLoginUrl]      = useState('');
  const [loginUrlCopied, setLoginUrlCopied] = useState(false);

  useEffect(() => {
    setLoginUrl(`${window.location.origin}/client/login`);
  }, []);

  const copyLoginUrl = () => {
    navigator.clipboard.writeText(loginUrl).then(() => {
      setLoginUrlCopied(true);
      setTimeout(() => setLoginUrlCopied(false), 2000);
    });
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/clients/${id}`);
      const { client: c, permissions, seat: s } = res.data.data;
      setClient(c);
      setSeat(s);
      setForm({
        name:         c.name,
        email:        c.email ?? '',
        phone:        c.phone ?? '',
        company_name: c.company_name ?? '',
        address:      c.address ?? '',
        country:      c.country ?? '',
        notes:        c.notes ?? '',
        status:       c.status,
      });
      setPortalEmail(c.user?.email ?? c.email ?? '');
      setPerms(permissions as Record<string, ModulePerm>);
    } catch {
      toast.error('Failed to load client');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const loadChat = () => {
    adminSalesChatService.clientMessages(Number(id)).then(setChat).catch(() => {});
  };

  useEffect(() => {
    loadChat();
    const interval = setInterval(loadChat, 8000);
    return () => clearInterval(interval);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim() && !chatFile) return;
    if (chatFile) {
      const ext = chatFile.name.split('.').pop()?.toLowerCase() ?? '';
      if (!ALLOWED_ATTACHMENT_TYPES.includes(ext)) { toast.error(`${chatFile.name}: file type not allowed`); return; }
      if (chatFile.size > MAX_ATTACHMENT_MB * 1024 * 1024) { toast.error(`${chatFile.name}: exceeds ${MAX_ATTACHMENT_MB}MB limit`); return; }
    }
    setSendingChat(true);
    try {
      await adminSalesChatService.sendClientMessage(Number(id), chatText.trim(), chatFile);
      setChatText('');
      setChatFile(null);
      loadChat();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to send message');
    } finally { setSendingChat(false); }
  };

  const downloadChatAttachment = async (m: ChatMessage) => {
    if (!m.attachment_name) return;
    try { await adminSalesChatService.downloadClientAttachment(Number(id), m.id, m.attachment_name); }
    catch { toast.error('Download failed'); }
  };

  // Client Messages — the client's own restricted Direct Chat.
  const loadDmThreads = () => {
    api.get(`/admin/clients/${id}/direct-chat`).then(res => {
      const data = res.data.data;
      setDmThreads(data);
      if (data.length > 0 && !dmActiveThread) selectDmThread(data[0]);
    }).catch(() => {});
  };

  const selectDmThread = (thread: any) => {
    setDmActiveThread(thread);
    api.get(`/admin/clients/${id}/direct-chat/${thread.id}/messages`).then(res => setDmMessages(res.data.data)).catch(() => {});
  };

  useEffect(() => {
    if (tab !== 'messages') return;
    loadDmThreads();
    const interval = setInterval(loadDmThreads, 8000);
    return () => clearInterval(interval);
  }, [id, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendDm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dmText.trim() || !dmActiveThread) return;
    setSendingDm(true);
    try {
      await api.post(`/admin/clients/${id}/direct-chat/${dmActiveThread.id}/reply`, { content: dmText.trim() });
      setDmText('');
      const res = await api.get(`/admin/clients/${id}/direct-chat/${dmActiveThread.id}/messages`);
      setDmMessages(res.data.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to send message');
    } finally { setSendingDm(false); }
  };

  const setF = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  // ── Save info ──────────────────────────────────────────────────────────────
  const saveInfo = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setSavingInfo(true);
    try {
      await api.put(`/admin/clients/${id}`, form);
      toast.success('Client updated');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed');
    } finally {
      setSavingInfo(false);
    }
  };

  // ── Save permissions ───────────────────────────────────────────────────────
  const savePerms = async () => {
    setSavingPerms(true);
    try {
      const mapped: Record<string, boolean> = {};
      Object.entries(perms).forEach(([k, v]) => { if (v.purchased) mapped[k] = v.is_enabled; });
      await api.put(`/admin/clients/${id}/permissions`, { permissions: mapped });
      toast.success('Permissions saved');
    } catch {
      toast.error('Failed to save permissions');
    } finally {
      setSavingPerms(false);
    }
  };

  const togglePerm = (key: string) => {
    const p = perms[key];
    if (!p?.purchased) return;
    setPerms(prev => ({ ...prev, [key]: { ...p, is_enabled: !p.is_enabled } }));
  };

  // ── Portal enable ──────────────────────────────────────────────────────────
  const enablePortal = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setSavingPortal(true);
    try {
      await api.post(`/admin/clients/${id}/enable-portal`, {
        portal_email:    portalEmail,
        portal_password: portalPwd,
      });
      toast.success('Portal access enabled');
      setPortalPwd('');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed');
    } finally {
      setSavingPortal(false);
    }
  };

  const disablePortal = async () => {
    if (!confirm('Disable portal access?')) return;
    try {
      await api.post(`/admin/clients/${id}/disable-portal`);
      toast.success('Portal disabled');
      load();
    } catch { toast.error('Failed'); }
  };

  if (loading) return (
    <DashboardLayout title="Client">
      <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
    </DashboardLayout>
  );

  if (!client) return (
    <DashboardLayout title="Client">
      <div style={{ padding: 60, textAlign: 'center', color: '#dc2626' }}>Client not found.</div>
    </DashboardLayout>
  );

  const sc = STATUS_C[client.status] || { bg: '#f1f5f9', color: '#64748b' };
  const enabledCount = Object.values(perms).filter(p => p.purchased && p.is_enabled).length;
  const purchasedCount = Object.values(perms).filter(p => p.purchased).length;

  return (
    <DashboardLayout title={client.name}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push('/admin/clients')} style={{
          background: '#f1f5f9', border: 'none', borderRadius: 8,
          padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: '#64748b',
        }}>← Clients</button>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>{client.name}</h2>
            <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.color, fontWeight: 500, textTransform: 'capitalize' }}>
              {client.status}
            </span>
            {client.portal_access
              ? <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#ecfdf5', color: '#059669', fontWeight: 600 }}>✓ Portal Active</span>
              : <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#f1f5f9', color: '#94a3b8', fontWeight: 500 }}>Portal Disabled</span>}
          </div>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: '3px 0 0' }}>
            {client.company?.name} {client.company_name ? `· ${client.company_name}` : ''}
          </p>
        </div>

        {/* Seat info */}
        {seat && seat.limit && (
          <div style={{ textAlign: 'right', fontSize: 12 }}>
            <div style={{ color: '#64748b' }}>Seats used</div>
            <div style={{ fontWeight: 700, color: seat.can_add ? '#1e293b' : '#dc2626', fontSize: 16 }}>
              {seat.users_used} / {seat.limit}
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, background: '#f1f5f9', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {/* 'messages' (Client Messages) is deliberately not a clickable tab
            here — not needed as a general-purpose tab on this page. Still
            reachable via the deep link from the Project Chat page's "Chat
            with Client" button (?tab=messages), which sets `tab` state
            directly — the content block below still renders for that case. */}
        {(['info', 'portal', 'permissions', 'chat'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '7px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: tab === t ? 600 : 400,
            background: tab === t ? '#fff' : 'transparent',
            color: tab === t ? '#1e293b' : '#64748b',
            boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,.08)' : 'none',
            textTransform: 'capitalize',
          }}>{t === 'permissions' ? `Permissions (${enabledCount}/${MODULES.length})` : t === 'portal' ? 'Portal Login' : t === 'chat' ? 'Sales Chat' : 'Details'}</button>
        ))}
      </div>

      {/* ── Tab: Info ─────────────────────────────────────────────────────── */}
      {tab === 'info' && (
        <form onSubmit={saveInfo}>
          <div style={card}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '0 0 18px' }}>Client Details</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Client Name *</label>
                <input value={form.name} onChange={e => setF('name', e.target.value)} required style={inp} />
              </div>
              <div>
                <label style={lbl}>Status</label>
                <select value={form.status} onChange={e => setF('status', e.target.value)} style={inp}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="blocked">Blocked</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Contact Email</label>
                <input type="email" value={form.email} onChange={e => setF('email', e.target.value)} style={inp} />
              </div>
              <div>
                <label style={lbl}>Phone</label>
                <PhoneInput value={form.phone} onChange={v => setF('phone', v)} />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Business Name</label>
              <input value={form.company_name} onChange={e => setF('company_name', e.target.value)} placeholder="Client's company / business name" style={inp} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Address</label>
                <input value={form.address} onChange={e => setF('address', e.target.value)} style={inp} />
              </div>
              <div>
                <label style={lbl}>Country</label>
                <select value={form.country} onChange={e => setF('country', e.target.value)} style={inp}>
                  <option value="">— Select —</option>
                  {ALL_COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label style={lbl}>Notes</label>
              <textarea value={form.notes} onChange={e => setF('notes', e.target.value)} rows={3} style={{ ...inp, resize: 'vertical' }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" disabled={savingInfo} style={{
              padding: '10px 24px', background: savingInfo ? '#93c5fd' : '#2563eb',
              color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
              cursor: savingInfo ? 'not-allowed' : 'pointer',
            }}>{savingInfo ? 'Saving…' : 'Save Changes'}</button>
          </div>
        </form>
      )}

      {/* ── Tab: Portal Login ─────────────────────────────────────────────── */}
      {tab === 'portal' && (
        <div style={card}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '0 0 6px' }}>Portal Login</h3>
          <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 12px' }}>
            Share this link with the client so they know where to log in.
          </p>

          {/* Login URL — always shown, whether or not the portal is active yet,
              so it can be copied/shared ahead of enabling it. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <input
              readOnly
              value={loginUrl}
              style={{ flex: 1, padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 12, background: '#f8fafc', color: '#1e293b', outline: 'none' }}
            />
            <button
              onClick={copyLoginUrl}
              style={{ padding: '9px 14px', borderRadius: 7, border: 'none', background: loginUrlCopied ? '#059669' : '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              {loginUrlCopied ? 'Copied!' : 'Copy Link'}
            </button>
          </div>

          {/* Current status */}
          {client.portal_access && client.user && (
            <div style={{
              padding: '12px 16px', background: '#f0fdf4', borderRadius: 8,
              border: '1px solid #bbf7d0', marginBottom: 20,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#15803d' }}>Portal Active</div>
                <div style={{ fontSize: 12, color: '#16a34a' }}>Login: {client.user.email}</div>
              </div>
              <button onClick={disablePortal} style={{
                padding: '6px 14px', background: '#fff', color: '#dc2626',
                border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, cursor: 'pointer',
              }}>Disable Portal</button>
            </div>
          )}

          <form onSubmit={enablePortal}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
              <div>
                <label style={lbl}>{client.portal_access ? 'Update Login Email' : 'Login Email'} *</label>
                <input type="email" value={portalEmail} onChange={e => setPortalEmail(e.target.value)}
                  required placeholder="client@example.com" style={inp} />
              </div>
              <div>
                <label style={lbl}>{client.portal_access ? 'New Password' : 'Password'} *</label>
                <div style={{ position: 'relative' }}>
                  <input type={showPwd ? 'text' : 'password'} value={portalPwd}
                    onChange={e => setPortalPwd(e.target.value)}
                    required minLength={6} placeholder="Min. 6 characters"
                    style={{ ...inp, paddingRight: 52 }} />
                  <button type="button" onClick={() => setShowPwd(v => !v)} style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', fontSize: 11, color: '#94a3b8', cursor: 'pointer',
                  }}>{showPwd ? 'Hide' : 'Show'}</button>
                </div>
              </div>
            </div>

            {!seat?.can_add && !client.portal_access && (
              <div style={{ padding: '10px 14px', background: '#fef2f2', color: '#dc2626', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
                Seat limit reached ({seat?.users_used}/{seat?.limit}). Cannot enable portal for more clients.
              </div>
            )}

            <button type="submit" disabled={savingPortal || (!seat?.can_add && !client.portal_access)} style={{
              padding: '10px 24px', background: savingPortal ? '#93c5fd' : '#2563eb',
              color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
              cursor: savingPortal ? 'not-allowed' : 'pointer',
            }}>
              {savingPortal ? 'Saving…' : client.portal_access ? 'Update Login' : 'Enable Portal'}
            </button>
          </form>
        </div>
      )}

      {/* ── Tab: Permissions ──────────────────────────────────────────────── */}
      {tab === 'permissions' && (
        <div>
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: 0 }}>Portal Permissions</h3>
                <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>
                  Control which sections <strong>{client.name}</strong> can see in their portal
                </p>
              </div>
              {purchasedCount > 0 && (
                <div style={{ fontSize: 13, color: '#64748b' }}>
                  <strong style={{ color: '#1e293b' }}>{enabledCount}</strong> / {purchasedCount} enabled
                </div>
              )}
            </div>

            {purchasedCount === 0 ? (
              <div style={{ padding: '28px 20px', textAlign: 'center', background: '#f8fafc', borderRadius: 10, border: '1px dashed #e2e8f0' }}>
                <div style={{ fontSize: 13, color: '#64748b' }}>No portal modules in your current plan.</div>
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {MODULES.filter(m => perms[m.key]?.purchased).map(m => {
                    const on = perms[m.key]?.is_enabled === true;
                    return (
                      <div key={m.key} onClick={() => togglePerm(m.key)} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '14px 16px', borderRadius: 10, cursor: 'pointer',
                        background: on ? '#eff6ff' : '#f8fafc',
                        border: `1px solid ${on ? '#bfdbfe' : '#e2e8f0'}`,
                        userSelect: 'none', transition: 'all .15s',
                      }}
                        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,.06)'}
                        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'}
                      >
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: on ? '#1d4ed8' : '#64748b' }}>{m.label}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{m.desc}</div>
                        </div>
                        <div style={{
                          width: 40, height: 22, borderRadius: 11, flexShrink: 0,
                          background: on ? '#2563eb' : '#cbd5e1', position: 'relative', transition: 'background .18s',
                        }}>
                          <div style={{
                            position: 'absolute', top: 3, width: 16, height: 16, borderRadius: '50%',
                            background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.2)',
                            left: on ? 21 : 3, transition: 'left .18s',
                          }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Shortcuts */}
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button type="button"
                    onClick={() => setPerms(prev => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, { ...v, is_enabled: v.purchased }])))}
                    style={{ padding: '6px 14px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 500 }}>
                    Enable All
                  </button>
                  <button type="button"
                    onClick={() => setPerms(prev => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, { ...v, is_enabled: false }])))}
                    style={{ padding: '6px 14px', background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
                    Disable All
                  </button>
                </div>

                {/* Locked modules note */}
                {Object.values(perms).some(p => !p.purchased) && (
                  <div style={{ marginTop: 16, padding: '10px 14px', background: '#fffbeb', borderRadius: 8, border: '1px solid #fde68a', fontSize: 12, color: '#92400e' }}>
                    {Object.values(perms).filter(p => !p.purchased).length} module(s) not available in your current plan.
                    Upgrade to unlock Projects, Documents, Chat, and more.
                  </div>
                )}
              </>
            )}
          </div>

          <button onClick={savePerms} disabled={savingPerms || purchasedCount === 0} style={{
            padding: '11px 28px', background: savingPerms ? '#93c5fd' : '#2563eb',
            color: '#fff', border: 'none', borderRadius: 8,
            fontSize: 14, fontWeight: 600, cursor: (savingPerms || purchasedCount === 0) ? 'not-allowed' : 'pointer',
          }}>
            {savingPerms ? 'Saving…' : 'Save Permissions'}
          </button>
        </div>
      )}

      {/* ── Tab: Sales Chat ───────────────────────────────────────────────── */}
      {tab === 'chat' && (
        <div style={card}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '0 0 14px' }}>Sales Chat</h3>
          {chat.length === 0 ? (
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 14 }}>No messages yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 320, overflowY: 'auto', marginBottom: 14 }}>
              {chat.map(m => (
                <div key={m.id}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>
                    {m.sender_admin ? `${m.sender_admin.name} (Admin)` : m.sender?.name ?? 'Unknown'}
                  </div>
                  {m.content && <div style={{ fontSize: 13, color: '#475569' }}>{m.content}</div>}
                  {m.attachment_name && (
                    <button onClick={() => downloadChatAttachment(m)} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 4, padding: '4px 10px',
                      borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#2563eb',
                      fontSize: 12, cursor: 'pointer',
                    }}>📎 {m.attachment_name}</button>
                  )}
                </div>
              ))}
            </div>
          )}
          {chatFile && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', marginBottom: 8, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <span style={{ fontSize: 12, color: '#334155' }}>📎 {chatFile.name} <span style={{ color: '#94a3b8' }}>({fmtFileSize(chatFile.size)})</span></span>
              <button type="button" onClick={() => setChatFile(null)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Remove</button>
            </div>
          )}
          <form onSubmit={sendChat} style={{ display: 'flex', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, borderRadius: 8, border: '1.5px dashed #cbd5e1', background: '#fff', color: '#64748b', cursor: 'pointer', flexShrink: 0 }}>
              📎
              <input
                type="file" style={{ display: 'none' }}
                accept={ALLOWED_ATTACHMENT_TYPES.map(t => `.${t}`).join(',')}
                onChange={e => { setChatFile(e.target.files?.[0] ?? null); e.target.value = ''; }}
              />
            </label>
            <input
              value={chatText} onChange={e => setChatText(e.target.value)}
              placeholder="Message about this client…" style={{ ...inp, flex: 1 }}
            />
            <button type="submit" disabled={sendingChat} style={{
              padding: '9px 16px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff',
              fontSize: 13, fontWeight: 600, cursor: sendingChat ? 'wait' : 'pointer', opacity: sendingChat ? 0.7 : 1,
            }}>Send</button>
          </form>
        </div>
      )}

      {/* ── Tab: Client Messages ──────────────────────────────────────────── */}
      {tab === 'messages' && (
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ width: 200, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', flexShrink: 0 }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', fontSize: 12, fontWeight: 600, color: '#64748b' }}>Conversations</div>
            {dmThreads.length === 0 ? (
              <div style={{ padding: 16, fontSize: 12, color: '#94a3b8' }}>No messages yet.</div>
            ) : dmThreads.map((t: any) => (
              <div key={t.id} onClick={() => selectDmThread(t)} style={{
                padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f8fafc',
                background: dmActiveThread?.id === t.id ? '#eff6ff' : '#fff', fontSize: 12, fontWeight: 600,
                color: dmActiveThread?.id === t.id ? '#2563eb' : '#1e293b',
              }}>
                {t.title || `Thread #${t.id}`}
              </div>
            ))}
          </div>
          <div style={{ ...card, flex: 1, margin: 0 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '0 0 14px' }}>Client Messages</h3>
            {!dmActiveThread ? (
              <div style={{ fontSize: 13, color: '#94a3b8' }}>No conversation selected.</div>
            ) : (
              <>
                {dmMessages.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 14 }}>No messages yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 320, overflowY: 'auto', marginBottom: 14 }}>
                    {dmMessages.map((m: any) => (
                      <div key={m.id}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>
                          {m.sender_admin ? `${m.sender_admin.name} (Admin)` : m.sender?.name ?? 'Client'}
                        </div>
                        {m.content && <div style={{ fontSize: 13, color: '#475569' }}>{m.content}</div>}
                      </div>
                    ))}
                  </div>
                )}
                <form onSubmit={sendDm} style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={dmText} onChange={e => setDmText(e.target.value)}
                    placeholder="Reply to client…" style={{ ...inp, flex: 1 }}
                  />
                  <button type="submit" disabled={sendingDm} style={{
                    padding: '9px 16px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff',
                    fontSize: 13, fontWeight: 600, cursor: sendingDm ? 'wait' : 'pointer', opacity: sendingDm ? 0.7 : 1,
                  }}>Send</button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
