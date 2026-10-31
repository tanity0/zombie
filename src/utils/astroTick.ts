// 宇宙飛行群(変異)のコントローラ(research/ASTRONAUT_HORDE.md)。useGameLoop が毎フレーム1回呼ぶ。
// 流儀は解放軍群(libertyTick)と同じ「store を読んで patch を書く」。動かすのはここだけ(updateEnemies は素通り)。
//
// 掟:
//  - 移動は行ける帯(clampRectToPlayableArea)だけを通す(浮いている=障害物は透き通る・社長指示2026-10-29)。
//  - 浮いて見えるのは絵だけ(判定・影・帯の y は地面のまま=上下の5つの副作用に触れない)。
//  - 投げるのは必ず着地してから・姿が画面に入っている時だけ。投げた物は台帳(store.astroThrows)に置き、
//    投げ手が倒れても最後まで飛んで当たる。手を離す前に崩されたら、その投げの分を台帳から消す(赤が残って当たらない、を作らない)。
import type { Enemy } from '../types/game';
import { useGameStore, resolveBountyMove, PLAYER_BASE_SPEED, type PumpkinBlast } from '../store/gameStore';
import { GAME_SPEED } from '../config/gameSpeed';
import { worldDist } from '../config/worldScale';
import { clampRectToPlayableArea, type PlayableAreaCtx } from '../world/playableArea';
import { getRunPois } from '../world/pois';
import { isCorpse, isMutantHero } from './enemyUtils';
import { isPointInZoomedViewport, zoomedViewportBounds } from './cameraZoom';
import { playSfx } from '../audio/audioManager';
import { npcSfxDistGain } from './npcSfx';
import { bossFaceWant, bossFaceDeadzonePx } from './bossFacing';
import { frontConeSees, FRONT_SIGHT_PX, FRONT_SIGHT_LOSE_PX } from './frontSight';
import {
  ASTRO_PATROL_SPEED, ASTRO_ENGAGE_SPEED_MULT, ASTRO_DECEL_S, ASTRO_STOPPED_FRAC, ASTRO_HOVER_LOOP_LO,
  ASTRO_THROW_GAP_MIN_MS, ASTRO_THROW_GAP_MAX_MS, ASTRO_REST_MIN_MS, ASTRO_REST_MAX_MS, ASTRO_ARRIVE_PX,
  ASTRO_STUCK_MS, ASTRO_STUCK_PX, ASTRO_HIT_ALERT_MS, ASTRO_LOSE_MS, ASTRO_RELEASE_MS, astroThrowEndMs,
  ASTRO_METEOR_COOLDOWN_MS, ASTRO_BOUQUET_HEAL_FRAC, ASTRO_DEBRIS_RADIUS, ASTRO_DEBRIS_DAMAGE,
  stepAstroHover, stepAstroPeriodicLand, type AstroPeriodicLand, astroCanMove, stepAstroVelocity, astroArriveSpeed, astroBandPull, astroPoiCandidates, pickAstroPoi,
  ASTRO_SCRIPT, astroScriptChainAfter, astroDebrisCount, isAstroPinch, astroThrowPlan, astroLingerMs, astroMeteorShake, astroRainStep, type AstroRainState,
  type AstroPoi, type AstroThrowKind, type AstroThrowEntry,
} from './astroScript';

export interface AstroTickState {
  activeId: string | null;
  /** 進む向き(rad)と速さ(px/s)=慣性の器。 */
  heading: number; speed: number;
  /** 巡回先の候補・今の行き先・直前の行き先。 */
  pois: AstroPoi[]; poiIdx: number | null; prevPoi: number | null;
  /** POI に着いて休んでいる(着地してから restUntil まで)。 */
  resting: boolean; restUntil: number | null;
  /** 詰まりの見張り(この時刻のこの距離から、ASTRO_STUCK_MS で ASTRO_STUCK_PX 近づけたか)。 */
  stuckAt: number; stuckD: number;
  lostSince: number | null;
  /** 次に投げに入る時刻(浮き直しが終わってから数える)。null=まだ決めていない。 */
  nextThrowAt: number | null;
  /** 投げるために降りている途中。 */
  wantThrow: boolean;
  /** 台本の続き(旗を投げ終えたら、着地したまま破片の雨へ続ける)。null=次の着地は旗から。 */
  chainNext: AstroThrowKind | null;
  lastKind: AstroThrowKind | null;
  meteorReadyAt: number;
  seq: number;
  /** 今の投げの ID(取り消し用)と、手を離した音を鳴らしたか。 */
  curThrowId: string | null;
  released: boolean;
  /** 投げていない時の定期の着地(§3・社長指示2026-10-29)。 */
  periodic: AstroPeriodicLand;
}
export const createAstroTickState = (): AstroTickState => ({
  activeId: null, heading: 0, speed: 0, pois: [], poiIdx: null, prevPoi: null, resting: false, restUntil: null,
  stuckAt: 0, stuckD: Infinity, lostSince: null, nextThrowAt: null, wantThrow: false, chainNext: null, lastKind: null,
  meteorReadyAt: 0, seq: 0, curThrowId: null, released: false, periodic: { nextAt: null, holdUntil: null },
});

const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

const playCtx = (): PlayableAreaCtx => {
  const st0 = useGameStore.getState();
  return {
    farBackdrop: st0.farBackdrop,
    labTheme: st0.stageTheme === 'lab' && !st0.indoorMode,
    corridorMode: st0.corridorMode,
    m0AdvanceLimitX: st0.m0AdvanceLimitX,
    corridorRunInActive: st0.corridorRunInActive,
  };
};
/**
 * 中心座標を、その体が居てよい左上座標へ(行ける帯だけ)。
 * 宇宙飛行群と亡霊は浮いている=木・小物・施設・墓石を透き通る(社長指示2026-10-29「亡霊と宇宙飛行群はオブジェクトの影響を受けない(透き通る)」)。
 */
export const placeAt = (e: Enemy, cx: number, cy: number): { x: number; y: number } =>
  clampRectToPlayableArea(cx - e.width / 2, cy - e.height / 2, e.width, e.height, playCtx());

/** 交戦中の最高速=プレイヤーの素の移動速度の0.7倍(下がっても追いつける=倒せる敵にする)。 */
export const astroEngageSpeed = (): number => PLAYER_BASE_SPEED * GAME_SPEED * ASTRO_ENGAGE_SPEED_MULT;

/** 本編の巡回先の候補(裏ボスの巣・寄り道の建物・拠点。洞窟は今は無い)。足りなければ原点から 6000〜11000 の無作為な点を足す。 */
export const astroRunPois = (): AstroPoi[] => {
  const st = useGameStore.getState();
  const pois = getRunPois(st.hiddenBoss, [
    { kind: 'hospital', pos: st.hospital }, { kind: 'armory', pos: st.armory }, { kind: 'police', pos: st.police },
  ]);
  return astroPoiCandidates([...pois, ...st.baseSites.map(b => ({ x: b.x, y: b.y }))], { x: 0, y: 0 },
    worldDist(6000), worldDist(11000), Math.random);
};

/** 見つける相手(プレイヤー/守護霊)のうち一番近い者と、前方の扇で見つけたか。 */
export const nearestTarget = (bx: number, by: number, faceX: number, faceY: number): { x: number; y: number; d: number; seen: boolean; ghost: boolean } => {
  const st = useGameStore.getState();
  let best = { x: bx, y: by, d: Infinity, seen: false, ghost: false };
  let seen = false;
  const look = (x: number, y: number, ghost: boolean) => {
    const d = Math.hypot(x - bx, y - by);
    if (d < best.d) best = { x, y, d, seen: false, ghost };
    if (frontConeSees(bx, by, faceX, faceY, x, y, FRONT_SIGHT_PX)) seen = true;
  };
  const p = st.player;
  if (p.health > 0) look(p.x + p.width / 2, p.y + p.height / 2, false);
  const g = st.summons.find(s => s.kind === 'ghost-ally');
  if (g) look(g.x + g.width / 2, g.y + g.height / 2, true);
  return { ...best, seen };
};

/** 手を離す前の投げを台帳から消す(予告も同時に消える)。 */
const dropThrow = (throwId: string | null, gt: number): void => {
  if (!throwId) return;
  useGameStore.setState(st => ({ astroThrows: st.astroThrows.filter(t => t.throwId !== throwId || gt >= t.releaseAt) }));
};

/**
 * 宇宙飛行群1体ぶんの1フレーム。gt=ゲーム時間(ms)・dt=秒・nowMs=実時間(lastHit・liftUntil と同じ時計)。
 */
export const runAstroTick = (e: Enemy, s: AstroTickState, gt: number, dt: number, nowMs: number): void => {
  if (s.activeId !== e.id) Object.assign(s, createAstroTickState(), { activeId: e.id, stuckAt: gt });
  const st = useGameStore.getState();
  const bx = e.x + e.width / 2, by = e.y + e.height / 2;
  const patch: Partial<Enemy> = {};
  const onScreen = isPointInZoomedViewport(bx, by, st.camera, st.gameBounds, st.viewZoom);
  const collapse = (e.bossFullStunUntil !== undefined && gt < e.bossFullStunUntil) || (e.stunUntil !== undefined && gt < e.stunUntil);
  const held = (e.rootUntil !== undefined && gt < e.rootUntil) || (e.liftUntil !== undefined && nowMs < e.liftUntil);
  const vmaxEngage = astroEngageSpeed();

  // ---- 見つける / 見失う(解放軍群と同じ=前方の扇・殴られたら気づく・遠くで3秒) ----
  const moving = s.speed > 5;
  const faceX = moving ? Math.cos(s.heading) : (e.heroFaceX ?? -1);
  const faceY = moving ? Math.sin(s.heading) : 0;
  const tgt = nearestTarget(bx, by, faceX, faceY);
  const wasAlerted = e.libAlerted === true;
  let alerted = wasAlerted;
  const struck = nowMs - (e.lastHit ?? 0) <= ASTRO_HIT_ALERT_MS;
  if (tgt.seen || struck) { alerted = true; s.lostSince = null; }
  else if (wasAlerted) {
    if (tgt.d > FRONT_SIGHT_LOSE_PX) {
      if (s.lostSince === null) s.lostSince = gt;
      if (gt - s.lostSince >= ASTRO_LOSE_MS) { alerted = false; s.lostSince = null; }
    } else s.lostSince = null;
  }
  if (alerted !== wasAlerted) patch.libAlerted = alerted;
  if (!alerted && wasAlerted) { s.wantThrow = false; s.chainNext = null; s.nextThrowAt = null; s.stuckAt = gt; s.stuckD = Infinity; }
  const vmax = alerted ? vmaxEngage : ASTRO_PATROL_SPEED;

  // ---- 投げの途中 ----
  let throwing = e.astroThrowAt !== undefined;
  if (throwing) {
    const t = gt - (e.astroThrowAt as number);
    if (t < ASTRO_RELEASE_MS && (collapse || held)) {
      // 手を離す前に崩された=投げは消え、予告も消える。
      dropThrow(s.curThrowId, gt);
      Object.assign(patch, { astroThrowAt: undefined, astroThrowKind: undefined });
      s.curThrowId = null; s.nextThrowAt = null; s.chainNext = null; // 崩されたら台本は最初(旗)から
      throwing = false;
    } else if (t >= astroThrowEndMs(e.astroThrowKind)) { // 隕石は落ちて腕を下ろし切るまで
      Object.assign(patch, { astroThrowAt: undefined, astroThrowKind: undefined });
      s.curThrowId = null; s.nextThrowAt = null; // 浮き直しが終わってから次の間隔を数える
      throwing = false;
      // 台本(社長指示2026-10-30「旗投げと破片の雨は単発では出さない。移動もはさまない。着地したら旗を投げて、立ったまま次の破片の雨に移る」):
      // 旗を投げ終えたら浮かずに(着地したまま)すぐ破片の雨へ。破片の雨の後は浮いて動き、次の着地は旗から。
      const nx = astroScriptChainAfter(e.astroThrowKind);
      if (nx && !collapse && !held && alerted && onScreen) { s.chainNext = nx; s.wantThrow = true; }
      else s.chainNext = null;
    } else if (t >= ASTRO_RELEASE_MS && !s.released) {
      s.released = true;
      const pl = st.player;
      const g = npcSfxDistGain(bx, by, pl.x + pl.width / 2, pl.y + pl.height / 2, st.camera, st.gameBounds);
      // 投げる物ごとに手を離す音を変える(クリエイティブ監査#14): ミサイル=点火 / 国旗=槍の風切り / 残骸=重い放り上げ / 隕石=空への合図 / 花束=軽い放り。
      if (g > 0.01) {
        const k = e.astroThrowKind;
        if (k === 'missile') playSfx('grenade-launcher-fire', 0.8 * g);
        else if (k === 'flag') playSfx('whip-swing', g, undefined, 1.2);
        else if (k === 'debris') playSfx('whip-swing', g, undefined, 0.62);
        else if (k === 'meteor') { playSfx('whip-swing', 0.7 * g, undefined, 0.55); playSfx('hurricane', 0.4 * g, undefined, 0.6); } // 空の向こうの唸り
        else playSfx('whip-swing', 0.45 * g, undefined, 1.45);
      }
    }
  }

  // ---- 望む向き・速さと、降りたいか ----
  const anim0 = { frame: e.astroHoverFrame ?? 0, acc: e.astroHoverAcc ?? 0, dir: (e.astroHoverDir ?? 1) as 1 | -1 };
  let wantH = s.heading, wantS = 0;
  let landReq = false;
  const vb = zoomedViewportBounds(st.camera, st.gameBounds, st.viewZoom);
  const inInner = (x: number, y: number, m: number) => x >= vb.left + m && x <= vb.right - m && y >= vb.top + m && y <= vb.bottom - m;
  // 投げていない時(巡回・対策室の輪)の定期の着地。見つけている間は投げで降りるので数えない。
  const periodicOn = !throwing && !collapse && !held && !alerted && !s.resting;
  let periodicLand = false;
  if (periodicOn) {
    const r = stepAstroPeriodicLand(s.periodic, gt, anim0.frame, Math.random);
    s.periodic = { nextAt: r.nextAt, holdUntil: r.holdUntil };
    periodicLand = r.land;
  } else {
    s.periodic = { nextAt: null, holdUntil: null };
  }
  if (throwing || collapse || held) {
    landReq = true;
  } else if (alerted) {
    if (s.nextThrowAt === null && !s.wantThrow && anim0.frame >= ASTRO_HOVER_LOOP_LO) s.nextThrowAt = gt + rand(ASTRO_THROW_GAP_MIN_MS, ASTRO_THROW_GAP_MAX_MS);
    if (!s.wantThrow && s.nextThrowAt !== null && gt >= s.nextThrowAt && onScreen && st.player.health > 0) s.wantThrow = true;
    if (s.wantThrow && !onScreen) { s.wantThrow = false; s.chainNext = null; s.nextThrowAt = gt + 800; } // 降りている間に画面の外へ出た=やり直し(台本も旗から)
    if (s.wantThrow) {
      landReq = true;
    } else if (!inInner(bx, by, 60)) {
      // 画面の外にいたら寄る(帯より画面に入ることを優先・§8 A8)。
      const pl = st.player;
      wantH = Math.atan2(pl.y + pl.height / 2 - by, pl.x + pl.width / 2 - bx);
      wantS = vmax;
    } else {
      const pull = astroBandPull(tgt.d);
      if (pull > 0) { wantH = Math.atan2(tgt.y - by, tgt.x - bx); wantS = astroArriveSpeed(pull, vmax); }
      else if (pull < 0) {
        const away = Math.atan2(by - tgt.y, bx - tgt.x);
        // 離れると画面の外へ出てしまう時は離れない(画面に入っていることを優先)。
        if (inInner(bx + Math.cos(away) * 60, by + Math.sin(away) * 60, 40)) { wantH = away; wantS = astroArriveSpeed(-pull, vmax); }
      }
    }
  } else if (e.astroRingR !== undefined) {
    // 対策室・ボス戦テスト: 置いた場所を下端にした小さな輪を回る(休まない)。
    const cx = e.astroRingCx ?? bx, cy = e.astroRingCy ?? by, R = e.astroRingR;
    const a = Math.atan2(by - cy, bx - cx) - 0.5;
    wantH = Math.atan2(cy + Math.sin(a) * R - by, cx + Math.cos(a) * R - bx);
    wantS = vmax;
  } else {
    if (s.pois.length === 0) s.pois = astroRunPois();
    if (s.resting) {
      landReq = true;
      if (anim0.frame === 0 && s.restUntil === null) s.restUntil = gt + rand(ASTRO_REST_MIN_MS, ASTRO_REST_MAX_MS);
      if (s.restUntil !== null && gt >= s.restUntil) {
        s.resting = false; s.restUntil = null;
        s.prevPoi = s.poiIdx; s.poiIdx = pickAstroPoi(s.pois.length, s.prevPoi, Math.random);
        s.stuckAt = gt; s.stuckD = Infinity;
      }
    } else {
      if (s.poiIdx === null) { s.poiIdx = pickAstroPoi(s.pois.length, s.prevPoi, Math.random); s.stuckAt = gt; s.stuckD = Infinity; }
      const p = s.pois[s.poiIdx];
      const d = Math.hypot(p.x - bx, p.y - by);
      if (d <= ASTRO_ARRIVE_PX) {
        s.resting = true; s.restUntil = null; landReq = true;
      } else {
        wantH = Math.atan2(p.y - by, p.x - bx);
        wantS = astroArriveSpeed(Math.max(0, d - ASTRO_ARRIVE_PX * 0.5), vmax);
        if (s.stuckD === Infinity) { s.stuckD = d; s.stuckAt = gt; }
        else if (gt - s.stuckAt >= ASTRO_STUCK_MS) {
          if (s.stuckD - d < ASTRO_STUCK_PX) { s.prevPoi = s.poiIdx; s.poiIdx = pickAstroPoi(s.pois.length, s.prevPoi, Math.random); s.stuckD = Infinity; }
          else s.stuckD = d;
          s.stuckAt = gt;
        }
      }
    }
  }

  if (periodicLand) landReq = true;

  // ---- 慣性つきの速さ ----
  const canMove = astroCanMove(anim0.frame) && !throwing && !collapse && !held;
  if (landReq || !canMove) wantS = 0;
  if (collapse || held) s.speed = Math.max(0, s.speed - (vmax / ASTRO_DECEL_S) * 3 * dt); // 崩れて落ちる=止まりも速い
  const v = stepAstroVelocity({ heading: s.heading, speed: s.speed }, { heading: wantH, speed: wantS }, vmax, dt);
  s.heading = v.heading; s.speed = v.speed;

  // ---- 浮遊のコマ(降りるのは止まり切ってから・崩れた時はすぐ) ----
  const groundNow = collapse || held || throwing || (landReq && s.speed < vmax * ASTRO_STOPPED_FRAC);
  const anim = stepAstroHover(anim0, !groundNow, dt * 1000, collapse || held);
  // 着地と浮き上がりの合図(クリエイティブ監査#10「降りたら来る」が見えも聞こえもしない): 着地=重い音+噴射で巻き上がる土の輪、
  // 浮き上がり=足元に紫の噴射の飛沫。崩れて落ちた時は音を重く(どちらも派手さの絵・判定なし)。
  if (anim0.frame > 0 && anim.frame === 0) {
    const fy = e.y + e.height;
    const pl = st.player;
    const g = npcSfxDistGain(bx, fy, pl.x + pl.width / 2, pl.y + pl.height / 2, st.camera, st.gameBounds);
    // この敵だけの着地音(ほかの敵のジャンプの着地と聞き分ける): 重い地響きを低く+金属の足が土を噛む音。
    if (g > 0.01) {
      playSfx('heavy-impact', (collapse || held ? 0.85 : 0.6) * g, undefined, collapse || held ? 0.7 : 0.82);
      playSfx('anchor-plant', 0.5 * g, undefined, 0.72);
    }
    st.spawnRing(bx, fy, 14, 110 + Math.random() * 30, 'rgba(120,102,84,0.5)', 5, 520);
    // 土煙は左右で量も位置も変える(噴射の向きの側=後ろへ多く巻き上がる)。
    const back = (e.heroFaceX ?? -1) >= 0 ? -1 : 1;
    st.spawnBurst(bx + back * (24 + Math.random() * 16), fy, '#a8927a', 14 + Math.floor(Math.random() * 6), 0, -1);
    st.spawnBurst(bx - back * (18 + Math.random() * 14), fy, '#8f7b66', 6 + Math.floor(Math.random() * 5), 0, -1);
  } else if (anim0.frame === 2 && anim.frame === 3) {
    // 浮き上がりの噴射: 絵の噴射に合わせた淡い藤色の白熱(攻撃の紫と取り違えない明るさ・監査2巡目#1)。
    const back = (e.heroFaceX ?? -1) >= 0 ? -1 : 1;
    st.spawnBurst(bx + back * 20, e.y + e.height, '#ede4ff', 10 + Math.floor(Math.random() * 6), 0, -1);
    st.spawnRing(bx, e.y + e.height, 8, 60 + Math.random() * 20, 'rgba(237,228,255,0.5)', 3, 360);
  }
  if (anim.frame !== anim0.frame || anim.acc !== anim0.acc || anim.dir !== anim0.dir) {
    Object.assign(patch, { astroHoverFrame: anim.frame, astroHoverAcc: anim.acc, astroHoverDir: anim.dir });
  }

  // ---- 動く(障害物 → 行ける帯。まっすぐ進めない時は斜めへ逸れる) ----
  if (s.speed > 0.01) {
    const step = s.speed * dt;
    const ux = Math.cos(s.heading), uy = Math.sin(s.heading);
    let p = placeAt(e, bx + ux * step, by + uy * step);
    const gain = (q: { x: number; y: number }) => (q.x + e.width / 2 - bx) * ux + (q.y + e.height / 2 - by) * uy;
    if (gain(p) < step * 0.35) {
      for (const deg of [40, -40, 75, -75]) {
        const a = (deg * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
        const rx = ux * ca - uy * sa, ry = ux * sa + uy * ca;
        const c = placeAt(e, bx + rx * step, by + ry * step);
        if (Math.hypot(c.x + e.width / 2 - bx, c.y + e.height / 2 - by) > step * 0.6) { p = c; break; }
      }
    }
    Object.assign(patch, p, { vx: ux * s.speed, vy: uy * s.speed });
  } else if (e.vx !== 0 || e.vy !== 0) {
    Object.assign(patch, { vx: 0, vy: 0 });
  }

  // ---- 向き ----
  if (!throwing) {
    if (alerted) patch.heroFaceX = bossFaceWant(((e.heroFaceX ?? -1) >= 0 ? 1 : -1), bx, tgt.x, bossFaceDeadzonePx(e.width));
    else if (s.speed > 5 && Math.abs(Math.cos(s.heading)) >= 0.3) patch.heroFaceX = Math.cos(s.heading) >= 0 ? 1 : -1;
  }

  // ---- 投げ始め(着地し切った=0コマ) ----
  if (s.wantThrow && !throwing && !collapse && !held && anim.frame === 0 && onScreen && alerted) {
    // 台本(着地したら旗 → 立ったまま破片の雨)。ピンチ(体力半分以下)は破片の雨が2倍(社長指示2026-10-30)。
    const kind = s.chainNext ?? ASTRO_SCRIPT[0];
    s.chainNext = null;
    const id = `astro-${e.id}-${++s.seq}`;
    const entries = astroThrowPlan(kind, id, e.id, { x: bx, y: by }, { x: tgt.x, y: tgt.y }, gt, Math.random, astroDebrisCount(isAstroPinch(e.health, e.maxHealth)));
    if (kind === 'bouquet' && tgt.ghost) for (const en of entries) en.toGhost = true;
    useGameStore.setState(stt => ({ astroThrows: [...stt.astroThrows, ...entries] }));
    Object.assign(patch, {
      astroThrowAt: gt, astroThrowKind: kind,
      heroFaceX: bossFaceWant(((e.heroFaceX ?? -1) >= 0 ? 1 : -1), bx, tgt.x, bossFaceDeadzonePx(e.width)),
    });
    s.curThrowId = id; s.released = false; s.lastKind = kind; s.wantThrow = false; s.nextThrowAt = null;
    if (kind === 'meteor') s.meteorReadyAt = gt + ASTRO_METEOR_COOLDOWN_MS;
  }

  if (Object.keys(patch).length > 0) {
    useGameStore.setState(stt => ({ enemies: stt.enemies.map(en => (en.id === e.id ? { ...en, ...patch } : en)) }));
  }
};

/** いま場にいる宇宙飛行群(死体・倒れた個体は除く)。 */
export const pickActiveAstro = (enemies: readonly Enemy[]): Enemy | undefined =>
  enemies.find(e => e.type === 'mutant-astro' && !isCorpse(e) && e.health > 0);

/** 投げ手が倒れた/消えた: 手を離す前の投げは消す(離した後の物は台帳に残って最後まで当たる)。 */
export const releaseAstroOwner = (s: AstroTickState, gt: number): void => {
  if (s.activeId === null) return;
  const e = useGameStore.getState().enemies.find(en => en.id === s.activeId);
  if (e && !isCorpse(e) && e.health > 0) return;
  dropThrow(s.curThrowId, gt);
  Object.assign(s, createAstroTickState());
};

// ---- 台帳の解決(投げ手と別=倒れた後も回る) ----
let lastMeteorShakeAt = -1e9;
let lastMeteorRumbleAt = -1e9;

const blastOf = (t: AstroThrowEntry): PumpkinBlast => {
  const base: PumpkinBlast = { x: t.x, y: t.y, radius: t.radius, damage: t.damage, enemyId: t.ownerId, moveKey: `astro-${t.kind}` };
  if (t.kind === 'meteor') return { ...base, noParry: true };
  // 周りに降り注ぐ残骸(技ではない方)は紫=弾けない(社長指示2026-10-29「技じゃない方の破片は紫(カウンター不可)」)。
  if (t.ambient) return { ...base, noParry: true };
  // 赤=弾ける。弾いた効果はプレイヤー側だけ(遠くの投げ手には何も起きない=矢の雨と同じ)。
  const parry = { parryLocal: true as const, parryNoDamage: true as const };
  if (t.kind === 'flag' && t.capsule) return { ...base, ...parry, capsule: t.capsule, origin: { x: t.capsule.fx, y: t.capsule.fy } };
  return { ...base, ...parry };
};

/** 隕石の巻き添え: 範囲内の敵(英雄・投げ手自身・眠っている個体を除く)と壊せる物(§8 A9)。 */
const meteorCollateral = (t: AstroThrowEntry): void => {
  const st = useGameStore.getState();
  const victims = st.enemies.filter(e => e.id !== t.ownerId && !isMutantHero(e.type) && !isCorpse(e) && e.health > 0 && !e.dormant
    && Math.hypot(e.x + e.width / 2 - t.x, e.y + e.height / 2 - t.y) <= t.radius + Math.max(e.width, e.height) / 2);
  for (const e of victims) {
    const ex = e.x + e.width / 2, ey = e.y + e.height / 2;
    const killed = useGameStore.getState().damageEnemy(e.id, t.damage, false, false, false, null, 'neutral');
    useGameStore.getState().spawnDamageNumber(ex, e.y, t.damage, false, { enemyId: e.id });
    if (killed) {
      const g = useGameStore.getState();
      g.dropEnemyCurrency(e, ex, ey);
      g.dropEnemyXp(e, ex, ey, 'pickup-xp-astro');
    }
  }
  useGameStore.getState().breakPropsAlong(t.x, t.y, 1, 0, 0, t.radius, 9999);
};

/** 花束が着いた: プレイヤーの中心が輪の中なら小回復+跳ね返る。守護霊へ向いた花束は跳ね返るだけ。 */
const landBouquet = (t: AstroThrowEntry): boolean => {
  const st = useGameStore.getState();
  if (t.toGhost) {
    const g = st.summons.find(s => s.kind === 'ghost-ally');
    return !!g && Math.hypot(g.x + g.width / 2 - t.x, g.y + g.height / 2 - t.y) <= t.radius;
  }
  const p = st.player;
  if (p.health <= 0) return false;
  const pcx = p.x + p.width / 2, pcy = p.y + p.height / 2;
  if (Math.hypot(pcx - t.x, pcy - t.y) > t.radius) return false;
  const heal = Math.max(1, Math.round(p.maxHealth * ASTRO_BOUQUET_HEAL_FRAC));
  const healed = Math.min(p.maxHealth, p.health + heal) - p.health;
  useGameStore.setState(s2 => ({ player: { ...s2.player, health: Math.min(s2.player.maxHealth, s2.player.health + heal) } }));
  // 怪物から花を受け取る=この敵でいちばん奇妙な瞬間。回復アイテムの緑ではなく弔いの花の白、音も低く(クリエイティブ監査#27)。
  if (healed > 0) st.spawnCallout(pcx, p.y - 14, `+${healed}`, '#f2ece2');
  st.spawnBurst(pcx, pcy - 10, '#f2ece2', 12);
  st.spawnBurst(pcx, pcy - 10, '#7f1d1d', 8);
  playSfx('pickup', 0.9, undefined, 0.6);
  return true;
};

/**
 * 台帳を1フレーム進める: 命中の時刻が来た物を当て(爆風を積む/花束は回復)、残る絵の時間が過ぎた物を消す。
 * 隕石が降りてくる間は、画面の揺れを着弾へ向けて強める(派手さの絵)。
 */
export const runAstroThrows = (gt: number): void => {
  const st = useGameStore.getState();
  const list = st.astroThrows;
  if (list.length === 0) return;
  let changed = false;
  const blasts: PumpkinBlast[] = [];
  const out: AstroThrowEntry[] = [];
  let shake = 0;
  for (const t of list) {
    if (!t.resolved && gt >= t.hitAt) {
      changed = true;
      if (t.kind === 'bouquet') out.push({ ...t, resolved: true, bounced: landBouquet(t) });
      else {
        blasts.push(blastOf(t));
        if (t.kind === 'meteor') { meteorCollateral(t); useGameStore.getState().triggerShake(900, 22); }
        out.push({ ...t, resolved: true });
      }
    } else if (t.resolved && gt > t.hitAt + astroLingerMs(t.kind)) {
      changed = true;
    } else {
      out.push(t);
      if (!t.resolved && t.kind === 'meteor' && gt >= t.releaseAt) shake = Math.max(shake, astroMeteorShake(t.hitAt - gt));
    }
  }
  if (gt < lastMeteorShakeAt) { lastMeteorShakeAt = -1e9; lastMeteorRumbleAt = -1e9; } // ランを跨いだ
  if (shake > 0 && gt - lastMeteorShakeAt >= 200) {
    lastMeteorShakeAt = gt;
    useGameStore.getState().triggerShake(320, Math.round(2 + 12 * shake));
    // 地鳴り: 揺れに合わせて低い唸りを強めていく(設計 §5・品質監査 C3)。
    // 間隔は着弾へ向けて詰め、毎回少し揺らす(メトロノームにしない)。
    if (gt - lastMeteorRumbleAt >= (700 - 450 * shake) * (0.8 + Math.random() * 0.4)) {
      lastMeteorRumbleAt = gt;
      playSfx('heavy-impact', 0.12 + 0.5 * shake, undefined, 0.4 + Math.random() * 0.12);
    }
  }
  if (changed) useGameStore.setState(s2 => ({ astroThrows: out, pumpkinBlasts: blasts.length > 0 ? [...s2.pumpkinBlasts, ...blasts] : s2.pumpkinBlasts }));
};

// ---- 周りに降り注ぐ残骸(§12-1) ----
const rainState: AstroRainState = { nextAt: 0, seq: 0 };
let rainLastGt = 0;
/**
 * 宇宙飛行群の周りに降り注ぐ残骸を進める(毎フレーム)。プレイヤーが近い間だけ1〜1.5秒に1枚降らせる。
 * 1枚ごとに当たり(技の残骸と同じ大きさ・ダメージ・弾ける)を、降り始めに赤い予告つきで投げ物の台帳へ積む(刺さる瞬間に消え切る)。
 * 当たりの絵は描かない(`ambient`)=空から落ちる絵と刺さった絵はこの台帳(`astroScatter`)が描く。
 */
export const runAstroScatter = (gt: number): void => {
  if (gt < rainLastGt) { rainState.nextAt = 0; rainState.wasNear = false; rainState.lastAt = undefined; } // ランを跨いだ(時計が戻った)
  rainLastGt = gt;
  const st = useGameStore.getState();
  const a = pickActiveAstro(st.enemies);
  if (!a && st.astroScatter.length === 0) { rainState.wasNear = false; return; } // 居ない間は「近い」を持ち越さない(次に現れた時の1枚目)
  const p = st.player;
  const astro = a ? { x: a.x + a.width / 2, y: a.y + a.height } : null;
  // 建物・木・岩に埋まらない所だけ(立てる所の判定=レスキューの出現位置と同じ使い方)。
  const canPlace = (x: number, y: number) => { const r = resolveBountyMove(x - 20, y - 20, { width: 40, height: 40 }); return Math.hypot(r.x - (x - 20), r.y - (y - 20)) < 2; };
  const next = astroRainStep(st.astroScatter, astro, { x: p.x + p.width / 2, y: p.y + p.height / 2 }, canPlace, gt, Math.random, rainState);
  if (next === st.astroScatter) return;
  const old = new Set(st.astroScatter.map(q => q.id));
  const hits: AstroThrowEntry[] = a ? next.filter(q => !old.has(q.id)).map(q => ({
    id: q.id, throwId: q.id, ownerId: a.id, kind: 'debris', ambient: true,
    bornAt: q.bornAt, releaseAt: q.bornAt, hitAt: q.landAt, fromX: astro!.x, fromY: astro!.y,
    x: q.x, y: q.y, radius: ASTRO_DEBRIS_RADIUS, damage: ASTRO_DEBRIS_DAMAGE, variant: q.variant,
  })) : [];
  useGameStore.setState(s2 => ({ astroScatter: next, ...(hits.length > 0 ? { astroThrows: [...s2.astroThrows, ...hits] } : {}) }));
};
