// PACING_PUZZLE.md §5.14 バッチM13: ネームド(宿敵)システム。
// エルデンリング型「苦戦→リベンジ→解放」のラン型移植。純関数(store/Reactに依存しない)=
// ユニットテスト可能。実際の永続化・湧き注入・描画は gameStore.ts / directorTick.ts /
// pixiScene.ts 側が本ファイルの定数・純関数を消費する。

import type { EnemyType } from '../types/game';
import { isHiddenBoss } from './enemyUtils';

// 社長決定v0.25.1481→v0.25.1482(候補は多いほど良い=32名に増量): 裏ボス=北欧の神々を
// 予約するため、ネームドはギリシャ神話の怪物から取る(名前空間を神話ごとに分離)。
// PACING_PUZZLE.md §6.20 バッチM45(社長指示v0.25.1755): 表示を「CODE:ローマ字」表記へ現代化。
// v0.25.3199(社長指示「CODE削除」): 接頭辞「CODE:」を全廃し素のローマ字名にする。永続データに
// 残る旧「CODE:◯◯」は下の normalizeNamedName / normalizeNamedNamesInText が読み時に剥がす。
export const NAMED_ENEMY_NAMES: readonly string[] = [
  'CERBERUS', 'ORTHRUS', 'HYDRA', 'CHIMERA', 'MEDUSA', 'STHENO', 'EURYALE', 'MINOTAUR',
  'HARPY', 'SCYLLA', 'CHARYBDIS', 'ECHIDNA', 'TYPHON', 'LAMIA', 'EMPUSA', 'MORMO',
  'LYCAON', 'PYTHON', 'LADON', 'GERYON', 'CACUS', 'ARGOS', 'TALOS', 'SIREN',
  'CETO', 'SPHINX', 'CYCLOPS', 'POLYPHEMUS', 'ANTAEUS', 'NEMEA', 'STYMPHALOS', 'HYPNOS',
];

// 旧名→新表記の正規化マップ(§6.20/名称統一バッチ=社長指示v0.25.3443)。localStorage 永続済みの記録(namedFoe.name・
// 年表等)で旧名が来ても表示層で新表記に変換するための読み時正規化ヘルパー。
// 永続データ自体の書き換えは不要(このマップは表示直前にだけ通す)。
// ・宿敵32名(ギリシャ神話): 旧カタカナ→ローマ字(§6.20 M45/v0.25.3199 の正=素のローマ字)。
// ・固有名ボス(天使/裏ボス): 名称統一バッチ(社長指示v0.25.3443「UIの名前を揃える」)でカットイン台帳
//   (src/data/bossCutin.ts)の和名が正になったため、**旧ローマ字→和名**へ向きを反転。
//   旧「天使◯◯」接頭辞付きの最古記録も和名(接頭辞なし)へ(社長指示v0.25.1756「天使 はいらない」)。
const NAMED_NAME_LEGACY_MAP: Readonly<Record<string, string>> = {
  // 天使(ゲート2ボス): 旧ローマ字表記(v0.25.1755〜名称統一前の記録)→和名
  'MIGUEL': 'ミゲル',
  'JIBRIL': 'ジブリル',
  'RAFI': 'ラフィ',
  'URI': 'ウリ',
  'SURIEL': 'スリィエル',
  'ACRASIEL': 'アクラシエル',
  // 天使: 最古のカタカナ+種族接頭辞記録→和名(接頭辞を剥がすだけ)
  '天使ミゲル': 'ミゲル',
  '天使ジブリル': 'ジブリル',
  '天使ラフィ': 'ラフィ',
  // 裏ボス: 旧ローマ字表記→和名
  'MIMIR': 'ミーミル',
  'JORMUNGAND': 'ヨルムンガルド',
  'SKADI': 'スカジ',
  'THOR': 'トール',
  // 隠しボス(stage-2): 旧「アイドル」→カットイン台帳名「偶像」
  'アイドル': '偶像',
  // 宿敵/クエストネームド(32名): 旧カタカナ→ローマ字(こちらはローマ字が正のまま)
  'ケルベロス': 'CERBERUS',
  'オルトロス': 'ORTHRUS',
  'ヒュドラ': 'HYDRA',
  'キマイラ': 'CHIMERA',
  'メデューサ': 'MEDUSA',
  'ステンノ': 'STHENO',
  'エウリュアレ': 'EURYALE',
  'ミノタウロス': 'MINOTAUR',
  'ハルピュイア': 'HARPY',
  'スキュラ': 'SCYLLA',
  'カリュブディス': 'CHARYBDIS',
  'エキドナ': 'ECHIDNA',
  'テュポン': 'TYPHON',
  'ラミア': 'LAMIA',
  'エンプーサ': 'EMPUSA',
  'モルモ': 'MORMO',
  'リュカオン': 'LYCAON',
  'ピュトン': 'PYTHON',
  'ラドン': 'LADON',
  'ゲリュオン': 'GERYON',
  'カクス': 'CACUS',
  'アルゴス': 'ARGOS',
  'タロス': 'TALOS',
  'セイレーン': 'SIREN',
  'ケートー': 'CETO',
  'スフィンクス': 'SPHINX',
  'キュクロプス': 'CYCLOPS',
  'ポリュペモス': 'POLYPHEMUS',
  'アンタイオス': 'ANTAEUS',
  'ネメア': 'NEMEA',
  'スティンファロス': 'STYMPHALOS',
  'ヒュプノス': 'HYPNOS',
};

// 旧名→新表記(素のローマ字)への正規化(§6.20/v0.25.3199)。旧カタカナと旧「CODE:◯◯」の両方を
// 受け、未知の名前(既に新表記/該当なし)はそのまま返す。
export const normalizeNamedName = (name: string): string => {
  const bare = name.startsWith('CODE:') ? name.slice('CODE:'.length) : name;
  return NAMED_NAME_LEGACY_MAP[bare] ?? bare;
};

// 文章内の旧名を全置換する正規化(§6.20追補・社長指示v0.25.1756)。年表などlocalStorageに
// 「記録時の文言」が焼き込まれている行の表示用(保存データは書き換えない)。
// ・「天使ミゲル」のような種族接頭辞は接頭辞ごと新表記に置換(社長指示「天使 はいらない」)。
// ・部分一致事故を防ぐため長い名前から先に置換(例: 「ステンノ」と「テンノ」のような包含関係対策)。
const LEGACY_NAMES_LONGEST_FIRST: readonly string[] =
  Object.keys(NAMED_NAME_LEGACY_MAP).sort((a, b) => b.length - a.length);
export const normalizeNamedNamesInText = (text: string): string => {
  let out = text;
  for (const legacy of LEGACY_NAMES_LONGEST_FIRST) {
    if (!out.includes(legacy)) continue;
    const modern = NAMED_NAME_LEGACY_MAP[legacy];
    out = out.split(`天使${legacy}`).join(modern).split(legacy).join(modern);
  }
  // v0.25.3199: 旧表記「CODE:◯◯」が焼き込まれた記録は接頭辞だけ剥がす(名前はこのゲームでは
  // 「CODE:」の直後に続く形しか存在しないので、単純除去で衝突しない)。
  return out.split('CODE:').join('');
};

export const NAMED_HP_MULT = 2;
export const NAMED_DMG_MULT = 2;
export const NAMED_SIZE_MULT = 1.5; // 表示・当たり判定とも(社長指定)
export const NAMED_SPAWN_CHANCE = 0.6; // ラン開始時に1回だけ抽選(叩き台)
export const NAMED_TREASURE_GOLD = 150; // 討伐報酬のゴールド(叩き台)
export const NAMED_TINT = 0xffd700; // 専用tint=黄金(社長確定v0.25.1484。レアの青/紫/赤と被らない)

// §0.5と同じ規律の値(特別枠=screamer/ghostと揃える。scriptPuzzle.tsのSPECIAL_CD_MS/
// POST_HIT_GUARD_MSと同じ値だが、宿敵はラン通算1体だけの一発抽選なので独立CDで持つ)。
export const NAMED_SPAWN_CD_MS = 3000;
export const NAMED_POST_HIT_GUARD_MS = 1500;

export interface NamedFoeMeta {
  type: EnemyType;
  name: string;
  grudge: number; // 因縁回数(持ち越しのたびに+1。討伐/新規上書きで0)
}

// 昇格除外: 城ボス(giantbat)・死神(reaper)・裏ボス・紅き月個体(全体2倍バフ中の個体は「素の強さ」の
// 代表にならない)・型不明(地雷等の環境ハザード)。
export const isPromotionExcluded = (
  killerType: EnemyType | null | undefined,
  redNightActive: boolean,
): boolean =>
  !killerType || killerType === 'giantbat' || killerType === 'reaper' || isHiddenBoss(killerType) || redNightActive;

// 名前抽選(乱数注入可=テスト用)。候補は多いほど良い(社長指示)=32名からランダム1つ。
export const pickNamedEnemyName = (rand: () => number = Math.random): string =>
  NAMED_ENEMY_NAMES[Math.floor(rand() * NAMED_ENEMY_NAMES.length)];

// ラン開始時の60%抽選(乱数注入可=テスト用)。
export const rollNamedSpawnThisRun = (rand: () => number = Math.random): boolean => rand() < NAMED_SPAWN_CHANCE;

// プレイヤーを倒した敵の型からの昇格判定。既存の宿敵が「その特定個体(isNamed)」に殺された場合は
// 強化しない(因縁回数+1のみ=持ち越しと同じ扱い)。それ以外の対象外でない型に殺された場合は
// 新規上書き(因縁回数0・名前を引き直す)。除外対象に殺された場合は何もしない(現状維持)。
export type PromotionOutcome =
  | { kind: 'none' }
  | { kind: 'grudge' } // 自分の宿敵に殺された→強化なし・因縁+1
  | { kind: 'overwrite'; type: EnemyType; name: string }; // 新たな型に殺された→上書き

export const decidePromotionOnDeath = (
  killerType: EnemyType | null | undefined,
  killerWasNamed: boolean,
  redNightActive: boolean,
  rand: () => number = Math.random,
): PromotionOutcome => {
  if (killerWasNamed) return { kind: 'grudge' };
  if (isPromotionExcluded(killerType, redNightActive)) return { kind: 'none' };
  return { kind: 'overwrite', type: killerType as EnemyType, name: pickNamedEnemyName(rand) };
};
