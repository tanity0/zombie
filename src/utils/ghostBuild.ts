// 守護霊(ゴースト)の「計測時ビルドで戦う」消費側(BOT_AND_GHOST.md §2.11 裁定1・GHOST-BUILD-1)。
// playerBuild.ts(純粋・記録側と共有)に武器の復元(createWeapon)を被せ、ゴーストの攻撃計算が使う
// 1組の道具にまとめる:
//   - gun / melee = **スナップショットのロードアウト**(旧プロファイル=欠損時のみ召喚時のプレイヤー装備を借用)
//   - player      = 既存のプレイヤー用純関数(skillCritMult/skillOutgoingDamageMult/sniperGunMult/…)へ
//                   そのまま渡せる疑似Player(=式を複製しないための共通化の要)
//   - phillHeadshotRate = 裁定4(PHILLのヘッドショット率の再現)
//
// 掟: このモジュールは**判定も乱数も持たない**(純粋な組み立てのみ)。ビルドは召喚1体につき不変なので
// summon.id で1件だけメモ化する(毎フレーム/毎着弾のcreateWeaponを避ける=負荷1/10)。
import type { Player, PlayerBuildSnapshot, Summon, Weapon } from '../types/game';
import { createWeapon, allyFallbackWeapon } from './weaponUtils';
import { buildHasLoadout, buildPseudoPlayer } from './playerBuild';
import { withoutBlood } from './bloodAwaken';
import { isMasteryRunIgnored } from './masteryRun'; // 熟練度: 無視する出撃では守護霊の倍率も1(依存の無い葉)

export interface GhostBuild {
  /** スナップショットに武器ロードアウトが入っていたか(false=旧プロファイル→今の装備借用のフォールバック)。 */
  fromSnapshot: boolean;
  /** ゴーストが撃つ銃(スナップショットのアクティブ銃)。 */
  gun?: Weapon;
  /** ゴーストが振る近接武器。 */
  melee?: Weapon;
  /** 裁定4: この確率でヘッドショット(確定クリ)として撃つ。未記録なら0。 */
  phillHeadshotRate: number;
  /** 倍率評価用の疑似Player(位置/HPは ghostActorPlayer で実体の値へ差し替えて使う)。 */
  player: Player;
}

/**
 * スナップショット(欠損可)+召喚時の本人から、ゴーストのビルドを1組組み立てる(純関数)。
 * `opts.guardian`: 守護霊(味方)なら true=記録した時点の熟練度を疑似Playerに持たせる。幻影(敵)は省く=熟練度なし。
 */
export const resolveGhostBuild = (
  snap: PlayerBuildSnapshot | undefined, live: Player, opts?: { guardian?: boolean },
): GhostBuild => {
  // B10 血の覚醒: 本人の血・覚醒を守護霊の疑似Playerに乗せない(旧プロファイル=snap無しは live をそのまま返すので、ここでも落とす)。
  // pseudoActor: 本人ではない主語の印(スキル発動の表示を本人の分だけに出す・gameStore.notifySkillProcFor)。
  const pseudo: Player = { ...withoutBlood(buildPseudoPlayer(snap, live, { guardian: opts?.guardian === true })), pseudoActor: true };
  if (!buildHasLoadout(snap) || snap === undefined) {
    // 旧プロファイル(ロードアウト未記録)=従来どおり召喚時のプレイヤーの現在装備を借用する。
    const guns = live.weapons.filter(w => !w.isMelee);
    const liveGun = guns.find(w => w.id === live.activeWeaponId) ?? guns[0];
    return {
      fromSnapshot: false,
      // research/NEW_GUNS.md: 新しい3挺は代わりの標準の銃で撃つ(守護霊・幻影の両方がここを通る)。
      gun: liveGun ? allyFallbackWeapon(liveGun) : liveGun,
      melee: live.weapons.find(w => w.isMelee),
      phillHeadshotRate: 0,
      // ★品質監査#7: 守護霊は player.weapons から id で銃を引き直す(useGameLoop の ghostWeapons)。代わりの銃は id を
      // 実体のまま持つので、ここも差し替えておかないと id 照合で元の銃(撃たない)へ戻ってしまう。
      player: { ...pseudo, weapons: pseudo.weapons.map(w => (w.isMelee ? w : allyFallbackWeapon(w))) },
    };
  }
  // research/NEW_GUNS.md: 新しい3挺は代わりの標準の銃で組み立てる(守護霊・幻影)。
  const gunKeys = snap.gunKeys ?? [];
  const guns = gunKeys.map(k => allyFallbackWeapon(createWeapon(k)));
  // 差し替えた銃は key が変わるので、アクティブ銃は「元のキーの位置」で引く。
  const activeIdx = gunKeys.indexOf(snap.activeGunKey ?? '');
  const gun = (activeIdx >= 0 ? guns[activeIdx] : undefined) ?? guns[0];
  const melee = snap.meleeKey ? createWeapon(snap.meleeKey) : undefined;
  return {
    fromSnapshot: true,
    gun,
    melee,
    phillHeadshotRate: Math.max(0, Math.min(1, snap.phillHeadshotRate ?? 0)),
    // 疑似Playerの武器スロットもスナップショットのロードアウトに揃える(strikerMeleeMult等が
    // getActiveGunを引くため。実行中のマガジン/リロード状態はSummon側へ同じWeapon[]型で持つ)。
    player: { ...pseudo, weapons: melee ? [...guns, melee] : guns, activeWeaponId: gun?.id ?? pseudo.activeWeaponId },
  };
};

// 実体1体につきビルドは不変=id をキーにメモ化する。実体が消えた後も残す(飛行中の弾が着弾するまで
// 同じビルドで解決される=解散の瞬間に倍率が消える不整合を避ける)。
//
// ★v0.25.3850(SAME_ARENA O-1): **1件メモ化を Map へ広げた。** 旧実装は `cached = {id, build}` の
// 1件だけで、守護霊が同時1体の間は問題なかったが、**幻影が同じ仕組みに乗ると id が交互に変わり、
// 毎フレーム resolveGhostBuild(createWeapon を含む)を作り直す**(v0.25.2525 の実バグと同型)。
// 同時実在数は数体なので上限で刈る(古い順に落とす=在弾の解決に必要な直近は残る)。
const BUILD_CACHE_MAX = 8;
const buildCache = new Map<string, GhostBuild>();
/** 直近に解決した実体のid(実体が場から消えた後の在弾解決に使う)。 */
let lastResolvedId: string | null = null;

/** id をキーにビルドを1件だけ組み立てて使い回す(内部)。 */
const buildForActorId = (id: string, snap: PlayerBuildSnapshot | undefined, live: Player, guardian: boolean): GhostBuild => {
  const hit = buildCache.get(id);
  if (hit) { lastResolvedId = id; return hit; }
  const built = resolveGhostBuild(snap, live, { guardian });
  buildCache.set(id, built);
  lastResolvedId = id;
  if (buildCache.size > BUILD_CACHE_MAX) {
    const oldest = buildCache.keys().next().value; // Map は挿入順
    if (oldest !== undefined && oldest !== id) buildCache.delete(oldest);
  }
  return built;
};

/**
 * 場のゴースト(不在ならundefined)のビルドを得る。不在時は直近の解決結果を返す(在弾の着弾用)。
 * どちらも無ければ null。
 */
export const ghostBuildFor = (ghost: Summon | undefined, live: Player): GhostBuild | null => {
  // 守護霊=記録の熟練度を持つ。ただし熟練度を無視する出撃(練習・ボスメーカー・ボット等)では本人と同じく1(=持たせない)。
  // 旗は resetGame で1回だけ立つ(beginMasteryRun)。メモ化はラン境界で捨てる(clearGhostBuildCache)ので出撃をまたがない。
  if (ghost) return buildForActorId(ghost.id, ghost.ghostBuild, live, !isMasteryRunIgnored());
  return (lastResolvedId !== null ? buildCache.get(lastResolvedId) : undefined) ?? null;
};

/**
 * research/SAME_ARENA.md O-1: **主語を問わない入口**(幻影=Enemy 用)。
 * 守護霊と同じメモ化・同じ `resolveGhostBuild` を通るので、**式も帳簿の作法も1本**のまま。
 * @param id     実体のid(守護霊= summon.id / 幻影= enemy.id)
 * @param snap   その実体が背負っているビルド(`Summon.ghostBuild` / `Enemy.phantomBuild`)
 * @param live   フォールバック用の本人(旧プロファイル=ロードアウト未記録のとき装備を借りる)
 */
export const actorBuildFor = (
  id: string | undefined, snap: PlayerBuildSnapshot | undefined, live: Player,
): GhostBuild | null => {
  if (id === undefined) return null;
  // 幻影の育成(攻撃力)は「戦う本人の今の育成」を呼び出し側で掛ける既存仕様(phantomTick の s.growthAtkMult)。
  // 記録主の育成は疑似Playerに持たせない(=今までどおり1)。オンラインの記録が growthAtkMult を運ぶようになったので、
  // ここで落とさないとサブウェポン等の主語(combatActorPlayer)経由で記録主の育成が幻影に乗ってしまう。
  // 育成「カウンター受付」(growthCounterAcceptMs)も同じ: 幻影は今までどおり0段(記録主の段を持たせない)。
  // オンラインの記録が運ぶようになったので、ここで落とさないと幻影の振りの窓・弾返しの時機が延びる。
  const phantomSnap = snap && (snap.growthAtkMult !== undefined || snap.growthCounterAcceptMs !== undefined)
    ? { ...snap, growthAtkMult: undefined, growthCounterAcceptMs: undefined }
    : snap;
  return buildForActorId(id, phantomSnap, live, false); // 幻影=熟練度を持たない(発注者指示「幻影にはこちらの武器も熟練値を乗せない」)
};

/** ラン境界/テスト用。 */
export const clearGhostBuildCache = (): void => { buildCache.clear(); lastResolvedId = null; };

/**
 * 疑似Playerに「実体(ゴースト)の位置とHP」を着せる。位置依存(スナイパー倍率=距離)と失HP依存
 * (バーサーカー倍率)がプレイヤー本人ではなくゴースト基準で評価されるようにするための1手。
 */
export const ghostActorPlayer = (
  build: GhostBuild,
  actor: { x: number; y: number; width: number; height: number; health: number; maxHealth: number },
): Player => ({
  ...build.player,
  x: actor.x, y: actor.y, width: actor.width, height: actor.height,
  health: actor.health, maxHealth: actor.maxHealth,
});
