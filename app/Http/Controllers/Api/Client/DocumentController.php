<?php

namespace App\Http\Controllers\Api\Client;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\Document;
use App\Models\Project;
use App\Models\ProjectAttachment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class DocumentController extends Controller
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
        $clientIds  = $this->clientIds($request);
        $projectIds = Project::whereIn('client_id', $clientIds)->pluck('id');

        $query = Document::where('is_visible_to_client', true)
            ->where(function ($q) use ($projectIds, $clientIds) {
                $q->where(function ($sub) use ($projectIds) {
                    $sub->where('linked_to_type', 'project')
                        ->whereIn('linked_to_id', $projectIds);
                })->orWhere(function ($sub) use ($clientIds) {
                    $sub->where('linked_to_type', 'client')
                        ->whereIn('linked_to_id', $clientIds);
                });
            });

        if ($request->filled('project_id')) {
            $query->where('linked_to_type', 'project')->where('linked_to_id', $request->project_id);
        }
        if ($request->filled('type')) {
            $query->where('type', $request->type);
        }

        $docs = $query->with(['uploadedBy:id,name'])
            ->get(['id', 'title', 'type', 'file_name', 'file_size_bytes', 'linked_to_type', 'linked_to_id', 'uploaded_by', 'created_at'])
            ->map(fn ($d) => [
                'id' => $d->id, 'source' => 'document', 'title' => $d->title, 'type' => $d->type,
                'file_name' => $d->file_name, 'file_size_bytes' => $d->file_size_bytes,
                'linked_to_type' => $d->linked_to_type, 'linked_to_id' => $d->linked_to_id,
                'uploaded_by' => $d->uploadedBy, 'created_at' => $d->created_at,
            ]);

        $attachmentsQuery = ProjectAttachment::where('is_visible_to_client', true)
            ->whereIn('project_id', $projectIds);

        if ($request->filled('project_id')) {
            $attachmentsQuery->where('project_id', $request->project_id);
        }

        $attachments = $attachmentsQuery->with(['uploadedByAdmin:id,name', 'uploadedByUser:id,name'])
            ->get()
            ->map(fn ($a) => [
                'id' => $a->id, 'source' => 'attachment', 'title' => $a->original_name,
                'type' => $this->typeFromExtension(pathinfo($a->original_name, PATHINFO_EXTENSION)),
                'file_name' => $a->original_name, 'file_size_bytes' => $a->file_size,
                'linked_to_type' => 'project', 'linked_to_id' => $a->project_id,
                'uploaded_by' => $a->uploadedByAdmin ?? $a->uploadedByUser, 'created_at' => $a->created_at,
            ]);

        $all = $docs->concat($attachments);

        if ($request->filled('type')) {
            $all = $all->where('type', $request->type)->values();
        }

        return ApiResponse::success($all->sortByDesc('created_at')->values());
    }

    private function typeFromExtension(string $ext): string
    {
        $ext = strtolower($ext);
        return match (true) {
            $ext === 'pdf' => 'pdf',
            in_array($ext, ['xls', 'xlsx', 'csv']) => 'spreadsheet',
            in_array($ext, ['doc', 'docx']) => 'word',
            in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'webp']) => 'image',
            default => 'other',
        };
    }

    public function download(Request $request, int $id): mixed
    {
        $clientIds  = $this->clientIds($request);
        $projectIds = Project::whereIn('client_id', $clientIds)->pluck('id');

        $doc = Document::where('id', $id)
            ->where('is_visible_to_client', true)
            ->where(function ($q) use ($projectIds, $clientIds) {
                $q->where(function ($sub) use ($projectIds) {
                    $sub->where('linked_to_type', 'project')->whereIn('linked_to_id', $projectIds);
                })->orWhere(function ($sub) use ($clientIds) {
                    $sub->where('linked_to_type', 'client')->whereIn('linked_to_id', $clientIds);
                });
            })
            ->firstOrFail();

        return Storage::download($doc->file_path, $doc->file_name);
    }
}
