import { useGameStore } from '../store/gameStore';
import { lowHpTier, LOW_HP_PULSE_MS, lowHpBeatStops } from '../utils/lowHpPulse';

// 段ごとの鼓動の keyframes(拍の形は ms 固定・休止だけ段で縮む)。3段ぶんを1度だけ文字列にする(再レンダ規律: 計算は module 時のみ)。
const BEAT_CSS = ([1, 2, 3] as const).map(t =>
  `@keyframes lowhp-beat-${t}{${lowHpBeatStops(LOW_HP_PULSE_MS[t]).map(k => `${k.p.toFixed(2)}%{opacity:${k.o}}`).join('')}}`).join('\n');

// ?lowhp=0 診断トグル(既存): DOM移行後もこのフラグで完全OFFにできる。
const LOW_HP_DISABLED = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('lowhp') === '0';

// 瀕死(HP≤20)の赤ビネット。旧・全画面Pixiスプライト(WebGLフィル)からDOM/CSSへ移設して
// 実機の塗り律速を回避(v0.25.1560)。心拍脈動はCSS @keyframes=Reactは再レンダしない。
// ★v0.25.5069(社長裁定2026-10-16・まとめHTML C3「はい」): 縁の滲みを濃く(内側へ広く・外縁は不透明まで)、
//   脈の速さを体力の段(utils/lowHpPulse)に合わせる=HPが減るほど速い。目の周期は**心音の1拍÷再生速度**(1410/1195/1044ms)=\n//   画面の心臓と音の心臓が同じテンポで打つ(クリエイティブ監査#1)。拍の形はmsで固定し休止だけ縮む(同#4)。
// 購読は段(0..3)の派生primitiveだけ=段を跨いだ時のみ再レンダ(CLAUDE.md 再レンダ規律)。
export const LowHpVignette = () => {
  const tier = useGameStore(s => lowHpTier(s.player.health));
  if (LOW_HP_DISABLED || tier === 0) return null;
  const period = LOW_HP_PULSE_MS[tier];
  return (
    <>
      <style>{BEAT_CSS}</style>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(120,0,0,0) 24%, rgba(150,0,0,0.55) 54%, rgba(200,0,0,1.0) 100%)',
          animation: `lowhp-beat-${tier} ${period}ms ease-in-out infinite`,
          willChange: 'opacity',
        }}
      />
    </>
  );
};
