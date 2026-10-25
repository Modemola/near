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
| 11 | Web | On testnet the public RPC rate-limits bursts, so verification (and page loads) could fail with "Can't reach NEAR" | Requests switch to a second public endpoint (FastNEAR) when one is busy, with backoff; verification reads only the signer's shard (about 3 requests per transaction instead of about 20) | 3 unit tests for failover, 2 for shards; both live testnet certificates verify in a browser |
| 12 | Mock OutLayer | The test stand-in kept every grader output forever and ran out of storage on testnet | It frees each output once delivered | contract integration tests; testnet demo re-run |

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
| Web logic | `cd web && npx vitest run` | 31 passed |
| Every button, end to end | `scripts/e2e/run.sh` | 16/16 steps, four fresh runs |
| Live testnet demo | Verify on `/certificates/0` and `/certificates/1` | 40/40 answers each, totals match |

The end-to-end run starts a fresh local NEAR chain with the real contract and
a mock OutLayer, answers grading jobs with signed answers, and clicks through
the web app: empty states, navigation, not-found pages, publishing (including
a refused duplicate), certifying, starting batches until certified,
the certificate (run switcher, copy link, print), verifying every signature
from plain RPC, the leaderboard, the cap, and no console errors. It signs with
a throwaway local key through a test-only signer that production builds don't
contain.

## Interface audit (2026-10-25)

Same standard for everything people see and touch. Automated with
`AUDIT=<dir> scripts/e2e/run.sh`, which runs the end-to-end flow on a fresh
local chain and then audits every page on that real data: axe-core in light
and dark mode, keyboard-only use, layout at 320 to 1920 px, reduced motion,
NEAR unreachable, copy rules, page metadata, load metrics on a production
build, and Lighthouse.

| Measure | Before | After |
|---|---|---|
| axe violations (8 pages, light and dark) | 44 | 0 |
| Keyboard: controls reachable by Tab, with a visible focus | gaps on 3 pages | every control on all 8 pages |
| Layout problems at 320 to 1920 px | overflow, overlaps, cut-off text | none |
| Lighthouse accessibility / best practices / SEO | 97 / 100 / 92 | 100 / 100 / 100 on every page |
| Lighthouse performance, phone (home / certificate / publish) | 66 / 53 / 23 | 89 / 83 / 90 (varies a few points per run) |
| Lighthouse performance, desktop | 95 / 97 / 56 | 100 / 100 / 100 |
| Layout shift while loading | up to 0.68 | 0 to 0.003 |
| JavaScript before first render | 1.63 MB | 306 KB (98 KB compressed) |

### Findings and fixes

| # | Area | Finding | Fix |
|---|---|---|---|
| U1 | Accessibility | Counting numbers and decoding hashes put a label on an element that can't carry one, so screen readers could skip the value | The real value sits in screen-reader text; the animation is hidden from them |
| U2 | Accessibility | Headings skipped from h1 to h3 | Panel titles are h2 (styled as before) |
| U3 | Accessibility | Small green labels, muted text and links failed contrast where the aurora shows through | Darker small text and links; softer aurora; one kicker style fixed |
| U4 | Accessibility | Empty leaderboard column header; a scrolling table the keyboard couldn't reach; the decorative cube announced with a blank name | Named; focusable region; hidden from screen readers |
| U5 | Accessibility | Focus outlines cut off inside clipping boxes; under reduced motion they animated in from zero | Inset outlines there; transitions off entirely under reduced motion |
| U6 | Accessibility | Every page titled "Proctor"; page changes not announced; no skip link | Per-page titles, a live announcement on navigation, Skip to content |
| U7 | Speed | Wallet libraries (1.2 MB) and their font loaded before anything rendered | Loaded when the browser is idle; every page but the landing page loads its own code |
| U8 | Speed | Google Fonts blocked first paint; web fonts arriving late shifted text | Fonts ship with the site; the two first-paint fonts are preloaded |
| U9 | Speed | The 3D vault blocked the main thread for minutes on a phone-class CPU without a GPU | Real 3D only on desktop with a hardware GPU, capped at 30 fps; the CSS cube elsewhere |
| U10 | Speed | The message scanner read every card's layout each frame; the aurora animated forever on phones | Positions computed, not measured; still aurora on phones |
| U11 | Layout | The demo notice appeared late at the top and pushed the page down | A Demo chip in the fixed-height header, with the explanation one tap away |
| U12 | Layout | Long account names cut off; the phone menu cut off with no hint it scrolls; a cramped bento tile on phones; large page art pushing forms down | Ellipsis, edge fade, stacked tile, smaller art on phones |
| U13 | States | With NEAR unreachable, pages took 6 to 8 seconds to say so | About 2 seconds; verification keeps longer patience |
| U14 | Copy | "1 N" for NEAR; a test named by id; a label that disagreed with its value; "4000 tokens"; "Run nonces"; "2 times"; the scanner showed 11 scams before any real message; the foil seal printed a raw key | Fixed wording; scanner alternates scams and real messages; seal shows the serial |
| U15 | Sharing | No link-preview image or tags, no theme colour or phone icon, no message without JavaScript, no robots.txt | Added, including a 1200 x 630 preview card |
| U16 | Browsers | Two glass effects and two fades lacked Safari prefixes; iPhones never sent tilt to the foil seal | Prefixed; the foil asks for tilt permission on first tap |

### Limits of this audit

- Only Chromium is installed here, so Firefox and Safari were checked by
  reading the CSS against their support, not by running them.
- Lighthouse simulates a mid-range phone; numbers on real devices will vary.
- The remaining phone gap is first paint on a slow connection: a single-page
  app needs its JavaScript before it can draw.
