import { phantomSupportsSub, PHANTOM_SUPPORTED_SUBS, GUARDIAN_PHANTOM_TYPE } from './phantomTick';
import { SUB_WEAPON_KEYS } from '../data/campaign';
import type { SubWeaponKey, ShadowCloneState, PlayerBuildSnapshot } from '../types/game';
// research/SAME_ARENA.md O-3「幻影がサブウェポンを使う」の土台の受け入れ条件。
// 守護霊との決定的な違い=**狙う相手がプレイヤー**なので、効果を敵対側(hostile)で撒く必要があり、
// かつ**紫の文法=カウンターできない**を守る必要がある(素通しだと打ち返せてしまう)。
import { describe, it, expect, beforeEach } from 'vitest';
import { playerAsOwner, ghostAsOwner, phantomAsOwner, isHostileOwner, ownerGhostId } from './subWeaponOwner';
import { applyEnemyProjectileHits } from './combatTick';
import { useGameStore, combatActorPlayer, spawnShadowCloneOnSwing, shadowCloneOf } from '../store/gameStore';
import { spawnEnemyAt } from './enemyUtils';
import type { Projectile } from '../types/game';

const body = { x: 100, y: 200, width: 32, height: 48 };

describe('O-3 土台: サブウェポンの主語に幻影を足す', () => {
  it('幻影だけが「効果を敵対側で撒く主語」(プレイヤー/守護霊は false)', () => {
    expect(isHostileOwner(phantomAsOwner({ ...body, id: 'gp-1' }))).toBe(true);
    expect(isHostileOwner(ghostAsOwner({ ...body, id: 'g-1' }))).toBe(false);
    expect(isHostileOwner(playerAsOwner({ ...body, lastDirection: { x: 1, y: 0 } }))).toBe(false);
  });

  it('★CD帳簿の宛先idは幻影でも返る(=3者が別財布で回る)', () => {
    expect(ownerGhostId(phantomAsOwner({ ...body, id: 'gp-1' }))).toBe('gp-1');
    expect(ownerGhostId(ghostAsOwner({ ...body, id: 'g-1' }))).toBe('g-1');
    expect(ownerGhostId(playerAsOwner({ ...body }))).toBeUndefined();
  });

  it('幻影オーナーは実体の座標をそのまま持つ(投擲の起点)', () => {
    const o = phantomAsOwner({ ...body, id: 'gp-1' });
    expect(o.kind).toBe('phantom');
    expect(o.x).toBe(100);
    expect(o.y).toBe(200);
    expect(o.summonId).toBe('gp-1');
  });

  it('向きは呼び出し側が渡す(未指定=null で、各サブ固有のフォールバックへ委ねる)', () => {
    expect(phantomAsOwner({ ...body, id: 'gp-1' }).facing).toBeNull();
    expect(phantomAsOwner({ ...body, id: 'gp-1' }, { x: -1, y: 0 }).facing).toEqual({ x: -1, y: 0 });
  });
});

// ---------------------------------------------------------------------------------------------
// ★紫の文法(カウンターできない)の実挙動。O-3a で見つけた「素通しだと打ち返せてしまう」の再発検知器。
// ---------------------------------------------------------------------------------------------
// 演出は全部no-op(何を呼ばれても落ちない)。判定だけを見たいので Proxy で受け流す。
const NOOP_FX = new Proxy({}, { get: () => () => undefined }) as unknown as Parameters<typeof applyEnemyProjectileHits>[5];
const TUNABLES = { grenadeBlastRadius: 0, grenadeBlastDamageMult: 1, counterReflectSlowMs: 0 };

const hostileProjAt = (p: { x: number; y: number }, noCounter?: boolean): Projectile => ({
  id: `t-${noCounter ? 'nc' : 'ok'}`,
  x: p.x, y: p.y, width: 10, height: 10,
  speed: 0, damage: 1,
  direction: { x: 0, y: 1 },
  // ★火炎ナイフの型を使う。手榴弾(weaponType='grenade')は `checkProjectilePlayerCollisions` が
  // **元から反射対象外**(v0.25.3442・idolの手榴弾で入った除外)なので、noCounter の要否を検証できない。
  // noCounter が実際に効く必要があるのは**grenade以外の投擲物**(火炎ナイフ/ホーミング等)。
  weaponType: 'fire-knife-projectile', weaponKey: 'sub-fire-knife',
  duration: 9999, createdAt: 0,
  passthrough: false, hitEnemies: [],
  hostile: true, reflected: false,
  noCounter,
} as Projectile);

describe('O-3 紫の文法: 幻影のサブはカウンターで打ち返せない', () => {
  const setup = (proj: Projectile) => {
    const p0 = useGameStore.getState().player;
    useGameStore.setState({
      projectiles: [proj],
      // カウンター窓を開いた状態(反射が起きうる条件)
      player: { ...p0, x: proj.x, y: proj.y, counterWindowEnd: Number.MAX_SAFE_INTEGER, invulnerable: false },
    });
  };

  it('★noCounter の弾は、カウンター窓が開いていても反射されない(紫=カウンター不可)', () => {
    const proj = hostileProjAt({ x: 400, y: 400 }, true);
    setup(proj);
    applyEnemyProjectileHits(0, useGameStore.getState().player, false, 0, 0, NOOP_FX, TUNABLES);
    const after = useGameStore.getState().projectiles.find(x => x.id === proj.id);
    // 反射されていない=残っていれば reflected が立っていない / 消えていれば「当たった」側
    expect(after?.reflected ?? false).toBe(false);
  });

  it('noCounter を付けない弾は従来どおり反射される(既存の弾を1bitも変えていないことの裏取り)', () => {
    const proj = hostileProjAt({ x: 400, y: 400 }, undefined);
    setup(proj);
    applyEnemyProjectileHits(0, useGameStore.getState().player, false, 0, 0, NOOP_FX, TUNABLES);
    const after = useGameStore.getState().projectiles.find(x => x.id === proj.id);
    expect(after?.reflected ?? false).toBe(true);
  });
});

// ★社長報告2026-08-24(実機): 「幻影が自分のデコイに消されてたり、自分のトラップにハマってる」。
// 真因=**未実装の種まで幻影が主語になれていた**。設置系は例外なく「`enemies` を走査して敵を捕まえる」
// 形なので、幻影が置くと**宛先にプレイヤーが入らず自分だけが候補になる**=自爆する。
// 白リスト(PHANTOM_SUPPORTED_SUBS)を**値で**固定しておく——新しい種を実装した時にここへ足すのが
// 「実装した」の定義になり、足し忘れ=自爆の再発が構造的に起きない。
describe('★幻影が主語になれるサブの白リスト(自爆バグの再発防止・v0.25.3879)', () => {
  // ★社長指示2026-08-25「とりあえず幻影も設置してください」で設置系を解禁した。
  // 解禁の前提は v0.25.3880 の耐久(プレイヤーが壊せる)+ 置いた物へ `hostile: true`。
  it('設置系(トラップ/デコイ/タレット/盾/地雷)も幻影の主語になれる', () => {
    for (const k of ['marksman-trap', 'decoy', 'turret', 'shield', 'sensor-mine'] as SubWeaponKey[]) {
      expect(phantomSupportsSub(k)).toBe(true);
    }
  });

  // ★社長裁定2026-08-25「4種ともやる」。ドッグは**拾わずに消す**(社長「触れて消すだけ…邪魔だけする」)
  // =取得ではないので「霊は世界の物を自分の物にしない」線を跨がない。仕様=SAME_ARENA §3-d-4。
  it('召喚系のうちドッグは幻影の主語になれる(拾わずに消す配線が済んでいる)', () => {
    expect(phantomSupportsSub('dog')).toBe(true);
  });

  // ★O-3b-2(社長裁定2026-08-25「そのままの仕様で」「そのままプレイヤーに、プレイヤーから
  // 一番遠い隅からtier1のマグナム仕様」・仕様確定=SAME_ARENA §3-d-4)で解禁した。
  it('召喚系のうち分身/援護射撃も幻影の主語になれる', () => {
    for (const k of ['shadow-clone', 'support-sniper'] as SubWeaponKey[]) {
      expect(phantomSupportsSub(k)).toBe(true);
    }
  });

  it('召喚系の残り1種(錬金術)はまだ主語にならない(★未決の裁定待ち)', () => {
    expect(phantomSupportsSub('alchemy')).toBe(false);
  });

  it('投擲系(手榴弾=O-3a / 火炎ナイフ=O-3b-1)も従来どおり主語になれる', () => {
    expect(phantomSupportsSub('heavy-grenade')).toBe(true);
    expect(phantomSupportsSub('fire-knife')).toBe(true);
  });

  it('未実装の種は主語にならない(白リストが「実装した」の定義であり続ける)', () => {
    // 近接相乗り系・ロック系・自分に効く系は O-3b-2 の残り。ここが true になったら
    // 「宛先の配線も済んでいる」ことを意味する=足す時は必ず配線とセットで。
    for (const k of ['drone-boomerang', 'homing', 'first-aid-kit', 'junk-weapon'] as SubWeaponKey[]) {
      expect(phantomSupportsSub(k)).toBe(false);
    }
  });

  it('白リストは実在するサブウェポンのキーだけを含む(綴り間違いで永久に無効化されない)', () => {
    for (const k of PHANTOM_SUPPORTED_SUBS) expect(SUB_WEAPON_KEYS).toContain(k);
  });
});

// ---------------------------------------------------------------------------------------------
// ★O-3b-2 分身(shadow-clone・社長裁定「そのままの仕様で」「狙いだけプレイヤーへ」)。
// 器(生成位置固定/5秒/自動近接/最大1体)はプレイヤー・守護霊と共用。**標的だけ**が違う——
// 幻影自身は enemies の一員なので、既存 shadowCloneStrike(enemies を走査)をそのまま流用すると
// 宛先にプレイヤーが入らず**自分だけが唯一の候補になる**(設置系で踏んだ自爆と同型)。
// ⇒ phantomShadowCloneStrike は**プレイヤーへ固定**——ここを値で確かめる。
// ---------------------------------------------------------------------------------------------
describe('★O-3b-2 分身(shadow-clone): 幻影の分身はプレイヤーを狙う(enemiesではない)', () => {
  const PID = 'gp-clone-test';
  const buildSnap = (subs: SubWeaponKey[], levels: Partial<Record<SubWeaponKey, number>> = {}): PlayerBuildSnapshot => ({
    maxHealth: 100, speed: 200, level: 1,
    gunKeys: ['handgun-t1'], activeGunKey: 'handgun-t1', meleeKey: 'knife-t1',
    subWeapons: subs, subWeaponLevels: levels,
  });
  /** 幻影1体を盤面へ置き、プレイヤーをその隣(射程内)に置く。 */
  const place = (build: PlayerBuildSnapshot) => {
    useGameStore.getState().resetGame('warrior');
    const gt = useGameStore.getState().gameTime;
    const e = spawnEnemyAt(GUARDIAN_PHANTOM_TYPE, 2400, 2400, gt);
    e.id = PID;
    e.phantomBuild = build;
    useGameStore.setState(s => ({
      enemies: [e],
      player: { ...s.player, x: e.x, y: e.y, health: 100, maxHealth: 100 },
    }));
  };
  const phantom = () => useGameStore.getState().enemies.find(x => x.id === PID)!;

  beforeEach(() => { useGameStore.getState().resetGame('warrior'); });

  it('生成: spawnShadowCloneOnSwing は幻影自身の枠(enemies[].gpShadowClone)へ書く(summonsは触らない)', () => {
    place(buildSnap(['shadow-clone']));
    const actor = combatActorPlayer(PID)!;
    const created = spawnShadowCloneOnSwing(
      () => useGameStore.getState(), actor, phantomAsOwner(phantom()), useGameStore.getState().gameTime,
    );
    expect(created).toBe(true);
    expect(phantom().gpShadowClone).toBeDefined();
    expect(phantom().gpShadowClone!.x).toBe(phantom().x); // 生成位置固定
    expect(useGameStore.getState().summons.length).toBe(0);
    expect(useGameStore.getState().shadowClone).toBeNull(); // プレイヤーの枠は空のまま
  });

  it('shadowCloneOf: 守護霊(summons)で見つからなければ幻影(enemies)を読む', () => {
    place(buildSnap(['shadow-clone']));
    const actor = combatActorPlayer(PID)!;
    spawnShadowCloneOnSwing(() => useGameStore.getState(), actor, phantomAsOwner(phantom()), useGameStore.getState().gameTime);
    expect(shadowCloneOf(useGameStore.getState(), PID)).not.toBeNull();
    expect(shadowCloneOf(useGameStore.getState())).toBeNull(); // プレイヤーの枠
  });

  it('★分身の攻撃対象はプレイヤー: phantomShadowCloneStrike でプレイヤーのHPが減る', () => {
    place(buildSnap(['shadow-clone']));
    const clone: ShadowCloneState = {
      x: phantom().x, y: phantom().y, width: phantom().width, height: phantom().height,
      facingLeft: false, characterClass: 'rogue', spawnedAt: 0, attacksDone: 0, nextAttackAt: 0,
    };
    const hpBefore = useGameStore.getState().player.health;
    useGameStore.getState().phantomShadowCloneStrike(clone, PID);
    expect(useGameStore.getState().player.health).toBeLessThan(hpBefore);
  });

  it('★分身は enemies を削らない(道連れの雑魚が同じ場所にいても無傷=標的はプレイヤー固定)', () => {
    place(buildSnap(['shadow-clone']));
    const zombie = spawnEnemyAt('zombie', phantom().x, phantom().y, useGameStore.getState().gameTime);
    useGameStore.setState(s => ({ enemies: [...s.enemies, zombie] }));
    const clone: ShadowCloneState = {
      x: phantom().x, y: phantom().y, width: phantom().width, height: phantom().height,
      facingLeft: false, characterClass: 'rogue', spawnedAt: 0, attacksDone: 0, nextAttackAt: 0,
    };
    const zHpBefore = useGameStore.getState().enemies.find(e => e.id === zombie.id)!.health;
    useGameStore.getState().phantomShadowCloneStrike(clone, PID);
    expect(useGameStore.getState().enemies.find(e => e.id === zombie.id)!.health).toBe(zHpBefore);
  });

  it('射程外のプレイヤーには当たらない', () => {
    place(buildSnap(['shadow-clone']));
    useGameStore.setState(s => ({ player: { ...s.player, x: phantom().x + 5000, y: phantom().y } }));
    const clone: ShadowCloneState = {
      x: phantom().x, y: phantom().y, width: phantom().width, height: phantom().height,
      facingLeft: false, characterClass: 'rogue', spawnedAt: 0, attacksDone: 0, nextAttackAt: 0,
    };
    const hpBefore = useGameStore.getState().player.health;
    useGameStore.getState().phantomShadowCloneStrike(clone, PID);
    expect(useGameStore.getState().player.health).toBe(hpBefore);
  });

  it('tickShadowClone: 主語が幻影なら自動でプレイヤーを削り、寿命でCDへ戻る(器は共通のまま)', () => {
    place(buildSnap(['shadow-clone'], { 'shadow-clone': 1 }));
    const actor = combatActorPlayer(PID)!;
    spawnShadowCloneOnSwing(() => useGameStore.getState(), actor, phantomAsOwner(phantom()), useGameStore.getState().gameTime);
    const hpBefore = useGameStore.getState().player.health;
    // nextAttackAt に到達させて1発分進める。
    useGameStore.setState(s => ({ gameTime: s.gameTime + 1000 }));
    useGameStore.getState().tickShadowClone(PID);
    expect(useGameStore.getState().player.health).toBeLessThan(hpBefore);
    expect(phantom().gpShadowClone?.attacksDone).toBe(1);
  });
});
