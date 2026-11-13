// パイルドライバーの杭が刺さった記録(描画が読むだけ・判定には使わない・store に置かない描画の窓口)。
// 至近の敵には弾が作られたその tick で当たって消えるので、描画は弾を1度も見られない=杭が出ない。
// その時でも杭を出せるよう、刺さった弾の id・先端・向きを短く残す(書くのは utils/piledriverImpactFx、読むのは pixi/pileDriverFx)。
// newGunsTick の getNewGunsView と同じ流儀。最大 PILE_HIT_LOG_MAX 件(古い順に捨てる)。
// miss=true: 刺さらずに射程の端で消えた(store が射程で消した弾・社長裁定2026-11-13)。描画は空振りの伸び切りにする。
export interface PileHitNote { id: string; x: number; y: number; dirX: number; dirY: number; at: number; miss?: true }
const PILE_HIT_LOG_MAX = 8;
const pileHitLog: PileHitNote[] = [];
export const notePileHit = (n: PileHitNote): void => {
  pileHitLog.push(n);
  if (pileHitLog.length > PILE_HIT_LOG_MAX) pileHitLog.shift();
};
export const getPileHitLog = (): readonly PileHitNote[] => pileHitLog;
