import api from '@/lib/axios';

// 'draft' is only ever reached by auto-creation from a client's invoice payment
// (App\Services\PaymentProjectStartService) and only ever left via the activate
// endpoint — it is deliberately absent from the create/update status whitelists.
export type ProjectStatus = 'draft' | 'planning' | 'active' | 'on_hold' | 'blocked' | 'completed' | 'cancelled' | 'closed';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus =
  | 'todo' | 'in_progress' | 'blocked' | 'ready_for_qa' | 'in_qa'
  | 'qa_failed' | 'qa_passed' | 'ready_for_production' | 'in_production'
  | 'review' | 'completed' | 'cancelled';
export type TeamRole = 'project_manager' | 'production_user' | 'team_member' | 'reviewer';
export type TimesheetStatus = 'pending' | 'approved' | 'rejected';
export type ProductionQueueStatus =
  | 'queued' | 'in_progress' | 'blocked' | 'submitted' | 'revision_requested'
  | 'approved' | 'delivered' | 'completed' | 'rejected' | 'cancelled';
export type DeliverableStatus = 'draft' | 'delivered' | 'approved' | 'revision_requested' | 'submitted' | 'rejected';
export type RevisionStatus = 'open' | 'in_progress' | 'resolved';

export interface ProjectInvoice {
  id: number;
  invoice_number: string;
  total_amount: number;
  paid_amount: number;
  status: string;
  due_date: string | null;
  currency: string;
}

export interface Project {
  id: number;
  company_id: number;
  client_id: number | null;
  lead_id?: number | null;
  invoice_id: number | null;
  project_manager_id: number | null;
  // Set when this project was created as a Seller's sales handoff (see
  // Api\User\ProjectController::store()) — seller_id is who initiated it,
  // independent of whoever ends up as project_manager_id. source is a plain
  // marker ('sales_handoff' today), null for anything else.
  seller_id?: number | { id: number; name: string } | null;
  source?: string | null;
  seller?: { id: number; name: string; email?: string } | null;
  seller_assigned_at?: string | null;
  // Eloquent serializes the `createdBy` relation to this same snake_case
  // key as the raw column — becomes an object once eager-loaded, else the
  // raw scalar id. created_by only FKs to `users` — for Admin-created
  // projects it's always null and created_by_admin is populated instead.
  created_by: number | { id: number; name: string } | null;
  created_by_admin?: { id: number; name: string } | null;
  name: string;
  description: string | null;
  status: ProjectStatus;
  priority: Priority;
  budget: number | null;
  start_date: string | null;
  deadline: string | null;
  storage_folder: string | null;
  completed_at: string | null;
  closed_at?: string | null;
  close_reason?: string | null;
  reopened_at?: string | null;
  reopen_reason?: string | null;
  progress?: number;
  is_overdue?: boolean;
  // The logged-in staff member's own relationship to this project (Project
  // Manager / Team Member / Assigned / etc.) — only populated by
  // Api\User\ProjectController::index(), not the Admin-side listing.
  my_role?: string;
  company?: { id: number; name: string } | null;
  client?: { id: number; name: string; email?: string } | null;
  invoice?: { id: number; invoice_number: string; total_amount: number; status: string } | null;
  // Every invoice billed under this project (deposit/milestone/final/change
  // request) — distinct from the single `invoice` above (this project's
  // originating invoice). Only present when the viewer holds
  // canManageProjectInvoices (Company Admin always sees it).
  invoices?: ProjectInvoice[];
  billing_summary?: { total_invoiced: number; total_paid: number; outstanding: number };
  // Relation keys — Eloquent snake_cases relation method names when
  // serializing (projectManager() -> project_manager, teamMembers() ->
  // team_members). The API never returns the camelCase form.
  project_manager?: { id: number; name: string; role_type?: string } | null;
  tasks?: Task[];
  team_members?: TeamMember[];
  folders?: { id: number; name: string; folder_path: string }[];
  deliverables?: Deliverable[];
  created_at: string;
  updated_at: string;
}

export interface ProductionQueueItem {
  id: number;
  task_id: number;
  assigned_to: number | { id: number; name: string } | null;
  status: ProductionQueueStatus;
  priority_order: number;
  started_at: string | null;
  submitted_at: string | null;
  task?: { id: number; title: string; task_number?: string | null; project_id: number; due_date: string | null; priority?: Priority; progress?: number; project?: { id: number; name: string; company_id?: number }; deliverables?: Deliverable[] };
}

export interface Deliverable {
  id: number;
  project_id: number;
  task_id: number | null;
  uploaded_by: number | { id: number; name: string } | null;
  title: string;
  file_path: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size_bytes: number | null;
  status: DeliverableStatus;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
  task?: { id: number; title: string; task_number?: string | null } | null;
  project?: { id: number; name: string } | null;
}

export interface Revision {
  id: number;
  deliverable_id: number;
  requested_by: number | { id: number; name: string } | null;
  feedback: string | null;
  status: RevisionStatus;
  resolved_at: string | null;
}

export interface ProjectAttachment {
  id: number;
  company_id: number;
  project_id: number;
  uploaded_by_admin_id: number | null;
  uploaded_by_user_id: number | null;
  original_name: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  is_visible_to_client: boolean;
  created_at: string;
  updated_at: string;
  uploaded_by_admin?: { id: number; name: string } | null;
  uploaded_by_user?: { id: number; name: string } | null;
}

export interface ProjectTaskAttachment {
  id: number;
  company_id: number;
  project_id: number;
  task_id: number;
  uploaded_by_admin_id: number | null;
  uploaded_by_user_id: number | null;
  original_name: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
  updated_at: string;
  uploaded_by_admin?: { id: number; name: string } | null;
  uploaded_by_user?: { id: number; name: string } | null;
}

export interface Task {
  id: number;
  project_id: number;
  parent_task_id: number | null;
  // Auto-generated server-side on creation (e.g. "PRJ-50-TASK-0001") — never
  // user-editable, read-only everywhere in the UI.
  task_number?: string | null;
  // Object once eager-loaded (the common case for every page that displays
  // it), raw scalar id otherwise — Eloquent serializes assignedTo()/
  // assignedBy() to these exact snake_case keys, same as the raw columns.
  assigned_to: number | { id: number; name: string; email?: string } | null;
  // The QA user this task was handed off to when it entered "Ready for QA" —
  // required by the backend at that transition (see TaskStatusService).
  qa_assigned_to?: number | { id: number; name: string; email?: string } | null;
  // Optional Production/Deployment handoff when the task enters "Ready for
  // Production" — unlike qa_assigned_to, null is a valid "not assigned to
  // anyone specific" state, not a missing-field error.
  production_assigned_to?: number | { id: number; name: string; email?: string } | null;
  assigned_by: number | { id: number; name: string } | null;
  created_by: number | null;
  title: string;
  description: string | null;
  notes: string | null;
  status: TaskStatus;
  priority: Priority;
  task_type?: 'general' | 'production' | 'client_request' | 'internal';
  is_production_task?: boolean;
  progress?: number;
  estimated_hours: number | null;
  start_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  project?: { id: number; name: string; company_id: number; team_members?: TeamMember[] };
  production_queue?: ProductionQueueItem | null;
  deliverables?: Deliverable[];
  attachments_count?: number;
  created_at: string;
}

export interface TaskActivity {
  id: number;
  task_id: number;
  type: 'created' | 'updated' | 'status_changed' | 'assigned' | 'completed' | 'commented' | 'revision';
  description: string;
  causer_name: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export interface TeamMember {
  id: number;
  project_id: number;
  user_id: number;
  role_in_project: TeamRole;
  assigned_by: number | null;
  user?: { id: number; name: string; role_type?: string };
}

export interface Timesheet {
  id: number;
  task_id: number;
  user_id: number;
  hours_logged: number;
  log_date: string;
  notes: string | null;
  status: TimesheetStatus;
  approved_by: number | { id: number; name: string } | null;
  task?: { id: number; title: string; task_number?: string | null; project_id: number; project?: { id: number; name: string } };
  user?: { id: number; name: string };
}

export interface ProjectComment {
  id: number;
  project_id: number;
  task_id: number | null;
  deliverable_id?: number | null;
  body: string;
  // 'internal' = team-only note; 'client' = visible to a Seller who only has
  // canAddClientFacingComment/canViewLinkedProjects (not full canViewTasks);
  // 'seller_reply' = a Seller's reply to the one internal comment they were
  // tagged into — restricted to Company Admin/PM only.
  visibility?: 'internal' | 'client' | 'seller_reply';
  // The comment this one is replying to (seller_reply only, for now).
  parent_comment_id?: number | null;
  // @mentions actually recorded — already filtered server-side to eligible
  // recipients for this comment's visibility (see mentionCandidates()).
  mentions?: number[] | null;
  likes_count?: number;
  liked_by_me?: boolean;
  liked_by?: string[];
  author_admin?: { id: number; name: string } | null;
  author_user?: { id: number; name: string; role_type?: string } | null;
  attachments?: ProjectCommentAttachment[];
  created_at: string;
  updated_at?: string;
}

export interface MentionableUser { user_id: number; name: string }

export interface ProjectCommentAttachment {
  id: number;
  comment_id: number;
  original_name: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
  uploaded_by_admin?: { id: number; name: string } | null;
  uploaded_by_user?: { id: number; name: string } | null;
}

export interface ChatMessage {
  id: number;
  thread_id: number;
  content: string | null;
  message_type: 'text' | 'file' | 'image' | 'system';
  // 'internal' = team-only (budget/costing/deliverable talk); 'client' = also
  // visible to a Seller who only has "linked project chat" access.
  visibility: 'internal' | 'client';
  attachment_path: string | null;
  attachment_name: string | null;
  sender_id: number | null;
  sender_admin_id: number | null;
  sender?: { id: number; name: string; role_type?: string | null } | null;
  sender_admin?: { id: number; name: string } | null;
  // Only populated by the project-wise messenger (Api\*\ProjectMessengerController)
  // — General Chat and the older single-thread ProjectChatController never set this.
  mentions?: number[] | null;
  // Project-wise messenger only (Api\*\ProjectMessengerController) — staff
  // participants in this list never receive the message at all, same
  // convention as Api\User\ClientChatController.
  hidden_from_user_ids?: number[] | null;
  // When true, content/attachment have already been wiped server-side —
  // render the "This message was deleted" placeholder instead.
  is_deleted?: boolean;
  // Client-chat only (Api\Admin|User\ProjectClientChatController's
  // toggleHide()) — a staff-only view suppression, shared across every staff
  // viewer, never sent to or seen by the client. Render a "hidden" placeholder
  // in its place on the staff-facing pages only.
  hidden_for_staff?: boolean;
  sent_at: string;
  edited_at?: string | null;
}

export interface ActivityItem {
  type: 'log' | 'comment';
  action?: string;
  entity_type?: string;
  description?: string;
  causer_name?: string | null;
  meta?: Record<string, unknown> | null;
  body?: string;
  task_id?: number | null;
  author?: string;
  created_at: string;
}

export interface CompletionBlockerItem {
  id: number | null;
  title?: string;
  task_title?: string;
  deliverable_title?: string;
  status: string;
  due_date?: string | null;
  overdue?: boolean;
}

export interface CompletionStatus {
  status: ProjectStatus;
  ready: boolean;
  blockers: {
    pending_tasks: CompletionBlockerItem[];
    pending_production: CompletionBlockerItem[];
    pending_deliverables: CompletionBlockerItem[];
    pending_revisions: CompletionBlockerItem[];
    overdue_tasks: CompletionBlockerItem[];
  };
  has_unpaid_invoice: boolean;
}

export interface ProjectDashboard {
  total: number;
  planning: number;
  active: number;
  on_hold: number;
  completed: number;
  cancelled: number;
  overdue: number;
  assigned: number;
}

export interface ProjectPayload {
  company_id: number;
  client_id?: number | null;
  lead_id?: number | null;
  invoice_id?: number | null;
  project_manager_id?: number | null;
  name: string;
  description?: string | null;
  status?: ProjectStatus;
  priority?: Priority;
  budget?: number | null;
  start_date?: string | null;
  deadline?: string | null;
}

export interface TaskPayload {
  parent_task_id?: number | null;
  assigned_to?: number | null;
  title: string;
  description?: string | null;
  notes?: string | null;
  status?: TaskStatus;
  // Required by the backend when status is 'blocked' or 'qa_failed' (see
  // App\Services\TaskStatusService) — the reason/QA feedback, logged to the
  // task's activity history.
  comment?: string;
  // Required by the backend when status is being set to 'ready_for_qa' —
  // which QA user this task is handed off to.
  qa_assigned_to?: number | null;
  // Optional — Production/Deployment handoff when status is being set to
  // 'ready_for_production'.
  production_assigned_to?: number | null;
  priority?: Priority;
  estimated_hours?: number | null;
  start_date?: string | null;
  due_date?: string | null;
  progress?: number;
  task_type?: 'general' | 'production' | 'client_request' | 'internal';
}

export interface ProjectUserOption {
  user_id: number;
  name: string;
  email: string;
  role: string;
}

export interface ProjectUsersByRole {
  project_managers: ProjectUserOption[];
  production_users: ProjectUserOption[];
  developers: ProjectUserOption[];
  designers: ProjectUserOption[];
  qa_users: ProjectUserOption[];
  team_members: ProjectUserOption[];
  all_assignable_users: ProjectUserOption[];
  // Active Sellers of this company only — backs the "Assign Seller" dropdown.
  sellers: ProjectUserOption[];
}

export const adminProjectService = {
  list: async (params?: Record<string, string>): Promise<Project[]> => {
    const res = await api.get('/admin/projects', { params });
    return res.data.data;
  },

  // Assignable users for a single company, grouped by role — used by the
  // Project create/edit Project Manager dropdown so it never mixes in users
  // from another company this admin owns.
  projectUsers: async (companyId: number): Promise<ProjectUsersByRole> => {
    const res = await api.get(`/admin/companies/${companyId}/project-users`);
    return res.data.data;
  },

  getOne: async (id: number): Promise<Project> => {
    const res = await api.get(`/admin/projects/${id}`);
    return res.data.data;
  },

  create: async (payload: ProjectPayload): Promise<Project> => {
    const res = await api.post('/admin/projects', payload);
    return res.data.data;
  },

  update: async (id: number, payload: Partial<ProjectPayload>): Promise<Project> => {
    const res = await api.put(`/admin/projects/${id}`, payload);
    return res.data.data;
  },

  // Assign or switch this project's Seller. reason is optional and only
  // meaningful when switching from an already-assigned Seller.
  assignSeller: async (id: number, sellerId: number, reason?: string): Promise<Project> => {
    const res = await api.patch(`/admin/projects/${id}/seller`, { seller_id: sellerId, reason: reason || undefined });
    return res.data.data;
  },

  remove: async (id: number): Promise<void> => {
    await api.delete(`/admin/projects/${id}`);
  },

  dashboard: async (): Promise<ProjectDashboard> => {
    const res = await api.get('/admin/projects/dashboard');
    return res.data.data;
  },

  activity: async (id: number): Promise<ActivityItem[]> => {
    const res = await api.get(`/admin/projects/${id}/activity`);
    return res.data.data;
  },

  assignTeam: async (id: number, members: { user_id: number; role_in_project: TeamRole }[]): Promise<TeamMember[]> => {
    const res = await api.put(`/admin/projects/${id}/team`, { members });
    return res.data.data;
  },

  updateTeamMemberRole: async (id: number, memberId: number, role_in_project: TeamRole): Promise<TeamMember> => {
    const res = await api.patch(`/admin/projects/${id}/team/${memberId}`, { role_in_project });
    return res.data.data;
  },

  removeTeamMember: async (id: number, memberId: number): Promise<void> => {
    await api.delete(`/admin/projects/${id}/team/${memberId}`);
  },

  completionStatus: async (id: number): Promise<CompletionStatus> => {
    const res = await api.get(`/admin/projects/${id}/completion-status`);
    return res.data.data;
  },

  // Activate a payment-started draft project (status draft → active).
  activate: async (id: number): Promise<Project> => {
    const res = await api.post(`/admin/projects/${id}/activate`);
    return res.data.data;
  },

  complete: async (id: number): Promise<Project> => {
    const res = await api.post(`/admin/projects/${id}/complete`);
    return res.data.data;
  },

  close: async (id: number, payload?: { force?: boolean; reason?: string; confirm_unpaid_invoice?: boolean }): Promise<Project> => {
    const res = await api.post(`/admin/projects/${id}/close`, payload ?? {});
    return res.data.data;
  },

  reopen: async (id: number, reason: string): Promise<Project> => {
    const res = await api.post(`/admin/projects/${id}/reopen`, { reason });
    return res.data.data;
  },

  linkInvoice: async (id: number, invoiceId: number): Promise<void> => {
    await api.post(`/admin/projects/${id}/invoices/link`, { invoice_id: invoiceId });
  },

  unlinkInvoice: async (id: number, invoiceId: number): Promise<void> => {
    await api.delete(`/admin/projects/${id}/invoices/${invoiceId}`);
  },

  comments: {
    list: async (projectId: number, taskId?: number): Promise<ProjectComment[]> => {
      const res = await api.get(`/admin/projects/${projectId}/comments`, { params: taskId ? { task_id: taskId } : {} });
      return res.data.data;
    },
    remove: async (projectId: number, commentId: number): Promise<void> => {
      await api.delete(`/admin/projects/${projectId}/comments/${commentId}`);
    },
    update: async (projectId: number, commentId: number, body: string): Promise<ProjectComment> => {
      const res = await api.patch(`/admin/projects/${projectId}/comments/${commentId}`, { body });
      return res.data.data;
    },
    add: async (projectId: number, body: string, taskId?: number, visibility?: 'internal' | 'client', mentionedUserIds?: number[], deliverableId?: number, parentCommentId?: number): Promise<ProjectComment> => {
      const res = await api.post(`/admin/projects/${projectId}/comments`, {
        body, task_id: taskId ?? null, visibility, mentioned_user_ids: mentionedUserIds ?? [], deliverable_id: deliverableId ?? null,
        parent_comment_id: parentCommentId ?? null,
      });
      return res.data.data;
    },
    mentionableUsers: async (projectId: number, visibility: 'internal' | 'client', taskId?: number): Promise<MentionableUser[]> => {
      const res = await api.get(`/admin/projects/${projectId}/mentionable-users`, { params: { visibility, task_id: taskId } });
      return res.data.data;
    },
    toggleLike: async (projectId: number, commentId: number): Promise<{ liked: boolean; likes_count: number }> => {
      const res = await api.post(`/admin/projects/${projectId}/comments/${commentId}/like`);
      return res.data.data;
    },
    attachments: {
      list: async (projectId: number, commentId: number): Promise<ProjectCommentAttachment[]> => {
        const res = await api.get(`/admin/projects/${projectId}/comments/${commentId}/attachments`);
        return res.data.data;
      },
      upload: async (projectId: number, commentId: number, file: File): Promise<ProjectCommentAttachment> => {
        const form = new FormData();
        form.append('file', file);
        const res = await api.post(`/admin/projects/${projectId}/comments/${commentId}/attachments`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        return res.data.data;
      },
      download: async (projectId: number, commentId: number, id: number, fileName: string): Promise<void> => {
        const res = await api.get(`/admin/projects/${projectId}/comments/${commentId}/attachments/${id}/download`, { responseType: 'blob' });
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
      const res = await api.get(`/admin/projects/${projectId}/chat`);
      return res.data.data.messages;
    },
    send: async (projectId: number, content: string, file?: File | null, visibility?: 'internal' | 'client'): Promise<ChatMessage> => {
      if (file) {
        const form = new FormData();
        if (content) form.append('content', content);
        form.append('file', file);
        if (visibility) form.append('visibility', visibility);
        const res = await api.post(`/admin/projects/${projectId}/chat`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        return res.data.data;
      }
      const res = await api.post(`/admin/projects/${projectId}/chat`, { content, visibility });
      return res.data.data;
    },
    addParticipant: async (projectId: number, userId: number): Promise<void> => {
      await api.post(`/admin/projects/${projectId}/chat/participants`, { user_id: userId });
    },
    downloadAttachment: async (projectId: number, messageId: number, fileName: string): Promise<void> => {
      const res = await api.get(`/admin/projects/${projectId}/chat/${messageId}/attachment`, { responseType: 'blob' });
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

  tasks: {
    list: async (projectId: number, params?: Record<string, string>): Promise<Task[]> => {
      const res = await api.get(`/admin/projects/${projectId}/tasks`, { params });
      return res.data.data;
    },
    listAll: async (params?: Record<string, string>): Promise<Task[]> => {
      const res = await api.get('/admin/tasks', { params });
      return res.data.data;
    },
    create: async (projectId: number, payload: TaskPayload): Promise<Task> => {
      const res = await api.post(`/admin/projects/${projectId}/tasks`, payload);
      return res.data.data;
    },
    update: async (projectId: number, id: number, payload: Partial<TaskPayload>): Promise<Task> => {
      const res = await api.put(`/admin/projects/${projectId}/tasks/${id}`, payload);
      return res.data.data;
    },
    remove: async (projectId: number, id: number): Promise<void> => {
      await api.delete(`/admin/projects/${projectId}/tasks/${id}`);
    },
    activity: async (projectId: number, id: number): Promise<TaskActivity[]> => {
      const res = await api.get(`/admin/projects/${projectId}/tasks/${id}/activity`);
      return res.data.data;
    },
    // Resolves a bare task id to its project_id — used by the guard-agnostic
    // /task/{id} share-link redirector (see app/task/[taskId]/page.tsx).
    lookup: async (id: number): Promise<{ project_id: number }> => {
      const res = await api.get(`/admin/tasks/${id}/lookup`);
      return res.data.data;
    },
  },

  timesheets: {
    list: async (params?: Record<string, string>): Promise<Timesheet[]> => {
      const res = await api.get('/admin/timesheets', { params });
      return res.data.data;
    },
    create: async (payload: { task_id: number; user_id: number; hours_logged: number; log_date: string; notes?: string | null }): Promise<Timesheet> => {
      const res = await api.post('/admin/timesheets', payload);
      return res.data.data;
    },
    approve: async (id: number, status: 'approved' | 'rejected'): Promise<Timesheet> => {
      const res = await api.patch(`/admin/timesheets/${id}/approve`, { status });
      return res.data.data;
    },
    downloadExport: async (projectId?: number): Promise<void> => {
      const res = await api.get('/admin/timesheets/export', {
        params: projectId ? { project_id: projectId } : {},
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'timesheets.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
  },

  // Production — a section inside Project Management, gated on the `projects`
  // module key only (no separate `production` purchase/permission gate).
  production: {
    dashboard: async (): Promise<{
      assigned: number; in_progress: number; blocked: number; submitted: number;
      revision_requested: number; approved: number; delivered: number; completed: number;
      cancelled: number; overdue: number;
    }> => (await api.get('/admin/production/dashboard')).data.data,

    queue: async (params?: Record<string, string>): Promise<ProductionQueueItem[]> => {
      const res = await api.get('/admin/production/queue', { params });
      return res.data.data;
    },

    updateItem: async (id: number, payload: { status?: ProductionQueueStatus; assigned_to?: number | null; priority_order?: number }): Promise<ProductionQueueItem> => {
      const res = await api.patch(`/admin/production/queue/${id}`, payload);
      return res.data.data;
    },
  },

  deliverables: {
    list: async (projectId: number): Promise<Deliverable[]> => {
      const res = await api.get(`/admin/projects/${projectId}/deliverables`);
      return res.data.data;
    },

    upload: async (projectId: number, file: File, title: string, taskId?: number): Promise<Deliverable> => {
      const form = new FormData();
      form.append('file', file);
      form.append('title', title);
      if (taskId) form.append('task_id', String(taskId));
      const res = await api.post(`/admin/projects/${projectId}/deliverables`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data;
    },

    approve: async (id: number): Promise<Deliverable> => {
      const res = await api.patch(`/admin/deliverables/${id}/verify`);
      return res.data.data;
    },

    requestRevision: async (id: number, feedback?: string): Promise<Revision> => {
      const res = await api.post(`/admin/deliverables/${id}/request-revision`, { feedback: feedback ?? null });
      return res.data.data;
    },

    revisions: async (deliverableId: number): Promise<Revision[]> => {
      const res = await api.get(`/admin/deliverables/${deliverableId}/revisions`);
      return res.data.data;
    },

    resolveRevision: async (revisionId: number): Promise<Revision> => {
      const res = await api.patch(`/admin/revisions/${revisionId}/resolve`);
      return res.data.data;
    },
  },

  attachments: {
    list: async (projectId: number): Promise<ProjectAttachment[]> => {
      const res = await api.get(`/admin/projects/${projectId}/attachments`);
      return res.data.data;
    },

    upload: async (projectId: number, file: File, isVisibleToClient: boolean = false): Promise<ProjectAttachment> => {
      const form = new FormData();
      form.append('file', file);
      form.append('is_visible_to_client', isVisibleToClient ? '1' : '0');
      const res = await api.post(`/admin/projects/${projectId}/attachments`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data;
    },

    download: async (projectId: number, id: number, fileName: string): Promise<void> => {
      const res = await api.get(`/admin/projects/${projectId}/attachments/${id}/download`, { responseType: 'blob' });
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
      await api.delete(`/admin/projects/${projectId}/attachments/${id}`);
    },
  },

  taskAttachments: {
    list: async (projectId: number, taskId: number): Promise<ProjectTaskAttachment[]> => {
      const res = await api.get(`/admin/projects/${projectId}/tasks/${taskId}/attachments`);
      return res.data.data;
    },

    upload: async (projectId: number, taskId: number, file: File): Promise<ProjectTaskAttachment> => {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post(`/admin/projects/${projectId}/tasks/${taskId}/attachments`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data;
    },

    download: async (projectId: number, taskId: number, id: number, fileName: string): Promise<void> => {
      const res = await api.get(`/admin/projects/${projectId}/tasks/${taskId}/attachments/${id}/download`, { responseType: 'blob' });
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
      await api.delete(`/admin/projects/${projectId}/tasks/${taskId}/attachments/${id}`);
    },
  },

  reports: {
    status: async (): Promise<Record<string, number>> => (await api.get('/admin/projects/reports/status')).data.data,
    taskStatus: async (): Promise<Record<string, number>> => (await api.get('/admin/projects/reports/task-status')).data.data,
    workload: async (): Promise<{ user_id: number; total: number; completed: number; user: { id: number; name: string } }[]> =>
      (await api.get('/admin/projects/reports/workload')).data.data,
    timesheets: async (): Promise<{ user_id: number; task_id: number; total_hours: number; user: { id: number; name: string }; task: { id: number; title: string; task_number?: string | null; project?: { id: number; name: string } } }[]> =>
      (await api.get('/admin/projects/reports/timesheets')).data.data,
    overdue: async (): Promise<Task[]> => (await api.get('/admin/projects/reports/overdue')).data.data,
    completed: async (): Promise<(Project & { duration_days: number | null })[]> =>
      (await api.get('/admin/projects/reports/completed')).data.data,
  },
};
