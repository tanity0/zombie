// 雑魚(チャフ)の動きに「個体差」と「役割」を入れる純関数(社長指示v0.25.3176・案4+案3)。
//
// なぜ要るのか(診断の結論):
// **コウモリとスケルトンには専用AIが1行も無かった**。両方とも updateEnemies の汎用の直進追尾
// (0.3秒の慣性で曲がるだけ)を通るので、**速さと大きさ以外は完全に同じ動き**をしていた。
// さらにチャフの度数は bat5 : skeleton3 : zombie1、RELAX/HARVESTコマでは zombie が 0 なので、
// **ランの半分は「同じ動きをする2種だけ」**が画面にいた。これが社長報告「雑魚の動きが単調」の実体。
//
// 方針(社長採用の案4+案3。新しい敵種を増やさず、群れの"見え方"だけを変える):
//  - **案4 個体差**: 同じ型なら**全個体が完全に同速・同じ曲がり方**だったので、壁のように揃って来ていた。
//    id から決まる ±12% の速度差と、追従の遅さ(慣性)の個体差を入れて**縦に伸びた流れ**にする。
//  - **案3 役割**: 湧いた瞬間に役割を固定(直進60% / 回り込み25% / 遅れて来る15%)。回り込み役は
//    正面ではなく横へ膨らんで寄るので、**同じ方向から一列で来なくなる**。
//
// 掟:
//  - **すべて id から決まる決定的な値**(乱数を引かない)=ヘッドレスで再現する・毎フレーム揺れない。
//  - **役割は追尾の"向き"と"速さ"だけを曲げる**。ターゲット選択・攻撃・当たり判定には一切触らない。
//  - **回り込みの角度は距離とともに0へ**収束する=必ず届く(いつまでも周回する敵を作らない)。
//  - レンダラ非依存の純関数=ユニットテスト可能(実装精度の規律4)。
import type { EnemyType } from '../types/game';

/** 対象=チャフ3種のみ。邪魔者(犬/パンプキン)・特別枠・ボスは専用の状態機械を持つので触らない。 */
export const CHAFF_TYPES: ReadonlySet<EnemyType> = new Set<EnemyType>(['bat', 'skeleton', 'zombie']);
export const isChaffType = (t: EnemyType): boolean => CHAFF_TYPES.has(t);

export type ChaffRole = 'straight' | 'flank' | 'laggard';

// ---- 案4: 個体差 -------------------------------------------------------------------------
/** 速度の個体差(±この割合)。社長提案の「±12%」。 */
export const CHAFF_SPEED_JITTER = 0.12;
/** 追従の遅さ(慣性tau)の個体差。既存tau(チャフで0.30〜0.41s)へ掛けて 0.22〜0.65s の幅にする。 */
export const CHAFF_TURN_TAU_MIN = 0.75;
export const CHAFF_TURN_TAU_MAX = 1.60;

// ---- 案3: 役割 ---------------------------------------------------------------------------
/** 役割の配分(社長提案どおり 直進60% / 回り込み25% / 遅れて来る15%)。 */
export const CHAFF_ROLE_STRAIGHT_FRAC = 0.60;
export const CHAFF_ROLE_FLANK_FRAC = 0.25;
/** 回り込みの最大角(rad ≒ 70°)。遠い時だけこの角度まで横へ膨らむ。 */
export const CHAFF_FLANK_MAX_RAD = 1.22;
/** この距離以上で最大角。近づくほど角は0へ=最後は正面から詰める(必ず届く)。 */
export const CHAFF_FLANK_FULL_PX = 300;
/** 「遅れて来る」役が遠くに居る間だけ掛かる速度倍率。 */
export const CHAFF_LAGGARD_SPEED_MULT = 0.72;
/** この距離より近づいたら遅れ役も通常速度に戻る(いつまでも来ない個体を作らない)。 */
export const CHAFF_LAGGARD_UNTIL_PX = 260;

export interface ChaffTraits {
  role: ChaffRole;
  speedJitter: number; // 1±CHAFF_SPEED_JITTER
  turnTauMult: number; // CHAFF_TURN_TAU_MIN..MAX
  flankSign: 1 | -1;   // 回り込む向き(左右)
}

/**
 * id 1本から4つの独立した特性を作る。**ハッシュは1回だけ**回して、そこから混ぜて取り出す
 * (同じ文字列を4回走査しないため)。結果は id ごとに不変=毎フレーム呼んでも揺れない。
 */
const mix = (h: number): number => {
  let x = h | 0;
  x ^= x >>> 16; x = Math.imul(x, 2246822507);
  x ^= x >>> 13; x = Math.imul(x, 3266489909);
  x ^= x >>> 16;
  return x >>> 0;
};
const unit = (h: number): number => (mix(h) % 100000) / 100000; // 0..1

// 直近に見た個体の特性をメモ化(同じ敵が毎フレーム引くため)。上限を超えたら丸ごと捨てる
// =無制限に伸びない(敵idはラン中に増え続けるので、LRUではなく単純なリセットで十分)。
const TRAITS_CACHE_MAX = 256;
const traitsCache = new Map<string, ChaffTraits>();

export const chaffTraits = (id: string): ChaffTraits => {
  const hit = traitsCache.get(id);
  if (hit) return hit;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  const rRole = unit(h ^ 0x9e3779b9);
  const rSpeed = unit(h ^ 0x85ebca6b);
  const rTau = unit(h ^ 0xc2b2ae35);
  const rSpin = unit(h ^ 0x27d4eb2f);
  const role: ChaffRole = rRole < CHAFF_ROLE_STRAIGHT_FRAC
    ? 'straight'
    : rRole < CHAFF_ROLE_STRAIGHT_FRAC + CHAFF_ROLE_FLANK_FRAC ? 'flank' : 'laggard';
  const traits: ChaffTraits = {
    role,
    speedJitter: 1 + (rSpeed * 2 - 1) * CHAFF_SPEED_JITTER,
    turnTauMult: CHAFF_TURN_TAU_MIN + (CHAFF_TURN_TAU_MAX - CHAFF_TURN_TAU_MIN) * rTau,
    flankSign: rSpin < 0.5 ? -1 : 1,
  };
  if (traitsCache.size >= TRAITS_CACHE_MAX) traitsCache.clear();
  traitsCache.set(id, traits);
  return traits;
};

/**
 * 追尾の単位ベクトル(ux,uy)へ役割を適用して返す(戻り値も単位ベクトル)。
 * 回り込み役だけが横へ振れる。角度は距離に比例して縮み、密着では0=正面から詰める。
 */
export const chaffHeading = (
  ux: number, uy: number, traits: ChaffTraits, distance: number,
): { x: number; y: number } => {
  if (traits.role !== 'flank') return { x: ux, y: uy };
  const a = CHAFF_FLANK_MAX_RAD * Math.min(1, Math.max(0, distance) / CHAFF_FLANK_FULL_PX) * traits.flankSign;
  const c = Math.cos(a), s = Math.sin(a);
  return { x: ux * c - uy * s, y: ux * s + uy * c };
};

/** 役割+個体差をまとめた速度倍率(1.0基準)。 */
export const chaffSpeedMult = (traits: ChaffTraits, distance: number): number =>
  traits.speedJitter
  * (traits.role === 'laggard' && distance > CHAFF_LAGGARD_UNTIL_PX ? CHAFF_LAGGARD_SPEED_MULT : 1);
