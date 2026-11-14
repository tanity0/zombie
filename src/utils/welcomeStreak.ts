// ウェルカム(ステージ入りの関門)の連続クリア記録(社長指示2026-10-13「ウェルカムイベントは一度クリアしたら
// もう出ない様にして。3連続でクリアした時のみね」)。
//
// ・ステージごとに数える(台本はステージごとに別物)。
// ・「クリア」= 台本を最後の段まで倒し切って終わった時だけ。区域を跨いで打ち切った/ウェルカム中に倒れた/
//   途中でやめた、はどれも連続が途切れる(0へ戻る)。
// ・途切れの数え方: 1段目が湧いた瞬間に保存値を0へ落とし、倒し切った瞬間に「開始時の値+1」を書く。
//   こうすると死亡・帰還・タスクキルのどれで終わっても書き戻しが要らない(書かれないまま=0)。
// ・連続 WELCOME_RETIRE_STREAK 回に届いたステージは、以後の出撃でウェルカムが起動しない
//   (welcomeAppliesToRun の retired)。一度届いたら戻らない(以後は起動しないので数え直しも起きない)。
const WELCOME_STREAK_KEY = 'zombie.progress.welcomeStreak';

/** 何回連続でクリアしたら、そのステージのウェルカムを以後出さないか。 */
export const WELCOME_RETIRE_STREAK = 3;

type StreakMap = Record<string, number>;

const readMap = (): StreakMap => {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(WELCOME_STREAK_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj as StreakMap : {};
  } catch {
    return {};
  }
};

const writeStreak = (stageId: string, n: number): void => {
  if (typeof localStorage === 'undefined' || !stageId) return;
  try {
    localStorage.setItem(WELCOME_STREAK_KEY, JSON.stringify({ ...readMap(), [stageId]: n }));
  } catch { /* ignore */ }
};

/** そのステージの連続クリア回数(壊れた値は0)。 */
export const loadWelcomeStreak = (stageId: string): number => {
  const v = readMap()[stageId];
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
};

/** そのステージのウェルカムは卒業済み(=以後出さない)か。 */
export const isWelcomeRetired = (stageId: string): boolean =>
  loadWelcomeStreak(stageId) >= WELCOME_RETIRE_STREAK;

/** 1段目が湧いた瞬間に呼ぶ。開始時の連続回数を返し、保存値は0へ落とす(倒し切れなければ0のまま)。 */
export const beginWelcomeAttempt = (stageId: string): number => {
  const prev = loadWelcomeStreak(stageId);
  writeStreak(stageId, 0);
  return prev;
};

/** 台本を倒し切った瞬間に呼ぶ。開始時の値+1を書き、新しい連続回数を返す。 */
export const completeWelcomeAttempt = (stageId: string, streakAtStart: number): number => {
  const next = Math.max(0, streakAtStart) + 1;
  writeStreak(stageId, next);
  return next;
};

/** 開発用の進行リセットで消す。 */
export const clearWelcomeStreaks = (): void => {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.removeItem(WELCOME_STREAK_KEY); } catch { /* ignore */ }
};
