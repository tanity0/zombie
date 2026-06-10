# Development Log

This file is the handoff log for Codex, Claude Code, and other agents working
on the zombie game. Append a new entry after each meaningful change.

## Environment
- Repository: `/Users/tanity/zombie`
- Branch: `claude/chat-context-continuity-saxlH`
- Dev server: `npm run dev`
- Local URL: `http://localhost:5173/zombie/` unless Vite chooses another port
- Renderer under active development: PixiJS only

## 2026-06-10 - v0.25.140 - Make benchmark launch unmistakable (Codex)

### Summary
- Made benchmark launch state more robust and visible.
- `App` now keeps the requested benchmark launch in `pendingBenchmarkRef`
  through the async loading step and reapplies it immediately before entering
  gameplay.
- Loading screen now shows `Benchmark Loading` and benchmark-specific copy when
  benchmark mode is requested.
- Gameplay now shows a left-side `BENCH MODE` marker whenever benchmark mode is
  active.
- Start-screen benchmark button is still small, but now has a visible border,
  background, and `BENCH` label so it is harder to confuse with normal start.

### Conclusion
- If the game opens without `Benchmark Loading`, `BENCH MODE`, and the
  benchmark overlay, the normal start path was used.
- The benchmark path is now visually distinguishable from regular gameplay.

### Performance
- Load score: `1/10`.
- Affected subsystem: UI / state handoff only.
- No benchmark stress values or normal gameplay rendering cost were changed.

### Code touched
- `src/App.tsx`
- `src/components/LoadingScreen.tsx`
- `src/components/MainMenu.tsx`
- `src/components/Game.tsx`
- `package.json`, `package-lock.json`

### Verification
- OK: `npm run lint`
- OK: `npm run build`

## 2026-06-10 - v0.25.139 - Fix benchmark completion under heavy load (Codex)

### Summary
- Fixed benchmark runs that could appear to continue forever under very heavy
  stress.
- Benchmark completion is no longer dependent on only one `setTimeout`.
- The interval tick also checks elapsed time and forces the same completion
  path once `BENCHMARK_DURATION_MS` is reached.
- Added a one-shot finalize guard so timeout completion and tick completion
  cannot double-submit results.

### Conclusion
- Root cause: the adaptive stress test became heavy enough that relying on a
  single timeout completion path was too fragile on mobile Safari.
- Fix: use redundant elapsed-time completion and one-shot cleanup.

### Performance
- Load score: `2/10` for this fix itself.
- Affected subsystem: benchmark control flow only.
- Benchmark stress level is unchanged from `v0.25.138`; this patch only makes
  completion reliable.

### Code touched
- `src/components/BenchmarkOverlay.tsx`
- `package.json`, `package-lock.json`

### Verification
- OK: `npm run lint`
- OK: `npm run build`

## 2026-06-10 - v0.25.138 - Add adaptive benchmark stress search (Codex)

### Summary
- Changed benchmark stress behavior so high-density enemies are present from
  the beginning instead of ramping enemy count up gradually.
- Benchmark now tests heavier real rendering scenarios:
  - max enemy density
  - vertical actor movement for normal shadow recalculation
  - local glow/light shadow stress
  - 10 benchmark torches around the player
  - particle-heavy bursts
  - all-in mixed stress
- Added adaptive stress reduction when FPS hits the danger zone:
  - danger line: `30fps`
  - target safe line: `40fps+`
  - reduction order: particles, glow, rings, torches, vertical/shadow motion,
    then enemy count.
- Result screen now shows each stage's starting stress and the remaining
  `40+` stress setting after automatic reduction, so the safe counts can be
  used for tuning.

### Performance
- Load score: `8/10`.
- Affected subsystem: rendering and simulation.
- This is benchmark-only and bounded. Benchmark-spawned enemies and torches
  are removed after the run or unmount.
- Smartphone risk: high inside benchmark mode by design; normal gameplay is
  unaffected.

### Code touched
- `src/components/BenchmarkOverlay.tsx`
- `src/components/GameOverScreen.tsx`
- `package.json`, `package-lock.json`

### Verification
- OK: `npm run lint`
- OK: `npm run build`

## 2026-06-10 - v0.25.137 - Expand benchmark stress categories (Codex)

### Summary
- Expanded benchmark mode from three generic stages to five drawing-stress
  stages.
- New stages:
  - `S1 BASE`: enemy 12, glow 1, ring 1, particle 0.
  - `S2 GLOW`: enemy 16, glow 8, ring 3, particle 0.
  - `S3 PARTICLE`: enemy 18, glow 2, ring 2, particle burst 42.
  - `S4 SHADOW`: enemy 44, glow 1, ring 1, particle burst 8, shadow-size jitter.
  - `S5 MIX`: enemy 64, glow 8, ring 5, particle burst 52, shadow-size jitter.
- Result screen now shows each stage's stress values as `E/G/R/P` alongside
  average FPS, minimum FPS, drops, and judgement.
- Benchmark remains hands-free and exits to the result screen after completion.

### Performance
- Load score: `6/10`.
- Affected subsystem: rendering and simulation.
- This is benchmark-only, bounded by fixed stage targets, short effect
  durations, and the existing effect pool cap. Normal gameplay is unaffected.
- Smartphone risk: medium; `S5 MIX` intentionally combines enemy/normal-shadow
  redraw, glow, ring, and particle pressure to expose mobile Safari limits.

### Code touched
- `src/components/BenchmarkOverlay.tsx`
- `src/components/GameOverScreen.tsx`
- `package.json`, `package-lock.json`

### Verification
- OK: `npm run lint`
- OK: `npm run build`

## 2026-06-10 - v0.25.136 - Add staged benchmark logs (Codex)

### Summary
- Changed benchmark mode from a single flat 8-second test to a 12-second
  staged test.
- Added three bounded stages: `S1 LIGHT`, `S2 MED`, and `S3 HEAVY`.
- Each stage increases benchmark enemy target and glow/ring pulse count.
- Benchmark results now include per-stage average FPS, minimum FPS, drops,
  max enemy/fx counts, and stage judgement.
- The final benchmark judgement considers both total FPS and the worst stage.

### Performance
- Load score: `3/10`.
- Benchmark-only load is intentionally higher, but remains bounded by fixed
  stage enemy targets and fixed pulse counts. Normal play is unaffected.

### Code touched
- `src/components/BenchmarkOverlay.tsx`
- `src/components/GameOverScreen.tsx`
- `package.json`, `package-lock.json`

### Verification
- OK: `npm run lint`
- OK: `npm run build`

## 2026-06-10 - v0.25.135 - Route benchmark completion to result screen (Codex)

### Summary
- Benchmark completion now hands the result to `App` and transitions to the
  existing result screen.
- The result screen shows the benchmark grade plus average FPS, minimum FPS,
  drop count, and enemy/fx max counts.
- The benchmark overlay still flashes the final grade briefly, then the run
  ends automatically.

### Performance
- Load score: `1/10`.
- Result routing is UI state only. It does not add runtime benchmark load.

### Code touched
- `src/components/BenchmarkOverlay.tsx`
- `src/components/Game.tsx`
- `src/components/GameOverScreen.tsx`
- `src/App.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

## 2026-06-10 - v0.25.134 - Prevent benchmark pause skew (Codex)

### Summary
- Prevented benchmark mode from being skewed by level-up pauses.
- During benchmark mode, upgrade menus are forced closed, pause is cleared,
  XP pickups are filtered out, and player experience is kept at zero.
- Benchmark-spawned enemies now use very high HP so auto-fire does not kill
  them and generate XP during the short test.
- FPS sampling ignores the first 1.6 seconds as warm-up so startup spikes do
  not become false `min 1` failures.

### Performance
- Load score: `2/10`.
- Benchmark-only guardrails run on the same bounded interval as the benchmark.
  Normal play remains unaffected unless benchmark mode is active.

### Code touched
- `src/components/BenchmarkOverlay.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

## 2026-06-10 - v0.25.133 - Make benchmark faster and hands-free (Codex)

### Summary
- Shortened benchmark mode from 20 seconds to 8 seconds.
- Increased the controlled benchmark enemy target to 12 and emits stress
  pulses more frequently for a quicker read.
- During benchmark mode, the player is kept healed/invulnerable and enemies are
  made non-damaging/rooted so the user does not need to move or fight.

### Performance
- Load score: `2/10`.
- Benchmark-only load is intentionally higher while active. Normal play remains
  unaffected because the code runs only through the benchmark overlay.

### Code touched
- `src/components/BenchmarkOverlay.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

## 2026-06-10 - v0.25.132 - Add quick benchmark mode (Codex)

### Summary
- Added a small `ベンチ` text button to the start screen.
- Benchmark mode runs for 20 seconds after loading into gameplay.
- It keeps a controlled set of benchmark enemies on screen, emits repeated
  glow/ring stress effects, samples FPS, and shows `PASS` / `CAUTION` / `FAIL`
  with average FPS, minimum FPS, and drop count.
- Benchmark-only enemies are removed when the run finishes or the component
  unmounts.

### Performance
- Load score: `2/10`.
- Benchmark code is inactive in normal play. When active, it uses existing
  enemy/effect systems and bounded intervals; no package install, network,
  dynamic shadow maps, or unbounded loops were added.

### Code touched
- `src/components/BenchmarkOverlay.tsx`
- `src/components/Game.tsx`
- `src/components/MainMenu.tsx`
- `src/App.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

## 2026-06-10 - v0.25.131 - Size normal shadows from sprite pixels (Codex)

### Summary
- Changed normal player/enemy cast-shadow sizing to derive from each actor
  sprite's rendered pixel width.
- Kept the previous foot-box width as a fallback for missing/hidden textures.
- Moved normal shadow sync after actor sync so shadow sizing uses the current
  frame's sprite scale and texture.

### Performance
- Load score: `1/10`.
- The change only reads existing sprite dimensions and still draws into the
  same pooled `shadowGfx`. No new objects, filters, dynamic lights, or loops
  were added.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

## 2026-06-10 - v0.25.130 - Replace normal ellipse shadows with cast shadows (Codex)

### Summary
- Removed the always-on player/enemy elliptical foot shadow from normal
  rendering.
- Made the normal stage-light shadow a wider capsule stroke derived from the
  previous foot-shadow ellipse shape, so `sunlight` casts a short right/down
  shadow without a separate round blob under actors.
- Kept strong-event shadows, 2DHD fog, bloom, DOF, light shafts, and local glow
  behavior unchanged.

### Performance
- Load score: `1/10`.
- Normal shadow draw count is lower than before: player/enemy no longer draw
  both a directional stroke and a separate ellipse. The same pooled
  `shadowGfx` path is used.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

## 2026-06-10 - v0.25.129 - Strengthen sunlight directional shadows (Codex)

### Summary
- Made the active sunlight preset's normal directional contact shadow easier to
  see by increasing its length and alpha.
- Kept the existing foot-shadow ellipse, light shafts, stage preset structure,
  and strong-event shadow system unchanged.

### Performance
- Load score: `1/10`.
- Constant-only tuning. Draw count and rendering paths are unchanged.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

## 2026-06-10 - v0.25.128 - Add switchable stage lighting presets (Codex)

### Summary
- Added switchable `sunlight` / `moonlight` stage lighting presets.
- Enabled `sunlight` first so the left-top light and right-down shadow direction
  are easy to evaluate.
- Added short directional contact shadows while keeping the existing foot
  ellipses for grounding.
- Added subtle static diagonal light shafts and reduced the player assist light
  to avoid a self-emissive player look.
- Routed normal bloom strength through the active lighting preset.

### Active preset
- Active: `sunlight`
- Shadow direction: right/down, from a left-top main light.
- Moonlight preset is defined but inactive and can be enabled by changing
  `ACTIVE_STAGE_LIGHTING_NAME` to `moonlight`.

### Rollback point
- Backup branch: `backup/pre-stage-lighting-presets-2026-06-10`
- Backup tag: `pre-stage-lighting-presets-v0.25.127`
- Previous pushed commit: `0e6375b`
- Safe rollback: `git revert <v0.25.128_commit>`

### Performance
- Load score: `2/10`.
- Cost is rendering-side only: a few static light-shaft polygons and one short
  extra contact-shadow stroke per player/enemy. No per-pixel lighting, dynamic
  shadow map, unbounded light loop, package install, audio, memory, or network
  work was added.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

## 2026-06-10 - v0.25.127 - Tune forest depth and default shadows (Codex)

### Summary
- Increased the foreground forest parallax speed and made the foreground forest
  slightly larger.
- Added a light blur to the far backdrop so the distant scenery sits farther
  behind the play field.
- Made the two-person event NPC ground shadow slightly wider.
- Darkened always-on player/enemy foot shadows slightly.

### Performance
- Load score: `2/10`.
- Cost is rendering-side only: one low-strength blur filter on the fixed far
  backdrop plus small parameter changes. No new game-logic loop, shadow caster,
  audio, memory, or network work was added.

### Code touched
- `src/pixi/pixiScene.ts`
- `src/pixi/renderSpec.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

## 2026-06-10 - v0.25.126 - Exclude periodic weapon explosions from slow motion (Codex)

### Summary
- Removed slow motion from grenade-launcher projectile explosions because they
  can happen periodically during normal combat and interrupt game tempo.
- Kept the orange explosion glow/ring visuals; only the simulation slow trigger
  was removed.
- Added the project rule that periodic weapon explosions must not trigger slow
  motion unless explicitly requested.

### Slow-motion event list after this change
- Player death: red glow + death rings, `0.32x` for `820ms`.
- Castle boss emergence: red castle glow/rings, `0.36x` for `900ms`.
- Counter projectile reflection: cyan glow/ring, `0.34x` for `560ms`.
- Melee finisher / boss finisher hit: gold glow/rings, `0.4x` for `820ms`.

### Performance
- Load score: `1/10`.
- This removes another slow-motion trigger and does not add rendering,
  simulation, audio, memory, or network work.

### Code touched
- `src/hooks/useGameLoop.ts`
- `CLAUDE.md`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

## 2026-06-10 - v0.25.125 - Exclude sub-weapon grenades from slow motion (Codex)

### Summary
- Removed slow motion from the Heavy Gunner timed grenade explosion because
  sub-weapon events are not slow-motion targets unless explicitly named.
- Kept the grenade's orange glow/ring visual effect; only the simulation slow
  trigger was removed.
- Added the project rule that sub-weapon/class-skill events must not trigger
  slow motion by default.

### Slow-motion event list after this change
- Player death: red glow + death rings, `0.32x` for `820ms`.
- Castle boss emergence: red castle glow/rings, `0.36x` for `900ms`.
- Counter projectile reflection: cyan glow/ring, `0.34x` for `560ms`.
- Grenade-launcher projectile explosion: orange glow/ring, `0.5x` for `440ms`.
- Melee finisher / boss finisher hit: gold glow/rings, `0.4x` for `820ms`.

### Performance
- Load score: `1/10`.
- This removes one slow-motion trigger and does not add any new rendering,
  simulation, audio, memory, or network work.

### Code touched
- `src/hooks/useGameLoop.ts`
- `CLAUDE.md`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

## 2026-06-10 - v0.25.124 - Keep strong glow active during slow motion (Codex)

### Summary
- Matched strong-event glow/ring durations to their slow-motion windows so the
  light and event shadows stay visible while the game is slowed.
- Kept the existing lightweight slow-motion model: simulation `deltaTime` is
  scaled; rendering/audio continue normally.
- Added the project rule that potentially costly changes must report a load
  score, affected subsystem, and safeguard.

### Slow-motion event list
- Player death: red glow + death rings, `0.32x` for `820ms`.
- Castle boss emergence: red castle glow/rings, `0.36x` for `900ms`.
- Heavy Gunner timed grenade explosion: orange glow/ring, `0.5x` for `440ms`.
- Counter projectile reflection: cyan glow/ring, `0.34x` for `560ms`.
- Grenade-launcher projectile explosion: orange glow/ring, `0.5x` for `440ms`.
- Melee finisher / boss finisher hit: gold glow/rings, `0.4x` for `820ms`.

### Performance
- Load score: `2/10`.
- Cost is rendering-side only: existing glow/shadow effects live longer during
  bounded one-shot events. No new per-pixel pass, shadow map, dependency, or
  unbounded loop was added.
- Safeguard: strong-event shadows remain capped by `LOCAL_EVENT_MAX_CAST_SHADOWS`.

### Code touched
- `src/hooks/useGameLoop.ts`
- `src/store/gameStore.ts`
- `CLAUDE.md`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

## 2026-06-10 - v0.25.123 - Match event shadow thickness to foot-shadow shape (Codex)

### Summary
- Kept the rounded-stroke strong-event shadow approach from `v0.25.122`.
- Folded the ground-perspective Y compression into the shared cast direction so
  all three shadow layers extend along the same vector.
- Set stroke thickness from the foot-shadow ellipse cross-section perpendicular
  to the cast direction, so vertically stretching shadows inherit the foot
  shadow's wider horizontal body instead of using only its thin height.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The three cast-shadow layers still vary by `distance`, `width`, and `alpha`.
- If vertical cast shadows now feel too heavy, tune the per-layer `width`
  multipliers before changing the foot-shadow-derived thickness formula.

## 2026-06-10 - v0.25.122 - Restore stretched event shadows with round strokes (Codex)

### Summary
- Replaced the separated ellipse-copy event shadows from `v0.25.121` with
  rounded stroke shadows that actually read as stretched foot shadows.
- Kept the normal foot-shadow ellipse at the caster and layered three different
  stroke lengths so the shadow fades as it extends away from the light.
- Preserved the low-cost strong-event-only approach: no shadow maps or per-pixel
  lighting pass.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The visible stretch is now controlled mainly by the three `distance` values
  in `syncLocalEventLighting()`.
- Thickness is tied to normal foot-shadow height via `shadowRadiusY`, not actor
  body width, to avoid the previous oversized cast-shadow band.

## 2026-06-10 - v0.25.121 - Stretch foot shadows with fading copies (Codex)

### Summary
- Replaced the pointed strong-event cast-shadow polygons with three fading
  copies of each actor's normal foot shadow.
- Kept the foot-shadow roundness and base width while offsetting the copies
  away from the strong light source.
- Made the farthest copy very faint so the shadow reads as fading into the
  ground instead of ending in a sharp tip.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- This is a low-cost approximation for Octopath-like event shadows: no dynamic
  shadow map, just a few ellipses during strong light events.
- If the tail feels too short/long, tune the `distance` values in
  `syncLocalEventLighting()`. If it feels too smoky, tune the copied ellipse
  alpha values.

## 2026-06-10 - v0.25.120 - Use foot-shadow width for event cast shadows (Codex)

### Summary
- Reworked strong-event cast shadows to use each actor's normal foot-shadow
  width instead of the full visual body height/width.
- Kept the long strong-event cast direction and darker opacity, so the effect
  reads more like the existing foot shadow stretching away from the light.
- Reduced the oversized band-like look from v0.25.119 while preserving the
  strong event slow-motion behavior.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If the stretched shadow is still too visible, tune `LOCAL_EVENT_SHADOW_ALPHA`
  first. If it is too long, tune `LOCAL_EVENT_SHADOW_REACH_MULT` or the `len`
  formula inside `syncLocalEventLighting()`.

## 2026-06-10 - v0.25.119 - Add strong-event slow motion and max-width shadows (Codex)

### Summary
- Added a lightweight strong-event slow-motion state. It scales simulation
  `deltaTime` for brief impact moments while rendering, audio, FPS display, and
  VFX lifetimes continue normally.
- Triggered the slow motion on melee finishers, counters, grenade explosions,
  boss-castle emergence, and player death.
- Made strong-event cast shadows use a much fuller caster width by taking the
  larger visual dimension for characters/enemies and widening the shadow body.

### Code touched
- `src/store/gameStore.ts`
- `src/hooks/useGameLoop.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Slow-motion tuning is centralized through `triggerTimeSlow(scale, durationMs)`.
  Smaller `scale` means stronger slow; longer `durationMs` means the feel holds
  longer. Current counter value is `0.34 / 560ms`, grenade is `0.5 / 440ms`,
  and finisher is `0.4 / HITSTOP_MS + 520ms`.
- Shadow width is intentionally bold for on-device evaluation. If it reads too
  heavy, reduce the `width` formula in `syncLocalEventLighting()` before
  lowering shadow opacity.

## 2026-06-10 - v0.25.118 - Exaggerate strong-event cast shadows (Codex)

### Summary
- Made strong-event cast shadows longer and wider while keeping the same
  caster cap and same single graphics pass.
- Slightly increased cast-shadow opacity.
- Expanded the strong-event shadow reach so more nearby actors/props can cast
  readable shadows during grenade/counter/finisher-style flashes.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- This is intentionally theatrical. If it feels too heavy visually, tune
  `LOCAL_EVENT_SHADOW_REACH_MULT`, the `len` formula, then the `width` formula
  in that order.

## 2026-06-10 - v0.25.117 - Darken cast shadows and suppress bloom during strong events (Codex)

### Summary
- Made strong-event cast shadows thicker and darker without increasing the
  number of drawn shadow shapes.
- Increased the local event ground darkening while keeping it as a soft fill
  so it does not create a dark rim around the light source.
- Temporarily sets the world `AdvancedBloomFilter` bloom scale to `0` while a
  strong glow event is active, then restores the normal bloom scale afterward.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Strong events should now read with higher contrast: darker cast shadows and
  no global bloom washing the frame while the event glow is alive.
- If this becomes too stark, reduce `LOCAL_EVENT_SHADOW_ALPHA` first, then
  `LOCAL_EVENT_SHADE_ALPHA`.

## 2026-06-10 - v0.25.116 - Remove dark rim from strong event lights (Codex)

### Summary
- Removed the visible dark stroke around strong event glow sources.
- Kept the soft local ground contrast, but changed it to a low-alpha filled
  ellipse so shadows no longer appear to originate from the edge of the light
  disc.
- Preserved multi-source cast shadows for simultaneous grenade/explosion
  events.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Check grenade clusters and melee/counter events. The intended result is:
  multiple shadow directions are allowed, but no dark outline should cling to
  the glow perimeter.

## 2026-06-10 - v0.25.115 - Move strong glow under event shadows (Codex)

### Summary
- Routed strong `glow` effects to the ground layer instead of the top effect
  layer.
- Keeps broad event light below the local event shadow pass, so it should no
  longer sit visibly on top of the cast shadows.
- Normal small glows, rings, slash effects, damage numbers, and dog fetch
  effects remain on the existing upper effect layer.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Re-test strong events. The bright source may now feel less overlaid; if it
  becomes too subtle, add a very small separate core effect rather than moving
  the broad glow back above the shadows.

## 2026-06-10 - v0.25.114 - Keep strong glow from washing over cast shadows (Codex)

### Summary
- Reduced the broad top-layer additive glow used by strong glow events.
- Kept the bright source core and small rim, but stopped the huge glow disc
  from painting over the local event shadow pass.
- Leaves the ground contrast and cast-shadow work in `syncLocalEventLighting`,
  so the Octopath-style event shadow should read more clearly.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Test with counter / melee finisher / grenade. If the shadow is now visible
  but too dark, tune the local shadow constants instead of re-expanding the
  top-layer glow.

## 2026-06-09 - v0.25.113 - Lift event shadows above ground overlays (Codex)

### Summary
- Moved the local event shadow pass from the ground layer to the bottom of the
  actor layer.
- Keeps strong glow event shadows above ground reflections, pickups, and
  additive ground lights while still below characters, trees, props, castle,
  merchant, and event NPCs.
- Fixes the issue where only the protruding parts of the event shadows were
  visible because later ground-layer drawing covered most of the shadow pass.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Re-check with counter, melee finisher, grenade explosion, or boss-castle
  spawn. If the shadow shape is now visible but too strong, tune the alpha and
  length constants added in v0.25.111/v0.25.112.

## 2026-06-09 - v0.25.112 - Make event shadow pass visibly render (Codex)

### Summary
- Moved the local event shadow layer above ground reflections, player ground
  light, and normal foot shadows while keeping it below actors.
- Replaced the line-stroke cast shadow with tapered filled shadow polygons plus
  a darker contact shadow at each caster's foot.
- This should make strong glow event shadows actually visible instead of being
  buried under additive ground lights or lost in the detailed floor texture.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Check with counter, melee finisher, grenade, or boss-castle spawn. If still
  invisible, the next likely issue is that the triggering glow coordinates are
  not close enough to the visible actors/props.

## 2026-06-09 - v0.25.111 - Make event shadows easier to read (Codex)

### Summary
- Increased the local darkness around strong glow events so nearby shadows read
  more clearly.
- Lengthened event-cast shadows and expanded their reach so finishers,
  counters, explosions, and other strong glow events are easier to evaluate on
  device.
- Kept the existing per-light caster cap and screen/radius culling unchanged.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- This is intentionally more visible than the first pass. If it feels too
  theatrical, tune `LOCAL_EVENT_SHADOW_ALPHA`,
  `LOCAL_EVENT_SHADOW_REACH_MULT`, and the `len` formula in
  `syncLocalEventLighting`.

## 2026-06-09 - v0.25.110 - Add strong-light cast shadows (Codex)

### Summary
- Added the first lightweight Octopath-style shadow pass for strong glow
  events only.
- Strong local glow events now cast elongated fake ground shadows from the
  player, enemies, trees, breakable props, castle, weapon merchant, and quest
  NPCs.
- Kept the implementation to one `Graphics` layer with screen/radius culling
  and a per-light cap of 22 shadow casters.
- Fixed the event-shadow enemy caster coordinates to use the current
  `enemyFootBox` fields.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- This is step 1 only: shadows respond to strong one-shot glow events such as
  finishers/counters/explosions.
- Step 2 can extend the same caster pass to torch proximity if the event-only
  version feels good on device.

## 2026-06-09 - v0.25.109 - Lift horizon seam above ground and soften player glow (Codex)

### Summary
- Moved the horizon forest seam one layer up: it now draws above the fixed
  ground layer but below the filtered gameplay world.
- This lets the seam hide the far/ground boundary without covering enemies,
  player, pickups, props, or effects.
- Slightly reduced the constant player ground glow alpha from `0.32` to `0.26`.

### Code touched
- `src/pixi/layers.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The horizon seam is still screen-space and still uses the existing fade mask.
- On-device check: confirm the seam sits visually over the ground edge but does
  not cover gameplay objects.

## 2026-06-09 - v0.25.108 - Match gameplay player sprites to character-select sprites (Codex)

### Summary
- Treat `v0.25.107` as the rollback point for this experiment. If the user says
  "戻して", return the gameplay player sprite selection/scale to that state.
- Changed gameplay player rendering to use the exact same `player-*-walk-*`
  materials shown on the character-select screen.
- Removed the gameplay-only `player-*-game-*` texture reference from the active
  player draw path.
- Matched the gameplay class sprite base scale to the character-select image
  width (`86px`) so the focal-plane player reads close to the menu sprite size
  and material scale.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push remains paused by user instruction.
- The generated `player-*-game-*` files are intentionally left in the repo for
  easy rollback or comparison.

## 2026-06-09 - v0.25.107 - Replace horizon forest seam material (Codex)

### Summary
- Replaced the horizon forest seam material with the newly supplied
  `遠景森.png`.
- Removed only the border-connected purple background by alpha keying.
- Baked a subtle bottom fade into the texture so the added ground strip fades
  from transparent at the bottom into the forest material above.
- Kept the existing runtime horizon forest fade mask in place for final
  in-game blending.

### Code touched
- `public/backgrounds/horizon-forest-band.png`
- `package.json`, `package-lock.json`

### Verification
- Alpha sanity check: upper purple background is transparent, bottom edge fades
  to transparent.
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push remains paused by user instruction.
- The output texture is `1672x941`, matching the supplied material aspect ratio.

## 2026-06-09 - v0.25.106 - Revert playable-character layer split (Codex)

### Summary
- Reverted the `v0.25.104` experiment that moved the playable character into a
  separate `characterWorld` layer outside the filtered gameplay world.
- Restored the normal actor-layer composition so player lights, local effects,
  overlap, and Y-sort behavior line up with the rest of the world again.
- Kept the `v0.25.105` Heavy Gunner sprite replacement intact.
- Global world effects remain ON, matching the saved all-effects checkpoint
  direction while we look for a different way to preserve character pixel art.

### Code touched
- `src/pixi/layers.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push remains paused by user instruction.
- Avoid the separate playable-character world approach for now: it caused
  character-related lights to composite under the character.

## 2026-06-09 - v0.25.105 - Replace heavy gunner with new material-preserved sprites (Codex)

### Summary
- Replaced the Heavy Gunner character-select and in-game sprite frames with
  the newly supplied 3-frame material.
- Removed only the border-connected purple background, preserving the character
  artwork itself.
- Kept aspect ratio intact and used nearest-neighbor scaling only for fitting
  into the existing character-select (`128x108`) and gameplay (`96x80`) sprite
  canvases.
- Updated both `player-shotgun-walk-*` and `player-shotgun-game-*` so gameplay
  and character select use the same visual material.

### Code touched
- `public/sprites/player-shotgun-walk-0.png`
- `public/sprites/player-shotgun-walk-1.png`
- `public/sprites/player-shotgun-walk-2.png`
- `public/sprites/player-shotgun-game-0.png`
- `public/sprites/player-shotgun-game-1.png`
- `public/sprites/player-shotgun-game-2.png`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push remains paused by user instruction.
- The source art was not redrawn or reshaped; only the purple background was
  keyed out before uniform nearest-neighbor fitting.

## 2026-06-09 - v0.25.104 - Separate playable character from global world filters (Codex)

### Summary
- Treat `v0.25.103` as the saved "all effects ON" checkpoint.
- Added a camera-following `characterWorld` layer outside `filteredWorld`.
- Moved the playable character sprite container into `characterWorld` so global
  world bloom / tilt-shift no longer brighten or soften the player sprite.
- Kept global bloom, DOF, vignette, color grade, ground glow, shadows, enemy
  effects, pickups, and world effects ON.

### Code touched
- `src/pixi/layers.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push remains paused by user instruction.
- This is the first Octopath-like split: atmosphere remains on the world, while
  playable character pixels stay outside global post-processing.
- Tradeoff to watch on-device: the player is now composited above the filtered
  world, so test whether tree/castle/enemy overlap still feels acceptable.

## 2026-06-09 - v0.25.103 - Restore global world bloom effects (Codex)

### Summary
- Re-enabled the global Pixi world bloom filter after the character washout
  diagnosis pass.
- Player ground glow remains restored at `0.32`.
- This returns the broader atmospheric effect stack for further visual tuning.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push remains paused by user instruction.
- Known tradeoff: global bloom improves atmosphere but can brighten player
  sprites; future tuning may need bloom separation or lower threshold/scale.

## 2026-06-09 - v0.25.102 - Restore player ground glow with world bloom off (Codex)

### Summary
- Restored the warm player ground glow alpha to `0.32`.
- Kept global world bloom disabled because that was the likely cause of the
  persistent in-game character color washout.
- This isolates the player floor halo from the global bloom issue.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push remains paused by user instruction.
- If character color stays correct, keep global bloom off and use localized
  glow/effect sprites instead.

## 2026-06-09 - v0.25.101 - Disable world bloom for gameplay character color test (Codex)

### Summary
- Disabled the global Pixi world bloom filter to test the persistent in-game
  player sprite washout/brightening that does not appear on the character
  select screen.
- Character select uses DOM image sprites and is unaffected by Pixi world
  filters; gameplay sprites were inside `filteredWorld`, so global bloom could
  brighten pale hair/skin/clothing for the entire run.
- Kept tilt-shift depth of field, vignette, cool grade, shadows, and local
  gameplay effects intact.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push remains paused by user instruction.
- If this fixes the character color, reintroduce bloom only on explicit effect
  layers/items instead of the whole gameplay world.

## 2026-06-09 - v0.25.100 - Disable constant player glow for pixel clarity test (Codex)

### Summary
- Set the constant player halo/glow alpha to `0` to test whether the always-on
  additive hero light was softening the player sprites during gameplay.
- Kept depth of field, vignette, environment lighting, shadows, and event
  effects intact.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push remains paused by user instruction.
- If player pixels now read sharper, keep the constant hero halo off and use
  explicit event/skill effects instead.

## 2026-06-09 - v0.25.99 - Add crisp in-game player sprite set (Codex)

### Summary
- Added separate in-game player sprites for all four character classes so the
  menu art can stay large while gameplay uses crisp, size-matched pixel art.
- Generated `*-game-0..2` sprites at a shared `64px` content height with
  nearest-neighbor scaling only.
- Updated Pixi player rendering to use the in-game sprites and a `64px` base
  height, so players near the focal plane are drawn close to 1:1 instead of
  being dynamically downscaled from larger menu sprites.
- Confirmed Pixi texture loading already uses `nearest`; this change addresses
  the remaining mismatch caused by mixed source content heights (`96px` and
  `108px`) and runtime downscaling.

### Code touched
- `public/sprites/player-shotgun-game-0.png`
- `public/sprites/player-shotgun-game-1.png`
- `public/sprites/player-shotgun-game-2.png`
- `public/sprites/player-magnum-game-0.png`
- `public/sprites/player-magnum-game-1.png`
- `public/sprites/player-magnum-game-2.png`
- `public/sprites/player-scavenger-game-0.png`
- `public/sprites/player-scavenger-game-1.png`
- `public/sprites/player-scavenger-game-2.png`
- `public/sprites/player-striker-game-0.png`
- `public/sprites/player-striker-game-1.png`
- `public/sprites/player-striker-game-2.png`
- `src/pixi/pixiTextures.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push remains paused by user instruction.
- Character select continues using the larger `*-walk-*` images; gameplay now
  uses the new `*-game-*` images.

## 2026-06-09 - v0.25.98 - Replace heavy gunner sprites (Codex)

### Summary
- Replaced the Heavy Gunner walk frames with the newly supplied 3-frame sprite
  sheet.
- Purple background was keyed transparent and frames were fit into the existing
  `128x108` player sprite canvas using nearest-neighbor scaling only.
- Lightly aligned head centers across frames to reduce wobble while preserving
  the walking motion and foot baseline.

### Code touched
- `public/sprites/player-shotgun-walk-0.png`
- `public/sprites/player-shotgun-walk-1.png`
- `public/sprites/player-shotgun-walk-2.png`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push remains paused by user instruction.

## 2026-06-09 - v0.25.97 - Align scavenger walk head position (Codex)

### Summary
- Repositioned the Scavenger walk frames so the head center stays consistent
  across the 3-frame animation.
- Kept the existing sprite size, foot baseline, and nearest-neighbor pixels.
- Reduced the visible side-to-side wobble while preserving the leg motion.

### Code touched
- `public/sprites/player-striker-walk-0.png`
- `public/sprites/player-striker-walk-1.png`
- `public/sprites/player-striker-walk-2.png`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push remains paused by user instruction.

## 2026-06-09 - v0.25.96 - Slightly extend trap shove distance (Codex)

### Summary
- Increased the melee shove distance for placed traps from `56px` to `68px`.
- Kept the existing direction logic and smooth slide animation unchanged.

### Code touched
- `src/store/gameStore.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push remains paused by user instruction.

## 2026-06-09 - v0.25.95 - Replace scavenger character sprites (Codex)

### Summary
- Replaced the in-game Scavenger walk frames with the newly supplied 3-frame
  male scavenger sprite sheet.
- Purple background was keyed to transparent and each frame was preserved with
  nearest-neighbor scaling on the existing `128x108` player canvas.
- Kept the existing foot alignment and player class sprite scale so gameplay
  positioning stays consistent.

### Code touched
- `public/sprites/player-striker-walk-0.png`
- `public/sprites/player-striker-walk-1.png`
- `public/sprites/player-striker-walk-2.png`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push remains paused by user instruction.
- The Scavenger class (`necromancer`) currently uses `player-striker-walk-*`
  in both menu and Pixi gameplay rendering due the previous Striker/Scavenger
  sprite swap.

## 2026-06-09 - v0.25.94 - Add random event duo NPC scaffold (Codex)

### Summary
- Added the supplied duo character art as `quest-futari` with the purple
  background keyed transparent.
- Added a random in-world event NPC that appears once per run.
- The duo can be interacted with by standing inside their circle and using
  melee, matching the weapon merchant interaction style.
- Added a short dialogue popup with `受ける` / `受けない`.
- Accepting starts the event quest state for the current run; declining closes
  the dialogue without changing quest state.
- Added a light breathing motion to the duo sprite so they feel alive in-world.

### Code touched
- `public/sprites/quest-futari.png`
- `src/types/game.ts`
- `src/store/gameStore.ts`
- `src/pixi/pixiTextures.ts`
- `src/pixi/pixiScene.ts`
- `src/components/Game.tsx`
- `src/components/EventQuestMenu.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.
- Quest completion conditions/rewards are intentionally not implemented yet.
- `completeEventQuest()` is available as the future hook for fade-out removal.
- Weapon merchant breathing was left off because the sprite includes large
  attached weapon props and would look like the whole shop is breathing.

## 2026-06-09 - v0.25.93 - Smooth trap shove direction (Codex)

### Summary
- Changed Marksman trap melee shove direction to use the player's position
  relative to the trap center instead of the player's facing direction.
- A player above the trap now pushes it downward, left pushes it right, and
  diagonal positions push it away diagonally.
- Added a short visual-only slide interpolation so shoved traps glide smoothly
  to their new position instead of snapping.

### Code touched
- `src/store/gameStore.ts`
- `src/pixi/pixiScene.ts`
- `src/types/game.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.
- Trap gameplay position updates immediately; only the Pixi rendering is
  eased for the shove animation.

## 2026-06-09 - v0.25.92 - Replace weapon merchant sprite (Codex)

### Summary
- Replaced the weapon merchant sprite with the supplied dot-art version.
- Keyed the purple background to transparent.
- Normalized the sprite to about the in-game target height (`93x100`) using
  nearest-neighbor scaling so Pixi does not downsample a huge source and crush
  the dots.

### Assets touched
- `public/sprites/weapon-merchant.png`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.
- On-device check: confirm merchant dot crispness and in-world size after the
  new `93x100` texture.

## 2026-06-09 - v0.25.91 - Add weapon merchant direction indicator (Codex)

### Summary
- Added a screen-edge direction indicator for the weapon merchant when she is
  off-screen.
- The indicator uses a gold/purple merchant-lantern style icon and an arrow
  pointing toward the merchant.
- The indicator stays hidden while the merchant is visible on-screen.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.
- On-device check: ensure the merchant icon does not clutter the existing
  castle/supply arrows.

## 2026-06-09 - v0.25.90 - Replace striker and marksman sprites (Codex)

### Summary
- Replaced the Striker walk frames with the supplied red-haired character art.
  - Current class mapping uses `player-scavenger-walk-*` for Striker.
- Replaced the Marksman walk frames with the supplied hooded rifle character art.
  - Marksman uses `player-magnum-walk-*`.
- Purple backgrounds were chroma-keyed to transparent, then each frame was
  fitted to the existing `128x108` player sprite canvas using nearest-neighbor
  scaling.

### Assets touched
- `public/sprites/player-scavenger-walk-0.png`
- `public/sprites/player-scavenger-walk-1.png`
- `public/sprites/player-scavenger-walk-2.png`
- `public/sprites/player-magnum-walk-0.png`
- `public/sprites/player-magnum-walk-1.png`
- `public/sprites/player-magnum-walk-2.png`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.
- Note: file naming still reflects the earlier Striker/Scavenger art swap; the
  rendered class mapping is correct.

## 2026-06-09 - v0.25.89 - Smooth weapon merchant depth scaling (Codex)

### Summary
- Removed the merchant-only 1/256 scale snapping.
- Weapon merchant size now follows the same continuous depth scale as other
  actors, making near/far size changes seamless.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.
- This may slightly soften merchant pixels at some distances, but avoids visible
  stepping in perspective scale.

## 2026-06-09 - v0.25.88 - Lower horizon forest layer (Codex)

### Summary
- Moved the horizon seam forest layer below the gameplay world group.
- The distant forest still sits in front of the far backdrop, but it no longer
  draws over enemies, pickups, props, the player, castle, or merchant.
- Updated the layer comments to reflect the new ordering.

### Code touched
- `src/pixi/layers.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.
- On-device check: confirm the far/ground seam still reads naturally now that
  gameplay objects are always above the horizon forest.

## 2026-06-09 - v0.25.87 - Y-sort castle with actors (Codex)

### Summary
- Moved the boss castle from the background layer into the Y-sorted actor layer.
- Set the castle z-index to its foot position, matching trees and other actors.
- The player now appears behind the castle when walking behind it, and in front
  when walking below/in front of it.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.
- On-device check: confirm the castle hiding point feels aligned with its
  collision footprint.

## 2026-06-09 - v0.25.86 - Increase weapon merchant size (Codex)

### Summary
- Increased the weapon merchant render height from `50` to `100`, roughly 2x
  the previous in-game size.
- Kept the tightened shop interaction rule unchanged: the player must be inside
  the merchant circle and melee to open the shop.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.

## 2026-06-09 - v0.25.85 - Tune weapon merchant scale and interaction radius (Codex)

### Summary
- Reduced the weapon merchant render height from `148` to `50`, roughly one
  third of the previous in-game size.
- Rounded merchant sprite scale to a 1/256 step to keep pixel-art scaling more
  stable and reduce visible distortion.
- Tightened shop opening: melee only opens the shop when the player's center is
  inside the merchant interaction circle, not merely within melee reach.

### Code touched
- `src/pixi/pixiScene.ts`
- `src/store/gameStore.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.
- On-device check: merchant should feel intentionally interactable but no
  longer oversized.

## 2026-06-09 - v0.25.84 - Add castle collision and reduce castle size (Codex)

### Summary
- Reduced the boss castle render height to roughly half of the previous size.
- Added castle AABB collision using the same obstacle convention as trees:
  bottom-center foot point, narrow collision rectangle, and AABB push-out.
- Player movement now resolves against castle collision after tree and torch
  collision.
- Grenades now treat the castle as a wall and bounce off it like trees/torches.

### Code touched
- `src/store/gameStore.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.
- On-device check: castle visual scale, foot collision width/height, and
  grenade bounce feel.

## 2026-06-09 - v0.25.83 - Add weapon merchant shop interaction (Codex)

### Summary
- Added the weapon merchant as an in-world Pixi sprite using the supplied art
  with the purple background keyed transparent.
- Placed the merchant randomly near the map center/start area each run.
- Changed shop access to intentional interaction: stand near the merchant and
  use melee to open the shop. Passing nearby no longer auto-opens the menu.
- Added a compact strap shop:
  - handgun / shotgun / rifle ammo packs: `10s`
  - dog: `100s`, levels up each purchase and is removed from level-up options
  - current character subweapon level-up: `100s`
  - medkit: `50s`, same immediate heal amount as meat
  - vaccine: `1000s`, one-time purchase that revives the player once
- Vaccine revive restores 50% max HP, grants invulnerability, and plays a green
  revive flash/callout.

### Code touched
- `src/store/gameStore.ts`
- `src/types/game.ts`
- `src/hooks/useGameLoop.ts`
- `src/pixi/pixiScene.ts`
- `src/pixi/pixiTextures.ts`
- `src/components/Game.tsx`
- `src/components/ShopMenu.tsx`
- `src/utils/upgradeUtils.ts`
- `public/sprites/weapon-merchant.png`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.
- On-device check: merchant scale/position, melee-open feel, and vaccine revive
  balance.

## 2026-06-09 - v0.25.82 - Adjust provisional score and gold formula (Codex)

### Summary
- Updated provisional result scoring:
  - damage score: `damageDealt * 0.5`
  - max combo score: `maxCombo * 500`
  - treasure score: `treasureValue * 10000`
  - remaining strap score: `remainingStraps * 80`
  - clear multiplier: `won ? 3 : 1`
  - gold: `floor(finalScore / 3000)`
- Gold is now earned even without stage clear, but clear runs receive 3x score
  before gold conversion.
- Result screen now shows the clear multiplier and the `SCORE / 3000` gold
  conversion note instead of saying gold is clear-only.

### Code touched
- `src/utils/resultScoring.ts`
- `src/components/GameOverScreen.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.

## 2026-06-09 - v0.25.81 - Disable reload movement slowdown (Codex)

### Summary
- Removed the current reload movement slowdown by setting the reload movement
  multiplier to `1.0`.
- Kept the multiplier as a single tuning constant so it can be lowered later
  without hunting through movement code.
- Updated the reload-state type comment so it no longer says reload always
  moves at 2/3 speed.

### Code touched
- `src/store/gameStore.ts`
- `src/types/game.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.

## 2026-06-09 - v0.25.80 - Compact result screen into two columns (Codex)

### Summary
- Reworked the result screen into a compact two-column layout.
- Left column now groups run stats in a dense result grid.
- Right column now groups total score and score breakdown.
- Action buttons are now side-by-side to reduce vertical height.

### Code touched
- `src/components/GameOverScreen.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.

## 2026-06-09 - v0.25.79 - Add named treasure sprites and pickup popup (Codex)

### Summary
- Cut the supplied treasure sheet into six individual sprite assets:
  - `public/sprites/treasure-1.png` through `public/sprites/treasure-6.png`
- Removed the sheet's white number labels and purple background from the
  in-game treasure sprites.
- Applied the requested rarity order by treasure value: `4, 2, 3, 1, 5, 6`.
- Added the requested treasure names:
  - 1: ニケ像
  - 2: 宝石袋
  - 3: ダイヤのネックレス
  - 4: 高級腕時計
  - 5: 変異種血液サンプル
  - 6: 謎のコア
- Treasure pickups now use the same top acquisition popup pattern as weapon
  pickups, with a treasure-specific label and coloring.

### Code touched
- `src/store/gameStore.ts`
- `src/types/game.ts`
- `src/pixi/pixiScene.ts`
- `src/pixi/pixiTextures.ts`
- `src/components/GameHUD.tsx`
- `public/sprites/treasure-1.png`
- `public/sprites/treasure-2.png`
- `public/sprites/treasure-3.png`
- `public/sprites/treasure-4.png`
- `public/sprites/treasure-5.png`
- `public/sprites/treasure-6.png`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.
- Treasure score currently uses `pickup.value`, so the rarity order also affects
  result scoring weight.

## 2026-06-09 - v0.25.78 - Add run currency and result gold scoring (Codex)

### Summary
Added the first pass of the two-currency loop.
- Added in-run `strap` currency to the player.
- Enemies and breakable props can now drop strap pickups.
- Distance-rank enemies can drop treasure pickups:
  - blue/strong: 2%
  - purple/elite: 5%
  - red/danger: 10%
- Added pickup collection stats for straps and treasures.
- Added max combo tracking for result scoring.
- Added result-score calculation:
  - damage: 1 score per damage
  - max combo: 500 score each
  - treasure: 10000 score per treasure unit
  - remaining straps: 100 score each
  - clear gold: `floor(totalScore / 1000)`, awarded/displayed only on victory
- Updated result screen to show score breakdown and earned gold.
- Added HUD strap count.

### Code touched
- `src/types/game.ts`
- `src/store/gameStore.ts`
- `src/hooks/useGameLoop.ts`
- `src/pixi/pixiScene.ts`
- `src/components/GameHUD.tsx`
- `src/components/GameOverScreen.tsx`
- `src/utils/resultScoring.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.
- Gold persistence and permanent upgrade/shop spending are intentionally not
  connected yet. This pass only implements drops, collection, and result
  scoring.
- Treasure rates are intentionally configurable constants; if treasure becomes
  too dominant, lower blue/purple/red to 1% / 3% / 7% first.

## 2026-06-09 - v0.25.77 - Allow melee shoving Marksman traps (Codex)

### Summary
Made Marksman traps more interactable.
- A melee swing that reaches a placed trap now shoves it a short distance in
  the player's facing direction.
- Trap lifetime, hit target history, area, and target count are preserved when
  shoved.
- Added a small blue slash/ring feedback on trap shove.

### Code touched
- `src/store/gameStore.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.
- Tune `TRAP_MELEE_SHOVE_DISTANCE` if the shove distance feels too short or too
  strong in play.

## 2026-06-09 - v0.25.76 - Add difficulty aura and readable damage numbers (Codex)

### Summary
Improved difficulty readability and combat feedback.
- Distance-difficulty enemies now emit a lightweight body aura that matches
  their rank color: blue, purple, or red.
- The aura uses one pooled glow sprite per enemy view and a slow pulse, avoiding
  per-enemy particle emission.
- Damage numbers are larger, have stronger dark outlines, pop slightly on
  spawn, and drift upward for better visibility during combat.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.
- If the aura feels too strong on-device, tune `ENEMY_BODY_AURA_ALPHA` first.

## 2026-06-09 - v0.25.75 - Add distance-based difficulty and castle boss event (Codex)

### Summary
Added the first pass of the exploration-risk difficulty foundation.
- Enemy difficulty now combines existing time scaling with distance from the
  game origin.
- Staying near the start keeps the existing local difficulty curve.
- Enemies spawned farther from the origin receive extra HP/damage multipliers.
- Enemy difficulty metadata now includes distance zone, rank, and multiplier for
  future reward scaling.
- Stronger distance-zone enemies show aura light instead of changing body color:
  blue for strong, purple for elite, red for danger.
- A castle event is generated once per run at a random off-screen distance from
  the starting point.
- At 5 minutes, the castle marks itself active, flashes red, emits ground
  effects, and spawns a `giantbat` boss from its position.
- The castle now renders from the supplied transparent sprite instead of the
  temporary procedural placeholder.
- The castle also gets an off-screen edge arrow, using the same safe HUD clamp
  as world-drop ammo and weapon supplies.

### Code touched
- `public/sprites/castle.png`
- `src/types/game.ts`
- `src/utils/enemyUtils.ts`
- `src/store/gameStore.ts`
- `src/hooks/useGameLoop.ts`
- `src/pixi/pixiTextures.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change for now. GitHub push is paused by user instruction.
- Reward scaling for distance zones is intentionally not connected yet.

## 2026-06-09 - v0.25.74 - Replace Heavy Gunner walk sprites (Codex)

### Summary
Replaced the Heavy Gunner walk sprites with the latest blue-haired heavy-gunner
sheet.
- Processed `/tmp/codex-remote-attachments/019e963d-1503-7b22-a39b-597ea91a7423/5622C7E0-49DE-4709-8F0A-2347105D6742/1-写真1.jpg`.
- Extracted three frames for `player-shotgun-walk-0.png` through
  `player-shotgun-walk-2.png`.
- Removed the purple backdrop with hard alpha only.
- Removed small neighboring-frame fragments after extraction.
- Kept the shared 128x108 frame size and 96px visible sprite-height convention
  so in-game scaling follows the existing pixel-art display rules.

### Code touched
- `public/sprites/player-shotgun-walk-0.png`
- `public/sprites/player-shotgun-walk-1.png`
- `public/sprites/player-shotgun-walk-2.png`
- `package.json`, `package-lock.json`

### Verification
- Confirmed all three Heavy Gunner frames are 128x108 RGBA.
- Confirmed zero semi-transparent pixels in all three Heavy Gunner frames.
- Confirmed zero visible purple-key pixels remain in all three Heavy Gunner
  frames.
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Pushed after verification.

## 2026-06-09 - v0.25.73 - Shrink Dog and shorten grenade fuse (Codex)

### Summary
Adjusted Dog fetch display size and Heavy Gunner grenade timing.
- Reduced Dog fetch sprite display scale from `0.5` to `1 / 3`.
- Chose a one-third display scale so the 96x72 Dog sprites land near clean
  32x24 display dimensions.
- Shortened Heavy Gunner sub-weapon grenade fuse from `2500ms` to `2000ms`.

### Code touched
- `src/hooks/useGameLoop.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Pushed after verification.

## 2026-06-09 - v0.25.72 - Reduce Dog sprite scale again (Codex)

### Summary
Made the Dog fetch sprite smaller while keeping the pixel-art source untouched.
- Reduced Dog fetch sprite display scale from `0.64` to `0.5`.
- Used a clean half-size display scale to preserve hard pixel edges as much as
  possible in Pixi.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Pushed after verification.

## 2026-06-09 - v0.25.71 - Tune grenade fuse and Dog size (Codex)

### Summary
Adjusted Heavy Gunner grenade timing and Dog fetch sprite size.
- Changed Heavy Gunner sub-weapon grenade fuse from `2000ms` to `2500ms`.
- Reduced Dog fetch sprite display scale from `0.72` to `0.64`.
- Kept the Dog source sprites unchanged so the pixel-art cutout remains intact.

### Code touched
- `src/hooks/useGameLoop.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Pushed after verification.

## 2026-06-09 - v0.25.70 - Replace Marksman walk sprites (Codex)

### Summary
Replaced the Marksman walk sprites with the latest hooded rifle sheet.
- Processed `/tmp/codex-remote-attachments/019e963d-1503-7b22-a39b-597ea91a7423/455F613A-E3DC-468C-9DF6-E8086AF750A9/1-写真1.jpg`.
- Extracted three frames for `player-magnum-walk-0.png` through `player-magnum-walk-2.png`.
- Removed the purple backdrop and internal purple pixels with hard alpha only.
- Re-centered frames by head/top-band position to reduce walk-cycle head wobble.
- Kept the shared 128x108 frame size and 96px visible sprite-height convention.

### Code touched
- `public/sprites/player-magnum-walk-0.png`
- `public/sprites/player-magnum-walk-1.png`
- `public/sprites/player-magnum-walk-2.png`
- `package.json`, `package-lock.json`

### Verification
- Confirmed all three Marksman frames are 128x108 RGBA.
- Confirmed zero semi-transparent pixels in all three Marksman frames.
- Confirmed zero visible purple-key pixels remain in all three Marksman frames.
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Pushed after verification.

## 2026-06-09 - v0.25.69 - Add quick-magazine crit buff (Codex)

### Summary
Added a temporary crit bonus to Scavenger's quick magazine reload skill.
- When a `quick-magazine` pickup actually reloads ammo into the active gun, the
  player gains `+10%` gun critical chance for `5s`.
- The buff uses gameTime, so it pauses with the game.
- The bonus is applied at shot creation together with weapon base crit and the
  level-up crit passive.
- Empty quick-magazine pickups that move no ammo do not grant the buff.

### Code touched
- `src/types/game.ts`
- `src/store/gameStore.ts`
- `src/utils/weaponUtils.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Pushed after verification.

## 2026-06-09 - v0.25.68 - Replace Dog fetch animation with sprites (Codex)

### Summary
Replaced the temporary procedural Dog fetch drawing with a two-frame sprite
animation.
- Processed `/tmp/codex-remote-attachments/019e963d-1503-7b22-a39b-597ea91a7423/84043E2F-5B14-4506-A3A0-89DCB06F7D31/1-写真1.jpg`.
- Added `public/sprites/dog-walk-0.png` and `public/sprites/dog-walk-1.png`.
- Removed the purple backdrop and enclosed purple holes around the legs with
  hard alpha only.
- Added the dog sprites to Pixi texture preloading.
- Dog fetch effects now render a sprite with a small ground shadow and 2-frame
  walk animation instead of the temporary blocky Graphics dog.

### Code touched
- `public/sprites/dog-walk-0.png`
- `public/sprites/dog-walk-1.png`
- `src/pixi/pixiTextures.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- Confirmed both dog frames are 96x72 RGBA.
- Confirmed zero semi-transparent pixels in both dog frames.
- Confirmed zero visible purple-key pixels remain in both dog frames.
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Pushed after verification.

## 2026-06-09 - v0.25.67 - Double heavy grenade knockback (Codex)

### Summary
Increased Heavy Gunner sub-weapon grenade knockback distance.
- Changed `HEAVY_GRENADE_KNOCKBACK_MULT` from `1.8` to `3.6`.
- This affects the Heavy Gunner thrown grenade blast only.
- Bullet knockback, shotgun pellet knockback, melee knockback, and grenade
  launcher splash damage are unchanged.

### Code touched
- `src/hooks/useGameLoop.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Pushed after verification.

## 2026-06-09 - v0.25.66 - Swap Striker and Scavenger character art (Codex)

### Summary
Swapped the visible character art for Striker and Scavenger.
- Striker (`rogue`) now uses the Scavenger sprite set.
- Scavenger (`necromancer`) now uses the Striker sprite set.
- Updated both the character selection cards and in-game Pixi player rendering.
- Gameplay class ids, stats, loadouts, and sub-weapons are unchanged.

### Code touched
- `src/components/MainMenu.tsx`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-09 - v0.25.65 - Replace Marksman hooded walk sprites (Codex)

### Summary
Replaced the Marksman walk sprites with the new hooded marksman sheet.
- Processed `/tmp/codex-remote-attachments/019e963d-1503-7b22-a39b-597ea91a7423/C9F3F49A-38CD-4174-BDE1-6CB0BF5A847A/1-写真1.jpg`.
- Extracted three frames for `player-magnum-walk-0.png` through `-2.png`.
- Removed the connected purple backdrop with hard alpha only.
- Re-centered the frames by head/top-band position to reduce walk-cycle head wobble.
- Kept the shared 128x108 frame size and 96px visible sprite-height convention.

### Code touched
- `public/sprites/player-magnum-walk-0.png`
- `public/sprites/player-magnum-walk-1.png`
- `public/sprites/player-magnum-walk-2.png`
- `package.json`, `package-lock.json`

### Verification
- Confirmed all three Marksman frames are 128x108 RGBA.
- Confirmed zero semi-transparent pixels in all three Marksman frames.
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.64 - Bust class-select sprite cache (Codex)

### Summary
Fixed stale character art on the class selection screen.
- Added the app version query string to `MainMenu` character sprite URLs.
- The Pixi/gameplay renderer already used versioned sprite URLs via
  `spritePath()`, but the React class cards used direct image URLs and could
  keep old cached PNGs.
- This makes class selection art refresh with each version bump.

### Code touched
- `src/components/MainMenu.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Pushed because the issue is visible on the GitHub Pages environment.

## 2026-06-08 - v0.25.63 - Match gameplay player scale to class cards (Codex)

### Summary
Adjusted gameplay player rendering to better match the character selection
card display.
- Changed `PLAYER_VISUAL_SCALE` from `2.6` to `2.3`.
- With the current 128x108 player frames, this makes the central gameplay
  player display height nearly identical to the class-card image height.
- Re-centered Marksman and Striker walk frames by head-position instead of
  full-frame/bounding-box center so their heads no longer sway left/right as
  much during the walk cycle.
- Kept hard-alpha sprites; no semi-transparent pixels were introduced.

### Code touched
- `public/sprites/player-magnum-walk-0.png`
- `public/sprites/player-magnum-walk-1.png`
- `public/sprites/player-magnum-walk-2.png`
- `public/sprites/player-striker-walk-0.png`
- `public/sprites/player-striker-walk-1.png`
- `public/sprites/player-striker-walk-2.png`
- `src/pixi/renderSpec.ts`
- `package.json`, `package-lock.json`

### Verification
- Gameplay center-scale target: class card `86/128 = 0.671875`, gameplay
  player `28*2.3/96 = 0.670833`.
- Confirmed Marksman head centers now stay around x=64px.
- Confirmed Striker head centers now stay around x=64px.
- Confirmed zero semi-transparent pixels in adjusted frames.
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.62 - Replace Marksman sprites and retune player scale (Codex)

### Summary
Replaced the Marksman in-game walk sprites and adjusted the gameplay player
display size after local feedback.
- Processed `/Users/tanity/Downloads/4D2D71E4-AFBE-4BF8-B487-836B1E4D0EB1.PNG`.
- Extracted three frames for `player-magnum-walk-0.png` through `-2.png`.
- Removed the connected purple backdrop with hard alpha only.
- Kept the existing `0 -> 1 -> 2 -> 1` Marksman animation sequence.
- Adjusted `PLAYER_VISUAL_SCALE` from `1.5` to `2.6` so in-game characters sit
  closer to the character-select card size.

### Code touched
- `public/sprites/player-magnum-walk-0.png`
- `public/sprites/player-magnum-walk-1.png`
- `public/sprites/player-magnum-walk-2.png`
- `src/pixi/renderSpec.ts`
- `package.json`, `package-lock.json`

### Verification
- Confirmed all three Marksman frames are 128x108 RGBA.
- Confirmed zero semi-transparent pixels in all three Marksman frames.
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.61 - Replace Heavy Gunner walk sprites (Codex)

### Summary
Replaced the Heavy Gunner in-game walk sprites with the latest supplied sheet.
- Processed `/Users/tanity/Downloads/94326402-8E4B-4E51-9365-C25966311941.PNG`.
- Extracted three frames for `player-shotgun-walk-0.png` through `-2.png`.
- Removed the connected purple backdrop with hard alpha only.
- Kept the existing `0 -> 1 -> 2 -> 1` Heavy Gunner animation sequence.
- Kept the shared 128x108 frame size and 96px visible sprite-height convention.

### Code touched
- `public/sprites/player-shotgun-walk-0.png`
- `public/sprites/player-shotgun-walk-1.png`
- `public/sprites/player-shotgun-walk-2.png`
- `package.json`, `package-lock.json`

### Verification
- Confirmed all three frames are 128x108 RGBA.
- Confirmed zero semi-transparent pixels in all three frames.
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.60 - Halve in-game player display scale (Codex)

### Summary
Reduced the gameplay player sprite size further after local visual feedback.
- Changed `PLAYER_VISUAL_SCALE` from `3.0` to `1.5`.
- This affects only the in-game foot-anchored player drawing box.
- Character selection layout, gameplay collision, movement speed, and melee
  range are unchanged.

### Code touched
- `src/pixi/renderSpec.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.59 - Reduce in-game player display scale (Codex)

### Summary
Adjusted the gameplay-only player sprite size after the crisp sprite rebuild.
- Reduced `PLAYER_VISUAL_SCALE` from `3.45` to `3.0`.
- Keeps player collision, movement speed, melee range, and class selection
  layout unchanged.
- The Pixi player draw path still uses uniform X/Y scale, so this does not add
  vertical stretching or any new masking/filter trick.

### Code touched
- `src/pixi/renderSpec.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.
- If the sprite still feels tall in gameplay, tune `PLAYER_VISUAL_SCALE` again;
  avoid non-uniform Y scaling unless the user explicitly wants squash/stretch.

## 2026-06-08 - v0.25.58 - Rebuild player sprites for crisp dot rendering (Codex)

### Summary
Rebuilt all current player class walk sprites for sharper in-game dot rendering.
- The previous sprites preserved huge source images, then Pixi scaled them down
  heavily in-game. That minification crushed the dot texture.
- Re-extracted Marksman, Heavy Gunner, Striker, and Scavenger frames from the
  latest supplied source sheets.
- Rebuilt each frame as a game-display-size 128x108 PNG with a 96px visible
  sprite height.
- Used nearest-neighbor resizing and hard alpha keying so the rendered sprites
  have no semi-transparent edge blur.
- Increased `PLAYER_VISUAL_SCALE` so these 96px player sprites display near
  their source pixel size instead of being strongly minified.
- Kept the `0 -> 1 -> 2 -> 1` animation sequence for all four classes.

### Code touched
- `public/sprites/player-magnum-walk-0.png`
- `public/sprites/player-magnum-walk-1.png`
- `public/sprites/player-magnum-walk-2.png`
- `public/sprites/player-shotgun-walk-0.png`
- `public/sprites/player-shotgun-walk-1.png`
- `public/sprites/player-shotgun-walk-2.png`
- `public/sprites/player-striker-walk-0.png`
- `public/sprites/player-striker-walk-1.png`
- `public/sprites/player-striker-walk-2.png`
- `public/sprites/player-scavenger-walk-0.png`
- `public/sprites/player-scavenger-walk-1.png`
- `public/sprites/player-scavenger-walk-2.png`
- `src/pixi/renderSpec.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- Confirmed all rebuilt player walk frames are 128x108 RGBA.
- Confirmed rebuilt frames have hard alpha only, with zero semi-transparent pixels.
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.
- This intentionally changes player visual scale only; gameplay collision boxes
  remain unchanged.

## 2026-06-08 - v0.25.57 - Replace Marksman walk cycle (Codex)

### Summary
Updated the Marksman player animation.
- Processed `/Users/tanity/Downloads/E92EB5D4-AE38-465D-8FFB-C69778EFA6AB.PNG`.
- Extracted three transparent frames without resampling the source pixels.
- Marksman now uses `player-magnum-walk-0.png` through `-2.png`.
- Marksman playback now loops as `0 -> 1 -> 2 -> 1`.
- Added a Marksman-specific sprite base height so the larger source can stay
  uncropped without changing gameplay scale.

### Code touched
- `public/sprites/player-magnum-walk-0.png`
- `public/sprites/player-magnum-walk-1.png`
- `public/sprites/player-magnum-walk-2.png`
- `src/pixi/pixiTextures.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- Processed frame PNGs are RGBA with transparent backgrounds.
- Confirmed Marksman frames are 430x490.
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.56 - Replace Scavenger walk cycle (Codex)

### Summary
Updated the Scavenger player animation.
- Processed `/Users/tanity/Downloads/74737E6E-2E78-4176-BC6A-70EDE7483665.PNG`.
- Extracted three transparent frames without resampling the source pixels.
- Scavenger now uses `player-scavenger-walk-0.png` through `-2.png`.
- Scavenger playback now loops as `0 -> 1 -> 2 -> 1`.
- Added a Scavenger-specific sprite base height so the larger source can stay
  uncropped without changing gameplay scale.

### Code touched
- `public/sprites/player-scavenger-walk-0.png`
- `public/sprites/player-scavenger-walk-1.png`
- `public/sprites/player-scavenger-walk-2.png`
- `src/pixi/pixiTextures.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- Processed frame PNGs are RGBA with transparent backgrounds.
- Confirmed Scavenger frames are 400x470.
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.55 - Replace Heavy Gunner and Striker walk cycles (Codex)

### Summary
Updated Heavy Gunner and Striker player animations.
- Processed `/Users/tanity/Downloads/FD56B342-AC47-4A22-9A95-426A21574DED.PNG` for Heavy Gunner.
- Processed `/Users/tanity/Downloads/EA23808E-F62E-45E8-9C7B-219CC68CD4A8.jpg` for Striker.
- Extracted three transparent frames for each class without resampling the
  source pixels.
- Heavy Gunner now uses `player-shotgun-walk-0.png` through `-2.png`.
- Striker now uses `player-striker-walk-0.png` through `-2.png`.
- Heavy Gunner and Striker playback now loops as `0 -> 1 -> 2 -> 1`.
- Added class-specific sprite base heights so the larger Heavy Gunner source
  can stay uncropped without changing gameplay scale.

### Code touched
- `public/sprites/player-shotgun-walk-0.png`
- `public/sprites/player-shotgun-walk-1.png`
- `public/sprites/player-shotgun-walk-2.png`
- `public/sprites/player-striker-walk-0.png`
- `public/sprites/player-striker-walk-1.png`
- `public/sprites/player-striker-walk-2.png`
- `src/pixi/pixiTextures.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- Processed frame PNGs are RGBA with transparent backgrounds.
- Confirmed Heavy Gunner frames are 350x480 and Striker frames are 270x410.
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.54 - Explicitly clean up Pixi ticker on replay (Codex)

### Summary
Reduced the likely replay-after-first-run slowdown.
- `PixiStage` now stores the Pixi ticker callback and removes it explicitly on
  unmount.
- The cleanup also clears the host element children after destroying the Pixi
  application, so stale canvases cannot remain attached.
- This targets the symptom where the first play after Safari restart is light,
  but subsequent plays in the same tab feel heavier.

### Code touched
- `src/pixi/PixiStage.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.
- If the issue persists, add a tiny debug counter for live PixiStage instances
  and active ticker callbacks to confirm whether a renderer loop is still
  leaking.

## 2026-06-08 - v0.25.53 - Restore projectile collision freshness (Codex)

### Summary
Fixed a regression from the game-loop performance cleanup.
- Projectile/enemy collision detection now reads fresh `projectiles` and
  `enemies` after movement updates in the same frame.
- Hit processing now looks up projectile and enemy data from that same fresh
  snapshot instead of the older frame-start arrays.
- This keeps the v0.25.52 React churn reduction while restoring gun hit
  detection.

### Code touched
- `src/hooks/useGameLoop.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.52 - Reduce game-loop React churn (Codex)

### Summary
Reduced a likely runtime performance issue in the main game loop.
- Removed high-frequency React subscriptions from `useGameLoop` for `player`,
  `enemies`, `projectiles`, `pickups`, `breakableProps`, `inputState`,
  `swipeDirection`, `gameBounds`, `gameTime`, and `isPaused`.
- The simulation loop now reads the latest Zustand state directly inside each
  animation frame.
- This avoids re-rendering/recreating the RAF effect whenever gameplay arrays
  change, which became expensive after more enemies, pickups, effects, and
  sub-weapons were added.
- Gameplay behavior is intended to remain unchanged.

### Code touched
- `src/hooks/useGameLoop.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.
- If Safari still feels heavy after this, next check Pixi filter cost and effect
  counts rather than texture cache growth.

## 2026-06-08 - v0.25.51 - Replace Striker walk sheet second revision (Codex)

### Summary
Updated the Striker six-frame walk sprites with the latest supplied sheet.
- Processed `/Users/tanity/Downloads/EA23808E-F62E-45E8-9C7B-219CC68CD4A8.PNG`.
- Detected each sprite cluster after purple-key transparency, then rebuilt `player-striker-walk-0.png` through `-5.png`.
- Rebuilt the frames on a taller transparent canvas so the 398px-tall source pixels are not cropped or resampled.
- Kept the current walk animation tempo and six-frame playback code unchanged.
- Added a class-sprite base-height constant so the taller Striker PNGs preserve the existing in-game scale without flattening the source pixels.

### Code touched
- `public/sprites/player-striker-walk-0.png`
- `public/sprites/player-striker-walk-1.png`
- `public/sprites/player-striker-walk-2.png`
- `public/sprites/player-striker-walk-3.png`
- `public/sprites/player-striker-walk-4.png`
- `public/sprites/player-striker-walk-5.png`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- Processed frame PNGs are RGBA with transparent backgrounds.
- Confirmed every Striker frame keeps the full 398px source-height sprite inside a 270x410 canvas.
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.50 - Slow player walk animation a touch more (Codex)

### Summary
Slightly slowed the player walk animation again.
- Increased `PLAYER_WALK_CYCLE_MS` from `420` to `460`.
- Movement speed and gameplay physics are unchanged.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.49 - Slightly slow player walk animation (Codex)

### Summary
Adjusted the player walk animation tempo.
- Increased `PLAYER_WALK_CYCLE_MS` from `360` to `420`.
- This makes the six-frame Striker walk sheet advance a little more calmly without changing player movement speed.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.48 - Replace Striker walk sheet revision (Codex)

### Summary
Updated the Striker six-frame walk sprites with the revised sheet.
- Processed `/Users/tanity/Downloads/D31851F7-F5F1-40B0-9E1D-37FE3DCBB40A.PNG`.
- Detected each sprite cluster after purple-key transparency, avoiding adjacent-frame bleed.
- Rebuilt:
  - `public/sprites/player-striker-walk-0.png`
  - `public/sprites/player-striker-walk-1.png`
  - `public/sprites/player-striker-walk-2.png`
  - `public/sprites/player-striker-walk-3.png`
  - `public/sprites/player-striker-walk-4.png`
  - `public/sprites/player-striker-walk-5.png`
- Kept the existing six-frame Striker animation code path unchanged.

### Code touched
- `public/sprites/player-striker-walk-0.png`
- `public/sprites/player-striker-walk-1.png`
- `public/sprites/player-striker-walk-2.png`
- `public/sprites/player-striker-walk-3.png`
- `public/sprites/player-striker-walk-4.png`
- `public/sprites/player-striker-walk-5.png`
- `package.json`, `package-lock.json`

### Verification
- Processed frame PNGs are RGBA with transparent backgrounds.
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.47 - Replace Striker with 6-frame walk sheet (Codex)

### Summary
Updated the Striker player animation.
- Processed `/Users/tanity/Downloads/52A72CB6-BAFC-4601-AB43-E569010D6709.PNG`.
- Split the sheet into six frames, keyed out the purple background, and wrote:
  - `public/sprites/player-striker-walk-0.png`
  - `public/sprites/player-striker-walk-1.png`
  - `public/sprites/player-striker-walk-2.png`
  - `public/sprites/player-striker-walk-3.png`
  - `public/sprites/player-striker-walk-4.png`
  - `public/sprites/player-striker-walk-5.png`
- Pixi texture preload now loads all six Striker frames.
- Striker walk animation now plays all six frames in order.
- Other player classes remain on their existing two-frame cycles.

### Code touched
- `public/sprites/player-striker-walk-0.png`
- `public/sprites/player-striker-walk-1.png`
- `public/sprites/player-striker-walk-2.png`
- `public/sprites/player-striker-walk-3.png`
- `public/sprites/player-striker-walk-4.png`
- `public/sprites/player-striker-walk-5.png`
- `src/pixi/pixiTextures.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- Processed frame PNGs are RGBA with transparent backgrounds.
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.46 - Animate Dog fetch behavior (Codex)

### Summary
Changed `ドッグ` from instant pickup into a visible fetch action.
- Added a temporary pixel-dog renderer using Pixi `Graphics`.
- Dog now runs from the player to the selected pickup, collects it on arrival,
  then returns to the player.
- The next pickup countdown starts only after Dog has returned.
- Cooldowns changed to:
  - Lv1: `3s`
  - Lv2: `2s`
  - Lv3: `1s`
- Dog still skips `quick-magazine` and full-HP health pickups.

### Code touched
- `src/types/game.ts`
- `src/hooks/useGameLoop.ts`
- `src/pixi/pixiScene.ts`
- `src/utils/upgradeUtils.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.45 - Add common Dog sub-weapon pickup helper (Codex)

### Summary
Added common sub-weapon `ドッグ`.
- Dog can appear as a level-up sub-weapon option for every character.
- At intervals, Dog picks one random eligible item currently inside the visible
  screen.
- Dog does not pick sub-weapon generated `quick-magazine` pickups.
- Dog skips health pickups when the player is already at full health.
- Lv scaling currently shortens the pickup interval:
  - Lv1: `7s`
  - Lv2: `5s`
  - Lv3: `3.5s`
- Added a small trail/burst/ring and matching pickup SFX when Dog fetches an
  item.

### Code touched
- `src/types/game.ts`
- `src/utils/upgradeUtils.ts`
- `src/hooks/useGameLoop.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.44 - Start preload at app launch (Codex)

### Summary
Moved the Pixi texture preload earlier in the app lifecycle.
- `ensureTextures()` now starts immediately when `App` mounts.
- Character-select loading still waits for the same preload promise if it has
  not finished yet.
- The post-selection loading screen keeps its short minimum display time, but
  the heavy asset warmup is no longer first kicked off after selecting a class.

### Code touched
- `src/App.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.43 - Tune Hunting charge times (Codex)

### Summary
Adjusted Striker `ハンティング` charge timing.
- Lv1 charge time: `2.5s`
- Lv2 charge time: `2.0s`
- Lv3 charge time: `1.5s`
- Moved Hunting charge timing into the shared Hunting config so game logic and
  upgrade card text stay aligned.

### Code touched
- `src/config/hunting.ts`
- `src/hooks/useGameLoop.ts`
- `src/utils/upgradeUtils.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.42 - Tighten Hunting high-level range (Codex)

### Summary
Adjusted Striker `ハンティング` range scaling after feel testing.
- Lv1 remains `+18px`.
- Lv2 reduced from `+28px` to `+24px`.
- Lv3 reduced from `+40px` to `+34px`.
- Hit detection, charged range circle, attack crest, and card text all continue
  to share the same range table.

### Code touched
- `src/config/hunting.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.41 - Show Hunting charged range circle (Codex)

### Summary
Improved Striker `ハンティング` charged readability.
- When Hunting is fully charged, a faint blue melee-range circle is shown
  around the player.
- The circle uses the same level-scaled melee radius as the actual hit
  detection and the attack crest.
- The existing attack crest remains the active melee swing visual.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.40 - Scale Hunting range by level (Codex)

### Summary
Adjusted Striker `ハンティング` level scaling.
- Hunting melee range bonus now grows by level:
  - Lv1: `+18px`
  - Lv2: `+28px`
  - Lv3: `+40px`
- The hit detection and Pixi crest/ring rendering now use the same level-based
  radius.
- Upgrade card text now shows the input time and current range bonus.

### Code touched
- `src/config/hunting.ts`
- `src/store/gameStore.ts`
- `src/pixi/pixiScene.ts`
- `src/utils/upgradeUtils.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.39 - Start Hunting charge on touch input (Codex)

### Summary
Adjusted Striker `ハンティング` charge feel.
- Charge timing now starts as soon as the touch joystick is pressed.
- The timer no longer depends on actual movement, so dead-zone touch, blocked
  movement, or slow initial movement do not delay the charge start.
- Keyboard movement input also counts as active input.
- Fully charged Hunting still stays ready until melee/counter use.

### Code touched
- `src/store/gameStore.ts`
- `src/components/VirtualJoystick.tsx`
- `src/hooks/useGameLoop.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.38 - Shorten Hunting default charge (Codex)

### Summary
Adjusted Striker `ハンティング` charge timing.
- Lv1/default charge time changed from `5s` to `3s`.
- Lv2 charge time is now `2s`.
- Lv3 charge time is now `1s`.
- Upgrade card descriptions now reflect the shorter timings.

### Code touched
- `src/hooks/useGameLoop.ts`
- `src/utils/upgradeUtils.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.37 - Keep Hunting charge until melee use (Codex)

### Summary
Adjusted Striker `ハンティング` charge behavior.
- Lv1/default charge time remains `5s`.
- Once Hunting is fully charged, the charge stays ready even if the player
  stops walking.
- The charge is still consumed only when the melee/counter swing is triggered.

### Code touched
- `src/hooks/useGameLoop.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.36 - Add Striker Hunting sub-weapon (Codex)

### Summary
Added Striker `ハンティング` as a charge-based sub-weapon.
- Offered only to Striker (`rogue`) through level-up cards.
- Walking continuously charges the next melee attack.
  - Lv1: `5s`
  - Lv2: `4s`
  - Lv3: `3s`
- When charged, the next melee swing uses an expanded melee target range.
- The charge is consumed when the melee/counter swing is triggered.
- Player ground light shifts from warm amber to blue while Hunting is charged.

### Code touched
- `src/types/game.ts`
- `src/store/gameStore.ts`
- `src/utils/upgradeUtils.ts`
- `src/hooks/useGameLoop.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.35 - Move quick magazine skill to Scavenger (Codex)

### Summary
Adjusted sub-weapon class ownership.
- `クイックマガジン` is now offered to Scavenger (`necromancer`) instead of
  Striker (`rogue`).
- Skill behavior is unchanged.

### Code touched
- `src/utils/upgradeUtils.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.34 - Prevent instant pickup during throw arcs (Codex)

### Summary
Fixed quick magazine pickup timing.
- Thrown pickups are no longer collectible until their throw animation has
  completed.
- This prevents Striker quick magazines from being picked up instantly at the
  player's feet on spawn.

### Code touched
- `src/utils/collisionUtils.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.33 - Tighten pickup collection range (Codex)

### Summary
Adjusted shared item pickup feel.
- Reduced the common pickup collision padding from `24px` to `16px`.
- This affects gems, ammo, weapon drops, quick magazines, and other pickups
  uniformly.

### Code touched
- `src/utils/collisionUtils.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.32 - Fix quick magazine throw freeze (Codex)

### Summary
Fixed a likely runtime freeze when Striker quick magazine appears.
- Removed Canvas-style `Graphics.save/rotate/restore` calls from Pixi pickup
  drawing.
- Kept the throw arc and added a small squash pulse so the magazine still
  reads as popping out without unsafe Graphics transforms.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.31 - Let melee detonate grenades (Codex)

### Summary
Added melee interaction for Heavy Gunner grenades.
- Grenades inside melee range are now treated as hit by the melee swing.
- A hit grenade immediately expires its fuse, so the existing grenade blast
  damage, VFX, sound, and knockback logic runs on the next game-loop pass.

### Code touched
- `src/store/gameStore.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.30 - Animate Striker magazine throw (Codex)

### Summary
Improved Striker quick magazine feel.
- Added short pickup throw metadata so quick magazines move from the player to
  their landing point instead of appearing instantly.
- Pickup collision follows the animated throw position.
- Pixi pickup rendering follows the same animated position and spins the
  magazine during the throw for a small "pop" motion.

### Code touched
- `src/types/game.ts`
- `src/utils/collisionUtils.ts`
- `src/hooks/useGameLoop.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.29 - Add grenade blast knockback (Codex)

### Summary
Confirmed and adjusted Heavy Gunner grenade behavior.
- Heavy Gunner grenade remains non-critical.
- Added knockback to enemies hit by the grenade blast.
- Boss/elite immovable exceptions are kept aligned with bullet knockback.

### Code touched
- `src/hooks/useGameLoop.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.28 - Set grenade fuse to 2 seconds (Codex)

### Summary
Adjusted Heavy Gunner grenade timing after local feel testing.
- Changed grenade fuse from `3000ms` to `2000ms`.

### Code touched
- `src/hooks/useGameLoop.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.27 - Set grenade fuse to 3 seconds (Codex)

### Summary
Adjusted Heavy Gunner grenade timing after local feel testing.
- Changed grenade fuse from `4000ms` to `3000ms`.

### Code touched
- `src/hooks/useGameLoop.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.26 - Add Striker quick magazine sub-weapon (Codex)

### Summary
Added the first Striker sub-weapon and adjusted grenade timing.
- Heavy Gunner grenade fuse extended to `4000ms`.
- Added Striker `クイックマガジン` sub-weapon card.
  - Lv1 cooldown: `10s`
  - Lv2 cooldown: `8s`
  - Lv3 cooldown: `6s`
- When the active gun is not full and reserve ammo exists, the Striker drops
  one nearby magazine pickup.
- Picking up the magazine instantly reloads the active gun by moving ammo from
  reserve into the magazine with no reload delay.
- Only one quick magazine can exist at a time to avoid pickup clutter.

### Code touched
- `src/types/game.ts`
- `src/utils/upgradeUtils.ts`
- `src/hooks/useGameLoop.ts`
- `src/store/gameStore.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.25 - Tune grenade blast and trap crit bonus (Codex)

### Summary
Adjusted the sub-weapon follow-up balance.
- Slightly reduced Heavy Gunner grenade blast radius from `72` to `66`.
- Added a `+10%` critical chance bonus against enemies currently rooted by
  the Marksman trap.
  - The trap itself still does not apply critical stun.
  - The bonus is checked when bullets or melee hits land on the rooted enemy.

### Code touched
- `src/hooks/useGameLoop.ts`
- `src/store/gameStore.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless explicitly requested.

## 2026-06-08 - v0.25.24 - Fix grenade spread and trap root behavior (Codex)

### Summary
Adjusted the first sub-weapon balance pass from local testing.
- Heavy Gunner grenades now split into clearly different roll directions.
  - Lv1: one grenade toward the target.
  - Lv2: two grenades split left/right.
  - Lv3: three grenades roll in a surrounding pattern around the player.
- Marksman trap no longer uses critical stun.
  - Added a trap-only `rootUntil` state that stops movement without making
    the enemy a finisher/critical target.
  - Lv2+ traps now stay active until their max target count is reached or
    the trap duration expires.
  - Trap hit tracking prevents the same enemy from consuming multiple target
    slots from one trap.

### Code touched
- `src/types/game.ts`
- `src/store/gameStore.ts`
- `src/hooks/useGameLoop.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Local-only change. Do not push unless the user explicitly asks for GitHub
  handoff again.

## 2026-06-08 - v0.25.23 - Add sub-weapon leveling and Marksman trap (Codex)

### Summary
Expanded the temporary sub-weapon card system.
- Added `subWeaponLevels` to player state.
- Sub-weapon cards can now upgrade existing sub-weapons up to level 3.
- Heavy Gunner grenade now scales by level:
  - Lv1: 1 direction
  - Lv2: 2 directions
  - Lv3: 3 directions
- Added Marksman `トラップ` card.
  - Places a trap at the player's feet on cooldown.
  - Enemies stepping on it are stopped for `3s`.
  - Trap level increases radius and max affected enemies up to 3.
- Trap projectiles are excluded from normal projectile/enemy collision and are
  consumed by their own trigger logic.

### Code touched
- `src/types/game.ts`
- `src/utils/upgradeUtils.ts`
- `src/utils/collisionUtils.ts`
- `src/store/gameStore.ts`
- `src/hooks/useGameLoop.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Current Marksman trap test values:
  - cooldown: `6500ms`
  - duration: `9000ms`
  - stun: `3000ms`
  - radius by level: `34 / 42 / 50`
  - max affected enemies by level: `1 / 2 / 3`
- Sub-weapons are still intentionally lightweight until the final decision
  between character skills and equipment is made.

## 2026-06-08 - v0.25.22 - Shorten grenade roll and add hop motion (Codex)

### Summary
Adjusted the Heavy Gunner grenade behavior.
- Reduced grenade travel distance by shortening fuse time and lowering roll
  speed.
- Added grenade-only rolling drag so it slows down before detonation.
- Added a Pixi hop/shadow treatment so the grenade reads as bouncing from the
  player's feet before exploding.
- Wall bounce behavior remains intact for tree trunks and intact torches.

### Code touched
- `src/hooks/useGameLoop.ts`
- `src/store/gameStore.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Current Heavy Gunner grenade test values:
  - cooldown: `5000ms`
  - fuse: `1050ms`
  - initial roll speed: `118`
  - roll drag: `1.45`
  - damage: `42`
  - radius: `72`

## 2026-06-08 - v0.25.21 - Add Heavy Gunner grenade sub-weapon card (Codex)

### Summary
Added the first test sub-weapon skill as a level-up card.
- Heavy Gunner can now roll a `手榴弾` card in the level-up menu.
- Once learned, the skill has unlimited uses with a `5s` game-time cooldown.
- The grenade rolls toward the nearest enemy, waits `1.2s`, then explodes for
  small-area damage.
- Grenades do not explode on contact with enemies.
- Grenades bounce off tree trunks and intact torches instead of passing through
  them.

### Code touched
- `src/types/game.ts`
- `src/utils/upgradeUtils.ts`
- `src/utils/collisionUtils.ts`
- `src/store/gameStore.ts`
- `src/hooks/useGameLoop.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Current test values:
  - cooldown: `5000ms`
  - fuse: `1200ms`
  - damage: `42`
  - radius: `72`
  - roll speed: `150`
- Sub-weapons are currently stored on `player.subWeapons` and cooldowns on
  `player.subWeaponCooldowns`. This is intentionally lightweight while the
  final "character skill vs equipment" decision is still open.

## 2026-06-08 - v0.25.20 - Add class HP differences and extend combo window (Codex)

### Summary
Made character HP differences affect actual gameplay and extended combo timing.
- Added `maxHp` to `PLAYER_PROFILES`.
- `resetGame` now initializes player `health` / `maxHealth` from the selected
  character profile.
- Starting HP:
  - Heavy Gunner: `130`
  - Marksman: `100`
  - Striker: `105`
  - Scavenger: `120`
- Melee finisher / counter combo window extended from `5s` to `7s`.

### Code touched
- `src/data/playerProfiles.ts`
- `src/store/gameStore.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- `PLAYER_BASE_HP` remains as the generic fallback/default initial store value;
  run-start HP now comes from `PLAYER_PROFILES`.

## 2026-06-08 - v0.25.19 - Fix settings scroll and retune shotgun spread (Codex)

### Summary
Fixed the start-menu settings panel scrolling and retuned shotgun spread.
- Main menu now uses a top-aligned vertical scroll container so expanded
  settings remain reachable on mobile.
- Added extra bottom safe-area padding for the settings/start section.
- Shotgun spread cone by tier is now:
  - T1: `1.00`
  - T2: `0.70`
  - T3: `0.36`

### Code touched
- `src/components/MainMenu.tsx`
- `src/utils/weaponUtils.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If the settings panel grows again, keep the root menu as a scroll container
  and avoid vertical centering on mobile-height layouts.

## 2026-06-08 - v0.25.18 - Tune shotgun spread tiers (Codex)

### Summary
Adjusted shotgun spread by tier.
- T1 spread cone: `0.70`
- T2 spread cone: `0.50`
- T3 spread cone: `0.34`

### Code touched
- `src/utils/weaponUtils.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Loading currently preloads Pixi texture assets through `ensureTextures()`.
  Those textures are cached in memory by Pixi and can also use the browser HTTP
  cache. Audio is warmed by the audio manager when gameplay/audio activates, not
  as a hard loading-screen completion gate.

## 2026-06-08 - v0.25.17 - Add post-character loading screen (Codex)

### Summary
Added a loading step after character selection and before gameplay starts.
- `App` now transitions `menu` -> `loading` -> `playing`.
- The loading screen shows the selected survivor name and a compact animated
  loading treatment.
- Pixi textures are warmed during loading via `ensureTextures()`.
- Loading has a short minimum display time so the transition does not flicker.

### Code touched
- `src/App.tsx`
- `src/components/LoadingScreen.tsx`
- `src/types/game.ts`
- `src/index.css`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Minimum loading display time is controlled by `LOADING_MIN_MS` in
  `src/App.tsx`.

## 2026-06-08 - v0.25.16 - Strengthen combo count pop (Codex)

### Summary
Refined the combo HUD treatment.
- Combo count is larger.
- `COMBO` label is slightly smaller and dimmer.
- Combo glow is flatter and softer, spreading more horizontally with less
  concentrated brightness.
- Combo count pop animation is longer and more exaggerated so count changes read
  as a visible bounce.

### Code touched
- `src/components/GameHUD.tsx`
- `src/index.css`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The combo bounce is controlled by `.combo-count-pop` and
  `@keyframes combo-count-pop` in `src/index.css`.

## 2026-06-08 - v0.25.15 - Tier shotgun spread and combo pop (Codex)

### Summary
Adjusted shotgun spread by tier and refined combo display.
- Shotgun spread is now tier-specific:
  - T1: `0.40rad`
  - T2: `0.36rad`
  - T3: `0.34rad`
- Combo display now separates the count from the `COMBO` label.
- `COMBO` text is smaller.
- Combo number pops in with a short bounce animation whenever the count changes.

### Code touched
- `src/utils/weaponUtils.ts`
- `src/components/GameHUD.tsx`
- `src/index.css`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Shotgun spread is controlled by `SHOTGUN_SPREAD_CONE_RAD_BY_TIER` in
  `src/utils/weaponUtils.ts`.

## 2026-06-08 - v0.25.14 - Add weapon tier pickup colors and shotgun shove tuning (Codex)

### Summary
Improved weapon pickup readability and adjusted shotgun knockback feel.
- Weapon pickup popup now prefixes acquired guns with `T1` / `T2` / `T3`.
- Weapon pickup popup text color now changes by tier:
  - T1: white
  - T2: blue
  - T3: gold
- Duplicate same/lower-tier gun pickups also show the tier prefix before the
  ammo conversion text.
- Renamed weapons:
  - `拳銃` -> `ハンドガン`
  - `二丁拳銃` -> `二丁ハンドガン`
  - `鉈` -> `ダガー`
  - `マチェーテ` -> `ファイティングナイフ`
- Shotgun projectile knockback now applies a small shotgun-only boost on top of
  the existing same-frame pellet hit count multiplier, still capped at 3x.

### Code touched
- `src/store/gameStore.ts`
- `src/components/GameHUD.tsx`
- `src/hooks/useGameLoop.ts`
- `src/utils/weaponUtils.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Shotgun spread is controlled by `SHOTGUN_SPREAD_CONE_RAD = 0.34` in
  `src/utils/weaponUtils.ts`. It is a fixed total cone width shared by all
  shotgun tiers; higher tiers add pellets inside the same cone.

## 2026-06-08 - v0.25.13 - Add debug ammo pickup settings (Codex)

### Summary
Adjusted ammo-box values and exposed them on the start-screen debug settings.
- Default ammo-box pickup amounts changed to:
  - Handgun: +40
  - Shotgun: +10
  - Rifle/Magnum: +20
- Start settings now include debug inputs for each ammo-box amount.
- Duplicate same/lower-tier gun pickups now use the configured amount ×2.
- Debug settings persist in localStorage alongside the melee ammo drop rate.

### Code touched
- `src/store/gameStore.ts`
- `src/components/MainMenu.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The melee ammo drop rate and ammo-box amount settings are debug controls and
  should be removed from the public start menu before release.

## 2026-06-08 - v0.25.12 - Lower heavy-gunner displayed health (Codex)

### Summary
Adjusted the start-menu class stat display.
- Heavy Gunner health display changed from `High` to `Medium`.
- Confirmed current ammo pickup values:
  - Ammo box: handgun +15, shotgun +6, rifle/magnum +4.
  - Duplicate same/lower-tier gun pickup: handgun +30, shotgun +12,
    rifle/magnum +8.

### Code touched
- `src/components/MainMenu.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- This change updates the class-select display only. Current gameplay HP still
  starts from the shared `PLAYER_BASE_HP` unless class-specific HP is added.

## 2026-06-08 - v0.25.11 - Use character sprites in start menu (Codex)

### Summary
Reworked the start-character selection cards to use the actual class sprites.
- Removed the lucide class icons from the character cards.
- Each class card now shows the corresponding standing sprite:
  - `warrior`: shotgun/heavy-gunner female
  - `mage`: marksman/blond rifle
  - `rogue`: striker/white-haired handgun
  - `necromancer`: scavenger
- Added a small character stage, class-colored glow, selected-card scale, and
  bottom highlight so the cards read as character choices rather than icon
  buttons.

### Code touched
- `src/components/MainMenu.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Menu sprites currently use each class's `*-walk-0.png` standing frame.

## 2026-06-08 - v0.25.10 - Correct marksman and striker sprite assignment (Codex)

### Summary
Corrected the marksman/striker sprite assets after the previous assignment mixup.
- Replaced `player-magnum-walk-*` with the supplied blond marksman/rifle frames.
- Replaced `player-striker-walk-*` with the supplied white-haired striker/handgun
  frames.
- Class-to-texture code did not need a mapping change:
  - `mage` already reads `player-magnum-walk-*`
  - `rogue` already reads `player-striker-walk-*`

### Code touched
- `public/sprites/player-magnum-walk-0.png`
- `public/sprites/player-magnum-walk-1.png`
- `public/sprites/player-striker-walk-0.png`
- `public/sprites/player-striker-walk-1.png`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Current class sprite mapping remains:
  - `warrior`: shotgun/heavy-gunner female
  - `mage`: marksman/blond rifle
  - `rogue`: striker/white-haired handgun
  - `necromancer`: scavenger

## 2026-06-08 - v0.25.9 - Add scavenger player sprite (Codex)

### Summary
Added the dedicated scavenger player sprite.
- Extracted two transparent `player-scavenger-walk-*` PNGs from the supplied
  purple-matte source image.
- `necromancer` now uses the scavenger sprite instead of temporarily using the
  striker sprite.
- All four starting classes now have distinct player sprite mappings.

### Code touched
- `public/sprites/player-scavenger-walk-0.png`
- `public/sprites/player-scavenger-walk-1.png`
- `src/pixi/pixiTextures.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Current class sprite mapping:
  - `warrior`: shotgun/heavy-gunner female
  - `mage`: magnum/sniper
  - `rogue`: striker
  - `necromancer`: scavenger

## 2026-06-08 - v0.25.8 - Replace striker and add shotgun player sprite (Codex)

### Summary
Updated the starting-class player sprites.
- Replaced the striker walk frames with the supplied blond shotgun/rifle character.
- Added a new two-frame shotgun/heavy-gunner walk sheet from the supplied female
  shotgun character.
- `warrior` now uses the shotgun/heavy-gunner female sprite.
- `rogue` uses the updated striker sprite.
- `necromancer` still temporarily uses the striker sprite until scavenger art is
  supplied.
- `mage` continues to use the magnum/sniper sprite.

### Code touched
- `public/sprites/player-striker-walk-0.png`
- `public/sprites/player-striker-walk-1.png`
- `public/sprites/player-shotgun-walk-0.png`
- `public/sprites/player-shotgun-walk-1.png`
- `src/pixi/pixiTextures.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Current class sprite mapping:
  - `warrior`: shotgun/heavy-gunner female
  - `mage`: magnum/sniper
  - `rogue`: striker
  - `necromancer`: striker temporarily
- Replace the temporary `necromancer` mapping when scavenger art is ready.

## 2026-06-08 - v0.25.7 - Reduce class walk sheets to two frames (Codex)

### Summary
Replaced the class walk sheets with the supplied two-frame versions.
- Re-extracted the striker walk sheet from the new two-pose source image.
- Re-extracted the magnum/sniper walk sheet from the new two-pose source image.
- Removed the unused `*-walk-2.png` and `*-walk-3.png` files for both class
  sprite sets.
- Pixi now loads two frames per class sprite set and alternates them during
  movement.
- Current class sprite mapping is unchanged:
  - `mage`: magnum/sniper
  - `rogue`: striker
  - `warrior`: striker temporarily
  - `necromancer`: striker temporarily

### Code touched
- `public/sprites/player-magnum-walk-0.png`
- `public/sprites/player-magnum-walk-1.png`
- `public/sprites/player-magnum-walk-2.png` deleted
- `public/sprites/player-magnum-walk-3.png` deleted
- `public/sprites/player-striker-walk-0.png`
- `public/sprites/player-striker-walk-1.png`
- `public/sprites/player-striker-walk-2.png` deleted
- `public/sprites/player-striker-walk-3.png` deleted
- `src/pixi/pixiTextures.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- `PLAYER_WALK_FRAME_COUNT` is now 2. If future class art returns to 4 poses,
  update the loader and frame count together.

## 2026-06-08 - v0.25.6 - Add striker player walk frames (Codex)

### Summary
Added the striker player walk sheet and assigned it to the remaining starting
classes for now.
- Extracted four transparent `player-striker-walk-*` PNGs from the supplied
  purple-matte walk sheet using the dot-sprite extraction workflow.
- `rogue` now uses the striker walk frames.
- `warrior` and `necromancer` also temporarily use the striker frames until
  their dedicated heavy-gunner/scavenger art is supplied.
- `mage` continues to use the magnum/sniper walk frames from v0.25.5.
- Player class sprites use height-based scaling to preserve body size even when
  gun barrels extend past the hitbox width.

### Code touched
- `public/sprites/player-striker-walk-0.png`
- `public/sprites/player-striker-walk-1.png`
- `public/sprites/player-striker-walk-2.png`
- `public/sprites/player-striker-walk-3.png`
- `src/pixi/pixiTextures.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Current class sprite mapping:
  - `mage`: magnum/sniper
  - `rogue`: striker
  - `warrior`: striker temporarily
  - `necromancer`: striker temporarily
- Replace the temporary `warrior` / `necromancer` mapping when heavy-gunner and
  scavenger walk sheets are ready.

## 2026-06-08 - v0.25.5 - Add magnum-start player walk frames (Codex)

### Summary
Added a dedicated animated player sprite for the magnum/sniper starting class.
- Extracted four transparent `player-magnum-walk-*` PNGs from the supplied
  purple-matte walk sheet using the dot-sprite extraction workflow.
- The normal `player.png` remains unchanged.
- Pixi now preloads all four magnum walk frames and uses them only when the
  starting class is `mage` (the marksman/magnum loadout).
- The magnum sprite scales by height so the long rifle barrel does not shrink
  the character body; other player sprites keep the existing contain scaling.
- Removed the previous squash/sway/rotation walk fake for the magnum sprite;
  only a tiny vertical bob remains under the real frame animation.

### Code touched
- `public/sprites/player-magnum-walk-0.png`
- `public/sprites/player-magnum-walk-1.png`
- `public/sprites/player-magnum-walk-2.png`
- `public/sprites/player-magnum-walk-3.png`
- `src/pixi/pixiTextures.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Tune `PLAYER_WALK_CYCLE_MS` if the walk tempo feels too fast or slow.
- If any tiny purple matte specks are visible in-game, rerun the extraction pass
  with a slightly wider purple threshold instead of adding runtime filters.
- Current trigger is `player.characterClass === 'mage'`, matching the existing
  marksman/magnum starting profile.

## 2026-06-08 - v0.25.4 - Add player walk motion (Codex)

### Summary
Added a lightweight walk motion to the player sprite.
- Player sprite now bobs, sways, rotates slightly, and subtly squash-stretches
  while moving.
- The effect is visual-only: gameplay position, speed, hitbox, and foot z-sort
  are unchanged.
- The sprite returns to neutral scale/rotation when idle.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Tune `PLAYER_WALK_CYCLE_MS`, `PLAYER_WALK_BOB_PX`, `PLAYER_WALK_SWAY_PX`, and
  `PLAYER_WALK_ROTATION` in `src/pixi/pixiScene.ts` if the gait feels too subtle
  or too wobbly.

## 2026-06-08 - v0.25.3 - Buff level upgrades and tighten shotgun cone (Codex)

### Summary
Adjusted level-up values and fixed shotgun grouping.
- Max HP passive now grants +30 max HP and fully heals, instead of +10.
- Might passive now multiplies gun/melee damage by 1.2, instead of 1.06.
- Upgrade descriptions now match the new values.
- Shotgun spread now treats `0.34rad` as the total cone width across all pellets,
  not the per-pellet step, so higher-tier shotguns no longer fan out too widely.

### Code touched
- `src/store/gameStore.ts`
- `src/utils/upgradeUtils.ts`
- `src/utils/weaponUtils.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Tune `SHOTGUN_SPREAD_CONE_RAD` in `src/utils/weaponUtils.ts` if shotgun
  grouping still needs another pass.

## 2026-06-07 - v0.25.2 - Raise crit upgrade to 3 percent (Codex)

### Summary
Adjusted the level-up crit bonus amount.
- Crit Chance passive now grants +3% per pickup instead of +2.5%.
- The +30% player bonus cap remains unchanged.
- Upgrade menu copy now reflects the 3% value.

### Code touched
- `src/store/gameStore.ts`
- `src/utils/upgradeUtils.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- With the +30% cap, the crit passive reaches cap after 10 pickups.

## 2026-06-07 - v0.25.1 - Count counters and multi-finish combos (Codex)

### Summary
Expanded combo counting and simplified combo UI.
- Simultaneous melee finishers now add one combo count per finished enemy.
- Boss melee finisher-grade hits still add one combo count.
- Successful counters/reflections add one combo count when a projectile is
  actually reflected.
- Combo HUD moved to the left, removed the pill frame, and now uses smaller
  outlined text.

### Code touched
- `src/store/gameStore.ts`
- `src/hooks/useGameLoop.ts`
- `src/components/GameHUD.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The shared combo helper is `addMeleeFinishCombo()` in `src/store/gameStore.ts`.
  The name is historical; it now also covers successful counters.

## 2026-06-07 - v0.25.0 - Add weapon base crit rates (Codex)

### Summary
Moved gun critical chance to weapon-based rates with level-up bonus on top.
- Guns now receive base crit by family: shotgun 5%, handgun 10%, rifle/magnum
  20%.
- Weapon tier adds +3% crit per tier above tier 1.
- Shotgun pellets roll crit independently per pellet using the weapon base rate
  plus player bonus.
- Level-up crit bonus is now capped at +30% and starts at 0%, instead of being
  the whole gun crit chance.
- Melee weapons keep their fixed weapon crit rates.

### Code touched
- `src/utils/weaponUtils.ts`
- `src/types/game.ts`
- `src/store/gameStore.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Current gun crit totals before level-up bonus: shotgun 5/8/11%, handgun
  10/13/16%, rifle 20/23/26%.
- Tune `BASE_CRIT_BY_CATEGORY` or `TIER_CRIT_STEP` in `src/utils/weaponUtils.ts`
  if balance needs another pass.

## 2026-06-07 - v0.24.99 - Add melee finisher combo timer (Codex)

### Summary
Added melee finisher combo tracking and tightened boss finisher reaction.
- Bosses no longer advance while the melee finisher lift reaction is active.
- Any melee finisher-grade hit starts a 5-second combo window, including boss
  stunned-finisher damage.
- The HUD begins showing combo count from 2 combo onward if another finisher
  lands inside the 5-second window.

### Code touched
- `src/store/gameStore.ts`
- `src/components/GameHUD.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Combo timing uses `gameTime`, so pause/upgrade menus do not drain the window.
- The first finisher only arms the timer; display starts at 2 combo by design.

## 2026-06-07 - v0.24.98 - Tighten shotgun spread and stack pellet knockback (Codex)

### Summary
Improved shotgun feel and pellet impact.
- Tightened shotgun pellet spacing from `0.5rad` to `0.34rad` for better
  grouping.
- Projectile collision handling now counts how many bullets hit the same enemy
  in the same frame.
- Bullet knockback receives that hit count as a multiplier, capped at 3x, so
  stacked pellets shove enemies farther without launching them infinitely.

### Code touched
- `src/utils/weaponUtils.ts`
- `src/hooks/useGameLoop.ts`
- `src/store/gameStore.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Tune `SHOTGUN_SPREAD_STEP_RAD` in `src/utils/weaponUtils.ts` if grouping needs
  another pass.
- Knockback strength is still bounded in `knockbackEnemy()` with a hard 3x cap.

## 2026-06-07 - v0.24.97 - Add boss finisher lift reaction (Codex)

### Summary
Added a visual lift reaction when a stunned boss takes melee finisher-grade
damage.
- Bosses that survive a stunned melee finisher hit now get a short visual-only
  lift window (`liftUntil`).
- Pixi offsets only the enemy sprite upward with a subtle shake, leaving foot
  position, z-sort, collision, and gameplay movement unchanged.
- Normal enemies and boss deaths are unchanged.

### Code touched
- `src/types/game.ts`
- `src/store/gameStore.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Tune `BOSS_FINISH_LIFT_MS` and `BOSS_FINISH_LIFT_PX` in
  `src/pixi/pixiScene.ts` if the reaction should be heavier or subtler.

## 2026-06-07 - v0.24.96 - Add one-time insect egg ambush (Codex)

### Summary
Added a mid-run insect egg ambush event.
- At 2:30 game time, the run stores a one-time ambush anchor at the player's
  current position.
- The event places 52 eggs in a noisy 3-row elliptical ring outside the current
  screen area, creating a breakable encirclement.
- Eggs reuse existing mine/egg behavior: 1 HP, acid contact damage, liquid burst
  effects, and destroyed eggs stay gone through `destroyedBreakableProps`.

### Code touched
- `src/world/mines.ts`
- `src/store/gameStore.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Tune `MINE_AMBUSH_TIME_MS` in `src/store/gameStore.ts` if the event should
  happen earlier/later.
- Tune `count`, `rx`, and `ry` in `mineAmbushAround()` if the ring feels too
  dense or too far outside the screen.

## 2026-06-07 - v0.24.95 - Add paired insect egg drawing (Codex)

### Summary
Updated insect egg visuals so each trap unit reads as a paired egg set.
- Added a smaller side egg next to the main egg using the same muted moss/olive
  palette.
- Kept collision, spawning, and damage behavior unchanged; this is a visual-only
  adjustment.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The small egg is drawn before the main egg so the pair stays compact and does
  not increase the gameplay footprint.

## 2026-06-07 - v0.24.94 - Mute egg colors and stagger rows (Codex)

### Summary
Adjusted insect eggs so they blend into the ground and form less mechanical
patches.
- Muted egg colors from vivid yellow-green to darker moss/olive tones with much
  softer highlights.
- Forward pressure egg patches now lay out in deterministic 2-3 staggered rows
  instead of a mostly single line.
- Preserved the 5-10 egg random count and occasional pass-through gap behavior.

### Code touched
- `src/pixi/pixiScene.ts`
- `src/world/mines.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Color choices intentionally avoid saturated green so future gray/brown floor
  variants should not make eggs look like UI markers.

## 2026-06-07 - v0.24.93 - Randomize egg patch count (Codex)

### Summary
Changed insect egg patch size from fixed 7 eggs to deterministic random counts.
- World egg patches now roll 5-10 eggs per patch.
- Forward pressure egg patches also roll 5-10 eggs per patch.
- Optional gap behavior is suppressed for smaller patches so the visible count
  does not drop too low.

### Code touched
- `src/world/mines.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Counts are deterministic from the existing hash seeds, so patches remain
  stable instead of flickering frame-to-frame.

## 2026-06-07 - v0.24.92 - Scatter egg patches farther ahead (Codex)

### Summary
Adjusted pressure egg placement so it feels less like a clean line and appears
farther off-screen.
- Moved pressure patch centers farther ahead of the player's movement direction
  (`310-430px` instead of `210-290px`).
- Increased perpendicular and forward jitter so eggs form an organic clump/loose
  barrier instead of a neatly spaced row.
- Kept the 7-egg target count and occasional gap behavior.

### Code touched
- `src/world/mines.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If eggs now feel too far away on narrow phones, tune `ahead` in
  `pressureMinesNearPlayer()` down slightly while keeping the new jitter values.

## 2026-06-07 - v0.24.91 - Make egg bursts read as liquid (Codex)

### Summary
Changed insect egg contact/break effects away from light explosions and toward
green liquid spray.
- Added a non-additive `liquid` particle rendering path: no glow halo and no
  white hot core, so droplets read as fluid instead of sparks.
- Egg contact now emits upward-biased green droplets instead of a ring/glow
  blast.
- Projectile breakage also uses the same liquid splash helper at lower
  intensity.

### Code touched
- `src/types/game.ts`
- `src/pixi/pixiScene.ts`
- `src/hooks/useGameLoop.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Melee breaking eggs still uses the store-side burst path; if it also reads too
  spark-like on device, move the shared liquid helper into the store or a small
  effect utility.

## 2026-06-07 - v0.24.90 - Convert mines to insect eggs (Codex)

### Summary
Converted the mine/caltrop trap concept into insect eggs and increased patch
size.
- World and pressure patches now use 7 eggs instead of 4-6 mines.
- The trap remains mechanically identical: passable, one-hit breakable, no loot,
  and damaging when touched.
- Contact and break effects now use green acid/liquid bursts, rings, and glows
  instead of orange/red explosions.
- Pixi procedural drawing now renders a small green egg sac with a pulsing core
  instead of dark metal spikes.

### Code touched
- `src/world/mines.ts`
- `src/hooks/useGameLoop.ts`
- `src/store/gameStore.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Internal type names still use `mine` to keep this change small and avoid a
  broad rename; gameplay/readable comments now treat them as insect eggs.
- If the 7-egg line feels too dense, retune `spacing` and optional gap behavior
  in `pressureMinesNearPlayer()`.

## 2026-06-07 - v0.24.89 - Add forward pressure mine patches (Codex)

### Summary
Adjusted mines so they actually appear and sometimes block the player's advance.
- Added a pressure-mine generator that places a small mine line ahead of the
  player's recent movement direction.
- Pressure patches spawn only on some 18-second time segments, so the pattern
  creates occasional route pressure without becoming constant.
- Patches contain roughly 4-6 mines, with occasional gaps so the player can
  sometimes thread through instead of always shooting.
- Existing deterministic world mines remain in place as background traps.
- Destroyed pressure mines use the existing `destroyedBreakableProps` tracking,
  so they do not immediately respawn within the same segment.

### Code touched
- `src/world/mines.ts`
- `src/store/gameStore.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Tuning points for pressure mines are in `pressureMinesNearPlayer()`:
  the `18000` segment length, `0.58` spawn threshold, `ahead` distance,
  `count`, and `spacing`.

## 2026-06-07 - v0.24.88 - Keep supply arrows below top HUD (Codex)

### Summary
Adjusted off-screen supply arrow clamping so upward arrows no longer hide under
the iOS status bar or top HUD.
- Pixi arrow anchors now use a responsive top safe line of roughly 154px / 17%
  of screen height, capped for short screens.
- Canvas fallback arrows use the same top safe line for consistency.
- Bottom and side arrow margins remain unchanged.

### Code touched
- `src/pixi/pixiScene.ts`
- `src/utils/renderUtils.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If the top HUD height changes, retune the `154` / `0.17` values in the arrow
  margin calculation in both renderers.

## 2026-06-07 - v0.24.87 - Add clustered breakable mines (Codex)

### Summary
Added low-frequency clustered mine/caltrop traps as a separate field-pressure
object from enemies.
- Mines spawn in deterministic clusters of roughly 4-6 pieces, at a lower
  frequency than torches, so they occasionally block a route without becoming
  constant friction.
- Mines are passable traps: the player can walk over them, but stepping on one
  detonates it for damage and destroys it.
- Mines have 1 HP, so bullets or melee can disarm them in one hit.
- Destroyed mines drop no items, unlike torches.
- Enemies and player movement are no longer blocked by mines; torches remain
  solid environmental props.
- Pixi renders mines procedurally as small dark metal spikes with a faint red
  warning dot, keeping the asset load light.

### Code touched
- `src/world/mines.ts`
- `src/types/game.ts`
- `src/store/gameStore.ts`
- `src/hooks/useGameLoop.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Tuning points: `MINE_CELL` and the `0.09` spawn threshold in
  `src/world/mines.ts`, and `MINE_DAMAGE` in `src/store/gameStore.ts`.
- Current mine damage is 34 and uses the existing player invulnerability window,
  so stepping into a cluster cannot stack every mine instantly.

## 2026-06-07 - v0.24.86 - Tighten enemy recycling and supply arrows (Codex)

### Summary
Adjusted enemy pressure and pickup guidance after the first recycling pass.
- Enemy recycling now triggers much closer to the viewport, so the player cannot
  kite far away from the horde as easily.
- Continuous spawns and recycled enemies now occasionally bias toward the
  player's movement direction, creating mild path-blocking pressure without
  making every spawn predictable.
- Ammo, weapon crates, weapon drops, and meat/health pickups now opt into the
  off-screen arrow system when dropped by enemies or breakable torches.
- Arrow colors now cover meat/health and weapon supplies in Pixi and the canvas
  fallback renderer.
- To prevent uncollected XP gems from growing without bound, the game trims only
  far XP gems after the pickup count exceeds a guardrail; important supplies are
  kept.

### Code touched
- `src/hooks/useGameLoop.ts`
- `src/utils/enemyUtils.ts`
- `src/store/gameStore.ts`
- `src/pixi/pixiScene.ts`
- `src/utils/renderUtils.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- VS-style behavior: XP gems can remain for collection/magnet feel, but this
  implementation trims distant XP when item count is high for mobile perf.
- Tuning points: `ENEMY_RECYCLE_DISTANCE_MULT`, `PICKUP_HARD_CAP`, and
  `XP_PICKUP_KEEP_COUNT` in `src/hooks/useGameLoop.ts`; spawn direction bias is
  inside `generateEnemy()` in `src/utils/enemyUtils.ts`.

## 2026-06-07 - v0.24.85 - Recycle distant enemies near viewport (Codex)

### Summary
Added VS-style enemy recycling for enemies that drift too far from the player.
- Continuous spawn now respects the live enemy cap before adding new enemies,
  avoiding spawn-then-cull churn.
- Distant regular enemies are refreshed into the current spawn pool and moved
  back just outside the active viewport while reusing their renderer id.
- Boss-class enemies and the reaper keep HP/type/state and only warp position
  when they get far away, matching the expected Vampire Survivors-style boss
  pressure.
- Scripted-wave enemies still get their 10-second grace period before they are
  eligible for recycling or density cleanup.
- The hard cap remains in place after wave events so enemy-heavy scenes do not
  grow without bound.

### Code touched
- `src/hooks/useGameLoop.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The next performance hotspot is still likely `updateEnemies`, especially the
  per-enemy collision checks against trees/torches when enemy count is high.
- On-device tuning point: `ENEMY_RECYCLE_DISTANCE_MULT` in `useGameLoop.ts`
  controls how far an enemy can drift before being repositioned.

## 2026-06-07 - v0.24.84 - Remove perf screenshots and cull enemy lights (Codex)

### Summary
Removed the automatic perf screenshot path and added a first enemy-count
optimization.
- Removed threshold-triggered PNG downloads from the perf HUD.
- Removed the test-only Pixi screenshot extraction helper and global types.
- Kept the always-visible perf numbers on screen.
- When enemy count reaches `7+`, normal enemies stop drawing their constant
  subtle self-light; boss lights and hit-pulse lights remain active.

### Code touched
- `src/components/GameHUD.tsx`
- `src/pixi/PixiStage.tsx`
- `src/pixi/pixiScene.ts`
- `src/vite-env.d.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The next likely enemy-heavy hotspot is simulation-side enemy movement and
  collision, especially per-enemy tree/torch resolution during crowded frames.
- If FPS still drops mainly with enemies, consider profiling/refactoring
  `useGameLoop` subscriptions and `updateEnemies`.

## 2026-06-07 - v0.24.83 - Burn perf metrics into captures and harden touch recovery (Codex)

### Summary
Improved perf capture readability and mobile joystick recovery.
- Perf warning screenshots now draw the current debug metrics directly onto the
  extracted PNG, so the saved preview includes `FPS`, `fx`, `p`, `item`,
  `enemy`, and warning reasons.
- `GameHUD` publishes the current perf lines to `window.__zombiePerfDebug` for
  the Pixi capture helper.
- `VirtualJoystick` now recovers from stale pointer state by clearing any
  previous pointer on a new touch, listening for global `pointerup` /
  `pointercancel`, and clearing on `blur`, `pagehide`, or lost pointer capture.
- This targets the mobile case where low-FPS/enemy-heavy moments can delay or
  drop pointer-end events after a melee release, leaving movement unresponsive.

### Code touched
- `src/components/GameHUD.tsx`
- `src/components/VirtualJoystick.tsx`
- `src/pixi/PixiStage.tsx`
- `src/vite-env.d.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The one-finger control model still fires melee/counter on normal pointer-up.
- Recovery paths such as `pointercancel`, `blur`, and stale-pointer replacement
  clear movement without firing another melee action.

## 2026-06-07 - v0.24.82 - Use Pixi extraction for perf screenshots (Codex)

### Summary
Changed warning screenshot capture away from direct WebGL canvas reads.
- `PixiStage` now exposes a test-only `window.__zombieCapturePng()` helper that
  uses `app.renderer.extract.download({ target: app.stage })`.
- `GameHUD` uses the Pixi extraction helper first, falling back to canvas
  `toBlob` only when the helper is unavailable.
- Removed `preserveDrawingBuffer` from Pixi init because Pixi extraction should
  avoid the black-backbuffer issue without adding that ongoing render cost.

### Code touched
- `src/pixi/PixiStage.tsx`
- `src/components/GameHUD.tsx`
- `src/vite-env.d.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The downloaded perf screenshot captures the Pixi stage, not the native iOS
  browser download popup and not the React HUD overlay.
- iOS Safari may still ask before downloading, but the saved PNG should be less
  prone to the mostly-black WebGL backbuffer read bug.

## 2026-06-07 - v0.24.81 - Keep perf HUD above darkness and stabilize captures (Codex)

### Summary
Improved the test performance overlay and warning screenshots.
- Moved the performance counter block to a fixed high-z overlay with a dark
  opaque backing, so it stays readable above in-game darkness/flash effects.
- Enabled Pixi `preserveDrawingBuffer` during this test phase so WebGL canvas
  PNG captures are less likely to be blank/black.
- Delayed warning captures by `320ms` after threshold detection to avoid
  catching the darkest instant of a flash/fade.

### Code touched
- `src/components/GameHUD.tsx`
- `src/pixi/PixiStage.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- `preserveDrawingBuffer` can slightly hurt rendering performance; keep it only
  while screenshot-based perf testing is useful.
- Browser auto-download limitations still apply on iOS Safari.

## 2026-06-07 - v0.24.80 - Add perf debug counters and warning capture (Codex)

### Summary
Expanded the always-visible test performance HUD.
- The in-game debug pill now shows `FPS`, active effect count, projectile count,
  pickup count, and enemy count.
- The pill turns red and lists warning reasons when counts cross conservative
  test thresholds.
- On threshold exceed, the game attempts to save a canvas PNG named
  `zombie-perf-...png`, with a 15-second cooldown to avoid download spam.

### Code touched
- `src/components/GameHUD.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Threshold constants live in `GameHUD`: `PERF_THRESHOLDS`.
- Browser auto-download behavior is platform-dependent. Desktop browsers should
  generally save the PNG; iOS Safari may block or ask for user action.
- The screenshot captures the game canvas, not necessarily the overlaid React
  HUD, depending on browser/WebGL capture behavior.

## 2026-06-07 - v0.24.79 - Show in-game FPS during testing (Codex)

### Summary
Made the existing FPS counter visible during gameplay testing.
- The game loop already measured FPS once per second; the HUD now displays it
  as a small `FPS xx` pill below the right-side audio button.
- Kept the indicator lightweight and read-only so it does not affect gameplay
  simulation or rendering logic.

### Code touched
- `src/components/GameHUD.tsx`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- This is intentionally always visible for the current test phase.
- If it becomes distracting later, hide or gate the block in `GameHUD`.

## 2026-06-07 - v0.24.78 - Full BGM default and duplicate weapon ammo (Codex)

### Summary
Adjusted audio defaults, duplicate weapon pickups, and reload HUD placement.
- Changed the default BGM volume for new/unset settings from `55%` to `100%`.
- Existing saved `zombie:bgmVolume` values are still respected; the new default
  applies when no saved BGM volume exists yet.
- Picking up a gun category already owned at the same or lower tier now converts
  to ammo worth `AMMO_PICKUP * 2` instead of being discarded.
- Higher-tier gun pickups still upgrade the weapon as before.
- Reload progress is now positioned from the rendered player head height, so the
  meter sits above the character art instead of overlapping the face.

### Code touched
- `src/audio/audioManager.ts`
- `src/store/gameStore.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Duplicate gun ammo conversion lives in `grantWeapon`.
- Melee weapon replacement behavior was left unchanged.
- Reload meter placement uses `playerFootBox` plus `depthScale` to match the
  HD-2D visual size.

## 2026-06-07 - v0.24.77 - Add grenade blast damage (Codex)

### Summary
Buffed the grenade launcher and gave it real splash damage.
- Raised `rifle-t3` / グレネードランチャー base damage from `75` to `95`.
- Projectiles now carry their source `weaponKey`, so the loop can distinguish
  grenade shots from other rifle-family bullets.
- Grenade launcher shots now explode on first enemy hit and are removed instead
  of acting like piercing sniper rounds.
- The blast deals falloff splash damage in a `92px` radius, spawns blast VFX,
  blood bursts, damage numbers, and XP gems for enemies killed by splash.

### Code touched
- `src/types/game.ts`
- `src/utils/weaponUtils.ts`
- `src/hooks/useGameLoop.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Tuning constants live in `src/hooks/useGameLoop.ts`:
  `GRENADE_BLAST_RADIUS`, `GRENADE_BLAST_DAMAGE_MULT`.
- Source weapon detection uses `Projectile.weaponKey === 'rifle-t3'`.

## 2026-06-07 - v0.24.76 - Add opening settings and melee damage numbers (Codex)

### Summary
Added opening-screen settings and fixed missing melee damage numbers.
- Normal melee hits now spawn damage numbers, not only critical melee hits.
- Critical melee and stunned-boss melee damage still use the gold/crit number
  style.
- Added a settings button to the opening menu.
- Moved the ammo drop percentage into the settings panel.
- Added persistent BGM and SE volume sliders.
- Raised the default BGM volume from `0.30` to `0.55`.
- BGM volume is applied through the existing WebAudio gain path for iOS-safe
  control; SE volume scales all SFX while preserving per-sound balance.

### Code touched
- `src/audio/audioManager.ts`
- `src/components/MainMenu.tsx`
- `src/store/gameStore.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Volume storage keys: `zombie:bgmVolume`, `zombie:sfxVolume`.
- Mute remains separate via `zombie:audioMuted`.
- If the settings panel feels crowded on small screens, keep it collapsible and
  adjust spacing rather than returning all controls to the main menu surface.

## 2026-06-07 - v0.24.75 - Add bullet-hit blood and chest crate art (Codex)

### Summary
Added small bullet-hit blood feedback and swapped weapon crates to existing
treasure chest art.
- Bullet/projectile hits on enemies now spawn a small red/dark-red burst before
  kill logic, with crits using a slightly larger count.
- Kill splashes remain larger and separate, so normal hits read as chip blood
  rather than a death splash.
- `weapon-crate` pickups now use the atlas-backed `pickup-chest` sprite instead
  of the old procedural box drawing.

### Code touched
- `src/hooks/useGameLoop.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The weapon crate still behaves as a weapon crate; only its pickup art now maps
  to `pickup-chest`.
- If hit blood feels too busy, lower the two `spawnBurst` counts near projectile
  enemy collision handling.

## 2026-06-07 - v0.24.74 - Slightly raise enemy breathing amplitude (Codex)

### Summary
Made enemy idle breathing a little easier to perceive.
- Increased `ENEMY_BREATH_SCALE_X` from `0.012` to `0.016`.
- Increased `ENEMY_BREATH_SCALE_Y` from `0.018` to `0.024`.
- Kept timing, phase offsets, foot anchoring, and gameplay/collision behavior
  unchanged.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If the motion becomes too rubbery, reduce these constants before changing the
  animation method.

## 2026-06-07 - v0.24.73 - Apply breathing to all enemies (Codex)

### Summary
Updated enemy idle breathing after confirming all current enemies are humanoid
zombies in the active art direction.
- Removed the old `bat` exclusion from enemy breathing.
- All enemy sprites now receive the same renderer-only breathing pulse, while
  heavy enemy types still use reduced amplitude.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Type names such as `bat` may remain in data/code for legacy behavior, but
  current art direction treats enemies as humanoid zombie variants for idle
  sprite breathing.

## 2026-06-07 - v0.24.72 - Add subtle enemy breathing (Codex)

### Summary
Added a lightweight idle breathing motion to enemy sprites.
- Enemies now get a tiny foot-anchored X/Y scale pulse, giving them a subtle
  living/undead breathing feel without moving hitboxes or gameplay state.
- Each enemy gets a stable phase offset from its id so groups do not pulse in
  perfect sync.
- Heavy enemies use a reduced amplitude.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Tuning constants: `ENEMY_BREATH_SCALE_X`, `ENEMY_BREATH_SCALE_Y`,
  `ENEMY_BREATH_MS`.
- This is renderer-only and does not affect collision or AI movement.

## 2026-06-07 - v0.24.71 - Fade pickups into horizon zone (Codex)

### Summary
Fixed pickup objects overlapping the far background in the upper transparent
zone.
- Applied `horizonActorAlpha` to the whole pickup container, not only selected
  ground reflections.
- This covers weapon crates, ammo boxes, gems, meat/health, magnet, bomb, and
  other pickup sprites/procedural drawings consistently.
- Pickups now hide completely at alpha zero and z-sort by their foot Y.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If another object overlaps the far backdrop, check whether its container also
  uses `horizonActorAlpha(footY)`.

## 2026-06-07 - v0.24.70 - Stabilize player screen-pixel snap (Codex)

### Summary
Reduced player-only jitter during movement.
- Added a screen-pixel snap helper that accounts for the current world/camera
  offset.
- Changed only the player sprite placement to snap after camera offset, rather
  than rounding raw world coordinates. This avoids a 1px tug-of-war between the
  player sprite and the camera's fractional movement.
- Left enemies, pickups, ground, DOF, and depth scaling untouched.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If jitter remains visible, next check camera follow smoothing / camera
  fractional values before changing sprite textures or DOF.

## 2026-06-07 - v0.24.69 - Soften gem glow and reduce shimmer (Codex)

### Summary
Softened the previous glow pass after playtest feedback.
- Reduced gem body glow intensity and widened the outer color halo so gems read
  as a faint self-emission instead of an obvious painted glow disc.
- Shrank the gem white core to keep the sprite from becoming a flat white orb.
- Rounded gem glow and strong-event lighting coordinates to reduce subpixel
  shimmer while moving.
- Kept long event shadows, but lowered the local darkening/stroke strength so
  strong-light events contrast without making the scene look jagged.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If gems still feel too artificial, lower `GEM_BODY_GLOW_ALPHA` further before
  changing the pickup sprite asset.
- If motion still looks rough, inspect the perspective ground strip rendering
  next; this change only addresses the new Graphics-based glow/shadow shimmer.

## 2026-06-07 - v0.24.68 - Make gems self-glow and deepen event contrast (Codex)

### Summary
Adjusted the glow direction after playtest feedback.
- Removed experience gems from the damp-ground reflection pass so their light no
  longer reads as a cheap floor ellipse.
- Strengthened the gem's own additive body glow with a wider colored halo and a
  smaller white core.
- Increased strong-event local contrast: wider dark falloff around bright glow
  events and longer cast shadows from nearby actors.
- Kept the heavier contrast event-only (`glow.radius >= STRONG_GLOW_RADIUS`) so
  ordinary movement and pickups do not permanently darken the field.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Gem self-glow strength is `GEM_BODY_GLOW_ALPHA`.
- Strong-event contrast is controlled by `LOCAL_EVENT_SHADE_ALPHA`,
  `LOCAL_EVENT_SHADOW_ALPHA`, and the reach/length literals in
  `syncLocalEventLighting`.

## 2026-06-07 - v0.24.67 - Strengthen local glow contrast (Codex)

### Summary
Improved the cheap-looking damp-ground light around gems and strong glow events.
- Added a dedicated additive pickup-glow layer so experience gems get a colored
  multi-layer body glow instead of reading as flat white orbs.
- Added local-only contrast shading and short cast shadows for strong `glow`
  effects (`radius >= 44`), so finishers, torch breaks, level-up flashes, and
  other big events deepen nearby ground without darkening the whole scene.
- Upgraded strong glow rendering with wider bloom layers, a hot core, and subtle
  red/cyan fringe for event-only impact.
- Added a strong local glow to successful counters so the same local event-light
  treatment applies there too.

### Code touched
- `src/pixi/pixiScene.ts`
- `src/hooks/useGameLoop.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The event-only threshold is `STRONG_GLOW_RADIUS`.
- Gem body glow strength is `GEM_BODY_GLOW_ALPHA`.
- Local darkening is intentionally ground-only and temporary; do not replace it
  with a global darkness/DOF change unless the art direction changes.

## 2026-06-07 - v0.24.66 - Make damp ground reflections visible (Codex)

### Summary
Raised the subtle reflection pass to a visible level after playtest feedback.
- Increased global reflection alpha from `0.12` to `0.28`.
- Widened pickup, projectile, and glow reflection ellipses.
- Strengthened torch foot reflection alpha and size.
- Kept the same cheap rendering strategy: one shared `Graphics` for generic
  glow reflections plus one simple Sprite per torch reflection.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If the reflection now reads too watery, lower `GROUND_REFLECTION_ALPHA` first
  before changing the drawing approach.

## 2026-06-07 - v0.24.65 - Reflect glowing effects on damp ground (Codex)

### Summary
Extended the lightweight wet-ground reflection pass beyond torches.
- Added one shared additive `Graphics` layer for ground reflections.
- Gems, magnet, bomb, weapon pickups, active projectiles, and `glow` effects
  now paint subtle flattened light onto the damp forest floor.
- Kept the implementation cheap: no reflected sprites, no render textures, no
  full-scene postprocess. Reflections are just small additive ellipses.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Global strength is `GROUND_REFLECTION_ALPHA`.
- This intentionally reflects only light-like objects/effects, not character
  bodies, to preserve performance and avoid a water-surface look.

## 2026-06-07 - v0.24.64 - Add lightweight torch ground reflection (Codex)

### Summary
Added the first lightweight reflection pass.
- Each torch now gets a thin warm additive ground reflection under its foot.
- The effect reuses the existing glow texture as a horizontally stretched
  Sprite, so it avoids expensive reflected-scene rendering.
- Reflection pulse follows the torch flame pulse and respects horizon fade.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Tune only `TORCH_REFLECTION_W`, `TORCH_REFLECTION_H`, and reflection alpha in
  `drawBreakableProp` if the wet-ground glint is too strong or too weak.

## 2026-06-07 - v0.24.63 - Clean torch purple fringe and improve flame (Codex)

### Summary
Refined the new torch prop visuals.
- Removed remaining opaque purple fringe pixels from `public/sprites/torch.png`.
- Also normalized fully transparent pixels to black RGB to prevent purple
  color bleed during texture sampling.
- Reworked the torch fire from small round glows into a taller rising flame
  with a warm orange body, pale core, and drifting ember particles.

### Code touched
- `public/sprites/torch.png`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- Purple-ish nontransparent pixel check: `0`
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Flame height/embers are purely Pixi-side; the torch sprite remains a clean
  transparent prop body.

## 2026-06-07 - v0.24.62 - Add breakable torch props (Codex)

### Summary
Added torch environmental objects with Octopath-like fire lighting.
- Added deterministic torch placement around the camera via `src/world/torches.ts`.
- Added `BreakableProp` state so torches can be destroyed and stay destroyed
  for the run.
- Torches can be broken by projectiles or melee/counter swings.
- Broken torches roll a small non-gem loot table: mostly ammo, sometimes
  health, magnet, bomb, or a rare weapon drop. They never drop XP gems.
- Added `public/sprites/torch.png` from the supplied purple-background asset
  using the purple-key sprite workflow.
- Pixi renders the torch body as crisp pixel art, then adds warm additive glow,
  soft flame motes, and hit/break sparks in code.

### Code touched
- `src/types/game.ts`
- `src/world/torches.ts`
- `src/store/gameStore.ts`
- `src/hooks/useGameLoop.ts`
- `src/pixi/pixiTextures.ts`
- `src/pixi/pixiScene.ts`
- `public/sprites/torch.png`
- `public/sprites/README.md`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Torch fire is not baked into the sprite. Tune the light in
  `TORCH_LIGHT_RADIUS`, `TORCH_VISUAL_W`, and `TORCH_VISUAL_H` in
  `src/pixi/pixiScene.ts`.
- Drop chance is `BREAKABLE_PROP_DROP_CHANCE = 0.28` in `src/store/gameStore.ts`.
- Torch placement density is controlled in `src/world/torches.ts`.

## 2026-06-07 - v0.24.61 - Set vertical ground scroll feel to 3.0 (Codex)

### Summary
Locked the horizontal ground scroll feel and raised only the vertical feel.
- Kept `GROUND_SCROLL_X_FEEL = 1.2`.
- Changed `GROUND_SCROLL_Y_FEEL` from `2.0` to `3.0`.
- Player speed, camera tracking, collisions, and object positions are unchanged.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Horizontal terrain feel is considered accepted at `1.2`; avoid changing it
  unless explicitly requested.

## 2026-06-07 - v0.24.60 - Tune ground scroll feel X/Y (Codex)

### Summary
Adjusted visual-only ground texture scroll feel on both axes.
- Changed vertical ground scroll feel from `1.8` to `2.0`.
- Added horizontal ground scroll feel at `1.2`.
- Player speed, camera tracking, collisions, and object positions are unchanged.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Terrain texture scroll is now independently tunable via
  `GROUND_SCROLL_X_FEEL` and `GROUND_SCROLL_Y_FEEL`.

## 2026-06-07 - v0.24.59 - Increase vertical ground scroll feel to 1.8 (Codex)

### Summary
Raised the visual-only ground texture vertical scroll feel.
- Changed `GROUND_SCROLL_Y_FEEL` from `1.6` to `1.8`.
- Player speed, camera tracking, collisions, and object positions are unchanged.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Terrain texture Y-scroll is now `1.8`; tune this single constant for further
  movement-feel checks.

## 2026-06-07 - v0.24.58 - Increase vertical ground scroll feel to 1.6 (Codex)

### Summary
Raised the visual-only ground texture vertical scroll feel again.
- Changed `GROUND_SCROLL_Y_FEEL` from `1.4` to `1.6`.
- Player speed, camera tracking, collisions, and object positions are unchanged.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Terrain texture Y-scroll is now intentionally exaggerated for stronger
  movement feel.

## 2026-06-07 - v0.24.57 - Increase vertical ground scroll feel (Codex)

### Summary
Raised the visual-only ground texture vertical scroll feel.
- Changed `GROUND_SCROLL_Y_FEEL` from `1.2` to `1.4`.
- Player speed, camera tracking, collisions, and object positions are unchanged.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- This is a terrain-texture feel tweak only.

## 2026-06-07 - v0.24.56 - Ground scroll feel, HP full heal, crest ring polish (Codex)

### Summary
Adjusted three feel/presentation points without changing player movement speed.
- Increased only the terrain texture's vertical scroll feel to `1.2x`.
- Changed max-HP level-up upgrades to fully heal after increasing max HP.
- Reworked the melee crest into a 360-degree luminous ring with thin linework
  and angle-weighted glow, while keeping the stronger crescent belly.

### Code touched
- `src/pixi/pixiScene.ts`
- `src/store/gameStore.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- `GROUND_SCROLL_Y_FEEL` is visual-only; player speed and camera tracking are
  unchanged.

## 2026-06-07 - v0.24.55 - Replace player with purple-keyed source cutout (Codex)

### Summary
Replaced the player sprite with the user-provided source art instead of the old
32x32 cutout.
- Chroma-keyed the purple background to alpha 0.
- Cropped to the sprite bounds only; no resize, sharpening, outline, or
  redraw/correction pass was applied.
- Left gameplay sizing and Pixi rendering logic unchanged.

### Code touched
- `public/sprites/player.png`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The new `player.png` is intentionally much higher resolution and vertically
  proportioned (`270x487`) than the previous `32x32` asset. If in-game size
  feels off, adjust visual scale separately rather than resampling the source.

## 2026-06-07 - v0.24.54 - Pixel-crisp focused sprites (Codex)

### Summary
Reduced sampling blur on focused pixel sprites without removing HD-2D depth
effects.
- Enabled Pixi renderer `roundPixels` for crisper pixel-art sampling.
- Rounded only player, enemy, and sprite-backed pickup display positions.
- Left gameplay coordinates, hitboxes, Y-sort, depth scale, DOF, bloom, fog, and
  source art unchanged.

### Code touched
- `src/pixi/PixiStage.tsx`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- This is intentionally not a sharpening/outline pass. If center sprites still
  lack detail, inspect source art resolution next rather than adding fake
  correction layers.

## 2026-06-07 - v0.24.53 - Horizon forest parallax direction fix (Codex)

### Summary
Fixed the depth cue where the forest in front of the distant panorama appeared
to move slower than the far background.
- Converted the horizon forest seam from a static `Sprite` to a `TilingSprite`.
- Added `HORIZON_FOREST_PARALLAX_X = 0.16`, faster than the far backdrop's
  `0.09` and slower than the nearest foreground forest's `0.44`.
- Kept the existing horizon position, fade mask, and actor fade behavior.

### Code touched
- `src/pixi/layers.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The parallax order is now far backdrop `0.09` < horizon forest `0.16` <
  front forest `0.44`.

## 2026-06-07 - v0.24.52 - Crisp fireflies and lighter front forest blur (Codex)

### Summary
Adjusted atmosphere layering after the HD-2D perspective pass.
- Reduced the lower foreground forest blur from `2.4` to `1.6`.
- Moved ambient firefly sprites from the filtered world `lightingLayer` to the
  screen-space `uiLayer`, before grade/vignette overlays.
- Kept firefly motion in world coordinates but draw them in screen coordinates,
  so they still drift with the field while staying outside depth-of-field blur.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Fireflies are intentionally outside `filteredWorld` now. Do not move them back
  into `lightingLayer` unless they should be blurred by the field DoF again.

## 2026-06-07 - v0.24.51 - Centralize sprite atlas rects (Codex)

### Summary
Reduced atlas-maintenance risk after the modern sprite swaps.
- Added `src/utils/spriteAtlas.ts` as the single source of truth for atlas
  source rectangles.
- Updated both the Canvas fallback loader and PixiJS texture provider to import
  the shared atlas rectangles.
- Removed the duplicated `ATLAS_RECTS` maps that previously had to be kept in
  sync manually.

### Code touched
- `src/utils/spriteAtlas.ts`
- `src/utils/spriteLoader.ts`
- `src/pixi/pixiTextures.ts`
- `package.json`, `package-lock.json`

### Verification
- `rg "const ATLAS_RECTS|ATLAS_RECTS" src/utils src/pixi` OK
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Future atlas rebuilds should update only `src/utils/spriteAtlas.ts` for
  source rectangles, plus `public/sprites/atlas.png` for the image itself.
- This is a source-organization change only; no intended gameplay or visual
  behavior change.

## 2026-06-07 - v0.24.50 - Smooth vertical perspective scale (Codex)

### Summary
Softened and smoothed vertical scale changes for enemies, trees, and pickups.
- Reduced the player-relative depth scale strength for normal objects and
  enemies.
- Narrowed min/max scale clamps so vertical movement feels less extreme.
- Changed the ground-perspective blend from linear interpolation to logarithmic
  interpolation, making scale transitions feel less jumpy.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Main tuning knobs:
  `DEPTH_K`, `ENEMY_DEPTH_K`, and `OBJECT_GROUND_RELATIVE_WEIGHT`.
- If the effect still feels too strong, lower `OBJECT_GROUND_RELATIVE_WEIGHT`
  first before changing sprite visual sizes.

## 2026-06-07 - v0.24.49 - Rebuild atlas from transparent Drive PNG (Codex)

### Summary
Rebuilt the modern enemy/tree/pickup atlas from the transparent PNG supplied in
AI MEGLIO materials, removing the white-edge artifacts left by the JPEG
white-key extraction.
- Source asset:
  `/Users/tanity/マイドライブ（tanity0@gmail.com）/AI MEGLIO/素材/260601/IMG_5503.PNG`
- Used the source alpha channel directly instead of chroma/white-keying.
- Replaced `public/sprites/atlas.png` with the transparent extraction.
- Updated atlas rectangles in both PixiJS and Canvas fallback loaders.
- Bumped app version so sprite cache query strings refresh.

### Code touched
- `public/sprites/atlas.png`
- `src/pixi/pixiTextures.ts`
- `src/utils/spriteLoader.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The local Drive sync path for AI MEGLIO materials is
  `/Users/tanity/マイドライブ（tanity0@gmail.com）/AI MEGLIO/素材`.
- Prefer transparent PNG sources for future sprite atlas updates; avoid JPEG
  white-keying because pale highlights and antialiasing leave visible fringes.

## 2026-06-07 - v0.24.48 - Match object scale to ground perspective relatively (Codex)

### Summary
Reduced the mismatch where enemies, trees, and pickups moved vertically with the
world but did not change scale as strongly as the perspective ground.
- Reintroduced ground-curve influence as a relative scale ratio, using the
  player's current foot position as `1.0`.
- Kept baseline character/object sizes from v0.24.47 instead of applying the
  absolute ground scale that made everything too small in v0.24.42.
- Applied the stronger perspective response through the existing `depthScale`
  path, so enemies, trees, pickups, and their shadows stay visually consistent.

### Code touched
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Tune `OBJECT_GROUND_RELATIVE_WEIGHT` to adjust how strongly objects follow the
  ground curve. Keep it relative to the player's foot plane to avoid global
  shrinkage.

## 2026-06-07 - v0.24.47 - Enlarge modern sprite presentation (Codex)

### Summary
Adjusted the modern sprite atlas presentation so the pixel art reads larger and
less crushed, closer to an Octopath-style chunky sprite scale.
- Increased player visual scale from `1.7` to `2.05`.
- Added per-enemy visual scale factors while keeping gameplay hitboxes,
  collisions, melee radius, and movement unchanged.
- Increased tree and pickup visual sizes so the new atlas does not collapse into
  tiny unreadable details.
- Resized shadows to follow the enlarged visual boxes.

### Code touched
- `src/pixi/renderSpec.ts`
- `src/pixi/pixiScene.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- This is visual-only scaling. If gameplay feels easier/harder, inspect
  perception first; collision boxes were not changed.

## 2026-06-07 - v0.24.46 - Replace world sprites with modern atlas (Codex)

### Summary
Replaced the enemy, tree, and pickup atlas with the supplied modern pixel-art
sheet.
- Keyed the white JPEG background to transparent and rebuilt
  `public/sprites/atlas.png`.
- Updated the atlas rectangles in both the PixiJS renderer and Canvas fallback.
- Added a version query to `spritePath()` so changed sprite files are not stuck
  behind browser cache.
- Confirmed `public/sprites/player.png` is already the new black-armored
  player sprite; the apparent old sprite was likely cached.

### Sprite mapping
- `zombie`: standing zombie with bat
- `bat`: four-legged crawler
- `skeleton`: armored gas-mask enemy
- `plant`: carnivorous plant
- `ghost`: pale ghost
- `werewolf`: large wolf creature
- `pumpkin`: bloated boss
- `giantbat`: winged demon boss
- `reaper`: scythe reaper
- `tree`: dead tree
- `pickup-xp-blue/green/red`: blue, green, red vials
- `pickup-health`: medical pack
- `pickup-magnet`: magnet
- `pickup-bomb`: bomb
- `pickup-chest`: open chest

### Code touched
- `public/sprites/atlas.png`
- `src/pixi/pixiTextures.ts`
- `src/utils/spriteLoader.ts`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The unused hooded normal enemy from the source sheet was intentionally skipped.
- If the player still appears old in browser, force reload once; future sprite
  loads now include the app version query.

## 2026-06-07 - v0.24.45 - Restore object visual sizes (Codex)

### Summary
Restored character, enemy, item, and projectile sizes after the
ground-perspective scale trial.
- Removed the ground-derived object scale blend from `depthScaleWith`.
- Removed `groundObjectScale()` and related tuning constants.
- Reset projectile graphics scale to `1` each frame so old scale state cannot
  persist.
- Kept the strong perspective ground, seam fixes, and outlined player sprite
  unchanged.

### Code touched
- `src/pixi/pixiScene.ts` (object scale reset)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- v0.24.42 was the object-scale trial that made world objects too small.
- If object speed/scale matching is revisited, keep it behind a small trial
  constant and avoid changing baseline sprite sizes globally.

## 2026-06-07 - v0.24.44 - Sharpen player sprite outline (Codex)

### Summary
Regenerated the player sprite with a clearer pixel outline.
- Used the reusable `AI_MEGLIO/skills/purple_key_sprite` workflow.
- Kept the purple-background keying and `32x32` transparent PNG contract.
- Added a dark 1px pixel outline to improve readability over the darker forest
  and moss ground.

### Code touched
- `public/sprites/player.png`
- `package.json`, `package-lock.json`

### Verification
- `file public/sprites/player.png` OK (`32 x 32`, RGBA PNG)
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Runtime code was not changed.
- The reusable purple-key sprite workflow now lives in
  `/Users/tanity/AI_MEGLIO/skills/purple_key_sprite/`.

## 2026-06-07 - v0.24.43 - Replace player sprite (Codex)

### Summary
Replaced the player sprite with the supplied black-armored character.
- Converted the supplied purple-background image into a transparent PNG.
- Cropped the foreground character and resized it to match the existing
  `32x32` player sprite contract.
- Replaced `public/sprites/player.png`.

### Code touched
- `public/sprites/player.png`
- `package.json`, `package-lock.json`

### Verification
- `file public/sprites/player.png` OK (`32 x 32`, RGBA PNG)
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The purple background was keyed out via a one-off local CoreGraphics/Swift
  conversion script. No runtime code changed.
- If the in-game sprite feels too small/large, regenerate the sprite with a
  different crop padding rather than changing gameplay box sizes.

## 2026-06-07 - v0.24.42 - Match object scale to ground perspective (Codex)

### Summary
Aligned object visual scale more closely with the perspective ground.
- Added `groundObjectScale()` based on the same horizon-to-foreground curve used
  by the ground strips.
- Blended that ground-derived scale into the existing tree/player/enemy/item
  depth scale.
- Applied the same depth scale to projectile graphics.
- Left gameplay positions, hitboxes, collision, and simulation speed unchanged.

### Code touched
- `src/pixi/pixiScene.ts` (object scale derived from ground perspective)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- This is a visual-only scale pass. If object movement speed also needs to
  parallax with the ground, do it as a separate trial because it can create
  visible hitbox/position mismatch.
- Tune `OBJECT_GROUND_SCALE_WEIGHT` for how strongly objects follow the ground
  curve, and `OBJECT_GROUND_SCALE_MIN/MAX` for far/near size limits.

## 2026-06-07 - v0.24.41 - Trial stronger ground perspective (Codex)

### Summary
Created a trial version with stronger ground depth, closer to the first
perspective pass, while preserving the v0.24.40 sampling fixes.
- Changed `GROUND_TILE_SCALE_Y_FAR` from `0.38` to `0.12`.
- Changed `GROUND_PERSPECTIVE_CURVE` from `1.45` to `2.05`.
- Kept the 72-strip ground and scale-aware tilePosition from v0.24.40.

### Code touched
- `src/pixi/pixiScene.ts` (ground perspective tuning)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- `v0.24.40` / commit `1a1deea` is the current preferred stable baseline for
  the perspective ground before this stronger-depth trial.
- If this trial feels too aggressive, compare against `v0.24.40` and tune
  `GROUND_TILE_SCALE_Y_FAR` upward before changing other constants.

## 2026-06-07 - v0.24.40 - Reduce perspective ground sampling artifacts (Codex)

### Summary
Reduced visible artifacts in the perspective ground while moving vertically.
- Increased perspective ground strips from `36` to `72` so each band is thinner.
- Changed strip tile position to account for `tileScale`, keeping source-image
  sampling continuous across scaled strips.
- Kept the softened depth tuning from v0.24.38/v0.24.39.

### Code touched
- `src/pixi/layers.ts` (ground strip count)
- `src/pixi/pixiScene.ts` (ground tilePosition sampling)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If artifacts remain, the next safer step is to reduce `GROUND_TILE_SCALE_Y`
  contrast further or replace the strip method with a single pre-rendered
  perspective texture.

## 2026-06-06 - v0.24.39 - Smooth perspective ground strip seams (Codex)

### Summary
Reduced visible texture jumps between perspective ground strips.
- Removed per-strip horizontal scale variation.
- Kept `GROUND_TILE_SCALE_X` constant so vertical strip borders align better.
- Changed vertical tile sampling to accumulate continuous source Y across
  strips instead of recalculating each strip independently.
- Slightly overlapped strip heights to hide subpixel seams.

### Code touched
- `src/pixi/pixiScene.ts` (ground strip texture sampling)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If strip seams remain visible, increase strip count in `src/pixi/layers.ts`
  or add a tiny per-strip alpha overlap mask.

## 2026-06-06 - v0.24.38 - Soften ground perspective depth (Codex)

### Summary
Reduced the perceived depth/motion of the perspective ground.
- Changed `GROUND_TILE_SCALE_Y_FAR` from `0.06` to `0.38`.
- Changed `GROUND_PERSPECTIVE_CURVE` from `2.15` to `1.45`.
- Left the supplied moss/dirt texture and strip count unchanged.

### Code touched
- `src/pixi/pixiScene.ts` (ground perspective tuning)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If the ground still moves too much, raise `GROUND_TILE_SCALE_Y_FAR` further
  toward `0.5`. If it becomes too flat, lower it toward `0.25`.

## 2026-06-06 - v0.24.37 - Add perspective moss ground (Codex)

### Summary
Replaced the generated forest-floor base with the supplied moss/dirt ground
texture and added a lightweight pseudo-perspective ground renderer.
- Added `public/backgrounds/ground-moss-dirt.jpg`.
- Loaded the new ground texture in `PixiStage`.
- Changed `groundBase` from one `TilingSprite` to a `Container` of 36 horizontal
  tiled strips.
- Scaled each strip vertically so the ground compresses toward the horizon
  forest, matching the supplied perspective reference without a 3D mesh.

### Code touched
- `public/backgrounds/ground-moss-dirt.jpg`
- `src/pixi/PixiStage.tsx` (ground texture loading)
- `src/pixi/layers.ts` (strip-based ground layer)
- `src/pixi/pixiScene.ts` (perspective strip layout and sync)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK
- `curl -I http://localhost:5175/zombie/backgrounds/ground-moss-dirt.jpg` OK
  (`200`, `image/jpeg`)

### Handoff notes
- Tune `GROUND_TILE_SCALE_Y_FAR`, `GROUND_TILE_SCALE_Y_NEAR`, and
  `GROUND_PERSPECTIVE_CURVE` for stronger/weaker horizon compression.

## 2026-06-06 - v0.24.36 - Fade actors into horizon forest (Codex)

### Summary
Changed the horizon disappearance from an abrupt cutoff to a distance-based fade.
- Added `HORIZON_ACTOR_FADE_PX = 120`.
- Faded trees, enemy containers, enemy shadows, and enemy lights as their foot
  position approaches the horizon forest hide line.
- Kept the final fully-hidden point at the forest seam line from v0.24.35.

### Code touched
- `src/pixi/pixiScene.ts` (actor/tree/shadow/light horizon alpha)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Tune `HORIZON_ACTOR_FADE_PX` for fade length. Larger values fade earlier and
  more gradually; smaller values fade later and faster.

## 2026-06-06 - v0.24.35 - Separate actor hide line from ground fade (Codex)

### Summary
Fixed enemies/trees not disappearing near the horizon forest.
- Added `HORIZON_ACTOR_HIDE_OFFSET_PX`.
- Kept ground/world reveal using `HORIZON_REVEAL_OFFSET_PX`.
- Changed enemy/tree hide cutoff to use the rendered `horizonForest` bottom
  line instead of the much higher ground-fade zero line.

### Code touched
- `src/pixi/pixiScene.ts` (horizon actor hide cutoff)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If actors vanish too early/late at the forest seam, tune
  `HORIZON_ACTOR_HIDE_OFFSET_PX` without changing the ground fade constants.

## 2026-06-06 - v0.24.34 - Restore horizon actor fade cutoff (Codex)

### Summary
Restored the enemy/tree fade-out behavior near the horizon forest.
- Added `horizonRevealZeroScreenY()` so the cutoff is derived from the current
  visible `horizonForest` position every frame.
- Updated `horizonForestFootWorldY` during `sync()` after the forest position is
  set, avoiding stale resize-time cutoff values.
- Kept the bottom 10px forest fade and the 100px raised seam placement.

### Code touched
- `src/pixi/pixiScene.ts` (horizon fade cutoff calculation)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If actors still appear in front of the far panorama, inspect
  `HORIZON_REVEAL_OFFSET_PX` first; the cutoff now follows the rendered forest.

## 2026-06-06 - v0.24.33 - Fade horizon forest bottom edge (Codex)

### Summary
Softened the lower edge of the visible boundary forest.
- Added a dedicated alpha mask for `horizonForest`.
- Kept the forest opaque through most of its height, fading only the bottom
  `10px` to transparent.
- Left horizon placement, gameplay cutoff, ground rendering, and layer order
  unchanged.

### Code touched
- `src/pixi/pixiScene.ts` (horizon forest bottom alpha mask)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Tune `HORIZON_FOREST_BOTTOM_FADE_PX` if the seam needs a wider/narrower fade.

## 2026-06-06 - v0.24.32 - Raise horizon forest seam (Codex)

### Summary
Moved the visible boundary forest seam 100px upward.
- Added `HORIZON_FOREST_Y_OFFSET_PX = -100`.
- Applied the offset in both resize and frame sync placement.
- Left horizon reveal/fade logic, gameplay alpha cutoff, ground, and layer order unchanged.

### Code touched
- `src/pixi/pixiScene.ts` (horizon forest Y placement)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If the forest now overlaps the HUD/far backdrop too much, tune only
  `HORIZON_FOREST_Y_OFFSET_PX` first.

## 2026-06-06 - v0.24.31 - Render horizon forest as sprite (Codex)

### Summary
Made the boundary forest layer render without tiling/cropping.
- Changed `horizonForest` from `TilingSprite` to a regular `Sprite`.
- Removed `tileScale` / `tilePosition` handling for the boundary forest.
- Kept it as the topmost non-UI layer, after `frontForest` and before `uiLayer`.

### Code touched
- `src/pixi/layers.ts` (horizon forest display type)
- `src/pixi/pixiScene.ts` (removed horizon forest tiling controls)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- This is a visibility fix. If the forest is now too vertically compressed,
  tune `HORIZON_FOREST_HEIGHT_RATIO/MIN/MAX` next.

## 2026-06-06 - v0.24.30 - Move horizon forest to top non-UI layer (Codex)

### Summary
Moved the boundary forest layer to the top of the game scene.
- Removed `horizonForest` from `worldGroup`.
- Added `horizonForest` directly to the stage after `frontForest` and before
  `uiLayer`, making it the topmost non-UI visual layer.
- Kept `HORIZON_REVEAL_OFFSET_PX = 200` and the restored individual far-hide
  behavior unchanged.

### Code touched
- `src/pixi/layers.ts` (horizon seam stage order)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- `uiLayer` remains above the forest so HUD, mobile controls, flashes, and
  arrows remain usable.

## 2026-06-06 - v0.24.29 - Keep horizon forest visible above gameplay fade (Codex)

### Summary
Restored visibility for the forest that sits in front of the distant backdrop.
- Moved `horizonForest` above `filteredWorld` inside `worldGroup`.
- Kept `HORIZON_REVEAL_OFFSET_PX = 200` and the restored individual far-hide
  behavior unchanged.
- This separates the seam forest PNG from gameplay/object transparency tuning.

### Code touched
- `src/pixi/layers.ts` (horizon seam draw order)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- `HORIZON_REVEAL_OFFSET_PX` controls gameplay object cutoff, not the
  `horizonForest` PNG position.

## 2026-06-06 - v0.24.28 - Raise restored horizon cutoff by 40px (Codex)

### Summary
Adjusted the restored horizon disappearance point.
- Changed `HORIZON_REVEAL_OFFSET_PX` from 160 to 200, moving the disappear point
  another 40px upward.
- Kept the restored individual far-hide behavior intact.

### Code touched
- `src/pixi/pixiScene.ts` (horizon reveal offset)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Current restored cutoff: `HORIZON_REVEAL_OFFSET_PX = 200`.

## 2026-06-06 - v0.24.27 - Raise restored horizon cutoff by another 30px (Codex)

### Summary
Adjusted the restored horizon disappearance point.
- Changed `HORIZON_REVEAL_OFFSET_PX` from 130 to 160, moving the disappear point
  another 30px upward.
- Kept the restored individual far-hide behavior intact.

### Code touched
- `src/pixi/pixiScene.ts` (horizon reveal offset)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Current restored cutoff: `HORIZON_REVEAL_OFFSET_PX = 160`.

## 2026-06-06 - v0.24.26 - Raise restored horizon cutoff by 30px (Codex)

### Summary
Adjusted the restored horizon disappearance point.
- Changed `HORIZON_REVEAL_OFFSET_PX` from 100 to 130, moving the disappear point
  30px upward.
- Kept the restored individual far-hide behavior intact.

### Code touched
- `src/pixi/pixiScene.ts` (horizon reveal offset)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Current restored cutoff: `HORIZON_REVEAL_OFFSET_PX = 130`.

## 2026-06-06 - v0.24.25 - Raise restored horizon cutoff slightly (Codex)

### Summary
Adjusted the restored v0.24.23 horizon disappearance point.
- Changed `HORIZON_REVEAL_OFFSET_PX` from 50 to 100, moving the disappear point
  50px upward.
- Kept the restored individual far-hide behavior intact.

### Code touched
- `src/pixi/pixiScene.ts` (horizon reveal offset)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Current restored cutoff: `HORIZON_REVEAL_OFFSET_PX = 100`.

## 2026-06-06 - v0.24.24 - Lower restored horizon cutoff (Codex)

### Summary
Adjusted the restored v0.24.23 horizon disappearance point.
- Changed `HORIZON_REVEAL_OFFSET_PX` from 150 to 50, moving the disappear point
  100px downward.
- Kept the v0.24.23 individual far-hide behavior intact.

### Code touched
- `src/pixi/pixiScene.ts` (horizon reveal offset)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- This is based on the restored v0.24.23 logic, not the later v0.24.30/31 path.

## 2026-06-06 - v0.24.23 restore - Restore completed horizon fade behavior (Codex)

### Summary
Restored the runtime code to the known-good `6d3f17a / v0.24.23` state after
the later branch/version confusion.
- Restored `package.json`, `package-lock.json`, `src/pixi/layers.ts`, and
  `src/pixi/pixiScene.ts` from commit `6d3f17a`.
- This brings back the completed top-edge disappearance logic where gameplay
  objects use the shared horizon fade and hard cutoff behavior from v0.24.23.

### Code touched
- `package.json`, `package-lock.json`
- `src/pixi/layers.ts`
- `src/pixi/pixiScene.ts`
- `DEVELOPMENT_LOG.md` (this restore note)

### Verification
- `npm run lint` pending
- `npm run build` pending

### Handoff notes
- Treat `6d3f17a / v0.24.23` as the reference point for the horizon fade logic.
- Do not remove the individual far-hide logic again unless explicitly requested.

## 2026-06-06 - v0.24.31 - Use alpha channel for horizon fade mask (Codex)

### Summary
Fixed the shared horizon fade mask so it actually uses the transparent gradient.
- Switched `filteredWorld` from `.mask = worldFadeMask` to
  `setMask({ mask: worldFadeMask, channel: 'alpha' })`.
- Kept trees/enemies visible individually; all top-edge disappearance should come
  from the shared alpha mask.

### Code touched
- `src/pixi/pixiScene.ts` (mask channel selection)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Pixi sprite masks read the red channel by default. This mask is encoded in
  canvas alpha, so it must stay on `channel: 'alpha'`.

## 2026-06-06 - v0.24.30 - Restore shared horizon fade without hiding trees (Codex)

### Summary
Fixed the horizon fade behavior after the branch restore confusion.
- Removed the remaining per-tree and per-enemy hard alpha cutoff.
- Kept `worldFadeMask` as the single shared top-edge fade for all gameplay
  rendering in `filteredWorld`.
- Restored trees, enemy shadows, and enemy lights so they fade with the shared
  mask instead of disappearing independently.

### Code touched
- `src/pixi/pixiScene.ts` (removed individual far-hide alpha gates)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Top-edge disappearance should now be controlled by `HORIZON_REVEAL_OFFSET_PX`
  and `HORIZON_REVEAL_FADE_PX` only.

## 2026-06-06 - v0.24.29 - Shrink horizon seam forest (Codex)

### Summary
Adjusted the horizon seam forest scale after screenshot review.
- Reduced horizon seam forest height tuning by about half:
  `0.3 / 170-260px` -> `0.15 / 85-130px`.
- Kept `HORIZON_FOREST_Y_OFFSET_PX = -100`.

### Code touched
- `src/pixi/pixiScene.ts` (horizon seam height tuning)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Current seam draw order is still topmost non-UI for visual tuning.

## 2026-06-06 - v0.24.28 - Lower horizon seam forest slightly (Codex)

### Summary
Adjusted the horizon seam forest placement after screenshot review.
- Changed `HORIZON_FOREST_Y_OFFSET_PX` from -200 to -100, moving the seam forest
  100px downward.
- Kept the temporary topmost non-UI draw order and front forest blur disabled.

### Code touched
- `src/pixi/pixiScene.ts` (horizon seam Y offset)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Current seam placement offset: `HORIZON_FOREST_Y_OFFSET_PX = -100`.

## 2026-06-06 - v0.24.27 - Move horizon seam forest upward (Codex)

### Summary
Adjusted the visible horizon seam forest placement after screenshot review.
- Added `HORIZON_FOREST_Y_OFFSET_PX = -200`.
- Moved the horizon seam forest 200px upward in both resize and per-frame sync.
- Kept the temporary topmost non-UI draw order and front forest blur disabled.

### Code touched
- `src/pixi/pixiScene.ts` (horizon seam Y offset)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Current seam placement is intentionally frontmost for visibility testing. Once
  the visual position is approved, decide whether to move it back below
  `frontForest` or keep it as a foreground seam.

## 2026-06-06 - v0.24.26 - Disable front forest blur and force horizon seam front (Codex)

### Summary
Adjusted forest layers after playtest feedback.
- Disabled the bottom/front forest blur by setting `FRONT_FOREST_BLUR = 0` and
  only creating a `BlurFilter` when the value is greater than zero.
- Enlarged the horizon seam forest band and increased overlap with the far/ground
  boundary so the seam forest should be more visible.
- Moved `horizonForest` out of `worldGroup` and above `frontForest` so it is the
  topmost non-UI layer for visibility testing.

### Code touched
- `src/pixi/layers.ts` (temporary topmost horizon seam draw order)
- `src/pixi/pixiScene.ts` (forest layer tuning)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If the horizon seam still does not appear in this topmost placement, the next
  check should be the visible source region of `horizon-forest-band.png`, not
  enemy/tree alpha or draw order.

## 2026-06-06 - v0.24.25 - Keep horizon seam clear of world fade mask (Codex)

### Summary
Adjusted the shared horizon fade mask so it cannot cover the horizon seam forest.
- Moved `worldFadeMask` from `worldGroup` into `filteredWorld`.
- Kept the mask applied only to gameplay rendering.
- Left `horizonForest` outside the mask and above gameplay in draw order.

### Code touched
- `src/pixi/pixiScene.ts` (mask parent)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The per-enemy/per-procedural-tree hide logic still only affects gameplay
  actors/trees, not the `horizonForest` seam PNG.

## 2026-06-06 - v0.24.24 - Draw horizon forest seam above gameplay world (Codex)

### Summary
Restored visibility for the horizon boundary forest.
- Moved `horizonForest` above `filteredWorld` in `worldGroup` draw order.
- Kept `groundBase` below gameplay and outside DoF/bloom filters.
- Kept the shared horizon fade mask unchanged.

### Code touched
- `src/pixi/layers.ts` (horizon seam draw order)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Horizon seam forest should remain outside the gameplay filter wrapper and draw
  over the far/ground transition.

## 2026-06-06 - v0.24.23 - Lower horizon fade cutoff slightly (Codex)

### Summary
Adjusted the horizon reveal after playtest feedback.
- Moved the fully-hidden gameplay fade cutoff 50px lower, from 200px above the
  horizon forest foot to 150px above it.
- Kept the shared `filteredWorld` mask and fade length unchanged.

### Code touched
- `src/pixi/pixiScene.ts` (horizon reveal offset)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Current cutoff: `HORIZON_REVEAL_OFFSET_PX = 150`.

## 2026-06-06 - v0.24.22 - Raise horizon fade cutoff again (Codex)

### Summary
Adjusted the horizon reveal further after playtest feedback.
- Moved the fully-hidden gameplay fade cutoff from 100px above the horizon
  forest foot to 200px above it.
- Kept the shared `filteredWorld` mask and fade length unchanged.

### Code touched
- `src/pixi/pixiScene.ts` (horizon reveal offset)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The fade now starts much higher; if the fade feels too long or too short,
  tune `HORIZON_REVEAL_FADE_PX` separately.

## 2026-06-06 - v0.24.21 - Raise horizon fade cutoff (Codex)

### Summary
Adjusted the horizon reveal after playtest feedback.
- Moved the fully-hidden gameplay fade cutoff from 50px above the horizon forest
  foot to 100px above it.
- Kept the same shared `filteredWorld` mask approach and fade length.

### Code touched
- `src/pixi/pixiScene.ts` (horizon reveal offset)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If objects still pop near the top, tune `HORIZON_REVEAL_FADE_PX` next rather
  than adding per-object alpha rules.

## 2026-06-06 - v0.24.20 - Smooth horizon reveal fade (Codex)

### Summary
Smoothed the top-edge appearance of gameplay objects near the horizon forest.
- Moved the hard fully-hidden line 50px upward from the horizon forest foot.
- Added a screen-space alpha mask to `filteredWorld` so all gameplay rendering
  fades in together from the forest line instead of popping in per object.
- Kept the existing per-tree/per-enemy full hide as a backup at the alpha-zero
  line while pickups, projectiles, effects, and actors share the same mask fade.

### Code touched
- `src/pixi/pixiScene.ts` (horizon reveal mask and shifted hide line)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The fade is implemented as one stretched 4px-wide canvas texture mask, so it
  avoids per-object opacity work and should stay cheap.

## 2026-06-06 - v0.24.19 - Restore actor/object visibility after ground filter split (Codex)

### Summary
Fixed a regression where the ground rendered above characters, enemies, trees,
pickups, and other gameplay objects.
- Added a screen-space `filteredWorld` wrapper between `worldGroup` and the
  camera-offset `world`.
- Kept `groundBase` and `horizonForest` outside the DoF/bloom filters.
- Applied DoF/bloom to `filteredWorld`, not directly to the camera-offset
  `world`, so the filter area stays aligned to the screen and gameplay objects
  render above the ground again.

### Code touched
- `src/pixi/layers.ts` (added `filteredWorld` wrapper)
- `src/pixi/pixiScene.ts` (filter target moved to `filteredWorld`)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Do not apply screen-sized filter areas directly to the camera-offset `world`.
  Use a screen-space wrapper when filtering gameplay layers without including
  the fixed ground.

## 2026-06-06 - v0.24.18 - Keep ground out of DoF and hide far actors (Codex)

### Summary
Fixed the ground bleeding over the distant panorama and made far-side actors
disappear behind the horizon forest.
- Moved bloom/tilt-shift filters from `worldGroup` to the camera-offset `world`
  so `groundBase` and `horizonForest` are not blurred into the panorama.
- Added a horizon-forest foot line in world coordinates.
- Set tree sprites and enemy containers to `alpha = 0` when their foot position
  is above that line.
- Skipped hidden enemies' lights and foot shadows.

### Code touched
- `src/pixi/layers.ts` (filter ownership comment)
- `src/pixi/pixiScene.ts` (filter target and far actor/tree hiding)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The ground should stay outside DoF/bloom. If blur is needed later, add a
  separate ground-only effect that cannot sample into the panorama band.
- The player is intentionally not hidden by the horizon line in this pass.

## 2026-06-06 - v0.24.17 - Restore Claude v0.24.7 melee crest (Codex)

### Summary
Corrected the melee/counter indicator target after clarification.
- Replaced the restored 360-degree ring with Claude Code's `v0.24.7` static
  crest/crescent indicator.
- Kept the horizon seam forest layering fix from `v0.24.16` intact.

### Code touched
- `src/pixi/pixiScene.ts` (melee/counter crest restore)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The intended melee indicator is the Claude Code `v0.24.7` crest/crescent,
  not the earlier Codex 360-degree ring.

## 2026-06-06 - v0.24.16 - Restore smooth melee ring and reveal seam forest (Codex)

### Summary
Fixed two regressions spotted during visual review.
- Restored the smooth 360-degree melee/counter ring with subtle right-side
  thickening from the earlier Codex pass, replacing the static crescent style
  that had remained from the later Claude Code tuning.
- Moved `horizonForest` into `worldGroup` above `groundBase` and below the
  camera-offset `world`, so the seam forest is visible over the ground/far
  boundary without covering actors.

### Code touched
- `src/pixi/layers.ts` (horizon forest layer ordering)
- `src/pixi/pixiScene.ts` (melee/counter ring restore, import cleanup)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If the seam forest disappears again, check that it is a child of `worldGroup`
  after `groundBase`, not a stage child behind `worldGroup`.
- The intended melee indicator is the smooth full ring, not the static crescent.

## 2026-06-06 - v0.24.15 - Lower horizon forest seam (Codex)

### Summary
Adjusted the horizon forest seam so it hides the ground/panorama boundary
without covering too much of the distant backdrop.
- Reduced the horizon forest height.
- Lowered the layer by reducing its overlap into the far backdrop.

### Code touched
- `src/pixi/pixiScene.ts` (`HORIZON_FOREST_*` tuning)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If it still covers too much distant scenery, lower `HORIZON_FOREST_OVERLAP_RATIO`
  further. If a hard seam appears, raise it slightly.

## 2026-06-06 - v0.24.14 - Smaller blurred front forest (Codex)

### Summary
Adjusted the nearest foreground forest after visual review.
- Changed the front forest from full-screen cover sizing to a bottom-anchored
  band with capped height, so the trees read closer to normal scale.
- Added a light Pixi `BlurFilter` to soften the nearest foreground layer.
- Kept front forest parallax horizontal-only.

### Code touched
- `src/pixi/pixiScene.ts` (front forest sizing and blur)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Tune `FRONT_FOREST_HEIGHT_RATIO`, `FRONT_FOREST_MIN_HEIGHT`,
  `FRONT_FOREST_MAX_HEIGHT`, and `FRONT_FOREST_BLUR` in
  `src/pixi/pixiScene.ts` after on-device visual review.

## 2026-06-06 - v0.24.13 - Horizon forest seam and horizontal-only parallax (Codex)

### Summary
Refined the depth-background setup based on visual feedback.
- Converted the supplied purple-back boundary forest image into
  `public/backgrounds/horizon-forest-band.png`.
- Added a `horizonForest` screen-space seam layer between the distant panorama
  and the ground.
- Removed the previous dark rectangle horizon blend layer that looked like a
  black band over the distant church/castle area.
- Stopped vertical parallax for the distant panorama and nearest foreground
  forest so endless north/south movement cannot expose texture edges.

### Code touched
- `src/pixi/layers.ts` (horizon forest layer)
- `src/pixi/PixiStage.tsx` (horizon forest texture load)
- `src/pixi/pixiScene.ts` (seam layout, horizontal-only far/front parallax)
- `public/backgrounds/horizon-forest-band.png`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Tune `HORIZON_FOREST_*` constants in `src/pixi/pixiScene.ts` if the seam
  sits too high/low on phone screens.
- The source is JPEG chroma-keyed, so a true alpha PNG would still be cleaner if
  purple fringe appears against the panorama.

## 2026-06-06 - v0.24.12 - Front forest foreground parallax layer (Codex)

### Summary
Added the supplied purple-back forest image as the nearest foreground layer.
- Converted the purple JPEG background into an alpha PNG locally and saved it as
  `public/backgrounds/front-forest-foreground.png`.
- Added a new `frontForest` screen-space `TilingSprite` above the Pixi world and
  below the UI layer.
- Gave the front forest faster parallax than the ground so it reads as the
  closest moving layer.

### Code touched
- `src/pixi/layers.ts` (front forest layer)
- `src/pixi/PixiStage.tsx` (front forest texture load)
- `src/pixi/pixiScene.ts` (front forest resize/parallax sync)
- `public/backgrounds/front-forest-foreground.png`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK
- `curl -I http://localhost:5176/zombie/backgrounds/front-forest-foreground.png` OK (`200`, `image/png`)

### Handoff notes
- Tune `FRONT_FOREST_PARALLAX_X`, `FRONT_FOREST_PARALLAX_Y`, and
  `FRONT_FOREST_ALPHA` in `src/pixi/pixiScene.ts` after on-device visual review.
- The source was a JPEG chroma key, so a small purple edge fringe may remain; a
  true alpha PNG source would be cleaner if this becomes noticeable in motion.

## 2026-06-06 - v0.24.10 - Opaque panorama and horizon blend (Codex)

### Summary
Adjusted the new distant panorama based on visual feedback.
- Made the far panorama fully opaque (`alpha = 1`) so it reads as a solid
  background instead of slightly translucent.
- Added a soft dark horizon blend band over the panorama/ground boundary so the
  transition into the ground feels foggier and less hard-edged.

### Code touched
- `src/pixi/pixiScene.ts` (far backdrop opacity and horizon blend overlay)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Boundary softness is controlled by `HORIZON_BLEND_HEIGHT` and the three
  rectangles in `drawHorizonBlend()`.

## 2026-06-06 - v0.24.9 - Distant panorama parallax layer (Codex)

### Summary
Added the first background-depth pass using the generated distant panorama.
- Added `public/backgrounds/distant-night-panorama.jpg`.
- Added a new `farBackdrop` screen-space TilingSprite behind the Pixi world.
- The panorama occupies the upper horizon band and scrolls slowly with camera
  movement for parallax depth.
- Shifted the forest-floor `groundBase` down so the top band remains distant
  scenery instead of tiled ground.

### Code touched
- `src/pixi/layers.ts` (far backdrop layer)
- `src/pixi/PixiStage.tsx` (load distant panorama texture)
- `src/pixi/pixiScene.ts` (resize/parallax layout)
- `public/backgrounds/distant-night-panorama.jpg`
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Tune `FAR_BACKDROP_HEIGHT_RATIO`, `FAR_BACKDROP_MIN_HEIGHT`, and parallax
  constants in `src/pixi/pixiScene.ts` after on-device visual review.
- Next depth pass should add a soft horizon mist/seam treatment and lightweight
  ground-depth shading below the panorama.

## 2026-06-06 - v0.24.8 - Melee ammo drop slider fallback fix (Codex)

### Summary
Investigated the report that ammo drops from melee-circle kills did not feel
linked to the start-screen percentage.
- Confirmed the normal melee kill path reads `meleeAmmoDropPercent / 100`, and
  melee finishers still use `×1.5` capped at 100%.
- Found one mismatch: melee kills only created ammo when `getActiveGun(player)`
  returned a gun with `ammoType`, while gun kills already fall back to owned gun
  ammo types.
- Added the same owned-gun fallback to melee kills so the start-screen slider
  governs melee drops even if the active gun pointer is temporarily unavailable.

### Code touched
- `src/store/gameStore.ts` (melee ammo drop fallback)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The label says "撃破時。近接フィニッシュは×1.5。"; current behavior matches
  that: all kills use the slider, melee finishers multiply it.
- If the user wants the slider to apply only to melee kills again, revert the
  gun-kill drop block in `src/hooks/useGameLoop.ts` from v0.24.5.

## 2026-06-05 - v0.24.7 - Thicker melee crescent + 0.1s freeze on knockback-immune (Claude Code)

### Summary
- Melee crescent a touch thicker: stroke `4*taper+0.4` -> `5*taper+0.6`.
- Melee counter on an enemy whose knockback is on cooldown (would NOT be shoved)
  now freezes it in place for 0.1s instead of doing nothing. Implemented by
  reusing the knockback override with zero velocity (`knockbackVx/Vy = 0`,
  `knockbackUntil = now + 100`) in `triggerCounter`'s immune branch, so
  `updateEnemies` holds it still (no chase) for 100ms while damage still lands.

### Code touched
- `src/pixi/pixiScene.ts` (crescent width), `src/store/gameStore.ts` (freeze)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK / `npm run build` OK. Pushed -> Pages auto-deploy.

## 2026-06-05 - v0.24.6 - Melee circle: static, quick, thinner (Claude Code)

### Summary
Tuned the melee/counter reach circle per feedback:
- No rotation: the blade is now a STATIC crescent (faces the player's last
  heading) instead of a comet sweeping around the ring.
- Quicker: it snaps in and fades over ~140ms (a brief flash) rather than showing
  for the whole counter window.
- Thinner reach ring: faint full ring width 1.4 -> 0.8.

### Code touched
- `src/pixi/pixiScene.ts` (syncPlayerFx counter-window branch; import COUNTER_WINDOW)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK / `npm run build` OK. Pushed -> Pages auto-deploy.

### Handoff notes
- Flash duration is the `/ 140` term; crescent width via the stroke `4*taper+0.4`;
  reach ring width 0.8 — all easy to retune.

## 2026-06-05 - v0.24.5 - Pause-on-levelup, ammo drop on all kills, weapon popup position (Claude Code)

### Summary
1. Level-up (and any pause) now stops the sim reliably: the game loop read
   `isPaused` from the captured closure, which could stay stale during the async
   effect re-run window, so the sim kept running for a few frames. Now reads
   `useGameStore.getState().isPaused` fresh inside the loop.
2. Ammo drop rate now applies to ALL kills, not just melee. The melee-only rate
   felt like ~20% because the auto-gun lands most killing blows (it even avoids
   stunned enemies, but still steals normal kills). Gun kills now roll an ammo
   drop at the start-screen rate (melee path already did; finisher still x1.5).
   Start-screen label updated: "撃破時。近接フィニッシュは×1.5。". Revertible to
   melee-only if undesired.
3. New-weapon popup moved down (top +64px -> +118px) so it no longer overlaps the
   HP/EXP status card.

### Code touched
- `src/hooks/useGameLoop.ts` (fresh isPaused read; ammo drop on gun kills)
- `src/components/GameHUD.tsx` (weapon popup position)
- `src/components/MainMenu.tsx` (drop-rate label)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK / `npm run build` OK. Pushed -> Pages auto-deploy.

### Handoff notes
- At 100% drop, every kill now drops an ammo box of the active gun's family —
  that's a lot of pickups; the slider is meant to be dialed down for normal play.
- Still deferred: Marksman magnum-vs-sniper direction.

## 2026-06-05 - v0.24.4 - Audio fixes: melee-kill grunt, iOS BGM toggle/volume, balance (Claude Code)

### Summary
1. Enemies killed by slash/melee now grunt: `triggerCounter` returns a `killed`
   count on `CounterTriggerResult`; both input handlers call `playEnemyDeath()`
   when `killed > 0` (was only on gun/projectile kills).
2. BGM toggle/volume on iOS fixed: HTMLAudioElement.volume is ignored on iOS, so
   the old volume-fade couldn't mute or balance BGM there. BGM is now routed
   through the SFX WebAudio context via a GainNode (createMediaElementSource ->
   gain -> destination), with on/off done by play()/pause(). Removed the fade
   timer; added `ensureBgmRouting()` + `applyBgm()`; `setAudioMuted`/`setBgmActive`
   just call `applyBgm()`. Falls back to element.volume if routing is unsupported.
3. Volume balance: BGM 0.42 -> 0.30; quiet SFX nudged up (pickup .62->.74,
   handgun .46->.52, shotgun .58->.66, rifle .54->.62); over-loud counter
   .98->.88.

### Code touched
- `src/audio/audioManager.ts` (BGM WebAudio routing, volume balance)
- `src/store/gameStore.ts` (`CounterTriggerResult.killed`)
- `src/components/VirtualJoystick.tsx`, `src/hooks/useGameControls.ts` (grunt on melee kill)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK / `npm run build` OK. Pushed -> Pages auto-deploy.
- iOS BGM routing uses createMediaElementSource; needs an on-device check that
  BGM both plays and toggles after the WebAudio routing (fallback included).

### Handoff notes
- Per-file inherent loudness still varies; the volume numbers in `SFX_SOURCES`
  are easy to retune. If a specific SE is still extreme, adjust its `volume`.
- Still DEFERRED (need user input): melee-kill ammo drop rate, Marksman magnum.

## 2026-06-05 - v0.24.3 - Stylish melee circle + shotgun/handgun ammo tweaks (Claude Code)

### Summary
Visual:
- Restyled the melee/counter reach circle (`syncPlayerFx`) again, per reference
  (Samurai Shodown circular slash, but refined): a faint reach ring plus a
  comet-like blade arc that tapers from a bright head to a thin tail and sweeps
  around the circle. Replaced the previous rotating "rune" ring.

Balance (requested):
- Shotgun now spends 1 round per trigger pull (was 1 per pellet). `fireWeapon`
  `consume = 1`; shotgun magazines resized from pellet-counts (15/18/21) to
  3 shots each (preserves the old ~3-shots-per-mag cadence, reserve lasts far
  longer).
- Handgun starting reserve halved: `AMMO_INITIAL.handgun` 120 -> 60.

### Code touched
- `src/pixi/pixiScene.ts` (melee circle), `src/utils/weaponUtils.ts` (shotgun),
  `src/store/gameStore.ts` (handgun ammo), `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK / `npm run build` OK. Pushed to the dev branch, which the
  Pages workflow auto-deploys to https://tanity0.github.io/zombie/ .

### Handoff notes — DEFERRED (need user input, left unchanged)
- Melee-kill ammo DROP rate: code in `triggerCounter` already applies
  `meleeAmmoDropPercent` on melee KILLS (50% base, finisher x1.5). Couldn't find
  a bug; likely melee kills are simply infrequent. Need the user to confirm
  whether drops are missing on confirmed melee finishes before changing design.
- Marksman (mage) magnum: starting `rifle-t1` is named マグナム but plays
  sniper-like (range 312, piercing). User wants it to feel like a magnum -
  confirm desired direction (handgun-class punchy revolver vs just retune) before
  changing, since it also affects the rifle upgrade tree.

## 2026-06-05 - v0.24.2 - Revert slash rework; restyle melee reach-ring (Claude Code)

### Summary
Two targeted changes from playtest feedback (the earlier "slash" rework was the
wrong target):
- Reverted the `slash` effect (`drawEffectGfx`) from the crescent swoosh back to
  the simple additive streak (the crescent wasn't what was wanted).
- Restyled the melee/counter reach-ring (`syncPlayerFx`, shown while the counter
  window is open) from the flat amber triple-circle + right-side arc into a
  sleeker "rune" ring: faint glow rim + crisp bright ring, small rotating tick
  marks, and two symmetric bright sweeps orbiting the rim. Normal blend so the
  reload meter is unaffected; bright cream pixels bloom on their own.

### Code touched
- `src/pixi/pixiScene.ts` (`drawEffectGfx` slash revert, `syncPlayerFx` ring)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK
- Needs on-device look (ring rotation speed / brightness).

### Handoff notes
- Ring tuning is in `syncPlayerFx`: `spin` (rotation speed), `ticks` count,
  `sweep` length, and the stroke colors/alphas. Cooldown ring still the faint
  gray circle.
- Built on the 0.24.1 merge (Codex red-death-splash + my slash crescent). The
  crescent is now gone again per request.

## 2026-06-05 - v0.24.0 - Red death/kill splash and smoother melee ring (Codex)

### Summary
Added red impact presentation and refined the melee/counter ring.
- Player death now holds the game view briefly before game-over, showing a deep
  red flash, red rings, red glow, and blood-like burst particles.
- Delayed the fallback `Game.tsx` health-zero transition so it does not hide the
  death VFX immediately.
- Enemy kill splashes are now red/dark-red for projectile kills and melee kills,
  including melee finishers.
- Smoothed the melee/counter ring: full 360-degree glowing rim with a subtle
  right-side thickening made from blended arcs instead of a hard separate mark.

### Code touched
- `src/hooks/useGameLoop.ts` (player death VFX, projectile kill splash)
- `src/store/gameStore.ts` (melee kill / finisher splash)
- `src/components/Game.tsx` (delayed health-zero fallback transition)
- `src/pixi/pixiScene.ts` (smoother full melee/counter ring)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Player game-over transition delay is 650ms in `useGameLoop.ts` and 700ms in
  `Game.tsx` as a fallback. Tune both together if the death hold feels too
  short or too long.
- The ring's right-side thickening is controlled by `accent` and the three
  local `arc(...)` calls in `src/pixi/pixiScene.ts`.

## 2026-06-05 - v0.23.2 - Full melee ring and stronger level-up VFX (Codex)

### Summary
Adjusted melee/counter and level-up presentation based on playtest feedback.
- Changed the melee/counter indicator from a partial crescent to a full 360
  degree glowing ring.
- Added a subtly thicker/brighter right-side arc on top of the full ring.
- Made level-up much flashier with a stronger flash, triple rings, center glow,
  larger gold burst, white sparkle burst, and a `LEVEL UP!` callout.

### Code touched
- `src/pixi/pixiScene.ts` (full melee/counter ring with right-side accent)
- `src/hooks/useGameLoop.ts` (level-up VFX combo)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Right-side ring accent is fixed slightly above the horizontal right side
  (`accent = -0.18`) so it is only subtly biased, as requested.
- If the level-up gets too busy on mobile, first reduce the gold burst count
  from `44` in `src/hooks/useGameLoop.ts`.

## 2026-06-05 - v0.23.1 - Melee crescent visibility and level-up reveal timing (Codex)

### Summary
Adjusted the previous visual polish based on playtest feedback.
- Made the melee/counter crescent wider, brighter, and longer so it reads as a
  visible slash edge instead of a tiny thin line.
- Delayed the UpgradeMenu overlay by 450ms after level-up so the game-side
  level-up flash/rings are visible before the selection panel appears.
- Slightly lengthened the UpgradeMenu backdrop fade to match the delayed reveal.

### Code touched
- `src/pixi/pixiScene.ts` (melee/counter crescent)
- `src/components/Game.tsx`, `src/index.css` (UpgradeMenu reveal timing)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If the pause delay feels too long, tune the `450` ms timer in
  `src/components/Game.tsx`.

## 2026-06-05 - v0.23.0 - Sparkle, level-up, and enemy light pass (Codex)

### Summary
Added the next visual polish pass requested by the player.
- Strengthened item pickup sparkles with richer bursts, small pickup-local
  rings, and short glows for gems / ammo / health / weapon pickups.
- Added level-up screen feedback before the pause fully reads: a subtle flash,
  extra white ring, larger burst, and UpgradeMenu entrance animation.
- Added Pixi enemy floor self-lights plus a short brighter hit pulse, kept under
  sprites so enemies do not get washed out.

### Code touched
- `src/hooks/useGameLoop.ts` (pickup and level-up VFX combos)
- `src/components/UpgradeMenu.tsx`, `src/index.css` (UpgradeMenu entrance)
- `src/pixi/pixiScene.ts` (enemy self-emission / hit pulse lights)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- Enemy lights are intentionally subtle. Tune `ENEMY_LIGHT_RADIUS`,
  `ENEMY_HIT_LIGHT_MS`, and `ENEMY_LIGHT_TINT` in `src/pixi/pixiScene.ts`.
- If pickup effects become too busy on mobile, reduce the per-pickup
  `spawnBurst` counts in `src/hooks/useGameLoop.ts`.

## 2026-06-05 - v0.22.2 - Crescent melee counter indicator (Codex)

### Summary
Changed the active melee/counter indicator from a filled yellow circle into a
thin crescent-like rim.
- Removed the inner fill from the active counter radius.
- Draws only a short forward-facing arc based on the player's last movement
  direction.
- Uses a faint wide halo stroke plus a thin bright stroke so the edge glows
  without lighting the inside of the circle.

### Code touched
- `src/pixi/pixiScene.ts` (Pixi player counter indicator)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- The cooldown ring is still the old faint gray full circle. If desired, it can
  be converted to the same crescent style in a later pass.

## 2026-06-05 - v0.22.1 - Remove player-covering counter glow (Codex)

### Summary
Reduced the melee/counter visual noise that was flashing over the player.
- Removed the yellow player-centered glow from the melee/counter release.
- Removed the cyan full-screen flash and player-centered glow from successful
  projectile counter reflection.
- Kept the counter shockwave ring, sparks, callout, and SFX so the action still
  reads without covering the player.

### Code touched
- `src/store/gameStore.ts` (melee/counter release VFX)
- `src/hooks/useGameLoop.ts` (projectile counter success VFX)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK

### Handoff notes
- If more reduction is needed, the next candidates are the remaining counter
  ring/burst in `src/hooks/useGameLoop.ts` and the Pixi counter-radius ring in
  `src/pixi/pixiScene.ts`.

## 2026-06-05 - v0.22.0 - Octopath-style combat juice, pass 1 (Claude Code)

### Summary
First pass at "Octopath Traveler-level" flashy effects (visual only; no gameplay
change per CLAUDE.md). Two parts:
- Pixi effect RENDERING upgraded to additive + glowing cores so every existing
  effect pops and is caught by the bloom filter:
  - `particle` -> additive spark (soft halo + colored body + hot white core)
  - `ring` -> additive shockwave (soft band + crisp edge + hot inner line)
  - `glow` -> brighter additive disc + core
  - `slash` -> additive streak with a white-hot core line
- Layered effect COMBOS at the headline moments:
  - Crit / headshot: gold shockwave ring + gold sparks + glow.
  - Melee finisher: white shockwave + gold ring + 24 sparks + glow + stronger
    full-screen flash (0.18 -> 0.28).
  - Counter (reflect): cyan shockwave + sparks + glow + brief flash + callout.
  - Player damage: red full-screen flash (on top of the existing shake/burst).
  - Gunfire: warm muzzle flash glow at the gun, pointed along the shot.

### Code touched
- `src/pixi/pixiScene.ts` (drawEffectGfx additive/glow rendering)
- `src/hooks/useGameLoop.ts` (crit / counter / player-damage / muzzle combos)
- `src/store/gameStore.ts` (melee finisher combo + flash boost)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK
- Needs on-device pass (brightness/bloom interaction, perf with muzzle flashes).

### Handoff notes
- All effect intensities are literals at the spawn sites / drawEffectGfx - easy
  to dial up or down after seeing it on-device.
- NEXT (not done yet): item-pickup sparkle pass, LEVEL-UP production (best done
  as a UpgradeMenu entrance animation since level-up pauses immediately), and
  deeper environment/lighting (enemy emissive, dynamic light on hits).

## 2026-06-05 - v0.21.1 - Add Drive SFX assets and finalize event sounds (Codex)

### Summary
- Added the actual Drive-provided SFX files for the v0.21.0 event-sound wiring.
- Kept Claude Code's event wiring as the base:
  - random zombie death grunts on projectile/gun kills
  - `melee-finish` for normal melee finishers and stunned-boss finisher damage
  - `counter` for successful projectile reflection
  - `player-damage`, `bomb`, and `eat` on their matching events
- Adjusted melee input playback so finishers play `melee-finish`; normal melee
  hits play `slash-damage`.

### Assets added
- `public/audio/sfx/zombie-1.mp3`
- `public/audio/sfx/zombie-2.mp3`
- `public/audio/sfx/zombie-3.mp3`
- `public/audio/sfx/zombie-4.mp3`
- `public/audio/sfx/kill.mp3`
- `public/audio/sfx/counter.mp3`
- `public/audio/sfx/player-damage.mp3`
- `public/audio/sfx/bomb.mp3`
- `public/audio/sfx/eat.mp3`

### Code touched
- `src/audio/audioManager.ts`
- `src/hooks/useGameControls.ts`
- `src/components/VirtualJoystick.tsx`
- `package.json`
- `package-lock.json`
- `CLAUDE.md`
- `DEVELOPMENT_LOG.md`

### Verification
- `npm run lint`
- `npm run build`

### Handoff notes
- Drive asset copying is a Codex responsibility when Claude Code cannot access
  the user's local/Drive material folder.
- Continue from `v0.21.1`; `v0.21.0` below was Claude Code's wiring pass with
  assets marked pending.

## 2026-06-05 - v0.21.0 - Kill/counter/player-damage/zombie/bomb/eat SFX (Claude Code)

### Summary
Wired the remaining gameplay SFX triggers on top of Codex's audio system:
- `enemy death` -> random zombie grunt (`zombie-1..4`) on a gun/projectile kill,
  via new `playEnemyDeath()` (shared 70ms throttle so sprays don't stack).
- `melee-finish` (kill.mp3) -> melee finisher executing a normal enemy AND
  finisher-grade damage to a stunned boss. Surfaced via a new `finish` field on
  `CounterTriggerResult`; played from both input handlers.
- `counter` (counter.mp3) -> when a hostile bullet is actually reflected (parry
  success). Deliberately a touch louder (volume 0.98).
- `player-damage` -> when the player actually takes damage (projectile + contact
  paths, guarded by invulnerability so blocked hits stay silent).
- `eat` -> health/meat pickup; `bomb` -> bomb pickup (split out of generic
  `pickup`).

### Assets - PENDING (must be added on the Mac, then committed)
The cloud agent cannot write Drive binaries into the repo. Download these from
Drive `素材/SE` and save into `public/audio/sfx/` with EXACTLY these names:
- `zombie-1.mp3`, `zombie-2.mp3`, `zombie-3.mp3`, `zombie-4.mp3` (Drive zombie1..4.mp3)
- `kill.mp3`            (key `melee-finish`)
- `counter.mp3`        (key `counter`)
- `player-damage.mp3`  (Drive player_damage.mp3)
- `bomb.mp3`, `eat.mp3`
Until these exist the game runs fine but those sounds are silent (audioManager
swallows missing/undecodable buffers).

### Code touched
- `src/audio/audioManager.ts` (new keys, sources, `playEnemyDeath()`)
- `src/hooks/useGameLoop.ts` (counter / player-damage / enemy-death / eat / bomb)
- `src/store/gameStore.ts` (`CounterTriggerResult.finish`, boss-finish tracking)
- `src/components/VirtualJoystick.tsx`, `src/hooks/useGameControls.ts` (finish sound)
- `package.json`, `package-lock.json`

### Verification
- `npm run lint` OK
- `npm run build` OK
- Audio not verifiable in the cloud headless env; needs on-device check once the
  asset files above are dropped in.

### Handoff notes
- Mapping: gun kills -> zombie grunt; melee finisher -> kill.mp3; bomb ->
  bomb.mp3 (so a single death never doubles up). Adjust in `useGameLoop.ts` /
  the counter handlers if a different split is wanted.
- Counter volume is 0.98 in `SFX_SOURCES.counter` - tune there if too loud/soft.
- NEXT AGENT: add the 8 asset files above, commit them, on-device pass.

## 2026-06-05 - v0.20.5 - Damage SFX handoff completion

### Summary
- Completed the enemy damage SFX split:
  - `headshot` plays when a projectile hit is critical.
  - `shot-damage` plays on non-critical projectile hits.
  - `slash-damage` plays only when a melee counter actually hits at least one enemy.
- Kept `melee` as the swing sound, separate from damage impact.
- SFX playback remains on Web Audio buffers to avoid frame hitches caused by
  repeatedly controlling `HTMLAudioElement` instances.

### Assets
- `public/audio/sfx/headshot.mp3`
- `public/audio/sfx/shot-damage.mp3`
- `public/audio/sfx/slash-damage.mp3`

### Code touched
- `src/audio/audioManager.ts`
- `src/hooks/useGameLoop.ts`
- `src/hooks/useGameControls.ts`
- `src/components/VirtualJoystick.tsx`
- `src/store/gameStore.ts`
- `package.json`
- `package-lock.json`
- `CLAUDE.md`
- `DEVELOPMENT_LOG.md`

### Verification
- `npm run lint`
- `npm run build`

### Handoff notes
- User wants Codex and Claude Code to hand off development through this log.
- Development environment is `/Users/tanity/zombie`, not `/Users/tanity/AI_MEGLIO`.
- If a sound feels late or quiet, tune `SFX_SOURCES` in `src/audio/audioManager.ts`.
