<?php

namespace App\Services;

use App\Models\Client;
use App\Models\ClientPortalPermission;
use App\Models\CompanyModule;
use App\Models\Notification;
use App\Models\SupportTicket;
use App\Models\SupportTicketReply;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

// Mirrors InvoiceNotificationService's exact gating pattern (portal_access +
// user_id present, and the client's own portal hasn't hidden this module).
// Api\Client\SupportController already notifies staff/admins whenever a
// client raises a ticket or replies — this is the missing other direction:
// a client got no signal at all when staff/admin replied to their ticket.
class SupportNotificationService
{
    public static function notifyClientOnReply(SupportTicket $ticket, SupportTicketReply $reply, string $repliedByName): void
    {
        try {
            // SupportTicket.raised_by IS the client's own portal login id
            // (see Api\Client\SupportController::store()) — no client_id
            // column on the ticket itself, unlike Invoice.
            $client = Client::where('user_id', $ticket->raised_by)->first();

            // portal_access + user_id together are what "has a portal login"
            // means — see ClientPortalService::createOrUpdatePortalUser().
            if (!$client || !$client->portal_access || !$client->user_id) {
                return;
            }

            if (!self::clientSeesSupport($client)) {
                return;
            }

            $preview = $reply->message
                ? Str::limit($reply->message, 120)
                : ($reply->attachment_name ? "Sent an attachment: {$reply->attachment_name}" : 'Sent a reply');

            Notification::create([
                'user_id'    => $ticket->raised_by,
                'company_id' => $ticket->company_id,
                'type'       => 'support_ticket_reply',
                'title'      => "New reply on ticket: {$ticket->subject}",
                'body'       => "{$repliedByName}: {$preview}",
                'data'       => [
                    'ticket_id' => $ticket->id,
                    // The frontend bell reads data.link, not the url column —
                    // see frontend/components/layout/Navbar.tsx's mapping.
                    'link'      => "/client/support/{$ticket->id}",
                ],
            ]);
        } catch (\Throwable $e) {
            Log::warning('[support-notify] Could not create client portal notification for ticket '
                . $ticket->id . ': ' . $e->getMessage());
        }
    }

    /**
     * Whether this client's portal actually shows the Support section.
     * Mirrors Api\Client\AuthController::permissions()'s 'support' entry
     * exactly: unlike invoices/payments/etc., Support has no dedicated
     * purchasable module of its own — buying 'client_portal' alone is
     * enough — so only that module (not a 'support' CompanyModule row,
     * which doesn't exist) is checked here.
     */
    private static function clientSeesSupport(Client $client): bool
    {
        $companyHasModule = CompanyModule::where('company_id', $client->company_id)
            ->where('module_key', 'client_portal')
            ->where('is_enabled', true)
            ->exists();

        if (!$companyHasModule) {
            return false;
        }

        $toggle = ClientPortalPermission::where('client_id', $client->id)
            ->where('module_key', 'support')
            ->value('is_enabled');

        return $toggle === null ? true : (bool) $toggle;
    }
}
