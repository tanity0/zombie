// メニューをキーボード・ゲームパッドで操作する(research/PC_SUPPORT.md §11-5 / research/MENU_NAV.md v2・v3・v4)。
// ゲーム中でない時、またはゲームが一時停止している時(一時停止・説明・レベルアップ・ショップ等の窓)だけ効く。
// v4: 並びの端は折り返さず、その向きに別の並び/押せる物があれば外へ出る(無い時だけぶつかる)/ 層に入った直後(350ms)と入った時から
//     押しっぱなしの決定、OS のキーリピートは決定にも戻るにも使わない(誤爆よけ)/ 見張り(MutationObserver)は kbnav 中で、ゲームが
//     動いていない間(メニュー文脈・data-kbnav-off の廊下)だけ動かし、ゲーム中は切る。メニュー文脈を抜けたら印・カーソル・案内を自前で消す。
//
// ★2層構え:
//   ①「画面ごとの地図」(宣言のある画面): 各画面が DOM に data-nav-* を書く(後述)。menuNav は今の「層」を見つけ、
//     その中の押せる物を DOM の順で全部拾い、並び(list/row/grid)の規則で動く。判断の純関数は utils/navMap.ts。
//   ② 宣言の無い画面は従来どおり「矢印の向きで画面上いちばん近い押せる物へ」(pickNeighbor)。壊れない。
//
// 宣言(属性):
//   data-nav-screen="キー"   層(画面)。入れ子にしてよい。前の選択を覚える単位。今の層=見えている一番内側。
//   data-nav-modal           併記した物が出ている間は、それが今の層(窓)。候補は窓の中だけ。
//   data-nav-group="名前" data-nav-kind="list|row|grid"  並びの外枠。中の押せる物を DOM の順で並びとして扱う(grid は幾何)。
//   data-nav-default         層に入った時に最初に選ぶ物。 data-nav-id: 覚える時の名前。
//   data-nav-back            B/Esc で押す物。 data-nav-prompt-back="動詞"  案内の B の動詞(例: 再開)。押す物は別にあってよい。
//   data-nav-tabs            タブの外枠(LB/RB・Q/E)。 data-nav-scroll  スクロール枠(右スティック・PageUp/Down)。
//   data-nav-skip            押せても選択の対象から外す。 data-nav-anchor  カーソルを描く場所を中の要素に指す。
//   data-nav-cursor="dark"   明るい面の上=カーソルを暗色にする。
//
// スマホ(タッチ)は矢印キーもパッドも持たないので何も起きない。マウス/タッチに触れたら html.kbnav を外す(カーソル・案内も消える)。
import { useGameStore } from '../store/gameStore';
import { playSfx } from '../audio/audioManager';
import {
  pickNeighbor, navStep, chooseInitial, itemKey, fullKey, NavMemory, pickBackByLayer, navInputKindOf, isPlayStationPad,
  stepRepeat, initRepeat, revealDelta, navScrollEase, NAV_SCROLL_MS,
  openConfirmGuard, enterConfirmGuard, releaseConfirm, confirmAllowed, discardsRepeat, isConfirmCode,
  type ConfirmGuard, type NavDir, type NavRect, type NavItemInfo, type NavGroupInfo, type NavGroupKind, type NavInputKind, type RepeatState, type PromptStyle,
} from './navMap';

export type { NavDir, NavRect } from './navMap';
export { pickNeighbor } from './navMap';

// ゲームが動いている間(一時停止していない)はメニュー操作を出さない(矢印=移動と取り合う)。Game が出入りで知らせる。
let gameplayMounted = false;
export const setGameplayMounted = (on: boolean): void => { gameplayMounted = on; syncNavContext(); };
export const isGameplayMounted = (): boolean => gameplayMounted;
export const isMenuContext = (): boolean => {
  if (typeof document !== 'undefined' && document.querySelector('[data-kbnav-off]')) return false; // オープニングの廊下等(矢印で歩く)
  if (!gameplayMounted) return true;
  return useGameStore.getState().isPaused;
};

const FOCUSABLE = 'button:not([disabled]), a[href], [role="button"], select, input[type="range"], [tabindex]:not([tabindex="-1"])';
const LAYER_SEL = '[data-nav-screen],[data-nav-modal]';
const html = (): HTMLElement => document.documentElement;
export const isKbnavOn = (): boolean => typeof document !== 'undefined' && html().classList.contains('kbnav');
/** kbnav の付け外し(見張り=MutationObserver は kbnav 中のメニュー文脈でだけ動かすので、付け外しで知らせる)。 */
const setKbnav = (on: boolean): void => {
  const was = isKbnavOn();
  if (on) html().classList.add('kbnav'); else html().classList.remove('kbnav');
  if (was !== on) observerHook?.();
};
let observerHook: (() => void) | null = null;

// ---------------------------------------------------------------------------------------------
// 入力の種類・イベント(カーソル/案内が購読する。購読は「選択が変わった時/機器が変わった時」だけ=毎フレームの再描画なし)
// ---------------------------------------------------------------------------------------------
let lastInput: NavInputKind | null = null;
let lastPadPS = false;
/** 最後のメニュー入力(案内の表記を決める)。 */
export const getLastNavInput = (): NavInputKind | null => lastInput;
/** 入力があったことを知らせる。パッドは gamepad.ts が 'pad'(+gamepad.id)、キーは menuNav が isTrusted な keydown だけで 'key'。 */
export const noteNavInput = (kind: NavInputKind, padId?: string): void => {
  if (kind === 'pad') lastPadPS = isPlayStationPad(padId);
  if (kind !== lastInput) { lastInput = kind; updatePrompt(); }
};

export type NavEvent =
  | { type: 'target'; el: HTMLElement; mode: 'near' | 'cross' | 'layer' | 'tab' }
  | { type: 'bump'; dir: NavDir }
  | { type: 'clear' };
const listeners = new Set<(e: NavEvent) => void>();
export const subscribeNav = (fn: (e: NavEvent) => void): (() => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const emit = (e: NavEvent): void => { listeners.forEach(f => f(e)); };

// 案内の状態(NavPrompt が useSyncExternalStore で読む。変わった時だけ新しい参照になる)。
export interface PromptSnapshot {
  visible: boolean; style: PromptStyle; hasBack: boolean; backLabel?: string; hasTabs: boolean;
  /** 置き場所: 既定=右下 / 'left'=左下(画面の根の data-nav-prompt-pos="left") */
  pos: 'right' | 'left';
  /** 画面が用意した置き場(data-nav-prompt-slot)。あればそこへ入れる。 */
  slot: HTMLElement | null;
  /** 画面の色・書体を継ぐ(--nav-font / --nav-prompt-dim。選んでいる物の祖先から)。 */
  font?: string; dim?: string;
}
const PROMPT_HIDDEN: PromptSnapshot = { visible: false, style: 'key', hasBack: false, hasTabs: false, pos: 'right', slot: null };
let promptSnap: PromptSnapshot = PROMPT_HIDDEN;
const promptListeners = new Set<() => void>();
export const subscribePrompt = (fn: () => void): (() => void) => { promptListeners.add(fn); return () => { promptListeners.delete(fn); }; };
export const getPromptSnapshot = (): PromptSnapshot => promptSnap;
const promptBackOf = (layer: LayerInfo | null): string | null => {
  const el = layer ? (layer.el.matches('[data-nav-prompt-back]') ? layer.el : layer.el.querySelector<HTMLElement>('[data-nav-prompt-back]')) : null;
  return el ? (el.getAttribute('data-nav-prompt-back') || '戻る') : null;
};
const updatePrompt = (): void => {
  let next: PromptSnapshot = PROMPT_HIDDEN;
  if (typeof document !== 'undefined' && isKbnavOn() && isMenuContext() && navFocused?.isConnected) {
    const layer = computeLayer();
    const style: PromptStyle = lastInput === 'pad' ? (lastPadPS ? 'padps' : 'pad') : 'key';
    const promptBack = promptBackOf(layer);
    const hasBack = promptBack !== null || findBackButton() !== null;
    const hasTabs = !!layer?.el.querySelector('[data-nav-tabs]');
    const backLabel = promptBack ?? undefined;
    const root = layer ? (layer.el.closest<HTMLElement>('[data-nav-screen]:not([data-nav-modal])') ?? layer.el) : null;
    const pos = root?.getAttribute('data-nav-prompt-pos') === 'left' ? 'left' : 'right';
    const slot = root?.querySelector<HTMLElement>('[data-nav-prompt-slot]') ?? null;
    const cs = getComputedStyle(navFocused);
    const font = cs.getPropertyValue('--nav-font').trim() || undefined;
    const dim = cs.getPropertyValue('--nav-prompt-dim').trim() || undefined;
    const p = promptSnap;
    if (p.visible && p.style === style && p.hasBack === hasBack && p.backLabel === backLabel && p.hasTabs === hasTabs
      && p.pos === pos && p.slot === slot && p.font === font && p.dim === dim) return;
    next = { visible: true, style, hasBack, backLabel, hasTabs, pos, slot, font, dim };
  } else if (!promptSnap.visible) return;
  promptSnap = next;
  promptListeners.forEach(f => f());
};

// ---------------------------------------------------------------------------------------------
// 層(画面/窓)
// ---------------------------------------------------------------------------------------------
interface LayerInfo { el: HTMLElement; key: string }

const isShown = (el: HTMLElement): boolean =>
  el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
const boundaryOf = (el: Element): Element | null => el.closest(LAYER_SEL);
const layerKeyOf = (el: HTMLElement): string => el.getAttribute('data-nav-screen') || el.getAttribute('data-nav-modal') || 'modal';

/** 今の層。data-nav-modal が出ていれば DOM で一番後ろ(=手前)の物、無ければ見えている data-nav-screen のうち一番内側。無ければ null=従来の幾何。 */
const computeLayer = (): LayerInfo | null => {
  if (typeof document === 'undefined') return null;
  const els = Array.from(document.querySelectorAll<HTMLElement>(LAYER_SEL)).filter(isShown);
  if (els.length === 0) return null;
  const modals = els.filter(e => e.hasAttribute('data-nav-modal'));
  let el: HTMLElement;
  if (modals.length > 0) el = modals[modals.length - 1];
  else {
    const inner = els.filter(a => !els.some(b => b !== a && a.contains(b)));
    el = inner[inner.length - 1];
  }
  return { el, key: layerKeyOf(el) };
};

// ---------------------------------------------------------------------------------------------
// 候補の集め方(宣言のある層): 層の中の押せる物を DOM の順で全部。画面の外にある物も含む。
// ---------------------------------------------------------------------------------------------
const GEO_SELECTOR = `${FOCUSABLE}, button[disabled]`;
interface Collected {
  layer: LayerInfo;
  els: HTMLElement[];
  infos: NavItemInfo[];
  groups: NavGroupInfo[];
  groupNames: string[];
  keys: string[];
  isDefault: boolean[];
}
/** 矩形。data-nav-anchor があればその中の要素(タイトル=START の文字)で測る。幾何の計算もこれを使う。 */
const rectOfNav = (el: Element): NavRect => {
  const a = el.querySelector('[data-nav-anchor]') ?? el;
  const r = a.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

const collect = (layer: LayerInfo): Collected => {
  const root = layer.el;
  const nodes: HTMLElement[] = [];
  if (root.matches(GEO_SELECTOR)) nodes.push(root);
  root.querySelectorAll<HTMLElement>(GEO_SELECTOR).forEach(n => nodes.push(n));
  const out: Collected = { layer, els: [], infos: [], groups: [], groupNames: [], keys: [], isDefault: [] };
  const groupOfEl = new Map<HTMLElement, number>();
  const countInGroup: number[] = [];
  let ungrouped = 0;
  for (const el of nodes) {
    if (el.hasAttribute('data-nav-skip')) continue;
    if (boundaryOf(el) !== root) continue;
    if (el.getClientRects().length === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.pointerEvents === 'none') continue;
    const disabled = (el as HTMLButtonElement).disabled === true;
    const gEl = el.parentElement?.closest<HTMLElement>('[data-nav-group]') ?? null;
    const grp = gEl && root.contains(gEl) ? gEl : null;
    const kindAttr = grp?.getAttribute('data-nav-kind');
    const kind: NavGroupKind = kindAttr === 'row' || kindAttr === 'grid' ? kindAttr : 'list';
    if (disabled && !(grp && kind === 'grid')) continue; // ロック枠は grid の行の計算にだけ入れる
    let gi: number;
    let key: string;
    if (grp) {
      const found = groupOfEl.get(grp);
      if (found === undefined) {
        gi = out.groups.length;
        groupOfEl.set(grp, gi);
        out.groups.push({ kind });
        out.groupNames.push(grp.getAttribute('data-nav-group') || `g${gi}`);
        countInGroup.push(0);
      } else gi = found;
      key = itemKey(el.getAttribute('data-nav-id'), countInGroup[gi]++);
    } else {
      gi = out.groups.length;
      out.groups.push({ kind: 'single' });
      out.groupNames.push('');
      countInGroup.push(0);
      key = itemKey(el.getAttribute('data-nav-id'), ungrouped++);
    }
    out.els.push(el);
    out.infos.push({ group: gi, rect: rectOfNav(el), focusable: !disabled });
    out.keys.push(key);
    out.isDefault.push(el.hasAttribute('data-nav-default'));
  }
  return out;
};

const memory = new NavMemory();
/** 全画面の覚えを消す(テスト用)。 */
export const resetNavMemory = (): void => memory.clear();

const entryIndex = (col: Collected, group: number): number | undefined => {
  const name = col.groupNames[group];
  if (!name) return undefined;
  const k = memory.recallGroup(col.layer.key, name);
  if (k === undefined) return undefined;
  const i = col.infos.findIndex((x, idx) => x.group === group && col.keys[idx] === k);
  return i >= 0 ? i : undefined;
};

// ---------------------------------------------------------------------------------------------
// 選択(フォーカス)の印: 選んでいるボタンに `navfocus` を付ける(v0.25.4874・社長報告「ゲームコントローラーだとだめ」)。
//   パッドは「キーを押した」事にならないので、ブラウザはスクリプトの focus() に選択の枠(:focus-visible)を付けない
//   (Chrome 141 の実測: マウスの後に navMove すると :focus-visible=false・FocusOptions.focusVisible も効かない)。
//   CSS は各画面の `:focus-visible` の規則に `.navfocus` を並べてある=キーボードでもパッドでも同じ見え方。
// ---------------------------------------------------------------------------------------------
let navFocused: HTMLElement | null = null;
export const getNavTarget = (): HTMLElement | null => (navFocused?.isConnected ? navFocused : null);
const clearNavFocus = (): void => {
  const had = navFocused;
  navFocused?.classList.remove('navfocus');
  navFocused = null;
  if (had) emit({ type: 'clear' });
  updatePrompt();
};
const markFocus = (el: HTMLElement): void => {
  setKbnav(true);
  navFocused?.classList.remove('navfocus');
  el.classList.add('navfocus');
  navFocused = el;
  el.focus({ preventScroll: true });
};
/** 宣言の無い画面の選択(従来どおり即時スクロール)。 */
const focusEl = (el: HTMLElement): void => {
  markFocus(el);
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  emit({ type: 'target', el, mode: 'near' });
  updatePrompt();
};

// ---------------------------------------------------------------------------------------------
// スクロール: 選んだ物を見せる(尺220ms・曲線 (.2,.7,.3,1)・入れ子は内側から・sticky/fixed の覆う帯を避ける)
// ---------------------------------------------------------------------------------------------
interface Tween { raf: number; to: number }
const tweens = new WeakMap<HTMLElement, { y?: Tween; x?: Tween }>();
const maxScroll = (sc: HTMLElement, axis: 'x' | 'y'): number => (axis === 'y' ? sc.scrollHeight - sc.clientHeight : sc.scrollWidth - sc.clientWidth);
const tweenScroll = (sc: HTMLElement, axis: 'x' | 'y', to: number): void => {
  const rec = tweens.get(sc) ?? {};
  tweens.set(sc, rec);
  const old = rec[axis];
  if (old) cancelAnimationFrame(old.raf);
  const prop = axis === 'y' ? 'scrollTop' : 'scrollLeft';
  const from = sc[prop];
  const target = Math.max(0, Math.min(maxScroll(sc, axis), to));
  if (Math.abs(target - from) < 0.5) { rec[axis] = undefined; return; }
  const t0 = performance.now();
  const tw: Tween = { raf: 0, to: target };
  const tick = (now: number) => {
    const p = Math.min(1, (now - t0) / NAV_SCROLL_MS);
    sc[prop] = from + (target - from) * navScrollEase(p);
    if (p < 1) tw.raf = requestAnimationFrame(tick); else rec[axis] = undefined;
  };
  tw.raf = requestAnimationFrame(tick);
  rec[axis] = tw;
};

const isScrollable = (el: HTMLElement, axis: 'x' | 'y'): boolean => {
  if (maxScroll(el, axis) <= 1) return false;
  const o = axis === 'y' ? getComputedStyle(el).overflowY : getComputedStyle(el).overflowX;
  return o === 'auto' || o === 'scroll' || o === 'overlay';
};
const isPinnedWithin = (el: HTMLElement, sc: HTMLElement): boolean => {
  for (let n: HTMLElement | null = el; n && n !== sc; n = n.parentElement) {
    const p = getComputedStyle(n).position;
    if (p === 'sticky' || p === 'fixed') return true;
  }
  return false;
};
/** スクロール枠の中の sticky/fixed の物が上下から覆っている帯の高さ(選んだ物を含む物・装飾は除く)。 */
const coverBands = (sc: HTMLElement, el: HTMLElement, scr: DOMRect): { top: number; bottom: number } => {
  let top = 0, bottom = 0;
  sc.querySelectorAll<HTMLElement>('*').forEach(p => {
    if (p === el || p.contains(el) || el.contains(p)) return;
    const cs = getComputedStyle(p);
    if ((cs.position !== 'sticky' && cs.position !== 'fixed') || cs.pointerEvents === 'none') return;
    const r = p.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom <= scr.top || r.top >= scr.bottom) return;
    if (r.top + r.height / 2 < scr.top + scr.height / 2) top = Math.max(top, r.bottom - scr.top);
    else bottom = Math.max(bottom, scr.bottom - r.top);
  });
  return { top, bottom };
};
const revealEl = (el: HTMLElement): void => {
  const r0 = (el.querySelector('[data-nav-anchor]') ?? el).getBoundingClientRect();
  let top = r0.top, bottom = r0.bottom, left = r0.left, right = r0.right; // 外側の枠へ渡す時に、内側で動かした分を引く
  for (let sc = el.parentElement; sc && sc !== document.body && sc !== document.documentElement; sc = sc.parentElement) {
    const canY = isScrollable(sc, 'y'), canX = isScrollable(sc, 'x');
    if (!canY && !canX) continue;
    if (isPinnedWithin(el, sc)) continue; // 固定された物の中=スクロールしても動かない
    const scr = sc.getBoundingClientRect();
    const rec = tweens.get(sc);
    if (canY) {
      const pending = rec?.y ? rec.y.to - sc.scrollTop : 0;
      const bands = coverBands(sc, el, scr);
      const d = revealDelta(scr.top + bands.top, scr.bottom - bands.bottom, top - pending, bottom - pending, Math.min(bottom - top, scr.height * 0.25));
      if (Math.abs(d) >= 0.5) { tweenScroll(sc, 'y', (rec?.y ? rec.y.to : sc.scrollTop) + d); top -= d; bottom -= d; }
    }
    if (canX) {
      const pending = rec?.x ? rec.x.to - sc.scrollLeft : 0;
      const d = revealDelta(scr.left, scr.right, left - pending, right - pending, Math.min(right - left, scr.width * 0.25));
      if (Math.abs(d) >= 0.5) { tweenScroll(sc, 'x', (rec?.x ? rec.x.to : sc.scrollLeft) + d); left -= d; right -= d; }
    }
  }
};

/** 今の層の一番内側の data-nav-scroll(選んでいる物を含む物を優先)。スクロールできる物だけ。 */
const scrollContainerOf = (layer: LayerInfo): HTMLElement | null => {
  const all: HTMLElement[] = [];
  if (layer.el.matches('[data-nav-scroll]')) all.push(layer.el);
  layer.el.querySelectorAll<HTMLElement>('[data-nav-scroll]').forEach(e => { if (boundaryOf(e) === layer.el) all.push(e); });
  const ok = all.filter(e => isShown(e) && maxScroll(e, 'y') > 1);
  if (ok.length === 0) return null;
  const withSel = navFocused ? ok.filter(e => e.contains(navFocused)) : [];
  return (withSel.length ? withSel : ok)[(withSel.length ? withSel : ok).length - 1];
};
/** 押せる物がその外に1つ以下で、中に1つも無い長文の枠(更新情報)=上下はスクロールが勝つ(A-11)。 */
const scrollWinner = (layer: LayerInfo, col: Collected): HTMLElement | null => {
  const all: HTMLElement[] = [];
  layer.el.querySelectorAll<HTMLElement>('[data-nav-scroll]').forEach(e => { if (boundaryOf(e) === layer.el) all.push(e); });
  for (const s of all) {
    if (!isShown(s)) continue;
    const inside = col.els.filter(e => s.contains(e)).length;
    if (inside === 0 && col.els.length - inside <= 1) return s;
  }
  return null;
};

// ---------------------------------------------------------------------------------------------
// 選択の置き方・音・ぶつかり
// ---------------------------------------------------------------------------------------------
type NavSrc = 'key' | 'pad';
/** 移動音。±2.5% の揺らぎは押した1発目だけ(押しっぱなしのリピート中は一定の高さ)。 */
const moveSound = (rate: number, fresh: boolean): void =>
  playSfx('ui-move', 1, undefined, fresh ? rate * (1 + (Math.random() - 0.5) * 0.05) : rate);
// 押しっぱなしで端に着いた時は1度だけ・離すまで黙る。キーとパッドで別に持つ(片方の毎フレームの呼びでもう片方が解けない)。
const bumpLatch: Record<NavSrc, boolean> = { key: false, pad: false };
const bump = (dir: NavDir, src: NavSrc): void => {
  if (bumpLatch[src]) return;
  bumpLatch[src] = true;
  playSfx('ui-move', 0.7, undefined, 0.6); // 「不可」の音(ui-deny)は使わない。ui-move を低く遅く
  emit({ type: 'bump', dir });
};

const selectItem = (col: Collected, i: number, mode: 'near' | 'cross' | 'layer' | 'tab'): void => {
  const el = col.els[i];
  markFocus(el);
  revealEl(el);
  memory.remember(col.layer.key, col.groupNames[col.infos[i].group], col.keys[i]);
  emit({ type: 'target', el, mode });
  updatePrompt();
};

/** 層に入った時の最初の選択: 覚えている物 → data-nav-default → 最初の押せる物。置いた番号(無ければ -1)。 */
const placeInitial = (col: Collected): number => {
  const i = chooseInitial(
    col.els.map((_, k) => ({ key: fullKey(col.groupNames[col.infos[k].group], col.keys[k]), focusable: col.infos[k].focusable, isDefault: col.isDefault[k], inGroup: col.groups[col.infos[k].group].kind !== 'single' })),
    memory.recallScreen(col.layer.key),
  );
  if (i < 0) { clearNavFocus(); return -1; }
  selectItem(col, i, 'layer');
  return i;
};

const currentIndex = (col: Collected): number => {
  const ae = document.activeElement as HTMLElement | null;
  let i = ae ? col.els.indexOf(ae) : -1;
  if (i < 0 && navFocused) i = col.els.indexOf(navFocused);
  return i;
};

let curLayer: LayerInfo | null = null;
/** 今の層を測り直す(変わっていれば記録だけ更新。選択の置き直しは refresh と enterKbnav)。 */
const syncLayer = (): LayerInfo | null => { curLayer = computeLayer(); return curLayer; };

// ---------------------------------------------------------------------------------------------
// 宣言の無い画面(従来の幾何)
// ---------------------------------------------------------------------------------------------
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

/** 画面の主役(data-nav-default・例: ホームの「出撃」)があればそこへ、無ければ一番上・左へ入る。 */
const legacyPlace = (): HTMLElement | null => {
  const cands = candidates();
  if (cands.length === 0) return null;
  const preferred = cands.find(c => c.hasAttribute('data-nav-default'));
  if (preferred) { focusEl(preferred); return preferred; }
  const first = [...cands].sort((a, b) => { const ra = rectOf(a), rb = rectOf(b); return Math.abs(ra.y - rb.y) > 8 ? ra.y - rb.y : ra.x - rb.x; })[0];
  focusEl(first);
  return first;
};
const legacyMove = (dir: NavDir): boolean => {
  const cands = candidates();
  if (cands.length === 0) return false;
  const cur = document.activeElement as HTMLElement | null;
  const inSet = cur && cands.includes(cur);
  if (!inSet) { legacyPlace(); return true; }
  const others = cands.filter(c => c !== cur);
  const i = pickNeighbor(rectOf(cur!), others.map(rectOf), dir);
  if (i >= 0) focusEl(others[i]);
  return true;
};

const BACK_LABEL = /^(戻る|閉じる|とじる|キャンセル|×|✕|back|close)$/i;
const isBackNamed = (el: HTMLElement): boolean => {
  const label = (el.getAttribute('aria-label') ?? '').trim();
  const text = (el.textContent ?? '').replace(/\s+/g, '').trim();
  // 完全一致だけ(「メニューに戻る」=出撃を終える、を Esc で押さない・品質監査 A-8)
  return BACK_LABEL.test(label) || BACK_LABEL.test(text);
};
const legacyFindBack = (): HTMLElement | null => {
  const cands = candidates();
  const marked = cands.find(el => el.hasAttribute('data-nav-back'));
  return marked ?? cands.find(isBackNamed) ?? null;
};

// ---------------------------------------------------------------------------------------------
// 戻る: 今の層の data-nav-back → 無ければ外側の層の data-nav-back(窓は外へ出ない=窓の外は押されない)
// ---------------------------------------------------------------------------------------------
/** 今の層から外へ向かう層の並び(内側→外側)。窓に当たったらそこで止める。 */
const layerChain = (inner: HTMLElement): HTMLElement[] => {
  const out = [inner];
  let cur = inner;
  while (!cur.hasAttribute('data-nav-modal')) {
    const up = cur.parentElement?.closest<HTMLElement>(LAYER_SEL) ?? null;
    if (!up) break;
    out.push(up);
    cur = up;
  }
  return out;
};
const backsIn = (L: HTMLElement): HTMLElement[] => {
  const marked: HTMLElement[] = [];
  if (L.matches('[data-nav-back]')) marked.push(L);
  L.querySelectorAll<HTMLElement>('[data-nav-back]').forEach(e => marked.push(e));
  const ok = marked.filter(e => boundaryOf(e) === L && e.getClientRects().length > 0 && !(e as HTMLButtonElement).disabled);
  if (ok.length > 0) return ok;
  // 印が無ければ名前の完全一致(従来どおり)
  return collect({ el: L, key: layerKeyOf(L) }).els.filter(isBackNamed);
};
/** 今 Esc・パッドの B で押される「戻る/閉じる」(無ければ null)。押さずに探すだけ(走査・テスト用にも使う)。 */
export const findBackButton = (): HTMLElement | null => {
  const layer = computeLayer();
  if (!layer) return legacyFindBack();
  return pickBackByLayer(layerChain(layer.el).map(backsIn));
};
export const navBack = (): boolean => {
  const btn = findBackButton();
  if (!btn) return false;
  btn.click();
  return true;
};

// ---------------------------------------------------------------------------------------------
// 動作
// ---------------------------------------------------------------------------------------------
/** html.kbnav に入って選択を置く。置いた要素(無ければ null)。 */
const enterKbnav = (): HTMLElement | null => {
  setKbnav(true);
  const layer = syncLayer();
  if (!layer) return legacyPlace();
  const col = collect(layer);
  const i = placeInitial(col);
  return i >= 0 ? col.els[i] : null;
};

/** まだ kbnav でなければ入って選択を置く(どの入力でも最初の1押しは kbnav に入る・v3)。 */
export const navEnter = (): void => { if (!isKbnavOn()) enterKbnav(); };

/** 矢印1回ぶん(fresh=この押下の最初の1回)。 */
const stepDir = (dir: NavDir, fresh: boolean, src: NavSrc = 'key'): boolean => {
  const layer = syncLayer();
  if (!layer) return legacyMove(dir);
  const col = collect(layer);
  if (fresh) bumpLatch[src] = false;
  const sw = (dir === 'up' || dir === 'down') ? scrollWinner(layer, col) : null;
  if (sw) { tweenScroll(sw, 'y', sw.scrollTop + (dir === 'down' ? 1 : -1) * Math.max(48, sw.clientHeight * 0.4)); return true; }
  if (col.els.length === 0) return false;
  const cur = currentIndex(col);
  if (cur < 0) { placeInitial(col); return true; }
  const step = navStep(col.infos, col.groups, cur, dir, g => entryIndex(col, g));
  if (step.type === 'move') {
    bumpLatch[src] = false;
    selectItem(col, step.index, step.cross ? 'cross' : 'near');
    moveSound(step.cross ? 0.94 : 1, fresh);
  } else bump(dir, src);
  return true;
};
/** 従来の名前(互換)。 */
export const navMove = (dir: NavDir): boolean => stepDir(dir, true);

// ---------------------------------------------------------------------------------------------
// 決定の誤爆よけ: 層(画面/窓/メニュー文脈)に入った瞬間に押されていた決定(Enter・Space・パッドA)は離すまで、
// 入ってから 350ms は決定を無視する(死亡→リザルト・レベルアップ窓・練習の結果で、連打した決定が新しい画面を押さない)。
// 判定は純関数(navMap の confirmAllowed 等)。宣言の無い画面も「メニュー文脈に入った瞬間」で同じに守る。
// ---------------------------------------------------------------------------------------------
let confirmGuard: ConfirmGuard = openConfirmGuard();
const heldConfirm = new Set<string>();
const markEntered = (): void => { confirmGuard = enterConfirmGuard(performance.now(), [...heldConfirm]); };
/** 決定の入力が押された/離された(キーは menuNav が自分で、パッドの A は gamepad.ts が毎フレーム 'pad' で知らせる)。 */
export const noteConfirmHeld = (id: string, down: boolean): void => {
  if (down) heldConfirm.add(id);
  else if (heldConfirm.delete(id)) confirmGuard = releaseConfirm(confirmGuard, id);
};
const confirmOk = (id: string): boolean => confirmAllowed(confirmGuard, performance.now(), id);

// ---------------------------------------------------------------------------------------------
// メニュー文脈の出入り: 抜けた時(ゲーム開始・再開・data-kbnav-off の画面)は、自前で選択の印・カーソル・案内を消す
// (focusout に頼らない)。入った時は決定の誤爆よけを掛ける。出入りは Game の出入り・store の isPaused・キー/パッドの入力・見張りが知らせる。
// ---------------------------------------------------------------------------------------------
let ctxMenu = true;
export const syncNavContext = (menu: boolean = isMenuContext()): boolean => {
  if (menu === ctxMenu) return false;
  ctxMenu = menu;
  if (menu) markEntered();
  else {
    clearNavFocus(); // 印を外し、カーソルを消し、案内を消す
    curLayer = null;
    resetNavRepeat();
  }
  observerHook?.();
  return menu; // メニュー文脈へ入った(復帰した)時だけ true
};

/** 押す(パッドの A)。層に入った直後・入った時から押しっぱなしの A は押さない(置くだけ)。 */
export const navActivate = (): boolean => {
  if (!confirmOk('pad')) { navEnter(); return false; }
  return activate();
};
/** 押す。まだ kbnav でなければ入って置いた物を押す。何も選んでいなければ置いた物をそのまま押す。 */
const activate = (): boolean => {
  const wasOn = isKbnavOn();
  const layer = wasOn ? syncLayer() : null;
  if (!wasOn) {
    const placed = enterKbnav();
    if (!placed) return false;
    // 宣言の無い画面は従来どおり: 主役(data-nav-default)があれば押す、無ければ選ぶだけ
    if (!syncLayer() && !placed.hasAttribute('data-nav-default')) return true;
    placed.click();
    return true;
  }
  if (!layer) {
    const cands = candidates();
    const cur = document.activeElement as HTMLElement | null;
    if (cur && cur !== document.body && cands.includes(cur)) { cur.click(); return true; }
    const preferred = cands.find(c => c.hasAttribute('data-nav-default'));
    if (preferred) { focusEl(preferred); preferred.click(); return true; }
    return legacyMove('down');
  }
  const col = collect(layer);
  const cur = currentIndex(col);
  if (cur >= 0) { col.els[cur].click(); return true; }
  const i = placeInitial(col);
  if (i >= 0) { col.els[i].click(); return true; }
  return false;
};

/** タブを前後へ(LB/RB・Q/E)。タブの無い層では何もしない(false)。端ではぶつかって止まる。 */
export const navTab = (delta: -1 | 1, src: NavSrc = 'key'): boolean => {
  const layer = syncLayer();
  const tabs = layer?.el.querySelector<HTMLElement>('[data-nav-tabs]');
  if (!layer || !tabs) return false;
  const btns = Array.from(tabs.querySelectorAll<HTMLElement>('button:not([disabled]), [role="tab"]')).filter(b => b.getClientRects().length > 0);
  if (btns.length === 0) return false;
  let cur = btns.findIndex(b => b.getAttribute('aria-selected') === 'true' || b.getAttribute('aria-pressed') === 'true' || b.hasAttribute('data-active'));
  if (cur < 0) cur = btns.findIndex(b => b === document.activeElement || b === navFocused);
  const next = cur < 0 ? (delta > 0 ? 0 : btns.length - 1) : cur + delta;
  if (next < 0 || next >= btns.length) { bump(delta > 0 ? 'right' : 'left', src); return true; }
  bumpLatch[src] = false;
  btns[next].click();
  markFocus(btns[next]);
  emit({ type: 'target', el: btns[next], mode: 'tab' });
  updatePrompt();
  moveSound(1.08, true);
  return true;
};

/** PageUp/PageDown: 今の層の一番内側のスクロール枠を1ページ。動かせる枠が無ければ false。 */
export const navScrollPage = (dir: 1 | -1): boolean => {
  const layer = syncLayer();
  const sc = layer && scrollContainerOf(layer);
  if (!sc) return false;
  tweenScroll(sc, 'y', (tweens.get(sc)?.y?.to ?? sc.scrollTop) + dir * sc.clientHeight * 0.85);
  return true;
};
/** 右スティック(標準配置の axes[3])でスクロール。v=-1..1(デッドゾーン処理済み)・dtMs=前フレームからの時間。倒した量がそのまま速さ。 */
export const navScrollStick = (v: number, dtMs: number): boolean => {
  const layer = syncLayer();
  const sc = layer && scrollContainerOf(layer);
  if (!sc) return false;
  sc.scrollTop += v * dtMs * 0.9;
  return true;
};

// ---- 押しっぱなしの繰り返し(間隔の持ち主は menuNav だけ) ----
let padRepeat: RepeatState = initRepeat();
let keyRepeat: RepeatState = initRepeat();
/**
 * パッドの十字キー/スティックの向きを毎フレーム渡す(押されていなければ null)。初回320ms・以後110ms で動く(gamepad.ts は向きを渡すだけ)。
 * まだ kbnav でなければ最初の1回は「入って置くだけ」。
 */
export const navHold = (dir: NavDir | null, now: number = performance.now()): void => {
  const r = stepRepeat(padRepeat, dir, now);
  padRepeat = r.state;
  if (!dir) { bumpLatch.pad = false; return; } // 離した(パッドの向きが無くなった)時だけ、パッドのぶつかりが解ける
  if (!r.fire) return;
  if (r.fresh) bumpLatch.pad = false;
  if (!isKbnavOn()) { enterKbnav(); return; }
  stepDir(dir, r.fresh, 'pad');
};
/** 繰り返しの状態を戻す。src を渡せばその入力だけ(パッドが毎フレーム呼んでもキーのぶつかり・繰り返しは触らない)。 */
export const resetNavRepeat = (src?: NavSrc): void => {
  if (src !== 'key') { padRepeat = initRepeat(); bumpLatch.pad = false; }
  if (src !== 'pad') { keyRepeat = initRepeat(); bumpLatch.key = false; }
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

// ---------------------------------------------------------------------------------------------
// 層の見張り: kbnav 中のメニュー文脈でだけ MutationObserver を動かす(スマホは kbnav に入らない=一度も動かない)。
// 画面/窓が替わったら、見張りの次の rAF で今の層を測り直し、選択を即置く(入力は待たない)。カーソルの絵だけが対象を追う。
// ---------------------------------------------------------------------------------------------
let lastRetryAt = 0;
const refresh = (): void => {
  syncNavContext();
  if (!isKbnavOn() || !isMenuContext()) return;
  const layer = computeLayer();
  if (!layer) {
    curLayer = null;
    if (navFocused && !navFocused.isConnected) clearNavFocus();
    return;
  }
  const changed = !curLayer || curLayer.el !== layer.el || curLayer.key !== layer.key;
  curLayer = layer;
  if (changed) { markEntered(); placeInitial(collect(layer)); return; } // 層が替わった=決定の誤爆よけを掛け直す
  // 同じ層のまま選んでいた物が消えた/層の外へ出た(再描画で作り直された等)=覚えている物から置き直す
  if (!navFocused || !navFocused.isConnected || !layer.el.contains(navFocused)) {
    const t = performance.now();
    if (t - lastRetryAt < 120) return;
    lastRetryAt = t;
    placeInitial(collect(layer));
  }
};

/** キーボードの入口(App が1回だけ付ける)。 */
export const installMenuKeyNav = (): (() => void) => {
  let suppressUp: string | null = null;
  let raf = 0;
  const schedule = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; refresh(); }); };
  // 見張り: kbnav 中のメニュー文脈でだけ observe する。カーソル/案内自身の再配置(data-nav-ui)では動かさない(自己反応を避ける)。
  const mo = typeof MutationObserver !== 'undefined'
    ? new MutationObserver(recs => {
      syncNavContext(); // 文脈の出入り(data-kbnav-off の画面が出た/消えた等)を拾う。メニュー文脈を抜けたなら自前で片付ける
      if (!isKbnavOn() || !ctxMenu) return; // ここは軽く(文脈が menu でない間はこれだけ)
      if (recs.every(r => (r.target as Element).closest?.('[data-nav-ui]'))) return;
      schedule();
    })
    : null;
  let observing = false;
  const updateObserver = () => {
    // 見張るのは kbnav 中で、ゲームが動いていない間(メニュー文脈・data-kbnav-off の廊下など)。廊下から戻った時を MO で拾うため、
    // 文脈が menu でなくても廊下の間は切らない。ゲームが動いている間(出入りは setGameplayMounted/isPaused が知らせる)は切る。
    const want = isKbnavOn() && !(gameplayMounted && !useGameStore.getState().isPaused);
    if (want === observing || !mo) return;
    observing = want;
    if (want) { mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-nav-screen', 'data-nav-modal', 'hidden', 'style'] }); schedule(); }
    else mo.disconnect();
  };
  observerHook = updateObserver;
  // 一時停止(レベルアップ・説明の窓も同じ isPaused)の出入りをメニュー文脈の出入りとして知る。store は毎フレーム動くので isPaused が変わった時だけ。
  let lastPaused = useGameStore.getState().isPaused;
  const unsubStore = useGameStore.subscribe(st => { if (st.isPaused !== lastPaused) { lastPaused = st.isPaused; syncNavContext(); } });

  // 決定の誤爆よけ(捕捉段): 押しっぱなし(OS のリピート)は決定にも戻る(Esc)にも使わない。層に入った直後・入った時から押しっぱなしの決定は捨てる。
  // 捕捉段で止めるので、タイトルの枠の onKeyDown など下の受け手にも届かない。本物のキー(isTrusted)だけ。
  const onGuardKey = (e: KeyboardEvent) => {
    if (!e.isTrusted) return;
    // 文脈の復帰をこの keydown で初めて知った回(廊下を抜けた直後など)は、層は利用者の押下より前に出ていた=誤爆ではない。
    // この keydown 自体は「入った時から押されていたキー」に数えず(先に同期してから記録する)、350ms の窓も掛けない。
    if (syncNavContext()) confirmGuard = { since: -1e9, blocked: confirmGuard.blocked };
    if (isConfirmCode(e.code)) noteConfirmHeld(e.code, true);
    const tgt = e.target as HTMLElement | null;
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;
    if (!ctxMenu) return;
    const confirm = isConfirmCode(e.code);
    if (!confirm && e.code !== 'Escape') return;
    if (discardsRepeat(e.code, e.repeat) || (confirm && !confirmOk(e.code))) {
      e.preventDefault();
      e.stopImmediatePropagation();
      // リピートの keydown は keyup を潰さない(preventDefault だけ=長押しの Space も離せば1回押せる)。
      // ただし「入った時から押しっぱなし」のキーはリピート中でも keyup を潰す(Firefox は keyup の Space で無条件に click を出す・3巡目監査 A)。
      if (confirm && (!e.repeat || confirmGuard.blocked.includes(e.code))) suppressUp = e.code;
    }
  };
  // スキップは一時停止より先に拾う(捕捉段で取り、他の Esc の受け手へ渡さない)。
  const onSkipKey = (e: KeyboardEvent) => {
    if (e.code !== 'Escape' && e.key !== 'Escape') return;
    if (e.repeat) return;
    if (pressVisibleSkip()) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    // ★ゲーム中の窓(ショップ・説明・帰還の確認など)は、キャンセル(Esc・パッドの B)で「閉じる/戻る」を押す
    //   (v0.25.4875・社長「キャンセルボタンもちゃんと対応してほしい」)。それまでは Esc が一時停止の切り替えへ行くだけで、
    //   窓が開いている間は何も起きなかった。押せる物が無ければ従来どおり(一時停止の切り替え/再開)。
    if (gameplayMounted && isMenuContext() && navBack()) { e.preventDefault(); e.stopImmediatePropagation(); }
  };
  const onKey = (e: KeyboardEvent) => {
    const kind = navInputKindOf(e); // 本物のキーだけ(パッドの B/Start が合成する Esc で表記が反転しない)
    const tgt = e.target as HTMLElement | null;
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.isContentEditable)) return;
    if (!isMenuContext()) { syncNavContext(false); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const dir = KEY_DIR[e.code];
    const confirm = isConfirmCode(e.code);
    const tab = e.code === 'KeyQ' ? -1 : e.code === 'KeyE' ? 1 : 0;
    const page = e.code === 'PageUp' ? -1 : e.code === 'PageDown' ? 1 : 0;
    const esc = e.code === 'Escape';
    if (!dir && !confirm && !tab && !page && !esc) return;
    if (kind) noteNavInput(kind);
    const wasOn = isKbnavOn();

    if (dir) {
      // OS のキーリピートは間引く: 初回320ms・以後110ms(間隔は menuNav が決める)
      if (!e.repeat) keyRepeat = initRepeat();
      const r = stepRepeat(keyRepeat, dir, performance.now());
      keyRepeat = r.state;
      if (!wasOn) { if (enterKbnav()) e.preventDefault(); return; } // 最初の1押し: 置くだけ(動かない)
      if (!r.fire || stepDir(dir, r.fresh, 'key')) e.preventDefault();
      return;
    }
    if (confirm) {
      // OS のリピートと層に入った直後の決定は捕捉段(onGuardKey)で捨てている。ここへ来るのは使ってよい決定だけ。
      if (e.repeat) return;
      if (!wasOn) {
        // 既に選ばれている物(Tab で入ったタイトルの枠など)が今の層の候補なら、置き直さず標準動作に任せる(自分で keydown を処理する物を二重に押さない)
        const ae0 = document.activeElement as HTMLElement | null;
        if (ae0 && ae0 !== document.body) {
          const layer0 = syncLayer();
          if (layer0) {
            const col0 = collect(layer0);
            const i0 = col0.els.indexOf(ae0);
            if (i0 >= 0) { selectItem(col0, i0, 'layer'); return; }
          } else if (candidates().includes(ae0)) return;
        }
        // 最初の1押し: kbnav に入って選択を置き、置いた物をそのまま押す(タイトルが Enter 1回で始まる)
        e.preventDefault();
        suppressUp = e.code;
        activate();
        return;
      }
      const layer = syncLayer();
      if (!layer) return; // 宣言の無い画面は従来どおり(標準動作に任せる)
      const col = collect(layer);
      const ae = document.activeElement as HTMLElement | null;
      // 選んでいる物が今の層の候補ならブラウザの標準動作に任せる(二重に押さない)
      if (ae && col.els.includes(ae)) return;
      // 候補でない時(body 等)だけ menuNav が押す。keydown で止める(Space の keyup の追加 click を出さない)
      e.preventDefault();
      suppressUp = e.code;
      activate();
      return;
    }
    if (tab) {
      if (e.repeat) return;
      if (!syncLayer()?.el.querySelector('[data-nav-tabs]')) return;
      if (!wasOn) enterKbnav();
      if (navTab(tab as -1 | 1)) e.preventDefault();
      return;
    }
    if (page) {
      const layer = syncLayer();
      if (!layer || !scrollContainerOf(layer)) return;
      if (!wasOn) enterKbnav();
      if (navScrollPage(page as -1 | 1)) e.preventDefault();
      return;
    }
    // Esc=戻る(リピートは使わない)。ゲーム中の一時停止は Game/PauseMenu が Esc を受け持つ(ここは触らない)。
    if (esc && !gameplayMounted && !e.repeat) {
      if (!wasOn) enterKbnav(); // どの入力でも kbnav に入る(戻った先ですぐ選択が置かれている)
      if (navBack()) e.preventDefault();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (isConfirmCode(e.code)) noteConfirmHeld(e.code, false);
    if (suppressUp && e.code === suppressUp) { suppressUp = null; e.preventDefault(); }
    if (KEY_DIR[e.code] && keyRepeat.dir === KEY_DIR[e.code]) { keyRepeat = initRepeat(); bumpLatch.key = false; }
  };
  const onPointer = () => {
    setKbnav(false); // 見張りも止まる
    clearNavFocus();
    curLayer = null;
    resetNavRepeat();
  };
  // 選択が他へ移った/消えた時は目印も外す(窓が閉じてボタンが消えた時も残らない)。
  const onFocusOut = (e: FocusEvent) => { if (e.target === navFocused) clearNavFocus(); };
  const onWinFocus = () => { if (isKbnavOn() && isMenuContext()) schedule(); };
  const onBlur = () => {
    resetNavRepeat();
    // 窓が離れる間にキーの離しが届かないことがある=押しっぱなしの記録を捨てる
    heldConfirm.clear();
    confirmGuard = { since: confirmGuard.since, blocked: [] };
    suppressUp = null; // keyup を取りこぼした時に、次の正規の1回が潰れないように(3巡目監査 B-2)
  };
  window.addEventListener('keydown', onGuardKey, true);
  window.addEventListener('keydown', onSkipKey, true);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('pointerdown', onPointer, true);
  window.addEventListener('focus', onWinFocus);
  window.addEventListener('blur', onBlur);
  document.addEventListener('focusout', onFocusOut, true);
  updateObserver();
  return () => {
    mo?.disconnect();
    observerHook = null;
    unsubStore();
    if (raf) cancelAnimationFrame(raf);
    document.removeEventListener('focusout', onFocusOut, true);
    window.removeEventListener('keydown', onGuardKey, true);
    window.removeEventListener('keydown', onSkipKey, true);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKeyUp, true);
    window.removeEventListener('pointerdown', onPointer, true);
    window.removeEventListener('focus', onWinFocus);
    window.removeEventListener('blur', onBlur);
  };
};
