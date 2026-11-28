// ステージ2(研究所)の非常灯の並び(research/LAB_DARKNESS.md)。灯りは world の x = 間隔の整数倍・y = 0 に等間隔で立つ。
// 描くのは pixi/pixiScene(updateLabDarkLights)。ここは「灯りがどこにあるか」だけ=塊の置き場所を灯りの真下へ寄せる時に world 側が読む
// (社長指示2026-11-11「塊の登場シーンは、スポットライトが当たってる位置に配置することで見えるようにしよう」)。
// 描画の世界を import しない(判定の層)。
import { labFlickerLevel } from '../utils/labFlicker'; // 手書きの明滅の並び(切れかけの蛍光灯)を、灯り1つずつの癖にも使う

/** 非常灯の間隔(world px)。 */
export const LAB_LAMP_SPACING_PX = 440;
/** いちばん近い非常灯の x。 */
export const labLampNearestX = (x: number): number => Math.round(x / LAB_LAMP_SPACING_PX) * LAB_LAMP_SPACING_PX;

// ---- 灯りの個体差(社長承認2026-11-11「つける」・research/LAB_DARKNESS.md §11) --------------------------------
// 廃墟の非常灯が全部同じ形・同じ強さで並ぶのは不自然。灯りの番号 k(x = k × 間隔)から決めた個性を持たせる。
// 切れた灯りの所に長い闇が生まれる。番号で決まる=何度出撃しても同じ灯りが切れている(場所として覚えられる)。
// 描画だけ(敵の視界・湧き・判定には使わない)。
export type LabLampKind = 'ok' | 'dead' | 'flicker' | 'dim';
/** 必ず健康な灯り: スタート地点(0)と、塊が眠る灯り(±2=880。research/LAB_DARKNESS.md §8「灯りの真下に置く」を守る)。 */
export const LAB_LAMP_ALWAYS_ON_K: readonly number[] = [0, 2, -2];
/**
 * スタートの近くは手で決める(最初の闇との出会いを乱数に預けない)。左右とも同じ:
 * 1つ目=健康 / 2つ目=健康(塊が眠る) / 3つ目=ちらつく / 4つ目=切れている(塊の灯りを過ぎた先に、最初の闇) / 5つ目=健康。
 */
const NEAR_START: Readonly<Record<number, LabLampKind>> = { 0: 'ok', 1: 'ok', 2: 'ok', 3: 'flicker', 4: 'dead', 5: 'ok' };
/** 手で決める範囲(|k| がこの値以下)。 */
export const LAB_LAMP_AUTHORED_K = 5;
/** 個性を配る区切りの長さ(灯りの数)。区切りごとに調子を決める(故障は回路ごとの塊)。 */
export const LAB_LAMP_BLOCK = 6;
const lampHash = (a: number, b = 0): number => {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + 0x9e3779b9) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};
const unit = (a: number, b: number): number => lampHash(a, b) / 4294967296; // 0..1
/**
 * 灯りの個性。スタートの近く(|k|≦5)は手で決めた並び。その先は6つの区切りごとに調子を決める(故障は回路ごとの塊):
 *  - 良い区切り(1/3): 全部健康(半分の確率で1つだけ暗い)=健康な灯りが長く続く区間。
 *  - くたびれた区切り(1/3): ちらつく1つ・暗い1つ。
 *  - 壊れた区切り(1/3): 切れている1つ(端には置かない)+その隣がちらつく。4回に1回は、反対の隣も切れている(2つ続けて闇)。
 */
export const labLampKind = (k: number): LabLampKind => {
  if (LAB_LAMP_ALWAYS_ON_K.includes(k)) return 'ok';
  if (Math.abs(k) <= LAB_LAMP_AUTHORED_K) return NEAR_START[Math.abs(k)];
  const b = Math.floor(k / LAB_LAMP_BLOCK), i = k - b * LAB_LAMP_BLOCK;
  const cond = lampHash(b, 1) % 3;
  if (cond === 0) return lampHash(b, 2) % 2 === 0 && i === lampHash(b, 3) % LAB_LAMP_BLOCK ? 'dim' : 'ok';
  if (cond === 1) {
    const fl = lampHash(b, 2) % LAB_LAMP_BLOCK;
    const dim = (fl + 1 + (lampHash(b, 3) % (LAB_LAMP_BLOCK - 1))) % LAB_LAMP_BLOCK;
    return i === fl ? 'flicker' : i === dim ? 'dim' : 'ok';
  }
  const dead = 1 + (lampHash(b, 2) % (LAB_LAMP_BLOCK - 2)); // 1..4(端を避ける=隣の区切りの切れた灯りと続かない)
  const side = lampHash(b, 3) % 2 === 0 ? 1 : -1;
  const twin = lampHash(b, 4) % 4 === 0;
  if (i === dead) return 'dead';
  if (i === dead + side) return 'flicker';
  if (i === dead - side) return twin ? 'dead' : 'ok';
  return 'ok';
};
/** ちらつく灯りの時刻表(全体の明滅と同じ手書きの並びを、短い枠で引く=しばらく大人しい→急に連打、の波を灯りごとに持つ)。 */
const FLICKER_TIMING = { slotMs: 2400, startJitterMs: 1400, quietFirstSlots: 0 } as const;
/** 切れた灯りの「点きかけ」の時刻表(十数秒に1回あるかないか。全体の明滅の並びを裏返して読む=消灯の拍で弱く点く)。 */
const DEAD_TIMING = { slotMs: 16000, startJitterMs: 11000, quietFirstSlots: 0 } as const;
/** 切れた灯りが点きかける時の明るさ(弱い)。 */
export const LAB_LAMP_DEAD_SPUTTER_LEVEL = 0.3;
/** 暗い灯りの明るさの幅。 */
export const LAB_LAMP_DIM_MIN = 0.45;
export const LAB_LAMP_DIM_MAX = 0.75;
/** 灯りごとの地の明るさ(健康な灯りにも僅かな差。暗い灯りは幅の中でばらつく)。切れた灯りは0。 */
export const labLampBase = (k: number): number => {
  const kind = labLampKind(k);
  if (kind === 'dead') return 0;
  if (kind === 'dim') return LAB_LAMP_DIM_MIN + (LAB_LAMP_DIM_MAX - LAB_LAMP_DIM_MIN) * unit(k, 11);
  return LAB_LAMP_ALWAYS_ON_K.includes(k) ? 1 : 0.9 + 0.1 * unit(k, 12);
};
/** 灯りごとの光の届く広さ(光だまりの直径の倍率)。暗い灯りは狭い(0.75〜0.9)=「薄い灯り」ではなく「届かない灯り」に見せる。 */
export const labLampScale = (k: number): number => (labLampKind(k) === 'dim' ? 0.75 + 0.15 * unit(k, 13) : 1);
/**
 * その灯りの今の明るさ(0..1)。描画側が残光つきで寄せる(utils/labFlicker.smoothFlicker)。gameTime で読む(一時停止中は止まる)。
 *  - 健康・暗い: 地の明るさ(一定)。
 *  - ちらつく: 地の明るさ × 手書きの明滅(パチッと落ちてパチッと点く・調子の波あり)。
 *  - 切れている: ふだんは0。たまに、弱く点きかけて落ちる(死に際。真下に立った時に来ると怖い)。
 */
export const labLampLevel = (k: number, gameTime: number): number => {
  const kind = labLampKind(k);
  const t = Math.max(0, gameTime);
  if (kind === 'dead') return LAB_LAMP_DEAD_SPUTTER_LEVEL * (1 - labFlickerLevel(t, lampHash(k, 21) | 0, DEAD_TIMING));
  const base = labLampBase(k);
  return kind === 'flicker' ? base * labFlickerLevel(t, lampHash(k, 22) | 0, FLICKER_TIMING) : base;
};
