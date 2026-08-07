"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import type { TokenResponse, UserLoginPayload } from "@/lib/auth-types";

const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL ?? "";
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "";

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

  async function signIn(payload: UserLoginPayload) {
    setError(null);
    setPending(true);
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await signIn({ email, password });
  }

  async function fillDemoAccess() {
    if (DEMO_EMAIL.length === 0) {
      setError("Demo access is not configured.");
      return;
    }
    setEmail(DEMO_EMAIL);
    if (DEMO_PASSWORD.length > 0) {
      setPassword(DEMO_PASSWORD);
      await signIn({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
    }
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-white px-[34px]">
      <div className="mx-auto w-full max-w-[390px]">
        <div className="mb-[30px] text-center">
          <div className="text-[28px] font-bold tracking-[5px] text-[var(--laed-ink)]">
            LAED
          </div>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col">
          <label className="mb-4 block">
            <span className="mb-1.5 block text-[9.5px] font-semibold tracking-[1.6px] text-[var(--laed-muted)] uppercase">
              Username
            </span>
            <input
              type="email"
              autoComplete="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border-none border-b border-[rgba(26,25,23,0.18)] bg-transparent py-1.5 text-[14px] text-[var(--laed-ink)] outline-none focus:border-[var(--laed-navy)]"
            />
          </label>
          <label className="mb-4 block">
            <span className="mb-1.5 block text-[9.5px] font-semibold tracking-[1.6px] text-[var(--laed-muted)] uppercase">
              Password
            </span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border-none border-b border-[rgba(26,25,23,0.18)] bg-transparent py-1.5 text-[14px] text-[var(--laed-ink)] outline-none focus:border-[var(--laed-navy)]"
            />
          </label>

          {error !== null ? (
            <p className="mb-3 text-[10px] text-red-700" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="mt-1.5 w-full cursor-pointer border-none bg-[var(--laed-navy)] py-[13px] text-[11.5px] font-semibold tracking-[2px] text-white uppercase disabled:opacity-50"
            style={{ borderRadius: 3 }}
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={() => void fillDemoAccess()}
            className="cursor-pointer border-none bg-transparent text-[10.5px] font-semibold tracking-[1.3px] text-[var(--laed-muted)] uppercase"
          >
            Use demo access
          </button>
        </div>

        <div className="mt-6 flex flex-col gap-2 text-center">
          <Link
            href="/register"
            className="text-[10px] tracking-[1px] text-[var(--laed-muted)] uppercase hover:text-[var(--laed-navy)]"
          >
            Create an account
          </Link>
          <Link
            href="/forgot-password"
            className="text-[10px] tracking-[1px] text-[var(--laed-muted)] uppercase hover:text-[var(--laed-navy)]"
          >
            Forgot password?
          </Link>
        </div>
      </div>
    </div>
  );
}
