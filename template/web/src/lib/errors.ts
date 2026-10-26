/** Turn API and network errors into a sentence a person can act on. */

const RULES: [RegExp, string][] = [
  [/user (rejected|cancel|closed)|cancelled|canceled|aborted by user/i, "Cancelled. Nothing was sent."],
  [/failed to fetch|networkerror|load failed|network request failed/i, "Can't reach the server right now. Check your connection and try again; nothing was sent."],
  [/HTTP 429|too many requests/i, "The server is busy. Wait a few seconds and try again."],
  [/HTTP 5\d\d|timeout|timed out/i, "The server took too long to answer. Try again in a moment."],
  [/HTTP 404|not found/i, "Not found. It may have been removed, or the link is wrong."],
  // Add your product's own errors here, most specific first.
];

export function friendlyError(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);
  for (const [re, msg] of RULES) if (re.test(raw)) return msg;
  return `Something went wrong: ${raw}`;
}

export const isCancel = (msg: string) => msg.startsWith("Cancelled");
