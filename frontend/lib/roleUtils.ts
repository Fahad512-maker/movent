// Maps purchased internal module keys → available roles for that module group.
// internalKeys come from company_modules table (same as moduleConfig.ts internalKeys).

const CATALOG_ROLE_MAP = [
  {
    keys:  ['invoices', 'payments', 'payment_details', 'invoice_reminders'],
    roles: [
      { value: 'invoice_admin',   label: 'Invoice Admin' },
      { value: 'invoice_manager', label: 'Invoice Manager' },
      { value: 'invoice_creator', label: 'Invoice Creator' },
      { value: 'invoice_viewer',  label: 'Invoice Viewer' },
      { value: 'payment_manager', label: 'Payment Manager' },
    ],
  },
  {
    keys:  ['leads', 'projects_handoff', 'lead_transfer', 'reports_seller'],
    roles: [
      { value: 'seller', label: 'Sales Manager' },
    ],
  },
  {
    keys:  ['employees', 'recruitment', 'attendance', 'leaves', 'payroll'],
    roles: [
      { value: 'hr', label: 'HR Manager' },
    ],
  },
  {
    keys:  ['finance_dashboard', 'finance_reports', 'revenue_reports', 'payments_report'],
    roles: [
      { value: 'finance', label: 'Finance Manager' },
    ],
  },
  {
    keys:  ['projects', 'tasks', 'timesheets', 'revisions', 'deliverables', 'team_resources', 'file_storage'],
    roles: [
      { value: 'project_manager', label: 'Project Manager' },
    ],
  },
  {
    keys:  ['production'],
    roles: [
      { value: 'production', label: 'Production Manager' },
    ],
  },
];

export interface RoleOption { value: string; label: string }

export function getRolesFromModules(companyModules: string[]): RoleOption[] {
  const seen  = new Set<string>();
  const roles: RoleOption[] = [];

  for (const cat of CATALOG_ROLE_MAP) {
    if (!cat.keys.some(k => companyModules.includes(k))) continue;
    for (const r of cat.roles) {
      if (!seen.has(r.value)) { seen.add(r.value); roles.push(r); }
    }
  }

  // fallback: show invoice roles when no modules loaded yet
  return roles.length > 0 ? roles : CATALOG_ROLE_MAP[0].roles;
}

export const ROLE_LABELS: Record<string, string> = {
  company_admin:   'Company Admin',
  project_manager: 'Project Manager',
  production:      'Production User',
  developer:       'Developer',
  designer:        'Designer',
  qa:              'QA',
  team_member:     'Team Member',
  seller:          'Seller',
  lead_manager:    'Lead Manager',
  invoice_user:    'Invoice User',
  hr:              'HR User',
  finance:         'Finance User',
  compliance:      'Compliance User',
  viewer:          'Viewer',
  // Legacy values — no longer offered in USER_ROLE_TYPE_OPTIONS below, but
  // still valid so existing users who already have one keep their label.
  invoice_admin:   'Invoice Admin',
  invoice_manager: 'Invoice Manager',
  invoice_creator: 'Invoice Creator',
  invoice_viewer:  'Invoice Viewer',
  payment_manager: 'Payment Manager',
  client:          'Client',
  staff:           'Staff',
};

// Mirrors UserController::VALID_ROLES (the users.role_type DB enum) and
// App\Services\RoleDefaultPermissions::roleOptions() — keep all three in
// sync. This is the pickable list for "Select Role" on Add/Edit User;
// 'client' and 'staff' are excluded since they aren't meaningful choices for
// a staff member the Company Admin is creating. The 5 legacy invoice_*/
// payment_manager values are intentionally not offered here anymore.
// 'company_admin' and 'team_member' are deliberately NOT offered either
// (2026-08-11): Company Admin is never really a `users` row (it's its own
// `company_admins` table/guard — picking this here wouldn't grant real
// Admin privileges anyway, every unrestricted-Admin check is against the
// admin guard, not this role_type), and 'team_member' was removed from the
// picker per explicit request — still a valid role_type for existing rows,
// backend validation (UserController::VALID_ROLES) is untouched.
export const USER_ROLE_TYPE_OPTIONS: RoleOption[] = [
  { value: 'project_manager', label: ROLE_LABELS.project_manager },
  { value: 'production',      label: ROLE_LABELS.production },
  { value: 'developer',       label: ROLE_LABELS.developer },
  { value: 'designer',        label: ROLE_LABELS.designer },
  { value: 'qa',              label: ROLE_LABELS.qa },
  { value: 'seller',          label: ROLE_LABELS.seller },
  { value: 'lead_manager',    label: ROLE_LABELS.lead_manager },
  { value: 'invoice_user',    label: ROLE_LABELS.invoice_user },
  { value: 'hr',              label: ROLE_LABELS.hr },
  { value: 'finance',         label: ROLE_LABELS.finance },
  { value: 'compliance',      label: ROLE_LABELS.compliance },
  { value: 'viewer',          label: ROLE_LABELS.viewer },
];

// ── Role default permissions ─────────────────────────────────────────────────
// Mirrors App\Services\RoleDefaultPermissions::MAP exactly — every key here
// is a real, currently-enforced ModuleCatalog permission (never invented).
// 'company_admin' and 'viewer' are computed dynamically (see
// getRoleDefaultPermissions below) since they span every purchased module
// rather than a fixed list.
const ROLE_DEFAULT_PERMISSIONS: Record<string, Record<string, string[]>> = {
  // Each role's project_management list below is a union of whole
  // simplified-permission bundles (see frontend/lib/simplifiedProjectPermissions.ts)
  // — e.g. project_manager gets every "main" bundle's keys — so that
  // collapseProjectPermissions() shows the right simple checkboxes checked
  // out of the box. Keep any change here mirrored in
  // App\Services\RoleDefaultPermissions::MAP on the backend.
  project_manager: {
    // pm_view + pm_manage_projects + pm_manage_tasks + pm_manage_team +
    // pm_manage_production + pm_manage_deliverables + pm_manage_timesheets +
    // pm_view_reports + pm_manage_files + pm_manage_comments + pm_manage_chat
    // + every "advanced" (collapsed-by-default) bundle item — 2026-08-13:
    // explicitly granted per Company Admin request, overriding the "NOT
    // granted to any role by default" notes on canAssignProjectSeller/
    // canActivateProjects in ModuleCatalog.php.
    project_management: [
      'canViewProjectDashboard', 'canViewProjects', 'canViewLinkedProjects',
      'canCreateProjects', 'canCreateProjectHandoff', 'canManageProjectInvoices', 'canEditProjects', 'canCompleteProjects', 'canCloseProjects', 'canReopenProjects',
      'canViewTasks', 'canCreateTasks', 'canCreateLinkedProjectTask', 'canEditTasks', 'canAssignTasks', 'canMarkTaskBlocked',
      'canViewTeamResources', 'canAssignTeamResources', 'canRequestPMAssignment',
      'canViewProductionQueue', 'canAssignProductionTasks', 'canStartProductionTasks', 'canSubmitProductionTasks',
      'canViewDeliverables', 'canUploadDeliverables', 'canVerifyDeliverables', 'canApproveDeliverables', 'canCreateRevisions', 'canResolveRevisions',
      'canViewTimesheets', 'canApproveTimesheets',
      'canViewProjectReports', 'canViewTaskReports',
      'canUploadProjectAttachments', 'canViewProjectAttachments', 'canDownloadProjectAttachments', 'canUploadTaskAttachments', 'canViewTaskAttachments', 'canDownloadTaskAttachments',
      'canAddClientFacingComment',
      'canViewProjectChat', 'canSendProjectChatMessage', 'canManageProjectChatParticipants', 'canUploadProjectChatAttachment', 'canViewProjectChatAttachments', 'canDeleteAnyProjectChatMessage',
      // Advanced bundle additions.
      'canAssignProjectSeller', 'canActivateProjects', 'canForceCloseProjects',
      'canDeleteProjectAttachments', 'canDeleteTaskAttachments', 'canAddSellerToProjectChat',
      'canViewAllCompanyProjects', 'canViewClosedProjects',
      'canOverrideProjectCreationBeforePayment',
    ],
    account: ['canUseGeneralChat'],
  },
  // pm_view + pm_manage_tasks + pm_manage_production + pm_manage_deliverables + pm_manage_files + pm_manage_comments + pm_manage_chat
  production: {
    project_management: [
      'canViewProjectDashboard', 'canViewProjects', 'canViewLinkedProjects',
      'canViewTasks', 'canCreateTasks', 'canCreateLinkedProjectTask', 'canEditTasks', 'canAssignTasks', 'canMarkTaskBlocked',
      'canViewProductionQueue', 'canAssignProductionTasks', 'canStartProductionTasks', 'canSubmitProductionTasks',
      'canViewDeliverables', 'canUploadDeliverables', 'canVerifyDeliverables', 'canApproveDeliverables', 'canCreateRevisions', 'canResolveRevisions',
      'canUploadProjectAttachments', 'canViewProjectAttachments', 'canDownloadProjectAttachments', 'canUploadTaskAttachments', 'canViewTaskAttachments', 'canDownloadTaskAttachments',
      'canAddClientFacingComment',
      'canViewProjectChat', 'canSendProjectChatMessage', 'canUploadProjectChatAttachment', 'canViewProjectChatAttachments',
    ],
  },
  developer: {
    project_management: [
      'canViewProjectDashboard', 'canViewProjects', 'canViewLinkedProjects',
      'canViewTasks', 'canCreateTasks', 'canCreateLinkedProjectTask', 'canEditTasks', 'canAssignTasks', 'canMarkTaskBlocked',
      'canViewProductionQueue', 'canAssignProductionTasks', 'canStartProductionTasks', 'canSubmitProductionTasks',
      'canViewDeliverables', 'canUploadDeliverables', 'canVerifyDeliverables', 'canApproveDeliverables', 'canCreateRevisions', 'canResolveRevisions',
      'canUploadProjectAttachments', 'canViewProjectAttachments', 'canDownloadProjectAttachments', 'canUploadTaskAttachments', 'canViewTaskAttachments', 'canDownloadTaskAttachments',
      'canAddClientFacingComment',
      'canViewProjectChat', 'canSendProjectChatMessage', 'canUploadProjectChatAttachment', 'canViewProjectChatAttachments',
    ],
  },
  designer: {
    project_management: [
      'canViewProjectDashboard', 'canViewProjects', 'canViewLinkedProjects',
      'canViewTasks', 'canCreateTasks', 'canCreateLinkedProjectTask', 'canEditTasks', 'canAssignTasks', 'canMarkTaskBlocked',
      'canViewProductionQueue', 'canAssignProductionTasks', 'canStartProductionTasks', 'canSubmitProductionTasks',
      'canViewDeliverables', 'canUploadDeliverables', 'canVerifyDeliverables', 'canApproveDeliverables', 'canCreateRevisions', 'canResolveRevisions',
      'canUploadProjectAttachments', 'canViewProjectAttachments', 'canDownloadProjectAttachments', 'canUploadTaskAttachments', 'canViewTaskAttachments', 'canDownloadTaskAttachments',
      'canAddClientFacingComment',
      'canViewProjectChat', 'canSendProjectChatMessage', 'canUploadProjectChatAttachment', 'canViewProjectChatAttachments',
    ],
  },
  // pm_view + pm_manage_tasks + pm_manage_deliverables + pm_manage_files + pm_manage_comments + pm_manage_chat (no Production)
  // + every "advanced" (collapsed-by-default) bundle item — 2026-08-13:
  // same explicit grant as project_manager above.
  qa: {
    project_management: [
      'canViewProjectDashboard', 'canViewProjects', 'canViewLinkedProjects',
      'canViewTasks', 'canCreateTasks', 'canCreateLinkedProjectTask', 'canEditTasks', 'canAssignTasks', 'canMarkTaskBlocked',
      'canViewDeliverables', 'canUploadDeliverables', 'canVerifyDeliverables', 'canApproveDeliverables', 'canCreateRevisions', 'canResolveRevisions',
      'canUploadProjectAttachments', 'canViewProjectAttachments', 'canDownloadProjectAttachments', 'canUploadTaskAttachments', 'canViewTaskAttachments', 'canDownloadTaskAttachments',
      'canAddClientFacingComment',
      'canViewProjectChat', 'canSendProjectChatMessage', 'canUploadProjectChatAttachment', 'canViewProjectChatAttachments',
      // Advanced bundle additions.
      'canAssignProjectSeller', 'canActivateProjects', 'canForceCloseProjects',
      'canDeleteProjectAttachments', 'canDeleteTaskAttachments', 'canAddSellerToProjectChat',
      'canViewAllCompanyProjects', 'canViewClosedProjects', 'canManageProjectChatParticipants',
      'canDeleteAnyProjectChatMessage', 'canOverrideProjectCreationBeforePayment',
    ],
  },
  // pm_view + pm_manage_tasks + pm_manage_files + pm_manage_comments + pm_manage_chat (no Production, no Deliverables/QA)
  team_member: {
    project_management: [
      'canViewProjectDashboard', 'canViewProjects', 'canViewLinkedProjects',
      'canViewTasks', 'canCreateTasks', 'canCreateLinkedProjectTask', 'canEditTasks', 'canAssignTasks', 'canMarkTaskBlocked',
      'canUploadProjectAttachments', 'canViewProjectAttachments', 'canDownloadProjectAttachments', 'canUploadTaskAttachments', 'canViewTaskAttachments', 'canDownloadTaskAttachments',
      'canAddClientFacingComment',
      'canViewProjectChat', 'canSendProjectChatMessage', 'canUploadProjectChatAttachment', 'canViewProjectChatAttachments',
    ],
  },
  // Sellers only ever see/act on projects they're linked to, and can only
  // ever share a comment/chat thread with Company Admin or this project's
  // PM — never the wider team — no general Task/Production/Deliverables
  // management, no full project attachment access (that flat, untiered file
  // list would otherwise expose internal project files to a Seller). Project
  // chat is now the single project conversation, scoped by participant rows.
  seller: {
    // canTransferLeads is deliberately NOT granted — a Seller works their
    // own leads only; transferring a lead to another Seller is a Lead
    // Manager/Company Admin action.
    sales: [
      'canViewSalesDashboard', 'canViewLeads', 'canCreateLeads', 'canEditLeads', 'canDeleteLeads',
      'canManagePipeline', 'canAddLeadNotes', 'canViewSalesTargets', 'canUpdateSalesTargets', 'canViewSalesReports',
      'canUseSalesChat',
      'canViewClients', 'canCreateClients', 'canEditClients',
    ],
    // canEnableClientPortal/canDisableClientPortal validate only against the
    // 'client' catalog module (moduleCatalog.ts), not 'sales' — see the
    // matching comment in App\Services\RoleDefaultPermissions.php.
    // canView/Create/EditClients are repeated here (already granted above
    // under 'sales') so the "Clients" tab's own checkboxes show checked too
    // — Add/Edit User's per-module UI only reads a key under the module
    // bucket it's actually rendered in.
    client: [
      'canEnableClientPortal', 'canDisableClientPortal',
      'canViewClients', 'canCreateClients', 'canEditClients',
      'canResetClientPassword', 'canViewClientPayments', 'canViewClientInvoices',
      'canManageClientDocuments', 'canViewClientDocuments',
    ],
    invoice: [
      'canCreateInvoices', 'canSendInvoices', 'canViewInvoices', 'canEditInvoices',
      'canDownloadOrExportInvoices', 'canViewPayments', 'canRecordPayments',
      'canSendPaymentReminders', 'canManageBillingClients', 'canViewInvoiceReports',
    ],
    // canCreateLinkedProjectTask is deliberately NOT granted — the Task
    // feature is retired for this role entirely (backend hard-blocks it
    // regardless of any permission held).
    project_management: [
      'canViewProjectDashboard', 'canViewProjects', 'canViewLinkedProjects',
      'canCreateProjectHandoff',
      'canRequestPMAssignment',
      'canAddClientFacingComment',
      'canViewProjectChat', 'canSendProjectChatMessage',
      'canUploadProjectChatAttachment', 'canViewProjectChatAttachments',
      // canManageProjectInvoices — explicitly re-included per 2026-08-13
      // request; a Seller now gets project billing/invoice access too so the
      // "Manage Projects" bundle checkbox shows fully checked.
      'canManageProjectInvoices',
      'canEditProjects', 'canCompleteProjects', 'canCloseProjects', 'canReopenProjects',
      'canCreateProjects',
      'canUploadProjectAttachments', 'canViewProjectAttachments', 'canDownloadProjectAttachments',
      'canUploadTaskAttachments', 'canViewTaskAttachments', 'canDownloadTaskAttachments',
      'canAddSellerToProjectChat',
      // canManageProjectChatParticipants is cosmetic-only for this role —
      // ProjectMessengerController::canManageParticipants() hard-blocks
      // role_type='seller' before this permission is ever checked. Kept
      // here only so the checkbox shows checked per explicit request.
      'canManageProjectChatParticipants',
    ],
    account: ['canUseGeneralChat'],
  },
  // Lead Manager — manages leads and assigns/transfers them to Sellers,
  // company-wide (canViewAllCompanyLeads), but never gets full Company
  // Admin access: no user/settings/payment-gateway management, unless a
  // Company Admin manually grants those on top. canManagePipeline already
  // covers marking a lead Won/Lost, and canViewSalesDashboard +
  // canViewAllCompanyLeads together already surface the per-seller
  // performance breakdown — neither needs its own dedicated permission key.
  // Mirrors App\Services\RoleDefaultPermissions::MAP's 'lead_manager' entry
  // exactly.
  //
  // 2026-08-13: given the same Client/Sales/Invoice/Project Management
  // bundle as Seller (see the 'seller' entry above), PLUS the extra
  // company-wide/lead-ownership keys (canViewAllCompanyLeads,
  // canAssignLeadOwner, canTransferLeads, canDeleteLeads) a Seller
  // deliberately doesn't get — Lead Manager sits a tier above Seller, not
  // beside it. This supersedes the older "no lead deletion, no invoice
  // creation/sending" restriction.
  lead_manager: {
    sales: [
      'canViewSalesDashboard', 'canViewLeads', 'canViewAllCompanyLeads',
      'canCreateLeads', 'canEditLeads', 'canDeleteLeads', 'canAssignLeadOwner', 'canTransferLeads',
      'canManagePipeline', 'canAddLeadNotes', 'canViewSalesTargets', 'canUpdateSalesTargets', 'canViewSalesReports',
      'canUseSalesChat',
      'canViewClients', 'canCreateClients', 'canEditClients',
    ],
    client: [
      'canEnableClientPortal', 'canDisableClientPortal',
      'canViewClients', 'canCreateClients', 'canEditClients',
      'canResetClientPassword', 'canViewClientPayments', 'canViewClientInvoices',
      'canManageClientDocuments', 'canViewClientDocuments',
    ],
    // Only actually granted if the company has purchased the invoice module.
    invoice: [
      'canCreateInvoices', 'canSendInvoices', 'canViewInvoices', 'canEditInvoices',
      'canDownloadOrExportInvoices', 'canViewPayments', 'canRecordPayments',
      'canSendPaymentReminders', 'canManageBillingClients', 'canViewInvoiceReports',
    ],
    // Same Seller-tier project bundle as the 'seller' entry above — see its
    // comments for which of these are functional vs. cosmetic-only. Note
    // several (canEditProjects/canCompleteProjects/etc.) key off a project's
    // seller_id match, which Lead Manager won't normally have, so those are
    // cosmetic here unless this Lead Manager is also set as a project's
    // seller/PM.
    project_management: [
      'canViewProjectDashboard', 'canViewProjects', 'canViewLinkedProjects',
      'canCreateProjectHandoff',
      'canRequestPMAssignment',
      'canAddClientFacingComment',
      'canViewProjectChat', 'canSendProjectChatMessage',
      'canUploadProjectChatAttachment', 'canViewProjectChatAttachments',
      'canManageProjectInvoices',
      'canEditProjects', 'canCompleteProjects', 'canCloseProjects', 'canReopenProjects',
      'canCreateProjects',
      'canUploadProjectAttachments', 'canViewProjectAttachments', 'canDownloadProjectAttachments',
      'canUploadTaskAttachments', 'canViewTaskAttachments', 'canDownloadTaskAttachments',
      'canAddSellerToProjectChat',
      'canManageProjectChatParticipants',
    ],
    account: ['canUseGeneralChat'],
  },
  invoice_user: {
    invoice: [
      'canViewInvoices', 'canCreateInvoices', 'canEditInvoices', 'canSendInvoices',
      'canViewPayments', 'canSendPaymentReminders', 'canSelectInvoiceGateway',
    ],
  },
  hr: {
    hr: [
      'canViewHRDashboard', 'canViewEmployees', 'canCreateEmployees', 'canEditEmployees',
      'canViewLeave', 'canApproveLeave', 'canViewPayroll', 'canViewHRReports',
    ],
    account: ['canUseGeneralChat'],
  },
  finance: {
    finance: [
      'canViewFinanceDashboard', 'canViewRevenueDashboard', 'canViewPayments',
      'canViewFinanceReports', 'canExportFinanceReports', 'canViewFinanceInvoices',
      'canViewPaymentDetails',
    ],
    account: ['canUseGeneralChat'],
  },
  compliance: {
    compliance: [
      'canViewComplianceDashboard', 'canViewPolicies', 'canCreatePolicies', 'canEditPolicies',
      'canViewAuditTrails', 'canViewComplianceReports',
    ],
    account: ['canUseGeneralChat'],
  },
};

/**
 * Default permission map for a role, filtered to the catalog module keys the
 * company actually has active. `catalogModules` are already-resolved catalog
 * keys (e.g. from getAvailableModules(rawDb).map(m => m.key)), not raw DB
 * module keys.
 */
export function getRoleDefaultPermissions(
  role: string,
  catalogModules: string[],
  allModulePermissions: Record<string, string[]>, // moduleKey -> every permission key in that catalog module (for company_admin/viewer)
): Record<string, string[]> {
  if (role === 'company_admin') {
    const out: Record<string, string[]> = {};
    for (const key of [...catalogModules, 'account']) {
      if (allModulePermissions[key]) out[key] = [...allModulePermissions[key]];
    }
    return out;
  }

  if (role === 'viewer') {
    const out: Record<string, string[]> = {};
    for (const key of catalogModules) {
      const viewKeys = (allModulePermissions[key] ?? []).filter(p => p.startsWith('canView'));
      if (viewKeys.length > 0) out[key] = viewKeys;
    }
    return out;
  }

  const raw = ROLE_DEFAULT_PERMISSIONS[role] ?? {};
  const filtered: Record<string, string[]> = {};
  for (const [moduleKey, permKeys] of Object.entries(raw)) {
    // 'account' (e.g. canUseGeneralChat) is never a purchased/catalog module
    // — it has no MODULE_CATALOG card, so allModulePermissions never has an
    // entry for it either. Trust the hardcoded list above instead of cross-
    // checking against a catalog that doesn't model this module.
    if (moduleKey === 'account') {
      filtered.account = [...permKeys];
      continue;
    }
    if (!catalogModules.includes(moduleKey)) continue;
    const valid = permKeys.filter(p => (allModulePermissions[moduleKey] ?? []).includes(p));
    if (valid.length > 0) filtered[moduleKey] = valid;
  }
  return filtered;
}

/** Given a Record<moduleKey, permissionKey[]>, return a concise role label. */
export function computeAccessLabel(permissions: Record<string, string[]>): string {
  const activeModules = Object.entries(permissions)
    // 'account' is the common "can add users" capability, not a work module — never part of the label.
    .filter(([k, perms]) => k !== 'account' && perms.length > 0)
    .map(([k]) => k);

  if (activeModules.length === 0) return 'No Access';

  const moduleNameMap: Record<string, string> = {
    sales: 'Sales', invoice: 'Invoice', hr: 'HR', compliance: 'Compliance',
    finance: 'Finance', project_management: 'Project Management', client_portal: 'Client Portal',
  };

  const names = activeModules.map(k => moduleNameMap[k] ?? k);
  if (names.length === 1) return `${names[0]} Manager`;
  if (names.length === 2) return `${names[0]} & ${names[1]} Manager`;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]} Manager`;
}
