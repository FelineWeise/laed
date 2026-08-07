"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Tip } from "@/components/Tip";
import type { CaptureAsset, Member, Project } from "@/lib/types";

type AttachStep = "projects" | "visibility" | "members";

type VisibilityChoice = "private" | "everyone" | "people";

type Props = {
  assets: CaptureAsset[];
  selectedAssetId: string | null;
  onSelectAsset: (id: string) => void;
  onPreviewAsset: (id: string) => void;
  onAttached: () => void;
  toast: string | null;
  setToast: (msg: string | null) => void;
};

function kindLabel(kind: CaptureAsset["asset_kind"]): string {
  if (kind === "image") return "Photo";
  if (kind === "video") return "Video";
  if (kind === "audio") return "Audio";
  return "Text";
}

function projectInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0] ?? "";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const second = parts[1] ?? "";
  return ((first[0] ?? "") + (second[0] ?? "")).toUpperCase() || "?";
}

function memberLabel(m: Member): string {
  return m.display_name?.trim() || m.email || m.user_id.slice(0, 8);
}

/**
 * Concept C floating session sheet + Idea 1 attach (project → visibility → people).
 */
export function CaptureAttachSheet({
  assets,
  selectedAssetId,
  onSelectAsset,
  onPreviewAsset,
  onAttached,
  toast,
  setToast,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [step, setStep] = useState<AttachStep>("projects");
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [visibility, setVisibility] = useState<VisibilityChoice>("private");
  const [pickedMembers, setPickedMembers] = useState<Record<string, boolean>>(
    {},
  );
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => assets.find((a) => a.id === selectedAssetId) ?? null,
    [assets, selectedAssetId],
  );

  useEffect(() => {
    if (!expanded) return;
    void apiFetch<Project[]>("/api/projects").then(setProjects);
  }, [expanded]);

  useEffect(() => {
    if (!projectId || step !== "members") return;
    void apiFetch<Member[]>(`/api/projects/${projectId}/members`).then(
      setMembers,
    );
  }, [projectId, step]);

  const resetFlow = useCallback(() => {
    setStep("projects");
    setProjectId(null);
    setProjectName("");
    setVisibility("private");
    setPickedMembers({});
    setMembers([]);
  }, []);

  const closeSheet = useCallback(() => {
    setExpanded(false);
    resetFlow();
  }, [resetFlow]);

  const pickProject = (p: Project) => {
    setProjectId(p.id);
    setProjectName(p.name);
    setVisibility("private");
    setPickedMembers({});
    setStep("visibility");
  };

  const toggleMember = (userId: string) => {
    setPickedMembers((prev) => ({ ...prev, [userId]: !prev[userId] }));
  };

  const confirmAttach = async () => {
    if (!selected || !projectId) return;
    setBusy(true);
    try {
      const isPrivate = visibility === "private";
      const shareIds =
        visibility === "people"
          ? Object.entries(pickedMembers)
              .filter(([, on]) => on)
              .map(([id]) => id)
          : [];
      await apiFetch(`/api/capture/assets/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          project_id: projectId,
          is_private: isPrivate,
          ...(isPrivate
            ? {}
            : {
                share_with_user_ids:
                  visibility === "everyone" ? [] : shareIds,
              }),
        }),
      });
      const visLabel =
        visibility === "private"
          ? "privately"
          : visibility === "everyone"
            ? "with everyone"
            : "with selected members";
      setToast(`Added ${visLabel} to ${projectName}`);
      setTimeout(() => setToast(null), 2400);
      onAttached();
      closeSheet();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div
        className="pointer-events-none absolute inset-x-0 bottom-[calc(var(--laed-bottom-bar-offset)+8px)] z-30 flex justify-center px-3"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div
          className="pointer-events-auto w-full max-w-[26rem] overflow-hidden rounded-[18px] border border-[var(--laed-border-soft)] bg-white/95 shadow-[var(--laed-shadow-sheet)] backdrop-blur-md transition-[height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ height: expanded ? 300 : 118 }}
        >
          <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-[var(--laed-fill-12)]" />
          <div className="px-3.5 pt-2 pb-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold tracking-[0.9px] text-[var(--laed-muted)] uppercase">
                This session
              </span>
              <button
                type="button"
                onClick={() => {
                  if (expanded) closeSheet();
                  else {
                    setExpanded(true);
                    resetFlow();
                  }
                }}
                disabled={assets.length === 0}
                className="cursor-pointer border-none bg-transparent p-0 text-[11px] font-semibold text-[var(--laed-private-accent)] disabled:opacity-40"
              >
                {expanded ? "Close" : "Add to project"}
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {assets.length === 0 ? (
                <p className="text-[11px] text-[var(--laed-muted)]">
                  Captures appear here
                </p>
              ) : (
                assets.map((a) => {
                  const on = a.id === selectedAssetId;
                  const linked = Boolean(a.project_id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        onSelectAsset(a.id);
                        if (!expanded) onPreviewAsset(a.id);
                      }}
                      className="relative h-[58px] w-[52px] shrink-0 cursor-pointer overflow-hidden rounded-[10px] border-none p-0"
                      style={{
                        background: "var(--laed-private-bg)",
                        outline: on
                          ? "2px solid var(--laed-private-accent)"
                          : "1px solid rgba(26,25,23,0.08)",
                        outlineOffset: on ? 1 : 0,
                      }}
                      aria-label={`Select ${kindLabel(a.asset_kind)}`}
                    >
                      <span className="absolute inset-0 flex items-center justify-center text-[16px] text-[var(--laed-private-accent)]">
                        {a.asset_kind === "audio"
                          ? "♪"
                          : a.asset_kind === "transcript"
                            ? "Aa"
                            : a.asset_kind === "video"
                              ? "▶"
                              : "▣"}
                      </span>
                      <span className="absolute right-0 bottom-0 left-0 bg-black/45 px-0.5 py-0.5 text-center text-[7px] font-semibold tracking-wide text-white uppercase">
                        {kindLabel(a.asset_kind)}
                      </span>
                          {linked ? (
                        <span
                          className="absolute top-1 right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold text-white"
                          style={{
                            background: a.is_private
                              ? "var(--laed-private-accent)"
                              : "var(--laed-navy)",
                          }}
                          title={a.is_private ? "Private in project" : "Shared"}
                        >
                          {a.is_private ? "P" : "✓"}
                        </span>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {expanded ? (
            <div className="border-t border-[rgba(26,25,23,0.08)] px-3.5 pt-2.5 pb-3">
              {step === "projects" ? (
                <>
                  <p className="mb-2 text-[9px] font-semibold tracking-[0.8px] text-[var(--laed-muted)] uppercase">
                    Choose project
                  </p>
                  <div className="max-h-[150px] space-y-1 overflow-y-auto">
                    {projects.length === 0 ? (
                      <p className="text-[11px] text-[var(--laed-muted)]">
                        No projects yet
                      </p>
                    ) : (
                      projects.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => pickProject(p)}
                          disabled={!selected}
                          className="flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] border-none bg-transparent px-2 py-2 text-left hover:bg-[var(--laed-private-bg)] disabled:opacity-40"
                        >
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                            style={{
                              background: "var(--laed-private-accent)",
                            }}
                          >
                            {projectInitials(p.name)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[12px] font-semibold text-[var(--laed-ink)]">
                              {p.name}
                            </span>
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                  {!selected ? (
                    <p className="mt-2 text-[10px] text-[var(--laed-muted)]">
                      Select a capture in the tray first
                    </p>
                  ) : null}
                </>
              ) : null}

              {step === "visibility" ? (
                <>
                  <button
                    type="button"
                    onClick={() => setStep("projects")}
                    className="mb-2 cursor-pointer border-none bg-transparent p-0 text-[10px] text-[var(--laed-muted)]"
                  >
                    ← {projectName}
                  </button>
                  <p className="mb-2 text-[9px] font-semibold tracking-[0.8px] text-[var(--laed-muted)] uppercase">
                    Visibility
                  </p>
                  <div className="mb-2 flex gap-1.5">
                    {(
                      [
                        ["private", "Private"],
                        ["everyone", "Shared"],
                      ] as const
                    ).map(([key, label]) => {
                      const on =
                        key === "private"
                          ? visibility === "private"
                          : visibility !== "private";
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() =>
                            setVisibility(
                              key === "private" ? "private" : "everyone",
                            )
                          }
                          className="flex-1 cursor-pointer rounded-full border-none px-3 py-2 text-[11px] font-semibold"
                          style={{
                            background: on
                              ? "var(--laed-private-accent)"
                              : "var(--laed-private-bg)",
                            color: on ? "#fff" : "var(--laed-ink)",
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {visibility !== "private" ? (
                    <div className="mb-2 space-y-1">
                      <button
                        type="button"
                        onClick={() => setVisibility("everyone")}
                        className="flex w-full cursor-pointer items-start gap-2 rounded-[10px] border-none px-2.5 py-2 text-left"
                        style={{
                          background:
                            visibility === "everyone"
                              ? "var(--laed-private-bg)"
                              : "transparent",
                        }}
                      >
                        <span className="min-w-0">
                          <span className="block text-[11px] font-semibold">
                            Everyone in the project
                          </span>
                          <span className="block text-[9px] text-[var(--laed-muted)]">
                            All current members
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setVisibility("people");
                          setStep("members");
                        }}
                        className="flex w-full cursor-pointer items-start gap-2 rounded-[10px] border-none px-2.5 py-2 text-left hover:bg-[var(--laed-private-bg)]"
                      >
                        <span className="min-w-0">
                          <span className="block text-[11px] font-semibold">
                            Specific people
                          </span>
                          <span className="block text-[9px] text-[var(--laed-muted)]">
                            Pick members one by one
                          </span>
                        </span>
                      </button>
                      <Tip tip="Coming soon">
                        <button
                          type="button"
                          disabled
                          className="flex w-full cursor-not-allowed items-start gap-2 rounded-[10px] border-none px-2.5 py-2 text-left opacity-45"
                        >
                          <span className="min-w-0">
                            <span className="block text-[11px] font-semibold">
                              By role
                            </span>
                            <span className="block text-[9px] text-[var(--laed-muted)]">
                              Coming soon
                            </span>
                          </span>
                        </button>
                      </Tip>
                    </div>
                  ) : null}
                  {visibility !== "people" ? (
                    <button
                      type="button"
                      disabled={busy || !selected}
                      onClick={() => void confirmAttach()}
                      className="mt-1 w-full cursor-pointer rounded-full border-none py-2.5 text-[12px] font-semibold text-white disabled:opacity-50"
                      style={{ background: "var(--laed-private-accent)" }}
                    >
                      {busy ? "Attaching…" : "Confirm"}
                    </button>
                  ) : null}
                </>
              ) : null}

              {step === "members" ? (
                <>
                  <button
                    type="button"
                    onClick={() => setStep("visibility")}
                    className="mb-2 cursor-pointer border-none bg-transparent p-0 text-[10px] text-[var(--laed-muted)]"
                  >
                    ← Shared options
                  </button>
                  <p className="mb-2 text-[9px] font-semibold tracking-[0.8px] text-[var(--laed-muted)] uppercase">
                    Specific people
                  </p>
                  <div className="mb-2 max-h-[110px] space-y-1 overflow-y-auto">
                    {members.map((m) => {
                      const on = Boolean(pickedMembers[m.user_id]);
                      return (
                        <button
                          key={m.user_id}
                          type="button"
                          onClick={() => toggleMember(m.user_id)}
                          className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-[10px] border-none px-2.5 py-2 text-left"
                          style={{
                            background: on
                              ? "var(--laed-private-bg)"
                              : "transparent",
                          }}
                        >
                          <span className="truncate text-[11px] font-medium">
                            {memberLabel(m)}
                          </span>
                          <span
                            className="h-4 w-4 shrink-0 rounded-full border-2"
                            style={{
                              borderColor: "var(--laed-private-accent)",
                              background: on
                                ? "var(--laed-private-accent)"
                                : "transparent",
                            }}
                          />
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    disabled={
                      busy ||
                      !selected ||
                      !Object.values(pickedMembers).some(Boolean)
                    }
                    onClick={() => void confirmAttach()}
                    className="w-full cursor-pointer rounded-full border-none py-2.5 text-[12px] font-semibold text-white disabled:opacity-50"
                    style={{ background: "var(--laed-private-accent)" }}
                  >
                    {busy ? "Attaching…" : "Confirm"}
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {toast ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-[calc(var(--laed-bottom-bar-offset)+130px)] z-40 flex justify-center px-4">
          <span className="rounded-full bg-[var(--laed-ink)] px-3.5 py-2 text-[11px] text-white shadow-lg">
            {toast}
          </span>
        </div>
      ) : null}
    </>
  );
}
