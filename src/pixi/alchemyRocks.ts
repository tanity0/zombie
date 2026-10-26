// 錬金砲の石(Enemy.alchemyStoneStage 1〜3)を「敵の体にくっついた金の岩の塊」として見せる素材と配置
// (社長指示2026-10-27「的に金の岩が塊としてくっついていき、溜まり具合で大きくなっていく」)。
// 視覚のみ=判定・ダメージ・起爆の範囲には一切触れない(段数は store の値を読むだけ)。
//
// 岩の絵は起動時に小さなキャンバスへ1ドットずつ塗って焼く(にじみ無し・敵のドットの整数倍で出す・回さない)。
// 塊は「芯の岩+欠片」。段が上がるたびに主役の岩が1つ撃った側から飛んで来て体にめり込み、欠片がその場へ飛び散って付く。
// 古い岩は太らない(新しい岩が乗って塊が大きくなる)。3段目(満タン)は割れ目から光が漏れて脈打ち、低く震える。
import { Texture } from 'pixi.js';

/** 岩の絵の寸法(px)。0=欠片 / 1=中 / 2=芯。 */
export const ALCHEMY_ROCK_SIZES = [8, 12, 18] as const;
const VARIANTS = 3;

const lcg = (seed: number) => {
  let s = (seed >>> 0) || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
};

const hex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
// 金の色の段(明→暗)。光は世界で1つ=左上から。
const TONE = { hi: hex('#f6d564'), mid: hex('#d29e2a'), low: hex('#94621a'), deep: hex('#5e3c0c') };
const OUTLINE = hex('#3a2305');
const SPECK = hex('#6e4c1c');
const SHINE = hex('#fff3c0');

interface RockArt { tex: Texture; crack: Texture }
let rockArt: RockArt[][] | null = null;
let dustTex: Texture | null = null;

const canvasTex = (N: number, paint: (img: ImageData) => void): Texture => {
  const canvas = document.createElement('canvas');
  canvas.width = N; canvas.height = N;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(N, N);
  paint(img);
  ctx.putImageData(img, 0, 0);
  const tex = Texture.from(canvas);
  tex.source.scaleMode = 'nearest';
  return tex;
};

const drawRock = (N: number, seed: number): RockArt => {
  const rnd = lcg(seed);
  const cx = N / 2, cy = N / 2 + 0.3;
  // 直線の辺が見える5〜6角。下側(体に付く面)は平らぎみ。
  const n = 5 + Math.floor(rnd() * 2);
  const pts: [number, number][] = [];
  const a0 = rnd() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.7;
    const r = N * (0.36 + rnd() * 0.12) * (Math.sin(a) > 0.5 ? 0.85 : 1);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.88]);
  }
  const inside = (x: number, y: number) => {
    let c = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const mask: boolean[] = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) mask.push(inside(x + 0.5, y + 0.5));
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && mask[y * N + x];
  // 面: 各辺の向きで面を割り、左上を向く面ほど明るい。中心の台地は中間。
  const faceAng = pts.map((p, i) => { const q = pts[(i + 1) % n]; return Math.atan2((p[1] + q[1]) / 2 - cy, (p[0] + q[0]) / 2 - cx); });
  const crack = new Set<number>();
  // 割れ線: 縁の1点から中心へ向けて半分ほど(2ドット以上)。
  {
    const a = a0 + rnd() * Math.PI * 2;
    const len = Math.max(2, Math.round(N * 0.32));
    for (let k = 0; k < len; k++) {
      const t = k / len;
      const x = Math.round(cx + Math.cos(a) * N * 0.4 * (1 - t) + (k % 2 ? 0 : (rnd() - 0.5)));
      const y = Math.round(cy + Math.sin(a) * N * 0.36 * (1 - t));
      if (at(x, y)) crack.add(y * N + x);
    }
  }
  const specks = new Set<number>();
  for (let k = 0; k < (N >= 12 ? 2 : 1); k++) {
    const x = Math.floor(cx + (rnd() - 0.3) * N * 0.4), y = Math.floor(cy + (rnd() - 0.2) * N * 0.35);
    if (at(x, y)) specks.add(y * N + x);
  }
  const lx = -0.6, ly = -0.8;
  const tex = canvasTex(N, img => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (!mask[i]) continue;
      let c: [number, number, number];
      const outR = !at(x + 1, y), outB = !at(x, y + 1);
      if (outR || outB) c = OUTLINE; // 輪郭は影側(下・右)だけ
      else if (crack.has(i)) c = OUTLINE;
      else if (specks.has(i)) c = SPECK;
      else {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const d = Math.hypot(dx, dy) / (N * 0.42);
        let face = 0; let best = 9;
        const a = Math.atan2(dy, dx);
        for (let f = 0; f < n; f++) { const da = Math.abs(Math.atan2(Math.sin(a - faceAng[f]), Math.cos(a - faceAng[f]))); if (da < best) { best = da; face = f; } }
        const lit = d < 0.42 ? 0.35 : Math.cos(faceAng[face]) * lx + Math.sin(faceAng[face]) * ly;
        c = lit > 0.55 ? TONE.hi : lit > 0.05 ? TONE.mid : lit > -0.5 ? TONE.low : TONE.deep;
      }
      img.data.set([...c, 255], i * 4);
    }
    // 照り(左上の面の縁に1〜2ドット)
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (!at(x, y) || at(x - 1, y - 1)) continue;
      if (x < cx - 1 && y < cy - 1) { img.data.set([...SHINE, 255], (y * N + x) * 4); return; }
    }
  });
  const crackTex = canvasTex(N, img => {
    for (const i of crack) img.data.set([255, 255, 255, 255], i * 4);
  });
  return { tex, crack: crackTex };
};

/** 岩の絵(大きさ別×数種)。 */
export const getAlchemyRockArt = (): RockArt[][] => {
  if (rockArt) return rockArt;
  rockArt = ALCHEMY_ROCK_SIZES.map((N, s) => Array.from({ length: VARIANTS }, (_, v) => drawRock(N, 0x51ed + s * 977 + v * 7919)));
  return rockArt;
};

/** 金の粉(2×2)。 */
export const getAlchemyDustTexture = (): Texture => {
  if (dustTex) return dustTex;
  dustTex = canvasTex(2, img => { for (let i = 0; i < 4; i++) img.data.set(i === 3 ? [...TONE.mid, 255] : [...TONE.hi, 255], i * 4); });
  return dustTex;
};

/** 塊を作る岩1個(位置は塊の基準寸法に対する割合・右向きの値)。 */
export interface AlchemyRockSpec {
  stage: number;
  /** 0=欠片 / 1=中 / 2=芯 */
  size: 0 | 1 | 2;
  variant: number;
  dx: number;
  dy: number;
  /** その段の主役(撃った側から飛んで来る岩)。欠片は主役の着弾点から飛び散って付く。 */
  main: boolean;
  /** 着弾から付くまでの遅れ(ms・欠片だけ。0〜30のばらつき)。 */
  jitterMs: number;
}

/** 表示の目安(塊の基準寸法に対する岩の大きさ)。芯1:中0.7:欠片0.3。 */
export const ALCHEMY_ROCK_TARGET = [0.09, 0.2, 0.29] as const;

/** 個体ごとに決まった塊の形(id から決める=毎フレーム同じ形)。芯から一方向へ体の輪郭に沿って伸びる。 */
export const alchemyRockLayout = (seed: number): AlchemyRockSpec[] => {
  const rnd = lcg(seed);
  const out: AlchemyRockSpec[] = [];
  const grow = Math.PI / 2 + (rnd() - 0.5) * 1.4; // 伸びる向き(下寄りの扇)
  const turn = rnd() < 0.5 ? -1 : 1;
  const frags = (stage: number, mx: number, my: number, cnt: number) => {
    for (let i = 0; i < cnt; i++) {
      const a = grow + (rnd() - 0.5) * 2.1;
      const d = 0.07 + rnd() * 0.06;
      out.push({ stage, size: 0, variant: Math.floor(rnd() * VARIANTS), dx: mx + Math.cos(a) * d, dy: my + Math.sin(a) * d * 0.85, main: false, jitterMs: Math.floor(rnd() * 30) });
    }
  };
  out.push({ stage: 1, size: 2, variant: Math.floor(rnd() * VARIANTS), dx: 0, dy: 0, main: true, jitterMs: 0 });
  frags(1, 0, 0, 2);
  const a2 = grow + turn * (0.35 + rnd() * 0.3);
  const m2 = [Math.cos(a2) * 0.16, Math.sin(a2) * 0.16 * 0.85];
  out.push({ stage: 2, size: 1, variant: Math.floor(rnd() * VARIANTS), dx: m2[0], dy: m2[1], main: true, jitterMs: 0 });
  frags(2, m2[0], m2[1], 2);
  const a3 = grow - turn * (0.25 + rnd() * 0.3);
  const m3 = [Math.cos(a3) * 0.22, Math.sin(a3) * 0.22 * 0.85];
  out.push({ stage: 3, size: 2, variant: Math.floor(rnd() * VARIANTS), dx: m3[0], dy: m3[1], main: true, jitterMs: 0 });
  frags(3, m3[0], m3[1], 3);
  // 新しい段を後ろ(=奥)に、芯を手前へ。欠片はその段の主役より奥。
  return out.sort((p, q) => (q.stage - p.stage) || (Number(p.main) - Number(q.main)));
};

export const alchemyRockSeed = (id: string): number => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** 尺(ms): 飛んで来る / めり込みから戻る / 欠片が飛び散って付く / 塊が押されて戻る / 満タンの脈 / 砕け。 */
export const ALCHEMY_FLY_MS = 120;
export const ALCHEMY_SETTLE_MS = 80;
export const ALCHEMY_FRAG_MS = 80;
export const ALCHEMY_PUSH_MS = 200;
export const ALCHEMY_PULSE_MS = 820;
export const ALCHEMY_SHATTER_MS = 800;

/** 満タンの脈(0〜1)。ゆっくり上がって速く落ちる。 */
export const alchemyPulse = (now: number): number => {
  const ph = (now % ALCHEMY_PULSE_MS) / ALCHEMY_PULSE_MS;
  if (ph < 0.7) { const u = ph / 0.7; return u * u * (3 - 2 * u); }
  const u = (ph - 0.7) / 0.3;
  return (1 - u) * (1 - u);
};

/** 低い震え(±1px・不規則な間隔)。 */
export const alchemyTremble = (now: number, seed: number): { x: number; y: number } => {
  const k = Math.floor(now / 70) ^ seed;
  const h = Math.imul(k ^ (k >>> 13), 0x5bd1e995) >>> 0;
  if ((h & 7) < 3) return { x: 0, y: 0 };
  return { x: ((h >>> 4) % 3) - 1, y: ((h >>> 8) % 3) - 1 };
};
