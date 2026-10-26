# Proctor

**Independent, checkable results for AI scam filters, on a test nobody can see.**

AI models are becoming the scam filter for inboxes, banks and family phones.
Today the only evidence of how well one catches scams is its vendor's own
number on a benchmark the vendor picked. Public benchmarks leak into training
data, and scammers can read them too.

Proctor tests models on a **sealed** test set that nobody can read (not the
model owner, not the test runner, not us), grades them inside secure
hardware, and publishes a certificate on NEAR that **anyone can re-check in
their browser**, answer by answer.

> Live site: _to be added at deployment_ · Demo video: _to be added_ ·
> Tracks: privacy (main), security, open

---

## Try it in two minutes

| Do this | You'll see |
|---|---|
| Open the site | The top result as a stack of answer sheets: which scams the model caught, which real messages it wrongly flagged |
| Under **Check this result yourself**, press **Check every signature** | Your browser fetches every signed answer from a public NEAR node, checks each signature, adds them up, and stamps *Verified*. Then a three-line "What just happened". No wallet, no account |
| Open the certificate (**See the certificate**) | The full result: every run, the test's fingerprint, the grader's hash, the model's signing key, the contract's code hash |
| **Tests** → a test → **Certify a model** (testnet wallet) | You pay in NEAR, batches go out to the grader, and the page follows them until the certificate is issued (in the demo, a simulated grader answers while its keeper script runs) |
| **Publish a test** | Load a test file (an example is one click away); it's fingerprinted in your browser and sealed with the OutLayer CLI so only the grader can open it |

The current testnet deployment is a **demo**: see [What's real today](#whats-real-today).

## How it works

```
 Test author                           Anyone who wants a model certified
   │ seals the test so only one           │ request_eval(test, model) + NEAR
   │ grader program can open it           ▼
   │ register_set(fingerprint, price) ▶ ┌───────────────────────────────┐
   ▼                                    │ Proctor contract (NEAR)       │
 OutLayer keystore                      │ tests · models · runs ·       │
   ▲ opens the seal only for            │ certificates · royalties      │
   │ that grader, called by Proctor     └──────┬────────────────▲───────┘
   │                                           │ one job        │ yield/resume
   │                                           ▼ per batch      │ callback
   │                                    ┌───────────────────────────────┐
   └─────────────────────────────────── │ Grader (Rust, WASI) in an     │
                                        │ OutLayer Intel TDX enclave    │
                                        └──────┬────────────────▲───────┘
                                               │ each message   │ answer, signed
                                               ▼                │ in the model's TEE
                                        ┌───────────────────────────────┐
                                        │ NEAR AI Cloud model in a      │
                                        │ GPU TEE (H100, CC mode)       │
                                        └───────────────────────────────┘
```

1. **Sealed test.** An author (a bank's fraud team, a researcher) writes scam
   and real messages with the right answers. Only the SHA-256 fingerprint
   goes on-chain; the messages are encrypted to one open-source grader
   program, identified by the hash of its build.
2. **Exam in secure hardware.** For each batch, the contract asks OutLayer
   to run the grader in an Intel TDX enclave. The grader opens the seal,
   checks the fingerprint, and asks the model each question. The model runs
   in NEAR AI Cloud's GPU TEE and **signs every answer together with the
   exact question**.
3. **Checked on-chain.** The result comes back through NEAR's yield/resume.
   The contract checks every answer's Ed25519 signature against the model's
   key (taken from its hardware attestation report), recounts the score
   itself, and only then counts it.
4. **Certificate.** After every batch of every run (AI answers vary, so
   each model takes the test several times), the contract issues a
   certificate and pays the test's author their share.
5. **Anyone can check.** The signed answers are in the contract's events.
   The site re-verifies all of them in the browser from plain RPC and
   recomputes every figure on the certificate.

## What each part guarantees

| Claim | Why you can believe it |
|---|---|
| Nobody saw the test | It's encrypted to one grader build; only that build, running in TDX and called by Proctor, can open it |
| The model really gave these answers | Each answer is signed inside the model's TEE with the exact question; the contract and your browser both check it |
| The score is the sum of those answers | The contract recounts the signed answers; your browser recounts them again |
| It was this test | The grader recomputes the fingerprint on every batch; the contract rejects any mismatch |
| Repeated runs can't be used to reverse-engineer the test | Each test has a cap on certifications per model; only totals are published |

What it does **not** prove: that the grader scored honestly beyond what its
published code and TDX attestation guarantee, or that a model catches scams
outside this test. See [Limits](#limits).

## NEAR technology used

- **NEAR smart contract** (Rust, near-sdk 5.29): tests, models, runs,
  certificates, royalties, refunds, a per-model cap; `env::ed25519_verify`
  checks each answer's signature on-chain (about 0.21 TGas each).
- **Yield/resume** via **OutLayer**: one off-chain TDX job per batch, its
  result delivered back into the contract.
- **NEAR AI Cloud** confidential models: hardware attestation reports and
  per-answer `provider_tee` Ed25519 signatures.
- **NEP-297 events** carry every signed answer, so verification needs
  nothing but public RPC.
- **NEAR Wallet Selector** for paying and publishing.

## What's real today

| Piece | Status |
|---|---|
| Real NEAR AI TEE model answers are signed, and the signature checks out | **Proven** on testnet: Qwen3.8-27B, attestation with our nonce, Ed25519 verified (`spikes/SPIKE_NOTES.md`, items 1, 9) |
| A NEAR contract verifies that signature itself | **Proven** on testnet (`caller.certspike-1a6b29.testnet`, item 10) |
| OutLayer runs our job and calls our contract back | **Proven** on testnet (tx `AXnT8TKNzc2eFixq1QmV9qCXgEzaDZc6ZvHWmpiFCCm4`, item 5) |
| Contract, grader and site, end to end | **Working** on a local NEAR chain with a stand-in for OutLayer: every button, publish to certificate to verify (`scripts/e2e/run.sh`, 17/17 steps) |
| Testnet deployment (`proctor-demo.certspike-1a6b29.testnet`) | **Demo**: the real contract, wired to a mock OutLayer and simulated models, and labelled as a demo on the site |
| Sealing a test to the grader on OutLayer testnet | _Pending OutLayer testnet access_ |
| Certificates for real TEE models on the private scam set | _Pending NEAR AI credits_ |

## Limits

- Only models served in a TEE can be tested privately. Models marked
  `verifiable: false` by NEAR AI (OpenAI, Anthropic, Google) would leak the
  test.
- Model signing keys are registered by an attester role after checking the
  attestation off-chain; a later version could do this in the grader.
- A signature proves which model gave an answer, not that the grader scored
  it honestly; that rests on the grader's open code, its hash, and OutLayer's
  TDX attestation.
- Totals can leak a little about a test; the cap and totals-only results
  limit this.
- A result covers one test, one model version and one point in time.
- The demo scam set was written for this project and reviewed by hand; it
  isn't collected from real victims. Anyone can publish their own.

## Run it yourself

```sh
# Contract: unit tests and integration tests on a local NEAR chain
contract/scripts/test.sh

# Grader
(cd grader && cargo test)

# Web app against any deployment
cd web && npm install && cp .env.example .env.local   # set VITE_CONTRACT_ID
npm run dev

# Everything end to end on a fresh local chain (contract, mock OutLayer,
# grader keeper, and a browser clicking every flow)
scripts/e2e/run.sh
# plus accessibility, 16 screen sizes, speed: AUDIT=out RESPONSIVE=out scripts/e2e/run.sh
```

## Repository

| Path | What |
|---|---|
| `contract/` | Proctor contract, tests, and the mock OutLayer used for tests and the demo |
| `grader/` | The grader that runs on OutLayer; `label-cases.json` fixes how a reply is read |
| `web/` | The site (React, Vite), including in-browser verification (`src/lib/verify.ts`) |
| `scripts/e2e/` | End-to-end test and the interface audits |
| `scripts/demo/` | Deploys the labelled testnet demo |
| `data/` | The public 20-message sample and calibration items (the private set is never in the repo) |
| `docs/` | Architecture, test-set design, design notes, and the audit record (`AUDIT.md`) |
| `spikes/` | The research that proved each NEAR and OutLayer step on testnet |
