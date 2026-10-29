/**
 * The dial and bars glyphs, in one place.
 *
 * Three controls draw the same pair — a pedal's own style toggle, the board
 * bar's "every pedal" buttons, and the phone's tab bar — and they have to be
 * recognisably the same mark in all three, or the user has to learn the idea
 * twice. Stroked with currentColor so each caller sets the colour.
 */

interface StyleIconProps {
  /** Rendered size in px; the glyphs are drawn on a 24px grid. */
  size?: number;
  className?: string;
}

export function DialIcon({ size = 16, className }: StyleIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 5v3" />
    </svg>
  );
}

export function BarsIcon({ size = 16, className }: StyleIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M4 19V10" />
      <path d="M10 19V5" />
      <path d="M16 19v-6" />
      <path d="M22 19V8" />
    </svg>
  );
}
