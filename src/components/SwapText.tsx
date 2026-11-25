// 字の入れ替え(作戦室の地図で選び直した時の場所名・札・出撃の帯の任務名・SECTOR の札)。
// 前の字は少し上へずれながら薄れて消え、新しい字は下から少しずれながら入る(index.css .ds-swap)。
// 同じ升目(grid の 1/1)に重ねる=入れ替わりの間も幅・行が跳ねない。最初の表示は動かさない(画面の入りの動きに任せる)。
// 動きは押した時だけ=毎フレームの再描画なし。
import React, { useEffect, useRef, useState } from 'react';

const OUT_MS = 160;

export const SwapText: React.FC<{ value: string; className?: string; delayMs?: number }> = ({ value, className, delayMs = 0 }) => {
  const seq = useRef(0);
  const [items, setItems] = useState<readonly { v: string; n: number; leaving: boolean; fresh: boolean }[]>(() => [{ v: value, n: 0, leaving: false, fresh: false }]);
  useEffect(() => {
    setItems(prev => {
      const cur = prev.find(i => !i.leaving);
      if (cur && cur.v === value) return prev;
      return [...prev.filter(i => !i.leaving).map(i => ({ ...i, leaving: true })), { v: value, n: ++seq.current, leaving: false, fresh: true }];
    });
  }, [value]);
  useEffect(() => {
    if (!items.some(i => i.leaving)) return;
    const id = window.setTimeout(() => setItems(prev => prev.filter(i => !i.leaving)), OUT_MS + delayMs);
    return () => window.clearTimeout(id);
  }, [items, delayMs]);
  return (
    <span className={`ds-swap${className ? ` ${className}` : ''}`}>
      {items.map(i => (
        <span key={i.n} className={`ds-swap-i${i.leaving ? ' is-out' : i.fresh ? ' is-in' : ''}`} aria-hidden={i.leaving || undefined}
          style={delayMs ? { animationDelay: i.leaving ? `${delayMs}ms` : `${delayMs + OUT_MS * 0.6}ms` } : undefined}>{i.v}</span>
      ))}
    </span>
  );
};

export default SwapText;
