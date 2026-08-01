// ボスメーカー3便目「台本エディタ」の純関数層(BOSS_MAKER.md §11・社長指示v0.25.2642)。
//
// ★社長の言い方の確定(v0.25.2632): 「**台本の数の+-** / **技の段は入れ放題**」。
//   = 増減ボタンが操作するのは**台本(ストリング)の本数**であって、段(技)の数ではない。
//   段は好きなだけ積める(ただし際限なしは事故のもとなので上限だけ置く)。
//
// なぜ純関数に切り出すか(CLAUDE.md 実装精度の規律4): 台本は**ボスの手そのもの**なので、
// 壊れた台本(空・不正な技名・ゾーン不整合)が1つ混ざるとボスが固まる/技が出なくなる。
// UIに直書きすると壊れ方をテストできないので、編集・検証・直列化を全部ここへ集める。
//
// ★**その場で書き換える**(新しい配列を返さない)。テーブルはゲームが毎フレーム読んでいる実体で、
// 参照を差し替えると読んでいる側(`idolStrings()` 経由の抽選)が古い配列を見続けるため。
import type { BossZone, StringScript } from './bossSkeleton';

/** 台本の本数の上限。多すぎると社長が一覧できない=道具として使えない。 */
export const SCRIPT_MAX = 24;
/** 1本あたりの段数の上限(「入れ放題」だが無限ではない)。フェーズ上限で切られる先まで積める。 */
export const SCRIPT_STEP_MAX = 8;

export const SCRIPT_ZONES: readonly BossZone[] = ['melee', 'near', 'mid', 'far'];

export interface ScriptEditResult { ok: boolean; message: string }
const OK: ScriptEditResult = { ok: true, message: '' };

const inRange = (i: number, n: number): boolean => Number.isInteger(i) && i >= 0 && i < n;

/**
 * 台本を1本足す。**既存の1本目を複製せず、指定の技1段だけ**で作る
 * (複製にすると「増やしたのに同じものが2本」で気づきにくい)。
 */
export const addScript = <M extends string>(
  list: StringScript<M>[], zone: BossZone, firstMove: M, weight = 30,
): ScriptEditResult => {
  if (list.length >= SCRIPT_MAX) return { ok: false, message: `台本は${SCRIPT_MAX}本までです` };
  list.push({ zone, weight, moves: [firstMove] });
  return { ok: true, message: `台本を1本足しました(${list.length}本)` };
};

/** 台本を1本消す。**最後の1本は消させない**(台本ゼロ=ボスが何もしなくなる)。 */
export const removeScript = <M extends string>(
  list: StringScript<M>[], index: number,
): ScriptEditResult => {
  if (!inRange(index, list.length)) return { ok: false, message: '無い台本です' };
  if (list.length <= 1) return { ok: false, message: '最後の1本は消せません(ボスが何もしなくなります)' };
  list.splice(index, 1);
  return { ok: true, message: `台本を1本消しました(${list.length}本)` };
};

export const setScriptZone = <M extends string>(
  list: StringScript<M>[], index: number, zone: BossZone,
): ScriptEditResult => {
  if (!inRange(index, list.length)) return { ok: false, message: '無い台本です' };
  list[index] = { ...list[index], zone };
  return OK;
};

export const setScriptWeight = <M extends string>(
  list: StringScript<M>[], index: number, weight: number,
): ScriptEditResult => {
  if (!inRange(index, list.length)) return { ok: false, message: '無い台本です' };
  if (!Number.isFinite(weight)) return { ok: false, message: '数値ではありません' };
  list[index] = { ...list[index], weight: Math.max(0, Math.round(weight)) };
  return OK;
};

/**
 * 台本を on/off する(BOSS_MAKER.md §15「台本の on/off」)。**重みと段は一切触らない**——
 * 消す/重み0にするのと違い、いつでも元どおりに戻せる一時的な除外。
 * **最後に生きている(=on の)1本は off にできない**(全部offにすると removeScript の
 * 「最後の1本」と同じ理由でボスが何もしなくなる)。
 */
export const toggleScript = <M extends string>(
  list: StringScript<M>[], index: number,
): ScriptEditResult => {
  if (!inRange(index, list.length)) return { ok: false, message: '無い台本です' };
  const turningOff = !list[index].off;
  if (turningOff) {
    const aliveAfter = list.filter((s, i) => i !== index && !s.off).length;
    if (aliveAfter === 0) return { ok: false, message: '最後の1本はoffにできません(ボスが何もしなくなります)' };
  }
  // off:false を明示的に持たせない(既存の保存/直列化と形を揃える=旧来のオブジェクトと一致させる)。
  const next: StringScript<M> = { ...list[index] };
  if (turningOff) next.off = true; else delete next.off;
  list[index] = next;
  return { ok: true, message: turningOff ? `台本${index + 1}本目をoffにしました` : `台本${index + 1}本目をonに戻しました` };
};

/** 段の技を差し替える。 */
export const setStep = <M extends string>(
  list: StringScript<M>[], si: number, mi: number, move: M,
): ScriptEditResult => {
  if (!inRange(si, list.length)) return { ok: false, message: '無い台本です' };
  const moves = [...list[si].moves];
  if (!inRange(mi, moves.length)) return { ok: false, message: '無い段です' };
  moves[mi] = move;
  list[si] = { ...list[si], moves };
  return OK;
};

/** 段を `mi` の**後ろ**へ1つ挿す(`mi<0` で先頭へ)。 */
export const insertStep = <M extends string>(
  list: StringScript<M>[], si: number, mi: number, move: M,
): ScriptEditResult => {
  if (!inRange(si, list.length)) return { ok: false, message: '無い台本です' };
  const moves = [...list[si].moves];
  if (moves.length >= SCRIPT_STEP_MAX) return { ok: false, message: `段は${SCRIPT_STEP_MAX}つまでです` };
  const at = Math.max(0, Math.min(moves.length, mi + 1));
  moves.splice(at, 0, move);
  list[si] = { ...list[si], moves };
  return OK;
};

/** 段を1つ消す。**最後の1段は消させない**(空の台本は抽選で選ばれた瞬間に何も出ない)。 */
export const removeStep = <M extends string>(
  list: StringScript<M>[], si: number, mi: number,
): ScriptEditResult => {
  if (!inRange(si, list.length)) return { ok: false, message: '無い台本です' };
  const moves = [...list[si].moves];
  if (!inRange(mi, moves.length)) return { ok: false, message: '無い段です' };
  if (moves.length <= 1) return { ok: false, message: '最後の1段は消せません' };
  moves.splice(mi, 1);
  list[si] = { ...list[si], moves };
  return OK;
};

/** 段を前後へ入れ替える(並べ替え)。 */
export const moveStep = <M extends string>(
  list: StringScript<M>[], si: number, mi: number, dir: -1 | 1,
): ScriptEditResult => {
  if (!inRange(si, list.length)) return { ok: false, message: '無い台本です' };
  const moves = [...list[si].moves];
  const to = mi + dir;
  if (!inRange(mi, moves.length) || !inRange(to, moves.length)) return { ok: false, message: '端です' };
  [moves[mi], moves[to]] = [moves[to], moves[mi]];
  list[si] = { ...list[si], moves };
  return OK;
};

/**
 * ★**フェーズ上限で切り捨てられる段**の位置(0始まり)。これ以降の段は**実戦で一度も出ない**。
 * `pickStringScript` が `moves.slice(0, stringMaxLen(phase))` するため。
 * エディタはここから先を薄く表示して「書いたのに出ない」を目で分かるようにする
 * (社長要望v0.25.2632「stringLenで切られるところを見せる」)。
 */
export const stepCutoffIndex = (phase1Len: number, phase2Len: number): { p1: number; p2: number } =>
  ({ p1: Math.max(1, Math.round(phase1Len)), p2: Math.max(1, Math.round(phase2Len)) });

// ---- 直列化(保存・コピー・貼り戻し) --------------------------------------------------------------
// 形式: `zone|weight|move,move,...` を `;` で連結。**人が読めて1行に収まる**ことを優先
// (機械用JSONの中に入れるので、行が増えると貼り付け文が読めなくなる)。
// off(BOSS_MAKER.md §15-2-5)は **zone 側へ接頭辞 `-`** を付けて表す(例 `-near|40|fan,orb`)。
// **接頭辞が無ければ従来どおり有効**=off を知らない古い保存もそのまま読める(後方互換)。
export const serializeScripts = <M extends string>(list: readonly StringScript<M>[]): string =>
  list.map(s => `${s.off ? '-' : ''}${s.zone}|${s.weight}|${s.moves.join(',')}`).join(';');

/**
 * 読み戻す。**壊れた行は捨てて残りを活かす**(1行の打ち間違いで全部消えると復旧できない)。
 * `validMoves` に無い技名は捨てる=技を消した後の古い保存を読んでもボスが固まらない。
 * 段が全部消えた台本は落とす。結果が空なら null(=呼び出し側は既定のままにする)。
 */
export const parseScripts = <M extends string>(
  text: string, validMoves: readonly M[],
): StringScript<M>[] | null => {
  const okMove = new Set<string>(validMoves);
  const okZone = new Set<string>(SCRIPT_ZONES);
  const out: StringScript<M>[] = [];
  for (const row of text.split(';')) {
    const part = row.split('|');
    if (part.length !== 3) continue;
    const [zoneRaw, w, moves] = part;
    // 先頭 `-` = off。無ければ(古い保存も含めて)on として読む。
    const off = zoneRaw.startsWith('-');
    const zone = off ? zoneRaw.slice(1) : zoneRaw;
    if (!okZone.has(zone)) continue;
    const weight = Number(w);
    if (!Number.isFinite(weight) || weight < 0) continue;
    const ms = moves.split(',').filter(m => okMove.has(m)) as M[];
    if (ms.length === 0) continue;
    if (out.length >= SCRIPT_MAX) break;
    const row2: StringScript<M> = { zone: zone as BossZone, weight: Math.round(weight), moves: ms.slice(0, SCRIPT_STEP_MAX) };
    if (off) row2.off = true;
    out.push(row2);
  }
  return out.length > 0 ? out : null;
};

/** 台本の中身を丸ごと差し替える(**参照は保つ**=ゲームが読んでいる配列そのものを書き換える)。 */
export const replaceScripts = <M extends string>(
  list: StringScript<M>[], next: readonly StringScript<M>[],
): void => {
  list.length = 0;
  for (const s of next) {
    const row: StringScript<M> = { zone: s.zone, weight: s.weight, moves: [...s.moves] };
    if (s.off) row.off = true; // off も一緒に運ぶ(reset/deserializeの経路でここを通す)
    list.push(row);
  }
};

/**
 * 台本の健全性チェック(エディタの警告表示用)。**止めない**——社長が作業途中の状態を
 * 「壊れている」と言って弾くと道具にならないので、**気づける形で見せる**だけにする。
 */
export const scriptWarnings = <M extends string>(
  list: readonly StringScript<M>[], zonesInUse: readonly BossZone[] = SCRIPT_ZONES,
): string[] => {
  const out: string[] = [];
  for (const z of zonesInUse) {
    // off の台本は「生きている」と数えない(BOSS_MAKER.md §15-2-6)= 重み0と同じ扱い。
    if (!list.some(s => s.zone === z && !s.off && s.weight > 0)) {
      out.push(`${z}: 重み>0の台本が無い(この距離では何も出ない)`);
    }
  }
  for (const [i, s] of list.entries()) {
    if (s.off) continue; // offは社長が意図して外した状態なので、個別の警告(段が空/重み0)は出さない
    if (s.moves.length === 0) out.push(`${i + 1}本目: 段が空`);
    if (s.weight === 0) out.push(`${i + 1}本目: 重み0(抽選に出ない)`);
  }
  return out;
};
