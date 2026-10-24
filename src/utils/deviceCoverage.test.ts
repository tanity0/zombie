import { describe, it, expect } from 'vitest';
import { computeViewport } from './viewport';
import { snapTexelRatio, isSnapCovered } from './texelSnap';
import { DEVICE_VIEWPORTS } from './deviceCoverage';

// 端末特有問題の機械化(社長指示v0.25.1775「端末特有の問題もテスト機能に盛り込みたい」):
// 「常用機(フルスクリーン)は全てピクセルスナップ帯内」を不変条件としてCIで検査する。
// VIEW_CORE/VIEW_MAX(viewport.ts)・スナップ帯(texelSnap.ts)・対応機種リスト(deviceCoverage.ts)の
// どれかを将来変えて矛盾が出たら、このテストが赤くなって網羅の穴を教える。
describe('端末カバレッジ: ピクセルスナップ帯(アプリ化=フルスクリーン前提・v0.25.1774方針)', () => {
  for (const d of DEVICE_VIEWPORTS) {
    if (d.supported) {
      it(`${d.name} (${d.w}x${d.h}) はスナップ帯内=ドット潰れしない`, () => {
        const { scale } = computeViewport(d.w, d.h);
        expect(isSnapCovered(scale), `係数=${scale.toFixed(3)}`).toBe(true);
        expect(snapTexelRatio(scale)).toBe(Math.round(scale) || 1);
      });
    } else {
      it(`${d.name} (${d.w}x${d.h}) は帯外=既知の制限(ENGINEERING_NOTES)`, () => {
        const { scale } = computeViewport(d.w, d.h);
        // 「制限のまま」を明示的に記録する(もし将来帯内に入ったら、制限リストを更新して supported へ)。
        expect(isSnapCovered(scale), `係数=${scale.toFixed(3)}`).toBe(false);
      });
    }
  }

  it('係数の妥当性スポットチェック(表の代表値と一致)', () => {
    expect(computeViewport(375, 667).scale).toBeCloseTo(0.926, 3);  // SE2フル
    expect(computeViewport(360, 800).scale).toBeCloseTo(0.889, 3);  // Android 360dp
    expect(computeViewport(430, 932).scale).toBeCloseTo(1.062, 3);  // 15ProMax級
    expect(computeViewport(375, 553).scale).toBeCloseTo(0.768, 3);  // SE2バー付き(制限)
  });
});
