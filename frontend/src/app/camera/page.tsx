"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function RedirectInner() {
  const router = useRouter();
  const search = useSearchParams();
  useEffect(() => {
    const q = search.toString();
    router.replace(`/capture${q ? `?${q}` : ""}`);
  }, [router, search]);
  return <div className="p-8 text-center laed-label">Opening Capture…</div>;
}

export default function CameraRedirectPage() {
  return (
    <Suspense>
      <RedirectInner />
    </Suspense>
  );
}
