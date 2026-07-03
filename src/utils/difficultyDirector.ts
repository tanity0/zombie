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
import type { ChaffMix } from './chaffMix';

export type PhaseKind = 'buildup' | 'gate' | 'boss';

// シーン(緩急の“部品”): フェーズに割り当てる湧きの味付け。数(density)はフェーズの countCap 側で持つので、
// ここでは「敵構成(featured=強調する型)」と「沸きスピード(intervalMult=湧き間隔の倍率・<1で速い)」の2レバー。
// featured は既存の重み(BASE×AREA)への“乗算バイアス”(エリアで出現不可の型は0のまま=エリア規約を尊重)。
export interface SpawnScene {
  id: string;
  featured: EnemyType[]; // 強調する敵型(重み増し)。[]=素の分布。
  intervalMult: number;  // 湧き間隔の倍率。<1=速い(無双/カオス) / >1=遅い(優しい)。
  suppressed?: EnemyType[]; // 抑える敵型(重み減・×SCENE_SUPPRESSED_MULT)。社長指示: ゾンビは固いので緩の時に多数出さない。
  rareMult?: number; // レア(色付き)出現の演出倍率。省略=1。DISTRIBUTION_REDESIGN.md③: 緩=0/無双=0.5/関所≥1.2。
  // PACING_REDESIGN.md バッチ1.5: featured指定の型がエリア重み0でも床(FEATURED_MIN_AREA_WEIGHT)で
  // 出現できる特例を、このシーンに限り許可するか。省略=false(=エリア規約に完全準拠、床は効かない)。
  // true にするのは講習(relief-pumpkin/relief-wolf。序盤の1種練習は安全)と mowdown(深部のチャフ供給)
  // のみ。関所シーン(gate-*)は全て false=「チャフのための床」が問題児の裏口になる事故を防ぐ。
  featuredFloor?: boolean;
  // PACING_REDESIGN.mdバッチ3.5-A: チャフ(bat/skeleton/zombie)の役割配合。省略時は従来どおり
  // エリア重み任せ(selectEnemyTypeでmixが無いシーンは完全に既存挙動と一致)。
  mix?: ChaffMix;
}

export interface Phase {
  kind: PhaseKind;
  index: number;    // 同種の通し番号(gate①②… / buildup①②…)
  startMs: number;
  endMs: number;    // boss は Infinity
  countCap: number; // このフェーズの屋外通常湧き上限(敵数)
  scene: SpawnScene; // このフェーズの湧きシーン(構成/速度)
  // PACING_REDESIGN.mdバッチ3: このgateフェーズで許される最大段(旧・離散段の名残)。
  // gatePressureのceilingForMaxRungで連続天井へ変換される。gate以外は未指定(pressure対象外)。
  // 序盤の関所=3 / 中盤=4〜5 / 終盤・7分以降の延長関所=6〜7(ラン全体の階段=①ラン全体の階段、
  // これとゾーン上限の小さい方が実効天井になる)。
  maxRung?: number;
}

// シーン・ライブラリ(私案・社長の分類に対応。数値は実機調整前提)。
// 緩(relief/mowdown)系は zombie を抑える(社長指示: ゾンビは固いので緩の時に多数出すと休憩にならない)。
// rareMult(DISTRIBUTION_REDESIGN.md③): 緩=0(休憩を汚さない)/無双=0.5(群れに時々1体)/
// 関所=1.2〜1.35(山場の顔・chaosが最大)/ボス=1.0(素のまま)。基礎率(距離)とRank増幅の上に乗る演出レバー。
// バッチ3.5-A: チャフ配合の叩き台(社長定義の役割=bat爽快/skeleton刻み/zombie壁。すべて実機調整前提)。
// v0.25.1343: 全シーン/全台本にmixを指定(未指定=素の分布はゾンビ過多になり「配合が効かない」体感の
// 原因だった。GAME_AUDIT追補)。
const SCENE_RELIEF_SPARSE: SpawnScene  = { id: 'relief-sparse',  featured: [], intervalMult: 1.3, suppressed: ['zombie'], rareMult: 0, mix: { bat: 70, skeleton: 25, zombie: 5 } };                      // 優しい: 雑魚まばら
const SCENE_RELIEF_PUMPKIN: SpawnScene = { id: 'relief-pumpkin', featured: ['pumpkin'], intervalMult: 1.1, suppressed: ['zombie'], rareMult: 0, featuredFloor: true, mix: { bat: 55, skeleton: 40, zombie: 5 } }; // 優しい: パンプキン練習(講習=床あり)
const SCENE_RELIEF_WOLF: SpawnScene    = { id: 'relief-wolf',    featured: ['werewolf'], intervalMult: 1.1, suppressed: ['zombie'], rareMult: 0, featuredFloor: true, mix: { bat: 55, skeleton: 40, zombie: 5 } }; // 優しい: 犬(ダッシュ)練習(講習=床あり)
const SCENE_MOWDOWN: SpawnScene        = { id: 'mowdown',        featured: ['bat', 'skeleton'], intervalMult: 0.6, suppressed: ['zombie'], rareMult: 0.5, featuredFloor: true, mix: { bat: 60, skeleton: 35, zombie: 5 } }; // 無双: 弱雑魚を高速大量(深部のチャフ供給=床あり)
// GAME_AUDIT #3: 旧featured ['pumpkin','werewolf'] は自己矛盾で一度も出ていなかった
// (関所①はmaxRung3=pressure天井0.49 < 配役解禁0.50。問題児は再設計後、シーンfeaturedではなく
// gatePressureの許可/配役が出す)。段3の実体=「テンポ+数+弾まで」に合わせfeaturedをplantへ変更
// (エリア2以深でpressure≥0.35解禁後の出現を加速するだけ。エリア0-1はゾーン天井0.34で従来どおり出ない)。
const SCENE_GATE_PUMPWOLF: SpawnScene  = { id: 'gate-pumpwolf',  featured: ['plant'], intervalMult: 0.8, rareMult: 1.2, mix: { bat: 30, skeleton: 45, zombie: 25 } }; // 関所①(数系): テンポ+数+弾まで(床なし=エリア規約に従う)
const SCENE_GATE_MASS_RANGED: SpawnScene = { id: 'gate-mass-ranged', featured: ['plant'], intervalMult: 0.6, rareMult: 1.2, mix: { bat: 25, skeleton: 35, zombie: 40 } };          // 関所(射線系): 雑魚大量+飛び道具(壁+弾のコンボ・床なし)
const SCENE_GATE_CHAOS: SpawnScene     = { id: 'gate-chaos',     featured: ['pumpkin', 'werewolf', 'plant'], intervalMult: 0.55, rareMult: 1.35, mix: { bat: 30, skeleton: 40, zombie: 30 } }; // 関所: 全部盛りカオス(床なし。v0.25.1343: mix未指定だと素の分布でゾンビ過多になるため配合を指定)
const SCENE_BOSS: SpawnScene           = { id: 'boss',           featured: [], intervalMult: 1.0, rareMult: 1.0, mix: { bat: 30, skeleton: 40, zombie: 30 } };                     // 城ボス中

// PACING_REDESIGN.md 憲法第1条: 画面内は基本10体。台本の countCap は全フェーズ 8〜10 に統一
// (旧: gate/bossが14〜20まで無条件で盛っていた=「最初からMAXプラン」だった)。11〜20の帯は
// boredomDirector(退屈シグナル)による上振れ専用バッファへ移した。関所の圧は「数」ではなく
// テンポ(intervalMult)と構成(featured/ラダー)で出す(憲法第3条)。
export const ENEMY_COUNT_FLOOR = 10; // 基本上限(憲法第1条)。台本のcountCapは概ねこの近辺。
export const ENEMY_COUNT_CEIL = 20;  // 天井。退屈シグナルの上振れ専用(社長指示: max20)。

const S = 1000;

// 7分アークのフェーズ表。gate(関所)は密度スパイク、buildup(余裕)は密度低め。
// 台本セットピース(stageDirector: pumpkin1:45 / onslaught3:55 / pumpkin pair4:55)に
// 関所窓を概ね重ねてある。城ボスは 7:00(=420s)。
// 14分コース(社長指示): 0-7分=基本の緩急1ターン(白ボス=中間ライン・任意離脱)。7-14分=“急”多めの
// しんどい延長(エンドコンテンツ)。7-14は関所を増やし・余裕を短く・速度を上げて強度を底上げする(approach A)。
export const PHASES: Phase[] = [
  // ── 0-7分: 基本ループ ──
  { kind: 'buildup', index: 1, startMs: 0,        endMs: 95 * S,  countCap: 8,  scene: SCENE_RELIEF_SPARSE },  // 導入(優しめ・雑魚まばら)
  { kind: 'gate',    index: 1, startMs: 95 * S,   endMs: 135 * S, countCap: 10, scene: SCENE_GATE_PUMPWOLF, maxRung: 3 },  // 関所①(育ち確認) パンプキン+犬
  { kind: 'buildup', index: 2, startMs: 135 * S,  endMs: 225 * S, countCap: 9,  scene: SCENE_RELIEF_PUMPKIN }, // 余裕: パンプキン練習
  { kind: 'gate',    index: 2, startMs: 225 * S,  endMs: 270 * S, countCap: 10, scene: SCENE_GATE_CHAOS, maxRung: 4 },     // 関所②PEAK カオス
  { kind: 'buildup', index: 3, startMs: 270 * S,  endMs: 290 * S, countCap: 10, scene: SCENE_MOWDOWN },        // 無双(短い谷・弱雑魚高速)
  { kind: 'gate',    index: 3, startMs: 290 * S,  endMs: 330 * S, countCap: 10, scene: SCENE_GATE_MASS_RANGED, maxRung: 4 }, // 関所③ 雑魚大量+飛び道具
  { kind: 'buildup', index: 4, startMs: 330 * S,  endMs: 400 * S, countCap: 9,  scene: SCENE_RELIEF_WOLF },    // 余裕: 犬練習(最終育成)
  { kind: 'gate',    index: 4, startMs: 400 * S,  endMs: 420 * S, countCap: 10, scene: SCENE_GATE_CHAOS, maxRung: 5 },     // 直前関所 カオス
  // ── 7:00 白ボス(中間ライン) ──
  { kind: 'boss',    index: 1, startMs: 420 * S,  endMs: 450 * S, countCap: 10, scene: SCENE_BOSS },           // 城ボス戦(離脱=クリア可)
  // ── 7-14分: 延長(急多め・しんどい)。余裕を短く・関所を厚く。 ──
  { kind: 'buildup', index: 5, startMs: 450 * S,  endMs: 510 * S, countCap: 9,  scene: SCENE_RELIEF_WOLF },    // 短い立て直し
  { kind: 'gate',    index: 5, startMs: 510 * S,  endMs: 560 * S, countCap: 10, scene: SCENE_GATE_CHAOS, maxRung: 5 },     // 延長関所⑤ カオス
  { kind: 'buildup', index: 6, startMs: 560 * S,  endMs: 600 * S, countCap: 10, scene: SCENE_MOWDOWN },        // 無双(短い谷)
  { kind: 'gate',    index: 6, startMs: 600 * S,  endMs: 660 * S, countCap: 10, scene: SCENE_GATE_MASS_RANGED, maxRung: 6 }, // 延長関所⑥ 雑魚大量+飛び道具
  { kind: 'buildup', index: 7, startMs: 660 * S,  endMs: 690 * S, countCap: 9,  scene: SCENE_RELIEF_PUMPKIN }, // 短い余裕
  { kind: 'gate',    index: 7, startMs: 690 * S,  endMs: 760 * S, countCap: 10, scene: SCENE_GATE_CHAOS, maxRung: 6 },     // 延長関所⑦ カオス(長め)
  { kind: 'buildup', index: 8, startMs: 760 * S,  endMs: 790 * S, countCap: 10, scene: SCENE_MOWDOWN },        // 無双(束の間)
  { kind: 'gate',    index: 8, startMs: 790 * S,  endMs: 840 * S, countCap: 10, scene: SCENE_GATE_CHAOS, maxRung: 7 },     // 延長関所⑧ クライマックス
  // 14:00 以降: 特定の最終ボスは無い(城ボスが唯一のボス)。カオス継続で高強度を維持。プレイヤーによっては
  // 裏ボス攻略タイム(裏ボスは深度で別途出現)。ハンターは従来どおり=余裕プレイへの緊張感トリガー(優勢判定・別管理)。
  { kind: 'gate',    index: 9, startMs: 840 * S,  endMs: Infinity, countCap: 10, scene: SCENE_GATE_CHAOS, maxRung: 7 },   // 14:00+ 終局(カオス継続)
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
