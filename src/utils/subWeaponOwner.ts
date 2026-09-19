// BOT_AND_GHOST.md §2.8 G2.6: サブウェポンのオーナー抽象化。
// ルールは1行:「効果はオーナーに対して解決する」。発動の入口(座標・向き・バフ/回復の受け手)を
// この型で渡し、既定オーナー=プレイヤー(その場合、従来の挙動と完全に同一になるよう、facing は
// 「生の lastDirection(無ければ null)」のまま持つ=各サブ固有のフォールバック({x:1,y:0}や{x:0,y:1})は
// 呼び出し側が従来どおり適用する)。ゴースト(summons の kind='ghost-ally')は自分をオーナーとして渡す。
// 純関数(store/React/PixiJS非依存)=ヘッドレスでテスト可能。
//
// この型は座標/向き/受け手の解決だけを担い、CD・資源の帳簿そのものは持たない。
// ※旧「1つの財布」(オーナーが誰でもCDはplayer.subWeaponCooldowns 1本を共有)は §2.11追補
//   (社長裁定2026-07-31「守護霊=独立した2人目のプレイヤー」)で**廃止**。帳簿は主語ごと
//   (プレイヤー=player.subWeaponCooldowns / 守護霊=Summon.ghostSubWeaponCooldowns)。
//   宛先の決定は ownerGhostId(下)を使う。

export interface SubWeaponOwner {
  // ★research/SAME_ARENA.md O-3: 幻影(`guardian-phantom`)を主語に加える。守護霊との決定的な違いは
  // **狙う相手がプレイヤー**であること=効果を敵対側(`hostile`)で撒く必要がある(下の isHostileOwner)。
  kind: 'player' | 'ghost-ally' | 'phantom';
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

/**
 * ★SAME_ARENA O-3: 幻影(敵シャーシ)をオーナーとして渡す。
 * `summonId` は幻影の enemy.id を載せる(CD帳簿の宛先解決=`setActorSubWeaponCooldown` が
 * 守護霊で見つからなければ幻影として書く、という既存の分岐にそのまま乗る)。
 */
export const phantomAsOwner = (
  phantom: OwnerBodyLike & { id: string },
  facing: { x: number; y: number } | null = null,
): SubWeaponOwner => ({
  kind: 'phantom',
  x: phantom.x,
  y: phantom.y,
  width: phantom.width,
  height: phantom.height,
  facing,
  summonId: phantom.id,
});

/** 効果を敵対側(プレイヤーを狙う)で撒く主語か。幻影だけ true。 */
export const isHostileOwner = (o: SubWeaponOwner): boolean => o.kind === 'phantom';

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

/**
 * オーナーの「主語ID」。プレイヤー=undefined(既定の主語)、守護霊=その summon.id。
 * combatActorPlayer / setActorDashState / setActorSubWeaponCooldown へ渡す ghostId と同じ意味
 * (§2.11追補 v0.25.2541: 状態は主語ごと=CD帳簿・分身・地雷チャージの宛先を決める1本)。
 */
// ★SAME_ARENA O-3: 名前は `ownerGhostId` のままだが、**CD帳簿の宛先id**を返す関数。
// 幻影も自前の帳簿を持つ(`Enemy.phantomSubWeaponCooldowns`)ので、幻影のidも返す
// (`setActorSubWeaponCooldown` が「守護霊で見つからなければ幻影」の順で宛先を解決する)。
export const ownerGhostId = (o: SubWeaponOwner): string | undefined =>
  (o.kind === 'ghost-ally' || o.kind === 'phantom') ? (o.summonId ?? undefined) : undefined;

export const ownerCenterX = (o: OwnerBodyLike): number => o.x + o.width / 2;
export const ownerCenterY = (o: OwnerBodyLike): number => o.y + o.height / 2;
/** 足元(設置物の footY 用)。 */
export const ownerFootY = (o: OwnerBodyLike): number => o.y + o.height;

// ---- 照準の合流点(v0.25.2472・社長指示「狙い先はゴーストの紐付きボス」) --------------------------
// 狙いを持つサブ(heavy-grenade/fire-knife)のターゲット選択。
// ・オーナー=ゴースト かつ 紐付きボス(ghostBossId)が生きている → そのボス(G2.6の1行ルール
//   「効果はオーナーに対して解決する」の照準版)。
// ・それ以外(プレイヤー/ボス不在の瞬間)→ 従来どおり「オーナーに最も近い非リーパー敵」
//   (filter→map→sort→[0] を従来コードと同一手順で再現=プレイヤー起因の挙動は1bitも変わらない)。
export interface SubAimEnemyLike {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: string;
  reaperChaser?: boolean;
}

export const pickSubAimTarget = <E extends SubAimEnemyLike>(
  owner: SubWeaponOwner,
  ghostBossId: string | undefined,
  enemies: readonly E[],
): E | undefined => {
  if (owner.kind === 'ghost-ally' && ghostBossId) {
    const boss = enemies.find(e => e.id === ghostBossId);
    if (boss) return boss;
  }
  const cx = ownerCenterX(owner);
  const cy = ownerCenterY(owner);
  return enemies
    .filter(e => e.type !== 'reaper' || e.reaperChaser)
    .map(e => ({ e, dist: Math.hypot(e.x + e.width / 2 - cx, e.y + e.height / 2 - cy) }))
    .sort((a, b) => a.dist - b.dist)[0]?.e;
};
