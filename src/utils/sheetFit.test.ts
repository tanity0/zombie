// 社長指示2026-09-24「倍率入れて」。**背丈を立ち絵へ合わせる**補正の不変条件。
import { describe, it, expect } from 'vitest';
import { sheetHeightFix } from './sheetFit';

/** 補正を掛けた後のコマの描画高さ。 */
const drawnH = (bw: number, bh: number, iw: number, ih: number, sw: number, sh: number): number =>
  Math.min(bw / sw, bh / sh) * sh * sheetHeightFix(bw, bh, iw, ih, sw, sh);
/** 立ち絵の描画高さ(合わせる先)。 */
const idleH = (bw: number, bh: number, iw: number, ih: number): number => Math.min(bw / iw, bh / ih) * ih;

describe('★シートの背丈を立ち絵へ合わせる', () => {
  it('同じ寸法なら補正しない(1.0)', () => {
    expect(sheetHeightFix(120, 120, 143, 128, 143, 128)).toBe(1);
  });

  it('★★補正後は必ず立ち絵と同じ背丈になる(実測で出た9件をそのまま入れる)', () => {
    const CASES: [string, number, number, [number, number], [number, number]][] = [
      // 名前, 枠W, 枠H, 立ち絵[w,h], コマ[w,h]
      ['リッチの歩き', 40 * 3, 40 * 3, [150, 128], [135, 128]],
      ['骸骨(女)の攻撃', 40 * 3, 40 * 3, [113, 128], [142, 130]],
      ['ステージ3の城ボスの歩き', 60 * 2.325, 60 * 2.325, [164, 150], [180, 150]],
      ['蜘蛛の跳ぶ', 40 * 2.925, 40 * 2.925, [256, 192], [157, 128]],
      ['削岩型の突き', 40 * 3, 40 * 3, [143, 128], [146, 128]],
    ];
    for (const [name, bw, bh, [iw, ih], [sw, sh]] of CASES) {
      expect(drawnH(bw, bh, iw, ih, sw, sh), name).toBeCloseTo(idleH(bw, bh, iw, ih), 6);
    }
  });

  it('★横に広いコマは縮められ、細いコマは広げられる(向きが逆にならない)', () => {
    // 立ち絵より横に広い＝そのままだと背が低くなる＝1より大きい倍率で戻す。
    expect(sheetHeightFix(120, 120, 140, 128, 180, 128)).toBeGreaterThan(1);
    // 立ち絵より細い＝そのままだと背が高くなる＝1より小さい倍率で戻す。
    expect(sheetHeightFix(120, 120, 180, 128, 140, 128)).toBeLessThan(1);
  });

  it('★高さ側で内接している時は、幅が変わっても補正されない(背丈が変わらないので)', () => {
    // 縦長の枠に縦長の絵＝どちらも高さ側で決まる＝背丈は同じ。
    expect(sheetHeightFix(400, 120, 100, 200, 130, 200)).toBeCloseTo(1, 6);
  });

  // ★★社長支給2026-09-25「叩きつけ」。枠より本体が低いシート(振り上げた蔓のぶん枠が20px高い)。
  describe('★枠より本体が低いシート(bodyH)', () => {
    // 城ボス3の実寸: 枠=当たり判定60×60×2.325=139.5の正方形 / 立ち絵164×150 / 叩きつけ162×170(本体150)。
    const B = 60 * 2.325;
    const drawn = (sw: number, sh: number, body?: number): number =>
      Math.min(B / sw, B / sh) * sh * sheetHeightFix(B, B, 164, 150, sw, sh, body);
    const IDLE = idleH(B, B, 164, 150);

    it('省略すると従来どおり=枠で揃える(=本体が 11.8% 縮む)', () => {
      // 枠は立ち絵と同じ高さに揃う。だが中身(本体150)は枠170のうちの150しかないので縮む。
      expect(drawn(162, 170)).toBeCloseTo(IDLE, 6);
      const bodyOnScreen = drawn(162, 170) * (150 / 170);
      expect(bodyOnScreen / IDLE).toBeCloseTo(150 / 170, 6);   // = 0.882 → -11.8%
    });

    it('bodyH=150 を渡すと**本体**が立ち絵と一致する(枠は立ち絵より高く出る)', () => {
      const bodyOnScreen = drawn(162, 170, 150) * (150 / 170);
      expect(bodyOnScreen).toBeCloseTo(IDLE, 6);
      expect(drawn(162, 170, 150)).toBeCloseTo(IDLE * (170 / 150), 6); // 枠はそのぶん高い=蔓が伸びる
    });

    it('bodyH が枠と同じなら省略時と1ビットも変わらない(既存30シートは不変)', () => {
      for (const [sw, sh] of [[180, 150], [133, 150], [143, 128], [214, 256]] as const) {
        expect(sheetHeightFix(B, B, 164, 150, sw, sh, sh)).toBe(sheetHeightFix(B, B, 164, 150, sw, sh));
      }
    });

    // ★★社長報告2026-09-25「城3のジャンプの絵がやたら小さい」。**枠は他と同じ150なのに、
    // シートそのものが 0.815倍で描かれていた**(立ち姿のコマを立ち絵へ重ねて実測・IoU 0.962)。
    // 枠を揃えるだけでは補正が 1.000 になり、中身が小さいまま出る。
    it('★シートが小さく描かれている時(枠は同じ150)は、bodyH で中身を揃える', () => {
      const SCALE = 0.815;              // 実測した描き込み倍率
      const bodyH = Math.round(150 * SCALE); // = 122
      // bodyH を書かないと: **枠**は立ち絵に揃う(縦長なので0.915倍される)が、
      // 中身は 0.815倍のまま=画面では立ち絵より小さいままになる。
      const noFix = drawn(133, 150) * SCALE;
      expect(noFix / IDLE).toBeCloseTo(SCALE, 3);   // = 0.815 ⇒ 18.5% 小さい
      // bodyH=122 を渡すと **中身が立ち絵と同じ大きさ**になる(枠はそのぶん大きく出る)。
      expect(drawn(133, 150, bodyH) * SCALE).toBeCloseTo(IDLE, 0);
      // 枠だけ見ると 150/122 = 1.23倍。ここが「絵が1.23倍へ引き伸ばされる」代償の正体。
      expect(drawn(133, 150, bodyH) / drawn(133, 150)).toBeCloseTo(150 / bodyH, 6);
    });

    it('壊れた bodyH では何もしない', () => {
      for (const bad of [0, -1, NaN]) expect(sheetHeightFix(B, B, 164, 150, 162, 170, bad)).toBe(1);
    });
  });

  it('壊れた寸法では何もしない(0や負で絵が消えない)', () => {
    for (const bad of [0, -1, NaN]) {
      expect(sheetHeightFix(120, 120, 143, 128, bad, 128)).toBe(1);
      expect(sheetHeightFix(120, 120, bad, 128, 143, 128)).toBe(1);
      expect(sheetHeightFix(bad, 120, 143, 128, 143, 128)).toBe(1);
    }
  });
});
