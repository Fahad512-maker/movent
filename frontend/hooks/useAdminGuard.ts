'use client';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getAuthType } from '@/lib/auth';

export function useAdminGuard() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (getAuthType() === 'admin' && !pathname.startsWith('/admin')) {
      router.replace('/admin' + pathname);
    }
  }, [pathname, router]);
}
