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
  useGameStore, BOSS_CRIT_DAMAGE_MULT, INVULN_MS, counterReplyDamage,
  COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, MELEE_FINISH_SLOW_MS, MELEE_FINISH_SLOW_HOLD_MS,
  COUNTER_HITSTOP_MS, COUNTER_ZOOM_MAG, GHOST_ZOOM_TRIAL_ENABLED, LATE_COUNTER_ENABLED,
  enemyMeleeDist,
} from '../store/gameStore';
import { GHOST_MELEE_RANGE } from './ghostDriver'; // 成立の間合い=意思決定側と同じ定数(二重定義しない)

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
  atMs: number;     // 請求時刻(Date.now)
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
 */
export const GHOST_COUNTER_CLAIM_TTL_MS = 150;

let pendingClaim: GhostCounterClaim | null = null;

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
export const peekGhostCounterClaim = (nowMs: number): GhostCounterClaim | null => {
  if (pendingClaim === null || nowMs - pendingClaim.atMs > GHOST_COUNTER_CLAIM_TTL_MS) return null;
  const st = useGameStore.getState();
  const ghost = st.summons.find(s => s.kind === 'ghost-ally');
  if (!LATE_COUNTER_ENABLED && ghost && ghost.lastHit > pendingClaim.atMs) return null; // 請求後に被弾=弾き失敗
  // v0.25.2594(社長報告「守護霊がありえない位置でカウンター取ってる」): **成立の瞬間にボスの間合いに
  // 居ること**を要求する(プレイヤーは `overlap && counterActive`=解決の瞬間に体が重なっている事が必須)。
  // v0.25.2588で受付を150→400ms(=プレイヤーと同じ窓長)へ広げた際、位置条件を写し忘れていたため、
  // スイング後に離れても成立していた=遠くでカウンターが出る絵になっていた。距離はプレイヤーと同じ
  // 縁基準(enemyMeleeDist)で、近接射程(GHOST_MELEE_RANGE)以内であること。ボスが見つからない
  // (撃破直後等)場合は従来どおり通す=判定を厳しくするのは「離れている」と確認できた時だけ。
  if (ghost) {
    const boss = st.enemies.find(e => e.id === pendingClaim!.bossId);
    if (boss) {
      const gcx = ghost.x + ghost.width / 2, gcy = ghost.y + ghost.height / 2;
      if (enemyMeleeDist(gcx, gcy, boss) > GHOST_MELEE_RANGE) return null;
    }
  }
  return pendingClaim;
};

/** 対象ボスの期限内の請求を消費する(1請求=最大1回の成立)。対象違い/期限切れはnull(残置/実質破棄)。 */
export const consumeGhostCounterClaim = (bossId: string, nowMs: number): GhostCounterClaim | null => {
  const c = peekGhostCounterClaim(nowMs);
  if (c === null || c.bossId !== bossId) return null;
  pendingClaim = null;
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
const ghostCounterBlueLayer = (
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
  st.damageEnemy(boss.id, fire.claim.dmg, false, true);
  st.spawnDamageNumber(bcx, boss.y, fire.claim.dmg, true);
  if (playSfxGain && fire.sfxGain > 0) playSfxGain('headshot', fire.sfxGain);
  st.spawnRing(hitX, hitY, 8, 46, 'rgba(253,224,71,0.95)', 3, 300);
  st.spawnBurst(hitX, hitY, '#fde047', 10);
  st.spawnGlow(hitX, hitY, 34, 'rgba(253,224,71,', 240);
};
