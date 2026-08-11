'use client';
import { useEffect, useState } from 'react';
import { clientService } from '@/lib/services/clientService';
import clientApi from '@/lib/clientAxios';
import toast from 'react-hot-toast';

const GREEN = '#10b981';
const TYPE_OPTS = ['', 'pdf', 'spreadsheet', 'word', 'image', 'other'];

export default function ClientDocumentsPage() {
  const [docs, setDocs]       = useState<any[]>([]);
  const [type, setType]       = useState('');
  const [search, setSearch]   = useState('');
  const [loading, setLoading] = useState(true);
  const [dlId, setDlId]       = useState<number | null>(null);

  const load = (t: string, s?: string) => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (t) params.type = t;
    if (s) params.search = s;
    clientService.documents(Object.keys(params).length ? params : undefined)
      .then(setDocs)
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(''); }, []);

  const download = async (id: number, fileName: string, source: string) => {
    setDlId(id);
    try {
      const path = source === 'attachment' ? `/client/attachments/${id}/download` : `/client/documents/${id}/download`;
      const res = await clientApi.get(path, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Download failed');
    } finally {
      setDlId(null);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1e293b', margin: 0 }}>Documents</h1>
        <p style={{ fontSize: 13, color: '#94a3b8', margin: '4px 0 0' }}>Files shared with you by the team</p>
      </div>

      {/* Filter bar */}
      <div style={{
        background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
        padding: '12px 16px', marginBottom: 16,
        display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load(type, search)}
          placeholder="Search file name…"
          style={{ padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', background: '#f8fafc', width: 200 }}
        />
        <div style={{ width: 1, height: 28, background: '#e2e8f0' }} />
        {TYPE_OPTS.map(t => (
          <button key={t} onClick={() => { setType(t); load(t, search); }} style={{
            padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer',
            border: '1px solid',
            borderColor: type === t ? GREEN : '#e2e8f0',
            background: type === t ? '#ecfdf5' : '#fff',
            color: type === t ? GREEN : '#64748b',
          }}>{t || 'All'}</button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : docs.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>No documents shared with you yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['File Name', 'Type', 'Size', 'Project', 'Uploaded By', 'Date'].map(h => (
                  <th key={h} style={{ padding: '10px 18px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
                <th style={{ padding: '10px 18px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc: any) => (
                <tr key={doc.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ padding: '12px 18px', fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{doc.title}</td>
                  <td style={{ padding: '12px 18px', fontSize: 12, color: '#64748b', textTransform: 'uppercase' }}>{doc.type || '—'}</td>
                  <td style={{ padding: '12px 18px', fontSize: 12, color: '#64748b' }}>
                    {doc.file_size_bytes ? `${Math.round(doc.file_size_bytes / 1024)} KB` : '—'}
                  </td>
                  <td style={{ padding: '12px 18px', fontSize: 12, color: '#64748b' }}>
                    {doc.linked_to_type === 'project' ? `Project #${doc.linked_to_id}` : '—'}
                  </td>
                  <td style={{ padding: '12px 18px', fontSize: 12, color: '#64748b' }}>{doc.uploaded_by?.name || '—'}</td>
                  <td style={{ padding: '12px 18px', fontSize: 12, color: '#64748b' }}>{doc.created_at?.split('T')[0] || '—'}</td>
                  <td style={{ padding: '12px 18px', textAlign: 'right' }}>
                    <button
                      onClick={() => download(doc.id, doc.file_name || doc.title, doc.source)}
                      disabled={dlId === doc.id}
                      style={{
                        fontSize: 12, color: dlId === doc.id ? '#94a3b8' : GREEN, fontWeight: 600,
                        background: 'none', border: `1px solid ${dlId === doc.id ? '#e2e8f0' : '#a7f3d0'}`,
                        borderRadius: 6, padding: '4px 12px', cursor: dlId === doc.id ? 'not-allowed' : 'pointer',
                      }}>
                      {dlId === doc.id ? '…' : 'Download'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
