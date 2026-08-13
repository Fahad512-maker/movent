export interface Admin {
  id: number;
  name: string;
  email: string;
  phone?: string;
  avatar_url?: string | null;
  subscription_status: string;
  trial_ends_at?: string;
  subscription_ends_at?: string;
  is_active?: boolean;
  companies: Company[];
  modules?: string[];
  max_users_per_company?: number | null;
  max_companies?: number | null;
  // Set in Settings → Company tab — authoritative for every invoice this
  // admin issues, across any of their companies (see Company::invoicingProfile()).
  currency?: string;
}

export type DataScope = 'own' | 'assigned' | 'all' | 'view_only' | 'no_access';

export interface CompanyAssignment {
  company_id: number;
  company_name: string;
  status: 'active' | 'suspended';
  permissions: Record<string, string[]>; // moduleKey → permissionKey[]
  data_scopes?: Record<string, DataScope>; // moduleKey → data scope (enforced for project_management; descriptive only elsewhere so far)
}

export const DATA_SCOPE_LABELS: Record<DataScope, string> = {
  own: 'Own records',
  assigned: 'Assigned records',
  all: 'All company records',
  view_only: 'View only',
  no_access: 'No access',
};

export interface CompanyOption {
  id: number;
  name: string;
  modules: string[]; // purchased module keys
}

export interface User {
  id: number;
  name: string;
  email: string;
  role_type: string;
  phone?: string;
  avatar_path?: string;
  avatar_url?: string | null;
  is_active: boolean;
  is_online: boolean;
  status: 'active' | 'invited' | 'suspended';
  last_login_at?: string | null;
  created_at?: string;
  created_by?: { id: number; name: string } | null;
  invite_url?: string | null;
  company?: Company | null;
  permissions?: Permission[];
  company_assignments?: CompanyAssignment[];
}

export interface Company {
  id: number;
  name: string;
  timezone?: string;
  currency?: string;
  logo_path?: string;
  is_active?: boolean;
  // admin.currency is the tenant's Settings-configured currency —
  // authoritative for invoice creation, unlike the sibling `currency` above
  // (legacy, pre-tenant-refactor, per-Company column — see
  // Company::invoicingProfile() on the backend).
  admin?: { id: number; name: string; currency?: string } | null;
}

export interface Permission {
  module_key: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_export: boolean;
}

// ─── Client / Invoice / Payment types ────────────────────────────────────────

export interface Client {
  id: number;
  company_id: number;
  name: string;
  email?: string;
  phone?: string;
  company_name?: string;
  address?: string;
  portal_access: boolean;
  status: 'active' | 'inactive' | 'blocked';
  notes?: string;
  created_at: string;
  company?: Company;
  user?: { id: number; email: string; is_active: boolean };
  // Only present on GET /user/clients/{id} for a user holding
  // canEnableClientPortal/canDisableClientPortal — see
  // Api\User\ClientController::show().
  portal_permissions?: Record<string, { label: string; is_enabled: boolean; purchased: boolean }>;
  // Same gate — whether this client's company has the real Client Portal
  // module purchased. Only present alongside portal_permissions above.
  has_portal_module?: boolean;
}

export interface InvoiceItem {
  id?: number;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  sort_order?: number;
}

export interface InvoicePayment {
  id: number;
  amount: number;
  method?: string;
  gateway?: string;
  status: string;
  payment_date?: string;
  notes?: string;
  created_at: string;
}

export interface Invoice {
  id: number;
  company_id: number;
  client_id: number;
  lead_id?: number | null;
  project_id?: number | null;
  invoice_number: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  paid_amount: number;
  currency: string;
  status: 'draft' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';
  due_date?: string;
  notes?: string;
  sent_at?: string;
  created_at: string;
  payment_token?: string | null;
  token_expires_at?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  client?: Client;
  items?: InvoiceItem[];
  payments?: InvoicePayment[];
  gateway_account_ids?: number[];
  // Deal-facing fields — what this invoice is for, even before a Project exists.
  invoice_purpose?: string | null;
  payment_type?: string | null;
  required_payment_amount?: number | null;
  counts_toward_project_activation?: boolean;
  lead?: {
    id: number;
    deal_reference?: string | null;
    proposed_project_title?: string | null;
    fulfillment_status?: string | null;
  } | null;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  errors?: Record<string, string[]>;
}

// ─── Public / Landing types ───────────────────────────────────────────────────

export interface PublicPackage {
  id: number;
  name: string;
  tier: string;
  price_pkr: number;
  price_usd: number;
  trial_days: number;
  is_popular: boolean;
  features: string[];
  modules: string[];
}

export interface RegistrationData {
  company_name: string;
  name: string;
  email: string;
  password: string;
  password_confirmation: string;
  phone?: string;
  package_id: number;
  selected_modules: string[];
  currency: 'USD';
  start_type: 'trial' | 'paid';
  timezone: string;
}

// ─── Super Admin types ────────────────────────────────────────────────────────

export interface SuperAdmin {
  id: number;
  name: string;
  email: string;
  is_active: boolean;
}

export interface PackageModuleItem {
  id: number;
  module_key: string;
  is_enabled: boolean;
}

export interface Package {
  id: number;
  name: string;
  tier: 'basic' | 'professional' | 'enterprise' | 'custom';
  price: number | string;
  price_pkr: number | null;
  price_usd: number | null;
  billing_cycle: 'monthly' | 'yearly';
  trial_days: number | null;
  max_companies: number | null;
  max_users_per_company: number | null;
  description: string | null;
  is_active: boolean;
  is_visible: boolean;
  is_popular: boolean;
  features: string[] | null;
  modules: PackageModuleItem[];
  company_admins_count?: number;
}

export interface AdminFull {
  id: number;
  name: string;
  email: string;
  phone?: string;
  subscription_status: string;
  trial_ends_at?: string;
  subscription_ends_at?: string;
  is_active: boolean;
  package: Package | null;
  companies?: Company[];
  companies_count?: number;
}

export interface CompanyFull {
  id: number;
  name: string;
  industry?: string;
  email?: string;
  phone?: string;
  is_active: boolean;
  users_count: number;
  created_at: string;
  admin: {
    id: number;
    name: string;
    email: string;
  } | null;
}

export interface DashboardStats {
  total_packages: number;
  total_admins: number;
  total_companies: number;
  active_subscriptions: number;
  recent_admins: AdminFull[];
  recent_companies: CompanyFull[];
}
