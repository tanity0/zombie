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
  /** 弾を拾って技ポイントが増えた時刻(Date.now・HUD の数字を一瞬明るくする合図)。 */
  gainAt?: number;
  /** 5段目の貫通突進(社長指示2026-11-07「5段目は一閃みたいに敵やオブジェクトを貫通する技」)を踏み出した地点。未設定=溜めの間。 */
  palmFromX?: number;
  /** 今の構えを始めた(または延長した)時刻(gameTime)。カウンターのスロー・停止は構え1回(延長ごと)に最初の1度だけ(§9-41)。 */
  guardSince?: number;
  /** スロー・停止を出した構え(guardSince の値)。 */
  guardImpactFor?: number;
  /** 構えを延長した時刻(Date.now・体の光と腕ガードの影を一度強く脈打たせる合図)。 */
  guardRenewAt?: number;
  palmFromY?: number;
}

