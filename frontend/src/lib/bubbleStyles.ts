export type BubblePalette = {
  background: string;
  color: string;
  border: string;
};

export function hashUserId(userId: string): number {
  let h = 0;
  for (let i = 0; i < userId.length; i += 1) {
    h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return h % 4;
}

export function paletteForOtherUser(userId: string | null): BubblePalette {
  if (userId === null) {
    return {
      background: "var(--laed-bubble-anon-bg)",
      color: "var(--laed-bubble-anon-fg)",
      border: "1px solid var(--laed-border)",
    };
  }
  const idx = hashUserId(userId);
  const backgrounds = [
    "var(--laed-bubble-them-0-bg)",
    "var(--laed-bubble-them-1-bg)",
    "var(--laed-bubble-them-2-bg)",
    "var(--laed-bubble-them-3-bg)",
  ];
  const colors = [
    "var(--laed-bubble-them-0-fg)",
    "var(--laed-bubble-them-1-fg)",
    "var(--laed-bubble-them-2-fg)",
    "var(--laed-bubble-them-3-fg)",
  ];
  return {
    background: backgrounds[idx] ?? backgrounds[0] ?? "var(--laed-paper-elevated)",
    color: colors[idx] ?? colors[0] ?? "var(--laed-ink)",
    border: "1px solid var(--laed-border)",
  };
}

export const meBubblePalette: BubblePalette = {
  background: "var(--laed-bubble-me-bg)",
  color: "var(--laed-bubble-me-fg)",
  border: "none",
};

export const privateMeBubblePalette: BubblePalette = {
  background: "var(--laed-private-accent)",
  color: "#ffffff",
  border: "none",
};

export const privateAiBubblePalette: BubblePalette = {
  background: "var(--laed-bubble-private-ai-bg)",
  color: "var(--laed-ink)",
  border: "1px solid var(--laed-private-border)",
};
