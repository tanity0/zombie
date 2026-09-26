// PACING_PUZZLE.md §5.21 M20 軸2(制圧ゲート): デンジャー入場(r≥3000)時、拠点を1つも制圧していなければ
// 「凶悪ハンター」を優勢ゲート無視で即発生させる。既存ハンター(useGameLoop.ts)の状態機械に相乗りする
// ための判定/位置決め純関数(実装精度の規律4: 配線ロジックは純関数へ切り出す)。
export const VICIOUS_REARM_MS = 3000; // 撃破直後の一瞬の猶予(即座の入れ替わりを避ける・「優勢ゲート無視」とは別軸)

/** 開放状態に関係なく、いずれかの拠点内ならハンターに対する安全地帯とする。 */
export const isHunterSafeBaseNearby = (
  pcx: number,
  pcy: number,
  bases: readonly { x: number; y: number }[],
  safeRadius: number,
): boolean => bases.some(base => Math.hypot(pcx - base.x, pcy - base.y) <= safeRadius);

export interface ViciousHunterTriggerInput {
  gameTime: number;
  hunterStartMs: number;      // = useGameLoop.ts の HUNTER_START_MS(3分)。既存定数をそのまま渡す。
  spawnBlocked: boolean;      // ボス/演出/イベント中(既存のspawnBlockedをそのまま渡す)
  hunterIdle: boolean;        // H.phase === 'idle'
  playerAreaIdx: number;      // areaZoneIndexFor(プレイヤー距離)。デンジャー(=2)以深で対象。
  capturedBaseCount: number;  // 制圧済み拠点数
  viciousRearmAt: number;     // 直近の凶悪ハンター終了から VICIOUS_REARM_MS 後の gameTime(初期値0)
  gate1PassedThisRun: boolean; // 【ラン内スコープ】このランでゲート1(未確認境界)を通過したか。
                               // 社長決定v0.25.1668「通過できたら強制ハンターも発生しなくなる」＋
                               // v0.25.1669「拠点を解放していないエリアでは次ランで復活」=恒久解除ではなく毎ランリセット。
                               // 立つ瞬間: ①今ランでゲート1をクリア ②恒久クリア済みで境界(壁3)を通り抜けた時。
}

export const shouldTriggerViciousHunter = (input: ViciousHunterTriggerInput): boolean => {
  if (!input.hunterIdle || input.spawnBlocked) return false;
  // §5.21仕様「3分/優勢ゲートを無視して即発生」: 凶悪ハンターは3分フロア(hunterStartMs)を無視する
  // (デンジャーに30秒で入ったラッシャーへの罰が3分待ちで間に合わない不具合の修正・v0.25.1529)。
  // hunterStartMsは通常ハンター側の判定に呼び出し側が使う値=ここでは参照しない(互換のため引数は残す)。
  if (input.gameTime < input.viciousRearmAt) return false;
  if (input.playerAreaIdx < 2) return false; // デンジャー(r>=3000)未満は対象外
  if (input.gate1PassedThisRun) return false; // このランでゲート1通過済み=以後は出さない(次ランで復活・社長決定v0.25.1669)
  return input.capturedBaseCount === 0;
};

// 視界ギリギリの奥(≒視界範囲detectRange付近)にランダム角度で配置。
export const pickViciousSpawnPoint = (
  pcx: number, pcy: number, detectRange: number, rand: () => number = Math.random,
): { x: number; y: number } => {
  const ang = rand() * Math.PI * 2;
  return { x: pcx + Math.cos(ang) * detectRange, y: pcy + Math.sin(ang) * detectRange };
};
