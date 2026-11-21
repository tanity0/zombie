// ステージ7の戦闘前会話とグレン出現の順序を一箇所で定義する。
// 初回は咆哮を最後まで見せてから出現し、既読後の出撃は会話を省略して即出現できる。
export const GLEN_FINAL_LINE = '……終わらせてあげて！';
export const GLEN_ROAR_LINE = 'グガガガガガガガガ！';

export interface GlenIntroSpawnGate {
  introSkipped: boolean;
  roarQueued: boolean;
  roarShown: boolean;
  currentText: string | null;
  roarPending: boolean;
}

export const isGlenBossSpawnReady = (gate: GlenIntroSpawnGate): boolean => {
  if (gate.introSkipped) return true;
  return gate.roarQueued
    && gate.roarShown
    && gate.currentText !== GLEN_ROAR_LINE
    && !gate.roarPending;
};
