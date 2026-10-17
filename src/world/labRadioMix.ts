// ステージ2(屋外ラボ廊下)専用: 通常BGM→オープニングの廊下BGM(op-corridor.mp3の流用)への
// クロスフェード混合比を求める純関数(renderer-agnostic)。
//
// 社長指示: 「ゴール資料と反対方面(=idolの居る方向)へ進むほど、中盤くらいに差し掛かったら
// BGMを距離に比例してクロスフェード」。設計チャットで確定した式(PACING_PUZZLE.md 参照):
//   L = |idol.x|                                  … 資料までの距離と同じ(=廊下の片道長)
//   d = max(0, sign(idol.x) * プレイヤー中心x)     … idol方向への進捗(資料側へ歩くとd=0のまま)
//   t = clamp01((d / L - 0.5) / 0.4)               … 進捗50%(中盤)で切り替わり始め、90%で完全に切り替わる
//
// idol の座標は gameStore の labRadioX(resetGame で1度だけ書く。倒されると消える敵オブジェクトの
// 座標は参照できないため、専用フィールドで持つ)。ステージ2以外/未配置は null=常に t=0。
export const labRadioMixT = (idolX: number | null, playerCenterX: number): number => {
  if (idolX == null) return 0;
  const L = Math.abs(idolX);
  if (!(L > 0)) return 0; // L=0の保護(0除算回避)。退化ケースは常にt=0(通常BGMのまま)。
  const sign = idolX > 0 ? 1 : -1;
  const d = Math.max(0, sign * playerCenterX);
  const raw = (d / L - 0.5) / 0.4;
  return Math.max(0, Math.min(1, raw));
};
