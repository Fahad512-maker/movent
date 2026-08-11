<?php

namespace App\Http\Controllers\Api\Client;

use App\Helpers\ApiResponse;
use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\Deliverable;
use App\Models\Document;
use App\Models\Project;
use App\Models\ProjectAttachment;
use App\Models\Revision;
use App\Models\Task;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProjectController extends Controller
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

        $query = Project::whereIn('client_id', $clientIds)
            ->with(['projectManager:id,name']);

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('search')) {
            $query->where('name', 'like', '%' . $request->search . '%');
        }

        $projects = $query->orderByDesc('created_at')
            ->get(['id', 'name', 'status', 'start_date', 'deadline', 'project_manager_id', 'created_at']);

        $projectIds = $projects->pluck('id');
        $taskStats = Task::whereIn('project_id', $projectIds)
            ->selectRaw('project_id, COUNT(*) as total, SUM(CASE WHEN status = "completed" THEN 1 ELSE 0 END) as done')
            ->groupBy('project_id')
            ->get()
            ->keyBy('project_id');

        $projects = $projects->map(function ($p) use ($taskStats) {
            $stats = $taskStats[$p->id] ?? null;
            $p->progress = $stats && $stats->total > 0
                ? round(($stats->done / $stats->total) * 100)
                : 0;
            return $p;
        });

        return ApiResponse::success($projects);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $clientIds = $this->clientIds($request);

        $project = Project::where('id', $id)
            ->whereIn('client_id', $clientIds)
            ->with([
                'projectManager:id,name',
                'deliverables' => fn($q) => $q->whereIn('status', ['delivered', 'approved', 'revision_requested'])
                                              ->with(['uploadedBy:id,name']),
            ])
            ->firstOrFail();

        $totalTasks = Task::where('project_id', $project->id)->count();
        $doneTasks  = Task::where('project_id', $project->id)->where('status', 'completed')->count();
        $project->progress = $totalTasks > 0 ? round(($doneTasks / $totalTasks) * 100) : 0;

        $documents = Document::where('linked_to_type', 'project')
            ->where('linked_to_id', $id)
            ->where('is_visible_to_client', true)
            ->with(['uploadedBy:id,name'])
            ->orderByDesc('created_at')
            ->get(['id', 'title', 'type', 'file_name', 'file_size_bytes', 'uploaded_by', 'created_at'])
            ->map(fn ($d) => [
                'id' => $d->id, 'source' => 'document', 'title' => $d->title, 'type' => $d->type,
                'file_name' => $d->file_name, 'file_size_bytes' => $d->file_size_bytes,
                'uploaded_by' => $d->uploadedBy, 'created_at' => $d->created_at,
            ]);

        $attachments = ProjectAttachment::where('project_id', $id)
            ->where('is_visible_to_client', true)
            ->with(['uploadedByAdmin:id,name', 'uploadedByUser:id,name'])
            ->orderByDesc('created_at')
            ->get()
            ->map(fn ($a) => [
                'id' => $a->id, 'source' => 'attachment', 'title' => $a->original_name, 'type' => $a->file_type,
                'file_name' => $a->original_name, 'file_size_bytes' => $a->file_size,
                'uploaded_by' => $a->uploadedByAdmin ?? $a->uploadedByUser, 'created_at' => $a->created_at,
            ]);

        $files = $documents->concat($attachments)->sortByDesc('created_at')->values();

        $activity = collect();
        $activity->push(['date' => $project->created_at, 'icon' => '🚀', 'text' => 'Project created', 'by' => null]);

        foreach ($project->deliverables as $d) {
            $activity->push(['date' => $d->updated_at, 'icon' => '📦', 'text' => "Deliverable \"{$d->title}\" marked as {$d->status}", 'by' => $d->uploadedBy?->name]);
        }

        foreach ($files as $f) {
            $activity->push(['date' => $f['created_at'], 'icon' => '📎', 'text' => "File \"{$f['title']}\" uploaded", 'by' => $f['uploaded_by']?->name]);
        }

        if ($project->status === 'completed' && $project->completed_at) {
            $activity->push(['date' => $project->completed_at, 'icon' => '✅', 'text' => 'Project completed', 'by' => null]);
        }

        return ApiResponse::success([
            'project'  => $project,
            'files'    => $files,
            'activity' => $activity->sortByDesc('date')->values(),
        ]);
    }

    public function approveDeliverable(Request $request, int $id): JsonResponse
    {
        $clientIds = $this->clientIds($request);

        $deliverable = Deliverable::whereHas('project', fn($q) => $q->whereIn('client_id', $clientIds))
            ->findOrFail($id);

        $deliverable->update(['status' => 'approved']);

        return ApiResponse::success(null, 'Deliverable approved');
    }

    public function requestRevision(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate(['notes' => 'nullable|string|max:1000']);

        $clientIds = $this->clientIds($request);

        $deliverable = Deliverable::whereHas('project', fn($q) => $q->whereIn('client_id', $clientIds))
            ->findOrFail($id);

        Revision::create([
            'deliverable_id' => $deliverable->id,
            'requested_by'   => $request->user()->id,
            'feedback'       => $validated['notes'] ?? null,
            'status'         => 'open',
        ]);

        $deliverable->update(['status' => 'revision_requested']);

        return ApiResponse::success(null, 'Revision requested');
    }
}
