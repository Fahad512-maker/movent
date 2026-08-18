'use client';

// Branded loading spinner — used inside SubmitButton (and standalone, if a
// page needs to show one outside a button). Defaults to `currentColor` so it
// automatically matches whatever text color the button already uses (white
// on a blue gradient button, blue on a light/outline button) with no color
// prop needed in the common case.
export default function Spinner({
  size = 14,
  color = 'currentColor',
  thickness = 2,
}: {
  size?: number;
  color?: string;
  thickness?: number;
}) {
  return (
    <span
      role="status"
      aria-label="Loading"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        border: `${thickness}px solid ${color}`,
        borderTopColor: 'transparent',
        borderRadius: '50%',
        opacity: 0.85,
        animation: 'movent-spin 0.7s linear infinite',
        flexShrink: 0,
      }}
    />
  );
}
