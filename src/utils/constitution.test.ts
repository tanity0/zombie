// 旧・憲法テスト【v0.26.8で憲法廃止・v0.26.13ヘッダ更新】
// 「憲法」としての拘束力(全条維持の縛り)は社長指示で廃止済み。PACING_V2.mdの現行記述
// (§2エリア台本=エリア1にも問題児が「たまに」出る 等)が常に優先する。
// このファイルは現存する機構(countCap/gatePressureのゾーン天井/床の許可リスト/mix指定/
// R4-B緩純度/R4-Cデータ)の**回帰ガード**として存置している。PACING_V2.mdの裁定があれば
// いつでも書き換え・削除してよい。
// (旧背景・再発防止の経緯: GAME_AUDIT #3=関所①featuredの自己矛盾/v0.25.1343=mix未指定・
//  回収床の初心者ゾーン逆流。「横断不変条件はテストで機械化する」という一般原則は引き続き有効)
// 注: 旧第4条のテストが守るのは`?v2=0`旧復帰経路のゾーン天井のみ。26系ではゾーン天井を使わず、
// エリア1でも問題児を止めない。エリア台本(areaScript.ts)や26系通常湧きがエリア1に問題児を
// 入れるのは仕様であり、本テストと矛盾しない(経路が異なる)。
import { describe, it, expect } from 'vitest';
import type { EnemyType } from '../types/game';
import { PHASES, ENEMY_COUNT_FLOOR, type SpawnScene } from './difficultyDirector';
import { GATE_NUMBER, GATE_LINEOFSIGHT, gateJudgmentProgram, GATE_TRIPLE, GATE_AMBUSH, GATE_ASSAULT, GATE_BOSS_SPIKE, type GateProgram } from './gateProgram';
import { RELAX_PROGRAM, HARVEST_PROGRAM, lessonProgram, recoveryProgram, type ReliefProgram } from './reliefProgram';
import { ceilingForMaxRung, ceilingForZone, allowedProblemChildren } from './gatePressure';

// 問題児が関所の許可リストに入るための最低pressure(1種目=スタイル先行側の値で判定)。
const FIRST_PICK_THRESHOLD: Partial<Record<EnemyType, number>> = {
  plant: 0.35, werewolf: 0.50, pumpkin: 0.50, screamer: 0.80, ghost: 0.95,
};

const ALL_GATE_PROGRAMS: GateProgram[] = [
  GATE_NUMBER, GATE_LINEOFSIGHT, gateJudgmentProgram('近接', 0.5), GATE_TRIPLE, GATE_AMBUSH,
  GATE_ASSAULT, GATE_BOSS_SPIKE,
];
const ALL_RELIEF_PROGRAMS: ReliefProgram[] = [
  RELAX_PROGRAM, HARVEST_PROGRAM, lessonProgram('werewolf'), lessonProgram('pumpkin'), recoveryProgram('werewolf'),
];
const ALL_PHASE_SCENES: SpawnScene[] = [...new Map(PHASES.map(p => [p.scene.id, p.scene])).values()];

describe('旧・憲法テスト(拘束力はv0.26.8廃止済み・現存機構の回帰ガードとして存置)', () => {
  it('第1条: 台本のcountCapは基本上限(10)を超えない', () => {
    for (const p of PHASES) expect(p.countCap, `phase ${p.kind}${p.index}`).toBeLessThanOrEqual(ENEMY_COUNT_FLOOR);
  });

  it('?v2=0旧経路: 初心者ゾーン(エリア0-1)のゾーン天井では問題児が一切解禁されない', () => {
    for (const area of [0, 1]) {
      const allowed = allowedProblemChildren(ceilingForZone(area), ['werewolf', 'pumpkin']);
      expect(allowed, `area ${area}`).toEqual([]);
    }
  });

  it('台本の自己整合: 関所シーンのfeatured問題児は、その関所自身のmaxRung天井で解禁可能(GAME_AUDIT #3の再発防止)', () => {
    for (const p of PHASES) {
      if (p.kind !== 'gate') continue;
      const ceiling = ceilingForMaxRung(p.maxRung ?? 7);
      for (const t of p.scene.featured) {
        const th = FIRST_PICK_THRESHOLD[t];
        if (th === undefined) continue; // チャフのfeaturedは対象外
        expect(th, `gate${p.index}(${p.scene.id}) featured ${t}`).toBeLessThanOrEqual(ceiling);
      }
    }
    for (const g of ALL_GATE_PROGRAMS) {
      const ceiling = ceilingForMaxRung(g.maxRung);
      for (const t of g.featured) {
        const th = FIRST_PICK_THRESHOLD[t];
        if (th === undefined) continue;
        expect(th, `${g.id} featured ${t}`).toBeLessThanOrEqual(ceiling);
      }
    }
  });

  it('チャフ配合: すべてのシーン・演目・台本がmixを持つ(未指定=素の分布はゾンビ過多・v0.25.1343の教訓)', () => {
    for (const s of ALL_PHASE_SCENES) expect(s.mix, `scene ${s.id}`).toBeDefined();
    for (const g of ALL_GATE_PROGRAMS) expect(g.mix, `gate program ${g.id}`).toBeDefined();
    for (const r of ALL_RELIEF_PROGRAMS) expect(r.mix, `relief program ${r.id}`).toBeDefined();
  });

  it('床(featuredFloor)の許可リスト: 講習・無双・回収のみ。関所には床を張らない(バッチ1.5の教訓)', () => {
    const FLOOR_ALLOWED_SCENES = new Set(['relief-pumpkin', 'relief-wolf', 'mowdown']);
    for (const s of ALL_PHASE_SCENES) {
      if (s.featuredFloor) expect(FLOOR_ALLOWED_SCENES.has(s.id), `scene ${s.id} has floor`).toBe(true);
    }
    for (const g of ALL_GATE_PROGRAMS) expect(!!g.featuredFloor, `gate program ${g.id}`).toBe(false);
    const FLOOR_ALLOWED_PROGRAMS = new Set(['lesson-wolf', 'lesson-pumpkin', 'recovery']);
    for (const r of ALL_RELIEF_PROGRAMS) {
      if (r.featuredFloor) expect(FLOOR_ALLOWED_PROGRAMS.has(r.id), `relief program ${r.id} has floor`).toBe(true);
    }
  });

  it('床つき演目は主役上限の仕組み(lessonPrimary/recoveryPrimary)を必ず持つ(無制限補充の禁止)', () => {
    for (const r of ALL_RELIEF_PROGRAMS) {
      if (!r.featuredFloor) continue;
      expect(r.lessonPrimary ?? r.recoveryPrimary, `relief program ${r.id}`).toBeDefined();
    }
  });

  it('天井テーブルの単調性: maxRung天井とゾーン天井は非減少', () => {
    for (let r = 3; r <= 7; r++) expect(ceilingForMaxRung(r)).toBeGreaterThanOrEqual(ceilingForMaxRung(r - 1));
    for (let a = 1; a <= 4; a++) expect(ceilingForZone(a)).toBeGreaterThanOrEqual(ceilingForZone(a - 1));
  });

  // PACING_V2.mdバッチR4-B(緩の純度ガード): 緩コマ中の問題児の新規投入経路はfeaturedFloor
  // (講習/回収の主役)だけに限定される。pressure配役(gatePressure)・イベント(囲い/主題保証)は
  // curPhase.kind==='gate'でしか発火しない配線になっている(useGameLoopのpressureOutdoor/
  // gateEventPendingRef判定・実装精度の規律1: この配線自体はwiring側なので単体テスト対象外だが、
  // ここではデータ側の不変条件として「床の無い緩演目はfeaturedが空」を固定する)。
  it('R4-B: 床(featuredFloor)を持たない緩演目(relax/harvest)はfeaturedが空(問題児の新規投入経路が無い)', () => {
    for (const r of ALL_RELIEF_PROGRAMS) {
      if (r.featuredFloor) continue;
      expect(r.featured, `relief program ${r.id}`).toEqual([]);
    }
  });

  it('R4-B: 緩の全演目でzombie配合は少数派に抑える(「群れに1体」=既存5%を固定・硬いゾンビを常駐させない)', () => {
    for (const r of ALL_RELIEF_PROGRAMS) {
      const mix = r.mix!;
      const total = mix.bat + mix.skeleton + mix.zombie;
      expect(mix.zombie / total, `relief program ${r.id}`).toBeLessThanOrEqual(0.1);
    }
  });

  it('R4-C: 非イベント・不意打ち以外の台本がshallowExpressionを持つ(浅いエリアの追加表現)', () => {
    for (const g of ALL_GATE_PROGRAMS) {
      if (g.id === 'gate-ambush') { expect(g.shallowExpression).toBeUndefined(); continue; }
      if (g.eventKind) { expect(g.shallowExpression, `${g.id}`).toBeUndefined(); continue; }
      expect(g.shallowExpression, `${g.id}`).toBeDefined();
    }
  });

  it('R4-C: 数の関所のshallowExpressionは仕様の数値(v0.26.6定量化・intervalMult×0.7・bat50/skeleton30/zombie20)と一致する', () => {
    expect(GATE_NUMBER.shallowExpression).toEqual({ kind: 'tempo', intervalMult: 0.7, mix: { bat: 50, skeleton: 30, zombie: 20 } });
  });
});
