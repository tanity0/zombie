// 進軍NPC(軍人)への被弾の入口(research/ESCORT_TARGETED.md §3)。heroBlast.ts(英雄=第三者の的)と同じ並び・同じ入口名で、
// 「今プレイヤー/守護霊/英雄に当たっている敵の攻撃」を軍人にも当てる。**判定は全部 store 側**(描画は読むだけ)。
// プレイヤー・守護霊の判定・ダメージは1bitも変えない(全て独立の追加分岐)。プレイヤー・守護霊の攻撃は軍人に当たらない(味方)。
//
// 当たるのは **見えている範囲(ズーム込みの可視域ぴったり)** に居て、倒れていなくて、無敵でない軍人だけ(§7 項17)。
// 被弾の量=プレイヤー向けの値そのまま。無敵(被弾後1秒/起き上がり後2秒)・倒れ中・体力なしは damageEscort が弾く。
import { useGameStore, SCREAMER_BUFF_MULT, type PumpkinBlast } from '../store/gameStore';
import type { Enemy } from '../types/game';
import { checkCollision, enemyContactBox } from './collisionUtils';
import { isBiteExemptType, isBodyWallBoss, isBossType, isCorpse, isGuardianPhantom, isHangedman, isReaperFamily } from './enemyUtils';
import { isBiteSubject } from './enemyBite';
import { ESCORT_BODY_RADIUS, canEscortBeHit, escortCenter, escortHitbox } from './escortHealth';
import { hittableEscorts } from './escortView';
import { shapeHitsCircle, shapeSource, type ThirdPartyShape } from './thirdPartyShape';

/** 見えている軍人(倒れていない)のうち、形に触れたものへ当てる。当てた軍人の数を返す。 */
export const hitEscortShape = (s: ThirdPartyShape, amount: number, _srcEnemyId: string | undefined, key: string): number => {
  if (!(amount > 0)) return 0;
  const st = useGameStore.getState();
  const src = shapeSource(s);
  let n = 0;
  for (const e of hittableEscorts(st)) {
    const c = escortCenter(e);
    if (!shapeHitsCircle(s, c.x, c.y, ESCORT_BODY_RADIUS)) continue;
    // 無敵中の再ヒットは damageEscort が弾く(守護霊の damageSummon と同型)。技そのものは止めない。
    if (st.damageEscort(e.id, amount, src.x, src.y, `tp:${key}`).dealt > 0) n++;
  }
  return n;
};

/** 爆風(円/帯/扇)の形を第三者の形へ直す(heroBlast.blastHitsCircle と同じ幾何)。 */
export const blastShape = (b: PumpkinBlast): ThirdPartyShape =>
  b.fan ? { kind: 'fan', cx: b.fan.cx, cy: b.fan.cy, angle: b.fan.angle, halfArc: b.fan.halfArc, radius: b.fan.radius }
  : b.capsule ? { kind: 'capsule', fx: b.capsule.fx, fy: b.capsule.fy, tx: b.capsule.tx, ty: b.capsule.ty, hw: b.capsule.halfWidth }
  : { kind: 'circle', cx: b.x, cy: b.y, r: b.radius };

/** 爆風(パンプキンの着地・城ボスの跳び・削岩型の突き・ボスの技の形 …)を軍人にも当てる。 */
export const applyBlastToEscorts = (b: PumpkinBlast): number => hitEscortShape(blastShape(b), b.damage, b.enemyId, `blast:${b.moveKey ?? (b.capsule ? 'capsule' : 'circle')}`);

/**
 * この敵は、触れた味方(軍人)に「接触ダメージ」を与えるか。プレイヤーの接触(combatTick.applyContactDamage の forEach)と同じ除外を写す:
 * 死体/眠り/ダメージ0/空中の跳び/気絶中/噛みつき個体(噛みで当てる=下のbite経路)/トールの技の最中。
 * 英雄・旗手(接触ダメージ0)・幻影(接触では削らない)・死神系(神付きはプレイヤー専用の覆いかぶさり)は軍人にも接触しない。
 */
export const enemyDealsContactToAllies = (e: Enemy, gameTime: number): boolean => {
  if (isCorpse(e) || e.dormant || !(e.damage > 0)) return false;
  if (isBodyWallBoss(e.type) || isGuardianPhantom(e.type) || isReaperFamily(e.type) || isHangedman(e.type)) return false;
  if (e.aiPhase === 'jump' || e.aiPhase === 'g-jump-air' || e.aiPhase === 'g-trijump-air'
    || (e.type === 'giantbat' && e.aiPhase === 'g-glide-active')) return false;
  if (e.stunUntil !== undefined && gameTime < e.stunUntil) return false;
  // トールの技の最中は本体接触を落とす(技自身の判定に委ねる)。突進の走り(thor-dash-move)だけは本体接触が生きている。
  if (e.type === 'thor' && e.bossState && e.bossState !== 'chase' && e.bossState !== 'return' && e.bossState !== 'thor-dash-move') return false;
  if (isBiteSubject(e, isBiteExemptType, gameTime)) return false;
  return true;
};

/**
 * 接触(体当たり)を軍人にも当てる(§3 系統1)。軍人1人につき、触れている敵のうち一番大きい接触ダメージを1回だけ
 * (英雄 applyContactToHero と同じ=群れで同フレームに多重ヒットしない。被弾後1秒の無敵が連続ヒットを止める)。
 * 噛みつき個体の噛み(§12・§16の爪/叩き)は combatTick の噛みつきの解決が軍人にも当てる(=ここでは扱わない)。
 */
export const applyContactToEscorts = (gameTime: number, redNightActive: boolean, screamerBuffUntil: number): number => {
  const st = useGameStore.getState();
  const targets = hittableEscorts(st);
  if (targets.length === 0) return 0;
  const rn = redNightActive ? 2 : 1;
  let hits = 0;
  for (const t of targets) {
    const hb = escortHitbox(t);
    let best = 0; let src: Enemy | undefined;
    for (const e of st.enemies) {
      if (!enemyDealsContactToAllies(e, gameTime)) continue;
      if (!checkCollision(hb, enemyContactBox(e))) continue;
      const sc = (screamerBuffUntil > gameTime && e.type !== 'screamer' && !isBossType(e.type)) ? SCREAMER_BUFF_MULT : 1; // 叫喚型の強化窓(プレイヤーの接触と同じ)
      const dmg = e.damage * rn * sc;
      if (dmg > best) { best = dmg; src = e; }
    }
    if (!src) continue;
    if (st.damageEscort(t.id, best, src.x + src.width / 2, src.y + src.height / 2, `contact:${src.type}`).dealt > 0) hits++;
  }
  return hits;
};

/**
 * 敵弾(hostile な弾)を軍人にも当てる(§3 系統2)。プレイヤーと守護霊の解決の**後**に残っている弾だけを見る。
 * 当たった弾はプレイヤー被弾と同じく消える。ただし無敵中の軍人は弾を素通しする(盾にならない)。紅き夜は×2。
 * 当てた弾の数を返す。
 */
export const applyEnemyProjectilesToEscorts = (
  redNightActive: boolean, screamerBuffUntil: number, gameTime: number,
  onHit: (x: number, y: number) => void,
): number => {
  const st = useGameStore.getState();
  const targets = hittableEscorts(st);
  if (targets.length === 0) return 0;
  const rn = redNightActive ? 2 : 1;
  let n = 0;
  for (const proj of st.projectiles) {
    // 敵の手榴弾(idol)は信管でのみ爆発する(プレイヤーの checkProjectilePlayerCollisions と同じ除外)。
    if (!proj.hostile || proj.weaponType === 'grenade') continue;
    for (const e of targets) {
      // 無敵中(被弾後1秒/起き上がり後2秒)の軍人は弾を消さない=後ろのプレイヤーの盾にならない(当たっても何も起きない相手に弾を消されない)。
      if (!canEscortBeHit(e, gameTime)) continue;
      if (!checkCollision(proj, escortHitbox(e))) continue;
      // 叫喚型の強化窓中は通常敵(ボス/screamer以外)の飛び道具ダメージも×SCREAMER_BUFF_MULT(プレイヤーの被弾と同じ)。
      const sc = (screamerBuffUntil > gameTime && proj.ownerType && proj.ownerType !== 'screamer' && !isBossType(proj.ownerType)) ? SCREAMER_BUFF_MULT : 1;
      useGameStore.getState().damageEscort(e.id, proj.damage * rn * sc, proj.x + proj.width / 2, proj.y + proj.height / 2, `proj:${proj.srcMoveKey ?? proj.ownerType ?? 'unknown'}`);
      useGameStore.getState().removeProjectile(proj.id);
      onHit(proj.x + proj.width / 2, proj.y + proj.height / 2);
      n++;
      break;
    }
  }
  return n;
};
