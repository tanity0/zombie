// 難易度ディレクター(ステップ②: フェーズ状態機械 ＋「数」軸の動的上限)。
//
// 7分アーク(城ボス=7:00)を 余裕(buildup) ⇄ 関所(gate) で刻み、屋外の通常湧きに使う
// 「敵数の上限」をフェーズ駆動で動かす。社長指示: 平均≈10 / 天井20(使い切るかは難易度次第
// =これは“許可枠”であって強制湧き数ではない)。
//
// 本ステップで扱うのは「数」軸のみ。戦力連動(PP/M)・強さ(レア度)/種類 軸・関所ライブ補正は
// 後続ステップで載せる。裏ボス・ハンターは対象外(特別枠・別コントローラ)。
//
// レンダラ非依存の純関数=ヘッドレスでユニットテスト可能(src/utils)。

import type { EnemyType } from '../types/game';

export type PhaseKind = 'buildup' | 'gate' | 'boss';

// シーン(緩急の“部品”): フェーズに割り当てる湧きの味付け。数(density)はフェーズの countCap 側で持つので、
// ここでは「敵構成(featured=強調する型)」と「沸きスピード(intervalMult=湧き間隔の倍率・<1で速い)」の2レバー。
// featured は既存の重み(BASE×AREA)への“乗算バイアス”(エリアで出現不可の型は0のまま=エリア規約を尊重)。
export interface SpawnScene {
  id: string;
  featured: EnemyType[]; // 強調する敵型(重み増し)。[]=素の分布。
  intervalMult: number;  // 湧き間隔の倍率。<1=速い(無双/カオス) / >1=遅い(優しい)。
}

export interface Phase {
  kind: PhaseKind;
  index: number;    // 同種の通し番号(gate①②… / buildup①②…)
  startMs: number;
  endMs: number;    // boss は Infinity
  countCap: number; // このフェーズの屋外通常湧き上限(敵数)
  scene: SpawnScene; // このフェーズの湧きシーン(構成/速度)
}

// シーン・ライブラリ(私案・社長の分類に対応。数値は実機調整前提)。
const SCENE_RELIEF_SPARSE: SpawnScene  = { id: 'relief-sparse',  featured: [], intervalMult: 1.3 };                      // 優しい: 雑魚まばら
const SCENE_RELIEF_PUMPKIN: SpawnScene = { id: 'relief-pumpkin', featured: ['pumpkin'], intervalMult: 1.1 };            // 優しい: パンプキン練習
const SCENE_RELIEF_WOLF: SpawnScene    = { id: 'relief-wolf',    featured: ['werewolf'], intervalMult: 1.1 };           // 優しい: 犬(ダッシュ)練習
const SCENE_MOWDOWN: SpawnScene        = { id: 'mowdown',        featured: ['bat', 'skeleton'], intervalMult: 0.6 };    // 無双: 弱雑魚を高速大量
const SCENE_GATE_PUMPWOLF: SpawnScene  = { id: 'gate-pumpwolf',  featured: ['pumpkin', 'werewolf'], intervalMult: 0.8 }; // 関所: パンプキン+犬
const SCENE_GATE_MASS_RANGED: SpawnScene = { id: 'gate-mass-ranged', featured: ['plant'], intervalMult: 0.6 };          // 関所: 雑魚大量+飛び道具
const SCENE_GATE_CHAOS: SpawnScene     = { id: 'gate-chaos',     featured: ['pumpkin', 'werewolf', 'plant'], intervalMult: 0.55 }; // 関所: 全部盛りカオス
const SCENE_BOSS: SpawnScene           = { id: 'boss',           featured: [], intervalMult: 1.0 };                     // 城ボス中は素の分布

export const ENEMY_COUNT_FLOOR = 10; // 平均の目安(社長指示: 平均10)
export const ENEMY_COUNT_CEIL = 20;  // 天井(社長指示: max20・難易度が高い時だけ到達)

const S = 1000;

// 7分アークのフェーズ表。gate(関所)は密度スパイク、buildup(余裕)は密度低め。
// 台本セットピース(stageDirector: pumpkin1:45 / onslaught3:55 / pumpkin pair4:55)に
// 関所窓を概ね重ねてある。城ボスは 7:00(=420s)。
// 14分コース(社長指示): 0-7分=基本の緩急1ターン(白ボス=中間ライン・任意離脱)。7-14分=“急”多めの
// しんどい延長(エンドコンテンツ)。7-14は関所を増やし・余裕を短く・上限/速度を上げて強度を底上げする(approach A)。
export const PHASES: Phase[] = [
  // ── 0-7分: 基本ループ ──
  { kind: 'buildup', index: 1, startMs: 0,        endMs: 95 * S,  countCap: 8,  scene: SCENE_RELIEF_SPARSE },  // 導入(優しめ・雑魚まばら)
  { kind: 'gate',    index: 1, startMs: 95 * S,   endMs: 135 * S, countCap: 14, scene: SCENE_GATE_PUMPWOLF },  // 関所①(育ち確認) パンプキン+犬
  { kind: 'buildup', index: 2, startMs: 135 * S,  endMs: 225 * S, countCap: 10, scene: SCENE_RELIEF_PUMPKIN }, // 余裕: パンプキン練習
  { kind: 'gate',    index: 2, startMs: 225 * S,  endMs: 270 * S, countCap: 20, scene: SCENE_GATE_CHAOS },     // 関所②PEAK カオス
  { kind: 'buildup', index: 3, startMs: 270 * S,  endMs: 290 * S, countCap: 11, scene: SCENE_MOWDOWN },        // 無双(短い谷・弱雑魚高速)
  { kind: 'gate',    index: 3, startMs: 290 * S,  endMs: 330 * S, countCap: 18, scene: SCENE_GATE_MASS_RANGED }, // 関所③ 雑魚大量+飛び道具
  { kind: 'buildup', index: 4, startMs: 330 * S,  endMs: 400 * S, countCap: 11, scene: SCENE_RELIEF_WOLF },    // 余裕: 犬練習(最終育成)
  { kind: 'gate',    index: 4, startMs: 400 * S,  endMs: 420 * S, countCap: 20, scene: SCENE_GATE_CHAOS },     // 直前関所 カオス
  // ── 7:00 白ボス(中間ライン) ──
  { kind: 'boss',    index: 1, startMs: 420 * S,  endMs: 450 * S, countCap: 12, scene: SCENE_BOSS },           // 城ボス戦(離脱=クリア可)
  // ── 7-14分: 延長(急多め・しんどい)。余裕を短く・関所を厚く。 ──
  { kind: 'buildup', index: 5, startMs: 450 * S,  endMs: 510 * S, countCap: 12, scene: SCENE_RELIEF_WOLF },    // 短い立て直し
  { kind: 'gate',    index: 5, startMs: 510 * S,  endMs: 560 * S, countCap: 20, scene: SCENE_GATE_CHAOS },     // 延長関所⑤ カオス
  { kind: 'buildup', index: 6, startMs: 560 * S,  endMs: 600 * S, countCap: 13, scene: SCENE_MOWDOWN },        // 無双(短い谷)
  { kind: 'gate',    index: 6, startMs: 600 * S,  endMs: 660 * S, countCap: 20, scene: SCENE_GATE_MASS_RANGED }, // 延長関所⑥ 雑魚大量+飛び道具
  { kind: 'buildup', index: 7, startMs: 660 * S,  endMs: 690 * S, countCap: 13, scene: SCENE_RELIEF_PUMPKIN }, // 短い余裕
  { kind: 'gate',    index: 7, startMs: 690 * S,  endMs: 760 * S, countCap: 20, scene: SCENE_GATE_CHAOS },     // 延長関所⑦ カオス(長め)
  { kind: 'buildup', index: 8, startMs: 760 * S,  endMs: 790 * S, countCap: 14, scene: SCENE_MOWDOWN },        // 無双(束の間)
  { kind: 'gate',    index: 8, startMs: 790 * S,  endMs: 840 * S, countCap: 20, scene: SCENE_GATE_CHAOS },     // 延長関所⑧ クライマックス
  { kind: 'boss',    index: 2, startMs: 840 * S,  endMs: Infinity, countCap: 14, scene: SCENE_BOSS },          // 14:00 以降(終局)
];

// 指定時刻のフェーズ。範囲外(7分超)は最後の boss フェーズを返す。
export const phaseAt = (gameTime: number): Phase => {
  for (const p of PHASES) if (gameTime >= p.startMs && gameTime < p.endMs) return p;
  return PHASES[PHASES.length - 1];
};

// 屋外の通常湧き上限(敵数)。フェーズの countCap を安全域にクランプ。
// 「使い切るかは難易度次第」= これは上限(許可枠)であって強制湧き数ではない。
export const enemyCountCap = (gameTime: number): number => {
  const c = phaseAt(gameTime).countCap;
  return Math.max(6, Math.min(ENEMY_COUNT_CEIL, c));
};

// 指定時刻の湧きシーン(構成/速度)。スポーナが読む。
export const sceneAt = (gameTime: number): SpawnScene => phaseAt(gameTime).scene;
