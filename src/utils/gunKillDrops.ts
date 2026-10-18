// 弾(銃・飛び道具)で倒した時の撃破演出とドロップ(血しぶき・お金・経験値・強個体の武器箱・弾・レアの武器・肉・磁石・爆弾)。
// もとは useGameLoop.ts の弾の当たり処理の中に直書きされていた1塊を、research/NEW_GUNS.md(品質監査#4)で関数へ出した
// (塊弾・回る衛星弾で倒した時も**同じ経路**を通すため)。中身・順番・確率は移す前と1bitも変えていない。
// URL のツマミ(?ammosmart / ?ammodir / 弾ゼロのラン)は呼び手(useGameLoop)のモジュール定数なので、ctx で受け取る。
import type { AmmoType, Enemy, Player } from '../types/game';
import { useGameStore, AMMO_MAX, hasSkill } from '../store/gameStore';
import { getActiveGun, ammoBearingGuns, ammoPoolFor } from './weaponUtils';
import { isPumpkinTier, areaIndexForDist } from './enemyUtils';
import { ammoDirectorRate } from './ammoDirector';
import { pickAmmoDropType } from './ammoDrop';
import { rollWeaponKey } from './weaponDrop';
import { healthDropMult } from './healthDropBias';

export interface GunKillDropCtx {
  /** 倒したフレームのプレイヤー(弾の当たり処理ではフレーム頭の写し)。 */
  player: Player;
  /** 屋内(研究所)=弾・爆弾を落とさない。 */
  indoor: boolean;
  /** レアの武器の段の時計(gameTime)。 */
  gameTime: number;
  /** 血しぶきを寄せる向き(弾の進む向き。無ければ全方位)。 */
  dirX?: number;
  dirY?: number;
  ammoSmart: boolean;
  ammoDirector: boolean;
  noAmmoRun: boolean;
}

export const dropGunKillLoot = (enemy: Enemy, ctx: GunKillDropCtx): void => {
  const st = useGameStore.getState();
  const { player, indoor } = ctx;
  const { spawnBurst, spawnRing, addPickup, dropEnemyXp } = st;
  // Death splash: red burst so kills read as blood/hit impact.
  const ex = enemy.x + enemy.width / 2;
  const ey = enemy.y + enemy.height / 2;
  // PACING_PUZZLE.md §9-7#1(死亡FXの重さ): driller はpumpkinと同格。
  const bloodCount = isPumpkinTier(enemy.type) || enemy.type === 'giantbat' ? 30 : 16;
  // §5.23 M22 C1: 弾/接触キルの死亡血しぶきも弾の進行方向へ寄せる(弾が無い接触キル等はundefined=従来の全方位)。
  const kDirX = ctx.dirX;
  const kDirY = ctx.dirY;
  spawnBurst(ex, ey, '#dc2626', bloodCount, kDirX, kDirY);
  spawnBurst(ex, ey, '#7f1d1d', Math.max(6, Math.floor(bloodCount * 0.45)), kDirX, kDirY);
  spawnRing(ex, ey, 4, isPumpkinTier(enemy.type) || enemy.type === 'giantbat' ? 38 : 24, 'rgba(185,28,28,0.72)', 3, 300);
  useGameStore.getState().dropEnemyCurrency(enemy, ex, ey);

  dropEnemyXp(enemy, ex, ey, 'pickup-xp');
  // 銃キル版の武器クレート/リング演出も同じ isElite を通る=近接版(gameStore.ts)と揃える。
  const isElite = isPumpkinTier(enemy.type) || enemy.type === 'giantbat';
  if (isElite) {
    // Mid-boss drop — a weapon crate. Picking it up opens it and
    // rolls a new gun (category & tier weighted by run time).
    addPickup({
      id: `pickup-crate-${enemy.id}`,
      x: enemy.x + enemy.width / 2 - 8,
      y: enemy.y + enemy.height / 2 - 8 - 18,
      type: 'weapon-crate',
      value: 0,
      worldDrop: true,
    });
    spawnRing(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, 10, 80, 'rgba(96,165,250,0.7)', 3, 500);
  }
  // Ammo resupply: every kill rolls an ammo drop at the start-screen
  // drop rate, so the slider governs the whole ammo economy. Active gun's family.
  // research/NEW_GUNS.md(品質監査#5): 弾倉の無い銃(スキャン・衛星弾)は弾種選び・弾薬ディレクターに数えない
  // (持っていなければ getGuns と同じ=従来と1bitも変わらない)。
  const equippedGun = getActiveGun(player);
  const equippedAmmo = equippedGun?.noAmmo ? undefined : equippedGun?.ammoType;
  const owned = ammoBearingGuns(player)
    .map(w => w.ammoType)
    .filter((t): t is AmmoType => !!t);
  // 弾薬AIディレクター(v0.25.2170): 「全所持銃の弾備蓄の枯渇度×敵の多さ」で基礎率を最大20%まで底上げ。
  // ?ammodir=0で無効化(常にmeleeAmmoDropPercentのまま)。
  // 弾薬ドロップ率アップ(パッシブ): 既定ドロップ率に ammoDropBonus を加算(0..1)。
  const dirPct = ctx.ammoDirector
    ? ammoDirectorRate(useGameStore.getState().meleeAmmoDropPercent, {
        families: owned.filter(t => t !== 'phill').map(t => ({ reserve: ammoPoolFor(player, t), max: AMMO_MAX[t] })),
        enemyCount: useGameStore.getState().enemies.length,
      })
    : useGameStore.getState().meleeAmmoDropPercent;
  const gunKillDropRate = Math.max(0, Math.min(1,
    dirPct / 100 + (useGameStore.getState().player.ammoDropBonus ?? 0) + (useGameStore.getState().player.equipBonus?.ammoDropBonus ?? 0),
  ));
  // 研究所(屋内)は通常ドロップ無し: PHILL弾は固定3箇所＋近接フィニッシュのみ。
  // ナイフマスターは弾薬ドロップ0%(社長指示)。
  // M0(訓練)は弾を拾う教習まで抽選ドロップを封印(社長指示v0.25.2319・m0Unlocked.ammo)。
  if (
    !indoor && !hasSkill(player, 'knife-master')
    // §21-4(弾ゼロ): ★弾薬ディレクタは**備蓄0を枯渇と見て率を上げる**ので、何もしないと「弾ゼロにするほど落ちる」。ここで完全に塞ぐ。
    && !ctx.noAmmoRun
    && useGameStore.getState().m0Unlocked.ammo
    && Math.random() < gunKillDropRate
  ) {
    // M5(§5.5・RE4式): 残弾割合が最小の弾種を落とす(同率は構え優先・phill対象外)。
    // ?ammosmart=0で従来(構え銃の弾種)へ。ドロップ率・供給量は不変=弾種の配分のみ。
    const smartType = ctx.ammoSmart
      ? pickAmmoDropType(owned.map(t => ({ type: t, reserve: ammoPoolFor(player, t), max: AMMO_MAX[t] })), equippedAmmo)
      : null;
    const dropType = smartType ?? equippedAmmo ?? owned[0];
    if (dropType) {
      addPickup({
        id: `pickup-ammo-${enemy.id}`,
        x: enemy.x + enemy.width / 2 - 8 + 16,
        y: enemy.y + enemy.height / 2 - 8,
        type: `ammo-${dropType}` as `ammo-${AmmoType}`, // v0.25.3999: 4種への嘘つきキャストを是正
        value: 0,
        worldDrop: true,
      });
    }
  }
  // Rare world weapon drop (~1%, elites a bit higher).
  if (Math.random() < (isElite ? 0.06 : 0.01)) {
    addPickup({
      id: `pickup-weapon-${enemy.id}`,
      x: enemy.x + enemy.width / 2 - 8,
      y: enemy.y + enemy.height / 2 - 8 + 16,
      type: 'weapon-drop',
      value: 0,
      // v0.25.3291: 近接が当たった時は「装備tier+1」を落とす(rollWeaponKey側の新仕様)。
      weaponKey: rollWeaponKey(
        areaIndexForDist(Math.hypot(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2)),
        useGameStore.getState().player.weapons.find(w => w.isMelee)?.tier ?? 1,
        ctx.gameTime, // v0.25.3328: Tier率も時間で迫る(8:00で最深部相当)
      ),
      worldDrop: true,
    });
  }
  // ★C9(社長裁定2026-10-16「前者」): 体力が減っているほど肉が出やすい(50%以下で1.5倍・20%以下で2倍)。
  const chickenChance = Math.min(1, (isElite ? 0.35 : 0.015) * healthDropMult(player.health, player.maxHealth));
  const magnetChance = isElite ? 0.15 : 0.004;
  const bombChance = isElite ? 0.1 : 0.002;
  if (Math.random() < chickenChance) {
    addPickup({
      id: `pickup-chicken-${enemy.id}`,
      x: enemy.x + enemy.width / 2 - 8,
      y: enemy.y + enemy.height / 2 - 8 + 18,
      type: 'health',
      value: 30,
      worldDrop: true,
    });
  }
  if (Math.random() < magnetChance) {
    addPickup({
      id: `pickup-magnet-${enemy.id}`,
      x: enemy.x + enemy.width / 2 - 8 + 14,
      y: enemy.y + enemy.height / 2 - 8,
      type: 'magnet',
      value: 0,
    });
  }
  if (!indoor && Math.random() < bombChance) { // 研究所(屋内)は爆弾を出さない(社長指示)
    addPickup({
      id: `pickup-bomb-${enemy.id}`,
      x: enemy.x + enemy.width / 2 - 8 - 14,
      y: enemy.y + enemy.height / 2 - 8,
      type: 'bomb',
      value: 0,
    });
  }
};
