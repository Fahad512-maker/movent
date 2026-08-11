<?php

namespace App\Http\Controllers\Api\Admin;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\Payroll;
use App\Models\SystemAuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PayrollController extends Controller
{
    private function admin() { return auth('admin')->user(); }
    private function companyIds(): array
    {
        return $this->admin()->companies()->pluck('id')->toArray();
    }

    private function logActivity(int $companyId, string $action, int $employeeId, array $newValues = []): void
    {
        SystemAuditLog::create([
            'company_id'  => $companyId,
            'user_id'     => null,
            'action'      => $action,
            'module_key'  => 'hr',
            'entity_type' => 'Employee',
            'entity_id'   => $employeeId,
            'new_values'  => $newValues,
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $companyIds = $this->companyIds();

        $q = Payroll::whereHas('employee', fn ($e) => $e->whereIn('company_id', $companyIds))
            ->with('employee:id,name,employee_code,department');

        if ($request->filled('employee_id')) $q->where('employee_id', $request->employee_id);
        if ($request->filled('month_year'))  $q->where('month_year', $request->month_year);
        if ($request->filled('status'))      $q->where('status', $request->status);

        return ApiResponse::success($q->orderByDesc('created_at')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $companyIds = $this->companyIds();

        $validated = $request->validate([
            'employee_id'  => ['required', 'integer'],
            'month_year'   => ['required', 'string', 'max:10'],
            'basic_salary' => ['required', 'numeric', 'min:0'],
            'allowances'   => ['nullable', 'numeric', 'min:0'],
            'deductions'   => ['nullable', 'numeric', 'min:0'],
        ]);

        $employee = Employee::whereIn('company_id', $companyIds)->findOrFail($validated['employee_id']);

        $validated['allowances'] ??= 0;
        $validated['deductions'] ??= 0;
        $validated['net_pay'] = $validated['basic_salary'] + $validated['allowances'] - $validated['deductions'];
        $validated['status'] = 'draft';

        $payroll = Payroll::create($validated);

        $this->logActivity($employee->company_id, 'payroll_created', $employee->id, $validated);

        return ApiResponse::success($payroll->load('employee:id,name'), 'Payroll record created', 201);
    }

    // "Process Payroll" — draft -> processed, recomputes net_pay.
    public function process(int $id): JsonResponse
    {
        $companyIds = $this->companyIds();

        $payroll = Payroll::whereHas('employee', fn ($e) => $e->whereIn('company_id', $companyIds))
            ->with('employee')
            ->findOrFail($id);

        $payroll->update([
            'net_pay' => $payroll->basic_salary + $payroll->allowances - $payroll->deductions,
            'status'  => 'processed',
            // processed_by FKs to `users`; Company Admin actor isn't a User row.
            'processed_by' => null,
        ]);

        $this->logActivity($payroll->employee->company_id, 'payroll_processed', $payroll->employee_id, ['payroll_id' => $payroll->id, 'net_pay' => $payroll->net_pay]);

        return ApiResponse::success($payroll->fresh(['employee:id,name']), 'Payroll processed');
    }

    public function markPaid(int $id): JsonResponse
    {
        $companyIds = $this->companyIds();

        $payroll = Payroll::whereHas('employee', fn ($e) => $e->whereIn('company_id', $companyIds))
            ->with('employee')
            ->findOrFail($id);

        $payroll->update(['status' => 'paid', 'paid_at' => now()]);

        $this->logActivity($payroll->employee->company_id, 'payroll_paid', $payroll->employee_id, ['payroll_id' => $payroll->id]);

        return ApiResponse::success($payroll->fresh(['employee:id,name']), 'Payroll marked as paid');
    }

    // "Generate Payslips" — on-screen printable detail, no PDF library.
    public function payslip(int $id): JsonResponse
    {
        $companyIds = $this->companyIds();

        $payroll = Payroll::whereHas('employee', fn ($e) => $e->whereIn('company_id', $companyIds))
            ->with('employee.company:id,name')
            ->findOrFail($id);

        return ApiResponse::success($payroll);
    }
}
