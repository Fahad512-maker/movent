'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { userProjectService } from '@/lib/services/userProjectService';
import { can, getUserModulePermissions } from '@/lib/auth';
import { MODULE_CATALOG } from '@/lib/moduleCatalog';
import { inp, lbl, card } from '@/components/admin/projects/shared';
import toast from 'react-hot-toast';

export default function UserManagementPage() {
  const router = useRouter();
  const canAddUsers = can('account', 'canAddUsers');

  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [perms, setPerms]       = useState<Record<string, string[]>>({});
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    if (!canAddUsers) router.replace('/dashboard');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Every module the acting user holds at least one permission in — they can
  // only grant a NEW user a subset of what they themselves already have
  // (enforced again server-side in UserManagementController::grantAssignment).
  const grantableModules = MODULE_CATALOG
    .filter(mod => mod.key !== 'account')
    .map(mod => ({ mod, myPerms: getUserModulePermissions(mod.key) }))
    .filter(({ myPerms }) => myPerms.length > 0);

  const togglePerm = (moduleKey: string, permKey: string) => {
    setPerms(prev => {
      const cur = prev[moduleKey] ?? [];
      const next = cur.includes(permKey) ? cur.filter(k => k !== permKey) : [...cur, permKey];
      return { ...prev, [moduleKey]: next };
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password) {
      toast.error('Name, email and password are required');
      return;
    }
    setSaving(true);
    try {
      await userProjectService.team.createUser({ name: name.trim(), email: email.trim(), password, permissions: perms });
      toast.success('User created');
      setName(''); setEmail(''); setPassword(''); setPerms({});
    } catch (err: unknown) {
      const ex = err as { response?: { data?: { message?: string } } };
      toast.error(ex.response?.data?.message ?? 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  if (!canAddUsers) return null;

  return (
    <DashboardLayout title="Users">
      <div style={{ maxWidth: 720 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>Users</h1>
        <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20 }}>
          Add a new staff user to your company. You can only grant permissions you yourself already hold.
        </div>

        <form onSubmit={submit} style={card}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={{ flex: '1 1 200px' }}>
              <label style={lbl}>Full Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} style={inp} placeholder="Ahmed Khan" />
            </div>
            <div style={{ flex: '1 1 220px' }}>
              <label style={lbl}>Email Address *</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inp} placeholder="ahmed@company.com" />
            </div>
            <div style={{ flex: '1 1 180px' }}>
              <label style={lbl}>Password *</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={inp} placeholder="Min 8 characters" minLength={8} />
            </div>
          </div>

          {grantableModules.length > 0 ? (
            <div style={{ marginBottom: 16 }}>
              <label style={lbl}>Permissions to grant</label>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10 }}>You can only grant permissions you yourself have.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {grantableModules.map(({ mod, myPerms }) => {
                  const modPerms = perms[mod.key] ?? [];
                  const grantablePerms = mod.permissions.filter(p => myPerms.includes(p.key));
                  return (
                    <div key={mod.key} style={{ border: '1.5px solid #f1f5f9', borderRadius: 10, overflow: 'hidden' }}>
                      <div style={{ padding: '9px 14px', background: '#fafafa', fontWeight: 700, fontSize: 13, color: mod.color }}>
                        {mod.name}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 4, padding: '10px 14px' }}>
                        {grantablePerms.map(p => (
                          <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', cursor: 'pointer' }}>
                            <input type="checkbox" checked={modPerms.includes(p.key)} onChange={() => togglePerm(mod.key, p.key)} style={{ accentColor: mod.color }} />
                            {p.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 16, fontSize: 12, color: '#94a3b8' }}>
              You don&apos;t hold any grantable module permissions yet — the new user can still be created, but with no module access until an admin assigns some.
            </div>
          )}

          <button type="submit" disabled={saving} style={{ padding: '10px 24px', background: saving ? '#93c5fd' : '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Creating…' : 'Create User'}
          </button>
        </form>
      </div>
    </DashboardLayout>
  );
}
