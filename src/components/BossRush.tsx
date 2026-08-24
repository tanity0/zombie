// ボスラッシュ(練習モード)の画面。BOSS_MAKER.md §20-7。
//
// 社長仕様: 「作戦室にならぶ形」「守護霊メニューのボスごとのデータみたいなノリ」
// 「ボス絵と関するデータ 攻略ヒント」「ラッシュは連戦じゃない。1体」
// 「一度ステージで出会ったことがあれば解放される。練習モードの位置づけ」
// 「守護霊は選べなくていい。スキル装備していけばいいだけ」
//
// ★見た目は守護霊メニュー(GhostBossDossier)のトーンに揃える。開発用の道具ではなくプレイヤー画面。
// ★出撃は通常のstartGameと同じシームレス経路。選択枠はbossPracticeの実行時状態で湧きゲートへ渡す
//   (社長指摘v0.25.2862・BOSS_MAKER.md §20-8-e)。
import React, { useMemo, useState } from 'react';
import { Lock, Swords, Heart, MapPin } from 'lucide-react';
import { CHARACTER_CLASSES, getStage, COMPANION_SKILL_KEYS, SKILLS } from '../data/campaign';
import { enemyDeathLabel, useGameStore } from '../store/gameStore';
import { bossIconSrc } from '../utils/bossIcon';
import { bossHintsFor } from '../data/bossHints';
import { loadEncounteredBosses } from '../utils/bossEncounter';
import { GHOST_DOSSIER_CATEGORY_LABEL, type GhostDossierCategory } from '../utils/ghostDossier';
import { GHOST_DOSSIER_SLOTS } from '../utils/ghostDossier';
import { PRACTICE_CATEGORY_ORDER, PRACTICE_SLOTS, practiceBossHealth, practiceSlotUnlocked, type PracticeSlot } from '../utils/bossPractice';
import { isBountyType } from '../utils/enemyUtils';
import type { CharacterClass } from '../types/game';

// §6.38 掲載裁定: 賞金首4種はGHOST_DOSSIER_SLOTS由来ではないので、この画面だけの区分「bounty」を
// 追加する(ghostDossier.tsのGhostDossierCategory自体は変えない=守護霊メニュー側は無関係のまま)。
// research/GHOST_BOSS.md: 守護霊ボス「幻影」の区分「duel」(決闘)も同様にこの画面だけの追加。
type PracticeCategory = GhostDossierCategory | 'bounty' | 'duel';
const PRACTICE_CATEGORY_LABEL: Record<PracticeCategory, string> = {
  ...GHOST_DOSSIER_CATEGORY_LABEL, bounty: '賞金首', duel: '決闘',
};
const CATEGORY_OF = new Map(GHOST_DOSSIER_SLOTS.map(s => [s.slotKey, s.category]));
// ★未知キーは 'story' に落ちる。新しい独立枠を足したら**必ずここに分岐を書く**
// (書き忘れると「ステージボス」の棚に紛れ、カテゴリ順の裁定も効かない)。
const categoryOf = (slot: PracticeSlot): PracticeCategory =>
  CATEGORY_OF.get(slot.encounterSlotKey)
  ?? (isBountyType(slot.bossType) ? 'bounty'
    : slot.bossType === 'guardian-phantom' ? 'duel'
    : 'story');

const bossName = (slot: PracticeSlot): string => slot.label ?? enemyDeathLabel(slot.bossType);
const bossIcon = (slot: PracticeSlot): string | null =>
  bossIconSrc(slot.bossType, slot.stageId, slot.glenForm2 ? 'phase2' : undefined);

const Row: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="min-w-0 border border-white/[0.07] bg-black/20 px-2 py-2">
    <div className="flex items-center gap-1 text-[8px] uppercase tracking-wider text-white/35">{icon}{label}</div>
    <div className="mt-0.5 truncate text-[13px] font-semibold text-white">{value}</div>
  </div>
);

interface Props {
  /** 討伐済みのスロットキー(守護霊メニューの討伐記録から。表示のみ)。 */
  clearedSlotKeys: ReadonlySet<string>;
  /** ★出撃。ページ再読込はしない=通常の出撃と同じ経路でそのまま戦闘へ(社長指摘v0.25.2862)。 */
  onStartPractice: (slot: PracticeSlot, characterClass: string) => void;
}

export const BossRush: React.FC<Props> = ({ clearedSlotKeys, onStartPractice }) => {
  // 遭遇記録は画面を開いた時に1回だけ読む(毎描画で localStorage を叩かない)。
  const encountered = useMemo(() => loadEncounteredBosses(), []);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [cls, setCls] = useState<CharacterClass>('warrior');
  // ★守護霊の選択(社長指示2026-08-24)。**正本は gameStore の1本**(キャラ選択の守護霊枠と共有)。
  // CLAUDE.md「React re-render discipline」: 毎フレーム変わる物ではないので、必要な値だけを個別に購読する。
  const companionSkill = useGameStore(state => state.companionSkill);
  const setCompanionSkill = useGameStore(state => state.setCompanionSkill);
  const ownedSkills = useGameStore(state => state.ownedSkills);
  const ownedCompanions = useMemo(
    () => COMPANION_SKILL_KEYS.filter(k => ownedSkills.includes(k)),
    [ownedSkills],
  );

  const open = openKey ? PRACTICE_SLOTS.find(s => s.slotKey === openKey) ?? null : null;
  // 解放判定は台帳側の1本(practiceSlotUnlocked)=遭遇記録 or 常時解放枠(幻影)。
  const unlockedCount = PRACTICE_SLOTS.filter(s => practiceSlotUnlocked(s, encountered)).length;

  // ---- 詳細 ----------------------------------------------------------------------------------
  if (open) {
    const stage = getStage(open.stageId);
    const hp = practiceBossHealth(open);
    const hints = bossHintsFor(open.bossType);
    const icon = bossIcon(open);
    return (
      <div className="p-3 space-y-3">
        <button
          type="button"
          onClick={() => setOpenKey(null)}
          className="text-[11px] text-purple-200/70 active:text-white"
        >← ボス一覧</button>

        <section className="overflow-hidden border border-purple-200/10 bg-[#090b13]/80">
          <div className="flex items-center gap-3 border-b border-white/[0.06] bg-white/[0.025] px-3 py-3">
            <div className="flex h-20 w-20 shrink-0 items-end justify-center overflow-hidden bg-black/30">
              {icon
                ? <img src={icon} alt="" draggable={false} className="max-h-[76px] object-contain" style={{ imageRendering: 'pixelated' }} />
                : <span className="flex h-full w-full items-center justify-center text-3xl font-bold text-white/40">?</span>}
            </div>
            <div className="min-w-0">
              <div className="text-[9px] font-semibold tracking-[0.24em] text-purple-200/60">
                {PRACTICE_CATEGORY_LABEL[categoryOf(open)]}
              </div>
              <div className="truncate text-[17px] font-semibold text-white">{bossName(open)}</div>
              <div className="mt-0.5 text-[10px] text-white/40">
                {clearedSlotKeys.has(open.encounterSlotKey) ? '討伐記録あり' : '未討伐'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5 p-2">
            <Row icon={<MapPin size={9} />} label="出現" value={stage?.locationTitle ?? open.stageId} />
            {/* storyBoss の城ボスは実HPと表が食い違うので出さない(BOSS_MAKER.md §20-8)。 */}
            <Row icon={<Heart size={9} />} label="体力" value={hp != null ? hp.toLocaleString() : '—'} />
            <Row icon={<Swords size={9} />} label="種別" value={
              open.bossType === 'giantbat' ? 'ステージボス'
                : isBountyType(open.bossType) ? '賞金首'
                : open.bossType === 'guardian-phantom' ? '守護霊' // research/GHOST_BOSS.md(決闘の実験枠)
                : '固有ボス'
            } />
          </div>
        </section>

        <section className="border border-white/[0.07] bg-black/20 p-3">
          <div className="mb-1.5 text-[9px] font-semibold tracking-[0.2em] text-purple-200/60">攻略ヒント</div>
          {hints.length > 0 ? (
            <ul className="space-y-1">
              {hints.map((line, i) => (
                <li key={i} className="flex gap-1.5 text-[11px] leading-relaxed text-white/75">
                  <span className="text-purple-300/50">・</span><span>{line}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-[11px] text-white/35">準備中</p>}
        </section>

        <section className="border border-white/[0.07] bg-black/20 p-3">
          <div className="mb-1.5 text-[9px] font-semibold tracking-[0.2em] text-purple-200/60">キャラクター</div>
          <div className="flex flex-wrap gap-1">
            {CHARACTER_CLASSES.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCls(c.id as CharacterClass)}
                className={`px-2.5 py-1.5 text-[11px] ${cls === c.id ? 'bg-purple-500/40 text-white' : 'bg-white/5 text-white/55'}`}
              >{c.name}</button>
            ))}
          </div>
          {/* ★社長指示2026-08-24「ui変わったから変異対策室で守護霊の選択肢も追加 キャラ選択の並びに」。
              旧v0.25.2857 は「守護霊の選択は置かない=**装備画面で組んだスキルがそのまま乗る**」だったが、
              **その装備画面の同行者欄は 2026-08-20 の社長指示で撤去され、キャラ選択の守護霊枠へ移設**
              された。⇒ 旧裁定の前提そのものが消えたので、ここにも選択を置く。
              状態は `gameStore.companionSkill`(=キャラ選択の守護霊枠と**同じ1つの正本**)を直接読み書きする
              =この画面で選び直すと本編側の選択も変わる(二重管理を作らない)。 */}
          <div className="mt-2.5 mb-1.5 text-[9px] font-semibold tracking-[0.2em] text-fuchsia-200/60">守護霊</div>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setCompanionSkill(null)}
              className={`px-2.5 py-1.5 text-[11px] ${companionSkill === null ? 'bg-fuchsia-500/40 text-white' : 'bg-white/5 text-white/55'}`}
            >なし</button>
            {ownedCompanions.map(k => (
              <button
                key={k}
                type="button"
                onClick={() => setCompanionSkill(k)}
                className={`px-2.5 py-1.5 text-[11px] ${companionSkill === k ? 'bg-fuchsia-500/40 text-white' : 'bg-white/5 text-white/55'}`}
              >{SKILLS[k].name}</button>
            ))}
          </div>
          {ownedCompanions.length === 0 && (
            <p className="mt-1 text-[10px] text-white/35">まだ守護霊を持っていません(ガチャで入手)。</p>
          )}
          <p className="mt-2 text-[10px] leading-relaxed text-white/35">
            装備・スキル・サブウェポンは装備画面のものがそのまま使えます。<br />
            守護霊はここでの選択が本編にも反映されます。<br />
            練習の結果は記録・進行・所持金に一切残りません。
          </p>
        </section>

        <button
          type="button"
          onClick={() => onStartPractice(open, cls)}
          className="w-full border border-emerald-400/50 bg-emerald-500/15 px-3 py-3 text-[14px] font-bold tracking-wide text-emerald-100 active:bg-emerald-500/30"
        >演習する</button>
      </div>
    );
  }

  // ---- 一覧 ----------------------------------------------------------------------------------
  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] text-white/40">一度戦ったことのあるボスと、何度でも練習できます。</p>
        <span className="shrink-0 text-[12px] font-semibold tabular-nums text-white/70">
          {unlockedCount}<span className="text-white/30"> / {PRACTICE_SLOTS.length}</span>
        </span>
      </div>

      {/* 社長指示v0.25.3444「小ボスは一番上だろ」: 表示順の正は bossPractice.PRACTICE_CATEGORY_ORDER。
          v3444では台帳の並びだけ直したが、画面はカテゴリ区切りで描くため変わっていなかった(v3457で是正)。 */}
      {PRACTICE_CATEGORY_ORDER.map(cat => {
        const slots = PRACTICE_SLOTS.filter(s => categoryOf(s) === cat);
        if (slots.length === 0) return null;
        return (
          <section key={cat}>
            <div className="mb-1 px-1 text-[9px] font-semibold tracking-[0.24em] text-purple-200/55">
              {PRACTICE_CATEGORY_LABEL[cat]}
            </div>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              {slots.map(slot => {
                const unlocked = practiceSlotUnlocked(slot, encountered);
                const icon = unlocked ? bossIcon(slot) : null;
                return (
                  <button
                    key={slot.slotKey}
                    type="button"
                    disabled={!unlocked}
                    onClick={() => setOpenKey(slot.slotKey)}
                    className={`min-w-0 border px-1.5 py-2 text-center ${unlocked
                      ? 'border-purple-200/15 bg-purple-400/[0.06] active:bg-purple-400/20'
                      : 'border-white/[0.06] bg-white/[0.02]'}`}
                  >
                    <div className="mx-auto flex h-12 w-12 items-end justify-center overflow-hidden bg-black/25">
                      {icon
                        ? <img src={icon} alt="" draggable={false} className="max-h-11 object-contain" style={{ imageRendering: 'pixelated' }} />
                        : unlocked
                          // v0.25.3041(社長指示): 「?」表示のボス(名前台帳に無い=絵もnull)はアイコンも「?」。
                          ? <span className="flex h-full w-full items-center justify-center text-lg font-bold text-white/40">?</span>
                          : <span className="flex h-full w-full items-center justify-center text-white/20"><Lock size={14} /></span>}
                    </div>
                    <div className="mt-1 truncate text-[10px] font-semibold text-white/80">
                      {unlocked ? bossName(slot) : '?'}
                    </div>
                    <div className="truncate text-[9px] text-white/30">
                      {unlocked ? (getStage(slot.stageId)?.locationTitle ?? '') : '未遭遇'}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
};

export default BossRush;
