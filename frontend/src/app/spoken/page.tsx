"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function RedirectInner() {
  const router = useRouter();
  const search = useSearchParams();
  useEffect(() => {
    const params = new URLSearchParams(search.toString());
    if (!params.has("mode")) params.set("mode", "Audio");
    router.replace(`/capture?${params.toString()}`);
  }, [router, search]);
  return <div className="p-8 text-center laed-label">Opening Capture…</div>;
}

export default function SpokenRedirectPage() {
  return (
    <Suspense>
      <RedirectInner />
    </Suspense>
  );
}
