// 難易度ディレクター ステップ③: 戦力マージン(PP/M)→ escalation(0..1)。
//
// 役割: プレイヤーが「その時刻の順調ライン」より育ちすぎ(過剰育成)なら、敵の
//   強さ(色ティア)・種類(重い型)を指数的に上げて“ギリギリ”へ引き戻す内部シグナル。
//
// 重要な安全性: **escalation=0 のとき、湧きの挙動は現状と完全に一致する**(色/種類の
//   バイアスは乗算で入るので 0 なら無変化)。順調(M≈1)/未育成(M<1)は escalation=0 に
//   落ちるので floor 据え置き=「未育成は無理に盛らない」「floor 固定」を満たす。
//   → 過剰育成(M>1)のときだけ上振れする、純加算的で安全な設計。
//
// スコア/経験値/レベルアップの各システムには一切書き込まない(読むだけ)。純関数=テスト可能。

export const DDA_BASE_MAX_HP = 120; // 参照HP(= PLAYER_BASE_HP)。maxHealth 投資の正規化に使う。

// プレイヤー戦力指数 PP(内部・難易度判定専用)。育ち(ビルド)の粗い代理値。
// レベルを背骨に、武器ティア/最大HP/装備数/スキル数で深さを足す(数値は私案・実機調整前提)。
export interface DdaPowerInputs {
  level: number;
  weaponTierSum: number; // 所持武器の tier 合計(T1=1..)。
  maxHealth: number;
  equippedCount: number; // 装備している部位数(0..3)。
  skillCount: number;    // 装備スキル数。
}

export const playerPower = (i: DdaPowerInputs): number =>
  i.level
  + i.weaponTierSum
  + Math.max(0, i.maxHealth / DDA_BASE_MAX_HP - 1) * 4
  + i.equippedCount * 1.5
  + i.skillCount * 1.0;

// その時刻に「順調なビルド」が持つはずの PP(私案の直線カーブ)。7分アークで再較正前提。
const DDA_EXPECTED_P0 = 4;        // 開始時の順調PP(Lv1+初期武器T1+固有スキル ≒ 4)
const DDA_EXPECTED_PER_MIN = 4.2; // 1分あたりの順調PP上昇(私案)
export const expectedPower = (gameTimeMs: number): number =>
  DDA_EXPECTED_P0 + DDA_EXPECTED_PER_MIN * (Math.max(0, gameTimeMs) / 60000);

// マージン M = 実PP / 順調PP。極端値をクランプ。
export const powerMargin = (i: DdaPowerInputs, gameTimeMs: number): number => {
  const m = playerPower(i) / Math.max(0.001, expectedPower(gameTimeMs));
  return Math.max(0.5, Math.min(3, m));
};

// escalation(0..1): M が閾値(デッドバンド)を超えた分だけ指数で立ち上げ、関所(gate)で強め・
// 余裕(buildup)は弱め(=余裕でも難易度差はつくが常時ギリギリにはしない)。
const DDA_MARGIN_DEADBAND = 1.1; // M がこれ以下(=順調/未育成)なら escalation=0(floor 据え置き)
const DDA_ESC_K = 1.4;           // 立ち上がりの鋭さ
const DDA_ESC_GATE = 1.0;        // 関所は全開
const DDA_ESC_BUILDUP = 0.5;     // 余裕は半分(難易度差はつけるが余裕は保つ)
export const escalation01 = (margin: number, atGate: boolean): number => {
  const over = Math.max(0, margin - DDA_MARGIN_DEADBAND);
  const raw = 1 - Math.exp(-over * DDA_ESC_K);
  return Math.max(0, Math.min(1, raw * (atGate ? DDA_ESC_GATE : DDA_ESC_BUILDUP)));
};

// 入口をまとめた便利関数。useGameLoop はこれ1つを呼んで escalation を得る。
export const spawnEscalation = (i: DdaPowerInputs, gameTimeMs: number, atGate: boolean): number =>
  escalation01(powerMargin(i, gameTimeMs), atGate);

// ── ステップ④: 関所ライブ補正 ─────────────────────────────────────────────
// 「常時ギリギリは関所だけ」。関所中のみ、プレイヤーのHP推移を目標カーブ(開始HP→終了HP帯)へ
// 閉ループで寄せる escalation の追加デルタを返す。楽勝(HP高すぎ)なら足す=主、苦しい(低すぎ)なら
// 緩める=弱め＋下限あり(=関所は必ず脅威で、緩めても floor までは残す=死のスパイラル防止)。
// 余裕(buildup)では呼ばない(補正なし)。純関数=テスト可能。
export const GATE_TARGET_END_HP = 0.28; // 関所終了時の目標HP割合(~20-35%の中央・私案)
const GATE_PRESS_GAIN = 1.2;  // 楽勝側(HPが目標より高い)の感度=足す
const GATE_EASE_GAIN = 0.6;   // 苦しい側(低い)の感度=緩める(弱め=ゴム紐感対策)
const GATE_PRESS_MAX = 0.6;   // 足せる escalation の上限
const GATE_EASE_MIN = -0.4;   // 緩められる下限(これ以上は緩めない)
export const gateLiveCorrection = (actualHpFrac: number, startHpFrac: number, progress: number): number => {
  const p = Math.max(0, Math.min(1, progress));
  // 開始HPから目標終了HPへ直線で降ろした「今の目標HP」。
  const targetFrac = startHpFrac + (GATE_TARGET_END_HP - startHpFrac) * p;
  const dev = actualHpFrac - targetFrac; // >0=目標より余裕(HP多い) / <0=苦しい(少ない)
  const raw = dev > 0 ? dev * GATE_PRESS_GAIN : dev * GATE_EASE_GAIN;
  return Math.max(GATE_EASE_MIN, Math.min(GATE_PRESS_MAX, raw));
};
