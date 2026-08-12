// SKILL_BUILD_REDESIGN.md §13-2(B0発注文)+設計チャットの追補: ボットの商人ショップ購買ポリシー。
// 旧実装(playtestDriver.ts / useGameLoop.ts の実機オートパイロット)は、ショップが開いた瞬間に
// 正規の closeShop() で**即閉じる**だけだった。§12-1(商人=基礎装備+回復の供給元)導入後はこれだと
// 経済系の計測(scrap収支・商人購入ログ)が全て0のまま=無効になる(監査#1)。
// ここは判定するだけの純関数(store/React非依存)。実際の購入(store.buyShopItem等)を呼ぶのは
// playtestDriver.ts / useGameLoop.ts 側(実装精度の規律4=配線ロジックは純関数に切り出してテスト)。
//
// 優先順位(乱数なし・決定的。§13-2 + 設計チャットの追補で確定):
//   ① HP<50% かつ scrap≥救急価格 → 救急を1個。ただし**購入後もscrap≥ARMORY_RESERVE_STRAPSが残る
//      場合のみ**(武器庫POI代の温存・叩き台。設計チャットの追補で明記された保守則)。
//   ② 装備区画の最安の次の一段(B2以降で実装予定)。B0では該当なし(コメントで予約)。
//   ③ close。
import { ARMORY_SCRAP_COST } from '../world/armory';

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
}

export type BotShopPolicyAction =
  | { kind: 'buy-medkit' }
  | { kind: 'close' };

/**
 * 商人が開いた瞬間に1回呼ぶ(この関数自体はショップを閉じない=呼び出し側が購入を実行してから
 * closeShop() する)。同じ入力からは常に同じ結果を返す(乱数なし=決定的・ユニットテスト対象)。
 */
export const decideBotShopPurchase = (input: BotShopPolicyInput): BotShopPolicyAction => {
  const hpFrac = input.playerMaxHealth > 0 ? input.playerHealth / input.playerMaxHealth : 1;
  const afterBuy = input.straps - input.medkitCost;
  if (hpFrac < 0.5 && input.straps >= input.medkitCost && afterBuy >= ARMORY_RESERVE_STRAPS) {
    return { kind: 'buy-medkit' };
  }
  // ②装備区画(B2以降で追加予定): 商人の装備区画(§13-1の指名買いカタログ)はB0時点では未実装
  // (§12-1で新設される固定カタログ)。実装され次第「最安の次の一段」を②として足す。
  return { kind: 'close' };
};
