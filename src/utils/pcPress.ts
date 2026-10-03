// PC の「指」(research/PC_SUPPORT.md §11-1)。マウスの左ボタン・Space/J・ゲームパッドの A が同じ関数を呼ぶ。
// タッチ(VirtualJoystick)の「指を置く/離す」と**同じ順で同じ store の行為**を呼ぶ=PC でもホーミング(押してロック→離して発射)・
// スケボー(2度押しの2回目を押したまま乗る)・近接の前隙(離してから当たる)が成立する。
// ★タッチのコードは触らない(社長指示「絶対スマホ用の現状が壊れないように分けて作業してね」)。ここは PC の入口だけが呼ぶ。
// 数値はタッチと同じ(VirtualJoystick の SKATER_* と同値。タッチ側の定数を動かしたらここも揃える)。
import { playSfx } from '../audio/audioManager';
import { useGameStore, isAttackLocked, isInputLocked, isWorldFrozen } from '../store/gameStore';

export const PC_SKATER_DOUBLETAP_MS = 300; // 1回目の離し→2回目の押下 までの許容間隔(タッチと同値)
export const PC_SKATER_TAP_MAX_MS = 220;   // 「タップ」とみなす最大の押下時間(タッチと同値)

// 仮想の指は1本(タッチと同じ)。押した入口(マウス/キー/パッド)だけが離せる=3つを同時に押しても二重に撃たない(品質監査 A-2/A-5)。
export type PressSource = 'mouse' | 'key' | 'pad';
let pressing = false;
let owner: PressSource | null = null;
let downAt = 0;
let lastWasTap = false;
let lastUpAt = 0;
let flickedThisPress = false; // 四神舞: 押している間にフリックを出したら、離した時のタップは出さない(タッチの flickFired と同じ・検収 B-1)

/** 四神舞でフリックを出した(右クリック/移動キー/パッド B)。押している間なら、その押下の離しはタップにしない。 */
export const markPcFlick = (): void => { if (pressing) flickedThisPress = true; };

export const isPcPressing = (): boolean => pressing;

/** 指を置く(主ボタンを押した)。押しっぱなしの間ホーミングがロックを溜める(useGameLoop が touchActive を読む)。 */
export const pcPressDown = (src: PressSource): void => {
  if (pressing) return; // 既に別の入口で押している=無視(指は1本)
  if (isInputLocked()) return; // 操作不可(会話/一時停止/死亡等)中は置かない=受理しない=離しも効かない(タッチと同じ・監査 A-1)
  pressing = true;
  owner = src;
  flickedThisPress = false;
  const gs = useGameStore.getState();
  gs.setTouchActive(true);
  const now = performance.now();
  // スケボー: 直前が短いタップで、離しから規定時間内の再押下=2度押し=乗車(2回目はそのまま押している=乗っている)。
  if (lastWasTap && now - lastUpAt <= PC_SKATER_DOUBLETAP_MS) gs.mountSkater();
  downAt = now;
};

/**
 * 指を離す(主ボタンを離した)。fire=false は「撃たずに離す」(窓が裏へ行った・ページを離れた等)。
 * 順番はタッチの指離し(VirtualJoystick release)と同じ: 帰還確認 → (リズム中はタップ) → PHILL → シグナル → レールガン →
 * 錬金砲の起爆 → ホーミング一斉発射 → 近接(前隙つき)→ スケボー降車。フリック(一閃/ワイヤー)は PC では専用ボタン=ここでは出さない。
 */
export const pcPressUp = (src: PressSource | 'any', fire = true): void => {
  if (!pressing) return;
  if (src !== 'any' && src !== owner) return; // 押していない入口の離しは無視
  pressing = false;
  owner = null;
  const gs = useGameStore.getState();
  const returnPromptOpened = fire ? gs.requestStoryReturnPrompt() : false;
  if (fire && !returnPromptOpened && !isAttackLocked()) {
    // マウスがある時は離した瞬間の向き=カーソルの方向(鞭・ナイフの振りと踏み込みがカーソルへ・§11-2)。キーで振っても同じ
    // (照準サークルはカーソルを向いているので、振りだけ歩いた向き、を作らない=監査 B-5)。世界が止まっている間は書き換えない。
    if (gs.mouseAim && !isWorldFrozen() && !gs.rhythm.active) { // 四神舞中は向きを回さない(タッチと同じ・検収 B-2)
      const p = gs.player;
      const dx = gs.camera.x + gs.mouseAim.x - (p.x + p.width / 2);
      const dy = gs.camera.y + gs.mouseAim.y - (p.y + p.height / 2);
      const m = Math.hypot(dx, dy);
      if (m > 1) gs.setLastDirection({ x: dx / m, y: dy / m });
    }
    if (gs.rhythm.active) {
      if (!flickedThisPress) gs.rhythmInput('tap');
    } else {
      const gun = gs.player.weapons.find(w => w.id === gs.player.activeWeaponId);
      if (gun?.key === 'phill-revolver') {
        const before = gun.magazine ?? 0;
        gs.firePhillShot();
        const after = useGameStore.getState().player.weapons.find(w => w.id === gs.player.activeWeaponId)?.magazine ?? 0;
        if (after < before) playSfx('handgun-fire');
      }
      gs.fireSignalLauncher();
      gs.fireRailgunShot();
      gs.detonateAlchemyStones();
      const hadHomingLocks = useGameStore.getState().homingLocks.length > 0;
      gs.fireHoming();
      if (hadHomingLocks) playSfx('homing-fire');
      gs.beginMeleeSwing();
    }
  }
  if (!returnPromptOpened) {
    if (fire) {
      const now = performance.now();
      lastWasTap = now - downAt < PC_SKATER_TAP_MAX_MS;
      lastUpAt = now;
    }
    gs.dismountSkater();
  }
  useGameStore.getState().setTouchActive(false);
};

/** テスト用: 状態を初期化する。 */
export const resetPcPressForTest = (): void => { pressing = false; owner = null; downAt = 0; lastWasTap = false; lastUpAt = 0; flickedThisPress = false; };

// 窓が裏へ行った・タブが隠れた=押しっぱなしの離しは来ない → 撃たずに離す(監査 A-4)。1回だけ付ける。
if (typeof window !== 'undefined') {
  const forceRelease = () => pcPressUp('any', false);
  window.addEventListener('blur', forceRelease);
  window.addEventListener('pagehide', forceRelease);
  document.addEventListener('visibilitychange', () => { if (document.hidden) forceRelease(); });
}
