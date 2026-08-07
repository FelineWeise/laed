"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

const STORAGE_KEY = "laed-thirdparty-embedding-model";

type EmbeddingModelsResponse = {
  data: { id: string; mode?: string }[];
  default: string;
};

export function useThirdpartyEmbedding() {
  const [models, setModels] = useState<{ id: string }[]>([]);
  const [defaultId, setDefaultId] = useState("");
  const [selectedId, setSelectedIdState] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch<EmbeddingModelsResponse>(
          "/api/llm/embedding-models/thirdparty",
        );
        if (cancelled) return;
        setModels(res.data);
        setDefaultId(res.default);
        const stored =
          typeof window !== "undefined"
            ? window.localStorage.getItem(STORAGE_KEY)
            : null;
        const pick =
          stored && res.data.some((m) => m.id === stored)
            ? stored
            : res.default;
        setSelectedIdState(pick);
      } catch {
        if (!cancelled) {
          setModels([{ id: "thirdparty/text-embedding-3-large" }]);
          setDefaultId("thirdparty/text-embedding-3-large");
          setSelectedIdState("thirdparty/text-embedding-3-large");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectModel = useCallback((id: string) => {
    setSelectedIdState(id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, id);
    }
  }, []);

  return {
    models,
    defaultId,
    selectedId: selectedId || defaultId,
    selectModel,
    loading,
  };
}
