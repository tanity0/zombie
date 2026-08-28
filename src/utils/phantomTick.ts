// research/GHOST_BOSS.md v6(守護霊ボス「幻影」v2「守護霊ミラー」): 頭脳+攻撃のコントローラ。
//
// ## 何をするファイルか
// 社長ゴール(言葉のまま):「めちゃくちゃ弱いなー。やはりプレイヤーと条件を一緒にしないと」
// 「全てプレイヤーと同条件。じゃないと意味がないので。最終的にオンライン対戦を意識してください。」
// 裁定(v5):「そもそも紫ゲージ無くす。予告無し。全て同じ。」
//
// ## 形(v6でこの形に確定)
//  - **頭脳**: 既存 `decideGhost`(ghostDriver)を「対プレイヤー」アダプタで流用する(自前ステアを
//    書かない)。preferredDist・counterChance・reactionMs・移動リズムが台帳のまま生きる。
//  - **近接**: **即発ミラー**。予告(windup)も硬直(recover)も無い=プレイヤーのタップ近接と同条件。
//    発火は**自前の周期タイマー**で、周期は `GHOST_COUNTER_MELEE_PERIOD_MS`(=プレイヤーの
//    COUNTER_WINDOW+COUNTER_COOLDOWN)を import して流用する(数字を写経しない)。
//  - **銃**: 守護霊(ghost-ally)の霊体武器ループと同じ部品(createWeapon / effectiveFireCooldown /
//    begin・finishWeaponReload(リザーブ∞)/ zoomedGunRange)で、**台帳武器の実性能**を撃つ。
//  - **被弾**: `phantomGate`(gameStore側)が無敵とパリィを裁く。ここはパリィ成立の**合図を消費**して
//    即反撃を1回割り込ませるだけ(二重書き手を作らない)。
//  - **止まらない**: 通常被弾のノックバック・固めでは技も移動も止まらない(プレイヤーと同条件)。
//    押し道具(鞭・シールドバッシュ)の shove 窓だけは自分で座標を上書きしない=押される。
//
// ## 掟(CLAUDE.md)
//  - 移動は必ず ①障害物衝突(resolveBountyMove) → ②`clampRectToPlayableArea` の順で通す。
//  - **時計の混在**(ENGINEERING_NOTES.md): 周期タイマー・gp*打刻は `gameTime`、
//    `knockbackShoveUntil` / `liftUntil` / decideGhost の内部CD・リロードは `Date.now()`。
//    **混ぜて比較しない**。このファイルは両方を引数で受け取り、それぞれの世界の中だけで比較する。
//  - 慣性: 振りの絵(踏み込み→戻り)は描画側(pixiScene)がイーズで出す。判定は即発の1回。
import type { Enemy, EnemyType, Player, Projectile, SubWeaponKey, Weapon } from '../types/game';
import {
  isCounterActive, // ★カウンター成立の唯一の判定(v0.25.3926・刃が出ている間だけ)
  useGameStore, resolveBountyMove, CRIT_DAMAGE_MULT,
  COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG,
  MELEE_FINISH_SLOW_MS, MELEE_FINISH_SLOW_HOLD_MS,
  // ★research/SAME_ARENA.md O-2: 幻影の攻撃力を**プレイヤーと同じ純関数**で評価する
  // (式を複製しない=「写すな、共通化しろ」)。主語だけ幻影の疑似Playerに差し替える。
  combatActorPlayer, skillCritMult, skillOutgoingDamageMult,
  // ★SAME_ARENA.md §7(前隙・社長裁定2026-08-24)
  MELEE_WINDUP_MS,                              // 近接の前隙(プレイヤーと同じ1本を読む)
  KNOCKBACK_SPEED, KNOCKBACK_DURATION,          // カウンターされた側のノックバック=**敵と同じ量**(社長指示)
  meleeLungePx, MELEE_LUNGE_MS, knockbackSpeedFor, // ★踏み込み(プレイヤーと同じ関数=武器別も揃う)
  playerPvpChipPatch,                           // ★SAME_ARENA §9: プレイヤー体勢の削り(紫入りの破棄込み)
  showPvpFatalOnPlayerPresentation,             // ★2026-08-27: 幻影→プレイヤーの致命もKILL演出(ズーム)
  skillBenkeiCritBonus, skillKnifeMasterMeleeCrit, // ★裁定①: 近接クリ式のミラー(検収監査 中⑥)
  resolveShieldWalls, shieldPlayableCtx, // ★B6(盾押し・§6)
} from '../store/gameStore';
import { softCapCritChance } from './critSoftCap'; // ★§13-3d: 近接クリ式のミラーに同じソフトキャップ
// ★SAME_ARENA §9(対人体勢): 幻影・プレイヤーが対称に持つ隠し体勢の純関数。
import {
  tickPvpPosture, isPvpIncapacitated, isPvpFatalTarget, pvpFatalDamage, pvpAfterFatal,
  markPvpCritSlow, pvpMoveMult,
} from './pvpPosture';
import { HUMAN_REACTION_MS } from './bossSkeleton'; // ★人の反応時間(このゲームの正本)。幻影の反応下限に使う
import { clampRectToPlayableArea, type PlayableAreaCtx } from '../world/playableArea';
import { rectsOverlap } from '../world/obstacles'; // ★B6(盾押し・§6)
import { pushShieldRect } from '../world/shieldPush'; // ★B6(盾押し・§6): 純関数
import { createEnemyProjectile } from './enemyUtils';
import { distToBandRect } from './geometry';
import {
  createWeapon, effectiveFireCooldown, beginWeaponReload, finishWeaponReload,
  projectileFlightStats, zoomedGunRange, RANGE_BY_CATEGORY,
  gunShotCritChance,
} from './weaponUtils';
import { GRAVITY_SHOT_BOSS_SLOW_MULT } from './skillEffectsB7';
import {
  decideGhost, GHOST_COUNTER_MELEE_PERIOD_MS, type GhostDecision, type GhostProfile,
  shouldGhostClaimSub,
} from './ghostDriver';
import { strongestGuardian } from '../data/fixedGuardians';
import { PLAYER_PROFILES } from '../data/playerProfiles';
import { GUARDIAN_PHANTOM_LABEL } from './bossPractice';
import { actorBuildFor } from './ghostBuild';
import { getPhantomIdentity, phantomDisplayLabel, phantomClassId } from './phantomIdentity'; // SAME_ARENA O-5: その回の人格 // SAME_ARENA: 記録どおりの武器を守護霊と同じ道具で引く
import { GUARDIAN_PHANTOM_TUNING as GP_T, PVP_DAMAGE_SCALE } from './phantomScript';
import { isTrapDebuffed, TRAP_ROOT_CRIT_BONUS } from './trapDebuff';
import { critDecayOnHit } from './critDecay'; // ★§13-3e クリ減衰(SAME_ARENA対称)

/** 制御対象の型(判定の出どころを1箇所に)。 */
export const GUARDIAN_PHANTOM_TYPE: EnemyType = 'guardian-phantom';

/** 被弾の出どころ表示(死亡ログ等)。名前は台帳1箇所から作る(人物名を写経しない)。 */
// ★O-5: 人格が変わると名前も変わるので関数にする(旧: モジュール定数)。
// 未設定なら従来と同じ文字列=1bit不変。
export const guardianPhantomMeleeSource = (): string => `${phantomDisplayLabel()}の斬撃`;
/** 互換: 旧定数(未設定時の表示=従来値)。 */
export const GUARDIAN_PHANTOM_MELEE_SOURCE = `${GUARDIAN_PHANTOM_LABEL}の斬撃`;

// =================================================================================================
// 台帳から効かせるデータ(research/GHOST_BOSS.md「台帳から効かせるデータ」)
// =================================================================================================
/**
 * 幻影の頭脳へ渡すプロファイル。**守護霊台帳の最強データ(strongestGuardian)そのもの**を
 * `GhostProfile` の形へ写すだけ(値を発明しない)。
 */
// ★research/SAME_ARENA.md O-5: 幻影の癖は**その回の人格**(`phantomIdentity`)から取る。
// 人格はスポーンで1回決まり、以後ランタイムで変わらないので**人格ごとに1回だけ**組んで使い回す。
// 人格が未設定(旧経路)なら従来どおり台帳の最強データ=**1bit同じ**。
let profileCache: { key: string; value: GhostProfile } | null = null;
export const phantomProfile = (): GhostProfile => {
  const identity = getPhantomIdentity();
  const key = identity?.name ?? '__strongest__';
  if (profileCache && profileCache.key === key) return profileCache.value;
  const p = identity?.profile ?? strongestGuardian().profile;
  const built: GhostProfile = {
    // ★人間の反応下限でクランプ(社長裁定2026-08-24「原則同じ条件にして」・SAME_ARENA.md §7)。
    // 台帳の値は 100〜130ms で、**人間には出せない速さ**(このゲーム自身が
    // `bossSkeleton.HUMAN_REACTION_MS = 250` を「人の反応時間」として持ち、カウンター可能な
    // 予告の下限 550ms をそこから導いて機械検査している)。近接に前隙200msが入った今、
    // クランプしないと**幻影だけが前隙に「反応で後出し」でき、社長は予測しかできない**という
    // 最悪の不公平になる。下限を入れれば両者とも予測=対等。
    reactionMs: Math.max(HUMAN_REACTION_MS, p.reactionMs),
    counterChance: p.counterChance,
    preferredDist: p.preferredDist,
    meleeBias: p.meleeBias,
    mobility: p.mobility,
    hitsPerMin: p.hitsPerMin,
    subUsesPerMin: p.subUsesPerMin,
    stationaryFrac: p.stationaryFrac,
    approachPerMin: p.approachPerMin,
    // 技への反応表は**渡さない**: 表のキーは「ボスの技」で、幻影から見た相手はプレイヤー=
    // 技キーが引けない。渡しても常にフォールバックになるだけなので配線しない。
  };
  profileCache = { key, value: built };
  return built;
};

/**
 * ★v6の帰結(明記): 近接の発火は**周期タイマー単独**になったので、台帳の `meleeBias` は
 * 近接の頻度には効かない(decideGhost の melee 意図は縁74px以内でしか立たず、reach160の外側が
 * 死ぬため使わない)。個性は**間合いの取り方**(preferredDist / 移動リズム)として残る。
 */
export const PHANTOM_MELEE_PERIOD_MS = GHOST_COUNTER_MELEE_PERIOD_MS;

/**
 * ★幻影が**主語になれるサブウェポン**(research/SAME_ARENA.md O-3)。
 *
 * 社長報告2026-08-24(実機): 「幻影が自分のデコイに消されてたり、自分のトラップにハマってる」。
 * 真因は**この白リストが無かったこと**——サブの主語ディスパッチ(useGameLoop)は「その種を持っていて
 * 自前CDが明けていれば幻影が主語」という汎用の式なので、**まだ実装していない種まで幻影が使えていた**。
 *
 * 設置系(トラップ/デコイ/タレット/盾/地雷)は例外なく **「`enemies` を走査して敵を捕まえる」** 形で
 * 書かれている。幻影は `enemies` の一員なので、幻影が置くと:
 *  - **宛先にプレイヤーが入らない**(プレイヤーは `enemies` に居ない)=そもそも機能しない
 *  - **自分自身が唯一の候補になる**=自分のトラップで拘束され、自分のデコイに処理される(=自爆)
 * つまり「所有者判定が抜けている」のではなく、**設置系はまだ幻影に対応していない**のが正しい理解
 * (SAME_ARENA §3-d「残りのサブは同型の繰り返しではない」がまさにこれを指していた)。
 *
 * ⇒ **実装済みの種だけをここに列挙する。**新しい種を O-3b-2 で実装したら、その時ここへ足す
 * (白リストを増やすのが「実装した」の定義になる=取りこぼしが構造的に起きない)。
 */
export const PHANTOM_SUPPORTED_SUBS: readonly SubWeaponKey[] = [
  'heavy-grenade', // O-3a(v0.25.3856)
  'fire-knife',    // O-3b-1(v0.25.3859)
  // ★O-3b-2 設置系(社長指示2026-08-25「とりあえず幻影も設置してください」)。
  // 解禁の前提だった「プレイヤーが壊せる」は v0.25.3880(PLACED_DURABILITY)で揃った。
  // 解禁と同時に**置いた物へ `hostile: true` を焼く**(=宛先がプレイヤー側になる)ので、
  // v0.25.3879 の自爆(自分しか対象がいない)は再発しない。
  'marksman-trap',
  'decoy',
  'turret',
  'shield',
  'sensor-mine',
  // ★O-3b-2 召喚系(社長裁定2026-08-25「4種ともやる」)。ドッグは**拾わずに消す**
  // (社長「犬は触れて消すだけ…要は邪魔だけするっていう」)=取得ではないので
  // 「霊は世界の物を自分の物にしない」線を跨がない。仕様=SAME_ARENA §3-d-4。
  'dog',
];
/** その種を幻影が主語として使えるか(未実装の種は必ずプレイヤーへフォールバックする)。 */
export const phantomSupportsSub = (key: SubWeaponKey): boolean =>
  PHANTOM_SUPPORTED_SUBS.includes(key);


// ★旧 PHANTOM_PARRY_SHOVE_PX/MS(幻影専用の小さい叩き台)は撤去した。
// 社長指示2026-08-24「カウンターされた側はノックバックも敵と同じく」により、
// 敵と共通の KNOCKBACK_SPEED / KNOCKBACK_DURATION を使う(対称性のため専用値を持たない)。

/**
 * ★社長裁定v0.25.3641「いまってスキルまだ無いんだよね?そしたら武器とかも初期で」:
 * スキル・サブウェポンの再現は第3弾=未実装なので、**装備も初期に揃える**(初期プレイヤー vs
 * 初期状態の幻影の決闘)。銃=台帳クラスの**初期銃**(rogue=handgun-t1)。
 * 旧: snapshot.activeGunKey(handgun-t3=計測時の装備)——スキル再現が入る第3弾で戻す候補。
 */
const phantomGunKey = (): string | undefined =>
  PLAYER_PROFILES[phantomClassId()]?.gunKey; // ★O-5: フォールバックの初期銃も**その回の人格のクラス**

/**
 * 近接ダメージ=台帳クラスの**初期近接武器の実ダメージ**(rogue=machete-t3)。同裁定。
 * 判定の形(reach/halfWidth)は GP_T のまま(見た目が読める判定を優先・叩き台)。クリは未適用(叩き台)。
 * research/GROWTH.md v4(社長裁定Q4「幻影も反映」): 永続育成の攻撃力を掛ける。**モジュールキャッシュは
 * 廃止**した——初回値を焼くと、強化画面で段数を変えてもリロードするまで反映されないため
 * (呼び出し側はスポーン時に焼いた倍率を渡す。既定1=育成なしと同値)。
 */
export const phantomMeleeDamage = (growthAtkMult = 1, phantomId?: string): number => {
  // ★社長裁定2026-08-23: 記録に近接武器があれば**記録どおり**。無い時だけ従来のクラス初期近接。
  const recorded = phantomId !== undefined ? actorMeleeFor(phantomId) : undefined;
  const key = PLAYER_PROFILES[phantomClassId()]?.meleeKey; // ★O-5: 同上
  const base = recorded?.damage ?? ((key ? createWeapon(key).damage : null) ?? GP_T.melee.damage);
  // ★SAME_ARENA O-2: 記録どおりのスキル/装備の倍率を乗せる(主語=幻影の疑似Player)。
  // `phantomId` 未指定 or ビルド無し=倍率1で従来と1bit同じ。※クリ倍率はこの関数では掛けない
  // ——v0.25.3970(裁定①)で近接クリが新設されたが、抽選と倍率は swingPhantomMelee 側が掛ける
  // (この関数は「素ダメージ」の唯一の式のまま)。
  const outgoing = phantomId !== undefined
    ? phantomAtkMults(phantomId, undefined, useGameStore.getState().gameTime).outgoingMult
    : 1;
  return base * outgoing * growthAtkMult;
};

/**
 * ★research/SAME_ARENA.md O-2: 幻影の攻撃倍率を**プレイヤーとまったく同じ式**で出す。
 *
 * 主語(`combatActorPlayer(phantom.id)`)は `Enemy.phantomBuild` のスキル/装備/クリ率を着た疑似Player。
 * ビルドが無い(旧来の決闘)場合は `null` が返るので、**倍率は素通し=従来と1bit同じ**。
 *
 * ★育成倍率の二重掛け防止(重要): `skillOutgoingDamageMult` は内部で `player.growthAtkMult` を
 * 掛ける。一方この系統の育成は **research/GROWTH.md v4 の裁定「幻影も反映」= プレイヤー本人の育成**を
 * スポーン時に焼いて `s.growthAtkMult` で持っている(記録主の育成ではない=既存仕様)。
 * よって疑似Playerの `growthAtkMult` は **1 に潰し**、呼び出し側の `× s.growthAtkMult` を残す。
 * これで**掛かる回数は従来どおり1回**=挙動の意図を変えない。
 */
export interface PhantomAtkMults {
  /** クリ判定に使う確率(武器+本体クリ率+装備critBonus+スキル)。ビルド無しは武器の素の確率。 */
  critChance: number;
  /** クリ時に掛ける倍率(crit-upスキル込み)。ビルド無しは CRIT_DAMAGE_MULT。 */
  critMult: number;
  /** 常時掛かる倍率(バーサーカー/錬金/カウンターマスター覚醒 × 装備damageMult)。ビルド無しは1。 */
  outgoingMult: number;
}
/**
 * ★社長裁定2026-08-23: 幻影は**記録されたその人そのもの**。銃・近接武器も記録どおりにする。
 * `resolveGhostBuild` が既にスナップショットから `gun` / `melee` を復元しているので、
 * **守護霊とまったく同じ道具**をそのまま引くだけ(武器復元の式を複製しない)。
 * 記録が無い(旧データ/ビルド未設定)場合は undefined を返し、呼び出し側が従来の初期武器へ落ちる。
 */
const actorBuildOf = (phantomId: string) => {
  const st = useGameStore.getState();
  const e = st.enemies.find(x => x.id === phantomId && x.type === 'guardian-phantom');
  if (!e?.phantomBuild) return null;
  return actorBuildFor(e.id, e.phantomBuild, st.player);
};
export const actorGunFor = (phantomId: string): Weapon | undefined => actorBuildOf(phantomId)?.gun;
export const actorMeleeFor = (phantomId: string): Weapon | undefined => actorBuildOf(phantomId)?.melee;

export const phantomAtkMults = (
  phantomId: string, gun: Pick<Weapon, 'critChance'> | undefined, gameTime: number,
): PhantomAtkMults => {
  // ★対人トラップ効果中は「クリティカル率アップ」(社長指示2026-08-25)。**貰う側が貰いやすくなる**
  // 向きで、敵側の `TRAP_ROOT_CRIT_BONUS`(拘束中の敵は+10%クリを貰う)の鏡。同じ +0.10 を使う
  // =数字を2組に持たない。※v0.25.3970(裁定①): 幻影の近接クリは swingPhantomMelee 側が
  // **プレイヤーの近接式のミラー**(ソフトキャップ込み)で別に組む=この関数(銃の式)は銃専用のまま。
  const trapBonus = isTrapDebuffed(useGameStore.getState().player) ? TRAP_ROOT_CRIT_BONUS : 0;
  const raw = combatActorPlayer(phantomId);
  if (!raw) {
    return {
      critChance: gun ? Math.min(1, (gun.critChance ?? 0) + trapBonus) : 0,
      critMult: CRIT_DAMAGE_MULT, outgoingMult: 1,
    };
  }
  const actor: Player = { ...raw, growthAtkMult: 1 }; // 上のコメント=二重掛け防止
  return {
    critChance: gun ? Math.min(1, gunShotCritChance(gun, actor, gameTime) + trapBonus) : 0,
    critMult: skillCritMult(actor, CRIT_DAMAGE_MULT),
    outgoingMult: skillOutgoingDamageMult(actor) * (actor.equipBonus?.damageMult ?? 1),
  };
};

// =================================================================================================
// SFX の注入口(bountyTick.BountySfx と同型・headless では audioManager を import しない)
// =================================================================================================
export interface PhantomSfx {
  /** 近接を振った(空振り含む)。 */
  swing: () => void;
  /** 発砲。`category`+`key` で呼び出し側が**プレイヤーの自動発砲と完全に同じ**銃種SEへ写像する
   * (handgun-t3=SMGは'smg-fire'。同じ銃なのに音が違う、を禁止・v0.25.3640監査B)。 */
  shot: (category: string, key: string) => void;
  /** パリィ成立(既存 'counter' を流用=新規素材なし)。 */
  parry: () => void;
  /** 幻影の攻撃がプレイヤーへ当たった(既存 'player-damage')。damagePlayer 直は音を出さないため。 */
  hurt: () => void;
}
export const NOOP_PHANTOM_SFX: PhantomSfx = {
  swing: () => {}, shot: () => {}, parry: () => {}, hurt: () => {},
};

// =================================================================================================
// ラン内状態(useGameLoop がラン開始時に作り直す・BountyTickState と同じ流儀)
// =================================================================================================
export interface PhantomTickState {
  /** 直前tickで制御していた個体id(切り替わったら下を全部リセット)。 */
  activeId: string | null;
  /** decideGhost が次tickへ持ち越す自己状態(Date.now基準の内部CD・オービット向き等)。 */
  ghost: {
    facing: 1 | -1;
    lastShotAt: number;
    lastMeleeAt: number;
    counterPendingAt?: number;
    counterWillAttempt?: boolean;
    lastCounterAttemptAt?: number;
    dangerSeenAt?: number;
    dangerLastAt?: number;
    orbitSign?: 1 | -1;
  };
  /** 次に近接を振ってよい時刻(gameTime基準)。プレイヤーの近接CDと同じ周期で進む。 */
  nextMeleeAt: number;
  /** 消費済みのパリィ打刻(gameTime)。`enemy.gpParriedAt` がこれより新しければ即反撃を1回出す。 */
  lastParryConsumedAt: number;
  /** 銃の実体(台帳武器)。リザーブは∞(=弾薬は尽きない。息継ぎ=リロードだけがある)。 */
  gun: Weapon | null;
  /** リロードの状態(Date.now基準=weaponUtils と同じ時計)。 */
  reloadEndsAt: number;
  reloadingWeaponId: string;
  /**
   * 永続育成の攻撃力倍率(research/GROWTH.md v4)。**個体がスポーンした瞬間に1回だけ焼く**
   * (敵tickはPlayer主語を持たないので、その時点の player.growthAtkMult=ランの焼き値を読む)。
   */
  growthAtkMult: number;
}

export const createPhantomTickState = (): PhantomTickState => ({
  activeId: null,
  ghost: { facing: 1, lastShotAt: 0, lastMeleeAt: 0 },
  nextMeleeAt: 0,
  lastParryConsumedAt: 0,
  gun: null,
  reloadEndsAt: 0,
  reloadingWeaponId: '',
  growthAtkMult: 1,
});

/** 個体が入れ替わった/ランが変わった時の全消し。 */
const resetPhantomRunState = (s: PhantomTickState): void => {
  s.ghost = { facing: 1, lastShotAt: 0, lastMeleeAt: 0 };
  s.nextMeleeAt = 0;
  s.lastParryConsumedAt = 0;
  s.gun = null;
  s.reloadEndsAt = 0;
  s.reloadingWeaponId = '';
  s.growthAtkMult = 1;
};

// =================================================================================================
// 銃(守護霊の霊体武器ループの写し。**2つ目のリロード実装を生やさない**)
// =================================================================================================
/**
 * 銃の計算に渡す「中立の主語」。**プレイヤーのビルドは読まない**(読むと幻影の銃が
 * プレイヤーの装備で強くなる=台帳武器の実性能、という決定が壊れる)。スキル無し・装備無しなので
 * effectiveMagSize/effectiveReloadMs/effectiveFireCooldown は武器の生値をそのまま返す。
 * ★例外(research/GROWTH.md v4・社長裁定Q4 2026-08-20「幻影も反映」・乱入敵構想が理由): **永続育成の
 * 攻撃力だけ**はこの中立主語の外側で掛ける(s.growthAtkMult=スポーン時に焼いた値)。
 * 中立主語は維持しつつ、育成だけは裁定により写す。
 */
const NEUTRAL_GUN_OWNER = {
  skills: [], skillLevels: {}, magBonus: 0, reloadMult: 1,
  health: 1, maxHealth: 1, weapons: [], activeWeaponId: '',
  reloadEndsAt: 0, reloadingWeaponId: '', quickMagCritUntil: 0,
} as unknown as Player;

const gunOwner = (s: PhantomTickState): Player => ({
  ...NEUTRAL_GUN_OWNER,
  weapons: s.gun ? [s.gun] : [],
  activeWeaponId: s.gun?.id ?? '',
  reloadEndsAt: s.reloadEndsAt,
  reloadingWeaponId: s.reloadingWeaponId,
});

/**
 * リロードを1tick進める(プレイヤー/守護霊と同じ純関数・リザーブ∞)。
 * 「リロード中/マガジン0は射程0=撃たない」も守護霊と同じ形にする。
 */
const stepPhantomGun = (s: PhantomTickState, nowMs: number, phantomId?: string): void => {
  if (!s.gun) {
    // ★社長裁定2026-08-23「**とにかくオンラインにある他人の実データなので、初期か初期じゃないか
    // とかの議論があるのがおかしい**」: 幻影は**記録されたその人そのもの**。記録に銃があれば
    // 記録の銃を持つ(旧v0.25.3641「スキルがまだ無いから武器も初期で」は、その前提=スキル未実装が
    // O-2で消えたので失効)。記録が無い(旧データ/ビルド未設定)時だけ従来のクラス初期銃へ落ちる。
    const recorded = phantomId !== undefined ? actorGunFor(phantomId) : undefined;
    if (recorded) { s.gun = { ...recorded }; }
    else {
      const key = phantomGunKey();
      if (!key) return;
      s.gun = createWeapon(key);
    }
  }
  const owner = gunOwner(s);
  const finished = finishWeaponReload(s.gun, owner, Number.POSITIVE_INFINITY, nowMs);
  if (finished) {
    s.gun = finished.weapon;
    s.reloadEndsAt = finished.reloadEndsAt;
    s.reloadingWeaponId = finished.reloadingWeaponId;
  }
  if ((s.gun.magazine ?? 0) <= 0 && !s.reloadingWeaponId) {
    const started = beginWeaponReload(s.gun, gunOwner(s), Number.POSITIVE_INFINITY, nowMs);
    if (started) {
      s.reloadEndsAt = started.reloadEndsAt;
      s.reloadingWeaponId = started.reloadingWeaponId;
    }
  }
};

/** いま撃てるか(=頭脳へ渡す銃射程。撃てないなら0で「銃を選ばせない」)。 */
const phantomGunRangePx = (s: PhantomTickState): number =>
  s.gun && !s.reloadingWeaponId && (s.gun.magazine ?? 0) > 0
    ? zoomedGunRange(RANGE_BY_CATEGORY[s.gun.ammoType ?? 'handgun'])
    : 0;

// =================================================================================================
// store を触るヘルパ(bountyTick.ts と同じ作法)
// =================================================================================================
const applyPatch = (id: string, patch: Partial<Enemy>): void => {
  if (Object.keys(patch).length === 0) return;
  useGameStore.setState(stt => ({ enemies: stt.enemies.map(e => (e.id === id ? { ...e, ...patch } : e)) }));
};

const playableCtx = (): PlayableAreaCtx => {
  const st = useGameStore.getState();
  return {
    farBackdrop: st.farBackdrop,
    labTheme: st.stageTheme === 'lab' && !st.indoorMode,
    corridorMode: st.corridorMode,
    m0AdvanceLimitX: st.m0AdvanceLimitX,
    corridorRunInActive: st.corridorRunInActive,
  };
};

/**
 * 希望移動量を「実際に立てる場所」へ解決する。**必ず ①障害物 → ②行ける帯 の順**
 * (CLAUDE.md「アクターを動かす時は必ず clampRectToPlayableArea を通す」)。
 */
const resolveMove = (nx: number, ny: number, e: Enemy): { x: number; y: number } => {
  const collided = resolveBountyMove(nx, ny, { width: e.width, height: e.height });
  return clampRectToPlayableArea(collided.x, collided.y, e.width, e.height, playableCtx());
};

/**
 * 動きを止める効果(気絶・拘束・浮き)。
 * ★**通常被弾のノックバック(knockbackUntil)は入れない**(v6裁定1): プレイヤーが被弾しても
 * 行動が止まらないのと同条件=「殴り続けても止まらない」。押し道具の shove だけは下で別に扱う。
 * bossFullStunUntil/stunUntil/rootUntil は gameTime基準、liftUntil は Date.now基準
 * ——**時計が違う**ので引数を2本受け取る(ENGINEERING_NOTES.md「時計の混在」)。
 */
const isFrozen = (e: Enemy, newGameTime: number, nowMs: number): boolean =>
  (e.bossFullStunUntil !== undefined && newGameTime < e.bossFullStunUntil)
  || (e.stunUntil !== undefined && newGameTime < e.stunUntil)
  || (e.rootUntil !== undefined && newGameTime < e.rootUntil)
  || (e.liftUntil !== undefined && nowMs < e.liftUntil);

/**
 * 移動速度に掛かる鈍足。★**クリティカル由来(bossSlowUntil)は幻影では無視する**(v6・D4):
 * 「クリで動きが半減する」はボスの文法で、プレイヤーには無い=同条件にならない。
 * 一方 **グラビティ/アイスショットの鈍足は残す**(これはプレイヤーの攻撃効果=当たれば効く)。
 * クリのダメージ倍率側は damageEnemy が持つので、プレイヤー弾のクリはちゃんと痛いまま。
 */
const phantomSlowMult = (e: Enemy, gameTime: number): number => {
  const grav = (e.gravitySlowUntil !== undefined && gameTime < e.gravitySlowUntil) ? GRAVITY_SHOT_BOSS_SLOW_MULT : 1;
  const ice = (e.iceSlowUntil !== undefined && gameTime < e.iceSlowUntil)
    ? Math.max(0, 1 - (e.iceSlowPct ?? 0)) : 1;
  return Math.min(grav, ice);
};

// =================================================================================================
// 頭脳(decideGhost の対プレイヤーアダプタ)
// =================================================================================================
/**
 * プレイヤーを decideGhost が読める「疑似 Enemy」にする。
 * **型は 'zombie'**(見た目にも判定にも使わない・decideGhost 内で isBossType の分岐に落ちないため)。
 * この個体は store には**入れない**=盤面に存在しない一時オブジェクト。
 */
const playerAsTarget = (p: Player): Enemy => ({
  id: 'gp-target-player',
  x: p.x, y: p.y, width: p.width, height: p.height,
  speed: 0, health: Math.max(1, p.health), maxHealth: Math.max(1, p.maxHealth),
  damage: 0, type: 'zombie', experienceValue: 0, lastHit: 0, lastShot: 0,
});

/** 矩形の縁までの距離(プレイヤーと同じ AABB 最近点。decideGhost の meleeDist 注入口へ渡す)。 */
export const edgeDistTo = (cx: number, cy: number, r: { x: number; y: number; width: number; height: number }): number => {
  const nx = Math.max(r.x, Math.min(cx, r.x + r.width));
  const ny = Math.max(r.y, Math.min(cy, r.y + r.height));
  return Math.hypot(cx - nx, cy - ny);
};

/**
 * 幻影の1tickぶんの意思決定。**decideGhost をそのまま呼ぶ**(自前ステアを書かない)。
 * 渡すのは「プレイヤー=狙う相手」「プレイヤーの弾=避ける脅威」だけ。
 *
 * ★弾回避(v4): `botSkill.projectileDodge` は1行目 `if (!p.hostile) return null;` で
 * プレイヤー弾を全部捨てる(テストボット共用なので触らない)。**幻影側で hostile を立てて写す**。
 */
export const decidePhantom = (
  phantom: Enemy, s: PhantomTickState, player: Player, projectiles: readonly Projectile[],
  gameTime: number, nowMs: number,
): GhostDecision => {
  const target = playerAsTarget(player);
  const profile = phantomProfile();
  return decideGhost({
    ghost: {
      x: phantom.x, y: phantom.y, width: phantom.width, height: phantom.height,
      maxHealth: phantom.maxHealth,
      facing: s.ghost.facing,
      lastShotAt: s.ghost.lastShotAt,
      lastMeleeAt: s.ghost.lastMeleeAt,
      counterPendingAt: s.ghost.counterPendingAt,
      counterWillAttempt: s.ghost.counterWillAttempt,
      lastCounterAttemptAt: s.ghost.lastCounterAttemptAt,
      dangerSeenAt: s.ghost.dangerSeenAt,
      dangerLastAt: s.ghost.dangerLastAt,
      orbitSign: s.ghost.orbitSign,
    },
    // 「標的が居ない時はプレイヤーへ寄る」フォールバック用の座標。幻影に守るべき主は居ないので
    // 自分自身を渡す=そのフォールバックは実質何もしない(標的は常に居るので通らない)。
    player: { x: phantom.x, y: phantom.y, width: phantom.width, height: phantom.height },
    enemies: [target],
    boundBossId: target.id,
    // **プレイヤーの弾だけ**を脅威として渡し、hostile を立てて写す(上の★)。
    projectiles: projectiles.filter(p => !p.hostile).map(p => ({ ...p, hostile: true })),
    meleeDist: (cx, cy, e) => edgeDistTo(cx, cy, e),
    profile,
    weapon: {
      gunDamage: s.gun?.damage ?? 0,
      gunIntervalMs: s.gun ? effectiveFireCooldown(s.gun, gunOwner(s)) : 500,
      gunRangePx: phantomGunRangePx(s),
      meleeDamage: phantomMeleeDamage(s.growthAtkMult, phantom.id), // 初期近接武器の実ダメージ(v0.25.3641裁定)+育成+O-2の倍率
    },
    gameTime,
    nowMs,
  });
};

// =================================================================================================
// 攻撃(即発。予告も硬直も無い=プレイヤーと同条件)
// =================================================================================================
/**
 * 近接を1回振る。**判定はこの瞬間の1回だけ**(即発ミラー)。
 * 重なり判定式は共有純関数 `distToBandRect(点, 始点, 終点, halfWidth) <= プレイヤー半径`
 * ——counterReach / combatTick と同じ1本(写経しない)。
 *
 * ★汎用爆風(applyPumpkinBlastDamage)は使わない: ①全画面オレンジフラッシュ+リングが判定と
 *   一致しない ②爆風経路の帯はプレイヤーがカウンターで弾ける=裁定「カウンターは幻影に成立
 *   しない」が裏口から破れる(GHOST_BOSS.md v6 2.)。
 */
/**
 * ★幻影の近接がプレイヤーのカウンター窓に入った時の解決(社長裁定2026-08-24)。
 * **プレイヤーが敵をカウンターした時と同じ扱い**にする(既存の文法から外さない):
 *  - 幻影のダメージは通らない(0)
 *  - 幻影は**振りが中断**され(`gpPendingSwingAt` を落とす)、**敵と同じノックバック**を受ける
 *    (社長指示「カウンターされた側はノックバックも敵と同じく」= `KNOCKBACK_SPEED`/`KNOCKBACK_DURATION`)
 *  - 青いカウンター成立の絵+SE(既存プールのみ・新規素材なし)
 * ダメージ量は幻影側の合流点(`damageEnemy` → `phantomHitGate`)に任せる=対人スケールもパリィも
 * そこで一度に裁かれる(ここで独自に減算しない=写経しない)。
 */
const counteredByPlayer = (
  bcx: number, bcy: number, player: Player, sfx: PhantomSfx, patch: Partial<Enemy>, phantomId: string,
): void => {
  const g = useGameStore.getState();
  patch.gpPendingSwingAt = undefined; // 振りは出ない(中断)
  const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
  const dl = Math.max(0.001, Math.hypot(bcx - pcx, bcy - pcy));
  const now = Date.now();
  // 敵がカウンターされた時と同じノックバック(量・時間とも同じ定数)。
  useGameStore.setState(st => ({ enemies: st.enemies.map(e => e.id === phantomId ? {
    ...e,
    knockbackVx: ((bcx - pcx) / dl) * KNOCKBACK_SPEED,
    knockbackVy: ((bcy - pcy) / dl) * KNOCKBACK_SPEED,
    knockbackUntil: now + KNOCKBACK_DURATION,
    knockbackShoveUntil: now + KNOCKBACK_DURATION,
  } : e) }));
  // ★社長指示2026-08-27「幻影との闘いで、近接カウンターはカウンターされた側の体勢値だけ削れる」:
  // 旧: meleeSwingBaseDamage の確定クリ(HPダメージ)+体勢0.20。新: **HPダメージ0・体勢0.20のみ**。
  // amount=0 でも damageEnemy 中央の pvp chip は resolvedImpact==='counter' で削る(newHealth>0ゲートのみ)。
  // crit=false(確定クリ廃止に伴い、クリ付随の移動半減=bossCritSlowPatchも発生させない)。
  // gpSource='counter' は維持=幻影ゲートで「近接カウンター」(パリィ不可・i-frame貫通)のまま。
  g.damageEnemy(phantomId, 0, false, false, false, 'other', 'player', 'counter', 1, 'counter');
  sfx.parry();
  g.spawnRing(bcx, bcy, 14, 135, 'rgba(56,189,248,0.9)', 3, 360);
  g.spawnBurst(bcx, bcy, '#38bdf8', 14);
  g.spawnGlow(bcx, bcy, 43, 'rgba(56,189,248,', 360);
  g.spawnCallout(bcx, bcy - 12, 'Counter!', '#e0f2ff', { bg: 0x2563eb, holdMs: MELEE_FINISH_SLOW_HOLD_MS, duration: MELEE_FINISH_SLOW_MS });
  g.triggerHitImpact(COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG, bcx, bcy);
};

const swingPhantomMelee = (
  bcx: number, bcy: number, player: Player, sfx: PhantomSfx, patch: Partial<Enemy>,
  // ★SAME_ARENA O-2: `phantomId` を受け取り、近接ダメージにも記録どおりのスキル/装備倍率を乗せる。
  _newGameTime: number, growthAtkMult: number, phantomId: string,
): void => {
  const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
  const ang = Math.atan2(pcy - bcy, pcx - bcx);
  const tx = bcx + Math.cos(ang) * GP_T.melee.reach;
  const ty = bcy + Math.sin(ang) * GP_T.melee.reach;
  // ★gpSwingAt / gpSwingAngle は**振り始め**で打ってある(=幻影のカウンター窓の起点)。
  // ここで打ち直すと窓が前隙ぶん後ろへずれ、「後出しが勝つ」が壊れる(v0.25.3869で踏んだ実バグ)。
  sfx.swing(); // 刃が走る音は判定と同時(プレイヤーの近接SEも解決地点で鳴らしている)
  const playerRadius = Math.max(player.width, player.height) / 2;
  if (distToBandRect({ x: pcx, y: pcy }, { x: bcx, y: bcy }, { x: tx, y: ty }, GP_T.melee.halfWidth) > playerRadius) return;
  // fromX/fromY を渡さないとプレイヤーのノックバックが出ない(GHOST_BOSS.md 監査4周目#1)。
  // ★v0.25.3640(成果物監査Q1-3): damagePlayer の戻り値は「プレイヤーが死んだか」であって
  // 「当たったか」ではない(旧実装はこれを landed と誤読し、被弾SEが一度も鳴らなかった)。
  // 実際にHPが減ったか(=i-frame中でない有効打か)を前後比較で判定して鳴らす。
  // ★プレイヤーのカウンター(社長裁定2026-08-24「原則同じ条件にして」・SAME_ARENA.md §7)。
  // これ以前は**プレイヤーが幻影の近接を止める手段が1つも存在しなかった**(幻影の近接は
  // damagePlayer 直呼びで、カウンター成立域の宣言表 COUNTER_REACH_DECL に幻影の項が1行も無い)。
  // 一方 幻影はプレイヤーの近接を窓で弾き反撃まで出していた=最大の非対称。ここで対称にする。
  // ※事実として、GHOST_BOSS.md v6 では「カウンターは幻影に成立しない」と裁定されていた。
  //   2026-08-24 の「原則同じ条件」でその前提が変わったので、今はこちらが正。
  // 判定はプレイヤー側の窓1本(`counterWindowEnd`)。窓は指を離した瞬間に開くので、
  // **幻影より後に振った(=後出しした)プレイヤーだけが間に合う**=「後出しが勝つ」。
  const gNow = useGameStore.getState();
  const gt = gNow.gameTime;
  // ★SAME_ARENA §9: プレイヤーが紫(行動不能)中はカウンター判定を通さない(窓は紫入りで破棄済み+
  // 新しく開けない、の二重化。ここは三重目の保険=「紫→致命」がカウンターで潰れない)。
  if (!isPvpIncapacitated(gNow.player.pvpPosture, gt) && isCounterActive(gNow.player, Date.now())) {
    counteredByPlayer(bcx, bcy, player, sfx, patch, phantomId);
    return;
  }
  // ★裁定①(社長2026-08-26): 幻影の近接にもクリを新設(記録どおりの武器クリ率で抽選=プレイヤーと対称)。
  // 旧「クリは近接では未適用(叩き台)」はこの裁定で置き換え。クリ成立=ダメージ×critMult+
  // 相手(プレイヤー)に2/3減速3秒(§9)。
  // ★検収監査 中⑥: クリ率は**プレイヤーの近接式のミラー**で組む(meleeHitCritChanceと同じ項:
  // 武器クリ率+本体critChance+対人トラップ+弁慶+ナイフマスター→ソフトキャップ§13-3d)。
  // 銃の式(phantomAtkMults=quickMag/装備クリが乗り・ソフトキャップ無し)を流用しない。
  // 対象がプレイヤーなので弱点/敵補正の項は無し(=対称)。
  const meleeW = actorMeleeFor(phantomId);
  const mActor = combatActorPlayer(phantomId);
  const meleeCritChance = meleeW !== undefined && mActor
    ? softCapCritChance(
        (meleeW.critChance ?? 0) + mActor.critChance
        + (isTrapDebuffed(gNow.player) ? TRAP_ROOT_CRIT_BONUS : 0)
        + skillBenkeiCritBonus(mActor, gt) + skillKnifeMasterMeleeCrit(mActor),
      )
    : 0;
  const mm = phantomAtkMults(phantomId, meleeW, gt); // critMult(クリ倍率)はここから(倍率の対称化は(B))
  const crit = Math.random() < meleeCritChance;
  let dmg = phantomMeleeDamage(growthAtkMult, phantomId) * (crit ? mm.critMult : 1) * PVP_DAMAGE_SCALE;
  // ★SAME_ARENA §9: 紫中のプレイヤーへの近接=致命の一撃(×5+最大HP25%・裁定②)。
  const fatalHit = isPvpFatalTarget(gNow.player.pvpPosture, gt);
  if (fatalHit) dmg = pvpFatalDamage(dmg, gNow.player.maxHealth);
  const hpBefore = gNow.player.health;
  useGameStore.getState().damagePlayer(
    // 対人スケール(社長裁定2026-08-20)は上のdmgで適用済み。
    dmg, guardianPhantomMeleeSource(), bcx, bcy, GUARDIAN_PHANTOM_TYPE,
  );
  // 被弾SEはここで鳴らす: damagePlayer 直呼びは「本当に何も出ない」前例がある(gameStore の注記)。
  const landed = useGameStore.getState().player.health < hpBefore;
  if (landed) {
    sfx.hurt();
    // ★社長指示2026-08-27「幻影戦での致命はちゃんと双方、KILL演出して。(ズームする方)」:
    // 幻影→プレイヤーの致命もプレイヤー→幻影と同じ演出(Kill!の赤い層+CD無視の最大ズーム)。
    if (fatalHit) showPvpFatalOnPlayerPresentation(pcx, pcy, gNow.player.y - 6);
    // ★SAME_ARENA §9: 有効打のみ体勢に響く——melee(0.04)の削り+クリなら2/3減速。致命なら満タン+daze2秒。
    useGameStore.setState(st => {
      if (fatalHit) {
        return { player: { ...st.player, pvpPosture: pvpAfterFatal(st.player.pvpPosture, st.gameTime) } };
      }
      const chipped = playerPvpChipPatch(st.player, 'melee', st.gameTime);
      const merged = crit
        ? { ...chipped, pvpPosture: markPvpCritSlow(chipped.pvpPosture ?? st.player.pvpPosture, st.gameTime) }
        : chipped;
      return { player: { ...st.player, ...merged } };
    });
  }
};

/** 弾を1発撃つ(全ボス共通の赤い二重丸=絵替えしない)。飛翔特性はプレイヤーの実弾と同じ共通ヘルパ。 */
const firePhantomShot = (
  phantom: Enemy, s: PhantomTickState, bcx: number, bcy: number, sfx: PhantomSfx, patch: Partial<Enemy>,
  newGameTime: number, rand: () => number,
): void => {
  const gun = s.gun;
  // 「リロード中/マガジン0は撃たない」(守護霊=プレイヤーと同じ息継ぎ)。頭脳側でも射程0で
  // 撃たせない形にしてあるが、**発射の入口でも閉じる**(2箇所のどちらが先に変わっても弾が漏れない)。
  if (!gun || s.reloadingWeaponId !== '' || (gun.magazine ?? 0) <= 0) return;
  const st = useGameStore.getState();
  const p = st.player;
  const pcx = p.x + p.width / 2, pcy = p.y + p.height / 2;
  const flight = projectileFlightStats(gun);
  // ★SAME_ARENA O-2: クリ率も倍率も**プレイヤーと同じ純関数**で出す(主語=幻影の疑似Player)。
  // ビルドが無ければ従来どおり「武器の素のクリ率 × CRIT_DAMAGE_MULT・倍率1」=1bit不変。
  // 弾の見た目は変えない(全ボス共通の赤い二重丸=CLAUDE.mdの弾の文法)。
  const m = phantomAtkMults(phantom.id, gun, newGameTime);
  // ★§13-3e クリ減衰(社長裁定2026-08-26・SAME_ARENA対称): 幻影の銃もプレイヤーと同じ減衰を受ける
  // (相手=プレイヤー1人・武器を持ち替えれば戻る)。発射時ロールなので時刻は発射時で近似。
  const crit = rand() < critDecayOnHit(`gp:${phantom.id}`, gun.key ?? 'gp-gun', newGameTime, m.critChance);
  st.addProjectile({
    ...createEnemyProjectile(
      phantom, p, pcx, pcy, bcx, bcy,
      // research/GROWTH.md v4: 幻影の銃にも育成の攻撃力を掛ける(スポーン時に焼いた倍率)。
      // 対人1/10(社長裁定2026-08-20)も弾の生成時に掛ける(被弾側=combatTickは共通経路なので触らない)。
      { speed: flight.speed, damage: Math.max(1, Math.round(
        gun.damage * (crit ? m.critMult : 1) * m.outgoingMult * s.growthAtkMult * PVP_DAMAGE_SCALE,
      )), size: flight.size },
    ),
    // ★SAME_ARENA §9: クリ旗を弾に載せる(被弾側=combatTickが体勢削り(gun-crit)+2/3減速の合図に使う)。
    ...(crit ? { pvpCrit: true } : {}),
  });
  s.gun = { ...gun, magazine: Math.max(0, (gun.magazine ?? 0) - 1), lastFired: Date.now() };
  patch.gpShotAt = newGameTime;
  patch.gpShotAngle = Math.atan2(pcy - bcy, pcx - bcx);
  sfx.shot(gun.category ?? 'handgun', gun.key ?? '');
};

/**
 * パリィ成立の合図(gameStore の phantomGate が立てた `gpParriedAt`)を消費して、
 * 成立の絵+カウンターされた側(プレイヤー)の中断/ノックバックを出す。
 * ★社長指示2026-08-27「体勢値だけ削れる」: 旧D3の「周期無視の即反撃」は撤去(実質カウンター確定
 * ダメージだった)。体勢0.20の削りは gameStore の gp.parried 側で適用済み。
 */
const consumePhantomParry = (
  phantom: Enemy, s: PhantomTickState, player: Player, bcx: number, bcy: number,
  sfx: PhantomSfx, _patch: Partial<Enemy>, _newGameTime: number,
): boolean => {
  const at = phantom.gpParriedAt;
  if (at === undefined || at <= s.lastParryConsumedAt) return false;
  s.lastParryConsumedAt = at;
  sfx.parry();
  const g = useGameStore.getState();
  // ★GHOST_BOSS.md v9 §3(社長指摘「カウンター取ったらカウンターのエフェクトは出ないとおかしい」):
  // 成立の絵は**プレイヤーのカウンター成立と同じ色文法**(青)+停止/揺れ/寄り(triggerHitImpact)。
  // 既存プールのみ・新規素材なし。SEは上の sfx.parry()('counter')のまま=二重に鳴らさない。
  // **弾かれた側=プレイヤーが得をする副作用**(コンボ加算・無敵付与・CDリファンド・成立打刻・
  // 計測notify)は1つも呼ばない(applyGhostCounterEffect の前例と同じ扱い)。
  g.spawnRing(bcx, bcy, 14, 135, 'rgba(56,189,248,0.9)', 3, 360);
  g.spawnBurst(bcx, bcy, '#38bdf8', 14);
  // glow も青文法の構成要素(検収監査v9指摘: 主語を持たない光なので callout と違い裁定不要)。
  // 半径43=守護霊成立(ghostCounterBlueLayer)と同じ。
  g.spawnGlow(bcx, bcy, 43, 'rgba(56,189,248,', 360);
  // 「Counter!」の文字も出す(社長裁定2026-08-20「幻影パリィにも文字出して」=v9未決の決着)。
  // 体裁はプレイヤー/守護霊成立と同値(combatTick 289 / ghostCounterBlueLayer)。
  g.spawnCallout(bcx, bcy - 12, 'Counter!', '#e0f2ff', { bg: 0x2563eb, holdMs: MELEE_FINISH_SLOW_HOLD_MS, duration: MELEE_FINISH_SLOW_MS });
  g.triggerHitImpact(COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG, bcx, bcy);
  // ★v0.25.3665(社長報告「すごい距離から斬撃っぽいの」): パリィされるのは**分身・守護霊の近接**の
  // こともあり、その時プレイヤー本人は遠くにいる。反撃スイング(絵は距離無関係に出る)と
  // プレイヤーへの押し返しを距離ゲート無しで出すと、**遠距離のプレイヤーへ空振りの斬撃弧が飛ぶ+
  // 殴っていない本人が押される**という意味不明な絵になる。どちらも近接射程内の時だけ出す
  // (「見たまんまが当たり判定」文法。パリィ自体のスパーク・SEは幻影の位置の演出なので無条件)。
  if (edgeDistTo(bcx, bcy, player) <= GP_T.melee.reach) {
    // ★カウンターされた側の扱い(社長指示2026-08-24「カウンターされた側はノックバックも敵と同じく」)。
    // 弾かれたのだから **前隙中の振りは出ない(中断)** し、**敵がカウンターされた時と同じ量**の
    // ノックバックを受ける(`KNOCKBACK_SPEED`/`KNOCKBACK_DURATION`)。旧実装は幻影専用の
    // 小さい叩き台(46px/…)だったので、対称性のために共通定数へ揃えた。
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    const dl = Math.max(0.001, Math.hypot(pcx - bcx, pcy - bcy));
    const kbNow = Date.now();
    useGameStore.setState(stt => ({ player: {
      ...stt.player,
      pendingSwingAt: 0, // 振りは出ない(中断)
      knockbackVx: ((pcx - bcx) / dl) * KNOCKBACK_SPEED,
      knockbackVy: ((pcy - bcy) / dl) * KNOCKBACK_SPEED,
      knockbackUntil: kbNow + KNOCKBACK_DURATION,
      knockbackMs: KNOCKBACK_DURATION,
    } }));
    // ★社長指示2026-08-27「近接カウンターはカウンターされた側の体勢値だけ削れる」: 旧「周期無視の
    // 即反撃(swingPhantomMelee)」を撤去——KBと同フレームの即反撃は実質「カウンターの確定ダメージ」
    // だった。体勢0.20はパリィ成立時(gameStoreのgp.parried側)で削り済み。以後の攻撃は通常周期で。
  }
  return true;
};

// =================================================================================================
// 本体
// =================================================================================================
/**
 * 幻影1体を1tick進める。
 *
 * @param newGameTime シミュ時刻(ms)。周期タイマー・gp*打刻はこの時計。
 * @param nowMs       `Date.now()`。リロード・shove窓・decideGhost の内部CDはこの時計。
 * @param rand        [0,1) の乱数(テストで固定できるよう注入口。既定 Math.random)。
 */
export const runPhantomTick = (
  phantom: Enemy,
  s: PhantomTickState,
  newGameTime: number,
  deltaTime: number,
  moveSpeedMult: number,
  nowMs: number,
  sfx: PhantomSfx = NOOP_PHANTOM_SFX,
  rand: () => number = Math.random,
): void => {
  const st0 = useGameStore.getState();
  const player = st0.player;
  // 個体が入れ替わった=スポーン。育成の攻撃力(research/GROWTH.md v4)はこの瞬間に1回だけ焼く。
  if (s.activeId !== phantom.id) {
    resetPhantomRunState(s);
    s.activeId = phantom.id;
    s.growthAtkMult = player.growthAtkMult ?? 1;
  }

  const bcx = phantom.x + phantom.width / 2, bcy = phantom.y + phantom.height / 2;
  const patch: Partial<Enemy> = {};

  // ---- ★SAME_ARENA §9(対人体勢): 経過(紫明け=満タンへ/回復8秒後3%毎秒)+紫・daze中は完全停止 ----
  // 紫は専用フィールド(pvpPosture.breakUntil)。isFrozen(stun/root/lift)と混ぜない=トラップ拘束で
  // 致命が出る誤爆を構造的に防ぐ(§9)。被弾側の素通し(i-frame/パリィ無効)は phantomHitGate が持つ。
  {
    const pvpTick = tickPvpPosture(phantom.pvpPosture, newGameTime, deltaTime);
    if (pvpTick) patch.pvpPosture = pvpTick;
    if (isPvpIncapacitated(pvpTick ?? phantom.pvpPosture, newGameTime)) {
      // ★慣性MUST(検収監査 中⑤): 瞬間停止にせず、プレイヤーの紫(skaterStop型)と同じ
      // 「入力無視+残速度の減衰」で滑って止まる(tau≈50ms)。
      const d = Math.exp(-deltaTime / 0.05);
      const nvx = (phantom.vx ?? 0) * d, nvy = (phantom.vy ?? 0) * d;
      if (Math.abs(nvx) > 1 || Math.abs(nvy) > 1) {
        const c = resolveMove(phantom.x + nvx * deltaTime, phantom.y + nvy * deltaTime, phantom);
        patch.x = c.x; patch.y = c.y;
      }
      patch.vx = nvx; patch.vy = nvy;
      applyPatch(phantom.id, patch);
      return;
    }
  }

  // ---- 気絶・拘束・浮き: 何もしない(★ノックバックは含めない=殴っても止まらない) ----------------
  if (isFrozen(phantom, newGameTime, nowMs)) { applyPatch(phantom.id, patch); return; }

  // ---- パリィの即反撃(周期を無視した割り込み) ---------------------------------------------------
  const parried = consumePhantomParry(phantom, s, player, bcx, bcy, sfx, patch, newGameTime);

  // ---- 銃の状態(リロード)を進める --------------------------------------------------------------
  stepPhantomGun(s, nowMs, phantom.id);
  // ★research/SAME_ARENA.md O-3: サブウェポン使用の**予約**。守護霊(G2.6)と同じ純関数・同じ考え方
  // (「CDが明けていて交戦中なら使う」)。実際の発動はサブ入口(useGameLoop)がCD明けに解決して
  // 予約を下ろす。頻度は**記録の癖**(profile.subUsesPerMin)=誰と戦っているかがここにも出る。
  // ★v0.25.3881: **持っていても幻影がまだ使えない種(白リスト外)しか無いなら予約しない**。
  // v0.25.3879 で白リストを入れた時の抜け——予約は「サブを使いたい」だけを見ていたので、
  // 設置系しか持っていない幻影は**予約を上げたまま永久に発動できず**、`gpLastSubUseAt` も
  // 更新されないので**毎tick予約し続ける**状態になっていた(実害は小さいが、予約が主語を
  // 押さえ続ける=将来の取り合いで事故る形)。使える種を1つも持っていないなら最初から予約しない。
  const canUseAnySub = (combatActorPlayer(phantom.id)?.subWeapons ?? []).some(k => phantomSupportsSub(k));
  if (canUseAnySub
    && !phantom.gpSubClaim
    && shouldGhostClaimSub(phantom.gpLastSubUseAt ?? 0, nowMs, phantomProfile().subUsesPerMin)) {
    patch.gpSubClaim = true;
  }

  // ---- 頭脳(★技中の概念が無くなったので毎tick呼ぶ=弾回避・危険記憶が常時効く) -------------------
  const decision = decidePhantom(phantom, s, player, st0.projectiles, newGameTime, nowMs);
  s.ghost.facing = decision.facing;
  s.ghost.lastShotAt = decision.lastShotAt;
  s.ghost.lastMeleeAt = decision.lastMeleeAt;
  s.ghost.counterPendingAt = decision.counterPendingAt;
  s.ghost.counterWillAttempt = decision.counterWillAttempt;
  s.ghost.lastCounterAttemptAt = decision.lastCounterAttemptAt;
  s.ghost.dangerSeenAt = decision.dangerSeenAt;
  s.ghost.dangerLastAt = decision.dangerLastAt;
  s.ghost.orbitSign = decision.orbitSign;

  // ---- 移動 ---------------------------------------------------------------------------------------
  // 押し道具(鞭・シールドバッシュ)の shove 窓の間は**自分の移動で x/y を上書きしない**
  // =押されるがままになる(プレイヤーも押し合いの対象になる世界=同条件の範囲内)。
  const shoved = nowMs < (phantom.knockbackShoveUntil ?? 0);
  if (!shoved) {
    // ★SAME_ARENA §9: クリ被弾の2/3減速(pvpMoveMult)。ボスのbossSlowUntil無視(D4)はそのまま。
    const dt = deltaTime * moveSpeedMult * phantomSlowMult(phantom, newGameTime) * pvpMoveMult(phantom.pvpPosture, newGameTime);
    if (decision.moveX !== 0 || decision.moveY !== 0) {
      const spd = phantom.speed * dt;
      const c = resolveMove(phantom.x + decision.moveX * spd, phantom.y + decision.moveY * spd, phantom);
      patch.x = c.x; patch.y = c.y;
      patch.vx = decision.moveX * phantom.speed;
      patch.vy = decision.moveY * phantom.speed;
    } else {
      patch.vx = 0; patch.vy = 0;
    }
  }

  // ★B6(盾押し機構・research/AI_HUMANIZE.md §6・裁定済み#8): 幻影も自分の盾を押せる
  // (写しの口=プレイヤー/守護霊と同じ純関数)。所有者以外は押せない。敵は見ない=動く盾は
  // 従来どおり敵を押し出す(ブルドーザー存続)。
  // ★検収監査・軽6: 新たにgetState().projectilesを取り直さず、decidePhantomへ既に渡している
  // st0.projectiles(このtickの先頭で1回だけ取得済み)へ相乗りする(新規の毎フレーム走査を増やさない)。
  {
    const pnMoveDx = (patch.x ?? phantom.x) - phantom.x;
    const pnMoveDy = (patch.y ?? phantom.y) - phantom.y;
    if (pnMoveDx !== 0 || pnMoveDy !== 0) {
      const pnRect = {
        x: patch.x ?? phantom.x, y: patch.y ?? phantom.y, width: phantom.width, height: phantom.height,
      };
      for (const sh of st0.projectiles) {
        if (sh.weaponType !== 'shield') continue;
        if (sh.shieldOwnerKind !== 'phantom' || sh.shieldOwnerId !== phantom.id) continue;
        if (!rectsOverlap(pnRect, { x: sh.x, y: sh.y, width: sh.width, height: sh.height })) continue;
        const candidate = { x: sh.x + pnMoveDx, y: sh.y + pnMoveDy, width: sh.width, height: sh.height };
        const wallResolved = resolveShieldWalls(candidate);
        const placed = pushShieldRect(
          { x: wallResolved.x, y: wallResolved.y, width: sh.width, height: sh.height },
          shieldPlayableCtx(),
          sh.x,
        );
        useGameStore.setState(st => ({
          projectiles: st.projectiles.map(pr => pr.id === sh.id ? { ...pr, x: placed.x, y: placed.y } : pr),
        }));
      }
    }
  }

  // ---- 銃撃(bossState 機械から独立。プレイヤーが移動しながら撃つのと同じ層) ----------------------
  if (decision.action === 'shoot') firePhantomShot(phantom, s, bcx, bcy, sfx, patch, newGameTime, rand);

  // ---- 近接(即発ミラー・自前周期タイマー単独) -----------------------------------------------------
  // ★`decision.action==='melee'` は門番にしない: decideGhost が melee 意図を返すのは縁74px以内だけで、
  //   reach160の外側が死ぬ(GHOST_BOSS.md v6 2.)。距離は decideGhost へ注入したのと同じ edgeDistTo。
  // ★前隙(社長裁定2026-08-24・SAME_ARENA.md §7): 振り**始め**にカウンター窓(gpSwingAt)を開き、
  // 判定は MELEE_WINDUP_MS 後に解決する=プレイヤーと同条件。
  if (!parried
    && phantom.gpPendingSwingAt === undefined
    && newGameTime >= s.nextMeleeAt
    && edgeDistTo(bcx, bcy, player) <= GP_T.melee.reach) {
    // 振り始め: 窓・絵・SE だけ(プレイヤーの beginMeleeSwing と同じ分割)。
    patch.gpSwingAt = newGameTime;
    patch.gpSwingAngle = Math.atan2((player.y + player.height / 2) - bcy, (player.x + player.width / 2) - bcx);
    patch.gpPendingSwingAt = newGameTime;
    // ★踏み込み(社長裁定2026-08-24・同条件原則): プレイヤーと**同じ距離・同じ時間**で、
    // 振る向き(=プレイヤーの方)へ短く鋭く滑る。無敵は無い。減衰は敵共通のノックバックの器
    // (knockbackVx/Vy/Until)へ載せる=updateEnemies 側の壁・「行ける帯」のクランプをそのまま通る
    // (v0.25.3875 で帯クランプを足した経路。自前で座標を書くとまた同じ穴を開ける)。
    {
      const lspd = knockbackSpeedFor(meleeLungePx(combatActorPlayer(phantom.id) ?? player), MELEE_LUNGE_MS);
      const la = patch.gpSwingAngle ?? 0;
      const lnow = Date.now();
      patch.knockbackVx = Math.cos(la) * lspd;
      patch.knockbackVy = Math.sin(la) * lspd;
      patch.knockbackUntil = lnow + MELEE_LUNGE_MS;
      patch.knockbackShoveUntil = lnow + MELEE_LUNGE_MS; // ボス扱いの押しガードを自前の踏み込みには開ける
    }
    s.nextMeleeAt = newGameTime + PHANTOM_MELEE_PERIOD_MS;
  }
  // 前隙の解決(カウンターされていれば gpPendingSwingAt は既に消えている=ここへ来ない)。
  const pend = phantom.gpPendingSwingAt;
  if (pend !== undefined && newGameTime - pend >= MELEE_WINDUP_MS) {
    patch.gpPendingSwingAt = undefined;
    swingPhantomMelee(bcx, bcy, player, sfx, patch, newGameTime, s.growthAtkMult, phantom.id);
  }

  applyPatch(phantom.id, patch);
};

/** 盤面から幻影を1体拾う(pickActiveBounty と同じ作法・通常運用は同時1体)。 */
export const pickActivePhantom = (enemies: readonly Enemy[]): Enemy | undefined =>
  enemies.find(e => e.type === GUARDIAN_PHANTOM_TYPE);
