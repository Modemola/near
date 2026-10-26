/** One way to talk to your backend: JSON, a timeout, and errors friendlyError understands. */
export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "";

export async function getJson<T>(path: string, { timeoutMs = 8000, ...init }: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const res = await fetch(API_URL + path, { ...init, signal: AbortSignal.timeout(timeoutMs) }).catch((e: Error) => {
    throw new Error(e.name === "TimeoutError" ? "timed out" : e.message);
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}
