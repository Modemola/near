# Submission draft

For the NEAR HACKATHON form (HACKATHON.md, "3. Submit"). Nothing here is sent
until you confirm the full payload. Personal fields are left for you.

## Fields you decide

| Field | Value |
|---|---|
| Project name (2-80 chars) | _you decide_ (suggested: Proctor) |
| Team lead's name | _you_ |
| Contact email | _you_ |
| Team size | _you_ (one of `1`, `2 - 4`, `4 - 6`, `6 - 8`, `8+`) |
| Tracks | suggested: `privacy`, `security`, `open` |
| NEAR mainnet payout account | _you_ (create it in any NEAR wallet) |
| Public repository | https://github.com/Modemola/near (public) |
| Demo post on X | _the link once you post it_ |
| Consent to the contact notice | _you, after reading it_ |

## What we built (about 1,500 characters; the limit is 2,000)

> AI models are becoming the scam filter for inboxes, banks and phones, but
> the only evidence of how well one works is its vendor's own score on a
> benchmark the vendor picked, often a public one that leaks into training
> data and that scammers can read too.
>
> Proctor certifies AI scam filters on a sealed test nobody can see. Only the
> test's SHA-256 fingerprint goes on-chain. Each model answers every message
> inside NEAR AI Cloud's secure hardware (GPU TEEs), which signs every answer
> together with the exact question. A NEAR smart contract checks every Ed25519
> signature against the model's key from its attestation report, recounts the
> score itself, issues a certificate, and pays the test's author a share.
> Anyone can re-check a certificate in their browser in one click, straight
> from NEAR RPC, with no wallet.
>
> Live on testnet now: three real NEAR AI models certified on a 179-message
> sealed scam test, 3 runs each. Qwen3.8-27B scored 97.9% overall and
> Qwen3.6-35B 97.8%, while Qwen3-VL-30B caught 98.9% of scams but wrongly
> flagged 32.5% of real messages. That gap is what Proctor exists to show.
>
> NEAR is the trust layer: NEAR AI's TEE signatures, on-chain signature
> checks (env::ed25519_verify), OutLayer's yield/resume for off-chain grading,
> and NEP-297 events that make every result verifiable from public RPC. On
> testnet the grader still runs outside OutLayer's enclave, reaching the
> contract through a stand-in for OutLayer; the README says exactly what is
> real and what is not yet.
