'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { userService } from '@/lib/services/userService';
import { getAvailableModules } from '@/lib/moduleCatalog';
import { SIMPLE_PROJECT_PERMISSIONS } from '@/lib/simplifiedProjectPermissions';
import { USER_ROLE_TYPE_OPTIONS, getRoleDefaultPermissions } from '@/lib/roleUtils';
import { CompanyOption, User } from '@/types';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { HiArrowLeft } from 'react-icons/hi2';

// Mirrors the same helper in app/users/new/page.tsx — visible permission
// keys per catalog module (respecting requiresDb/hideIfCatalogKey), so role
// defaults never auto-check something the checkbox UI wouldn't itself show.
function visiblePermsByModule(availMods: ReturnType<typeof getAvailableModules>, rawDb: string[]): Record<string, string[]> {
  const availCatalogKeys = availMods.map(m => m.key);
  const out: Record<string, string[]> = {};
  for (const mod of availMods) {
    out[mod.key] = mod.permissions
      .filter(p => (!p.requiresDb || rawDb.includes(p.requiresDb)) && (!p.hideIfCatalogKey || !availCatalogKeys.includes(p.hideIfCatalogKey)))
      .map(p => p.key);
  }
  return out;
}

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 13px', border: '1.5px solid #e2e8f0', borderRadius: 8,
  fontSize: 14, outline: 'none', background: '#fafafa', color: '#0f172a', boxSizing: 'border-box',
};
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: '#475569',
  marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em',
};

function EditUserPageContent() {
  useAdminGuard();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = Number(params.id);

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [toast, setToast]       = useState('');

  // Basic info
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', role_type: '' });

  // Permissions: companyId → moduleKey → permKey[]
  const [perms, setPerms]                 = useState<Record<number, Record<string, string[]>>>({});
  const [companies, setCompanies]         = useState<CompanyOption[]>([]);
  const [assignedIds, setAssignedIds]     = useState<number[]>([]);
  const [activeCompanyId, setActiveCompanyId] = useState<number | null>(null);
  const [showAdvancedPM, setShowAdvancedPM] = useState(false);
  const permissionsSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([userService.getOne(id), userService.listCompanyOptions()])
      .then(([user, cos]: [User, CompanyOption[]]) => {
        setForm({ name: user.name, email: user.email, password: '', phone: user.phone ?? '', role_type: user.role_type ?? '' });

        const assignments = user.company_assignments ?? [];
        const ids = assignments.map(a => a.company_id);
        setAssignedIds(ids);
        setActiveCompanyId(ids[0] ?? null);
        setCompanies(cos);

        // Load existing permissions into state
        const initialPerms: Record<number, Record<string, string[]>> = {};
        for (const a of assignments) {
          initialPerms[a.company_id] = { ...(a.permissions as Record<string, string[]>) };
        }
        setPerms(initialPerms);
      })
      .catch(() => setError('Failed to load user'))
      .finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep-link from the Users list's "Permissions" action — scroll straight to this section.
  useEffect(() => {
    if (searchParams.get('tab') === 'permissions' && !loading) {
      permissionsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePerm = (companyId: number, moduleKey: string, permKey: string) => {
    setPerms(prev => {
      const cur = prev[companyId]?.[moduleKey] ?? [];
      const next = cur.includes(permKey) ? cur.filter(k => k !== permKey) : [...cur, permKey];
      return { ...prev, [companyId]: { ...(prev[companyId] ?? {}), [moduleKey]: next } };
    });
  };

  const toggleModuleAll = (companyId: number, moduleKey: string, allKeys: string[]) => {
    setPerms(prev => {
      const cur = prev[companyId]?.[moduleKey] ?? [];
      const allSel = allKeys.every(k => cur.includes(k));
      return { ...prev, [companyId]: { ...(prev[companyId] ?? {}), [moduleKey]: allSel ? [] : [...allKeys] } };
    });
  };

  // Changing the role is a meaningful action (it implies "this person's job
  // changed"), so it's confirmed before touching anything, and — unlike Add
  // User, where defaults just pre-fill a blank slate — it REPLACES whatever
  // custom permissions were already saved, across every company this user is
  // assigned to (each filtered to that company's own purchased modules).
  const handleRoleChange = (newRole: string) => {
    if (!newRole || newRole === form.role_type) {
      setForm(f => ({ ...f, role_type: newRole }));
      return;
    }

    const proceed = window.confirm(
      'Changing role will apply default permissions for this role. Do you want to continue?'
    );
    if (!proceed) return; // Rule: cancelled -> keep existing custom permissions AND role unchanged.

    setForm(f => ({ ...f, role_type: newRole }));

    const nextPerms = { ...perms };
    for (const cid of assignedIds) {
      const co = companies.find(c => c.id === cid);
      const rawDb = co?.modules ?? [];
      const availMods = getAvailableModules(rawDb);
      const allPerms = visiblePermsByModule(availMods, rawDb);
      nextPerms[cid] = getRoleDefaultPermissions(newRole, availMods.map(m => m.key), allPerms);
    }
    setPerms(nextPerms);
  };

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      // Update basic info
      await userService.update(id, {
        name:      form.name,
        email:     form.email,
        password:  form.password || undefined,
        phone:     form.phone || null,
        role_type: form.role_type || undefined,
      });

      // Update permissions per company
      for (const cid of assignedIds) {
        await userService.updateCompanyPermissions(id, cid, perms[cid] ?? {});
      }

      setToast('Saved successfully');
      setTimeout(() => setToast(''), 2500);
      router.push('/admin/users');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } };
      const msgs = e.response?.data?.errors;
      if (msgs) setError(Object.values(msgs).flat().join(' · '));
      else setError(e.response?.data?.message ?? 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout title="Edit User">
      <div style={{ maxWidth: 860 }}>
        <button onClick={() => router.push('/admin/users')} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 24, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 14 }}>
          <HiArrowLeft size={16} /> Back to Users
        </button>

        {toast && (
          <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 8, padding: '10px 16px', color: '#059669', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
            {toast}
          </div>
        )}
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 16px', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* ── Account Details ─────────────────────────────────────────── */}
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Account Details</div>
              </div>
              <div style={{ padding: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={lbl}>Full Name *</label>
                  <input style={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                </div>
                <div>
                  <label style={lbl}>Email *</label>
                  <input style={inp} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
                </div>
                <div>
                  <label style={lbl}>New Password <span style={{ color: '#94a3b8', fontWeight: 400, textTransform: 'none' }}>(leave blank to keep)</span></label>
                  <input style={inp} type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
                </div>
                <div>
                  <label style={lbl}>Phone</label>
                  <input style={inp} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+92 300 0000000" />
                </div>
                <div>
                  <label style={lbl}>Role</label>
                  <select style={inp} value={form.role_type} onChange={e => handleRoleChange(e.target.value)}>
                    <option value="">Auto-detect from assigned modules</option>
                    {USER_ROLE_TYPE_OPTIONS.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* ── Permissions ─────────────────────────────────────────────── */}
            <div ref={permissionsSectionRef} style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Module Permissions</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>Configure what this user can do in each module.</div>
              </div>

              <div style={{ padding: 24 }}>
                {assignedIds.length === 0 ? (
                  <div style={{ color: '#94a3b8', fontSize: 13 }}>This user has no company assignments.</div>
                ) : (
                  <>
                    {/* Role default-permissions helper text + selected count */}
                    {activeCompanyId !== null && (() => {
                      const totalSelected = Object.values(perms[activeCompanyId] ?? {}).reduce((sum, arr) => sum + arr.length, 0);
                      return (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, padding: '10px 14px', background: '#f8fafc', borderRadius: 8 }}>
                          <span style={{ fontSize: 12, color: '#64748b' }}>
                            Default permissions are selected based on role. You can customize them before saving.
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#2563eb', whiteSpace: 'nowrap', marginLeft: 12 }}>
                            {totalSelected} permission{totalSelected === 1 ? '' : 's'} selected
                          </span>
                        </div>
                      );
                    })()}

                    {/* Company tabs */}
                    {assignedIds.length > 1 && (
                      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '2px solid #f1f5f9' }}>
                        {assignedIds.map(cid => {
                          const co = companies.find(c => c.id === cid);
                          const active = cid === activeCompanyId;
                          return (
                            <button key={cid} onClick={() => setActiveCompanyId(cid)} style={{ padding: '9px 18px', borderRadius: '8px 8px 0 0', border: 'none', background: active ? '#2563eb' : 'transparent', color: active ? '#fff' : '#64748b', fontWeight: active ? 700 : 500, fontSize: 13, cursor: 'pointer' }}>
                              {co?.name ?? `Company ${cid}`}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Add Users — one common toggle per company, not per module */}
                    {activeCompanyId !== null && (() => {
                      const canThisUserAddUsers = (perms[activeCompanyId]?.['account'] ?? []).includes('canAddUsers');
                      return (
                        <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderRadius: 10, border: `1.5px solid ${canThisUserAddUsers ? '#2563eb40' : '#e2e8f0'}`, background: canThisUserAddUsers ? '#eff6ff' : '#fafafa', marginBottom: 16, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={canThisUserAddUsers}
                            onChange={() => togglePerm(activeCompanyId, 'account', 'canAddUsers')}
                            style={{ width: 16, height: 16, accentColor: '#2563eb', cursor: 'pointer' }}
                          />
                          <div>
                            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13.5 }}>User Management Permission</div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>Lets this user create/invite other staff users for this company, from their own "User Management" page.</div>
                          </div>
                        </label>
                      );
                    })()}

                    {/* General Chat — same "account module, one common toggle" pattern as
                        Add Users above; not tied to any purchased module (available across portals). */}
                    {activeCompanyId !== null && (() => {
                      const canThisUserUseChat = (perms[activeCompanyId]?.['account'] ?? []).includes('canUseGeneralChat');
                      return (
                        <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderRadius: 10, border: `1.5px solid ${canThisUserUseChat ? '#2563eb40' : '#e2e8f0'}`, background: canThisUserUseChat ? '#eff6ff' : '#fafafa', marginBottom: 16, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={canThisUserUseChat}
                            onChange={() => togglePerm(activeCompanyId, 'account', 'canUseGeneralChat')}
                            style={{ width: 16, height: 16, accentColor: '#2563eb', cursor: 'pointer' }}
                          />
                          <div>
                            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13.5 }}>Use General Chat</div>
                            <div style={{ fontSize: 12, color: '#64748b' }}>Lets this user send/receive direct and group messages in Chat, separate from any project or lead.</div>
                          </div>
                        </label>
                      );
                    })()}

                    {/* Module permission checkboxes */}
                    {activeCompanyId !== null && (() => {
                      const co          = companies.find(c => c.id === activeCompanyId);
                      const rawDb       = co?.modules ?? [];
                      const availModules = getAvailableModules(rawDb);
                      if (availModules.length === 0) return (
                        <div style={{ color: '#94a3b8', fontSize: 13, padding: 16, background: '#f8fafc', borderRadius: 8 }}>
                          No modules purchased for this company.
                        </div>
                      );
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                          {availModules.map(mod => {
                            // Project Management: 52 granular permissions are too many to show
                            // Company Admin directly — show 11 simplified permissions instead,
                            // each expanding into its real granular keys, plus a collapsed
                            // "Advanced Permissions" section for the 5 more sensitive ones.
                            if (mod.key === 'project_management') {
                              const granted = perms[activeCompanyId]?.project_management ?? [];
                              const mainPerms = SIMPLE_PROJECT_PERMISSIONS.filter(p => !p.advanced);
                              const advPerms = SIMPLE_PROJECT_PERMISSIONS.filter(p => p.advanced);
                              const isChecked = (p: typeof mainPerms[number]) => p.maps.every(k => granted.includes(k));
                              const allMainSelected = mainPerms.every(isChecked);
                              const someSet = mainPerms.some(p => p.maps.some(k => granted.includes(k))) || advPerms.some(p => p.maps.some(k => granted.includes(k)));

                              const toggleSimple = (p: typeof mainPerms[number]) => {
                                setPerms(prev => {
                                  const cur = prev[activeCompanyId]?.project_management ?? [];
                                  const on = p.maps.every(k => cur.includes(k));
                                  const next = on ? cur.filter(k => !p.maps.includes(k)) : [...new Set([...cur, ...p.maps])];
                                  return { ...prev, [activeCompanyId]: { ...(prev[activeCompanyId] ?? {}), project_management: next } };
                                });
                              };

                              const toggleAllMain = () => {
                                setPerms(prev => {
                                  const cur = prev[activeCompanyId]?.project_management ?? [];
                                  const allKeys = mainPerms.flatMap(p => p.maps);
                                  const allSelected = mainPerms.every(p => p.maps.every(k => cur.includes(k)));
                                  const next = allSelected ? cur.filter(k => !allKeys.includes(k)) : [...new Set([...cur, ...allKeys])];
                                  return { ...prev, [activeCompanyId]: { ...(prev[activeCompanyId] ?? {}), project_management: next } };
                                });
                              };

                              const renderSimpleRow = (p: typeof mainPerms[number]) => (
                                <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer' }}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked(p)}
                                    onChange={() => toggleSimple(p)}
                                    style={{ accentColor: mod.color, width: 14, height: 14 }}
                                  />
                                  <span style={{ fontSize: 13, color: '#475569' }}>{p.label}</span>
                                </label>
                              );

                              return (
                                <div key={mod.key} style={{ border: `1.5px solid ${someSet ? mod.color + '40' : '#e2e8f0'}`, borderRadius: 10, overflow: 'hidden' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: someSet ? mod.color + '10' : '#fafafa', gap: 10 }}>
                                    <span style={{ fontWeight: 700, color: someSet ? mod.color : '#475569', fontSize: 13 }}>{mod.name}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#64748b' }}>
                                        <input type="checkbox" checked={allMainSelected} onChange={toggleAllMain} style={{ accentColor: mod.color }} />
                                        Select All
                                      </label>
                                    </div>
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 2, padding: '10px 14px' }}>
                                    {mainPerms.map(renderSimpleRow)}
                                  </div>
                                  <div style={{ padding: '0 14px 10px' }}>
                                    <button
                                      type="button"
                                      onClick={() => setShowAdvancedPM(v => !v)}
                                      style={{ background: 'none', border: 'none', padding: 0, fontSize: 12.5, fontWeight: 600, color: '#7c3aed', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                                    >
                                      {showAdvancedPM ? '▾' : '▸'} Advanced Permissions
                                    </button>
                                    {showAdvancedPM && (
                                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 2, marginTop: 8, paddingTop: 8, borderTop: '1px dashed #e2e8f0' }}>
                                        {advPerms.map(renderSimpleRow)}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            }

                            // Filter by requiresDb AND hide perms whose catalog module is also available
                            const availCatalogKeys = availModules.map(m => m.key);
                            const visiblePerms = mod.permissions.filter(
                              p => (!p.requiresDb || rawDb.includes(p.requiresDb))
                                && (!p.hideIfCatalogKey || !availCatalogKeys.includes(p.hideIfCatalogKey))
                            );
                            const modPerms = perms[activeCompanyId]?.[mod.key] ?? [];
                            const allKeys  = visiblePerms.map(p => p.key);
                            const allSel   = allKeys.length > 0 && allKeys.every(k => modPerms.includes(k));
                            const someSet  = allKeys.some(k => modPerms.includes(k));
                            return (
                              <div key={mod.key} style={{ border: `1.5px solid ${someSet ? mod.color + '40' : '#e2e8f0'}`, borderRadius: 10, overflow: 'hidden' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: someSet ? mod.color + '10' : '#fafafa', gap: 10 }}>
                                  <span style={{ fontWeight: 700, color: someSet ? mod.color : '#475569', fontSize: 13 }}>{mod.name}</span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#64748b' }}>
                                      <input type="checkbox" checked={allSel} onChange={() => toggleModuleAll(activeCompanyId, mod.key, allKeys)} style={{ accentColor: mod.color }} />
                                      Select All
                                    </label>
                                  </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 2, padding: '10px 14px' }}>
                                  {visiblePerms.map(perm => (
                                    <label key={perm.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer' }}>
                                      <input
                                        type="checkbox"
                                        checked={modPerms.includes(perm.key)}
                                        onChange={() => togglePerm(activeCompanyId, mod.key, perm.key)}
                                        style={{ accentColor: mod.color, width: 14, height: 14 }}
                                      />
                                      <span style={{ fontSize: 13, color: '#475569' }}>{perm.label}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            </div>

            {/* ── Actions ─────────────────────────────────────────────────── */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" onClick={() => router.push('/admin/users')} style={{ padding: '11px 26px', borderRadius: 9, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} style={{ padding: '11px 36px', borderRadius: 9, border: 'none', background: saving ? '#93c5fd' : 'linear-gradient(135deg, #2563eb, #3b82f6)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>

          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default function EditUserPage() {
  return (
    <Suspense fallback={<DashboardLayout title="Edit User"><div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>Loading…</div></DashboardLayout>}>
      <EditUserPageContent />
    </Suspense>
  );
}
