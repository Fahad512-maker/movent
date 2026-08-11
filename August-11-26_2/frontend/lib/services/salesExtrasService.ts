import api from '@/lib/axios';

export interface SalesTarget {
  period_start: string;
  period_end: string;
  target_value: number | null;
  target_deals: number | null;
  achieved_value: number;
  achieved_deals: number;
  can_update: boolean;
}

export interface LeadReport {
  by_status: Record<string, { status: string; count: number; value: number }>;
  by_source: Record<string, number>;
  total: number;
}

export interface ConversionReport {
  monthly: { month: number; total: number; won: number; lost: number }[];
  overall_win_rate: number;
  year: number;
}

export interface PerformanceReport {
  leads: { total: number; won: number; lost: number; won_value: number };
  invoices?: { created_from_sales: number; sent_from_sales: number; paid_from_sales: number; total_value: number; total_paid: number };
  projects?: { linked_from_leads: number };
}

export const salesTargetService = {
  get: async (): Promise<SalesTarget> => (await api.get('/user/sales/targets')).data.data,
  update: async (payload: { target_value?: number | null; target_deals?: number | null }): Promise<void> => {
    await api.put('/user/sales/targets', payload);
  },
};

export const salesReportService = {
  leadReport: async (): Promise<LeadReport> => (await api.get('/user/sales/reports/leads')).data.data,
  conversionReport: async (year?: number): Promise<ConversionReport> =>
    (await api.get('/user/sales/reports/conversion', { params: year ? { year } : {} })).data.data,
  performanceReport: async (): Promise<PerformanceReport> => (await api.get('/user/sales/reports/performance')).data.data,
  downloadLeadsCsv: async (): Promise<void> => {
    const res = await api.get('/user/sales/reports/leads/export', { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sales-leads-report.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};
