# Development Log

This file is the handoff log for Codex, Claude Code, and other agents working
on the zombie game. Append a new entry after each meaningful change.

## Environment
- Repository: `/Users/tanity/zombie`
- Branch: `claude/chat-context-continuity-saxlH`
- Dev server: `npm run dev`
- Local URL: `http://localhost:5173/zombie/` unless Vite chooses another port
- Renderer under active development: PixiJS only

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
