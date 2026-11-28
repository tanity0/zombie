import React, { useState } from 'react';
import './priceTag.css';

// 値段の札(research/UIUX_PROPOSAL.md P10「値段の赤をやめる」)。強化・開発施設の値段はこれ1本で出す。
// 払える=琥珀 / 払えない=沈んだ灰+「あと ◯G」。赤はこの作品で「カウンター/回避の対象」の色なので値段には使わない。
// 明るさで状態を分ける(色相は琥珀と灰の2つだけ)。数字の書体は所持金・開発資金と同じ数字の役割(.type-num)。
// - 「あと ◯G」は、足りない額が値段そのもの(=所持0)の時は出さない(同じ数が2つ並ぶだけになる)。
// - 値段が変わった時(強化を買って次の段の値段になった等)は、古い数字が上へ抜け、新しい数字が下から転がって座る。
//   描き直しは値段が変わった1回だけ(毎フレームは動かない)。
export const PriceTag: React.FC<{ cost: number; gold: number; className?: string; children?: React.ReactNode }> = ({ cost, gold, className = '', children }) => {
  const short = Math.max(0, cost - gold);
  const [last, setLast] = useState(cost);
  const [from, setFrom] = useState<number | null>(null);
  if (last !== cost) { setLast(cost); setFrom(last); }
  return (
    <span className={`price-tag ${short > 0 ? 'is-short' : 'is-ok'} ${className}`}>
      {short > 0 && short < cost && <span className="price-tag-short">あと {short.toLocaleString()}G</span>}
      <span className="price-tag-v type-num">
        {from !== null && <span key={`o${from}`} className="price-roll-out" aria-hidden onAnimationEnd={() => setFrom(null)}>{from.toLocaleString()}G</span>}
        <span key={`v${cost}`} className={from !== null ? 'price-roll-in' : undefined}>{cost.toLocaleString()}G</span>
      </span>
      {short === 0 && children}
    </span>
  );
};
