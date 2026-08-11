<?php

namespace App\Http\Controllers\Api\Admin;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Project;
use App\Models\ProjectComment;
use App\Models\ProjectCommentAttachment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

// Admin mirror of Api\User\ProjectCommentAttachmentController — Company
// Admin sees every comment regardless of visibility (no internal/client
// split applies to the Admin guard), and may attach to any comment (not
// restricted to their own authorship, since Admin oversees everything).
class ProjectCommentAttachmentController extends Controller
{
    private const MAX_FILE_KB = 10240;
    private const ALLOWED_MIMES = 'pdf,doc,docx,xls,xlsx,png,jpg,jpeg,zip';

    private function admin()   { return auth('admin')->user(); }
    private function companyIds(): array
    {
        return $this->admin()->companies()->pluck('id')->toArray();
    }

    private function comment(int $projectId, int $commentId): ProjectComment
    {
        $project = Project::whereIn('company_id', $this->companyIds())->findOrFail($projectId);
        return ProjectComment::where('project_id', $project->id)->findOrFail($commentId);
    }

    public function index(int $projectId, int $commentId): JsonResponse
    {
        $comment = $this->comment($projectId, $commentId);

        $attachments = ProjectCommentAttachment::where('comment_id', $comment->id)
            ->with(['uploadedByAdmin:id,name', 'uploadedByUser:id,name'])
            ->orderByDesc('created_at')
            ->get();

        return ApiResponse::success($attachments);
    }

    public function store(Request $request, int $projectId, int $commentId): JsonResponse
    {
        $comment = $this->comment($projectId, $commentId);

        $validated = $request->validate([
            'file' => ['required', 'file', 'max:' . self::MAX_FILE_KB, 'mimes:' . self::ALLOWED_MIMES],
        ]);

        $project = $comment->project;
        $file = $validated['file'];
        $folder = ($project->storage_folder ?: 'companies/' . $project->company_id . '/projects/' . $project->id) . '/comments/' . $comment->id . '/attachments';
        $path = $file->store($folder);

        $attachment = ProjectCommentAttachment::create([
            'company_id'           => $project->company_id,
            'comment_id'           => $comment->id,
            'uploaded_by_admin_id' => $this->admin()->id,
            'uploaded_by_user_id'  => null,
            'original_name'        => $file->getClientOriginalName(),
            'file_name'            => $file->hashName(),
            'file_path'            => $path,
            'file_type'            => $file->getClientMimeType(),
            'file_size'            => $file->getSize(),
        ]);

        return ApiResponse::success($attachment->load('uploadedByAdmin:id,name'), 'Attachment uploaded', 201);
    }

    public function download(int $projectId, int $commentId, int $id): StreamedResponse
    {
        $comment = $this->comment($projectId, $commentId);
        $attachment = ProjectCommentAttachment::where('comment_id', $comment->id)->findOrFail($id);

        return Storage::download($attachment->file_path, $attachment->original_name);
    }
}
