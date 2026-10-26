# Two-day hackathon playbook

The method behind Proctor, compressed into 48 hours. The starter (`web/`)
and the audit (`audit/`) do the heavy lifting; this is what to decide, in
what order, and what "done" means.

## The five decisions that matter most

Make these in the first hour, write them in `BRIEF.md`, and don't reopen them.

1. **One sentence.** What it does, for whom. If it needs "and", cut.
2. **One core action.** The single thing a visitor does. Everything else
   supports it.
3. **One hero number.** The figure a judge remembers (Proctor: scams caught,
   and real messages wrongly flagged). Show it big, show it first.
4. **One signature moment.** Something the judge *does* in one click that
   proves the claim in front of them, then says in plain words what just
   happened. Proctor: "Check every signature" verifies 40 signed answers in
   the browser. This is the moment the demo video builds to. The starter's
   `Ceremony` component is this pattern; wire it to your real work.
5. **One honest table.** What's real, what's simulated, what's pending. Put
   it in the README and keep the site's notice chip on while anything is
   simulated. Judges forgive limits; they don't forgive being misled.

## Hour by hour

Assumes about 10 working hours a day. Each block ends with something you can
see working.

### Day 1: make the real thing work, ugly

| Hours | Do | Done when |
|---|---|---|
| 0:00–1:00 | Fill `BRIEF.md`. Write the cut list: everything you won't build | The five decisions are written; the cut list has at least five items |
| 1:00–1:30 | Copy `template/` into the new repo. `npm install`, `npm run dev`. Set `brand.ts`, the accent colour, the `CHANGE` lines in `index.html` | The site runs with your name, colour and nav |
| 1:30–5:00 | The core logic: the backend, contract, model call or algorithm that makes the core action real. Smallest data path end to end | One real input produces one real output, from a script or test |
| 5:00–7:00 | Replace `src/lib/data.ts` with calls to it (keep the function shapes). Wire the signature moment (`checkItem` → your real check) | The home page shows real data, and the one-click check does real work |
| 7:00–9:00 | The core action's page (start from `CreatePage` or `ItemPage`), including its loading, empty, error and success states | A stranger can do the core action without help |
| 9:00–10:00 | Deploy a preview, even if ugly. Write the README's first lines | There is a public URL |

### Day 2: make it clear, then make it solid

| Hours | Do | Done when |
|---|---|---|
| 0:00–3:00 | Finish the remaining flows. **Freeze scope at hour 3**: after this, only fixes | Every link goes somewhere real |
| 3:00–3:30 | Copy pass with `BRIEF.md`'s words table: plain words on screen, technical ones one click away | No jargon on the main path; every number has a label |
| 3:30–5:30 | `QUICK=1 audit/run.sh`, fix everything it finds, then the full `audit/run.sh` | axe 0, every control reachable by keyboard, every page/size combination clean, layout shift under 0.05 |
| 5:30–6:30 | README from `docs/README_TEMPLATE.md`, including the honest table and "try it in two minutes" | A stranger can follow it to the signature moment |
| 6:30–8:00 | Record the demo from `docs/DEMO_SCRIPT_TEMPLATE.md` | Under 90 seconds, captions burned in |
| 8:00–10:00 | Final deploy, submission form, buffer | Submitted, with time to spare |

If you fall behind, cut from the bottom of the cut list, never the signature
moment or the honest table.

## Scope rules

- **One flow end to end beats five half-built ones.** A judge clicks the
  first button; it has to work.
- **Real beats impressive.** One genuine result is worth more than a
  dashboard of fake ones. Where you must simulate, say so on screen.
- **Every screen earns its place in the demo.** If it won't appear in the
  video or the "try it" steps, it probably doesn't need building.
- **Decide the cut list first**, while you're calm, not at 2 a.m.

## What made the interface work (and the starter already does)

- **Show, don't claim.** The claim sits next to the action that proves it
  (`ClaimAndCheck` on the home page).
- **Plain words first, technical words one click away** (`details.more`).
- **Every state designed:** loading reserves its space (no jumping), empty
  says what to do next, errors say what happened in a sentence a person can
  act on (`lib/errors.ts`), and a broken part never blanks the page
  (`Unavailable`).
- **Honest limits on the page:** a "Read it fairly" panel next to every
  result.
- **Depth with restraint:** glass for what floats, soft relief for what you
  touch, one accent colour, motion that explains (a step, a check, a
  result), and everything still under reduced motion.
- **Accessible by construction:** one h1 per page, headings in order, visible
  focus, skip link, page changes announced, colour never the only signal,
  touch targets at least 24 px.
- **Fits every screen:** header on two rows up to 900 px, grids that never ask
  for more width than they have, rows that stack when their box is narrow
  (container queries), pinned things only while they fit, nothing past the
  screen edge.
- **Fast first paint:** pages pre-rendered at build time, each page's code
  loaded on first visit, fonts self-hosted and preloaded.

## Copy rules

- Say what it does, not how great it is. The audit flags hype words
  (revolutionary, seamless, unlock, leverage, cutting-edge...).
- Never overclaim: "on this test", "in this sample", not "always" or
  "proven safe".
- Numbers carry their meaning: "10 of 11 scams caught", not "91%" alone.
- Errors: what happened, what to do, and whether anything was lost
  ("Nothing was sent").
- No em dashes, no emoji in the interface, no placeholder text left (the
  audit counts `CHANGE`, `TODO` and lorem ipsum).

## The quality bar before submitting

| Check | Target | How |
|---|---|---|
| Accessibility | axe 0 in light and dark | `audit/run.sh` |
| Keyboard | every visible control reachable, visible focus | `audit/run.sh` |
| Layout | every page on 16 screen sizes clean | `audit/run.sh` |
| Layout shift | under 0.05 on every page | `audit/run.sh` |
| Backend down | every page says so in plain words; nothing blank or stuck | `audit/run.sh` |
| Speed | Lighthouse 90+ on a phone where possible | `audit/run.sh` |
| Real devices | opened on a real phone (Safari if you can) | by hand |
| The core flow | done by someone who hasn't seen it | by hand |
| Honesty | README table matches what the site does | by hand |

## Submission checklist

- [ ] Public URL works on a phone and a laptop, signed out.
- [ ] README: one sentence, try it in two minutes, how it works, honest
      table, limits, how to run, prior work (if any).
- [ ] Demo video under 90 seconds, captions on, any simulated part labelled.
- [ ] Repository public (if required), no secrets committed, `.env.example`
      present.
- [ ] Every field of the submission form filled from facts, not guesses.
