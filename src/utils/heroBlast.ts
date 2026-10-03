// 英雄(変異)の「当たり」の配線(research/MUTANT_HERO.md §4)。
// - 英雄の技(持ち主が英雄の爆風)を、プレイヤー・守護霊に加えて**敵にも**当てる。
// - 敵の攻撃(持ち主が英雄以外の爆風・弾・接触・技)を**英雄にも**当てる(第三者の的)。
// 判定は全部 store 側(描画は読むだけ)。プレイヤーへの判定・ダメージは1bitも変えない(全て独立の追加分岐)。
import type { Enemy } from '../types/game';
import { useGameStore, knockbackSpeedFor, type PumpkinBlast } from '../store/gameStore';
import { isCorpse, isMutantHero, resistsChipKnockback } from './enemyUtils';
import { isPointInZoomedViewport } from './cameraZoom';
import { distToBandRect } from './geometry';
import { circleHitsFan, HERO_INCOMING_MULT, HERO_VS_ENEMY_MULT } from './heroScript';

/** 当たり半径(矩形の長い辺の半分=守護霊・プレイヤーと同じ流儀)。 */
const radiusOf = (e: { width: number; height: number }): number => Math.max(e.width, e.height) / 2;

/** 場に居る英雄(死体を除く)。 */
export const findHero = (enemies: readonly Enemy[]): Enemy | undefined =>
  enemies.find(e => isMutantHero(e.type) && !isCorpse(e) && e.health > 0);

/** 英雄の中心が画面(ズーム込み)の中か。画面外の英雄は攻撃しない・受けない(§6-2)。 */
export const heroOnScreen = (e: Enemy): boolean => {
  const st = useGameStore.getState();
  return isPointInZoomedViewport(e.x + e.width / 2, e.y + e.height / 2, st.camera, st.gameBounds, st.viewZoom);
};

/** 第三者の的としての英雄(画面内に居る時だけ)。 */
export const heroAsTarget = (): Enemy | undefined => {
  const h = findHero(useGameStore.getState().enemies);
  return h && heroOnScreen(h) ? h : undefined;
};

/**
 * 敵の攻撃が英雄に当たった。量はプレイヤー向けの値 × HERO_INCOMING_MULT。攻撃した本人が英雄なら何もしない。
 * ヒットストップ・揺れ・プレイヤーの連撃数には数えない(damageChannel=null)・ヘイトにも数えない('neutral')。
 */
export const damageHeroByEnemy = (heroId: string, amount: number, srcEnemyId: string | undefined): boolean => {
  if (amount <= 0) return false;
  const st = useGameStore.getState();
  const hero = st.enemies.find(e => e.id === heroId);
  if (!hero || hero.id === srcEnemyId) return false;
  return st.damageEnemy(heroId, Math.round(amount * HERO_INCOMING_MULT), false, false, false, null, 'neutral');
};

/** 円の攻撃(中心・半径)が英雄に触れたら当てる。 */
export const hitHeroCircle = (cx: number, cy: number, r: number, amount: number, srcEnemyId?: string): boolean => {
  const h = heroAsTarget();
  if (!h || h.id === srcEnemyId) return false;
  if (Math.hypot(h.x + h.width / 2 - cx, h.y + h.height / 2 - cy) > r + radiusOf(h)) return false;
  damageHeroByEnemy(h.id, amount, srcEnemyId);
  return true;
};

/** 帯(線分+半幅)の攻撃が英雄に触れたら当てる。 */
export const hitHeroCapsule = (fx: number, fy: number, tx: number, ty: number, halfWidth: number, amount: number, srcEnemyId?: string): boolean => {
  const h = heroAsTarget();
  if (!h || h.id === srcEnemyId) return false;
  if (distToBandRect({ x: h.x + h.width / 2, y: h.y + h.height / 2 }, { x: fx, y: fy }, { x: tx, y: ty }, halfWidth) > radiusOf(h)) return false;
  damageHeroByEnemy(h.id, amount, srcEnemyId);
  return true;
};

/** 矩形の攻撃(弾など)が英雄の矩形に重なったら当てる。 */
export const hitHeroRect = (r: { x: number; y: number; width: number; height: number }, amount: number, srcEnemyId?: string): boolean => {
  const h = heroAsTarget();
  if (!h || h.id === srcEnemyId) return false;
  if (r.x + r.width < h.x || h.x + h.width < r.x || r.y + r.height < h.y || h.y + h.height < r.y) return false;
  damageHeroByEnemy(h.id, amount, srcEnemyId);
  return true;
};

/** 爆風の形(円/帯/扇)が、中心 (cx,cy)・半径 r の相手に触れるか。プレイヤー・守護霊・英雄・敵で同じ式。 */
export const blastHitsCircle = (b: PumpkinBlast, cx: number, cy: number, r: number): boolean => {
  if (b.fan) return circleHitsFan(cx, cy, r, b.fan.cx, b.fan.cy, b.fan.angle, b.fan.halfArc, b.fan.radius);
  if (b.capsule) return distToBandRect({ x: cx, y: cy }, { x: b.capsule.fx, y: b.capsule.fy }, { x: b.capsule.tx, y: b.capsule.ty }, b.capsule.halfWidth) <= r;
  return Math.hypot(cx - b.x, cy - b.y) <= b.radius + r;
};

/** 敵(英雄以外)の爆風を英雄にも当てる(§4-2-4)。当てたら true。 */
export const applyBlastToHero = (b: PumpkinBlast): boolean => {
  const h = heroAsTarget();
  if (!h || h.id === b.enemyId) return false;
  if (!blastHitsCircle(b, h.x + h.width / 2, h.y + h.height / 2, radiusOf(h))) return false;
  damageHeroByEnemy(h.id, b.damage, b.enemyId);
  return true;
};

export interface HeroBlastFx {
  spawnBurst: (x: number, y: number, color: string, count?: number) => void;
  spawnDamageNumber: (x: number, y: number, value: number, crit?: boolean) => void;
}

/**
 * 英雄の爆風を、予告の中にいた敵(死体・英雄自身を除く・ステージのボスや賞金首も含む)全員に1回ずつ当てる(§4-4)。
 * ダメージ=プレイヤー向けの値 × HERO_VS_ENEMY_MULT。倒した敵はいつもどおり落とす。血はボスの命中の大きさ。
 * 当たった敵の数を返す。
 */
export const applyHeroBlastToEnemies = (b: PumpkinBlast, fx: HeroBlastFx): number => {
  const st = useGameStore.getState();
  const hero = st.enemies.find(e => e.id === b.enemyId);
  if (!hero || !isMutantHero(hero.type)) return 0;
  const hx = hero.x + hero.width / 2, hy = hero.y + hero.height / 2;
  const dmg = Math.round(b.damage * HERO_VS_ENEMY_MULT);
  const victims = st.enemies.filter(e => e.id !== hero.id && !isCorpse(e) && e.health > 0
    && blastHitsCircle(b, e.x + e.width / 2, e.y + e.height / 2, radiusOf(e)));
  for (const e of victims) {
    const ex = e.x + e.width / 2, ey = e.y + e.height / 2;
    const killed = useGameStore.getState().damageEnemy(e.id, dmg, false, false, false, null, 'neutral');
    fx.spawnDamageNumber(ex, e.y, dmg, false);
    // 派手さの絵(判定ゼロ): 英雄から外へ向かう大きい血しぶき=ボスの命中と同じ大きさ。
    const ang = Math.atan2(ey - hy, ex - hx);
    useGameStore.getState().spawnBlood(ex, ey, ang, 260);
    fx.spawnBurst(ex, ey, '#7f1d1d', 12);
    if (killed) {
      const g = useGameStore.getState();
      g.dropEnemyCurrency(e, ex, ey);
      g.dropEnemyXp(e, ex, ey, 'pickup-xp-hero');
    } else if (!resistsChipKnockback(e.type)) {
      // 技の向きへ大きく吹き飛ぶ(雑魚が宙を舞うのが見せ場)。プレイヤーの近接と同じ速度の窓。
      const kb = b.kbSpeed ?? knockbackSpeedFor(220, 360);
      const kbMs = b.kbMs ?? 360;
      const d = Math.max(0.001, Math.hypot(ex - hx, ey - hy));
      useGameStore.setState(s2 => ({
        enemies: s2.enemies.map(en => en.id === e.id
          ? { ...en, knockbackVx: ((ex - hx) / d) * kb, knockbackVy: ((ey - hy) / d) * kb, knockbackUntil: Date.now() + kbMs }
          : en),
      }));
    }
  }
  return victims.length;
};

/** 英雄の今の技で、だれかに当たったことを英雄に書く(つなぎと休みの判定)。 */
export const markHeroHit = (heroId: string): void => {
  useGameStore.setState(s2 => ({ enemies: s2.enemies.map(e => (e.id === heroId && !e.heroHitSomething ? { ...e, heroHitSomething: true } : e)) }));
};
