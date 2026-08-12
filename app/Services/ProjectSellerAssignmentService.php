<?php

namespace App\Services;

use App\Models\Project;
use App\Models\ProjectSellerAssignment;
use App\Models\SystemAuditLog;
use App\Models\User;

// Central "assign/switch a project's Seller" logic shared by both guards
// (Api\Admin\ProjectController and Api\User\ProjectController), mirroring
// how ProjectCompletionService is the shared brain behind those two
// controllers' Complete/Close/Reopen actions. Callers are responsible for
// their own permission check, project lookup/company-scope, and the
// "project is closed" guard before calling assign().
class ProjectSellerAssignmentService
{
    // The only user a project's seller_id may ever be set to: an ACTIVE
    // Seller of the SAME company as the project — never cross-company,
    // never a Developer/PM/Production/QA/Team Member even if they hold other
    // permissions. Exactly mirrors Api\User\LeadController::assignableSeller()
    // (the equivalent rule for lead assignment) — deliberately does NOT also
    // require a company_user_assignments row, since that table isn't
    // populated for every Seller (verified against real data: a Seller can
    // be a fully active users row with zero company_user_assignments rows,
    // which would make an otherwise-valid Seller invisible to this check).
    public function assignableSeller(int $companyId, int $sellerId): ?User
    {
        return User::where('id', $sellerId)
            ->where('company_id', $companyId)
            ->where('is_active', true)
            ->where('status', 'active')
            ->where('role_type', 'seller')
            ->first();
    }

    // Updates projects.seller_id/seller_assigned_*, writes a
    // project_seller_assignments row + a SystemAuditLog entry, and notifies
    // the new seller, the previous seller (on a switch), and the project's
    // PM. NotificationService already skips notifying the actor about their
    // own action, so no self-notify guard is needed here. Exactly one of
    // $actorUserId/$actorAdminId should be passed.
    public function assign(Project $project, User $seller, ?string $reason, ?int $actorUserId, ?int $actorAdminId, string $actorName): array
    {
        $oldSellerId = $project->seller_id;

        if ((int) $oldSellerId === (int) $seller->id) {
            return ['changed' => false, 'is_switch' => false];
        }

        $isSwitch = (bool) $oldSellerId;
        $oldSeller = $isSwitch ? User::find($oldSellerId) : null;

        $updates = [
            'seller_id'                   => $seller->id,
            'seller_assigned_by'          => $actorUserId,
            'seller_assigned_by_admin_id' => $actorAdminId,
            'seller_assigned_at'          => now(),
        ];

        // No real PM assigned yet (or the "PM" slot was only ever the
        // previous seller placeholder — same as the self-handoff flow's
        // project_manager_id ??= $user->id in Api\User\ProjectController::
        // store()) — follow the seller into that slot too, so the Project
        // Manager column/dropdown shows this seller as the responsible party
        // instead of "Unassigned" until a real PM is assigned. isPM()/
        // isInternalStaff() already hard-exclude role_type='seller'
        // regardless of project_manager_id match, so this never actually
        // grants the seller any internal/PM-tier capability — display only.
        if (!$project->project_manager_id || (int) $project->project_manager_id === (int) $oldSellerId) {
            $updates['project_manager_id'] = $seller->id;
        }

        $project->update($updates);
        $project->logActivity(
            $isSwitch ? 'seller_switched' : 'seller_assigned',
            $isSwitch && $oldSeller
                ? "{$actorName} switched seller from {$oldSeller->name} to {$seller->name}."
                : "{$actorName} assigned {$seller->name} as seller.",
            $actorName,
            ['from' => $oldSellerId, 'to' => $seller->id, 'reason' => $reason]
        );

        // Assigning/switching a project's seller now also drops them straight
        // into project chat — no more waiting on a PM/Admin to separately
        // remember "Manage Participants". See ProjectChatService::addSeller().
        ProjectChatService::addSeller($project, $seller->id);

        ProjectSellerAssignment::create([
            'company_id'           => $project->company_id,
            'project_id'           => $project->id,
            'old_seller_id'        => $oldSellerId,
            'new_seller_id'        => $seller->id,
            'assigned_by'          => $actorUserId,
            'assigned_by_admin_id' => $actorAdminId,
            'reason'               => $reason,
        ]);

        SystemAuditLog::create([
            'company_id'  => $project->company_id,
            'user_id'     => $actorUserId,
            'action'      => $isSwitch ? 'seller_switched' : 'seller_assigned',
            'module_key'  => 'project_management',
            'entity_type' => 'Project',
            'entity_id'   => $project->id,
            'old_values'  => ['seller_id' => $oldSellerId],
            'new_values'  => ['seller_id' => $seller->id, 'reason' => $reason],
        ]);

        NotificationService::send([
            'company_id'        => $project->company_id,
            'recipient_user_id' => $seller->id,
            'actor_user_id'     => $actorUserId,
            'actor_admin_id'    => $actorAdminId,
            'module'            => 'project_management',
            'type'              => 'project_seller_assigned',
            'title'             => 'Project assigned to you',
            'message'           => "{$actorName} assigned project \"{$project->name}\" to you.",
            'entity_type'       => 'Project',
            'entity_id'         => $project->id,
            'url'               => "/projects/{$project->id}",
        ]);

        if ($isSwitch && $oldSeller) {
            NotificationService::send([
                'company_id'        => $project->company_id,
                'recipient_user_id' => $oldSeller->id,
                'actor_user_id'     => $actorUserId,
                'actor_admin_id'    => $actorAdminId,
                'module'            => 'project_management',
                'type'              => 'project_seller_reassigned',
                'title'             => 'Project reassigned',
                'message'           => "{$actorName} reassigned project \"{$project->name}\" from you to {$seller->name}.",
                'entity_type'       => 'Project',
                'entity_id'         => $project->id,
                'url'               => "/projects/{$project->id}",
            ]);
        }

        // Skip if the PM is also the new or previous seller — they already
        // got the "assigned to you"/"reassigned" notification above, and
        // sending a second, differently-worded notification about the same
        // event to the same person would just be a confusing duplicate.
        $pmAlreadyNotified = $project->project_manager_id
            && ((int) $project->project_manager_id === (int) $seller->id || (int) $project->project_manager_id === (int) ($oldSeller->id ?? 0));

        if ($project->project_manager_id && !$pmAlreadyNotified) {
            NotificationService::send([
                'company_id'        => $project->company_id,
                'recipient_user_id' => $project->project_manager_id,
                'actor_user_id'     => $actorUserId,
                'actor_admin_id'    => $actorAdminId,
                'module'            => 'project_management',
                'type'              => 'project_seller_changed',
                'title'             => 'Project seller updated',
                'message'           => $isSwitch
                    ? "Project \"{$project->name}\" seller was switched to {$seller->name}."
                    : "Project \"{$project->name}\" was assigned to seller {$seller->name}.",
                'entity_type'       => 'Project',
                'entity_id'         => $project->id,
                'url'               => "/projects/{$project->id}",
            ]);
        }

        return ['changed' => true, 'is_switch' => $isSwitch, 'old_seller' => $oldSeller];
    }
}
