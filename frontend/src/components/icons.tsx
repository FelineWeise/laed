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

export function Send({ size = 16, color = "#fff" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      className="block"
    >
      <path d="M22 2L11 13" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 2L15 22L11 13L2 9L22 2Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ExpandIcon({ size = 14, color = "currentColor" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
      <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MessageCircle({ size = 22, color = "#fff" }: IconProps) {
  const stroke = color;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="1.8"
      className="block"
    >
      <path
        d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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

export function CaptureGlyph({ size = 20, color }: IconProps) {
  const stroke = color ?? "currentColor";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="block"
    >
      <path d="M4 8.5V6.5a2.5 2.5 0 0 1 2.5-2.5h2" />
      <path d="M15.5 4h2A2.5 2.5 0 0 1 20 6.5v2" />
      <path d="M20 15.5v2a2.5 2.5 0 0 1-2.5 2.5h-2" />
      <path d="M8.5 20h-2A2.5 2.5 0 0 1 4 17.5v-2" />
      <circle cx="12" cy="12" r="3" fill={stroke} stroke="none" />
    </svg>
  );
}

export function Sparkle({ size = 18, color }: IconProps) {
  const stroke = color ?? "currentColor";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="block"
    >
      <path d="M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6z" />
      <path d="M18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
    </svg>
  );
}

export function Lock({ size = 14, color }: IconProps) {
  const stroke = color ?? "currentColor";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="block"
    >
      <rect x="5" y="11" width="14" height="9" rx="2.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function Folder({ size = 18, color }: IconProps) {
  const stroke = color ?? "currentColor";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="block"
    >
      <path d="M3 7.5a2 2 0 0 1 2-2h3.6a2 2 0 0 1 1.5.7l1 1.1H19a2 2 0 0 1 2 2v6.7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

export function Person({ size = 18, color }: IconProps) {
  const stroke = color ?? "currentColor";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="1.5"
      className="block"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" strokeLinecap="round" />
    </svg>
  );
}

export function Check({ size = 16, color }: IconProps) {
  const stroke = color ?? "currentColor";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="block"
    >
      <path d="M5 12.5l4.2 4.2L19 7" />
    </svg>
  );
}

export function SendArrow({ size = 16, color = "#fff" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="block"
    >
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  );
}

export function ShareToProjectIcon({ size = 14, color }: IconProps) {
  const stroke = color ?? "currentColor";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="block"
    >
      <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
      <path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
    </svg>
  );
}

export function EyeIcon({ size = 18, color }: IconProps) {
  const stroke = color ?? "currentColor";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="block"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function EyeOffIcon({ size = 18, color }: IconProps) {
  const stroke = color ?? "currentColor";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="block"
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
      <path d="M9.9 5.1A9.8 9.8 0 0 1 12 5c5 0 9.3 3.1 11 7-.6 1.4-1.5 2.7-2.6 3.7" />
      <path d="M6.1 6.1C4.2 7.4 2.7 9.2 2 12c1.7 3.9 6 7 10 7 1.4 0 2.8-.3 4-.8" />
    </svg>
  );
}

export function CopyIcon({ size = 12, color }: IconProps) {
  const stroke = color ?? "currentColor";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="block"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}
