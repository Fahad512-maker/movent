<?php

namespace App\Http\Controllers\Api\Admin;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectTaskAttachment;
use App\Models\SystemAuditLog;
use App\Models\Task;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class TaskAttachmentController extends Controller
{
    private const MAX_FILE_KB = 10240; // 10 MB per file
    private const ALLOWED_MIMES = 'pdf,doc,docx,xls,xlsx,png,jpg,jpeg,zip';

    private function admin()   { return auth('admin')->user(); }
    private function companyIds(): array
    {
        return $this->admin()->companies()->pluck('id')->toArray();
    }

    private function task(int $projectId, int $taskId): Task
    {
        $project = Project::whereIn('company_id', $this->companyIds())->findOrFail($projectId);

        return Task::where('project_id', $project->id)->findOrFail($taskId);
    }

    // GET /admin/projects/{projectId}/tasks/{taskId}/attachments
    public function index(int $projectId, int $taskId): JsonResponse
    {
        $task = $this->task($projectId, $taskId);

        $attachments = ProjectTaskAttachment::where('task_id', $task->id)
            ->with(['uploadedByAdmin:id,name', 'uploadedByUser:id,name'])
            ->orderByDesc('created_at')
            ->get();

        return ApiResponse::success($attachments);
    }

    // POST /admin/projects/{projectId}/tasks/{taskId}/attachments (multipart/form-data, one file per request)
    public function store(Request $request, int $projectId, int $taskId): JsonResponse
    {
        $task = $this->task($projectId, $taskId);
        $project = $task->project;

        $validated = $request->validate([
            'file' => ['required', 'file', 'max:' . self::MAX_FILE_KB, 'mimes:' . self::ALLOWED_MIMES],
        ]);

        $file = $validated['file'];
        $folder = ($project->storage_folder ?: 'companies/' . $project->company_id . '/projects/' . $project->id) . '/tasks/' . $task->id . '/attachments';
        $path = $file->store($folder);

        $attachment = ProjectTaskAttachment::create([
            'company_id'           => $project->company_id,
            'project_id'           => $project->id,
            'task_id'              => $task->id,
            // Company Admin has no `users` row; only one of these two is ever set.
            'uploaded_by_admin_id' => $this->admin()->id ?? null,
            'uploaded_by_user_id'  => null,
            'original_name'        => $file->getClientOriginalName(),
            'file_name'            => $file->hashName(),
            'file_path'            => $path,
            'file_type'            => $file->getClientMimeType(),
            'file_size'            => $file->getSize(),
        ]);

        SystemAuditLog::create([
            'company_id'  => $project->company_id,
            'user_id'     => null, // Company Admin actor isn't a User row
            'action'      => 'attachment_uploaded',
            'module_key'  => 'project_management',
            'entity_type' => 'Task',
            'entity_id'   => $task->id,
            'new_values'  => ['attachment_id' => $attachment->id, 'original_name' => $attachment->original_name],
        ]);

        return ApiResponse::success($attachment->load('uploadedByAdmin:id,name'), 'Attachment uploaded', 201);
    }

    // GET /admin/projects/{projectId}/tasks/{taskId}/attachments/{id}/download
    public function download(int $projectId, int $taskId, int $id): StreamedResponse
    {
        $task = $this->task($projectId, $taskId);

        $attachment = ProjectTaskAttachment::where('task_id', $task->id)->findOrFail($id);

        return Storage::download($attachment->file_path, $attachment->original_name);
    }

    // DELETE /admin/projects/{projectId}/tasks/{taskId}/attachments/{id}
    public function destroy(int $projectId, int $taskId, int $id): JsonResponse
    {
        $task = $this->task($projectId, $taskId);

        $attachment = ProjectTaskAttachment::where('task_id', $task->id)->findOrFail($id);
        Storage::delete($attachment->file_path);
        $attachment->delete();

        return ApiResponse::success(null, 'Attachment deleted');
    }
}
