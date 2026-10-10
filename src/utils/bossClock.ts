// 撃破タイムの「ボスごと交戦時計」(社長裁定2026-07-31「現状維持でいいんだけど、ボスごとのタイムには
// したいな」・v0.25.2577)。起点の定義は従来どおり**交戦開始**(bossEngagedNowと同じENTER900/EXIT1400)
// のまま、時計をスロット(ボス×ステージ)ごとに分離する。
//
// 旧実装(ソロ=playerTraitsセッション窓 / 同行=duoRecordsの交戦窓)は交戦「窓」1本の時計だったため、
// 交戦が途切れない連戦では2体目のタイムが1体目の交戦開始から数えられていた。連戦は意図的には
// 組まれていない(囲い中は裏ボスを出さない等)が、追跡型ボスを別ボスの交戦圏へ引っ張る事故で起こり得る。
//
// **ソロ台帳(playerTraits.notifyBossClear)と同行台帳(duoRecords.recordDuoBossClear)の両方が
// この1本を読む**=二枠で撃破タイムの定義が揃う(§2.17「ソロと同じ」)。
// 交戦キー集合は directorTick が毎tick、純関数 engagedBossSlotKeys(bossEngagement.ts)で計算して
// 渡す(幾何はこのモジュールに持たせない)。
// モジュールシングルトン(ラン単位)。resetBossClocks() を gameStore.resetGame から呼ぶ
// (duoRecords.resetDuoRunRecords と同じ前例)。
interface BossClockEntry { startGameTime: number; lastGameTime: number }

let clocks = new Map<string, BossClockEntry>();

/**
 * 毎tick1回(directorTick)。engagedKeysに居るスロットの時計を開始/更新し、消えたスロットの時計は
 * 閉じる(撃破で敵が消えた場合も次tickで自然に閉じる。撃破打刻は同tick内=閉じる前に読まれる)。
 */
export const tickBossClocks = (engagedKeys: ReadonlySet<string>, gameTime: number): void => {
  for (const key of engagedKeys) {
    const c = clocks.get(key);
    if (c) c.lastGameTime = gameTime;
    else clocks.set(key, { startGameTime: gameTime, lastGameTime: gameTime });
  }
  for (const k of Array.from(clocks.keys())) {
    if (!engagedKeys.has(k)) clocks.delete(k);
  }
};

/** 現在の交戦時間(そのボスの交戦開始→最新tick・ms)。交戦していなければnull。撃破の瞬間に読む(同tick精度)。 */
export const bossClockDurationMs = (slotKey: string): number | null => {
  const c = clocks.get(slotKey);
  return c ? c.lastGameTime - c.startGameTime : null;
};

/**
 * 時計を明示的に閉じる(同行台帳が打刻直後に呼ぶ=同一交戦区間内の二重打刻防止。ソロ台帳は
 * セッション内の clearedSlots dedup を既に持つので呼ばない)。
 */
export const closeBossClock = (slotKey: string): void => {
  clocks.delete(slotKey);
};

/** ラン境界(gameStore.resetGame)で呼ぶ。前ランの時計を持ち越さない(テストのbeforeEachにも使う)。 */
export const resetBossClocks = (): void => {
  clocks = new Map();
};
