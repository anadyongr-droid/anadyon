export function CarDoorIcon({ size = 15, className = "" }: { size?: number; className?: string }) {
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
      {/* Outer door shape: rounded left/bottom, diagonal top-right (window frame), curved sill bottom-right */}
      <path d="M4 21 L4 4 Q4 2 6 2 L14 2 L20 8 L20 17 Q17 21 14 21 Z" />
      {/* Window divider */}
      <line x1="4" y1="11" x2="20" y2="11" />
      {/* Door handle */}
      <rect x="6" y="14.5" width="5" height="2" rx="1" />
    </svg>
  );
}
