// レベルアップ画面の「見せる順」(research/UIUX_PROPOSAL.md P3「レベルアップを“拾う”瞬間に」)。
// カードは上から1枚ずつ落ちて止まり、一番レアな1枚が最後(一番下)に着地して光る。
// ★ここで変えるのは**表示の順だけ**。抽選(store の upgradeOptions)の中身・枚数・参照は1つも変えない
//   (入力の配列は書き換えない・返すのは同じ要素の並べ替え)。
import type { UpgradeOption } from '../types/game';

export type LevelUpTier = 'normal' | 'rare' | 'super';

const TIER_RANK: Record<LevelUpTier, number> = { normal: 0, rare: 1, super: 2 };

/** カードの光の段。スキル=そのレア度 / 特殊装備(level 0)=超レアと同じ琥珀 / それ以外=光なし。 */
export function levelUpTier(o: UpgradeOption): LevelUpTier {
  if (o.type === 'skill') return o.skillRarity ?? 'normal';
  if (o.type === 'equipment' && o.level === 0) return 'super';
  return 'normal';
}

/** 落ちてこない「添え」の行(スクラップ)。カードの下に静かに置く。 */
export function isLevelUpFiller(o: UpgradeOption): boolean {
  return o.type === 'scrap';
}

export interface LevelUpLayout {
  /** 落ちてくるカード(上から順)。レアほど下=後に着地。同じ段の中は元の順のまま(安定)。 */
  cards: UpgradeOption[];
  /** 添えの行(元の順のまま)。 */
  fillers: UpgradeOption[];
  /** 着地で光らせるカードの位置(cards の添字)。一番下のカードがノーマルなら -1(光らせない)。 */
  flashIndex: number;
}

export function levelUpLayout(options: readonly UpgradeOption[]): LevelUpLayout {
  const cards = options
    .map((o, i) => ({ o, i }))
    .filter(({ o }) => !isLevelUpFiller(o))
    .sort((a, b) => TIER_RANK[levelUpTier(a.o)] - TIER_RANK[levelUpTier(b.o)] || a.i - b.i)
    .map(({ o }) => o);
  const fillers = options.filter(isLevelUpFiller);
  const last = cards.length - 1;
  const flashIndex = last >= 0 && levelUpTier(cards[last]) !== 'normal' ? last : -1;
  return { cards, fillers, flashIndex };
}
