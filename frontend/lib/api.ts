// In the browser, calls go to this origin and next.config.mjs proxies them to
// FastAPI. Server components can't use a relative URL, so they hit the backend directly.
const API_URL =
  typeof window === "undefined" ? process.env.BACKEND_URL || "http://localhost:8000" : "";

export class ApiError extends Error {
  status: number;
  /** Raw `detail` from the FastAPI error body — a string for simple errors, or a
   *  structured object for errors like document version conflicts (409). */
  detail: unknown;
  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let message = res.statusText;
    let detail: unknown;
    try {
      const data = await res.json();
      detail = data.detail;
      message = typeof data.detail === "string" ? data.detail : data.detail?.message || message;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message, detail);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export { API_URL };
