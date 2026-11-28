// サブウェポン「格闘」の状態の型だけ(research/BRAWLER.md)。依存ゼロの葉モジュール=types/game.ts から読んでも循環しない。
/**
 * 技の種類。'gouge'=抉り打ち(research/BRAWLER.md §37・溜めて離す)は**プレイヤーだけ**の技(フリックの向きには割り当てない・幻影/孫悟空/守護霊/拳鬼の台本には無い)。
 */
export type BrawlerTechKind = 'guard' | 'stomp' | 'kiko' | 'kick' | 'gouge';
export type BrawlerPhase = 'idle' | 'attack' | 'tech';
/**
 * 当たりの名札(固まりの表・浮きの表・道の表の引き先)。段は s1..s5、飛び蹴りは何発目か、秘奥義の9連撃は1本。
 * (utils/brawlerCombo から移した=道の表 utils/brawler.brawlerRouteAllows と同じ名札を使うため。)
 */
export type BrawlerMoveKey =
  | 's1' | 's2' | 's3' | 's4' | 's5'
  | 'kick1' | 'kick2' | 'kick3' | 'heel'
  /** 蹴り上げ(research/BRAWLER.md §34-1)・スープレックス(§34-3=空中投げで投げ先が無い時の叩きつけ)。 */
  | 'kickup' | 'suplex'
  /** 土竜(research/BRAWLER.md §35=地割りの派生・当たった敵を押さずに宙へ浮かせる)。 */
  | 'mogura'
  /** 抉り打ち(research/BRAWLER.md §37=溜めて離す・下から腹を抉って浮かせる・プレイヤーだけ)。 */
  | 'gouge'
  | 'stomp' | 'kiko' | 'secret' | 'secret-land';
/** 道の表(research/BRAWLER.md §19-1)の節。待機・通常の段・飛び蹴りの何発目か・技。 */
export type BrawlerRouteNode = 'idle' | 's1' | 's2' | 's3' | 's4' | 's5' | 'kick1' | 'kick2' | 'kick3' | 'heel' | 'kickup' | 'stomp' | 'mogura' | 'kiko' | 'guard' | 'gouge';
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
  /**
   * 踵落としの空中の高さ(px・絵だけ=姿勢の jump)。出した瞬間に store が「当たる時刻の相手の浮いた絵の高さ」へ、
   * 動ける距離(BRAWLER_KICK_RANGE)の中で向かう高さとして決める(utils/airChaseHeight・下限 BRAWLER_HEEL_AIR_PX)。無し=今どおり BRAWLER_HEEL_AIR_PX。
   * 大踏み潰しへ取り消した時の出だしの高さ(stompFromPx)と、その威力の倍率も同じ値から出る(社長指示2026-11-16)。
   */
  heelAirPx?: number;
  /** 飛び蹴りの横に飛ぶ距離(px・store が出した瞬間に書く=詰めの距離)。空中の相手へ跳ぶ高さの「進行方向」の横の量(描画だけ)。 */
  kickGroundPx?: number;
  /** 覚えている次の蹴り(techBuffer='kick')が踵落としか(下で入れた)。 */
  heelBuffer?: boolean;
  /**
   * ★蹴り上げ(research/BRAWLER.md §34-1)。飛び蹴りの1・2発目の続きで上を入れると、次の蹴りがこれになる(kickN=蹴りの連続の位置 2 か 3)。
   * 踵落としの上下逆(溜め→下から上へ振り上げる)。当たった相手を上へ打ち上げる。
   */
  kickUp?: boolean;
  /** ★土竜(§35): 地割りの溜めの間に上で派生した(動き・溜め・当たる時刻・半径・威力・後隙は地割りのまま・当たった敵を押さずに浮かせる)。 */
  mogura?: boolean;
  /** 覚えている次の蹴り(techBuffer='kick')が蹴り上げか(上で入れた・出す瞬間に「直前の蹴りが当たった・払える」を見直す)。 */
  kickUpBuffer?: boolean;
  /**
   * ★空中投げ(research/BRAWLER.md §34-3): この蹴り上げで相手を掴んだ(投げ・スープレックスへ移った)。蹴りの連続はここで終わる=締め(道の表は kick3 と同じ扱い)。
   */
  kickThrow?: boolean;
  /**
   * ★掴んでいる間(§34-3)。enemyId=掴んだ相手・at=掴んだ時刻・releaseAt=放す時刻(どちらも Date.now)。この間は画面全体の止め(triggerHitstop)で
   * ループごと止まる。止めが明けた最初の時計で、投げ先へ投げる(居なければスープレックス)。
   */
  grab?: { enemyId: string; at: number; releaseAt: number; reachPx?: number };
  /** 空中投げで投げた時刻(gameTime・投げの体の振りの起点・絵だけ)。投げた向きは dirX/dirY に書く。 */
  throwAt?: number;
  /**
   * ★スープレックスの投げ越し(絵だけ・社長実機報告2026-11-19「雑魚をスープレックスできてない」)。enemyId=掴んだ相手・mx,my=相手の絵を運ぶ先
   * (相手の位置から、プレイヤーの背中側の着地点までのずれ・world px)。時刻は suplexAt(反りの始まり)から。判定・相手の位置は動かさない。
   */
  suplexSwing?: { enemyId: string; mx: number; my: number };
  /** ★空中のスープレックス(§34-11): 掴みが明けて一緒に上がり始めた時刻(gameTime)と、その瞬間の壁時計(相手の浮きの高さをこの時刻で止めて描く)。 */
  airSuplexRiseAt?: number;
  airSuplexHoldAt?: number;
  /** スープレックスの叩きつけの当たりを待っている相手(空中投げで投げ先が無かった時・反りの頂点 suplexAt+BRAWLER_SUPLEX_RISE_MS で当てる)。 */
  suplexPendingId?: string;
  /** 構えを技で取り消した時刻(Date.now)と、その時の構えの光の残り(0..1)。光を一度外へ押してから短く消す(絵だけ・§34-2)。 */
  guardCancelAt?: number;
  guardCancelRemain?: number;
  /** スープレックスの反りを始めた時刻(gameTime)。反りの頂点(+BRAWLER_SUPLEX_RISE_MS)で叩きつける。 */
  suplexAt?: number;
  /**
   * ★密着の構え(research/BRAWLER.md §34-7): 構えを出した瞬間に体に密着していた敵を掴んだ。enemyId=掴んだ相手・mode=雑魚はスープレックス/強個体・ボス級は蹴りバク宙。
   * 状態は締めの蹴り(tech='kick'・kickThrow)の形で持つ: 前隙=掴み(BRAWLER_CONTACT_GRAB_MS)・判定でスープレックス/蹴り・後隙=叩きつけの後隙/バク宙して下がる間。
   * 掴みから行動の終わりまでスーパーアーマー(utils/superArmor)。構えの効果(カウンター窓・被害の無効・打ち返し)は無い。
   */
  contactGrab?: { enemyId: string; mode: 'suplex' | 'flipkick'; at?: number; gripPx?: number }; // gripPx=掴む間に体を相手へ寄せる量(絵だけ・相手の縁を少し越えて食い込む・§34-10) // at=掴んだ壁時計(Date.now)=掴みの一瞬の時間停止の間の組み付く姿(§34-10)
  /**
   * ★構えの取り消し(§34-2・§34-6 #8)で、受けの成立の止め(画面全体の止め)の最中に入れた技を覚えたか。止めが明けた瞬間に出す。
   * 覚えるのは techBuffer(1つだけ)。構えの間だけ意味を持つ。
   */
  guardCancelHeld?: boolean;
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
  /**
   * ★旧「画面全体の止め」を自分と相手だけで写した止め(社長指示2026-11-14)の印。stopUntil と同じ値の時だけ効く(新しい行動・新しい止めで自然に外れる)。
   * この止めの間は、飛び蹴りの連続も含めて次の行動を出さずに覚え、止めが明けてから出す(旧の画面全体の止めの間と同じ)。
   */
  stopFreezeUntil?: number;
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
  /** ★5段目の突き抜けで拳の先が最初の相手に届いて止まった時刻(gameTime・社長指示2026-11-27「止めは当たった!と分かる瞬間に」)。未設定=まだ届いていない。 */
  palmContactAt?: number;
  /** ★5段目: 拳が届いた瞬間に当てた後、突き抜けの残りを進んでいる最中(抜け切ったら抜けた先の減速へ・store の tickBrawler)。 */
  palmPassRest?: boolean;
  /** 今の構えを始めた(または延長した)時刻(gameTime)。カウンターのスロー・停止は構え1回(延長ごと)に最初の1度だけ(§9-41)。 */
  guardSince?: number;
  /** スロー・停止を出した構え(guardSince の値)。 */
  guardImpactFor?: number;
  /** ★反撃の気功(research/BRAWLER.md §32)を予約した構え(guardSince の値)。構え1回につき1発。 */
  guardKikoFor?: number;
  /** ★予約中の反撃の気功。at=撃つ時刻(Date.now・受けた瞬間の止めが明ける時刻)/ targetId=狙う相手 / hitX,hitY=受けた点(狙えない時の向き)。 */
  guardKiko?: { at: number; targetId?: string; hitX: number; hitY: number; /** 残りの発数(未指定=1・カウンターマスターの二連発=2) */ left?: number };
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
  /**
   * ★決め技の止めが伸びた分を、入力の受付の時計から外す(research/HITSTOP.md §7・utils/brawlerFinishStop)。
   * techBufferAt=techBuffer を覚えた時刻(gameTime)/ stopExt=いまの止めのうち決め技で伸ばした分(until がいまの stopUntil と同じ時だけ有効)/
   * extDebt=この行動が決め技の止めの延長で遅れて始まった分(startAt がいまの startAt と同じ時だけ有効)/
   * deferPress=延長の分だけ後ろへ送った入力(at=gameTime で入れ直す)/ techBufferReplay=techBuffer は送った入力の見せ札(出さない・入れ直しで消える)。
   */
  techBufferAt?: number;
  stopExt?: { ms: number; until: number };
  extDebt?: { ms: number; startAt: number };
  deferPress?: { dx: number; dy: number; neutral: boolean; at: number };
  techBufferReplay?: boolean;
  /** ハンティングが溜まった状態で始めた連撃の最中(research/BRAWLER.md §16)。途切れたら溜まりを消費して false に戻す。 */
  huntingCombo?: boolean;
  /** ジャスト構えで受けた時刻(Date.now・research/BRAWLER.md §12-2)。 */
  justAt?: number;
  /**
   * ★ジャスト投げ(社長指示2026-11-28「ジャストタイミングで上おしたとき、スープレックスになりつつジャストカウンターにも」・utils/brawlerJustGrab):
   * ジャストで受けた相手へ吸い付いている最中。at=吸い付きが終わって掴む時刻(Date.now)。構えの間だけ意味を持つ(技を始めれば消える)。
   */
  justGrab?: { enemyId: string; at: number };
  /**
   * ★密着の構えで、密着した相手が攻撃中だった時の待ち(utils/brawlerJustGrab)。ジャストの窓の間は構えで待ち、受ければジャスト投げ・
   * 受けなければ at(gameTime=窓の終わり)で今までどおり掴む。構えの間だけ意味を持つ。
   */
  contactWait?: { enemyId: string; at: number };
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
  /**
   * ★カウンターされて技を断ち切られた時の落下(社長指示2026-11-26「格闘技はカウンターされるとノックバックで。」・絵だけ)。
   * fromPx=断ち切られた瞬間の体の高さ(姿勢の jump)・at=その gameTime。空中で返されたら、その高さから加速して落ちる(慣性・瞬間に地面へ戻さない)。
   */
  counterFall?: { fromPx: number; at: number };
  /**
   * ★自分の技の高さ(research/BRAWLER.md §40-4 ④・プレイヤーだけ・store が書く)。いまの行動を始めた瞬間の自分の高さ(px・地面=0)。
   * 空中で出した技はこの高さから決まった高さへ動く(空中の1・2段・気功はこの高さのまま・蹴り飛ばし/踵落としはこの高さで蹴る)。
   */
  airFromPx?: number;
  /** 待機の落下(§40-4 ④⑧): 行動が空中で終わった・滞空が明けた瞬間の高さ(px)・下向きの速さ(px/ms)・時刻(gameTime)。着地(高さ0)で意味を失う。 */
  airFall?: { fromPx: number; v0: number; at: number };
  /** 空中で気功を撃った(§39): 着地までどの技・段にも取り消せない(地上に着いた後の新しい行動で消す)。 */
  airKiko?: boolean;
  /**
   * ★1回の空中で出した技の節(社長指示2026-11-27「格闘の空中では、一度の空中で同じ技は1回までにして(一度着地した後ならok)」)。
   * 地上で始めた行動=その節1つから数え直す / 空中で始めた行動=足す。行動が終わって待機へ戻った時、落ちていなければ消す。門は utils/brawler.brawlerAirRepeatBlocked。
   */
  airUsed?: BrawlerRouteNode[];
  /**
   * ★抉り打ちの溜め(research/BRAWLER.md §37-2・§37-7)。時刻は全部 Date.now(実時間・テンポ係数は掛けない)。プレイヤーだけが書く。
   * gougePressAt=この押下を押した時刻(押下の記録。無し=溜めていない押下/溜めが消えた=離せば今どおり)。
   * gougeChargeAt=溜めを数え始めた時刻(技・構え・ステップの最中に押した時は、それが終わった時刻)。
   * gougeReadyAt=溜まった時刻(0.5秒)。gougeWait=技・構え・ステップの最中に押した(終わるまで数えない)。
   * gougeLink=押し始めた時刻が「次の段へつながる受付」の内だった(離して出た抉り打ちを段のつなぎとして数える)。
   * gougeDead=溜めの途中で被弾して溜めが消えた(この押下の離しは何も出さない)。
   */
  gougePressAt?: number;
  gougeChargeAt?: number;
  gougeReadyAt?: number;
  gougeWait?: boolean;
  gougeLink?: boolean;
  gougeDead?: boolean;
  /** 抉り打ちの小ジャンプの着地の砂埃を出したか(1回の技で1度だけ・絵だけ)。 */
  gougeLandFx?: boolean;
  /** 溜めのために延ばす前の段のつながり(chainUntil・gameTime)。溜めが消えた時はこの値へ戻す(0.5秒未満の押下は今と同じ)。 */
  gougeChainOrig?: number;
  /** 段のつなぎの溜めの間に覚えた、つながっているコンボの数(HIT)。離して出た抉り打ちの当たりはこの続きとして数える(§37-7)。 */
  gougeLinkHits?: number;
  /** 段のつなぎとして出た抉り打ちが持ち越した HIT の数(技の最中だけ・当たりはこの続きとして数える)。 */
  gougeCarryHits?: number;
  /** 溜めの構え(しゃがみ・沈み)が消えた時刻(Date.now)と、その時の沈み(0..1)。描画が加減速つきで戻す(絵だけ)。 */
  gougeEndAt?: number;
  gougeEndSink?: number;
}

