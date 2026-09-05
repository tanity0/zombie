import { AmmoType } from '../types/game';
import { GUN_KEYS_BY_CATEGORY, nextKnifeKey } from './weaponUtils';
import { effectiveDifficultyArea } from './timeDifficulty';
// UNIQUE_WEAPONS.md §4-1: ここが「キーを作る側」の生成点。地面のドロップ絵(pickup.weaponKey)が
// このrollWeaponKey/openCrate/rollTier23Gunの戻り値をそのまま使うため、受け取り側(grantWeapon)
// ではなくここで解決する(受け取り側だけの解決だと「地面はハンドガン→拾うとデリンジャー」になる)。
import { resolveSlotKeyNow } from './weaponSlot';

// WWZ-style loot: enemies rarely drop a weapon outright, and mid-bosses always
// drop a weapon crate that rolls one. Tier率はエリア(距離)で決まる(社長指定): 奥ほど高Tier。

const CATEGORIES: AmmoType[] = ['handgun', 'shotgun', 'rifle'];
// 社長訂正v0.25.3297「(グレネードガンは)普通に武器箱から出るようにして。武器庫だけだとtier1-2が
// 出ない」: 武器箱/敵ドロップの銃抽選にglauncherを4カテゴリ目として追加(エリア別Tier率が掛かるので
// 序盤=t1・奥=t2/t3が自然に出る)。ステージ7開幕宝箱(rollTier23Gun)は従来の3カテゴリのまま。
const DROP_CATEGORIES: AmmoType[] = ['handgun', 'shotgun', 'rifle', 'glauncher'];

// エリア別 武器箱Tier率(社長指定)。添字=エリア(0 軍備 / 1 研究 / 2 デンジャー / 3 未確認 / 4 深層)。
const TIER_WEIGHTS_BY_AREA: [number, number, number][] = [
  [85, 15, 0],   // 軍備配置
  [55, 40, 5],   // 研究対象
  [30, 55, 15],  // デンジャー
  [10, 55, 35],  // 未確認汚染
  [0,  35, 65],  // 深層域
];

// 社長指示v0.25.3328「比例して、アイテムのTier抽選率も」: 実効エリア(=max(実エリア, 時間の仮想
// エリア・8:00で最深部相当))の連続値で重み3列をそれぞれ線形補間する。gameTimeMs=0なら従来と完全一致。
const tierWeightsAt = (virtualArea: number): [number, number, number] => {
  const i = Math.max(0, Math.min(TIER_WEIGHTS_BY_AREA.length - 1, virtualArea));
  const lo = Math.floor(i);
  const hi = Math.min(TIER_WEIGHTS_BY_AREA.length - 1, lo + 1);
  const f = i - lo;
  const a = TIER_WEIGHTS_BY_AREA[lo], b = TIER_WEIGHTS_BY_AREA[hi];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
};

const pickTier = (area: number, gameTimeMs = 0): number => {
  const w = tierWeightsAt(effectiveDifficultyArea(area, gameTimeMs));
  const total = w[0] + w[1] + w[2];
  let r = Math.random() * total;
  for (let i = 0; i < 3; i++) {
    r -= w[i];
    if (r <= 0) return i + 1;
  }
  return 1;
};

// Roll a random gun key (used for both world drops and crates). Melee weapons
// are rarer so the player mostly upgrades their firearm. `area` = 0..4。
// 社長指示v0.25.3291「ドロップのナイフは必ず自分の装備してるtierより1つ上」:
// 旧=エリアTier連動(装備より低いナイフが落ちて無意味)→ 現装備tier+1固定(nextKnifeKey)。
// Tier5(最上位)所持なら近接は落とさず銃へ振り替える。
export const rollWeaponKey = (area: number, currentMeleeTier = 1, gameTimeMs = 0): string => {
  const tier = pickTier(area, gameTimeMs);

  // ~15% of rolls produce a melee weapon instead of a gun.
  if (Math.random() < 0.15) {
    const knife = nextKnifeKey(currentMeleeTier);
    if (knife) return knife;
  }

  const category = DROP_CATEGORIES[Math.floor(Math.random() * DROP_CATEGORIES.length)];
  const keys = GUN_KEYS_BY_CATEGORY[category];
  const idx = Math.min(keys.length - 1, tier - 1);
  return resolveSlotKeyNow(keys[idx]);
};

// ステージ7の初期宝箱(社長指示v0.25.3137「内容はtier2-3の武器ランダム」)。
// **銃だけ・Tier2か3だけ**を等確率で引く(area=距離によるTier率は使わない=開幕の1個なので
// 「弱いのを引いて終わり」を作らない)。近接は混ぜない(crateと同じ理由=火力の報酬として読ませる)。
// 純関数(乱数は注入可)。GUN_KEYS_BY_CATEGORY の並びは [t1, t2, t3]。
export const rollTier23Gun = (rand: () => number = Math.random): string => {
  const category = CATEGORIES[Math.floor(rand() * CATEGORIES.length)];
  const keys = GUN_KEYS_BY_CATEGORY[category];
  const idx = Math.min(keys.length - 1, 1 + Math.floor(rand() * 2)); // 1=t2 / 2=t3
  return resolveSlotKeyNow(keys[idx]);
};

// v0.25.3212(社長指示「取り急ぎ、ナイフは武器箱に移す」): レベルアップ3枠目に居たナイフ強化
// (Tier5未満で25%)を武器箱へ移設。currentMeleeTier(所持ナイフのTier)がTier5未満なら25%で
// 「1段階上のナイフ」を返し、それ以外は従来どおり銃(エリア別Tier率)。率25%は旧レベルアップ側の
// KNIFE_OFFER_RATEをそのまま引き継いだ叩き台。
const CRATE_KNIFE_RATE = 0.25;
export const openCrate = (area: number, currentMeleeTier = 5, gameTimeMs = 0): string => {
  const knifeKey = nextKnifeKey(currentMeleeTier);
  if (knifeKey && Math.random() < CRATE_KNIFE_RATE) return knifeKey;
  const tier = pickTier(area, gameTimeMs);
  const category = DROP_CATEGORIES[Math.floor(Math.random() * DROP_CATEGORIES.length)];
  const keys = GUN_KEYS_BY_CATEGORY[category];
  const idx = Math.min(keys.length - 1, tier - 1);
  return resolveSlotKeyNow(keys[idx]);
};
