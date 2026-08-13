export interface ModulePermission {
  key: string;
  label: string;
  group?: string;             // sub-section label rendered inside the module card
  requiresDb?: string;        // raw DB module key that must be purchased to show this perm
  hideIfCatalogKey?: string;  // hide this perm when the named catalog module is also available
}

export interface ModuleDef {
  key: string;
  name: string;
  color: string;
  requires?: string[];
  requiresAny?: string[];
  permissions: ModulePermission[];
}

export const MODULE_CATALOG: ModuleDef[] = [
  // ── Clients (merges "clients" + "client_portal" DB modules) ──────────────
  {
    key: 'client',
    name: 'Clients',
    color: '#0891b2',
    permissions: [
      // Client Management (always visible when clients DB module is present)
      { key: 'canViewClients',   label: 'View Clients',                   group: 'Client Management' },
      { key: 'canCreateClients', label: 'Create Clients',                 group: 'Client Management' },
      { key: 'canEditClients',   label: 'Edit Clients',                   group: 'Client Management' },
      { key: 'canDeleteClients', label: 'Delete / Deactivate Clients',    group: 'Client Management' },
      // Data scope override — without it, a non-admin user only sees
      // clients they're the account manager for, or that are linked to
      // their own lead/invoice/project.
      { key: 'canViewAllCompanyClients', label: 'View All Company Clients', group: 'Client Management' },

      // Client Portal Access (only when client_portal DB module is purchased)
      { key: 'canEnableClientPortal',   label: 'Enable Client Portal Access',  group: 'Client Portal Access', requiresDb: 'client_portal' },
      { key: 'canDisableClientPortal',  label: 'Disable Client Portal Access', group: 'Client Portal Access', requiresDb: 'client_portal' },
      { key: 'canCreateClientLogin',    label: 'Create Client Login',          group: 'Client Portal Access', requiresDb: 'client_portal' },
      { key: 'canResetClientPassword',  label: 'Reset Client Password',        group: 'Client Portal Access', requiresDb: 'client_portal' },
      { key: 'canManageClientAccess',   label: 'Manage Client Access',         group: 'Client Portal Access', requiresDb: 'client_portal' },

      // Client Invoices (requires client_portal)
      { key: 'canViewClientInvoices',  label: 'View Client Invoices',  group: 'Client Invoices', requiresDb: 'client_portal' },
      { key: 'canViewClientPayments',  label: 'View Client Payments',  group: 'Client Invoices', requiresDb: 'client_portal' },

      // Client Documents (requires client_portal)
      { key: 'canViewClientDocuments',   label: 'View Client Documents',   group: 'Client Documents', requiresDb: 'client_portal' },
      { key: 'canManageClientDocuments', label: 'Manage Client Documents', group: 'Client Documents', requiresDb: 'client_portal' },

      // Client Support (requires client_portal)
      { key: 'canViewClientSupport',   label: 'View Client Support',          group: 'Client Support', requiresDb: 'client_portal' },
      { key: 'canManageClientSupport', label: 'Manage Client Support / Chat', group: 'Client Support', requiresDb: 'client_portal' },
    ],
  },

  // ── Sales ─────────────────────────────────────────────────────────────────
  {
    key: 'sales',
    name: 'Sales',
    color: '#2563eb',
    permissions: [
      { key: 'canViewSalesDashboard',  label: 'View Sales Dashboard' },
      { key: 'canViewLeads',           label: 'View Leads' },
      { key: 'canCreateLeads',         label: 'Create Leads' },
      { key: 'canEditLeads',           label: 'Edit Leads' },
      { key: 'canDeleteLeads',         label: 'Delete Leads' },
      { key: 'canTransferLeads',       label: 'Transfer Leads' },
      { key: 'canManagePipeline',      label: 'Manage Pipeline' },
      { key: 'canAssignLeadOwner',     label: 'Assign Lead Owner' },
      { key: 'canViewSalesTargets',    label: 'View Sales Targets' },
      { key: 'canUpdateSalesTargets',  label: 'Update Sales Targets' },
      { key: 'canViewSalesReports',    label: 'View Sales Reports' },
      { key: 'canExportSalesReports',  label: 'Export Sales Reports' },
      { key: 'canAddLeadNotes',        label: 'Add Lead Notes / Activity' },
      // No requiresDb gate — Sales Chat (Api\User\SalesChatController) is
      // enforced purely by this permission key plus the Sales module itself
      // being active, not a separate 'chat' module purchase.
      { key: 'canUseSalesChat',        label: 'Use Sales Chat' },
      { key: 'canViewAllCompanyLeads', label: 'View All Company Leads (not just assigned)' },

      // Basic client access included with Sales — hidden when full Client module is also available
      { key: 'canViewClients',   label: 'View Clients',   group: 'Basic Clients', hideIfCatalogKey: 'client' },
      { key: 'canCreateClients', label: 'Create Clients', group: 'Basic Clients', hideIfCatalogKey: 'client' },
      { key: 'canEditClients',   label: 'Edit Clients',   group: 'Basic Clients', hideIfCatalogKey: 'client' },
    ],
  },

  // ── Invoice ───────────────────────────────────────────────────────────────
  {
    key: 'invoice',
    name: 'Invoice',
    color: '#059669',
    permissions: [
      { key: 'canViewInvoices',             label: 'View Invoices' },
      { key: 'canCreateInvoices',           label: 'Create Invoices' },
      { key: 'canEditInvoices',             label: 'Edit Invoices' },
      { key: 'canDeleteOrCancelInvoices',   label: 'Delete / Cancel Invoices' },
      { key: 'canSendInvoices',             label: 'Send Invoices' },
      { key: 'canDownloadOrExportInvoices', label: 'Download / Export Invoices' },
      { key: 'canViewPayments',             label: 'View Payments' },
      { key: 'canRecordPayments',           label: 'Record Payments' },
      { key: 'canSendPaymentReminders',     label: 'Send Payment Reminders' },
      { key: 'canManageBillingClients',     label: 'Manage Billing Clients' },
      { key: 'canViewInvoiceReports',       label: 'View Invoice Reports' },
      { key: 'canManageInvoiceSettings',    label: 'Manage Invoice Settings' },
      { key: 'canSelectInvoiceGateway',     label: 'Select Invoice Payment Gateway' },
    ],
  },

  // ── HR ────────────────────────────────────────────────────────────────────
  {
    key: 'hr',
    name: 'HR',
    color: '#7c3aed',
    permissions: [
      { key: 'canViewHRDashboard',   label: 'View HR Dashboard' },
      { key: 'canViewEmployees',     label: 'View Employees' },
      { key: 'canCreateEmployees',   label: 'Create Employees' },
      { key: 'canEditEmployees',     label: 'Edit Employees' },
      { key: 'canDeleteEmployees',   label: 'Delete Employees' },
      { key: 'canViewRecruitment',   label: 'View Recruitment' },
      { key: 'canManageRecruitment', label: 'Manage Recruitment' },
      { key: 'canViewPayroll',       label: 'View Payroll' },
      { key: 'canProcessPayroll',    label: 'Process Payroll' },
      { key: 'canViewLeave',         label: 'View Leave' },
      { key: 'canApproveLeave',      label: 'Approve Leave' },
      { key: 'canViewHRReports',     label: 'View HR Reports' },
      { key: 'canExportHRReports',   label: 'Export HR Reports' },
      { key: 'canUseHRChat',         label: 'Use HR Chat' },
    ],
  },

  // ── Compliance ────────────────────────────────────────────────────────────
  {
    key: 'compliance',
    name: 'Compliance',
    color: '#dc2626',
    permissions: [
      { key: 'canViewComplianceDashboard',  label: 'View Compliance Dashboard' },
      { key: 'canViewPolicies',             label: 'View Policies' },
      { key: 'canCreatePolicies',           label: 'Create Policies' },
      { key: 'canEditPolicies',             label: 'Edit Policies' },
      { key: 'canAssignPolicies',           label: 'Assign Policies' },
      { key: 'canViewAuditTrails',          label: 'View Audit Trails' },
      { key: 'canExportAuditTrails',        label: 'Export Audit Trails' },
      { key: 'canViewComplianceReports',    label: 'View Compliance Reports' },
      { key: 'canExportComplianceReports',  label: 'Export Compliance Reports' },
      { key: 'canCreateRiskAssessments',    label: 'Create Risk Assessments' },
      { key: 'canEditRiskAssessments',      label: 'Edit Risk Assessments' },
      { key: 'canViewAlertsViolations',     label: 'View Alerts & Violations' },
      { key: 'canResolveAlertsViolations',  label: 'Resolve Alerts & Violations' },
      { key: 'canManageDocumentCompliance', label: 'Manage Document Compliance' },
      { key: 'canUseComplianceChat',        label: 'Use Compliance Chat' },
    ],
  },

  // ── Finance ───────────────────────────────────────────────────────────────
  {
    key: 'finance',
    name: 'Finance',
    color: '#d97706',
    requires: ['invoice'],
    permissions: [
      { key: 'canViewFinanceDashboard',   label: 'View Finance Dashboard' },
      { key: 'canViewRevenueDashboard',   label: 'View Revenue Dashboard' },
      { key: 'canViewFinanceInvoices',    label: 'View Finance Invoices' },
      { key: 'canViewPayments',           label: 'View Payments' },
      { key: 'canRecordPayments',         label: 'Record Payments' },
      { key: 'canReconcilePayments',      label: 'Reconcile Payments' },
      { key: 'canViewPaymentDetails',     label: 'View Payment Details' },
      { key: 'canSendInvoiceReminders',   label: 'Send Invoice Reminders' },
      { key: 'canViewFinanceReports',     label: 'View Finance Reports' },
      { key: 'canExportFinanceReports',   label: 'Export Finance Reports' },
      { key: 'canViewRevenueReports',     label: 'View Revenue Reports' },
      { key: 'canExportRevenueReports',   label: 'Export Revenue Reports' },
      { key: 'canUseFinanceChat',         label: 'Use Finance Chat' },
    ],
  },

  // ── Project Management ────────────────────────────────────────────────────
  {
    key: 'project_management',
    name: 'Project Management',
    color: '#0369a1',
    permissions: [
      { key: 'canViewProjectDashboard',    label: 'View Project Dashboard',   group: 'Projects' },
      { key: 'canViewProjects',            label: 'View Projects',            group: 'Projects' },
      { key: 'canCreateProjects',          label: 'Create Projects',          group: 'Projects' },
      { key: 'canCreateProjectHandoff',    label: 'Create Project Handoff',   group: 'Projects' },
      { key: 'canManageProjectInvoices',   label: 'Manage Project Invoices',  group: 'Projects' },
      { key: 'canOverrideProjectCreationBeforePayment', label: 'Override Project Creation Before Payment', group: 'Projects' },
      { key: 'canEditProjects',            label: 'Edit Projects',            group: 'Projects' },
      { key: 'canViewAllCompanyProjects',  label: 'View All Company Projects', group: 'Projects' },
      { key: 'canCompleteProjects',        label: 'Complete Project',         group: 'Projects' },
      { key: 'canCloseProjects',           label: 'Close Project',            group: 'Projects' },
      { key: 'canReopenProjects',          label: 'Reopen Project',           group: 'Projects' },
      { key: 'canForceCloseProjects',      label: 'Force Close Project',      group: 'Projects' },
      { key: 'canAssignProjectSeller',     label: 'Assign/Switch Project Seller', group: 'Projects' },
      { key: 'canActivateProjects',        label: 'Activate Draft Project',   group: 'Projects' },

      { key: 'canViewTasks',               label: 'View Tasks',   group: 'Tasks' },
      { key: 'canCreateTasks',             label: 'Create Tasks', group: 'Tasks' },
      { key: 'canEditTasks',               label: 'Edit Tasks',   group: 'Tasks' },
      { key: 'canAssignTasks',             label: 'Assign Tasks', group: 'Tasks' },
      { key: 'canMarkTaskBlocked',         label: 'Mark Task Blocked', group: 'Tasks' },

      { key: 'canViewTeamResources',       label: 'View Team Resources',   group: 'Team & Timesheets' },
      { key: 'canAssignTeamResources',     label: 'Assign Team Resources', group: 'Team & Timesheets' },
      { key: 'canViewTimesheets',          label: 'View Timesheets',       group: 'Team & Timesheets' },
      { key: 'canApproveTimesheets',       label: 'Approve Timesheets',    group: 'Team & Timesheets' },

      { key: 'canViewProjectReports',      label: 'View Project Reports', group: 'Reports' },
      { key: 'canViewTaskReports',         label: 'View Task Reports',    group: 'Reports' },

      { key: 'canViewProductionQueue',     label: 'View Production Queue',     group: 'Production' },
      { key: 'canAssignProductionTasks',   label: 'Assign Production Tasks',   group: 'Production' },
      { key: 'canStartProductionTasks',    label: 'Start Production Tasks',    group: 'Production' },
      { key: 'canSubmitProductionTasks',   label: 'Submit Production Tasks',   group: 'Production' },

      { key: 'canCreateRevisions',         label: 'Create Revisions',    group: 'Revisions & Deliverables' },
      { key: 'canResolveRevisions',        label: 'Resolve Revisions',   group: 'Revisions & Deliverables' },
      { key: 'canUploadDeliverables',      label: 'Upload Deliverables', group: 'Revisions & Deliverables' },
      { key: 'canVerifyDeliverables',      label: 'Verify Deliverables', group: 'Revisions & Deliverables' },
      { key: 'canViewDeliverables',        label: 'View Deliverables',   group: 'Revisions & Deliverables' },
      { key: 'canApproveDeliverables',     label: 'Approve Deliverables', group: 'Revisions & Deliverables' },

      { key: 'canUploadProjectAttachments',   label: 'Upload Project Attachments',   group: 'Attachments' },
      { key: 'canViewProjectAttachments',     label: 'View Project Attachments',     group: 'Attachments' },
      { key: 'canDownloadProjectAttachments', label: 'Download Project Attachments', group: 'Attachments' },
      { key: 'canDeleteProjectAttachments',   label: 'Delete Project Attachments',   group: 'Attachments' },
      { key: 'canUploadTaskAttachments',   label: 'Upload Task Attachments',   group: 'Attachments' },
      { key: 'canViewTaskAttachments',     label: 'View Task Attachments',     group: 'Attachments' },
      { key: 'canDownloadTaskAttachments', label: 'Download Task Attachments', group: 'Attachments' },
      { key: 'canDeleteTaskAttachments',   label: 'Delete Task Attachments',   group: 'Attachments' },

      { key: 'canViewLinkedProjects',         label: 'View Linked Projects',          group: 'Seller / Linked Projects' },
      { key: 'canCreateLinkedProjectTask',    label: 'Create Linked Project Task',    group: 'Seller / Linked Projects' },
      { key: 'canRequestPMAssignment',        label: 'Request PM Assignment',         group: 'Seller / Linked Projects' },
      { key: 'canAddClientFacingComment',     label: 'Add Client-facing Project Comment', group: 'Seller / Linked Projects' },

      // Project Chat is now a single conversation per project; there is no
      // more "create a group" or "create a direct chat" action to gate.
      { key: 'canViewProjectChat',              label: 'View Project Chat',               group: 'Project Chat' },
      { key: 'canSendProjectChatMessage',        label: 'Send Project Chat Message',       group: 'Project Chat' },
      { key: 'canManageProjectChatParticipants', label: 'Manage Project Chat Participants', group: 'Project Chat' },
      { key: 'canAddSellerToProjectChat',        label: 'Add Seller To Project Chat',      group: 'Project Chat' },
      { key: 'canUploadProjectChatAttachment',   label: 'Upload Project Chat Attachment',  group: 'Project Chat' },
      { key: 'canViewProjectChatAttachments',    label: 'View Project Chat Attachments',   group: 'Project Chat' },
    ],
  },
];

// Maps DB/company_modules keys → catalog keys.
// Keys NOT listed here pass through as-is (the DB key IS the catalog key, e.g. 'hr', 'compliance').
// 'reports', 'documents', 'chat' have no catalog permission group — they are feature flags only.
const DB_TO_CATALOG: Record<string, string> = {
  // Client
  clients: 'client', client_portal: 'client',

  // Invoice
  invoices: 'invoice', payments: 'invoice', payment_details: 'invoice',
  invoice_reminders: 'invoice',
  // Note: 'reports' is a standalone analytics feature flag, NOT the invoice module

  // Sales
  leads: 'sales', projects_handoff: 'sales', lead_transfer: 'sales', reports_seller: 'sales',

  // HR
  employees: 'hr', recruitment: 'hr', attendance: 'hr', leaves: 'hr', payroll: 'hr',

  // Finance
  finance_dashboard: 'finance', finance_reports: 'finance',
  revenue_reports: 'finance', payments_report: 'finance',

  // Project Management
  projects: 'project_management', tasks: 'project_management',
  timesheets: 'project_management', revisions: 'project_management',
  deliverables: 'project_management', team_resources: 'project_management',
  file_storage: 'project_management', production: 'project_management',

  // Others (catalog key = DB key, no entry needed, but listed for clarity)
  compliance: 'compliance',
};

/**
 * Accepts DB module keys (from company_modules table) OR catalog keys.
 * Returns the matching ModuleDefs, respecting requires/requiresAny.
 */
export function getAvailableModules(dbOrCatalogKeys: string[]): ModuleDef[] {
  const catalogKeys = [...new Set(dbOrCatalogKeys.map(k => DB_TO_CATALOG[k] ?? k))];

  return MODULE_CATALOG.filter(mod => {
    if (!catalogKeys.includes(mod.key)) return false;
    if (mod.requires?.some(r => !catalogKeys.includes(r))) return false;
    if (mod.requiresAny && !mod.requiresAny.some(r => catalogKeys.includes(r))) return false;
    return true;
  });
}

/** Compute a display label from a map of moduleKey → permissionKey[]. */
export function getRoleLabelFromPermissions(modulePerms: Record<string, string[]>): string {
  const active = Object.entries(modulePerms)
    // 'account' is the common "can add users" capability, not a work module — never part of the label.
    .filter(([key, perms]) => key !== 'account' && perms.length > 0)
    .map(([key]) => key);

  if (active.length === 0) return 'No Access';

  const names = active.map(key => MODULE_CATALOG.find(m => m.key === key)?.name ?? key);

  if (names.length === 1) return `${names[0]} Manager`;
  if (names.length === 2) return `${names[0]} & ${names[1]} Manager`;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]} Manager`;
}
