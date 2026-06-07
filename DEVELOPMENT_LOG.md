# Development Log

This file is the handoff log for Codex, Claude Code, and other agents working
on the zombie game. Append a new entry after each meaningful change.

## Environment
- Repository: `/Users/tanity/zombie`
- Branch: `claude/chat-context-continuity-saxlH`
- Dev server: `npm run dev`
- Local URL: `http://localhost:5173/zombie/` unless Vite chooses another port
- Renderer under active development: PixiJS only

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
