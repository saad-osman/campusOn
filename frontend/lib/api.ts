import { reportUnavailable, waitForBackend } from "@/lib/backend-status";

// In the browser, calls go to this origin and next.config.mjs proxies them to
// FastAPI. Server components can't use a relative URL, so they hit the backend directly.
const API_URL =
  typeof window === "undefined" ? process.env.BACKEND_URL || "http://localhost:8000" : "";

export class ApiError extends Error {
  status: number;
  /** Raw `detail` from the FastAPI error body — a string for simple errors, or a
   *  structured object for errors like document version conflicts (409). */
  detail: unknown;
  /** Set when the server couldn't be reached at all (see isServerUnavailable). */
  unavailable = false;
  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

const UNAVAILABLE_MESSAGE = "The server is waking up. Try again in a moment.";

/** The request never reached a working API (asleep, restarting, or crashed); not an API answer. */
export function isServerUnavailable(err: unknown) {
  return err instanceof ApiError && err.unavailable;
}

/** Run `fn`; if the server was unreachable, wait for it to wake and run `fn` once more. */
export async function whenServerUp<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isServerUnavailable(err)) throw err;
    await waitForBackend();
    return fn();
  }
}

function unavailable(): ApiError {
  if (typeof window !== "undefined") reportUnavailable();
  const err = new ApiError(503, UNAVAILABLE_MESSAGE);
  err.unavailable = true;
  return err;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        ...(init?.body && !(init.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...init?.headers,
      },
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw unavailable(); // network error: nothing answered
  }

  if (!res.ok) {
    let message = res.statusText;
    let detail: unknown;
    let fromApi = false;
    try {
      const data = await res.json();
      detail = data.detail;
      fromApi = detail !== undefined;
      message = typeof data.detail === "string" ? data.detail : data.detail?.message || message;
    } catch {
      /* ignore */
    }
    // FastAPI errors carry a JSON `detail`. A 404/502/503/504 without one came from the
    // hosting layer instead: Render's plain "Not Found" when no instance is running, or the
    // proxy's 502/504 while the server sleeps.
    if (!fromApi && [404, 502, 503, 504].includes(res.status)) throw unavailable();
    // Next's own proxy (local dev) answers a refused connection with a bare 500 that has no
    // Content-Type; FastAPI's 500s are text/plain.
    if (!fromApi && res.status === 500 && !res.headers.get("content-type")) throw unavailable();
    // A bare 500 is either an API bug or (in local dev) the proxy failing to connect: keep
    // the error as is, and let a health check decide whether the server is down.
    if (!fromApi && res.status === 500 && typeof window !== "undefined") reportUnavailable();
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
