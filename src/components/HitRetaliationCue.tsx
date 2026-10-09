import { useGameStore } from '../store/gameStore';

// ★被弾反撃の「知らせ」(research/HIT_RETALIATION.md §5・社長「食らった方向の画面を赤グラデ(HPピンチの時の点滅効果)で光らせて知らせる」)。
// 受付の窓が開いている間だけ、**食らった方向の画面の縁**から赤が滲む。瀕死の縁取り(LowHpVignette)の**片側版**:
//  - 色は瀕死の縁取りと同じ家族(白い芯は持たない)。中心は画面の外=画面内には「縁から滲む」部分だけが見える。
//  - **縁から離れない**。動きは縁へ吸い込まれるように縮む(位置は動かさない)。画面の中に赤い塊が浮くと、
//    敵の赤い予告(カウンターの対象)と見分けがつかなくなるため(クリエイティブ監査2026-10-09 #1)。
//  - 斜めから食らった時は、縦の縁と横の縁の2枚を向きの成分の強さで重ねる=角で自然にL字になる(回した1本の棒にしない)。
//  - 濃さは瀕死の縁取りと同じ「心拍」の2拍。消え切る瞬間=受付の締め切り。
// 既存の全画面フラッシュ(赤・200ms)と瀕死の縁取りは消さない。この絵はその手前(GameHUD で LowHpVignette の後)に描く。
//
// 再レンダ規律: 購読は窓の記録(開閉の時にしか参照が変わらない)だけ。動きは CSS アニメーション(開いた時刻から数えた
// 負の delay で、レンダが多少遅れても消える時刻は窓の閉じる時刻に揃う)。毎フレームの購読は無い。
const EDGE_GRADIENT_STOPS = 'rgba(255,70,50,0.80) 0%, rgba(190,0,0,0.60) 35%, rgba(120,0,0,0.25) 65%, rgba(120,0,0,0) 100%';
// 画面の外に置く中心の距離と、滲みの楕円の大きさ(縁沿い × 縁から内へ)。
const EDGE_OUTSET_VMIN = 22;
const EDGE_ALONG_VMIN = 70;
const EDGE_DEPTH_VMIN = 48;
// これより弱い成分の縁は描かない(真横から食らった時に上下の縁がうっすら出ない)。
const EDGE_MIN_WEIGHT = 0.25;

export const HitRetaliationCue = () => {
  const win = useGameStore(s => s.hitRetaliation);
  if (!win) return null;
  const now = Date.now();
  if (now >= win.closesAt) return null; // 閉じた後に再マウントされても出さない
  const dur = Math.max(1, win.closesAt - win.openedAt);
  const delay = -Math.max(0, now - win.openedAt);
  // 画面の矩形の縁のうち、窓の向き(中心から食らった方向)が突き当たる点。縦横比を含めて測る。
  const w = typeof window !== 'undefined' ? Math.max(1, window.innerWidth) : 1;
  const h = typeof window !== 'undefined' ? Math.max(1, window.innerHeight) : 1;
  const c = win.dirX, s = win.dirY;
  const t = Math.min(Math.abs(c) > 1e-4 ? w / 2 / Math.abs(c) : Infinity, Math.abs(s) > 1e-4 ? h / 2 / Math.abs(s) : Infinity);
  const px = Math.max(0, Math.min(100, (0.5 + (c * t) / w) * 100));
  const py = Math.max(0, Math.min(100, (0.5 + (s * t) / h) * 100));
  const anim = `${dur}ms ${delay}ms both`;
  const edges: { key: string; weight: number; at: string; ellipse: string; origin: string }[] = [];
  if (Math.abs(c) >= EDGE_MIN_WEIGHT) {
    const right = c > 0;
    edges.push({
      key: right ? 'r' : 'l', weight: Math.abs(c),
      at: `${right ? `calc(100% + ${EDGE_OUTSET_VMIN}vmin)` : `-${EDGE_OUTSET_VMIN}vmin`} ${py}%`,
      ellipse: `${EDGE_DEPTH_VMIN + EDGE_OUTSET_VMIN}vmin ${EDGE_ALONG_VMIN}vmin`,
      origin: `${right ? '100%' : '0%'} ${py}%`,
    });
  }
  if (Math.abs(s) >= EDGE_MIN_WEIGHT) {
    const bottom = s > 0;
    edges.push({
      key: bottom ? 'b' : 't', weight: Math.abs(s),
      at: `${px}% ${bottom ? `calc(100% + ${EDGE_OUTSET_VMIN}vmin)` : `-${EDGE_OUTSET_VMIN}vmin`}`,
      ellipse: `${EDGE_ALONG_VMIN}vmin ${EDGE_DEPTH_VMIN + EDGE_OUTSET_VMIN}vmin`,
      origin: `${px}% ${bottom ? '100%' : '0%'}`,
    });
  }
  return (
    <div key={win.openedAt} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {edges.map(e => (
        <div key={e.key} className="absolute inset-0" style={{ opacity: Math.min(1, e.weight * 1.15) }}>
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(${e.ellipse} at ${e.at}, ${EDGE_GRADIENT_STOPS})`,
              transformOrigin: e.origin,
              // 縮み(縁へ吸い込まれる)は減速して止まる(慣性)。濃さは心拍の2拍で、最後に消え切る。
              animation: `hit-retaliate-shrink ${anim} cubic-bezier(0.16, 0.8, 0.3, 1), hit-retaliate-beat ${anim} linear`,
              willChange: 'transform, opacity',
            }}
          />
        </div>
      ))}
    </div>
  );
};
