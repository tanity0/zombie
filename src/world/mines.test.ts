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

// 緑卵の起爆(社長仕様v0.25.1846「踏むと赤くプクプク→2秒後に爆発。範囲内の卵は連鎖起爆」)の純関数。
import { dueArmedEggs, eggsToChainArm, EGG_FUSE_MS, EGG_BLAST_RADIUS, isEggExpired, eggsToArmForCap, EGG_TTL_MS, MINE_LIVE_CAP } from './mines';

const egg = (id: string, x: number, y: number, armedAt?: number) =>
  ({ id, type: 'mine', footX: x, footY: y, armedAt });

describe('緑卵の起爆ヘルパ(v0.25.1846)', () => {
  it('dueArmedEggs: アームからEGG_FUSE_MS経過した卵だけを返す', () => {
    const props = [
      egg('a', 0, 0),                            // 未アーム
      egg('b', 0, 0, 1000),                      // アーム済み・期限到達
      egg('c', 0, 0, 2500),                      // アーム済み・まだ
      { ...egg('d', 0, 0, 0), type: 'torch' },   // mine以外は対象外
    ];
    const due = dueArmedEggs(props, 1000 + EGG_FUSE_MS);
    expect(due.map(p => p.id)).toEqual(['b']);
  });
  it('eggsToChainArm: 爆心の範囲内・未アームの卵だけ(アーム済み/圏外/mine以外は除外)', () => {
    const props = [
      egg('in', EGG_BLAST_RADIUS - 1, 0),        // 圏内・未アーム=連鎖対象
      egg('armed', 10, 0, 500),                  // 圏内だがアーム済み=二重アームしない
      egg('out', EGG_BLAST_RADIUS + 1, 0),       // 圏外
      { ...egg('torch2', 0, 0), type: 'torch' }, // mine以外
    ];
    expect(eggsToChainArm(props, 0, 0).map(p => p.id)).toEqual(['in']);
  });
  it('連鎖の伝播: 初回圏外の卵にも、間の卵の爆発を経由して2ホップ目で届く', () => {
    const props = [egg('b', 60, 0), egg('c', 120, 0)];
    expect(eggsToChainArm(props, 0, 0).map(p => p.id)).toEqual(['b']); // cは圏外
    const afterHop1 = [egg('c', 120, 0)]; // bは爆発済みで除去
    expect(eggsToChainArm(afterHop1, 60, 0).map(p => p.id)).toEqual(['c']);
  });
});

describe('★緑卵の寿命と同時上限(社長指示2026-10-16・A6)', () => {
  it('撒かれた卵は EGG_TTL_MS で期限切れ(アーム済み・設置物・他の型は対象外)', () => {
    expect(isEggExpired({ id: 'a', type: 'mine', laidAt: 0 }, EGG_TTL_MS)).toBe(true);
    expect(isEggExpired({ id: 'a', type: 'mine', laidAt: 0 }, EGG_TTL_MS - 1)).toBe(false);
    expect(isEggExpired({ id: 'a', type: 'mine', laidAt: 0, armedAt: 10 }, EGG_TTL_MS)).toBe(false); // アーム済みは触らない
    expect(isEggExpired({ id: 'a', type: 'mine' }, 1e9)).toBe(false);                                   // 設置物(laidAt無し)は寿命なし
    expect(isEggExpired({ id: 'a', type: 'torch', laidAt: 0 }, 1e9)).toBe(false);
  });
  it('上限超過ぶんは古い順(撒かれた動的卵→設置物)に選ぶ。アーム済みは数えない', () => {
    const props = [
      ...Array.from({ length: 3 }, (_, i) => ({ id: `gen-${i}`, type: 'mine' })),           // 設置物
      { id: 'old', type: 'mine', laidAt: 100 }, { id: 'new', type: 'mine', laidAt: 500 },
      { id: 'armed', type: 'mine', laidAt: 1, armedAt: 50 },
    ];
    expect(eggsToArmForCap(props, 5).size).toBe(0);           // 未アーム5個=上限ちょうど
    const over1 = eggsToArmForCap(props, 4);
    expect([...over1]).toEqual(['old']);                      // 1個超過=一番古い動的卵
    const over3 = eggsToArmForCap(props, 2);
    expect(over3.has('old') && over3.has('new')).toBe(true);  // 動的卵が先
    expect(over3.size).toBe(3);                               // 残り1個は設置物から
    expect(over3.has('armed')).toBe(false);
  });
  it('上限は待ち伏せ52個が一度に出る仕様を壊さない', () => {
    expect(MINE_LIVE_CAP).toBeGreaterThan(52);
  });
});
