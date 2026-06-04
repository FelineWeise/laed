"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { InboxMention } from "@/lib/types";

export function useMentionsInbox(enabled: boolean) {
  const [items, setItems] = useState<InboxMention[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    const all = await apiFetch<InboxMention[]>(
      "/api/users/me/mentions?limit=50",
    );
    setItems(all);
    const unread = await apiFetch<InboxMention[]>(
      "/api/users/me/mentions?unread_only=true&limit=50",
    );
    setUnreadCount(unread.length);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh().catch(() => undefined);
  }, [enabled, refresh]);

  const markRead = useCallback(
    async (mentionId: string) => {
      await apiFetch(`/api/users/me/mentions/${mentionId}/read`, {
        method: "POST",
      });
      await refresh();
    },
    [refresh],
  );

  return { items, unreadCount, refresh, markRead };
}
