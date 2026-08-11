import { useState } from 'react';
import toast from 'react-hot-toast';
import { Project, ProjectStatus, CompletionStatus } from '@/lib/services/adminProjectService';
import { inp, lbl } from './shared';

interface LifecycleService {
  completionStatus: (id: number) => Promise<CompletionStatus>;
  complete: (id: number) => Promise<Project>;
  close: (id: number, payload?: { force?: boolean; reason?: string; confirm_unpaid_invoice?: boolean }) => Promise<Project>;
  reopen: (id: number, reason: string) => Promise<Project>;
}

interface Props {
  projectId: number;
  status: ProjectStatus;
  service: LifecycleService;
  // Company Admin is structurally unrestricted; a sub-user needs the
  // matching permission for each action (see ModuleCatalog's
  // canCompleteProjects/canCloseProjects/canReopenProjects/canForceCloseProjects).
  canComplete: boolean;
  canClose: boolean;
  canReopen: boolean;
  canForceClose: boolean;
  onUpdated: (project: Project) => void;
}

const btn = (bg: string, color: string): React.CSSProperties => ({
  padding: '9px 18px', borderRadius: 8, border: 'none', background: bg, color,
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
});

const secondaryBtn: React.CSSProperties = {
  padding: '9px 18px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: '#fff',
  color: '#64748b', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
};

const modalCard: React.CSSProperties = {
  background: '#fff', borderRadius: 14, padding: 24, width: '100%', maxWidth: 520,
  maxHeight: '85vh', overflowY: 'auto',
};

function BlockerGroup({ title, items, render }: { title: string; items: { id: number | null; title?: string; task_title?: string; deliverable_title?: string; status: string; overdue?: boolean }[]; render?: (i: any) => string }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#b91c1c', marginBottom: 6 }}>{title} ({items.length})</div>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {items.map((it, i) => (
          <li key={it.id ?? i} style={{ fontSize: 12, color: '#7f1d1d', marginBottom: 3 }}>
            {render ? render(it) : (it.title || it.task_title || it.deliverable_title || 'Untitled')} — {it.status.replace(/_/g, ' ')}
            {it.overdue && <span style={{ marginLeft: 6, fontWeight: 700 }}>(overdue)</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ProjectLifecycleActions({ projectId, status, service, canComplete, canClose, canReopen, canForceClose, onUpdated }: Props) {
  const [mode, setMode] = useState<'complete' | 'close' | 'reopen' | null>(null);
  const [loadingCheck, setLoadingCheck] = useState(false);
  const [checklist, setChecklist] = useState<CompletionStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [closeForce, setCloseForce] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [confirmUnpaid, setConfirmUnpaid] = useState(false);
  const [unpaidWarning, setUnpaidWarning] = useState(false);
  const [reopenReason, setReopenReason] = useState('');

  const isTerminal = status === 'completed' || status === 'closed';

  const openComplete = async () => {
    setMode('complete');
    setLoadingCheck(true);
    setChecklist(null);
    try {
      setChecklist(await service.completionStatus(projectId));
    } catch {
      toast.error('Failed to load completion checklist');
    } finally { setLoadingCheck(false); }
  };

  const openClose = async () => {
    setMode('close');
    setCloseForce(false);
    setCloseReason('');
    setConfirmUnpaid(false);
    setUnpaidWarning(false);
    try {
      const cs = await service.completionStatus(projectId);
      setUnpaidWarning(cs.has_unpaid_invoice);
    } catch { /* non-fatal — warning just won't pre-show */ }
  };

  const openReopen = () => {
    setMode('reopen');
    setReopenReason('');
  };

  const close = () => { setMode(null); setChecklist(null); };

  const submitComplete = async () => {
    setSubmitting(true);
    try {
      const updated = await service.complete(projectId);
      toast.success('Project marked as completed');
      onUpdated(updated);
      close();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to complete project');
    } finally { setSubmitting(false); }
  };

  const submitClose = async () => {
    if (closeForce && !closeReason.trim()) { toast.error('A reason is required to force-close.'); return; }
    setSubmitting(true);
    try {
      const updated = await service.close(projectId, {
        force: closeForce || undefined,
        reason: closeReason.trim() || undefined,
        confirm_unpaid_invoice: confirmUnpaid || undefined,
      });
      toast.success('Project closed');
      onUpdated(updated);
      close();
    } catch (err: any) {
      const data = err?.response?.data;
      if (data?.errors?.warning === 'unpaid_invoice') {
        setUnpaidWarning(true);
        toast.error('This project has an unpaid invoice — confirm below to close anyway.');
      } else {
        toast.error(data?.message || 'Failed to close project');
      }
    } finally { setSubmitting(false); }
  };

  const submitReopen = async () => {
    if (!reopenReason.trim()) { toast.error('A reason is required to reopen this project.'); return; }
    setSubmitting(true);
    try {
      const updated = await service.reopen(projectId, reopenReason.trim());
      toast.success('Project reopened');
      onUpdated(updated);
      close();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to reopen project');
    } finally { setSubmitting(false); }
  };

  const b = checklist?.blockers;
  const totalBlockers = b ? b.pending_tasks.length + b.pending_production.length + b.pending_deliverables.length + b.pending_revisions.length : 0;

  return (
    <>
      {!isTerminal && canComplete && (
        <button onClick={openComplete} style={btn('#059669', '#fff')}>Mark as Complete</button>
      )}
      {status === 'completed' && canClose && (
        <button onClick={openClose} style={btn('#475569', '#fff')}>Close Project</button>
      )}
      {status !== 'completed' && status !== 'closed' && canForceClose && (
        <button onClick={openClose} style={secondaryBtn}>Force Close</button>
      )}
      {isTerminal && canReopen && (
        <button onClick={openReopen} style={btn('#2563eb', '#fff')}>Reopen Project</button>
      )}

      {mode === 'complete' && (
        <div style={overlay} onClick={close}>
          <div style={modalCard} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 14px' }}>Mark Project as Complete</h3>
            {loadingCheck ? (
              <div style={{ fontSize: 13, color: '#94a3b8', padding: '20px 0' }}>Checking readiness…</div>
            ) : checklist?.ready ? (
              <div style={{ fontSize: 13, color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
                All checks passed — this project is ready to be marked complete.
              </div>
            ) : checklist ? (
              <div style={{ fontSize: 13, color: '#7f1d1d', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>This project isn&apos;t ready yet — {totalBlockers} item(s) outstanding:</div>
                <BlockerGroup title="Incomplete tasks" items={b!.pending_tasks} />
                <BlockerGroup title="Production tasks not approved" items={b!.pending_production} render={i => i.task_title || 'Task'} />
                <BlockerGroup title="Deliverables pending review" items={b!.pending_deliverables} />
                <BlockerGroup title="Open revision requests" items={b!.pending_revisions} render={i => i.deliverable_title || 'Deliverable'} />
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={close} style={secondaryBtn}>Cancel</button>
              <button onClick={submitComplete} disabled={!checklist?.ready || submitting} style={{
                ...btn('#059669', '#fff'),
                opacity: (!checklist?.ready || submitting) ? 0.5 : 1,
                cursor: (!checklist?.ready || submitting) ? 'not-allowed' : 'pointer',
              }}>{submitting ? 'Completing…' : 'Confirm Complete'}</button>
            </div>
          </div>
        </div>
      )}

      {mode === 'close' && (
        <div style={overlay} onClick={close}>
          <div style={modalCard} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 14px' }}>Close Project</h3>
            {status !== 'completed' && (
              <div style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
                This project is not yet Completed. {canForceClose ? 'You can force-close it below with a reason.' : 'It must be marked Completed before it can be closed.'}
              </div>
            )}
            {status !== 'completed' && canForceClose && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 13, color: '#334155', cursor: 'pointer' }}>
                <input type="checkbox" checked={closeForce} onChange={e => setCloseForce(e.target.checked)} />
                Force close anyway
              </label>
            )}
            {unpaidWarning && (
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12, fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', cursor: 'pointer' }}>
                <input type="checkbox" checked={confirmUnpaid} onChange={e => setConfirmUnpaid(e.target.checked)} style={{ marginTop: 2 }} />
                <span>This project has an unpaid invoice. Confirm you want to close it anyway.</span>
              </label>
            )}
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Reason {closeForce && <span style={{ color: '#dc2626' }}>*</span>}</label>
              <textarea value={closeReason} onChange={e => setCloseReason(e.target.value)} rows={3} style={{ ...inp, resize: 'vertical' }} placeholder="Optional notes about closing this project" />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={close} style={secondaryBtn}>Cancel</button>
              <button onClick={submitClose} disabled={submitting || (status !== 'completed' && !closeForce)} style={{
                ...btn('#475569', '#fff'),
                opacity: (submitting || (status !== 'completed' && !closeForce)) ? 0.5 : 1,
                cursor: (submitting || (status !== 'completed' && !closeForce)) ? 'not-allowed' : 'pointer',
              }}>{submitting ? 'Closing…' : 'Confirm Close'}</button>
            </div>
          </div>
        </div>
      )}

      {mode === 'reopen' && (
        <div style={overlay} onClick={close}>
          <div style={modalCard} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 14px' }}>Reopen Project</h3>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 14px' }}>This resets the project back to Active. A reason is required.</p>
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Reason <span style={{ color: '#dc2626' }}>*</span></label>
              <textarea value={reopenReason} onChange={e => setReopenReason(e.target.value)} rows={3} style={{ ...inp, resize: 'vertical' }} placeholder="Why is this project being reopened?" />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={close} style={secondaryBtn}>Cancel</button>
              <button onClick={submitReopen} disabled={submitting || !reopenReason.trim()} style={{
                ...btn('#2563eb', '#fff'),
                opacity: (submitting || !reopenReason.trim()) ? 0.5 : 1,
                cursor: (submitting || !reopenReason.trim()) ? 'not-allowed' : 'pointer',
              }}>{submitting ? 'Reopening…' : 'Confirm Reopen'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
