// Mirrors App\Services\TaskStatusService::canChangeTaskStatus — Jira-style
// free jump: an allowed actor may set a task directly to ANY other status,
// no forced order, no per-hop permission, no required comment. The backend
// re-validates independently (Api\{Admin,User}\TaskController::update()) —
// this never replaces that, it just keeps the dropdown from offering
// choices the backend would reject anyway.

export const TASK_STATUS_LABELS: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  ready_for_production: 'Ready for Production',
  in_production: 'In Production',
  completed: 'Done / Completed',
  review: 'Pending Review',
  cancelled: 'Cancelled',
};

export interface TaskStatusActorContext {
  isAssignee: boolean;
  isPm: boolean;
  isAdmin: boolean;
  // role_type === 'qa' — QA may freely change any task's status, not just
  // their own.
  isQa?: boolean;
  // Manual escape hatch — a Company Admin grant of free status-change
  // rights to a specific non-PM/QA user.
  canOverrideTaskStatus?: boolean;
}

export function canChangeTaskStatus(ctx: TaskStatusActorContext): boolean {
  return ctx.isAdmin || ctx.isPm || !!ctx.isQa || !!ctx.canOverrideTaskStatus || ctx.isAssignee;
}

export function getAllowedNextTaskStatuses(current: string, ctx: TaskStatusActorContext): string[] {
  if (!canChangeTaskStatus(ctx)) return [];
  return Object.keys(TASK_STATUS_LABELS).filter((s) => s !== current);
}

// Optional Production/Deployment handoff when a task moves to "Ready for
// Production" — cancelling or having no candidates is a legitimate "don't
// assign to anyone specific" outcome, not an error; the caller just proceeds
// without production_assigned_to.
export function promptForOptionalProductionUser(candidates: { id: number; name: string }[]): number | null {
  if (candidates.length === 0) return null;
  const list = candidates.map((u, i) => `${i + 1}. ${u.name}`).join('\n');
  const input = window.prompt(`Optionally assign a Production/Deployment user for this task (enter the number, or Cancel to skip):\n${list}`);
  if (!input) return null;
  const idx = parseInt(input.trim(), 10) - 1;
  if (Number.isNaN(idx) || idx < 0 || idx >= candidates.length) return null;
  return candidates[idx].id;
}
