// 解放軍群(変異)のコントローラ(research/LIBERTY_HORDE.md)。useGameLoop が毎フレーム1回呼ぶ。
// 流儀は英雄(heroTick)と同じ「store を読んで patch を書く」。旗手と、列に並ぶ/戻るバット男を動かすのはここだけ
// (updateEnemies は旗手と isHordeFollower を素通り)。向かっていく(chase)バット男は通常AIへ任せる。
//
// 掟:
//  - 移動は必ず ①障害物(resolveBountyMove)→ ②行ける帯(clampRectToPlayableArea)の順で通す。
//  - 旗手の攻撃は旗振りだけ(プレイヤーが体の縁から120px以内・§4b)。叫ぶのは画面に入っている時だけ(見つける条件に「画面内」を含む)。
import type { Enemy } from '../types/game';
import { useGameStore, resolveBountyMove, SCREAMER_WINDUP_MS, SCREAMER_BUFF_MS, screamerWindupFx, screamerCryFx, cancelScreamerWindupFx, type PumpkinBlast } from '../store/gameStore';
import { clampRectToPlayableArea, type PlayableAreaCtx } from '../world/playableArea';
import { isCorpse, spawnEnemyAtWithTier } from './enemyUtils';
import { isPointInZoomedViewport, zoomedViewportBounds } from './cameraZoom';
import { HERO_AGGRO_RANGE, HERO_PATROL_SPEED, HERO_STRIKE_MS, HERO_FLINCH_MS, heroPatrolNext, heroRestMs } from './heroScript';
import { HERO_PATROL_DETOUR_PX, HERO_PATROL_DETOUR_MS } from './heroTick';
import {
  LIB_ESCORTS, LIB_SLOT_GAP_PX, LIB_TRAIL_STEP_PX, LIB_TRAIL_MAX, LIB_LOSE_RANGE_MULT, LIB_LOSE_MS,
  LIB_RETURN_SPEED, LIB_RETURN_ARRIVE_PX, LIB_REFILL_BEHIND_PX, LIB_RETURN_EASE_PER_S, LIB_BEARER_ACCEL,
  LIB_HEAD_PX, LIB_SCREAM_FX_SCALE, LIB_HIT_ALERT_MS, LIB_RETREAT_RANGE_PX, LIB_RETREAT_SPEED, LIB_TURN_PER_S, libRetreatDir,
  LIB_VOLLEY_CAST_MS, LIB_VOLLEY_COOLDOWN_MS, LIB_VOLLEY_FIRST_DELAY_MS, LIB_ARROW_RADIUS, LIB_ARROW_DAMAGE, LIB_ARROW_STUCK_MS,
  libVolleyArrows, type LibArrow,
  LIB_FLAG_TRIGGER_PX, LIB_FLAG_WINDUP_MS, LIB_FLAG_RECOVER_MS, LIB_FLAG_COOLDOWN_MS, LIB_FLAG_DAMAGE, edgeDistToRectPt, libFlagFan,
  trailPointAt, maleBatId, hordeJitter,
} from './libertyScript';

export interface LibertyTickState {
  activeId: string | null;
  trail: { x: number; y: number }[];
  lostSince: number | null;
  stallRefAt: number; stallRefAng: number; stallRefX: number; stallRefY: number;
  detourR: number; detourUntil: number;
  /** 歩きの速さ(加減速つき)と、最後に進んだ向き(止まる間はこの向きのまま減速する)。 */
  speed: number; dirX: number; dirY: number;
  /** いま出ている溜めの予兆のID(崩されたら消す)。 */
  windupFx: string[];
  /** 今の交戦で叫んだ回数(2回目以降は画面の明滅・揺れを弱める)。 */
  cries: number;
  /** 矢の雨: まだ予告が出ていない矢(予告の出る時刻順)・見つけた時刻(最初の号令の起点)。 */
  volleyQueue: LibArrow[];
  alertSince: number | null;
}
export const createLibertyTickState = (): LibertyTickState => ({
  activeId: null, trail: [], lostSince: null,
  stallRefAt: -1e9, stallRefAng: 0, stallRefX: 0, stallRefY: 0, detourR: 0, detourUntil: 0,
  speed: 0, dirX: 0, dirY: 0, windupFx: [], cries: 0, volleyQueue: [], alertSince: null,
});

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
/** 中心座標を、その体が立てる左上座標へ(①障害物 → ②行ける帯)。 */
const placeAt = (e: Enemy, cx: number, cy: number): { x: number; y: number } => {
  const c = resolveBountyMove(cx - e.width / 2, cy - e.height / 2, { width: e.width, height: e.height });
  return clampRectToPlayableArea(c.x, c.y, e.width, e.height, playCtx());
};

const isFrozen = (e: Enemy, gt: number, nowMs: number): boolean =>
  (e.bossFullStunUntil !== undefined && gt < e.bossFullStunUntil)
  || (e.stunUntil !== undefined && gt < e.stunUntil)
  || (e.rootUntil !== undefined && gt < e.rootUntil)
  || (e.liftUntil !== undefined && nowMs < e.liftUntil)
  || (e.knockbackUntil !== undefined && nowMs < e.knockbackUntil);

/** 旗手のいちばん近い見つける相手(プレイヤー/守護霊)までの距離と、その相手のx。画面内の者だけ。 */
const sightDist = (bx: number, by: number): { d: number; x: number } => {
  const st = useGameStore.getState();
  const vis = (x: number, y: number) => isPointInZoomedViewport(x, y, st.camera, st.gameBounds, st.viewZoom);
  let best = Infinity, bestX = bx;
  const p = st.player;
  if (p.health > 0) {
    const px = p.x + p.width / 2, py = p.y + p.height / 2;
    const d = Math.hypot(px - bx, py - by);
    if (vis(px, py) && d < best) { best = d; bestX = px; }
  }
  const g = st.summons.find(s => s.kind === 'ghost-ally');
  if (g) {
    const gx = g.x + g.width / 2, gy = g.y + g.height / 2;
    const d = Math.hypot(gx - bx, gy - by);
    if (vis(gx, gy) && d < best) { best = d; bestX = gx; }
  }
  return { d: best, x: bestX };
};

/** 取り巻きのバット男を1体作る(赤レア・男の見た目・旗手のIDを持つ)。 */
export const makeHordeBat = (leader: Enemy, slot: number, x: number, y: number, gt: number, refill: boolean, chase: boolean): Enemy => {
  // 強さ・宝のランクは置く場所の区域で決まる(原点で作ると深層域に区域0の弱いコウモリが並ぶ・品質監査 A-2)。
  const b = spawnEnemyAtWithTier('bat', x, y, gt, 'red');
  const id = maleBatId(b.id);
  return {
    ...b, id,
    x: x - b.width / 2, y: y - b.height / 2,
    dormant: false,
    fixed: true, // 上限の間引き・距離の回収・イベントの一掃で消さない(別カウント・LIBERTY_HORDE §6)
    hordeLeaderId: leader.id, hordeSlot: slot, hordeRefill: refill,
    hordeState: chase ? 'chase' : 'follow',
  };
};

/**
 * 旗手1体ぶんの1フレーム。
 */
export const runLibertyTick = (bearer: Enemy, s: LibertyTickState, gt: number, dt: number, nowMs: number): void => {
  if (s.activeId !== bearer.id) Object.assign(s, createLibertyTickState(), { activeId: bearer.id });
  const st = useGameStore.getState();
  const bx = bearer.x + bearer.width / 2, by = bearer.y + bearer.height / 2;
  const patch: Partial<Enemy> = {};
  const frozen = isFrozen(bearer, gt, nowMs);

  // ---- 足跡(バット男が並ぶ道) ----
  const lastT = s.trail[s.trail.length - 1];
  if (!lastT || Math.hypot(bx - lastT.x, by - lastT.y) >= LIB_TRAIL_STEP_PX) {
    s.trail.push({ x: bx, y: by });
    if (s.trail.length > LIB_TRAIL_MAX) s.trail.shift();
  }

  // ---- 見つける / 見失う ----
  const onScreen = isPointInZoomedViewport(bx, by, st.camera, st.gameBounds, st.viewZoom);
  const sight = onScreen ? sightDist(bx, by) : { d: Infinity, x: bx };
  const d = sight.d;
  const wasAlerted = bearer.libAlerted === true;
  let alerted = wasAlerted;
  // 殴られた(旗手か、列のコウモリが)ら、それも「見つけた」(索敵の外から一方的に削れる的にしない・品質監査 A-3)。
  const hitRecently = (e: Enemy) => nowMs - (e.lastHit ?? 0) <= LIB_HIT_ALERT_MS;
  const struck = hitRecently(bearer)
    || st.enemies.some(e => e.hordeLeaderId === bearer.id && !isCorpse(e) && e.health > 0 && hitRecently(e));
  if (d <= HERO_AGGRO_RANGE || struck) { alerted = true; s.lostSince = null; }
  else if (wasAlerted) {
    if (d > HERO_AGGRO_RANGE * LIB_LOSE_RANGE_MULT || !onScreen) {
      if (s.lostSince === null) s.lostSince = gt;
      if (gt - s.lostSince >= LIB_LOSE_MS) { alerted = false; s.lostSince = null; }
    } else s.lostSince = null;
  }
  if (alerted !== wasAlerted) patch.libAlerted = alerted;
  if (alerted && !wasAlerted) s.cries = 0;
  // 叫喚の発生点=口のあたり(足元から上)。寸法は旗手の背丈に合わせて広げる。
  const fxX = bx, fxY = bearer.y + bearer.height - LIB_HEAD_PX;
  const cancelWindup = () => {
    if (bearer.libScreamUntil !== undefined) patch.libScreamUntil = undefined;
    cancelScreamerWindupFx(s.windupFx); s.windupFx = [];
  };
  // 社長指示2026-10-04: プレイヤーが体の縁から100px以内に来たら、ゆっくり距離を取る(見つけている時も周回中も)。
  // 向きはプレイヤーの反対側へ少しずつ寄せる(急に向きが跳ばない)。叫びの溜めは続く(下がりながら叫ぶ)。
  const pl = st.player;
  const away = pl.health > 0
    ? libRetreatDir(bearer, pl.x + pl.width / 2, pl.y + pl.height / 2, LIB_RETREAT_RANGE_PX)
    : null;
  const retreatStep = (): void => {
    if (!away) return;
    const k = Math.min(1, LIB_TURN_PER_S * dt);
    const hx = s.speed > 1 ? s.dirX + (away.x - s.dirX) * k : away.x;
    const hy = s.speed > 1 ? s.dirY + (away.y - s.dirY) * k : away.y;
    const hl = Math.hypot(hx, hy) || 1;
    s.dirX = hx / hl; s.dirY = hy / hl;
    s.speed = Math.min(LIB_RETREAT_SPEED, s.speed + LIB_BEARER_ACCEL * dt);
  };
  // ---- 旗振り(社長指示2026-10-04・LIBERTY_HORDE §4b) ----
  // プレイヤーが体の縁から120px以内に来たら、溜め(赤い扇の予告=溜めの開始で出て、当たる瞬間に消え切る)→
  // 振り抜き(扇の爆風=カウンターできる赤)→残心→間隔。州と形は英雄の器(hero-windup/strike/recover・heroShape)を使う
  // =予告と旗の振りの絵は英雄と同じ描画が出す。崩し(紫)・気絶で溜めは消える。振っている間は動かない。
  const atk = bearer.bossState;
  const stunned = (bearer.bossFullStunUntil !== undefined && gt < bearer.bossFullStunUntil)
    || (bearer.stunUntil !== undefined && gt < bearer.stunUntil);
  let attacking = false;
  if (bearer.bossMoveCutPending) {
    // カウンターで弾かれた(社長裁定2026-10-04「英雄と同じく」): 怯んで少し後ずさる(700ms・40px)→ 長めの休み。
    const back = -((bearer.heroFaceX ?? -1) as number) * 40;
    Object.assign(patch, {
      bossMoveCutPending: false, bossState: 'hero-flinch', bossStateUntil: gt + HERO_FLINCH_MS, heroStateAt: gt,
      heroShape: undefined, heroHitAt: undefined, libFlagReadyAt: gt + HERO_FLINCH_MS + heroRestMs('countered'),
      heroFromX: bx, heroFromY: by, heroToX: bx + back, heroToY: by,
    });
    attacking = true;
  } else if (atk === 'hero-flinch') {
    // 怯み: 弾かれた勢いで後ずさる(速く出てゆっくり止まる=慣性)。終わったら元の動きへ。
    if (gt >= (bearer.bossStateUntil ?? 0)) patch.bossState = undefined;
    else {
      attacking = true;
      const u = Math.min(1, (gt - (bearer.heroStateAt ?? gt)) / HERO_FLINCH_MS);
      const e2 = 1 - Math.pow(1 - u, 3);
      const fx = bearer.heroFromX ?? bx, fy = bearer.heroFromY ?? by, tx = bearer.heroToX ?? bx, ty = bearer.heroToY ?? by;
      Object.assign(patch, placeAt(bearer, fx + (tx - fx) * e2, fy + (ty - fy) * e2));
    }
  } else if (atk === 'hero-windup' || atk === 'hero-strike' || atk === 'hero-recover') {
    if (stunned) {
      Object.assign(patch, { bossState: undefined, heroShape: undefined, heroHitAt: undefined, libFlagReadyAt: gt + LIB_FLAG_COOLDOWN_MS });
    } else {
      attacking = true;
      if (atk === 'hero-windup' && bearer.heroHitAt !== undefined && gt >= bearer.heroHitAt) {
        if (bearer.heroShape) pushFlagBlast(bearer, bearer.heroShape);
        Object.assign(patch, { bossState: 'hero-strike', heroStateAt: gt, bossStateUntil: gt + HERO_STRIKE_MS, heroShape: undefined, heroHitAt: undefined });
      } else if (atk === 'hero-strike' && gt >= (bearer.bossStateUntil ?? 0)) {
        Object.assign(patch, { bossState: 'hero-recover', heroStateAt: gt, bossStateUntil: gt + LIB_FLAG_RECOVER_MS });
      } else if (atk === 'hero-recover' && gt >= (bearer.bossStateUntil ?? 0)) {
        Object.assign(patch, { bossState: undefined, libFlagReadyAt: gt + LIB_FLAG_COOLDOWN_MS });
        attacking = false;
      }
    }
  } else if (!stunned && !(bearer.liftUntil !== undefined && nowMs < bearer.liftUntil)
    && pl.health > 0 && onScreen && gt >= (bearer.libFlagReadyAt ?? 0)) {
    // 社長裁定2026-10-04「7は殴られながらでも振る」: 殴られた時の短いノックバック中でも振り始める(崩し・気絶・打ち上げ中は振らない)。
    const pcx2 = pl.x + pl.width / 2, pcy2 = pl.y + pl.height / 2;
    if (edgeDistToRectPt(bearer, pcx2, pcy2) <= LIB_FLAG_TRIGGER_PX) {
      Object.assign(patch, {
        bossState: 'hero-windup', heroMove: 'sweep', heroStep: 0, heroShape: libFlagFan(bearer, pcx2, pcy2),
        bossWindupStartAt: gt, heroStateAt: gt, heroHitAt: gt + LIB_FLAG_WINDUP_MS, bossStateUntil: gt + LIB_FLAG_WINDUP_MS,
        heroFaceX: (pcx2 >= bx ? 1 : -1) as 1 | -1,
      });
      attacking = true;
    }
  }

  // ---- 矢の雨(社長指示2026-10-04「全射程で、上から矢がランダムに沢山振って来る広範囲攻撃」・LIBERTY_HORDE §4c) ----
  // 見つけている間、間隔ごとに旗手が立ち止まって号令(0.7秒)→ 見えている画面いっぱい+相手の近くへ矢が降る。
  // 1本ごとに赤い円(流星)が出て、消え切った瞬間に刺さる(予告が出る時刻=その矢の溜めの開始・刺さる時刻は矢ごと)。
  // 予告の出た矢は `giantDelayedHits`(守護霊の回避が読む既存の器)に載せ、刺さったら扇ではなく小円の爆風を積む。
  if (alerted && s.alertSince === null) s.alertSince = gt;
  if (!alerted) s.alertSince = null;
  const casting = bearer.libVolleyCastUntil !== undefined && gt < bearer.libVolleyCastUntil;
  if (casting) attacking = true;
  else if (alerted && !attacking && !stunned && onScreen && s.alertSince !== null
    && gt >= (bearer.libVolleyReadyAt ?? s.alertSince + LIB_VOLLEY_FIRST_DELAY_MS)) {
    const vb = zoomedViewportBounds(st.camera, st.gameBounds, st.viewZoom);
    s.volleyQueue.push(...libVolleyArrows(vb, { x: pl.x + pl.width / 2, y: pl.y + pl.height / 2 }, gt, Math.random));
    s.volleyQueue.sort((a, b) => a.bornAt - b.bornAt);
    Object.assign(patch, { libVolleyCastUntil: gt + LIB_VOLLEY_CAST_MS, libVolleyReadyAt: gt + LIB_VOLLEY_COOLDOWN_MS, vx: 0, vy: 0 });
    attacking = true;
    // 号令の合図(派手さの絵): 旗の高さから骨色の輪が二重に広がる。
    const g0 = useGameStore.getState();
    g0.spawnRing(bx, bearer.y + bearer.height - LIB_HEAD_PX, 12, 300, 'rgba(216,200,176,0.8)', 4, 560);
    g0.spawnRing(bx, bearer.y + bearer.height - LIB_HEAD_PX, 8, 190, 'rgba(127,29,29,0.75)', 3, 420);
  }
  {
    const hits = bearer.giantDelayedHits ?? [];
    let changed = false;
    const keep: NonNullable<Enemy['giantDelayedHits']> = [];
    let stuck = (bearer.libArrowStuck ?? []).filter(a => gt - a.at < LIB_ARROW_STUCK_MS);
    if (stuck.length !== (bearer.libArrowStuck ?? []).length) changed = true;
    for (const h of hits) {
      if (h.moveKey === 'liberty-arrow' && gt >= h.fireAt) {
        pushArrowBlast(bearer, h.x, h.y, h.radius);
        stuck = [...stuck, { x: h.x, y: h.y, at: gt, tilt: (Math.random() - 0.5) * 0.5 }];
        changed = true;
      } else keep.push(h);
    }
    while (s.volleyQueue.length > 0 && s.volleyQueue[0].bornAt <= gt) {
      const a = s.volleyQueue.shift()!;
      keep.push({ x: a.x, y: a.y, radius: LIB_ARROW_RADIUS, bornAt: a.bornAt, fireAt: a.fireAt, moveKey: 'liberty-arrow', damage: LIB_ARROW_DAMAGE });
      changed = true;
    }
    if (changed) Object.assign(patch, { giantDelayedHits: keep, libArrowStuck: stuck });
  }

  /** 今の向き(dirX/dirY)へ speed で1フレーム進む(障害物→行ける帯)。 */
  const stepAlong = () => {
    const step = s.speed * dt;
    if (step <= 0) { Object.assign(patch, { vx: 0, vy: 0 }); return; }
    Object.assign(patch, placeAt(bearer, bx + s.dirX * step, by + s.dirY * step), { vx: s.dirX * s.speed, vy: s.dirY * s.speed });
  };

  // ---- 旗手の動き ----
  if (frozen) {
    // ノックバック・持ち上げ・気絶の間は動かない。**溜めを消すのは体勢崩し(紫)だけ**(品質監査 A-1:
    // 銃も刀も当たるたびに短いノックバックを書くので、これで消すと殴り続けるだけで永久に叫ばない)。
    // 消す時は予兆も消す(輪が完成して叫ばない=予告の嘘を作らない)。
    Object.assign(patch, { vx: 0, vy: 0 });
    s.speed = 0;
    if ((bearer.bossFullStunUntil !== undefined && gt < bearer.bossFullStunUntil) || attacking) cancelWindup();
    else if (alerted && bearer.libScreamUntil !== undefined && gt >= bearer.libScreamUntil) {
      patch.libScreamUntil = undefined;
      s.windupFx = [];
      useGameStore.setState({ screamerBuffUntil: gt + SCREAMER_BUFF_MS });
      screamerCryFx(fxX, fxY, { scale: LIB_SCREAM_FX_SCALE, repeat: s.cries > 0 });
      s.cries++;
    }
  } else if (alerted) {
    // その場に止まり(歩きの勢いを0.3秒ほどで殺す)、見つけた相手の方を向いて叫ぶ。
    // 見つけた瞬間の1回目は無条件で溜めへ(全体で1本のバフに握られない)。
    if (attacking) {
      s.speed = 0; Object.assign(patch, { vx: 0, vy: 0 }); // 振っている間は動かない(向きは振り始めに決めたまま)
    } else {
      if (away) retreatStep();
      else s.speed = Math.max(0, s.speed - LIB_BEARER_ACCEL * dt);
      stepAlong();
      patch.heroFaceX = (sight.x >= bx ? 1 : -1) as 1 | -1; // 下がる間も相手を向いたまま(後ずさり)
    }
    const screamUntil = bearer.libScreamUntil;
    if (attacking) {
      // 社長裁定2026-10-04「3は推薦」: 旗を振っている(怯んでいる)間は叫ばない=1つの体は1つの動作。
      // 叫びの溜めの途中で振り始めたら溜めは消す(予兆も消す)。振り終われば次のフレームから溜め直す。
      cancelWindup();
    } else if (screamUntil !== undefined) {
      if (gt >= screamUntil) {
        patch.libScreamUntil = undefined;
        s.windupFx = [];
        useGameStore.setState({ screamerBuffUntil: gt + SCREAMER_BUFF_MS });
        screamerCryFx(fxX, fxY, { scale: LIB_SCREAM_FX_SCALE, repeat: s.cries > 0 });
        s.cries++;
      }
    } else if (!wasAlerted || gt >= st.screamerBuffUntil) {
      patch.libScreamUntil = gt + SCREAMER_WINDUP_MS;
      s.windupFx = screamerWindupFx(fxX, fxY, LIB_SCREAM_FX_SCALE);
    }
  } else {
    cancelWindup();
    if (attacking) {
      s.speed = 0; Object.assign(patch, { vx: 0, vy: 0 });
    } else if (away) {
      // 周回中でも詰められたら距離を取る(相手の方を向いたまま後ずさる)。
      retreatStep();
      stepAlong();
      patch.heroFaceX = (pl.x + pl.width / 2 >= bx ? 1 : -1) as 1 | -1;
    } else if (bearer.libPatrolR !== undefined) {
      // 周回: 英雄と同じ速さ・同じ回り込み(輪の外/内へずらして障害物を抜ける)。
      const R = bearer.libPatrolR;
      const ang = Math.atan2(by, bx);
      const resetRef = () => { s.stallRefAt = gt; s.stallRefAng = ang; s.stallRefX = bx; s.stallRefY = by; };
      if (gt - s.stallRefAt > 2000) resetRef();
      else if (gt - s.stallRefAt >= 800) {
        let adv = s.stallRefAng - ang; adv = Math.atan2(Math.sin(adv), Math.cos(adv));
        const moved = Math.hypot(bx - s.stallRefX, by - s.stallRefY);
        const detouring = gt < s.detourUntil;
        if (detouring ? moved < 10 : adv * R < 15) {
          s.detourR = detouring && s.detourR > 0 ? -HERO_PATROL_DETOUR_PX : HERO_PATROL_DETOUR_PX;
          s.detourUntil = gt + HERO_PATROL_DETOUR_MS;
        }
        resetRef();
      }
      if (gt >= s.detourUntil) s.detourR = 0;
      const nx = heroPatrolNext(bx, by, R + s.detourR, 240);
      const dx = nx.x - bx, dy = nx.y - by, l = Math.hypot(dx, dy) || 1;
      // 歩き出しは加速(見失って周回へ戻る時も、止まった所から0.3秒ほどで周回の速さへ)。
      s.speed = Math.min(HERO_PATROL_SPEED, s.speed + LIB_BEARER_ACCEL * dt);
      s.dirX = dx / l; s.dirY = dy / l;
      const step = s.speed * dt;
      let p = placeAt(bearer, bx + (dx / l) * step, by + (dy / l) * step);
      // まっすぐ進めない時は斜めへ逸れる(英雄の walkToward と同じ考え方)。
      const gain = (q: { x: number; y: number }) => ((q.x + bearer.width / 2 - bx) * dx + (q.y + bearer.height / 2 - by) * dy) / l;
      if (step > 0 && gain(p) < step * 0.35) {
        for (const deg of [40, -40, 75, -75]) {
          const a = (deg * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
          const rx = (dx / l) * ca - (dy / l) * sa, ry = (dx / l) * sa + (dy / l) * ca;
          const c = placeAt(bearer, bx + rx * step, by + ry * step);
          if (Math.hypot(c.x + bearer.width / 2 - bx, c.y + bearer.height / 2 - by) > step * 0.6) { p = c; break; }
        }
      }
      Object.assign(patch, p, { vx: s.dirX * s.speed, vy: s.dirY * s.speed });
      patch.heroFaceX = (dx >= 0 ? 1 : -1) as 1 | -1;
    } else {
      s.speed = Math.max(0, s.speed - LIB_BEARER_ACCEL * dt);
      stepAlong();
    }
  }

  // ---- 取り巻き(バット男) ----
  const leaderId = bearer.id;
  const faceX = (patch.heroFaceX ?? bearer.heroFaceX ?? -1) as number;
  const headX = (patch.x ?? bearer.x) + bearer.width / 2, headY = (patch.y ?? bearer.y) + bearer.height / 2;
  const mine = st.enemies.filter(e => e.hordeLeaderId === leaderId && !isCorpse(e) && e.health > 0);
  const bySlot = new Map<number, Enemy>();
  for (const e of mine) if (e.hordeSlot !== undefined && !bySlot.has(e.hordeSlot)) bySlot.set(e.hordeSlot, e);
  const updates = new Map<string, Partial<Enemy>>();
  const added: Enemy[] = [];
  // 補充: 欠けた位置へ、旗手の真後ろ(向きの反対側)から出す。見つけている最中なら出た瞬間から向かう。
  for (let slot = 0; slot < LIB_ESCORTS; slot++) {
    if (bySlot.has(slot)) continue;
    const rx = headX - faceX * LIB_REFILL_BEHIND_PX;
    added.push(makeHordeBat(bearer, slot, rx, headY, gt, true, alerted));
    // 足元の死体の山から這い出る土くれ(派手さの絵・判定ゼロ)。本体は描画側で下から持ち上がる。
    st.spawnBurst(rx, bearer.y + bearer.height, '#5b1d1d', 10, 0, -1);
  }
  for (const e of mine) {
    const slot = e.hordeSlot ?? 0;
    if (alerted) {
      if (e.hordeState !== 'chase') updates.set(e.id, { hordeState: 'chase' });
      continue;
    }
    // 足跡の上の自分の位置(+個体ごとの遅れ・横ズレ=定規で引いた列にしない)。
    const jit = hordeJitter(e.id);
    const dist = Math.max(LIB_SLOT_GAP_PX * 0.6, (slot + 1) * LIB_SLOT_GAP_PX + jit.gap);
    const on = trailPointAt(s.trail, { x: headX, y: headY }, dist);
    const ahead = trailPointAt(s.trail, { x: headX, y: headY }, Math.max(0, dist - 8));
    const tdx = ahead.x - on.x, tdy = ahead.y - on.y, tl = Math.hypot(tdx, tdy) || 1;
    const target = { x: on.x - (tdy / tl) * jit.lat, y: on.y + (tdx / tl) * jit.lat };
    const ex = e.x + e.width / 2, ey = e.y + e.height / 2;
    if (e.hordeState === 'chase') { updates.set(e.id, { hordeState: 'return' }); continue; }
    if (e.hordeState === 'return') {
      const ddx = target.x - ex, ddy = target.y - ey, dl = Math.hypot(ddx, ddy);
      if (dl <= LIB_RETURN_ARRIVE_PX) { updates.set(e.id, { hordeState: 'follow' }); continue; }
      // 手前でゆるめて列へ寄せる(等速で来て急停止しない)。
      const sp = Math.min(LIB_RETURN_SPEED, dl * LIB_RETURN_EASE_PER_S);
      const step = Math.min(dl, sp * dt);
      const p = placeAt(e, ex + (ddx / dl) * step, ey + (ddy / dl) * step);
      updates.set(e.id, { ...p, vx: (ddx / dl) * sp, vy: (ddy / dl) * sp });
      continue;
    }
    // follow: 足跡の上の自分の位置に立つ(動いた分を速度として持たせ、歩きの絵を送る)。
    const nx = target.x - e.width / 2, ny = target.y - e.height / 2;
    const vx = dt > 0 ? (nx - e.x) / dt : 0, vy = dt > 0 ? (ny - e.y) / dt : 0;
    updates.set(e.id, { x: nx, y: ny, vx, vy });
  }

  useGameStore.setState(stt => ({
    enemies: [
      ...stt.enemies.map(e => (e.id === leaderId ? { ...e, ...patch } : updates.has(e.id) ? { ...e, ...updates.get(e.id)! } : e)),
      ...added,
    ],
  }));
};

/**
 * 旗手が居なくなった(倒れた・消えた)取り巻きを普通の雑魚へ戻す(LIBERTY_HORDE §5)。死体も含めて印を外し、回収・間引きの対象へ戻す。
 * 旗手が生きている間は何もしない(毎フレーム呼んで軽い=取り巻きが居なければ早期に抜ける)。
 */
export const releaseOrphanHorde = (): void => {
  const st = useGameStore.getState();
  let orphan = false;
  const alive = new Set(st.enemies.filter(e => e.type === 'mutant-liberty' && !isCorpse(e) && e.health > 0).map(e => e.id));
  for (const e of st.enemies) if (e.hordeLeaderId !== undefined && !alive.has(e.hordeLeaderId)) { orphan = true; break; }
  if (!orphan) return;
  useGameStore.setState(stt => ({
    enemies: stt.enemies.map(e => (e.hordeLeaderId !== undefined && !alive.has(e.hordeLeaderId)
      ? { ...e, hordeLeaderId: undefined, hordeState: undefined, hordeSlot: undefined, fixed: false }
      : e)),
  }));
};

/** いま場にいる旗手(死体・倒れた個体は除く)。 */
export const pickActiveLiberty = (enemies: readonly Enemy[]): Enemy | undefined =>
  enemies.find(e => e.type === 'mutant-liberty' && !isCorpse(e) && e.health > 0);

/** 旗振りの当たり(扇の爆風)。解決は combatTick.applyPumpkinBlastDamage(カウンターできる赤・プレイヤーへ)。 */
const pushFlagBlast = (bearer: Enemy, shape: NonNullable<Enemy['heroShape']>): void => {
  if (shape.kind !== 'fan') return;
  const b: PumpkinBlast = {
    x: shape.cx, y: shape.cy, radius: shape.radius, damage: LIB_FLAG_DAMAGE, enemyId: bearer.id, moveKey: 'liberty-flag',
    fan: { cx: shape.cx, cy: shape.cy, angle: shape.angle, halfArc: shape.halfArc, radius: shape.radius },
  };
  useGameStore.setState(st => ({ pumpkinBlasts: [...st.pumpkinBlasts, b] }));
};

/** 矢1本の当たり(小円の爆風)。カウンターで弾ける赤。弾いた効果はプレイヤー側だけ(遠くの旗手は吹き飛ばない・怯まない)=矢を弾くだけ。 */
const pushArrowBlast = (bearer: Enemy, x: number, y: number, r: number): void => {
  const b: PumpkinBlast = { x, y, radius: r, damage: LIB_ARROW_DAMAGE, enemyId: bearer.id, moveKey: 'liberty-arrow', parryNoDamage: true, parryLocal: true };
  useGameStore.setState(st => ({ pumpkinBlasts: [...st.pumpkinBlasts, b] }));
};
