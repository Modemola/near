# Architecture: private, certified AI benchmarks on NEAR

Working name: **Proctor**. The name isn't final.

## The problem

Public benchmark scores are increasingly hard to trust. Test sets leak into
training data, labs tune for leaderboards, and nobody outside the lab can check
a reported number. Private test sets ("held-out" sets) fix contamination but
create a new problem: you have to trust whoever holds the set and runs the
evaluation.

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
  item count, chunk count, scoring type (`exact`, `multiple_choice`,
  `numeric`), price, royalty split, submission cap per model, status.
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
  payment through NEAR Intents 1-Click is a stretch goal (mainnet only).
- Leakage controls: a submission cap per (set, model); only aggregate scores
  are published, never which items were right.

### 2. Grader (Rust → `wasm32-wasip2`, runs on OutLayer)

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
  signer, attestation_report_sha256, items: [{text, signature}], records_root}`.
  It holds no item content and no per-item correctness. OutLayer's two-call
  flow handles larger outputs.
- Each job is capped at 180 s, so a chunk is about 10–20 items depending on
  the model's speed.

### 3. Frontend (TypeScript, React)

- **Leaderboard**: certified scores by model and test set, each with a
  "verify yourself" panel. It re-checks the signatures in the browser and
  links to the NEAR transaction and the OutLayer attestation for each chunk.
- **Author flow**: upload JSON/CSV; the browser canonicalises it, computes the
  commitment, encrypts it to the OutLayer keystore key locked to the grader
  hash, and registers the set with its price and royalty.
- **Requester flow**: pick a model and a set, pay with a NEAR wallet, and watch
  the chunks resolve live.
- **Contamination view**: a model's score on a public benchmark shown next to
  its certified score on a private equivalent set.

### 4. Demo data

A generator for grade-school maths items made from templates (new numbers and
names, known answers, in the spirit of GSM-Symbolic). Each item has a public
counterpart drawn from a widely published benchmark. The private set is
generated locally from a secret seed, encrypted, and never committed. We
publish whatever results we get, including no gap if there is none.

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
- **LLM outputs vary between runs.** A certificate is "the score of this
  run", recorded with model id and nonce.

## Open questions to settle before 2026-11-01

1. **Two secrets in one job.** `secrets_ref` names a single profile, but the
   grader needs the author's test set and the NEAR AI API key. Options:
   - merge the key into each set's profile with `secrets update`, which merges
     inside the keystore;
   - keep the key in `outlayer::storage` for the grader;
   - have the requester provide inference credit.
   Needs a testnet check.
2. **FastFS availability** for publishing grader builds, or another public
   HTTPS host (`WasmUrl` accepts any https:443 URL plus its hash).
3. **Locked-secret decryption** end to end: probe A reads the dummy set and
   probe B is refused. Prepared in `spikes/secret-probe`.
4. **Reasoning control** for TEE models, so answers aren't cut off.
5. **Chunk output size and gas** when verifying 10–20 signatures in
   `on_chunk`.
