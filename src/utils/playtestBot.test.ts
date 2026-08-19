import { describe, it, expect } from 'vitest';
import { decideBotInput, wanderDirForSeed, pickupSeekInput, BOT_PERSONAS,
  torchForageInput, TORCH_SEEK_DIST, TORCH_SMASH_DIST,
  avoidMerchantZone, MERCHANT_AVOID_RADIUS,
  adjustBotForMines, MINE_AVOID_RADIUS, MINE_SMASH_DIST,
  decideCounterReaction, createCounterThreatState, STUNNED_CHASE_MAX_DIST,
  escapeIfStuck, createBotStuckState, BOT_STUCK_SAMPLE_TICKS, BOT_STUCK_SAMPLES, BOT_STUCK_ESCAPE_TICKS,
  separationAdjust, SEPARATION_DIST, CONTACT_COUNTER_DIST } from './playtestBot';
import { botSkillProfile } from './botSkill';
import { useGameStore } from '../store/gameStore';
import { spawnEnemyAt } from './enemyUtils';
import type { Enemy, Projectile } from '../types/game';

const freshPlayer = () => {
  useGameStore.getState().resetGame('warrior');
  return useGameStore.getState().player;
};

describe('decideBotInput', () => {
  it('lists exactly the 5 spec\'d personas', () => {
    expect(BOT_PERSONAS).toEqual(['standard', 'kiter', 'stationary', 'boar', 'wanderer']);
  });

  it('wanderer ignores enemies and always returns its seeded fixed direction, never melees', () => {
    const player = freshPlayer();
    const enemy = spawnEnemyAt('zombie', player.x + 10, player.y, 0);
    const d0 = decideBotInput('wanderer', player, [enemy], 0, 0, 0);
    const d1 = decideBotInput('wanderer', player, [enemy], 0, 500, 0);
    expect(d0.input).toEqual(wanderDirForSeed(0));
    expect(d1.input).toEqual(wanderDirForSeed(0)); // same seed → same direction regardless of tick
    expect(d0.wantsMelee).toBe(false);
    expect(d1.wantsMelee).toBe(false);
  });

  it('stationary never moves but melees an enemy within engage range', () => {
    const player = freshPlayer();
    const close = spawnEnemyAt('zombie', player.x + player.width / 2 + 20, player.y + player.height / 2, 0);
    const d = decideBotInput('stationary', player, [close], 0, 0, 0);
    expect(d.input).toEqual({ up: false, down: false, left: false, right: false });
    expect(d.wantsMelee).toBe(true);
  });

  it('stationary does not melee when nothing is in range', () => {
    const player = freshPlayer();
    const far = spawnEnemyAt('zombie', player.x + 900, player.y + 900, 0);
    const d = decideBotInput('stationary', player, [far], 0, 0, 0);
    expect(d.wantsMelee).toBe(false);
  });

  it('kiter always moves away from the nearest enemy and never melees', () => {
    const player = freshPlayer();
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    const enemy = spawnEnemyAt('zombie', pcx + 50, pcy, 0);
    const d = decideBotInput('kiter', player, [enemy], 0, 0, 0);
    expect(d.input.left).toBe(true);  // enemy is to the right → kite left
    expect(d.input.right).toBe(false);
    expect(d.wantsMelee).toBe(false);
  });

  it('boar always rushes the nearest enemy and melees once in range', () => {
    const player = freshPlayer();
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    const far = spawnEnemyAt('zombie', pcx + 500, pcy, 0);
    const dFar = decideBotInput('boar', player, [far], 0, 0, 0);
    expect(dFar.input.right).toBe(true); // approaches
    expect(dFar.wantsMelee).toBe(false); // still out of melee range

    const close = spawnEnemyAt('zombie', pcx + 20, pcy, 0);
    const dClose = decideBotInput('boar', player, [close], 0, 0, 0);
    expect(dClose.wantsMelee).toBe(true);
  });

  it('standard retreats when surrounded by >=3 nearby enemies instead of approaching', () => {
    const player = freshPlayer();
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    const ring = [
      spawnEnemyAt('zombie', pcx + 60, pcy, 0),
      spawnEnemyAt('zombie', pcx - 60, pcy, 0),
      spawnEnemyAt('zombie', pcx, pcy + 60, 0),
    ];
    const d = decideBotInput('standard', player, ring, 0, 0, 0);
    // nearest target is to the right (first in list ties by insertion) → retreating means moving left
    expect(d.input.left || d.input.up || d.input.down).toBe(true);
  });

  // ★v0.25.3553(社長報告「間に敵がいてもお構いなしに突っ込んでいってる」・社長GO済み):
  // 処刑優先に距離の上限(STUNNED_CHASE_MAX_DIST)を入れたため、この旧テストの前提
  // (200px先の気絶敵を無条件で追う)は**意図的に廃止**した。近い気絶敵を優先することは不変。
  it('standard prioritizes a stunned enemy over a closer non-stunned one — 上限の内側なら従来どおり', () => {
    const player = freshPlayer();
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    const closeHealthy = spawnEnemyAt('zombie', pcx - 30, pcy, 0);
    const fartherStunned = { ...spawnEnemyAt('zombie', pcx + (STUNNED_CHASE_MAX_DIST - 20), pcy, 0), stunUntil: 5000 };
    const d = decideBotInput('standard', player, [closeHealthy, fartherStunned], 1000, 0, 0);
    // 気絶敵は上限の内側=従来どおり優先し、近接射程より遠いので寄っていく。
    expect(d.input.right).toBe(true);
    expect(d.wantsMelee).toBe(false);
  });

  it('standard does nothing when no enemies are present, but still cycles weapon periodically', () => {
    const player = freshPlayer();
    const d1 = decideBotInput('standard', player, [], 0, 1, 0);
    expect(d1.input).toEqual({ up: false, down: false, left: false, right: false });
    expect(d1.wantsWeaponSwitch).toBe(false);
    const d1200 = decideBotInput('standard', player, [], 0, 1200, 0);
    expect(d1200.wantsWeaponSwitch).toBe(true);
  });

  it('kiter holds in the gun-range band and approaches when the target is out of range (M26 Step1)', () => {
    const player = freshPlayer();
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    // range=200 指定: バンド=[110, 180]。中(150)=静止 / 外(400)=接近 / 近(50)=退避。
    const mid = spawnEnemyAt('zombie', pcx + 150 - 15, pcy - 15, 0); // 中心距離≈150
    expect(decideBotInput('kiter', player, [mid], 0, 0, 0, undefined, 200).input)
      .toEqual({ up: false, down: false, left: false, right: false });
    const far = spawnEnemyAt('zombie', pcx + 400 - 15, pcy - 15, 0);
    expect(decideBotInput('kiter', player, [far], 0, 0, 0, undefined, 200).input.right).toBe(true);
    const near = spawnEnemyAt('zombie', pcx + 50 - 15, pcy - 15, 0);
    expect(decideBotInput('kiter', player, [near], 0, 0, 0, undefined, 200).input.left).toBe(true);
  });

  // M49-2(§6.25): 危険度ベースの距離維持。
  // 注: decideBotInput内の距離計算(distTo)は敵のraw座標(e.x/e.y)基準なので、以下は敵をプレイヤーと
  // 同じy(e.y=pcy)に置き、e.x=pcx+距離、として距離を正確に固定する(centerではない・既存慣例と同じ)。
  it('kiter: 危険な敵(reaper=接触ダメージ999)にはavoidContactDist(160・master/skilled)未満まで詰めない', () => {
    const player = freshPlayer();
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    // range=200指定: 従来のバンド下限=110。危険敵なのでmax(110,160)=160が新しい下限になる。
    const between = spawnEnemyAt('reaper', pcx + 130, pcy, 0); // 距離130(110<130<160)
    expect(decideBotInput('kiter', player, [between], 0, 0, 0, undefined, 200, undefined, 'master').input.left).toBe(true);
    // casual(avoidContactDist=0)は従来どおり=130は下限110より外なので静止。
    expect(decideBotInput('kiter', player, [between], 0, 0, 0, undefined, 200, undefined, 'casual').input)
      .toEqual({ up: false, down: false, left: false, right: false });
  });

  it('kiter: 危険でない敵がいない時は従来と完全に同値(不変条件)', () => {
    const player = freshPlayer();
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    const mid = spawnEnemyAt('zombie', pcx + 150, pcy, 0);
    const master = decideBotInput('kiter', player, [mid], 0, 0, 0, undefined, 200, undefined, 'master');
    const noSkill = decideBotInput('kiter', player, [mid], 0, 0, 0, undefined, 200);
    expect(master.input).toEqual(noSkill.input);
  });

  it('standard/scavenger: meleeVsDanger=falseの段(skilled/master)は危険敵(reaper)にwantsMeleeを出さず、距離を保つ', () => {
    const player = freshPlayer();
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    const dangerNear = spawnEnemyAt('reaper', pcx + 30, pcy, 0); // 距離30(近接圏内)
    const masterD = decideBotInput('standard', player, [dangerNear], 0, 0, 0, undefined, undefined, undefined, 'master');
    expect(masterD.wantsMelee).toBe(false);
    expect(masterD.input.left || masterD.input.up || masterD.input.down).toBe(true); // 近寄らず離れる
    // casual(meleeVsDanger=true)は危険でも従来どおり近接する。
    const casualD = decideBotInput('standard', player, [dangerNear], 0, 0, 0, undefined, undefined, undefined, 'casual');
    expect(casualD.wantsMelee).toBe(true);
  });

  it('standard: meleeVsDanger=falseの段でも危険でない敵(zombie)には従来どおりwantsMeleeを出す', () => {
    const player = freshPlayer();
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    const safeNear = spawnEnemyAt('zombie', pcx + 30, pcy, 0);
    const masterD = decideBotInput('standard', player, [safeNear], 0, 0, 0, undefined, undefined, undefined, 'master');
    expect(masterD.wantsMelee).toBe(true);
  });

  it('standard: engageDistより遠い敵は追わない(段ごとに射程が違う)', () => {
    const player = freshPlayer();
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    const far = spawnEnemyAt('zombie', pcx + 300, pcy, 0); // 距離300: novice(200)は圏外・master(420)は圏内
    const noviceD = decideBotInput('standard', player, [far], 0, 0, 0, undefined, undefined, undefined, 'novice');
    expect(noviceD.input).toEqual({ up: false, down: false, left: false, right: false }); // 対象なし=待機
    const masterD = decideBotInput('standard', player, [far], 0, 0, 0, undefined, undefined, undefined, 'master');
    expect(masterD.input.right).toBe(true); // 圏内=追う
  });
});

// M49-1/M49-2(§6.25): decideBotInputはcontactDodge/isContactDangerousを直接呼ばないが、
// dodgeVector側でmaxHealthを渡した時だけ危険敵から離れることをbotSkill.test.tsで検証済み。
// ここではplaytestBot側(engageDecision/kiterの距離維持)の危険敵ヘルパーの整合性のみ確認する。
describe('危険敵ヘルパーの整合性(M49-1/M49-2)', () => {
  it('reaper(damage=999)はプレイヤー既定maxHealth(120)に対して危険と判定される', () => {
    const player = freshPlayer();
    const e: Enemy = spawnEnemyAt('reaper', 0, 0, 0);
    expect(e.damage).toBeGreaterThanOrEqual(player.maxHealth * 0.2);
  });
});

describe('pickupSeekInput (M26 Step1: 手空き時の拾い)', () => {
  const IDLE = { up: false, down: false, left: false, right: false };
  it('入力が空いていて近くにピックアップがあれば、そこへ向かう', () => {
    const input = pickupSeekInput('kiter', IDLE, 100, 100, [{ x: 100 + 92, y: 100 - 8 }]); // 中心=+100,右
    expect(input.right).toBe(true);
  });
  it('本来の入力がある時は上書きしない', () => {
    const moving = { up: true, down: false, left: false, right: false };
    expect(pickupSeekInput('kiter', moving, 100, 100, [{ x: 192, y: 92 }])).toBe(moving);
  });
  it('stationary(棒立ちが仕様)は拾いに行かない', () => {
    expect(pickupSeekInput('stationary', IDLE, 100, 100, [{ x: 192, y: 92 }])).toBe(IDLE);
  });
  it('maxDistより遠いピックアップは無視する', () => {
    expect(pickupSeekInput('kiter', IDLE, 0, 0, [{ x: 5000, y: 5000 }])).toEqual(IDLE);
  });
});

// M38(§6.15): 松明フォレージ(手空きのみ発火・松明を壊してスクラップ供給を作る・PACING_PUZZLE.md §6.15)。
describe('torchForageInput (M38: 松明フォレージ)', () => {
  const IDLE = { up: false, down: false, left: false, right: false };
  const MOVING = { up: true, down: false, left: false, right: false };

  it('手空きでTORCH_SEEK_DIST(240)以内の最寄り松明へ歩み寄る', () => {
    const r = torchForageInput('standard', IDLE, 0, 0, [{ footX: 200, footY: 0 }]);
    expect(r.input.right).toBe(true);
    expect(r.wantsMelee).toBe(false);
    expect(TORCH_SEEK_DIST).toBe(240);
  });

  it('TORCH_SMASH_DIST(60)以内ならwantsMelee=true・移動は追加しない(叩く優先)', () => {
    const r = torchForageInput('standard', IDLE, 0, 0, [{ footX: 50, footY: 0 }]);
    expect(r.wantsMelee).toBe(true);
    expect(r.input).toBe(IDLE);
    expect(TORCH_SMASH_DIST).toBe(60);
  });

  it('移動入力がある時は不干渉(そのまま返す・叩けるほど近くても無視)', () => {
    const r = torchForageInput('standard', MOVING, 0, 0, [{ footX: 10, footY: 0 }]);
    expect(r.input).toBe(MOVING);
    expect(r.wantsMelee).toBe(false);
  });

  it('stationaryは除外(棒立ちが仕様)', () => {
    const r = torchForageInput('stationary', IDLE, 0, 0, [{ footX: 10, footY: 0 }]);
    expect(r.input).toBe(IDLE);
    expect(r.wantsMelee).toBe(false);
  });

  it('rusherは除外(カウンター/寄り道を一切しない低スキル再現=M19の設計意図)', () => {
    const r = torchForageInput('rusher', IDLE, 0, 0, [{ footX: 10, footY: 0 }]);
    expect(r.input).toBe(IDLE);
    expect(r.wantsMelee).toBe(false);
  });

  it('TORCH_SEEK_DISTより遠い松明は無視する', () => {
    const r = torchForageInput('standard', IDLE, 0, 0, [{ footX: 300, footY: 0 }]);
    expect(r.input).toBe(IDLE);
    expect(r.wantsMelee).toBe(false);
  });

  it('松明が無ければ入力もwantsMeleeも不変(同一参照)', () => {
    const r = torchForageInput('kiter', IDLE, 0, 0, []);
    expect(r.input).toBe(IDLE);
    expect(r.wantsMelee).toBe(false);
  });
});

describe('avoidMerchantZone (M39: 商人ゾーン回避=社長指示「用がなければ避ける」)', () => {
  const IDLE = { up: false, down: false, left: false, right: false };
  const RIGHT = { up: false, down: false, left: false, right: true };

  it('ゾーン内(<90px)に居たら手空きでも外向きへ歩いて出る', () => {
    const out = avoidMerchantZone('standard', IDLE, 100, 100, { x: 150, y: 100 }); // 商人=右50px
    expect(out.left).toBe(true);
    expect(out.right).toBe(false);
    expect(MERCHANT_AVOID_RADIUS).toBe(90);
  });

  it('進行方向の先にゾーンが掠る時は前進を保ったまま横へ逸れる', () => {
    const out = avoidMerchantZone('standard', RIGHT, 0, 0, { x: 130, y: 0 }); // 前方130px(<2R)・真正面
    expect(out.right).toBe(true);
    expect(out.up || out.down).toBe(true);
  });

  it('ゾーンと逆向きの移動は不干渉(同一参照)', () => {
    const out = avoidMerchantZone('standard', RIGHT, 0, 0, { x: -130, y: 0 }); // 商人は後方
    expect(out).toBe(RIGHT);
  });

  it('遠い商人(>=2R)は不干渉(同一参照)', () => {
    const out = avoidMerchantZone('standard', RIGHT, 0, 0, { x: 400, y: 0 });
    expect(out).toBe(RIGHT);
  });

  it('進路がゾーンを掠めない(垂直距離>=R)なら不干渉', () => {
    const out = avoidMerchantZone('standard', RIGHT, 0, 0, { x: 100, y: 120 }); // 右前方だが十分下
    expect(out).toBe(RIGHT);
  });

  it('stationaryは動かさない(棒立ちが仕様。ゾーン内でも不干渉)', () => {
    const out = avoidMerchantZone('stationary', IDLE, 100, 100, { x: 110, y: 100 });
    expect(out).toBe(IDLE);
  });
});

// M34(§6.11): 緑卵(地雷)を避ける/叩く(ボット入力のみの後段補正)。
describe('adjustBotForMines (M34: 緑卵を避ける/叩く)', () => {
  const RIGHT = { up: false, down: false, left: false, right: true };
  const STILL = { up: false, down: false, left: false, right: false };

  it('卵が無ければ入力もwantsMeleeも不変(同一参照)', () => {
    const r = adjustBotForMines(RIGHT, false, 0, 0, []);
    expect(r.input).toBe(RIGHT);
    expect(r.wantsMelee).toBe(false);
  });

  // ★v0.25.3489(社長指示「赤くなった緑卵は割り、緑のからは距離を取る」):
  // 赤(armedAt あり)= 近接で割れば**無害に解除できる**(combatTick.ts の注記)。
  // 緑(armedAt なし)= 80px以内に入ると**アームされて1.5秒後に爆発**する。
  // よって扱いは逆。旧実装は状態を見ずに叩き/回避していたため、自分でアームさせていた。
  const RED = (x: number, y = 0) => ({ footX: x, footY: y, armedAt: 1000 });
  const GREEN = (x: number, y = 0) => ({ footX: x, footY: y });

  it('★赤(アーム済み)がMINE_SMASH_DIST(60)以内なら叩く・移動入力は不変', () => {
    const r = adjustBotForMines(RIGHT, false, 0, 0, [RED(50)]);
    expect(r.wantsMelee).toBe(true);
    expect(r.input).toBe(RIGHT); // 反発合成はしない(叩ける距離なら叩く)
    expect(MINE_SMASH_DIST).toBe(60);
  });

  it('★緑(未アーム)は近くても叩かない(叩きに行くと自分でアームさせるため)', () => {
    const r = adjustBotForMines(RIGHT, false, 0, 0, [GREEN(50)]);
    expect(r.wantsMelee).toBe(false);
  });

  it('★避ける半径は起爆圏(80px)より外にある=避け始める前にアームさせない', () => {
    expect(MINE_AVOID_RADIUS).toBeGreaterThan(80);
  });

  it('避ける: 前方の緑卵は反発で進路が曲がる(右進行+右前方の緑→上へ逸れる)', () => {
    const r = adjustBotForMines(RIGHT, false, 0, 0, [GREEN(90, 6)]);
    expect(r.wantsMelee).toBe(false);
    expect(r.input).not.toEqual(RIGHT);
    expect(r.input.up).toBe(true);
  });

  it('★赤は回避の対象にしない(遠ざけると導火が進んで結局爆発するため)', () => {
    const r = adjustBotForMines(RIGHT, false, 0, 0, [RED(90, 6)]);
    expect(r.input).toBe(RIGHT); // 進路を曲げない
    expect(r.wantsMelee).toBe(false); // まだ叩ける距離ではない
  });

  it('後方の緑卵は避けない(既に離れる向き=蛇行しない)', () => {
    const r = adjustBotForMines(RIGHT, false, 0, 0, [GREEN(-90)]);
    expect(r.input).toBe(RIGHT);
    expect(r.wantsMelee).toBe(false);
  });

  it('静止中(移動入力なし)は動かさない=ペルソナ判断を尊重(smash距離外)', () => {
    const r = adjustBotForMines(STILL, false, 0, 0, [GREEN(90)]);
    expect(r.input).toBe(STILL);
    expect(r.wantsMelee).toBe(false);
  });

  it('真正面の緑卵でも決定的に逸れる(cross=0は右側扱い→上へ45°)', () => {
    const r = adjustBotForMines(RIGHT, false, 0, 0, [GREEN(90)]);
    expect(r.wantsMelee).toBe(false);
    expect(r.input.up).toBe(true);
    expect(r.input.right).toBe(true);
  });

  it('赤と緑が混在: 赤は割りに行き、緑の回避より優先される', () => {
    const r = adjustBotForMines(RIGHT, false, 0, 0, [GREEN(90, 6), RED(50)]);
    expect(r.wantsMelee).toBe(true);
    expect(r.input).toBe(RIGHT);
  });

  it('卵が進行の左上側なら下へ逸れる(反対側ステア)', () => {
    const r = adjustBotForMines(RIGHT, false, 0, 0, [{ footX: 62, footY: -10 }]);
    expect(r.input.down).toBe(true);
    expect(r.input.right).toBe(true);
  });

  it('wantsMeleeが元からtrueなら維持される(敵への近接判断を消さない)', () => {
    const r = adjustBotForMines(RIGHT, true, 0, 0, [{ footX: 200, footY: 200 }]);
    expect(r.wantsMelee).toBe(true);
  });
});

// M37(§6.14): 人間反応のカウンター(ジャンプ攻撃/突進/敵弾を反応遅延+試行確率でカウンター)。
const buildProjectile = (over: Partial<Projectile>): Projectile => ({
  id: `t-proj-${Math.random().toString(36).slice(2)}`,
  x: 0, y: 0, width: 8, height: 8, speed: 300, damage: 10,
  direction: { x: 1, y: 0 }, weaponType: 'enemy_bolt', duration: 1400,
  createdAt: Date.now(), passthrough: false, hitEnemies: [],
  hostile: false, reflected: false, ...over,
});

describe('decideCounterReaction (M37: 人間反応のカウンター・PACING_PUZZLE.md §6.14)', () => {
  const rand0 = () => 0; // 常に試行成功(0 < chance)
  const rand1 = () => 1; // 常に見逃し(1 >= chance)

  it('ジャンプ接近(距離200px以内・着地点が自分の近く)を検知し、反応遅延(standard=250ms)後にwantsMelee', () => {
    const player = freshPlayer();
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    const jumper = { ...spawnEnemyAt('pumpkin', pcx + 100, pcy, 0), aiPhase: 'jump' as const, aiTargetX: pcx, aiTargetY: pcy };
    const state = createCounterThreatState();
    expect(decideCounterReaction('standard', state, pcx, pcy, [jumper], [], 0, 0, rand0)).toBe(false); // 遅延前は撃たない
    expect(decideCounterReaction('standard', state, pcx, pcy, [jumper], [], 250, 0, rand0)).toBe(true);
  });

  it('遅延中に脅威(ジャンプ)が消えたら、元の遅延を過ぎても撃たない', () => {
    const player = freshPlayer();
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    const jumper = { ...spawnEnemyAt('pumpkin', pcx + 100, pcy, 0), aiPhase: 'jump' as const, aiTargetX: pcx, aiTargetY: pcy };
    const state = createCounterThreatState();
    expect(decideCounterReaction('standard', state, pcx, pcy, [jumper], [], 0, 0, rand0)).toBe(false);
    expect(decideCounterReaction('standard', state, pcx, pcy, [], [], 100, 0, rand0)).toBe(false); // 着地=脅威消滅
    expect(decideCounterReaction('standard', state, pcx, pcy, [], [], 300, 0, rand0)).toBe(false); // 250ms超過後も撃たない
  });

  it('乱数固定で決定的: 試行抽選(chance)に外れた検知は、遅延後も撃たない', () => {
    const player = freshPlayer();
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    const jumper = { ...spawnEnemyAt('pumpkin', pcx + 100, pcy, 0), aiPhase: 'jump' as const, aiTargetX: pcx, aiTargetY: pcy };
    const state = createCounterThreatState();
    expect(decideCounterReaction('standard', state, pcx, pcy, [jumper], [], 0, 0, rand1)).toBe(false);
    expect(decideCounterReaction('standard', state, pcx, pcy, [jumper], [], 250, 0, rand1)).toBe(false);
  });

  it('既存のカウンターCD(counterCooldownEnd)中は、反応遅延・試行に成功していても撃たない', () => {
    const player = freshPlayer();
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    const jumper = { ...spawnEnemyAt('pumpkin', pcx + 100, pcy, 0), aiPhase: 'jump' as const, aiTargetX: pcx, aiTargetY: pcy };
    const state = createCounterThreatState();
    decideCounterReaction('standard', state, pcx, pcy, [jumper], [], 0, 0, rand0); // 検知
    expect(decideCounterReaction('standard', state, pcx, pcy, [jumper], [], 250, 500, rand0)).toBe(false); // CD明けは500
    expect(decideCounterReaction('standard', state, pcx, pcy, [jumper], [], 500, 500, rand0)).toBe(true); // CD明け後は撃つ
  });

  it('突進(charge・距離180px以内・進行方向が自分へ向いている)を検知する(boar=200ms)', () => {
    const player = freshPlayer();
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    const charger = { ...spawnEnemyAt('werewolf', pcx + 100, pcy, 0), aiPhase: 'charge' as const, vx: -300, vy: 0 };
    const state = createCounterThreatState();
    expect(decideCounterReaction('boar', state, pcx, pcy, [charger], [], 0, 0, rand0)).toBe(false);
    expect(decideCounterReaction('boar', state, pcx, pcy, [charger], [], 200, 0, rand0)).toBe(true);
  });

  it('突進の進行方向が自分と逆なら検知しない(かすめて通り過ぎるだけの突進)', () => {
    const player = freshPlayer();
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    const charger = { ...spawnEnemyAt('werewolf', pcx + 100, pcy, 0), aiPhase: 'charge' as const, vx: 300, vy: 0 };
    const state = createCounterThreatState();
    expect(decideCounterReaction('boar', state, pcx, pcy, [charger], [], 0, 0, rand0)).toBe(false);
    expect(decideCounterReaction('boar', state, pcx, pcy, [charger], [], 300, 0, rand0)).toBe(false);
  });

  it('rusher=低スキル再現(M19試験専用)なのでカウンターは常に無効(社長裁定v0.25.1724)', () => {
    const player = freshPlayer();
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    const charger = { ...spawnEnemyAt('werewolf', pcx + 100, pcy, 0), aiPhase: 'charge' as const, vx: -300, vy: 0 };
    const state = createCounterThreatState();
    expect(decideCounterReaction('rusher', state, pcx, pcy, [charger], [], 0, 0, rand0)).toBe(false);
    expect(decideCounterReaction('rusher', state, pcx, pcy, [charger], [], 1000, 0, rand0)).toBe(false);
  });

  it('敵弾(接近中・距離160px以内・到達予測400ms未満)を検知する(kiter=300ms)', () => {
    const player = freshPlayer();
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    const bolt = buildProjectile({ x: pcx - 104, y: pcy - 4, direction: { x: 1, y: 0 }, speed: 400, hostile: true });
    const state = createCounterThreatState();
    expect(decideCounterReaction('kiter', state, pcx, pcy, [], [bolt], 0, 0, rand0)).toBe(false);
    expect(decideCounterReaction('kiter', state, pcx, pcy, [], [bolt], 300, 0, rand0)).toBe(true);
  });

  it('自分から遠ざかる敵弾(接近中ではない)は検知しない', () => {
    const player = freshPlayer();
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    const bolt = buildProjectile({ x: pcx - 104, y: pcy - 4, direction: { x: -1, y: 0 }, speed: 400, hostile: true });
    const state = createCounterThreatState();
    expect(decideCounterReaction('kiter', state, pcx, pcy, [], [bolt], 0, 0, rand0)).toBe(false);
    expect(decideCounterReaction('kiter', state, pcx, pcy, [], [bolt], 400, 0, rand0)).toBe(false);
  });

  it('プロファイル未掲載のペルソナ(stationary)は常に無効(棒立ちが仕様=挙動不変)', () => {
    const player = freshPlayer();
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    const jumper = { ...spawnEnemyAt('pumpkin', pcx + 100, pcy, 0), aiPhase: 'jump' as const, aiTargetX: pcx, aiTargetY: pcy };
    const state = createCounterThreatState();
    expect(decideCounterReaction('stationary', state, pcx, pcy, [jumper], [], 0, 0, rand0)).toBe(false);
    expect(decideCounterReaction('stationary', state, pcx, pcy, [jumper], [], 1000, 0, rand0)).toBe(false);
  });

  it('発火後は同じ脅威が続いている間は連射しない', () => {
    const player = freshPlayer();
    const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
    const jumper = { ...spawnEnemyAt('pumpkin', pcx + 100, pcy, 0), aiPhase: 'jump' as const, aiTargetX: pcx, aiTargetY: pcy };
    const state = createCounterThreatState();
    decideCounterReaction('standard', state, pcx, pcy, [jumper], [], 0, 0, rand0);
    expect(decideCounterReaction('standard', state, pcx, pcy, [jumper], [], 250, 0, rand0)).toBe(true);
    expect(decideCounterReaction('standard', state, pcx, pcy, [jumper], [], 260, 0, rand0)).toBe(false);
  });
});


describe('★処刑優先の距離制限(社長報告v0.25.3553「間に敵がいてもお構いなしに突っ込んでいってる」)', () => {
  // 旧実装は nearestStunned が engageDist(casual=260px)の中なら**無条件で標的選択を上書き**していた。
  // 腕前設定も危険度も、間に何体いるかも見ず、移動は標的への直線入力(障害物も敵も避けない)。
  // ⇒ 群れを突っ切って気絶敵へ突っ込む。処刑優先は残しつつ、**距離の上限**で歯止めをかけた。

  const stun = (e: Enemy, gameTime: number): Enemy => ({ ...e, stunUntil: gameTime + 5000 });

  it('★遠くの気絶敵より、近くの通常敵を選ぶ(フィールドを横断して取りに行かない)', () => {
    const player = freshPlayer();
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;
    // 気絶敵は上限の外(右へ)。通常敵はすぐ左。
    // 通常敵は「近接射程の外・上限の内」に置く(射程内だと動かずに殴るので移動で判定できない)。
    const farStunned = stun(spawnEnemyAt('zombie', pcx + STUNNED_CHASE_MAX_DIST + 60, pcy, 0), 0);
    const nearNormal = spawnEnemyAt('zombie', pcx - 120, pcy, 0);
    const d = decideBotInput('standard', player, [farStunned, nearNormal], 0, 0, 0);
    // 近い方(左)へ動く=右へは行かない。
    expect(d.input.left).toBe(true);
    expect(d.input.right).toBe(false);
  });

  it('★近くの気絶敵は従来どおり優先する(処刑優先そのものは殺していない)', () => {
    const player = freshPlayer();
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;
    // 気絶敵は上限の内(右)。通常敵はもう少し遠い左。
    const nearStunned = stun(spawnEnemyAt('zombie', pcx + STUNNED_CHASE_MAX_DIST - 20, pcy, 0), 0);
    const fartherNormal = spawnEnemyAt('zombie', pcx - (STUNNED_CHASE_MAX_DIST + 20), pcy, 0);
    const d = decideBotInput('standard', player, [nearStunned, fartherNormal], 0, 0, 0);
    expect(d.input.right).toBe(true);
    expect(d.input.left).toBe(false);
  });

  it('★【不変条件】処刑優先の上限は近接射程より広い(目の前の気絶敵を取り逃がさない)', () => {
    expect(STUNNED_CHASE_MAX_DIST).toBeGreaterThan(80); // MELEE_ENGAGE_DIST
  });
});

describe('★詰まり脱出(社長報告v0.25.3554「木にひっかかるとずっと引っかかってる」)', () => {
  // 旧実装は詰まり検知が rusher ペルソナにしか無く、standard(既定)には1行も無かった。
  // 木や壁に押し当たると同じ入力を出し続けて永久に抜けない。
  const RIGHT = { up: false, down: false, left: false, right: true };
  const STILL = { up: false, down: false, left: false, right: false };

  /** 同じ位置に留まったまま n tick 回す。最後の入力を返す。 */
  const runStuck = (state: ReturnType<typeof createBotStuckState>, ticks: number) => {
    let out = RIGHT;
    for (let i = 0; i < ticks; i++) out = escapeIfStuck(RIGHT, state, 100, 100);
    return out;
  };

  it('動けていれば入力は素通し(誤検知しない)', () => {
    const st = createBotStuckState();
    let out = RIGHT;
    for (let i = 0; i < 200; i++) {
      // 毎tick 2px ずつ進む=1サンプル(10tick)で20px動く
      out = escapeIfStuck(RIGHT, st, 100 + i * 2, 100);
    }
    expect(out).toEqual(RIGHT);
  });

  it('★同じ位置に留まり続けたら横へ回り込む入力に変わる', () => {
    const st = createBotStuckState();
    const out = runStuck(st, BOT_STUCK_SAMPLE_TICKS * (BOT_STUCK_SAMPLES + 1));
    expect(out).not.toEqual(RIGHT);
    // 右へ進みたいまま詰まった=上下どちらかの横成分が立つ。
    expect(out.up || out.down).toBe(true);
  });

  it('★【不変条件】移動入力が無いtick(意図的な静止)では詰まりを数えない', () => {
    const st = createBotStuckState();
    for (let i = 0; i < 300; i++) escapeIfStuck(STILL, st, 100, 100);
    expect(st.stuckSamples).toBe(0);
    expect(st.escapeTicks).toBe(0);
    // 静止のあと動き出しても、いきなり脱出モードにはならない。
    expect(escapeIfStuck(RIGHT, st, 100, 100)).toEqual(RIGHT);
  });

  it('★【不変条件】脱出は1フレームで終わらない(壁際で振動しない)', () => {
    const st = createBotStuckState();
    runStuck(st, BOT_STUCK_SAMPLE_TICKS * (BOT_STUCK_SAMPLES + 1));
    expect(st.escapeTicks).toBeGreaterThan(0);
  });

  it('抜けられたら通常の入力へ戻る', () => {
    const st = createBotStuckState();
    runStuck(st, BOT_STUCK_SAMPLE_TICKS * (BOT_STUCK_SAMPLES + 1));
    let out = RIGHT;
    for (let i = 0; i < BOT_STUCK_ESCAPE_TICKS + BOT_STUCK_SAMPLE_TICKS * 2; i++) {
      out = escapeIfStuck(RIGHT, st, 100 + i * 5, 100); // しっかり動けている
    }
    expect(out).toEqual(RIGHT);
  });
});

describe('★回避は全段階に入る(社長指示v0.25.3554「基本どのレベルでもある程度は避けて」)', () => {
  it('★【不変条件】どの腕前でも回避が無効化されない', () => {
    // 旧: novice/casual は dodge:'none' + dodgeStrength:0 で dodgeVector が即nullを返し、
    // **弾も突進も着弾予告も一切避けなかった**(社長報告「敵の弾に一切反応できてない」)。
    for (const skill of ['novice', 'casual', 'skilled', 'master'] as const) {
      const p = botSkillProfile(skill);
      expect(p.dodge, skill).not.toBe('none');
      expect(p.dodgeStrength, skill).toBeGreaterThan(0);
    }
  });

  it('回避の強さは腕前で単調に上がる', () => {
    const s = (k: 'novice' | 'casual' | 'skilled' | 'master') => botSkillProfile(k).dodgeStrength;
    expect(s('novice')).toBeLessThan(s('casual'));
    expect(s('casual')).toBeLessThan(s('skilled'));
    expect(s('skilled')).toBeLessThan(s('master'));
  });

  it('★上級だけがボスの構えまでカウンター対象として見る', () => {
    expect(botSkillProfile('novice').seesBossCounterPhases).toBe(false);
    expect(botSkillProfile('casual').seesBossCounterPhases).toBe(false);
    expect(botSkillProfile('skilled').seesBossCounterPhases).toBe(true);
    expect(botSkillProfile('master').seesBossCounterPhases).toBe(true);
  });
});

describe('★boss-phaseカウンターは「来る攻撃」だけ構える(社長報告v0.25.3557「masterで…カウンターもしない」)', () => {
  // v0.25.3554の初版は isDashParryCounterPhase をそのまま使い、'crouch'(溜め)/'recover'(硬直)まで
  // 脅威扱いした。260px先のしゃがみパンプキンに空振りし続け、カウンターCDが焼かれて
  // 本物のジャンプ着地が取れない=「カウンターしない」の自滅ループになっていた。
  const st = () => createCounterThreatState();
  const mk = (aiPhase: string, dx = 100): Enemy =>
    ({ ...spawnEnemyAt('pumpkin', dx, 0, 0), aiPhase } as Enemy);

  it('★crouch(溜め)では構えない', () => {
    const s = st();
    const fired = decideCounterReaction('standard', s, 0, 0, [mk('crouch')], [], 10000, 0, () => 0, 'master');
    expect(fired).toBe(false);
    expect(s.threatId).toBeNull(); // 脅威としても追跡しない
  });

  it('★recover(硬直)では構えない', () => {
    const s = st();
    const fired = decideCounterReaction('standard', s, 0, 0, [mk('recover')], [], 10000, 0, () => 0, 'master');
    expect(fired).toBe(false);
    expect(s.threatId).toBeNull();
  });
});

describe('★近接分離ステア(社長報告v0.25.3557「なんか割と敵にぶつかってる」)', () => {
  const RIGHT = { up: false, down: false, left: false, right: true };
  const master = botSkillProfile('master');
  const casual = botSkillProfile('casual');

  it('★至近(48px内)の敵からは反発が混ざる(直進で体を擦らない)', () => {
    // 右へ進みたい進路のすぐ右に敵 → 入力が右一直線のままではなくなる。
    const e = spawnEnemyAt('zombie', 30 - 20, -20, 0); // 中心が(30,0)付近
    const out = separationAdjust(master, RIGHT, 0, 0, [e]);
    expect(out).not.toEqual(RIGHT);
  });

  it('★【不変条件】近接射程の外(48px以上)の敵には効かない(殴りに行く動きを阻害しない)', () => {
    const e = spawnEnemyAt('zombie', SEPARATION_DIST + 30, 0, 0);
    expect(separationAdjust(master, RIGHT, 0, 0, [e])).toEqual(RIGHT);
  });

  it('★【不変条件】novice/casualには効かない(ぶつかるのも下手さ=段階差)', () => {
    const e = spawnEnemyAt('zombie', 10, 0, 0);
    expect(separationAdjust(casual, RIGHT, 0, 0, [e])).toEqual(RIGHT);
  });

  it('静止の尊重は「安全な距離」まで: ガード距離の外に立つだけの敵では歩き出さない(v0.25.3596)', () => {
    const STILL = { up: false, down: false, left: false, right: false };
    const e = spawnEnemyAt('zombie', 45, -20, 0); // 中心が(65,0)付近=ガード距離(56)の外・非接近
    expect(separationAdjust(master, STILL, 0, 0, [e])).toEqual(STILL);
  });

  // ★v0.25.3596(社長報告5回目「寄ってくる敵に反応できてない」): 旧仕様は静止中の分離が完全オフで、
  // ホールド中に歩き寄られると触れられるまで棒立ちだった。触れる寸前は静止でも離れる。
  it('静止中でも触れる寸前(48px内)の敵からは離れる', () => {
    const STILL = { up: false, down: false, left: false, right: false };
    const e = spawnEnemyAt('zombie', 10, -20, 0); // 中心が(30,0)付近=+x側の至近
    const out = separationAdjust(master, STILL, 0, 0, [e]);
    expect(out.left).toBe(true); // -x(敵の反対)へ退く
    expect(out.right).toBe(false);
  });

  it('静止中でもガード距離(56px)内から向かってくる敵からは離れる', () => {
    const STILL = { up: false, down: false, left: false, right: false };
    const e = spawnEnemyAt('zombie', 32, -20, 0); // 中心が(52,0)付近
    e.vx = -50; e.vy = 0; // こちらへ向かっている
    const out = separationAdjust(master, STILL, 0, 0, [e]);
    expect(out.left).toBe(true);
  });

  // ★v0.25.3596(「なぜか自分から突っ込むときがある」): HARD_BLOCK_DIST(44px)内の敵ごとに
  // 「その敵へ向かう移動成分」を接線へ射影して取り除く=体1つ分の距離では自分から歩み寄らない。
  it('至近(44px内)の敵へ向かう移動成分は出ない(接線へ逃がす)', () => {
    const RIGHT = { up: false, down: false, left: false, right: true };
    const e = spawnEnemyAt('zombie', 20, -20, 0); // 中心が(40,0)付近=進行方向の正面・至近
    const out = separationAdjust(master, RIGHT, 0, 0, [e]);
    expect(out.right).toBe(false); // 敵の方向(+x)へは進まない
  });
});

describe('★接触カウンターの再武装(社長報告v0.25.3596「カウンターもしてるようには見えない」)', () => {
  it('発火後、同じ敵が近くに居続けても CONTACT_REFIRE_MS 経過で構え直して2発目が出る', () => {
    const state = createCounterThreatState();
    const e = spawnEnemyAt('zombie', 40, -20, 0); // 中心が(60,0)付近
    e.vx = -50; e.vy = 0; // 接近中
    const enemies = [e];
    // 1発目: 検知→(master=遅延後)発火
    let fired = false;
    for (let t = 0; t <= 2000 && !fired; t += 16) {
      fired = decideCounterReaction('standard', state, 0, 0, enemies, [], t, 0, () => 0, 'master');
    }
    expect(fired).toBe(true);
    // 敵は近く(135px内)に居続ける。旧仕様はここで追跡が外れず永久に2発目が出なかった。
    let fired2 = false;
    for (let t = 2016; t <= 6000 && !fired2; t += 16) {
      fired2 = decideCounterReaction('standard', state, 0, 0, enemies, [], t, 0, () => 0, 'master');
    }
    expect(fired2).toBe(true);
  });
});

describe('★接近雑魚へのカウンター(社長報告v0.25.3560「カウンターもしない。歩いてくる敵に棒立ちで当たる」)', () => {
  // 近接カウンターの実体は「窓が開いている間に敵が触れたら弾く」(applyContactDamage)。
  // 歩いて寄ってくる雑魚こそ最多のカウンター機会なのに、検知が jump/charge/弾だけで
  // 一度も脅威として見ていなかった。
  const st = () => createCounterThreatState();

  it('★90px内でこちらへ向かって動く敵は脅威=カウンターを振る(反応80ms後)', () => {
    const s = st();
    const e = { ...spawnEnemyAt('zombie', 60, 0, 0), vx: -40, vy: 0 } as Enemy; // 左=プレイヤーへ接近
    expect(decideCounterReaction('standard', s, 0, 0, [e], [], 10000, 0, () => 0, 'master')).toBe(false); // 検知(遅延中)
    expect(decideCounterReaction('standard', s, 0, 0, [e], [], 10100, 0, () => 0, 'master')).toBe(true);  // 80ms経過=発火
  });

  it('★【不変条件】遠ざかる敵には振らない(至近を除く)', () => {
    const s = st();
    const e = { ...spawnEnemyAt('zombie', 70, 0, 0), vx: +40, vy: 0 } as Enemy; // 右=離れていく
    const fired = decideCounterReaction('standard', s, 0, 0, [e], [], 10000, 0, () => 0, 'master');
    expect(fired).toBe(false);
  });

  it('★【不変条件】90pxの外の敵には振らない(空振り乱発しない)', () => {
    const s = st();
    const e = { ...spawnEnemyAt('zombie', CONTACT_COUNTER_DIST + 40, 0, 0), vx: -40, vy: 0 } as Enemy;
    const fired = decideCounterReaction('standard', s, 0, 0, [e], [], 10000, 0, () => 0, 'master');
    expect(fired).toBe(false);
  });

  it('至近(48px内)なら向きに関わらず脅威(もう触れる)', () => {
    const s = st();
    // spawnEnemyAtのx,yは左上。中心距離が48px未満になるようプレイヤー(0,0)のほぼ真上に置く。
    const e = { ...spawnEnemyAt('zombie', -10, -30, 0), vx: 0, vy: 0 } as Enemy;
    expect(decideCounterReaction('standard', s, 0, 0, [e], [], 10000, 0, () => 0, 'master')).toBe(false); // 検知
    expect(decideCounterReaction('standard', s, 0, 0, [e], [], 10100, 0, () => 0, 'master')).toBe(true);
  });

  it('反応遅延は従来どおり効く(novice=500msは即フレームでは振らない)', () => {
    const s = st();
    const e = { ...spawnEnemyAt('zombie', 60, 0, 0), vx: -40, vy: 0 } as Enemy;
    // 検知フレーム(遅延0ms経過)では振らない。willAttemptの抽選はrand()=0<0.25で必ず通す。
    const fired = decideCounterReaction('standard', s, 0, 0, [e], [], 10000, 0, () => 0, 'novice');
    expect(fired).toBe(false);
  });
});
