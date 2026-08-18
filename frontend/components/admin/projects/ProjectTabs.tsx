'use client';
import { useRouter } from 'next/navigation';

import { DRAFT_HINT } from './shared';

// draftLocked marks the tabs that lead to work a draft project can't have
// yet — the same set the server rejects (see Project::isDraft()). Overview
// stays open because that is where Activate lives, and Activity is a
// read-only log. All of them come back by themselves once the project is
// activated; there is no separate switch.
const TABS: { key: string; label: string; suffix: string; draftLocked?: boolean }[] = [
  { key: 'overview',    label: 'Overview',    suffix: '' },
  { key: 'tasks',       label: 'Tasks',       suffix: '/tasks',        draftLocked: true },
  { key: 'team',        label: 'Team',        suffix: '/team',         draftLocked: true },
  { key: 'timesheets',  label: 'Timesheets',  suffix: '/timesheets',   draftLocked: true },
  { key: 'attachments', label: 'Attachments', suffix: '/attachments',  draftLocked: true },
  { key: 'chat',        label: 'Chat',        suffix: '/chat',         draftLocked: true },
  { key: 'delivery',    label: 'Delivery',    suffix: '/delivery',     draftLocked: true },
  { key: 'activity',    label: 'Activity',    suffix: '/activity' },
];

export default function ProjectTabs({ projectId, active, isDraft = false }: { projectId: number; active: string; isDraft?: boolean }) {
  const router = useRouter();
  return (
    <div style={{ display: 'flex', gap: 2, marginBottom: 20, background: '#f1f5f9', borderRadius: 10, padding: 4, width: 'fit-content' }}>
      {TABS.map(t => {
        const locked = isDraft && !!t.draftLocked;
        return (
          <button
            key={t.key}
            onClick={() => !locked && router.push(`/admin/projects/${projectId}${t.suffix}`)}
            disabled={locked}
            title={locked ? DRAFT_HINT : undefined}
            style={{
              padding: '7px 20px', borderRadius: 8, border: 'none',
              cursor: locked ? 'not-allowed' : 'pointer',
              fontSize: 13, fontWeight: active === t.key ? 600 : 400,
              background: active === t.key ? '#fff' : 'transparent',
              color: locked ? '#cbd5e1' : (active === t.key ? '#1e293b' : '#64748b'),
              boxShadow: active === t.key ? '0 1px 4px rgba(0,0,0,.08)' : 'none',
            }}>{t.label}</button>
        );
      })}
    </div>
  );
}
