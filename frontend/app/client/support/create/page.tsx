'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientService } from '@/lib/services/clientService';
import toast from 'react-hot-toast';

const GREEN = '#10b981';

export default function ClientCreateTicketPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    subject: '', category: 'general', priority: 'medium', description: '',
  });
  const [file, setFile]       = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('subject',     form.subject);
      fd.append('category',    form.category);
      fd.append('priority',    form.priority);
      fd.append('description', form.description);
      if (file) fd.append('attachment', file);
      await clientService.createTicket(fd);
      toast.success('Ticket raised successfully!');
      router.push('/client/support');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to create ticket');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0',
    borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 6,
  };

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 20 }}>←</button>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Raise Support Ticket</h1>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 28 }}>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Subject *</label>
            <input value={form.subject} onChange={e => set('subject', e.target.value)} required placeholder="Briefly describe your issue" style={inputStyle} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
            <div>
              <label style={labelStyle}>Category *</label>
              <select value={form.category} onChange={e => set('category', e.target.value)} style={{ ...inputStyle, background: '#fff' }}>
                <option value="billing">Billing</option>
                <option value="technical">Technical</option>
                <option value="project">Project</option>
                <option value="general">General</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Priority *</label>
              <select value={form.priority} onChange={e => set('priority', e.target.value)} style={{ ...inputStyle, background: '#fff' }}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={labelStyle}>Description</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={5}
              placeholder="Describe your issue in detail…"
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Attachment (optional)</label>
            <input type="file" onChange={e => setFile(e.target.files?.[0] || null)} style={{ fontSize: 13, color: '#64748b' }} />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="submit" disabled={loading}
              style={{
                padding: '10px 24px', background: loading ? '#a7f3d0' : GREEN,
                color: '#fff', fontWeight: 600, fontSize: 14,
                border: 'none', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer',
              }}>
              {loading ? 'Submitting...' : 'Raise Ticket'}
            </button>
            <button
              type="button" onClick={() => router.back()}
              style={{
                padding: '10px 20px', background: '#fff', color: '#64748b',
                border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, cursor: 'pointer',
              }}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
