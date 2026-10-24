# Proctor design brief

Built from our UI/UX design template, filled in for Proctor. The template's
Parts 2, 3 and 5 apply as written; this file records Proctor's choices.

| Slot | Proctor |
|---|---|
| Product | Proctor: independent, verifiable scores for AI scam filters, graded on test messages the models have never seen |
| User | Mostly ordinary people and small teams choosing or trusting an AI scam filter; also model makers who want a certificate, and fraud teams who can publish a test set and earn from it |
| Core action | See which AI catches scams without blocking real messages (and, for builders, request a certification) |
| Hero number | A model's result in two plain numbers: scams caught, and real messages wrongly flagged |
| World | An exam hall: sealed exam papers, answer sheets, the invigilator's stamp. A proctor is the person who supervises an exam so nobody can cheat |
| Motif | Answer-sheet registration marks: four small square marks at the corners of every panel, like the alignment squares on a machine-marked answer sheet |
| Base | Light, warm paper (`#f6f3ec`), with a matching dark "exam hall at night" mode |
| Ink | Blue-black ink (`#1b2230`), secondary `#4a5263`, muted `#6b7280` |
| Accent | Examiner's green ink, `#0e6b52` (soft `#cfe7dd`, deep `#09503d`); used for the hero number, the primary action and one word per headline |
| Second accent | None. The seal stamp uses the accent; status colours mean status only |
| Display font | Fraunces (light, italic accent word) |
| Body font | Geist |
| Mono font | Geist Mono (every number, eyebrows, labels) |
| Voice | Plain, fair and reassuring. Never overclaims: never "proven safe", always "on this test" |
| Risk | A result speaks for one test set, one model version and one point in time; scores vary between runs; only models running in secure hardware can be tested privately; the demo set was written by us |
| Platform | Vite + React + TypeScript, plain CSS with tokens, NEAR wallet-selector |
| Onchain | Yes, NEAR. Read-only first; several wallets; every transaction reported step by step with an explorer link |
| Signature moment | The answer sheet: one bubble per test message fills in, green for a correct call and hollow for a mistake, grouped into scams and real messages, then the invigilator's stamp lands with the score. Built only from published totals, in a fixed order, so it reveals nothing about individual messages |

## Words we use

Ordinary words first, technical words one click away.

| Instead of | Say |
|---|---|
| eval | test run / certification |
| chunk, job | batch |
| detection rate | scams caught |
| false-alarm rate | real messages wrongly flagged |
| commitment | fingerprint of the sealed test |
| TEE | secure hardware (with "TEE" in the details) |
| dispatch | start the next batches |
