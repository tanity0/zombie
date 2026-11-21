// ★今回の出撃で歩いた道(research/THEONE_ROUND2.md §2-6・社長 2026-10-17「入れてみようか」)。
// 一時停止の地図に「スタート地点からここまで歩いてきた道」を線で描くための記録。
// 出撃中にゲーム時間 1.5秒ごとに自分の中心を1点ずつ記録する。素早い移動(瞬間移動)の所では線を切る。
// 記録はこのモジュールの中だけ(store へは書かない=毎ティック呼んでも購読者を起こさない)。出撃ごとに resetRunRoute で空にする。
// **端末には保存しない・ゲームの判定には一切使わない**(絵のための記録)。

export const ROUTE_SAMPLE_MS = 1500;   // ゲーム時間でこの間隔ごとに1点
export const ROUTE_MIN_STEP_PX = 40;   // 前の点からこれ未満しか動いていなければ記録しない(立ち止まりで点を増やさない)
export const ROUTE_RAW_CAP = 2400;     // 1回の出撃で持つ点の上限(超えたら1つおきに間引いて続ける)
export const ROUTE_JUMP_PX = 1200;     // 1回の記録の間にこれ以上離れたら瞬間移動=線を切る(歩いていない直線を描かない)

export type Pt = [number, number];

let raw: Pt[] = [];
let rawBreaks: number[] = []; // raw の添字(その点から新しい線)
let lastAt = -Infinity;

export const resetRunRoute = (): void => { raw = []; rawBreaks = []; lastAt = -Infinity; };

/** 毎ティック呼んでよい。間隔と移動量の条件を満たした時だけ1点足す。足したら true。 */
export const recordRoutePoint = (gameTime: number, x: number, y: number): boolean => {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (raw.length > 0 && gameTime - lastAt < ROUTE_SAMPLE_MS) return false;
  const prev = raw[raw.length - 1];
  if (prev && Math.hypot(x - prev[0], y - prev[1]) < ROUTE_MIN_STEP_PX) { lastAt = gameTime; return false; }
  if (raw.length >= ROUTE_RAW_CAP) {
    // 切れ目の点は必ず残して1つおきに間引く(記録を止めると線の先が今の位置からずれる)。
    const keep = new Set(rawBreaks);
    const next: Pt[] = []; const nb: number[] = [];
    raw.forEach((p, i) => { if (i % 2 === 0 || keep.has(i)) { if (keep.has(i)) nb.push(next.length); next.push(p); } });
    raw = next; rawBreaks = nb;
  }
  if (prev && Math.hypot(x - prev[0], y - prev[1]) >= ROUTE_JUMP_PX) rawBreaks.push(raw.length);
  raw.push([x, y]);
  lastAt = gameTime;
  return true;
};

/** 今回の経路を線ごとに(瞬間移動の所で切れる)。一時停止の地図用の写し。 */
export const currentRoute = (): Pt[][] => {
  const out: Pt[][] = [];
  let from = 0;
  for (const c of rawBreaks) { if (c > from) out.push(raw.slice(from, c)); from = c; }
  if (from < raw.length) out.push(raw.slice(from));
  return out;
};
