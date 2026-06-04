"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthStore } from "@/lib/auth-store";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (token === null) {
      router.replace("/login");
    }
  }, [token, router]);

  if (token === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[var(--laed-fg-muted)]">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
