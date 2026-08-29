import React, { useEffect, useRef, useState } from 'react';
import { Heart, Users, Clock3, Activity, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { CHARACTER_CLASSES, SKILLS } from '../data/campaign';
import { equipmentById } from '../data/equipment';
import { fixedGuardianLeadersForBoss } from '../data/fixedGuardians';
import { enemyDeathLabel, subWeaponDisplayName } from '../store/gameStore';
import { bossCutinName } from '../data/bossCutin';
import type { BossClearCard } from '../utils/ghostAlbum';
import { formatClearTime, formatPerMin, formatPerfScore, formatRatePercent } from '../utils/ghostAlbum';
import {
  GHOST_DOSSIER_CATEGORY_LABEL, GHOST_DOSSIER_SLOTS, type GhostDossierCategory, type GhostDossierSlot,
} from '../utils/ghostDossier';
import { bossIconSrc } from '../utils/bossIcon';
import type { GhostAllySnapshot } from '../utils/playerBuild';
import type { BossStyleSlot } from '../utils/playerTraits';
import { fixedGhostStatKey, type FixedGhostStat, type GhostInboxItem } from '../utils/ghostOnline';
import { weaponDisplayName } from '../utils/weaponUtils';
import type { EquipSlot, PlayerBuildSnapshot } from '../types/game';

// 図鑑パネル内(レール/詳細)の枠内スクロール容器。
// ★overscroll-contain を付けない(社長報告2026-08-29「守護霊部屋のスクロールもおかしい」の修正):
// ページ(Shell)の中の入れ子スクロールに contain を付けると、枠がスクロール不要な時・枠の端に
// 達した時に**ページ側へのスクロール連鎖まで遮断**され、パネルの上をなぞってもページが動かない
// (特にiOS)。連鎖は素通しにし、ページ端のバウンス殺しは外側の NoBounceScroller が受け持つ。
// 下矢印は「続きがあるやつは、あるのがわかる様に小さい下矢印」(社長指示2026-08-29)の枠内版
// (.ds-scroll-more = MissionSelect の NoBounceScroller と同じ見た目・レールの隠れボス対策)。
const InnerPane: React.FC<{ as?: 'nav' | 'div'; className: string; ariaLabel?: string; children: React.ReactNode }> =
  ({ as = 'div', className, ariaLabel, children }) => {
    const ref = useRef<HTMLElement | null>(null);
    const [hasMore, setHasMore] = useState(false);
    useEffect(() => {
      const el = ref.current;
      if (!el) return;
      const check = () => setHasMore(el.scrollHeight - el.clientHeight - el.scrollTop > 4);
      check();
      el.addEventListener('scroll', check, { passive: true });
      window.addEventListener('resize', check);
      const mo = new MutationObserver(check);
      mo.observe(el, { childList: true, subtree: true });
      return () => { el.removeEventListener('scroll', check); window.removeEventListener('resize', check); mo.disconnect(); };
    }, []);
    const Tag = as;
    // ★矢印はスクロール容器の「外」(absolute)に置く。中に置くと sticky+svg で scrollHeight が
    // 数px 増え、オーバーフローの無いペインまで「スクロール可能」になってジェスチャを掴む
    // (実測: 詳細ペイン sh574→576 でページスクロールが死んだ)。外なら sh は増えない。
    return (
      <div className="relative min-h-0">
        <Tag ref={(el: HTMLElement | null) => { ref.current = el; }} className={`${className} h-full`} aria-label={ariaLabel}>
          {children}
        </Tag>
        <div
          className="ds-scroll-more"
          style={{ position: 'absolute', bottom: 6, left: 0, right: 0, opacity: hasMore ? 1 : 0, color: 'rgba(216, 180, 254, 0.85)' }}
          aria-hidden="true"
        >
          <ChevronDown size={15} />
        </div>
      </div>
    );
  };

const CATEGORY_ACCENT: Record<GhostDossierCategory, string> = {
  story: 'rgba(125, 211, 252, 0.85)',
  gate: 'rgba(251, 191, 36, 0.85)',
  hidden: 'rgba(216, 180, 254, 0.85)',
};

// 城ボスの呼び名はカットイン/ボスモードと同じ台帳(bossCutin.ts)を第一候補に(監査指摘5: 名前の正本は
// 1箇所)。台帳に無い枠=実装してないボスは「?」(社長指示「ボスモードでもどこでも?にしといて」)。
const bossLabel = (item: GhostDossierSlot): string => item.bossType === 'giantbat'
  ? (bossCutinName('giantbat', item.stageId) ?? '?')
  : enemyDeathLabel(item.bossType);

const BuildTags: React.FC<{ label: string; values: string[]; accent?: boolean }> = ({ label, values, accent }) => (
  <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-2 border-t border-white/[0.07] py-2 text-[10px]">
    <span className="text-white/35">{label}</span>
    <div className="flex min-w-0 flex-wrap gap-1">
      {values.length > 0 ? values.map((value, index) => (
        <span
          key={`${value}:${index}`}
          className={`border px-1.5 py-0.5 ${accent ? 'border-sky-300/20 bg-sky-300/10 text-sky-100' : 'border-white/10 bg-white/[0.04] text-white/75'}`}
        >
          {value}
        </span>
      )) : <span className="text-white/30">記録なし</span>}
    </div>
  </div>
);

const Metric: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: string;
}> = ({ icon, label, value, tone = 'text-white' }) => (
  <div className="min-w-0 border border-white/[0.07] bg-black/20 px-2 py-2">
    <div className="flex items-center gap-1 text-[8px] uppercase tracking-wider text-white/35">{icon}{label}</div>
    <div className={`mt-0.5 truncate text-[15px] font-semibold tabular-nums ${tone}`}>{value}</div>
  </div>
);

const buildRows = (snapshot: PlayerBuildSnapshot | null) => {
  if (!snapshot) return null;
  const guns = snapshot.gunKeys ?? [];
  const active = snapshot.activeGunKey;
  const gunLabels = guns.map(key => `${key === active ? '● ' : ''}${weaponDisplayName(key)}`);
  const equipment = (Object.keys(snapshot.equipment ?? {}) as EquipSlot[])
    .map(slot => equipmentById(snapshot.equipment?.[slot])?.name)
    .filter((name): name is string => Boolean(name));
  const subs = (snapshot.subWeapons ?? []).map(key => {
    const level = snapshot.subWeaponLevels?.[key] ?? 1;
    return `${subWeaponDisplayName(key)} Lv${level}`;
  });
  const skills = (snapshot.skills ?? []).map(key => {
    const level = snapshot.skillLevels?.[key] ?? 1;
    return `${SKILLS[key]?.name ?? key} Lv${level}`;
  });
  return { gunLabels, equipment, subs, skills };
};

const LockedDossier: React.FC<{ cleared: number; total: number }> = ({ cleared, total }) => (
  <div className="ghost-dossier-enter relative flex min-h-full flex-col items-center justify-center overflow-hidden px-5 py-12 text-center">
    <div className="pointer-events-none absolute inset-0 opacity-50" style={{ background: 'radial-gradient(circle at 50% 38%, rgba(168,85,247,0.18), transparent 42%)' }} />
    <div className="relative flex h-24 w-24 items-center justify-center border border-purple-200/15 bg-black/30 text-5xl font-black text-purple-100/30 shadow-[0_0_36px_rgba(168,85,247,0.1)]">?</div>
    <div className="relative mt-5 text-[9px] font-semibold tracking-[0.32em] text-purple-200/40">UNREGISTERED TARGET</div>
    <h3 className="relative mt-2 text-[16px] font-semibold text-white/75">未討伐のボス</h3>
    <p className="relative mt-2 max-w-[240px] text-[11px] leading-relaxed text-white/40">
      討伐すると、その時のキャラクターと戦闘記録がここに刻まれます。
    </p>
    <div className="relative mt-6 h-1 w-36 overflow-hidden bg-white/5">
      <div className="h-full bg-purple-300/50" style={{ width: `${Math.round((cleared / total) * 100)}%` }} />
    </div>
    <div className="relative mt-1 text-[9px] tabular-nums text-white/30">COLLECTION {cleared} / {total}</div>
  </div>
);

const FixedLeaderGrid: React.FC<{
  slotKey: string;
  stats: Record<string, FixedGhostStat>;
  onAllyTap: (ally: GhostAllySnapshot) => void;
}> = ({ slotKey, stats, onAllyTap }) => (
  <div className="mt-4 border-t border-purple-200/10 pt-3">
    <div className="mb-2 flex items-center justify-between">
      <div>
        <div className="text-[9px] font-semibold tracking-[0.18em] text-purple-200/65">TOP GUARDIANS</div>
        <div className="text-[10px] text-white/35">このボスを得意とする先人</div>
      </div>
      <span className="text-[9px] text-white/25">タップでビルド</span>
    </div>
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
      {fixedGuardianLeadersForBoss(slotKey).map((guardian, index) => {
        const character = CHARACTER_CLASSES.find(item => item.id === guardian.classId);
        const feedback = stats[fixedGhostStatKey(slotKey, guardian.id)];
        return (
          <button
            type="button"
            key={guardian.id}
            onClick={() => onAllyTap({
              name: guardian.name,
              className: guardian.classId,
              ...(guardian.profile.snapshot ? { build: guardian.profile.snapshot } : {}),
              isOwn: false,
            })}
            className="group relative min-w-0 overflow-hidden border border-purple-200/10 bg-purple-400/[0.06] px-1.5 py-2 text-left transition-colors active:bg-purple-400/15"
          >
            <span className="absolute left-0 top-0 bg-purple-300/20 px-1.5 py-0.5 text-[8px] font-bold text-purple-100">#{index + 1}</span>
            <div className="mx-auto flex h-10 w-10 items-end justify-center overflow-hidden bg-black/25">
              {character && <img src={character.sprite} alt="" draggable={false} className="max-h-9 object-contain" style={{ imageRendering: 'pixelated' }} />}
            </div>
            <div className="mt-1 truncate text-center text-[10px] font-semibold text-white/80">{guardian.name}</div>
            <div className="text-center text-[9px] tabular-nums text-amber-200/80">評点 {Math.round(guardian.performance.score)}</div>
            <div className="mt-1 flex justify-center gap-2 text-[8px] tabular-nums text-white/35">
              <span>同行 {(feedback?.used ?? 0).toLocaleString()}</span>
              <span>♥ {(feedback?.likes ?? 0).toLocaleString()}</span>
            </div>
          </button>
        );
      })}
    </div>
  </div>
);

export interface GhostBossDossierProps {
  selectedSlotKey: string;
  onSelect: (slotKey: string) => void;
  cards: readonly BossClearCard[];
  duoCards: readonly BossClearCard[];
  slotRecords: Readonly<Record<string, BossStyleSlot>>;
  inbox: Readonly<Record<string, GhostInboxItem>>;
  fixedStats: Record<string, FixedGhostStat>;
  networkSlotKey: (slotKey: string) => string;
  onAllyTap: (ally: GhostAllySnapshot) => void;
}

export const GhostBossDossier: React.FC<GhostBossDossierProps> = ({
  selectedSlotKey, onSelect, cards, duoCards, slotRecords, inbox, fixedStats, networkSlotKey, onAllyTap,
}) => {
  const selectedItem = GHOST_DOSSIER_SLOTS.find(item => item.slotKey === selectedSlotKey) ?? GHOST_DOSSIER_SLOTS[0];
  const cardMap = new Map(cards.map(card => [card.slotKey, card]));
  const selectedCard = cardMap.get(selectedItem.slotKey) ?? null;
  const duoCard = duoCards.find(card => card.slotKey === selectedItem.slotKey) ?? null;
  const slot = slotRecords[selectedItem.slotKey] ?? null;
  const snapshot = slot?.snapshot ?? null;
  const build = buildRows(snapshot);
  const social = inbox[networkSlotKey(selectedItem.slotKey)];
  const recentLike = social?.recent.find(event => event.liked);
  const cleared = GHOST_DOSSIER_SLOTS.filter(item => cardMap.has(item.slotKey)).length;
  const character = CHARACTER_CLASSES.find(item => item.id === (snapshot?.characterClass ?? slot?.srcClass));
  const icon = selectedCard ? bossIconSrc(selectedItem.bossType, selectedItem.stageId) : null;

  return (
    <section className="overflow-hidden border border-purple-200/10 bg-[#090b13]/80 shadow-[0_16px_50px_rgba(0,0,0,0.3)]">
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.025] px-3 py-2">
        <div>
          <div className="text-[9px] font-semibold tracking-[0.24em] text-purple-200/60">GUARDIAN ARCHIVE</div>
          <div className="text-[10px] text-white/40">討伐記録コレクション</div>
        </div>
        <div className="text-right">
          <div className="text-[13px] font-semibold tabular-nums text-white/80">{cleared}<span className="text-white/30"> / {GHOST_DOSSIER_SLOTS.length}</span></div>
          <div className="mt-1 h-0.5 w-20 bg-white/5"><div className="h-full bg-purple-300/60" style={{ width: `${Math.round((cleared / GHOST_DOSSIER_SLOTS.length) * 100)}%` }} /></div>
        </div>
      </div>

      <div className="grid h-[min(68svh,650px)] min-h-[500px] grid-cols-[56px_minmax(0,1fr)]">
        <InnerPane as="nav" className="ghost-boss-rail overflow-y-auto border-r border-white/[0.07] bg-black/20 px-1.5 py-2" ariaLabel="ボス討伐記録">
          {(['story', 'gate', 'hidden'] as const).map(category => (
            <div key={category} className="mb-2.5">
              <div className="mb-1 text-center text-[7px] font-bold tracking-[0.13em] text-white/25">{GHOST_DOSSIER_CATEGORY_LABEL[category]}</div>
              <div className="space-y-1.5">
                {GHOST_DOSSIER_SLOTS.filter(item => item.category === category).map(item => {
                  const defeated = cardMap.has(item.slotKey);
                  const active = item.slotKey === selectedItem.slotKey;
                  const itemIcon = defeated ? bossIconSrc(item.bossType, item.stageId) : null;
                  return (
                    <button
                      type="button"
                      key={item.slotKey}
                      onClick={() => onSelect(item.slotKey)}
                      aria-label={defeated ? bossLabel(item) : '未討伐のボス'}
                      aria-current={active ? 'true' : undefined}
                      className={`relative flex h-11 w-11 items-center justify-center overflow-hidden border transition-colors ${
                        active
                          ? 'ghost-boss-rail-selected border-purple-200/60 bg-purple-300/15'
                          : defeated ? 'border-white/10 bg-white/[0.035] active:bg-white/10' : 'border-white/[0.06] bg-black/20 active:border-purple-200/25'
                      }`}
                      style={active ? { boxShadow: `inset 2px 0 ${CATEGORY_ACCENT[category]}, 0 0 18px rgba(168,85,247,0.2)` } : undefined}
                    >
                      {itemIcon
                        ? <img src={itemIcon} alt="" draggable={false} className="h-full w-full object-contain p-0.5" style={{ imageRendering: 'pixelated' }} />
                        : <span className={`text-xl font-black ${active ? 'text-purple-100/75' : 'text-white/20'}`}>?</span>}
                      {defeated && <span className="absolute bottom-0 right-0 h-1.5 w-1.5 bg-emerald-300 shadow-[0_0_6px_rgba(110,231,183,0.8)]" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </InnerPane>

        <InnerPane className="overflow-y-auto touch-pan-y">
          {!selectedCard ? <LockedDossier cleared={cleared} total={GHOST_DOSSIER_SLOTS.length} /> : (
            <div key={selectedItem.slotKey} className="ghost-dossier-enter relative min-h-full overflow-hidden px-3 pb-5 pt-3">
              {icon && (
                <img
                  src={icon}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute -right-6 top-4 h-36 w-36 object-contain opacity-[0.10] blur-[0.2px]"
                  style={{ imageRendering: 'pixelated' }}
                />
              )}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-28 opacity-60" style={{ background: `linear-gradient(130deg, ${CATEGORY_ACCENT[selectedItem.category]}22, transparent 70%)` }} />

              <div className="relative flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[8px] font-semibold tracking-[0.22em] text-emerald-200/65">TARGET ARCHIVED</div>
                  <h3 className="mt-1 truncate text-[17px] font-semibold tracking-wide text-white">{bossLabel(selectedItem)}</h3>
                  <div className="text-[9px] text-white/35">{GHOST_DOSSIER_CATEGORY_LABEL[selectedItem.category]} / {selectedItem.stageId?.toUpperCase() ?? selectedItem.bossType.toUpperCase()}</div>
                </div>
                <div className="rotate-[-4deg] border border-emerald-300/35 px-2 py-1 text-center text-[8px] font-bold tracking-wider text-emerald-200/70">
                  討伐記録<br />登録
                </div>
              </div>

              <div className="relative mt-3 flex items-center gap-3 border-y border-white/[0.07] bg-black/15 px-2 py-2.5">
                <div className="flex h-16 w-16 shrink-0 items-end justify-center overflow-hidden border border-sky-200/10 bg-sky-300/[0.06]">
                  {character
                    ? <img src={character.sprite} alt={character.name} draggable={false} className="max-h-14 object-contain" style={{ imageRendering: 'pixelated' }} />
                    : <span className="text-2xl text-white/20">◇</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[8px] tracking-wider text-sky-200/45">RECORDED HUNTER</div>
                  <div className="truncate text-[15px] font-semibold text-white/90">{slot?.srcName ?? '無名のハンター'}</div>
                  <div className="text-[10px] text-white/45">{character?.name ?? 'クラス記録なし'} · Lv {snapshot?.level ?? '—'}</div>
                  <div className={`mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 text-[8px] font-semibold ${social?.published ? 'bg-emerald-300/10 text-emerald-100/75' : 'bg-white/5 text-white/35'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${social?.published ? 'bg-emerald-300' : 'bg-white/25'}`} />
                    {social?.published ? 'オンライン公開中' : '未公開'}
                  </div>
                </div>
              </div>

              <div className="relative mt-2 grid grid-cols-2 gap-1.5">
                <Metric icon={<Clock3 size={9} />} label="討伐時間" value={formatClearTime(selectedCard.clearTimeMs)} tone="text-sky-100" />
                <Metric icon={<Activity size={9} />} label="守護霊評点" value={formatPerfScore(selectedCard.perfScore)} tone="text-amber-100" />
                <Metric icon={<Heart size={9} />} label="いいね" value={(social?.likes ?? 0).toLocaleString()} tone="text-pink-100" />
                <Metric icon={<Users size={9} />} label="同行回数" value={(social?.used ?? 0).toLocaleString()} tone="text-purple-100" />
              </div>

              {recentLike && (
                <div className="relative mt-1.5 flex items-center gap-1.5 bg-pink-300/[0.07] px-2 py-1.5 text-[9px] text-pink-100/70">
                  <Heart size={9} fill="currentColor" /> 最近のいいね：<span className="font-semibold">{recentLike.name}</span>
                </div>
              )}

              <div className="relative mt-4">
                <div className="mb-1.5 text-[9px] font-semibold tracking-[0.18em] text-sky-200/55">COMBAT PROFILE</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 bg-white/[0.025] px-2.5 py-2 text-[10px] tabular-nums">
                  <div className="flex justify-between"><span className="text-white/35">カウンター成功</span><span className="text-white/75">{formatRatePercent(slot?.counterChance)}</span></div>
                  <div className="flex justify-between"><span className="text-white/35">被弾 / 分</span><span className="text-white/75">{formatPerMin(slot?.hitsPerMin)}</span></div>
                  <div className="flex justify-between"><span className="text-white/35">移動率</span><span className="text-white/75">{formatRatePercent(slot?.mobility)}</span></div>
                  <div className="flex justify-between"><span className="text-white/35">サブ / 分</span><span className="text-white/75">{formatPerMin(slot?.subUsesPerMin)}</span></div>
                  <div className="flex justify-between"><span className="text-white/35">得意距離</span><span className="text-white/75">{slot?.preferredDist == null ? '—' : `${Math.round(slot.preferredDist)} px`}</span></div>
                  <div className="flex justify-between"><span className="text-white/35">近接傾向</span><span className="text-white/75">{formatRatePercent(slot?.meleeBias)}</span></div>
                </div>
              </div>

              <div className="relative mt-4">
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="text-[9px] font-semibold tracking-[0.18em] text-sky-200/55">RECORDED BUILD</div>
                  {snapshot && <div className="flex gap-2 text-[9px] tabular-nums text-white/40"><span>HP {Math.round(snapshot.maxHealth)}</span><span>SPD {snapshot.speed.toFixed(1)}</span><span>CRIT {formatRatePercent(snapshot.critChance)}</span></div>}
                </div>
                {build ? (
                  <div className="bg-white/[0.018] px-2.5">
                    <BuildTags label="銃" values={build.gunLabels} accent />
                    <BuildTags label="近接" values={snapshot?.meleeKey ? [weaponDisplayName(snapshot.meleeKey)] : []} />
                    <BuildTags label="装備" values={build.equipment} />
                    <BuildTags label="サブ" values={build.subs} />
                    <BuildTags label="スキル" values={build.skills} />
                  </div>
                ) : (
                  <div className="border border-white/[0.06] bg-white/[0.02] px-3 py-3 text-[10px] leading-relaxed text-white/35">
                    古い記録のため、討伐時のビルド詳細は残っていません。
                  </div>
                )}
              </div>

              {duoCard && (
                <div className="relative mt-4 border border-sky-200/10 bg-sky-300/[0.045] px-2.5 py-2">
                  <div className="flex items-center justify-between text-[9px]">
                    <span className="font-semibold tracking-wider text-sky-100/65">同行討伐 BEST</span>
                    <span className="font-semibold tabular-nums text-sky-100">{formatClearTime(duoCard.clearTimeMs)}</span>
                  </div>
                  {duoCard.ally && (
                    <button type="button" onClick={() => onAllyTap(duoCard.ally!)} className="mt-1.5 flex w-full items-center justify-between bg-black/20 px-2 py-1.5 text-left text-[10px] text-white/65 active:bg-black/35">
                      <span className="truncate">同行：<span className="font-semibold text-white/80">{duoCard.ally.name}</span></span>
                      <span className="flex shrink-0 items-center gap-0.5 text-[8px] text-sky-100/45">ビルド <ChevronRight size={10} /></span>
                    </button>
                  )}
                </div>
              )}

              <FixedLeaderGrid slotKey={selectedItem.slotKey} stats={fixedStats} onAllyTap={onAllyTap} />

              <div className="mt-4 flex items-center justify-center gap-1 text-[8px] tracking-[0.16em] text-white/20">
                <Sparkles size={9} /> SELECT ANOTHER TARGET FROM THE LEFT
              </div>
            </div>
          )}
        </InnerPane>
      </div>
    </section>
  );
};

