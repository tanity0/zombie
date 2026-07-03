// PACING_V2.md§2(R7): エリア台本。エリア(距離帯)ごとに問題児の「たまに追加」を直接指定する
// (憲法廃止後の主となる出現規定。旧・初心者ゾーン不可侵の代替は同時数キャップ+実フェーズ+
// ディレクター連携ゲート(§3)が担う。導入/緩/bossの呼吸は荒らさず、gateコマ中だけ追加圧にする)。
//
// 「たまに」の較正(社長指示「重みづけの概念を見ろ」に基づく実装判断・全て叩き台):
// - ロール粒度: 15秒(問題児リフラクトリPROBLEM_REFRACTORY_MSと同じ粒度=倒した直後に次が来ない)。
// - 確率: COLOR_RATE_BY_AREA(レア出現率)と同じ「エリア別の確率配列」の形。深いほど高い。
//   エリア1=0.20/ロール(期待値≈0.8セット/分)〜エリア4=0.35(≈1.4セット/分)。エリア0(軍備配置)=0。
// - パンプキン/犬はAREA_WEIGHT全エリア0(Tank化・v0.25.1354)のまま=自然湧きプールには戻さず、
//   本台本が「ディレクターが意図した瞬間に落とす」新しい供給源になる。
//
// レンダラ非依存の純関数=ヘッドレスでユニットテスト可能(src/utils)。乱数は引数で受け取る。
import type { EnemyType } from '../types/game';
import type { DirectorMacro } from './aiDirector';

export type AreaScriptType = 'pumpkin' | 'werewolf' | 'plant';
export type AreaScriptSpecialType = 'screamer' | 'ghost';

// 同時数キャップ(社長指定): パンプキン2/犬2/弾3。別枠: 叫び1/ゴースト2。
export const AREA_SCRIPT_CAPS: Record<AreaScriptType | AreaScriptSpecialType, number> = {
  pumpkin: 2, werewolf: 2, plant: 3, screamer: 1, ghost: 2,
};

export const AREA_SCRIPT_ROLL_INTERVAL_MS = 15000; // ロール間隔(リフラクトリと同じ15s粒度)
// エリア別のセット発火確率(1ロールあたり・index=areaIdx 0..4)。エリア0は出さない。
export const AREA_SCRIPT_CHANCE_BY_AREA = [0, 0.20, 0.25, 0.30, 0.35];
// 別枠(叫び/ゴースト)の発火確率(1ロールあたり。メインより控えめ)。
export const AREA_SCRIPT_SPECIAL_CHANCE = 0.10;
// 別枠の解禁: 3分経過 or エリア3以降(社長指定)。
export const AREA_SCRIPT_SPECIAL_UNLOCK_MS = 3 * 60 * 1000;
export const AREA_SCRIPT_SPECIAL_AREA_MIN = 3;
// §3ディレクター連携: intensityがこの値以上(ピンチ)の間は発火させない(叩き台)。
export const AREA_SCRIPT_INTENSITY_MAX = 0.75;

// 1セットぶんの構成。countMax>countMinの時はロールで解決(エリア1の「弾1-2」)。
export interface AreaScriptSpawnSpec { type: AreaScriptType; countMin: number; countMax: number }
const s = (type: AreaScriptType, countMin: number, countMax = countMin): AreaScriptSpawnSpec => ({ type, countMin, countMax });

// エリア別パターン表(社長指定・v0.26.10)。各ロールで3(エリア4は4)択から一様に1つ選ぶ。
// エリア4は「塩梅で任せる」=エリア3を一段上げつつキャップ内(パンプキン+犬の混成ペアを追加)。
export const AREA_SCRIPT_PATTERNS: Record<number, AreaScriptSpawnSpec[][]> = {
  1: [[s('pumpkin', 1)], [s('werewolf', 1)], [s('plant', 1, 2)]],
  2: [[s('pumpkin', 1), s('plant', 1)], [s('werewolf', 1), s('plant', 1)], [s('plant', 2)]],
  3: [[s('pumpkin', 1), s('plant', 2)], [s('werewolf', 1), s('plant', 2)], [s('plant', 3)]],
  4: [[s('pumpkin', 1), s('plant', 2)], [s('werewolf', 1), s('plant', 2)], [s('plant', 3)], [s('pumpkin', 1), s('werewolf', 1)]],
};

// §3ディレクター連携ゲート: 「エリア表=何を出すか」「ディレクター=いつ出すか」の分業。
// gateコマ中だけ発火可。導入/緩/boss・ピンチ(intensity高)・RELAX(息継ぎ)・pity(救済)中は発火させない。
export interface AreaScriptGateInput {
  phaseKind: 'buildup' | 'gate' | 'boss';
  macro: DirectorMacro;
  intensity: number;
  pityBlocked: boolean;
}
export const areaScriptGateOk = (g: AreaScriptGateInput): boolean =>
  g.phaseKind === 'gate' && g.macro !== 'relax' && g.intensity < AREA_SCRIPT_INTENSITY_MAX && !g.pityBlocked;

export interface ResolvedAreaSpawn { type: EnemyType; count: number }

export interface AreaScriptRollInput {
  areaIdx: number;                                // プレイヤーの現在エリア(0-4)
  chanceRoll: number;                             // 0-1一様乱数(発火判定)
  patternRoll: number;                            // 0-1一様乱数(パターン選択)
  countRoll: number;                              // 0-1一様乱数(count範囲の解決)
  alive: Partial<Record<EnemyType, number>>;      // 盤面の型別生存数(キャップ判定)
  refractoryTypes: ReadonlySet<EnemyType>;        // リフラクトリ中の型(投入しない)
}

// メイントラック(パンプキン/犬/弾)のロール。発火しなければ空配列。
// キャップ超過分は切り捨て(count=min(指定, cap-生存数))、リフラクトリ中の型は0。
export const rollAreaScriptSpawns = (input: AreaScriptRollInput): ResolvedAreaSpawn[] => {
  const patterns = AREA_SCRIPT_PATTERNS[input.areaIdx];
  if (!patterns) return [];
  const chance = AREA_SCRIPT_CHANCE_BY_AREA[input.areaIdx] ?? 0;
  if (input.chanceRoll >= chance) return [];
  const pattern = patterns[Math.min(patterns.length - 1, Math.floor(input.patternRoll * patterns.length))];
  const out: ResolvedAreaSpawn[] = [];
  for (const spec of pattern) {
    if (input.refractoryTypes.has(spec.type)) continue;
    const desired = spec.countMin + Math.floor(input.countRoll * (spec.countMax - spec.countMin + 1));
    const room = AREA_SCRIPT_CAPS[spec.type] - (input.alive[spec.type] ?? 0);
    const count = Math.min(desired, Math.max(0, room));
    if (count > 0) out.push({ type: spec.type, count });
  }
  return out;
};

export interface AreaScriptSpecialRollInput {
  areaIdx: number;
  gameTimeMs: number;
  chanceRoll: number;
  pickRoll: number;
  alive: Partial<Record<EnemyType, number>>;
}

// 別枠トラック(叫び/ゴースト)のロール。解禁は3分経過orエリア3以降。キャップ内の候補から一様に1体。
export const rollAreaScriptSpecial = (input: AreaScriptSpecialRollInput): EnemyType | null => {
  const unlocked = input.gameTimeMs >= AREA_SCRIPT_SPECIAL_UNLOCK_MS || input.areaIdx >= AREA_SCRIPT_SPECIAL_AREA_MIN;
  if (!unlocked) return null;
  if (input.chanceRoll >= AREA_SCRIPT_SPECIAL_CHANCE) return null;
  const candidates: AreaScriptSpecialType[] = (['screamer', 'ghost'] as const)
    .filter(t => (input.alive[t] ?? 0) < AREA_SCRIPT_CAPS[t]);
  if (candidates.length === 0) return null;
  return candidates[Math.min(candidates.length - 1, Math.floor(input.pickRoll * candidates.length))];
};
