# Design brief

Fill this in during the first hour (see `PLAYBOOK.md`). It decides the
copy, the colours and what gets built. Proctor's answers are shown as an
example in the right-hand column; replace them.

| Slot | Your product | Example (Proctor) |
|---|---|---|
| Product, in one sentence | | Independent, checkable results for AI scam filters, on a test nobody can see |
| User | | People and small teams choosing an AI scam filter; model makers; fraud teams |
| Core action | | See which AI catches scams without blocking real messages |
| Hero number | | Scams caught, and real messages wrongly flagged |
| Signature moment | | One click checks every signed answer in the browser, then says what just happened |
| World (the metaphor) | | An exam hall: sealed papers, answer sheets, the invigilator's stamp |
| Motif (one small repeated detail) | | Registration marks at the corners of every panel |
| Base colour | | Warm paper `#ebe7de`, with a night mode |
| Ink | | Blue-black `#18202c` |
| Accent (one only) | | Examiner's green `#0c6a50` |
| Display / body / mono fonts | | Fraunces / Geist / Geist Mono |
| Voice | | Plain, fair, reassuring; never overclaims |
| Honest limits | | One test, one model version, one point in time; scores vary between runs |
| Platform | | Vite, React, TypeScript, plain CSS tokens |

## Words we use

Ordinary words on screen; technical words one click away.

| Instead of | Say |
|---|---|
| | |
| | |
| | |

Add the technical words you replaced to `audit/audit.config.json` →
`jargon`, so the audit catches them if they creep back.

## Cut list

Things we will not build in two days, decided now:

1.
2.
3.
4.
5.

## Theme in five minutes

In `web/src/styles.css`, `:root` and the dark block below it:

- `--accent`, `--accent-2`, `--accent-soft`, `--accent-deep`, `--glow`: your
  accent and its tints (keep `--accent-deep` dark enough for small text).
- `--void`, `--coal`, `--ink`: base and ink.
- `--aurora-a/b/c`: the three background glows.
- `--display`, `--body`, `--mono`: fonts (import them in `main.tsx`, and
  update the two preload patterns in `vite.config.ts`).
- `public/favicon.svg` and the `theme-color` lines in `index.html`.
