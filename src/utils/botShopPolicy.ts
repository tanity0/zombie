// SKILL_BUILD_REDESIGN.md §13-2(B0発注文)+設計チャットの追補+§18-1の7(B2): ボットの商人ショップ
// 購買ポリシー。旧実装(playtestDriver.ts / useGameLoop.ts の実機オートパイロット)は、ショップが
// 開いた瞬間に正規の closeShop() で**即閉じる**だけだった。§12-1(商人=基礎装備+回復の供給元)導入後は
// これだと経済系の計測(scrap収支・商人購入ログ)が全て0のまま=無効になる(監査#1)。
// ここは判定するだけの純関数(store/React非依存)。実際の購入(store.buyShopItem等)を呼ぶのは
// playtestDriver.ts / useGameLoop.ts 側(実装精度の規律4=配線ロジックは純関数に切り出してテスト)。
// 呼び出し側は「ショップが開いている間、closeになるまでこの関数を繰り返し呼ぶ」ループを組む
// (1回の呼び出しは1個の購入判定のみ返す=②で複数個買う挙動はループが担う)。
//
// 優先順位(乱数なし・決定的。§13-2 + 設計チャットの追補 + §18-1の7で確定):
//   ① HP<50% かつ scrap≥救急価格 → 救急を1個。ただし**購入後もscrap≥ARMORY_RESERVE_STRAPSが残る
//      場合のみ**(武器庫POI代の温存・叩き台。設計チャットの追補で明記された保守則)。
//   ② 装備区画(§13-1の指名買いカタログ)の最安の次の一段から順に、scrapが価格以上かつ
//      購入後もscrap≥ARMORY_RESERVE_STRAPSが残る間buy(安い順=進行の均し・§18-1の7)。
//   ③ 買えなくなったらclose。
import { ARMORY_SCRAP_COST } from '../world/armory';
import { merchantEquipShelf, EQUIP_SLOTS } from '../data/equipment';
import type { EquipLoadout, EquipSlot } from '../types/game';

// 武器庫POI(既存の world/armory.ts・3秒滞在でTier3装備を確定入手=100スクラップ)の代金を
// 商人での購入で使い切らないための保守的な温存額。設計チャットの追補で指定された値(100)は
// 現行の ARMORY_SCRAP_COST と一致するため、値を複製せずそのまま参照する(叩き台=B2で商人価格表と
// 一緒に見直す前提。武器庫の価格自体が変われば自動で追従する)。
export const ARMORY_RESERVE_STRAPS = ARMORY_SCRAP_COST;

export interface BotShopPolicyInput {
  playerHealth: number;
  playerMaxHealth: number;
  straps: number;
  medkitCost: number; // SHOP_MEDKIT_COST(gameStore.ts)をそのまま渡す(値の複製をしない)
  equipment: EquipLoadout; // ②判定用の現在ロードアウト(gameStore.player.equipmentをそのまま渡す)
  equipShopCostByTier: readonly number[]; // gameStore.EQUIP_SHOP_COST_BY_TIER をそのまま渡す(価格を複製しない)
}

export type BotShopPolicyAction =
  | { kind: 'buy-medkit' }
  | { kind: 'buy-equip'; slot: EquipSlot; defId: string }
  | { kind: 'close' };

/**
 * 商人が開いている間、closeが返るまで繰り返し呼ぶ(この関数自体はショップを閉じない=呼び出し側が
 * 購入を実行してから closeShop() する)。同じ入力からは常に同じ結果を返す(乱数なし=決定的・
 * ユニットテスト対象)。
 */
export const decideBotShopPurchase = (input: BotShopPolicyInput): BotShopPolicyAction => {
  const hpFrac = input.playerMaxHealth > 0 ? input.playerHealth / input.playerMaxHealth : 1;
  const afterMedkit = input.straps - input.medkitCost;
  if (hpFrac < 0.5 && input.straps >= input.medkitCost && afterMedkit >= ARMORY_RESERVE_STRAPS) {
    return { kind: 'buy-medkit' };
  }

  // ②装備区画: 各スロットの「次の一段」候補を集め、最安のものから買う。未装備スロット(choose)は
  // 系統選択が本来プレイヤーの意思決定だが、ボットは決定的にEQUIP_LINES_BY_SLOTの先頭系統
  // (index0)を選ぶ(叩き台=ゲームバランスに影響しないボット側の実装上の既定)。
  const candidates = merchantEquipShelf(input.equipment)
    .flatMap(step => {
      if (step.kind === 'sold-out') return [];
      if (step.kind === 'next') return [{ slot: step.slot, defId: step.def.id, tier: step.def.tier }];
      const chosen = step.options[0]; // choose: 先頭系統を機械的に選ぶ
      return [{ slot: step.slot, defId: chosen.id, tier: chosen.tier }];
    })
    .map(c => ({ ...c, cost: input.equipShopCostByTier[c.tier - 1] }))
    .filter((c): c is typeof c & { cost: number } => Number.isFinite(c.cost))
    .sort((a, b) => a.cost - b.cost || EQUIP_SLOTS.indexOf(a.slot) - EQUIP_SLOTS.indexOf(b.slot));

  const cheapest = candidates[0];
  if (cheapest) {
    const afterEquip = input.straps - cheapest.cost;
    if (input.straps >= cheapest.cost && afterEquip >= ARMORY_RESERVE_STRAPS) {
      return { kind: 'buy-equip', slot: cheapest.slot, defId: cheapest.defId };
    }
  }
  return { kind: 'close' };
};
