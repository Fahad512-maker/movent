import type { Metadata } from 'next';
import { ToastProvider } from './providers';
import 'bootstrap/dist/css/bootstrap.min.css';
import '@/styles/globals.css';
import '@/app/globals1.css';


export const metadata: Metadata = {
  title: 'Movent',
  description: 'Complete Movent Solution',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        {children}
        <ToastProvider />
      </body>
    </html>
  );
}
