export function GearStickIcon({ size = 15, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Top 3 gear position circles */}
      <circle cx="4" cy="4" r="2.5" />
      <circle cx="12" cy="4" r="2.5" />
      <circle cx="20" cy="4" r="2.5" />

      {/* Left stem drops then goes right to join center */}
      <polyline points="4,6.5 4,11 12,11" />

      {/* Center stem full height */}
      <line x1="12" y1="6.5" x2="12" y2="17.5" />

      {/* Right stem full height */}
      <line x1="20" y1="6.5" x2="20" y2="17.5" />

      {/* Crossbar between center and right */}
      <line x1="12" y1="11" x2="20" y2="11" />

      {/* Bottom 2 gear position circles */}
      <circle cx="12" cy="20" r="2.5" />
      <circle cx="20" cy="20" r="2.5" />
    </svg>
  );
}
