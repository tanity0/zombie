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
