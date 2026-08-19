'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import toast from 'react-hot-toast';
import { useModuleGuard } from '@/hooks/useModuleGuard';
import { adminProjectService, DeliverySubmission, Project } from '@/lib/services/adminProjectService';
import ProjectTabs from '@/components/admin/projects/ProjectTabs';
import { card, fmtFileSize, DraftNotice } from '@/components/admin/projects/shared';

function fmtDateTime(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ProjectDeliveryPage() {
  useModuleGuard('projects');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = Number(id);

  const [project, setProject] = useState<Project | null>(null);
  const [history, setHistory] = useState<DeliverySubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deliveryEmail, setDeliveryEmail] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const p = await adminProjectService.getOne(projectId);
      setProject(p);
      // Guest (no client) project — prefill with whatever email it was
      // originally paid/invoiced with, still editable by the admin.
      if (!p.client_id) setDeliveryEmail(p.invoice?.customer_email ?? '');
    }
    catch { toast.error('Failed to load project'); }
    finally { setLoading(false); }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try { setHistory(await adminProjectService.deliveryHistory(projectId)); }
    catch { toast.error('Failed to load delivery history'); }
    finally { setHistoryLoading(false); }
  };

  useEffect(() => { load(); loadHistory(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isDraft = project?.status === 'draft' || project?.status === 'unpaid';
  // 'approved_locked' (Project Approval Lock) still needs to be deliverable
  // by Admin — locking only freezes PM edits, not Admin's own delivery flow.
  const canDeliver = project?.status === 'completed' || project?.status === 'approved_locked';
  // Two-step review: a PM submission sits in 'pending_admin_review' until
  // Admin approves it (no client contact yet), then 'approved' until Admin
  // explicitly sends it on — see deliverToClient() on the backend.
  const pendingReview = project?.delivery_status === 'pending_admin_review';
  const readyToSend = project?.delivery_status === 'approved';

  const needsGuestEmail = !project?.client_id;
  // The email field is only relevant once there's an actual send-to-client
  // action available — not while still sitting in pending_admin_review.
  const showEmailField = needsGuestEmail && !pendingReview;

  const uploadAndDeliver = async () => {
    if (!file) { toast.error('Please choose the final project file'); return; }
    if (needsGuestEmail && !deliveryEmail.trim()) { toast.error("Please enter the client's email address"); return; }
    setSubmitting(true);
    try {
      const updated = await adminProjectService.uploadAndDeliver(projectId, file, needsGuestEmail ? deliveryEmail.trim() : undefined);
      setProject(updated);
      setFile(null);
      toast.success('Project delivered to client');
      loadHistory();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to deliver project');
    } finally { setSubmitting(false); }
  };

  // Step 1 — internal sign-off only. The client hears nothing yet.
  const approveDelivery = async () => {
    setSubmitting(true);
    try {
      const updated = await adminProjectService.approveDelivery(projectId);
      setProject(updated);
      toast.success('Delivery approved — ready to send to the client');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to approve delivery');
    } finally { setSubmitting(false); }
  };

  // Step 2 — actually sends the already-approved package to the client.
  const deliverToClient = async () => {
    if (needsGuestEmail && !deliveryEmail.trim()) { toast.error("Please enter the client's email address"); return; }
    setSubmitting(true);
    try {
      const updated = await adminProjectService.deliverToClient(projectId, needsGuestEmail ? deliveryEmail.trim() : undefined);
      setProject(updated);
      toast.success('Project delivered to client');
      loadHistory();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to deliver project');
    } finally { setSubmitting(false); }
  };

  const downloadCurrent = async () => {
    if (!project?.delivery_file_name) return;
    try { await adminProjectService.downloadDelivery(projectId, project.delivery_file_name); }
    catch { toast.error('Download failed'); }
  };

  const downloadHistoryItem = async (d: DeliverySubmission) => {
    try { await adminProjectService.downloadDeliverySubmission(projectId, d.id, d.file_name); }
    catch { toast.error('Download failed'); }
  };

  if (loading || !project) {
    return (
      <DashboardLayout title="Project Delivery">
        <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Project Delivery">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={() => router.push(`/admin/projects/${id}`)} style={{
          background: '#f1f5f9', border: 'none', borderRadius: 8,
          padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: '#64748b',
        }}>← Back</button>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Delivery</h2>
      </div>

      <ProjectTabs projectId={projectId} active="delivery" isDraft={isDraft} />

      {isDraft && <DraftNotice status={project.status} style={{ marginBottom: 16 }} />}

      {!isDraft && !canDeliver && (
        <div style={{ ...card, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', fontSize: 13 }}>
          Mark this project as Completed before delivering the final package to the client.
        </div>
      )}

      {canDeliver && (
        <div style={{ ...card, marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '0 0 4px' }}>Deliver Final Package</h3>
          <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 16px' }}>
            You can deliver more than once — e.g. to send a corrected package after the client reports an issue. Every delivery is kept below.
          </p>

          {pendingReview && (
            <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 8, background: '#f5f3ff', border: '1px solid #ddd6fe' }}>
              <div style={{ fontSize: 13, color: '#5b21b6', fontWeight: 600, marginBottom: 8 }}>
                A Project Manager submitted &quot;{project.delivery_file_name}&quot; for your review.
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                {/* Admin needs to actually see the file before deciding
                    whether to approve it — downloadDelivery() on the backend
                    has never required a specific delivery_status, only that
                    the file exists, so this was just a missing button here. */}
                <button onClick={downloadCurrent} style={{
                  padding: '8px 16px', borderRadius: 7, border: '1px solid #ddd6fe', background: '#fff',
                  color: '#5b21b6', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}>Download</button>
                <button onClick={approveDelivery} disabled={submitting} style={{
                  padding: '8px 16px', borderRadius: 7, border: 'none', background: submitting ? '#c4b5fd' : '#7c3aed',
                  color: '#fff', fontSize: 13, fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer',
                }}>{submitting ? 'Approving…' : 'Approve'}</button>
              </div>
            </div>
          )}

          {readyToSend && (
            <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 8, background: '#f0fdfa', border: '1px solid #99f6e4' }}>
              <div style={{ fontSize: 13, color: '#0f766e', fontWeight: 600, marginBottom: 8 }}>
                Approved — &quot;{project.delivery_file_name}&quot; is ready to send to the client.
              </div>
              {showEmailField && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                    Client email address
                  </label>
                  <input
                    type="email"
                    value={deliveryEmail}
                    onChange={e => setDeliveryEmail(e.target.value)}
                    placeholder="client@example.com"
                    style={{ width: '100%', maxWidth: 360, padding: '8px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 13 }}
                  />
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                    This project has no linked client, so there&apos;s no portal to deliver into — the delivery link will be emailed to this address instead.
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={downloadCurrent} style={{
                  padding: '8px 16px', borderRadius: 7, border: '1px solid #99f6e4', background: '#fff',
                  color: '#0f766e', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}>Download</button>
                <button onClick={deliverToClient} disabled={submitting || (needsGuestEmail && !deliveryEmail.trim())} style={{
                  padding: '8px 16px', borderRadius: 7, border: 'none', background: (submitting || (needsGuestEmail && !deliveryEmail.trim())) ? '#99f6e4' : '#0d9488',
                  color: '#fff', fontSize: 13, fontWeight: 600, cursor: (submitting || (needsGuestEmail && !deliveryEmail.trim())) ? 'not-allowed' : 'pointer',
                }}>{submitting ? 'Sending…' : 'Send to Client'}</button>
              </div>
            </div>
          )}

          {showEmailField && !readyToSend && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                Client email address
              </label>
              <input
                type="email"
                value={deliveryEmail}
                onChange={e => setDeliveryEmail(e.target.value)}
                placeholder="client@example.com"
                style={{ width: '100%', maxWidth: 360, padding: '8px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 13 }}
              />
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                This project has no linked client, so there&apos;s no portal to deliver into — the delivery link will be emailed to this address instead.
              </div>
            </div>
          )}

          {/* Hidden while a PM submission is still working through
              approve/send — Admin should finish that one instead of
              silently overwriting it with a fresh direct upload. */}
          {!pendingReview && !readyToSend && (
            <>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="file"
                  onChange={e => setFile(e.target.files?.[0] ?? null)}
                  accept=".zip,.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                  style={{ fontSize: 13 }}
                />
                <button onClick={uploadAndDeliver} disabled={submitting || !file || (needsGuestEmail && !deliveryEmail.trim())} style={{
                  padding: '8px 18px', borderRadius: 7, border: 'none',
                  background: (submitting || !file || (needsGuestEmail && !deliveryEmail.trim())) ? '#99f6e4' : '#0d9488', color: '#fff',
                  fontSize: 13, fontWeight: 600, cursor: (submitting || !file || (needsGuestEmail && !deliveryEmail.trim())) ? 'not-allowed' : 'pointer',
                }}>{submitting ? 'Delivering…' : 'Upload & Deliver'}</button>
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>Allowed: zip, pdf, doc, docx, xls, xlsx, png, jpg, jpeg. Max 50MB. Delivers immediately — no review step.</div>
            </>
          )}

          {project.delivery_status === 'delivered_to_client' && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 13, color: '#0f172a' }}>
                Currently delivered: <strong>{project.delivery_file_name}</strong>
              </div>
              <button onClick={downloadCurrent} style={{
                padding: '6px 14px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff',
                color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}>Download</button>
            </div>
          )}
        </div>
      )}

      <div style={card}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '0 0 4px' }}>Delivery History</h3>
        <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 14px' }}>Every time this project&apos;s final package was delivered, most recent first.</p>
        {historyLoading ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Loading…</div>
        ) : history.length === 0 ? (
          <div style={{ fontSize: 13, color: '#94a3b8' }}>No deliveries yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.map(d => (
              <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f8fafc' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{d.file_name}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    {fmtFileSize(d.file_size ?? undefined)} · {d.delivered_by ?? '—'} · {fmtDateTime(d.delivered_at)}
                  </div>
                </div>
                <button onClick={() => downloadHistoryItem(d)} style={{
                  padding: '4px 12px', fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                  background: '#2563eb', color: '#fff', border: 'none', flexShrink: 0,
                }}>Download</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
