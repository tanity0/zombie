// ゲームパッド(標準配置・Gamepad API)(research/PC_SUPPORT.md §11-4)。
// ゲーム中: 左スティック=移動(タッチのスティックと同じ「方向+強さ」)/ 十字キー=移動(全速)/ A=指(押す/離す=utils/pcPress)/
//          B・RB=フリック(スティックの向き、倒していなければ向いている向き)/ Start・Back=一時停止(Esc と同じ)。
// メニュー(utils/menuNav の isMenuContext): 十字キー・左スティック=ボタン間の移動 / A=押す / B=戻る(ゲームの一時停止中は再開)。
// 接続中だけ毎フレーム読む。負荷 1/10(ボタン十数個と軸2本の比較だけ)。タッチだけの端末では接続が無いので何も起きない。
import { useGameStore, isInputLocked, isWorldFrozen } from '../store/gameStore';
import { performFlickAction } from './inputActions';
import { pcPressDown, pcPressUp } from './pcPress';
import { isMenuContext, isGameplayMounted, navMove, navActivate, navBack, type NavDir } from './menuNav';

export const PAD_DEAD_ZONE = 0.2;
const MENU_STICK_ON = 0.6;
const MENU_REPEAT_FIRST_MS = 380;
const MENU_REPEAT_MS = 150;
const B = { A: 0, B: 1, RB: 5, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 } as const;

/** スティックの値 → 移動の方向と強さ(デッドゾーンを0・外周を1)。デッドゾーン内は null。 */
export const padStickToSwipe = (ax: number, ay: number, dead = PAD_DEAD_ZONE): { dir: { x: number; y: number }; strength: number } | null => {
  const m = Math.hypot(ax, ay);
  if (!(m > dead)) return null;
  const strength = Math.max(0, Math.min(1, (Math.min(1, m) - dead) / (1 - dead)));
  return { dir: { x: ax / m, y: ay / m }, strength };
};

const escapeKey = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));

export const installGamepad = (): (() => void) => {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return () => {};
  let raf = 0;
  let prev: boolean[] = [];
  let stickActive = false;     // ゲーム中にスティックで swipeDirection を書いているか
  let dpadOwn = { up: false, down: false, left: false, right: false }; // 十字キーが立てた移動
  let menuDir: NavDir | null = null;
  let menuNextAt = 0;
  let usedPad = false;
  let walkDir: -1 | 0 | 1 = 0; // オープニングの廊下で送っている矢印

  const releaseGameplay = () => {
    const s = useGameStore.getState();
    if (stickActive) { s.setSwipeDirection(null); stickActive = false; }
    if (dpadOwn.up || dpadOwn.down || dpadOwn.left || dpadOwn.right) {
      const inp = { ...s.inputState };
      if (dpadOwn.up) inp.up = false; if (dpadOwn.down) inp.down = false;
      if (dpadOwn.left) inp.left = false; if (dpadOwn.right) inp.right = false;
      useGameStore.setState({ inputState: inp });
      dpadOwn = { up: false, down: false, left: false, right: false };
    }
  };

  const tick = () => {
    raf = requestAnimationFrame(tick);
    const pads = navigator.getGamepads();
    let gp: Gamepad | null = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    if (!gp) { prev = []; return; }
    const now = performance.now();
    const btn = gp.buttons.map(b => b.pressed);
    const down = (i: number) => btn[i] && !prev[i];
    const up = (i: number) => !btn[i] && prev[i];
    const ax = gp.axes[0] ?? 0, ay = gp.axes[1] ?? 0;
    const anyInput = btn.some(Boolean) || Math.hypot(ax, ay) > PAD_DEAD_ZONE;
    if (anyInput && !usedPad) {
      usedPad = true;
      useGameStore.getState().setMouseAim(null); // パッドで遊ぶ間はマウスの照準を外す(照準=移動の向き=タッチと同じ)
    }

    // オープニングの廊下(矢印で歩く場面): 十字キー/スティックの左右を矢印キーとして送る。
    if (document.querySelector('[data-kbnav-off]')) {
      const walk: -1 | 0 | 1 = (btn[B.LEFT] || ax < -0.5) ? -1 : (btn[B.RIGHT] || ax > 0.5) ? 1 : 0;
      if (walk !== walkDir) {
        const send = (type: 'keydown' | 'keyup', code: 'ArrowLeft' | 'ArrowRight') => window.dispatchEvent(new KeyboardEvent(type, { key: code, code }));
        if (walkDir === -1) send('keyup', 'ArrowLeft'); if (walkDir === 1) send('keyup', 'ArrowRight');
        if (walk === -1) send('keydown', 'ArrowLeft'); if (walk === 1) send('keydown', 'ArrowRight');
        walkDir = walk;
      }
      prev = btn;
      return;
    }
    walkDir = 0;

    if (isMenuContext()) {
      releaseGameplay();
      if (up(B.A)) pcPressUp('pad', false);
      // 方向: 十字キー優先、無ければスティック。押した瞬間に1回+押し続けで繰り返し。
      let dir: NavDir | null = btn[B.UP] ? 'up' : btn[B.DOWN] ? 'down' : btn[B.LEFT] ? 'left' : btn[B.RIGHT] ? 'right' : null;
      if (!dir && Math.hypot(ax, ay) > MENU_STICK_ON) dir = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : (ay > 0 ? 'down' : 'up');
      if (dir !== menuDir) { menuDir = dir; if (dir) { navMove(dir); menuNextAt = now + MENU_REPEAT_FIRST_MS; } }
      else if (dir && now >= menuNextAt) { navMove(dir); menuNextAt = now + MENU_REPEAT_MS; }
      if (down(B.A)) navActivate();
      // B=戻る。ゲーム中(一時停止の窓)は Esc と同じ持ち主(Game/PauseMenu)へ=再開。ゲーム外は「戻る/閉じる」ボタン(監査 A-8)。
      if (down(B.B)) { if (isGameplayMounted()) escapeKey(); else navBack(); }
      if (down(B.START) || down(B.BACK)) escapeKey();
      prev = btn;
      return;
    }
    menuDir = null;

    const s = useGameStore.getState();
    // 移動: スティック(方向+強さ)
    const sw = isInputLocked() ? null : padStickToSwipe(ax, ay);
    if (sw) {
      s.setSwipeDirection(sw.dir, sw.strength);
      if (!isWorldFrozen()) s.setLastDirection(sw.dir);
      stickActive = true;
    } else if (stickActive) {
      s.setSwipeDirection(null);
      stickActive = false;
    }
    // 移動: 十字キー(全速・キーボードと同じ inputState)。変わった所だけ書く。
    const want = { up: btn[B.UP], down: btn[B.DOWN], left: btn[B.LEFT], right: btn[B.RIGHT] };
    if (want.up !== dpadOwn.up || want.down !== dpadOwn.down || want.left !== dpadOwn.left || want.right !== dpadOwn.right) {
      const inp = { ...useGameStore.getState().inputState };
      for (const k of ['up', 'down', 'left', 'right'] as const) if (want[k] !== dpadOwn[k]) inp[k] = want[k];
      useGameStore.setState({ inputState: inp });
      dpadOwn = want;
      let dx = 0, dy = 0;
      if (want.up) dy -= 1; if (want.down) dy += 1; if (want.left) dx -= 1; if (want.right) dx += 1;
      if ((dx || dy) && !isWorldFrozen()) { const l = Math.hypot(dx, dy); s.setLastDirection({ x: dx / l, y: dy / l }); }
    }
    // A=指
    if (down(B.A)) pcPressDown('pad');
    if (up(B.A)) pcPressUp('pad', true);
    // B・RB=フリック
    if ((down(B.B) || down(B.RB)) && !isInputLocked()) {
      const g = useGameStore.getState();
      const d = sw?.dir ?? g.player.lastDirection ?? { x: 1, y: 0 };
      if (g.rhythm.active) g.rhythmInput('flick', d);
      else performFlickAction(d.x, d.y);
    }
    if (down(B.START) || down(B.BACK)) escapeKey();
    prev = btn;
  };

  const start = () => { if (!raf) raf = requestAnimationFrame(tick); };
  const onConnect = () => start();
  const onBlur = () => { releaseGameplay(); pcPressUp('pad', false); };
  // パッドが抜けた=押しっぱなしの A と移動を撃たずに離す(品質監査 A-4)
  const onDisconnect = () => { releaseGameplay(); pcPressUp('pad', false); prev = []; };
  window.addEventListener('gamepadconnected', onConnect);
  window.addEventListener('gamepaddisconnected', onDisconnect);
  window.addEventListener('blur', onBlur);
  // 既に繋がっていれば(ページを開く前に挿していた)すぐ始める
  if (Array.from(navigator.getGamepads()).some(p => p && p.connected)) start();
  return () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    window.removeEventListener('gamepadconnected', onConnect);
    window.removeEventListener('gamepaddisconnected', onDisconnect);
    window.removeEventListener('blur', onBlur);
  };
};
