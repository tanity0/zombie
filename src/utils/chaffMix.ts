// PACING_REDESIGN.mdバッチ3.5-A: チャフ配合(役割ベースのスポーン)。
// チャフ3種の役割(社長定義): bat=爽快(気持ちよさ・スピード感) / skeleton=刻み(中間・軽い緩急) /
// zombie=壁(防衛配置・クリティカル前提の固さ・経験値稼ぎに不向き)。役割をAIが持ち、狙って配合して
// 湧かせる(現状はエリア重み×featured乗算の成り行き任せだった欠落を埋める)。
// 挙動への実際の適用は enemyUtils.ts の selectEnemyType 側(重みの再配分)で行う。ここは比率計算のみの純関数。
export interface ChaffMix {
  bat: number;
  skeleton: number;
  zombie: number;
}

export const normalizeChaffMix = (mix: ChaffMix): ChaffMix => {
  const total = mix.bat + mix.skeleton + mix.zombie;
  if (total <= 0) return { bat: 1, skeleton: 0, zombie: 0 };
  return { bat: mix.bat / total, skeleton: mix.skeleton / total, zombie: mix.zombie / total };
};

// 「爽快寄り変形」: シーン本来のmixよりbat比率を底上げ・zombie比率を削った変形版。関所へ入った
// 直後(pressure=0)は「まず走らせる」ため、これを使う(社長指示「入りはバット多めで走らせ」)。
// 具体的な倍率は仕様に数値指定が無いため妥当な値を採用(実機調整前提)。
const EXCITED_BAT_BOOST = 1.6;
const EXCITED_ZOMBIE_CUT = 0.4;
export const excitedChaffMix = (mix: ChaffMix): ChaffMix =>
  normalizeChaffMix({ bat: mix.bat * EXCITED_BAT_BOOST, skeleton: mix.skeleton, zombie: mix.zombie * EXCITED_ZOMBIE_CUT });

// 関所内は gatePressure で「爽快寄り変形」→「シーン本来のmix」へ連続シフトする
// (社長指示: 「捌けているほど骨→壁へ」=テンポに続く第二の連続レバー)。
// pressure=null(緩フェーズ・関所外)はシーンmixをそのまま使う。
export const pickChaffMix = (sceneMix: ChaffMix, pressure: number | null): ChaffMix => {
  const base = normalizeChaffMix(sceneMix);
  if (pressure == null) return base;
  const p = Math.max(0, Math.min(1, pressure));
  const excited = excitedChaffMix(sceneMix);
  return {
    bat: excited.bat + (base.bat - excited.bat) * p,
    skeleton: excited.skeleton + (base.skeleton - excited.skeleton) * p,
    zombie: excited.zombie + (base.zombie - excited.zombie) * p,
  };
};
