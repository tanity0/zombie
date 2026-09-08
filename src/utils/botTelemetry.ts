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
//  - recordCritHit(PACING_PUZZLE.md §7-11c(4)): クリ計測口。挙動は一切変えない=数えるだけ。
//    kind='rng'=確率抽選で成立したクリ(銃の着弾ロール/近接クリ)/'guaranteed'=確定クリ
//    (カウンター反撃/meleeExecuteの紐づく紫中フィニッシュ/PHILLヘッドショット)/'none'=非クリ命中。
//    isBoss=対象がisBossType(ボスとして扱われる型)か(=対ボス/対雑魚の内訳)。
//  - リセット: gameStore.resetGame(ラン開始)で全カウンタ0(実機/ヘッドレス両ハーネスをカバー)。
import type { SubWeaponKey } from '../types/game';

export interface BotDamageDealt {
  gun: number;
  melee: number;
  other: number;
}

export interface BotCritBucket {
  rngCrits: number;
  guaranteedCrits: number;
  hits: number;
}

export interface BotCritStats {
  total: BotCritBucket;
  vsBoss: BotCritBucket;
  vsTrash: BotCritBucket;
}

export type CritKind = 'rng' | 'guaranteed' | 'none';

export interface BotTelemetry {
  subUses: Partial<Record<SubWeaponKey, number>>;
  overclockProcs: number;
  damageDealt: BotDamageDealt;
  finisherKills: number;
  meleeSwings: number;
  meleeHits: number;
  critStats: BotCritStats;
  // research/WEAPON_AI_TEST.md S2-a(全武器AI実機テスト・道具作り専用): 「起きた回数」だけを数える
  // 武器観測カウンタ。挙動・数値は一切不変(計測のみ)。
  projectilesSpawned: number; // addProjectile合流点。敵弾(hostile:true)は除く(=プレイヤー側の発射/投射)。
  explosions: number;         // グレネード/ロケットランチャー系の着弾爆発(壁ヒット含む)。
  beamPulses: number;         // 持続線分/扇の共通適用口(applyBeamPulse)=金環/氷槍床/アイレーザー/火炎放射器。
  postureBroken: number;      // 体勢(紫)を割った回数(applyBossPostureDamageのtriggered=trueの回数)。
  stonesAttached: number;     // 錬金砲: 破裂で石を付着させた敵の数。
  stoneDetonations: number;   // 錬金砲: 起爆(detonateAlchemyStones)を実行した回数。
  cratesDropped: number;      // 武器クレート(weapon-crate)がaddPickupされた回数。
  currencyDropped: number;    // トレジャー(dropEnemyCurrency)が実際に落ちた回数。
  reloads: number;            // リロード成立の合計(通常/クイックマガジン/オーバークロック覚醒の3経路)。
  manualShots: number;        // 手動アクション(レールガン/シグナルランチャー)の発射成立回数。
  meleeFromGun: number;       // ガンブレードの至近モードで近接ダメージが成立した回数。
  // research/WEAPON_AI_TEST.md S3-b(パイルドライバー「KB>0」の観測用): knockbackUntilはDate.now基準
  // (280ms)でサンプリング(毎秒未満)だと窓を外しやすいため、カウンタで確実に拾う(挙動不変・計測のみ)。
  gunKnockbacks: number;      // 弾のノックバック(useGameLoop.tsのprojectile.knockbackMult経路)成立回数。
}

const createCritBucket = (): BotCritBucket => ({ rngCrits: 0, guaranteedCrits: 0, hits: 0 });
const createCritStats = (): BotCritStats => ({ total: createCritBucket(), vsBoss: createCritBucket(), vsTrash: createCritBucket() });
const copyCritBucket = (b: BotCritBucket): BotCritBucket => ({ ...b });
const copyCritStats = (s: BotCritStats): BotCritStats =>
  ({ total: copyCritBucket(s.total), vsBoss: copyCritBucket(s.vsBoss), vsTrash: copyCritBucket(s.vsTrash) });

const createTelemetry = (): BotTelemetry => ({
  subUses: {},
  overclockProcs: 0,
  damageDealt: { gun: 0, melee: 0, other: 0 },
  finisherKills: 0,
  meleeSwings: 0,
  meleeHits: 0,
  critStats: createCritStats(),
  projectilesSpawned: 0,
  explosions: 0,
  beamPulses: 0,
  postureBroken: 0,
  stonesAttached: 0,
  stoneDetonations: 0,
  cratesDropped: 0,
  currencyDropped: 0,
  reloads: 0,
  manualShots: 0,
  meleeFromGun: 0,
  gunKnockbacks: 0,
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

// PACING_PUZZLE.md §7-11c(4): クリ計測口。挙動は一切変えない=数えるだけ(呼び出し側のダメージ計算/
// クリ判定そのものには一切影響しない)。hit=1回のヒット判定ごとに1回呼ぶ想定。
export const recordCritHit = (kind: CritKind, isBoss: boolean): void => {
  const bucket = isBoss ? telemetry.critStats.vsBoss : telemetry.critStats.vsTrash;
  bucket.hits += 1;
  telemetry.critStats.total.hits += 1;
  if (kind === 'rng') {
    bucket.rngCrits += 1;
    telemetry.critStats.total.rngCrits += 1;
  } else if (kind === 'guaranteed') {
    bucket.guaranteedCrits += 1;
    telemetry.critStats.total.guaranteedCrits += 1;
  }
};

export const getBotTelemetry = (): Readonly<BotTelemetry> => telemetry;

// research/WEAPON_AI_TEST.md S2-a: 「起きた回数」だけを数えるカウンタ群。挙動は一切変えない。
export const recordProjectileSpawned = (): void => { telemetry.projectilesSpawned += 1; };
export const recordExplosion = (): void => { telemetry.explosions += 1; };
export const recordBeamPulse = (): void => { telemetry.beamPulses += 1; };
export const recordPostureBroken = (): void => { telemetry.postureBroken += 1; };
export const recordStonesAttached = (count: number): void => { telemetry.stonesAttached += count; };
export const recordStoneDetonation = (): void => { telemetry.stoneDetonations += 1; };
export const recordCrateDropped = (): void => { telemetry.cratesDropped += 1; };
export const recordCurrencyDropped = (): void => { telemetry.currencyDropped += 1; };
export const recordReload = (): void => { telemetry.reloads += 1; };
export const recordManualShot = (): void => { telemetry.manualShots += 1; };
export const recordMeleeFromGun = (): void => { telemetry.meleeFromGun += 1; };
export const recordGunKnockback = (): void => { telemetry.gunKnockbacks += 1; };

// アンカー保存用ディープコピー(実装精度の規律3: 生きた参照を保存すると差分が常に0になる)。
export const snapshotBotTelemetry = (): BotTelemetry => ({
  subUses: { ...telemetry.subUses },
  overclockProcs: telemetry.overclockProcs,
  damageDealt: { ...telemetry.damageDealt },
  finisherKills: telemetry.finisherKills,
  meleeSwings: telemetry.meleeSwings,
  meleeHits: telemetry.meleeHits,
  critStats: copyCritStats(telemetry.critStats),
  projectilesSpawned: telemetry.projectilesSpawned,
  explosions: telemetry.explosions,
  beamPulses: telemetry.beamPulses,
  postureBroken: telemetry.postureBroken,
  stonesAttached: telemetry.stonesAttached,
  stoneDetonations: telemetry.stoneDetonations,
  cratesDropped: telemetry.cratesDropped,
  currencyDropped: telemetry.currencyDropped,
  reloads: telemetry.reloads,
  manualShots: telemetry.manualShots,
  meleeFromGun: telemetry.meleeFromGun,
  gunKnockbacks: telemetry.gunKnockbacks,
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
