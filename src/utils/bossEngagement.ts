// ボス交戦中の判定(社長裁定v0.25.2412)。
//
// なぜ要るのか: 社長方針「**敵が多くて難易度を上げるのは不評**(エルデンリング等のレビュー)」。
// ボス戦の難しさは**ボスの技を読むこと**から来るべきで、雑魚の数から来るべきではない。
// 見下ろし型でロックオンが無い本作は特にこの罠に弱く、実機ラン#1の死因も「敵の飛び道具」だった
// (=戦っている相手以外に殺された)。そこでボス交戦中だけ湧きを強制リラックスへ落とす。
//
// 既に同じ思想の実装が1つある: **ゲート戦中は死神を抑止**(v0.25.1555/1579・社長の実機報告発)。
// これはその考え方をボス全般へ広げたもの(社長裁定 質問③「全ボスで」)。
//
// 掟: **ここは判定するだけの純関数**。どう使うか(湧きを落とす/コマ時計を止める)は directorTick 側。
import type { Enemy, EnemyType } from '../types/game';

/**
 * 「交戦中」として扱うボスの型。
 *
 * **死神(reaper)は入れない**: 死神は"ボス戦"ではなく**追跡**のギミックで、深層に居る間ずっと
 * 湧いている可能性がある。ここに入れると深層の湧きが常時リラックスに落ちてしまい、ペーシング設計
 * (§6.27)が丸ごと壊れる。死神は既に「ゲート戦中は抑止」で別途面倒を見ている。
 *
 * **hunter も入れない**: ハンターは索敵→立ち去りのある巡回敵で、ボス戦の幕が上がる相手ではない。
 * (どちらも `isBossType` には含まれるので、`isBossType` を流用せず**この表を正本にする**。)
 */
const ENGAGEABLE_BOSS_TYPES = new Set<EnemyType>([
  'giantbat',                                   // 城ボス(ジャイアント)+ ストーリーボス(グレン/未確認変異体)
  'mimir', 'jormungand', 'skadi', 'thor',       // 裏ボス4体
  'miguel', 'jibril', 'rafi', 'uri', 'suriel', 'acrasiel', // ゲート2ボス6体
  'idol',                                       // stage-2 隠しボス
]);

export const isEngageableBoss = (type: EnemyType): boolean => ENGAGEABLE_BOSS_TYPES.has(type);

/**
 * いま「ボスと交戦中」か。
 *
 * **`dormant` を見るのが肝**。城ボスは出現直後は城で待機(`dormant: true`)し、プレイヤーが
 * `GIANT_AGGRO_RANGE` に入ると `dormant: false` になる。**これが「交戦をはじめた」そのもの**なので、
 * 距離やヒステリシスを自前で書く必要がない。giantbat は一度起きたら再休眠しない
 * (再休眠はラボの lab-zombie 専用) = **単調でチラつかない**。
 *
 * 他のボス(裏ボス/ゲート2/idol)は出現=即戦闘なので `dormant` が付いていない=生存だけで交戦中。
 */
export const bossEngagedNow = (enemies: readonly Enemy[]): boolean =>
  enemies.some(e => isEngageableBoss(e.type) && e.dormant !== true);
