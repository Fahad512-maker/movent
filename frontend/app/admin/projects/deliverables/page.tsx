'use client';
import { Fragment, useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import toast from 'react-hot-toast';
import { useModuleGuard } from '@/hooks/useModuleGuard';
import { adminProjectService, Deliverable, Project, Task } from '@/lib/services/adminProjectService';
import { adminClientService } from '@/lib/services/adminClientService';
import { Client } from '@/types';
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
  const [approvingDelivery, setApprovingDelivery] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientSelections, setClientSelections] = useState<Record<number, string>>({});
  const [attachingClientId, setAttachingClientId] = useState<number | null>(null);
  const [clientForms, setClientForms] = useState<Record<number, { open: boolean; name: string; email: string; password: string; enablePortal: boolean }>>({});
  const [creatingClientId, setCreatingClientId] = useState<number | null>(null);

  useEffect(() => {
    adminProjectService.list({ status: 'completed' }).then(list => {
      setProjects(list);
      if (list.length > 0) setProjectId(String(list[0].id));
    }).catch(() => toast.error('Failed to load projects'));
    adminClientService.list().then(res => setClients(res.clients)).catch(() => {});
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
  const selectedProject = projects.find(p => String(p.id) === projectId);
  const pendingProjectDeliveries = projects.filter(p => p.delivery_status === 'pending_admin_review');

  // This button only ever shows for a client with real portal access (see
  // the render gating below), so there's no guest email step to collect —
  // safe to chain both backend steps (internal approve, then send) as one
  // click here, unlike the per-project Delivery tab which shows them
  // separately (see /admin/projects/[id]/delivery).
  const approveProjectDelivery = async (project = selectedProject) => {
    if (!project) return;
    if (!confirm('Approve this project delivery and send it to the client?')) return;
    setApprovingDelivery(true);
    try {
      await adminProjectService.approveDelivery(project.id);
      const updated = await adminProjectService.deliverToClient(project.id);
      setProjects(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
      if (String(project.id) === projectId) setProjectId(String(updated.id));
      toast.success('Project delivered to client');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to deliver project');
    } finally { setApprovingDelivery(false); }
  };

  const downloadProjectDelivery = async (project = selectedProject) => {
    if (!project?.delivery_file_name) { toast.error('Delivery file is not available'); return; }
    try {
      await adminProjectService.downloadDelivery(project.id, project.delivery_file_name);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Download failed');
    }
  };

  const attachClient = async (project: Project) => {
    const clientId = Number(clientSelections[project.id] || 0);
    if (!clientId) { toast.error('Select a client first'); return; }
    setAttachingClientId(project.id);
    try {
      const updated = await adminProjectService.update(project.id, { client_id: clientId });
      setProjects(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
      toast.success('Client attached');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to attach client');
    } finally {
      setAttachingClientId(null);
    }
  };

  const createAndAttachClient = async (project: Project) => {
    const form = clientForms[project.id] ?? { open: false, name: '', email: '', password: '', enablePortal: true };
    if (!form.name.trim()) { toast.error('Client name is required'); return; }
    if (form.enablePortal && !form.email.trim()) { toast.error('Client email is required for portal access'); return; }
    if (form.enablePortal && form.password.length < 6) { toast.error('Portal password must be at least 6 characters'); return; }

    const email = form.email.trim().toLowerCase();
    const name = form.name.trim().toLowerCase();
    const existingClient = clients.find(client =>
      client.company_id === project.company_id
      && (
        (!!email && (client.email ?? '').trim().toLowerCase() === email)
        || (!email && client.name.trim().toLowerCase() === name)
      )
    );

    if (existingClient) {
      setClientSelections(prev => ({ ...prev, [project.id]: String(existingClient.id) }));
      toast.error('Client already exists. Select it from the dropdown and attach it.');
      return;
    }

    setCreatingClientId(project.id);
    try {
      const client = await adminClientService.create({
        company_id: project.company_id,
        name: form.name.trim(),
        email: form.email.trim() || null,
        status: 'active',
        enable_portal: form.enablePortal,
        portal_email: form.enablePortal ? form.email.trim() : null,
        portal_password: form.enablePortal ? form.password : null,
      });
      setClients(prev => [client, ...prev]);
      const updated = await adminProjectService.update(project.id, { client_id: client.id });
      setProjects(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
      setClientForms(prev => ({ ...prev, [project.id]: { open: false, name: '', email: '', password: '', enablePortal: true } }));
      toast.success(form.enablePortal ? 'Client created with portal access and attached' : 'Client created and attached');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to create client');
    } finally {
      setCreatingClientId(null);
    }
  };

  return (
    <DashboardLayout title="Deliverables">
      <div style={{ maxWidth: 1200 }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>Project Delivery Review</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>Review final project packages submitted by PMs, then approve and send them to clients</p>
        </div>

        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>Pending Project Deliveries</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>PM-submitted final project packages waiting for admin approval</div>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#0d9488', background: '#ccfbf1', borderRadius: 999, padding: '5px 10px' }}>
              {pendingProjectDeliveries.length} pending
            </span>
          </div>

          {pendingProjectDeliveries.length === 0 ? (
            <div style={{ padding: '22px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No project deliveries are waiting for approval.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pendingProjectDeliveries.map(project => (
                <div key={project.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 14px', border: '1px solid #e2e8f0', borderRadius: 8, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 240 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{project.name}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
                      {project.delivery_file_name || 'Final project package'} {project.client?.name ? `- ${project.client.name}` : '- No client linked'}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
                      Submitted {fmtDate(project.delivery_submitted_at || project.updated_at)}
                    </div>
                  </div>
                  {!project.client_id && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 300 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <select
                          value={clientSelections[project.id] ?? ''}
                          onChange={e => setClientSelections(prev => ({ ...prev, [project.id]: e.target.value }))}
                          style={{ ...inp, width: 210, padding: '8px 10px', fontSize: 12 }}
                        >
                          <option value="">Select client...</option>
                          {clients.filter(c => c.company_id === project.company_id && c.status === 'active').map(client => (
                            <option key={client.id} value={client.id}>{client.name}{client.email ? ` (${client.email})` : ''}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => attachClient(project)}
                          disabled={attachingClientId === project.id}
                          style={{
                            padding: '8px 12px', background: '#fff', color: '#0d9488',
                            border: '1px solid #99f6e4', borderRadius: 8, fontSize: 12, fontWeight: 700,
                            cursor: attachingClientId === project.id ? 'wait' : 'pointer',
                          }}
                        >
                          {attachingClientId === project.id ? 'Attaching...' : 'Attach Client'}
                        </button>
                        <button
                          onClick={() => setClientForms(prev => ({
                            ...prev,
                            [project.id]: {
                              open: !(prev[project.id]?.open ?? false),
                              name: prev[project.id]?.name ?? '',
                              email: prev[project.id]?.email ?? '',
                              password: prev[project.id]?.password ?? '',
                              enablePortal: prev[project.id]?.enablePortal ?? true,
                            },
                          }))}
                          style={{
                            padding: '8px 12px', background: '#fff', color: '#2563eb',
                            border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          }}
                        >
                          Add New Client
                        </button>
                      </div>
                      {clientForms[project.id]?.open && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: 10, border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc' }}>
                          <input
                            value={clientForms[project.id]?.name ?? ''}
                            onChange={e => setClientForms(prev => ({ ...prev, [project.id]: { open: true, name: e.target.value, email: prev[project.id]?.email ?? '', password: prev[project.id]?.password ?? '', enablePortal: prev[project.id]?.enablePortal ?? true } }))}
                            placeholder="Client name"
                            style={{ ...inp, width: 160, padding: '8px 10px', fontSize: 12 }}
                          />
                          <input
                            value={clientForms[project.id]?.email ?? ''}
                            onChange={e => setClientForms(prev => ({ ...prev, [project.id]: { open: true, name: prev[project.id]?.name ?? '', email: e.target.value, password: prev[project.id]?.password ?? '', enablePortal: prev[project.id]?.enablePortal ?? true } }))}
                            placeholder="Client email"
                            style={{ ...inp, width: 190, padding: '8px 10px', fontSize: 12 }}
                          />
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#334155', fontWeight: 700 }}>
                            <input
                              type="checkbox"
                              checked={clientForms[project.id]?.enablePortal ?? true}
                              onChange={e => setClientForms(prev => ({ ...prev, [project.id]: { open: true, name: prev[project.id]?.name ?? '', email: prev[project.id]?.email ?? '', password: prev[project.id]?.password ?? '', enablePortal: e.target.checked } }))}
                            />
                            Activate portal
                          </label>
                          {(clientForms[project.id]?.enablePortal ?? true) && (
                            <input
                              type="password"
                              value={clientForms[project.id]?.password ?? ''}
                              onChange={e => setClientForms(prev => ({ ...prev, [project.id]: { open: true, name: prev[project.id]?.name ?? '', email: prev[project.id]?.email ?? '', password: e.target.value, enablePortal: prev[project.id]?.enablePortal ?? true } }))}
                              placeholder="Portal password"
                              style={{ ...inp, width: 150, padding: '8px 10px', fontSize: 12 }}
                            />
                          )}
                          {!(clientForms[project.id]?.enablePortal ?? true) && (
                            <div style={{ fontSize: 11, color: '#b45309', flexBasis: '100%' }}>Client will be attached as contact only. Enable portal later before sending the delivery.</div>
                          )}
                          <button
                            onClick={() => createAndAttachClient(project)}
                            disabled={creatingClientId === project.id}
                            style={{
                              padding: '8px 12px', background: creatingClientId === project.id ? '#93c5fd' : '#2563eb',
                              color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700,
                              cursor: creatingClientId === project.id ? 'wait' : 'pointer',
                            }}
                          >
                            {creatingClientId === project.id ? 'Creating...' : 'Create & Attach'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {project.client_id && (!project.client?.portal_access || !project.client?.user_id) && (
                    <div style={{ fontSize: 12, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 10px' }}>
                      Enable portal access for this client before sending.
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {project.delivery_file_name && (
                      <button onClick={() => downloadProjectDelivery(project)} style={{
                        padding: '8px 14px', background: '#fff', color: '#2563eb',
                        border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      }}>
                        Download PM Package
                      </button>
                    )}
                    {project.client_id && project.client?.portal_access && project.client?.user_id && (
                      <button onClick={() => approveProjectDelivery(project)} disabled={approvingDelivery} style={{
                        padding: '8px 14px', background: approvingDelivery ? '#93c5fd' : '#0d9488', color: '#fff',
                        border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: approvingDelivery ? 'not-allowed' : 'pointer',
                      }}>
                        {approvingDelivery ? 'Delivering...' : 'Approve & Send to Client'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
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

        {selectedProject && (
          <div style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Client Delivery</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                {selectedProject.delivery_status === 'pending_admin_review'
                  ? `Pending admin review${selectedProject.delivery_file_name ? `: ${selectedProject.delivery_file_name}` : ''}`
                  : selectedProject.delivery_status === 'approved'
                    ? `Approved, not yet sent to client${selectedProject.delivery_file_name ? `: ${selectedProject.delivery_file_name}` : ''}`
                    : selectedProject.delivery_status === 'delivered_to_client'
                      ? `Delivered to client${selectedProject.delivery_file_name ? `: ${selectedProject.delivery_file_name}` : ''}`
                      : 'PM has not submitted final project delivery yet.'}
              </div>
            </div>
            {/* Stays available once delivered too — the backend endpoint
                never required 'pending_admin_review', only that the file
                exists, so this used to vanish right after approval even
                though the file was still sitting in storage. */}
            {selectedProject.delivery_file_name && (
              <button onClick={() => downloadProjectDelivery()} style={{
                padding: '9px 18px', background: '#fff', color: '#2563eb',
                border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}>
                Download PM Package
              </button>
            )}
            {selectedProject.delivery_status === 'approved' && (
              <button onClick={() => adminProjectService.deliverToClient(selectedProject.id).then(updated => {
                setProjects(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
                toast.success('Project delivered to client');
              }).catch((err: any) => toast.error(err?.response?.data?.message || 'Failed to deliver project'))} style={{
                padding: '9px 18px', background: '#0d9488', color: '#fff',
                border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}>
                Send to Client
              </button>
            )}
            {selectedProject.delivery_status === 'pending_admin_review' && (
              <button onClick={() => approveProjectDelivery()} disabled={approvingDelivery} style={{
                padding: '9px 18px', background: approvingDelivery ? '#93c5fd' : '#0d9488', color: '#fff',
                border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: approvingDelivery ? 'not-allowed' : 'pointer',
              }}>
                {approvingDelivery ? 'Delivering…' : 'Approve & Deliver to Client'}
              </button>
            )}
          </div>
        )}

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
