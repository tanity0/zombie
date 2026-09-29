// ★ミゲルの爪・剣のシート(社長支給2026-09-28「魔法系(爪を出す)/剣撃系(剣を振る)」)。州→コマの割り付け。
import { describe, it, expect } from 'vitest';
import angelTickSrc from './angelBossTick.ts?raw';
import { BOSS_PHASE_SHEETS, ENEMY_FRAME_OFFSETS, bossPhaseFor, bossPhaseFrame, idleSheetName } from './enemySheets';

const MIGUEL_TECH_STATES = [
  'volley-windup', 'volley', 'volley-recover',
  'harai-windup', 'harai', 'tate-windup', 'tate', 'tate-recover',
  'mdash-windup', 'mdash-move', 'mdash-recover',
];

describe('ミゲルの爪・剣のシート', () => {
  it('技の州は全部どちらかのシートを持つ(連射=爪 / 払い・縦払い・突進=剣)。待機の州は持たない', () => {
    for (const st of MIGUEL_TECH_STATES) {
      const want = st.startsWith('volley') ? 'miguel-claw' : 'miguel-slash';
      expect(bossPhaseFor('miguel', st)?.spec.name, st).toBe(want);
    }
    for (const st of ['chase', 'counter-leap', undefined]) expect(bossPhaseFor('miguel', st), String(st)).toBeNull();
    // 同じ州名を使う別の天使には、その天使のシートが引かれる(立ち絵で引く=ミゲルの絵は出ない)。
    expect(bossPhaseFor('jibril', 'volley')?.spec.idle).toBe('jibril');
    expect(bossPhaseFor('uri', 'volley')).toBeNull();
  });
  it('表の州名はミゲルの台本に実在する(州名を変えたら絵が黙って消える形を止める)', () => {
    const src = angelTickSrc;
    // 天使の台本(angelBossTick)に載る個体だけ(賞金首は bountyTick 側=bountyMeleeLash.test.ts が見る)。
    for (const spec of BOSS_PHASE_SHEETS.filter(sp => ['miguel', 'jibril', 'rafi', 'uri', 'suriel'].includes(sp.idle))) for (const ph of spec.phases) {
      expect(src.includes(`'${ph.state}'`), ph.state).toBe(true);
    }
  });
  it('コマは全部シートの範囲内・胴のずらしはコマ数ぶんある', () => {
    for (const spec of BOSS_PHASE_SHEETS.filter(sp => sp.idle === 'miguel')) {
      expect(ENEMY_FRAME_OFFSETS[spec.name]?.length, spec.name).toBe(spec.frames);
      for (const ph of spec.phases) for (const f of ph.seq) {
        expect(f).toBeGreaterThanOrEqual(0); expect(f).toBeLessThan(spec.frames);
      }
    }
    expect(ENEMY_FRAME_OFFSETS[idleSheetName('miguel')]?.length).toBe(16);
  });
  it('当たる州(払い・縦払い)の中で振り抜き(2〜5)を出し切る=絵の振りと判定が同じ時刻', () => {
    for (const st of ['harai', 'tate']) {
      const ph = bossPhaseFor('miguel', st)!.phase;
      const seen = Array.from({ length: 100 }, (_, k) => bossPhaseFrame(ph, k / 100, 0, 90));
      expect([...new Set(seen)]).toEqual([2, 3, 4, 5]);
    }
  });
  it('stretch は州の頭で先頭・終わりで末尾。範囲外・非数でも並びの中に収まる', () => {
    const ph = bossPhaseFor('miguel', 'tate-recover')!.phase;
    expect(bossPhaseFrame(ph, 0, 0, 90)).toBe(6);
    expect(bossPhaseFrame(ph, 0.999, 0, 90)).toBe(8);
    expect(bossPhaseFrame(ph, 5, 0, 90)).toBe(8);
    expect(bossPhaseFrame(ph, -1, 0, 90)).toBe(6);
    expect(bossPhaseFrame(ph, Number.NaN, 0, 90)).toBe(6);
  });
  it('pingpong は並びを往復する(継ぎ目で同じコマが2回続かない)', () => {
    const ph = bossPhaseFor('miguel', 'volley')!.phase;
    const seq = Array.from({ length: 9 }, (_, k) => bossPhaseFrame(ph, 0, k * 90 + 1, 90));
    expect(seq).toEqual([4, 5, 6, 5, 4, 5, 6, 5, 4]);
  });
});

describe('待機のシートの bodyH(立ち絵と大きさを揃える)', () => {
  it('表の個体は待機のシートを持ち、値は正', async () => {
    const { ENEMY_IDLE_BODY_H, ENEMY_IDLE_SHEETS } = await import('./enemySheets');
    for (const [k, v] of Object.entries(ENEMY_IDLE_BODY_H)) {
      expect(ENEMY_IDLE_SHEETS[k], k).toBeGreaterThan(1);
      expect(v).toBeGreaterThan(0);
    }
  });
});
