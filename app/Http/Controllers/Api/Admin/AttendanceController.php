<?php

namespace App\Http\Controllers\Api\Admin;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\Employee;
use App\Models\SystemAuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AttendanceController extends Controller
{
    private function admin() { return auth('admin')->user(); }
    private function companyIds(): array
    {
        return $this->admin()->companies()->pluck('id')->toArray();
    }

    public function index(Request $request): JsonResponse
    {
        $companyIds = $this->companyIds();

        $q = Attendance::whereHas('employee', fn ($e) => $e->whereIn('company_id', $companyIds))
            ->with('employee:id,name,employee_code,department');

        if ($request->filled('employee_id')) $q->where('employee_id', $request->employee_id);
        if ($request->filled('date'))        $q->where('date', $request->date);
        if ($request->filled('from'))        $q->where('date', '>=', $request->from);
        if ($request->filled('to'))          $q->where('date', '<=', $request->to);

        return ApiResponse::success($q->orderByDesc('date')->get());
    }

    // "Mark Attendance" — upsert one employee+date row.
    public function mark(Request $request): JsonResponse
    {
        $companyIds = $this->companyIds();

        $validated = $request->validate([
            'employee_id' => ['required', 'integer'],
            'date'        => ['required', 'date'],
            'status'      => ['required', 'in:present,absent,late,half_day,holiday'],
            'check_in'    => ['nullable'],
            'check_out'   => ['nullable'],
            'notes'       => ['nullable', 'string'],
        ]);

        $employee = Employee::whereIn('company_id', $companyIds)->findOrFail($validated['employee_id']);

        $attendance = Attendance::updateOrCreate(
            ['employee_id' => $employee->id, 'date' => $validated['date']],
            [
                'status'    => $validated['status'],
                'check_in'  => $validated['check_in'] ?? null,
                'check_out' => $validated['check_out'] ?? null,
                'notes'     => $validated['notes'] ?? null,
            ]
        );

        SystemAuditLog::create([
            'company_id'  => $employee->company_id,
            'user_id'     => null,
            'action'      => 'attendance_marked',
            'module_key'  => 'hr',
            'entity_type' => 'Employee',
            'entity_id'   => $employee->id,
            'new_values'  => $validated,
        ]);

        return ApiResponse::success($attendance->load('employee:id,name,employee_code'), 'Attendance marked');
    }

    // Marks multiple employees for the same date in one request — a daily register.
    public function bulkMark(Request $request): JsonResponse
    {
        $companyIds = $this->companyIds();

        $validated = $request->validate([
            'date'                    => ['required', 'date'],
            'entries'                 => ['required', 'array'],
            'entries.*.employee_id'   => ['required', 'integer'],
            'entries.*.status'        => ['required', 'in:present,absent,late,half_day,holiday'],
        ]);

        $employeeIds = Employee::whereIn('company_id', $companyIds)
            ->whereIn('id', collect($validated['entries'])->pluck('employee_id'))
            ->pluck('id')->all();

        $results = [];
        foreach ($validated['entries'] as $entry) {
            if (!in_array($entry['employee_id'], $employeeIds)) continue;
            $results[] = Attendance::updateOrCreate(
                ['employee_id' => $entry['employee_id'], 'date' => $validated['date']],
                ['status' => $entry['status']]
            );
        }

        return ApiResponse::success($results, count($results) . ' attendance records marked');
    }
}
