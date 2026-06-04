import type { Member } from "@/lib/types";

const RESERVED = new Set(["ai", "laed"]);

export function mentionLabel(member: Member): string {
  const name = member.display_name?.trim();
  if (name) return name;
  const local = member.email?.split("@")[0]?.trim();
  return local || "User";
}

export function resolveMentionedUserIds(
  content: string,
  members: Member[],
): string[] {
  const byKey = new Map<string, string>();
  for (const m of members) {
    const label = mentionLabel(m).toLowerCase();
    if (label && !byKey.has(label)) byKey.set(label, m.user_id);
    const local = m.email?.split("@")[0]?.trim().toLowerCase();
    if (local && !byKey.has(local)) byKey.set(local, m.user_id);
  }

  const found: string[] = [];
  const seen = new Set<string>();
  const re = /@([^\s@]+(?:\s+[^\s@]+)*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    const raw = match[1]?.trim() ?? "";
    if (!raw) continue;
    const first = raw.split(/\s+/)[0]?.toLowerCase() ?? "";
    if (RESERVED.has(first)) continue;
    const uid = byKey.get(raw.toLowerCase());
    if (uid && !seen.has(uid)) {
      seen.add(uid);
      found.push(uid);
    }
  }
  return found;
}
