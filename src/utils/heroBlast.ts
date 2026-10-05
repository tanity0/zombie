// 英雄(変異)の「当たり」の配線(research/MUTANT_HERO.md §4)。
// - 英雄の技(持ち主が英雄の爆風)を、プレイヤー・守護霊に加えて**敵にも**当てる。
// - 敵の攻撃(持ち主が英雄以外の爆風・弾・接触・技)を**英雄にも**当てる(第三者の的)。
// 判定は全部 store 側(描画は読むだけ)。プレイヤーへの判定・ダメージは1bitも変えない(全て独立の追加分岐)。
import { heroHealAfterKills } from './heroScript';
import type { Enemy } from '../types/game';
import { useGameStore, knockbackSpeedFor, setThirdPartyHook, type PumpkinBlast } from '../store/gameStore';
import { isCorpse, isMutantHero, resistsChipKnockback } from './enemyUtils';
import { isPointInZoomedViewport } from './cameraZoom';
import { distToBandRect } from './geometry';
import { enemyContactBox } from './collisionUtils';
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
  // 昇天中(社長指示2026-10-05)は的にならない=敵はプレイヤーへ戻る。
  return h && heroOnScreen(h) && h.bossState !== 'hero-ascend' ? h : undefined;
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
  // 眠っている個体(休眠中のボス等)には当てない(英雄の狙いの候補と同じ=起こさない)。
  const victims = st.enemies.filter(e => e.id !== hero.id && !isCorpse(e) && e.health > 0 && !e.dormant
    && blastHitsCircle(b, e.x + e.width / 2, e.y + e.height / 2, radiusOf(e)));
  let kills = 0;
  for (const e of victims) {
    const ex = e.x + e.width / 2, ey = e.y + e.height / 2;
    const killed = useGameStore.getState().damageEnemy(e.id, dmg, false, false, false, null, 'neutral');
    if (killed) kills++;
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
  // 社長指示2026-10-05「敵を倒すと100ずつ回復する」(誰の撃破か=英雄自身が倒した敵・推薦の案A): 倒した数ぶん回復。
  // 満タンになったら次のtickで昇天(heroTick)。回復は緑の数字で見せる(派手さの絵・判定なし)。
  if (kills > 0) {
    const cur = useGameStore.getState().enemies.find(e => e.id === hero.id);
    if (cur && cur.bossState !== 'hero-ascend' && cur.health > 0) {
      const healed = heroHealAfterKills(cur.health, cur.maxHealth, kills);
      if (healed > cur.health) {
        useGameStore.setState(s2 => ({ enemies: s2.enemies.map(en => en.id === hero.id ? { ...en, health: healed } : en) }));
        useGameStore.getState().spawnCallout(hx, hero.y - 18, `+${healed - cur.health}`, '#e7dccb'); // 英雄の色(骨色)=プレイヤーの回復の緑と分ける
      }
    }
  }
  return victims.length;
};

/** 英雄の今の技で、だれかに当たったことを英雄に書く(つなぎと休みの判定)。 */
export const markHeroHit = (heroId: string): void => {
  useGameStore.setState(s2 => ({ enemies: s2.enemies.map(e => (e.id === heroId && !e.heroHitSomething ? { ...e, heroHitSomething: true } : e)) }));
};

/** 英雄が雑魚の接触を受ける間隔(gameTime ms)。プレイヤーの被弾無敵と同じ考え方=毎フレーム削られない。 */
export const HERO_CONTACT_INTERVAL_MS = 450;
let heroContactAt = -1e9;
export const resetHeroContactForTest = (): void => { heroContactAt = -1e9; };

/**
 * 雑魚・強個体の接触を英雄にも当てる(§4-2-5)。英雄に触れている敵のうち一番大きい接触ダメージを1回だけ。
 * ボス級・終端の本体接触も含む(敵の攻撃は全部当たる)。英雄自身と死体・眠っている敵は除く。
 */
export const applyContactToHero = (gameTime: number): boolean => {
  const h = heroAsTarget();
  if (!h || gameTime - heroContactAt < HERO_CONTACT_INTERVAL_MS) return false;
  let best = 0, src: string | undefined;
  for (const e of useGameStore.getState().enemies) {
    if (e.id === h.id || isCorpse(e) || e.dormant || e.damage <= 0) continue;
    const b = enemyContactBox(e);
    if (b.x + b.width < h.x || h.x + h.width < b.x || b.y + b.height < h.y || h.y + h.height < b.y) continue;
    if (e.damage > best) { best = e.damage; src = e.id; }
  }
  if (best <= 0) return false;
  heroContactAt = gameTime;
  damageHeroByEnemy(h.id, best, src);
  return true;
};

// =================================================================================================
// 第三者の的(守護霊+英雄)— research/MUTANT_HERO.md §4-1 / §4-2-1・2
// 「今プレイヤーにしか当たっていない技」を、同じ形・同じダメージ・同じ時刻で守護霊と英雄にも当てる入口。
// プレイヤーへの判定は呼び手のまま(ここは独立の追加分岐)。
// =================================================================================================
/** (旧: 守護霊の弾きの音の注入口。弾きを外したので何もしない。呼び手の互換のために残す。) */
export const setThirdPartySfx = (_fn: (key: 'counter' | 'headshot', gain: number) => void): void => {};

// 形の型は葉モジュールに置く(gameStore がこの型を使う=ここに置くと循環importになる)。
export type { ThirdPartyShape } from './thirdPartyShape';
import type { ThirdPartyShape } from './thirdPartyShape';

/** 円(中心・半径)の相手に形が触れるか。 */
export const shapeHitsCircle = (s: ThirdPartyShape, cx: number, cy: number, r: number): boolean => {
  if (s.kind === 'circle') return Math.hypot(cx - s.cx, cy - s.cy) <= s.r + r;
  if (s.kind === 'capsule') return distToBandRect({ x: cx, y: cy }, { x: s.fx, y: s.fy }, { x: s.tx, y: s.ty }, s.hw) <= r;
  if (s.kind === 'fan') return circleHitsFan(cx, cy, r, s.cx, s.cy, s.angle, s.halfArc, s.radius);
  if (s.kind === 'test') return s.hits(cx, cy, r);
  const nx = Math.max(s.x, Math.min(cx, s.x + s.w)), ny = Math.max(s.y, Math.min(cy, s.y + s.h));
  return Math.hypot(cx - nx, cy - ny) <= r;
};

/**
 * 英雄は無敵時間を持たない(敵なので)。続けて当たり続ける技(帯の持続・床・360度の鞭など)が毎フレーム削らないよう、
 * 同じ技(key)からの当たりは HERO_REHIT_MS に1回(プレイヤーの被弾無敵と同じ長さ)。
 */
export const HERO_REHIT_MS = 700;
const heroRehit = new Map<string, number>();
export const resetHeroRehitForTest = (): void => { heroRehit.clear(); };

/** 形が英雄に触れたら当てる(同じ技から700msに1回)。 */
export const hitHeroShape = (s: ThirdPartyShape, amount: number, srcEnemyId: string | undefined, key: string): boolean => {
  const h = heroAsTarget();
  if (!h || h.id === srcEnemyId || amount <= 0) return false;
  if (!shapeHitsCircle(s, h.x + h.width / 2, h.y + h.height / 2, radiusOf(h))) return false;
  const gt = useGameStore.getState().gameTime;
  const k = `${srcEnemyId ?? '?'}:${key}`;
  if (gt - (heroRehit.get(k) ?? -1e9) < HERO_REHIT_MS) return false;
  heroRehit.set(k, gt);
  if (heroRehit.size > 64) { for (const [kk, t] of heroRehit) if (gt - t > HERO_REHIT_MS) heroRehit.delete(kk); }
  damageHeroByEnemy(h.id, amount, srcEnemyId);
  return true;
};

/**
 * 形が守護霊に触れたら当てる。窓が生きていれば弾く(守護霊のカウンター=ダメージなし+成立の演出)。
 * 被弾の間引きは damageSummon の無敵時間(プレイヤーと同じ)。技そのものは止めない(新しく当たる技の扱い・§10a)。
 */
export const hitGhostShape = (s: ThirdPartyShape, amount: number, _srcEnemyId: string | undefined, key: string): boolean => {
  const st = useGameStore.getState();
  const g = st.summons.find(su => su.kind === 'ghost-ally');
  if (!g || amount <= 0) return false;
  const gx = g.x + g.width / 2, gy = g.y + g.height / 2;
  if (!shapeHitsCircle(s, gx, gy, radiusOf(g))) return false;
  // ★守護霊のカウンター(弾き)はここでは成立させない(検収監査 A-5): この入口に来るのは「今までプレイヤーにしか当たって
  // いなかった技」で、紫(カウンター不可)の技や間合い条件を持つ技が混ざる。無条件に弾けると色の文法(紫=弾けない)と
  // 守護霊のプレイヤーと同条件が崩れる。守護霊は当たったら受ける(被弾の間引きは damageSummon の無敵時間)。
  const fromX = s.kind === 'circle' ? s.cx : s.kind === 'capsule' || s.kind === 'test' ? s.fx : s.kind === 'fan' ? s.cx : s.x + s.w / 2;
  const fromY = s.kind === 'circle' ? s.cy : s.kind === 'capsule' || s.kind === 'test' ? s.fy : s.kind === 'fan' ? s.cy : s.y + s.h / 2;
  st.damageSummon(g.id, amount, fromX, fromY, `tp:${key}`);
  return true;
};

/** 守護霊と英雄の両方へ(今プレイヤーにしか当たっていない技の追加分岐)。 */
export const hitThirdParties = (s: ThirdPartyShape, amount: number, srcEnemyId: string | undefined, key: string): void => {
  hitGhostShape(s, amount, srcEnemyId, key);
  hitHeroShape(s, amount, srcEnemyId, key);
};

// gameStore 内の技(城ボスの継続技など)が当てに来る入口を登録する(gameStore は heroBlast を import できない=循環)。
setThirdPartyHook(hitThirdParties);
