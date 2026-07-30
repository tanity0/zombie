// PACING_PUZZLE.md §5.18 バッチM17: プレイヤー被ダメ経路のヘッドレス化(切り出しリファクタ・
// 挙動変更ゼロ)。src/hooks/useGameLoop.ts に残っていた被ダメ5経路を、レンダラ非依存の関数として
// ここへ移す(useGameLoop/playtestDriver の両方から呼ぶ)。数値・ゲート・分岐・呼び出し順序は
// 元のuseGameLoop.tsの該当ブロックと一切変えていない(コード移動のみ)。
//
// 移した経路(呼び出しは実フレームの実行順=⑤→②→③→④→①。useGameLoop.ts側の呼び出し位置は
// 元のブロックと同じ場所のまま=実機の挙動は完全不変。ヘッドレス側(playtestDriver.ts)もこの
// 順序で呼ぶことで実機と同じゲームになる):
//   ⑤ ジャンプ落下攻撃の爆風(pumpkinBlasts消化) → applyPumpkinBlastDamage
//   ② 敵の発砲(投射物追加) → applyEnemyFire
//   ③ 敵弾→プレイヤー命中(カウンター反射/ボムカウンター込み) → applyEnemyProjectileHits
//   ④ 地雷 → applyMineDamage
//   ① 敵接触ダメージ(カウンター/パリィ丸ごと) → applyContactDamage
//
// 対象外(従来どおり網の外・ここにも移していない): ボス攻撃(ミーミルレーザー/トール各技)・
// ハンター・雪原/ラボ経路。紅き月倍率(rnMult/rnMelee)と叫喚バフ(scMult/scMelee)は
// 呼び出し側から引数で受け取る(useGameLoop側は現行の計算値・playtestDriver側は「発動なし」の
// 入力=redNightActive:false/screamerBuffUntil:0を渡すことで実質1倍になる。挙動を変えず
// 素の値を計算する式自体は一切変えていない)。
//
// 演出呼び出し(playSfx/spawnFlash/spawnRing/spawnBurst/spawnGlow/spawnCallout/spawnDamageNumber/
// spawnEggFluidSplash/triggerHitImpact/addMeleeFinishCombo/死亡演出)は CombatEffects として
// 注入する。useGameLoop.tsは実物のstoreアクション/ローカル関数をそのまま渡し、playtestDriver.tsは
// no-op(何もしない関数)を渡す=ヘッドレスでは判定条件はそのまま評価されるが、見た目/音/
// gameOver遷移だけが起きない。

import type { Enemy, Player } from '../types/game';
import type { SfxKey } from '../audio/audioManager';
import {
  isBossType, isHiddenBoss, resolveEnemyTarget, getEnemyFireProfile, createEnemyProjectile,
} from './enemyUtils';
import { ALCHEMY_AGGRO_RANGE } from './summonUtils';
import { activeFlareTargets } from './flareGun';
import { getActiveGun } from './weaponUtils';
import { checkPlayerEnemyCollisions, checkProjectilePlayerCollisions, checkCollision } from './collisionUtils';
import { isEngageableBoss } from './bossEngagement'; // G4b: 「ボスの技」の正本テーブル(BOT_AND_GHOST.mdの対象ボス群)
import { EGG_BLAST_RADIUS } from '../world/mines';
import {
  useGameStore, isSeekerActive, skillLevel, counterReplyDamage, enemyDeathLabel,
  ENEMY_ATTACK_SPEED_MULT, SCREAMER_BUFF_MULT,
  COUNTER_EXTEND_PER_HIT, COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG,
  MELEE_FINISH_SLOW_MS, MELEE_FINISH_SLOW_HOLD_MS,
  KNOCKBACK_DURATION, COUNTER_KNOCKBACK_LAUNCH, COUNTER_KNOCKBACK_SPEED,
  PLAYER_KNOCKBACK_SPEED, PLAYER_KNOCKBACK_MS,
  CRIT_DAMAGE_MULT, BOSS_CRIT_DAMAGE_MULT, STUN_DURATION_MS,
  GIANT_SCRIPT_ENABLED,
  bossCritCdMult,
} from '../store/gameStore';
import { distToSegment } from './levelUpGate';
import { notifyCounterHit, notifyMoveCounter } from './playerTraits'; // BOT_AND_GHOST.md G1/G4a(計測専用・挙動不変)
import { contactDamageMoveKey } from './moveReaction'; // G4a(§2.9): 接触被弾の技キー導出(記録専用)
import { refundCounterCooldown } from './counterMaster'; // counter-master v2(CD_REWORK.md 確定2)
import { peekGhostCounterClaim, consumeGhostCounterClaim, applyGhostCounterEffect } from './ghostCounter'; // v0.25.2480: 守護霊カウンターの城ボス系合流
import { npcSfxDistGain } from './npcSfx'; // CRIT-UNIFY §9.3: ゴーストのブラストパリィ成立SEの距離減衰(escort/他ゴースト経路と同流儀)

// 演出・音・死亡演出のコールバック注入(ヘッドレスではno-op)。判定条件自体はこのファイル内に残る。
export interface CombatEffects {
  playSfx: (key: SfxKey, gainMult?: number, durationMsOverride?: number) => void;
  spawnFlash: (color: string, duration?: number) => void;
  spawnRing: (x: number, y: number, startRadius: number, endRadius: number, color: string, width?: number, duration?: number) => void;
  spawnBurst: (x: number, y: number, color: string, count?: number) => void;
  spawnGlow: (x: number, y: number, radius: number, color: string, duration?: number) => void;
  spawnCallout: (x: number, y: number, text: string, color: string, opts?: { scale?: number; serif?: boolean; bg?: number; holdMs?: number; duration?: number }) => void;
  spawnDamageNumber: (x: number, y: number, value: number, crit?: boolean) => void;
  spawnEggFluidSplash: (x: number, y: number, intensity?: number) => void;
  triggerHitImpact: (stopMs: number, shakeMs: number, shakeMag: number, zoomMag: number) => void;
  addMeleeFinishCombo: (amount?: number) => void;
  triggerPlayerDeath: (x: number, y: number) => void;
  markMeleeSwingFx: () => void;
}

// ヘッドレス(playtestDriver.ts)用: 全て何もしない(判定条件の評価そのものには影響しない)。
export const NOOP_COMBAT_EFFECTS: CombatEffects = {
  playSfx: () => {},
  spawnFlash: () => {},
  spawnRing: () => {},
  spawnBurst: () => {},
  spawnGlow: () => {},
  spawnCallout: () => {},
  spawnDamageNumber: () => {},
  spawnEggFluidSplash: () => {},
  triggerHitImpact: () => {},
  addMeleeFinishCombo: () => {},
  triggerPlayerDeath: () => {},
  markMeleeSwingFx: () => {},
};

// ==== G4b(BOT_AND_GHOST.md §2.9・社長裁定「1:は当然当たらないと意味がない」v0.25.2454返信) ====
// ボスの特殊技をゴースト(summons kind='ghost-ally')にも当てる。掟:
//  - 判定式はプレイヤーと同じ幾何(円=中心距離<=半径+当たり半径 / カプセル=distToSegment)。
//    ゴーストの位置・当たり半径はsummonの既存値(中心+max(w,h)/2。矩形判定の弾はsummonの矩形そのまま)。
//  - ダメージはプレイヤーが受けるのと同じ量。HP減算/死亡→解散は既存のdamageSummon(i-frame=INVULN_MS・
//    health<=0でsummonsから除去=解散)に乗せる。新しい死亡処理は作らない。
//  - ノックバック・画面シェイク・被弾音などプレイヤー専用の副作用は付けない。被弾表現は既存の
//    summon被弾と同じ(青バースト#bae6fd×3+描画側がlastHitでシェイク)。
//  - プレイヤーへの判定・ダメージは1bitも変えない(全て独立した追加分岐)。
//  - ゴースト不在時のコストゼロ: 各フックはsummonsのfind(通常0〜2件)だけで即抜ける。

/** 場に居るゴースト(守護霊)。不在ならundefined(全G4bフックの共通ゲート)。 */
const findGhostAlly = () => useGameStore.getState().summons.find(s => s.kind === 'ghost-ally');

/**
 * ゴーストへのボス技ダメージ適用(既存経路に乗せるだけ)。実際にHPが減った時(i-frame外)だけ
 * 既存のsummon被弾表現(青バースト)を出す。死亡時はdamageSummonのfilterが除去=既存の解散経路。
 */
// v0.25.2514(監査項目7): fromX/fromY=ダメージ源(爆心/技の起点/弾の位置)。被弾ノックバックの向きに使う
// (プレイヤーのdamagePlayerと同じ引数の意味)。省略時はノックバックなし=従来挙動。
const damageGhostAllyByBossMove = (
  ghostId: string, amount: number, burst?: (x: number, y: number) => void,
  fromX?: number, fromY?: number,
): void => {
  const before = useGameStore.getState().summons.find(s => s.id === ghostId);
  if (!before) return;
  useGameStore.getState().damageSummon(ghostId, amount, fromX, fromY);
  const after = useGameStore.getState().summons.find(s => s.id === ghostId);
  if (burst && after && after.health < before.health) {
    burst(after.x + after.width / 2, after.y + after.height / 2);
  }
};

/**
 * 線分カプセル技(トール一閃/突き/払い・ミーミルレーザー)のゴースト被弾。プレイヤー側の判定
 * (線分への射影距離<=halfWidth+当たり半径)と同じ幾何をゴースト中心で評価する。useGameLoopの
 * ボス技ブロック(技のactive中・毎フレーム)から呼ぶ=タイミングも同じ。連続ヒットはdamageSummonの
 * i-frame(INVULN_MS)が間引く(プレイヤーのdamagePlayer i-frameと同型)。
 */
export const applyGhostAllyCapsuleHit = (
  fx0: number, fy0: number, tx0: number, ty0: number, halfWidth: number, damage: number,
  burst?: (x: number, y: number) => void,
): void => {
  const ghost = findGhostAlly();
  if (!ghost) return;
  const gcx = ghost.x + ghost.width / 2, gcy = ghost.y + ghost.height / 2;
  const gr = Math.max(ghost.width, ghost.height) / 2;
  if (distToSegment({ x: gcx, y: gcy }, { x: fx0, y: fy0 }, { x: tx0, y: ty0 }) <= halfWidth + gr) {
    // 被弾KBの源=技の起点(ボス側)=プレイヤー側のカプセル技被弾と同じ「飛んできた方から弾かれる」向き。
    damageGhostAllyByBossMove(ghost.id, damage, burst, fx0, fy0);
  }
};

// useGameLoop.ts側のローカル定数(値そのものは元のまま・二重管理を避けるため引数化)。
// - thorOrbitDist/thorCounterLeapMs: トール(裏ボス)のジャンプ攻撃パリィ後の後退旋回に使う値。
// - grenadeBlastRadius/grenadeBlastDamageMult: ボムカウンターで反射弾がランチャー化した時の爆発。
// - counterReflectSlowMs: 弾反射カウンター成立時のリング/グロー演出時間。
export interface CombatTunables {
  thorOrbitDist: number;
  thorCounterLeapMs: number;
  grenadeBlastRadius: number;
  grenadeBlastDamageMult: number;
  counterReflectSlowMs: number;
}

// ⑤ パンプキン/lab-zombie-3のジャンプ着地爆発(範囲狭め)。store が記録した着地点(pumpkinBlasts)を
// 消化し、爆発FXを出しつつ半径内ならプレイヤーへダメージ(無敵中は無効)。カウンター窓中ならパリィ
// (クリティカル反撃+トールは後退旋回へ移行)。死亡時は triggerPlayerDeath を呼ぶ。
export const applyPumpkinBlastDamage = (fx: CombatEffects, tunables: Pick<CombatTunables, 'thorOrbitDist' | 'thorCounterLeapMs'>): void => {
  const blasts = useGameStore.getState().pumpkinBlasts;
  if (blasts.length === 0) return;
  // スカジ氷=専用SE(社長提供) / それ以外(パンプキン着地等)=heavy-impact。
  if (blasts.some(b => !b.ice)) fx.playSfx('heavy-impact');
  if (blasts.some(b => b.ice)) fx.playSfx('skadi-ice');
  const bp = useGameStore.getState().player;
  const bpcx = bp.x + bp.width / 2;
  const bpcy = bp.y + bp.height / 2;
  const counterActive = Date.now() <= bp.counterWindowEnd;
  const parriedEnemyIds: { id: string; bx: number; by: number }[] = [];
  // G4b: 爆発/カプセルの合流点=ここでゴーストも受ける(タグ付き21箇所超を一括カバー)。対象は
  // **ボス(isEngageableBoss)の爆発のみ**(パンプキン/lab-zombie-3の着地爆発=非ボスは従来どおり
  // プレイヤーのみ)。ゴースト不在ならfind1回で抜ける=コストゼロ。位置/半径はループ前のスナップ
  // ショットでよい(この解決ループ中にゴーストは動かない。多重ヒットはdamageSummonのi-frameが間引く)。
  const ghostAlly = findGhostAlly();
  const enemiesForGhost = ghostAlly ? useGameStore.getState().enemies : [];
  const gacx = ghostAlly ? ghostAlly.x + ghostAlly.width / 2 : 0;
  const gacy = ghostAlly ? ghostAlly.y + ghostAlly.height / 2 : 0;
  const gar = ghostAlly ? Math.max(ghostAlly.width, ghostAlly.height) / 2 : 0;
  for (const b of blasts) {
    if (b.ice) {
      // スカジ氷=青版の爆発エフェクト(社長指示。爆発処理自体は流用)。
      fx.spawnFlash('rgba(140,200,255,0.16)', 200);
      fx.spawnRing(b.x, b.y, 6, b.radius, 'rgba(150,210,255,0.9)', 4, 300);
      fx.spawnBurst(b.x, b.y, '#bfe6ff', 16);
      fx.spawnGlow(b.x, b.y, b.radius, 'rgba(150,210,255,', 280);
    } else {
      fx.spawnFlash('rgba(255,150,60,0.16)', 200);
      fx.spawnRing(b.x, b.y, 6, b.radius, 'rgba(255,170,80,0.9)', 4, 300);
      fx.spawnBurst(b.x, b.y, '#fb923c', 16);
    }
    const pr = Math.max(bp.width, bp.height) / 2;
    // M51: 薙ぎ払い(capsule付き)は円ではなく直線+半幅のカプセル判定(distToSegment流用)。
    // それ以外(パンプキン着地/スカジ氷等)は既存どおり円形(爆心からの距離<=半径+双方の当たり半径)。
    const inBlast = b.capsule
      ? distToSegment({ x: bpcx, y: bpcy }, { x: b.capsule.fx, y: b.capsule.fy }, { x: b.capsule.tx, y: b.capsule.ty }) <= b.capsule.halfWidth + pr
      : Math.hypot(bpcx - b.x, bpcy - b.y) <= b.radius + pr;
    if (inBlast) {
      if (counterActive) {
        // カウンター成立は無敵中でも弾く(=確実にノックバック+クリ反撃)。
        // ※以前は !invulnerable を前提にしていたため、被弾i-frame中だとパリィが
        //   丸ごとスキップされ「カウンターしたのにノックバックしない」が起きていた。
        parriedEnemyIds.push({ id: b.enemyId, bx: b.x, by: b.y });
      } else if (!bp.invulnerable) {
        const blastEnemyType = useGameStore.getState().enemies.find(e => e.id === b.enemyId)?.type;
        // G4a: b.moveKey=どの技の爆発か(記録専用タグ・未設定なら従来どおりundefined)。
        const died = useGameStore.getState().damagePlayer(b.damage, `${enemyDeathLabel(blastEnemyType ?? '')}の落下攻撃`, undefined, undefined, undefined, undefined, b.moveKey);
        fx.playSfx('player-damage');
        // 弾き出し: 爆心から外向きにプレイヤーをノックバック。
        const ddx = bpcx - b.x, ddy = bpcy - b.y;
        const dd = Math.max(0.001, Math.hypot(ddx, ddy));
        useGameStore.setState(st => ({ player: {
          ...st.player,
          knockbackVx: (ddx / dd) * PLAYER_KNOCKBACK_SPEED,
          knockbackVy: (ddy / dd) * PLAYER_KNOCKBACK_SPEED,
          knockbackUntil: Date.now() + PLAYER_KNOCKBACK_MS,
        } }));
        if (died) fx.triggerPlayerDeath(bpcx, bpcy);
      }
    }
    // G4b: 同じ爆発をゴーストにも(プレイヤーと同じ幾何・同じ量・同じ解決ループ内)。
    // CRIT-UNIFY §9.3(ゴーストのパリティ拡張): プレイヤーと同じく「ブラストパリィ」を持たせる。
    // ただしプレイヤーのcounterWindowEnd(400ms)ではなく、ゴースト自身のカウンター請求TTL窓
    // (150ms・GHOST_COUNTER_CLAIM_TTL_MS)で成立させる(ゴーストは狭い側許容=既存の作法)。
    // 成立時は共通変換applyGhostCounterEffect(確定クリ+付与無敵)へ合流し、被弾させない。
    // 請求が無い/期限切れなら従来どおり食らう(ゴーストは弾けない=居れば食らう。i-frameはdamageSummon側)。
    if (ghostAlly) {
      const owner = enemiesForGhost.find(e => e.id === b.enemyId);
      if (owner && isEngageableBoss(owner.type)) {
        const inBlastGhost = b.capsule
          ? distToSegment({ x: gacx, y: gacy }, { x: b.capsule.fx, y: b.capsule.fy }, { x: b.capsule.tx, y: b.capsule.ty }) <= b.capsule.halfWidth + gar
          : Math.hypot(gacx - b.x, gacy - b.y) <= b.radius + gar;
        if (inBlastGhost) {
          const gClaim = consumeGhostCounterClaim(b.enemyId, Date.now());
          if (gClaim) {
            applyGhostCounterEffect(owner, gacx, gacy, { claim: gClaim, sfxGain: npcSfxDistGain(gacx, gacy, bpcx, bpcy, useGameStore.getState().camera, useGameStore.getState().gameBounds) }, (key, gain) => fx.playSfx(key, gain));
          } else {
            damageGhostAllyByBossMove(ghostAlly.id, b.damage, (x, y) => fx.spawnBurst(x, y, '#bae6fd', 3), b.x, b.y);
          }
        }
      }
    }
  }
  if (parriedEnemyIds.length > 0) {
    // G4a(§2.9・記録専用): カウンター成立(②ジャンプ着地パリィ)を技への反応表へ通知。
    // ※G1のnotifyCounterHitはここには足さない(既存counterChanceノブの計測を変えないため)。
    notifyMoveCounter();
    const pnow = Date.now();
    // 通常カウンター(弾反射)と同じ演出: 「Counter!」表示＋カウンターSE＋ヒットインパクト＋コンボ。
    fx.addMeleeFinishCombo(1);
    fx.playSfx('counter');
    fx.spawnGlow(bpcx, bpcy, 95, 'rgba(56,189,248,', 360);
    fx.triggerHitImpact(COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG);
    fx.markMeleeSwingFx(); // §5.22-追補(社長決定v0.25.1536): カウンターにも近接スイングを出す
    fx.spawnRing(bpcx, bpcy, 14, 135, 'rgba(56,189,248,0.9)', 3, 360);
    fx.spawnBurst(bpcx, bpcy, '#38bdf8', 14);
    fx.spawnCallout(bpcx, bpcy - 12, 'Counter!', '#e0f2ff', { bg: 0x2563eb, holdMs: MELEE_FINISH_SLOW_HOLD_MS, duration: MELEE_FINISH_SLOW_MS });
    useGameStore.setState(st => ({
      // 弾いた直後は敵がプレイヤーに重なっている(着地)ので、通常接触ダメージで被弾しないよう
      // 短い無敵(i-frame)を付与。これで「カウンターしたのに被弾」を防ぐ。
      // counter-master v2: カウンター成立(ジャンプパリィ)時のみCDリファンド(未所持は無変換)。
      player: {
        ...st.player, invulnerable: true, invulnerableTime: pnow, lastCounterSuccessTime: pnow,
        counterCooldownEnd: refundCounterCooldown(st.player.counterCooldownEnd, pnow, skillLevel(st.player, 'counter-master')),
      },
      enemies: st.enemies.map(e => {
        const hit = parriedEnemyIds.find(p => p.id === e.id);
        if (!hit) return e;
        const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
        // ジャンプ攻撃はプレイヤーの位置めがけて着地する=敵中心がプレイヤー中心とほぼ重なり、
        // 「プレイヤー→敵」方向だと向きが 0 に潰れてノックバックが効かない(社長報告のバグ)。
        // 距離が小さいときは、敵がジャンプしてきた向き(aiFrom→着地点)の逆=「飛んできた方へ弾き返す」を使う。
        let ndx = ecx - bpcx, ndy = ecy - bpcy;
        let d = Math.hypot(ndx, ndy);
        if (d < 12) {
          const ox = e.x - (e.aiFromX ?? e.x), oy = e.y - (e.aiFromY ?? e.y);
          const od = Math.hypot(ox, oy);
          if (od > 0.001) { ndx = ox; ndy = oy; d = od; }
          else { ndx = 0; ndy = -1; d = 1; } // それも潰れていれば上方へ弾く
        }
        const ux = ndx / d, uy = ndy / d;
        return {
          ...e,
          // 突進パリィと同じく aiPhase を完全解除して弾き返す。'recover' のままだと
          // ノックバックが乗らない(社長報告)ため undefined に統一+ai系をリセット。
          aiPhase: undefined,
          aiPhaseUntil: undefined, aiStartedAt: undefined,
          aiTargetX: undefined, aiTargetY: undefined, aiFromX: undefined, aiFromY: undefined,
          aiReadyAt: st.gameTime + 1200,
          // 【ジャンプカウンターのノックバック不発の根治】
          // ① 速度ノックバックは updateEnemies が「翌フレーム以降」に適用する=ジャンプ着地で
          //    付与される stun/lift/recover に上書きされて「その場で痺れる」だけになっていた。
          //    → ここで“即時に”位置を弾き飛ばす(COUNTER_KNOCKBACK_LAUNCH)。
          // ② 凍結系(stun/lift/root)と ノックバック無敵窓を全解除して、続く速度スライドを
          //    何にも邪魔させない。
          x: e.x + ux * COUNTER_KNOCKBACK_LAUNCH,
          y: e.y + uy * COUNTER_KNOCKBACK_LAUNCH,
          vx: 0, vy: 0,
          stunUntil: undefined, liftUntil: undefined, rootUntil: undefined,
          knockbackImmuneUntil: 0,
          knockbackVx: ux * COUNTER_KNOCKBACK_SPEED,
          knockbackVy: uy * COUNTER_KNOCKBACK_SPEED,
          knockbackUntil: pnow + KNOCKBACK_DURATION,
        };
      }),
    }));
    // クリティカル反撃(ヘッドショット): 弾いたジャンプ敵へ。aiPhase 解除済みでダメージが通る。
    const cBase = getActiveGun(bp)?.damage ?? 12;
    for (const hit of parriedEnemyIds) {
      const e = useGameStore.getState().enemies.find(en => en.id === hit.id);
      if (!e) continue;
      const boss = isBossType(e.type);
      const dmg = counterReplyDamage(cBase, bp, boss ? BOSS_CRIT_DAMAGE_MULT : CRIT_DAMAGE_MULT);
      const ex = e.x + e.width / 2, ey = e.y + e.height / 2;
      // CRIT-UNIFY §9.3(社長裁定F): パリィ反撃は確定クリ。ボスは①の効果(半減+CD2倍+紫蓄積)が
      // damageEnemy側で中央適用される。通常敵は現行クリ規則どおり5秒スタン(ノックバックと併存)。
      const parryKilled = useGameStore.getState().damageEnemy(hit.id, dmg, false, true);
      if (!parryKilled && !boss) {
        const stunMs = STUN_DURATION_MS * (bp.stunDurationMult ?? 1);
        useGameStore.getState().stunEnemy(hit.id, useGameStore.getState().gameTime + stunMs);
      }
      fx.spawnDamageNumber(ex, e.y, dmg, true);
      fx.spawnRing(ex, ey, 8, 46, 'rgba(253,224,71,0.95)', 3, 300);
      fx.spawnBurst(ex, ey, '#fde047', 10);
      fx.spawnGlow(ex, ey, 34, 'rgba(253,224,71,', 240);
    }
    fx.playSfx('headshot');
    // トール(ステージ5裏ボス)のジャンプ攻撃着地がパリィされた場合、他の攻撃と同じ
    // カウンター後退(近接距離ギリギリ外まで高速後退)へ移行させる(社長指示)。
    for (const hit of parriedEnemyIds) {
      const te = useGameStore.getState().enemies.find(en => en.id === hit.id);
      if (!te || te.type !== 'thor') continue;
      const tcx = te.x + te.width / 2, tcy = te.y + te.height / 2;
      const lx = tcx - bpcx, ly = tcy - bpcy;
      const ll = Math.hypot(lx, ly) || 1;
      useGameStore.setState(st => ({
        enemies: st.enemies.map(en => en.id === hit.id ? {
          ...en,
          bossState: 'counter-leap',
          bossStateUntil: Date.now() + tunables.thorCounterLeapMs,
          aiFromX: tcx, aiFromY: tcy,
          aiTargetX: bpcx + (lx / ll) * tunables.thorOrbitDist,
          aiTargetY: bpcy + (ly / ll) * tunables.thorOrbitDist,
        } : en),
      }));
    }
  }
  useGameStore.setState({ pumpkinBlasts: [] });
};

// M67(PACING_PUZZLE.md §6.26-12): グレン(stage-7)専用「血の弧」(boon)が置く血溜まりの床。
// giantDelayedHitsのエントリのうちfloorUntil付き(=既に一度burstで爆発済み)を毎フレーム走査し、
// プレイヤーが接触していればdamagePlayerを呼ぶ(applyContactDamageと全く同じ作法=毎フレーム
// 呼ぶだけで、既存の被弾i-frame=INVULN_MS=700msが自然にスロットルする。専用のDoTタイマーは作らない)。
// 1フレーム1ヒットまで(複数の床が重なっていても多重ヒットしない=既存のブラスト系と同じ節度)。
// 重い演出(ring/heavy-impact SFX)は使わず、通常接触被弾と同じ軽いFXに留める(CLAUDE.md負荷方針)。
export const applyGlenFloorDamage = (fx: CombatEffects): void => {
  const { enemies, gameTime, player } = useGameStore.getState();
  const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
  const pr = Math.max(player.width, player.height) / 2;
  // G4b: 血溜まり床(g-boon・判定を持つ床)はゴーストも踏むと食らう。プレイヤーと同じ幾何
  // (円: 中心距離<=radius+当たり半径)・同じ量(e.damage)・同じ1フレーム1ヒット節度。連続ヒットは
  // damageSummonのi-frame(INVULN_MS)が間引く=プレイヤーのINVULN_MSと同型。プレイヤー側のループは
  // 下で従来のまま(early return含め1bit不変)なので、ゴーストは独立の先行ループで受ける。
  {
    const ghostAlly = findGhostAlly();
    if (ghostAlly) {
      const gcx = ghostAlly.x + ghostAlly.width / 2, gcy = ghostAlly.y + ghostAlly.height / 2;
      const gr = Math.max(ghostAlly.width, ghostAlly.height) / 2;
      outer: for (const e of enemies) {
        const hits = e.giantDelayedHits;
        if (!hits || hits.length === 0) continue;
        for (const h of hits) {
          if (h.floorUntil === undefined) continue;
          if (gameTime < h.fireAt || gameTime >= h.floorUntil) continue;
          if (Math.hypot(gcx - h.x, gcy - h.y) > h.radius + gr) continue;
          damageGhostAllyByBossMove(ghostAlly.id, e.damage, (x, y) => fx.spawnBurst(x, y, '#bae6fd', 3), h.x, h.y);
          break outer; // 1フレーム1ヒット(プレイヤー側と同じ節度)
        }
      }
    }
  }
  for (const e of enemies) {
    const hits = e.giantDelayedHits;
    if (!hits || hits.length === 0) continue;
    for (const h of hits) {
      if (h.floorUntil === undefined) continue;
      if (gameTime < h.fireAt || gameTime >= h.floorUntil) continue;
      if (Math.hypot(pcx - h.x, pcy - h.y) > h.radius + pr) continue;
      const damageWasApplied = !player.invulnerable;
      // G4a: h.moveKey('g-boon')=記録専用タグ。技のエピソード終了から残響(linger)を過ぎた踏み直しは
      // 反応表側で自然に無視される(moveReaction.ts参照)。
      const died = useGameStore.getState().damagePlayer(e.damage, 'CODE:グレン の血溜まり', h.x, h.y, undefined, undefined, h.moveKey);
      if (damageWasApplied) {
        fx.playSfx('player-damage');
        fx.spawnFlash('rgba(239,68,68,0.18)', 180);
        fx.spawnBurst(pcx, pcy, '#dc2626', 5);
      }
      if (died) fx.triggerPlayerDeath(pcx, pcy);
      return; // 1フレーム1ヒット(既存applyContactDamageと同じ節度=多重ヒット防止)
    }
  }
};

// ② 発火プロファイルを持つ敵の発砲(投射物追加)。ボス(裏ボス)/シーカー中の非表示等は
// 従来どおり除外。ストアから毎回フレッシュに読み直す(updateEnemiesが直前で書き換えているため)。
// now は呼び出し元が捕捉した Date.now() をそのまま渡す(この後の別コード=プロップ衝突判定でも
// 同じ now を参照しているため、ここで独自に Date.now() し直すと僅かにズレる可能性があるのを回避)。
export const applyEnemyFire = (now: number): void => {
  const liveEnemies = useGameStore.getState().enemies;
  const livePlayer = useGameStore.getState().player;
  const liveGameTime = useGameStore.getState().gameTime;
  const firedIds: string[] = [];
  // フレアガン(§6.6 M29): 着弾中のフレアを疑似召喚として発砲ターゲットにも合流(召喚と同じ効き方)。
  const liveFlareTargets = activeFlareTargets(useGameStore.getState().flareGunFlares, liveGameTime);
  const liveSummonsForFire = liveFlareTargets.length > 0
    ? [...useGameStore.getState().summons, ...liveFlareTargets]
    : useGameStore.getState().summons;
  liveEnemies.forEach(enemy => {
    // 裏ボスの発砲(3連発/全方位16発)は専用コントローラが直接撃つので汎用ループからは除外。
    if (isHiddenBoss(enemy.type)) return;
    // M51: 新スクリプト有効時の giantbat は咆哮弾(g-bolt-*)を自前で発射する(gameStore.ts の
    // giantBoltFires 経路)。この汎用ゲート(旧: 無予告で3秒おきに自動発砲)は完全に無効化する
    // (`?giantscript=0` の時だけ旧経路のこのチェックへ戻る=フォールバック)。
    if (enemy.type === 'giantbat' && GIANT_SCRIPT_ENABLED) return;
    // Stunned enemies are frozen — they can't spit projectiles either.
    if (enemy.stunUntil !== undefined && liveGameTime < enemy.stunUntil) return;
    // 特殊行動中(ジャンプ/ダッシュの溜め・動作中)は発砲しない(giantbat の弾/ジャンプ/ダッシュを排他に)。
    if (enemy.aiPhase) return;
    const profile = getEnemyFireProfile(enemy);
    if (!profile) return;
    // 発砲間隔も攻撃倍速で短縮(1/MULT)=より速く撃つ。1.0で従来等速。
    // CRIT-UNIFY §9.2: クリ窓中のボス(この経路は`?giantscript=0`のgiantbat旧経路のみ到達=
    // isBossType該当)は発砲間隔にも×2(bossCritCdMult。非ボスのplantは1のまま=無改変)。
    if (now - enemy.lastShot < (profile.interval / ENEMY_ATTACK_SPEED_MULT) * bossCritCdMult(enemy, liveGameTime)) return;
    // 錬金術: aggro内の通常召喚を撃つ。いなければ従来どおりプレイヤー。
    // シーカー: 半透明中は通常敵(ボス/死神/イベントボス級を除く)はプレイヤーを撃たない。
    const playerHidden = isSeekerActive(livePlayer, liveGameTime) && !isBossType(enemy.type);
    const tgt = resolveEnemyTarget(enemy, livePlayer, liveSummonsForFire, ALCHEMY_AGGRO_RANGE, playerHidden, liveGameTime); // v0.25.2490: 雑魚ヘイト=ラッチ中の射手はゴーストを撃つ
    if (tgt.hidden) return; // 標的なし=非発砲
    const dx = tgt.x - (enemy.x + enemy.width / 2);
    const dy = tgt.y - (enemy.y + enemy.height / 2);
    if (Math.hypot(dx, dy) > profile.range) return;

    useGameStore.getState().addProjectile(createEnemyProjectile(enemy, livePlayer, tgt.x, tgt.y));
    firedIds.push(enemy.id);
  });
  if (firedIds.length > 0) {
    useGameStore.setState(state => ({
      enemies: state.enemies.map(e =>
        firedIds.includes(e.id) ? { ...e, lastShot: now } : e
      )
    }));
  }
};

// ③ 敵弾→プレイヤー命中。カウンター窓中は反射(+ボムカウンター化)、それ以外はダメージ。
// player は呼び出し元(フレーム冒頭のloopState)のスナップショットをそのまま使う(反射後の
// 被弾バーストの座標に使うだけで、命中判定自体はstoreから読み直したprojectiles/playerを使う)。
// now も呼び出し元のDate.now()をそのまま渡す(applyEnemyFireと同じ理由=後続コードとの時刻ズレ回避)。
export const applyEnemyProjectileHits = (
  now: number,
  player: Player,
  redNightActive: boolean,
  screamerBuffUntil: number,
  gameTime: number,
  fx: CombatEffects,
  tunables: Pick<CombatTunables, 'grenadeBlastRadius' | 'grenadeBlastDamageMult' | 'counterReflectSlowMs'>,
): void => {
  const liveProjectiles = useGameStore.getState().projectiles;
  const incoming = checkProjectilePlayerCollisions(liveProjectiles, player);
  let reflectedAny = false;
  for (const proj of incoming) {
    const currentPlayer = useGameStore.getState().player;
    if (now <= currentPlayer.counterWindowEnd) {
      useGameStore.getState().reflectProjectile(proj.id);
      // スキル: ボムカウンター = 反射弾がランチャー弾化し、命中で GRENADE_* 爆発。
      const bcLv = skillLevel(currentPlayer, 'bomb-counter');
      if (bcLv) {
        const bcRadiusMult = [0, 1, 1.15, 1.3][bcLv];
        const bcDmgMult = [0, 1, 1.25, 1.5][bcLv];
        useGameStore.setState(state => ({
          projectiles: state.projectiles.map(p =>
            p.id === proj.id
              ? { ...p, explodeOnHit: true, explodeRadius: tunables.grenadeBlastRadius * bcRadiusMult, explodeDamageMult: tunables.grenadeBlastDamageMult * bcDmgMult }
              : p
          ),
        }));
      }
      reflectedAny = true;
      // Each successful reflect refreshes the window so a barrage
      // can be turned back fully. The cooldown still gates a NEW
      // counter trigger once the chain finally lapses.
      useGameStore.setState(state => ({
        player: {
          ...state.player,
          counterWindowEnd: Math.max(
            state.player.counterWindowEnd,
            now + COUNTER_EXTEND_PER_HIT
          ),
          lastCounterSuccessTime: now,
          // counter-master v2: カウンター成立(弾反射)時のみCDリファンド(未所持は無変換)。
          counterCooldownEnd: refundCounterCooldown(
            state.player.counterCooldownEnd, now, skillLevel(state.player, 'counter-master')),
        }
      }));
    } else {
      const wasVulnerable = !useGameStore.getState().player.invulnerable;
      const rnMult = redNightActive ? 2 : 1;
      // 叫喚型の強化窓中は通常敵(ボス/screamer以外)の飛び道具ダメージも×SCREAMER_BUFF_MULT。
      const scMult = (screamerBuffUntil > gameTime && proj.ownerType && proj.ownerType !== 'screamer' && !isBossType(proj.ownerType)) ? SCREAMER_BUFF_MULT : 1;
      // G4a(§2.9・記録専用): 新スクリプトのgiantbatが撃つ弾は咆哮弾(g-bolt)だけ(汎用発砲は
      // GIANT_SCRIPT_ENABLED時に完全無効=上のapplyEnemyFire参照)なので、発射元タイプから技キーが確定する。
      const boltMoveKey = proj.ownerType === 'giantbat' && GIANT_SCRIPT_ENABLED ? 'g-bolt' : undefined;
      const playerDied = useGameStore.getState().damagePlayer(proj.damage * rnMult * scMult, '敵の飛び道具', proj.x + proj.width / 2, proj.y + proj.height / 2, undefined, undefined, boltMoveKey);
      if (wasVulnerable) {
        fx.playSfx('player-damage');
        fx.spawnFlash('rgba(239,68,68,0.22)', 200);
      }
      useGameStore.getState().removeProjectile(proj.id);
      fx.spawnBurst(
        player.x + player.width / 2,
        player.y + player.height / 2,
        '#ef4444',
        5
      );
      if (playerDied) {
        fx.triggerPlayerDeath(
          player.x + player.width / 2,
          player.y + player.height / 2
        );
      }
    }
  }
  // G4b: ボス(isEngageableBoss)の弾はゴーストにも当たる(g-bolt=咆哮弾、裏ボスのバースト/全方位、
  // 天使/idolの射撃など、ownerTypeがボスの敵弾全部)。**プレイヤー解決の後**に残っている弾だけを
  // 見る(反射された弾はhostile:false化済み/プレイヤーに当たった弾はremoveProjectile済み)=
  // プレイヤーへの判定・ダメージは1bitも変えない。命中判定はsummonの既存矩形(checkCollision)。
  // ダメージ量はプレイヤーと同式(紅き月×2。scMultはボス弾では常に1のため省略と同値)。
  // 命中した弾はプレイヤー被弾と同じく消える(ゴーストが技を引き受ける=ヘイトの意味を成立させる)。
  {
    const ghostAlly = findGhostAlly();
    if (ghostAlly) {
      const rnMult = redNightActive ? 2 : 1;
      const ghostHits = useGameStore.getState().projectiles.filter(p =>
        p.hostile && p.ownerType !== undefined && isEngageableBoss(p.ownerType) && checkCollision(p, ghostAlly));
      for (const proj of ghostHits) {
        damageGhostAllyByBossMove(ghostAlly.id, proj.damage * rnMult, (x, y) => fx.spawnBurst(x, y, '#bae6fd', 3),
          proj.x + proj.width / 2, proj.y + proj.height / 2);
        useGameStore.getState().removeProjectile(proj.id);
      }
    }
  }
  // "Counter!" only when a bullet was actually reflected (once per frame).
  if (reflectedAny) {
    // G4a(§2.9・記録専用): カウンター成立(①弾反射)を技への反応表へ通知(1フレーム1回)。
    // ※G1のnotifyCounterHitはここには足さない(既存counterChanceノブの計測を変えないため)。
    notifyMoveCounter();
    fx.addMeleeFinishCombo(1);
    fx.playSfx('counter');
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;
    fx.spawnGlow(pcx, pcy, 95, 'rgba(56,189,248,', tunables.counterReflectSlowMs);
    // カウンター: ストップ→(後で)揺れ+寄りズーム(社長指示)。ダンス中はストップ抜きで即時。
    fx.triggerHitImpact(COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG);
    fx.markMeleeSwingFx(); // §5.22-追補(社長決定v0.25.1536): カウンターにも近接スイングを出す
    fx.spawnRing(pcx, pcy, 14, 135, 'rgba(56,189,248,0.9)', 3, tunables.counterReflectSlowMs);
    fx.spawnBurst(pcx, pcy, '#38bdf8', 14);
    fx.spawnCallout(pcx, pcy - 12, 'Counter!', '#e0f2ff', { bg: 0x2563eb, holdMs: MELEE_FINISH_SLOW_HOLD_MS, duration: MELEE_FINISH_SLOW_MS });
  }
};

// ④ 地雷(緑卵)。社長仕様v0.25.1846→v0.25.1848改: **起爆範囲(EGG_BLAST_RADIUS)に入ったらアーム**
// (旧: 卵の当たり判定を踏んだら)。赤くプクプク→EGG_FUSE_MS 後に爆発(値は mines.ts が唯一の出どころ。
// 導火時間はこれまで 2秒→1秒→1.5秒 と社長が調整しているので、ここに数値を書き写さない)(爆発処理は
// useGameLoopの起爆ブロック=敵巻き込み/連鎖)。範囲内の未アーム卵は同フレームで全てアームされる。
// 近接で割る従来経路(breakPropsAlong→damageBreakableProp)は不変=アーム中でも無害に解除できる。
export const applyMineDamage = (fx: CombatEffects): void => {
  const currentPlayerForMine = useGameStore.getState().player;
  const gameTimeNow = useGameStore.getState().gameTime;
  const pcx = currentPlayerForMine.x + currentPlayerForMine.width / 2;
  const pcy = currentPlayerForMine.y + currentPlayerForMine.height / 2;
  const triggered = useGameStore.getState().breakableProps.filter(prop =>
    prop.type === 'mine' && prop.armedAt === undefined
    && (prop.footX - pcx) ** 2 + (prop.footY - pcy) ** 2 <= EGG_BLAST_RADIUS * EGG_BLAST_RADIUS
  );
  if (triggered.length === 0) return;
  const ids = new Set(triggered.map(p => p.id));
  useGameStore.setState(state => ({
    breakableProps: state.breakableProps.map(p => ids.has(p.id) ? { ...p, armedAt: gameTimeNow } : p),
  }));
  // アーム開始の合図: 小さな赤リング(SEなし=静かに導火が始まる)。
  for (const m of triggered) fx.spawnRing(m.footX, m.footY - m.height * 0.5, 4, 26, 'rgba(248,113,113,0.85)', 2, 260);
};

// ==== 守護霊カウンターの城ボス系合流(v0.25.2480・DEVELOPMENT_LOG v0.25.2479★未決1解消) ==========
// プレイヤーの「突進/ジャンプ/硬直パリィ」(下の applyContactDamage 内 dashParried)と同じ対象フェーズ表・
// 同じ中断/ノックバック変換を、守護霊のカウンター請求(ghostCounter.ts)にも適用する。

/** giantbat専用のパリィ可能フェーズ(M51受け入れ条件5=W4「予告を出したら必ず実行させる」= windupは
 * 含めない。実行中2種+硬直5種のみ)。applyContactDamage内のdashParried判定と共有する正本リスト。 */
const GIANT_PARRYABLE_PHASES: readonly string[] = [
  'g-dash-charge', 'g-sweep-active',
  'g-stomp-recover', 'g-sweep-recover', 'g-dash-recover', 'g-jump-recover', 'g-bolt-recover',
];

/** プレイヤーの接触パリィ(dashParried)が成立しうるフェーズか。applyContactDamage内の3分岐
 * (①jump/g-jump-air ②charge/recover/crouch ③giantbatのGIANT_PARRYABLE_PHASES)の合成述語。
 * ※分岐構造そのもの(①はカウンター窓外でも被弾無し等)は applyContactDamage 側が正本。
 *   あちらの当該分岐を変更したら必ずここも同期すること(逆も然り)。
 *   気絶中(stunUntil)のパリィは接触被弾回避の防御目的なので守護霊側には含めない。 */
export const isDashParryCounterPhase = (enemy: Pick<Enemy, 'type' | 'aiPhase'>): boolean =>
  enemy.aiPhase === 'jump' || enemy.aiPhase === 'g-jump-air'
  || enemy.aiPhase === 'charge' || enemy.aiPhase === 'recover' || enemy.aiPhase === 'crouch'
  || (enemy.type === 'giantbat' && enemy.aiPhase !== undefined && GIANT_PARRYABLE_PHASES.includes(enemy.aiPhase));

/** dashParried成立時の敵側変換(技の中断+攻め手から弾き飛ばすノックバック)。
 * applyContactDamageのプレイヤー経路と守護霊経路(applyGhostBossParry)の両方がこの1本を使う
 * (v0.25.2480でプレイヤー経路のインライン実装をここへ切り出し・挙動同一)。 */
export const dashParriedEnemyPatch = (
  e: Enemy, originX: number, originY: number, pnow: number, gameTimeNow: number,
): Enemy => {
  const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
  // ジャンプ同様、突進中の敵は攻め手に重なって向きが潰れることがある。
  // 距離が小さいときは突進してきた向き(aiFrom→現在)の逆=「来た方へ弾き返す」を使う。
  let ndx = ecx - originX, ndy = ecy - originY;
  let d = Math.hypot(ndx, ndy);
  if (d < 12) {
    const ox = e.x - (e.aiFromX ?? e.x), oy = e.y - (e.aiFromY ?? e.y);
    const od = Math.hypot(ox, oy);
    if (od > 0.001) { ndx = ox; ndy = oy; d = od; }
    else { ndx = 0; ndy = -1; d = 1; }
  }
  const ux = ndx / d, uy = ndy / d;
  return {
    ...e,
    aiPhase: undefined, // 突進/ジャンプ中断
    aiPhaseUntil: undefined, aiStartedAt: undefined,
    aiTargetX: undefined, aiTargetY: undefined, aiFromX: undefined, aiFromY: undefined,
    aiReadyAt: gameTimeNow + 1200, // 少し間を空ける(giantbat は gbDashReadyAt 側で管理)
    // 即時に弾き飛ばし+凍結系/ノックバック無敵を全解除(ジャンプカウンターと同根の対策)。
    x: e.x + ux * COUNTER_KNOCKBACK_LAUNCH,
    y: e.y + uy * COUNTER_KNOCKBACK_LAUNCH,
    vx: 0, vy: 0,
    stunUntil: undefined, liftUntil: undefined, rootUntil: undefined,
    knockbackImmuneUntil: 0,
    knockbackVx: ux * COUNTER_KNOCKBACK_SPEED,
    knockbackVy: uy * COUNTER_KNOCKBACK_SPEED,
    knockbackUntil: pnow + KNOCKBACK_DURATION,
  };
};

/**
 * 守護霊カウンター請求の城ボス系(giantbat=城ボス/グレン/未確認変異体)での解決(v0.25.2480)。
 * thor/裏ボス3体/idol/天使6体は各自のper-bossハンドラ側で請求を消費するので、ここでは型で弾く。
 * 成立条件=プレイヤーのdashParriedと同じフェーズ表(isDashParryCounterPhase)。
 * 効果=同じ中断/ノックバック(dashParriedEnemyPatch・起点はゴースト)+確定クリ(共通ヘルパ)。
 * プレイヤーの無敵/CDリファンド/コンボ/計測(notify)はプレイヤー専用のため呼ばない。
 * 呼び出し位置は applyContactDamage の直後(プレイヤーの接触カウンターを先に解決=同フレーム競合は
 * プレイヤー優先。プレイヤーが先に弾いた場合は aiPhase 解除済み=下の述語が落ちて請求は流れる)。
 */
export const applyGhostBossParry = (
  nowMs: number,
  playCounterSfx: ((key: 'counter' | 'headshot', gain: number) => void) | null,
  sfxGainAt: (x: number, y: number) => number,
): void => {
  const claim = peekGhostCounterClaim(nowMs);
  if (!claim) return;
  const state = useGameStore.getState();
  const boss = state.enemies.find(e => e.id === claim.bossId);
  if (!boss || boss.type !== 'giantbat') return; // 他ファミリーの請求はそれぞれのハンドラが消費する
  if (consumeGhostCounterClaim(boss.id, nowMs) === null) return;
  // プレイヤーが弾けない状態(windup等=W4「予告を出したら必ず実行」)では成立させず請求を流す。
  // ※覗くだけで残さず「消費して流す」: windup中の請求が直後の実行(g-dash-charge等)へ持ち越されて
  //   中断する=実質windupパリィになるのを防ぐ(判定を広げない)。スイング自体は通常近接として落着済み。
  if (!isDashParryCounterPhase(boss)) return;
  // 中断+ノックバック(プレイヤー経路と同じ変換・起点=ゴースト)→ aiPhase解除後にダメージ
  // (プレイヤー経路と同じ順序=ジャンプ中無敵を回避してダメージを通す)。
  useGameStore.setState(st => ({
    enemies: st.enemies.map(e => e.id === boss.id ? dashParriedEnemyPatch(e, claim.ghostX, claim.ghostY, nowMs, st.gameTime) : e),
  }));
  const bcx = boss.x + boss.width / 2, bcy = boss.y + boss.height / 2;
  applyGhostCounterEffect(boss, bcx, bcy, { claim, sfxGain: sfxGainAt(bcx, bcy) }, playCounterSfx);
};

// ① 敵接触ダメージ。カウンター/パリィ(dashParried)・ワイヤー無効・トール特例・ジャンプ空中/
// 気絶/溜め特例まで丸ごと(本体)。gameTime は呼び出し元(フレーム冒頭のloopState)の値を使う
// (stunUntilとの比較に使うだけで、接触判定自体はstoreから読み直したplayer/enemiesを使う)。
export const applyContactDamage = (
  gameTime: number,
  redNightActive: boolean,
  screamerBuffUntil: number,
  fx: CombatEffects,
): void => {
  // 直前のupdateEnemies等でplayer/enemiesの座標が動いた後なので、接触判定は最新状態(getState)で行う。
  // 移動後の位置で当たり/カウンター/ダッシュ弾きを正しく解決する。
  const collState = useGameStore.getState();
  const collPlayer = collState.player;
  const collEnemies = collState.enemies;
  const playerEnemyCollisions = checkPlayerEnemyCollisions(collPlayer, collEnemies);
  // ワイヤーアンカーの高速移動中/敵吸着コンボ中は敵接触ダメージを無効化(敵弾は別経路でそのまま当たる)。
  // スラム後ジャンプ離脱(ホップ)中も同じく無効(DEVELOPMENT_LOG v0.25.2487・接触無効の合流点)。
  const wpImmune = collPlayer;
  const wireDashingNow = Date.now() < wpImmune.wireDashUntil || Date.now() < wpImmune.wireHopUntil || !!wpImmune.wireStuckEnemyId;
  // 突進(ダッシュ)カウンター: 突進中(aiPhase==='charge')の敵にカウンター窓中で接触すると弾く
  // (無傷＋敵へのダメージ無し＋2倍ノックバックで突進中断)。ジャンプ着地と同じ「弾き」挙動。
  const counterActiveNow = Date.now() <= wpImmune.counterWindowEnd;
  const dashParried: string[] = [];
  // V1(3)(FX_GAP_LEDGER.md・社長指示「敵がプレイヤーに触れてダメージ与える時、強めに前屈みに歪む」):
  // 接触ダメージが実際に入った敵へ lastContactAttackAt(+向き)を打刻する(描画専用・判定不変)。
  // ここが接触ダメージの唯一の合流点(checkPlayerEnemyCollisionsの使用箇所はここだけ)なので、
  // 通常敵・ボスを問わず「接触ダメージを持つ全員」が1箇所で対象になる。
  const contactLunges: { id: string; ang: number }[] = [];

  playerEnemyCollisions.forEach(enemy => {
    if (wireDashingNow) return;
    // トール(ステージ5裏ボス)専用の攻撃実行中(chase/return以外のbossState)は、通常の接触ダメージを
    // 適用しない=各攻撃(一閃/突き/払い/ジャンプ攻撃)自身の当たり判定/カウンター処理に委ねる
    // (社長指示: 一閃・突きは「もとの当たり判定ではなくライン上のみ」)。
    if (enemy.type === 'thor' && enemy.bossState && enemy.bossState !== 'chase' && enemy.bossState !== 'return') return;
    // ジャンプ攻撃で敵が空中(aiPhase==='jump')の間はプレイヤーは被弾しない。
    // カウンター窓中ならカウンター成立=クリティカル反撃(ヘッドショット)を返す。
    // M51: ジャイアント新スクリプトの飛び掛かり滞空(g-jump-air)も同じ扱い(既存'jump'と同義)。
    if (enemy.aiPhase === 'jump' || enemy.aiPhase === 'g-jump-air') {
      if (counterActiveNow) dashParried.push(enemy.id);
      return;
    }
    // 突進(charge)/ジャンプの着地硬直(recover)/溜め(crouch)も、カウンター窓中は弾く。
    // パンプキンは空中で重なる窓が一瞬→着地直後は recover で「その場硬直(痺れ)」になり拾えなかったため、
    // recover/crouch も対象にして広い猶予で確実にノックバック+クリ反撃する。
    // M51(受け入れ条件5=W4「中断は気絶/盾ブロック/障害物の既存3経路のみ」): ジャイアント新スクリプトの
    // 溜め(windup)ステートはここに含めない=予告を出したら必ず実行させる。実行中(g-dash-charge/
    // g-sweep-active)と硬直(g-*-recover=既にHITは終わっている)だけを対象にする(g-jump-airは
    // 直上のifで既に処理済み=ここへは到達しない)。
    const giantParryablePhase = enemy.type === 'giantbat' && enemy.aiPhase !== undefined &&
      GIANT_PARRYABLE_PHASES.includes(enemy.aiPhase); // v0.25.2480: リストを守護霊経路と共有(同値・挙動不変)
    if ((enemy.aiPhase === 'charge' || enemy.aiPhase === 'recover' || enemy.aiPhase === 'crouch' || giantParryablePhase) && counterActiveNow) {
      dashParried.push(enemy.id);
      return;
    }
    // 気絶中(フィニッシュ受付)の敵に触れても被弾しない。
    // ただしカウンター窓中ならパリィ=弾き返す。カウンターの近接スイングがジャンプ敵を
    // クリ気絶させると aiPhase が undefined にリセットされ、recover/charge 判定を抜けて
    // ノックバックしなくなるため、気絶敵もカウンター中は dashParried で確実に弾く。
    if (enemy.stunUntil !== undefined && gameTime < enemy.stunUntil) {
      if (counterActiveNow) dashParried.push(enemy.id);
      return;
    }
    const damageWasApplied = !collPlayer.invulnerable;
    const rnMelee = redNightActive ? 2 : 1;
    // 叫喚型の強化窓中は通常敵(ボス/screamer以外)の接触ダメージも×SCREAMER_BUFF_MULT。
    const scMelee = (screamerBuffUntil > gameTime && enemy.type !== 'screamer' && !isBossType(enemy.type)) ? SCREAMER_BUFF_MULT : 1;
    // G4a(§2.9・記録専用): 体当たりそのものが技のダメージであるフェーズ(g-dash-charge/g-quad-charge/
    // g-glide-active)だけ技キーを付ける(純関数contactDamageMoveKey)。それ以外の接触は従来どおりタグ無し。
    const playerDied = useGameStore.getState().damagePlayer(enemy.damage * rnMelee * scMelee, enemyDeathLabel(enemy.type), enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, undefined, undefined, contactDamageMoveKey(enemy));
    if (damageWasApplied) {
      fx.playSfx('player-damage');
      fx.spawnFlash('rgba(239,68,68,0.22)', 200);
      fx.spawnBurst(
        collPlayer.x + collPlayer.width / 2,
        collPlayer.y + collPlayer.height / 2,
        '#ef4444',
        6
      );
      // V1(3): 前のめり変形の打刻(既存の被弾SE/赤フラッシュと同じ「ダメージが入った」条件に揃える)。
      contactLunges.push({
        id: enemy.id,
        ang: Math.atan2(
          (collPlayer.y + collPlayer.height / 2) - (enemy.y + enemy.height / 2),
          (collPlayer.x + collPlayer.width / 2) - (enemy.x + enemy.width / 2),
        ),
      });
    }
    if (playerDied) {
      fx.triggerPlayerDeath(
        collPlayer.x + collPlayer.width / 2,
        collPlayer.y + collPlayer.height / 2
      );
    }
  });
  // V1(3): 打刻の反映(視覚専用フィールドのみ更新・判定/ダメージ/移動は1bitも変えない)。
  // i-frameで接触ダメージは高々1回/無敵窓なので、このsetStateはダメージが入ったtickにしか走らない。
  if (contactLunges.length > 0) {
    const lungeAt = Date.now(); // レンダラの時計(lastHitと同じDate.now基準)
    useGameStore.setState(st => ({
      enemies: st.enemies.map(e => {
        const l = contactLunges.find(c => c.id === e.id);
        return l ? { ...e, lastContactAttackAt: lungeAt, lastContactAttackDir: l.ang } : e;
      }),
    }));
  }
  if (dashParried.length > 0) {
    // BOT_AND_GHOST.md G1(計測専用・挙動不変): カウンター成立をplayerTraitsへ通知する。
    notifyCounterHit();
    notifyMoveCounter(); // G4a(§2.9・記録専用): カウンター成立(③突進パリィ)を技への反応表へも通知

    const pnow = Date.now();
    const ppx = collPlayer.x + collPlayer.width / 2, ppy = collPlayer.y + collPlayer.height / 2;
    // 通常カウンターと同じ演出: 「Counter!」表示＋カウンターSE＋ヒットインパクト＋コンボ。
    fx.addMeleeFinishCombo(1);
    fx.playSfx('counter');
    fx.spawnGlow(ppx, ppy, 95, 'rgba(56,189,248,', 360);
    fx.triggerHitImpact(COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG);
    fx.markMeleeSwingFx(); // §5.22-追補(社長決定v0.25.1536): カウンターにも近接スイングを出す
    fx.spawnRing(ppx, ppy, 14, 135, 'rgba(56,189,248,0.9)', 3, 360);
    fx.spawnBurst(ppx, ppy, '#38bdf8', 14);
    fx.spawnCallout(ppx, ppy - 12, 'Counter!', '#e0f2ff', { bg: 0x2563eb, holdMs: MELEE_FINISH_SLOW_HOLD_MS, duration: MELEE_FINISH_SLOW_MS });
    useGameStore.setState(st => ({
      // 弾いた直後は突進してきた敵が重なっているので、短い無敵で次フレームの接触被弾を防ぐ。
      // counter-master v2: カウンター成立(突進パリィ)時のみCDリファンド(未所持は無変換)。
      player: {
        ...st.player, invulnerable: true, invulnerableTime: pnow, lastCounterSuccessTime: pnow,
        counterCooldownEnd: refundCounterCooldown(st.player.counterCooldownEnd, pnow, skillLevel(st.player, 'counter-master')),
      },
      // v0.25.2480: 中断+ノックバック変換を dashParriedEnemyPatch へ切り出し(守護霊経路と共有・挙動同一)。
      enemies: st.enemies.map(e => dashParried.includes(e.id) ? dashParriedEnemyPatch(e, ppx, ppy, pnow, st.gameTime) : e),
    }));
    // クリティカル反撃(ヘッドショット): aiPhase を解除済みなのでダメージが通る(ジャンプ中無敵を回避)。
    // 威力は装備中の銃ダメージ基準 × クリ倍率(通常×1.5 / ボス×5)× スキル/装備補正。
    const counterBase = getActiveGun(collPlayer)?.damage ?? 12;
    let counterKill = false;
    for (const eid of dashParried) {
      const e = useGameStore.getState().enemies.find(en => en.id === eid);
      if (!e) continue;
      const boss = isBossType(e.type);
      const dmg = counterReplyDamage(counterBase, collPlayer, boss ? BOSS_CRIT_DAMAGE_MULT : CRIT_DAMAGE_MULT);
      const ex = e.x + e.width / 2, ey = e.y + e.height / 2;
      // CRIT-UNIFY §9.3(社長裁定F): 突進/気絶パリィの反撃も確定クリ。ボスは①の効果(半減+CD2倍+
      // 紫蓄積)がdamageEnemy側で中央適用される。通常敵は現行クリ規則どおり5秒スタン(ノックバックと併存)。
      const dashParryKilled = useGameStore.getState().damageEnemy(eid, dmg, false, true);
      counterKill = dashParryKilled || counterKill;
      if (!dashParryKilled && !boss) {
        const stunMs = STUN_DURATION_MS * (collPlayer.stunDurationMult ?? 1);
        useGameStore.getState().stunEnemy(eid, useGameStore.getState().gameTime + stunMs);
      }
      fx.spawnDamageNumber(ex, e.y, dmg, true); // 金色クリ表示
      fx.spawnRing(ex, ey, 8, 46, 'rgba(253,224,71,0.95)', 3, 300);
      fx.spawnBurst(ex, ey, '#fde047', 10);
      fx.spawnGlow(ex, ey, 34, 'rgba(253,224,71,', 240);
    }
    fx.playSfx('headshot'); // ヘッドショット反撃音(Counter SE と重ねる)
    void counterKill;
  }
};
