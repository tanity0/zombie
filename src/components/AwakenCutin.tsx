// SKILL_BUILD_REDESIGN.md §24: 覚醒(スキルLv3到達)のHUDカットイン帯。
// トンマナはBossCutin.tsx(黒帯+金文字)を踏襲するが、**表示中もゲームは止めない**軽量版
// (attention/フリーズ演出システムには乗らない=WallBand.tsxと同じ「非ブロッキング帯」の型)。
// 尺は src/utils/awakenCutin.ts(定数)、発火・多重デバウンスは gameStore.ts(selectUpgrade)側で
// 確定済み。ここは store の `awakenCutin`(単一オブジェクト・キューではない)が変わるたびに
// 1回だけ表示するだけ=React再レンダー規律(毎フレーム書き換わらないイベント値の購読)を守る。
import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { AWAKEN_CUTIN_FADEIN_MS, AWAKEN_CUTIN_FADEOUT_MS, AWAKEN_CUTIN_HOLD_MS, AWAKEN_CUTIN_MS } from '../utils/awakenCutin';

const AwakenCutin: React.FC = () => {
  const cutin = useGameStore(s => s.awakenCutin);
  const [shown, setShown] = useState<{ skillName: string } | null>(null);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    if (!cutin) return;
    setShown({ skillName: cutin.skillName });
    setFadeOut(false);
    const t1 = setTimeout(() => setFadeOut(true), AWAKEN_CUTIN_FADEIN_MS + AWAKEN_CUTIN_HOLD_MS);
    const t2 = setTimeout(() => setShown(null), AWAKEN_CUTIN_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [cutin]);

  if (!shown) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[92] flex justify-center"
      style={{ top: 'calc(15% + env(safe-area-inset-top))' }}
    >
      <style>{`
        @keyframes awakenCutinScale {
          0% { transform: scale(1.28); }
          55% { transform: scale(0.97); }
          100% { transform: scale(1.0); }
        }
      `}</style>
      <div
        className="flex flex-col items-center gap-1 px-8 py-3"
        style={{
          opacity: fadeOut ? 0 : 1,
          transition: `opacity ${fadeOut ? AWAKEN_CUTIN_FADEOUT_MS : AWAKEN_CUTIN_FADEIN_MS}ms ease-out`,
          background: 'linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(4,4,2,0.8) 16%, rgba(4,4,2,0.8) 84%, rgba(0,0,0,0) 100%)',
          borderTop: '1px solid rgba(255,215,0,0.7)',
          borderBottom: '1px solid rgba(255,215,0,0.7)',
          animation: 'awakenCutinScale 260ms cubic-bezier(0.16,1,0.3,1) both',
        }}
      >
        <div
          className="font-bold tracking-[0.32em]"
          style={{
            fontFamily: 'Georgia, "Hiragino Mincho ProN", serif',
            fontSize: 'clamp(20px, 5.4vw, 34px)',
            color: '#ffe58a',
            textShadow: '0 0 18px rgba(255,215,0,0.85), 0 2px 0 rgba(120,80,0,0.9), 0 0 40px rgba(255,215,0,0.4)',
          }}
        >
          覚醒
        </div>
        <div
          className="text-center font-semibold whitespace-nowrap"
          style={{
            fontFamily: 'Georgia, "Hiragino Mincho ProN", serif',
            fontSize: 'clamp(14px, 3.6vw, 20px)',
            color: '#fff7e0',
            letterSpacing: '0.08em',
            textShadow: '0 1px 3px rgba(0,0,0,0.9)',
          }}
        >
          {shown.skillName}
        </div>
      </div>
    </div>
  );
};

export default AwakenCutin;
