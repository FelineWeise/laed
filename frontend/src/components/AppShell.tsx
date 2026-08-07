"use client";

import { MenuBars } from "@/components/icons";

type Props = {
  /** Uppercase section label after LAED |  */
  section?: string;
  /** Navigate home / projects list */
  onHome?: () => void;
  menuOpen?: boolean;
  onMenu?: () => void;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Private (light green) vs project (light blue) top bar */
  chrome?: "private" | "project" | "neutral";
  /** @deprecated Prefer `section` + `onHome` (mockup AppBar). */
  breadcrumb?: { label: string; onClick?: () => void };
  breadcrumbColor?: string;
};

export function AppShell({
  section,
  onHome,
  breadcrumb,
  breadcrumbColor,
  menuOpen = false,
  onMenu,
  right,
  children,
  className = "",
  chrome = "neutral",
}: Props) {
  const showLegacyCrumb = Boolean(breadcrumb) && !section;

  const headerBg =
    chrome === "private"
      ? "var(--laed-chrome-private)"
      : chrome === "project"
        ? "var(--laed-chrome-project)"
        : "#fff";

  return (
    <div
      className={`laed-shell relative mx-auto flex min-h-dvh flex-col bg-[var(--laed-paper)] ${className}`}
    >
      <header
        className="relative z-[250] flex h-10 shrink-0 items-center justify-between px-[18px] pt-[max(0.25rem,env(safe-area-inset-top,0px))]"
        style={{ background: headerBg }}
      >
        {showLegacyCrumb && breadcrumb ? (
          <button
            type="button"
            onClick={breadcrumb.onClick}
            className="laed-label cursor-pointer border-none bg-transparent p-0"
            style={{ color: breadcrumbColor ?? "var(--laed-muted)" }}
          >
            {breadcrumb.label}
          </button>
        ) : (
          <div className="flex items-center gap-2 text-[length:var(--laed-size-title)]">
            <button
              type="button"
              onClick={onHome}
              className="cursor-pointer border-none bg-transparent p-0 font-bold tracking-[1.5px] text-[var(--laed-ink)]"
              disabled={!onHome}
            >
              LAED
            </button>
            {section ? (
              <>
                <span className="text-[var(--laed-ink)]">|</span>
                <span className="font-medium tracking-[1.5px] text-[var(--laed-ink)] uppercase">
                  {section}
                </span>
              </>
            ) : null}
          </div>
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
