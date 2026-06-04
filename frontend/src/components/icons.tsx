type IconProps = {
  size?: number;
  color?: string;
};

export function Mic({ size = 17, color }: IconProps) {
  const stroke = color ?? "currentColor";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 17 17"
      fill="none"
      stroke={stroke}
      strokeWidth="1.3"
      className="block"
    >
      <rect
        x="5.5"
        y="2"
        width="6"
        height="9"
        rx="3"
        fill="rgba(26,25,23,0.08)"
        stroke={stroke}
      />
      <path d="M2.5 8.5C2.5 11.8 5.2 14.5 8.5 14.5s6-2.7 6-6" strokeLinecap="round" />
      <line x1="8.5" y1="14.5" x2="8.5" y2="17" strokeLinecap="round" />
    </svg>
  );
}

export function Phone({ size = 22, color = "#fff" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="block">
      <path
        d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"
        fill={color}
      />
    </svg>
  );
}

export function Camera({ size = 17 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 17 17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      className="block"
    >
      <rect
        x="1.5"
        y="5"
        width="14"
        height="10"
        rx="2"
        fill="rgba(26,25,23,0.08)"
        stroke="currentColor"
      />
      <circle cx="8.5" cy="10" r="2.8" stroke="currentColor" />
      <path d="M6 5l1-2.5h3L11 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MenuBars({ open }: { open: boolean }) {
  return (
    <div className="flex flex-col items-center gap-[2.5px]">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-[1.5px] w-2.5 rounded-[1px]"
          style={{
            background: open ? "var(--laed-paper)" : "var(--laed-muted)",
          }}
        />
      ))}
    </div>
  );
}

export function GridIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="1" y="1" width="5" height="5" rx="1" />
      <rect x="8" y="1" width="5" height="5" rx="1" />
      <rect x="1" y="8" width="5" height="5" rx="1" />
      <rect x="8" y="8" width="5" height="5" rx="1" />
    </svg>
  );
}

export function ArtifactIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M2 11V3l5-1.5L12 3v8l-5 1.5L2 11z" />
      <line x1="7" y1="1.5" x2="7" y2="12.5" />
    </svg>
  );
}

export function ArchiveIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M2 12V4l10-2v10" />
      <rect x="5" y="8" width="4" height="4" />
    </svg>
  );
}

export function PersonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
      <circle cx="7" cy="5" r="2.5" />
      <path d="M2 13c0-2.8 2.2-5 5-5s5 2.2 5 5" />
    </svg>
  );
}

export function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
      <circle cx="7" cy="7" r="2" />
      <path d="M7 1v2M7 11v2M1 7h2M11 7h2M2.9 2.9l1.4 1.4M9.7 9.7l1.4 1.4M2.9 11.1l1.4-1.4M9.7 4.3l1.4-1.4" />
    </svg>
  );
}
