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
  useGameStore, counterReplyDamage, skillLevel, enemyDeathLabel,
  BOSS_CRIT_DAMAGE_MULT, COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG,
  MELEE_FINISH_SLOW_MS, MELEE_FINISH_SLOW_HOLD_MS, bossSlowMult, bossCritCdMult,
} from '../store/gameStore';
import { getActiveGun } from './weaponUtils';
import { createEnemyProjectile, isGate2AngelBoss } from './enemyUtils';
import { rectsOverlap } from '../world/obstacles';
import { airHopEase01 } from './airHop';
import { distToSegment } from './levelUpGate';
import { phaseForHealth, phaseJustChanged, BOSS_ALERT_SFX_KEY, isBossCounterableNowApprox } from './bossScript';
import { notifyCounterHit, notifyMoveCounter } from './playerTraits'; // BOT_AND_GHOST.md G1/G4a(計測専用・挙動不変)
import { refundCounterCooldown } from './counterMaster'; // counter-master v2(CD_REWORK.md 確定2)
import { consumeGhostCounterClaim, applyGhostCounterEffect, type GhostCounterFire } from './ghostCounter'; // v0.25.2480: 守護霊カウンターの合流
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
import { resolveBossHateAim, resolveBossLockedHateAim, type ResolvedHateAim } from './bossHate'; // BOT_AND_GHOST.md §2.8 G2.5
import { bossNeutralDelayMs, bossRebuildIdForEnemy } from './bossRebuild';
// v0.25.2609(ボス動き横断監査・バッチ2): 硬直=パニッシュ窓の床。本作の「1発」=カウンター1サイクル
// (COUNTER_WINDOW 400ms + COUNTER_COOLDOWN 420ms = 820ms)なので、硬直がそれ未満だと
// 「硬直はあるがプレイヤーは1発も入れられない」=休符が存在しないのと同じ。監査で天使の硬直の
// 大半(300〜750ms)が該当した。**定数の宣言側を withRecoverFloor で包む**ことで、元の数字を
// 履歴として残したまま床を1箇所で保証する(呼び出し箇所は一切変えない)。
import { withRecoverFloor } from './bossTelegraph';
import { choreographyRecoverMs, planBossChoreography, type ChoreographyBoss } from './bossChoreography';
// v0.25.2617(idolTick.tsと同じ理由): プレイヤーの移動クランプと**同じ純関数**を使う。
// `playableArea.ts` は「行ける帯」の唯一の出どころ。天使はここ(applyPatch)を通っていなかった
// (CLAUDE.md「アクターを動かす時は必ずclampRectToPlayableAreaを通す」・v0.25.2615-2617の
// 3連続事故の再発防止・v0.25.2895)。
import { clampRectToPlayableArea, type PlayableAreaCtx } from '../world/playableArea';

// --- 音の注入(ヘッドレスはNOOP) -------------------------------------------
export interface AngelSfx {
  // gain(省略時=等倍)は守護霊カウンター(v0.25.2480)の距離減衰用。プレイヤー成立は従来どおり引数なし=等倍。
  counter: (gain?: number) => void;  // カウンター成立(playSfx('counter'))
  reward: (gain?: number) => void;   // 反撃ヒット(playSfx('headshot'))
  sweep: () => void;    // 払い/縦払い実行(playSfx('thor-sweep'))
  // §6.28共通: 予告SE(全技共通=hunter-alert流用・§6.26-9 #5)。溜め(windup)へ入った瞬間に1回。
  alert: () => void;
}
export const NOOP_ANGEL_SFX: AngelSfx = { counter: () => {}, reward: () => {}, sweep: () => {}, alert: () => {} };
void BOSS_ALERT_SFX_KEY; // (呼び出し側=useGameLoop.tsがplaySfx(BOSS_ALERT_SFX_KEY)をalertへ配線する)

// --- ボスごとのフォールバック(`?<boss>script=0`・giantScriptと同じ作法) -----------------------
const scriptFlag = (name: string): boolean =>
  typeof window === 'undefined' || new URLSearchParams(window.location.search).get(name) !== '0';
export const MIGUEL_SCRIPT_ENABLED = scriptFlag('miguelscript');
export const JIBRIL_SCRIPT_ENABLED = scriptFlag('jibrilscript');
export const RAFI_SCRIPT_ENABLED = scriptFlag('rafiscript');
// ★uri/suriel/acrasiel のフラグは撤去(v0.25.2893)。この3体はLegacy実装が無く、`?uriscript=0` は
// 「旧実装へ戻す」ではなく**tickを丸ごと止める=ボスが凍結して倒せなくなる**footgunだった。

// --- 定数(useGameLoop.tsから移設。トール側のレガシー定数と同値のものは同値コメントで同期義務) ---
const GATE_ARENA_RADIUS = 300;          // ゲートアリーナ半径(useGameLoop.tsと同値)
const BOSS_ACTION_MIN_MS = 2600;        // 完全気絶明けの次アクション先送り(同値)
const ANGEL_COUNTER_LEAP_MS = 260;      // カウンター後退ジャンプ(=THOR_COUNTER_LEAP_MS)
const ORBIT_RADIUS_CORRECT = 4;         // 半径補正の寄せ係数(=THOR_ORBIT_RADIUS_CORRECT)
const BOSS_BURST_SHOTS = 3;             // 弾3連(同値)
const BOSS_BURST_GAP_MS = 500;          // 0.5秒間隔(同値)
const HARAI_TRIGGER_DIST = 250;         // 斬り系を出せる距離(同値)
// §6.28共通: フェーズ移行の一瞬だけHPバーを点滅させる長さ(ジャイアントのGIANT_PHASE_FLASH_MSと同値)。
const ANGEL_PHASE_FLASH_MS = 1200;
// ミゲル
const MIGUEL_HARAI_WINDUP_MS = 1000;
const MIGUEL_HARAI_RANGE = 190;
const MIGUEL_HARAI_HALF_WIDTH = 40;
// ★振り速度2倍(社長指示v0.25.2885): 220→110。判定の持続窓も半分になる=技そのものが速い。
// **pixiScene.ts の同名定数と必ず同値に保つこと**(手写しの重複。ズレると剣が固まる/先に振り終わる)。
const MIGUEL_HARAI_ACTIVE_MS = 110;
const MIGUEL_ORBIT_MARGIN = 20;
const MIGUEL_ORBIT_SPEED = 70;
const MIGUEL_MELEE_DASH_MS = 1000;
const MIGUEL_MELEE_DASH_MULT = 2;
const MIGUEL_SLOW_WALK_MS = 1500;
const MIGUEL_SLOW_WALK_MULT = 0.4;
const MIGUEL_SLOW_WALK_MIN_GAP_MS = 4000;
const MIGUEL_SLOW_WALK_MAX_GAP_MS = 9000;
const MIGUEL_VOLLEY_CHANCE_LEGACY = 0.6; // 旧(?miguelscript=0)専用。新は miguelScript.ts の MIGUEL_VOLLEY_CHANCE。
// §6.28-4(バッチM53): 新規windup/recover+踏み込み(dash)【新規】。
const MIGUEL_VOLLEY_WINDUP_MS = 450;
const MIGUEL_VOLLEY_RECOVER_MS = withRecoverFloor(300);
const MIGUEL_TATE_RECOVER_MS = withRecoverFloor(800);
export const MIGUEL_DASH_WINDUP_MS = 700;
export const MIGUEL_DASH_MOVE_MS = 230;         // 溜め後の斬り抜けは爆発的に。判定/補間/FXが同じ値を読む。
export const MIGUEL_DASH_STRIKE_MS = MIGUEL_HARAI_ACTIVE_MS; // 「MIGUEL_HARAI_ACTIVE_MS相当の斬り抜け」(設計書指定どおり)
const MIGUEL_DASH_RECOVER_MS = withRecoverFloor(800);
const MIGUEL_DASH_CD_MS = 6000;
// v0.25.3195(社長指示「カウンターでノックバック+中断位置戻し」): 突進カウンター成立時に
// プレイヤー中心から突進方向の逆へ弾き返す距離(px)。絵ではなく実位置=素通り事故の根治。
const MIGUEL_DASH_COUNTER_PUSHBACK_PX = 150;
// ジブリル(社長指示v0.25.1663)
const JIBRIL_RETREAT_SPEED = 55;
const JIBRIL_RETREAT_FAST_MULT = 1.7;
const JIBRIL_HITS_FASTER = 3;
const JIBRIL_HITS_WARP = 10;
const JIBRIL_HANDGUN_DIST = 300;
// 社長指示v0.25.3197「ジブリルの射撃を 1発、全方位、1発、全方位、1発 の5連射にする」:
// 射撃(volley)は近接射/狙撃の両モードとも**5連射**になり、偶数発目(2発目・4発目)は
// **全方位リング(8方向)**を撃つ。狙い撃ちの弾速倍率(狙撃×2)は奇数発目=狙い弾にのみ掛かる。
const JIBRIL_VOLLEY_SHOTS = 5;
const JIBRIL_OMNI_BULLETS = 8;
// 旧フォールバック(runJibrilTickLegacy・?jibrilscript=0)専用の据え置き値。新実装は使わない。
const JIBRIL_SNIPE_SHOTS = 3;
const JIBRIL_CLOSE_SHOTS = 5;
const JIBRIL_SNIPE_GAP_MS = 1000;
const JIBRIL_SNIPE_SPEED_MULT = 2;
// 社長指示v0.25.3197「新技で、赤ラインの細目レーザーを打つ。速射だがギリギリ歩いて避けれて、
// カウンターも可能にする」= 新技「ランス」(細い光条)。
// - 溜め420ms: 物差し(歩き104.4px/s)で半幅26+体半径≒36px を約345msで抜けられる=ギリギリ。
// - 実体は起爆カプセル(pumpkinBlasts)=**ブラストパリィでカウンター可能**(赤=カウンター可の文法。
//   ライン上でカウンター窓を合わせれば弾ける既存経路。パリィ→確定クリ+体勢'counter'も既存どおり)。
export const JIBRIL_LANCE_WINDUP_MS = 420;
export const JIBRIL_LANCE_BEAM_MS = 140;
const JIBRIL_LANCE_RECOVER_MS = withRecoverFloor(600);
export const JIBRIL_LANCE_RANGE_PX = 760;
export const JIBRIL_LANCE_HALF_WIDTH_PX = 26;
const JIBRIL_LANTERN_CHANCE_LEGACY = 0.4; // 旧専用。新は jibrilScript.ts の JIBRIL_LANTERN_CHANCE。
const JIBRIL_LANTERN_MS = 5000;
const JIBRIL_FIRE_GAP_MS = 700;
const JIBRIL_FIRE_TELEGRAPH_MS = 700;
const JIBRIL_FIRE_LIFE_MS = 2000;
const JIBRIL_FIRE_DAMAGE = 30;
const JIBRIL_FIRE_RADIUS = 22;
// §6.28-6(バッチM55): 新規windup/recover+聖別【新規・Phase2】+転移の溜め【新設】。
const JIBRIL_VOLLEY_WINDUP_MS = 450;
const JIBRIL_VOLLEY_RECOVER_MS = withRecoverFloor(400);
const JIBRIL_LANTERN_WINDUP_MS = 700;
const JIBRIL_LANTERN_RECOVER_MS = withRecoverFloor(750);
const JIBRIL_CONSECRATE_WINDUP_MS = 700;
const JIBRIL_CONSECRATE_RECOVER_MS = withRecoverFloor(750);
const JIBRIL_CONSECRATE_CD_MS = 8000;
const JIBRIL_CONSECRATE_RING_RADIUS = 160; // §6.28-6: 自分を中心とした半径160pxのリング
const JIBRIL_CONSECRATE_FIRE_COUNT = 6;    // 6個・隙間1箇所(=7分割の1つを空ける)
const JIBRIL_WARP_WINDUP_MS = 450;
// v0.25.2609(バッチ2): **硬直の床(withRecoverFloor)を意図的に適用しない**唯一の硬直。
// 理由: ジブリルの転移はダメージ判定を持たない**純粋な移動**であり、'warp-recover' は
// プレイヤーのカウンター分岐が存在しない州(takeGhostAngelCounterも明示除外している)。
// 床の目的は「パニッシュ窓を作ること」なので、カウンターできない州を伸ばしても
// **ただの待ち時間が増えるだけ**(しかもバッチ0で下げたワープ滞在率を押し戻してしまう)。
// 対になるアクラシエルの転移は着地に半径92pxのダメージ判定を持つ=技なので床を適用済み。
const JIBRIL_WARP_RECOVER_MS = 400;
// ラフィ(社長指示v0.25.1665)
const RAFI_CHASE_SPEED = 62;
const RAFI_HANDGUN_DIST = 300;
const RAFI_STEP_MIN_GAP_MS = 1800;
const RAFI_STEP_MAX_GAP_MS = 3600;
const RAFI_STEP_MS = 220;
const RAFI_STEP_SPEED = 360;
const RAFI_BONE_COUNT = 7;
const RAFI_BONE_GAP_MS = 600;
const RAFI_JUMP_MAX_REJUMPS = 2;
const RAFI_JUMP_WINDUP_MS = 700;        // =THOR_JUMP_WINDUP_MS(同値)
const RAFI_JUMP_MS = 360;               // =THOR_JUMP_MS(同値)。予告は残し、飛び込みだけ高速化。
const RAFI_JUMP_RADIUS = 70;            // =THOR_JUMP_RADIUS(同値)
const RAFI_JUMP_RECOVER_MS = 900;       // =THOR_JUMP_RECOVER_MS(同値)
const SKADI_BLADE_RING_MIN = 100;       // 骨刃の設置リング(スカジと同値)
const SKADI_BLADE_RING_MAX = 180;
const SKADI_BLADE_DELAY_MS = 1000;
// §6.28-8(バッチM57): 新規windup/recover+薙ぎ【新規・Phase2】+Phase2の横ステップ短縮。
const RAFI_BONE_WINDUP_MS = 450;
const RAFI_BONE_RECOVER_MS = withRecoverFloor(700);
const RAFI_SWEEP_WINDUP_MS = 700;
const RAFI_SWEEP_ACTIVE_MS = 220;         // =THOR_HARAI_ACTIVE_MS相当(§6.26-9 #3の流用作法を継承)
const RAFI_SWEEP_RECOVER_MS = withRecoverFloor(700);
const RAFI_SWEEP_CD_MS = 7000;
const RAFI_SWEEP_RANGE_PX = 310;          // =THOR_HARAI_RANGE(流用)
const RAFI_SWEEP_HALF_WIDTH_PX = 40;      // =THOR_HARAI_HALF_WIDTH(流用)
const RAFI_STEP_MIN_GAP_MS_P2 = 1400;
const RAFI_STEP_MAX_GAP_MS_P2 = 2800;

// --- ウリ(§6.28-17・バッチM61・新規) ---------------------------------------------------------
const URI_SWEEP_WINDUP_MS = 550;   // 社長指示v0.25.3195「ウリの攻撃が遅い。溜を半分に」: 1100→550
const URI_SWEEP_ACTIVE_MS = 130;          // ★振り速度2倍(社長指示v0.25.2885): 260→130。pixiScene.tsの同名と同値必須
const URI_SWEEP_RECOVER_MS = withRecoverFloor(580);
const URI_DOWNSLASH_WINDUP_MS = 500; // 社長指示v0.25.3195: 1000→500
const URI_DOWNSLASH_ACTIVE_MS = 100;      // ★振り速度2倍(社長指示v0.25.2885): 200→100。pixiScene.tsの同名と同値必須
const URI_DOWNSLASH_RECOVER_MS = withRecoverFloor(900);
export const URI_THRUST_WINDUP_MS = 450; // 社長指示v0.25.3195: 900→450
export const URI_THRUST_MOVE_MS = 230;           // ミゲル踏み込みと同値。溜め後の実行だけ高速化。
export const URI_THRUST_STRIKE_MS = 220;
const URI_THRUST_RECOVER_MS = withRecoverFloor(580);
const URI_BOLT_WINDUP_MS = 225;    // 社長指示v0.25.3195: 450→225
const URI_BOLT_RECOVER_MS = withRecoverFloor(500);
const URI_SWEEP_RANGE_PX = 310;           // =THOR_HARAI_RANGE(流用・§6.28-17「新しい描画方式を作らない」の精神)
const URI_SWEEP_HALF_WIDTH_PX = 40;       // =THOR_HARAI_HALF_WIDTH(流用)
const URI_DOWNSLASH_RANGE_PX = 310;       // ★未決事項: 「前方・細長」の実寸は設計書に無い叩き台(THOR_HARAI_RANGE流用)。
const URI_DOWNSLASH_HALF_WIDTH_PX = 15;   // ★未決事項: 同上(THOR_TSUKI_HALF_WIDTHの「細い」を流用)。
const URI_THRUST_RANGE_PX = MIGUEL_HARAI_RANGE;      // §6.28-4ミゲル踏み込みと同型の攻撃と解釈し同値を流用。
const URI_THRUST_HALF_WIDTH_PX = MIGUEL_HARAI_HALF_WIDTH;

// --- スリィエル(§6.28-18・バッチM62・新規) -----------------------------------------------------
const SURIEL_RINGSHOT_MOVE_MS = 900;
const SURIEL_RINGSHOT_BEAM_WINDUP_MS = 700;
const SURIEL_RINGSHOT_ACTIVE_MS = 220;    // ★未決事項: 「実行」の秒数は設計書に無い(MIGUEL_HARAI_ACTIVE_MS流用)。
const SURIEL_RINGSHOT_RECOVER_MS = withRecoverFloor(530);
const SURIEL_RINGSPIN_WINDUP_MS = 800;
const SURIEL_RINGSPIN_ACTIVE_MS = 600;
const SURIEL_RINGSPIN_RECOVER_MS = withRecoverFloor(700);
const SURIEL_SWEEP_WINDUP_MS = 800;
const SURIEL_SWEEP_ACTIVE_MS = 220;
const SURIEL_SWEEP_RECOVER_MS = withRecoverFloor(650);
const SURIEL_GAZE_WINDUP_MS = 450;
const SURIEL_GAZE_RECOVER_MS = withRecoverFloor(500);
const SURIEL_SWEEP_RANGE_PX = 310;        // =THOR_HARAI_RANGE(流用)
const SURIEL_SWEEP_HALF_WIDTH_PX = 40;    // =THOR_HARAI_HALF_WIDTH(流用)
// v0.25.2579: GIANT_STOMP_RADIUS流用をやめ独立値92で固定+export(描画pixiSceneが同じ値で赤円を描く)。
// 旧: 描画側がGIANT_STOMP_RADIUSを直接参照していたため、踏み鳴らしの範囲拡大(92→130)で
// スリィエルだけ「赤130・判定92」に割れかけた(分類①「赤=判定は厳密一致」違反の芽)。
// ★未決事項(継続): 「近接拒否」円の実寸92は設計書に無い叩き台。
export const SURIEL_RINGSPIN_RADIUS = 92;
const SURIEL_RINGSPIN_TRIGGER_RANGE = 140; // surielScript.SURIEL_RINGSPIN_RANGEと同値(帯の再定義を避けるためimport済み値をそのまま使用)
const SURIEL_BEAM_RANGE = 2600;           // =MIMIR_LASER_VIS_RANGE(流用)
const SURIEL_BEAM_HALF_WIDTH = 20;        // ★未決事項: ビーム半幅は設計書に無い叩き台。
const SURIEL_RING_HOVER_OFFSET_X = 0;
const SURIEL_RING_HOVER_OFFSET_Y = -64;   // 頭上オフセット(px・叩き台=実機微調整前提)
const SURIEL_RING_RETURN_SPEED = 360;     // 環が頭上へ戻る速度(px/s・叩き台)
const SURIEL_RING_DEPLOY_THRESHOLD = 24;  // これ以上頭上から離れていたら「展開中」とみなす(px)
const SURIEL_RING2_OFFSET_PX = 34;        // Phase2の2本目=1本目の進行方向に直交オフセット(視覚専用・下記参照)
void SURIEL_RINGSPIN_TRIGGER_RANGE; // (帯の判定自体はsurielMoveEligible側=surielScript.tsが持つ。ここでは未使用の確認用)

// --- アクラシエル(§6.28-19・バッチM63・新規) ----------------------------------------------------
const ACRASIEL_SPIKE_WINDUP_MS = 1100;
const ACRASIEL_SPIKE_ACTIVE_MS = 240;
const ACRASIEL_SPIKE_RECOVER_MS = withRecoverFloor(500);
const ACRASIEL_SPIKE_RANGE_PX = 310;      // =THOR_HARAI_RANGE(流用)
const ACRASIEL_SPIKE_HALF_WIDTH_PX = 40;  // =THOR_HARAI_HALF_WIDTH(流用)
const ACRASIEL_SPEAR_WINDUP_MS = 700;
const ACRASIEL_SPEAR_RECOVER_MS = withRecoverFloor(500);
const ACRASIEL_SPEAR_COUNT = 6;
const ACRASIEL_SPEAR_RANGE_PX = 310;      // 着地距離(★未決事項: 設計書に無い・THOR_HARAI_RANGE流用)
export const ACRASIEL_SPEAR_DETONATE_MS = 2000;
export const ACRASIEL_SPEAR_RADIUS = 92;  // =GRENADE_BLAST_RADIUS(流用・★未決事項=設計書に無い半径)
const ACRASIEL_WARP_WINDUP_MS = 800;
// v0.25.2609(バッチ2・換算式②違反の是正): 旧800ms。転移先の赤円(半径92px)が見えてから実行までの
// 猶予がこの値そのものなのに、800msでプレイヤーが歩ける距離は 800/1000×104.4 = **83.5px < 92px**。
// ⇒ **見てから歩いても構造的に円から出られない**(=避けようが無い)状態だった。
// minWindupMs(92)=881ms が必要下限。反応の余裕を見て 1000ms(=104.4px)にする。
// 判定半径(ACRASIEL_WARP_IMPACT_RADIUS)と赤円の描画は同じ定数を読むので図形と判定は一致したまま。
export const ACRASIEL_WARP_TELEGRAPH_MS = 1000; // export=描画(pixiScene)が同じ値を読む(v0.25.2893で二重管理を廃止)
const ACRASIEL_WARP_RECOVER_MS = withRecoverFloor(600);
const ACRASIEL_WARP_IMPACT_RADIUS = 92;   // ★未決事項: 「衝撃」の半径は設計書に無い(GRENADE_BLAST_RADIUS流用)。
// export=描画(pixiScene)が同じ値を読む。v0.25.3148で溜め中も赤円を出すようになったため
// (それまで溜めの絵が無く、この値は判定側にしか使われていなかった)。手写しのミラーを作らないこと
// ——ACRASIEL_WARP_TELEGRAPH_MS で実際に事故った型(v0.25.2893)。
export const ACRASIEL_BURST_WINDUP_MS = 1200;
const ACRASIEL_BURST_ACTIVE_MS = 300;
const ACRASIEL_BURST_RECOVER_MS = withRecoverFloor(900);
const ACRASIEL_BURST_RADIUS = 140;        // ★未決事項: 「大円」の半径は設計書に無い叩き台。
const ACRASIEL_GAZE_WINDUP_MS = 450;
const ACRASIEL_GAZE_RECOVER_MS = withRecoverFloor(500);

// --- ラン単位の状態(useGameLoopの各refの移設。両呼び出し側がラン開始時に作り直す) ---
export interface AngelBossState {
  miguelSlow: { slowUntil: number; nextAt: number };
  miguelVolley: { nextShotAt: number; shots: number };
  jibril: { hits: number; lastHitSeen: number; lastWarpHits: number; volleyMode: 'snipe' | 'close'; lastScriptMove: 'lantern' | 'consecrate' | 'volley' | 'lance' | undefined; shots: number; nextShotAt: number; nextFireAt: number; edgeSince: number | undefined };
  rafi: { rejumps: number; boneLeft: number; boneNextAt: number; nextStepAt: number; stepUntil: number; stepDx: number; stepDy: number };
  uri: { shots: number; nextShotAt: number };
  suriel: Record<string, never>; // (環の位置はEnemy側のringX/Y等に永続化=専用のラン内状態は不要)
}
export const createAngelBossState = (): AngelBossState => ({
  miguelSlow: { slowUntil: 0, nextAt: 0 },
  miguelVolley: { nextShotAt: 0, shots: 0 },
  jibril: { hits: 0, lastHitSeen: 0, lastWarpHits: 0, volleyMode: 'snipe', lastScriptMove: undefined, shots: 0, nextShotAt: 0, nextFireAt: 0, edgeSince: undefined },
  rafi: { rejumps: 0, boneLeft: 0, boneNextAt: 0, nextStepAt: 0, stepUntil: 0, stepDx: 0, stepDy: 0 },
  uri: { shots: 0, nextShotAt: 0 },
  suriel: {},
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
  } }));
  const counterBase = getActiveGun(cp)?.damage ?? 12;
  const dmg = counterReplyDamage(counterBase, cp, BOSS_CRIT_DAMAGE_MULT);
  useGameStore.getState().damageEnemy(boss.id, dmg, false, true, false, 'other', 'player', 'counter');
  useGameStore.getState().spawnDamageNumber(bcx, boss.y, dmg, true);
  sfx.reward();
  useGameStore.getState().spawnRing(hitX, hitY, 8, 46, 'rgba(253,224,71,0.95)', 3, 300);
  useGameStore.getState().spawnBurst(hitX, hitY, '#fde047', 10);
  useGameStore.getState().spawnGlow(hitX, hitY, 34, 'rgba(253,224,71,', 240);
};

const bodyOverlapNow = (boss: Enemy): { overlap: boolean; counterActive: boolean } => {
  const cp = useGameStore.getState().player;
  return {
    overlap: rectsOverlap({ x: boss.x, y: boss.y, width: boss.width, height: boss.height }, { x: cp.x, y: cp.y, width: cp.width, height: cp.height }),
    counterActive: Date.now() <= cp.counterWindowEnd,
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
  if (!isBossCounterableNowApprox(boss.aiPhase, boss.bossState)) return null;
  if (boss.type === 'jibril' && boss.bossState === 'warp-recover') return null;
  const { overlap, counterActive } = bodyOverlapNow(boss);
  if (overlap && counterActive) return null; // プレイヤー成立が同フレームに立つ→各州の分岐に譲る
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
      };
      const c = clampRectToPlayableArea(patch.x ?? boss.x, patch.y ?? boss.y, boss.width, boss.height, ctx);
      patch.x = c.x; patch.y = c.y;
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
    s.miguelSlow.nextAt = newGameTime + MIGUEL_SLOW_WALK_MIN_GAP_MS + Math.random() * (MIGUEL_SLOW_WALK_MAX_GAP_MS - MIGUEL_SLOW_WALK_MIN_GAP_MS);
  }
  if (st === 'chase' && newGameTime >= s.miguelSlow.nextAt) {
    s.miguelSlow.slowUntil = newGameTime + MIGUEL_SLOW_WALK_MS;
    s.miguelSlow.nextAt = newGameTime + MIGUEL_SLOW_WALK_MIN_GAP_MS + Math.random() * (MIGUEL_SLOW_WALK_MAX_GAP_MS - MIGUEL_SLOW_WALK_MIN_GAP_MS);
  }
  const slowWalkActive = newGameTime < s.miguelSlow.slowUntil;
  const meleeDashActive = newGameTime - (miguel.meleeHitAt ?? -Infinity) <= MIGUEL_MELEE_DASH_MS;
  const orbitSpeedMult = (meleeDashActive ? MIGUEL_MELEE_DASH_MULT : 1) * (slowWalkActive ? MIGUEL_SLOW_WALK_MULT : 1);
  const halfSize = miguel.height / 2;
  const orbitRadius = GATE_ARENA_RADIUS - MIGUEL_ORBIT_MARGIN - halfSize;

  // 旋回運動(固定のhome中心をCCWで回る)。
  const miguelOrbitMove = (): void => {
    const relX = mcx - mHomeX, relY = mcy - mHomeY;
    const curDist = Math.hypot(relX, relY) || 1;
    const curAngle = Math.atan2(relY, relX);
    // ボスのクリ半減(社長指示v0.25.2422)。他の移動語彙は移動の入口で掛けているのに、
    // ミゲルの旋回だけ抜けていた(v0.25.2895)。
    const angularSpeed = (MIGUEL_ORBIT_SPEED * orbitSpeedMult * bossSlowMult(miguel, newGameTime)) / orbitRadius;
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
    patch.bossStateUntil = newGameTime + ANGEL_COUNTER_LEAP_MS;
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
    patch.aiFromX = aim.x - tx0 * (MIGUEL_HARAI_RANGE / 2);
    patch.aiFromY = aim.y - ty0 * (MIGUEL_HARAI_RANGE / 2);
    patch.aiTargetX = aim.x + tx0 * (MIGUEL_HARAI_RANGE / 2);
    patch.aiTargetY = aim.y + ty0 * (MIGUEL_HARAI_RANGE / 2);
  };

  const miguelFullStun = miguel.bossFullStunUntil !== undefined && newGameTime < miguel.bossFullStunUntil;
  let mGhostFire: GhostCounterFire | null = null;
  if (miguelFullStun) {
    patch.bossState = 'chase';
    patch.bossNextActionAt = newGameTime + BOSS_ACTION_MIN_MS;
  } else if ((mGhostFire = takeGhostAngelCounter(miguel)) !== null) {
    // v0.25.2480: 守護霊カウンター成立。効果はプレイヤー成立と同一(counter-leapまでmiguelCounterHitが設定)。
    miguelCounterHit(mcx, mcy, mGhostFire);
  } else if (st === 'chase') {
    miguelOrbitMove();
    if (newGameTime >= (miguel.bossNextActionAt ?? 0)) {
      const dist = Math.hypot(pcx - mcx, pcy - mcy);
      const dashReady = newGameTime >= (miguel.mDashReadyAt ?? 0);
      const scripted = chooseScriptMove(miguel, 'miguel', 2, () => pickMiguelMove(dist, dashReady));
      const move = scripted.move;
      patch.bossScriptQueue = scripted.remaining;
      if (!move) { applyPatch(miguel.id, patch); return; }
      sfx.alert();
      if (move === 'dash') {
        patch.bossState = 'mdash-windup';
        patch.bossStateUntil = newGameTime + MIGUEL_DASH_WINDUP_MS;
        patch.aiFromX = mcx; patch.aiFromY = mcy;
        // 終点=狙い対象の位置。溜め開始でロック(掟W4)。BOT_AND_GHOST.md §2.8 G2.5。
        const dashAim = miguelHateAim();
        patch.aiTargetX = dashAim.x; patch.aiTargetY = dashAim.y; patch.hateTarget = dashAim.side;
      } else if (move === 'harai') {
        patch.bossState = 'harai-windup';
        patch.bossStateUntil = newGameTime + MIGUEL_HARAI_WINDUP_MS;
        lockHaraiLine();
      } else {
        const volleyAim = miguelHateAim();
        patch.bossState = 'volley-windup';
        patch.bossStateUntil = newGameTime + MIGUEL_VOLLEY_WINDUP_MS;
        patch.hateTarget = volleyAim.side;
      }
    }
  } else if (st === 'volley-windup') {
    const { overlap, counterActive } = bodyOverlapNow(miguel);
    if (overlap && counterActive) {
      miguelCounterHit(mcx, mcy);
    } else if (newGameTime >= (miguel.bossStateUntil ?? 0)) {
      patch.bossState = 'volley';
      patch.bossStateUntil = newGameTime + BOSS_BURST_SHOTS * BOSS_BURST_GAP_MS;
      s.miguelVolley.nextShotAt = newGameTime; s.miguelVolley.shots = 0;
    }
  } else if (st === 'harai-windup' || st === 'tate-windup') {
    // 溜め: 本体静止・カウンター可能。溜め終了で実行へ。
    const { overlap, counterActive } = bodyOverlapNow(miguel);
    if (overlap && counterActive) {
      miguelCounterHit(mcx, mcy);
    } else if (newGameTime >= (miguel.bossStateUntil ?? 0)) {
      patch.bossState = st === 'harai-windup' ? 'harai' : 'tate';
      patch.bossStateUntil = newGameTime + MIGUEL_HARAI_ACTIVE_MS;
      sfx.sweep();
    }
  } else if (st === 'harai' || st === 'tate') {
    // 実行: ロック済みライン上のみ判定(点-線分距離のカプセル)。
    const fx0 = miguel.aiFromX ?? mcx, fy0 = miguel.aiFromY ?? mcy;
    const tx0 = miguel.aiTargetX ?? mcx, ty0 = miguel.aiTargetY ?? mcy;
    const pr = Math.max(player.width, player.height) / 2;
    let countered = false;
    if (distToSegment({ x: pcx, y: pcy }, { x: fx0, y: fy0 }, { x: tx0, y: ty0 }) <= MIGUEL_HARAI_HALF_WIDTH + pr) {
      const cp = useGameStore.getState().player;
      if (Date.now() <= cp.counterWindowEnd) {
        miguelCounterHit((fx0 + tx0) / 2, (fy0 + ty0) / 2);
        countered = true;
        // v0.25.3128(案A): 技を中断=カウンター1回につき1成立に揃える。
        patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, miguel);
      } else {
        const died = useGameStore.getState().damagePlayer(miguel.damage, `${enemyDeathLabel(miguel.type)}の${st === 'harai' ? '払い' : '縦払い'}`, pcx, pcy);
        if (died) onPlayerDeath(pcx, pcy);
      }
    }
    if (!countered && newGameTime >= (miguel.bossStateUntil ?? 0)) {
      if (st === 'harai') {
        sfx.alert();
        patch.bossState = 'tate-windup';
        patch.bossStateUntil = newGameTime + MIGUEL_HARAI_WINDUP_MS;
        // 縦払いも同じ狙いロック(掟W4)。BOT_AND_GHOST.md §2.8 G2.5。
        const tateAim = miguelHateAim();
        patch.aiFromX = tateAim.x;
        patch.aiFromY = tateAim.y - MIGUEL_HARAI_RANGE / 2;
        patch.aiTargetX = tateAim.x;
        patch.aiTargetY = tateAim.y + MIGUEL_HARAI_RANGE / 2;
        patch.hateTarget = tateAim.side;
      } else {
        patch.bossState = 'tate-recover';
        patch.bossStateUntil = newGameTime + choreographyRecoverMs(MIGUEL_TATE_RECOVER_MS, (miguel.bossScriptQueue?.length ?? 0) > 0);
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
    if (s.miguelVolley.shots < BOSS_BURST_SHOTS && newGameTime >= s.miguelVolley.nextShotAt) {
      const aim = miguelLockedAim();
      useGameStore.getState().addProjectile(createEnemyProjectile(miguel, player, aim.x, aim.y));
      s.miguelVolley.shots += 1;
      s.miguelVolley.nextShotAt = newGameTime + BOSS_BURST_GAP_MS;
    }
    if (newGameTime >= (miguel.bossStateUntil ?? 0)) {
      patch.bossState = 'volley-recover';
      patch.bossStateUntil = newGameTime + choreographyRecoverMs(MIGUEL_VOLLEY_RECOVER_MS, (miguel.bossScriptQueue?.length ?? 0) > 0);
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
      patch.bossStateUntil = newGameTime + MIGUEL_DASH_MOVE_MS + MIGUEL_DASH_STRIKE_MS;
      patch.aiStartedAt = newGameTime;
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
      let px2 = pcx - bdx * MIGUEL_DASH_COUNTER_PUSHBACK_PX;
      let py2 = pcy - bdy * MIGUEL_DASH_COUNTER_PUSHBACK_PX;
      const rel = Math.hypot(px2 - mHomeX, py2 - mHomeY);
      const maxRm = GATE_ARENA_RADIUS - MIGUEL_ORBIT_MARGIN - miguel.height / 2;
      if (rel > maxRm) { px2 = mHomeX + ((px2 - mHomeX) / rel) * maxRm; py2 = mHomeY + ((py2 - mHomeY) / rel) * maxRm; }
      patch.x = px2 - miguel.width / 2; patch.y = py2 - miguel.height / 2;
      patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, miguel);
      patch.mDashReadyAt = newGameTime + MIGUEL_DASH_CD_MS * freshCritCdMult(miguel.id, newGameTime);
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
    const moveT = Math.max(0, Math.min(1, elapsed / MIGUEL_DASH_MOVE_MS));
    const nx = fx0 + (tx0 - fx0) * moveT, ny = fy0 + (ty0 - fy0) * moveT;
    patch.x = nx - miguel.width / 2;
    patch.y = ny - miguel.height / 2;
    let countered = false;
    if (elapsed >= MIGUEL_DASH_MOVE_MS) {
      // 到達=斬り抜け1回(既存の払いカプセルを長さ190で流用・設計書指定どおり)。
      let dirx = tx0 - fx0, diry = ty0 - fy0;
      const dl = Math.hypot(dirx, diry) || 1; dirx /= dl; diry /= dl;
      const sx = nx, sy = ny, ex = nx + dirx * MIGUEL_HARAI_RANGE, ey = ny + diry * MIGUEL_HARAI_RANGE;
      const pr = Math.max(player.width, player.height) / 2;
      if (distToSegment({ x: pcx, y: pcy }, { x: sx, y: sy }, { x: ex, y: ey }) <= MIGUEL_HARAI_HALF_WIDTH + pr) {
        const cp = useGameStore.getState().player;
        if (Date.now() <= cp.counterWindowEnd) {
          dashCountered((sx + ex) / 2, (sy + ey) / 2);
          countered = true;
        } else {
          const died = useGameStore.getState().damagePlayer(miguel.damage, `${enemyDeathLabel(miguel.type)}の踏み込み`, pcx, pcy);
          if (died) onPlayerDeath(pcx, pcy);
        }
      }
    }
    if (!countered && newGameTime >= (miguel.bossStateUntil ?? 0)) {
      patch.bossState = 'mdash-recover';
      patch.bossStateUntil = newGameTime + choreographyRecoverMs(MIGUEL_DASH_RECOVER_MS, (miguel.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'mdash-recover') {
    const { overlap, counterActive } = bodyOverlapNow(miguel);
    if (overlap && counterActive) {
      miguelCounterHit(mcx, mcy);
      patch.mDashReadyAt = newGameTime + MIGUEL_DASH_CD_MS * freshCritCdMult(miguel.id, newGameTime);
    } else if (newGameTime >= (miguel.bossStateUntil ?? 0)) {
      patch.mDashReadyAt = newGameTime + MIGUEL_DASH_CD_MS * freshCritCdMult(miguel.id, newGameTime);
      patch.bossState = 'chase';
      patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, miguel);
    }
  } else if (st === 'counter-leap') {
    const fx0 = miguel.aiFromX ?? mcx, fy0 = miguel.aiFromY ?? mcy;
    const tx0 = miguel.aiTargetX ?? mcx, ty0 = miguel.aiTargetY ?? mcy;
    const t = Math.max(0, Math.min(1, 1 - ((miguel.bossStateUntil ?? newGameTime) - newGameTime) / ANGEL_COUNTER_LEAP_MS));
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
    s.miguelSlow.nextAt = newGameTime + MIGUEL_SLOW_WALK_MIN_GAP_MS + Math.random() * (MIGUEL_SLOW_WALK_MAX_GAP_MS - MIGUEL_SLOW_WALK_MIN_GAP_MS);
  }
  if (st === 'chase' && newGameTime >= s.miguelSlow.nextAt) {
    s.miguelSlow.slowUntil = newGameTime + MIGUEL_SLOW_WALK_MS;
    s.miguelSlow.nextAt = newGameTime + MIGUEL_SLOW_WALK_MIN_GAP_MS + Math.random() * (MIGUEL_SLOW_WALK_MAX_GAP_MS - MIGUEL_SLOW_WALK_MIN_GAP_MS);
  }
  const slowWalkActive = newGameTime < s.miguelSlow.slowUntil;
  const meleeDashActive = newGameTime - (miguel.meleeHitAt ?? -Infinity) <= MIGUEL_MELEE_DASH_MS;
  const orbitSpeedMult = (meleeDashActive ? MIGUEL_MELEE_DASH_MULT : 1) * (slowWalkActive ? MIGUEL_SLOW_WALK_MULT : 1);
  const halfSize = miguel.height / 2;
  const orbitRadius = GATE_ARENA_RADIUS - MIGUEL_ORBIT_MARGIN - halfSize;

  const miguelOrbitMove = (): void => {
    const relX = mcx - mHomeX, relY = mcy - mHomeY;
    const curDist = Math.hypot(relX, relY) || 1;
    const curAngle = Math.atan2(relY, relX);
    // ボスのクリ半減(社長指示v0.25.2422)。他の移動語彙は移動の入口で掛けているのに、
    // ミゲルの旋回だけ抜けていた(v0.25.2895)。
    const angularSpeed = (MIGUEL_ORBIT_SPEED * orbitSpeedMult * bossSlowMult(miguel, newGameTime)) / orbitRadius;
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
    patch.bossStateUntil = newGameTime + ANGEL_COUNTER_LEAP_MS;
    patch.aiFromX = mcx; patch.aiFromY = mcy;
    patch.aiTargetX = pcx + (lx / ll) * orbitRadius;
    patch.aiTargetY = pcy + (ly / ll) * orbitRadius;
  };

  const miguelFullStun = miguel.bossFullStunUntil !== undefined && newGameTime < miguel.bossFullStunUntil;
  let mGhostFire: GhostCounterFire | null = null;
  if (miguelFullStun) {
    patch.bossState = 'chase';
    patch.bossNextActionAt = newGameTime + BOSS_ACTION_MIN_MS;
  } else if ((mGhostFire = takeGhostAngelCounter(miguel)) !== null) {
    // v0.25.2480: 守護霊カウンター成立(旧実装フォールバックでも同作法)。
    miguelCounterHit(mcx, mcy, mGhostFire);
  } else if (st === 'chase') {
    miguelOrbitMove();
    if (newGameTime >= (miguel.bossNextActionAt ?? 0)) {
      const canHarai = Math.hypot(pcx - mcx, pcy - mcy) <= HARAI_TRIGGER_DIST;
      if (!canHarai || Math.random() < MIGUEL_VOLLEY_CHANCE_LEGACY) {
        patch.bossState = 'volley';
        patch.bossStateUntil = newGameTime + BOSS_BURST_SHOTS * BOSS_BURST_GAP_MS;
        s.miguelVolley.nextShotAt = newGameTime; s.miguelVolley.shots = 0;
      } else {
        patch.bossState = 'harai-windup';
        patch.bossStateUntil = newGameTime + MIGUEL_HARAI_WINDUP_MS;
        const rx = mcx - pcx, ry = mcy - pcy;
        const rl = Math.hypot(rx, ry) || 1;
        const tx0 = -ry / rl, ty0 = rx / rl;
        patch.aiFromX = pcx - tx0 * (MIGUEL_HARAI_RANGE / 2);
        patch.aiFromY = pcy - ty0 * (MIGUEL_HARAI_RANGE / 2);
        patch.aiTargetX = pcx + tx0 * (MIGUEL_HARAI_RANGE / 2);
        patch.aiTargetY = pcy + ty0 * (MIGUEL_HARAI_RANGE / 2);
      }
    }
  } else if (st === 'harai-windup' || st === 'tate-windup') {
    const { overlap, counterActive } = bodyOverlapNow(miguel);
    if (overlap && counterActive) {
      miguelCounterHit(mcx, mcy);
    } else if (newGameTime >= (miguel.bossStateUntil ?? 0)) {
      patch.bossState = st === 'harai-windup' ? 'harai' : 'tate';
      patch.bossStateUntil = newGameTime + MIGUEL_HARAI_ACTIVE_MS;
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
    if (Math.hypot(pcx - cxp, pcy - cyp) <= MIGUEL_HARAI_HALF_WIDTH + pr) {
      const cp = useGameStore.getState().player;
      if (Date.now() <= cp.counterWindowEnd) {
        miguelCounterHit(cxp, cyp);
        countered = true;
        // v0.25.3128(案A): 技を中断=カウンター1回につき1成立に揃える。
        patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, miguel);
      } else {
        const died = useGameStore.getState().damagePlayer(miguel.damage, `${enemyDeathLabel(miguel.type)}の${st === 'harai' ? '払い' : '縦払い'}`, cxp, cyp);
        if (died) onPlayerDeath(pcx, pcy);
      }
    }
    if (!countered && newGameTime >= (miguel.bossStateUntil ?? 0)) {
      if (st === 'harai') {
        patch.bossState = 'tate-windup';
        patch.bossStateUntil = newGameTime + MIGUEL_HARAI_WINDUP_MS;
        patch.aiFromX = pcx;
        patch.aiFromY = pcy - MIGUEL_HARAI_RANGE / 2;
        patch.aiTargetX = pcx;
        patch.aiTargetY = pcy + MIGUEL_HARAI_RANGE / 2;
      } else {
        patch.bossState = 'chase';
        patch.bossNextActionAt = nextActionDelay(newGameTime, miguel);
      }
    }
  } else if (st === 'volley') {
    miguelOrbitMove();
    if (s.miguelVolley.shots < BOSS_BURST_SHOTS && newGameTime >= s.miguelVolley.nextShotAt) {
      useGameStore.getState().addProjectile(createEnemyProjectile(miguel, player));
      s.miguelVolley.shots += 1;
      s.miguelVolley.nextShotAt = newGameTime + BOSS_BURST_GAP_MS;
    }
    if (newGameTime >= (miguel.bossStateUntil ?? 0)) {
      patch.bossState = 'chase';
      patch.bossNextActionAt = nextActionDelay(newGameTime, miguel);
    }
  } else if (st === 'counter-leap') {
    const fx0 = miguel.aiFromX ?? mcx, fy0 = miguel.aiFromY ?? mcy;
    const tx0 = miguel.aiTargetX ?? mcx, ty0 = miguel.aiTargetY ?? mcy;
    const t = Math.max(0, Math.min(1, 1 - ((miguel.bossStateUntil ?? newGameTime) - newGameTime) / ANGEL_COUNTER_LEAP_MS));
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
    const spd = JIBRIL_RETREAT_SPEED * (jr.hits >= JIBRIL_HITS_FASTER ? JIBRIL_RETREAT_FAST_MULT : 1) * bossSlowMult(jibril, newGameTime);
    let nx = jcx + (ax / al) * spd * bossMoveDt;
    let ny = jcy + (ay / al) * spd * bossMoveDt;
    const rx = nx - jHomeX, ry = ny - jHomeY;
    const rl = Math.hypot(rx, ry);
    if (rl > maxR) { nx = jHomeX + (rx / rl) * maxR; ny = jHomeY + (ry / rl) * maxR; }
    patch.x = nx - jibril.width / 2;
    patch.y = ny - jibril.height / 2;
  };
  const jibrilCounterHit = (hx: number, hy: number, ghost?: GhostCounterFire): void => angelCounterHit(jibril, jcx, hx, hy, sfx, ghost);

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
  const warpTriggered = (jr.hits - jr.lastWarpHits >= JIBRIL_HITS_WARP) || edgeStuckMs >= JIBRIL_EDGE_STICK_MS;

  const jibrilFull = jibril.bossFullStunUntil !== undefined && newGameTime < jibril.bossFullStunUntil;
  let jGhostFire: GhostCounterFire | null = null;
  if (jibrilFull) {
    patch.bossState = 'chase';
    patch.bossNextActionAt = newGameTime + BOSS_ACTION_MIN_MS;
  } else if (warpTriggered && st === 'chase') {
    // (b) 中立からのみ発火(旧: st !== 'warp-*' =実質どの状態からでも割り込んでいた)。
    // 被弾10回による転移(JIBRIL_HITS_WARP)も同じ扱い=技を完走してから転移する。
    sfx.alert();
    patch.bossState = 'warp-windup';
    patch.bossStateUntil = newGameTime + JIBRIL_WARP_WINDUP_MS;
    jr.lastWarpHits = jr.hits;
    jr.edgeSince = undefined;
  } else if ((jGhostFire = takeGhostAngelCounter(jibril)) !== null) {
    // v0.25.2480: 守護霊カウンター成立(転移割り込みより後=プレイヤー時と同じ優先順)。
    // 'warp-recover'はプレイヤー不可の州のためtakeGhostAngelCounterが除外済み。
    jibrilCounterHit(jcx, jcy, jGhostFire);
    patch.bossState = 'chase';
    patch.bossNextActionAt = nextActionDelay(newGameTime, jibril);
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
      patch.bossStateUntil = newGameTime + JIBRIL_WARP_RECOVER_MS;
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
      sfx.alert();
      if (move === 'consecrate') {
        patch.bossState = 'consecrate-windup';
        patch.bossStateUntil = newGameTime + JIBRIL_CONSECRATE_WINDUP_MS;
      } else if (move === 'lantern') {
        const aim = jibrilHateAim();
        patch.bossState = 'lantern-windup';
        patch.bossStateUntil = newGameTime + JIBRIL_LANTERN_WINDUP_MS;
        patch.hateTarget = aim.side;
      } else if (move === 'lance') {
        // v0.25.3197: ランス。狙いは溜め開始でロック(掟W4「予告を出したら向きは変えない」)。
        const aim = jibrilHateAim();
        const dl0 = Math.hypot(aim.x - jcx, aim.y - jcy) || 1;
        patch.aiFromX = jcx; patch.aiFromY = jcy;
        patch.aiTargetX = jcx + ((aim.x - jcx) / dl0) * JIBRIL_LANCE_RANGE_PX;
        patch.aiTargetY = jcy + ((aim.y - jcy) / dl0) * JIBRIL_LANCE_RANGE_PX;
        patch.hateTarget = aim.side;
        patch.bossState = 'lance-windup';
        patch.bossStateUntil = newGameTime + JIBRIL_LANCE_WINDUP_MS;
      } else {
        const aim = jibrilHateAim();
        // 灯籠で足場を縛った後は遠距離狙撃、聖別で接近を強いた後は近距離連射へつなぐ。
        jr.volleyMode = previousMove === 'lantern' ? 'snipe' : previousMove === 'consecrate' ? 'close' : jibrilVolleyMode(dist);
        patch.bossState = 'volley-windup';
        patch.bossStateUntil = newGameTime + JIBRIL_VOLLEY_WINDUP_MS;
        patch.hateTarget = aim.side;
      }
    }
  } else if (st === 'volley-windup') {
    // 予備動作は静止(掟W2)。実行(volley)自体は現行どおり後退しながら撃つ(6.28-6「現行不変」)。
    const { overlap, counterActive } = bodyOverlapNow(jibril);
    if (overlap && counterActive) {
      jibrilCounterHit(jcx, jcy);
      patch.bossState = 'chase';
      patch.bossNextActionAt = nextActionDelay(newGameTime, jibril);
    } else if (newGameTime >= (jibril.bossStateUntil ?? 0)) {
      const gap = jr.volleyMode === 'close' ? BOSS_BURST_GAP_MS : JIBRIL_SNIPE_GAP_MS;
      jr.shots = 0; jr.nextShotAt = newGameTime;
      patch.bossState = 'volley';
      patch.bossStateUntil = newGameTime + JIBRIL_VOLLEY_SHOTS * gap + 200;
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
      const gap = jr.volleyMode === 'close' ? BOSS_BURST_GAP_MS : JIBRIL_SNIPE_GAP_MS;
      if (jr.shots < JIBRIL_VOLLEY_SHOTS && newGameTime >= jr.nextShotAt) {
        // v0.25.3197(社長指示): 奇数発目(1/3/5)=狙い弾、偶数発目(2/4)=全方位リング8発。
        if (jr.shots % 2 === 0) {
          const aim = jibrilLockedAim();
          const proj = createEnemyProjectile(jibril, player, aim.x, aim.y);
          if (jr.volleyMode === 'snipe') proj.speed *= JIBRIL_SNIPE_SPEED_MULT;
          useGameStore.getState().addProjectile(proj);
        } else {
          for (let k = 0; k < JIBRIL_OMNI_BULLETS; k++) {
            const ang = (Math.PI * 2 * k) / JIBRIL_OMNI_BULLETS;
            useGameStore.getState().addProjectile(
              createEnemyProjectile(jibril, player, jcx + Math.cos(ang) * 100, jcy + Math.sin(ang) * 100));
          }
        }
        jr.shots += 1;
        jr.nextShotAt = newGameTime + gap;
      }
      if (jr.shots >= JIBRIL_VOLLEY_SHOTS && newGameTime >= (jibril.bossStateUntil ?? 0)) {
        patch.bossState = 'volley-recover';
        patch.bossStateUntil = newGameTime + choreographyRecoverMs(JIBRIL_VOLLEY_RECOVER_MS, (jibril.bossScriptQueue?.length ?? 0) > 0);
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
    // v0.25.3197: 細い光条。溜め中は体当たりカウンターでも中断できる(他の州と同じ作法)。
    const { overlap, counterActive } = bodyOverlapNow(jibril);
    if (overlap && counterActive) {
      jibrilCounterHit(jcx, jcy);
      patch.bossState = 'chase';
      patch.bossNextActionAt = nextActionDelay(newGameTime, jibril);
    } else if (newGameTime >= (jibril.bossStateUntil ?? 0)) {
      const fx0 = jibril.aiFromX ?? jcx, fy0 = jibril.aiFromY ?? jcy;
      const tx0 = jibril.aiTargetX ?? jcx, ty0 = jibril.aiTargetY ?? jcy;
      // 実体=起爆カプセル。**ブラストパリィ経路がそのままカウンター**(ライン上+窓で弾ける)。
      useGameStore.setState(state => ({
        pumpkinBlasts: [...state.pumpkinBlasts, {
          x: (fx0 + tx0) / 2, y: (fy0 + ty0) / 2, radius: JIBRIL_LANCE_HALF_WIDTH_PX,
          damage: jibril.damage, enemyId: jibril.id,
          capsule: { fx: fx0, fy: fy0, tx: tx0, ty: ty0, halfWidth: JIBRIL_LANCE_HALF_WIDTH_PX },
        }],
      }));
      patch.bossState = 'lance';
      patch.bossStateUntil = newGameTime + JIBRIL_LANCE_BEAM_MS;
    }
  } else if (st === 'lance') {
    if (newGameTime >= (jibril.bossStateUntil ?? 0)) {
      patch.bossState = 'lance-recover';
      patch.bossStateUntil = newGameTime + choreographyRecoverMs(JIBRIL_LANCE_RECOVER_MS, (jibril.bossScriptQueue?.length ?? 0) > 0);
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
      patch.bossStateUntil = newGameTime + JIBRIL_LANTERN_MS;
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
        useGameStore.getState().spawnBossFire(fpx, fpy, newGameTime, newGameTime + JIBRIL_FIRE_TELEGRAPH_MS, newGameTime + JIBRIL_FIRE_TELEGRAPH_MS + JIBRIL_FIRE_LIFE_MS);
        jr.nextFireAt = newGameTime + JIBRIL_FIRE_GAP_MS;
      }
      if (newGameTime >= (jibril.bossStateUntil ?? 0)) {
        patch.bossState = 'lantern-recover';
        patch.bossStateUntil = newGameTime + choreographyRecoverMs(JIBRIL_LANTERN_RECOVER_MS, (jibril.bossScriptQueue?.length ?? 0) > 0);
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
      for (let i = 1; i <= JIBRIL_CONSECRATE_FIRE_COUNT; i++) {
        const ang = gapAngle + (Math.PI * 2 / (JIBRIL_CONSECRATE_FIRE_COUNT + 1)) * i;
        const fx = jcx + Math.cos(ang) * JIBRIL_CONSECRATE_RING_RADIUS, fy = jcy + Math.sin(ang) * JIBRIL_CONSECRATE_RING_RADIUS;
        useGameStore.getState().spawnBossFire(fx, fy, newGameTime, newGameTime + JIBRIL_FIRE_TELEGRAPH_MS, newGameTime + JIBRIL_FIRE_TELEGRAPH_MS + JIBRIL_FIRE_LIFE_MS);
      }
      patch.jConsecrateReadyAt = newGameTime + JIBRIL_CONSECRATE_CD_MS * freshCritCdMult(jibril.id, newGameTime);
      patch.bossState = 'consecrate-recover';
      patch.bossStateUntil = newGameTime + choreographyRecoverMs(JIBRIL_CONSECRATE_RECOVER_MS, (jibril.bossScriptQueue?.length ?? 0) > 0);
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
    patch.bossNextActionAt = newGameTime + BOSS_ACTION_MIN_MS;
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
    const spd = JIBRIL_RETREAT_SPEED * (jr.hits >= JIBRIL_HITS_FASTER ? JIBRIL_RETREAT_FAST_MULT : 1) * bossSlowMult(jibril, newGameTime);
    let nx = jcx + (ax / al) * spd * bossMoveDt;
    let ny = jcy + (ay / al) * spd * bossMoveDt;
    const rx = nx - jHomeX, ry = ny - jHomeY;
    const rl = Math.hypot(rx, ry);
    if (rl > maxR) { nx = jHomeX + (rx / rl) * maxR; ny = jHomeY + (ry / rl) * maxR; }
    patch.x = nx - jibril.width / 2;
    patch.y = ny - jibril.height / 2;
  };

  const jibrilFull = jibril.bossFullStunUntil !== undefined && newGameTime < jibril.bossFullStunUntil;
  if (jr.hits - jr.lastWarpHits >= JIBRIL_HITS_WARP) {
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
    patch.bossNextActionAt = newGameTime + BOSS_ACTION_MIN_MS;
  } else if (jibrilFull) {
    patch.bossState = 'chase';
    patch.bossNextActionAt = newGameTime + BOSS_ACTION_MIN_MS;
  } else if (st === 'chase') {
    retreatMove();
    if (newGameTime >= (jibril.bossNextActionAt ?? 0)) {
      if (Math.random() < JIBRIL_LANTERN_CHANCE_LEGACY) {
        patch.bossState = 'lantern';
        patch.bossStateUntil = newGameTime + JIBRIL_LANTERN_MS;
        jr.nextFireAt = newGameTime;
      } else {
        const dist = Math.hypot(pcx - jcx, pcy - jcy);
        jr.volleyMode = dist <= JIBRIL_HANDGUN_DIST ? 'close' : 'snipe';
        jr.shots = 0;
        jr.nextShotAt = newGameTime;
        const shots = jr.volleyMode === 'close' ? JIBRIL_CLOSE_SHOTS : JIBRIL_SNIPE_SHOTS;
        const gap = jr.volleyMode === 'close' ? BOSS_BURST_GAP_MS : JIBRIL_SNIPE_GAP_MS;
        patch.bossState = 'volley';
        patch.bossStateUntil = newGameTime + shots * gap + 200;
      }
    }
  } else if (st === 'volley') {
    retreatMove();
    const shots = jr.volleyMode === 'close' ? JIBRIL_CLOSE_SHOTS : JIBRIL_SNIPE_SHOTS;
    const gap = jr.volleyMode === 'close' ? BOSS_BURST_GAP_MS : JIBRIL_SNIPE_GAP_MS;
    if (jr.shots < shots && newGameTime >= jr.nextShotAt) {
      const proj = createEnemyProjectile(jibril, player);
      if (jr.volleyMode === 'snipe') proj.speed *= JIBRIL_SNIPE_SPEED_MULT;
      useGameStore.getState().addProjectile(proj);
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
      useGameStore.getState().spawnBossFire(fpx, fpy, newGameTime, newGameTime + JIBRIL_FIRE_TELEGRAPH_MS, newGameTime + JIBRIL_FIRE_TELEGRAPH_MS + JIBRIL_FIRE_LIFE_MS);
      jr.nextFireAt = newGameTime + JIBRIL_FIRE_GAP_MS;
    }
    if (newGameTime >= (jibril.bossStateUntil ?? 0)) {
      patch.bossState = 'chase';
      patch.bossNextActionAt = nextActionDelay(newGameTime, jibril);
    }
  } else {
    patch.bossState = 'chase';
    patch.bossNextActionAt = newGameTime + BOSS_ACTION_MIN_MS;
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

  const rafiFull = rafi.bossFullStunUntil !== undefined && newGameTime < rafi.bossFullStunUntil;
  let rGhostFire: GhostCounterFire | null = null;
  if (rafiFull) {
    patch.bossState = 'chase'; patch.bossNextActionAt = newGameTime + BOSS_ACTION_MIN_MS;
  } else if ((rGhostFire = takeGhostAngelCounter(rafi)) !== null) {
    // v0.25.2480: 守護霊カウンター成立(効果=プレイヤー成立の各州分岐と同一のchase復帰)。
    rafiCounterHit(rcx, rcy, rGhostFire);
    patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, rafi);
  } else if (st === 'chase') {
    const stepMinGap = phase === 2 ? RAFI_STEP_MIN_GAP_MS_P2 : RAFI_STEP_MIN_GAP_MS;
    const stepMaxGap = phase === 2 ? RAFI_STEP_MAX_GAP_MS_P2 : RAFI_STEP_MAX_GAP_MS;
    if (newGameTime < rr.stepUntil) {
      // ボスのクリ半減(社長指示v0.25.2422)。chaseMoveには掛かっているのに、
      // 横ステップだけ抜けていた(v0.25.2895)。
      const stepSpd = RAFI_STEP_SPEED * bossSlowMult(rafi, newGameTime);
      const c = clampArena(rcx + rr.stepDx * stepSpd * bossMoveDt, rcy + rr.stepDy * stepSpd * bossMoveDt);
      patch.x = c.x - rafi.width / 2; patch.y = c.y - rafi.height / 2;
    } else if (rr.nextStepAt !== 0 && newGameTime >= rr.nextStepAt) {
      const dx = pcx - rcx, dy = pcy - rcy; const dl = Math.hypot(dx, dy) || 1;
      const side = Math.random() < 0.5 ? 1 : -1;
      rr.stepDx = (-dy / dl) * side; rr.stepDy = (dx / dl) * side;
      rr.stepUntil = newGameTime + RAFI_STEP_MS;
      rr.nextStepAt = newGameTime + RAFI_STEP_MS + stepMinGap + Math.random() * (stepMaxGap - stepMinGap);
    } else {
      if (rr.nextStepAt === 0) rr.nextStepAt = newGameTime + stepMinGap + Math.random() * (stepMaxGap - stepMinGap);
      chaseMove(RAFI_CHASE_SPEED);
    }
    if (newGameTime >= rr.stepUntil && newGameTime >= (rafi.bossNextActionAt ?? 0)) {
      const dist = Math.hypot(pcx - rcx, pcy - rcy);
      const sweepReady = newGameTime >= (rafi.rSweepReadyAt ?? 0);
      const scripted = chooseScriptMove(rafi, 'rafi', phase, () => pickRafiMove(dist, phase, sweepReady));
      const move = scripted.move;
      patch.bossScriptQueue = scripted.remaining;
      if (move) {
        sfx.alert();
        rr.rejumps = 0;
        if (move === 'sweep') {
          patch.bossState = 'sweep-windup';
          patch.bossStateUntil = newGameTime + RAFI_SWEEP_WINDUP_MS;
          // BOT_AND_GHOST.md §2.8 G2.5: 狙いロック(pcx/pcyの代わりにヘイト対象の中心)。
          const sweepAim = resolveBossHateAim(rafi, { x: pcx, y: pcy }, store.summons, newGameTime);
          patch.hateTarget = sweepAim.side;
          const ddl = Math.hypot(sweepAim.x - rcx, sweepAim.y - rcy) || 1;
          const dirx = (sweepAim.x - rcx) / ddl, diry = (sweepAim.y - rcy) / ddl;
          patch.aiFromX = rcx; patch.aiFromY = rcy;
          patch.aiTargetX = rcx + dirx * RAFI_SWEEP_RANGE_PX; patch.aiTargetY = rcy + diry * RAFI_SWEEP_RANGE_PX;
        } else if (move === 'bone') {
          const aim = rafiHateAim();
          patch.bossState = 'bone-windup';
          patch.bossStateUntil = newGameTime + RAFI_BONE_WINDUP_MS;
          patch.hateTarget = aim.side;
        } else {
          patch.bossState = 'jump-windup';
          patch.bossStateUntil = newGameTime + RAFI_JUMP_WINDUP_MS;
          // ★v0.25.3148(バグ修正): **着地点は溜め(jump-windup)の開始でロックする**。
          // 旧実装は jump-attack への遷移時にロックしていたため、溜め700msの間に描かれる赤い円が
          // **前の技の残留 aiTargetX/Y=まったく別の場所**を指していた(回避可能性の走査v0.25.3146で
          // 発覚。pixiScene側のコメントは「windupでロック済み」と書いてあり実装と食い違っていた)。
          // ⇒ 予告時間が実質360ms(滞空ぶん)しか無く、しかもその前の700msは**嘘の位置**だった。
          // 掟W4「予告を出したら向きは変えない」= 出す時にロックする、が正しい形。
          const jaim = rafiHateAim();
          patch.aiFromX = rcx; patch.aiFromY = rcy;
          patch.aiTargetX = jaim.x; patch.aiTargetY = jaim.y; patch.hateTarget = jaim.side;
        }
      }
    }
  } else if (st === 'bone-windup') {
    const { overlap, counterActive } = bodyOverlapNow(rafi);
    if (overlap && counterActive) {
      rafiCounterHit(rcx, rcy);
      patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, rafi);
    } else if (newGameTime >= (rafi.bossStateUntil ?? 0)) {
      patch.bossState = 'bone'; rr.boneLeft = RAFI_BONE_COUNT; rr.boneNextAt = newGameTime;
      // v0.25.3078(社長指示): 撃ち始めに「これから飛ぶ本数」の骨刃が全方位へドバッと出る予兆。
      store.spawnFanBurst(rcx, rcy, 'rafi-blade', RAFI_BONE_COUNT);
    }
  } else if (st === 'bone') {
    if (rr.boneLeft > 0 && newGameTime >= rr.boneNextAt) {
      const aimTgt = rafiLockedAim();
      const a0 = Math.random() * Math.PI * 2;
      const dist = SKADI_BLADE_RING_MIN + Math.random() * (SKADI_BLADE_RING_MAX - SKADI_BLADE_RING_MIN);
      const sx = aimTgt.x + Math.cos(a0) * dist, sy = aimTgt.y + Math.sin(a0) * dist;
      const aim = Math.atan2(aimTgt.y - sy, aimTgt.x - sx);
      useGameStore.getState().spawnSkadiBlade(sx, sy, aim, newGameTime + SKADI_BLADE_DELAY_MS, rafi.id, 'bone');
      rr.boneLeft -= 1;
      rr.boneNextAt = newGameTime + RAFI_BONE_GAP_MS;
    }
    if (rr.boneLeft <= 0) {
      patch.bossState = 'bone-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(RAFI_BONE_RECOVER_MS, (rafi.bossScriptQueue?.length ?? 0) > 0);
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
    const { overlap, counterActive } = bodyOverlapNow(rafi);
    if (overlap && counterActive) {
      rafiCounterHit(rcx, rcy);
      if (rr.rejumps < RAFI_JUMP_MAX_REJUMPS) {
        rr.rejumps += 1;
        patch.bossState = 'jump-windup';
        patch.bossStateUntil = newGameTime + RAFI_JUMP_WINDUP_MS;
        // 再ジャンプも「溜め開始でロック」(v0.25.3148・上と同じ理由)。
        const rjAim = rafiHateAim();
        patch.aiFromX = rcx; patch.aiFromY = rcy;
        patch.aiTargetX = rjAim.x; patch.aiTargetY = rjAim.y; patch.hateTarget = rjAim.side;
      } else {
        patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, rafi);
      }
    } else if (newGameTime >= (rafi.bossStateUntil ?? 0)) {
      patch.bossState = 'jump-attack';
      patch.bossStateUntil = newGameTime + RAFI_JUMP_MS;
      // ★着地点(aiTargetX/Y)は**溜め開始でロック済み**なので、ここでは狙い直さない
      // (v0.25.3148。狙い直すと「赤い円を見て避けた先へ追ってくる」=予告が嘘になる)。
      // 飛び出し位置(aiFromX/Y)だけは実際に飛ぶ瞬間の位置へ更新する=弧の始点。
      patch.aiFromX = rcx; patch.aiFromY = rcy;
    }
  } else if (st === 'jump-attack') {
    const fx0 = rafi.aiFromX ?? rcx, fy0 = rafi.aiFromY ?? rcy;
    const tx0 = rafi.aiTargetX ?? rcx, ty0 = rafi.aiTargetY ?? rcy;
    const t = Math.max(0, Math.min(1, 1 - ((rafi.bossStateUntil ?? newGameTime) - newGameTime) / RAFI_JUMP_MS));
    // v0.25.3076(社長指示「滑空って全てのジャンプね」): 等速の線形補間をやめ、両端で速度も
    // 加速度も0になる曲線で運ぶ(着地時刻・着地点・着地爆発はすべて不変)。
    const tEs = airHopEase01(t);
    patch.x = (fx0 + (tx0 - fx0) * tEs) - rafi.width / 2;
    patch.y = (fy0 + (ty0 - fy0) * tEs) - rafi.height / 2;
    if (newGameTime >= (rafi.bossStateUntil ?? 0)) {
      useGameStore.setState(state => ({
        pumpkinBlasts: [...state.pumpkinBlasts, { x: tx0, y: ty0, radius: RAFI_JUMP_RADIUS, damage: rafi.damage, enemyId: rafi.id }],
      }));
      patch.bossState = 'jump-recover';
      patch.bossStateUntil = newGameTime + choreographyRecoverMs(RAFI_JUMP_RECOVER_MS, (rafi.bossScriptQueue?.length ?? 0) > 0);
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
          x: (sfx0 + stx0) / 2, y: (sfy0 + sty0) / 2, radius: RAFI_SWEEP_HALF_WIDTH_PX,
          damage: rafi.damage, enemyId: rafi.id,
          capsule: { fx: sfx0, fy: sfy0, tx: stx0, ty: sty0, halfWidth: RAFI_SWEEP_HALF_WIDTH_PX },
        }],
      }));
      patch.bossState = 'sweep'; patch.bossStateUntil = newGameTime + RAFI_SWEEP_ACTIVE_MS;
    }
  } else if (st === 'sweep') {
    if (newGameTime >= (rafi.bossStateUntil ?? 0)) {
      patch.bossState = 'sweep-recover';
      patch.bossStateUntil = newGameTime + choreographyRecoverMs(RAFI_SWEEP_RECOVER_MS, (rafi.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'sweep-recover') {
    const { overlap, counterActive } = bodyOverlapNow(rafi);
    if (overlap && counterActive) {
      rafiCounterHit(rcx, rcy);
      patch.rSweepReadyAt = newGameTime + RAFI_SWEEP_CD_MS * freshCritCdMult(rafi.id, newGameTime);
      patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, rafi);
    } else if (newGameTime >= (rafi.bossStateUntil ?? 0)) {
      patch.rSweepReadyAt = newGameTime + RAFI_SWEEP_CD_MS * freshCritCdMult(rafi.id, newGameTime);
      patch.bossState = 'chase'; patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, rafi);
    }
  } else {
    patch.bossState = 'chase'; patch.bossNextActionAt = newGameTime + BOSS_ACTION_MIN_MS;
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
    patch.bossState = 'chase'; patch.bossNextActionAt = newGameTime + BOSS_ACTION_MIN_MS;
  } else if ((rGhostFire = takeGhostAngelCounter(rafi)) !== null) {
    // v0.25.2480: 守護霊カウンター成立(旧実装フォールバックでも同作法)。
    rafiCounterHit(rcx, rcy, rGhostFire);
    patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, rafi);
  } else if (st === 'chase') {
    if (newGameTime < rr.stepUntil) {
      // ボスのクリ半減(社長指示v0.25.2422)。chaseMoveには掛かっているのに、
      // 横ステップだけ抜けていた(v0.25.2895)。
      const stepSpd = RAFI_STEP_SPEED * bossSlowMult(rafi, newGameTime);
      const c = clampArena(rcx + rr.stepDx * stepSpd * bossMoveDt, rcy + rr.stepDy * stepSpd * bossMoveDt);
      patch.x = c.x - rafi.width / 2; patch.y = c.y - rafi.height / 2;
    } else if (rr.nextStepAt !== 0 && newGameTime >= rr.nextStepAt) {
      const dx = pcx - rcx, dy = pcy - rcy; const dl = Math.hypot(dx, dy) || 1;
      const side = Math.random() < 0.5 ? 1 : -1;
      rr.stepDx = (-dy / dl) * side; rr.stepDy = (dx / dl) * side;
      rr.stepUntil = newGameTime + RAFI_STEP_MS;
      rr.nextStepAt = newGameTime + RAFI_STEP_MS + RAFI_STEP_MIN_GAP_MS + Math.random() * (RAFI_STEP_MAX_GAP_MS - RAFI_STEP_MIN_GAP_MS);
    } else {
      if (rr.nextStepAt === 0) rr.nextStepAt = newGameTime + RAFI_STEP_MIN_GAP_MS + Math.random() * (RAFI_STEP_MAX_GAP_MS - RAFI_STEP_MIN_GAP_MS);
      chaseMove(RAFI_CHASE_SPEED);
    }
    if (newGameTime >= rr.stepUntil && newGameTime >= (rafi.bossNextActionAt ?? 0)) {
      const dist = Math.hypot(pcx - rcx, pcy - rcy);
      rr.rejumps = 0;
      if (dist <= RAFI_HANDGUN_DIST) {
        patch.bossState = 'bone';
        rr.boneLeft = RAFI_BONE_COUNT; rr.boneNextAt = newGameTime;
      } else {
        patch.bossState = 'jump-windup';
        patch.bossStateUntil = newGameTime + RAFI_JUMP_WINDUP_MS;
        // v0.25.3148: 旧実装側も同じ形に揃える(片方だけ直すと ?rafiscript=0 で嘘の円が残る)。
        patch.aiFromX = rcx; patch.aiFromY = rcy;
        patch.aiTargetX = pcx; patch.aiTargetY = pcy;
      }
    }
  } else if (st === 'bone') {
    if (rr.boneLeft > 0 && newGameTime >= rr.boneNextAt) {
      const a0 = Math.random() * Math.PI * 2;
      const dist = SKADI_BLADE_RING_MIN + Math.random() * (SKADI_BLADE_RING_MAX - SKADI_BLADE_RING_MIN);
      const sx = pcx + Math.cos(a0) * dist, sy = pcy + Math.sin(a0) * dist;
      const aim = Math.atan2(pcy - sy, pcx - sx);
      useGameStore.getState().spawnSkadiBlade(sx, sy, aim, newGameTime + SKADI_BLADE_DELAY_MS, rafi.id, 'bone');
      rr.boneLeft -= 1;
      rr.boneNextAt = newGameTime + RAFI_BONE_GAP_MS;
    }
    if (rr.boneLeft <= 0) {
      patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, rafi);
    }
  } else if (st === 'jump-windup') {
    const { overlap, counterActive } = bodyOverlapNow(rafi);
    if (overlap && counterActive) {
      rafiCounterHit(rcx, rcy);
      if (rr.rejumps < RAFI_JUMP_MAX_REJUMPS) {
        rr.rejumps += 1;
        patch.bossState = 'jump-windup';
        patch.bossStateUntil = newGameTime + RAFI_JUMP_WINDUP_MS;
        patch.aiFromX = rcx; patch.aiFromY = rcy;
        patch.aiTargetX = pcx; patch.aiTargetY = pcy;
      } else {
        patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, rafi);
      }
    } else if (newGameTime >= (rafi.bossStateUntil ?? 0)) {
      patch.bossState = 'jump-attack';
      patch.bossStateUntil = newGameTime + RAFI_JUMP_MS;
      // 着地点は溜め開始でロック済み(v0.25.3148)。飛び出し位置だけ更新。
      patch.aiFromX = rcx; patch.aiFromY = rcy;
    }
  } else if (st === 'jump-attack') {
    const fx0 = rafi.aiFromX ?? rcx, fy0 = rafi.aiFromY ?? rcy;
    const tx0 = rafi.aiTargetX ?? rcx, ty0 = rafi.aiTargetY ?? rcy;
    const t = Math.max(0, Math.min(1, 1 - ((rafi.bossStateUntil ?? newGameTime) - newGameTime) / RAFI_JUMP_MS));
    // v0.25.3076(社長指示「滑空って全てのジャンプね」): 等速の線形補間をやめ、両端で速度も
    // 加速度も0になる曲線で運ぶ(着地時刻・着地点・着地爆発はすべて不変)。
    const tEs = airHopEase01(t);
    patch.x = (fx0 + (tx0 - fx0) * tEs) - rafi.width / 2;
    patch.y = (fy0 + (ty0 - fy0) * tEs) - rafi.height / 2;
    if (newGameTime >= (rafi.bossStateUntil ?? 0)) {
      useGameStore.setState(state => ({
        pumpkinBlasts: [...state.pumpkinBlasts, { x: tx0, y: ty0, radius: RAFI_JUMP_RADIUS, damage: rafi.damage, enemyId: rafi.id }],
      }));
      patch.bossState = 'jump-recover';
      patch.bossStateUntil = newGameTime + RAFI_JUMP_RECOVER_MS;
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
    patch.bossState = 'chase'; patch.bossNextActionAt = newGameTime + BOSS_ACTION_MIN_MS;
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

  const uriFull = uri.bossFullStunUntil !== undefined && newGameTime < uri.bossFullStunUntil;
  let uGhostFire: GhostCounterFire | null = null;
  if (uriFull) {
    patch.bossState = 'chase'; patch.bossNextActionAt = newGameTime + BOSS_ACTION_MIN_MS;
  } else if ((uGhostFire = takeGhostAngelCounter(uri)) !== null) {
    // v0.25.2480: 守護霊カウンター成立(効果=プレイヤー成立の各州分岐と同一のchase復帰)。
    uriCounterHit(ucx, ucy, uGhostFire);
    patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, uri);
  } else if (st === 'chase') {
    chaseMove(uri.speed);
    if (newGameTime >= (uri.bossNextActionAt ?? 0)) {
      const dist = Math.hypot(pcx - ucx, pcy - ucy);
      const scripted = chooseScriptMove(uri, 'uri', phase, () => pickUriMove(dist));
      const move = scripted.move;
      patch.bossScriptQueue = scripted.remaining;
      if (move) {
        sfx.alert();
        if (move === 'sweep') {
          patch.bossState = 'sweep-windup'; patch.bossStateUntil = newGameTime + URI_SWEEP_WINDUP_MS;
          // BOT_AND_GHOST.md §2.8 G2.5: 狙いロック(pcx/pcyの代わりにヘイト対象の中心)。
          const sweepAim = resolveBossHateAim(uri, { x: pcx, y: pcy }, store.summons, newGameTime);
          patch.hateTarget = sweepAim.side;
          const ddl = Math.hypot(sweepAim.x - ucx, sweepAim.y - ucy) || 1; const dirx = (sweepAim.x - ucx) / ddl, diry = (sweepAim.y - ucy) / ddl;
          // §6.28-17「図形と判定は必ず一致させる」: ドーナツ(内径くり抜き)ではなく、カプセルの
          // 始点そのものを内径ぶん前へ出す(=原点から innerRadius だけ進んだ点を始点とする通常の
          // カプセル)。半幅40≪内径140/90なので描画は既存T3帯の内側を塗らないだけで済む(社長裁定)。
          const innerR = uriSweepInnerRadius(phase);
          patch.aiFromX = ucx + dirx * innerR; patch.aiFromY = ucy + diry * innerR;
          patch.aiTargetX = ucx + dirx * URI_SWEEP_RANGE_PX; patch.aiTargetY = ucy + diry * URI_SWEEP_RANGE_PX;
        } else if (move === 'downslash') {
          patch.bossState = 'downslash-windup'; patch.bossStateUntil = newGameTime + URI_DOWNSLASH_WINDUP_MS;
          // BOT_AND_GHOST.md §2.8 G2.5: 狙いロック(pcx/pcyの代わりにヘイト対象の中心)。
          const dsAim = resolveBossHateAim(uri, { x: pcx, y: pcy }, store.summons, newGameTime);
          patch.hateTarget = dsAim.side;
          const ddl = Math.hypot(dsAim.x - ucx, dsAim.y - ucy) || 1; const dirx = (dsAim.x - ucx) / ddl, diry = (dsAim.y - ucy) / ddl;
          patch.aiFromX = ucx; patch.aiFromY = ucy;
          patch.aiTargetX = ucx + dirx * URI_DOWNSLASH_RANGE_PX; patch.aiTargetY = ucy + diry * URI_DOWNSLASH_RANGE_PX;
        } else if (move === 'thrust') {
          patch.bossState = 'thrust-windup'; patch.bossStateUntil = newGameTime + URI_THRUST_WINDUP_MS;
          // BOT_AND_GHOST.md §2.8 G2.5: 狙いロック(pcx/pcyの代わりにヘイト対象の中心)。
          const thrustAim = resolveBossHateAim(uri, { x: pcx, y: pcy }, store.summons, newGameTime);
          patch.aiFromX = ucx; patch.aiFromY = ucy; patch.aiTargetX = thrustAim.x; patch.aiTargetY = thrustAim.y;
          patch.hateTarget = thrustAim.side;
        } else {
          const aim = uriHateAim();
          patch.bossState = 'bolt-windup'; patch.bossStateUntil = newGameTime + URI_BOLT_WINDUP_MS;
          patch.hateTarget = aim.side;
        }
      }
    }
  } else if (st === 'sweep-windup') {
    const { overlap, counterActive } = bodyOverlapNow(uri);
    if (overlap && counterActive) {
      uriCounterHit(ucx, ucy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, uri);
    } else if (newGameTime >= (uri.bossStateUntil ?? 0)) {
      patch.bossState = 'sweep'; patch.bossStateUntil = newGameTime + URI_SWEEP_ACTIVE_MS;
    }
  } else if (st === 'sweep') {
    // 始点(aiFromX/Y)は溜め開始時に既に内径ぶん前へ出してある(通常のカプセル判定=distToSegment)。
    const fx0 = uri.aiFromX ?? ucx, fy0 = uri.aiFromY ?? ucy, tx0 = uri.aiTargetX ?? ucx, ty0 = uri.aiTargetY ?? ucy;
    const pr = Math.max(player.width, player.height) / 2;
    let countered = false;
    if (distToSegment({ x: pcx, y: pcy }, { x: fx0, y: fy0 }, { x: tx0, y: ty0 }) <= URI_SWEEP_HALF_WIDTH_PX + pr) {
      const cp = useGameStore.getState().player;
      if (Date.now() <= cp.counterWindowEnd) { uriCounterHit(pcx, pcy); countered = true; /* v0.25.3128(案A): カウンター成立で**技を中断**。判定が出続ける技は毎フレーム範囲内を見るので、止めない限り窓の間ずっと成立し続けていた(旧 countered は「今フレームは硬直へ進めない」だけだった)。 */ patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, uri); }
      else {
        const died = useGameStore.getState().damagePlayer(uri.damage, `${enemyDeathLabel(uri.type)}の大薙ぎ`, pcx, pcy);
        if (died) onPlayerDeath(pcx, pcy);
      }
    }
    if (!countered && newGameTime >= (uri.bossStateUntil ?? 0)) {
      patch.bossState = 'sweep-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(URI_SWEEP_RECOVER_MS, (uri.bossScriptQueue?.length ?? 0) > 0);
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
      patch.bossState = 'downslash'; patch.bossStateUntil = newGameTime + URI_DOWNSLASH_ACTIVE_MS;
    }
  } else if (st === 'downslash') {
    const fx0 = uri.aiFromX ?? ucx, fy0 = uri.aiFromY ?? ucy, tx0 = uri.aiTargetX ?? ucx, ty0 = uri.aiTargetY ?? ucy;
    const pr = Math.max(player.width, player.height) / 2;
    let countered = false;
    if (distToSegment({ x: pcx, y: pcy }, { x: fx0, y: fy0 }, { x: tx0, y: ty0 }) <= URI_DOWNSLASH_HALF_WIDTH_PX + pr) {
      const cp = useGameStore.getState().player;
      if (Date.now() <= cp.counterWindowEnd) { uriCounterHit(pcx, pcy); countered = true; /* v0.25.3128(案A): カウンター成立で**技を中断**。判定が出続ける技は毎フレーム範囲内を見るので、止めない限り窓の間ずっと成立し続けていた(旧 countered は「今フレームは硬直へ進めない」だけだった)。 */ patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, uri); }
      else {
        const died = useGameStore.getState().damagePlayer(uri.damage, `${enemyDeathLabel(uri.type)}の振り下ろし`, pcx, pcy);
        if (died) onPlayerDeath(pcx, pcy);
      }
    }
    if (!countered && newGameTime >= (uri.bossStateUntil ?? 0)) {
      patch.bossState = 'downslash-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(URI_DOWNSLASH_RECOVER_MS, (uri.bossScriptQueue?.length ?? 0) > 0);
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
      patch.bossState = 'thrust'; patch.bossStateUntil = newGameTime + URI_THRUST_MOVE_MS + URI_THRUST_STRIKE_MS;
      patch.aiStartedAt = newGameTime;
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
      const pushed = clampArena(pcx - bdx * MIGUEL_DASH_COUNTER_PUSHBACK_PX, pcy - bdy * MIGUEL_DASH_COUNTER_PUSHBACK_PX);
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
    const moveT = Math.max(0, Math.min(1, elapsed / URI_THRUST_MOVE_MS));
    const nx = fx0 + (tx0 - fx0) * moveT, ny = fy0 + (ty0 - fy0) * moveT;
    patch.x = nx - uri.width / 2; patch.y = ny - uri.height / 2;
    let countered = false;
    if (elapsed >= URI_THRUST_MOVE_MS) {
      let dirx = tx0 - fx0, diry = ty0 - fy0; const dl = Math.hypot(dirx, diry) || 1; dirx /= dl; diry /= dl;
      const sx = nx, sy = ny, ex = nx + dirx * URI_THRUST_RANGE_PX, ey = ny + diry * URI_THRUST_RANGE_PX;
      const pr = Math.max(player.width, player.height) / 2;
      if (distToSegment({ x: pcx, y: pcy }, { x: sx, y: sy }, { x: ex, y: ey }) <= URI_THRUST_HALF_WIDTH_PX + pr) {
        const cp = useGameStore.getState().player;
        if (Date.now() <= cp.counterWindowEnd) {
          thrustCountered((sx + ex) / 2, (sy + ey) / 2); countered = true;
        }
        else {
          const died = useGameStore.getState().damagePlayer(uri.damage, `${enemyDeathLabel(uri.type)}の踏み込み突き`, pcx, pcy);
          if (died) onPlayerDeath(pcx, pcy);
        }
      }
    }
    if (!countered && newGameTime >= (uri.bossStateUntil ?? 0)) {
      patch.bossState = 'thrust-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(URI_THRUST_RECOVER_MS, (uri.bossScriptQueue?.length ?? 0) > 0);
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
      patch.bossState = 'bolt'; patch.bossStateUntil = newGameTime + BOSS_BURST_SHOTS * BOSS_BURST_GAP_MS;
      s.uri.nextShotAt = newGameTime; s.uri.shots = 0;
    }
  } else if (st === 'bolt') {
    if (s.uri.shots < BOSS_BURST_SHOTS && newGameTime >= s.uri.nextShotAt) {
      const aim = uriLockedAim();
      useGameStore.getState().addProjectile(createEnemyProjectile(uri, player, aim.x, aim.y));
      s.uri.shots += 1; s.uri.nextShotAt = newGameTime + BOSS_BURST_GAP_MS;
    }
    if (newGameTime >= (uri.bossStateUntil ?? 0)) {
      patch.bossState = 'bolt-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(URI_BOLT_RECOVER_MS, (uri.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'bolt-recover') {
    const { overlap, counterActive } = bodyOverlapNow(uri);
    if (overlap && counterActive) {
      uriCounterHit(ucx, ucy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, uri);
    } else if (newGameTime >= (uri.bossStateUntil ?? 0)) {
      patch.bossState = 'chase'; patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, uri);
    }
  } else {
    patch.bossState = 'chase'; patch.bossNextActionAt = newGameTime + BOSS_ACTION_MIN_MS;
  }

  applyPatch(uri.id, patch);
};

// ============================================================================================
// --- スリィエル(§6.28-18 バッチM62・新規) ----------------------------------------------------
// ============================================================================================
const surielHoverPoint = (scx: number, scy: number): { x: number; y: number } =>
  ({ x: scx + SURIEL_RING_HOVER_OFFSET_X, y: scy + SURIEL_RING_HOVER_OFFSET_Y });

const surielRingDeployed = (ringX: number | undefined, ringY: number | undefined, scx: number, scy: number): boolean => {
  if (ringX === undefined || ringY === undefined) return false;
  const hp = surielHoverPoint(scx, scy);
  return Math.hypot(ringX - hp.x, ringY - hp.y) > SURIEL_RING_DEPLOY_THRESHOLD;
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

  const deployed = surielRingDeployed(suriel.ringX, suriel.ringY, scx, scy);

  const surielFull = suriel.bossFullStunUntil !== undefined && newGameTime < suriel.bossFullStunUntil;
  let sGhostFire: GhostCounterFire | null = null;
  if (surielFull) {
    patch.bossState = 'chase'; patch.bossNextActionAt = newGameTime + BOSS_ACTION_MIN_MS;
  } else if ((sGhostFire = takeGhostAngelCounter(suriel)) !== null) {
    // v0.25.2480: 守護霊カウンター成立(効果=プレイヤー成立の各州分岐と同一のchase復帰)。
    surielCounterHit(scx, scy, sGhostFire);
    patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, suriel);
  } else if (st === 'chase') {
    chaseMove(suriel.speed);
    // 環を頭上へ戻す(未展開の間・展開中は次の技が動かすまでそのまま=「離れている間だけ使う」判定の土台)。
    const hp = surielHoverPoint(scx, scy);
    const rx = suriel.ringX ?? hp.x, ry = suriel.ringY ?? hp.y;
    const rdx = hp.x - rx, rdy = hp.y - ry; const rdl = Math.hypot(rdx, rdy);
    if (rdl > 1) {
      const step = Math.min(rdl, SURIEL_RING_RETURN_SPEED * bossMoveDt);
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
        sfx.alert();
        if (move === 'ringshot') {
          patch.bossState = 'ring-move-windup'; patch.bossStateUntil = newGameTime + SURIEL_RINGSHOT_MOVE_MS;
          patch.aiFromX = suriel.ringX ?? hp.x; patch.aiFromY = suriel.ringY ?? hp.y;
          // BOT_AND_GHOST.md §2.8 G2.5: 狙いロック(pcx/pcyの代わりにヘイト対象の中心)。
          const ringshotAim = resolveBossHateAim(suriel, { x: pcx, y: pcy }, store.summons, newGameTime);
          patch.aiTargetX = 2 * ringshotAim.x - scx; patch.aiTargetY = 2 * ringshotAim.y - scy; // 対象の反対側=挟む
          patch.aiStartedAt = newGameTime; patch.hateTarget = ringshotAim.side;
        } else if (move === 'ringspin') {
          patch.bossState = 'ring-spin-windup'; patch.bossStateUntil = newGameTime + SURIEL_RINGSPIN_WINDUP_MS;
        } else if (move === 'sweep') {
          patch.bossState = 'sweep-windup'; patch.bossStateUntil = newGameTime + SURIEL_SWEEP_WINDUP_MS;
          // BOT_AND_GHOST.md §2.8 G2.5: 狙いロック(pcx/pcyの代わりにヘイト対象の中心)。
          const sweepAim = resolveBossHateAim(suriel, { x: pcx, y: pcy }, store.summons, newGameTime);
          patch.hateTarget = sweepAim.side;
          const ddl = Math.hypot(sweepAim.x - scx, sweepAim.y - scy) || 1; const dirx = (sweepAim.x - scx) / ddl, diry = (sweepAim.y - scy) / ddl;
          patch.aiFromX = scx; patch.aiFromY = scy;
          patch.aiTargetX = scx + dirx * SURIEL_SWEEP_RANGE_PX; patch.aiTargetY = scy + diry * SURIEL_SWEEP_RANGE_PX;
        } else {
          patch.bossState = 'gaze-windup'; patch.bossStateUntil = newGameTime + SURIEL_GAZE_WINDUP_MS;
          const gazeAim = resolveBossHateAim(suriel, { x: pcx, y: pcy }, store.summons, newGameTime);
          patch.aiTargetX = gazeAim.x; patch.aiTargetY = gazeAim.y; patch.hateTarget = gazeAim.side;
        }
      }
    }
  } else if (st === 'ring-move-windup') {
    const { overlap, counterActive } = bodyOverlapNow(suriel);
    if (overlap && counterActive) {
      surielCounterHit(scx, scy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, suriel);
    } else {
      const fx0 = suriel.aiFromX ?? scx, fy0 = suriel.aiFromY ?? scy, tx0 = suriel.aiTargetX ?? scx, ty0 = suriel.aiTargetY ?? scy;
      const elapsed = newGameTime - (suriel.aiStartedAt ?? newGameTime);
      const t = Math.max(0, Math.min(1, elapsed / SURIEL_RINGSHOT_MOVE_MS));
      patch.ringX = fx0 + (tx0 - fx0) * t; patch.ringY = fy0 + (ty0 - fy0) * t;
      if (elapsed >= SURIEL_RINGSHOT_MOVE_MS) {
        patch.bossState = 'ring-beam-windup';
        patch.bossStateUntil = newGameTime + SURIEL_RINGSHOT_BEAM_WINDUP_MS;
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
      patch.bossState = 'ring-active'; patch.bossStateUntil = newGameTime + SURIEL_RINGSHOT_ACTIVE_MS;
    }
  } else if (st === 'ring-active') {
    const fx0 = suriel.aiFromX ?? scx, fy0 = suriel.aiFromY ?? scy, tx0 = suriel.aiTargetX ?? scx, ty0 = suriel.aiTargetY ?? scy;
    let dirx = tx0 - fx0, diry = ty0 - fy0; const dl = Math.hypot(dirx, diry) || 1; dirx /= dl; diry /= dl;
    const ex = fx0 + dirx * SURIEL_BEAM_RANGE, ey = fy0 + diry * SURIEL_BEAM_RANGE;
    const pr = Math.max(player.width, player.height) / 2;
    let countered = false;
    if (distToSegment({ x: pcx, y: pcy }, { x: fx0, y: fy0 }, { x: ex, y: ey }) <= SURIEL_BEAM_HALF_WIDTH + pr) {
      const cp = useGameStore.getState().player;
      if (Date.now() <= cp.counterWindowEnd) { surielCounterHit(pcx, pcy); countered = true; /* v0.25.3128(案A): カウンター成立で**技を中断**。判定が出続ける技は毎フレーム範囲内を見るので、止めない限り窓の間ずっと成立し続けていた(旧 countered は「今フレームは硬直へ進めない」だけだった)。 */ patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, suriel); }
      else {
        const died = useGameStore.getState().damagePlayer(suriel.damage, `${enemyDeathLabel(suriel.type)}の環の射出`, pcx, pcy);
        if (died) onPlayerDeath(pcx, pcy);
      }
    }
    if (!countered && newGameTime >= (suriel.bossStateUntil ?? 0)) {
      patch.bossState = 'ring-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(SURIEL_RINGSHOT_RECOVER_MS, (suriel.bossScriptQueue?.length ?? 0) > 0);
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
      patch.bossState = 'ring-spin'; patch.bossStateUntil = newGameTime + SURIEL_RINGSPIN_ACTIVE_MS; patch.aiStartedAt = newGameTime;
    }
    patch.ringX = scx; patch.ringY = scy; // 回転斬りの前に環を本体へ引き寄せる(近接拒否の絵)
  } else if (st === 'ring-spin') {
    const spinT = (newGameTime - (suriel.aiStartedAt ?? newGameTime)) / 120;
    patch.ringX = scx + Math.cos(spinT) * SURIEL_RINGSPIN_RADIUS;
    patch.ringY = scy + Math.sin(spinT) * SURIEL_RINGSPIN_RADIUS;
    const pr = Math.max(player.width, player.height) / 2;
    let countered = false;
    if (Math.hypot(pcx - scx, pcy - scy) <= SURIEL_RINGSPIN_RADIUS + pr) {
      const cp = useGameStore.getState().player;
      if (Date.now() <= cp.counterWindowEnd) { surielCounterHit(pcx, pcy); countered = true; /* v0.25.3128(案A): カウンター成立で**技を中断**。判定が出続ける技は毎フレーム範囲内を見るので、止めない限り窓の間ずっと成立し続けていた(旧 countered は「今フレームは硬直へ進めない」だけだった)。 */ patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, suriel); }
      else {
        const died = useGameStore.getState().damagePlayer(suriel.damage, `${enemyDeathLabel(suriel.type)}の環の回転斬`, pcx, pcy);
        if (died) onPlayerDeath(pcx, pcy);
      }
    }
    if (!countered && newGameTime >= (suriel.bossStateUntil ?? 0)) {
      patch.bossState = 'ring-spin-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(SURIEL_RINGSPIN_RECOVER_MS, (suriel.bossScriptQueue?.length ?? 0) > 0);
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
      patch.bossState = 'sweep'; patch.bossStateUntil = newGameTime + SURIEL_SWEEP_ACTIVE_MS;
    }
  } else if (st === 'sweep') {
    const fx0 = suriel.aiFromX ?? scx, fy0 = suriel.aiFromY ?? scy, tx0 = suriel.aiTargetX ?? scx, ty0 = suriel.aiTargetY ?? scy;
    const pr = Math.max(player.width, player.height) / 2;
    let countered = false;
    if (distToSegment({ x: pcx, y: pcy }, { x: fx0, y: fy0 }, { x: tx0, y: ty0 }) <= SURIEL_SWEEP_HALF_WIDTH_PX + pr) {
      const cp = useGameStore.getState().player;
      if (Date.now() <= cp.counterWindowEnd) { surielCounterHit(pcx, pcy); countered = true; /* v0.25.3128(案A): カウンター成立で**技を中断**。判定が出続ける技は毎フレーム範囲内を見るので、止めない限り窓の間ずっと成立し続けていた(旧 countered は「今フレームは硬直へ進めない」だけだった)。 */ patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, suriel); }
      else {
        const died = useGameStore.getState().damagePlayer(suriel.damage, `${enemyDeathLabel(suriel.type)}の本体の薙ぎ`, pcx, pcy);
        if (died) onPlayerDeath(pcx, pcy);
      }
    }
    if (!countered && newGameTime >= (suriel.bossStateUntil ?? 0)) {
      patch.bossState = 'sweep-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(SURIEL_SWEEP_RECOVER_MS, (suriel.bossScriptQueue?.length ?? 0) > 0);
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
      patch.bossState = 'gaze-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(SURIEL_GAZE_RECOVER_MS, (suriel.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'gaze-recover') {
    const { overlap, counterActive } = bodyOverlapNow(suriel);
    if (overlap && counterActive) {
      surielCounterHit(scx, scy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, suriel);
    } else if (newGameTime >= (suriel.bossStateUntil ?? 0)) {
      patch.bossState = 'chase'; patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, suriel);
    }
  } else {
    patch.bossState = 'chase'; patch.bossNextActionAt = newGameTime + BOSS_ACTION_MIN_MS;
    const hp = surielHoverPoint(scx, scy); patch.ringX = hp.x; patch.ringY = hp.y;
  }

  // §6.28-18 Phase2「環が2つ」: 2本目は1本目に追従する視覚専用の環(★未決事項に記録=独立した
  // 攻撃判定は持たせない簡略化。1本目の進行方向に直交オフセットして「並んで飛ぶ」見た目にする)。
  if (surielRingCount(phase) === 2) {
    const r1x = patch.ringX ?? suriel.ringX ?? scx, r1y = patch.ringY ?? suriel.ringY ?? scy;
    let dx = r1x - scx, dy = r1y - scy; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    patch.ring2X = r1x + (-dy) * SURIEL_RING2_OFFSET_PX;
    patch.ring2Y = r1y + dx * SURIEL_RING2_OFFSET_PX;
  } else if (suriel.ring2X !== undefined || suriel.ring2Y !== undefined) {
    patch.ring2X = undefined; patch.ring2Y = undefined;
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

  const acrasielFull = acrasiel.bossFullStunUntil !== undefined && newGameTime < acrasiel.bossFullStunUntil;
  let aGhostFire: GhostCounterFire | null = null;
  if (acrasielFull) {
    patch.bossState = 'chase'; patch.bossNextActionAt = newGameTime + BOSS_ACTION_MIN_MS;
  } else if ((aGhostFire = takeGhostAngelCounter(acrasiel)) !== null) {
    // v0.25.2480: 守護霊カウンター成立(効果=プレイヤー成立の各州分岐と同一のchase復帰。
    // 'warp-out'はプレイヤー可だが語尾判定に載らない=請求が積まれず対象外・報告済みの狭い側)。
    acrasielCounterHit(acx, acy, aGhostFire);
    patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, acrasiel);
  } else if (st === 'chase') {
    // 動かない(speed:0)。技の抽選のみ行う。
    if (newGameTime >= (acrasiel.bossNextActionAt ?? 0)) {
      const distance = Math.hypot(pcx - acx, pcy - acy);
      const scripted = chooseScriptMove(acrasiel, 'acrasiel', phase, () => pickAcrasielMove(distance, phase));
      const move = scripted.move;
      patch.bossScriptQueue = scripted.remaining;
      if (move) {
        sfx.alert();
        if (move === 'spike') {
          patch.bossState = 'spike-windup'; patch.bossStateUntil = newGameTime + ACRASIEL_SPIKE_WINDUP_MS;
          patch.spikeGapMask = pickSpikeGapMask(acrasielSpikeGapCount(phase));
        } else if (move === 'spear') {
          patch.bossState = 'spear-windup'; patch.bossStateUntil = newGameTime + ACRASIEL_SPEAR_WINDUP_MS;
        } else if (move === 'warp') {
          patch.bossState = 'warp-out'; patch.bossStateUntil = newGameTime + ACRASIEL_WARP_WINDUP_MS;
        } else if (move === 'burst') {
          patch.bossState = 'burst-windup'; patch.bossStateUntil = newGameTime + ACRASIEL_BURST_WINDUP_MS;
        } else {
          patch.bossState = 'gaze-windup'; patch.bossStateUntil = newGameTime + ACRASIEL_GAZE_WINDUP_MS;
          // ロック(掟W4)。BOT_AND_GHOST.md §2.8 G2.5: pcx/pcyの代わりにヘイト対象の中心。
          const gazeAim = resolveBossHateAim(acrasiel, { x: pcx, y: pcy }, store.summons, newGameTime);
          patch.aiTargetX = gazeAim.x; patch.aiTargetY = gazeAim.y; patch.hateTarget = gazeAim.side;
        }
      }
    }
  } else if (st === 'spike-windup') {
    const { overlap, counterActive } = bodyOverlapNow(acrasiel);
    if (overlap && counterActive) {
      acrasielCounterHit(acx, acy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, acrasiel);
    } else if (newGameTime >= (acrasiel.bossStateUntil ?? 0)) {
      patch.bossState = 'spike'; patch.bossStateUntil = newGameTime + ACRASIEL_SPIKE_ACTIVE_MS;
    }
  } else if (st === 'spike') {
    const mask = acrasiel.spikeGapMask ?? 0;
    const pr = Math.max(player.width, player.height) / 2;
    let hit = false;
    for (let sector = 0; sector < 8; sector++) {
      if (isSpikeGapSector(mask, sector)) continue;
      const ang = sector * (Math.PI / 4);
      const ex = acx + Math.cos(ang) * ACRASIEL_SPIKE_RANGE_PX, ey = acy + Math.sin(ang) * ACRASIEL_SPIKE_RANGE_PX;
      if (distToSegment({ x: pcx, y: pcy }, { x: acx, y: acy }, { x: ex, y: ey }) <= ACRASIEL_SPIKE_HALF_WIDTH_PX + pr) { hit = true; break; }
    }
    let countered = false;
    if (hit) {
      const cp = useGameStore.getState().player;
      if (Date.now() <= cp.counterWindowEnd) { acrasielCounterHit(pcx, pcy); countered = true; /* v0.25.3128(案A): カウンター成立で**技を中断**。判定が出続ける技は毎フレーム範囲内を見るので、止めない限り窓の間ずっと成立し続けていた(旧 countered は「今フレームは硬直へ進めない」だけだった)。 */ patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, acrasiel); }
      else {
        const died = useGameStore.getState().damagePlayer(acrasiel.damage, `${enemyDeathLabel(acrasiel.type)}の放射棘`, pcx, pcy);
        if (died) onPlayerDeath(pcx, pcy);
      }
    }
    if (!countered && newGameTime >= (acrasiel.bossStateUntil ?? 0)) {
      patch.bossState = 'spike-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(ACRASIEL_SPIKE_RECOVER_MS, (acrasiel.bossScriptQueue?.length ?? 0) > 0);
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
      for (let i = 0; i < ACRASIEL_SPEAR_COUNT; i++) {
        const ang = (Math.PI * 2 / ACRASIEL_SPEAR_COUNT) * i;
        const lx = acx + Math.cos(ang) * ACRASIEL_SPEAR_RANGE_PX, ly = acy + Math.sin(ang) * ACRASIEL_SPEAR_RANGE_PX;
        useGameStore.getState().spawnAcrasielSpear(lx, ly, ang, newGameTime, newGameTime + ACRASIEL_SPEAR_DETONATE_MS, acrasiel.damage, acrasiel.id);
      }
      patch.bossState = 'spear-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(ACRASIEL_SPEAR_RECOVER_MS, (acrasiel.bossScriptQueue?.length ?? 0) > 0);
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
      patch.bossState = 'warp-in'; patch.bossStateUntil = newGameTime + ACRASIEL_WARP_TELEGRAPH_MS;
    }
  } else if (st === 'warp-in') {
    if (newGameTime >= (acrasiel.bossStateUntil ?? 0)) {
      const tx = acrasiel.aiTargetX ?? acx, ty = acrasiel.aiTargetY ?? acy;
      const pr = Math.max(player.width, player.height) / 2;
      if (Math.hypot(pcx - tx, pcy - ty) <= ACRASIEL_WARP_IMPACT_RADIUS + pr) {
        const died = useGameStore.getState().damagePlayer(acrasiel.damage, `${enemyDeathLabel(acrasiel.type)}の転移衝撃`, tx, ty);
        if (died) onPlayerDeath(tx, ty);
      }
      patch.bossState = 'warp-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(ACRASIEL_WARP_RECOVER_MS, (acrasiel.bossScriptQueue?.length ?? 0) > 0);
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
      patch.bossState = 'burst'; patch.bossStateUntil = newGameTime + ACRASIEL_BURST_ACTIVE_MS;
    }
  } else if (st === 'burst') {
    const pr = Math.max(player.width, player.height) / 2;
    let countered = false;
    if (Math.hypot(pcx - acx, pcy - acy) <= ACRASIEL_BURST_RADIUS + pr) {
      const cp = useGameStore.getState().player;
      if (Date.now() <= cp.counterWindowEnd) { acrasielCounterHit(pcx, pcy); countered = true; /* v0.25.3128(案A): カウンター成立で**技を中断**。判定が出続ける技は毎フレーム範囲内を見るので、止めない限り窓の間ずっと成立し続けていた(旧 countered は「今フレームは硬直へ進めない」だけだった)。 */ patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, acrasiel); }
      else {
        const died = useGameStore.getState().damagePlayer(acrasiel.damage, `${enemyDeathLabel(acrasiel.type)}の爆発`, pcx, pcy);
        if (died) onPlayerDeath(pcx, pcy);
      }
    }
    if (!countered && newGameTime >= (acrasiel.bossStateUntil ?? 0)) {
      patch.bossState = 'burst-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(ACRASIEL_BURST_RECOVER_MS, (acrasiel.bossScriptQueue?.length ?? 0) > 0);
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
      patch.bossState = 'gaze-recover'; patch.bossStateUntil = newGameTime + choreographyRecoverMs(ACRASIEL_GAZE_RECOVER_MS, (acrasiel.bossScriptQueue?.length ?? 0) > 0);
    }
  } else if (st === 'gaze-recover') {
    const { overlap, counterActive } = bodyOverlapNow(acrasiel);
    if (overlap && counterActive) {
      acrasielCounterHit(acx, acy); patch.bossState = 'chase'; patch.bossNextActionAt = nextActionDelay(newGameTime, acrasiel);
    } else if (newGameTime >= (acrasiel.bossStateUntil ?? 0)) {
      patch.bossState = 'chase'; patch.bossNextActionAt = scriptOrNeutralAt(newGameTime, acrasiel);
    }
  } else {
    patch.bossState = 'chase'; patch.bossNextActionAt = newGameTime + BOSS_ACTION_MIN_MS;
  }

  applyPatch(acrasiel.id, patch);
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
  const hitR = JIBRIL_FIRE_RADIUS + Math.min(pl.width, pl.height) / 2;
  let died = false;
  let struck = false;
  const survivors: typeof bf = [];
  for (const f of bf) {
    if (newGameTime >= f.expireAt) continue;
    const active = newGameTime >= f.activateAt;
    if (active && !pl.invulnerable && !died && !struck && Math.hypot(plcx - f.x, plcy - f.y) <= hitR) {
      struck = true;
      const d = useGameStore.getState().damagePlayer(JIBRIL_FIRE_DAMAGE, 'CODE:JIBRIL のランタン火', f.x, f.y);
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
export const tickAcrasielSpears = (newGameTime: number, onPlayerDeath: (x: number, y: number) => void): void => {
  const spears = useGameStore.getState().acrasielSpears;
  if (spears.length === 0) return;
  const pl = useGameStore.getState().player;
  const plcx = pl.x + pl.width / 2, plcy = pl.y + pl.height / 2;
  const pr = Math.max(pl.width, pl.height) / 2;
  let died = false;
  const survivors: typeof spears = [];
  for (const sp of spears) {
    if (newGameTime >= sp.fireAt) {
      if (!pl.invulnerable && !died && Math.hypot(plcx - sp.x, plcy - sp.y) <= ACRASIEL_SPEAR_RADIUS + pr) {
        const d = useGameStore.getState().damagePlayer(sp.damage, `${enemyDeathLabel('acrasiel')}の結晶の槍`, sp.x, sp.y);
        if (d) { died = true; onPlayerDeath(plcx, plcy); }
      }
      continue;
    }
    survivors.push(sp);
  }
  if (survivors.length !== spears.length) useGameStore.getState().setAcrasielSpears(survivors);
};
