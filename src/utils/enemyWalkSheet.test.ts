// ★敵の歩きモーション(社長支給2026-09-20「バット女の歩きモーション」)の機械化。
// PixiJSの描画側はテストしない(CLAUDE.md)——**どのコマを出すか**の純関数だけを固定する。
import { describe, it, expect } from 'vitest';
import {
  enemyWalkFrame, walkSheetFrames, walkSheetName, enemyWalkPhase, canWalkAnimate,
  ENEMY_WALK_SHEETS, ENEMY_WALK_STRIDE_PER_HEIGHT,
} from './enemyWalkSheet';
import { ENEMY_VARIANT_SETS } from './enemyVariant';
import { ENEMY_WALK_SHEETS as WALK_TABLE } from './enemySheets';
import { walkStrideMul } from './enemySheets';

const FR = ENEMY_WALK_SHEETS['bat-female'];

describe('★歩きシートの表', () => {
  it('シート名は<立ち絵名>-walk', () => {
    expect(walkSheetName('bat-female')).toBe('bat-female-walk');
  });

  it('★表に載る立ち絵は、必ず実在する変種の絵であること(名前を間違えると一生出ない)', () => {
    const all = new Set(Object.values(ENEMY_VARIANT_SETS).flat());
    for (const name of Object.keys(ENEMY_WALK_SHEETS)) expect(all.has(name), name).toBe(true);
  });

  // ★★名前を手書きしない(2026-09-21)。素材が届くたびに落ちるため、表から導出する。
  it('表に無い立ち絵は0コマ=従来どおり立ち絵1枚', () => {
    const without = [...new Set(Object.values(ENEMY_VARIANT_SETS).flat())]
      .filter(n => !(n in WALK_TABLE));
    expect(without.length, 'まだ歩きシートの無い絵が1つも無い').toBeGreaterThan(0);
    for (const n of without) expect(walkSheetFrames(n), n).toBe(0);
    expect(walkSheetFrames(null)).toBe(0);
  });
});

const H = 80;                 // 画面上の見た目の身長(px)
const OK = {} as const;       // 歩ける状態

describe('★歩いてはいけない状態(クリエイティブ監査#1の是正)', () => {
  it('★★死体は歩かない(vx/vyは死んでも消えないので、速度だけ見ると死体が歩く)', () => {
    expect(canWalkAnimate({ corpse: true })).toBe(false);
    expect(enemyWalkFrame('e1', FR, 999, H, { corpse: true })).toBeNull();
  });
  it('★押されている/浮かされている間は歩かない(後ろへ飛びながら前へ歩く、を作らない)', () => {
    expect(enemyWalkFrame('e1', FR, 999, H, { pushedOrLifted: true })).toBeNull();
  });
  it('気絶・拘束・休眠でも歩かない', () => {
    expect(enemyWalkFrame('e1', FR, 999, H, { stunned: true })).toBeNull();
    expect(enemyWalkFrame('e1', FR, 999, H, { dormant: true })).toBeNull();
  });
  it('どれでもなければ歩ける', () => {
    expect(canWalkAnimate(OK)).toBe(true);
    expect(enemyWalkFrame('e1', FR, 999, H, OK)).not.toBeNull();
  });
});

describe('★コマの選び方(進んだ距離で刻む)', () => {
  it('動いていればコマ番号が返る(範囲内)', () => {
    for (let d = 0; d < 3000; d += 7) {
      const i = enemyWalkFrame('e1', FR, d, H, OK);
      expect(i).not.toBeNull();
      expect(i!).toBeGreaterThanOrEqual(0);
      expect(i!).toBeLessThan(FR);
    }
  });

  it('★1歩幅で全コマをちょうど1回ずつ通る(前方ループ・飛ばさない)', () => {
    const stride = H * ENEMY_WALK_STRIDE_PER_HEIGHT;
    const seen: number[] = [];
    for (let d = 0; d < stride; d += stride / 2000) {
      const i = enemyWalkFrame('e0', FR, d, H, OK)!;
      if (seen[seen.length - 1] !== i) seen.push(i);
    }
    expect(seen.length).toBe(FR);
    expect(new Set(seen).size).toBe(FR);
    const wraps = seen.filter((v, k) => k > 0 && v < seen[k - 1]).length;
    expect(wraps).toBeLessThanOrEqual(1);
  });

  it('★★足が滑らない: 歩幅は見た目の身長に比例する(絵が大きくなれば歩幅も伸びる)', () => {
    // 身長2倍の個体は、同じコマへ来るのに2倍の距離が要る。
    const d1 = H * ENEMY_WALK_STRIDE_PER_HEIGHT;
    const d2 = H * 2 * ENEMY_WALK_STRIDE_PER_HEIGHT;
    expect(enemyWalkFrame('e0', FR, d1, H, OK)).toBe(enemyWalkFrame('e0', FR, d2, H * 2, OK));
  });

  // ★位相ずらしが0の個体で測る(途中から始まると1周の中で同じコマを2度またぐので、
  //   「遷移を数える」形の検算ができない)。`p5` は8コマ・9コマのどちらでも位相0。
  const PHASE0 = 'p5';

  it('★★ピンポン: 折り返して戻る(0→末→1の1往復)', () => {
    const FRP = 9, H2 = 80, stride = H2 * ENEMY_WALK_STRIDE_PER_HEIGHT;
    const seen: number[] = [];
    for (let d = 0; d < stride; d += stride / 4000) {
      const i = enemyWalkFrame(PHASE0, FRP, d, H2, OK, 'pingpong')!;
      if (seen[seen.length - 1] !== i) seen.push(i);
    }
    // 1歩幅で 0,1,…,8,7,…,1 の16歩(折り返しの端は重複しない)。
    expect(seen.length).toBe((FRP - 1) * 2);
    expect(new Set(seen).size).toBe(FRP);
    expect(seen[0]).toBe(0);
    expect(Math.max(...seen)).toBe(FRP - 1);
    // 単調増加のあと単調減少(山が1つ)=折り返している。
    const peak = seen.indexOf(FRP - 1);
    for (let k = 1; k <= peak; k++) expect(seen[k]).toBeGreaterThan(seen[k - 1]);
    for (let k = peak + 1; k < seen.length; k++) expect(seen[k]).toBeLessThan(seen[k - 1]);
  });

  it('★★ピンポンでも「1歩幅=1周」(折り返す個体だけ足が倍速にならない)', () => {
    const FRP = 9, H2 = 80, stride = H2 * ENEMY_WALK_STRIDE_PER_HEIGHT;
    // 歩幅ちょうど進むと先頭コマへ戻る(ループと同じ約束)。
    expect(enemyWalkFrame('e0', FRP, 0, H2, OK, 'pingpong'))
      .toBe(enemyWalkFrame('e0', FRP, stride, H2, OK, 'pingpong'));
  });

  it('★★個体ごとに位相がずれる(全員が同じ足を出して行進しない)', () => {
    const at = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(id => enemyWalkFrame(id, FR, 0, H, OK));
    expect(new Set(at).size).toBeGreaterThan(3);
  });

  it('★同じ個体の位相は毎回同じ(ちらつかない)', () => {
    const a = enemyWalkPhase('bat-7', FR);
    for (let k = 0; k < 20; k++) expect(enemyWalkPhase('bat-7', FR)).toBe(a);
  });

  it('コマ数1以下なら常に null(表の書き間違いで落ちない)', () => {
    expect(enemyWalkFrame('e1', 1, 100, H, OK)).toBeNull();
    expect(enemyWalkFrame('e1', 0, 100, H, OK)).toBeNull();
  });
});

// ★★自転車のギア(社長指示2026-09-21「突時は倍速で」)。
// 歩幅は「絵の高さ×0.46×倍率」。突進はギア(歩幅)を上げることで、速度3倍に対しコマ送りを2倍にする。
describe('★★歩幅の倍率と、突進中のギア', () => {
  const BOX = 30 * 2.05;                       // 自転車の描画枠(判定30×倍率2.05)
  const SPEED = 105, DASH = SPEED * 3;         // 巡航と突進(WEREWOLF_CHARGE_SPEED_MULT=3)
  const FR = ENEMY_WALK_SHEETS['werewolf-common'];
  const cadence = (speedPxS: number, mul: number): number =>
    speedPxS / (BOX * ENEMY_WALK_STRIDE_PER_HEIGHT * mul);   // 1秒あたりの回転数

  it('倍率を上げると、同じ距離で進むコマが減る(ゆっくり回る)', () => {
    const slow = enemyWalkFrame('a', 8, 40, 100, {}, 'loop', 2.5);
    const fast = enemyWalkFrame('a', 8, 40, 100, {}, 'loop', 1);
    expect(slow).not.toBe(fast);
    expect(cadence(SPEED, 2.5)).toBeLessThan(cadence(SPEED, 1));
  });

  it('★既定の歩幅では自転車が速すぎる(1秒3回転超=画面で読めない)', () => {
    expect(cadence(SPEED, 1)).toBeGreaterThan(3);
  });

  it('★巡航は実車の90rpm付近(1秒1.2〜1.8回転)に収まる', () => {
    const c = cadence(SPEED, walkStrideMul('werewolf-common', false));
    expect(c).toBeGreaterThan(1.2);
    expect(c).toBeLessThan(1.8);
  });

  it('★★突進は巡航のちょうど倍速(速度3倍 ÷ ギア1.5)', () => {
    const cruise = cadence(SPEED, walkStrideMul('werewolf-common', false));
    const dash = cadence(DASH, walkStrideMul('werewolf-common', true));
    expect(dash / cruise).toBeCloseTo(2, 5);
  });

  it('★倍率もギアも既定は1=登録していない敵は1ビットも変わらない', () => {
    for (const n of ['zombie-common', 'bat-female', 'skeleton-male', 'pumpkin-common']) {
      expect(walkStrideMul(n, false), n).toBe(1);
      expect(walkStrideMul(n, true), n).toBe(1);
    }
    expect(walkStrideMul(null, true)).toBe(1);
  });

  it('コマ数は表から引く(自転車は13コマ)', () => expect(FR).toBe(13));
});
