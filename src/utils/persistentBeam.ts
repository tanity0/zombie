// UNIQUE_WEAPONS.md §19-1: 「プレイヤー側の線分に沿った持続ダメージ」の共通土台。
// 金環(§19)・アイレーザー(rifle-t3-eyelaser)・氷槍ライフル(rifle-t2-icelance)の3つが同じ形
// (始点・終点・半幅・寿命・パルス間隔・1パルスダメージ)を持つ持続線分なので、この1本を共有する。
// 追尾の有無は「毎パルス終点(bx/by)を更新するか」の差だけ——この土台自身は追尾を知らない
// (呼び出し側が tickPersistentBeams を呼ぶ前に ax/ay/bx/by を書き換えれば追尾になる)。
//
// 依存: distToSegment(src/utils/geometry.ts・依存ゼロの純幾何)のみ。store/React/PixiJS 非依存
// =ヘッドレスでテスト可能(CLAUDE.md「配線ロジックは純関数に切り出してテスト」)。
import { distToSegment } from './geometry';

/** 持続線分1本。壁短縮(shortenSegmentAtWalls)は生成時に呼び出し側が済ませておく想定。 */
export interface PersistentBeam {
  id: string;
  ax: number; ay: number; // 始点(射出元)
  bx: number; by: number; // 終点(壁短縮済み。追尾する武器は呼び出し側が毎パルス更新する)
  halfWidth: number;      // 線の半幅
  createdAt: number;      // gameTime(ms)。寿命の起点
  durationMs: number;     // 寿命(ms)
  pulseMs: number;        // パルス間隔(ms)=同一敵への再ヒット間隔
  damage: number;         // 1パルスダメージ
  nextPulseAt: number;    // 次パルスの gameTime(ms)。生成直後に即1発目を出すなら createdAt と同値にする
}

export interface PersistentBeamTickResult<T extends PersistentBeam = PersistentBeam> {
  /** 寿命内で生存する線分(パルスが出た分は nextPulseAt を進めた新しいオブジェクト)。 */
  beams: T[];
  /** このtickでパルスが発火した線分(発火時点の a/b/halfWidth/damage のスナップショット)。 */
  pulses: T[];
}

/**
 * 1フレーム分の寿命/パルス判定(副作用なし)。
 * - 寿命切れ(gameTime >= createdAt + durationMs)は `beams` から落とす(呼び出し側が
 *   フェード開始等の後始末をする。この関数はダメージの発生源だけを扱う)。
 * - gameTime >= nextPulseAt の線分は `pulses` へ積み、nextPulseAt を pulseMs ぶん進めて生存させる。
 * ジェネリック(T extends PersistentBeam)なのは氷槍ライフルの床(A-1是正・IceLanceFloor=
 * PersistentBeam+projectileId/frozen)のような拡張フィールド付きの型を素通しするため
 * (呼び出し側でキャストを書かせない)。
 */
export const tickPersistentBeams = <T extends PersistentBeam>(
  beams: readonly T[], gameTime: number,
): PersistentBeamTickResult<T> => {
  if (beams.length === 0) return { beams: [], pulses: [] };
  const survivors: T[] = [];
  const pulses: T[] = [];
  for (const beam of beams) {
    if (gameTime >= beam.createdAt + beam.durationMs) continue; // 寿命切れ
    if (gameTime >= beam.nextPulseAt) {
      pulses.push(beam);
      survivors.push({ ...beam, nextPulseAt: beam.nextPulseAt + beam.pulseMs });
    } else {
      survivors.push(beam);
    }
  }
  return { beams: survivors, pulses };
};

export interface BeamHittableEnemy { id: string; x: number; y: number; width: number; height: number }

/**
 * パルスごとに `distToSegment` で敵を拾う唯一の関数(UNIQUE_WEAPONS.md §19-2b 判定式)。
 * `distToSegment(敵中心, a, b) <= halfWidth + max(w,h)/2`。
 * ★敵中心だけに halfWidth を当てると当たり帯が細くなりすぎる(社長仕様「別の敵が射線へ入れば
 * 当たる」が実質起きない)ため、敵の当たり判定の概算半径(max(w,h)/2)を必ず足す。
 */
export const pickBeamHits = <T extends BeamHittableEnemy>(
  ax: number, ay: number, bx: number, by: number, halfWidth: number, enemies: readonly T[],
): T[] => enemies.filter(e => {
  const cx = e.x + e.width / 2;
  const cy = e.y + e.height / 2;
  const r = Math.max(e.width, e.height) / 2;
  return distToSegment({ x: cx, y: cy }, { x: ax, y: ay }, { x: bx, y: by }) <= halfWidth + r;
});
