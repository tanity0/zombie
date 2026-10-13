// ゲーム中のボタン札(research/PC_SUPPORT.md §14・社長「キーボード、コントローラの時は小さくボタンを表示する部分があった方がいいな」)。
// 出す種類(キー/パッド Xbox・PS・任天堂/出さない)と、札に書く字を決める。スマホ(縦)は null=札を1つも描かない。
// オプションの「ボタン表示」(既定=あり・§14-7)を切ると、横長でも出さない。
// 濃さ: 最後の操作から HUD_IDLE_MS で html.hudhint-idle が付く(遊んでいる間は控えめ・手を止めると濃い)。
//   切り替わりの時だけクラスを付け外しする=React の再描画は無い。
import { useSyncExternalStore } from 'react';
import { currentPadKind, currentPointerKind, isKeySeen, isPadActive, subscribePlayDevice, type PadKind, type PointerKind } from './inputDevice';

export type HudHintStyle = 'key' | 'pad' | 'padps' | 'padnin';

/**
 * 出す札の種類。**横長の時だけ**(CLAUDE.md「PC版の作業はスマホを1pxも動かさない」=縦のスマホにキーボード/パッドを繋いでも出さない。
 * phone-guard は一時停止をキーで開くので、ここで止めないとスマホの一時停止画面に札が出た)。
 * パッドを触っている=パッド / マウスの端末=キー / 指の後に本物のキーを押した=キー / それ以外=出さない。
 */
export const hudHintStyle = (padActive: boolean, padKind: PadKind, pointerKind: PointerKind, keySeen: boolean, landscape: boolean): HudHintStyle | null => {
  if (!landscape) return null;
  if (padActive) return padKind === 'ps' ? 'padps' : padKind === 'nin' ? 'padnin' : 'pad';
  if (pointerKind === 'mouse' || keySeen) return 'key';
  return null;
};

export type HudAction = 'pause' | 'press' | 'flick' | 'gunPrev' | 'gunNext';
/** 押下の印に使う名前(操作+銃の枠 slot1〜slot9)。 */
export type HudPressName = HudAction | `slot${number}`;
/** 'lmb'/'rmb'=左/右クリックの絵、'menu'=三本線(パッドの一時停止=Xbox の Menu も PS の Options も実物は三本線。任天堂系は 'plus'=+ の形)。null=札を出さない。 */
export type HudGlyph = string | 'lmb' | 'rmb' | 'menu' | 'plus' | null;
/**
 * 札の字。手の置き場で分ける(クリエイティブ監査 #1): マウスの端末は右手側の操作(指=左クリック・はじく=右クリック)をマウスの絵、
 * 左手側(銃の番号・一時停止)をキーで出す。マウスの無い端末(タブレット+キーボード)は Space / K。
 */
export const hudGlyph = (style: HudHintStyle, action: HudAction, hasMouse: boolean): HudGlyph => {
  if (style === 'key') {
    switch (action) {
      case 'pause': return 'Esc';
      case 'press': return hasMouse ? 'lmb' : 'Space';
      case 'flick': return hasMouse ? 'rmb' : 'K';
      default: return null; // 銃はその枠の番号(hudGunSlotKey)
    }
  }
  // 標準配置は位置で並ぶ(下=指・右=はじく・上=次の銃・左肩=前の銃)。刻印は系統ごとに違う(任天堂系は下が B・右が A)。
  const g = style === 'padps' ? { pause: 'menu', press: '×', flick: '○', gunPrev: 'L1', gunNext: '△' }
    : style === 'padnin' ? { pause: 'plus', press: 'B', flick: 'A', gunPrev: 'L', gunNext: 'X' }
      : { pause: 'menu', press: 'A', flick: 'B', gunPrev: 'LB', gunNext: 'Y' };
  return g[action];
};
/** キーボードの銃の枠の番号(1〜9)。10枠目以降と、パッドは無し。 */
export const hudGunSlotKey = (style: HudHintStyle, index: number): string | null =>
  style === 'key' && index >= 0 && index < 9 ? String(index + 1) : null;

// ---- オプション「ボタン表示」(§14-7・既定=あり。端末に残す) ----
const ENABLED_KEY = 'zombie:ui:hudHints';
const readEnabled = (): boolean => {
  if (typeof window === 'undefined') return true;
  try { return window.localStorage.getItem(ENABLED_KEY) !== '0'; } catch { return true; }
};
let enabled = readEnabled();
const enabledSubs = new Set<() => void>();
export const getHudHintsEnabled = (): boolean => enabled;
export const setHudHintsEnabled = (on: boolean): void => {
  if (on === enabled) return;
  enabled = on;
  try { window.localStorage.setItem(ENABLED_KEY, on ? '1' : '0'); } catch { /* ignore */ }
  enabledSubs.forEach(f => f());
};
const subscribeHints = (cb: () => void): (() => void) => {
  enabledSubs.add(cb);
  const off = subscribePlayDevice(cb);
  return () => { enabledSubs.delete(cb); off(); };
};
export const useHudHintsEnabled = (): boolean => useSyncExternalStore(subscribeHints, getHudHintsEnabled, () => true);
/** 窓が横長か(オプションの「ボタン表示」は横長の時だけ出す=スマホのオプション画面は1pxも変えない)。 */
const subscribeResize = (cb: () => void): (() => void) => { window.addEventListener('resize', cb); return () => window.removeEventListener('resize', cb); };
export const useWindowLandscape = (): boolean =>
  useSyncExternalStore(subscribeResize, () => window.innerWidth > window.innerHeight, () => false);

/** React から読む(機器・オプションが変わった時だけ再描画)。landscape=画面が横長か(HudScale の useHudLandscape をそのまま渡す)。 */
const snapshotKey = (): string => (enabled ? hudHintStyle(isPadActive(), currentPadKind(), currentPointerKind(), isKeySeen(), true) ?? '' : '');
export const useHudHintStyle = (landscape: boolean): HudHintStyle | null => {
  const s = useSyncExternalStore(subscribeHints, snapshotKey, () => '');
  return landscape && s ? (s as HudHintStyle) : null;
};
export const useHudHasMouse = (): boolean => useSyncExternalStore(subscribePlayDevice, () => currentPointerKind() === 'mouse', () => true);

// ---- 濃さ(遊んでいる間=控えめ / 手を止めた=濃い) ----
export const HUD_IDLE_MS = 2500;
let lastActiveAt = 0;
let idle = false;
let timer: ReturnType<typeof setTimeout> | 0 = 0;
const held = new Set<string>(); // 押しっぱなしのキー・マウスのボタン(構えて立ち止まっている間も「操作中」・監査 #8)
const setIdle = (v: boolean): void => {
  idle = v;
  if (typeof document !== 'undefined') document.documentElement.classList.toggle('hudhint-idle', v);
};
const check = (): void => {
  timer = 0;
  const left = HUD_IDLE_MS - (Date.now() - lastActiveAt);
  if (left > 0 || held.size > 0) { timer = setTimeout(check, left > 0 ? left : HUD_IDLE_MS); return; }
  setIdle(true);
};
/** 手を動かした(キー・マウス・パッド)。濃さの切り替えは状態が変わった時だけ(毎回は書かない)。 */
export const noteHudActivity = (): void => {
  lastActiveAt = Date.now();
  if (idle) setIdle(false);
  if (!timer) timer = setTimeout(check, HUD_IDLE_MS);
};
// ---- 押している間だけ札が沈む(監査 #9): html.hk-<操作> を付け外し。クラス1つ=再描画なし ----
const downCount = new Map<HudPressName, number>();
/** その操作のボタンを押した/離した(キー・マウスはここで拾う。パッドは gamepad.ts が呼ぶ)。 */
export const setHudActionDown = (action: HudPressName, src: string, on: boolean): void => {
  const k = `${action}:${src}`;
  if (on === held.has(k)) return;
  if (on) held.add(k); else held.delete(k);
  const n = (downCount.get(action) ?? 0) + (on ? 1 : -1);
  downCount.set(action, Math.max(0, n));
  if (typeof document !== 'undefined') document.documentElement.classList.toggle(`hk-${action}`, n > 0);
};
const KEY_ACTION: Record<string, HudPressName> = { Space: 'press', KeyJ: 'press', KeyK: 'flick', Escape: 'pause', KeyP: 'pause', KeyQ: 'gunNext',
  Digit1: 'slot1', Digit2: 'slot2', Digit3: 'slot3', Digit4: 'slot4', Digit5: 'slot5', Digit6: 'slot6', Digit7: 'slot7', Digit8: 'slot8', Digit9: 'slot9' };
const MOUSE_ACTION: Record<number, HudAction> = { 0: 'press', 2: 'flick' };
if (typeof window !== 'undefined') {
  setIdle(true); // 読み込み時は濃い側から(何も触っていない間は札を読ませる)
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (!e.isTrusted) return;
    noteHudActivity();
    const a = KEY_ACTION[e.code]; if (a) setHudActionDown(a, `k${e.code}`, true);
  }, { capture: true });
  window.addEventListener('keyup', (e: KeyboardEvent) => { const a = KEY_ACTION[e.code]; if (a) setHudActionDown(a, `k${e.code}`, false); }, { capture: true });
  window.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return; // 指・ペンは札に関係ない(スマホで毎タップ html のクラスを付け外ししない・検収監査)
    noteHudActivity();
    const a = e.pointerType === 'mouse' ? MOUSE_ACTION[e.button] : undefined; if (a) setHudActionDown(a, `m${e.button}`, true);
  }, { capture: true, passive: true });
  window.addEventListener('pointerup', (e: PointerEvent) => { const a = e.pointerType === 'mouse' ? MOUSE_ACTION[e.button] : undefined; if (a) setHudActionDown(a, `m${e.button}`, false); }, { capture: true, passive: true });
  window.addEventListener('mousemove', () => noteHudActivity(), { passive: true });
  // 離しを取りこぼした時(窓の外で離した・タブを離れた)に押したままにならないよう、全部離す。
  window.addEventListener('blur', () => { for (const k of [...held]) { const [a, src] = k.split(':'); setHudActionDown(a as HudPressName, src, false); } });
}
