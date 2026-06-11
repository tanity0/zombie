import { useEffect } from 'react';
import { playSfx, playEnemyDeath } from '../audio/audioManager';
import { useGameStore, KATANA_DOUBLE_TAP_MS } from '../store/gameStore';

// Keyboard fallback — the game is touch-first now, but we keep WASD/arrow
// movement and Space-to-counter so the game is still playable on a laptop.
const isCounterKey = (key: string) => {
  const k = key.toLowerCase();
  return k === ' ' || k === 'spacebar' || k === 'space' || k === 'j';
};

type MoveDir = 'up' | 'down' | 'left' | 'right';
const DIR_VECTORS: Record<MoveDir, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};
const moveDirFromKey = (key: string): MoveDir | null => {
  switch (key.toLowerCase()) {
    case 'w': case 'arrowup': return 'up';
    case 's': case 'arrowdown': return 'down';
    case 'a': case 'arrowleft': return 'left';
    case 'd': case 'arrowright': return 'right';
    default: return null;
  }
};

export const useGameControls = () => {
  useEffect(() => {
    // 刀: 同一方向キーの素早い二連打で一閃ダッシュ。WASDと矢印は同方向なら
    // 混在二連打(w→↑など)も発動対象。装備/クールダウン判定はstore側が行い、
    // クールダウン中や未装備時は何も起きず通常移動のまま。
    let lastDirTap: { dir: MoveDir | ''; at: number } = { dir: '', at: 0 };

    const handleKeyDown = (e: KeyboardEvent) => {
      const { key } = e;
      const inputState = { ...useGameStore.getState().inputState };

      switch (key.toLowerCase()) {
        case 'w':
        case 'arrowup':
          inputState.up = true;
          break;
        case 's':
        case 'arrowdown':
          inputState.down = true;
          break;
        case 'a':
        case 'arrowleft':
          inputState.left = true;
          break;
        case 'd':
        case 'arrowright':
          inputState.right = true;
          break;
      }

      const moveDir = moveDirFromKey(key);
      if (moveDir && !e.repeat) {
        const nowMs = Date.now();
        if (lastDirTap.dir === moveDir && nowMs - lastDirTap.at <= KATANA_DOUBLE_TAP_MS) {
          const v = DIR_VECTORS[moveDir];
          if (useGameStore.getState().triggerKatanaDash(v.x, v.y)) {
            playSfx('melee');
          }
          lastDirTap = { dir: '', at: 0 };
        } else {
          lastDirTap = { dir: moveDir, at: nowMs };
        }
      }

      if (isCounterKey(key)) {
        e.preventDefault();
        // First press only — auto-repeat shouldn't keep refiring the counter
        if (!e.repeat) {
          const counter = useGameStore.getState().triggerCounter();
          if (counter.swung) playSfx('melee');
          if (counter.finish) playSfx('melee-finish');
          else if (counter.hit) playSfx('slash-damage');
          if (counter.killed > 0) playEnemyDeath(); // slain enemies grunt
        }
      }

      useGameStore.setState({ inputState });
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const { key } = e;
      const inputState = { ...useGameStore.getState().inputState };

      switch (key.toLowerCase()) {
        case 'w':
        case 'arrowup':
          inputState.up = false;
          break;
        case 's':
        case 'arrowdown':
          inputState.down = false;
          break;
        case 'a':
        case 'arrowleft':
          inputState.left = false;
          break;
        case 'd':
        case 'arrowright':
          inputState.right = false;
          break;
      }

      useGameStore.setState({ inputState });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);
};
