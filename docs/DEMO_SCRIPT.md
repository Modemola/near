# Demo video script (90 seconds)

One idea carries the video: **you don't have to trust the score, you can
check it.** Everything builds to the moment a viewer's own browser verifies
every signed answer.

About 200 words of voice-over at a calm pace. Numbers in [brackets] are read
off the screen at recording time, never from this script.

| Time | On screen | Voice-over | Caption |
|---|---|---|---|
| 0:00–0:08 | Home page, hero question fades in | "Every AI scam filter is graded by the company that sells it, on tests it picked, that scammers can read too." | Who checks the scam filters? |
| 0:08–0:18 | Scroll to the message scanner; the sealed cube | "Proctor tests them on a sealed test instead: scams and real messages that nobody can read. Not the model's owner, not whoever runs the test, not us." | A test nobody can see |
| 0:18–0:40 | Scroll through "How an exam runs", one step per sentence | "The test opens only inside secure hardware. Each message goes to the model, which also runs in secure hardware and signs every answer together with the exact question. A NEAR contract checks every signature, recounts the score, and issues a certificate. The test's author is paid for every one." | Sealed · Signed · Checked on NEAR |
| 0:40–0:50 | Back to the top result; hover the answer sheet | "Here's a result. This model caught [10 of 11] scams, and flagged [1 of 9] real messages by mistake." | (model name and score from the screen) |
| 0:50–1:12 | **Check this result yourself** → **Check every signature**; the grid flips green; the Verified stamp lands; "What just happened" | "Don't take our word for it. One click, and your browser fetches every signed answer straight from NEAR, checks all [40] signatures, and adds them up. They match the certificate. No wallet, no account, nothing from our servers." | Verified in your browser (sped up, if it was) |
| 1:12–1:21 | Certificate page: run switcher, then "What this result rests on" opened | "Every certificate shows what it rests on: the test's fingerprint, the grader's code hash, and the model's hardware key." | Every claim, checkable |
| 1:21–1:30 | Publish page: the example loads and the seal draws | "And anyone, a bank's fraud team or a researcher, can publish their own sealed test. Proctor: AI scam filter results you can check." | proctor URL · built on NEAR |

## Honesty rules for the recording

- **Record on real models if at all possible.** If the recording uses the
  testnet demo (mock OutLayer, simulated models), it must say so on screen
  during 0:40–1:12, for example "Testnet demo: simulated model and grader".
  The site's own "Demo" chip should stay visible in the header.
- **If the check is sped up, say so** in the caption ("sped up 4×"). It
  takes about a minute in real time.
- **Don't claim what isn't done.** Until real certificates exist, swap the
  line at 0:40 for: "Here's a result from our testnet demo." The README's
  "What's real today" table is the source of truth.

## Recording checklist

- Browser at 1440 × 900, 100% zoom, light theme, no extensions or bookmarks
  bar; a second take on a phone (390 wide) for the verify moment if time
  allows.
- A fresh profile, so the page loads as a first visit (the hero's entrance
  plays) and no wallet is connected.
- Check the certificate verifies before recording (RPC nodes can be busy;
  the site retries, but a clean take matters).
- Move the mouse slowly; the custom cursor and tilt react to it.
- Scroll the "How an exam runs" section at an even pace: each step changes at
  about a quarter of the way through.
- Export at 1080p, 30 fps; captions burned in (many judges watch muted).
- Keep it under 90 seconds; cut the 1:12–1:21 shot first if it runs long.

## The X post (you publish it; this is a draft)

HACKATHON.md requires the post to say it was built at NEAR HACKATHON, tag
@NEARProtocol and #NEARHackathon (optionally @NearLegion and @NearBuilders),
and attach the demo video. Their advice: lead with the user's problem, show
one complete moment, say concretely what NEAR does, give a next step.

Draft (adjust the bracketed parts; keep "testnet demo" until real models are
certified):

> AI is becoming your scam filter, but the only scores come from the vendors
> themselves, on tests scammers can read too.
>
> Proctor tests AI models on a sealed set of scam and real messages nobody
> can see. Every answer is signed inside secure hardware, and a NEAR contract
> checks every signature before it issues a certificate.
>
> Every AI guardrail needs an exam it can't study for.
>
> In the video: one click re-checks all [40] signed answers in your own
> browser, straight from NEAR. No wallet needed.
>
> Built at NEAR HACKATHON on @NEARProtocol, with NEAR AI Cloud and OutLayer.
> [testnet demo link] · [repo link]
> Which AI filter would you want tested first?
>
> #NEARHackathon @NearBuilders @NearLegion

About 700 characters, which needs X Premium. Short version for the
280-character limit:

> AI scam filters are only graded by their vendors. Every AI guardrail needs
> an exam it can't study for: Proctor tests them on a sealed test nobody can
> see, and NEAR checks every signed answer.
>
> Built at NEAR HACKATHON @NEARProtocol #NEARHackathon
> [testnet demo link]
