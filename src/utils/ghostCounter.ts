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
import {
  useGameStore, BOSS_CRIT_DAMAGE_MULT,
  COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, MELEE_FINISH_SLOW_MS, MELEE_FINISH_SLOW_HOLD_MS,
} from '../store/gameStore';

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

/** 請求の鮮度。消費はスイングと同フレーム(城ボス系)〜次フレーム(状態機械の閉包ハンドラ系)。
 * 低fps(50ms/フレーム)でも1〜2フレームは生きる長さにし、それより古い請求は流す
 * (ボスの技が進んでからの後出しパリィを防ぐ)。 */
export const GHOST_COUNTER_CLAIM_TTL_MS = 150;

let pendingClaim: GhostCounterClaim | null = null;

/** スイング側(useGameLoopのゴースト実行ブロック)が積む。常に最新1件だけ(同時ゴーストは1体)。 */
export const setGhostCounterClaim = (claim: GhostCounterClaim): void => { pendingClaim = claim; };

/** 期限内の請求を覗く(消費しない)。城ボス系入口(ボス型で振り分ける前段)用。 */
export const peekGhostCounterClaim = (nowMs: number): GhostCounterClaim | null =>
  pendingClaim !== null && nowMs - pendingClaim.atMs <= GHOST_COUNTER_CLAIM_TTL_MS ? pendingClaim : null;

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
 * 守護霊カウンターの確定クリダメージ。プレイヤーのカウンター反撃と同式
 * (counterBase × ボスクリ倍率 BOSS_CRIT_DAMAGE_MULT)を、ゴーストの既存方針(v0.25.2459:
 * 借用装備の生damage・スキル倍率 skillCritMult/skillOutgoingDamageMult/equipBonus は乗せない)に
 * 合わせたもの。12 はプレイヤー側 `getActiveGun(cp)?.damage ?? 12` と同じフォールバック。
 */
export const ghostCounterDamage = (
  borrowedGunDamage: number | undefined,
  bossCritMult: number = BOSS_CRIT_DAMAGE_MULT,
): number => Math.max(1, Math.round((borrowedGunDamage ?? 12) * bossCritMult));

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
 * プレイヤー専用の副作用(計測notify/コンボ/無敵/CDリファンド/lastCounterSuccessTime/
 * triggerHitImpact/markMeleeSwingFx)は呼ばない、が仕様。ボスの状態遷移(技の中断/counter-leap等)は
 * 呼び出し元のper-bossハンドラが従来どおりのpatchで行う=プレイヤー成立と同一。
 */
export const applyGhostCounterEffect = (
  boss: { id: string; x: number; y: number; width: number; height: number },
  hitX: number, hitY: number,
  fire: GhostCounterFire,
  playSfxGain: ((key: 'counter' | 'headshot', gain: number) => void) | null,
): void => {
  const st = useGameStore.getState();
  const bcx = boss.x + boss.width / 2;
  // 青カウンター層(成立の合図)
  st.spawnRing(hitX, hitY, 14, 135, 'rgba(56,189,248,0.9)', 3, 360);
  st.spawnBurst(hitX, hitY, '#38bdf8', 14);
  st.spawnGlow(hitX, hitY, 43, 'rgba(56,189,248,', 360);
  st.spawnCallout(hitX, hitY - 12, 'Counter!', '#e0f2ff', { bg: 0x2563eb, holdMs: MELEE_FINISH_SLOW_HOLD_MS, duration: MELEE_FINISH_SLOW_MS });
  if (GHOST_FX_SHAKE_ENABLED) st.triggerShake(COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG);
  if (playSfxGain && fire.sfxGain > 0) playSfxGain('counter', fire.sfxGain);
  // 確定クリ(crit=true → bumpBossCrit)+金クリ層
  st.damageEnemy(boss.id, fire.claim.dmg, false, true);
  st.spawnDamageNumber(bcx, boss.y, fire.claim.dmg, true);
  if (playSfxGain && fire.sfxGain > 0) playSfxGain('headshot', fire.sfxGain);
  st.spawnRing(hitX, hitY, 8, 46, 'rgba(253,224,71,0.95)', 3, 300);
  st.spawnBurst(hitX, hitY, '#fde047', 10);
  st.spawnGlow(hitX, hitY, 34, 'rgba(253,224,71,', 240);
};
