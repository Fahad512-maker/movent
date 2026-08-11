import { redirect } from 'next/navigation';

// Company Admin now logs in from the unified /login page — this route stays
// only so old bookmarks/links keep working.
export default function AdminLoginPage() {
  redirect('/login');
}
