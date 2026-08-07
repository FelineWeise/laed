"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Person } from "@/components/icons";
import { UserSearchCombobox } from "@/components/UserSearchCombobox";
import type { Member, UserSearchResult } from "@/lib/types";

type Props = {
  projectId: string;
  topicNodeId: string | null;
};

export function CollaboratorsPanel({ projectId, topicNodeId }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const membersPath =
    topicNodeId !== null
      ? `/api/topology/nodes/${topicNodeId}/members`
      : `/api/projects/${projectId}/members`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Member[]>(membersPath);
      setMembers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load members");
    } finally {
      setLoading(false);
    }
  }, [membersPath]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addByEmail(email: string) {
    await apiFetch(membersPath, {
      method: "POST",
      body: JSON.stringify({ email, role: "member" }),
    });
    await load();
  }

  async function remove(userId: string) {
    const deletePath =
      topicNodeId !== null
        ? `/api/topology/nodes/${topicNodeId}/members/${userId}`
        : `/api/projects/${projectId}/members/${userId}`;
    await apiFetch(deletePath, { method: "DELETE" });
    await load();
  }

  function handleSelect(user: UserSearchResult) {
    void addByEmail(user.email).catch((e) => {
      setError(e instanceof Error ? e.message : "Could not add member");
    });
  }

  return (
    <section className="laed-tab-scroll px-4 py-3.5">
      <div className="mb-2.5 text-[12px] font-semibold tracking-[0.2px] text-[var(--laed-muted)]">
        Members · {members.length}
      </div>
      <p className="mb-3 text-[9px] text-[var(--laed-muted)]">
        Invite partners by email. Online status is a placeholder for now.
      </p>

      <UserSearchCombobox onSelect={handleSelect} />

      {error !== null ? (
        <p className="mt-2 text-[9px] text-red-700">{error}</p>
      ) : null}

      {loading ? (
        <p className="mt-4 text-[9px] text-[var(--laed-muted)]">Loading…</p>
      ) : null}

      <div className="mt-4 flex flex-col gap-[9px]">
        {members.map((m) => (
          <div
            key={m.user_id}
            className="flex items-center gap-3 rounded-2xl bg-white px-[13px] py-[11px]"
            style={{ boxShadow: "var(--laed-shadow-card)" }}
          >
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--laed-navy)]"
              style={{ background: "var(--laed-navy-tint)" }}
            >
              <Person size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[length:var(--laed-size-title)] font-semibold text-[var(--laed-ink)]">
                {m.display_name ?? "User"}
              </div>
              <div className="mt-0.5 text-[11px] text-[var(--laed-muted)]">
                Internal · {m.role}
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[length:var(--laed-size-meta)] font-medium text-[var(--laed-green)]">
              <span className="h-[7px] w-[7px] rounded-full bg-[var(--laed-green)]" />
              Online
            </span>
            {m.role !== "owner" ? (
              <button
                type="button"
                className="ml-1 border-none bg-transparent p-0 text-[8px] tracking-[1px] text-[var(--laed-muted)] uppercase hover:text-red-700"
                onClick={() => {
                  if (window.confirm("Remove this member?")) {
                    void remove(m.user_id);
                  }
                }}
              >
                Remove
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
