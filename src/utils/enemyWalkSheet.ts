// ★敵の歩きモーション(社長支給2026-09-20「バット女の歩きモーション」)。
//
// ★何を決める葉か: **どのコマを出すか**だけ。判定・速度・AI・当たり判定は1msも触らない
// (CLAUDE.md「Visual vs. hitbox」)。アスペクト(=`enemyHitStrip` の元)も**登録しない**——
// 登録すると歩きシートの縦横比で当たり判定が動く(立ち絵 356×512 と歩き 180×260 は比が僅かに違う)。
//
// ★先例に揃える: プレイヤーの `playerWalkFrame`(pixiScene)と同じ形
//   「歩いていなければ0コマ目 / 歩いていれば周期で送る」。新しい作法を発明しない。
//
// ★1つだけ足したもの=**個体ごとの位相ずらし**。同じ型が並んだ時に全員が同じ足を出すと
//   行進に見える(CLAUDE.md「均質は"AIっぽさ"の筆頭」)。`keepSpin`/`spriteVariantIndex` と
//   同じく**IDから決まる固定値**なので、同じ個体は生涯ずっと同じ位相で歩く(ちらつかない)。
import { spriteVariantIndex } from './enemyVariant';

/**
 * 歩きシートを持つ立ち絵の表(立ち絵のテクスチャ名 → コマ数)。
 * シートのテクスチャ名は `<立ち絵名>-walk`(`walkSheetName`)。
 * ★素材を足す時はここへ1行。`pixiTextures` のロード登録も揃える(アスペクトは登録しない)。
 */
export const ENEMY_WALK_SHEETS: Readonly<Record<string, number>> = {
  // 社長支給2026-09-20。8コマ。実測で**前方ループ**(ピンポンではない):
  // 接地点が 72..147 → 104..175 → … → 192..243 と右へ流れ、5コマ目で反対の足が着き、
  // 7コマ目が0コマ目の直前へ戻る=0→7→0で繋がる。
  'bat-female': 8,
};

export const walkSheetName = (idleTexName: string): string => `${idleTexName}-walk`;

/** その立ち絵に歩きシートがあるか(無ければ従来どおり立ち絵1枚)。 */
export const walkSheetFrames = (idleTexName: string | null | undefined): number =>
  (idleTexName && ENEMY_WALK_SHEETS[idleTexName]) || 0;

/**
 * 歩きの1周期(ms)。プレイヤー(4コマ460ms / 5コマ900ms)の中間の密度に合わせた叩き台。
 * 8コマ × 90ms ≒ 11コマ/秒。`?enemywalkms=` で実機から詰める。
 */
export const ENEMY_WALK_CYCLE_MS_DEFAULT = 720;

/** 歩いていると見なす実効速度(px/s)。プレイヤーの幻影(GP_WALK_MIN_SPEED)と同じ考え方。 */
export const ENEMY_WALK_MIN_SPEED = 6;

/** 個体ごとの位相ずらし(0..1)。IDから決まる固定値=同じ個体は生涯同じ位相。 */
export const enemyWalkPhase = (id: string, frames: number): number =>
  frames > 1 ? spriteVariantIndex(`w:${id}`, frames) / frames : 0;

/**
 * 出すコマ。**歩いていなければ null**(=呼び手は従来どおり立ち絵を出す)。
 * @param speed  平滑済みの実効速度(px/s)。`ActorView.motSpeed` と同じ値。
 */
export const enemyWalkFrame = (
  id: string, frames: number, nowMs: number, speed: number,
  cycleMs: number = ENEMY_WALK_CYCLE_MS_DEFAULT,
): number | null => {
  if (frames <= 1 || !(speed > ENEMY_WALK_MIN_SPEED)) return null;
  const cyc = Math.max(1, cycleMs);
  const t = (nowMs / cyc + enemyWalkPhase(id, frames)) % 1;
  const i = Math.floor(((t % 1) + 1) % 1 * frames);
  return Math.min(frames - 1, Math.max(0, i));
};
