// サブウェポン「格闘」の状態の型だけ(research/BRAWLER.md)。依存ゼロの葉モジュール=types/game.ts から読んでも循環しない。
export type BrawlerTechKind = 'guard' | 'stomp' | 'kiko' | 'kick';
export type BrawlerPhase = 'idle' | 'attack' | 'tech';
/**
 * 当たりの名札(固まりの表・浮きの表・道の表の引き先)。段は s1..s5、飛び蹴りは何発目か、秘奥義の9連撃は1本。
 * (utils/brawlerCombo から移した=道の表 utils/brawler.brawlerRouteAllows と同じ名札を使うため。)
 */
export type BrawlerMoveKey =
  | 's1' | 's2' | 's3' | 's4' | 's5'
  | 'kick1' | 'kick2' | 'kick3' | 'heel'
  | 'stomp' | 'kiko' | 'secret' | 'secret-land';
/** 道の表(research/BRAWLER.md §19-1)の節。待機・通常の段・飛び蹴りの何発目か・技。 */
export type BrawlerRouteNode = 'idle' | 's1' | 's2' | 's3' | 's4' | 's5' | 'kick1' | 'kick2' | 'kick3' | 'heel' | 'stomp' | 'kiko' | 'guard';
/** 拳鬼の技の予備動作のコマ(research/BRAWLER_PHANTOM.md §16-5): ready=しゃがみ / swing=腕上げ。 */
export type KenkiPrepTex = 'ready' | 'swing';
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
  /**
   * 飛び蹴りの3発目が踵落としか(社長指示2026-11-11・research/BRAWLER.md §29)。2発目の後に下を入れると、蹴り飛ばしの代わりにこれが出る。
   * 状態は飛び蹴りの3発目のまま(溜め・飛ぶ・高さは同じ)。当たり方・値段・取り消し先・絵だけが違う。
   */
  kickHeel?: boolean;
  /** 覚えている次の蹴り(techBuffer='kick')が踵落としか(下で入れた)。 */
  heelBuffer?: boolean;
  /** 踵落としの溜め(ms・gameTime)。前隙(windupMs)の頭のこの長さは空中で光って沈み、その後に飛ぶ。0/無し=溜め無し(蹴り飛ばしは溜め無し=§33)。 */
  kickChargeMs?: number;
  /**
   * ★画面全体の止めの最中に始めた次の蹴り(research/BRAWLER.md §33-2「当たった蹴りの絵で止まる」)。始めた gameTime。
   * gameTime は止めの間進まないので、gameTime がこの値のままの間(=止めが明けるまで)は、体と影を前の蹴りの当たった絵のまま描く(絵だけ)。
   */
  kickHoldAt?: number;
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
  /**
   * 「当たった」=相手の体力を削った当たりか(research/BRAWLER.md §19-1)。取り消し(通常→技・技→技)とステップの取り消しはこれを見る。
   * 触れたが防がれた当たり(相手のレバーガード)は connected=true のまま landed=false。未設定=connected と同じ。
   */
  landed?: boolean;
  /** この技を「道の上の続き」(取り消し・飛び蹴りの連続)として出したか(§19-3 ②)。気功を撃つ瞬間に固まりを延ばし直すかの印。 */
  linked?: boolean;
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
  /** ★反撃の気功(research/BRAWLER.md §32)を予約した構え(guardSince の値)。構え1回につき1発。 */
  guardKikoFor?: number;
  /** ★予約中の反撃の気功。at=撃つ時刻(Date.now・受けた瞬間の止めが明ける時刻)/ targetId=狙う相手 / hitX,hitY=受けた点(狙えない時の向き)。 */
  guardKiko?: { at: number; targetId?: string; hitX: number; hitY: number };
  /**
   * ★弱い構え(社長指示2026-11-12): 値段を払えずに出た(延長した)構え。受けてもダメージを防いで押されるだけ(utils/brawlerGuard.brawlerGuardEffects)。
   * 構えの光は不透明度を落とす(BRAWLER_WEAK_GUARD_ALPHA)。構えを始める・延長するたびに引き直す。構えの間だけ意味を持つ。
   */
  guardWeak?: boolean;
  /** 構えを延長した時刻(Date.now・体の光と腕ガードの影を一度強く脈打たせる合図)。 */
  guardRenewAt?: number;
  palmFromY?: number;
  /** 秘奥義の順番(→↓←↑)の進み 0..3 と、直前の技が終わった時刻(gameTime)。research/BRAWLER.md §10-1。 */
  secretProgress?: number;
  secretLastEndAt?: number;
  /** 秘奥義の最中(undefined=発動していない)。 */
  secret?: BrawlerSecret;
  /**
   * 技→技の取り消しで続けて出した技(絵と音の「繋がった」合図・ヒット数の流れの記録だけ)。取り消しでない技で始め直す。
   * ★出せる/出せないの判定には使わない(§19-1 から、道の表 brawlerRouteAllows が決める)。
   */
  techChain?: BrawlerTechKind[];
  /** ヒット数の表示(§11-4)。同じ流れの当たり数と、流れが切れた時刻(gameTime・0=続いている)。 */
  flowHits?: number;
  flowBrokenAt?: number;
  /**
   * ★コンボの狙い(社長指示2026-11-12「格闘、コンボ中は最初にヒットした敵を狙い続けるようにして」)。コンボの最初の当たりで当てた敵の id。
   * コンボが続いている間(flowHits>0 で切れていない=「N HIT」が出ている間)だけ効く(brawlerComboLockId)。技の狙い(向き・詰める先・飛ぶ先)で最優先。
   */
  comboTargetId?: string;
  /** 踵落としの浮いた高さから取り消して出した大踏み潰しの、出だしの高さ(絵だけ・px)。溜めの前半で落ちて着地する。 */
  stompFromPx?: number;
  /**
   * 技の先行入力(社長指示2026-11-08「技の先行入力だけ採用」・research/BRAWLER.md §9-60)。技の最中に入れた、今は出せない技を1つだけ覚える。
   * 新しい入力で上書き。出せるようになった瞬間(当たった技のキャンセル・前の技の終わり)に出す。被弾・掴み・紫・シーカー・死亡で捨てる。
   */
  techBuffer?: BrawlerTechKind;
  /** ハンティングが溜まった状態で始めた連撃の最中(research/BRAWLER.md §16)。途切れたら溜まりを消費して false に戻す。 */
  huntingCombo?: boolean;
  /** ジャスト構えで受けた時刻(Date.now・research/BRAWLER.md §12-2)。 */
  justAt?: number;
  /** ジャスト構えで技ポイントを足した構え(guardSince の値)。構え1回(延長ごと)につき1度だけ足す(社長指示2026-11-12)。 */
  justPointsFor?: number;
  /** ステップ(§12-3)の終わり(gameTime)。この間は次のステップを出さない。 */
  stepUntil?: number;
  /** ステップを出した時刻(Date.now・絵の合図)。 */
  stepAt?: number;
  /**
   * ステップの先行入力(research/BRAWLER.md §12-3b)。受け付けない時間(攻撃の出だし・当たりの止め等)に成立したステップを1つだけ覚える。
   * x,y=向き(長さ1)・at=成立した時刻(gameTime)。受け付けられるようになった瞬間に出す(成立から BRAWLER_STEP_BUFFER_MS 以内に限る)。
   */
  stepBuffer?: { x: number; y: number; at: number };
  /**
   * 覚えている通常攻撃・技の先行入力が「ステップの最中に押した物」か(research/BRAWLER.md §20-8)。
   * ステップの間は段も技も出せない=押した物を1つ覚えて、ステップが終わった瞬間に待機から出す。
   * 通常攻撃・技の先行入力を覚える所(store の brawlerPress / brawlerTech)が、覚えるたびに書き直す(ステップの最中=true / それ以外=false)。
   * 読むのは「覚えた物がある待機」の時だけ=覚えを捨てる所(被弾・取り消し・ステップの先行入力)で印が残っていても効かない。
   */
  stepHeld?: boolean;
  /** 覚えた技が「判定の後(受付を過ぎた後を含む)に押した物」か(§25=行動が終わって待機へ戻った瞬間に出す)。技を覚える所が毎回書き直す。 */
  lateHeld?: boolean;
  /**
   * レバーガード(research/BRAWLER.md §12-1c)で受けた時刻(gameTime・腕で受ける影の起点)。
   * leverGuardN=受けた回数(呼び手が「この一撃はガードだったか」を前後の差で見分ける=浮かせない・爆風の押しを書かない)。
   * leverGuardDirX/Y=受けた相手の向き(長さ1・自分→相手。腕で受ける影の向き)。
   */
  leverGuardAt?: number;
  leverGuardN?: number;
  leverGuardDirX?: number;
  leverGuardDirY?: number;
  /**
   * 演出つきの技(拳鬼の秘奥義)をガードで受けた後の、半減の持ち越し(§12-1c・検収監査2026-11-10)。
   * leverGuardCarryUntil=持ち越しが効く締め切り(gameTime)/ leverGuardCarryFrom=その技を出している相手の id。
   */
  leverGuardCarryUntil?: number;
  leverGuardCarryFrom?: string;
}

