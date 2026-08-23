import { DifficultyRank, EnemyColorTier, Enemy, EnemyType, GameBounds, Player, Projectile, Summon } from '../types/game';
import { normalizeChaffMix, type ChaffMix } from './chaffMix';
import { projectileMoveKeyForEnemy } from './moveReaction'; // GHOST-BULLET-TECH: 弾へ載せる技キー(記録専用)
import { GATE_BOSS_HEALTH, HIDDEN_BOSS_HEALTH, GUARDIAN_PHANTOM_PLACEHOLDER_HEALTH } from '../config/bossHealth';
import { effectiveDifficultyArea, lerpAreaTable } from './timeDifficulty';
// 当たり判定の「帯」(視覚と分離した gameplay の矩形)。射程を測る相手の矩形として使う。
// renderSpec は utils を逆輸入しない(types と cameraZoom だけ)ので循環しない。
import { enemyHitStrip } from '../pixi/renderSpec';

// 固定ビュー矩形からの「画面外」バンド(px・社長指示Bで具体値決め直し)。全辺一律で「画面端から○px外」を意味する。
// 固定ビューにしたので画面サイズ比ではなく固定px。SPAWN<RECYCLE のヒステリシスで湧いた敵が即リサイクルされない。実機で微調整可。
export const OFFSCREEN_SPAWN_MARGIN = 140;    // ビュー矩形の外側この距離で湧く(全辺一律)
export const OFFSCREEN_RECYCLE_MARGIN = 240;  // ビュー矩形の外側この距離を超えたら画面外送り(湧き直し)。社長指示で 420→240=すぐ回収

// ステージ6(洋館・奥行き通路)の湧き方向ゲート(社長指示・とりあえず統合v0.25.2105)。
// trueの間、通常湧き(generateEnemy=新規湧き+距離リサイクルの両方)は「上(奥)主体・一部下(手前)」から
// のみ湧かせ、左右(=壁)からは湧かせない。setTreesDisabled 等と同じく resetGame が毎ラン設定する。
// 湧き数・敵種・AI・当たり判定は不変(=位置の左右→上下振り分けだけ)。
let corridorSpawnEnabled = false;
export const setCorridorSpawn = (enabled: boolean): void => { corridorSpawnEnabled = enabled; };
// research/STAGE_DIFFICULTY.md(ステージ難度の階段): 雑魚のHP/攻撃に掛かるステージ係数。
// setCorridorSpawn / setTreesDisabled と同じ既存作法で **resetGame が出撃のたびに1回セットする**
// (通常出撃=選択ステージの係数 / ボスメーカー・ガントレット=1.0=計測路の中立化)。
// 台帳の値は config/stageDifficulty.ts。ここは受け取るだけ(このモジュールは台帳を読まない=
// 出撃ごとに1回で済む値を毎スポーンで引き直さない)。
let stageDiffHpMult = 1;
let stageDiffDmgMult = 1;
export const setStageDifficultyMults = (hp: number, dmg: number): void => {
  stageDiffHpMult = hp;
  stageDiffDmgMult = dmg;
};
// 上(奥)から湧く比率(叩き台=上7:下3)。定数化して調整可能に(社長指示)。
// v0.25.2151(社長指示「敵が終盤まで出てこない。最初に戻して」): v2128の上のみ(1.0)を撤回し、
// 最初(v2105)の上7:下3へ復帰=下(手前)からも湧いて序盤から接敵する。
export const CORRIDOR_SPAWN_TOP_RATIO = 0.7;

// Mad-Forest port: a stat sheet per enemy type. Difficulty multiplier scales
// the base values over time so a 25-minute zombie has more HP than a 1-minute
// zombie, mirroring how VS ramps. Spawn weights for each type live in the
// stage director (selectEnemyType) below.
interface EnemyStats {
  width: number;
  height: number;
  speed: number;       // px/s at base difficulty
  health: number;
  damage: number;
  experienceValue: number;
}

export const ENEMY_STATS: Record<EnemyType, EnemyStats> = {
  // v0.25.2874(社長指示「bat skeleton両方少し大きく、当たり判定も合わせて」): 22→26。
  // 描画枠は width×ENEMY_VISUAL_SCALE なので、判定を上げると絵も同じ比率で大きくなる。
  bat:       { width: 26, height: 26, speed: 75,  health: 8,    damage: 6,   experienceValue: 1 },
  // v0.25.2874(同上): 26→31。
  skeleton:  { width: 31, height: 31, speed: 60,  health: 18,   damage: 8,   experienceValue: 1 },
  // v0.25.2878(社長指示「ゾンビも同じ分だけ大きくして」): 30→36。bat(+18.2%)/skeleton(+19.2%)と同幅。
  zombie:    { width: 36, height: 36, speed: 42,  health: 40,   damage: 10,  experienceValue: 2 },
  plant:     { width: 28, height: 28, speed: 8,   health: 25,   damage: 0,   experienceValue: 2 },
  // 変異体(抱卵型・旧ghost): 直進せずプレイヤーの周囲を周回し、1秒ごとに緑卵(mine)を撒く(AIは store)。internal idは'ghost'のまま。
  ghost:     { width: 24, height: 24, speed: 48,  health: 26,   damage: 6,   experienceValue: 3 },
  werewolf:  { width: 30, height: 30, speed: 105, health: 32,   damage: 12,  experienceValue: 3 },
  pumpkin:   { width: 40, height: 40, speed: 55,  health: 150,  damage: 16,  experienceValue: 8 },
  // PACING_PUZZLE.md §9-2(削岩型): 判定サイズ・HP・攻撃・経験値=パンプキンと同値(「同格」)。
  // speed=75=bat と同値(社長指示「歩く速さはバットくらい」)。
  driller:   { width: 40, height: 40, speed: 75,  health: 150,  damage: 16,  experienceValue: 8 },
  // 新型(lich・ステージ4): 速度はゴースト(90)の1.2倍=108。旋回しながら詰めてくる(AIは store)。
  lich:      { width: 30, height: 30, speed: 108, health: 36,   damage: 12,  experienceValue: 4 },
  // 城ボス(ジャイアント)。ここは生成時の互換値(×ENEMY_HP_MULT=実効2500)。**出現時に台帳の値へ置換される**
  // ので、この500が最終的なHPになることは無い(置換は useGameLoop:2545 城ボス / :2620 ストーリーボス)。
  // ※v0.25.3164まで**ストーリーボス(グレン/EX)だけ置換を通っておらず、実効2500のまま戦っていた**。
  giantbat:  { width: 60, height: 60, speed: 70,  health: 500,  damage: 19,  experienceValue: 30 },
  reaper:    { width: 80, height: 80, speed: 130, health: 4000, damage: 999, experienceValue: 0 },
  // 研究所専用ゾンビ(通常敵データ参考)。Lv1=雑魚〜 / Lv2=変異(中) / Lv3=巨体(パンプキン相当)。動きは通常チェイス。
  // 社長指示: 耐久値(health)はデフォルトに戻す(2倍化を撤回)。damage は据え置き(2倍のまま)。
  // 研究所(ステージ2)の敵は耐久値を全員2倍(社長指示)。lab-zombie はこのステージ専用。
  'lab-zombie-1': { width: 28, height: 28, speed: 52, health: 80,  damage: 20, experienceValue: 4 },
  'lab-zombie-2': { width: 34, height: 34, speed: 105, health: 180, damage: 28, experienceValue: 8 }, // 速度を犬(werewolf)と同じ105へ(社長指示=研究所の犬が遅い対策)
  'lab-zombie-3': { width: 46, height: 46, speed: 48, health: 320, damage: 36, experienceValue: 20 },
  // 裏ボス(ステージ1=ミーミル / ステージ3=ヨルムンガルド)。仕様は共通(社長指示):
  //  ・大きさ=通常ジャイアント(giantbat 60)の約3倍 ・速度=ジャイアントと同じ(70)
  //  ・耐久=ジャイアントの3倍 ・攻撃力(接触)=ジャイアントの2倍。
  // 攻撃は固定値。耐久はbossHealth.tsのステージ進行表をそのまま使う。
  // 裏ボスの width/height は「当たり判定の帯(足元の四角・社長指定)」。絵はこれより大きくフル表示する
  // (pixiScene の BOSS_SPRITE_FIT で帯=絵の下部に合わせて配置)。見た目=絵 / 判定=この帯、で分離。
  // 帯サイズは素材アスペクト×指定フレームから算出(BOSS_SPRITE_FIT と整合させること)。
  // 裏ボスは hpMult を掛けず health をそのまま maxHealth にする(buildEnemy 参照)。個別指定(社長指示)。
  // 帯(=当たり判定/見た目の基準)を ×1.5(社長指示「敵すべて1.5倍・ボスも」)。絵は BOSS_SPRITE_FIT で帯基準に追従。
  // v0.25.3022(社長指示「ミーミルの大きさ少しだけ小さくして」): 248×138→223×124(-10%)。
  // 絵は帯幅から導出(BOSS_SPRITE_FIT)なので判定と同率で縮む=見た目と判定の整合は不変。
  mimir:      { width: 223, height: 124, speed: 90, health: HIDDEN_BOSS_HEALTH.mimir,      damage: 38, experienceValue: 0 },
  jormungand: { width: 519, height: 90,  speed: 90, health: HIDDEN_BOSS_HEALTH.jormungand, damage: 38, experienceValue: 0 },
  // 社長修正指示(v0.25.1321〜): スカジは帯を今の2/3スケールへ縮小(456×102→304×68)。
  skadi:      { width: 304, height: 68,  speed: 90, health: HIDDEN_BOSS_HEALTH.skadi, damage: 38, experienceValue: 0 },
  // 裏ボス(ステージ5=トール)。耐久はbossHealth.tsの段階表でトールが最上位。
  // 社長修正指示(v0.25.1321〜): 帯を半分スケールへ縮小(280×140→140×70。大きすぎるとの報告)。
  // 社長修正指示(通常移動速度): 最終速度(buildEnemyでENEMY_SPEED_MULT=2/3が掛かった後)を
  // PLAYER_BASE_SPEED(gameStore.ts=87)×5/4=108.75にしたいので、ここの生値は
  // 108.75÷(2/3)=163.125→163(他の裏ボス=speed90=仕様共通、という前提を崩す個別指定・社長明示)。
  thor:       { width: 140, height: 70,  speed: 163, health: HIDDEN_BOSS_HEALTH.thor, damage: 38, experienceValue: 0 },
  // PACING_PUZZLE.md §5.21-追補8: ゲート2ボス(天使名ボス1体目)=ミゲル。stageのhiddenBossではなく
  // ゲート2(useGameLoop.ts)がfromEventでスポーンする。isHiddenBoss経由でhpMult=1固定。
  // HPはbossHealth.tsの登場順カーブ、与ダメ38は従来どおり。
  // 社長指示v0.25.1594「天使系ボスの大きさ半分で」: 表示幅=width/BOSS_SPRITE_FIT.w なので当たり寸(帯)を
  // 半分にすると絵も当たりも一緒に半分になる(視覚と当たりがズレない)。width120→60・height60→30。
  miguel:     { width: 60, height: 30, speed: 70, health: GATE_BOSS_HEALTH.miguel, damage: 38, experienceValue: 0 },
  jibril:     { width: 60, height: 30, speed: 70, health: GATE_BOSS_HEALTH.jibril, damage: 38, experienceValue: 0 },
  rafi:       { width: 60, height: 30, speed: 70, health: GATE_BOSS_HEALTH.rafi, damage: 38, experienceValue: 0 },
  uri:        { width: 60, height: 30, speed: 70, health: GATE_BOSS_HEALTH.uri, damage: 38, experienceValue: 0 }, // ステージ5ゲート2ボス
  suriel:     { width: 60, height: 30, speed: 70, health: GATE_BOSS_HEALTH.suriel, damage: 38, experienceValue: 0 }, // ステージ6ゲート2ボス
  // §6.28-19: アクラシエルは脚も顔も向きも無い結晶=歩かない(speed:0)。代わりに転移(台本はL2の担当)で動く。
  acrasiel:   { width: 60, height: 30, speed: 0,  health: GATE_BOSS_HEALTH.acrasiel, damage: 38, experienceValue: 0 }, // EXゲート2ボス
  // §6.28-20: stage-2隠しボス。天使系より一回り小さい判定+高速+高耐久(叩き台・実機調整前提)。
  idol:       { width: 40, height: 20, speed: 150, health: HIDDEN_BOSS_HEALTH.idol, damage: 30, experienceValue: 0 },
  // ハンター変異体(イベント専用・通常プールには入れない)。強さは通常敵と同じ計算式に乗せる
  // (CONSTANT_STRENGTH_TYPES には入れない=エリア/距離・色でスケール)。社長指示の規定値:
  //  実効「耐久6000・攻撃40」スタート → 通常式 health×(ENEMY_HP_MULT=5)×areaDiff を踏まえ
  //  base health=1200(=6000/5)、base damage=40(非fixed: damage×areaDiff)。深いエリアほど上昇。
  //  近接フィニッシュは即死しない(isBossType=true=ボス級のクリットダメージ扱い)。
  hunter:     { width: 56, height: 64, speed: 41, health: 1200, damage: 40, experienceValue: 120 }, // 歩き82→41(社長裁定v0.25.2429「歩く距離を半分に」=走れば逃げ切れる)
  // 変異体(叫喚型・イベント専用=通常プールに入れない。useGameLoop のディレクターが同時1体だけ出す)。
  // 役割は周囲の通常敵の一時強化。直接火力は弱め(接触6)、HPも低め(社長指示で60→20)=叫ぶ前に
  // 素早く倒して阻止できる優先処理対象。
  screamer:   { width: 36, height: 36, speed: 55, health: 20, damage: 6, experienceValue: 3 },
  // PACING_PUZZLE.md §6.38(賞金首・B1): 体格=ヘビー級叩き台(パンプキン40〜lab-zombie-3 46帯)。
  // health はここでは実質使わない(CONSTANT_STRENGTH_TYPES=hpMult固定+スポーン後パッチで
  // 2000×timeDifficultyへ上書きされる。§3)。移動=1枚絵グライド(bob最小)なので速度は控えめ。
  // damage(接触)は giantbat(19)基準の叩き台。experienceValue=0(討伐報酬は金箱が担う・§3)。
  'bounty-ranged':  { width: 44, height: 44, speed: 50, health: 2000, damage: 18, experienceValue: 0 },
  'bounty-melee':   { width: 44, height: 44, speed: 50, health: 2000, damage: 18, experienceValue: 0 },
  'bounty-balance': { width: 44, height: 44, speed: 50, health: 2000, damage: 18, experienceValue: 0 },
  'bounty-maiko':   { width: 44, height: 44, speed: 50, health: 2000, damage: 18, experienceValue: 0 },
  // research/GHOST_BOSS.md(守護霊ボス「幻影」): 体格=プレイヤー級(40×56)。
  //  ・speed=130(★社長裁定v0.25.3631「プレイヤー並みにして」): 敵は buildEnemy で
  //    ×ENEMY_SPEED_MULT(2/3)が掛かるため、**実効値がプレイヤー(PLAYER_BASE_SPEED=87)と同等**に
  //    なるよう生値を 87×3/2≈130 で指定する(トールが同じ理由で生値を明示指定している前例)。
  //    固定強度タイプなので areaSpeed は 1。
  //  ・damage=0 = **接触では削らない**(決闘仕様: 技だけがプレイヤーを削る)。
  //  ・health は**プレースホルダ**。CONSTANT_STRENGTH_TYPES + hpMult 固定(下の buildEnemy)で倍率は
  //    一切通らないが、実効HPは**スポーン側が必ず上書きする**(useGameLoop の幻影スポーン1箇所で
  //    guardianPhantomHealth(player.ddaBaseHp)=育成込みの初期プレイヤーHP・research/GROWTH.md v4)。
  //    ENEMY_STATS は import 時評価で焼かれるため、ここに育成を含む値は書けない。
  'guardian-phantom': { width: 40, height: 56, speed: 130, health: GUARDIAN_PHANTOM_PLACEHOLDER_HEALTH, damage: 0, experienceValue: 200 },
  // PACING_PUZZLE.md §10(EXボス「フィル(変異体)」・バッチ1「器」): 帯=スリィエル級(60×30)、
  // speed=70(叩き台)。health=500はプレースホルダ(giantbatの旧仕様と同じ意味=**スポーン直後に
  // STAGE_BOSS_HEALTH_BY_STAGE['stage-ex1']で必ず上書きされる**。CONSTANT_STRENGTH_TYPES編入により
  // その上書きが唯一の実効HP。damage=38は他の天使/裏ボスと同じ叩き台(接触・技はバッチ2)。
  phillboss: { width: 60, height: 30, speed: 70, health: 500, damage: 38, experienceValue: 0 },
};

/** PACING_PUZZLE.md §6.38(賞金首・B1): 4型の集合。texture名=type規約(getTexture(e.type))。 */
export const BOUNTY_ENEMY_TYPES = new Set<EnemyType>(['bounty-ranged', 'bounty-melee', 'bounty-balance', 'bounty-maiko']);
export const isBountyType = (t: EnemyType): boolean => BOUNTY_ENEMY_TYPES.has(t);

/**
 * research/GHOST_BOSS.md: 守護霊ボス「幻影」か。
 *
 * **専用述語を置く理由**(isHiddenBoss と同じ作法): この型は `updateEnemies` の通常追跡AI・接触処理を
 * **素通りさせる**必要がある(動かすのは phantomTick だけ=二重駆動の禁止)。型名の直書きを各所へ
 * 撒くと必ず1箇所取りこぼすので、判定はここ1本にする。
 */
export const isGuardianPhantom = (t: EnemyType): boolean => t === 'guardian-phantom';

// 裏ボス共通判定(完全に同一仕様。stage で見た目/名前だけ変わる)。
// miguel(ゲート2ボス)もここに含める: updateEnemies の通常追跡AIから除外(専用コントローラが座標を
// 直接書き込む)/帯AABB基準の近接判定/BOSS_SPRITE_FIT描画 等、他の裏ボスと共通の土台に乗せるため
// (PACING_PUZZLE.md §5.21-追補8のExplore地図チェックリスト)。
// PACING_PUZZLE.md §6.28(バッチM52・ロットL1): uri/suriel/acrasiel(ゲート2の天使ボス4〜6体目)と
// idol(stage-2隠しボス)を追加。台本(移動/攻撃)はL2/L3の担当だが、hpMult=1固定(=ENEMY_STATSの
// 基本値がそのまま実効値になる。§6.28-1-1)・updateEnemiesの通常AIからの除外は今のうちに揃えておく。
// PACING_PUZZLE.md §10-12#6(フィル編入): phillbossもここへ入れる。理由=「専用コントローラが座標を
// 直接書き込む」型として扱う必要がある(通常追跡AI/分離力/地平線以外のモーションFXから除外し、
// 生のAABB=ENEMY_STATSの帯+BOSS_SPRITE_FITで絵を追従させる)。
// ★v0.25.3721訂正(検収監査#3): バッチ2で phillboss は **isGate2AngelBoss にも入れた**(下の209行=
// angelBossTickがtickする唯一の根拠)。旧コメント「入れない」はバッチ1時点の記述で誤り。
// フィルはゲート2の"関所ボス"ではないが、器としてはゲート2天使と同じディスパッチャに乗っている。
export const isHiddenBoss = (t: EnemyType): boolean => t === 'mimir' || t === 'jormungand' || t === 'skadi' || t === 'thor' || t === 'miguel' || t === 'jibril' || t === 'rafi' || t === 'uri' || t === 'suriel' || t === 'acrasiel' || t === 'idol' || t === 'phillboss';

/**
 * ★**射程を測る相手の矩形 = その敵の当たり判定そのもの**(唯一の出どころ)。
 * 裏ボス/天使/idol は生のAABB、それ以外は足元の「帯」(`enemyHitStrip`)。
 * 近接(`gameStore.enemyMeleeDist`)も銃(`aimEnemyDist2`)もここを見る=**測る相手が1つ**になる。
 */
export const enemyRangeRect = (e: Enemy): { x: number; y: number; width: number; height: number } =>
  isHiddenBoss(e.type)
    ? { x: e.x, y: e.y, width: e.width, height: e.height }
    : enemyHitStrip(e);

// 銃の照準/射程ゲート用の二乗距離(v0.25.2567でweaponUtils.aimDist2の中身をここへ移設=正本)。
// プレイヤー(weaponUtils)と守護霊(ghostDriver)が**同じこの1本**を使う
// (§2.11追補ドクトリン: ルール=式は共有・二重実装しない)。
//
// ★v0.25.3170(社長指摘「そもそも、ボスの中心からの距離しか見てなく無い？ 当たり判定の四隅でみて」):
// **全ての敵で「当たり判定の矩形の最近点」まで**測る。旧実装は `isHiddenBoss`(裏ボス4+天使6+idol)
// **だけ**が最近点で、**giantbat(城ボス/グレン)・pumpkin・lab-zombie-3・hunter・reaper は中心基準**
// だった。この5つは巨体なので、体の縁に立っていても中心までの距離で弾かれる=**射程が実質短くなる**
// (giantbat の帯は約76×70pxなので横からだと約38px、ハンドガン射程176pxの2割強を損していた)。
// v0.25.2567 の是正が「裏ボスだけ」で止まっていた取りこぼし。
export const aimEnemyDist2 = (pcx: number, pcy: number, e: Enemy): number => {
  const r = enemyRangeRect(e);
  const nx = Math.max(r.x, Math.min(pcx, r.x + r.width));
  const ny = Math.max(r.y, Math.min(pcy, r.y + r.height));
  return (pcx - nx) * (pcx - nx) + (pcy - ny) * (pcy - ny);
};

// ゲート2の天使ボス(ミゲル/ジブリル/ラフィ/ウリ/スリィエル/アクラシエル)。裏ボスの部分集合=
// ゲート2から fromEvent スポーンされ、専用コントローラ(bossState機械)で動き、ミゲルの攻撃描画を
// 流用する型。将来の天使を足す時はここ1箇所に追加する。idolはゲート2ではないため含めない。
// PACING_PUZZLE.md §10(フィル・バッチ2): フィルはゲート2ボスではない(最奥ボス)が、angelBossTickの
// 7人目として同じディスパッチャ(runAngelBossTick)に拾わせるためここへ編入する(isHiddenBossとの
// 二重編入は既存6体と同じ形=専用コントローラが座標を書く型+通常AI/生AABBの両方が必要)。
export const isGate2AngelBoss = (t: EnemyType): boolean => t === 'miguel' || t === 'jibril' || t === 'rafi' || t === 'uri' || t === 'suriel' || t === 'acrasiel' || t === 'phillboss';

// Big set-piece enemies. They use a different crit ruleset (no instant melee
// finisher; crits hit much harder instead).
// PACING_PUZZLE.md §6.38 v7(社長裁定2026-08-15「改めて城ボスをコピーして作り直して」): 賞金首4種
// (bounty-*)をフル編入。「ボスの一部だけ借りる」特例パッチ構成(v2/v6)が埋め漏れ(致命の一撃不発・
// 紫解除されず・クリ絞り対象外・ボム/リーパー波及で即死しうる…)を量産したため、**この1テーブルへ
// 入れるだけでボス系の全既定が付く形**に統一する(v7の方針転換)。isBountyType(=isEliteType/
// isArenaSweepProtected/getsDramaticDeath/corpseEligible等で個別に足していた賞金首専用の
// 迂回路)は本表へ入れたことで大半が自動的に不要になる=各所の重複を撤去した(v7実装ログ参照)。
// PACING_PUZZLE.md §9-7#1(社長指示 2026-08-20・監査反映v2): 「同格」を述語1本で機械化する。
// pumpkin(ウェーブ枠のエリート)と driller(削岩型・同じ枠を分け合う「同格」の新型)は、
// isBossType/isEliteType等のpumpkin特別扱いを全てこの述語経由で共有する。
// ★講習(reliefProgram)・囲いミニボス(useGameLoop:3255)・ホードN体目(useGameLoop:3319)・
// botObjective・アイコン等の「pumpkin固有」(§9-7②)はこの述語を通さない=対象外のまま。
export const isPumpkinTier = (t: EnemyType): boolean => t === 'pumpkin' || t === 'driller';

export const isBossType = (t: EnemyType): boolean =>
  isPumpkinTier(t) || t === 'giantbat' || t === 'reaper' || t === 'lab-zombie-3' ||
  t === 'mimir' || t === 'jormungand' || t === 'skadi' || t === 'thor' || t === 'miguel' || t === 'jibril' || t === 'rafi' ||
  t === 'uri' || t === 'suriel' || t === 'acrasiel' || t === 'idol' || t === 'phillboss' || t === 'hunter' || isBountyType(t) ||
  // research/GHOST_BOSS.md: 幻影もボス扱いの全既定(HPバー/体勢値=紫/致命の一撃/崩壊演出/
  // 弾の小突きノックバック耐性…)をこの1テーブルから受け取る。
  isGuardianPhantom(t);

/**
 * 囲い/救助イベント開始時の周辺一掃(`beginArenaEvent`/`beginRescueEvent`)で残す(=消さない)個体か。
 * §6.38 v6 B(賞金首)の保護3箇所のうち③。両イベントが同じ条件を複製していたので1箇所へ集約
 * (社長指示「一掃」= reaper/giantbat/pumpkin/裏ボス系/固定敵/クエスト対象は従来どおり残し、
 * 賞金首もここへ追加登録する)。
 */
export const isArenaSweepProtected = (e: Pick<Enemy, 'type' | 'fixed' | 'questTarget'>): boolean =>
  e.type === 'reaper' || e.type === 'giantbat' || isPumpkinTier(e.type) ||
  isHiddenBoss(e.type) || isBountyType(e.type) || !!e.fixed || !!e.questTarget;

/**
 * ★クリティカルを「ボス式」(=固まらず**移動半減+CD2倍**・v0.25.2422/CRIT-UNIFY §9.2)で受ける型か。
 *
 * 社長指示v0.25.3169「パンプキン、クリティカルもちゃんと固まるように。紫は無い。ボスでは無いので。
 * 研究所レベル3も同じく」。**pumpkin / lab-zombie-3 は `isBossType` には入るが厳密にはボスではない。**
 *
 * なぜこの2体だけ外すのか(後任が「ボスなのに揃っていない」と言って戻さないように):
 * ボス式クリは「5秒の完全停止だとソウル式の**技を読む**戦いが成立しない」という理由で入れた仕組みで、
 * **紫(完全気絶=`applyBossPostureDamage`)へ向かう読み合いとセット**の設計。その紫の入口である
 * `isEngageableBoss` に、この2体は**そもそも入っていない**(=何をしても紫にならない)。
 * つまり「固まらない」不利だけを受け取り、見返りの紫が無い状態だった。⇒ 通常敵と同じ
 * 「クリ=固まる」へ戻す。**ここが唯一の出どころ**(半減窓とCD2倍の両方がこれを見る)。
 */
export const usesBossCrit = (t: EnemyType): boolean =>
  isBossType(t) && !isPumpkinTier(t) && t !== 'lab-zombie-3';

/**
 * ★弾・爆発の「小突きノックバック」で押されない型か(社長裁定v0.25.3494・案A)。
 *
 * 経緯(この関数が生まれた事故): 命中した全弾の共通ノックバック口(useGameLoop.ts)は
 * `type !== 'reaper' && type !== 'giantbat' && type !== 'pumpkin'` という**型名のベタ書き**で
 * 「重量級/ボスは弾では押されない」を表現していた(コメントにも "Heavies/bosses are immovable
 * so they don't get shoved around by chip damage" と明記)。ところが賞金首(bounty-*)も裏ボスも
 * **後から `isBossType` へ編入されたのにこのリストへ足されなかった**ため、実体は「城ボスだけ
 * 押されない」だった。そこへ v0.25.3476「ノックバックしたら技は中断」が乗り、
 * **小ボスは弾1発ごとに技が中断されて何も出せない**という実機バグになった(社長報告v0.25.3494)。
 *
 * ⇒ 型名リストをやめ、**「本当のボス(usesBossCrit)+パンプキン」**を唯一の出どころにする。
 * `pumpkin` を明示で足しているのは、usesBossCrit が(クリの扱いを通常敵へ戻すという別の理由で)
 * pumpkin/lab-zombie-3 を外しているため——**押されなさ**の観点ではパンプキンは従来どおり重量級側。
 * `lab-zombie-3` は従来から押される側なので、ここでは足さない(挙動を勝手に変えない)。
 *
 * 対象は**弾と爆発だけ**(社長裁定の範囲)。シールドバッシュ/犬/救急鞄/踏み鳴らし/四神/
 * スラッシャー追撃のような「押すことが目的の道具」は従来どおりボスも押す=そこで技が中断するのは
 * 意図どおりの挙動。
 */
export const resistsChipKnockback = (t: EnemyType): boolean =>
  usesBossCrit(t) || isPumpkinTier(t);

/** 「最終ボスを討伐した」扱いにしてよいキルか(v0.25.3029・社長裁定「二体」)。
 * グレン形態1(glenForm===1)の死はミッション進行を確定させない(討伐アテンションの後に形態2が湧く)。
 * 従来の散在パターン(type==='giantbat' && !fromEvent)の**唯一の後継**——finaleDefeated/bossKilled/
 * クリアフラグ/年表の判定は必ずこれを通す(監査指摘: 写し漏れ防止)。 */
export const isFinalBossKill = (e: Pick<Enemy, 'type' | 'fromEvent' | 'glenForm'>): boolean =>
  e.type === 'giantbat' && !e.fromEvent && e.glenForm !== 1;

/**
 * 討伐時に「アテンション」(時間停止 + カメラが現地へ寄って戻る)を出す対象か。
 *
 * ★`pumpkin` は除外(社長指示v0.25.2879)。パンプキンは**ウェーブで湧くエリート枠**で、
 * ボス系の中で唯一「1ランに何度も倒す」相手。そのたびに世界が止まってカメラが寄ると、
 * 刈る手触り(§コアループ①秒)が毎回途切れる。**崩壊演出・バナー・スロー・シェイクは残す**ので、
 * 討伐した手応えは維持したまま、進行を止める要素だけを外す。
 */
export const getsDeathAttention = (t: EnemyType): boolean => isBossType(t) && !isPumpkinTier(t);

// 討伐(KILL)時に「FF風クランブル」統一演出(triggerDramaticDeath・gameStore.ts)を出す対象か。
// ボス系は全員対象。ネームド/クエスト対象も従来どおり劇的な討伐を維持する。
// isNamed は型ではなく個体フラグなので Enemy を受け取る(isHiddenBoss/isBossTypeはEnemyType引数)。
// §6.38 v7(賞金首): 旧v6 A-5では`|| isBountyType(enemy.type)`を個別に足していたが、
// v7でisBossTypeへ賞金首がフル編入されたため`isBossType(enemy.type) && enemy.type !== 'pumpkin'`
// だけで自動的にtrueになる(賞金首はpumpkinではない)。重複登録なので撤去(討伐SE=ボス討伐SE流用
// との整合=劇的死亡を出す、という結論自体は不変)。
export const getsDramaticDeath = (enemy: Enemy): boolean =>
  !!enemy.isNamed || !!enemy.questTarget || (isBossType(enemy.type) && !isPumpkinTier(enemy.type));

// KILL吹き飛び(死体・SKILL_BUILD_REDESIGN.md §26): この個体が「死体」(corpseUntil付き)か。
// これが唯一の判定=AI/攻撃/照準/被弾/対象選定の全経路がこの1関数で除外する(§26-2)。
export const isCorpse = (e: Pick<Enemy, 'corpseUntil'>): boolean => e.corpseUntil !== undefined;

// KILLされた通常敵が「死体化」の対象になり得るか(ボス系/ネームド/クエスト対象=getsDramaticDeath系は
// 従来どおり対象外・§26-1)。判定は「型」ではなく getsDramaticDeath と同じ安全側の合わせ技:
// isBossType は pumpkin(getsDramaticDeathは false)も含むため、ボス系は型だけで丸ごと除外する。
// §6.38 v7(賞金首): 旧v6 A-5では`&& !isBountyType(enemy.type)`を個別に足していたが、
// v7でisBossTypeへ賞金首がフル編入されたため`!isBossType(enemy.type)`だけで自動的にfalse
// (=対象外)になる。重複登録なので撤去(討伐時は死体化させず即除去=劇的死亡演出と整合、という
// 結論自体は不変)。
// ★v0.25.3704(社長報告「(パンプキンの)ジャンプをカウンターでちょうど倒すと消える」): pumpkin は
// v0.25.3168裁定で討伐イベント(getsDramaticDeath)から除外され、かつ isBossType なのでここでも
// 死体化から除外=**死亡演出が両方とも無い「隙間」に落ちてパッと消えていた**(慣性MUST違反)。
// 討伐イベント無しの裁定はそのまま、死に方は通常敵と同じ死体吹き飛びを与える(pumpkinだけ例外編入)。
export const corpseEligible = (enemy: Pick<Enemy, 'type' | 'isNamed' | 'questTarget'>): boolean =>
  (!isBossType(enemy.type) || isPumpkinTier(enemy.type)) && !enemy.isNamed && !enemy.questTarget;
// ★社長指示v0.25.3168「パンプキンは厳密にはボスではないので討伐イベントいらない」:
// pumpkin を**討伐イベントごと**除外する(崩壊/バナー「◯◯を討伐」/閃光/リング/シェイク/スロー)。
// 旧: v0.25.2879 では「時間停止+カメラ寄り(getsDeathAttention)」だけを外し、崩壊やバナーは残していた。
//     今回はその残りも要らない、という裁定。
// ※**ネームド/クエスト対象は先に true になる**ので、宿敵化したpumpkin等が居ても演出は残る
//   (型だけで切ると、そちらまで巻き添えで地味になる)。

// Stage director: which enemy types are eligible at this gameTime, and how
// likely each is to be picked. Modeled after Mad Forest's gentle ramp.
interface EnemyWeight { type: EnemyType; weight: number; }

// エリア補正テーブル v2(社長承認・分布図再構築 DISTRIBUTION_REDESIGN.md②)。
// finalWeight = baseWeight × areaWeight[area]。0 のエリアは候補から除外。
// 添字 = エリア(0 軍備 / 1 研究 / 2 デンジャー / 3 未確認 / 4 深層)。
// 設計原則: 深部でもチャフ(bat/skeleton)を絶滅させない(緩シーン/キルフローの枯渇防止)。
// 深さの恐怖は AREA_BASE_DIFFICULTY(強さ倍率)と重い型の比率で出す。zombieは深部で比率を下げる。
const AREA_WEIGHT: Partial<Record<EnemyType, number[]>> = {
  bat:      [1.0, 0.7, 0.35, 0.25, 0.2 ], // 旧 [1.0,0.7,0,0,0]
  skeleton: [1.0, 1.0, 0.8,  0.5,  0.35], // 旧 [1.0,1.0,0.8,0,0]
  zombie:   [0.6, 1.0, 1.0,  0.9,  0.7 ], // 旧 [0.6,1.0,1.0,1.0,0.8]
  plant:    [0,   1.0, 1.0,  1.0,  1.0 ],
  ghost:    [0,   0,   0.8,  1.0,  1.1 ],
  // PACING_REDESIGN.mdバッチ3完成版(Tank化・社長指示): 通常湧きプールから撤退(全エリア0)。
  // 以後の出現経路はgatePressureの配役投入(0.50/0.65跨ぎ)/講習・狩猟のfeaturedFloor/
  // セットピース/イベントプロデューサーのみ(L4DのTank/Hunterと同じ「意図した瞬間に落とす」設計)。
  // 旧 werewolf [0,0,0.7,1.1,1.2] / pumpkin [0,0,0,0.1,0.3]。
  werewolf: [0,   0,   0,    0,    0   ],
  pumpkin:  [0,   0,   0,    0,    0   ],
  lich:     [0,   0,   0.7,  1.1,  1.2 ], // 重み付けはウェアウルフと同等(社長指示)。出現はステージ4/5(下の allowLich でゲート)。
};

// 型ごとの基礎重み(既存値を定数化)。仕様§6/§7: 型の解禁・比率は時間ではなくエリア補正だけで決める。
// finalWeight = BASE_WEIGHT × AREA_WEIGHT[area]。0 のエリアは候補から除外。
// giantbat / reaper / lab-zombie は通常プールに含めない(§10。別経路で出す)。
const BASE_WEIGHT: Partial<Record<EnemyType, number>> = {
  bat:      100,
  skeleton: 55,
  zombie:   45,
  plant:    14,
  ghost:    45,
  werewolf: 45,
  pumpkin:  22,
  lich:     45, // ステージ4/5(allowLich でゲート)。重みはウェアウルフと同等(社長指示)。
};

// 難易度③(種類軸): escalation で「重い型」の重みを乗算で底上げ(過剰育成なら手強い種類が増える)。
// esc=0 なら 1 倍で現状と完全一致(安全)。
const DDA_TOUGH_TYPES = new Set<EnemyType>(['werewolf', 'pumpkin', 'lich']);
const DDA_VARIETY_ESC_K = 1.8; // esc=1 で重い型の重み ×2.8(私案)
const SCENE_FEATURED_BOOST = 2.5; // シーンで featured 指定した型の重み倍率(乗算バイアス・私案)
const SCENE_SUPPRESSED_MULT = 0.4; // シーンで suppressed 指定した型の重み倍率(社長指示: 緩の時のゾンビ抑え・私案)
// DISTRIBUTION_REDESIGN.md①/PACING_REDESIGN.mdバッチ1.5: featured指定された型は、シーンが
// featuredFloor=true の時だけ、エリア制限(重み0)を無視できる床(0.5)を持つ。無双(mowdown)の
// bat/skeleton等、エリアで本来出現不可の型をシーンの演出として出すための特例。
// バッチ1.5の教訓: floorを常時有効にすると「チャフのための床」が関所シーンの問題児(パンプキン/犬)
// の裏口になり、序盤ゾーンの関所でも出現してしまう事故が起きた。床は floorAllowed=true の呼び出し
// (講習/mowdownシーン)でのみ効かせ、関所シーンは false でエリア規約に完全準拠させる。
const FEATURED_MIN_AREA_WEIGHT = 0.5;
// PACING_REDESIGN.mdバッチ3(最小版): 関所中のgatePressureが「今許可されている問題児」以外を
// 完全ブロック(重み0)するための引数。suppressed(×0.4の部分抑制)とは別物=許可外は0でなければ
// ならない(「suppressed扱い(重み0)」という設計書の指示どおり)。関所以外(緩シーン)では常に空配列。
// 型選択は「現在エリアの areaWeight」で決める(仕様§6)。esc で重い型に重み加算、featured でシーンの強調型に重み加算。
// featured/suppressed は乗算バイアス=エリアで出現不可(重み0)の型は0のまま(エリア規約を尊重)。
// ただし featured は floorAllowed=true の時だけ FEATURED_MIN_AREA_WEIGHT の床を持つ(上記)。
const CHAFF_TYPES: EnemyType[] = ['bat', 'skeleton', 'zombie'];
const selectEnemyType = (area: number, allowLich = false, esc = 0, featured: EnemyType[] = [], suppressed: EnemyType[] = [], floorAllowed = false, blocked: EnemyType[] = [], mix?: ChaffMix): EnemyType => {
  const toughBoost = 1 + Math.max(0, esc) * DDA_VARIETY_ESC_K;
  // baseWeight × エリア補正(featuredはfloorAllowed時のみ床あり) ×(重い型なら toughBoost)×(シーン強調なら SCENE_FEATURED_BOOST)×(シーン抑えなら SCENE_SUPPRESSED_MULT)、blockedは強制0。
  const pool = (Object.entries(BASE_WEIGHT) as [EnemyType, number][])
    .filter(([type]) => type !== 'lich' || allowLich) // lich はステージ4(雪原)/5(戦場)限定
    .map(([type, w]) => {
      if (blocked.includes(type)) return { type, weight: 0 };
      // 洋館通路(corridorSpawnEnabled): 抱卵型(ghost)=緑卵の撒き手は出さない(v0.25.2145・社長指示
      // 「緑卵も出現しないで」。世界生成の卵はsetMinesDisabledで停止済み=残る産卵ソースを湧きから断つ)。
      if (corridorSpawnEnabled && type === 'ghost') return { type, weight: 0 };
      const areaW = (AREA_WEIGHT[type]?.[area]) ?? 0;
      const effAreaW = (floorAllowed && featured.includes(type)) ? Math.max(areaW, FEATURED_MIN_AREA_WEIGHT) : areaW;
      return { type, weight: w * effAreaW * (DDA_TOUGH_TYPES.has(type) ? toughBoost : 1) * (featured.includes(type) ? SCENE_FEATURED_BOOST : 1) * (suppressed.includes(type) ? SCENE_SUPPRESSED_MULT : 1) };
    })
    .filter(e => e.weight > 0);
  // PACING_REDESIGN.mdバッチ3.5-A(チャフ配合): mix指定時は、チャフ3種(bat/skeleton/zombie)の
  // 合計重み(=エリア規約どおりの総量。出現可否/総量は変えない)は保ったまま、内訳だけを役割比率で
  // 置き換える。mix未指定のシーンはこのブロックを素通りし、既存挙動と完全に一致する。
  if (mix) {
    const chaffTotal = pool.filter(e => CHAFF_TYPES.includes(e.type)).reduce((s, e) => s + e.weight, 0);
    if (chaffTotal > 0) {
      const norm = normalizeChaffMix(mix);
      for (const entry of pool) {
        if (entry.type === 'bat') entry.weight = chaffTotal * norm.bat;
        else if (entry.type === 'skeleton') entry.weight = chaffTotal * norm.skeleton;
        else if (entry.type === 'zombie') entry.weight = chaffTotal * norm.zombie;
      }
    }
  }
  if (pool.length === 0) return 'zombie'; // 安全網(zombie は全エリアで出現可)
  const total = pool.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const entry of pool) {
    r -= entry.weight;
    if (r <= 0) return entry.type;
  }
  return pool[pool.length - 1].type;
};

// 研究所スキン(stage-2)専用の湧き選択: 研究所テストで作ったラボ用ゾンビ(Lv1/2/3)のみ。
// 序盤=Lv1中心、中盤でLv2、後半に巨体Lv3がたまに混ざる(時間で難度上昇)。
export const selectLabEnemyType = (gameTime: number): EnemyType => {
  const t = gameTime;
  const pool: EnemyWeight[] = [{ type: 'lab-zombie-1', weight: 100 }];
  if (t >= 45000)  pool.push({ type: 'lab-zombie-2', weight: 45 });  // 0:45
  if (t >= 150000) pool.push({ type: 'lab-zombie-3', weight: 16 });  // 2:30 巨体は控えめ
  if (t >= 150000) pool[0].weight = 55; // 後半は Lv1 を減らして重い個体を増やす
  if (t >= 240000) pool[0].weight = 32;
  const total = pool.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const entry of pool) {
    r -= entry.weight;
    if (r <= 0) return entry.type;
  }
  return pool[pool.length - 1].type;
};

// ---- エリア(距離)モデル ------------------------------------------------------
// 区域: 0 軍備配置(0-1500) / 1 研究対象(1500-3000) / 2 デンジャー(3000-5000) /
//       3 未確認汚染(5000-7500) / 4 深層域(7500-)。距離 = スタート地点(原点)からの距離。
export const AREA_COUNT = 5;
// エリア名(進入バナー・PACING_REDESIGN.mdバッチ2の最深到達telemetry表示で共有)。
export const AREA_ZONE_NAMES = ['軍備配置区域', '研究対象区域', 'デンジャーゾーン', '未確認汚染エリア', '深層域'];
// 区域境界(px・原点からの距離)。PACING_PUZZLE.md §5.17 M14の「深さの壁」4本と同じ値
// (areaIndexForPosのif連鎖と同じ値を共有・挙動は不変)。
export const AREA_THRESHOLDS = [1500, 3000, 5000, 7500];
export const areaIndexForPos = (x: number, y: number): number => {
  // 洋館通路(corridorMode・v0.25.2128・社長指示): 拠点/エリア構造なし。裏側のステータスは
  // 全域「未確認汚染エリア」(index3)扱い=難易度1.75倍・未確認の湧き構成・最大敵数10。
  if (corridorSpawnEnabled) return 3;
  const d = Math.hypot(x, y);
  if (d >= 7500) return 4;
  if (d >= 5000) return 3;
  if (d >= 3000) return 2;
  if (d >= 1500) return 1;
  return 0;
};

// エリア基礎難易度倍率(社長指定)。最終倍率 = エリア基礎 × 色付き倍率(時間スケールは廃止)。
// export: §6.38(賞金首)のHPスポーン後パッチ(2000×実効難易度倍率)が同じ表を引くため。
export const AREA_BASE_DIFFICULTY = [1.0, 1.2, 1.45, 1.75, 2.1];
// エリア別の「速さ」倍率(社長指定v0.25.2317)。敵の移動速度と敵弾の弾速に掛ける。
// 研究対象区域までは等速(1.0)、デンジャー以降で 1.2 → 1.5 → 2.0 と上がる。
// HP/攻撃力(AREA_BASE_DIFFICULTY)とは別軸=「硬さ」ではなく「捌く難しさ」で深さを表現する。
// 固定強度タイプ(ジャイアント/死神/裏ボス/ラボ専用敵)は従来どおり対象外(強さ一定の設計を守る)。
export const AREA_SPEED_MULT = [1.0, 1.0, 1.2, 1.5, 2.0];
// エリアごとの敵最大数(社長指定)。useGameLoop の通常湧き上限に使用。
export const AREA_MAX_ENEMIES = [5, 7, 10, 10, 10];

// この敵タイプはこのエリアで出現可能か。AREA_WEIGHT が 0 のエリアでは無効(=距離リサイクル対象)。
// 定義がないタイプ(ラボ系/reaper)は常に有効(エリア制限なし)。
export const isValidForArea = (type: EnemyType, area: number): boolean => {
  const w = AREA_WEIGHT[type]?.[area];
  return w === undefined || w > 0;
};

const difficultyRankForArea = (area: number): DifficultyRank => {
  switch (area) {
    case 1: return 'strong';
    case 2: return 'elite';
    case 3: return 'danger';
    case 4: return 'danger';
    default: return 'normal';
  }
};

// Global enemy toughness multiplier on top of the difficulty ramp. Bumped so
// fights are chunkier and ammo/positioning matter more. Damage is unaffected.
const ENEMY_HP_MULT = 5;
// Global enemy speed multiplier — slows the whole bestiary for a more
// deliberate, survival-horror pace (matches the slower player).
const ENEMY_SPEED_MULT = 2 / 3;

// ---- 色付き(影の色)個体 ----------------------------------------------------
// 影の色で表現(本体の見た目は同じ・旧装飾=黒翼/紫角/赤翼/リング等は廃止)。色ごとに強さ倍率(社長指定)。
// ジャイアント未満の一般敵のみ対象。ジャイアント/死神/特別敵には付かない(強さ一定)。
// §5.21-追補7(社長決定v0.25.1574): 攻撃/HPを別テーブルへ分離(旧単一 COLOR_TIER_MULT は廃止)。
const COLOR_TIER_DMG_MULT: Record<EnemyColorTier, number> = { blue: 1.5, purple: 2, red: 3 };
const COLOR_TIER_HP_MULT: Record<EnemyColorTier, number> = { blue: 2, purple: 3, red: 5 };
// PACING_PUZZLE.md §5.15 M15(社長決定・既定ON): 体格拡大は廃止し、本体tint(pixiScene.ts)で
// 見分ける方式へ統一(サイズ差はネームド×1.5の専売にして「大きい=宿敵/色=レア」の2軸を濁らせない)。
// ?raretint=0で旧(体格拡大+影のみ・tintなし)へ復帰(pixiScene.tsの同名パラメータと対で効く)。
const RARE_TINT_ENABLED = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('raretint') !== '0';
const COLOR_TIER_SIZE_MULT: Record<EnemyColorTier, number> = RARE_TINT_ENABLED
  ? { blue: 1, purple: 1, red: 1 }
  : { blue: 1.1, purple: 1.2, red: 1.3 }; // 旧値(青1.1/紫1.2/赤1.3・+10%刻み)
// 「強さ一定」タイプ(距離/色でスケールしない)。将来の特別敵もここへ追加して除外する。
const CONSTANT_STRENGTH_TYPES = new Set<EnemyType>(['giantbat', 'reaper', 'mimir', 'jormungand', 'skadi', 'thor', 'miguel', 'jibril', 'rafi', 'uri', 'suriel', 'acrasiel', 'idol', 'bounty-ranged', 'bounty-melee', 'bounty-balance', 'bounty-maiko',
  // research/GHOST_BOSS.md(幻影・裏ボス方式): エリア/距離/時間/色でスケールしない=色ティア抽選の対象外。
  'guardian-phantom',
  // PACING_PUZZLE.md §10-14#3(フィル): HPはスポーン時にSTAGE_BOSS_HEALTH_BY_STAGE['stage-ex1']で
  // 上書きするのが唯一の実効値。ここへ入れないとエリア/色補正でENEMY_STATSの500(プレースホルダ)が
  // 変動してしまう(上書き前提が崩れる)。
  'phillboss']);
// ステージ2(ラボ)専用の敵は固定難易度(エリア/色/時間で変動させない・社長指定)。lab-zombie 本来のステータスを使う。
const LAB_FIXED_TYPES = new Set<EnemyType>(['lab-zombie-1', 'lab-zombie-2', 'lab-zombie-3']);
// エリア → [青影, 紫影, 赤影] の出現確率(絶対値・社長指定)。残りは無色。
const COLOR_RATE_BY_AREA: [number, number, number][] = [
  [0,    0,    0   ], // 軍備配置
  [0.03, 0,    0   ], // 研究対象
  [0.05, 0.01, 0   ], // デンジャー
  [0.07, 0.02, 0.01], // 未確認汚染
  [0.12, 0.06, 0.02], // 深層域
];
// 難易度③(強さ軸): escalation(0..1)で色付き(=強い)個体の出現率を乗算で底上げ。
// esc=0 なら boost=1 で現状と完全一致(安全)。エリア基礎が0(軍備配置)なら 0×boost=0 のまま。
const DDA_COLOR_ESC_K = 2.5;   // esc=1 で色出現率 ×3.5(私案)
const DDA_COLOR_SUM_CAP = 0.85; // 色付き合計確率の上限(無色を必ず一定残す)
// DISTRIBUTION_REDESIGN.md③: rareMult はシーン(緩=0/無双=0.5/関所≥1.2)×Rank増幅の演出レバー。
// レアの基礎率(COLOR_RATE_BY_AREA)は距離のまま=土台。rareMult=1で従来と完全一致。
// noRed=true で**赤の帯だけを0**にする(社長指示2026-08-23・ハーベストのコマ)。赤に当たっていた
// 確率は無色へ落ちる(青・紫の率は変わらない)。判定の根拠は scriptPuzzle.ts の `noRedTierForKoma`。
const rollColorTierForArea = (area: number, esc = 0, rareMult = 1, noRed = false): EnemyColorTier | undefined => {
  const base = COLOR_RATE_BY_AREA[area] ?? COLOR_RATE_BY_AREA[0];
  const boost = (1 + Math.max(0, esc) * DDA_COLOR_ESC_K) * Math.max(0, rareMult);
  let b = base[0] * boost, p = base[1] * boost, red = noRed ? 0 : base[2] * boost;
  const sum = b + p + red;
  if (sum > DDA_COLOR_SUM_CAP) { const s = DDA_COLOR_SUM_CAP / sum; b *= s; p *= s; red *= s; }
  const r = Math.random();
  if (r < red) return 'red';
  if (r < red + p) return 'purple';
  if (r < red + p + b) return 'blue';
  return undefined;
};

// 錬金術の召喚ユニットが敵タイプの見た目/速度を流用するための取得関数。
export const getEnemyBaseSpeed = (type: EnemyType): number => ENEMY_STATS[type].speed * ENEMY_SPEED_MULT;
export const getEnemyBaseSize = (type: EnemyType): { width: number; height: number } =>
  ({ width: ENEMY_STATS[type].width, height: ENEMY_STATS[type].height });

// resolveEnemyTarget が必要とする最小形(実召喚 Summon のほか、フレアガンの疑似召喚
// FlarePseudoSummon=utils/flareGun.ts も構造的に一致する。§6.6 M29)。
export interface SummonTargetLike {
  kind: Summon['kind'];
  /** 守護霊が紐付いているボスのid(v0.25.3862: ボスのヘイト追従で「自分に紐付いた霊か」を見る)。 */
  ghostBossId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// 敵のターゲット解決(錬金術): 既定はプレイヤー中心。aggroRange 内に、プレイヤーより近い
// 通常召喚ユニットがいればそれを狙う(ソフト/局所、ハードヘイト固定にしない)。summons は ≤3 で軽量
// (+フレアガン着弾中は疑似召喚が数個加わる程度)。
export const resolveEnemyTarget = (
  enemy: Enemy,
  player: Player,
  summons: readonly SummonTargetLike[],
  aggroRange: number,
  // シーカー発動中などでプレイヤーを標的にできない場合 true。召喚がいればそれを狙い、
  // いなければ hidden=true(=狙う相手なし。呼び出し側で待機/非発砲にする)。
  playerHidden = false,
  // v0.25.2490(雑魚ヘイト): ghostHateUntil の期限判定に使う現在gameTime。未指定(旧呼び出し)は
  // ラッチ無効=雑魚はゴーストを狙わない側に倒れる(既定候補からの除外は常に効く)。
  gameTimeNow?: number,
): { x: number; y: number; isSummon: boolean; hidden: boolean } => {
  const ex = enemy.x + enemy.width / 2;
  const ey = enemy.y + enemy.height / 2;
  const px = player.x + player.width / 2;
  const py = player.y + player.height / 2;
  // v0.25.2490(社長裁定「雑魚はプレイヤーを優先して狙う。守護霊に攻撃されたら守護霊に向く」):
  // 雑魚(非ボス)はゴーストを**既定のターゲット候補に入れない**。ゴースト起因ダメージを受けた個体
  // (ghostHateUntil期限内)だけ、距離を問わずゴーストへ向く(ハードラッチ・被弾のたび5秒更新)。
  // ゴーストが消えていれば通常規則へ戻る。**ボスは従来どおり**(ゴーストのタンク役=既存規則不変)。
  const mobGhostRules = !isBossType(enemy.type);
  if (mobGhostRules && gameTimeNow !== undefined
      && enemy.ghostHateUntil !== undefined && gameTimeNow < enemy.ghostHateUntil) {
    const g = summons.find(s => s.kind === 'ghost-ally');
    if (g) return { x: g.x + g.width / 2, y: g.y + g.height / 2, isSummon: true, hidden: false };
  }
  // ★社長指示2026-08-23「**守護霊が狙う敵は敵からも狙って**」(v0.25.3862)。
  // ボスは `bossHate.ts` のヘイト系(与ダメージのバケツ+粘着)で `hateTarget` を持っており、
  // **技の狙い**(resolveBossHateAim=windup時)は既にそれを見ている。しかし**この関数(=移動/追跡の
  // ターゲット)はヘイトを一切見ておらず距離だけで決めていた**ため、
  // **「撃つのは守護霊、歩いて行くのはプレイヤー」**という食い違いが起きていた。
  // ⇒ ヘイトが守護霊に向いているボスは、**移動の狙いも守護霊**にする(技と移動で主語を揃える)。
  // 守護霊が居ない/紐付きが違う個体なら従来どおり距離規則へ落ちる=1bit不変。
  if (!mobGhostRules && enemy.hateTarget === 'ghost') {
    const g = summons.find(s => s.kind === 'ghost-ally' && (s.ghostBossId === undefined || s.ghostBossId === enemy.id));
    if (g) return { x: g.x + g.width / 2, y: g.y + g.height / 2, isSummon: true, hidden: false };
  }
  let bestX = px;
  let bestY = py;
  let bestD2 = playerHidden ? Infinity : (px - ex) * (px - ex) + (py - ey) * (py - ey);
  let isSummon = false;
  const aggro2 = aggroRange * aggroRange;
  for (const s of summons) {
    // BOT_AND_GHOST.md G2: ghost-ally(kind='ghost-ally')もヘイトの対象に含める(召喚ユニットと
    // 同じ受け口を流用=新規実装ゼロという設計意図)。ただし実際にヘイトが効くのは、この
    // resolveEnemyTarget を経由する敵AI(通常敵/thor等)だけ。giantbat・idol・angelBossTick系6体は
    // 自分の攻撃対象をプレイヤーへ直接ハードコードしておりここを経由しないため、ゴーストへは
    // 自動で乗らない(★未決として最終報告に記載・本バッチのスコープ外)。
    if (s.kind !== 'normal' && s.kind !== 'ghost-ally') continue;
    // v0.25.2490: 雑魚(非ボス)の既定候補からゴーストを外す(狙うのは上のラッチ経由のみ)。
    if (s.kind === 'ghost-ally' && mobGhostRules) continue;
    const sx = s.x + s.width / 2;
    const sy = s.y + s.height / 2;
    const d2 = (sx - ex) * (sx - ex) + (sy - ey) * (sy - ey);
    if (d2 <= aggro2 && d2 < bestD2) { bestD2 = d2; bestX = sx; bestY = sy; isSummon = true; }
  }
  // プレイヤーが隠れていて召喚も射程外 → 標的なし。
  if (playerHidden && !isSummon) return { x: px, y: py, isSummon: false, hidden: true };
  return { x: bestX, y: bestY, isSummon, hidden: false };
};

const buildEnemy = (
  type: EnemyType,
  x: number,
  y: number,
  gameTime: number,
  isWave = false,
  esc = 0, // 難易度③: 強さ(色ティア)escalation。0=現状据え置き。
  rareMult = 1, // DISTRIBUTION_REDESIGN.md③: シーン/Rank連動のレア演出倍率。1=現状据え置き。
  forcedColorTier?: EnemyColorTier, // PACING_PUZZLE.md §5.21 M20 stage③: 抽選を経ずtierを強制指定(囲いゲート1の全個体レア化)。
  noRedTier = false, // 社長指示2026-08-23: ハーベストのコマは赤を出さない(forcedColorTier指定時はそちらが優先)。
): Enemy => {
  const stats = ENEMY_STATS[type];
  // 強さ一定タイプ(ジャイアント/死神)＋ラボ専用敵は距離・色・時間でスケールしない(固定難易度・社長指定)。
  const constant = CONSTANT_STRENGTH_TYPES.has(type);
  const fixed = constant || LAB_FIXED_TYPES.has(type);
  const area = areaIndexForPos(x, y);
  const distanceZone = area; // 互換フィールド(0-4)
  // トレジャー抽選用ランク。社長指示v0.25.3328「比例して、アイテムのTier抽選率も」: 時間でも上がる
  // (実効エリアの整数部で段が進む=2:00/4:00/6:00で1段ずつ)。固定強度タイプは従来どおり実エリア。
  const difficultyRank = difficultyRankForArea(
    fixed ? area : Math.floor(effectiveDifficultyArea(area, gameTime)),
  );
  // 色付き(固定難易度タイプには付かない)。色ごとの倍率を強さに乗せる。
  // §5.21-追補7: 攻撃/HPを別倍率で分離(colorDmgMult/colorHpMult → diffDmg/diffHp)。
  const colorTier = fixed ? undefined : (forcedColorTier ?? rollColorTierForArea(area, esc, rareMult, noRedTier));
  const colorDmgMult = colorTier ? COLOR_TIER_DMG_MULT[colorTier] : 1;
  const colorHpMult = colorTier ? COLOR_TIER_HP_MULT[colorTier] : 1;
  // 最終倍率 = エリア基礎難易度 × 色付き倍率。固定難易度タイプ = 1。
  // 社長指示v0.25.3328: 時間でも距離の強さ軸に合わせにいく=実効エリア max(実エリア, 仮想エリア(時間))
  // で強さ/速度のテーブルを引く(8:00で最深部相当)。**色付き(レア)率は上の rollColorTierForArea が
  // 実エリアのまま引いている=エリア固定(社長指示)。**
  const effArea = fixed ? area : effectiveDifficultyArea(area, gameTime);
  const areaBase = fixed ? 1 : lerpAreaTable(AREA_BASE_DIFFICULTY, effArea);
  // 社長指定v0.25.2317: エリアが深いほど動きが速くなる(固定強度タイプは対象外)。時間軸も同様に迫る。
  const areaSpeed = fixed ? 1 : lerpAreaTable(AREA_SPEED_MULT, effArea);
  // research/STAGE_DIFFICULTY.md: ステージ難度の階段(雑魚)。**攻撃係数は diffDmg 自体に掛ける**
  // ——接触ダメージ(下の damage:)と敵弾ダメージ(difficultyMultiplier を createEnemyProjectile が読む)の
  // 両方が同時に動く(damage だけに掛けると plant 等の撃つ雑魚の弾が据え置きになる)。
  // 固定型(CONSTANT_STRENGTH_TYPES / LAB_FIXED_TYPES)は下の `fixed ? 1 : diffDmg` のガードで自動的に除外。
  const diffDmg = areaBase * colorDmgMult * stageDiffDmgMult;
  const diffHp = areaBase * colorHpMult;
  // Reaper は終端個体で別管理。giant/ラボ等の固定タイプは全体底上げ(ENEMY_HP_MULT)のみ維持。
  // reaper と裏ボスは health をそのまま使う(裏ボスは個別HPを直接指定=ENEMY_HP_MULT を掛けない)。
  // research/GHOST_BOSS.md(幻影): 裏ボスと同じ「HPを直接指定」枠=ENEMY_HP_MULT を掛けない
  // (スポーン側が書き込んだHPがそのまま実効HPになる=練習画面の表示と実戦が一致する。
  //  幻影は ENEMY_STATS の値がプレースホルダで、スポーン直後に育成込みの値へ上書きされる)。
  // research/STAGE_DIFFICULTY.md: HP係数は hpMult へ乗算。**非固定(=雑魚)の枝だけ**に掛ける
  // ——固定型(城ボス/賞金首/天使/裏ボス/ラボ敵ほか)はスポーン側の個別適用が担当なので、
  // ここで掛けると二重になる(除外の意図は diffDmg 側の fixed ガードと同じ)。
  const hpMult = (type === 'reaper' || isHiddenBoss(type) || isGuardianPhantom(type)) ? 1 : (fixed ? ENEMY_HP_MULT : diffHp * ENEMY_HP_MULT * stageDiffHpMult);
  const dmgMult = type === 'reaper' ? 1 : (fixed ? 1 : diffDmg);
  const sizeMult = colorTier ? COLOR_TIER_SIZE_MULT[colorTier] : 1;

  return {
    id: `enemy-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    x,
    y,
    width: Math.round(stats.width * sizeMult),
    height: Math.round(stats.height * sizeMult),
    speed: stats.speed * ENEMY_SPEED_MULT * areaSpeed,
    health: stats.health * hpMult,
    maxHealth: stats.health * hpMult,
    damage: Math.round(stats.damage * dmgMult),
    type,
    experienceValue: stats.experienceValue,
    lastHit: 0,
    lastShot: Date.now() - Math.random() * 1500,
    spawnedAt: gameTime,
    isWave,
    distanceZone,
    difficultyRank,
    difficultyMultiplier: fixed ? 1 : diffDmg,
    colorTier,
    // DISTRIBUTION_REDESIGN.md①: このエリアでは本来出現しない型(featured床/保証出現などで選ばれた)
    // なら、距離リサイクルの「エリア不適合→強制回収」を免除するフラグを立てる。
    ...(isValidForArea(type, area) ? {} : { sceneSpawn: true })
  };
};

// Generate a single enemy at a random point outside the camera viewport but
// close enough that it will plausibly reach the player. Used by both the
// continuous spawner and the wave/elite spawner.
export const generateEnemy = (
  gameTime: number,
  player: Player,
  gameBounds: GameBounds,
  forcedType?: EnemyType,
  pressureDirection?: { x: number; y: number } | null,
  viewOffsetY = 0, // カメラ下げ量(px)。可視範囲はプレイヤーより上に viewOffsetY ぶん広いので、縦バンドを上へずらす。
  snowStage = false, // ステージ4(雪原)か。lich を湧きプールに含めるか否かのゲート。
  esc = 0, // 難易度③: escalation(0..1)。0=現状据え置き。種類/強さのバイアスに使う。
  featured: EnemyType[] = [], // シーン(SpawnScene)の強調型。selectEnemyType の重みに乗算バイアス。
  suppressed: EnemyType[] = [], // シーン(SpawnScene)の抑え型。重み減(緩の時のゾンビ抑え・社長指示)。
  rareMult = 1, // DISTRIBUTION_REDESIGN.md③: シーン/Rank連動のレア演出倍率。1=現状据え置き。
  floorAllowed = false, // PACING_REDESIGN.mdバッチ1.5: featuredのエリア床を許すシーンか(講習/mowdownのみtrue)。
  blocked: EnemyType[] = [], // PACING_REDESIGN.mdバッチ3: gatePressureで未解禁の問題児を完全ブロック(重み0)。
  mix?: ChaffMix, // PACING_REDESIGN.mdバッチ3.5-A: チャフ(bat/skeleton/zombie)の役割配合。省略=従来どおり。
  // ★v0.25.3546(ピークの赤い個体1体): 色抽選(rollColorTierForArea)を経ずtierを強制指定する。
  // 省略=従来どおり抽選。`spawnEnemyAtWithTier` の generateEnemy 版(あちらは座標指定の兄弟)。
  forcedColorTier?: EnemyColorTier,
  // ★社長指示2026-08-23(ハーベストは赤を出さない): 抽選から赤の帯だけを外す。省略=従来どおり。
  // forcedColorTier を渡した場合はそちらが優先(強制指定は抽選を経ないため)。
  noRedTier = false,
): Enemy => {
  // 型選択は「プレイヤーが今いるエリア」の補正で行う(湧きはプレイヤー近傍なので実質同じ)。
  const playerArea = areaIndexForPos(player.x + player.width / 2, player.y + player.height / 2);
  const type = forcedType ?? selectEnemyType(playerArea, snowStage, esc, featured, suppressed, floorAllowed, blocked, mix);
  const viewportWidth = gameBounds.width;
  const viewportHeight = gameBounds.height;
  // 可視範囲はワールドと1:1(カメラ幅=gameBounds)。プレイヤーは中央より viewOffsetY 下にいるので、
  // 可視縦バンドの中心は player.y より viewOffsetY 上(=vy0)。そこを基準に上下端の外へ湧かせる。
  const halfW = viewportWidth / 2;
  const halfH = viewportHeight / 2;
  const vy0 = player.y - viewOffsetY; // 可視縦バンドの中心(world Y 近似)
  const margin = OFFSCREEN_SPAWN_MARGIN; // 固定ビュー矩形の外側この距離(全辺一律・社長指示B)

  const dirMag = pressureDirection
    ? Math.hypot(pressureDirection.x, pressureDirection.y)
    : 0;
  let spawnSide = Math.floor(Math.random() * 4);
  if (corridorSpawnEnabled) {
    // 洋館通路: 左右(壁)からは湧かせない。上(奥=side0)主体・一部下(手前=side2)。
    // pressureDirection(移動方向バイアス)は無視=通路の向きに固定。上下端の散布(x/y)は従来式を流用。
    spawnSide = Math.random() < CORRIDOR_SPAWN_TOP_RATIO ? 0 : 2;
  } else if (dirMag > 0.25 && Math.random() < 0.34) {
    const nx = pressureDirection!.x / dirMag;
    const ny = pressureDirection!.y / dirMag;
    spawnSide = Math.abs(nx) > Math.abs(ny)
      ? (nx > 0 ? 1 : 3)
      : (ny > 0 ? 2 : 0);
  }
  let x = 0;
  let y = 0;
  // (v0.25.2151) v2139の通路湧き距離の深掘り(halfH/CONTEXT_ZOOM_MIN)は撤回=最初の距離へ復帰。
  // 当時「最大引きで湧きが見える」と診断したが実測の真因は敵フェード境界のバグ(v2149で根治)で、
  // 素の halfH+margin(292px)は最大引きの可視半径(190px)より元々外=食い込みは無かった。
  // 各辺の「外側」(半幅/半高+margin)へ。直交方向は画面幅/高いっぱいに散らす(歩いて入ってくる)。
  switch (spawnSide) {
    case 0: // 上辺の外
      x = player.x - halfW + Math.random() * viewportWidth;
      y = vy0 - halfH - margin;
      break;
    case 1: // 右辺の外
      x = player.x + halfW + margin;
      y = vy0 - halfH + Math.random() * viewportHeight;
      break;
    case 2: // 下辺の外
      x = player.x - halfW + Math.random() * viewportWidth;
      y = vy0 + halfH + margin;
      break;
    case 3: // 左辺の外
      x = player.x - halfW - margin;
      y = vy0 - halfH + Math.random() * viewportHeight;
      break;
  }
  return buildEnemy(type, x, y, gameTime, false, esc, rareMult, forcedColorTier, noRedTier);
};

// Spawn an enemy at a specific world position (used for Reaper, scripted
// elites, and horde lines). These are tagged isWave so the enemy-cap culler
// gives them a short grace period before they can be removed.
export const spawnEnemyAt = (
  type: EnemyType,
  x: number,
  y: number,
  gameTime: number
): Enemy => buildEnemy(type, x, y, gameTime, true);

// PACING_PUZZLE.md §5.21 M20 stage③(囲いゲート1): 抽選(rollColorTierForArea)を経ずtierを強制指定して
// スポーンする。rareMultを上げても抽選の上限(DDA_COLOR_SUM_CAP)で無色が残りうるため、「全個体を
// 確実にレア化」したい一回限りのイベント湧きにはこちらを使う(spawnEnemyAtの兄弟版)。
export const spawnEnemyAtWithTier = (
  type: EnemyType,
  x: number,
  y: number,
  gameTime: number,
  tier: EnemyColorTier
): Enemy => buildEnemy(type, x, y, gameTime, true, 0, 1, tier);

// Hostile projectile profiles. In the Mad Forest port only `plant` shoots —
// everything else is pure melee. Plants spit seeds toward the player on a
// generous cadence so the counter has real targets to time off of.
export const ENEMY_PROJECTILE_DURATION = 4000;

interface FireProfile {
  interval: number;
  range: number;
  speed: number;
  damage: number;
  size: number;
}

/**
 * v0.25.2627(社長報告「これ速さの項目がない」): **弾の性能をボスメーカーから触れるようにするための
 * 上書き置き場。**
 *
 * 事情: 敵弾の speed/damage/size は下の `getEnemyFireProfile` が持つが、**裏ボス〜天使〜アイドルの11体は
 * 全員が同じ1行(speed 320 / damage 20 / size 16)を共有**していた。よってボスごとの数値テーブル
 * (BOSS_MAKER.md §2)には**弾速が入っておらず、メーカーの技欄に「速さ」が出ない**状態だった
 * (追尾弾だけはアイドル固有の実装なので `shape.orbSpeed` として出ていた)。
 *
 * ここに型ごとの上書きを登録できるようにし、ボス側の tuning テーブルから登録する。
 * **登録が無ければ従来どおり**=他ボスの挙動は1バイトも変わらない。
 * ※逆向き(enemyUtils → 各ボスの script)に import すると循環するので、**登録は呼ぶ側から**行う。
 */
const FIRE_PROFILE_OVERRIDES = new Map<string, FireProfile>();
/** 型ごとの発射プロファイルを上書き登録する(同じ参照を渡せば、その場の書き換えが即反映される)。 */
export const registerEnemyFireProfile = (type: string, profile: FireProfile): void => {
  FIRE_PROFILE_OVERRIDES.set(type, profile);
};

export const getEnemyFireProfile = (enemy: Enemy): FireProfile | null => {
  const override = FIRE_PROFILE_OVERRIDES.get(enemy.type);
  if (override) return override;
  if (enemy.type === 'plant') {
    return { interval: 2200, range: 380, speed: 230, damage: 7, size: 12 };
  }
  // ジャイアントバット: 約3秒ごとに弾を撃つ(行動パターンの1つ)。特殊行動(ジャンプ/ダッシュ)中は
  // 呼び出し側(useGameLoop)が aiPhase を見て発砲をスキップする。
  if (enemy.type === 'giantbat') {
    return { interval: 3000, range: 620, speed: 300, damage: 10, size: 14 };
  }
  // 裏ボス: 弾の性能(damage/speed/size)はここで定義するが、発射タイミングは
  // useGameLoop の専用コントローラ(3連発/全方位16発)が直接制御する(interval/range は使わない)。
  // miguel(ゲート2ボス)もこのチェーンに含める(Explore地図チェックリスト)が、バッチ1では弾は
  // 未使用(攻撃1=harai は近接ライン判定のみ)。将来の弾攻撃追加時にそのまま使える置き場として置く。
  // uri/suriel/acrasiel/idol(§6.28・M52 L1)も同じ置き場に追加(台本=実際の発射タイミングはL2/L3の担当)。
  // phillboss(§10・バッチ2): 光槍の扇/エルデの流星が共通赤弾を使う。台本側(phillScript/angelBossTick)
  // が実際の発射タイミング・本数・追尾を持つ=ここは弾の性能(damage/speed/size)の置き場のみ。
  if (enemy.type === 'mimir' || enemy.type === 'jormungand' || enemy.type === 'skadi' || enemy.type === 'thor' || enemy.type === 'miguel' || enemy.type === 'jibril' || enemy.type === 'rafi'
    || enemy.type === 'uri' || enemy.type === 'suriel' || enemy.type === 'acrasiel' || enemy.type === 'idol' || enemy.type === 'phillboss') {
    return { interval: 99999, range: 99999, speed: 320, damage: 20, size: 16 };
  }
  return null;
};

export const createEnemyProjectile = (
  enemy: Enemy,
  player: Player,
  targetX?: number,
  targetY?: number,
  // PACING_PUZZLE.md §6.28-18(バッチM62): スリィエルの環(本体から離れた発射起点)用の任意オーバーライド。
  // 省略時は従来どおり敵本体中心(既存の全呼び出し側は無改変=挙動不変)。
  originX?: number,
  originY?: number,
  /**
   * **技ごとの弾**(社長指示v0.25.2628「弾速度とか個別にしないと」)。
   * 型ごとの既定(`getEnemyFireProfile`)に上書きする。省略時は従来どおり=既存の全呼び出し側は無改変。
   * ★**生成時に効かせる**のが肝: `size` は下で x/y の逆算(中心合わせ)に使うので、
   * 生成後に上書きすると**弾の位置がズレる**。だからここで受け取る。
   */
  profileOverride?: Partial<FireProfile>,
): Projectile => {
  const base = getEnemyFireProfile(enemy) ?? {
    speed: 200, damage: 6, size: 12, interval: 0, range: 0
  };
  const profile = profileOverride ? { ...base, ...profileOverride } : base;
  const ex = originX ?? (enemy.x + enemy.width / 2);
  const ey = originY ?? (enemy.y + enemy.height / 2);
  // 既定はプレイヤー中心(従来挙動と等価)。錬金術で召喚が標的なら呼出側が座標を渡す。
  const px = targetX ?? (player.x + player.width / 2);
  const py = targetY ?? (player.y + player.height / 2);

  const dx = px - ex;
  const dy = py - ey;
  const dist = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
  const dir = { x: dx / dist, y: dy / dist };
  // 社長指定v0.25.2317: 弾速もエリアで上がる(移動速度と同じ倍率)。撃った個体の湧きエリア
  // (distanceZone)で決まる=生成時に固定。固定強度タイプ(ジャイアント/裏ボス等)は対象外。
  // 社長指示v0.25.3328: 時間軸も同様(個体の湧き時刻 spawnedAt 基準=本体速度と同じ焼き込み)。
  const shooterFixed = CONSTANT_STRENGTH_TYPES.has(enemy.type) || LAB_FIXED_TYPES.has(enemy.type);
  const areaSpeed = shooterFixed
    ? 1
    : lerpAreaTable(AREA_SPEED_MULT, effectiveDifficultyArea(enemy.distanceZone ?? 0, enemy.spawnedAt ?? 0));

  return {
    id: `proj-enemy-${enemy.id}-${Date.now()}-${Math.random()}`,
    x: ex - profile.size / 2,
    y: ey - profile.size / 2,
    width: profile.size,
    height: profile.size,
    speed: profile.speed * areaSpeed,
    damage: Math.round(profile.damage * (enemy.difficultyMultiplier ?? 1)),
    direction: dir,
    weaponType: 'enemy_bolt',
    ownerType: enemy.type,
    ownerId: enemy.id,
    duration: ENEMY_PROJECTILE_DURATION,
    createdAt: Date.now(),
    passthrough: false,
    hitEnemies: [],
    hostile: true,
    reflected: false,
    // GHOST-BULLET-TECH(BOT_AND_GHOST.md §2.9・**記録専用**): 「どのボスの弾技が撃った弾か」。
    // 判定・ダメージ・弾の挙動には一切使わない(被弾時に技別の反応表へ帰属させるだけ)。
    // **発射経路が3つに分かれている**(gameStore/useGameLoop/angelBossTick)ので、呼び出し側ではなく
    // 生成の1箇所で付ける=経路の取りこぼしが構造的に起きない。非ボス(plant等)は undefined。
    srcMoveKey: projectileMoveKeyForEnemy(enemy),
  };
};

// Color palette per type. Used by the renderer for the body fill.
export const getEnemyColor = (type: EnemyType): string => {
  switch (type) {
    case 'bat':      return '#1f1b2c';  // near-black purple
    case 'skeleton': return '#e7e3d3';  // bone white
    case 'zombie':   return '#5a7a3c';  // sickly green
    case 'plant':    return '#7e2a86';  // pink-purple
    case 'ghost':    return '#cbd5e1';  // pale blue-white
    case 'werewolf': return '#6b3f1d';  // dark brown
    case 'pumpkin':  return '#f97316';  // orange
    case 'driller':  return '#d9a441';  // ヘルメットの琥珀(削岩型・PACING_PUZZLE.md §9-2)
    case 'giantbat': return '#11122c';  // very dark
    case 'reaper':   return '#0a0a0a';  // pitch black
    case 'lich':     return '#7fb4e6';  // icy blue (ステージ4新型)
    case 'mimir':    return '#7a3b5e';  // 眼の血色がかった紫(裏ボス)
    case 'jormungand': return '#13204a'; // 深い蛇の藍(裏ボス)
    case 'skadi':    return '#bfe6ff';  // 氷の蒼白(裏ボス)
    case 'thor':     return '#8b1a1a';  // 血の赤褐色(裏ボス・トール)
    case 'miguel':   return '#6b21a8';  // 濃い紫(ゲート2ボス・天使名ボス「ミゲル」)
    case 'jibril':   return '#6d28d9';  // 濃い紫(ゲート2ボス・天使名ボス「ジブリル」・ステージ3)
    case 'rafi':     return '#7c3aed';  // 紫(ゲート2ボス・天使名ボス「ラフィ」・ステージ4)
    case 'uri':      return '#b91c1c';  // 血の赤(ゲート2ボス・天使名ボス「ウリ」・ステージ5・炎の光輪+血濡れの大剣)
    case 'suriel':   return '#a16207';  // 金褐色(ゲート2ボス・天使名ボス「スリィエル」・ステージ6・金の環)
    case 'acrasiel': return '#7e22ce';  // 結晶の紫(ゲート2ボス・天使名ボス「アクラシエル」・EX)
    case 'idol':     return '#f472b6';  // ピンク(stage-2隠しボス「idol」・等身大の人間)
    case 'phillboss': return '#f5e6c8'; // 光の乳白(EXボス「フィル(変異体)」・PACING_PUZZLE.md §10-12#6)
    case 'hunter':   return '#d9cfc4';  // 蒼白い肉色(ハンター変異体)
    case 'screamer': return '#8fae4f';  // くすんだ毒々しい緑(叫喚型)
    default:         return '#dc2626';
  }
};

// RE-style spawn cadence: a sparse, deliberate trickle, not a swarm. One
// enemy at a time, slow interval, so the field stays at ~5-10 bodies under
// the hard cap (see useGameLoop) instead of the VS wall-of-enemies.
export const getEnemySpawnInterval = (gameTime: number): number => {
  // ~2000ms at start → ~1200ms floor by ~26 minutes.
  const base = Math.max(1200, 2000 - gameTime / 2000);
  return base + Math.random() * 300;
};

export const getEnemySpawnCount = (): number => {
  // Always one body per spawn tick — density is governed by the cap.
  return 1;
};
