type Props = {
  isPrivate?: boolean;
  className?: string;
};

export function PrivateBadge({ isPrivate = false, className = "" }: Props) {
  if (!isPrivate) return null;
  return (
    <span
      className={`inline-block rounded-sm px-1 py-0.5 text-[7px] tracking-[1px] uppercase ${className}`.trim()}
        style={{
        background: "var(--laed-private-bg)",
        color: "var(--laed-private)",
      }}
    >
      Private
    </span>
  );
}
