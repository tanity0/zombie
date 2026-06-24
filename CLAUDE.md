# Project conventions (zombie)

Top-down HD-2D survival game. React + Zustand (simulation) + PixiJS (rendering).

## Renderer
- **PixiJS is the default and the only actively-developed renderer.** The legacy
  Canvas2D renderer is still reachable via `?renderer=canvas` as a fallback/
  reference but is **not maintained** — do new rendering work in `src/pixi/`.
- The React HUD renders as DOM on top of the canvas in both modes.

## Rendering vs. game logic (keep them separate)
- **PixiJS only draws.** It reads the store every ticker frame and never writes
  gameplay state. `useGameLoop` is the sole simulation clock/writer.
- **Wall / collision judgment lives in game logic**, never in the renderer.
  World data + collision math live in `src/world/` (e.g. `trees.ts`,
  `obstacles.ts`) and must stay **renderer-agnostic (no PixiJS imports)**. The
  store (`gameStore.ts`) calls them; Pixi may read the same world data only to
  draw it.

## Obstacle convention (trees, and future walls / rocks / props)
Unless a task says otherwise, follow the convention in `src/world/obstacles.ts`:
- **The collision rectangle's BOTTOM edge is the object's foot**, and the sprite
  is drawn up from that same foot (anchor `0.5, 1` at `footX/footY`). So the
  bottom of the hitbox coincides with the bottom of the picture and the art
  rises over the box.
- Build hitboxes with `footRect(footX, footY, w, h)`.
- Resolve movement with `resolveAabb(actorRect, walls)`.
- **Rectangle (AABB) collision only — no per-pixel tests.**

## Visual vs. hitbox
- A sprite's look is **decoupled from its collision box** (`src/pixi/renderSpec.ts`).
  Visual-only effects (depth/perspective scale, lighting, tilt-shift) must never
  change gameplay: hitboxes, attack ranges, the counter radius (`MELEE_RADIUS`),
  movement distances, etc. stay as the store defines them.

## Performance review for costly changes
- For any implementation that may add runtime cost, always state a load score
  before or alongside the implementation check: `1/10` = negligible, `5/10` =
  noticeable but acceptable with limits, `10/10` = too heavy for the current
  mobile-first target.
- Include the reason for the score, what subsystem pays the cost
  (simulation/rendering/audio/memory/network), and the safeguard or fallback.
- Prefer bounded, event-only, pooled, or delta-scaling approaches over constant
  per-frame global effects, per-pixel passes, unbounded loops, or new heavy
  dependencies.

### Empirical render budget (from the in-game benchmark — keep scores aligned to this)
The bottleneck is **NOT enemy/projectile count, and NOT the bloom post-process.**
A bloom-OFF run barely changed any result (FX/IMG/LIGHT still FAIL), so the cost
is the **per-effect DRAW METHOD itself**, not the full-screen filter. Score new
work by what kind of effect-draw it adds and how many are alive at once.
- **Cheap (score low):**
  - `enemy` — 60 on screen is *safe* (E60 PASS). Sprite draw is light.
  - `projectile` — 130 *safe* (J130 PASS). Movement + collision is light.
  - **small glow** (radius < `STRONG_GLOW_RADIUS` ~44) — drawn as a pooled
    tinted sprite (`drawSmallGlowSprite`), cheap.
  - **Bloom (AdvancedBloomFilter)** — turning it off barely moves FPS; treat its
    marginal cost as small. It is NOT the thing to cut first.
- **Expensive (score high) — and WHY (the actual draw path):**
  - **damage numbers / any text (`FX-D`) = WORST** (`drawDamageNumber`): each is
    a Pixi `Text` → glyph rasterization to canvas + GPU texture upload on
    create. `D20` ≈ avg 17 / min 10. Never spawn many Text per moment; use a
    bitmap-font / pre-rendered digit atlas / pooled sprites.
  - **strong glow (`FX-G`) = per-frame `Graphics`** (`drawEffectGfx` glow case):
    `clear()` + ~7 circle fills/strokes re-tessellated EVERY frame. `G12` FAILs
    (avg ~24). Fix = draw strong glows as the pooled glow *sprite* too.
  - **ring / particle / slash (`FX-R/P/S`) = per-frame `Graphics`** (each its own
    object, cleared + several shapes/frame). CAUTION single, FAIL stacked.
  - **image marks (`IMG`, e.g. `zan`)** = one large (~130px) alpha sprite →
    fill-rate / overdraw bound, not filter. `I4` FAILs (avg ~30). Cap count,
    shrink size, shorten lifetime.
  - **lights / torches (`LIGHT`)** — each torch = additive light sprite +
    reflection + per-frame flame `Graphics`. `T8` FAILs (avg ~31). (Use the
    `LIGHT-P` pure-light bench stage to separate torch-light cost from the
    effect-glow cost.)
  - **everything-at-once** — `ALL A1 = E36 J70 G8 R8 P64 I6 T12` FAILs hard
    (avg ~15-17). Current **forbidden line** on-device.
- **Current safe lines (update as the benchmark re-runs):**
  `enemy E60 safe / projectile J130 safe / bloom≈free / FX-D worst /
  glow G12 fail / FX composite F1 fail / image I4 fail / light T8 fail / all A1 fail`.
- **Scoring rule of thumb:** the cost is **draw-method × simultaneous count**.
  Rank by: text/`Text` (worst) > per-frame `Graphics` (glow/ring/particle/slash)
  > large alpha sprites (images) > additive lights — all far above
  enemies/bullets. A feature that adds enemies/bullets is cheap; one that spawns
  text, several live glows/rings/lights, or big alpha sprites per moment is
  expensive — cap it, pool it, or switch it to a **pooled sprite** draw.
- The fix path for heavy effects is **a cheaper render method (pooled sprite /
  bitmap text / baked texture), not fewer enemies/bullets, and not cutting bloom.**
- (Benchmark caveat: the net diagnostic reads `network unstable`, so trust the
  FPS/render verdicts here, not the network line.)
- Sub-weapon events, including grenades and similar class skills, must not
  trigger slow motion unless the user explicitly names that sub-weapon as a
  slow-motion target.
- Periodic weapon explosions, including grenade-launcher-style projectile
  explosions, also must not trigger slow motion unless explicitly requested.

## React re-render discipline (per-frame cost) — ALWAYS check this
Confirmed to matter a lot on-device. Whenever you add or touch React UI (HUD,
overlays, menus shown during play), make sure it does NOT re-render every frame:
- **Never subscribe a component to a whole object/array that changes every frame**
  via `useGameStore(s => s.player | s.enemies | s.projectiles | s.effects |
  s.pickups | s.gameTime | s.gameStats)` etc. The store rewrites these (new
  reference) each tick, so the component re-renders 60×/s and drags the frame.
- **Subscribe to the exact fields used, or a derived primitive** instead:
  `s.enemies.length`, `s.enemies.some(...)` (boolean), `Math.floor(s.gameTime/1000)`
  (seconds), `s.player.health`, … Use a `shallow` selector when you need a small
  bag of fields (`import { shallow } from 'zustand/shallow'`).
- **Isolate genuinely per-frame UI** (FPS, live counters, damage totals, anything
  that must update each frame) into its own tiny component so the heavy HUD body
  stays still. See `PerfOverlay.tsx` / `StatsHud.tsx` for the pattern.
- The PixiJS renderer reads the store in its ticker (not via React) — that's the
  intended path and is fine. The rule here is about **React** subscriptions only.
- Also avoid per-frame `set()` churn in the store waking many subscribers; if a
  per-frame writer (e.g. resync) is unavoidable, keep its result a stable
  reference for fields others read, and gate the write when nothing changed.

## Testing policy (test/debug cadence)
Codified from the agreed approach: **test the changed code + its blast radius;
run the full sweep cheaply/often, reserve heavy checks for big changes.** Split
checks by cost — do NOT lump them together.
- **Static checks (`tsc` / `lint` / `build`) — ALWAYS run full, every change.**
  They are cheap (seconds) and are themselves the *blast-radius detector*:
  `npm run typecheck` instantly flags every related break across the whole
  codebase when a type/signature changes. Never scope these down. Run
  `npm run lint && npm run typecheck && npm test && npm run build` before a push.
- **Unit tests (Vitest) — scope to changed + related during dev; full in CI.**
  Let the tools compute "related", don't guess: `npm run test:watch` (or
  `npx vitest related <files>`) reruns only tests whose import graph touches the
  changed files. The full suite (`npm test`) is tiny/fast today, so CI runs it
  whole on every push as the safety net. When you change *logic* (store/utils/
  world — the renderer-agnostic layer), add or update a test for that unit and
  its direct dependents in the same commit.
- **Heavy checks — only on large refactors or a schedule.** Long headless
  simulation fuzz, E2E (Playwright), and visual regression are slow and/or
  high-maintenance (especially WebGL/visual for this game). Don't run them per
  change; reserve for big changes or a nightly cron.
- **What to test:** the simulation is deliberately renderer-agnostic
  (`src/store`, `src/utils`, `src/world`) — that layer is the high-ROI unit-test
  target and runs headless. Do not unit-test PixiJS draw code.
- **Cost:** CI on GitHub Actions is **free** (public repo, unlimited minutes);
  `.github/workflows/ci.yml` runs lint→typecheck→test→build on push/PR,
  independent of the Pages deploy (`pages.yml`). The only thing that costs real
  money/credits is a scheduled *autonomous agent* run (model usage) — reserve it
  for big changes / low frequency if added later.

## File edits — verify before claiming "done"
- **After creating or editing any file, re-open it with `Read` BEFORE saying it's
  done.** Don't trust that a Write/Edit succeeded just because the tool returned.
- **If the read comes back empty / silent (no content), treat it as a FAILURE**,
  not success — the file may be missing or unwritten. Confirm the real state with
  `ls` (does it exist? size?) and `cat` (actual contents) before reporting.
- Only claim a change is complete once you've seen the expected contents on disk.

## Versioning
- **Bump `package.json` `version` on every push.** It is injected as
  `__APP_VERSION__` and shown top-right on the title screen and bottom-left
  in-game (with the active renderer), so the build loaded on-device can be
  confirmed at a glance. There is one version number — do not add a second.
- **ALWAYS state the current `version` in every chat reply** (e.g. end the
  response with `v0.25.xxx`). This is a hard rule — never omit it, even for
  questions, doc-only changes, or replies with no code change. After bumping,
  quote the new version.

## Development environment / handoff
- Local repository path: `/Users/tanity/zombie`
- Active branch: `claude/chat-context-continuity-saxlH`
- Install dependencies with `npm install`.
- Run the dev server with `npm run dev`; Vite serves the app under `/zombie/`
  (usually `http://localhost:5173/zombie/`, or the next open port).
- After each agent handoff or meaningful change, append a short entry to
  `DEVELOPMENT_LOG.md` with version, summary, files changed, verification,
  and next handoff notes.
- Claude Code may not be able to access the user's Google Drive materials.
  When new BGM/SE files are provided in Drive, have Codex copy them into
  `public/audio/` first, then commit/push so other agents can use them.
