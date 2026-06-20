// 装備システムのデータ定義(レベルアップ報酬)。
//
// 設計メモ:
// - 部位 体/腕/アクセ。各部位は2系統、各系統5段階(=通常装備)。
// - 通常装備は最大2ステ。特殊装備(5%出現・レア度非依存)は例外的に3ステ。
// - デメリットなし。装填数アップは廃止。クリ率は3%刻み。
// - ここは「裏側」のデータ+集計ヘルパーのみ。レベルアップ時の段階(tier)の出し方や
//   選択UIは別途(プレゼン仕様)で受領して接続する。
// - 重要: 仕様書5章の最大値は「装備内」での上限。スキル/パッシブの伸びは別枠で上乗せされる
//   (集計は装備分のみを返し、既存のスキル/パッシブ値とは独立に消費側で合算する)。
import type {
  EquipBonus,
  EquipLine,
  EquipLoadout,
  EquipSlot,
  EquipStat,
  EquipmentDef
} from '../types/game';

// 部位 → 通常系統(2つ)。
export const EQUIP_LINES_BY_SLOT: Record<EquipSlot, [EquipLine, EquipLine]> = {
  body: ['protection', 'mobility'],
  arms: ['firepower', 'handling'],
  accessory: ['crit', 'ammo']
};

export const EQUIP_SLOT_LABEL: Record<EquipSlot, string> = {
  body: '体',
  arms: '腕',
  accessory: 'アクセ'
};

export const EQUIP_LINE_LABEL: Record<EquipLine, string> = {
  protection: '防護系',
  mobility: '機動系',
  firepower: '火力系',
  handling: '取り回し系',
  crit: 'クリ系',
  ammo: '弾薬系',
  special: '特殊'
};

const s = (key: EquipStat['key'], value: number): EquipStat => ({ key, value });

// 通常装備テーブル(系統ごとに段階1..5)。値の単位は EquipStat 参照(reload は短縮量=正の割合)。
type LineTable = { name: string; stats: EquipStat[] }[]; // index0=段階1 ... index4=段階5

const NORMAL_TABLES: Record<EquipLine, LineTable> = {
  // 体: 防護系(最大体力 / KILL猶予)
  protection: [
    { name: '防弾ベスト', stats: [s('maxHealth', 80)] },
    { name: '強化防弾ベスト', stats: [s('maxHealth', 120)] },
    { name: '軍用防弾ベスト', stats: [s('maxHealth', 160), s('killGrace', 0.10)] },
    { name: 'サバイバルアーマー', stats: [s('maxHealth', 200), s('killGrace', 0.15)] },
    { name: '対変異体アーマー', stats: [s('maxHealth', 240), s('killGrace', 0.20)] }
  ],
  // 体: 機動系(移動速度 / KILL猶予)
  mobility: [
    { name: 'ランニングシューズ', stats: [s('moveSpeed', 0.10)] },
    { name: 'エアブーツ', stats: [s('moveSpeed', 0.20)] },
    { name: 'ジェットブーツ', stats: [s('moveSpeed', 0.30), s('killGrace', 0.10)] },
    { name: 'エアスラスト', stats: [s('moveSpeed', 0.35), s('killGrace', 0.15)] },
    { name: 'カーボンエアスラスト', stats: [s('moveSpeed', 0.40), s('killGrace', 0.20)] }
  ],
  // 腕: 火力系(ダメージ / 連射)
  firepower: [
    { name: '強化バレル', stats: [s('damage', 0.20)] },
    { name: 'ロングバレル', stats: [s('damage', 0.40)] },
    { name: 'アサルトバレル', stats: [s('damage', 0.60), s('fireRate', 0.05)] },
    { name: 'エレクトロバレル', stats: [s('damage', 0.80), s('fireRate', 0.05)] },
    { name: '対変異体バレル', stats: [s('damage', 1.00), s('fireRate', 0.10)] }
  ],
  // 腕: 取り回し系(リロード / 連射)
  handling: [
    { name: 'マガジンウェル', stats: [s('reload', 0.10)] },
    { name: '強磁石マガジンウェル', stats: [s('reload', 0.20)] },
    { name: 'スピードローダー', stats: [s('reload', 0.30), s('fireRate', 0.05)] },
    { name: 'ダブルマガジン', stats: [s('reload', 0.40), s('fireRate', 0.05)] },
    { name: 'フルオートリローダー', stats: [s('reload', 0.50), s('fireRate', 0.10)] }
  ],
  // アクセ: クリ系(クリ率 / スクラップ)
  crit: [
    { name: '精密スコープ', stats: [s('critChance', 0.03)] },
    { name: 'レーザースコープ', stats: [s('critChance', 0.06)] },
    { name: 'ミリタリースコープ', stats: [s('critChance', 0.09), s('scrap', 0.20)] },
    { name: 'AI搭載スコープ', stats: [s('critChance', 0.12), s('scrap', 0.30)] },
    { name: '神経伝達スコープ', stats: [s('critChance', 0.15), s('scrap', 0.40)] }
  ],
  // アクセ: 弾薬系(弾薬ドロップ / スクラップ)
  ammo: [
    { name: '弾薬ポーチ', stats: [s('ammoDrop', 0.10)] },
    { name: '予備弾薬袋', stats: [s('ammoDrop', 0.15)] },
    { name: '軍用弾薬ベルト', stats: [s('ammoDrop', 0.20), s('scrap', 0.20)] },
    { name: '弾薬収納ベスト', stats: [s('ammoDrop', 0.25), s('scrap', 0.30)] },
    { name: 'ミリタリー収納ベスト', stats: [s('ammoDrop', 0.30), s('scrap', 0.40)] }
  ],
  // special は通常テーブルを持たない(SPECIAL_DEFS で別管理)。
  special: []
};

// 特殊装備(部位ごと1種。3ステ・レア度非依存・5%出現。名称は仕様書「特殊装備」シート準拠=武将セット)。
const SPECIAL_DEFS: Record<EquipSlot, { name: string; stats: EquipStat[] }> = {
  body: { name: '武将の鎧', stats: [s('maxHealth', 150), s('killGrace', 0.10), s('moveSpeed', 0.25)] },
  arms: { name: '武将の小手', stats: [s('damage', 0.50), s('fireRate', 0.06), s('reload', 0.25)] },
  accessory: { name: '武将の兜', stats: [s('critChance', 0.08), s('scrap', 0.25), s('ammoDrop', 0.22)] }
};

export const EQUIP_TIER_MAX = 5;
export const SPECIAL_EQUIP_CHANCE = 0.05;

// 全装備定義(id 引き)。id 形式: 通常 = `${slot}-${line}-${tier}` / 特殊 = `special-${slot}`。
export const EQUIPMENT: Record<string, EquipmentDef> = (() => {
  const out: Record<string, EquipmentDef> = {};
  (Object.keys(EQUIP_LINES_BY_SLOT) as EquipSlot[]).forEach(slot => {
    for (const line of EQUIP_LINES_BY_SLOT[slot]) {
      NORMAL_TABLES[line].forEach((row, i) => {
        const tier = i + 1;
        const id = `${slot}-${line}-${tier}`;
        out[id] = { id, slot, line, tier, name: row.name, special: false, stats: row.stats };
      });
    }
    const sp = SPECIAL_DEFS[slot];
    const sid = `special-${slot}`;
    out[sid] = { id: sid, slot, line: 'special', tier: 0, name: sp.name, special: true, stats: sp.stats };
  });
  return out;
})();

export const equipmentById = (id: string | null | undefined): EquipmentDef | null =>
  id ? (EQUIPMENT[id] ?? null) : null;

// (slot, line, tier) から通常装備を引く。範囲外は null。
export const equipmentDef = (slot: EquipSlot, line: EquipLine, tier: number): EquipmentDef | null =>
  equipmentById(`${slot}-${line}-${tier}`);

export const specialEquipmentForSlot = (slot: EquipSlot): EquipmentDef => EQUIPMENT[`special-${slot}`];

// 1点の装備をロール(building block)。5%で特殊、それ以外は指定段階の通常装備(系統はランダム)。
// 段階(tier)の出し方=レベル連動かどうか等の orchestration は呼び出し側(後でプレゼン仕様で接続)。
export const rollEquipment = (
  slot: EquipSlot,
  tier: number,
  rng: () => number = Math.random
): EquipmentDef => {
  if (rng() < SPECIAL_EQUIP_CHANCE) return specialEquipmentForSlot(slot);
  const lines = EQUIP_LINES_BY_SLOT[slot];
  const line = lines[rng() < 0.5 ? 0 : 1];
  const t = Math.max(1, Math.min(EQUIP_TIER_MAX, Math.round(tier)));
  return equipmentDef(slot, line, t)!;
};

const NEUTRAL_BONUS: EquipBonus = {
  moveSpeedMult: 1,
  killGraceMult: 1,
  damageMult: 1,
  fireRateMult: 1,
  reloadMult: 1,
  critBonus: 0,
  ammoDropBonus: 0,
  scrapBonus: 0
};

export const neutralEquipBonus = (): EquipBonus => ({ ...NEUTRAL_BONUS });

// 装備3点 → 集計効果(最大体力は除く=player.maxHealth へ加算ベイクするため)。
export const aggregateEquipBonus = (loadout: EquipLoadout): EquipBonus => {
  const b = neutralEquipBonus();
  const defs = [loadout.body, loadout.arms, loadout.accessory]
    .map(equipmentById)
    .filter((d): d is EquipmentDef => d !== null);
  for (const d of defs) {
    for (const st of d.stats) {
      switch (st.key) {
        case 'moveSpeed': b.moveSpeedMult += st.value; break;
        case 'killGrace': b.killGraceMult += st.value; break;
        case 'damage': b.damageMult += st.value; break;
        case 'fireRate': b.fireRateMult += st.value; break;
        case 'reload': b.reloadMult *= (1 - st.value); break;
        case 'critChance': b.critBonus += st.value; break;
        case 'ammoDrop': b.ammoDropBonus += st.value; break;
        case 'scrap': b.scrapBonus += st.value; break;
        case 'maxHealth': break; // maxHealth は別経路(加算ベイク)
      }
    }
  }
  return b;
};

// 装備3点が与える最大体力加算(HPポイント)。equip 変更時に player.maxHealth へ反映する。
export const equipMaxHealthOf = (loadout: EquipLoadout): number => {
  let hp = 0;
  for (const id of [loadout.body, loadout.arms, loadout.accessory]) {
    const d = equipmentById(id);
    if (!d) continue;
    for (const st of d.stats) if (st.key === 'maxHealth') hp += st.value;
  }
  return hp;
};

export const emptyEquipLoadout = (): EquipLoadout => ({ body: null, arms: null, accessory: null });

// 装備スロットの並び順(内部分類 1=体/2=腕/3=アクセ。ゲーム内に部位名は出さない=裏設定)。
export const EQUIP_SLOTS: EquipSlot[] = ['body', 'arms', 'accessory'];

// 1ステータスの表示文字列(レベルアップ選択肢などのUI用)。
export const equipStatLabel = (st: EquipStat): string => {
  const pct = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;
  switch (st.key) {
    case 'maxHealth': return `最大体力 +${st.value}`;
    case 'moveSpeed': return `移動速度 ${pct(st.value)}`;
    case 'killGrace': return `KILL猶予 ${pct(st.value)}`;
    case 'damage': return `ダメージ ${pct(st.value)}`;
    case 'fireRate': return `連射 ${pct(st.value)}`;
    case 'reload': return `リロード -${Math.round(st.value * 100)}%`;
    case 'critChance': return `クリ率 ${pct(st.value)}`;
    case 'ammoDrop': return `弾薬ドロップ ${pct(st.value)}`;
    case 'scrap': return `スクラップ ${pct(st.value)}`;
  }
};

// 装備の効果テキスト(全ステを ' / ' で連結)。
export const equipmentDescription = (def: EquipmentDef): string =>
  def.stats.map(equipStatLabel).join(' / ');

// 武将セット(特殊3点)をフル装備しているか。立ち絵差し替えの判定に使う。
export const hasFullWarlordSet = (loadout: EquipLoadout): boolean =>
  EQUIP_SLOTS.every(slot => equipmentById(loadout[slot])?.special === true);

// 専用アイコン画像(public/sprites/equip/<defId>.png)が用意済みの装備ID。
// 社長から素材を受領するたびにここへ追加していく。未登録IDはUI側で絵文字フォールバック。
export const EQUIP_ICON_IDS: ReadonlySet<string> = new Set<string>([
  'body-protection-1', 'body-protection-2', 'body-protection-3', 'body-protection-4', 'body-protection-5',
  'body-mobility-1', 'body-mobility-2', 'body-mobility-3', 'body-mobility-4', 'body-mobility-5',
]);

export const hasEquipIcon = (defId: string | null | undefined): boolean =>
  !!defId && EQUIP_ICON_IDS.has(defId);

// アイコン画像の論理名(spritePath('equip/<defId>') で実パスへ)。
export const equipIconName = (defId: string): string => `equip/${defId}`;
