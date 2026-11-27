// ★近接の「動き→止まり」と、ヒットストップを掛ける時刻(社長指示2026-11-27「攻撃時、絵が揺れてるのやめたい。きっちり動きと止まりをハッキリさせて」
//   「ナイフなら敵の真ん中ら辺にナイフが来ているタイミングでストップが掛かる、みたいに止めるタイミングにもこだわって。もう少し止めてもいい気がする」)。
// 描画だけの値を決める純関数(store と pixi の両方が読む・PixiJS に依存しない)。判定・ダメージ・押しの距離・段の間隔は何も変えない。
//  1. 動き→止まり: 攻撃中の自分の体の位置のずれは「行って戻る」揺れにせず、キーフレーム(姿勢へ素早く移る=速く出て減速 → そこで1pxも動かない)で出す。
//  2. 止める時刻: 振りの絵の中で、武器(ナイフの刃先・鞭の先端・刀の刃)が当たった敵の体の中心に一番近づく時刻を求め、絵の時計をそこで止める。
//     当たりが絵より早い時(PC の直呼び等)は絵がその時刻に来た瞬間に止め、敵の止めをそこまで延ばす。当たりが絵より遅い時は当たった瞬間の絵で止める(過去へ戻さない)。
//  3. 長さ: ナイフ・鞭・刀の自分の止めと敵の止めは ×MELEE_HITSTOP_STRETCH(会心・まとめ当ての上乗せは今の式のまま)。数値は叩き台。格闘は未適用(BRAWLER_HITSTOP_STRETCH の注記)。

/** ナイフ・鞭・刀のヒットストップ(自分の振りの止め・当たった敵の止め)の長さの倍率(叩き台・旧=1)。 */
export const MELEE_HITSTOP_STRETCH = 1.5;
/**
 * 格闘のヒットストップ(自分の止め・相手の止め)の長さの倍率の叩き台(1.25)。★まだどこにも掛けていない(要裁定・2026-11-27):
 * 格闘の自分の止めは技の時計そのものを止める(brawlerApplyHitstop)ので、伸ばすと押しの距離・固まりの長さ・5段/飛び蹴りのつながり・
 * 秘奥義の先行入力の間隔・ハメ防止の切れ目まで変わる(store のテスト34件で実測)=「絵だけ」の変更にならない。
 */
export const BRAWLER_HITSTOP_STRETCH = 1.25;
/** 止めの長さを倍率で伸ばす(整数 ms)。 */
export const stretchStopMs = (ms: number, k = MELEE_HITSTOP_STRETCH): number => (ms > 0 ? Math.round(ms * k) : 0);

// ---- 1. 動き→止まり(キーフレーム) ----

/** 姿勢から姿勢へ移る時間(ms)。この間だけ動き(速く出て減速)、それ以外は止まっている。 */
export const CRISP_MOVE_MS = 55;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
/** 移りの曲線(速く出て減速・最初の1割だけ短く加速=瞬間移動しない)。0..1 → 0..1。 */
export const crispEase = (u: number): number => {
  const x = clamp01(u);
  const g = 1 - (1 - x) * (1 - x) * (1 - x); // 速く出て減速
  const k = Math.min(1, x / 0.15);             // 最初の15%だけ加速して入る(出だしの速度0)
  return g * k * k * (3 - 2 * k);
};
export interface CrispKey { at: number; v: number }
/**
 * キーフレームの値。keys は時刻の昇順。el < keys[0].at の間は v0。各キーの時刻 at から moveMs かけて前の値からそのキーの値へ移り、次のキーまで止まる。
 * 次のキーが移りの途中に来たら、その時点の値から次へ移る(値は途切れない)。
 */
export const crispKeyframes = (el: number, keys: readonly CrispKey[], moveMs = CRISP_MOVE_MS, v0 = 0): number => {
  let v = v0;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (!(el >= k.at)) break;
    const nextAt = i + 1 < keys.length ? keys[i + 1].at : Infinity;
    const until = Math.min(el, nextAt);
    const u = moveMs > 0 ? (until - k.at) / moveMs : 1;
    v = v + (k.v - v) * crispEase(u);
  }
  return v;
};
/**
 * 続いた曲線(raw: 経過 ms → 値)を「動き→止まり」に作り直す。from..to を stepMs おきに見て、向きが変わる所(山・谷)と breaks(当たりの瞬間など)を
 * 姿勢の時刻とし、各姿勢へはその時刻の moveMs 前から素早く移って着き、次の姿勢へ移るまで止まる(元の曲線の山・谷の時刻と値は変えない)。
 * el が from..to の外なら raw をそのまま返す。
 */
export const crispCurve = (
  raw: (el: number) => number, el: number, from: number, to: number, breaks: readonly number[] = [], moveMs = CRISP_MOVE_MS, stepMs = 6,
): number => {
  if (!(el >= from) || !(el <= to) || !(to > from)) return raw(el);
  const pts: { t: number; v: number }[] = [];
  const ts: number[] = [];
  for (let t = from; t < to; t += stepMs) ts.push(t);
  ts.push(to);
  for (const b of breaks) if (b > from && b < to) { ts.push(b - 0.01, b); }
  ts.sort((a, b) => a - b);
  for (const t of ts) pts.push({ t, v: raw(t) });
  // 姿勢の時刻: 始点・終点・向きが変わる所・breaks の直前と直後。
  const keyT: { t: number; v: number }[] = [pts[0]];
  const isBreak = (t: number) => breaks.some(b => Math.abs(t - b) < 0.02 || Math.abs(t - (b - 0.01)) < 0.02);
  let prevDir = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.sign(pts[i + 1].v - pts[i].v);
    const dPrev = Math.sign(pts[i].v - pts[i - 1].v);
    if (dPrev !== 0) prevDir = dPrev;
    if (isBreak(pts[i].t) || (d !== 0 && prevDir !== 0 && d !== prevDir)) keyT.push(pts[i]);
  }
  keyT.push(pts[pts.length - 1]);
  // 着く時刻=姿勢の時刻。移り始め=着く時刻の moveMs 前(前の姿勢の時刻より前には戻らない)。
  let v = keyT[0].v;
  for (let i = 1; i < keyT.length; i++) {
    const arrive = keyT[i].t, prevT = keyT[i - 1].t;
    const start = Math.max(prevT, arrive - moveMs);
    if (el < start) return v;
    if (el < arrive) return v + (keyT[i].v - v) * crispEase((el - start) / Math.max(1e-6, arrive - start));
    v = keyT[i].v;
  }
  return v;
};

// ---- 2. 止める時刻 ----

/**
 * 止めの段取り。hitSince=当たった瞬間の振りの経過(ms)・drawSince=絵の中で武器が敵の中心に一番近づく経過(ms)・selfMs=自分の振りの止め・enemyMs=敵の止め(当たった瞬間から)。
 * stopSince=絵の時計を止める経過(当たりより早い絵へは戻さない)・enemyMs=敵の止め(当たった瞬間から・絵の止めが明けるまでより短くしない)。
 */
export const meleeStopPlan = (hitSince: number, drawSince: number, selfMs: number, enemyMs: number): { stopSince: number; enemyMs: number } => {
  const h = Number.isFinite(hitSince) ? hitSince : 0;
  const stopSince = Math.max(h, Number.isFinite(drawSince) ? drawSince : h);
  return { stopSince, enemyMs: Math.max(enemyMs, stopSince - h + Math.max(0, selfMs)) };
};
/** 経過 from..to を stepMs おきに見て、点 tip(el) が target に一番近い経過(ms)。tip が null の時刻は飛ばす。 */
export const closestSince = (
  tip: (el: number) => { x: number; y: number } | null, target: { x: number; y: number }, from: number, to: number, stepMs = 2,
): number => {
  let best = from, bestD = Infinity;
  for (let t = from; t <= to + 1e-6; t += stepMs) {
    const p = tip(t);
    if (!p) continue;
    const d = Math.hypot(p.x - target.x, p.y - target.y);
    if (d < bestD - 1e-9) { bestD = d; best = t; }
  }
  return best;
};

// ---- ナイフの絵の通り道(pixi の手のナイフと同じ式・座標は unit 比・胸=原点・右向き・下が正) ----

/** frame1→frame2 の切り替え(kt 0..1)。ここまでナイフは構えの位置で止まっている。 */
export const KNIFE_SWING_SWITCH = 0.3;
/** 振り上げの出始めを構えの拳より手前(後ろ下)へ取る角度(rad)。 */
export const KNIFE_SWING_START_BACK_RAD = (50 * Math.PI) / 180;
/** スイングの時間イージング(ゆっくり→速く→ゆっくり)。 */
export const meleeSwingEase = (t: number): number => t * t * (3 - 2 * t);
/** 弧が育ち切る kt(カウンターの受付が閉じる時刻の割合をイージングに通した値)。 */
export const meleeArcRunEnd = (acceptMs: number, swingMs: number): number => meleeSwingEase(acceptMs / Math.max(1, swingMs));
/** 弧の進み u(kt → 0..1)。 */
export const meleeArcProgress = (kt: number, runEnd: number): number =>
  clamp01((kt - KNIFE_SWING_SWITCH) / Math.max(1e-6, runEnd - KNIFE_SWING_SWITCH));
export interface KnifeCircle { cy: number; r: number; a0: number; sweep: number }
/** 構えの拳(s)→振り上げた拳(e)を通る円(中心は体の縦の中心線上)。前下 → 前 → 上 → 頭の後ろ上 へ回る。 */
export const knifeSwingCircle = (sx: number, sy: number, ex: number, ey: number): KnifeCircle => {
  const cy = (sx * sx + sy * sy - ex * ex - ey * ey) / (2 * (sy - ey));
  const r = Math.hypot(sx, sy - cy);
  const a0 = Math.atan2(sy - cy, sx), a1 = Math.atan2(ey - cy, ex);
  return { cy, r, a0, sweep: a1 - a0 + (a1 > a0 ? -Math.PI * 2 : 0) };
};
/** 円の進み u での拳の角度(startBack=出始めを構えの拳より手前へ取る角度)。 */
export const knifeCircleAngle = (c: KnifeCircle, u: number, startBack = KNIFE_SWING_START_BACK_RAD): number =>
  c.a0 + startBack + (c.sweep - startBack) * u;
/**
 * 近接専用ポーズ(職業ごとの絵)の拳の位置(絵の px・dx=横の中心から前へ・up=足元から上へ)。-ready=低く構えた前の拳 / -swing=振り上げた拳。
 * 近接ポーズの絵は幅 PLAYER_ART_BASE_W(78)で描く=絵の px=世界の px(遠近の倍率は unit と打ち消し合う)。
 */
export const PLAYER_MELEE_FISTS: Record<string, { texH: number; low: { dx: number; up: number }; raised: { dx: number; up: number } }> = {
  'player-striker-melee':   { texH: 66, low: { dx: 15, up: 24 }, raised: { dx: -10, up: 61 } },
  'player-magnum-melee':    { texH: 64, low: { dx: 7, up: 21 },  raised: { dx: -17, up: 60 } },
  'player-shotgun-melee':   { texH: 66, low: { dx: 7, up: 24 },  raised: { dx: -5, up: 62 } },
  'player-scavenger-melee': { texH: 64, low: { dx: 10, up: 21 }, raised: { dx: -12, up: 60 } },
};
/** 近接に専用2ポーズ絵を持つクラス→ファイル接頭辞(-ready=構え / -swing=振り抜き)。 */
export const MELEE_POSE_PREFIX: Record<string, string> = {
  necromancer: 'player-striker-melee', // スカベンジャー
  mage: 'player-magnum-melee',         // マークスマン
  warrior: 'player-shotgun-melee',     // ヘビーガンナー
  rogue: 'player-scavenger-melee',     // ストライカー
};
/** 拳の円(unit 比)。pxPerUnit=絵の px を unit 比に直す割り(=本体の縦の倍率 ÷ unit)。ポーズが無ければ null。 */
export const knifeCircleForFists = (prefix: string | undefined, pxPerUnit: number): KnifeCircle | null => {
  const f = prefix ? PLAYER_MELEE_FISTS[prefix] : undefined;
  if (!f || !(pxPerUnit > 0)) return null;
  return knifeSwingCircle(f.low.dx * pxPerUnit, 0.5 - f.low.up * pxPerUnit, f.raised.dx * pxPerUnit, 0.5 - f.raised.up * pxPerUnit);
};
/** 手のナイフの刃先が拳から外へ出る長さ(unit 比・実絵の対角線 0.5 の柄の寄り 0.26 から: 0.5×0.26 + 0.5/2)。 */
export const KNIFE_TIP_REACH_U = 0.5 * 0.26 + 0.25;
/**
 * 手のナイフの刃先(unit 比)。since=振り始めからの ms・swingMs=振りの表示の長さ・down=振り下ろし(2段目=振り上げた拳 → 構えの拳)。
 * pixi の手のナイフ(placeKnifeCircle)と同じ時計・同じ円。
 */
export const knifeTipAt = (since: number, swingMs: number, runEnd: number, c: KnifeCircle, down: boolean): { x: number; y: number } => {
  const kt = meleeSwingEase(clamp01(since / Math.max(1, swingMs)));
  const u = kt < KNIFE_SWING_SWITCH ? 0 : meleeArcProgress(kt, runEnd);
  const ang = down ? knifeCircleAngle(c, 1 - u, 0) : knifeCircleAngle(c, u);
  const hx = Math.cos(ang) * c.r, hy = c.cy + Math.sin(ang) * c.r;
  return { x: hx + Math.cos(ang) * KNIFE_TIP_REACH_U, y: hy + Math.sin(ang) * KNIFE_TIP_REACH_U };
};
/**
 * ナイフの刃先が敵の体の中心に一番近づく振りの経過(ms)。fwd/up=敵の体の中心の、自分の胸からの位置(世界 px・fwd=向いている側が正・y=下が正)。
 * unitPx=体の箱の高さ(世界 px)・pxPerUnit=絵の px→unit 比。ポーズが無い(円が無い)時は windupMs(=刃が出る時刻)。
 */
export const knifeHitstopDrawSince = (
  opts: { fwd: number; dy: number; unitPx: number; pxPerUnit: number; prefix?: string; down: boolean; swingMs: number; runEnd: number; windupMs: number },
): number => {
  const c = knifeCircleForFists(opts.prefix, opts.pxPerUnit);
  if (!c || !(opts.unitPx > 0)) return opts.windupMs;
  const target = { x: opts.fwd / opts.unitPx, y: opts.dy / opts.unitPx };
  // 刃が動いている区間(構えから弧が育ち切るまで)だけを見る。
  const tStart = 0, tEnd = opts.swingMs;
  return closestSince(t => knifeTipAt(t, opts.swingMs, opts.runEnd, c, opts.down), target, tStart, tEnd, 2);
};

// ---- 刀の斬撃の絵(utils/katanaSlashSheet katanaSlashPose の「出」=尾を固定して刃先へ伸びる) ----

/**
 * 刀の斬撃の絵で刃先が斬撃の中心(=当たった敵の中心)に来る進み t(0..1)。出の区間で見せる割合 reveal が 0.5 に届く所。
 * reveal = 0.2 + 0.8·easeOutCubic(a)・a = t/out。
 */
export const katanaSlashCenterT = (out: number): number => {
  const g = (0.5 - 0.2) / 0.8;               // easeOutCubic(a) = g
  const a = 1 - Math.cbrt(1 - g);
  return a * out;
};

/** 本人の刀の自分の振りの止め(斬撃の絵の時計を止める長さ・ms・叩き台=ナイフの2段目と同じ 60×MELEE_HITSTOP_STRETCH)。 */
export const KATANA_SELF_STOP_MS = stretchStopMs(60);

// ---- 絵の時計の止め(ナイフの knifeSwingDrawSince と同じ形) ----

/** 振りの絵の時計を、stopSince の所で selfMs だけ止める(値は連続)。stopSince<0 / selfMs<=0 ならそのまま。 */
export const drawSinceWithStop = (rawSince: number, stopSince: number, selfMs: number): number => {
  if (!(stopSince >= 0) || !(selfMs > 0) || !(rawSince >= 0)) return rawSince;
  if (rawSince <= stopSince) return rawSince;
  return rawSince - Math.min(rawSince - stopSince, selfMs);
};

// ---- ★空振りの「決めの間」(社長指示2026-11-27「攻撃系、当たった時だけ揺れが動かなくなってる。当たらなくても止めて。」・描画だけ) ----

/** 空振りでも振りの絵の決め(武器が一番伸びた所)で止める長さ(ms・叩き台)。当たった時は自分の止めと長い方を採る(二重にしない)。 */
export const MELEE_WHIFF_HOLD_MS = 70;

/**
 * 空振りの決めの間の絵の時計。keyAt=決めの経過(当たる時刻=武器が一番伸びた所)・endAt=振りの絵が終わる経過・holdMs=止める長さ。
 * keyAt までそのまま → keyAt で holdMs 止まる → 残り(keyAt..endAt)を少し速めて endAt にちょうど着く(絵の終わる時刻は今と同じ=次の段の絵とぶつからない)。
 * 値は連続(明けで跳ばない)。判定・段の間隔・隙・移動は触らない(絵の時計だけ)。止める余地が無い(endAt−keyAt ≤ holdMs)ならそのまま。
 */
export const whiffHoldSince = (rawSince: number, keyAt: number, endAt: number, holdMs = MELEE_WHIFF_HOLD_MS): number => {
  if (!(holdMs > 0) || !(rawSince > keyAt) || !(endAt - keyAt > holdMs) || !(rawSince < endAt)) return rawSince;
  if (rawSince <= keyAt + holdMs) return keyAt;
  return keyAt + (rawSince - keyAt - holdMs) * ((endAt - keyAt) / (endAt - keyAt - holdMs));
};

/**
 * 振りの体の姿勢の絵の時計(ナイフ・鞭・刀=プレイヤー本人)。hit=この振りの自分の止め(当たった時・stopSince=止めた経過・selfMs=止めの長さ)。
 * 当たった時=今の自分の止め(長さは MELEE_WHIFF_HOLD_MS と長い方)・空振り=決めの間(whiffHoldSince)。
 */
export const meleePoseSince = (
  rawSince: number, hit: { stopSince: number; selfMs: number } | null, keyAt: number, endAt: number, holdMs = MELEE_WHIFF_HOLD_MS,
): number => (hit && hit.stopSince >= 0
  ? drawSinceWithStop(rawSince, hit.stopSince, Math.max(hit.selfMs, holdMs))
  : whiffHoldSince(rawSince, keyAt, endAt, holdMs));
