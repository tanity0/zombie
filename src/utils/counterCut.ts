/**
 * ★カウンターで「出していた1手だけ」を終わらせる(社長指示2026-10-01)。
 *
 * 社長の言葉: **「技をカウンターしたら、立ち絵に戻してその台本の中の1つを終了して間を設ける」**。
 * 城ボス・雑魚(`aiPhase` で技を持つ側)は `dashParriedEnemyPatch` がこれを満たしている。
 * 技を `bossState` で持つボス(裏ボス/天使/アイドル/賞金首)は、爆風・帯のパリィ
 * (`applyPumpkinBlastDamage`)が `aiPhase` 系しか書かないため、**技が最後まで続いていた**
 * (モーション・別絵の武器・技の演出が残る)。以前フィルとトールだけ個別に塞いでいた穴。
 *
 * 流れ: パリィが `bossMoveCutPending` を立てる → 各ボスの制御が次のフレームで引き取り、
 * 自分の持ち越し(連射の残り・段の途中など)を捨てて追跡へ戻し、`COUNTER_CUT_GAP_MS` の間を置く。
 * **台本の残りは捨てない**(v0.25.4592「でも台本は続ける」)——間が明けたら残りから出す。
 */
import type { Enemy } from '../types/game';
import { COUNTER_RECOVER_STILL_MS } from './enemyBite';

/** カウンターで技を終えた後、次の技までの間。城ボス・雑魚の硬直と同じ1本のツマミを読む。 */
export const COUNTER_CUT_GAP_MS = COUNTER_RECOVER_STILL_MS;

/** 個別の反応を持っていて、ここでは触らない型(トール=後ろへ跳ぶ / フィル=専用の硬直)。 */
const OWN_REACTION_TYPES: readonly string[] = ['thor', 'phillboss'];

/** 技ではない州(終わらせる物が無い/既に反応中)。 */
const NOT_A_MOVE_STATES: readonly string[] = ['chase', 'return', 'counter-leap', 'laser-broken'];

/**
 * 爆風/帯のパリィが成立した敵に「1手を終える」旗を立てるか。
 * - `bossState` で技を持つボスだけ(城ボス・雑魚は `aiPhase` 側で既に終わる)。
 * - 飛んでくる刃を弾いた(`noDamage`)のは**弾と同じ扱い**=ボスの技は続く(v0.25.4592「刃などの飛来物も同じ」)。
 */
export const shouldCutBossMove = (e: Pick<Enemy, 'type' | 'bossState'>, projectileParry = false): boolean =>
  !projectileParry
  && e.bossState != null
  && !OWN_REACTION_TYPES.includes(e.type)
  && !NOT_A_MOVE_STATES.includes(e.bossState);

/** 台本の残りがあるなら、間が明けた時にそこから再開する印を返す。 */
export const scriptResumeFlag = (queue: readonly string[] | undefined): true | undefined =>
  (queue?.length ?? 0) > 0 ? true : undefined;
