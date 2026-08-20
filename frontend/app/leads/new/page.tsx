'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { adminLeadService, userLeadService } from '@/lib/services/adminLeadService';
import { adminClientService, ClientCompany } from '@/lib/services/adminClientService';
import { getAuthType, can } from '@/lib/auth';
import { HiArrowLeft } from 'react-icons/hi2';
import SubmitButton from '@/components/ui/SubmitButton';
import LoadingOverlay from '@/components/ui/LoadingOverlay';
import PhoneInput from '@/components/ui/PhoneInput';

const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', background: '#fafafa', color: '#0f172a', boxSizing: 'border-box' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' };

export default function NewLeadPage() {
  const router   = useRouter();
  const isAdmin  = getAuthType() === 'admin';
  const isUser   = getAuthType() === 'user';

  useEffect(() => {
    if (!isAdmin && !isUser) { router.replace('/admin/login'); return; }
    if (isUser && !can('sales', 'canCreateLeads')) router.replace('/leads');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [companies, setCompanies]         = useState<ClientCompany[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');
  const [companyId, setCompanyId]     = useState(0);
  const [name, setName]               = useState('');
  const [email, setEmail]             = useState('');
  const [phone, setPhone]             = useState('');
  const [companyName, setCompanyName] = useState('');
  const [source, setSource]           = useState('');
  const [status, setStatus]           = useState('new');
  const [priority, setPriority]       = useState('medium');
  const [estValue, setEstValue]       = useState('');
  const [notes, setNotes]             = useState('');
  const [followupDate, setFollowupDate] = useState('');
  const [followupTime, setFollowupTime] = useState('');

  useEffect(() => {
    if (isAdmin) {
      adminClientService.companies().then(cs => {
        setCompanies(cs);
        if (cs.length) setCompanyId(cs[0].id);
      }).catch(() => {}).finally(() => setCompaniesLoading(false));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Falls back to the first loaded company even if companyId's state update
  // hasn't flushed yet — keeps submit-time validation in sync with what the
  // dropdown displays.
  const effectiveCompanyId = companyId || companies[0]?.id || 0;

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return; // Guards a double-click/Enter re-submit before the disabled prop re-renders.
    if (isAdmin && companies.length === 0) { setError('No active company found for your account. Please contact support.'); return; }
    if (isAdmin && companies.length > 1 && !effectiveCompanyId) { setError('Select a company'); return; }
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

      const lead = isAdmin
        ? await adminLeadService.create({ ...payload, company_id: effectiveCompanyId })
        : await userLeadService.create(payload);

      const root = isAdmin ? '/admin/leads' : '/leads';
      router.push(`${root}/${lead.id}`);
    } catch (err: unknown) {
      const ex = err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } };
      const msgs = ex.response?.data?.errors;
      if (msgs) setError(Object.values(msgs).flat().join(' · '));
      else setError(ex.response?.data?.message ?? 'Failed to create lead');
    } finally { setSaving(false); }
  };

  return (
    <DashboardLayout title="New Lead">
      <LoadingOverlay show={saving} message="Creating Lead…" />
      <div style={{ width: '100%', maxWidth: 'none' }}>
        <button onClick={() => router.back()} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 24, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 14 }}>
          <HiArrowLeft size={16} /> Back
        </button>

        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
          <div style={{ padding: '18px 24px', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Add New Lead</h2>
          </div>
          <form onSubmit={handleSubmit} style={{ padding: 24 }}>
            {error && <div style={{ marginBottom: 16, padding: '9px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, color: '#dc2626', fontSize: 13 }}>{error}</div>}

            {/* Company (admin only) — rendered immediately (not gated on the
                fetch resolving) so the field never pops in after a delay;
                shows a disabled placeholder while loading, then the real
                list with the default (first) company already selected. */}
            {isAdmin && (companiesLoading || companies.length >= 1) && (
              <div style={{ marginBottom: 18 }}>
                <label style={lbl}>Company *</label>
                {companiesLoading ? (
                  <select style={inp} disabled>
                    <option>Loading companies…</option>
                  </select>
                ) : (
                  <select style={inp} value={effectiveCompanyId} onChange={e => setCompanyId(Number(e.target.value))} required>
                    <option value={0}>Select company…</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
              </div>
            )}

            {/* Contact info */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 18 }}>
              <div>
                <label style={lbl}>Full Name *</label>
                <input style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="Lead's full name" required />
              </div>
              <div>
                <label style={lbl}>Company / Organisation</label>
                <input style={inp} value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Their company name" />
              </div>
              <div>
                <label style={lbl}>Email</label>
                <input type="email" style={inp} value={email} onChange={e => setEmail(e.target.value)} placeholder="lead@example.com" />
              </div>
              <div>
                <label style={lbl}>Phone</label>
                <PhoneInput value={phone} onChange={setPhone} />
              </div>
            </div>

            {/* Lead meta */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 18 }}>
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
                {/* No "Won" option here — a lead only becomes Won via the
                    pipeline action (which stamps deal_reference/won_at) or
                    automatically once its invoice is paid in full, never at
                    creation (mirrors Api\*\LeadController::store()'s guard). */}
                <select style={inp} value={status} onChange={e => setStatus(e.target.value)}>
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="qualified">Qualified</option>
                  <option value="proposal">Proposal</option>
                  <option value="negotiation">Negotiation</option>
                  <option value="lost">Lost</option>
                </select>
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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 18 }}>
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
              <textarea style={{ ...inp, height: 96, resize: 'vertical' }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional context, meeting notes, etc." />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => router.back()} disabled={saving} style={{ padding: '10px 22px', borderRadius: 9, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 14, fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer' }}>Cancel</button>
              <SubmitButton loading={saving} loadingText="Creating Lead…" style={{ padding: '10px 28px', borderRadius: 9, border: 'none', background: saving ? '#93c5fd' : 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', fontSize: 14, fontWeight: 700 }}>
                Create Lead
              </SubmitButton>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}
