// 処刑・カウンターの「当たった瞬間の絵」の台本(research/CINEMATIC_CAMERA.md §9 v2・社長承認2026-09-14)。
//
// ★設計の1行: **全部を「当たった1点」から出し、数フレームずつ遅らせ、全部を減速させ、全部を短くする。**
// 参考(FF7リバース)の一撃がそうなっているから読める。§8 の VFX が却下されたのは、画面の縁に飾りを置いて
// **接触点と無関係な絵**を作ったため(§8-11)。
//
// ここは**純関数だけ**。実際に撒くのは gameStore の配線(setTimeout で beats を再生)。
// 遅れを純関数で持てないのは `updateEffects` が createdAt を無視して毎フレーム積分するため(§9-0 #6)。
import type { ImpactBurstKind } from './impactBurstKinds';

export type { ImpactBurstKind };

/** 台本の1拍。`atMs` = 接触の瞬間からの遅れ。 */
export interface ImpactBeat {
  atMs: number;
  kind: ImpactBurstKind;
  /** 粒/枚数。kind によって意味が変わる。 */
  count: number;
  /** 大きさの基準(px または scale)。 */
  size: number;
  /** 撒く向き(ラジアン)。kind によっては未使用。 */
  angleRad: number;
  /** 扇の広がり(ラジアン)。 */
  spreadRad: number;
  /** 初速(px/秒)。 */
  speed: number;
  /** 尺(ms)。 */
  durationMs: number;
  /** 色(tint 文字列 or rgba 前半)。未指定=素材そのまま。 */
  color?: string;
  /** 足元Y基準に置く拍(土煙・破片の着地・地面の跡)。 */
  atFoot?: boolean;
}

export interface ImpactBurstInput {
  /** 'execute'=処刑(こちらが殺す) / 'counter'=カウンター成立(向こうの攻撃を折る)。 */
  mode: 'execute' | 'counter';
  /** 刃の走った向き(ラジアン)。★押し込み方向ではない——擦れた向きに火花が出る。 */
  bladeRad: number;
  /** 相手の見かけの幅(px)。土煙と火花の数にだけ効く。 */
  targetW: number;
  /** 見た目を毎回変える種。 */
  seed: number;
}

// ─────────────────────────────────────────────────────────────────────────
// 数値(§9-3)
// ─────────────────────────────────────────────────────────────────────────
/** 閃光の半径は**固定**。44以上にすると投影影を落とす重い光源に切り替わる(§9-0 #9)。 */
export const IMPACT_FLASH_R = 38;
export const IMPACT_FLASH_MS = 90;
export const IMPACT_FLASH_COLOR = 'rgba(255,246,234,'; // ほぼ無彩のわずかに暖かい白。周りが青いから暖色側へ倒す

export const IMPACT_SPARK_TOTAL = 28;      // 24粒は細い束 + 4粒だけ外れ値(均等な扇にしない)
export const IMPACT_SPARK_TIGHT_RAD = 0.21; // ±12°
export const IMPACT_SPARK_WIDE_RAD = 1.22;  // ±70°
export const IMPACT_SPARK_COLORS = ['#ffd9a0', '#ffb45c', '#fff4d0'] as const;

export const IMPACT_SHOCK_MS = 180;
export const IMPACT_SLASH_MS = 150;
export const IMPACT_DEBRIS_MS = 520;
export const IMPACT_SMOKE_MS = 620;
export const IMPACT_STAIN_MS = 4000;

/** 反復の窓。処刑のフル演出は共有CD10秒に律速されるので**そこへ合わせる**(§8-9 #6 の 8秒は半端だった)。 */
export const IMPACT_REPEAT_MS = 10_000;

const lcg = (seed: number) => { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };

/**
 * 台本を組む。**処刑とカウンターは倍率違いではなく別の絵**(§9-3):
 * - 処刑 = 下向きの重さ(土煙を厚く・破片を落とす・地面に跡を残す)
 * - カウンター = 跳ね返り(火花を扇状に広く・輪は細く速く・土煙と跡は無し・尺は2/3)
 * 共通は閃光と輪だけ。
 */
export const impactBurstPlan = (input: ImpactBurstInput): ImpactBeat[] => {
  const { mode, bladeRad, targetW, seed } = input;
  const r = lcg(seed);
  const exec = mode === 'execute';
  const jitter = (base: number, frac: number) => base * (1 + (r() - 0.5) * 2 * frac);
  const t = (ms: number) => Math.max(0, Math.round(jitter(ms, 0) + (r() - 0.5) * 30)); // 遅れ ±15ms
  const beats: ImpactBeat[] = [];

  // 1. 白熱の閃光(接触点・固定半径)
  beats.push({ atMs: 0, kind: 'flash', count: 1, size: IMPACT_FLASH_R, angleRad: bladeRad, spreadRad: 0,
    speed: 0, durationMs: IMPACT_FLASH_MS, color: IMPACT_FLASH_COLOR });

  // 2. 斬りの帯(刃の走った向き。処刑は既存の横一文字があるので1枚だけ足す)
  beats.push({ atMs: 0, kind: 'slashBurst', count: exec ? 1 : 2, size: 0.5 + targetW / 400,
    angleRad: bladeRad, spreadRad: 0.5, speed: 130, durationMs: IMPACT_SLASH_MS });

  // 3. 衝撃の輪(カウンターは細く速く)
  beats.push({ atMs: t(30), kind: 'shock', count: 1, size: (targetW * 1.6) / 160,
    angleRad: bladeRad, spreadRad: 0, speed: 0, durationMs: exec ? IMPACT_SHOCK_MS : Math.round(IMPACT_SHOCK_MS * 0.66) });

  // 4. 火花3波。★刃の走った向きへ。24粒は細い束、4粒だけ外れ値で長く速く。
  const sparkScale = Math.min(1.4, Math.max(0.7, targetW / 120));
  const tight = Math.round(IMPACT_SPARK_TOTAL * (6 / 7) * jitter(1, 0.25));
  const wide = IMPACT_SPARK_TOTAL - Math.round(IMPACT_SPARK_TOTAL * (6 / 7));
  for (let w = 0; w < 3; w++) {
    beats.push({ atMs: t([0, 70, 150][w]), kind: 'spark', count: Math.max(1, Math.round(tight / 3)),
      size: 2 + r() * 3, angleRad: bladeRad, spreadRad: exec ? IMPACT_SPARK_TIGHT_RAD : IMPACT_SPARK_TIGHT_RAD * 2.4,
      speed: (260 + r() * 260) * sparkScale, durationMs: 260 + w * 60,
      color: IMPACT_SPARK_COLORS[Math.floor(r() * IMPACT_SPARK_COLORS.length)] });
  }
  beats.push({ atMs: t(40), kind: 'spark', count: wide, size: 2 + r() * 2, angleRad: bladeRad,
    spreadRad: IMPACT_SPARK_WIDE_RAD, speed: 620 * sparkScale, durationMs: 420, color: IMPACT_SPARK_COLORS[2] });

  // 5〜7. 処刑だけ: 破片(落ちて着地)・土煙(足元から)・地面の跡(残る)
  if (exec) {
    beats.push({ atMs: t(120), kind: 'debris', count: 6, size: 0.24, angleRad: bladeRad,
      spreadRad: 1.6, speed: 210, durationMs: IMPACT_DEBRIS_MS, atFoot: true });
    beats.push({ atMs: t(220), kind: 'smoke', count: Math.round(jitter(14, 0.25)), size: 0.55 + targetW / 300,
      angleRad: -Math.PI / 2, spreadRad: 2.0, speed: 90, durationMs: IMPACT_SMOKE_MS, atFoot: true });
    beats.push({ atMs: t(400), kind: 'stain', count: 1, size: 0.7 + targetW / 400, angleRad: 0,
      spreadRad: 0, speed: 0, durationMs: IMPACT_STAIN_MS, atFoot: true });
  }
  return beats.sort((a, b) => a.atMs - b.atMs);
};

/** 反復: 2回目以降は**強さを一律に下げない**。芯(閃光・輪・火花・帯)は毎回100%で、土煙と破片と跡だけ落とす。 */
export const impactBurstRepeatFilter = (beats: ImpactBeat[], lastAt: number, now: number): ImpactBeat[] => {
  if (!(lastAt > 0) || now - lastAt >= IMPACT_REPEAT_MS) return beats;
  return beats.filter(b => b.kind !== 'smoke' && b.kind !== 'debris' && b.kind !== 'stain');
};
