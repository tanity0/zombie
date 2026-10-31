// 進軍NPC(軍人)が「見えている」かの判定と、狙い/被弾の候補の組み立て(research/ESCORT_TARGETED.md §3・§7)。
// 画面内の定義は1本: ズーム込みの可視域(isPointInZoomedViewport・英雄と同じ)。
//   - 被弾・狙われる候補 = 可視域ぴったり(余白なし・社長指示「見えない所で倒れない」)。
//   - 動きの切り替え(画面内=索敵/射撃/前進 ⇔ 画面外=1/5の自動進行)= 可視域 + 100px(画面px換算)。
// store の状態は構造的な型で受ける(store を import しない葉モジュール=循環import禁止)。
import type { EscortSoldier } from '../types/game';
import { isPointInZoomedViewport } from './cameraZoom';
import { escortCenter, escortHasHealth, isEscortDowned } from './escortHealth';
import type { EscortAggroCandidate } from './escortAggro';
import { escortIdOfSide, type HateEscortSource } from './bossHate';
import type { Enemy } from '../types/game';

/** 動きの切り替えの余白(画面px。ズームを引いた時は引いた分だけワールドでは広がる)。 */
export const ESCORT_MOTION_MARGIN_PX = 100;

export interface EscortViewState {
  escorts: readonly EscortSoldier[];
  camera: { x: number; y: number };
  gameBounds: { width: number; height: number };
  viewZoom: number;
}

/** 体の中心が見えている範囲(余白なし)に居るか。被弾・狙われる候補の判定。 */
export const escortInHitView = (st: EscortViewState, e: Pick<EscortSoldier, 'x' | 'y'>): boolean => {
  const c = escortCenter(e);
  return isPointInZoomedViewport(c.x, c.y, st.camera, st.gameBounds, st.viewZoom);
};

/** 足元が可視域+100pxに居るか。動きの切り替え(画面内の索敵・射撃 ⇔ 画面外の自動進行)。 */
export const escortInMotionView = (st: Omit<EscortViewState, 'escorts'>, x: number, y: number): boolean =>
  isPointInZoomedViewport(x, y, st.camera, st.gameBounds, st.viewZoom, ESCORT_MOTION_MARGIN_PX);

/** 敵の攻撃が当たる軍人(体力あり・倒れていない・見えている範囲)。無敵かどうかは当てる側(damageEscort)が見る。 */
export const hittableEscorts = (st: EscortViewState): EscortSoldier[] =>
  st.escorts.filter(e => escortHasHealth(e) && !isEscortDowned(e) && escortInHitView(st, e));

/** 雑魚・強個体・ハンターが狙う候補(見えていて倒れていない軍人)。体の中心座標。 */
export const escortAggroCandidates = (st: EscortViewState): EscortAggroCandidate[] =>
  hittableEscorts(st).map(e => { const c = escortCenter(e); return { id: e.id, x: c.x, y: c.y }; });

/** ボスのヘイトの候補: inView=見えていて倒れていない / alive=倒れていない(画面外含む=ロック済みの相手を引く用)。 */
export const hateEscortSource = (st: EscortViewState): HateEscortSource => {
  const toCand = (e: EscortSoldier) => { const c = escortCenter(e); return { id: e.id, x: c.x, y: c.y, vx: e.vx ?? 0, vy: e.vy ?? 0, footY: e.y }; };
  const alive = st.escorts.filter(e => escortHasHealth(e) && !isEscortDowned(e));
  return { inView: alive.filter(e => escortInHitView(st, e)).map(toCand), alive: alive.map(toCand) };
};

/**
 * 「ボスが狙いをこの軍人に決めた」ボスのid一覧(軍人id → ボスid[])。hateTarget が 'escort:<id>' の個体を1回走査して作る。
 * 軍人側が前フレームの一覧と比べて「新しく増えた」瞬間=ボスの赤い予告が自分に掛かった瞬間(台詞の場面フック)を拾う。
 * ★技の溜めに入った個体だけ数える(追いかけ中の狙い替えは予告ではない=台詞を出さない)。
 */
export const escortBossHaters = (enemies: readonly Pick<Enemy, 'id' | 'hateTarget' | 'corpseUntil' | 'bossState'>[]): Map<string, string[]> => {
  const m = new Map<string, string[]>();
  for (const e of enemies) {
    if (e.corpseUntil !== undefined) continue;
    // 賞金首は追いかけ/帰り道の間も毎フレーム hateTarget を書く(近い相手へ向きを替えるだけ)。赤い予告が出ていない=「予告が自分に掛かった」ではない
    // =技の溜めに入った(bossState が chase/return 以外)個体だけ数える。他のボスは技の開始時にしか hateTarget を書かないので影響しない。
    if (e.bossState === 'chase' || e.bossState === 'return') continue;
    const id = escortIdOfSide(e.hateTarget);
    if (id === undefined) continue;
    const arr = m.get(id);
    if (arr) arr.push(e.id); else m.set(id, [e.id]);
  }
  return m;
};
