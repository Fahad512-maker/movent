'use client';
import { Fragment, useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import toast from 'react-hot-toast';
import { useModuleGuard } from '@/hooks/useModuleGuard';
import { adminProjectService, Deliverable, Project, Task } from '@/lib/services/adminProjectService';
import { inp, lbl, card, Badge, DELIVERABLE_SC, fmtDate } from '@/components/admin/projects/shared';

export default function DeliverablesPage() {
  useModuleGuard('projects');
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [statusF, setStatusF] = useState('');
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [history, setHistory] = useState<Deliverable[]>([]);
  const [revisionFor, setRevisionFor] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadTaskId, setUploadTaskId] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    adminProjectService.list().then(list => {
      setProjects(list);
      if (list.length > 0) setProjectId(String(list[0].id));
    }).catch(() => toast.error('Failed to load projects'));
  }, []);

  const load = async (pid: string) => {
    if (!pid) { setDeliverables([]); setTasks([]); return; }
    setLoading(true);
    try {
      const [d, t] = await Promise.all([
        adminProjectService.deliverables.list(Number(pid)),
        adminProjectService.tasks.list(Number(pid)),
      ]);
      setDeliverables(d);
      setTasks(t);
    } catch { toast.error('Failed to load deliverables'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(projectId); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!projectId || !uploadFile || !uploadTitle) { toast.error('Select a project, title and file'); return; }
    setUploading(true);
    try {
      await adminProjectService.deliverables.upload(Number(projectId), uploadFile, uploadTitle, uploadTaskId ? Number(uploadTaskId) : undefined);
      toast.success('Deliverable uploaded');
      setUploadTitle(''); setUploadTaskId(''); setUploadFile(null);
      load(projectId);
    } catch { toast.error('Failed to upload deliverable'); }
    finally { setUploading(false); }
  };

  const approve = async (d: Deliverable) => {
    try {
      await adminProjectService.deliverables.approve(d.id);
      toast.success('Deliverable approved');
      load(projectId);
    } catch { toast.error('Failed to approve deliverable'); }
  };

  const submitRevision = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!revisionFor) return;
    try {
      await adminProjectService.deliverables.requestRevision(revisionFor, feedback || undefined);
      toast.success('Revision requested');
      setRevisionFor(null);
      setFeedback('');
      load(projectId);
    } catch { toast.error('Failed to request revision'); }
  };

  const toggleHistory = async (d: Deliverable) => {
    if (expanded === d.id) { setExpanded(null); return; }
    setExpanded(d.id);
    if (!d.task_id) { setHistory([d]); return; }
    const all = deliverables.filter(x => x.task_id === d.task_id);
    setHistory(all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
  };

  const filtered = statusF ? deliverables.filter(d => d.status === statusF) : deliverables;

  return (
    <DashboardLayout title="Deliverables">
      <div style={{ maxWidth: 1200 }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>Deliverables</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>Upload, review and approve project deliverables</p>
        </div>

        <div style={{
          background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0',
          padding: '12px 16px', marginBottom: 16,
          display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <select value={projectId} onChange={e => setProjectId(e.target.value)} style={{ ...inp, width: 220 }}>
            <option value="">Select project…</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={statusF} onChange={e => setStatusF(e.target.value)} style={{ ...inp, width: 180 }}>
            <option value="">All Statuses</option>
            {Object.keys(DELIVERABLE_SC).map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </div>

        {projectId && (
          <form onSubmit={upload} style={{ ...card, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={lbl}>Title *</label>
              <input value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} placeholder="Deliverable title" style={inp} />
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={lbl}>Task (optional)</label>
              <select value={uploadTaskId} onChange={e => setUploadTaskId(e.target.value)} style={inp}>
                <option value="">No task</option>
                {tasks.map(t => <option key={t.id} value={t.id}>{t.task_number ? `${t.task_number} - ${t.title}` : t.title}</option>)}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 180 }}>
              <label style={lbl}>File *</label>
              <input type="file" onChange={e => setUploadFile(e.target.files?.[0] ?? null)} style={inp} />
            </div>
            <button type="submit" disabled={uploading} style={{
              padding: '9px 20px', background: uploading ? '#93c5fd' : '#2563eb', color: '#fff',
              border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: uploading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
            }}>{uploading ? 'Uploading…' : 'Upload Deliverable'}</button>
          </form>
        )}

        {revisionFor && (
          <form onSubmit={submitRevision} style={{ ...card, display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Revision Feedback</label>
              <input value={feedback} onChange={e => setFeedback(e.target.value)} placeholder="What needs to change?" style={inp} />
            </div>
            <button type="submit" style={{
              padding: '9px 20px', background: '#d97706', color: '#fff',
              border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>Request Revision</button>
            <button type="button" onClick={() => { setRevisionFor(null); setFeedback(''); }} style={{
              padding: '9px 16px', background: '#fff', color: '#64748b',
              border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, cursor: 'pointer',
            }}>Cancel</button>
          </form>
        )}

        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
              {projectId ? 'No deliverables for this project yet.' : 'Select a project to view its deliverables.'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Deliverable', 'Task', 'Status', 'Uploaded', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(d => (
                  <Fragment key={d.id}>
                    <tr style={{ borderBottom: '1px solid #f8fafc' }}>
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{d.title}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: '#94a3b8' }}>{d.task ? (d.task.task_number ? `${d.task.task_number} - ${d.task.title}` : d.task.title) : '—'}</td>
                      <td style={{ padding: '12px 16px' }}><Badge label={d.status} sc={DELIVERABLE_SC[d.status]} /></td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>{fmtDate(d.created_at)}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          {d.file_path && (
                            <a href="#" onClick={e => e.preventDefault()} style={{ padding: '4px 10px', fontSize: 11, fontWeight: 500, background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 6, textDecoration: 'none' }}>{d.file_name ?? 'file'}</a>
                          )}
                          {d.status === 'delivered' && (
                            <>
                              <button onClick={() => approve(d)} style={{ padding: '4px 10px', fontSize: 11, fontWeight: 500, cursor: 'pointer', background: '#fff', color: '#059669', border: '1px solid #a7f3d0', borderRadius: 6 }}>Approve</button>
                              <button onClick={() => setRevisionFor(d.id)} style={{ padding: '4px 10px', fontSize: 11, fontWeight: 500, cursor: 'pointer', background: '#fff', color: '#d97706', border: '1px solid #fde68a', borderRadius: 6 }}>Request Revision</button>
                            </>
                          )}
                          {d.task_id && (
                            <button onClick={() => toggleHistory(d)} style={{ padding: '4px 10px', fontSize: 11, fontWeight: 500, cursor: 'pointer', background: '#fff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 6 }}>
                              {expanded === d.id ? 'Hide History' : 'Version History'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expanded === d.id && (
                      <tr>
                        <td colSpan={5} style={{ padding: '4px 16px 14px', background: '#f8fafc' }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase' }}>Version History</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {history.map((h, i) => (
                              <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#475569' }}>
                                <span>v{history.length - i} — {h.title}</span>
                                <span><Badge label={h.status} sc={DELIVERABLE_SC[h.status]} /> · {fmtDate(h.created_at)}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
