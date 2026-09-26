/**
 * ★息を止める(社長指示2026-09-17「**攻撃する時や、攻撃後の隙は呼吸を止める**」)。
 * 生き物は力む瞬間に息を止める——**止まった呼吸そのものが「今だ」の合図**になる。
 *
 * ★最初の実装はアーマー用の述語(`combatFeel.isEnemyAttacking`)をそのまま読んでいたが、
 * あれは「`aiPhase` が立っていれば全部true」なので**飛び回っている間・歩いている間まで無呼吸**に
 * なっていた(クリエイティブ監査2026-09-17 #8: コウモリは旋回900〜1800ms、ゾンビは待機300〜2800msが
 * そのまま入る。叫び `scream` や詠唱 `g-nihil-chant*` まで無呼吸)。
 * ⇒ **呼吸専用の述語をここに切る。** 判定(アーマー)と見え方(呼吸)で欲しい範囲が違うので、
 * 同じ述語を使い回さない。
 *
 * 考え方は**除外リスト**: `aiPhase` の大半は技の相(溜め/実行/硬直)なので、
 * **「息を止めない相」だけを数える**方が短く・漏れにくい(新しい技の相を足した人が
 * 登録を忘れても「止まる」側に倒れる=安全側)。
 */
import type { Enemy } from '../types/game';
import { bitePhaseOf } from './enemyBite';

/**
 * 息を止めない相。**移動・待機・後退・叫び・詠唱**——どれも「動き続けている / 声を出している」
 * ので、現実に息を止めていない。
 */
export const BREATH_FREE_PHASES: ReadonlySet<NonNullable<Enemy['aiPhase']>> = new Set([
  'b-approach', 'b-orbit',          // コウモリ: 走り寄る/円を保って刻む(飛び続けている)
  's-arc',                          // スケルトン: 弧で回り込む(走っている)
  's-retreat', 'z-retreat', 'w-retreat', // 技を出し切った後に離れる(走っている)
  'z-wait',                         // ゾンビ: 帯で待つ(歩いている)
  'zrush',                          // ゾンビ紫の追尾(走っている)
  'scream',                         // ハンターの叫び(声を出している=息を止めていない)
  'g-sweep-track',                  // 城ボス: 歩いて詰めながら照準を追う
  'g-nihil-chant1', 'g-nihil-chant2', 'g-nihil-chant3', // 詠唱(声を出している)
]);

/**
 * 息を止めているか。
 * - **噛みつきの台本の最中**(溜め〜噛み)は止める。
 * - **技の相**(上の除外リスト以外の `aiPhase`)は止める。技後の硬直(z-recover/s-recover/
 *   b-release/dash-recover/g-*-recover)もここに入る=社長指示「**攻撃後の隙は呼吸を止める**」。
 * - **★気絶・完全停止中は止めない**=クリティカルで止めた敵は**息を吹き返す**
 *   (力めていない、が絵で伝わる)。これは副作用ではなく狙い。
 */
export const isEnemyBreathHeld = (
  e: Pick<Enemy, 'type' | 'biteAt' | 'chaffMove' | 'aiPhase' | 'stunUntil' | 'bossFullStunUntil'>,
  gameTime: number,
): boolean => {
  if (e.stunUntil !== undefined && gameTime < e.stunUntil) return false;
  if (e.bossFullStunUntil !== undefined && gameTime < e.bossFullStunUntil) return false;
  if (bitePhaseOf(e, gameTime) !== 'none') return true;
  return e.aiPhase !== undefined && !BREATH_FREE_PHASES.has(e.aiPhase);
};

/**
 * ★止め方は「平らに戻る」ではなく「**吸い込んだまま止まる**」(クリエイティブ監査2026-09-17 #7)。
 * 振れ幅を0へ落とすだけだと**素の寸法(1.0)へ収束する**=「呼吸アニメを切った」技術的な止まり方で、
 * 力んでいるようには見えない(CLAUDE.mdの「無難=迷って中庸を取った跡」そのもの)。
 * ⇒ 止めている間の波形を**吸気側の山**で固定する。胸が張ったまま静止する。
 * 呼吸の波は概ね -1〜+1 で、正が「吸って広がる」側。
 */
export const BREATH_HELD_WAVE = 0.75;
