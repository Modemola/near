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

## Surfaces and motion (revision 2)

Requested direction: richer depth and motion. This replaces the template's
"square corners, almost no shadow" and "motion explains, never decorates".

- **Glass** for whatever floats over the living background: header, hero
  answer sheets, action panels, notes, notifications.
- **Soft relief (neumorphism)** for what you touch and read: panels, stat
  tiles, leaderboard rows, buttons (raised, press in), inputs (inset),
  answer bubbles (beads pressed into the sheet).
- **3D:** the hero shows a model's runs as a fanned deck of glass answer
  sheets that turns towards the pointer, with the stamp floating in front;
  a turning glass "sealed box" with the test glowing inside illustrates
  sealing on Tests, How it works and Publish. Pure CSS, no WebGL.
- **Motion:** slow aurora background, route transitions, a sliding nav
  indicator, scroll reveals, count-up figures, cursor spotlight on panels,
  staggered rows and bars, springy notifications, a scroll progress line.
- **Kept:** one green accent, text contrast, keyboard focus, colour never
  the only signal, and `prefers-reduced-motion` resolves everything to its
  final state (no tilt, no drifting, no count-up).

## Story motion (revision 3)

Motion that tells Proctor's story, each piece tied to what the product does:

- **Message scanner** (landing): public-sample messages glide through a scan
  line and are stamped Scam or Real from the answer key. Public items only.
- **How an exam runs** (landing): a pinned, scroll-driven scene in four steps:
  sealed, asked in secure hardware, signed, checked and stamped on NEAR.
- **Verification ceremony** (result page): every checked answer flips to a
  tick (or a cross), then a Verified seal lands. Uses the real counts.
- **Shared-element page change**: a model's name morphs from its leaderboard
  row into the result page title (View Transitions API; other browsers get
  the plain route transition).
- **Decoding hashes**, **magnetic buttons**, and a **certified moment** (stamp
  slam and bead burst) when a run finishes while you watch it.

## Inertia, cursor and WebGL (revision 4)

- **Inertia scrolling** (Lenis 1.3.26) on desktop pointers. Phones, touch and
  reduced-motion users keep native scrolling; tables, code, the nav strip and
  the wallet modal scroll natively.
- **Custom cursor** on desktop pointers: a precise dot and a trailing ring
  that grows over anything pressable, reads "View" over leaderboard rows
  (clicking a row opens its result) and "Paused" over the message scanner.
  Text fields keep the native caret; reduced motion keeps the normal cursor.
- **WebGL glass vault** (three.js 0.185.1) on Tests, How it works and Publish:
  a framed glass block with a glowing core and the messages orbiting inside,
  turning towards the pointer. Loaded as its own chunk only on those pages,
  paused off-screen, with the CSS cube as the fallback without WebGL or with
  reduced motion.

## Certificates you can't fake (revision 5)

One idea across the design: a Proctor result is a certificate that can't be
faked, so it looks like one.

- **Certificate page**: security printing as on banknotes and diplomas:
  guilloché bands and microprint drawn from the test's fingerprint, a serial
  number, oversized editorial figures, a watermark seal, copy link and print.
- **Holographic foil seal**: only on certificates, so it keeps its meaning;
  its sheen follows the pointer, or the phone's tilt.
- **Fingerprint seals**: every test gets a seal drawn from all 256 bits of
  its fingerprint (`web/src/lib/sealArt.ts`, tested): woven guilloché bands
  and a ring of 96 ticks. Changing a single bit redraws it. Shown on test
  pages, test cards, certificates, the bento grid, and live on Publish when
  you choose a file.
- **Bento grid** of live figures on the landing page, in place of the stat
  strip.
- **Paper grain** on every surface.
