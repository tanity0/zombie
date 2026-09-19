// PACING_PUZZLE.md §5.17 M14 演出仕様(v0.25.1499): 大格=銘打ち(儀式=深さ踏破/ランク到達、REVENGE)。
// キュー(store.wallEventQueue)の先頭を約4秒表示してから dequeueWallEvent() で次へ進む。
// スロー・停止・ヒットストップなし=実時間(setTimeout)で進行。Pixi無関与・強glow不使用(負荷方針どおり)。
import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';

const TOTAL_MS = 4000;
const FADE_MS = 800;
const LINE_MS = 400;
const TITLE_DELAY_MS = 350, TITLE_MS = 600;
const SUB_DELAY_MS = 800, SUB_MS = 400;
const GOLD_DELAY_MS = 1500, GOLD_MS = 500;

export default function WallInscription() {
  const current = useGameStore(s => s.wallEventQueue[0]);
  const [activeId, setActiveId] = useState<number | null>(null);

  useEffect(() => {
    if (!current) { setActiveId(null); return; }
    setActiveId(current.id);
    const t = setTimeout(() => useGameStore.getState().dequeueWallEvent(), TOTAL_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  if (!current || activeId !== current.id) return null;

  return (
    <div
      className="absolute pointer-events-none flex flex-col items-center"
      style={{
        top: '58%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        animation: `wall-insc-fade-out ${FADE_MS}ms ease-in forwards`,
        animationDelay: `${TOTAL_MS - FADE_MS}ms`,
      }}
    >
      <div
        className="h-[1px]"
        style={{
          width: 220,
          background: `linear-gradient(90deg, transparent, ${current.color}, transparent)`,
          animation: `wall-insc-line ${LINE_MS}ms ease-out both`,
        }}
      />
      <div
        className="mt-2 text-[26px] font-bold whitespace-nowrap"
        style={{
          fontFamily: 'Georgia, "Hiragino Mincho ProN", serif',
          color: current.color,
          textShadow: `0 0 18px ${current.color}66, 0 2px 6px rgba(0,0,0,0.9)`,
          opacity: 0,
          animation: `wall-insc-title ${TITLE_MS}ms ease-out both`,
          animationDelay: `${TITLE_DELAY_MS}ms`,
        }}
      >
        {current.title}
      </div>
      <div
        className="mt-1 text-[11px] tracking-[0.42em] whitespace-nowrap"
        style={{
          color: current.color,
          opacity: 0,
          animation: `wall-insc-sub ${SUB_MS}ms ease-out both`,
          animationDelay: `${SUB_DELAY_MS}ms`,
        }}
      >
        {current.sub}
      </div>
      {current.gold != null && (
        <div
          className="mt-2 text-[15px] font-bold"
          style={{
            color: '#ffd700',
            opacity: 0,
            animation: `wall-insc-gold ${GOLD_MS}ms ease-out both`,
            animationDelay: `${GOLD_DELAY_MS}ms`,
          }}
        >
          +{current.gold}G
        </div>
      )}
    </div>
  );
}
