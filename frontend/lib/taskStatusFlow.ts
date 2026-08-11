// Mirrors App\Services\TaskStatusService::canTransition — plain-data copy of
// the backend transition matrix, used ONLY to decide which <option>s render
// in a task's status <select>. The backend re-validates every transition
// independently (Api\{Admin,User}\TaskController::update()) — this never
// replaces that, it just keeps the dropdown from offering choices the
// backend would reject anyway.

export const TASK_STATUS_LABELS: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  ready_for_qa: 'Ready for QA',
  in_qa: 'In QA / Testing',
  qa_failed: 'QA Failed / Revision Required',
  qa_passed: 'QA Passed',
  ready_for_production: 'Ready for Production',
  in_production: 'In Production',
  completed: 'Done / Completed',
  review: 'Pending Review',
  cancelled: 'Cancelled',
};

const REQUIRES_COMMENT = new Set(['blocked', 'qa_failed']);

export function taskStatusRequiresComment(status: string): boolean {
  return REQUIRES_COMMENT.has(status);
}

export interface TaskStatusActorContext {
  isAssignee: boolean;
  isPm: boolean;
  isAdmin: boolean;
  // Granted project_management permission keys relevant to task status
  // (canEditTasks, canMarkTaskBlocked, canVerifyDeliverables,
  // canAssignProductionTasks, canCompleteTasks, canReopenTasks,
  // canOverrideTaskStatus) — ignored when isAdmin is true.
  perms: string[];
  // Assignee whose role_type is developer/team_member — mirrors the backend
  // bypass in TaskStatusService::canTransition(): free rein on their OWN
  // task, same as canOverrideTaskStatus.
  isDevOrTeamAssignee?: boolean;
}

// Moving a task to "Ready for QA" requires handing it off to a specific QA
// user (see TaskStatusService::canTransition's requires_qa_assignee) — this
// is the simplest possible picker that doesn't require any new UI component
// (matches the same window.prompt pattern used for the Blocked/QA Failed
// reason). Returns null if the user cancels or there's no QA user to pick.
export function promptForQaUser(qaUsers: { id: number; name: string }[]): number | null {
  if (qaUsers.length === 0) {
    window.alert('No QA user is available in this company yet. Add a QA-role team member first.');
    return null;
  }
  if (qaUsers.length === 1) {
    return window.confirm(`Hand this task off to QA user "${qaUsers[0].name}"?`) ? qaUsers[0].id : null;
  }
  const list = qaUsers.map((u, i) => `${i + 1}. ${u.name}`).join('\n');
  const input = window.prompt(`Select a QA user to hand this task off to (enter the number):\n${list}`);
  if (!input) return null;
  const idx = parseInt(input.trim(), 10) - 1;
  if (Number.isNaN(idx) || idx < 0 || idx >= qaUsers.length) {
    window.alert('Invalid selection — status not changed.');
    return null;
  }
  return qaUsers[idx].id;
}

// Optional Production/Deployment handoff when a task moves to "Ready for
// Production" — unlike promptForQaUser, cancelling or having no candidates
// is a legitimate "don't assign to anyone specific" outcome, not an error;
// the caller just proceeds without production_assigned_to.
export function promptForOptionalProductionUser(candidates: { id: number; name: string }[]): number | null {
  if (candidates.length === 0) return null;
  const list = candidates.map((u, i) => `${i + 1}. ${u.name}`).join('\n');
  const input = window.prompt(`Optionally assign a Production/Deployment user for this task (enter the number, or Cancel to skip):\n${list}`);
  if (!input) return null;
  const idx = parseInt(input.trim(), 10) - 1;
  if (Number.isNaN(idx) || idx < 0 || idx >= candidates.length) return null;
  return candidates[idx].id;
}

export function getAllowedNextTaskStatuses(current: string, ctx: TaskStatusActorContext): string[] {
  const has = (p: string) => ctx.perms.includes(p);
  const allStatuses = Object.keys(TASK_STATUS_LABELS);

  if (ctx.isAdmin || has('canOverrideTaskStatus') || ctx.isDevOrTeamAssignee) {
    return allStatuses.filter((s) => s !== current);
  }

  const allowed: string[] = [];
  const add = (to: string, cond: boolean) => { if (cond) allowed.push(to); };

  if (current === 'todo') {
    add('in_progress', ctx.isAssignee || ctx.isPm || has('canEditTasks'));
  }
  if (current === 'in_progress') {
    add('blocked', ctx.isAssignee || ctx.isPm || has('canMarkTaskBlocked'));
    add('ready_for_qa', ctx.isAssignee || ctx.isPm || has('canEditTasks'));
  }
  if (current === 'blocked') {
    add('in_progress', ctx.isAssignee || ctx.isPm || has('canMarkTaskBlocked'));
  }
  if (current === 'ready_for_qa') {
    add('in_qa', ctx.isPm || has('canVerifyDeliverables'));
  }
  if (current === 'in_qa') {
    add('qa_failed', ctx.isPm || has('canVerifyDeliverables'));
    add('qa_passed', ctx.isPm || has('canVerifyDeliverables'));
  }
  if (current === 'qa_passed') {
    add('ready_for_production', ctx.isPm || has('canVerifyDeliverables'));
  }
  if (current === 'qa_failed') {
    add('in_progress', ctx.isAssignee || ctx.isPm || has('canEditTasks'));
  }
  if (current === 'ready_for_production') {
    add('in_production', ctx.isPm || has('canAssignProductionTasks'));
  }
  if (current === 'in_production') {
    add('completed', ctx.isPm || has('canCompleteTasks'));
  }
  if (current === 'completed' && (ctx.isPm || has('canReopenTasks'))) {
    allStatuses.forEach((s) => { if (s !== 'completed') allowed.push(s); });
  }
  if (current !== 'cancelled') {
    add('cancelled', ctx.isPm);
  }

  return Array.from(new Set(allowed));
}
