// 錬金術の溜めのリズムの型(依存ゼロの葉モジュール)。types/game.ts から引くため、summonUtils 等を巻き込む循環importを作らないようここに置く。

export interface AlchemyRhythmRing {
  spawnAt: number;
  arriveAt: number;
  /** 前のサークルの成功で到着を前倒し済みか(二重に前倒ししない)。 */
  pulled: boolean;
  result?: 'hit' | 'miss';
  /** 判定した時刻(成功の弾けの起点)。 */
  judgedAt?: number;
}

export interface AlchemyRhythmState {
  startedAt: number;
  /** 成功で縮んだ溜めの合計。 */
  cutMs: number;
  hits: number;
  rings: AlchemyRhythmRing[];
  /** 直近の成功の時刻(魔法陣の脈・音の起点)。 */
  lastHitAt?: number;
}
