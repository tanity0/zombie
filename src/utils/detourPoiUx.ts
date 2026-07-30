// 寄り道POI(PACING_PUZZLE.md §6.24)の**体験まわり**=進入時の通信 / 入手トースト / 解放帯の
// 「文言」と「発火ゲート」。仕様の正本は §6.24-UX(社長指示2026-07-30・POI-UX)。
//
// なぜここに集約するか:
// - 通信の文言は病院/武器庫が store(updateHospital/updateArmory)、警察署が useGameLoop
//   (アリーナ発動)と**別々の経路**から出る。文言を各所に直書きすると必ず食い違う
//   (CLAUDE.md「同じ"動作"を持つ全員に付ける」= 経路が分かれているのがこのプロジェクトの形)。
// - 判定/選択のロジックは純関数にしてユニットテストする(CLAUDE.md 実装精度の規律4)。
//
// この層は renderer-agnostic(PixiJS非依存)。表示手段そのもの(NpcDialogue/バナー/帯/トースト)は
// 呼び出し側が既存UIをそのまま使う=新しいUIは作らない。
import { DETOUR_DWELL_MS } from '../world/detourPoi';
import { ARMORY_SCRAP_COST } from '../world/armory';
import type { DetourPoiKind } from '../world/pois';

export type PoiKind = DetourPoiKind; // 'police' | 'armory' | 'hospital'

/** 3種の呼び名(通信・帯・トーストで共通)。 */
export const POI_LABEL: Record<PoiKind, string> = {
  police: '警察署',
  armory: '武器庫',
  hospital: '病院',
};

/** 滞在の秒数(通信の文言用)。値は world/detourPoi.ts の DETOUR_DWELL_MS を引くので文面が古びない。 */
export const POI_DWELL_SEC = Math.round(DETOUR_DWELL_MS / 1000);

/**
 * 進入時の通信(1ラン1回/種・§6.24-UX 確定要件1)。「ここが何で・何をすれば・何が貰えるか」を1行。
 * 文言は §6.24-UX の叩き台をそのまま採用。**数値は定数から埋める**(スクラップ額/滞在秒を後で
 * 調整しても文面が嘘にならない)。武器庫は取引内容(スクラップいくらで交換か)を含む=裁定aの統合。
 */
export const poiIntelLine = (kind: PoiKind): string => {
  switch (kind) {
    case 'hospital':
      return `廃病院だ。サークルで${POI_DWELL_SEC}秒待てばワクチンが手に入る——死んでも一度だけ立ち上がれる`;
    case 'armory':
      return `武器庫だ。スクラップ${ARMORY_SCRAP_COST}で軍用装備と交換できる。サークルで${POI_DWELL_SEC}秒待て`;
    case 'police':
      return '警察署だ。囲まれるぞ——全滅させれば警察の特殊装備をこの出撃の間使える';
  }
};

/** この出撃でその種の通信をまだ出していないか(1ラン1回/種)。 */
export const shouldShowPoiIntel = (shown: Record<PoiKind, boolean>, kind: PoiKind): boolean => !shown[kind];

/** 通信ゲートの初期値(resetGame と同じ形をここから配る=リセット漏れを防ぐ)。 */
export const emptyPoiIntelShown = (): Record<PoiKind, boolean> => ({
  police: false,
  armory: false,
  hospital: false,
});

/**
 * 通信の話者(既存の左上の会話=NpcDialogue を流用するので話者が要る)。
 * その方角(セクター)を担当している護衛を選ぶ(既存の npcAreaEnterReact と同じ「担当NPCが喋る」慣例)。
 * 担当が居なければロスターの先頭、護衛が1人も居ない出撃(ストーリーボス等)は null
 * =呼び出し側がバナー(通信)へフォールバックする。
 */
export const pickPoiIntelSpeaker = <T extends { baseId: string }>(
  escorts: T[],
  sector: number,
): T | null => escorts.find(e => e.baseId === `base-${sector}`) ?? escorts[0] ?? null;

/** 解放の到達帯(§6.24-UX 確定要件3)。ゾーン到達と同型の帯(WallBand)に出す文言。 */
export const poiUnlockBandText = (kind: PoiKind): string => `${POI_LABEL[kind]} 解放`;
/** 帯の表示時間(ms)。深さの予告帯(2800)と同じ体感に揃える。 */
export const POI_BAND_MS = 2800;

// 入手トースト(§6.24-UX 確定要件2)の固定文言。スキル/装備の説明は既存定義(SKILLS /
// equipmentDescription)を引くので、ここに置くのはワクチンだけ(新しい文章の二重管理をしない)。
export const POI_VACCINE_NAME = 'ワクチン';
export const POI_VACCINE_DESC = '死亡時に一度だけ復活';
/** 警察署スキルの但し書き(このランだけ持てる)。 */
export const POI_SKILL_NOTE = 'この出撃のみ';
