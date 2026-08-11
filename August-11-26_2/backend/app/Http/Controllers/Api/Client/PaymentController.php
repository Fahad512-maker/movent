<?php

namespace App\Http\Controllers\Api\Client;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\Payment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PaymentController extends Controller
{
    private function clientIds(Request $request): array
    {
        $ids = Client::where('user_id', $request->user()->id)
            ->where('portal_access', true)
            ->pluck('id')
            ->toArray();

        if (empty($ids)) abort(404, 'Client not found');

        return $ids;
    }

    public function index(Request $request): JsonResponse
    {
        $clientIds = $this->clientIds($request);

        $payments = Payment::whereHas('invoice', fn($q) => $q->whereIn('client_id', $clientIds))
            ->with(['invoice:id,invoice_number,currency'])
            ->orderByDesc('payment_date')
            ->get();

        return ApiResponse::success($payments);
    }
}
