// PACING_REDESIGN.md バッチ6: ステージ難易度指数。
// ステージごとに1本の攻撃性スカラー stageAggro(0..1)を持たせ、「いやらしくない」側のノブ
// (pressure上げτ/退屈発動/関所maxRungクランプ)へ効かせる。ステージ2(研究所/lab)は完全対象外
// (呼び出し側が labTheme で既にpressure/退屈/gateProgramを丸ごと無効化しているため、ここでは
// 値を返しても実質未使用)。数値はすべて社長承認の叩き台=実機調整前提。
//
// レンダラ非依存の純関数=ヘッドレスでユニットテスト可能(src/utils)。

// 明示表(社長承認): stage-1(森)=初心者 / stage-3(廃都)=初心者+ / stage-4(雪原)=初心者〜中級 /
// stage-5(軍本部)=中級 / stage-6(洋館)=中級+(ストーリー上の想定クリア難度の上限の目安)。
// stage-7/EXは表に無い(仕様は「ステージ2以外」としか言っていない)。stage-6が「上限の目安」と
// 明記されているため、実装判断としてstage-6以降(終盤/クリア後コンテンツ)は同じ上限(1.0)を継続
// させる(緩める理由が無い・終盤で急に易化するのは不自然)。未選択/フリー/ベンチ/ステージ2は
// 中立値0.5(=バッチ6導入前の固定値と完全一致するno-op)。
const STAGE_AGGRO: Record<string, number> = {
  'stage-1': 0.0,
  'stage-3': 0.35,
  'stage-4': 0.6,
  'stage-5': 0.8,
  'stage-6': 1.0,
  'stage-7': 1.0,
  'stage-ex1': 1.0,
  'stage-ex2': 1.0,
};

export const STAGE_AGGRO_DEFAULT = 0.5;

export const stageAggroFor = (stageId: string | undefined | null): number =>
  (stageId && STAGE_AGGRO[stageId] !== undefined) ? STAGE_AGGRO[stageId] : STAGE_AGGRO_DEFAULT;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

// pressureの上げ時定数(旧「ラダーの上げ待ち時間」に相当)。
// 【裁定済みv0.26.6・PACING_V2.md】: PACING_V2.mdバッチR1-Eのτ短縮(8s→5s)が
// stageAggro経由の実プレイに反映されていなかった問題を受け、中立点(aggro=0.5)を5sへ再較正
// (スプレッドは従来どおり±2s: aggro=0→7s / aggro=1→3s)。
export const riseTauSForAggro = (aggro: number): number => 7 - 4 * clamp01(aggro);

// 退屈発動までの時間(ms)。stageAggro=0.5で既定の25000msに一致。
export const boredStartMsForAggro = (aggro: number): number => (30 - 10 * clamp01(aggro)) * 1000;

// 関所のmaxRungクランプ(scriptMaxRung側と両方のminを取るのは呼び出し側の責務)。
export const gateMaxRungClampForAggro = (aggro: number): number => 3 + Math.round(4 * clamp01(aggro));
