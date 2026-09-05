// 入力アクションの共通処理。キーボード(useGameControls)とマウス(Game)から呼ぶ。
// タッチ(VirtualJoystick)は独自に同等処理を持つ(指離し/フリックの判定が絡むため別管理)。
import { playSfx, playEnemyDeath } from '../audio/audioManager';
import { useGameStore } from '../store/gameStore';

// タップ/離す相当: カウンター窓を開き、近接スイング。PHILL銃なら狙い方向へ1発(立ち止まり/スナップ条件は store 側)。
export const performTapAction = () => {
  const gs = useGameStore.getState();
  // PCのクリック/キー操作も、タッチの「指を離す」と同じ帰還確認へつなぐ。
  if (gs.requestStoryReturnPrompt()) return;
  const gun = gs.player.weapons.find(w => w.id === gs.player.activeWeaponId);
  if (gun?.key === 'phill-revolver') {
    const before = gun.magazine ?? 0;
    gs.firePhillShot();
    const after = useGameStore.getState().player.weapons.find(w => w.id === gs.player.activeWeaponId)?.magazine ?? 0;
    if (after < before) playSfx('handgun-fire');
  }
  const counter = useGameStore.getState().triggerCounter();
  // 鞭装備中はナイフ用の汎用音を出さない(鞭専用SE=whip-swing/whip-hit に任せる)。
  const isWhip = useGameStore.getState().player.subWeapons.includes('whip');
  if (counter.swung && !isWhip) playSfx('melee');
  if (counter.finish) playSfx('melee-finish');
  else if (counter.hit && !isWhip) playSfx('slash-damage');
  if (counter.killed > 0) playEnemyDeath(); // slain enemies grunt
};

// フリック相当: 指定方向へ一閃ダッシュ or ワイヤーアンカー(排他装備なので両立しない)。
// 未装備/CD中はどちらも false を返すので無害。
export const performFlickAction = (dirX: number, dirY: number) => {
  const gs = useGameStore.getState();
  if (gs.triggerWireAnchor(dirX, dirY)) {
    // 打ち込み音SEは store の anchorPlantFxAt 経由(useGameLoop)で鳴る。
  } else if (gs.triggerKatanaDash(dirX, dirY)) {
    playSfx('katana-dash');
  }
};
