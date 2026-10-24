// PC・パッドの武器の持ち替え(社長指示2026-10-05「武器の切り替えも入れて」)。
// スマホは右の銃の枠をタップ(GameHUD)=ここを通らない。PC はキー Q(次)/数字(その枠へ)/ホイール(前後)、
// パッドは Y(次)/LB(前)。どれも HUD のタップと同じ `setActiveWeapon` を呼ぶだけ=持ち替えの中身は同じ。
import { useGameStore, isInputLocked } from '../store/gameStore';
import { getActiveGun } from './weaponUtils';

/** 並び(HUD の銃の枠の順)の中で、今の銃から step だけ進んだ銃(循環)。銃が無い/1丁なら今のまま。 */
export const cycledGunId = (gunIds: readonly string[], activeId: string | null | undefined, step: 1 | -1): string | null => {
  if (gunIds.length === 0) return null;
  const i = activeId ? gunIds.indexOf(activeId) : -1;
  if (i < 0) return gunIds[0];
  return gunIds[(i + step + gunIds.length) % gunIds.length];
};

const gunIdsOf = (): { ids: string[]; active: string | null } => {
  const p = useGameStore.getState().player;
  return { ids: p.weapons.filter(w => !w.isMelee).map(w => w.id), active: getActiveGun(p)?.id ?? null };
};
const canSwitch = (): boolean => !isInputLocked() && !useGameStore.getState().rhythm.active;

/** 次(step=1)/前(step=-1)の銃へ。持ち替えたら true。 */
export const pcCycleGun = (step: 1 | -1): boolean => {
  if (!canSwitch()) return false;
  const { ids, active } = gunIdsOf();
  const id = cycledGunId(ids, active, step);
  if (!id || id === active) return false;
  useGameStore.getState().setActiveWeapon(id);
  return true;
};

/** 枠の番号(0始まり)の銃へ。無い枠・今の銃なら何もしない。 */
export const pcSelectGunSlot = (index: number): boolean => {
  if (!canSwitch()) return false;
  const { ids, active } = gunIdsOf();
  const id = ids[index];
  if (!id || id === active) return false;
  useGameStore.getState().setActiveWeapon(id);
  return true;
};
