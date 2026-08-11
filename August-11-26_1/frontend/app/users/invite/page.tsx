'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function InviteRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/users/new'); }, [router]);
  return null;
}
