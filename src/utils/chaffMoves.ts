// PACING_PUZZLE.md §16(雑魚の「詰めさせない技」・v4=平坦化版2026-09-16)の**共通部**。
// §16-8b の実装順 1〜4(名前と型 / enemyBite.ts の土台 / combatTick.ts / gameStore.ts の共通部)の
// うち、bat/skeleton/ゾンビの個別の状態機械(§16-8b 5〜7)に**依存しない**土台だけをここへ置く
// (§16-8「新しい定数は1ファイル(例 src/utils/chaffMoves.ts)にまとめ」)。
//
// ★このファイルはまだ誰にも「使われていない」: `chaffMove` を実際に立てるのは §16-8b 5〜7
// (ゾンビ/bat/skeletonの状態機械。別バッチ)。ここは**土台**で、今回のバッチでは本番挙動を
// 1bitも変えない(chaffMove が undefined の間はすべて no-op)。
//
// レンダラ非依存の純関数(src/utils)=ヘッドレスでユニットテスト可能。
import type { Enemy, EnemyType } from '../types/game';

/** §16の技(雑魚の「詰めさせない技」)を持つ型。lab-zombie/lich等は別バッチで足す(§16-0)。 */
export const CHAFF_MOVE_TYPES: ReadonlySet<EnemyType> = new Set<EnemyType>(['bat', 'skeleton', 'zombie']);

/**
 * ★同時に構えられるのは2体まで(PACING_PUZZLE.md §16-8「同時に構えられる数」・カウンターを
 * 答えとして保つため=820ms周期)。3体目は枠が無いので技に入らない(待たせない・紫へ倒さない)。
 */
export const CHAFF_MOVE_SLOT_CAP = 2;

/**
 * 枠を「占有中」とみなす aiPhase(型ごと)。
 * ★s-recover/s-retreat(硬直・後退)は占有に**数えない**(社長裁定2026-09-16「s-recoverに入った
 * 時点で解放する」・§16-7b)——硬直・後退は「構えて」いないので、ここを占有し続けると2体が
 * 延々と枠を握って3体目が一生技を出さない。bat の b-release(留まる→離す→後ずさる)も同じ理由で
 * 占有しない。b-approach/z-wait(技の間合いに届く前の移動)もまだ「構えて」いないので占有しない
 * (取る=技の間合いに達した瞬間・§16-1)。
 */
const CHAFF_HOLDING_PHASES: ReadonlySet<string> = new Set([
  'b-orbit', 'b-windup', 'b-lunge', 'b-grab',
  's-crouch', 's-arc', 's-bite',
  'z-red-pause', 'z-bite1', 'z-stagger', 'z-bite2',
]);

/** この個体はいま枠(同時に構えられる2体)を占有しているか。 */
export const isChaffSlotHolding = (
  enemy: Pick<Enemy, 'type' | 'aiPhase'>,
): boolean =>
  CHAFF_MOVE_TYPES.has(enemy.type) && enemy.aiPhase !== undefined && CHAFF_HOLDING_PHASES.has(enemy.aiPhase);

/**
 * ★枠の前段(PACING_PUZZLE.md §16-1「枠は"状態"として持たない。毎フレーム導出する」・
 * 実装者視点監査A-6)。
 *
 * `updateEnemies` は `enemies.map(...)` の個体ごとの写像なので、「近い順で2体」は写像の前に
 * 全体を見る前段が要る。カウンタを持ち回すと、死亡・画面外リサイクル・カウンター・クリ気絶で
 * 枠が漏れて「誰も技を出さなくなる」(最悪の壊れ方で、しかも静かに起きる)ため、**このフレームの
 * enemies から毎回作り直す**こと。
 *
 * ★選び方=プレイヤーに近い順(整合監査A-9。配列順だと「常に同じ個体だけが技を出す」に見える)。
 * ★紫の追尾(zrush等)は数えない。型をまたいで数える(bat/skeleton/ゾンビが1つの枠を共有する)。
 *
 * 返り値は「このフレーム、枠を持ってよい個体のid集合」——既に占有中の個体(`isChaffSlotHolding`)と、
 * 空いた枠ぶんだけ`wantsSlot`で「技の間合いに達した」と申告した個体のうち近い順の分。
 * 呼び手(bat/skeleton/ゾンビの状態機械=§16-8b 5〜7)は、自分のidがこの集合に入っているかを見て
 * 構えに入る/入らない(枠を取れなかった個体は§16-1どおり歩いて詰める=旧挙動)を決める。
 */
export const deriveChaffMoveGrants = (
  enemies: readonly Pick<Enemy, 'id' | 'type' | 'aiPhase' | 'x' | 'y' | 'width' | 'height'>[],
  pcx: number, pcy: number,
  wantsSlot: (enemy: Pick<Enemy, 'id' | 'type' | 'aiPhase' | 'x' | 'y' | 'width' | 'height'>) => boolean,
): ReadonlySet<string> => {
  const held = enemies.filter(isChaffSlotHolding);
  const grants = new Set<string>(held.map(e => e.id));
  const openSlots = CHAFF_MOVE_SLOT_CAP - held.length;
  if (openSlots <= 0) return grants;
  const candidates = enemies
    .filter(e => CHAFF_MOVE_TYPES.has(e.type) && !isChaffSlotHolding(e) && wantsSlot(e))
    .map(e => {
      const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
      return { id: e.id, d2: (ecx - pcx) ** 2 + (ecy - pcy) ** 2 };
    })
    .sort((a, b) => a.d2 - b.d2);
  for (let i = 0; i < Math.min(openSlots, candidates.length); i++) grants.add(candidates[i].id);
  return grants;
};

/**
 * ★凍結dtの繰り下げ(PACING_PUZZLE.md §16-7 穴4・実装者視点監査A-3)。
 *
 * `updateEnemies` には AI 本体を丸ごと飛ばす早期return が2本ある(ノックバック/`hitStunUntil`)。
 * その間も store の `gameTime` は進み続けるので、`biteAt` 基準で進捗を出す
 * `biteLungeFrac`(gameStore.ts)は「凍結中に本当は進んでいたはずの分」を**取り戻せないまま
 * 失う**(=距離が消える。bat の掴みは円100px−必要68pxの余白がわずか2pxしか無いので、
 * 殴られながら掴む bat は原理的にほぼ必ず空振る)。
 *
 * 直し方は社長裁定①と同じ作法(`kbOnlyStop` と同型)=**時計を止めて続きから**。この1フレーム
 * ぶん凍結していた(`dtMs`)なら、`biteAt`/`chaffMoveAt`/`aiPhaseUntil`/`chaffMoveCdUntil` を
 * まとめて `dtMs` だけ繰り下げる。
 *
 * ★§12の噛みつき(`chaffMove` が undefined)は1bitも変えない(§16の「ではない」条件=
 * 触るのは§16-8に明記した2値のみ)。§16の技(`chaffMove` が定義されている個体)だけに効く。
 */
export const deferFrozenClocksBy = (enemy: Enemy, dtMs: number): Enemy => {
  if (dtMs <= 0 || enemy.chaffMove === undefined) return enemy;
  const patch: Partial<Enemy> = {};
  if (enemy.biteAt !== undefined && enemy.biteAt > 0) patch.biteAt = enemy.biteAt + dtMs;
  if (enemy.chaffMoveAt !== undefined) patch.chaffMoveAt = enemy.chaffMoveAt + dtMs;
  if (enemy.aiPhaseUntil !== undefined) patch.aiPhaseUntil = enemy.aiPhaseUntil + dtMs;
  if (enemy.chaffMoveCdUntil !== undefined) patch.chaffMoveCdUntil = enemy.chaffMoveCdUntil + dtMs;
  return Object.keys(patch).length > 0 ? { ...enemy, ...patch } : enemy;
};
