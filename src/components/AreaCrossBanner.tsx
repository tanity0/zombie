import { useGameStore } from '../store/gameStore';
import { AREA_ZONE_NAMES } from '../utils/enemyUtils';

// ★B1(research/THEONE_ROUND2.md §1・社長「跨いだ時だけ、画面いっぱいの境界線と区画名を一瞬表示」)。
// 深い側へ区域を跨いだ瞬間だけ、**銘打ち(WallInscription)と同じ場所・同じ書体の運動**で名前を一瞬出す(題字の出方を家で1つにする):
// 線1本(220px・中央から伸びる)→名前(字間が 0.34em→0.14em に締まる・Georgia 明朝)→小さな英字 ENTERING。
// 全長1600ms。世界の弧(pixiScene・1300ms)が消え切った後、名前だけ一拍残って消える。
// 初回踏破は銘打ちが4秒出るので帯は譲る(fx.banner=false)。浅い側へ戻る時も出さない(弧の線だけ)。
// 色は UI の琥珀(--menu-accent #ffb340)。購読は areaCrossFx だけ=毎フレームの再レンダ無し。
const TOTAL_MS = 1600;
const FADE_MS = 300;
const LINE_MS = 400;
const TITLE_DELAY_MS = 300, TITLE_MS = 500;
const SUB_DELAY_MS = 700, SUB_MS = 350;
const COLOR = '#ffb340';

export const AreaCrossBanner = () => {
  const fx = useGameStore(s => s.areaCrossFx);
  if (!fx || !fx.banner) return null;
  const now = Date.now();
  const since = Math.max(0, now - fx.at);
  if (since >= TOTAL_MS) return null;
  const name = AREA_ZONE_NAMES[fx.zoneIdx] ?? '';
  // 開いた時刻から数えた負の delay=レンダが遅れても消える時刻が揃う(HitRetaliationCue と同じ作法)。
  const d = (delayMs: number) => `${delayMs - since}ms`;
  return (
    <div
      key={fx.at}
      aria-hidden
      className="absolute pointer-events-none flex flex-col items-center"
      style={{
        top: '58%', left: '50%', transform: 'translate(-50%, -50%)',
        animation: `wall-insc-fade-out ${FADE_MS}ms ease-in both`,
        animationDelay: d(TOTAL_MS - FADE_MS),
      }}
    >
      <div
        className="h-[1px]"
        style={{
          width: 220,
          background: `linear-gradient(90deg, transparent, ${COLOR}, transparent)`,
          animation: `wall-insc-line ${LINE_MS}ms ease-out both`,
          animationDelay: d(0),
        }}
      />
      <div
        className="mt-2 text-[24px] font-bold whitespace-nowrap"
        style={{
          fontFamily: 'Georgia, "Hiragino Mincho ProN", serif',
          color: COLOR,
          textShadow: `0 0 18px ${COLOR}66, 0 2px 6px rgba(0,0,0,0.9)`,
          animation: `wall-insc-title ${TITLE_MS}ms ease-out both`,
          animationDelay: d(TITLE_DELAY_MS),
        }}
      >
        {name}
      </div>
      <div
        className="mt-1 text-[11px] tracking-[0.42em] whitespace-nowrap"
        style={{ color: COLOR, animation: `wall-insc-sub ${SUB_MS}ms ease-out both`, animationDelay: d(SUB_DELAY_MS) }}
      >
        ENTERING
      </div>
    </div>
  );
};
