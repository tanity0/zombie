// PACING_PUZZLE.md §5.17 M14 演出仕様(v0.25.1499): 中格=帯。
// 深さの「予告(この先——{区域名})」と、宿敵出現バナー(M13載せ替え)の2用途。
// gameTime(スロー/ヒットストップ)に影響されないよう実時間(Date.now)基準で表示・非表示を切り替える。
// イベント駆動(text/until変化時のみ)=毎フレーム再レンダーなし(CLAUDE.mdのReact規律)。
import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';

export default function WallBand() {
  const text = useGameStore(s => s.wallBandText);
  const until = useGameStore(s => s.wallBandUntil);
  const color = useGameStore(s => s.wallBandColor);
  const [shown, setShown] = useState<{ text: string; color: string } | null>(null);

  useEffect(() => {
    if (!text || until <= Date.now()) return;
    setShown({ text, color });
    const t = setTimeout(() => setShown(null), Math.max(0, until - Date.now()));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, until]);

  if (!shown) return null;
  const isGold = shown.color === 'gold';

  return (
    <div
      className="wall-band absolute pointer-events-none"
      style={{
        top: 'calc(11% + env(safe-area-inset-top))',
        left: '50%',
        maxWidth: 'min(86vw, 480px)',
      }}
    >
      <div
        className="px-5 py-1.5 text-[14px] font-semibold tracking-[0.12em] whitespace-nowrap"
        style={{
          fontFamily: 'Georgia, "Hiragino Mincho ProN", serif',
          color: isGold ? '#ffe58a' : '#f4f7ff',
          background: 'linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.62) 18%, rgba(0,0,0,0.62) 82%, rgba(0,0,0,0) 100%)',
          borderTop: `1px solid ${isGold ? 'rgba(255,215,0,0.55)' : 'rgba(255,255,255,0.35)'}`,
          borderBottom: `1px solid ${isGold ? 'rgba(255,215,0,0.55)' : 'rgba(255,255,255,0.35)'}`,
          textShadow: '0 1px 3px rgba(0,0,0,0.9)',
          textAlign: 'center',
        }}
      >
        {shown.text}
      </div>
    </div>
  );
}
