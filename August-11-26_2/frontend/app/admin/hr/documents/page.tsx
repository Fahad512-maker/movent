'use client';
import { useEffect, useRef, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useModuleGuard } from '@/hooks/useModuleGuard';
import { adminHrService, Employee, EmployeeDocument } from '@/lib/services/adminHrService';
import { inp, lbl, card, fmtFileSize } from '@/components/admin/projects/shared';
import toast from 'react-hot-toast';

export default function HrDocumentsPage() {
  useModuleGuard('employees');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    adminHrService.employees.list().then(list => {
      setEmployees(list);
      if (list.length) setEmployeeId(String(list[0].id));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!employeeId) return;
    setLoading(true);
    adminHrService.employees.documents.list(Number(employeeId))
      .then(setDocuments)
      .catch(() => toast.error('Failed to load documents'))
      .finally(() => setLoading(false));
  }, [employeeId]);

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId || !file || !title) { toast.error('Employee, title and file are required'); return; }
    setUploading(true);
    try {
      const doc = await adminHrService.employees.documents.upload(Number(employeeId), file, title);
      setDocuments(prev => [doc, ...prev]);
      setTitle(''); setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      toast.success('Document uploaded');
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Failed to upload document'); }
    finally { setUploading(false); }
  };

  const remove = async (docId: number) => {
    if (!employeeId) return;
    try {
      await adminHrService.employees.documents.remove(Number(employeeId), docId);
      setDocuments(prev => prev.filter(d => d.id !== docId));
      toast.success('Document removed');
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Failed to remove document'); }
  };

  return (
    <DashboardLayout title="HR Documents">
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: '0 0 20px' }}>HR Documents</h2>

      <div style={{ ...card, marginBottom: 20 }}>
        <label style={lbl}>Employee</label>
        <select value={employeeId} onChange={e => setEmployeeId(e.target.value)} style={{ ...inp, maxWidth: 320 }}>
          {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name} ({emp.employee_code})</option>)}
        </select>
      </div>

      {employeeId && (
        <>
          <form onSubmit={upload} style={{ ...card, display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 20 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Document Title</label>
              <input value={title} onChange={e => setTitle(e.target.value)} style={inp} placeholder="e.g. Employment Contract" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>File</label>
              <input ref={fileInputRef} type="file" onChange={e => setFile(e.target.files?.[0] ?? null)} style={inp} />
            </div>
            <button type="submit" disabled={uploading} style={{ padding: '9px 20px', background: uploading ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: uploading ? 'not-allowed' : 'pointer' }}>
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </form>

          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
            ) : documents.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>No documents uploaded for this employee.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['Title', 'File', 'Size', 'Uploaded', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {documents.map(d => (
                    <tr key={d.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{d.title}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{d.file_name ?? '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{d.file_size_bytes ? fmtFileSize(d.file_size_bytes) : '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{new Date(d.created_at).toLocaleDateString('en-GB')}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <button onClick={() => remove(d.id)} style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, borderRadius: 6, background: '#fef2f2', color: '#dc2626', border: 'none', cursor: 'pointer' }}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
