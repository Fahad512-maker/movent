// HR-specific status color maps only — generic primitives (inp/lbl/card/
// Badge/StatCard/fmtDate) are reused directly from
// @/components/admin/projects/shared, which are generic UI helpers not
// actually specific to Project Management despite their current location.

export const EMPLOYEE_STATUS_SC: Record<string, { bg: string; color: string }> = {
  active:     { bg: '#ecfdf5', color: '#059669' },
  on_leave:   { bg: '#fffbeb', color: '#d97706' },
  terminated: { bg: '#fef2f2', color: '#dc2626' },
};

export const ATTENDANCE_SC: Record<string, { bg: string; color: string }> = {
  present:  { bg: '#ecfdf5', color: '#059669' },
  absent:   { bg: '#fef2f2', color: '#dc2626' },
  late:     { bg: '#fffbeb', color: '#d97706' },
  half_day: { bg: '#eff6ff', color: '#2563eb' },
  holiday:  { bg: '#f1f5f9', color: '#64748b' },
};

export const LEAVE_SC: Record<string, { bg: string; color: string }> = {
  pending:  { bg: '#fffbeb', color: '#d97706' },
  approved: { bg: '#ecfdf5', color: '#059669' },
  rejected: { bg: '#fef2f2', color: '#dc2626' },
};

export const PAYROLL_SC: Record<string, { bg: string; color: string }> = {
  draft:     { bg: '#f1f5f9', color: '#64748b' },
  processed: { bg: '#eff6ff', color: '#2563eb' },
  paid:      { bg: '#ecfdf5', color: '#059669' },
};

export const RECRUITMENT_SC: Record<string, { bg: string; color: string }> = {
  open:    { bg: '#ecfdf5', color: '#059669' },
  on_hold: { bg: '#fffbeb', color: '#d97706' },
  closed:  { bg: '#f1f5f9', color: '#64748b' },
};

export const APPLICANT_SC: Record<string, { bg: string; color: string }> = {
  applied:     { bg: '#eff6ff', color: '#2563eb' },
  shortlisted: { bg: '#f5f3ff', color: '#7c3aed' },
  interviewed: { bg: '#fffbeb', color: '#d97706' },
  hired:       { bg: '#ecfdf5', color: '#059669' },
  rejected:    { bg: '#fef2f2', color: '#dc2626' },
};
