// ダンスビートB方式(社長決定 v0.25.1339・仕様はHANDOFF_DANCE_AUDIO.md末尾)。
// 曲↔サークル同期を諦め、「拍の真実=リングのスケジュール」からメトロノームの次の1拍だけを
// 先読み予約する純関数。判定(JUST窓)・リング描画・ビート音がすべて同じグリッド
// (rhythm.firstBeatAt/rhythm.interval・Date.now基準)から出るので、原理的にズレない。
//
// 毎フレーム呼び、窓(nowMs, nowMs+windowMs]内に入った未予約の拍が1つでもあればそれだけを返す。
// 呼び出し側はshouldSchedule時にbeatIndexをlastScheduledIndexとして次回へ渡すことで二重予約を防ぐ。

export interface NextBeatInput {
  nowMs: number;              // 現在時刻(Date.now基準。リングと同じ時計)
  firstBeatAtMs: number;      // 拍index 0 の時刻(rhythm.firstBeatAt)
  intervalMs: number;         // 拍間隔(rhythm.interval)
  lastScheduledIndex: number; // 直近に予約済みの拍index(-1=まだ無し)
  windowMs: number;           // 先読み窓(ms)。この時間内に来る拍だけ予約する
}

export interface NextBeatResult {
  shouldSchedule: boolean;
  beatIndex: number;  // 次に予約すべき(あるいは既に予約済みの)拍index
  beatAtMs: number;   // その拍の時刻(Date.now基準。ctx時刻への変換は呼び出し側)
}

export const nextBeatToSchedule = (input: NextBeatInput): NextBeatResult => {
  const { nowMs, firstBeatAtMs, intervalMs, lastScheduledIndex, windowMs } = input;
  if (intervalMs <= 0) return { shouldSchedule: false, beatIndex: lastScheduledIndex, beatAtMs: 0 };
  // 「まだ予約していない最初の拍」= lastScheduledIndex+1 以上。ただし大きく取りこぼした場合
  // (タブが非アクティブ化された等)は「今に一番近い(=直前に過ぎた)拍」まで追いつく(floor)。
  // 拍index0より前は鳴らさない(リードイン中はまだ実際のビートが無い)。
  const catchUpIndex = Math.max(0, Math.floor((nowMs - firstBeatAtMs) / intervalMs));
  const beatIndex = Math.max(lastScheduledIndex + 1, catchUpIndex);
  const beatAtMs = firstBeatAtMs + beatIndex * intervalMs;
  const shouldSchedule = beatAtMs - nowMs <= windowMs;
  return { shouldSchedule, beatIndex, beatAtMs };
};
