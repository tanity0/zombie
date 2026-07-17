// 緑卵(地雷)の無効化ゲート(チュートリアル=卵なし・社長指示2026-07-17)のユニット。
// ワールド生成3関数(region/pressure/ambush)を world 層で一括ゲートする方式のため、
// 「描画・接触判定・影キャスタが同時に消える」ことはこの1点(3関数が空)で保証される。
import { describe, it, expect, afterEach } from 'vitest';
import { minesInRegion, pressureMinesNearPlayer, mineAmbushAround, setMinesDisabled } from './mines';

afterEach(() => setMinesDisabled(false)); // 他テストへ漏らさない

describe('setMinesDisabled(チュートリアル=緑卵なし)', () => {
  it('既定では緑卵が生える(広域で非空)', () => {
    expect(minesInRegion(-8000, -8000, 8000, 8000).length).toBeGreaterThan(0);
  });

  it('無効化すると3ソース全てが空になる', () => {
    setMinesDisabled(true);
    expect(minesInRegion(-8000, -8000, 8000, 8000)).toEqual([]);
    // pressure: どのセグメントでも空(方向・時刻は代表値でサンプル)
    for (let t = 0; t < 5; t++) {
      expect(pressureMinesNearPlayer(0, 0, { x: 1, y: 0 }, t * 18000)).toEqual([]);
    }
    expect(mineAmbushAround({ id: 'test-anchor', x: 0, y: 0, width: 800, height: 600 })).toEqual([]);
  });

  it('再有効化で元どおり生える(ラン跨ぎの復元)', () => {
    setMinesDisabled(true);
    expect(minesInRegion(-8000, -8000, 8000, 8000)).toEqual([]);
    setMinesDisabled(false);
    expect(minesInRegion(-8000, -8000, 8000, 8000).length).toBeGreaterThan(0);
  });
});
