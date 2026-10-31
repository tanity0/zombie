// メニュー操作のカーソル(research/MENU_NAV.md v2/v3 §カーソルの見た目・動き)。App に1つだけ。
// キー/パッドで選んだ物(menuNav の選択)に「◆の目印+上辺のヘアライン」を重ねる。DOM の重ね絵(pointer-events:none)。
//
// ★毎フレームの React 購読はしない: 要素は effect で1度だけ作り、menuNav のイベント(選択が変わった時)で
//   位置を命令的に動かす。滑りは CSS transition(曲線 cubic-bezier(.2,.7,.3,1))。
//   対象とその祖先に「有限の」アニメが走っている間(入りのアニメ等)だけ、rAF で矩形を測り直して追う(最長1000ms)。
//   無限アニメ(animate-pulse 等)は待たない。スクロール・リサイズの時も測り直す。
// ★スマホ(タッチ)では kbnav が付かない=要素は display:none のまま何も描かない。
// 見せ方の属性(対象の要素・その祖先・data-nav-anchor の要素のどれかに書く): data-nav-cursor="dark"(明るい面の上=明色)/
//   "row"(◆を出さず、上辺の線は対象の上端ぴったり=DS の行)/ "center"(線のグラデを中央から両端へ消える形=中央揃えの START)。
//   色は CSS 変数 --nav-cursor-color(対象の祖先から継ぐ・既定=琥珀)。
// prefers-reduced-motion の時は滑り・ぶつかり・出入りのアニメを無しにする。
import { useEffect } from 'react';
import './navCursor.css';
import { subscribeNav, getNavTarget, isKbnavOn, type NavEvent } from '../utils/menuNav';
import type { NavDir } from '../utils/navMap';

const EASE = 'cubic-bezier(.2,.7,.3,1)';
const EASE_CROSS = 'cubic-bezier(.2,.8,.2,1.08)'; // 別の並びへ渡る時だけ 2〜3px 行き過ぎて戻る
const PAD = 3;            // 対象の外形の外側へ
const TRACK_MAX_MS = 1000;

interface Box { x: number; y: number; w: number; h: number }

const measure = (el: HTMLElement): Box => {
  const a = el.querySelector('[data-nav-anchor]') ?? el;
  const r = a.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};
const sameBox = (a: Box, b: Box): boolean => Math.abs(a.x - b.x) < 0.3 && Math.abs(a.y - b.y) < 0.3 && Math.abs(a.w - b.w) < 0.3 && Math.abs(a.h - b.h) < 0.3;
/** 対象とその祖先に、有限で再生中のアニメ(入りのアニメ・遷移)があるか。無限アニメは数えない。 */
const hasFiniteAnimation = (el: HTMLElement): boolean => {
  for (let n: HTMLElement | null = el; n; n = n.parentElement) {
    const list = typeof n.getAnimations === 'function' ? n.getAnimations() : [];
    for (const a of list) {
      if (a.playState !== 'running') continue;
      const it = a.effect?.getComputedTiming().iterations;
      if (it !== undefined && Number.isFinite(it)) return true;
    }
  }
  return false;
};

const reducedMotion = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** 見せ方の旗(data-nav-cursor のスペース区切り)。 */
const flagsOf = (el: HTMLElement): Set<string> => {
  const out = new Set<string>();
  const add = (n: Element | null) => n?.getAttribute('data-nav-cursor')?.split(/\s+/).forEach(t => t && out.add(t));
  add(el.querySelector('[data-nav-anchor]'));
  add(el.closest('[data-nav-cursor]'));
  return out;
};

const DIR_VEC: Record<NavDir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

const NavCursor = (): null => {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.createElement('div');
    root.className = 'nav-cursor';
    root.setAttribute('data-nav-ui', '');
    root.setAttribute('aria-hidden', 'true');
    const inner = document.createElement('div');
    inner.className = 'nav-cursor-in';
    const line = document.createElement('i'); line.className = 'nav-cursor-line';
    const dia = document.createElement('i'); dia.className = 'nav-cursor-dia';
    inner.append(line, dia);
    root.append(inner);
    document.body.append(root);

    let target: HTMLElement | null = null;
    let shown = false;
    let last: Box | null = null;
    let trackRaf = 0;
    let trackUntil = 0;
    let measureRaf = 0;
    let hideTimer = 0;
    let pendingReveal = false; // 層に入った直後: 対象の有限アニメが終わるまで不可視で追い、終わった最初のフレームで出す
    let flags = new Set<string>();

    const setOn = (on: boolean) => document.documentElement.classList.toggle('navcursor-on', on);

    const put = (b: Box, transition: string) => {
      const top = flags.has('row') ? 0 : PAD; // 行は上辺の線を行の上端ぴったりに
      root.style.transition = reducedMotion() ? 'none' : transition;
      root.style.width = `${b.w + PAD * 2}px`;
      root.style.height = `${b.h + top + PAD}px`;
      root.style.transform = `translate3d(${b.x - PAD}px, ${b.y - top}px, 0)`;
      last = b;
    };

    const reveal = () => {
      pendingReveal = false;
      root.style.transition = 'none';
      root.style.opacity = '1';
      inner.getAnimations().forEach(a => a.cancel());
      inner.style.transformOrigin = '50% 50%';
      // 画面が替わった直後は滑らずに、その場でふわっと出る(1.04倍から締まって140ms)
      if (!reducedMotion()) inner.animate([{ opacity: 0, transform: 'scale(1.04)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 140, easing: EASE });
    };

    // 追従中(対象そのものが動いている)は滑らせずに張り付く。
    const follow = () => {
      if (!target || !target.isConnected || !shown) return;
      const b = measure(target);
      if (last && sameBox(b, last)) return;
      put(b, 'opacity 100ms linear');
    };

    const tick = () => {
      trackRaf = 0;
      if (!target || !target.isConnected) return;
      follow();
      if (performance.now() < trackUntil && hasFiniteAnimation(target)) { trackRaf = requestAnimationFrame(tick); return; }
      if (pendingReveal) reveal(); // 有限アニメが終わった(最長1000ms)最初のフレームで出す
    };
    const startTrack = () => {
      if (!target || !hasFiniteAnimation(target)) return;
      trackUntil = performance.now() + TRACK_MAX_MS;
      if (!trackRaf) trackRaf = requestAnimationFrame(tick);
    };

    const show = (el: HTMLElement, mode: 'near' | 'cross' | 'layer' | 'tab') => {
      window.clearTimeout(hideTimer);
      const b = measure(el);
      root.style.display = 'block';
      flags = flagsOf(el);
      root.setAttribute('data-dark', flags.has('dark') ? '1' : '');
      root.setAttribute('data-row', flags.has('row') ? '1' : '');
      root.setAttribute('data-center', flags.has('center') ? '1' : '');
      const col = getComputedStyle(el).getPropertyValue('--nav-cursor-color').trim();
      if (col) root.style.setProperty('--nav-cursor-color', col); else root.style.removeProperty('--nav-cursor-color');
      const fresh = !shown || mode === 'layer';
      if (fresh) {
        put(b, 'none');
        target = el;
        if (hasFiniteAnimation(el)) {
          // 入りのアニメの最中は不可視のまま付いて行く
          pendingReveal = true;
          root.style.opacity = '0';
        } else reveal();
      } else {
        if (pendingReveal) reveal();
        const p = last ?? b;
        const dist = Math.hypot((b.x + b.w / 2) - (p.x + p.w / 2), (b.y + b.h / 2) - (p.y + p.h / 2));
        const adjacent = dist <= Math.max(b.w, b.h, 1) * 1.6 + 24;
        const d = mode === 'cross' ? 200 : adjacent ? 90 : 120; // 隣へ90ms / 2つ以上120ms / 別の並びへ200ms
        const ease = mode === 'cross' ? EASE_CROSS : EASE;
        // 位置が先、大きさは40ms遅れて追う
        put(b, `transform ${d}ms ${ease}, width ${d}ms ${ease} 40ms, height ${d}ms ${ease} 40ms, opacity 100ms linear`);
        root.style.opacity = '1';
      }
      target = el;
      shown = true;
      setOn(true);
      startTrack();
    };

    const hide = () => {
      target = null;
      pendingReveal = false;
      if (trackRaf) { cancelAnimationFrame(trackRaf); trackRaf = 0; }
      if (!shown) return;
      shown = false;
      setOn(false);
      // 消える時: 不透明度100ms + 1.02倍へ膨らんで消える
      root.style.opacity = '0';
      inner.getAnimations().forEach(a => a.cancel());
      if (reducedMotion()) { root.style.transition = 'none'; root.style.display = 'none'; return; }
      root.style.transition = 'opacity 100ms linear';
      inner.style.transformOrigin = '50% 50%';
      inner.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.02)' }], { duration: 100, easing: EASE });
      hideTimer = window.setTimeout(() => { if (!shown) root.style.display = 'none'; }, 130);
    };

    // ぶつかり: 進む向きへ10px・50msで出て170msで戻る(非対称)。ぶつかった側の反対端を支点に、進む軸方向を 3px だけ一瞬縮める(百分率でなく固定)。
    const bump = (dir: NavDir) => {
      if (!shown || pendingReveal || reducedMotion()) return;
      const [vx, vy] = DIR_VEC[dir];
      const len = Math.max(8, (vx !== 0 ? root.offsetWidth : root.offsetHeight));
      const k = (len - 3) / len;
      const sq = vx !== 0 ? `scale(${k}, 1)` : `scale(1, ${k})`;
      inner.style.transformOrigin = vx > 0 ? '0 50%' : vx < 0 ? '100% 50%' : vy > 0 ? '50% 0' : '50% 100%';
      inner.getAnimations().forEach(a => a.cancel());
      inner.animate([
        { transform: 'translate(0, 0) scale(1)', easing: EASE },
        { transform: `translate(${vx * 10}px, ${vy * 10}px) ${sq}`, offset: 50 / 220, easing: 'cubic-bezier(.3,.6,.2,1)' },
        { transform: 'translate(0, 0) scale(1)' },
      ], { duration: 220 });
    };

    const unsub = subscribeNav((e: NavEvent) => {
      if (e.type === 'target') show(e.el, e.mode);
      else if (e.type === 'bump') bump(e.dir);
      else hide();
    });

    // スクロール・リサイズの時は測り直す(rAF で束ねる)
    const remeasure = () => {
      if (!shown || measureRaf) return;
      measureRaf = requestAnimationFrame(() => { measureRaf = 0; follow(); });
    };
    window.addEventListener('scroll', remeasure, { capture: true, passive: true });
    window.addEventListener('resize', remeasure);

    // 既に選ばれている物があれば(マウント前に kbnav に入っていた時)拾う
    const t0 = getNavTarget();
    if (t0 && isKbnavOn()) show(t0, 'layer');

    return () => {
      unsub();
      window.removeEventListener('scroll', remeasure, true);
      window.removeEventListener('resize', remeasure);
      if (trackRaf) cancelAnimationFrame(trackRaf);
      if (measureRaf) cancelAnimationFrame(measureRaf);
      window.clearTimeout(hideTimer);
      setOn(false);
      root.remove();
    };
  }, []);
  return null;
};

export default NavCursor;
