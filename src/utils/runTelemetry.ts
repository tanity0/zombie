// SKILL_BUILD_REDESIGN.md §15(B0発注文)の計測器。1ランぶんの計測台帳(killTelemetryState.tsと
// 同じパターン=Zustandのper-frame set()経由にしない・購読者を毎フレーム起こさない・
// CLAUDE.md「React re-render discipline」と同根)。**計測のみ=ゲーム挙動を一切変えない。**
// 記録はイベント時のみ呼ぶ(per-frame走査は禁止=描画コストの規律と同じ理由)。
// 集計のアンカー/読み出しは必ずディープコピー(実装精度の規律3。生きた参照を返すと呼び出し側の
// 書き換えが台帳を汚染したり、「開始時点」保存のつもりが後から一緒に増える事故になる)。
//
// PixiJS import 禁止(renderer非依存)。gameStore/useGameLoop/playtestDriver の各イベント点から
// この薄いAPIだけを呼ぶ。
//
// 出力10点(§15-1 / §12-2#6 / §13-4 + 設計チャットからの追補=ボス突入スナップショットに
// 基礎装備のスロット別Tier+系統+特殊装備フラグを含める):
//  1. ボス突入時スナップショット(装備スキル/Lv/プレイヤーLv/装備スロット別Tier+系統+特殊フラグ/straps)
//     → recordBossEntry (src/store/gameStore.ts updateEnemies のボス交戦フラグ立ち上がりで呼ぶ)
//  2. レベルアップ提示回数+選択内訳counter → recordUpgradeOffered / recordUpgradeSelected
//  3. ナイフ到達Tier(箱由来) → recordKnifeTierFromBox
//  4. scrap収支の流路別(収入: kill/box/poi/levelup/other、支出: 商人品目別)
//     → recordScrapIncome / recordScrapExpense(recordMerchantPurchaseが内部で呼ぶ)
//  5. 商人購入ログ(品目/価格/残straps/時刻) → recordMerchantPurchase
//  6. 最終(プレイヤーLv・到達エリア・ラン時間・結果) → recordRunFinal
//  7. DDA係数の新旧並記ログ(現行式の値 vs 新式 would-be値。B0時点のcountは装備スキル数で代用と
//     明記=§15-1) → recordDdaCoefficients
//  8. 枠充足タイミング → recordSlotFilled(src/store/gameStore.ts selectUpgradeのskill/new分岐で呼ぶ。
//     B0はフィールドのみ用意していた=B1でrunBuildができたので記録を開始)
//  9. ownedSkills/ownedSkillLevelsのヘッドレス上書き口 → このモジュールの外
//     (src/store/gameStore.ts の setOwnedSkillsForTest。store状態の直接上書きなので store 側の責務)
//  10. 同行者あり・なし切替口 → このモジュールの外(既存 src/utils/bossTest.ts の
//      BossTestOptions.ghostMode を流用。own/random/top=同行あり、null=同行なし。新設不要)
import type { EquipLine, SkillKey, UpgradeOption } from '../types/game';

export type ScrapFlowSource = 'kill' | 'box' | 'poi' | 'levelup' | 'other';

export interface RunTelemetryEquipSlotSnapshot {
  tier: number;           // 0=未装備。通常装備は1..5、特殊装備は0のまま special:true で区別する。
  line: EquipLine | null; // 系統(体=protection/mobility、腕=firepower/handling、アクセ=crit/ammo)。特殊はspecial。
  special: boolean;       // 特殊装備(武将セット)が入っているスロットか。
}

export interface RunTelemetryEquipSnapshot {
  body: RunTelemetryEquipSlotSnapshot;
  arms: RunTelemetryEquipSlotSnapshot;
  accessory: RunTelemetryEquipSlotSnapshot;
}

export interface BossEntrySnapshot {
  bossType: string | null; // 交戦開始を検知した敵のtype(複数居れば先頭1体。参考情報)。
  gameTimeMs: number;
  playerLevel: number;
  skills: SkillKey[];
  skillLevels: Partial<Record<SkillKey, number>>;
  equip: RunTelemetryEquipSnapshot;
  straps: number;
}

export interface UpgradeTelemetry {
  offered: number; // レベルアップ提示回数(levelUp()が呼ばれた回数=ボス開始チェストの3連も1回ずつ数える)
  selectedByType: Partial<Record<UpgradeOption['type'], number>>;
}

export interface KnifeBoxTelemetry {
  grants: number;   // 武器箱からナイフが出た回数
  maxTier: number;  // 到達した最大ナイフTier(0=未到達)
}

export interface ScrapFlowTelemetry {
  income: Record<ScrapFlowSource, number>;
  expenseByItem: Partial<Record<string, number>>; // 商人の品目キー(ShopItemKey/サブウェポンキー等)別の支出
}

export interface MerchantPurchaseLogEntry {
  item: string;
  price: number;
  strapsAfter: number;
  gameTimeMs: number;
}

export interface DdaCoefficientSample {
  gameTimeMs: number;
  skillCount: number; // B0時点は装備スキル数(player.skills.length)で代用(§15-1明記。runBuildはB1以降)。
  oldValue: number;   // 現行式: skillCount × 1.0(difficultyScaler.ts playerPower()の現在の係数のミラー)
  newValue: number;   // 新式 would-be値: skillCount × 0.5, cap +3.0(社長裁定★3・v0.25.3201節)
}

export interface RunFinalTelemetry {
  outcome: 'death' | 'clear' | 'return' | null;
  playerLevel: number;
  maxAreaReached: number;
  runTimeMs: number;
}

// §13-4「枠充足タイミング」。B0はフィールドのみ(runBuildが無いB0時点では記録しようがない)。
// B1以降: 6枠それぞれが埋まった時刻/レベル + 特殊装備3種の入手時刻(POI到達)をここへ追加する。
export interface SlotFillTiming {
  filledAt: { gameTimeMs: number; level: number }[]; // 予約(B0は常に空配列)
  specialEquipAt: { slot: string; gameTimeMs: number }[]; // 予約(B0は常に空配列)
}

interface RunTelemetryState {
  bossEntries: BossEntrySnapshot[];
  upgrades: UpgradeTelemetry;
  knifeFromBox: KnifeBoxTelemetry;
  scrap: ScrapFlowTelemetry;
  merchantLog: MerchantPurchaseLogEntry[];
  dda: DdaCoefficientSample[];
  final: RunFinalTelemetry;
  slotFillTiming: SlotFillTiming;
}

const createState = (): RunTelemetryState => ({
  bossEntries: [],
  upgrades: { offered: 0, selectedByType: {} },
  knifeFromBox: { grants: 0, maxTier: 0 },
  scrap: {
    income: { kill: 0, box: 0, poi: 0, levelup: 0, other: 0 },
    expenseByItem: {},
  },
  merchantLog: [],
  dda: [],
  final: { outcome: null, playerLevel: 1, maxAreaReached: 0, runTimeMs: 0 },
  slotFillTiming: { filledAt: [], specialEquipAt: [] },
});

let state = createState();

/** ラン開始で呼ぶ(gameStore.resetGame)。前ランの台帳を持ち越さない。 */
export const resetRunTelemetry = (): void => {
  state = createState();
};

// ---- 1. ボス突入時スナップショット ---------------------------------------------------------
export const recordBossEntry = (snap: BossEntrySnapshot): void => {
  state.bossEntries.push({
    bossType: snap.bossType,
    gameTimeMs: snap.gameTimeMs,
    playerLevel: snap.playerLevel,
    skills: [...snap.skills],
    skillLevels: { ...snap.skillLevels },
    equip: {
      body: { ...snap.equip.body },
      arms: { ...snap.equip.arms },
      accessory: { ...snap.equip.accessory },
    },
    straps: snap.straps,
  });
};

// ---- 2. レベルアップ提示回数+選択内訳 ------------------------------------------------------
export const recordUpgradeOffered = (): void => {
  state.upgrades.offered += 1;
};
export const recordUpgradeSelected = (type: UpgradeOption['type']): void => {
  state.upgrades.selectedByType[type] = (state.upgrades.selectedByType[type] ?? 0) + 1;
};

// ---- 3. ナイフ到達Tier(箱由来) -----------------------------------------------------------
export const recordKnifeTierFromBox = (tier: number): void => {
  state.knifeFromBox.grants += 1;
  state.knifeFromBox.maxTier = Math.max(state.knifeFromBox.maxTier, tier);
};

// ---- 4. scrap収支の流路別 -----------------------------------------------------------------
export const recordScrapIncome = (source: ScrapFlowSource, amount: number): void => {
  if (!amount) return;
  state.scrap.income[source] += amount;
};
export const recordScrapExpense = (item: string, amount: number): void => {
  if (!amount) return;
  state.scrap.expenseByItem[item] = (state.scrap.expenseByItem[item] ?? 0) + amount;
};

// ---- 5. 商人購入ログ ----------------------------------------------------------------------
// 収入/支出の流路別集計(4)にも同時反映する(=呼び出し側で二重に記録しない・唯一の書き込み口)。
export const recordMerchantPurchase = (
  item: string, price: number, strapsAfter: number, gameTimeMs: number,
): void => {
  state.merchantLog.push({ item, price, strapsAfter, gameTimeMs });
  recordScrapExpense(item, price);
};

// ---- 6. 最終 ------------------------------------------------------------------------------
export const recordRunFinal = (final: RunFinalTelemetry): void => {
  state.final = { ...final };
};

// ---- 7. DDA係数の新旧並記 ------------------------------------------------------------------
// 現行式の係数(difficultyScaler.ts playerPower()の `i.skillCount * 1.0` のミラー・読み取り専用。
// あちらの値を変えたらここも合わせる=CLAUDE.md「仕様変更のルール」によりdifficultyScaler.ts自体は
// 触らない=このモジュール側にミラーを持つ)。
export const DDA_OLD_SKILLCOUNT_COEFF = 1.0;
// 新式 would-be 係数(社長裁定★3・SKILL_BUILD_REDESIGN.md §10節「×3までで。つまり2枠で1上がる」)。
export const DDA_NEW_SKILLCOUNT_COEFF = 0.5;
export const DDA_NEW_SKILLCOUNT_CAP = 3.0; // 6枠フル(6×0.5)で頭打ち。保険条項=通常は効かない。

export const ddaSkillCountWouldBeValue = (skillCount: number): number =>
  Math.min(DDA_NEW_SKILLCOUNT_CAP, Math.max(0, skillCount) * DDA_NEW_SKILLCOUNT_COEFF);

export const recordDdaCoefficients = (skillCount: number, gameTimeMs: number): void => {
  state.dda.push({
    gameTimeMs,
    skillCount,
    oldValue: Math.max(0, skillCount) * DDA_OLD_SKILLCOUNT_COEFF,
    newValue: ddaSkillCountWouldBeValue(skillCount),
  });
};

// ---- 8. 枠充足タイミング(§13-4・B1でrunBuildができたため記録を開始) ------------------------
// runBuildへ新規スキルが1枠埋まるたびに呼ぶ(Lv+1適用では呼ばない=「枠」の充足だけを数える)。
export const recordSlotFilled = (gameTimeMs: number, level: number): void => {
  state.slotFillTiming.filledAt.push({ gameTimeMs, level });
};
export const recordSpecialEquipAt = (slot: string, gameTimeMs: number): void => {
  state.slotFillTiming.specialEquipAt.push({ slot, gameTimeMs });
};

// ---- 読み出し(ディープコピー。実装精度の規律3) -------------------------------------------
export const getRunTelemetrySnapshot = (): RunTelemetryState => ({
  bossEntries: state.bossEntries.map(e => ({
    ...e,
    skills: [...e.skills],
    skillLevels: { ...e.skillLevels },
    equip: { body: { ...e.equip.body }, arms: { ...e.equip.arms }, accessory: { ...e.equip.accessory } },
  })),
  upgrades: { offered: state.upgrades.offered, selectedByType: { ...state.upgrades.selectedByType } },
  knifeFromBox: { ...state.knifeFromBox },
  scrap: {
    income: { ...state.scrap.income },
    expenseByItem: { ...state.scrap.expenseByItem },
  },
  merchantLog: state.merchantLog.map(e => ({ ...e })),
  dda: state.dda.map(e => ({ ...e })),
  final: { ...state.final },
  slotFillTiming: {
    filledAt: state.slotFillTiming.filledAt.map(e => ({ ...e })),
    specialEquipAt: state.slotFillTiming.specialEquipAt.map(e => ({ ...e })),
  },
});

export type { RunTelemetryState };
