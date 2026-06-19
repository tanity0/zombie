// Game state types
export type GameState = 'title' | 'menu' | 'loading' | 'playing' | 'paused' | 'gameOver' | 'victory';

// Character class types
export type CharacterClass = 'warrior' | 'mage' | 'rogue' | 'necromancer';

// ステージ開始時の会話イベント1行。speaker: null=通信 / '__voice__'=生存者の声 / '__radio__'=無線ノイズの間 /
// '__class__'=選択中の職業名。ミッションごとに内容/有無が変わる(フリーミッションは空=会話なし)。
export interface IntroLine { speaker: string | null; text: string; holdMs?: number }


// Player types
export interface Player {
  x: number;
  y: number;
  // Velocity (px/s). Movement is smoothed toward the input target so the player
  // has ~0.3s of inertia on starting, stopping, and turning.
  vx: number;
  vy: number;
  width: number;
  height: number;
  speed: number;
  health: number;
  maxHealth: number;
  experience: number;
  level: number;
  experienceToNextLevel: number;
  weapons: Weapon[];
  // Id of the currently-active gun (the one that auto-fires). The player can
  // hold up to one gun per category plus a melee weapon, and switch between
  // guns via the HUD; an empty pool auto-switches to a gun that still has ammo.
  activeWeaponId: string;
  characterClass: CharacterClass;
  direction: Direction;
  isMoving: boolean;
  invulnerable: boolean;
  invulnerableTime: number;
  lastDirection: { x: number; y: number } | null;
  // 照準サークルの慣性付きベクトル(向き×傾き強度, 長さ0..1)。PHILL弾/ワイヤーアンカー/
  // サークル描画はすべてこれに揃える(進行方向ではなくサークル方向へ)。movePlayer が毎フレーム更新。
  aimX: number;
  aimY: number;
  // Counter-on-release state. Releasing the touch opens a brief window
  // during which any incoming hostile projectile is reflected.
  counterWindowEnd: number;     // ms timestamp; window is open while now <= this
  counterCooldownEnd: number;   // ms timestamp; cannot open another window until this
  lastCounterSuccessTime: number; // for the success flash effect
  // RE-style resources. Each gun family has a category-specific RESERVE pool
  // (these fields). A gun fires from its own loaded magazine and reloads from
  // this reserve; an empty reserve means no more reloads for that family.
  ammoHandgun: number;
  ammoShotgun: number;
  ammoRifle: number;
  ammoPhill: number; // 研究所専用 PHILL銃のリザーブ弾。共有弾とは別プール。
  // Level-up crit bonus [0, 0.30]. Gun shots add this to the weapon's base
  // crit chance; melee uses its weapon crit chance directly.
  critChance: number;
  // Temporary quick-magazine reload buff. While gameTime is below this value,
  // gun shots gain a small extra crit chance.
  quickMagCritUntil: number;
  // Reload state. While reloadEndsAt is in the future the named gun is being
  // reloaded: it can't fire, while movement can be tuned by the reload
  // movement multiplier in the store. 0 / '' when not reloading.
  reloadEndsAt: number;
  reloadingWeaponId: string;
  // Level-up modifiers applied to ALL owned guns: magBonus adds to every gun's
  // magazine capacity; reloadMult scales reload time (<1 = faster).
  magBonus: number;
  reloadMult: number;
  // パッシブ(レベルアップ)の累積効果。stunDurationMult=敵気絶時間倍率(初期1)、
  // ammoDropBonus=弾薬ドロップ率への加算(初期0)、scrapMult=スクラップ獲得倍率(初期1)。
  // passiveCounts=各パッシブの取得回数(個別上限の管理)。
  stunDurationMult: number;
  ammoDropBonus: number;
  scrapMult: number;
  passiveCounts: Partial<Record<PassiveType, number>>;
  // Temporary sub-weapon skill test bed. Keys are unlocked by level-up cards;
  // cooldowns are gameTime timestamps, so they pause with the game.
  subWeapons: SubWeaponKey[];
  subWeaponLevels: Partial<Record<SubWeaponKey, number>>;
  subWeaponCooldowns: Partial<Record<SubWeaponKey, number>>;
  // 装備スキル(サブウェポンとは別枠のアクティブ能力。最大2。効果は今後配線=現状は枠/保持のみ)。
  skills: SkillKey[];
  // 装備スキルの状態フィールド(状態を持つスキルのみ。全て number・既定0。resetGame で初期化)。
  fireShooterCdUntil: number;  // ファイアシューター: 爆発弾化の裏CD(gameTime)
  reflexCdUntil: number;       // 反射神経: 反撃CD(gameTime)
  slasherWindowUntil: number;  // スラッシャー: 追撃受付窓(gameTime)
  knifeComboCount: number;     // ナイフマスター: 近接ダメージコンボ数
  knifeComboUntil: number;     // ナイフマスター: コンボ持続(gameTime)
  benkeiBuffUntil: number;     // 弁慶: crit率バフ終了(gameTime)
  benkeiCdUntil: number;       // 弁慶: 再発動CD(gameTime)
  // キャラ固有スキル(characterClass で自動有効。装備スキル枠は消費しない)の状態フィールド。
  scavengerBuffUntil: number;   // スカベンジャー(necromancer): 弾薬取得で銃ダメ+10%(gameTime)
  marksmanMovingSince: number;  // マークスマン(mage): 連続移動の開始gameTime。0=停止中
  heavyGunnerExpBuffUntil: number; // ヘビーガンナー(warrior): 同一攻撃2体以上で爆発範囲+10%(gameTime)
  // PHILL銃の狙いサークル(レティクル)の吸い付き。プレイヤー中心からのオフセット(px)＋スナップ中の敵ID。
  // movePlayer が毎フレーム算出 → 描画(pixiScene)と発砲(firePhillShot)で共有。
  phillReticleDX: number;
  phillReticleDY: number;
  phillSnapEnemyId: string | null;
  huntingChargeStartedAt: number;
  huntingCharged: boolean;
  // Whip (鞭) sub-weapon charge. Each whip hit increments whipHitCount; at the
  // level threshold whipCharged flips true and the next swing fires a hurricane.
  whipHitCount?: number;
  whipCharged?: boolean;
  // 錬金術: 立ち止まりチャネルの開始 gameTime(ms)。0 = 非チャネル。5秒で召喚。
  alchemyChannelStartedAt?: number;
  // Katana (刀) sub-weapon dash state. While katanaDashUntil is in the future
  // the player ignores input and travels along the dash direction while
  // invulnerable. The cooldown gates only the next dash — normal movement and
  // the katana auto-slash continue during it.
  katanaDashUntil: number;
  katanaDashDirX: number;
  katanaDashDirY: number;
  katanaDashCooldownEnd: number;
  // 一閃の着地後に動けない硬直(後隙)が切れる時刻。刀・村雨共通。
  // 着地(katanaDashUntil)から KATANA_DASH_RECOVERY_MS の間は移動も次の一閃も不可。
  katanaRecoveryUntil: number;
  // 四神舞フリック=盾バッシュ風スライド。shijinSlideUntil が未来の間、入力を無視して
  // shijinSlideDir 方向へ一定速で滑る(movePlayer がダッシュと同様に上書き)。
  shijinSlideUntil: number;
  shijinSlideDirX: number;
  shijinSlideDirY: number;
  // ワイヤーアンカー(移動系サブ)。装備中は前方に青サークルを常時表示。指離しで「即座に」アンカーを
  // 打ち込み(ワイヤーが表示される)、溜(wirePlantUntil まで)の後に追加タップでアンカー地点へ高速移動。
  // アンカーは一度打ち込むと、プレイヤーが一定距離(WIRE_CLEAR_DIST)離れるか、移動に使うまでそこに留まる。
  // wireAnchorX/Y=打ち込み地点。wireAnchored=打ち込み済みか。wirePlantUntil=溜の完了時刻(Date.now)。
  // wireDashUntil=高速移動の終了時刻。wireDashSpeed=高速移動速度(px/s)。高速移動中は敵接触ダメージ無効。
  wireAnchorX: number;
  wireAnchorY: number;
  wireAnchored: boolean;
  wirePlantUntil: number;
  wireDashUntil: number;
  wireDashSpeed: number;
  // アンカーが敵に刺さった(吸着)場合: その敵ID と、引き寄せ→近接→ノックバックを解決する時刻。
  wireStuckEnemyId: string;
  wireStuckUntil: number;
  // In-run currency. Spent during the current play only.
  straps: number;
  // One-shot revive stock from the in-run vaccine shop item.
  vaccineRevives: number;
}

// Movement direction
export type Direction = 'up' | 'down' | 'left' | 'right' | 'idle';

// Enemy types
export interface Enemy {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  health: number;
  maxHealth: number;
  damage: number;
  type: EnemyType;
  experienceValue: number;
  lastHit: number;
  lastShot: number;
  // Chase velocity (px/s), smoothed toward the heading so enemies have ~0.3s of
  // inertia and curve into turns instead of snapping.
  vx?: number;
  vy?: number;
  // Knockback state. While knockbackUntil is in the future the enemy is
  // pushed by (knockbackVx, knockbackVy) instead of chasing the player.
  // All three are absent on most enemies most of the time.
  knockbackUntil?: number;
  knockbackVx?: number;
  knockbackVy?: number;
  // Melee-knockback debounce: an enemy shoved by a counter can't be shoved
  // again until this gameless ms timestamp (damage still applies). Prevents
  // infinite knockback-locking.
  knockbackImmuneUntil?: number;
  // Stun state (gameTime-based so it survives pauses). While
  // gameTime < stunUntil the enemy stops moving and can be finished with
  // a melee counter for an instant kill.
  stunUntil?: number;
  // Root state from traps. This only stops movement; it does not make the
  // enemy a critical/finisher target.
  rootUntil?: number;
  // Visual-only lift reaction for boss melee finisher-grade hits.
  liftUntil?: number;
  // Spawn bookkeeping for the enemy-cap culler. Scripted-wave enemies get
  // a short grace period before they become eligible for culling so big
  // set-piece hordes aren't deleted the instant they appear.
  spawnedAt?: number; // gameTime ms when spawned
  isWave?: boolean;
  // 囲い系イベント(アリーナ/ミニボス)で湧いた敵。終了判定(全滅)とカリング保護に使う。
  fromEvent?: boolean;
  // Difficulty metadata. Time and distance from the game origin both feed this
  // at spawn time. Renderer uses rank for lightweight ornaments; gameplay uses multiplier.
  distanceZone?: number;
  difficultyRank?: DifficultyRank;
  difficultyMultiplier?: number;
  // 死神(深奥リスク)システム: 完全出現してプレイヤーを追う死神。速度は毎フレ player.speed×1.2 に追従。
  reaperChaser?: boolean;
  // 特殊AI(犬型=突進 / パンプキン=ジャンプ攻撃)の状態機械。すべて gameTime(ms)基準。
  //  werewolf: undefined→'windup'(減速)→'charge'(2倍速で aiTarget へ突進)→cooldown。
  //  pumpkin : undefined→'crouch'(縮みながら3秒溜め)→'jump'(1秒でaiTargetへ着地)→'recover'(1秒停止)。
  aiPhase?: 'windup' | 'charge' | 'crouch' | 'jump' | 'recover';
  aiPhaseUntil?: number; // 現フェーズの終了 gameTime
  aiReadyAt?: number;    // 次に特殊行動を開始できる gameTime(連発防止)
  aiTargetX?: number;    // 突進/着地の狙い座標(行動開始時のプレイヤー位置スナップ)
  aiTargetY?: number;
  aiFromX?: number;      // ジャンプ開始座標(着地までの補間元)
  aiFromY?: number;
  aiStartedAt?: number;  // ジャンプ開始 gameTime(アーク進行に使用)
  // 屋内ステージ用: 固定配置の休眠敵。dormant 中は静止し、aggroRange 内にプレイヤーが
  // 入ると起床(dormant=false)して以後通常追跡。fixed=距離カリングの対象外(常駐)。
  dormant?: boolean;
  aggroRange?: number;
  fixed?: boolean;
  // 屋内ステージの固定敵が「画面外に出たら戻る」最初の定位置(スポーン座標)。
  homeX?: number;
  homeY?: number;
}

export type SummonKind = 'normal' | 'rare';
// 錬金術で召喚する味方ユニット。敵とは別配列(enemies のカウント/スポーン/勝利条件
// 等に混ざらないよう完全分離)。移動/攻撃/見た目は敵キャラの仕様を流用し、reusedType が
// その参照元(normal: zombie/werewolf/pumpkin、rare: reaper=死神ヴィジュアル)。
export interface Summon {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  vx?: number;
  vy?: number;
  speed: number;
  health: number;
  maxHealth: number;
  damage: number;
  kind: SummonKind;
  reusedType: EnemyType; // 見た目/速度の参照元
  level: number;
  createdAt: number;      // Date.now — FIFO順 + レアの10秒寿命
  expiresAt?: number;     // rare のみ
  lastHit: number;
  lastContactAt?: number; // 召喚→敵 接触ダメージの throttle
}

export type DifficultyRank = 'normal' | 'strong' | 'elite' | 'danger';

export type EnemyType =
  | 'bat'        // ubiquitous low-HP swarmer
  | 'skeleton'   // standard melee chaser
  | 'zombie'     // slow tank
  | 'plant'     // near-stationary ranged seed-spitter
  | 'ghost'     // fast translucent melee
  | 'werewolf'  // mid-game fast bruiser
  | 'pumpkin'   // elite (wave events)
  | 'giantbat'  // mini-boss every ~10 minutes
  | 'reaper'    // terminal entity at 30:00
  | 'lab-zombie-1' // 研究所Lv1(通常・男女)
  | 'lab-zombie-2' // 研究所Lv2(変異・男女)
  | 'lab-zombie-3'; // 研究所Lv3(巨体・パンプキン相当)

// Weapon types
export interface Weapon {
  id: string;
  name: string;
  type: WeaponType;
  damage: number;
  cooldown: number;
  lastFired: number;
  level: number;
  projectileSpeed?: number;
  projectileSize?: number;
  area?: number;
  duration?: number;
  passthrough?: boolean;
  count?: number;
  // Magazine state (guns only; undefined for melee). `magazine` is the rounds
  // currently loaded, `magSize` the base capacity, `reloadMs` the base reload
  // time. Firing drains `magazine`; reloads refill it from the reserve pool.
  magazine?: number;
  magSize?: number;
  reloadMs?: number;
  // RE-style classification. Guns belong to a category that shares an ammo
  // pool; tier (1-3) controls power within the category. Melee weapons set
  // isMelee and don't consume ammo (they're triggered by the counter).
  category?: WeaponCategory;
  tier?: number;
  isMelee?: boolean;
  ammoType?: AmmoType;
  // Fixed/base crit chance for this weapon. Guns add the player's level-up
  // crit bonus at fire time; melee weapons use this directly.
  critChance?: number;
  // Enemies a fired round passes through (piercing guns). Undefined = none /
  // unlimited depending on `passthrough`.
  pierce?: number;
  // Catalog key (e.g. 'handgun-t1') so drops/crates can re-create the weapon.
  key?: string;
}

// Gun families. Each shares an ammo pool with the matching AmmoType.
export type WeaponCategory = 'handgun' | 'shotgun' | 'rifle' | 'phill';
export type AmmoType = WeaponCategory;

// Projectile/weapon kinds. Guns use their category as the projectile type;
// melee weapons never spawn projectiles (handled by the counter). enemy_bolt
// is the hostile seed/bolt enemies spit.
export type WeaponType = WeaponCategory | 'knife' | 'hatchet' | 'machete' | 'enemy_bolt' | 'grenade' | 'trap' | 'decoy' | 'shield' | 'turret' | 'fire-knife-projectile' | 'drone-boomerang-projectile' | 'phill-bullet';
export type SubWeaponKey = 'heavy-grenade' | 'marksman-trap' | 'striker-quick-mag' | 'striker-hunting' | 'dog' | 'katana' | 'murasame' | 'decoy' | 'shield' | 'whip' | 'alchemy' | 'turret' | 'shijin' | 'fire-knife' | 'drone-boomerang' | 'wire-anchor' | 'sage-stone';

// 装備スキル(サブウェポンとは別系統のパッシブ能力)。最大2装備。入手はゴールドガチャ、装備画面で所持から2枠選択。
// レア度: normal/rare/super(超レア=死神/バーサーカー/スケーター)。
export type SkillKey =
  // 超レア
  | 'reaper' | 'berserker' | 'skater'
  // レア
  | 'crit-up' | 'knight' | 'exploder' | 'sharpshooter' | 'sniper' | 'ricochet'
  | 'bomber' | 'fire-shooter' | 'bomb-counter' | 'punisher' | 'combo-master'
  | 'knife-master' | 'benkei' | 'reflex'
  // 通常
  | 'gold-rush' | 'time-keeper' | 'ghost-shooter' | 'dog-run' | 'counter-master' | 'slasher';

// 四神舞(リズム)サブウェポン。リズム入力(タップ/フリック)で戦い、フリック4本パターンで
// 四神技(朱雀/玄武/青龍/白虎)を発動。状態は store に持ち、攻撃実行は useGameLoop が担う。
export type RhythmArrow = 'up' | 'down' | 'left' | 'right';
export type ShijinGod = 'suzaku' | 'genbu' | 'seiryu' | 'byakko';
// loop が消化する実行待ちアクション(store=判定/状態、loop=攻撃実行 の橋渡し)。
export type RhythmPending =
  | { kind: 'tap' }
  | { kind: 'flick'; arrow: RhythmArrow }
  | { kind: 'god'; god: ShijinGod; x: number; y: number }
  | { kind: 'finish' };
export interface RhythmState {
  active: boolean;
  interval: number;        // 1ビートの長さ(ms)。四神舞レベルのBPMで決まる(Lv1=600/Lv2=500/Lv3≈429)
  firstBeatAt: number;     // gameTime(ms) の beat index 0 の時刻
  expectBeat: number;      // 次に取るべき beat index(毎ビート入力が要る)
  prompt: RhythmArrow[];   // 現在の4矢印プロンプト(1本目=四神を決定)
  inputIndex: number;      // 一致した矢印数(0..4)
  inputArrows: RhythmArrow[]; // 実際に入力したフリック履歴(頭上表示用。末尾4つを表示)

  godSuccess: number;      // 四神技の成功回数(SHIJIN_FINISH_COUNT で全体フィニッシュ)
  comboStage: number;      // ミラーボール色段階(コンボから導出)
  lastInputAt: number;     // 連打デバウンス用
  lastJudge: 'none' | 'hit' | 'miss' | 'fire';
  lastJudgeAt: number;     // 演出用(gameTime)
  lastJudgeKind: 'tap' | 'flick' | 'none'; // 直近JUSTの種類(演出: タップ=サークル / フリック=矢印)
  lastJudgeArrow: RhythmArrow | null;       // フリックの向き(演出用。タップはnull)
  judgeSeq: number;        // JUST成功の通算回数(演出: 赤青緑黄を順番に光らせる巡回インデックス)
  lastTapAt: number;       // タップ成功の時刻(gameTime)。タップ発光演出に使用
  lastFinishAt: number;    // 四神技4回成功(全体フィニッシュ)の時刻(gameTime)。虹色演出に使用
  lastGod: ShijinGod | null;
  invulnUntil: number;     // 開始直後の無敵(gameTime, TODO仮値)
  byakkoUntil: number;     // 白虎の持続終了(gameTime)
  byakkoNextAt: number;    // 次の斬撃パルス
  byakkoHits: number;      // 斬撃回数(BYAKKO_MAX_HITS で打ち止め)
  pending: RhythmPending[];// loop が消化する実行待ち
}
export type ShopItemKey =
  | 'ammo-handgun'
  | 'ammo-shotgun'
  | 'ammo-rifle'
  | 'ammo-phill'
  | 'buy-phill'   // 研究所(lab テーマ)で武器商人が無料配布する PHILL 銃
  | 'dog'
  | 'class-skill'
  | 'medkit'
  | 'vaccine';

// ステージ見た目テーマ。屋外サバイバル構造のまま地面などのテクスチャを差し替える。
export type StageTheme = 'forest' | 'lab';

export interface WeaponMerchant {
  x: number;
  y: number;
  radius: number;
}

export type EventQuestStatus = 'available' | 'accepted' | 'completed';

export interface EventQuestNpc {
  x: number;
  y: number;
  radius: number;
  status: EventQuestStatus;
  questIndex: number;
  fadeStartedAt: number;
}

// Projectile types
export interface Projectile {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  damage: number;
  direction: { x: number; y: number };
  weaponType: WeaponType;
  weaponKey?: string;
  duration: number;
  createdAt: number;
  passthrough: boolean;
  hitEnemies: string[];
  // For piercing rounds: how many enemies the shot may pass THROUGH before it
  // despawns (so pierce:1 hits two enemies). Undefined = unlimited (the old
  // passthrough behavior for sniper/grenade).
  pierce?: number;
  hostile: boolean;
  reflected: boolean;
  // Gun crit flag — set when the shot rolled a critical. Crits hit harder
  // and stun whatever they connect with.
  crit?: boolean;
  area?: number;
  count?: number;
  // Optional motion modifiers. Axes set `gravity` so they arc upward then
  // fall. Bibles use the orbit fields to circle the player continuously.
  // `followsPlayer` snaps the projectile to the player every frame (garlic).
  gravity?: number;
  orbitRadius?: number;
  orbitAngle?: number;
  orbitSpeed?: number;
  followsPlayer?: boolean;
  // Visual-only slide after a shoved static projectile (currently traps).
  // Gameplay position jumps to x/y immediately; renderer interpolates from
  // shoveStart* to the new x/y for a short seamless push-out.
  shoveStartX?: number;
  shoveStartY?: number;
  shoveStartAt?: number;
  shoveDuration?: number;
  // Decoy: the device travels in the throw direction until this timestamp
  // (Date.now ms), then holds position for the rest of its lifetime.
  decoyLandAt?: number;
  // Deployable shield: a static rear-guard wall. `direction` holds the outward
  // (front-facing) normal, snapped to an axis. `shieldHp` is the remaining
  // durability; each enemy body contact removes 1 (timed by SHIELD_HIT_INTERVAL).
  // `shieldMaxHp` is kept for the damage-state visual only.
  shieldHp?: number;
  shieldMaxHp?: number;
  // Set when a melee shield-bash shoves the wall: the wall slides seamlessly,
  // then is force-destroyed once Date.now() reaches this timestamp (slide end).
  shieldBreakAt?: number;
  // Auto-turret: a stationary placed support unit (weaponType 'turret'). `direction`
  // holds the forward facing captured at placement. `turretMode` toggles between
  // 'forward' (tier-3 SMG, long straight line) and 'omni' (handgun, short radius)
  // when the player melee-hits it. `turretModeSwitchedAt` drives the swap VFX.
  turretMode?: 'forward' | 'omni';
  turretModeSwitchedAt?: number;
  // 発火ナイフ(weaponType 'fire-knife-projectile'): 敵に命中すると刺さり、`stuckToEnemyId`
  // の敵へ追従。`explodeAt`(Date.now ms)で範囲爆発。敵が死んでも最後の位置で爆発する。
  stuckToEnemyId?: string;
  isStuck?: boolean;
  explodeAt?: number;
  // ドローンブーメラン(weaponType 'drone-boomerang-projectile'): 行き('out')→停止('stop')→
  // 戻り('return')→消滅('done')。停止は回転+周囲パルス。戻りはプレイヤー現在地へ。
  boomPhase?: 'out' | 'stop' | 'return' | 'done';
  boomOriginX?: number;  // 投擲開始位置(飛距離計測の基点)
  boomOriginY?: number;
  boomMaxDist?: number;  // 行きの最大飛距離(Lv別)
  boomStopMs?: number;   // 停止時間(Lv別)
  boomStopUntil?: number; // 停止終了 Date.now(out→stop時に設定)
  // スキル弾フラグ。
  // ricochet: リコシェスキルで生成した跳弾。true の弾はもう跳ねない(二次跳弾を禁止)。
  ricochet?: boolean;
  // explodeOnHit: 命中時に小爆発を起こす弾(ファイアシューター/ボムカウンター)。
  // explodeRadius/explodeDamageMult で爆発半径・周囲ダメージ倍率を指定。
  explodeOnHit?: boolean;
  explodeRadius?: number;
  explodeDamageMult?: number;
  // ボマー: 手榴弾が一度だけ子グレネードを散布して再アーム済みであることを示す(再散布の防止)。
  bomberSpawned?: boolean;
}

// Pickup types
export interface Pickup {
  id: string;
  x: number;
  y: number;
  type: PickupType;
  value: number;
  // For 'weapon-drop': the catalog key of the dropped weapon. For
  // 'weapon-crate' this is left undefined (the weapon is rolled on open).
  weaponKey?: string;
  // True for supplies air-dropped onto the map at a random off-screen spot
  // (as opposed to dropping where an enemy died). These get a VS-style edge
  // arrow pointing the player toward them while they're off-screen.
  worldDrop?: boolean;
  // Optional art variant. Treasure uses 1-6 to select the supplied object art.
  variant?: number;
  // Optional short throw arc for spawned pickups. Used by Striker's magazine
  // so the item visibly pops out from the player before landing.
  throwFromX?: number;
  throwFromY?: number;
  throwStartAt?: number;
  throwDuration?: number;
  scatterRadius?: number;
}

export interface BreakableProp {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  footX: number;
  footY: number;
  scale: number;
  health: number;
  maxHealth: number;
  type: BreakablePropType;
  lastHit: number;
}

export type BreakablePropType = 'torch' | 'mine' | 'uv-bar';

export interface CastleEvent {
  x: number;
  y: number;
  bossSpawned: boolean;
}

// 囲い系イベント(小イベント=短時間の強制アリーナ戦/ミニボス戦)。
// activeEvent が非nullの間は: プレイヤーを円内に閉じ込め、敵capを上げ、通常スポーナを止める。
export type ActiveEventKind = 'horde' | 'boss';
export interface ActiveEvent {
  kind: ActiveEventKind; // horde=ゾンビ大量 / boss=ミニボス(giantbat)
  x: number;             // 囲い中心(world)
  y: number;
  radius: number;        // 囲い半径(閉じ込め円=円コリジョン)
  startedAt: number;     // gameTime(ms)。開始直後の誤終了防止グレースに使う
  endsAt: number;        // gameTime(ms)。制限時間の保険(これを過ぎたら強制終了)
}

export type PickupType =
  | 'experience' | 'health' | 'magnet' | 'bomb' | 'chest'
  | 'strap' | 'treasure'
  | 'ammo-handgun' | 'ammo-shotgun' | 'ammo-rifle'
  | 'weapon-drop' | 'weapon-crate' | 'quick-magazine'
  | 'card-key' | 'lab-clear-item' | 'ammo-phill';

// 屋内(研究施設)ステージのギミック状態。
export interface LabDoor { id: string; rect: { x: number; y: number; width: number; height: number }; open: boolean; }
export interface LabButton { id: string; x: number; y: number; radius: number; pressed: boolean; opensDoorId: string; }
// 屋内の障害物プロップ(木の代わり)。x=中心 / y=足元(下辺) / variant=テクスチャ名 / rect=足元の当たり判定。
export interface LabProp { id: string; x: number; y: number; variant: string; rect: { x: number; y: number; width: number; height: number }; }

// Upgrade options
export interface UpgradeOption {
  id: string;
  name: string;
  description: string;
  type: 'weapon' | 'passive' | 'subWeapon';
  weaponType?: WeaponType;
  passiveType?: PassiveType;
  subWeaponKey?: SubWeaponKey;
  level: number;
}

export type PassiveType = 'maxHealth' | 'speed' | 'might' | 'area' | 'cooldown' | 'duration' | 'magSize' | 'reloadSpeed' | 'critChance' | 'stunDuration' | 'ammoDrop' | 'scrapGain';

// Game statistics
export interface GameStats {
  timeAlive: number;
  enemiesKilled: number;
  damageDealt: number;
  experienceCollected: number;
  maxLevel: number;
  maxCombo: number;
  strapsCollected: number;
  strapsSpent: number;
  treasuresCollected: number;
}

// Input state — keyboard fallback only. Touch is handled directly by the
// VirtualJoystick component via swipeDirection.
export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

// Game area bounds
export interface GameBounds {
  width: number;
  height: number;
}

// Visual-only effects. The game loop spawns these and never reads them back;
// only the renderer consumes them. They have no gameplay impact.
export type VisualEffect =
  | {
      kind: 'particle';
      id: string;
      x: number; y: number;
      vx: number; vy: number;
      color: string;
      size: number;
      createdAt: number;
      duration: number;
      drag?: number;
      liquid?: boolean;
    }
  | {
      kind: 'damageNumber';
      id: string;
      x: number; y: number;
      value: number;
      color: string;
      createdAt: number;
      duration: number;
      crit?: boolean;
      // Optional override text (e.g. "+30" for ammo pickups, "Kill!"/"Counter!"
      // callouts). Falls back to the numeric value when absent.
      text?: string;
      // Optional font scale multiplier (callouts use a larger value).
      scale?: number;
      // Optional serif/mincho font (e.g. the katana "斬" callout).
      serif?: boolean;
    }
  | {
      kind: 'ring';
      id: string;
      x: number; y: number;
      startRadius: number;
      endRadius: number;
      color: string;
      width: number;
      createdAt: number;
      duration: number;
    }
  | {
      kind: 'flash';
      id: string;
      color: string;          // e.g. 'rgba(255,255,255,0.8)' — overlays whole screen
      createdAt: number;
      duration: number;
    }
  | {
      kind: 'trail';
      id: string;
      // Animated line from (fromX,fromY) toward player; rendered as a fading
      // streak that moves with the magnet pull.
      fromX: number; fromY: number;
      toX: number; toY: number;
      color: string;
      createdAt: number;
      duration: number;
    }
  | {
      // 鞭: 全長を即表示してフェードする太い帯(=当たり範囲)+ 明るい芯。
      kind: 'whip';
      id: string;
      fromX: number; fromY: number;
      toX: number; toY: number;
      halfWidth: number; // 当たり帯の半幅(px)
      color: string;
      createdAt: number;
      duration: number;
    }
  | {
      kind: 'dogFetch';
      id: string;
      fromX: number; fromY: number;
      targetX: number; targetY: number;
      toX: number; toY: number;
      createdAt: number;
      pickupAt: number;
      duration: number;
    }
  | {
      // Fixed-radius radial light that fades in place (no expansion). Used to
      // flash the counter's reach when it fires.
      kind: 'glow';
      id: string;
      x: number; y: number;
      radius: number;
      color: string;          // base rgb, e.g. 'rgba(251,191,36,'  — alpha appended
      createdAt: number;
      duration: number;
    }
  | {
      // A short slash streak drawn on an enemy struck in melee.
      kind: 'slash';
      id: string;
      x: number; y: number;
      angle: number;          // radians
      length: number;
      color: string;
      createdAt: number;
      duration: number;
    };
