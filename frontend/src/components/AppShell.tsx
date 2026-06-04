"use client";

import { MenuBars } from "@/components/icons";

type Breadcrumb = {
  label: string;
  onClick?: () => void;
};

type Props = {
  breadcrumb?: Breadcrumb;
  breadcrumbColor?: string;
  menuOpen?: boolean;
  onMenu?: () => void;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export function AppShell({
  breadcrumb,
  breadcrumbColor,
  menuOpen = false,
  onMenu,
  right,
  children,
  className = "",
}: Props) {
  return (
    <div
      className={`laed-shell relative mx-auto flex min-h-dvh flex-col bg-[var(--laed-paper)] ${className}`}
    >
      <header className="relative z-[250] flex h-10 shrink-0 items-center justify-between px-[18px] pt-2">
        {breadcrumb ? (
          <button
            type="button"
            onClick={breadcrumb.onClick}
            className="laed-label cursor-pointer border-none bg-transparent p-0"
            style={{ color: breadcrumbColor ?? "var(--laed-muted)" }}
          >
            {breadcrumb.label}
          </button>
        ) : (
          <span className="laed-label">LAED</span>
        )}
        {right !== undefined ? (
          right
        ) : onMenu ? (
          <button
            type="button"
            onClick={onMenu}
            className="flex h-7 w-7 cursor-pointer items-center justify-center border-none"
            style={{
              background: menuOpen ? "var(--laed-ink)" : "transparent",
            }}
            aria-label="Menu"
          >
            <MenuBars open={menuOpen} />
          </button>
        ) : (
          <span className="w-7" />
        )}
      </header>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
