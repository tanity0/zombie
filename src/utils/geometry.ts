// PACING_PUZZLE.md §6.38 B2b: distToSegment(点-線分距離)をlevelUpGate.tsから抽出した純関数レイヤ。
// 抽出理由(社長指摘2026-08-14「写し定数はGIANT_STOMP_RADIUS_MIRRORが反面教師。実定数をexportして
// 同一ソースをimportすること」): levelUpGate.tsが賞金首(bounty-balance/bounty-maiko)の技を拾うには
// bountyTick.tsの実定数(半径/半太さ)をimportする必要があるが、bountyTick.tsは(薙ぎ払いの帯判定に)
// distToSegmentをlevelUpGate.tsからimportしており、そのままでは循環importになる。
// distToSegmentをこの依存ゼロのモジュールへ切り出すことで、bountyTick.tsはここから直接importし
// (levelUpGate.ts経由をやめる)、levelUpGate.tsはbountyTick.tsを安全にimportできるようになる
// (=写し定数を作らずに済む。levelUpGate.tsは後方互換のためdistToSegmentを再exportする)。
// 挙動は無改変(式そのものの移動のみ)。
interface Point { x: number; y: number }

// combatTick.ts(M51: 薙ぎ払いのカプセル判定)ほか複数ファイルから使うため export。
export const distToSegment = (p: Point, a: Point, b: Point): number => {
  const abx = b.x - a.x, aby = b.y - a.y;
  const abLenSq = abx * abx + aby * aby;
  if (abLenSq < 1e-6) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / abLenSq));
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
};
