import type { ActiveEventKind } from '../types/game';

// 社長指示2026-11-12「徘徊はウェルカムイベント中は出現しない」。
// 本編の徘徊の枠(宇宙飛行群・亡霊・拳鬼=rollRunPatrolSlot の1ランに1回)の出現を、ウェルカムの最中は待たせる。
// 取りやめではない(出撃3秒などの時刻の条件を満たしていても、ウェルカムが終わるまで後ろへずれるだけ)。
// 「最中」= 輪が開いている(activeEvent.kind === 'welcome')か、台本がまだ終わっていない(welcomeActive=段と段の間・
// 1段目の前も含む)。確認用の強制出現(?astronow=1 等・対策室の枠)はこの関数を通さない(待たない)。
export interface PatrolWelcomeHoldInput {
  activeEventKind: ActiveEventKind | null | undefined;
  welcomeRunning: boolean;
}

export const patrolSpawnHeldByWelcome = (i: PatrolWelcomeHoldInput): boolean =>
  i.activeEventKind === 'welcome' || i.welcomeRunning;
