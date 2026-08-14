import api from '@/lib/axios';
import {
  Project, Task, TeamMember, Timesheet, Deliverable, Revision,
  ProductionQueueItem, ProjectStatus, Priority, TaskStatus, TeamRole, ProjectComment,
  ProjectAttachment, ProjectTaskAttachment, ChatMessage, TaskActivity, CompletionStatus,
  MentionableUser, ProjectCommentAttachment,
} from './adminProjectService';

export interface ProjectPayload {
  name?: string;
  description?: string | null;
  status?: ProjectStatus;
  priority?: Priority;
  start_date?: string | null;
  deadline?: string | null;
}

export interface CreateProjectPayload extends ProjectPayload {
  name: string;
  client_id?: number | null;
  lead_id?: number | null;
  project_manager_id?: number | null;
  // Alternate handoff trigger — a paid invoice instead of a Won lead/own
  // client. See Api\User\ProjectController::store()'s handoff branch.
  source_invoice_id?: number | null;
}

export interface TaskPayload {
  assigned_to?: number | null;
  title: string;
  description?: string | null;
  notes?: string | null;
  status?: TaskStatus;
  priority?: Priority;
  estimated_hours?: number | null;
  start_date?: string | null;
  due_date?: string | null;
  task_type?: 'general' | 'production' | 'client_request' | 'internal';
  // Update-only fields — not part of task creation.
  comment?: string;
  qa_assigned_to?: number | null;
  production_assigned_to?: number | null;
}

export interface CompanyUserOption {
  id: number;
  name: string;
  email: string;
  role_type: string;
  has_project_management_access: boolean;
}

export interface CreateUserPayload {
  name: string;
  email: string;
  password?: string;
  permissions?: Record<string, string[]>; // moduleKey -> permissionKey[], capped by the caller's own grants
}

export const userProjectService = {
  list: async (params?: Record<string, string>): Promise<Project[]> => {
    const res = await api.get('/user/projects', { params });
    return res.data.data;
  },

  create: async (payload: CreateProjectPayload): Promise<Project> => {
    const res = await api.post('/user/projects', payload);
    return res.data.data;
  },

  getOne: async (id: number): Promise<Project> => {
    const res = await api.get(`/user/projects/${id}`);
    return res.data.data;
  },

  update: async (id: number, payload: ProjectPayload): Promise<Project> => {
    const res = await api.put(`/user/projects/${id}`, payload);
    return res.data.data;
  },

  completionStatus: async (id: number): Promise<CompletionStatus> => {
    const res = await api.get(`/user/projects/${id}/completion-status`);
    return res.data.data;
  },

  // Activate a payment-started draft project (status draft → active).
  // Requires canActivateProjects — the same key that makes drafts visible.
  activate: async (id: number): Promise<Project> => {
    const res = await api.post(`/user/projects/${id}/activate`);
    return res.data.data;
  },

  complete: async (id: number): Promise<Project> => {
    const res = await api.post(`/user/projects/${id}/complete`);
    return res.data.data;
  },

  close: async (id: number, payload?: { force?: boolean; reason?: string; confirm_unpaid_invoice?: boolean }): Promise<Project> => {
    const res = await api.post(`/user/projects/${id}/close`, payload ?? {});
    return res.data.data;
  },

  reopen: async (id: number, reason: string): Promise<Project> => {
    const res = await api.post(`/user/projects/${id}/reopen`, { reason });
    return res.data.data;
  },

  linkInvoice: async (id: number, invoiceId: number): Promise<void> => {
    await api.post(`/user/projects/${id}/invoices/link`, { invoice_id: invoiceId });
  },

  unlinkInvoice: async (id: number, invoiceId: number): Promise<void> => {
    await api.delete(`/user/projects/${id}/invoices/${invoiceId}`);
  },

  createInvoice: async (id: number, payload: {
    due_date?: string | null; currency?: string; tax_rate?: number; discount_amount?: number;
    notes?: string | null; items: { description: string; quantity: number; unit_price: number }[];
  }): Promise<{ id: number }> => {
    const res = await api.post(`/user/projects/${id}/invoices`, payload);
    return res.data.data;
  },

  tasks: {
    list: async (projectId: number, params?: Record<string, string>): Promise<Task[]> => {
      const res = await api.get(`/user/projects/${projectId}/tasks`, { params });
      return res.data.data;
    },
    listAll: async (params?: Record<string, string>): Promise<Task[]> => {
      const res = await api.get('/user/tasks', { params });
      return res.data.data;
    },
    myTasks: async (params?: Record<string, string>): Promise<Task[]> => {
      const res = await api.get('/user/my-tasks', { params });
      return res.data.data;
    },
    create: async (projectId: number, payload: TaskPayload): Promise<Task> => {
      const res = await api.post(`/user/projects/${projectId}/tasks`, payload);
      return res.data.data;
    },
    update: async (projectId: number, id: number, payload: Partial<TaskPayload> & { status?: TaskStatus }): Promise<Task> => {
      const res = await api.put(`/user/projects/${projectId}/tasks/${id}`, payload);
      return res.data.data;
    },
    activity: async (projectId: number, id: number): Promise<TaskActivity[]> => {
      const res = await api.get(`/user/projects/${projectId}/tasks/${id}/activity`);
      return res.data.data;
    },
    // Resolves a bare task id to its project_id — used by the guard-agnostic
    // /task/{id} share-link redirector (see app/task/[taskId]/page.tsx).
    lookup: async (id: number): Promise<{ project_id: number }> => {
      const res = await api.get(`/user/tasks/${id}/lookup`);
      return res.data.data;
    },
    // No permission gate (unlike team.companyUsers() below) — every
    // task-status actor needs these for the QA/Production handoff pickers,
    // regardless of whether they hold canCreateTasks/canEditTasks/etc.
    qaUsers: async (): Promise<{ id: number; name: string }[]> => (await api.get('/user/tasks/qa-users')).data.data,
    productionUsers: async (): Promise<{ id: number; name: string }[]> => (await api.get('/user/tasks/production-users')).data.data,
    // No permission gate — a Developer/Team Member reassigning THEIR OWN
    // task (see the isDevOrTeamAssignee bypass in Api\User\TaskController::
    // update()) needs the full non-seller company user list.
    assignableUsers: async (): Promise<{ id: number; name: string; role_type: string }[]> => (await api.get('/user/tasks/assignable-users')).data.data,
  },

  team: {
    companyUsers: async (): Promise<CompanyUserOption[]> => (await api.get('/user/projects/company-users')).data.data,
    assign: async (projectId: number, members: { user_id: number; role_in_project: TeamRole }[]): Promise<TeamMember[]> => {
      const res = await api.put(`/user/projects/${projectId}/team`, { members });
      return res.data.data;
    },
    remove: async (projectId: number, memberId: number): Promise<void> => {
      await api.delete(`/user/projects/${projectId}/team/${memberId}`);
    },
    createUser: async (payload: CreateUserPayload) => {
      const res = await api.post('/user/users', payload);
      return res.data.data;
    },
  },

  comments: {
    list: async (projectId: number, taskId?: number): Promise<ProjectComment[]> => {
      const res = await api.get(`/user/projects/${projectId}/comments`, { params: taskId ? { task_id: taskId } : {} });
      return res.data.data;
    },
    remove: async (projectId: number, commentId: number): Promise<void> => {
      await api.delete(`/user/projects/${projectId}/comments/${commentId}`);
    },
    update: async (projectId: number, commentId: number, body: string): Promise<ProjectComment> => {
      const res = await api.patch(`/user/projects/${projectId}/comments/${commentId}`, { body });
      return res.data.data;
    },
    add: async (projectId: number, body: string, taskId?: number, visibility?: 'internal' | 'client', mentionedUserIds?: number[], deliverableId?: number, parentCommentId?: number): Promise<ProjectComment> => {
      const res = await api.post(`/user/projects/${projectId}/comments`, {
        body, task_id: taskId ?? null, visibility, mentioned_user_ids: mentionedUserIds ?? [], deliverable_id: deliverableId ?? null,
        parent_comment_id: parentCommentId ?? null,
      });
      return res.data.data;
    },
    mentionableUsers: async (projectId: number, visibility: 'internal' | 'client', taskId?: number): Promise<MentionableUser[]> => {
      const res = await api.get(`/user/projects/${projectId}/mentionable-users`, { params: { visibility, task_id: taskId } });
      return res.data.data;
    },
    toggleLike: async (projectId: number, commentId: number): Promise<{ liked: boolean; likes_count: number }> => {
      const res = await api.post(`/user/projects/${projectId}/comments/${commentId}/like`);
      return res.data.data;
    },
    attachments: {
      list: async (projectId: number, commentId: number): Promise<ProjectCommentAttachment[]> => {
        const res = await api.get(`/user/projects/${projectId}/comments/${commentId}/attachments`);
        return res.data.data;
      },
      upload: async (projectId: number, commentId: number, file: File): Promise<ProjectCommentAttachment> => {
        const form = new FormData();
        form.append('file', file);
        const res = await api.post(`/user/projects/${projectId}/comments/${commentId}/attachments`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        return res.data.data;
      },
      download: async (projectId: number, commentId: number, id: number, fileName: string): Promise<void> => {
        const res = await api.get(`/user/projects/${projectId}/comments/${commentId}/attachments/${id}/download`, { responseType: 'blob' });
        const url = URL.createObjectURL(res.data);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      },
    },
  },

  chat: {
    list: async (projectId: number): Promise<ChatMessage[]> => {
      const res = await api.get(`/user/projects/${projectId}/chat`);
      return res.data.data.messages;
    },
    // 'bridge' = Project Manager (or company-wide override) with client-facing
    // permission — sees + posts both internal and client-visible messages,
    // can mark a message client-visible. 'internal' = Developer/Designer/QA/
    // Production/Team Member, or a PM without the client-facing permission —
    // internal messages only, never sees/posts client-visible ones. 'linked'
    // = Seller-style access — client-visible messages only, always posts as
    // 'client'. Only 'bridge' shows the "Visible to client" toggle.
    accessMode: async (projectId: number): Promise<'bridge' | 'internal' | 'linked'> => {
      const res = await api.get(`/user/projects/${projectId}/chat`);
      return res.data.data.access_mode;
    },
    addParticipant: async (projectId: number, userId: number): Promise<void> => {
      await api.post(`/user/projects/${projectId}/chat/participants`, { user_id: userId });
    },
    send: async (projectId: number, content: string, file?: File | null, visibility?: 'internal' | 'client'): Promise<ChatMessage> => {
      if (file) {
        const form = new FormData();
        if (content) form.append('content', content);
        form.append('file', file);
        if (visibility) form.append('visibility', visibility);
        const res = await api.post(`/user/projects/${projectId}/chat`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        return res.data.data;
      }
      const res = await api.post(`/user/projects/${projectId}/chat`, { content, visibility });
      return res.data.data;
    },
    downloadAttachment: async (projectId: number, messageId: number, fileName: string): Promise<void> => {
      const res = await api.get(`/user/projects/${projectId}/chat/${messageId}/attachment`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  },

  timesheets: {
    list: async (params?: Record<string, string>): Promise<Timesheet[]> => {
      const res = await api.get('/user/timesheets', { params });
      return res.data.data;
    },
    create: async (payload: { task_id: number; hours_logged: number; log_date: string; notes?: string | null }): Promise<Timesheet> => {
      const res = await api.post('/user/timesheets', payload);
      return res.data.data;
    },
    approve: async (id: number, status: 'approved' | 'rejected'): Promise<Timesheet> => {
      const res = await api.patch(`/user/timesheets/${id}/approve`, { status });
      return res.data.data;
    },
  },

  production: {
    myQueue: async (params?: Record<string, string>): Promise<ProductionQueueItem[]> => {
      const res = await api.get('/user/production/my-queue', { params });
      return res.data.data;
    },
    queue: async (params?: Record<string, string>): Promise<ProductionQueueItem[]> => {
      const res = await api.get('/user/production/queue', { params });
      return res.data.data;
    },
    start: async (id: number): Promise<ProductionQueueItem> => {
      const res = await api.patch(`/user/production/${id}/start`);
      return res.data.data;
    },
    submit: async (id: number): Promise<ProductionQueueItem> => {
      const res = await api.patch(`/user/production/${id}/submit`);
      return res.data.data;
    },
  },

  deliverables: {
    list: async (projectId: number): Promise<Deliverable[]> => {
      const res = await api.get(`/user/projects/${projectId}/deliverables`);
      return res.data.data;
    },
    upload: async (projectId: number, file: File, title: string, taskId?: number): Promise<Deliverable> => {
      const form = new FormData();
      form.append('file', file);
      form.append('title', title);
      if (taskId) form.append('task_id', String(taskId));
      const res = await api.post(`/user/projects/${projectId}/deliverables`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data;
    },
    requestRevision: async (id: number, feedback?: string): Promise<Revision> => {
      const res = await api.post(`/user/deliverables/${id}/request-revision`, { feedback: feedback ?? null });
      return res.data.data;
    },
    resolveRevision: async (revisionId: number): Promise<Revision> => {
      const res = await api.patch(`/user/revisions/${revisionId}/resolve`);
      return res.data.data;
    },
    approve: async (id: number): Promise<Deliverable> => {
      const res = await api.patch(`/user/deliverables/${id}/approve`);
      return res.data.data;
    },
    reject: async (id: number, feedback?: string): Promise<Deliverable> => {
      const res = await api.patch(`/user/deliverables/${id}/reject`, { feedback: feedback ?? null });
      return res.data.data;
    },
    revisions: async (deliverableId: number): Promise<Revision[]> => {
      const res = await api.get(`/user/deliverables/${deliverableId}/revisions`);
      return res.data.data;
    },
  },

  attachments: {
    list: async (projectId: number): Promise<ProjectAttachment[]> => {
      const res = await api.get(`/user/projects/${projectId}/attachments`);
      return res.data.data;
    },
    upload: async (projectId: number, file: File, isVisibleToClient: boolean = false): Promise<ProjectAttachment> => {
      const form = new FormData();
      form.append('file', file);
      form.append('is_visible_to_client', isVisibleToClient ? '1' : '0');
      const res = await api.post(`/user/projects/${projectId}/attachments`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data;
    },
    download: async (projectId: number, id: number, fileName: string): Promise<void> => {
      const res = await api.get(`/user/projects/${projectId}/attachments/${id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    remove: async (projectId: number, id: number): Promise<void> => {
      await api.delete(`/user/projects/${projectId}/attachments/${id}`);
    },
  },

  taskAttachments: {
    list: async (projectId: number, taskId: number): Promise<ProjectTaskAttachment[]> => {
      const res = await api.get(`/user/projects/${projectId}/tasks/${taskId}/attachments`);
      return res.data.data;
    },
    upload: async (projectId: number, taskId: number, file: File): Promise<ProjectTaskAttachment> => {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post(`/user/projects/${projectId}/tasks/${taskId}/attachments`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data;
    },
    download: async (projectId: number, taskId: number, id: number, fileName: string): Promise<void> => {
      const res = await api.get(`/user/projects/${projectId}/tasks/${taskId}/attachments/${id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    remove: async (projectId: number, taskId: number, id: number): Promise<void> => {
      await api.delete(`/user/projects/${projectId}/tasks/${taskId}/attachments/${id}`);
    },
  },

  reports: {
    status: async (): Promise<Record<string, number>> => (await api.get('/user/projects/reports/status')).data.data,
    taskStatus: async (): Promise<Record<string, number>> => (await api.get('/user/projects/reports/task-status')).data.data,
    overdue: async (): Promise<Task[]> => (await api.get('/user/projects/reports/overdue')).data.data,
  },
};

export type { Project, Task, TeamMember, Timesheet, Deliverable, Revision, ProductionQueueItem, ProjectAttachment, ProjectTaskAttachment };
