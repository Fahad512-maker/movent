'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { userProjectService } from '@/lib/services/userProjectService';
import { Project, Deliverable } from '@/lib/services/adminProjectService';
import { can, getAuthUser } from '@/lib/auth';
import { Badge, DELIVERABLE_SC, fmtFileSize, fmtDate, asRelation } from '@/components/admin/projects/shared';
import toast from 'react-hot-toast';

export default function UserDeliverablesPage() {
  useAdminGuard();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deliveryFile, setDeliveryFile] = useState<File | null>(null);
  const [submittingDelivery, setSubmittingDelivery] = useState(false);

  const canUpload   = can('project_management', 'canUploadDeliverables');
  const canCompleteProjects = can('project_management', 'canCompleteProjects');
  const me = getAuthUser() as { id?: number; role_type?: string } | null;
  const isPm = me?.role_type === 'project_manager';
  const selectedProject = projects.find(p => String(p.id) === projectId);
  const canSubmitProjectDelivery = !!selectedProject
    && selectedProject.status === 'completed'
    && selectedProject.delivery_status !== 'delivered_to_client'
    && isPm
    && canCompleteProjects
    && (
      selectedProject.project_manager_id === me.id
      || !!selectedProject.team_members?.some(member => member.user_id === me.id && member.user?.role_type === 'project_manager')
    );

  useEffect(() => {
    if (!can('project_management', 'canViewDeliverables')) {
      router.replace('/dashboard');
      return;
    }
    const requestedProjectId = new URLSearchParams(window.location.search).get('project_id') ?? '';
    userProjectService.list({ status: 'completed' })
      .then(list => {
        setProjects(list);
        if (requestedProjectId && list.some(p => String(p.id) === requestedProjectId)) {
          loadDeliverables(requestedProjectId);
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadDeliverables = async (pid: string) => {
    setProjectId(pid);
    if (!pid) { setDeliverables([]); return; }
    setLoading(true);
    try {
      setDeliverables(await userProjectService.deliverables.list(Number(pid)));
    } catch { toast.error('Failed to load deliverables'); }
    finally { setLoading(false); }
  };

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !file || !title) { toast.error('Project, title, and file are required'); return; }
    setUploading(true);
    try {
      await userProjectService.deliverables.upload(Number(projectId), file, title);
      toast.success('Deliverable uploaded');
      setTitle(''); setFile(null);
      loadDeliverables(projectId);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to upload');
    } finally { setUploading(false); }
  };

  const submitProjectDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !deliveryFile) { toast.error('Select a project and final project file'); return; }
    setSubmittingDelivery(true);
    try {
      const updated = await userProjectService.submitDelivery(selectedProject.id, deliveryFile);
      setProjects(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
      setDeliveryFile(null);
      toast.success('Project submitted for admin review');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to submit project delivery');
    } finally { setSubmittingDelivery(false); }
  };

  return (
    <DashboardLayout title="Deliverables">
      <div style={{ maxWidth: 1000 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 20px' }}>Project Delivery</h1>

        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #f1f5f9', padding: '16px 20px', marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Select Project</label>
          <select value={projectId} onChange={e => loadDeliverables(e.target.value)}
            style={{ padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', background: '#fafafa', minWidth: 260 }}>
            <option value="">Choose a project…</option>
            {projects.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
          </select>
        </div>

        {projectId && canUpload && !isPm && (
          <form onSubmit={upload} style={{ background: '#fff', borderRadius: 12, border: '1px solid #f1f5f9', padding: '16px 20px', marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 200px' }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Title</label>
              <input value={title} onChange={e => setTitle(e.target.value)} style={{ padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>File</label>
              <input type="file" onChange={e => setFile(e.target.files?.[0] ?? null)} style={{ fontSize: 13 }} />
            </div>
            <button type="submit" disabled={uploading} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: uploading ? 'wait' : 'pointer', opacity: uploading ? 0.7 : 1 }}>
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </form>
        )}

        {selectedProject && (
          <form onSubmit={submitProjectDelivery} style={{ background: '#fff', borderRadius: 12, border: '1px solid #f1f5f9', padding: '16px 20px', marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div style={{ flex: '1 1 300px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Final Project Delivery</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                {selectedProject.delivery_status === 'pending_admin_review'
                  ? `Waiting for admin review${selectedProject.delivery_file_name ? `: ${selectedProject.delivery_file_name}` : ''}`
                  : selectedProject.delivery_status === 'delivered_to_client'
                    ? `Delivered to client${selectedProject.delivery_file_name ? `: ${selectedProject.delivery_file_name}` : ''}`
                    : canSubmitProjectDelivery
                      ? 'Upload the final project package for admin approval.'
                      : 'Final delivery can be submitted by the assigned PM after the project is completed.'}
              </div>
            </div>
            {canSubmitProjectDelivery && (
              <>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Final project file</label>
                  <input type="file" onChange={e => setDeliveryFile(e.target.files?.[0] ?? null)} style={{ fontSize: 13 }} />
                </div>
                <button type="submit" disabled={submittingDelivery || !deliveryFile} style={{
                  padding: '10px 18px', borderRadius: 8, border: 'none',
                  background: submittingDelivery || !deliveryFile ? '#93c5fd' : '#0d9488',
                  color: '#fff', fontSize: 13, fontWeight: 700,
                  cursor: submittingDelivery || !deliveryFile ? 'not-allowed' : 'pointer',
                }}>
                  {submittingDelivery
                    ? 'Submitting...'
                    : selectedProject.delivery_status === 'pending_admin_review'
                      ? 'Resubmit for Admin Review'
                      : 'Submit for Admin Review'}
                </button>
              </>
            )}
          </form>
        )}

        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
          {!projectId ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Select a project to view its deliverables.</div>
          ) : loading ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
          ) : deliverables.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>No deliverables for this project yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                  {['Title', 'File', 'Size', 'Uploaded By', 'Status', 'Date'].map(h => (
                    <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deliverables.map((d, i) => (
                  <tr key={d.id} style={{ borderBottom: i < deliverables.length - 1 ? '1px solid #f8fafc' : 'none' }}>
                    <td style={{ padding: '13px 14px', fontWeight: 700, color: '#0f172a', fontSize: 13 }}>{d.title}</td>
                    <td style={{ padding: '13px 14px', fontSize: 12, color: '#64748b' }}>{d.file_name ?? '—'}</td>
                    <td style={{ padding: '13px 14px', fontSize: 12, color: '#64748b' }}>{fmtFileSize(d.file_size_bytes)}</td>
                    <td style={{ padding: '13px 14px', fontSize: 12, color: '#64748b' }}>{asRelation(d.uploaded_by)?.name ?? '—'}</td>
                    <td style={{ padding: '13px 14px' }}><Badge label={d.status} sc={DELIVERABLE_SC[d.status]} /></td>
                    <td style={{ padding: '13px 14px', fontSize: 12, color: '#64748b' }}>{fmtDate(d.delivered_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
