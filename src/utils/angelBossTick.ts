// M26 Step3(PACING_PUZZLE.md §6.2): 天使(ゲート2ボス=ミゲル/ジブリル/ラフィ/ウリ/スリィエル/アクラシエル)
// コントローラの純関数抽出。useGameLoop.ts に直書きされていた専用ミニコントローラを、実プレイ
// (useGameLoop)とヘッドレス(playtestDriver)の両方から呼べる形へ移設(実装精度の規律4/ M17 combatTick
// と同じ流儀)。
// - シミュレーション(移動・攻撃判定・ダメージ・弾/火/骨刃の生成・カウンター報酬)はここで store を直接叩く。
// - 音(playSfx)だけ AngelSfx コールバックで注入(audioManagerはヘッドレスでimportしない縛りのため)。
//   視覚エフェクト(リング等)は store のプールAPI=ヘッドレスでも無害なので直接呼ぶ。
//
// PACING_PUZZLE.md §6.28 バッチM53/M55/M57/M61/M62/M63(ロットL2): 6体ぶんのソウル式台本を追加。
// §6.26(ジャイアント)で確立した4チャンネル分解(windup/active/recover)と掟W1〜W7を継承する。
// 既存3体(ミゲル/ジブリル/ラフィ)は挙動を書き換えるため、変更前の実装をそのまま
// `run<boss>TickLegacy` として残し、`?<boss>script=0` で丸ごとフォールバックできるようにしてある
// (giantScriptの`?giantscript=0`と同じ作法・CLAUDE.md「仕様変更のルール」)。新規3体(ウリ/スリィエル/
// アクラシエル)は現状「棒立ち」(台本が無い)なので、フォールバックは「tickを呼ばない」だけで足りる。
//
// 時間の単位(重要・§6.28-1-0): このファイルの天使勢は「壁時計系」。定数はそのまま実効msで書く
// (giantbatのようにENEMY_ATTACK_SPEED_MULTを掛けも割りもしない)。
import type { Enemy } from '../types/game';
import { GLOW_R_L } from './glowTiers';
import {
  isCounterActive, // ★カウンター成立の唯一の判定(v0.25.3926・刃が出ている間だけ)
  useGameStore, counterReplyDamage, skillLevel, enemyDeathLabel, counterMasterAwakenBuffPatch,
  BOSS_CRIT_DAMAGE_MULT, COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG,
  MELEE_FINISH_SLOW_MS, MELEE_FINISH_SLOW_HOLD_MS, bossSlowMult, bossCritCdMult } from '../store/gameStore';
import { getActiveGun } from './weaponUtils';
import { createEnemyProjectile, isGate2AngelBoss, spawnEnemyAt } from './enemyUtils';
import { rectsOverlap } from '../world/obstacles';
import { airHopEase01 } from './airHop';
import { distToSegment } from './levelUpGate';
// v0.25.3496: 帯(drawAngelZoneCapsule=四角)の判定は四角そのもの。ビーム/レーザー(線)はdistToSegmentのまま。
import { distToBandRect } from './geometry';
// ★v0.25.3591: カウンター成立域(赤い予告の図形)の宣言表=全系統で1箇所(counterReach.ts)。
import { counterReachShapeFor, inCounterReach, isCounterOpportunityNow } from './counterReach';
import { phaseForHealth, phaseJustChanged, BOSS_ALERT_SFX_KEY } from './bossScript';
import { notifyCounterHit, notifyMoveCounter } from './playerTraits'; // BOT_AND_GHOST.md G1/G4a(計測専用・挙動不変)
import { recordCritHit } from './botTelemetry'; // PACING_PUZZLE.md §7-11c(4): クリ計測口(計測専用・挙動不変)
import { refundCounterCooldown } from './counterMaster'; // counter-master v2(CD_REWORK.md 確定2)
import { consumeGhostCounterClaim, applyGhostCounterEffect, type GhostCounterFire } from './ghostCounter'; // v0.25.2480: 守護霊カウンターの合流
import { isBodySlamNow } from './enemyBite'; // ★カウンター憲法(v0.25.3947): 面成立は体当たり技の最中のみ
import { npcSfxDistGain } from './npcSfx'; // v0.25.2480: 守護霊カウンターSEの距離減衰
import { pickMiguelMove } from './miguelScript';
import { pickJibrilMove, jibrilVolleyMode, JIBRIL_PHASE_HP_THRESHOLD, JIBRIL_EDGE_STICK_MS } from './jibrilScript';
import { pickRafiMove, RAFI_PHASE_HP_THRESHOLD } from './rafiScript';
import { pickUriMove, uriSweepInnerRadius, URI_PHASE_HP_THRESHOLD } from './uriScript';
import { pickSurielMove, surielRingCount, SURIEL_PHASE_HP_THRESHOLD } from './surielScript';
import {
  pickAcrasielMove, acrasielPhaseForHealth, acrasielSpikeGapCount,
  pickSpikeGapMask, isSpikeGapSector,
} from './acrasielScript';
import {
  pickPhillMove, phillPhaseForHealth, phillRequiredMoveReady, phillRequiredMoveDamage,
  phillSummonSpawnCount, PHILL_REQUIRED_GAP_MS, PHILL_SUMMON_CAP,
  type PhillMoveGates, type PhillMove,
} from './phillScript';
import { resolveBossHateAim, resolveBossLockedHateAim, type ResolvedHateAim } from './bossHate'; // BOT_AND_GHOST.md §2.8 G2.5
import { bossNeutralDelayMs, bossRebuildIdForEnemy } from './bossRebuild';
// v0.25.2609(ボス動き横断監査・バッチ2): 硬直=パニッシュ窓の床。本作の「1発」=カウンター1サイクル
// (COUNTER_WINDOW 400ms + COUNTER_COOLDOWN 420ms = 820ms)なので、硬直がそれ未満だと
// 「硬直はあるがプレイヤーは1発も入れられない」=休符が存在しないのと同じ。監査で天使の硬直の
// 大半(300〜750ms)が該当した。**定数の宣言側を withRecoverFloor で包む**ことで、元の数字を
// 履歴として残したまま床を1箇所で保証する(呼び出し箇所は一切変えない)。
// ★v0.25.3564: 硬直の床を掛ける場所は `angelScript.ts`(テーブルの既定値)へ移った。
// 天使6体の技の数値はそこが正本=判定(このファイル)も描画(pixiScene)も同じ実体を読む。
import {
  ANGEL_COMMON_TUNING as AN_C,
  ANGEL_MIGUEL_TUNING as MG_T, ANGEL_JIBRIL_TUNING as JB_T, ANGEL_RAFI_TUNING as RF_T,
  ANGEL_URI_TUNING as UR_T, ANGEL_SURIEL_TUNING as SR_T, ANGEL_ACRASIEL_TUNING as AC_T,
  ANGEL_PHILL_TUNING as PH_T,
} from './angelScript';
import { choreographyRecoverMs, planBossChoreography, type ChoreographyBoss } from './bossChoreography';
// v0.25.2617(idolTick.tsと同じ理由): プレイヤーの移動クランプと**同じ純関数**を使う。
// `playableArea.ts` は「行ける帯」の唯一の出どころ。天使はここ(applyPatch)を通っていなかった
// (CLAUDE.md「アクターを動かす時は必ずclampRectToPlayableAreaを通す」・v0.25.2615-2617の
// 3連続事故の再発防止・v0.25.2895)。
import { clampRectToPlayableArea, type PlayableAreaCtx } from '../world/playableArea';
// PACING_PUZZLE.md §10-20#6(EX舞台の洋館通路化「関所も同方式(推薦)」): スリィエルの周回AI
// (orbitRadius≒250)が素の通路幅±170で壁に貼り付いて破綻するのを防ぐため、天使6体共通のこの
// クランプにもexStageを渡す。isExStageRun()は他ステージ(EX以外)では常にfalse=M6含め無変化。
import { isExStageRun } from './exStage';
import { exPhillNorthCenterLimitY } from '../world/exHall'; // §10-20-FB1-1: フィルの上端クランプ
import { BOSS_SPRITE_FIT } from '../pixi/renderSpec'; // ★検収監査#4: fit値はロジック層(ここ)が持つ
// 剣ボスの踏み込み(社長指示v0.25.3524)。慣性つきの位置だけを返す純関数(判定には一切触らない)。
import { planSwordLunge, isSwordLungeLive, swordLungeCenterAt } from './swordLunge';

// --- 音の注入(ヘッドレスはNOOP) -------------------------------------------
export interface AngelSfx {
  // gain(省略時=等倍)は守護霊カウンター(v0.25.2480)の距離減衰用。プレイヤー成立は従来どおり引数なし=等倍。
  counter: (gain?: number) => void;  // カウンター成立(playSfx('counter'))
  reward: (gain?: number) => void;   // 反撃ヒット(playSfx('headshot'))
  sweep: () => void;    // 払い/縦払い実行(playSfx('thor-sweep'))
  // §6.28共通: 予告SE(全技共通=hunter-alert流用・§6.26-9 #5)。溜め(windup)へ入った瞬間に1回。
  alert: () => void;
  // v0.25.3700(社長指示・プレイヤー近似流用): 技SEの追加分。全て () => void。
  shot: () => void;      // 弾発射(playSfx('handgun-fire'))
  thrust: () => void;    // 突き(playSfx('thor-thrust'))
  dashSlash: () => void; // ダッシュ斬り(playSfx('katana-dash'))
  slashHit: () => void;  // 斬撃命中(playSfx('slash-damage'))
  beam: () => void;      // ビーム/凝視発射(playSfx('heavy-impact'))
  iceBurst: () => void;  // 結晶/氷起爆(playSfx('skadi-ice'))
  throw: () => void;     // 投擲(playSfx('boomerang-throw'))
  summon: () => void;    // ★v0.25.フィルバッチ2: 召喚(playSfx('summon')・§10-3の6)
  // ★v0.25.3741(社長提供SE): フィルの天の光スポットライト予兆。skylight=祝福 / skylightLow=裁きの光
  // (同素材のピッチ下げ=「少し音を低く(音量ではなく)」)。
  skylight: () => void;
  skylightLow: () => void;
}
export const NOOP_ANGEL_SFX: AngelSfx = {
  counter: () => {}, reward: () => {}, sweep: () => {}, alert: () => {},
  shot: () => {}, thrust: () => {}, dashSlash: () => {}, slashHit: () => {}, beam: () => {}, iceBurst: () => {}, throw: () => {},
  summon: () => {}, skylight: () => {}, skylightLow: () => {},
};
void BOSS_ALERT_SFX_KEY; // (呼び出し側=useGameLoop.tsがplaySfx(BOSS_ALERT_SFX_KEY)をalertへ配線する)

// --- ボスごとのフォールバック(`?<boss>script=0`・giantScriptと同じ作法) -----------------------
const scriptFlag = (name: string): boolean =>
  typeof window === 'undefined' || new URLSearchParams(window.location.search).get(name) !== '0';
export const MIGUEL_SCRIPT_ENABLED = scriptFlag('miguelscript');
export const JIBRIL_SCRIPT_ENABLED = scriptFlag('jibrilscript');
export const RAFI_SCRIPT_ENABLED = scriptFlag('rafiscript');
// ★uri/suriel/acrasiel のフラグは撤去(v0.25.2893)。この3体はLegacy実装が無く、`?uriscript=0` は
// 「旧実装へ戻す」ではなく**tickを丸ごと止める=ボスが凍結して倒せなくなる**footgunだった。

// --- 定数(このファイルに残るのは「場の幾何」と「旧実装(Legacy)専用」だけ) ---------------------
// ★v0.25.3564(ボスメーカー横展開・第3弾): 天使6体の**技の数値は `src/utils/angelScript.ts` の
//   テーブルへ移した**(BOSS_MAKER.md §2-2「台本はコード / 数字はテーブル」)。既定値は現行値と
//   完全一致=挙動は1バイトも変わらない。**判定(ここ)と描画(pixiScene)は同じテーブルを読む**
//   ので、画面で動かした値がそのまま両方に効く(スカラーの再exportは数値のコピー=効かない)。
//   ここへ新しい数値定数を足す前に、それがテーブル側に載るべきものでないか確認すること。
const GATE_ARENA_RADIUS = 300;          // ゲートアリーナ半径(useGameLoop.tsと同値)

/** ★v0.25.3588(社長報告「ジブリルのランタンレーザー3連、予告線が規定通りの流星になってない」):
 *  ランスの発射時刻は「縁に到着した時」で事前に確定しないため、描画の流星が消え切るタイミングを
 *  同期できなかった(旧: minWindup基準でprogが先に1へ到達→赤が消えた後にレーザーが来る)。
 *  射出時点で**直線飛行と仮定した縁到着時刻**を見積もって焼く(旋回で実際は多少遅れる=描画側が
 *  「発射までは消し切らない」ガードで吸収)。純関数(発射判定そのものは従来どおり=挙動不変)。 */
export const estimateLanceFireAt = (
  x0: number, y0: number, dir: number, homeX: number, homeY: number, bornAt: number,
): number => {
  const px = x0 - homeX, py = y0 - homeY;
  const dx = Math.cos(dir), dy = Math.sin(dir);
  const b = px * dx + py * dy;
  const c = px * px + py * py - GATE_ARENA_RADIUS * GATE_ARENA_RADIUS;
  const disc = b * b - c;
  const distToRim = disc >= 0 ? Math.max(0, -b + Math.sqrt(disc)) : GATE_ARENA_RADIUS;
  const flightMs = (distToRim / Math.max(1, JB_T.lance.lanternSpeed)) * 1000;
  return bornAt + Math.max(JB_T.lance.minWindup, flightMs);
};
const ORBIT_RADIUS_CORRECT = 4;         // 半径補正の寄せ係数(=THOR_ORBIT_RADIUS_CORRECT)
const HARAI_TRIGGER_DIST = 250;         // 斬り系を出せる距離(同値・旧実装専用)
// §6.28共通: フェーズ移行の一瞬だけHPバーを点滅させる長さ(ジャイアントのGIANT_PHASE_FLASH_MSと同値)。
const ANGEL_PHASE_FLASH_MS = 1200;
const MIGUEL_ORBIT_MARGIN = 20;         // 縁のマージン(6体の maxR が読む「場」の寸法)
// --- 旧実装(`?<boss>script=0` の runXxxTickLegacy)専用。フォールバックは変更前の姿を保つのが
//     役目なので、テーブル化しない(可変にすると「戻す先」が動いてしまう)。 -------------------
const MIGUEL_VOLLEY_CHANCE_LEGACY = 0.6;
const JIBRIL_HANDGUN_DIST = 300;
const JIBRIL_SNIPE_SHOTS = 3;
const JIBRIL_CLOSE_SHOTS = 5;
const JIBRIL_SNIPE_GAP_MS = 1000;
const JIBRIL_SNIPE_SPEED_MULT = 2;
const JIBRIL_LANTERN_CHANCE_LEGACY = 0.4;
const RAFI_HANDGUN_DIST = 300;
// (帯の判定自体は surielMoveEligible 側=surielScript.ts が持つ。ここでは未使用の確認用)
const SURIEL_RINGSPIN_TRIGGER_RANGE = 140; // surielScript.SURIEL_RINGSPIN_RANGE と同値
void SURIEL_RINGSPIN_TRIGGER_RANGE;

// --- ラン単位の状態(useGameLoopの各refの移設。両呼び出し側がラン開始時に作り直す) ---
export interface AngelBossState {
  miguelSlow: { slowUntil: number; nextAt: number };
  miguelVolley: { nextShotAt: number; shots: number };
  jibril: { hits: number; lastHitSeen: number; lastWarpHits: number; volleyMode: 'snipe' | 'close'; lastScriptMove: 'lantern' | 'consecrate' | 'volley' | 'lance' | undefined; shots: number; nextShotAt: number; nextFireAt: number; edgeSince: number | undefined; lanceStartAt: number; lanceLaunched: number };
  rafi: { rejumps: number; boneLeft: number; boneNextAt: number; nextStepAt: number; stepUntil: number; stepDx: number; stepDy: number };
  uri: { shots: number; nextShotAt: number };
  suriel: { gazeShots: number }; // gazeShots=★v0.25.3590 凝視10連射の発数カウンタ(他はEnemy側のringX/Y等に永続化)
  /** フィル(§10・バッチ2)。CDは4大技それぞれ個別+裁きの光/羽根の檻の共通4秒ゲート(§10-14#7)。 */
  phill: {
    lightrainReadyAt: number; goldringReadyAt: number; judgmentReadyAt: number; cageReadyAt: number;
    requiredReadyAt: number;
    lightrainQueue: { x: number; y: number; at: number }[];
    lancefanVolley: number; lancefanNextAt: number;
    meteorHomingIds: string[];
  };
}
export const createAngelBossState = (): AngelBossState => ({
  miguelSlow: { slowUntil: 0, nextAt: 0 },
  miguelVolley: { nextShotAt: 0, shots: 0 },
  jibril: { hits: 0, lastHitSeen: 0, lastWarpHits: 0, volleyMode: 'snipe', lastScriptMove: undefined, shots: 0, nextShotAt: 0, nextFireAt: 0, edgeSince: undefined, lanceStartAt: 0, lanceLaunched: 0 },
  rafi: { rejumps: 0, boneLeft: 0, boneNextAt: 0, nextStepAt: 0, stepUntil: 0, stepDx: 0, stepDy: 0 },
  uri: { shots: 0, nextShotAt: 0 },
  suriel: { gazeShots: 0 }, // ★v0.25.3590
  phill: {
    lightrainReadyAt: 0, goldringReadyAt: 0, judgmentReadyAt: 0, cageReadyAt: 0, requiredReadyAt: 0,
    lightrainQueue: [], lancefanVolley: 0, lancefanNextAt: 0, meteorHomingIds: [],
  },
});

// カウンター成立の共通処理(旧miguelCounterHit/rafiCounterHit)。演出+プレイヤー無敵+反撃ダメージ。
// 後退(counter-leap)は呼び出し側がpatchで行う(ミゲルのみ)。
// v0.25.2480: ghost(守護霊カウンター成立)付きで呼ばれた時は、プレイヤー専用の副作用
// (G1/G4a計測notify・コンボ・無敵/CDリファンド/lastCounterSuccessTime・triggerHitImpact(停止+ズーム)・
// markMeleeSwingFx・強glow95)をスキップし、共通ヘルパで確定クリ+青/金FX+SE距離減衰だけを出す。
// ボスの状態遷移(chase復帰/counter-leap)は呼び出し側の従来patch=プレイヤー成立と同一。
/**
 * ★カウンター成立の共通処理。**この関数には多重発火の防止が無い**(コンボ+1・SE・ヒットストップ・
 * CD返還・反撃ダメージ・体幹削りが呼ぶたびに全部走る)ので、**呼ぶ側が「1回だけ」を保証すること**。
 *
 * v0.25.3128(社長報告「スリィエルのカウンターすると多段カウンターするけどなぜ?」)の再発防止メモ:
 * 判定が出続ける技(環の射出/回転斬/大薙ぎ/払い/棘/爆発…)は**毎フレーム**範囲内かを見る。
 * 旧実装は成立時に `countered = true` を立てるだけで、**技の状態もカウンター窓も変えていなかった**
 * ため、窓が閉じるまで毎フレーム成立し続けていた(体幹が一瞬で削れて紫になる副作用つき)。
 * ⇒ 今は成立と同時に `bossState='chase'` で**技を中断**する(溜め/硬直のカウンターと同じ扱い)。
 * **判定が出続ける技をこの先足す時も、成立したら必ず状態を進めること。**
 */
const angelCounterHit = (boss: Enemy, bcx: number, hitX: number, hitY: number, sfx: AngelSfx, ghost?: GhostCounterFire): void => {
  // カウンターは台本の割り込み成功。残り手を破棄し、次は新しい始動から組み直す。
  useGameStore.setState(st => ({ enemies: st.enemies.map(e => e.id === boss.id ? { ...e, bossScriptQueue: [] } : e) }));
  if (ghost) {
    applyGhostCounterEffect(boss, hitX, hitY, ghost, (key, gain) => (key === 'counter' ? sfx.counter(gain) : sfx.reward(gain)));
    return;
  }
  // BOT_AND_GHOST.md G1(計測専用・挙動不変): miguel/jibril/rafi/uri/suriel/acrasielの6体が
  // 共通で通るこの1箇所で、カウンター成立をplayerTraitsへ通知する。
  notifyCounterHit();
  notifyMoveCounter(); // G4a(§2.9・記録専用): 成立⑦=技への反応表へも通知(天使6体はG4b対象=表キー未定義・現状no-op)
  const st = useGameStore.getState();
  const cp = st.player;
  const pnow = Date.now();
  st.addMeleeFinishCombo(1);
  sfx.counter();
  st.spawnGlow(hitX, hitY, GLOW_R_L, 'rgba(56,189,248,', 360);
  st.triggerHitImpact(COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG);
  st.markMeleeSwingFx();
  st.spawnRing(hitX, hitY, 14, 135, 'rgba(56,189,248,0.9)', 3, 360);
  st.spawnBurst(hitX, hitY, '#38bdf8', 14);
  st.spawnCallout(hitX, hitY - 12, 'Counter!', '#e0f2ff', { bg: 0x2563eb, holdMs: MELEE_FINISH_SLOW_HOLD_MS, duration: MELEE_FINISH_SLOW_MS });
  // counter-master v2(CD_REWORK.md 確定2): カウンター成立時のみCDリファンド(未所持は無変換)。
  useGameStore.setState(stt => ({ player: {
    ...stt.player, invulnerable: true, invulnerableTime: pnow, lastCounterSuccessTime: pnow,
    counterCooldownEnd: refundCounterCooldown(stt.player.counterCooldownEnd, pnow, skillLevel(stt.player, 'counter-master')),
    // 覚醒(Lv3・v0.25.3303): 成立後3秒間 全攻撃+30%(成立7箇所共通のパッチ)。
    ...counterMasterAwakenBuffPatch(stt.player, stt.gameTime),
  } }));
  const counterBase = getActiveGun(cp)?.damage ?? 12;
  const dmg = counterReplyDamage(counterBase, cp, BOSS_CRIT_DAMAGE_MULT);
  useGameStore.getState().damageEnemy(boss.id, dmg, false, true, false, 'other', 'player', 'counter');
  recordCritHit('guaranteed', true); // §7-11c(4): カウンター反撃(確定クリ・天使6体は常にボス)
  useGameStore.getState().spawnDamageNumber(bcx, boss.y, dmg, true);
  sfx.reward();
  useGameStore.getState().spawnRing(hitX, hitY, 8, 46, 'rgba(253,224,71,0.95)', 3, 300);
  useGameStore.getState().spawnBurst(hitX, hitY, '#fde047', 10);
  useGameStore.getState().spawnGlow(hitX, hitY, 34, 'rgba(253,224,71,', 240);
};

// ★カウンター憲法(社長裁定2026-08-26「攻撃判定と窓が重なった時だけがカウンター成立」・v0.25.3947):
// このヘルパ(87箇所の面成立の合流点)は、**体をぶつけに行く技の最中(isBodySlamNow=接触判定が
// 生きている=ミゲルの踏み込み等)だけ**成立を返す。溜め/硬直/追尾中/事後窓は攻撃判定ゼロ=全て不成立。
// 各ハンドラ内の isCounterActive 直判定(判定時の置換カウンター)・爆風パリィ・弾反射はヘルパ不経由
// =1bitも変わらない。過去の裁定(W7 v3128 / v3131 / v3591の着地円・事後窓 / §10-12#16)は本憲法が上書き。
const bodyOverlapNow = (boss: Enemy): { overlap: boolean; counterActive: boolean } => {
  if (!isBodySlamNow(boss)) return { overlap: false, counterActive: false };
  const cp = useGameStore.getState().player;
  return {
    overlap: rectsOverlap({ x: boss.x, y: boss.y, width: boss.width, height: boss.height }, { x: cp.x, y: cp.y, width: cp.width, height: cp.height }),
    counterActive: isCounterActive(cp, Date.now()),
  };
};

/**
 * ★v0.25.3591(監査 research/COUNTER_REACH_AUDIT.md): **赤い予告の図形=カウンターの成立域**。
 * `bodyOverlapNow` と同じ形を返すので、体の重なりで見ていた州はキーを渡すだけで図形reachへ移せる。
 * どの州がどの図形かは counterReach.ts の宣言表が正本(キーは天使だけ**boss.typeで引く**——
 * 'sweep-windup' 等の州名が6体で衝突し、寸法が別テーブルだから)。
 */
const reachOverlapNow = (boss: Enemy, state: string): { overlap: boolean; counterActive: boolean } => {
  // ★カウンター憲法(v0.25.3947): bodyOverlapNow と同じゲート(上のコメント参照)。
  if (!isBodySlamNow(boss)) return { overlap: false, counterActive: false };
  const cp = useGameStore.getState().player;
  const bcx = boss.x + boss.width / 2, bcy = boss.y + boss.height / 2;
  return {
    overlap: inCounterReach(
      counterReachShapeFor(`${boss.type}:${state}`, {
        bcx, bcy,
        pcx: cp.x + cp.width / 2, pcy: cp.y + cp.height / 2,
        aiFromX: boss.aiFromX, aiFromY: boss.aiFromY, aiTargetX: boss.aiTargetX, aiTargetY: boss.aiTargetY,
      }),
      { x: cp.x, y: cp.y, width: cp.width, height: cp.height },
      { x: boss.x, y: boss.y, width: boss.width, height: boss.height },
    ),
    counterActive: isCounterActive(cp, Date.now()),
  };
};

// v0.25.2480(DEVELOPMENT_LOG v0.25.2479★未決1解消): 守護霊カウンター請求(ghostCounter.ts)の
// 天使6体側の消費。成立州はプレイヤーと同一=各tickの bodyOverlapNow 分岐が存在する州(全windup/recover)。
// 概算(isBossCounterableNowApprox=語尾判定)との差分は次の2つだけ(全9tickの分岐を全数確認済み):
//  - jibril 'warp-recover': プレイヤー不可の州(カウンター分岐なし)→ 明示除外(判定を広げない)。
//  - acrasiel 'warp-out': プレイヤー可だが語尾に載らない → ゴーストの請求自体が積まれない(狭い側=許容)。
//  - v0.25.3131追加: jibril 'lantern' / 'volley' も**プレイヤー可になった**が語尾に載らない
//    → 上と同じ「狭い側」。守護霊はこの2州でカウンターを取らない(取り逃すだけ=誤爆はしない)。
//    広げるには概算(語尾判定)ではなく州名リストの集約が要るので、ここでは記録に留める(★未決のまま)。
// 同フレームにプレイヤーの成立(overlap&&窓)が立っている時はプレイヤー優先(体験を1bitも変えない)。
const takeGhostAngelCounter = (boss: Enemy): GhostCounterFire | null => {
  // ★カウンター憲法(v0.25.3947)→★v0.25.3962修正(社長報告「守護霊がカウンターとれなくなってる」):
  // v3947の絞りは isBodySlamNow(体当たり中)**かつ**旧approx(語尾-windup/-recover)で、体当たり州は
  // 語尾を持たないため**両立する州が存在せず守護霊の天使カウンターが全滅**していた。憲法の基準
  // 「判定が生きている間だけ」に正しく揃える=**実行中の成立州(isCounterOpportunityNow)か
  // 体当たり中(isBodySlamNow)**なら請求を消費できる。面成立(溜め/硬直)は引き続き不成立。
  if (!isCounterOpportunityNow(boss) && !isBodySlamNow(boss)) return null;
  if (boss.type === 'jibril' && boss.bossState === 'warp-recover') return null;
  const { overlap, counterActive } = bodyOverlapNow(boss);
  if (overlap && counterActive) return null; // プレイヤー成立が同フレームに立つ→各州の分岐に譲る
  // ★判定時置換ミラー(社長裁定2026-08-27・GHOST_PARITY_LEDGER.md ★仕様v2 §成立地点4/監査M5):
  // 位置条件=プレイヤーの成立式(bodyOverlapNow=**生の矩形の重なり**)と同形を守護霊で再評価する
  // (体を置き換えただけ・M2「置換する元の判定が使っている体をそのまま使う」)。
  // 旧v3962は州ゲート+請求存在だけで、守護霊がどこに居ても成立していた(面成立の残り)。
  const gState = useGameStore.getState();
  const gGhost = gState.summons.find(su => su.kind === 'ghost-ally' && su.ghostBossId === boss.id);
  if (!gGhost) return null;
  if (!rectsOverlap(
    { x: boss.x, y: boss.y, width: boss.width, height: boss.height },
    { x: gGhost.x, y: gGhost.y, width: gGhost.width, height: gGhost.height },
  )) return null;
  const claim = consumeGhostCounterClaim(boss.id, Date.now());
  if (claim === null) return null;
  const st = useGameStore.getState();
  const pcx = st.player.x + st.player.width / 2, pcy = st.player.y + st.player.height / 2;
  const bcx = boss.x + boss.width / 2, bcy = boss.y + boss.height / 2;
  return { claim, sfxGain: npcSfxDistGain(bcx, bcy, pcx, pcy, st.camera, st.gameBounds) };
};

// CRIT-UNIFY §9.2: クリ窓中(boss.bossSlowUntil)は次行動CDに×2(bossCritCdMult・純関数はgameStore.ts)。
// 窓外・非ボスは×1=無改変。カウンター成立(angelCounterHit)の直後・同フレームでCDを組む経路が
// あるため、渡された引数(フレーム先頭のstaleスナップショット)ではなく、その時点の最新状態を
// idで読み直す(damageEnemyのcrit適用=bossSlowUntilの反映を取りこぼさない)。
const freshCritCdMult = (bossId: string, t: number): number => {
  const fresh = useGameStore.getState().enemies.find(e => e.id === bossId);
  return fresh ? bossCritCdMult(fresh, t) : 1;
};
// 呼び出し側は自分のboss個体を渡す(6体共通のこの1関数だけを直せば全員に効く)。
const nextActionDelay = (t: number, boss: Enemy): number => {
  const profileId = bossRebuildIdForEnemy(boss.type);
  // このコントローラに来る6体は全て台帳に載る。未知型だけ安全側の0.9秒へ落とす。
  const neutralMs = profileId ? bossNeutralDelayMs(profileId, boss.bossPhase ?? 1) : 900;
  return t + neutralMs * freshCritCdMult(boss.id, t);
};

const chooseScriptMove = <T extends string>(
  boss: Enemy,
  bossId: ChoreographyBoss,
  phase: number,
  fallback: () => T | null,
): { move: T | null; remaining: string[] } => {
  const [queued, ...rest] = boss.bossScriptQueue ?? [];
  if (queued) return { move: queued as T, remaining: rest };
  const move = fallback();
  return { move, remaining: move ? planBossChoreography(bossId, move, phase).slice(1) : [] };
};

const scriptOrNeutralAt = (t: number, boss: Enemy): number =>
  (boss.bossScriptQueue?.length ?? 0) > 0 ? t : nextActionDelay(t, boss);

// =================================================================================================
// ボスメーカー: 技の個別再生(▸)の要求箱(BOSS_MAKER.md §6-1・v0.25.3564)
// =================================================================================================
// 置き場所は idolTick.ts の pendingPlay / bountyTick.ts の pendingBountyPlay と同型: パネル(React)は
// 各tickのローカル変数を持てないので、**モジュール変数の要求箱**を経由し、tickが引き取る。
// ★この箱は BossMakerPanel からしか書かれない=**通常プレイでは常に null**(毎フレームの追加費用は
//   bool 2つの比較だけ。天使6体の実プレイ挙動は1バイトも変わらない)。
//
// ★掟(v0.25.3563で確立): 技の**遷移コードを複製しない**。各tickの chase 分岐にあった「技を始める」
//   部分は `begin*` の束(各tick内のローカル関数)へ切り出してあり、**実戦の抽選と▸の再生が
//   同じ1本を通る**。条件(距離帯・CD・重みの抽選)は呼び出し側に残る=▸は条件をバイパスして
//   begin* を直接叩ける(部屋は訓練場)。写すと「メーカーでは出るのに実戦で出ない(逆も)」が静かに生まれる。

/** ▸で再生できる技のキー(パネルのボタンと1対1)。 */
export type AngelMoveKey =
  | 'mg-harai' | 'mg-dash' | 'mg-volley'
  | 'jb-volley' | 'jb-lantern' | 'jb-consecrate' | 'jb-lance' | 'jb-warp'
  | 'rf-bone' | 'rf-jump' | 'rf-sweep' | 'rf-roll'
  | 'ur-sweep' | 'ur-downslash' | 'ur-thrust' | 'ur-bolt'
  | 'sr-ringshot' | 'sr-ringspin' | 'sr-sweep' | 'sr-gaze'
  | 'ac-spike' | 'ac-spear' | 'ac-warp' | 'ac-burst' | 'ac-gaze'
  | 'ph-lightrain' | 'ph-lancefan' | 'ph-wingslash' | 'ph-wingthrust' | 'ph-wingcombo'
  | 'ph-summon' | 'ph-goldring' | 'ph-judgment' | 'ph-cage' | 'ph-meteor' | 'ph-ringtoss'
  | 'ph-dive' | 'ph-feathershot';

/**
 * どのボスがどの技を持つか。**パネルの playables と、再生時の取り違え防止の両方がこれを読む**
 * (1つの出どころ=「ボタンは出ているのに何も起きない」を原理的に作らない)。
 */
export const ANGEL_MOVES_BY_TYPE: Readonly<Record<string, readonly AngelMoveKey[]>> = {
  miguel: ['mg-harai', 'mg-dash', 'mg-volley'],
  jibril: ['jb-volley', 'jb-lantern', 'jb-consecrate', 'jb-lance', 'jb-warp'],
  rafi: ['rf-bone', 'rf-jump', 'rf-sweep', 'rf-roll'], // rf-roll=★v0.25.3592 ロール台本
  uri: ['ur-sweep', 'ur-downslash', 'ur-thrust', 'ur-bolt'],
  suriel: ['sr-ringshot', 'sr-ringspin', 'sr-sweep', 'sr-gaze'],
  acrasiel: ['ac-spike', 'ac-spear', 'ac-warp', 'ac-burst', 'ac-gaze'],
  // フィル(§10・バッチ2): 技14(実在13・#13は落とされ番号だけ14まで進む。§10-13)。
  phillboss: [
    'ph-lightrain', 'ph-lancefan', 'ph-wingslash', 'ph-wingthrust', 'ph-wingcombo',
    'ph-summon', 'ph-goldring', 'ph-judgment', 'ph-cage', 'ph-meteor', 'ph-ringtoss',
    'ph-dive', 'ph-feathershot',
  ],
};

interface AngelPlayRequest { move: AngelMoveKey; solo: boolean; loop: boolean }
let pendingAngelPlay: AngelPlayRequest | null = null;
/** 単独再生の実行中(=停止中でも tick を進めてよい)。技が終わったら false へ戻る。 */
let angelSoloActive = false;
/** ループ再生中の技(null=1回で止まる)。 */
let angelLoopMove: AngelMoveKey | null = null;

/**
 * 技を1つだけ再生する。solo=停止中でもこの技が終わるまで進めて、終わったらまた止まる。
 * ループ中の技をもう一度押した時は**ループだけを止める**(進行中の技は最後まで再生してから止まる)
 * ——賞金首と同じ扱い。停止中に絵が技の途中で凍りつくのを避けるため。
 */
export const requestAngelMovePlay = (move: AngelMoveKey, opts?: { solo?: boolean; loop?: boolean }): void => {
  if (angelLoopMove === move) { angelLoopMove = null; return; }
  pendingAngelPlay = { move, solo: opts?.solo ?? false, loop: opts?.loop ?? false };
};
/** 停止中でも tick を回す必要があるか(useGameLoop のポーズ判定が読む)。 */
export const angelPlaybackActive = (): boolean => angelSoloActive || pendingAngelPlay !== null;
/** 画面表示用(どの技をループ中か)。verbは天使には無いので常に null。 */
export const getAngelPlayback = (): { verb: string | null; loop: string | null } =>
  ({ verb: null, loop: angelLoopMove });
/**
 * 全部消す(ラン開始時のリセット経路)。★`createAngelBossState()` に副作用として入れてはいけない
 * ——`useRef(createAngelBossState())` の引数は毎レンダー評価されるので、パネルが再描画するたびに
 * 要求箱が空になり「▸を押しても技が1フレームで止まる」になる(idolTick.ts v0.25.2625の実バグ)。
 */
export const clearAngelPlayback = (): void => {
  pendingAngelPlay = null; angelSoloActive = false; angelLoopMove = null;
};

/**
 * 要求箱の引き取り。**始めたら true**(その1フレームは通常の分岐を飛ばす)。
 * 引数の `start` は各tickの begin* 束への入口(=実戦と同じ1本)。
 */
const takeAngelPlay = (
  boss: Enemy, type: string, start: (move: AngelMoveKey) => void,
): boolean => {
  if (pendingAngelPlay === null) return false;
  const req = pendingAngelPlay;
  pendingAngelPlay = null;
  if (!(ANGEL_MOVES_BY_TYPE[type] ?? []).includes(req.move)) {
    clearAngelPlayback(); // 別のボスの技キー(取り違え)。握り潰さず再生状態ごと消す。
    return false;
  }
  void boss;
  angelSoloActive = req.solo;
  angelLoopMove = req.loop ? req.move : null;
  start(req.move);
  return true;
};

/**
 * 単独再生の立ち下がり。**chaseへ戻ったら終わり**(ループONなら次フレームにもう一度)。
 * ディスパッチャが tick の**前後2回**呼ぶ=2重の保険:
 *  - 前(tick冒頭): 気絶/カウンター/割り込みで技が消された時の受け皿。これが無いと
 *    angelSoloActive が立ちっぱなしになり **⏸(停止)が二度と効かなくなる**。
 *  - 後(tick直後): 技がchaseへ戻ったそのフレームで終える=停止中に余分な1フレームだけ歩かない。
 */
const settleAngelPlayback = (bossState: string | undefined): void => {
  if (!angelSoloActive || pendingAngelPlay !== null) return;
  if ((bossState ?? 'chase') !== 'chase') return;
  if (angelLoopMove !== null) pendingAngelPlay = { move: angelLoopMove, solo: true, loop: true };
  else angelSoloActive = false;
};

const applyPatch = (id: string, patch: Partial<Enemy>): void => {
  if (Object.keys(patch).length === 0) return;
  // v0.25.2617と同じ理由: **プレイヤーが行けない場所へボスを出さない**(idolTick.tsのクランプと
  // 同じ純関数を同じように通す=「行ける帯」の定義が1本のまま)。6体分のtickが全てここを通るので、
  // 共通ヘルパー1箇所で足りる。
  if (patch.x !== undefined || patch.y !== undefined) {
    const st0 = useGameStore.getState();
    const boss = st0.enemies.find(e => e.id === id);
    if (boss) {
      const ctx: PlayableAreaCtx = {
        farBackdrop: st0.farBackdrop,
        labTheme: st0.stageTheme === 'lab' && !st0.indoorMode,
        corridorMode: st0.corridorMode,
        m0AdvanceLimitX: st0.m0AdvanceLimitX,
        corridorRunInActive: st0.corridorRunInActive,
        exStage: st0.corridorMode && isExStageRun(), // §10-20#6: EXだけ広間の横幅拡大を受ける
      };
      const c = clampRectToPlayableArea(patch.x ?? boss.x, patch.y ?? boss.y, boss.width, boss.height, ctx);
      patch.x = c.x; patch.y = c.y;
      // §10-20-FB1-1(実機FB「フィルの戦場が端っこ過ぎる...ボスも上端は越えない程度に」):
      // フィルだけ、スプライト上端が可視域上端を越えない北限(中心y)を追加で適用。
      // 判定はここ(world/store側の可動クランプ)で完結=pixiSceneには判定を置かない。
      if (boss.type === 'phillboss' && ctx.exStage) {
        const phFit = BOSS_SPRITE_FIT.phillboss;
        const limitCenterY = exPhillNorthCenterLimitY(
          st0.player.y + st0.player.height / 2, st0.viewZoom, boss.width, st0.gameBounds.height,
          phFit.w, phFit.aspect, phFit.cy,
        );
        const curCenterY = patch.y + boss.height / 2;
        if (curCenterY < limitCenterY) patch.y = limitCenterY - boss.height / 2;
      }
    }
  }
  useGameStore.setState(stt => ({ enemies: stt.enemies.map(e => e.id === id ? { ...e, ...patch } : e) }));
};

// ============================================================================================
// --- ミゲル(§6.28-4 バッチM53) --------------------------------------------------------------
// ============================================================================================
export const runMiguelTick = (
  miguel: Enemy, s: AngelBossState, newGameTime: number, deltaTime: number, moveSpeedMult: number,
  sfx: AngelSfx, onPlayerDeath: (x: number, y: number) => void,
): void => {
  const store = useGameStore.getState();
  const player = store.player;
  const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
  const mcx = miguel.x + miguel.width / 2, mcy = miguel.y + miguel.height / 2;
  const bossMoveDt = deltaTime * moveSpeedMult;
  const mHomeX = miguel.homeX ?? mcx, mHomeY = miguel.homeY ?? mcy;
  const st = miguel.bossState ?? 'chase';
  const patch: Partial<Enemy> = {};

  // 「移動中、たまにゆっくり歩く」(トールのSLOWWALKと同型)。
  if (s.miguelSlow.nextAt === 0) {
    s.miguelSlow.nextAt = newGameTime + MG_T.slowWalk.minGapMs + Math.random() * (MG_T.slowWalk.maxGapMs - MG_T.slowWalk.minGapMs);
  }
  if (st === 'chase' && newGameTime >= s.miguelSlow.nextAt) {
    s.miguelSlow.slowUntil = newGameTime + MG_T.slowWalk.ms;
    s.miguelSlow.nextAt = newGameTime + MG_T.slowWalk.minGapMs + Math.random() * (MG_T.slowWalk.maxGapMs - MG_T.slowWalk.minGapMs);
  }
  const slowWalkActive = newGameTime < s.miguelSlow.slowUntil;
  const meleeDashActive = newGameTime - (miguel.meleeHitAt ?? -Infinity) <= MG_T.meleeDash.ms;
  const orbitSpeedMult = (meleeDashActive ? MG_T.meleeDash.mult : 1) * (slowWalkActive ? MG_T.slowWalk.mult : 1);
  const halfSize = miguel.height / 2;
  const orbitRadius = GATE_ARENA_RADIUS - MIGUEL_ORBIT_MARGIN - halfSize;

  // 旋回運動(固定のhome中心をCCWで回る)。
  const miguelOrbitMove = (): void => {
    const relX = mcx - mHomeX, relY = mcy - mHomeY;
    const curDist = Math.hypot(relX, relY) || 1;
    const curAngle = Math.atan2(relY, relX);
    // ボスのクリ半減(社長指示v0.25.2422)。他の移動語彙は移動の入口で掛けているのに、
    // ミゲルの旋回だけ抜けていた(v0.25.2895)。
    const angularSpeed = (MG_T.orbit.speed * orbitSpeedMult * bossSlowMult(miguel, newGameTime)) / orbitRadius;
    const newAngle = curAngle - angularSpeed * bossMoveDt; // CCW=角度を減らす向き(Y-down)
    const correctedDist = curDist + (orbitRadius - curDist) * Math.min(1, ORBIT_RADIUS_CORRECT * bossMoveDt);
    patch.x = mHomeX + Math.cos(newAngle) * correctedDist - miguel.width / 2;
    patch.y = mHomeY + Math.sin(newAngle) * correctedDist - miguel.height / 2;
  };

  const miguelCounterHit = (hitX: number, hitY: number, ghost?: GhostCounterFire): void => {
    angelCounterHit(miguel, mcx, hitX, hitY, sfx, ghost);
    const lx = mcx - pcx, ly = mcy - pcy;
    const ll = Math.hypot(lx, ly) || 1;
    patch.bossState = 'counter-leap';
    patch.bossStateUntil = newGameTime + AN_C.counterLeapMs;
    patch.aiFromX = mcx; patch.aiFromY = mcy;
    patch.aiTargetX = pcx + (lx / ll) * orbitRadius;
    patch.aiTargetY = pcy + (ly / ll) * orbitRadius;
  };

  // BOT_AND_GHOST.md §2.8 G2.5: windup開始点でだけ呼ぶ(毎フレーム評価しない)。
  const miguelHateAim = (): ResolvedHateAim => resolveBossHateAim(miguel, { x: pcx, y: pcy }, store.summons, newGameTime);
  const miguelLockedAim = (): ResolvedHateAim => resolveBossLockedHateAim(miguel, { x: pcx, y: pcy }, store.summons);

  const lockHaraiLine = (): void => {
    const aim = miguelHateAim();
    patch.hateTarget = aim.side;
    const rx = mcx - aim.x, ry = mcy - aim.y;
    const rl = Math.hypot(rx, ry) || 1;
    const tx0 = -ry / rl, ty0 = rx / rl;
    patch.aiFromX = aim.x - tx0 * (MG_T.harai.range / 2);
    patch.aiFromY = aim.y - ty0 * (MG_T.harai.range / 2);
    patch.aiTargetX = aim.x + tx0 * (MG_T.harai.range / 2);
    patch.aiTargetY = aim.y + ty0 * (MG_T.harai.range / 2);
  };

  // --- 技の開始(begin*)。実戦の抽選(下のchase分岐)と ボスメーカーの▸個別再生が**同じ1本**を通る ---
  const beginMiguelDash = (): void => {
    patch.bossState = 'mdash-windup';
    patch.bossStateUntil = newGameTime + MG_T.dash.windup;
    patch.aiFromX = mcx; patch.aiFromY = mcy;
    // 終点=狙い対象の位置。溜め開始でロック(掟W4)。BOT_AND_GHOST.md §2.8 G2.5。
    const dashAim = miguelHateAim();
    patch.aiTargetX = dashAim.x; patch.aiTargetY = dashAim.y; patch.hateTarget = dashAim.side;
  };
  const beginMiguelHarai = (): void => {
    patch.bossState = 'harai-windup';
    patch.bossStateUntil = newGameTime + MG_T.harai.windup;
    lockHaraiLine();
  };
  const beginMiguelVolley = (): void => {
    const volleyAim = miguelHateAim();
    patch.bossState = 'volley-windup';
    patch.bossStateUntil = newGameTime + MG_T.volley.windup;
    patch.hateTarget = volleyAim.side;
  };
  /** 選ばれた技を始める(予告SEは全技共通=旧実装のとおり分岐の手前で1回)。 */
  const startMiguelMove = (k: AngelMoveKey): void => {
    sfx.alert();
    if (k === 'mg-dash') beginMiguelDash();
    else if (k === 'mg-harai') beginMiguelHarai();
    else beginMiguelVolley();
  };

  const miguelFullStun = miguel.bossFullStunUntil !== undefined && newGameTime < miguel.bossFullStunUntil;
  let mGhostFire: GhostCounterFire | null = null;
  if (miguelFullStun) {
    patch.bossState = 'chase';
    patch.bossNextActionAt = newGameTime + AN_C.stunNextActionMs;
  } else if ((mGhostFire = takeGhostAngelCounter(miguel)) !== null) {
    // v0.25.2480: 守護霊カウンター成立。効果はプレイヤー成立と同一(counter-leapまでmiguelCounterHitが設定)。
    miguelCounterHit(mcx, mcy, mGhostFire);
  } else if (takeAngelPlay(miguel, 'miguel', startMiguelMove)) {
    // ボスメーカー ▸: 条件(距離帯/CD/抽選)をバイパスして技を1つ始める(部屋は訓練場)。
    // 通常プレイでは要求箱が常に null なのでここへは来ない。
  } else if (st === 'chase') {
    miguelOrbitMove();
    if (newGameTime >= (miguel.bossNextActionAt ?? 0)) {
      const dist = Math.hypot(pcx - mcx, pcy - mcy);
      const dashReady = newGameTime >= (miguel.mDashReadyAt ?? 0);
      const scripted = chooseScriptMove(miguel, 'miguel', 2, () => pickMiguelMove(dist, dashReady));
      const move = scripted.move;
      patch.bossScriptQueue = scripted.remaining;
      if (!move) { applyPatch(miguel.id, patch); return; }
      startMiguelMove(move === 'dash' ? 'mg-dash' : move === 'harai' ? 'mg-harai' : 'mg-volley');
    }
  } else if (st === 'volley-windup') {
    const { overlap, counterActive } = bodyOverlapNow(miguel);
    if (overlap && counterActive) {
      miguelCounterHit(mcx, mcy);
    } else if (newGameTime >= (miguel.bossStateUntil ?? 0)) {
      patch.bossState = 'volley';
      patch.bossStateUntil = newGameTime + AN_C.burst.shots * AN_C.burst.gapMs;
      s.miguelVolley.nextShotAt = newGameTime; s.miguelVolley.shots = 0;
    }
  } else if (st === 'harai-windup' || st === 'tate-windup') {
    // 溜め: カウンター可能。溜め終了で実行へ。
    // ★踏み込み(社長指示v0.25.3524): 溜めの**最後の180ms**で1回だけ計画を立て、以後は時計から
    // 位置を引く。判定(aiFrom/aiTarget)はロック済みで**1ミリも動かさない**——動くのは本体だけ。
    const lungeMove = st === 'harai-windup' ? 'harai' : 'tate';
    if (!isSwordLungeLive(miguel.bossLunge, lungeMove, newGameTime)
      && (miguel.bossStateUntil ?? newGameTime) - newGameTime <= AN_C.lungeLeadMs) {
      const lfx = miguel.aiFromX ?? mcx, lfy = miguel.aiFromY ?? mcy;
      const ltx = miguel.aiTargetX ?? mcx, lty = miguel.aiTargetY ?? mcy;
      const planned = planSwordLunge(
        lungeMove, mcx, mcy, (lfx + ltx) / 2, (lfy + lty) / 2,
        MG_T.lunge.standoffPx, MG_T.lunge.maxPx,
        newGameTime, AN_C.lungeLeadMs + MG_T.harai.active,
      );
      if (planned !== null) patch.bossLunge = planned;
    }
    const liveLunge = patch.bossLunge ?? miguel.bossLunge;
    if (isSwordLungeLive(liveLunge, lungeMove, newGameTime)) {
      const lc = swordLungeCenterAt(liveLunge, newGameTime);
      patch.x = lc.x - miguel.width / 2; patch.y = lc.y - miguel.height / 2;
    }
    const { overlap, counterActive } = bodyOverlapNow(miguel);
    if (overlap && counterActive) {
      miguelCounterHit(mcx, mcy);
    } else if (newGameTime >= (miguel.bossStateUntil ?? 0)) {
      patch.bossState = st === 'harai-windup' ? 'harai' : 'tate';
      patch.bossStateUntil = newGameTime + MG_T.harai.active;
      sfx.sweep();
    }
  } else if (st === 'harai' || st === 'tate') {
    // ★踏み込みの続き(v0.25.3524): 溜めの終盤で始めた1本の動きを、振り切りまで同じ計画で出し切る
    // (状態が変わっても時計は繋がっているので、境目で速度が飛ばない=慣性が途切れない)。
    if (isSwordLungeLive(miguel.bossLunge, st, newGameTime)) {
      const lc = swordLungeCenterAt(miguel.bossLunge, newGameTime);
      patch.x = lc.x - miguel.width / 2; patch.y = lc.y - miguel.height / 2;
    }
    // 実行: ロック済みライン上のみ判定(点-線分距離のカプセル)。
    const fx0 = miguel.aiFromX ?? mcx, fy0 = miguel.aiFromY ?? mcy;
    const tx0 = miguel.aiTargetX ?? mcx, ty0 = miguel.aiTargetY ?? mcy;
    const pr = Math.max(player.width, player.height) / 2;
    let countered = false;
    if (distToBandRect({ x: pcx, y: pcy }, { x: fx0, y: fy0 }, { x: tx0, y: ty0 }, MG_T.harai.halfWidth) <= pr) {
      const cp = useGameStore.getState().player;
      if (isCounterActive(cp, Date.now())) {
        miguelCounterHit((fx0 + tx0) / 2, (fy0 + ty0) / 2);
        countered = true;
        // v0.25.3128(案A): 技を中断=カウンター1回につき1成立に揃える。
        patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, miguel);
      } else {
        const died = useGameStore.getState().damagePlayer(miguel.damage, `${enemyDeathLabel(miguel.type)}の${st === 'harai' ? '払い' : '縦払い'}`, pcx, pcy, undefined, undefined, st === 'harai' ? 'miguel-harai' : 'miguel-tate'); // G4a計測タグ(記録専用)
        sfx.slashHit(); // v0.25.3700: 技SE(社長指示・プレイヤー近似流用)
        if (died) onPlayerDeath(pcx, pcy);
      }
    }
    if (!countered && newGameTime >= (miguel.bossStateUntil ?? 0)) {
      if (st === 'harai') {
        sfx.alert();
        patch.bossState = 'tate-windup';
        patch.bossStateUntil = newGameTime + MG_T.harai.windup;
        // 縦払いも同じ狙いロック(掟W4)。BOT_AND_GHOST.md §2.8 G2.5。
        const tateAim = miguelHateAim();
        patch.aiFromX = tateAim.x;
        patch.aiFromY = tateAim.y - MG_T.harai.range / 2;
        patch.aiTargetX = tateAim.x;
        patch.aiTargetY = tateAim.y + MG_T.harai.range / 2;
        patch.hateTarget = tateAim.side;
      } else {
        patch.bossState = 'tate-recover';
        patch.bossStateUntil = newGameTime + choreographyRecoverMs(MG_T.harai.tateRecover, (miguel.bossScriptQueue?.length ?? 0) > 0);
      }
    }
  } else if (st === 'tate-recover') {
    const { overlap, counterActive } = bodyOverlapNow(miguel);
    if (overlap && counterActive) {
      miguelCounterHit(mcx, mcy);
    } else if (newGameTime >= (miguel.bossStateUntil ?? 0)) {
      patch.bossState = 'chase';
      patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, miguel);
    }
  } else if (st === 'volley') {
    miguelOrbitMove();
    if (s.miguelVolley.shots < AN_C.burst.shots && newGameTime >= s.miguelVolley.nextShotAt) {
      const aim = miguelLockedAim();
      useGameStore.getState().addProjectile(createEnemyProjectile(miguel, player, aim.x, aim.y));
      sfx.shot(); // v0.25.3700: 技SE(社長指示・プレイヤー近似流用)
      s.miguelVolley.shots += 1;
      s.miguelVolley.nextShotAt = newGameTime + AN_C.burst.gapMs;
    }
    if (newGameTime >= (miguel.bossStateUntil ?? 0)) {
      patch.bossState = 'volley-recover';
      patch.bossStateUntil = newGameTime + choreographyRecoverMs(MG_T.volley.recover, (miguel.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'volley-recover') {
    const { overlap, counterActive } = bodyOverlapNow(miguel);
    if (overlap && counterActive) {
      miguelCounterHit(mcx, mcy);
    } else if (newGameTime >= (miguel.bossStateUntil ?? 0)) {
      patch.bossState = 'chase';
      patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, miguel);
    }
  } else if (st === 'mdash-windup') {
    const { overlap, counterActive } = bodyOverlapNow(miguel);
    if (overlap && counterActive) {
      miguelCounterHit(mcx, mcy);
    } else if (newGameTime >= (miguel.bossStateUntil ?? 0)) {
      patch.bossState = 'mdash-move';
      patch.bossStateUntil = newGameTime + MG_T.dash.moveMs + MG_T.dash.strikeMs;
      patch.aiStartedAt = newGameTime;
      sfx.dashSlash(); // v0.25.3700: 技SE(社長指示・プレイヤー近似流用)
    }
  } else if (st === 'mdash-move') {
    const fx0 = miguel.aiFromX ?? mcx, fy0 = miguel.aiFromY ?? mcy;
    const tx0 = miguel.aiTargetX ?? mcx, ty0 = miguel.aiTargetY ?? mcy;
    // ★v0.25.3195(社長報告「突進、カウンターしても素通りなので攻撃くらっちゃう事故が多い」+
    // 指示「カウンターでノックバック+中断位置戻し」): カウンター成立時の共通処理。
    // ①技を中断 ②**来た方向へ弾き返す**(プレイヤー中心から突進方向の逆へ MIGUEL_DASH_COUNTER_PUSHBACK_PX)
    // =体を素通りして背後から斬る、を物理的に不可能にする。位置はアリーナ内へクランプ。
    const dashCountered = (hx: number, hy: number): void => {
      miguelCounterHit(hx, hy);
      let bdx = tx0 - fx0, bdy = ty0 - fy0;
      const bl = Math.hypot(bdx, bdy) || 1; bdx /= bl; bdy /= bl;
      let px2 = pcx - bdx * AN_C.dashCounterPushbackPx;
      let py2 = pcy - bdy * AN_C.dashCounterPushbackPx;
      const rel = Math.hypot(px2 - mHomeX, py2 - mHomeY);
      const maxRm = GATE_ARENA_RADIUS - MIGUEL_ORBIT_MARGIN - miguel.height / 2;
      if (rel > maxRm) { px2 = mHomeX + ((px2 - mHomeX) / rel) * maxRm; py2 = mHomeY + ((py2 - mHomeY) / rel) * maxRm; }
      patch.x = px2 - miguel.width / 2; patch.y = py2 - miguel.height / 2;
      patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, miguel);
      patch.mDashReadyAt = newGameTime + MG_T.dash.cdMs * freshCritCdMult(miguel.id, newGameTime);
    };
    // ★突進の通過中もカウンターを取れる(旧: 到達時の斬り抜けカプセルでしか判定せず、
    // 体が重なった瞬間に構えていても「素通り」していた)。
    {
      const { overlap, counterActive } = bodyOverlapNow(miguel);
      if (overlap && counterActive) {
        dashCountered(mcx, mcy);
        applyPatch(miguel.id, patch);
        return;
      }
    }
    const elapsed = newGameTime - (miguel.aiStartedAt ?? newGameTime);
    const moveT = Math.max(0, Math.min(1, elapsed / MG_T.dash.moveMs));
    const nx = fx0 + (tx0 - fx0) * moveT, ny = fy0 + (ty0 - fy0) * moveT;
    patch.x = nx - miguel.width / 2;
    patch.y = ny - miguel.height / 2;
    let countered = false;
    if (elapsed >= MG_T.dash.moveMs) {
      // 到達=斬り抜け1回(既存の払いカプセルを長さ190で流用・設計書指定どおり)。
      let dirx = tx0 - fx0, diry = ty0 - fy0;
      const dl = Math.hypot(dirx, diry) || 1; dirx /= dl; diry /= dl;
      const sx = nx, sy = ny, ex = nx + dirx * MG_T.harai.range, ey = ny + diry * MG_T.harai.range;
      const pr = Math.max(player.width, player.height) / 2;
      if (distToBandRect({ x: pcx, y: pcy }, { x: sx, y: sy }, { x: ex, y: ey }, MG_T.harai.halfWidth) <= pr) {
        const cp = useGameStore.getState().player;
        if (isCounterActive(cp, Date.now())) {
          dashCountered((sx + ex) / 2, (sy + ey) / 2);
          countered = true;
        } else {
          const died = useGameStore.getState().damagePlayer(miguel.damage, `${enemyDeathLabel(miguel.type)}の踏み込み`, pcx, pcy, undefined, undefined, 'miguel-mdash'); // G4a計測タグ(記録専用)
          if (died) onPlayerDeath(pcx, pcy);
        }
      }
    }
    if (!countered && newGameTime >= (miguel.bossStateUntil ?? 0)) {
      patch.bossState = 'mdash-recover';
      patch.bossStateUntil = newGameTime + choreographyRecoverMs(MG_T.dash.recover, (miguel.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'mdash-recover') {
    const { overlap, counterActive } = bodyOverlapNow(miguel);
    if (overlap && counterActive) {
      miguelCounterHit(mcx, mcy);
      patch.mDashReadyAt = newGameTime + MG_T.dash.cdMs * freshCritCdMult(miguel.id, newGameTime);
    } else if (newGameTime >= (miguel.bossStateUntil ?? 0)) {
      patch.mDashReadyAt = newGameTime + MG_T.dash.cdMs * freshCritCdMult(miguel.id, newGameTime);
      patch.bossState = 'chase';
      patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, miguel);
    }
  } else if (st === 'counter-leap') {
    const fx0 = miguel.aiFromX ?? mcx, fy0 = miguel.aiFromY ?? mcy;
    const tx0 = miguel.aiTargetX ?? mcx, ty0 = miguel.aiTargetY ?? mcy;
    const t = Math.max(0, Math.min(1, 1 - ((miguel.bossStateUntil ?? newGameTime) - newGameTime) / AN_C.counterLeapMs));
    patch.x = (fx0 + (tx0 - fx0) * t) - miguel.width / 2;
    patch.y = (fy0 + (ty0 - fy0) * t) - miguel.height / 2;
    if (newGameTime >= (miguel.bossStateUntil ?? 0)) {
      patch.bossState = 'chase';
      patch.bossNextActionAt = nextActionDelay(newGameTime, miguel);
    }
  } else {
    patch.bossState = 'chase';
    patch.bossNextActionAt = nextActionDelay(newGameTime, miguel);
  }

  applyPatch(miguel.id, patch);
};

// --- ミゲル(旧・?miguelscript=0 専用フォールバック=変更前の実装をそのまま保持) -----------------
export const runMiguelTickLegacy = (
  miguel: Enemy, s: AngelBossState, newGameTime: number, deltaTime: number, moveSpeedMult: number,
  sfx: AngelSfx, onPlayerDeath: (x: number, y: number) => void,
): void => {
  const store = useGameStore.getState();
  const player = store.player;
  const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
  const mcx = miguel.x + miguel.width / 2, mcy = miguel.y + miguel.height / 2;
  const bossMoveDt = deltaTime * moveSpeedMult;
  const mHomeX = miguel.homeX ?? mcx, mHomeY = miguel.homeY ?? mcy;
  const st = miguel.bossState ?? 'chase';
  const patch: Partial<Enemy> = {};

  if (s.miguelSlow.nextAt === 0) {
    s.miguelSlow.nextAt = newGameTime + MG_T.slowWalk.minGapMs + Math.random() * (MG_T.slowWalk.maxGapMs - MG_T.slowWalk.minGapMs);
  }
  if (st === 'chase' && newGameTime >= s.miguelSlow.nextAt) {
    s.miguelSlow.slowUntil = newGameTime + MG_T.slowWalk.ms;
    s.miguelSlow.nextAt = newGameTime + MG_T.slowWalk.minGapMs + Math.random() * (MG_T.slowWalk.maxGapMs - MG_T.slowWalk.minGapMs);
  }
  const slowWalkActive = newGameTime < s.miguelSlow.slowUntil;
  const meleeDashActive = newGameTime - (miguel.meleeHitAt ?? -Infinity) <= MG_T.meleeDash.ms;
  const orbitSpeedMult = (meleeDashActive ? MG_T.meleeDash.mult : 1) * (slowWalkActive ? MG_T.slowWalk.mult : 1);
  const halfSize = miguel.height / 2;
  const orbitRadius = GATE_ARENA_RADIUS - MIGUEL_ORBIT_MARGIN - halfSize;

  const miguelOrbitMove = (): void => {
    const relX = mcx - mHomeX, relY = mcy - mHomeY;
    const curDist = Math.hypot(relX, relY) || 1;
    const curAngle = Math.atan2(relY, relX);
    // ボスのクリ半減(社長指示v0.25.2422)。他の移動語彙は移動の入口で掛けているのに、
    // ミゲルの旋回だけ抜けていた(v0.25.2895)。
    const angularSpeed = (MG_T.orbit.speed * orbitSpeedMult * bossSlowMult(miguel, newGameTime)) / orbitRadius;
    const newAngle = curAngle - angularSpeed * bossMoveDt;
    const correctedDist = curDist + (orbitRadius - curDist) * Math.min(1, ORBIT_RADIUS_CORRECT * bossMoveDt);
    patch.x = mHomeX + Math.cos(newAngle) * correctedDist - miguel.width / 2;
    patch.y = mHomeY + Math.sin(newAngle) * correctedDist - miguel.height / 2;
  };

  const miguelCounterHit = (hitX: number, hitY: number, ghost?: GhostCounterFire): void => {
    angelCounterHit(miguel, mcx, hitX, hitY, sfx, ghost);
    const lx = mcx - pcx, ly = mcy - pcy;
    const ll = Math.hypot(lx, ly) || 1;
    patch.bossState = 'counter-leap';
    patch.bossStateUntil = newGameTime + AN_C.counterLeapMs;
    patch.aiFromX = mcx; patch.aiFromY = mcy;
    patch.aiTargetX = pcx + (lx / ll) * orbitRadius;
    patch.aiTargetY = pcy + (ly / ll) * orbitRadius;
  };

  const miguelFullStun = miguel.bossFullStunUntil !== undefined && newGameTime < miguel.bossFullStunUntil;
  let mGhostFire: GhostCounterFire | null = null;
  if (miguelFullStun) {
    patch.bossState = 'chase';
    patch.bossNextActionAt = newGameTime + AN_C.stunNextActionMs;
  } else if ((mGhostFire = takeGhostAngelCounter(miguel)) !== null) {
    // v0.25.2480: 守護霊カウンター成立(旧実装フォールバックでも同作法)。
    miguelCounterHit(mcx, mcy, mGhostFire);
  } else if (st === 'chase') {
    miguelOrbitMove();
    if (newGameTime >= (miguel.bossNextActionAt ?? 0)) {
      const canHarai = Math.hypot(pcx - mcx, pcy - mcy) <= HARAI_TRIGGER_DIST;
      if (!canHarai || Math.random() < MIGUEL_VOLLEY_CHANCE_LEGACY) {
        patch.bossState = 'volley';
        patch.bossStateUntil = newGameTime + AN_C.burst.shots * AN_C.burst.gapMs;
        s.miguelVolley.nextShotAt = newGameTime; s.miguelVolley.shots = 0;
      } else {
        patch.bossState = 'harai-windup';
        patch.bossStateUntil = newGameTime + MG_T.harai.windup;
        const rx = mcx - pcx, ry = mcy - pcy;
        const rl = Math.hypot(rx, ry) || 1;
        const tx0 = -ry / rl, ty0 = rx / rl;
        patch.aiFromX = pcx - tx0 * (MG_T.harai.range / 2);
        patch.aiFromY = pcy - ty0 * (MG_T.harai.range / 2);
        patch.aiTargetX = pcx + tx0 * (MG_T.harai.range / 2);
        patch.aiTargetY = pcy + ty0 * (MG_T.harai.range / 2);
      }
    }
  } else if (st === 'harai-windup' || st === 'tate-windup') {
    const { overlap, counterActive } = bodyOverlapNow(miguel);
    if (overlap && counterActive) {
      miguelCounterHit(mcx, mcy);
    } else if (newGameTime >= (miguel.bossStateUntil ?? 0)) {
      patch.bossState = st === 'harai-windup' ? 'harai' : 'tate';
      patch.bossStateUntil = newGameTime + MG_T.harai.active;
      sfx.sweep();
    }
  } else if (st === 'harai' || st === 'tate') {
    const fx0 = miguel.aiFromX ?? mcx, fy0 = miguel.aiFromY ?? mcy;
    const tx0 = miguel.aiTargetX ?? mcx, ty0 = miguel.aiTargetY ?? mcy;
    let lux = tx0 - fx0, luy = ty0 - fy0;
    const lul = Math.hypot(lux, luy) || 1; lux /= lul; luy /= lul;
    const lineLen = Math.hypot(tx0 - fx0, ty0 - fy0);
    const tproj = Math.max(0, Math.min(lineLen, (pcx - fx0) * lux + (pcy - fy0) * luy));
    const cxp = fx0 + lux * tproj, cyp = fy0 + luy * tproj;
    const pr = Math.max(player.width, player.height) / 2;
    let countered = false;
    if (Math.hypot(pcx - cxp, pcy - cyp) <= MG_T.harai.halfWidth + pr) {
      const cp = useGameStore.getState().player;
      if (isCounterActive(cp, Date.now())) {
        miguelCounterHit(cxp, cyp);
        countered = true;
        // v0.25.3128(案A): 技を中断=カウンター1回につき1成立に揃える。
        patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, miguel);
      } else {
        const died = useGameStore.getState().damagePlayer(miguel.damage, `${enemyDeathLabel(miguel.type)}の${st === 'harai' ? '払い' : '縦払い'}`, cxp, cyp, undefined, undefined, st === 'harai' ? 'miguel-harai' : 'miguel-tate'); // G4a計測タグ(記録専用)
        if (died) onPlayerDeath(pcx, pcy);
      }
    }
    if (!countered && newGameTime >= (miguel.bossStateUntil ?? 0)) {
      if (st === 'harai') {
        patch.bossState = 'tate-windup';
        patch.bossStateUntil = newGameTime + MG_T.harai.windup;
        patch.aiFromX = pcx;
        patch.aiFromY = pcy - MG_T.harai.range / 2;
        patch.aiTargetX = pcx;
        patch.aiTargetY = pcy + MG_T.harai.range / 2;
      } else {
        patch.bossState = 'chase';
        patch.bossNextActionAt = nextActionDelay(newGameTime, miguel);
      }
    }
  } else if (st === 'volley') {
    miguelOrbitMove();
    if (s.miguelVolley.shots < AN_C.burst.shots && newGameTime >= s.miguelVolley.nextShotAt) {
      useGameStore.getState().addProjectile(createEnemyProjectile(miguel, player));
      sfx.shot(); // v0.25.3700: 技SE(社長指示・プレイヤー近似流用)
      s.miguelVolley.shots += 1;
      s.miguelVolley.nextShotAt = newGameTime + AN_C.burst.gapMs;
    }
    if (newGameTime >= (miguel.bossStateUntil ?? 0)) {
      patch.bossState = 'chase';
      patch.bossNextActionAt = nextActionDelay(newGameTime, miguel);
    }
  } else if (st === 'counter-leap') {
    const fx0 = miguel.aiFromX ?? mcx, fy0 = miguel.aiFromY ?? mcy;
    const tx0 = miguel.aiTargetX ?? mcx, ty0 = miguel.aiTargetY ?? mcy;
    const t = Math.max(0, Math.min(1, 1 - ((miguel.bossStateUntil ?? newGameTime) - newGameTime) / AN_C.counterLeapMs));
    patch.x = (fx0 + (tx0 - fx0) * t) - miguel.width / 2;
    patch.y = (fy0 + (ty0 - fy0) * t) - miguel.height / 2;
    if (newGameTime >= (miguel.bossStateUntil ?? 0)) {
      patch.bossState = 'chase';
      patch.bossNextActionAt = nextActionDelay(newGameTime, miguel);
    }
  } else {
    patch.bossState = 'chase';
    patch.bossNextActionAt = nextActionDelay(newGameTime, miguel);
  }

  applyPatch(miguel.id, patch);
};

// ============================================================================================
// --- ジブリル(§6.28-6 バッチM55) ------------------------------------------------------------
// ============================================================================================
export const runJibrilTick = (
  jibril: Enemy, s: AngelBossState, newGameTime: number, deltaTime: number, moveSpeedMult: number,
  sfx: AngelSfx,
): void => {
  const store = useGameStore.getState();
  const player = store.player;
  const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
  const jcx = jibril.x + jibril.width / 2, jcy = jibril.y + jibril.height / 2;
  const bossMoveDt = deltaTime * moveSpeedMult;
  const jHomeX = jibril.homeX ?? jcx, jHomeY = jibril.homeY ?? jcy;
  const maxR = GATE_ARENA_RADIUS - MIGUEL_ORBIT_MARGIN - jibril.height / 2;
  const st = jibril.bossState ?? 'chase';
  const patch: Partial<Enemy> = {};
  const jr = s.jibril;
  const jibrilHateAim = (): ResolvedHateAim => resolveBossHateAim(jibril, { x: pcx, y: pcy }, store.summons, newGameTime);
  const jibrilLockedAim = (): ResolvedHateAim => resolveBossLockedHateAim(jibril, { x: pcx, y: pcy }, store.summons);

  if (jibril.lastHit && jibril.lastHit !== jr.lastHitSeen) {
    jr.hits += 1;
    jr.lastHitSeen = jibril.lastHit;
  }
  const retreatMove = (): void => {
    const ax = jcx - pcx, ay = jcy - pcy;
    const al = Math.hypot(ax, ay) || 1;
    // ボスのクリ半減(社長指示v0.25.2422)。他の移動語彙は移動の入口で掛けているのに、
    // ジブリルの後退だけ抜けていた(v0.25.2895)。
    const spd = JB_T.retreat.speed * (jr.hits >= JB_T.retreat.hitsFaster ? JB_T.retreat.fastMult : 1) * bossSlowMult(jibril, newGameTime);
    let nx = jcx + (ax / al) * spd * bossMoveDt;
    let ny = jcy + (ay / al) * spd * bossMoveDt;
    const rx = nx - jHomeX, ry = ny - jHomeY;
    const rl = Math.hypot(rx, ry);
    if (rl > maxR) { nx = jHomeX + (rx / rl) * maxR; ny = jHomeY + (ry / rl) * maxR; }
    patch.x = nx - jibril.width / 2;
    patch.y = ny - jibril.height / 2;
  };
  const jibrilCounterHit = (hx: number, hy: number, ghost?: GhostCounterFire): void => angelCounterHit(jibril, jcx, hx, hy, sfx, ghost);

  // --- 技の開始(begin*)。実戦の抽選(下のchase分岐/縁ハメ潰しの転移)と ボスメーカーの▸個別再生が
  //     **同じ1本**を通る(遷移を複製しない・BOSS_MAKER.md §6-1)。 -----------------------------
  // 連射の型(狙撃/近距離)は「直前の技」で決まるので、chase側が決めた値をここへ渡す
  // (▸から直接始めた時は距離だけで決める=実戦の既定と同じ関数を通る)。
  let volleyModeNext: 'snipe' | 'close' | null = null;
  const beginJibrilConsecrate = (): void => {
    patch.bossState = 'consecrate-windup';
    patch.bossStateUntil = newGameTime + JB_T.consecrate.windup;
  };
  const beginJibrilLantern = (): void => {
    const aim = jibrilHateAim();
    patch.bossState = 'lantern-windup';
    patch.bossStateUntil = newGameTime + JB_T.lantern.windup;
    patch.hateTarget = aim.side;
  };
  const beginJibrilLance = (): void => {
    // v0.25.3199(社長指示・仕様変更): ランタンが本体からサークルの端へ飛び、その間に赤ラインを
    // 引いていく(旋回制限つき追従=ミーミル追尾レーザーと同じ「追尾型テレグラフ」)。
    // v0.25.3204(社長指示): 1秒置きに3本。1本目はここで即射出、以降はlance-windup内で追加射出。
    const aim = jibrilHateAim();
    jr.lanceStartAt = newGameTime;
    jr.lanceLaunched = 1;
    const dir0 = Math.atan2(aim.y - jcy, aim.x - jcx);
    patch.lanceLanterns = [{
      x: jcx, y: jcy,
      dir: dir0,
      bornAt: newGameTime,
      estFireAt: estimateLanceFireAt(jcx, jcy, dir0, jHomeX, jHomeY, newGameTime), // ★v0.25.3588
    }];
    patch.hateTarget = aim.side;
    patch.bossState = 'lance-windup';
    patch.bossStateUntil = newGameTime + JB_T.lance.windupCapMs; // 安全上限(通常は各自縁到着で発射)
  };
  const beginJibrilVolley = (): void => {
    const aim = jibrilHateAim();
    jr.volleyMode = volleyModeNext ?? jibrilVolleyMode(Math.hypot(pcx - jcx, pcy - jcy));
    patch.bossState = 'volley-windup';
    patch.bossStateUntil = newGameTime + JB_T.volley.windup;
    patch.hateTarget = aim.side;
  };
  const beginJibrilWarp = (): void => {
    patch.bossState = 'warp-windup';
    patch.bossStateUntil = newGameTime + JB_T.warp.windup;
    jr.lastWarpHits = jr.hits;
    jr.edgeSince = undefined;
  };
  /** 選ばれた技を始める(予告SEは全技共通=旧実装のとおり分岐の手前で1回)。 */
  const startJibrilMove = (k: AngelMoveKey): void => {
    sfx.alert();
    if (k === 'jb-consecrate') beginJibrilConsecrate();
    else if (k === 'jb-lantern') beginJibrilLantern();
    else if (k === 'jb-lance') beginJibrilLance();
    else if (k === 'jb-warp') beginJibrilWarp();
    else beginJibrilVolley();
  };

  const healthFrac = jibril.maxHealth > 0 ? jibril.health / jibril.maxHealth : 1;
  const phase = phaseForHealth(healthFrac, [JIBRIL_PHASE_HP_THRESHOLD]) as 1 | 2;
  patch.bossPhase = phase;
  patch.bossPhaseFlashUntil = phaseJustChanged(jibril.bossPhase, phase) ? newGameTime + ANGEL_PHASE_FLASH_MS : jibril.bossPhaseFlashUntil;

  // §6.28-6 #5追補: アリーナ縁に3秒張り付いたら強制転移(縁ハメ潰し)。
  //
  // ==== v0.25.2609(ボス動き横断監査・バッチ0) 永久ワープの是正 ================================
  // 実測(ヘッドレス180秒×3ペルソナ): **ワープ58回に対し攻撃はわずか1回**。ワープ状態の滞在28.0%。
  // 原因は「縁ハメ潰しの安全弁を、ジブリル自身の中立移動が踏み続けていた」こと:
  //   ① 中立(chase)の retreatMove() は**常にプレイヤーから離れる**うえ、位置は maxR へ厳密に
  //      クランプされる ⇒ 開幕数秒で縁へ到達したあと**構造的に二度と縁から離れられない**。
  //   ② よって edgeStuckMs は延々と積み上がり、3秒ごとに強制転移が発火。
  //   ③ しかも強制転移は「今何をしていても」割り込むため、**溜め中/連射中の技が毎回キャンセル**され、
  //      次の行動ゲート(2200〜4200ms=平均3200ms)は転移周期(3100ms)より長いので、
  //      技を選ぶ前に次の転移が来る。=「ほぼワープしかしない・追いかけ回すだけ」の正体。
  // 修理(社長承認の (a)+(b)。(c)=中立移動そのものの作り直しは横展開バッチへ):
  //   (a) 縁の滞在は**中立(chase)に居る間だけ**数える。技の実行中は数えない
  //       (=技を出している間は「ハメられている」状態ではない)。
  //   (b) 強制転移は**中立(chase)からのみ**発火する。進行中の技は必ず完走させる。
  // これで安全弁は本来の役目(プレイヤーが縁へ押し込んで殴り続ける状況の打破)だけに戻る。
  const distFromHome = Math.hypot(jcx - jHomeX, jcy - jHomeY);
  const atEdge = st === 'chase' && distFromHome >= maxR - 2; // (a)
  if (atEdge) { if (jr.edgeSince === undefined) jr.edgeSince = newGameTime; } else { jr.edgeSince = undefined; }
  const edgeStuckMs = atEdge && jr.edgeSince !== undefined ? newGameTime - jr.edgeSince : 0;
  const warpTriggered = (jr.hits - jr.lastWarpHits >= JB_T.warp.hits) || edgeStuckMs >= JIBRIL_EDGE_STICK_MS;

  const jibrilFull = jibril.bossFullStunUntil !== undefined && newGameTime < jibril.bossFullStunUntil;
  let jGhostFire: GhostCounterFire | null = null;
  if (jibrilFull) {
    patch.bossState = 'chase';
    patch.bossNextActionAt = newGameTime + AN_C.stunNextActionMs;
  } else if (warpTriggered && st === 'chase') {
    // (b) 中立からのみ発火(旧: st !== 'warp-*' =実質どの状態からでも割り込んでいた)。
    // 被弾10回による転移(JIBRIL_HITS_WARP)も同じ扱い=技を完走してから転移する。
    startJibrilMove('jb-warp');
  } else if ((jGhostFire = takeGhostAngelCounter(jibril)) !== null) {
    // v0.25.2480: 守護霊カウンター成立(転移割り込みより後=プレイヤー時と同じ優先順)。
    // 'warp-recover'はプレイヤー不可の州のためtakeGhostAngelCounterが除外済み。
    jibrilCounterHit(jcx, jcy, jGhostFire);
    patch.bossState = 'chase';
    patch.bossNextActionAt = nextActionDelay(newGameTime, jibril);
  } else if (takeAngelPlay(jibril, 'jibril', startJibrilMove)) {
    // ボスメーカー ▸(通常プレイでは要求箱が常に null なのでここへは来ない)。
  } else if (st === 'warp-windup') {
    const { overlap, counterActive } = bodyOverlapNow(jibril);
    if (overlap && counterActive) {
      jibrilCounterHit(jcx, jcy);
      patch.bossState = 'chase';
      patch.bossNextActionAt = nextActionDelay(newGameTime, jibril);
    } else if (newGameTime >= (jibril.bossStateUntil ?? 0)) {
      const dx = jHomeX - pcx, dy = jHomeY - pcy;
      const dl = Math.hypot(dx, dy) || 1;
      const wx = jHomeX + (dx / dl) * maxR, wy = jHomeY + (dy / dl) * maxR;
      useGameStore.getState().spawnRing(jcx, jcy, 8, 60, 'rgba(168,85,247,0.8)', 3, 300);
      patch.x = wx - jibril.width / 2; patch.y = wy - jibril.height / 2;
      useGameStore.getState().spawnRing(wx, wy, 8, 70, 'rgba(168,85,247,0.9)', 3, 340);
      useGameStore.getState().spawnFlash('rgba(88,28,135,0.20)', 240);
      patch.bossState = 'warp-recover';
      patch.bossStateUntil = newGameTime + JB_T.warp.recover;
    }
  } else if (st === 'warp-recover') {
    if (newGameTime >= (jibril.bossStateUntil ?? 0)) {
      patch.bossState = 'chase';
      patch.bossNextActionAt = nextActionDelay(newGameTime, jibril);
    }
  } else if (st === 'chase') {
    retreatMove();
    if (newGameTime >= (jibril.bossNextActionAt ?? 0)) {
      const dist = Math.hypot(pcx - jcx, pcy - jcy);
      const consecrateReady = phase === 2 && newGameTime >= (jibril.jConsecrateReadyAt ?? 0);
      const previousMove = (jibril.bossScriptQueue?.length ?? 0) > 0 ? jr.lastScriptMove : undefined;
      const scripted = chooseScriptMove(jibril, 'jibril', phase, () => pickJibrilMove(phase, dist, consecrateReady));
      const move = scripted.move;
      patch.bossScriptQueue = scripted.remaining;
      if (!move) { applyPatch(jibril.id, patch); return; }
      jr.lastScriptMove = move;
      // 灯籠で足場を縛った後は遠距離狙撃、聖別で接近を強いた後は近距離連射へつなぐ。
      volleyModeNext = previousMove === 'lantern' ? 'snipe' : previousMove === 'consecrate' ? 'close' : jibrilVolleyMode(dist);
      startJibrilMove(
        move === 'consecrate' ? 'jb-consecrate'
          : move === 'lantern' ? 'jb-lantern'
            : move === 'lance' ? 'jb-lance' : 'jb-volley',
      );
    }
  } else if (st === 'volley-windup') {
    // 予備動作は静止(掟W2)。実行(volley)自体は現行どおり後退しながら撃つ(6.28-6「現行不変」)。
    const { overlap, counterActive } = bodyOverlapNow(jibril);
    if (overlap && counterActive) {
      jibrilCounterHit(jcx, jcy);
      patch.bossState = 'chase';
      patch.bossNextActionAt = nextActionDelay(newGameTime, jibril);
    } else if (newGameTime >= (jibril.bossStateUntil ?? 0)) {
      // v0.25.3218で一本化→v0.25.3220(社長訂正「逆だった。弾足が遅い方」): 残すのは旧・近接射側=
      // **0.5秒間隔・通常弾速**。距離・連携によるclose/snipeの分岐は廃止のまま(台本は1本)。
      jr.shots = 0; jr.nextShotAt = newGameTime;
      patch.bossState = 'volley';
      patch.bossStateUntil = newGameTime + JB_T.volley.shots * AN_C.burst.gapMs + 200;
    }
  } else if (st === 'volley') {
    // v0.25.3131(案A・ランタンと同じ穴): 連射中も体当たりカウンターで**撃つのを止められる**。
    // ランタンだけ直すと「同じ形の技なのに片方だけ止まる」になるので、ジブリルの2技を同時に直す
    // (CLAUDE.md「同じ動作を持つ全員に付ける」)。**既に飛んだ弾は残る**(打ち返しは弾側の役目)。
    const { overlap, counterActive } = bodyOverlapNow(jibril);
    if (overlap && counterActive) {
      jibrilCounterHit(jcx, jcy);
      patch.bossState = 'chase';
      patch.bossNextActionAt = nextActionDelay(newGameTime, jibril);
    } else {
      retreatMove();
      // v0.25.3220(社長訂正): 一本化の残す側は「弾足が遅い方」=0.5秒間隔・通常弾速(×2速は廃止)。
      const gap = AN_C.burst.gapMs;
      if (jr.shots < JB_T.volley.shots && newGameTime >= jr.nextShotAt) {
        // v0.25.3197(社長指示): 奇数発目(1/3/5)=狙い弾、偶数発目(2/4)=全方位リング8発。
        if (jr.shots % 2 === 0) {
          const aim = jibrilLockedAim();
          useGameStore.getState().addProjectile(createEnemyProjectile(jibril, player, aim.x, aim.y));
          sfx.shot(); // v0.25.3700: 技SE(社長指示・プレイヤー近似流用)
        } else {
          for (let k = 0; k < JB_T.volley.omniBullets; k++) {
            const ang = (Math.PI * 2 * k) / JB_T.volley.omniBullets;
            useGameStore.getState().addProjectile(
              createEnemyProjectile(jibril, player, jcx + Math.cos(ang) * 100, jcy + Math.sin(ang) * 100));
          }
          sfx.shot(); // v0.25.3700: 技SE(社長指示・プレイヤー近似流用・1斉射につき1回)
        }
        jr.shots += 1;
        jr.nextShotAt = newGameTime + gap;
      }
      if (jr.shots >= JB_T.volley.shots && newGameTime >= (jibril.bossStateUntil ?? 0)) {
        patch.bossState = 'volley-recover';
        patch.bossStateUntil = newGameTime + choreographyRecoverMs(JB_T.volley.recover, (jibril.bossScriptQueue?.length ?? 0) > 0);
      }
    }
  } else if (st === 'volley-recover') {
    const { overlap, counterActive } = bodyOverlapNow(jibril);
    if (overlap && counterActive) {
      jibrilCounterHit(jcx, jcy);
      patch.bossState = 'chase';
      patch.bossNextActionAt = nextActionDelay(newGameTime, jibril);
    } else if (newGameTime >= (jibril.bossStateUntil ?? 0)) {
      patch.bossState = 'chase';
      patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, jibril);
    }
  } else if (st === 'lance-windup') {
    // v0.25.3199: ランタン飛行。溜め中は体当たりカウンターでも中断できる(他の州と同じ作法)。
    const { overlap, counterActive } = bodyOverlapNow(jibril);
    if (overlap && counterActive) {
      jibrilCounterHit(jcx, jcy);
      patch.lanceLanterns = []; // 中断=未発射のランタンごと消す(予告だけ残さない)
      patch.bossState = 'chase';
      patch.bossNextActionAt = nextActionDelay(newGameTime, jibril);
    } else {
      // v0.25.3204: 3本を1秒間隔で射出し、各ランタンが独立に追従・独立に発射する。
      // 各機: 旋回制限つきでプレイヤーへ追従しながら直進→アリーナ円の縁で頭打ち(縁上を滑って
      // 追従継続)→縁に居て射出からJIBRIL_LANCE_MIN_WINDUP_MSを過ぎたら発射(安全上限で全弾発射)。
      const elapsed = newGameTime - jr.lanceStartAt;
      const capHit = newGameTime >= (jibril.bossStateUntil ?? 0);
      let lanterns = (jibril.lanceLanterns ?? []).map(L => ({ ...L }));
      // 追加射出(1秒置き・計3本)。1本目はbegin側で射出済み(jr.lanceLaunched=1)。
      const shouldHave = Math.min(JB_T.lance.count, 1 + Math.floor(elapsed / JB_T.lance.intervalMs));
      while (jr.lanceLaunched < shouldHave) {
        const aim = jibrilLockedAim(); // 狙いは射出時点のヘイト対象の現在地
        const dirN = Math.atan2(aim.y - jcy, aim.x - jcx);
        lanterns.push({
          x: jcx, y: jcy, dir: dirN, bornAt: newGameTime,
          estFireAt: estimateLanceFireAt(jcx, jcy, dirN, jHomeX, jHomeY, newGameTime), // ★v0.25.3588
        });
        jr.lanceLaunched += 1;
        sfx.alert();
      }
      const next: typeof lanterns = [];
      for (const L of lanterns) {
        if (L.firedUntil !== undefined) {
          // 発射済み: ビーム表示が終わったら回収。
          if (newGameTime < L.firedUntil) next.push(L);
          continue;
        }
        const desired = Math.atan2(pcy - L.y, pcx - L.x);
        let dAng = desired - L.dir;
        while (dAng > Math.PI) dAng -= Math.PI * 2;
        while (dAng < -Math.PI) dAng += Math.PI * 2;
        const maxTurn = JB_T.lance.turnRate * deltaTime;
        L.dir += Math.max(-maxTurn, Math.min(maxTurn, dAng));
        let nx = L.x + Math.cos(L.dir) * JB_T.lance.lanternSpeed * deltaTime;
        let ny = L.y + Math.sin(L.dir) * JB_T.lance.lanternSpeed * deltaTime;
        const rdx = nx - jHomeX, rdy = ny - jHomeY;
        const rd = Math.hypot(rdx, rdy);
        const atRim = rd >= GATE_ARENA_RADIUS;
        if (atRim) { nx = jHomeX + (rdx / rd) * GATE_ARENA_RADIUS; ny = jHomeY + (rdy / rd) * GATE_ARENA_RADIUS; }
        L.x = nx; L.y = ny;
        if ((atRim && newGameTime - L.bornAt >= JB_T.lance.minWindup) || capHit) {
          // 発射: 実体=起爆カプセル(本体↔ランタンの間を挟むレーザー)。**ブラストパリィがそのままカウンター**。
          useGameStore.setState(state => ({
            pumpkinBlasts: [...state.pumpkinBlasts, {
              x: (jcx + nx) / 2, y: (jcy + ny) / 2, radius: JB_T.lance.halfWidth,
              damage: jibril.damage, enemyId: jibril.id,
              capsule: { fx: jcx, fy: jcy, tx: nx, ty: ny, halfWidth: JB_T.lance.halfWidth },
            }],
          }));
          L.firedUntil = newGameTime + JB_T.lance.beamMs;
        }
        next.push(L);
      }
      lanterns = next;
      patch.lanceLanterns = lanterns;
      // 全弾(3本)射出済みで場に残りが無くなったら硬直へ。
      if (jr.lanceLaunched >= JB_T.lance.count && lanterns.length === 0) {
        patch.bossState = 'lance-recover';
        patch.bossStateUntil = newGameTime + choreographyRecoverMs(JB_T.lance.recover, (jibril.bossScriptQueue?.length ?? 0) > 0);
      }
    }
  } else if (st === 'lance-recover') {
    const { overlap, counterActive } = bodyOverlapNow(jibril);
    if (overlap && counterActive) {
      jibrilCounterHit(jcx, jcy);
      patch.bossState = 'chase';
      patch.bossNextActionAt = nextActionDelay(newGameTime, jibril);
    } else if (newGameTime >= (jibril.bossStateUntil ?? 0)) {
      patch.bossState = 'chase';
      patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, jibril);
    }
  } else if (st === 'lantern-windup') {
    const { overlap, counterActive } = bodyOverlapNow(jibril);
    if (overlap && counterActive) {
      jibrilCounterHit(jcx, jcy);
      patch.bossState = 'chase';
      patch.bossNextActionAt = nextActionDelay(newGameTime, jibril);
    } else if (newGameTime >= (jibril.bossStateUntil ?? 0)) {
      patch.bossState = 'lantern';
      patch.bossStateUntil = newGameTime + JB_T.lantern.ms;
      jr.nextFireAt = newGameTime;
    }
  } else if (st === 'lantern') {
    // ★v0.25.3131(社長報告「ジブリルのランタン攻撃、カウンターできない気がするけど?」→ 案A採択):
    // **設置中(5秒)も体当たりカウンターを効かせ、成立したら設置を中断する**。
    // 旧: 溜め(700ms)と硬直(750ms)にしかカウンター判定が無く、しかもどちらも体当たり=
    // 後退しながら戦う遠距離ボスに密着している必要があった=**実質カウンター不能**だった。
    // ジブリルの技は危険が**別エンティティ**(火/弾)なので、本体に殴りに行く以外の掛かりどころが無い。
    // ⇒「リスクを負って接近すれば止められる」を成立させる。**既に置かれた火は残る**
    //   (別エンティティ=各自の寿命で消える)。止まるのは**これ以降の設置**。
    const { overlap, counterActive } = bodyOverlapNow(jibril);
    if (overlap && counterActive) {
      jibrilCounterHit(jcx, jcy);
      patch.bossState = 'chase';
      patch.bossNextActionAt = nextActionDelay(newGameTime, jibril);
    } else {
      // §6.28-6「その後5000msの設置中も静止【変更: 現状は後退しながら】」= retreatMoveを呼ばない。
      if (newGameTime >= jr.nextFireAt) {
        const aim = jibrilLockedAim();
        const ghost = aim.side === 'ghost'
          ? store.summons.find(su => su.kind === 'ghost-ally' && su.ghostBossId === jibril.id)
          : undefined;
        const fpx = aim.x, fpy = ghost ? ghost.y + ghost.height : player.y + player.height;
        useGameStore.getState().spawnBossFire(fpx, fpy, newGameTime, newGameTime + JB_T.fire.telegraphMs, newGameTime + JB_T.fire.telegraphMs + JB_T.fire.lifeMs);
        jr.nextFireAt = newGameTime + JB_T.lantern.fireGapMs;
      }
      if (newGameTime >= (jibril.bossStateUntil ?? 0)) {
        patch.bossState = 'lantern-recover';
        patch.bossStateUntil = newGameTime + choreographyRecoverMs(JB_T.lantern.recover, (jibril.bossScriptQueue?.length ?? 0) > 0);
      }
    }
  } else if (st === 'lantern-recover') {
    const { overlap, counterActive } = bodyOverlapNow(jibril);
    if (overlap && counterActive) {
      jibrilCounterHit(jcx, jcy);
      patch.bossState = 'chase';
      patch.bossNextActionAt = nextActionDelay(newGameTime, jibril);
    } else if (newGameTime >= (jibril.bossStateUntil ?? 0)) {
      patch.bossState = 'chase';
      patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, jibril);
    }
  } else if (st === 'consecrate-windup') {
    const { overlap, counterActive } = bodyOverlapNow(jibril);
    if (overlap && counterActive) {
      jibrilCounterHit(jcx, jcy);
      patch.bossState = 'chase';
      patch.bossNextActionAt = nextActionDelay(newGameTime, jibril);
    } else if (newGameTime >= (jibril.bossStateUntil ?? 0)) {
      // 自分を中心とした半径160pxのリング上に火6個。隙間1箇所(=7分割の1つを空ける・設置の瞬間に確定=掟W4)。
      const gapAngle = Math.random() * Math.PI * 2;
      for (let i = 1; i <= JB_T.consecrate.fireCount; i++) {
        const ang = gapAngle + (Math.PI * 2 / (JB_T.consecrate.fireCount + 1)) * i;
        const fx = jcx + Math.cos(ang) * JB_T.consecrate.ringRadius, fy = jcy + Math.sin(ang) * JB_T.consecrate.ringRadius;
        useGameStore.getState().spawnBossFire(fx, fy, newGameTime, newGameTime + JB_T.fire.telegraphMs, newGameTime + JB_T.fire.telegraphMs + JB_T.fire.lifeMs);
      }
      patch.jConsecrateReadyAt = newGameTime + JB_T.consecrate.cdMs * freshCritCdMult(jibril.id, newGameTime);
      patch.bossState = 'consecrate-recover';
      patch.bossStateUntil = newGameTime + choreographyRecoverMs(JB_T.consecrate.recover, (jibril.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'consecrate-recover') {
    const { overlap, counterActive } = bodyOverlapNow(jibril);
    if (overlap && counterActive) {
      jibrilCounterHit(jcx, jcy);
      patch.bossState = 'chase';
      patch.bossNextActionAt = nextActionDelay(newGameTime, jibril);
    } else if (newGameTime >= (jibril.bossStateUntil ?? 0)) {
      patch.bossState = 'chase';
      patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, jibril);
    }
  } else {
    patch.bossState = 'chase';
    patch.bossNextActionAt = newGameTime + AN_C.stunNextActionMs;
  }

  applyPatch(jibril.id, patch);
};

// --- ジブリル(旧・?jibrilscript=0 専用フォールバック=変更前の実装をそのまま保持) ----------------
export const runJibrilTickLegacy = (
  jibril: Enemy, s: AngelBossState, newGameTime: number, deltaTime: number, moveSpeedMult: number,
  sfx: AngelSfx,
): void => {
  const store = useGameStore.getState();
  const player = store.player;
  const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
  const jcx = jibril.x + jibril.width / 2, jcy = jibril.y + jibril.height / 2;
  const bossMoveDt = deltaTime * moveSpeedMult;
  const jHomeX = jibril.homeX ?? jcx, jHomeY = jibril.homeY ?? jcy;
  const maxR = GATE_ARENA_RADIUS - MIGUEL_ORBIT_MARGIN - jibril.height / 2;
  const st = jibril.bossState ?? 'chase';
  const patch: Partial<Enemy> = {};
  const jr = s.jibril;
  void sfx; // ジブリルは現状専用SEなし(将来のランタンSE等の置き場)

  if (jibril.lastHit && jibril.lastHit !== jr.lastHitSeen) {
    jr.hits += 1;
    jr.lastHitSeen = jibril.lastHit;
  }
  const retreatMove = (): void => {
    const ax = jcx - pcx, ay = jcy - pcy;
    const al = Math.hypot(ax, ay) || 1;
    // ボスのクリ半減(社長指示v0.25.2422)。他の移動語彙は移動の入口で掛けているのに、
    // ジブリルの後退だけ抜けていた(v0.25.2895)。
    const spd = JB_T.retreat.speed * (jr.hits >= JB_T.retreat.hitsFaster ? JB_T.retreat.fastMult : 1) * bossSlowMult(jibril, newGameTime);
    let nx = jcx + (ax / al) * spd * bossMoveDt;
    let ny = jcy + (ay / al) * spd * bossMoveDt;
    const rx = nx - jHomeX, ry = ny - jHomeY;
    const rl = Math.hypot(rx, ry);
    if (rl > maxR) { nx = jHomeX + (rx / rl) * maxR; ny = jHomeY + (ry / rl) * maxR; }
    patch.x = nx - jibril.width / 2;
    patch.y = ny - jibril.height / 2;
  };

  const jibrilFull = jibril.bossFullStunUntil !== undefined && newGameTime < jibril.bossFullStunUntil;
  if (jr.hits - jr.lastWarpHits >= JB_T.warp.hits) {
    jr.lastWarpHits = jr.hits;
    const dx = jHomeX - pcx, dy = jHomeY - pcy;
    const dl = Math.hypot(dx, dy) || 1;
    const wx = jHomeX + (dx / dl) * maxR, wy = jHomeY + (dy / dl) * maxR;
    useGameStore.getState().spawnRing(jcx, jcy, 8, 60, 'rgba(168,85,247,0.8)', 3, 300);
    patch.x = wx - jibril.width / 2;
    patch.y = wy - jibril.height / 2;
    useGameStore.getState().spawnRing(wx, wy, 8, 70, 'rgba(168,85,247,0.9)', 3, 340);
    useGameStore.getState().spawnFlash('rgba(88,28,135,0.20)', 240);
    patch.bossState = 'chase';
    patch.bossNextActionAt = newGameTime + AN_C.stunNextActionMs;
  } else if (jibrilFull) {
    patch.bossState = 'chase';
    patch.bossNextActionAt = newGameTime + AN_C.stunNextActionMs;
  } else if (st === 'chase') {
    retreatMove();
    if (newGameTime >= (jibril.bossNextActionAt ?? 0)) {
      if (Math.random() < JIBRIL_LANTERN_CHANCE_LEGACY) {
        patch.bossState = 'lantern';
        patch.bossStateUntil = newGameTime + JB_T.lantern.ms;
        jr.nextFireAt = newGameTime;
      } else {
        const dist = Math.hypot(pcx - jcx, pcy - jcy);
        jr.volleyMode = dist <= JIBRIL_HANDGUN_DIST ? 'close' : 'snipe';
        jr.shots = 0;
        jr.nextShotAt = newGameTime;
        const shots = jr.volleyMode === 'close' ? JIBRIL_CLOSE_SHOTS : JIBRIL_SNIPE_SHOTS;
        const gap = jr.volleyMode === 'close' ? AN_C.burst.gapMs : JIBRIL_SNIPE_GAP_MS;
        patch.bossState = 'volley';
        patch.bossStateUntil = newGameTime + shots * gap + 200;
      }
    }
  } else if (st === 'volley') {
    retreatMove();
    const shots = jr.volleyMode === 'close' ? JIBRIL_CLOSE_SHOTS : JIBRIL_SNIPE_SHOTS;
    const gap = jr.volleyMode === 'close' ? AN_C.burst.gapMs : JIBRIL_SNIPE_GAP_MS;
    if (jr.shots < shots && newGameTime >= jr.nextShotAt) {
      const proj = createEnemyProjectile(jibril, player);
      if (jr.volleyMode === 'snipe') proj.speed *= JIBRIL_SNIPE_SPEED_MULT;
      useGameStore.getState().addProjectile(proj);
      sfx.shot(); // v0.25.3700: 技SE(社長指示・プレイヤー近似流用)
      jr.shots += 1;
      jr.nextShotAt = newGameTime + gap;
    }
    if (jr.shots >= shots && newGameTime >= (jibril.bossStateUntil ?? 0)) {
      patch.bossState = 'chase';
      patch.bossNextActionAt = nextActionDelay(newGameTime, jibril);
    }
  } else if (st === 'lantern') {
    retreatMove();
    if (newGameTime >= jr.nextFireAt) {
      const fpx = pcx, fpy = player.y + player.height;
      useGameStore.getState().spawnBossFire(fpx, fpy, newGameTime, newGameTime + JB_T.fire.telegraphMs, newGameTime + JB_T.fire.telegraphMs + JB_T.fire.lifeMs);
      jr.nextFireAt = newGameTime + JB_T.lantern.fireGapMs;
    }
    if (newGameTime >= (jibril.bossStateUntil ?? 0)) {
      patch.bossState = 'chase';
      patch.bossNextActionAt = nextActionDelay(newGameTime, jibril);
    }
  } else {
    patch.bossState = 'chase';
    patch.bossNextActionAt = newGameTime + AN_C.stunNextActionMs;
  }

  applyPatch(jibril.id, patch);
};

// ============================================================================================
// --- ラフィ(§6.28-8 バッチM57) --------------------------------------------------------------
// ============================================================================================
export const runRafiTick = (
  rafi: Enemy, s: AngelBossState, newGameTime: number, deltaTime: number, moveSpeedMult: number,
  sfx: AngelSfx,
): void => {
  const store = useGameStore.getState();
  const player = store.player;
  const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
  const rcx = rafi.x + rafi.width / 2, rcy = rafi.y + rafi.height / 2;
  const bossMoveDt = deltaTime * moveSpeedMult;
  const rHomeX = rafi.homeX ?? rcx, rHomeY = rafi.homeY ?? rcy;
  const maxR = GATE_ARENA_RADIUS - MIGUEL_ORBIT_MARGIN - rafi.height / 2;
  const st = rafi.bossState ?? 'chase';
  const patch: Partial<Enemy> = {};
  const rr = s.rafi;
  const rafiHateAim = (): ResolvedHateAim => resolveBossHateAim(rafi, { x: pcx, y: pcy }, store.summons, newGameTime);
  const rafiLockedAim = (): ResolvedHateAim => resolveBossLockedHateAim(rafi, { x: pcx, y: pcy }, store.summons);

  const healthFrac = rafi.maxHealth > 0 ? rafi.health / rafi.maxHealth : 1;
  const phase = phaseForHealth(healthFrac, [RAFI_PHASE_HP_THRESHOLD]) as 1 | 2;
  patch.bossPhase = phase;
  patch.bossPhaseFlashUntil = phaseJustChanged(rafi.bossPhase, phase) ? newGameTime + ANGEL_PHASE_FLASH_MS : rafi.bossPhaseFlashUntil;

  const clampArena = (nx: number, ny: number): { x: number; y: number } => {
    const dx = nx - rHomeX, dy = ny - rHomeY;
    const dl = Math.hypot(dx, dy);
    if (dl > maxR) return { x: rHomeX + (dx / dl) * maxR, y: rHomeY + (dy / dl) * maxR };
    return { x: nx, y: ny };
  };
  const chaseMove = (rawSpd: number): void => {
    // ボスのクリ半減(社長指示v0.25.2422)。呼び出し側(<boss>.speed)を書き換えず、
    // **移動の入口1箇所**で掛ける=全ての chaseMove 呼び出しに漏れなく効く。
    const spd = rawSpd * bossSlowMult(rafi, newGameTime);
    const dx = pcx - rcx, dy = pcy - rcy;
    const dl = Math.hypot(dx, dy) || 1;
    const c = clampArena(rcx + (dx / dl) * spd * bossMoveDt, rcy + (dy / dl) * spd * bossMoveDt);
    patch.x = c.x - rafi.width / 2; patch.y = c.y - rafi.height / 2;
  };
  const rafiCounterHit = (hx: number, hy: number, ghost?: GhostCounterFire): void => angelCounterHit(rafi, rcx, hx, hy, sfx, ghost);

  // --- 技の開始(begin*)。実戦の抽選(下のchase分岐)と ボスメーカーの▸個別再生が**同じ1本**を通る ---
  const beginRafiSweep = (): void => {
    patch.bossState = 'sweep-windup';
    patch.bossStateUntil = newGameTime + RF_T.sweep.windup;
    // BOT_AND_GHOST.md §2.8 G2.5: 狙いロック(pcx/pcyの代わりにヘイト対象の中心)。
    const sweepAim = resolveBossHateAim(rafi, { x: pcx, y: pcy }, store.summons, newGameTime);
    patch.hateTarget = sweepAim.side;
    const ddl = Math.hypot(sweepAim.x - rcx, sweepAim.y - rcy) || 1;
    const dirx = (sweepAim.x - rcx) / ddl, diry = (sweepAim.y - rcy) / ddl;
    patch.aiFromX = rcx; patch.aiFromY = rcy;
    patch.aiTargetX = rcx + dirx * RF_T.sweep.range; patch.aiTargetY = rcy + diry * RF_T.sweep.range;
  };
  // ★v0.25.3592(社長指示「バックロール追加。その後刃を2発高速で飛ばしてくる技を追加。台本化」):
  // ロール台本の1手目=移動だけの後退(賞金首のロール台本と同型・攻撃判定なし)。明けたら刃2連射へ直結。
  const beginRafiRoll = (): void => {
    const dl = Math.hypot(pcx - rcx, pcy - rcy) || 1;
    patch.aiFromX = rcx; patch.aiFromY = rcy;
    patch.aiTargetX = rcx + ((rcx - pcx) / dl) * RF_T.roll.rollDist;
    patch.aiTargetY = rcy + ((rcy - pcy) / dl) * RF_T.roll.rollDist;
    patch.bossState = 'backroll';
    patch.bossStateUntil = newGameTime + RF_T.roll.rollMs;
  };
  const beginRafiBone = (): void => {
    const aim = rafiHateAim();
    patch.bossState = 'bone-windup';
    patch.bossStateUntil = newGameTime + RF_T.bone.windup;
    patch.hateTarget = aim.side;
  };
  const beginRafiJump = (): void => {
    patch.bossState = 'jump-windup';
    patch.bossStateUntil = newGameTime + RF_T.jump.windup;
    // ★v0.25.3148(バグ修正): **着地点は溜め(jump-windup)の開始でロックする**。
    // 掟W4「予告を出したら向きは変えない」= 出す時にロックする、が正しい形。
    const jaim = rafiHateAim();
    patch.aiFromX = rcx; patch.aiFromY = rcy;
    patch.aiTargetX = jaim.x; patch.aiTargetY = jaim.y; patch.hateTarget = jaim.side;
  };
  /** 選ばれた技を始める(予告SE+再ジャンプ回数のリセットは全技共通=旧実装のとおり分岐の手前)。 */
  const startRafiMove = (k: AngelMoveKey): void => {
    sfx.alert();
    rr.rejumps = 0;
    if (k === 'rf-sweep') beginRafiSweep();
    else if (k === 'rf-bone') beginRafiBone();
    else if (k === 'rf-roll') beginRafiRoll(); // ★v0.25.3592
    else beginRafiJump();
  };

  const rafiFull = rafi.bossFullStunUntil !== undefined && newGameTime < rafi.bossFullStunUntil;
  let rGhostFire: GhostCounterFire | null = null;
  if (rafiFull) {
    patch.bossState = 'chase'; patch.bossNextActionAt = newGameTime + AN_C.stunNextActionMs;
  } else if ((rGhostFire = takeGhostAngelCounter(rafi)) !== null) {
    // v0.25.2480: 守護霊カウンター成立(効果=プレイヤー成立の各州分岐と同一のchase復帰)。
    rafiCounterHit(rcx, rcy, rGhostFire);
    patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, rafi);
  } else if (takeAngelPlay(rafi, 'rafi', startRafiMove)) {
    // ボスメーカー ▸(通常プレイでは要求箱が常に null なのでここへは来ない)。
  } else if (st === 'chase') {
    const stepMinGap = phase === 2 ? RF_T.step.minGapMsP2 : RF_T.step.minGapMs;
    const stepMaxGap = phase === 2 ? RF_T.step.maxGapMsP2 : RF_T.step.maxGapMs;
    if (newGameTime < rr.stepUntil) {
      // ボスのクリ半減(社長指示v0.25.2422)。chaseMoveには掛かっているのに、
      // 横ステップだけ抜けていた(v0.25.2895)。
      const stepSpd = RF_T.step.speed * bossSlowMult(rafi, newGameTime);
      const c = clampArena(rcx + rr.stepDx * stepSpd * bossMoveDt, rcy + rr.stepDy * stepSpd * bossMoveDt);
      patch.x = c.x - rafi.width / 2; patch.y = c.y - rafi.height / 2;
    } else if (rr.nextStepAt !== 0 && newGameTime >= rr.nextStepAt) {
      const dx = pcx - rcx, dy = pcy - rcy; const dl = Math.hypot(dx, dy) || 1;
      const side = Math.random() < 0.5 ? 1 : -1;
      rr.stepDx = (-dy / dl) * side; rr.stepDy = (dx / dl) * side;
      rr.stepUntil = newGameTime + RF_T.step.ms;
      rr.nextStepAt = newGameTime + RF_T.step.ms + stepMinGap + Math.random() * (stepMaxGap - stepMinGap);
    } else {
      if (rr.nextStepAt === 0) rr.nextStepAt = newGameTime + stepMinGap + Math.random() * (stepMaxGap - stepMinGap);
      chaseMove(RF_T.chase.speed);
    }
    if (newGameTime >= rr.stepUntil && newGameTime >= (rafi.bossNextActionAt ?? 0)) {
      const dist = Math.hypot(pcx - rcx, pcy - rcy);
      const sweepReady = newGameTime >= (rafi.rSweepReadyAt ?? 0);
      const scripted = chooseScriptMove(rafi, 'rafi', phase, () => pickRafiMove(dist, phase, sweepReady));
      const move = scripted.move;
      patch.bossScriptQueue = scripted.remaining;
      if (move) {
        startRafiMove(move === 'sweep' ? 'rf-sweep' : move === 'bone' ? 'rf-bone' : 'rf-jump');
      }
    }
  } else if (st === 'backroll') {
    // ★v0.25.3592 台本1手目: smoothstepで後方へ引く移動だけの状態(攻撃判定なし・アリーナ内へクランプ)。
    const fx = rafi.aiFromX ?? rcx, fy = rafi.aiFromY ?? rcy;
    const tx = rafi.aiTargetX ?? rcx, ty = rafi.aiTargetY ?? rcy;
    const tR = Math.max(0, Math.min(1, 1 - ((rafi.bossStateUntil ?? newGameTime) - newGameTime) / RF_T.roll.rollMs));
    const kR = tR * tR * (3 - 2 * tR);
    const cR = clampArena(fx + (tx - fx) * kR, fy + (ty - fy) * kR);
    patch.x = cR.x - rafi.width / 2; patch.y = cR.y - rafi.height / 2;
    if (newGameTime >= (rafi.bossStateUntil ?? 0)) {
      // 2手目=刃2連射の溜め。**狙いはこの頭で固定**(三段突き裁定v3565と同じ=以後追尾しない)。
      const aim = rafiLockedAim();
      patch.aiTargetX = aim.x; patch.aiTargetY = aim.y; patch.hateTarget = aim.side;
      patch.bossState = 'quickblades-windup';
      patch.bossStateUntil = newGameTime + RF_T.quickblades.windup;
    }
  } else if (st === 'quickblades-windup') {
    const { overlap, counterActive } = bodyOverlapNow(rafi);
    if (overlap && counterActive) {
      rafiCounterHit(rcx, rcy);
      patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, rafi);
    } else if (newGameTime >= (rafi.bossStateUntil ?? 0)) {
      // ★v0.25.3592 発射: 自分の脇(±sideOffsetPx)から固定した狙いへ骨刃2本を短遅延で射出
      // (既存骨刃と同じ飛翔体=速度700px/s。既存のdelay1000msと違い250ms+120ms差=「高速で飛んでくる」。
      //  刃のパリィ=体勢のみ削る・ラフィ討伐で消える、はv0.25.3591の裁定がそのまま効く)。
      const qtx = rafi.aiTargetX ?? pcx, qty = rafi.aiTargetY ?? pcy;
      const baseAng = Math.atan2(qty - rcy, qtx - rcx);
      for (let qi = 0; qi < RF_T.quickblades.count; qi++) {
        const side = qi % 2 === 0 ? 1 : -1;
        const sx = rcx + Math.cos(baseAng + Math.PI / 2) * RF_T.quickblades.sideOffsetPx * side;
        const sy = rcy + Math.sin(baseAng + Math.PI / 2) * RF_T.quickblades.sideOffsetPx * side;
        const aimA = Math.atan2(qty - sy, qtx - sx);
        useGameStore.getState().spawnSkadiBlade(
          sx, sy, aimA,
          newGameTime + RF_T.quickblades.launchDelayMs + qi * RF_T.quickblades.gapMs,
          rafi.id, 'bone',
        );
      }
      sfx.throw(); // v0.25.3700: 技SE(社長指示・プレイヤー近似流用)
      patch.bossState = 'quickblades-recover';
      patch.bossStateUntil = newGameTime + choreographyRecoverMs(RF_T.quickblades.recover, (rafi.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'quickblades-recover') {
    const { overlap, counterActive } = bodyOverlapNow(rafi);
    if (overlap && counterActive) {
      rafiCounterHit(rcx, rcy);
      patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, rafi);
    } else if (newGameTime >= (rafi.bossStateUntil ?? 0)) {
      patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, rafi);
    }
  } else if (st === 'bone-windup') {
    const { overlap, counterActive } = bodyOverlapNow(rafi);
    if (overlap && counterActive) {
      rafiCounterHit(rcx, rcy);
      patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, rafi);
    } else if (newGameTime >= (rafi.bossStateUntil ?? 0)) {
      patch.bossState = 'bone'; rr.boneLeft = RF_T.bone.count; rr.boneNextAt = newGameTime;
      // v0.25.3078(社長指示): 撃ち始めに「これから飛ぶ本数」の骨刃が全方位へドバッと出る予兆。
      store.spawnFanBurst(rcx, rcy, 'rafi-blade', RF_T.bone.count);
    }
  } else if (st === 'bone') {
    if (rr.boneLeft > 0 && newGameTime >= rr.boneNextAt) {
      const aimTgt = rafiLockedAim();
      const a0 = Math.random() * Math.PI * 2;
      const dist = RF_T.bone.ringMin + Math.random() * (RF_T.bone.ringMax - RF_T.bone.ringMin);
      const sx = aimTgt.x + Math.cos(a0) * dist, sy = aimTgt.y + Math.sin(a0) * dist;
      const aim = Math.atan2(aimTgt.y - sy, aimTgt.x - sx);
      useGameStore.getState().spawnSkadiBlade(sx, sy, aim, newGameTime + RF_T.bone.delayMs, rafi.id, 'bone');
      sfx.throw(); // v0.25.3700: 技SE(社長指示・プレイヤー近似流用)
      rr.boneLeft -= 1;
      rr.boneNextAt = newGameTime + RF_T.bone.gapMs;
    }
    if (rr.boneLeft <= 0) {
      patch.bossState = 'bone-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(RF_T.bone.recover, (rafi.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'bone-recover') {
    const { overlap, counterActive } = bodyOverlapNow(rafi);
    if (overlap && counterActive) {
      rafiCounterHit(rcx, rcy);
      patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, rafi);
    } else if (newGameTime >= (rafi.bossStateUntil ?? 0)) {
      patch.bossState = 'chase'; patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, rafi);
    }
  } else if (st === 'jump-windup') {
    // ★v0.25.3591(監査 B-5): 跳びかかりの予告は**着地円 r=70**(プレイヤー位置にロック)。成立域も
    // 着地円へ揃える(体の重なりだと、赤い円の中に立っていてもカウンターできなかった)。
    // 旧実装(?rafiscript=0)側も同じ形に揃える(v0.25.3148の掟=片方だけ直すと嘘の円が残る)。
    const { overlap, counterActive } = reachOverlapNow(rafi, st);
    if (overlap && counterActive) {
      rafiCounterHit(rcx, rcy);
      if (rr.rejumps < RF_T.jump.maxRejumps) {
        rr.rejumps += 1;
        patch.bossState = 'jump-windup';
        patch.bossStateUntil = newGameTime + RF_T.jump.windup;
        // 再ジャンプも「溜め開始でロック」(v0.25.3148・上と同じ理由)。
        const rjAim = rafiHateAim();
        patch.aiFromX = rcx; patch.aiFromY = rcy;
        patch.aiTargetX = rjAim.x; patch.aiTargetY = rjAim.y; patch.hateTarget = rjAim.side;
      } else {
        patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, rafi);
      }
    } else if (newGameTime >= (rafi.bossStateUntil ?? 0)) {
      patch.bossState = 'jump-attack';
      patch.bossStateUntil = newGameTime + RF_T.jump.ms;
      // ★着地点(aiTargetX/Y)は**溜め開始でロック済み**なので、ここでは狙い直さない
      // (v0.25.3148。狙い直すと「赤い円を見て避けた先へ追ってくる」=予告が嘘になる)。
      // 飛び出し位置(aiFromX/Y)だけは実際に飛ぶ瞬間の位置へ更新する=弧の始点。
      patch.aiFromX = rcx; patch.aiFromY = rcy;
    }
  } else if (st === 'jump-attack') {
    const fx0 = rafi.aiFromX ?? rcx, fy0 = rafi.aiFromY ?? rcy;
    const tx0 = rafi.aiTargetX ?? rcx, ty0 = rafi.aiTargetY ?? rcy;
    const t = Math.max(0, Math.min(1, 1 - ((rafi.bossStateUntil ?? newGameTime) - newGameTime) / RF_T.jump.ms));
    // v0.25.3076(社長指示「滑空って全てのジャンプね」): 等速の線形補間をやめ、両端で速度も
    // 加速度も0になる曲線で運ぶ(着地時刻・着地点・着地爆発はすべて不変)。
    const tEs = airHopEase01(t);
    patch.x = (fx0 + (tx0 - fx0) * tEs) - rafi.width / 2;
    patch.y = (fy0 + (ty0 - fy0) * tEs) - rafi.height / 2;
    if (newGameTime >= (rafi.bossStateUntil ?? 0)) {
      useGameStore.setState(state => ({
        pumpkinBlasts: [...state.pumpkinBlasts, { x: tx0, y: ty0, radius: RF_T.jump.radius, damage: rafi.damage, enemyId: rafi.id }],
      }));
      patch.bossState = 'jump-recover';
      patch.bossStateUntil = newGameTime + choreographyRecoverMs(RF_T.jump.recover, (rafi.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'jump-recover') {
    const { overlap, counterActive } = bodyOverlapNow(rafi);
    if (overlap && counterActive) {
      rafiCounterHit(rcx, rcy);
      patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, rafi);
    } else if (newGameTime >= (rafi.bossStateUntil ?? 0)) {
      patch.bossState = 'chase'; patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, rafi);
    }
  } else if (st === 'sweep-windup') {
    const { overlap, counterActive } = bodyOverlapNow(rafi);
    if (overlap && counterActive) {
      rafiCounterHit(rcx, rcy);
      patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, rafi);
    } else if (newGameTime >= (rafi.bossStateUntil ?? 0)) {
      const sfx0 = rafi.aiFromX ?? rcx, sfy0 = rafi.aiFromY ?? rcy;
      const stx0 = rafi.aiTargetX ?? rcx, sty0 = rafi.aiTargetY ?? rcy;
      useGameStore.setState(state => ({
        pumpkinBlasts: [...state.pumpkinBlasts, {
          x: (sfx0 + stx0) / 2, y: (sfy0 + sty0) / 2, radius: RF_T.sweep.halfWidth,
          damage: rafi.damage, enemyId: rafi.id,
          capsule: { fx: sfx0, fy: sfy0, tx: stx0, ty: sty0, halfWidth: RF_T.sweep.halfWidth },
        }],
      }));
      patch.bossState = 'sweep'; patch.bossStateUntil = newGameTime + RF_T.sweep.active;
    }
  } else if (st === 'sweep') {
    // ★v0.25.3591(監査 B-6): **同じ薙ぎを持つミゲル/ウリ/スリィエル/アクラシエルには実行中の
    // 帯カウンターがあるのに、ラフィだけ無かった**(この州には判定もカウンターも一切無く、
    // 赤い帯 310×40 の中に立っていても何も起きない)。4体と同じ形=帯reachで開ける。
    // ダメージは既に windup 明けの pumpkinBlasts で解決済みなので、ここは**カウンター専用の窓**。
    const { overlap, counterActive } = reachOverlapNow(rafi, st);
    if (overlap && counterActive) {
      rafiCounterHit(rcx, rcy);
      patch.rSweepReadyAt = newGameTime + RF_T.sweep.cdMs * freshCritCdMult(rafi.id, newGameTime);
      patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, rafi);
    } else if (newGameTime >= (rafi.bossStateUntil ?? 0)) {
      patch.bossState = 'sweep-recover';
      patch.bossStateUntil = newGameTime + choreographyRecoverMs(RF_T.sweep.recover, (rafi.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'sweep-recover') {
    const { overlap, counterActive } = bodyOverlapNow(rafi);
    if (overlap && counterActive) {
      rafiCounterHit(rcx, rcy);
      patch.rSweepReadyAt = newGameTime + RF_T.sweep.cdMs * freshCritCdMult(rafi.id, newGameTime);
      patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, rafi);
    } else if (newGameTime >= (rafi.bossStateUntil ?? 0)) {
      patch.rSweepReadyAt = newGameTime + RF_T.sweep.cdMs * freshCritCdMult(rafi.id, newGameTime);
      patch.bossState = 'chase'; patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, rafi);
    }
  } else {
    patch.bossState = 'chase'; patch.bossNextActionAt = newGameTime + AN_C.stunNextActionMs;
  }

  // ★v0.25.3195(社長報告「ラフィがよくサークルの外に出ちゃってて致命の一撃を与えられない」):
  // どの経路で外に出たとしても(カウンターの小ノックバック/技の移動の累積等)、**tickの最後に必ず
  // アリーナ内へ戻す**。chase/横ステップはclampArena済みだったが、位置を書く他の経路と外力には
  // 掛かっていなかった。プレイヤーはサークルに拘束されるので、外に居るボスには紫中でも届かない。
  {
    const fcx = (patch.x !== undefined ? patch.x : rafi.x) + rafi.width / 2;
    const fcy = (patch.y !== undefined ? patch.y : rafi.y) + rafi.height / 2;
    const fc = clampArena(fcx, fcy);
    if (fc.x !== fcx || fc.y !== fcy) { patch.x = fc.x - rafi.width / 2; patch.y = fc.y - rafi.height / 2; }
  }

  applyPatch(rafi.id, patch);
};

// --- ラフィ(旧・?rafiscript=0 専用フォールバック=変更前の実装をそのまま保持) --------------------
export const runRafiTickLegacy = (
  rafi: Enemy, s: AngelBossState, newGameTime: number, deltaTime: number, moveSpeedMult: number,
  sfx: AngelSfx,
): void => {
  const store = useGameStore.getState();
  const player = store.player;
  const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
  const rcx = rafi.x + rafi.width / 2, rcy = rafi.y + rafi.height / 2;
  const bossMoveDt = deltaTime * moveSpeedMult;
  const rHomeX = rafi.homeX ?? rcx, rHomeY = rafi.homeY ?? rcy;
  const maxR = GATE_ARENA_RADIUS - MIGUEL_ORBIT_MARGIN - rafi.height / 2;
  const st = rafi.bossState ?? 'chase';
  const patch: Partial<Enemy> = {};
  const rr = s.rafi;

  const clampArena = (nx: number, ny: number): { x: number; y: number } => {
    const dx = nx - rHomeX, dy = ny - rHomeY;
    const dl = Math.hypot(dx, dy);
    if (dl > maxR) return { x: rHomeX + (dx / dl) * maxR, y: rHomeY + (dy / dl) * maxR };
    return { x: nx, y: ny };
  };
  const chaseMove = (rawSpd: number): void => {
    // ボスのクリ半減(社長指示v0.25.2422)。呼び出し側(<boss>.speed)を書き換えず、
    // **移動の入口1箇所**で掛ける=全ての chaseMove 呼び出しに漏れなく効く。
    const spd = rawSpd * bossSlowMult(rafi, newGameTime);
    const dx = pcx - rcx, dy = pcy - rcy;
    const dl = Math.hypot(dx, dy) || 1;
    const c = clampArena(rcx + (dx / dl) * spd * bossMoveDt, rcy + (dy / dl) * spd * bossMoveDt);
    patch.x = c.x - rafi.width / 2; patch.y = c.y - rafi.height / 2;
  };

  const rafiCounterHit = (hx: number, hy: number, ghost?: GhostCounterFire): void => angelCounterHit(rafi, rcx, hx, hy, sfx, ghost);

  const rafiFull = rafi.bossFullStunUntil !== undefined && newGameTime < rafi.bossFullStunUntil;
  let rGhostFire: GhostCounterFire | null = null;
  if (rafiFull) {
    patch.bossState = 'chase'; patch.bossNextActionAt = newGameTime + AN_C.stunNextActionMs;
  } else if ((rGhostFire = takeGhostAngelCounter(rafi)) !== null) {
    // v0.25.2480: 守護霊カウンター成立(旧実装フォールバックでも同作法)。
    rafiCounterHit(rcx, rcy, rGhostFire);
    patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, rafi);
  } else if (st === 'chase') {
    if (newGameTime < rr.stepUntil) {
      // ボスのクリ半減(社長指示v0.25.2422)。chaseMoveには掛かっているのに、
      // 横ステップだけ抜けていた(v0.25.2895)。
      const stepSpd = RF_T.step.speed * bossSlowMult(rafi, newGameTime);
      const c = clampArena(rcx + rr.stepDx * stepSpd * bossMoveDt, rcy + rr.stepDy * stepSpd * bossMoveDt);
      patch.x = c.x - rafi.width / 2; patch.y = c.y - rafi.height / 2;
    } else if (rr.nextStepAt !== 0 && newGameTime >= rr.nextStepAt) {
      const dx = pcx - rcx, dy = pcy - rcy; const dl = Math.hypot(dx, dy) || 1;
      const side = Math.random() < 0.5 ? 1 : -1;
      rr.stepDx = (-dy / dl) * side; rr.stepDy = (dx / dl) * side;
      rr.stepUntil = newGameTime + RF_T.step.ms;
      rr.nextStepAt = newGameTime + RF_T.step.ms + RF_T.step.minGapMs + Math.random() * (RF_T.step.maxGapMs - RF_T.step.minGapMs);
    } else {
      if (rr.nextStepAt === 0) rr.nextStepAt = newGameTime + RF_T.step.minGapMs + Math.random() * (RF_T.step.maxGapMs - RF_T.step.minGapMs);
      chaseMove(RF_T.chase.speed);
    }
    if (newGameTime >= rr.stepUntil && newGameTime >= (rafi.bossNextActionAt ?? 0)) {
      const dist = Math.hypot(pcx - rcx, pcy - rcy);
      rr.rejumps = 0;
      if (dist <= RAFI_HANDGUN_DIST) {
        patch.bossState = 'bone';
        rr.boneLeft = RF_T.bone.count; rr.boneNextAt = newGameTime;
      } else {
        patch.bossState = 'jump-windup';
        patch.bossStateUntil = newGameTime + RF_T.jump.windup;
        // v0.25.3148: 旧実装側も同じ形に揃える(片方だけ直すと ?rafiscript=0 で嘘の円が残る)。
        patch.aiFromX = rcx; patch.aiFromY = rcy;
        patch.aiTargetX = pcx; patch.aiTargetY = pcy;
      }
    }
  } else if (st === 'bone') {
    if (rr.boneLeft > 0 && newGameTime >= rr.boneNextAt) {
      const a0 = Math.random() * Math.PI * 2;
      const dist = RF_T.bone.ringMin + Math.random() * (RF_T.bone.ringMax - RF_T.bone.ringMin);
      const sx = pcx + Math.cos(a0) * dist, sy = pcy + Math.sin(a0) * dist;
      const aim = Math.atan2(pcy - sy, pcx - sx);
      useGameStore.getState().spawnSkadiBlade(sx, sy, aim, newGameTime + RF_T.bone.delayMs, rafi.id, 'bone');
      sfx.throw(); // v0.25.3700: 技SE(社長指示・プレイヤー近似流用)
      rr.boneLeft -= 1;
      rr.boneNextAt = newGameTime + RF_T.bone.gapMs;
    }
    if (rr.boneLeft <= 0) {
      patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, rafi);
    }
  } else if (st === 'jump-windup') {
    // ★v0.25.3591(監査 B-5): 跳びかかりの予告は**着地円 r=70**(プレイヤー位置にロック)。成立域も
    // 着地円へ揃える(体の重なりだと、赤い円の中に立っていてもカウンターできなかった)。
    // 旧実装(?rafiscript=0)側も同じ形に揃える(v0.25.3148の掟=片方だけ直すと嘘の円が残る)。
    const { overlap, counterActive } = reachOverlapNow(rafi, st);
    if (overlap && counterActive) {
      rafiCounterHit(rcx, rcy);
      if (rr.rejumps < RF_T.jump.maxRejumps) {
        rr.rejumps += 1;
        patch.bossState = 'jump-windup';
        patch.bossStateUntil = newGameTime + RF_T.jump.windup;
        patch.aiFromX = rcx; patch.aiFromY = rcy;
        patch.aiTargetX = pcx; patch.aiTargetY = pcy;
      } else {
        patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, rafi);
      }
    } else if (newGameTime >= (rafi.bossStateUntil ?? 0)) {
      patch.bossState = 'jump-attack';
      patch.bossStateUntil = newGameTime + RF_T.jump.ms;
      // 着地点は溜め開始でロック済み(v0.25.3148)。飛び出し位置だけ更新。
      patch.aiFromX = rcx; patch.aiFromY = rcy;
    }
  } else if (st === 'jump-attack') {
    const fx0 = rafi.aiFromX ?? rcx, fy0 = rafi.aiFromY ?? rcy;
    const tx0 = rafi.aiTargetX ?? rcx, ty0 = rafi.aiTargetY ?? rcy;
    const t = Math.max(0, Math.min(1, 1 - ((rafi.bossStateUntil ?? newGameTime) - newGameTime) / RF_T.jump.ms));
    // v0.25.3076(社長指示「滑空って全てのジャンプね」): 等速の線形補間をやめ、両端で速度も
    // 加速度も0になる曲線で運ぶ(着地時刻・着地点・着地爆発はすべて不変)。
    const tEs = airHopEase01(t);
    patch.x = (fx0 + (tx0 - fx0) * tEs) - rafi.width / 2;
    patch.y = (fy0 + (ty0 - fy0) * tEs) - rafi.height / 2;
    if (newGameTime >= (rafi.bossStateUntil ?? 0)) {
      useGameStore.setState(state => ({
        pumpkinBlasts: [...state.pumpkinBlasts, { x: tx0, y: ty0, radius: RF_T.jump.radius, damage: rafi.damage, enemyId: rafi.id }],
      }));
      patch.bossState = 'jump-recover';
      patch.bossStateUntil = newGameTime + RF_T.jump.recover;
    }
  } else if (st === 'jump-recover') {
    const { overlap, counterActive } = bodyOverlapNow(rafi);
    if (overlap && counterActive) {
      rafiCounterHit(rcx, rcy);
      patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, rafi);
    } else if (newGameTime >= (rafi.bossStateUntil ?? 0)) {
      patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, rafi);
    }
  } else {
    patch.bossState = 'chase'; patch.bossNextActionAt = newGameTime + AN_C.stunNextActionMs;
  }

  applyPatch(rafi.id, patch);
};

// ============================================================================================
// --- ウリ(§6.28-17 バッチM61・新規) ---------------------------------------------------------
// ============================================================================================
export const runUriTick = (
  uri: Enemy, s: AngelBossState, newGameTime: number, deltaTime: number, moveSpeedMult: number,
  sfx: AngelSfx, onPlayerDeath: (x: number, y: number) => void,
): void => {
  const store = useGameStore.getState();
  const player = store.player;
  const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
  const ucx = uri.x + uri.width / 2, ucy = uri.y + uri.height / 2;
  const bossMoveDt = deltaTime * moveSpeedMult;
  const uHomeX = uri.homeX ?? ucx, uHomeY = uri.homeY ?? ucy;
  const maxR = GATE_ARENA_RADIUS - MIGUEL_ORBIT_MARGIN - uri.height / 2;
  const st = uri.bossState ?? 'chase';
  const patch: Partial<Enemy> = {};
  const uriHateAim = (): ResolvedHateAim => resolveBossHateAim(uri, { x: pcx, y: pcy }, store.summons, newGameTime);
  const uriLockedAim = (): ResolvedHateAim => resolveBossLockedHateAim(uri, { x: pcx, y: pcy }, store.summons);

  const healthFrac = uri.maxHealth > 0 ? uri.health / uri.maxHealth : 1;
  const phase = phaseForHealth(healthFrac, [URI_PHASE_HP_THRESHOLD]) as 1 | 2;
  patch.bossPhase = phase;
  patch.bossPhaseFlashUntil = phaseJustChanged(uri.bossPhase, phase) ? newGameTime + ANGEL_PHASE_FLASH_MS : uri.bossPhaseFlashUntil;

  const clampArena = (nx: number, ny: number): { x: number; y: number } => {
    const dx = nx - uHomeX, dy = ny - uHomeY;
    const dl = Math.hypot(dx, dy);
    if (dl > maxR) return { x: uHomeX + (dx / dl) * maxR, y: uHomeY + (dy / dl) * maxR };
    return { x: nx, y: ny };
  };
  const chaseMove = (rawSpd: number): void => {
    // ボスのクリ半減(社長指示v0.25.2422)。呼び出し側(<boss>.speed)を書き換えず、
    // **移動の入口1箇所**で掛ける=全ての chaseMove 呼び出しに漏れなく効く。
    const spd = rawSpd * bossSlowMult(uri, newGameTime);
    const dx = pcx - ucx, dy = pcy - ucy;
    const dl = Math.hypot(dx, dy) || 1;
    const c = clampArena(ucx + (dx / dl) * spd * bossMoveDt, ucy + (dy / dl) * spd * bossMoveDt);
    patch.x = c.x - uri.width / 2; patch.y = c.y - uri.height / 2;
  };
  const uriCounterHit = (hx: number, hy: number, ghost?: GhostCounterFire): void => angelCounterHit(uri, ucx, hx, hy, sfx, ghost);

  // --- 技の開始(begin*)。実戦の抽選(下のchase分岐)と ボスメーカーの▸個別再生が**同じ1本**を通る ---
  const beginUriSweep = (): void => {
    patch.bossState = 'sweep-windup'; patch.bossStateUntil = newGameTime + UR_T.sweep.windup;
    // BOT_AND_GHOST.md §2.8 G2.5: 狙いロック(pcx/pcyの代わりにヘイト対象の中心)。
    const sweepAim = resolveBossHateAim(uri, { x: pcx, y: pcy }, store.summons, newGameTime);
    patch.hateTarget = sweepAim.side;
    const ddl = Math.hypot(sweepAim.x - ucx, sweepAim.y - ucy) || 1; const dirx = (sweepAim.x - ucx) / ddl, diry = (sweepAim.y - ucy) / ddl;
    // §6.28-17「図形と判定は必ず一致させる」: ドーナツ(内径くり抜き)ではなく、カプセルの
    // 始点そのものを内径ぶん前へ出す(=原点から innerRadius だけ進んだ点を始点とする通常の
    // カプセル)。半幅40≪内径140/90なので描画は既存T3帯の内側を塗らないだけで済む(社長裁定)。
    const innerR = uriSweepInnerRadius(phase);
    patch.aiFromX = ucx + dirx * innerR; patch.aiFromY = ucy + diry * innerR;
    patch.aiTargetX = ucx + dirx * UR_T.sweep.range; patch.aiTargetY = ucy + diry * UR_T.sweep.range;
  };
  const beginUriDownslash = (): void => {
    patch.bossState = 'downslash-windup'; patch.bossStateUntil = newGameTime + UR_T.downslash.windup;
    // BOT_AND_GHOST.md §2.8 G2.5: 狙いロック(pcx/pcyの代わりにヘイト対象の中心)。
    const dsAim = resolveBossHateAim(uri, { x: pcx, y: pcy }, store.summons, newGameTime);
    patch.hateTarget = dsAim.side;
    const ddl = Math.hypot(dsAim.x - ucx, dsAim.y - ucy) || 1; const dirx = (dsAim.x - ucx) / ddl, diry = (dsAim.y - ucy) / ddl;
    patch.aiFromX = ucx; patch.aiFromY = ucy;
    patch.aiTargetX = ucx + dirx * UR_T.downslash.range; patch.aiTargetY = ucy + diry * UR_T.downslash.range;
  };
  const beginUriThrust = (): void => {
    patch.bossState = 'thrust-windup'; patch.bossStateUntil = newGameTime + UR_T.thrust.windup;
    // BOT_AND_GHOST.md §2.8 G2.5: 狙いロック(pcx/pcyの代わりにヘイト対象の中心)。
    const thrustAim = resolveBossHateAim(uri, { x: pcx, y: pcy }, store.summons, newGameTime);
    patch.aiFromX = ucx; patch.aiFromY = ucy; patch.aiTargetX = thrustAim.x; patch.aiTargetY = thrustAim.y;
    patch.hateTarget = thrustAim.side;
  };
  const beginUriBolt = (): void => {
    const aim = uriHateAim();
    patch.bossState = 'bolt-windup'; patch.bossStateUntil = newGameTime + UR_T.bolt.windup;
    patch.hateTarget = aim.side;
  };
  /** 選ばれた技を始める(予告SEは全技共通=旧実装のとおり分岐の手前で1回)。 */
  const startUriMove = (k: AngelMoveKey): void => {
    sfx.alert();
    if (k === 'ur-sweep') beginUriSweep();
    else if (k === 'ur-downslash') beginUriDownslash();
    else if (k === 'ur-thrust') beginUriThrust();
    else beginUriBolt();
  };

  const uriFull = uri.bossFullStunUntil !== undefined && newGameTime < uri.bossFullStunUntil;
  let uGhostFire: GhostCounterFire | null = null;
  if (uriFull) {
    patch.bossState = 'chase'; patch.bossNextActionAt = newGameTime + AN_C.stunNextActionMs;
  } else if ((uGhostFire = takeGhostAngelCounter(uri)) !== null) {
    // v0.25.2480: 守護霊カウンター成立(効果=プレイヤー成立の各州分岐と同一のchase復帰)。
    uriCounterHit(ucx, ucy, uGhostFire);
    patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, uri);
  } else if (takeAngelPlay(uri, 'uri', startUriMove)) {
    // ボスメーカー ▸(通常プレイでは要求箱が常に null なのでここへは来ない)。
  } else if (st === 'chase') {
    chaseMove(uri.speed);
    if (newGameTime >= (uri.bossNextActionAt ?? 0)) {
      const dist = Math.hypot(pcx - ucx, pcy - ucy);
      const scripted = chooseScriptMove(uri, 'uri', phase, () => pickUriMove(dist));
      const move = scripted.move;
      patch.bossScriptQueue = scripted.remaining;
      if (move) {
        startUriMove(
          move === 'sweep' ? 'ur-sweep'
            : move === 'downslash' ? 'ur-downslash'
              : move === 'thrust' ? 'ur-thrust' : 'ur-bolt',
        );
      }
    }
  } else if (st === 'sweep-windup') {
    // ★踏み込み(社長指示v0.25.3524): 詰める先は**帯の始点**(=内径の位置)。大薙ぎは剣85pxに対して
    // 判定が内径140/90pxから始まる=**剣が内径の中で止まっていて判定に一度も触れていなかった**。
    // 上限は内径の半分(URI_LUNGE_MAX_FRAC)——「懐が安全」がこの技の主題なので、詰めた後も懐を残す。
    if (!isSwordLungeLive(uri.bossLunge, 'sweep', newGameTime)
      && (uri.bossStateUntil ?? newGameTime) - newGameTime <= AN_C.lungeLeadMs) {
      const lfx = uri.aiFromX ?? ucx, lfy = uri.aiFromY ?? ucy;
      const innerR = Math.hypot(lfx - ucx, lfy - ucy); // = uriSweepInnerRadius(phase)(ロック時に焼いた値)
      const planned = planSwordLunge(
        'sweep', ucx, ucy, lfx, lfy,
        UR_T.lunge.standoffPx, innerR * UR_T.lunge.maxFrac,
        newGameTime, AN_C.lungeLeadMs + UR_T.sweep.active,
      );
      if (planned !== null) patch.bossLunge = planned;
    }
    const liveLunge = patch.bossLunge ?? uri.bossLunge;
    if (isSwordLungeLive(liveLunge, 'sweep', newGameTime)) {
      const lc = swordLungeCenterAt(liveLunge, newGameTime);
      patch.x = lc.x - uri.width / 2; patch.y = lc.y - uri.height / 2;
    }
    const { overlap, counterActive } = bodyOverlapNow(uri);
    if (overlap && counterActive) {
      uriCounterHit(ucx, ucy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, uri);
    } else if (newGameTime >= (uri.bossStateUntil ?? 0)) {
      patch.bossState = 'sweep'; patch.bossStateUntil = newGameTime + UR_T.sweep.active;
      sfx.sweep(); // v0.25.3700: 技SE(社長指示・プレイヤー近似流用)
    }
  } else if (st === 'sweep') {
    // ★踏み込みの続き(v0.25.3524): 溜めの終盤で始めた1本の動きを振り切りまで出し切る。
    if (isSwordLungeLive(uri.bossLunge, 'sweep', newGameTime)) {
      const lc = swordLungeCenterAt(uri.bossLunge, newGameTime);
      patch.x = lc.x - uri.width / 2; patch.y = lc.y - uri.height / 2;
    }
    // 始点(aiFromX/Y)は溜め開始時に既に内径ぶん前へ出してある(通常のカプセル判定=distToSegment)。
    const fx0 = uri.aiFromX ?? ucx, fy0 = uri.aiFromY ?? ucy, tx0 = uri.aiTargetX ?? ucx, ty0 = uri.aiTargetY ?? ucy;
    const pr = Math.max(player.width, player.height) / 2;
    let countered = false;
    if (distToBandRect({ x: pcx, y: pcy }, { x: fx0, y: fy0 }, { x: tx0, y: ty0 }, UR_T.sweep.halfWidth) <= pr) {
      const cp = useGameStore.getState().player;
      if (isCounterActive(cp, Date.now())) { uriCounterHit(pcx, pcy); countered = true; /* v0.25.3128(案A): カウンター成立で**技を中断**。判定が出続ける技は毎フレーム範囲内を見るので、止めない限り窓の間ずっと成立し続けていた(旧 countered は「今フレームは硬直へ進めない」だけだった)。 */ patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, uri); }
      else {
        const died = useGameStore.getState().damagePlayer(uri.damage, `${enemyDeathLabel(uri.type)}の大薙ぎ`, pcx, pcy, undefined, undefined, 'uri-sweep'); // G4a計測タグ(記録専用)
        if (died) onPlayerDeath(pcx, pcy);
      }
    }
    if (!countered && newGameTime >= (uri.bossStateUntil ?? 0)) {
      patch.bossState = 'sweep-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(UR_T.sweep.recover, (uri.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'sweep-recover') {
    const { overlap, counterActive } = bodyOverlapNow(uri);
    if (overlap && counterActive) {
      uriCounterHit(ucx, ucy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, uri);
    } else if (newGameTime >= (uri.bossStateUntil ?? 0)) {
      patch.bossState = 'chase'; patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, uri);
    }
  } else if (st === 'downslash-windup') {
    const { overlap, counterActive } = bodyOverlapNow(uri);
    if (overlap && counterActive) {
      uriCounterHit(ucx, ucy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, uri);
    } else if (newGameTime >= (uri.bossStateUntil ?? 0)) {
      patch.bossState = 'downslash'; patch.bossStateUntil = newGameTime + UR_T.downslash.active;
      sfx.sweep(); // v0.25.3700: 技SE(社長指示・プレイヤー近似流用)
    }
  } else if (st === 'downslash') {
    const fx0 = uri.aiFromX ?? ucx, fy0 = uri.aiFromY ?? ucy, tx0 = uri.aiTargetX ?? ucx, ty0 = uri.aiTargetY ?? ucy;
    const pr = Math.max(player.width, player.height) / 2;
    let countered = false;
    if (distToBandRect({ x: pcx, y: pcy }, { x: fx0, y: fy0 }, { x: tx0, y: ty0 }, UR_T.downslash.halfWidth) <= pr) {
      const cp = useGameStore.getState().player;
      if (isCounterActive(cp, Date.now())) { uriCounterHit(pcx, pcy); countered = true; /* v0.25.3128(案A): カウンター成立で**技を中断**。判定が出続ける技は毎フレーム範囲内を見るので、止めない限り窓の間ずっと成立し続けていた(旧 countered は「今フレームは硬直へ進めない」だけだった)。 */ patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, uri); }
      else {
        const died = useGameStore.getState().damagePlayer(uri.damage, `${enemyDeathLabel(uri.type)}の振り下ろし`, pcx, pcy, undefined, undefined, 'uri-downslash'); // G4a計測タグ(記録専用)
        if (died) onPlayerDeath(pcx, pcy);
      }
    }
    if (!countered && newGameTime >= (uri.bossStateUntil ?? 0)) {
      patch.bossState = 'downslash-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(UR_T.downslash.recover, (uri.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'downslash-recover') {
    const { overlap, counterActive } = bodyOverlapNow(uri);
    if (overlap && counterActive) {
      uriCounterHit(ucx, ucy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, uri);
    } else if (newGameTime >= (uri.bossStateUntil ?? 0)) {
      patch.bossState = 'chase'; patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, uri);
    }
  } else if (st === 'thrust-windup') {
    const { overlap, counterActive } = bodyOverlapNow(uri);
    if (overlap && counterActive) {
      uriCounterHit(ucx, ucy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, uri);
    } else if (newGameTime >= (uri.bossStateUntil ?? 0)) {
      patch.bossState = 'thrust'; patch.bossStateUntil = newGameTime + UR_T.thrust.moveMs + UR_T.thrust.strikeMs;
      patch.aiStartedAt = newGameTime;
      sfx.thrust(); // v0.25.3700: 技SE(社長指示・プレイヤー近似流用)
    }
  } else if (st === 'thrust') {
    const fx0 = uri.aiFromX ?? ucx, fy0 = uri.aiFromY ?? ucy, tx0 = uri.aiTargetX ?? ucx, ty0 = uri.aiTargetY ?? ucy;
    // ★v0.25.3197(社長指示「ウリの突進もミゲル同様にカウンターしても事故るので、ノックバックさせて」):
    // ミゲル dashCountered と同型。①中断 ②来た方向へ弾き返す(プレイヤー中心から突進方向の逆へ150px)
    // ③アリーナ内クランプ。
    const thrustCountered = (hx: number, hy: number): void => {
      uriCounterHit(hx, hy);
      let bdx = tx0 - fx0, bdy = ty0 - fy0;
      const bl = Math.hypot(bdx, bdy) || 1; bdx /= bl; bdy /= bl;
      const pushed = clampArena(pcx - bdx * AN_C.dashCounterPushbackPx, pcy - bdy * AN_C.dashCounterPushbackPx);
      patch.x = pushed.x - uri.width / 2; patch.y = pushed.y - uri.height / 2;
      patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, uri);
    };
    // ★突進の通過中もカウンターを取れる(ミゲルv0.25.3195と同じ「素通り」対策)。
    {
      const { overlap, counterActive } = bodyOverlapNow(uri);
      if (overlap && counterActive) {
        thrustCountered(ucx, ucy);
        applyPatch(uri.id, patch);
        return;
      }
    }
    const elapsed = newGameTime - (uri.aiStartedAt ?? newGameTime);
    const moveT = Math.max(0, Math.min(1, elapsed / UR_T.thrust.moveMs));
    const nx = fx0 + (tx0 - fx0) * moveT, ny = fy0 + (ty0 - fy0) * moveT;
    patch.x = nx - uri.width / 2; patch.y = ny - uri.height / 2;
    let countered = false;
    if (elapsed >= UR_T.thrust.moveMs) {
      let dirx = tx0 - fx0, diry = ty0 - fy0; const dl = Math.hypot(dirx, diry) || 1; dirx /= dl; diry /= dl;
      const sx = nx, sy = ny, ex = nx + dirx * UR_T.thrust.range, ey = ny + diry * UR_T.thrust.range;
      const pr = Math.max(player.width, player.height) / 2;
      if (distToBandRect({ x: pcx, y: pcy }, { x: sx, y: sy }, { x: ex, y: ey }, UR_T.thrust.halfWidth) <= pr) {
        const cp = useGameStore.getState().player;
        if (isCounterActive(cp, Date.now())) {
          thrustCountered((sx + ex) / 2, (sy + ey) / 2); countered = true;
        }
        else {
          const died = useGameStore.getState().damagePlayer(uri.damage, `${enemyDeathLabel(uri.type)}の踏み込み突き`, pcx, pcy, undefined, undefined, 'uri-thrust'); // G4a計測タグ(記録専用)
          if (died) onPlayerDeath(pcx, pcy);
        }
      }
    }
    if (!countered && newGameTime >= (uri.bossStateUntil ?? 0)) {
      patch.bossState = 'thrust-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(UR_T.thrust.recover, (uri.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'thrust-recover') {
    const { overlap, counterActive } = bodyOverlapNow(uri);
    if (overlap && counterActive) {
      uriCounterHit(ucx, ucy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, uri);
    } else if (newGameTime >= (uri.bossStateUntil ?? 0)) {
      patch.bossState = 'chase'; patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, uri);
    }
  } else if (st === 'bolt-windup') {
    const { overlap, counterActive } = bodyOverlapNow(uri);
    if (overlap && counterActive) {
      uriCounterHit(ucx, ucy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, uri);
    } else if (newGameTime >= (uri.bossStateUntil ?? 0)) {
      patch.bossState = 'bolt'; patch.bossStateUntil = newGameTime + AN_C.burst.shots * AN_C.burst.gapMs;
      s.uri.nextShotAt = newGameTime; s.uri.shots = 0;
    }
  } else if (st === 'bolt') {
    if (s.uri.shots < AN_C.burst.shots && newGameTime >= s.uri.nextShotAt) {
      const aim = uriLockedAim();
      useGameStore.getState().addProjectile(createEnemyProjectile(uri, player, aim.x, aim.y));
      sfx.shot(); // v0.25.3700: 技SE(社長指示・プレイヤー近似流用)
      s.uri.shots += 1; s.uri.nextShotAt = newGameTime + AN_C.burst.gapMs;
    }
    if (newGameTime >= (uri.bossStateUntil ?? 0)) {
      patch.bossState = 'bolt-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(UR_T.bolt.recover, (uri.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'bolt-recover') {
    const { overlap, counterActive } = bodyOverlapNow(uri);
    if (overlap && counterActive) {
      uriCounterHit(ucx, ucy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, uri);
    } else if (newGameTime >= (uri.bossStateUntil ?? 0)) {
      patch.bossState = 'chase'; patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, uri);
    }
  } else {
    patch.bossState = 'chase'; patch.bossNextActionAt = newGameTime + AN_C.stunNextActionMs;
  }

  applyPatch(uri.id, patch);
};

// ============================================================================================
// --- スリィエル(§6.28-18 バッチM62・新規) ----------------------------------------------------
// ============================================================================================
const surielHoverPoint = (scx: number, scy: number): { x: number; y: number } =>
  ({ x: scx + SR_T.ring.hoverOffsetX, y: scy + SR_T.ring.hoverOffsetY });

const surielRingDeployed = (ringX: number | undefined, ringY: number | undefined, scx: number, scy: number): boolean => {
  if (ringX === undefined || ringY === undefined) return false;
  const hp = surielHoverPoint(scx, scy);
  return Math.hypot(ringX - hp.x, ringY - hp.y) > SR_T.ring.deployThreshold;
};

export const runSurielTick = (
  suriel: Enemy, s: AngelBossState, newGameTime: number, deltaTime: number, moveSpeedMult: number,
  sfx: AngelSfx, onPlayerDeath: (x: number, y: number) => void,
): void => {
  void s;
  const store = useGameStore.getState();
  const player = store.player;
  const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
  const scx = suriel.x + suriel.width / 2, scy = suriel.y + suriel.height / 2;
  const bossMoveDt = deltaTime * moveSpeedMult;
  const sHomeX = suriel.homeX ?? scx, sHomeY = suriel.homeY ?? scy;
  const maxR = GATE_ARENA_RADIUS - MIGUEL_ORBIT_MARGIN - suriel.height / 2;
  const st = suriel.bossState ?? 'chase';
  const patch: Partial<Enemy> = {};

  const healthFrac = suriel.maxHealth > 0 ? suriel.health / suriel.maxHealth : 1;
  const phase = phaseForHealth(healthFrac, [SURIEL_PHASE_HP_THRESHOLD]) as 1 | 2;
  patch.bossPhase = phase;
  patch.bossPhaseFlashUntil = phaseJustChanged(suriel.bossPhase, phase) ? newGameTime + ANGEL_PHASE_FLASH_MS : suriel.bossPhaseFlashUntil;

  const clampArena = (nx: number, ny: number): { x: number; y: number } => {
    const dx = nx - sHomeX, dy = ny - sHomeY;
    const dl = Math.hypot(dx, dy);
    if (dl > maxR) return { x: sHomeX + (dx / dl) * maxR, y: sHomeY + (dy / dl) * maxR };
    return { x: nx, y: ny };
  };
  const chaseMove = (rawSpd: number): void => {
    // ボスのクリ半減(社長指示v0.25.2422)。呼び出し側(<boss>.speed)を書き換えず、
    // **移動の入口1箇所**で掛ける=全ての chaseMove 呼び出しに漏れなく効く。
    const spd = rawSpd * bossSlowMult(suriel, newGameTime);
    const dx = pcx - scx, dy = pcy - scy;
    const dl = Math.hypot(dx, dy) || 1;
    const c = clampArena(scx + (dx / dl) * spd * bossMoveDt, scy + (dy / dl) * spd * bossMoveDt);
    patch.x = c.x - suriel.width / 2; patch.y = c.y - suriel.height / 2;
  };
  const surielCounterHit = (hx: number, hy: number, ghost?: GhostCounterFire): void => angelCounterHit(suriel, scx, hx, hy, sfx, ghost);

  // --- 技の開始(begin*)。実戦の抽選(下のchase分岐)と ボスメーカーの▸個別再生が**同じ1本**を通る ---
  // 環の射出だけは「いまの環の位置」を起点に取るので、chase側で計算済みの待機点を渡す
  // (▸から直接始めた時は現在位置=同じ意味)。
  const beginSurielRingshot = (hoverX: number, hoverY: number): void => {
    patch.bossState = 'ring-move-windup'; patch.bossStateUntil = newGameTime + SR_T.ringshot.moveMs;
    patch.aiFromX = suriel.ringX ?? hoverX; patch.aiFromY = suriel.ringY ?? hoverY;
    // BOT_AND_GHOST.md §2.8 G2.5: 狙いロック(pcx/pcyの代わりにヘイト対象の中心)。
    const ringshotAim = resolveBossHateAim(suriel, { x: pcx, y: pcy }, store.summons, newGameTime);
    patch.aiTargetX = 2 * ringshotAim.x - scx; patch.aiTargetY = 2 * ringshotAim.y - scy; // 対象の反対側=挟む
    patch.aiStartedAt = newGameTime; patch.hateTarget = ringshotAim.side;
  };
  const beginSurielRingspin = (): void => {
    patch.bossState = 'ring-spin-windup'; patch.bossStateUntil = newGameTime + SR_T.ringspin.windup;
  };
  const beginSurielSweep = (): void => {
    patch.bossState = 'sweep-windup'; patch.bossStateUntil = newGameTime + SR_T.sweep.windup;
    // BOT_AND_GHOST.md §2.8 G2.5: 狙いロック(pcx/pcyの代わりにヘイト対象の中心)。
    const sweepAim = resolveBossHateAim(suriel, { x: pcx, y: pcy }, store.summons, newGameTime);
    patch.hateTarget = sweepAim.side;
    const ddl = Math.hypot(sweepAim.x - scx, sweepAim.y - scy) || 1; const dirx = (sweepAim.x - scx) / ddl, diry = (sweepAim.y - scy) / ddl;
    patch.aiFromX = scx; patch.aiFromY = scy;
    patch.aiTargetX = scx + dirx * SR_T.sweep.range; patch.aiTargetY = scy + diry * SR_T.sweep.range;
  };
  const beginSurielGaze = (): void => {
    s.suriel.gazeShots = 1; // ★v0.25.3590: 10連射の1発目
    patch.bossState = 'gaze-windup'; patch.bossStateUntil = newGameTime + SR_T.gaze.windup;
    const gazeAim = resolveBossHateAim(suriel, { x: pcx, y: pcy }, store.summons, newGameTime);
    patch.aiTargetX = gazeAim.x; patch.aiTargetY = gazeAim.y; patch.hateTarget = gazeAim.side;
  };
  /** 選ばれた技を始める(予告SEは全技共通=旧実装のとおり分岐の手前で1回)。 */
  const startSurielMove = (k: AngelMoveKey): void => {
    sfx.alert();
    const hp0 = surielHoverPoint(scx, scy);
    if (k === 'sr-ringshot') beginSurielRingshot(hp0.x, hp0.y);
    else if (k === 'sr-ringspin') beginSurielRingspin();
    else if (k === 'sr-sweep') beginSurielSweep();
    else beginSurielGaze();
  };

  const deployed = surielRingDeployed(suriel.ringX, suriel.ringY, scx, scy);

  const surielFull = suriel.bossFullStunUntil !== undefined && newGameTime < suriel.bossFullStunUntil;
  let sGhostFire: GhostCounterFire | null = null;
  if (surielFull) {
    patch.bossState = 'chase'; patch.bossNextActionAt = newGameTime + AN_C.stunNextActionMs;
  } else if ((sGhostFire = takeGhostAngelCounter(suriel)) !== null) {
    // v0.25.2480: 守護霊カウンター成立(効果=プレイヤー成立の各州分岐と同一のchase復帰)。
    surielCounterHit(scx, scy, sGhostFire);
    patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, suriel);
  } else if (takeAngelPlay(suriel, 'suriel', startSurielMove)) {
    // ボスメーカー ▸(通常プレイでは要求箱が常に null なのでここへは来ない)。
  } else if (st === 'chase') {
    chaseMove(suriel.speed);
    // 環を頭上へ戻す(未展開の間・展開中は次の技が動かすまでそのまま=「離れている間だけ使う」判定の土台)。
    const hp = surielHoverPoint(scx, scy);
    const rx = suriel.ringX ?? hp.x, ry = suriel.ringY ?? hp.y;
    const rdx = hp.x - rx, rdy = hp.y - ry; const rdl = Math.hypot(rdx, rdy);
    if (rdl > 1) {
      const step = Math.min(rdl, SR_T.ring.returnSpeed * bossMoveDt);
      patch.ringX = rx + (rdx / rdl) * step; patch.ringY = ry + (rdy / rdl) * step;
    } else {
      patch.ringX = hp.x; patch.ringY = hp.y;
    }
    if (newGameTime >= (suriel.bossNextActionAt ?? 0)) {
      const dist = Math.hypot(pcx - scx, pcy - scy);
      const scripted = chooseScriptMove(suriel, 'suriel', phase, () => pickSurielMove(dist, deployed));
      const move = scripted.move;
      patch.bossScriptQueue = scripted.remaining;
      if (move) {
        startSurielMove(
          move === 'ringshot' ? 'sr-ringshot'
            : move === 'ringspin' ? 'sr-ringspin'
              : move === 'sweep' ? 'sr-sweep' : 'sr-gaze',
        );
      }
    }
  } else if (st === 'ring-move-windup') {
    const { overlap, counterActive } = bodyOverlapNow(suriel);
    if (overlap && counterActive) {
      surielCounterHit(scx, scy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, suriel);
    } else {
      const fx0 = suriel.aiFromX ?? scx, fy0 = suriel.aiFromY ?? scy, tx0 = suriel.aiTargetX ?? scx, ty0 = suriel.aiTargetY ?? scy;
      const elapsed = newGameTime - (suriel.aiStartedAt ?? newGameTime);
      const t = Math.max(0, Math.min(1, elapsed / SR_T.ringshot.moveMs));
      patch.ringX = fx0 + (tx0 - fx0) * t; patch.ringY = fy0 + (ty0 - fy0) * t;
      // v0.25.3200(社長指示「後半武器が2つに増えるのであれば、レーザーも2つに増えて。配置を
      // それぞれ別の場所から狙ってくる感じ」): Phase2は2本目の環を**狙い点の周りへ90°回した別の場所**へ
      // 同時展開する(1本目=対象の反対側/2本目=横合い=別角度から挟む)。展開先は
      // 「到達点=2×狙い−本体中心」の逆算で毎tick決まる(本体はringshot中静止=値は安定)。
      if (surielRingCount(phase) === 2) {
        const aimx = (tx0 + scx) / 2, aimy = (ty0 + scy) / 2;
        const rvx = tx0 - aimx, rvy = ty0 - aimy;
        const r2tx = aimx - rvy, r2ty = aimy + rvx; // 狙い点まわり+90°
        patch.ring2X = fx0 + (r2tx - fx0) * t; patch.ring2Y = fy0 + (r2ty - fy0) * t;
      }
      if (elapsed >= SR_T.ringshot.moveMs) {
        patch.bossState = 'ring-beam-windup';
        patch.bossStateUntil = newGameTime + SR_T.ringshot.beamWindup;
        patch.aiFromX = tx0; patch.aiFromY = ty0; // 環の到達点=ビームの起点
        // ロック(掟W4)。BOT_AND_GHOST.md §2.8 G2.5: pcx/pcyの代わりにヘイト対象の中心。
        const beamAim = resolveBossHateAim(suriel, { x: pcx, y: pcy }, store.summons, newGameTime);
        patch.aiTargetX = beamAim.x; patch.aiTargetY = beamAim.y; patch.hateTarget = beamAim.side;
      }
    }
  } else if (st === 'ring-beam-windup') {
    const { overlap, counterActive } = bodyOverlapNow(suriel);
    if (overlap && counterActive) {
      surielCounterHit(scx, scy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, suriel);
    } else if (newGameTime >= (suriel.bossStateUntil ?? 0)) {
      patch.bossState = 'ring-active'; patch.bossStateUntil = newGameTime + SR_T.ringshot.active;
      sfx.beam(); // v0.25.3700: 技SE(社長指示・プレイヤー近似流用)
    }
  } else if (st === 'ring-active') {
    const fx0 = suriel.aiFromX ?? scx, fy0 = suriel.aiFromY ?? scy, tx0 = suriel.aiTargetX ?? scx, ty0 = suriel.aiTargetY ?? scy;
    let dirx = tx0 - fx0, diry = ty0 - fy0; const dl = Math.hypot(dirx, diry) || 1; dirx /= dl; diry /= dl;
    const ex = fx0 + dirx * SR_T.beam.range, ey = fy0 + diry * SR_T.beam.range;
    const pr = Math.max(player.width, player.height) / 2;
    let countered = false;
    if (distToSegment({ x: pcx, y: pcy }, { x: fx0, y: fy0 }, { x: ex, y: ey }) <= SR_T.beam.halfWidth + pr) {
      const cp = useGameStore.getState().player;
      if (isCounterActive(cp, Date.now())) { surielCounterHit(pcx, pcy); countered = true; /* v0.25.3128(案A): カウンター成立で**技を中断**。判定が出続ける技は毎フレーム範囲内を見るので、止めない限り窓の間ずっと成立し続けていた(旧 countered は「今フレームは硬直へ進めない」だけだった)。 */ patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, suriel); }
      else {
        const died = useGameStore.getState().damagePlayer(suriel.damage, `${enemyDeathLabel(suriel.type)}の環の射出`, pcx, pcy, undefined, undefined, 'suriel-ring'); // G4a計測タグ(記録専用)
        if (died) onPlayerDeath(pcx, pcy);
      }
    }
    // v0.25.3200: Phase2の2本目のビーム(2本目の環→同じロック対象)。判定・威力・カウンターとも1本目と同一。
    // 二重ヒットは被弾i-frameが吸収する(1本目と同じ経路)。
    if (!countered && suriel.ring2X !== undefined && suriel.ring2Y !== undefined) {
      const f2x = suriel.ring2X, f2y = suriel.ring2Y;
      let d2x = tx0 - f2x, d2y = ty0 - f2y; const dl2 = Math.hypot(d2x, d2y) || 1; d2x /= dl2; d2y /= dl2;
      const e2x = f2x + d2x * SR_T.beam.range, e2y = f2y + d2y * SR_T.beam.range;
      if (distToSegment({ x: pcx, y: pcy }, { x: f2x, y: f2y }, { x: e2x, y: e2y }) <= SR_T.beam.halfWidth + pr) {
        const cp2 = useGameStore.getState().player;
        if (isCounterActive(cp2, Date.now())) {
          surielCounterHit(pcx, pcy); countered = true;
          patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, suriel);
        } else {
          const died = useGameStore.getState().damagePlayer(suriel.damage, `${enemyDeathLabel(suriel.type)}の環の射出`, pcx, pcy, undefined, undefined, 'suriel-ring'); // G4a計測タグ(記録専用)
          if (died) onPlayerDeath(pcx, pcy);
        }
      }
    }
    if (!countered && newGameTime >= (suriel.bossStateUntil ?? 0)) {
      patch.bossState = 'ring-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(SR_T.ringshot.recover, (suriel.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'ring-recover') {
    const { overlap, counterActive } = bodyOverlapNow(suriel);
    if (overlap && counterActive) {
      surielCounterHit(scx, scy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, suriel);
    } else if (newGameTime >= (suriel.bossStateUntil ?? 0)) {
      patch.bossState = 'chase'; patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, suriel);
    }
  } else if (st === 'ring-spin-windup') {
    const { overlap, counterActive } = bodyOverlapNow(suriel);
    if (overlap && counterActive) {
      surielCounterHit(scx, scy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, suriel);
    } else if (newGameTime >= (suriel.bossStateUntil ?? 0)) {
      patch.bossState = 'ring-spin'; patch.bossStateUntil = newGameTime + SR_T.ringspin.active; patch.aiStartedAt = newGameTime;
      sfx.shot(); // v0.25.3700: 技SE(社長指示・プレイヤー近似流用)
    }
    patch.ringX = scx; patch.ringY = scy; // 回転斬りの前に環を本体へ引き寄せる(近接拒否の絵)
  } else if (st === 'ring-spin') {
    const spinT = (newGameTime - (suriel.aiStartedAt ?? newGameTime)) / 120;
    patch.ringX = scx + Math.cos(spinT) * SR_T.ringspin.radius;
    patch.ringY = scy + Math.sin(spinT) * SR_T.ringspin.radius;
    const pr = Math.max(player.width, player.height) / 2;
    let countered = false;
    if (Math.hypot(pcx - scx, pcy - scy) <= SR_T.ringspin.radius + pr) {
      const cp = useGameStore.getState().player;
      if (isCounterActive(cp, Date.now())) { surielCounterHit(pcx, pcy); countered = true; /* v0.25.3128(案A): カウンター成立で**技を中断**。判定が出続ける技は毎フレーム範囲内を見るので、止めない限り窓の間ずっと成立し続けていた(旧 countered は「今フレームは硬直へ進めない」だけだった)。 */ patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, suriel); }
      else {
        const died = useGameStore.getState().damagePlayer(suriel.damage, `${enemyDeathLabel(suriel.type)}の環の回転斬`, pcx, pcy, undefined, undefined, 'suriel-ring'); // G4a計測タグ(記録専用・回転斬も環=1つの技)
        if (died) onPlayerDeath(pcx, pcy);
      }
    }
    if (!countered && newGameTime >= (suriel.bossStateUntil ?? 0)) {
      patch.bossState = 'ring-spin-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(SR_T.ringspin.recover, (suriel.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'ring-spin-recover') {
    const { overlap, counterActive } = bodyOverlapNow(suriel);
    if (overlap && counterActive) {
      surielCounterHit(scx, scy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, suriel);
    } else if (newGameTime >= (suriel.bossStateUntil ?? 0)) {
      patch.bossState = 'chase'; patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, suriel);
    }
  } else if (st === 'sweep-windup') {
    const { overlap, counterActive } = bodyOverlapNow(suriel);
    if (overlap && counterActive) {
      surielCounterHit(scx, scy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, suriel);
    } else if (newGameTime >= (suriel.bossStateUntil ?? 0)) {
      patch.bossState = 'sweep'; patch.bossStateUntil = newGameTime + SR_T.sweep.active;
      sfx.sweep(); // v0.25.3700: 技SE(社長指示・プレイヤー近似流用)
    }
  } else if (st === 'sweep') {
    const fx0 = suriel.aiFromX ?? scx, fy0 = suriel.aiFromY ?? scy, tx0 = suriel.aiTargetX ?? scx, ty0 = suriel.aiTargetY ?? scy;
    const pr = Math.max(player.width, player.height) / 2;
    let countered = false;
    if (distToBandRect({ x: pcx, y: pcy }, { x: fx0, y: fy0 }, { x: tx0, y: ty0 }, SR_T.sweep.halfWidth) <= pr) {
      const cp = useGameStore.getState().player;
      if (isCounterActive(cp, Date.now())) { surielCounterHit(pcx, pcy); countered = true; /* v0.25.3128(案A): カウンター成立で**技を中断**。判定が出続ける技は毎フレーム範囲内を見るので、止めない限り窓の間ずっと成立し続けていた(旧 countered は「今フレームは硬直へ進めない」だけだった)。 */ patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, suriel); }
      else {
        const died = useGameStore.getState().damagePlayer(suriel.damage, `${enemyDeathLabel(suriel.type)}の本体の薙ぎ`, pcx, pcy, undefined, undefined, 'suriel-sweep'); // G4a計測タグ(記録専用)
        if (died) onPlayerDeath(pcx, pcy);
      }
    }
    if (!countered && newGameTime >= (suriel.bossStateUntil ?? 0)) {
      patch.bossState = 'sweep-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(SR_T.sweep.recover, (suriel.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'sweep-recover') {
    const { overlap, counterActive } = bodyOverlapNow(suriel);
    if (overlap && counterActive) {
      surielCounterHit(scx, scy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, suriel);
    } else if (newGameTime >= (suriel.bossStateUntil ?? 0)) {
      patch.bossState = 'chase'; patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, suriel);
    }
  } else if (st === 'gaze-windup') {
    const { overlap, counterActive } = bodyOverlapNow(suriel);
    if (overlap && counterActive) {
      surielCounterHit(scx, scy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, suriel);
    } else if (newGameTime >= (suriel.bossStateUntil ?? 0)) {
      useGameStore.getState().addProjectile(createEnemyProjectile(suriel, player, suriel.aiTargetX, suriel.aiTargetY));
      sfx.beam(); // v0.25.3700: 技SE(社長指示・プレイヤー近似流用)
      // ★v0.25.3590(10連射): 発間はraw(100ms)=choreographyRecoverMsの休符floorを通さない。
      // 締めの隙は最終発の後だけ従来どおりfloorつき(パニッシュ窓の憲法を保つ)。
      const isLastShot = s.suriel.gazeShots >= SR_T.gaze.count;
      patch.bossState = 'gaze-recover';
      patch.bossStateUntil = newGameTime + (isLastShot
        ? choreographyRecoverMs(SR_T.gaze.recover, (suriel.bossScriptQueue?.length ?? 0) > 0)
        : SR_T.gaze.recover);
    }
  } else if (st === 'gaze-recover') {
    const { overlap, counterActive } = bodyOverlapNow(suriel);
    if (overlap && counterActive) {
      surielCounterHit(scx, scy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, suriel);
    } else if (newGameTime >= (suriel.bossStateUntil ?? 0)) {
      // ★v0.25.3590(社長指示「10連射に変更」): recover(100ms=発間)明けに、count発まで狙い直して
      // 次のwindupへ(gaze-recover→gaze-windup=同一技の段階遷移なのでキャンセル監視の正規形)。
      if (s.suriel.gazeShots < SR_T.gaze.count) {
        s.suriel.gazeShots += 1;
        const gazeAim = resolveBossHateAim(suriel, { x: pcx, y: pcy }, store.summons, newGameTime);
        patch.aiTargetX = gazeAim.x; patch.aiTargetY = gazeAim.y; patch.hateTarget = gazeAim.side;
        patch.bossState = 'gaze-windup'; patch.bossStateUntil = newGameTime + SR_T.gaze.windup;
      } else {
        patch.bossState = 'chase'; patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, suriel);
      }
    }
  } else {
    patch.bossState = 'chase'; patch.bossNextActionAt = newGameTime + AN_C.stunNextActionMs;
    const hp = surielHoverPoint(scx, scy); patch.ringX = hp.x; patch.ringY = hp.y;
  }

  // §6.28-18 Phase2「環が2つ」: 平時の2本目は1本目に追従する環。
  // v0.25.3200(社長指示): ringshot中は追従させない——2本目は独立した展開位置へ飛び、そこから
  // **2本目のビーム**を撃つ(展開/判定は上のringshot各州が書く)。技が終わったら高速で1本目の横へ帰投する
  // (瞬間移動だと「消えて湧いた」に見えるため。既に横に居る平時は従来どおり毎tick即位置=挙動不変)。
  {
    const inRingshot = st === 'ring-move-windup' || st === 'ring-beam-windup' || st === 'ring-active' || st === 'ring-recover'
      || patch.bossState === 'ring-move-windup';
    if (surielRingCount(phase) === 2) {
      if (!inRingshot) {
        const r1x = patch.ringX ?? suriel.ringX ?? scx, r1y = patch.ringY ?? suriel.ringY ?? scy;
        let dx = r1x - scx, dy = r1y - scy; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
        const t2x = r1x + (-dy) * SR_T.ring.ring2OffsetPx, t2y = r1y + dx * SR_T.ring.ring2OffsetPx;
        const c2x = suriel.ring2X ?? t2x, c2y = suriel.ring2Y ?? t2y;
        const dd2 = Math.hypot(t2x - c2x, t2y - c2y);
        const step2 = SR_T.ring.returnSpeed * 2 * bossMoveDt;
        if (dd2 > Math.max(step2, 1)) {
          patch.ring2X = c2x + ((t2x - c2x) / dd2) * step2;
          patch.ring2Y = c2y + ((t2y - c2y) / dd2) * step2;
        } else {
          patch.ring2X = t2x; patch.ring2Y = t2y;
        }
      }
    } else if (suriel.ring2X !== undefined || suriel.ring2Y !== undefined) {
      patch.ring2X = undefined; patch.ring2Y = undefined;
    }
  }

  applyPatch(suriel.id, patch);
};

// ============================================================================================
// --- アクラシエル(§6.28-19 バッチM63・新規) ---------------------------------------------------
// ============================================================================================
export const runAcrasielTick = (
  acrasiel: Enemy, s: AngelBossState, newGameTime: number, deltaTime: number, moveSpeedMult: number,
  sfx: AngelSfx, onPlayerDeath: (x: number, y: number) => void,
): void => {
  void s; void deltaTime; void moveSpeedMult; // 動かない(speed:0・脚が無い)。転移だけが唯一の移動手段。
  const store = useGameStore.getState();
  const player = store.player;
  const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
  const acx = acrasiel.x + acrasiel.width / 2, acy = acrasiel.y + acrasiel.height / 2;
  const aHomeX = acrasiel.homeX ?? acx, aHomeY = acrasiel.homeY ?? acy;
  const maxR = GATE_ARENA_RADIUS - MIGUEL_ORBIT_MARGIN - acrasiel.height / 2;
  const st = acrasiel.bossState ?? 'chase';
  const patch: Partial<Enemy> = {};

  const healthFrac = acrasiel.maxHealth > 0 ? acrasiel.health / acrasiel.maxHealth : 1;
  const phase = acrasielPhaseForHealth(healthFrac);
  patch.bossPhase = phase;
  patch.bossPhaseFlashUntil = phaseJustChanged(acrasiel.bossPhase, phase) ? newGameTime + ANGEL_PHASE_FLASH_MS : acrasiel.bossPhaseFlashUntil;

  const acrasielCounterHit = (hx: number, hy: number, ghost?: GhostCounterFire): void => angelCounterHit(acrasiel, acx, hx, hy, sfx, ghost);

  // --- 技の開始(begin*)。実戦の抽選(下のchase分岐)と ボスメーカーの▸個別再生が**同じ1本**を通る ---
  const beginAcrasielSpike = (): void => {
    patch.bossState = 'spike-windup'; patch.bossStateUntil = newGameTime + AC_T.spike.windup;
    patch.spikeGapMask = pickSpikeGapMask(acrasielSpikeGapCount(phase));
  };
  const beginAcrasielSpear = (): void => {
    patch.bossState = 'spear-windup'; patch.bossStateUntil = newGameTime + AC_T.spear.windup;
  };
  const beginAcrasielWarp = (): void => {
    patch.bossState = 'warp-out'; patch.bossStateUntil = newGameTime + AC_T.warp.windup;
  };
  const beginAcrasielBurst = (): void => {
    patch.bossState = 'burst-windup'; patch.bossStateUntil = newGameTime + AC_T.burst.windup;
  };
  const beginAcrasielGaze = (): void => {
    patch.bossState = 'gaze-windup'; patch.bossStateUntil = newGameTime + AC_T.gaze.windup;
    // ロック(掟W4)。BOT_AND_GHOST.md §2.8 G2.5: pcx/pcyの代わりにヘイト対象の中心。
    const gazeAim = resolveBossHateAim(acrasiel, { x: pcx, y: pcy }, store.summons, newGameTime);
    patch.aiTargetX = gazeAim.x; patch.aiTargetY = gazeAim.y; patch.hateTarget = gazeAim.side;
  };
  /** 選ばれた技を始める(予告SEは全技共通=旧実装のとおり分岐の手前で1回)。 */
  const startAcrasielMove = (k: AngelMoveKey): void => {
    sfx.alert();
    if (k === 'ac-spike') beginAcrasielSpike();
    else if (k === 'ac-spear') beginAcrasielSpear();
    else if (k === 'ac-warp') beginAcrasielWarp();
    else if (k === 'ac-burst') beginAcrasielBurst();
    else beginAcrasielGaze();
  };

  const acrasielFull = acrasiel.bossFullStunUntil !== undefined && newGameTime < acrasiel.bossFullStunUntil;
  let aGhostFire: GhostCounterFire | null = null;
  if (acrasielFull) {
    patch.bossState = 'chase'; patch.bossNextActionAt = newGameTime + AN_C.stunNextActionMs;
  } else if ((aGhostFire = takeGhostAngelCounter(acrasiel)) !== null) {
    // v0.25.2480: 守護霊カウンター成立(効果=プレイヤー成立の各州分岐と同一のchase復帰。
    // 'warp-out'はプレイヤー可だが語尾判定に載らない=請求が積まれず対象外・報告済みの狭い側)。
    acrasielCounterHit(acx, acy, aGhostFire);
    patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, acrasiel);
  } else if (takeAngelPlay(acrasiel, 'acrasiel', startAcrasielMove)) {
    // ボスメーカー ▸(通常プレイでは要求箱が常に null なのでここへは来ない)。
  } else if (st === 'chase') {
    // 動かない(speed:0)。技の抽選のみ行う。
    if (newGameTime >= (acrasiel.bossNextActionAt ?? 0)) {
      const distance = Math.hypot(pcx - acx, pcy - acy);
      const scripted = chooseScriptMove(acrasiel, 'acrasiel', phase, () => pickAcrasielMove(distance, phase));
      const move = scripted.move;
      patch.bossScriptQueue = scripted.remaining;
      if (move) {
        startAcrasielMove(
          move === 'spike' ? 'ac-spike'
            : move === 'spear' ? 'ac-spear'
              : move === 'warp' ? 'ac-warp'
                : move === 'burst' ? 'ac-burst' : 'ac-gaze',
        );
      }
    }
  } else if (st === 'spike-windup') {
    const { overlap, counterActive } = bodyOverlapNow(acrasiel);
    if (overlap && counterActive) {
      acrasielCounterHit(acx, acy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, acrasiel);
    } else if (newGameTime >= (acrasiel.bossStateUntil ?? 0)) {
      patch.bossState = 'spike'; patch.bossStateUntil = newGameTime + AC_T.spike.active;
      sfx.iceBurst(); // v0.25.3700: 技SE(社長指示・プレイヤー近似流用)
    }
  } else if (st === 'spike') {
    const mask = acrasiel.spikeGapMask ?? 0;
    const pr = Math.max(player.width, player.height) / 2;
    let hit = false;
    for (let sector = 0; sector < 8; sector++) {
      if (isSpikeGapSector(mask, sector)) continue;
      const ang = sector * (Math.PI / 4);
      const ex = acx + Math.cos(ang) * AC_T.spike.range, ey = acy + Math.sin(ang) * AC_T.spike.range;
      if (distToBandRect({ x: pcx, y: pcy }, { x: acx, y: acy }, { x: ex, y: ey }, AC_T.spike.halfWidth) <= pr) { hit = true; break; }
    }
    let countered = false;
    if (hit) {
      const cp = useGameStore.getState().player;
      if (isCounterActive(cp, Date.now())) { acrasielCounterHit(pcx, pcy); countered = true; /* v0.25.3128(案A): カウンター成立で**技を中断**。判定が出続ける技は毎フレーム範囲内を見るので、止めない限り窓の間ずっと成立し続けていた(旧 countered は「今フレームは硬直へ進めない」だけだった)。 */ patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, acrasiel); }
      else {
        const died = useGameStore.getState().damagePlayer(acrasiel.damage, `${enemyDeathLabel(acrasiel.type)}の放射棘`, pcx, pcy, undefined, undefined, 'acrasiel-spike'); // G4a計測タグ(記録専用)
        if (died) onPlayerDeath(pcx, pcy);
      }
    }
    if (!countered && newGameTime >= (acrasiel.bossStateUntil ?? 0)) {
      patch.bossState = 'spike-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(AC_T.spike.recover, (acrasiel.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'spike-recover') {
    const { overlap, counterActive } = bodyOverlapNow(acrasiel);
    if (overlap && counterActive) {
      acrasielCounterHit(acx, acy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, acrasiel);
    } else if (newGameTime >= (acrasiel.bossStateUntil ?? 0)) {
      patch.bossState = 'chase'; patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, acrasiel);
    }
  } else if (st === 'spear-windup') {
    const { overlap, counterActive } = bodyOverlapNow(acrasiel);
    if (overlap && counterActive) {
      acrasielCounterHit(acx, acy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, acrasiel);
    } else if (newGameTime >= (acrasiel.bossStateUntil ?? 0)) {
      for (let i = 0; i < AC_T.spear.count; i++) {
        const ang = (Math.PI * 2 / AC_T.spear.count) * i;
        const lx = acx + Math.cos(ang) * AC_T.spear.range, ly = acy + Math.sin(ang) * AC_T.spear.range;
        useGameStore.getState().spawnAcrasielSpear(lx, ly, ang, newGameTime, newGameTime + AC_T.spear.detonateMs, acrasiel.damage, acrasiel.id);
      }
      patch.bossState = 'spear-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(AC_T.spear.recover, (acrasiel.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'spear-recover') {
    const { overlap, counterActive } = bodyOverlapNow(acrasiel);
    if (overlap && counterActive) {
      acrasielCounterHit(acx, acy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, acrasiel);
    } else if (newGameTime >= (acrasiel.bossStateUntil ?? 0)) {
      patch.bossState = 'chase'; patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, acrasiel);
    }
  } else if (st === 'warp-out') {
    const { overlap, counterActive } = bodyOverlapNow(acrasiel);
    if (overlap && counterActive) {
      acrasielCounterHit(acx, acy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, acrasiel);
    } else if (newGameTime >= (acrasiel.bossStateUntil ?? 0)) {
      // 転移: 向きが無い(脚が無い)絵に合わせ、ホームを中心にランダムな位置へ再配置(★未決事項に記録)。
      const ang = Math.random() * Math.PI * 2;
      const dist = maxR * (0.3 + Math.random() * 0.6);
      const nx = aHomeX + Math.cos(ang) * dist, ny = aHomeY + Math.sin(ang) * dist;
      patch.x = nx - acrasiel.width / 2; patch.y = ny - acrasiel.height / 2;
      patch.aiTargetX = nx; patch.aiTargetY = ny; // T5円の中心(描画用)
      patch.bossState = 'warp-in'; patch.bossStateUntil = newGameTime + AC_T.warp.telegraphMs;
    }
  } else if (st === 'warp-in') {
    // ★v0.25.3591(監査 A-4「赤い予告が出ているのにカウンター手段が1つも無い」): 転移衝撃は
    // **赤円(impactRadius)+予告1000ms**を出しているのに、この州にはカウンター分岐が存在せず、
    // 命中もdamagePlayer直呼び=ブラストパリィすら効かなかった。**赤円の中なら予告の間ずっと返せる**
    // (着地円文法。城ボスの着地円v0.25.2601・舞妓の水鳥乱舞v0.25.3585と同型)。
    const { overlap, counterActive } = reachOverlapNow(acrasiel, st);
    if (overlap && counterActive) {
      acrasielCounterHit(acx, acy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, acrasiel);
    } else if (newGameTime >= (acrasiel.bossStateUntil ?? 0)) {
      const tx = acrasiel.aiTargetX ?? acx, ty = acrasiel.aiTargetY ?? acy;
      const pr = Math.max(player.width, player.height) / 2;
      if (Math.hypot(pcx - tx, pcy - ty) <= AC_T.warp.impactRadius + pr) {
        const died = useGameStore.getState().damagePlayer(acrasiel.damage, `${enemyDeathLabel(acrasiel.type)}の転移衝撃`, tx, ty, undefined, undefined, 'acrasiel-warp'); // G4a計測タグ(記録専用・v0.25.3607裁定)
        if (died) onPlayerDeath(tx, ty);
      }
      patch.bossState = 'warp-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(AC_T.warp.recover, (acrasiel.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'warp-recover') {
    const { overlap, counterActive } = bodyOverlapNow(acrasiel);
    if (overlap && counterActive) {
      acrasielCounterHit(acx, acy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, acrasiel);
    } else if (newGameTime >= (acrasiel.bossStateUntil ?? 0)) {
      patch.bossState = 'chase'; patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, acrasiel);
    }
  } else if (st === 'burst-windup') {
    const { overlap, counterActive } = bodyOverlapNow(acrasiel);
    if (overlap && counterActive) {
      acrasielCounterHit(acx, acy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, acrasiel);
    } else if (newGameTime >= (acrasiel.bossStateUntil ?? 0)) {
      patch.bossState = 'burst'; patch.bossStateUntil = newGameTime + AC_T.burst.active;
      sfx.shot(); // v0.25.3700: 技SE(社長指示・プレイヤー近似流用)
    }
  } else if (st === 'burst') {
    const pr = Math.max(player.width, player.height) / 2;
    let countered = false;
    if (Math.hypot(pcx - acx, pcy - acy) <= AC_T.burst.radius + pr) {
      const cp = useGameStore.getState().player;
      if (isCounterActive(cp, Date.now())) { acrasielCounterHit(pcx, pcy); countered = true; /* v0.25.3128(案A): カウンター成立で**技を中断**。判定が出続ける技は毎フレーム範囲内を見るので、止めない限り窓の間ずっと成立し続けていた(旧 countered は「今フレームは硬直へ進めない」だけだった)。 */ patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, acrasiel); }
      else {
        const died = useGameStore.getState().damagePlayer(acrasiel.damage, `${enemyDeathLabel(acrasiel.type)}の爆発`, pcx, pcy, undefined, undefined, 'acrasiel-burst'); // G4a計測タグ(記録専用)
        if (died) onPlayerDeath(pcx, pcy);
      }
    }
    if (!countered && newGameTime >= (acrasiel.bossStateUntil ?? 0)) {
      patch.bossState = 'burst-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(AC_T.burst.recover, (acrasiel.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'burst-recover') {
    const { overlap, counterActive } = bodyOverlapNow(acrasiel);
    if (overlap && counterActive) {
      acrasielCounterHit(acx, acy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, acrasiel);
    } else if (newGameTime >= (acrasiel.bossStateUntil ?? 0)) {
      patch.bossState = 'chase'; patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, acrasiel);
    }
  } else if (st === 'gaze-windup') {
    const { overlap, counterActive } = bodyOverlapNow(acrasiel);
    if (overlap && counterActive) {
      acrasielCounterHit(acx, acy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, acrasiel);
    } else if (newGameTime >= (acrasiel.bossStateUntil ?? 0)) {
      useGameStore.getState().addProjectile(createEnemyProjectile(acrasiel, player, acrasiel.aiTargetX, acrasiel.aiTargetY));
      sfx.beam(); // v0.25.3700: 技SE(社長指示・プレイヤー近似流用)
      patch.bossState = 'gaze-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(AC_T.gaze.recover, (acrasiel.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'gaze-recover') {
    const { overlap, counterActive } = bodyOverlapNow(acrasiel);
    if (overlap && counterActive) {
      acrasielCounterHit(acx, acy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, acrasiel);
    } else if (newGameTime >= (acrasiel.bossStateUntil ?? 0)) {
      patch.bossState = 'chase'; patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, acrasiel);
    }
  } else {
    patch.bossState = 'chase'; patch.bossNextActionAt = newGameTime + AN_C.stunNextActionMs;
  }

  applyPatch(acrasiel.id, patch);
};

// ============================================================================================
// --- フィル(§10・バッチ2・新規): angelBossTickの7人目 ------------------------------------------
// ============================================================================================
/** PhillMove → AngelMoveKey(ボスメーカー▸のキー)。抽選/▸再生の両方がこの1本を通る。 */
const PHILL_MOVE_TO_KEY: Readonly<Record<PhillMove, AngelMoveKey>> = {
  lightrain: 'ph-lightrain', lancefan: 'ph-lancefan', wingslash: 'ph-wingslash', wingthrust: 'ph-wingthrust',
  wingcombo: 'ph-wingcombo', summon: 'ph-summon', goldring: 'ph-goldring', judgment: 'ph-judgment',
  cage: 'ph-cage', meteor: 'ph-meteor', ringtoss: 'ph-ringtoss', dive: 'ph-dive', feathershot: 'ph-feathershot',
};

export const runPhillTick = (
  phill: Enemy, s: AngelBossState, newGameTime: number, deltaTime: number, moveSpeedMult: number,
  sfx: AngelSfx, onPlayerDeath: (x: number, y: number) => void,
): void => {
  const store = useGameStore.getState();
  const player = store.player;
  const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
  const phcx = phill.x + phill.width / 2, phcy = phill.y + phill.height / 2;
  const bossMoveDt = deltaTime * moveSpeedMult;
  const st = phill.bossState ?? 'chase';
  const patch: Partial<Enemy> = {};
  const ph = s.phill;

  const healthFrac = phill.maxHealth > 0 ? phill.health / phill.maxHealth : 1;
  const phase = phillPhaseForHealth(healthFrac);
  patch.bossPhase = phase;
  patch.bossPhaseFlashUntil = phaseJustChanged(phill.bossPhase, phase) ? newGameTime + ANGEL_PHASE_FLASH_MS : phill.bossPhaseFlashUntil;

  // §10-4「浮遊ボスだが移動はclampRectToPlayableArea経由」(バッチ1と同じ)。ゲート2ボスの
  // GATE_ARENA_RADIUS円クランプは掛けない(フィルは最奥の移動可能帯そのものが「場」・§10-14#9)。
  const chaseMove = (rawSpd: number): void => {
    const spd = rawSpd * bossSlowMult(phill, newGameTime);
    const dx = pcx - phcx, dy = pcy - phcy;
    const dl = Math.hypot(dx, dy) || 1;
    patch.x = phill.x + (dx / dl) * spd * bossMoveDt;
    patch.y = phill.y + (dy / dl) * spd * bossMoveDt;
  };
  const phillCounterHit = (hx: number, hy: number, ghost?: GhostCounterFire): void => angelCounterHit(phill, phcx, hx, hy, sfx, ghost);
  const phillHateAim = (): ResolvedHateAim => resolveBossHateAim(phill, { x: pcx, y: pcy }, store.summons, newGameTime);

  // ---- エルデの流星(技10): 誘導弾の旋回(毎フレーム・idolの誘導弾と同型。上限4発=負荷1/10) ----
  if (ph.meteorHomingIds.length > 0) {
    const live = new Set(store.projectiles.map(p => p.id));
    ph.meteorHomingIds = ph.meteorHomingIds.filter(id => live.has(id));
    if (ph.meteorHomingIds.length > 0) {
      const homingSet = new Set(ph.meteorHomingIds);
      const turnRate = (PH_T.meteor.turnRateDeg * Math.PI) / 180;
      useGameStore.setState(state => ({
        projectiles: state.projectiles.map(p => {
          if (!homingSet.has(p.id)) return p;
          const cur = Math.atan2(p.direction.y, p.direction.x);
          const want = Math.atan2(pcy - (p.y + p.height / 2), pcx - (p.x + p.width / 2));
          let d = want - cur;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          const step = Math.max(-turnRate * deltaTime, Math.min(turnRate * deltaTime, d));
          const a = cur + step;
          return { ...p, direction: { x: Math.cos(a), y: Math.sin(a) } };
        }),
      }));
    }
  }

  // --- 技の開始(begin*)。実戦の抽選(chase分岐)とボスメーカーの▸個別再生が**同じ1本**を通る ---
  const beginLightrain = (): void => {
    patch.bossState = 'phill-lightrain-windup';
    patch.bossStateUntil = newGameTime + PH_T.lightrain.windup;
    ph.lightrainReadyAt = newGameTime + PH_T.lightrain.cdMs;
    sfx.skylight(); // ★v0.25.3741: 祝福の天の光スポットライト(社長提供SE)
  };
  const beginLancefan = (): void => {
    patch.bossState = 'phill-lancefan-windup';
    patch.bossStateUntil = newGameTime + PH_T.lancefan.windup;
    patch.hateTarget = phillHateAim().side;
  };
  const lockBand = (range: number): void => {
    const aim = phillHateAim();
    patch.hateTarget = aim.side;
    const dl = Math.hypot(aim.x - phcx, aim.y - phcy) || 1;
    const dirx = (aim.x - phcx) / dl, diry = (aim.y - phcy) / dl;
    patch.aiFromX = phcx; patch.aiFromY = phcy;
    patch.aiTargetX = phcx + dirx * range; patch.aiTargetY = phcy + diry * range;
  };
  const beginWingslash = (): void => {
    patch.bossState = 'phill-wingslash-windup';
    patch.bossStateUntil = newGameTime + PH_T.wingslash.windup;
    lockBand(PH_T.wingslash.range);
  };
  const beginWingthrust = (): void => {
    patch.bossState = 'phill-wingthrust-windup';
    patch.bossStateUntil = newGameTime + PH_T.wingthrust.windup;
    lockBand(PH_T.wingthrust.range);
  };
  const beginWingcombo = (): void => {
    patch.bossState = 'phill-wingcombo-windup';
    patch.bossStateUntil = newGameTime + PH_T.wingcombo.windup;
    lockBand(PH_T.wingcombo.range);
  };
  const beginSummon = (): void => {
    patch.bossState = 'phill-summon-windup';
    patch.bossStateUntil = newGameTime + PH_T.summon.windup;
  };
  const beginGoldring = (): void => {
    patch.bossState = 'phill-goldring-windup';
    patch.bossStateUntil = newGameTime + PH_T.goldring.windup;
    ph.goldringReadyAt = newGameTime + PH_T.goldring.cdMs;
  };
  const beginJudgment = (): void => {
    // ★v0.25.3740(社長指示「裁きの光の中身を、羽根の檻に差し替え」): 発動内容=檻(cage州)へ委譲。
    // 抽選キー(ph-judgment)・技名「裁きの光」・天の光の予兆はそのまま。judgment側のCDも寝かせる
    // (同じ檻が2枠から連発しないため。cage側のCDはbeginCage内で打刻)。
    ph.judgmentReadyAt = newGameTime + PH_T.judgment.cdMs;
    beginCage();
  };
  const beginCage = (): void => {
    patch.bossState = 'phill-cage-windup';
    patch.bossStateUntil = newGameTime + PH_T.cage.trackMs;
    // §10-9「全方位から羽根の輪が閉じる(逃げ場なし)」=閉じる中心は溜め開始でロック(以後追尾しない)。
    patch.aiTargetX = pcx; patch.aiTargetY = pcy;
    ph.cageReadyAt = newGameTime + PH_T.cage.cdMs;
    sfx.skylightLow(); // ★v0.25.3741: 裁きの光(=檻)の天の光=同SEのピッチ下げ版(社長指示「少し低く」)
  };
  const beginMeteor = (): void => {
    patch.bossState = 'phill-meteor-windup';
    patch.bossStateUntil = newGameTime + PH_T.meteor.windup;
    patch.hateTarget = phillHateAim().side;
  };
  const beginRingtoss = (): void => {
    patch.bossState = 'phill-ringtoss-windup';
    patch.bossStateUntil = newGameTime + PH_T.ringtoss.windup;
    lockBand(PH_T.ringtoss.range);
  };
  const beginDive = (): void => {
    patch.bossState = 'phill-dive-windup';
    patch.bossStateUntil = newGameTime + PH_T.dive.windup;
    patch.aiTargetX = pcx; patch.aiTargetY = pcy;
    patch.hateTarget = phillHateAim().side;
  };
  const beginFeathershot = (): void => {
    patch.bossState = 'phill-feathershot-windup';
    patch.bossStateUntil = newGameTime + PH_T.feathershot.windup;
    patch.hateTarget = phillHateAim().side;
  };
  /** 選ばれた技を始める(予告SEは全技共通=hunter-alert・§10-2「天使の器をそのまま使う」)。 */
  const startPhillMove = (k: AngelMoveKey): void => {
    sfx.alert();
    if (k === 'ph-lightrain') beginLightrain();
    else if (k === 'ph-lancefan') beginLancefan();
    else if (k === 'ph-wingslash') beginWingslash();
    else if (k === 'ph-wingthrust') beginWingthrust();
    else if (k === 'ph-wingcombo') beginWingcombo();
    else if (k === 'ph-summon') beginSummon();
    else if (k === 'ph-goldring') beginGoldring();
    else if (k === 'ph-judgment') beginJudgment();
    else if (k === 'ph-cage') beginCage();
    else if (k === 'ph-meteor') beginMeteor();
    else if (k === 'ph-ringtoss') beginRingtoss();
    else if (k === 'ph-dive') beginDive();
    else beginFeathershot();
  };

  // 判定は全てpumpkinBlasts(カプセル/円)or共通赤弾or専用飛翔体レール(§10タスク項2)。
  // カウンター成立の実体はcombatTick.applyPumpkinBlastDamageの「後追い分岐」1本
  // (§10-15#2/#3: counterReachにphill州は載せない)。windup/recover中の早期カウンターだけは
  // 他の天使6体と同じbodyOverlapNow+angelCounterHitの自己完結パターンを使う。
  const pushBlast = (x: number, y: number, radius: number, damage: number, moveKey: string,
    capsule?: { fx: number; fy: number; tx: number; ty: number; halfWidth: number }): void => {
    useGameStore.setState(state => ({
      pumpkinBlasts: [...state.pumpkinBlasts, { x, y, radius, damage, enemyId: phill.id, moveKey, ...(capsule ? { capsule } : {}) }],
    }));
  };

  const phillFull = phill.bossFullStunUntil !== undefined && newGameTime < phill.bossFullStunUntil;
  let phGhostFire: GhostCounterFire | null = null;
  if (phillFull) {
    patch.bossState = 'chase'; patch.bossNextActionAt = newGameTime + AN_C.stunNextActionMs;
  } else if ((phGhostFire = takeGhostAngelCounter(phill)) !== null) {
    phillCounterHit(phcx, phcy, phGhostFire);
    patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, phill);
  } else if (takeAngelPlay(phill, 'phillboss', startPhillMove)) {
    // ボスメーカー ▸(通常プレイでは要求箱が常に null なのでここへは来ない)。
  } else if (st === 'chase') {
    chaseMove(phill.speed);
    if (newGameTime >= (phill.bossNextActionAt ?? 0)) {
      const dist = Math.hypot(pcx - phcx, pcy - phcy);
      const liveEscorts = store.enemies.filter(e => e.bountyEscortId === phill.id).length;
      const gates: PhillMoveGates = {
        lightrainReady: newGameTime >= ph.lightrainReadyAt,
        goldringReady: newGameTime >= ph.goldringReadyAt,
        judgmentReady: newGameTime >= ph.judgmentReadyAt,
        cageReady: newGameTime >= ph.cageReadyAt,
        requiredReady: phillRequiredMoveReady(phase, newGameTime, ph.requiredReadyAt),
        summonReady: liveEscorts < PHILL_SUMMON_CAP,
      };
      const scripted = chooseScriptMove(phill, 'phillboss', phase, () => pickPhillMove(dist, gates));
      const move = scripted.move;
      patch.bossScriptQueue = scripted.remaining;
      if (move) startPhillMove(PHILL_MOVE_TO_KEY[move]);
    }
  } else if (st === 'phill-lightrain-windup') {
    const { overlap, counterActive } = bodyOverlapNow(phill);
    if (overlap && counterActive) {
      phillCounterHit(phcx, phcy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, phill);
    } else if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      const queue: { x: number; y: number; at: number }[] = [];
      for (let i = 0; i < PH_T.lightrain.shotCount; i++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = Math.random() * 90;
        queue.push({ x: pcx + Math.cos(ang) * dist, y: pcy + Math.sin(ang) * dist, at: newGameTime + i * PH_T.lightrain.shotGapMs });
      }
      ph.lightrainQueue = queue;
      patch.phillLightrainQueue = queue; // pixi描画用ミラー(§10バッチ3)。挙動は不変=読み出し口を足すだけ。
      patch.bossState = 'phill-lightrain-active';
      patch.bossStateUntil = newGameTime + (PH_T.lightrain.shotCount - 1) * PH_T.lightrain.shotGapMs + 400;
    }
  } else if (st === 'phill-lightrain-active') {
    if (ph.lightrainQueue.length > 0) {
      const due = ph.lightrainQueue.filter(q => newGameTime >= q.at);
      if (due.length > 0) {
        ph.lightrainQueue = ph.lightrainQueue.filter(q => newGameTime < q.at);
        patch.phillLightrainQueue = ph.lightrainQueue; // pixi描画用ミラー(§10バッチ3)
        for (const q of due) pushBlast(q.x, q.y, PH_T.lightrain.radius, phill.damage, 'phill-lightrain');
        sfx.beam();
      }
    }
    if (ph.lightrainQueue.length === 0 && newGameTime >= (phill.bossStateUntil ?? 0)) {
      patch.bossState = 'phill-lightrain-recover';
      patch.bossStateUntil = newGameTime + choreographyRecoverMs(PH_T.lightrain.recover, (phill.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'phill-lightrain-recover') {
    const { overlap, counterActive } = bodyOverlapNow(phill);
    if (overlap && counterActive) {
      phillCounterHit(phcx, phcy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, phill);
    } else if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      patch.bossState = 'chase'; patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, phill);
    }
  } else if (st === 'phill-lancefan-windup') {
    const { overlap, counterActive } = bodyOverlapNow(phill);
    if (overlap && counterActive) {
      phillCounterHit(phcx, phcy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, phill);
    } else if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      ph.lancefanVolley = 0; ph.lancefanNextAt = newGameTime;
      patch.bossState = 'phill-lancefan-active';
      patch.bossStateUntil = newGameTime + PH_T.lancefan.volleys * PH_T.lancefan.volleyGapMs;
    }
  } else if (st === 'phill-lancefan-active') {
    if (ph.lancefanVolley < PH_T.lancefan.volleys && newGameTime >= ph.lancefanNextAt) {
      const aim = resolveBossLockedHateAim(phill, { x: pcx, y: pcy }, store.summons);
      const baseAng = Math.atan2(aim.y - phcy, aim.x - phcx);
      const n = PH_T.lancefan.shotsPerVolley;
      const spread = (PH_T.lancefan.spreadDeg * Math.PI) / 180;
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : (i / (n - 1)) - 0.5;
        const ang = baseAng + t * spread;
        useGameStore.getState().addProjectile(createEnemyProjectile(phill, player, phcx + Math.cos(ang) * 400, phcy + Math.sin(ang) * 400));
      }
      sfx.shot();
      ph.lancefanVolley += 1;
      ph.lancefanNextAt = newGameTime + PH_T.lancefan.volleyGapMs;
    }
    if (ph.lancefanVolley >= PH_T.lancefan.volleys && newGameTime >= (phill.bossStateUntil ?? 0)) {
      patch.bossState = 'phill-lancefan-recover';
      patch.bossStateUntil = newGameTime + choreographyRecoverMs(PH_T.lancefan.recover, (phill.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'phill-lancefan-recover') {
    const { overlap, counterActive } = bodyOverlapNow(phill);
    if (overlap && counterActive) {
      phillCounterHit(phcx, phcy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, phill);
    } else if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      patch.bossState = 'chase'; patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, phill);
    }
  } else if (st === 'phill-wingslash-windup') {
    const { overlap, counterActive } = bodyOverlapNow(phill);
    if (overlap && counterActive) {
      phillCounterHit(phcx, phcy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, phill);
    } else if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      const fx0 = phill.aiFromX ?? phcx, fy0 = phill.aiFromY ?? phcy, tx0 = phill.aiTargetX ?? phcx, ty0 = phill.aiTargetY ?? phcy;
      pushBlast((fx0 + tx0) / 2, (fy0 + ty0) / 2, PH_T.wingslash.halfWidth, phill.damage, 'phill-wingslash',
        { fx: fx0, fy: fy0, tx: tx0, ty: ty0, halfWidth: PH_T.wingslash.halfWidth });
      patch.bossState = 'phill-wingslash-active'; patch.bossStateUntil = newGameTime + PH_T.wingslash.active;
      sfx.sweep();
    }
  } else if (st === 'phill-wingslash-active') {
    if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      patch.bossState = 'phill-wingslash-recover';
      patch.bossStateUntil = newGameTime + choreographyRecoverMs(PH_T.wingslash.recover, (phill.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'phill-wingslash-recover') {
    const { overlap, counterActive } = bodyOverlapNow(phill);
    if (overlap && counterActive) {
      phillCounterHit(phcx, phcy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, phill);
    } else if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      patch.bossState = 'chase'; patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, phill);
    }
  } else if (st === 'phill-wingthrust-windup') {
    const { overlap, counterActive } = bodyOverlapNow(phill);
    if (overlap && counterActive) {
      phillCounterHit(phcx, phcy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, phill);
    } else if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      const fx0 = phill.aiFromX ?? phcx, fy0 = phill.aiFromY ?? phcy, tx0 = phill.aiTargetX ?? phcx, ty0 = phill.aiTargetY ?? phcy;
      pushBlast((fx0 + tx0) / 2, (fy0 + ty0) / 2, PH_T.wingthrust.halfWidth, phill.damage, 'phill-wingthrust',
        { fx: fx0, fy: fy0, tx: tx0, ty: ty0, halfWidth: PH_T.wingthrust.halfWidth });
      patch.bossState = 'phill-wingthrust-active'; patch.bossStateUntil = newGameTime + PH_T.wingthrust.active;
      sfx.thrust();
    }
  } else if (st === 'phill-wingthrust-active') {
    if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      patch.bossState = 'phill-wingthrust-recover';
      patch.bossStateUntil = newGameTime + choreographyRecoverMs(PH_T.wingthrust.recover, (phill.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'phill-wingthrust-recover') {
    const { overlap, counterActive } = bodyOverlapNow(phill);
    if (overlap && counterActive) {
      phillCounterHit(phcx, phcy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, phill);
    } else if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      patch.bossState = 'chase'; patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, phill);
    }
  } else if (st === 'phill-wingcombo-windup') {
    const { overlap, counterActive } = bodyOverlapNow(phill);
    if (overlap && counterActive) {
      phillCounterHit(phcx, phcy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, phill);
    } else if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      const fx0 = phill.aiFromX ?? phcx, fy0 = phill.aiFromY ?? phcy, tx0 = phill.aiTargetX ?? phcx, ty0 = phill.aiTargetY ?? phcy;
      pushBlast((fx0 + tx0) / 2, (fy0 + ty0) / 2, PH_T.wingcombo.halfWidth, phill.damage, 'phill-wingcombo',
        { fx: fx0, fy: fy0, tx: tx0, ty: ty0, halfWidth: PH_T.wingcombo.halfWidth });
      patch.bossState = 'phill-wingcombo-active1'; patch.bossStateUntil = newGameTime + PH_T.wingcombo.active1;
      sfx.sweep();
    }
  } else if (st === 'phill-wingcombo-active1') {
    if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      patch.bossState = 'phill-wingcombo-gap'; patch.bossStateUntil = newGameTime + PH_T.wingcombo.gapMs;
    }
  } else if (st === 'phill-wingcombo-gap') {
    // 2撃目のディレイ(§10-3の5「羽連撃(物理③): 左右の羽で2連斬り(帯×2・2撃目ディレイ)」)。
    const { overlap, counterActive } = bodyOverlapNow(phill);
    if (overlap && counterActive) {
      phillCounterHit(phcx, phcy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, phill);
    } else if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      const fx0 = phill.aiFromX ?? phcx, fy0 = phill.aiFromY ?? phcy, tx0 = phill.aiTargetX ?? phcx, ty0 = phill.aiTargetY ?? phcy;
      pushBlast((fx0 + tx0) / 2, (fy0 + ty0) / 2, PH_T.wingcombo.halfWidth, phill.damage, 'phill-wingcombo',
        { fx: fx0, fy: fy0, tx: tx0, ty: ty0, halfWidth: PH_T.wingcombo.halfWidth });
      patch.bossState = 'phill-wingcombo-active2'; patch.bossStateUntil = newGameTime + PH_T.wingcombo.active2;
      sfx.sweep();
    }
  } else if (st === 'phill-wingcombo-active2') {
    if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      patch.bossState = 'phill-wingcombo-recover';
      patch.bossStateUntil = newGameTime + choreographyRecoverMs(PH_T.wingcombo.recover, (phill.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'phill-wingcombo-recover') {
    const { overlap, counterActive } = bodyOverlapNow(phill);
    if (overlap && counterActive) {
      phillCounterHit(phcx, phcy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, phill);
    } else if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      patch.bossState = 'chase'; patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, phill);
    }
  } else if (st === 'phill-summon-windup') {
    const { overlap, counterActive } = bodyOverlapNow(phill);
    if (overlap && counterActive) {
      phillCounterHit(phcx, phcy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, phill);
    } else if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      const liveEscorts = store.enemies.filter(e => e.bountyEscortId === phill.id).length;
      const n = phillSummonSpawnCount(liveEscorts);
      if (n > 0) {
        const escorts: Enemy[] = [];
        for (let i = 0; i < n; i++) {
          const ang = (Math.PI * 2 * i) / n + Math.random() * 0.4;
          const ex = phcx + Math.cos(ang) * 90, ey = phcy + Math.sin(ang) * 90;
          const e = spawnEnemyAt('zombie', ex - 16, ey - 16, newGameTime);
          e.bountyEscortId = phill.id;
          escorts.push(e);
        }
        useGameStore.setState(st2 => ({ enemies: [...st2.enemies, ...escorts] }));
        sfx.summon();
      }
      patch.bossState = 'phill-summon-recover';
      patch.bossStateUntil = newGameTime + choreographyRecoverMs(PH_T.summon.recover, (phill.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'phill-summon-recover') {
    const { overlap, counterActive } = bodyOverlapNow(phill);
    if (overlap && counterActive) {
      phillCounterHit(phcx, phcy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, phill);
    } else if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      patch.bossState = 'chase'; patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, phill);
    }
  } else if (st === 'phill-goldring-windup') {
    const { overlap, counterActive } = bodyOverlapNow(phill);
    if (overlap && counterActive) {
      phillCounterHit(phcx, phcy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, phill);
    } else if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      pushBlast(phcx, phcy, PH_T.goldring.radius, phill.damage, 'phill-goldring');
      patch.bossState = 'phill-goldring-active'; patch.bossStateUntil = newGameTime + PH_T.goldring.active;
      sfx.beam();
    }
  } else if (st === 'phill-goldring-active') {
    if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      patch.bossState = 'phill-goldring-recover';
      patch.bossStateUntil = newGameTime + choreographyRecoverMs(PH_T.goldring.recover, (phill.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'phill-goldring-recover') {
    const { overlap, counterActive } = bodyOverlapNow(phill);
    if (overlap && counterActive) {
      phillCounterHit(phcx, phcy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, phill);
    } else if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      patch.bossState = 'chase'; patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, phill);
    }
  } else if (st === 'phill-judgment-windup') {
    // ★カウンター必須(§10-9/§10-12#16): 追尾中=予告のみ(判定なし・ジャンプ着地円と同型)。
    // 早期カウンターは他の天使と同じ自己完結windupチェックで許す(赤=判定一致・避け切れなくても弾ける)。
    const { overlap, counterActive } = bodyOverlapNow(phill);
    if (overlap && counterActive) {
      phillCounterHit(phcx, phcy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, phill);
    } else if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      const tx = phill.aiTargetX ?? pcx, ty = phill.aiTargetY ?? pcy;
      pushBlast(tx, ty, PH_T.judgment.radius, phillRequiredMoveDamage(phill.damage, player.maxHealth), 'phill-judgment');
      ph.requiredReadyAt = newGameTime + PHILL_REQUIRED_GAP_MS;
      patch.bossState = 'phill-judgment-active'; patch.bossStateUntil = newGameTime + PH_T.judgment.active;
      sfx.beam();
    } else {
      patch.aiTargetX = pcx; patch.aiTargetY = pcy; // 追尾(判定はまだ無い)
    }
  } else if (st === 'phill-judgment-active') {
    if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      patch.bossState = 'phill-judgment-recover';
      patch.bossStateUntil = newGameTime + choreographyRecoverMs(PH_T.judgment.recover, (phill.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'phill-judgment-recover') {
    const { overlap, counterActive } = bodyOverlapNow(phill);
    if (overlap && counterActive) {
      phillCounterHit(phcx, phcy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, phill);
    } else if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      patch.bossState = 'chase'; patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, phill);
    }
  } else if (st === 'phill-cage-windup') {
    // ★カウンター必須(§10-9/§10-12#16): 収縮円は溜め開始でロックした中心から閉じる(以後追尾しない=
    // 「逃げ場なし」)。初期半径は可視短辺×0.45を上限にクランプ(§10-12#17・?zoomlock=0.4でも破綻しない)。
    const { overlap, counterActive } = bodyOverlapNow(phill);
    if (overlap && counterActive) {
      phillCounterHit(phcx, phcy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, phill);
    } else if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      const tx = phill.aiTargetX ?? pcx, ty = phill.aiTargetY ?? pcy;
      pushBlast(tx, ty, PH_T.cage.closeRadius, phillRequiredMoveDamage(phill.damage, player.maxHealth), 'phill-cage');
      ph.requiredReadyAt = newGameTime + PHILL_REQUIRED_GAP_MS;
      patch.bossState = 'phill-cage-active'; patch.bossStateUntil = newGameTime + PH_T.cage.active;
      sfx.beam();
    }
  } else if (st === 'phill-cage-active') {
    if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      patch.bossState = 'phill-cage-recover';
      patch.bossStateUntil = newGameTime + choreographyRecoverMs(PH_T.cage.recover, (phill.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'phill-cage-recover') {
    const { overlap, counterActive } = bodyOverlapNow(phill);
    if (overlap && counterActive) {
      phillCounterHit(phcx, phcy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, phill);
    } else if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      patch.bossState = 'chase'; patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, phill);
    }
  } else if (st === 'phill-meteor-windup') {
    const { overlap, counterActive } = bodyOverlapNow(phill);
    if (overlap && counterActive) {
      phillCounterHit(phcx, phcy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, phill);
    } else if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      const ids: string[] = [];
      for (let i = 0; i < PH_T.meteor.count; i++) {
        const ang = ((i - (PH_T.meteor.count - 1) / 2) * 0.35);
        const baseAim = resolveBossLockedHateAim(phill, { x: pcx, y: pcy }, store.summons);
        const baseAng = Math.atan2(baseAim.y - phcy, baseAim.x - phcx) + ang;
        const proj = createEnemyProjectile(phill, player, phcx + Math.cos(baseAng) * 400, phcy + Math.sin(baseAng) * 400);
        useGameStore.getState().addProjectile(proj);
        ids.push(proj.id);
      }
      ph.meteorHomingIds = [...ph.meteorHomingIds, ...ids];
      sfx.shot();
      patch.bossState = 'phill-meteor-active'; patch.bossStateUntil = newGameTime + PH_T.meteor.gapMs * PH_T.meteor.count;
    }
  } else if (st === 'phill-meteor-active') {
    if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      patch.bossState = 'phill-meteor-recover';
      patch.bossStateUntil = newGameTime + choreographyRecoverMs(PH_T.meteor.recover, (phill.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'phill-meteor-recover') {
    const { overlap, counterActive } = bodyOverlapNow(phill);
    if (overlap && counterActive) {
      phillCounterHit(phcx, phcy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, phill);
    } else if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      patch.bossState = 'chase'; patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, phill);
    }
  } else if (st === 'phill-ringtoss-windup') {
    const { overlap, counterActive } = bodyOverlapNow(phill);
    if (overlap && counterActive) {
      phillCounterHit(phcx, phcy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, phill);
    } else if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      const fx0 = phill.aiFromX ?? phcx, fy0 = phill.aiFromY ?? phcy, tx0 = phill.aiTargetX ?? phcx, ty0 = phill.aiTargetY ?? phcy;
      pushBlast((fx0 + tx0) / 2, (fy0 + ty0) / 2, PH_T.ringtoss.halfWidth, phill.damage, 'phill-ringtoss',
        { fx: fx0, fy: fy0, tx: tx0, ty: ty0, halfWidth: PH_T.ringtoss.halfWidth });
      patch.bossState = 'phill-ringtoss-out'; patch.bossStateUntil = newGameTime + PH_T.ringtoss.outMs;
      sfx.throw();
    }
  } else if (st === 'phill-ringtoss-out') {
    if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      const fx0 = phill.aiFromX ?? phcx, fy0 = phill.aiFromY ?? phcy, tx0 = phill.aiTargetX ?? phcx, ty0 = phill.aiTargetY ?? phcy;
      pushBlast((fx0 + tx0) / 2, (fy0 + ty0) / 2, PH_T.ringtoss.halfWidth, phill.damage, 'phill-ringtoss',
        { fx: fx0, fy: fy0, tx: tx0, ty: ty0, halfWidth: PH_T.ringtoss.halfWidth });
      patch.bossState = 'phill-ringtoss-back'; patch.bossStateUntil = newGameTime + PH_T.ringtoss.backMs;
    }
  } else if (st === 'phill-ringtoss-back') {
    if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      patch.bossState = 'phill-ringtoss-recover';
      patch.bossStateUntil = newGameTime + choreographyRecoverMs(PH_T.ringtoss.recover, (phill.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'phill-ringtoss-recover') {
    const { overlap, counterActive } = bodyOverlapNow(phill);
    if (overlap && counterActive) {
      phillCounterHit(phcx, phcy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, phill);
    } else if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      patch.bossState = 'chase'; patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, phill);
    }
  } else if (st === 'phill-dive-windup') {
    // 急降下(技12): 追尾する影マーカー(判定なし)→急降下+着地円(ジャンプ着地レールの大型版)。
    const { overlap, counterActive } = bodyOverlapNow(phill);
    if (overlap && counterActive) {
      phillCounterHit(phcx, phcy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, phill);
    } else if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      patch.aiFromX = phcx; patch.aiFromY = phcy; // 現在位置=飛び出し点
      // 着地点は溜め開始でロック済み(v0.25.3148と同じ流儀=aiTargetX/Yはここでは狙い直さない)。
      patch.bossState = 'phill-dive-fall'; patch.bossStateUntil = newGameTime + PH_T.dive.fallMs;
      patch.aiStartedAt = newGameTime;
    } else {
      patch.aiTargetX = pcx; patch.aiTargetY = pcy; // 追尾(判定はまだ無い)
    }
  } else if (st === 'phill-dive-fall') {
    const fx0 = phill.aiFromX ?? phcx, fy0 = phill.aiFromY ?? phcy, tx0 = phill.aiTargetX ?? phcx, ty0 = phill.aiTargetY ?? phcy;
    const t = Math.max(0, Math.min(1, (newGameTime - (phill.aiStartedAt ?? newGameTime)) / PH_T.dive.fallMs));
    const tEs = airHopEase01(t); // v0.25.3076「滑空って全てのジャンプね」と同じ緩急曲線
    patch.x = (fx0 + (tx0 - fx0) * tEs) - phill.width / 2;
    patch.y = (fy0 + (ty0 - fy0) * tEs) - phill.height / 2;
    if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      pushBlast(tx0, ty0, PH_T.dive.radius, phill.damage, 'phill-dive');
      patch.bossState = 'phill-dive-recover';
      patch.bossStateUntil = newGameTime + choreographyRecoverMs(PH_T.dive.recover, (phill.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'phill-dive-recover') {
    const { overlap, counterActive } = bodyOverlapNow(phill);
    if (overlap && counterActive) {
      phillCounterHit(phcx, phcy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, phill);
    } else if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      patch.bossState = 'chase'; patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, phill);
    }
  } else if (st === 'phill-feathershot-windup') {
    // 羽根散弾(技14・§10-13): 専用飛翔体(skadiIceBlades共有配列にvisual:'feather')。
    // 打ち返し対象外=避ける系(ラフィの骨/ジブリルのランス/スカディの氷刃と同型)。
    const { overlap, counterActive } = bodyOverlapNow(phill);
    if (overlap && counterActive) {
      phillCounterHit(phcx, phcy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, phill);
    } else if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      const aim = resolveBossLockedHateAim(phill, { x: pcx, y: pcy }, store.summons);
      const baseAng = Math.atan2(aim.y - phcy, aim.x - phcx);
      const n = PH_T.feathershot.count;
      const spread = (PH_T.feathershot.spreadDeg * Math.PI) / 180;
      for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0 : (i / (n - 1)) - 0.5;
        useGameStore.getState().spawnSkadiBlade(phcx, phcy, baseAng + t * spread, newGameTime + 250, phill.id, 'feather');
      }
      sfx.throw();
      patch.bossState = 'phill-feathershot-recover';
      patch.bossStateUntil = newGameTime + choreographyRecoverMs(PH_T.feathershot.recover, (phill.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'phill-feathershot-recover') {
    const { overlap, counterActive } = bodyOverlapNow(phill);
    if (overlap && counterActive) {
      phillCounterHit(phcx, phcy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, phill);
    } else if (newGameTime >= (phill.bossStateUntil ?? 0)) {
      patch.bossState = 'chase'; patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, phill);
    }
  } else {
    patch.bossState = 'chase'; patch.bossNextActionAt = newGameTime + AN_C.stunNextActionMs;
  }

  void onPlayerDeath; // フィルの技は全てpumpkinBlasts/共通弾/専用飛翔体経由=combatTick側がdamagePlayerと死亡判定を担う(他の被弾直呼びを持つ技が無いため未使用)。
  applyPatch(phill.id, patch);
};

// --- ディスパッチャ(両呼び出し側の入口) -----------------------------------------------------
export const runAngelBossTick = (
  s: AngelBossState, newGameTime: number, deltaTime: number, moveSpeedMult: number,
  sfx: AngelSfx, onPlayerDeath: (x: number, y: number) => void,
): void => {
  const angel = useGameStore.getState().enemies.find(e => isGate2AngelBoss(e.type) && e.bossState != null);
  if (!angel) return;
  // トラップ(root)中は他のボスと揃えて「停止」(社長裁定v0.25.1690。v0.25.1688の移動半減から改訂)。
  // 天使は updateEnemies のroot分岐(vx=0)を素通りする(isHiddenBoss=スキップ)ため、ここで止める。
  // 裏ボスのfrozen相当: 平常時(chase=移動/次攻撃の起点)のみtickを止める=移動も新規攻撃も停止。
  // 攻撃の実行中(windup/払い/ジャンプ/counter-leap等)は完走させる(tickだけ止めると時計が先へ進み、
  // root明けにツイーンが瞬間完了=テレポートに見えるため)。攻撃が終わればchaseへ戻り凍結する。
  const rooted = angel.rootUntil !== undefined && newGameTime < angel.rootUntil;
  if (rooted && (angel.bossState ?? 'chase') === 'chase') return;
  // ボスメーカー: 単独再生の立ち下がり(1)=**tickの前**。気絶/カウンター/割り込みで技が消された時の
  // 受け皿(これが無いと angelSoloActive が立ちっぱなしになり ⏸ が二度と効かなくなる)。
  settleAngelPlayback(angel.bossState);
  if (angel.type === 'miguel') {
    if (MIGUEL_SCRIPT_ENABLED) runMiguelTick(angel, s, newGameTime, deltaTime, moveSpeedMult, sfx, onPlayerDeath);
    else runMiguelTickLegacy(angel, s, newGameTime, deltaTime, moveSpeedMult, sfx, onPlayerDeath);
  } else if (angel.type === 'jibril') {
    if (JIBRIL_SCRIPT_ENABLED) runJibrilTick(angel, s, newGameTime, deltaTime, moveSpeedMult, sfx);
    else runJibrilTickLegacy(angel, s, newGameTime, deltaTime, moveSpeedMult, sfx);
  } else if (angel.type === 'rafi') {
    if (RAFI_SCRIPT_ENABLED) runRafiTick(angel, s, newGameTime, deltaTime, moveSpeedMult, sfx);
    else runRafiTickLegacy(angel, s, newGameTime, deltaTime, moveSpeedMult, sfx);
  } else if (angel.type === 'uri') {
    runUriTick(angel, s, newGameTime, deltaTime, moveSpeedMult, sfx, onPlayerDeath);
  } else if (angel.type === 'suriel') {
    runSurielTick(angel, s, newGameTime, deltaTime, moveSpeedMult, sfx, onPlayerDeath);
  } else if (angel.type === 'acrasiel') {
    runAcrasielTick(angel, s, newGameTime, deltaTime, moveSpeedMult, sfx, onPlayerDeath);
  } else if (angel.type === 'phillboss') {
    runPhillTick(angel, s, newGameTime, deltaTime, moveSpeedMult, sfx, onPlayerDeath);
  }
  // ボスメーカー: 単独再生の立ち下がり(2)=**tickの直後**。技がchaseへ戻ったそのフレームで終える
  // (停止中に「余分な1フレームだけ歩く」が起きない)。ループONなら次フレームにもう一度始まる。
  if (angelSoloActive) {
    settleAngelPlayback(useGameStore.getState().enemies.find(e => e.id === angel.id)?.bossState);
  }
};

// --- ジブリルのランタン火(bossFires)のtick(旧useGameLoop v0.25.1664ブロックの移設・挙動不変) ---
// 寿命切れ回収+有効化後のプレイヤー接触判定。触れると30固定ダメージでその火は消える(単発)。
// 1フレーム1ヒット制限(重なり火の多重ダメージ/i-frame無視を防ぐ)。
export const tickAngelBossFires = (newGameTime: number, onPlayerDeath: (x: number, y: number) => void): void => {
  const bf = useGameStore.getState().bossFires;
  if (bf.length === 0) return;
  const pl = useGameStore.getState().player;
  const plcx = pl.x + pl.width / 2, plcy = pl.y + pl.height / 2;
  const hitR = JB_T.fire.radius + Math.min(pl.width, pl.height) / 2;
  let died = false;
  let struck = false;
  const survivors: typeof bf = [];
  for (const f of bf) {
    if (newGameTime >= f.expireAt) continue;
    const active = newGameTime >= f.activateAt;
    if (active && !pl.invulnerable && !died && !struck && Math.hypot(plcx - f.x, plcy - f.y) <= hitR) {
      struck = true;
      const d = useGameStore.getState().damagePlayer(JB_T.fire.damage, 'ジブリルのランタン火', f.x, f.y, undefined, undefined, 'jibril-lantern'); // G4a計測タグ(記録専用・置いた火はランタンの技に帰属)
      if (d) { died = true; onPlayerDeath(plcx, plcy); }
      continue;
    }
    survivors.push(f);
  }
  if (survivors.length !== bf.length) useGameStore.getState().setBossFires(survivors);
};

// --- アクラシエルの結晶の槍(acrasielSpears)のtick(§6.28-19 バッチM63・新規) ---------------------
// 設置から2秒後(fireAt)に一度だけ円形AoEへ起爆して消える(命中してもしなくても消える=一撃だけの
// 遅延起爆・ジャイアント踏み鳴らしと同型)。ボス自身が倒れた後もハザードは独立して起爆する
// (damageはspawn時のenemy.damageを保持済みなのでボス消滅後も参照不要)。
export const tickAcrasielSpears = (
  newGameTime: number, onPlayerDeath: (x: number, y: number) => void, sfx: AngelSfx = NOOP_ANGEL_SFX,
): void => {
  const spears = useGameStore.getState().acrasielSpears;
  if (spears.length === 0) return;
  const pl = useGameStore.getState().player;
  const plcx = pl.x + pl.width / 2, plcy = pl.y + pl.height / 2;
  const pr = Math.max(pl.width, pl.height) / 2;
  let died = false;
  // ★v0.25.3591(監査 A-3「赤い予告が出ているのにカウンター手段が1つも無い」): 起爆は damagePlayer
  // 直呼びで、ブラストパリィ(命中の瞬間の弾き)すら通らなかった。**赤円の中で窓が開いていれば
  // 起爆をカウンターで潰せる**ようにする(1本につき1回・1フレームに1本まで=多重成立させない)。
  // ※監査の推奨は「pumpkinBlastsへ積む」だったが、そちらは爆発FX/ノックバック/死因ラベルまで
  //   変わる(=演出の変更)。今回は「成立域の幾何だけ」を直す発注なので、同じ効果を持つこちらを採った。
  let counteredThisFrame = false;
  const survivors: typeof spears = [];
  for (const sp of spears) {
    if (newGameTime >= sp.fireAt) {
      const inCircle = Math.hypot(plcx - sp.x, plcy - sp.y) <= AC_T.spear.radius + pr;
      if (inCircle && !counteredThisFrame && isCounterActive(pl, Date.now())) {
        const owner = useGameStore.getState().enemies.find(e => e.id === sp.enemyId);
        if (owner) {
          counteredThisFrame = true;
          angelCounterHit(owner, owner.x + owner.width / 2, sp.x, sp.y, sfx);
          continue; // 起爆は潰れた=ダメージは出さない
        }
      }
      sfx.iceBurst(); // v0.25.3700: 技SE(社長指示・プレイヤー近似流用・起爆1本ごと)
      if (!pl.invulnerable && !died && inCircle) {
        const d = useGameStore.getState().damagePlayer(sp.damage, `${enemyDeathLabel('acrasiel')}の結晶の槍`, sp.x, sp.y, undefined, undefined, 'acrasiel-spear'); // G4a計測タグ(記録専用・遅延起爆は残響で槍へ帰属)
        if (d) { died = true; onPlayerDeath(plcx, plcy); }
      }
      continue;
    }
    survivors.push(sp);
  }
  if (survivors.length !== spears.length) useGameStore.getState().setAcrasielSpears(survivors);
};
