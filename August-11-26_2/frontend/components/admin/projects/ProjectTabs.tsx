'use client';
import { useRouter } from 'next/navigation';

const TABS: { key: string; label: string; suffix: string }[] = [
  { key: 'overview',    label: 'Overview',    suffix: '' },
  { key: 'tasks',       label: 'Tasks',       suffix: '/tasks' },
  { key: 'team',        label: 'Team',        suffix: '/team' },
  { key: 'timesheets',  label: 'Timesheets',  suffix: '/timesheets' },
  { key: 'attachments', label: 'Attachments', suffix: '/attachments' },
  { key: 'chat',        label: 'Chat',        suffix: '/chat' },
  { key: 'activity',    label: 'Activity',    suffix: '/activity' },
];

export default function ProjectTabs({ projectId, active }: { projectId: number; active: string }) {
  const router = useRouter();
  return (
    <div style={{ display: 'flex', gap: 2, marginBottom: 20, background: '#f1f5f9', borderRadius: 10, padding: 4, width: 'fit-content' }}>
      {TABS.map(t => (
        <button key={t.key} onClick={() => router.push(`/admin/projects/${projectId}${t.suffix}`)} style={{
          padding: '7px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
          fontSize: 13, fontWeight: active === t.key ? 600 : 400,
          background: active === t.key ? '#fff' : 'transparent',
          color: active === t.key ? '#1e293b' : '#64748b',
          boxShadow: active === t.key ? '0 1px 4px rgba(0,0,0,.08)' : 'none',
        }}>{t.label}</button>
      ))}
    </div>
  );
}
