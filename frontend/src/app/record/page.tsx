"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function RecordRedirect() {
  const router = useRouter();
  const search = useSearchParams();
  const projectId = search.get("projectId");

  useEffect(() => {
    const params = new URLSearchParams();
    if (projectId) params.set("projectId", projectId);
    const qs = params.toString();
    router.replace(`/spoken${qs ? `?${qs}` : ""}`);
  }, [router, projectId]);

  return null;
}

export default function RecordPage() {
  return (
    <Suspense>
      <RecordRedirect />
    </Suspense>
  );
}
