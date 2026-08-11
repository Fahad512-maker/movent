'use client';

export default function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeMap = { sm: '16px', md: '24px', lg: '40px' };
  return (
    <div
      className="spinner-border text-primary"
      style={{ width: sizeMap[size], height: sizeMap[size] }}
      role="status"
    >
      <span className="visually-hidden">Loading...</span>
    </div>
  );
}
