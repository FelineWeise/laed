import Link from "next/link";

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function AuthLayout({ title, subtitle, children, footer }: Props) {
  return (
    <main className="laed-shell laed-shell--narrow mx-auto flex min-h-screen flex-col justify-center bg-[var(--laed-paper)] px-8 py-12 md:px-12">
      <p className="laed-label mb-2">LAED</p>
      <h1 className="text-lg font-bold tracking-[2px] text-[var(--laed-ink)] uppercase">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-2 text-[var(--laed-muted)]" style={{ fontSize: "10px" }}>
          {subtitle}
        </p>
      ) : null}
      <div className="mt-10">{children}</div>
      {footer ? <div className="mt-8 space-y-3 text-center">{footer}</div> : null}
      <Link
        href="/"
        className="laed-label mt-12 inline-block text-[var(--laed-muted)] hover:text-[var(--laed-navy)]"
      >
        ← Back
      </Link>
    </main>
  );
}
