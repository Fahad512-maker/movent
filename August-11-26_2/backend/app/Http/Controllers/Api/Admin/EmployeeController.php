<?php

namespace App\Http\Controllers\Api\Admin;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Document;
use App\Models\Employee;
use App\Models\EmployeeNote;
use App\Models\SystemAuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class EmployeeController extends Controller
{
    private const MAX_FILE_KB = 10240; // 10 MB per file
    private const ALLOWED_MIMES = 'pdf,doc,docx,xls,xlsx,png,jpg,jpeg';

    private function admin() { return auth('admin')->user(); }
    private function companyIds(): array
    {
        return $this->admin()->companies()->pluck('id')->toArray();
    }

    private function employee(int $id): Employee
    {
        return Employee::whereIn('company_id', $this->companyIds())->findOrFail($id);
    }

    private function logActivity(int $companyId, string $action, int $entityId, array $newValues = []): void
    {
        SystemAuditLog::create([
            'company_id'  => $companyId,
            'user_id'     => null, // Company Admin actor isn't a User row
            'action'      => $action,
            'module_key'  => 'hr',
            'entity_type' => 'Employee',
            'entity_id'   => $entityId,
            'new_values'  => $newValues,
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $q = Employee::whereIn('company_id', $this->companyIds());

        if ($request->filled('department')) $q->where('department', $request->department);
        if ($request->filled('status'))     $q->where('status', $request->status);
        if ($request->filled('search')) {
            $search = $request->search;
            $q->where(function ($w) use ($search) {
                $w->where('name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
                  ->orWhere('employee_code', 'like', "%{$search}%");
            });
        }

        return ApiResponse::success($q->orderByDesc('created_at')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $companyIds = $this->companyIds();

        $validated = $request->validate([
            'company_id'      => ['required', 'integer', 'in:' . implode(',', $companyIds)],
            'user_id'         => ['nullable', 'integer', 'exists:users,id'],
            'employee_code'   => ['nullable', 'string', 'max:50', 'unique:employees,employee_code'],
            'name'            => ['required', 'string', 'max:150'],
            'email'           => ['nullable', 'email', 'max:255'],
            'phone'           => ['nullable', 'string', 'max:30'],
            'department'      => ['nullable', 'string', 'max:100'],
            'designation'     => ['nullable', 'string', 'max:100'],
            'employment_type' => ['nullable', 'in:full_time,part_time,contract,intern'],
            'salary'          => ['nullable', 'numeric', 'min:0'],
            'join_date'       => ['nullable', 'date'],
        ]);

        $validated['employee_code'] ??= 'EMP-' . strtoupper(Str::random(6));
        $validated['employment_type'] ??= 'full_time';
        $validated['status'] = 'active';

        $employee = Employee::create($validated);

        $this->logActivity($employee->company_id, 'created', $employee->id, $validated);

        return ApiResponse::success($employee, 'Employee created', 201);
    }

    public function show(int $id): JsonResponse
    {
        $employee = $this->employee($id)->load([
            'attendances' => fn ($q) => $q->orderByDesc('date')->limit(10),
            'leaveRequests' => fn ($q) => $q->orderByDesc('created_at')->limit(10),
            'payrolls' => fn ($q) => $q->orderByDesc('created_at')->limit(10),
            'notes' => fn ($q) => $q->with('authorAdmin:id,name')->orderByDesc('created_at'),
            'documents' => fn ($q) => $q->orderByDesc('created_at'),
            'user:id,name,email',
        ]);

        return ApiResponse::success($employee);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $employee = $this->employee($id);
        $companyIds = $this->companyIds();

        $validated = $request->validate([
            'user_id'         => ['nullable', 'integer', 'exists:users,id'],
            'employee_code'   => ['nullable', 'string', 'max:50', 'unique:employees,employee_code,' . $employee->id],
            'name'            => ['sometimes', 'string', 'max:150'],
            'email'           => ['nullable', 'email', 'max:255'],
            'phone'           => ['nullable', 'string', 'max:30'],
            'department'      => ['nullable', 'string', 'max:100'],
            'designation'     => ['nullable', 'string', 'max:100'],
            'employment_type' => ['sometimes', 'in:full_time,part_time,contract,intern'],
            'salary'          => ['nullable', 'numeric', 'min:0'],
            'join_date'       => ['nullable', 'date'],
            'status'          => ['sometimes', 'in:active,on_leave,terminated'],
        ]);

        $employee->update($validated);

        $this->logActivity($employee->company_id, 'updated', $employee->id, $validated);

        return ApiResponse::success($employee, 'Employee updated');
    }

    // "Delete / Deactivate" — soft-delete, matching the existing `terminated`
    // status value rather than hard-deleting HR history (attendance/leave/payroll).
    public function destroy(int $id): JsonResponse
    {
        $employee = $this->employee($id);
        $employee->update(['status' => 'terminated']);
        $employee->delete();

        $this->logActivity($employee->company_id, 'deactivated', $employee->id);

        return ApiResponse::success(null, 'Employee deactivated');
    }

    // ── Documents (reuses the existing generic Document model) ────────────

    public function documents(int $id): JsonResponse
    {
        $employee = $this->employee($id);

        $documents = Document::where('linked_to_type', 'Employee')
            ->where('linked_to_id', $employee->id)
            ->orderByDesc('created_at')
            ->get();

        return ApiResponse::success($documents);
    }

    public function uploadDocument(Request $request, int $id): JsonResponse
    {
        $employee = $this->employee($id);

        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'file'  => ['required', 'file', 'max:' . self::MAX_FILE_KB, 'mimes:' . self::ALLOWED_MIMES],
        ]);

        $file = $validated['file'];
        $path = $file->store('companies/' . $employee->company_id . '/employees/' . $employee->id . '/documents');

        $document = Document::create([
            'company_id'      => $employee->company_id,
            'uploaded_by'     => null, // Company Admin actor isn't a User row
            'title'           => $validated['title'],
            'file_path'       => $path,
            'file_name'       => $file->getClientOriginalName(),
            'file_size_bytes' => $file->getSize(),
            'linked_to_type'  => 'Employee',
            'linked_to_id'    => $employee->id,
        ]);

        $this->logActivity($employee->company_id, 'document_uploaded', $employee->id, ['document_id' => $document->id]);

        return ApiResponse::success($document, 'Document uploaded', 201);
    }

    public function deleteDocument(int $id, int $documentId): JsonResponse
    {
        $employee = $this->employee($id);

        $document = Document::where('linked_to_type', 'Employee')
            ->where('linked_to_id', $employee->id)
            ->findOrFail($documentId);

        if ($document->file_path) Storage::delete($document->file_path);
        $document->delete();

        return ApiResponse::success(null, 'Document deleted');
    }

    // ── Notes ───────────────────────────────────────────────────────────────

    public function notes(int $id): JsonResponse
    {
        $employee = $this->employee($id);

        $notes = EmployeeNote::where('employee_id', $employee->id)
            ->with('authorAdmin:id,name')
            ->orderByDesc('created_at')
            ->get();

        return ApiResponse::success($notes);
    }

    public function addNote(Request $request, int $id): JsonResponse
    {
        $employee = $this->employee($id);

        $validated = $request->validate(['body' => ['required', 'string', 'max:2000']]);

        $note = EmployeeNote::create([
            'company_id'      => $employee->company_id,
            'employee_id'     => $employee->id,
            'author_admin_id' => $this->admin()->id ?? null,
            'body'            => $validated['body'],
        ]);

        return ApiResponse::success($note->load('authorAdmin:id,name'), 'Note added', 201);
    }
}
