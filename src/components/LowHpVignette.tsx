import { useGameStore } from '../store/gameStore';

const LOW_HP_THRESHOLD = 20;
// ?lowhp=0 診断トグル(既存): DOM移行後もこのフラグで完全OFFにできる。
const LOW_HP_DISABLED = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('lowhp') === '0';

// 瀕死(HP≤20)の赤ビネット。旧・全画面Pixiスプライト(WebGLフィル)からDOM/CSSへ移設して
// 実機の塗り律速を回避(v0.25.1560)。心拍脈動はCSS @keyframes=Reactは再レンダしない。
// 購読は health<=20 の派生boolだけ=閾値を跨いだ時のみ再レンダ(CLAUDE.md 再レンダ規律)。
export const LowHpVignette = () => {
  const lowHp = useGameStore(s => s.player.health > 0 && s.player.health <= LOW_HP_THRESHOLD);
  if (LOW_HP_DISABLED || !lowHp) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        background:
          'radial-gradient(ellipse at center, rgba(120,0,0,0) 30%, rgba(150,0,0,0.40) 60%, rgba(190,0,0,0.92) 100%)',
        animation: 'lowhp-heartbeat 1100ms ease-in-out infinite',
        willChange: 'opacity',
      }}
    />
  );
};
