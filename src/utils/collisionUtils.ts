import { Player, Enemy, Projectile, Pickup, Summon } from '../types/game';
import { enemyFootBox, enemyHitStrip } from '../pixi/renderSpec';
import { isBossType } from './enemyUtils';

// 当たり判定=「帯」方式(社長指示)。通常敵は足元の帯(幅=影と同規格=実描画幅×0.55 / 高さ=e.height)で判定。
// 裏ボスは従来どおり生の帯(AABB=ENEMY_STATS の w×h、BOSS_SPRITE_FIT で絵を追従)。絵は別経路で帯より大きく描く。
const isHiddenBossType = (t: Enemy['type']): boolean => t === 'mimir' || t === 'jormungand' || t === 'skadi' || t === 'thor';
const enemyContactBox = (e: Enemy): { x: number; y: number; width: number; height: number } =>
  isHiddenBossType(e.type) ? { x: e.x, y: e.y, width: e.width, height: e.height } : enemyHitStrip(e);

// PHILL銃の頭部リージョン(見た目の上部)= 描画ボックス上端から boxH×この割合。
const HEAD_FRACTION = 0.33;

// Check collision between two rectangles
export const checkCollision = (
  rect1: { x: number; y: number; width: number; height: number },
  rect2: { x: number; y: number; width: number; height: number }
): boolean => {
  return (
    rect1.x < rect2.x + rect2.width &&
    rect1.x + rect1.width > rect2.x &&
    rect1.y < rect2.y + rect2.height &&
    rect1.y + rect1.height > rect2.y
  );
};

// The player's DAMAGE hitbox is smaller than the sprite so near-misses don't
// clip — only used for taking damage (enemy contact, hostile bolts), not for
// picking things up. 2/3 of the full body, centered.
const PLAYER_HIT_SCALE = 2 / 3;
const playerHitbox = (player: { x: number; y: number; width: number; height: number }) => {
  const w = player.width * PLAYER_HIT_SCALE;
  const h = player.height * PLAYER_HIT_SCALE;
  return {
    x: player.x + (player.width - w) / 2,
    y: player.y + (player.height - h) / 2,
    width: w,
    height: h
  };
};

const throwProgress = (pickup: Pickup, now: number): number => {
  if (
    pickup.throwFromX === undefined ||
    pickup.throwFromY === undefined ||
    pickup.throwStartAt === undefined ||
    pickup.throwDuration === undefined ||
    pickup.throwDuration <= 0
  ) {
    return 1;
  }
  return Math.max(0, Math.min(1, (now - pickup.throwStartAt) / pickup.throwDuration));
};

export const pickupDisplayPosition = (pickup: Pickup, now = Date.now()) => {
  const t = throwProgress(pickup, now);
  if (t >= 1 || pickup.throwFromX === undefined || pickup.throwFromY === undefined) {
    return { x: pickup.x, y: pickup.y, arc: 0 };
  }
  const eased = 1 - Math.pow(1 - t, 2);
  const arc = Math.sin(Math.PI * t) * 24;
  return {
    x: pickup.throwFromX + (pickup.x - pickup.throwFromX) * eased,
    y: pickup.throwFromY + (pickup.y - pickup.throwFromY) * eased - arc,
    arc
  };
};

/**
 * 命中済みの敵を記録する弾か。記録は2つの役割を同時に担う:
 *   ① 同一敵への再ヒット防止(下の `hitEnemies.includes` ガード)
 *   ② 弾を消すかの判定基準(`useGameLoop` の `hitEnemies.length > pierce`)
 *
 * **`pierce` も記録対象**(社長裁定v0.25.2355・実バグ修正)。旧実装は `passthrough` だけを記録して
 * いたため、シャープシューター(貫通+1/+2/+3)を**非passthrough銃**(ハンドガン/ショットガン/
 * ライフルt2・t3)へ付けると `hitEnemies` が空のままになり:
 *   ① 再ヒット防止が効かず**同じ敵に毎フレーム当たり続ける**(弾速500px/s・敵幅40pxで実効4〜5倍)
 *   ② 除去条件が永久に false = **命中しても弾が消えない**(duration 1400ms まで飛び続け、
 *      道中の敵を全部同じ調子で削る)
 * となり、「貫通+1」が実質「単体ダメージ数倍+無限貫通」として動いていた。
 * マグナム(rifle-t1)は `passthrough:true` なので元から正常(=壊れていたのは非passthrough銃だけ)。
 */
const tracksHits = (p: Projectile): boolean => p.passthrough || p.pierce !== undefined;

// Check collisions between projectiles and enemies
export const checkProjectileEnemyCollisions = (
  projectiles: Projectile[],
  enemies: Enemy[]
): { projectileId: string; enemyId: string; damage: number; headshot?: boolean }[] => {
  const collisions: { projectileId: string; enemyId: string; damage: number; headshot?: boolean }[] = [];
  const now = Date.now();

  projectiles.forEach(projectile => {
    // Hostile projectiles only damage enemies once they've been reflected
    if (projectile.hostile) return;
    // Timed grenades explode from their own fuse, not from body contact.
    // Decoys are stationary interceptor devices: they tick down on a timer and
    // shoot down enemy bullets — they must NOT be consumed by enemy body contact.
    // Shields are stationary barrier walls handled by their own pass (blocking +
    // durability); they likewise must not be consumed as a damaging projectile.
    // Turrets are stationary placed support units handled by their own pass
    // (auto-fire + on-expiry explosion); they must not be consumed as a
    // damaging projectile on enemy body contact.
    // Fire-knife throws are handled by their own pass (stick-on-hit + delayed
    // AoE); they must not be consumed/damaged by the generic projectile pass.
    if (
      projectile.weaponType === 'grenade' ||
      projectile.weaponType === 'trap' ||
      projectile.weaponType === 'decoy' ||
      projectile.weaponType === 'shield' ||
      projectile.weaponType === 'turret' ||
      projectile.weaponType === 'fire-knife-projectile' ||
      projectile.weaponType === 'drone-boomerang-projectile'
    ) return;
    // Scheduled-but-not-yet-active projectiles (e.g. the second slash of a
    // whip chain) shouldn't deal damage until their start time arrives.
    if (projectile.createdAt > now) return;
    enemies.forEach(enemy => {
      // Skip if already hit by this projectile (passthrough / pierce weapons)
      if (projectile.hitEnemies.includes(enemy.id)) {
        return;
      }

      // ジャンプ攻撃中(空中)の敵は当たり判定そのものを外す=あらゆる飛び道具をすり抜けさせる
      // (盾は別経路=敵AIの shield 判定で処理されるので影響しない)。
      if (enemy.aiPhase === 'jump') return;

      // v0.25.2469(社長指示「守護霊は基本的にボスを狙う」): ゴースト銃弾はボス系以外を**すり抜ける**。
      // 狙いは元々ボス束縛だが、途中の雑魚が弾を吸って「雑魚と戦っているように見える+ボスへ届かない」
      // のを防ぐ(霊体の弾=実体の雑魚には干渉しない、の世界観にも合う)。
      if (projectile.weaponKey === 'ghost-gun' && !isBossType(enemy.type)) return;

      // PHILL弾は「胴体ボックス または 頭部リージョン」で当たり判定し、頭部命中を headshot として返す。
      if (projectile.weaponType === 'phill-bullet') {
        const fb = enemyFootBox(enemy);
        const top = fb.footY - fb.boxH;
        const headRect = { x: fb.footX - fb.boxW / 2, y: top, width: fb.boxW, height: fb.boxH * HEAD_FRACTION };
        const hitHead = checkCollision(projectile, headRect);
        const hitBody = checkCollision(projectile, enemyContactBox(enemy));
        if (hitHead || hitBody) {
          collisions.push({ projectileId: projectile.id, enemyId: enemy.id, damage: projectile.damage, headshot: hitHead });
          if (tracksHits(projectile)) projectile.hitEnemies.push(enemy.id);
        }
        return;
      }

      if (checkCollision(projectile, enemyContactBox(enemy))) {
        collisions.push({
          projectileId: projectile.id,
          enemyId: enemy.id,
          damage: projectile.damage
        });

        // Add to hit enemies list for passthrough / pierce weapons
        if (tracksHits(projectile)) {
          projectile.hitEnemies.push(enemy.id);
        }
      }
    });
  });

  return collisions;
};

// Check collisions between hostile projectiles and the player.
// Returns the projectiles that collided so the caller can decide whether
// they were guarded, reflected, or did damage.
export const checkProjectilePlayerCollisions = (
  projectiles: Projectile[],
  player: Player
): Projectile[] => {
  const hit = playerHitbox(player);
  return projectiles.filter(p => p.hostile && checkCollision(p, hit));
};

// Check collisions between player and enemies (uses the reduced damage hitbox)
export const checkPlayerEnemyCollisions = (
  player: Player,
  enemies: Enemy[]
): Enemy[] => {
  const hit = playerHitbox(player);
  return enemies.filter(enemy => checkCollision(hit, enemyContactBox(enemy)));
};

// 敵 ↔ 召喚ユニット(通常個体+ghost-ally)の接触。各重なりにつき敵の damage を返す。
// レア個体はHP制ではない(10秒で消滅)ので接触ダメージの対象外。
// ghost-ally(BOT_AND_GHOST.md G2)もHP制なので対象に含める(この汎用接触ダメージが、ボス本体に
// 触れた時の被弾経路になる。ボス固有の特殊技(windup/active毎の専用当たり判定)は対象外=
// ★未決として最終報告に記載)。
export const checkEnemySummonCollisions = (
  enemies: Enemy[],
  summons: Summon[]
): { enemyId: string; summonId: string; damage: number }[] => {
  if (summons.length === 0) return [];
  const out: { enemyId: string; summonId: string; damage: number }[] = [];
  for (const enemy of enemies) {
    for (const s of summons) {
      if (s.kind !== 'normal' && s.kind !== 'ghost-ally') continue;
      if (checkCollision(enemyContactBox(enemy), s)) out.push({ enemyId: enemy.id, summonId: s.id, damage: enemy.damage });
    }
  }
  return out;
};

// Check collisions between player and pickups
// ammoRangeMult: スキル マグネット(§6.8 M31)= 弾薬ピックアップのみ拾得矩形を中心基準で
// ×1.1/1.2/1.3 に拡大(呼び出し側が skillMagnetAmmoRangeMult で算出)。既定1=従来どおり。
// XP/回復/武器/トレジャー/スクラップ等の非弾薬は常に従来の矩形。
export const checkPlayerPickupCollisions = (
  player: Player,
  pickups: Pickup[],
  ammoRangeMult = 1
): string[] => {
  // Slight magnet around the player so collection feels snappy without
  // hoovering pickups from across the screen.
  const PAD = 16;
  const expandedPlayer = {
    x: player.x - PAD,
    y: player.y - PAD,
    width: player.width + PAD * 2,
    height: player.height + PAD * 2
  };
  // マグネット: 弾薬用の拾得矩形(中心基準スケール)。mult=1なら同一矩形。
  const ammoExpandedPlayer = ammoRangeMult !== 1
    ? {
        x: expandedPlayer.x - expandedPlayer.width * (ammoRangeMult - 1) / 2,
        y: expandedPlayer.y - expandedPlayer.height * (ammoRangeMult - 1) / 2,
        width: expandedPlayer.width * ammoRangeMult,
        height: expandedPlayer.height * ammoRangeMult
      }
    : expandedPlayer;
  const isAmmoPickup = (t: Pickup['type']): boolean =>
    t === 'ammo-handgun' || t === 'ammo-shotgun' || t === 'ammo-rifle' || t === 'ammo-phill';

  // Pickups don't carry width/height in the type, so treat them as the
  // 16×16 sprite the renderer draws.
  const PICKUP_SIZE = 16;
  const now = Date.now();

  return pickups
    .filter(pickup => {
      if (
        pickup.throwStartAt !== undefined &&
        pickup.throwDuration !== undefined &&
        now - pickup.throwStartAt < pickup.throwDuration
      ) {
        return false;
      }
      const pos = pickupDisplayPosition(pickup, now);
      return checkCollision(isAmmoPickup(pickup.type) ? ammoExpandedPlayer : expandedPlayer, {
        x: pos.x,
        y: pos.y,
        width: PICKUP_SIZE,
        height: PICKUP_SIZE
      });
    })
    .map(pickup => pickup.id);
};
