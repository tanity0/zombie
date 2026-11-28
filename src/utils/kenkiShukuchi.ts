// research/BRAWLER_PHANTOM.md §14: 拳鬼の縮地(社長指示2026-11-10「拳鬼はカウンターすると縮地で距離を一気に詰めてくる。
// (ただし無限にワープはしない)」)。判定だけの純関数(store/PixiJS 非依存)。
//
// プレイヤーのスキル「縮地」(倒したら次の敵へ跳んで斬る・skills の 'shukuchi')とは別物の、拳鬼専用の作り。
// 届く距離だけプレイヤーの縮地 Lv1 と同じ(400px)。ワープ直後の無敵は付けない(プレイヤーの縮地の500msは付けない)。
import { SHUKUCHI_LEVELS, shukuchiLandingPoint } from './shukuchi';
import { BRAWLER_STANDOFF_PX } from './brawler';

/** 一度に詰める距離の上限(px)=プレイヤーの縮地 Lv1 と同じ。これより遠ければこの分だけ詰める。 */
export const KENKI_SHUKUCHI_RANGE_PX = SHUKUCHI_LEVELS[0].rangePx;
/** 縮地の後、次の縮地をしない間(ms・gameTime)。 */
export const KENKI_SHUKUCHI_COOLDOWN_MS = 4000;
/** 降りる所=プレイヤーの箱の縁と拳鬼の箱の縁の間をこの距離にする(格闘の詰めの立ち位置と同じ・拳鬼の秘奥義のワープ先と同じ測り方)。 */
export const KENKI_SHUKUCHI_STANDOFF_PX = BRAWLER_STANDOFF_PX;
/** 降りる所が立てない時に試す向き(来た向きからの回転・rad・この順)。秘奥義のワープ先の探し方と同じ考え方。 */
export const KENKI_SHUKUCHI_TRY_ANGLES: readonly number[] = [0, 0.6, -0.6, 1.2, -1.2];
/** 見せ方: 元の所の残像が消える尺・行き先で現れる尺(ms・実時間)。慣性=消える/現れるのフェード。 */
export const KENKI_SHUKUCHI_FADE_OUT_MS = 140;
export const KENKI_SHUKUCHI_FADE_IN_MS = 180;

export interface KenkiShukuchiTriggerInput {
  /** 一番新しいカウンター成立の時刻(近接の窓・構えでの受け=gpParriedAt / 弾の打ち返し=gpBulletParriedAt の新しい方)。 */
  counterAt: number | undefined;
  /** 前に見たカウンターの時刻(1回のカウンターで縮地は1回まで)。 */
  lastSeenCounterAt: number;
  t: number;
  /** 次に縮地してよい時刻(クールダウン)。 */
  readyAt: number;
  /** 拳鬼の中心からプレイヤーの箱の縁までの距離。 */
  edgeDist: number;
  /** 拳鬼の近接の届く距離。 */
  reach: number;
  /** 秘奥義の最中か(秘奥義は自分でワープする=重ねない)。 */
  secretActive: boolean;
}

/** 新しいカウンターが成立したか(見たら lastSeen を進める=1回のカウンターで1回まで)。 */
export const kenkiNewCounter = (counterAt: number | undefined, lastSeenCounterAt: number): boolean =>
  counterAt !== undefined && counterAt > lastSeenCounterAt;

/** いま縮地するか。新しいカウンター・クールダウン明け・近接の届く距離より遠い・秘奥義の最中でない。 */
export const kenkiShukuchiShouldFire = (i: KenkiShukuchiTriggerInput): boolean =>
  kenkiNewCounter(i.counterAt, i.lastSeenCounterAt) && i.t >= i.readyAt && i.edgeDist > i.reach && !i.secretActive;

/** 縮地した後のクールダウンの明け。 */
export const kenkiShukuchiReadyAt = (t: number): number => t + KENKI_SHUKUCHI_COOLDOWN_MS;

type Rect = { x: number; y: number; width: number; height: number };

/**
 * 降りる所の候補(拳鬼の中心)。来た向き(プレイヤーの中心→拳鬼)を少しずつ回し、プレイヤーの箱の縁から
 * 拳鬼の側へ「standOff+拳鬼の半身(bodyHalfW)」の所(=箱の縁どうしが standOff・体が重ならない)。
 * 届く距離(rangePx)より遠ければ、その向きへ rangePx だけ詰めた所。
 */
export const kenkiShukuchiCandidates = (
  from: { x: number; y: number }, player: Rect, bodyHalfW: number,
  rangePx = KENKI_SHUKUCHI_RANGE_PX, standOffPx = KENKI_SHUKUCHI_STANDOFF_PX,
): { x: number; y: number }[] => {
  const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
  const vx = from.x - pcx, vy = from.y - pcy;
  const out: { x: number; y: number }[] = [];
  for (const a of KENKI_SHUKUCHI_TRY_ANGLES) {
    const c = Math.cos(a), s = Math.sin(a);
    const rf = { x: pcx + vx * c - vy * s, y: pcy + vx * s + vy * c }; // 回した「来た所」
    const land = shukuchiLandingPoint(rf.x, rf.y, player, standOffPx + Math.max(0, bodyHalfW));
    const dx = land.x - from.x, dy = land.y - from.y;
    const d = Math.hypot(dx, dy);
    out.push(d > rangePx && d > 0 ? { x: from.x + (dx / d) * rangePx, y: from.y + (dy / d) * rangePx } : land);
  }
  return out;
};

/**
 * 立てる所を選ぶ。`resolve`=左上を「立てる所」(行ける帯・壁・建物)へ寄せる関数。寄せて動かなかった(=そのまま立てる)
 * 最初の候補の左上を返す。どれも立てなければ null(=縮地しない)。
 */
export const kenkiShukuchiPick = (
  candidates: readonly { x: number; y: number }[], size: { width: number; height: number },
  resolve: (x: number, y: number) => { x: number; y: number },
): { x: number; y: number } | null => {
  for (const c of candidates) {
    const want = { x: c.x - size.width / 2, y: c.y - size.height / 2 };
    const r = resolve(want.x, want.y);
    if (Math.abs(r.x - want.x) <= 1 && Math.abs(r.y - want.y) <= 1) return { x: r.x, y: r.y };
  }
  return null;
};
