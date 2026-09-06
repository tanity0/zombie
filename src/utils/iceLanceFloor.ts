// UNIQUE_WEAPONS.md §16-2(バッチC-1「氷槍ライフル」rifle-t2-icelance)。弾の射線に短時間の床(線)を
// 残す(幅28px・1.2秒・200msごとに直撃の20%)。床そのものは src/utils/persistentBeam.ts の
// PersistentBeam(§19-1の共通土台)を拡張して使う。
// ここに置くのは「床の寸法」定数と「直撃ダメージ→床の1パルスダメージ」の変換(純関数)、および
// 検収監査A-1是正の「弾の後ろに伸びる床」を扱う純関数(tickIceLanceFloors)。
//
// ★武器自体に凍傷は持たせない(社長指定)。既存の炎床(molotov.ts)は流用しない
// (ダメージを与えず延焼を付けるだけ・判定は円・敵→プレイヤー向きで形が違う・落としやすい点)。
//
// ★検収監査A-1(2026-09-06)是正: 旧実装は発射の瞬間に「弾の最大飛翔距離」ぶんの床を
// 全長で作り、nextPulseAt=生成時刻としていたため、弾がまだ1px も飛んでいない同tickで
// 線上の全敵にダメージが入っていた(弾は passthrough で「倒せない敵」に止められるが、床は
// 弾の実際の到達より先まで即座に当たっていた=CLAUDE.md慣性MUST違反でもある)。
// 直し方(社長発注どおり):
//   - 床は「弾の後ろに伸びる」——projectileId で対応する弾を追跡し、弾が生きている間は
//     毎tick終点(bx/by)を弾の現在位置へ更新する(=伸びている間はダメージを出さない。
//     床のダメージは床が伸びた範囲にだけ入る=弾より先に当たらない)。
//   - 対応する弾が消えたら(命中/壁/寿命切れ——どれも呼び出し側のprojectiles配列から
//     消えるという1つの事実に収斂する。個別の消滅理由をここで分岐しない)、その時点の
//     bx/byで凍結し、そこから ICE_LANCE_FLOOR_DURATION_MS(1.2秒)の寿命を数え始める
//     (=「弾の射線」の素直な実装。弾が途中で消えれば床もそこまでしか伸びない)。
import { PersistentBeam, tickPersistentBeams } from './persistentBeam';

export const ICE_LANCE_FLOOR_HALFWIDTH = 14; // 幅28px÷2
export const ICE_LANCE_FLOOR_DURATION_MS = 1200;
export const ICE_LANCE_FLOOR_PULSE_MS = 200;
export const ICE_LANCE_FLOOR_DAMAGE_FRAC = 0.20;
// 伸びている間(未凍結)のpixiScene描画イーズが早くフェードアウトしないための placeholder。
// ゲーム上の意味を持つ値ではない(実際の1.2秒寿命はtickIceLanceFloorsが凍結時に設定する)。
// 弾の最大飛翔時間より確実に長ければよいので、余裕を持った定数。
const ICE_LANCE_GROWING_EASE_DURATION_MS = 5000;

/** 直撃ダメージ(発射時に確定したproj.damage)から床の1パルスダメージを導出する。最低1。 */
export const iceLanceFloorPulseDamage = (hitDamage: number): number =>
  Math.max(1, Math.round(hitDamage * ICE_LANCE_FLOOR_DAMAGE_FRAC));

/** 氷槍ライフルの床=PersistentBeam+「どの弾を追跡しているか/凍結済みか」。 */
export interface IceLanceFloor extends PersistentBeam {
  projectileId: string; // 追跡中の弾のid。凍結後は参照しない(残しておいても無害)
  frozen: boolean;       // false=まだ弾を追尾中(ダメージ無し)。true=凍結済み(tickPersistentBeamsの対象)
}

/** 発射直後、まだ何も伸びていない床を1つ作る(ax/ay=bx/by=発射点)。 */
export const createIceLanceFloor = (
  id: string, projectileId: string, originX: number, originY: number,
  halfWidth: number, pulseMs: number, damage: number, gameTime: number,
): IceLanceFloor => ({
  id, projectileId, frozen: false,
  ax: originX, ay: originY, bx: originX, by: originY,
  halfWidth,
  createdAt: gameTime, durationMs: ICE_LANCE_GROWING_EASE_DURATION_MS, pulseMs,
  damage, nextPulseAt: gameTime, // 未使用(凍結時に上書きされる。未凍結の間はtickPersistentBeamsを通らない)
});

export interface IceLanceProjectileLike { id: string; x: number; y: number; width: number; height: number }

export interface IceLanceFloorTickResult {
  floors: IceLanceFloor[];
  pulses: IceLanceFloor[];
  changed: boolean; // storeへ書き戻す価値がある変化があったか(呼び出し側の再描画/setState節約用)
}

/**
 * 1フレーム分の氷槍床tick(副作用なし・ヘッドレステスト可能)。
 * - 未凍結の床: `liveProjectiles` に対応するprojectileIdがまだ在れば、その現在位置へbx/byを
 *   追従させる(伸びる。ダメージは出さない)。無ければ(消えた=命中/壁/寿命切れ)、その時点の
 *   bx/byで凍結し、gameTimeを新しいcreatedAtとしてICE_LANCE_FLOOR_DURATION_MSの寿命を開始する
 *   (nextPulseAt=gameTime=凍結と同時に1発目。金環の「展開完了と同時に1発目」と同じ思想)。
 * - 凍結済みの床: 既存の共通土台(tickPersistentBeams)へそのまま委譲する。
 */
export const tickIceLanceFloors = (
  floors: readonly IceLanceFloor[],
  liveProjectiles: readonly IceLanceProjectileLike[],
  gameTime: number,
): IceLanceFloorTickResult => {
  const growing: IceLanceFloor[] = [];
  const alreadyFrozen: IceLanceFloor[] = [];
  let changed = false;
  for (const f of floors) {
    if (f.frozen) { alreadyFrozen.push(f); continue; }
    const p = liveProjectiles.find(pr => pr.id === f.projectileId);
    if (p) {
      const nbx = p.x + p.width / 2, nby = p.y + p.height / 2;
      if (nbx !== f.bx || nby !== f.by) changed = true;
      growing.push({ ...f, bx: nbx, by: nby });
    } else {
      changed = true;
      alreadyFrozen.push({
        ...f, frozen: true, createdAt: gameTime, durationMs: ICE_LANCE_FLOOR_DURATION_MS, nextPulseAt: gameTime,
      });
    }
  }
  const { beams: survFrozen, pulses } = tickPersistentBeams(alreadyFrozen, gameTime);
  if (pulses.length > 0) changed = true;
  if (survFrozen.length !== alreadyFrozen.length) changed = true; // 凍結直後の床が同tickで寿命切れになる(理論上の端数)ケースの保険
  return { floors: [...growing, ...survFrozen], pulses, changed };
};
