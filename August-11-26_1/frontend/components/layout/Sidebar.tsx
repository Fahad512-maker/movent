'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  HiSquares2X2, HiUserGroup, HiUsers, HiBanknotes,
  HiFolderOpen, HiCheckCircle, HiBriefcase, HiClock,
  HiDocumentText, HiShieldCheck, HiChatBubbleLeftRight,
  HiCog6Tooth, HiArrowRightOnRectangle, HiChartBar,
  HiCurrencyDollar, HiWrenchScrewdriver, HiCalendarDays,
  HiDocumentCheck,
} from 'react-icons/hi2';
import { useAuth } from '@/hooks/useAuth';
import { getAuthType, getAuthUser, getActiveCompany, can } from '@/lib/auth';
import { Admin, User } from '@/types';
import { notificationService } from '@/lib/services/notificationService';
import { adminNotificationService } from '@/lib/services/adminNotificationService';

// Nav groups for company admin (all under /admin/)
const ADMIN_NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { href: '/admin/dashboard', icon: HiSquares2X2, label: 'Dashboard' },
    ],
  },
  {
    label: 'Sales Module',
    items: [
      { href: '/admin/sales',      icon: HiChartBar,     label: 'Sales Dashboard', module: 'leads' },
      { href: '/admin/pipeline',   icon: HiSquares2X2,   label: 'Pipeline',        module: 'leads' },
      { href: '/admin/leads',      icon: HiUserGroup,    label: 'Leads',           module: 'leads' },
      { href: '/admin/follow-ups', icon: HiCalendarDays, label: 'Follow-ups',      module: 'leads' },
      // A "Basic Clients" admin nav item pointing at /admin/clients used to
      // live here, but every AdminClientController route requires the real
      // `clients` module (routes/api.php's `module:clients` gate) — it would
      // 404/403 for a Sales-only company, so removed rather than left dead.
      // Company Admin sub-users still get the equivalent, permission-gated
      // "Basic Clients" access via the User-guard routes (ungated by module —
      // see routes/api.php's client management comment).
    ],
  },
  {
    label: 'Client Module',
    items: [
      { href: '/admin/clients', icon: HiUsers, label: 'Clients', module: 'clients' },
      { href: '/admin/support', icon: HiChatBubbleLeftRight, label: 'Support Tickets', module: 'clients' },
    ],
  },
  {
    label: 'Invoice',
    items: [
      { href: '/admin/invoices', icon: HiBanknotes,      label: 'Invoices', module: 'invoices' },
      { href: '/admin/payments', icon: HiCurrencyDollar, label: 'Payments', module: 'invoices' },
    ],
  },
  {
    label: 'Project Module',
    items: [
      { href: '/admin/projects/dashboard', icon: HiSquares2X2,        label: 'Project Dashboard', module: 'projects' },
      { href: '/admin/projects',           icon: HiFolderOpen,        label: 'Projects',          module: 'projects', badgeKey: 'projects' },
      { href: '/admin/tasks',              icon: HiCheckCircle,       label: 'Tasks',              module: 'tasks', badgeKey: 'tasks' },
      { href: '/admin/timesheets',         icon: HiClock,             label: 'Timesheets',         module: 'timesheets' },
      { href: '/admin/projects/team',      icon: HiUserGroup,         label: 'Team / Resources',   module: 'projects' },
      // Production/Deliverables are a section INSIDE Project Management, not
      // a separate module — gated on 'projects' only, never a standalone key.
      { href: '/admin/projects/production',  icon: HiWrenchScrewdriver, label: 'Production',    module: 'projects' },
      { href: '/admin/projects/deliverables', icon: HiDocumentCheck,   label: 'Deliverables',  module: 'projects' },
      { href: '/admin/projects/reports',   icon: HiChartBar,          label: 'Project Reports',    module: 'projects' },
    ],
  },
  {
    label: 'HR',
    items: [
      // Each item is gated on its own real granular company_modules key —
      // 'hr' itself is never a real module_key (only employees/attendance/
      // leaves/payroll/recruitment are), so gating everything on 'hr' meant
      // this whole section could never appear for any company. HR Dashboard/
      // Documents/Reports ride on 'employees' (the base HR sub-module), same
      // pattern Project Reports rides on 'projects'.
      { href: '/admin/hr',           icon: HiSquares2X2,   label: 'HR Dashboard', module: 'employees' },
      { href: '/admin/employees',    icon: HiBriefcase,    label: 'Employees',    module: 'employees' },
      { href: '/admin/recruitment',  icon: HiUsers,        label: 'Recruitment',  module: 'recruitment' },
      { href: '/admin/attendance',   icon: HiCalendarDays, label: 'Attendance',   module: 'attendance' },
      { href: '/admin/leaves',       icon: HiCalendarDays, label: 'Leave',        module: 'leaves' },
      { href: '/admin/payroll',      icon: HiBanknotes,    label: 'Payroll',      module: 'payroll' },
      { href: '/admin/hr/documents', icon: HiDocumentText, label: 'HR Documents', module: 'employees' },
      { href: '/admin/hr/reports',   icon: HiChartBar,     label: 'HR Reports',   module: 'employees' },
    ],
  },
  {
    label: 'Files',
    items: [
      { href: '/admin/documents',  icon: HiDocumentText, label: 'Documents',  module: 'documents' },
      { href: '/admin/compliance', icon: HiShieldCheck,  label: 'Compliance', module: 'compliance' },
    ],
  },
  {
    label: 'Reports',
    items: [
      { href: '/admin/reports', icon: HiChartBar, label: 'Reports', moduleAny: ['invoices', 'reports', 'finance'] },
    ],
  },
  {
    label: 'Communication',
    items: [
      // Company-wide oversight of General Chat — always available to Company
      // Admin (not gated by a purchasable module or permission, same as
      // Settings/Users below).
      { href: '/admin/chat', icon: HiChatBubbleLeftRight, label: 'Chat' },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/admin/settings',           icon: HiCog6Tooth, label: 'Settings' },
      { href: '/admin/users',              icon: HiUserGroup, label: 'Users' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { href: '/admin/plan',             icon: HiSquares2X2, label: 'My Plan' },
      { href: '/admin/companies/create', icon: HiBriefcase,  label: 'Add Company' },
    ],
  },
];

// Nav groups for sub users (root-level URLs)
const USER_NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', icon: HiSquares2X2, label: 'Dashboard' },
    ],
  },
  {
    label: 'Sales Module',
    items: [
      { href: '/sales',            icon: HiChartBar,     label: 'Sales Dashboard', module: 'leads', permAny: ['canViewSalesDashboard', 'canViewLeads'] },
      { href: '/leads/pipeline',   icon: HiSquares2X2,   label: 'Pipeline',     module: 'leads', permAny: ['canViewLeads', 'canManagePipeline'] },
      { href: '/leads',            icon: HiUserGroup,    label: 'Leads',        module: 'leads', permAny: ['canViewLeads'] },
      { href: '/leads/follow-ups', icon: HiCalendarDays, label: 'Follow-ups',   module: 'leads', permAny: ['canViewLeads'] },
      // Visible only when Sales is purchased but full Client module is NOT
      { href: '/clients', icon: HiUsers, label: 'Basic Clients', module: 'leads', hideIfModule: 'clients', permAny: ['canViewClients'] },
      { href: '/invoices', icon: HiBanknotes, label: 'Sales Invoices', module: 'invoices', permAny: ['canViewInvoices'] },
      { href: '/sales/targets', icon: HiCurrencyDollar, label: 'Targets', module: 'leads', permAny: ['canViewSalesTargets'] },
      { href: '/sales/reports', icon: HiChartBar, label: 'Sales Reports', module: 'leads', permAny: ['canViewSalesReports'] },
    ],
  },
  {
    label: 'Client Module',
    items: [
      { href: '/clients', icon: HiUsers, label: 'Clients', module: 'clients', permAny: ['canViewClients'] },
      { href: '/support', icon: HiChatBubbleLeftRight, label: 'Support Tickets', module: 'clients', permAny: ['canViewClientSupport', 'canManageClientSupport'] },
    ],
  },
  {
    label: 'Invoice',
    items: [
      { href: '/invoices', icon: HiBanknotes, label: 'Invoices', module: 'invoices', permAny: ['canViewInvoices'] },
    ],
  },
  {
    // Item visibility here is computed per-permission-key (not the coarse
    // module tag used elsewhere) — see the `permAny` handling in
    // `visibleGroups` below, so a Production User and a PM/Admin see
    // different subsets purely from which permission keys they were granted.
    label: 'Project Module',
    items: [
      { href: '/projects/dashboard',     icon: HiSquares2X2,        label: 'Project Dashboard', permAny: ['canViewProjectDashboard'] },
      { href: '/projects',               icon: HiFolderOpen,        label: 'Projects',          permAny: ['canViewProjects', 'canViewLinkedProjects'], badgeKey: 'projects' },
      { href: '/tasks',                  icon: HiCheckCircle,       label: 'Tasks',              permAny: ['canViewTasks'], fallbackLabel: 'My Tasks', badgeKey: 'tasks', hideForSeller: true },
      { href: '/timesheets',             icon: HiClock,             label: 'Timesheets',         permAny: ['canViewTimesheets'] },
      { href: '/projects/team',          icon: HiUserGroup,         label: 'Team / Resources',   permAny: ['canViewTeamResources', 'canAssignTeamResources', 'canAddUsers'] },
      { href: '/projects/production',    icon: HiWrenchScrewdriver, label: 'Production Queue',   permAny: ['canViewProductionQueue', 'canViewProductionDashboard', 'canStartProductionTasks', 'canSubmitProductionTasks'] },
      { href: '/projects/deliverables',  icon: HiDocumentCheck,     label: 'Deliverables',      permAny: ['canViewDeliverables', 'canUploadDeliverables', 'canApproveDeliverables'] },
      { href: '/projects/reports',       icon: HiChartBar,          label: 'Project Reports',    permAny: ['canViewProjectReports', 'canViewTaskReports'] },
    ],
  },
  {
    label: 'Reports',
    items: [
      { href: '/reports', icon: HiChartBar, label: 'Reports', moduleAny: ['invoices', 'reports', 'finance'] },
    ],
  },
  {
    // Standalone General Chat — separate from Project/Sales Chat, gated on
    // the 'account' module's canUseGeneralChat (same pattern as canAddUsers
    // below), never on a purchased module.
    label: 'Communication',
    items: [
      { href: '/chat', icon: HiChatBubbleLeftRight, label: 'Chat', permAny: ['canUseGeneralChat'] },
    ],
  },
  {
    // Company-wide, not project-scoped — separate from "Team / Resources"
    // (which is per-project). Gated on the common 'account' module's
    // canAddUsers permission, same as the "User Management Permission"
    // checkbox on the Company Admin's Add/Edit User screen. Labeled "Users"
    // to match the Company Admin sidebar's own '/admin/users' nav item.
    label: 'Users',
    items: [
      { href: '/user-management', icon: HiUserGroup, label: 'Users', permAny: ['canAddUsers'] },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { logoutUser } = useAuth();
  const [authType, setAuthType] = useState<'user' | 'admin' | null>(null);
  const [enabledModules, setEnabledModules] = useState<string[] | null>(null);
  // null = not yet loaded (show everything, same convention as enabledModules)
  // — populated inside refreshModules() (post-mount only) so permAny-gated
  // nav items never read cookies during the initial render, which previously
  // caused a server/client hydration mismatch (the server has no cookies and
  // always saw "no permissions", while the client's first render already had
  // them, producing mismatched nav items).
  // Holds every permission key granted across ALL modules (not just Project
  // Management) so permAny gating works uniformly for Sales/Client/Invoice
  // nav items too, on top of their coarser `module` purchase gate.
  const [projectMgmtPerms, setProjectMgmtPerms] = useState<string[] | null>(null);
  const [navBadges, setNavBadges] = useState<{ tasks: number; projects: number }>({ tasks: 0, projects: 0 });
  // Sellers get zero Task visibility — the "My Tasks" fallback (for roles
  // that lack canViewTasks but still have their own assigned tasks) must
  // never apply to them.
  const [isSeller, setIsSeller] = useState(false);

  const refreshModules = () => {
    const type = getAuthType() as 'user' | 'admin' | null;
    setAuthType(type);
    if (type === 'admin') {
      setProjectMgmtPerms(['*']);
      setIsSeller(false);
    } else {
      const user = getAuthUser() as User | null;
      setIsSeller(user?.role_type === 'seller');
      const allAssignments = user?.company_assignments ?? [];
      const activeId = getActiveCompany();
      const assignments = activeId ? allAssignments.filter(a => a.company_id === activeId) : allAssignments;
      const keys = new Set<string>();
      for (const a of assignments) {
        for (const permKeys of Object.values(a.permissions ?? {})) {
          (permKeys as string[]).forEach(k => keys.add(k));
        }
      }
      setProjectMgmtPerms([...keys]);
    }
    if (type === 'admin') {
      const admin = getAuthUser() as Admin | null;
      setEnabledModules(admin?.modules ?? null);
    } else if (type === 'user') {
      const user = getAuthUser() as User | null;
      const allAssignments = user?.company_assignments ?? [];
      // Rule 8: use only the active company's permissions for sidebar
      const activeId   = getActiveCompany();
      const assignments = activeId
        ? allAssignments.filter(a => a.company_id === activeId)
        : allAssignments;
      if (assignments.length > 0) {
        // Map catalog module keys → sidebar module keys
        const CATALOG_TO_SIDEBAR: Record<string, string[]> = {
          client:             ['clients'],
          sales:              ['leads'],
          invoice:            ['invoices'],
          hr:                 ['hr'],
          project_management: ['projects', 'tasks', 'timesheets', 'production'],
          compliance:         ['compliance'],
          finance:            ['reports'],
        };
        const sidebarModules = new Set<string>();
        for (const a of assignments) {
          for (const [catalogKey, permKeys] of Object.entries(a.permissions)) {
            if ((permKeys as string[]).length > 0) {
              (CATALOG_TO_SIDEBAR[catalogKey] ?? [catalogKey]).forEach(k => sidebarModules.add(k));
            }
          }
        }
        // Reports: only if admin granted canViewInvoiceReports (or finance reports) permission
        if (can('invoice', 'canViewInvoiceReports') || can('finance', 'canViewFinanceReports')) {
          sidebarModules.add('reports');
        }
        // If no permissions resolved, fall back to null (show all) so the user
        // isn't locked out while permissions are still being configured.
        setEnabledModules(sidebarModules.size > 0 ? [...sidebarModules] : null);
      } else {
        // Fallback to old-style permissions
        const modules = user?.permissions?.filter(p => p.can_view).map(p => p.module_key) ?? null;
        setEnabledModules(modules);
      }
    } else {
      setEnabledModules(null);
    }
  };

  useEffect(() => {
    refreshModules();
    window.addEventListener('auth_refreshed', refreshModules);
    return () => window.removeEventListener('auth_refreshed', refreshModules);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Red dots on Tasks/Projects — mirrors Navbar's own 30s notification poll,
  // kept independent since the badge counts (per-category, uncapped) come
  // from a different endpoint than the bell's top-30 feed.
  useEffect(() => {
    const type = getAuthType() as 'user' | 'admin' | null;
    if (!type) { setNavBadges({ tasks: 0, projects: 0 }); return; }

    const loadBadges = () => {
      const svc = type === 'admin' ? adminNotificationService : notificationService;
      svc.unreadCounts()
        .then(counts => setNavBadges(counts))
        .catch(() => {});
    };

    loadBadges();
    const interval = setInterval(loadBadges, 30000);
    // Dispatched by the Tasks/Projects pages right after they mark their
    // category read, so the dot disappears immediately instead of waiting
    // up to 30s for the next poll.
    window.addEventListener('nav_badges_refresh', loadBadges);
    return () => {
      clearInterval(interval);
      window.removeEventListener('nav_badges_refresh', loadBadges);
    };
  }, [authType]);

  const isModuleEnabled = (moduleKey?: string) => {
    if (!moduleKey) return true;
    if (enabledModules === null) return true; // still loading — show everything
    return enabledModules.includes(moduleKey);
  };

  const NAV_GROUPS = authType === 'admin' ? ADMIN_NAV_GROUPS : USER_NAV_GROUPS;

  // projectMgmtPerms === null means "not yet loaded" — show everything, same
  // convention as enabledModules, to avoid a hydration mismatch.
  const hasPermAny = (keys: string[]) =>
    projectMgmtPerms === null || projectMgmtPerms.includes('*') || keys.some(k => projectMgmtPerms.includes(k));
  const hasAnyProjectManagementPerm = projectMgmtPerms === null || projectMgmtPerms.length > 0;

  type NavItem = {
    href: string; icon: (typeof HiSquares2X2); label: string;
    module?: string; moduleAny?: string[]; hideIfModule?: string; permAny?: string[]; fallbackLabel?: string;
    badgeKey?: 'tasks' | 'projects'; hideForSeller?: boolean;
  };

  const visibleGroups = NAV_GROUPS.map(group => ({
    ...group,
    items: (group.items as NavItem[]).reduce((acc: NavItem[], item) => {
      if (item.module && !isModuleEnabled(item.module)) return acc;
      if (item.moduleAny && !item.moduleAny.some(m => isModuleEnabled(m))) return acc;
      if (item.hideIfModule && isModuleEnabled(item.hideIfModule)) return acc;
      // The Task feature is retired for Seller entirely (Api\User\
      // TaskController hard-blocks role_type='seller' regardless of any
      // canViewTasks permission held) — never show this link to them, even
      // via a direct permAny match, not just the "My Tasks" fallback below.
      if (item.hideForSeller && isSeller) return acc;
      if (item.permAny) {
        if (hasPermAny(item.permAny)) {
          acc.push(item);
        } else if (item.fallbackLabel && hasAnyProjectManagementPerm && !isSeller) {
          acc.push({ ...item, label: item.fallbackLabel });
        }
        return acc;
      }
      acc.push(item);
      return acc;
    }, []),
  })).filter(group => group.items.length > 0);

  return (
    <div className="sidebar">
      {/* Logo */}
      <div style={{ padding: '20px 20px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #2563eb, #60a5fa)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16 }}>
          🏢
        </div>
        <div>
          <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '15px', letterSpacing: '-0.2px' }}>Movent</div>
          <div style={{ color: '#475569', fontSize: '10.5px', marginTop: '-1px' }}>Management System</div>
        </div>
      </div>

      {/* Nav Groups */}
      <nav className="sidebar-nav">
        {visibleGroups.map((group) => (
          <div key={group.label}>
            <span className="nav-section-label">{group.label}</span>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              const badgeCount = item.badgeKey ? navBadges[item.badgeKey] : 0;
              return (
                <Link key={item.href} href={item.href} className={`nav-item ${isActive ? 'active' : ''}`} style={{ position: 'relative' }}>
                  <Icon size={17} className="nav-icon" />
                  {item.label}
                  {badgeCount > 0 && (
                    <span style={{
                      position: 'absolute', top: 7, left: 14,
                      width: 8, height: 8, borderRadius: '50%',
                      background: '#ef4444', border: '2px solid #0f172a',
                    }} />
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Logout */}
      <div style={{ padding: '12px 12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          onClick={() => logoutUser(authType || 'user')}
          className="nav-item"
          style={{ background: 'transparent', border: 'none', width: '100%', cursor: 'pointer', textAlign: 'left' }}
        >
          <HiArrowRightOnRectangle size={17} className="nav-icon" />
          Logout
        </button>
      </div>
    </div>
  );
}
