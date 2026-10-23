# Architecture: private, certified AI benchmarks on NEAR

Working name: **Proctor**. The name isn't final.

## The problem

AI is becoming the scam filter for inboxes, banks, messaging apps and family
phones. The only evidence of how well a model catches scams is the vendor's own
number on a benchmark it picked.

Public scam benchmarks have two problems:

- They leak into training data, so models are tuned for exactly those
  examples.
- Scammers can read them too, and keep testing their scripts against them
  until they get through.

A scam test set is only useful while it stays secret. Keeping it secret
usually means trusting whoever holds it and runs the evaluation.

The same applies to AI benchmarks in general (contaminated, self-reported,
uncheckable scores). Scam detection is where the stakes are easiest to see.

## The pitch

*Every vendor grades its own AI scam filter. Proctor certifies it on scams it
has never seen, without anyone, including us, seeing the test set.*

## What Proctor does

1. A **test-set author** uploads a test set. It is encrypted in the author's
   browser so that only one open-source grader program, identified by the
   SHA-256 of its WASM build, can decrypt it, inside an Intel TDX enclave.
   Nobody else can read it: not us, not the enclave operator, not the model
   owner.
2. A **requester** (a lab, a buyer, an agent) pays to evaluate a model on that
   set.
3. The grader runs on **OutLayer** (TDX). It decrypts the set, asks a **NEAR AI
   Cloud** model running in a GPU TEE to answer each item, checks the model's
   signed responses, and returns only an aggregate score.
4. The **Proctor contract** on NEAR receives the result through OutLayer's
   yield/resume callback. It verifies the model's Ed25519 response signatures
   on-chain, records a **certificate** (model, test-set commitment, grader
   hash, score, attestation references) and pays the author a royalty.
5. Anyone can re-check a certificate: the contract state, the per-job TDX
   attestation and the per-answer TEE signatures are all public.

## Components

```
 Author (browser)                         Requester (wallet)
   │ encrypt(test set) to OutLayer          │ request_eval(set, model) + payment
   │ keystore, locked to grader hash        ▼
   │ register_set(commitment, price) ─▶ ┌──────────────────────────────┐
   │                                    │ Proctor contract (NEAR)      │
   ▼                                    │ sets · models · evals ·      │
 OutLayer keystore (MPC-derived keys)   │ certificates · royalties     │
   ▲                                    └──────┬───────────────▲───────┘
   │ decrypt only for grader hash +            │ request_execution  │ yield/resume
   │ calls coming from Proctor                 ▼ (per chunk)        │ callback
   │                                    ┌──────────────────────────────┐
   └──────────────────────────────────  │ Grader (WASI p2, Rust) on an │
                                        │ OutLayer TDX worker          │
                                        └──────┬───────────────▲───────┘
                                               │ HTTPS (TLS ends in TEE)
                                               ▼               │ answer + provider_tee signature
                                        ┌──────────────────────────────┐
                                        │ NEAR AI Cloud, Confidential  │
                                        │ TEE model (H100 CC mode)     │
                                        └──────────────────────────────┘
```

### 1. Proctor contract (Rust, near-sdk 5.29)

State:

- **Graders**: an allow-list of grader WASM hashes and their source commits
  (reproducible builds).
- **Models**: `model_id` → Ed25519 signing key(s), taken from NEAR AI
  attestation reports. Registered by an attester role for the hackathon; see
  the trust model below.
- **Test sets**: id, author, commitment = SHA-256 of the canonical plaintext,
  item count, chunk count, scoring type (`classification` for the scam set,
  plus `exact`/`numeric`), price, royalty split, submission cap per model,
  status.
- **Evals**: requester, set, model, nonce, chunk results, state.
- **Certificates**: eval id, model, set commitment, grader hash, score,
  per-chunk OutLayer request ids, Merkle root of per-item answer records,
  block height.

Flow:

- `request_eval(set_id, model_id)` (payable). Checks the price and the
  submission cap, then starts one `outlayer.request_execution` per chunk with:
  - `source`: the grader's `WasmUrl` + hash
  - `secrets_ref`: the author's profile for this set
  - `input`: `{set_id, chunk, model, nonce}`
  - a callback to `on_chunk`
- `on_chunk` (private). Parses the grader output and verifies each answer's
  `provider_tee` signature with `env::ed25519_verify` against the registered
  model key (proven on testnet: `spikes/outlayer-caller`). Stores the partial
  score. When every chunk is in, it finalises the certificate and pays the
  royalty and protocol fee. A failed or timed-out chunk refunds that part, and
  the eval can be retried.
- Payment in NEAR and in NEP-141 USDC through `ft_on_transfer`. Cross-chain
  payment through NEAR Intents 1-Click is a stretch goal. NEAR Intents exist
  on mainnet only, which OutLayer's skill index confirms, so a testnet demo
  can't show it.
- Leakage controls: a submission cap per (set, model); only aggregate scores
  are published, never which items were right.

Rules from OutLayer's `building-outlayer-apps` skill:

- Pin a `rust-toolchain.toml`. Build contracts only with `cargo near build`.
- Always attach a `resource_limits` value; a request without one runs
  nothing.
- Attach at least 0.01 NEAR per request, or what `estimate_execution_cost`
  returns. Pass the remaining gas to OutLayer with `with_unused_gas_weight(1)`.
- The callback receives `Result<Option<String>, PromiseError>`. OutLayer adds
  no envelope: the grader's stdout comes back verbatim, so the grader emits
  `{success, output, error}` itself.

### 2. Grader (Rust → `wasm32-wasip2`, runs on OutLayer)

Built as `[[bin]]` (not `[lib]`). The manifest is embedded in the
`outlayer.manifest` custom section, so the WASM's sha256 covers it.
`stdout` is flushed explicitly. Encryption keys need `wasm32-wasip2`, and
their host functions exist only on OutLayer workers, so local tests stub
them.


- Reads its chunk of the test set from the decrypted secret (environment
  variable), or from `outlayer::storage` if the set is too large for a secret.
- At chunk start it fetches `/v1/attestation/report` for the model with the
  eval nonce and keeps the model's signing key.
- For each item it builds the exact request bytes (canonical model id,
  `x-no-aliasing: true`, non-streamed, temperature 0, enough tokens for
  reasoning or reasoning off) and calls `/v1/chat/completions`. It then
  fetches `/v1/signature/<id>?signing_algo=ed25519`, checks the signature and
  that the signer matches the preflight report, and scores the answer.
- Output (JSON, a few KB per chunk): `{set_id, chunk, model, n, correct,
  confusion: {tp, fp, tn, fn}, signer, attestation_report_sha256,
  items: [{text, signature}], records_root}`.
  It holds no item content and no per-item correctness. Only aggregate counts
  leave the enclave. OutLayer's two-call flow handles larger outputs.
- For the scam set, the model gets a fixed system prompt plus the message
  (channel, sender display and text) and must answer `SCAM` or `LEGIT` with a
  one-line reason. The grader takes the label after any `</think>`. An
  answer it can't parse counts as wrong, never as skipped.
- Each job is capped at 180 s. Measured on the public scam sample, slow models
  take up to about 30 s per item with reasoning, so a chunk is about 5 items
  for slow models and up to about 20 for fast ones. Chunk size is set per
  model, unless parallel requests inside the grader prove workable.
- The token budget (`max_tokens`) is fixed per set and recorded in the
  certificate. An answer that runs out of budget counts as wrong.

### 3. Frontend (TypeScript, React)

- **Leaderboard**: certified scores by model and test set, each with a
  "verify yourself" panel. It re-checks the signatures in the browser and
  links to the NEAR transaction and the OutLayer attestation for each chunk.
- **Author flow**: upload JSON/CSV; the browser canonicalises it, computes the
  commitment, encrypts it to the OutLayer keystore key locked to the grader
  hash, and registers the set with its price and royalty.
- **Requester flow**: pick a model and a set, pay with a NEAR wallet, and watch
  the chunks resolve live.
- **Scam-filter leaderboard** (the landing page): certified detection rate,
  false-alarm rate and overall accuracy for each TEE model on the private scam
  set. Next to each, the same model's score on the public sample (see below),
  so any gap between public and private is visible.
- **Contamination view** (secondary): a model's score on a public maths
  benchmark next to its certified score on a private equivalent set.

### 4. Demo data

- **Flagship: the private scam set.** About 150–200 labelled messages across
  current scam types and realistic legitimate look-alikes. The design is in
  [`SCAM_TESTSET_DESIGN.md`](SCAM_TESTSET_DESIGN.md). The set is written and
  reviewed outside the repo, encrypted in the browser flow, and never
  committed. A small **public sample** (about 20 items, clearly marked
  public) is committed so judges can see what the items look like and
  compare scores.
- **Secondary: maths contamination check.** Templated grade-school maths
  items (new numbers and names, known answers, in the spirit of GSM-Symbolic),
  each with a public counterpart from a widely published benchmark. Generated
  from a secret seed and never committed.
- We publish whatever results we get, including no gap if there is none.

## Trust model

| Trusted | Why |
|---|---|
| Intel TDX and NVIDIA confidential-computing hardware | Root of the attestations |
| OutLayer worker measurements | Approved on-chain (`worker.outlayer.near` / testnet), verified against TDX quotes |
| NEAR AI model signing key | Bound to the model's attestation report (Intel quote + NVIDIA payload), fetched with our nonce |
| Grader code | Open source; anyone can rebuild it and compare the SHA-256 |
| NEAR consensus | Stores the certificate and runs the signature checks |

| Not trusted | |
|---|---|
| Us (the Proctor operators) | We never see a test set in plaintext |
| The OutLayer and NEAR AI operators | They can refuse service, but can't read secrets or forge results |
| Requesters and model owners | They see only aggregate scores |

## Known limitations (to state in the README)

- Only models served in a TEE can be evaluated privately. NEAR AI's OpenAI,
  Anthropic and Google models are marked `verifiable: false`, and sending a
  test set to them would leak it.
- **Model keys are registered by an attester role** for the hackathon. The
  attestation is verified off-chain and the key is registered in the
  contract. A later version could do this in the grader or through a DAO.
- **A per-answer signature proves which model produced the answer, not that
  the grader scored it honestly.** Honest scoring rests on the grader hash
  and OutLayer's TDX attestation.
- **Scores can leak information about the set.** The cap and aggregate-only
  scores limit this but don't remove it.
- **LLM outputs vary between runs,** even at temperature 0: on the
  calibration items one model scored 69–77% across three identical runs. A
  certificate therefore aggregates 3 runs and publishes the mean and the
  range, recorded with model id and nonce.
- **The demo scam set was written for this project,** not collected from
  real victims. It's realistic and reviewed by hand, but a certificate only
  says how a model did on *this* set. Proctor's value is that any author
  (a bank's fraud team, a researcher) can bring a set the same way.

## Open questions (status 2026-10-23)

1. **Two secrets in one job: settled on paper, test once downloads work.**
   `secrets_ref` names one profile. Plan, checked against OutLayer's
   `building-outlayer-apps` skill (`references/encryption-keys.md`):
   - The grader declares one encryption key in its manifest:
     `{"path": "nearai", "bind": "project", "caller": "predecessor"}`,
     together with `"storage_account": "predecessor"`.
   - The keystore derives it from
     `HMAC(master, "encryption-key:v1:project:{project_uuid}:predecessor:{Proctor account}:nearai")`.
     So only runs of our grader project that the Proctor contract calls can
     open it, and every later version of the project can still open it.
   - A one-time "seal" run, called by Proctor with `secrets_ref` set to our
     own profile (which holds `NEARAI_API_KEY`), encrypts the key with
     `encrypt("nearai", None, key, aad)`.
   - The ciphertext is not secret. It is stored in contract state or in the
     grader's sealed raw storage.
   - Each eval run uses the author's `secrets_ref` for the test set and opens
     the API key with `decrypt`. The grader never outputs the plaintext.
   - Fallback: `outlayer::storage` encrypted records.
   - **Test-set rows must be pinned to one build.** A `project` accessor
     alone would let the project owner (us) switch to a version that leaks
     the set. Authors store their set with
     `--project <owner>/grader --build <grader sha256> --direct` and a
     whitelist naming the Proctor contract. Then only that audited build,
     called directly by Proctor, can decrypt it. A new grader build needs
     each author to move the lock (`secrets access --build <new sha>`), so
     the UI must make that a single click.
2. **Publishing grader builds: blocked by OutLayer, not by hosting.** Testnet
   has no download/compiler worker online (`/public/workers` lists only two
   executors and the keystore), so a `WasmUrl` that isn't cached is refused
   before a job exists. It fails the same way from FastFS and from
   `raw.githubusercontent.com`. Cached projects run fine. Ask the OutLayer
   team.
3. **Locked-secret decryption: ready, waiting on 2.** The secret is stored
   (profile `spike`, `WasmHash(f9320ade…)`) and both probes are uploaded.
4. **Reasoning control: settled. Keep reasoning on.** With
   `enable_thinking: false`, Qwen3.8-27B answered a two-step word problem
   wrongly (`1` instead of `29`) and GLM-5.3-flash leaked its reasoning into
   `content` (`…29.</think>29`). With reasoning on, both were correct in
   1.2–3.1 s, with valid `provider_tee` signatures. The grader allows enough
   tokens and parses the final answer after any `</think>`. That works out to
   about 20 items per 180 s chunk for fast models; the scam
   sample measured up to about 30 s per item for slow ones (see
   `spikes/SPIKE_NOTES.md`).
5. **On-chain signature gas: settled.** `ED25519_VERIFY_BASE` costs 0.21
   Tgas per check, and the full `verify_tee_signature` call costs 1.36 Tgas.
   20 checks in `on_chunk` come to about 4–5 Tgas.
