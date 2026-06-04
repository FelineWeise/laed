"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { ProjectInvitation } from "@/lib/types";

type Props = {
  onAccepted: () => void;
};

export function IncomingInvitations({ onAccepted }: Props) {
  const [invites, setInvites] = useState<ProjectInvitation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await apiFetch<ProjectInvitation[]>("/api/users/me/invitations");
      setInvites(list);
    } catch {
      setInvites([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function accept(id: string) {
    await apiFetch(`/api/invitations/${id}/accept`, { method: "POST" });
    await load();
    onAccepted();
  }

  async function reject(id: string) {
    await apiFetch(`/api/invitations/${id}/reject`, { method: "POST" });
    await load();
  }

  if (loading || invites.length === 0) return null;

  return (
    <div className="mx-4 mb-4 border border-[var(--laed-border)] bg-[var(--laed-paper-elevated)] p-3 md:mx-6">
      <p className="laed-label mb-2 text-[var(--laed-navy)]">Invitations for you</p>
      <ul className="space-y-2">
        {invites.map((inv) => (
          <li
            key={inv.id}
            className="flex flex-wrap items-center justify-between gap-2 text-[10px]"
          >
            <span className="text-[var(--laed-ink)]">
              {inv.project_name ?? "Project"} · {inv.role}
            </span>
            <span className="flex gap-2">
              <button
                type="button"
                className="laed-btn-primary py-1 px-2 text-[8px]"
                onClick={() => void accept(inv.id)}
              >
                Accept
              </button>
              <button
                type="button"
                className="laed-label cursor-pointer border border-[var(--laed-border)] bg-white py-1 px-2"
                onClick={() => void reject(inv.id)}
              >
                Reject
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
