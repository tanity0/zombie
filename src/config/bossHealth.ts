import type { EnemyType } from '../types/game';
// ★幻影のHP=初期プレイヤー同値(下の guardianPhantomHealth)。どちらもdataの葉=循環なし
// (fixedGuardiansはcampaign/equipment/moveReactionのみ・playerProfilesはtypesのみ)。
import { PLAYER_PROFILES } from '../data/playerProfiles';
import { strongestGuardian } from '../data/fixedGuardians';

// ボスHPの正本。PHILLガンはstage-2限定かつ弾薬有限の特殊支給品なので、
// この進行カーブの火力基準には含めない。通常プレイヤーが作れるビルドを基準にする。
export const STAGE_BOSS_HEALTH_BY_STAGE: Readonly<Record<string, number>> = {
  'stage-1': 3500,
  'stage-2': 4000,
  'stage-3': 4500,
  'stage-4': 5000,
  'stage-5': 5500,
  // stage-6にはボスがいない。12000はstage-7のラスボス(グレン)へ適用する。
  // research/STAGE_DIFFICULTY.md(社長裁定2026-08-20「7は単純にHPを第一と第2それぞれ2倍くらいに」):
  // 6000→12000。**第二形態も同じこの行を読む**(useGameLoopの形態2スポーンが
  // stageBossHealthFor('stage-7'))ので、ここを2倍にするだけで両形態が2倍になる。
  // stage-7 はステージ係数の階段には乗せない(固定値)ので、増分はこの行だけが持つ。
  'stage-7': 12000,
  // PACING_PUZZLE.md §10-12#3/§10-14#3(EXボス「フィル(変異体)」): 叩き台=stage-7の値×0.85
  // (§10-6「連戦補正」=スリィエル撃破直後の連戦なので単独ボス想定より1段控えめ)。実機で社長が調整。
  // phillbossスポーン直後にこの値で上書きする(幻影のスポーン時上書き=useGameLoopと同作法)。
  // ★CONSTANT_STRENGTH_TYPES編入により、この上書きが唯一の実効HP(書き忘れ=プレースホルダ500で
  // 戦う事故になるので、phillbossをスポーンする経路は必ずこの値で上書きすること)。
  'stage-ex1': Math.round(12000 * 0.85),
};

// ゲート2は裏ボスへ向かう途中で必ず戦う中ボス。対応ステージの城ボスより強くしつつ、
// stage-1のミゲル(5000)はstage-5城ボス(5500)より下に置く。
export const GATE_BOSS_HEALTH = {
  miguel: 5000,
  jibril: 6000,
  rafi: 7000,
  uri: 8000,
  suriel: 9000,
  acrasiel: 10000,
} as const satisfies Partial<Record<EnemyType, number>>;

// 裏ボスはstage-1からstage-5まで2000ずつ上げる。
export const HIDDEN_BOSS_HEALTH = {
  mimir: 14000,
  idol: 16000,
  jormungand: 18000,
  skadi: 20000,
  thor: 22000,
} as const satisfies Partial<Record<EnemyType, number>>;

// research/GHOST_BOSS.md(守護霊ボス「幻影」): 裏ボス方式の固定HP。ENEMY_HP_MULT・エリア・色倍率を
// 一切通さない(buildEnemy の hpMult が `guardian-phantom` を 1 に固定する)ので、**スポーン時に
// 書き込んだ値がそのまま実効HPになる**=練習画面の表示(practiceBossHealth)と実戦が原理的に一致する。
// ★社長裁定v0.25.3641「ステータスもそのままにできない?こっちがステータス初期だから守護霊も初期かも」:
// HP=**初期プレイヤーと同値**(初期maxHp。装備補正なし=出撃直後のプレイヤーと同じ)。
// ★research/GROWTH.md v4(社長裁定Q4「幻影も反映」): その「初期」に**永続育成の体力加算を含める**
// (=そのランのプレイヤーの ddaBaseHp と同値)。基準値は**引数で受ける**——このファイルは
// 「dataの葉=循環なし」を自ら宣言している側なので、store を読まない(読むと
// gameStore → enemyUtils → bossHealth → gameStore の循環になる)。
// ※これに伴い基準クラスは「守護霊台帳の最強クラス」から**そのランのプレイヤーのクラス**へ入れ替わった
//   (呼び出し側が渡す基準HPがプレイヤーのもののため)。今日は全クラス同値(STANDARD_MAX_HP)なので
//   挙動は変わらないが、将来クラスごとにHP差を付けるとここで差が出る。
export const guardianPhantomHealth = (playerBaseMaxHp: number): number =>
  Math.max(1, Math.round(playerBaseMaxHp));

// ENEMY_STATS['guardian-phantom'].health 用の**プレースホルダ**。ENEMY_STATS は import 時評価で
// 焼かれてしまうため、実効HPはスポーン側(useGameLoop の幻影スポーン1箇所)が
// guardianPhantomHealth(player.ddaBaseHp) で**必ず上書きする**。ここの値は「上書き前の器」でしかない。
export const GUARDIAN_PHANTOM_PLACEHOLDER_HEALTH = PLAYER_PROFILES[strongestGuardian().classId].maxHp;

export const stageBossHealthFor = (stageId: string): number =>
  STAGE_BOSS_HEALTH_BY_STAGE[stageId] ?? STAGE_BOSS_HEALTH_BY_STAGE['stage-1'];
