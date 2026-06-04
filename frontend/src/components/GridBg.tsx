type Props = {
  id?: string;
  className?: string;
};

export function GridBg({ id = "laed-grid", className = "" }: Props) {
  return (
    <svg
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      aria-hidden
    >
      <defs>
        <pattern id={id} width="40" height="40" patternUnits="userSpaceOnUse">
          <path
            d="M40 0L0 0 0 40"
            fill="none"
            stroke="rgba(26,25,23,0.06)"
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
