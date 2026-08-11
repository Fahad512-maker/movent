'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { getAuthType } from '@/lib/auth';
import { adminProjectService } from '@/lib/services/adminProjectService';
import { userProjectService } from '@/lib/services/userProjectService';

// Guard-agnostic "share link" for a task — /task/{id}. The task's own detail
// page lives at a different URL per guard (/admin/projects/{p}/tasks/{id} vs
// /projects/{p}/tasks/{id}), and the "Copy Link" button doesn't know the
// project_id up front, so it points here instead. This page resolves the
// current session's guard + the task's project_id, then redirects to the
// correct destination — Admin, PM, Developer, or any other role all land on
// their own guard's page, which does its own real permission check.
export default function TaskRedirectPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const router = useRouter();
  const [error, setError] = useState(false);

  useEffect(() => {
    const id = Number(taskId);
    if (!id) { setError(true); return; }

    const authType = getAuthType();
    const lookup = authType === 'admin' ? adminProjectService.tasks.lookup(id) : userProjectService.tasks.lookup(id);

    lookup
      .then(({ project_id }) => {
        router.replace(authType === 'admin' ? `/admin/projects/${project_id}/tasks/${id}` : `/projects/${project_id}/tasks/${id}`);
      })
      .catch(() => setError(true));
  }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <DashboardLayout title="Task">
      <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
        {error ? 'This task was not found, or you do not have access to it.' : 'Opening task…'}
      </div>
    </DashboardLayout>
  );
}
