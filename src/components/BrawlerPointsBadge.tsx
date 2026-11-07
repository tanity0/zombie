import React from 'react';
import { useGameStore } from '../store/gameStore';
import { brawlerPointCap, BRAWLER_TECHS } from '../utils/brawler';

// ★サブウェポン「格闘」の技ポイント(research/BRAWLER.md §2-5)。近接枠の右下に `7/10` の形(銃の弾数と同じ位置・同じ書式)。
// 購読は数値だけ(ポイント・上限・出なかった時刻)=毎フレーム描き直さない(CLAUDE.md の再描画の規律・§8-2)。
// 数字の色は 2(左の技)と 5(上・下の技)の境で段を変える。ポイント不足の技は数字が震える(社長決定 #8)。
const BrawlerPointsBadge: React.FC = () => {
  const points = useGameStore(s => s.player.brawler?.points ?? 0);
  const cap = useGameStore(s => brawlerPointCap(s.player.subWeaponLevels['brawler'] ?? 1));
  const denyAt = useGameStore(s => s.player.brawler?.denyAt ?? 0);
  const tier = points >= BRAWLER_TECHS.guard.cost ? 2 : points >= BRAWLER_TECHS.kiko.cost ? 1 : 0;
  const color = tier === 2 ? '#fffaf0' : tier === 1 ? '#f1e6c8' : 'rgba(241,230,200,0.5)';
  return (
    <span
      key={denyAt}
      className="absolute bottom-0 right-0.5 text-[9px] font-bold tabular-nums leading-none gt-solid"
      style={{
        color,
        textShadow: tier === 2 ? '0 0 4px rgba(241,230,200,0.85)' : undefined,
        animation: denyAt > 0 ? 'brawler-deny 280ms cubic-bezier(.2,.9,.3,1)' : undefined,
      }}
    >
      {points}<span className="text-[7px] text-white/45">/{cap}</span>
    </span>
  );
};

export default BrawlerPointsBadge;
