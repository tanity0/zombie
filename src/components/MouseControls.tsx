import React, { useCallback } from 'react';
import { useGameStore, isGameTimeStopped } from '../store/gameStore';
import { performTapAction, performFlickAction } from '../utils/inputActions';

// PC(マウス)操作レイヤー。スマホの4操作に対応:
//   移動(指移動): WASD / 矢印(キーボード)
//   照準(指の位置): マウスカーソル(このレイヤー上の位置)→ store.mouseAim(スクリーン座標)。PHILL照準が連動。
//   タップ/離す: 左クリック(カウンター・近接・PHILL発砲)
//   フリック: 右クリック(一閃ダッシュ・ワイヤーアンカー。カーソル方向=360度へ発動)
// HUDボタンより手前(z低)に置くので、ボタン上のクリックはこのレイヤーに来ない(VirtualJoystickと同じ方式)。
const MouseControls: React.FC = () => {
  const setMouseAim = useGameStore(state => state.setMouseAim);

  // カーソル位置(レイヤー左上=キャンバス左上 基準のスクリーン座標)を保存。ワールド変換は movePlayer 側で camera を足す。
  const updateAim = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMouseAim({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, [setMouseAim]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    updateAim(e);
    const gs = useGameStore.getState();
    if (gs.isPaused || isGameTimeStopped()) return;
    if (e.button === 0) {
      // 左クリック = タップ/離す。
      performTapAction();
    } else if (e.button === 2) {
      // 右クリック = フリック。カーソル方向(プレイヤー中心→ワールドカーソル)へ発動。
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const worldX = gs.camera.x + (e.clientX - rect.left);
      const worldY = gs.camera.y + (e.clientY - rect.top);
      const p = gs.player;
      let dx = worldX - (p.x + p.width / 2);
      let dy = worldY - (p.y + p.height / 2);
      if (Math.abs(dx) + Math.abs(dy) < 0.001) {
        const ld = p.lastDirection ?? { x: 1, y: 0 };
        dx = ld.x; dy = ld.y;
      }
      performFlickAction(dx, dy);
    }
  }, [updateAim]);

  return (
    <div
      className="absolute inset-0 z-20"
      style={{ touchAction: 'none', cursor: 'crosshair' }}
      onMouseMove={updateAim}
      onMouseDown={handleMouseDown}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
};

export default MouseControls;
