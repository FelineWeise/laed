"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export type LlmModelOption = {
  id: string;
  name: string;
};

type ModelsResponse = { data: LlmModelOption[] };
type DefaultResponse = { model: string };

const STORAGE_KEY = "laed_selected_llm_model";

export function useLlmModels() {
  const [models, setModels] = useState<LlmModelOption[]>([]);
  const [defaultId, setDefaultId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [res, def] = await Promise.all([
          apiFetch<ModelsResponse>("/api/llm/models"),
          apiFetch<DefaultResponse>("/api/llm/models/default"),
        ]);
        if (cancelled) return;
        const list = res.data.map((m) => ({ id: m.id, name: m.id }));
        setModels(list);
        setDefaultId(def.model);
        const stored =
          typeof window !== "undefined"
            ? window.localStorage.getItem(STORAGE_KEY)
            : null;
        const pick =
          stored && list.some((m) => m.id === stored) ? stored : def.model;
        setSelectedId(pick);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectModel = useCallback((id: string) => {
    setSelectedId(id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, id);
    }
  }, []);

  return { models, defaultId, selectedId, selectModel, loading };
}
