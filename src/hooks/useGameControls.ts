import { useEffect } from 'react';
import { useGameStore, isGameTimeStopped } from '../store/gameStore';
import { performTapAction, performFlickAction } from '../utils/inputActions';

// Keyboard fallback — the game is touch-first, but we keep a PC-optimized
// scheme so a laptop is fully playable.
//   移動(指移動): WASD / 矢印(同時押しで斜めOK)
//   タップ/離す(カウンター・近接・PHILL発砲): Space / J
//   フリック(一閃ダッシュ・ワイヤーアンカー): K / Shift … 押した瞬間に「今の移動方向」へ発動。
//     斜めも出せる(WASD合成方向を使う)。二連打方式は廃止(斜めに行けないため)。
const isCounterKey = (key: string) => {
  const k = key.toLowerCase();
  return k === ' ' || k === 'spacebar' || k === 'space' || k === 'j';
};
// フリック発動キー(右手の定番ボタン想定 K、左手ピンキー Shift も可)。
const isFlickKey = (key: string) => {
  const k = key.toLowerCase();
  return k === 'k' || k === 'shift';
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

// いま押している移動キーの合成方向(斜めOK)を正規化して返す。何も押していなければ
// 直近の向き(player.lastDirection)、それも無ければ右。フリックの方向に使う。
const currentMoveVec = (): { x: number; y: number } => {
  const s = useGameStore.getState();
  const inp = s.inputState;
  let x = 0, y = 0;
  if (inp.up) y -= 1;
  if (inp.down) y += 1;
  if (inp.left) x -= 1;
  if (inp.right) x += 1;
  if (x === 0 && y === 0) {
    const ld = s.player.lastDirection;
    if (ld) { x = ld.x; y = ld.y; } else { x = 1; y = 0; }
  }
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
};

export const useGameControls = () => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const { key } = e;

      // 四神舞リズムモード中(PC): 移動キー=フリック(移動しない)、Space=タップ、Escape=終了。
      // 攻撃実行/効果音は useGameLoop 側が担当。移動入力は出さない(立ち止まりを維持)。
      if (useGameStore.getState().rhythm.active) {
        if (key.toLowerCase() === 'escape') {
          useGameStore.getState().setRhythmActive(false);
          return;
        }
        if (isCounterKey(key)) {
          e.preventDefault();
          if (!e.repeat) useGameStore.getState().rhythmInput('tap');
          return;
        }
        const md = moveDirFromKey(key);
        if (md) {
          e.preventDefault();
          if (!e.repeat) useGameStore.getState().rhythmInput('flick', DIR_VECTORS[md]);
          return;
        }
        return; // その他のキーはリズム中は無視
      }

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

      // 移動キーで向きを更新(フリックを「止まってから」押した時に最新の向きを使えるように)。
      if (moveDirFromKey(key)) {
        let dx = 0, dy = 0;
        if (inputState.up) dy -= 1;
        if (inputState.down) dy += 1;
        if (inputState.left) dx -= 1;
        if (inputState.right) dx += 1;
        if (dx !== 0 || dy !== 0) {
          const l = Math.hypot(dx, dy) || 1;
          useGameStore.getState().setLastDirection({ x: dx / l, y: dy / l });
        }
      }

      // フリック(一閃ダッシュ / ワイヤーアンカー): 今の移動方向(斜め可)へ発動。キーボードの予備操作
      // (PCの主操作はマウス右クリック)。装備していない方は store 側が false を返すので無害。
      if (isFlickKey(key)) {
        e.preventDefault();
        if (!e.repeat && !isGameTimeStopped()) {
          const v = currentMoveVec();
          performFlickAction(v.x, v.y);
        }
        useGameStore.setState({ inputState });
        return;
      }

      if (isCounterKey(key)) {
        e.preventDefault();
        // First press only — auto-repeat shouldn't keep refiring the counter.
        // 会話/登場演出中(時間停止中)はカウンターを出さない。
        if (!e.repeat && !isGameTimeStopped()) performTapAction();
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
