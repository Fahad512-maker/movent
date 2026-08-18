// Simplified Project Management permissions shown to Company Admin on the
// Add/Edit User pages, instead of the 52 granular `project_management`
// permission keys from MODULE_CATALOG. Each simple permission expands into a
// fixed set of real granular keys before being sent to the backend (which
// keeps checking those exact granular keys — nothing on the backend changes).
//
// expandProjectPermissions(): simple keys -> full granular key list (call
//   before saving, so the stored permissions are the real granular keys).
// collapseProjectPermissions(): granular key list -> which simple checkboxes
//   should show as checked (a simple permission is "on" only when EVERY one
//   of its mapped granular keys is present — partial/custom grants that
//   don't fill a whole bundle just won't show any of these boxes checked).

export interface SimpleProjectPermission {
  key: string;
  label: string;
  advanced?: boolean;
  maps: string[];
}

export const SIMPLE_PROJECT_PERMISSIONS: SimpleProjectPermission[] = [
  {
    key: 'pm_view', label: 'View Project Management',
    maps: ['canViewProjectDashboard', 'canViewProjects', 'canViewLinkedProjects'],
  },
  {
    key: 'pm_manage_projects', label: 'Manage Projects',
    maps: ['canCreateProjects', 'canCreateProjectHandoff', 'canManageProjectInvoices', 'canEditProjects', 'canCompleteProjects', 'canCloseProjects', 'canReopenProjects'],
  },
  {
    key: 'pm_manage_tasks', label: 'Manage Tasks',
    maps: ['canViewTasks', 'canCreateTasks', 'canCreateLinkedProjectTask', 'canEditTasks', 'canAssignTasks'],
  },
  {
    key: 'pm_manage_team', label: 'Manage Team / Resources',
    maps: ['canViewTeamResources', 'canAssignTeamResources', 'canRequestPMAssignment'],
  },
  {
    key: 'pm_manage_deliverables', label: 'Manage Deliverables / QA',
    maps: ['canViewDeliverables', 'canUploadDeliverables', 'canApproveDeliverables', 'canCreateRevisions', 'canResolveRevisions'],
  },
  {
    key: 'pm_manage_timesheets', label: 'Manage Timesheets',
    maps: ['canViewTimesheets', 'canApproveTimesheets'],
  },
  {
    key: 'pm_view_reports', label: 'View Project Reports',
    maps: ['canViewProjectReports', 'canViewTaskReports'],
  },
  {
    key: 'pm_manage_files', label: 'Manage Project Files',
    maps: ['canUploadProjectAttachments', 'canViewProjectAttachments', 'canDownloadProjectAttachments', 'canUploadTaskAttachments', 'canViewTaskAttachments', 'canDownloadTaskAttachments'],
  },
  {
    key: 'pm_manage_comments', label: 'Add Client-facing Project Comments',
    maps: ['canAddClientFacingComment'],
  },
  {
    key: 'pm_manage_chat', label: 'Manage Project Chat',
    maps: ['canViewProjectChat', 'canSendProjectChatMessage', 'canUploadProjectChatAttachment', 'canViewProjectChatAttachments'],
  },

  // ── Advanced (collapsed by default) ──────────────────────────────────────
  {
    key: 'pm_adv_view_all', label: 'View All Company Projects', advanced: true,
    maps: ['canViewAllCompanyProjects'],
  },
  {
    key: 'pm_adv_force_close', label: 'Force Close Project', advanced: true,
    maps: ['canForceCloseProjects'],
  },
  {
    // Company Admin always has this implicitly (admin guard bypasses every
    // permission check) — this only ever gates a PM-tier sub-user, and is
    // NOT part of Project Manager's default bundle (see roleUtils.ts).
    key: 'pm_adv_assign_seller', label: 'Assign/Switch Project Seller', advanced: true,
    maps: ['canAssignProjectSeller'],
  },
  {
    // Draft projects are the name-only stubs auto-created when a client's
    // payment starts one (see App\Services\PaymentProjectStartService).
    // Granting this both reveals them in the projects list and allows
    // activating them. Company Admin always has it implicitly; NOT part of
    // Project Manager's default bundle (see roleUtils.ts).
    key: 'pm_adv_activate_project', label: 'Activate Draft Project', advanced: true,
    maps: ['canActivateProjects'],
  },
  {
    key: 'pm_adv_delete_project_files', label: 'Delete Project Attachments', advanced: true,
    maps: ['canDeleteProjectAttachments'],
  },
  {
    key: 'pm_adv_delete_task_files', label: 'Delete Task Attachments', advanced: true,
    maps: ['canDeleteTaskAttachments'],
  },
  {
    key: 'pm_adv_add_seller_chat', label: 'Add Seller To Project Chat', advanced: true,
    maps: ['canAddSellerToProjectChat'],
  },
  {
    // Delegated participant management for the project's one chat. It stays
    // outside pm_manage_chat because adding/removing people is a higher-risk
    // action, and adding the linked Seller still needs the separate Seller
    // chat permission below.
    key: 'pm_adv_manage_chat_participants', label: 'Manage Project Chat Participants', advanced: true,
    maps: ['canManageProjectChatParticipants'],
  },
  {
    // Bypasses the "invoice must be paid" handoff safeguard — a materially
    // different risk tier from canManageProjectInvoices, so it's isolated
    // here rather than bundled with routine invoice viewing/linking.
    key: 'pm_adv_override_unpaid_handoff', label: 'Override Project Creation Before Payment', advanced: true,
    maps: ['canOverrideProjectCreationBeforePayment'],
  },
];

export const expandProjectPermissions = (simpleKeys: string[]): string[] => {
  const out = new Set<string>();
  for (const simple of SIMPLE_PROJECT_PERMISSIONS) {
    if (simpleKeys.includes(simple.key)) simple.maps.forEach(k => out.add(k));
  }
  return [...out];
};

export const collapseProjectPermissions = (grantedKeys: string[]): string[] => {
  const granted = new Set(grantedKeys);
  return SIMPLE_PROJECT_PERMISSIONS
    .filter(simple => simple.maps.every(k => granted.has(k)))
    .map(simple => simple.key);
};
