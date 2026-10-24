# Scam test-set design

The flagship test set Proctor certifies AI scam filters on. This document is
public. The private set itself is never committed.

## What a model is asked

Each item is one incoming message. The model gets a fixed system prompt and
the message, and must reply with one label, `SCAM` or `LEGIT`, plus a
one-line reason.

System prompt (fixed, the same for every model, recorded in the grader so its
hash covers it):

> You check messages for scams. Read the message and decide whether it is a scam: an attempt to trick the reader into sending money, sharing credentials or codes, installing software, or acting in a hurry against their own interest. Names, organisations, phone numbers, email addresses and web addresses in these messages have been replaced with realistic placeholders to protect privacy, so do not treat a detail as suspicious just because it looks like a placeholder or you do not recognise it. Differences between addresses, or between a sender and the organisation it claims to be, still matter. Judge the message by what it asks the reader to do and how it asks. Reply on one line as `SCAM: <reason>` or `LEGIT: <reason>`.

The placeholder sentence was added after the first audit: without it, 6% of
answers cited fictional data ("example.net is reserved", "a fictional number
range") as evidence, causing false alarms. It lives in `grader/prompt.txt`,
which the grader compiles in and the audit scripts read.

User content:

```
Channel: <sms | email | whatsapp | voice_transcript | social_dm>
From: <display name and sender as the reader would see it>
Message:
<text>
```

## Item format

```json
{
  "id": "s-0001",
  "channel": "sms",
  "from": "Mum (+44 7700 900123)",
  "text": "…",
  "label": "SCAM",
  "category": "family_emergency",
  "difficulty": "hard",
  "rationale": "New number claiming to be family, urgency, asks for a transfer to a third party."
}
```

The grader sends only `channel`, `from` and `text` to the model. `label`,
`category`, `difficulty` and `rationale` never leave the enclave.

## Mix (about 150–200 items)

About 55% scam and 45% legitimate. That's close enough to balanced that
labelling everything `SCAM` scores badly.

| Category | Scam examples | Legitimate look-alikes |
|---|---|---|
| Family emergency / voice clone | "Mum, I lost my phone, this is my new number, I need £400 for…"; voice-note transcripts asking for bail or medical money | A real family member's new-number message that asks for nothing |
| Bank and payment impersonation | "Your account is locked, confirm at…"; "Read me the code we just sent" | Genuine fraud alerts that tell you to call the number on your card and never ask for codes |
| Delivery and toll fees | "Parcel held, pay £1.99 redelivery fee" | Real delivery updates with tracking and no payment request |
| Invoice and payee change (business) | "Our bank details changed, pay invoice #4411 to…" | Genuine invoices from known suppliers with unchanged details |
| Investment, crypto and "pig butchering" | A slowly building friendly chat that turns to "my uncle's trading platform" | Real broker notices and exchange security emails |
| Job and task scams | "Earn $300/day rating products, deposit to unlock tasks" | Real recruiter outreach with no upfront payment |
| Tech support and remote access | "Your PC is infected, install AnyDesk" | Real IT notices about scheduled updates |
| Government, tax and fines | "HMRC refund, claim now"; "unpaid fine, warrant issued" | Real tax-deadline reminders that link to the official site |
| Romance and sextortion | Requests for money after an online relationship; threats | Ordinary dating-app messages |
| Marketplace / overpayment | "I sent too much, refund the difference"; fake escrow | Real buyer questions |
| Prize, lottery and giveaway | "You've won, pay the release fee" | Real loyalty-programme emails |

Each category has easy, medium and hard items. **Hard items carry the set:**

- Scams with no obvious spelling mistakes, polite tone, plausible context and
  realistic sender names.
- Legitimate messages that *look* alarming: urgent but real fraud alerts,
  real payment requests from known contacts, real new-number messages.
- Newer patterns that are unlikely to be in public data: AI voice-clone
  transcripts, payee-change requests inside a long real thread, QR-code
  parking fines, crypto "recovery" services that target earlier victims.

## Scoring

- Each item: correct, wrong, or unparseable. Unparseable counts as wrong.
- The certificate records the confusion counts (`tp`, `fp`, `tn`, `fn`) and
  three numbers derived from them:
  - **detection rate** (recall on scams): how many scams it caught;
  - **false-alarm rate** (legitimate flagged as scam): how often it cries
    wolf;
  - **accuracy**.
- Results per category and per item never leave the enclave. Only the totals
  are published, so repeated runs can't reveal which items are which.

## The public sample

About 20 items written the same way, clearly marked public, committed under
`data/public-sample/`. They let judges and users see what the set looks
like, and each model is also scored on them so the leaderboard can show
public next to private. The public sample is never part of the private set.

## Writing and handling the private set

1. Written outside the repo, in a local file that `.gitignore` excludes and
   that is never pushed.
2. Each item is reviewed by both of us. Its label must be unambiguous to a
   careful human reader; drop any item we disagree on.
3. Names, numbers, URLs and accounts are fictional: reserved number ranges
   (e.g. +44 7700 900xxx, 555-01xx), `example.com`-style domains, no real
   people or real companies' domains.
4. Canonicalised and hashed (that's the commitment registered on-chain), then
   encrypted in the browser flow to the pinned grader build.
5. Local copies are deleted after sealing. The commitment hash lets us prove
   later which set was used, if we choose to reveal it after the hackathon.

## Calibration results (Oct 23)

On the 20-item public sample, three TEE models caught every scam. On 13
harder calibration items (`data/calibration/hard-candidates.json`), one model
dropped to 69–77% while two stayed perfect. So the private set should:

- make about 60% of items hard;
- lean on business and payment fraud (payroll diversion, payee changes in
  real threads, penalty or fine texts with payment links), which fooled a
  model on every run;
- include plenty of genuine financial notices (withdrawals, one-time codes,
  bank call-backs), because false alarms separate models as much as misses;
- have enough items (150–200) that a few items don't decide the ranking.

## Before writing the private set (Oct 26–27)

- Write the 20-item public sample.
- Run it directly on 2–3 NEAR AI TEE models. If they all score near 100%,
  move the private mix toward harder items before writing it.
- Agree the final category counts.
