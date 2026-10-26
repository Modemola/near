# Hackathon starter

Everything that made Proctor's interface and process work, with Proctor
taken out, ready to be filled with a different product in two days.

| Part | What it gives you |
|---|---|
| `PLAYBOOK.md` | The method: five decisions, an hour-by-hour plan for two days, scope rules, copy rules, the quality bar, the submission checklist |
| `BRIEF.md` | The design brief to fill in during the first hour (with Proctor's answers as an example) |
| `web/` | A working site: design system, motion, responsive layout, accessibility, every loading/empty/error state, the "check it yourself" moment, a form with live validation, pre-rendered pages |
| `audit/` | One command that holds any site to the same standard: accessibility, keyboard, 16 screen sizes, overlaps, outages, copy rules, pre-rendering, Lighthouse |
| `docs/` | Templates for the judges' README, the 90-second demo script and the audit record |

The starter itself passes its own audit; see the bottom of this file.

## Start

```sh
cp -r template/ ../my-project && cd ../my-project
cd web && npm install && npm run dev        # http://localhost:5173
```

Sample data loads with a realistic delay so every state is visible. Add
`?empty` or `?fail` to any address to see the empty and outage states.

## Make it yours in 30 minutes

1. **Name and nav:** `web/src/brand.ts` (name, titles, tagline, nav links,
   the header notice chip).
2. **Meta tags:** every line marked `CHANGE` in `web/index.html`; add a
   1200 × 630 `public/og.png`.
3. **Colours and fonts:** the tokens at the top of `web/src/styles.css` (see
   "Theme in five minutes" in `BRIEF.md`); `public/favicon.svg`.
4. **Data:** replace the functions in `web/src/lib/data.ts` with calls to your
   backend (`lib/api.ts` has `getJson` with a timeout and friendly errors).
   Keep their shapes and every page keeps working.
5. **The signature moment:** make `checkItem` in `lib/data.ts` do your real
   proof, and rewrite the "What just happened" lines in `pages/Home.tsx`.
6. **Words:** every placeholder sentence in `pages/`. The audit counts any
   `CHANGE`, `TODO` or lorem ipsum left on screen.
7. **Pages:** rename or remove routes in `web/src/routes.tsx` (and the
   `PRERENDERED` list there).

## What's in `web/src`

| File | Use it for |
|---|---|
| `brand.ts` | Everything that names the product |
| `components/Layout.tsx` | Glass header with a sliding nav pill, notice chip, skip link, page-change announcements, footer; publishes the header's height (`--hdr-bottom`) and unpins sidebars taller than the screen |
| `components/ui.tsx` | `useAsync`, `Loading` (reserves its space), `Unavailable`, `Empty`, `ErrorNote`, `Panel`, `PageHead`, `Words` (headline that rises word by word), `Stat`, `StatusBadge`, `Hash` (long value with copy), `Stamp`, `Bar`, `useTitle` |
| `components/Ceremony.tsx` | The signature moment: click, beads flip as parts are checked, a stamp lands, then "What just happened" |
| `components/Story.tsx` | Pinned scroll story: steps on one side, glass cards stacking on the stage; unpins on short screens |
| `components/Board.tsx` | Ranked list with bars and a medal for the leader; rows stack when their box is narrow |
| `components/motion.tsx` | `Reveal` on scroll, `CountUp`, `useTilt` (3D towards the pointer), `useScramble`, `Aurora`, `GlassCube`, page-wide effects (magnetic buttons, panel spotlight, scroll progress) |
| `components/Cursor.tsx` | Dot and ring cursor on desktop; `data-cursor="View"` on any element labels it |
| `components/Celebrate.tsx` | The big moment: stamp slam and bead burst |
| `lib/toasts.tsx` | Step-by-step notifications: Sending, Working, Done (or Failed, Cancelled) |
| `lib/errors.ts` | Error messages in plain words; add your own rules |
| `lib/smooth.ts` | Inertia scrolling on desktop only |
| `pages/` | Home (hero, claim and check, figures, story, list, fine print, call to action), Explore (a list in every state), ItemPage (content and pinned sidebar), HowPage, CreatePage (live validation, example fill, toasts), NotFound |
| `entry-server.tsx`, `scripts/prerender.mjs` | Pre-rendering at build time; React attaches to the HTML without redrawing |

### CSS building blocks (`styles.css`)

Layout `.wrap`, `.split` (content + 370 px sidebar), `.stack`, `.grid.cols-2`,
`.grid.cols-3` · surfaces `.panel` (`.glass`, `.quiet`), `.tile` (`.ink`,
`.glass`, `.span-2`, `.tall`) in a `.bento`, `.stat`, `.note` (`.good`,
`.critical`) · text `.eyebrow`, `.label`, `.lede`, `.say`, `.muted`, `.small`
· controls `.btn` (`.secondary`, `.small`, `.block`), `label.field`,
`.status` (`.good`, `.warning`, `.critical`, `.live`), `.copy` · lists
`.rows`, `dl.facts`, `ol.flow`, `.points`, `.board`, `table` in `.table-wrap`,
`details.more` · art `.scene`/`.deck` (3D card stack), `.cube-scene`,
`.block3d`, `.stamp`, `.skeleton`, `.progress`, `.bar`.

Motion rules: one-off entrances only (no endless loops on content), and
everything resolves to its final state under reduced motion.

## Hosting

`npm run build` writes `dist/` with pre-rendered pages as both `page.html`
and `page/index.html`. Configure the host to serve those, and to fall back to
`app.html` for every other address (Netlify: `/* /app.html 200` in
`_redirects`; Vercel: a rewrite of `/(.*)` to `/app.html`). A host that falls
back to `index.html` still works, just without pre-rendering on those pages.

## Audit

```sh
cd audit && npm install          # once; also: npx playwright install chromium
./run.sh                         # everything, about 15 minutes
QUICK=1 ./run.sh                 # 5 screen sizes, no Lighthouse
```

List your pages, the pre-rendered ones, and how to simulate an outage
(`?fail` with sample data, or the API host to block) in
`audit/audit.config.json`. Reports land in `audit-out/`.

### The starter's own result

RESULT_PLACEHOLDER
