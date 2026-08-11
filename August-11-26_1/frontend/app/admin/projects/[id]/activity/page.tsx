'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import toast from 'react-hot-toast';
import { useModuleGuard } from '@/hooks/useModuleGuard';
import { adminProjectService, ActivityItem } from '@/lib/services/adminProjectService';
import ProjectTabs from '@/components/admin/projects/ProjectTabs';
import { inp, card } from '@/components/admin/projects/shared';

const ACTION_LABEL: Record<string, string> = {
  created: 'created', updated: 'updated', deleted: 'deleted', team_assigned: 'updated the team',
  deliverable_submitted: 'submitted a deliverable', deliverable_approved: 'approved a deliverable',
  revision_requested: 'requested a revision',
  production_queued: 'was queued for production', production_in_progress: 'started production',
  production_blocked: 'was blocked in production', production_submitted: 'was submitted for review',
  production_revision_requested: 'had a revision requested', production_approved: 'was approved',
  production_delivered: 'was delivered', production_completed: 'was completed',
  production_rejected: 'was rejected', production_cancelled: 'was cancelled',
};

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function ProjectActivityPage() {
  useModuleGuard('projects');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = Number(id);

  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [posting, setPosting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await adminProjectService.activity(projectId));
    } catch { toast.error('Failed to load activity'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const postComment = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!comment.trim()) return;
    setPosting(true);
    try {
      await adminProjectService.comments.add(projectId, comment.trim());
      setComment('');
      load();
    } catch { toast.error('Failed to post comment'); }
    finally { setPosting(false); }
  };

  return (
    <DashboardLayout title="Project Activity">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={() => router.push(`/admin/projects/${id}`)} style={{
          background: '#f1f5f9', border: 'none', borderRadius: 8,
          padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: '#64748b',
        }}>← Back</button>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', margin: 0 }}>Activity</h2>
      </div>

      <ProjectTabs projectId={projectId} active="activity" />

      <form onSubmit={postComment} style={{ ...card, display: 'flex', gap: 10 }}>
        <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Add a note or update…" style={inp} />
        <button type="submit" disabled={posting} style={{
          padding: '9px 20px', background: posting ? '#93c5fd' : '#2563eb', color: '#fff',
          border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: posting ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
        }}>{posting ? 'Posting…' : 'Post'}</button>
      </form>

      <div style={card}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>No activity yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {items.map((it, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, paddingBottom: 10, borderBottom: '1px solid #f8fafc' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: it.type === 'comment' ? '#2563eb' : '#94a3b8', marginTop: 5, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  {it.type === 'comment' ? (
                    <>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{it.author}</span>
                      <span style={{ fontSize: 13, color: '#475569' }}> — {it.body}</span>
                    </>
                  ) : (
                    <span style={{ fontSize: 13, color: '#475569' }}>
                      {it.entity_type === 'Task' ? 'A task was ' : 'Project was '}
                      {ACTION_LABEL[it.action ?? ''] ?? it.action}
                    </span>
                  )}
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{fmtDateTime(it.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
