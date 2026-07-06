// Game state types
export type GameState = 'title' | 'menu' | 'loading' | 'playing' | 'paused' | 'gameOver' | 'victory' | 'returned';

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
  // 被弾ノックバック(ジャンプ攻撃などで弾き出される)。Date.now ms 基準。movePlayer が
  // この間は入力を無視して減衰速度で滑らす。
  knockbackUntil?: number;
  knockbackVx?: number;
  knockbackVy?: number;
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
  // 近接スイング演出用タイムスタンプ(Date.now)。描画のみ=スイングの二次モーション(踏み込み/振り抜き)の起点。
  // 0=未スイング。判定・射程には不干渉(renderer が読むだけ)。
  meleeSwingAt: number;
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
  // 装備スキル(サブウェポンとは別枠のアクティブ能力。最大2)。
  skills: SkillKey[];
  // 装備スキルのレベル(1..3。skills に入っているもののみ。未設定=1)。効果の段階化に使用。
  skillLevels: Partial<Record<SkillKey, number>>;
  // 装備スキルの状態フィールド(状態を持つスキルのみ。全て number・既定0。resetGame で初期化)。
  fireShooterCdUntil: number;  // ファイアシューター: 爆発弾化の裏CD(gameTime)
  reflexCdUntil: number;       // 反射神経: 反撃CD(gameTime)
  slasherRingStartAt: number;  // スラッシャー: タイミングリング開始 realGameTime(slow-mo非依存。0=非アクティブ)
  slasherStrikeStep: number;   // スラッシャー: 既に出した追撃回数(0..3)
  slasherReach: number;        // スラッシャー: 追撃に使う近接射程(初撃時の射程を記録=溜め延長が消費されても追撃は伸びたまま。0=未設定)
  knifeComboCount: number;     // ナイフマスター: 近接ダメージコンボ数
  knifeComboUntil: number;     // ナイフマスター: コンボ持続(gameTime)
  benkeiBuffUntil: number;     // 弁慶: crit率バフ終了(gameTime)
  benkeiCdUntil: number;       // 弁慶: 再発動CD(gameTime)
  seekerUntil: number;         // シーカー: 半透明化＋通常敵から狙われない 効果終了(gameTime)
  seekerCdUntil: number;       // シーカー: 再発動CD(gameTime)
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
  // スケーター: 1秒以上走行後に進行方向と逆へスティックを倒すと、進行方向へ短距離衝撃波
  // (バッシュ効果)を出して急停止する。skaterStopUntil が未来の間は入力を無視して残速度を
  // 素早く減衰させる(ほんの少し慣性のある急停止)。skaterBashCdUntil=次に出せる gameTime。
  skaterStopUntil: number;
  skaterBashCdUntil: number;
  // スケーター新仕様(社長指示): ダブルタップで「乗車」。乗車中だけ移動3倍＋強慣性。指離しで降車し、
  // 1秒以上乗っていれば進行方向へスケボーを投擲(当たると前方バッシュ=衝撃波+強制ノックバック)。1秒未満は消えるだけ。
  skaterRiding: boolean;     // 乗車中か(=3倍/強慣性を適用)。
  skaterRideStartAt: number; // 乗車開始 gameTime(ms)。降車時に1秒以上か判定。
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
  // アンカーが敵に刺さった時の大技(引き上げ→垂直斬り下ろし→着地ノックバック)。
  wireSlamEnemyId: string; // 斬り下ろす対象の敵ID('' = 大技なし)。着地でフィニッシュ。
  wireSlamStart: number;   // 引き上げ開始時刻(Date.now)。描画のジャンプ弧の起点。終点は wireDashUntil。
  // In-run currency. Spent during the current play only.
  straps: number;
  // One-shot revive stock from the in-run vaccine shop item.
  vaccineRevives: number;
  // === 装備システム(レベルアップ報酬) ===
  // 各部位に1つずつ装備。defId は data/equipment.ts の EQUIPMENT のキー(null=未装備)。
  // 死亡で全ロスト(持ち込み含む)。商人帰還/クリア時に1つだけ持ち帰り(localStorage 永続)。
  equipment: EquipLoadout;
  // 装備3点から集計した効果(消費側はここを読む)。装備変更/run開始時のみ再計算。
  // 最大体力は player.maxHealth へ加算ベイクするためここには含めない(二重計上防止)。
  equipBonus: EquipBonus;
}

// 装備部位 / 系統 / ステータスキー。
export type EquipSlot = 'body' | 'arms' | 'accessory';
export type EquipLine =
  | 'protection' | 'mobility'   // 体: 防護系 / 機動系
  | 'firepower' | 'handling'    // 腕: 火力系 / 取り回し系
  | 'crit' | 'ammo'             // アクセ: クリ系 / 弾薬系
  | 'special';                  // 特殊装備(系統に依存しない・3ステ)
export type EquipStatKey =
  | 'maxHealth'   // 最大体力(HP加算)
  | 'moveSpeed'   // 移動速度(割合)
  | 'killGrace'   // KILL猶予(KILLコンボ維持時間の割合延長)
  | 'damage'      // ダメージ(割合)
  | 'fireRate'    // 連射(割合)
  | 'reload'      // リロード時間短縮(正の割合=短縮量)
  | 'critChance'  // クリ率(割合・3%刻み)
  | 'ammoDrop'    // 弾薬ドロップ(割合)
  | 'scrap';      // スクラップ(割合)
// 1ステータス分の効果。value の単位: maxHealth=HPポイント、それ以外=割合(0.20=+20%、reloadは短縮量)。
export interface EquipStat { key: EquipStatKey; value: number }
// 静的な装備定義(data/equipment.ts)。
export interface EquipmentDef {
  id: string;        // 安定キー 例: 'body-protection-3' / 'special-arms'
  slot: EquipSlot;
  line: EquipLine;
  tier: number;      // 通常=1..5、特殊=0
  name: string;
  special: boolean;  // 特殊装備(3ステ・レア度非依存)
  stats: EquipStat[];
}
// 装備中の defId(部位ごと)。
export interface EquipLoadout { body: string | null; arms: string | null; accessory: string | null }
// 集計済み効果。中立値: mult=1 / bonus=0。
export interface EquipBonus {
  moveSpeedMult: number;  // 1 + Σ移動速度
  killGraceMult: number;  // 1 + ΣKILL猶予
  damageMult: number;     // 1 + Σダメージ
  fireRateMult: number;   // 1 + Σ連射(実効cooldown = cooldown / これ)
  reloadMult: number;     // Π(1 - リロード短縮)
  critBonus: number;      // Σクリ率(加算)
  ammoDropBonus: number;  // Σ弾薬ドロップ(加算)
  scrapBonus: number;     // Σスクラップ(加算)
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
  // 救助イベントの攻撃者: この survivor の id を狙う(updateEnemies の retarget 分岐で参照)。
  escortTarget?: string;
  // プレイヤーが近接ダメージを与えた敵=以後プレイヤーを狙う(救助の survivor 狙いから切替。社長指示)。
  meleeAggro?: boolean;
  // Difficulty metadata. Time and distance from the game origin both feed this
  // at spawn time. rank はトレジャー抽選に使用、multiplier は強さ(HP/ダメ)に乗る。
  distanceZone?: number;
  difficultyRank?: DifficultyRank;
  difficultyMultiplier?: number;
  // 色付き(影の色)個体。距離が離れると確率で付与され、色ごとに難易度倍率が上がる(青<紫<赤)。
  // 見た目の本体は同じで、足元の影だけが色づく(装飾は廃止)。ジャイアント/死神/特別敵には付かない。
  colorTier?: EnemyColorTier;
  // PACING_PUZZLE.md §5.14 M13: この個体が現在の宿敵(ネームド)インスタンスか。同時1体まで。
  // HP/与ダメ/サイズは湧き時に既に倍率反映済み(このフラグは表示(tint+名前)専用)。
  isNamed?: boolean;
  // DISTRIBUTION_REDESIGN.md①: 台本シーンのfeatured床(FEATURED_MIN_AREA_WEIGHT)で、本来その
  // エリアでは出現しない型が選ばれた時に立つ。距離リサイクルの「エリア不適合→強制回収」を免除する
  // (免除しないとシーンで出した直後に5秒で消される=ghost消失バグと同型の再発)。画面外に離れた時の
  // 通常回収(OFFSCREEN_RECYCLE_MARGIN)は従来どおり効く=シーンが終われば自然に掃ける。
  sceneSpawn?: boolean;
  // 制圧イベント: この敵がどの拠点の攻撃者か(baseSites[].id)。未設定=通常敵。
  baseId?: string;
  // 死神(深奥リスク)システム: 完全出現してプレイヤーを追う死神。速度は毎フレ player.speed×1.2 に追従。
  reaperChaser?: boolean;
  // 回り込みワープの描画フェード(1=不透明 / 0=透明)。消える→テレポート→出る を 0.5s ずつで演出。
  reaperWarpAlpha?: number;
  // 特殊AI(犬型=突進 / パンプキン=ジャンプ攻撃)の状態機械。すべて gameTime(ms)基準。
  //  werewolf: undefined→'windup'(減速)→'charge'(2倍速で aiTarget へ突進)→cooldown。
  //  pumpkin : undefined→'crouch'(縮みながら3秒溜め)→'jump'(1秒でaiTargetへ着地)→'recover'(1秒停止)。
  //  zombie  : 近接範囲に入ると 'zpause'(1秒停止)→'zrush'(2秒間2倍速)→範囲内なら 'zpause' を繰り返す。
  aiPhase?: 'windup' | 'charge' | 'crouch' | 'jump' | 'recover' | 'zpause' | 'zrush' | 'scream';
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
  // ジャイアントバットの行動パターン別クールダウン(gameTime ms)。弾(fire profile)とは別系統。
  gbJumpReadyAt?: number;
  gbDashReadyAt?: number;
  // ハンター変異体: 撤退中フラグ。true の間は updateEnemies の通常追跡から除外し、専用イベント
  // コントローラ(useGameLoop)がプレイヤーから離れる方向へ移動させ、画面外で消滅させる。
  hunterFleeing?: boolean;
  // ハンター変異体: 検知済み(プレイヤーを視界に捉えた=被監視 or 追跡中)。true の間だけ方角矢印を出す。
  hunterAlerted?: boolean;
  // パニッシャーで「巻き込まれて」ノックバックした敵の印。これ以上は連鎖させない(1次まで)。
  punisherHopped?: boolean;
  // 抱卵型(旧ghost): 次に緑卵を撒く gameTime(ms)。バースト中は0.5秒間隔、完了後は3秒CD。
  eggLayAt?: number;
  // 抱卵型: 現在のバーストで撒いた個数(0..EGGCARRIER_BURST_COUNT)。3個で0へ戻し3秒CD。
  eggBurstCount?: number;
  // 叫喚型(screamer): 次に叫喚(溜め開始)する gameTime(ms)。初回=出現3秒後、以降10秒間隔。
  screamNextAt?: number;
  // 裏ボス専用: 被弾したクリティカルの累積回数。規定回数で「完全気絶(紫)」に移行しリセット。
  bossCritCount?: number;
  // 裏ボス専用: 完全気絶(通常敵の気絶相当)の終了 gameTime(ms)。この間は攻撃でも起きず近接フィニッシュし放題。
  bossFullStunUntil?: number;
  // 屋内ステージの固定敵が「画面外に出たら戻る」最初の定位置(スポーン座標)。
  homeX?: number;
  homeY?: number;
  // 裏ボス(mimir/jormungand)専用の状態機械(useGameLoop の専用コントローラが駆動)。
  // 通常の updateEnemies の追跡AIからは除外され、ここで動き/攻撃/帰巣を管理する。
  // トール(ステージ5)専用の追加ステート(社長指示・独自攻撃。弾もダッシュも使わない):
  //  issen-windup/issen-dash = 一閃(3秒溜め→赤ライン上のみ判定の高速移動) /
  //  tsuki-windup/tsuki = 突き(1秒停止→ダッシュ射程・幅の刺突) /
  //  harai-windup/harai = 払い(旋回中のみ・逆回転1秒+並行な赤ライン→横払い) /
  //  jump-windup/jump-attack/jump-recover = ジャンプ攻撃(遠距離から連続被弾で間合いを詰める) /
  //  counter-leap = カウンター成立時、近接距離ギリギリ外へ高速後退。
  //  backstep = 旋回距離より近づかれた時、たまに発火する短時間の後方ステップ(社長指示)。
  //  orbit-step = 旋回中(適正距離)にたまに混ぜる、接線方向への短時間ステップ(社長指示)。
  bossState?: 'chase' | 'aim-burst' | 'burst' | 'aim-radial' | 'radial' | 'skadi-ice' | 'skadi-blade' | 'dash-windup' | 'dash' | 'return' | 'laser-windup' | 'laser-fire'
    | 'issen-windup' | 'issen-dash' | 'tsuki-windup' | 'tsuki' | 'harai-windup' | 'harai' | 'jump-windup' | 'jump-attack' | 'jump-recover' | 'counter-leap' | 'backstep' | 'orbit-step';
  bossStateUntil?: number;   // 現フェーズ終了 gameTime(ms)
  bossNextActionAt?: number; // 次に特殊行動(burst/radial/dash)を抽選できる gameTime(ms)
  bossBurstLeft?: number;    // 3連発の残弾
  bossBurstNextAt?: number;  // 次の1発の gameTime(ms)
  // トール専用: 旋回方向(1=時計回り/既定 -1=逆回転)。払いの予告中だけ一時的に反転する。
  bossCircleDir?: number;
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

// 色付き個体の色(影の色)。青<紫<赤 の順に強い。距離が離れると確率で付与。
export type EnemyColorTier = 'blue' | 'purple' | 'red';

export type EnemyType =
  | 'bat'        // ubiquitous low-HP swarmer
  | 'skeleton'   // standard melee chaser
  | 'zombie'     // slow tank
  | 'plant'     // near-stationary ranged seed-spitter
  | 'ghost'     // 変異体(抱卵型): プレイヤーの周囲を周回し1秒ごとに緑卵(mine)を設置する。internal idは'ghost'据え置き
  | 'werewolf'  // mid-game fast bruiser
  | 'pumpkin'   // elite (wave events)
  | 'giantbat'  // mini-boss every ~10 minutes
  | 'reaper'    // terminal entity at 30:00
  | 'lich'      // ステージ4の新型。ゴーストの1.2倍速でプレイヤーの周囲を旋回しながら詰める
  | 'lab-zombie-1' // 研究所Lv1(通常・男女)
  | 'lab-zombie-2' // 研究所Lv2(変異・男女)
  | 'lab-zombie-3' // 研究所Lv3(巨体・パンプキン相当)
  | 'mimir'      // 裏ボス(ステージ1): 巨大な眼+ゾンビの群体「ミーミル」
  | 'jormungand' // 裏ボス(ステージ3): 巨蛇「ヨルムンガルド」。仕様は mimir と共通
  | 'skadi'      // 裏ボス(ステージ4): 氷の死王「スカジ」。仕様は他の裏ボスと共通
  | 'thor'       // 裏ボス(ステージ5): 鬼刀の武人「トール」。仕様は他の裏ボスと共通(社長提供素材)
  | 'hunter'     // ハンター変異体: 3分以降・優勢時に出現。索敵→発見→拠点まで追跡→撤退する徘徊ストーカー(専用イベント制御)
  | 'screamer';  // 変異体(叫喚型): 5分以降・同時1体。距離を保ち、溜め→叫喚で画面内の通常敵を一時強化(優先処理対象)

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
export type WeaponType = WeaponCategory | 'knife' | 'hatchet' | 'machete' | 'tactical-knife' | 'anti-mutant-knife' | 'enemy_bolt' | 'grenade' | 'trap' | 'decoy' | 'shield' | 'turret' | 'fire-knife-projectile' | 'drone-boomerang-projectile' | 'phill-bullet' | 'homing-missile' | 'skateboard';
export type SubWeaponKey = 'heavy-grenade' | 'marksman-trap' | 'striker-quick-mag' | 'striker-hunting' | 'dog' | 'katana' | 'murasame' | 'decoy' | 'shield' | 'whip' | 'alchemy' | 'turret' | 'shijin' | 'fire-knife' | 'drone-boomerang' | 'wire-anchor' | 'sage-stone' | 'homing' | 'shadow-clone';

// 分身(サブウェポン)の生成インスタンス。生成位置に固定、外見はプレイヤーと同じ(白黒)。
// その場で一定時間(5秒間・1秒ごと)自動で近接攻撃を繰り返し、時間切れ or 完全に画面外で消滅。最大1体。
export interface ShadowCloneState {
  x: number;       // 生成時のプレイヤー当たり判定 左上X(固定)
  y: number;       // 同上 Y(固定)
  width: number;   // プレイヤーと同じ当たり判定サイズ(描画/画面外判定に使用)
  height: number;
  facingLeft: boolean;            // スプライト左右反転(生成時のプレイヤー向き)
  characterClass: CharacterClass; // 立ち絵テクスチャ選択(プレイヤーと同一)
  spawnedAt: number;              // gameTime(ms)。寿命(5秒)の起点
  attacksDone: number;            // これまでに行った自動近接攻撃の回数
  nextAttackAt: number;           // 次の自動攻撃を行う gameTime(ms)
  swingAt?: number;               // 直近の近接スイング演出の起点(Date.now)。本体と同じ斬撃モーション描画に使う。
}

// 制圧イベントの拠点。4か所固定(東西南北)。captured時はHPを持ち、敵の攻撃/時間で減り、プレイヤー在内/安全地帯で回復。
export interface BaseSite {
  id: string;
  x: number;
  y: number;
  status: 'open' | 'captured';
  hp: number;                  // 0..SUPP_HP_MAX(captured時のみ意味を持つ)
  dwellMs: number;             // 制圧サークル内の滞在(open→captureの計測)
  attackerId: string | null;   // 画面内の攻撃者(敵)id。null=不在
  attackerRespawnAt: number;   // 次に攻撃者を湧かせる gameTime(撃破後30s)
  soldierFireAt: number;       // 次に軍人が攻撃者へ射撃する gameTime
  soldierIndex: number;        // 制圧順で割り当てる軍人名簿index(-1=未割当)。どの拠点でも1人目=エドガー。
  soldiers: { x: number; y: number; hx: number; hy: number }[]; // 軍人の現在位置 + 待機(home=サークル端寄り)位置
}

// 護衛軍人NPC(社長指示): スタート時にプレイヤーと同時に4人配置。HPなし。担当拠点(東西南北)へ前進し、
// 近くに敵が居れば停止して射撃、拠点サークルに10秒留まると解放(制圧)。プレイヤーの画面外では前進停止(座標のみ保持)。
export interface EscortSoldier {
  id: string;
  baseId: string;      // 担当拠点(base-0..3)
  x: number;
  y: number;
  face: number;        // 向き(描画用。1=右/-1=左)
  soldierIndex: number; // 名簿index(コールアウト/見た目)
  fireAt: number;      // 次の射撃 gameTime
  dwellMs: number;     // 担当拠点サークル内の滞在(10sで解放)
  wasSurrounded?: boolean; // 直近で「囲まれ」状態だったか(助けてもらった時セリフの遷移検知用)
  companionMs?: number;    // プレイヤーと近距離で並走している連続時間(並走時セリフ用)
}

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
  | 'gold-rush' | 'time-keeper' | 'ghost-shooter' | 'dog-run' | 'counter-master' | 'slasher'
  | 'attack-shooter' | 'runner' | 'seeker' | 'scrap-builder';

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
  ownerType?: EnemyType; // 敵弾の発射元タイプ(盾への被ダメージ算定などに使用)。
  ownerId?: string;      // 敵弾の発射元の個体ID(発射元が倒れたら在弾を消す等に使用)。
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
  shieldHitAt?: number; // 直近に耐久を削られた時刻(Date.now)。描画側の被弾シェイク/フラッシュ用(視覚のみ)。
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
  // ホーミング弾: 追尾対象の敵ID。対象が消えた場合は直進。
  targetEnemyId?: string;
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
  bossSummonAt?: number; // ボス出現の魔法陣演出を再生する Date.now(ms)。描画(pixiScene)が参照。
}

// 囲い系イベント(小イベント=短時間の強制アリーナ戦/ミニボス戦)。
// activeEvent が非nullの間は: プレイヤーを円内に閉じ込め、敵capを上げ、通常スポーナを止める。
export type ActiveEventKind = 'horde' | 'boss' | 'rescue';
export interface ActiveEvent {
  kind: ActiveEventKind; // horde=ゾンビ大量 / boss=ミニボス(giantbat) / rescue=救助ホールド
  x: number;             // 囲い中心(world)
  y: number;
  radius: number;        // 囲い半径(閉じ込め円=円コリジョン)
  startedAt: number;     // gameTime(ms)。開始直後の誤終了防止グレースに使う
  endsAt: number;        // gameTime(ms)。制限時間の保険(これを過ぎたら強制終了)
  holdMs?: number;       // rescue: プレイヤーが円内に居た累計時間(ms)。RESCUE_HOLD_NEED_MS で成功。
}

// 紅き夜: 全敵ステータス2倍・経験値2倍・画面赤染め。警告10秒→本番20秒。拠点/商人で逃げられる。
export interface RedNight {
  phase: 'warning' | 'active';
  activeAt: number;  // gameTime(ms) — 'warning' → 'active' に切り替わる時刻
  endAt: number;     // gameTime(ms) — 'active' フェーズが終わる時刻
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
  // 'equipment'=装備取得(選択肢①進化/②補完・特殊)、'scrap'=スクラップ+50(選択肢③)、
  // 'heal'=HP30%回復(①②カンスト時の代替)、'knife'=ナイフを次Tierへ強化(選択肢③の25%置換)。
  // 'weapon'/'passive'/'subWeapon' は旧仕様の残置。
  type: 'weapon' | 'passive' | 'subWeapon' | 'equipment' | 'scrap' | 'heal' | 'knife';
  weaponType?: WeaponType;
  passiveType?: PassiveType;
  subWeaponKey?: SubWeaponKey;
  equipDefId?: string; // type==='equipment' のとき装備定義ID(data/equipment.ts)
  knifeKey?: string;   // type==='knife' のとき置換する次Tierナイフの CATALOG キー
  level: number;       // 装備=ランク(特殊=0)、scrap=獲得量、knife=次Tier
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
  damageTaken: number;     // 被弾総量(survivalScore用)
  meleeFinishers: number;  // 近接フィニッシュ(KILL!)回数(finisherScore用)
  eliteKills: number;      // エリート(pumpkin)撃破数
  bossKills: number;       // ボス(giantbat)撃破数
  maxAreaReached: number;  // PACING_REDESIGN.mdバッチ2(計測): ラン中に到達した最深エリアindex(0-4)。リザルト表示用。
  // PACING_PUZZLE.md §5.17 M14: ラン中に到達した最深距離(px・原点から)。maxAreaReachedはindexのみ
  // なので、境界までの残り距離("あと◯m")や自己最深比較には生の距離が要る。
  maxDepthDist: number;
  // PACING_PUZZLE.md §5.17 M14: ラン中に到達した最高ランク(1-7・七つの大罪)。リザルト「到達譜」用。
  maxRankReached: number;
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
      // Optional callout background tint (両サイドフェードの色背景。Counter=青/KILL=赤等)。指定時は縁取りを外す。
      bg?: number;
      // Optional: このms分は満alphaを保持してからフェード開始(未指定/0=従来どおり生成直後からフェード)。
      // KILL/カウンターのスローの「一番遅い」区間と文字の見え方を合わせるために追加。
      holdMs?: number;
    }
  | {
      // 一枚絵のマーク表示(例: 刀フィニッシュの習字「斬」)。pop-in→保持→フェード。
      kind: 'image';
      id: string;
      x: number; y: number;
      createdAt: number;
      duration: number;
      texture: string;     // pixiTextures の論理名
      scale?: number;      // 表示スケール基準
      color?: string;      // 任意tint(未指定=素のまま)
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
      // 銃弾ヒット時、被弾敵の背中側(=弾の出口方向)へ生やす火の破裂(2コマ flipbook の立ち絵)。
      // angle=噴射方向(rad・+x基準。素材は右向き)。len=表示する炎の長さ(px)。anchorは元の左中央(根元)。
      kind: 'firejet';
      id: string;
      x: number; y: number;
      angle: number;
      len: number;
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
      face?: number;          // 斬撃の向き(1=右向き=左下→右上 / -1=左向き=反転)。未指定=1。
    };
