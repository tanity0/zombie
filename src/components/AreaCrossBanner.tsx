import { useGameStore } from '../store/gameStore';
import { AREA_ZONE_NAMES } from '../utils/enemyUtils';

// ★B1(research/THEONE_ROUND2.md §1・社長「跨いだ時だけ、画面いっぱいの境界線と区画名を一瞬表示」)。
// 区域を跨いだ瞬間(深い側・浅い側とも=社長の言葉に方向の区別は無い)、**銘打ち(WallInscription)と同じ題字の運動**で名前だけを出す。
// 場所だけ銘打ち(58%)より上の 42%: 銘打ちは初回だけの4秒の儀式だが、こちらは跨ぐたびに出るので自機を文字で隠さない(検収品質監査 A-3)。
// 線は世界側の弧1本で足りているので HUD 側の横罫は出さない(2本出すと十字の照準になる=検収クリエイティブ監査)。小さな英字も無し。
// 数字は銘打ちと同じ(開始 350ms・600ms で字間が 0.34em→0.14em・26px・消え 800ms)。違うのは全長だけ(2.0秒・銘打ちは4秒)。
// 弧(1.3秒)が走り切る 350ms に名前が出て、弧が消えた後に名前だけ一拍残る。初回踏破は銘打ちが出るので譲る(fx.banner=false)。
// 同じ輪を数秒内に再び跨いだ時は出さない(弧の線だけ)。色は UI の琥珀(--menu-accent #ffb340)。購読は areaCrossFx だけ。
const TOTAL_MS = 2000;
const FADE_MS = 800;
const TITLE_DELAY_MS = 350, TITLE_MS = 600;
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
        top: '42%', left: '50%', transform: 'translate(-50%, -50%)', // 自機(約56%)の上。銘打ち(58%)と同じ高さだと毎回自機が文字で隠れる(検収品質監査 A-3)
        animation: `wall-insc-fade-out ${FADE_MS}ms ease-in both`,
        animationDelay: d(TOTAL_MS - FADE_MS),
      }}
    >
      <div
        className="text-[26px] font-bold whitespace-nowrap"
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
    </div>
  );
};
