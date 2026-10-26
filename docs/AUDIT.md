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
| Every page on 16 screen sizes | `RESPONSIVE=<dir> scripts/e2e/run.sh` | 128/128 clean (2026-10-25) |
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

## Responsive audit (2026-10-25)

Same standard again, for every screen size: no component overlaps another,
nothing escapes its container, nothing is cut off at the screen edge, and no
text spills out of its box. Automated with `RESPONSIVE=<dir> scripts/e2e/run.sh`,
which checks all 8 pages on 16 screen sizes on the end-to-end test's real data:

| Group | Sizes |
|---|---|
| Small phones | Galaxy Fold 280 x 653, iPhone SE 320 x 568 |
| Phones | 375 x 667, 390 x 844, 412 x 915 |
| Phones turned sideways | 568 x 320, 844 x 390 |
| 200% browser zoom | 1280 x 720 at 200% (640 x 360) |
| Tablets | iPad mini 768 x 1024, iPad 1024 x 768, iPad Pro 1024 x 1366 |
| Laptops and desktops | 1280 x 720, 1366 x 768, 1440 x 900, 1920 x 1080, 2560 x 1440 |

Beyond the checks of the interface audit (which looked at text only), it
compares whole components (panels, tiles, cards, buttons, form fields, the 3D
and animated scenes), opens each header popup, plays the pinned story at four
scroll positions with motion on, and checks that its pieces keep their own
space, that pinned sidebars fit on screen, that decoration is never cut
off by the screen edge, and that header items stay on one line with the
account name in full.

| Measure | Before | After |
|---|---|---|
| Page and screen-size combinations with no problem | 7 of 120 | 128 of 128 (one more size, 200% zoom, and stricter checks added along the way) |
| End-to-end steps, axe violations, Lighthouse accessibility / best practices / SEO | 16/16, 0, 100 | unchanged: 16/16, 0, 100 on every page |

### Findings and fixes

| # | Area | Finding | Fix |
|---|---|---|---|
| R1 | Header | On the iPad mini (768 to 900 px) the header tried to fit on one row and the account button ran off the screen | The header uses its two-row layout up to 900 px |
| R2 | Header | The Demo and Test signer popups covered the bottom of the header (by 14 px on phones, 2 px on desktop) | The header publishes its real height; popups open below it at every size, and scroll if the screen is short |
| R3 | Layout | On 280 to 320 px phones, two-column grids asked for 280 px columns, pushing the Tests cards and the Publish form fields off the screen | Columns never ask for more than the space they have |
| R4 | Layout | A panel's title and its serial number could not wrap, so the serial was cut off on the narrowest phones | They share a row while they fit, then wrap |
| R5 | Leaderboard | Beside a sidebar on an iPad, the leaderboard's column headings spilled out of their columns | The leaderboard stacks whenever its own box is narrow (a container query), not only on phones |
| R6 | Story | The pinned story assumed a fixed header height, and on short screens (small phones, phones sideways, 200% zoom) its scene could not fit below the header | It pins right below the header's real height, and on screens too short for it lays out as a plain section with every step shown |
| R7 | Story | In the last step the Certified stamp covered the NEAR block and the hardware frame; on phones the answer beads touched the block; the AI model chip crossed the secure-hardware frame | Each piece has its own space at every size; the model chip sits inside the frame |
| R8 | Sidebars | On laptops and landscape iPads, pinned sidebars on the test and How it works pages were taller than the screen, so their end could not be reached | A sidebar stays pinned only while it fits; a taller one scrolls with the page |
| R9 | Hero | On phones the fanned cards behind the top result reached past the screen edge | They fan upward with less tilt on phones |
| R10 | Cursor | On desktop the cursor ring sat in the middle of the screen until the mouse first moved | Hidden until the mouse moves, then appears where it is |
| R11 | Header | Above 1380 px the header stops growing but showed its longest labels, so the account name was squeezed to "alice.te…" on every large screen, and at 1280 px the TESTNET label wrapped onto two lines | Notice chips keep short labels at every width (details are in their popups), the account button never shrinks, and the network label stays on one line |

Two reports in the first run came from the checker, not the site, and the
checker was corrected: it measured the story with reduced motion (where the
story is deliberately not pinned), and it measured the tilted 3D hero card's
sloped outline rather than its layout.

## First impressions (2026-10-25)

Two changes aimed at what a visitor sees in their first minute.

**Check it yourself, from the home page.** Under the hero, the top result
sits next to the check that proves it. One click re-checks every signed answer
in the visitor's browser, from a public NEAR node, and ends with "What just
happened": the batches found in NEAR's records, the signatures checked, and
the sum that matches the certificate. The checking code loads only when
someone clicks. The end-to-end test runs it (step "Home: one click checks the
top result").

**Pre-rendered pages.** The home, Tests, Publish and How it works pages read
nothing from the chain before their first render, so `npm run build` renders
them to HTML (`web/scripts/prerender.mjs`, using `src/entry-server.tsx`), with
their stylesheet inline. Phones draw them before the JavaScript arrives, and
visitors without JavaScript see the page instead of a notice. React then
attaches to that HTML in place (it does not redraw it). The UI audit checks
this on every run: each pre-rendered page attaches with no hydration errors,
with motion on and off.

| Lighthouse, simulated phone (3 runs each) | Plain build | Pre-rendered |
|---|---|---|
| Home | 84 to 91, largest paint 2.9 to 3.0 s | 88 to 95, 2.6 to 2.9 s |
| How it works | 80 to 92, 3.0 s | 89 to 94, 2.7 to 3.0 s |
| Publish | 84 to 91, 3.0 to 3.3 s | 88 to 95, 2.6 to 2.8 s |

On Lighthouse's simulated connection the first paint (2.2 to 2.3 s) is now set
by network round trips, not by JavaScript; on a real slow phone the gain is
larger, because the page no longer waits for the scripts to download and run.

After both changes, a full run on a fresh chain: end-to-end 17/17, 128/128
page and screen-size combinations clean, axe 0, every pre-rendered page
attaches with no hydration errors, layout shift 0 to 0.003, and Lighthouse
93 / 94 / 94 on a simulated phone (home / certificate / publish) and 100 on
desktop, with accessibility, best practices and SEO at 100 throughout.

Hosting: serve each page's `<page>.html` or `<page>/index.html` (both are
written), and fall back to `app.html` for every other address. A host that
falls back to `index.html` instead still works: a small script clears the home
page's HTML before it is drawn on any other address.

## Smoothness (2026-10-26)

On a real laptop the deployed site lagged heavily. None of the earlier checks
measured it: Lighthouse and the load metrics score loading, not how smoothly
the page moves once loaded. A profile of the production build showed the home
page at about 5 frames a second, idle or scrolling, with almost all the time
spent drawing frames: three 70px-blurred background glows and a live blur
behind every glass panel were recomputed on every frame, and something always
moved (a forever-floating hero card, the cursor's endless loop, a headline
shimmer), so frames never stopped. Scroll handlers also set a style value on
`<html>`, which made the browser recheck every element's style on every
scroll frame.

| Fix | Effect |
|---|---|
| Background glows drawn as gradients, not moving and not blurred | the biggest single cost gone |
| Live glass blur only on the header, popups and notifications | no blur recomputed behind content |
| Cursor loop sleeps once settled; hero card tilts but doesn't float; repainting loops play once | the page stops drawing when nothing changes |
| Scroll progress set on the bar and the story rail, not on `<html>` | no whole-page style checks while scrolling |

| Page (software rendering) | Before | After |
|---|---|---|
| Home, idle / scrolling | 5 / 5 fps | 60 / 40 fps |
| How it works | | 55 / 55 fps |
| Certificate | | 60 / 50 fps |
| Tests | | 56 / 52 fps |

End-to-end 17/17 after the change. The starter in `template/` now has a
permanent smoothness check (`template/audit/smoothness.mjs`).
