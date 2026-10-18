// research/NEW_GUNS.md §4: スキャンセンサーの「拍」を画面の下の小さな目盛りで見せる。
// 拍は持ち替えと関係なく 1.2 秒ごとに回るので、スキャンセンサーを**持っている間**(構えていなくても)出す
// =拍に合わせて持ち替える遊び方の手がかり。構えている時は明るく、他の銃を構えている時は沈める。
// 形: 左から伸びる線(拍に近づくほど速く・明るく・太く)+「拍の直前300ms」を示す目盛り1本。
// 拍の瞬間は線が中央へ吸い込まれて弾け(120ms)、次の線は左からにじみ出る(1フレームで0に戻さない)。
// ★React の再描画は「持っている/構えている」が変わった時だけ(boolean 購読)。毎フレームの動きは
// requestAnimationFrame が DOM の style を直接書く(PerfOverlay と同じ型=CLAUDE.md React re-render discipline)。
// ★持っていない時は何も描かない(DOM を1つも足さない=スマホの配置は1pxも動かない)。
import React from 'react';
import { useGameStore } from '../store/gameStore';
import { SCAN_WEAPON_KEY, SCAN_BEAT_MS, scanBeatPhase } from '../utils/scanSensor';

const BAR_W = 140;
const LINE_H = 4;          // 線の太さ(拍の直前で 7px まで太る)
const PRE_MS = 300;        // 直前を示す目盛りの位置(拍の300ms前)
const COLLAPSE_MS = 120;   // 拍の瞬間に中央へ吸い込まれる時間
const BLEED_MS = 220;      // 次の線がにじみ出る時間
const PHOSPHOR = '159,216,208'; // #9fd8d0(スキャンの燐光)
/** 伸び方: 拍に近づくほど速い(加速)。 */
const fillOf = (ph: number): number => Math.pow(ph, 1.6);

const ScanBeatMeter: React.FC = () => {
  const owns = useGameStore(s => s.player.weapons.some(w => w.key === SCAN_WEAPON_KEY));
  const holding = useGameStore(s => {
    const w = s.player.weapons.find(x => x.id === s.player.activeWeaponId);
    return !!w && w.key === SCAN_WEAPON_KEY;
  });
  const fillRef = React.useRef<HTMLDivElement>(null);
  const collapseRef = React.useRef<HTMLDivElement>(null);
  const popRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!owns) return;
    let raf = 0;
    let prevPhase = -1;
    let beatAt = -1e9;
    const loop = () => {
      const gt = useGameStore.getState().gameTime;
      const ph = scanBeatPhase(gt);
      if (prevPhase >= 0 && ph < prevPhase) beatAt = performance.now(); // 拍を跨いだ
      prevPhase = ph;
      const since = performance.now() - beatAt;
      // 伸びる線: 拍に近づくほど明るく太く。拍の後は左からにじみ出る(不透明度が0から立ち上がる)。
      const f = fillOf(ph);
      const near = ph * ph;
      const bleed = Math.min(1, Math.max(0, (ph * SCAN_BEAT_MS) / BLEED_MS));
      const thick = (LINE_H + 3 * near) / LINE_H;
      if (fillRef.current) {
        fillRef.current.style.transform = `scaleX(${f.toFixed(3)}) scaleY(${thick.toFixed(3)})`;
        fillRef.current.style.opacity = ((0.45 + 0.55 * near) * bleed * (2 - bleed)).toFixed(3);
      }
      // 拍の瞬間: 満ちた線が中央へ吸い込まれる(加速しながら縮む)→中央で弾ける。
      const ct = Math.min(1, Math.max(0, since / COLLAPSE_MS));
      if (collapseRef.current) {
        const k = 1 - ct * ct;
        collapseRef.current.style.transform = `scaleX(${k.toFixed(3)}) scaleY(${(1 + 0.75 * k).toFixed(3)})`;
        collapseRef.current.style.opacity = (ct < 1 ? 1 : 0).toString();
      }
      if (popRef.current) {
        const pt = Math.min(1, Math.max(0, (since - COLLAPSE_MS * 0.6) / 260));
        const on = since >= COLLAPSE_MS * 0.6 && pt < 1;
        popRef.current.style.opacity = on ? ((1 - pt) * (1 - pt)).toFixed(3) : '0';
        popRef.current.style.transform = `translate(-50%, -50%) scale(${(0.4 + 1.4 * (1 - (1 - pt) * (1 - pt))).toFixed(3)})`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [owns]);
  if (!owns) return null;
  const preX = fillOf(1 - PRE_MS / SCAN_BEAT_MS) * 100;
  return (
    <div
      className="pointer-events-none absolute left-1/2 -translate-x-1/2"
      style={{ bottom: 'max(calc(env(safe-area-inset-bottom) + 12px), 20px)', width: BAR_W, opacity: holding ? 1 : 0.42, transition: 'opacity 220ms ease-out' }}
      aria-hidden
    >
      <div className="relative" style={{ height: 10 }}>
        {/* 地の線 */}
        <div className="absolute inset-x-0" style={{ top: 3, height: LINE_H, background: `rgba(${PHOSPHOR},0.16)` }} />
        {/* 拍の直前300msを示す目盛り(1本だけ) */}
        <div className="absolute" style={{ left: `${preX}%`, top: 0, width: 1, height: 10, marginLeft: -0.5, background: `rgba(${PHOSPHOR},0.55)` }} />
        {/* 伸びる線 */}
        <div
          ref={fillRef}
          className="absolute left-0"
          style={{ top: 3, height: LINE_H, width: '100%', transformOrigin: 'left center', background: `linear-gradient(90deg, rgba(${PHOSPHOR},0.35), rgba(${PHOSPHOR},1) 80%, rgba(255,255,255,1))`, transform: 'scaleX(0)', opacity: 0 }}
        />
        {/* 拍の瞬間に中央へ吸い込まれる線 */}
        <div
          ref={collapseRef}
          className="absolute left-0"
          style={{ top: 3, height: LINE_H, width: '100%', transformOrigin: 'center center', background: `linear-gradient(90deg, rgba(${PHOSPHOR},0.5), rgba(255,255,255,1) 50%, rgba(${PHOSPHOR},0.5))`, transform: 'scaleX(0)', opacity: 0 }}
        />
        {/* 中央で弾ける光 */}
        <div
          ref={popRef}
          className="absolute"
          style={{ left: '50%', top: 5, width: 18, height: 18, borderRadius: 9999, background: `radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(${PHOSPHOR},0.45) 40%, rgba(${PHOSPHOR},0) 70%)`, opacity: 0, transform: 'translate(-50%, -50%) scale(0.4)' }}
        />
      </div>
    </div>
  );
};

export default ScanBeatMeter;
