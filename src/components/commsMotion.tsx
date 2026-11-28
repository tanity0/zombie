import React, { useLayoutEffect, useRef, useState } from 'react';
import { playCommsExit, useCommsLineEntrance } from './commsMotionAnim';

type BoxPos = { left: number; top: number; width: number; height: number };
type Ghost = { id: number; node: React.ReactNode; pos: BoxPos | null };

/**
 * 台詞の箱を包む入れ物。行が替わると入り、lineKey が null になると最後の行を残したまま消えの動きを見せてから外れる
 * (消え始める時刻=呼び手が行を外した時刻は変えない)。消え切ったら onGone。
 * 出たまま次の行へ替わる時(行送り等)は、前の行を同じ場所に「影」として残して消えの動きを掛けつつ、新しい行を入れる
 * (重ねて切り替える=1コマで消えて入り直さない・社長指示2026-11-17の監査是正)。同じ話者の続きでも影は付ける。
 * children は今の行の中身(lineKey が null の時は使わない)。
 */
export const CommsLine = ({ lineKey, speaker, mode, slow, getFrame, onGone, className, style, children }: {
  lineKey: string | number | null;
  speaker: string;
  mode: 'fly' | 'rise';
  slow?: boolean;
  getFrame?: () => HTMLElement | null;
  onGone?: () => void;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const lastNodeRef = useRef<React.ReactNode>(null);
  // 直前の描画での箱の場所(入れ物の中の座標・transform を含まない)。影を同じ場所に置くのに使う。
  const lastPosRef = useRef<BoxPos | null>(null);
  const ghostSeqRef = useRef(0);
  const [prevKey, setPrevKey] = useState<string | number | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  if (prevKey !== lineKey) {
    setPrevKey(lineKey);
    setLeaving(lineKey === null && prevKey !== null);
    if (prevKey !== null && lineKey !== null) {
      ghostSeqRef.current += 1;
      setGhost({ id: ghostSeqRef.current, node: lastNodeRef.current, pos: lastPosRef.current });
    }
  }
  // 最後に描いた行の中身は描き終えてから覚える(描画中に書くと、開発時の二度描きで影が新しい行になる)。
  useLayoutEffect(() => { if (lineKey !== null) lastNodeRef.current = children; });
  useCommsLineEntrance(() => ref.current, lineKey, speaker, { mode, slow, getFrame });
  useLayoutEffect(() => {
    const el = ref.current;
    lastPosRef.current = el ? { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight } : null;
  });
  const onGoneRef = useRef(onGone);
  useLayoutEffect(() => { onGoneRef.current = onGone; });
  useLayoutEffect(() => {
    if (!leaving) return;
    const el = ref.current;
    const a = el ? playCommsExit(el) : null;
    if (!a) { setLeaving(false); onGoneRef.current?.(); return; }
    a.onfinish = () => { setLeaving(false); onGoneRef.current?.(); };
    return () => { a.onfinish = null; a.cancel(); };
  }, [leaving]);
  const ghostId = ghost?.id ?? 0;
  useLayoutEffect(() => {
    if (!ghostId) return;
    const el = ghostRef.current;
    const a = el ? playCommsExit(el) : null;
    if (!a) { setGhost(null); return; }
    a.onfinish = () => setGhost(g => (g && g.id === ghostId ? null : g));
    return () => { a.onfinish = null; a.cancel(); };
  }, [ghostId]);
  if (lineKey === null && !leaving) return null;
  return (
    <>
      {ghost && ghost.pos && (
        // 影=前の行。新しい行の後ろ・同じ場所に重ね、上へ少し流れながら薄れて外れる。押下は受けない。
        <div
          key={ghost.id}
          ref={ghostRef}
          aria-hidden
          className={className}
          style={{
            ...style,
            position: 'absolute', left: ghost.pos.left, top: ghost.pos.top, width: ghost.pos.width, height: ghost.pos.height,
            right: 'auto', bottom: 'auto', margin: 0, maxWidth: 'none', pointerEvents: 'none',
          }}
        >
          {ghost.node}
        </div>
      )}
      <div ref={ref} className={className} style={style}>{lineKey !== null ? children : lastNodeRef.current}</div>
    </>
  );
};
