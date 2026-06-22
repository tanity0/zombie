import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';

// 縦持ち専用ガード: タッチ端末を横向きにしたら「縦にしてください」を全面表示してプレイを止める。
// 本作は縦持ち前提のレイアウト/遠近なので、横向きの崩れを丸ごと無効化する(社長指示)。
// PC(非タッチ)は横向きのウィンドウ＋マウスで遊ぶため対象外=ガードしない。
// 表示中はゲームをポーズし、縦に戻したら元の状態へ復帰(メニュー等で元々ポーズ中なら据え置き)。
const OrientationGuard: React.FC = () => {
  const [show, setShow] = useState(false);
  const wasPausedRef = useRef(false);
  const pausedByGuardRef = useRef(false);

  useEffect(() => {
    const isTouch = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const check = () => setShow(isTouch() && window.innerWidth > window.innerHeight);
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

  useEffect(() => {
    const store = useGameStore.getState();
    if (show) {
      if (!pausedByGuardRef.current) {
        wasPausedRef.current = store.isPaused;
        pausedByGuardRef.current = true;
        if (!store.isPaused) store.setPaused(true); // ガードが入れたポーズ
      }
    } else if (pausedByGuardRef.current) {
      pausedByGuardRef.current = false;
      if (!wasPausedRef.current) store.setPaused(false); // ガードが入れた分だけ解除
    }
  }, [show]);

  if (!show) return null;
  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-4 bg-black text-white"
      style={{ touchAction: 'none' }}
    >
      <div className="text-5xl" style={{ transform: 'rotate(90deg)' }}>📱</div>
      <div className="text-lg font-bold tracking-wide">画面を縦にしてください</div>
      <div className="text-sm text-white/55">Please rotate your device to portrait</div>
    </div>
  );
};

export default OrientationGuard;
