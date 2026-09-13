// ボスメーカー: 「行動」を主要な数字だけにするための**裏マスター**(BOSS_MAKER.md §18)。
//
// 社長指示(2026-08-03):
//   > いま技以外の、行動などについて**数字が細かすぎて使いづらい**ので、**主要な数字だけ入れる仕様**に
//   > したい。たとえば、**距離の取り方も 近 中 遠 の3種類**にして、**数字は全体を通して固定帯**。
//   > 細かく指定しづらいものは**それに合わせてセットで規定値を設定しておき、表示しない**。
//   > そこを変える必要がでてきたら、**裏側のマスターで変更する**。
//
// ★問題は「欄が23個ある」ことではなく、**大半が単独では決められない**こと。現行値は実際に
// 束で辻褄が合っている(`主戦帯 上限340 = 中帯の上限340` / `主戦帯 下限200 = rollDist 140 + 余白60`)。
// よって**束のまま選ばせ、中身は画面に出さない**。
//
// ★**「まん中」= 現行のアイドルの値そのもの**にしてある。既定は全部まん中なので、
// **ゲームの挙動は1つも変わらない**(BOSS_MAKER.md §2-4「既定値が現行の実装値と完全一致」)。
// ここは**データ**であって、ゲームロジックは1行も変わらない(値の置き場所も形も従来どおり)。
//
// ★ここは**マスター(データ)だけ**を置く。束の扱い方(逆引き・適用可否・書き込む値の取り出し)は
// `bossTuning.ts` 側の汎用関数(`matchedOption` / `choiceApplicable` / `choiceValues`)にある
// ——`TuningField` と同じ役割分担(スキーマの扱いは1箇所、データはボス/マスター側)。
//
// 純関数のみ・レンダラ/store非依存。
import { choicePaths, type TuningChoiceField } from './bossTuning';

// ================================================================================================
// マスター(固定帯)。★社長の「数字は全体を通して固定帯」= この表は**ボス横断で1つ**。
// そのボスに存在しないパスを含む束は**出さない**(`choiceApplicable`)。
// ================================================================================================

/**
 * 間合い。
 *
 * ★**主戦帯の下限は3段とも200で固定**。下限は `shape.rollDist`(140・**技タブの値**)と
 * `下限 = rollDist + 余白60` で結ばれており(「密着から離脱ローリング1回でちょうど主戦帯の下端へ
 * 戻る」)、**下限だけ動かすとローリングが帯を通り越す/届かない**。技タブは今回の対象外
 * (社長「技以外の」)なので、**下限を動かさないことで束の意味を守る**。
 *
 * ★**遠帯の上限は3段とも `shape.snipeRange`(900)未満**。超えると**超遠帯の始まりより狙撃線が
 * 短くなり**、「遠距離に居させない」という本ボスの主題が壊れる。
 */
const RANGE_CHOICE: TuningChoiceField = {
  key: 'range',
  label: '間合い',
  group: 'behavior',
  section: '間合い',
  hint: 'ボスが保ちたい距離と、距離帯の境目をまとめて選ぶ。細かい px は裏で決まっている。',
  options: [
    { key: 'near', label: '近', values: { 'zoneEdges.meleeMax': 100, 'zoneEdges.nearMax': 240, 'zoneEdges.midMax': 520, 'neutralBand.min': 200, 'neutralBand.max': 240 } },
    { key: 'mid', label: '中', values: { 'zoneEdges.meleeMax': 140, 'zoneEdges.nearMax': 340, 'zoneEdges.midMax': 700, 'neutralBand.min': 200, 'neutralBand.max': 340 } },
    { key: 'far', label: '遠', values: { 'zoneEdges.meleeMax': 180, 'zoneEdges.nearMax': 460, 'zoneEdges.midMax': 880, 'neutralBand.min': 200, 'neutralBand.max': 460 } },
  ],
};

/** 動きの速さ。★**最短 < 最長**(`idolTick` が `min + rand×(max−min)` なので逆転すると幅が負になる)。 */
const TEMPO_CHOICE: TuningChoiceField = {
  key: 'tempo',
  label: '動きの速さ',
  group: 'behavior',
  section: '中立の移動',
  hint: '技を出していない間の動き方。詰める/離れる/並走の速さと、次の技までの間。',
  options: [
    { key: 'slow', label: 'のろい', values: { 'verbSpeedMult.close': 0.85, 'verbSpeedMult.retreat': 0.35, 'verbSpeedMult.strafe': 0.35, 'neutral.minMs': 900, 'neutral.maxMs': 1700 } },
    { key: 'normal', label: 'ふつう', values: { 'verbSpeedMult.close': 1, 'verbSpeedMult.retreat': 0.45, 'verbSpeedMult.strafe': 0.45, 'neutral.minMs': 700, 'neutral.maxMs': 1300 } },
    { key: 'fast', label: 'すばやい', values: { 'verbSpeedMult.close': 1.2, 'verbSpeedMult.retreat': 0.6, 'verbSpeedMult.strafe': 0.6, 'neutral.minMs': 450, 'neutral.maxMs': 900 } },
  ],
};

/**
 * 手数(ストリングの段数)。★**必ず `P2 = P1 + 1`**(「フェーズ2で1段伸びる」現行仕様)。
 *
 * ★**「多」は台本を伸ばさないと効かない。** `bossSkeleton.pickStringScript` は
 * `len = min(段数の上限, 台本の段数)` で、既定の台本は全て4段。よって P2=5 は 4 に切り詰められる。
 * **勝手に台本を伸ばさない**(仕様変更になる)。代わりに `stringLenWarnings` が気づかせる。
 */
const HANDS_CHOICE: TuningChoiceField = {
  key: 'hands',
  label: '手数',
  group: 'behavior',
  section: 'ストリングと休符',
  hint: '1回のストリングで続けて出す技の数。多いほど攻めが途切れない。台本の段が足りないと段数までしか出ない。',
  options: [
    { key: 'few', label: '少', values: { 'stringLen.p1': 2, 'stringLen.p2': 3 } },
    { key: 'normal', label: '並', values: { 'stringLen.p1': 3, 'stringLen.p2': 4 } },
    { key: 'many', label: '多', values: { 'stringLen.p1': 4, 'stringLen.p2': 5 } },
  ],
};

/** 休み。★**休符は0にしない**(BOSS_MAKER.md §14-3「この休みがプレイヤーの攻撃チャンス」)。 */
const REST_CHOICE: TuningChoiceField = {
  key: 'rest',
  label: '休み',
  group: 'behavior',
  section: 'ストリングと休符',
  hint: 'ストリングの後に必ず入る休み。ここがプレイヤーの攻撃チャンス。短いほど厳しい。',
  options: [
    // v0.25.3061: 休符の既定900→1700(実装側の変更)にプリセット表が未追従でCIが赤くなっていた
    // (v3030の教訓「数値を変えるコミットは同名テストの直値まで同コミットで直す」の同型)。
    // 並=現行実装値。短/長は序列(短<並<長)を保つ開発ツール上の目安値。
    { key: 'short', label: '短', values: { 'rest.p1': 1000, 'rest.p2': 1000, waveDelayMs: 500 } },
    { key: 'normal', label: '並', values: { 'rest.p1': 1700, 'rest.p2': 1700, waveDelayMs: 650 } },
    { key: 'long', label: '長', values: { 'rest.p1': 2400, 'rest.p2': 2400, waveDelayMs: 850 } },
  ],
};

/** 懲罰。★**遠距離の長居 < 密着の居座り < 同角度の長居**(3段とも)。 */
const PUNISH_CHOICE: TuningChoiceField = {
  key: 'punish',
  label: '懲罰',
  group: 'behavior',
  section: '懲罰',
  hint: '同じことを続けた時にボスが返す仕組み。厳しいほど早く反応する。',
  options: [
    { key: 'soft', label: '緩', values: { 'punish.farMs': 3000, 'punish.meleeMs': 4500, 'punish.sameAngleMs': 6000, sameAngleDeg: 45 } },
    { key: 'normal', label: '並', values: { 'punish.farMs': 2000, 'punish.meleeMs': 3000, 'punish.sameAngleMs': 4000, sameAngleDeg: 30 } },
    { key: 'hard', label: '厳', values: { 'punish.farMs': 1300, 'punish.meleeMs': 2000, 'punish.sameAngleMs': 2600, sameAngleDeg: 20 } },
  ],
};

/** 行動パターンの束(全ボス共通の1表)。 */
export const BEHAVIOR_CHOICES: readonly TuningChoiceField[] = [
  RANGE_CHOICE, TEMPO_CHOICE, HANDS_CHOICE, REST_CHOICE, PUNISH_CHOICE,
];

/**
 * 束を持たないが**画面に出さない**値(単独の隠し値)。
 * `phaseHpThreshold` は「HP何%で第2形態か」で、束にするほどの選択肢が無い(全ボス0.5)。
 */
export const HIDDEN_SOLO_PATHS: readonly string[] = ['phaseHpThreshold'];

// ================================================================================================
// 純関数(マスターに依存するものだけ。汎用の束操作は bossTuning.ts 側)
// ================================================================================================

/**
 * ★**簡易表示で隠すパスの集合**。手書きのリストを別に持つと**マスターと二重管理**になり、
 * 束を1つ足した日にズレる。よって**必ず束から派生させる**(BOSS_MAKER.md §18-7-5)。
 */
export const hiddenPaths = (fields: readonly TuningChoiceField[] = BEHAVIOR_CHOICES): Set<string> => {
  const out = new Set<string>(HIDDEN_SOLO_PATHS);
  for (const f of fields) for (const p of choicePaths(f)) out.add(p);
  return out;
};

/**
 * 段数の上限に対して台本の段が足りない時の警告(**止めない**・BOSS_MAKER.md §11-2 と同じ作法)。
 * ★「手数=多」を選んでも P2 が台本の段数で切り詰められて**並と1ミリも変わらない**、という
 * 無言の空振りを気づける形にするためのもの。台本を伸ばすのは社長が台本エディタでやる。
 */
export const stringLenWarnings = (
  maxLen: { p1: number; p2: number },
  /**
   * ★**距離帯ごとに・抽選に出る台本だけ**を渡すこと。
   *  - 全ゾーンを1つの `Math.max` で見ると、**1本だけ5段に伸ばした瞬間に警告が消える**のに
   *    他のゾーンは4段のまま切り詰められ続ける(=無言で効かない状態が残る)。
   *  - `weight=0` / `off` の台本は `pickStringScript` の抽選対象から外れて**絶対に出ない**のに、
   *    最長には数えられてしまう(=**出ない台本が警告を黙らせる**)。
   */
  live: readonly { zoneLabel: string; len: number }[],
): string[] => {
  if (live.length === 0) return [];
  const longestByZone = new Map<string, number>();
  for (const s of live) longestByZone.set(s.zoneLabel, Math.max(longestByZone.get(s.zoneLabel) ?? 0, s.len));
  const out: string[] = [];
  for (const [phase, want] of [[1, maxLen.p1], [2, maxLen.p2]] as const) {
    const short = [...longestByZone.entries()].filter(([, longest]) => want > longest);
    if (short.length === 0) continue;
    const detail = short.map(([zone, longest]) => `${zone}=${longest}段`).join(' / ');
    out.push(`段数P${phase}=${want} に届かない距離帯があります(${detail})。そこでは段数までしか出ません`);
  }
  return out;
};
