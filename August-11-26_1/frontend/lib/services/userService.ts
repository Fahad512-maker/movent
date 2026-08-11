import api from '@/lib/axios';
import { User, Permission, CompanyOption, DataScope } from '@/types';

export interface CompanyAssignmentPayload {
  company_id: number;
  permissions: Record<string, string[]>; // moduleKey → permissionKey[]
  data_scopes?: Record<string, DataScope>; // moduleKey → data scope (descriptive only)
}

export interface UserPayload {
  name: string;
  email: string;
  password?: string;
  role_type?: string;
  phone?: string | null;
  is_active?: boolean;
  company_id?: number;
  company_assignments?: CompanyAssignmentPayload[];
}

export interface InvitePayload {
  name: string;
  email: string;
  role_type?: string;
  phone?: string | null;
  company_id?: number;
  company_assignments?: CompanyAssignmentPayload[];
}

export interface ActivityTask { id: number; title: string; status: string; project_id: number }
export interface ActivityProject { id: number; name: string; status: string }
export interface ActivityProductionTask { id: number; task_id: number; status: string }
export interface ActivityTimesheet { id: number; task_id: number; hours_logged: number; status: string; log_date: string }
export interface ActivityDeliverable { id: number; title: string; status: string; project_id: number }
export interface ActivityLog { id: number; action: string; module_key: string | null; entity_type: string | null; entity_id: number | null; created_at: string }

export interface UserActivity {
  project_management_active: boolean;
  assigned_tasks?: ActivityTask[];
  managed_projects?: ActivityProject[];
  member_projects?: ActivityProject[];
  production_tasks?: ActivityProductionTask[];
  timesheets?: ActivityTimesheet[];
  deliverables?: ActivityDeliverable[];
  audit_logs: ActivityLog[];
}

export interface UserListResponse {
  users: User[];
  count: number;
  used: number;
  limit: number | null;
}

const list = async (status?: 'invited'): Promise<UserListResponse> => {
  const res = await api.get('/admin/users', { params: status ? { status } : {} });
  return res.data.data;
};

const listCompanyOptions = async (): Promise<CompanyOption[]> => {
  const res = await api.get('/admin/users/company-options');
  return res.data.data;
};

const checkEmail = async (email: string): Promise<{ exists: boolean; is_admin?: boolean; name?: string; status?: string }> => {
  const res = await api.get('/admin/users/check-email', { params: { email } });
  return res.data.data;
};

const create = async (payload: UserPayload): Promise<User> => {
  const res = await api.post('/admin/users', payload);
  return res.data.data;
};

const invite = async (payload: InvitePayload): Promise<User> => {
  const res = await api.post('/admin/users/invite', payload);
  return res.data.data;
};

const resendInvite = async (id: number): Promise<User> => {
  const res = await api.post(`/admin/users/${id}/resend-invite`);
  return res.data.data;
};

const toggleStatus = async (id: number, status: 'active' | 'suspended', companyId?: number): Promise<User> => {
  const res = await api.patch(`/admin/users/${id}/toggle-status`, { status, company_id: companyId });
  return res.data.data;
};

const resetPassword = async (id: number): Promise<{ password: string }> => {
  const res = await api.post(`/admin/users/${id}/reset-password`);
  return res.data.data;
};

const getActivity = async (id: number, companyId?: number): Promise<UserActivity> => {
  const res = await api.get(`/admin/users/${id}/activity`, { params: companyId ? { company_id: companyId } : {} });
  return res.data.data;
};

const getOne = async (id: number): Promise<User> => {
  const res = await api.get(`/admin/users/${id}`);
  return res.data.data;
};

const update = async (id: number, payload: UserPayload): Promise<User> => {
  const res = await api.put(`/admin/users/${id}`, payload);
  return res.data.data;
};

const remove = async (id: number, companyId?: number): Promise<void> => {
  await api.delete(`/admin/users/${id}`, { params: companyId ? { company_id: companyId } : {} });
};

const getCompanyPermissions = async (
  userId: number,
  companyId: number
): Promise<{ permissions: Record<string, string[]>; data_scopes: Record<string, DataScope> }> => {
  const res = await api.get(`/admin/users/${userId}/company-permissions/${companyId}`);
  return res.data.data;
};

const updateCompanyPermissions = async (
  userId: number,
  companyId: number,
  permissions: Record<string, string[]>,
  dataScopes?: Record<string, DataScope>
): Promise<{ permissions: Record<string, string[]>; data_scopes: Record<string, DataScope> }> => {
  const res = await api.put(`/admin/users/${userId}/company-permissions/${companyId}`, {
    permissions,
    data_scopes: dataScopes ?? {},
  });
  return res.data.data;
};

const syncPermissions = async (id: number, permissions: Partial<Permission>[]): Promise<User> => {
  const res = await api.put(`/admin/users/${id}/permissions`, { permissions });
  return res.data.data;
};

export const userService = {
  list, listCompanyOptions, checkEmail, create, invite, resendInvite, toggleStatus, resetPassword, getActivity,
  getOne, update, remove, getCompanyPermissions, updateCompanyPermissions, syncPermissions,
};
