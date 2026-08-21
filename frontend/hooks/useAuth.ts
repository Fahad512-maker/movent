'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/axios';
import { setAuthData, setActiveCompany, clearActiveCompany, resolveStaffRedirect, logout as clearAuth } from '@/lib/auth';
import { User, Admin } from '@/types';
import toast from 'react-hot-toast';

export const useAuth = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  // Set when login() fails specifically because the matched CompanyAdmin
  // account is stuck in pending_payment (AdminAuthController::
  // tryCredentials()'s deliberate block) — lets the login screen offer a
  // "Complete Payment" action instead of just a toast.
  const [paymentRequired, setPaymentRequired] = useState(false);

  // Shared request runner for the unified /login flow — password and Google
  // both land here. The backend (Auth\UnifiedLoginController /
  // GoogleAuthController) has already decided whether the credentials
  // matched a CompanyAdmin or a User; the response's `type` field says which.
  // Deliberately NOT used by superAdminLogin (kept fully separate).
  const performRequest = async (
    endpoint: string,
    payload: Record<string, unknown>,
    onSuccess: (result: { type: 'admin' | 'user'; token: string; admin?: Admin; user?: User }) => void,
    opts: {
      clearErrors?: boolean;
      setFieldErrors?: boolean;
      defaultErrorMessage?: string;
      onError?: (responseErrors: Record<string, unknown> | undefined) => boolean;
    } = {}
  ) => {
    setLoading(true);
    if (opts.clearErrors) setErrors({});
    try {
      const res = await api.post(endpoint, payload);
      if (res.data.success) onSuccess(res.data.data);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string; errors?: Record<string, unknown> } } };
      toast.error(axiosErr.response?.data?.message || opts.defaultErrorMessage || 'Login failed');
      const responseErrors = axiosErr.response?.data?.errors;
      const handled = opts.onError?.(responseErrors) ?? false;
      if (opts.setFieldErrors && !handled) setErrors((responseErrors as Record<string, string[]>) || {});
    } finally {
      setLoading(false);
    }
  };

  // Shared by password login and Google login so both produce an identical
  // authenticated session (cookies + single/multi-company branching).
  const applyUserLoginSuccess = (token: string, user: User) => {
    setAuthData(token, user, 'user');
    toast.success('Welcome back!');
    // Rule 9: if user belongs to multiple ACTIVE companies, show company
    // picker. Filtered to active-only so a suspended-only assignment never
    // gets auto-selected as the active company, and zero active assignments
    // falls straight through to '/dashboard', where DashboardLayout's own
    // active-only check shows the "not assigned to any company" empty state.
    const assignments = (user?.company_assignments ?? []).filter(a => a.status === 'active');
    if (assignments.length > 1) {
      clearActiveCompany();
      router.push('/select-company');
    } else {
      const active = assignments[0];
      if (active) setActiveCompany(active.company_id);
      router.push(resolveStaffRedirect(active));
    }
  };

  // Shared by password login and Google login so both produce an identical
  // authenticated admin session.
  const applyAdminLoginSuccess = (token: string, admin: Admin) => {
    setAuthData(token, admin, 'admin');
    toast.success('Welcome back!');
    router.push('/admin/dashboard');
  };

  // Dispatches to the right apply*Success based on which account type the
  // backend actually matched — the one place that knows about both.
  const applyUnifiedLoginSuccess = (result: { type: 'admin' | 'user'; token: string; admin?: Admin; user?: User }) => {
    if (result.type === 'admin' && result.admin) applyAdminLoginSuccess(result.token, result.admin);
    else if (result.user) applyUserLoginSuccess(result.token, result.user);
  };

  const login = (email: string, password: string) => {
    setPaymentRequired(false);
    return performRequest('/login', { email, password }, applyUnifiedLoginSuccess, {
      clearErrors: true,
      setFieldErrors: true,
      onError: (responseErrors) => {
        if (responseErrors?.error_code === 'payment_required') {
          setPaymentRequired(true);
          return true;
        }
        return false;
      },
    });
  };

  const exchangeGoogleCode = (code: string) =>
    performRequest('/user/auth/google/exchange', { code }, applyUnifiedLoginSuccess, {
      defaultErrorMessage: 'Google sign-in failed. Please try again.',
    });

  // "Complete Payment" action on the login screen for a pending_payment
  // account — re-verifies the same credentials and, on success, drops the
  // user straight onto /payment with a token scoped to only that flow (see
  // routes/api.php's 'subscription.active' middleware for the actual gate).
  const resumePayment = async (email: string, password: string) => {
    setLoading(true);
    try {
      const res = await api.post('/public/resume-payment', { email, password });
      if (res.data.success) {
        setAuthData(res.data.data.token, res.data.data.admin, 'admin');
        toast.success('Please complete your payment to activate your account.');
        router.push('/payment');
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      toast.error(axiosErr.response?.data?.message || 'Failed to resume payment');
    } finally {
      setLoading(false);
    }
  };

  const superAdminLogin = async (email: string, password: string) => {
    setLoading(true);
    setErrors({});
    try {
      const res = await api.post('/super-admin/login', { email, password });
      if (res.data.success) {
        setAuthData(res.data.data.token, res.data.data.super_admin, 'super_admin');
        toast.success('Welcome, Super Admin!');
        router.push('/super-admin/dashboard');
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } };
      toast.error(axiosErr.response?.data?.message || 'Login failed');
      setErrors(axiosErr.response?.data?.errors || {});
    } finally {
      setLoading(false);
    }
  };

  const logoutUser = async (type: 'user' | 'admin' | 'super_admin' = 'user') => {
    try {
      const endpoints: Record<string, string> = {
        admin:       '/admin/logout',
        super_admin: '/super-admin/logout',
        user:        '/user/logout',
      };
      await api.post(endpoints[type] ?? '/user/logout');
    } catch {
      // ignore network errors on logout
    }
    clearAuth();
    const redirects: Record<string, string> = {
      admin:       '/login',
      super_admin: '/super-admin/login',
      user:        '/login',
    };
    router.push(redirects[type] ?? '/login');
  };

  return { login, superAdminLogin, exchangeGoogleCode, logoutUser, resumePayment, loading, errors, paymentRequired };
};
