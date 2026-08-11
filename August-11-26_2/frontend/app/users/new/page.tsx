// 'use client';
// import React, { useState, useEffect } from 'react';
// import { useRouter } from 'next/navigation';
// import DashboardLayout from '@/components/layout/DashboardLayout';
// import { userService } from '@/lib/services/userService';
// import { getAvailableModules } from '@/lib/moduleCatalog';
// import { CompanyOption } from '@/types';
// import { HiArrowLeft, HiArrowRight, HiCheckCircle, HiClipboard, HiUserGroup, HiCheck } from 'react-icons/hi2';

// const inp: React.CSSProperties = {
//   width: '100%', padding: '10px 13px', border: '1.5px solid #e2e8f0', borderRadius: 8,
//   fontSize: 14, outline: 'none', background: '#fafafa', color: '#0f172a', boxSizing: 'border-box',
// };
// const lbl: React.CSSProperties = {
//   display: 'block', fontSize: 12, fontWeight: 600, color: '#475569',
//   marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em',
// };

// interface CreatedInfo { email: string; password: string; loginUrl: string; isLinked?: boolean }

// export default function NewUserPage() {
//   const router = useRouter();

//   // Steps 1-3
//   const [step, setStep] = useState<1 | 2 | 3>(1);

//   // Step 1
//   const [name, setName] = useState('');
//   const [email, setEmail] = useState('');
//   const [password, setPassword] = useState('');

//   // Step 2
//   const [companies, setCompanies] = useState<CompanyOption[]>([]);
//   const [loadingCos, setLoadingCos] = useState(false);
//   const [selectedIds, setSelectedIds] = useState<number[]>([]);

//   // Step 3: permissions[companyId][moduleKey] = permissionKey[]
//   const [perms, setPerms] = useState<Record<number, Record<string, string[]>>>({});
//   const [activeCompanyId, setActiveCompanyId] = useState<number | null>(null);

//   // Existing-user check (Rules 1-4)
//   const [checkingEmail, setCheckingEmail] = useState(false);
//   const [existingUser, setExistingUser] = useState<{ name: string; status: string; isAdmin?: boolean } | null>(null);

//   // Submit
//   const [saving, setSaving] = useState(false);
//   const [error, setError] = useState('');
//   const [created, setCreated] = useState<CreatedInfo | null>(null);
//   const [copied, setCopied] = useState<'all' | 'url' | 'email' | 'pass' | null>(null);

//   // Load companies on mount so we know whether to skip step 2
//   useEffect(() => {
//     setLoadingCos(true);
//     userService.listCompanyOptions()
//       .then(data => {
//         setCompanies(data);
//         // Pre-select when only one company exists
//         if (data.length === 1) setSelectedIds([data[0].id]);
//       })
//       .finally(() => setLoadingCos(false));
//   }, []); // eslint-disable-line react-hooks/exhaustive-deps

//   // Set first company tab when entering step 3
//   useEffect(() => {
//     if (step === 3 && selectedIds.length > 0 && !activeCompanyId) {
//       setActiveCompanyId(selectedIds[0]);
//     }
//   }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

//   // true when step 2 can be skipped (single company, already selected)
//   const singleCompany = companies.length === 1;

//   const selectCompany = (id: number) => setSelectedIds([id]);

//   const togglePerm = (companyId: number, moduleKey: string, permKey: string) => {
//     setPerms(prev => {
//       const cur = prev[companyId]?.[moduleKey] ?? [];
//       const next = cur.includes(permKey) ? cur.filter(k => k !== permKey) : [...cur, permKey];
//       return { ...prev, [companyId]: { ...(prev[companyId] ?? {}), [moduleKey]: next } };
//     });
//   };

//   const toggleModuleAll = (companyId: number, moduleKey: string, allKeys: string[]) => {
//     setPerms(prev => {
//       const cur = prev[companyId]?.[moduleKey] ?? [];
//       const allSelected = allKeys.every(k => cur.includes(k));
//       return { ...prev, [companyId]: { ...(prev[companyId] ?? {}), [moduleKey]: allSelected ? [] : [...allKeys] } };
//     });
//   };

//   const handleSubmit = async () => {
//     setSaving(true); setError('');
//     try {
//       const assignments = selectedIds.map(cid => ({
//         company_id: cid,
//         permissions: perms[cid] ?? {},
//       }));

//       await userService.create({
//         name, email,
//         ...(existingUser ? {} : { password }),
//         company_assignments: assignments,
//       });

//       setCreated({
//         email,
//         password: existingUser ? '' : password,
//         loginUrl: window.location.origin + '/login',
//         isLinked: !!existingUser,
//       });
//     } catch (err: unknown) {
//       const ex = err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } };
//       const msgs = ex.response?.data?.errors;
//       if (msgs) setError(Object.values(msgs).flat().join(' · '));
//       else setError(ex.response?.data?.message ?? 'Failed to create user');
//     } finally { setSaving(false); }
//   };

//   const copy = (text: string, field: 'all' | 'url' | 'email' | 'pass') => {
//     navigator.clipboard.writeText(text).then(() => {
//       setCopied(field);
//       setTimeout(() => setCopied(null), 2000);
//     });
//   };

//   // ── Success screen ──────────────────────────────────────────────────────────
//   if (created) {
//     const credRows = created.isLinked
//       ? [
//         { field: 'url' as const, label: 'Login URL', value: created.loginUrl },
//         { field: 'email' as const, label: 'Email', value: created.email },
//       ]
//       : [
//         { field: 'url' as const, label: 'Login URL', value: created.loginUrl },
//         { field: 'email' as const, label: 'Email', value: created.email },
//         { field: 'pass' as const, label: 'Password', value: created.password },
//       ];
//     const allText = created.isLinked
//       ? `Login URL: ${created.loginUrl}\nEmail: ${created.email}`
//       : `Login URL: ${created.loginUrl}\nEmail: ${created.email}\nPassword: ${created.password}`;

//     return (
//       <DashboardLayout title={created.isLinked ? 'User Linked' : 'User Created'}>
//         <div style={{ maxWidth: 480 }}>
//           <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
//             <div style={{ padding: '22px 28px', borderBottom: '1px solid #f1f5f9', background: created.isLinked ? '#eff6ff' : '#f0fdf4', display: 'flex', alignItems: 'center', gap: 12 }}>
//               <HiCheckCircle size={26} color={created.isLinked ? '#2563eb' : '#059669'} />
//               <div>
//                 <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
//                   {created.isLinked ? 'User Linked to Company' : 'User Created'}
//                 </div>
//                 <div style={{ fontSize: 13, color: '#64748b' }}>
//                   {created.isLinked
//                     ? <><strong>{name}</strong> has been linked — they can now log in with their existing password</>
//                     : <>Share these credentials with <strong>{name}</strong></>}
//                 </div>
//               </div>
//             </div>
//             <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
//               {credRows.map(({ field, label, value }) => (
//                 <div key={field}>
//                   <div style={{ ...lbl, marginBottom: 8 }}>{label}</div>
//                   <div style={{ display: 'flex', gap: 8 }}>
//                     <div style={{ flex: 1, background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '10px 13px', fontSize: 13, color: '#0f172a', wordBreak: 'break-all' }}>{value}</div>
//                     <button onClick={() => copy(value, field)} style={{ padding: '10px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: copied === field ? '#ecfdf5' : '#fff', color: copied === field ? '#059669' : '#64748b', cursor: 'pointer' }}>
//                       {copied === field ? <HiCheck size={16} /> : <HiClipboard size={16} />}
//                     </button>
//                   </div>
//                 </div>
//               ))}
//               <button onClick={() => copy(allText, 'all')} style={{ width: '100%', padding: '12px 0', borderRadius: 9, border: 'none', background: copied === 'all' ? '#059669' : 'linear-gradient(135deg,#2563eb,#3b82f6)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 }}>
//                 <HiClipboard size={17} /> {copied === 'all' ? 'Copied!' : 'Copy Details'}
//               </button>
//               <button onClick={() => router.push('/users')} style={{ width: '100%', padding: '11px 0', borderRadius: 9, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
//                 <HiUserGroup size={16} /> View All Users
//               </button>
//             </div>
//           </div>
//         </div>
//       </DashboardLayout>
//     );
//   }

//   const stepLabels = ['User Info', 'Assign Companies', 'Set Permissions'];

//   return (
//     <DashboardLayout title="Add User">
//       <div style={{ maxWidth: 660 }}>
//         <button
//           onClick={() => {
//             if (step > 1) { setError(''); setStep((step === 3 && singleCompany ? 1 : step - 1) as 1 | 2 | 3); }
//             else { router.push('/users'); }
//           }}
//           style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 24, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 14 }}>
//           <HiArrowLeft size={16} /> {step > 1 ? 'Back' : 'Back to Users'}
//         </button>

//         {/* Step indicator */}
//         <div style={{ display: 'flex', gap: 0, marginBottom: 28 }}>
//           {stepLabels.map((label, i) => {
//             const n = i + 1;
//             const done = n < step;
//             const active = n === step;
//             return (
//               <div key={n} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
//                 <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
//                   <div style={{ width: 28, height: 28, borderRadius: '50%', background: done ? '#059669' : active ? '#2563eb' : '#e2e8f0', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
//                     {done ? <HiCheck size={14} /> : n}
//                   </div>
//                   <span style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? '#0f172a' : done ? '#059669' : '#94a3b8', whiteSpace: 'nowrap' }}>{label}</span>
//                 </div>
//                 {i < stepLabels.length - 1 && <div style={{ height: 2, flex: 1, background: done ? '#059669' : '#e2e8f0', margin: '0 8px' }} />}
//               </div>
//             );
//           })}
//         </div>

//         <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
//           <div style={{ padding: '18px 28px', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
//             <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
//               {step === 1 && 'User Information'}
//               {step === 2 && 'Assign to Companies'}
//               {step === 3 && 'Set Module Permissions'}
//             </h2>
//           </div>

//           <div style={{ padding: 28 }}>
//             {error && (
//               <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13, marginBottom: 20 }}>
//                 {error}
//               </div>
//             )}

//             {/* ── Step 1: User info ── */}
//             {step === 1 && (
//               <div>
//                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
//                   <div>
//                     <label style={lbl}>Full Name *</label>
//                     <input style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="Ahmed Khan" />
//                   </div>
//                   <div>
//                     <label style={lbl}>Email Address *</label>
//                     <div style={{ position: 'relative' }}>
//                       <input
//                         type="email"
//                         style={{ ...inp, paddingRight: checkingEmail ? 36 : undefined }}
//                         value={email}
//                         onChange={e => { setEmail(e.target.value); setExistingUser(null); }}
//                         onBlur={async e => {
//                           const val = e.target.value.trim();
//                           if (!val || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) return;
//                           setCheckingEmail(true);
//                           try {
//                             const res = await userService.checkEmail(val);
//                             setExistingUser(res.exists ? { name: res.name ?? '', status: res.status ?? 'active' } : null);
//                           } catch { /* ignore */ }
//                           finally { setCheckingEmail(false); }
//                         }}
//                         placeholder="ahmed@company.com"
//                       />
//                       {checkingEmail && (
//                         <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, border: '2px solid #bfdbfe', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
//                       )}
//                     </div>
//                   </div>
//                 </div>

//                 {/* Existing-user banner */}
//                 {existingUser && (
//                   <div style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 9, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
//                     <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>ℹ️</span>
//                     <div>
//                       <div style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>Existing user — {existingUser.name}</div>
//                       <div style={{ fontSize: 12, color: '#3b82f6', marginTop: 2 }}>This email already has an account. They will be <strong>linked to the selected company</strong> — no new account created.</div>
//                     </div>
//                   </div>
//                 )}

//                 {/* Password — hidden when linking an existing user */}
//                 {!existingUser && (
//                   <div style={{ marginBottom: 28 }}>
//                     <label style={lbl}>Password *</label>
//                     <input type="password" style={inp} value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 8 characters" minLength={8} />
//                   </div>
//                 )}
//                 {existingUser && <div style={{ marginBottom: 12 }} />}
//                 <button
//                   onClick={() => {
//                     if (!name || !email) { setError('Please fill in name and email.'); return; }
//                     if (!existingUser && (!password || password.length < 8)) {
//                       setError('Password is required (min 8 characters).');
//                       return;
//                     }
//                     setError('');
//                     if (singleCompany) {
//                       // Auto-assign the only company and pre-fill all visible permissions
//                       const cid = companies[0].id;
//                       const rawDb = companies[0].modules ?? [];
//                       const mods = getAvailableModules(rawDb);
//                       const auto: Record<string, string[]> = {};
//                       for (const mod of mods) {
//                         // Only pre-select permissions whose requiresDb is satisfied
//                         auto[mod.key] = mod.permissions
//                           .filter(p => !p.requiresDb || rawDb.includes(p.requiresDb))
//                           .map(p => p.key);
//                       }
//                       setPerms({ [cid]: auto });
//                       setActiveCompanyId(cid);
//                       setStep(3);
//                     } else {
//                       setStep(2);
//                     }
//                   }}
//                   style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 28px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#2563eb,#3b82f6)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
//                 >
//                   Next <HiArrowRight size={16} />
//                 </button>
//               </div>
//             )}

//             {step === 2 && (
//               <div>
//                 {loadingCos ? (
//                   <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Loading companies…</div>
//                 ) : companies.length === 0 ? (
//                   <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No active companies found.</div>
//                 ) : (
//                   <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
//                     {companies.map(c => {
//                       const sel = selectedIds.includes(c.id);
//                       return (
//                         <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 10, border: `1.5px solid ${sel ? '#bfdbfe' : '#e2e8f0'}`, background: sel ? '#eff6ff' : '#fafafa', cursor: 'pointer' }}>
//                           <input type="radio" name="company" checked={sel} onChange={() => selectCompany(c.id)} style={{ accentColor: '#2563eb', width: 16, height: 16, flexShrink: 0 }} />
//                           <span style={{ fontWeight: sel ? 700 : 500, color: sel ? '#1d4ed8' : '#0f172a', fontSize: 14 }}>{c.name}</span>
//                         </label>
//                       );
//                     })}
//                   </div>
//                 )}
//                 <div style={{ display: 'flex', gap: 10 }}>
//                   <button
//                     onClick={() => {
//                       if (selectedIds.length === 0) { setError('Select at least one company.'); return; }
//                       setError('');

//                       // Pre-select ALL permissions for companies that have none yet
//                       const nextPerms = { ...perms };
//                       for (const cid of selectedIds) {
//                         const existing = nextPerms[cid];
//                         if (existing && Object.values(existing).some(arr => arr.length > 0)) continue;
//                         const co = companies.find(c => c.id === cid);
//                         const rawDb = co?.modules ?? [];
//                         const mods = getAvailableModules(rawDb);
//                         nextPerms[cid] = {};
//                         for (const mod of mods) {
//                           nextPerms[cid][mod.key] = mod.permissions
//                             .filter(p => !p.requiresDb || rawDb.includes(p.requiresDb))
//                             .map(p => p.key);
//                         }
//                       }
//                       setPerms(nextPerms);

//                       setActiveCompanyId(selectedIds[0]);
//                       setStep(3);
//                     }}
//                     style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 28px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#2563eb,#3b82f6)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
//                   >
//                     Next <HiArrowRight size={16} />
//                   </button>
//                   <button onClick={() => { setError(''); setStep(1); }} style={{ padding: '12px 20px', borderRadius: 9, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Back</button>
//                 </div>
//               </div>
//             )}

//             {/* ── Step 3: Permissions ── */}
//             {step === 3 && (
//               <div>
//                 {/* Company tabs (multi-company only) */}
//                 {selectedIds.length > 1 && (
//                   <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
//                     {selectedIds.map(cid => {
//                       const co = companies.find(c => c.id === cid);
//                       const active = cid === activeCompanyId;
//                       return (
//                         <button key={cid} onClick={() => setActiveCompanyId(cid)} style={{ padding: '7px 16px', borderRadius: 20, border: `1.5px solid ${active ? '#2563eb' : '#e2e8f0'}`, background: active ? '#2563eb' : '#fff', color: active ? '#fff' : '#64748b', fontWeight: active ? 700 : 500, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s' }}>
//                           {co?.name ?? cid}
//                         </button>
//                       );
//                     })}
//                   </div>
//                 )}

//                 {/* Modules for active company */}
//                 {activeCompanyId !== null && (() => {
//                   const co = companies.find(c => c.id === activeCompanyId);
//                   const rawDb = co?.modules ?? [];          // raw DB module keys
//                   const availMods = getAvailableModules(rawDb);
//                   return (
//                     <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24, maxHeight: 500, overflowY: 'auto', paddingRight: 2 }}>
//                       {availMods.length === 0 && (
//                         <div style={{ color: '#94a3b8', fontSize: 13, padding: 20, background: '#f8fafc', borderRadius: 10, textAlign: 'center' }}>
//                           No modules purchased for this company.
//                         </div>
//                       )}
//                       {availMods.map(mod => {
//                         // Filter by requiresDb AND hide perms whose catalog module is also available
//                         const availCatalogKeys = availMods.map(m => m.key);
//                         const visiblePerms = mod.permissions.filter(
//                           p => (!p.requiresDb || rawDb.includes(p.requiresDb))
//                             && (!p.hideIfCatalogKey || !availCatalogKeys.includes(p.hideIfCatalogKey))
//                         );

//                         // Group visible permissions by their group label
//                         const groups = visiblePerms.reduce<Record<string, typeof visiblePerms>>(
//                           (acc, p) => {
//                             const g = p.group ?? '';
//                             if (!acc[g]) acc[g] = [];
//                             acc[g].push(p);
//                             return acc;
//                           }, {}
//                         );
//                         const groupEntries = Object.entries(groups);
//                         const hasGroups = groupEntries.length > 1 || (groupEntries.length === 1 && groupEntries[0][0] !== '');

//                         const modPerms = perms[activeCompanyId]?.[mod.key] ?? [];
//                         const visKeys = visiblePerms.map(p => p.key);
//                         const selCount = visKeys.filter(k => modPerms.includes(k)).length;
//                         const allSel = visKeys.length > 0 && selCount === visKeys.length;
//                         const noneSel = selCount === 0;

//                         return (
//                           <div key={mod.key} style={{ borderRadius: 12, border: '1.5px solid #f1f5f9', overflow: 'hidden', background: '#fff' }}>
//                             {/* Module header */}
//                             <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderLeft: `4px solid ${mod.color}`, background: '#fafafa' }}>
//                               <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
//                                 <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>{mod.name}</span>
//                                 <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: noneSel ? '#f1f5f9' : allSel ? mod.color + '20' : mod.color + '15', color: noneSel ? '#94a3b8' : mod.color }}>
//                                   {selCount}/{visKeys.length}
//                                 </span>
//                               </div>
//                               <button
//                                 onClick={() => toggleModuleAll(activeCompanyId, mod.key, visKeys)}
//                                 style={{ fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 6, border: `1.5px solid ${allSel ? mod.color : '#e2e8f0'}`, background: allSel ? mod.color : '#fff', color: allSel ? '#fff' : '#64748b', cursor: 'pointer' }}>
//                                 {allSel ? 'Deselect All' : 'Select All'}
//                               </button>
//                             </div>

//                             {/* Permission body: grouped or flat */}
//                             <div style={{ padding: '10px 16px 14px' }}>
//                               {hasGroups ? (
//                                 groupEntries.map(([groupName, groupPerms]) => (
//                                   <div key={groupName} style={{ marginBottom: 12 }}>
//                                     <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
//                                       {groupName}
//                                     </div>
//                                     <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
//                                       {groupPerms.map(perm => {
//                                         const on = modPerms.includes(perm.key);
//                                         return (
//                                           <button key={perm.key} onClick={() => togglePerm(activeCompanyId, mod.key, perm.key)}
//                                             style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${on ? mod.color : '#e2e8f0'}`, background: on ? mod.color + '15' : '#f8fafc', color: on ? mod.color : '#64748b', fontSize: 12, fontWeight: on ? 600 : 400, cursor: 'pointer', userSelect: 'none' }}>
//                                             <span style={{ width: 6, height: 6, borderRadius: '50%', background: on ? mod.color : '#cbd5e1', flexShrink: 0, display: 'inline-block' }} />
//                                             {perm.label}
//                                           </button>
//                                         );
//                                       })}
//                                     </div>
//                                   </div>
//                                 ))
//                               ) : (
//                                 <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, paddingTop: 2 }}>
//                                   {visiblePerms.map(perm => {
//                                     const on = modPerms.includes(perm.key);
//                                     return (
//                                       <button key={perm.key} onClick={() => togglePerm(activeCompanyId, mod.key, perm.key)}
//                                         style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, border: `1.5px solid ${on ? mod.color : '#e2e8f0'}`, background: on ? mod.color + '15' : '#f8fafc', color: on ? mod.color : '#64748b', fontSize: 12, fontWeight: on ? 600 : 400, cursor: 'pointer', userSelect: 'none' }}>
//                                         <span style={{ width: 6, height: 6, borderRadius: '50%', background: on ? mod.color : '#cbd5e1', flexShrink: 0, display: 'inline-block' }} />
//                                         {perm.label}
//                                       </button>
//                                     );
//                                   })}
//                                 </div>
//                               )}
//                             </div>
//                           </div>
//                         );
//                       })}
//                     </div>
//                   );
//                 })()}

//                 <div style={{ display: 'flex', gap: 10 }}>
//                   <button
//                     onClick={handleSubmit}
//                     disabled={saving}
//                     style={{ flex: 1, padding: '12px 0', borderRadius: 9, border: 'none', background: saving ? '#93c5fd' : 'linear-gradient(135deg,#2563eb,#3b82f6)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer' }}
//                   >
//                     {saving ? 'Creating…' : 'Create User'}
//                   </button>
//                   <button onClick={() => { setError(''); setStep(singleCompany ? 1 : 2); }} style={{ padding: '12px 20px', borderRadius: 9, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Back</button>
//                 </div>
//               </div>
//             )}
//           </div>
//         </div>
//       </div>
//       <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
//     </DashboardLayout>
//   );
// }



'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { userService } from '@/lib/services/userService';
import { getAvailableModules } from '@/lib/moduleCatalog';
import { SIMPLE_PROJECT_PERMISSIONS } from '@/lib/simplifiedProjectPermissions';
import { USER_ROLE_TYPE_OPTIONS, getRoleDefaultPermissions } from '@/lib/roleUtils';
import { CompanyOption } from '@/types';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { HiArrowLeft, HiArrowRight, HiCheckCircle, HiClipboard, HiUserGroup, HiCheck } from 'react-icons/hi2';

// availMods (from getAvailableModules) -> { moduleKey: visible permission keys[] },
// respecting the same requiresDb/hideIfCatalogKey filtering the checkbox UI uses —
// role defaults must never auto-check a permission the UI wouldn't otherwise show.
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
interface CreatedInfo { email: string; password: string; loginUrl: string; isLinked?: boolean }
export default function NewUserPage() {
  useAdminGuard();
  const router = useRouter();

  // Steps 1-3
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('');

  // Step 2
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loadingCos, setLoadingCos] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Step 3: permissions[companyId][moduleKey] = permissionKey[]
  const [perms, setPerms] = useState<Record<number, Record<string, string[]>>>({});
  const [activeCompanyId, setActiveCompanyId] = useState<number | null>(null);
  const [showAdvancedPM, setShowAdvancedPM] = useState(false);

  // Existing-user check (Rules 1-4)
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [existingUser, setExistingUser] = useState<{ name: string; status: string; isAdmin?: boolean } | null>(null);

  // Submit
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<CreatedInfo | null>(null);
  const [copied, setCopied] = useState<'all' | 'url' | 'email' | 'pass' | null>(null);

  // Load companies on mount so we know whether to skip step 2
  useEffect(() => {
    setLoadingCos(true);
    userService.listCompanyOptions()
      .then(data => {
        setCompanies(data);
        // Pre-select when only one company exists
        if (data.length === 1) setSelectedIds([data[0].id]);
      })
      .finally(() => setLoadingCos(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Set first company tab when entering step 3
  useEffect(() => {
    if (step === 3 && selectedIds.length > 0 && !activeCompanyId) {
      setActiveCompanyId(selectedIds[0]);
    }
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // true when step 2 can be skipped (single company, already selected)
  const singleCompany = companies.length === 1;

  const selectCompany = (id: number) => setSelectedIds([id]);

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
      const allSelected = allKeys.every(k => cur.includes(k));
      return { ...prev, [companyId]: { ...(prev[companyId] ?? {}), [moduleKey]: allSelected ? [] : [...allKeys] } };
    });
  };

  const handleSubmit = async () => {
    setSaving(true); setError('');
    try {
      const assignments = selectedIds.map(cid => ({
        company_id: cid,
        permissions: perms[cid] ?? {},
      }));

      await userService.create({
        name: name.trim(), email: email.trim(),
        role_type: role || undefined,
        ...(existingUser ? {} : { password }),
        company_assignments: assignments,
      });

      setCreated({
        email,
        password: existingUser ? '' : password,
        loginUrl: window.location.origin + '/login',
        isLinked: !!existingUser,
      });
    } catch (err: unknown) {
      const ex = err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } };
      const msgs = ex.response?.data?.errors;
      if (msgs) setError(Object.values(msgs).flat().join(' · '));
      else setError(ex.response?.data?.message ?? 'Failed to create user');
    } finally { setSaving(false); }
  };

  const copy = (text: string, field: 'all' | 'url' | 'email' | 'pass') => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(field);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  // ── Success screen ──────────────────────────────────────────────────────────
  if (created) {
    const credRows = created.isLinked
      ? [
        { field: 'url' as const, label: 'Login URL', value: created.loginUrl },
        { field: 'email' as const, label: 'Email', value: created.email },
      ]
      : [
        { field: 'url' as const, label: 'Login URL', value: created.loginUrl },
        { field: 'email' as const, label: 'Email', value: created.email },
        { field: 'pass' as const, label: 'Password', value: created.password },
      ];
    const allText = created.isLinked
      ? `Login URL: ${created.loginUrl}\nEmail: ${created.email}`
      : `Login URL: ${created.loginUrl}\nEmail: ${created.email}\nPassword: ${created.password}`;

    return (
      <DashboardLayout title={created.isLinked ? 'User Linked' : 'User Created'}>
        <div style={{ maxWidth: 480 }}>
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
            <div style={{ padding: '22px 28px', borderBottom: '1px solid #f1f5f9', background: created.isLinked ? '#eff6ff' : '#f0fdf4', display: 'flex', alignItems: 'center', gap: 12 }}>
              <HiCheckCircle size={26} color={created.isLinked ? '#2563eb' : '#059669'} />
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
                  {created.isLinked ? 'User Linked to Company' : 'User Created'}
                </div>
                <div style={{ fontSize: 13, color: '#64748b' }}>
                  {created.isLinked
                    ? <><strong>{name}</strong> has been linked — they can now log in with their existing password</>
                    : <>Share these credentials with <strong>{name}</strong></>}
                </div>
              </div>
            </div>
            <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {credRows.map(({ field, label, value }) => (
                <div key={field}>
                  <div style={{ ...lbl, marginBottom: 8 }}>{label}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1, background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '10px 13px', fontSize: 13, color: '#0f172a', wordBreak: 'break-all' }}>{value}</div>
                    <button onClick={() => copy(value, field)} style={{ padding: '10px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0', background: copied === field ? '#ecfdf5' : '#fff', color: copied === field ? '#059669' : '#64748b', cursor: 'pointer' }}>
                      {copied === field ? <HiCheck size={16} /> : <HiClipboard size={16} />}
                    </button>
                  </div>
                </div>
              ))}
              <button onClick={() => copy(allText, 'all')} style={{ width: '100%', padding: '12px 0', borderRadius: 9, border: 'none', background: copied === 'all' ? '#059669' : 'linear-gradient(135deg,#2563eb,#3b82f6)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 }}>
                <HiClipboard size={17} /> {copied === 'all' ? 'Copied!' : 'Copy Details'}
              </button>
              <button onClick={() => router.push('/admin/users')} style={{ width: '100%', padding: '11px 0', borderRadius: 9, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                <HiUserGroup size={16} /> View All Users
              </button>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const stepLabels = ['User Info', 'Assign Companies', 'Set Permissions'];

  return (
    <DashboardLayout title="Add User">
      <div style={{ width: "100%" }}>
        <button
          onClick={() => {
            if (step > 1) { setError(''); setStep((step === 3 && singleCompany ? 1 : step - 1) as 1 | 2 | 3); }
            else { router.push('/admin/users'); }
          }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 24, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: 14 }}>
          <HiArrowLeft size={16} /> {step > 1 ? 'Back' : 'Back to Users'}
        </button>

        <div style={{ display: 'flex', gap: 0, marginBottom: 28 }}>
          {stepLabels.map((label, i) => {
            const n = i + 1;
            const done = n < step;
            const active = n === step;
            return (
              <div key={n} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: done ? '#059669' : active ? '#2563eb' : '#e2e8f0', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                    {done ? <HiCheck size={14} /> : n}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? '#0f172a' : done ? '#059669' : '#94a3b8', whiteSpace: 'nowrap' }}>{label}</span>
                </div>
                {i < stepLabels.length - 1 && <div style={{ height: 2, flex: 1, background: done ? '#059669' : '#e2e8f0', margin: '0 8px' }} />}
              </div>
            );
          })}
        </div>

        <div style={{ width: '100%', background: '#fff', borderRadius: 14, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
          <div style={{ padding: '18px 28px', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
              {step === 1 && 'User Information'}
              {step === 2 && 'Assign to Companies'}
              {step === 3 && 'Set Module Permissions'}
            </h2>
          </div>

          <div style={{ padding: 28 }}>
            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13, marginBottom: 20 }}>
                {error}
              </div>
            )}

            {/* ── Step 1: User info ── */}
            {step === 1 && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div>
                    <label style={lbl}>Full Name *</label>
                    <input style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="Ahmed Khan" />
                  </div>
                  <div>
                    <label style={lbl}>Email Address *</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="email"
                        style={{ ...inp, paddingRight: checkingEmail ? 36 : undefined }}
                        value={email}
                        onChange={e => { setEmail(e.target.value); setExistingUser(null); }}
                        onBlur={async e => {
                          const val = e.target.value.trim();
                          if (val !== e.target.value) setEmail(val);
                          if (!val || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) return;
                          setCheckingEmail(true);
                          try {
                            const res = await userService.checkEmail(val);
                            setExistingUser(res.exists ? { name: res.name ?? '', status: res.status ?? 'active', isAdmin: !!res.is_admin } : null);
                          } catch { /* ignore */ }
                          finally { setCheckingEmail(false); }
                        }}
                        placeholder="ahmed@company.com"
                      />
                      {checkingEmail && (
                        <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, border: '2px solid #bfdbfe', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                      )}
                    </div>
                    {existingUser && (
                      <div style={{ fontSize: 12, color: '#2563eb', marginTop: 4 }}>
                        {existingUser.isAdmin ? 'This email is already registered as a Company Admin account.' : 'This email already exists.'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Password — hidden when linking an existing user */}
                {!existingUser && (
                  <div style={{ marginBottom: 20 }}>
                    <label style={lbl}>Password *</label>
                    <input type="password" style={inp} value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 8 characters" minLength={8} />
                  </div>
                )}
                {existingUser && <div style={{ marginBottom: 12 }} />}

                {/* Select Role — default permissions for this role are auto-checked in the next step */}
                <div style={{ marginBottom: 28 }}>
                  <label style={lbl}>Role *</label>
                  <select style={inp} value={role} onChange={e => setRole(e.target.value)}>
                    <option value="">Select a role…</option>
                    {USER_ROLE_TYPE_OPTIONS.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>

                <button
                  disabled={!!existingUser}
                  onClick={() => {
                    if (existingUser) { setError('This email already has an account. Use a different email.'); return; }
                    if (!name || !email) { setError('Please fill in name and email.'); return; }
                    if (!password || password.length < 8) {
                      setError('Password is required (min 8 characters).');
                      return;
                    }
                    if (!role) { setError('Please select a role.'); return; }
                    setError('');
                    if (singleCompany) {
                      // Auto-assign the only company and pre-fill this role's default permissions
                      const cid = companies[0].id;
                      const rawDb = companies[0].modules ?? [];
                      const mods = getAvailableModules(rawDb);
                      const allPerms = visiblePermsByModule(mods, rawDb);
                      const auto = getRoleDefaultPermissions(role, mods.map(m => m.key), allPerms);
                      setPerms({ [cid]: auto });
                      setActiveCompanyId(cid);
                      setStep(3);
                    } else {
                      setStep(2);
                    }
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '12px 28px', borderRadius: 9, border: 'none',
                    background: existingUser ? '#cbd5e1' : 'linear-gradient(135deg,#2563eb,#3b82f6)',
                    color: '#fff', fontWeight: 700, fontSize: 14,
                    cursor: existingUser ? 'not-allowed' : 'pointer',
                  }}
                >
                  Next <HiArrowRight size={16} />
                </button>
              </div>
            )}

            {step === 2 && (
              <div>
                {loadingCos ? (
                  <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Loading companies…</div>
                ) : companies.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>No active companies found.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
                    {companies.map(c => {
                      const sel = selectedIds.includes(c.id);
                      return (
                        <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 10, border: `1.5px solid ${sel ? '#bfdbfe' : '#e2e8f0'}`, background: sel ? '#eff6ff' : '#fafafa', cursor: 'pointer' }}>
                          <input type="radio" name="company" checked={sel} onChange={() => selectCompany(c.id)} style={{ accentColor: '#2563eb', width: 16, height: 16, flexShrink: 0 }} />
                          <span style={{ fontWeight: sel ? 700 : 500, color: sel ? '#1d4ed8' : '#0f172a', fontSize: 14 }}>{c.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => {
                      if (selectedIds.length === 0) { setError('Select at least one company.'); return; }
                      setError('');

                      // Pre-select this role's default permissions for companies that have none yet
                      const nextPerms = { ...perms };
                      for (const cid of selectedIds) {
                        const existing = nextPerms[cid];
                        if (existing && Object.values(existing).some(arr => arr.length > 0)) continue;
                        const co = companies.find(c => c.id === cid);
                        const rawDb = co?.modules ?? [];
                        const mods = getAvailableModules(rawDb);
                        const allPerms = visiblePermsByModule(mods, rawDb);
                        nextPerms[cid] = getRoleDefaultPermissions(role, mods.map(m => m.key), allPerms);
                      }
                      setPerms(nextPerms);

                      setActiveCompanyId(selectedIds[0]);
                      setStep(3);
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 28px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#2563eb,#3b82f6)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
                  >
                    Next <HiArrowRight size={16} />
                  </button>
                  <button onClick={() => { setError(''); setStep(1); }} style={{ padding: '12px 20px', borderRadius: 9, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Back</button>
                </div>
              </div>
            )}

            {/* ── Step 3: Permissions (checkbox grid style, matching Edit User reference) ── */}
            {step === 3 && (
              <div>
                {/* Company tabs (multi-company only) */}
                {selectedIds.length > 1 && (
                  <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
                    {selectedIds.map(cid => {
                      const co = companies.find(c => c.id === cid);
                      const active = cid === activeCompanyId;
                      return (
                        <button key={cid} onClick={() => setActiveCompanyId(cid)} style={{ padding: '7px 16px', borderRadius: 20, border: `1.5px solid ${active ? '#2563eb' : '#e2e8f0'}`, background: active ? '#2563eb' : '#fff', color: active ? '#fff' : '#64748b', fontWeight: active ? 700 : 500, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s' }}>
                          {co?.name ?? cid}
                        </button>
                      );
                    })}
                  </div>
                )}

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

                {/* Add Users — one common toggle per company, not per module */}
                {activeCompanyId !== null && (() => {
                  const canThisUserAddUsers = (perms[activeCompanyId]?.['account'] ?? []).includes('canAddUsers');
                  return (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderRadius: 12, border: `1.5px solid ${canThisUserAddUsers ? '#2563eb40' : '#e2e8f0'}`, background: canThisUserAddUsers ? '#eff6ff' : '#fafafa', marginBottom: 16, cursor: 'pointer' }}>
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

                {/* General Chat — same "account module" pattern as Add Users above. */}
                {activeCompanyId !== null && (() => {
                  const canThisUserUseChat = (perms[activeCompanyId]?.['account'] ?? []).includes('canUseGeneralChat');
                  return (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderRadius: 12, border: `1.5px solid ${canThisUserUseChat ? '#2563eb40' : '#e2e8f0'}`, background: canThisUserUseChat ? '#eff6ff' : '#fafafa', marginBottom: 16, cursor: 'pointer' }}>
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

                {/* Modules for active company */}
                {activeCompanyId !== null && (() => {
                  const co = companies.find(c => c.id === activeCompanyId);
                  const rawDb = co?.modules ?? [];          // raw DB module keys
                  const availMods = getAvailableModules(rawDb);
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24, height: "auto", overflowY: 'auto', paddingRight: 4 }}>
                      {availMods.length === 0 && (
                        <div style={{ color: '#94a3b8', fontSize: 13, padding: 20, background: '#f8fafc', borderRadius: 10, textAlign: 'center' }}>
                          No modules purchased for this company.
                        </div>
                      )}
                      {availMods.map(mod => {
                        // Project Management: 52 granular permissions are too many to show
                        // Company Admin directly — show the 11 simplified permissions instead,
                        // each expanding into its real granular keys under the hood, plus a
                        // collapsed "Advanced Permissions" section for the 5 more sensitive ones.
                        if (mod.key === 'project_management') {
                          const granted = perms[activeCompanyId]?.project_management ?? [];
                          const mainPerms = SIMPLE_PROJECT_PERMISSIONS.filter(p => !p.advanced);
                          const advPerms = SIMPLE_PROJECT_PERMISSIONS.filter(p => p.advanced);
                          const isChecked = (p: typeof mainPerms[number]) => p.maps.every(k => granted.includes(k));
                          const allMainSelected = mainPerms.every(isChecked);

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
                            <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', userSelect: 'none' }}>
                              <input
                                type="checkbox"
                                checked={isChecked(p)}
                                onChange={() => toggleSimple(p)}
                                style={{ width: 15, height: 15, flexShrink: 0, accentColor: mod.color, cursor: 'pointer' }}
                              />
                              <span style={{ fontSize: 13.5, color: '#2563eb' }}>{p.label}</span>
                            </label>
                          );

                          return (
                            <div key={mod.key} style={{ borderRadius: 12, border: '1.5px solid #f1f5f9', overflow: 'hidden', background: '#fff' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                                <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 14.5 }}>{mod.name}</span>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: '#475569', cursor: 'pointer', userSelect: 'none' }}>
                                  <input
                                    type="checkbox"
                                    checked={allMainSelected}
                                    onChange={toggleAllMain}
                                    style={{ width: 15, height: 15, accentColor: '#2563eb', cursor: 'pointer' }}
                                  />
                                  Select All
                                </label>
                              </div>
                              <div style={{ padding: '16px 18px 18px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', rowGap: 14, columnGap: 12 }}>
                                  {mainPerms.map(renderSimpleRow)}
                                </div>

                                <button
                                  type="button"
                                  onClick={() => setShowAdvancedPM(v => !v)}
                                  style={{ marginTop: 18, background: 'none', border: 'none', padding: 0, fontSize: 12.5, fontWeight: 600, color: '#7c3aed', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                                >
                                  {showAdvancedPM ? '▾' : '▸'} Advanced Permissions
                                </button>

                                {showAdvancedPM && (
                                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed #e2e8f0' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', rowGap: 14, columnGap: 12 }}>
                                      {advPerms.map(renderSimpleRow)}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        }

                        // Filter by requiresDb AND hide perms whose catalog module is also available
                        const availCatalogKeys = availMods.map(m => m.key);
                        const visiblePerms = mod.permissions.filter(
                          p => (!p.requiresDb || rawDb.includes(p.requiresDb))
                            && (!p.hideIfCatalogKey || !availCatalogKeys.includes(p.hideIfCatalogKey))
                        );

                        // Group visible permissions by their group label
                        const groups = visiblePerms.reduce<Record<string, typeof visiblePerms>>(
                          (acc, p) => {
                            const g = p.group ?? '';
                            if (!acc[g]) acc[g] = [];
                            acc[g].push(p);
                            return acc;
                          }, {}
                        );
                        const groupEntries = Object.entries(groups);
                        const hasGroups = groupEntries.length > 1 || (groupEntries.length === 1 && groupEntries[0][0] !== '');

                        const modPerms = perms[activeCompanyId]?.[mod.key] ?? [];
                        const visKeys = visiblePerms.map(p => p.key);
                        const selCount = visKeys.filter(k => modPerms.includes(k)).length;
                        const allSel = visKeys.length > 0 && selCount === visKeys.length;

                        // Checkbox row used for every permission item (shared across grouped/ungrouped rendering)
                        const renderCheckboxRow = (perm: typeof visiblePerms[number]) => {
                          const on = modPerms.includes(perm.key);
                          return (
                            <label
                              key={perm.key}
                              style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', userSelect: 'none' }}
                            >
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() => togglePerm(activeCompanyId, mod.key, perm.key)}
                                style={{ width: 15, height: 15, flexShrink: 0, accentColor: mod.color, cursor: 'pointer' }}
                              />
                              <span style={{ fontSize: 13.5, color: '#2563eb' }}>{perm.label}</span>
                            </label>
                          );
                        };

                        return (
                          <div key={mod.key} style={{ borderRadius: 12, border: '1.5px solid #f1f5f9', overflow: 'hidden', background: '#fff' }}>
                            {/* Module header */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: '#fafafa', borderBottom: '1px solid #f1f5f9' }}>
                              <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 14.5 }}>{mod.name}</span>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: '#475569', cursor: 'pointer', userSelect: 'none' }}>
                                <input
                                  type="checkbox"
                                  checked={allSel}
                                  onChange={() => toggleModuleAll(activeCompanyId, mod.key, visKeys)}
                                  style={{ width: 15, height: 15, accentColor: '#2563eb', cursor: 'pointer' }}
                                />
                                Select All
                              </label>
                            </div>

                            {/* Permission body: 3-column checkbox grid, grouped or flat */}
                            <div style={{ padding: '16px 18px 18px' }}>
                              {hasGroups ? (
                                groupEntries.map(([groupName, groupPerms]) => (
                                  <div key={groupName} style={{ marginBottom: 16 }}>
                                    {groupName && (
                                      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                                        {groupName}
                                      </div>
                                    )}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', rowGap: 14, columnGap: 12 }}>
                                      {groupPerms.map(renderCheckboxRow)}
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', rowGap: 14, columnGap: 12 }}>
                                  {visiblePerms.map(renderCheckboxRow)}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={handleSubmit}
                    disabled={saving}
                    style={{ flex: 1, padding: '12px 0', borderRadius: 9, border: 'none', background: saving ? '#93c5fd' : 'linear-gradient(135deg,#2563eb,#3b82f6)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer' }}
                  >
                    {saving ? 'Creating…' : 'Create User'}
                  </button>
                  <button onClick={() => { setError(''); setStep(singleCompany ? 1 : 2); }} style={{ padding: '12px 20px', borderRadius: 9, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Back</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </DashboardLayout>
  );
}