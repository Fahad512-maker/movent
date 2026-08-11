// ─── Module Catalog ───────────────────────────────────────────────────────────
// Single source of truth for all purchasable modules.
// `internalKeys` are seeded into company_modules table on registration.

export interface CatalogEntry {
  key: string;
  label: string;
  icon: string;
  desc: string;
  color: string;
  bg: string;
  border: string;
  price_pkr: number;
  price_usd: number;
  internalKeys: string[];   // keys seeded into company_modules
  canStandAlone: boolean;
  badge: string;            // always shown on card
  optionalBadge?: string;   // soft hint shown on card
}

export const MODULE_CATALOG: CatalogEntry[] = [
  {
    key: 'sales',
    label: 'Sales',
    icon: '💼',
    desc: 'Leads, clients & pipeline',
    color: '#2563eb',
    bg: '#eff6ff',
    border: '#bfdbfe',
    price_pkr: 1500,
    price_usd: 6,
    internalKeys: ['leads', 'projects_handoff', 'lead_transfer', 'reports_seller'],
    canStandAlone: false,
    badge: 'Requires Invoice',
  },
  {
    key: 'invoice',
    label: 'Invoice',
    icon: '🧾',
    desc: 'Billing, payments & reminders',
    color: '#059669',
    bg: '#ecfdf5',
    border: '#a7f3d0',
    price_pkr: 1200,
    price_usd: 5,
    internalKeys: ['invoices', 'payments', 'payment_details', 'invoice_reminders', 'documents', 'chat'],
    canStandAlone: true,
    badge: 'Can be used alone',
    optionalBadge: 'Works best with Finance',
  },
  {
    key: 'hr',
    label: 'HR Management',
    icon: '👥',
    desc: 'Employees, attendance & payroll',
    color: '#7c3aed',
    bg: '#f5f3ff',
    border: '#ddd6fe',
    price_pkr: 1800,
    price_usd: 7,
    internalKeys: ['employees', 'recruitment', 'attendance', 'leaves', 'payroll'],
    canStandAlone: true,
    badge: 'Can be used alone',
  },
  {
    key: 'compliance',
    label: 'Compliance',
    icon: '🛡️',
    desc: 'Policies, audits & risk',
    color: '#dc2626',
    bg: '#fef2f2',
    border: '#fecaca',
    price_pkr: 1500,
    price_usd: 6,
    internalKeys: ['compliance', 'policies', 'audit_trails', 'compliance_reports', 'risk_assessments', 'alerts', 'document_compliance'],
    canStandAlone: true,
    badge: 'Can be used alone',
  },
  {
    key: 'finance',
    label: 'Finance',
    icon: '💰',
    desc: 'Dashboard, revenue & reports',
    color: '#d97706',
    bg: '#fffbeb',
    border: '#fde68a',
    price_pkr: 1200,
    price_usd: 5,
    internalKeys: ['finance_dashboard', 'finance_reports', 'revenue_reports', 'payments_report'],
    canStandAlone: false,
    badge: 'Requires Invoice',
  },
  {
    key: 'projects',
    label: 'Project',
    icon: '📋',
    desc: 'Tasks, timesheets & deliverables',
    color: '#0891b2',
    bg: '#ecfeff',
    border: '#a5f3fc',
    price_pkr: 1800,
    price_usd: 7,
    internalKeys: ['projects', 'tasks', 'timesheets', 'production', 'revisions', 'deliverables', 'team_resources', 'file_storage'],
    canStandAlone: true,
    badge: 'Can be used alone',
    optionalBadge: 'Works best with Client Portal',
  },
  {
    key: 'client_portal',
    label: 'Client',
    icon: '🌐',
    desc: 'Client login, invoices, projects & support',
    color: '#10b981',
    bg: '#ecfdf5',
    border: '#6ee7b7',
    price_pkr: 1200,
    price_usd: 5,
    internalKeys: ['clients', 'client_portal', 'client_documents', 'client_chat', 'client_support', 'documents', 'chat'],
    canStandAlone: false,
    badge: 'Requires Invoice or Project',
  },
];

// ─── Hard Dependencies ────────────────────────────────────────────────────────
// Blocks checkout until requiresAny is satisfied.

export const MODULE_HARD_DEPS: Record<string, {
  requiresAny: string[];
  message: string;
}> = {
  finance: {
    requiresAny: ['invoice'],
    message: 'Invoice module is required because Finance depends on invoice and payment data.',
  },
  sales: {
    requiresAny: ['invoice'],
    message: 'Invoice module is required because Sales includes invoice features.',
  },
  client_portal: {
    requiresAny: ['invoice', 'projects'],
    message: 'Client module requires Invoice or Project.',
  },
};

// ─── Recommendations ──────────────────────────────────────────────────────────
// Non-blocking. Shown when `when` are all selected and none of `notWhen` are.

export const MODULE_RECOMMENDATIONS: {
  when: string[];
  notWhen?: string[];
  message: string;
  add: string[];
}[] = [
  {
    when: ['sales'],
    notWhen: ['invoice'],
    message: 'Recommended: Add Invoice to convert leads and clients into billable invoices.',
    add: ['invoice'],
  },
  {
    when: ['sales'],
    notWhen: ['projects'],
    message: 'Add Project Management to hand off clients into projects and tasks.',
    add: ['projects'],
  },
  {
    when: ['invoice'],
    notWhen: ['finance'],
    message: 'Recommended: Add Finance to track revenue, payments, and reports.',
    add: ['finance'],
  },
  {
    when: ['invoice'],
    notWhen: ['client_portal'],
    message: 'Add Client Portal so clients can view and pay invoices online.',
    add: ['client_portal'],
  },
  {
    when: ['hr'],
    notWhen: ['compliance'],
    message: 'Recommended: Add Compliance for policies, audits, and risk management.',
    add: ['compliance'],
  },
  {
    when: ['compliance'],
    notWhen: ['hr'],
    message: 'Recommended: Add HR to connect policies, employees, attendance, and approvals.',
    add: ['hr'],
  },
  {
    when: ['projects'],
    notWhen: ['client_portal'],
    message: 'Recommended: Add Client Portal so clients can view projects, deliverables, and updates.',
    add: ['client_portal'],
  },
  {
    when: ['projects'],
    notWhen: ['invoice'],
    message: 'Add Invoice if project billing is needed.',
    add: ['invoice'],
  },
  // Combination recommendations
  {
    when: ['invoice', 'projects'],
    notWhen: ['client_portal'],
    message: 'Recommended: Add Client Portal to give clients access to invoices, payments, projects, and deliverables.',
    add: ['client_portal'],
  },
];

// ─── Validation ───────────────────────────────────────────────────────────────

export interface ValidationResult {
  isValid: boolean;
  blockingMessages: string[];
  recommendations: string[];
  requiredModulesToAdd: string[];
}

export function validateModules(selected: string[]): ValidationResult {
  const blockingMessages: string[] = [];
  const requiredModulesToAdd: string[] = [];

  for (const [key, dep] of Object.entries(MODULE_HARD_DEPS)) {
    if (!selected.includes(key)) continue;
    const satisfied = dep.requiresAny.some(r => selected.includes(r));
    if (!satisfied) {
      blockingMessages.push(dep.message);
      dep.requiresAny.forEach(r => { if (!selected.includes(r)) requiredModulesToAdd.push(r); });
    }
  }

  const recommendations: string[] = [];
  for (const rec of MODULE_RECOMMENDATIONS) {
    const whenMet    = rec.when.every(m => selected.includes(m));
    const notWhenMet = (rec.notWhen ?? []).some(m => selected.includes(m));
    if (whenMet && !notWhenMet) {
      recommendations.push(rec.message);
    }
  }

  return {
    isValid: blockingMessages.length === 0,
    blockingMessages,
    recommendations: [...new Set(recommendations)],
    requiredModulesToAdd: [...new Set(requiredModulesToAdd)],
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getCatalogEntry(key: string): CatalogEntry | undefined {
  return MODULE_CATALOG.find(m => m.key === key);
}

export function getSelectedInternalKeys(selectedCategoryKeys: string[]): string[] {
  return [...new Set(
    selectedCategoryKeys.flatMap(k => getCatalogEntry(k)?.internalKeys ?? [])
  )];
}
