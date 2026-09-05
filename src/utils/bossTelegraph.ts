// ボスの「予告(windup)の長さ」と「硬直(recover)の長さ」を、**プレイヤー側の実測値から機械的に
// 導く**ための物差し(純関数のみ・レンダラ/store非依存)。
//
// 背景(v0.25.2609 ボス動き横断監査): 本作には**無敵付きの汎用回避(ローリング)が存在しない**。
// 汎用の防御動詞は次の2つだけで、ここが全てのボス設計の基準系になる:
//   ① 歩いて避ける = PLAYER_BASE_SPEED(87) × GAME_SPEED(1.2) = **104.4 px/s**
//   ② カウンター    = 窓 COUNTER_WINDOW(400ms) + CD COUNTER_COOLDOWN(420ms) = **1サイクル 820ms**
// エルデンリング資料(research/ELDEN_RING_BOSS_PATTERNS.md §1-6)の基準系「ロール無敵0.42〜0.45秒」は
// 本作に存在しないため、ERの秒数をそのまま写すと理不尽になる。この2つへ換算してから写す。
//
// 値の複製について: PLAYER_BASE_SPEED / GAME_SPEED / COUNTER_* は gameStore.ts / config にあるが、
// ここは**純関数レイヤ(store非依存)**なので import せず値を複製する(moveReaction.ts の
// MELEE_RADIUS_MIRROR / GIANT_STOMP_RADIUS_MIRROR と同じ確立済みの作法)。値がズレないことは
// bossTelegraph.test.ts が実体を import して機械的に検証する。

/** プレイヤーの実効歩行速度(px/s)。= PLAYER_BASE_SPEED(87) × GAME_SPEED(1.2)。 */
export const PLAYER_WALK_PX_PER_SEC = 104.4;

/** プレイヤーの近接/カウンター1サイクル(ms)。= COUNTER_WINDOW(400) + COUNTER_COOLDOWN(420)。 */
export const PLAYER_ATTACK_CYCLE_MS = 820;

/**
 * 換算式②(自己中心AoEの予告下限): 半径 radiusPx の円から**歩いて**出るのに要る最小ms。
 * 予告(赤い図形が出ている時間)がこれ未満なら、**見てから歩いても構造的に避けられない**=理不尽。
 * 逆に「避けさせたくない/カウンターさせたい技」は意図的にこれ未満にしてよい(その場合は
 * 必ずコメントで意図を明記する)。
 * 注: プレイヤー半径は呼び出し側で足す(自機サイズが場面で変わるため、ここでは素の式だけを持つ)。
 */
export const minWindupMs = (radiusPx: number, standDistPx = 0): number =>
  (Math.max(0, radiusPx - standDistPx) / PLAYER_WALK_PX_PER_SEC) * 1000;

/**
 * プレイヤーの近接リーチ(px)。gameStore の MELEE_RADIUS(74) の複製(この層はstore非依存のため。
 * 一致は bossTelegraph.test.ts が実体をimportして機械検証する)。
 * 意味: **敵の当たり判定の縁からこの距離まで**近接が届く(判定は enemyMeleeDist=矩形の最近点までの距離)。
 */
export const MELEE_REACH_PX = 74;

/**
 * ★交戦の起点(社長指示v0.25.3465「監査の技を避けれるかの基準を直して。プレイヤーの近距離攻撃が、
 * 敵の当たり判定の端っこに届く距離のギリギリを起点に考えて」)。
 *
 * プレイヤーは**敵の中心に立っている訳ではなく、近接がギリギリ届く位置で殴っている**。
 * だから「ボス自身を中心に出るAoE」は、その立ち位置から外へ出る距離だけを測るのが正しい。
 *   起点(敵の中心からの距離) = 敵の当たり判定の半分 + MELEE_REACH_PX
 *
 * ★enemyHitHalfPx は**縦横の平均**(矩形の代表半径 =(幅/2 + 高さ/2)/2)を渡す。
 *   v0.25.3465では「小さい方の軸=一番近づける向き」で厳しく測ったが、**横に長いボスでは実態と
 *   合わなかった**(社長指摘v0.25.3467「噛みつき、余裕で避けれるけど規準まだ合ってない」)。
 *   幅223×高さ124のミーミルは、横から殴れば中心から185px、上下からでも136px離れており、
 *   最小軸だけで測ると「避けられない」と出るが実機では余裕で避けられる。平均が実態に近い。
 */
export const meleeStandDistPx = (enemyHitHalfPx: number): number => enemyHitHalfPx + MELEE_REACH_PX;

// ============================================================================================
// ★物差し②「当たるか」(社長指摘2026-08-15「毱打ちも、最初届かなかったし、指標がそもそも壊れてる
//   可能性が高い」)
// ============================================================================================
// これまでの minWindupMs は **「プレイヤーが逃げ切れるか」だけ**を測る物差しだった。
// ところが設計にもそれを使っていたため、「ちょうど成立する」ように作ると
// **定義上、歩いているプレイヤーには当たらない技**が出来上がっていた(手毬打ち・三段突きが実例)。
//
// もう一つの原因は**狙いの焼き付け**。多くの技は溜めの開始/明けにプレイヤー位置をロックするので、
// 溜めの間にプレイヤーが動いた距離ぶん、**狙い先が過去になる**。
//
// ⇒ 設計時は**必ず両方**を見る:
//    ① `minWindupMs(...)`      : 予告 ≧ これ  … 逃げられる(理不尽でない)
//    ② `effectiveHitReachPx(...)`: 選択距離の上限 ≦ これ … 普通に動く相手に届く
//    ※ ①と②は逆を向く。両立しない技は「接近する」「狙いを追い続ける」等、**別の手段**で②を満たすこと
//      (例: 三段突きは高速接近で②を満たした・v0.25.3489)。

/**
 * 「狙いを焼き付けてから判定が出るまで」にプレイヤーが歩いて逃げる距離を引いた**実効射程**(px)。
 * @param reachPx      技の到達距離(判定の端まで。帯なら半幅と自機半径を足した実効値を渡す)
 * @param aimLockToHitMs 狙いを固定した瞬間から判定が出るまでのms(溜め全体とは限らない)
 * @param approachPx   その間にボス自身が詰める距離(px・接近しない技は0)
 */
export const effectiveHitReachPx = (
  reachPx: number, aimLockToHitMs: number, approachPx = 0,
): number => reachPx + approachPx - (Math.max(0, aimLockToHitMs) / 1000) * PLAYER_WALK_PX_PER_SEC;

/** ②の合否: 選択距離の上限に居る相手へ届くか。 */
export const reachesMovingPlayer = (
  selectMaxPx: number, reachPx: number, aimLockToHitMs: number, approachPx = 0,
): boolean => selectMaxPx <= effectiveHitReachPx(reachPx, aimLockToHitMs, approachPx);

// ============================================================================================
// ★この物差しの使い方(v0.25.3151・全技の回避可能性を走査した時の反省をここに固定する)
// ============================================================================================
//
// ● 測り方(この2つ以外を持ち込まないこと)
//   必要ms = (危険域から出るのに要る距離) / PLAYER_WALK_PX_PER_SEC * 1000
//     - 円  : 半径 + プレイヤー半径(14)  − **起点(下記)**
//     - 帯  : 半幅 + プレイヤー半径(14)  ※横へ抜ける
//   判定  = 予告時間(赤い図形が出てから判定が出るまで) >= 必要ms
//
// ● ★起点(社長指示v0.25.3465で追加。旧: 常に「円の中心に立っている」最悪ケース)
//   **プレイヤーの近接攻撃が敵の当たり判定の端にギリギリ届く位置**を起点にする。
//     起点 = 敵の当たり判定の半分 + MELEE_REACH_PX(74) … `meleeStandDistPx()`
//   これは「ボス自身を中心に出るAoE」にだけ効く(プレイヤーは中心には立っていないため)。
//   **プレイヤーの位置に置かれる技**(着地円・狙って引かれる帯など)は、プレイヤーが中心に居るのが
//   前提なので起点=0のまま(minWindupMs の第2引数を渡さない)。
//
// ● ★やってはいけない2つ(v0.25.3146の走査で実際にやって、結果が丸ごと間違った)
//   1. **PLAYER_BASE_SPEED(87) をそのまま使う。** 実効速度は **× GAME_SPEED(1.2) = 104.4**。
//      敵の溜めは atkUntil で 1.2 で割られるので、片方だけ換算すると**2割きつく**出る。
//   2. **反応時間(250ms等)を足す。** この物差しは足さない。予告は出た瞬間から見えていて、
//      予告SEも同時に鳴る=「見てから歩く」に反応の余白は要らない、という設計前提。
//   この2つで技1つあたり400〜500msぶん厳しく出て、**実際は避けられる技を大量にNG判定した**
//   (社長の実機報告「ラフィの技は今の所全て避けれるよ」で発覚。ラフィのsweepは -20%ではなく +35%)。
//
// ● ★足元系(本体を中心とする円AoE)の扱い — v0.25.3465で「対象外」から「起点を変えて測る」へ
//   該当: giantbat の stomp / nova / wing、mimir の bite、suriel の ring-spin、舞妓の毬回し など。
//   旧(社長決定v0.25.3151): 「プレイヤーがボスの中心に立っている」最悪ケースの数字になるので
//   **物差しの対象外**にして、短くても伸ばさないことにしていた。
//   新(社長指示v0.25.3465): 対象外にせず、**起点を「近接がギリギリ届く立ち位置」にして測る**
//   (`minWindupMs(radius + 14, meleeStandDistPx(敵の当たり判定の半分))`)。これで
//   「殴っている位置から歩いて出られるか」という**実際の問い**に対して数字が出る。
//   依然として、意図的に避けさせない技(密着し続けたら食らう)は基準未満でよいが、
//   **その場合はコメントで意図を明記する**(黙って基準割れを放置しない)。
//
// ● 逆に、**プレイヤーを狙って置かれる**技(円の中心/帯の線上にプレイヤーが必ず居るもの)は
//   この物差しがそのまま効く。走査でNGなら本当に避けられない=直す対象。

/**
 * 換算式③(硬直=パニッシュ窓の下限): 本作の「1発」= PLAYER_ATTACK_CYCLE_MS(820ms)。
 * ER資料 §1-2(ミドラ=設計の見本)の「ほぼ全コンボ後に**1〜2秒の確定パニッシュ窓**」を本作へ写すと
 * **1発=0.9秒 / 2発=1.7秒**になる。硬直がこの床を下回る技は「硬直がある」と言いながら
 * **プレイヤーが1発も入れられない**=休符が存在しないのと同じ(監査で天使/裏ボスの大半が該当した)。
 */
export const BOSS_RECOVER_FLOOR_MS = 900;

/** ストリング(連段)終端の休符=2発ぶん。※ストリング機構はバッチ3以降。ここでは定数だけ先に置く。 */
export const BOSS_STRING_REST_MS = 1700;

/**
 * 硬直msに下限(BOSS_RECOVER_FLOOR_MS)を敷く。**定数の宣言側で包む**ことで、
 * 元の数字を履歴として残したまま床を1箇所で保証する(呼び出し箇所を増やさない)。
 * 例: `const URI_BOLT_RECOVER_MS = withRecoverFloor(500); // → 900`
 */
export const withRecoverFloor = (ms: number): number => Math.max(BOSS_RECOVER_FLOOR_MS, ms);

/**
 * ★未決(社長検討中の予告演出「赤ラインの中をなぞる色塗りがメーターのように溜まる」)の土台。
 * 予告の進捗を 0..1 で返す純関数。描画側(pixiScene)が敵の aiStartedAt / bossStateUntil から
 * そのまま呼べる形にしてある(**この関数を使う配線自体はまだ入れていない**=演出の採否は社長判断)。
 * startMs/endMs が不正(未設定・逆順)な時は 0 を返す=描画が壊れない安全側。
 */
export const telegraphProgress01 = (nowMs: number, startMs: number | undefined, endMs: number | undefined): number => {
  if (startMs === undefined || endMs === undefined || endMs <= startMs) return 0;
  return Math.max(0, Math.min(1, (nowMs - startMs) / (endMs - startMs)));
};

/**
 * 自己中心AoE(=「歩いて円から出る」以外に避けようが無い技)の予告監査表。
 * escapeMs = プレイヤーが**危険域の位置を知ってから実行までに使える時間**(予告が出ている時間)。
 * ここに載せた技は bossTelegraph.test.ts が `escapeMs >= minWindupMs(radiusPx)` を機械的に検査する。
 *
 * 掟: **新しい自己中心AoEを足したらこの表にも足す**(CLAUDE.md「教訓は即機械化」)。
 * 表に載せないのは「線/帯/カプセル技」(横へ歩けば抜けられるので半径の式が当たらない)と、
 * 「リング上に個別の弾を置く技」(隙間を通るので円ではない=skadiの氷結の檻/jibrilの聖別)。
 */
export interface AoeTelegraphEntry {
  name: string;
  escapeMs: number;
  radiusPx: number;
  /**
   * ★起点(社長指示v0.25.3465/3466)。**ボス自身を中心に出るAoE**だけに入れる。
   * 値は「**その技が選ばれる最短距離**」= プレイヤーが技の開始時に居られる一番近い場所:
   *   - 近接の間合いで撃つ技 → `meleeStandDistPx(敵の当たり判定の半分)`(近接がギリギリ届く位置)
   *   - 間合いを取ってから撃つ技 → **その技の選択条件の下限距離**(例: 舞妓の毬回しは dist>150 でのみ選ぶ)
   * プレイヤーの位置に置かれる技(着地円など)は中心に立っているのが前提なので**入れない**
   * (社長指摘v0.25.3466「プレイヤーを中心に発生する技と、敵を中心に発生する技では判定が違う」)。
   */
  standDistPx?: number;
  /** 意図的に下限未満にしている技(密着への懲罰など)。設定時は検査を免除し、理由を必ず書く。 */
  intentionallyUnavoidable?: string;
}

// 値は各実装ファイルの定数の**複製**(このレイヤはstore/hook非依存を保つためimportしない)。
// 元の定数を動かしたらここも直すこと(既存の THOR_PHASE_HP_THRESHOLDS と同じ重複管理の慣例)。
export const AOE_TELEGRAPH_AUDIT: readonly AoeTelegraphEntry[] = [
  // --- 合格しているもの(回帰防止のために載せる) ---
  // angelBossTick.ts: ACRASIEL_SPEAR_DETONATE_MS=2000 / ACRASIEL_SPEAR_RADIUS=92
  { name: 'acrasiel-spear(結晶の槍・遅延起爆)', escapeMs: 2000, radiusPx: 92 },
  // useGameLoop.ts: THOR_JUMP_WINDUP_MS=700 + THOR_JUMP_MS=360(着地円は溜め開始から出る) / THOR_JUMP_RADIUS=70
  { name: 'thor-jump(着地爆風)', escapeMs: 1060, radiusPx: 70 },
  // angelBossTick.ts: RAFI_JUMP_WINDUP_MS=700 + RAFI_JUMP_MS=360 / RAFI_JUMP_RADIUS=70
  { name: 'rafi-jump(着地爆風)', escapeMs: 1060, radiusPx: 70 },
  // angelBossTick.ts: ACRASIEL_WARP_TELEGRAPH_MS(v0.25.2609で800→1000へ是正) / ACRASIEL_WARP_IMPACT_RADIUS=92
  // 旧800msでは83.5pxしか歩けず半径92pxから**構造的に**出られなかった(監査で発見・換算式②違反)。
  { name: 'acrasiel-warp(転移衝撃)', escapeMs: 1000, radiusPx: 92 },

  // --- 下限未満だが「意図」として据え置くもの(v0.25.2609では直さず記録に留める) ---
  // useGameLoop.ts: MIMIR_BITE_WINDUP_MS=700 / bodyCenteredAoe.MIMIR_BITE_RADIUS=216(v0.25.2612で
  // 92→216) → 必要約2069ms。★v0.25.2893: この行の 92 が是正に取り残されており、監査が旧値を
  // 検査していた(=不足81msに見えていたが実際は不足1369ms)。「密着への懲罰」という役目は不変。
  // ★起点(v0.25.3467で是正): mimirは裏ボス=生の帯(223x124)。縦横の平均=(111.5+62)/2≒86.75
  // → 起点=86.75+74≒161。必要 (216-161)/104.4*1000 ≒ 527ms で、予告700msは上回る=**合格**。
  // 社長の実機観察「噛みつき、余裕で避けれる」と一致した(v0.25.3465の最小軸=136では不足66msと出て
  // 実態と食い違っていた)。**免除は撤去**。
  { name: 'mimir-bite(群体の噛みつき)', escapeMs: 700, radiusPx: 216, standDistPx: 161 },
  // angelBossTick.ts: SURIEL_RINGSPIN_WINDUP_MS=800 / SURIEL_RINGSPIN_RADIUS=92 → 必要881ms
  // ★起点つき(v0.25.3465)で**合格に転じた**: suriel 60x30 → 足元の帯(幅33/高さ30)の縦横平均≒15.75
  // → 起点≒90。必要は(92-90)/104.4*1000≒19ms で、予告800msはこれを大きく上回る。
  // 旧基準(中心に立っている前提)では「不足81ms」に見えていただけで、**実際は殴る位置から出られる**。
  { name: 'suriel-ringspin(近接拒否の回転)', escapeMs: 800, radiusPx: 92, standDistPx: 90 },
  // angelBossTick.ts: ACRASIEL_BURST_WINDUP_MS=1200 / ACRASIEL_BURST_RADIUS=140 → 必要1341ms
  // ★起点つき(v0.25.3465)で**合格に転じた**: acrasiel 60x30 → 起点≒90。必要は(140-90)/104.4*1000≒479ms。
  // 予告1200msはこれを大きく上回る。旧基準の「不足141ms」は中心に立っている前提の数字で、
  // ★未決だった「1400msへ延ばすか半径を縮めるか」の二択は**不要になった**(社長裁定を仰ぐ必要なし)。
  { name: 'acrasiel-burst(大円)', escapeMs: 1200, radiusPx: 140, standDistPx: 90 },
  // PACING_PUZZLE.md §6.38 B2b: bountyTick.ts MK_SPIN_WINDUP_CHOICES([800,1300])の短い方を登録
  // (社長指示「escapeMs=短い方」)/ MK_SPIN_RADIUS=90 → 必要約996ms。
  // ★v0.25.3464で半径 90→180(社長指示「範囲を二倍にして」)。この行が旧90のまま取り残されると
  // 監査が嘘をつくので同時に更新する(mimir-biteで同じ取り残しが起きた前例あり)。
  // 起点(v0.25.3465): 賞金首 44x44 → 足元の帯(幅24.2/高さ44)の小さい方の半分=12.1 → 起点=12.1+74≒86。
  // ★社長指摘v0.25.3466「舞妓は近距離で毬回しは撃ってこない。近距離は毬打ちしかしてこない」:
  // そのとおりで、bountyTick の選択は dist<=MK_NEAR_MAX(150)なら**薙ぎ(毬打ち)一択**、
  // 毬回しは **dist>150 の中距離でしか選ばれない**。よって起点は「近接がギリギリ届く位置(86)」ではなく
  // **技の選択条件の下限=150**。必要 (180-150)/104.4*1000 ≒ 288ms(+自機半径ぶんは半径側に含めない
  // 既存の表の流儀に合わせる)で、予告800msは十分上=**合格**。
  // ※v0.25.3465でここに書いた「密着帯への懲罰技」という説明は**事実誤認**だったので撤去した
  //   (免除も不要になった)。表に理由を書く時は選択条件をコードで確認してから書くこと。
  { name: 'bounty-maiko-spin(舞妓・毬回し)', escapeMs: 800, radiusPx: 180, standDistPx: 150 },
] as const;
