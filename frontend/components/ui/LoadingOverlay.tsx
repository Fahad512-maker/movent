'use client';
import Spinner from './Spinner';

// Full-screen, Movent-branded lock overlay — shown over the whole page while
// a create/submit request is in flight, so the user can't interact with
// anything underneath (double-click a different button, navigate away, edit
// the form) until the API call resolves. Pairs with SubmitButton, which
// already owns the same `loading` flag — this just makes the wait visible
// beyond the button itself.
export default function LoadingOverlay({
  show,
  message = 'Please wait…',
}: {
  show: boolean;
  message?: string;
}) {
  if (!show) return null;

  return (
    <div
      role="alert"
      aria-busy="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 4000,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 16,
          padding: '30px 40px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          minWidth: 220,
        }}
      >
        <Spinner size={38} color="#2563eb" thickness={3} />
        <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.2px' }}>Movent</div>
        <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500, textAlign: 'center' }}>{message}</div>
      </div>
    </div>
  );
}
