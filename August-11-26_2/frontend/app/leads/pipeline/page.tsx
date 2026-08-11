'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { adminLeadService, userLeadService, Lead } from '@/lib/services/adminLeadService';
import { getAuthType, getAuthUser, can } from '@/lib/auth';
import { Admin } from '@/types';
import { HiCurrencyDollar, HiUserCircle } from 'react-icons/hi2';

const STAGES = [
  { key: 'new',         label: 'New',         color: '#2563eb', bg: '#eff6ff' },
  { key: 'contacted',   label: 'Contacted',   color: '#16a34a', bg: '#f0fdf4' },
  { key: 'qualified',   label: 'Qualified',   color: '#7c3aed', bg: '#f5f3ff' },
  { key: 'proposal',    label: 'Proposal',    color: '#ea580c', bg: '#fff7ed' },
  { key: 'negotiation', label: 'Negotiation', color: '#d97706', bg: '#fffbeb' },
];

const PRIORITY_DOT: Record<string, string> = {
  low: '#94a3b8', medium: '#d97706', high: '#dc2626', urgent: '#7f1d1d',
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const PKR = (n: number) => n > 0 ? '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : null;

export default function PipelinePage() {
  const router   = useRouter();
  const isAdmin  = getAuthType() === 'admin';

  useEffect(() => {
    if (!isAdmin) {
      if (!can('sales', 'canManagePipeline') && !can('sales', 'canViewLeads')) {
        router.replace('/dashboard');
      }
    } else {
      const admin = getAuthUser() as Admin | null;
      if (admin?.modules?.length && !admin.modules.includes('leads')) router.replace('/admin/dashboard');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const canDrag = isAdmin || can('sales', 'canManagePipeline');
  const svc     = isAdmin ? adminLeadService : userLeadService;

  const [leads, setLeads]       = useState<Lead[]>([]);
  const [loading, setLoading]   = useState(true);
  const [dragging, setDragging] = useState<number | null>(null);

  useEffect(() => {
    svc.pipeline().then(setLeads).finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const grouped = STAGES.reduce<Record<string, Lead[]>>((acc, s) => {
    acc[s.key] = leads.filter(l => l.status === s.key);
    return acc;
  }, {});

  const handleDragStart = (e: React.DragEvent, leadId: number) => {
    if (!canDrag) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('leadId', String(leadId));
    setDragging(leadId);
  };

  const handleDragOver = (e: React.DragEvent) => { if (canDrag) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } };

  const handleDrop = async (e: React.DragEvent, targetStage: string) => {
    if (!canDrag) return;
    e.preventDefault();
    const leadId = Number(e.dataTransfer.getData('leadId'));
    if (!leadId) return;
    const lead = leads.find(l => l.id === leadId);
    if (!lead || lead.status === targetStage) { setDragging(null); return; }

    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: targetStage as Lead['status'] } : l));
    setDragging(null);
    try {
      await svc.updateStatus(leadId, targetStage);
    } catch {
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: lead.status } : l));
    }
  };

  const stageValue = (stage: string) => leads.filter(l => l.status === stage).reduce((sum, l) => sum + l.estimated_value, 0);
  const leadRoot   = isAdmin ? '/admin/leads' : '/leads';

  if (loading) return <DashboardLayout title="Pipeline"><div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Loading…</div></DashboardLayout>;

  return (
    <DashboardLayout title="Sales Pipeline">
      <div>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a' }}>Sales Pipeline</h2>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>{canDrag ? 'Drag cards between columns to update status' : 'View active deals in your pipeline'}</p>
        </div>

        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 16 }}>
          {STAGES.map(stage => {
            const stageLeads = grouped[stage.key] ?? [];
            const val = stageValue(stage.key);
            return (
              <div key={stage.key}
                onDragOver={handleDragOver}
                onDrop={e => handleDrop(e, stage.key)}
                style={{ width: 240, flexShrink: 0 }}>
                <div style={{ padding: '10px 14px', background: stage.bg, borderRadius: '10px 10px 0 0', border: `1px solid ${stage.color}25`, borderBottom: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: stage.color }}>{stage.label}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                      {stageLeads.length} lead{stageLeads.length !== 1 ? 's' : ''}{val > 0 ? ` · ${PKR(val)}` : ''}
                    </div>
                  </div>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: stage.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                    {stageLeads.length}
                  </div>
                </div>
                <div style={{ minHeight: 120, padding: 8, background: '#f8fafc', border: `1px solid ${stage.color}18`, borderTop: 'none', borderRadius: '0 0 10px 10px' }}>
                  {stageLeads.map(lead => (
                    <div key={lead.id}
                      draggable={canDrag}
                      onDragStart={e => handleDragStart(e, lead.id)}
                      onDragEnd={() => setDragging(null)}
                      onClick={() => router.push(`${leadRoot}/${lead.id}`)}
                      style={{
                        background: '#fff', borderRadius: 10, padding: '12px 14px', marginBottom: 8,
                        border: `1px solid ${dragging === lead.id ? stage.color : '#e2e8f0'}`,
                        boxShadow: dragging === lead.id ? `0 4px 12px ${stage.color}30` : '0 1px 3px rgba(0,0,0,0.04)',
                        cursor: canDrag ? 'grab' : 'pointer', opacity: dragging === lead.id ? 0.6 : 1,
                      }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6, marginBottom: 6 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', lineHeight: 1.3 }}>{lead.name}</div>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_DOT[lead.priority] ?? '#94a3b8', flexShrink: 0, marginTop: 4 }} title={cap(lead.priority)} />
                      </div>
                      {lead.company_name && <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>{lead.company_name}</div>}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        {lead.estimated_value > 0 && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#059669', fontWeight: 600 }}>
                            <HiCurrencyDollar size={12} /> {PKR(lead.estimated_value)}
                          </span>
                        )}
                        {lead.assigned_user && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#64748b' }}>
                            <HiUserCircle size={12} /> {lead.assigned_user.name}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {stageLeads.length === 0 && (
                    <div style={{ padding: '20px 0', textAlign: 'center', color: '#cbd5e1', fontSize: 12 }}>{canDrag ? 'Drop here' : 'Empty'}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
