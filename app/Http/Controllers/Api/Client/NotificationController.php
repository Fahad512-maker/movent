<?php

namespace App\Http\Controllers\Api\Client;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Notification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    /**
     * Deliberately NOT company-scoped, unlike its staff twin
     * (Api\User\NotificationController::index()): a single client login can be a
     * client of several companies at once — the same reason every other
     * Api\Client\* controller resolves a LIST of client ids rather than one.
     * Scoping to users.company_id (set once at portal creation) would silently
     * hide every notification from the client's other companies.
     */
    private function scope(Request $request)
    {
        return Notification::where('user_id', $request->user()->id)
            ->whereNull('cleared_at');
    }

    public function index(Request $request): JsonResponse
    {
        $notifications = $this->scope($request)
            ->orderByDesc('created_at')
            ->limit(30)
            ->get();

        $unreadCount = $this->scope($request)->where('is_read', false)->count();

        return ApiResponse::success([
            'notifications' => $notifications,
            'unread_count'  => $unreadCount,
        ]);
    }

    public function markRead(Request $request, int $id): JsonResponse
    {
        $notification = $this->scope($request)->findOrFail($id);
        $notification->update(['is_read' => true, 'read_at' => now()]);

        return ApiResponse::success($notification, 'Notification marked as read');
    }

    public function markAllRead(Request $request): JsonResponse
    {
        $this->scope($request)
            ->where('is_read', false)
            ->update(['is_read' => true, 'read_at' => now()]);

        return ApiResponse::success(null, 'All notifications marked as read');
    }

    // Soft-clear (cleared_at, not deleted) — mirrors the staff controller so a
    // dismissed row stops counting as unread anywhere it might be summed.
    public function clear(Request $request, int $id): JsonResponse
    {
        $notification = $this->scope($request)->findOrFail($id);
        $notification->update([
            'cleared_at' => now(),
            'is_read'    => true,
            'read_at'    => $notification->read_at ?? now(),
        ]);

        return ApiResponse::success(null, 'Notification cleared');
    }

    public function clearAll(Request $request): JsonResponse
    {
        $this->scope($request)->update([
            'cleared_at' => now(),
            'is_read'    => true,
            'read_at'    => now(),
        ]);

        return ApiResponse::success(null, 'All notifications cleared');
    }
}
