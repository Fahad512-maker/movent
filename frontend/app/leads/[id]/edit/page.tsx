'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { adminLeadService, userLeadService } from '@/lib/services/adminLeadService';
import { getAuthType, can } from '@/lib/auth';
import { HiArrowLeft } from 'react-icons/hi2';

const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', background: '#fafafa', color: '#0f172a', boxSizing: 'border-box' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' };

export default function EditLeadPage() {
  const router  = useRouter();
  const params  = useParams<{ id: string }>();
  const leadId  = Number(params.id);
  const isAdmin = getAuthType() === 'admin';
  const isUser  = getAuthType() === 'user';

  useEffect(() => {
    if (!isAdmin && !isUser) { router.replace('/admin/login'); return; }
    if (isUser && !can('sales', 'canEditLeads')) router.replace(`/leads/${leadId}`);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [loading, setSaving_]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');
  const [name, setName]               = useState('');
  const [email, setEmail]             = useState('');
  const [phone, setPhone]             = useState('');
  const [companyName, setCompanyName] = useState('');
  const [source, setSource]           = useState('');
  const [status, setStatus]           = useState('new');
  // The status this lead ACTUALLY had when loaded — not `status` itself,
  // since that becomes the dropdown's live value. Drives the one-way Won
  // lock (mirrors the lead detail page's pipeline bar): once won, this form
  // must not be a backdoor to revert it to an earlier stage.
  const [originalStatus, setOriginalStatus] = useState('new');
  const [priority, setPriority]       = useState('medium');
  const [estValue, setEstValue]       = useState('');
  const [notes, setNotes]             = useState('');
  const [followupDate, setFollowupDate] = useState('');
  const [followupTime, setFollowupTime] = useState('');

  useEffect(() => {
    const svc = isAdmin ? adminLeadService : userLeadService;
    svc.getOne(leadId).then(lead => {
      setName(lead.name);
      setEmail(lead.email ?? '');
      setPhone(lead.phone ?? '');
      setCompanyName(lead.company_name ?? '');
      setSource(lead.source ?? '');
      setStatus(lead.status);
      setOriginalStatus(lead.status);
      setPriority(lead.priority);
      setEstValue(lead.estimated_value > 0 ? String(lead.estimated_value) : '');
      setNotes(lead.notes ?? '');
      setFollowupDate(lead.next_followup_date ?? '');
      setFollowupTime(lead.next_followup_time ?? '');
    }).catch(() => setError('Failed to load lead')).finally(() => setSaving_(false));
  }, [leadId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const payload = {
        name:               name.trim(),
        email:              email.trim() || null,
        phone:              phone.trim() || null,
        company_name:       companyName.trim() || null,
        source:             source || null,
        status,
        priority,
        estimated_value:    estValue ? parseFloat(estValue) : null,
        notes:              notes.trim() || null,
        next_followup_date: followupDate || null,
        next_followup_time: followupTime || null,
      };
      if (isAdmin) await adminLeadService.update(leadId, payload);
      else await userLeadService.update(leadId, payload);
      router.push(`${isAdmin ? '/admin' : ''}/leads/${leadId}`);
    } catch (err: unknown) {
      const ex = err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } };
      const msgs = ex.response?.data?.errors;
      if (msgs) setError(Object.values(msgs).flat().join(' · '));
      else setError(ex.response?.data?.message ?? 'Failed to update lead');
    } finally { setSaving(false); }
  };

  if (loading) return <DashboardLayout title="Edit Lead"><div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div></DashboardLayout>;

  return (
    <DashboardLayout title="Edit Lead">
      <div style={{ maxWidth: 720 }}>
        <button onClick={() => router.push(`${isAdmin ? '/admin' : ''}/leads/${leadId}`)} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 24, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 14 }}>
          <HiArrowLeft size={16} /> Back to Lead
        </button>

        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
          <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Edit Lead</h2>
          </div>
          <form onSubmit={handleSubmit} style={{ padding: 24 }}>
            {error && <div style={{ marginBottom: 16, padding: '9px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, color: '#dc2626', fontSize: 13 }}>{error}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
              <div><label style={lbl}>Full Name *</label><input style={inp} value={name} onChange={e => setName(e.target.value)} required /></div>
              <div><label style={lbl}>Company / Organisation</label><input style={inp} value={companyName} onChange={e => setCompanyName(e.target.value)} /></div>
              <div><label style={lbl}>Email</label><input type="email" style={inp} value={email} onChange={e => setEmail(e.target.value)} /></div>
              <div><label style={lbl}>Phone</label><input style={inp} value={phone} onChange={e => setPhone(e.target.value)} /></div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginBottom: 18 }}>
              <div>
                <label style={lbl}>Source</label>
                <select style={inp} value={source} onChange={e => setSource(e.target.value)}>
                  <option value="">— None —</option>
                  <option value="website">Website</option>
                  <option value="referral">Referral</option>
                  <option value="cold_call">Cold Call</option>
                  <option value="social">Social Media</option>
                  <option value="event">Event</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Status</label>
                {/* Once Won, status is locked entirely from this form — a
                    deal can never be walked back to an earlier stage here
                    (mirrors the lead detail page's pipeline lock). Marking a
                    Won deal Lost is still available, just via the detail
                    page's dedicated "Mark as Lost" action, not this form. */}
                <select style={originalStatus === 'won' ? { ...inp, background: '#f1f5f9', color: '#94a3b8', cursor: 'not-allowed' } : inp}
                  value={status} onChange={e => setStatus(e.target.value)} disabled={originalStatus === 'won'}>
                  {originalStatus === 'won' ? (
                    <option value="won">Won</option>
                  ) : (
                    <>
                      <option value="new">New</option>
                      <option value="contacted">Contacted</option>
                      <option value="qualified">Qualified</option>
                      <option value="proposal">Proposal</option>
                      <option value="negotiation">Negotiation</option>
                      <option value="won">Won</option>
                      <option value="lost">Lost</option>
                    </>
                  )}
                </select>
                {originalStatus === 'won' && (
                  <p style={{ margin: '5px 0 0', fontSize: 11, color: '#94a3b8' }}>
                    This lead has already been won and can&apos;t be moved back to an earlier stage.
                  </p>
                )}
              </div>
              <div>
                <label style={lbl}>Priority</label>
                <select style={inp} value={priority} onChange={e => setPriority(e.target.value)}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Est. Value</label>
                <input type="number" min={0} step="0.01" style={inp} value={estValue} onChange={e => setEstValue(e.target.value)} placeholder="0.00" />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
              <div>
                <label style={lbl}>Next Follow-up Date</label>
                <input type="date" style={inp} value={followupDate} onChange={e => setFollowupDate(e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Next Follow-up Time</label>
                <input type="time" style={inp} value={followupTime} onChange={e => setFollowupTime(e.target.value)} />
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={lbl}>Notes</label>
              <textarea style={{ ...inp, height: 96, resize: 'vertical' }} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => router.push(`${isAdmin ? '/admin' : ''}/leads/${leadId}`)} style={{ flex: 1, padding: '11px 0', borderRadius: 9, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
              <button type="submit" disabled={saving} style={{ flex: 3, padding: '11px 0', borderRadius: 9, border: 'none', background: saving ? '#93c5fd' : 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}
