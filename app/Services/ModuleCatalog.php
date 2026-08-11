<?php

namespace App\Services;

class ModuleCatalog
{
    public static function all(): array
    {
        return [
            // Merges "clients" + "client_portal" DB modules into one section
            'client' => [
                'name'        => 'Clients',
                'permissions' => [
                    // Client Management
                    'canViewClients', 'canCreateClients', 'canEditClients', 'canDeleteClients',
                    // Data scope override — without it, a non-admin user only
                    // sees clients they're the account manager for, or that are
                    // linked to their own lead/invoice/project (mirrors
                    // canViewAllCompanyLeads/canViewAllCompanyProjects).
                    'canViewAllCompanyClients',
                    // Client Portal Access
                    'canEnableClientPortal', 'canDisableClientPortal',
                    'canCreateClientLogin', 'canResetClientPassword', 'canManageClientAccess',
                    // Client Invoices
                    'canViewClientInvoices', 'canViewClientPayments',
                    // Client Documents
                    'canViewClientDocuments', 'canManageClientDocuments',
                    // Client Support
                    'canViewClientSupport', 'canManageClientSupport',
                ],
            ],
            'sales' => [
                'name'        => 'Sales',
                'permissions' => [
                    'canViewSalesDashboard', 'canViewLeads', 'canCreateLeads', 'canEditLeads',
                    'canDeleteLeads', 'canTransferLeads', 'canManagePipeline', 'canAssignLeadOwner',
                    'canViewSalesTargets', 'canUpdateSalesTargets', 'canViewSalesReports',
                    'canExportSalesReports', 'canAddLeadNotes', 'canUseSalesChat',
                    // Data scope override — without it, a Seller only sees leads
                    // assigned to them (mirrors canViewAllCompanyProjects).
                    'canViewAllCompanyLeads',
                    // Basic client access included with Sales
                    'canViewClients', 'canCreateClients', 'canEditClients',
                ],
            ],
            'invoice' => [
                'name'        => 'Invoice',
                'permissions' => [
                    'canViewInvoiceDashboard', 'canViewInvoices', 'canCreateInvoices',
                    'canEditInvoices', 'canDeleteOrCancelInvoices', 'canSendInvoices',
                    'canDownloadOrExportInvoices', 'canViewPayments', 'canRecordPayments',
                    'canSendPaymentReminders', 'canManageBillingClients', 'canViewInvoiceReports',
                    'canManageInvoiceSettings', 'canUseInvoiceChat',
                    // Whether this user can change which company payment-gateway
                    // account(s) an invoice accepts, or override the tenant's
                    // per-type default selection — without it, invoice creation
                    // silently uses the company default gateway(s) (see
                    // Api\User\InvoiceController::store()). Company Admin always
                    // has this implicitly (admin guard bypasses permission checks).
                    'canSelectInvoiceGateway',
                ],
            ],
            'hr' => [
                'name'        => 'HR',
                'permissions' => [
                    'canViewHRDashboard', 'canViewEmployees', 'canCreateEmployees',
                    'canEditEmployees', 'canDeleteEmployees', 'canViewRecruitment',
                    'canManageRecruitment', 'canViewPayroll', 'canProcessPayroll',
                    'canViewLeave', 'canApproveLeave', 'canViewHRReports',
                    'canExportHRReports', 'canUseHRChat',
                ],
            ],
            'compliance' => [
                'name'        => 'Compliance',
                'permissions' => [
                    'canViewComplianceDashboard', 'canViewPolicies', 'canCreatePolicies',
                    'canEditPolicies', 'canAssignPolicies', 'canViewAuditTrails',
                    'canExportAuditTrails', 'canViewComplianceReports', 'canExportComplianceReports',
                    'canCreateRiskAssessments', 'canEditRiskAssessments', 'canViewAlertsViolations',
                    'canResolveAlertsViolations', 'canManageDocumentCompliance', 'canUseComplianceChat',
                ],
            ],
            'finance' => [
                'name'        => 'Finance',
                'requires'    => ['invoice'],
                'permissions' => [
                    'canViewFinanceDashboard', 'canViewRevenueDashboard', 'canViewFinanceInvoices',
                    'canViewPayments', 'canRecordPayments', 'canReconcilePayments',
                    'canViewPaymentDetails', 'canSendInvoiceReminders', 'canViewFinanceReports',
                    'canExportFinanceReports', 'canViewRevenueReports', 'canExportRevenueReports',
                    'canUseFinanceChat',
                ],
            ],
            'project_management' => [
                'name'        => 'Project Management',
                'permissions' => [
                    'canViewProjectDashboard', 'canViewProjects', 'canCreateProjects',
                    // Narrower than canCreateProjects — lets a Seller create ONLY a
                    // handoff project from their own won lead (requires Sales +
                    // Project Management both active), not a general "create any
                    // project" right. See Api\User\ProjectController::store().
                    'canCreateProjectHandoff',
                    // Everything invoice-related on a project — viewing linked
                    // invoices, the billing summary (total invoiced/paid/
                    // outstanding), linking an existing invoice, and creating a
                    // new invoice for the project — consolidated into one key
                    // rather than four separate ones (view/link/create/summary
                    // are always granted together in practice). See
                    // Api\User\ProjectController's invoice-linking endpoints.
                    'canManageProjectInvoices',
                    // Lets a non-admin (e.g. a PM) create/link a project against
                    // an UNPAID invoice, bypassing the normal "must be paid"
                    // handoff safeguard — deliberately its own key (not folded
                    // into canManageProjectInvoices) since it bypasses a payment
                    // safeguard, a materially different risk tier. Company Admin
                    // never needs this — the admin guard already bypasses every
                    // sub-user permission check.
                    'canOverrideProjectCreationBeforePayment',
                    'canEditProjects', 'canAssignProjects',
                    // Assign/switch a project's Seller to any active Seller of
                    // the same company. Company Admin is always structurally
                    // allowed (the admin guard bypasses every permission check
                    // here, same as canCompleteProjects et al.) — this key only
                    // ever gates a PM-tier sub-user, and is NOT granted to any
                    // role by default (see RoleDefaultPermissions); Company
                    // Admin must explicitly grant it. See
                    // App\Services\ProjectSellerAssignmentService.
                    'canAssignProjectSeller',
                    'canViewTasks', 'canCreateTasks',
                    'canEditTasks', 'canAssignTasks', 'canViewTeamResources', 'canAssignTeamResources',
                    'canViewTimesheets', 'canApproveTimesheets', 'canViewProjectReports',
                    'canExportProjectReports', 'canViewTaskReports', 'canExportTaskReports',
                    'canViewProjectDocuments', 'canUploadProjectDocuments',
                    'canShareProjectDocuments',
                    'canViewProductionDashboard', 'canViewProductionQueue', 'canAssignProductionTasks',
                    'canStartProductionTasks', 'canSubmitProductionTasks', 'canCreateRevisions',
                    'canResolveRevisions', 'canUploadDeliverables', 'canDeliverDeliverables',
                    'canVerifyDeliverables', 'canViewProductionReports',
                    'canViewProductionTasks', 'canUpdateProductionTasks', 'canMarkTaskBlocked',
                    'canViewDeliverables', 'canReviseDeliverables', 'canApproveDeliverables',
                    'canAddProductionNotes',
                    'canUploadProjectAttachments', 'canViewProjectAttachments',
                    'canDownloadProjectAttachments', 'canDeleteProjectAttachments',
                    'canUploadTaskAttachments', 'canViewTaskAttachments', 'canDownloadTaskAttachments',
                    'canDeleteTaskAttachments',
                    'canViewAllCompanyProjects',
                    // Seller-tier project/task permissions — deliberately narrower
                    // than the PM-level keys above (canViewProjects/canCreateTasks/
                    // canAssignTasks etc.), so a Seller can hand off and follow up
                    // on their own linked work without gaining general PM access.
                    // See Api\User\ProjectController/TaskController/ProjectCommentController.
                    'canViewLinkedProjects',
                    'canCreateLinkedProjectTask',
                    'canRequestPMAssignment',
                    'canViewLinkedProjectStatus',
                    'canAddClientFacingComment',
                    // Project lifecycle (Complete/Close/Reopen) — Company Admin is
                    // always structurally allowed; these gate a PM-tier sub-user.
                    // See App\Services\ProjectCompletionService.
                    'canCompleteProjects', 'canCloseProjects', 'canReopenProjects',
                    'canForceCloseProjects', 'canViewClosedProjects',
                    // Task-level status-workflow lifecycle — distinct from the
                    // project-level Complete/Close/Reopen keys above. See
                    // App\Services\TaskStatusService for the full transition
                    // matrix these gate.
                    'canCompleteTasks', 'canReopenTasks', 'canOverrideTaskStatus',
                    // Project-wise messenger (groups + direct chats scoped to a
                    // project) — distinct from the older, dormant single-thread
                    // Api\*\ProjectChatController permissions, which these do not
                    // replace. See Api\*\ProjectMessengerController.
                    'canViewProjectChat', 'canSendProjectChatMessage',
                    'canCreateProjectChatGroup', 'canManageProjectChatParticipants',
                    'canAddSellerToProjectChat', 'canCreateProjectDirectChat',
                    'canUploadProjectChatAttachment', 'canViewProjectChatAttachments',
                    'canDeleteOwnProjectChatMessage', 'canDeleteAnyProjectChatMessage',
                    'canViewProjectChatHistory',
                ],
            ],

            // Not a purchasable module — a single company-wide capability
            // (whether this staff member can add other users) that used to be
            // duplicated inside every module above. Always available regardless
            // of which modules the company has purchased.
            'account' => [
                'name'        => 'Account',
                // Payment gateway management is Company-Admin-only today (the
                // whole Settings controller sits behind the `admin` guard, a
                // structural gate no sub-user can reach regardless of
                // permissions) — these keys exist so a future sub-user-facing
                // gateway screen has something to check against without
                // another catalog change; nothing currently reads them.
                'permissions' => [
                    'canAddUsers',
                    'canViewPaymentGateways', 'canManagePaymentGateways', 'canViewGatewayTransactions',
                    // General Chat (direct/group messaging, not tied to any
                    // project/lead) — lives here rather than under a
                    // purchasable module since it's meant to be available
                    // across portals regardless of which modules a company
                    // bought. See Api\User\GeneralChatController.
                    'canUseGeneralChat',
                ],
            ],
        ];
    }

    public static function getPermissionsForModule(string $moduleKey): array
    {
        return self::all()[$moduleKey]['permissions'] ?? [];
    }

    public static function isValidPermission(string $moduleKey, string $permKey): bool
    {
        return in_array($permKey, self::getPermissionsForModule($moduleKey));
    }

    public static function isModuleAvailable(string $moduleKey, array $purchasedModules): bool
    {
        $catalog = self::all();
        if (!isset($catalog[$moduleKey]) || !in_array($moduleKey, $purchasedModules)) {
            return false;
        }
        $module = $catalog[$moduleKey];

        if (!empty($module['requires'])) {
            foreach ($module['requires'] as $req) {
                if (!in_array($req, $purchasedModules)) return false;
            }
        }

        if (!empty($module['requiresAny'])) {
            foreach ($module['requiresAny'] as $req) {
                if (in_array($req, $purchasedModules)) return true;
            }
            return false;
        }

        return true;
    }

    /**
     * Map granular DB module keys → catalog module keys.
     * Matches the DB_TO_CATALOG mapping in the frontend moduleCatalog.ts.
     */
    public static function dbKeyToCatalog(string $dbKey): string
    {
        return match($dbKey) {
            'clients', 'client_portal'                                        => 'client',
            'invoices', 'payments', 'payment_details', 'invoice_reminders'    => 'invoice',
            'leads', 'projects_handoff', 'lead_transfer', 'reports_seller'    => 'sales',
            'employees', 'recruitment', 'attendance', 'leaves', 'payroll'     => 'hr',
            'finance_dashboard', 'finance_reports',
            'revenue_reports', 'payments_report'                              => 'finance',
            'projects', 'tasks', 'timesheets', 'revisions', 'deliverables',
            'team_resources', 'file_storage', 'production'                    => 'project_management',
            'compliance'                                                       => 'compliance',
            default                                                            => $dbKey,
        };
    }
}
