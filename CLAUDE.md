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
The current bottleneck is **NOT enemy count or projectile count.** It is the
**rendering** of composite FX, image-based effects, and lights. Score new work
by how many of those it adds, not by how many enemies/bullets are on screen.
- **Cheap (score low):**
  - `enemy` — 60 enemies on screen is *safe* (E60 PASS). Spawn/AI/sprite draw is light.
  - `projectile` — 130 projectiles is *safe* (J130 PASS). Movement + collision is light.
  - `particle` alone — likely light on its own (still verify in composites).
- **Expensive (score high — this is where frames die):**
  - **glow + ring + particle COMPOSITE** — even a small/medium set fails:
    `F1 = G6 R6 P40 T2` already FAILs (avg ~25). Treat each simultaneous
    glow/ring as costly; do not stack them.
  - **image-based effects** (textured marks like `zan`, large sprites, filters,
    blend modes, alpha compositing) — `IMG I4` (4 image marks) FAILs (avg ~30).
  - **lights / torches** — `LIGHT T8` (8 torch lights) FAILs (avg ~31). Do not
    keep many local lights alive at once.
  - **everything-at-once** — `ALL A1 = E36 J70 G8 R8 P64 I6 T12` FAILs hard
    (avg ~15). This combination is the current **forbidden line** on-device.
- **Current safe lines (update as the benchmark re-runs):**
  `enemy E60 safe / projectile J130 safe / FX-composite F1 fail / image I4 fail /
  light T8 fail / all A1 fail`.
- **Scoring rule of thumb for new visual features:** weigh **how many
  glow/ring/light/image effects are alive simultaneously**, not enemy/bullet
  counts. A feature that adds a couple of enemies or a burst of bullets is
  cheap; a feature that lights several local lights, stacks glows/rings, or
  draws multiple image/filtered sprites per moment is expensive — cap it,
  pool it, or render it more cheaply (fewer simultaneous glows/lights, bake
  instead of layering live filters, reuse one sprite, shorten lifetimes).
- The fix path for heavy effects is **a cheaper render method, not fewer
  enemies/bullets.**
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
