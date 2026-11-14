import type { EnemyType } from '../types/game';

export type GhostDossierCategory = 'story' | 'gate' | 'hidden';

export interface GhostDossierSlot {
  slotKey: string;
  bossType: EnemyType;
  stageId: string | null;
  category: GhostDossierCategory;
}

/**
 * 守護霊部屋に並べる、実際に討伐記録を作れるボス枠。
 * stage-6 はボス戦なし、stage-ex2 は導線のない旧データなので図鑑へ出さない。
 */
export const GHOST_DOSSIER_SLOTS: readonly GhostDossierSlot[] = [
  { slotKey: 'giantbat@stage-1', bossType: 'giantbat', stageId: 'stage-1', category: 'story' },
  { slotKey: 'giantbat@stage-2', bossType: 'giantbat', stageId: 'stage-2', category: 'story' },
  { slotKey: 'giantbat@stage-3', bossType: 'giantbat', stageId: 'stage-3', category: 'story' },
  { slotKey: 'giantbat@stage-4', bossType: 'giantbat', stageId: 'stage-4', category: 'story' },
  { slotKey: 'giantbat@stage-5', bossType: 'giantbat', stageId: 'stage-5', category: 'story' },
  { slotKey: 'giantbat@stage-7', bossType: 'giantbat', stageId: 'stage-7', category: 'story' },
  // PACING_PUZZLE.md §10-12#4/§10-14#10(EXボス「フィル(変異体)」): 旧EXボス(giantbat流用)を
  // phillbossへ差し替え(順序維持=既存プレイヤーの守護霊記録の並びを変えない)。
  { slotKey: 'phillboss@stage-ex1', bossType: 'phillboss', stageId: 'stage-ex1', category: 'story' },

  { slotKey: 'miguel', bossType: 'miguel', stageId: null, category: 'gate' },
  { slotKey: 'jibril', bossType: 'jibril', stageId: null, category: 'gate' },
  { slotKey: 'rafi', bossType: 'rafi', stageId: null, category: 'gate' },
  { slotKey: 'uri', bossType: 'uri', stageId: null, category: 'gate' },
  { slotKey: 'suriel', bossType: 'suriel', stageId: null, category: 'gate' },
  // ★アクラシエルは**一旦ゲーム内から非表示**(社長指示2026-09-29「アクラシエルは出番が無いはずなので一旦ゲーム内から非表示」)。
  //   ゲート2の割り当て(stage-6)は残っているが、stage-6 は洋館の通路(ゲートの仕組みが動かない)=本編では1度も出ない。
  //   この台帳はボスモード(変異体対策室)・守護霊の記録・ミッション選択の記録・ボスラッシュが共通で引くので、ここから外せば全部から消える。
  //   ボスメーカー・動物園(開発用)には残っている。戻す時はこの1行を戻すだけ(保存データのキー 'acrasiel' は変えていない)。
  // { slotKey: 'acrasiel', bossType: 'acrasiel', stageId: null, category: 'gate' },

  { slotKey: 'mimir', bossType: 'mimir', stageId: null, category: 'hidden' },
  { slotKey: 'jormungand', bossType: 'jormungand', stageId: null, category: 'hidden' },
  { slotKey: 'skadi', bossType: 'skadi', stageId: null, category: 'hidden' },
  { slotKey: 'thor', bossType: 'thor', stageId: null, category: 'hidden' },
  { slotKey: 'idol', bossType: 'idol', stageId: null, category: 'hidden' },
];

export const GHOST_DOSSIER_CATEGORY_LABEL: Record<GhostDossierCategory, string> = {
  story: 'MAIN',
  gate: 'GATE',
  hidden: 'DEEP',
};

