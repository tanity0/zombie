// サブウェポン「格闘」の状態の型だけ(research/BRAWLER.md)。依存ゼロの葉モジュール=types/game.ts から読んでも循環しない。
export type BrawlerTechKind = 'guard' | 'stomp' | 'kiko' | 'kick';
export type BrawlerPhase = 'idle' | 'attack' | 'tech';
/** 秘奥義の9連撃で出す技(通常攻撃の段 1..5 か技)。research/BRAWLER.md §10。 */
export type BrawlerSecretMove = 1 | 2 | 3 | 4 | 5 | 'kick' | 'stomp' | 'kiko';
/** 秘奥義の状態(research/BRAWLER.md §10)。phase の時刻は gameTime。 */
export interface BrawlerSecret {
  phase: 'ignite' | 'strike' | 'fall' | 'land';
  /** いまの相の始まり(gameTime)。 */
  phaseAt: number;
  /** 当てた発数(0..9)。 */
  hits: number;
  /** 次の1発を解く時刻(gameTime)。 */
  nextAt: number;
  /** 直前の1発の技(絵の駆動)。 */
  move?: BrawlerSecretMove;
  /** 直前のワープの出発点と到着点(world・残光の線)と時刻(Date.now)。 */
  warpFromX?: number; warpFromY?: number; warpToX?: number; warpToY?: number; warpAt?: number;
  /** 起動の時刻(Date.now・描画の光)。 */
  igniteAt: number;
}
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
  /** 秘奥義の順番(→↓←↑)の進み 0..3 と、直前の技が終わった時刻(gameTime)。research/BRAWLER.md §10-1。 */
  secretProgress?: number;
  secretLastEndAt?: number;
  /** 秘奥義の最中(undefined=発動していない)。 */
  secret?: BrawlerSecret;
  /** 技→技のキャンセルの流れで出した技(research/BRAWLER.md §11-4・1回の流れで各技は1回ずつ)。キャンセルでない技で始め直す。 */
  techChain?: BrawlerTechKind[];
  /** ヒット数の表示(§11-4)。同じ流れの当たり数と、流れが切れた時刻(gameTime・0=続いている)。 */
  flowHits?: number;
  flowBrokenAt?: number;
  /**
   * 技の先行入力(社長指示2026-11-08「技の先行入力だけ採用」・research/BRAWLER.md §9-60)。技の最中に入れた、今は出せない技を1つだけ覚える。
   * 新しい入力で上書き。出せるようになった瞬間(当たった技のキャンセル・前の技の終わり)に出す。被弾・掴み・紫・シーカー・死亡で捨てる。
   */
  techBuffer?: BrawlerTechKind;
  /** ジャスト構えで受けた時刻(Date.now・research/BRAWLER.md §12-2)。 */
  justAt?: number;
  /** ステップ(§12-3)の終わり(gameTime)。この間は次のステップを出さない。 */
  stepUntil?: number;
  /** ステップを出した時刻(Date.now・絵の合図)。 */
  stepAt?: number;
}

