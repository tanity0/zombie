// サブウェポン「格闘」の状態の型だけ(research/BRAWLER.md)。依存ゼロの葉モジュール=types/game.ts から読んでも循環しない。
export type BrawlerTechKind = 'guard' | 'stomp' | 'kiko' | 'kick';
export type BrawlerPhase = 'idle' | 'attack' | 'tech';
export interface BrawlerState {
  phase: BrawlerPhase;
  /** いま(または直前)の通常攻撃の段 1..5。技の間は 0。 */
  stage: number;
  tech: BrawlerTechKind | null;
  /** 飛び蹴りの何発目か(1..3)。 */
  kickN: number;
  /** 行動の始まり(gameTime)。 */
  startAt: number;
  /** この行動の前隙と戻り(ms)。前隙は #7 の「前隙なし」で 0 になることがある。 */
  windupMs: number;
  recoveryMs: number;
  /** ヒットストップ(段の時計を止める・gameTime)。止めた分だけ時計を後ろへずらす。 */
  stopFrom: number;
  stopUntil: number;
  stopPrevMs: number;
  /** 判定を解いたか / 当たったか。 */
  resolved: boolean;
  connected: boolean;
  /** 先行入力(1つだけ)。 */
  buffered: boolean;
  /** 次に押した時に出す段(1..5)と、その段のつながりが切れる時刻(gameTime)。 */
  nextStage: number;
  chainUntil: number;
  /** 技ポイント(出撃ごとに0から)。 */
  points: number;
  /** 構えの終わり(gameTime・0=構えていない)。 */
  guardUntil: number;
  /** 受けた直後の「前隙なし」の終わり(gameTime)。 */
  quickUntil: number;
  /** 飛び蹴りの連続の受付の終わり(gameTime)と、そこまでに出した数。 */
  kickChainUntil: number;
  kickCount: number;
  /** この行動の相手と向き(単位)。 */
  targetId?: string;
  dirX: number;
  dirY: number;
  /** ポイント不足/方向なしで技が出なかった時刻(Date.now・HUDの数字を震わせる)。 */
  denyAt: number;
  /** 締め・技の出だしの印(Date.now・描画用)。 */
  flashAt: number;
  /** 最後に構えで受けた時刻(Date.now・描画用)。 */
  guardHitAt: number;
  /** この行動を押した時刻(Date.now)。打刻 noteMeleeSwingPressedAt と絵の起点に使う。 */
  pressAt: number;
}

