<?php

namespace App\Http\Controllers\Api\Client;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\Project;
use App\Models\ProjectAttachment;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class AttachmentController extends Controller
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

    public function download(Request $request, int $id): mixed
    {
        $clientIds  = $this->clientIds($request);
        $projectIds = Project::whereIn('client_id', $clientIds)->pluck('id');

        $attachment = ProjectAttachment::where('id', $id)
            ->where('is_visible_to_client', true)
            ->whereIn('project_id', $projectIds)
            ->firstOrFail();

        return Storage::download($attachment->file_path, $attachment->original_name);
    }
}
