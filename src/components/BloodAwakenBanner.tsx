import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { rafTimeout } from '../utils/rafTimeout';

// ★B10 血の覚醒(社長指示2026-10-16「覚醒時、覚醒の英語を表示」): 覚醒に入った瞬間だけ、自機の上に英字「AWAKENING」を一拍出す。
// 題字の運動は銘打ち(WallInscription)と同じ(字間が 0.34em→0.14em に締まる・Georgia 明朝)。色は覚醒の体と同じ朱。全長 1.8秒(消え 0.6秒)。
// 購読は bloodAwakenStartedAt(覚醒に入った時だけ変わる)と bloodAwakenUntil の有無だけ=毎フレームの再レンダ無し。
const TOTAL_MS = 1800;
const FADE_MS = 600;
const TITLE_DELAY_MS = 60, TITLE_MS = 520;
const COLOR = '#ff2a3a';

export const BloodAwakenBanner = () => {
  const startedAt = useGameStore(s => s.player.bloodAwakenStartedAt);
  const awake = useGameStore(s => (s.player.bloodAwakenUntil ?? 0) > s.gameTime);
  const seen = useRef<number | undefined>(startedAt); // 出撃直後・リトライ時の値は出さない(変わった時だけ)
  const [shownKey, setShownKey] = useState<number | null>(null);
  useEffect(() => {
    if (startedAt === undefined || startedAt === seen.current) return;
    seen.current = startedAt;
    if (!awake) return;
    setShownKey(Date.now());
    // ★描画の周期でも進める(rafTimeout・コード監査2026-10-23 UI B-2⑥)。尺は従来どおり。
    return rafTimeout(() => setShownKey(null), TOTAL_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt]);
  if (shownKey === null) return null;
  return (
    <div
      key={shownKey}
      aria-hidden
      className="absolute pointer-events-none flex flex-col items-center"
      style={{
        top: '42%', left: '50%', transform: 'translate(-50%, -50%)',
        animation: `wall-insc-fade-out ${FADE_MS}ms ease-in both`,
        animationDelay: `${TOTAL_MS - FADE_MS}ms`,
      }}
    >
      <div
        className="text-[30px] font-bold whitespace-nowrap"
        style={{
          fontFamily: 'Georgia, "Hiragino Mincho ProN", serif',
          color: COLOR,
          textShadow: `0 0 20px ${COLOR}88, 0 0 2px #2a0306, 0 2px 6px rgba(0,0,0,0.95)`,
          opacity: 0,
          animation: `wall-insc-title ${TITLE_MS}ms ease-out both`,
          animationDelay: `${TITLE_DELAY_MS}ms`,
        }}
      >
        AWAKENING
      </div>
    </div>
  );
};
