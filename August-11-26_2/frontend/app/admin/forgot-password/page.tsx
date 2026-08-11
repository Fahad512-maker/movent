import { redirect } from 'next/navigation';

// Company Admin now requests a password reset from the unified
// /forgot-password page — this route stays only so old bookmarks/links
// keep working.
export default function AdminForgotPasswordPage() {
  redirect('/forgot-password');
}
