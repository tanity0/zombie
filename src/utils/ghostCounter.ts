// v0.25.2480(社長裁定「1」= DEVELOPMENT_LOG v0.25.2479 ★未決1の解消):
// 守護霊(ゴースト)のカウンターを機械的にプレイヤーと同等にするための共通部品。
//
// 仕組み(請求=claim方式):
//   ゴーストの counter スイング(窓+間合いで成立・useGameLoopのゴースト実行ブロック)は、その場で
//   カウンター効果を適用せず「請求」を1件積むだけ(通常近接ぶんのダメージ/斬撃/血/SEは従来どおり
//   スイング時に出る=プレイヤーの「スイング(近接ダメージ)+成立(クリ反撃)」の二段構造と同じ)。
//   各ボスの per-boss カウンターハンドラ(thorCounterHit / hiddenBossCounterHit / idolCounterHit =
//   useGameLoop、angelCounterHit = angelBossTick、dashParried相当 = combatTick.applyGhostBossParry)が、
//   自分の担当ボスの請求を「プレイヤーがカウンター可能な状態」の時だけ消費して、プレイヤー成立と
//   同じ機械的効果(技の中断/反応遷移+確定クリ=bumpBossCrit蓄積)を与える。
//   成立可否はper-boss側の既存条件をそのまま使う=ゴースト用に判定を二重実装しない。
//
// 掟(タスク指示・CLAUDE.md):
//   - ghostDriver の意思決定・乱数消費順は不変(このモジュールは ghostDriver を import しない)。
//   - プレイヤーのシステム値(無敵/counterCooldownEnd/counter-masterリファンド/コンボ/
//     lastCounterSuccessTime/計測notify)は1bitも触らない=per-bossハンドラのghost分岐でスキップする。
//   - 成立演出(青Counter!+金クリ層)はハンドラ側=成立が確定した時だけ出す(嘘のCounter!を出さない)。
import type { Player } from '../types/game';
import {
  useGameStore, BOSS_CRIT_DAMAGE_MULT, INVULN_MS, counterReplyDamage, COUNTER_ACCEPT_MS,
  COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, MELEE_FINISH_SLOW_MS, MELEE_FINISH_SLOW_HOLD_MS,
  COUNTER_HITSTOP_MS, COUNTER_ZOOM_MAG, GHOST_ZOOM_TRIAL_ENABLED, LATE_COUNTER_ENABLED,
  GHOST_DMG_LOG_ENABLED, ghostLogPush,
} from '../store/gameStore';
// GHOST-COUNTER-PARITY(社長指示2「位置条件をプレイヤーと同じ『矩形が重なっている』へ。74pxの緩さを
// 無くす」): 旧実装は GHOST_MELEE_RANGE(74px・敵の縁からの距離)で判定していたが、プレイヤーの接触
// カウンター(combatTick.ts の checkPlayerEnemyCollisions+counterActiveNow)は「体が重なっている」
// (矩形オーバーラップ)が必須。同じ2つの矩形生成関数を import して同じ幾何を使う(二重実装しない)。
import { checkCollision, playerHitbox, enemyContactBox } from './collisionUtils';

// (useGameLoop v0.25.2479 から移設: angelBossTick/combatTickのゴースト分岐も同じゲートを見るため)
// 守護霊の戦闘フィードバック(社長指示「カウンターとかキルとかは守護霊にもちゃんと入れて。全部だよ全部」):
// ゴースト起因の画面シェイクを一括で切るゲート(気になったらここを false にするだけ・演出のみ)。
// 【除外の機械化】ゴースト起因の演出呼び出しは カメラズーム/アテンション(triggerZoom/triggerAttention)・
// 時間停止(triggerHitstop/triggerHitImpact ※HitImpactは停止+ズーム+スロー同梱のため丸ごと使用禁止)・
// スローモーション(triggerTimeSlow)を絶対に呼ばない。シェイクは triggerShake 単体のみ使う。
export const GHOST_FX_SHAKE_ENABLED = true;

/** ゴーストの counter スイング1回が積む「カウンター成立の請求」。 */
export interface GhostCounterClaim {
  bossId: string;   // 紐付きボス(このボスの担当ハンドラだけが消費できる)
  ghostX: number;   // スイング時のゴースト中心(城ボス系ノックバックの起点=攻め手から弾き飛ばす)
  ghostY: number;
  dmg: number;      // 確定クリのダメージ(ghostCounterDamage・借用装備基準/スキル倍率なし)
  atMs: number;     // ★判定時置換ミラー(2026-08-27): **振り始め**の時刻(Date.now)。旧: 前隙解決時。
}

/** 請求を覗く/消費する時の位置ゲートの切り替え(peek/consume 共通)。 */
export interface GhostClaimGateOpts {
  /**
   * ★判定時置換ミラー(GHOST_PARITY_LEDGER.md ★仕様v2・監査R1): 位置ゲート(ボスの体との
   * 矩形重なり)は**城ボスの接触パリィ(applyGhostBossParry)だけ**が要求する——他の経路は
   * 成立の瞬間に「攻撃の成立域へ守護霊の体を入れて再評価」するので、請求側の位置条件は
   * 二重かつ過剰(v2594/2597「ありえない位置でカウンター」の再発防止は城ボス経路にだけ残す)。
   * 既定(false/未指定)= 位置ゲート無し。
   */
  contactGate?: boolean;
}

/**
 * 請求の鮮度。消費はスイングと同フレーム(城ボス系)〜次フレーム(状態機械の閉包ハンドラ系)。
 * 低fps(50ms/フレーム)でも1〜2フレームは生きる長さにし、それより古い請求は流す
 * (**ボスの技が進んでからの後出しパリィを防ぐ**)。
 *
 * v0.25.2595(社長報告「カウンター窓伸びたことによって、ボスの技が着地したあとにカウンター!って
 * なってる」※社長自身は「かも・確信はない」と保留): **v0.25.2588で400msへ広げたのを150msへ差し戻す。**
 * 差し戻しの主因は観測ではなく**変更の根拠が誤っていたこと**(下記)。観測が別要因だった場合でも、
 * 根拠の無い値変更を残す理由がないため戻す。再発したら値を勘で動かさず、請求が未消費で期限切れした
 * 回数をログに出して実測してから決める。
 * あの変更は「プレイヤーの窓(400ms)と揃えるべきパリティ写し損ね」という私の誤読だった——
 * **この値はプレイヤーの窓と同じ概念ではない**。プレイヤーの400msは「入力してから成立を待てる長さ」で、
 * 成立の瞬間は常にボスの攻撃解決時。一方この値は「スイング済みの請求が生き残る長さ」で、長くすると
 * **技が着地したあとの状態(-recover等)で消費されて後出しカウンターになる**。上の旧コメントに
 * その意図が明記されていたのに上書きしてしまった。
 * ※v0.25.2588で同時に入れた「被弾していたら請求無効」と、v0.25.2594の「成立の瞬間に間合いに居ること」は
 *   位置/被弾の条件であり有効なので残す(この差し戻しは長さだけ)。
 *
 * ★判定時置換ミラー(社長裁定2026-08-27「守護霊もプレイヤーの動きに揃える」・GHOST_PARITY_LEDGER.md
 * ★仕様v2): TTL=150は廃止し、**窓=[振り始め, +COUNTER_ACCEPT_MS(300)]**へ(プレイヤーの隻狼型
 * 受付=「押した瞬間から300ms」と同じ算術。前隙200msの間も窓は生きている=構え中の着弾を置換できる)。
 * 窓の**生死の正本は既存の `ghostCounterWindowEnd`**(振り始めに+300で開き・被弾で0に閉じる=
 * 監査M1「同じ窓を2つ持たない」)。atMs 上限は「直後の通常スイングで窓が開き直しても古い請求が
 * 延命しない」保険。旧・後出し防止(TTLを短く保つ)は、消費側が全経路「攻撃の判定が生きている瞬間」
 * にしか呼ばれなくなったこと(判定時置換)で置き換わる。
 */
export const GHOST_COUNTER_CLAIM_MAX_AGE_MS = COUNTER_ACCEPT_MS; // プレイヤーの受付と同じ定数を参照(手写し禁止)

let pendingClaim: GhostCounterClaim | null = null;

// v0.25.3981(実測用・?ghostlog=1): 棄却理由の重複ログ抑止(同じ請求×同じ理由は1回だけ)。
// peekは接触受け流し等から毎フレーム呼ばれるため、抑止しないと画面ログが1件で埋まる。記録専用。
let lastRejectLogKey = '';
const logReject = (reason: string, detail: string): void => {
  if (!GHOST_DMG_LOG_ENABLED || pendingClaim === null) return;
  const key = `${pendingClaim.atMs}:${reason}`;
  if (key === lastRejectLogKey) return;
  lastRejectLogKey = key;
  const gt = useGameStore.getState().gameTime;
  ghostLogPush(`${Math.round(gt / 100) / 10}s 棄却[${reason}] ${detail}`);
};

/** スイング側(useGameLoopのゴースト実行ブロック)が積む。常に最新1件だけ(同時ゴーストは1体)。 */
export const setGhostCounterClaim = (claim: GhostCounterClaim): void => { pendingClaim = claim; };

/**
 * 期限内の請求を覗く(消費しない)。城ボス系入口(ボス型で振り分ける前段)用。
 *
 * v0.25.2588(社長裁定「食らうタイミングをカウンターと見ない修正」): **請求してから被弾していたら
 * その請求は無効**(=プレイヤー側の「被弾でカウンター窓を閉じる」と同じ規則。§2.11追補「同じ仕様」)。
 * 守護霊の近接カウンターは窓(ghostCounterWindowEnd=弾反射専用)ではなくこの請求で成立するため、
 * **ここ1箇所で全消費経路(useGameLoop×2/angelBossTick×1)に効く**。
 * 被弾時刻は damageSummon が打つ `lastHit`(ダメージが実際に入った時だけ更新=カウンター無敵や
 * i-frameで弾かれた時は更新されない)。`?lastcounter=1` で旧挙動へ復帰。
 */
export const peekGhostCounterClaim = (nowMs: number, opts?: GhostClaimGateOpts): GhostCounterClaim | null => {
  if (pendingClaim === null) return null;
  if (nowMs - pendingClaim.atMs > GHOST_COUNTER_CLAIM_MAX_AGE_MS) {
    logReject('期限', `age=${Math.round(nowMs - pendingClaim.atMs)}ms`);
    return null;
  }
  const st = useGameStore.getState();
  const ghost = st.summons.find(s => s.kind === 'ghost-ally');
  // ★判定時置換ミラー(2026-08-27): 窓の生死は ghostCounterWindowEnd が正本(振り始めに+300で開き、
  // 被弾で0に閉じる=gameStore.damageSummon)。旧「lastHit > atMs」の被弾クローズはこの窓に含まれる。
  // ?lastcounter=1(LATE_COUNTER_ENABLED)は従来どおり被弾クローズだけを外す(atMs上限は残る)。
  if (!LATE_COUNTER_ENABLED && ghost && nowMs > (ghost.ghostCounterWindowEnd ?? 0)) {
    logReject('窓', `end=${ghost.ghostCounterWindowEnd ?? 0} now=${Math.round(nowMs)}`);
    return null;
  }
  // v0.25.2594(社長報告「守護霊がありえない位置でカウンター取ってる」): **成立の瞬間にその攻撃の
  // 当たる場所に居ること**を要求する(プレイヤー側は全経路が位置を必ず確かめている)。v0.25.2588で
  // 受付を150→400msへ広げた際に位置条件を写し忘れていたため、スイング後に離れても成立していた。
  // v0.25.2597(社長報告「ありえないタイミングといったのはジャンプ攻撃。赤いサークルとかなり離れた
  // 位置でカウンターを取っていた」): **v0.25.2596の「giantbatは型ごと素通し」は広過ぎた**。
  // プレイヤー側の位置条件は「ボスの型」ではなく**経路(その技のダメージがどこに置かれているか)**で
  // 決まっていた:
  //   - ゾーン型(衝撃波/薙ぎ払いの帯/着地AoE=blast): `applyBossBlasts` が **ゾーンの幾何**で当たりを
  //     見る。ボスの体の距離は無関係。→ 呼び出し側が `inBlastGhost` で既に確かめているので素通し。
  //   - 接触型(突進の体当たり/滞空中の飛び掛かり/硬直への差し込み=dashParried): プレイヤーは
  //     `checkPlayerEnemyCollisions`=**体が重なっている**ことが必須。→ 守護霊も間合いを要求する。
  // giantbatは**両方を持つ**(衝撃波はゾーン型・ジャンプ/突進は接触型)ので、型で素通しにすると
  // 接触型のジャンプまで無条件成立になっていた=社長が見た「赤サークルから離れてカウンター」。
  // よって判定は型ではなく **`opts.inAttackZone`(呼び出し側がゾーンの幾何で確認済みか)** で切り替える。
  // ボスが見つからない(撃破直後等)場合は従来どおり通す=厳しくするのは「離れている」と確認できた時だけ。
  // GHOST-COUNTER-PARITY(社長指示2「位置条件をプレイヤーと同じ『矩形が重なっている』へ。74pxの緩さを
  // 無くす」): 旧実装は GHOST_MELEE_RANGE=74px(敵の縁からの距離)という独自の緩い間合いだった。
  // プレイヤーの接触型カウンター(checkPlayerEnemyCollisions)は playerHitbox(2/3スケール矩形)と
  // enemyContactBox(敵の当たり判定帯)が**実際に重なっている**ことを要求する——同じ2関数を守護霊にも
  // 適用し、距離の閾値を持たない(74pxの手写しも二重定義もしない)。
  // ★判定時置換ミラー(監査R1): 位置ゲートは**城ボスの接触パリィ経路(contactGate:true)だけ**。
  // 他経路は成立の瞬間に「攻撃の成立域 × 守護霊の体」を呼び出し側が再評価するので二重にしない。
  if (opts?.contactGate && ghost) {
    const boss = st.enemies.find(e => e.id === pendingClaim!.bossId);
    if (boss && !checkCollision(playerHitbox(ghost), enemyContactBox(boss))) {
      logReject('位置', '接触ゲート(体の重なり)不成立');
      return null;
    }
  }
  return pendingClaim;
};

/** 対象ボスの期限内の請求を消費する(1請求=最大1回の成立)。対象違い/期限切れはnull(残置/実質破棄)。 */
export const consumeGhostCounterClaim = (
  bossId: string, nowMs: number, opts?: GhostClaimGateOpts,
): GhostCounterClaim | null => {
  const c = peekGhostCounterClaim(nowMs, opts);
  if (c === null || c.bossId !== bossId) return null;
  pendingClaim = null;
  if (GHOST_DMG_LOG_ENABLED) {
    const st = useGameStore.getState();
    const bossType = st.enemies.find(e => e.id === bossId)?.type ?? bossId;
    ghostLogPush(`${Math.round(st.gameTime / 100) / 10}s 成立 ${bossType}`);
  }
  return c;
};

/** リセット/テスト用。 */
export const clearGhostCounterClaim = (): void => { pendingClaim = null; };

/**
 * 守護霊カウンターの確定クリダメージ。**プレイヤーのカウンター反撃と同じ純関数**
 * (gameStore.counterReplyDamage = 基準銃damage × クリ倍率(スキル込み) × バーサーカー等 × 装備火力)を
 * そのまま使う。12 はプレイヤー側 `getActiveGun(cp)?.damage ?? 12` と同じフォールバック。
 *
 * v0.25.2514(GHOST-BUILD-1・§2.11訂正): 旧v0.25.2459方針「スキル倍率/装備は乗せない」を撤去。
 * `buildPlayer` に**計測時ビルドの疑似Player**(ghostBuild.ts)を渡すと、その撃破ランのスキル・装備で
 * 倍率が評価される。省略時は倍率なし(=旧挙動)のフォールバック=旧プロファイル/テスト用。
 */
export const ghostCounterDamage = (
  borrowedGunDamage: number | undefined,
  buildPlayer?: Player,
  bossCritMult: number = BOSS_CRIT_DAMAGE_MULT,
): number => buildPlayer
  ? counterReplyDamage(borrowedGunDamage, buildPlayer, bossCritMult)
  : Math.max(1, Math.round((borrowedGunDamage ?? 12) * bossCritMult));

/**
 * ゴーストのカウンター成立の「青い層」(リング/バースト/glow/Counter!コールアウト)+シェイク+
 * counter SE。全ゴースト成立経路(per-bossパリィ/城ボス系パリィ/**弾反射**)の共通部=1箇所で揃える。
 * glowは43=STRONG_GLOW_RADIUS(44)未満のプールsprite経路に抑える(v0.25.2479の掟。プレイヤーの95=
 * 強glowは真似ない)。除外1: 時間停止/スロー/ズーム(triggerHitImpact等)は絶対に呼ばない。
 */
// ★v0.25.3985(社長指示2026-08-27「カウンターはちゃんと幻影と同じにして」): export化——
// 接触受け流し(combatTick.tryGhostContactParry)も同じ青い成立層(Counter!+停止/揺れ/寄りズーム)を
// 出す。旧: 受け流しだけ小さいリング+音のみで、成立しても「カウンターした」と分からなかった。
export const ghostCounterBlueLayer = (
  hitX: number, hitY: number, sfxGain: number,
  playSfxGain: ((key: 'counter' | 'headshot', gain: number) => void) | null,
): void => {
  const st = useGameStore.getState();
  st.spawnRing(hitX, hitY, 14, 135, 'rgba(56,189,248,0.9)', 3, 360);
  st.spawnBurst(hitX, hitY, '#38bdf8', 14);
  st.spawnGlow(hitX, hitY, 43, 'rgba(56,189,248,', 360);
  st.spawnCallout(hitX, hitY - 12, 'Counter!', '#e0f2ff', { bg: 0x2563eb, holdMs: MELEE_FINISH_SLOW_HOLD_MS, duration: MELEE_FINISH_SLOW_MS });
  // v0.25.2582(社長「ためしたい」=除外1の試験改定): 守護霊のカウンター成立にも停止+揺れ+寄りズーム
  // (プレイヤー成立=useGameLoopのthorCounterHit等と同じ定数)。?ghostzoom=0で従来(シェイクのみ)へ。
  // v0.25.2585(社長報告「カメラが当人に向いてない。プレイヤーのみになってる」): 寄り先=**成立位置**
  // (守護霊とボスの間)を明示的に渡す。旧: 寄り先なし=画面中央=カメラが追うプレイヤーへ寄っていた。
  if (GHOST_ZOOM_TRIAL_ENABLED) {
    st.triggerHitImpact(COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG, hitX, hitY);
  } else if (GHOST_FX_SHAKE_ENABLED) st.triggerShake(COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG);
  if (playSfxGain && sfxGain > 0) playSfxGain('counter', sfxGain);
};

/**
 * 弾反射カウンター(守護霊・台帳§4-1)の成立演出。**ダメージは反射弾そのものが運ぶ**ので
 * ここでは与えない(=プレイヤーの弾反射と同じ構造。プレイヤー側の金クリ層も出ない)。
 * 除外1: プレイヤー側の triggerHitImpact(停止+揺れ+寄りズーム)は呼ばず、シェイクのみ。
 * 除外4: プレイヤー専用の副作用(計測notify/コンボ加算/CDリファンド/lastCounterSuccessTime)も呼ばない。
 */
export const applyGhostReflectCounterFx = (
  hitX: number, hitY: number, sfxGain: number,
  playSfxGain: ((key: 'counter' | 'headshot', gain: number) => void) | null,
): void => {
  ghostCounterBlueLayer(hitX, hitY, sfxGain, playSfxGain);
  // 「Counter!」の文字はプレイヤーの弾反射と同じ(社長裁定v0.25.2528「文字は出して欲しい」=
  // 除外1は停止/スロー/ズームの演出だけで、文字calloutは除外に含めない)。
  useGameStore.getState().spawnCallout(hitX, hitY - 12, 'Counter!', '#e0f2ff', { bg: 0x2563eb, holdMs: MELEE_FINISH_SLOW_HOLD_MS, duration: MELEE_FINISH_SLOW_MS });
};

/** 消費側がハンドラへ渡す1回分(請求+SEの距離減衰ゲイン。ゲインは消費時のカメラで算出)。 */
export interface GhostCounterFire {
  claim: GhostCounterClaim;
  sfxGain: number; // npcSfxDistGain(成立位置)。0=画面外=無音。
}

/**
 * 成立→効果の共通変換(per-bossハンドラのghost分岐から呼ぶ)。
 *  - 青カウンター層(プレイヤー成立と同型。glowは43=STRONG_GLOW_RADIUS(44)未満のプールsprite経路に
 *    抑える=v0.25.2479の掟。プレイヤーの95=強glowは真似ない)
 *  - 金クリ層(v0.25.2479では「嘘になるため」保留していたもの。本物のクリになったので解禁)
 *  - 確定クリダメージ(damageEnemy crit=true → bumpBossCrit=5クリ紫気絶の蓄積に乗る)+金クリ数字
 *  - SEはコールバック注入(audioManagerをここでimportしない=angelBossTick/combatTickのヘッドレス縛り)
 * プレイヤー専用の副作用(計測notify/コンボ/CDリファンド/lastCounterSuccessTime/
 * triggerHitImpact/markMeleeSwingFx)は呼ばない、が仕様。ボスの状態遷移(技の中断/counter-leap等)は
 * 呼び出し元のper-bossハンドラが従来どおりのpatchで行う=プレイヤー成立と同一。
 * 【v0.25.2489で仕様変更(社長裁定「プレイヤーと同じ仕様になってないのは漏れ」)】無敵はスキップ
 * リストから外し、成立時にゴーストへ INVULN_MS の付与無敵(ghostInvulnUntil)を与える=プレイヤーの
 * invulnerable付与と同等。専用フィールドなので被弾音/被弾フラッシュ(lastHitエッジ)は誤発火しない。
 */
export const applyGhostCounterEffect = (
  boss: { id: string; x: number; y: number; width: number; height: number },
  hitX: number, hitY: number,
  fire: GhostCounterFire,
  playSfxGain: ((key: 'counter' | 'headshot', gain: number) => void) | null,
): void => {
  const st = useGameStore.getState();
  const bcx = boss.x + boss.width / 2;
  // 青カウンター層(成立の合図)+SE+シェイク(全ゴースト成立経路の共通部)
  ghostCounterBlueLayer(hitX, hitY, fire.sfxGain, playSfxGain);
  // v0.25.2489: カウンター成立の付与無敵(プレイヤーのinvulnerable+invulnerableTime相当=INVULN_MS)。
  // 全per-bossハンドラ+城ボス系パリィがこの共通変換を通るので、ここ1箇所で全経路に効く。
  // GHOST-CMD-2A(§2.18追補 隙コマンド): カウンター成立の打刻(ghostLastCounterAt)。プレイヤー側の
  // player.lastCounterSuccessTime と同じ意味で、成立直後の追撃窓(afterCounter文脈)の錨点になる。
  // 全ゴースト成立経路がこの共通変換を通るので、無敵付与と同じ1箇所で全経路に効く。
  {
    const atMs = Date.now();
    const invulnUntil = atMs + INVULN_MS;
    useGameStore.setState(s => ({
      summons: s.summons.map(su => su.kind === 'ghost-ally'
        ? { ...su, ghostInvulnUntil: invulnUntil, ghostLastCounterAt: atMs }
        : su),
    }));
  }
  // 確定クリ(crit=true → bumpBossCrit)+金クリ層
  st.damageEnemy(boss.id, fire.claim.dmg, false, true, false, null, 'ghost', 'counter');
  st.spawnDamageNumber(bcx, boss.y, fire.claim.dmg, true);
  if (playSfxGain && fire.sfxGain > 0) playSfxGain('headshot', fire.sfxGain);
  st.spawnRing(hitX, hitY, 8, 46, 'rgba(253,224,71,0.95)', 3, 300);
  st.spawnBurst(hitX, hitY, '#fde047', 10);
  st.spawnGlow(hitX, hitY, 34, 'rgba(253,224,71,', 240);
};
