// 歴史年表の「全体のうち何件刻んだか」(社長指示2026-10-13「年表の一番下に、全ての年表から見た、何分の何を表示したい」)。
//
// 分母 = 通常プレイで実際に刻める年表の行の一覧(下の CHRONICLE_SLOTS)。記録の呼び出し元
// (recordChronicle / recordChronicleGlobalFirst)の発火条件をステージごとに追って作った固定表:
//   ・区域1〜4/ランク2〜7/ハンター/死神/紅き夜 … 区域・ゲート・ランク・死神・紅き夜が全部動くのは
//     屋外の本編ステージ(1/3/4/5)だけ(研究所・ストーリーボス専用・EX・訓練・洋館通路は止まる)。
//     ランクは毎回R1から始まるので刻めるのは2〜7。
//   ・ボス … 城ボス+裏ボス(campaign.hiddenBoss)+ゲート2の天使(config/gateBoss)。ステージ2は
//     idol だけ、ステージ7はグレン(第2形態=giantbat として刻まれる)だけ、EX1はスリィエルとフィル。
//   ・ステージ6 … 「クリア」だけ(他は recordChronicle が弾く)。
//   ・拠点 … ゲーム全体で1行だけ(どのステージで開けたかは問わない)。POI … 警察署/武器庫/病院を各1行。
// 訓練ステージのハンターは「今の装備では勝てない」相手なので分母に入れない(倒してしまっても数えない)。
// 分子は「この表の枠のうち、記録が1つでも当たっている枠の数」。旧形式の記録(方位付きの拠点等)や
// 表に無い記録は数えない=分子が分母を超えることは無い。
import type { ChronicleEntry, ChronicleKind } from './progress';
import { STAGES } from './campaign';
import { GATE2_BOSS_TYPE_BY_STAGE } from '../config/gateBoss';
import { FEAT_KEYS } from './chronicleFeats';

/** 年表の1枠。stageId/detail が null の枠は「どのステージ/どの detail でも1つあれば埋まる」。 */
export interface ChronicleSlot {
  stageId: string | null;
  kind: ChronicleKind;
  detail: string | null;
}

/** 区域・ランク・死神・紅き夜・ゲートが全部動く屋外の本編ステージ。 */
export const CHRONICLE_FULL_STAGES = ['stage-1', 'stage-3', 'stage-4', 'stage-5'] as const;

const buildSlots = (): ChronicleSlot[] => {
  const slots: ChronicleSlot[] = [];
  const add = (stageId: string | null, kind: ChronicleKind, detail: string | null) =>
    slots.push({ stageId, kind, detail });
  for (const stageId of CHRONICLE_FULL_STAGES) {
    for (let z = 1; z <= 4; z++) add(stageId, 'zone', String(z));
    for (let r = 2; r <= 7; r++) add(stageId, 'rank', String(r));
    add(stageId, 'boss', 'giantbat');
    const hidden = STAGES.find(s => s.id === stageId)?.hiddenBoss;
    if (hidden) add(stageId, 'boss', hidden);
    const gate2 = GATE2_BOSS_TYPE_BY_STAGE[stageId];
    if (gate2) add(stageId, 'boss', gate2);
    add(stageId, 'hunter', 'hunter');
    add(stageId, 'reaper', 'reaper');
    add(stageId, 'redNight', 'redNight');
  }
  add('stage-2', 'boss', 'idol');
  add('stage-6', 'clear', 'clear');
  add('stage-7', 'boss', 'giantbat');
  add('stage-ex1', 'boss', 'suriel');
  add('stage-ex1', 'boss', 'phillboss');
  add(null, 'base', null);
  add(null, 'poi', 'police');
  add(null, 'poi', 'armory');
  add(null, 'poi', 'hospital');
  // 実績(社長指示2026-10-14): 各1枠(stageId='feat'・ゲーム全体で1回)。
  for (const k of FEAT_KEYS) add(null, 'feat', k);
  return slots;
};

export const CHRONICLE_SLOTS: readonly ChronicleSlot[] = buildSlots();

const entryDetail = (e: ChronicleEntry): string => e.key.split('::').slice(2).join('::');

const slotFilled = (slot: ChronicleSlot, entries: readonly ChronicleEntry[]): boolean =>
  entries.some(e =>
    e.kind === slot.kind
    && (slot.stageId === null || e.stageId === slot.stageId)
    && (slot.detail === null || entryDetail(e) === slot.detail));

/** 年表の達成数 / 全体数。entries は loadChronicle() の結果をそのまま渡す。 */
export const chronicleProgress = (entries: readonly ChronicleEntry[]): { got: number; total: number } => ({
  got: CHRONICLE_SLOTS.filter(slot => slotFilled(slot, entries)).length,
  total: CHRONICLE_SLOTS.length,
});
