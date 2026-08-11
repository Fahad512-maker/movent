<?php

namespace App\Services;

// Role → default permission mapping for the Add/Edit User "select role, get
// default permissions" flow. Every key referenced here is a real, currently
// enforced ModuleCatalog permission — roles never grant a permission that
// has no backing feature. Some spec-requested labels (e.g. "Add Task
// Comments", "Mark Attendance") have no distinct permission key anywhere in
// the app today and are intentionally omitted rather than inventing one.
class RoleDefaultPermissions
{
    // catalogModuleKey => permission keys, per role. 'company_admin' and
    // 'viewer' are computed dynamically instead (see forRole()) since they
    // span every purchased module rather than a fixed list.
    // Each role's project_management list below is a union of whole
    // simplified-permission bundles (see
    // frontend/lib/simplifiedProjectPermissions.ts) — mirrors
    // frontend/lib/roleUtils.ts's ROLE_DEFAULT_PERMISSIONS exactly. Keep any
    // change here mirrored there too.
    private const MAP = [
        'project_manager' => [
            // pm_view + pm_manage_projects + pm_manage_tasks + pm_manage_team +
            // pm_manage_production + pm_manage_deliverables + pm_manage_timesheets +
            // pm_view_reports + pm_manage_files + pm_manage_comments + pm_manage_chat
            // canAssignProjectSeller is deliberately NOT included here — a PM
            // can switch a project's Seller only once Company Admin manually
            // grants that key, same convention as canForceCloseProjects.
            'project_management' => [
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
                'canViewProjectChat', 'canSendProjectChatMessage', 'canCreateProjectChatGroup', 'canManageProjectChatParticipants', 'canCreateProjectDirectChat', 'canUploadProjectChatAttachment', 'canViewProjectChatAttachments', 'canDeleteAnyProjectChatMessage',
            ],
            // General Chat (direct/group messaging, not tied to a project) —
            // PM is one of the cross-department roles expected to use it.
            'account' => ['canUseGeneralChat'],
        ],
        // pm_view + pm_manage_tasks + pm_manage_production + pm_manage_deliverables + pm_manage_files + pm_manage_comments + pm_manage_chat
        'production' => [ // "Production User"
            'project_management' => [
                'canViewProjectDashboard', 'canViewProjects', 'canViewLinkedProjects',
                'canViewTasks', 'canCreateTasks', 'canCreateLinkedProjectTask', 'canEditTasks', 'canAssignTasks', 'canMarkTaskBlocked',
                'canViewProductionQueue', 'canAssignProductionTasks', 'canStartProductionTasks', 'canSubmitProductionTasks',
                'canViewDeliverables', 'canUploadDeliverables', 'canVerifyDeliverables', 'canApproveDeliverables', 'canCreateRevisions', 'canResolveRevisions',
                'canUploadProjectAttachments', 'canViewProjectAttachments', 'canDownloadProjectAttachments', 'canUploadTaskAttachments', 'canViewTaskAttachments', 'canDownloadTaskAttachments',
                'canAddClientFacingComment',
                'canViewProjectChat', 'canSendProjectChatMessage', 'canCreateProjectDirectChat', 'canUploadProjectChatAttachment', 'canViewProjectChatAttachments',
            ],
        ],
        'developer' => [
            'project_management' => [
                'canViewProjectDashboard', 'canViewProjects', 'canViewLinkedProjects',
                'canViewTasks', 'canCreateTasks', 'canCreateLinkedProjectTask', 'canEditTasks', 'canAssignTasks', 'canMarkTaskBlocked',
                'canViewProductionQueue', 'canAssignProductionTasks', 'canStartProductionTasks', 'canSubmitProductionTasks',
                'canViewDeliverables', 'canUploadDeliverables', 'canVerifyDeliverables', 'canApproveDeliverables', 'canCreateRevisions', 'canResolveRevisions',
                'canUploadProjectAttachments', 'canViewProjectAttachments', 'canDownloadProjectAttachments', 'canUploadTaskAttachments', 'canViewTaskAttachments', 'canDownloadTaskAttachments',
                'canAddClientFacingComment',
                'canViewProjectChat', 'canSendProjectChatMessage', 'canCreateProjectDirectChat', 'canUploadProjectChatAttachment', 'canViewProjectChatAttachments',
            ],
        ],
        'designer' => [
            'project_management' => [
                'canViewProjectDashboard', 'canViewProjects', 'canViewLinkedProjects',
                'canViewTasks', 'canCreateTasks', 'canCreateLinkedProjectTask', 'canEditTasks', 'canAssignTasks', 'canMarkTaskBlocked',
                'canViewProductionQueue', 'canAssignProductionTasks', 'canStartProductionTasks', 'canSubmitProductionTasks',
                'canViewDeliverables', 'canUploadDeliverables', 'canVerifyDeliverables', 'canApproveDeliverables', 'canCreateRevisions', 'canResolveRevisions',
                'canUploadProjectAttachments', 'canViewProjectAttachments', 'canDownloadProjectAttachments', 'canUploadTaskAttachments', 'canViewTaskAttachments', 'canDownloadTaskAttachments',
                'canAddClientFacingComment',
                'canViewProjectChat', 'canSendProjectChatMessage', 'canCreateProjectDirectChat', 'canUploadProjectChatAttachment', 'canViewProjectChatAttachments',
            ],
        ],
        // pm_view + pm_manage_tasks + pm_manage_deliverables + pm_manage_files + pm_manage_comments + pm_manage_chat (no Production)
        'qa' => [
            'project_management' => [
                'canViewProjectDashboard', 'canViewProjects', 'canViewLinkedProjects',
                'canViewTasks', 'canCreateTasks', 'canCreateLinkedProjectTask', 'canEditTasks', 'canAssignTasks', 'canMarkTaskBlocked',
                'canViewDeliverables', 'canUploadDeliverables', 'canVerifyDeliverables', 'canApproveDeliverables', 'canCreateRevisions', 'canResolveRevisions',
                'canUploadProjectAttachments', 'canViewProjectAttachments', 'canDownloadProjectAttachments', 'canUploadTaskAttachments', 'canViewTaskAttachments', 'canDownloadTaskAttachments',
                'canAddClientFacingComment',
                'canViewProjectChat', 'canSendProjectChatMessage', 'canCreateProjectDirectChat', 'canUploadProjectChatAttachment', 'canViewProjectChatAttachments',
            ],
        ],
        // pm_view + pm_manage_tasks + pm_manage_files + pm_manage_comments + pm_manage_chat (no Production, no Deliverables/QA)
        'team_member' => [
            'project_management' => [
                'canViewProjectDashboard', 'canViewProjects', 'canViewLinkedProjects',
                'canViewTasks', 'canCreateTasks', 'canCreateLinkedProjectTask', 'canEditTasks', 'canAssignTasks', 'canMarkTaskBlocked',
                'canUploadProjectAttachments', 'canViewProjectAttachments', 'canDownloadProjectAttachments', 'canUploadTaskAttachments', 'canViewTaskAttachments', 'canDownloadTaskAttachments',
                'canAddClientFacingComment',
                'canViewProjectChat', 'canSendProjectChatMessage', 'canCreateProjectDirectChat', 'canUploadProjectChatAttachment', 'canViewProjectChatAttachments',
            ],
        ],
        // Sellers only ever see/act on projects they're linked to, and only
        // chat once someone adds them to a thread — no general Task/
        // Production/Deliverables management, no self-initiated direct chat,
        // no full project attachment access (that flat, untiered file list
        // would otherwise expose internal project files to a Seller).
        'seller' => [
            'sales' => [
                // canTransferLeads is deliberately NOT granted — a Seller
                // works their own leads only; transferring a lead to another
                // Seller is a Lead Manager/Company Admin action.
                'canViewSalesDashboard', 'canViewLeads', 'canCreateLeads', 'canEditLeads',
                'canManagePipeline', 'canAddLeadNotes', 'canViewSalesTargets', 'canViewSalesReports',
                'canUseSalesChat',
                // Basic client access is bundled with Sales (see
                // ModuleCatalog) so a Seller can pick a client when invoicing
                // from Sales/Client detail pages without buying the full
                // Client module — without these a Seller's invoice-create
                // "Select Client" list is always empty even after Company
                // Admin adds a client, which looks like a bug but was a
                // missing default grant.
                'canViewClients', 'canCreateClients', 'canEditClients',
            ],
            // canEnableClientPortal/canDisableClientPortal validate only
            // against the 'client' catalog module (ModuleCatalog.php), not
            // 'sales' — they used to live inside the 'sales' array above,
            // which meant RoleDefaultPermissions::forRole()'s own per-bucket
            // isValidPermission() check silently dropped both keys from
            // every "auto-select Seller defaults" computation (verified via
            // tinker). Moved to their own bucket so a Seller actually gets
            // to set up/revoke their own client's portal login by default,
            // once the Client module is active for the company.
            'client' => [
                'canEnableClientPortal', 'canDisableClientPortal',
            ],
            'invoice' => [
                'canCreateInvoices', 'canSendInvoices', 'canViewInvoices',
            ],
            // Seller can only ever share a comment/chat thread with Company
            // Admin or this project's PM — never the wider team.
            // canCreateProjectDirectChat IS granted — createDirect() hard-
            // restricts a Seller's target to Company Admin/PM only.
            // canCreateLinkedProjectTask is deliberately NOT granted — the
            // Task feature (viewing or submitting one) is retired for this
            // role entirely; Api\User\TaskController's index()/indexAll()/
            // store()/update()/activity() all hard-block role_type='seller'
            // regardless of this or any other permission a Company Admin
            // might still hold/grant.
            'project_management' => [
                'canViewProjectDashboard', 'canViewProjects', 'canViewLinkedProjects',
                'canCreateProjectHandoff',
                'canRequestPMAssignment',
                'canAddClientFacingComment',
                'canViewProjectChat', 'canSendProjectChatMessage', 'canCreateProjectDirectChat',
                'canUploadProjectChatAttachment', 'canViewProjectChatAttachments',
                // canManageProjectChatParticipants/canAddSellerToProjectChat are
                // inert no-ops for a Seller — Api\User\ProjectMessengerController::
                // isPM() hard-blocks role_type='seller' regardless of this grant.
                // Included only so the "Manage Project Chat Participants"/"Add
                // Seller To Project Chat" checkboxes show checked; grants nothing.
                'canManageProjectChatParticipants', 'canAddSellerToProjectChat',
                // canEditProjects/canCompleteProjects/canCloseProjects/
                // canReopenProjects ARE functional for a Seller —
                // visibleProjects()/ProjectController scope includes
                // seller_id match, so these apply to a Seller's own linked/
                // handed-off project. canCreateProjects is NOT included here —
                // store() hard-blocks role_type='seller' from the unrestricted
                // create path; canCreateProjectHandoff above is the real
                // Seller-tier equivalent. canManageProjectInvoices is
                // deliberately EXCLUDED — billing/invoice data on a project
                // is Company Admin/PM only, never Seller or any other team
                // role (2026-08-11 policy: "Manage Projects" bundle checkbox
                // no longer shows fully checked for Seller as a result, and
                // that's intentional — correctness over cosmetic completeness).
                'canEditProjects', 'canCompleteProjects', 'canCloseProjects', 'canReopenProjects',
                // canCreateProjects: cosmetic-only completion of the "Manage
                // Projects" bundle — store() excludes role_type='seller' from
                // this path regardless (see above), so it grants nothing beyond
                // what canCreateProjectHandoff already does.
                'canCreateProjects',
                // "Manage Project Files" bundle. canUploadProjectAttachments IS
                // functional (ProjectAttachmentController::visibleProject() now
                // includes a seller_id match). canViewProjectAttachments/
                // canDownloadProjectAttachments are cosmetic-only — index()/
                // download() branch to the seller-only "visible to client"
                // subset unconditionally, before this permission is ever
                // checked. canUploadTaskAttachments/canViewTaskAttachments/
                // canDownloadTaskAttachments are also cosmetic-only — the Task
                // feature itself is entirely blocked for role_type='seller'
                // (TaskController), so there's never a task to attach to.
                'canUploadProjectAttachments', 'canViewProjectAttachments', 'canDownloadProjectAttachments',
                'canUploadTaskAttachments', 'canViewTaskAttachments', 'canDownloadTaskAttachments',
            ],
            // General Chat — Seller is one of the spec's named General Chat roles.
            'account' => ['canUseGeneralChat'],
        ],
        // Lead Manager — manages leads and assigns/transfers them to
        // Sellers, company-wide (canViewAllCompanyLeads), but never gets
        // full Company Admin access: no user/settings/payment-gateway
        // management, no lead deletion, no invoice creation/sending, unless
        // a Company Admin manually grants those on top (see
        // Api\User\LeadController::assignableSeller() for the backend-
        // enforced "same company, active, role_type=seller" rule on WHO a
        // lead can be assigned/transferred to — independent of this
        // permission set). canManagePipeline already covers marking a lead
        // Won/Lost (LeadController::updateStatus()), and
        // canViewSalesDashboard + canViewAllCompanyLeads together already
        // surface the per-seller performance breakdown
        // (Api\User\SalesDashboardController::index()'s 'sellers' block) —
        // neither needs its own dedicated permission key.
        'lead_manager' => [
            'sales' => [
                'canViewSalesDashboard', 'canViewLeads', 'canViewAllCompanyLeads',
                'canCreateLeads', 'canEditLeads', 'canAssignLeadOwner', 'canTransferLeads',
                'canManagePipeline', 'canAddLeadNotes', 'canViewSalesReports',
            ],
            // Optional, and only actually granted if the company has
            // purchased the invoice module (forRole() below filters by
            // $purchasedCatalogModules) — view-only, deliberately without
            // canCreateInvoices/canSendInvoices.
            'invoice' => ['canViewInvoices', 'canViewPayments'],
            'account' => ['canUseGeneralChat'],
        ],
        'invoice_user' => [
            'invoice' => [
                'canViewInvoices', 'canCreateInvoices', 'canEditInvoices', 'canSendInvoices',
                'canViewPayments', 'canSendPaymentReminders', 'canSelectInvoiceGateway',
            ],
        ],
        'hr' => [ // "HR User"
            'hr' => [
                'canViewHRDashboard', 'canViewEmployees', 'canCreateEmployees', 'canEditEmployees',
                'canViewLeave', 'canApproveLeave', 'canViewPayroll', 'canViewHRReports',
            ],
            'account' => ['canUseGeneralChat'],
        ],
        'finance' => [ // "Finance User"
            'finance' => [
                'canViewFinanceDashboard', 'canViewRevenueDashboard', 'canViewPayments',
                'canViewFinanceReports', 'canExportFinanceReports', 'canViewFinanceInvoices',
                'canViewPaymentDetails',
            ],
            'account' => ['canUseGeneralChat'],
        ],
        'compliance' => [ // "Compliance User"
            'compliance' => [
                'canViewComplianceDashboard', 'canViewPolicies', 'canCreatePolicies', 'canEditPolicies',
                'canViewAuditTrails', 'canViewComplianceReports',
            ],
            'account' => ['canUseGeneralChat'],
        ],
    ];

    /**
     * @param string $role One of USER_ROLES.
     * @param string[] $purchasedCatalogModules Catalog module keys the company has active
     *                 (e.g. ['sales', 'invoice', 'project_management'] — already
     *                 resolved via ModuleCatalog::dbKeyToCatalog(), not raw DB keys).
     * @return array<string, string[]> catalogModuleKey => permission keys
     */
    public static function forRole(string $role, array $purchasedCatalogModules): array
    {
        if ($role === 'company_admin') {
            return self::allPermissionsForModules(array_merge($purchasedCatalogModules, ['account']));
        }

        if ($role === 'viewer') {
            return self::viewOnlyForModules($purchasedCatalogModules);
        }

        $raw = self::MAP[$role] ?? [];
        $filtered = [];
        // 'account' (e.g. canUseGeneralChat) is never a purchased DB module —
        // always considered available here too, same reasoning as the
        // company_admin branch above.
        $availableModules = array_merge($purchasedCatalogModules, ['account']);

        foreach ($raw as $moduleKey => $permKeys) {
            if (!in_array($moduleKey, $availableModules, true)) continue;
            // Defensive: only ever return keys that really exist in the catalog today.
            $valid = array_values(array_filter(
                $permKeys,
                fn ($p) => ModuleCatalog::isValidPermission($moduleKey, $p)
            ));
            if (!empty($valid)) $filtered[$moduleKey] = $valid;
        }

        return $filtered;
    }

    private static function allPermissionsForModules(array $moduleKeys): array
    {
        $catalog = ModuleCatalog::all();
        $out = [];
        foreach ($moduleKeys as $key) {
            if (isset($catalog[$key])) $out[$key] = $catalog[$key]['permissions'];
        }
        return $out;
    }

    private static function viewOnlyForModules(array $moduleKeys): array
    {
        $catalog = ModuleCatalog::all();
        $out = [];
        foreach ($moduleKeys as $key) {
            if (!isset($catalog[$key])) continue;
            $viewKeys = array_values(array_filter(
                $catalog[$key]['permissions'],
                fn ($p) => str_starts_with($p, 'canView')
            ));
            if (!empty($viewKeys)) $out[$key] = $viewKeys;
        }
        return $out;
    }

    // The 14 roles the Add/Edit User "Select Role" dropdown offers, in
    // display order. Legacy role_type values (invoice_admin, invoice_manager,
    // invoice_creator, invoice_viewer, payment_manager) still validate
    // (existing users keep them) but are no longer offered as new picks.
    public static function roleOptions(): array
    {
        return [
            ['value' => 'company_admin',    'label' => 'Company Admin'],
            ['value' => 'project_manager',  'label' => 'Project Manager'],
            ['value' => 'production',       'label' => 'Production User'],
            ['value' => 'developer',        'label' => 'Developer'],
            ['value' => 'designer',         'label' => 'Designer'],
            ['value' => 'qa',               'label' => 'QA'],
            ['value' => 'team_member',      'label' => 'Team Member'],
            ['value' => 'seller',           'label' => 'Seller'],
            ['value' => 'lead_manager',     'label' => 'Lead Manager'],
            ['value' => 'invoice_user',     'label' => 'Invoice User'],
            ['value' => 'hr',               'label' => 'HR User'],
            ['value' => 'finance',          'label' => 'Finance User'],
            ['value' => 'compliance',       'label' => 'Compliance User'],
            ['value' => 'viewer',           'label' => 'Viewer'],
        ];
    }
}
