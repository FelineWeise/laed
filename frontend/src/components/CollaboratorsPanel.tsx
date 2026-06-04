"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
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
    <section className="laed-tab-scroll p-4">
      <p className="laed-label mb-1">
        {topicNodeId !== null ? "Topic collaborators" : "Project collaborators"}
      </p>
      <p className="mb-4 text-[9px] text-[var(--laed-muted)]">
        All collaborators have equal access for now. Roles can be refined later.
      </p>

      <UserSearchCombobox onSelect={handleSelect} />

      {error !== null ? (
        <p className="mt-2 text-[9px] text-red-700">{error}</p>
      ) : null}

      <ul className="mt-6">
        {loading ? (
          <li className="text-[9px] text-[var(--laed-muted)]">Loading…</li>
        ) : null}
        {members.map((m) => (
          <li
            key={m.user_id}
            className="flex items-center justify-between border-b border-[var(--laed-border)] py-3"
          >
            <div>
              <div className="text-[11px] font-medium text-[var(--laed-ink)]">
                {m.display_name ?? "User"}
              </div>
              <div className="text-[9px] text-[var(--laed-muted)]">
                {m.email ?? m.user_id}
              </div>
              <div className="mt-0.5 text-[8px] uppercase tracking-[1px] text-[var(--laed-muted)]">
                {m.role}
              </div>
            </div>
            {m.role !== "owner" ? (
              <button
                type="button"
                className="text-[8px] uppercase tracking-[1px] text-[var(--laed-muted)] hover:text-red-700"
                onClick={() => {
                  if (window.confirm("Remove this collaborator?")) {
                    void remove(m.user_id);
                  }
                }}
              >
                Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
