'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAuthType, getAuthUser } from '@/lib/auth';
import { Admin } from '@/types';

/**
 * Redirects to /admin/dashboard if the authenticated admin's company
 * does not have the required module enabled.
 *
 * Call at the top of any admin page that belongs to a specific module:
 *   useModuleGuard('leads');
 */
export function useModuleGuard(moduleKey: string | string[]) {
  const router = useRouter();

  useEffect(() => {
    if (getAuthType() !== 'admin') return;
    const admin = getAuthUser() as Admin | null;
    const modules: string[] = admin?.modules ?? [];
    if (modules.length === 0) return;
    const required = Array.isArray(moduleKey) ? moduleKey : [moduleKey];
    if (!required.some(k => modules.includes(k))) {
      router.replace('/admin/dashboard');
    }
  }, [moduleKey, router]);
}
