const OSS_EMBEDDING_CODE = "oss_embedding_unavailable";

type DetailObject = {
  code?: string;
  message?: string;
};

function detailFromBody(body: Record<string, DetailObject | string>): DetailObject | null {
  const detail = body.detail;
  if (typeof detail === "object" && detail !== null && !Array.isArray(detail)) {
    return detail;
  }
  return null;
}

export function parseHttpErrorBody(text: string): {
  code: string | null;
  message: string;
} {
  try {
    const parsed = JSON.parse(text) as Record<string, DetailObject | string>;
    if (typeof parsed !== "object" || parsed === null) {
      return { code: null, message: text };
    }
    const detail = detailFromBody(parsed);
    if (detail?.code === OSS_EMBEDDING_CODE) {
      const message =
        typeof detail.message === "string" && detail.message.length > 0
          ? detail.message
          : "On-device embedding is unavailable.";
      return { code: OSS_EMBEDDING_CODE, message };
    }
    if (typeof parsed.detail === "string") {
      return { code: null, message: parsed.detail };
    }
    return { code: null, message: text };
  } catch {
    return { code: null, message: text };
  }
}

export function isOssEmbeddingUnavailableCode(code: string | null | undefined): boolean {
  return code === OSS_EMBEDDING_CODE;
}

export const OSS_EMBEDDING_UNAVAILABLE = OSS_EMBEDDING_CODE;
