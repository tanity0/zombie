import React from 'react';
import { useGameStore } from '../store/gameStore';
import { BRAWLER_FLOW_FADE_MS } from '../utils/brawler';

// ★格闘のヒット数(research/BRAWLER.md §11-4)。同じ流れの当たり数を、2ヒット目から近接枠の左に小さく出す。
// 流れが切れたら 0.8 秒で消える。購読は数値と真偽値だけ(毎フレーム描き直さない=CLAUDE.md の再描画の規律)。
// 見た目は手本(デス・ストランディング2)の HUD の文法: 細い縦の罫・細身の数字・字間を空けた小さな英字・白に近い白金。
const BrawlerHitCount: React.FC = () => {
  const hits = useGameStore(s => s.player.brawler?.flowHits ?? 0);
  const broken = useGameStore(s => (s.player.brawler?.flowBrokenAt ?? 0) > 0);
  const show = hits >= 2;
  return (
    <div
      className="absolute pointer-events-none flex items-center gap-1.5"
      style={{
        right: 'calc(100% + 10px)', top: '50%', transform: 'translateY(-50%)',
        opacity: show && !broken ? 1 : 0,
        // 出る時は速く、消える時は流れが切れてから 0.8 秒かけて沈む(ease-in=最後に速く消える)。
        transition: show && !broken ? 'opacity 90ms ease-out' : `opacity ${BRAWLER_FLOW_FADE_MS}ms cubic-bezier(.55,0,.85,.4)`,
      }}
      aria-hidden
    >
      <span className="block w-px h-7" style={{ background: 'linear-gradient(to bottom, rgba(241,230,200,0), rgba(241,230,200,0.85) 30%, rgba(241,230,200,0.85) 70%, rgba(241,230,200,0))' }} />
      {show && (
        <span
          key={hits}
          className="flex items-baseline gap-1 leading-none tabular-nums"
          style={{
            fontFamily: '"Rajdhani", var(--uf-jp), sans-serif',
            color: '#fbf6ea',
            textShadow: '0 0 6px rgba(241,230,200,0.55), 0 1px 2px rgba(0,0,0,0.9)',
            animation: 'brawler-hit-pop 180ms cubic-bezier(.2,.9,.3,1)',
          }}
        >
          <span className="text-[22px] font-semibold">{hits}</span>
          <span className="text-[9px] font-semibold tracking-[0.22em] text-white/70">HIT</span>
        </span>
      )}
    </div>
  );
};

export default BrawlerHitCount;
