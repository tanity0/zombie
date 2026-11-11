// ★研究所(ステージ2)の闇と懐中電灯(research/LAB_DARKNESS.md・社長指示2026-11-11)。純関数=闇に開ける穴の一覧と懐中電灯の形。
import { describe, it, expect } from 'vitest';
import {
  labEnemyRevealed, labRevealRadius, labEnemyReach, labFlashlightBeam, labFlashLevel, stepLabFlash, labPitchLights, labEaseReveals,
  LAB_PITCH_MAX_LIGHTS, LAB_FLASH_FADE_MS, LAB_FLASH_MIN_LEN, LAB_REVEAL_R_MIN, LAB_REVEAL_R_MAX, LAB_REVEAL_A, LAB_UV_R, LAB_GLOW_MAX,
  LAB_REACH_MAX_LEN, LAB_REACH_PAD, LAB_REACH_HALF_W, LAB_REACH_AIM_R, LAB_SHOT_R, LAB_SHOT_MAX, LAB_CRAWLER_BODY_K, LAB_CRAWLER_SLAM_K, LAB_FOCUS_R, LAB_FLASH_OFF_MS, LAB_FLASH_HAND_PX, LAB_FLASH_HAND_DROP_PX, LAB_DANGER_A, LAB_REVEAL_IN_START,
  type LabDarkInput, type LabEnemyLike, type LabLight,
} from './labDarkness';

const CFG = { selfR: 75, selfA: 0.5, flashR: 85, flashA: 0.95 };
const VIEW = { x0: -1000, y0: -1000, x1: 1000, y1: 1000 };
const foe = (o: Partial<LabEnemyLike> = {}): LabEnemyLike => ({ id: 'e', type: 'lab-zombie', x: 100, y: 100, width: 40, height: 60, health: 10, ...o });
const input = (o: Partial<LabDarkInput> = {}): LabDarkInput => ({ player: { x: 0, y: 0 }, flash: null, enemies: [], gameTime: 5000, uvBars: [], glows: [], view: VIEW, ...o });

describe('闇の中でも見せる敵(赤い予告が隠れない)', () => {
  it('技を出している敵(溜め・攻撃の振り・噛みつきの構え)は見せる。移動・待ち・硬直・気絶の敵は見せない', () => {
    expect(labEnemyRevealed(foe({ aiPhase: 'windup' }), 5000)).toBe(true);
    expect(labEnemyRevealed(foe({ aiPhase: 'driller-thrust-active' }), 5000)).toBe(true);
    expect(labEnemyRevealed(foe({ biteAt: 5200 }), 5000)).toBe(true);
    expect(labEnemyRevealed(foe(), 5000)).toBe(false);
    expect(labEnemyRevealed(foe({ aiPhase: 'zrush' }), 5000)).toBe(false);
    expect(labEnemyRevealed(foe({ aiPhase: 'zpause' }), 5000)).toBe(false);
    expect(labEnemyRevealed(foe({ aiPhase: 'windup', stunUntil: 9000 }), 5000)).toBe(false); // 気絶中は技を出していない
  });
  it('ハンター・死神・使者は常に見せる(予告なしで寄ってくる)。倒れた敵は見せない', () => {
    for (const type of ['hunter', 'reaper', 'hangedman']) expect(labEnemyRevealed(foe({ type }), 5000)).toBe(true);
    expect(labEnemyRevealed(foe({ type: 'hunter', health: 0 }), 5000)).toBe(false);
    expect(labEnemyRevealed(foe({ aiPhase: 'windup', health: 0 }), 5000)).toBe(false);
  });
  it('穴の半径は体の大きい方×1.5(下限90・上限240)', () => {
    expect(labRevealRadius({ width: 20, height: 30 })).toBe(LAB_REVEAL_R_MIN);
    expect(labRevealRadius({ width: 40, height: 100 })).toBe(150);
    expect(labRevealRadius({ width: 400, height: 300 })).toBe(LAB_REVEAL_R_MAX);
  });
});

describe('懐中電灯の形', () => {
  it('自分から狙いサークルへ伸びる: 先端=狙いの位置・向き=根元→先・長さ=距離', () => {
    const b = labFlashlightBeam(10, 20, 10 + 130, 20, 85, 0.95);
    expect(b.shape).toBe('beam');
    expect([b.x, b.y]).toEqual([140, 20]);
    expect(b.len).toBe(130);
    expect(b.rot).toBeCloseTo(0, 6);
    expect(b.keep).toBe(true);
    expect([b.rootX, b.rootY]).toEqual([10 + LAB_FLASH_HAND_PX, 20 + LAB_FLASH_HAND_DROP_PX]); // 根元=手の位置(胸の真ん中から出さない)
    const up = labFlashlightBeam(0, 0, 0, -100, 85, 1);
    expect(up.rot).toBeCloseTo(-Math.PI / 2, 6);
    expect([up.x, up.y].map(v => Math.round(v))).toEqual([0, -100]);
  });
  it('狙いが体のすぐそばでも潰れない(最短の長さ)・体と重なっていれば向いている方へ出す', () => {
    const near = labFlashlightBeam(0, 0, 10, 0, 85, 1);
    expect(near.len).toBe(LAB_FLASH_MIN_LEN);
    expect(near.x).toBe(LAB_FLASH_MIN_LEN);
    const on = labFlashlightBeam(0, 0, 0, 0, 85, 1, 0, 1);
    expect(on.rot).toBeCloseTo(Math.PI / 2, 6);
    expect(Math.round(on.y)).toBe(LAB_FLASH_MIN_LEN);
  });
  it('点灯・消灯はフェード(点く180ms・消える110ms)。点いた瞬間は狙いの位置から始まり、その後はばねで追う(少し行き過ぎて戻る)。消えていく間は最後の位置のまま', () => {
    let s = stepLabFlash(null, true, { x: 100, y: 0 }, 16);
    expect([s.x, s.y]).toEqual([100, 0]);
    expect(s.a).toBeCloseTo(16 / LAB_FLASH_FADE_MS, 6);
    for (let i = 0; i < 20; i++) s = stepLabFlash(s, true, { x: 100, y: 0 }, 16);
    expect(s.a).toBe(1);
    // 狙いが跳んでも(吸い付き)、光は瞬間移動しない(止まりから加速して動き出す)
    const jump = stepLabFlash(s, true, { x: 200, y: 0 }, 16);
    expect(jump.x).toBeGreaterThan(100); expect(jump.x).toBeLessThan(130);
    // 少し行き過ぎてから戻る(手に持った灯りの慣性)。行き過ぎは小さい・最後は狙いに落ち着く
    let t = jump, peak = jump.x; for (let i = 0; i < 80; i++) { t = stepLabFlash(t, true, { x: 200, y: 0 }, 16); peak = Math.max(peak, t.x); }
    expect(peak).toBeGreaterThan(200.5); expect(peak).toBeLessThan(225);
    expect(t.x).toBeCloseTo(200, 0);
    // フレームの幅が粗くても暴れない
    let c = stepLabFlash(null, true, { x: 0, y: 0 }, 50); for (let i = 0; i < 30; i++) c = stepLabFlash(c, true, { x: 300, y: 0 }, 50);
    expect(c.x).toBeCloseTo(300, 0);
    // 消灯: だんだん消える(点くより速い)・位置は動かない
    const off = stepLabFlash(t, false, { x: 999, y: 999 }, LAB_FLASH_OFF_MS / 2);
    expect(off.a).toBeCloseTo(0.5, 6);
    expect(off.x).toBeCloseTo(t.x, 6);
    let z = off; for (let i = 0; i < 5; i++) z = stepLabFlash(z, false, { x: 999, y: 999 }, 90);
    expect(labFlashLevel(0, true)).toBe(0); expect(labFlashLevel(1, true)).toBe(1);
    expect(labFlashLevel(0.5, true)).toBeLessThan(labFlashLevel(0.4, true)); // 点く途中で一度だけ瞬く
    expect(labFlashLevel(0.5, false)).toBeGreaterThan(labFlashLevel(0.4, false)); // 消える時は瞬かない
    expect(z.a).toBe(0);
    // 消え切った後に点け直すと、また狙いの位置から
    const again = stepLabFlash(z, true, { x: -50, y: 30 }, 16);
    expect([again.x, again.y]).toEqual([-50, 30]);
  });
});

describe('闇に開ける穴の一覧', () => {
  it('何も無ければ自分の周りだけ。PHILLガンを構えていれば懐中電灯が足される(強さは点灯のフェードを掛ける)', () => {
    const base = labPitchLights(input(), CFG);
    expect(base).toEqual([{ shape: 'disc', x: 0, y: 0, r: 75, a: 0.5, keep: true }]);
    const lit = labPitchLights(input({ flash: { x: 130, y: 0, a: 0.5, dirX: 1, dirY: 0 } }), CFG);
    expect(lit).toHaveLength(2);
    expect(lit[1].shape).toBe('beam');
    expect(lit[1].a).toBeCloseTo(0.95 * 0.5, 6);
    expect(labPitchLights(input({ flash: { x: 130, y: 0, a: 0, dirX: 1, dirY: 0 } }), CFG)).toHaveLength(1);
  });
  it('技を出している敵の周りに穴(名札つき・捨てない)。見えていない所の敵・UVバー・光は作らない', () => {
    const ls = labPitchLights(input({
      enemies: [foe({ id: 'a', aiPhase: 'windup' }), foe({ id: 'b' }), foe({ id: 'far', aiPhase: 'windup', x: 5000 })],
      uvBars: [{ x: 300, y: 0 }, { x: 9000, y: 0 }],
    }), CFG);
    const ids = ls.filter(l => l.id).map(l => l.id);
    expect(ids).toEqual(['a']);
    expect(ls.find(l => l.id === 'a')).toMatchObject({ shape: 'disc', x: 120, y: 130, a: LAB_DANGER_A, keep: true, hard: true }); // 技の最中=危険の穴
    const idle = labPitchLights(input({ enemies: [foe({ id: 'h', type: 'hunter' })] }), CFG).find(l => l.id === 'h')!;
    expect(idle.a).toBe(LAB_REVEAL_A); expect(idle.hard).toBeUndefined(); // 予告なしで寄ってくる型の、技の外の体は普通の穴
    expect(ls.filter(l => l.r === LAB_UV_R)).toHaveLength(1);
  });
  it('光のエフェクト(銃の閃光・爆発)は、光っている間だけ周りを照らす。強い順に上限まで', () => {
    const glows = Array.from({ length: 20 }, (_, i) => ({ x: i * 10, y: 0, radius: 40 + i, life: 1 }));
    const ls = labPitchLights(input({ glows: [...glows, { x: 0, y: 0, radius: 60, life: 0 }] }), CFG);
    const g = ls.slice(1);
    expect(g).toHaveLength(LAB_GLOW_MAX);
    expect(g[0].r).toBeGreaterThanOrEqual(g[g.length - 1].r);
    const half = labPitchLights(input({ glows: [{ x: 0, y: 0, radius: 50, life: 0.5 }] }), CFG)[1];
    expect(half.a).toBeCloseTo(0.7 * 0.5, 6);
  });
  it('上限を超えても、自分・懐中電灯・技を出している敵は捨てない(UVバーと光から捨てる)', () => {
    const enemies = Array.from({ length: 30 }, (_, i) => foe({ id: `e${i}`, aiPhase: 'windup', x: i * 5 }));
    const uvBars = Array.from({ length: 10 }, (_, i) => ({ x: i * 20, y: 0 }));
    const ls = labPitchLights(input({ flash: { x: 100, y: 0, a: 1, dirX: 1, dirY: 0 }, enemies, uvBars }), CFG);
    expect(ls.filter(l => l.id && !l.id.includes(':'))).toHaveLength(30);
    expect(ls.filter(l => l.r === LAB_UV_R)).toHaveLength(0);
    const few = labPitchLights(input({ uvBars: Array.from({ length: 40 }, (_, i) => ({ x: i, y: 0 })) }), CFG);
    expect(few).toHaveLength(LAB_PITCH_MAX_LIGHTS);
  });
});

describe('技の届く形・這う塊・敵の弾(赤いのに見えない、を作らない)', () => {
  it('技を出している敵に狙いの点があれば、体の中心→狙いの点に沿った細長い穴と、狙いの点の丸い穴が出る', () => {
    // 体の中心=(120,130)。狙い=(520,130)=右へ400。
    const e = foe({ id: 'dog', aiPhase: 'windup', aiTargetX: 520, aiTargetY: 130 });
    const [path, aim] = labEnemyReach(e, 5000);
    expect(path).toMatchObject({ shape: 'disc', x: 320, y: 130, r: 200 + LAB_REACH_PAD, ry: LAB_REACH_HALF_W, keep: true, hard: true, a: LAB_DANGER_A, id: 'dog:path' });
    expect(path.rot).toBeCloseTo(0, 6);
    expect(aim).toMatchObject({ shape: 'disc', x: 520, y: 130, r: LAB_REACH_AIM_R, keep: true, id: 'dog:aim' });
    // 斜めでも向きが合う
    const diag = labEnemyReach(foe({ aiPhase: 'windup', aiTargetX: 120, aiTargetY: 430 }), 5000)[0];
    expect(diag.rot).toBeCloseTo(Math.PI / 2, 6);
    // 一覧にも入る(体の穴と合わせて3つ)
    const ls = labPitchLights(input({ enemies: [e] }), CFG);
    expect(ls.filter(l => l.id).map(l => l.id)).toEqual(['dog', 'dog:path', 'dog:aim']);
  });
  it('狙いが体のすぐそば・狙いの点が無い・技を出していない・気絶中は、届く形を出さない。遠すぎる狙いは長さを打ち切る', () => {
    expect(labEnemyReach(foe({ aiPhase: 'windup', aiTargetX: 130, aiTargetY: 130 }), 5000)).toEqual([]);
    expect(labEnemyReach(foe({ aiPhase: 'windup' }), 5000)).toEqual([]);
    expect(labEnemyReach(foe({ aiTargetX: 900, aiTargetY: 130 }), 5000)).toEqual([]);
    expect(labEnemyReach(foe({ type: 'hunter', aiTargetX: 900, aiTargetY: 130 }), 5000)).toEqual([]); // 常に見せる型でも、技の外では古い狙いを使わない
    expect(labEnemyReach(foe({ aiPhase: 'windup', stunUntil: 9000, aiTargetX: 900, aiTargetY: 130 }), 5000)).toEqual([]);
    // ハンターの突進(1300)は打ち切らない: 線の穴が狙いの点まで届く
    const hunt = labEnemyReach(foe({ aiPhase: 'windup', aiTargetX: 120 + 1300, aiTargetY: 130 }), 5000);
    expect(hunt[0].r).toBe(650 + LAB_REACH_PAD);
    expect(hunt[1].x).toBe(120 + 1300);
    // 安全弁より遠い狙い: 線の穴の長さだけ打ち切る。狙いの点の丸い穴は本当の狙いの点(着地点・行き先を闇に沈めない)
    const far = labEnemyReach(foe({ aiPhase: 'windup', aiTargetX: 120 + 5000, aiTargetY: 130 }), 5000);
    expect(far[0].r).toBe(LAB_REACH_MAX_LEN / 2 + LAB_REACH_PAD);
    expect(far[1].x).toBe(120 + 5000);
  });
  it('這う塊: 起きている間は体の楕円。叩きつけの溜め〜当たりの間は、その円も見せる', () => {
    const body = labPitchLights(input({ crawler: { x: 300, y: -50, halfW: 370, halfH: 150, slam: null } }), CFG);
    expect(body.find(l => l.id === 'crawler')).toMatchObject({ shape: 'disc', x: 300, y: -50, r: 370 * LAB_CRAWLER_BODY_K, ry: 150 * LAB_CRAWLER_BODY_K, keep: true });
    expect(body.find(l => l.id === 'crawler:slam')).toBeUndefined();
    const slam = labPitchLights(input({ crawler: { x: 300, y: -50, halfW: 370, halfH: 150, slam: { x: 20, y: 40, r: 230 } } }), CFG);
    expect(slam.find(l => l.id === 'crawler:slam')).toMatchObject({ x: 20, y: 40, r: 230 * LAB_CRAWLER_SLAM_K, keep: true, hard: true });
    expect(LAB_CRAWLER_SLAM_K).toBeGreaterThanOrEqual(1.6); // 赤い円の輪郭が、穴の半径の6割あたりより内側に来る(縁の暗い所に重ねない)
    expect(labPitchLights(input({ crawler: null }), CFG)).toHaveLength(1);
  });
  it('アテンションの注目点の周りを開ける(闇は消さない)', () => {
    const ls = labPitchLights(input({ focus: { x: 800, y: -30 } }), CFG);
    expect(ls.find(l => l.id === 'focus')).toMatchObject({ shape: 'disc', x: 800, y: -30, r: LAB_FOCUS_R, keep: true });
    expect(labPitchLights(input({ focus: null }), CFG)).toHaveLength(1);
  });
  it('敵の弾の周りに小さい穴。多い時は自分に近い順に上限まで・捨てない', () => {
    const one = labPitchLights(input({ shots: [{ x: 200, y: 0 }, { x: 9000, y: 0 }] }), CFG);
    expect(one.filter(l => l.r === LAB_SHOT_R)).toHaveLength(1);
    const many = labPitchLights(input({ shots: Array.from({ length: 60 }, (_, i) => ({ x: 900 - i * 10, y: 0 })) }), CFG);
    const holes = many.filter(l => l.r === LAB_SHOT_R);
    expect(holes).toHaveLength(LAB_SHOT_MAX);
    expect(Math.max(...holes.map(l => l.x))).toBe(900 - (60 - LAB_SHOT_MAX) * 10); // 遠い弾から捨てる
    expect(holes.every(l => l.keep)).toBe(true);
  });
});

describe('敵の周りの穴のフェード(慣性)', () => {
  const mk = (id: string, a = LAB_REVEAL_A): LabLight => ({ shape: 'disc', x: 0, y: 0, r: 100, a, keep: true, id });
  it('消えかけ(残光)から戻った時も、そのフレームから8割以上で開く(連続する技・塊の連続叩きつけの赤い予告を闇に沈めない)', () => {
    let r = labEaseReveals(new Map(), [mk('a', 1)], 16);
    for (let i = 0; i < 40; i++) r = labEaseReveals(r.next, [mk('a', 1)], 16);
    for (let i = 0; i < 30; i++) r = labEaseReveals(r.next, [], 16); // 480ms ぶん消えかける
    const low = r.next.get('a')!.a;
    expect(low).toBeGreaterThan(0.05); expect(low).toBeLessThan(0.5);
    const back = labEaseReveals(r.next, [mk('a', 1)], 16);
    expect(back.lights[0].a).toBeGreaterThanOrEqual(LAB_REVEAL_IN_START);
  });
  it('危険の穴(2回削り)は、なったフレームから全開。外れる時は残光で抜ける(1フレームで暗くならない)', () => {
    const hard = (id: string): LabLight => ({ ...mk(id, 1), hard: true });
    let r = labEaseReveals(new Map(), [hard('h')], 16);
    expect(r.lights[0].hardK).toBe(1);
    for (let i = 0; i < 30; i++) r = labEaseReveals(r.next, [hard('h')], 16);
    expect(r.lights[0].a).toBeCloseTo(1, 3);
    r = labEaseReveals(r.next, [mk('h', 0.9)], 16); // 技が終わった(同じ名札で普通の穴になる)
    expect(r.lights[0].hardK).toBeGreaterThan(0.9);
    expect(r.lights[0].a).toBeGreaterThan(0.95);
    for (let i = 0; i < 120; i++) r = labEaseReveals(r.next, [mk('h', 0.9)], 16);
    expect(r.lights[0].hardK).toBe(0);
    expect(r.lights[0].a).toBeCloseTo(0.9, 2);
    // 普通の穴が危険の穴になったフレームは全開
    expect(labEaseReveals(r.next, [hard('h')], 16).lights[0].hardK).toBe(1);
  });
  it('出た最初のフレームから8割で開く(赤い予告の出始めを闇に沈めない)・消える時は最後の位置のまま0へ寄せて(残光でゆっくり)、消え切ったら捨てる。名札の無い穴はそのまま', () => {
    const self: LabLight = { shape: 'disc', x: 1, y: 2, r: 75, a: 0.5, keep: true };
    let r = labEaseReveals(new Map(), [self, mk('a')], 16);
    expect(r.lights[0]).toBe(self);
    const a0 = r.lights[1].a;
    expect(a0).toBeGreaterThanOrEqual(LAB_REVEAL_A * LAB_REVEAL_IN_START); expect(a0).toBeLessThan(LAB_REVEAL_A);
    expect(labEaseReveals(new Map(), [mk('z')], 0).lights[0].a).toBeCloseTo(LAB_REVEAL_A * LAB_REVEAL_IN_START, 6); // フレームの幅が0でも開いている
    for (let i = 0; i < 60; i++) r = labEaseReveals(r.next, [self, mk('a')], 16);
    expect(r.lights[1].a).toBeCloseTo(LAB_REVEAL_A, 2);
    // 居なくなった: 残って薄くなる
    let gone = labEaseReveals(r.next, [self], 16);
    expect(gone.lights).toHaveLength(2);
    expect(gone.lights[1].a).toBeLessThan(LAB_REVEAL_A);
    expect(gone.lights[1].a).toBeGreaterThan(LAB_REVEAL_A * 0.9); // 消える方がゆっくり(1フレームではほとんど減らない)
    for (let i = 0; i < 120; i++) gone = labEaseReveals(gone.next, [self], 16);
    expect(gone.lights).toHaveLength(1);
    expect(gone.next.size).toBe(0);
  });
});
