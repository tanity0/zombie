import { useLayoutEffect, useRef } from 'react';
import {
  COMMS_CONTINUE_MS, COMMS_CONTINUE_PX, COMMS_EXIT_EASING, COMMS_EXIT_MS, COMMS_EXIT_RISE_PX, COMMS_MOVE_EASING,
  COMMS_OVERSHOOT_AT, COMMS_OVERSHOOT_PX, COMMS_RISE_PX, COMMS_SLOW_FADE_MS,
  commsEntranceKind, commsEntranceOffsetPx, commsEntranceSideShiftPx, commsEntranceTiming, type CommsEntranceKind,
} from '../utils/commsEntrance';

/*
 * 台詞の箱の「入り」と「消え」の共通部品(社長指示2026-11-17「中段くらいから箱ごと、フェードインさせる。一旦全部」→「そもそも全部」)。
 * HUD の会話(NpcDialogue)・出撃時の登場セリフ・オープニングの歩き会話と蘇生処置の字幕・エンディングの聴取記録が同じ動きを使う。
 * どの入り方かの判定は utils/commsEntrance(純関数)。ここは要素に Web Animations で transform/opacity を掛けるだけ
 * (React は毎フレーム描き直さない・レイアウトも動かさない)。
 */

/** 拡大(--hud-s)の中でも画面の座標で測った量を、要素の座標へ戻す倍率。 */
const elScale = (el: HTMLElement, r: DOMRect): number => (el.offsetHeight > 0 && r.height > 0 ? r.height / el.offsetHeight : 1);

/**
 * 入りを要素に掛ける。
 * - fly: 枠(frameEl)の中段・中心寄りから斜めに定位置へ。着地で少し行き過ぎて戻る。不透明度は別の時計で先に上がる。
 * - rise: 定位置の少し下からせり上がる(中段から落とすと主要な絵を跨ぐ箱・定位置が中段にある箱)。
 * - continue: 同じ話者の続き。定位置の少し下から短く。 / fade: ゆっくり話す行の続き。移動なし。
 * ゆっくり話す行(slow)の fly / rise は尺だけ長い。出発点は描く前(useLayoutEffect)に呼べば、一瞬定位置に見えてから跳ぶことは無い。
 */
export const playCommsEntrance = (
  el: HTMLElement, kind: CommsEntranceKind, opts: { slow?: boolean; frameEl?: HTMLElement | null } = {},
): Animation[] => {
  if (typeof el.animate !== 'function') return [];
  const { moveMs, fadeMs } = commsEntranceTiming(!!opts.slow);
  const r = el.getBoundingClientRect();
  const scale = elScale(el, r);
  const px = (v: number) => (v / scale).toFixed(1);
  const anims: Animation[] = [];
  if (kind === 'fly') {
    const f = (opts.frameEl ?? document.documentElement).getBoundingClientRect();
    const dy = commsEntranceOffsetPx(f.top, f.height, r.top);
    const dx = commsEntranceSideShiftPx(r.left + r.width / 2, f.left + f.width / 2);
    const over = dy > 0 ? -COMMS_OVERSHOOT_PX : COMMS_OVERSHOOT_PX; // 進む向きへ行き過ぎる
    anims.push(el.animate([
      { transform: `translate(${px(dx)}px, ${px(dy)}px)`, offset: 0, easing: COMMS_MOVE_EASING },
      { transform: `translate(0px, ${px(over)}px)`, offset: COMMS_OVERSHOOT_AT, easing: 'ease-in-out' },
      { transform: 'translate(0px, 0px)', offset: 1 },
    ], { duration: moveMs }));
    anims.push(el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: fadeMs, easing: 'ease-out' }));
  } else if (kind === 'rise') {
    anims.push(el.animate([
      { transform: `translateY(${px(COMMS_RISE_PX)}px)` },
      { transform: 'translateY(0px)' },
    ], { duration: moveMs, easing: COMMS_MOVE_EASING }));
    anims.push(el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: fadeMs, easing: 'ease-out' }));
  } else if (kind === 'continue') {
    anims.push(el.animate([
      { transform: `translateY(${px(COMMS_CONTINUE_PX)}px)`, opacity: 0 },
      { transform: 'translateY(0px)', opacity: 1 },
    ], { duration: COMMS_CONTINUE_MS, easing: 'ease-out' }));
  } else {
    anims.push(el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: COMMS_SLOW_FADE_MS, easing: 'ease-out' }));
  }
  return anims;
};

/** 消えを要素に掛ける。消滅にも慣性(慣性MUST): ゆっくり動き出して上へ少し流れながら薄れる。 */
export const playCommsExit = (el: HTMLElement): Animation | null => {
  if (typeof el.animate !== 'function') return null;
  const scale = elScale(el, el.getBoundingClientRect());
  return el.animate([
    { transform: 'translateY(0px)', opacity: 1 },
    { transform: `translateY(${(-COMMS_EXIT_RISE_PX / scale).toFixed(1)}px)`, opacity: 0 },
  ], { duration: COMMS_EXIT_MS, easing: COMMS_EXIT_EASING, fill: 'forwards' });
};

/**
 * 行が替わるたびに入りを掛けるフック。lineKey=今の行の識別(null=箱が出ていない)。
 * 行が出たまま次の行へ替わった時は「消えて0ms」とみなす(同じ話者なら続き、話者が替われば最初の1行の扱い)。
 * mode: 'fly'=定位置が中段より上の箱(中段から飛び込む) / 'rise'=定位置が中段か下の箱(せり上がる)。
 */
export const useCommsLineEntrance = (
  getEl: () => HTMLElement | null,
  lineKey: string | number | null,
  speaker: string,
  opts: { mode: 'fly' | 'rise'; slow?: boolean; getFrame?: () => HTMLElement | null },
) => {
  const prevKeyRef = useRef<string | number | null>(null);
  const lastSpeakerRef = useRef<string | null>(null);
  const hiddenAtRef = useRef(-Infinity);
  const lastKindRef = useRef<{ key: string | number; kind: CommsEntranceKind } | null>(null);
  useLayoutEffect(() => {
    const prevKey = prevKeyRef.current;
    prevKeyRef.current = lineKey;
    if (lineKey === null) {
      if (prevKey !== null) hiddenAtRef.current = performance.now();
      return;
    }
    let kind: CommsEntranceKind;
    if (lastKindRef.current && lastKindRef.current.key === lineKey && prevKey === lineKey) {
      kind = lastKindRef.current.kind; // 開発時の effect の二度掛け=同じ行をもう一度(判定し直さない)
    } else {
      const since = prevKey !== null ? 0 : performance.now() - hiddenAtRef.current;
      kind = commsEntranceKind(since, lastSpeakerRef.current, speaker, !!opts.slow, opts.mode === 'rise');
      lastSpeakerRef.current = speaker;
      lastKindRef.current = { key: lineKey, kind };
    }
    const el = getEl();
    if (!el) return;
    const anims = playCommsEntrance(el, kind, { slow: opts.slow, frameEl: opts.getFrame?.() ?? null });
    return () => { for (const a of anims) a.cancel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 行が替わった時だけ
  }, [lineKey]);
};
