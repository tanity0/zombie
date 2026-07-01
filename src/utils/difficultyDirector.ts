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

export type PhaseKind = 'buildup' | 'gate' | 'boss';

export interface Phase {
  kind: PhaseKind;
  index: number;    // 同種の通し番号(gate①②… / buildup①②…)
  startMs: number;
  endMs: number;    // boss は Infinity
  countCap: number; // このフェーズの屋外通常湧き上限(敵数)
}

export const ENEMY_COUNT_FLOOR = 10; // 平均の目安(社長指示: 平均10)
export const ENEMY_COUNT_CEIL = 20;  // 天井(社長指示: max20・難易度が高い時だけ到達)

const S = 1000;

// 7分アークのフェーズ表。gate(関所)は密度スパイク、buildup(余裕)は密度低め。
// 台本セットピース(stageDirector: pumpkin1:45 / onslaught3:55 / pumpkin pair4:55)に
// 関所窓を概ね重ねてある。城ボスは 7:00(=420s)。
export const PHASES: Phase[] = [
  { kind: 'buildup', index: 1, startMs: 0,        endMs: 95 * S,  countCap: 8  }, // 導入(優しめ)
  { kind: 'gate',    index: 1, startMs: 95 * S,   endMs: 135 * S, countCap: 14 }, // 関所①(育ち確認・軽) ~pumpkin
  { kind: 'buildup', index: 2, startMs: 135 * S,  endMs: 225 * S, countCap: 10 },
  { kind: 'gate',    index: 2, startMs: 225 * S,  endMs: 270 * S, countCap: 20 }, // 関所②PEAK ~onslaught
  { kind: 'buildup', index: 3, startMs: 270 * S,  endMs: 290 * S, countCap: 11 }, // 短い立て直し
  { kind: 'gate',    index: 3, startMs: 290 * S,  endMs: 330 * S, countCap: 18 }, // 関所③ ~pumpkin pair
  { kind: 'buildup', index: 4, startMs: 330 * S,  endMs: 400 * S, countCap: 11 }, // 最終育成(餌厚め)
  { kind: 'gate',    index: 4, startMs: 400 * S,  endMs: 420 * S, countCap: 20 }, // 直前関所
  { kind: 'boss',    index: 1, startMs: 420 * S,  endMs: Infinity, countCap: 12 }, // 城ボス以降
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
