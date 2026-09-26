/**
 * 武器スロット(HUD右)の色をティアで分ける(社長指示2026-09-16「右の武器アイコンのところ、
 * tierによって色を分けたい」)。
 *
 * ★段はゲーム内で既に使っている梯子に合わせる: **銀 → 青 → 金**(作戦室のスキル表記も
 * 白/青/金、スキル取得の炸裂も白/青/金)。同じ意味に同じ色を使い、新しい色の言語を増やさない。
 * t4/t5(近接だけが持つ上の段)は**金より熱い側**へ伸ばす=橙 → 白熱。
 *
 * ティアの実際: 銃は 1〜3、近接は 1〜5(`weaponUtils.ts` の WEAPON_DEFS)。
 * ティアを持たない武器(特殊枠など)は**従来の紫のまま**にする(勝手に段を作らない)。
 */
export interface WeaponTierStyle {
  /** 平常時の枠 */ base: string;
  /** 選択中の枠 */ active: string;
  /** 弾切れの枠 */ dry: string;
}

const PURPLE: WeaponTierStyle = {
  base: 'bg-purple-500/12 opacity-80',
  active: 'bg-purple-500/25 ring-1 ring-purple-400/80',
  dry: 'bg-purple-400/5 opacity-50',
};

const TIERS: Record<number, WeaponTierStyle> = {
  1: { base: 'bg-slate-400/12 opacity-80',  active: 'bg-slate-300/25 ring-1 ring-slate-200/80',  dry: 'bg-slate-400/5 opacity-50' },
  2: { base: 'bg-sky-500/12 opacity-80',    active: 'bg-sky-500/25 ring-1 ring-sky-400/80',     dry: 'bg-sky-400/5 opacity-50' },
  3: { base: 'bg-amber-500/12 opacity-80',  active: 'bg-amber-500/25 ring-1 ring-amber-400/80', dry: 'bg-amber-400/5 opacity-50' },
  4: { base: 'bg-orange-500/14 opacity-80', active: 'bg-orange-500/28 ring-1 ring-orange-400/85', dry: 'bg-orange-400/5 opacity-50' },
  5: { base: 'bg-white/14 opacity-80',      active: 'bg-white/26 ring-1 ring-white/90',          dry: 'bg-white/5 opacity-50' },
};

/** ティア → 枠の色。ティアが無い/範囲外なら従来の紫。 */
export const weaponTierStyle = (tier: number | undefined | null): WeaponTierStyle =>
  (tier != null && TIERS[tier]) ? TIERS[tier] : PURPLE;

/** 枠に当てる class を1つに畳む(選択中 > 弾切れ > 平常)。 */
export const weaponSlotClass = (tier: number | undefined | null, active: boolean, dry: boolean): string => {
  const s = weaponTierStyle(tier);
  return active ? s.active : dry ? s.dry : s.base;
};
