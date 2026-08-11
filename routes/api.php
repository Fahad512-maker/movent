<?php

use App\Http\Controllers\Api\Admin\ClientController as AdminClientController;
use App\Http\Controllers\Api\Admin\NotificationController as AdminNotificationController;
use App\Http\Controllers\Api\Admin\DashboardController as AdminDashboardController;
use App\Http\Controllers\Api\Admin\ReportController as AdminReportController;
use App\Http\Controllers\Api\Admin\InvoiceController as AdminInvoiceController;
use App\Http\Controllers\Api\Admin\FollowUpController as AdminFollowUpController;
use App\Http\Controllers\Api\Admin\LeadController as AdminLeadController;
use App\Http\Controllers\Api\Admin\SalesDashboardController as AdminSalesDashboardController;
use App\Http\Controllers\Api\Admin\PaymentController as AdminPaymentController;
use App\Http\Controllers\Api\Admin\ProjectController as AdminProjectController;
use App\Http\Controllers\Api\Admin\TaskController as AdminTaskController;
use App\Http\Controllers\Api\Admin\TimesheetController as AdminTimesheetController;
use App\Http\Controllers\Api\Admin\ProjectDocumentController as AdminProjectDocumentController;
use App\Http\Controllers\Api\Admin\SupportController as AdminSupportController;
use App\Http\Controllers\Api\User\SupportController as UserSupportController;
use App\Http\Controllers\Api\Admin\ProjectAttachmentController as AdminProjectAttachmentController;
use App\Http\Controllers\Api\Admin\TaskAttachmentController as AdminTaskAttachmentController;
use App\Http\Controllers\Api\Admin\ProjectChatController as AdminProjectChatController;
use App\Http\Controllers\Api\Admin\ProjectMessengerController as AdminProjectMessengerController;
use App\Http\Controllers\Api\Admin\SalesChatController as AdminSalesChatController;
use App\Http\Controllers\Api\Admin\GeneralChatController as AdminGeneralChatController;
use App\Http\Controllers\Api\Admin\ProfileController as AdminProfileController;
use App\Http\Controllers\Api\Admin\ProjectCommentController as AdminProjectCommentController;
use App\Http\Controllers\Api\Admin\ProjectCommentAttachmentController as AdminProjectCommentAttachmentController;
use App\Http\Controllers\Api\Admin\ProjectReportController as AdminProjectReportController;
use App\Http\Controllers\Api\Admin\ProductionController as AdminProductionController;
use App\Http\Controllers\Api\Admin\ModulePurchaseController as AdminModulePurchaseController;
use App\Http\Controllers\Api\Admin\SeatPurchaseController as AdminSeatPurchaseController;
use App\Http\Controllers\Api\Admin\SettingsController as AdminSettingsController;
use App\Http\Controllers\Api\Admin\SubscriptionPaymentController;
use App\Http\Controllers\Api\Admin\UserController as AdminUserController;
use App\Http\Controllers\Api\Admin\EmployeeController as AdminEmployeeController;
use App\Http\Controllers\Api\Admin\AttendanceController as AdminAttendanceController;
use App\Http\Controllers\Api\Admin\LeaveController as AdminLeaveController;
use App\Http\Controllers\Api\Admin\PayrollController as AdminPayrollController;
use App\Http\Controllers\Api\Admin\RecruitmentController as AdminRecruitmentController;
use App\Http\Controllers\Api\Admin\HrDashboardController as AdminHrDashboardController;
use App\Http\Controllers\Api\Admin\HrReportController as AdminHrReportController;
use App\Http\Controllers\Auth\AdminAuthController;
use App\Http\Controllers\Auth\AdminForgotPasswordController;
use App\Http\Controllers\Auth\AdminGoogleAuthController;
use App\Http\Controllers\Auth\ForgotPasswordController;
use App\Http\Controllers\Auth\GoogleAuthController;
use App\Http\Controllers\Auth\UserAuthController;
use App\Http\Controllers\Api\Auth\SuperAdminAuthController;
use App\Http\Controllers\Api\InviteController;
use App\Http\Controllers\Api\User\ClientController as UserClientController;
use App\Http\Controllers\Api\User\InvoiceController as UserInvoiceController;
use App\Http\Controllers\Api\User\LeadController as UserLeadController;
use App\Http\Controllers\Api\User\SalesDashboardController as UserSalesDashboardController;
use App\Http\Controllers\Api\User\SalesReportController as UserSalesReportController;
use App\Http\Controllers\Api\User\SalesTargetController as UserSalesTargetController;
use App\Http\Controllers\Api\User\FollowUpController as UserFollowUpController;
use App\Http\Controllers\Api\User\ProjectController as UserProjectController;
use App\Http\Controllers\Api\User\ProjectReportController as UserProjectReportController;
use App\Http\Controllers\Api\User\TaskController as UserTaskController;
use App\Http\Controllers\Api\User\TimesheetController as UserTimesheetController;
use App\Http\Controllers\Api\User\ProjectChatController as UserProjectChatController;
use App\Http\Controllers\Api\User\ProjectMessengerController as UserProjectMessengerController;
use App\Http\Controllers\Api\User\SalesChatController as UserSalesChatController;
use App\Http\Controllers\Api\User\GeneralChatController as UserGeneralChatController;
use App\Http\Controllers\Api\User\ProfileController as UserProfileController;
use App\Http\Controllers\Api\User\ProjectAttachmentController as UserProjectAttachmentController;
use App\Http\Controllers\Api\User\TaskAttachmentController as UserTaskAttachmentController;
use App\Http\Controllers\Api\User\ProductionController as UserProductionController;
use App\Http\Controllers\Api\User\UserManagementController;
use App\Http\Controllers\Api\User\ProjectCommentController as UserProjectCommentController;
use App\Http\Controllers\Api\User\ProjectCommentAttachmentController as UserProjectCommentAttachmentController;
use App\Http\Controllers\Api\User\NotificationController as UserNotificationController;
use App\Http\Controllers\Api\PublicController;
use App\Http\Controllers\Api\PublicInvoiceController;
use App\Http\Controllers\Api\SuperAdmin\CompanyAdminController;
use App\Http\Controllers\Api\SuperAdmin\CompanyController;
use App\Http\Controllers\Api\SuperAdmin\DashboardController;
use App\Http\Controllers\Api\SuperAdmin\ModuleController;
use App\Http\Controllers\Api\SuperAdmin\PackageController;
use App\Http\Controllers\Api\SuperAdmin\PaymentGatewayController;
use Illuminate\Support\Facades\Route;

// TEMPORARY — no-SSH deploy helper. Visit once after uploading .env with the
// correct DB credentials, then DELETE this route. Guarded by a random secret
// so it can't be triggered by guessing the URL. Lives under /api/ (not
// web.php) because this host's proxy only forwards /public/api/* to Laravel.
Route::get('deploy-setup-5f19514504e41e83c743', function () {
    if (request('key') !== '5f19514504e41e83c743eb8e580a121dae3ada538e1f7395') {
        abort(403);
    }

    $output = '';

    // PHP's opcache caches compiled bytecode of bootstrap/cache/*.php across
    // requests, independent of whether the file on disk has been deleted or
    // rewritten — on hosts where opcache.validate_timestamps is off (common
    // in production-tuned php.ini), deleting/regenerating the cache file
    // below has no effect on what's actually served until opcache itself is
    // told to drop it. This must run before anything else touches config.
    if (function_exists('opcache_reset')) {
        opcache_reset();
        $output .= "opcache_reset()\n\n";
    }

    // If bootstrap/cache/config.php already existed (e.g. baked in before the
    // real .env was uploaded, or left over from a previous deploy), THIS
    // request already booted with those stale values — Artisan::call('config:clear')
    // below only deletes the file for the NEXT request, which is why the very
    // first run of this endpoint fails with the old/default DB credentials
    // and a plain reload then succeeds. Force a fresh .env read and re-point
    // the mysql connection at it right now, before migrate touches the
    // database, so this endpoint is correct on the very first hit.
    $cachedConfig = base_path('bootstrap/cache/config.php');
    if (is_file($cachedConfig)) {
        @unlink($cachedConfig);
    }
    if (is_file(base_path('.env'))) {
        \Dotenv\Dotenv::createMutable(base_path())->load();
        config([
            'database.connections.mysql.host'     => env('DB_HOST', '127.0.0.1'),
            'database.connections.mysql.port'     => env('DB_PORT', '3306'),
            'database.connections.mysql.database' => env('DB_DATABASE'),
            'database.connections.mysql.username' => env('DB_USERNAME'),
            'database.connections.mysql.password' => env('DB_PASSWORD'),
        ]);
        \Illuminate\Support\Facades\DB::purge('mysql');
        $output .= "reloaded .env and reconnected to database\n\n";
    }

    \Illuminate\Support\Facades\Artisan::call('config:clear');
    $output .= "config:clear\n" . \Illuminate\Support\Facades\Artisan::output() . "\n";

    \Illuminate\Support\Facades\Artisan::call('route:clear');
    $output .= "route:clear\n" . \Illuminate\Support\Facades\Artisan::output() . "\n";

    \Illuminate\Support\Facades\Artisan::call('migrate', ['--force' => true]);
    $output .= "migrate --force\n" . \Illuminate\Support\Facades\Artisan::output() . "\n";

    \Illuminate\Support\Facades\Artisan::call('config:cache');
    $output .= "config:cache\n" . \Illuminate\Support\Facades\Artisan::output() . "\n";

    \Illuminate\Support\Facades\Artisan::call('route:cache');
    $output .= "route:cache\n" . \Illuminate\Support\Facades\Artisan::output() . "\n";

    // Reset again so the freshly regenerated cache files are compiled fresh
    // on the very next request too, instead of opcache re-serving whatever
    // (possibly still stale) bytecode it holds for those same file paths.
    if (function_exists('opcache_reset')) {
        opcache_reset();
        $output .= "opcache_reset() (post-cache)\n";
    }

    return response('<pre>' . htmlspecialchars($output) . '</pre>');
});

/*
|--------------------------------------------------------------------------
| Public Routes  (no auth required)
|--------------------------------------------------------------------------
*/
Route::prefix('public')->group(function () {
    Route::get('packages',          [PublicController::class, 'packages']);
    Route::get('modules',           [PublicController::class, 'modules']);
    Route::post('check-email',      [PublicController::class, 'checkEmail']);
    Route::post('check-company-name', [PublicController::class, 'checkCompanyName']);
    Route::post('register',         [PublicController::class, 'register']);
    Route::get('payment-gateways',  [PublicController::class, 'activeGateways']);

    // "Complete Payment" link on the admin login screen — for an account
    // stuck in pending_payment (blocked from AdminAuthController::login()),
    // this re-verifies credentials and issues a token that can only reach
    // the subscription-payment endpoints (see 'subscription.active' middleware).
    Route::post('resume-payment',   [PublicController::class, 'resumePayment']);

    // Public invoice payment (token-based, no auth)
    Route::get('invoices/{token}',      [PublicInvoiceController::class, 'show']);
    Route::post('invoices/{token}/pay', [PublicInvoiceController::class, 'pay']);

    // Real gateway checkout (Stripe/PayPal/Authorize.net hosted pages) —
    // finalization itself happens via the gateway's webhook, not here.
    // Superseded by the inline endpoints below for the public pay page's own
    // UI, but left registered/untouched for any other consumer.
    Route::post('invoices/{token}/gateways/{gateway}/initiate', [PublicInvoiceController::class, 'initiate']);
    Route::get('invoices/{token}/return/{gateway}',             [PublicInvoiceController::class, 'returnFromGateway']);

    // Inline gateway payment (Stripe Elements / PayPal Buttons / Authorize.net
    // Accept.js, all mounted directly on the pay page) — charged and finalized
    // synchronously within chargeGateway()'s own request, no webhook involved.
    Route::get('invoices/{token}/gateways/{gateway}/init',       [PublicInvoiceController::class, 'initGateway']);
    Route::post('invoices/{token}/gateways/paypal/create-order', [PublicInvoiceController::class, 'createPaypalOrder']);
    Route::post('invoices/{token}/gateways/{gateway}/charge',    [PublicInvoiceController::class, 'chargeGateway']);
});

// Invite accept (no auth — accessed via token link)
Route::get('invite/{token}',  [InviteController::class, 'show']);
Route::post('invite/{token}', [InviteController::class, 'accept']);

// Payment gateway webhooks (Stripe/PayPal/Authorize.net call these directly,
// no auth — each request is verified by gateway-specific signature checking,
// see Api\Webhooks\PaymentWebhookController). {company_admin_id} identifies
// which tenant's credentials to verify against; each Company Admin registers
// their own webhook URL (with their own id) against their own gateway account.
// The optional {companyGatewayId} segment disambiguates when a tenant has
// more than one account of the same gateway type — omitted, it resolves to
// that type's default account (kept working for URLs registered before
// multi-account support existed).
Route::post('webhooks/{gateway}/{companyAdminId}', [\App\Http\Controllers\Api\Webhooks\PaymentWebhookController::class, 'handle']);
Route::post('webhooks/{gateway}/{companyAdminId}/{companyGatewayId}', [\App\Http\Controllers\Api\Webhooks\PaymentWebhookController::class, 'handle']);

// Unified login — the /login frontend page's single form for both Company
// Admin and staff/sub-users. Tries CompanyAdmin credentials, then User
// credentials (see UnifiedLoginController); never touches Super Admin.
Route::post('login', [\App\Http\Controllers\Auth\UnifiedLoginController::class, 'login']);

// Unified "send me a reset link" — same admin-first precedence as the login
// route above. The actual reset step stays on the tier-specific
// /admin/reset-password or /reset-password page, since the emailed link
// itself already encodes which one to use.
Route::post('forgot-password', [\App\Http\Controllers\Auth\UnifiedForgotPasswordController::class, 'sendResetLink']);

/*
|--------------------------------------------------------------------------
| Admin Auth Routes  (guard: admin → CompanyAdmin model)
|--------------------------------------------------------------------------
*/
Route::prefix('admin')->group(function () {
    Route::post('login', [AdminAuthController::class, 'login']);
    Route::post('forgot-password', [AdminForgotPasswordController::class, 'sendResetLink']);
    Route::post('reset-password',  [AdminForgotPasswordController::class, 'reset']);

    // Google OAuth (Company Admin login only) — unauthenticated by design.
    Route::get('auth/google/redirect',  [AdminGoogleAuthController::class, 'redirect']);
    Route::get('auth/google/callback',  [AdminGoogleAuthController::class, 'callback']);
    Route::post('auth/google/exchange', [AdminGoogleAuthController::class, 'exchange']);

    // 'subscription.active' blocks every route below for a still-pending_payment
    // admin, EXCEPT the ones explicitly marked ->withoutMiddleware(...) further
    // down (logout, me, and the subscription-payment endpoints themselves) —
    // that's the only way such an admin can ever resolve out of this state.
    Route::middleware(['auth:admin', 'subscription.active'])->group(function () {
        Route::post('logout', [AdminAuthController::class, 'logout'])->withoutMiddleware(\App\Http\Middleware\EnsureSubscriptionActive::class);
        Route::get('me',     [AdminAuthController::class, 'me'])->withoutMiddleware(\App\Http\Middleware\EnsureSubscriptionActive::class);

        // My Profile — this admin's own name/phone/avatar/password, distinct
        // from the tenant-wide business Settings (Api\Admin\SettingsController).
        Route::get('profile',            [AdminProfileController::class, 'show']);
        Route::put('profile',            [AdminProfileController::class, 'update']);
        Route::post('profile/avatar',    [AdminProfileController::class, 'uploadAvatar']);
        Route::put('profile/password',   [AdminProfileController::class, 'changePassword']);

        // Notifications — merges the company-wide SystemAuditLog-based
        // activity feed with real `notifications` rows (recipient_admin_id)
        // written via NotificationService for specific events (task blocked,
        // deliverable submitted, invoice paid, etc.) — see NotificationController.
        Route::get('notifications',                    [AdminNotificationController::class, 'index']);
        Route::get('notifications/unread-counts',      [AdminNotificationController::class, 'unreadCounts']);
        Route::patch('notifications/mark-category-read', [AdminNotificationController::class, 'markCategoryRead']);
        Route::patch('notifications/read-all',         [AdminNotificationController::class, 'markAllRead']);
        Route::patch('notifications/{id}/read',        [AdminNotificationController::class, 'markRead']);
        Route::delete('notifications/{id}',            [AdminNotificationController::class, 'clear']);
        Route::delete('notifications',                 [AdminNotificationController::class, 'clearAll']);

        // General Chat — company-wide oversight of every direct/group thread
        // (not module-gated, same reasoning as the User side).
        Route::get('chat',                                [AdminGeneralChatController::class, 'index']);
        Route::get('chat/eligible-users',                 [AdminGeneralChatController::class, 'eligibleUsers']);
        Route::post('chat/direct',                        [AdminGeneralChatController::class, 'createDirect']);
        Route::post('chat/group',                         [AdminGeneralChatController::class, 'createGroup']);
        Route::delete('chat/{threadId}/participants/{userId}', [AdminGeneralChatController::class, 'removeParticipant']);
        Route::get('chat/{threadId}/messages',            [AdminGeneralChatController::class, 'messages']);
        Route::post('chat/{threadId}/messages',           [AdminGeneralChatController::class, 'send']);
        Route::patch('chat/{threadId}/messages/{messageId}', [AdminGeneralChatController::class, 'updateMessage']);
        Route::delete('chat/{threadId}/messages/{messageId}', [AdminGeneralChatController::class, 'deleteMessage']);
        Route::get('chat/{threadId}/messages/{messageId}/attachment', [AdminGeneralChatController::class, 'downloadAttachment']);

        Route::get('dashboard',                          [AdminDashboardController::class, 'index']);

        // Admin's own companies list + create + edit
        Route::get('companies',                          [AdminClientController::class, 'companies']);
        Route::post('companies',                         [AdminClientController::class, 'storeCompany']);
        Route::get('companies/{id}',                     [AdminClientController::class, 'showCompany']);
        Route::put('companies/{id}',                     [AdminClientController::class, 'updateCompany']);
        Route::get('usage',                              [AdminClientController::class, 'usage']);

        // User (staff) management
        Route::prefix('users')->group(function () {
            Route::get('/',                                                   [AdminUserController::class, 'index']);
            Route::post('/',                                                  [AdminUserController::class, 'store']);
            Route::post('/invite',                                            [AdminUserController::class, 'invite']);
            Route::get('/company-options',                                    [AdminUserController::class, 'companyOptions']);
            Route::get('/check-email',                                        [AdminUserController::class, 'checkEmail']);
            Route::get('/roles',                                              [AdminUserController::class, 'roleOptions']);
            Route::get('/role-defaults',                                      [AdminUserController::class, 'roleDefaults']);
            Route::get('/{user}',                                             [AdminUserController::class, 'show']);
            Route::put('/{user}',                                             [AdminUserController::class, 'update']);
            Route::delete('/{user}',                                          [AdminUserController::class, 'destroy']);
            Route::put('/{user}/permissions',                                 [AdminUserController::class, 'syncPermissions']);
            Route::post('/{user}/resend-invite',                              [AdminUserController::class, 'resendInvite']);
            Route::post('/{user}/reset-password',                             [AdminUserController::class, 'resetPassword']);
            Route::patch('/{user}/toggle-status',                             [AdminUserController::class, 'toggleStatus']);
            Route::get('/{user}/activity',                                    [AdminUserController::class, 'activity']);
            Route::get('/{user}/company-permissions/{companyId}',             [AdminUserController::class, 'getCompanyPermissions']);
            Route::put('/{user}/company-permissions/{companyId}',             [AdminUserController::class, 'updateCompanyPermissions']);
        });

        // Sales — requires leads module
        Route::middleware('module:leads')->group(function () {
            // Sales dashboard
            Route::get('sales/dashboard',                    [AdminSalesDashboardController::class, 'index']);
            // Pipeline
            Route::get('leads/pipeline',                     [AdminLeadController::class, 'pipeline']);
            Route::get('leads/company-users',                [AdminLeadController::class, 'companyUsers']);
            // Lead CRUD
            Route::get('leads',                              [AdminLeadController::class, 'index']);
            Route::post('leads',                             [AdminLeadController::class, 'store']);
            Route::get('leads/{id}',                         [AdminLeadController::class, 'show']);
            Route::put('leads/{id}',                         [AdminLeadController::class, 'update']);
            Route::delete('leads/{id}',                      [AdminLeadController::class, 'destroy']);
            Route::patch('leads/{id}/status',                [AdminLeadController::class, 'updateStatus']);
            Route::post('leads/{id}/transfer',               [AdminLeadController::class, 'transfer']);
            Route::post('leads/{id}/convert',                [AdminLeadController::class, 'convert']);
            Route::get('leads/{id}/project-eligibility',     [AdminLeadController::class, 'projectEligibility']);
            // Sales Chat — Seller<->Lead conversation, separate from Project Chat
            Route::get('leads/{id}/chat',                    [AdminSalesChatController::class, 'leadMessages']);
            Route::post('leads/{id}/chat',                   [AdminSalesChatController::class, 'sendLeadMessage']);
            Route::get('leads/{id}/chat/{messageId}/attachment', [AdminSalesChatController::class, 'downloadLeadAttachment']);
            // Follow-ups per lead
            Route::get('leads/{leadId}/follow-ups',          [AdminFollowUpController::class, 'index']);
            Route::post('leads/{leadId}/follow-ups',         [AdminFollowUpController::class, 'store']);
            // Follow-up queue + actions
            Route::get('follow-ups',                         [AdminFollowUpController::class, 'queue']);
            Route::put('follow-ups/{id}',                    [AdminFollowUpController::class, 'update']);
            Route::patch('follow-ups/{id}/complete',         [AdminFollowUpController::class, 'complete']);
            Route::patch('follow-ups/{id}/miss',             [AdminFollowUpController::class, 'miss']);
            Route::patch('follow-ups/{id}/cancel',           [AdminFollowUpController::class, 'cancel']);
            Route::delete('follow-ups/{id}',                 [AdminFollowUpController::class, 'destroy']);
        });

        // Sales Chat for clients — NOT wrapped in `module:clients` (same
        // rationale as the sub-user side's ungated `clients` routes below):
        // "own clients" reached via Sales should chat even on a Sales-only
        // company with no Client module purchased.
        Route::get('clients/{id}/chat',                      [AdminSalesChatController::class, 'clientMessages']);
        Route::post('clients/{id}/chat',                     [AdminSalesChatController::class, 'sendClientMessage']);
        Route::get('clients/{id}/chat/{messageId}/attachment', [AdminSalesChatController::class, 'downloadClientAttachment']);

        // "Client Messages" — the client's own restricted Direct Chat (see
        // Api\Client\ChatController), distinct from Sales Chat above (which
        // has no actual client party). Client Messages tab on the Client
        // detail page.
        Route::get('clients/{id}/direct-chat',                     [\App\Http\Controllers\Api\Admin\ClientChatController::class, 'index']);
        Route::post('clients/{id}/direct-chat/start',              [\App\Http\Controllers\Api\Admin\ClientChatController::class, 'startChat']);
        Route::get('clients/{id}/direct-chat/{threadId}/messages', [\App\Http\Controllers\Api\Admin\ClientChatController::class, 'messages']);
        Route::post('clients/{id}/direct-chat/{threadId}/reply',   [\App\Http\Controllers\Api\Admin\ClientChatController::class, 'reply']);
        Route::post('clients/{id}/direct-chat/{threadId}/participants',            [\App\Http\Controllers\Api\Admin\ClientChatController::class, 'addParticipant']);
        Route::delete('clients/{id}/direct-chat/{threadId}/participants/{userId}', [\App\Http\Controllers\Api\Admin\ClientChatController::class, 'removeParticipant']);

        // Client management + portal access — requires clients module
        Route::middleware('module:clients')->group(function () {
            Route::get('clients',                            [AdminClientController::class, 'index']);
            Route::post('clients',                           [AdminClientController::class, 'store']);
            Route::get('clients/{id}',                       [AdminClientController::class, 'show']);
            Route::put('clients/{id}',                       [AdminClientController::class, 'update']);
            Route::put('clients/{id}/permissions',           [AdminClientController::class, 'updatePermissions']);
            Route::post('clients/{id}/enable-portal',        [AdminClientController::class, 'enablePortal']);
            Route::post('clients/{id}/disable-portal',       [AdminClientController::class, 'disablePortal']);
            Route::get('clients/{client}/invoices',          [AdminInvoiceController::class, 'forClient']);

            Route::get('support',                            [AdminSupportController::class, 'index']);
            Route::get('support/{id}',                       [AdminSupportController::class, 'show']);
            Route::post('support/{id}/reply',                [AdminSupportController::class, 'reply']);
            Route::patch('support/{id}/assign',              [AdminSupportController::class, 'assign']);
            Route::patch('support/{id}/status',              [AdminSupportController::class, 'updateStatus']);
        });

        // Invoice management — requires invoices module
        Route::middleware('module:invoices')->group(function () {
            Route::get('invoices',                           [AdminInvoiceController::class, 'index']);
            Route::post('invoices',                          [AdminInvoiceController::class, 'store']);
            Route::get('invoices/{invoice}',                 [AdminInvoiceController::class, 'show']);
            Route::put('invoices/{invoice}',                 [AdminInvoiceController::class, 'update']);
            Route::patch('invoices/{invoice}/send',          [AdminInvoiceController::class, 'send']);
            Route::patch('invoices/{invoice}/cancel',        [AdminInvoiceController::class, 'cancel']);
            Route::post('invoices/{invoice}/send-email',     [AdminInvoiceController::class, 'sendEmail']);
            Route::post('invoices/{invoice}/generate-link',  [AdminInvoiceController::class, 'generateLink']);
            Route::delete('invoices/{invoice}/generate-link',[AdminInvoiceController::class, 'revokeLink']);
        });

        // Payment management — requires payments module
        Route::middleware('module:payments')->group(function () {
            Route::get('payments',                           [AdminPaymentController::class, 'index']);
            Route::post('invoices/{invoice}/payments',       [AdminPaymentController::class, 'store']);
            Route::patch('payments/{payment}/confirm',       [AdminPaymentController::class, 'confirm']);
            Route::patch('payments/{payment}/reject',        [AdminPaymentController::class, 'reject']);
            Route::delete('payments/{payment}',              [AdminPaymentController::class, 'destroy']);
        });

        // Project Management — requires projects module
        Route::middleware('module:projects')->group(function () {
            Route::get('companies/{companyId}/project-users',      [AdminProjectController::class, 'projectUsers']);
            Route::get('projects/dashboard',                        [AdminProjectController::class, 'dashboard']);
            // Reports registered before the {id} wildcard so "reports" isn't swallowed as a project id.
            Route::get('projects/reports/status',                   [AdminProjectReportController::class, 'statusReport']);
            Route::get('projects/reports/task-status',              [AdminProjectReportController::class, 'taskStatusReport']);
            Route::get('projects/reports/workload',                 [AdminProjectReportController::class, 'workloadReport']);
            Route::get('projects/reports/timesheets',               [AdminProjectReportController::class, 'timesheetReport']);
            Route::get('projects/reports/overdue',                  [AdminProjectReportController::class, 'overdueReport']);
            Route::get('projects/reports/completed',                [AdminProjectReportController::class, 'completedProjectsReport']);
            Route::get('projects',                                  [AdminProjectController::class, 'index']);
            Route::post('projects',                                 [AdminProjectController::class, 'store']);
            Route::get('projects/{id}',                             [AdminProjectController::class, 'show']);
            Route::put('projects/{id}',                             [AdminProjectController::class, 'update']);
            Route::patch('projects/{id}/seller',                    [AdminProjectController::class, 'assignSeller']);
            Route::delete('projects/{id}',                          [AdminProjectController::class, 'destroy']);
            Route::put('projects/{id}/team',                        [AdminProjectController::class, 'assignTeam']);
            Route::patch('projects/{id}/team/{memberId}',           [AdminProjectController::class, 'updateMemberRole']);
            Route::delete('projects/{id}/team/{memberId}',          [AdminProjectController::class, 'removeTeamMember']);
            Route::get('projects/{id}/activity',                    [AdminProjectController::class, 'activity']);
            Route::get('projects/{id}/completion-status',           [AdminProjectController::class, 'completionStatus']);
            Route::post('projects/{id}/complete',                   [AdminProjectController::class, 'complete']);
            Route::post('projects/{id}/close',                      [AdminProjectController::class, 'close']);
            Route::post('projects/{id}/reopen',                     [AdminProjectController::class, 'reopen']);
            Route::post('projects/{id}/invoices/link',              [AdminProjectController::class, 'linkInvoice']);
            Route::delete('projects/{id}/invoices/{invoiceId}',     [AdminProjectController::class, 'unlinkInvoice']);

            Route::get('projects/{projectId}/documents',            [AdminProjectDocumentController::class, 'index']);
            Route::post('projects/{projectId}/documents',           [AdminProjectDocumentController::class, 'store']);
            Route::get('projects/{projectId}/documents/{id}/download', [AdminProjectDocumentController::class, 'download']);
            Route::delete('projects/{projectId}/documents/{id}',    [AdminProjectDocumentController::class, 'destroy']);

            Route::get('projects/{projectId}/attachments',              [AdminProjectAttachmentController::class, 'index']);
            Route::post('projects/{projectId}/attachments',             [AdminProjectAttachmentController::class, 'store']);
            Route::get('projects/{projectId}/attachments/{id}/download', [AdminProjectAttachmentController::class, 'download']);
            Route::delete('projects/{projectId}/attachments/{id}',      [AdminProjectAttachmentController::class, 'destroy']);

            Route::get('projects/{projectId}/comments',             [AdminProjectCommentController::class, 'index']);
            Route::post('projects/{projectId}/comments',            [AdminProjectCommentController::class, 'store']);
            Route::patch('projects/{projectId}/comments/{commentId}', [AdminProjectCommentController::class, 'update']);
            Route::delete('projects/{projectId}/comments/{commentId}', [AdminProjectCommentController::class, 'destroy']);
            Route::post('projects/{projectId}/comments/{commentId}/like', [AdminProjectCommentController::class, 'toggleLike']);
            Route::get('projects/{projectId}/mentionable-users',    [AdminProjectCommentController::class, 'mentionableUsers']);
            Route::get('projects/{projectId}/comments/{commentId}/attachments',    [AdminProjectCommentAttachmentController::class, 'index']);
            Route::post('projects/{projectId}/comments/{commentId}/attachments',   [AdminProjectCommentAttachmentController::class, 'store']);
            Route::get('projects/{projectId}/comments/{commentId}/attachments/{id}/download', [AdminProjectCommentAttachmentController::class, 'download']);

            Route::get('projects/{projectId}/chat',                 [AdminProjectChatController::class, 'index']);
            Route::post('projects/{projectId}/chat',                [AdminProjectChatController::class, 'store']);
            Route::get('projects/{projectId}/chat/{messageId}/attachment', [AdminProjectChatController::class, 'downloadAttachment']);
            Route::post('projects/{projectId}/chat/participants',   [AdminProjectChatController::class, 'addClientParticipant']);

            // Project Chat — one thread per project (see ProjectChatService).
            Route::get('projects/{projectId}/messenger',                              [AdminProjectMessengerController::class, 'show']);
            Route::get('projects/{projectId}/messenger/eligible-participants',        [AdminProjectMessengerController::class, 'eligibleParticipants']);
            Route::get('projects/{projectId}/messenger/messages',                     [AdminProjectMessengerController::class, 'messages']);
            Route::post('projects/{projectId}/messenger/messages',                    [AdminProjectMessengerController::class, 'send']);
            Route::delete('projects/{projectId}/messenger/messages/{messageId}',      [AdminProjectMessengerController::class, 'deleteMessage']);
            Route::patch('projects/{projectId}/messenger/messages/{messageId}',       [AdminProjectMessengerController::class, 'updateMessage']);
            Route::post('projects/{projectId}/messenger/participants',                [AdminProjectMessengerController::class, 'addParticipant']);
            Route::delete('projects/{projectId}/messenger/participants/{userId}',     [AdminProjectMessengerController::class, 'removeParticipant']);
            Route::patch('projects/{projectId}/messenger/participants/{userId}/mute', [AdminProjectMessengerController::class, 'muteParticipant']);
            Route::get('projects/{projectId}/messenger/messages/{messageId}/attachment', [AdminProjectMessengerController::class, 'downloadAttachment']);

            Route::get('projects/{id}/deliverables',                [AdminProductionController::class, 'deliverables']);
            Route::post('projects/{id}/deliverables',               [AdminProductionController::class, 'storeDeliverable']);
            Route::patch('deliverables/{id}/verify',                [AdminProductionController::class, 'verifyDeliverable']);
            Route::post('deliverables/{id}/request-revision',       [AdminProductionController::class, 'requestRevision']);
            Route::get('deliverables/{deliverableId}/revisions',    [AdminProductionController::class, 'revisions']);
            Route::patch('revisions/{id}/resolve',                  [AdminProductionController::class, 'resolveRevision']);

            // Production — folded into Project Management, not a separate module.
            // Active whenever `projects` is active; no standalone `module:production` gate.
            Route::get('production/dashboard',                      [AdminProductionController::class, 'dashboard']);
            Route::get('production/queue',                          [AdminProductionController::class, 'queue']);
            Route::patch('production/queue/{id}',                   [AdminProductionController::class, 'updateQueueItem']);
        });

        // Tasks — requires tasks module
        Route::middleware('module:tasks')->group(function () {
            Route::get('tasks',                                     [AdminTaskController::class, 'indexAll']);
            // Resolves a bare task id to its project_id, for the guard-
            // agnostic /task/{id} share-link redirector (see frontend
            // app/task/[taskId]/page.tsx) — a "Copy Link" click doesn't know
            // which project_id to put in the URL, so it links here instead
            // and lets the destination guard-specific page do the real
            // permission check once it knows where to go.
            Route::get('tasks/{id}/lookup',                         [AdminTaskController::class, 'lookup']);
            Route::get('projects/{projectId}/tasks',                [AdminTaskController::class, 'index']);
            Route::post('projects/{projectId}/tasks',                [AdminTaskController::class, 'store']);
            Route::put('projects/{projectId}/tasks/{id}',            [AdminTaskController::class, 'update']);
            Route::delete('projects/{projectId}/tasks/{id}',         [AdminTaskController::class, 'destroy']);
            Route::get('projects/{projectId}/tasks/{id}/activity',   [AdminTaskController::class, 'activity']);

            Route::get('projects/{projectId}/tasks/{taskId}/attachments',                [AdminTaskAttachmentController::class, 'index']);
            Route::post('projects/{projectId}/tasks/{taskId}/attachments',               [AdminTaskAttachmentController::class, 'store']);
            Route::get('projects/{projectId}/tasks/{taskId}/attachments/{id}/download',  [AdminTaskAttachmentController::class, 'download']);
            Route::delete('projects/{projectId}/tasks/{taskId}/attachments/{id}',        [AdminTaskAttachmentController::class, 'destroy']);
        });

        // Timesheets — requires timesheets module
        Route::middleware('module:timesheets')->group(function () {
            Route::get('timesheets',                                [AdminTimesheetController::class, 'index']);
            Route::post('timesheets',                               [AdminTimesheetController::class, 'store']);
            Route::patch('timesheets/{id}/approve',                 [AdminTimesheetController::class, 'approve']);
            Route::get('timesheets/export',                         [AdminTimesheetController::class, 'export']);
        });

        // HR — Employees (base sub-module; HR dashboard/reports ride on this
        // key too, same pattern Project Reports rides on 'projects')
        Route::middleware('module:employees')->group(function () {
            Route::get('hr/dashboard',                              [AdminHrDashboardController::class, 'index']);
            Route::get('hr/reports/headcount',                      [AdminHrReportController::class, 'headcountByDepartment']);
            Route::get('hr/reports/attendance-summary',             [AdminHrReportController::class, 'attendanceSummary']);
            Route::get('hr/reports/leave-summary',                  [AdminHrReportController::class, 'leaveSummary']);

            Route::get('employees',                                 [AdminEmployeeController::class, 'index']);
            Route::post('employees',                                [AdminEmployeeController::class, 'store']);
            Route::get('employees/{id}',                            [AdminEmployeeController::class, 'show']);
            Route::put('employees/{id}',                            [AdminEmployeeController::class, 'update']);
            Route::delete('employees/{id}',                         [AdminEmployeeController::class, 'destroy']);

            Route::get('employees/{id}/documents',                  [AdminEmployeeController::class, 'documents']);
            Route::post('employees/{id}/documents',                 [AdminEmployeeController::class, 'uploadDocument']);
            Route::delete('employees/{id}/documents/{documentId}',  [AdminEmployeeController::class, 'deleteDocument']);

            Route::get('employees/{id}/notes',                      [AdminEmployeeController::class, 'notes']);
            Route::post('employees/{id}/notes',                     [AdminEmployeeController::class, 'addNote']);
        });

        // HR — Attendance
        Route::middleware('module:attendance')->group(function () {
            Route::get('attendance',                                [AdminAttendanceController::class, 'index']);
            Route::post('attendance/mark',                          [AdminAttendanceController::class, 'mark']);
            Route::post('attendance/bulk-mark',                     [AdminAttendanceController::class, 'bulkMark']);
        });

        // HR — Leave
        Route::middleware('module:leaves')->group(function () {
            Route::get('leaves',                                    [AdminLeaveController::class, 'index']);
            Route::post('leaves',                                   [AdminLeaveController::class, 'store']);
            Route::patch('leaves/{id}/status',                      [AdminLeaveController::class, 'updateStatus']);
        });

        // HR — Payroll
        Route::middleware('module:payroll')->group(function () {
            Route::get('payroll',                                   [AdminPayrollController::class, 'index']);
            Route::post('payroll',                                  [AdminPayrollController::class, 'store']);
            Route::patch('payroll/{id}/process',                    [AdminPayrollController::class, 'process']);
            Route::patch('payroll/{id}/mark-paid',                  [AdminPayrollController::class, 'markPaid']);
            Route::get('payroll/{id}/payslip',                      [AdminPayrollController::class, 'payslip']);
        });

        // HR — Recruitment
        Route::middleware('module:recruitment')->group(function () {
            Route::get('recruitment',                               [AdminRecruitmentController::class, 'index']);
            Route::post('recruitment',                              [AdminRecruitmentController::class, 'store']);
            Route::get('recruitment/{id}',                          [AdminRecruitmentController::class, 'show']);
            Route::put('recruitment/{id}',                          [AdminRecruitmentController::class, 'update']);
            Route::delete('recruitment/{id}',                       [AdminRecruitmentController::class, 'destroy']);
            Route::post('recruitment/{id}/applicants',              [AdminRecruitmentController::class, 'addApplicant']);
            Route::patch('recruitment/{id}/applicants/{applicantId}/status', [AdminRecruitmentController::class, 'updateApplicantStatus']);
        });

        // Reports
        Route::get('reports/invoices',                   [AdminReportController::class, 'invoices']);

        // Settings
        Route::get('settings',                           [AdminSettingsController::class, 'show']);
        Route::put('settings/company',                   [AdminSettingsController::class, 'updateCompany']);
        Route::put('settings/invoice',                   [AdminSettingsController::class, 'updateInvoice']);
        Route::put('settings/bank',                      [AdminSettingsController::class, 'updateBank']);
        Route::post('settings/logo',                     [AdminSettingsController::class, 'uploadLogo']);
        Route::post('settings/gateways',                   [AdminSettingsController::class, 'storeGateway']);
        Route::put('settings/gateways/{id}',               [AdminSettingsController::class, 'updateGateway']);
        Route::patch('settings/gateways/{id}/toggle',      [AdminSettingsController::class, 'toggleGateway']);
        Route::patch('settings/gateways/{id}/default',     [AdminSettingsController::class, 'setDefaultGateway']);
        Route::delete('settings/gateways/{id}',            [AdminSettingsController::class, 'destroyGateway']);
        Route::post('settings/gateways/{id}/test',         [AdminSettingsController::class, 'testGateway']);
        Route::get('settings/deal-workflow',               [AdminSettingsController::class, 'dealWorkflowSettings']);
        Route::put('settings/deal-workflow',                [AdminSettingsController::class, 'updateDealWorkflowSettings']);

        // Subscription payment (registration flow) — deliberately reachable
        // while pending_payment (that's the whole point of these routes);
        // reachable normally once active too.
        Route::get('subscription/payment-init',         [SubscriptionPaymentController::class, 'init'])->withoutMiddleware(\App\Http\Middleware\EnsureSubscriptionActive::class);
        Route::get('subscription/order-summary',        [SubscriptionPaymentController::class, 'orderSummary'])->withoutMiddleware(\App\Http\Middleware\EnsureSubscriptionActive::class);
        Route::post('subscription/paypal/create-order', [SubscriptionPaymentController::class, 'createPaypalOrder'])->withoutMiddleware(\App\Http\Middleware\EnsureSubscriptionActive::class);
        Route::post('subscription/process',             [SubscriptionPaymentController::class, 'process'])->withoutMiddleware(\App\Http\Middleware\EnsureSubscriptionActive::class);
        Route::get('payment-gateways',                  [SubscriptionPaymentController::class, 'activeGateways'])->withoutMiddleware(\App\Http\Middleware\EnsureSubscriptionActive::class);

        // Upgrade Modules — buy additional modules after registration
        Route::get('modules/catalog',                   [AdminModulePurchaseController::class, 'catalog']);
        Route::post('modules/purchase',                 [AdminModulePurchaseController::class, 'purchase']);

        // Upgrade Seats / Company Slots — raise per-admin limits after registration
        Route::get('seats/catalog',                     [AdminSeatPurchaseController::class, 'catalog']);
        Route::post('seats/purchase',                   [AdminSeatPurchaseController::class, 'purchase']);
    });
});

/*
|--------------------------------------------------------------------------
| User Auth Routes  (guard: sanctum → User model)
|--------------------------------------------------------------------------
*/
Route::prefix('user')->group(function () {
    Route::post('login', [UserAuthController::class, 'login']);
    Route::post('forgot-password', [ForgotPasswordController::class, 'sendResetLink']);
    Route::post('reset-password',  [ForgotPasswordController::class, 'reset']);

    // Google OAuth (staff/sub-user login only) — unauthenticated by design.
    Route::get('auth/google/redirect',  [GoogleAuthController::class, 'redirect']);
    Route::get('auth/google/callback',  [GoogleAuthController::class, 'callback']);
    Route::post('auth/google/exchange', [GoogleAuthController::class, 'exchange']);

    Route::middleware('auth:sanctum')->group(function () {
        Route::post('logout', [UserAuthController::class, 'logout']);
        Route::get('me',     [UserAuthController::class, 'me']);

        // My Profile — every sub-user's own name/phone/avatar/password,
        // regardless of role_type; has nothing to do with permissions.
        Route::get('profile',            [UserProfileController::class, 'show']);
        Route::put('profile',            [UserProfileController::class, 'update']);
        Route::post('profile/avatar',    [UserProfileController::class, 'uploadAvatar']);
        Route::put('profile/password',   [UserProfileController::class, 'changePassword']);

        // Notifications — not module-gated, a base feature for every sub-user.
        Route::get('notifications',                     [UserNotificationController::class, 'index']);
        Route::get('notifications/unread-counts',       [UserNotificationController::class, 'unreadCounts']);
        Route::patch('notifications/mark-category-read', [UserNotificationController::class, 'markCategoryRead']);
        Route::patch('notifications/{id}/read',         [UserNotificationController::class, 'markRead']);
        Route::patch('notifications/read-all',          [UserNotificationController::class, 'markAllRead']);
        Route::delete('notifications/{id}',              [UserNotificationController::class, 'clear']);
        Route::delete('notifications',                   [UserNotificationController::class, 'clearAll']);

        // General Chat — not module-gated (canUseGeneralChat lives in the
        // always-available `account` catalog module, not a purchasable one).
        Route::get('chat',                                [UserGeneralChatController::class, 'index']);
        Route::get('chat/eligible-users',                 [UserGeneralChatController::class, 'eligibleUsers']);
        Route::post('chat/direct',                        [UserGeneralChatController::class, 'createDirect']);
        Route::post('chat/group',                         [UserGeneralChatController::class, 'createGroup']);
        Route::post('chat/{threadId}/participants',       [UserGeneralChatController::class, 'addParticipant']);
        Route::delete('chat/{threadId}/participants/{userId}', [UserGeneralChatController::class, 'removeParticipant']);
        Route::patch('chat/{threadId}/mute',              [UserGeneralChatController::class, 'toggleMute']);
        Route::get('chat/{threadId}/messages',            [UserGeneralChatController::class, 'messages']);
        Route::post('chat/{threadId}/messages',           [UserGeneralChatController::class, 'send']);
        Route::patch('chat/{threadId}/messages/{messageId}', [UserGeneralChatController::class, 'updateMessage']);
        Route::delete('chat/{threadId}/messages/{messageId}', [UserGeneralChatController::class, 'deleteMessage']);
        Route::get('chat/{threadId}/messages/{messageId}/attachment', [UserGeneralChatController::class, 'downloadAttachment']);

        // Client management — NOT wrapped in `module:clients`, unlike Admin's
        // equivalent routes: "Basic Clients" access is grantable via either
        // the Client module OR the Sales module (see ClientController::can()),
        // and CheckCompanyModule only supports gating on a single module key.
        // Enforcement here is by permission (canViewClients/canCreateClients/
        // canEditClients) rather than module purchase, to avoid 403-ing a
        // Sales-only company's legitimate "Basic Clients" access.
        Route::get('clients',                            [UserClientController::class,  'index']);
        Route::post('clients',                           [UserClientController::class,  'store']);
        Route::get('clients/{id}',                       [UserClientController::class,  'show']);
        Route::put('clients/{id}',                       [UserClientController::class,  'update']);
        Route::put('clients/{id}/permissions',           [UserClientController::class,  'updatePermissions']);
        Route::post('clients/{id}/enable-portal',        [UserClientController::class,  'enablePortal']);
        Route::post('clients/{id}/disable-portal',       [UserClientController::class,  'disablePortal']);
        // Sales Chat for clients — same ungated rationale as the routes above.
        Route::get('clients/{id}/chat',                  [UserSalesChatController::class, 'clientMessages']);
        Route::post('clients/{id}/chat',                 [UserSalesChatController::class, 'sendClientMessage']);
        Route::get('clients/{id}/chat/{messageId}/attachment', [UserSalesChatController::class, 'downloadClientAttachment']);

        // "Client Messages" — the client's own restricted Direct Chat (see
        // Api\Client\ChatController) — only shows threads this Seller/Finance
        // user is actually a participant of. start() additionally lets this
        // staff member INITIATE a chat with a client they're linked to
        // (account manager, or sent an invoice), not just reply to one the
        // client already started.
        Route::get('clients/{id}/direct-chat',                     [\App\Http\Controllers\Api\User\ClientChatController::class, 'index']);
        Route::post('clients/{id}/direct-chat/start',              [\App\Http\Controllers\Api\User\ClientChatController::class, 'startChat']);
        Route::get('clients/{id}/direct-chat/{threadId}/messages', [\App\Http\Controllers\Api\User\ClientChatController::class, 'messages']);
        Route::post('clients/{id}/direct-chat/{threadId}/reply',   [\App\Http\Controllers\Api\User\ClientChatController::class, 'reply']);
        // Loops a Project Manager into an existing chat (Seller-initiated —
        // "have the PM contact this client too") and lets specific replies
        // stay hidden from that PM (see reply()'s hidden_from_user_ids).
        Route::post('clients/{id}/direct-chat/{threadId}/participants',            [\App\Http\Controllers\Api\User\ClientChatController::class, 'addParticipant']);
        Route::delete('clients/{id}/direct-chat/{threadId}/participants/{userId}', [\App\Http\Controllers\Api\User\ClientChatController::class, 'removeParticipant']);

        // Client Support Tickets — enforced by canViewClientSupport/
        // canManageClientSupport inside the controller (same ungated-route
        // rationale as the Client routes above).
        Route::get('support',                            [UserSupportController::class, 'index']);
        Route::get('support/{id}',                       [UserSupportController::class, 'show']);
        Route::post('support/{id}/reply',                [UserSupportController::class, 'reply']);
        Route::patch('support/{id}/assign',               [UserSupportController::class, 'assign']);
        Route::patch
        ('support/{id}/status',               [UserSupportController::class, 'updateStatus']);

        // Staff-side "add a user" — gated per-module on canAddUsers, scoped to
        // the acting staff member's own company and their own permission ceiling.
        Route::post('users',                             [UserManagementController::class, 'store']);

        // Sales — sub-user leads & follow-ups — requires leads module, matching
        // the Admin side's own `module:leads` gate.
        Route::middleware('module:leads')->group(function () {
            Route::get('sales/dashboard',                [UserSalesDashboardController::class, 'index']);
            Route::get('sales/reports/leads',             [UserSalesReportController::class, 'leadReport']);
            Route::get('sales/reports/conversion',         [UserSalesReportController::class, 'conversionReport']);
            Route::get('sales/reports/performance',        [UserSalesReportController::class, 'performanceReport']);
            Route::get('sales/reports/leads/export',       [UserSalesReportController::class, 'exportLeadReport']);
            Route::get('sales/targets',                    [UserSalesTargetController::class, 'index']);
            Route::put('sales/targets',                    [UserSalesTargetController::class, 'upsert']);
            Route::get('leads/pipeline',                 [UserLeadController::class,    'pipeline']);
            Route::get('leads/company-users',            [UserLeadController::class,    'companyUsers']);
            Route::get('leads',                          [UserLeadController::class,    'index']);
            Route::post('leads',                         [UserLeadController::class,    'store']);
            Route::get('leads/{id}',                     [UserLeadController::class,    'show']);
            Route::put('leads/{id}',                     [UserLeadController::class,    'update']);
            Route::patch('leads/{id}/status',            [UserLeadController::class,    'updateStatus']);
            Route::post('leads/{id}/transfer',           [UserLeadController::class,    'transfer']);
            Route::post('leads/{id}/convert',            [UserLeadController::class,    'convert']);
            Route::get('leads/{id}/project-eligibility', [UserLeadController::class,    'projectEligibility']);
            // Sales Chat — Seller<->Lead conversation, separate from Project Chat
            Route::get('leads/{id}/chat',                [UserSalesChatController::class, 'leadMessages']);
            Route::post('leads/{id}/chat',               [UserSalesChatController::class, 'sendLeadMessage']);
            Route::get('leads/{id}/chat/{messageId}/attachment', [UserSalesChatController::class, 'downloadLeadAttachment']);
            Route::post('leads/{id}/follow-ups',         [UserFollowUpController::class,'store']);
            Route::get('follow-ups',                     [UserFollowUpController::class,'queue']);
            Route::patch('follow-ups/{id}/complete',     [UserFollowUpController::class,'complete']);
            Route::patch('follow-ups/{id}/miss',         [UserFollowUpController::class,'miss']);
            Route::patch('follow-ups/{id}/cancel',       [UserFollowUpController::class,'cancel']);
        });

        // Invoices — requires invoices module, matching the Admin side's own
        // `module:invoices` gate.
        Route::middleware('module:invoices')->group(function () {
            Route::get('invoices',                       [UserInvoiceController::class, 'index']);
            Route::post('invoices',                      [UserInvoiceController::class, 'store']);
            Route::get('invoices/gateway-accounts',      [UserInvoiceController::class, 'gatewayAccounts']);
            Route::get('invoices/{id}',                  [UserInvoiceController::class, 'show']);
            Route::post('invoices/{id}/send-email',      [UserInvoiceController::class, 'sendEmail']);
            Route::post('invoices/{id}/generate-link',   [UserInvoiceController::class, 'generateLink']);
            Route::get('reports/invoices',               [UserInvoiceController::class, 'report']);
        });

        // Payments — Finance sub-user verify/reject, matching the Admin
        // side's own `module:payments` gate. Previously unreachable by any
        // sub-user; only Company Admin could confirm/reject a payment claim.
        Route::middleware('module:payments')->group(function () {
            Route::patch('payments/{id}/confirm', [\App\Http\Controllers\Api\User\PaymentController::class, 'confirm']);
            Route::patch('payments/{id}/reject',  [\App\Http\Controllers\Api\User\PaymentController::class, 'reject']);
        });

        // Diagnostic only — not module-gated, so it can help debug a company
        // whose Project Management module or permissions are misconfigured.
        Route::get('debug/access', [\App\Http\Controllers\Api\User\DebugController::class, 'access']);

        // Project Management — sub-user access, module-gated exactly like the
        // Admin side (scoped to canViewAllCompanyProjects / assigned / team-member / task-assignee).
        Route::middleware('module:projects')->group(function () {
            Route::get('projects/reports/status',           [UserProjectReportController::class, 'statusReport']);
            Route::get('projects/reports/task-status',      [UserProjectReportController::class, 'taskStatusReport']);
            Route::get('projects/reports/overdue',          [UserProjectReportController::class, 'overdueReport']);

            Route::get('projects/company-users',                [UserProjectController::class, 'companyUsers']);
            Route::get('projects/sellers',                      [UserProjectController::class, 'sellers']);
            Route::get('projects',                              [UserProjectController::class, 'index']);
            Route::post('projects',                             [UserProjectController::class, 'store']);
            Route::get('projects/{id}',                         [UserProjectController::class, 'show']);
            Route::put('projects/{id}',                         [UserProjectController::class, 'update']);
            Route::patch('projects/{id}/seller',                [UserProjectController::class, 'assignSeller']);
            Route::put('projects/{id}/team',                    [UserProjectController::class, 'assignTeam']);
            Route::delete('projects/{id}/team/{memberId}',      [UserProjectController::class, 'removeTeamMember']);
            Route::get('projects/{id}/completion-status',       [UserProjectController::class, 'completionStatus']);
            Route::get('projects/{id}/activity',                [UserProjectController::class, 'activity']);
            Route::post('projects/{id}/complete',               [UserProjectController::class, 'complete']);
            Route::post('projects/{id}/close',                  [UserProjectController::class, 'close']);
            Route::post('projects/{id}/reopen',                 [UserProjectController::class, 'reopen']);
            Route::post('projects/{id}/invoices',               [UserProjectController::class, 'createInvoice']);
            Route::post('projects/{id}/invoices/link',          [UserProjectController::class, 'linkInvoice']);
            Route::delete('projects/{id}/invoices/{invoiceId}', [UserProjectController::class, 'unlinkInvoice']);

            Route::get('projects/{projectId}/chat',             [UserProjectChatController::class, 'index']);
            Route::post('projects/{projectId}/chat',            [UserProjectChatController::class, 'store']);
            Route::get('projects/{projectId}/chat/{messageId}/attachment', [UserProjectChatController::class, 'downloadAttachment']);
            Route::post('projects/{projectId}/chat/participants', [UserProjectChatController::class, 'addClientParticipant']);

            // Project Chat — one thread per project (see ProjectChatService).
            Route::get('projects/{projectId}/messenger',                              [UserProjectMessengerController::class, 'show']);
            Route::get('projects/{projectId}/messenger/eligible-participants',        [UserProjectMessengerController::class, 'eligibleParticipants']);
            Route::get('projects/{projectId}/messenger/messages',                     [UserProjectMessengerController::class, 'messages']);
            Route::post('projects/{projectId}/messenger/messages',                    [UserProjectMessengerController::class, 'send']);
            Route::delete('projects/{projectId}/messenger/messages/{messageId}',      [UserProjectMessengerController::class, 'deleteMessage']);
            Route::patch('projects/{projectId}/messenger/messages/{messageId}',       [UserProjectMessengerController::class, 'updateMessage']);
            Route::post('projects/{projectId}/messenger/participants',                [UserProjectMessengerController::class, 'addParticipant']);
            Route::delete('projects/{projectId}/messenger/participants/{userId}',     [UserProjectMessengerController::class, 'removeParticipant']);
            Route::patch('projects/{projectId}/messenger/mute',                       [UserProjectMessengerController::class, 'toggleMute']);
            Route::get('projects/{projectId}/messenger/messages/{messageId}/attachment', [UserProjectMessengerController::class, 'downloadAttachment']);

            Route::get('projects/{projectId}/comments',         [UserProjectCommentController::class, 'index']);
            Route::post('projects/{projectId}/comments',        [UserProjectCommentController::class, 'store']);
            Route::patch('projects/{projectId}/comments/{commentId}', [UserProjectCommentController::class, 'update']);
            Route::delete('projects/{projectId}/comments/{commentId}', [UserProjectCommentController::class, 'destroy']);
            Route::post('projects/{projectId}/comments/{commentId}/like', [UserProjectCommentController::class, 'toggleLike']);
            Route::get('projects/{projectId}/mentionable-users', [UserProjectCommentController::class, 'mentionableUsers']);
            Route::get('projects/{projectId}/comments/{commentId}/attachments',    [UserProjectCommentAttachmentController::class, 'index']);
            Route::post('projects/{projectId}/comments/{commentId}/attachments',   [UserProjectCommentAttachmentController::class, 'store']);
            Route::get('projects/{projectId}/comments/{commentId}/attachments/{id}/download', [UserProjectCommentAttachmentController::class, 'download']);

            Route::get('projects/{projectId}/attachments',                [UserProjectAttachmentController::class, 'index']);
            Route::post('projects/{projectId}/attachments',               [UserProjectAttachmentController::class, 'store']);
            Route::get('projects/{projectId}/attachments/{id}/download',  [UserProjectAttachmentController::class, 'download']);
            Route::delete('projects/{projectId}/attachments/{id}',        [UserProjectAttachmentController::class, 'destroy']);

            Route::get('projects/{projectId}/deliverables',     [UserProductionController::class, 'deliverables']);
            Route::post('projects/{projectId}/deliverables',    [UserProductionController::class, 'uploadDeliverable']);
            Route::patch('revisions/{id}/resolve',              [UserProductionController::class, 'resolveRevision']);
            Route::post('deliverables/{id}/request-revision',   [UserProductionController::class, 'requestRevision']);
            Route::patch('deliverables/{id}/approve',           [UserProductionController::class, 'approve']);
            Route::patch('deliverables/{id}/reject',            [UserProductionController::class, 'reject']);
            Route::get('deliverables/{deliverableId}/revisions', [UserProductionController::class, 'revisions']);
        });

        Route::middleware('module:tasks')->group(function () {
            Route::get('tasks',                                 [UserTaskController::class, 'indexAll']);
            // See the matching Admin route's comment — resolves a bare task
            // id to its project_id for the /task/{id} share-link redirector.
            Route::get('tasks/{id}/lookup',                     [UserTaskController::class, 'lookup']);
            Route::get('projects/{projectId}/tasks',            [UserTaskController::class, 'index']);
            Route::post('projects/{projectId}/tasks',           [UserTaskController::class, 'store']);
            Route::put('projects/{projectId}/tasks/{id}',       [UserTaskController::class, 'update']);
            Route::get('projects/{projectId}/tasks/{id}/activity', [UserTaskController::class, 'activity']);
            Route::get('my-tasks',                              [UserTaskController::class, 'myTasks']);
            // No permission gate — every task-status actor (regardless of
            // canCreateTasks/canEditTasks/etc.) needs these for the QA/
            // Production handoff pickers. See TaskController::qaUsers().
            Route::get('tasks/qa-users',                        [UserTaskController::class, 'qaUsers']);
            Route::get('tasks/production-users',                [UserTaskController::class, 'productionUsers']);
            Route::get('tasks/assignable-users',                [UserTaskController::class, 'assignableUsers']);

            Route::get('projects/{projectId}/tasks/{taskId}/attachments',                [UserTaskAttachmentController::class, 'index']);
            Route::post('projects/{projectId}/tasks/{taskId}/attachments',               [UserTaskAttachmentController::class, 'store']);
            Route::get('projects/{projectId}/tasks/{taskId}/attachments/{id}/download',  [UserTaskAttachmentController::class, 'download']);
            Route::delete('projects/{projectId}/tasks/{taskId}/attachments/{id}',        [UserTaskAttachmentController::class, 'destroy']);
        });

        Route::middleware('module:timesheets')->group(function () {
            Route::get('timesheets',                            [UserTimesheetController::class, 'index']);
            Route::post('timesheets',                           [UserTimesheetController::class, 'store']);
            Route::patch('timesheets/{id}/approve',             [UserTimesheetController::class, 'approve']);
        });

        // Production is a section inside Project Management, not a separate
        // module — gated on 'projects' only, matching the Admin side's routes
        // (see the admin production/deliverables group above).
        Route::middleware('module:projects')->group(function () {
            Route::get('production/queue',                      [UserProductionController::class, 'queue']);
            Route::get('production/my-queue',                   [UserProductionController::class, 'myQueue']);
            Route::patch('production/{id}/start',               [UserProductionController::class, 'start']);
            Route::patch('production/{id}/submit',              [UserProductionController::class, 'submit']);
        });
    });
});

/*
|--------------------------------------------------------------------------
| Super Admin Routes  (guard: super_admin → SuperAdmin model)
|--------------------------------------------------------------------------
*/
Route::prefix('super-admin')->group(function () {
    Route::post('login', [SuperAdminAuthController::class, 'login']);

    Route::middleware('auth:super_admin')->group(function () {
        Route::post('logout', [SuperAdminAuthController::class, 'logout']);
        Route::get('me',      [SuperAdminAuthController::class, 'me']);

        Route::get('dashboard', [DashboardController::class, 'index']);

        Route::prefix('modules')->group(function () {
            Route::get('/',                  [ModuleController::class, 'index']);
            Route::post('/',                 [ModuleController::class, 'store']);
            Route::put('/{module}',          [ModuleController::class, 'update']);
            Route::patch('/{module}/toggle',  [ModuleController::class, 'toggle']);
            Route::delete('/{module}',       [ModuleController::class, 'destroy']);
        });

        Route::prefix('packages')->group(function () {
            Route::get('/',                   [PackageController::class, 'index']);
            Route::post('/',                  [PackageController::class, 'store']);
            Route::get('/{package}',          [PackageController::class, 'show']);
            Route::put('/{package}',          [PackageController::class, 'update']);
            Route::delete('/{package}',       [PackageController::class, 'destroy']);
            Route::patch('/{package}/toggle', [PackageController::class, 'toggle']);
        });

        Route::prefix('admins')->group(function () {
            Route::get('/',            [CompanyAdminController::class, 'index']);
            Route::post('/',           [CompanyAdminController::class, 'store']);
            Route::get('/{admin}',     [CompanyAdminController::class, 'show']);
            Route::put('/{admin}',     [CompanyAdminController::class, 'update']);
            Route::patch('/{admin}/toggle', [CompanyAdminController::class, 'toggleStatus']);
        });

        Route::prefix('companies')->group(function () {
            Route::get('/',                         [CompanyController::class, 'index']);
            Route::patch('/{company}/toggle',       [CompanyController::class, 'toggleStatus']);
            Route::get('/{company}/modules',        [CompanyController::class, 'modules']);
            Route::put('/{company}/modules',        [CompanyController::class, 'syncModules']);
        });

        Route::prefix('payment-gateways')->group(function () {
            Route::get('/',                          [PaymentGatewayController::class, 'index']);
            Route::patch('/{gateway}/toggle',        [PaymentGatewayController::class, 'toggle']);
            Route::put('/{gateway}/config',          [PaymentGatewayController::class, 'updateConfig']);
            Route::post('/{gateway}/test',           [PaymentGatewayController::class, 'testConnection']);
        });
    });
});

// ─── Client Portal Routes ────────────────────────────────────────────────────

Route::prefix('client')->group(function () {
    Route::post('login',  [\App\Http\Controllers\Api\Client\AuthController::class, 'login']);

    Route::middleware(['auth:sanctum', 'client.role'])->group(function () {
        Route::post('logout',      [\App\Http\Controllers\Api\Client\AuthController::class, 'logout']);
        Route::get('me',           [\App\Http\Controllers\Api\Client\AuthController::class, 'me']);
        Route::get('permissions',  [\App\Http\Controllers\Api\Client\AuthController::class, 'permissions']);

        Route::get('dashboard', [\App\Http\Controllers\Api\Client\DashboardController::class, 'index']);

        Route::get('projects',                               [\App\Http\Controllers\Api\Client\ProjectController::class, 'index']);
        Route::get('projects/{id}',                          [\App\Http\Controllers\Api\Client\ProjectController::class, 'show']);
        Route::post('deliverables/{id}/approve',             [\App\Http\Controllers\Api\Client\ProjectController::class, 'approveDeliverable']);
        Route::post('deliverables/{id}/revision',            [\App\Http\Controllers\Api\Client\ProjectController::class, 'requestRevision']);

        // Client-facing Project Comments only — no live chat inside
        // project/task pages for the client portal (see Client Communication
        // Rules). Always visibility='client', never sees 'internal'.
        Route::get('projects/{id}/comments',                 [\App\Http\Controllers\Api\Client\ProjectCommentController::class, 'index']);
        Route::post('projects/{id}/comments',                [\App\Http\Controllers\Api\Client\ProjectCommentController::class, 'store']);

        Route::get('invoices',                  [\App\Http\Controllers\Api\Client\InvoiceController::class, 'index']);
        Route::get('invoices/{id}',             [\App\Http\Controllers\Api\Client\InvoiceController::class, 'show']);
        Route::get('invoices/{id}/pdf',         [\App\Http\Controllers\Api\Client\InvoiceController::class, 'downloadPdf']);
        Route::get('invoices/{id}/gateways',    [\App\Http\Controllers\Api\Client\InvoiceController::class, 'getGateways']);
        Route::post('invoices/{id}/pay',        [\App\Http\Controllers\Api\Client\InvoiceController::class, 'payRequest']);
        Route::post('invoices/{id}/gateways/{gateway}/initiate', [\App\Http\Controllers\Api\Client\InvoiceController::class, 'initiateGatewayCheckout']);
        Route::get('invoices/{id}/gateways/{gateway}/return',    [\App\Http\Controllers\Api\Client\InvoiceController::class, 'returnFromGateway']);

        // Inline gateway payment — same rationale as the public link's inline
        // routes above; charged and finalized synchronously, no webhook.
        Route::get('invoices/{id}/gateways/{gateway}/init',       [\App\Http\Controllers\Api\Client\InvoiceController::class, 'initGateway']);
        Route::post('invoices/{id}/gateways/paypal/create-order', [\App\Http\Controllers\Api\Client\InvoiceController::class, 'createPaypalOrder']);
        Route::post('invoices/{id}/gateways/{gateway}/charge',    [\App\Http\Controllers\Api\Client\InvoiceController::class, 'chargeGateway']);

        
        Route::get('payments', [\App\Http\Controllers\Api\Client\PaymentController::class, 'index']);

        Route::get('documents',                  [\App\Http\Controllers\Api\Client\DocumentController::class, 'index']);
        Route::get('documents/{id}/download',    [\App\Http\Controllers\Api\Client\DocumentController::class, 'download']);
        Route::get('attachments/{id}/download',  [\App\Http\Controllers\Api\Client\AttachmentController::class, 'download']);

        Route::get('chat/eligible-contacts',                [\App\Http\Controllers\Api\Client\ChatController::class, 'eligibleContacts']);
        Route::post('chat/start',                           [\App\Http\Controllers\Api\Client\ChatController::class, 'startChat']);
        Route::get('chat/threads',                          [\App\Http\Controllers\Api\Client\ChatController::class, 'threads']);
        Route::get('chat/threads/{id}/messages',            [\App\Http\Controllers\Api\Client\ChatController::class, 'messages']);
        Route::post('chat/threads/{id}/reply',              [\App\Http\Controllers\Api\Client\ChatController::class, 'reply']);

        Route::get('support',           [\App\Http\Controllers\Api\Client\SupportController::class, 'index']);
        Route::post('support',          [\App\Http\Controllers\Api\Client\SupportController::class, 'store']);
        Route::get('support/{id}',      [\App\Http\Controllers\Api\Client\SupportController::class, 'show']);
        Route::post('support/{id}/reply',[\App\Http\Controllers\Api\Client\SupportController::class, 'reply']);

        Route::get('reports/projects', [\App\Http\Controllers\Api\Client\ReportController::class, 'projects']);
        Route::get('reports/invoices', [\App\Http\Controllers\Api\Client\ReportController::class, 'invoices']);
    });
});
