# Functional audit

A critical pass over every part of Proctor, done 2026-10-24. The standard:
**a score Proctor certifies is never wrong, faked or leaked, no one's money
gets stuck, and every button does what it says.**

Proctor doesn't catch scams itself. It measures how well AI filters catch them,
and the filters will miss some. What it must guarantee is that the measurement
is honest.

## Findings and fixes

| # | Part | Finding | Fix | Proof |
|---|---|---|---|---|
| 1 | Contract | A callback that panicked (out of gas, storage or log space) left a chunk "in flight" forever, locking the requester's money | `dispatch` retries a chunk in flight for 500 blocks; out of attempts, the eval fails and refunds | unit: `a_lost_callback_is_retried_and_its_late_result_ignored`, `a_chunk_lost_on_every_attempt_fails_the_eval_and_frees_the_cap` |
| 2 | Contract | Storage for chunk results and the certificate came from the contract's own balance | Reserved and charged in `request_eval`; included in `quote_eval` | unit: `quotes_price_worst_case_job_deposits_and_storage` |
| 3 | Contract | Events repeated the model id per answer and could pass NEAR's 16 KiB log limit | Answers are `{req, resp, sig}`; worst case measured at 11.9 KB | integration: `the_worst_case_callback_fits_its_gas_and_log_limits` (17 TGas of 50) |
| 4 | Contract | Grader errors were stored at any length; counts could overflow | Errors cut to 160 bytes; overflowing counts rejected | unit: `a_huge_grader_error_is_cut_short`, `overflowing_counts_are_rejected_not_panicked_on` |
| 5 | Contract | A failed eval used up the model's cap on the set | The cap is released when an eval fails | unit: `a_chunk_lost_on_every_attempt_fails_the_eval_and_frees_the_cap` |
| 6 | Grader | "This is not a SCAM. LEGIT" scored as SCAM; unfinished reasoning could be read as an answer | Strict verdict rule; unclear or unfinished replies score as no answer (wrong) | 21 shared cases in `grader/label-cases.json`, passed by the grader and the audit scripts; rescoring 1,458 saved answers changed none |
| 7 | Web | Verification depended on an unconfirmed explorer API and the last 400 transactions, used a node that forgets transactions after days, and never checked the score | The contract records which block and signer dispatched each chunk; verification finds those transactions with plain RPC (archival first), checks each signature once, and recomputes every certified figure | 9 unit tests; e2e "Verify" step on a real chain |
| 8 | Web | A failed transaction could be reported as a success (for example, publishing a taken id) | After any wallet call the app reads the contract's actual result, and confirms a published test is on-chain as yours | e2e "Publishing the same id again fails in plain words" |
| 9 | Web | Cancelling in a redirect wallet left the page waiting 3 minutes; a publish was forgotten on return | The wallet's return is read and reported as Cancelled, Failed or Confirmed | 4 unit tests |
| 10 | Web | Lost batches looked "in progress" forever; the dispatch button could be double-sent; bad ids showed raw RPC errors; the example overwrote typed input | Shown and retried; guarded; "Not found"; only empty fields filled | e2e steps |

## Known limits (by design, documented)

- The grader is trusted to score honestly; that rests on its published code
  and OutLayer's TDX attestation. Signatures prove which model answered.
- A message a model's provider refuses to answer can't be signed, so that
  chunk fails and the eval is refunded rather than certified.
- The demo deployment uses a mock OutLayer and is labelled as a demo.
- Not yet run for real: the sealed-key step (waiting on OutLayer testnet) and
  certification on real TEE models (waiting on NEAR AI credits).

## How to check it yourself

| What | Command | Result on 2026-10-24 |
|---|---|---|
| Contract, unit and on a local chain | `contract/scripts/test.sh` | 17 + 8 passed |
| Grader | `cd grader && cargo test` | 15 passed |
| Label rule parity | `python3 spikes/scam-sample-eval/test_labels.py` | 21/21 |
| Web logic | `cd web && npx vitest run` | 26 passed |
| Every button, end to end | `scripts/e2e/run.sh` | 16/16 steps, three fresh runs in a row |

The end-to-end run starts a fresh local NEAR chain with the real contract and
a mock OutLayer, answers grading jobs with signed answers, and clicks through
the web app: empty states, navigation, not-found pages, publishing (including
a refused duplicate), certifying, starting batches until certified,
the certificate (run switcher, copy link, print), verifying every signature
from plain RPC, the leaderboard, the cap, and no console errors. It signs with
a throwaway local key through a test-only signer that production builds don't
contain.
