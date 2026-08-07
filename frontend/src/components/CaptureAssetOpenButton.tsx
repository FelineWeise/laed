"use client";

import { useState } from "react";
import { apiFetchBlobUrl } from "@/lib/api";
import { Tip } from "@/components/Tip";
import type { CaptureAsset } from "@/lib/types";

type Props = {
  asset: CaptureAsset;
};

/**
 * Opens capture media through the authenticated API (MinIO host is internal).
 */
export function CaptureAssetOpenButton({ asset }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function openAsset() {
    if (!asset.download_url) return;
    setBusy(true);
    setErr(null);
    try {
      const objectUrl = await apiFetchBlobUrl(asset.download_url);
      if (asset.asset_kind === "image") {
        window.open(objectUrl, "_blank", "noopener,noreferrer");
      } else if (asset.asset_kind === "audio" || asset.asset_kind === "video") {
        window.open(objectUrl, "_blank", "noopener,noreferrer");
      } else {
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = asset.filename ?? "capture";
        a.click();
      }
      // Keep object URL alive briefly for the new tab; revoke later.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch {
      setErr("Could not open file");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="min-w-0 flex-1">
      <Tip tip={err ?? "Open / preview"}>
        <button
          type="button"
          disabled={busy || !asset.download_url}
          onClick={() => void openAsset()}
          className="w-full cursor-pointer truncate border-none bg-transparent p-0 text-left text-[9px] text-[#3a3733] hover:underline disabled:opacity-50"
        >
          <span className="mr-1 text-[7px] font-bold tracking-wide text-[var(--laed-muted)] uppercase">
            {(asset.filename ?? "").split(".").pop() ?? asset.asset_kind}
          </span>
          {asset.filename ?? asset.asset_kind}
        </button>
      </Tip>
    </span>
  );
}
