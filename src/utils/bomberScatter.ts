// ボマー(bomber)の子グレネード散布の生成(純関数)。手榴弾の既存散布と同一仕様:
// 3個・ダメージ=手榴弾(42)の1/3・小ブラスト半径=手榴弾(66)×0.6・速度=手榴弾(118)×0.8・
// 再散布なし(bomberSpawned=true)。値は useGameLoop.ts の HEAVY_GRENADE_* と揃えること。
// §6.10 M33③で散布対象を拡大(グレネードランチャー弾/火炎ナイフ/救急鞄/ボムカウンター)したため、
// 複数ファイル(useGameLoop/gameStore)から使えるようここへ切り出した。
import type { Projectile, Player } from '../types/game';

export const BOMBER_MINI_COUNT = 3;
// 社長指示v0.25.3300 ボマー覚醒(Lv3): ミニ手榴弾が4つになる。
export const BOMBER_MINI_AWAKEN_COUNT = 4;
// 散布数の唯一の出どころ(主語=散布の持ち主。手動散布ループも含め全散布箇所がこれを通す)。
// ※skillLevel(gameStore)をimportすると循環参照になるため、同じ式(所持ならskillLevels??1)をここに書く。
export const bomberMiniCount = (owner: Player): number =>
  (owner.skills.includes('bomber') ? (owner.skillLevels?.['bomber'] ?? 1) : 0) >= 3
    ? BOMBER_MINI_AWAKEN_COUNT
    : BOMBER_MINI_COUNT;
export const BOMBER_MINI_DAMAGE = 42 / 3;        // = HEAVY_GRENADE_DAMAGE / 3
export const BOMBER_MINI_SPEED = 118 * 0.8;      // = HEAVY_GRENADE_SPEED × 0.8
export const BOMBER_MINI_BLAST_RADIUS = 66 * 0.6; // = HEAVY_GRENADE_RADIUS × 0.6(下の爆発が explodeRadius を参照)
export const BOMBER_MINI_FUSE_MS = 600;

export const buildBomberMinis = (
  cx: number, cy: number,
  idKey: string,
  now: number = Date.now(),
  rng: () => number = Math.random,
  count: number = BOMBER_MINI_COUNT, // 覚醒(Lv3)は呼び出し側が bomberMiniCount(owner) で4を渡す
): Projectile[] => {
  const minis: Projectile[] = [];
  for (let k = 0; k < count; k++) {
    const ang = (Math.PI * 2 * k) / count + rng() * 0.5;
    minis.push({
      id: `proj-bomber-mini-${idKey}-${now}-${k}`,
      x: cx - 5, y: cy - 5, width: 10, height: 10,
      speed: BOMBER_MINI_SPEED,
      damage: BOMBER_MINI_DAMAGE,
      direction: { x: Math.cos(ang), y: Math.sin(ang) },
      weaponType: 'grenade', weaponKey: 'sub-heavy-grenade',
      duration: BOMBER_MINI_FUSE_MS, createdAt: now,
      passthrough: false, hitEnemies: [], hostile: false, reflected: false,
      bomberSpawned: true, // 子はこれ以上散布しない
      explodeRadius: BOMBER_MINI_BLAST_RADIUS,
    });
  }
  return minis;
};
