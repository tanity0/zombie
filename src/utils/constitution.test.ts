// 憲法テスト(v0.25.1344・再発防止): PACING_REDESIGN.mdの憲法と横断不変条件を機械化する。
// 個々のバッチのユニットテストでは掬えない「モジュール間の整合」をここで守る。
// 背景(全部この形の見落としが実バグ化した):
//  - GAME_AUDIT #3: 関所①のfeaturedが自分のmaxRung天井では解禁不能=一度も出ない自己矛盾
//  - v0.25.1343: mix未指定シーンでゾンビ配合が効かない / 回収の床が初心者ゾーンに問題児を逆流
// 新しいシーン・演目・台本・しきい値を足す時はこのテストを通すこと。どうしても違反したい場合は
// PACING_REDESIGN.mdの★未決事項に書いて社長裁定を得る(コードコメントに書く質問は届かない)。
import { describe, it, expect } from 'vitest';
import type { EnemyType } from '../types/game';
import { PHASES, ENEMY_COUNT_FLOOR, type SpawnScene } from './difficultyDirector';
import { GATE_NUMBER, GATE_LINEOFSIGHT, gateJudgmentProgram, GATE_TRIPLE, GATE_AMBUSH, type GateProgram } from './gateProgram';
import { RELAX_PROGRAM, HARVEST_PROGRAM, lessonProgram, recoveryProgram, type ReliefProgram } from './reliefProgram';
import { ceilingForMaxRung, ceilingForZone, allowedProblemChildren } from './gatePressure';

// 問題児が関所の許可リストに入るための最低pressure(1種目=スタイル先行側の値で判定)。
const FIRST_PICK_THRESHOLD: Partial<Record<EnemyType, number>> = {
  plant: 0.35, werewolf: 0.50, pumpkin: 0.50, screamer: 0.80, ghost: 0.95,
};

const ALL_GATE_PROGRAMS: GateProgram[] = [
  GATE_NUMBER, GATE_LINEOFSIGHT, gateJudgmentProgram('近接', 0.5), GATE_TRIPLE, GATE_AMBUSH,
];
const ALL_RELIEF_PROGRAMS: ReliefProgram[] = [
  RELAX_PROGRAM, HARVEST_PROGRAM, lessonProgram('werewolf'), lessonProgram('pumpkin'), recoveryProgram('werewolf'),
];
const ALL_PHASE_SCENES: SpawnScene[] = [...new Map(PHASES.map(p => [p.scene.id, p.scene])).values()];

describe('憲法テスト(横断不変条件)', () => {
  it('第1条: 台本のcountCapは基本上限(10)を超えない', () => {
    for (const p of PHASES) expect(p.countCap, `phase ${p.kind}${p.index}`).toBeLessThanOrEqual(ENEMY_COUNT_FLOOR);
  });

  it('第4条: 初心者ゾーン(エリア0-1)の天井では問題児が一切解禁されない', () => {
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
});
