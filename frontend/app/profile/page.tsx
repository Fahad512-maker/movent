'use client';
import { useEffect, useRef, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { adminProfileService, userProfileService, resolveAvatarUrl } from '@/lib/services/profileService';
import { getAuthType, getAuthUser, getToken, setAuthData } from '@/lib/auth';
import { Admin, User } from '@/types';
import { card, inp, lbl } from '@/components/admin/projects/shared';
import toast from 'react-hot-toast';

const ROLE_TYPE_LABEL: Record<string, string> = {
  company_admin: 'Company Admin', project_manager: 'Project Manager', production: 'Production User',
  developer: 'Developer', designer: 'Designer', qa: 'QA', team_member: 'Team Member', seller: 'Seller',
  invoice_user: 'Invoice User', hr: 'HR User', finance: 'Finance User', compliance: 'Compliance User',
  viewer: 'Viewer',
};

export default function ProfilePage() {
  const authType = getAuthType() as 'user' | 'admin' | null;
  const isAdmin = authType === 'admin';
  const svc = isAdmin ? adminProfileService : userProfileService;

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Admin | User | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const applyProfile = (p: Admin | User) => {
    setProfile(p);
    setName(p.name);
    setPhone(p.phone ?? '');
    // Refresh the cached session so the Navbar/Sidebar reflect the change
    // immediately, without waiting for the 60s background poll.
    const token = getToken();
    if (token && authType) setAuthData(token, p, authType as 'user' | 'admin');
    window.dispatchEvent(new Event('auth_refreshed'));
  };

  useEffect(() => {
    svc.get().then(applyProfile).catch(() => toast.error('Failed to load profile')).finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const updated = await svc.update({ name: name.trim(), phone: phone.trim() || null });
      applyProfile(updated);
      toast.success('Profile updated');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to update profile');
    } finally { setSaving(false); }
  };

  const uploadAvatar = async (file: File | null) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { toast.error('Only JPG, PNG, or WEBP images are allowed'); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error('Image must be under 2MB'); return; }
    setUploadingAvatar(true);
    try {
      const updated = await svc.uploadAvatar(file);
      applyProfile(updated);
      toast.success('Avatar updated');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to upload avatar');
    } finally { setUploadingAvatar(false); }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) { toast.error('All password fields are required'); return; }
    if (newPassword !== confirmPassword) { toast.error('New password and confirm password do not match'); return; }
    if (newPassword.length < 8) { toast.error('New password must be at least 8 characters'); return; }
    setChangingPassword(true);
    try {
      await svc.changePassword({ current_password: currentPassword, password: newPassword, password_confirmation: confirmPassword });
      toast.success('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to change password');
    } finally { setChangingPassword(false); }
  };

  if (loading) {
    return <DashboardLayout title="My Profile"><div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div></DashboardLayout>;
  }
  if (!profile) {
    return <DashboardLayout title="My Profile"><div style={{ padding: 48, textAlign: 'center', color: '#dc2626' }}>Failed to load profile.</div></DashboardLayout>;
  }

  const avatarUrl = resolveAvatarUrl((profile as any).avatar_url);
  const initials = name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const roleLabel = !isAdmin ? (ROLE_TYPE_LABEL[(profile as User).role_type] ?? (profile as User).role_type) : 'Company Admin';

  return (
    <DashboardLayout title="My Profile">
      <div style={{ maxWidth: 640 }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0 }}>My Profile</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>Update your personal details and password</p>
        </div>

        <div style={card}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '0 0 16px' }}>Profile Details</h3>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
              background: 'linear-gradient(135deg, #2563eb, #60a5fa)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 22,
            }}>
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : initials}
            </div>
            <div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                style={{
                  padding: '8px 16px', borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff',
                  color: '#334155', fontSize: 13, fontWeight: 600, cursor: uploadingAvatar ? 'not-allowed' : 'pointer',
                }}
              >{uploadingAvatar ? 'Uploading…' : 'Change Photo'}</button>
              <input
                ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.webp" style={{ display: 'none' }}
                onChange={e => { uploadAvatar(e.target.files?.[0] ?? null); e.target.value = ''; }}
              />
              <p style={{ margin: '6px 0 0', fontSize: 11, color: '#94a3b8' }}>JPG, PNG or WEBP. Max 2MB.</p>
            </div>
          </div>

          <form onSubmit={saveProfile}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Full Name *</label>
                <input value={name} onChange={e => setName(e.target.value)} style={inp} required />
              </div>
              <div>
                <label style={lbl}>Phone</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} style={inp} placeholder="Optional" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
              <div>
                <label style={lbl}>Email</label>
                <input value={profile.email} disabled style={{ ...inp, background: '#f1f5f9', color: '#94a3b8', cursor: 'not-allowed' }} />
              </div>
              <div>
                <label style={lbl}>Role</label>
                <input value={roleLabel} disabled style={{ ...inp, background: '#f1f5f9', color: '#94a3b8', cursor: 'not-allowed' }} />
              </div>
            </div>
            <button type="submit" disabled={saving} style={{
              padding: '10px 22px', borderRadius: 8, border: 'none', background: saving ? '#93c5fd' : '#2563eb',
              color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
            }}>{saving ? 'Saving…' : 'Save Changes'}</button>
          </form>
        </div>

        <div style={card}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: '0 0 16px' }}>Change Password</h3>
          <form onSubmit={changePassword}>
            <div style={{ marginBottom: 14 }}>
              <label style={lbl}>Current Password *</label>
              <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} style={inp} required autoComplete="current-password" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
              <div>
                <label style={lbl}>New Password *</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={inp} required minLength={8} autoComplete="new-password" />
              </div>
              <div>
                <label style={lbl}>Confirm New Password *</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} style={inp} required minLength={8} autoComplete="new-password" />
              </div>
            </div>
            <button type="submit" disabled={changingPassword} style={{
              padding: '10px 22px', borderRadius: 8, border: 'none', background: changingPassword ? '#93c5fd' : '#2563eb',
              color: '#fff', fontSize: 13, fontWeight: 600, cursor: changingPassword ? 'not-allowed' : 'pointer',
            }}>{changingPassword ? 'Changing…' : 'Change Password'}</button>
          </form>
        </div>
      </div>
    </DashboardLayout>
  );
}
