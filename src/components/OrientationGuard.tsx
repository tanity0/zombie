import React, { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { isLandscapeBlocked } from '../utils/inputDevice';

// 縦持ち専用ガード: タッチ端末を横向きにしたら「縦にしてください」を全面表示してプレイを止める。
// 本作は縦持ち前提のレイアウト/遠近なので、横向きの崩れを丸ごと無効化する(社長指示)。
// PC(非タッチ)は横向きのウィンドウ＋マウスで遊ぶため対象外=ガードしない。
// タッチ画面つきのPC(マウス/トラックパッドがある)も PC として扱う=ガードしない(research/PC_SUPPORT.md・isTouchPrimary)。
// タブレット(画面の短い辺が600以上)はタッチだけでも横持ちで遊べる(PC_SUPPORT.md §13・isLandscapeBlocked)。止めるのはスマホだけ。
// 表示中はゲームをポーズし、縦に戻したら元の状態へ復帰(メニュー等で元々ポーズ中なら据え置き)。
const OrientationGuard: React.FC = () => {
  const [show, setShow] = useState(false);
  const wasPausedRef = useRef(false);
  const pausedByGuardRef = useRef(false);

  useEffect(() => {
    // ★社長報告2026-10-16「守護霊のコメント/名前の入力でソフトキーボードが出ると『画面を縦にしてください』が出る」:
    // キーボードが上がると innerHeight だけ縮んで横長に見える。**文字入力中は向きを判定しない**(入力が終われば再判定)。
    // 併せて、判定は窓の寸法ではなく**画面の向き**(screen.orientation)が取れる端末ではそちらを使う(キーボードの影響を受けない)。
    const typing = () => {
      const a = document.activeElement as HTMLElement | null;
      return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
    };
    const landscapeNow = () => {
      const t = window.screen?.orientation?.type;
      if (typeof t === 'string') return t.startsWith('landscape');
      return window.innerWidth > window.innerHeight;
    };
    const check = () => setShow(isLandscapeBlocked() && !typing() && landscapeNow());
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    document.addEventListener('focusin', check);
    document.addEventListener('focusout', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
      document.removeEventListener('focusin', check);
      document.removeEventListener('focusout', check);
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
