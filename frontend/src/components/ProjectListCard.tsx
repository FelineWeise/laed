"use client";

import { useCallback, useEffect, useState } from "react";
import { TagChipEditor } from "@/components/TagChipEditor";
import { apiFetch } from "@/lib/api";
import type { Member, Project, ProjectInvitation } from "@/lib/types";

type Props = {
  project: Project;
  myUserId: string | null;
  onSelect: () => void;
  onTagsChange: (tags: string[]) => void | Promise<void>;
  onArchived: () => void;
  onDeleted: () => void;
};

const ADMIN_ROLES = new Set(["owner", "admin"]);

export function ProjectListCard({
  project,
  myUserId,
  onSelect,
  onTagsChange,
  onArchived,
  onDeleted,
}: Props) {
  const [myRole, setMyRole] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [pending, setPending] = useState<ProjectInvitation[]>([]);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const canManage = myRole !== null && ADMIN_ROLES.has(myRole);
  const canDelete = myRole === "owner";

  const loadMeta = useCallback(async () => {
    try {
      const members = await apiFetch<Member[]>(`/api/projects/${project.id}/members`);
      const me = myUserId
        ? members.find((m) => m.user_id === myUserId)
        : undefined;
      const role = me?.role ?? null;
      setMyRole(role);
      if (role !== null && ADMIN_ROLES.has(role)) {
        const invs = await apiFetch<ProjectInvitation[]>(
          `/api/projects/${project.id}/invitations`,
        );
        setPending(invs);
      } else {
        setPending([]);
      }
    } catch {
      setMyRole(null);
      setPending([]);
    }
  }, [project.id, myUserId]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  async function sendInvite() {
    const email = inviteEmail.trim();
    if (email === "") return;
    setInviteError(null);
    try {
      await apiFetch<ProjectInvitation>(`/api/projects/${project.id}/invitations`, {
        method: "POST",
        body: JSON.stringify({ email, role: inviteRole }),
      });
      setInviteEmail("");
      await loadMeta();
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : "Invite failed");
    }
  }

  async function cancelInvite(invitationId: string) {
    await apiFetch(`/api/projects/${project.id}/invitations/${invitationId}`, {
      method: "DELETE",
    });
    await loadMeta();
  }

  async function archive() {
    if (!window.confirm(`Archive “${project.name}”?`)) return;
    await apiFetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      body: JSON.stringify({ archived: true }),
    });
    onArchived();
  }

  async function deleteProject() {
    if (
      !window.confirm(
        `Permanently delete “${project.name}”? This removes all threads, files, and data. This cannot be undone.`,
      )
    ) {
      return;
    }
    await apiFetch(`/api/projects/${project.id}`, { method: "DELETE" });
    onDeleted();
  }

  return (
    <li>
      <div
        className="flex w-full flex-col border border-[var(--laed-border)] bg-[var(--laed-paper-elevated)] px-4 py-5"
        style={{ borderRadius: "var(--laed-radius-sm)" }}
      >
        <button
          type="button"
          onClick={onSelect}
          className="cursor-pointer border-none bg-transparent p-0 text-left"
        >
          <span className="text-[11px] font-bold tracking-[2px] text-[var(--laed-ink)] uppercase">
            {project.name}
          </span>
          {project.description ? (
            <span className="mt-2 line-clamp-2 block text-[10px] text-[var(--laed-muted)]">
              {project.description}
            </span>
          ) : null}
        </button>

        <TagChipEditor
          tags={project.tags ?? []}
          onChange={(tags) => void onTagsChange(tags)}
        />

        {canManage ? (
          <div className="mt-3 border-t border-[var(--laed-border)] pt-3">
            <p className="laed-label mb-2">Invite collaborator</p>
            <div className="flex flex-wrap gap-2">
              <input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="email@example.com"
                className="laed-input-pill min-h-0 flex-1 py-1 text-[9px]"
              />
              <select
                value={inviteRole}
                onChange={(e) =>
                  setInviteRole(e.target.value as "member" | "admin")
                }
                className="border border-[var(--laed-border)] bg-white px-2 text-[9px]"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <button
                type="button"
                onClick={() => void sendInvite()}
                className="laed-btn-private shrink-0 py-1.5 text-[8px]"
              >
                Invite
              </button>
            </div>
            {inviteError !== null ? (
              <p className="mt-1 text-[9px] text-red-700">{inviteError}</p>
            ) : null}
            {pending.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {pending.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex items-center justify-between text-[9px] text-[var(--laed-muted)]"
                  >
                    <span>
                      {inv.invitee_email} · {inv.role} (pending)
                    </span>
                    <button
                      type="button"
                      className="cursor-pointer border-none bg-transparent text-[var(--laed-muted)] hover:text-red-700"
                      onClick={() => void cancelInvite(inv.id)}
                    >
                      Cancel
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-4">
              <button
                type="button"
                onClick={() => void archive()}
                className="laed-label cursor-pointer border-none bg-transparent p-0 text-[var(--laed-muted)] hover:text-[var(--laed-ink)]"
              >
                Archive
              </button>
              {canDelete ? (
                <button
                  type="button"
                  onClick={() => void deleteProject()}
                  className="laed-label cursor-pointer border-none bg-transparent p-0 text-red-700"
                >
                  Delete permanently
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </li>
  );
}
