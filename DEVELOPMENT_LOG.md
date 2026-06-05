# Development Log

This file is the handoff log for Codex, Claude Code, and other agents working
on the zombie game. Append a new entry after each meaningful change.

## Environment
- Repository: `/Users/tanity/zombie`
- Branch: `claude/chat-context-continuity-saxlH`
- Dev server: `npm run dev`
- Local URL: `http://localhost:5173/zombie/` unless Vite chooses another port
- Renderer under active development: PixiJS only

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
