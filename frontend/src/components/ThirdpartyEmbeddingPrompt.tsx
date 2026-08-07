"use client";

type Props = {
  open: boolean;
  reason?: string | null;
  models: { id: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

function labelForModel(id: string): string {
  return id.replace(/^thirdparty\//, "");
}

export function ThirdpartyEmbeddingPrompt({
  open,
  reason,
  models,
  selectedId,
  onSelect,
  loading = false,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="thirdparty-embed-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-[var(--laed-scrim)]"
        aria-label="Dismiss"
        onClick={onCancel}
      />
      <div
        className="relative z-10 max-w-md border border-[var(--laed-border)] bg-[var(--laed-paper-elevated)] p-5 shadow-lg"
        style={{ borderRadius: "var(--laed-radius-sm)" }}
      >
        <h2
          id="thirdparty-embed-title"
          className="text-[11px] font-semibold tracking-[1px] text-[var(--laed-navy)] uppercase"
        >
          External embedding required
        </h2>
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--laed-ink)]">
          On-device embedding (GPU) is unavailable right now. To search project
          documents for this request, choose a third-party embedding model.
        </p>
        {reason ? (
          <p className="mt-2 text-[10px] text-[var(--laed-muted)]">{reason}</p>
        ) : null}
        <div
          className="mt-3 border border-amber-200/80 bg-amber-50/90 px-3 py-2.5 text-[10px] leading-relaxed text-amber-950"
          style={{ borderRadius: "var(--laed-radius-sm)" }}
        >
          <strong className="font-semibold">Transit notice:</strong> Your prompt
          and any text sent for retrieval will leave the LAED closed-loop network
          and pass through an external gateway. LAED does not store this traffic
          outside its controlled infrastructure, but in-transit paths carry higher
          exposure than the default on-device route.
        </div>
        <label className="mt-4 block text-[9px] tracking-[1px] text-[var(--laed-muted)] uppercase">
          Embedding model
          <select
            value={selectedId}
            disabled={loading || models.length === 0}
            onChange={(e) => onSelect(e.target.value)}
            className="mt-1 w-full border border-[var(--laed-border)] bg-white px-2 py-2 text-[10px]"
            style={{ borderRadius: "var(--laed-radius-sm)" }}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {labelForModel(m.id)}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="border border-[var(--laed-border)] px-3 py-1.5 text-[10px] text-[var(--laed-muted)]"
            style={{ borderRadius: "var(--laed-radius-sm)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading || !selectedId}
            onClick={onConfirm}
            className="border-none bg-[var(--laed-navy)] px-3 py-1.5 text-[10px] text-white"
            style={{ borderRadius: "var(--laed-radius-sm)" }}
          >
            Use external embedding
          </button>
        </div>
      </div>
    </div>
  );
}
