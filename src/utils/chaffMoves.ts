// PACING_PUZZLE.md §16(雑魚の「詰めさせない技」・v4=平坦化版2026-09-16)の**共通部**。
// §16-8b の実装順 1〜4(名前と型 / enemyBite.ts の土台 / combatTick.ts / gameStore.ts の共通部)の
// うち、bat/skeleton/ゾンビの個別の状態機械(§16-8b 5〜7)に**依存しない**土台だけをここへ置く
// (§16-8「新しい定数は1ファイル(例 src/utils/chaffMoves.ts)にまとめ」)。
//
// ★§16-8b手順5(ゾンビの状態機械=gameStore.ts)でこのファイルの `deriveChaffMoveGrants` /
// `endChaffMove` を初めて呼ぶようになった。bat/skeleton(手順6〜7)はまだ未実装で、
// `CHAFF_MOVE_TYPES` には残っているが `wantsSlot` 側(下・ゾンビ専用)が型で弾くので
// 挙動には出ない。
//
// レンダラ非依存の純関数(src/utils)=ヘッドレスでユニットテスト可能。
import type { Enemy, EnemyType } from '../types/game';
import { biteSpecFor } from './enemyBite';

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
  // ★z-lunge-in(検収監査A-2): ゾンビは§16-7b「chaffMoveの立つ位置」がz-lunge-inなので、
  // 占有もここから始まる(bat/skeletonの構え開始相と同じ扱い)。
  'z-red-pause', 'z-lunge-in', 'z-bite1', 'z-stagger', 'z-bite2',
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

/**
 * ★技の終わり(PACING_PUZZLE.md §16-7 穴2の訂正・検収監査A-4)。
 *
 * 「正常解決(`biteClears`)では `chaffMove` を消さない・技後CDも書かない」に規則が訂正された
 * ことで、**技の終わり(後退の終わり=s-recover/s-retreatの終わり・ゾンビ2連なら2発目の解決)で
 * `chaffMove` を消し技後CDを書く**役目は**状態機械(§16-8b 5〜7・bat/skeleton/ゾンビの実装。
 * 別バッチ)**に移った。ここはその**公開された1本の関数**——状態機械はここを呼ぶだけでよい
 * (計算式を個別に持たない=biteClears/dashParriedEnemyPatchと同じ「いま出している技」の
 * spec(`biteSpecFor`)から recoverMs を引く作法に揃える)。
 *
 * ★§16-8b手順5(ゾンビ)で初めて呼ばれる(2発目=z-bite2の解決の瞬間・1箇所のみ)。
 * skeleton/batを実装する時も同じ1本をs-retreat/b-releaseの終わりから呼ぶこと
 * (§16-7b「後退の相も技の続きとして扱う。chaffMoveは後退が終わるまで立てたまま」)。
 *
 * ★技後CDに±12%の個体差を掛ける(PACING_PUZZLE.md §16-6「個体差の幅: 技後CD ±12%
 * (`chaffTraits`と同幅)」・§16-7b「停止長・技後CD…用のハッシュ枝を新設する(id由来=決定的。
 * 乱数を引かない)」)。群れの位相をずらすための個体差なので`chaffTraits`とは別の枝(idUnitHash)を
 * 使う(見せたい差ではない=chaffTraitsを流用して結合させない)。
 */
export const endChaffMove = (
  enemy: Pick<Enemy, 'id' | 'type' | 'chaffMove' | 'aiPhase'>,
  gameTime: number,
): Pick<Enemy, 'chaffMove' | 'chaffMoveCdUntil'> => {
  const techSpec = biteSpecFor(enemy.type, enemy.chaffMove, enemy.aiPhase);
  const jitter = 1 + (idUnitHash(enemy.id, CHAFF_CD_JITTER_SALT) * 2 - 1) * CHAFF_CD_JITTER;
  return { chaffMove: undefined, chaffMoveCdUntil: gameTime + techSpec.recoverMs * jitter };
};

// =================================================================================================
// id由来の決定的ハッシュ(§16-7b「個体差の引き方はid由来の決定的なばらつき。乱数を引かない」)。
// `chaffTraits`(chaffMotion.ts)と同じ mix を使うが、**別ファイル**(循環import回避: chaffMotion.ts
// はこのファイルを知らない)なので複製する。salt を変えることで複数の独立した枝を1つのidから取れる
// (chaffTraitsが1つのhからrRole/rSpeed/rTau/rSpinを取り出すのと同じ考え方)。
// =================================================================================================
const mixHash = (h: number): number => {
  let x = h | 0;
  x ^= x >>> 16; x = Math.imul(x, 2246822507);
  x ^= x >>> 13; x = Math.imul(x, 3266489909);
  x ^= x >>> 16;
  return x >>> 0;
};
/** id+salt → 0..1 の決定的な値(毎フレーム呼んでも揺れない・ヘッドレスで再現する)。 */
const idUnitHash = (id: string, salt: number): number => {
  let h = salt | 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) | 0;
  return (mixHash(h) % 100000) / 100000;
};

/** 技後CDの個体差(§16-6「個体差の幅: 技後CD ±12%」)。saltはchaffTraitsの枝と衝突しない値。 */
const CHAFF_CD_JITTER_SALT = 0x43_4451; // 'CDQ' の適当なビット列(単なる枝分け用の定数)
const CHAFF_CD_JITTER = 0.12;

// =================================================================================================
// ゾンビ赤(PACING_PUZZLE.md §16-3・§16-8の台帳)。★§16-8b手順5=このバッチの本体。
// =================================================================================================

/** 帯(§16-3)。外縁に入ったら待ちの尺を引き、内縁に達したら赤/紫が確定する。 */
export const ZOMBIE_BAND_OUTER_PX = 200;
/**
 * 帯の内縁=停止/追尾ループの境界(★§16-3「停止/追尾ループの境界を`MELEE_RADIUS`(74)→100pxへ
 * 上げる。74と100の二重基準にしない」)。旧`MELEE_RADIUS`はプレイヤーの近接リーチという別概念の値で、
 * たまたま同じ用途に流用されていただけなので、ここでは独立した定数として持つ。
 */
export const ZOMBIE_BAND_INNER_PX = 100;
/** 帯に入った時に引く「待ちの尺」の範囲(§16-3「抽選ではなく尺を散らす」・id由来の決定的な値)。 */
export const ZOMBIE_RED_WAIT_MIN_MS = 300;
export const ZOMBIE_RED_WAIT_MAX_MS = 2800;
/** 赤の停止(その場・色なし)。 */
export const ZOMBIE_RED_PAUSE_MS = 2000;
/** 踏み込みの終端=1発目が届く上限(§16-3「射程75pxの根拠」)。 */
export const ZOMBIE_LUNGE_RANGE_PX = 75;
/** 2連の一拍(よろけ)。 */
export const ZOMBIE_STAGGER_MS = 160;
/**
 * 2発目の向きを1発目からわずかにずらす角度(rad)。★台帳に度数の指定は無い(§16-3「向きも
 * 僅かにずらす」とだけ規定)ので、既存の`chaffTraits`と同じ「見せたい差だけ大きく振る」思想の
 * 範囲で叩き台として選んだ実装値(社長裁定を要する数値ではなく演出の微調整=実機で振る)。
 */
export const ZOMBIE_BITE2_ANGLE_OFFSET_RAD = 0.22; // ≒12.6°

/** 帯(200〜100px)に入った時に引く「待ちの尺」(id由来・決定的=乱数を引かない)。 */
export const zombieRedWaitMs = (id: string): number =>
  ZOMBIE_RED_WAIT_MIN_MS + idUnitHash(id, 0x2b1a) * (ZOMBIE_RED_WAIT_MAX_MS - ZOMBIE_RED_WAIT_MIN_MS);

/**
 * ★赤が先(§16-3)。帯の内縁(100px)に達した時、**枠が取れていれば赤**。この関数は
 * `deriveChaffMoveGrants` の `wantsSlot` に渡す「この個体は今フレーム枠を欲しがっているか」の
 * ゾンビ専用実装——「尺切れ **または** 距離が100pxに達した」のどちらか(先に来た方)を
 * `aiPhase==='z-wait'` の間だけ判定する。
 *
 * ★CD中の個体を候補から外すのはここ(呼び手)の仕事(§16-7b「枠の導出はこれを読まない。
 * CD中の個体を候補から外すのは呼び手のwantsSlotの仕事」)。
 */
export const zombieWantsChaffRedSlot = (
  enemy: Pick<Enemy, 'type' | 'aiPhase' | 'aiPhaseUntil' | 'chaffMoveCdUntil' | 'x' | 'y' | 'width' | 'height'>,
  gameTime: number, pcx: number, pcy: number,
): boolean => {
  if (enemy.type !== 'zombie' || enemy.aiPhase !== 'z-wait') return false;
  if (enemy.chaffMoveCdUntil !== undefined && gameTime < enemy.chaffMoveCdUntil) return false;
  const timeUp = enemy.aiPhaseUntil !== undefined && gameTime >= enemy.aiPhaseUntil;
  if (timeUp) return true;
  const ecx = enemy.x + enemy.width / 2, ecy = enemy.y + enemy.height / 2;
  return Math.hypot(pcx - ecx, pcy - ecy) <= ZOMBIE_BAND_INNER_PX;
};
