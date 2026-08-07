"use client";

import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { AssistantPanel } from "@/components/AssistantPanel";
import { AppShell } from "@/components/AppShell";
import { BottomBar } from "@/components/BottomBar";

export default function LaedPage() {
  const router = useRouter();

  return (
    <AuthGuard>
      <AppShell
        section="Agent"
        onHome={() => router.push("/global")}
        chrome="private"
      >
        <div className="laed-viewport-fill flex min-h-0 flex-1 flex-col bg-white">
          <AssistantPanel
            open
            variant="page"
            onClose={() => router.push("/global")}
            context="workspace"
          />
        </div>
      </AppShell>
      <BottomBar agentActive variant="private" />
    </AuthGuard>
  );
}
