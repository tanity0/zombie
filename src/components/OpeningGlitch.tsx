import React, { useEffect, useRef } from 'react';
import {
  FRAME_MS, HOLD_DEFAULT, IDLE_MAX, beatSpan, planArenaBeats, planWalkBeats, planWalkIdleBeat, planWalkIdleWait,
  type Act, type ArenaTimes, type Beat, type GlitchSegment, type HoldTool,
} from '../utils/openingGlitch';

// オープニングの「たまに画面が乱れる」ホラー演出(社長指示2026-10-19・社長の答え「乱れは曖昧な記憶なので」「BGMも揺らす」)。
// 作曲(どの拍で・何を・どの順番で)は utils/openingGlitch.ts。ここはそれを画と音にするだけ。
//
// 【作り】React の state を持たない(再描画ゼロ)。拍の間だけ DOM に直接書き、終われば外す:
//   freeze    場面の入れ物の中の夢の動き(粒・呼吸・光・紙吹雪・カメラ)を Web Animations API で止め、終わりで止まった分だけ
//             先へ跳ばす(台本の時刻とずれない)。廊下は walkFreezeRef で主人公・スタッフ・カメラ(rAF)も止める。入力は止めない。
//   cold      重ね(この部品の div)に「色を抜く層(saturation)」と「黒を持ち上げる層(screen・作品の光の色)」
//   drain     主人公の画像だけ filter で彩度を落とす(jolt=その瞬間に場面ごと一瞬ずれてすぐ戻る)
//   missing   人物(data-opg-figure)にマスク: 顔を柔らかい楕円で抜く/その人を薄くする(濃さは rAF で連続補間)
//   ghost     人物の複製を1人だけ: 廊下=その場に置き去り(世界座標)/アリーナ=画面に固定(寄るカメラに置いていかれる)
//   melt      細部のある所(主人公の足元の床・客席)をぼかす柔らかい塊。下へ垂れながら広がって消える
//   slice     場面の複製を柔らかい縁の帯で切り、人物を避けた高さで横へ流して戻す
//   sceneGhost 場面の複製(写し取った時刻で止めたもの)。カットの1コマ前に写し取り、カットの後に重ねて薄れる
//   red       縁が赤く中心が抜ける(蘇生場面と同じ絵・同じ鼓動)。絵のある所の矩形に合わせる
// 慣性: 入りは ease-in で沈め、戻りは長めの ease-out。瞬時に消えるのは暗闇の拍の閃き(instantOut)1か所だけ。
// BGM: 音量を ease-in で沈め(遠のく)、長めの ease-out で戻す(rAF の連続補間)。音程のよれは山場だけ、ごく小さく。
// スキップ・破棄・場面の切替(射撃シーンへ等)で、タイマー・rAF・複製・マスク・止めたアニメ・BGM を全部元に戻す。

/** 止める対象にしない CSS アニメ(場面のフェード・暗転・字幕)。 */
const NOT_DREAM = new Set(['opfade', 'opfadeout', 'opblack', 'opsub']);
const dreamAnims = (root: HTMLElement): Animation[] =>
  root.getAnimations({ subtree: true }).filter(a => {
    const n = (a as CSSAnimation).animationName;
    return !!n && n.startsWith('op') && !n.startsWith('opg') && !NOT_DREAM.has(n);
  });

const EASE_IN = 'cubic-bezier(0.55, 0, 0.75, 0.2)';
const EASE_OUT = 'cubic-bezier(0.16, 0.7, 0.3, 1)';
const easeIn = (k: number) => k * k * k;
const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);
const RED_VIGNETTE = 'radial-gradient(ellipse at center, rgba(120,0,0,0) 30%, rgba(150,0,0,0.40) 60%, rgba(190,0,0,0.92) 100%)'; // 蘇生場面と同じ絵
/** 黒を持ち上げる色=作品の光(廊下=灯りの琥珀/アリーナ=紫)。screen 合成なので暗部だけが持ち上がり、コントラストが抜ける */
const LIFT_TINT = { walk: '#3a2c18', arena: '#2e2140' } as const;

type Cleanup = () => void;

const OpeningGlitch: React.FC<{
  targetRef: React.RefObject<HTMLDivElement | null>;
  segment: GlitchSegment;
  /** 歩きの台詞の表示中 index(-1=なし)。OpeningScene が書く ref */
  walkLineRef: React.RefObject<number>;
  /** true の間、歩きの rAF はコマ送り・移動・カメラを止める(入力は受け続ける) */
  walkFreezeRef: React.MutableRefObject<boolean>;
  arenaTimes: ArenaTimes;
  getBgm: () => HTMLAudioElement[];
  /** ?opglitch=1(撮影用): 道具を出しっぱなし */
  continuous?: boolean;
  holdTools?: HoldTool[];
  /** ?opgslow=N(撮影用): 乱れの中の時間を N 倍に伸ばす(拍の始まる時刻は変えない) */
  slow?: number;
  /** ?opgonly=W4,A3(撮影用): その拍だけ鳴らす */
  only?: string[];
}> = ({ targetRef, segment, walkLineRef, walkFreezeRef, arenaTimes, getBgm, continuous, holdTools, slow = 1, only }) => {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const getBgmRef = useRef(getBgm);
  useEffect(() => { getBgmRef.current = getBgm; }, [getBgm]);

  useEffect(() => {
    if (segment !== 'walk' && segment !== 'arena') return;
    const target = targetRef.current, overlay = overlayRef.current;
    if (!target || !overlay) return;
    const seg = segment;
    const sl = Math.max(0.1, slow);
    const T = (ms: number) => ms * sl;
    const ids: number[] = [];
    const rafs = new Set<number>();
    const cleanups = new Set<Cleanup>();
    const later = (fn: () => void, ms: number) => { ids.push(window.setTimeout(fn, Math.max(0, ms))); };
    const track = (fn: Cleanup) => { cleanups.add(fn); return () => { if (cleanups.delete(fn)) fn(); }; };
    /** rAF の連続補間(拍の間だけ回る)。fn(経過ms)。終われば done */
    const tween = (ms: number, fn: (t: number) => void, done?: () => void) => {
      const t0 = performance.now();
      let id = 0;
      const step = (now: number) => {
        rafs.delete(id);
        const t = Math.min(ms, now - t0);
        fn(t);
        if (t < ms) { id = requestAnimationFrame(step); rafs.add(id); } else done?.();
      };
      id = requestAnimationFrame(step); rafs.add(id);
    };
    /** 包絡 0→1→1→0(入り ease-in・戻り ease-out) */
    const env = (t: number, a: { in: number; hold: number; out: number }) => {
      const i = T(a.in), h = T(a.hold), o = T(a.out);
      if (t < i) return easeIn(t / Math.max(1, i));
      if (t < i + h) return 1;
      return 1 - easeOut(Math.min(1, (t - i - h) / Math.max(1, o)));
    };
    /** WAAPI の包絡キーフレーム(opacity などに) */
    const envFrames = (a: { in: number; hold: number; out: number }, from: Keyframe, to: Keyframe): Keyframe[] => {
      const tot = a.in + a.hold + a.out;
      return [
        { ...from, offset: 0, easing: EASE_IN },
        { ...to, offset: a.in / tot },
        { ...to, offset: (a.in + a.hold) / tot, easing: EASE_OUT },
        { ...from, offset: 1 },
      ];
    };

    // 重ね(overlay)の座標: PC は HudScale で拡大されているので、画面pxを割って重ねの中の px にする。
    const toLocal = (r: DOMRect) => {
      const o = overlay.getBoundingClientRect();
      const k = o.width / Math.max(1, overlay.offsetWidth);
      return { x: (r.left - o.left) / k, y: (r.top - o.top) / k, w: r.width / k, h: r.height / k };
    };
    /** 絵のある所(背景画像の矩形 ∩ 画面)。重ねの中の px。 */
    const contentRect = () => {
      const o = overlay.getBoundingClientRect();
      const img = target.querySelector<HTMLElement>('[data-opg-content]');
      const r = img?.getBoundingClientRect() ?? o;
      // data-opg-content="上,下"(画像の高さ比)= 画像の中で絵が描かれている縦の範囲(廊下の素材は上下が黒い)。
      const [fy0, fy1] = (img?.dataset.opgContent || '0,1').split(',').map(Number);
      const rt = r.top + r.height * (Number.isFinite(fy0) ? fy0 : 0), rb = r.top + r.height * (Number.isFinite(fy1) ? fy1 : 1);
      const l = Math.max(r.left, o.left), t = Math.max(rt, o.top);
      const rr = Math.min(r.right, o.right), b = Math.min(rb, o.bottom);
      return toLocal(new DOMRect(l, t, Math.max(0, rr - l), Math.max(0, b - t)));
    };
    const figures = (who: 'hero' | 'others' | 'all') => [...target.querySelectorAll<HTMLElement>('[data-opg-figure]')].filter(el => {
      if (who !== 'all' && (el.dataset.opgFigure === 'hero') !== (who === 'hero')) return false;
      if (!el.isConnected || el.offsetParent === null) return false;
      return Number(getComputedStyle(el).opacity) > 0.05;
    });
    const addLayer = (css: Partial<CSSStyleDeclaration>) => {
      const d = document.createElement('div');
      d.setAttribute('data-opg-clone', '');
      Object.assign(d.style, { position: 'absolute', pointerEvents: 'none' }, css);
      overlay.appendChild(d);
      return d;
    };
    const setMask = (el: HTMLElement, m: string) => { el.style.maskImage = m; el.style.setProperty('-webkit-mask-image', m); };
    /** 場面の複製。frozen=写し取った時刻で止める / それ以外=元と同じ時刻から動き続ける */
    const cloneScene = (frozen: boolean): { src: HTMLElement; el: HTMLElement; sync: () => void } | null => {
      const src = target.querySelector<HTMLElement>('[data-opg-scene]');
      if (!src) return null;
      const el = src.cloneNode(true) as HTMLElement;
      el.removeAttribute('data-opg-scene');
      el.querySelectorAll('[data-opg-scene],[data-opg-figure],[data-opg-content],[data-opg-clone]').forEach(n => {
        if (n.hasAttribute('data-opg-clone')) { n.remove(); return; }
        n.removeAttribute('data-opg-scene'); n.removeAttribute('data-opg-figure'); n.removeAttribute('data-opg-content');
      });
      el.setAttribute('data-opg-clone', '');
      el.style.pointerEvents = 'none';
      const srcTimes = src.getAnimations({ subtree: true }).map(a => a.currentTime);
      const sync = () => {
        el.getAnimations({ subtree: true }).forEach((c, i) => {
          const v = srcTimes[i];
          try { if (typeof v === 'number') c.currentTime = v; if (frozen) c.pause(); } catch { /* ignore */ }
        });
      };
      return { src, el, sync };
    };
    const fadeOut = (el: HTMLElement, from: number, ms: number, done?: () => void) => {
      const an = el.animate([{ opacity: from }, { opacity: 0 }], { duration: Math.max(1, ms), easing: EASE_OUT, fill: 'forwards' });
      an.onfinish = () => { el.remove(); done?.(); };
    };

    // ── 道具 ──
    const run = (a: Act, hold: boolean) => {
      switch (a.tool) {
        case 'freeze': {
          const anims = dreamAnims(target);
          const t0 = anims.map(x => (typeof x.currentTime === 'number' ? x.currentTime : null));
          const started = performance.now();
          anims.forEach(x => { try { x.pause(); } catch { /* ignore */ } });
          walkFreezeRef.current = true;
          const undo = track(() => {
            walkFreezeRef.current = false;
            anims.forEach((x, i) => { const v = t0[i]; if (v === null) return; try { x.currentTime = v + (performance.now() - started); x.play(); } catch { /* ignore */ } });
          });
          later(undo, T(a.hold));
          return;
        }
        case 'cold': {
          // 絵のある所だけ(スマホの黒い上下帯は黒のまま=持ち上げない)。
          const c = contentRect();
          const box = { left: `${c.x}px`, top: `${c.y}px`, width: `${c.w}px`, height: `${c.h}px`, opacity: '0' };
          const layers = [
            addLayer({ ...box, background: '#808080', mixBlendMode: 'saturation' }),
            addLayer({ ...box, background: LIFT_TINT[seg], mixBlendMode: 'screen' }),
          ];
          const undo = track(() => layers.forEach(l => l.remove()));
          const peak = [a.depth, a.depth * 0.7];
          if (hold) { layers.forEach((l, i) => { l.style.opacity = String(peak[i]); }); return; }
          const dur = T(a.in + a.hold + a.out);
          layers.forEach((l, i) => {
            const an = l.animate(envFrames(a, { opacity: 0 }, { opacity: peak[i] }), { duration: dur, fill: 'forwards' });
            if (i === 0) an.onfinish = undo;
          });
          return;
        }
        case 'drain': {
          const fig = figures('hero')[0];
          if (!fig) return;
          const from = { filter: 'saturate(1) brightness(1)' }, to = { filter: 'saturate(0.06) brightness(1.12)' };
          if (hold) { fig.style.filter = to.filter; track(() => { fig.style.filter = ''; }); return; }
          // 色が抜ける瞬間、場面ごと一瞬だけずれてすぐ戻る(加減速なし=映像が一コマ飛ぶ。既存のカメラの動きには足し合わせる)。
          if (a.jolt) {
            const j = `translate(${a.jolt.dx}px, ${a.jolt.dy}px)`;
            const ja = target.animate([{ transform: j }, { transform: j }], { duration: T(a.jolt.ms), composite: 'add' });
            const jundo = track(() => ja.cancel());
            ja.onfinish = jundo;
          }
          const an = fig.animate(envFrames(a, from, to), { duration: T(a.in + a.hold + a.out) });
          const undo = track(() => an.cancel());
          an.onfinish = undo;
          return;
        }
        case 'missing': {
          const figs = figures(a.who === 'hero' ? 'hero' : 'others');
          if (!figs.length) return;
          const prev = figs.map(f => f.style.maskImage);
          // face=顔(頭の上から15%辺り)が柔らかい楕円で抜ける。fade=その人ごと薄れる。opacity は歩きの rAF が使うのでマスクで作る。
          const write = (v: number) => figs.forEach(f => setMask(f, a.mode === 'face'
            ? `radial-gradient(ellipse 30% 12% at 50% 15%, rgba(0,0,0,${(1 - v).toFixed(3)}) 0%, rgba(0,0,0,${(1 - v * 0.75).toFixed(3)}) 55%, #000 100%)`
            : `linear-gradient(rgba(0,0,0,${(1 - v * (1 - a.floor)).toFixed(3)}), rgba(0,0,0,${(1 - v * (1 - a.floor)).toFixed(3)}))`));
          const undo = track(() => figs.forEach((f, i) => setMask(f, prev[i])));
          if (hold) { write(1); return; }
          tween(T(a.in + a.hold + a.out), t => write(env(t, a)), undo);
          return;
        }
        case 'ghost': {
          const fig = figures('hero')[0];
          if (!fig) return;
          const g = fig.cloneNode(true) as HTMLElement;
          g.removeAttribute('data-opg-figure');
          g.setAttribute('data-opg-clone', '');
          g.style.pointerEvents = 'none';
          setMask(g, '');
          const base = getComputedStyle(fig).filter;
          g.style.filter = `${base && base !== 'none' ? base + ' ' : ''}blur(1px) brightness(1.15)`;
          if (a.anchor === 'world') {
            // その場に置き去り(世界座標=カメラと一緒にスクロールする)。撮影用の出しっぱなしだけ少しずらして見せる。
            if (hold) g.style.translate = '14px 0';
            fig.after(g);
          } else {
            // 画面に固定: 寄り続けるカメラの中で「寄る前の大きさと位置」のまま置いていかれる。
            const r = toLocal(fig.getBoundingClientRect());
            Object.assign(g.style, { position: 'absolute', left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px`, transform: 'none', translate: hold ? '10px 0' : '' });
            overlay.appendChild(g);
          }
          g.style.opacity = String(a.op);
          const undo = track(() => g.remove());
          if (hold) return;
          fadeOut(g, a.op, T(a.out), undo);
          return;
        }
        case 'melt': {
          const c = contentRect();
          if (c.w < 10 || c.h < 10) return;
          let cx: number, cy: number, w: number;
          const hero = figures('hero')[0];
          if (a.place === 'feet' && hero) {
            const r = toLocal(hero.getBoundingClientRect());
            w = Math.max(r.w * 2.4, c.w * 0.16);
            cx = r.x + r.w / 2 + a.jx * r.w; cy = r.y + r.h * 0.92;
          } else {
            w = c.w * 0.32; cx = c.x + c.w * (0.5 + a.jx * 0.5); cy = c.y + c.h * 0.86;
          }
          const h = w * 0.45;
          const x = Math.min(c.x + c.w - w, Math.max(c.x, cx - w / 2));
          const y = Math.min(c.y + c.h - h, Math.max(c.y, cy - h / 2));
          const filt = 'blur(7px) saturate(0.45) brightness(1.08)';
          const mask = 'radial-gradient(closest-side, #000 25%, rgba(0,0,0,0.55) 60%, transparent 100%)';
          const blob = addLayer({ left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, backdropFilter: filt, transformOrigin: '50% 0%' });
          blob.style.setProperty('-webkit-backdrop-filter', filt);
          setMask(blob, mask);
          const undo = track(() => blob.remove());
          if (hold) { blob.style.transform = 'translateY(8px) scale(1.12)'; return; }
          // 下へ垂れながら広がり、ease で消える。
          const tot = a.in + a.hold + a.out;
          const an = blob.animate([
            { opacity: 0, transform: 'translateY(0px) scale(1)', offset: 0, easing: EASE_IN },
            { opacity: 1, transform: 'translateY(2px) scale(1.03)', offset: a.in / tot },
            { opacity: 1, transform: `translateY(${Math.round(h * 0.12)}px) scale(1.1)`, offset: (a.in + a.hold) / tot, easing: EASE_OUT },
            { opacity: 0, transform: `translateY(${Math.round(h * 0.4)}px) scale(1.28)`, offset: 1 },
          ], { duration: T(tot), fill: 'forwards' });
          an.onfinish = undo;
          return;
        }
        case 'slice': {
          const cs = cloneScene(false);
          if (!cs) return;
          const { src, el, sync } = cs;
          const c = contentRect();
          // 人物を避けた高さ(above=頭より上/below=足より下)。縁は絵の高さの8%以上ぼかす。
          const figs = figures('all').map(f => toLocal(f.getBoundingClientRect()));
          const top = figs.length ? Math.min(...figs.map(r => r.y)) : c.y + c.h * 0.5;
          const bot = figs.length ? Math.max(...figs.map(r => r.y + r.h)) : c.y + c.h * 0.5;
          const feather = c.h * 0.09, bandH = c.h * 0.14;
          let mid = a.place === 'above' ? c.y + (top - c.y) * a.jy : bot + (c.y + c.h - bot) * a.jy;
          const lo = a.place === 'above' ? c.y : bot, hi = a.place === 'above' ? top : c.y + c.h;
          if (hi - lo < bandH) mid = (a.place === 'above' ? c.y + c.h * 0.85 : c.y + c.h * 0.15); // 余白が無ければ反対側へ
          const sr = toLocal(src.getBoundingClientRect());
          const k = sr.h / Math.max(1, src.offsetHeight);
          const y0 = (mid - bandH / 2 - sr.y) / k, y1 = (mid + bandH / 2 - sr.y) / k, f = feather / k;
          setMask(el, `linear-gradient(to bottom, transparent ${y0 - f}px, #000 ${y0}px, #000 ${y1}px, transparent ${y1 + f}px)`);
          src.after(el);
          sync();
          const undo = track(() => el.remove());
          if (hold) { el.style.translate = `${a.dx}px 0`; return; }
          // 段で跳ばさず、ease で流れて(思い違えて)戻る(思い直す)。
          const an = el.animate(envFrames(a, { translate: '0px 0px' }, { translate: `${a.dx}px 0px` }), { duration: T(a.in + a.hold + a.out), fill: 'forwards' });
          an.onfinish = undo;
          return;
        }
        case 'sceneGhost': {
          // 写し取り(take)と表示(at)を分ける: カットの1コマ前に写し取り、カットの後に重ねる=必ず前のアングル。
          const cs = cloneScene(true);
          if (!cs) return;
          const { src, el, sync } = cs;
          let shown = false;
          const undo = track(() => el.remove());
          const show = (tries: number) => {
            if (shown) return;
            // まだカットが起きていない(同じ場面のまま)なら1コマ待つ(最大6コマ)。暗闇の閃きは同じ場面で良い。
            if (!a.instantOut && target.querySelector('[data-opg-scene]') === src && tries < 6) { later(() => show(tries + 1), FRAME_MS); return; }
            shown = true;
            Object.assign(el.style, { position: 'absolute', inset: '0', opacity: String(a.op) });
            overlay.appendChild(el);
            sync();
            if (hold) return;
            // 唯一の「気づいたら戻っている」: 暗闇の閃きは2コマで瞬時に消す(instantOut)。それ以外は尾を引いて薄れる。
            if (a.instantOut) later(undo, T(a.out));
            else fadeOut(el, a.op, T(a.out), undo);
          };
          later(() => show(0), T(a.at - a.take));
          return;
        }
        case 'red': {
          const c = contentRect();
          const v = addLayer({ left: `${c.x}px`, top: `${c.y}px`, width: `${c.w}px`, height: `${c.h}px`, background: RED_VIGNETTE, opacity: '0' });
          // 矩形の上下の切れ目を柔らかく溶かす(箱に見せない)。
          setMask(v, 'linear-gradient(to bottom, transparent 0%, #000 14%, #000 86%, transparent 100%)');
          const undo = track(() => v.remove());
          if (hold) { v.style.opacity = '1'; return; }
          // 蘇生場面の心拍と同じ鼓動(立ち上がり→引き)。
          const tot = a.in + a.out;
          const an = v.animate([
            { opacity: 0, offset: 0, easing: 'ease-in-out' },
            { opacity: 1, offset: a.in / tot, easing: 'ease-in-out' },
            { opacity: 0, offset: 1 },
          ], { duration: T(tot), fill: 'forwards' });
          an.onfinish = undo;
          return;
        }
      }
    };

    // ── BGM: 音量を ease-in で沈め(遠のく)、長めの ease-out で戻す。音程のよれは山場だけ(rate) ──
    const duck = (b: Beat) => {
      const bg = b.bgm;
      if (!bg) return;
      getBgmRef.current().forEach(au => {
        if (!au || au.paused) return;
        type PitchAudio = HTMLAudioElement & { preservesPitch?: boolean; webkitPreservesPitch?: boolean };
        const v0 = au.volume;
        let written = -1;
        const ours = () => written < 0 || Math.abs(au.volume - written) < 0.002; // 場面側が音量を動かしたら手を引く
        if (bg.rate) { const pa = au as PitchAudio; try { pa.preservesPitch = false; pa.webkitPreservesPitch = false; } catch { /* ignore */ } }
        const restore = track(() => { try { au.playbackRate = 1; } catch { /* ignore */ } if (ours()) { try { au.volume = v0; } catch { /* ignore */ } } });
        tween(T(bg.in + bg.hold + bg.out), t => {
          const e = env(t, bg);
          if (ours()) { try { au.volume = Math.max(0, Math.min(1, v0 * (1 - bg.dip * e))); written = au.volume; } catch { /* ignore */ } }
          if (bg.rate) { try { au.playbackRate = 1 - (1 - bg.rate) * e; } catch { /* ignore */ } }
        }, restore);
      });
    };

    const runBeat = (b: Beat, delay: number) => {
      if (only && only.length && !only.includes(b.name)) return;
      later(() => {
        duck(b);
        b.acts.forEach(a => later(() => run(a, false), T(a.tool === 'sceneGhost' ? a.take : a.at)));
      }, delay);
    };

    const rng = Math.random;
    if (continuous) {
      // 撮影用: 道具の山を出しっぱなし(1.2秒ごとに並べ直す=カットを跨いでも新しい場面に掛け直す)。
      const tools = holdTools && holdTools.length ? holdTools : HOLD_DEFAULT;
      const loopOne = () => {
        cleanups.forEach(fn => fn()); cleanups.clear();
        tools.forEach(k => {
          const e = { in: 1, hold: 1, out: 1 };
          const act: Act | null =
            k === 'cold' ? { tool: 'cold', at: 0, ...e, depth: 0.85 }
            : k === 'drain' ? { tool: 'drain', at: 0, ...e }
            : k === 'face' ? { tool: 'missing', at: 0, ...e, mode: 'face', who: 'hero', floor: 0 }
            : k === 'fade' ? { tool: 'missing', at: 0, ...e, mode: 'fade', who: 'others', floor: 0.15 }
            : k === 'ghost' ? { tool: 'ghost', at: 0, out: 1, who: 'hero', anchor: seg === 'walk' ? 'world' : 'screen', op: 0.55 }
            : k === 'melt' ? { tool: 'melt', at: 0, ...e, place: seg === 'walk' ? 'feet' : 'audience', jx: 0 }
            : k === 'slice' ? { tool: 'slice', at: 0, ...e, dx: 22, place: 'above', jy: 0.5 }
            : k === 'red' ? { tool: 'red', at: 0, in: 1, out: 1 }
            : null;
          if (act) run(act, true);
        });
        later(loopOne, 1200);
      };
      later(loopOne, 600);
    } else if (seg === 'walk') {
      const beats = planWalkBeats(rng);
      const done = new Set<string>();
      let prevLine = walkLineRef.current ?? -1;
      let lastAt = performance.now(), busyUntil = 0, idleWait = planWalkIdleWait(rng), idleCount = 0;
      const fire = (b: Beat, delay: number) => {
        done.add(b.name);
        const now = performance.now();
        busyUntil = now + delay + T(Math.max(beatSpan(b), b.bgm ? b.bgm.in + b.bgm.hold + b.bgm.out : 0)) + 300;
        lastAt = now + delay;
        runBeat(b, delay);
      };
      // 台詞の出入りは OpeningScene が ref に書く。ここは 10Hz で覗くだけ(state も描画も起こさない)。
      // 拍は意図した台詞にだけ重ねる(作曲は utils/openingGlitch.planWalkBeats)。
      const poll = window.setInterval(() => {
        const now = performance.now();
        const line = walkLineRef.current ?? -1;
        if (line !== prevLine) {
          for (const b of beats) {
            if (!b.anchor || done.has(b.name)) continue;
            if (line === b.anchor.line) fire(b, b.at); // 意図した台詞が出た時刻から、決めた遅れで
          }
          prevLine = line;
        }
        // 立ち止まっていても忘れた頃に1回(背景だけ・打ち止め IDLE_MAX 回)。
        if (idleCount < IDLE_MAX && line < 0 && now >= busyUntil && now - lastAt > idleWait) {
          idleCount++;
          fire(planWalkIdleBeat(rng), 0);
          idleWait = planWalkIdleWait(rng);
        }
      }, 100);
      track(() => window.clearInterval(poll));
    } else {
      planArenaBeats(rng, arenaTimes).forEach(b => runBeat(b, b.at));
    }

    return () => {
      ids.forEach(id => window.clearTimeout(id));
      rafs.forEach(id => cancelAnimationFrame(id));
      cleanups.forEach(fn => fn());
      cleanups.clear();
      walkFreezeRef.current = false;
      overlay.querySelectorAll('[data-opg-clone]').forEach(n => n.remove());
      target.querySelectorAll('[data-opg-clone]').forEach(n => n.remove());
    };
  }, [segment, continuous, holdTools, slow, only, targetRef, walkLineRef, walkFreezeRef, arenaTimes]);

  // z-index を付けない: 付けると重なりの単位になり、中の合成(色抜き・持ち上げ)が透明な背景としか混ざらない。
  // DOM の順で場面の入れ物(isolate)より上・スキップ(60)より下に来る。
  return <div ref={overlayRef} aria-hidden data-opglitch="" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }} />;
};

export default OpeningGlitch;
