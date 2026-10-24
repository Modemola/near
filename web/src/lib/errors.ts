/** Turn wallet, RPC and contract errors into a sentence a person can act on. */

const RULES: [RegExp, string][] = [
  [/user (rejected|cancel|closed)|rejected by user|cancelled|canceled|popup closed|window closed/i, "Cancelled. Nothing was sent."],
  [/failed to fetch|networkerror|load failed|network request failed/i, "Can't reach NEAR right now. Check your connection and try again; nothing was sent."],
  [/HTTP 429|too many requests/i, "NEAR's public servers are busy. Wait a few seconds and try again."],
  [/HTTP 5\d\d|timeout|timed out/i, "NEAR took too long to answer. Try again in a moment."],
  [/notenoughbalance|not enough balance|lackbalanceforstate/i, "Your account doesn't have enough NEAR for this. Top it up and try again."],
  [/eval cap reached/i, "This model has used all its test runs on this test. Caps stop repeated runs from revealing the messages."],
  [/attach at least/i, "The deposit attached was too small. Reload the page to get the current price and try again."],
  [/set id taken|set exists/i, "That test id is already taken. Choose another."],
  [/invalid set id/i, "The test id can only use letters, digits and - _ . /"],
  [/no such set/i, "There is no test with that id."],
  [/set is retired/i, "This test has been retired by its author and no longer takes new runs."],
  [/model not registered/i, "That model isn't registered yet, so it can't be tested."],
  [/no such eval/i, "There is no test run with that number."],
  [/escrow exhausted/i, "This run has used up its grading deposit, so no more batches can start. Unused funds were refunded."],
  [/author share above 100/i, "Your share can't be more than 100%."],
  [/chunk size 1 to 40/i, "Messages per batch must be between 1 and 40."],
  [/paused/i, "Proctor is paused for maintenance. Reading results still works."],
  [/accountdoesnotexist|account .* does not exist/i, "That NEAR account doesn't exist on this network."],
  [/codedoesnotexist|methodnotfound|methodresolveerror/i, "There is no Proctor contract at the configured address."],
];

export function friendlyError(e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : JSON.stringify(e);
  for (const [re, msg] of RULES) if (re.test(raw)) return msg;
  return `Something went wrong: ${raw}`;
}

export const isCancel = (msg: string) => msg.startsWith("Cancelled");
