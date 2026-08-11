<?php

namespace App\Http\Middleware;

use App\Helpers\ApiResponse;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

// Blocks every admin route EXCEPT the ones this route group deliberately
// excludes (subscription-payment/*, logout, me — see routes/api.php) while
// subscription_status is 'pending_payment'. AdminAuthController::login()
// already refuses to issue a token in this state for a normal login, but a
// token can still reach here via the resume-payment flow
// (PublicController::resumePayment()), which exists specifically so a
// blocked admin can still complete their payment — this middleware is what
// keeps that token from being usable for anything else in the meantime.
class EnsureSubscriptionActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $admin = $request->user('admin');

        if ($admin && $admin->subscription_status === 'pending_payment') {
            return ApiResponse::error(
                'Please complete your payment to activate your account.',
                402,
                ['error_code' => 'payment_required']
            );
        }

        return $next($request);
    }
}
