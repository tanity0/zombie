// 敵同士の「軽い押し合い」(社長指示v0.25.2320)。
//
// 背景: 実機で「一体を攻撃しているのに何度も 2 HITS と出る」という報告があり、録画のフレーム解析で
// **敵が2体ほぼ完全に重なっていた**ことが分かった。ヒット数の数え方は正しく(射程内の敵の数)、
// 「重なって1体に見える」ことが実体だったので、重なりそのものを減らす。
//
// 方針(社長指示「少し押し合う」):
// - **ハード衝突にはしない**。重なりの一部だけを毎フレーム緩やかに解消する「柔らかい分離」。
//   完全に押し出すと、群れが弾け飛んだり、狭所で振動したり、包囲の圧が消えてしまう。
// - **移動AIには一切触らない**。updateEnemies が位置を出し切った後の**後処理**として座標だけ微調整する
//   (追跡/突進/ジャンプの意図を壊さない=速度やターゲットは書き換えない)。
// - 押し出し量には**上限速度**を設ける。深く重なった時に大きく弾かないための保険。
//
// レンダラ非依存の純関数(src/utils)=ヘッドレスでユニットテスト可能。
import type { Enemy } from '../types/game';
import { isBossType, isHiddenBoss } from './enemyUtils';

/** 重なりのうち1フレームで解消する割合(0..1)。1=即座に分離、小さいほどぬるっと押し合う。 */
export const SEPARATION_RESOLVE_FRAC = 0.5;
/** 1体あたりの押し出し速度の上限(px/秒)。深く重なっても弾き飛ばさないための天井。 */
export const SEPARATION_MAX_SPEED = 90;
/**
 * 「重なっている」とみなす中心間距離の係数。互いの半径(幅の半分)の和 × この値より近ければ押し合う。
 * 1.0 だと肩が触れた瞬間から押し合ってしまい常時ゆらぐので、**深めに重なった時だけ**効かせる。
 */
export const SEPARATION_RADIUS_FRAC = 0.62;

/**
 * この敵は押し合いの対象外か。
 * - 裏ボス/ボス系(死神・ハンター含む): 専用コントローラや演出が座標を持つ。雑魚に押されて動くと破綻する。
 * - fixed: イベントが位置を持つ個体(M0のハンター配置など)。
 * - dormant: 索敵中で静止しているはずの個体。押すと「動かないはずのものが動く」。
 * - ノックバック中: 既に外力で飛んでいる。二重に力を掛けない(パニッシャーの連鎖判定とも干渉しない)。
 */
export const isSeparationExempt = (e: Enemy, nowMs: number): boolean =>
  isHiddenBoss(e.type) ||
  isBossType(e.type) ||
  e.fixed === true ||
  e.dormant === true ||
  (e.knockbackUntil !== undefined && nowMs < e.knockbackUntil);

/** 押し合いの結果ずらす量(px)。id -> {dx, dy}。ずれない個体は入らない。 */
export type SeparationOffsets = Map<string, { dx: number; dy: number }>;

/**
 * 敵同士の重なりを緩やかに解消するオフセットを求める。
 *
 * 対象ペアの中心間距離が `minDist = (halfA + halfB) * SEPARATION_RADIUS_FRAC` を下回っていたら、
 * その不足ぶん(overlap)の SEPARATION_RESOLVE_FRAC を**互いに半分ずつ**押し戻す。押し出し量は
 * `SEPARATION_MAX_SPEED * dtSec` で頭打ち。
 *
 * 完全に同一座標で重なった場合(距離0)は方向が定まらないので、id の順序から決まる**決定的な**向きへ
 * 逃がす(乱数を使わない=ヘッドレスでも再現する)。
 */
export const computeEnemySeparation = (
  enemies: readonly Enemy[],
  dtSec: number,
  nowMs: number,
): SeparationOffsets => {
  const out: SeparationOffsets = new Map();
  if (enemies.length < 2 || dtSec <= 0) return out;

  // 対象だけ抜き出して事前計算(中心・半径)。ボス等を毎ペア判定しないための下ごしらえ。
  const parts: { id: string; cx: number; cy: number; half: number }[] = [];
  for (const e of enemies) {
    if (isSeparationExempt(e, nowMs)) continue;
    parts.push({
      id: e.id,
      cx: e.x + e.width / 2,
      cy: e.y + e.height / 2,
      half: e.width / 2,
    });
  }
  if (parts.length < 2) return out;

  const maxPush = SEPARATION_MAX_SPEED * dtSec;
  // 蓄積用(1体が複数体に挟まれる場合は合算してから頭打ちにする)。
  const acc = new Map<string, { dx: number; dy: number }>();
  const add = (id: string, dx: number, dy: number) => {
    const cur = acc.get(id);
    if (cur) { cur.dx += dx; cur.dy += dy; } else { acc.set(id, { dx, dy }); }
  };

  for (let i = 0; i < parts.length; i++) {
    const a = parts[i];
    for (let j = i + 1; j < parts.length; j++) {
      const b = parts[j];
      const minDist = (a.half + b.half) * SEPARATION_RADIUS_FRAC;
      let dx = b.cx - a.cx;
      let dy = b.cy - a.cy;
      const d2 = dx * dx + dy * dy;
      // 平方で早期棄却(重なっていないペアでは sqrt を呼ばない)。
      if (d2 >= minDist * minDist) continue;
      let dist = Math.sqrt(d2);
      if (dist < 0.001) {
        // 完全同座標: id の大小で決まる決定的な向きへ(乱数なし=再現性のため)。
        const sign = a.id < b.id ? 1 : -1;
        dx = sign; dy = 0; dist = 1;
      }
      const overlap = minDist - dist;
      // 各自が overlap の半分 × 解消率ぶん、互いに逆向きへ動く。
      const push = (overlap * SEPARATION_RESOLVE_FRAC) / 2;
      const ux = dx / dist, uy = dy / dist;
      add(a.id, -ux * push, -uy * push);
      add(b.id, ux * push, uy * push);
    }
  }

  // 合算後に1体あたりの上限で頭打ち(挟まれても弾け飛ばない)。
  for (const [id, v] of acc) {
    const len = Math.hypot(v.dx, v.dy);
    if (len < 0.0001) continue;
    const k = len > maxPush ? maxPush / len : 1;
    out.set(id, { dx: v.dx * k, dy: v.dy * k });
  }
  return out;
};
