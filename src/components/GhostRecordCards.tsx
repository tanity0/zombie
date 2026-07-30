// BOT_AND_GHOST.md §2.13(リザルト年表)/§2.14(独立メニュー「守護霊」)/§2.15(同行守護霊カード)の
// **共通の表示部品**。リザルト(GameOverScreen)と討伐記録一覧(MissionSelect)が同じ部品を使う
// (§2.16 B「カードUIは討伐記録一覧にそのまま流用する(同部品)」=同じ絵を2箇所に書かない)。
//
// 掟:
// - **描くだけ**。保存・決算・ゲーム挙動には一切触らない(採用チェックの状態は呼び出し側が持つ)。
// - store購読を持たない純表示コンポーネント=毎フレーム再描画しない(CLAUDE.md React再描画規律)。
// - 文言・レイアウト・並びは**叩き台**(実機で社長調整前提)。数値の意味は台帳(playerTraits)のまま。
import React from 'react';
import type { BossClearCard, ClearTrend } from '../utils/ghostAlbum';
import { formatClearTime, formatPerMin, formatRatePercent, trendHigherBetter, trendLowerBetter } from '../utils/ghostAlbum';
import type { GhostAllySnapshot } from '../utils/playerBuild';
import { bossIconSrc } from '../utils/bossIcon';
import { enemyDeathLabel, subWeaponDisplayName } from '../store/gameStore';
import { weaponDisplayName } from '../utils/weaponUtils';
import { equipmentById } from '../data/equipment';
import { CHARACTER_CLASSES, SKILLS, getStage } from '../data/campaign';
import type { EquipSlot, SkillKey, SubWeaponKey } from '../types/game';

// 良化/悪化の色と記号(色だけに依存しない=記号も併記する。STORY_UI_SPEC.mdの実装原則と同じ流儀)。
const TREND_STYLE: Record<ClearTrend, { cls: string; mark: string }> = {
  better: { cls: 'text-emerald-300', mark: '▲' },
  worse: { cls: 'text-rose-300', mark: '▼' },
  same: { cls: 'text-white/50', mark: '=' },
  first: { cls: 'text-amber-200', mark: '★' },
};

/** カードの見出し(ボスの呼び名)。giantbatはステージ別スロットなので場所名で見分ける。 */
const bossCardLabel = (card: Pick<BossClearCard, 'bossType' | 'stageId'>): string => {
  if (card.bossType === 'giantbat') {
    return getStage(card.stageId ?? '')?.locationTitle ?? 'ストーリーボス';
  }
  return enemyDeathLabel(card.bossType);
};

/** 比較行(今回 vs 現在の記録)。best が無い(初記録/一覧表示)ときは今回の値だけを出す。 */
const MetricRow: React.FC<{
  label: string; value: string; best?: string | null; trend: ClearTrend;
}> = ({ label, value, best, trend }) => {
  const t = TREND_STYLE[trend];
  return (
    <div className="flex items-baseline justify-between gap-2 text-[11px] tabular-nums">
      <span className="text-white/45">{label}</span>
      <span className="flex items-baseline gap-1.5">
        <span className="font-semibold text-white/90">{value}</span>
        {best != null && (
          <span className={`text-[10px] ${t.cls}`}>{t.mark}<span className="text-white/40"> 記録 {best}</span></span>
        )}
      </span>
    </div>
  );
};

/**
 * 撃破1件のカード(年表の1コマ)。
 * - `checked` を渡した時だけ「守護霊へ採用」チェックを出す(リザルト・既定ONは呼び出し側)。
 * - `onAllyTap` を渡した時だけ同行者の**名前をタップ**できる(討伐記録一覧→ビルドのポップアップ)。
 * - `allyFull` を渡すと同行者のフルカードをこのカードの下に出す(リザルト用途)。
 */
export const BossClearCardRow: React.FC<{
  card: BossClearCard;
  checked?: boolean;
  onToggle?: (slotKey: string, next: boolean) => void;
  onAllyTap?: (ally: GhostAllySnapshot) => void;
}> = ({ card, checked, onToggle, onAllyTap }) => {
  const icon = bossIconSrc(card.bossType, card.stageId);
  return (
    <div className="rounded-none bg-black/25 px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        <div className="h-10 w-10 shrink-0 overflow-hidden bg-purple-400/10 flex items-center justify-center">
          {icon
            ? <img src={icon} alt="" draggable={false} className="h-full w-full object-contain" />
            : <span className="text-base">☠</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-semibold text-white/90">{bossCardLabel(card)}</span>
            {card.isRecordUpdate && card.best !== null && (
              <span className="shrink-0 rounded-full bg-amber-400/25 px-1.5 py-0.5 text-[9px] font-bold tracking-widest text-amber-100">記録更新</span>
            )}
            {card.best === null && card.isRecordUpdate && (
              <span className="shrink-0 rounded-full bg-amber-400/25 px-1.5 py-0.5 text-[9px] font-bold tracking-widest text-amber-100">初記録</span>
            )}
          </div>
          <div className="text-[10px] text-white/40">討伐タイム {formatClearTime(card.clearTimeMs)}</div>
        </div>
        {checked !== undefined && onToggle && (
          <label className="flex shrink-0 cursor-pointer select-none items-center gap-1.5 text-[10px] text-white/60">
            <input
              type="checkbox"
              checked={checked}
              onChange={e => onToggle(card.slotKey, e.target.checked)}
              className="h-4 w-4 accent-sky-400"
            />
            採用
          </label>
        )}
      </div>
      <div className="mt-2 space-y-1 border-t border-white/10 pt-2">
        <MetricRow
          label="撃破タイム" value={formatClearTime(card.clearTimeMs)}
          best={card.best ? formatClearTime(card.best.clearTimeMs) : null}
          trend={card.best ? trendLowerBetter(card.clearTimeMs, card.best.clearTimeMs) : 'first'}
        />
        <MetricRow
          label="被弾/分" value={formatPerMin(card.hitsPerMin)}
          best={card.best ? formatPerMin(card.best.hitsPerMin) : null}
          trend={card.best ? trendLowerBetter(card.hitsPerMin, card.best.hitsPerMin) : 'first'}
        />
        <MetricRow
          label="カウンター成功率" value={formatRatePercent(card.counterChance)}
          best={card.best ? formatRatePercent(card.best.counterChance) : null}
          trend={card.best ? trendHigherBetter(card.counterChance, card.best.counterChance) : 'first'}
        />
      </div>
      {/* §2.15 置き場所の訂正: 討伐記録では**同行者の名前だけ**。タップでビルドのポップアップ。 */}
      {card.ally && onAllyTap && (
        <button
          type="button"
          onClick={() => onAllyTap(card.ally!)}
          className="mt-2 w-full rounded-none bg-sky-400/10 px-2 py-1.5 text-left text-[11px] text-sky-100/90 active:bg-sky-400/20"
        >
          同行 <span className="font-semibold">{card.ally.name}</span>
          <span className="ml-1 text-[10px] text-white/40">（タップでビルド）</span>
        </button>
      )}
    </div>
  );
};

/** 撃破順のアイコン帯(年表の背骨)。左から撃破順に並べる。 */
export const BossClearStrip: React.FC<{ cards: BossClearCard[] }> = ({ cards }) => (
  <div className="flex items-center gap-1.5 overflow-x-auto overscroll-contain py-1">
    {cards.map((c, i) => {
      const icon = bossIconSrc(c.bossType, c.stageId);
      return (
        <React.Fragment key={c.slotKey}>
          {i > 0 && <span aria-hidden className="shrink-0 text-[10px] text-white/25">›</span>}
          <div className="h-9 w-9 shrink-0 overflow-hidden bg-purple-400/10 flex items-center justify-center" title={bossCardLabel(c)}>
            {icon
              ? <img src={icon} alt={bossCardLabel(c)} draggable={false} className="h-full w-full object-contain" />
              : <span className="text-[13px]">☠</span>}
          </div>
        </React.Fragment>
      );
    })}
  </div>
);

const StatCell: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="min-w-0">
    <div className="truncate text-[9px] tracking-wide text-white/45">{label}</div>
    <div className="truncate text-[12px] font-semibold tabular-nums text-white/90">{value}</div>
  </div>
);

const TagList: React.FC<{ label: string; items: string[] }> = ({ label, items }) => (
  <div className="flex items-start gap-2 text-[11px]">
    <span className="w-14 shrink-0 text-white/45">{label}</span>
    <span className="min-w-0 flex-1 text-white/80">{items.length ? items.join('・') : '—'}</span>
  </div>
);

/**
 * 同行守護霊のフルカード(§2.15): 持ち主の名前+ビルド(武器/サブ/スキル/装備)+ステータス。
 * **いいねボタンは置かない**(オンライン基盤と同時=死にボタン回避の裁定・§2.16 B)。
 * ビルド写しが無い(旧プロファイル由来)場合は名前だけを出す。
 */
export const GhostAllyCard: React.FC<{ ally: GhostAllySnapshot }> = ({ ally }) => {
  const b = ally.build;
  const className = CHARACTER_CLASSES.find(c => c.id === (b?.characterClass ?? ally.className))?.name;
  const skills = (b?.skills ?? []).map((k: SkillKey) => {
    const lv = b?.skillLevels?.[k];
    return `${SKILLS[k]?.name ?? k}${lv && lv > 1 ? ` Lv${lv}` : ''}`;
  });
  const subs = (b?.subWeapons ?? []).map((k: SubWeaponKey) => {
    const lv = b?.subWeaponLevels?.[k];
    return `${subWeaponDisplayName(k)}${lv && lv > 1 ? ` Lv${lv}` : ''}`;
  });
  const equips = (['body', 'arms', 'accessory'] as EquipSlot[])
    .map(slot => b?.equipment?.[slot])
    .filter((id): id is string => !!id)
    .map(id => equipmentById(id)?.name ?? id);
  const guns = (b?.gunKeys ?? []).map(k => weaponDisplayName(k));
  return (
    <div className="rounded-none bg-sky-400/5 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-sky-200/70">同行した守護霊</span>
        {ally.isOwn && <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] text-white/60">自分</span>}
      </div>
      <div className="mt-0.5 text-[15px] font-semibold text-sky-100">{ally.name}</div>
      {className && <div className="text-[10px] text-white/45">{className}</div>}
      {b ? (
        <>
          <div className="mt-2 grid grid-cols-4 gap-x-2 gap-y-1.5 border-t border-white/10 pt-2">
            <StatCell label="最大HP" value={String(Math.round(b.maxHealth))} />
            <StatCell label="速度" value={b.speed.toFixed(1)} />
            <StatCell label="Lv" value={String(b.level)} />
            <StatCell label="クリ率" value={formatRatePercent(b.critChance ?? null)} />
          </div>
          <div className="mt-2 space-y-1 border-t border-white/10 pt-2">
            <TagList label="銃" items={guns} />
            <TagList label="近接" items={b.meleeKey ? [weaponDisplayName(b.meleeKey)] : []} />
            <TagList label="サブ" items={subs} />
            <TagList label="スキル" items={skills} />
            <TagList label="装備" items={equips} />
          </div>
        </>
      ) : (
        <p className="mt-2 text-[11px] text-white/45">この守護霊の記録にはビルドが残っていません（古い記録）。</p>
      )}
    </div>
  );
};
