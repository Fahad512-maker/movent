import Cookies from 'js-cookie';
import { User, Admin, SuperAdmin, CompanyAssignment } from '@/types';

export const setAuthData = (
  token: string,
  user: User | Admin | SuperAdmin,
  type: 'user' | 'admin' | 'super_admin'
) => {
  Cookies.set('auth_token', token, { expires: 7 });
  Cookies.set('auth_user', JSON.stringify(user), { expires: 7 });
  Cookies.set('auth_type', type, { expires: 7 });
};

export const getAuthUser = (): User | Admin | null => {
  const user = Cookies.get('auth_user');
  return user ? JSON.parse(user) : null;
};

export const getAuthType = () => Cookies.get('auth_type') || null;
export const getToken    = () => Cookies.get('auth_token') || null;
export const isAuthenticated = () => !!Cookies.get('auth_token');

// ── Active company (Rule 8: sidebar and permissions based on selected company) ──

export const setActiveCompany = (id: number) => {
  Cookies.set('active_company_id', String(id), { expires: 7 });
};

export const getActiveCompany = (): number | null => {
  const id = Cookies.get('active_company_id');
  return id ? parseInt(id, 10) : null;
};

export const clearActiveCompany = () => {
  Cookies.remove('active_company_id');
};

// ── Permission helpers ────────────────────────────────────────────────────────

// Returns the permission keys a sub-user has for a given module key.
// Rule 8: uses the active company when set; falls back to all assignments.
// Admins always get all permissions (returns ['*']).
export const getUserModulePermissions = (moduleKey: string): string[] => {
  if (getAuthType() === 'admin') return ['*'];

  const u          = getAuthUser() as User | null;
  const activeId   = getActiveCompany();
  const all        = u?.company_assignments ?? [];

  // Filter by active company if one is selected
  const assignments = activeId ? all.filter(a => a.company_id === activeId) : all;

  for (const a of assignments) {
    if (a.permissions?.[moduleKey]) return a.permissions[moduleKey] as string[];
  }
  return [];
};

// canView/Create/EditClients are granted identically whether the company
// purchased the Client module or the Sales module ("basic client access
// included with Sales") — a permission saved under either bucket must work
// when checked against the other.
const SHARED_CLIENT_KEYS = ['canViewClients', 'canCreateClients', 'canEditClients'];

// Returns true if the current user has the given permission key for a module.
// Admins always return true.
export const can = (moduleKey: string, permKey: string): boolean => {
  const perms = getUserModulePermissions(moduleKey);
  if (perms.includes('*') || perms.includes(permKey)) return true;

  if (SHARED_CLIENT_KEYS.includes(permKey) && (moduleKey === 'client' || moduleKey === 'sales')) {
    const otherModule = moduleKey === 'client' ? 'sales' : 'client';
    const otherPerms = getUserModulePermissions(otherModule);
    return otherPerms.includes('*') || otherPerms.includes(permKey);
  }

  return false;
};

// ── Role-based post-login redirect ───────────────────────────────────────────
// Picks the first existing staff dashboard route the user's permissions
// unlock. Roles with no dedicated dashboard yet (HR, Compliance, Finance,
// Viewer) fall through to '/dashboard', which already adapts its content to
// whatever modules the user has.
const STAFF_REDIRECT_RULES: { module: string; permAny: string[]; path: string }[] = [
  { module: 'project_management', permAny: ['canViewProjectDashboard', 'canViewProjects', 'canCreateTasks', 'canAssignTasks', 'canViewProductionDashboard'], path: '/projects/dashboard' },
  { module: 'project_management', permAny: ['canViewTasks', 'canViewProductionTasks', 'canStartProductionTasks', 'canSubmitProductionTasks'], path: '/tasks' },
  { module: 'sales',   permAny: ['canViewSalesDashboard', 'canViewLeads'], path: '/sales' },
  { module: 'invoice', permAny: ['canViewInvoiceDashboard', 'canViewInvoices'], path: '/invoices' },
  { module: 'finance', permAny: ['canViewFinanceDashboard', 'canViewRevenueDashboard'], path: '/invoices' },
];

export const resolveStaffRedirect = (assignment?: CompanyAssignment): string => {
  const perms = assignment?.permissions ?? {};
  for (const rule of STAFF_REDIRECT_RULES) {
    const modulePerms = perms[rule.module] ?? [];
    if (modulePerms.includes('*') || rule.permAny.some(p => modulePerms.includes(p))) return rule.path;
  }
  return '/dashboard';
};

export const logout = () => {
  Cookies.remove('auth_token');
  Cookies.remove('auth_user');
  Cookies.remove('auth_type');
  Cookies.remove('active_company_id');
};
