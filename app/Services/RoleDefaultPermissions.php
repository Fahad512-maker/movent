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
            // + every "advanced" (collapsed-by-default) bundle item —
            // 2026-08-13: explicitly granted per Company Admin request,
            // overriding the prior "NOT included by default" convention for
            // canAssignProjectSeller/canActivateProjects/canForceCloseProjects.
            'project_management' => [
                'canViewProjectDashboard', 'canViewProjects', 'canViewLinkedProjects',
                'canCreateProjects', 'canCreateProjectHandoff', 'canManageProjectInvoices', 'canEditProjects', 'canCompleteProjects', 'canCloseProjects', 'canReopenProjects',
                'canViewTasks', 'canCreateTasks', 'canCreateLinkedProjectTask', 'canEditTasks', 'canAssignTasks', 'canMarkTaskBlocked',
                'canCompleteTasks', 'canReopenTasks', 'canOverrideTaskStatus',
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
                'canViewProjectChat', 'canSendProjectChatMessage', 'canUploadProjectChatAttachment', 'canViewProjectChatAttachments',
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
                'canViewProjectChat', 'canSendProjectChatMessage', 'canUploadProjectChatAttachment', 'canViewProjectChatAttachments',
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
                'canViewProjectChat', 'canSendProjectChatMessage', 'canUploadProjectChatAttachment', 'canViewProjectChatAttachments',
            ],
        ],
        // pm_view + pm_manage_tasks + pm_manage_deliverables + pm_manage_files + pm_manage_comments + pm_manage_chat (no Production)
        // + every "advanced" (collapsed-by-default) bundle item — 2026-08-13:
        // same explicit grant as project_manager above.
        'qa' => [
            'project_management' => [
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
        ],
        // pm_view + pm_manage_tasks + pm_manage_files + pm_manage_comments + pm_manage_chat (no Production, no Deliverables/QA)
        'team_member' => [
            'project_management' => [
                'canViewProjectDashboard', 'canViewProjects', 'canViewLinkedProjects',
                'canViewTasks', 'canCreateTasks', 'canCreateLinkedProjectTask', 'canEditTasks', 'canAssignTasks', 'canMarkTaskBlocked',
                'canUploadProjectAttachments', 'canViewProjectAttachments', 'canDownloadProjectAttachments', 'canUploadTaskAttachments', 'canViewTaskAttachments', 'canDownloadTaskAttachments',
                'canAddClientFacingComment',
                'canViewProjectChat', 'canSendProjectChatMessage', 'canUploadProjectChatAttachment', 'canViewProjectChatAttachments',
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
                'canViewSalesDashboard', 'canViewLeads', 'canCreateLeads', 'canEditLeads', 'canDeleteLeads',
                'canManagePipeline', 'canAddLeadNotes', 'canViewSalesTargets', 'canUpdateSalesTargets', 'canViewSalesReports',
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
            // canView/Create/EditClients are repeated here (already granted
            // above under 'sales') purely so the "Clients" tab's own
            // checkboxes show checked too — Add/Edit User's per-module UI
            // only reads a key under the module bucket it's rendered in.
            'client' => [
                'canEnableClientPortal', 'canDisableClientPortal',
                'canViewClients', 'canCreateClients', 'canEditClients',
                'canResetClientPassword', 'canViewClientPayments', 'canViewClientInvoices',
                'canManageClientDocuments', 'canViewClientDocuments',
            ],
            'invoice' => [
                'canCreateInvoices', 'canSendInvoices', 'canViewInvoices', 'canEditInvoices',
                'canDownloadOrExportInvoices', 'canViewPayments', 'canRecordPayments',
                'canSendPaymentReminders', 'canManageBillingClients', 'canViewInvoiceReports',
            ],
            // Seller can only ever share a comment/chat thread with Company
            // Admin or this project's PM — never the wider team. Project
            // chat is now the single project conversation, scoped by
            // participant rows.
            // canCreateLinkedProjectTask is deliberately NOT granted — the
            // Task feature (viewing or submitting one) is retired for this
            // role entirely; Api\User\TaskController's index()/indexAll()/
            // store()/update()/activity() all hard-block role_type='seller'
            // regardless of this or any other permission a Company Admin
            // might still hold/grant.
            'project_management' => [
                'canViewProjectDashboard', 'canViewProjects', 'canViewLinkedProjects',
                'canCreateProjectHandoff',
                'canViewTeamResources', 'canAssignTeamResources', 'canRequestPMAssignment',
                'canAddClientFacingComment',
                'canViewProjectChat', 'canSendProjectChatMessage',
                'canUploadProjectChatAttachment', 'canViewProjectChatAttachments',
                // canManageProjectInvoices — explicitly re-included per
                // 2026-08-13 request (supersedes the prior 2026-08-11
                // exclusion policy). Functional, not cosmetic: unlocks
                // ProjectController::linkInvoice()/unlinkInvoice()/
                // createInvoice() and the project billing summary for a
                // Seller's own linked/handed-off project.
                'canManageProjectInvoices',
                // canEditProjects/canCompleteProjects/canCloseProjects/
                // canReopenProjects ARE functional for a Seller —
                // visibleProjects()/ProjectController scope includes
                // seller_id match, so these apply to a Seller's own linked/
                // handed-off project.
                'canEditProjects', 'canCompleteProjects', 'canCloseProjects', 'canReopenProjects',
                // canCreateProjects — functional per 2026-08-15 request: a
                // Seller holding this now gets the same unrestricted
                // "+ New Project" path as PM/Manager tiers (store() no longer
                // hard-blocks role_type='seller' here). canCreateProjectHandoff
                // above remains the lead/invoice-gated alternative for a
                // Seller who should only create a project as a deal handoff.
                'canCreateProjects',
                // canActivateProjects — functional, not cosmetic: a draft
                // project auto-created from a client's payment
                // (PaymentProjectStartService) is most often the Seller's OWN
                // handed-off deal, and visibleProjects()'s seller_id match
                // already lets them see it — without this permission they
                // could see the draft but never activate it themselves,
                // needing Company Admin every time. Granted by default
                // alongside Admin per 2026-08-13 request.
                'canActivateProjects',
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
                // canAddSellerToProjectChat is functional (gates
                // ProjectMessengerController::addParticipants() adding
                // another Seller). canManageProjectChatParticipants is
                // cosmetic-only for this role — canManageParticipants()
                // hard-blocks role_type='seller' before this permission is
                // ever checked; kept here only so the checkbox shows checked
                // per explicit request.
                'canAddSellerToProjectChat',
                'canManageProjectChatParticipants',
            ],
            // General Chat — Seller is one of the spec's named General Chat roles.
            'account' => ['canUseGeneralChat'],
        ],
        // Lead Manager — manages leads and assigns/transfers them to
        // Sellers, company-wide (canViewAllCompanyLeads), but never gets
        // full Company Admin access: no user/settings/payment-gateway
        // management, unless a Company Admin manually grants those on top
        // (see Api\User\LeadController::assignableSeller() for the backend-
        // enforced "same company, active, role_type=seller" rule on WHO a
        // lead can be assigned/transferred to — independent of this
        // permission set). canManagePipeline already covers marking a lead
        // Won/Lost (LeadController::updateStatus()), and
        // canViewSalesDashboard + canViewAllCompanyLeads together already
        // surface the per-seller performance breakdown
        // (Api\User\SalesDashboardController::index()'s 'sellers' block) —
        // neither needs its own dedicated permission key.
        //
        // 2026-08-13: given the same Client/Sales/Invoice/Project Management
        // bundle as Seller (see the 'seller' entry above), PLUS the extra
        // company-wide/lead-ownership keys (canViewAllCompanyLeads,
        // canAssignLeadOwner, canTransferLeads, canDeleteLeads) a Seller
        // deliberately doesn't get — Lead Manager sits a tier above Seller,
        // not beside it. This supersedes the older "no lead deletion, no
        // invoice creation/sending" restriction.
        'lead_manager' => [
            'sales' => [
                'canViewSalesDashboard', 'canViewLeads', 'canViewAllCompanyLeads',
                'canCreateLeads', 'canEditLeads', 'canDeleteLeads', 'canAssignLeadOwner', 'canTransferLeads',
                'canManagePipeline', 'canAddLeadNotes', 'canViewSalesTargets', 'canUpdateSalesTargets', 'canViewSalesReports',
                'canViewClients', 'canCreateClients', 'canEditClients',
            ],
            'client' => [
                'canEnableClientPortal', 'canDisableClientPortal',
                'canViewClients', 'canCreateClients', 'canEditClients',
                'canResetClientPassword', 'canViewClientPayments', 'canViewClientInvoices',
                'canManageClientDocuments', 'canViewClientDocuments',
            ],
            // Only actually granted if the company has purchased the
            // invoice module (forRole() below filters by
            // $purchasedCatalogModules).
            'invoice' => [
                'canCreateInvoices', 'canSendInvoices', 'canViewInvoices', 'canEditInvoices',
                'canDownloadOrExportInvoices', 'canViewPayments', 'canRecordPayments',
                'canSendPaymentReminders', 'canManageBillingClients', 'canViewInvoiceReports',
            ],
            // Same Seller-tier project bundle as the 'seller' entry above —
            // see its comments for which of these are functional vs.
            // cosmetic-only. Several (canEditProjects/canCompleteProjects/
            // etc.) key off a project's seller_id match, which Lead Manager
            // won't normally have, so those are cosmetic here unless this
            // Lead Manager is also set as a project's seller/PM.
            'project_management' => [
                'canViewProjectDashboard', 'canViewProjects', 'canViewLinkedProjects',
                'canCreateProjectHandoff',
                // canViewTeamResources/canAssignTeamResources — 2026-08-14
                // request: Lead Manager needs the "assign project"
                // (Team/Resources page's Add Team Member) option, same as
                // Seller already has above. Without these, canRequestPMAssignment
                // only ever let them name a PM at handoff-creation time —
                // nothing let them staff/reassign a project's team afterward.
                'canViewTeamResources', 'canAssignTeamResources', 'canRequestPMAssignment',
                'canAddClientFacingComment',
                'canViewProjectChat', 'canSendProjectChatMessage',
                'canUploadProjectChatAttachment', 'canViewProjectChatAttachments',
                'canManageProjectInvoices',
                'canEditProjects', 'canCompleteProjects', 'canCloseProjects', 'canReopenProjects',
                'canCreateProjects',
                // Mirrors the 'seller' entry's own canActivateProjects grant —
                // same "cosmetic unless also this project's seller/PM" caveat
                // as the block comment above.
                'canActivateProjects',
                'canUploadProjectAttachments', 'canViewProjectAttachments', 'canDownloadProjectAttachments',
                'canUploadTaskAttachments', 'canViewTaskAttachments', 'canDownloadTaskAttachments',
                'canAddSellerToProjectChat',
                'canManageProjectChatParticipants',
                // Company-wide project oversight — 2026-08-14 request: Lead
                // Manager already gets canViewAllCompanyLeads (company-wide,
                // not scoped to specific sellers — there's no "which sellers
                // does this Lead Manager manage" relationship in the data
                // model), so mirroring that with company-wide PROJECT
                // visibility is what actually lets them see and manage every
                // Seller's assigned/created projects, not just their own.
                // Same grant project_manager/qa already got per the
                // 2026-08-13 entries above. Doesn't expose budget — index()
                // hides that field unconditionally regardless of this
                // permission.
                'canViewAllCompanyProjects', 'canViewClosedProjects',
            ],
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
