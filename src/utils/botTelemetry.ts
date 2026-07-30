// M35(§6.12)/M46(§6.21): ボットレポート用の計測シングルトン(killTelemetryStateと同パターン=Zustandの
// per-frame set()経由にしない・購読者を起こさない)。**計測のみ=ゲーム挙動・数値は一切不変**。
// 加算はスカラーのインクリメントだけなので誰も読まなくてもコストは無視できる。
//  - recordSubUse: サブウェポン発動回数。合流点=gameStore.setSubWeaponCooldown(CD式サブを自動カバー・
//    オーバークロック成立でCDが付かない場合も「発動」として数える=proc判定より前に記録)+
//    手動3箇所(ジャンク発射/援護射撃発射/救急鞄の払い出し)。
//  - recordOverclockProc: オーバークロック成立回数(setSubWeaponCooldownの成立分岐+援護射撃タイマー側)。
//  - recordDamageDealt(§6.21 M46): プレイヤー起因で敵に発生させたダメージ量をチャネル別に加算
//    (オーバーキル込み・HP床クランプ前のdmg値)。合流点=gameStore.damageEnemy(サブウェポン/爆発/DoT/
//    スラッシャー追撃/カウンター反撃クリ等の大半を1箇所でカバー。既定channel='other')+
//    近接カウンター振り3種(通常ナイフ/刀オート・一閃/鞭)の専用ブロック(channel='melee')+
//    スケーター系スキル2種(channel='other'・damageEnemyを通らない独自ブロックのため個別計測)。
//    gun/otherの分類は classifyProjectileDamageChannel(純関数)。
//  - recordFinisherKill(§6.21 M46): 気絶中の敵への近接即死(gameStoreの
//    killed.push({ enemy, finisher: true }) 箇所=通常ナイフ/刀/鞭の3箇所)。ダメージは加算しない
//    (即死はHPを経由しない=件数のみ)。
//  - recordMeleeSwing(§6.21 M46): 近接カウンター振り1回ごとに呼ぶ(hitCount=その振りで当てた敵数)。
//    累計 meleeSwings(振り回数)/meleeHits(命中数合計)。
//  - リセット: gameStore.resetGame(ラン開始)で全カウンタ0(実機/ヘッドレス両ハーネスをカバー)。
import type { SubWeaponKey } from '../types/game';

export interface BotDamageDealt {
  gun: number;
  melee: number;
  other: number;
}

export interface BotTelemetry {
  subUses: Partial<Record<SubWeaponKey, number>>;
  overclockProcs: number;
  damageDealt: BotDamageDealt;
  finisherKills: number;
  meleeSwings: number;
  meleeHits: number;
}

const createTelemetry = (): BotTelemetry => ({
  subUses: {},
  overclockProcs: 0,
  damageDealt: { gun: 0, melee: 0, other: 0 },
  finisherKills: 0,
  meleeSwings: 0,
  meleeHits: 0,
});

let telemetry: BotTelemetry = createTelemetry();

export const recordSubUse = (key: SubWeaponKey): void => {
  telemetry.subUses[key] = (telemetry.subUses[key] ?? 0) + 1;
};

export const recordOverclockProc = (): void => {
  telemetry.overclockProcs += 1;
};

export const recordDamageDealt = (channel: keyof BotDamageDealt, amount: number): void => {
  telemetry.damageDealt[channel] += amount;
};

export const recordFinisherKill = (): void => {
  telemetry.finisherKills += 1;
};

export const recordMeleeSwing = (hitCount: number): void => {
  telemetry.meleeSwings += 1;
  telemetry.meleeHits += hitCount;
};

export const getBotTelemetry = (): Readonly<BotTelemetry> => telemetry;

// アンカー保存用ディープコピー(実装精度の規律3: 生きた参照を保存すると差分が常に0になる)。
export const snapshotBotTelemetry = (): BotTelemetry => ({
  subUses: { ...telemetry.subUses },
  overclockProcs: telemetry.overclockProcs,
  damageDealt: { ...telemetry.damageDealt },
  finisherKills: telemetry.finisherKills,
  meleeSwings: telemetry.meleeSwings,
  meleeHits: telemetry.meleeHits,
});

export const resetBotTelemetry = (): void => {
  telemetry = createTelemetry();
};

// §6.21 M46: プレイヤー自身の銃弾ヒットか('gun')/それ以外のプレイヤー起因ダメージか('other')/
// プレイヤー起因ではないため計測除外か(null)を判定する純関数。gun = handgun/shotgun/rifle系+
// PHILL銃(phill-bullet)の実弾のみ。タレット/ジャンクウェポン等のサブウェポンはweaponKeyが'sub-'
// 始まりで、銃と同じ見た目のweaponType(例: タレット=handgun、ジャンクウェポン=shotgun)を流用する
// ことがあるため、weaponKeyの'sub-'接頭辞を先に見て'other'へ回す。護衛NPC弾(weaponKey='escort')は
// プレイヤー起因ではないため計測しない(null)。
const GUN_PROJECTILE_WEAPON_TYPES = new Set(['handgun', 'shotgun', 'rifle', 'phill-bullet']);

export const classifyProjectileDamageChannel = (
  weaponType: string | undefined,
  weaponKey: string | undefined,
): 'gun' | 'other' | null => {
  // BOT_AND_GHOST.md G2: ゴーストの銃弾(weaponKey='ghost-gun')はescortと同じ「プレイヤー起因ではない」
  // 扱い=計測除外(null)。ゴーストはプレイヤーの装備を借りるだけで、プレイヤー自身の攻撃ではない
  // (§2.6の計測はプレイヤー本人の傾向を測るためのものなので、ここで混ぜると次世代のゴーストが
  // 「ゴーストと一緒に戦った自分」の劣化コピーになる=§2.7 制約1と同根の理由)。
  // v0.25.2525: 守護霊の反射弾('ghost-reflect'=weaponUtils.GHOST_REFLECT_WEAPON_KEY)も同じ理由で
  // 計測除外(文字列で書くのは 'ghost-gun'/'escort' と同じ流儀=このモジュールはweaponUtilsを引かない)。
  if (weaponKey === 'escort' || weaponKey === 'ghost-gun' || weaponKey === 'ghost-reflect') return null;
  if (weaponKey?.startsWith('sub-')) return 'other';
  return weaponType !== undefined && GUN_PROJECTILE_WEAPON_TYPES.has(weaponType) ? 'gun' : 'other';
};
