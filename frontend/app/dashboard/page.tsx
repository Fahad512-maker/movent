'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import DashboardLayout from '@/components/layout/DashboardLayout';
import api from '@/lib/axios';
import { getAuthType, getAuthUser } from '@/lib/auth';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { User } from '@/types';

// ─── Types ───────────────────────────────────────────────────────────────────
interface Plan {
  name: string | null; tier: string | null;
  max_companies: number | null; max_users_per_company: number | null;
  companies_used: number; can_add_company: boolean;
  subscription_status: string; trial_ends_at: string | null; subscription_ends_at: string | null;
  users_used: number; users_limit: number | null;
}
interface Stats {
  leads:     { total: number; new: number; won: number; lost: number };
  clients:   { total: number; portal: number; active: number };
  projects:  { total: number; active: number; done: number; on_hold: number };
  tasks:     { todo: number; in_progress: number; completed: number; overdue: number };
  invoices:  { total: number; unpaid: number; overdue: number; paid: number; total_billed: number; total_unpaid: number };
  payments:  { total_received: number; this_month: number };
  employees: { total: number; users: number };
  support:   { open_tickets: number };
}
interface Company { id: number; name: string; is_active: boolean; clients_count: number; portal_clients_count: number; seat_limit: number | null }
interface RecentLead    { id: number; name: string; email: string | null; status: string; source: string | null; created_at: string }
interface RecentClient  { id: number; name: string; company_name: string | null; portal_access: boolean; status: string; created_at: string }
interface RecentInvoice { id: number; invoice_number: string; total_amount: number; status: string; due_date: string | null; created_at: string }
interface RecentProject { id: number; name: string; status: string; deadline: string | null; created_at: string }
interface DashData {
  modules: string[];
  plan: Plan; stats: Stats; companies: Company[];
  recent: { leads: RecentLead[]; clients: RecentClient[]; invoices: RecentInvoice[]; projects: RecentProject[] };
  by_status: { leads: Record<string, number>; projects: Record<string, number>; invoices: Record<string, number> };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const PKR = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  active: { bg: '#ecfdf5', color: '#059669' }, won: { bg: '#ecfdf5', color: '#059669' },
  completed: { bg: '#ecfdf5', color: '#059669' }, paid: { bg: '#ecfdf5', color: '#059669' },
  new: { bg: '#eff6ff', color: '#2563eb' }, in_progress: { bg: '#eff6ff', color: '#2563eb' },
  planning: { bg: '#f5f3ff', color: '#7c3aed' }, todo: { bg: '#f5f3ff', color: '#7c3aed' },
  on_hold: { bg: '#fffbeb', color: '#d97706' }, overdue: { bg: '#fff7ed', color: '#ea580c' },
  unpaid: { bg: '#fff7ed', color: '#ea580c' }, inactive: { bg: '#f1f5f9', color: '#64748b' },
  lost: { bg: '#fef2f2', color: '#dc2626' }, cancelled: { bg: '#fef2f2', color: '#dc2626' },
  blocked: { bg: '#fef2f2', color: '#dc2626' }, open: { bg: '#fffbeb', color: '#d97706' },
  done: { bg: '#ecfdf5', color: '#059669' }, sent: { bg: '#eff6ff', color: '#2563eb' },
  partially_paid: { bg: '#fff7ed', color: '#ea580c' }, draft: { bg: '#f8fafc', color: '#64748b' },
};
const sc  = (s: string) => STATUS_COLORS[s] ?? { bg: '#f1f5f9', color: '#64748b' };
const cap = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const ago = (d: string) => {
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
};

function StatCard({ label, value, sub, color, href }: { label: string; value: string | number; sub?: string; color: string; href?: string }) {
  const inner = (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '18px 20px', height: '100%' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>{sub}</div>}
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>{inner}</Link> : inner;
}

function AlertBadge({ n, label }: { n: number; label: string }) {
  if (!n) return null;
  return (
    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
      <span style={{ fontSize: 18, fontWeight: 800, color: '#dc2626' }}>{n}</span>
      <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 500 }}>{label}</span>
    </div>
  );
}

function StatusBreakdown({ title, byStatus, total }: { title: string; byStatus: Record<string, number>; total: number }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '18px 20px' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 14 }}>{title}</div>
      {Object.keys(byStatus).length === 0
        ? <div style={{ color: '#94a3b8', fontSize: 12 }}>No data yet</div>
        : Object.entries(byStatus).map(([status, count]) => {
            const pct = Math.round((count / (total || 1)) * 100);
            const c = sc(status);
            return (
              <div key={status} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: '#475569' }}>{cap(status)}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: c.color }}>{count}</span>
                </div>
                <div style={{ height: 5, background: '#f1f5f9', borderRadius: 3 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: c.color, borderRadius: 3, transition: 'width .4s' }} />
                </div>
              </div>
            );
          })
      }
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  useAdminGuard();
  const [data, setData]       = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [modules, setModules] = useState<string[]>([]);

  useEffect(() => {
    const type = getAuthType();
    setIsAdmin(type === 'admin');

    if (type !== 'admin') {
      const user = getAuthUser() as User | null;
      const assignments = user?.company_assignments ?? [];
      const CATALOG_TO_SIDEBAR: Record<string, string[]> = {
        sales:              ['leads'],
        client:             ['clients'],
        invoice:            ['invoices'],
        hr:                 ['hr'],
        compliance:         ['compliance'],
        finance:            ['reports'],
      };
      // project_management is intentionally NOT a blanket "any permission in
      // this module → show every shortcut" mapping like the others above —
      // a Seller holds several project_management keys (chat, client-facing
      // comments, linked projects) but must never see the Tasks/Timesheets/
      // Production shortcuts, so each one requires its own specific key,
      // mirroring the same permAny lists Sidebar.tsx uses for these nav items.
      const PROJECT_MGMT_SHORTCUT_PERMS: Record<string, string[]> = {
        projects:   ['canViewProjects', 'canViewLinkedProjects', 'canViewProjectDashboard'],
        tasks:      ['canViewTasks'],
        timesheets: ['canViewTimesheets'],
        production: ['canViewProductionQueue', 'canViewProductionDashboard', 'canStartProductionTasks', 'canSubmitProductionTasks'],
      };
      const mods = new Set<string>();
      for (const a of assignments) {
        for (const [catalogKey, permKeys] of Object.entries(a.permissions ?? {})) {
          const keys = permKeys as string[];
          if (keys.length === 0) continue;
          if (catalogKey === 'project_management') {
            for (const [shortcut, requiredPerms] of Object.entries(PROJECT_MGMT_SHORTCUT_PERMS)) {
              if (requiredPerms.some(p => keys.includes(p))) mods.add(shortcut);
            }
            continue;
          }
          (CATALOG_TO_SIDEBAR[catalogKey] ?? [catalogKey]).forEach(k => mods.add(k));
        }
      }
      setModules([...mods]);
      setLoading(false);
      return;
    }

    api.get('/admin/dashboard')
      .then(r => {
        const d: DashData = r.data.data;
        setData(d);
        setModules(d.modules ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const s  = data?.stats;
  const pl = data?.plan;

  const has = (mod: string) => modules.includes(mod);
  const hasFinance = has('invoices') || has('payments');

  const clientStats      = s?.clients   ?? { total: 0, portal: 0, active: 0 };
  const invoiceStats     = s?.invoices  ?? { total: 0, unpaid: 0, overdue: 0, paid: 0, total_billed: 0, total_unpaid: 0 };
  const payStats         = s?.payments  ?? { total_received: 0, this_month: 0 };
  const invoicesByStatus = data?.by_status.invoices ?? {};
  const recentClients    = data?.recent.clients  ?? [];
  const recentInvoices   = data?.recent.invoices ?? [];

  if (loading) return (
    <DashboardLayout title="Dashboard">
      <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Loading dashboard…</div>
    </DashboardLayout>
  );

  if (!isAdmin) {
    const user        = getAuthUser() as User | null;
    const firstName   = (user?.name ?? 'there').split(' ')[0];
    const hour        = new Date().getHours();
    const greeting    = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    const SHORTCUTS: Record<string, { icon: string; label: string; desc: string; href: string; color: string; bg: string }> = {
      leads:      { icon: '💼', label: 'Leads',       desc: 'Pipeline & lead tracking',   href: '/leads',      color: '#2563eb', bg: '#eff6ff' },
      clients:    { icon: '👥', label: 'Clients',     desc: 'Client accounts',             href: '/clients',    color: '#7c3aed', bg: '#f5f3ff' },
      invoices:   { icon: '🧾', label: 'Invoices',    desc: 'Billing & payments',          href: '/invoices',   color: '#059669', bg: '#ecfdf5' },
      hr:         { icon: '🏢', label: 'HR',          desc: 'Employees & attendance',      href: '/hr',         color: '#7c3aed', bg: '#f5f3ff' },
      projects:   { icon: '📋', label: 'Projects',    desc: 'Active project tracking',     href: '/projects',   color: '#0891b2', bg: '#ecfeff' },
      tasks:      { icon: '✅', label: 'Tasks',       desc: 'My assigned tasks',           href: '/tasks',      color: '#16a34a', bg: '#f0fdf4' },
      timesheets: { icon: '⏱️', label: 'Timesheets',  desc: 'Log & review work hours',     href: '/timesheets', color: '#d97706', bg: '#fffbeb' },
      production: { icon: '🎬', label: 'Production',  desc: 'Production queue',            href: '/projects/production', color: '#dc2626', bg: '#fef2f2' },
      compliance: { icon: '🛡️', label: 'Compliance',  desc: 'Policies & risk',             href: '/compliance', color: '#b91c1c', bg: '#fef2f2' },
      reports:    { icon: '📊', label: 'Reports',     desc: 'Financial reports',           href: '/reports',    color: '#d97706', bg: '#fffbeb' },
    };

    const cards = modules.filter(m => SHORTCUTS[m]).map(m => SHORTCUTS[m]);

    return (
      <DashboardLayout title="My Workspace">
        <div style={{ maxWidth: 860 }}>
          {/* Greeting */}
          <div style={{ marginBottom: 28 }}>
            <div suppressHydrationWarning style={{ fontSize: 22, fontWeight: 800, color: '#1e293b' }}>
              {greeting}, {firstName} 👋
            </div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 4 }}>
              Here&apos;s your workspace — select a module to get started.
            </div>
          </div>

          {cards.length === 0 ? (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 14, padding: '36px 28px', textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
              <div style={{ fontWeight: 700, color: '#92400e', fontSize: 15 }}>No modules assigned yet</div>
              <div style={{ color: '#a16207', fontSize: 13, marginTop: 6 }}>
                Contact your administrator to request module access.
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14 }}>
              {cards.map(m => (
                <Link key={m.href} href={m.href} style={{ textDecoration: 'none' }}>
                  <div style={{
                    background: '#fff', borderRadius: 14,
                    border: '1px solid #e2e8f0',
                    padding: '20px 18px',
                    display: 'flex', flexDirection: 'column', gap: 12,
                    transition: 'box-shadow .15s, border-color .15s',
                    cursor: 'pointer',
                  }}>
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: m.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
                      {m.icon}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{m.label}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3, lineHeight: 1.4 }}>{m.desc}</div>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: m.color }}>Open →</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </DashboardLayout>
    );
  }

  const TIER_C: Record<string, string> = { basic: '#475569', professional: '#2563eb', enterprise: '#7c3aed', custom: '#a21caf' };
  const SUB_C: Record<string, { bg: string; color: string; label: string }> = {
    active:          { bg: '#ecfdf5', color: '#059669', label: 'Active' },
    trial:           { bg: '#fffbeb', color: '#d97706', label: 'Trial' },
    suspended:       { bg: '#fef2f2', color: '#dc2626', label: 'Suspended' },
    cancelled:       { bg: '#f1f5f9', color: '#64748b', label: 'Cancelled' },
    pending_payment: { bg: '#fff7ed', color: '#ea580c', label: 'Pending Payment' },
  };
  const subB = SUB_C[pl?.subscription_status ?? ''] ?? { bg: '#f1f5f9', color: '#64748b', label: pl?.subscription_status ?? '—' };

  const adminAuthUser  = getAuthUser() as User | null;
  const adminFirstName = (adminAuthUser?.name ?? 'Admin').split(' ')[0];
  const adminHour      = new Date().getHours();
  const adminGreeting  = adminHour < 12 ? 'Good morning' : adminHour < 17 ? 'Good afternoon' : 'Good evening';

  // This whole function only reaches here when isAdmin (see the `if
  // (!isAdmin)` early return above) — every href below MUST be under /admin/*.
  // A bare path like '/projects' routes into the sub-user page, which then
  // calls /user/* endpoints with this Admin's token and 401s, which the axios
  // interceptor treats as an expired session and force-logs-out.
  const statCards = [
    has('leads')    && s && { label: 'Leads',        value: s.leads.total,                sub: `${s.leads.new} new · ${s.leads.won} won`,                              color: '#2563eb', href: '/admin/leads' },
    has('clients')  &&      { label: 'Clients',      value: clientStats.total,            sub: `${clientStats.portal} portal active`,                                  color: '#7c3aed', href: '/admin/clients' },
    has('projects') && s && { label: 'Projects',     value: s.projects.total,             sub: `${s.projects.active} active · ${s.projects.done} done`,               color: '#059669', href: '/admin/projects' },
    has('tasks')    && s && { label: 'Tasks',        value: s.tasks.todo + s.tasks.in_progress, sub: s.tasks.overdue ? `${s.tasks.overdue} overdue!` : `${s.tasks.completed} done`, color: s.tasks.overdue ? '#dc2626' : '#0891b2', href: '/admin/tasks' },
    has('invoices') &&      { label: 'Invoices',     value: invoiceStats.total,           sub: `${invoiceStats.unpaid} unpaid · ${invoiceStats.overdue} overdue`,       color: '#d97706', href: '/admin/invoices' },
    has('invoices') &&      { label: 'Total Billed', value: PKR(invoiceStats.total_billed),  sub: `${PKR(invoiceStats.total_unpaid)} pending`,                        color: '#059669', href: '/admin/invoices' },
    hasFinance      &&      { label: 'Revenue',      value: PKR(payStats.total_received),    sub: `${PKR(payStats.this_month)} this month`,                            color: '#16a34a', href: '/admin/payments' },
    has('hr')       && s && { label: 'Employees',    value: s.employees.total,            sub: `${s.employees.users} system users`,                                    color: '#64748b', href: '/admin/hr' },
  ].filter(Boolean) as { label: string; value: string | number; sub: string; color: string; href: string }[];

  const alerts = s ? [
    has('tasks')    && s.tasks.overdue    > 0 && { n: s.tasks.overdue,          label: 'overdue tasks' },
    has('invoices') && s.invoices.overdue > 0 && { n: s.invoices.overdue,       label: 'overdue invoices' },
    has('clients')  && s.support.open_tickets > 0 && { n: s.support.open_tickets, label: 'open support tickets' },
  ].filter(Boolean) as { n: number; label: string }[] : [];

  const breakdowns = [
    has('projects') && data && data.stats.projects.total > 0 && { title: 'Projects by Status', byStatus: data.by_status.projects, total: data.stats.projects.total },
    has('invoices') && invoiceStats.total > 0 && { title: 'Invoices by Status', byStatus: invoicesByStatus, total: Object.values(invoicesByStatus).reduce((a: number, b: number) => a + b, 0) },
    has('leads')    && data && data.stats.leads.total > 0    && { title: 'Leads by Status',    byStatus: data.by_status.leads,    total: data.stats.leads.total    },
  ].filter(Boolean) as { title: string; byStatus: Record<string, number>; total: number }[];

  type RecentCol = { key: string; title: string; href: string; createHref?: string; items: React.ReactNode[] };
  const recentCols: RecentCol[] = [
    has('leads') && data && data.recent.leads.length > 0 && {
      key: 'leads', title: 'Recent Leads', href: '/admin/leads',
      items: data.recent.leads.map((l: RecentLead) => {
        const c = sc(l.status);
        return (
          <Link key={l.id} href={`/admin/leads/${l.id}`} style={{ display: 'block', padding: '10px 16px', borderBottom: '1px solid #f8fafc', textDecoration: 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{l.source ?? '—'}</div>
              </div>
              <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 20, background: c.bg, color: c.color, fontWeight: 600, whiteSpace: 'nowrap', marginLeft: 6, flexShrink: 0 }}>{cap(l.status)}</span>
            </div>
            <div suppressHydrationWarning style={{ fontSize: 10, color: '#cbd5e1', marginTop: 3 }}>{ago(l.created_at)}</div>
          </Link>
        );
      }),
    },
    has('clients') && recentClients.length > 0 && {
      key: 'clients', title: 'Recent Clients', href: '/admin/clients',
      items: recentClients.map((c: RecentClient) => {
        const cs = sc(c.status);
        return (
          <Link key={c.id} href={`/admin/clients/${c.id}`} style={{ display: 'block', padding: '10px 16px', borderBottom: '1px solid #f8fafc', textDecoration: 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{c.company_name ?? '—'}</div>
              </div>
              {c.portal_access
                ? <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 20, background: '#ecfdf5', color: '#059669', fontWeight: 600, flexShrink: 0, marginLeft: 6 }}>Portal</span>
                : <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 20, background: cs.bg, color: cs.color, fontWeight: 600, flexShrink: 0, marginLeft: 6 }}>{cap(c.status)}</span>
              }
            </div>
            <div suppressHydrationWarning style={{ fontSize: 10, color: '#cbd5e1', marginTop: 3 }}>{ago(c.created_at)}</div>
          </Link>
        );
      }),
    },
    has('projects') && data && {
      key: 'projects', title: 'Recent Projects', href: '/admin/projects', createHref: '/admin/projects/create',
      items: data.recent.projects.map((p: RecentProject) => {
        const c = sc(p.status);
        return (
          <Link key={p.id} href={`/admin/projects/${p.id}`} style={{ display: 'block', padding: '10px 16px', borderBottom: '1px solid #f8fafc', textDecoration: 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{p.name}</div>
              <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 20, background: c.bg, color: c.color, fontWeight: 600, whiteSpace: 'nowrap', marginLeft: 6, flexShrink: 0 }}>{cap(p.status)}</span>
            </div>
            {p.deadline && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>Due: {p.deadline}</div>}
            <div suppressHydrationWarning style={{ fontSize: 10, color: '#cbd5e1', marginTop: 2 }}>{ago(p.created_at)}</div>
          </Link>
        );
      }),
    },
    has('invoices') && recentInvoices.length > 0 && {
      key: 'invoices', title: 'Recent Invoices', href: '/admin/invoices',
      items: recentInvoices.map((inv: RecentInvoice) => {
        const c = sc(inv.status);
        return (
          <Link key={inv.id} href={`/admin/invoices/${inv.id}`} style={{ display: 'block', padding: '10px 16px', borderBottom: '1px solid #f8fafc', textDecoration: 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{inv.invoice_number}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#059669' }}>{PKR(inv.total_amount)}</div>
              </div>
              <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 20, background: c.bg, color: c.color, fontWeight: 600, flexShrink: 0, marginLeft: 6 }}>{cap(inv.status)}</span>
            </div>
            {inv.due_date && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>Due: {inv.due_date}</div>}
            <div suppressHydrationWarning style={{ fontSize: 10, color: '#cbd5e1', marginTop: 2 }}>{ago(inv.created_at)}</div>
          </Link>
        );
      }),
    },
  ].filter(Boolean) as RecentCol[];

  const colWidth = recentCols.length === 0 ? '100%'
    : recentCols.length === 1 ? '1fr'
    : recentCols.length === 2 ? '1fr 1fr'
    : recentCols.length === 3 ? '1fr 1fr 1fr'
    : '1fr 1fr 1fr 1fr';

  return (
    <DashboardLayout title="Dashboard">

      {/* ── Greeting ────────────────────────────────────────────────── */}
      {isAdmin && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
          <div>
            <div suppressHydrationWarning style={{ fontSize: 22, fontWeight: 800, color: '#1e293b', lineHeight: 1.2 }}>
              {adminGreeting}, {adminFirstName} 👋
            </div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 5 }}>
              Here&apos;s what&apos;s happening across your workspace.
            </div>
          </div>
          {pl && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, padding: '5px 13px', borderRadius: 20, fontWeight: 600, background: '#f1f5f9', color: TIER_C[pl.tier ?? ''] ?? '#475569' }}>
                {pl.name ?? 'No Package'}{pl.tier ? ` · ${pl.tier}` : ''}
              </span>
              <span style={{ fontSize: 11, padding: '5px 13px', borderRadius: 20, fontWeight: 600, background: subB.bg, color: subB.color }}>
                {subB.label}
              </span>
              <span style={{ fontSize: 12, color: pl.users_limit !== null && pl.users_used >= pl.users_limit ? '#dc2626' : '#94a3b8', fontWeight: 500 }}>
                {pl.users_used ?? 1}/{pl.users_limit ?? '∞'} users
              </span>
              {pl.can_add_company && (
                <Link href="/admin/companies/create" style={{ fontSize: 11, padding: '5px 12px', background: '#2563eb', color: '#fff', borderRadius: 8, fontWeight: 600, textDecoration: 'none' }}>
                  + Add Company
                </Link>
              )}
              <Link href="/admin/upgrade-modules" style={{ fontSize: 11, padding: '5px 12px', background: '#fff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 8, fontWeight: 600, textDecoration: 'none' }}>
                Upgrade Modules
              </Link>
            </div>
          )}
        </div>
      )}

      {/* ── No modules yet ──────────────────────────────────────────── */}
      {modules.length === 0 && isAdmin && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '28px 24px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>No modules active yet</div>
            <Link href="/admin/upgrade-modules" style={{ fontSize: 12, padding: '6px 14px', background: '#2563eb', color: '#fff', borderRadius: 8, fontWeight: 600, textDecoration: 'none' }}>
              Purchase Modules
            </Link>
          </div>
          <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20 }}>
            Your account has no modules enabled yet.
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[
              { icon: '💼', label: 'Sales',    desc: 'Leads & pipeline' },
              { icon: '🧾', label: 'Invoice',  desc: 'Billing & payments' },
              { icon: '👥', label: 'HR',       desc: 'Employees & payroll' },
              { icon: '📋', label: 'Projects', desc: 'Tasks & timesheets' },
            ].map(m => (
              <div key={m.label} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 16px', opacity: 0.65 }}>
                <span style={{ fontSize: 20 }}>{m.icon}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>{m.label}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>{m.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Alerts row ──────────────────────────────────────────────── */}
      {alerts.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          {alerts.map(a => <AlertBadge key={a.label} n={a.n} label={a.label} />)}
        </div>
      )}

      {/* ── Stat cards (only purchased modules) ─────────────────────── */}
      {statCards.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(statCards.length, 4)}, 1fr)`, gap: 12, marginBottom: 20 }}>
          {statCards.map(c => (
            <StatCard key={c.label} label={c.label} value={c.value} sub={c.sub} color={c.color} href={c.href} />
          ))}
        </div>
      )}

      {/* ── Status breakdowns (only purchased modules) ───────────────── */}
      {breakdowns.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${breakdowns.length}, 1fr)`, gap: 14, marginBottom: 20 }}>
          {breakdowns.map(b => (
            <StatusBreakdown key={b.title} title={b.title} byStatus={b.byStatus} total={b.total} />
          ))}
        </div>
      )}

      {/* ── Recent activity (only purchased modules) ─────────────────── */}
      {recentCols.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: colWidth, gap: 14, marginBottom: 20 }}>
          {recentCols.map(col => (
            <div key={col.key} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>{col.title}</span>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  {col.createHref && (
                    <Link href={col.createHref} style={{ fontSize: 12, color: '#fff', fontWeight: 700, textDecoration: 'none', background: '#2563eb', padding: '5px 12px', borderRadius: 7 }}>+ New</Link>
                  )}
                  <Link href={col.href} style={{ fontSize: 11, color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>All →</Link>
                </div>
              </div>
              {col.items.length === 0
                ? <div style={{ padding: '20px 16px', fontSize: 12, color: '#94a3b8' }}>Nothing yet</div>
                : col.items
              }
            </div>
          ))}
        </div>
      )}

      {/* ── Companies breakdown ─────────────────────────────────────── */}
      {data && data.companies.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>My Companies</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {pl?.can_add_company && (
                <Link href="/admin/companies/create" style={{ fontSize: 11, color: '#fff', background: '#2563eb', fontWeight: 600, textDecoration: 'none', padding: '4px 12px', borderRadius: 6 }}>+ Add Company</Link>
              )}
              {has('clients') && (
                <Link href="/admin/clients" style={{ fontSize: 11, color: '#2563eb', fontWeight: 600, textDecoration: 'none', padding: '4px 12px', border: '1px solid #bfdbfe', borderRadius: 6 }}>Manage Clients →</Link>
              )}
            </div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Company', 'Status', 'Seat Limit', 'Clients', 'Portal Active', 'Usage'].map(h => (
                  <th key={h} style={{ padding: '9px 18px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.companies.map(c => {
                const limit = c.seat_limit;
                const pct   = limit ? Math.min(Math.round((c.portal_clients_count / limit) * 100), 100) : 0;
                const bc    = pct >= 90 ? '#dc2626' : pct >= 70 ? '#d97706' : '#059669';
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '12px 18px', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{c.name}</td>
                    <td style={{ padding: '12px 18px' }}>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 500, background: c.is_active ? '#ecfdf5' : '#f1f5f9', color: c.is_active ? '#059669' : '#94a3b8' }}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 18px', fontSize: 15, fontWeight: 800, color: '#2563eb' }}>{limit ?? '∞'}</td>
                    <td style={{ padding: '12px 18px', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{c.clients_count}</td>
                    <td style={{ padding: '12px 18px' }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#059669' }}>{c.portal_clients_count}</span>
                      {limit && <span style={{ fontSize: 11, color: '#94a3b8' }}> / {limit}</span>}
                    </td>
                    <td style={{ padding: '12px 18px', minWidth: 140 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 5, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: limit ? `${pct}%` : '0%', background: bc, borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 10, color: bc, fontWeight: 600, whiteSpace: 'nowrap' }}>{limit ? `${pct}%` : '—'}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </DashboardLayout>
  );
}
