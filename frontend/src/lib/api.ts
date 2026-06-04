const TOKEN_STORAGE_KEY = "laed_access_token";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string | null): void {
  if (typeof window === "undefined") {
    return;
  }
  if (token === null) {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    return;
  }
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export type ApiFetchOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
  skipAuth?: boolean;
};

export class ApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE ?? "";
}

/** WebSocket origin aligned with REST (`NEXT_PUBLIC_API_BASE` when set). */
export function apiWebSocketUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const base = apiBaseUrl();
  if (base.length > 0) {
    const httpBase =
      base.startsWith("http://") || base.startsWith("https://")
        ? base
        : `https://${base}`;
    const parsed = new URL(httpBase);
    const protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${parsed.host}${normalized}`;
  }
  if (typeof window === "undefined") {
    return "";
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${normalized}`;
}

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { skipAuth = false, headers = {}, ...init } = options;
  const token = skipAuth ? null : getStoredToken();

  const authHeaders: Record<string, string> =
    token !== null ? { Authorization: `Bearer ${token}` } : {};

  const hasBody = init.body !== undefined && init.body !== null;
  const contentHeaders: Record<string, string> = hasBody
    ? { "Content-Type": "application/json" }
    : {};

  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...contentHeaders,
      ...authHeaders,
      ...headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 401 && typeof window !== "undefined") {
      setStoredToken(null);
      window.location.href = "/login";
    }
    throw new ApiError(response.statusText, response.status, body);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (text.length === 0) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

export async function apiUpload<T>(
  path: string,
  formData: FormData,
): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> =
    token !== null ? { Authorization: `Bearer ${token}` } : {};

  const response = await fetch(`${apiBaseUrl()}${path}`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 401 && typeof window !== "undefined") {
      setStoredToken(null);
      window.location.href = "/login";
    }
    throw new ApiError(response.statusText, response.status, body);
  }

  return JSON.parse(await response.text()) as T;
}
