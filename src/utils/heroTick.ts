// 英雄(変異)のコントローラ(research/MUTANT_HERO.md)。useGameLoop が毎フレーム1回呼ぶ。
// 流儀は賞金首(bountyTick)と同じ「store を読んで patch を書く」。動かすのはここだけ(updateEnemies は素通り)。
//
// 掟:
//  - 移動は必ず ①障害物(resolveBountyMove)→ ②行ける帯(clampRectToPlayableArea)の順で通す(CLAUDE.md「Y方向」)。
//  - 当たりは全部 pumpkinBlasts へ積む(プレイヤー・守護霊・カウンター・吹き飛ばし・敵への当たりは解決側=combatTick)。
//  - 赤い予告=heroShape。溜め開始で置き場所を決め、heroHitAt(当たる瞬間)まで動かさない。
//  - 画面外では技を始めない(始まった技は最後まで出して当てる=赤いのに当たらない、を作らない)。
import type { Enemy } from '../types/game';
import { useGameStore, resolveBountyMove, knockbackSpeedFor, ENEMY_REMOVE_CAUSE, type PumpkinBlast } from '../store/gameStore';
import { clampRectToPlayableArea, type PlayableAreaCtx } from '../world/playableArea';
import { isBossType, isCorpse, isMutantHero } from './enemyUtils';
import { heroOnScreen } from './heroBlast';
import { isPointInZoomedViewport } from './cameraZoom';
import { npcSfxDistGain as npcGain } from './npcSfx';
import {
  HERO_MOVES, HERO_RETARGET_PAUSE_MS, HERO_FLIP_PAUSE_MS, HERO_TARGET_LATCH_MS, HERO_ROAR_MS, HERO_WALK_SPEED,
  HERO_HOMING_SPEED_MULT, HERO_LOITER_RADIUS, HERO_LOITER_MIN_MS, HERO_LOITER_MAX_MS, HERO_STRIKE_MS, HERO_NEAR, HERO_MID,
  HERO_FLINCH_MS, HERO_SNORT_COOLDOWN_MS, HERO_ROAR_RISE_MS, HERO_ROAR_HOLD_MS,
  heroStepShape, heroStepHitDelay, pickHeroMove, pickHeroTarget, heroNotices, heroFollowUp, heroRestMs, easeInOut,
  HERO_PATROL_SPEED, HERO_GALLOP_SPEED, heroPatrolNext, heroPatrolNearest,
  HERO_ASCEND_MS, HERO_ASCEND_RISE_MS, HERO_ASCEND_CLIMAX_MS, HERO_PHASE2_HP, heroShouldAscend,
  type HeroMoveKey, type HeroShape, type HeroTargetCand,
} from './heroScript';
import { STRUCK_NOTICE_MS } from './frontSight';
import { saveHeroAscended } from './heroAscended';

/** 帰巣(社長「範囲外はボスと同じ」・§6-1 / §10a)。賞金首と同じ数字。 */
export const HERO_LEASH_PLAYER_PX = 700;
export const HERO_HOME_LIMIT_PX = 1200;
export const HERO_DISENGAGE_GRACE_MS = 1200;
export const HERO_PLAYER_HIT_ENGAGE_MS = 3000;
export const HERO_HOME_ARRIVE_PX = 60;
/** 昇天に見とれて立ち止まる範囲(英雄の中心から・画面くらい)。 */
export const HERO_AWE_RANGE_PX = 900;
export const HERO_HOME_DEFEND_PX = 200;
export const HERO_DEPART_IDLE_MS = 60000;
export const HERO_DEPART_RUN_MS = 1500;
/** 周回で障害物に詰まった時の回り込み(輪からずらす量・続ける時間)。品質監査 A-1。 */
export const HERO_PATROL_DETOUR_PX = 180;
export const HERO_PATROL_DETOUR_MS = 7000;

export interface HeroSfx {
  neigh: (gain: number) => void;
  snort: (gain: number) => void;
  gallop: (gain: number, rate: number) => void;
  /** 昇天の光が差す音(頭=静か)。 */
  ascend?: (gain: number) => void;
  /** 昇天の山場の音(消える瞬間=一番強い一打)。 */
  ascendClimax?: (gain: number) => void;
}
export const NOOP_HERO_SFX: HeroSfx = { neigh: () => {}, snort: () => {}, gallop: () => {} };

/** 1ランの中だけ持つ時計(Enemy に置かない細かい状態)。 */
export interface HeroTickState {
  activeId: string | null;
  disengageSince: number | null;
  homing: boolean;
  homeIdleSince: number | null;
  lastPos: { x: number; y: number } | null;
  /** 出現直後: 姿が画面に入るまでプレイヤーの方へ歩いて寄る(音が先・姿が後)。入ったら巣をそこへ置く。 */
  introDone: boolean;
  lastSnortAt: number;
  roarLanded: boolean;
  /** 昇天の進行(いななき・山場・立ち昇る粒)。 */
  ascendNeighed?: boolean; ascendClimaxed?: boolean; ascendMoteAt?: number;
  /** 周回の迂回(品質監査 A-1): 輪から外側(+)/内側(-)へずらす量・いつまで。 */
  detourR: number;
  detourUntil: number;
  /** 周回が進んでいるかの見張り(この時刻・この角度から、どれだけ進んだか)。 */
  stallRefAt: number;
  stallRefAng: number;
  stallRefX: number;
  stallRefY: number;
}
export const createHeroTickState = (): HeroTickState => ({ activeId: null, disengageSince: null, homing: false, homeIdleSince: null, lastPos: null, introDone: false, lastSnortAt: -1e9, roarLanded: false, detourR: 0, detourUntil: 0, stallRefAt: -1e9, stallRefAng: 0, stallRefX: 0, stallRefY: 0 });

/** 蹄の拍は速さに比例(歩幅と拍を合わせる)。 */
const gallopRate = (speed: number): number => Math.max(0.6, Math.min(1.2, (speed / HERO_WALK_SPEED) * 0.85));

const applyPatch = (id: string, patch: Partial<Enemy>): void => {
  if (Object.keys(patch).length === 0) return;
  useGameStore.setState(stt => ({ enemies: stt.enemies.map(e => (e.id === id ? { ...e, ...patch } : e)) }));
};

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

/** 左上座標を「実際に立てる場所」へ。①障害物 → ②行ける帯。 */
const resolveMove = (nx: number, ny: number, e: Enemy): { x: number; y: number } => {
  const collided = resolveBountyMove(nx, ny, { width: e.width, height: e.height });
  return clampRectToPlayableArea(collided.x, collided.y, e.width, e.height, playCtx());
};

/** 中心座標の点を、英雄が立てる中心へ(着地点・突進の終点を帯の外へ出さない)。 */
const resolveCenter = (cx: number, cy: number, e: Enemy): { x: number; y: number } => {
  const p = resolveMove(cx - e.width / 2, cy - e.height / 2, e);
  return { x: p.x + e.width / 2, y: p.y + e.height / 2 };
};

const isFrozen = (e: Enemy, gt: number, nowMs: number): boolean =>
  (e.bossFullStunUntil !== undefined && gt < e.bossFullStunUntil)
  || (e.stunUntil !== undefined && gt < e.stunUntil)
  || (e.rootUntil !== undefined && gt < e.rootUntil)
  || (e.liftUntil !== undefined && nowMs < e.liftUntil)
  || (e.knockbackUntil !== undefined && nowMs < e.knockbackUntil);

const IN_MOVE = new Set(['hero-windup', 'hero-motion', 'hero-strike', 'hero-recover']);

/** 技を捨てて追いかけへ戻す(気絶・紫・カウンター)。休みの長さは結果で。 */
const cancelMove = (gt: number, rest: number): Partial<Enemy> => ({
  bossState: 'chase', bossStateUntil: undefined, heroShape: undefined, heroHitAt: undefined,
  heroMove: undefined, heroStep: undefined, bossNextActionAt: gt + rest, bossMoveCutPending: undefined, heroStateAt: gt,
});

/** 狙いの候補(プレイヤー/守護霊/敵)。死体・ボス級・英雄自身は入れない。 */
const targetCands = (hero: Enemy): HeroTargetCand[] => {
  const st = useGameStore.getState();
  const vis = (x: number, y: number) => isPointInZoomedViewport(x, y, st.camera, st.gameBounds, st.viewZoom);
  const out: HeroTargetCand[] = [];
  const p = st.player;
  if (p.health > 0) {
    const px = p.x + p.width / 2, py = p.y + p.height / 2;
    out.push({ id: 'player', x: px, y: py, onScreen: vis(px, py) });
  }
  const g = st.summons.find(s => s.kind === 'ghost-ally');
  if (g) { const gx = g.x + g.width / 2, gy = g.y + g.height / 2; out.push({ id: 'ghost', x: gx, y: gy, onScreen: vis(gx, gy) }); }
  for (const e of st.enemies) {
    if (e.id === hero.id || isCorpse(e) || e.health <= 0 || isBossType(e.type) || e.dormant) continue;
    const ex = e.x + e.width / 2, ey = e.y + e.height / 2;
    out.push({ id: e.id, x: ex, y: ey, onScreen: vis(ex, ey) });
  }
  return out;
};

/** 狙っている相手の今の位置(消えていれば null)。 */
const targetPos = (id: string | undefined): { x: number; y: number } | null => {
  if (!id) return null;
  const st = useGameStore.getState();
  if (id === 'player') return st.player.health > 0 ? { x: st.player.x + st.player.width / 2, y: st.player.y + st.player.height / 2 } : null;
  if (id === 'ghost') { const g = st.summons.find(s => s.kind === 'ghost-ally'); return g ? { x: g.x + g.width / 2, y: g.y + g.height / 2 } : null; }
  const e = st.enemies.find(en => en.id === id);
  return e && !isCorpse(e) && e.health > 0 ? { x: e.x + e.width / 2, y: e.y + e.height / 2 } : null;
};

const moveKeyFor = (move: HeroMoveKey, step: number): string => {
  if (move === 'rear' || move === 'leap' || (move === 'leapcharge' && step === 0)) return 'hero-slam';
  if (move === 'tackle' || move === 'leapcharge') return 'hero-tackle';
  return 'hero-slash';
};

/** 形を爆風へ(解決は combatTick.applyPumpkinBlastDamage)。 */
const pushBlast = (hero: Enemy, shape: HeroShape, damage: number, moveKey: string, kb?: { distPx: number; ms: number }): void => {
  const base = { damage, enemyId: hero.id, moveKey, ...(kb ? { kbSpeed: knockbackSpeedFor(kb.distPx, kb.ms), kbMs: kb.ms } : {}) };
  let b: PumpkinBlast;
  if (shape.kind === 'band') {
    b = { ...base, x: (shape.fx + shape.tx) / 2, y: (shape.fy + shape.ty) / 2, radius: shape.halfWidth,
      capsule: { fx: shape.fx, fy: shape.fy, tx: shape.tx, ty: shape.ty, halfWidth: shape.halfWidth } };
  } else if (shape.kind === 'fan') {
    b = { ...base, x: shape.cx, y: shape.cy, radius: shape.radius,
      fan: { cx: shape.cx, cy: shape.cy, angle: shape.angle, halfArc: shape.halfArc, radius: shape.radius } };
  } else {
    b = { ...base, x: shape.cx, y: shape.cy, radius: shape.radius };
  }
  useGameStore.setState(st => ({ pumpkinBlasts: [...st.pumpkinBlasts, b] }));
};

/** 段の溜めに入る(赤い予告がここで出る=出る時刻=溜めの開始)。 */
const beginStep = (hero: Enemy, move: HeroMoveKey, step: number, aim: { x: number; y: number }, gt: number): Partial<Enemy> => {
  const spec = HERO_MOVES[move].steps[step];
  const hx = hero.x + hero.width / 2, hy = hero.y + hero.height / 2;
  const face: 1 | -1 = hero.heroFaceX ?? -1;
  const r = heroStepShape(spec, hx, hy, aim.x, aim.y, face);
  const end = (spec.motion !== 'none' || (spec.lungeTailPx ?? 0) > 0) ? resolveCenter(r.endX, r.endY, hero) : { x: hx, y: hy };
  // 着地点・終点を帯で丸めた時は、形(着地の円・終点の扇/帯)も同じ所へ置き直す(見たまんまが当たり)。
  let shape = r.shape;
  if (spec.shape.kind === 'circle' && spec.shape.atTarget !== undefined && shape.kind === 'circle') shape = { ...shape, cx: end.x, cy: end.y };
  if (spec.shape.kind === 'fan' && spec.shape.atEnd && shape.kind === 'fan') shape = { ...shape, cx: end.x, cy: end.y };
  if (spec.shape.kind === 'endBand' && shape.kind === 'band') {
    const dx = shape.tx - shape.fx, dy = shape.ty - shape.fy;
    shape = { ...shape, fx: end.x, fy: end.y, tx: end.x + dx, ty: end.y + dy };
  }
  return {
    bossState: 'hero-windup', bossStateUntil: gt + spec.windupMs, bossWindupStartAt: gt, heroStateAt: gt,
    heroMove: move, heroStep: step, heroShape: shape, heroHitAt: gt + heroStepHitDelay(spec),
    heroFromX: hx, heroFromY: hy, heroToX: end.x, heroToY: end.y,
    ...(step === 0 ? { heroHitSomething: false } : {}),
  };
};

/** 中心を (cx,cy) へ置く patch。 */
const placeCenter = (hero: Enemy, cx: number, cy: number): Partial<Enemy> => {
  const p = resolveMove(cx - hero.width / 2, cy - hero.height / 2, hero);
  return { x: p.x, y: p.y };
};

/** 歩く(中心 → 目標へ、速さ px/s)。到着したら true。向きの反転は一拍止まる。 */
const walkToward = (hero: Enemy, tx: number, ty: number, speed: number, dt: number, gt: number, patch: Partial<Enemy>, stopDist = 0): boolean => {
  const hx = hero.x + hero.width / 2, hy = hero.y + hero.height / 2;
  const dx = tx - hx, dy = ty - hy;
  const d = Math.hypot(dx, dy);
  if (d <= Math.max(2, stopDist)) { patch.vx = 0; patch.vy = 0; return true; }
  const wantFace: 1 | -1 = dx >= 0 ? 1 : -1;
  if (Math.abs(dx) > 8 && wantFace !== (hero.heroFaceX ?? -1)) {
    // 左右が入れ替わる前に止まる(体の大きい騎馬が1フレームで裏返らない=慣性)。
    Object.assign(patch, { bossState: 'hero-turn', bossStateUntil: gt + HERO_FLIP_PAUSE_MS, heroStateAt: gt, heroFaceX: wantFace, vx: 0, vy: 0 });
    return false;
  }
  const step = Math.min(d - stopDist, speed * dt);
  const ux = dx / d, uy = dy / d;
  // 木・瓦礫・施設に正面から当たって止まらないよう、まっすぐ進めない時は斜めへ逸れて回り込む(品質監査 A-1:
  // 輪の上に武器庫や木があると、押し戻されたまま永久に止まっていた)。逸れる角は浅い順に試し、目標へ近づく量が一番大きいものを取る。
  let best = placeCenter(hero, hx + ux * step, hy + uy * step);
  const gain = (p: Partial<Enemy>) => ((p.x ?? hero.x) + hero.width / 2 - hx) * ux + ((p.y ?? hero.y) + hero.height / 2 - hy) * uy;
  if (step > 0.3 && gain(best) < step * 0.35) {
    for (const deg of [40, -40, 75, -75, 105, -105]) {
      const a = (deg * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
      const rx = ux * ca - uy * sa, ry = ux * sa + uy * ca;
      const cand = placeCenter(hero, hx + rx * step, hy + ry * step);
      const moved = Math.hypot((cand.x ?? hero.x) + hero.width / 2 - hx, (cand.y ?? hero.y) + hero.height / 2 - hy);
      if (moved > step * 0.6) { best = cand; break; }
    }
  }
  Object.assign(patch, best, { vx: ux * speed, vy: uy * speed });
  return false;
};

/**
 * 英雄1体ぶんの1フレーム。
 * practice=練習ラン(対策室)なら去らない。
 */
export const runHeroTick = (
  hero: Enemy, s: HeroTickState, gt: number, dt: number, nowMs: number, sfx: HeroSfx = NOOP_HERO_SFX, practice = false,
): void => {
  if (s.activeId !== hero.id) { Object.assign(s, createHeroTickState(), { activeId: hero.id }); }
  const st = useGameStore.getState();
  const player = st.player;
  const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
  const hx = hero.x + hero.width / 2, hy = hero.y + hero.height / 2;
  const sfxGain = sfxGainAt(hx, hy);
  const state = hero.bossState ?? 'chase';
  const patch: Partial<Enemy> = {};

  // ---- 去る(駆け去って消える) ----------------------------------------------------------------
  if (hero.heroDepartAt !== undefined) {
    const u = (gt - hero.heroDepartAt) / HERO_DEPART_RUN_MS;
    // 見えている間は走らせ、画面の外へ出たら消す(時間で消すと画面の中で蒸発する)。保険で長くても4倍の尺。
    if ((u >= 1 && !heroOnScreen(hero)) || u >= 4) {
      ENEMY_REMOVE_CAUSE.set(hero.id, 'heroGone');
      useGameStore.setState(stt => ({ enemies: stt.enemies.filter(e => e.id !== hero.id) }));
      sfx.gallop(0, 1);
      return;
    }
    const away = Math.sign(hx - pcx) || 1;
    Object.assign(patch, placeCenter(hero, hx + away * 300 * dt * Math.min(1, u * 3), hy), { heroFaceX: away as 1 | -1, vx: away * 300, vy: 0 });
    sfx.gallop(sfxGain, gallopRate(300));
    applyPatch(hero.id, patch);
    return;
  }

  // ---- 昇天(社長指示2026-10-05: 全回復=正規ルートで倒した)。5秒かけて光に包まれて消える。何も落とさない ----
  // 見せ方(クリエイティブ監査): 頭は静か(光の柱と小さな音)→ 前脚が上がり切った所で最後のいななき →
  // 光の粒が柱の中を立ち昇る → 山場(4.5秒)で閃光・外へ抜ける輪・強い音・帯「蹄の音が止んだ」→ 消える。
  if (state === 'hero-ascend') {
    const since = gt - (hero.heroStateAt ?? gt);
    if (since >= HERO_ASCEND_MS) {
      ENEMY_REMOVE_CAUSE.set(hero.id, 'heroGone');
      useGameStore.setState(stt => ({ enemies: stt.enemies.filter(e => e.id !== hero.id) }));
      sfx.gallop(0, 1);
      return;
    }
    const g = useGameStore.getState();
    if (!s.ascendNeighed && since >= HERO_ASCEND_RISE_MS) { s.ascendNeighed = true; sfx.neigh(Math.max(0.7, sfxGain)); }
    // 立ち昇る光の粒(柱の中をゆっくり上へ・山場まで)。
    if (since < HERO_ASCEND_CLIMAX_MS && gt >= (s.ascendMoteAt ?? 0)) {
      s.ascendMoteAt = gt + 110;
      const now = Date.now();
      for (let i = 0; i < 2; i++) {
        g.spawnEffect({
          kind: 'particle', id: `fx-hero-ascend-${now}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          x: hx + (Math.random() - 0.5) * hero.width * 1.2, y: hero.y + hero.height - Math.random() * 30,
          vx: (Math.random() - 0.5) * 14, vy: -(45 + Math.random() * 55),
          color: Math.random() < 0.6 ? '#fff4d6' : '#e7dccb', size: 1.8 + Math.random() * 2.2,
          createdAt: now, duration: 1500 + Math.random() * 900, drag: 0.4,
        });
      }
    }
    if (!s.ascendClimaxed && since >= HERO_ASCEND_CLIMAX_MS) {
      s.ascendClimaxed = true;
      g.spawnFlash('rgba(255,248,228,0.42)', 420);
      g.spawnRing(hx, hy, 18, 260, 'rgba(255,244,214,0.9)', 5, 700);
      g.spawnBurst(hx, hy, '#fff4d6', 26);
      if (heroOnScreen(hero)) useGameStore.setState({ eventBannerText: '蹄の音が止んだ', eventBannerUntil: gt + 3000 });
      sfx.ascendClimax?.(Math.max(0.7, sfxGain));
    }
    // 周りの雑魚・強個体は英雄の方を向いたまま立ち止まる(社長裁定2026-10-05「3は代案がおもろい」)。昇天が終わるまで。
    {
      const untilNow = Date.now() + Math.max(0, HERO_ASCEND_MS - since);
      const r2 = HERO_AWE_RANGE_PX * HERO_AWE_RANGE_PX;
      let touched = false;
      const next = useGameStore.getState().enemies.map(e => {
        if (e.id === hero.id || isBossType(e.type) || isCorpse(e) || e.dormant || e.health <= 0) return e;
        const ex = e.x + e.width / 2 - hx, ey = e.y + e.height / 2 - hy;
        if (ex * ex + ey * ey > r2) return e;
        if (e.aweUntil === untilNow && e.aweFaceX === hx) return e;
        touched = true;
        return { ...e, aweUntil: untilNow, aweFaceX: hx };
      });
      if (touched) useGameStore.setState({ enemies: next });
    }
    // 走っていた勢いは滑って止める(瞬間停止しない=慣性)。
    const k = Math.exp(-dt / 0.12);
    const vx0 = hero.vx ?? 0, vy0 = hero.vy ?? 0;
    if (Math.abs(vx0) > 2 || Math.abs(vy0) > 2) Object.assign(patch, placeCenter(hero, hx + vx0 * dt, hy + vy0 * dt), { vx: vx0 * k, vy: vy0 * k });
    else Object.assign(patch, { vx: 0, vy: 0 });
    applyPatch(hero.id, patch);
    sfx.gallop(0, 1);
    return;
  }
  if (heroShouldAscend(hero)) {
    // 技・気絶・狙いは全部ここで終わる(予告も消える)。以後は被弾しない(damageEnemy)・敵の的にもならない(heroAsTarget)。
    // 走っていた勢い(vx/vy)は残す=昇天の中で滑って止まる。
    applyPatch(hero.id, {
      bossState: 'hero-ascend', heroStateAt: gt, bossStateUntil: gt + HERO_ASCEND_MS,
      heroShape: undefined, heroHitAt: undefined, heroMove: undefined, heroTargetId: undefined, heroTargetUntil: undefined,
      bossFullStunUntil: undefined, bossMoveCutPending: false, heroFromX: undefined, heroFromY: undefined,
    });
    s.ascendNeighed = false; s.ascendClimaxed = false; s.ascendMoteAt = gt;
    const g = useGameStore.getState();
    // スキル「英雄」(社長指示2026-10-05「昇天させた場合のみゲットできる」)。死神と同じ形=未所持の時だけ告知。
    const hadHeroSkill = g.ownedSkills.includes('hero');
    g.grantSkill('hero');
    saveHeroAscended(); // 社長指示「解放された後は2度と出ない(昇天のみ)」=本編の周回の英雄はもう置かない
    if (!hadHeroSkill) g.spawnCallout(hx, hero.y - 40, 'スキル「英雄」習得！', '#fde68a', { scale: 1.2 });
    sfx.ascend?.(Math.max(0.5, sfxGain * 0.8));
    sfx.gallop(0, 1);
    return;
  }

  // ---- 崩し(紫・気絶)/カウンター/ノックバック ------------------------------------------------
  const fullStun = hero.bossFullStunUntil !== undefined && gt < hero.bossFullStunUntil;
  if (hero.bossMoveCutPending) {
    // カウンターされた: 低く構えて後ずさる(怯み)→ 長めの休み。
    applyPatch(hero.id, { ...cancelMove(gt, heroRestMs('countered')), heroLastMove: hero.heroMove ?? hero.heroLastMove,
      bossState: 'hero-flinch', bossStateUntil: gt + HERO_FLINCH_MS, heroStateAt: gt,
      heroFromX: hx, heroFromY: hy, heroToX: hx - (hero.heroFaceX ?? -1) * 40, heroToY: hy });
    sfx.gallop(0, 1);
    return;
  }
  if (fullStun || isFrozen(hero, gt, nowMs)) {
    const kbOnly = !fullStun && hero.knockbackUntil !== undefined && nowMs < hero.knockbackUntil
      && !(hero.stunUntil !== undefined && gt < hero.stunUntil) && !(hero.rootUntil !== undefined && gt < hero.rootUntil)
      && !(hero.liftUntil !== undefined && nowMs < hero.liftUntil);
    if (kbOnly) {
      // 押されている間は技の時計を止める(解除の瞬間に古い溜めが即着弾しない)。当たる時刻も同じだけ後ろへ。
      const dms = dt * 1000;
      applyPatch(hero.id, {
        ...(hero.bossStateUntil !== undefined ? { bossStateUntil: hero.bossStateUntil + dms } : {}),
        ...(hero.heroHitAt !== undefined ? { heroHitAt: hero.heroHitAt + dms } : {}),
        ...(hero.heroStateAt !== undefined ? { heroStateAt: hero.heroStateAt + dms } : {}),
        ...(hero.bossWindupStartAt !== undefined ? { bossWindupStartAt: hero.bossWindupStartAt + dms } : {}),
        bossNextActionAt: (hero.bossNextActionAt ?? gt) + dms,
      });
    } else if (IN_MOVE.has(state)) {
      applyPatch(hero.id, cancelMove(gt, heroRestMs('countered')));
    }
    sfx.gallop(0, 1);
    return;
  }

  // ---- 後半へ。技の間には割り込まない(社長指示2026-10-05で出てくる体力が上限の半分になったので、境を5000へ) ----
  if (!hero.heroPhase2 && hero.health <= HERO_PHASE2_HP && !IN_MOVE.has(state)) {
    applyPatch(hero.id, { heroPhase2: true, bossState: 'hero-roar', bossStateUntil: gt + HERO_ROAR_MS, heroStateAt: gt, vx: 0, vy: 0, heroShape: undefined });
    s.roarLanded = false;
    sfx.gallop(0, 1);
    return;
  }

  // ---- 技の進行 ------------------------------------------------------------------------------
  if (IN_MOVE.has(state) && hero.heroMove) {
    const move = hero.heroMove;
    const stepIdx = hero.heroStep ?? 0;
    const spec = HERO_MOVES[move].steps[stepIdx];
    const until = hero.bossStateUntil ?? gt;
    if (state === 'hero-windup') {
      // 振り下ろしの踏み込み(溜めの最後)。赤い帯は溜め開始の位置に固定のまま(本体だけが進む)。
      const tail = spec.lungeTailMs ?? 0;
      if (tail > 0 && hero.heroFromX !== undefined && hero.heroToX !== undefined) {
        const u = 1 - (until - gt) / tail;
        if (u > 0) {
          const e = easeInOut(Math.min(1, u));
          Object.assign(patch, placeCenter(hero, hero.heroFromX + (hero.heroToX - hero.heroFromX) * e, (hero.heroFromY ?? hy) + ((hero.heroToY ?? hy) - (hero.heroFromY ?? hy)) * e));
        }
      }
      if (gt >= until) {
        if (spec.motion !== 'none') {
          Object.assign(patch, { bossState: 'hero-motion', bossStateUntil: until + spec.motionMs, heroStateAt: until });
          if (move === 'charge' || (move === 'leapcharge' && stepIdx === 1)) sfx.gallop(sfxGain, 1);
        } else {
          strike(hero, move, stepIdx, gt, patch);
        }
      }
      applyPatch(hero.id, patch);
      if (spec.motion !== 'run') sfx.gallop(0, 1);
      return;
    }
    if (state === 'hero-motion') {
      const u = spec.motionMs > 0 ? 1 - (until - gt) / spec.motionMs : 1;
      const e = spec.motion === 'run' ? easeRun(Math.min(1, Math.max(0, u))) : easeInOut(Math.min(1, Math.max(0, u)));
      if (hero.heroFromX !== undefined && hero.heroToX !== undefined) {
        Object.assign(patch, placeCenter(hero, hero.heroFromX + (hero.heroToX - hero.heroFromX) * e, (hero.heroFromY ?? hy) + ((hero.heroToY ?? hy) - (hero.heroFromY ?? hy)) * e));
      }
      if (spec.motion === 'run') sfx.gallop(sfxGain, 1.1);
      if (gt >= until) strike(hero, move, stepIdx, gt, patch);
      applyPatch(hero.id, patch);
      return;
    }
    if (state === 'hero-strike') {
      sfx.gallop(0, 1);
      if (gt >= until) {
        const steps = HERO_MOVES[move].steps;
        if (stepIdx + 1 < steps.length) {
          // 次の段: 今の相手の位置へ向け直して溜め直す(段ごとに別の予告と時刻)。
          const aim = targetPos(hero.heroTargetId) ?? { x: pcx, y: pcy };
          Object.assign(patch, faceTowards(hero, aim.x), beginStep({ ...hero, ...patch } as Enemy, move, stepIdx + 1, aim, gt));
        } else {
          Object.assign(patch, { bossState: 'hero-recover', bossStateUntil: gt + HERO_MOVES[move].recoverMs, heroStateAt: gt, heroShape: undefined, heroHitAt: undefined });
        }
      }
      applyPatch(hero.id, patch);
      return;
    }
    // hero-recover
    if (gt >= until) {
      const aim = targetPos(hero.heroTargetId);
      const distAfter = aim ? Math.hypot(aim.x - hx, aim.y - hy) : Infinity;
      const follow = heroFollowUp(move, hero.heroHitSomething === true, distAfter);
      if (follow && aim && heroOnScreen(hero)) {
        Object.assign(patch, faceTowards(hero, aim.x), beginStep({ ...hero, ...patch } as Enemy, follow, 0, aim, gt), { heroLastMove: move });
        if (follow === 'overhead') patch.heroHitSomething = false;
      } else {
        Object.assign(patch, {
          bossState: 'chase', bossStateUntil: undefined, heroMove: undefined, heroStep: undefined, heroStateAt: gt,
          heroLastMove: move, bossNextActionAt: gt + heroRestMs(hero.heroHitSomething ? 'hit' : 'miss'),
        });
      }
    }
    applyPatch(hero.id, patch);
    return;
  }

  // ---- 立ち上がり(後半へ)・向き直り ---------------------------------------------------------------
  if (state === 'hero-roar' || state === 'hero-turn' || state === 'hero-flinch') {
    if (state === 'hero-roar') {
      // 立ち上がって止まった所でいななき、降りた瞬間に砂埃(派手さの絵・判定なし)。
      const since = gt - (hero.heroStateAt ?? gt);
      if (since >= HERO_ROAR_RISE_MS && !s.roarLanded && since < HERO_ROAR_RISE_MS + 60) sfx.neigh(sfxGain);
      if (since >= HERO_ROAR_RISE_MS + HERO_ROAR_HOLD_MS + 300 && !s.roarLanded) {
        s.roarLanded = true;
        const g = useGameStore.getState();
        g.spawnRing(hx, hy + hero.height / 2, 10, 210, 'rgba(120,96,72,0.85)', 7, 620);
        g.spawnRing(hx, hy + hero.height / 2, 6, 130, 'rgba(20,14,12,0.7)', 5, 520);
        g.spawnBurst(hx, hy + hero.height / 2, '#6b5444', 26);
        g.triggerShake?.(220, 6);
      }
    }
    if (state === 'hero-flinch' && hero.heroFromX !== undefined && hero.heroToX !== undefined) {
      const u = Math.min(1, (gt - (hero.heroStateAt ?? gt)) / HERO_FLINCH_MS);
      const e = 1 - Math.pow(1 - u, 3);
      Object.assign(patch, placeCenter(hero, hero.heroFromX + (hero.heroToX - hero.heroFromX) * e, hero.heroFromY ?? hy));
    }
    if (gt >= (hero.bossStateUntil ?? gt)) { Object.assign(patch, { bossState: 'chase', bossStateUntil: undefined, heroStateAt: gt }); s.roarLanded = false; }
    applyPatch(hero.id, patch);
    sfx.gallop(0, 1);
    return;
  }

  // ---- 狙い(中立): プレイヤー/守護霊/敵のうち一番近い ------------------------------------------------
  const onScreen = heroOnScreen(hero);
  // 出現直後(音が先・姿が後): 画面に入るまでプレイヤーの方へ速歩で寄る=蹄の音が近づく。入った所を巣にする。
  // 本編の周回(heroPatrolR)はプレイヤーへ寄らない=輪の上をゆっくり回っている所へこちらが出会う。
  if (!s.introDone && hero.heroPatrolR !== undefined) s.introDone = true;
  if (!s.introDone) {
    if (onScreen) {
      s.introDone = true;
      Object.assign(patch, { homeX: hero.x, homeY: hero.y });
    } else {
      walkToward({ ...hero, ...patch } as Enemy, pcx, pcy, HERO_WALK_SPEED * 1.4, dt, gt, patch, 0);
      if (patch.bossState === undefined && state !== 'chase') patch.bossState = 'chase';
      sfx.gallop(sfxGain, gallopRate(HERO_WALK_SPEED * 1.4));
      applyPatch(hero.id, patch);
      return;
    }
  }
  const cands = targetCands(hero);
  // 社長裁定2026-10-05「見つけるのは前方扇状で、後方は見ない。攻撃されると気付く」: 向き=進む向き(止まっていれば顔の左右)。
  const hvx = hero.vx ?? 0, hvy = hero.vy ?? 0;
  const moving = Math.hypot(hvx, hvy) > 10;
  const faceX = moving ? hvx : (hero.heroFaceX ?? -1), faceY = moving ? hvy : 0;
  const struckWithin = (at: number | undefined) => at !== undefined && gt - at <= STRUCK_NOTICE_MS;
  const noticeCtx = {
    currentId: hero.heroTargetId,
    struckPlayer: struckWithin(hero.heroPlayerHitAt), struckGhost: struckWithin(hero.heroGhostHitAt), struckMob: struckWithin(hero.heroMobHitAt),
  };
  const picked = s.homing
    // 帰巣中は巣のそば(200px)で狙ってくる相手にだけ斬り返す(プレイヤーへは振り向かない)。
    ? pickHeroTarget(hx, hy, cands.filter(c => c.id !== 'player'), hero.heroTargetId, hero.heroTargetUntil, gt, HERO_HOME_DEFEND_PX)
    : pickHeroTarget(hx, hy, cands.filter(c => heroNotices(hx, hy, faceX, faceY, c, noticeCtx)), hero.heroTargetId, hero.heroTargetUntil, gt,
      Infinity, false);
  if (picked && picked.id !== hero.heroTargetId) {
    const wasTargeting = hero.heroTargetId !== undefined;
    Object.assign(patch, { heroTargetId: picked.id, heroTargetUntil: gt + HERO_TARGET_LATCH_MS });
    if (wasTargeting) {
      // 乗り換えの合図: 止まって向き直る間+鼻息。
      Object.assign(patch, faceTowards(hero, picked.x), { bossState: 'hero-turn', bossStateUntil: gt + HERO_RETARGET_PAUSE_MS, heroStateAt: gt, vx: 0, vy: 0 });
      if (gt - s.lastSnortAt >= HERO_SNORT_COOLDOWN_MS) { s.lastSnortAt = gt; sfx.snort(sfxGain); }
      sfx.gallop(0, 1);
      applyPatch(hero.id, patch);
      return;
    }
  } else if (!picked && hero.heroTargetId !== undefined) {
    patch.heroTargetId = undefined;
    patch.heroTargetUntil = undefined;
  }
  // 周回中に相手を見つけた瞬間: いななきを上げて駆け出す合図(ツリーガードの「気づかれた」)。続けて鳴らない。
  if (hero.heroPatrolR !== undefined && picked && hero.heroTargetId === undefined && gt - s.lastSnortAt >= HERO_SNORT_COOLDOWN_MS) {
    s.lastSnortAt = gt;
    sfx.neigh(sfxGain);
  }

  // ---- 範囲外=帰巣(§6-1 / §10a) -------------------------------------------------------------------
  // 本編の周回では「巣」=輪の上のいちばん近い点(輪から1200px以上は追わずに輪へ帰り、また回り始める)。
  const ring = hero.heroPatrolR !== undefined ? heroPatrolNearest(hx, hy, hero.heroPatrolR) : null;
  const homeCx = ring ? ring.x : (hero.homeX ?? hero.x) + hero.width / 2;
  const homeCy = ring ? ring.y : (hero.homeY ?? hero.y) + hero.height / 2;
  const fromHome = Math.hypot(hx - homeCx, hy - homeCy);
  const playerDist = Math.hypot(pcx - hx, pcy - hy);
  const playerHitRecently = hero.heroPlayerHitAt !== undefined && gt - hero.heroPlayerHitAt <= HERO_PLAYER_HIT_ENGAGE_MS;
  if (!s.homing) {
    // 周回中は「プレイヤーが遠い」だけでは帰らない(相手がいなければ周回の歩き自体が輪へ戻る)。輪から1200px以上で帰る。
    const out = fromHome > HERO_HOME_LIMIT_PX || (!ring && playerDist > HERO_LEASH_PLAYER_PX && !picked && !playerHitRecently);
    if (out) {
      if (s.disengageSince === null) s.disengageSince = gt;
      if (fromHome > HERO_HOME_LIMIT_PX || gt - s.disengageSince >= HERO_DISENGAGE_GRACE_MS) { s.homing = true; s.disengageSince = null; }
    } else {
      s.disengageSince = null;
    }
  } else if (fromHome <= HERO_HOME_ARRIVE_PX) {
    s.homing = false;
  }

  const tgt = picked;
  if (s.homing && !tgt) {
    // 周回中の英雄は輪から離れすぎたら**駆けて**戻る(社長指示)。対策室の英雄は従来どおり半分の速さで巣へ。
    const homeSpeed = ring ? HERO_GALLOP_SPEED : HERO_WALK_SPEED * HERO_HOMING_SPEED_MULT;
    walkToward({ ...hero, ...patch } as Enemy, homeCx, homeCy, homeSpeed, dt, gt, patch, HERO_HOME_ARRIVE_PX * 0.5);
    if (patch.bossState === undefined) patch.bossState = 'chase';
    sfx.gallop(sfxGain * (ring ? 0.9 : 0.6), gallopRate(homeSpeed));
    applyPatch(hero.id, patch);
    return;
  }

  // ---- 相手がいる: 間合いを詰めて技 ---------------------------------------------------------------
  if (tgt) {
    s.homeIdleSince = null;
    const d = Math.hypot(tgt.x - hx, tgt.y - hy);
    const ready = gt >= (hero.bossNextActionAt ?? 0) && onScreen && tgt.onScreen;
    if (ready) {
      const face = faceTowards(hero, tgt.x);
      if (face.heroFaceX !== undefined && face.heroFaceX !== (hero.heroFaceX ?? -1)) {
        Object.assign(patch, face, { bossState: 'hero-turn', bossStateUntil: gt + HERO_FLIP_PAUSE_MS, heroStateAt: gt, vx: 0, vy: 0 });
        applyPatch(hero.id, patch);
        sfx.gallop(0, 1);
        return;
      }
      const move = pickHeroMove(d, hero.heroPhase2 === true, hero.heroLastMove, Math.random());
      Object.assign(patch, beginStep({ ...hero, ...patch } as Enemy, move, 0, { x: tgt.x, y: tgt.y }, gt), { vx: 0, vy: 0 });
      if (move === 'charge') sfx.neigh(sfxGain);
      applyPatch(hero.id, patch);
      sfx.gallop(0, 1);
      return;
    }
    // 休みの間: 遠ければ中距離まで歩いて詰める(近すぎる時は止まる)。
    if (d > HERO_MID) {
      // 周回中の英雄は見つけた相手へ**駆け寄る**(ツリーガードと同じ)。対策室の英雄は従来どおり歩いて詰める。
      const closeSpeed = ring ? HERO_GALLOP_SPEED : HERO_WALK_SPEED;
      walkToward({ ...hero, ...patch } as Enemy, tgt.x, tgt.y, closeSpeed, dt, gt, patch, HERO_MID * 0.8);
      sfx.gallop(sfxGain * (ring ? 1 : 0.7), gallopRate(closeSpeed));
    } else if (d > HERO_NEAR) {
      walkToward({ ...hero, ...patch } as Enemy, tgt.x, tgt.y, HERO_WALK_SPEED * 0.6, dt, gt, patch, HERO_NEAR);
      sfx.gallop(sfxGain * 0.5, gallopRate(HERO_WALK_SPEED * 0.6));
    } else {
      // 間合いの内で休む間は佇み(前脚を掻く)。石像にしない。
      Object.assign(patch, { vx: 0, vy: 0 }, faceTowardsNoPause(hero, tgt.x));
      if (state !== 'hero-idle') Object.assign(patch, { bossState: 'hero-idle', heroStateAt: gt });
      sfx.gallop(0, 1);
    }
    if (patch.bossState === undefined && state !== 'chase') patch.bossState = 'chase';
    applyPatch(hero.id, patch);
    return;
  }

  // ---- 相手がいない(本編の周回): 輪の上を反時計回りにゆっくり歩き続ける。去らない ------------------------
  if (hero.heroPatrolR !== undefined) {
    s.homeIdleSince = null;
    // 詰まりの見張り(品質監査 A-1): 0.8秒で輪の上を15pxも進めていなければ、武器庫・木・瓦礫に当たっている。
    // 輪の外側へ180pxずれて回り込み(それでも動けなければ内側へ)、7秒たったら輪へ戻る。
    // 回り込みの最中は輪の上を進まない(横へずれている)ので、その間は「体が動いていない」時だけ詰まりと見る。
    const ang = Math.atan2(hy, hx);
    const resetRef = () => { s.stallRefAt = gt; s.stallRefAng = ang; s.stallRefX = hx; s.stallRefY = hy; };
    if (gt - s.stallRefAt > 2000) resetRef(); // 久しぶりの周回=見張りをやり直す
    else if (gt - s.stallRefAt >= 800) {
      let adv = s.stallRefAng - ang; adv = Math.atan2(Math.sin(adv), Math.cos(adv)); // 反時計回り=角度が減る=正
      const moved = Math.hypot(hx - s.stallRefX, hy - s.stallRefY);
      const detouring = gt < s.detourUntil;
      const stuck = detouring ? moved < 10 : adv * hero.heroPatrolR < 15;
      if (stuck) {
        s.detourR = detouring && s.detourR > 0 ? -HERO_PATROL_DETOUR_PX : HERO_PATROL_DETOUR_PX;
        s.detourUntil = gt + HERO_PATROL_DETOUR_MS;
      }
      resetRef();
    }
    if (gt >= s.detourUntil) s.detourR = 0;
    const nx = heroPatrolNext(hx, hy, hero.heroPatrolR + s.detourR, 240);
    walkToward({ ...hero, ...patch } as Enemy, nx.x, nx.y, HERO_PATROL_SPEED, dt, gt, patch, 0);
    if (patch.bossState === undefined && state !== 'chase') patch.bossState = 'chase';
    if (hero.heroSnortAt === undefined || gt >= hero.heroSnortAt) {
      if (hero.heroSnortAt !== undefined) sfx.snort(sfxGain);
      patch.heroSnortAt = gt + 12000 + Math.random() * 12000;
    }
    sfx.gallop(sfxGain * 0.4, gallopRate(HERO_PATROL_SPEED));
    applyPatch(hero.id, patch);
    return;
  }

  // ---- 相手がいない: 佇む(前脚で地面を掻き、ときどき巣のまわりを歩いて移る) ----------------------------
  if (!practice && playerDist > HERO_LEASH_PLAYER_PX && fromHome <= HERO_HOME_ARRIVE_PX * 2) {
    if (s.homeIdleSince === null) s.homeIdleSince = gt;
    if (gt - s.homeIdleSince >= HERO_DEPART_IDLE_MS) {
      applyPatch(hero.id, { heroDepartAt: gt, heroShape: undefined });
      // 見えている時だけ一言(見えない所で去るなら何も言わない)。
      if (onScreen) useGameStore.setState({ eventBannerText: '蹄の音が遠ざかる', eventBannerUntil: gt + 2400 });
      return;
    }
  } else {
    s.homeIdleSince = null;
  }
  if (hero.heroLoiterAt === undefined || gt >= hero.heroLoiterAt) {
    const a = Math.random() * Math.PI * 2, r = HERO_LOITER_RADIUS * (0.3 + Math.random() * 0.7);
    Object.assign(patch, {
      heroLoiterX: homeCx + Math.cos(a) * r, heroLoiterY: homeCy + Math.sin(a) * r * 0.5,
      heroLoiterAt: gt + HERO_LOITER_MIN_MS + Math.random() * (HERO_LOITER_MAX_MS - HERO_LOITER_MIN_MS),
    });
  }
  const lx = patch.heroLoiterX ?? hero.heroLoiterX ?? homeCx, ly = patch.heroLoiterY ?? hero.heroLoiterY ?? homeCy;
  const arrived = walkToward({ ...hero, ...patch } as Enemy, lx, ly, HERO_WALK_SPEED * 0.45, dt, gt, patch, 12);
  if (arrived) {
    if (state !== 'hero-idle') Object.assign(patch, { bossState: 'hero-idle', heroStateAt: gt });
    if (hero.heroSnortAt === undefined || gt >= hero.heroSnortAt) {
      if (hero.heroSnortAt !== undefined) sfx.snort(sfxGain);
      patch.heroSnortAt = gt + 10000 + Math.random() * 10000;
    }
    sfx.gallop(0, 1);
  } else {
    if (patch.bossState === undefined) patch.bossState = 'chase';
    sfx.gallop(sfxGain * 0.45, gallopRate(HERO_WALK_SPEED * 0.45));
  }
  applyPatch(hero.id, patch);
};

/** 当たる瞬間: 爆風を積んで振り抜きへ。 */
const strike = (hero: Enemy, move: HeroMoveKey, stepIdx: number, gt: number, patch: Partial<Enemy>): void => {
  const spec = HERO_MOVES[move].steps[stepIdx];
  if (hero.heroShape) pushBlast(hero, hero.heroShape, spec.damage, moveKeyFor(move, stepIdx), spec.kb);
  Object.assign(patch, { bossState: 'hero-strike', bossStateUntil: gt + HERO_STRIKE_MS, heroStateAt: gt, heroShape: undefined, heroHitAt: undefined, vx: 0, vy: 0 });
};

/** 走り: 出だしを強く(いななきから一気に)・終わりで減速。 */
const easeRun = (u: number): number => 1 - Math.pow(1 - u, 2.2);

const faceTowards = (hero: Enemy, tx: number): Partial<Enemy> => {
  const hx = hero.x + hero.width / 2;
  if (Math.abs(tx - hx) < 8) return {};
  return { heroFaceX: tx >= hx ? 1 : -1 };
};
/** 止まっている間に向きだけ合わせる(反転が要る時は合わせない=一拍の間は技の前に取る)。 */
const faceTowardsNoPause = (hero: Enemy, tx: number): Partial<Enemy> => {
  const f = faceTowards(hero, tx);
  return f.heroFaceX === undefined || f.heroFaceX === (hero.heroFaceX ?? -1) ? f : {};
};

const sfxGainAt = (x: number, y: number): number => {
  const st = useGameStore.getState();
  const p = st.player;
  return npcGain(x, y, p.x + p.width / 2, p.y + p.height / 2, st.camera, st.gameBounds);
};


/** 場の英雄を1体選ぶ(居なければ undefined)。 */
export const pickActiveHero = (enemies: readonly Enemy[]): Enemy | undefined =>
  enemies.find(e => isMutantHero(e.type) && !isCorpse(e) && e.health > 0);
