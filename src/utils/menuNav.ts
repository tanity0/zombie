// メニューをキーボード・ゲームパッドで操作する(research/PC_SUPPORT.md §11-5)。
// ゲーム中でない時、またはゲームが一時停止している時(一時停止・説明・レベルアップ・ショップ等の窓)だけ効く:
//   矢印/WASD = 画面上で一番近いボタンへ移る(位置で選ぶ)/ Enter・Space = 押す(ボタンの標準動作)/ Esc = 「戻る/閉じる」を押す。
// スマホ(タッチ)は矢印キーを持たないので何も起きない。マウスで触ったらフォーカスの枠を消す(html.kbnav を外す)。
// 位置の計算は純関数(pickNeighbor)に切り出してテストする。
import { useGameStore } from '../store/gameStore';

export type NavDir = 'up' | 'down' | 'left' | 'right';
export interface NavRect { x: number; y: number; w: number; h: number }

/** 今の矩形から dir の向きで一番近い候補の番号(無ければ -1)。主軸の距離 + 横ずれ×2 が最小のもの。 */
export const pickNeighbor = (from: NavRect, cands: readonly NavRect[], dir: NavDir): number => {
  const cx = from.x + from.w / 2, cy = from.y + from.h / 2;
  let best = -1, bestScore = Infinity;
  cands.forEach((r, i) => {
    const px = r.x + r.w / 2, py = r.y + r.h / 2;
    const dx = px - cx, dy = py - cy;
    let main: number, cross: number;
    if (dir === 'down') { main = dy; cross = Math.abs(dx); }
    else if (dir === 'up') { main = -dy; cross = Math.abs(dx); }
    else if (dir === 'right') { main = dx; cross = Math.abs(dy); }
    else { main = -dx; cross = Math.abs(dy); }
    if (main <= 4) return; // その向きに無い(同じ行/列のわずかなずれは除く)
    const score = main + cross * 2;
    if (score < bestScore) { bestScore = score; best = i; }
  });
  return best;
};

// ゲームが動いている間(一時停止していない)はメニュー操作を出さない(矢印=移動と取り合う)。Game が出入りで知らせる。
let gameplayMounted = false;
export const setGameplayMounted = (on: boolean): void => { gameplayMounted = on; };
export const isGameplayMounted = (): boolean => gameplayMounted;
export const isMenuContext = (): boolean => {
  if (typeof document !== 'undefined' && document.querySelector('[data-kbnav-off]')) return false; // オープニングの廊下等(矢印で歩く)
  if (!gameplayMounted) return true;
  return useGameStore.getState().isPaused;
};

const FOCUSABLE = 'button:not([disabled]), a[href], [role="button"], select, input[type="range"], [tabindex]:not([tabindex="-1"])';

/** 一番手前に見えていて押せる要素か(重なった窓の下にある物は選ばない)。 */
const isTopmostVisible = (el: HTMLElement): boolean => {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const vw = window.innerWidth, vh = window.innerHeight;
  // 画面内に見えている部分の中心で当たりを取る(スクロールで半分隠れていても選べる)
  const x0 = Math.max(0, r.left), x1 = Math.min(vw, r.right), y0 = Math.max(0, r.top), y1 = Math.min(vh, r.bottom);
  if (x1 - x0 < 2 || y1 - y0 < 2) return false;
  const hit = document.elementFromPoint((x0 + x1) / 2, (y0 + y1) / 2);
  return !!hit && (el === hit || el.contains(hit) || hit.contains(el));
};

const candidates = (): HTMLElement[] =>
  Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.pointerEvents === 'none') return false;
    return isTopmostVisible(el);
  });

const rectOf = (el: Element): NavRect => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };

// ★選んでいるボタンに `navfocus` を付ける(v0.25.4874・社長報告「ゲームコントローラーだとだめ」)。
//   パッドは「キーを押した」事にならないので、ブラウザはスクリプトの focus() に選択の枠(:focus-visible)を付けない
//   (Chrome 141 の実測: マウスの後に navMove すると :focus-visible=false・FocusOptions.focusVisible も効かない)。
//   CSS は各画面の `:focus-visible` の規則に `.navfocus` を並べてある=キーボードでもパッドでも同じ見え方。
let navFocused: HTMLElement | null = null;
const clearNavFocus = () => { navFocused?.classList.remove('navfocus'); navFocused = null; };
const focusEl = (el: HTMLElement) => {
  document.documentElement.classList.add('kbnav');
  clearNavFocus();
  el.classList.add('navfocus');
  navFocused = el;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
};

/** 矢印1回ぶん。何もフォーカスしていなければ一番上・左の候補へ入る。 */
export const navMove = (dir: NavDir): boolean => {
  const cands = candidates();
  if (cands.length === 0) return false;
  const cur = document.activeElement as HTMLElement | null;
  const inSet = cur && cands.includes(cur);
  if (!inSet) {
    // 画面の主役(data-nav-default・例: ホームの「出撃」)があればそこから入る。無ければ一番上・左。
    const preferred = cands.find(c => c.hasAttribute('data-nav-default'));
    if (preferred) { focusEl(preferred); return true; }
    const first = [...cands].sort((a, b) => { const ra = rectOf(a), rb = rectOf(b); return Math.abs(ra.y - rb.y) > 8 ? ra.y - rb.y : ra.x - rb.x; })[0];
    focusEl(first);
    return true;
  }
  const others = cands.filter(c => c !== cur);
  const i = pickNeighbor(rectOf(cur!), others.map(rectOf), dir);
  if (i >= 0) focusEl(others[i]);
  return true;
};

const BACK_LABEL = /^(戻る|閉じる|とじる|キャンセル|×|✕|back|close)$/i;
/** 「戻る/閉じる」を押す(Esc・パッドの B)。一番手前に見えている物だけ。data-nav-back を付けたボタンを優先し、無ければ名前の完全一致。 */
export const navBack = (): boolean => {
  const cands = candidates();
  const marked = cands.find(el => el.hasAttribute('data-nav-back'));
  if (marked) { marked.click(); return true; }
  const btn = cands.find(el => {
    const label = (el.getAttribute('aria-label') ?? '').trim();
    const text = (el.textContent ?? '').replace(/\s+/g, '').trim();
    // 完全一致だけ(「メニューに戻る」=出撃を終える、を Esc で押さない・品質監査 A-8)
    return BACK_LABEL.test(label) || BACK_LABEL.test(text);
  });
  if (!btn) return false;
  btn.click();
  return true;
};

/** 押す(パッドの A)。何も選んでいなければ、画面の主役(data-nav-default)をそのまま押す(決定を2回押させない)。無ければ選ぶだけ。 */
export const navActivate = (): boolean => {
  const cands = candidates();
  const cur = document.activeElement as HTMLElement | null;
  if (cur && cur !== document.body && cands.includes(cur)) { cur.click(); return true; }
  const preferred = cands.find(c => c.hasAttribute('data-nav-default'));
  if (preferred) { focusEl(preferred); preferred.click(); return true; }
  return navMove('down');
};

const KEY_DIR: Record<string, NavDir> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
};

/**
 * 画面に出ている「スキップ」(`data-skip` の付いたボタン)を押す(v0.25.4873・社長報告「スキップも押せない」)。
 * オープニング・登場の会話・エンディングのスキップはクリック/タップしか受けておらず、キーボードとパッドでは押す手段が無かった。
 * Esc(パッドのスタート・バックは Esc を送る=utils/gamepad)で押す。出ていなければ何もしない(false)=Esc は従来どおり一時停止へ。
 */
export const pressVisibleSkip = (): boolean => {
  if (typeof document === 'undefined') return false;
  const btn = Array.from(document.querySelectorAll<HTMLElement>('[data-skip]')).find(el => {
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1 && getComputedStyle(el).visibility !== 'hidden';
  });
  if (!btn) return false;
  btn.click();
  return true;
};

/** キーボードの入口(App が1回だけ付ける)。 */
export const installMenuKeyNav = (): (() => void) => {
  // スキップは一時停止より先に拾う(捕捉段で取り、他の Esc の受け手へ渡さない)。
  const onSkipKey = (e: KeyboardEvent) => {
    if (e.code !== 'Escape' && e.key !== 'Escape') return;
    if (e.repeat) return;
    if (pressVisibleSkip()) { e.preventDefault(); e.stopImmediatePropagation(); }
  };
  const onKey = (e: KeyboardEvent) => {
    const tgt = e.target as HTMLElement | null;
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;
    if (!isMenuContext()) return;
    const dir = KEY_DIR[e.code];
    if (dir) {
      if (navMove(dir)) e.preventDefault();
      return;
    }
    // ゲーム外の Esc=戻る。ゲーム中の一時停止は Game/PauseMenu が Esc を受け持つ(ここは触らない)。
    if (e.code === 'Escape' && !gameplayMounted) {
      if (navBack()) e.preventDefault();
    }
  };
  const onPointer = () => { document.documentElement.classList.remove('kbnav'); clearNavFocus(); };
  // 選択が他へ移った/消えた時は目印も外す(窓が閉じてボタンが消えた時も残らない)。
  const onFocusOut = (e: FocusEvent) => { if (e.target === navFocused) clearNavFocus(); };
  window.addEventListener('keydown', onSkipKey, true);
  window.addEventListener('keydown', onKey);
  window.addEventListener('pointerdown', onPointer, true);
  document.addEventListener('focusout', onFocusOut, true);
  return () => {
    document.removeEventListener('focusout', onFocusOut, true);
    window.removeEventListener('keydown', onSkipKey, true);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('pointerdown', onPointer, true);
  };
};
