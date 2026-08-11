<?php

namespace App\Http\Controllers\Api\User;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectTaskAttachment;
use App\Models\SystemAuditLog;
use App\Models\Task;
use App\Models\UserCompanyPermission;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class TaskAttachmentController extends Controller
{
    private const MAX_FILE_KB = 10240; // 10 MB per file
    private const ALLOWED_MIMES = 'pdf,doc,docx,xls,xlsx,png,jpg,jpeg,zip';

    private function user() { return auth('sanctum')->user(); }

    private function can(string $permKey): bool
    {
        $user = $this->user();
        return UserCompanyPermission::where('user_id', $user->id)
            ->where('company_id', $user->company_id)
            ->where('module_key', 'project_management')
            ->where('permission_key', $permKey)
            ->exists();
    }

    // Mirrors Api\User\ProjectAttachmentController::visibleProject()'s exact scope.
    private function visibleProject(int $projectId): Project
    {
        $user = $this->user();
        $base = Project::where('company_id', $user->company_id);

        if ($this->can('canViewAllCompanyProjects')) {
            return $base->findOrFail($projectId);
        }

        return $base->where(function ($q) use ($user) {
                $q->where('project_manager_id', $user->id)
                  ->orWhereHas('teamMembers', fn ($t) => $t->where('user_id', $user->id))
                  ->orWhereHas('tasks', fn ($t) => $t->where('assigned_to', $user->id));
            })
            ->findOrFail($projectId);
    }

    private function task(int $projectId, int $taskId): Task
    {
        $project = $this->visibleProject($projectId);

        return Task::where('project_id', $project->id)->findOrFail($taskId);
    }

    // GET /user/projects/{projectId}/tasks/{taskId}/attachments
    public function index(int $projectId, int $taskId): JsonResponse
    {
        if (!$this->can('canViewTaskAttachments')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $task = $this->task($projectId, $taskId);

        $attachments = ProjectTaskAttachment::where('task_id', $task->id)
            ->with(['uploadedByAdmin:id,name', 'uploadedByUser:id,name'])
            ->orderByDesc('created_at')
            ->get();

        return ApiResponse::success($attachments);
    }

    // POST /user/projects/{projectId}/tasks/{taskId}/attachments (multipart/form-data, one file per request)
    public function store(Request $request, int $projectId, int $taskId): JsonResponse
    {
        if (!$this->can('canUploadTaskAttachments')) {
            return ApiResponse::error('Permission denied', 403);
        }

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
            'uploaded_by_admin_id' => null,
            'uploaded_by_user_id'  => $this->user()->id,
            'original_name'        => $file->getClientOriginalName(),
            'file_name'            => $file->hashName(),
            'file_path'            => $path,
            'file_type'            => $file->getClientMimeType(),
            'file_size'            => $file->getSize(),
        ]);

        SystemAuditLog::create([
            'company_id'  => $project->company_id,
            'user_id'     => $this->user()->id,
            'action'      => 'attachment_uploaded',
            'module_key'  => 'project_management',
            'entity_type' => 'Task',
            'entity_id'   => $task->id,
            'new_values'  => ['attachment_id' => $attachment->id, 'original_name' => $attachment->original_name],
        ]);

        return ApiResponse::success($attachment->load('uploadedByUser:id,name'), 'Attachment uploaded', 201);
    }

    // GET /user/projects/{projectId}/tasks/{taskId}/attachments/{id}/download
    public function download(int $projectId, int $taskId, int $id): StreamedResponse
    {
        if (!$this->can('canDownloadTaskAttachments')) {
            abort(403, 'Permission denied');
        }

        $task = $this->task($projectId, $taskId);

        $attachment = ProjectTaskAttachment::where('task_id', $task->id)->findOrFail($id);

        return Storage::download($attachment->file_path, $attachment->original_name);
    }

    // DELETE /user/projects/{projectId}/tasks/{taskId}/attachments/{id}
    public function destroy(int $projectId, int $taskId, int $id): JsonResponse
    {
        if (!$this->can('canDeleteTaskAttachments')) {
            return ApiResponse::error('Permission denied', 403);
        }

        $task = $this->task($projectId, $taskId);

        $attachment = ProjectTaskAttachment::where('task_id', $task->id)->findOrFail($id);
        Storage::delete($attachment->file_path);
        $attachment->delete();

        return ApiResponse::success(null, 'Attachment deleted');
    }
}
