# Build plan

Hackathon: 2026-11-01 00:00 UTC to 2026-11-14 23:59 UTC. Target: submit on
**2026-11-13**, keeping the last day as a buffer.

The hackathon allows prior work. Most of the product was built before Nov 1
(Oct 22 to 26); the README's "Prior work" section says what was done when,
and the git history has the dates.

Flagship demo: certifying AI scam filters on a private scam test set
(`SCAM_TESTSET_DESIGN.md`). The maths contamination check is a secondary
example.

Tracks to enter: `privacy` (main), `security` (the track brief names "scam
detection" and "reputation"), `open`. Add `agents` only if the
agent-evaluation stretch goal ships.

## Before Nov 1 (research only)

| Day | Work | Done when |
|---|---|---|
| Oct 24–25 | Settle open questions 1–5 in `ARCHITECTURE.md` on testnet | Each has a recorded answer in `spikes/SPIKE_NOTES.md` |
| Oct 26–27 | Finalise the scam test-set design and scoring rules; write the 20-item public sample; pick 3–4 TEE models to evaluate | You've approved `SCAM_TESTSET_DESIGN.md` and the sample |
| Oct 28–31 | Write the private scam set (about 150–200 items) outside the repo, labelled and reviewed by both of us | Every item has a label, category and one-line rationale; no item in git |
| Oct 28–31 | Final name; frontend wireframe; README outline with "do X, see Y" steps | You've approved them |

## Week 1: the core works end to end on testnet

| Day | Work | Done when |
|---|---|---|
| Nov 1 | Repo layout (`contract/`, `grader/`, `web/`, `scripts/`), CI with fmt, clippy, tests and web build | CI is green on an empty skeleton |
| Nov 2 | Grader: load items, call NEAR AI, verify signature, score `exact`/`numeric`; local tests against a mock server | Unit tests pass offline |
| Nov 3 | Grader on OutLayer testnet with a locked test-set secret; chunking | A real chunk returns an aggregate score and signatures |
| Nov 4 | Contract: sets, models, `request_eval`, chunk fan-out to OutLayer | Sandbox tests pass (near-workspaces) |
| Nov 5 | Contract: `on_chunk` with on-chain signature checks, aggregation, certificates, royalties, refunds | Sandbox tests cover the success path, a failed chunk and a bad signature |
| Nov 6 | End-to-end on testnet: one model, a 20-item set, certificate on-chain | A certificate can be viewed through RPC |
| Nov 7 | Seal the private scam set on testnet; certify 3–4 models; run the public sample for comparison; maths check if time allows | Results table with real numbers |

## Week 2: product, polish, submission

| Day | Work | Done when |
|---|---|---|
| Nov 8 | Web: leaderboard and certificate page with in-browser verification | Works against the testnet contract |
| Nov 9 | Web: author upload (encrypt in the browser, register) and requester flow (wallet, pay, live chunks) | A full flow done in the browser |
| Nov 10 | Payments: NEAR + NEP-141 USDC; leakage controls (cap, aggregate only) | Tests for over-cap and underpayment |
| Nov 11 | Hardening: timeouts and `cancel_stale_execution`, retries, error messages; stretch: cross-chain payment through 1-Click | No known failure path leaves funds stuck |
| Nov 12 | README for judges (problem, how it works, "do X, see Y", NEAR tech used, limitations); diagram; deploy the web app | A fresh reader can follow the README to a verified certificate |
| Nov 13 | Demo video (60–90 s), draft X post, final testnet run; **you** make the repo public, post on X, and approve the submission payload | Submitted |
| Nov 14 | Buffer | |

## Costs

- Testnet NEAR: free from the faucet.
- OutLayer: about 0.001–0.01 testnet NEAR per chunk.
- NEAR AI inference: roughly 4 models × 2 sets × 100 items × about 1.5k tokens
  ≈ 1.2M tokens, a few dollars at most at $0.04–$1.80 per million input
  tokens.
- Payout address: an implicit NEAR account is free.

## Risks

| Risk | Mitigation |
|---|---|
| Can't pass the author's set and the API key in one secret profile | Resolve before Nov 1; fallbacks in open question 1 |
| FastFS outage | Host grader builds at another public HTTPS URL with a pinned hash |
| A TEE model is slow or reasons at length, so a chunk exceeds 180 s | Smaller chunks, reasoning off, measured per model on Nov 7 |
| Results show no gap between public and private scores | Publish honestly; the product's value is a score you can verify, whatever it is |
| Every model scores near 100% on the scam set | Hard cases carry the set (look-alike legitimate messages, subtle new scam types); try the public sample on 2–3 TEE models directly on Oct 27 and adjust the mix before writing the private set |
| The private scam set leaks | Never in git or anywhere public. As its authors we know its contents, as any author does; Proctor's promise is that nobody *else* (model vendors, OutLayer, NEAR AI) can read it once sealed. Delete local copies after sealing |
| Scope creep | Stretch goals (cross-chain payment, agent evals, DAO-run model registry) only after Nov 10 and only if the core is green |
| Another team builds the same idea | Keep the idea out of public channels until the submission |
