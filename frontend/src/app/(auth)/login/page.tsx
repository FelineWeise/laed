"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthLayout } from "@/components/AuthLayout";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import type { TokenResponse, UserLoginPayload } from "@/lib/auth-types";

const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL ?? "";

export default function LoginPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const setToken = useAuthStore((s) => s.setToken);
  const hydrate = useAuthStore((s) => s.hydrate);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (token !== null) {
      router.replace("/global");
    }
  }, [token, router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const payload: UserLoginPayload = { email, password };
    try {
      const data = await apiFetch<TokenResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
        skipAuth: true,
      });
      setToken(data.access_token);
      router.push("/global");
    } catch {
      setError("Sign-in failed. Check your credentials and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Access your project workspace"
      footer={
        <>
          <Link
            href="/register"
            className="block text-[10px] tracking-[1px] text-[var(--laed-muted)] uppercase hover:text-[var(--laed-navy)]"
          >
            Create an account
          </Link>
          <Link
            href="/forgot-password"
            className="block text-[10px] tracking-[1px] text-[var(--laed-muted)] uppercase hover:text-[var(--laed-navy)]"
          >
            Forgot password?
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <label className="flex flex-col gap-1">
          <span className="laed-label">Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="laed-input"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="laed-label">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="laed-input"
          />
        </label>
        {error !== null ? (
          <p className="text-[10px] text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={pending} className="laed-btn-primary w-full">
          {pending ? "Signing in…" : "Sign in"}
        </button>
        {DEMO_EMAIL.length > 0 ? (
          <button
            type="button"
            className="laed-label w-full border-none bg-transparent text-[var(--laed-navy)]"
            onClick={() => setEmail(DEMO_EMAIL)}
          >
            Use demo email
          </button>
        ) : null}
      </form>
    </AuthLayout>
  );
}
