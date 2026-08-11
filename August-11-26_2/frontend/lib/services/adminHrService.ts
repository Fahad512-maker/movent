import api from '@/lib/axios';

export type EmployeeStatus = 'active' | 'on_leave' | 'terminated';
export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'intern';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'half_day' | 'holiday';
export type LeaveType = 'annual' | 'sick' | 'casual' | 'maternity' | 'unpaid';
export type LeaveStatus = 'pending' | 'approved' | 'rejected';
export type PayrollStatus = 'draft' | 'processed' | 'paid';
export type RecruitmentStatus = 'open' | 'closed' | 'on_hold';
export type ApplicantStatus = 'applied' | 'shortlisted' | 'interviewed' | 'hired' | 'rejected';

export interface Employee {
  id: number;
  company_id: number;
  user_id: number | null;
  employee_code: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  designation: string | null;
  employment_type: EmploymentType;
  salary: number | null;
  join_date: string | null;
  status: EmployeeStatus;
  created_at: string;
  attendances?: Attendance[];
  leave_requests?: LeaveRequestRecord[];
  payrolls?: Payroll[];
  notes?: EmployeeNote[];
  documents?: EmployeeDocument[];
  user?: { id: number; name: string; email: string } | null;
}

export interface EmployeePayload {
  company_id?: number;
  user_id?: number | null;
  employee_code?: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  department?: string | null;
  designation?: string | null;
  employment_type?: EmploymentType;
  salary?: number | null;
  join_date?: string | null;
  status?: EmployeeStatus;
}

export interface Attendance {
  id: number;
  employee_id: number;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: AttendanceStatus;
  notes: string | null;
  employee?: { id: number; name: string; employee_code: string | null; department?: string | null };
}

export interface LeaveRequestRecord {
  id: number;
  employee_id: number;
  leave_type: LeaveType;
  from_date: string;
  to_date: string;
  total_days: number | null;
  reason: string | null;
  status: LeaveStatus;
  employee?: { id: number; name: string; employee_code?: string | null; department?: string | null };
}

export interface Payroll {
  id: number;
  employee_id: number;
  month_year: string;
  basic_salary: number;
  allowances: number;
  deductions: number;
  net_pay: number;
  status: PayrollStatus;
  paid_at: string | null;
  employee?: { id: number; name: string; employee_code?: string | null; department?: string | null; company?: { id: number; name: string } };
}

export interface Recruitment {
  id: number;
  company_id: number;
  position: string;
  department: string | null;
  openings: number;
  description: string | null;
  status: RecruitmentStatus;
  applicants_count?: number;
  applicants?: JobApplicant[];
}

export interface JobApplicant {
  id: number;
  recruitment_id: number;
  name: string;
  email: string | null;
  phone: string | null;
  resume_path: string | null;
  status: ApplicantStatus;
  notes: string | null;
}

export interface EmployeeNote {
  id: number;
  employee_id: number;
  body: string;
  created_at: string;
  author_admin?: { id: number; name: string } | null;
}

export interface EmployeeDocument {
  id: number;
  title: string;
  file_name: string | null;
  file_size_bytes: number | null;
  created_at: string;
}

export interface HrDashboardStats {
  total_employees: number;
  active_employees: number;
  on_leave_employees: number;
  terminated_employees: number;
  pending_leave_requests: number;
  attendance_today: { present: number; absent: number; late: number };
  open_recruitment_postings: number;
  payroll_pending: number;
}

export const adminHrService = {
  dashboard: async (): Promise<HrDashboardStats> => (await api.get('/admin/hr/dashboard')).data.data,

  reports: {
    headcount: async (): Promise<Record<string, number>> => (await api.get('/admin/hr/reports/headcount')).data.data,
    attendanceSummary: async (params?: Record<string, string>): Promise<Record<string, number>> =>
      (await api.get('/admin/hr/reports/attendance-summary', { params })).data.data,
    leaveSummary: async (): Promise<{ by_status: Record<string, number>; by_type: Record<string, number> }> =>
      (await api.get('/admin/hr/reports/leave-summary')).data.data,
  },

  employees: {
    list: async (params?: Record<string, string>): Promise<Employee[]> => (await api.get('/admin/employees', { params })).data.data,
    getOne: async (id: number): Promise<Employee> => (await api.get(`/admin/employees/${id}`)).data.data,
    create: async (payload: EmployeePayload): Promise<Employee> => (await api.post('/admin/employees', payload)).data.data,
    update: async (id: number, payload: Partial<EmployeePayload>): Promise<Employee> => (await api.put(`/admin/employees/${id}`, payload)).data.data,
    remove: async (id: number): Promise<void> => { await api.delete(`/admin/employees/${id}`); },

    documents: {
      list: async (employeeId: number): Promise<EmployeeDocument[]> => (await api.get(`/admin/employees/${employeeId}/documents`)).data.data,
      upload: async (employeeId: number, file: File, title: string): Promise<EmployeeDocument> => {
        const form = new FormData();
        form.append('file', file);
        form.append('title', title);
        return (await api.post(`/admin/employees/${employeeId}/documents`, form, { headers: { 'Content-Type': 'multipart/form-data' } })).data.data;
      },
      remove: async (employeeId: number, documentId: number): Promise<void> => {
        await api.delete(`/admin/employees/${employeeId}/documents/${documentId}`);
      },
    },

    notes: {
      list: async (employeeId: number): Promise<EmployeeNote[]> => (await api.get(`/admin/employees/${employeeId}/notes`)).data.data,
      add: async (employeeId: number, body: string): Promise<EmployeeNote> => (await api.post(`/admin/employees/${employeeId}/notes`, { body })).data.data,
    },
  },

  attendance: {
    list: async (params?: Record<string, string>): Promise<Attendance[]> => (await api.get('/admin/attendance', { params })).data.data,
    mark: async (payload: { employee_id: number; date: string; status: AttendanceStatus; notes?: string }): Promise<Attendance> =>
      (await api.post('/admin/attendance/mark', payload)).data.data,
    bulkMark: async (date: string, entries: { employee_id: number; status: AttendanceStatus }[]): Promise<Attendance[]> =>
      (await api.post('/admin/attendance/bulk-mark', { date, entries })).data.data,
  },

  leaves: {
    list: async (params?: Record<string, string>): Promise<LeaveRequestRecord[]> => (await api.get('/admin/leaves', { params })).data.data,
    create: async (payload: { employee_id: number; leave_type: LeaveType; from_date: string; to_date: string; reason?: string }): Promise<LeaveRequestRecord> =>
      (await api.post('/admin/leaves', payload)).data.data,
    updateStatus: async (id: number, status: 'approved' | 'rejected'): Promise<LeaveRequestRecord> =>
      (await api.patch(`/admin/leaves/${id}/status`, { status })).data.data,
  },

  payroll: {
    list: async (params?: Record<string, string>): Promise<Payroll[]> => (await api.get('/admin/payroll', { params })).data.data,
    create: async (payload: { employee_id: number; month_year: string; basic_salary: number; allowances?: number; deductions?: number }): Promise<Payroll> =>
      (await api.post('/admin/payroll', payload)).data.data,
    process: async (id: number): Promise<Payroll> => (await api.patch(`/admin/payroll/${id}/process`)).data.data,
    markPaid: async (id: number): Promise<Payroll> => (await api.patch(`/admin/payroll/${id}/mark-paid`)).data.data,
    payslip: async (id: number): Promise<Payroll> => (await api.get(`/admin/payroll/${id}/payslip`)).data.data,
  },

  recruitment: {
    list: async (params?: Record<string, string>): Promise<Recruitment[]> => (await api.get('/admin/recruitment', { params })).data.data,
    create: async (payload: { company_id: number; position: string; department?: string; openings?: number; description?: string }): Promise<Recruitment> =>
      (await api.post('/admin/recruitment', payload)).data.data,
    getOne: async (id: number): Promise<Recruitment> => (await api.get(`/admin/recruitment/${id}`)).data.data,
    update: async (id: number, payload: Partial<{ position: string; department: string; openings: number; description: string; status: RecruitmentStatus }>): Promise<Recruitment> =>
      (await api.put(`/admin/recruitment/${id}`, payload)).data.data,
    remove: async (id: number): Promise<void> => { await api.delete(`/admin/recruitment/${id}`); },

    addApplicant: async (recruitmentId: number, payload: { name: string; email?: string; phone?: string; notes?: string }): Promise<JobApplicant> =>
      (await api.post(`/admin/recruitment/${recruitmentId}/applicants`, payload)).data.data,
    updateApplicantStatus: async (recruitmentId: number, applicantId: number, status: ApplicantStatus): Promise<JobApplicant> =>
      (await api.patch(`/admin/recruitment/${recruitmentId}/applicants/${applicantId}/status`, { status })).data.data,
  },
};
