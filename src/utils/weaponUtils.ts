import { Weapon, CharacterClass, WeaponType, Projectile, Player, Enemy, AmmoType } from '../types/game';
import { useGameStore, skillLevel, skillBenkeiCritBonus, scavengerGunMult, skillAttackShooterGunMult, skillLastMagazineMult, consumableAttackMult, MELEE_RADIUS, skillOutgoingDamageMult, skillCritMult, CRIT_DAMAGE_MULT } from '../store/gameStore';
import { projectileHitCritChance } from './critPenalty';
import { classifyProjectileDamageChannel } from './botTelemetry';
import { playEnemyDeath, playSfx } from '../audio/audioManager';
import { PLAYER_PROFILES } from '../data/playerProfiles';
import { aimEnemyDist2, pickNearestTarget, isCorpse } from './enemyUtils';
import { zoomCompensatedWorldDistance } from './cameraZoom';
import { bigBulletSizeMult } from './skillEffectsB7';
import { isTrapDebuffed, TRAP_PVP_RELOAD_MULT } from './trapDebuff';
import { HUNTING_MELEE_RADIUS_BONUS_BY_LEVEL } from '../config/hunting';
import { SLOT_CATEGORIES, SLOT_CANDIDATES } from '../data/weaponSlots';
// UNIQUE_WEAPONS.md §4-1: getStartingWeapons(出撃時のT1)は生成点の1つ。resolveSlotKeyNowは
// weaponUtils.tsのcatalogCategoryTierを読むので相互import(2ファイル循環)になるが、どちらの
// モジュールもトップレベル評価時に相手の値を参照しない(参照は全て関数呼び出し内)ため安全。
import { resolveSlotKeyNow } from './weaponSlot';
import { DUAL_RANGE_STATS, resolveDualRangeMode } from './dualRangeGun';
// UNIQUE_WEAPONS.md §16-2(バッチB): 状態を持つ4挺の純関数モジュール(dualRangeGun.tsと同じ作法)。
import { resolveFocusSpreadRad, FOCUS_SPREAD_INITIAL_RAD } from './focusSpread';
import { CYCLE_MODE_STATS } from './cycleShotgun';
import { heavySniperChargeFrac, heavySniperRangePx, heavySniperCooldownMs, HEAVY_SNIPER_BASE_COOLDOWN_MS } from './heavySniperCharge';
import { resolveDesertTechAmmoType, DESERTTECH_WEAPON_KEY, type DesertTechAmmoPools } from './desertTechAmmo';
// UNIQUE_WEAPONS.md §16-2/§19-1(バッチC-1): 持続線分/扇の3挺。状態機械はuseGameLoop.ts、
// ここはCATALOGへ書く定数の単一の出どころ(値の二重管理を避ける)。
import { EYE_LASER_PULSE_DAMAGE, EYE_LASER_MAG_SIZE, EYE_LASER_RELOAD_MS_RAW } from './eyeLaserGun';
import { FLAMER_PULSE_DAMAGE, FLAMER_MAG_SIZE, FLAMER_RELOAD_MS_RAW, FLAMER_RANGE_PX } from './flamerCone';
// UNIQUE_WEAPONS.md §16-2(バッチC-2): 近接切替/弾の軌道の3挺。状態そのものはfireWeapon内で完結
// (ガンブレードのモードだけWeapon.gunbladeMeleeModeへ持ち越す)。
import { GUNBLADE_RANGED_DAMAGE, GUNBLADE_RANGED_COOLDOWN_MS, GUNBLADE_MODE_STATS, GUNBLADE_MELEE_RANGE_PX, GUNBLADE_MELEE_KNOCKBACK_MULT, resolveGunbladeMode } from './gunbladeMelee';
import { assignHomingShotgunTargetsByAzimuth } from './homingShotgun';
import { coilPelletAmplitudePx } from './coilShotgun';
// UNIQUE_WEAPONS.md §16-2(バッチD): ランチャー3挺の定数の単一の出どころ(値の二重管理を避ける)。
import { ROCKET_CHARGE_MS } from './rocketLauncher';

// プレイヤー中心→敵 の二乗距離。**全ての敵で「当たり判定の矩形の最近点」**まで測る(v0.25.3170・
// 社長指示「当たり判定の四隅でみて」)。中心基準だと巨体の縁に立っていても射程外扱いになる。
// v0.25.2567: 式の正本は enemyUtils.aimEnemyDist2 へ移設(守護霊の銃射程ゲートと同じ1本を使うため)。
const aimDist2 = aimEnemyDist2;

// Global muzzle-velocity multiplier. Bullets leave the barrel faster so shots
// feel snappier and reach their target sooner.
const PROJECTILE_SPEED_MULT = 1.5;
const SHOTGUN_SPREAD_CONE_RAD_BY_TIER: Record<number, number> = {
  1: 1.00,
  2: 0.70,
  3: 0.36,
};
const TIER_CRIT_STEP = 0.03;
const BASE_CRIT_BY_CATEGORY: Record<AmmoType, number> = {
  handgun: 0.10,
  shotgun: 0.05,
  rifle: 0.20,
  phill: 0, // PHILL銃のクリ(ヘッドショット)は命中位置で確定付与。基礎クリ率は0。
  glauncher: 0.20, // ライフル系準拠(v0.25.3290叩き台)
};

// ---------------------------------------------------------------------------
// Weapon catalog
// ---------------------------------------------------------------------------
// Three gun families (handgun / shotgun / rifle) × three tiers, plus three
// melee tiers. Guns auto-fire at the nearest enemy and burn ammo from their
// category pool; melee weapons are swung via the finger-release counter and
// cost no ammo. Tier raises power within a family.

interface WeaponDef {
  key: string;
  name: string;
  type: WeaponType;
  category?: AmmoType;
  tier: number;
  isMelee?: boolean;
  damage: number;
  cooldown: number;
  projectileSpeed?: number;
  projectileSize?: number;
  count?: number;        // bullets/pellets per shot
  passthrough?: boolean;
  magSize?: number;      // magazine capacity (rounds loaded); omit for melee
  reloadMs?: number;     // reload duration; heavier guns reload slower
  critChance?: number;   // fixed crit chance (melee weapons)
  pierce?: number;       // enemies the round passes through (piercing guns)
  // UNIQUE_WEAPONS.md §13-1(監査C-2): ユニーク武器用の新規フィールド3つ。
  // rangeOverride: そのカテゴリの RANGE_BY_CATEGORY を無視して使う自動射撃射程(px)。
  // 関数で渡すと createWeapon 呼び出し時(=全モジュール読み込み後)に評価される
  // (他モジュールの定数からの導出=循環import時のTDZを避けるための遅延評価。値を直書きしたい場合は数値のままでよい)。
  rangeOverride?: number | (() => number);
  knockbackMult?: number; // 弾命中時のノックバック倍率(knockbackEnemyのmultiplier引数へ)。既定=ノックバックしない(undefined)。
  postureMult?: number;   // 弾命中時の体勢削り倍率(applyBossPostureDamageのimpactMult引数へ)。Projectile.postureMultは既存(弾幕の王が使用)。
  // UNIQUE_WEAPONS.md §16-3前提工事(監査C-4): 散り角(rad)の武器別指定。無指定は従来どおり
  // SHOTGUN_SPREAD_CONE_RAD_BY_TIER(Tier別既定)。
  spreadRadOverride?: number;
  // UNIQUE_WEAPONS.md §17-3(監査A-3): 無限弾(クロスボウ)。
  infiniteAmmo?: true;
  // UNIQUE_WEAPONS.md §17-6(検収監査A-2の是正): 弾を撃たない武器(アイレーザー/火炎放射器)の印。
  // 守護霊(gunRangePx・buildGhostGunShots入口)・幻影(phantomTick.ts)・ボット(playtestDriver.ts)・
  // プレイヤー自身(useGameLoop.ts)の全経路がこの1フラグだけを見る(キー直書きをここへ集約)。
  nonProjectile?: true;
}

// UNIQUE_WEAPONS.md §13-1: パイルドライバー(handgun-t3-piledriver)の射程。
// MELEE_RADIUS(74) + HUNTING_MELEE_RADIUS_BONUS_BY_LEVEL[3](=Lv3最大伸長34) から**導出**する
// (108を直書きしない=ハンティング側の値を調整したらここも一緒に動く)。関数化してあるのは
// CATALOG(このファイルの module top-level)からの参照が MELEE_RADIUS(gameStore.ts)の循環import越しの
// TDZに触れないようにするため——createWeapon呼び出し時(=全モジュール読み込み完了後)に初めて評価される。
export const piledriverRangePx = (): number => MELEE_RADIUS + HUNTING_MELEE_RADIUS_BONUS_BY_LEVEL[3];

const CATALOG: Record<string, WeaponDef> = {
  // A — Handgun family (9mm). Fast, low damage, cheap to feed.
  'handgun-t1':       { key: 'handgun-t1', name: 'ハンドガン',     type: 'handgun', category: 'handgun', tier: 1, damage: 9,  cooldown: 420, projectileSpeed: 520, projectileSize: 8, count: 1, magSize: 12, reloadMs: 900 },
  'handgun-t2':       { key: 'handgun-t2', name: '二丁ハンドガン', type: 'handgun', category: 'handgun', tier: 2, damage: 9,  cooldown: 420, projectileSpeed: 520, projectileSize: 8, count: 2, magSize: 10, reloadMs: 1100 },
  // マシンピストルT3: 連射×大容量でクリ上振れ(16%)がバランスブレイカーだったため、純粋クリ率を5%に固定(加算分は別)。
  'handgun-t3':       { key: 'handgun-t3', name: 'マシンピストル', type: 'handgun', category: 'handgun', tier: 3, damage: 7,  cooldown: 100, projectileSpeed: 560, projectileSize: 7, count: 1, magSize: 30, reloadMs: 1300, critChance: 0.05 },

  // ユニーク武器(UNIQUE_WEAPONS.md §13-1・第1弾=ハンドガン3種)。数値は叩き台(社長明言・実機調整前提)。
  // デリンジャー(T1): 瞬間火力+頻繁なリロード。装弾数2発・1発威力アップ。
  'handgun-t1-derringer':  { key: 'handgun-t1-derringer',  name: 'デリンジャー',       type: 'handgun', category: 'handgun', tier: 1, damage: 17, cooldown: 300, projectileSpeed: 540, projectileSize:  9, count: 1, magSize: 2, reloadMs:  700 },
  // ハンドキャノン(T2): 単発威力高め・同一敵への連続命中で威力が段階的に低下(handcannonDecay.ts。リロードで全リセット)。
  'handgun-t2-handcannon': { key: 'handgun-t2-handcannon', name: 'ハンドキャノン',     type: 'handgun', category: 'handgun', tier: 2, damage: 31, cooldown: 620, projectileSpeed: 560, projectileSize: 11, count: 1, magSize: 6, reloadMs: 1200 },
  // パイルドライバー(T3): 極端な短射程(rangeOverride=導出108px・ズーム非補正)+強ノックバック+高体勢削り。
  // knockbackMult/postureMultの数値は★未決候補(社長仕様は「強い/非常に高い」という定性表現のみ・#U9/#U10)。
  'handgun-t3-piledriver': { key: 'handgun-t3-piledriver', name: 'パイルドライバー',   type: 'handgun', category: 'handgun', tier: 3, damage: 36, cooldown: 450, projectileSpeed: 620, projectileSize: 12, count: 1, magSize: 6, reloadMs: 1300, critChance: 0.05, rangeOverride: piledriverRangePx, knockbackMult: 2, postureMult: 2 },
  // UNIQUE_WEAPONS.md §16(バッチA)。クロスボウ(T1): 1発ごとに装填(magSize:1)する代わりに
  // リザーブが尽きない(infiniteAmmo。実効DPS=16.00・既定比+1.3%・§16-1)。
  'handgun-t1-crossbow':   { key: 'handgun-t1-crossbow',   name: 'クロスボウ',         type: 'handgun', category: 'handgun', tier: 1, damage: 24, cooldown: 300, projectileSpeed: 560, projectileSize: 8, count: 1, magSize: 1, reloadMs: 600, infiniteAmmo: true },
  // デュアルレンジピストル(T2): 対象までの距離で近(14/cd260)/遠(28/cd700)の数値セットが入れ替わる
  // (dualRangeGun.ts。ヒステリシス=近へ入る120px以下/遠へ戻る180px以上)。CATALOGの既定値は
  // 「遠」セット(=交戦開始時の初期モード。weapon.dualRangeMode未設定は'far'扱い)。
  // rangeOverride=220(§16-1)。実効DPSは近29.17(+3.7%)/遠30.43(+8.2%)・§16-1。
  'handgun-t2-dualrange':  { key: 'handgun-t2-dualrange',  name: 'デュアルレンジピストル', type: 'handgun', category: 'handgun', tier: 2, damage: 28, cooldown: 700, projectileSpeed: 700, projectileSize: 8, count: 1, magSize: 10, reloadMs: 1100, rangeOverride: 220 },

  // UNIQUE_WEAPONS.md §16-2/§17-5(バッチC-2)。ガンブレード(T3): 通常は銃(8/cd110)。至近
  // (≤90px=GUNBLADE_MELEE_RANGE_PX)の敵には近接系の強攻撃へ切り替わる(gunbladeMelee.ts。
  // ダメージ×1.6・間隔400ms・ノックバック×1.5=fireWeaponが撃つ瞬間の距離で確定し
  // weapon.gunbladeMeleeModeへ持ち越す。体勢削りheavyはuseGameLoop.tsの着弾処理側)。
  // critChance=0.05を明示(§17-2「連射×大容量で16%はバランスブレイカー」の再現を避ける。
  // 導出だと0.16になる=handgun-t3と同じ事故)。実効DPS(通常銃モード)=38.10(既定比+1.6%・§16-1)。
  'handgun-t3-gunblade':   { key: 'handgun-t3-gunblade',   name: 'ガンブレード',       type: 'handgun', category: 'handgun', tier: 3, damage: GUNBLADE_RANGED_DAMAGE, cooldown: GUNBLADE_RANGED_COOLDOWN_MS, projectileSpeed: 560, projectileSize: 7, count: 1, magSize: 26, reloadMs: 1300, critChance: 0.05 },

  // B — Shotgun family (12g). One trigger pull = one shell (the spread is free),
  // so the magazine is sized in SHOTS, not pellets (3 shots per mag).
  'shotgun-t1':       { key: 'shotgun-t1', name: 'ショットガン',   type: 'shotgun', category: 'shotgun', tier: 1, damage: 6,  cooldown: 950, projectileSpeed: 440, projectileSize: 7, count: 5, magSize: 3, reloadMs: 1100 },
  'shotgun-t2':       { key: 'shotgun-t2', name: 'ポンプ式',       type: 'shotgun', category: 'shotgun', tier: 2, damage: 7,  cooldown: 780, projectileSpeed: 470, projectileSize: 7, count: 6, magSize: 3, reloadMs: 1800 },
  'shotgun-t3':       { key: 'shotgun-t3', name: 'オートショット', type: 'shotgun', category: 'shotgun', tier: 3, damage: 6,  cooldown: 430, projectileSpeed: 480, projectileSize: 7, count: 7, magSize: 3, reloadMs: 1700 },

  // UNIQUE_WEAPONS.md §16(バッチA)。制圧型ショットガン(T2): ライフル並みの長射程(rangeOverride=250)
  // + 大きく広げた散り角(spreadRadOverride=1.30rad。既定T2は0.70rad)。弾付与スキル(延焼/凍傷)は
  // 武器側で何もしない=既存スキルが命中ごとに乗るだけ(社長ルール)。実効DPS=23.08(既定比+8.8%・§16-1)。
  'shotgun-t2-suppress': { key: 'shotgun-t2-suppress', name: '制圧型ショットガン', type: 'shotgun', category: 'shotgun', tier: 2, damage: 4, cooldown: 880, projectileSpeed: 470, projectileSize: 7, count: 12, magSize: 3, reloadMs: 1800, rangeOverride: 250, spreadRadOverride: 1.30 },

  // UNIQUE_WEAPONS.md §16-2(バッチC-2・2026-09-07 C-2検収A-1で確定)。コイルショットガン(T2):
  // 散弾が一度外へ広がってから狙点へ再収束する軌道(coilShotgun.ts+gameStore.tsの移動tick。
  // 判定・弾数・弾薬は通常のカウント式ショットガンと同じ=サイクル式に現れない式外の演出=§5-2の
  // 思想と同型)。★spreadRadOverride:0=基礎の拡散角を持たせない(広がりは全部横ズレで作る・A-1)。
  // 実効DPS=22.73(既定比+7.1%・§16-1)。
  'shotgun-t2-coil': { key: 'shotgun-t2-coil', name: 'コイルショットガン', type: 'shotgun', category: 'shotgun', tier: 2, damage: 5, cooldown: 780, projectileSpeed: 470, projectileSize: 7, count: 9, magSize: 3, reloadMs: 1800, spreadRadOverride: 0 },

  // UNIQUE_WEAPONS.md §16-2/§17-1(バッチB)。収束型ショットガン(T1): 命中した射撃ごとに散り角が
  // 1段階狭まる(focusSpread.ts。初期1.30rad→-0.18/命中→下限0.36。2.5秒当てないと初期へリセット)。
  // 装弾数2(既定T1の3より少ない=支配テストの劣る軸・§17-1)。実効DPS=18.75(既定比+5.2%・§16-1)。
  // rangeOverrideは無し(カテゴリ既定=140pxのまま。設計書§16-2に射程の指定は無い)。
  'shotgun-t1-focus': { key: 'shotgun-t1-focus', name: '収束型ショットガン', type: 'shotgun', category: 'shotgun', tier: 1, damage: 6, cooldown: 700, projectileSpeed: 470, projectileSize: 7, count: 5, magSize: 2, reloadMs: 900, spreadRadOverride: FOCUS_SPREAD_INITIAL_RAD },

  // UNIQUE_WEAPONS.md §16-2/§17-7(バッチB)。切替式ショットガン(T1): リロード(装填)を境に
  // 散弾⇔スラッグが反転する(cycleShotgun.ts)。CATALOGの静的値は初期モード「散弾」
  // (damage6/count5/spread1.10rad=CYCLE_MODE_STATS.shotと同値)。連射間隔1000(既定T1の950より遅い)
  // で劣る軸を作る(§17-1)。距離では切り替えない(社長指定)。実効DPS=18.00(既定比+1.0%・§16-1・両モード共通)。
  'shotgun-t1-cycle': { key: 'shotgun-t1-cycle', name: '切替式ショットガン', type: 'shotgun', category: 'shotgun', tier: 1, damage: CYCLE_MODE_STATS.shot.damage, cooldown: 1000, projectileSpeed: 470, projectileSize: 7, count: CYCLE_MODE_STATS.shot.count, magSize: 3, reloadMs: 1000, spreadRadOverride: CYCLE_MODE_STATS.shot.spreadRadOverride },

  // UNIQUE_WEAPONS.md §16-2/§17-2(バッチC-1)。火炎放射器(T3): 弾を撃たず前方の扇(0.5rad)へ
  // 射程90px(rangeOverride)の持続判定。100msごとに5ダメージ・弾1消費(装填40=4秒照射)。
  // damage/magSize/reloadMsはflamerCone.tsが単一の出どころ(サイクル式と二重管理しない)。
  // cooldownは未使用(fireWeaponの自動射撃を通らない状態機械=useGameLoop.ts)。
  // 武器自体に燃焼は持たせない(社長指定)。サイクル実効DPS=28.57(既定shotgun-t3比+6.3%・§5-2)。
  'shotgun-t3-flamer': { key: 'shotgun-t3-flamer', name: '火炎放射器', type: 'shotgun', category: 'shotgun', tier: 3, damage: FLAMER_PULSE_DAMAGE, cooldown: 100, count: 1, magSize: FLAMER_MAG_SIZE, reloadMs: FLAMER_RELOAD_MS_RAW, rangeOverride: FLAMER_RANGE_PX, nonProjectile: true },

  // UNIQUE_WEAPONS.md §16-2(バッチC-2)。誘導散弾ショットガン(T3): 各ペレットが近くの敵へ誘導する
  // (旋回はgameStore.tsのhoming-missileと同じ式=homingPelletフラグで開く。対象割り振りは新規=
  // homingShotgun.ts。敵が複数なら分散・1体なら全弾集中)。実効DPS=28.78(既定比+7.1%・§16-1)。
  'shotgun-t3-homing': { key: 'shotgun-t3-homing', name: '誘導散弾ショットガン', type: 'shotgun', category: 'shotgun', tier: 3, damage: 5, cooldown: 430, projectileSpeed: 470, projectileSize: 7, count: 9, magSize: 3, reloadMs: 1700 },

  // C — Rifle/Magnum family (.44). Heavy single rounds. The revolver pierces
  // one enemy; higher tiers pierce freely.
  'rifle-t1':         { key: 'rifle-t1',   name: 'マグナム',       type: 'rifle',   category: 'rifle',   tier: 1, damage: 30, cooldown: 800,  projectileSpeed: 700,  projectileSize: 9,  count: 1, magSize: 6, reloadMs: 1500, passthrough: true, pierce: 1 },
  'rifle-t2':         { key: 'rifle-t2',   name: 'スナイパー',     type: 'rifle',   category: 'rifle',   tier: 2, damage: 55, cooldown: 1100, projectileSpeed: 1000, projectileSize: 8,  count: 1, passthrough: true, magSize: 5, reloadMs: 2000 },
  // 社長指示v0.25.3291「スナイプのtier3入れ替え(グレネード被りなので廃止 爆発もしない)」:
  // 旧rifle-t3=グレネードランチャーは武器庫限定glauncher系と役割被りのため廃止し、スナイパー上位の
  // **対物ライフル**へ差し替え(爆発しない・貫通スナイパー)。数値は叩き台: t2スナイパー(55/1100)の上位。
  'rifle-t3':         { key: 'rifle-t3',   name: '対物ライフル',   type: 'rifle',   category: 'rifle',   tier: 3, damage: 110, cooldown: 1300, projectileSpeed: 1100, projectileSize: 9, count: 1, passthrough: true, magSize: 4, reloadMs: 2200 },

  // UNIQUE_WEAPONS.md §16(バッチA)。ボルトアクション(T1): rangeOverride=320(既定T1の250より遠い)。
  // 貫通クラスは既定T1と同じ(passthrough+pierce1・§17-2)。実効DPS=24.30(既定比+5.3%・§16-1)。
  'rifle-t1-bolt': { key: 'rifle-t1-bolt', name: 'ボルトアクション', type: 'rifle', category: 'rifle', tier: 1, damage: 52, cooldown: 1500, projectileSpeed: 1100, projectileSize: 9, count: 1, magSize: 5, reloadMs: 1600, passthrough: true, pierce: 1, rangeOverride: 320 },

  // UNIQUE_WEAPONS.md §16-2/§17-8 C-3(バッチB)。デザートテック(T1): 専用弾(rifle)が尽きたら
  // 他カテゴリの弾を代用する(rifle→handgun→shotgun→glauncherの優先順・desertTechAmmo.ts)。
  // rangeOverride=200。貫通クラスは既定T1と同じ(passthrough+pierce1・§17-2)。
  // 実効DPS=23.82(既定比+3.2%・§16-1)。
  'rifle-t1-deserttech': { key: 'rifle-t1-deserttech', name: 'デザートテック', type: 'rifle', category: 'rifle', tier: 1, damage: 27, cooldown: 800, projectileSpeed: 650, projectileSize: 8, count: 1, magSize: 6, reloadMs: 1000, passthrough: true, pierce: 1, rangeOverride: 200 },

  // UNIQUE_WEAPONS.md §16-2(バッチB)。大型狙撃銃(T2): 静止時間の蓄積(heavySniperCharge.ts)。
  // 止まっている間0→3秒で最大まで伸び、射程250→400・連射間隔×1.0→×0.6。移動した瞬間に0へリセット。
  // CATALOGの静的値=蓄積0の素の値(帯はこれで測る・§16-1)。rangeOverrideは無し
  // (蓄積0時の250はカテゴリ既定=RANGE_BY_CATEGORY.rifleと同値なので、動的な上書きはfireWeapon側で行う)。
  // 貫通クラスは既定T2/T3と同じ(passthroughのみ・§17-2)。実効DPS=29.52(既定比+2.0%・§16-1)。
  'rifle-t2-heavysniper': { key: 'rifle-t2-heavysniper', name: '大型狙撃銃', type: 'rifle', category: 'rifle', tier: 2, damage: 62, cooldown: HEAVY_SNIPER_BASE_COOLDOWN_MS, projectileSpeed: 1000, projectileSize: 8, count: 1, passthrough: true, magSize: 5, reloadMs: 2000 },

  // UNIQUE_WEAPONS.md §16-2(バッチC-1)。氷槍ライフル(T2): 通常の貫通ライフル弾(数値は汎用式で
  // 帯を測る=既定比+0.2%・§16-1)に加え、弾の射線へ短時間の床(幅28px/1.2秒/200msごとに直撃の20%)を
  // 残す(iceLanceFloor.ts+persistentBeam.ts。副次ダメージは基準DPSの式外=貫通と同じ扱い・§5-2)。
  // 武器自体に凍傷は持たせない(社長指定)。貫通クラスは既定T2/T3と同じ(passthroughのみ・§17-2)。
  'rifle-t2-icelance': { key: 'rifle-t2-icelance', name: '氷槍ライフル', type: 'rifle', category: 'rifle', tier: 2, damage: 58, cooldown: 1200, projectileSpeed: 900, projectileSize: 9, count: 1, passthrough: true, magSize: 5, reloadMs: 2000 },

  // UNIQUE_WEAPONS.md §16-2/§17-2(バッチC-1)。アイレーザー(T3): 溜め700ms→照射3000ms(100msごとに
  // 14ダメージ・貫通・対象を追尾)→リロード。damageは1パルスの値(状態機械はuseGameLoop.ts・
  // 定数はeyeLaserGun.ts)。cooldownは未使用(この武器はfireWeaponの自動射撃を通らない=
  // 状態機械が直接gameTimeで回す・100msはパルス間隔と同じ値を仮に置いているだけ)。
  // サイクル実効DPS=48.28(既定rifle-t3比+5.3%・§5-2)。critChanceは導出のまま(§17-2)。
  'rifle-t3-eyelaser': { key: 'rifle-t3-eyelaser', name: 'アイレーザー', type: 'rifle', category: 'rifle', tier: 3, damage: EYE_LASER_PULSE_DAMAGE, cooldown: 100, count: 1, passthrough: true, magSize: EYE_LASER_MAG_SIZE, reloadMs: EYE_LASER_RELOAD_MS_RAW, nonProjectile: true },

  // Melee (no ammo). Lower DPS than guns by design so bullets stay valuable.
  // Each carries a fixed crit chance that rises with tier. Tier はレベルアップ
  // 3枠目から段階的に強化される(knife-t1 → … → anti-mutant-knife-t5)。
  'knife-t1':         { key: 'knife-t1',   name: 'ナイフ',         type: 'knife',   tier: 1, isMelee: true, damage: 8,  cooldown: 0, critChance: 0.05 },
  'hatchet-t2':       { key: 'hatchet-t2', name: 'ダガー',         type: 'hatchet', tier: 2, isMelee: true, damage: 14, cooldown: 0, critChance: 0.08 },
  'machete-t3':       { key: 'machete-t3', name: 'ファイティングナイフ', type: 'machete', tier: 3, isMelee: true, damage: 22, cooldown: 0, critChance: 0.12 },
  'tactical-knife-t4':    { key: 'tactical-knife-t4',    name: 'タクティカルナイフ', type: 'tactical-knife',    tier: 4, isMelee: true, damage: 34, cooldown: 0, critChance: 0.18 },
  'anti-mutant-knife-t5': { key: 'anti-mutant-knife-t5', name: '対変異体ナイフ',     type: 'anti-mutant-knife', tier: 5, isMelee: true, damage: 50, cooldown: 0, critChance: 0.25 },

  // 研究所専用リボルバー「ＰＨＩＬＬ-銃」。狙って撃つ手動武器(自動射撃しない)。頭部命中で確定ヘッドショット、
  // 胴体は通常ダメージ＋2倍ノックバック。攻撃力2倍(社長指示)=ダメージ80。ステージ2敵HP2倍と釣り合う。射撃CD=1秒。
  'phill-revolver':   { key: 'phill-revolver', name: 'ＰＨＩＬＬ-銃', type: 'phill-bullet', category: 'phill', tier: 1, damage: 80, cooldown: 1000, projectileSpeed: 640, projectileSize: 9, count: 1, magSize: 6, reloadMs: 900 },

  // 社長指示v0.25.3290→訂正v0.25.3297: グレネード系銃器(第4枠)。**武器箱/敵ドロップから
  // 4カテゴリ目として普通に出る**(エリアTier率でt1〜t3)。武器庫のTier3化対象にも含む。
  // 弾はライフル弾共用。着弾爆発は旧rifle-t3と同じGRENADE経路(isGrenadeGunKeyで判定)。
  // 数値は叩き台: 旧グレネードランチャー(95/1400)を起点にtierで伸ばす。
  'glauncher-t1': { key: 'glauncher-t1', name: 'グレネードガン',   type: 'rifle', category: 'glauncher', tier: 1, damage: 85,  cooldown: 1500, projectileSpeed: 420, projectileSize: 14, count: 1, magSize: 3, reloadMs: 2200, passthrough: true },
  'glauncher-t2': { key: 'glauncher-t2', name: 'グレネードガンⅡ', type: 'rifle', category: 'glauncher', tier: 2, damage: 110, cooldown: 1350, projectileSpeed: 440, projectileSize: 15, count: 1, magSize: 4, reloadMs: 2100, passthrough: true },
  'glauncher-t3': { key: 'glauncher-t3', name: 'グレネードガンⅢ', type: 'rifle', category: 'glauncher', tier: 3, damage: 140, cooldown: 1200, projectileSpeed: 460, projectileSize: 16, count: 1, magSize: 5, reloadMs: 2000, passthrough: true },

  // UNIQUE_WEAPONS.md §16-2/§16-5(バッチD)。ロケットランチャー(T1): 溜め(500ms)→直進弾(追尾なし)
  // →敵か壁に当たった時だけ爆発。何にも当たらなければ不発。★溜めはcooldownそのもの(=別時間として
  // 足さない・受け入れ条件8)。状態機械はfireWeapon側の1フック(rocketChargeMsフック・下記)+
  // useGameLoop.tsの壁ヒット/速度復帰tick。爆発範囲は既定glauncher-t1の×1.2(ROCKET_BLAST_RADIUS_MULT・
  // useGameLoop.ts側で適用)。サイクル実効DPS=31.11(既定glauncher-t1=28.65比+8.6%・§5-2)。
  'glauncher-t1-rocket': { key: 'glauncher-t1-rocket', name: 'ロケットランチャー', type: 'rifle', category: 'glauncher', tier: 1, damage: 140, cooldown: ROCKET_CHARGE_MS, projectileSpeed: 460, projectileSize: 16, count: 1, magSize: 1, reloadMs: 2000, passthrough: true },

  // UNIQUE_WEAPONS.md §16-2/§16-5(バッチD)。錬金砲(T2): 破裂(弱い範囲・ALCHEMY_BURST_RADIUS_PX)→
  // 範囲内の敵へ金の石を付着(alchemyStone.ts・Enemy.alchemyStoneStage)→再命中で最大3段階まで成長→
  // 指を離した瞬間に全部起爆(gameStore.detonateAlchemyStones)。石の起爆自体はここのdamageとは別枠
  // (段階ごとに固定値60/120/200・ALCHEMY_STONE_DAMAGE_BY_STAGE)。サイクル実効DPS=48.48
  // (既定glauncher-t2=45.83比+5.8%・§5-2)。
  'glauncher-t2-alchemy': { key: 'glauncher-t2-alchemy', name: '錬金砲', type: 'rifle', category: 'glauncher', tier: 2, damage: 30, cooldown: 700, projectileSpeed: 440, projectileSize: 15, count: 1, magSize: 4, reloadMs: 1900, passthrough: true },

  // UNIQUE_WEAPONS.md §16-2/§16-3b/§16-5(バッチD)。シグナルランチャー(T3): 手動専用
  // (isManualOnlyGunKey・オート射撃なし)。PHILL銃のターゲットサイトを流用し、指を離した瞬間の
  // 地点を記録→900ms後にその地点へ空爆(追尾しない)。damageは空爆1発の値
  // (gameStore.fireSignalLauncher・signalLauncher.ts)。★弾を撃たない銃ではない(自弾を作らず
  // 「予約」を積むだけ)なのでnonProjectileは付けない(付けると守護霊/ボットが「撃たない」に
  // 倒れてしまう=§16-3bのフォールバック規則と衝突する)。サイクル実効DPS=75.69
  // (既定glauncher-t3=70.00比+8.1%・§5-2。着弾遅延900msをcooldownへ畳んで測る)。
  'glauncher-t3-signal': { key: 'glauncher-t3-signal', name: 'シグナルランチャー', type: 'rifle', category: 'glauncher', tier: 3, damage: 275, cooldown: 1400, count: 1, magSize: 3, reloadMs: 2000 }
};

// UNIQUE_WEAPONS.md §13-1: 個別の挙動配線(ハンドキャノンの連続命中減衰・パイルドライバーの
// ノックバック/体勢削り)がweaponKeyで判定するための定数。マジックストリングを1箇所にまとめる。
export const HANDCANNON_WEAPON_KEY = 'handgun-t2-handcannon';
export const PILEDRIVER_WEAPON_KEY = 'handgun-t3-piledriver';
// UNIQUE_WEAPONS.md §16(バッチA): デュアルレンジピストルの距離ヒステリシス(dualRangeGun.ts)を
// fireWeaponから配線するためのキー定数。
export const DUALRANGE_WEAPON_KEY = 'handgun-t2-dualrange';
// UNIQUE_WEAPONS.md §16-2(バッチB): 状態を持つ4挺のキー定数。
export const FOCUS_WEAPON_KEY = 'shotgun-t1-focus';
export const CYCLE_WEAPON_KEY = 'shotgun-t1-cycle';
export const HEAVY_SNIPER_WEAPON_KEY = 'rifle-t2-heavysniper';
// デザートテックのキー自体はdesertTechAmmo.tsが正本(そちらでも使うため)。ここは再輸出のみ。
export { DESERTTECH_WEAPON_KEY };
// UNIQUE_WEAPONS.md §16-2/§19-1(バッチC-1): 持続線分/扇の3挺のキー定数。
// アイレーザー/火炎放射器は非投射武器(弾を作らない・§17-6)なのでfireWeaponの自動射撃から
// 除外し(useGameLoop.ts)、守護霊/幻影/ボットの3経路でも「撃たない」扱いにする。
export const EYE_LASER_WEAPON_KEY = 'rifle-t3-eyelaser';
export const ICE_LANCE_WEAPON_KEY = 'rifle-t2-icelance';
export const FLAMER_WEAPON_KEY = 'shotgun-t3-flamer';
// UNIQUE_WEAPONS.md §16-2(バッチC-2): 近接切替/弾の軌道の3挺のキー定数。
export const GUNBLADE_WEAPON_KEY = 'handgun-t3-gunblade';
export const COIL_SHOTGUN_WEAPON_KEY = 'shotgun-t2-coil';
export const HOMING_SHOTGUN_WEAPON_KEY = 'shotgun-t3-homing';
// UNIQUE_WEAPONS.md §16-2(バッチD): ランチャー3挺のキー。
export const ROCKET_WEAPON_KEY = 'glauncher-t1-rocket';
export const ALCHEMY_WEAPON_KEY = 'glauncher-t2-alchemy';
export const SIGNAL_WEAPON_KEY = 'glauncher-t3-signal';

// UNIQUE_WEAPONS.md §4: resolveSlotKey(weaponSlot.ts)がCATALOGの中身を見に行くための細い窓。
// CATALOG自体は非公開のまま(意味不明なキーの直接生成を増やさない)。
export const catalogCategoryTier = (key: string): { category?: AmmoType; tier?: number } => {
  const def = CATALOG[key];
  return def ? { category: def.category, tier: def.tier } : {};
};

const weaponBaseCritChance = (def: WeaponDef): number | undefined => {
  if (def.critChance !== undefined) return def.critChance; // 個別指定(近接, およびマシンピストルT3)を優先
  if (!def.category) return undefined;
  return BASE_CRIT_BY_CATEGORY[def.category] + Math.max(0, def.tier - 1) * TIER_CRIT_STEP;
};

export const GUN_KEYS_BY_CATEGORY: Record<AmmoType, string[]> = {
  handgun: ['handgun-t1', 'handgun-t2', 'handgun-t3'],
  shotgun: ['shotgun-t1', 'shotgun-t2', 'shotgun-t3'],
  rifle:   ['rifle-t1', 'rifle-t2', 'rifle-t3'],
  phill:   ['phill-revolver'], // 屋内固定銃。ドロップ/商人の銃ラインには出ない(weaponDrop は handgun/shotgun/rifle のみ抽選)。
  glauncher: ['glauncher-t1', 'glauncher-t2', 'glauncher-t3'] // v0.25.3297: 武器箱/ドロップの4カテゴリ目(DROP_CATEGORIES)。
};
// CRIT-UNIFY §9.4: 「プレイヤー直接武器」の銃10種(全カテゴリ合算)。着弾時ロール(トラップ+10%/
// 弱点+10%)をこの集合の弾だけに限定するための判定(escort/ghost-gun/タレット/ホーミング/跳弾/
// ジャンク等のサブ・味方系projectileは対象外=weaponKeyがこの集合に無い)。
// 既知の限界(★実装精度の規律1で明記): タレットの10%ランチャー弾とスキル「爆撃」(poi-bombing)の弾は
// GRENADE_WEAPON_KEY('rifle-t3')を発射元プレイヤーの経路ごと再借用しており(useGameLoop.ts)、
// weaponKeyだけでは実銃と区別できない(既存のスキル倍率適用等でも同様に区別していない=本バッチ由来の
// 新しい曖昧さではない)。この2つは着弾時ロール対象に紛れ込むが、critChanceを持たない(0扱い)ため
// このバッチが問題にしていた生成時crit boolean側には影響しない。
// v0.25.2514(GHOST-BUILD-1・§2.11訂正): 守護霊の銃弾('ghost-gun')も**この集合に含める**。
// 守護霊はプレイヤーの戦闘仕様の完全な写し(除外は演出/運用系の2群のみ)で、撃っている銃自体は
// この10種のいずれか=weaponKeyを'ghost-gun'にしているのは計測除外/ヘイト分離のための別名にすぎない。
// これでトラップ拘束+10%・弱点+10%の着弾ロールがプレイヤーと同じ条件で走る。
export const GHOST_GUN_WEAPON_KEY = 'ghost-gun';
// v0.25.2525(GHOST-REFLECT-MELEE-SUBS・台帳§4-1): 守護霊が**弾反射**で打ち返した弾の帰属キー。
// プレイヤーの反射弾(weaponKeyは元の敵弾のまま=undefined)と区別するためだけの別名で、飛翔特性・
// ダメージ倍率(REFLECT_DAMAGE_MULTIPLIER)・貫通なしはプレイヤーの反射と完全に同一。用途は3つ:
// ①計測除外(botTelemetry.classifyProjectileDamageChannel→null) ②ヘイト起因='ghost'
// ③倍率評価の主語=疑似Player(useGameLoopの弾ヒット処理)。**この集合(直接銃)には入れない**
// =着弾時ロール(トラップ+10%/弱点+10%)はプレイヤーの反射弾と同じく対象外。
export const GHOST_REFLECT_WEAPON_KEY = 'ghost-reflect';
// UNIQUE_WEAPONS.md §4-2(監査A2の是正): 候補キーの漏れを防ぐため、SLOT_CANDIDATES(4カテゴリの
// 既定+ユニーク候補すべて)の平坦化から作る。GUN_KEYS_BY_CATEGORYは既定候補のみ(§4-2「足さない」)
// なので、そちらから作ると新しいユニーク候補が漏れる。phillはSLOT_CANDIDATES対象外(近接同様スロット外)
// なのでGUN_KEYS_BY_CATEGORY.phillから別途合流する。
const DIRECT_GUN_WEAPON_KEYS = new Set<string>([
  ...SLOT_CATEGORIES.flatMap(cat => ([1, 2, 3] as const).flatMap(tier => SLOT_CANDIDATES[cat][tier])),
  ...GUN_KEYS_BY_CATEGORY.phill,
  GHOST_GUN_WEAPON_KEY,
]);
export const isDirectGunWeaponKey = (weaponKey: string | undefined): boolean =>
  weaponKey !== undefined && DIRECT_GUN_WEAPON_KEYS.has(weaponKey);
// Tier 昇順。MELEE_KEYS[tier] が「1段階上」のキー(tier は 1 始まり=0-indexed の次要素)。
export const MELEE_KEYS = ['knife-t1', 'hatchet-t2', 'machete-t3', 'tactical-knife-t4', 'anti-mutant-knife-t5'];
export const MAX_KNIFE_TIER = MELEE_KEYS.length; // = 5
// 現在のナイフTierから「1段階上」のキーを返す(Tier5以上は undefined)。
export const nextKnifeKey = (currentTier: number): string | undefined =>
  currentTier >= MAX_KNIFE_TIER ? undefined : MELEE_KEYS[currentTier];

// Player-state field name that holds the pool for a given ammo type.
export const AMMO_FIELD: Record<AmmoType, 'ammoHandgun' | 'ammoShotgun' | 'ammoRifle' | 'ammoPhill' | 'ammoGlauncher'> = {
  handgun: 'ammoHandgun',
  shotgun: 'ammoShotgun',
  rifle: 'ammoRifle',
  phill: 'ammoPhill',
  glauncher: 'ammoGlauncher' // ★v0.25.4000(社長指示「グレランは弾を分けて」): 独立プール化(旧: ammoRifle共用=v3290)
};

let weaponSeq = 0;
// Build a live Weapon instance from a catalog key.
export const createWeapon = (key: string): Weapon => {
  const def = CATALOG[key] ?? CATALOG['handgun-t1'];
  return {
    id: `weapon-${def.key}-${Date.now()}-${weaponSeq++}`,
    name: def.name,
    type: def.type,
    damage: def.damage,
    cooldown: def.cooldown,
    lastFired: 0,
    level: 1,
    projectileSpeed: def.projectileSpeed,
    projectileSize: def.projectileSize,
    count: def.count,
    passthrough: def.passthrough,
    magSize: def.magSize,
    magazine: def.magSize, // a fresh gun starts fully loaded
    reloadMs: def.reloadMs,
    critChance: weaponBaseCritChance(def),
    pierce: def.pierce,
    category: def.category,
    tier: def.tier,
    isMelee: def.isMelee,
    ammoType: def.category,
    key: def.key,
    // UNIQUE_WEAPONS.md §13-1(監査C-2): createWeaponはフィールドを明示コピーするので、
    // 新フィールドを足すたびここに書き足す必要がある(書き忘れると育った武器が土台なしに落ちる)。
    rangeOverride: typeof def.rangeOverride === 'function' ? def.rangeOverride() : def.rangeOverride,
    knockbackMult: def.knockbackMult,
    postureMult: def.postureMult,
    // UNIQUE_WEAPONS.md §16(バッチA): 同じくcreateWeaponで明示コピーが要る新フィールド2つ。
    spreadRadOverride: def.spreadRadOverride,
    infiniteAmmo: def.infiniteAmmo,
    // UNIQUE_WEAPONS.md §17-6(検収監査A-2の是正): 非投射武器の印もコピーが要る。
    nonProjectile: def.nonProjectile,
    // dualRangeMode はCATALOGに持たない(ランタイム状態。未設定='far'扱いはdualRangeGun.ts側の規約)。
  };
};

// All guns the player owns (excludes the melee weapon).
export const getGuns = (player: Player): Weapon[] =>
  player.weapons.filter(w => !w.isMelee);

// 武器keyの表示名(カタログが唯一の出どころ)。ビルドの写し(PlayerBuildSnapshot)には
// keyしか入っていないので、守護霊カード等の表示側はここから名前を引く(名前表を別に作らない)。
// 未知/欠損キーは '—'(記録が古くて武器が判らないケース)。
// 装備欄(銃スロット)に出す1行説明。社長指示2026-09-05「装備欄の武器にも説明入れて。スキルとかと同じく」。
// ★数値は書かない: バランス調整で文面が嘘になるため(チュートリアル本文と同じ規約)。
// **挙動と得意/不得意**だけを書く。未登録キーは空文字(=説明行を出さない)。
// ★★書く前に実装を読むこと(社長指摘2026-09-05「二丁ハンドガンとか説明通りじゃないけど、ちゃんと設定通りに」)。
// v0.25.4149 の初版は**実装を読まずに書いたので嘘が混ざっていた**(例: 二丁ハンドガンを「横に広く、
// 群れを取りこぼしにくい」と書いたが、実際の散り角は 0.12rad=約7度で**ほぼ同じ方向**へ飛ぶ。
// ショットガンT3を「薙ぎ払う」と書いたが、実際は**Tierが上がるほど散りが狭くなる**)。
// 各行の根拠は下のコメントに書いてある。値を変えた時はここも直す。
const WEAPON_DESC: Record<string, string> = {
  // ハンドガン(射程は中くらい)。count>1 の散り角は **0.12rad(約7度)固定**(computeShotDirections)
  // =ショットガンのような広がりではなく、ほぼ同じ方向へ飛ぶ。
  'handgun-t1': '素直な単発。扱いやすい標準装備',
  'handgun-t2': '一度に2発。ほぼ同じ方向へ飛ぶので、狙った相手に2発とも入る',
  'handgun-t3': '連射が速く弾倉も大きい。そのぶん弾の減りも速い',
  'handgun-t1-derringer': '装填は2発だけ。速く撃てるが、2発ごとに装填へ入る',
  'handgun-t2-handcannon': '単発が重い。同じ敵に当て続けると威力が落ち、装填で戻る',
  'handgun-t3-piledriver': '近づかないと撃たない。強く押し返し、体勢を大きく崩す',
  // クロスボウ(§16-2): infiniteAmmo=リザーブを消費しない。magSize:1=1発ごとにリロード。
  'handgun-t1-crossbow': '弾切れしない。ただし1発ごとに装填し直すので連射はできない',
  // デュアルレンジピストル(§16-2): 近14/cd260(速い・軽い)⇔遠28/cd700(遅い・重い)を距離で
  // 自動切替(dualRangeGun.ts)。方向を書き違えない=近いほど速射・軽い、遠いほど低速・重い。
  'handgun-t2-dualrange': '相手との距離で撃ち方が変わる。近ければ軽い連射、離れれば重い一撃',
  // ショットガン(射程が短い)。**散り角はTierが上がるほど狭くなる**
  // (SHOTGUN_SPREAD_CONE_RAD_BY_TIER = 1.00 / 0.70 / 0.36 rad)。
  'shotgun-t1': '大きく散る散弾。近くの群れに当てる',
  'shotgun-t2': '散りが狭まり、一発が重い。撃つ間隔は長い',
  'shotgun-t3': '散りが最も狭く弾数も多い。速射できる',
  // 制圧型ショットガン(§16-2): rangeOverride=250(既定ショットガン140よりライフル並みに遠い)+
  // spreadRadOverride=1.30(既定T2の0.70より広い)。
  'shotgun-t2-suppress': '散弾でありながらライフル並みに遠くへ届く。散りは大きく、面を抑える',
  // 収束型ショットガン(§16-2/バッチB): focusSpread.ts。命中した射撃ごとに散り角が1.30rad→0.36radまで
  // 段階的に狭まり(narrowFocusSpreadRad)、直近の命中から2.5秒経つと初期値へ戻る(resolveFocusSpreadRad)。
  'shotgun-t1-focus': '当て続けるほど弾がまとまり、狙いが集中していく。しばらく当てないと散りは元に戻る',
  // 切替式ショットガン(§16-2/§17-7/バッチB): cycleShotgun.ts。リロード(装填)が発生するたびに
  // 散弾(6dmg/5発/広い散り)⇔スラッグ(30dmg/1発/直進)が反転する。距離では切り替わらない。
  'shotgun-t1-cycle': 'リロードのたびに散弾と一点狙いの一発が入れ替わる。装填のタイミングで戦い方を選ぶ銃',
  // 火炎放射器(§16-2/バッチC-1): flamerCone.ts。弾を撃たず前方の扇に持続ダメージ。撃っている間ずっと弾を消費する。
  'shotgun-t3-flamer': '弾ではなく炎そのものを吹き付ける。撃ち続ける間ずっと弾が減っていく',
  // ライフル(射程が長い)。貫通の規則は2種類(useGameLoop の removeIt):
  //  ・pierce:N → 倒したかに関わらず **N+1体**に当たるまで進む(マグナムは N=1=2体)
  //  ・passthrough のみ → **倒した敵は貫いて進み、倒せなければそこで止まる**
  // どちらも貫くほど威力は落ちる(シャープシューターLv3で減衰なし)。
  'rifle-t1': '遠くまで届く一撃。2体まで貫く',
  'rifle-t2': '弾が速い高威力の一撃。倒した敵は貫いて進む',
  'rifle-t3': '最も重い一撃。倒した敵は貫いて進む',
  // ボルトアクション(§16-2): rangeOverride=320(既定ライフル250より遠い)。cooldown1500=既定T1の800より遅い。
  'rifle-t1-bolt': 'ライフルの中でも特に遠くを狙える一撃。1発が重く、次弾までの間隔も長い',
  // デザートテック(§16-2/§17-8 C-3/バッチB): desertTechAmmo.ts。専用弾(ライフル弾)が尽きると
  // ハンドガン→ショットガン→グレネードランチャーの順で他カテゴリの弾を自動で代用する
  // (weaponAmmoTypeFor経由。HUD/リロード/自動切替も同じ弾種を見る)。
  'rifle-t1-deserttech': '専用弾が切れても、持っている別の弾を代わりに使って撃ち続けられる',
  // 大型狙撃銃(§16-2/バッチB): heavySniperCharge.ts。静止している時間に応じて射程(250→400px)と
  // 連射間隔(×1.0→×0.6)が3秒かけて伸びる。移動した瞬間に蓄積は0へ戻る。
  'rifle-t2-heavysniper': '止まって構え続けるほど、届く距離も連射も伸びていく。動くと効果はすぐ消える',
  // 氷槍ライフル(§16-2/バッチC-1): 通常の貫通弾に加え、弾の通り道に短時間の床を残し継続ダメージを与える。
  'rifle-t2-icelance': '撃った跡が凍りつき、しばらく居座って踏んだ敵を傷つける',
  // アイレーザー(§16-2/バッチC-1): eyeLaserGun.ts。溜め→照射3秒(貫通・追尾)→リロード。
  // 照射中に対象を見失うとその場で終了し、残りの照射時間は失われる(再ターゲットしない)。
  'rifle-t3-eyelaser': '一瞬溜めてから光線を撃ち続ける。狙った相手を追い続けるが、見失うとそこで終わる',
  // ガンブレード(§16-2/§17-5/バッチC-2): gunbladeMelee.ts。至近(≤90px)に敵が入ると銃から
  // 近接系の強攻撃へ切り替わる(ダメージ×1.6・間隔400ms・ノックバック×1.5)。遠距離の実効DPSより
  // 近接モードの方が低い(代償あり)ことを"強い"ではなく"押し返す"側の言葉で書く。
  'handgun-t3-gunblade': '離れていれば銃、間合いに入られると近接の一撃に切り替わる。近接は相手を強く弾き飛ばす',
  // コイルショットガン(§16-2/バッチC-2): coilShotgun.ts。9発のペレットが発射直後に外側へ広がり、
  // その後まとまりながら狙った方向へ戻っていく(軌道の位相=coilTrajectoryOffsetRad)。
  'shotgun-t2-coil': '弾が一度大きく開き、そこから狙った先へ絞り込むように集まっていく',
  // 誘導散弾ショットガン(§16-2/バッチC-2): homingShotgun.ts+gameStore.tsのhoming-missileと同じ旋回。
  // 対象が複数なら分散、1体だけなら全弾がその1体へ集中する(assignHomingShotgunTargets)。
  'shotgun-t3-homing': '放った弾が敵を追いかけて曲がる。複数いれば分かれて追い、1体だけなら全弾が集中する',
  // グレネードガン。t1/t2 は **転がって一定距離で爆発**(GLAUNCHER_ROLL_DETONATE_PX。
  // t1=ショットガン距離 / t2=ハンドガン距離)、t3 は転がらず着弾で爆発。
  'glauncher-t1': '転がって爆発する擲弾。近くの群れをまとめて吹き飛ばす',
  'glauncher-t2': '転がって爆発する擲弾。より遠くまで転がり、威力も高い',
  'glauncher-t3': '転がらず、当たった所で爆発する。遠くの群れを崩す',
  // ロケットランチャー(§16-2/バッチD): 撃つと一瞬溜めてから直進弾(追尾なし)が飛ぶ。敵か壁に
  // 当たった時だけ爆発し、何にも当たらなければそのまま不発で消える(rocketLauncher.ts)。
  'glauncher-t1-rocket': '一瞬溜めてから直進する一発。敵か壁に当たった時だけ爆発する。何も無ければそのまま消える',
  // 錬金砲(§16-2/バッチD): 命中で弱い範囲爆発+金の石を付着(alchemyStone.ts)。同じ相手に当て続ける
  // ほど石が育ち(最大3段)、指を離した瞬間に石を付けた相手を全員まとめて起爆する。
  'glauncher-t2-alchemy': '命中させた相手に金の石を付ける。当て続けるほど石は育ち、指を離すと石ごと一斉に爆発する',
  // シグナルランチャー(§16-2/§16-3b/バッチD): 手動専用(自動射撃なし)。指を離した瞬間の狙い先を
  // 記録し、少し遅れてそこへ空爆が落ちる(signalLauncher.ts。追尾しない=置き撃ち)。
  'glauncher-t3-signal': '自動では撃たない。狙いを定めて指を離すと、少し遅れてその地点へ空爆が落ちる',
};

/** 装備欄に出す1行説明(未登録は空文字)。 */
export const weaponDescription = (key: string | undefined | null): string =>
  (key ? WEAPON_DESC[key] : undefined) ?? '';

export const weaponDisplayName = (key: string | undefined | null): string =>
  (key ? CATALOG[key]?.name : undefined) ?? '—';

// The active gun: the one matching activeWeaponId, falling back to the first
// gun owned (or undefined if the player somehow has none).
export const getActiveGun = (player: Player): Weapon | undefined => {
  const guns = getGuns(player);
  return guns.find(w => w.id === player.activeWeaponId) ?? guns[0];
};

// §6.24-W(社長裁定v0.25.2533「武器庫は武器にして。全部tier3だった場合は返金されて終わり」):
// 武器庫で「Tier3へ昇格できる」銃カテゴリの列挙。銃はカテゴリごと1挺・高Tier優先(grantWeapon)
// なので、Tier3未満の所持カテゴリと未所持カテゴリが昇格対象。空配列=全カテゴリ最高位=返金ケース。
// v0.25.3297: glauncherも武器庫のTier3化対象に含める(通常入手は武器箱/ドロップ=社長訂正)。
export const ARMORY_GUN_CATEGORIES = ['handgun', 'shotgun', 'rifle', 'glauncher'] as const;
export type ArmoryGunCategory = typeof ARMORY_GUN_CATEGORIES[number];
export const armoryUpgradableGunCategories = (
  weapons: Pick<Weapon, 'isMelee' | 'category' | 'tier'>[],
): ArmoryGunCategory[] =>
  ARMORY_GUN_CATEGORIES.filter(cat => {
    const own = weapons.find(w => !w.isMelee && w.category === cat);
    return !own || (own.tier ?? 1) < 3;
  });

// v0.25.3297(社長訂正): グレネードガンの通常入手は**武器箱/敵ドロップ**(エリアTier率でt1〜t3)。
// 武器庫は従来の§6.24-W(Tier3未満カテゴリのTier3化・全て最高位なら返金)のまま、対象カテゴリに
// glauncherを含めた4カテゴリ。付与キーはカテゴリのTier3。
export const armoryGrantKeys = (
  weapons: Pick<Weapon, 'isMelee' | 'category' | 'tier'>[],
): string[] => armoryUpgradableGunCategories(weapons).map(cat => `${cat}-t3`);

// グレネード系の着弾爆発を起こす銃キーか。UNIQUE_WEAPONS.md §16-3(前提工事): 旧実装は
// 'glauncher-t1'|t2|t3 の3キー直書きだったため、ランチャー3挺(バッチD)が「爆発しない直進弾」に
// なっていた。★category判定へ広げる(= glauncher カテゴリ全体)。タレット/朱雀/爆撃の流用弾は
// weaponKey='glauncher-t1'(useGameLoopのGRENADE_WEAPON_KEY)を名乗ってこの経路に乗るので、
// category判定に広げても挙動は不変(§16-3受け入れ条件1「回帰ゼロ」)。
// ★錬金砲(glauncher-t2-alchemy)もこの述語ではtrueになる(category='glauncher'のため)——
// ただし着弾時の「大爆発(GRENADE_BLAST_RADIUS)」分岐はuseGameLoop.ts側で錬金砲を先に
// 個別分岐させて回避している(破裂は別の小さい範囲=alchemyStone.ts)。この述語自体は
// 「弾は命中で消える(removeIt)」「跳弾/エコーショットの対象外」等の共通挙動だけを担う。
export const isGrenadeGunKey = (key: string | undefined | null): boolean =>
  !!key && catalogCategoryTier(key).category === 'glauncher';

// UNIQUE_WEAPONS.md §16-3b(手動専用銃の掟): 「自動で撃たない銃」。既存はPHILL銃1挺だけだったが、
// シグナルランチャーがglauncherカテゴリの通常装備枠に入るため述語として独立させる。
export const isManualOnlyGunKey = (key: string | undefined | null): boolean =>
  key === 'phill-revolver' || key === SIGNAL_WEAPON_KEY;

// 手動専用銃(§16-3b)のフォールバック先(守護霊/ボット用)。無ければ undefined
// (PHILLは横=既定同カテゴリ銃が存在しないスロット外武器なので、従来どおり素通し=「撃たない」のまま
// ——これはPHILLが研究所固定銃であることに由来する既存の雑な形で、今回のバッチはそこへ手を入れない)。
const MANUAL_ONLY_FALLBACK_KEY: Partial<Record<string, string>> = {
  [SIGNAL_WEAPON_KEY]: 'glauncher-t3',
};
/**
 * 手動専用銃を持つ守護霊/ボットが「撃たない」で済まないよう、既定の同カテゴリ銃の数値へ
 * 差し替えた武器を返す(§16-3b「守護霊が火力ゼロになる/計測が壊れる」の是正)。
 * フォールバック先が無い(PHILL)場合は入力をそのまま返す(=既存の挙動を変えない)。
 */
export const manualOnlyFallbackWeapon = (weapon: Weapon): Weapon => {
  const fallbackKey = weapon.key ? MANUAL_ONLY_FALLBACK_KEY[weapon.key] : undefined;
  if (!fallbackKey) return weapon;
  // ★id/lastFired/magazineは実体(呼び出し元がstoreへ書き戻す対象)のまま持ち越す。
  // ここを新規createWeapon()の値(lastFired:0・magazine:満タン)のままにすると、
  // fireWeaponの内部クールダウンゲートが毎tick「準備完了」と誤判定し、ボットが無限連射する
  // (createWeaponはid採番のたびDate.now()を焼くだけの使い捨てインスタンスのため)。
  return { ...createWeapon(fallbackKey), id: weapon.id, lastFired: weapon.lastFired, magazine: weapon.magazine };
};

// Player-state RESERVE pool value for an ammo type.
export const ammoPoolFor = (player: Player, type: AmmoType): number =>
  player[AMMO_FIELD[type]];

// UNIQUE_WEAPONS.md §16-2/§17-8 C-3(バッチB・デザートテック): 「今このトリガーで実際に読み書きする
// べき弾種」を1本に決める窓。デザートテック以外は従来どおり w.ammoType のまま(回帰ゼロ)。
// リロード3経路(startReload/tickReload・クイックマガジン・オーバークロック覚醒)・HUD残弾表示・
// autoSwitchIfDry(weaponReloadReserve経由)は全てこれを通す(受け入れ条件6の棚卸し対象)。
export const weaponAmmoTypeFor = (w: Pick<Weapon, 'key' | 'ammoType'>, p: Player): AmmoType | undefined => {
  if (w.key === DESERTTECH_WEAPON_KEY) {
    const pools: DesertTechAmmoPools = {
      rifle: p.ammoRifle, handgun: p.ammoHandgun, shotgun: p.ammoShotgun, glauncher: p.ammoGlauncher,
    };
    return resolveDesertTechAmmoType(pools);
  }
  return w.ammoType;
};

// UNIQUE_WEAPONS.md §17-3(監査A-3): 無限弾(infiniteAmmo)の武器は、リロード関連の純関数群へ
// 渡すreserveをInfinityとして扱う。★フィールドへは絶対に書き戻さない(呼び出し側の規則。
// このヘルパは「読み」だけを担う)。
export const weaponReloadReserve = (w: Pick<Weapon, 'key' | 'ammoType' | 'infiniteAmmo'>, p: Player): number => {
  if (w.infiniteAmmo) return Infinity;
  const ammoType = weaponAmmoTypeFor(w, p);
  return ammoType ? ammoPoolFor(p, ammoType) : 0;
};

// Magazine capacity including the player's global 装填数アップ bonus.
// UNIQUE_WEAPONS.md §17-4(監査A-4): magSize<=2の武器は装填数アップを受けない
// (クロスボウ=1発ごとに装填という芯が崩れるため。デリンジャー=2も同じ規則で一緒に塞がる=既知・意図的)。
export const effectiveMagSize = (w: Weapon, p: Player): number =>
  (w.magSize ?? 0) + (w.magSize != null && w.magSize > 2 ? p.magBonus : 0);

// Global reload-time multiplier — reloads take this much longer at baseline so
// being caught empty is a real commitment.
const RELOAD_TIME_MULT = 2;

// Reload duration including the global multiplier and the player's リロード時間
// 短縮 upgrade.
// 旧ウォームアップ(出撃60秒間リロード時間×0.80)は§23-1裁定で退役=削除済み。
export const effectiveReloadMs = (w: Weapon, p: Player): number =>
  // 装備(腕・取り回し系)のリロード短縮を乗算(中立=1)。
  // ★対人トラップ効果中は 1.5倍(社長指示2026-08-25・SAME_ARENA §3-g)。**下限250msはそのまま**
  // (掛けてから max を取る=短い銃でも必ず遅くなる、を保つ)。幻影の疑似Playerは
  // `trapDebuffUntil` を持たないので常に1倍=対人のみ。
  Math.max(250, (w.reloadMs ?? 0) * RELOAD_TIME_MULT * p.reloadMult * (p.equipBonus?.reloadMult ?? 1)
    * (isTrapDebuffed(p) ? TRAP_PVP_RELOAD_MULT : 1));

// 社長指示v0.25.3300 バーサーカー覚醒(Lv3): HP40%以下の間、銃の連射速度+10%(実効cooldown÷1.1)。
export const BERSERKER_AWAKEN_HP_FRAC = 0.4;
export const BERSERKER_AWAKEN_FIRE_RATE_MULT = 1.1;
export const berserkerAwakenFireRateMult = (p: Player): number =>
  skillLevel(p, 'berserker') >= 3 && p.maxHealth > 0 && p.health <= p.maxHealth * BERSERKER_AWAKEN_HP_FRAC
    ? BERSERKER_AWAKEN_FIRE_RATE_MULT
    : 1;

// 装備(腕)込みの実効発射間隔。プレイヤーと守護霊が同じ1本を使う。
export const effectiveFireCooldown = (w: Weapon, p: Player): number =>
  w.cooldown / ((p.equipBonus?.fireRateMult ?? 1) * berserkerAwakenFireRateMult(p));

// Is this specific gun currently mid-reload?
export const isReloading = (p: Player, weaponId: string): boolean =>
  p.reloadingWeaponId === weaponId && Date.now() < p.reloadEndsAt;

export interface MagazineRefillResult {
  weapon: Weapon;
  reserve: number;
  moved: number;
}

/**
 * リザーブからマガジンへ詰める純関数。通常リロードとクイックマガジンの唯一の装填式。
 * 守護霊は除外4(リザーブ弾非消費)を `reserve=Infinity` で表し、容量/装填量は同じ式を通す。
 */
export const refillWeaponMagazine = (w: Weapon, p: Player, reserve: number): MagazineRefillResult => {
  const need = Math.max(0, effectiveMagSize(w, p) - (w.magazine ?? 0));
  const moved = Math.min(need, Math.max(0, reserve));
  return {
    weapon: moved > 0 ? { ...w, magazine: (w.magazine ?? 0) + moved } : w,
    reserve: reserve - moved,
    moved,
  };
};

/** 満タン/リザーブ無し/同じ銃をリロード中ならnull。それ以外はプレイヤーと同じ終了時刻を返す。 */
export const beginWeaponReload = (
  w: Weapon,
  p: Player,
  reserve: number,
  now = Date.now(),
): Pick<Player, 'reloadEndsAt' | 'reloadingWeaponId'> | null => {
  if (!w.ammoType || effectiveMagSize(w, p) - (w.magazine ?? 0) <= 0 || reserve <= 0) return null;
  if (p.reloadingWeaponId === w.id && now < p.reloadEndsAt) return null;
  return { reloadingWeaponId: w.id, reloadEndsAt: now + effectiveReloadMs(w, p) };
};

/** 終了したリロードを解決する純関数。まだ途中/対象銃違いならnull。 */
export const finishWeaponReload = (
  w: Weapon,
  p: Player,
  reserve: number,
  now = Date.now(),
): (MagazineRefillResult & Pick<Player, 'reloadEndsAt' | 'reloadingWeaponId'>) | null => {
  if (p.reloadingWeaponId !== w.id || now < p.reloadEndsAt) return null;
  return { ...refillWeaponMagazine(w, p, reserve), reloadingWeaponId: '', reloadEndsAt: 0 };
};

/**
 * 1トリガー後の銃状態。ゴーストシューターの非消費抽選もプレイヤー/守護霊で共有する。
 * ダメージ計算は発射前の残弾を使うため、必ず弾生成後に呼ぶ。
 */
export const weaponAfterGunShot = (
  w: Weapon,
  p: Player,
  now = Date.now(),
  rand: () => number = Math.random,
): Weapon => {
  const ghostLv = skillLevel(p, 'ghost-shooter');
  const consume = ghostLv && rand() < [0, 0.10, 0.20, 0.30][ghostLv] ? 0 : 1;
  return { ...w, lastFired: now, magazine: Math.max(0, (w.magazine ?? 0) - consume) };
};

// Starting loadout: one gun + one melee weapon from the class profile.
export const getStartingWeapons = (characterClass: CharacterClass): Weapon[] => {
  const profile = PLAYER_PROFILES[characterClass] ?? PLAYER_PROFILES.warrior;
  // UNIQUE_WEAPONS.md §4-1(生成点): 出撃銃は装備設定のスロット選択に従う(§2④「拾った銃」と同じ
  // 「設定に従う」規則)。Tierの初期値そのものは変えない(社長指定「出撃時は今まで通りTier1から」)。
  return [createWeapon(resolveSlotKeyNow(profile.gunKey)), createWeapon(profile.meleeKey)];
};

// 専用スプライト(public/sprites/weapons/<key>.png)を持つ銃の武器key。素材受領のたびに追加。
// ワールドのドロップ/ピックアップ表示と HUD の武器アイコンで使用。未登録keyは絵文字フォールバック。
export const WEAPON_ICON_KEYS: ReadonlySet<string> = new Set<string>([
  'handgun-t1', 'handgun-t2', 'handgun-t3',
  'rifle-t1', 'rifle-t2', 'rifle-t3',
  'shotgun-t1', 'shotgun-t2', 'shotgun-t3',
  'phill-revolver',
  // 近接(ナイフ系)アイコン。名前に近い見た目を割当(社長指示)。攻撃モーション用ではなく
  // 銃と同じピックアップ/HUDアイコン。
  'knife-t1', 'hatchet-t2', 'machete-t3', 'tactical-knife-t4', 'anti-mutant-knife-t5',
  'glauncher-t1', 'glauncher-t2', 'glauncher-t3', // 武器庫限定グレネード系銃器(v0.25.3290)
  // UNIQUE_WEAPONS.md 第1弾のユニーク3種(社長支給素材2026-09-06)。
  'handgun-t1-derringer', 'handgun-t2-handcannon', 'handgun-t3-piledriver',
  // ショットガンのユニーク3種(素材のみ先行受領2026-09-06)。
  'shotgun-t1-focus', 'shotgun-t2-suppress', 'shotgun-t3-flamer',
  // ライフルのユニーク3種(社長支給素材2026-09-07)。
  'rifle-t1-deserttech', 'rifle-t2-heavysniper', 'rifle-t3-railgun',
  // ランチャーのユニーク3種(社長支給素材2026-09-07。ランチャーはこれで絵が揃った=第2弾なし)。
  'glauncher-t1-rocket', 'glauncher-t2-alchemy', 'glauncher-t3-signal',
  // ハンドガンのユニーク第2弾3種(社長支給素材2026-09-07。ハンドガンはこれで6挺すべて揃った)。
  'handgun-t1-crossbow', 'handgun-t2-dualrange', 'handgun-t3-gunblade',
]);
export const hasWeaponIcon = (key: string | undefined | null): boolean => !!key && WEAPON_ICON_KEYS.has(key);
export const weaponIconName = (key: string): string => `weapons/${key}`;

// Effective firing range per gun family (px). A gun only fires when an enemy
// is within this reach, so the player doesn't burn rounds into empty space.
// RE-flavored: shotgun is close-quarters, rifle reaches far, handgun is mid.
// ★社長調整2026-08-24: ショットガン140 / ハンドガン170 / ライフル250 / グレネード250。
// 旧: 120 / 176 / 312 / 312。**射程差を詰める方向**(ライフルの312は他の2倍以上あった)。
// グレネードは t1/t2 が下の GLAUNCHER_ROLL_DETONATE_PX でショットガン・ハンドガンの値を引くので、
// **この表を直すだけで t1=140 / t2=170 / t3=250 に揃う**(数字を2箇所に書かない)。
export const RANGE_BY_CATEGORY: Record<AmmoType, number> = {
  handgun: 170,
  shotgun: 140,
  rifle: 250,
  phill: 260, // 手動照準の精密射撃。自動射程判定には使わない(自動射撃しない)。
  glauncher: 250 // グレネードガン t3 の自動射程(社長調整2026-08-24。旧312)
};

// 社長指示v0.25.3438「t1-t2のグレネードは手榴弾と同様にころがって爆発に変更。t1はショットガン距離で
// 爆発する距離、t2はハンドガンの距離。t3は転がらずに、いまの仕様のまま」:
// 爆発する道のり(px)=そのまま実効射程なので、fireWeaponの射程ゲートもこの値で引く
// (312のままだと爆発点より遠い敵に撃ち始めて一生届かない)。t3はこの表に無い=従来どおり。
export const GLAUNCHER_ROLL_DETONATE_PX: Record<string, number> = {
  'glauncher-t1': RANGE_BY_CATEGORY.shotgun,  // 140(社長調整2026-08-24)
  'glauncher-t2': RANGE_BY_CATEGORY.handgun,  // 170(同上)
};

/**
 * ★射程のズーム補正(社長指示v0.25.3170「ズームが引になると明らかに射程距離が短く感じてしまうので、
 * 体感あまり変わらない様に調整したい」)。
 *
 * `RANGE_BY_CATEGORY` は**等倍画面で決めた値**なので、ボス交戦でカメラが引くと同じワールド距離が
 * 画面上では zoom 倍に縮む(最大引き `ZOOM_MIN_ABS=0.40` なら**画面上の射程は4割**)。撃つ/撃たないは
 * 目で測るので、これが「明らかに射程が短い」の正体。⇒ **画面上の射程が変わらないよう**ワールド距離へ
 * 戻す。式は既に `bossEngagementDistancePx`(交戦域)と湧き範囲が使っている
 * `zoomCompensatedWorldDistance` と**同じ1本**(寄り方向=zoom>1では伸ばさない)。
 *
 * 射程だけを伸ばすので、引いている間は相対的に銃が強くなる(ハンドガン176→最大440)。
 * 数字が過剰なら `zoomCompensatedWorldDistance` ではなく上限付きに変えるのが調整点。
 */
export const zoomedGunRange = (basePx: number): number =>
  zoomCompensatedWorldDistance(basePx, useGameStore.getState().viewZoom);

/**
 * ★UNIQUE_WEAPONS.md §13-1(監査C-7)/§16-5(受け入れ条件3): `rangeOverride` を持つ武器
 * (パイルドライバー/制圧型SG/ボルトアクション/デュアルレンジ)は**ズーム補正を通さない**
 * ——パイルドライバーは近接範囲(`MELEE_RADIUS`)から導出した射程なので近接同様ズームで伸びない
 * 扱いにする(伸びると「揃えたはずの近接範囲」と食い違う)。他の3挺も同じ関数を通る以上、
 * 一律で不補正になる(社長差し戻しが無い限り仕様どおり)。`rangeOverride` が無い武器は
 * 従来どおり `zoomedGunRange` を通す。射程を読む全箇所(自動射撃ゲート/ボット/守護霊/幻影)はこの
 * 1本を通すこと(直接 `RANGE_BY_CATEGORY` を読まない)。
 */
export const gunEffectiveRangePx = (weapon: Pick<Weapon, 'category' | 'rangeOverride'>): number =>
  weapon.rangeOverride !== undefined
    ? weapon.rangeOverride
    : zoomedGunRange(RANGE_BY_CATEGORY[weapon.category ?? 'handgun']);

// Choose the gun's target: the nearest NON-stunned enemy, only falling back to
// a stunned one when every enemy on the field is stunned. Returns null if the
// field is empty.
// UNIQUE_WEAPONS.md §19-3(監査A2・A9): 本体は enemyUtils.pickNearestTarget へ切り出した
// (プレイヤー以外のオーナー=金環/守護霊発動サブが座標だけで呼べる形にするため)。
// ここは「プレイヤー中心・現在のgameTime・射程無制限」を渡すだけの薄いラッパで、1bit同値。
const pickTarget = (player: Player, enemies: Enemy[]): Enemy | null =>
  pickNearestTarget(player.x + player.width / 2, player.y + player.height / 2, enemies, useGameStore.getState().gameTime);

// Distance from the player center to the gun's chosen target, or Infinity when
// the field is empty (used by the range gate).
const nearestEnemyDistance = (player: Player, enemies: Enemy[]): number => {
  const target = pickTarget(player, enemies);
  if (!target) return Infinity;
  // 射程ゲートも帯(AABB)の最近点距離(裏ボス)。中心基準だと巨体の縁で射程外扱いになる。
  return Math.sqrt(aimDist2(player.x + player.width / 2, player.y + player.height / 2, target));
};

// Aim helper: point at the chosen target, falling back to the last movement
// direction (then straight up) when the field is empty.
const aimDirection = (player: Player, enemies: Enemy[]): { x: number; y: number } => {
  const closest = pickTarget(player, enemies);
  if (closest) {
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;
    const dx = closest.x + closest.width / 2 - pcx;
    const dy = closest.y + closest.height / 2 - pcy;
    const dist = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
    return { x: dx / dist, y: dy / dist };
  }
  if (player.lastDirection) return { ...player.lastDirection };
  return { x: 0, y: -1 };
};

const rotate = (v: { x: number; y: number }, angle: number) => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
};

// GHOST-GUN-PARITY(共通ヘルパ): 弾の拡散角ルール。fireWeaponの生成ループから計算式を変えずに
// 抽出しただけ(ショットガンは口径(SHOTGUN_SPREAD_CONE_RAD_BY_TIER)/(count-1)、それ以外はcount>1
// なら0.12刻み)。プレイヤーの発射(fireWeapon)と守護霊の借用銃(buildGhostGunShots)が同じ規則を
// 共有するための切り出し。count<=1やspreadStep<=0ならbaseDirをそのまま(コピー)で返す=元の
// `let pd = {...baseDir}; if (...) pd = rotate(...)` と同じ分岐。
// UNIQUE_WEAPONS.md §16-3前提工事(監査C-4): 散り角(rad)を「武器(+状態)→rad」で受ける形にする。
// `spreadRadOverride` を持つ武器はそれを使う(状態で散り角が動く武器=バッチB以降は、発射直前に
// この値を書き換えてから渡すことで対応する=呼び出し側の責務)。無指定は従来どおりTier別既定
// (SHOTGUN_SPREAD_CONE_RAD_BY_TIER)。★既定3挺(shotgun-t1/t2/t3)はspreadRadOverride無し=不変。
export const resolveShotgunSpreadRad = (weapon: Pick<Weapon, 'tier' | 'spreadRadOverride'>): number =>
  weapon.spreadRadOverride
    ?? SHOTGUN_SPREAD_CONE_RAD_BY_TIER[weapon.tier ?? 1]
    ?? SHOTGUN_SPREAD_CONE_RAD_BY_TIER[1];

// UNIQUE_WEAPONS.md §16-2(バッチC-2・コイルSG): computeShotDirectionsが内部で計算している
// 「回転前の素の拡散角(rad・中心=0)」だけを取り出したもの。既存のcomputeShotDirections
// (既定武器も通る共有関数)には手を入れず、同じ式をここへも書く(意図的な二重化——
// 既存関数の出力形は方向ベクトルであって角度ではないため、素の角度は改めて求めるしかない)。
export const computeShotAngleOffsets = (
  weapon: Pick<Weapon, 'count' | 'category' | 'tier' | 'spreadRadOverride'>,
): number[] => {
  const count = weapon.count ?? 1;
  const shotgunSpread = resolveShotgunSpreadRad(weapon);
  const spreadStep = weapon.category === 'shotgun'
    ? (count > 1 ? shotgunSpread / (count - 1) : 0)
    : count > 1 ? 0.12 : 0;
  const angles: number[] = [];
  for (let i = 0; i < count; i++) {
    angles.push(count > 1 && spreadStep > 0 ? -spreadStep * (count - 1) / 2 + i * spreadStep : 0);
  }
  return angles;
};

export const computeShotDirections = (
  weapon: Pick<Weapon, 'count' | 'category' | 'tier' | 'spreadRadOverride'>,
  baseDir: { x: number; y: number },
): { x: number; y: number }[] => {
  const count = weapon.count ?? 1;
  const shotgunSpread = resolveShotgunSpreadRad(weapon);
  const spreadStep = weapon.category === 'shotgun'
    ? (count > 1 ? shotgunSpread / (count - 1) : 0)
    : count > 1 ? 0.12 : 0;
  const dirs: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    let pd = { ...baseDir };
    if (count > 1 && spreadStep > 0) {
      const angle = -spreadStep * (count - 1) / 2 + i * spreadStep;
      pd = rotate(baseDir, angle);
    }
    dirs.push(pd);
  }
  return dirs;
};

// GHOST-GUN-PARITY(共通ヘルパ): 弾の飛翔特性(サイズ/速度=PROJECTILE_SPEED_MULT込み)。
// fireWeaponから計算式を変えずに抽出しただけ。
export const projectileFlightStats = (
  weapon: Pick<Weapon, 'projectileSize' | 'projectileSpeed'>,
): { size: number; speed: number } => ({
  size: weapon.projectileSize || 8,
  speed: (weapon.projectileSpeed || 520) * PROJECTILE_SPEED_MULT,
});

// GHOST-BUILD-1(共通ヘルパ・BOT_AND_GHOST.md §2.11補足「写すな、共通化しろ」): 発射時の素ダメージ。
// fireWeaponの `shotDamage` の式を値を変えずに抽出しただけ。プレイヤーの発射と守護霊の射撃
// (buildGhostGunShots=計測時ビルドの疑似Playerを渡す)が**同じ1本の式**を通る。
//  = 武器damage × スカベンジャー(キャラ固有) × アタックシューター × 消費カード「アタックドーピング」
//    (§23・+20%・60秒=アタックシューターと同じ合流点) × 装備(火力)ダメージ倍率 × ラストマガジン
export const gunShotBaseDamage = (
  weapon: Pick<Weapon, 'damage' | 'magazine'>,
  player: Player,
  gameTime: number,
): number =>
  weapon.damage * scavengerGunMult(player, gameTime) * skillAttackShooterGunMult(player)
  * consumableAttackMult(player, gameTime)
  * (player.equipBonus?.damageMult ?? 1) * skillLastMagazineMult(player, weapon.magazine ?? 0);

// GHOST-BUILD-1(共通ヘルパ): 発射時のクリ率(0..1)。fireWeaponの `critChance` の式を値を変えずに抽出。
//  = 武器基礎 + 本体(レベルアップ)+ 装備(クリ系)+ クイックマガジン + 弁慶(旧ウォームアップ項は
//    §23-1裁定で退役=削除済み)
// 命中時は projectileHitCritChance(ボスは×0.5+下限5%)でロールされる=呼び出し側は数値を運ぶだけ。
export const gunShotCritChance = (
  weapon: Pick<Weapon, 'critChance'>,
  player: Player,
  gameTime: number,
): number => Math.min(1,
  (weapon.critChance ?? 0) + (player.critChance || 0) + (player.equipBonus?.critBonus ?? 0)
  + (player.quickMagCritUntil > gameTime ? 0.10 : 0)
  + skillBenkeiCritBonus(player, gameTime));

// Fire a single weapon this tick (cooldown- and ammo-aware). Melee weapons
// never fire here — they're handled by the counter. Guns auto-target the
// nearest enemy, roll crits per pellet, and burn one round of their ammo
// pool per shot. Returns the projectiles spawned (empty if blocked).
export interface FireWeaponOptions {
  // UNIQUE_WEAPONS.md §16-2(バッチC-2・ガンブレード): 至近(≤90px)モードを許可するか。既定true
  // (プレイヤー本体)。**ボット(playtestDriver)が false を渡している**=至近域では空撃ちにして
  // DPS計測が近接ボーナスを拾わないようにする。守護霊(useGameLoop)と幻影(phantomTick)は
  // この口ではなく**自前の距離判定**で至近域をスキップしている(3経路とも「撃たないだけ」で揃う)。
  allowMelee?: boolean;
}

export const fireWeapon = (weapon: Weapon, player: Player, enemies: Enemy[], opts?: FireWeaponOptions): Projectile[] => {
  const now = Date.now();
  if (weapon.isMelee || !weapon.ammoType) return [];
  // UNIQUE_WEAPONS.md §16-2/§17-8 C-1: デュアルレンジピストルは対象までの距離で近/遠の数値セット
  // (dualRangeGun.ts)が入れ替わる。距離はこの関数の中でも「射程ゲートを通った後」にしか分からない
  // ため、cooldownゲートに使う数値は前回この場所で確定したモード(weapon.dualRangeModeに持ち越し。
  // 未設定は'far'=CATALOGの既定と一致)を使う(1発ぶん遅れるが機能上は問題ない=監査で確認済み)。
  const isDualRangeGun = weapon.key === DUALRANGE_WEAPON_KEY;
  // UNIQUE_WEAPONS.md §16-2(バッチB・大型狙撃銃): 静止蓄積(player.heavySniperStillMs)から
  // 現在の連射間隔/射程を導出する(heavySniperCharge.ts)。帯は蓄積0の素の値で測る(§16-1)ので、
  // CATALOGの静的cooldown(=蓄積0の基準値)から毎回導出する(前フレームの結果を種にしない=誤差が
  // 積み重なるのを防ぐ)。
  const isHeavySniperGun = weapon.key === HEAVY_SNIPER_WEAPON_KEY;
  const heavySniperFrac = isHeavySniperGun ? heavySniperChargeFrac(player.heavySniperStillMs) : 0;
  // UNIQUE_WEAPONS.md §16-2/§17-5(バッチC-2・ガンブレード): dualRangeと同じ作法(モードは
  // weapon.gunbladeMeleeModeへ持ち越す。未設定='ranged'扱い)。
  const isGunbladeGun = weapon.key === GUNBLADE_WEAPON_KEY;
  const gateWeapon: Weapon = isDualRangeGun
    ? { ...weapon, ...DUAL_RANGE_STATS[weapon.dualRangeMode ?? 'far'] }
    : isHeavySniperGun
      ? { ...weapon, cooldown: heavySniperCooldownMs(heavySniperFrac) }
      : isGunbladeGun
        ? { ...weapon, ...GUNBLADE_MODE_STATS[weapon.gunbladeMeleeMode ? 'melee' : 'ranged'] }
        : weapon;
  // 装備(腕)の連射倍率で実効cooldownを短縮(中立=1)。fireRateMult>1 ほど間隔が縮む。
  const effCooldown = effectiveFireCooldown(gateWeapon, player);
  if (now - weapon.lastFired < effCooldown) return [];

  // Range gate: hold fire (and ammo) unless an enemy is within reach. Don't
  // advance lastFired here so the gun fires the instant a target enters range.
  // (マークスマンは射程UP→移動速度UPに変更したため、射程倍率は廃止)
  // グレネードガンt1/t2(転がり爆発)は爆発する道のり=実効射程(v0.25.3438)。
  const rollDetonatePx = GLAUNCHER_ROLL_DETONATE_PX[weapon.key ?? ''];
  // ★rangeOverride(パイルドライバー/制圧型SG/ボルトアクション/デュアルレンジ/デザートテック)は
  // rollDetonatePxと排他(グレネード限定の仕組み)なので優先順位は「転がり爆発 > rangeOverride >
  // カテゴリ既定」で問題ない。大型狙撃銃はCATALOGに静的rangeOverrideを持たないが、蓄積に応じて
  // ここで動的に組み立てる(他のrangeOverride武器と同じくズーム非補正=gunEffectiveRangePxの規則。
  // §17-11で「per-frame書き換えを避ける」持たせ方は将来の改善として積んである=このバッチでは未対応)。
  const rangeGateWeapon: Weapon = isHeavySniperGun
    ? { ...weapon, rangeOverride: heavySniperRangePx(heavySniperFrac) }
    : weapon;
  const gunRange = rollDetonatePx !== undefined ? zoomedGunRange(rollDetonatePx) : gunEffectiveRangePx(rangeGateWeapon);
  const distToTarget = nearestEnemyDistance(player, enemies);
  if (distToTarget > gunRange) {
    return [];
  }
  // §17-8 C-1: ヒステリシス判定は射程ゲートを通った「撃つ瞬間」に置く。この弾自体は今回
  // 確定したモードの数値で撃ち、次回以降のcooldownゲート(上のgateWeapon)にも持ち越す。
  const nextDualRangeMode = isDualRangeGun
    ? resolveDualRangeMode(weapon.dualRangeMode ?? 'far', distToTarget)
    : undefined;
  // UNIQUE_WEAPONS.md §16-2/§17-5(バッチC-2・ガンブレード): 同じ置き場所で至近/通常を確定する。
  const nextGunbladeMode = isGunbladeGun ? resolveGunbladeMode(distToTarget) : undefined;
  // UNIQUE_WEAPONS.md §16-2(バッチC-2・ガンブレード): 守護霊/幻影/ボットは近接モードに入ったら
  // 「撃たないだけ」(実装者の裁量・最終報告に記載)。allowMelee=falseの呼び出し元はここで
  // 空撃ちにする(nonProjectileの「発砲の入口でも閉じる」と同じ形)。
  if (isGunbladeGun && opts?.allowMelee === false && distToTarget <= GUNBLADE_MELEE_RANGE_PX) {
    return [];
  }

  // Can't fire while reloading, or with an empty magazine. Reloads are kicked
  // off by autoSwitchIfDry/startReload, not here — firing just stops.
  // UNIQUE_WEAPONS.md §16-5b(2026-09-07・C-2検収A-2で確定): ガンブレードの近接モードは弾を
  // 作らないので弾薬もリロードも消費しない=そもそもこのゲートを通さない(判定は「今この瞬間の
  // 距離」で確定したnextGunbladeMode。前回のweapon.gunbladeMeleeModeで判定すると、リロード中に
  // 初めて至近へ入った瞬間が「モードがまだ'ranged'のまま→弾薬ゲートで弾かれる→モードが一生
  // 'melee'へ更新されない」という鶏と卵になるため、必ず今回の距離で決める)。
  if (!(isGunbladeGun && nextGunbladeMode === 'melee')) {
    if (isReloading(player, weapon.id)) return [];
    if ((weapon.magazine ?? 0) <= 0) return [];
  }
  // UNIQUE_WEAPONS.md §16-2(バッチB・切替式SG): 現在のcycleMode(反転はリロード完了側=
  // gameStore.tsの3経路で行う。距離/命中とは無関係)の数値をこの1発に差し込む。
  const isCycleGun = weapon.key === CYCLE_WEAPON_KEY;
  // UNIQUE_WEAPONS.md §16-2(バッチB・収束型SG): 直近の命中から2.5秒以上経っていれば初期散り角へ
  // 戻す(命中による狭まりはuseGameLoop.ts側=着弾時にfocusSpreadRad/focusSpreadLastHitAtを更新)。
  const isFocusGun = weapon.key === FOCUS_WEAPON_KEY;
  const focusSpreadRad = isFocusGun
    ? resolveFocusSpreadRad(weapon.focusSpreadRad, weapon.focusSpreadLastHitAt, now)
    : undefined;
  const shotWeapon: Weapon = nextDualRangeMode
    ? { ...weapon, ...DUAL_RANGE_STATS[nextDualRangeMode] }
    : isCycleGun
      ? { ...weapon, ...CYCLE_MODE_STATS[weapon.cycleMode ?? 'shot'] }
      : isFocusGun
        ? { ...weapon, spreadRadOverride: focusSpreadRad }
        : nextGunbladeMode
          ? { ...weapon, ...GUNBLADE_MODE_STATS[nextGunbladeMode] }
          : weapon;

  // UNIQUE_WEAPONS.md §16-5b(2026-09-07・C-2検収A-2で確定): 「近接は弾を作らない」。ここで
  // 即時に近接判定(GUNBLADE_MELEE_RANGE_PX=MELEE_RADIUS系の固定閾値)を解決し、自前の
  // 400ms間隔(=上のeffCooldownゲート・GUNBLADE_MODE_STATS.melee.cooldown)だけで発火する。
  // 弾を1つも作らないので、弾薬・リロード・弾速依存の飛翔時間・幻影の弾カウンター(弾専用の
  // パリィ経路)のどれとも無縁になる(旧実装=通常弾を流用していたことが検収A-2で指摘された不具合の根)。
  if (isGunbladeGun && nextGunbladeMode === 'melee') {
    const meleeTarget = pickTarget(player, enemies);
    if (meleeTarget) {
      const mtcx = meleeTarget.x + meleeTarget.width / 2;
      const mtcy = meleeTarget.y + meleeTarget.height / 2;
      const pcx = player.x + player.width / 2;
      const pcy = player.y + player.height / 2;
      const mdx = mtcx - pcx, mdy = mtcy - pcy;
      const mdist = Math.max(0.001, Math.hypot(mdx, mdy));
      const meleeDirX = mdx / mdist, meleeDirY = mdy / mdist;
      const meleeGt = useGameStore.getState().gameTime;
      // 素ダメージ・クリ率は通常の銃撃と同じ式(shotWeapon.damage=GUNBLADE_MODE_STATS.meleeの12.8=
      // §17-5の×1.6・critChance=CATALOGの0.05固定・§17-2はモードで変えない)。命中時のクリ抽選も
      // 銃弾の着弾ロールと同じ式(projectileHitCritChance=ボスは半減+下限5%)——弾を作らないため
      // 着弾時ではなくここで即時に行う。
      const critChanceBase = gunShotCritChance(weapon, player, meleeGt);
      const critChanceEff = projectileHitCritChance(critChanceBase, meleeTarget);
      const isCrit = Math.random() < critChanceEff;
      const critMult = isCrit ? skillCritMult(player, CRIT_DAMAGE_MULT) : 1;
      const dmg = gunShotBaseDamage(shotWeapon, player, meleeGt) * critMult * skillOutgoingDamageMult(player);
      const dmgChannel = classifyProjectileDamageChannel('handgun', weapon.key);
      // postureImpact='heavy'(比率0.10・パイルドライバーと同じ「新しい打撃種別は作らない」枠組み・
      // §17-5)。gpSource='melee'(弾ではなく近接として幻影ゲートへ渡す=幻影の弾専用パリィの
      // 対象にならない。近接窓パリィ/近接i-frame免除は通常の近接攻撃と同じ扱いになる)。
      const killed = useGameStore.getState().damageEnemy(
        meleeTarget.id, dmg, false, isCrit, false, dmgChannel, 'player', 'heavy', 1, 'melee',
      );
      useGameStore.getState().spawnDamageNumber(mtcx, meleeTarget.y, dmg, isCrit);
      // 命中点に斬撃の絵(spawnSlash=既存の汎用近接斬撃エフェクト)+血飛沫+SEを出す「口」
      // (専用アートは後日支給=UNIQUE_WEAPONS.md §16-5b「口が無いと素材が来ても出せない」)。
      useGameStore.getState().spawnSlash(mtcx, mtcy, 'rgba(226,232,240,0.95)');
      useGameStore.getState().spawnMeleeBlood(mtcx, mtcy, meleeTarget.width);
      playSfx('slash-damage');
      useGameStore.getState().knockbackEnemy(meleeTarget.id, meleeDirX, meleeDirY, GUNBLADE_MELEE_KNOCKBACK_MULT);
      if (killed) {
        playEnemyDeath();
        useGameStore.getState().dropEnemyXp(meleeTarget, mtcx, mtcy, `pickup-xp-gunblade-${now}`);
      }
    }
    // cooldownだけ進める(次回のeffCooldownゲートに使う)。弾薬・リロード(magazine/reserve)には
    // 一切触れない=弾を作らない以上、消費するものが無い(§16-5b「弾を作らないので自然にそうなる」)。
    useGameStore.setState(state => ({
      player: {
        ...state.player,
        weapons: state.player.weapons.map(w => (w.id === weapon.id ? { ...w, lastFired: now, gunbladeMeleeMode: true } : w)),
      },
    }));
    return [];
  }

  const baseDir = aimDirection(player, enemies);
  const count = shotWeapon.count ?? 1;
  // GHOST-GUN-PARITY: 拡散角/サイズ・速度の計算式は共通ヘルパへ抽出しただけ(値は不変)。
  const shotDirections = computeShotDirections(shotWeapon, baseDir);
  const { size, speed } = projectileFlightStats(shotWeapon);
  // UNIQUE_WEAPONS.md §16-2(バッチC-2・コイルSG・2026-09-07 C-2検収A-1で確定): 「中心線からの
  // 横ズレ」方式(coilShotgun.ts)の起点になる、ペレットiごとの振幅(px・±COIL_AMPLITUDE_PXへ等間隔)。
  // 基礎の拡散角は持たせない(CATALOGのspreadRadOverride:0)ので、computeShotDirectionsは
  // 全ペレットともbaseDirそのまま返す(=coilAimDirX/Yに使う値として好都合)。
  const isCoilGun = weapon.key === COIL_SHOTGUN_WEAPON_KEY;
  const coilAmplitudes = isCoilGun ? Array.from({ length: count }, (_, i) => coilPelletAmplitudePx(i, count)) : undefined;
  // UNIQUE_WEAPONS.md §16-2(バッチC-2・誘導散弾SG・2026-09-07 C-2検収A-3で確定): 対象の割り振りは
  // 1トリガー(count発)単位。射程内(=このトリガーが実際に撃てた射程ゲートと同じgunRange)の生存敵を
  // 「プレイヤーから見た方位角」の順に並べ、ペレットは「拡散角」の順(=computeShotAngleOffsetsが
  // 返す並びそのもの=既に昇順)のままround-robinで対応させる(homingShotgun.ts)。近い順の
  // round-robinだと真横の敵へ端のペレットが飛ばされ、旋回半径内で曲がり切れずに素通りしてしまう
  // (=検収A-3で指摘された不具合)。0体なら全ペレットundefined=直進のみ。
  const isHomingGun = weapon.key === HOMING_SHOTGUN_WEAPON_KEY;
  const homingPelletOffsets = isHomingGun ? computeShotAngleOffsets(shotWeapon) : undefined;
  const homingTargetIds = isHomingGun
    ? assignHomingShotgunTargetsByAzimuth(
      homingPelletOffsets!,
      enemies
        .filter(e => !isCorpse(e) && aimDist2(player.x + player.width / 2, player.y + player.height / 2, e) <= gunRange * gunRange)
        .map(e => ({
          id: e.id,
          azimuthRad: Math.atan2(
            e.y + e.height / 2 - (player.y + player.height / 2),
            e.x + e.width / 2 - (player.x + player.width / 2),
          ),
        })),
    )
    : undefined;

  // スキル: ファイアシューター = 20%の射撃が爆発弾化(×0.3 ダメージ・半径66)。
  // 連続爆発を防ぐため player.fireShooterCdUntil(gameTime ms)で 3秒の裏クールダウン。
  const gtFire = useGameStore.getState().gameTime;
  const fireShooterLv = skillLevel(player, 'fire-shooter');
  const fireShooterReady = fireShooterLv && gtFire >= player.fireShooterCdUntil;
  const fireShooterShot = fireShooterReady && Math.random() < [0, 0.2, 0.25, 0.3][fireShooterLv];
  if (fireShooterShot) {
    useGameStore.setState(state => ({ player: { ...state.player, fireShooterCdUntil: gtFire + 3000 } }));
  }
  const FIRE_SHOOTER_RADIUS = 66; // = HEAVY_GRENADE_RADIUS
  // 社長指示v0.25.3300 ファイアシューター覚醒(Lv3): 爆発弾が大爆発になる(半径×1.8=
  // ボムカウンター自分中心大爆発と同じ「大爆発」倍率)。
  const FIRE_SHOOTER_AWAKEN_RADIUS_MULT = 1.8;
  // 発射時の素ダメージ(GHOST-BUILD-1で共通ヘルパへ抽出=式・値は不変):
  //   キャラ固有 スカベンジャー(necromancer): 弾薬取得後3秒は銃ダメージ ×1.1。
  //   スキル アタックシューター: 銃ダメージ +10/20/30%(Lv)。
  //   装備(腕・火力系)のダメージ倍率。中立=1。
  //   スキル ラストマガジン: 弾倉最後の1発(この発射で空になるトリガー1回分=発射前の残弾1)×2.0/2.5/3.0。
  //   ショットガンは最終シェルの全ペレットに乗る(shotDamage共通)。命中時の他倍率とは乗算(§6.8 M31)。
  const shotDamage = gunShotBaseDamage(shotWeapon, player, gtFire);
  // スキル: ビッグバレット = 弾サイズ×1.3/1.5/1.7(見た目と当たり判定を同時拡大。速度・貫通数・
  // 跳弾回数・壁衝突は不変=§28-2)。プレイヤー自身の銃弾のみ(ghost-gun/support-sniperは対象外)。
  // 社長指示v0.25.3297「ビッグバレットが地味なのでアタックシューターと統合」: 弾サイズ拡大は
  // attack-shooterのLvで発動(big-bulletはRETIRED)。倍率表(×1.3/1.5/1.7)はそのまま流用。
  const shotSize = size * bigBulletSizeMult(skillLevel(player, 'attack-shooter'));

  const projectiles: Projectile[] = [];
  for (let i = 0; i < count; i++) {
    const pd = shotDirections[i];
    const gt = useGameStore.getState().gameTime;
    // 発射時のクリ率(GHOST-BUILD-1で共通ヘルパへ抽出=式・値は不変):
    //   武器基礎 + 本体(レベルアップ)+ 装備(アクセ・クリ系。player.critChanceとは別枠で加算)
    //   + クイックマガジン + 弁慶(ウォームアップは退役済み=v0.25.3248でこの式から削除)。
    const critChance = gunShotCritChance(weapon, player, gt);
    projectiles.push({
      id: `proj-${weapon.id}-${now}-${i}`,
      x: player.x + player.width / 2 - shotSize / 2,
      y: player.y + player.height / 2 - shotSize / 2,
      width: shotSize,
      height: shotSize,
      speed,
      // Base damage only — the crit multiplier is applied at hit time so it can
      // scale differently against bosses (×5) vs normal enemies (×1.5).
      // (スカベンジャーの+10%は素ダメージへ既に反映済み = shotDamage)
      damage: shotDamage,
      direction: pd,
      weaponType: weapon.category as WeaponType, // 'handgun' | 'shotgun' | 'rifle'
      weaponKey: weapon.key,
      duration: 1400,
      createdAt: now,
      passthrough: weapon.passthrough || false,
      hitEnemies: [],
      // スキル: シャープシューター = 貫通 +1/+2/+3(Lv)。passthrough武器=貫通自由なので据置。
      pierce: !weapon.passthrough && skillLevel(player, 'sharpshooter')
        ? (weapon.pierce ?? 0) + skillLevel(player, 'sharpshooter')
        : weapon.pierce,
      hostile: false,
      reflected: false,
      // CRIT-UNIFY §9.1: 生成時に抽選しない。critChanceを運び、命中時に対象別(ボスは半減+下限5%)で
      // ロールする(useGameLoop.tsのprojectileHitCritChance)。
      critChance,
      // UNIQUE_WEAPONS.md §13-1: 武器のknockbackMult/postureMultを弾へそのまま運ぶ(命中側=
      // useGameLoop.tsが読む)。未設定(既定undefined)の武器は従来どおり何も付かない=回帰ゼロ。
      // ★UNIQUE_WEAPONS.md §16-2(バッチC-2・ガンブレード)からshotWeapon経由(=モード別スタッツ)を
      // 読むよう変更。dualRange/cycle/focusの各モードスタッツはknockbackMult/postureMultを
      // 持たない(=weapon.knockbackMultと常に同値)ため、既存3挺の挙動は不変(回帰ゼロ)。
      knockbackMult: shotWeapon.knockbackMult,
      postureMult: shotWeapon.postureMult,
      // UNIQUE_WEAPONS.md §16-2(バッチC-2・コイルSG・2026-09-07 C-2検収A-1で確定): 「中心線からの
      // 横ズレ」方式の起点(ペレット固有の振幅+狙点方向+発射時のgameTime=A-1「時計はgameTime」)。
      ...(isCoilGun ? { coilAmplitudePx: coilAmplitudes![i], coilAimDirX: baseDir.x, coilAimDirY: baseDir.y, coilLaunchGameTime: gt } : {}),
      // UNIQUE_WEAPONS.md §16-2(バッチC-2・誘導散弾SG): 対象が割り当たったペレットだけ旋回を開く
      // (対象無し=直進のみ。homing-missileと同じ「対象が消えたら直進」規則をgameStore.tsが担う)。
      ...(isHomingGun && homingTargetIds?.[i] !== undefined
        ? { targetEnemyId: homingTargetIds[i], homingPellet: true as const }
        : {}),
      // スキル: ファイアシューターの爆発弾。直撃ダメージ ×0.3、命中で半径66の小爆発。
      ...(fireShooterShot
        ? {
            explodeOnHit: true,
            explodeRadius: FIRE_SHOOTER_RADIUS * (fireShooterLv >= 3 ? FIRE_SHOOTER_AWAKEN_RADIUS_MULT : 1),
            explodeDamageMult: 1,
            damage: shotDamage * 0.3,
          }
        : {}),
      // 社長指示v0.25.3300 ラストマガジン覚醒(Lv3): 弾倉最後の1セット(発射前の残弾1=倍率と同じ条件)に
      // 延焼が付く(ショットガンは全ペレット)。命中側(useGameLoop)がこのフラグで燃焼を適用する。
      ...(skillLevel(player, 'last-magazine') >= 3 && (weapon.magazine ?? 0) === 1
        ? { bonusIncendiary: true }
        : {}),
      // 社長指示v0.25.3438/3441: グレネードガンt1/t2=転がり弾(手榴弾と同じバウンド+減速で転がり、
      // 道のり到達 or 時間で爆発)。敵に触れたらその場で直撃爆発(v3441「直撃を復活」)。t3は従来のまま。
      ...(rollDetonatePx !== undefined ? { rollDetonatePx, traveledPx: 0 } : {}),
    });
  }

  // Drain the magazine and record the fire time. One trigger pull = one round
  // for EVERY family, including the shotgun (a shell fires the whole pellet
  // spread for a single round).
  // スキル: ゴーストシューター = 10%/20%/30%(Lv)で弾を消費しない。
  // 社長指示v0.25.3300 覚醒(Lv3): 「消費しない」ではなく「30%で消費した弾をリザーブから即補填」に変わる
  // (弾倉は減らないがリザーブは減る=総弾数が増えるわけではない。リザーブ0なら補填されず普通に消費)。
  const gsAwaken = skillLevel(player, 'ghost-shooter') >= 3;
  const gsRefillProc = gsAwaken && Math.random() < 0.30;
  useGameStore.setState(state => {
    // UNIQUE_WEAPONS.md §16-2/§17-8 C-3(デザートテック・棚卸し対象): ゴーストシューター補填も
    // weaponAmmoTypeFor(実際に消費している弾種)から引く(weapon.ammoType固定ではない)。
    const gsAmmoType = weaponAmmoTypeFor(weapon, state.player);
    const gsField = gsAmmoType ? AMMO_FIELD[gsAmmoType] : null;
    // UNIQUE_WEAPONS.md §17-3(監査A-3・棚卸し対象): 無限弾武器はここでもリザーブをInfinity扱い
    // する(ゲート判定のみ)。★実フィールドへの書き戻しは下で必ずスキップする。
    const gsReserve = weapon.infiniteAmmo ? Infinity : (gsField ? state.player[gsField] : 0);
    const doRefill = gsRefillProc && gsField !== null && gsReserve > 0;
    return {
      player: {
        ...state.player,
        weapons: state.player.weapons.map(w => {
          if (w.id !== weapon.id) return w;
          // 覚醒時はrand=1固定で内部の非消費抽選を潰す(=必ず消費)→ 補填でmagazineを戻す。
          const shot = gsAwaken ? weaponAfterGunShot(w, player, now, () => 1) : weaponAfterGunShot(w, player, now);
          const refilled = doRefill ? { ...shot, magazine: (shot.magazine ?? 0) + 1 } : shot;
          // UNIQUE_WEAPONS.md §16-2: デュアルレンジのモードはここで確定・持ち越す。
          const withDualRange = nextDualRangeMode !== undefined ? { ...refilled, dualRangeMode: nextDualRangeMode } : refilled;
          // UNIQUE_WEAPONS.md §16-2(収束型SG): この発射で使った散り角(2.5秒リセット済みかもしれない
          // 値)を持ち越す。命中による狭まりはuseGameLoop.ts側が別途書き込む。
          const withFocus = isFocusGun ? { ...withDualRange, focusSpreadRad } : withDualRange;
          // UNIQUE_WEAPONS.md §16-2/§17-5(バッチC-2・ガンブレード): モードはここで確定・持ち越す
          // (dualRangeと同じ作法)。
          return nextGunbladeMode !== undefined
            ? { ...withFocus, gunbladeMeleeMode: nextGunbladeMode === 'melee' }
            : withFocus;
        }),
        // ★無限弾武器はreserveを実フィールドへ書き戻さない(infiniteAmmoの規則・§17-3)。
        ...(doRefill && gsField && !weapon.infiniteAmmo ? ({ [gsField]: gsReserve - 1 } as Partial<Player>) : {}),
      },
    };
  });

  // UNIQUE_WEAPONS.md §16-2/§16-5(バッチD・ロケットランチャー): 「溜め(500ms)」の実装フック。
  // 発射直後の弾を速度0のままROCKET_CHARGE_MSだけその場に置く(=通常の敵衝突判定がそのまま
  // 「溜め中の弾頭接触」を拾う)。ROCKET_CHARGE_MSはCATALOGのcooldownと同値(=別時間として
  // 足していない・受け入れ条件8)。時計はgameTime(CLAUDE.md「動きの時計はgameTime」)。
  if (weapon.key === ROCKET_WEAPON_KEY) {
    const chargeUntil = useGameStore.getState().gameTime + ROCKET_CHARGE_MS;
    return projectiles.map(p => ({ ...p, rocketLaunchSpeed: p.speed, speed: 0, rocketChargeUntil: chargeUntil }));
  }

  return projectiles;
};

// 援護射撃(support-sniper・PACING_PUZZLE.md §6.5 M28): スナイパー射撃の1発を、NPC位置から
// 「既存のプレイヤー弾」として生成する。fireWeapon の生成時計算と同じ式
// (素ダメージ=スカベンジャー/アタックシューター/装備倍率、クリ率=基礎+パッシブ+装備+クイックマガジン+弁慶)を使い、
// weaponType/weaponKey も rifle/rifle-t2 に揃える=命中時のスキル倍率(クリ/スナイパー/コンボマスター)・
// 貫通(passthrough)が通常のプレイヤー弾と完全に同じ扱いになる。プレイヤーの銃の状態(弾薬/リロード/
// lastFired)には一切触れない(弾は消費しない)。副作用なし。
// 攻撃力の基準(社長裁定v0.25.1737): ダメージだけ**マグナム(rifle-t1=30)を基準**にし、倍率計算後に
// **1/2**(実効ベース15)。旧=スナイパー55そのままはテスト#2/#3の突出+実機「強すぎ」により弱体。
// 飛翔特性(速度/サイズ/貫通)・クリ率・命中時のスキル扱いは従来どおりスナイパー(rifle-t2)のまま。
export const buildSupportSniperShot = (
  player: Player,
  x: number, y: number,                       // 弾の中心の生成位置(NPCの発射位置)
  direction: { x: number; y: number },        // 射線(正規化済みを渡す)
  gameTime: number,
): Projectile => {
  const def = CATALOG['rifle-t2'];
  const size = def.projectileSize || 8;
  const speed = (def.projectileSpeed || 520) * PROJECTILE_SPEED_MULT;
  const shotDamage = CATALOG['rifle-t1'].damage * scavengerGunMult(player, gameTime) * skillAttackShooterGunMult(player) * consumableAttackMult(player, gameTime) * (player.equipBonus?.damageMult ?? 1) * 0.5;
  return {
    id: `proj-support-sniper-${Date.now()}`,
    x: x - size / 2,
    y: y - size / 2,
    width: size,
    height: size,
    speed,
    damage: shotDamage,
    direction,
    weaponType: def.category as WeaponType, // 'rifle'
    weaponKey: def.key,                     // 'rifle-t2'
    duration: 1400,
    createdAt: Date.now(),
    passthrough: def.passthrough || false,  // rifle-t2=貫通
    hitEnemies: [],
    pierce: def.pierce,
    hostile: false,
    reflected: false,
    // CRIT-UNIFY §9.4(裁定E「援護射撃もクリ無し」): 生成時クリ抽選を撤去。critChance=0固定
    // (基礎ダメージの補填はしない=DPS台帳裁定(b)は別件のまま保留)。
    critChance: 0,
  };
};

// ジャンクウェポン(junk-weapon・PACING_PUZZLE.md §6.7 M30): 近接スイングと同時にスイング方向へ撃つ
// 散弾5発。飛翔特性=ショットガンT1相当(CATALOG shotgun-t1 の速度/サイズ+T1スプレッドコーン)を参照し、
// 既存のプレイヤー弾(weaponType='shotgun')として生成=命中時スキルは通常どおり乗る。
// ダメージはLv固定(呼び出し元が computeJunkShot で決めて渡す)。弾薬はスクラップ(呼び出し元が消費)で、
// ショットガン弾薬・生成時クリ抽選は使わない(ダメージ固定が仕様のため crit=false)。副作用なし。
export const buildJunkWeaponPellets = (
  x: number, y: number,                 // 発射点(プレイヤー中心)
  direction: { x: number; y: number },  // スイング方向(正規化済みを渡す)
  pelletDamage: number,                 // 1発のダメージ(Lv固定=3/6/9)
  pelletCount: number,                  // 同時発射数(=JUNK_WEAPON_PELLETS)
): Projectile[] => {
  const def = CATALOG['shotgun-t1'];
  const size = def.projectileSize || 7;
  const speed = (def.projectileSpeed || 440) * PROJECTILE_SPEED_MULT;
  const cone = SHOTGUN_SPREAD_CONE_RAD_BY_TIER[def.tier ?? 1] ?? SHOTGUN_SPREAD_CONE_RAD_BY_TIER[1];
  const spreadStep = pelletCount > 1 ? cone / (pelletCount - 1) : 0;
  const now = Date.now();
  const pellets: Projectile[] = [];
  for (let i = 0; i < pelletCount; i++) {
    const angle = -spreadStep * (pelletCount - 1) / 2 + i * spreadStep;
    pellets.push({
      id: `proj-junk-weapon-${now}-${i}`,
      x: x - size / 2,
      y: y - size / 2,
      width: size,
      height: size,
      speed,
      damage: pelletDamage,
      direction: rotate(direction, angle),
      weaponType: 'shotgun',
      weaponKey: 'sub-junk-weapon',
      duration: 1400,
      createdAt: now,
      passthrough: false,
      hitEnemies: [],
      hostile: false,
      reflected: false,
      // CRIT-UNIFY §9.4: サブウェポン(ジャンク)はクリ発生枠の対象外=critChance固定0。
      critChance: 0,
    });
  }
  return pellets;
};

// 守護霊の銃(ghost-gun・GHOST-GUN-PARITY・TEST_HANDOFF/results/20260730-0944-guardian-parity.md):
// useGameLoopの手書きaddProjectileがプレイヤーのfireWeapon仕様(count発/拡散/PROJECTILE_SPEED_MULT/
// projectileSize/passthrough・pierce)を無視していた5差のうち4つをここで揃える(社長裁定)。
// 借用銃(装備中のgun)そのものの飛翔特性なので computeShotDirections/projectileFlightStats を
// プレイヤーと共有する。
// 【v0.25.2514 GHOST-BUILD-1】残り1差(ダメージ倍率・クリ率)を解消: `build`(計測時ビルドの疑似Player+
// gameTime)を渡すと、素ダメージ/クリ率をプレイヤーの発射と**同じ共通ヘルパ**
// (gunShotBaseDamage/gunShotCritChance)で算出する=スキル倍率・装備ボーナス・射撃クリが再現される
// (§2.11訂正)。buildを省略した場合のみ旧挙動(素damage・crit無し)。
// headshot=裁定4(PHILL): 発射時に確定ヘッドショットと決まった弾に印を付ける(着弾側がロールを飛ばす)。
// 貫通はweapon自体のpassthrough/pierce(確定仕様)。
// weaponKeyは'ghost-gun'固定(計測除外/ヘイト分離は呼び出し元=useGameLoopが別途行う=不変)。
// 副作用なし(マガジン/リロード/クールダウンは呼び出し元が共通ヘルパで進め、ここでは触らない)。
export const buildGhostGunShots = (
  gun: Weapon,
  originX: number, originY: number,          // 発射点(ゴースト中心)
  baseDir: { x: number; y: number },         // 照準方向(正規化済み)
  now: number,
  idPrefix: string,                          // 弾idの一意化(呼び出し元がゴーストid等を渡す)
  build?: { player: Player; gameTime: number; headshot?: boolean },
): Projectile[] => {
  // UNIQUE_WEAPONS.md §16-3b(手動専用銃の掟): 手動専用銃(シグナルランチャー)を持っていたら
  // 「撃たない」ではなく既定の同カテゴリ銃(glauncher-t3)へ差し替えて撃つ(=守護霊の火力ゼロを防ぐ)。
  // フォールバック先が無い(PHILL)は従来どおり素通し。
  const effGun = isManualOnlyGunKey(gun.key) ? manualOnlyFallbackWeapon(gun) : gun;
  // UNIQUE_WEAPONS.md §17-6(監査A-8/検収監査A-2の是正): アイレーザー/火炎放射器は弾を作らない
  // 非投射武器。等価実装はしない=守護霊もこの2挺を持っていたら撃たない(規則: 非投射武器は
  // 3経路とも「撃たない」)。判定は`nonProjectile`フラグ1本(キー直書きにしない)。
  if (effGun.nonProjectile) return [];
  const { size, speed } = projectileFlightStats(effGun);
  const dirs = computeShotDirections(effGun, baseDir);
  const damage = build ? gunShotBaseDamage(effGun, build.player, build.gameTime) : effGun.damage;
  const critChance = build ? gunShotCritChance(effGun, build.player, build.gameTime) : 0;
  return dirs.map((direction, i) => ({
    id: `${idPrefix}-${now}-${i}`,
    x: originX - size / 2,
    y: originY - size / 2,
    width: size,
    height: size,
    speed,
    damage,
    direction,
    weaponType: effGun.category as WeaponType,
    weaponKey: 'ghost-gun',
    duration: 1400,
    createdAt: now,
    passthrough: effGun.passthrough || false,
    hitEnemies: [],
    pierce: effGun.pierce,
    hostile: false,
    reflected: false,
    critChance,
    ...(build?.headshot ? { headshot: true } : {}),
  }));
};

export const getWeaponShortName = (type: WeaponType): string => {
  switch (type) {
    case 'handgun': return 'ハンドガン';
    case 'shotgun': return 'ショットガン';
    case 'rifle':   return 'ライフル';
    case 'knife':   return 'ナイフ';
    case 'hatchet': return 'ダガー';
    case 'machete': return 'ファイティングナイフ';
    case 'tactical-knife': return 'タクティカルナイフ';
    case 'anti-mutant-knife': return '対変異体ナイフ';
    case 'phill-bullet': return 'ＰＨＩＬＬ-銃';
    default:        return '武器';
  }
};
