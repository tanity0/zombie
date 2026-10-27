// 敵を倒した時の血の破裂(社長指示2026-10-27「敵を倒した時、血飛沫と共に破裂する様にしたい。敵の大きさに比例して量が増える。
// 近接は手前に、銃殺だと奥に飛び散る」)。描画専用(判定ゼロ=攻撃ヴィジュアルの分類②・派手側)。
//
// 絵は起動時に小さなキャンバスへ1ドットずつ塗って焼く(最近傍・回さない=ドットの格子と光の向きが崩れない)。
//  - 塊(gob): 丸く不揃いな液体の塊。飛んでいる間は回さず、着地で潰れて床の染みになる。
//  - 滴(drop): 8方向×伸び3段を焼いておき、速さと向きでコマを選ぶ(回転の代わり)。
//  - 芯(star): トゲのある星形。最初の1コマは明るい光ではじけたと分からせる。
//  - 床の染み(stain): 横長で尾が1本の平たい形(ハイライトなし)。死んだ場所には大きな血溜まり。
// 量は「数と距離」で出し、1片の大きさは頭打ち(大きい敵で玉が膨らむだけにしない)。
import { Texture } from 'pixi.js';

const lcg = (seed: number) => {
  let s = (seed >>> 0) || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
};
const hex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
// ダークファンタジーの血: ほぼ黒い深紅。光が当たる1ドットだけ明るい(芯の絵だけ)。
const HI = hex('#8e1712');
const MID = hex('#560909');
const LOW = hex('#2a0304');
const SHINE = hex('#c8604e');

const toTex = (W: number, H: number, paint: (set: (x: number, y: number, c: [number, number, number], a?: number) => void) => void): Texture => {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  paint((x, y, c, a = 255) => { if (x >= 0 && y >= 0 && x < W && y < H) img.data.set([...c, a], (y * W + x) * 4); });
  ctx.putImageData(img, 0, 0);
  const tex = Texture.from(canvas);
  tex.source.scaleMode = 'nearest';
  return tex;
};

/** 塊の絵の大きさ(0=小 / 1=中 / 2=大)。 */
export const BLOOD_GOB_PX = [8, 12, 16] as const;
const bakeGob = (N: number, seed: number): Texture => {
  const rnd = lcg(seed);
  const blobs = [{ x: N / 2, y: N / 2, r: N * 0.32 }];
  for (let i = 0; i < 3; i++) {
    const a = rnd() * Math.PI * 2, d = N * (0.1 + rnd() * 0.14);
    blobs.push({ x: N / 2 + Math.cos(a) * d, y: N / 2 + Math.sin(a) * d, r: N * (0.12 + rnd() * 0.12) });
  }
  const inside = (x: number, y: number) => blobs.some(b => Math.hypot(x - b.x, y - b.y) <= b.r);
  return toTex(N, N, set => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (!inside(x + 0.5, y + 0.5)) continue;
      const edge = !inside(x + 1.5, y + 0.5) || !inside(x + 0.5, y + 1.5);
      const lit = -0.6 * (x + 0.5 - N / 2) - 0.8 * (y + 0.5 - N / 2);
      set(x, y, edge ? LOW : lit > N * 0.18 ? HI : MID);
    }
  });
};

/** 滴: 8方向×伸び3段(1.0/1.6/2.4)。頭が明るく尾が暗い。 */
export const BLOOD_DROP_STRETCH = [1, 1.6, 2.4] as const;
const DROP_N = 12;
const bakeDrop = (dirIdx: number, stretch: number): Texture => {
  const a = (dirIdx / 8) * Math.PI * 2;
  const ca = Math.cos(a), sa = Math.sin(a);
  const L = 1.6 * stretch, Wd = 1.5;
  return toTex(DROP_N, DROP_N, set => {
    for (let y = 0; y < DROP_N; y++) for (let x = 0; x < DROP_N; x++) {
      const dx = x + 0.5 - DROP_N / 2, dy = y + 0.5 - DROP_N / 2;
      const along = dx * ca + dy * sa, across = -dx * sa + dy * ca;
      // 頭(進む側)が丸く、尾が細く伸びる涙形
      const t = along / L;
      if (t > 1 || t < -1.6) continue;
      const half = t > 0 ? Wd * Math.sqrt(Math.max(0, 1 - t * t)) : Wd * (1 + t / 1.6);
      if (Math.abs(across) > half) continue;
      set(x, y, t > 0.3 ? HI : t > -0.6 ? MID : LOW);
    }
  });
};

/** 芯(星形・トゲ6〜8本)。中心に1ドットだけ光。 */
const STAR_N = 24;
const bakeStar = (seed: number): Texture => {
  const rnd = lcg(seed);
  const spikes = 6 + Math.floor(rnd() * 3);
  const phase = rnd() * Math.PI * 2;
  const amp = Array.from({ length: spikes }, () => 0.75 + rnd() * 0.25);
  return toTex(STAR_N, STAR_N, set => {
    const c = STAR_N / 2;
    for (let y = 0; y < STAR_N; y++) for (let x = 0; x < STAR_N; x++) {
      const dx = x + 0.5 - c, dy = y + 0.5 - c;
      const r = Math.hypot(dx, dy) / c;
      const th = Math.atan2(dy, dx) - phase;
      const k = ((th / (Math.PI * 2)) * spikes % 1 + 1) % 1;
      const idx = Math.floor((((th / (Math.PI * 2)) * spikes) % spikes + spikes) % spikes);
      const spike = Math.pow(1 - Math.abs(k - 0.5) * 2, 3) * amp[idx];
      const R = 0.38 + 0.6 * spike;
      if (r > R) continue;
      set(x, y, r > R - 0.12 ? LOW : r < 0.12 && dx < 0 && dy < 0 ? SHINE : r < 0.3 ? HI : MID);
    }
  });
};

/** 床の染み(横長・尾が1本・ハイライトなし)。0..2=飛沫の跡 / 3=死んだ場所の血溜まり。 */
const bakeStain = (W: number, H: number, seed: number, pool: boolean): Texture => {
  const rnd = lcg(seed);
  const blobs = [{ x: W * 0.42, y: H / 2, rx: W * (pool ? 0.42 : 0.3), ry: H * 0.42 }];
  for (let i = 0; i < (pool ? 4 : 2); i++) {
    blobs.push({ x: W * (0.25 + rnd() * 0.4), y: H * (0.35 + rnd() * 0.3), rx: W * (0.1 + rnd() * 0.12), ry: H * (0.2 + rnd() * 0.18) });
  }
  const inside = (x: number, y: number) =>
    blobs.some(b => ((x - b.x) / b.rx) ** 2 + ((y - b.y) / b.ry) ** 2 <= 1)
    || (!pool && x > W * 0.6 && Math.abs(y - H / 2) <= Math.max(0.5, 1.2 * (1 - (x - W * 0.6) / (W * 0.4)))); // 尾
  return toTex(W, H, set => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!inside(x + 0.5, y + 0.5)) continue;
      const edge = !inside(x + 0.5, y - 0.5) || !inside(x + 0.5, y + 1.5);
      set(x, y, edge ? LOW : MID);
    }
  });
};

export interface BloodBurstArt {
  gob: Texture[][];      // [大きさ][種類]
  drop: Texture[][];     // [方向8][伸び3]
  star: Texture[];
  stain: Texture[];      // 飛沫の跡3種
  pool: Texture;         // 死んだ場所の血溜まり
  puff: Texture;         // 霧の粒
}
let art: BloodBurstArt | null = null;
export const getBloodBurstArt = (): BloodBurstArt => {
  if (art) return art;
  art = {
    gob: BLOOD_GOB_PX.map((N, s) => [0, 1, 2].map(v => bakeGob(N, 0xb10d + s * 131 + v * 7919))),
    drop: Array.from({ length: 8 }, (_, d) => BLOOD_DROP_STRETCH.map(st => bakeDrop(d, st))),
    star: [0, 1, 2].map(v => bakeStar(0x57a7 + v * 977)),
    stain: [0, 1, 2].map(v => bakeStain(14, 6, 0x5a1 + v * 313, false)),
    pool: bakeStain(26, 11, 0x9001, true),
    puff: toTex(3, 3, set => { for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) if (x === 1 || y === 1) set(x, y, hex('#7a1a14')); }), // 十字の粒
  };
  return art;
};

/** 速さの向き(rad)と伸び(1〜)から滴のコマを選ぶ(回転の代わり)。 */
export const pickDrop = (a: BloodBurstArt, ang: number, stretch: number): Texture => {
  const d = ((Math.round((ang / (Math.PI * 2)) * 8) % 8) + 8) % 8;
  const s = stretch < 1.3 ? 0 : stretch < 2 ? 1 : 2;
  return a.drop[d][s];
};

/** 破裂の1片。向き・距離は「主な向き」「届く距離」に対する割合。 */
export interface BloodBurstPiece {
  kind: 'gob' | 'drop';
  size: 0 | 1 | 2;
  variant: number;
  dAng: number;
  dist: number;
  /** 着地までの時間(ms)。 */
  flyMs: number;
  /** 出るまでの遅れ(ms)。本体=0〜20 / 追い吹き=60〜110。 */
  delayMs: number;
  /** 近接だけ: プレイヤーの体に着地する滴(浴びる)。 */
  onBody: boolean;
  /** 床の染みが消え始めるずれ(ms・±600)。 */
  stainJitterMs: number;
}

/**
 * 片の並び(effect の id と敵の大きさから決める=毎フレーム同じ)。
 *  - 近接: 重く広くぶちまける(塊5・滴は少なめ・扇0.9)。滴のうち3つはプレイヤーの体に着地する。
 *  - 銃: 抜けた穴から細く長く噴く(塊2・滴多め・扇0.3・速い)。
 * 滴の数は大きさで増える(9+6×(大きさ−1)・最大24)。
 */
export const bloodBurstLayout = (seed: number, melee: boolean, scale: number): BloodBurstPiece[] => {
  const rnd = lcg(seed);
  const out: BloodBurstPiece[] = [];
  const fan = melee ? 0.9 : 0.3;
  const jitter = () => Math.round((rnd() - 0.5) * 1200);
  const gobs = melee ? 5 : 2;
  for (let i = 0; i < gobs; i++) {
    out.push({ kind: 'gob', size: rnd() < 0.45 ? 2 : 1, variant: Math.floor(rnd() * 3), dAng: (rnd() - 0.5) * 2 * fan,
      dist: 0.25 + rnd() * 0.5, flyMs: 200 + rnd() * 150, delayMs: Math.floor(rnd() * 20), onBody: false, stainJitterMs: jitter() });
  }
  const drops = Math.min(24, Math.round((melee ? 9 : 13) + 6 * Math.max(0, scale - 1)));
  for (let i = 0; i < drops; i++) {
    const body = melee && i < 3;
    out.push({ kind: 'drop', size: 0, variant: Math.floor(rnd() * 3), dAng: body ? (rnd() - 0.5) * 0.25 : (rnd() - 0.5) * 2 * (fan + 0.15),
      dist: body ? 1 : 0.4 + rnd() * 0.75,
      flyMs: melee ? 280 + rnd() * 240 : 180 + rnd() * 220,
      delayMs: Math.floor(rnd() * 20), onBody: body, stainJitterMs: jitter() });
  }
  // 追い吹き(少し遅れて小さく4粒)
  for (let i = 0; i < 4; i++) {
    out.push({ kind: 'drop', size: 0, variant: Math.floor(rnd() * 3), dAng: (rnd() - 0.5) * 2 * fan, dist: 0.15 + rnd() * 0.35,
      flyMs: 220 + rnd() * 160, delayMs: 60 + Math.floor(rnd() * 50), onBody: false, stainJitterMs: jitter() });
  }
  return out;
};

export const bloodBurstSeed = (id: string): number => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** 重力(world px/s²)。着地時刻は片ごとに決まっていて、上向きの初速を逆算する。 */
export const BLOOD_BURST_GRAVITY = 1500;
/** 尺(ms): 明るい1コマ / 芯 / 霧 / 血溜まりが広がる / 床の血が暗く沈む / 床の血が消える / 体に付いた滴が見えている。 */
export const BLOOD_BURST_FLASH_MS = 33;
export const BLOOD_BURST_POP_MS = 150;
export const BLOOD_BURST_MIST_MS = 320;
export const BLOOD_BURST_POOL_MS = 400;
export const BLOOD_BURST_DARKEN_MS = 1000;
export const BLOOD_BURST_FADE_MS = 800;
export const BLOOD_BURST_BODY_MS = 400;
