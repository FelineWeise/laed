"use client";

import { useLlmModels } from "@/lib/hooks/useLlmModels";

type Props = {
  className?: string;
};

export function LlmModelSelect({ className = "" }: Props) {
  const { models, selectedId, selectModel, loading } = useLlmModels();

  if (loading || models.length === 0) {
    return null;
  }

  return (
    <select
      value={selectedId}
      onChange={(e) => selectModel(e.target.value)}
      className={
        className.length > 0
          ? className
          : "max-w-[180px] shrink-0 border border-[var(--laed-border)] bg-white px-2 py-1 text-[9px]"
      }
      aria-label="LLM model"
    >
      {models.map((m) => (
        <option key={m.id} value={m.id}>
          {m.id.replace(/^ollama\//, "").replace(/^thirdparty\//, "")}
        </option>
      ))}
    </select>
  );
}
