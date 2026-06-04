import Link from "next/link";
import { AuthLayout } from "@/components/AuthLayout";

export default function ForgotPasswordPage() {
  const demoEmail = process.env.NEXT_PUBLIC_DEMO_EMAIL;

  return (
    <AuthLayout
      title="Forgot password"
      subtitle="Self-service reset is not available yet"
      footer={
        <Link
          href="/login"
          className="block text-[10px] tracking-[1px] text-[var(--laed-muted)] uppercase hover:text-[var(--laed-navy)]"
        >
          Back to sign in
        </Link>
      }
    >
      <div className="space-y-4 text-[11px] leading-relaxed text-[var(--laed-ink)]">
        <p>
          Password recovery is not enabled on this deployment. Contact your workspace
          administrator to reset your account.
        </p>
        {demoEmail ? (
          <p className="text-[var(--laed-muted)]">
            For testing, use the demo account configured on the server (
            <span className="text-[var(--laed-ink)]">{demoEmail}</span>
            ) — ask your operator for the password or check{" "}
            <code className="text-[10px]">LAED_DEMO_PASSWORD</code> in the server{" "}
            <code className="text-[10px]">.env</code>.
          </p>
        ) : null}
      </div>
    </AuthLayout>
  );
}
