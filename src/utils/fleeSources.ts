// 「他の敵が逃げる」旗(store の bossChasing)を立てる側の合成(判定だけの純関数・store/PixiJS 非依存)。
//
// bossChasing は updateEnemies が見て、場の敵を全員プレイヤーの反対へ走らせ、通常湧き・囲い/ゲートのイベント・
// 紅き夜・ハンター等も止める旗。立てる側は複数ある:
// - 裏ボス(useGameLoop の裏ボスのコントローラ。画面内で追跡してきている間)
// - 研究所のアイドル(起きている間・社長指示2026-10-10)
// - 孫悟空(徘徊の拳鬼=guardian-phantom / phantomUnique 'brawler'。社長指示2026-11-28「孫悟空がいる時、裏ボスと同じく敵は逃げる様にして」)
// 各々が自分の分だけを持ち、store へは OR を書く(1人が毎フレーム false を書いて他の旗を消す上書き合戦をしない)。
import type { Enemy } from '../types/game';

export interface FleeSources {
  /** 裏ボスが画面内で追跡してきている。 */
  hiddenBoss: boolean;
  /** 研究所のアイドルが起きている。 */
  idol: boolean;
  /** 孫悟空(拳鬼)が場に居る。 */
  kenki: boolean;
}

export const createFleeSources = (): FleeSources => ({ hiddenBoss: false, idol: false, kenki: false });

/** store の bossChasing に書く値(どれか1つでも立っていれば逃げる)。 */
export const fleeSourcesActive = (s: FleeSources): boolean => s.hiddenBoss || s.idol || s.kenki;

/**
 * 孫悟空自身の「退散する場面」判定(phantomBrawlerSceneBlocked の bossChasing)へ渡す値=孫悟空の分を除いた OR。
 * 孫悟空が自分で立てた旗で自分が退散しないため(裏ボス・アイドルに追われている時は今どおり退散する)。
 */
export const fleeSourcesExceptKenki = (s: FleeSources): boolean => s.hiddenBoss || s.idol;

/**
 * 孫悟空が「居る」か(=他の敵を逃がす)。出現済み・死体でない・HP>0、かつ**もう出会っている**(phantomUnmet でない)。
 * 本編の徘徊はプレイヤーから遠く(3000px)に出して、姿が画面に入るまで phantomUnmet=true のまま歩く。
 * これはアイドルの眠り(dormant)に当たる「まだ会っていない」状態なので、その間は旗を立てない
 * (立てると出撃3秒から場の敵が全員逃げ・通常湧きが止まり、会うまでステージが空になる)。
 * 確認用の強制出現(?brawlerphantomnow=1・対策室)は phantomUnmet を持たない=出た瞬間から立つ。
 */
export const isKenkiFleeSource = (e: Pick<Enemy, 'type' | 'phantomUnique' | 'health' | 'corpseUntil' | 'phantomUnmet' | 'kenkiLeaveAt'>): boolean =>
  e.type === 'guardian-phantom' && e.phantomUnique === 'brawler'
  && e.health > 0 && e.corpseUntil === undefined && e.phantomUnmet !== true
  // 2分で跳んで帰り始めたら下ろす(もう戦わない=場の敵が戻ってくる。跳び去りの約1秒を待たない・utils/kenkiLeave)。
  && e.kenkiLeaveAt === undefined;

export const kenkiFleeActive = (enemies: readonly Pick<Enemy, 'type' | 'phantomUnique' | 'health' | 'corpseUntil' | 'phantomUnmet' | 'kenkiLeaveAt'>[]): boolean =>
  enemies.some(isKenkiFleeSource);
