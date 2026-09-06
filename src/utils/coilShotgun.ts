// UNIQUE_WEAPONS.md §16-2(バッチC-2「コイルショットガン」shotgun-t2-coil)。
// 「散弾が一度外へ広がってから狙点へ再収束する」を、弾1発ごとの角度オフセット(rad)として表す
// 純関数。gameStore.ts の弾移動tickが毎フレーム呼ぶ(判定・見た目どちらにも影響する=移動そのもの)。
//
// 仕様の数字(0〜180ms=外へ+0.5rad / 180〜420ms=狙点へ収束)をそのまま、CLAUDE.md「動きの絶対
// ルール: 慣性」に従って**加減速つき(smoothstep)**で結ぶ。等速で角度が動いたり、180ms/420msの
// 境界で速度が飛ぶ(角速度が不連続に見える)動きは作らない。
//
// ★実装者の裁量(仕様に無いので決めた点・UNIQUE_WEAPONS.md §16-2は角度の数字だけを与えている):
// 「外へ広がる」は各ペレット固有の拡散角(computeShotDirectionsが計算する、狙点=baseDirからの
// オフセット。中心弾は0)を**増幅**する形で表す(外側のペレットほど大きく振れる符号=sign(baseAngle)
// 方向にさらに0.5rad足す)。「狙点へ収束」はその増幅ぶんが0へ戻ること(=元のペレット拡散角へ戻る。
// 狙点=中心線そのものへ全弾を集約するわけではない——中心弾以外は最初から狙点をわずかに外して
// 展開しているので、「戻る」は「その本来の拡散角へ戻る」という意味)。中心弾(baseAngleRad===0)は
// sign=0なので常にオフセット0=元から直進のまま(広がりようがない)。
export const COIL_OUT_PHASE_MS = 180;
export const COIL_CONVERGE_PHASE_MS = 240; // 180〜420ms
export const COIL_TOTAL_PHASE_MS = COIL_OUT_PHASE_MS + COIL_CONVERGE_PHASE_MS; // 420ms
export const COIL_OUT_RAD = 0.5;

/** 0..1のsmoothstep(慣性=加速→減速。他の純関数群と同じ式・CLAUDE.md「動きの絶対ルール」)。 */
const smoothstep01 = (t: number): number => {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
};

/**
 * 経過時間(elapsedMs・弾のcreatedAtからの経過=Date.now基準。呼び出し側=gameStore.tsの
 * updateProjectilesが同じ基準(currentTime - p.createdAt)で渡す)ぶんの軌道オフセット(rad)。
 * baseAngleRad=このペレット固有の拡散角(computeShotDirectionsが返した値。中心=0)。
 * 戻り値をbaseAngleRadへ足した角度で飛ばす(gameStore.ts側の役目)。
 */
export const coilTrajectoryOffsetRad = (baseAngleRad: number, elapsedMs: number): number => {
  const sign = Math.sign(baseAngleRad);
  if (sign === 0 || elapsedMs <= 0) return 0;
  if (elapsedMs < COIL_OUT_PHASE_MS) {
    return sign * COIL_OUT_RAD * smoothstep01(elapsedMs / COIL_OUT_PHASE_MS);
  }
  if (elapsedMs < COIL_TOTAL_PHASE_MS) {
    const t = (elapsedMs - COIL_OUT_PHASE_MS) / COIL_CONVERGE_PHASE_MS;
    return sign * COIL_OUT_RAD * (1 - smoothstep01(t));
  }
  return 0;
};
