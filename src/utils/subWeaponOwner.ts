// BOT_AND_GHOST.md §2.8 G2.6: サブウェポンのオーナー抽象化。
// ルールは1行:「効果はオーナーに対して解決する」。発動の入口(座標・向き・バフ/回復の受け手)を
// この型で渡し、既定オーナー=プレイヤー(その場合、従来の挙動と完全に同一になるよう、facing は
// 「生の lastDirection(無ければ null)」のまま持つ=各サブ固有のフォールバック({x:1,y:0}や{x:0,y:1})は
// 呼び出し側が従来どおり適用する)。ゴースト(summons の kind='ghost-ally')は自分をオーナーとして渡す。
// 純関数(store/React/PixiJS非依存)=ヘッドレスでテスト可能。
//
// 「1つの財布」原則: オーナーが誰でも CD は既存の1本(player.subWeaponCooldowns)を共有する。
// この型は座標/向き/受け手の解決だけを担い、CD・資源の帳簿には関与しない。

export interface SubWeaponOwner {
  kind: 'player' | 'ghost-ally';
  /** 当たり判定 左上x/y と寸法(プレイヤー/ゴースト本体と同じ形)。 */
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * 向き。プレイヤーは「生の lastDirection(未設定なら null)」= 各サブ固有のフォールバックを
   * 呼び出し側で従来どおり適用するため、ここでは既定値を潰さない。ゴーストは常に水平向き。
   */
  facing: { x: number; y: number } | null;
  /** バフ/回復の受け手の識別。ゴーストの時のみ summon.id、プレイヤーは null。 */
  summonId: string | null;
}

export interface OwnerBodyLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 既定オーナー=プレイヤー。facing は生の lastDirection(無ければ null)。 */
export const playerAsOwner = (
  player: OwnerBodyLike & { lastDirection?: { x: number; y: number } | null },
): SubWeaponOwner => ({
  kind: 'player',
  x: player.x,
  y: player.y,
  width: player.width,
  height: player.height,
  facing: player.lastDirection ?? null,
  summonId: null,
});

/** ゴースト(kind='ghost-ally')をオーナーとして渡す。facing はゴーストの水平向き(1|-1)。 */
export const ghostAsOwner = (
  ghost: OwnerBodyLike & { id: string; ghostFacing?: 1 | -1 },
): SubWeaponOwner => ({
  kind: 'ghost-ally',
  x: ghost.x,
  y: ghost.y,
  width: ghost.width,
  height: ghost.height,
  facing: { x: ghost.ghostFacing ?? 1, y: 0 },
  summonId: ghost.id,
});

export const ownerCenterX = (o: OwnerBodyLike): number => o.x + o.width / 2;
export const ownerCenterY = (o: OwnerBodyLike): number => o.y + o.height / 2;
/** 足元(設置物の footY 用)。 */
export const ownerFootY = (o: OwnerBodyLike): number => o.y + o.height;
