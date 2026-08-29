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
import { formatClearTime, formatPerMin, formatPerfScore, formatRatePercent, trendHigherBetter, trendLowerBetter } from '../utils/ghostAlbum';
import type { GhostAllySnapshot } from '../utils/playerBuild';
import { bossIconSrc } from '../utils/bossIcon';
import { enemyDeathLabel, subWeaponDisplayName } from '../store/gameStore';
import { bossCutinName } from '../data/bossCutin';
import { weaponDisplayName } from '../utils/weaponUtils';
import { equipmentById } from '../data/equipment';
import { CHARACTER_CLASSES, SKILLS } from '../data/campaign';
import { fixedGuardianLeadersForBoss } from '../data/fixedGuardians';
import type { EquipSlot, SkillKey, SubWeaponKey } from '../types/game';
import { fixedGhostStatKey, type FixedGhostStat } from '../utils/ghostOnline';

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
    // 監査指摘5: 城ボスの呼び名はカットイン/ボスモードと同じ台帳を第一候補に。台帳に無い枠は「?」。
    return bossCutinName('giantbat', card.stageId) ?? '?';
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
 * 同行者の行(名前+任意でクラス絵)。§2.15/§2.17の共通部品。
 * - `withClassIcon`(同行枠=§2.17)でクラス絵(CHARACTER_CLASSESのスプライト)を名前の左に出す。
 * - `onAllyTap` があればタップでビルドのポップアップ(討伐記録一覧)、無ければ静的表示(リザルト)。
 *   見た目(色・余白・文言)は従来のタップ行と同一=既存部品の流用で新UIを発明しない。
 */
const AllyLine: React.FC<{
  ally: GhostAllySnapshot;
  withClassIcon: boolean;
  onAllyTap?: (ally: GhostAllySnapshot) => void;
}> = ({ ally, withClassIcon, onAllyTap }) => {
  const cls = withClassIcon
    ? CHARACTER_CLASSES.find(c => c.id === (ally.className ?? ally.build?.characterClass))
    : undefined;
  const content = (
    <span className="flex items-center gap-1.5">
      {cls && (
        <span className="flex h-6 w-6 shrink-0 items-end justify-center overflow-hidden bg-sky-400/15">
          <img
            src={cls.sprite}
            alt={cls.name}
            draggable={false}
            className="max-h-5 object-contain"
            style={{ imageRendering: 'pixelated' }}
          />
        </span>
      )}
      <span className="min-w-0 truncate">
        同行 <span className="font-semibold">{ally.name}</span>
        {onAllyTap && <span className="ml-1 text-[10px] text-white/40">（タップでビルド）</span>}
      </span>
    </span>
  );
  const rowClass = 'mt-2 w-full rounded-none bg-sky-400/10 px-2 py-1.5 text-left text-[11px] text-sky-100/90';
  return onAllyTap ? (
    <button type="button" onClick={() => onAllyTap(ally)} className={`${rowClass} active:bg-sky-400/20`}>
      {content}
    </button>
  ) : (
    <div className={rowClass}>{content}</div>
  );
};

/** 守護霊部屋専用: このボスへ割り当てた固定AI上位4人。固定データなのでstore購読・通信なし。 */
const FixedAiLeaders: React.FC<{
  slotKey: string;
  stats?: Record<string, FixedGhostStat>;
}> = ({ slotKey, stats }) => {
  const leaders = fixedGuardianLeadersForBoss(slotKey);
  return (
    <div className="mt-2 border-t border-white/10 pt-2">
      <div className="mb-1.5 text-[9px] font-semibold tracking-widest text-purple-200/55">AIデータ 上位4人</div>
      <div className="grid grid-cols-4 gap-1.5">
        {leaders.map((guardian, index) => {
          const character = CHARACTER_CLASSES.find(item => item.id === guardian.classId);
          const feedback = stats?.[fixedGhostStatKey(slotKey, guardian.id)];
          return (
            <div key={guardian.id} className="min-w-0 bg-purple-400/[0.07] px-1 py-1.5 text-center">
              <div className="relative mx-auto flex h-8 w-8 items-end justify-center overflow-hidden bg-black/20">
                <span className="absolute left-0 top-0 z-10 bg-purple-300/20 px-1 text-[8px] font-bold text-purple-100">{index + 1}</span>
                {character
                  ? <img src={character.sprite} alt={guardian.name} draggable={false} className="max-h-7 object-contain" style={{ imageRendering: 'pixelated' }} />
                  : <span className="pb-1 text-sm">◇</span>}
              </div>
              <div className="mt-1 truncate text-[9px] font-semibold text-white/80">{guardian.name}</div>
              <div className="text-[9px] tabular-nums text-amber-200/90">評点 {Math.round(guardian.performance.score)}</div>
              <div className="mt-0.5 text-[8px] tabular-nums text-pink-100/65">
                同行 {(feedback?.used ?? 0).toLocaleString()}・♥ {(feedback?.likes ?? 0).toLocaleString()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * 撃破1件のカード(年表の1コマ)。
 * - `checked` を渡した時だけ「守護霊へ採用」チェックを出す(リザルト・既定ONは呼び出し側)。
 * - `onAllyTap` を渡した時だけ同行者の**名前をタップ**できる(討伐記録一覧→ビルドのポップアップ)。
 * - `allyFull` を渡すと同行者のフルカードをこのカードの下に出す(リザルト用途)。
 * - `duo`(§2.17 同行枠): 評価数値(被弾/分・カウンター成功率)は計測由来のため**行ごと出さない**
 *   (撃破タイムのみ)。同行者は名前+クラス絵で常に表示(onAllyTapが無くても出す)。採用チェックは
 *   呼び出し側が渡さない(写し不可)前提。
 */
export const BossClearCardRow: React.FC<{
  card: BossClearCard;
  checked?: boolean;
  onToggle?: (slotKey: string, next: boolean) => void;
  onAllyTap?: (ally: GhostAllySnapshot) => void;
  duo?: boolean;
  showFixedAiLeaders?: boolean;
  fixedGhostStats?: Record<string, FixedGhostStat>;
}> = ({ card, checked, onToggle, onAllyTap, duo, showFixedAiLeaders, fixedGhostStats }) => {
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
            {card.isStale && (
              <span className="shrink-0 rounded-full bg-sky-400/20 px-1.5 py-0.5 text-[9px] font-bold text-sky-100">古い記録</span>
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
      {showFixedAiLeaders && <FixedAiLeaders slotKey={card.slotKey} stats={fixedGhostStats} />}
      <div className="mt-2 space-y-1 border-t border-white/10 pt-2">
        <MetricRow
          label="撃破タイム" value={formatClearTime(card.clearTimeMs)}
          best={card.best ? formatClearTime(card.best.clearTimeMs) : null}
          trend={card.best ? trendLowerBetter(card.clearTimeMs, card.best.clearTimeMs) : 'first'}
        />
        {/* §2.17: 同行枠(duo)は挙動計測をしないので評価数値の行自体を出さない(「—」も出さない)。 */}
        {!duo && (
          <>
            {/* v0.25.2606(社長指示): **AIが使うデータの評点**。討伐記録一覧では「このボスのデータは
                良いか/そもそも有るか」の判断材料になる(過去のベストではなく、今入っているデータの点)。 */}
            <MetricRow
              label="評点" value={formatPerfScore(card.perfScore)}
              best={card.best ? formatPerfScore(card.best.perfScore) : null}
              trend={card.best ? trendHigherBetter(card.perfScore, card.best.perfScore) : 'first'}
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
          </>
        )}
      </div>
      {/* §2.15 置き場所の訂正: 討伐記録では**同行者の名前だけ**。タップでビルドのポップアップ。
          §2.17 同行枠(duo)は名前+クラス絵を常時表示(リザルトはタップ無し・一覧はタップでビルド)。 */}
      {card.ally && (duo || onAllyTap) && (
        <AllyLine ally={card.ally} withClassIcon={duo === true} onAllyTap={onAllyTap} />
      )}
    </div>
  );
};

/** 撃破順のアイコン帯(年表の背骨)。左から撃破順に並べる。
 *  ★スクロール作法(UI監査2026-08-29): 旧 `overscroll-contain`(両軸)は縦の連鎖まで遮断し、
 *  リザルトの縦スクローラの中で**帯の上を縦になぞるとページが動かない**(守護霊部屋v4067と同型の病巣)。
 *  横だけ contain(overscroll-x-contain)+縦は素通し(overflow-y-hidden)にする。
 *  touch-action は付けない——pan-x にするとこの帯の高さぶんが縦スクロールの死角になる
 *  (ResultReach.tsx の touch-pan-x が現にそうなっていた=同監査#1-C)。 */
export const BossClearStrip: React.FC<{ cards: BossClearCard[] }> = ({ cards }) => (
  <div className="flex items-center gap-1.5 overflow-x-auto overflow-y-hidden overscroll-x-contain py-1">
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
 * いいね操作は結果画面側に置き、このカードは同行者の詳細表示だけを担当する。
 * ビルド写しが無い(旧プロファイル由来)場合は名前だけを出す。
 */
export const GhostAllyCard: React.FC<{ ally: GhostAllySnapshot; sourceLabel?: string }> = ({ ally, sourceLabel }) => {
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
        {!ally.isOwn && sourceLabel && (
          <span className="rounded-full bg-sky-400/15 px-1.5 py-0.5 text-[9px] text-sky-100/80">{sourceLabel}</span>
        )}
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
