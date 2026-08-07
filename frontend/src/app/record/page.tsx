"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RecordRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/capture");
  }, [router]);
  return <div className="p-8 text-center laed-label">Opening Capture…</div>;
}
