// ?proj=1 段階6(★#36・★#37): 湧きのフェードイン/回収の残像(store が持つ時間のフェード・純関数と小さなモジュールの状態)。
// 設計書: research/PERSPECTIVE_PROJECTION.md §3-9o イ・ケ3・ケ7・コ1・コ2。PixiJS を読まない(描画は store の値を読むだけ)。
//
// - フェードイン: 湧いた最初のフレーム、または回収(V25)・置き去りの回収(V23/V27)・叫喚型のワープで同じ id のまま移った最初のフレームに、
//   投影した絵の箱が「フェードの判定の画面」(コ1=ゲームの画面を min(viewZoom, 湧きの目標ズーム) を数秒保持した一番引いた値で組んだ物)に
//   掛かっていたら `Enemy.projFadeInAt = gameTime`。濃さは projFadeInAlpha(900ms・ease-out 寄り=闇から立ち上がる)。対象の区分は projSpawnFadeApplies のまま。
// - 残像: 回収の瞬間に絵の箱がフェードの判定の画面に掛かっていた物だけ store の列(projRecycleGhosts・上限24/弾は projBulletGhosts・上限48)へ。
//   各項目は gameTime と回収直前の速度(vx/vy・px/s)を持ち、フェードアウトの尺(敵 450ms・弾 200ms)だけ残してから列から外す。
//   残像は止めずに速度を引き継いで減速しながら流れる(慣性 MUST・projGhostDrift)。中身が変わらないフレームは同じ参照を返す(ケ7)。
// - `?proj=0`・場面の外(ゲームの画面が null)では、どの関数も何もしない(入力をそのまま返す)。
import type { Enemy, Projectile } from '../types/game';
import { enemyFootBox } from '../pixi/renderSpec';
import { PROJ_GAME_SPAWN, PROJ_GAME_RECYCLE } from './projFlag';
import {
  getProjGameView, projFadeInAlpha, projGameBoxOnScreen, projGameViewContains, projGameZoomPlacement,
  projGhostFadeAlpha, projFadeHidden, projGameRowOutsideFootX, projLabViewCam, PROJ_GHOST_FADE_MS, PROJ_BULLET_GHOST_FADE_MS,
  type ProjGameView, type ProjGameViews,
} from './projGameView';
import { makeProjFrame, makeProjPoint, projectInto, projWorldYOfLocal } from './perspectiveProjection';
import { holdMinZoom, RETIRE_ZOOM_HOLD_MS, type ZoomHold } from './spawnRefill';
import { projSpawnFadeApplies, projCrawlerScale } from './projActorPass';
import { CRAWLER_ART_BODY_DISPLAY_W, CRAWLER_HIT_H, CRAWLER_BODY_FOOT_UP_PX, crawlerPushHClamp } from '../world/labCrawler';

// ---- フェードの判定の画面(コ1) ----

let fadeHold: ZoomHold = { z: 1, at: 0 };
let fadeView: ProjGameView | null = null;
let fadeSrc: ProjGameViews | null = null;
let fadeZ = NaN;

/** 湧きの目標ズームと viewZoom の小さい方を毎フレーム記録する(retireZoomHold と同じ形=一番引いた値を数秒保持)。 */
export const noteProjFadeZoom = (zNow: number, gameTime: number): void => {
  if (!PROJ_GAME_SPAWN) return;
  fadeHold = holdMinZoom(fadeHold, zNow, gameTime, RETIRE_ZOOM_HOLD_MS);
};

/** 出撃の始め(store.resetGame)とテスト: 保持・湧きの印の id の記録・待ち行列を戻す(前の出撃から持ち越さない)。 */
export const resetProjFadeState = (): void => {
  fadeHold = { z: 1, at: 0 }; fadeView = null; fadeSrc = null; fadeZ = NaN; seenIds.clear(); seenPrimed = false;
  ghostOverflow = 0; bulletGhostOverflow = 0;
  pendingGhosts.length = 0; pendingBulletGhosts.length = 0; recycleEvents.clear();
};

/** 保持したズーム(計器・テスト用)。 */
export const projFadeZoom = (): number => fadeHold.z;

/**
 * フェードの判定の画面: このフレームのゲームの画面(gfCam=store のカメラ)を、保持した一番引いたズームで組み直した物。
 * `?proj=0`・場面の外は null。
 */
export const projFadeScreen = (): ProjGameView | null => {
  if (!PROJ_GAME_SPAWN && !PROJ_GAME_RECYCLE) return null;
  const v = getProjGameView();
  if (!v) return null;
  const z = Math.min(fadeHold.z, v.cam.f.wgScale || 1);
  if (fadeSrc !== v || fadeZ !== z || !fadeView) {
    const f0 = v.cam.f;
    const wg = projGameZoomPlacement(z, f0.screenW, f0.screenH, f0.farH);
    fadeView = { f: makeProjFrame({ ...f0, ...wg }), horizonLocal: v.cam.horizonLocal, fadePx: v.cam.fadePx };
    fadeSrc = v; fadeZ = z;
  }
  return fadeView;
};

/**
 * 描かれているとみなす濃さの下限(湧きの印・残像の判定)。計器 s6 recycle の「alpha 0.05 以上で描かれていた物」と同じ値
 * (地平線フェードの際の薄く描かれた物も、湧きは薄く入り・回収は残像で消える=★#38 の「見えている」0.5 より広い側に倒す・ケ3)。
 */
export const PROJ_FADE_DRAWN_ALPHA = 0.05;

/** 敵の絵の箱(描画と同じ枠 renderSpec.enemyFootBox・s=1 の寸法)がその画面に掛かるか(ケ14)。 */
export const projEnemyArtOnScreen = (
  gv: ProjGameView, e: Pick<Enemy, 'x' | 'y' | 'width' | 'height' | 'type'>, minAlpha = PROJ_FADE_DRAWN_ALPHA,
): boolean => {
  const fb = enemyFootBox(e as Enemy);
  return projGameBoxOnScreen(gv, fb.footX, fb.footY, fb.boxW, fb.boxH, 0, minAlpha);
};

// ---- 研究所(ステージ2)のゲームの画面(湧き・回収・照準の対象選び) ----
// 研究所の「見えている」の物差しは1本: 絵の箱(描画と同じ大きさ)が濃さ PROJ_FADE_DRAWN_ALPHA(0.05)以上で画面に掛かるか=「描かれているか」。
// ★#38 の 0.5 は使わない(研究所は主人公のすぐ北から地平線フェードが掛かる=主人公の行で濃さ約 0.74・北 40px で 0.45)。

/**
 * 研究所の湧きの行ごとの外の x(labSpawn.placeLabSpawn の outsideX): 型と大きさが e の敵を左上 y に置いた時、
 * 絵の箱(enemyFootBox)が画面の横の端(side)の外へちょうど出切る左上 x。行が描かれていなければ null。
 */
export const projLabSpawnOutsideX = (
  gv: ProjGameView, e: Pick<Enemy, 'width' | 'height' | 'type'>,
): ((side: 1 | -1, y: number) => number | null) => (side, y) => {
  const fb = enemyFootBox({ ...(e as Enemy), x: 0, y });
  const fx = projGameRowOutsideFootX(gv, side, fb.footY, fb.boxW);
  return fx === null ? null : fx - e.width / 2; // 足元の中心 x → 左上 x
};

/**
 * 変異塊の絵の箱(描画 pixiScene.syncLabCrawler と同じ大きさの目安): 足元=crawlerBodyFoot(箱の下辺の中心)・幅=絵の胴の表示幅・
 * 背丈=判定の奥行き(絵の背丈≈箱の奥行き・labCrawler.ts の CRAWLER_BODY_FOOT_UP_PX の注)。倍率は描画と同じ頭打ち(projCrawlerScale)。
 */
export const projLabCrawlerDrawn = (gv: ProjGameView, footX: number, footY: number, minAlpha = PROJ_FADE_DRAWN_ALPHA): boolean =>
  projGameBoxOnScreen(gv, footX, footY - CRAWLER_BODY_FOOT_UP_PX, CRAWLER_ART_BODY_DISPLAY_W, CRAWLER_HIT_H, 0, minAlpha, projCrawlerScale);

/**
 * 研究所の変異塊の押し返し: 主人公の足元が「描かれた塊の絵の上端」よりどれだけ内側(手前)まで入ってから押し返されるか(表示座標の縦 px・
 * ズーム前)。絵の上端=足元から CRAWLER_HIT_H × 描く倍率 上(projLabCrawlerDrawn と同じ背丈)。歩きのコマは上端の下に透明な行があり、
 * 肉の山の頂は上端より約 50px 下(画で実測: スマホ 430×932)。主人公を北から歩かせて塊に当て、止まった所を撮って決めた
 * (40=まだ山の頂の手前で止まる/80=山の頂に足が触れる程度/110=脚が肉に隠れる/95=両側の山が足の高さを越え、少し重なって止まる)。
 */
export const PROJ_CRAWLER_PUSH_SINK_PX = 95;
const pushScratch = makeProjPoint();
/**
 * `?proj=1` の研究所: 塊がプレイヤーを押し返す・移動を塞ぐ箱の奥行き(world/labCrawler.crawlerPushRect の pushH)。
 * 描画は塊の大きさを頭打ちしている(projCrawlerScale: 投影の s → k)ので、絵の上端が判定の上辺より手前(南)に来て、描かれた体の縁より
 * 前で押し返されていた。頭打ちが効いている時(k < s)だけ、判定の上辺を「絵の上端から PROJ_CRAWLER_PUSH_SINK_PX だけ手前の行」まで
 * 下げる(投影の縦の対応で world の行へ戻す=画面で測った縁に合わせる):
 *   pushH = footY − worldY(ℓ(footY) − CRAWLER_HIT_H × k + PROJ_CRAWLER_PUSH_SINK_PX)   (1..CRAWLER_HIT_H に収める)
 * gv が無い(`?proj=0`・屋外・洋館)・足元が定義域の外・頭打ちが効いていない(k ≥ s)は CRAWLER_HIT_H(=今の箱そのまま)。
 * 取り込み・叩きつけ(赤い予告)・被弾の箱は変えない。
 */
export const projLabCrawlerPushH = (gv: ProjGameView | null, footX: number, footY: number): number => {
  if (!gv) return CRAWLER_HIT_H;
  const f = gv.f;
  const p = projectInto(f, footX, footY, pushScratch);
  if (!p.inDomain || !(p.s > 0)) return CRAWLER_HIT_H;
  const k = projCrawlerScale(p.s);
  if (!(k < p.s)) return CRAWLER_HIT_H;
  const lTop = p.l - CRAWLER_HIT_H * k + PROJ_CRAWLER_PUSH_SINK_PX;
  if (!(lTop > 0)) return CRAWLER_HIT_H; // 縁が地平線の先=押し返しは今の箱のまま
  return crawlerPushHClamp(footY - projWorldYOfLocal(f, lTop));
};

/** 敵の絵の箱が研究所の画面に描かれているか(変異塊の代理=型 'lab-crawler' は塊の絵の箱・頭打ちの倍率で測る)。 */
export const projLabEnemyDrawn = (gv: ProjGameView, e: Enemy): boolean =>
  e.type === 'lab-crawler'
    ? projLabCrawlerDrawn(gv, e.x + e.width / 2, e.y + e.height)
    : projEnemyArtOnScreen(gv, e, PROJ_FADE_DRAWN_ALPHA);

/**
 * 研究所の照準の対象から外すか(武器・サブウェポンの狙いの入口すべて=projLabAimable): 研究所のゲームの画面がある時だけ、
 * 絵の箱が画面に1つも描かれていない(画面の外・地平線の先)敵は外す。研究所でない・`?proj=0` は常に false。
 */
export const projLabAimHidden = (e: Enemy, _gameTime: number, gv: ProjGameView | null = projLabViewCam()): boolean =>
  gv !== null && !projLabEnemyDrawn(gv, e);

/**
 * 研究所の狙いの候補(武器・サブウェポンの狙いの入口が敵の列を渡す前に通す門)。研究所のゲームの画面が無い時(屋外・`?proj=0`)は
 * 同じ配列をそのまま返す(=1ビットも変わらない)。
 */
export const projLabAimable = <T extends Enemy>(enemies: readonly T[]): T[] => {
  const gv = projLabViewCam();
  return gv ? enemies.filter(e => projLabEnemyDrawn(gv, e)) : (enemies as T[]);
};

/** 研究所の回収で「描かれているので今は回収しない」か。研究所でない・`?proj=0` は常に false。 */
export const projLabRecycleHold = (e: Enemy, gv: ProjGameView | null = projLabViewCam()): boolean =>
  gv !== null && projLabEnemyDrawn(gv, e);

// ---- フェードイン(イ・ケ1・コ2) ----

/**
 * 同じ id のまま移った/湧いた敵に、移った先の絵の箱がフェードの判定の画面に掛かっていれば projFadeInAt を付ける(掛かっていなければ外す)。
 * 区分の外(ボス級・終端の死神)・`?proj=0`・場面の外では e をそのまま返す。
 */
export const projMarkFadeIn = <T extends Enemy>(e: T, gameTime: number): T => {
  if (!PROJ_GAME_SPAWN || !projSpawnFadeApplies(e)) return e;
  const gv = projFadeScreen();
  if (!gv) return e;
  const on = projEnemyArtOnScreen(gv, e);
  if (on) return e.projFadeInAt === gameTime ? e : { ...e, projFadeInAt: gameTime };
  return e.projFadeInAt === undefined ? e : { ...e, projFadeInAt: undefined };
};

const seenIds = new Set<string>();
let seenPrimed = false;
const nextIds = new Set<string>();

/**
 * 湧いた最初のフレーム(前のフレームに無かった id)の敵に印を付ける。tick の終わり(全部の湧き・回収の後・描画の前)に1回。
 * 変わらない時は同じ配列を返す。場面の外では id の記録だけ更新する(場面へ入った瞬間に居た敵を「湧いた」と数えない)。
 */
export const projFadeInNewEnemies = (enemies: Enemy[], gameTime: number): Enemy[] => {
  if (!PROJ_GAME_SPAWN) return enemies;
  const gv = projFadeScreen();
  let out: Enemy[] | null = null;
  nextIds.clear();
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    nextIds.add(e.id);
    if (!gv || !seenPrimed || seenIds.has(e.id)) continue;
    const m = projMarkFadeIn(e, gameTime);
    if (m !== e) { if (!out) out = enemies.slice(); out[i] = m; }
  }
  seenIds.clear();
  for (const id of nextIds) seenIds.add(id);
  seenPrimed = true;
  return out ?? enemies;
};

/** フェードインの濃さ(印が無ければ 1)。 */
export const projEnemyFadeAlpha = (e: Pick<Enemy, 'projFadeInAt'>, gameTime: number): number =>
  e.projFadeInAt === undefined ? 1 : projFadeInAlpha(gameTime - e.projFadeInAt);

/** 濃さ 0.5 未満の間は ★#38 の「見えていない」(イ「判定」・フェードインの曲線で測る)。本体は projGameView(循環しない置き場)。 */
export { projFadeHidden };

// ---- 回収の残像(イ・ケ7) ----

/** 回収の残像の1項目(前の位置・型・向きは敵の写しのまま持つ・vx/vy=回収直前の速度 px/s)。 */
export interface ProjRecycleGhost { id: string; at: number; e: Enemy; vx: number; vy: number }
/** 弾の残像の1項目(vx/vy=回収直前の速度 px/s)。 */
export interface ProjBulletGhost { id: string; at: number; p: Projectile; vx: number; vy: number }

/** 残像の流れの時定数(ms): 敵は数歩ぶん流れて止まる・弾は飛び続けたまま消える。 */
export const PROJ_GHOST_DRIFT_TAU_MS = 260;
export const PROJ_BULLET_GHOST_DRIFT_TAU_MS = 600;

/**
 * 残像の流れ(純関数): 回収直前の速度 (vx, vy) px/s を引き継ぎ、時定数 tau で減速しながら進んだ量。
 * d(t) = v·τ·(1 − e^(−t/τ))(始めは元の速さ・だんだん止まる)。経過 0 以下は 0。
 */
export const projGhostDrift = (vx: number, vy: number, elapsedMs: number, tauMs: number): { dx: number; dy: number } => {
  const t = Math.max(0, elapsedMs);
  const tau = Math.max(1, tauMs) / 1000;
  const k = tau * (1 - Math.exp(-t / 1000 / tau));
  return { dx: (Number.isFinite(vx) ? vx : 0) * k, dy: (Number.isFinite(vy) ? vy : 0) * k };
};

/** 敵の回収直前の速度(px/s): 押されている間は押しの速さ、それ以外は追いの速さ(store の vx/vy)。 */
export const projEnemyGhostVelocity = (e: Enemy, nowMs: number = Date.now()): { vx: number; vy: number } => {
  if (e.knockbackUntil !== undefined && nowMs < e.knockbackUntil && (e.knockbackVx !== undefined || e.knockbackVy !== undefined)) {
    return { vx: e.knockbackVx ?? 0, vy: e.knockbackVy ?? 0 };
  }
  return { vx: e.vx ?? 0, vy: e.vy ?? 0 };
};

export const PROJ_RECYCLE_GHOST_CAP = 24;
export const PROJ_BULLET_GHOST_CAP = 48;

let ghostOverflow = 0;
let bulletGhostOverflow = 0;
/** 上限を超えてパッと消えた数(計器 B・ク)。 */
export const projGhostOverflow = (): { enemy: number; bullet: number } => ({ enemy: ghostOverflow, bullet: bulletGhostOverflow });

/** 回収の瞬間に残像を積むか(絵の箱がフェードの判定の画面に掛かっていた物だけ)。 */
export const projGhostWanted = (e: Enemy): boolean => {
  if (!PROJ_GAME_RECYCLE) return false;
  const gv = projFadeScreen();
  return !!gv && projEnemyArtOnScreen(gv, e);
};

/** 弾の残像を積むか(弾の中心が地面の点としてフェードの判定の画面の中)。 */
export const projBulletGhostWanted = (p: Projectile): boolean => {
  if (!PROJ_GAME_RECYCLE) return false;
  const gv = projFadeScreen();
  return !!gv && projGameViewContains(gv, p.x + p.width / 2, p.y + p.height / 2, 0, PROJ_FADE_DRAWN_ALPHA);
};

/**
 * 列を進める(純関数): 尺 durMs を過ぎた項目を外し、add を後ろへ積む(上限を超えた分は古い方から落とす=数える)。
 * 何も変わらなければ同じ参照を返す。
 */
export const projAdvanceGhosts = <G extends { id: string; at: number }>(
  list: readonly G[], add: readonly G[], gameTime: number, cap: number, onOverflow?: (n: number) => void, durMs: number = PROJ_GHOST_FADE_MS,
): G[] => {
  const dead = (g: G) => gameTime - g.at >= durMs || gameTime < g.at;
  let expired = 0;
  for (const g of list) if (dead(g)) expired++;
  if (expired === 0 && add.length === 0) return list as G[];
  const next: G[] = [];
  for (const g of list) if (!dead(g)) next.push(g);
  for (const g of add) next.push(g);
  if (next.length > cap) {
    const over = next.length - cap;
    onOverflow?.(over);
    next.splice(0, over);
  }
  return next;
};

/** 敵の残像の列を進める(store から呼ぶ)。 */
export const projAdvanceRecycleGhosts = (list: readonly ProjRecycleGhost[], add: readonly ProjRecycleGhost[], gameTime: number): ProjRecycleGhost[] =>
  projAdvanceGhosts(list, add, gameTime, PROJ_RECYCLE_GHOST_CAP, n => { ghostOverflow += n; }, PROJ_GHOST_FADE_MS);

/** 弾の残像の列を進める(store から呼ぶ)。 */
export const projAdvanceBulletGhosts = (list: readonly ProjBulletGhost[], add: readonly ProjBulletGhost[], gameTime: number): ProjBulletGhost[] =>
  projAdvanceGhosts(list, add, gameTime, PROJ_BULLET_GHOST_CAP, n => { bulletGhostOverflow += n; }, PROJ_BULLET_GHOST_FADE_MS);

/** 敵の残像の濃さ(1→0・450ms・ease-in=フェードインとは別の曲線)。 */
export const projGhostAlpha = (at: number, gameTime: number): number => projGhostFadeAlpha(gameTime - at, PROJ_GHOST_FADE_MS);
/** 弾の残像の濃さ(1→0・200ms・ease-in)。 */
export const projBulletGhostAlpha = (at: number, gameTime: number): number => projGhostFadeAlpha(gameTime - at, PROJ_BULLET_GHOST_FADE_MS);

// ---- このフレームに積む残像の待ち行列(回収する所が積み、tick の終わりに1回だけ store の列へ流す) ----

const pendingGhosts: ProjRecycleGhost[] = [];
const pendingBulletGhosts: ProjBulletGhost[] = [];

/** 回収(V25・V25b・V25c・V23/V27 の置き去りの回収・叫喚型のワープ)の瞬間に、前の敵の写しを積む(画面に掛かっていた物だけ)。 */
export const queueProjRecycleGhost = (e: Enemy, gameTime: number): void => {
  projGhostStats.asked++;
  noteRecycleEvent(e.id, gameTime);
  if (projGhostWanted(e)) { const v = projEnemyGhostVelocity(e); pendingGhosts.push({ id: e.id, at: gameTime, e, vx: v.vx, vy: v.vy }); projGhostStats.queued++; }
};
/** 計器(DEV の確認用): 回収の瞬間に残像を尋ねた数/積んだ数。 */
export const projGhostStats = { asked: 0, queued: 0 };

// 計器 s6 spawn / s6 recycle 用: 回収(同じ id のまま移った/配列から抜いた)の出来事の記録(id → gameTime・上限つき)。
// 描画の計器は「位置が大きく跳んだ」「配列から抜けた」だけでは回収と数えず、ここに記録がある物だけを回収と数える
// (弾き飛ばし・ワープ・倒されて抜けた敵を誤って数えない)。
const recycleEvents = new Map<string, number>();
const RECYCLE_EVENT_CAP = 256;
const noteRecycleEvent = (id: string, gameTime: number): void => {
  recycleEvents.delete(id);
  recycleEvents.set(id, gameTime);
  if (recycleEvents.size > RECYCLE_EVENT_CAP) { const k = recycleEvents.keys().next().value; if (k !== undefined) recycleEvents.delete(k); }
};
/** その id がこの gameTime の近く(withinMs 以内)に回収されたか(計器だけが読む)。 */
export const projRecycledNear = (id: string, gameTime: number, withinMs = 100): boolean => {
  const at = recycleEvents.get(id);
  return at !== undefined && gameTime >= at && gameTime - at <= withinMs;
};
/** 叫喚型のワープ・置き去りの回収(同じ id のまま移った)も回収の出来事として記録する(残像を積まない所から)。 */
export const noteProjRecycleEvent = (id: string, gameTime: number): void => { if (PROJ_GAME_RECYCLE || PROJ_GAME_SPAWN) noteRecycleEvent(id, gameTime); };

/** V78 の半径で消えた弾を積む(画面の中だった物だけ)。 */
export const queueProjBulletGhost = (p: Projectile, gameTime: number): void => {
  if (projBulletGhostWanted(p)) pendingBulletGhosts.push({ id: p.id, at: gameTime, p, vx: p.direction.x * p.speed, vy: p.direction.y * p.speed });
};

/**
 * tick の終わりに1回: 待ち行列を store の列へ流し、尺を過ぎた項目を外す。変わらない時は null(set() しない)。
 */
export const flushProjGhosts = (
  st: { projRecycleGhosts: ProjRecycleGhost[]; projBulletGhosts: ProjBulletGhost[] }, gameTime: number,
): { projRecycleGhosts: ProjRecycleGhost[]; projBulletGhosts: ProjBulletGhost[] } | null => {
  if (!PROJ_GAME_RECYCLE) return null;
  const g = projAdvanceRecycleGhosts(st.projRecycleGhosts, pendingGhosts, gameTime);
  const b = projAdvanceBulletGhosts(st.projBulletGhosts, pendingBulletGhosts, gameTime);
  pendingGhosts.length = 0; pendingBulletGhosts.length = 0;
  if (g === st.projRecycleGhosts && b === st.projBulletGhosts) return null;
  return { projRecycleGhosts: g, projBulletGhosts: b };
};

/** ゲームの画面を別のズーム z で組み直した物(V27 の retireZoomHold.z・ケ1)。表は同じ物を参照する(書き換えない)。 */
export const projViewAtZoom = (gv: ProjGameView, z: number): ProjGameView => {
  const f0 = gv.f;
  const wg = projGameZoomPlacement(z, f0.screenW, f0.screenH, f0.farH);
  return { f: makeProjFrame({ ...f0, ...wg }), horizonLocal: gv.horizonLocal, fadePx: gv.fadePx };
};
