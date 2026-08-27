// A-2(社長裁定 v0.25.2600「A-2でお願いしたい」): 守護霊のカウンターを
// **「ダメージが出る瞬間」から逆算して**振るための純関数。
//
// なぜ必要か(v0.25.2599の診断):
//   守護霊は「語尾が -windup / -recover」という近似で窓を判断し、**予告の頭で**反応遅延ぶん待って振って
//   いた。ところが城ボス(giantbat)系の成立表(GIANT_PARRYABLE_PHASES)は**予告を意図的に除外**して
//   いる(M51「予告を出したら必ず実行させる」)。結果、
//     ① 予告で振る → 絶対に成立しない(請求は消費されて捨てられる)
//     ② 請求はTTL(150ms)で期限切れ → 着弾時には残っていない
//     ③ 着弾を食らう
//     ④ 近接CD(600ms)明けに硬直で振り直し → **ここで初めて成立=「食らってからCounter!」**
//   これが全技で構造的に起きていた(社長報告「他の技でも起きてるの?」→ 起きていた)。
//
// ここで直すのは**「いつ振るか」だけ**。成立条件(判定)は1mmも広げない:
//   - 死に予告(その終わりにダメージが無い予告)では**狙わない**。その先(滞空/体当たり/次の実行)で狙う。
//   - 着弾予告(その終わりにダメージが出る予告)は、**残り時間が請求TTLの内側に入ってから**振る。
//   - 実行フェーズ(体当たり中/薙ぎ払い中)は成立表にあるので**監視対象に加える**(従来は見ていなかった)。
//   - 硬直(-recover)は従来どおり=技後の隙を叩く挙動は維持する。
//
// §2.18「⑩実行=ベスト・ゴール逆算」の適用。乱数は使わない(意思決定の乱数消費順を変えない=CLAUDE.md)。

/**
 * 逆算の基準先行時間(ms)。「ダメージが出る瞬間のこれだけ前に振る」。
 * ★判定時置換ミラー(2026-08-27・GHOST_PARITY_LEDGER.md ★仕様v2/監査R4): 窓が
 * **[振り始め, +COUNTER_ACCEPT_MS(300)]**(旧: 解決時+TTL150)になったため、根拠を書き替える——
 * lead は [基準70, 最大230] で**全て窓300msの内側**に収まる。叩き台・実機調整前提。
 */
export const GHOST_COUNTER_AIM_LEAD_MS = 70;
/**
 * 反応の遅さぶん「早く振ってしまう」量(ms)。乱数ではなく反応遅延(社長の実測値)から決まる
 * **決定的なズレ**(再現性・乱数順の保全)。
 * ★窓の拡張(上記)で旧個性「遅い霊はTTL150を超えて必ず失敗」は算術的に消えた(事実)。
 * 残る個性: 遅い霊ほど早く振る=着弾時に窓の残りが少ない=**着弾が予定よりズレる技・多段技で
 * 失敗しやすい**+早置きのぶん前隙・構えで無防備な時間が長い。
 */
export const GHOST_COUNTER_AIM_EARLY_SPREAD_MS = 160;

/**
 * 城ボス系(giantbat)で「**この予告フェーズの終わり=ダメージが出る瞬間**」であるフェーズ。
 * gameStore の各 case を全数確認して作った表(v0.25.2600):
 * これらは `gameTime >= aiPhaseUntil` になった時に pumpkinBlasts を積む/敵弾を撃つ=そこが着弾。
 * ここに載っているフェーズだけ「終わり際に振る」逆算を適用する(不明な技は従来動作のまま=安全側)。
 */
export const GIANT_IMPACT_AT_WINDUP_END: readonly string[] = [
  'g-stomp-windup',   // 踏み鳴らし(円の爆発)
  'g-sweep-windup',   // 薙ぎ払い(帯=カプセル。g-sweep-activeの220msは見た目だけ)
  'g-bolt-windup',    // 咆哮弾(敵弾を撃つ)
  'g-slam-windup',    // 叩きつけ
  'g-glide-windup',   // 滑空の一撃目
  'g-dive-windup',    // 急降下
  'g-wing-windup',    // 翼撃
  'g-trishot-windup', // 三連射(stage-5)
  'g-reach-windup',   // 伸びる触手(グレン)
  'g-tailslam-windup', // 尻尾の叩きつけ(グレン第二形態。v0.25.3139)
];

/**
 * 城ボス系で「監視対象に加える実行フェーズ」。**成立表(GIANT_PARRYABLE_PHASES)にあるのに、
 * 従来の近似(語尾 -windup/-recover)が拾えていなかった**2つ。
 * (`g-jump-air` は近似側の legacyHit に元から入っているのでここには要らない。)
 */
export const GIANT_WATCH_ACTIVE_PHASES: readonly string[] = [
  'g-dash-charge',   // 突進の体当たり中
  'g-sweep-active',  // 薙ぎ払いの実行中
];

/** その予告の終わりにダメージが出る=逆算して振る対象か。 */
export const isGiantAimWindup = (phase: string | undefined): boolean =>
  phase !== undefined && GIANT_IMPACT_AT_WINDUP_END.includes(phase);

/**
 * **死に予告**=城ボス系の予告のうち、その終わりにダメージが無いもの(飛び掛かり/突進/四足突進/
 * 噛みつき/新星/薙ぎ払い光線/三連跳び/爪/血の弧…)。ダメージはその先(滞空/体当たり/実行/遅延起爆)で
 * 出るので、ここで振っても**絶対に成立しない**=狙わせない。
 * 表を二重管理しないため「g- で始まる -windup のうち、着弾予告表に無いもの」で導出する。
 */
export const isGiantDeadWindup = (phase: string | undefined): boolean =>
  phase !== undefined && phase.startsWith('g-') && phase.endsWith('-windup')
  && !GIANT_IMPACT_AT_WINDUP_END.includes(phase);

/** 成立表にあるのに近似が拾えていなかった実行フェーズか。 */
export const isGiantWatchActivePhase = (phase: string | undefined): boolean =>
  phase !== undefined && GIANT_WATCH_ACTIVE_PHASES.includes(phase);

/**
 * 反応の遅さ(0=最速 / 1=最遅)。計測 reactionMs を [minMs,maxMs] で正規化する
 * (clampは呼び出し側の ghostReactionMs と同じ範囲を渡す前提)。
 */
export const ghostAimSlowness01 = (reactionMs: number, minMs: number, maxMs: number): number => {
  if (!Number.isFinite(reactionMs) || maxMs <= minMs) return 1; // 欠損は「遅い」側=安全側(成立しにくい)
  return Math.max(0, Math.min(1, (reactionMs - minMs) / (maxMs - minMs)));
};

/**
 * その霊の実効先行時間(ms)。遅い霊ほど早く振る=**着弾時の窓の残り=300−lead**(最遅で70msしか
 * 残らない)——「窓内=安全」ではない(検収監査・軽10)。着弾が予定よりズレる技・多段技で失敗する。
 */
export const ghostAimLeadMs = (slowness01: number): number =>
  GHOST_COUNTER_AIM_LEAD_MS + GHOST_COUNTER_AIM_EARLY_SPREAD_MS * Math.max(0, Math.min(1, slowness01));

/**
 * ★判定時置換ミラー検収1巡(2026-08-27・重2/重3/重5): 「予告の終わりに**即**・守護霊に消費担当のある
 * 判定が始まる州」の宣言表(bossState基準・giantbatは既存のGIANT_IMPACT_AT_WINDUP_ENDが担当)。
 * 着弾逆算(構え)の対象は**この表に載っている予告だけ**——総当たり(isTelegraphActive)にすると、
 *  - 終わりに着弾しない予告(トールjump=着地は+360ms後/突進=到達に依存)で早振りして窓切れ(重2)
 *  - 消費担当の無いボス(idol)や紫の予告(ミーミルのレーザー)で棒立ち待ち(重3=v3948の再発)
 *  - 実行中(ACTIVE)州まで「州の終わり−lead」になり反応遅延の個性が消える(重5)
 * が全部同時に起きる。載せる条件は2つ: ①その予告の終了フレームから判定が生きる ②守護霊の消費担当
 * (GHOST_PARITY_LEDGER.md ★仕様の州→担当表)がその判定を拾う。
 */
// ★検収2巡(重A): キーは**`type:state`(型ゲート付き)**——'harai-windup'等の州名はミゲル(天使)も
// 使うため、州名だけの一致だと別ボスの消費担当の無い予告をすくい、棒立ち(重3)がそのボスで戻る
// (moveReaction.ts「名前が他ボスと衝突する状態があるため必ずtypeでゲートする」と同じ作法)。
// ★検収2巡(重B): 「windupの終了フレームでhitCapsule(爆風)を積む技」も条件①②を満たす
// (消費担当=combatTickのブラストパリィ)ので全数載せる——載せないと、ACTIVE州を持たない技
// (バス停の全技・馬乗りコンボ・バランスの薙ぎ/三連・舞子の薙刀)で構える契機がゼロになり、
// **プレイヤーだけが弾けて守護霊は弾けない技**が残る。※mk-suiu-hop*は着地点が毎ホップ再抽選=
// 守護霊の居場所と無関係なので対象外(保留)。
export const IMPACT_AT_WINDUP_END_BOSS_STATES: readonly string[] = [
  // トール: 終了と同時にカプセル判定(担当=capsule)
  'thor:issen-windup', 'thor:tsuki-windup', 'thor:harai-windup',
  // 賞金首バス停: 終了フレームで帯/三連の爆風を積む(担当=blast)
  'bounty-ranged:br-push-windup', 'bounty-ranged:br-triple-windup',
  // 賞金首馬乗り: 円ACTIVE(担当=bounty-figure)+3連コンボの各段(担当=blast)
  'bounty-melee:bm-whip360-windup',
  'bounty-melee:bm-combo1-windup', 'bounty-melee:bm-combo2-windup', 'bounty-melee:bm-combo3-windup',
  // 賞金首バランス: 薙ぎ/三連(担当=blast)
  'bounty-balance:bb-sweep-windup',
  'bounty-balance:bb-triple1-windup', 'bounty-balance:bb-triple2-windup', 'bounty-balance:bb-triple3-windup',
  // 賞金首舞子: 回転ACTIVE(担当=bounty-figure)+薙刀の各段(担当=blast)
  'bounty-maiko:mk-spin-windup',
  'bounty-maiko:mk-naginata-windup', 'bounty-maiko:mk-naginata1-windup', 'bounty-maiko:mk-naginata2-windup',
];
export const impactAtWindupEnd = (enemyType: string, bossState: string | undefined): boolean =>
  bossState !== undefined && IMPACT_AT_WINDUP_END_BOSS_STATES.includes(`${enemyType}:${bossState}`);

/**
 * 逆算の判定: 「ダメージが出る瞬間」までの残りが実効先行時間以内なら、今このtickで振る。
 * remainMs は gameTime 基準(aiPhaseUntil - gameTime)。まだ先なら false=待つ。
 */
export const ghostAimSwingNow = (remainMs: number, leadMs: number): boolean =>
  Number.isFinite(remainMs) && remainMs <= leadMs;
