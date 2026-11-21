// 熟練度の段階の札(research/MASTERY.md §6-3)。装備メニューと一時停止の画面で使い回す。
// 値は呼ぶ側が1回読んで渡す(この部品は store も保存も読まない=再描画を増やさない)。
// 色: 途中は白系、MAX だけ熟練の金(MASTERY_GOLD=全画面で1つ)。
import React from 'react';
import { MASTERY_GOLD, masteryLevelLabel, type MasteryBadge as MasteryBadgeValue } from '../utils/masteryView';

/** 段階の札(`Lv n` / `MAX`)。MAX だけ金。 */
export const MasteryTag: React.FC<{ badge: MasteryBadgeValue | null | undefined; className?: string }> = ({ badge, className = '' }) => {
  if (!badge) return null;
  return (
    <span
      className={`shrink-0 whitespace-nowrap text-[10px] tabular-nums tracking-[0.08em] ${badge.max ? 'font-semibold' : 'text-white/45'} ${className}`}
      style={badge.max ? { color: MASTERY_GOLD } : undefined}
    >
      {masteryLevelLabel(badge.level)}
    </span>
  );
};

/**
 * 次の段階までの細い棒(動かない・今の値)。途中は白系、育って MAX になった物は金で満ちる。
 * 「最初から最大」の物(`fixed`)は札だけで棒は出さない。
 */
export const MasteryMeter: React.FC<{ badge: MasteryBadgeValue | null | undefined; className?: string }> = ({ badge, className = '' }) => {
  if (!badge || badge.fixed) return null;
  const frac = badge.max ? 1 : Math.max(0, Math.min(1, badge.frac));
  return (
    <span aria-hidden className={`block h-[2px] w-full bg-white/10 ${className}`}>
      <span
        className={`block h-full ${badge.max ? '' : 'bg-white/45'}`}
        style={{ width: `${frac * 100}%`, ...(badge.max ? { background: MASTERY_GOLD } : {}) }}
      />
    </span>
  );
};
