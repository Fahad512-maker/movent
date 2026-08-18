'use client';
import React from 'react';
import Spinner from './Spinner';

// Reusable Create/Save/Submit button — every create form in the app should
// use this instead of hand-rolling its own disabled+text-swap button, so the
// loading spinner, disabled-while-submitting guard, and "Creating X…" text
// stay consistent everywhere rather than copy-pasted per page.
//
// The caller still owns its own `saving`/`creating` state and try/catch/
// finally around the API call (see e.g. frontend/app/leads/new/page.tsx) —
// this component is purely the button's presentation, not a data-fetching
// wrapper, so it never interferes with existing API logic or validation.
interface SubmitButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  loading: boolean;
  loadingText: string;
  children: React.ReactNode;
  spinnerSize?: number;
}

export default function SubmitButton({
  loading,
  loadingText,
  children,
  spinnerSize = 14,
  disabled,
  style,
  type = 'submit',
  ...rest
}: SubmitButtonProps) {
  const isDisabled = loading || !!disabled;

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
      {...rest}
    >
      {loading && <Spinner size={spinnerSize} />}
      {loading ? loadingText : children}
    </button>
  );
}
