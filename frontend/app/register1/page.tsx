// 'use client';
// import { Suspense, useEffect, useMemo, useState, useCallback } from 'react';
// import { useRouter, useSearchParams } from 'next/navigation';
// import Link from 'next/link';
// import LandingNavbar from '@/components/landing/Navbar';
// import LandingFooter from '@/components/landing/Footer';
// import { publicService } from '@/lib/services/publicService';
// import { setAuthData } from '@/lib/auth';
// import { PublicPackage } from '@/types';
// import toast from 'react-hot-toast';
// import { MODULE_CATALOG, validateModules, getSelectedInternalKeys } from '@/lib/moduleConfig';

// // ─── Seat & Company add-on options ───────────────────────────────────────────
// const SEAT_OPTIONS = [
//   { label: '10 Users', value: 10, price_pkr: 0, price_usd: 0 },
//   { label: '25 Users', value: 25, price_pkr: 800, price_usd: 3 },
//   { label: '50 Users', value: 50, price_pkr: 1500, price_usd: 6 },
//   { label: '100 Users', value: 100, price_pkr: 3000, price_usd: 12 },
//   { label: 'Unlimited', value: null, price_pkr: 6000, price_usd: 25 },
// ];

// const COMPANY_OPTIONS = [
//   { label: '1 Company', value: 1, price_pkr: 0, price_usd: 0 },
//   { label: '3 Companies', value: 3, price_pkr: 500, price_usd: 2 },
//   { label: '5 Companies', value: 5, price_pkr: 1000, price_usd: 4 },
//   { label: 'Unlimited', value: null, price_pkr: 2500, price_usd: 10 },
// ];

// const TIMEZONES = [
//   'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dubai',
//   'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Singapore',
// ];

// function pwStrength(p: string): { label: string; color: string; pct: number } {
//   if (!p) return { label: '', color: '#e2e8f0', pct: 0 };
//   let s = 0;
//   if (p.length >= 8) s++;
//   if (/[A-Z]/.test(p)) s++;
//   if (/[0-9]/.test(p)) s++;
//   if (/[^a-zA-Z0-9]/.test(p)) s++;
//   if (s <= 1) return { label: 'Weak', color: '#ef4444', pct: 25 };
//   if (s === 2) return { label: 'Fair', color: '#f59e0b', pct: 50 };
//   if (s === 3) return { label: 'Good', color: '#3b82f6', pct: 75 };
//   return { label: 'Strong', color: '#22c55e', pct: 100 };
// }

// function RegisterContent() {
//   const router = useRouter();
//   const searchParams = useSearchParams();
//   const preSelectedPkg = searchParams.get('package');

//   const [step, setStep] = useState(1);
//   const [mode, setMode] = useState<'package' | 'custom'>('package');
//   const [currency, setCurrency] = useState<'PKR' | 'USD'>('PKR');
//   const [submitting, setSubmitting] = useState(false);

//   // Package mode
//   const [packages, setPackages] = useState<PublicPackage[]>([]);
//   const [loadingPackages, setLoadingPackages] = useState(true);
//   const [selectedPackage, setSelectedPackage] = useState<PublicPackage | null>(null);

//   // Custom mode
//   const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

//   // Seats & companies
//   const [seatIdx, setSeatIdx] = useState(0);
//   const [companyIdx, setCompanyIdx] = useState(0);
//   const seat = SEAT_OPTIONS[seatIdx];
//   const company = COMPANY_OPTIONS[companyIdx];

//   // Derived
//   const selectedCats = MODULE_CATALOG.filter(c => selectedCategories.includes(c.key));
//   const customModules = getSelectedInternalKeys(selectedCategories);
//   const customBasePkr = selectedCats.reduce((s, c) => s + c.price_pkr, 0);
//   const customBaseUsd = selectedCats.reduce((s, c) => s + c.price_usd, 0);
//   const validation = useMemo(() => validateModules(selectedCategories), [selectedCategories]);
//   const addonPkr = seat.price_pkr + company.price_pkr;
//   const addonUsd = seat.price_usd + company.price_usd;
//   const totalPkr = mode === 'package'
//     ? Number(selectedPackage?.price_pkr ?? 0) + addonPkr
//     : customBasePkr + addonPkr;
//   const totalUsd = mode === 'package'
//     ? Number(selectedPackage?.price_usd ?? 0) + addonUsd
//     : customBaseUsd + addonUsd;

//   const autoPackage = (): PublicPackage | null => {
//     if (!packages.length || !customModules.length) return null;
//     const sorted = [...packages].sort((a, b) => Number(a.price_pkr) - Number(b.price_pkr));
//     for (const pkg of sorted) {
//       if (customModules.every(m => (pkg.modules ?? []).includes(m))) return pkg;
//     }
//     return packages[packages.length - 1] ?? null;
//   };

//   // Step 1 fields
//   const [companyName, setCompanyName] = useState('');
//   const [name, setName] = useState('');
//   const [email, setEmail] = useState('');
//   const [emailOk, setEmailOk] = useState<boolean | null>(null);
//   const [emailChecking, setEmailChecking] = useState(false);
//   const [password, setPassword] = useState('');
//   const [confirm, setConfirm] = useState('');
//   const [phone, setPhone] = useState('');
//   const [timezone, setTimezone] = useState('Asia/Karachi');

//   useEffect(() => {
//     setLoadingPackages(true);
//     publicService.getPackages()
//       .then(pkgs => {
//         setPackages(pkgs);
//         if (preSelectedPkg) {
//           const found = pkgs.find(p => p.id === Number(preSelectedPkg));
//           if (found) { setSelectedPackage(found); return; }
//         }
//         setSelectedPackage(pkgs.find(p => p.is_popular) ?? pkgs[0] ?? null);
//       })
//       .catch(() => { })
//       .finally(() => setLoadingPackages(false));
//   }, [preSelectedPkg]);

//   const checkEmail = useCallback(async (val: string) => {
//     if (!val || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { setEmailOk(null); return; }
//     setEmailChecking(true);
//     try { setEmailOk(await publicService.checkEmail(val)); }
//     catch { setEmailOk(null); }
//     finally { setEmailChecking(false); }
//   }, []);

//   useEffect(() => {
//     const t = setTimeout(() => checkEmail(email), 700);
//     return () => clearTimeout(t);
//   }, [email, checkEmail]);

//   const toggleCategory = (key: string) =>
//     setSelectedCategories(prev =>
//       prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
//     );

//   const step1Valid = !!(companyName && name && email && emailOk && password.length >= 8 && password === confirm);

//   const handleSubmit = async () => {
//     const pkgToUse = mode === 'package' ? selectedPackage : autoPackage();
//     const modulesToUse = mode === 'package' ? (selectedPackage?.modules ?? []) : customModules;
//     if (mode === 'package' && !selectedPackage) { toast.error('Please select a package'); return; }
//     if (mode === 'custom' && selectedCategories.length === 0) { toast.error('Please select at least one module'); return; }
//     if (!pkgToUse) { toast.error('No matching package found'); return; }

//     setSubmitting(true);
//     try {
//       const res = await publicService.register({
//         company_name: companyName,
//         name, email, password,
//         password_confirmation: confirm,
//         phone: phone || undefined,
//         package_id: pkgToUse.id,
//         selected_modules: modulesToUse,
//         currency,
//         start_type: 'paid',
//         timezone,
//         max_users: seat.value,
//         max_companies: company.value,
//       });
//       if (res.success) {
//         setAuthData(res.data.token, res.data.admin, 'admin');
//         // Save order summary for payment page
//         localStorage.setItem('pending_order', JSON.stringify({
//           package_name: pkgToUse.name,
//           modules: mode === 'custom' ? selectedCats.map(c => c.label) : [],
//           mode,
//           seats: seat.label,
//           companies: company.label,
//           total_pkr: totalPkr,
//           total_usd: totalUsd,
//           currency,
//           trial_days: pkgToUse.trial_days,
//         }));
//         router.push('/payment');
//       }
//     } catch (err: unknown) {
//       const e = err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } };
//       const errs = e.response?.data?.errors;
//       if (errs) Object.values(errs).flat().forEach(m => toast.error(m));
//       else toast.error(e.response?.data?.message ?? 'Registration failed');
//     } finally {
//       setSubmitting(false);
//     }
//   };

//   const strength = pwStrength(password);
//   const canSubmit = !submitting && (
//     mode === 'package'
//       ? !!selectedPackage
//       : selectedCategories.length > 0 && validation.isValid
//   );

//   const fmt = (pkr: number, usd: number) =>
//     currency === 'PKR' ? `PKR ${pkr.toLocaleString()}` : `$${usd}`;

//   const inputStyle: React.CSSProperties = {
//     width: '100%', padding: '11px 14px', border: '1.5px solid #e2e8f0',
//     borderRadius: 10, fontSize: 14, outline: 'none', background: '#f8fafc', boxSizing: 'border-box',
//   };
//   const labelStyle: React.CSSProperties = {
//     display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6,
//   };

//   // Pill option selector helper
//   const PillRow = ({
//     options, selectedIdx, onSelect, label,
//   }: {
//     options: { label: string; price_pkr: number; price_usd: number }[];
//     selectedIdx: number;
//     onSelect: (i: number) => void;
//     label: string;
//   }) => (
//     <div style={{ marginBottom: 16 }}>
//       <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
//       <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
//         {options.map((opt, i) => {
//           const active = selectedIdx === i;
//           return (
//             <button
//               key={i}
//               onClick={() => onSelect(i)}
//               style={{
//                 padding: '7px 14px', borderRadius: 50, border: `1.5px solid ${active ? '#2563eb' : '#e2e8f0'}`,
//                 background: active ? '#2563eb' : '#fff', color: active ? '#fff' : '#374151',
//                 fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer',
//                 transition: 'all 0.15s',
//               }}>
//               {opt.label}
//               {opt.price_pkr > 0 && (
//                 <span style={{ marginLeft: 5, fontSize: 11, opacity: 0.85 }}>
//                   +{currency === 'PKR' ? `PKR ${opt.price_pkr.toLocaleString()}` : `$${opt.price_usd}`}
//                 </span>
//               )}
//             </button>
//           );
//         })}
//       </div>
//     </div>
//   );

//   return (
//     <>
//       <LandingNavbar />
//       <div style={{ paddingTop: 88, background: '#f8fafc', minHeight: '100vh' }}>
//         <div style={{ maxWidth: step === 2 ? 1080 : 960, margin: '0 auto', padding: '32px 24px 64px' }}>

//           {/* Progress */}
//           <div style={{ marginBottom: 36 }}>
//             <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
//               {[1, 2].map(s => (
//                 <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
//                   <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
//                     <div style={{
//                       width: 38, height: 38, borderRadius: '50%',
//                       background: step >= s ? 'linear-gradient(135deg,#2563eb,#3b82f6)' : '#fff',
//                       border: step >= s ? 'none' : '2px solid #e2e8f0',
//                       color: step >= s ? '#fff' : '#94a3b8',
//                       display: 'flex', alignItems: 'center', justifyContent: 'center',
//                       fontWeight: 700, fontSize: 15,
//                       boxShadow: step === s ? '0 4px 12px rgba(37,99,235,0.3)' : 'none',
//                     }}>{step > s ? '✓' : s}</div>
//                     <span style={{ fontSize: 12, fontWeight: step >= s ? 700 : 400, color: step >= s ? '#2563eb' : '#94a3b8', whiteSpace: 'nowrap' }}>
//                       {s === 1 ? 'Company Info' : 'Select Plan'}
//                     </span>
//                   </div>
//                   {s < 2 && <div style={{ width: 100, height: 2, background: step > s ? '#2563eb' : '#e2e8f0', margin: '0 8px', marginBottom: 24 }} />}
//                 </div>
//               ))}
//             </div>
//           </div>

//           {/* ── STEP 1 ── */}
//           {step === 1 && (
//             <div style={{ background: '#fff', borderRadius: 18, border: '1.5px solid #e2e8f0', padding: 36, maxWidth: 600, margin: '0 auto' }}>
//               <h2 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>Company Information</h2>
//               <p style={{ color: '#64748b', fontSize: 14, marginBottom: 28 }}>Tell us about your business</p>

//               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
//                 <div>
//                   <label style={labelStyle}>Company Name *</label>
//                   <input style={inputStyle} value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Grands Digital" />
//                 </div>
//                 <div>
//                   <label style={labelStyle}>Your Full Name *</label>
//                   <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Ahmed Khan" />
//                 </div>
//               </div>

//               <div style={{ marginBottom: 16 }}>
//                 <label style={labelStyle}>Email Address *</label>
//                 <div style={{ position: 'relative' }}>
//                   <input
//                     style={{ ...inputStyle, paddingRight: 40, borderColor: emailOk === false ? '#ef4444' : emailOk === true ? '#22c55e' : '#e2e8f0' }}
//                     type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com"
//                   />
//                   <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16 }}>
//                     {emailChecking ? '⏳' : emailOk === true ? '✅' : emailOk === false ? '❌' : ''}
//                   </span>
//                 </div>
//                 {emailOk === false && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>This email is already registered</div>}
//                 {emailOk === true && <div style={{ fontSize: 12, color: '#22c55e', marginTop: 4 }}>Email is available</div>}
//               </div>

//               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
//                 <div>
//                   <label style={labelStyle}>Password *</label>
//                   <input style={inputStyle} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 8 characters" />
//                   {password && (
//                     <div style={{ marginTop: 6 }}>
//                       <div style={{ height: 4, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
//                         <div style={{ width: `${strength.pct}%`, height: '100%', background: strength.color, borderRadius: 4, transition: 'all 0.3s' }} />
//                       </div>
//                       <span style={{ fontSize: 11, color: strength.color, fontWeight: 600 }}>{strength.label}</span>
//                     </div>
//                   )}
//                 </div>
//                 <div>
//                   <label style={labelStyle}>Confirm Password *</label>
//                   <input
//                     style={{ ...inputStyle, borderColor: confirm && password !== confirm ? '#ef4444' : '#e2e8f0' }}
//                     type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat password"
//                   />
//                   {confirm && password !== confirm && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>Passwords do not match</div>}
//                 </div>
//               </div>

//               <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28 }}>
//                 <div>
//                   <label style={labelStyle}>Phone (Optional)</label>
//                   <input style={inputStyle} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 (555) 000-0000" />
//                 </div>
//                 <div>
//                   <label style={labelStyle}>Timezone</label>
//                   <select style={inputStyle} value={timezone} onChange={e => setTimezone(e.target.value)}>
//                     {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
//                   </select>
//                 </div>
//               </div>

//               <button
//                 onClick={() => step1Valid && setStep(2)}
//                 disabled={!step1Valid}
//                 style={{
//                   width: '100%', padding: '13px',
//                   background: step1Valid ? 'linear-gradient(135deg,#2563eb,#3b82f6)' : '#e2e8f0',
//                   border: 'none', borderRadius: 10,
//                   color: step1Valid ? '#fff' : '#94a3b8',
//                   fontSize: 15, fontWeight: 700, cursor: step1Valid ? 'pointer' : 'not-allowed',
//                 }}>
//                 Next: Select Plan →
//               </button>
//               <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13, color: '#94a3b8' }}>
//                 Already have an account?{' '}
//                 <Link href="/admin/login" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>Sign in</Link>
//               </div>
//             </div>
//           )}

//           {/* ── STEP 2 ── */}
//           {step === 2 && (
//             <div>
//               {/* Header */}
//               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
//                 <div>
//                   <h2 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>Choose Your Plan</h2>
//                   <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>Select a ready-made package or build your own</p>
//                 </div>
//                 <div style={{ display: 'inline-flex', background: '#e2e8f0', borderRadius: 50, padding: 3 }}>
//                   {(['PKR', 'USD'] as const).map(c => (
//                     <button key={c} onClick={() => setCurrency(c)} style={{
//                       padding: '6px 18px', borderRadius: 50, border: 'none', cursor: 'pointer',
//                       background: currency === c ? '#fff' : 'transparent',
//                       color: currency === c ? '#2563eb' : '#64748b',
//                       fontWeight: currency === c ? 700 : 400, fontSize: 13, transition: 'all 0.15s',
//                     }}>{c}</button>
//                   ))}
//                 </div>
//               </div>

//               {/* Mode toggle */}
//               <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
//                 {[
//                   { val: 'package' as const, icon: '📦', label: 'Choose a Package', sub: 'Pre-built plans with fixed pricing' },
//                   { val: 'custom' as const, icon: '🎛️', label: 'Custom Modules', sub: 'Pick only what you need' },
//                 ].map(opt => {
//                   const active = mode === opt.val;
//                   return (
//                     <button key={opt.val} onClick={() => setMode(opt.val)} style={{
//                       display: 'flex', alignItems: 'center', gap: 12, padding: '14px 22px',
//                       border: `2px solid ${active ? '#2563eb' : '#e2e8f0'}`, borderRadius: 14, cursor: 'pointer',
//                       background: active ? '#eff6ff' : '#fff', transition: 'all 0.15s', textAlign: 'left',
//                       boxShadow: active ? '0 4px 14px rgba(37,99,235,0.15)' : 'none',
//                     }}>
//                       <span style={{ fontSize: 28 }}>{opt.icon}</span>
//                       <div>
//                         <div style={{ fontSize: 14, fontWeight: 700, color: active ? '#2563eb' : '#0f172a' }}>{opt.label}</div>
//                         <div style={{ fontSize: 12, color: active ? '#60a5fa' : '#94a3b8' }}>{opt.sub}</div>
//                       </div>
//                       {active && (
//                         <div style={{
//                           marginLeft: 'auto', width: 20, height: 20, borderRadius: '50%',
//                           background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center',
//                           justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0,
//                         }}>✓</div>
//                       )}
//                     </button>
//                   );
//                 })}
//               </div>

//               {/* Content + Summary */}
//               <div style={{ display: 'grid', gridTemplateColumns: '1fr 290px', gap: 20, alignItems: 'start' }}>

//                 {/* Left */}
//                 <div>

//                   {/* PACKAGE MODE */}
//                   {mode === 'package' && (
//                     loadingPackages
//                       ? <div style={{ color: '#94a3b8', fontSize: 14, padding: '40px 0', textAlign: 'center' }}>Loading packages...</div>
//                       : (
//                         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
//                           {packages.map(pkg => {
//                             const active = selectedPackage?.id === pkg.id;
//                             return (
//                               <div key={pkg.id} onClick={() => setSelectedPackage(pkg)} style={{
//                                 padding: '20px', borderRadius: 16,
//                                 border: `2px solid ${active ? '#2563eb' : '#e2e8f0'}`,
//                                 background: active ? '#eff6ff' : '#fff', cursor: 'pointer',
//                                 transition: 'all 0.15s', position: 'relative',
//                                 boxShadow: active ? '0 6px 20px rgba(37,99,235,0.15)' : '0 1px 3px rgba(0,0,0,0.05)',
//                               }}>
//                                 {pkg.is_popular && (
//                                   <div style={{
//                                     position: 'absolute', top: -1, right: 16,
//                                     background: '#2563eb', color: '#fff', fontSize: 10, fontWeight: 700,
//                                     padding: '2px 10px', borderRadius: '0 0 8px 8px',
//                                   }}>⭐ POPULAR</div>
//                                 )}
//                                 {active && (
//                                   <div style={{
//                                     position: 'absolute', top: 14, right: 14,
//                                     width: 22, height: 22, borderRadius: '50%',
//                                     background: '#2563eb', color: '#fff',
//                                     display: 'flex', alignItems: 'center', justifyContent: 'center',
//                                     fontSize: 12, fontWeight: 800,
//                                   }}>✓</div>
//                                 )}
//                                 <div style={{ fontWeight: 800, fontSize: 15, color: active ? '#2563eb' : '#0f172a', marginBottom: 8 }}>{pkg.name}</div>
//                                 <div style={{ fontWeight: 900, fontSize: 24, color: active ? '#2563eb' : '#0f172a', lineHeight: 1 }}>
//                                   {currency === 'PKR' ? `PKR ${Number(pkg.price_pkr).toLocaleString()}` : `$${pkg.price_usd}`}
//                                 </div>
//                                 <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 14 }}>/month · {pkg.trial_days}-day trial</div>
//                                 <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
//                                   {(pkg.modules ?? []).map(m => {
//                                     const cat = MODULE_CATALOG.find(c => c.internalKeys.includes(m));
//                                     return (
//                                       <span key={m} style={{
//                                         padding: '2px 6px', borderRadius: 6, fontSize: 9, fontWeight: 500,
//                                         background: cat ? cat.bg : '#f1f5f9',
//                                         color: cat ? cat.color : '#64748b',
//                                         border: `1px solid ${cat ? cat.border : '#e2e8f0'}`,
//                                       }}>{m.replace(/_/g, ' ')}</span>
//                                     );
//                                   })}
//                                 </div>
//                               </div>
//                             );
//                           })}
//                         </div>
//                       )
//                   )}

//                   {/* CUSTOM MODE */}
//                   {mode === 'custom' && (
//                     <div style={{ marginBottom: 24 }}>
//                       <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
//                         {MODULE_CATALOG.map(cat => {
//                           const active = selectedCategories.includes(cat.key);
//                           const hasError = active && !cat.canStandAlone && validation.blockingMessages.some(m => m.includes(cat.label));
//                           const badgeIsRequires = !cat.canStandAlone;
//                           return (
//                             <div key={cat.key} onClick={() => toggleCategory(cat.key)} style={{
//                               padding: '18px 14px', borderRadius: 14, cursor: 'pointer',
//                               border: `2px solid ${hasError ? '#dc2626' : active ? cat.color : '#e2e8f0'}`,
//                               background: active ? cat.bg : '#fff', transition: 'all 0.15s',
//                               position: 'relative', userSelect: 'none',
//                               boxShadow: hasError ? '0 0 0 3px #fecaca' : active ? `0 4px 14px ${cat.color}22` : '0 1px 3px rgba(0,0,0,0.04)',
//                             }}>
//                               {active && (
//                                 <div style={{
//                                   position: 'absolute', top: 10, right: 10,
//                                   width: 18, height: 18, borderRadius: '50%',
//                                   background: hasError ? '#dc2626' : cat.color, color: '#fff',
//                                   display: 'flex', alignItems: 'center', justifyContent: 'center',
//                                   fontSize: 10, fontWeight: 800,
//                                 }}>{hasError ? '!' : '✓'}</div>
//                               )}
//                               <div style={{ fontSize: 30, marginBottom: 8, lineHeight: 1 }}>{cat.icon}</div>
//                               <div style={{ fontSize: 13, fontWeight: 800, color: active ? cat.color : '#0f172a', marginBottom: 3 }}>{cat.label}</div>
//                               <div style={{ fontSize: 11, color: active ? cat.color + 'aa' : '#94a3b8', marginBottom: 8, lineHeight: 1.3 }}>{cat.desc}</div>
//                               {/* Dependency / standalone badges */}
//                               <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
//                                 <span style={{
//                                   padding: '2px 7px', borderRadius: 50, fontSize: 9, fontWeight: 700,
//                                   textTransform: 'uppercase', letterSpacing: '0.03em',
//                                   background: badgeIsRequires ? (active && hasError ? '#fef2f2' : '#fff7ed') : '#f0fdf4',
//                                   color: badgeIsRequires ? (active && hasError ? '#dc2626' : '#92400e') : '#166534',
//                                   border: `1px solid ${badgeIsRequires ? (active && hasError ? '#fca5a5' : '#fde68a') : '#a7f3d0'}`,
//                                 }}>{cat.badge}</span>
//                                 {cat.optionalBadge && !active && (
//                                   <span style={{
//                                     padding: '2px 7px', borderRadius: 50, fontSize: 9, fontWeight: 600,
//                                     background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0',
//                                   }}>{cat.optionalBadge}</span>
//                                 )}
//                               </div>
//                               <div style={{ fontWeight: 800, fontSize: 14, color: active ? cat.color : '#64748b' }}>
//                                 {fmt(cat.price_pkr, cat.price_usd)}
//                                 <span style={{ fontSize: 10, fontWeight: 400, color: active ? cat.color + '99' : '#94a3b8' }}>/mo</span>
//                               </div>
//                             </div>
//                           );
//                         })}
//                       </div>
//                       {selectedCategories.length > 0 && autoPackage() && (
//                         <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #a7f3d0', borderRadius: 10, fontSize: 12, color: '#065f46', display: 'flex', gap: 8 }}>
//                           <span>ℹ️</span>
//                           <span>Plan <strong>{autoPackage()?.name}</strong> will be applied for billing.</span>
//                         </div>
//                       )}
//                     </div>
//                   )}

//                   {/* ── Seats & Companies (always shown) ── */}
//                   <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #e2e8f0', padding: '18px 20px' }}>
//                     <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 16 }}>
//                       👤 User Seats &amp; Companies
//                     </div>
//                     <PillRow
//                       label="Number of Users (Seats)"
//                       options={SEAT_OPTIONS}
//                       selectedIdx={seatIdx}
//                       onSelect={setSeatIdx}
//                     />
//                     <PillRow
//                       label="Number of Companies"
//                       options={COMPANY_OPTIONS}
//                       selectedIdx={companyIdx}
//                       onSelect={setCompanyIdx}
//                     />
//                   </div>

//                 </div>

//                 {/* ── Right: Order Summary ── */}
//                 <div style={{ position: 'sticky', top: 88 }}>
//                   <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #e2e8f0', padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
//                     <h4 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: '0 0 16px' }}>Order Summary</h4>

//                     {/* Base price row */}
//                     {mode === 'package' && selectedPackage && (
//                       <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
//                         <span style={{ color: '#64748b' }}>📦 {selectedPackage.name}</span>
//                         <span style={{ fontWeight: 600 }}>
//                           {fmt(Number(selectedPackage.price_pkr), Number(selectedPackage.price_usd))}
//                         </span>
//                       </div>
//                     )}

//                     {mode === 'custom' && selectedCats.map(cat => (
//                       <div key={cat.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
//                         <span style={{ color: '#64748b' }}>{cat.icon} {cat.label}</span>
//                         <span style={{ fontWeight: 600, color: cat.color }}>{fmt(cat.price_pkr, cat.price_usd)}</span>
//                       </div>
//                     ))}

//                     {mode === 'custom' && selectedCats.length === 0 && (
//                       <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', padding: '8px 0 12px' }}>
//                         Select modules to see pricing
//                       </div>
//                     )}

//                     {/* Blocking errors */}
//                     {mode === 'custom' && validation.blockingMessages.length > 0 && (
//                       <div style={{ marginBottom: 12 }}>
//                         {validation.blockingMessages.map((msg, i) => (
//                           <div key={i} style={{ padding: '9px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 12, color: '#dc2626', marginBottom: 6, lineHeight: 1.4 }}>
//                             ⚠️ {msg}
//                           </div>
//                         ))}
//                       </div>
//                     )}

//                     {/* Recommendations */}
//                     {mode === 'custom' && validation.isValid && validation.recommendations.length > 0 && (
//                       <div style={{ marginBottom: 12 }}>
//                         {validation.recommendations.map((rec, i) => (
//                           <div key={i} style={{ padding: '8px 12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, fontSize: 11, color: '#0369a1', marginBottom: 5, lineHeight: 1.4 }}>
//                             💡 {rec}
//                           </div>
//                         ))}
//                       </div>
//                     )}

//                     {/* Seat addon */}
//                     {seat.price_pkr > 0 && (
//                       <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
//                         <span style={{ color: '#64748b' }}>👤 {seat.label}</span>
//                         <span style={{ fontWeight: 600, color: '#7c3aed' }}>+{fmt(seat.price_pkr, seat.price_usd)}</span>
//                       </div>
//                     )}

//                     {/* Company addon */}
//                     {company.price_pkr > 0 && (
//                       <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
//                         <span style={{ color: '#64748b' }}>🏢 {company.label}</span>
//                         <span style={{ fontWeight: 600, color: '#7c3aed' }}>+{fmt(company.price_pkr, company.price_usd)}</span>
//                       </div>
//                     )}

//                     {/* Total */}
//                     {(mode === 'package' ? !!selectedPackage : selectedCats.length > 0) && (
//                       <div style={{ borderTop: '1.5px dashed #e2e8f0', paddingTop: 12, marginTop: 8, marginBottom: 16 }}>
//                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
//                           <span style={{ fontWeight: 800, color: '#0f172a', fontSize: 14 }}>Total</span>
//                           <div style={{ textAlign: 'right' }}>
//                             <div style={{ fontWeight: 900, fontSize: 22, color: '#2563eb' }}>
//                               {fmt(totalPkr, totalUsd)}
//                               <span style={{ fontSize: 12, fontWeight: 400, color: '#94a3b8' }}>/mo</span>
//                             </div>
//                             <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>
//                               14-day free trial included
//                             </div>
//                           </div>
//                         </div>
//                       </div>
//                     )}

//                     <button
//                       onClick={handleSubmit}
//                       disabled={!canSubmit}
//                       style={{
//                         width: '100%', padding: '13px',
//                         background: canSubmit ? 'linear-gradient(135deg,#2563eb,#3b82f6)' : '#e2e8f0',
//                         border: 'none', borderRadius: 10,
//                         color: canSubmit ? '#fff' : '#94a3b8',
//                         fontSize: 14, fontWeight: 700,
//                         cursor: canSubmit ? 'pointer' : 'not-allowed',
//                         boxShadow: canSubmit ? '0 4px 14px rgba(37,99,235,0.3)' : 'none',
//                         transition: 'all 0.15s',
//                       }}>
//                       {submitting ? 'Setting up...' : 'Continue to Payment →'}
//                     </button>
//                     <div style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: '#94a3b8' }}>
//                       🔒 Secure · 14-day free trial included
//                     </div>
//                   </div>
//                 </div>

//               </div>

//               <div style={{ marginTop: 24 }}>
//                 <button onClick={() => setStep(1)} style={{
//                   padding: '10px 22px', border: '1.5px solid #e2e8f0',
//                   borderRadius: 10, background: '#fff', color: '#64748b',
//                   fontWeight: 600, fontSize: 14, cursor: 'pointer',
//                 }}>← Back</button>
//               </div>

//             </div>
//           )}

//         </div>
//       </div>
//       <LandingFooter />
//     </>
//   );
// }

// export default function RegisterPage() {
//   return (
//     <Suspense fallback={
//       <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
//         <div style={{ color: '#64748b', fontSize: 15 }}>Loading...</div>
//       </div>
//     }>
//       <RegisterContent />
//     </Suspense>
//   );
// }

'use client';
import { Suspense, useEffect, useState, useCallback, ReactNode, InputHTMLAttributes, CSSProperties } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  HiCheckCircle, HiXCircle,
  HiUser, HiEnvelope, HiLockClosed, HiPhone,
  HiGlobeAlt, HiCheck, HiClock, HiCube, HiAdjustmentsHorizontal,
  HiUsers, HiDocumentText, HiShieldCheck, HiBanknotes,
  HiClipboardDocumentList, HiChevronLeft, HiArrowRight,
  HiEye, HiEyeSlash, HiStar,
  HiBuildingOffice2,
} from 'react-icons/hi2';
import { IconType } from 'react-icons';
import LandingNavbar from '../../components/landing/Navbar';
import LandingFooter from '../../components/landing/Footer';
// import Auth_HeroSection from '../../components/ui/Auth_HeroSection';
import { publicService, PublicModule } from '../../lib/services/publicService';
import { setAuthData } from '../../lib/auth';
import toast from 'react-hot-toast';
import Container from '../../components/ui/Conatiner';
import PhoneInput from '../../components/ui/PhoneInput';

type Category = {
  key: string;
  label: string;
  icon: IconType;
  desc: string;
  color: string;
  bg: string;
  border: string;
  price_pkr: number;
  price_usd: number;
  modules: string[];
};

type SeatOption = {
  label: string;
  value: number | null;
  price_pkr: number;
  price_usd: number;
};

type CompanyOption = {
  label: string;
  value: number | null;
  price_pkr: number;
  price_usd: number;
};

type Package = {
  id: number;
  name: string;
  price_pkr: number | string;
  price_usd: number | string;
  trial_days: number;
  is_popular?: boolean;
  modules?: string[];
};

type Currency = 'USD';
type Mode = 'package' | 'custom';

// Presentational styling per module key — pricing/description/availability come from the
// Modules registry (GET /public/modules) so super admin's active/inactive toggle takes effect here.
const CATEGORY_STYLE: Record<string, { icon: IconType; color: string; bg: string; border: string }> = {
  sales:          { icon: HiDocumentText,          color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
  invoice:        { icon: HiDocumentText,          color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
  client_portal:  { icon: HiUser,                  color: '#0d9488', bg: '#f0fdfa', border: '#99f6e4' },
  hr:             { icon: HiUsers,                 color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  compliance:     { icon: HiShieldCheck,           color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  finance:        { icon: HiBanknotes,             color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  projects:       { icon: HiClipboardDocumentList, color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc' },
};
const DEFAULT_CATEGORY_STYLE = { icon: HiCube, color: '#475569', bg: '#f8fafc', border: '#e2e8f0' };

function moduleToCategory(m: PublicModule): Category {
  const style = CATEGORY_STYLE[m.key] ?? DEFAULT_CATEGORY_STYLE;
  return {
    key: m.key,
    label: m.label,
    icon: style.icon,
    desc: m.description ?? '',
    color: style.color,
    bg: style.bg,
    border: style.border,
    price_pkr: m.price_pkr,
    price_usd: m.price_usd,
    modules: m.sub_modules,
  };
}

const SEAT_OPTIONS: SeatOption[] = [
  { label: '10 Users', value: 10, price_pkr: 0, price_usd: 0 },
  { label: '25 Users', value: 25, price_pkr: 800, price_usd: 3 },
  { label: '50 Users', value: 50, price_pkr: 1500, price_usd: 6 },
  { label: '100 Users', value: 100, price_pkr: 3000, price_usd: 12 },
  { label: 'Unlimited', value: null, price_pkr: 6000, price_usd: 25 },
];

const COMPANY_OPTIONS: CompanyOption[] = [
  { label: '1 Company', value: 1, price_pkr: 0, price_usd: 0 },
  { label: '3 Companies', value: 3, price_pkr: 500, price_usd: 2 },
  { label: '5 Companies', value: 5, price_pkr: 1000, price_usd: 4 },
  { label: 'Unlimited', value: null, price_pkr: 2500, price_usd: 10 },
];

// USA first — primary target market.
const TIMEZONES: string[] = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Europe/London', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Singapore',
];

type PwStrength = { label: string; color: string; pct: number };

function pwStrength(p: string): PwStrength {
  if (!p) return { label: '', color: '#e2e8f0', pct: 0 };
  let s = 0;
  if (p.length >= 8) s++;
  if (/[A-Z]/.test(p)) s++;
  if (/[0-9]/.test(p)) s++;
  if (/[^a-zA-Z0-9]/.test(p)) s++;
  if (s <= 1) return { label: 'Weak', color: '#ef4444', pct: 25 };
  if (s === 2) return { label: 'Fair', color: '#f59e0b', pct: 50 };
  if (s === 3) return { label: 'Good', color: '#3b82f6', pct: 75 };
  return { label: 'Strong', color: '#22c55e', pct: 100 };
}

const inputBase: CSSProperties = {
  width: '100%',
  height: 40,
  border: '1px solid var(--bg-blue-light1)',
  borderRadius: 4,
  paddingLeft: 36,
  paddingRight: 12,
  fontSize: 14,
  color: '#111827',
  outline: 'none',
  boxSizing: 'border-box',
  background: '#fff',
  transition: 'border-color 0.2s',
};

const labelBase: CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 500,
  color: '#374151',
  marginBottom: 6,
};

type InputFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  icon?: IconType;
  required?: boolean;
  error?: string;
  rightEl?: ReactNode;
};

function InputField({ label, icon: Icon, required, error, type = 'text', rightEl, ...rest }: InputFieldProps) {
  return (
    <div style={{ marginBottom: 16 }}>
      {label && (
        <label style={labelBase}>
          {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
        </label>
      )}
      <div style={{ position: 'relative' }}>
        {Icon && (
          <Icon size={15} style={{
            position: 'absolute', left: 11, top: '50%',
            transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none',
          }} />
        )}
        <input
          type={type}
          style={{
            ...inputBase,
            paddingLeft: Icon ? 36 : 12,
            paddingRight: rightEl ? 40 : 12,
            borderColor: error ? 'var(--error-lable, #ef4444)' : 'var(--bg-blue-light1)',
          }}
          onFocus={e => (e.target.style.borderColor = 'var(--brand-blue)')}
          onBlur={e => (e.target.style.borderColor = error ? 'var(--error-lable, #ef4444)' : 'var(--bg-blue-light1)')}
          {...rest}
        />
        {rightEl}
      </div>
      {error && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>{error}</div>}
    </div>
  );
}

type PillOption = { label: string; value: number | null; price_pkr: number; price_usd: number };

type PillRowProps = {
  options: PillOption[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
  label: string;
};

function PillRow({ options, selectedIdx, onSelect, label }: PillRowProps) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map((opt, i) => {
          const active = selectedIdx === i;
          return (
            <button key={i} onClick={() => onSelect(i)} style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: `1.5px solid ${active ? 'var(--brand-blue)' : 'var(--border, #e5e7eb)'}`,
              background: active ? 'var(--brand-gradient)' : '#fff',
              color: active ? '#fff' : '#374151',
              fontSize: 12,
              fontWeight: active ? 700 : 500,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}>
              {opt.label}
              {opt.price_usd > 0 && (
                <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.85 }}>
                  +${opt.price_usd}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preSelectedPkg = searchParams.get('package');

  const [step, setStep] = useState<number>(1);
  const [mode, setMode] = useState<Mode>('package');
  const currency: Currency = 'USD';
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loadingPackages, setLoadingPackages] = useState<boolean>(true);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [seatIdx, setSeatIdx] = useState<number>(0);
  const [companyIdx, setCompanyIdx] = useState<number>(0);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirm, setShowConfirm] = useState<boolean>(false);

  const seat = SEAT_OPTIONS[seatIdx];
  const company = COMPANY_OPTIONS[companyIdx];
  const selectedCats = categories.filter(c => selectedCategories.includes(c.key));
  const customModules = [...new Set(selectedCats.flatMap(c => c.modules))];
  const customBasePkr = selectedCats.reduce((s, c) => s + c.price_pkr, 0);
  const customBaseUsd = selectedCats.reduce((s, c) => s + c.price_usd, 0);
  const addonPkr = seat.price_pkr + company.price_pkr;
  const addonUsd = seat.price_usd + company.price_usd;
  const totalPkr = mode === 'package' ? Number(selectedPackage?.price_pkr ?? 0) + addonPkr : customBasePkr + addonPkr;
  const totalUsd = mode === 'package' ? Number(selectedPackage?.price_usd ?? 0) + addonUsd : customBaseUsd + addonUsd;

  const autoPackage = (): Package | null => {
    if (!packages.length || !customModules.length) return null;
    const sorted = [...packages].sort((a, b) => Number(a.price_usd) - Number(b.price_usd));
    for (const pkg of sorted) {
      if (customModules.every(m => (pkg.modules ?? []).includes(m))) return pkg;
    }
    return sorted[sorted.length - 1] ?? null;
  };

  const [companyName, setCompanyName] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [emailOk, setEmailOk] = useState<boolean | null>(null);
  const [emailChecking, setEmailChecking] = useState<boolean>(false);
  const [password, setPassword] = useState<string>('');
  const [confirm, setConfirm] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [timezone, setTimezone] = useState<string>('America/New_York');

  useEffect(() => {
    setLoadingPackages(true);
    publicService.getPackages()
      .then((pkgs: Package[]) => {
        setPackages(pkgs);
        if (preSelectedPkg) {
          const found = pkgs.find(p => p.id === Number(preSelectedPkg));
          if (found) { setSelectedPackage(found); return; }
        }
        setSelectedPackage(pkgs.find(p => p.is_popular) ?? pkgs[0] ?? null);
      })
      .catch(() => { })
      .finally(() => setLoadingPackages(false));
  }, [preSelectedPkg]);

  useEffect(() => {
    publicService.getModules()
      .then(mods => setCategories(mods.map(moduleToCategory)))
      .catch(() => {});
  }, []);

  const checkEmail = useCallback(async (val: string) => {
    if (!val || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { setEmailOk(null); return; }
    setEmailChecking(true);
    try { setEmailOk(await publicService.checkEmail(val)); }
    catch { setEmailOk(null); }
    finally { setEmailChecking(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => checkEmail(email), 700);
    return () => clearTimeout(t);
  }, [email, checkEmail]);

  const toggleCategory = (key: string) =>
    setSelectedCategories(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  const step1Valid = !!(companyName && name && email && emailOk && password.length >= 8 && password === confirm);

  const handleSubmit = async () => {
    const pkgToUse = mode === 'package' ? selectedPackage : autoPackage();
    const modulesToUse = mode === 'package' ? (selectedPackage?.modules ?? []) : customModules;
    if (mode === 'package' && !selectedPackage) { toast.error('Please select a package'); return; }
    if (mode === 'custom' && selectedCategories.length === 0) { toast.error('Please select at least one module'); return; }
    if (!pkgToUse) { toast.error('No matching package found'); return; }
    setSubmitting(true);
    try {
      const res = await publicService.register({
        company_name: companyName, name, email, password,
        password_confirmation: confirm, phone: phone || undefined,
        package_id: pkgToUse.id,
        selected_modules: modulesToUse,
        currency, start_type: 'paid', timezone,
        max_users: seat.value, max_companies: company.value,
      });
      if (res.success) {
        setAuthData(res.data.token, res.data.admin, 'admin');
        localStorage.setItem('pending_order', JSON.stringify({
          package_name: pkgToUse.name,
          modules: mode === 'custom' ? selectedCats.map(c => c.label) : [],
          mode, seats: seat.label, companies: company.label,
          total_pkr: totalPkr, total_usd: totalUsd,
          currency, trial_days: pkgToUse.trial_days,
        }));
        router.push('/payment');
      }
    } catch (err: any) {
      const e = err;
      const errs = e.response?.data?.errors;
      if (errs) Object.values(errs).flat().forEach((m: any) => toast.error(m));
      else toast.error(e.response?.data?.message ?? 'Registration failed');
    } finally { setSubmitting(false); }
  };

  const strength = pwStrength(password);
  const canSubmit = !submitting && (mode === 'package' ? !!selectedPackage : selectedCategories.length > 0);
  const fmt = (_pkr: number, usd: number) => `$${usd}`;

  return (
    <>
      <LandingNavbar />
      <div className='AuthBackground'>
        <Container>
          <div style={{ maxWidth: step === 2 ? 1100 : 640, margin: '0 auto', }}>

            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: 36 }}>
              {[1, 2].map(s => (
                <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: step >= s ? 'var(--brand-gradient)' : '#fff',
                      border: step >= s ? 'none' : '1.5px solid var(--border, #e5e7eb)',
                      color: step >= s ? '#fff' : '#9ca3af',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: 14,
                      boxShadow: step === s ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
                    }}>
                      {step > s ? <HiCheck size={16} /> : s}
                    </div>
                    <span style={{
                      fontSize: 12, fontWeight: step >= s ? 600 : 400,
                      color: step >= s ? 'var(--brand-blue)' : '#9ca3af',
                      whiteSpace: 'nowrap',
                    }}>
                      {s === 1 ? 'Company Info' : 'Select Plan'}
                    </span>
                  </div>
                  {s < 2 && (
                    <div style={{
                      width: 80, height: 2,
                      background: step > s ? 'var(--brand-blue)' : 'var(--border, #e5e7eb)',
                      margin: '0 10px', marginBottom: 22,
                    }} />
                  )}
                </div>
              ))}
            </div>

            {step === 1 && (
              <div style={{
                background: 'var(--bg-white)',
                borderRadius: 10,
                border: '1px solid var(--border, #e5e7eb)',
                padding: '40px 40px',
              }} className="RegisterForm shadow-sm">
                <h2 style={{ fontSize: '1.8rem', fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>
                  Create Account
                </h2>
                <p style={{ color: '#6b7280', fontSize: 14, margin: '0 0 28px' }}>
                  Fill in your details to get started with a 14-day free trial.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <InputField
                    label="Company Name"
                    required
                    value={companyName}
                    // No spaces, no special characters — letters/digits only.
                    onChange={e => setCompanyName(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
                    placeholder=""
                  />
                  <InputField
                    label="Your Full Name"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder=""
                  />
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={labelBase}>
                    Email Address <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="email"
                      placeholder=""
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      style={{
                        ...inputBase,
                        paddingLeft: 12,
                        paddingRight: 12,
                        borderColor: emailOk === false ? 'var(--error-lable, #ef4444)' : emailOk === true ? '#22c55e' : 'var(--bg-blue-light1)',
                      }}
                      onFocus={e => (e.target.style.borderColor = 'var(--brand-blue)')}
                      onBlur={e => (e.target.style.borderColor = emailOk === false ? 'var(--error-lable, #ef4444)' : emailOk === true ? '#22c55e' : 'var(--bg-blue-light1)')}
                    />
                    <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}>
                      {emailChecking
                        ? <HiClock size={16} color="#9ca3af" />
                        : emailOk === true
                          ? <HiCheckCircle size={16} color="#22c55e" />
                          : emailOk === false
                            ? <HiXCircle size={16} color="#ef4444" />
                            : null
                      }
                    </span>
                  </div>
                  {emailOk === false && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>This email is already registered</div>}
                  {emailOk === true && <div style={{ fontSize: 12, color: '#22c55e', marginTop: 4 }}>Email is available</div>}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelBase}>Password <span style={{ color: '#ef4444' }}>*</span></label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Min 8 characters"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        style={{ ...inputBase, paddingLeft: 12, paddingRight: 30 }}
                        onFocus={e => (e.target.style.borderColor = 'var(--brand-blue)')}
                        onBlur={e => (e.target.style.borderColor = 'var(--bg-blue-light1)')}
                      />
                      <button type="button" onClick={() => setShowPassword(v => !v)} tabIndex={-1} style={{
                        position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af',
                        display: 'flex', alignItems: 'center', padding: 2,
                      }}>
                        {showPassword ? <HiEyeSlash size={16} /> : <HiEye size={16} />}
                      </button>
                    </div>
                    {password && (
                      <div style={{ marginTop: 6 }}>
                        <div style={{ height: 3, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${strength.pct}%`, height: '100%', background: strength.color, borderRadius: 4, transition: 'all 0.3s' }} />
                        </div>
                        <span style={{ fontSize: 11, color: strength.color, fontWeight: 600 }}>{strength.label}</span>
                      </div>
                    )}
                  </div>

                  <div style={{ marginBottom: 16 }}>
                    <label style={labelBase}>Confirm Password <span style={{ color: '#ef4444' }}>*</span></label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showConfirm ? 'text' : 'password'}
                        placeholder="Repeat password"
                        value={confirm}
                        onChange={e => setConfirm(e.target.value)}
                        style={{
                          ...inputBase, paddingLeft: 12, paddingRight: 30,
                          borderColor: confirm && password !== confirm ? 'var(--error-lable, #ef4444)' : 'var(--bg-blue-light1)',
                        }}
                        onFocus={e => (e.target.style.borderColor = 'var(--brand-blue)')}
                        onBlur={e => (e.target.style.borderColor = confirm && password !== confirm ? 'var(--error-lable, #ef4444)' : 'var(--bg-blue-light1)')}
                      />
                      <button type="button" onClick={() => setShowConfirm(v => !v)} tabIndex={-1} style={{
                        position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af',
                        display: 'flex', alignItems: 'center', padding: 2,
                      }}>
                        {showConfirm ? <HiEyeSlash size={16} /> : <HiEye size={16} />}
                      </button>
                    </div>
                    {confirm && password !== confirm && (
                      <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>Passwords do not match</div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 28 }}>
                  <div>
                    <label style={labelBase}>Phone (Optional)</label>
                    <PhoneInput value={phone} onChange={setPhone} />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={labelBase}>Timezone</label>
                    <div style={{ position: 'relative' }}>
                      <select
                        value={timezone}
                        onChange={e => setTimezone(e.target.value)}
                        style={{ ...inputBase, paddingLeft: 12, paddingRight: 12, appearance: 'none' }}
                        onFocus={e => (e.target.style.borderColor = 'var(--brand-blue)')}
                        onBlur={e => (e.target.style.borderColor = 'var(--bg-blue-light1)')}
                      >
                        {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => step1Valid && setStep(2)}
                  disabled={!step1Valid}
                  style={{
                    width: '100%', height: 42,
                    borderRadius: 4, border: 'none',
                    cursor: step1Valid ? 'pointer' : 'not-allowed',
                    background: step1Valid ? 'var(--brand-gradient)' : 'var(--bg-blue-light1)',
                    color: '#fff', fontSize: 14, fontWeight: 600,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'background 0.2s',
                    marginBottom: 16,
                  }}
                >
                  Next: Select Plan <HiArrowRight size={16} />
                </button>

                <div style={{ textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>
                  Already have an account? <Link href="/login" style={{ color: 'var(--brand-blue)', paddingLeft: "5px", fontWeight: 600, textDecoration: 'none' }}>
                    Sign in
                  </Link>
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                {/* Header row */}
                <div style={{ display: 'flex', gap: '5px', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <div>
                    <h2 style={{ fontSize: '1.8rem', fontWeight: 700, color: '#111827', margin: '0 0 4px' }}>Choose Your Plan</h2>
                    <p style={{ color: '#6b7280', fontSize: 14, margin: 0 }}>Select a ready-made package or build your own</p>
                  </div>
                  {/* Currency toggle — login style */}
                </div>

                <div className='grid grid-cols-1 sm:grid-cols-2 items-center gap-2 sm:gap-4 mb-10'>
                  {[
                    { val: 'package' as Mode, Icon: HiCube, label: 'Choose a Package', sub: 'Pre-built plans with fixed pricing' },
                    { val: 'custom' as Mode, Icon: HiAdjustmentsHorizontal, label: 'Custom Modules', sub: 'Pick only what you need' },
                  ].map(opt => {
                    const active = mode === opt.val;
                    return (
                      <button key={opt.val} onClick={() => setMode(opt.val)} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '12px 20px',
                        border: `1.5px solid var(--border, #e5e7eb)`,
                        borderRadius: 4, cursor: 'pointer',
                        background: active ? '#fff' : '#fff',
                        transition: 'all 0.15s', textAlign: 'left',
                        boxShadow: active ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
                      }}>
                        <opt.Icon size={22} style={{ color: active ? 'var(--brand-blue)' : '#9ca3af', flexShrink: 0 }} />
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: active ? 'var(--brand-blue)' : '#111827' }}>{opt.label}</div>
                          <div style={{ fontSize: 12, color: '#9ca3af' }}>{opt.sub}</div>
                        </div>
                        {active && (
                          <div style={{
                            marginLeft: 'auto', width: 20, height: 20, borderRadius: '50%',
                            background: 'var(--brand-gradient)', color: '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 11, fontWeight: 800, flexShrink: 0,
                          }}>
                            <HiCheck size={11} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className='w-full grid grid-cols-12 items-start gap-2'>
                  <div className='w-full col-span-12 md:col-span-8'>
                    {mode === 'package' && (
                      loadingPackages
                        ? <div style={{ color: '#9ca3af', fontSize: 14, padding: '40px 0', textAlign: 'center' }}>Loading packages…</div>
                        : (
                          <div className='mb-16 grid md:grid-cols-2 items-start gap-5 w-full'>
                            {packages.map(pkg => {
                              const active = selectedPackage?.id === pkg.id;
                              return (
                                <div
                                  key={pkg.id}
                                  onClick={() => setSelectedPackage(pkg)}
                                  style={{
                                    width: '100%',
                                    borderRadius: 20,
                                    border: active ? '2px solid var(--brand-blue)' : '1.5px solid #e5e7eb',
                                    background: active ? '#fafaff' : '#fff',
                                    padding: '28px 22px 22px',
                                    cursor: 'pointer',
                                    position: 'relative',
                                    transition: 'all 0.2s ease',
                                    boxShadow: active
                                      ? '0 8px 30px rgba(99,102,241,0.18)'
                                      : '0 1px 4px rgba(0,0,0,0.04)',
                                  }}
                                  onMouseEnter={e => {
                                    if (!active) {
                                      e.currentTarget.style.transform = 'translateY(-3px)';
                                      e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)';
                                      e.currentTarget.style.borderColor = '#c7d2fe';
                                    }
                                  }}
                                  onMouseLeave={e => {
                                    if (!active) {
                                      e.currentTarget.style.transform = 'translateY(0)';
                                      e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)';
                                      e.currentTarget.style.borderColor = '#e5e7eb';
                                    }
                                  }}
                                >
                                  {pkg.is_popular && (
                                    <div style={{
                                      position: 'absolute', top: -1, left: '50%', transform: 'translateX(-50%)',
                                      background: 'var(--brand-gradient)',
                                      color: '#fff', fontSize: 9, fontWeight: 700,
                                      padding: '3px 14px', borderRadius: '0 0 10px 10px',
                                      letterSpacing: '0.08em', whiteSpace: 'nowrap',
                                      display: 'flex', alignItems: 'center', gap: 4,
                                    }}>
                                      MOST POPULAR
                                    </div>
                                  )}

                                  {/* Active checkmark */}
                                  {active && (
                                    <div style={{
                                      position: 'absolute', top: 14, right: 14,
                                      width: 22, height: 22, borderRadius: '50%',
                                      background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      fontSize: 12, fontWeight: 700,
                                    }}>
                                      ✓
                                    </div>
                                  )}

                                  {/* Plan name */}
                                  <div style={{
                                    fontSize: 11, fontWeight: 700, color: '#6366f1',
                                    textTransform: 'uppercase', letterSpacing: '0.08em',
                                    marginBottom: 10, marginTop: pkg.is_popular ? 10 : 0,
                                  }}>
                                    {pkg.name}
                                  </div>

                                  {/* Price */}
                                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, marginBottom: 2 }}>
                                    <span style={{ fontSize: 15, fontWeight: 700, color: active ? '#6366f1' : '#111827', marginBottom: 3 }}>
                                      $
                                    </span>
                                    <span style={{ fontSize: 36, fontWeight: 800, lineHeight: 1, color: active ? '#6366f1' : '#111827' }}>
                                      {pkg.price_usd}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6 }}>/month</div>

                                  {/* Trial pill */}
                                  <div style={{
                                    display: 'inline-block',
                                    background: '#ecfdf5', color: '#059669',
                                    border: '1px solid #a7f3d0',
                                    fontSize: 10, fontWeight: 600,
                                    padding: '2px 10px', borderRadius: 20,
                                    marginBottom: 18,
                                  }}>
                                    ✓ {pkg.trial_days}-day free trial
                                  </div>

                                  {/* Divider */}
                                  <div style={{ borderTop: '1px solid #f3f4f6', marginBottom: 14 }} />

                                  {/* Modules label */}
                                  <div style={{
                                    fontSize: 10, fontWeight: 600, color: '#9ca3af',
                                    textTransform: 'uppercase', letterSpacing: '0.06em',
                                    marginBottom: 10,
                                  }}>
                                    Included Modules
                                  </div>

                                  {/* Module tags */}
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {(pkg.modules ?? []).map(m => {
                                      const cat = categories.find(c => c.modules.includes(m));
                                      return (
                                        <span key={m} style={{
                                          padding: '4px 8px', borderRadius: 6,
                                          fontSize: 10, fontWeight: 600,
                                          background: cat?.bg ?? '#f1f5f9',
                                          color: cat?.color ?? '#6b7280',
                                          border: `1px solid ${cat?.border ?? '#e5e7eb'}`,
                                          textTransform: 'capitalize',
                                        }}>
                                          {m.replace(/_/g, ' ')}
                                        </span>
                                      );
                                    })}
                                  </div>

                                  {/* CTA Button */}
                                  <button
                                    onClick={e => { e.stopPropagation(); setSelectedPackage(pkg); }}
                                    style={{
                                      width: '100%', marginTop: 20,
                                      padding: '11px 0', borderRadius: 12,
                                      border: active ? 'none' : '1.5px solid #c7d2fe',
                                      background: active
                                        ? 'var(--brand-gradient)'
                                        : '#fff',
                                      color: active ? '#fff' : '#6366f1',
                                      fontSize: 13, fontWeight: 700,
                                      cursor: 'pointer',
                                      boxShadow: active ? '0 4px 12px rgba(99,102,241,0.3)' : 'none',
                                      transition: 'all 0.2s',
                                    }}
                                  >
                                    {active ? 'Selected' : 'Get Started →'}
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )
                    )}

                    {/* Custom  */}
                    {mode === 'custom' && (
                      <div style={{ marginBottom: 20 }}>
                        <div className='grid max-[420px]:grid-cols-1 grid-cols-2 md:grid-cols-3 items-center gap-2 w-full mb-10'>
                          {categories.map(cat => {
                            const active = selectedCategories.includes(cat.key);
                            const CatIcon = cat.icon;
                            return (
                              <div key={cat.key} onClick={() => toggleCategory(cat.key)} style={{
                                padding: '16px 14px', borderRadius: 4, cursor: 'pointer',
                                border: `1.5px solid ${active ? cat.color : 'var(--border, #e5e7eb)'}`,
                                background: active ? cat.bg : '#fff',
                                transition: 'all 0.15s', position: 'relative', userSelect: 'none',
                                boxShadow: active ? `0 2px 10px ${cat.color}22` : '0 1px 3px rgba(0,0,0,0.04)',
                              }}>
                                {active && (
                                  <div style={{
                                    position: 'absolute', top: 10, right: 10, width: 18, height: 18,
                                    borderRadius: '50%', background: cat.color, color: '#fff',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  }}>
                                    <HiCheck size={10} />
                                  </div>
                                )}
                                <CatIcon size={24} style={{ color: active ? cat.color : '#9ca3af', marginBottom: 8 }} />
                                <div style={{ fontSize: 13, fontWeight: 700, color: active ? cat.color : '#111827', marginBottom: 2 }}>{cat.label}</div>
                                <div style={{ fontSize: 11, color: active ? cat.color + 'aa' : '#9ca3af', marginBottom: 8, lineHeight: 1.3 }}>{cat.desc}</div>
                                <div style={{ fontWeight: 700, fontSize: 13, color: active ? cat.color : '#6b7280' }}>
                                  {fmt(cat.price_pkr, cat.price_usd)}
                                  <span style={{ fontSize: 10, fontWeight: 400, color: active ? cat.color + '99' : '#9ca3af' }}>/mo</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {selectedCategories.length > 0 && autoPackage() && (
                          <div style={{
                            padding: '10px 14px', background: '#f0fdf4',
                            border: '1px solid #a7f3d0', borderRadius: 4,
                            fontSize: 12, color: '#065f46', display: 'flex', gap: 8, alignItems: 'center',
                          }}>
                            <HiShieldCheck size={14} />
                            <span>Plan <strong>{autoPackage()?.name}</strong> will be applied for billing.</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Seats & companies */}
                    <div style={{
                      background: '#fff', borderRadius: 4,
                      border: '1px solid var(--border, #e5e7eb)', padding: '16px 18px',
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <HiUsers size={15} style={{ color: 'var(--brand-blue)' }} /> User Seats &amp; Companies
                      </div>
                      <PillRow label="Number of Users (Seats)" options={SEAT_OPTIONS} selectedIdx={seatIdx} onSelect={setSeatIdx} />
                      <PillRow label="Number of Companies" options={COMPANY_OPTIONS} selectedIdx={companyIdx} onSelect={setCompanyIdx} />
                    </div>
                  </div>

                  <div className='col-span-12 md:col-span-4' style={{ position: 'sticky', top: 88 }}>
                    <div style={{
                      background: '#fff', borderRadius: 4,
                      border: '1px solid var(--border, #e5e7eb)',
                      padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                    }}>
                      <h4 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: '0 0 16px' }}>
                        Order Summary
                      </h4>

                      {mode === 'package' && selectedPackage && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
                          <span style={{ color: '#6b7280', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <HiCube size={13} style={{ color: 'var(--brand-blue)' }} /> {selectedPackage.name}
                          </span>
                          <span style={{ fontWeight: 600 }}>{fmt(Number(selectedPackage.price_pkr), Number(selectedPackage.price_usd))}</span>
                        </div>
                      )}

                      {mode === 'custom' && selectedCats.map(cat => (
                        <div key={cat.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                          <span style={{ color: '#6b7280', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <cat.icon size={13} style={{ color: cat.color }} /> {cat.label}
                          </span>
                          <span style={{ fontWeight: 600, color: cat.color }}>{fmt(cat.price_pkr, cat.price_usd)}</span>
                        </div>
                      ))}

                      {mode === 'custom' && selectedCats.length === 0 && (
                        <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: '8px 0 12px' }}>
                          Select modules to see pricing
                        </div>
                      )}

                      {seat.price_usd > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                          <span style={{ color: '#6b7280', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <HiUsers size={13} style={{ color: '#7c3aed' }} /> {seat.label}
                          </span>
                          <span style={{ fontWeight: 600, color: '#7c3aed' }}>+{fmt(seat.price_pkr, seat.price_usd)}</span>
                        </div>
                      )}

                      {company.price_usd > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                          <span style={{ color: '#6b7280', display: 'flex', alignItems: 'center', gap: 5 }}>
                            <HiBuildingOffice2 size={13} style={{ color: '#7c3aed' }} /> {company.label}
                          </span>
                          <span style={{ fontWeight: 600, color: '#7c3aed' }}>+{fmt(company.price_pkr, company.price_usd)}</span>
                        </div>
                      )}

                      {(mode === 'package' ? !!selectedPackage : selectedCats.length > 0) && (
                        <div style={{ borderTop: '1px dashed var(--border, #e5e7eb)', paddingTop: 12, marginTop: 8, marginBottom: 16 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 700, color: '#111827', fontSize: 14 }}>Total</span>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--brand-blue)' }}>
                                {fmt(totalPkr, totalUsd)}
                                <span style={{ fontSize: 12, fontWeight: 400, color: '#9ca3af' }}>/mo</span>
                              </div>
                              <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>14-day free trial included</div>
                            </div>
                          </div>
                        </div>
                      )}

                      <button
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        style={{
                          width: '100%', height: 42,
                          borderRadius: 4, border: 'none',
                          cursor: canSubmit ? 'pointer' : 'not-allowed',
                          background: canSubmit ? 'var(--brand-gradient)' : 'var(--bg-blue-light1)',
                          color: '#fff', fontSize: 14, fontWeight: 600,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          transition: 'background 0.2s',
                        }}
                      >
                        {submitting ? 'Setting up…' : <>Continue to Payment <HiArrowRight size={16} /></>}
                      </button>

                      <div style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <HiShieldCheck size={12} /> Secure · 14-day free trial included
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 20 }}>
                  <button
                    onClick={() => setStep(1)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 18px',
                      border: '1px solid var(--border, #e5e7eb)',
                      borderRadius: 4, background: '#fff',
                      color: '#6b7280', fontWeight: 600, fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    <HiChevronLeft size={15} /> Back
                  </button>
                </div>
              </div>
            )}

          </div>

        </Container>
      </div>
      <LandingFooter />
    </>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div style={{ color: '#6b7280', fontSize: 15 }}>Loading…</div>
      </div>
    }>
      <RegisterContent />
    </Suspense>
  );
}
