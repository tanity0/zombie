// ★格闘のレバーガード(research/BRAWLER.md §12-1c)の純関数。成立(レバーの向き・相手の向き・状態)と、ガード後のダメージ。
import { describe, it, expect } from 'vitest';
import {
  BRAWLER_LEVER_GUARD_AWAY, BRAWLER_LEVER_GUARD_COS, BRAWLER_LEVER_GUARD_DAMAGE_MULT, BRAWLER_LEVER_GUARD_PUSH_PX, BRAWLER_LEVER_GUARD_PUSH_MS,
  BRAWLER_LEVER_GUARD_MIN_DIST, BRAWLER_LEVER_GUARD_STAND_MS,
  moveLeverDir, leverGuardAttackDir, leverGuardDirOk, brawlerLeverGuardHolds, brawlerLeverGuardDamage, leverGuardStandAlpha, leverGuardDamageOnlyMove,
} from './brawlerLeverGuard';

const deg = (d: number) => ({ x: Math.cos((d * Math.PI) / 180), y: Math.sin((d * Math.PI) / 180) });
const PC = { x: 100, y: 100 };

describe('定数(設計書 §12-1c の叩き台)', () => {
  it('向き=相手から離れる向き・許し幅60°・半減・約40px/160ms', () => {
    expect(BRAWLER_LEVER_GUARD_AWAY).toBe(true);
    expect(BRAWLER_LEVER_GUARD_COS).toBe(0.5);
    expect(BRAWLER_LEVER_GUARD_DAMAGE_MULT).toBe(0.5);
    expect(BRAWLER_LEVER_GUARD_PUSH_PX).toBe(40);
    expect(BRAWLER_LEVER_GUARD_PUSH_MS).toBe(160);
  });
});

describe('レバーの向き(store の移動の入力そのまま)', () => {
  it('スティック(タッチ・パッド)が入っていればその向き(長さ1へ)', () => {
    const d = moveLeverDir({ x: 3, y: 4 }, { left: true })!;
    expect(d.x).toBeCloseTo(0.6); expect(d.y).toBeCloseTo(0.8);
  });
  it('スティックが無ければ移動キー(斜めは長さ1)', () => {
    expect(moveLeverDir(null, { right: true })).toEqual({ x: 1, y: 0 });
    const d = moveLeverDir(null, { left: true, up: true })!;
    expect(d.x).toBeCloseTo(-Math.SQRT1_2); expect(d.y).toBeCloseTo(-Math.SQRT1_2);
  });
  it('入っていない・打ち消し合い・長さ0は null', () => {
    expect(moveLeverDir(null, { up: false, down: false, left: false, right: false })).toBeNull();
    expect(moveLeverDir(null, { left: true, right: true })).toBeNull();
    expect(moveLeverDir(null, null)).toBeNull();
    expect(moveLeverDir({ x: 0, y: 0 }, { right: true })).toBeNull(); // スティックが在る時はキーを見ない(移動の式と同じ優先)
  });
});

describe('攻撃の進む向き(相手→自分)', () => {
  it('弾は飛んできた向き(速度)が最優先=撃ち主が動いた後でも向きは弾のもの', () => {
    const d = leverGuardAttackDir(PC, { travel: { x: 0, y: 5 }, hit: { x: 0, y: 100 }, enemy: { x: 300, y: 100 } })!;
    expect(d).toEqual({ x: 0, y: 1 });
  });
  it('爆発は爆心から離れる向き', () => {
    const d = leverGuardAttackDir(PC, { center: { x: 100, y: 160 }, enemy: { x: 0, y: 100 } })!;
    expect(d.x).toBeCloseTo(0); expect(d.y).toBeCloseTo(-1);
  });
  it('被弾の点 → 攻撃してきた個体 の順。自分と重なる点(真上)は飛ばして次の候補へ', () => {
    expect(leverGuardAttackDir(PC, { hit: { x: 40, y: 100 }, enemy: { x: 100, y: 0 } })).toEqual({ x: 1, y: 0 });
    // 被弾の点が自分の中心(向きが取れない)→ 個体の位置で見る
    const d = leverGuardAttackDir(PC, { hit: { x: 100 + BRAWLER_LEVER_GUARD_MIN_DIST - 1, y: 100 }, enemy: { x: 100, y: 0 } })!;
    expect(d.x).toBeCloseTo(0); expect(d.y).toBeCloseTo(1);
  });
  it('体で殴ってきた個体・光線の撃ち主(body)は、被弾の点より先(光線の被弾の点=軸の上の点から離れると真横になる)', () => {
    // 撃ち主は左・光の軸は自分の少し下を通る(被弾の点=真下 12px)。離れる向きは右(撃ち主から)であって、上(軸から)ではない。
    const d = leverGuardAttackDir(PC, { body: { x: 0, y: 112 }, hit: { x: 100, y: 112 } })!;
    expect(d.x).toBeGreaterThan(0.99);
    // 爆心(center)は body より先
    expect(leverGuardAttackDir(PC, { center: { x: 100, y: 40 }, body: { x: 0, y: 100 } })).toEqual({ x: 0, y: 1 });
  });
  it('どれも取れなければ null(=相手の位置が分からない被弾はガードにならない)', () => {
    expect(leverGuardAttackDir(PC, {})).toBeNull();
    expect(leverGuardAttackDir(PC, { hit: { x: 100, y: 100 }, travel: { x: 0, y: 0 } })).toBeNull();
  });
});

describe('向きの許し幅(左右60°まで)', () => {
  const attack = { x: 1, y: 0 }; // 相手は左に居て、攻撃は右へ進む=離れる向きは右
  it('真後ろ・±59°は成立、±61°・横・相手の方は不成立', () => {
    expect(leverGuardDirOk(deg(0), attack)).toBe(true);
    expect(leverGuardDirOk(deg(59), attack)).toBe(true);
    expect(leverGuardDirOk(deg(-59), attack)).toBe(true);
    expect(leverGuardDirOk(deg(60), attack)).toBe(true); // ちょうど60°は入る
    expect(leverGuardDirOk(deg(61), attack)).toBe(false);
    expect(leverGuardDirOk(deg(-61), attack)).toBe(false);
    expect(leverGuardDirOk(deg(90), attack)).toBe(false);
    expect(leverGuardDirOk(deg(180), attack)).toBe(false);
  });
  it('レバーなし・相手不明は不成立', () => {
    expect(leverGuardDirOk(null, attack)).toBe(false);
    expect(leverGuardDirOk(deg(0), null)).toBe(false);
  });
  it('符号の定数を入れ替えると「相手へ向かう向き」でガードになる(入れ替えの口)', () => {
    expect(leverGuardDirOk(deg(180), attack, false)).toBe(true);
    expect(leverGuardDirOk(deg(0), attack, false)).toBe(false);
    expect(leverGuardDirOk(deg(180 + 59), attack, false)).toBe(true);
    expect(leverGuardDirOk(deg(180 + 61), attack, false)).toBe(false);
  });
});

describe('成立の条件', () => {
  const ok = { has: true, amount: 20, free: true, lever: { x: 1, y: 0 }, attackDir: { x: 1, y: 0 } };
  it('格闘を持ち・動ける・レバーが相手から離れる向き → 成立', () => {
    expect(brawlerLeverGuardHolds(ok)).toBe(true);
  });
  it('格闘なし / ダメージ0 / 持続ダメージ / 動作の最中 / 構えの最中 / レバーなし / 相手不明 / 逆向き は不成立', () => {
    expect(brawlerLeverGuardHolds({ ...ok, has: false })).toBe(false);
    expect(brawlerLeverGuardHolds({ ...ok, amount: 0 })).toBe(false);
    expect(brawlerLeverGuardHolds({ ...ok, dot: true })).toBe(false);
    expect(brawlerLeverGuardHolds({ ...ok, free: false })).toBe(false);
    expect(brawlerLeverGuardHolds({ ...ok, stance: true })).toBe(false);
    expect(brawlerLeverGuardHolds({ ...ok, lever: null })).toBe(false);
    expect(brawlerLeverGuardHolds({ ...ok, attackDir: null })).toBe(false);
    expect(brawlerLeverGuardHolds({ ...ok, lever: { x: -1, y: 0 } })).toBe(false);
  });
});

describe('ガード後のダメージ(半減・切り上げ・最低1)', () => {
  it('偶数は半分・奇数と端数は切り上げ・1は1のまま', () => {
    expect(brawlerLeverGuardDamage(30)).toBe(15);
    expect(brawlerLeverGuardDamage(31)).toBe(16);
    expect(brawlerLeverGuardDamage(7.2)).toBe(4);
    expect(brawlerLeverGuardDamage(1)).toBe(1);
    expect(brawlerLeverGuardDamage(0.3)).toBe(1);
  });
  it('0以下はそのまま(ガードで増やさない)', () => {
    expect(brawlerLeverGuardDamage(0)).toBe(0);
    expect(brawlerLeverGuardDamage(-5)).toBe(-5);
  });
  it('ガードして元より増えることは無い(1以上の整数)', () => {
    for (let a = 1; a <= 200; a++) expect(brawlerLeverGuardDamage(a)).toBeLessThanOrEqual(a);
  });
});

describe('腕で受ける影の濃さ(短く・出だしは速く・終わりはゆっくり引く)', () => {
  it('受けた直後から在り、尺の終わりで0・尺の外は0', () => {
    expect(leverGuardStandAlpha(-1)).toBe(0);
    expect(leverGuardStandAlpha(0)).toBe(0);
    expect(leverGuardStandAlpha(40)).toBeGreaterThan(0.8);
    expect(leverGuardStandAlpha(BRAWLER_LEVER_GUARD_STAND_MS - 1)).toBeLessThan(0.05);
    expect(leverGuardStandAlpha(BRAWLER_LEVER_GUARD_STAND_MS)).toBe(0);
    expect(leverGuardStandAlpha(Number.NaN)).toBe(0);
  });
  it('頂点の後は増えない(単調に引く)', () => {
    let prev = leverGuardStandAlpha(40);
    for (let el = 50; el < BRAWLER_LEVER_GUARD_STAND_MS; el += 10) { const a = leverGuardStandAlpha(el); expect(a).toBeLessThanOrEqual(prev + 1e-9); prev = a; }
  });
});

describe('演出つきの技(半減だけ)', () => {
  it('拳鬼の秘奥義は半減だけ・普通の技は受け切れる', () => {
    expect(leverGuardDamageOnlyMove('brawler-secret')).toBe(true);
    expect(leverGuardDamageOnlyMove('brawler-s3')).toBe(false);
    expect(leverGuardDamageOnlyMove(undefined)).toBe(false);
  });
});
