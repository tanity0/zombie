// GHOST-SUBS-FINAL(v0.25.2563 / research/GHOST_PARITY_LEDGER.md「構造ズレ組サブ6種の裁定」+
// 社長裁定2026-07-31)。正本ドクトリン= BOT_AND_GHOST.md §2.11追補「守護霊は独立した2人目の
// プレイヤー」+ §2.11追補3「霊体は世界の物に触れない」。
// このファイルは本バッチの不変条件を機械化する:
//   1. ホーミングのロック蓄積(プレイヤー/守護霊で共有の純関数)と「押す時間」のclamp/フォールバック。
//   2. 押し保持時間の計測(G4a・EMA)と、計測なし=満タン発射へ落ちること。
//   3. 守護霊の回収行動(retrieveTarget)が間合い管理より優先/回避には譲ること。
//   4. 主語ごとの帳簿(ホーミングCD・火炎瓶の火の主語・救急鞄の在庫)がプレイヤーを汚さないこと。
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore, combatActorPlayer, QUICK_MAG_CRIT_WINDOW_MS } from '../store/gameStore';
import { clearGhostBuildCache } from './ghostBuild';
import {
  stepHomingLocks, ghostHomingHoldMs, homingFullLockMs,
  HOMING_LOCK_INTERVAL_MS, HOMING_MAX_LOCKS_BY_LEVEL, HOMING_RANGE,
} from './homing';
import {
  recordHomingHold, settlePendingTraits, loadPlayerProfile, resetPlayerTraits,
  subStyleHomingHoldMs, applyPendingSubStyle, type PlayerProfile,
} from './playerTraits';
import { decideGhost, type GhostDriverInput } from './ghostDriver';
import { computeFirstAidKitTick, isFirstAidKitEmpty, createFirstAidKitState } from './firstAidKit';
import type { Enemy, PlayerBuildSnapshot, Summon, SubWeaponKey } from '../types/game';

// jsdom を使わずに済む最小 localStorage スタブ(playerTraits.test.ts と同じ作法)。
const installStorage = () => {
  const map = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  } as Storage;
};

const GID = 'ghost-subs-final';
const GX = 2400, GY = 2400;

const snap = (
  subs: SubWeaponKey[],
  levels: Partial<Record<SubWeaponKey, number>> = {},
): PlayerBuildSnapshot => ({
  maxHealth: 100, speed: 200, level: 1,
  gunKeys: ['handgun-t1'], activeGunKey: 'handgun-t1', meleeKey: 'knife-t1',
  subWeapons: subs, subWeaponLevels: levels,
});

const ghostAt = (build: PlayerBuildSnapshot, over: Partial<Summon> = {}): Summon => ({
  id: GID, x: GX, y: GY, width: 32, height: 32, speed: 200,
  health: 100, maxHealth: 100, damage: 0, kind: 'ghost-ally', reusedType: 'zombie', level: 1,
  createdAt: Date.now(), lastHit: 0, ghostBossId: 'boss-x', ghostBuild: build,
  ...over,
});

const place = (build: PlayerBuildSnapshot, over: Partial<Summon> = {}) => {
  useGameStore.getState().resetGame('warrior');
  clearGhostBuildCache();
  useGameStore.setState({ summons: [ghostAt(build, over)] });
};
const ghost = () => useGameStore.getState().summons.find(s => s.id === GID);

const enemyAt = (id: string, x: number, y: number): Enemy => ({
  id, x, y, width: 24, height: 24, health: 100, maxHealth: 100, speed: 60,
  damage: 5, type: 'zombie', lastAttack: 0, experienceValue: 1, lastHit: 0, lastShot: 0,
} as unknown as Enemy);

beforeEach(() => {
  installStorage();
  useGameStore.getState().resetGame('warrior');
  clearGhostBuildCache();
  resetPlayerTraits();
});

// ---------------------------------------------------------------------------
describe('1. ホーミング: ロック蓄積(プレイヤー/守護霊で共有の1本)', () => {
  const at = (dx: number) => enemyAt(`e${dx}`, GX + dx, GY);

  it('未ロックの敵を近い順に1体ずつ、Lv上限まで(同一敵は最大2)', () => {
    const enemies = [at(10), at(40), at(70)];
    let locks: string[] = [];
    const push = () => {
      const r = stepHomingLocks({ locks, maxLocks: 3, ownerCx: GX, ownerCy: GY, enemies });
      locks = r.locks;
      return r.added;
    };
    expect(push()).toBe('first'); // 1体目=最も近い
    expect(locks).toEqual(['e10']);
    expect(push()).toBe('first');
    expect(push()).toBe('first');
    expect(locks).toEqual(['e10', 'e40', 'e70']);
    // 上限に達したら増えない。
    expect(push()).toBeNull();
    expect(locks.length).toBe(3);
  });

  it('未ロックが尽きたら2ロック目(近い順)へ回る=SEも鳴らし分ける', () => {
    const enemies = [at(10), at(40)];
    let locks: string[] = [];
    const push = () => {
      const r = stepHomingLocks({ locks, maxLocks: 4, ownerCx: GX, ownerCy: GY, enemies });
      locks = r.locks; return r.added;
    };
    expect(push()).toBe('first');
    expect(push()).toBe('first');
    expect(push()).toBe('second'); // 2ロック目=近い方から
    expect(locks).toEqual(['e10', 'e40', 'e10']);
    expect(push()).toBe('second');
    expect(push()).toBeNull(); // 同一敵は最大2
  });

  it('射程外は対象外/死亡した敵のロックは破棄される', () => {
    const far = enemyAt('far', GX + HOMING_RANGE + 50, GY);
    const near = at(10);
    const r1 = stepHomingLocks({ locks: [], maxLocks: 3, ownerCx: GX, ownerCy: GY, enemies: [far] });
    expect(r1.added).toBeNull();
    // 'dead'(既に居ない敵)のロックは落ち、空いた枠に2ロック目が入る(同一ステップで両方起きる)。
    const r2 = stepHomingLocks({ locks: ['dead', 'e10'], maxLocks: 3, ownerCx: GX, ownerCy: GY, enemies: [near] });
    expect(r2.locks).toEqual(['e10', 'e10']);
    expect(r2.added).toBe('second');
  });

  it('リーパー(非追跡個体)は狙わない(手榴弾の照準と同じ除外)', () => {
    const reaper = { ...enemyAt('r', GX + 10, GY), type: 'reaper' } as Enemy;
    const r = stepHomingLocks({ locks: [], maxLocks: 3, ownerCx: GX, ownerCy: GY, enemies: [reaper] });
    expect(r.added).toBeNull();
    const chaser = { ...reaper, reaperChaser: true } as Enemy;
    expect(stepHomingLocks({ locks: [], maxLocks: 3, ownerCx: GX, ownerCy: GY, enemies: [chaser] }).added).toBe('first');
  });
});

describe('1b. ホーミング: 守護霊が押し続ける時間(clamp/フォールバック)', () => {
  it('満タン到達時間=(最大ロック数-1)×間隔(1体目は押した瞬間に付く)', () => {
    expect(homingFullLockMs(3)).toBe(2 * HOMING_LOCK_INTERVAL_MS);
    expect(homingFullLockMs(1)).toBe(0);
  });

  it('計測なし(null/undefined)=満タンで発射(フォールバック)', () => {
    const full = homingFullLockMs(HOMING_MAX_LOCKS_BY_LEVEL[1]);
    expect(ghostHomingHoldMs(null, HOMING_MAX_LOCKS_BY_LEVEL[1])).toBe(full);
    expect(ghostHomingHoldMs(undefined, HOMING_MAX_LOCKS_BY_LEVEL[1])).toBe(full);
  });

  it('計測値は[0, 満タン到達時間]にclamp(上限=満タン/下限=最初のロック成立)', () => {
    const maxLocks = HOMING_MAX_LOCKS_BY_LEVEL[2]; // 6 → full=2500ms
    expect(ghostHomingHoldMs(1200, maxLocks)).toBe(1200);
    expect(ghostHomingHoldMs(99999, maxLocks)).toBe(homingFullLockMs(maxLocks));
    expect(ghostHomingHoldMs(-500, maxLocks)).toBe(0);
    expect(ghostHomingHoldMs(Number.NaN, maxLocks)).toBe(homingFullLockMs(maxLocks));
  });
});

// ---------------------------------------------------------------------------
describe('2. 押し保持時間の計測(G4a・EMA)', () => {
  // サブ様式は「軸1プロファイルが既にある時だけ」足す(既存の保守側の裁定=applyPendingSubStyleの
  // コメント参照)ので、計測済みプロファイルを1件置いてから測る。
  const seedProfile = () => {
    localStorage.setItem('zombie-ghost-profile-v1', JSON.stringify({
      v: 1, runs: 1, reactionMs: 250, counterChance: 0.5, preferredDist: 180, meleeBias: 0.4,
      mobility: 0.6, hitsPerMin: 3, subUsesPerMin: 2, stationaryFrac: 0.35, approachPerMin: 3,
      moveReactions: {},
      subStyles: { wire: { n: 0, slamRatio: 0 }, shield: { n: 0, bashPerPlacement: 0, bashDamageFrac: 0 } },
    }));
  };

  it('初回はサンプルそのまま、2回目以降はEMA(wire/shieldと同じ流儀)', () => {
    seedProfile();
    // 1ラン目: 2回発射(2000ms / 4000ms)→ 平均3000ms がそのまま入る(初回)。
    recordHomingHold(2000);
    recordHomingHold(4000);
    settlePendingTraits(false);
    const p1 = loadPlayerProfile();
    expect(p1?.subStyles.homing).toEqual({ n: 2, holdMsAvg: 3000 });

    // 2ラン目: 1000ms 1回 → EMA(α=0.3): 3000*0.7 + 1000*0.3 = 2400。
    recordHomingHold(1000);
    settlePendingTraits(false);
    const p2 = loadPlayerProfile();
    expect(p2?.subStyles.homing.n).toBe(3);
    expect(p2?.subStyles.homing.holdMsAvg).toBeCloseTo(2400, 6);
  });

  it('「反映しない」(optOut)を選んだランは記録されない', () => {
    seedProfile();
    recordHomingHold(2000);
    settlePendingTraits(true);
    expect(loadPlayerProfile()?.subStyles.homing).toEqual({ n: 0, holdMsAvg: 0 });
  });

  it('subStyleHomingHoldMs: n=0(未計測)と旧プロファイル(homingキー欠損)は null=満タン発射へ落ちる', () => {
    expect(subStyleHomingHoldMs(undefined)).toBeNull();
    expect(subStyleHomingHoldMs({
      wire: { n: 0, slamRatio: 0 }, shield: { n: 0, bashPerPlacement: 0, bashDamageFrac: 0 },
      homing: { n: 0, holdMsAvg: 0 },
    })).toBeNull();
    // 旧フォーマット(homingキーが無い保存)をそのまま渡しても落ちない。
    const legacy = {
      wire: { n: 3, slamRatio: 1 }, shield: { n: 0, bashPerPlacement: 0, bashDamageFrac: 0 },
    } as unknown as Parameters<typeof subStyleHomingHoldMs>[0];
    expect(subStyleHomingHoldMs(legacy)).toBeNull();
    expect(subStyleHomingHoldMs({
      wire: { n: 0, slamRatio: 0 }, shield: { n: 0, bashPerPlacement: 0, bashDamageFrac: 0 },
      homing: { n: 4, holdMsAvg: 2800 },
    })).toBe(2800);
  });

  it('applyPendingSubStyle: 旧プロファイル(homing欠損)へも安全に足せる(後方互換)', () => {
    const legacyProfile = {
      v: 1, runs: 1, reactionMs: 250, counterChance: 0.5, preferredDist: 180, meleeBias: 0.4,
      mobility: 0.6, hitsPerMin: 3, subUsesPerMin: 2, stationaryFrac: 0.35, approachPerMin: 3,
      moveReactions: {},
      subStyles: { wire: { n: 0, slamRatio: 0 }, shield: { n: 0, bashPerPlacement: 0, bashDamageFrac: 0 } },
    } as unknown as PlayerProfile;
    const out = applyPendingSubStyle(legacyProfile, {
      kind: 'subStyle',
      tally: {
        wireSlams: 0, wirePlants: 0, shieldPlacements: 0, shieldBashes: 0, shieldBashDamage: 0,
        homingHoldCount: 2, homingHoldSumMs: 5000,
      },
      totalDamage: 100,
    } as Parameters<typeof applyPendingSubStyle>[1]);
    expect(out.subStyles.homing).toEqual({ n: 2, holdMsAvg: 2500 });
  });
});

// ---------------------------------------------------------------------------
describe('3. 回収行動(クイックマガジンを自分で拾いに行く)', () => {
  const baseInput = (over: Partial<GhostDriverInput> = {}): GhostDriverInput => ({
    ghost: {
      x: 0, y: 0, width: 32, height: 32, maxHealth: 100, facing: 1,
      lastShotAt: 0, lastMeleeAt: 0,
    },
    player: { x: 0, y: 0, width: 32, height: 32 },
    enemies: [{ ...enemyAt('boss', 400, 0), type: 'giantbat' } as Enemy],
    boundBossId: 'boss',
    projectiles: [],
    // v0.25.2564: 縁基準の射程(プレイヤーのenemyMeleeDistと同じ幾何=AABB最近点)を注入。
    meleeDist: (cx, cy, e) => Math.hypot(
      cx - Math.max(e.x, Math.min(cx, e.x + e.width)),
      cy - Math.max(e.y, Math.min(cy, e.y + e.height)),
    ),
    profile: {
      reactionMs: 100, counterChance: 0, preferredDist: 180, meleeBias: 0,
      mobility: 1, hitsPerMin: 3, subUsesPerMin: 2, stationaryFrac: 0, approachPerMin: 6,
    },
    weapon: { gunDamage: 10, gunIntervalMs: 500, gunRangePx: 0, meleeDamage: 6 },
    gameTime: 10_000, nowMs: 10_000,
    rand: () => 0.5,
    ...over,
  });

  it('拾い物があれば間合い管理より優先してそこへ歩く', () => {
    // 回収目標はボス(+x方向)とは逆(-y方向)に置く=間合い管理なら選ばない向き。
    const out = decideGhost(baseInput({ retrieveTarget: { x: 16, y: -300 } }));
    expect(out.moveY).toBeLessThan(-0.9); // ほぼ真上=拾いに行っている
  });

  it('拾い物が無ければ従来どおりの意思決定(1bit不変)', () => {
    const withNone = decideGhost(baseInput());
    const explicitUndefined = decideGhost(baseInput({ retrieveTarget: undefined }));
    expect(withNone).toEqual(explicitUndefined);
  });

  it('危険(回避)は回収より優先=拾い歩きで被弾しに行かない', () => {
    // 敵弾を自分の目の前に置く=dodgeVectorが働く。反応遅延は前tickの認知を渡して消化しておく。
    const proj = {
      id: 'p1', x: 40, y: 16, width: 8, height: 8, speed: 300, damage: 10,
      direction: { x: -1, y: 0 }, weaponType: 'bullet', duration: 3000, createdAt: 0,
      passthrough: false, hitEnemies: [], hostile: true, reflected: false,
    };
    const danger = {
      ghost: {
        x: 0, y: 0, width: 32, height: 32, maxHealth: 100, facing: 1 as const,
        lastShotAt: 0, lastMeleeAt: 0, dangerSeenAt: 0, dangerLastAt: 9_500,
      },
      projectiles: [proj as unknown as GhostDriverInput['projectiles'][number]],
    };
    const withRetrieve = decideGhost(baseInput({ ...danger, retrieveTarget: { x: 16, y: -300 } }));
    const withoutRetrieve = decideGhost(baseInput(danger));
    // 危険中は回収目標の有無で判断が変わらない=拾い歩きが回避を上書きしない。
    expect(withRetrieve).toEqual(withoutRetrieve);
  });
});

// ---------------------------------------------------------------------------
describe('4. 主語ごとの帳簿(プレイヤーを汚さない)', () => {
  it('fireHoming(ghostId): ゴーストのロックから撃ち、CDはゴースト自前の帳簿へ', () => {
    place(snap(['homing']));
    const gt = useGameStore.getState().gameTime;
    useGameStore.setState(s => ({
      enemies: [enemyAt('e1', GX + 40, GY)],
      summons: s.summons.map(x => x.id === GID
        ? { ...x, ghostHomingLocks: ['e1'], ghostHomingHoldStartAt: Date.now() } : x),
    }));
    useGameStore.getState().fireHoming(GID);
    const projs = useGameStore.getState().projectiles.filter(p => p.weaponType === 'homing-missile');
    expect(projs.length).toBe(1);
    expect(projs[0].ownerGhost).toBe(true);            // 視覚マーカー(青白)
    expect(ghost()!.ghostHomingLocks).toEqual([]);      // 自分のロックだけ空になる
    expect(ghost()!.ghostHomingHoldStartAt).toBeUndefined();
    expect(ghost()!.ghostSubWeaponCooldowns?.['homing']).toBeGreaterThan(gt); // 自前CD
    expect(useGameStore.getState().player.subWeaponCooldowns['homing']).toBeUndefined(); // プレイヤーは無傷
    expect(useGameStore.getState().homingLocks).toEqual([]);
  });

  it('fireHoming(ghostId): ビルドにhomingが無ければ何も撃たない', () => {
    place(snap(['decoy']));
    useGameStore.setState(s => ({
      enemies: [enemyAt('e1', GX + 40, GY)],
      summons: s.summons.map(x => x.id === GID ? { ...x, ghostHomingLocks: ['e1'] } : x),
    }));
    useGameStore.getState().fireHoming(GID);
    expect(useGameStore.getState().projectiles.filter(p => p.weaponType === 'homing-missile').length).toBe(0);
  });

  it('fireHoming(): 引数なし=プレイヤー(従来経路)。ゴーストのロックは消えない', () => {
    place(snap(['homing']));
    useGameStore.setState(s => ({
      enemies: [enemyAt('e1', 100, 100)],
      homingLocks: ['e1'],
      player: { ...s.player, subWeapons: [...s.player.subWeapons, 'homing'] },
      summons: s.summons.map(x => x.id === GID ? { ...x, ghostHomingLocks: ['e1'] } : x),
    }));
    useGameStore.getState().fireHoming();
    expect(useGameStore.getState().homingLocks).toEqual([]);
    expect(ghost()!.ghostHomingLocks).toEqual(['e1']); // 2人分が独立
    expect(useGameStore.getState().player.subWeaponCooldowns['homing']).toBeDefined();
    expect(ghost()!.ghostSubWeaponCooldowns?.['homing']).toBeUndefined();
  });

  it('疑似Playerはゴースト自前のクイックマガジン窓を読む(本人の窓は二重取りしない)', () => {
    place(snap(['striker-quick-mag']));
    const gt = useGameStore.getState().gameTime;
    // 本人の窓を立ててもゴーストには乗らない。
    useGameStore.setState(s => ({ player: { ...s.player, quickMagCritUntil: gt + 99999 } }));
    expect(combatActorPlayer(GID)!.quickMagCritUntil).toBe(0);
    // 自分で回収した窓は乗る(=同じ式(クリ率)がそのまま効く)。
    useGameStore.setState(s => ({
      summons: s.summons.map(x => x.id === GID
        ? { ...x, ghostQuickMagCritUntil: gt + QUICK_MAG_CRIT_WINDOW_MS } : x),
    }));
    expect(combatActorPlayer(GID)!.quickMagCritUntil).toBe(gt + QUICK_MAG_CRIT_WINDOW_MS);
  });

  it('spawnGroundFire: 主語(ownerGhostId)が付き、プレイヤーの火とは別に数えられる', () => {
    place(snap(['molotov']));
    useGameStore.getState().spawnGroundFire(100, 100);          // プレイヤー
    useGameStore.getState().spawnGroundFire(GX, GY, GID);        // 守護霊
    const fires = useGameStore.getState().groundFires;
    expect(fires.length).toBe(2);
    expect(fires[0].ownerGhostId).toBeUndefined();
    expect(fires[1].ownerGhostId).toBe(GID);
  });

  it('tickGroundFires: プレイヤーだけの盤面は従来どおり1パス(火に触れた敵だけがDoTを受ける)', () => {
    useGameStore.getState().resetGame('warrior');
    useGameStore.getState().spawnGroundFire(500, 500);
    useGameStore.setState({ enemies: [enemyAt('in', 500 - 12, 500 - 12), enemyAt('out', 1500, 1500)] });
    useGameStore.getState().tickGroundFires();
    const es = useGameStore.getState().enemies;
    expect(es.find(e => e.id === 'in')!.health).toBeLessThan(100);
    expect(es.find(e => e.id === 'out')!.health).toBe(100);
  });
});

// ---------------------------------------------------------------------------
describe('5. 救急鞄(守護霊の在庫=自分への回復1つ)', () => {
  // useGameLoop 側の初期在庫と同じ形(弾薬=除外4/爆弾=§2.11追補3で鞄に入っていない)。
  const ghostKit = () => ({
    ...createFirstAidKitState(),
    ammoHandgunDispensed: true, ammoShotgunDispensed: true, ammoRifleDispensed: true, bombDispensed: true,
  });

  it('HPが半分を切るまでは使わない(しきい値=プレイヤーの回復払い出しと同じ定数)', () => {
    const r = computeFirstAidKitTick({
      level: 2, ammoTypesUsed: [], ammoHandgun: 0, ammoShotgun: 0, ammoRifle: 0,
      health: 60, maxHealth: 100, onScreenEnemyCount: 0, state: ghostKit(),
    });
    expect(r.dispense).toBeNull();
  });

  it('HPが半分未満なら回復を1回だけ使い、以後は空=鞄を投げる段へ移る', () => {
    const first = computeFirstAidKitTick({
      level: 2, ammoTypesUsed: [], ammoHandgun: 0, ammoShotgun: 0, ammoRifle: 0,
      health: 40, maxHealth: 100, onScreenEnemyCount: 0, state: ghostKit(),
    });
    expect(first.dispense).toBe('health');
    expect(isFirstAidKitEmpty(first.nextState, 2)).toBe(true);
    const second = computeFirstAidKitTick({
      level: 2, ammoTypesUsed: [], ammoHandgun: 0, ammoShotgun: 0, ammoRifle: 0,
      health: 10, maxHealth: 100, onScreenEnemyCount: 0, state: first.nextState,
    });
    expect(second.dispense).toBeNull(); // 在庫1=使い切り
  });

  it('弾薬/爆弾は守護霊の鞄に入っていない(世界へアイテムを撒かない)', () => {
    const r = computeFirstAidKitTick({
      level: 3, ammoTypesUsed: ['handgun', 'shotgun', 'rifle'],
      ammoHandgun: 0, ammoShotgun: 0, ammoRifle: 0,
      health: 100, maxHealth: 100, onScreenEnemyCount: 99, state: ghostKit(),
    });
    expect(r.dispense).toBeNull();
  });
});
