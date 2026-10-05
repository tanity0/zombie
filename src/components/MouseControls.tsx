import React, { useCallback, useEffect } from 'react';
import { useGameStore, isInputLocked } from '../store/gameStore';
import { performFlickAction } from '../utils/inputActions';
import { pcPressDown, pcPressUp, markPcFlick } from '../utils/pcPress';
import { computeViewport } from '../utils/viewport';
import { screenToCameraLocal } from '../utils/viewTransform';
import { pcCycleGun } from '../utils/weaponCycle';

// PC(マウス)操作レイヤー。スマホの4操作に対応(research/PC_SUPPORT.md §11):
//   移動(指移動): WASD / 矢印(キーボード)
//   照準(指の位置): マウスカーソル → store.mouseAim(カメラからのずれ。ズーム込みで戻す=§11-2)。PHILL照準が連動。
//   指を置く/離す: 左ボタンを押す/離す(=タッチと同じ: 押している間ホーミングがロック、離すと近接・各種の発射。2度押しでスケボー)
//   フリック: 右クリック(一閃ダッシュ・ワイヤーアンカー。カーソル方向=360度へ発動)
// HUDボタンより手前(z低)に置くので、ボタン上のクリックはこのレイヤーに来ない(VirtualJoystickと同じ方式)。
const MouseControls: React.FC = () => {
  const setMouseAim = useGameStore(state => state.setMouseAim);

  // カーソル位置 → カメラからのずれ(論理座標)。端末pxを scale で割り、描画の拡大と位置を戻す(等倍なら従来と同じ値)。
  const cursorScreen = useCallback((e: { clientX: number; clientY: number }, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    const s = computeViewport(rect.width, rect.height).scale;
    return { x: (e.clientX - rect.left) / s, y: (e.clientY - rect.top) / s };
  }, []);
  const cursorLocal = useCallback((e: { clientX: number; clientY: number }, el: HTMLElement) => {
    const sp = cursorScreen(e, el);
    return screenToCameraLocal(sp.x, sp.y);
  }, [cursorScreen]);

  // 照準は**毎フレーム**ズーム込みで戻す(カーソルを止めたまま寄り/引きが進んでもズレない・品質監査 A-6)。
  // 画面座標を覚えておき、変換した値が動いた時だけ store へ書く(毎フレームの set を増やさない)。
  const rawRef = React.useRef<{ x: number; y: number } | null>(null);
  const updateAim = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isInputLocked()) return; // 操作不可中は照準(=向き)も更新しない
    rawRef.current = cursorScreen(e, e.currentTarget);
    setMouseAim(cursorLocal(e, e.currentTarget));
  }, [setMouseAim, cursorLocal, cursorScreen]);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const raw = rawRef.current;
      if (!raw || isInputLocked()) return;
      const cur = useGameStore.getState().mouseAim;
      if (!cur) return; // パッドで遊んでいる間は外れている(utils/gamepad)。マウスが動けばまた付く
      const v = screenToCameraLocal(raw.x, raw.y);
      if (Math.abs(v.x - cur.x) > 0.25 || Math.abs(v.y - cur.y) > 0.25) setMouseAim(v);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [setMouseAim]);

  // カーソルの方向(プレイヤー中心→カーソルのワールド点)。重なっていれば向いている向き。
  const cursorDir = useCallback((e: { clientX: number; clientY: number }, el: HTMLElement) => {
    const gs = useGameStore.getState();
    const local = cursorLocal(e, el);
    const p = gs.player;
    let dx = gs.camera.x + local.x - (p.x + p.width / 2);
    let dy = gs.camera.y + local.y - (p.y + p.height / 2);
    if (Math.abs(dx) + Math.abs(dy) < 0.001) {
      const ld = p.lastDirection ?? { x: 1, y: 0 };
      dx = ld.x; dy = ld.y;
    }
    const m = Math.hypot(dx, dy) || 1;
    return { x: dx / m, y: dy / m };
  }, [cursorLocal]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isInputLocked()) return;
    updateAim(e);
    if (e.button === 0) {
      pcPressDown('mouse');
    } else if (e.button === 2) {
      // 右クリック = フリック。カーソル方向へ発動(リズム中はリズムのフリック)。
      e.preventDefault();
      const d = cursorDir(e, e.currentTarget);
      const gs = useGameStore.getState();
      if (gs.rhythm.active) { gs.rhythmInput('flick', d); markPcFlick(); }
      else performFlickAction(d.x, d.y);
    }
  }, [updateAim, cursorDir]);

  // 離しは窓のどこで起きても拾う(押したままレイヤーの外=HUDの上へ出ても指が残らないように)。
  // HUD のボタンの上で押してこの層の上で離した時は、押下が受理されていない(pcPressDown を通っていない)ので何も起きない。
  useEffect(() => {
    const onUp = (e: MouseEvent) => {
      if (e.button !== 0) return;
      // 離した瞬間の向き=カーソルの方向は pcPressUp が mouseAim から合わせる(キーで振っても同じ・§11-2)。
      pcPressUp('mouse', true);
    };
    const onBlur = () => pcPressUp('mouse', false);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('pagehide', onBlur);
    return () => {
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pagehide', onBlur);
      pcPressUp('mouse', false); // 層が消えた(タッチへ切り替わった等)=撃たずに離す(監査 A-4)
    };
  }, []);

  // ホイール=銃の持ち替え(下=次 / 上=前)。トラックパッドは細かい量を連打で送ってくるので、量を溜めて一段ずつ・間を空ける。
  const wheelAcc = React.useRef(0);
  const wheelLast = React.useRef(0); // 最後に持ち替えた時刻
  const wheelEvt = React.useRef(0);  // 最後にホイールが来た時刻(止まっていたら溜めを捨てる)
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const now = performance.now();
    if (now - wheelEvt.current > 400) wheelAcc.current = 0;
    wheelEvt.current = now;
    wheelAcc.current += e.deltaY;
    if (Math.abs(wheelAcc.current) < 40 || now - wheelLast.current < 160) return;
    pcCycleGun(wheelAcc.current > 0 ? 1 : -1);
    wheelAcc.current = 0;
    wheelLast.current = now;
  }, []);

  return (
    <div
      className="absolute inset-0 z-20"
      style={{ touchAction: 'none', cursor: 'crosshair' }}
      onMouseMove={updateAim}
      onMouseDown={handleMouseDown}
      onWheel={handleWheel}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
};

export default MouseControls;
