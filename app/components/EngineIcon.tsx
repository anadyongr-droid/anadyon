interface Props {
  size?: number;
  className?: string;
}

export function EngineIcon({ size = 16, className = "" }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Left cylinder — attached at (33,56), rotated -40° (leans left) */}
      <g transform="translate(33,56) rotate(-40)">
        <rect x="-10" y="-50" width="20" height="9" rx="2" fill="currentColor" stroke="none" />
        <rect x="-10" y="-41" width="20" height="41" rx="1" strokeWidth="3.5" />
        <line x1="-10" y1="-34" x2="10" y2="-34" />
        <line x1="-10" y1="-27" x2="10" y2="-27" />
        <line x1="-10" y1="-20" x2="10" y2="-20" />
        <line x1="-10" y1="-13" x2="10" y2="-13" />
        <line x1="-10" y1="-6"  x2="10" y2="-6"  />
      </g>

      {/* Right cylinder — attached at (67,56), rotated +40° (leans right) */}
      <g transform="translate(67,56) rotate(40)">
        <rect x="-10" y="-50" width="20" height="9" rx="2" fill="currentColor" stroke="none" />
        <rect x="-10" y="-41" width="20" height="41" rx="1" strokeWidth="3.5" />
        <line x1="-10" y1="-34" x2="10" y2="-34" />
        <line x1="-10" y1="-27" x2="10" y2="-27" />
        <line x1="-10" y1="-20" x2="10" y2="-20" />
        <line x1="-10" y1="-13" x2="10" y2="-13" />
        <line x1="-10" y1="-6"  x2="10" y2="-6"  />
      </g>

      {/* Crankcase */}
      <rect x="18" y="56" width="64" height="36" rx="5" strokeWidth="3.5" />

      {/* Crankshaft circle */}
      <circle cx="50" cy="74" r="11" strokeWidth="3.5" />
      <circle cx="50" cy="74" r="4" fill="currentColor" stroke="none" />

      {/* Side protrusions */}
      <rect x="5"  y="63" width="13" height="9" rx="2" strokeWidth="3" />
      <rect x="82" y="63" width="13" height="9" rx="2" strokeWidth="3" />
    </svg>
  );
}
