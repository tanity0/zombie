// UNIQUE_WEAPONS.md §16-2/§17-5(バッチC-2「ガンブレード」handgun-t3-gunblade)。
// 通常は銃(8/cd110/count1/mag26/R1300)。至近(≤90px)に敵が入ると近接系の強攻撃(ダメージ×1.6・
// 間隔400ms・体勢削りheavy・ノックバック×1.5)へ切り替わる。
//
// 距離での2セット切り替え(dualRangeGun.ts)と同じ作法: モードはWeapon.gunbladeMeleeModeへ持ち越し、
// fireWeaponのcooldownゲートは「前回確定したモード」で引き、実際に撃つ瞬間(射程ゲート通過後)の
// 距離で次のモードを確定する(§17-8 C-1のヒステリシス判定と同じ置き場所)。
//
// ★§17-5(監査A-6是正)の経緯: 旧案は至近で×3・218DPSでパイルドライバーの2.7倍・劣る局面が無い
// 完全上位互換だった。×1.6・間隔400ms=32DPS(遠距離38.10より低い)へ弱体化し、
// 「近づかれると火力は落ちるが、押し返して体勢を崩せる」という明確な代償にした。
import { Weapon } from '../types/game';

export const GUNBLADE_MELEE_RANGE_PX = 90;

// CATALOGの静的値と二重管理しない出どころ(weaponUtils.tsのCATALOGエントリはこれを参照する)。
export const GUNBLADE_RANGED_DAMAGE = 8;
export const GUNBLADE_RANGED_COOLDOWN_MS = 110;

export const GUNBLADE_MELEE_DAMAGE_MULT = 1.6;
export const GUNBLADE_MELEE_DAMAGE = GUNBLADE_RANGED_DAMAGE * GUNBLADE_MELEE_DAMAGE_MULT; // 12.8
export const GUNBLADE_MELEE_COOLDOWN_MS = 400;
export const GUNBLADE_MELEE_KNOCKBACK_MULT = 1.5;

export type GunbladeMode = 'ranged' | 'melee';

/** 至近距離(≤90px)なら近接、それ以外は通常の銃(ヒステリシス無し=単純な閾値・社長仕様どおり)。 */
export const resolveGunbladeMode = (distanceToTargetPx: number): GunbladeMode =>
  distanceToTargetPx <= GUNBLADE_MELEE_RANGE_PX ? 'melee' : 'ranged';

/**
 * モード別の上書きスタッツ(dualRangeGun.tsのDUAL_RANGE_STATSと同じ形)。damage/cooldownに加え、
 * 近接モードだけknockbackMultを持たせる(既定undefined=ノックバックしない。ranged側は
 * `undefined`を明示して、直前に近接モードだったweaponオブジェクトへ広げてもknockbackMultが
 * 残らないようにする=スプレッド代入の上書きで打ち消す)。
 */
export const GUNBLADE_MODE_STATS: Record<GunbladeMode, Pick<Weapon, 'damage' | 'cooldown' | 'knockbackMult'>> = {
  ranged: { damage: GUNBLADE_RANGED_DAMAGE, cooldown: GUNBLADE_RANGED_COOLDOWN_MS, knockbackMult: undefined },
  melee: { damage: GUNBLADE_MELEE_DAMAGE, cooldown: GUNBLADE_MELEE_COOLDOWN_MS, knockbackMult: GUNBLADE_MELEE_KNOCKBACK_MULT },
};
