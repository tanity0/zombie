// 一時停止画面の「出現したボス」一覧(社長指示2026-11-09)。出撃前の一覧(旧 SortieBossBrief)から札の見せ方を引き継いだ部品。
// 描くだけ: 並び・「出会った」の判定は utils/sortieBossRoster.ts と utils/bossAppearances.ts(開いた時に1回読んだ値を渡す)。
import React from 'react';
import { enemyDeathLabel } from '../store/gameStore';
import { bossIconSrc } from '../utils/bossIcon';
import type { SortieBoss } from '../utils/sortieBossRoster';

/** 一覧の中では「(変異)」「(変異体)」を外す(並べると同じ語の連打になる)。 */
const shortName = (b: SortieBoss): string =>
  (b.label ?? enemyDeathLabel(b.bossType)).replace(/[(（]変異体?[)）]$/, '');

const JP_FONT: React.CSSProperties = { fontFamily: 'var(--uf-jp), sans-serif' };
const SIZE = 44;

// 出会ったことがあれば絵と名前、無ければ「?」(出撃前の札と同じ見せ方)。
const Tile: React.FC<{ b: SortieBoss }> = ({ b }) => {
  const icon = b.known ? bossIconSrc(b.bossType, b.iconStageId) : null;
  return (
    <div className="min-w-0 text-center" style={{ width: SIZE + 14 }} data-testid="pause-boss-tile" data-known={b.known ? '1' : '0'}>
      <div
        className={`mx-auto flex items-end justify-center overflow-hidden border ${b.known ? 'border-purple-200/30 bg-purple-400/[0.08]' : 'border-white/[0.09]'}`}
        style={{
          width: SIZE, height: SIZE,
          ...(b.known ? {} : { background: 'radial-gradient(circle at 50% 62%, rgba(120,70,170,0.10), rgba(0,0,0,0.35) 72%)', boxShadow: 'inset 0 0 14px rgba(0,0,0,0.9)' }),
        }}
      >
        {icon
          ? <img src={icon} alt="" draggable={false} className="object-contain" style={{ maxHeight: SIZE - 4, maxWidth: SIZE - 4, imageRendering: 'pixelated' }} />
          : <span className="flex h-full w-full items-center justify-center font-bold text-white/30" style={{ fontSize: Math.round(SIZE * 0.4) }}>?</span>}
      </div>
      <div className="mt-1 flex h-4 items-center justify-center">
        {b.known
          ? <span className="truncate text-[10px] font-semibold tracking-tight text-white/85" style={JP_FONT}>{shortName(b)}</span>
          : <span className="block h-px w-5 bg-white/20" />}
      </div>
    </div>
  );
};

export const PauseBossRoster: React.FC<{ roster: readonly SortieBoss[] }> = ({ roster }) => {
  if (roster.length === 0) return null;
  return (
    <div data-testid="pause-boss-roster">
      <div className="mb-1 tracking-[0.16em] text-white/35">出現したボス</div>
      <div className="flex flex-wrap gap-x-1 gap-y-1.5">
        {roster.map(b => <Tile key={b.encounterKey} b={b} />)}
      </div>
    </div>
  );
};

export default PauseBossRoster;
