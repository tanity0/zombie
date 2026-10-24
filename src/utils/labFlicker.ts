// ステージ2(研究所)の「切れかけの蛍光灯」(社長指示2026-10-18「緑のダウンライトと連動して、ステージ全体を
// 切れかけの蛍光灯の演出みたいに たまにチカチカさせる。たまに0.5秒くらい暗いままだったり。恐怖演出」)。
//
// 時刻(ms)と出撃ごとの種から「いま灯りが点いている度合い」(1=点灯 / 0=消灯)を返す純関数。描画は読むだけ。
// ・時間軸を SLOT_MS ごとの枠に切り、枠ごとに1回(休みあり)の「ちらつき」を置く。O(1)・決定的。
// ・調子の波: さらに長い「季節」(SEASON_MS)ごとに、調子が悪い時期(よく来る)と静かな時期(ほぼ来ない)を決める。
//   来ない時間が長いほど次の1回が効く(タイマーのような一定の拍にしない)。
// ・型は手で書いた明滅の並び(実物の切れかけ蛍光灯の癖: 長く点いて短く消える/急な連打/ためらう点き方)から選び、
//   長さを少し揺らす。長い暗転(約0.5秒)は取っておく一撃=稀にする。
// ・出撃直後(最初の2枠)は何も起きない(着地の直後に重ねない)。
// ・実際の蛍光灯は消えた瞬間に蛍光体の残光で尾を引くので、描画側で消え=ゆっくり・点き=速く寄せる(smoothFlicker)。

export const LAB_FLICKER_SLOT_MS = 9000;
const SEASON_SLOTS = 5; // 45秒ごとに調子が変わる
/** 枠の頭から、ちらつきが始まるまでの最大のずれ(枠の後ろに寄りすぎないよう、枠の長さより短くする)。 */
const START_JITTER_MS = 6000;
/** 静かな時期・調子が悪い時期の休みの割合。 */
const SKIP_CALM = 0.55; // 0.8→0.55(社長「点滅はもっとハッキリ」)
const SKIP_BAD = 0.05;
const QUIET_FIRST_SLOTS = 2;

export type FlickerKind = 'stutter' | 'blackout' | 'sag';
/** [長さms, 明るさ0..1] の並び。 */
export type FlickerSegment = readonly [number, number];

// 手で書いた明滅(長さms, 明るさ)。0=消灯。
// 社長「点滅はもっとハッキリ。切れかけの蛍光灯の様に」: 消灯は 60ms 以上(60fpsで4コマ以上=目に残る)、
// 点灯はほぼ全開(中途半端な明るさを減らす)。切れかけの蛍光灯は「ぼんやり暗くなる」のではなく、パチッと落ちてパチッと点く。
const STUTTERS: readonly (readonly FlickerSegment[])[] = [
  [[90, 0], [300, 1], [70, 0], [110, 1], [80, 0]],                      // 長く点いて、パチッと2回落ちる
  [[60, 0], [50, 1], [60, 0], [50, 1], [70, 0], [200, 1], [110, 0]],    // 急な連打 → 一拍おいてもう一度
  [[160, 0], [70, 0.6], [80, 0], [90, 1], [70, 0]],                     // ためらうように点く
  [[80, 0], [240, 1], [60, 0], [60, 1], [70, 0]],                       // パチ、……パチパチ
  [[80, 0], [60, 1], [80, 0], [60, 1], [80, 0], [60, 1], [90, 0]],      // 規則的に3回(安定器の唸り)
  [[120, 0], [380, 1], [70, 0]],                                         // 落ちて、点いて、もう一度
];
// 暗転のあとの点き直し(グロー管の始動)。最後は点灯へ戻る。
const RELIGHTS: readonly (readonly FlickerSegment[])[] = [
  [[70, 1], [80, 0], [80, 1], [60, 0]],
  [[60, 0.8], [200, 0], [70, 1], [60, 0]],                              // 一度点きかけて、また落ちる(焦らす)
  [[90, 0.6], [70, 0], [60, 1], [70, 0], [80, 1], [60, 0]],
  [[60, 1], [60, 0]],                                                     // 一発で点く
  [[80, 1], [150, 0], [70, 1], [240, 0], [80, 1], [60, 0]],              // 二度失敗してから点く
];
const SAGS: readonly (readonly FlickerSegment[])[] = [
  [[160, 0.4], [70, 0], [200, 0.45]],
  [[260, 0.5], [60, 0], [110, 0.5]],
];

const hash = (n: number): number => {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
};

const rng = (key: number) => {
  let i = 0;
  return () => hash(key + Math.imul(i++, 104729));
};

const pick = <T,>(r: () => number, a: readonly T[]): T => a[Math.min(a.length - 1, Math.floor(r() * a.length))];
/** 長さを±20%揺らす(明るさはそのまま)。 */
const jitter = (r: () => number, segs: readonly FlickerSegment[]): FlickerSegment[] =>
  segs.map(([len, lv]) => [Math.max(lv === 0 ? 55 : 40, Math.round(len * (0.8 + 0.4 * r()))), lv] as const);

/** 調子が悪い時期か(季節ごと)。 */
export const isBadSeason = (slot: number, seed = 0): boolean =>
  hash(Math.floor(slot / SEASON_SLOTS) * 31337 + Math.imul(seed | 0, 2654435761)) < 0.45;

/** 枠 slot のちらつき(無ければ null)。開始時刻と区間の並びを返す。 */
export const flickerEpisode = (slot: number, seed = 0): { start: number; kind: FlickerKind; segs: FlickerSegment[] } | null => {
  if (slot < QUIET_FIRST_SLOTS) return null;
  const r = rng(Math.imul(slot, 7919) + Math.imul(seed | 0, 2654435761));
  const bad = isBadSeason(slot, seed);
  if (r() < (bad ? SKIP_BAD : SKIP_CALM)) return null;
  const start = slot * LAB_FLICKER_SLOT_MS + Math.round(r() * START_JITTER_MS);
  const p = r();
  // 長い暗転は稀(調子が悪い時期の中でだけ・その中でも3割=社長「もう少しだけはっきり暗い時間を」で2割→3割)。主は細かい点滅。
  const kind: FlickerKind = bad && p < 0.3 ? 'blackout' : p < 0.75 ? 'stutter' : 'sag';
  let segs: FlickerSegment[];
  if (kind === 'stutter') {
    segs = jitter(r, pick(r, STUTTERS));
  } else if (kind === 'blackout') {
    const lead = jitter(r, pick(r, STUTTERS));
    if (lead.length && lead[lead.length - 1][1] === 0) lead.pop(); // 最後の消灯は暗転へつなぐ
    segs = [...lead, [Math.round(480 + r() * 200), 0], ...jitter(r, pick(r, RELIGHTS))]; // 暗いまま 480〜680ms
  } else {
    segs = jitter(r, pick(r, SAGS));
  }
  return { start, kind, segs };
};

export const episodeLength = (segs: readonly FlickerSegment[]): number => segs.reduce((a, s) => a + s[0], 0);

/** 時刻 t(ms)の灯りの明るさ(目標値・0..1)。ちらつきの外は 1。seed=出撃ごとの種。 */
export const labFlickerLevel = (t: number, seed = 0): number => {
  if (!Number.isFinite(t) || t < 0) return 1;
  const slot = Math.floor(t / LAB_FLICKER_SLOT_MS);
  for (const sl of [slot, slot - 1]) {
    if (sl < 0) continue;
    const ep = flickerEpisode(sl, seed);
    if (!ep) continue;
    let at = t - ep.start;
    if (at < 0) continue;
    for (const [len, lv] of ep.segs) {
      if (at < len) return lv;
      at -= len;
    }
  }
  return 1;
};

/** 消える時の残光(遅い)と、点く時の立ち上がり(速い)。 */
// 35→10 / 12→6(社長「点滅はもっとハッキリ」): 残光は一瞬だけ。長い尾はパチッとした落ち方を鈍らせる。
export const FLICKER_FALL_TAU_MS = 10;
export const FLICKER_RISE_TAU_MS = 6;

/** 表示の明るさを目標へ寄せる(蛍光体の残光)。dt は ms。 */
export const smoothFlicker = (cur: number, target: number, dtMs: number): number => {
  const dt = Math.max(0, Math.min(100, dtMs));
  const tau = target < cur ? FLICKER_FALL_TAU_MS : FLICKER_RISE_TAU_MS;
  return target + (cur - target) * Math.exp(-dt / tau);
};

/** 一般の寄せ(暗転を許すかどうかの切り替えなど・慣性)。 */
export const easeToward = (cur: number, target: number, dtMs: number, tauMs: number): number =>
  target + (cur - target) * Math.exp(-Math.max(0, Math.min(100, dtMs)) / Math.max(1, tauMs));
