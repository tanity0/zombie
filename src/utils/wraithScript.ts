// 亡霊(変異体)の純関数(research/WRAITH_MUTANT.md)。store も PixiJS も読まない=ヘッドレスでテストする。
// 社長 2026-10-29「こいつもフワフワ浮いており、プレイヤーの周りを周回する。攻撃されるとたまに反対側にワープもする」。

import type { Enemy } from '../types/game';
import { isCorpse } from './enemyUtils';

// ---- 絵(シート) ----
/** 浮遊のシート(mutant-wraith-float): 16コマ・1コマ96×152。ループ。 */
export const WRAITH_FLOAT_FRAMES = 16;
export const WRAITH_FLOAT_FRAME_W = 96;
export const WRAITH_FLOAT_FRAME_H = 152;
export const WRAITH_FLOAT_FRAME_MS = 90;
/**
 * 浮遊のコマごとに体の横位置を止める寄せ(絵のドット・右へ+・§1「体を起点にする」)。
 * 胸・肩の重心と腰の帯の重心のそれぞれで揃えた寄せの平均(0コマ目基準・実測)。
 */
export const WRAITH_FLOAT_ALIGN_X: readonly number[] = [0.0, 0.6, 0.5, 0.5, 0.3, 1.6, 2.6, 4.1, 5.8, 8.2, 9.2, 10.8, 9.7, 11.3, 9.1, 7.7];
/** 叫びのシート(mutant-wraith-scream): 16コマ・1コマ76×135。口が開いていく。 */
export const WRAITH_SCREAM_FRAMES = 16;
export const WRAITH_SCREAM_FRAME_W = 76;
export const WRAITH_SCREAM_FRAME_H = 135;
/**
 * 叫びのコマごとの本体の高さ(絵のドット・実測)。シートが足元を支点に少しずつズームしている(社長「多分スタート側が小さくなってる」)ので、
 * この高さを「立ち絵と同じ背丈へ合わせる」(sheetHeightFix の bodyH)へ渡し、どのコマも浮遊と同じ背丈で描く。
 */
export const WRAITH_SCREAM_BODY_PX: readonly number[] = [111, 112, 113, 114, 116, 116, 118, 120, 121, 123, 125, 126, 131, 129, 129, 130];
/** 浮遊の立ち絵の本体の高さ(枠152のうち)。 */
export const WRAITH_FLOAT_BODY_PX = 150;
/** 叫びのコマの胸の横位置(実測)。0コマ目に揃える寄せ。 */
export const WRAITH_SCREAM_ALIGN_X: readonly number[] = [0, 0.7, 0.6, 1.0, 0.9, 0.8, 1.3, 1.0, 2.2, 2.2, 1.7, 1.7, 2.0, 3.0, 3.3, 3.0];

/** 叫びのコマの bodyH(sheetHeightFix へ渡す値=立ち絵の枠152に対する本体の割合で揃える)。 */
export const wraithScreamBodyH = (frame: number): number => {
  const f = Math.max(0, Math.min(WRAITH_SCREAM_FRAMES - 1, Math.round(frame)));
  return WRAITH_SCREAM_BODY_PX[f] * (WRAITH_FLOAT_FRAME_H / WRAITH_FLOAT_BODY_PX);
};

/** 浮遊のコマ(ゲーム時間と個体ごとの位相から)。 */
export const wraithFloatFrame = (gt: number, phase: number): number =>
  Math.floor((gt + phase) / WRAITH_FLOAT_FRAME_MS) % WRAITH_FLOAT_FRAMES;

// ---- 浮き(絵だけ・判定は地面のまま) ----
export const WRAITH_LIFT_PX = 34;
/** 頭の高さ(判定の中心から上へ・世界px・叫びの声の出どころ)。持ち上げ+背丈の上から2割ほど。 */
export const WRAITH_HEAD_Y_PX = 150;
export const WRAITH_DRIFT_PX = 9; // 動きは大きく(クリエイティブ監査#13: ±3はシートの揺れに埋もれて見えない)
/** 持ち上げ(px)。2つの周期を重ねて揃えない漂い。 */
export const wraithLiftPx = (t: number, phase: number): number =>
  WRAITH_LIFT_PX + (Math.sin((t + phase) / 380) * 0.65 + Math.sin((t + phase * 1.7) / 610 + 1.1) * 0.35) * WRAITH_DRIFT_PX;

// ---- 動き ----
export const WRAITH_PATROL_SPEED = 80;
/** 周回の楕円(プレイヤーの足元が中心・§8 A2=スマホの画面に収まる固定値)と、1周の時間。 */
export const WRAITH_ORBIT_RX = 170;
export const WRAITH_ORBIT_RY = 95;
export const WRAITH_ORBIT_PERIOD_MS = 7000;
/** 逆向きに回り直す間隔。 */
export const WRAITH_REVERSE_MIN_MS = 8000;
export const WRAITH_REVERSE_MAX_MS = 14000;
/** 周回の最高速(楕円の周の長さ約865px ÷ 1周の時間 ≒ 124px/s に少し余裕)。プレイヤーが動いている時はその速さを足す(付いてくる・★未決 #4)。 */
export const WRAITH_ORBIT_SPEED = 140;

/** 楕円の上の点(角度 a)。 */
export const wraithOrbitPoint = (cx: number, cy: number, a: number): { x: number; y: number } =>
  ({ x: cx + Math.cos(a) * WRAITH_ORBIT_RX, y: cy + Math.sin(a) * WRAITH_ORBIT_RY });

/** 今の位置の楕円上の角度(楕円を円へ直してから測る)。 */
export const wraithOrbitAngle = (cx: number, cy: number, x: number, y: number): number =>
  Math.atan2((y - cy) / WRAITH_ORBIT_RY, (x - cx) / WRAITH_ORBIT_RX);

/**
 * 周回の行き先(楕円の上を回る向きへ少し先の点)。dir=+1/-1(画面で見て時計回り=角度が増える向き=+1)。
 * 楕円から外れていれば、先の点へ向かうことで自然に楕円へ寄る。
 */
export const wraithOrbitTarget = (cx: number, cy: number, x: number, y: number, dir: 1 | -1, dtMs: number): { x: number; y: number } => {
  const a = wraithOrbitAngle(cx, cy, x, y);
  const lead = Math.max(0.35, (Math.PI * 2 * dtMs) / WRAITH_ORBIT_PERIOD_MS);
  return wraithOrbitPoint(cx, cy, a + dir * lead);
};

// ---- 反対側へのワープ(§3・§8 A3/A4) ----
export const WRAITH_WARP_CHANCE = 0.3;
export const WRAITH_WARP_FADE_MS = 250;
export const WRAITH_WARP_COOLDOWN_MS = 4000;
/** 被弾ごとの抽選は600msに1回だけ(散弾・継続ダメージで何度も引かない)。 */
export const WRAITH_WARP_ROLL_GAP_MS = 600;

/** ワープの濃さ(0..1)と当たらない間か。outAt=消え始め(gameTime)。消える250ms→現れる250ms。 */
export const wraithWarpState = (gt: number, outAt: number | undefined): { alpha: number; phased: boolean; moveNow: boolean; done: boolean } => {
  if (outAt === undefined || gt < outAt) return { alpha: 1, phased: false, moveNow: false, done: true };
  const t = gt - outAt;
  if (t >= WRAITH_WARP_FADE_MS * 2) return { alpha: 1, phased: false, moveNow: false, done: true };
  const ease = (u: number) => u * u * (3 - 2 * u);
  if (t < WRAITH_WARP_FADE_MS) return { alpha: 1 - ease(t / WRAITH_WARP_FADE_MS), phased: true, moveNow: false, done: false };
  return { alpha: ease((t - WRAITH_WARP_FADE_MS) / WRAITH_WARP_FADE_MS), phased: true, moveNow: true, done: false };
};

/** 反対側の点(楕円の上・今の角度+180°)。 */
export const wraithOppositePoint = (cx: number, cy: number, x: number, y: number): { x: number; y: number } =>
  wraithOrbitPoint(cx, cy, wraithOrbitAngle(cx, cy, x, y) + Math.PI);

// ---- 叫び(§4・§8 A2) ----
export const WRAITH_SCREAM_FRAME_MS = 90;
/** 溜め=16コマ(1440ms)。最後のコマが終わる瞬間に当たる。 */
export const WRAITH_SCREAM_WINDUP_MS = WRAITH_SCREAM_FRAMES * WRAITH_SCREAM_FRAME_MS;
/** 当たった後、最後のコマのまま叫び続ける(判定なし)。 */
export const WRAITH_SCREAM_HOLD_MS = 400;
export const WRAITH_SCREAM_RADIUS = 200;
export const WRAITH_SCREAM_DAMAGE = 20;
export const WRAITH_SCREAM_GAP_MIN_MS = 5000;
export const WRAITH_SCREAM_GAP_MAX_MS = 8000;

/**
 * 叫びのコマ(溜めの始まりからの経過 ms)。溜めの間は0→15、その後は15のまま。
 * 前半は口がゆっくり、最後の数コマで一気に開く(等速で開かない・クリエイティブ監査#7)。当たる時刻(溜め明け)は変わらない。
 */
export const wraithScreamFrame = (sinceMs: number): number => {
  const u = Math.max(0, Math.min(1, sinceMs / WRAITH_SCREAM_WINDUP_MS));
  return Math.max(0, Math.min(WRAITH_SCREAM_FRAMES - 1, Math.floor(WRAITH_SCREAM_FRAMES * Math.pow(u, 1.7))));
};
/** 溜めの間に体が少し浮き上がる(描画の持ち上げ・px)。当たった後はゆっくり戻る。 */
export const wraithScreamRisePx = (sinceMs: number): number => {
  if (sinceMs < 0) return 0;
  if (sinceMs < WRAITH_SCREAM_WINDUP_MS) { const u = sinceMs / WRAITH_SCREAM_WINDUP_MS; return 12 * u * u; }
  const v = Math.min(1, (sinceMs - WRAITH_SCREAM_WINDUP_MS) / WRAITH_SCREAM_HOLD_MS); // 叫び終わりまでに戻り切る(浮遊へ戻る瞬間に跳ねない)
  return 12 * (1 - v * v * (3 - 2 * v));
};

// ---- 近づくと地面から生えてくる物(§9) ----
/** 素材(props/wraith-growths・8コマ×49×66): 0〜3=墓石(壁)・4〜7=花(判定なし)。 */
export const WRAITH_GROWTH_FRAMES = 8;
export const WRAITH_GROWTH_FRAME_H = 66;
export const isWraithGrave = (variant: number): boolean => variant >= 0 && variant <= 3;
export const WRAITH_GROWTH_NEAR_PX = 1200;
export const WRAITH_GROWTH_GAP_FAR_MS = 1500;
export const WRAITH_GROWTH_GAP_NEAR_MS = 250;
export const WRAITH_GROWTH_CAP = 30;
export const WRAITH_GROWTH_AVOID_PLAYER_PX = 140;
export const WRAITH_GROWTH_GAP_PX = 56;
export const WRAITH_GROWTH_GROW_MS = 600;
export const WRAITH_GROWTH_SINK_MS = 500;
/** 墓石が壁になるのは伸び切ってから(伸びている途中は押し出さない)。 */
export const WRAITH_GROWTH_SOLID_AT = 0.85;
/** 描画の高さ(絵66px に掛ける倍率の幅)。 */
export const WRAITH_GROWTH_SCALE_MIN = 1.25;
export const WRAITH_GROWTH_SCALE_MAX = 1.6;

export interface WraithGrowth {
  id: string;
  /** 足元(Y-sort のキー・壁の四角の下端)。 */
  x: number; y: number;
  variant: number; scale: number; flip: boolean;
  bornAt: number;
  sinkAt?: number;
}
export interface WraithGrowthState { nextAt: number; seq: number; lastSinkAt: number }

/** 伸びの進み(0..1・出始めが速く、少し行き過ぎて戻る)。 */
export const wraithGrowthRise = (gt: number, g: Pick<WraithGrowth, 'bornAt' | 'sinkAt'>): number => {
  const u = Math.max(0, Math.min(1, (gt - g.bornAt) / WRAITH_GROWTH_GROW_MS));
  const c = 1.70158 * 0.6; // 行き過ぎは控えめ
  const up = 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2);
  if (g.sinkAt === undefined) return u >= 1 ? 1 : up;
  const s = Math.max(0, Math.min(1, (gt - g.sinkAt) / WRAITH_GROWTH_SINK_MS));
  return Math.min(1, up) * (1 - s * s);
};

/** 墓石の壁の四角(足元の四角・絵の倍率に合わせる)。 */
export const wraithGraveFoot = (g: Pick<WraithGrowth, 'x' | 'y' | 'scale'>): { x: number; y: number; width: number; height: number } => {
  const w = 26 * g.scale, h = 12 * g.scale;
  return { x: g.x - w / 2, y: g.y - h, width: w, height: h };
};

/** 間隔(亡霊との距離が近いほど詰まる)。 */
export const wraithGrowthGapMs = (dist: number): number => {
  const k = Math.max(0, Math.min(1, (dist - 200) / (WRAITH_GROWTH_NEAR_PX - 200)));
  return WRAITH_GROWTH_GAP_NEAR_MS + (WRAITH_GROWTH_GAP_FAR_MS - WRAITH_GROWTH_GAP_NEAR_MS) * k;
};

/**
 * 生えた物を1回分進める。wraith=場にいる亡霊の足元(居なければ null)、view=見えている範囲。
 * canPlace=その点に生やしてよいか(敵・既存の障害物の上でない)。変わらなければ同じ配列を返す。
 */
export const wraithGrowthStep = (
  pieces: readonly WraithGrowth[], wraith: { x: number; y: number } | null, player: { x: number; y: number },
  view: { left: number; right: number; top: number; bottom: number }, canPlace: (x: number, y: number) => boolean,
  gt: number, rng: () => number, st: WraithGrowthState,
): WraithGrowth[] => {
  let out: WraithGrowth[] | null = null;
  const cur = () => out ?? pieces;
  // 沈み切った物・画面から大きく外れた物を消す。
  const far = (p: WraithGrowth) => p.x < view.left - 600 || p.x > view.right + 600 || p.y < view.top - 600 || p.y > view.bottom + 600;
  if (pieces.some(p => (p.sinkAt !== undefined && gt >= p.sinkAt + WRAITH_GROWTH_SINK_MS) || far(p))) {
    out = pieces.filter(p => !((p.sinkAt !== undefined && gt >= p.sinkAt + WRAITH_GROWTH_SINK_MS) || far(p)));
  }
  const dist = wraith ? Math.hypot(player.x - wraith.x, player.y - wraith.y) : Infinity;
  if (wraith && dist <= WRAITH_GROWTH_NEAR_PX && gt >= st.nextAt) {
    st.nextAt = gt + wraithGrowthGapMs(dist) * (0.7 + 0.6 * rng());
    for (let tries = 0; tries < 12; tries++) {
      const x = view.left + 30 + rng() * Math.max(1, view.right - view.left - 60);
      const y = view.top + 60 + rng() * Math.max(1, view.bottom - view.top - 90);
      if (Math.hypot(x - player.x, y - player.y) < WRAITH_GROWTH_AVOID_PLAYER_PX) continue;
      // 亡霊に近い所ほど生えやすい。
      const w = Math.max(0.08, 1 - Math.hypot(x - wraith.x, y - wraith.y) / 1400);
      if (rng() > w) continue;
      if (cur().some(p => p.sinkAt === undefined && Math.hypot(p.x - x, p.y - y) < WRAITH_GROWTH_GAP_PX)) continue;
      if (!canPlace(x, y)) continue;
      out = [...cur(), {
        id: `wraith-growth-${++st.seq}`, x, y,
        variant: Math.floor(rng() * WRAITH_GROWTH_FRAMES) % WRAITH_GROWTH_FRAMES,
        scale: WRAITH_GROWTH_SCALE_MIN + rng() * (WRAITH_GROWTH_SCALE_MAX - WRAITH_GROWTH_SCALE_MIN), flip: rng() < 0.5, bornAt: gt,
      }];
      break;
    }
  }
  if (!wraith && gt - st.lastSinkAt >= 300) {
    // 亡霊が居なくなったら、残った物を古い順に1つずつ沈める。
    const first = cur().find(p => p.sinkAt === undefined);
    if (first) { st.lastSinkAt = gt; out = cur().map(p => (p === first ? { ...p, sinkAt: gt } : p)); }
  }
  // 上限: 沈んでいない物が上限を超えたら、古い順に沈める(パッと消さない)。
  const live = cur().filter(p => p.sinkAt === undefined);
  if (live.length > WRAITH_GROWTH_CAP) {
    const drop = new Set(live.slice(0, live.length - WRAITH_GROWTH_CAP).map(p => p.id));
    out = cur().map(p => (drop.has(p.id) ? { ...p, sinkAt: gt } : p));
  }
  return out ?? (pieces as WraithGrowth[]);
};

/** 伸び切った墓石の壁の四角(沈み始めた物は外す)。 */
export const wraithGraveSolids = (pieces: readonly WraithGrowth[], gt: number): { x: number; y: number; width: number; height: number }[] =>
  pieces.filter(p => isWraithGrave(p.variant) && p.sinkAt === undefined && (gt - p.bornAt) / WRAITH_GROWTH_GROW_MS >= WRAITH_GROWTH_SOLID_AT).map(wraithGraveFoot);

// ---- 出るかどうか(社長指示2026-10-29「宇宙飛行群と亡霊は必ず出現する訳ではない。それぞれどっちかのみ。20%の確率」) ----
/** 1ランで本編に変異体のボス級(宇宙飛行群か亡霊)が出る確率。出る時はどちらか1体だけ(半々)。 */
export const RUN_MUTANT_BOSS_CHANCE = 0.2;
export type RunMutantBoss = 'astro' | 'wraith' | 'none';
export const pickRunMutantBoss = (rng: () => number): RunMutantBoss => {
  if (rng() >= RUN_MUTANT_BOSS_CHANCE) return 'none';
  return rng() < 0.5 ? 'astro' : 'wraith';
};

/** 変異体が出るランの「最初の通信」に混ざる一言(社長指示2026-10-30)。出ないランは null。 */
export const MUTANT_OMEN_LINES: Record<Exclude<RunMutantBoss, 'none'>, string> = {
  wraith: '寒気がする・・・',
  astro: '通信が少しおかしい？',
};
export const mutantOmenLine = (boss: RunMutantBoss): string | null => (boss === 'none' ? null : MUTANT_OMEN_LINES[boss]);
/** 言う人: 出撃の通信を言った人とは別の隊員(居なければ同じ人)。隊員が居ない出撃は null=言わない。 */
export const pickOmenSpeaker = (names: readonly string[], sortieSpeaker: string | null, rng: () => number): string | null => {
  const uniq = [...new Set(names)];
  if (!uniq.length) return null;
  const others = uniq.filter(n => n !== sortieSpeaker);
  const pool = others.length ? others : uniq;
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
};

// ---- 指差しの技2つ=指差し・呪い(§11) ----
/** 指差しのシート(mutant-wraith-point): 8コマ・1コマ75×152。0〜2=腕を上げる・3〜7=指している。 */
export const WRAITH_POINT_FRAMES = 8;
export const WRAITH_POINT_FRAME_W = 75;
/** 体を起点にする寄せ(絵のドット・右へ+・浮遊の0コマ目と同じ所へ・§11 実測)。 */
export const WRAITH_POINT_ALIGN_X: readonly number[] = [0.5, -0.6, -2.7, -6.6, -6.3, -6.6, -6.4, -6.8];
export const WRAITH_POINT_RAISE_FRAME_MS = 90;
/** 腕が伸び切るまで(0→3)。この瞬間に雑魚が飛ぶ/1つ目の墓石が抜ける。 */
export const WRAITH_POINT_RAISE_MS = 4 * WRAITH_POINT_RAISE_FRAME_MS;
export const WRAITH_POINT_HOLD_FRAME_MS = 120;
/** 下ろす(3→0)。 */
export const WRAITH_POINT_LOWER_MS = 3 * WRAITH_POINT_RAISE_FRAME_MS;
/** 指している間の往復(コマ・ms)。端のコマで長く止まり、間隔もそろえない(機械的な往復にしない・クリエイティブ監査#16)。 */
const WRAITH_POINT_HOLD_SEQ: readonly (readonly [number, number])[] = [[3, 210], [4, 110], [5, 95], [6, 120], [7, 230], [6, 105], [5, 125], [4, 90]];
const WRAITH_POINT_HOLD_CYCLE = WRAITH_POINT_HOLD_SEQ.reduce((a, [, d]) => a + d, 0);
/**
 * 指差しのコマ。since=腕を上げ始めてからの ms、lowerSince=下ろし始めてからの ms(まだなら undefined)、
 * lowerFrom=下ろし始めた時のコマ(上げている途中で止めた時はそこから戻す=伸び切りのコマへ跳ばない・検収 A-2)。
 * 上げる 0→3(出だしはゆっくり・最後で一気に伸ばす。合計は同じ) / 指している間は 3〜7 を往復 / 下ろす 3→0。
 */
export const wraithPointFrame = (since: number, lowerSince?: number, lowerFrom = 3): number => {
  if (lowerSince !== undefined) {
    const from = Math.max(0, Math.min(3, lowerFrom));
    return Math.max(0, from - Math.floor(Math.max(0, lowerSince) / WRAITH_POINT_RAISE_FRAME_MS));
  }
  if (since < WRAITH_POINT_RAISE_MS) return Math.max(0, Math.min(3, Math.floor(4 * Math.pow(Math.max(0, since) / WRAITH_POINT_RAISE_MS, 1.6))));
  let k = (since - WRAITH_POINT_RAISE_MS) % WRAITH_POINT_HOLD_CYCLE;
  for (const [f, d] of WRAITH_POINT_HOLD_SEQ) { if (k < d) return f; k -= d; }
  return 3;
};

export type WraithSkill = 'scream' | 'fling' | 'curse';
/** 今使える技から1つ。前と同じ技は、他に使える技がある時は選ばない(§11)。 */
export const pickWraithSkill = (can: { fling: boolean; curse: boolean }, last: WraithSkill | null, rng: () => number): WraithSkill => {
  const all: WraithSkill[] = ['scream'];
  if (can.fling) all.push('fling');
  if (can.curse) all.push('curse');
  const pool = all.length > 1 && last !== null ? all.filter(k => k !== last) : all;
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
};

/** 指差し(雑魚を吹き飛ばす)。 */
export const WRAITH_FLING_RANGE_PX = 560;
export const WRAITH_FLING_MIN_PLAYER_PX = 200;
export const WRAITH_FLING_MAX_PLAYER_PX = 700;
export const WRAITH_FLING_MIN = 2;
export const WRAITH_FLING_MAX = 6;
/** 着地の輪(プレイヤーの中心から)。 */
export const WRAITH_FLING_RING_PX = 110;
/** 腕を伸ばしてから下ろし始めるまで。 */
export const WRAITH_FLING_HOLD_MS = 600;
/**
 * 着地点。プレイヤーの周りの輪の上で等間隔に並べ、それぞれの来た向きに一番近い並びへ回す(道が交差しにくい)。
 * mobs=雑魚の中心(並びは返り値と同じ順)。
 */
export const wraithFlingLandings = (mobs: readonly { x: number; y: number }[], px: number, py: number, ringPx = WRAITH_FLING_RING_PX): { x: number; y: number }[] => {
  const n = mobs.length;
  if (n === 0) return [];
  const ang = mobs.map(m => Math.atan2(m.y - py, m.x - px));
  const order = ang.map((_, i) => i).sort((i, j) => ang[i] - ang[j]);
  const step = (Math.PI * 2) / n;
  // 回す量=「来た向き − 並びの角」の円の平均(全体を一番ずらさない回し方)。
  let sx = 0, sy = 0;
  order.forEach((i, k) => { const d = ang[i] - k * step; sx += Math.cos(d); sy += Math.sin(d); });
  const a0 = n === 1 ? ang[0] : Math.atan2(sy, sx);
  const out: { x: number; y: number }[] = new Array(n);
  order.forEach((i, k) => { const a = a0 + k * step; out[i] = { x: px + Math.cos(a) * ringPx, y: py + Math.sin(a) * ringPx }; });
  return out;
};

/** 呪い(墓石を飛ばす)。 */
export const WRAITH_CURSE_RANGE_PX = 520;
export const WRAITH_CURSE_MIN_PLAYER_PX = 160;
export const WRAITH_CURSE_MAX = 5;
/** 1つずつの間隔(社長「1秒に一個」)。 */
export const WRAITH_CURSE_GAP_MS = 1000;
/** 浮き上がってから飛び出すまで(=その墓石の溜め・赤い帯はこの間ずっと流れる)。 */
export const WRAITH_CURSE_PRE_MS = 600;
/** 浮いた墓石の判定の中心=足元からこれだけ上(描画の持ち上げと同じ値)。 */
/** 浮く墓石の絵は根元の瓦礫を切った上側だけ(瓦礫は地面に残る・クリエイティブ監査#2)。 */
export const WRAITH_GRAVE_STONE_KEEP = 0.8;
export const WRAITH_CURSE_HOVER_PX = 84; // 地面に立っていた時の絵の中心から約30px上へ浮く(§11-1 C2)
/** 最後の墓石が飛び出してから下ろし始めるまで。 */
export const WRAITH_CURSE_TAIL_MS = 300;
/** 次に抜く墓石の印を、抜けるこれだけ前に出す。 */
export const WRAITH_CURSE_MARK_MS = 320;
/** k 個目(0始まり)の墓石が抜ける時刻(腕を上げ始めてからの ms)。 */
export const wraithCurseLiftAt = (k: number): number => WRAITH_POINT_RAISE_MS + k * WRAITH_CURSE_GAP_MS;
/** 飛ばせる墓石(生え切っている・沈み始めていない・亡霊から近い・プレイヤーから離れている・画面の中)。亡霊に近い順に最大5つ。 */
export const pickWraithCurseGraves = (
  pieces: readonly WraithGrowth[], wraith: { x: number; y: number }, player: { x: number; y: number }, gt: number,
  inView: (x: number, y: number) => boolean,
): WraithGrowth[] =>
  pieces
    .filter(g => isWraithGrave(g.variant) && g.sinkAt === undefined && gt - g.bornAt >= WRAITH_GROWTH_GROW_MS
      && Math.hypot(g.x - wraith.x, g.y - wraith.y) <= WRAITH_CURSE_RANGE_PX
      && Math.hypot(g.x - player.x, g.y - player.y) >= WRAITH_CURSE_MIN_PLAYER_PX
      && inView(g.x, g.y))
    .sort((a, b) => Math.hypot(a.x - wraith.x, a.y - wraith.y) - Math.hypot(b.x - wraith.x, b.y - wraith.y))
    .slice(0, WRAITH_CURSE_MAX);

// ---- 亡霊と戦っている間(§12) ----
/** 戦っている間とみなす亡霊とプレイヤーの距離の上限(画面の外で気づかれただけでは始めない)。 */
export const WRAITH_BATTLE_RANGE_PX = 900;
/**
 * 亡霊と戦っている間(音を下げる・地面と遠景を暗くするの両方がこの1本を見る)。
 * 生きていて(死体でない)、こちらに気づいていて、近くに居て、プレイヤーが生きている間。
 */
export const wraithBattleActive = (
  enemies: readonly Pick<Enemy, 'type' | 'health' | 'corpseUntil' | 'libAlerted' | 'x' | 'y' | 'width' | 'height'>[],
  player: { x: number; y: number; width: number; height: number; health: number },
): boolean => {
  if (!(player.health > 0)) return false;
  const px = player.x + player.width / 2, py = player.y + player.height / 2;
  return enemies.some(e => e.type === 'mutant-wraith' && !isCorpse(e) && e.health > 0 && e.libAlerted === true
    && Math.hypot(e.x + e.width / 2 - px, e.y + e.height / 2 - py) <= WRAITH_BATTLE_RANGE_PX);
};

// ---- 亡霊に近づいた時の音(§12-3・社長指示2026-10-30「近づくと徐々にBGMがフェードアウトしていき(距離に応じて)、代わりにSEがフェードインしてくる。花とかと連動した距離間」) ----
/** 音が混ざり始める距離=花と墓石が生え始める距離(WRAITH_GROWTH_NEAR_PX)。 */
export const WRAITH_AUDIO_FAR_PX = WRAITH_GROWTH_NEAR_PX;
/** 混ざり切る距離=生える間隔が一番詰まる距離(wraithGrowthGapMs の 200)。 */
export const WRAITH_AUDIO_NEAR_PX = 200;
/**
 * 亡霊との近さ(0=遠い・居ない/1=すぐそば)。足元どうしの距離で、花と同じ距離感(1200px で入り始め 200px で混ざり切る)。
 * 出始めと終わりがなめらか(smoothstep)。倒れた亡霊・プレイヤーが倒れた時は 0。
 */
export const wraithAudioMix = (
  enemies: readonly Pick<Enemy, 'type' | 'health' | 'corpseUntil' | 'x' | 'y' | 'width' | 'height'>[],
  player: { x: number; y: number; width: number; height: number; health: number },
): number => {
  if (!(player.health > 0)) return 0;
  const px = player.x + player.width / 2, py = player.y + player.height;
  let best = 0;
  for (const e of enemies) {
    if (e.type !== 'mutant-wraith' || isCorpse(e) || !(e.health > 0)) continue;
    const d = Math.hypot(e.x + e.width / 2 - px, e.y + e.height - py);
    const u = Math.max(0, Math.min(1, (WRAITH_AUDIO_FAR_PX - d) / (WRAITH_AUDIO_FAR_PX - WRAITH_AUDIO_NEAR_PX)));
    best = Math.max(best, u * u * (3 - 2 * u));
  }
  return best;
};

// ---- ピンチ用の台本(社長指示2026-10-30「亡霊 ピンチ用台本 指さし→ワープでプレイヤーの後ろに回り込み→呪い」) ----
/** ピンチ=体力が半分以下(宇宙飛行群と同じ)。 */
export const WRAITH_PINCH_HP_FRAC = 0.5;
export const isWraithPinch = (health: number, maxHealth: number): boolean => maxHealth > 0 && health <= maxHealth * WRAITH_PINCH_HP_FRAC;
/** 台本の手の間(ms): 前の手が終わってから次の手まで(続けざま=一気に畳みかける)。 */
export const WRAITH_PINCH_STEP_GAP_MS = 350;
export type WraithPinchAction = 'fling' | 'warp' | 'curse' | 'scream';
/**
 * 台本の次の手。step=0 指差し / 1 後ろへワープ / 2 呪い(次は0へ戻る)。
 * 指差しは飛ばせる雑魚が居なければ飛ばしてワープへ。呪いは墓石が無ければ叫びで締める。
 */
export const wraithPinchNext = (step: number, can: { fling: boolean; curse: boolean }): { action: WraithPinchAction; next: number } => {
  const st = ((step % 3) + 3) % 3;
  if (st === 0) return can.fling ? { action: 'fling', next: 1 } : { action: 'warp', next: 2 };
  if (st === 1) return { action: 'warp', next: 2 };
  return { action: can.curse ? 'curse' : 'scream', next: 0 };
};
// ---- 召喚=指差しの初段(§15・社長指示2026-10-30「画面に敵が３体以下の場合に発動 batを３体呼び出す」) ----
/** 画面の敵がこの数以下なら、指差しの前にコウモリを呼ぶ。 */
export const WRAITH_SUMMON_SCREEN_MAX = 3;
export const WRAITH_SUMMON_COUNT = 3;
/** 置き場所=プレイヤーからこの距離の輪の上(入らなければ順に近づける)。指差しで飛ばせる距離(200px以上)を保つ。 */
export const WRAITH_SUMMON_DISTS_PX = [320, 280, 240, 215] as const;
/** 3点の間の角度(rad・約26°)。 */
export const WRAITH_SUMMON_SPREAD_RAD = 0.45;
/** 可視域の端からの余白(px)。 */
export const WRAITH_SUMMON_INSET_PX = 50;
/** 地平線から下へこれだけ空けた所より下にだけ置く(地平線の近くは敵が透けて消える)。呼ぶ側が view.top に足して渡す。 */
export const WRAITH_SUMMON_HORIZON_PAD_PX = 60;
/** 画面の下端はケラレと霧で暗い=ここまで空ける(呼ぶ側が view.bottom から引いて渡す・クリエイティブ監査#2)。 */
export const WRAITH_SUMMON_BOTTOM_PAD_PX = 90;
/** 3体が這い上がり始める時刻のずれ(ms・揃えない=クリエイティブ監査#4)。 */
export const WRAITH_SUMMON_STAGGER_MS = [0, 80, 170] as const;
/** 呼んでからこの間は、プレイヤーに近くても指差しで飛ばせる(続く指差しで必ず使う)。 */
export const WRAITH_SUMMON_FRESH_MS = 5000;
/**
 * コウモリ3体の置き場所(中心)。亡霊の居る向きに一番近い所から順に、3点とも可視域(端から余白)に入る向きを探す。
 * 入らなければ距離を縮めて探し直す。どこにも入らなければ亡霊の向きのまま一番近い距離(押し戻しは呼ぶ側)。
 */
export const wraithSummonSpots = (
  px: number, py: number, wx: number, wy: number,
  view: { left: number; right: number; top: number; bottom: number },
): { x: number; y: number }[] => {
  const a0 = Math.atan2(wy - py, wx - px);
  const n = WRAITH_SUMMON_COUNT;
  const ring = (d: number, c: number) => Array.from({ length: n }, (_, i) => {
    const a = c + (i - (n - 1) / 2) * WRAITH_SUMMON_SPREAD_RAD;
    return { x: px + Math.cos(a) * d, y: py + Math.sin(a) * d };
  });
  const inside = (q: { x: number; y: number }) => q.x >= view.left + WRAITH_SUMMON_INSET_PX && q.x <= view.right - WRAITH_SUMMON_INSET_PX
    && q.y >= view.top + WRAITH_SUMMON_INSET_PX && q.y <= view.bottom - WRAITH_SUMMON_INSET_PX;
  for (const d of WRAITH_SUMMON_DISTS_PX) {
    for (let k = 0; k <= 36; k++) {
      const da = (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 18);
      const pts = ring(d, a0 + da);
      if (pts.every(inside)) return pts;
    }
  }
  return ring(WRAITH_SUMMON_DISTS_PX[WRAITH_SUMMON_DISTS_PX.length - 1], a0);
};

/** プレイヤーの後ろ(向いている側の反対)の周回の楕円の上の点。向きが無ければ null。 */
export const wraithBehindPoint = (cx: number, cy: number, faceX: number, faceY: number): { x: number; y: number } | null => {
  const l = Math.hypot(faceX, faceY);
  if (l < 1e-6) return null;
  return wraithOrbitPoint(cx, cy, Math.atan2(-faceY / l, -faceX / l));
};
