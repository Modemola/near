# Feasibility spike: private, certified AI benchmarking on NEAR

Date: 2026-10-23 (before the hackathon opens on 2026-11-01). Testnet only.

## Idea under test

Hidden test sets are graded inside a TEE. The test set is decrypted only by an
open-source grader identified by its WASM hash. The grader queries a NEAR AI
Cloud model that also runs in a TEE. A NEAR contract receives the score through
OutLayer's yield/resume flow and records a certificate (model, test-set hash,
grader hash, score, attestation).

## Results

| # | Question | Result | Evidence |
|---|----------|--------|----------|
| 1 | Do NEAR AI TEE models give real hardware attestation? | Yes | `GET cloud-api.near.ai/v1/attestation/ita-token?model=Qwen/Qwen3.8-27B&nonce=…` returned an Intel Trust Authority JWT: NVIDIA GH100, CC mode, secure boot on, debug disabled, all cert/RIM checks true, nonce matched. |
| 2 | Which models can be evaluated privately? | ~10 "verifiable" models | From `/v1/model/list`: Qwen3.8-27B ($0.04/M in), Qwen3.6-35B-A3B, GLM-5.3 and 5.3-flash, Qwen3-VL-30B, plus attested-3P DeepSeek-v3.2, Kimi K2.6/K3, Qwen3.5-397B. Every OpenAI, Anthropic and Google model is `verifiable: false`, so a test set sent to them leaks. |
| 3 | Is `outlayer.testnet` live, and what are its limits? | Yes | `get_max_limits` = `[500000000000, 180, 300]` (instructions, exec seconds, compile seconds). |
| 4 | Can a caller run a job and get the output in the same transaction? | Yes | tx `9J4tkybBVwNX4wRrifSHGnznymNSNtTkyMjjhP4zxCY5`: 767–844 ms in the worker, ~0.0011 NEAR charged, the rest refunded. |
| 5 | Can our own contract receive the result in a callback? | Yes | `spikes/outlayer-caller` deployed at `caller.certspike-1a6b29.testnet`; tx `AXnT8TKNzc2eFixq1QmV9qCXgEzaDZc6ZvHWmpiFCCm4` ran request_execution, then `on_result` logged and stored the output. |
| 6 | Does each job get an attestation we can put in a certificate? | Yes | `GET testnet-api.outlayer.ai/attestations/14047` returns `tdx_quote`, `worker_measurement`, `wasm_hash` = `executed_wasm_sha256`, `input_hash` (sha256 of the input; verified for `{}`), `output_hash`, `transaction_hash`, `block_height`, `caller_account_id`. |
| 7 | Can we run our own WASM? | Blocked | `test.fastfs.io` returns Cloudflare 502, so workers can't download WASM that isn't cached yet. Our runs (requests 5562, 5563) were refunded with "Execution promise failed". Projects whose WASM was already cached ran fine. Retry when FastFS is back, or host the WASM at another public HTTPS URL (`WasmUrl` accepts any public HTTPS URL on port 443 plus its sha256). |
| 8 | Can a WasmHash-locked secret be decrypted in the TEE, and can that code call NEAR AI? | Set up, not run | `spikes/secret-probe` builds two variants: `a` = `f9320ade…e520`, `b` = `5d57074d…eb08`. A dummy test set is stored as profile `spike`, accessor `WasmHash(f9320ade…)`, whitelist `certspike-1a6b29.testnet`. Both are uploaded to FastFS. Running them waits on the FastFS outage. The CLI also offers `--build <sha>` (lock a project row to one binary) and `--direct`/`--via` (lock which calling contract may trigger decryption). |
| 9 | Do TEE completions carry a signature we can check? | Yes | `Qwen/Qwen3.8-27B`, non-streamed, `x-no-aliasing: true`: `/v1/signature/<chat_id>?signing_algo=ed25519` returned `signature_kind: provider_tee`; the text equals `<model>:<sha256(request bytes)>:<sha256(response bytes)>`, the Ed25519 signature verifies, and the signer equals `signing_address` in `/v1/attestation/report` fetched first with our nonce (the report also carries `intel_quote` and `nvidia_payload`). Cost: about 87 tokens. Script outside the repo; the key is never written to the repo. |
| 10 | Can a NEAR contract verify that signature itself? | Yes | `verify_tee_signature(text, signature_hex, signer_hex)` in `spikes/outlayer-caller` (calls `env::ed25519_verify`) returns `true` for the real signature and `false` after changing one character of `text`, on `caller.certspike-1a6b29.testnet`. |

| 11 | Why do our own WASM runs fail? | OutLayer side | Testnet `/public/workers` lists only `testnet-executor-*` (x2) and `testnet-keystore`, with no downloader or compiler. An uncached `WasmUrl` fails before any job record is made, from FastFS (`test.fastfs.io/...` and `<account>.fastfs.io/...`) and from `raw.githubusercontent.com` alike (requests 5562, 5563, the probe A run, the GitHub test). The worker code (`compiler/mod.rs`) does support any https:443 host, up to 3 redirects, with a hash check. |
| 12 | Reasoning on or off? | Keep it on | Two-step word problem, temperature 0: Qwen3.8-27B 29 (on, 1.23 s) vs 1 (off); GLM-5.3-flash 29 (on, 3.09 s) vs reasoning leaked into `content` (off). All four signatures verified. |
| 13 | Gas for an on-chain signature check | ~0.21 Tgas each | tx `5Tv72DfFBGfGZnG8b8UFNT6qnFix1FjCNUtwutrgrBCt`: `ED25519_VERIFY_BASE` 0.21 Tgas, receipt total 1.358 Tgas. |

## Constraints for the design

- 180 s per job means grading in chunks (for example 10–20 items per job), with the contract adding up partial scores.
- Default `max_memory_mb` is 128; examples go up to 512.
- `input_data` over 32 KB costs extra storage deposit; large test sets go in secrets or `outlayer::storage`, not in the input.
- Each job's attestation binds the WASM hash, input hash and output hash, so the certificate can point at the attestation records instead of re-verifying TDX on-chain.
- NEAR AI response signatures are Ed25519 over exact request/response bytes, so the contract can check each graded answer's signature. Trust root: the model's signing key, taken from an attestation report verified off-chain and registered in the contract.
- TEE models such as Qwen3.8-27B reason by default; with `max_tokens: 16` all tokens went to reasoning and `content` was null. Allow enough tokens or turn reasoning off (see docs.near.ai reasoning-models) before grading.

## Other teams seen on OutLayer testnet (public job log)

`otcdesk-enclave.testnet/private-otc`, `kaap-ol-spike-10200854.testnet/kaap-spike`,
`zavodil2.testnet/price-oracle`. At least one team is building a private OTC desk.

## Reproducing

- Testnet account: create one with near-cli-rs `account create-account sponsor-by-faucet-service`.
- Contract: `cd spikes/outlayer-caller && cargo near build non-reproducible-wasm`, deploy, then
  `run '{"project_id":"<owner>/<project>","input":"{}"}'` with ~0.0032 NEAR attached and 300 Tgas.

## Scam sample difficulty check (2026-10-23)

`data/public-sample/scam-sample.json` (20 items: 11 scam, 9 legitimate) scored
with `spikes/scam-sample-eval/eval.py`: temperature 0, `max_tokens` 2000,
reasoning on, 4 requests in parallel.

| Model | Scams caught | False alarms | Accuracy | Wrong | Wall time |
|---|---|---|---|---|---|
| Qwen/Qwen3.8-27B | 11/11 | 1/9 | 95% | pub-13 (no answer) | 52 s |
| z-ai/glm-5.3-flash | 11/11 | 1/9 | 95% | pub-12 flagged as scam | 157 s |
| deepseek/deepseek-v3.2 | 11/11 | 0/9 | 100% | none | 116 s |

Findings:

- **Too easy on scams.** Every model caught every scam. The only differences
  were legitimate look-alikes: a real new-number text (pub-12) and a real bank
  fraud check (pub-13). The private set must use much subtler scams and more
  hard legitimate items. False alarms are likely to be the metric that
  separates models.
- **Token budget is part of the test.** On pub-13, Qwen used all 2000 tokens
  reasoning (`finish_reason: length`, 5.5k characters, no `content`). The
  certificate must record a fixed budget, and running out counts as wrong.
- **Latency is higher than the spike suggested.** GLM averaged about 31 s per
  item (157 s for 20 items, 4 at a time). Within a 180 s job that means about
  5 items per chunk for slow models, unless the grader can make requests in
  parallel.
- 20 items is a small sample; these numbers are only a difficulty signal.
