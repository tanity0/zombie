// 案山子(変異体対策室の「練習」枠だけに立つ打ち込み台)。社長指示2026-11-19:
// 「変異体対策室の最後に、案山子 を追加。こいつは雑魚扱いで、HPは無限で何もしないサンドバック。練習用」。
//
// ★このモジュールは**依存ゼロの葉**(型だけ借りる)。gameStore / pixiScene / bossPractice の
//   3方向から引かれるので、どれか1つに置くと循環importになる。
//
// 決まりごと(どこで効いているか):
//  - 区分=雑魚。isBossType 等のどの表にも載せない=全ての武器・技が雑魚として扱う
//    (押し・浮かせ・掴み・追撃)。
//  - 体力は減らない: 敵の体力を減らす合流点(gameStore の各近接経路と damageEnemy)が
//    `enemyHealthAfterHit` を通る。数字・ヒットストップ・のけぞりは普段どおり出るが、体力が0にならない
//    =撃破・撃破数・落とし物・経験値・年表・熟練度の撃破分はどれも起きない。
//  - 気絶中の近接の即死(処刑)は**体力を経由しない**ので、裁定(utils/meleeExecute.stunnedMeleeOutcome)で
//    即死を返さない(強個体と同じ「重い一撃」になる。倒れない的に「即死」は成り立たないため)。
//  - 動かない・攻撃しない: updateEnemies の追跡AIの手前で抜ける(押されて飛ぶ所までは他の雑魚と同じ)。
//    接触ダメージは0(ENEMY_STATS)=体当たりも噛みつきも成立しない。
//  - 湧くのは対策室の「練習」枠だけ(useGameLoop の `practiceForces('scarecrownow')`)。
import type { EnemyType } from '../types/game';

export const SCARECROW_TYPE: EnemyType = 'scarecrow';
export const isScarecrow = (t: EnemyType | string): boolean => t === 'scarecrow';

/**
 * 絵(社長支給2026-11-19・`public/sprites/scarecrow.png`・150×66=1コマ 50×66 の横3コマ)。
 * 0=直立 / 1・2=傾き。**絵の差し替えはこの1行**(ファイル名かコマ数が変わった時だけ)。
 */
export const SCARECROW_SHEET = 'scarecrow';
export const SCARECROW_FRAMES = 3;

/** 被弾後の体力。案山子だけは減らない(=倒れない)。それ以外の敵は従来の式そのまま。 */
export const enemyHealthAfterHit = (enemy: { type: EnemyType; health: number }, dmg: number): number =>
  isScarecrow(enemy.type) ? enemy.health : Math.max(0, enemy.health - dmg);

/**
 * 被弾の揺れのコマ割り(被弾からの経過ms → コマ番号)。1→2→1→0。
 * 慣性: 打たれた瞬間に一気に傾き(1は一瞬)、いちばん傾いた所で少し粘り、ゆっくり戻る。
 * 打たれるたびに頭から(呼び手が最後の被弾時刻から測る)。
 */
export const SCARECROW_SWAY_STEPS: readonly { untilMs: number; frame: number }[] = [
  { untilMs: 60, frame: 1 },
  { untilMs: 230, frame: 2 },
  { untilMs: 470, frame: 1 },
];
export const SCARECROW_SWAY_MS = SCARECROW_SWAY_STEPS[SCARECROW_SWAY_STEPS.length - 1].untilMs;
export const scarecrowSwayFrame = (sinceHitMs: number): number => {
  if (!Number.isFinite(sinceHitMs)) return 0;
  // 負=ヒットストップで描画の時計が被弾の瞬間より手前に止まっている間。打たれた直後のコマを出す。
  const t = Math.max(0, sinceHitMs);
  for (const s of SCARECROW_SWAY_STEPS) if (t < s.untilMs) return s.frame;
  return 0;
};

/**
 * 揺れの向きと始まりの決め方(社長指示2026-11-19「打たれた向きによって反転させて」「燃焼系は揺れるだけにして」)。
 * 絵の1・2コマ目は**左へ傾く**(実測: 上の重心が中心より左・下の重心が右=頭が左へ倒れる)。
 *
 * - **直接の当たり**: 揺れを頭から始め直し、向きを決め直す=**打たれた側の反対へ**傾く。
 *   押されている最中(このフレームの押しの向きが分かる)なら押された向き。無ければ攻め手(プレイヤー)の居る側の反対。
 *   攻め手が真上・真下で左右が決まらない時は前の向きのまま。
 * - **持続ダメージ**(燃焼・延焼・毒・召喚や味方の当たり=向きを持たない 'dot' の当たり): 揺れるだけ。
 *   揺れている最中なら何もしない(始め直さない)。揺れていなければ普通に揺れ始める。向きは決めない(前の向き・既定は絵の素の左)。
 * 返り値は書き足す欄(無ければ null=何もしない)。
 */
export interface ScarecrowSwayInput {
  x: number; width: number;
  lastHit: number;
  lastHitDotAt?: number;
  scarecrowSwayAt?: number;
  scarecrowLeanLeft?: boolean;
  scarecrowSwayFor?: number;
  knockbackUntil?: number;
  knockbackVx?: number;
}
export type ScarecrowSwayPatch = Pick<ScarecrowSwayInput, 'scarecrowSwayAt' | 'scarecrowLeanLeft' | 'scarecrowSwayFor'>;
export const scarecrowSwayStep = (
  e: ScarecrowSwayInput,
  attackerX: number | null,
  nowMs: number,
): ScarecrowSwayPatch | null => {
  if (!(e.lastHit > 0) || e.lastHit === e.scarecrowSwayFor) return null;
  const dot = e.lastHitDotAt === e.lastHit;
  if (dot) {
    const playing = e.scarecrowSwayAt !== undefined && e.lastHit - e.scarecrowSwayAt < SCARECROW_SWAY_MS;
    return playing ? { scarecrowSwayFor: e.lastHit } : { scarecrowSwayFor: e.lastHit, scarecrowSwayAt: e.lastHit };
  }
  const cx = e.x + e.width / 2;
  const kvx = e.knockbackVx ?? 0;
  let leanLeft = e.scarecrowLeanLeft;
  if (e.knockbackUntil !== undefined && e.knockbackUntil > nowMs && Math.abs(kvx) > 1) leanLeft = kvx < 0;
  else if (attackerX !== null && Math.abs(attackerX - cx) > 2) leanLeft = attackerX > cx;
  return { scarecrowSwayFor: e.lastHit, scarecrowSwayAt: e.lastHit, ...(leanLeft !== undefined ? { scarecrowLeanLeft: leanLeft } : {}) };
};

/** 描画の左右(1=絵のまま=左へ傾く / -1=反転=右へ傾く)。揺れの後も向きは保つ(直立の0コマ目へ戻る瞬間に裏返らない)。 */
export const scarecrowFaceMul = (leanLeft: boolean | undefined): number => (leanLeft === false ? -1 : 1);
