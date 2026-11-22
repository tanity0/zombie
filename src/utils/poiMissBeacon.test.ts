import { describe, it, expect, beforeEach } from 'vitest';
import {
  poiMissReason, attentionInHold, isNearFocus, formatPoiMissLine, PoiMissGate,
  reportPoiMiss, lastPoiMissLine, resetPoiMiss, type PoiDrawFacts,
} from './poiMissBeacon';

const drawn: PoiDrawFacts = {
  hasPos: true, indoor: false, fade: 1, hasTex: true, horizonAlpha: 1, distOutside: 0,
  visible: true, alpha: 1, attached: true,
};

describe('poiMissReason', () => {
  it('描けていれば null', () => {
    expect(poiMissReason(drawn)).toBeNull();
    expect(poiMissReason({ ...drawn, distOutside: null })).toBeNull();
  });
  it('syncHospital と同じ順で最初に当たった条件を返す', () => {
    expect(poiMissReason({ ...drawn, hasPos: false, hasTex: false })).toBe('noPos');
    expect(poiMissReason({ ...drawn, indoor: true, hasTex: false })).toBe('indoor');
    expect(poiMissReason({ ...drawn, fade: 0, hasTex: false })).toBe('fade');
    expect(poiMissReason({ ...drawn, hasTex: false, horizonAlpha: 0 })).toBe('noTex');
    expect(poiMissReason({ ...drawn, horizonAlpha: 0, distOutside: 50 })).toBe('horizon a=0.00');
    expect(poiMissReason({ ...drawn, distOutside: 123.4, visible: false })).toBe('offscreen d=123');
  });
  it('条件は全部通るのに見えていない/透明/外れている', () => {
    expect(poiMissReason({ ...drawn, visible: false })).toBe('hidden?');
    expect(poiMissReason({ ...drawn, attached: false })).toBe('detached');
    expect(poiMissReason({ ...drawn, alpha: 0.01 })).toBe('alpha=0.01');
  });
  it('状態で描かない物は状態名', () => {
    expect(poiMissReason({ ...drawn, statusHidden: 'hidden' })).toBe('status=hidden');
  });
});

describe('attentionInHold / isNearFocus', () => {
  it('in の後〜out の前だけ true', () => {
    expect(attentionInHold(100, 360, 1000)).toBe(false);
    expect(attentionInHold(360, 360, 1000)).toBe(true);
    expect(attentionInHold(1359, 360, 1000)).toBe(true);
    expect(attentionInHold(1360, 360, 1000)).toBe(false);
    expect(attentionInHold(1500, 360, 1000, 500)).toBe(true);
  });
  it('半径以内', () => {
    expect(isNearFocus(100, 0, 0, 0, 200)).toBe(true);
    expect(isNearFocus(300, 0, 0, 0, 200)).toBe(false);
  });
});

describe('PoiMissGate', () => {
  it('同じアテンションで同じ理由は1回だけ・次のアテンションでまた出る', () => {
    const g = new PoiMissGate();
    expect(g.shouldReport(1, 'hospital', 'noTex')).toBe(true);
    expect(g.shouldReport(1, 'hospital', 'noTex')).toBe(false);
    expect(g.shouldReport(1, 'hospital', 'horizon a=0.00')).toBe(true);
    expect(g.shouldReport(2, 'hospital', 'noTex')).toBe(true);
  });
});

describe('ビーコンの行', () => {
  beforeEach(() => resetPoiMiss());
  it('理由と座標を1行に', () => {
    const line = formatPoiMissLine('hospital', 'noTex', { x: 10.4, y: 20 }, { x: 300, y: 400 }, { x: -1500, y: -800 }, { x: -1500, y: -800 });
    expect(line).toBe('poi-miss hospital: noTex cam(10,20) view(300,400) focus(-1500,-800) poi(-1500,-800)');
    expect(lastPoiMissLine()).toBeNull();
    reportPoiMiss(line);
    expect(lastPoiMissLine()).toBe(line);
  });
});
