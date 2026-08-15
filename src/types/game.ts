// **型のみ**のimport(実行時importは発生しない=このファイルの「値を持ち込まない」方針は維持)。
// GHOST-SUBS-FINAL(v0.25.2563): 守護霊が主語ごとに持つサブの状態は「プレイヤーと同じ型」でなければ
// ならない(§2.11追補ドクトリン)。形を書き写すと必ずズレるので、定義元(依存ゼロの純関数モジュール)を
// そのまま指す。utils/molotov.ts・utils/firstAidKit.ts はどちらも import を1つも持たない=循環しない。
import type { MolotovCycleState } from '../utils/molotov';
import type { FirstAidKitState } from '../utils/firstAidKit';
import type { AvatarId } from '../data/avatars'; // アバターシステム(試験・第1弾)。依存ゼロの純データモジュール(循環しない)。

// Game state types
export type GameState = 'title' | 'menu' | 'loading' | 'playing' | 'paused' | 'gameOver' | 'victory' | 'returned' | 'ending';

// Character class types
export type CharacterClass = 'warrior' | 'mage' | 'rogue' | 'necromancer';

// ステージ開始時の会話イベント1行。speaker: null=通信 / '__voice__'=生存者の声 / '__radio__'=無線ノイズの間 /
// '__class__'=選択中の職業名。ミッションごとに内容/有無が変わる(フリーミッションは空=会話なし)。
export interface IntroLine { speaker: string | null; text: string; holdMs?: number }


/**
 * 刀(一閃)/ワイヤーアンカーの「ロコモーション上書き」状態機械の入れ物。
 * BOT_AND_GHOST.md §2.11補足のドクトリン「写すな、共通化しろ」+ research/GHOST_PARITY_LEDGER.md
 * 裁定2(刀/ワイヤー=共有方式)に従い、**プレイヤーと守護霊が同じ状態を持つ**ための共通型として
 * 切り出した(値・意味・フィールド名は Player に直書きされていた時から一切変えていない)。
 * プレイヤーは Player の一部として直接持ち、守護霊は Summon.ghostDash に持つ。
 * 読み書きの共通部品は src/utils/dashLocomotion.ts。
 */
export interface DashLocomotionState {
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
  // スラム発動時(triggerWireAnchorの刺し確定時点)のプレイヤー中心座標。ホップ(下記)の
  // 「スラム起点へ戻る向き」の計算に使う(DEVELOPMENT_LOG v0.25.2487)。
  wireSlamFromX: number;
  wireSlamFromY: number;
  // スラム後ジャンプ離脱(ホップ): 斬り下ろし対象が生き残った(=実質ボス)時だけ、既存の着地処理
  // (斬り下ろし/Lv3爆撃/強制ノックバック)を終えた後に安全圏へ短くホップする(裁定=
  // research/COUNTER_CRIT_LEDGER.md §8)。wireDashUntilとは別枠の専用ミニ移動
  // (movePlayerのwireHopping分岐)。wireHopUntil=0はホップ中でない。
  wireHopUntil: number;
  wireHopTargetX: number;
  wireHopTargetY: number;
  wireHopSpeed: number; // ホップ移動速度(px/s。startWireHopで距離/WIRE_HOP_MSから算出)
}

// Player types
export interface Player extends DashLocomotionState {
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
  /**
   * この吹き飛びの**持続時間(ms)**。未指定=`PLAYER_KNOCKBACK_MS`(従来どおり)。
   * v0.25.2653: 技ごとに押し量を変えられるようにしたので、減衰の割り算もこの値で行う
   * ——ここを共通定数のままにすると、長い吹き飛びで**減衰率が1を超えて初速が跳ね上がる**。
   */
  knockbackMs?: number;
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
  // 救急鞄スキル発動演出用タイムスタンプ(Date.now)。描画のみ=払い出しの瞬間に「振り抜きポーズ+鞄を掲げる」
  // 一拍の起点(社長指示v0.25.1656)。0=未発動。判定・射程・払い出しロジックには不干渉(renderer が読むだけ)。
  firstAidPoseAt: number;
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
  slasherChainReadyAt: number; // スラッシャー: 次のチェーン攻撃が撃てる realGameTime(slow-mo非依存。0=非アクティブ)
  slasherStrikeStep: number;   // スラッシャー: 既に出した追撃回数(0..2)
  slasherReach: number;        // スラッシャー: 追撃に使う近接射程(初撃時の射程を記録=溜め延長が消費されても追撃は伸びたまま。0=未設定)
  slasherQueuedTap: boolean;   // スラッシャー: チェーンCD中の先行入力予約(CD明けに自動発動・v0.25.3254)
  knifeComboCount: number;     // ナイフマスター: 近接ダメージコンボ数
  knifeComboUntil: number;     // ナイフマスター: コンボ持続(gameTime)
  benkeiBuffUntil: number;     // 弁慶: crit率バフ終了(gameTime)
  benkeiCdUntil: number;       // 弁慶: 再発動CD(gameTime)
  // 社長指示v0.25.3303 カウンターマスター覚醒(Lv3): カウンター成立後3秒の全攻撃+30%バフ終了(gameTime)。
  // optional=疑似Player(守護霊ビルド)や既存スナップショットに波及させないため(未設定=バフ無し)。
  counterMasterBuffUntil?: number;
  seekerUntil: number;         // シーカー: 半透明化＋通常敵から狙われない 効果終了(gameTime)
  seekerCdUntil: number;       // シーカー: 再発動CD(gameTime)
  // SKILL_BUILD_REDESIGN.md §23: 消費カード5種の発動終了時刻(gameTime)。取得で即座に gameTime+60000
  // へセット(温存不可・延長なし=再取得しても常に60秒に固定)。同時に複数種類が併存可(各自が
  // ノーマル枠を1つ占有)。ゴースト(buildPseudoPlayer)へは持ち越さない(utils/playerBuild.ts参照)。
  consumableScrapUntil: number;      // スクラップブースト: スクラップ入手+50%
  consumableAttackUntil: number;     // アタックドーピング: 攻撃力+20%
  consumableSpeedUntil: number;      // スピードブースト: 移動速度+15%
  consumableXpUntil: number;         // 経験値ブースト: 経験値×1.5
  consumableProtectionUntil: number; // プロテクション: 被ダメージ-30%
  // 枠光(SKILL_BUILD_REDESIGN.md §21 B5・視覚専用): オーバークロックのCDリセットprocが立った
  // 時刻+800ms(gameTime基準)。判定はsrc/utils/frameLight.tsのoverclockFrameLitへ渡すだけで、
  // この値自体はゲームプレイ(判定・数値)に一切影響しない。既定0。
  overclockLightUntil: number;
  // キャラ固有スキル(characterClass で自動有効。装備スキル枠は消費しない)の状態フィールド。
  scavengerBuffUntil: number;   // スカベンジャー(necromancer): 弾薬取得で銃ダメ+10%(gameTime)
  marksmanMovingSince: number;  // マークスマン(mage): 連続移動の開始gameTime。0=停止中
  heavyGunnerExpBuffUntil: number; // ヘビーガンナー(warrior): 同一攻撃2体以上で爆発範囲+10%(gameTime)
  // MOVEMENT_REWORK.md 仕様1: 速度ボーナスのランプ(src/utils/speedRamp.ts の SpeedRampState を
  // ここへ焼き込む)。movePlayer が毎tick更新。プレイヤーの「入力方向への連続移動」を追跡する
  // marksmanMovingSince と同じ理由でPlayerオブジェクト側に置く(resetGameで一括初期化される)。
  speedRampSustainMs: number;
  speedRampDirX: number;
  speedRampDirY: number;
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
  // ※刀(一閃)の katanaDash*/katanaRecoveryUntil は DashLocomotionState へ移設(守護霊と共有)。
  // 四神舞フリック=盾バッシュ風スライド。shijinSlideUntil が未来の間、入力を無視して
  // shijinSlideDir 方向へ一定速で滑る(movePlayer がダッシュと同様に上書き)。
  shijinSlideUntil: number;
  shijinSlideDirX: number;
  shijinSlideDirY: number;
  // スケーター: skaterStopUntil が未来の間は入力を無視して残速度を
  // 素早く減衰させる(ほんの少し慣性のある急停止)。
  skaterStopUntil: number;
  // スケーター新仕様(社長指示): ダブルタップで「乗車」。乗車中だけ移動3倍＋強慣性。指離しで降車し、
  // 1秒以上乗っていれば進行方向へスケボーを投擲(当たると前方バッシュ=衝撃波+強制ノックバック)。1秒未満は消えるだけ。
  skaterRiding: boolean;     // 乗車中か(=3倍/強慣性を適用)。
  skaterRideStartAt: number; // 乗車開始 gameTime(ms)。降車時に1秒以上か判定。
  // ※ワイヤーアンカーの wire* 状態は DashLocomotionState へ移設(守護霊と共有)。
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
  // SKILL_BUILD_REDESIGN.md §28(B7): 血の履帯(blood-treads)の次の棘設置が許可されるgameTime。
  // molotovのcycle/cooldown系と同じ「本人固定」の状態フィールド(0=即設置可)。
  bloodTreadNextAt: number;
}

/**
 * 計測時ビルドの写し(BOT_AND_GHOST.md §2.11 裁定1「攻撃力の基準=計測時のステータス・ビルドを
 * そのまま再現」)。PlayerProfile.snapshot / BossStyleSlot.snapshot / Summon.ghostBuild が持つ。
 * **旧snapshot(maxHealth/speed/levelの3項目)の上位互換**=先頭3つは必須、以降は全て任意
 * (旧プロファイルには無い=欠損可。欠損時の挙動は src/utils/playerBuild.ts のフォールバック規則)。
 * 純データ(localStorageへJSONで載る)なので関数・クラスは入れない。
 */
export interface PlayerBuildSnapshot {
  maxHealth: number;
  speed: number;
  level: number;
  // ---- v0.25.2514(GHOST-BUILD-1)で追加。全て任意=後方互換 ----
  /** 所持銃の武器key(weapons順・近接は含めない)。createWeaponで復元できる安定キー。 */
  gunKeys?: string[];
  /** アクティブ銃(自動射撃していた銃)のkey。 */
  activeGunKey?: string;
  /** 近接武器のkey。 */
  meleeKey?: string;
  skills?: SkillKey[];
  skillLevels?: Partial<Record<SkillKey, number>>;
  equipment?: EquipLoadout;
  /** 集計済みの装備効果(再計算不要でそのまま使えるようにビルドごと保存する)。 */
  equipBonus?: EquipBonus;
  /** レベルアップで積んだクリ率(武器・装備とは別枠の本体値)。 */
  critChance?: number;
  /** レベルアップで積んだ全銃共通の装填数加算。 */
  magBonus?: number;
  /** レベルアップで積んだリロード時間倍率(<1ほど速い)。 */
  reloadMult?: number;
  subWeapons?: SubWeaponKey[];
  subWeaponLevels?: Partial<Record<SubWeaponKey, number>>;
  /** 計測時のクラス(キャラ固有スキルの評価に使う。絵の選択は従来どおりPlayerProfile.srcClass)。 */
  characterClass?: CharacterClass;
  // ---- 裁定4(PHILL): 撃破ラン中の発射数とヘッドショット数(率はrateへ丸めて保存) ----
  phillShots?: number;
  phillHeadshots?: number;
  /** phillHeadshots / phillShots(0..1)。母数0なら未記録=undefined。 */
  phillHeadshotRate?: number;
  /**
   * v0.25.3271(社長GO「守護霊へのアバター記録」): 記録時に選択していたアバター(視覚のみ・
   * src/data/avatars.ts)。無選択=null。欠損(旧データ)は消費側で null 扱い(非表示・クラッシュなし)。
   */
  avatarId?: AvatarId | null;
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
  // V1(3)(FX_GAP_LEDGER.md・社長指示): 接触ダメージが**プレイヤーに実際に入った瞬間**の打刻。
  // 描画専用(レンダラが~180msの「前のめり」変形=被弾しなりの逆位相に使う)。判定・ダメージ・
  // 移動には一切使わない。時計は lastHit と同じ Date.now() 基準。Dir は敵→プレイヤーの角度(rad)。
  lastContactAttackAt?: number;
  lastContactAttackDir?: number;
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
  /**
   * KILL吹き飛び(死体・SKILL_BUILD_REDESIGN.md §26)。KILLされた通常敵(ボス/ネームド/クエスト
   * 対象=getsDramaticDeath系は対象外)を即消滅させず、この時刻(Date.now()基準)まで「死体」として
   * 残す。死体は knockbackVx/Vy/knockbackUntil で攻撃者→敵方向へ50px吹き飛びながらKBスライドのみ
   * 適用される(updateEnemies)。この間、通常のAI/攻撃/索敵/被弾/照準対象選定からは完全に除外する
   * (isCorpse=corpseUntil!==undefinedが唯一の判定)。期限切れで配列から除去される。
   * パニッシャー(スキル)の巻き込み弾(mover)にはなる=死体自身は被害者にならない。
   */
  corpseUntil?: number;
  /**
   * 死体の発射起点(v0.25.3272)。死体の飛びはスローモーション(deltaTime縮小)の影響を受けないよう
   * 実時間の解析積分(起点+方向×距離×ease-out進捗)で描くため、発射時の位置を固定で持つ。
   * KILL!フィニッシュのスロー中に飛距離が縮んで見えた不具合の恒久対策。
   */
  corpseStartX?: number;
  corpseStartY?: number;
  /**
   * v0.25.2607(社長裁定): **押し道具(鞭・シールドバッシュ)による押し**の有効期限。
   * ボスは通常の殴り/弾では押されず、このフラグが立っている間だけ押される(updateEnemiesの
   * ノックバック適用ガード)。通常敵はこのフラグと無関係に従来どおり押される。
   * 時刻で自然に切れるので解除処理は不要(押す側の2箇所が knockbackUntil と同じ値を入れるだけ)。
   */
  knockbackShoveUntil?: number;
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
  // 二人組クエストの強制目標「特定変異種」個体(EVENT_QUEST_DESIGN.md)。宿敵と同じ見た目強化
  // (金tint+名前+倍率)だが宿敵システム(namedFoe)とは別管理=討伐処理を混線させない。
  // カリング/リサイクル/イベント一掃の対象外(討伐が条件のため消えてはいけない)。
  questTarget?: boolean;
  questName?: string; // questTarget の頭上表示名(宿敵と同じ神話名プールから抽選)
  // ★finishKillOnly(旧§5.21-追補4「フィニッシュ以外では死なない」)は v0.25.3329 で削除
  // (v0.25.1574のゲート1台本改定以降どこも設定しておらず死んだ旗だった。社長指示「使ってないはずなので削除」)。
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
  //  giantbat(M51新スクリプト・PACING_PUZZLE.md §6.26): 'g-' 接頭辞の専用値を使い、他タイプの
  //  windup/charge/crouch/jump/recover とは別名にして混線を避ける(?giantscript=0で旧値へ戻す)。
  //   g-stomp-windup/g-stomp-recover = 踏み鳴らし(密着)
  //   g-sweep-windup/g-sweep-active/g-sweep-recover = 薙ぎ払い(Phase2限定・近)
  //   g-jump-windup/g-jump-air/g-jump-recover = 飛び掛かり(改訂)
  //   g-dash-windup/g-dash-charge/g-dash-recover = 突進(改訂)
  //   g-bolt-windup/g-bolt-recover = 咆哮弾(改訂)
  //  M66(PACING_PUZZLE.md §6.26-11・stage-1/3/4/5限定): ステージ固有の独自技(Phase1〜)+大技(Phase2〜)。
  //   g-bite-windup/g-bite-hold/g-bite-active/g-bite-recover     = 噛みつき(stage-1・独自技。holdは
  //     固定350msの"間"=学習装置①。帯を出したまま静止し続ける専用フェーズ)
  //   g-slam-windup/g-slam-active/g-slam-recover                 = のしかかり(stage-1・大技)
  //   g-glide-windup/g-glide-active/g-glide-recover               = 滑空薙ぎ(stage-3・独自技。二撃目は
  //     状態を持たずgiantDelayedHitsの遅延キューで管理=学習装置①)
  //   g-dive-windup/g-dive-recover                                 = 急降下(stage-3・大技。windup中は
  //     本体を場外へ退避=「無敵ではなく居ない」。着弾は瞬時)
  //   g-quad-windup/g-quad-charge/g-quad-breath-windup/
  //   g-quad-breath-active/g-quad-recover                          = 三連突進→氷の横薙ぎ(stage-4・独自技。
  //     windup/chargeを3回反復=学習装置③。gQuadIndexで周回)
  //   g-nova-windup/g-nova-active/g-nova-recover                   = 氷結波(stage-4・大技。輪が広がる
  //     継続判定=giantActiveHitで1回だけ命中させる)
  //   g-wing-windup/g-wing-active/g-wing-recover                   = 翼撃(stage-5・独自技。三拍目は
  //     giantDelayedHitsの遅延キューで管理=学習装置①)
  //   g-sweepbeam-windup/g-sweepbeam-active/g-sweepbeam-recover     = 掃射(stage-5・大技。回転帯の
  //     継続判定=giantActiveHitで1回だけ命中させる)
  //  M67(PACING_PUZZLE.md §6.26-12・stage-7のグレン限定): グレン専用の新技4つ。
  //   g-talon-windup/g-talon-recover                               = 血の爪痕(talon・Phase1〜。
  //     3本の爪痕はgiantDelayedHitsの遅延キューへwindup開始と同時に積む=置いた瞬間0ダメージ、
  //     固定900ms後に爆ぜる。windupにはactiveが無い=recoverへ直結)
  //   g-boon-windup/g-boon-recover                                 = 血の弧(boon・Phase1〜。5個の
  //     T5遅延円もwindup開始と同時に積む。爆ぜた後はfloorUntilまで床として残り、接触ダメージが続く
  //     =combatTick.tsのapplyGlenFloorDamageが毎フレーム判定)
  //   g-reach-windup/g-reach-recover                                = 伸びる触手(reach・Phase1〜。
  //     immediate単発カプセルヒット=bite/slamと同型。activeはactive時間の見た目のみ)
  //   g-nihil-chant1/g-nihil-chant2/g-nihil-chant3/g-nihil-recover  = 虚無の三唱(nihil・大技・
  //     Phase2=HP60%〜。3つの明示ステートを固定シーケンスで遷移=学習点④「数える」。予告SEの
  //     エッジ検知(aiPhase文字列の変化)がそのまま3回のパルスになる。T5大円(半径260)は
  //     chant1開始時にgiantDelayedHitsへ1件だけ積み、fireAt=3唱ぶんの合計時間で自動的に
  //     chant3終了と同時に爆ぜる)
  aiPhase?: 'windup' | 'charge' | 'crouch' | 'jump' | 'recover' | 'zpause' | 'zrush' | 'scream'
    | 'g-stomp-windup' | 'g-stomp-recover'
    | 'g-sweep-windup' | 'g-sweep-active' | 'g-sweep-recover'
    | 'g-jump-windup' | 'g-jump-air' | 'g-jump-recover'
    | 'g-dash-windup' | 'g-dash-charge' | 'g-dash-recover'
    | 'g-bolt-windup' | 'g-bolt-burst' | 'g-bolt-recover'
    | 'g-trijump-windup' | 'g-trijump-air' | 'g-trijump-recover'
    | 'g-bite-windup' | 'g-bite-hold' | 'g-bite-active' | 'g-bite-recover'
    | 'g-slam-windup' | 'g-slam-active' | 'g-slam-recover'
    | 'g-glide-windup' | 'g-glide-active' | 'g-glide-recover'
    | 'g-dive-windup' | 'g-dive-recover'
    | 'g-quad-windup' | 'g-quad-charge' | 'g-quad-breath-windup' | 'g-quad-breath-active' | 'g-quad-recover'
    | 'g-nova-windup' | 'g-nova-active' | 'g-nova-recover'
    | 'g-wing-windup' | 'g-wing-active' | 'g-wing-recover'
    // 三連射(stage-5の固有技・v0.25.2939)。判定は旧・翼撃と同一で、絵だけが3挺の銃になっている。
    | 'g-trishot-windup' | 'g-trishot-active' | 'g-trishot-recover'
    | 'g-sweepbeam-windup' | 'g-sweepbeam-active' | 'g-sweepbeam-recover'
    | 'g-talon-windup' | 'g-talon-recover'
    | 'g-boon-windup' | 'g-boon-recover'
    | 'g-reach-windup' | 'g-reach-recover' // v0.25.3159b: activeは廃止(複数本を同時に回すため)
    | 'g-nihil-chant1' | 'g-nihil-chant2' | 'g-nihil-chant3' | 'g-nihil-recover'
    // v0.25.3139(社長指示): グレン第二形態の通常技「尻尾の叩きつけ→弾の連射」。
    // 叩きつけの射程は**尻尾(連結パーツ)の長さそのもの**=パーツが減れば短くなる(見たまま=判定)。
    | 'g-tailslam-windup' | 'g-tailslam-active' | 'g-tailslam-volley' | 'g-tailslam-recover';
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
  // BOT_AND_GHOST.md G2/§3裁定: ゴースト召喚成立の瞬間に health/maxHealth へ GHOST_BOSS_HP_MULT(1.6)を
  // 1回だけ適用したか(二重適用防止フラグ)。ゴーストが死んでも戻さない=trueのまま据え置く。
  ghostHpBoosted?: boolean;
  aggroRange?: number;
  fixed?: boolean;
  // idol専用(§6.28-20・社長指示)の設置時の向き。true=水平ミラーして左向きで描画。既存の汎用
  // facingLeft機構は無い(ShadowCloneStateの同名フィールドとは別物=プレイヤー分身の描画専用)ため、
  // 「無ければidol専用に最小限を足す」方針でここへ足す。設置時に決定論的に算出して固定し、以後は
  // 更新しない(戦闘中に反転はしない=CLAUDE.md「Visual vs. hitbox」= 描画のみ・当たり判定は不変)。
  idolFacingLeft?: boolean;
  // ジャイアントバットの行動パターン別クールダウン(gameTime ms)。弾(fire profile)とは別系統。
  // (?giantscript=0の旧スクリプト専用。新スクリプトは下の gStomp/gSweep/gJump/gDash/gBoltReadyAt を使う)。
  gbJumpReadyAt?: number;
  gbDashReadyAt?: number;
  // ジャイアント新スクリプト(M51)専用: 技ごとの個別クールダウン(gameTime ms)。
  gStompReadyAt?: number;
  gSweepReadyAt?: number;
  gJumpReadyAt?: number;
  gDashReadyAt?: number;
  gBoltReadyAt?: number;
  // ジャイアント新スクリプト(M51)専用: 現在のフェーズ(HP60%以下=2)。フェーズ移行の瞬間だけ
  // giantPhaseFlashUntil までHPバーを点滅させる(合図の本体・社長裁定6.26-9 #4)。
  // M60(§6.28-11): storyBoss個体(isStoryBoss)だけHP30%以下でPhase3に到達しうる。通常城ボスは
  // isStoryBossがundefinedのままなので、gameStore.ts側の分岐によりこれまでどおり1|2までしか出ない。
  giantPhase?: 1 | 2 | 3;
  giantPhaseFlashUntil?: number;
  // M60(PACING_PUZZLE.md §6.28-11): この個体がstoryBossとしてスポーンされたか(グレン=stage-7 /
  // 未確認変異体=stage-ex1。spawnEnemyAt('giantbat',...)直後にuseGameLoop.tsがセットする)。
  // 通常ステージ(1〜6)の城ボスにはこのフィールド自体が付与されない(undefinedのまま)ので、
  // gameStore.ts側のジャイアント新スクリプトはisStoryBoss===trueの個体だけをPhase3対象にできる。
  isStoryBoss?: boolean;
  // isStoryBoss===trueの時だけ意味を持つ: Phase3の連携確率だけがグレンとEXで異なる(60%/70%)ため、
  // どちらの個体かをここで区別する(社長裁定6.28-11「EXはクリア後コンテンツなので60%→70%」)。
  storyBossVariant?: 'stage-7' | 'stage-ex1';
  // M65(社長指示): ジャイアント新スクリプトの踏み鳴らし/飛び掛かりの「実際に使うAoE半径」を、
  // 各技の溜め開始(windup)時にステージ別倍率(giantStageRangeMult)込みで確定してここへ持たせる。
  // シミュ側の命中判定(pumpkinBlasts)・描画側の赤円(pixiScene.ts)・レベルアップ保留判定
  // (isPlayerInAttackTelegraph)の3箇所が全てこのフィールドを読むことで、計算式を1つに保ち
  // 「赤い円より広い範囲で当たる」ドリフトを構造的に防ぐ(未設定時は無倍率の生半径にフォールバック)。
  // 障害物回避の進行状態(社長指示v0.25.2415)。判定は src/utils/enemyMotion.ts の純関数 stepAvoid が持つ。
  // 「進めない→横へ避ける→反対側→諦める」の3段階をこの1フィールドで持ち回る。
  // ボスがクリティカルで「痺れる」代わりに**動きが半減**する窓の終了時刻(gameTime基準・v0.25.2422)。
  // 通常敵の stunUntil(完全停止)とは別概念。ボス以外には設定されない。
  bossSlowUntil?: number;
  // 連続ジャンプ(グレン専用・v0.25.2430)。3つの着地点を**溜め開始でまとめてロック**して持ち回る。
  // 平たい配列 [x1,y1,x2,y2,x3,y3](中心座標)。判定側と描画側が同じ配列を読む=図形と判定が必ず一致する。
  gTriJumpPts?: number[];
  gTriJumpIdx?: number; // いま何発目へ飛んでいるか(0始まり)
  // 咆哮弾のパターン(社長裁定v0.25.2423「AとBを2パターンとして入れよう」)。溜め開始で抽選して固定する。
  //  'fan'   = 扇状に同時発射(Phase2で本数増)。真っ直ぐ逃げても外側の弾に当たる=横取りの位置取りを強制。
  //  'burst' = 同じ方向へ短間隔の3連射。横移動なら全部避けられる=「止まると死ぬ」圧に特化。
  gBoltPattern?: 'fan' | 'burst';
  gBoltShot?: number; // burstの何発目まで撃ったか(1始まり)
  avoid?: import('../utils/enemyMotion').AvoidState;
  gStompRadius?: number;
  gJumpRadius?: number;
  // M66(PACING_PUZZLE.md §6.26-11・stage-1/3/4/5限定)。
  // 三連突進(quaddash)の何回目か(0始まり・固定3回で終了=giantQuadDashComplete)。
  gQuadIndex?: number;
  // v0.25.3126(社長指示「触手は1秒置きにターゲティングしなおして発動3連発」): 触手の何発目か(0始まり)。
  // 三連突進(gQuadIndex)と同じ作法=1つの技の中で反復する回数を敵が持ち回る。
  gReachIndex?: number;
  /**
   * v0.25.3159b(社長指示「触手2.3秒のところで次の触手発動(つまり少し被る)」):
   * **同時に存在する触手**の配列。溜め(2.6秒)より短い間隔(2.3秒)で次を出すため、
   * 1本ずつの状態機械では表現できなくなった=技の間だけボスが複数本を持ち回る。
   * t0=この触手が生えた gameTime / a*=追尾照準の位置と速度 / idx=何本目 / fired=判定を出し終えたか。
   * ※`aiFromX/aiTargetX` は**最新の1本**を写す(既存の描画・ゴースト・記録がそこを読むため)。
   */
  gReachShots?: { t0: number; ax: number; ay: number; avx: number; avy: number; idx: number; fired?: boolean }[];
  // v0.25.3145(社長指示「触手、ミーミルレーザーと同じく切り返しで避ける3連技に変更」):
  // 溜め中に**慣性を持って追いかけてくる照準**の位置と速度。ミーミルのレーザーと同じ
  // `stepLaserAim`(mimirLaserTrack.ts)で更新する=避け方の文法を1本に保つ。
  // ※これは「狙い点」で、赤い帯の終点(aiTargetX/Y)はここから毎tick導出する(絵と判定は同じ座標)。
  gReachAimX?: number;
  gReachAimY?: number;
  gReachAimVX?: number;
  gReachAimVY?: number;
  // v0.25.3139: 尻尾叩きつけ後の弾連射で「あと何回撃つか」。0で連射終了→硬直へ。
  gTailVolleyLeft?: number;
  gTailVolleyAt?: number; // 次の斉射の gameTime
  // v0.25.3075: 滑空(glide)の**実際の飛び出し位置**(実行に入った瞬間の座標)。
  // aiFromX/Y は溜め開始でロックした「予告の線の始点」で、溜め中の後退りぶんズレる。
  // 移動をaiFromから始めると飛び出しの瞬間に前へワープする(=カクつきの主因)ため、
  // 見た目の移動だけこの実位置から始める(予告の線・当たり判定のカプセルはaiFromのまま=不変)。
  gGlideFromX?: number;
  gGlideFromY?: number;
  // ステージ固有技(独自技/大技)ごとの個別クールダウン(gStomp/gSweepReadyAt等と同じ作法。
  // 1フィールドへ集約=8個別フィールドを増やさない)。
  gStageReadyAt?: Partial<Record<'bite' | 'slam' | 'glide' | 'dive' | 'quaddash' | 'nova' | 'wing' | 'sweepbeam' | 'trishot', number>>;  // trishot: v0.25.3046(v2939の改名時にキー追加漏れ=三連射が一度も抽選されなかった真因)
  // M67(PACING_PUZZLE.md §6.26-12・stage-7のグレン限定)専用: 血の爪痕/血の弧/伸びる触手/虚無の三唱の
  // 個別クールダウン(gStageReadyAtと同じ作法で別フィールドに分離=通常城ボスのgStageReadyAtには
  // 一切書き込まない=互いに独立)。
  gGlenReadyAt?: Partial<Record<'talon' | 'boon' | 'reach' | 'nihil' | 'trijump' | 'tailslam', number>>;
  // v0.25.3029(社長裁定「二体」): stage-7ラスボスの形態。1=第一形態(倒すと討伐アテンションの後に
  // 形態2が湧く・ミッション進行は確定しない)/2=第二形態(変身後の姿+連結パーツ+胴体弾。
  // 倒すと従来どおりクリア)。stage-7のstoryBossスポーン経路でのみ立つ(EX/イベント産は undefined)。
  glenForm?: 1 | 2;
  // v0.25.3027(社長裁定): グレン第二形態の胴体弾(連結パーツから±45°のV字斉射)の最終発射時刻
  // (gameTime基準)。スポーン時に種付けして初回はCD後(監査指摘=出現演出と16発の同時発火防止)。
  glenVolleyAt?: number;
  // 遅延起爆の待ち行列(固定遅延=学習装置①。乱数にしない)。滑空の二撃目(1件)/三連突進が残す氷
  // (3件)/翼撃の三拍目(1件)で共用する汎用キュー。ice=trueなら着弾FXが青版(既存pumpkinBlastsの
  // ice:trueをそのまま流用)。capsuleがあれば帯(翼撃三拍目)、無ければ円(それ以外)として起爆する。
  // M67追加: burst=一度この一撃(pumpkinBlasts)を消化済みか(floorUntil付きエントリを即削除せず
  // 保持するための多重発火防止フラグ)。floorUntil=このgameTimeまでは爆発後も「床」として保持し
  // 続ける(血の弧=boon専用。未設定なら従来どおりfireAt直後に削除=既存3用途は無改変)。
  // G4a追加: moveKey=この遅延起爆がどの技のものか(BOT_AND_GHOST.md §2.9 技への反応表の計測タグ。
  // **記録専用**=起爆処理はこの値を判定に使わず、pumpkinBlasts経由でdamagePlayerのdamageSourceMoveへ
  // 渡すだけ。未設定=従来どおり)。
  giantDelayedHits?: { x: number; y: number; radius: number; bornAt: number; fireAt: number; ice?: boolean;
    capsule?: { fx: number; fy: number; tx: number; ty: number; halfWidth: number };
    burst?: boolean; floorUntil?: number; moveKey?: string;
    // v0.25.3126(社長指示「三唱のダメージを100に」): この遅延起爆だけダメージを上書きする。
    // 未設定=従来どおり enemy.damage(=技ごとに変えていなかった旧仕様)。
    damage?: number;
    // v0.25.3079: 爆発の一瞬前の「ピカッ」を1回だけ出すための印(社長指示)。
    flashed?: boolean }[];
  // 継続判定技(氷結波の輪/三連突進の吐息/掃射)が「このactiveフェーズで既に1回命中させたか」。
  // 回転/拡大する図形は毎フレーム自己検出するため、多重ヒットを防ぐ1回きりフラグ(windup開始でfalseへ)。
  giantActiveHit?: boolean;
  // ハンター変異体: 撤退中フラグ。true の間は updateEnemies の通常追跡から除外し、専用イベント
  // コントローラ(useGameLoop)がプレイヤーから離れる方向へ移動させ、画面外で消滅させる。
  hunterFleeing?: boolean;
  // ハンター変異体: 検知済み(プレイヤーを視界に捉えた=被監視 or 追跡中)。true の間だけ方角矢印を出す。
  hunterAlerted?: boolean;
  // ハンター変異体: 索敵中(dormant)の徘徊ウェイポイント状態(src/utils/hunterWander.ts参照)。
  hunterWanderTargetX?: number;
  hunterWanderTargetY?: number;
  hunterWanderNextAt?: number;
  // ハンター変異体: 索敵タイムアウトで立ち去る際のフェードアウト開始 gameTime。設定中は静止し、
  // HUNTER_LEAVE_FADE_MS 経過で消滅する(useGameLoop.ts)。描画側(pixiScene.ts)はこれを基にαを下げる。
  hunterLeavingAt?: number;
  // パニッシャーで「巻き込まれて」ノックバックした敵の印。これ以上は連鎖させない(1次まで)。
  punisherHopped?: boolean;
  // 抱卵型(旧ghost): 次に緑卵を撒く gameTime(ms)。バースト中は0.5秒間隔、完了後は3秒CD。
  eggLayAt?: number;
  // 抱卵型: 現在のバーストで撒いた個数(0..EGGCARRIER_BURST_COUNT)。3個で0へ戻し3秒CD。
  eggBurstCount?: number;
  // 叫喚型(screamer): 次に叫喚(溜め開始)する gameTime(ms)。初回=出現3秒後、以降10秒間隔。
  screamNextAt?: number;
  // ボス共通の体勢値。未設定時はボス種別ごとの最大値として扱う。
  bossPosture?: number;
  bossPostureRecoveryCap?: number;
  bossPostureLastDamageAt?: number;
  bossPostureLockUntil?: number;
  bossBreakRewardRemaining?: number;
  // 体勢崩し(紫)の終了 gameTime(ms)。
  bossFullStunUntil?: number;
  // 屋内ステージの固定敵が「画面外に出たら戻る」最初の定位置(スポーン座標)。
  homeX?: number;
  homeY?: number;
  // ステージ2(研究所)専用: 起床中のlab-zombieが「見えていない」(LOS遮断 or 距離>
  // LAB_LOSE_SIGHT_RANGE)状態になり始めた gameTime(ms)。見えている間は undefined(タイマーなし)。
  // 1000ms 継続で dormant=true に戻る(src/utils/labStealth.ts の evaluateLabLoseSight が判定)。
  losLostSince?: number;
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
  // ミゲル(ゲート2ボス)専用の追加ステート(2発コンボ=横払い→縦払い。各々が独立した溜め+実行):
  //  tate-windup = 縦払いの溜め(横払いharai-windupと同仕様=静止・赤ライン予告・カウンター可)。
  //  tate = 縦払いの実行(プレイヤー位置に画面縦のラインをロック。当たり判定はharaiと共通=向きのみ縦)。
  // PACING_PUZZLE.md §6.28(バッチM53/M55/M57/M61/M62/M63・ロットL2): ゲート2ボス6体のソウル式化で
  // 追加した状態(4チャンネル分解=windup/active/recoverの共通語彙。同名でも解釈はボス種別ごとに
  // runXTickが行うため、複数のボスで同じ名前を再利用してよい=union膨張を避ける既存の作法どおり)。
  //  volley-windup/volley-recover = 弾3連の溜め/硬直(ミゲル/ジブリル共通)。
  //  tate-recover = ミゲル縦払いの硬直【新設】。mdash-windup/mdash-move/mdash-recover = ミゲル踏み込み【新規】。
  //  lantern-windup/lantern-recover = ジブリル ランタン火の溜め/硬直。
  //  consecrate/consecrate-windup/consecrate-recover = ジブリル 聖別【新規・Phase2】。warp-windup = ジブリル転移の溜め【新設】。
  //  bone-windup/bone-recover = ラフィ骨刃の溜め/硬直【新設】。
  //  sweep/sweep-windup/sweep-recover = 近接の薙ぎ払い(ラフィ【新規・Phase2】/ウリ大薙ぎ/スリィエル本体薙ぎ 共通)。
  //  downslash/downslash-windup/downslash-recover = ウリ振り下ろし(縦・内径なし)。
  //  thrust/thrust-windup/thrust-recover = ウリ踏み込み突き(遠帯)。
  //  bolt-windup/bolt-recover = ウリ炎の光輪(小技・弾3発)。
  //  ring-move-windup(環の移動)/ring-beam-windup(T6線)/ring-active(発射)/ring-recover = スリィエル環の射出。
  //  ring-spin-windup/ring-spin/ring-spin-recover = スリィエル環の回転斬。
  //  gaze-windup/gaze-recover = 単眼の小技(スリィエル単眼の凝視/アクラシエル単眼レーザー 共通)。
  //  spike-windup/spike/spike-recover = アクラシエル放射棘。spear-windup/spear-recover = 結晶の槍(設置)。
  //  warp-out/warp-in/warp-recover = アクラシエル転移。burst-windup/burst/burst-recover = 収縮→爆発。
  // PACING_PUZZLE.md §6.28-5/7/9/10(バッチM54/M56/M58/M59・ロットL3): 裏ボス4体(mimir/jormungand/
  // skadi/thor)へ追加した硬直(recover)+新技の状態(同名でも解釈はボス種別ごとに分岐する既存の作法)。
  //  burst-recover/radial-recover/dash-recover/laser-recover = 弾3連/全方位/突進/レーザーの硬直
  //  (mimir/jormungand/skadi/mimirのlaser共通。既存の'burst'/'radial'/'dash'/'laser-fire'アクティブの後に挿入。
  //  burst-recoverはアクラシエルの収縮→爆発でも使われる名前だが、解釈はboss.type側で分岐するため衝突しない)。
  //  skadi-ice-recover/skadi-blade-recover = スカジ 氷塊/氷刃の硬直。
  //  bite-windup/bite/bite-recover = ミーミル「群体の噛みつき」(§6.28-15裁定で「踏み潰し」から改名。密着帯)。
  //  coil-windup/coil/coil-recover = ヨルムンガルド「うねり」(近帯・Phase2限定)。
  //  cage-windup/cage/cage-recover = スカジ「氷結の檻」(全帯・Phase3限定)。
  //  issen-recover/tsuki-recover/harai-recover = トール 一閃/突き/払いの硬直【新設】(jump-recoverは既存のまま)。
  // PACING_PUZZLE.md §6.28-20(バッチM64): idol(stage-2隠しボス)専用の状態(他ボスと名前が衝突しないよう
  // idol-接頭辞を付ける。近づくほど安全=全ボスの逆で、他ボスの語彙を流用しない独立の状態機械)。
  //  idol-aim-windup/idol-aim/idol-aim-recover = 狙い撃ち(遠)。
  //  idol-fan-windup/idol-fan/idol-fan-recover = 連射(中・Phase2で扇3→5本)。
  //  idol-roll-windup/idol-roll/idol-roll-recover = 離脱ローリング(近・無敵なし)。
  //  idol-punch-windup/idol-punch/idol-punch-recover = 至近の殴り(近)。
  bossState?: 'chase' | 'aim-burst' | 'burst' | 'aim-radial' | 'radial' | 'skadi-ice' | 'skadi-blade' | 'dash-windup' | 'dash' | 'return' | 'laser-windup' | 'laser-fire' | 'laser-broken'
    | 'issen-windup' | 'issen-dash' | 'tsuki-windup' | 'tsuki' | 'harai-windup' | 'harai' | 'tate-windup' | 'tate' | 'jump-windup' | 'jump-attack' | 'jump-recover' | 'counter-leap' | 'backstep' | 'orbit-step' | 'volley' | 'lantern' | 'bone'
    | 'volley-windup' | 'volley-recover' | 'tate-recover' | 'mdash-windup' | 'mdash-move' | 'mdash-recover'
    | 'lantern-windup' | 'lantern-recover' | 'consecrate' | 'consecrate-windup' | 'consecrate-recover' | 'warp-windup'
    | 'bone-windup' | 'bone-recover'
    | 'lance-windup' | 'lance' | 'lance-recover'
    | 'sweep' | 'sweep-windup' | 'sweep-recover' | 'downslash' | 'downslash-windup' | 'downslash-recover'
    | 'thrust' | 'thrust-windup' | 'thrust-recover' | 'bolt' | 'bolt-windup' | 'bolt-recover'
    | 'ring-move-windup' | 'ring-beam-windup' | 'ring-active' | 'ring-recover'
    | 'ring-spin-windup' | 'ring-spin' | 'ring-spin-recover' | 'gaze-windup' | 'gaze-recover'
    | 'spike-windup' | 'spike' | 'spike-recover' | 'spear-windup' | 'spear-recover'
    | 'warp-out' | 'warp-in' | 'warp-recover' | 'burst-windup' | 'burst' | 'burst-recover'
    | 'radial-recover' | 'dash-recover' | 'laser-recover'
    | 'skadi-ice-windup' | 'skadi-blade-windup' | 'skadi-ice-recover' | 'skadi-blade-recover'
    | 'bite-windup' | 'bite' | 'bite-recover'
    | 'coil-windup' | 'coil' | 'coil-recover'
    | 'cage-windup' | 'cage' | 'cage-recover'
    | 'issen-recover' | 'tsuki-recover' | 'harai-recover'
    | 'idol-aim-windup' | 'idol-aim' | 'idol-aim-recover'
    | 'idol-fan-windup' | 'idol-fan' | 'idol-fan-recover'
    | 'idol-roll-windup' | 'idol-roll' | 'idol-roll-recover'
    | 'idol-punch-windup' | 'idol-punch' | 'idol-punch-recover'
    // v0.25.2613(バッチ3・idolのMAX化): 狙撃線/追尾弾/休符。詳細は src/utils/idolTick.ts。
    | 'idol-snipe-windup' | 'idol-snipe' | 'idol-snipe-recover'
    | 'idol-orb-windup' | 'idol-orb-recover'
    // v0.25.3442(社長指示): 手榴弾技(プレイヤーの手榴弾と同じ仕様の投擲)。
    | 'idol-nade-windup' | 'idol-nade-recover'
    | 'idol-rest'
    // PACING_PUZZLE.md §6.38 B2: バス停(変異・bounty-ranged)の技。
    // laser-windup/laser-fire/laser-recover/laser-broken は usesMimirLaser 経由でミーミルと共有
    // (§6.38 B0のLASER-TRACK一般化。同じ状態名を使うことでgameStore側の中断/描画が両者へ自動で効く)。
    // br-push-* = 近接されたら押しのけ(小KB・カウンター可)。
    | 'br-push-windup' | 'br-push' | 'br-push-recover'
    // PACING_PUZZLE.md §6.38 B2: 馬乗り(変異・bounty-melee)の技。
    // bm-charge-* = 突進(werewolfのwindup→charge流用・流星ライン予告・カウンター可)。
    // bm-combo{1,2,3}-* = 3段コンボ(速→速→遅)。bm-snipe-* = 輸入=懲罰狙撃(idolのsnipe流用)。
    | 'bm-charge-windup' | 'bm-charge' | 'bm-charge-recover'
    | 'bm-combo1-windup' | 'bm-combo1-recover' | 'bm-combo2-windup' | 'bm-combo2-recover'
    | 'bm-combo3-windup' | 'bm-combo3-recover'
    | 'bm-snipe-windup' | 'bm-snipe' | 'bm-snipe-recover'
    // PACING_PUZZLE.md §6.38 B2b: 鋏(変異・bounty-balance)の技。
    // bb-sweep-* = 薙ぎ払い(近・drawAngelZoneCapsule+T3・カウンター可)。
    // leap-windup/-air/-recover = 跳びかかり(遠・pumpkinの数値を読みbossState側で再実装=v2 A節の掟
    // 「跳躍はpumpkinのaiPhase機構を流用せず-windup/-air/-recoverとしてbossState側に再実装」)。
    | 'bb-sweep-windup' | 'bb-sweep' | 'bb-sweep-recover'
    | 'leap-windup' | 'leap-air' | 'leap-recover'
    // PACING_PUZZLE.md §6.38 B2b: 舞妓(変異・bounty-maiko)の技。全技=毬(v5.1)。
    // mk-naginata* = 毬の薙ぎ(型A単発/型B2連=mk-naginata1・mk-naginata2)。mk-spin* = 毬回し
    // (自分中心円・AOE_TELEGRAPH_AUDIT登録対象)。mk-suiu* = 水鳥乱舞(型B専用・3連バウンド)。
    // mk-boom* = 手毬打ち(遠距離・ブーメラン軌道)。mk-repose = HP50%型切替時の短い舞い直し硬直。
    | 'mk-naginata-windup' | 'mk-naginata-recover'
    | 'mk-naginata1-windup' | 'mk-naginata1-recover' | 'mk-naginata2-windup' | 'mk-naginata2-recover'
    | 'mk-spin-windup' | 'mk-spin' | 'mk-spin-recover'
    | 'mk-suiu-windup' | 'mk-suiu-hop1' | 'mk-suiu-hop2' | 'mk-suiu-hop3' | 'mk-suiu-recover'
    | 'mk-boom-windup' | 'mk-boom-out' | 'mk-boom-back' | 'mk-boom-recover'
    | 'mk-repose';
  bossStateUntil?: number;   // 現フェーズ終了 gameTime(ms)
  // PACING_PUZZLE.md §6.38 B2b(v6 C-1・変則ディレイの予告同期): 抽選した溜め時間が技ごとに変わる
  // 技(舞妓の毬の薙ぎ/毬回し=マルギット型2択ランダム)は、bossStateUntilだけでは実際の溜め長を
  // 逆算できない(=描画が進行度を出せない)。この技だけ、windup開始時のgameTimeを併記する。
  // 描画はtelegraphProgress01(now, bossWindupStartAt, bossStateUntil)で導出する(*_VIS複製定数を
  // 作らない・v6 C-1の掟)。固定長のwindupはbossStateUntilだけで足りるため未設定のままでよい。
  bossWindupStartAt?: number;
  bossNextActionAt?: number; // 次に特殊行動(burst/radial/dash)を抽選できる gameTime(ms)
  // バス停(bounty-ranged)のポツポツ撃ちの直近発射時刻(gameTime)。描画専用=構えの標識を出す合図
  // (社長指示v0.25.3443「弾はバス停の先から」・発射起点はbountyTick側)。判定には使わない。
  lastRangedShotAt?: number;
  // 攻撃開始時に確定した短い連携台本の残り。各recoverで先頭を消費し、空になった時だけ通常硬直へ戻る。
  bossScriptQueue?: string[];
  bossLeashSince?: number;  // フィールドボスが離脱距離の外に出続けた起点(gameTime)。3秒予兆用
  // PACING_PUZZLE.md §6.38(賞金首・B1): 直近で「交戦中」だった gameTime(bountyEngagedNow参照)。
  // 滞在1分(BOUNTY_LINGER_MS)の起点=これ(未設定ならspawnedAt)。交戦中は毎フレーム現在時刻へ更新。
  bountyLastEngagedAt?: number;
  // 滞在満了→帰巣完了後にフェード退場を開始した gameTime。未設定=退場中でない。
  bountyDepartAt?: number;
  // PACING_PUZZLE.md §6.38 B2(バス停「取り巻き召喚」): この敵が賞金首の取り巻きなら親bounty.idを持つ
  // (交戦開始時に1回だけ2体・再召喚なし)。bountyTick.tsが賞金首の退場時にこのidを一緒に片付ける。
  bountyEscortId?: string;
  bossBurstLeft?: number;    // 3連発の残弾
  bossBurstNextAt?: number;  // 次の1発の gameTime(ms)
  // PACING_PUZZLE.md §6.28-21(バッチM53/M55/M57・ロットL2): ミゲル/ジブリル/ラフィへ追加した新技1つずつの
  // 専用クールダウン(gameTime ms)。既存の一般行動ゲート(bossNextActionAt)とは別枠(設計書の表がこの3技
  // だけ明記のCD値を持つため)。ウリ/スリィエル/アクラシエル(§6.28-17/18/19)はCD列が設計書に無く、
  // 既存の一般行動ゲートのみで足りる(帯の出し分けだけで駆動=新規CDフィールド不要)。
  mDashReadyAt?: number;        // ミゲル 踏み込み(dash)専用CD(6000ms)
  jConsecrateReadyAt?: number;  // ジブリル 聖別専用CD(8000ms・Phase2)
  rSweepReadyAt?: number;       // ラフィ 薙ぎ専用CD(7000ms・Phase2)
  // PACING_PUZZLE.md §6.28-5/7/9(バッチM54/M56/M58・ロットL3): 裏ボス3体の新技1つずつの専用CD
  // (ジャイアントのgStompReadyAt等と同じ作法。既存のBOSS_ACTION系一般ゲートとは別枠)。
  mimirBiteReadyAt?: number;    // ミーミル 群体の噛みつき専用CD(6000ms)
  // PACING_PUZZLE.md §6.33(LASER-TRACK): 弱点窓で中断された時だけ課すレーザーCD(8000ms)。
  // 通常成功時は従来どおりCDなし(=このフィールドは中断時のみ前へ進む)。
  mimirLaserReadyAt?: number;
  jormCoilReadyAt?: number;     // ヨルムンガルド うねり専用CD(7000ms・Phase2)
  skadiCageReadyAt?: number;    // スカジ 氷結の檻専用CD(12000ms・Phase3)
  // §6.28(バッチM55/M58/M61-63): フェーズを持つ新規ボス(ジブリル/ラフィ/ウリ/スリィエル/アクラシエル)
  // 共通のHP段階トラッカー(ジャイアント専用のgiantPhaseとは別・無改変)。値の意味・閾値は各ボスのtick関数側。
  bossPhase?: 1 | 2 | 3;
  bossPhaseFlashUntil?: number;
  // §6.28-18(バッチM62): スリィエルの環(suriel-ring)の現在位置(world座標・中心)。待機中は頭上へ
  // 追従、攻撃中は本体から離れて移動する。Phase2(HP50%以下)で2本目=ring2。undefinedの間は
  // pixiScene側が本体直上のデフォルト位置を補う。
  ringX?: number;
  ringY?: number;
  ring2X?: number;
  ring2Y?: number;
  // §6.28-19(バッチM63): アクラシエル放射棘の「空きセクター」を溜め開始時にロックするビットマスク
  // (8方向=bit0..7、1=空き)。掟W4(テルを出したら必ず撃つ)のため実行まで固定する。
  spikeGapMask?: number;
  // v0.25.3204(社長指示「ランタン、1秒置きに3本発射」): ジブリルのランス=飛行中ランタンの一覧。
  // dir=進行方向(rad)・bornAt=射出時刻・firedUntil=ビーム表示終了時刻(undefined=まだ飛行中)。
  // 更新はangelBossTick(lance-windup)のみ。pixiSceneは読んで赤ライン/ランタン/ビームを描くだけ。
  lanceLanterns?: { x: number; y: number; dir: number; bornAt: number; firedUntil?: number }[];
  // トール専用: 旋回方向(1=時計回り/既定 -1=逆回転)。払いの予告中だけ一時的に反転する。
  bossCircleDir?: number;
  // ミゲル(ゲート2ボス)専用: 直近に「近接」ダメージを受けた gameTime(ms)。gameStore.ts の近接
  // ダメージ経路(grantMeleeKillRewards/4武器の近接分岐)だけがスタンプする(銃/爆発では発動しない)。
  // useGameLoop のミゲル専用コントローラがこれを見て、被弾後1秒だけ周回速度を上げる(社長指示)。
  meleeHitAt?: number;
  // 火炎瓶(molotov)サブウェポン: 直近に地面の火(groundFires)からDoTを受けた gameTime(ms)。
  // MOLOTOV_DOT_INTERVAL_MS(0.5秒)のスロットルに使用(複数の火に重なっても二重取りしない)。
  lastFireHitAt?: number;
  // BOT_AND_GHOST.md §2.8 G2.5(ヘイト): giantbat/idol/天使6体だけが持つ(src/utils/bossHate.ts
  // isHateTrackedBossType)。プレイヤー/ゴーストそれぞれの直近6秒ダメージ(1秒バケツ×6)と、
  // 直前の技の狙いロックで選ばれていた側(粘着×1.3の基準)。damageEnemyが被弾のたびに更新し、
  // 各ボスのwindup開始点(beginGiantMove等)がresolveBossHateAim経由で読む。
  hatePlayerBuckets?: { idx: number; dmg: number }[];
  hateGhostBuckets?: { idx: number; dmg: number }[];
  hateTarget?: 'player' | 'ghost';
  // v0.25.2490(社長裁定「雑魚はプレイヤーを優先して狙う。守護霊に攻撃されたら守護霊に向く」):
  // 雑魚(非ボス)専用のゴーストヘイト終了時刻(gameTime基準)。damageEnemyがhateSource='ghost'の
  // 被弾のたびに更新し、resolveEnemyTargetが期限内ならゴーストを狙わせる。ボスはG2.5のバケツ側(上)。
  ghostHateUntil?: number;
  // SKILL_BUILD_REDESIGN.md §28(B7): アイスショット(ice-shot)の鈍足(ボスは対象外・§28-2)。
  // gameTime < iceSlowUntil の間、移動速度に (1 - iceSlowPct) を掛ける(updateEnemies)。
  iceSlowUntil?: number;
  iceSlowPct?: number;
  // 社長指示v0.25.3299「ダン!ダン!の二段遅延」: パニッシャー巻き込みの二拍目(ダメージ+継承KB)を
  // 一拍(150ms)遅らせるための予約。At=発火時刻/Vx,Vy=発生源から継承する速度(発火時に適用)。
  punisherPendingAt?: number;
  punisherPendingVx?: number;
  punisherPendingVy?: number;
  // v0.25.3300「覚醒(Lv3)で2連まで巻き込める」: 連鎖の深度(1=巻き込まれた敵/2=その敵が巻き込んだ敵)。
  // moversの資格判定(深度<上限)に使い、KB終了時にpunisherHoppedと一緒に解除。
  punisherHopDepth?: number;
  // 社長指示v0.25.3300 ボムカウンター覚醒(Lv3): 爆発で飛ばされた敵に付く1段パニッシュ効果の窓。
  // この時刻まではパニッシャー未所持でも巻き込み元になれる(巻き込まれた側=深度1は連鎖しない)。
  bombPunishUntil?: number;
  // 社長指示v0.25.3280「グラヴィティはボスも減速させて」: 渦の半径内のボスに付く移動半減の窓。
  // tickGravityWellsが毎フレーム上書きし、bossSlowMult(全ボス移動経路の共通チョーク)が読む。
  gravitySlowUntil?: number;
  // B7: 延焼弾(incendiary-round)の燃焼DoT。gameTime < burnUntil の間、250ms tickでburnDpsTick分の
  // ダメージを受ける(tickBurningEnemies・gameStore.ts)。lastBurnTickAtがそのスロットル打刻。
  burnUntil?: number;
  burnDpsTick?: number;
  lastBurnTickAt?: number;
  // B7: 血の履帯(blood-treads)の棘(tickBloodSpikes)のDoTスロットル打刻(250ms・molotovのlastFireHitAtと同じ流儀)。
  lastSpikeHitAt?: number;
}

// 'ghost-ally' = BOT_AND_GHOST.md G2(ゴースト助っ人・デバッグ召喚 `?ghost=1`)。**'ghost-ally'という
// 値名は意図的**: EnemyType側に既に 'ghost'(抱卵型変異体の内部id・旧称)が存在するため、同じ文字列
// 'ghost' をSummonKindにも使うと `e.type==='ghost'` と `s.kind==='ghost'` が字面上そっくりになり、
// このファイル内でも実際に混在している(取り違えのリスクが実在するため名前を分けた)。
// 他の2種と違い、移動/攻撃は gameStore.updateSummons ではなく専用の ghostDriver.ts + useGameLoop の
// 専用ブロックが駆動する(updateSummons側はkind==='ghost-ally'を素通しするだけ=既存2種は無改変)。
export type SummonKind = 'normal' | 'rare' | 'ghost-ally';
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
  // kind='ghost-ally' ではこのフィールドは不使用(見た目はプレイヤーの基本テクスチャ+青白tint=
  // pixiSceneがkind==='ghost-ally'を専用分岐で描くため、敵アセットの参照元は要らない)。型の都合上、
  // 値そのものは何か入れておく(spawn側が任意のEnemyTypeを1つ置くだけ)。
  reusedType: EnemyType; // 見た目/速度の参照元
  level: number;
  createdAt: number;      // Date.now — FIFO順 + レアの10秒寿命
  expiresAt?: number;     // rare のみ
  lastHit: number;
  lastContactAt?: number; // 召喚→敵 接触ダメージの throttle
  // PACING_PUZZLE.md §6.24 M48「使役」: 警察署アリーナ報酬で倒した敵の20%が復活したもの。
  // 錬金術の距離消滅(ALCHEMY_DESPAWN_DIST)を適用しない/最大1体(先着維持)の識別に使う。
  persistent?: boolean;
  // ---- kind='ghost-ally'専用(BOT_AND_GHOST.md G2)。他kindでは常にundefined ----
  ghostBossId?: string;        // 紐付いているボスのenemy.id(そのボスが居なくなったら解散)。
  ghostClass?: CharacterClass; // v0.25.2467: 絵の選択用=プロファイル計測時のクラス(無ければwarrior=ヘビーガンナー)。
  ghostName?: string;          // v0.25.2477: 頭上に出すプレイヤー名(召喚時にプロファイルsrcName ?? 現在名を搭載)。
  ghostArrivalComment?: string;   // 登場時の左上通信。召喚元プロフィールから浄化済みの文を搭載。
  ghostDepartureComment?: string; // 帰還時の左上通信。同じ守護霊の持ち主が設定した文を使う。
  ghostIsOwn?: boolean;        // v0.25.2477: 自分のプロファイル由来か(現状オフライン=常にtrue。将来オンラインで
                               // 他人のゴーストが来たらfalse=頭上の「(自分)」添え字が消える前提の構造)。
  ghostFacing?: 1 | -1;        // 向き(描画の左右反転のみ・当たり判定は不変)。
  // 登場/通常帰還の短い移動演出(gameTime基準)。演出中は専用driverが戦闘を止め、座標だけ更新する。
  // 帰還は救難信号と同じ「しゃがみ→バックジャンプ」。HP0消滅には使わない。
  ghostArrivalStartedAt?: number;
  ghostArrivalFromX?: number;
  ghostArrivalFromY?: number;
  ghostArrivalToX?: number;
  ghostArrivalToY?: number;
  ghostDepartureStartedAt?: number;
  ghostDepartureFromX?: number;
  ghostDepartureFromY?: number;
  ghostDepartureToX?: number;
  ghostDepartureToY?: number;
  ghostLastShotAt?: number;    // 銃のクールダウンゲート(ms・Date.now基準)。
  // v0.25.2830: 守護霊も独立した2人目のプレイヤーとして、プレイヤーと同じWeapon[]・リロード状態を
  // 自前で持つ。リザーブ弾だけは従来の除外4どおり非消費(空マガジンは同じ時間を掛けて満タンへ戻る)。
  ghostWeapons?: Weapon[];
  ghostReloadEndsAt?: number;
  ghostReloadingWeaponId?: string;
  ghostLastMeleeAt?: number;   // 近接のクールダウンゲート(ms・Date.now基準)。
  ghostCounterPendingAt?: number;    // カウンター相当の機会が開いた時刻(undefined=機会なし)。
  ghostCounterWillAttempt?: boolean; // その機会で抽選済みの「試みるか」。
  // GHOST-COUNTER-PARITY(社長指示「プレイヤーと揃えろ」): カウンターが成立しうるスイングだけの
  // クールダウン起点(ms・Date.now基準)。ghostLastMeleeAt(通常近接=600ms・不変)とは別枠
  // (ghostDriver.GHOST_COUNTER_MELEE_PERIOD_MS=プレイヤーのCOUNTER_WINDOW+COUNTER_COOLDOWNと同期)。
  ghostLastCounterAttemptAt?: number;
  // v0.25.2489(社長裁定「プレイヤーと同じ仕様になってないのは漏れ」): カウンター成立で付与される
  // 無敵の終了時刻(Date.now基準)。lastHitの被弾i-frameとは別枠(lastHitを流用すると被弾音/被弾
  // フラッシュのエッジ検知が無傷なのに誤発火するため専用フィールド)。他kindでは常にundefined。
  ghostInvulnUntil?: number;
  // v0.25.2525(GHOST-REFLECT-MELEE-SUBS・台帳§4-1「弾反射」): 守護霊のカウンター窓の終了時刻
  // (Date.now基準)。プレイヤーの `counterWindowEnd` と**同じ意味・同じ定数(COUNTER_WINDOW)**で、
  // 近接スイング(通常スイング/刀の一閃)を起点に開く。窓中に自分へ当たった敵弾を反射する
  // (反射のたびに COUNTER_EXTEND_PER_HIT で延長=プレイヤーと同じ連続反射)。他kindでは常にundefined。
  ghostCounterWindowEnd?: number;
  // v0.25.2514(GHOST-BUILD-1・§2.11 裁定1): 召喚時に載せる「計測時ビルドの写し」。ゴーストの武器・
  // スキル・装備・クリ率はこれから復元する(欠損=旧プロファイル→召喚時のプレイヤー装備へフォールバック)。
  ghostBuild?: PlayerBuildSnapshot;
  // v0.25.2518(GHOST-KATANA-WIRE・裁定2「共有方式」): 刀の一閃/ワイヤーアンカーの状態機械を
  // **プレイヤーと同じ1つの型**(DashLocomotionState)で持つ。プレイヤーはPlayer直付け、守護霊はここ。
  // これで既存の状態機械(katanaDashUntil/wireDashUntil系)の主語をゴーストへ差し替えられる
  // (ゴースト用の簡易モデルは作らない)。undefined=まだ一度も使っていない(=全ゼロ相当)。
  ghostDash?: DashLocomotionState;
  // 被弾ノックバック(監査項目7・プレイヤーのdamagePlayerと同式: PLAYER_KNOCKBACK_SPEED/MSで
  // ダメージ源から弾かれ、updateSummonsが減衰しながら消化する)。他kindでは常にundefined。
  knockbackVx?: number;
  knockbackVy?: number;
  knockbackUntil?: number;
  // ---- G2.6(サブウェポンのオーナー抽象化) ----
  ghostSubClaim?: boolean;     // 「次のサブ発動1回」をゴーストがオーナーとして使う予約。
  ghostLastSubUseAt?: number;  // ゴーストが最後にサブを実際に使った時刻(ms・Date.now基準)。
  // §2.11追補(v0.25.2541・GHOST-SAME-SPEC): 守護霊は**独立した2人目のプレイヤー**なので、
  // サブウェポンのCD/チャージ/分身の枠も**主語ごと**に持つ(旧「1つの財布」=プレイヤーの
  // subWeaponCooldowns 共有は廃止)。型はプレイヤーと同じもの=ゴースト専用の別モデルは作らない。
  // undefined = まだ一度も使っていない(=空=全サブ即使用可。実プレイヤーの参戦と同じ)。
  ghostSubWeaponCooldowns?: Partial<Record<SubWeaponKey, number>>; // ゴースト自前のサブCD帳簿(gameTime基準)
  ghostShadowClone?: ShadowCloneState;   // ゴーストが出した分身(プレイヤーの store.shadowClone と同型・同ルール)
  ghostSensorMineCharges?: number[];     // ゴースト自前のセンサー地雷チャージ(回復待ちreadyAtの配列)
  // ---- G4b(BOT_AND_GHOST.md §2.9(4)): 技への反応ロール(ghostDriver.GhostMoveRollの持ち越し) ----
  // 型はghostDriver.tsのGhostMoveRollと同形(このファイルはutilsをimportしない=循環回避でフラットに持つ)。
  ghostMoveRollKey?: string;                                      // 進行中の技キー(undefined=技なし)
  ghostMoveRollDecision?: 'counter' | 'dodge' | 'tank' | 'fallback'; // その技へのロール結果
  ghostMoveRollAt?: number;                                       // ロールした時刻(ms・Date.now基準)
  // ---- §2.12(1) 反応遅延(v0.25.2529): 危険(ボスの予告/回避対象の脅威)を最初に認知した時刻
  // (ms・Date.now基準)。ここから計測 reactionMs(100-800clamp)経過して初めて回避を始める。
  // GHOST-BULLET-TECH A(v0.25.2543): 危険が消えても GHOST_DANGER_MEMORY_MS の間は認知を保つ
  // (=反応遅延は危険エピソードにつき1回だけ)。記憶が切れた tick で undefined へ戻る。
  ghostDangerSeenAt?: number;
  ghostDangerLastAt?: number; // 最後に危険が見えた時刻(記憶の失効起点)
  // §2.12追補(v0.25.2534): オービット(ボス正対の横流れ)の旋回方向。持ち越して低確率で反転。
  ghostOrbitSign?: 1 | -1;
  // GHOST-BULLET-TECH B(v0.25.2543): 計測で「苦手」(tank)と出た弾技の技キーと、その弾を避けない期限。
  ghostTankedBulletKey?: string;
  ghostTankedBulletUntil?: number;
  // ---- GHOST-CMD-2A(BOT_AND_GHOST.md §2.18追補「隙コマンド」) ----
  // 自分のカウンターが成立した時刻(ms・Date.now基準)。プレイヤーの player.lastCounterSuccessTime と
  // 同じ意味で、成立直後の追撃窓(afterCounter文脈)の錨点になる。打刻は applyGhostCounterEffect(1箇所)。
  ghostLastCounterAt?: number;
  // いま従っている隙の文脈と、その窓で引いたモード(型はghostDriver/punishWindowと同形。
  // このファイルはutilsをimportしない=循環回避でフラットに持つ=ghostMoveRoll*と同じ流儀)。
  ghostPunishContext?: 'stun' | 'recover' | 'afterCounter';
  ghostPunishMode?: 'rush' | 'shoot';
  // ---- GHOST-SUBS-FINAL(v0.25.2563・§2.11追補「状態は主語ごと」): 構造ズレ組サブの自前状態 ----
  // どれも**プレイヤーが持っているのと同じ型**(store側のフィールドと1対1)。ゴースト専用の別モデルは作らない。
  ghostMolotovCycle?: MolotovCycleState | null; // 火炎瓶の投下サイクル(store.molotovCycle と同型)
  ghostFirstAidKit?: FirstAidKitState;          // 救急鞄の在庫(store.firstAidKitState と同型・1ラン使い切り)
  ghostSupportSniperCdMs?: number;              // 援護射撃の専用タイマー(store.supportSniperCdMs と同型・移動中のみ進む)
  ghostHomingLocks?: string[];                  // ホーミングのロック(store.homingLocks と同型)
  ghostHomingHoldStartAt?: number;              // ホーミングを「押し始めた」時刻(ms・Date.now基準)。undefined=押していない
  ghostHomingNextLockAt?: number;               // 次のロック付与時刻(gameTime基準・プレイヤーの nextHomingLockRef と同型)
  ghostQuickMagCritUntil?: number;              // 自分のマガジンを回収して得たクリ窓(gameTime基準・player.quickMagCritUntil と同型)
  // 直近tickで実際に動いていたか(player.isMoving と同じ意味=速度が最大速の15%超)。
  // 「移動中のみ」で動く火炎瓶/援護射撃の主語判定に使う。
  ghostIsMoving?: boolean;
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
  | 'miguel'     // ゲート2ボス(天使名ボス1体目): 大天使ミカエル「ミゲル」。仕様=他の裏ボスと共通だが
                 // stageのhiddenBoss設定ではなくゲート2(useGameLoop.ts)からfromEventでスポーンされる
  | 'jibril'     // ゲート2ボス(天使名ボス2体目・ステージ3): 「ジブリル」。仕様=ミゲルと共通(コントローラ/描画/ステータスを流用・武器=ランタン)
  | 'rafi'       // ゲート2ボス(天使名ボス3体目・ステージ4): 「ラフィ」。仕様=ミゲルと共通(コントローラ/描画/ステータスを流用・武器=骨刃)
  // PACING_PUZZLE.md §6.28-0★/§6.28-17〜20(バッチM52・ロットL1=配線のみ。台本はL2/L3が実装):
  | 'uri'        // ゲート2ボス(天使名ボス4体目・ステージ5): 「ウリ」。武器=血濡れの大剣(uri-sword)
  | 'suriel'     // ゲート2ボス(天使名ボス5体目・ステージ6): 「スリィエル」。武器=金の環・単眼(suriel-ring)
  | 'acrasiel'   // ゲート2ボス(天使名ボス6体目・EX): 「アクラシエル」。武器=紫の結晶の槍(acrasiel-spear)。脚が無く移動しない(speed:0)
  | 'idol'       // stage-2 隠しボス(反対方面最奥): オープニングでアイドルを撃ち殺した人物。武器絵は無し(本体絵にハンドガンを描き込み済み)
  | 'hunter'     // ハンター変異体: 3分以降・優勢時に出現。索敵→発見→拠点まで追跡→撤退する徘徊ストーカー(専用イベント制御)
  | 'screamer'   // 変異体(叫喚型): 5分以降・同時1体。距離を保ち、溜め→叫喚で画面内の通常敵を一時強化(優先処理対象)
  // PACING_PUZZLE.md §6.38(賞金首「BOUNTY」・B1): 倒す必要のない小ボスイベント。ランダムで1体出現し、
  // 交戦しない限り追ってこない・逃げれば見逃せる。texture名=type規約(getTexture(e.type))。
  | 'bounty-ranged'  // バス停(変異): 遠距離(砲手)。バス停と同化
  | 'bounty-melee'   // 馬乗り(変異): 近接(決闘者)。触手下半身+潜水兜の機械体
  | 'bounty-balance' // 鋏(変異): バランス(教官)。膝立ち+巨大な錨(のち鋏に差し替え検討)
  | 'bounty-maiko';  // 舞妓(変異): イレギュラー種。4本腕+手毬(オービット武器)

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
// 'glauncher' = 武器庫からのみ排出されるグレネード系銃器(社長指示v0.25.3290・第4枠)。
// 弾薬はライフル弾を共用(AMMO_FIELDでammoRifleへマップ=専用弾経済は作らない・叩き台)。
export type WeaponCategory = 'handgun' | 'shotgun' | 'rifle' | 'phill' | 'glauncher';
export type AmmoType = WeaponCategory;

// Projectile/weapon kinds. Guns use their category as the projectile type;
// melee weapons never spawn projectiles (handled by the counter). enemy_bolt
// is the hostile seed/bolt enemies spit.
export type WeaponType = WeaponCategory | 'knife' | 'hatchet' | 'machete' | 'tactical-knife' | 'anti-mutant-knife' | 'enemy_bolt' | 'grenade' | 'trap' | 'decoy' | 'shield' | 'turret' | 'fire-knife-projectile' | 'drone-boomerang-projectile' | 'phill-bullet' | 'homing-missile' | 'skateboard';
export type SubWeaponKey = 'heavy-grenade' | 'marksman-trap' | 'striker-quick-mag' | 'striker-hunting' | 'dog' | 'katana' | 'murasame' | 'decoy' | 'shield' | 'whip' | 'alchemy' | 'turret' | 'shijin' | 'fire-knife' | 'drone-boomerang' | 'wire-anchor' | 'sage-stone' | 'homing' | 'shadow-clone' | 'molotov' | 'first-aid-kit' | 'sensor-mine' | 'support-sniper' | 'flare-gun' | 'junk-weapon';

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

// スキル「救難信号」(rescue-signal)の援護アライ。プレイヤーの近接ヒットで一定確率で発生する
// 一過性エフェクト: 背後から飛来 → 対象へ必中1撃(ダメージ適用はgameStore.tickRescueAlliesが
// 着弾フレームで行う) → 背後へ飛び去って消滅。当たり判定・パス探索は持たない演出専用の状態
// (world/collisionには一切触れない=CLAUDE.mdの「PixiJSは描画のみ」原則どおり、pixiScene側は
// この配列を読んで位置を補間するだけ)。
export interface RescueAlly {
  id: string;
  klass: CharacterClass;   // 見た目(プレイヤーと別クラス)。既存のクラス→立ち絵テクスチャ対応を流用して描画
  fromX: number;           // 出現地点(プレイヤーの背後)の足元X
  fromY: number;
  targetX: number;         // 発生時点の対象の中心X(固定=着地後は敵を追わない・社長指示v0.25.1615)
  targetY: number;         // 発生時点の対象の中心Y(固定)
  targetFootY: number;     // 発生時点の対象の足元Y(固定)。着地=これより少し手前(前面)に取る
  targetEnemyId: string;   // ダメージ適用先。着弾時に生存していなければ何もしない(スキップ)
  damage: number;          // 発生時点のプレイヤー近接ダメージそのまま(倍率1・crit/コンボ/装備アウトゴーイング倍率なし)
  spawnedAt: number;       // gameTime(ms)。フェーズ(飛来→打撃→離脱)の起点
  struck: boolean;         // 着弾ダメージを適用済みか(tickRescueAlliesが二重適用を防ぐためのフラグ)
}

// 救急鞄(first-aid-kit)サブウェポンの空鞄投擲。中身を払い出し切った後、鞄本体をプレイヤーから
// 対象の敵へ飛ばす一過性エンティティ(RescueAllyと同じ構造の使い切りパターン)。当たり判定は持たず、
// 飛行完了(THROWN_BAG_FLIGHT_MS経過)の瞬間にダメージ/ノックバック/FXを1回だけ適用する
// (適用/寿命はgameStore.tickThrownBagsが処理、描画はpixiScene側がこの配列を直読みして位置を補間するだけ)。
export interface ThrownBag {
  id: string;
  fromX: number;           // 投げ始め=プレイヤー足元
  fromY: number;
  targetX: number;         // 発生時点の対象の足元X(対象が消えた後のフォールバック位置)
  targetY: number;
  targetEnemyId: string;   // ダメージ適用先。着弾時に生存していなければ何もしない(スキップ)
  damage: number;          // FIRST_AID_KIT_THROW_DAMAGE そのまま
  spawnedAt: number;       // gameTime(ms)。飛行の起点
  struck: boolean;         // 着弾ダメージを適用済みか(tickThrownBagsが二重適用を防ぐためのフラグ)
}

// 火炎瓶(molotov)サブウェポンが足元に設置する地面の火だまり。MOLOTOV_FIRE_LIFETIME_MS(3秒)で消滅。
// 生成/寿命切れ/敵への接触ダメージは gameStore.ts(spawnGroundFire/tickGroundFires)が処理する
// シミュレーション側の状態で、pixiScene.ts はこの配列を読むだけ(松明の炎の見た目を流用して描画)。
export interface GroundFire {
  id: string;
  x: number;
  y: number;
  createdAt: number; // gameTime(ms)。この時刻からの経過で寿命判定する。
  // GHOST-SUBS-FINAL(v0.25.2563): 置いた主語(守護霊のsummon.id)。undefined=プレイヤー。
  // 世界に置かれる物の配列は1本のまま(センサー地雷と同じ流儀)で、ダメージ倍率の評価だけ主語ごとに行う。
  ownerGhostId?: string;
  // SKILL_BUILD_REDESIGN.md §28(B7): 延焼弾(incendiary-round)Lv2/3の炎床は「小・モロトフ資産流用」
  // (§16-5)なので、molotovの火と**同じ配列/同じ描画/同じ寿命・DoT定数**に相乗りする。
  // 未指定=モロトフの半径(MOLOTOV_FIRE_RADIUS)のまま。指定時(Lv3の「炎床(大)」)だけ個体ごとに
  // 半径を上書きする(判定=絵は分類①なので、pixiScene側もradiusに比例して見た目を追従させる)。
  radius?: number;
}

// SKILL_BUILD_REDESIGN.md §28(B7): 血の履帯(blood-treads)が移動軌跡に残す棘。groundFire(molotov)と
// 同じ「set()で置く→毎フレームtickで寿命切れ回収+DoT」の流儀(1本の配列・判定を持つ床=分類①)。
// プレイヤー専用(molotovの「本人固定」と同じ扱い。守護霊対応は★未決)。
export interface BloodSpike {
  id: string;
  x: number;
  y: number;
  createdAt: number; // gameTime(ms)
}

// SKILL_BUILD_REDESIGN.md §28(B7): グラビティショット(gravity-shot)のキル時爆縮。中心固定の
// 「引き寄せ点」で、alchemyのレア吸引(summonUtils.ts)と同じknockbackVx/Vyベースの吸引を
// GRAVITY_SHOT_PULL_MS(0.4s)だけ適用する(判定なし=絵は分類②で派手に。CLAUDE.md負荷ルール=
// event-onlyの短命オブジェクトなので無料に近い)。
export interface GravityWell {
  id: string;
  x: number;
  y: number;
  radius: number;
  createdAt: number; // gameTime(ms)
  // 社長指示v0.25.3300 グラビティショット覚醒(Lv3): 2倍の長さで引き寄せ続ける。
  // 未指定=従来のGRAVITY_SHOT_PULL_MS(0.4s)。tick/描画の両方がこれを読む。
  durationMs?: number;
}

// ジブリルのランタン攻撃が足元に落とす紫の単発火(社長指示v0.25.1664)。groundFire(molotov)と違い
// 「プレイヤーに」当たるボスのハザード。0.7秒の赤い予告フェードイン→有効化→2秒で消滅。プレイヤーに触れると
// 30固定ダメージを与えてその火は即消える(単発)。判定/寿命は useGameLoop(tick)、描画は pixiScene が直読み。
export interface BossFire {
  id: string;
  x: number;
  y: number;
  spawnAt: number;    // 生成 gameTime(ms)。ここから activateAt までが赤い予告。
  activateAt: number; // spawnAt + 予告(0.7s)。これ以降ダメージ有効(紫の火)。
  expireAt: number;   // activateAt + 火寿命(2s)。これで消滅。
}

// PACING_PUZZLE.md §6.28-19(バッチM63): アクラシエルの結晶の槍(設置)。射出直後に地面へ刺さって
// 残り(非ダメージ)、fireAt(=生成+2秒)で一度だけ円形AoEに起爆して消える(スカジ氷/ジブリル火とは別の
// 「一撃だけの遅延起爆」形=ジャイアント踏み鳴らしと同型)。判定/寿命は angelBossTick.ts(tickAcrasielSpears)、
// 描画は pixiScene が直読み。skadiIceMarkers等の既存配管は流用せず専用配列にする(§6.28-13#12「共有定数を
// 書き換えない・専用定数を新設」の精神を配列にも適用=スカジの挙動に一切触れないため)。
export interface AcrasielSpear {
  id: string;
  x: number;
  y: number;
  angle: number;    // 射出方向(見た目=槍の向き)
  bornAt: number;   // 設置 gameTime(ms)
  fireAt: number;   // 起爆 gameTime(ms)
  damage: number;   // 起爆ダメージ(=生成時のenemy.damageを保持。ボス撃破後もハザードは独立して起爆する)
  enemyId: string;
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
  moving?: boolean;        // チュートリアル追従NPC用: false=静止(歩行アニメを止めて0コマ目)。未指定=常時行進(従来)
  advanceZone?: 'none' | 'front' | 'side' | 'rear'; // 進軍方向基準の四方位。境界ヒステリシス用に保持。
  advanceDirX?: number;    // 拠点到達時も使う最後の有効な進軍方向
  advanceDirY?: number;
  advanceSpeedMult?: number;  // 現在の進軍速度倍率(0/0.5/0.7/1の間を加速中なら補間)
  advanceSpeedTarget?: number;
  advanceRampFrom?: number;
  advanceRampAt?: number;     // gameTime。加速はここから1秒。
  strongNear?: boolean;       // 強敵接近の111px入/150px出ヒステリシス
  helpRequested?: boolean;    // 実際に救援要請した後だけ5秒の進軍ボーナスを得る
  rescuedUntil?: number;      // gameTime。救援成立後の通常速度ウィンドウ
}

// 装備スキル(サブウェポンとは別系統のパッシブ能力)。最大2装備。入手はゴールドガチャ、装備画面で所持から2枠選択。
// レア度: normal/rare/super(超レア=死神/バーサーカー/スケーター)。
export type SkillKey =
  // 超レア。SKILL_BUILD_REDESIGN.md §4(社長承認・確定): crit-up/sniperはここへ昇格。
  | 'reaper' | 'berserker' | 'skater' | 'overclock' | 'crit-up' | 'sniper'
  // BOT_AND_GHOST.md G3: 守護霊(ゴースト助っ人)。ガチャからは出ない+最初から所持(社長指示)。
  | 'guardian-spirit' | 'ghost-helper' | 'ghost-slayer'
  // レア
  | 'knight' | 'exploder'
  | 'bomber' | 'fire-shooter' | 'bomb-counter' | 'combo-master'
  | 'knife-master' | 'rescue-signal'
  // 通常。§4: sharpshooter/ricochet/punisher(flashy)/benkei/reflexはここへ降格。
  | 'sharpshooter' | 'ricochet' | 'punisher' | 'benkei' | 'reflex'
  | 'gold-rush' | 'time-keeper' | 'ghost-shooter' | 'dog-run' | 'counter-master' | 'slasher'
  | 'attack-shooter' | 'runner' | 'seeker' | 'scrap-builder'
  | 'magnet' | 'last-magazine' | 'warm-up'
  // PACING_PUZZLE.md §6.24 M48: 警察署アリーナ専用(ガチャからは絶対に出ない・GACHA_EXCLUDED_SKILLS)。
  | 'poi-bombing' | 'poi-guard' | 'poi-thrall'
  // SKILL_BUILD_REDESIGN.md §14(社長承認2026-08-13)・新スキル9種。§28(B7)で効果配線+
  // スターター入り済み(眠らせる仕組みNEW_SLEEPING_SKILLSは現在空配列)。
  | 'big-bullet' | 'ice-shot' | 'vampire' | 'incendiary-round' | 'execution-shock'
  | 'gravity-shot' | 'echo-shot' | 'barrage-king' | 'blood-treads';

// SKILL_BUILD_REDESIGN.md §23(消費カード5種・社長裁定2026-08-13「案B・30%60秒・あとは推薦で」):
// ガチャ外・デッキ所持に依存しない=全プレイヤー共通。ノーマル枠を1つ占有し、取得で即発動・
// 60秒で自動失効(温存不可)。名前・数値は全て叩き台(実機調整前提)。台帳は data/consumables.ts。
export type ConsumableKey = 'scrap-boost' | 'attack-doping' | 'speed-boost' | 'xp-boost' | 'protection';

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

// gone = 過去のプレイで完了(納品)済みのステージ: 二人はそのステージに以後出現しない(社長指示v0.25.1684)。
export type EventQuestStatus = 'available' | 'accepted' | 'completed' | 'gone';

export interface EventQuestNpc {
  x: number;
  y: number;
  radius: number;
  status: EventQuestStatus;
  questIndex: number;
  fadeStartedAt: number;
  // 会話サークル内の滞在時間(ms)。3秒(EVENT_QUEST_DWELL_MS)で自動受領(社長指示v0.25.1681=ポップアップ廃止・
  // 拠点解放と同じメーター表示)。サークル外へ出るとリセット。受領済みなら同じ3秒滞在で納品=完了。
  dwellMs: number;
  // 「直前のやり取り以降、一度サークルの外へ出たか」(生成直後は true=初回はそのまま受領可)。
  // false の間は滞在メーターが進まない=受領/納品の直後にその場に立ち続けても次の段階が即発火しない
  // (社長指示v0.25.1684の「また…すると完了」のガード。受領→納品→次クエスト受付の全てに適用)。
  leftSinceAccept: boolean;
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
  // GHOST-BULLET-TECH(BOT_AND_GHOST.md §2.9・**記録専用**): 発射元の技キー(moveReaction.tsの台帳)。
  // 「弾も技」=被弾を技別の反応表へ帰属させ、守護霊が弾技ごとの得手不得手を再現するために持つ。
  // **判定・ダメージ・弾の挙動・ボス側には一切影響しない**(createEnemyProjectileが1箇所で付ける)。
  srcMoveKey?: string;
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
  // Gun crit flag — legacy generation-time roll. CRIT-UNIFY §9.1(this batch) stopped rolling
  // this at fire time; new code should carry `critChance` instead and roll at hit time
  // (per-target: bosses get ×0.5+floor5%, normal enemies use critChance as-is). The field is
  // kept (always false/undefined for player bullets now) only because pixiScene.ts/
  // renderUtils.ts still branch on it for the in-flight gold bullet tint — that visual can no
  // longer be pre-determined (a piercing shot may crit one enemy and not the next), so it now
  // simply never lights up pre-impact; the post-hit crit FX (ring/burst/gold number/stun) is
  // unaffected since those already run off `hitCrit` computed at impact.
  crit?: boolean;
  // Crit chance (0..1) the shot carries from fire time. Rolled per-target at hit time via
  // `projectileHitCritChance` (src/utils/critPenalty.ts) — NOT a fixed roll — so the same shot
  // can crit against one enemy and not another (relevant for piercing/passthrough rounds).
  critChance?: number;
  // 発射時に「確定ヘッドショット」と決まった弾(BOT_AND_GHOST.md §2.11 裁定4=守護霊のPHILL再現)。
  // 着弾時ロールを通さずクリ確定にする(プレイヤーのPHILLは着弾位置=頭部リージョンで判定するので
  // このフラグは使わない=常にundefined)。
  headshot?: boolean;
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
  // 社長指示v0.25.3300 跳弾覚醒(Lv3): 跳弾からもう1回だけ抽選できる。二次跳弾(ricochet2)で打ち止め。
  ricochet2?: boolean;
  // 社長指示v0.25.3300 覚醒(Lv3)の延焼付き弾: ラストマガジン覚醒(弾倉最後の1セット)と
  // エコーショット覚醒(複製弾)が立てる。命中処理が延焼弾(incendiary-round)Lv1相当の燃焼を適用する
  // (延焼弾も所持していればそちらのLvが勝つ)。
  bonusIncendiary?: boolean;
  // SKILL_BUILD_REDESIGN.md §28(B7): エコーショット(echo-shot)が複製した弾か。複製弾自身のクリ命中
  // では再複製しない(無限連鎖防止・跳弾のricochetフラグと同じ役割)。
  echoed?: boolean;
  // SKILL_BUILD_REDESIGN.md §28(B7/§28-1): 弾幕の王(barrage-king)が反射弾に載せる体勢削り倍率
  // (×1.5/1.75/2.0)。damageEnemyのpostureImpactMultへそのまま渡す(既定1=無改変)。
  postureMult?: number;
  // explodeOnHit: 命中時に小爆発を起こす弾(ファイアシューター/ボムカウンター)。
  // explodeRadius/explodeDamageMult で爆発半径・周囲ダメージ倍率を指定。
  explodeOnHit?: boolean;
  explodeRadius?: number;
  explodeDamageMult?: number;
  // ボマー: 手榴弾が一度だけ子グレネードを散布して再アーム済みであることを示す(再散布の防止)。
  bomberSpawned?: boolean;
  // 社長指示v0.25.3438: グレネードガンt1/t2=手榴弾と同様に転がって、この道のり(px)に達したら爆発。
  // 値はt1=ショットガン距離/t2=ハンドガン距離(RANGE_BY_CATEGORY)。t3と流用弾(タレット/朱雀/爆撃の
  // 直進着弾爆発)には付けない=従来どおり。traveledPxは転がった道のりの累計(gameStoreの移動側が加算)。
  rollDetonatePx?: number;
  traveledPx?: number;
  // G2.6(BOT_AND_GHOST.md §2.8)+v0.25.2472「全てプレイヤーと同じく青白くして」:
  // ゴースト(守護霊)がオーナーとして発動したサブウェポンの生成物マーカー。**視覚専用**
  // (レンダラが青白tint/霊体αに使うだけ。判定・ダメージ・CD・挙動には一切使わない)。
  ownerGhost?: boolean;
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
  // 社長指示v0.25.3277: 武器箱(weapon-crate)が10%で「秘密兵器箱」に変化。金色に光って差別化し、
  // 拾うと大表示+武器抽選3回+赤経験値20個ばらまき。抽選はaddPickup(屋外のみ)で一度だけ行う。
  secret?: boolean;
  // v0.25.3137(社長指示「ステージ7(ボスモードも)は、最初に宝箱が目の前に初期設置」):
  // 宝箱(type='chest')の**中身の種類**。未設定=従来のボスドロップ(装備の選択メニュー)。
  // 'boss-start' = ステージ7の開幕宝箱(tier2-3の銃1丁 + 3レベルアップ)。
  // ★型で分けたのは、id 文字列や value に意味を持たせると「どの宝箱か」が読めなくなるため。
  chestKind?: 'boss-start';
  // Optional art variant. Treasure uses 1-6 to select the supplied object art.
  variant?: number;
  // Optional short throw arc for spawned pickups. Used by Striker's magazine
  // so the item visibly pops out from the player before landing.
  throwFromX?: number;
  throwFromY?: number;
  throwStartAt?: number;
  throwDuration?: number;
  scatterRadius?: number;
  // GHOST-SUBS-FINAL(v0.25.2563): 守護霊が**自分で投げた自分の物**(クイックマガジン)の主語。
  // §2.11追補3「霊体は世界の物に触れない」の裏返しで、これは世界のドロップではなく本人の設置物
  // なので本人だけが拾える(プレイヤーの拾得判定からは除外し、守護霊は自分のだけを拾う)。
  ownerGhostId?: string;
  // SKILL_BUILD_REDESIGN.md §13-3(B0発注文): type='strap'の発生元タグ(計測専用・挙動には一切
  // 使わない)。生成時に発生源が分かる箇所でだけ付ける最小の変更(pickupの発生元をここ以外から
  // 逆引きする手段が無いため)。未設定=計測対象外(現状すべての 'strap' 生成箇所にタグ済み)。
  scrapSource?: 'kill' | 'box' | 'poi' | 'levelup' | 'other';
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
  // 緑卵(mine)のみ(社長仕様v0.25.1846): 踏まれてアーム(起爆待ち)になったgameTime。
  // EGG_FUSE_MS後に爆発し、爆発範囲内の卵を連鎖アームする。undefined=未アーム。
  // 近接で割れば従来どおり無害解除(damageBreakablePropが除去=爆発しない)。
  armedAt?: number;
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
  // PACING_PUZZLE.md §5.21 M20: プレイヤーを円内に拘束するか(省略時=true=従来どおり)。
  // 囲いゲート1(ソフト=出られる)だけ false を明示し、それ以外(horde/boss/ゲート2)は従来どおり拘束する。
  confinesPlayer?: boolean;
  // PACING_PUZZLE.md §5.21-追補3(社長決定v0.25.1546): 円を敵に"入り自由"にするか(省略時=false=
  // 従来どおり「円外の非fromEvent敵は逃走モード」)。ゲート1だけ true を明示し、通常沸きのchaffが
  // 境界を越えて円内へ流れ込めるようにする(gameStore.ts の arenaConfiningFlee 参照)。
  permeable?: boolean;
  // PACING_PUZZLE.md §6.24 M48: 警察署アリーナ(寄り道POI)由来の horde イベントか。全滅クリア時に
  // 専用スキルを1つランダム付与する(useGameLoop の cleared 分岐が見る)。通常の退屈アリーナと
  // 挙動は同じ(kind:'horde'を共用)なので、この1フラグだけで報酬経路を分岐する。
  policeArena?: boolean;
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
  | 'card-key' | 'lab-clear-item' | 'ammo-phill'
  // §6.38 B3(賞金首の金箱): 討伐で1個ドロップする専用pickup。見た目=gold-chest素材。
  // 開封=秘密兵器箱の開封機構を流用するが武器は入れない(トレジャー×2+スクラップのみ)。
  | 'bounty-chest';

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
  // 'heal'=HP30%回復(①②カンスト時の代替)、'knife'=ナイフを次Tierへ強化(選択肢③の25%置換)、
  // 'skill'=SKILL_BUILD_REDESIGN.md §12-1のスキル専業レベルアップ(新規取得 or Lv+1)、
  // 'consumable'=§23の消費カード(取得で即発動・60秒・ノーマル枠を1つ占有)。
  // 'weapon'/'passive'/'subWeapon' は旧仕様の残置。
  type: 'weapon' | 'passive' | 'subWeapon' | 'equipment' | 'scrap' | 'heal' | 'knife' | 'skill' | 'consumable';
  weaponType?: WeaponType;
  passiveType?: PassiveType;
  subWeaponKey?: SubWeaponKey;
  equipDefId?: string; // type==='equipment' のとき装備定義ID(data/equipment.ts)
  knifeKey?: string;   // type==='knife' のとき置換する次Tierナイフの CATALOG キー
  level: number;       // 装備=ランク(特殊=0)、scrap=獲得量、knife=次Tier。skill/consumableは使わない(常に0)。
  // type==='skill' 専用フィールド(§12-2軽微「levelを流用せず専用フィールドskillLv」)。
  skillKey?: SkillKey;
  skillCardKind?: 'new' | 'levelup'; // 新規取得 or 所持済みのLv+1
  skillRarity?: 'normal' | 'rare' | 'super'; // data/campaign.ts SkillRarity と同じ値域(循環import回避のため再掲)
  skillFromLv?: number; // 表示用の遷移元Lv(新規=0、Lv+1=現在Lv)
  skillLv?: number;     // このカードを取ると到達するLv
  // type==='consumable' 専用フィールド(§23)。
  consumableKey?: ConsumableKey;
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
      // 常に画面下方向へ加える重力加速度(px/s²)。血飛沫だけ指定=弧を描いて落ちる。
      // 未指定=0で従来の他パーティクル(火花/egg fluid等)は挙動不変。
      gravity?: number;
      // 血飛沫用(v0.25.2041): 速度方向に粒を伸ばして線状の飛沫として描く(描画のみ)。
      // 指定時はハイライト芯も白(未指定=既存の他パーティクルは見た目不変)。
      stretch?: boolean;
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
      // v0.25.3078(社長指示「本体からそれらが扇状にドバッ!と全方位に飛んでいくモーション」):
      // 静止画エフェクトに**向き**と**外へ流れる速度**を持たせる。未指定なら従来どおり(回転0・静止)。
      rot?: number;        // ラジアン(絵の向き)
      driftX?: number;     // world px/秒(生成位置からの流れ)
      driftY?: number;
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
      // 爆発の6コマflipbook(社長支給ドット素材v0.25.3283「爆発 全部用」)。x/y=爆心、radius=判定半径。
      // 絵の幅は判定直径に合わせる(判定を持つ絵=サイズは判定準拠・派手側の多少のはみ出しは許容)。
      kind: 'explosion';
      id: string;
      x: number; y: number;
      radius: number;
      createdAt: number;
      duration: number;
      tint?: number; // 守護霊発は青白等(未指定=素のまま)
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
      // SKILL_BUILD_REDESIGN.md §28(B7) 吸血: キル地点から**生きているプレイヤー位置へ**吸い込まれて
      // いく血粒(社長指示v0.25.3276)。終点は描画側が毎フレームのプレイヤー中心を読む(=ホーミング。
      // trailの固定終点では追従できないため専用kind)。視覚のみ・判定なし=分類②。
      kind: 'drain';
      id: string;
      fromX: number; fromY: number;
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
      // SKILL_BUILD_REDESIGN.md §24: 強glowの「絵」(半径・α)はそのまま出しつつ、pixiScene.ts の
      // 支配光(syncShadowsV9のglowLights=CLAUDE.md「投影影」)への参加だけを断つオプトアウト。
      // 既定undefined(=false)なので既存の呼び出しは1件も挙動が変わらない(視覚専用フラグ)。
      noShadow?: boolean;
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
      // 血飛沫(3コマ flipbook)。銃=被弾敵の背中側(弾の出口方向)へ/近接(melee)=敵からプレイヤーへ向かって飛ぶ。
      // angle=飛散方向(rad・+x基準)。len=噴出の長さ(px)。anchor=傷口(尖端)。素材の向きはmeleeで逆(描画側で吸収)。
      kind: 'blood';
      id: string;
      x: number; y: number;
      angle: number;
      len: number;
      createdAt: number;
      duration: number;
      melee?: boolean;
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
    }
  | {
      // PACING_PUZZLE.md §5.23 M22 Group C3: 1スイング/1発で複数の敵に当たった時の
      // 「N HITS」バナー(プレイヤー頭上・bitmap-text)。countは表示する命中数。
      kind: 'multiHit';
      id: string;
      x: number; y: number;
      count: number;
      createdAt: number;
      duration: number;
    };
