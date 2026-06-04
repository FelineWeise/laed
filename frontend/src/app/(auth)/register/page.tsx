"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthLayout } from "@/components/AuthLayout";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import type { TokenResponse } from "@/lib/auth-types";

export default function RegisterPage() {
  const router = useRouter();
  const setToken = useAuthStore((s) => s.setToken);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const data = await apiFetch<TokenResponse>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, display_name: displayName }),
        skipAuth: true,
      });
      setToken(data.access_token);
      router.push("/global");
    } catch {
      setError("Registration failed. Email may already be in use.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthLayout
      title="Create account"
      footer={
        <>
          <Link
            href="/login"
            className="block text-[10px] tracking-[1px] text-[var(--laed-muted)] uppercase hover:text-[var(--laed-navy)]"
          >
            Already have an account? Sign in
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
          <span className="laed-label">Display name</span>
          <input
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="laed-input"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="laed-label">Email</span>
          <input
            type="email"
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
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="laed-input"
          />
        </label>
        {error !== null ? <p className="text-[10px] text-red-700">{error}</p> : null}
        <button type="submit" disabled={pending} className="laed-btn-primary w-full">
          {pending ? "Creating…" : "Register"}
        </button>
      </form>
    </AuthLayout>
  );
}
