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
| 8 | Can a WasmHash-locked secret be decrypted in the TEE, and can that code call NEAR AI? | Not run yet | Needs `NEARAI_API_KEY` set in the environment (new session). From source: OutLayer `ai-example` calls OpenAI-compatible APIs through WASI HTTP with the key from an encrypted secret; it builds to a 438 KB `wasm32-wasip2` component. |

## Constraints for the design

- 180 s per job means grading in chunks (for example 10–20 items per job), with the contract adding up partial scores.
- Default `max_memory_mb` is 128; examples go up to 512.
- `input_data` over 32 KB costs extra storage deposit; large test sets go in secrets or `outlayer::storage`, not in the input.
- Each job's attestation binds the WASM hash, input hash and output hash, so the certificate can point at the attestation records instead of re-verifying TDX on-chain.

## Other teams seen on OutLayer testnet (public job log)

`otcdesk-enclave.testnet/private-otc`, `kaap-ol-spike-10200854.testnet/kaap-spike`,
`zavodil2.testnet/price-oracle`. At least one team is building a private OTC desk.

## Reproducing

- Testnet account: create one with near-cli-rs `account create-account sponsor-by-faucet-service`.
- Contract: `cd spikes/outlayer-caller && cargo near build non-reproducible-wasm`, deploy, then
  `run '{"project_id":"<owner>/<project>","input":"{}"}'` with ~0.0032 NEAR attached and 300 Tgas.
