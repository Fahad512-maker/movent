import React from 'react';

export const inp: React.CSSProperties = {
  padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8,
  fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', background: '#fff',
};
export const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 };

// Shown on every control a draft project disables — tasks, timesheets,
// files, comments and chat. Matches Project::DRAFT_BLOCKED_MESSAGE, which is
// what the server answers if one of those is called anyway.
export const DRAFT_HINT = 'This project is still a draft. Activate it first — tasks, timesheets, files, comments and chat all open up once it is active.';

// The banner that explains a disabled page, rather than leaving the user to
// guess why everything is greyed out.
export function DraftNotice({ style }: { style?: React.CSSProperties }) {
  return (
    <div style={{
      padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a',
      borderRadius: 8, fontSize: 12.5, color: '#92400e', ...style,
    }}>
      📝 <strong>Draft project.</strong> {DRAFT_HINT}
    </div>
  );
}
export const card: React.CSSProperties = { background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '24px 28px', marginBottom: 20 };

export const STATUS_SC: Record<string, { bg: string; color: string }> = {
  // Auto-created by a client's invoice payment, name-only until activated —
  // deliberately grey so it never reads as live work in a list.
  draft:     { bg: '#f8fafc', color: '#64748b' },
  planning:  { bg: '#eff6ff', color: '#2563eb' },
  active:    { bg: '#ecfdf5', color: '#059669' },
  on_hold:   { bg: '#fffbeb', color: '#d97706' },
  blocked:   { bg: '#fef2f2', color: '#dc2626' },
  completed: { bg: '#f0fdf4', color: '#16a34a' },
  cancelled: { bg: '#fef2f2', color: '#dc2626' },
  closed:    { bg: '#f1f5f9', color: '#475569' },
};

export const PRIORITY_SC: Record<string, { bg: string; color: string }> = {
  low:    { bg: '#f1f5f9', color: '#64748b' },
  medium: { bg: '#fff7ed', color: '#d97706' },
  high:   { bg: '#fef2f2', color: '#dc2626' },
  urgent: { bg: '#7f1d1d', color: '#fca5a5' },
};

// Task status-workflow — see App\Services\TaskStatusService. Colors reuse
// the same palette as the analogous DELIVERABLE_SC states below
// (blocked/failed = red, in-progress-like = blue, production = teal/indigo,
// done = green) rather than inventing new ones.
export const TASK_SC: Record<string, { bg: string; color: string }> = {
  todo:                  { bg: '#f1f5f9', color: '#64748b' },
  in_progress:           { bg: '#eff6ff', color: '#2563eb' },
  blocked:               { bg: '#fef2f2', color: '#dc2626' },
  ready_for_production:  { bg: '#eef2ff', color: '#4f46e5' },
  in_production:         { bg: '#f0fdf9', color: '#0d9488' },
  review:      { bg: '#fffbeb', color: '#d97706' },
  completed:   { bg: '#f0fdf4', color: '#16a34a' },
  cancelled:   { bg: '#fef2f2', color: '#dc2626' },
};

export const TIMESHEET_SC: Record<string, { bg: string; color: string }> = {
  pending:  { bg: '#fff7ed', color: '#d97706' },
  approved: { bg: '#ecfdf5', color: '#059669' },
  rejected: { bg: '#fef2f2', color: '#dc2626' },
};

// Deliverable states — mirrors deliverables.status, shared with the client
// portal's status colors (frontend/app/client/projects/[id]/page.tsx).
export const DELIVERABLE_SC: Record<string, { bg: string; color: string }> = {
  draft:              { bg: '#f1f5f9', color: '#64748b' },
  submitted:          { bg: '#fffbeb', color: '#d97706' },
  delivered:          { bg: '#eff6ff', color: '#2563eb' },
  approved:           { bg: '#ecfdf5', color: '#059669' },
  revision_requested: { bg: '#fff7ed', color: '#ea580c' },
  rejected:           { bg: '#fef2f2', color: '#dc2626' },
};

// Project attachments — mirrors ProjectAttachmentController's mimes/size rules.
export const ALLOWED_ATTACHMENT_TYPES = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg', 'zip'];
export const MAX_ATTACHMENT_MB = 10;

export function fmtFileSize(bytes?: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const TEAM_ROLE_LABEL: Record<string, string> = {
  project_manager: 'Project Manager',
  production_user: 'Production User',
  team_member:     'Team Member',
  reviewer:        'Reviewer',
};

export function Badge({ label, sc }: { label: string; sc?: { bg: string; color: string } }) {
  const s = sc ?? { bg: '#f1f5f9', color: '#64748b' };
  const text = label.replace(/_/g, ' ').replace(/\bqa\b/gi, 'QA');
  return (
    <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: s.bg, color: s.color, fontWeight: 500, textTransform: 'capitalize' }}>
      {text}
    </span>
  );
}

// Plain emoji (👍) ignores CSS color entirely (it's a fixed-color glyph in
// every browser), so a like toggle needs a real vector icon instead to
// actually go blue when liked / white when not.
export function ThumbIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 2}>
      <path d="M7 22h-2a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h2v11zm4 0a1 1 0 0 1-1-1v-9.5l4-8.5 1.5 1a2 2 0 0 1 .5 2l-1.5 5.5h5a2 2 0 0 1 2 2l-2 7a2 2 0 0 1-2 2h-6.5z" />
    </svg>
  );
}

export function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '18px 20px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 5 }}>{sub}</div>}
    </div>
  );
}

export function fmtDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB');
}

// Eloquent serializes relations (assignedTo, assignedBy, uploadedBy,
// requestedBy, createdBy, approvedBy…) to their snake_case column name —
// which, when a same-named raw FK column exists, means the field is a
// scalar id until eager-loaded and an object afterwards. This narrows that
// union down to the object, for display code that just wants `?.name`.
export function asRelation<T extends object>(v: T | number | null | undefined): T | null {
  return v && typeof v === 'object' ? v : null;
}
