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
import { GLOW_R_L } from './glowTiers';
import type { SfxKey } from '../audio/audioManager';
import {
  isBossType, isHiddenBoss, resolveEnemyTarget, getEnemyFireProfile, createEnemyProjectile, isCorpse,
  isGuardianPhantom,
} from './enemyUtils';
import { ALCHEMY_AGGRO_RANGE } from './summonUtils';
import { PHILL_COUNTER_RECOVER_MS } from './phillScript'; // §10-15#2: フィル後追い分岐の硬直長
import { activeFlareTargets } from './flareGun';
import { getActiveGun, GHOST_REFLECT_WEAPON_KEY } from './weaponUtils';
import { checkPlayerEnemyCollisions, checkProjectilePlayerCollisions, checkCollision } from './collisionUtils';
import { isEngageableBoss } from './bossEngagement'; // G4b: 「ボスの技」の正本テーブル(BOT_AND_GHOST.mdの対象ボス群)
import { EGG_BLAST_RADIUS } from '../world/mines';
import {
  useGameStore, isSeekerActive, skillLevel, counterReplyDamage, enemyDeathLabel, combatActorPlayer,
  ENEMY_ATTACK_SPEED_MULT, SCREAMER_BUFF_MULT,
  COUNTER_EXTEND_PER_HIT, COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG,
  MELEE_FINISH_SLOW_MS, MELEE_FINISH_SLOW_HOLD_MS,
  KNOCKBACK_DURATION, KNOCKBACK_SPEED, COUNTER_KNOCKBACK_LAUNCH, COUNTER_KNOCKBACK_SPEED,
  PLAYER_KNOCKBACK_SPEED, PLAYER_KNOCKBACK_MS,
  CRIT_DAMAGE_MULT, BOSS_CRIT_DAMAGE_MULT, STUN_DURATION_MS,
  GIANT_SCRIPT_ENABLED, GIANT_JUMP_RADIUS, GLEN_TRIJUMP_RADIUS, GIANT_GLIDE_HALF_WIDTH,
  bossCritCdMult,
  REFLECT_DAMAGE_MULTIPLIER, // SKILL_BUILD_REDESIGN.md §28(B7/§28-1): 弾幕の王の倍率計算に使う基準値
  counterMasterAwakenBuffPatch, // v0.25.3303 カウンターマスター覚醒(成立後3秒+30%)
} from '../store/gameStore';
// v0.25.3496(社長指示「四角の帯に当たりも戻して」): 帯の判定は描いてある四角そのもの。
import { distToBandRect } from './geometry';
import { notifyCounterHit, notifyMoveCounter } from './playerTraits'; // BOT_AND_GHOST.md G1/G4a(計測専用・挙動不変)
import { recordCritHit } from './botTelemetry'; // PACING_PUZZLE.md §7-11c(4): クリ計測口(計測専用・挙動不変)
import { contactDamageMoveKey } from './moveReaction'; // G4a(§2.9): 接触被弾の技キー導出(記録専用)
import { refundCounterCooldown } from './counterMaster'; // counter-master v2(CD_REWORK.md 確定2)
import { peekGhostCounterClaim, consumeGhostCounterClaim, applyGhostCounterEffect, applyGhostReflectCounterFx } from './ghostCounter'; // v0.25.2480: 守護霊カウンターの城ボス系合流 / v0.25.2525: 弾反射の成立演出
import { npcSfxDistGain } from './npcSfx'; // CRIT-UNIFY §9.3: ゴーストのブラストパリィ成立SEの距離減衰(escort/他ゴースト経路と同流儀)
import { applyBossPostureDamage } from './bossPosture'; // v0.25.2946: 裏ボス体当たりの受け流し(体幹削り)
import { shouldSkipBossContactParry } from './counterReach'; // v0.25.3809(8巡目 重大4): 受け流しへ落とさない州の述語(純関数)
// SKILL_BUILD_REDESIGN.md §28(B7/§28-1): 弾幕の王(barrage-king)=反射弾のダメ・体勢削り倍率+貫通1。
import { barrageKingMult, BARRAGE_KING_PIERCE } from './skillEffectsB7';

// v0.25.2946(社長裁定「体勢値は削ってあげたら?」): 裏ボス系の**追跡中の体当たり**への受け流し。
// `?bossparry=0` で無効(従来=カウンター窓中でも接触ダメージ素通し)へ完全復帰。
const BOSS_CONTACT_PARRY_ENABLED = typeof window === 'undefined'
  || new URLSearchParams(window.location.search).get('bossparry') !== '0';
// v0.25.2949(社長実機報告「カウンターしてもすぐ食らって死ぬ。もう少しボス硬直した方がいい。逃げられない」):
// 受け流し成立でボスを rootUntil で900ms拘束(=BOSS_RECOVER_FLOOR_MSと同じ「1発ぶんの休符」)。
// rootUntil は3実装経路(useGameLoop裏ボス/angelBossTick/idolTick)全てが移動停止として見る既製の場
// (トラップ拘束と同じ)なので、経路の取りこぼしが構造的に起きない。i-frame(700ms)+拘束900msで
// 張り付きから確実に離脱できる。拘束中は既存仕様どおり銃クリ率+10%(トラップと同じ扱い)。
const BOSS_CONTACT_PARRY_ROOT_MS = 900;

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
  fromX?: number, fromY?: number, source?: string,
): void => {
  const before = useGameStore.getState().summons.find(s => s.id === ghostId);
  if (!before) return;
  useGameStore.getState().damageSummon(ghostId, amount, fromX, fromY, source);
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
  burst?: (x: number, y: number) => void, source?: string,
): void => {
  const ghost = findGhostAlly();
  if (!ghost) return;
  const gcx = ghost.x + ghost.width / 2, gcy = ghost.y + ghost.height / 2;
  const gr = Math.max(ghost.width, ghost.height) / 2;
  if (distToBandRect({ x: gcx, y: gcy }, { x: fx0, y: fy0 }, { x: tx0, y: ty0 }, halfWidth) <= gr) {
    // 被弾KBの源=技の起点(ボス側)=プレイヤー側のカプセル技被弾と同じ「飛んできた方から弾かれる」向き。
    damageGhostAllyByBossMove(ghost.id, damage, burst, fx0, fy0, source ?? 'capsule');
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

// ★PACING_PUZZLE.md §10-14#2(R2)/§10-15#2: フィルの技14種の州名接頭辞(§10-12#7の命名規約
// `phill-<move>-*`)。パリィ解決の瞬間(blast消化)に「今どの技の途中か」を州名から逆引きするための表。
// 新しい移動を持たない状態(接頭辞が衝突しない=13技名どうしで前方一致の衝突は無い)ので単純な
// startsWith 判定で足りる。
const PHILL_MOVE_SLUGS = [
  'lightrain', 'lancefan', 'wingslash', 'wingthrust', 'wingcombo', 'summon', 'goldring',
  'judgment', 'cage', 'meteor', 'ringtoss', 'dive', 'feathershot',
] as const;
const PHILL_RECOVER_STATE_BY_SLUG: Readonly<Record<(typeof PHILL_MOVE_SLUGS)[number], Enemy['bossState']>> = {
  lightrain: 'phill-lightrain-recover', lancefan: 'phill-lancefan-recover',
  wingslash: 'phill-wingslash-recover', wingthrust: 'phill-wingthrust-recover',
  wingcombo: 'phill-wingcombo-recover', summon: 'phill-summon-recover',
  goldring: 'phill-goldring-recover', judgment: 'phill-judgment-recover',
  cage: 'phill-cage-recover', meteor: 'phill-meteor-recover',
  ringtoss: 'phill-ringtoss-recover', dive: 'phill-dive-recover',
  feathershot: 'phill-feathershot-recover',
};

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
  // ★v0.25.3591: noDamage=この爆風のパリィは**体勢だけ削ってHPダメージは0**(飛んでくる刃を弾いた時)。
  const parriedEnemyIds: { id: string; bx: number; by: number; noDamage?: boolean }[] = [];
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
    } else if (b.moveKey === 'driller-thrust') {
      // 削岩型の突き(検収監査#5): 雑魚の通常攻撃なので**全画面フラッシュは出さない**(3.5秒ごとに
      // 画面全体が明滅するのはうるさい)。判定終端の小さな火花+リングだけ(色はドリル=琥珀寄り)。
      const dcx = b.capsule ? b.capsule.tx : b.x, dcy = b.capsule ? b.capsule.ty : b.y;
      fx.spawnRing(dcx, dcy, 4, 26, 'rgba(255,190,90,0.9)', 3, 240);
      fx.spawnBurst(dcx, dcy, '#fbbf24', 10);
    } else {
      fx.spawnFlash('rgba(255,150,60,0.16)', 200);
      fx.spawnRing(b.x, b.y, 6, b.radius, 'rgba(255,170,80,0.9)', 4, 300);
      fx.spawnBurst(b.x, b.y, '#fb923c', 16);
    }
    const pr = Math.max(bp.width, bp.height) / 2;
    // M51: 薙ぎ払い(capsule付き)は円ではなく直線+半幅のカプセル判定(distToSegment流用)。
    // それ以外(パンプキン着地/スカジ氷等)は既存どおり円形(爆心からの距離<=半径+双方の当たり半径)。
    const inBlast = b.capsule
      ? distToBandRect({ x: bpcx, y: bpcy }, { x: b.capsule.fx, y: b.capsule.fy }, { x: b.capsule.tx, y: b.capsule.ty }, b.capsule.halfWidth) <= pr
      : Math.hypot(bpcx - b.x, bpcy - b.y) <= b.radius + pr;
    if (inBlast) {
      if (counterActive) {
        // カウンター成立は無敵中でも弾く(=確実にノックバック+クリ反撃)。
        // ※以前は !invulnerable を前提にしていたため、被弾i-frame中だとパリィが
        //   丸ごとスキップされ「カウンターしたのにノックバックしない」が起きていた。
        parriedEnemyIds.push({ id: b.enemyId, bx: b.x, by: b.y, ...(b.parryNoDamage ? { noDamage: true } : {}) });
      } else if (!bp.invulnerable) {
        const blastEnemyType = useGameStore.getState().enemies.find(e => e.id === b.enemyId)?.type;
        // G4a: b.moveKey=どの技の爆発か(記録専用タグ・未設定なら従来どおりundefined)。
        // 検収監査#6: 死因の技名はmoveKeyで分ける(削岩型の突きが「落下攻撃」と表示されていた)。
        const died = useGameStore.getState().damagePlayer(b.damage, `${enemyDeathLabel(blastEnemyType ?? '')}の${b.moveKey === 'driller-thrust' ? '突き' : '落下攻撃'}`, undefined, undefined, undefined, undefined, b.moveKey);
        fx.playSfx('player-damage');
        // 弾き出し: 爆心から外向きにプレイヤーをノックバック。
        // v0.25.2653: **技ごとの押し量**(b.kbSpeed/kbMs)があればそれを使う。未指定=従来の共通値。
        const ddx = bpcx - b.x, ddy = bpcy - b.y;
        const dd = Math.max(0.001, Math.hypot(ddx, ddy));
        const kbSp = b.kbSpeed ?? PLAYER_KNOCKBACK_SPEED;
        const kbMs = b.kbMs ?? PLAYER_KNOCKBACK_MS;
        useGameStore.setState(st => ({ player: {
          ...st.player,
          knockbackVx: (ddx / dd) * kbSp,
          knockbackVy: (ddy / dd) * kbSp,
          knockbackUntil: Date.now() + kbMs,
          knockbackMs: kbMs,
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
          ? distToBandRect({ x: gacx, y: gacy }, { x: b.capsule.fx, y: b.capsule.fy }, { x: b.capsule.tx, y: b.capsule.ty }, b.capsule.halfWidth) <= gar
          : Math.hypot(gacx - b.x, gacy - b.y) <= b.radius + gar;
        if (inBlastGhost) {
          // v0.25.2597: inAttackZone=この直上の `inBlastGhost` が「ゴーストが爆風/帯の中に居る」ことを
          // ゾーンの幾何で確かめ済み=**ゾーン型**。ボスの体の間合い判定は掛けない(掛けると、ボスが
          // その場から動かず衝撃波だけ飛ばす技を離れた位置でカウンターできなくなる=社長の実運用を壊す)。
          // ★社長裁定v0.25.3167「守護霊パリィは推薦で」= **現状維持**(この `inAttackZone: true` を残す)。
          //   経緯: v0.25.3165 で守護霊のカウンターをプレイヤーへ揃えた際、位置条件を
          //   「矩形が重なる」へ厳しくしたが、**ここだけは揃えなかった**。揃えると踏み鳴らし等の
          //   ゾーン型の技を守護霊が**原理上一度も弾けなくなる**ため。
          //   プレイヤー側もこの技には「ボスの体との距離」判定が無く(ゾーンの幾何だけ)、
          //   **実質すでに同条件**というのが判断の根拠。
          //   ⇒ **「パリティが揃っていない」という理由でここを直さないこと。**
          const gClaim = consumeGhostCounterClaim(b.enemyId, Date.now(), { inAttackZone: true });
          if (gClaim) {
            applyGhostCounterEffect(owner, gacx, gacy, { claim: gClaim, sfxGain: npcSfxDistGain(gacx, gacy, bpcx, bpcy, useGameStore.getState().camera, useGameStore.getState().gameBounds) }, (key, gain) => fx.playSfx(key, gain));
          } else {
            damageGhostAllyByBossMove(ghostAlly.id, b.damage, (x, y) => fx.spawnBurst(x, y, '#bae6fd', 3), b.x, b.y,
              `blast:${b.moveKey ?? (b.capsule ? 'capsule' : 'circle')}`);
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
    fx.spawnGlow(bpcx, bpcy, GLOW_R_L, 'rgba(56,189,248,', 360);
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
        // 覚醒(Lv3・v0.25.3303): 成立後3秒間 全攻撃+30%(成立7箇所共通のパッチ)。
        ...counterMasterAwakenBuffPatch(st.player, st.gameTime),
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
        // ★PACING_PUZZLE.md §10-15#2: phillbossは基本patchのKB系(位置飛ばし+knockbackVx/Vy/
        // knockbackUntil)から除外する。フィルはbossState駆動(angel系)で、位置飛ばしはangel tickの
        // 毎フレーム書き戻し(chase/技の位置patch)と衝突する。KB相当は下の「後追い分岐」が
        // bossStateの遷移(硬直)だけで表現する。
        const isPhill = e.type === 'phillboss';
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
          ...(isPhill ? {} : {
            x: e.x + ux * COUNTER_KNOCKBACK_LAUNCH,
            y: e.y + uy * COUNTER_KNOCKBACK_LAUNCH,
          }),
          vx: 0, vy: 0,
          // ★v0.25.3127(社長報告「紫ぴより中に、さらにカウンター決めると、黄色に戻っちゃう」):
          // 紫(完全気絶)は `stunUntil` と `bossFullStunUntil` を**同時に**打って成立している。
          // ここで凍結系を一律に解除すると **stunUntil だけ消えて紫の輪が消え**、直後にカウンターが
          // 立てた半減窓(黄)の輪が出るので「格下げされた」ように見えていた(体幹ブレイク自体は
          // 生きていて `bossFullStunUntil` は残る=表示と状態が食い違う)。
          // ⇒ **紫の最中は stunUntil を解除しない**。位置の弾き(COUNTER_KNOCKBACK_LAUNCH)は
          //   この直後に即時で効くので手応えは残り、速度スライドが止まるのは「完全気絶」と整合する。
          stunUntil: (e.bossFullStunUntil !== undefined && st.gameTime < e.bossFullStunUntil)
            ? e.stunUntil : undefined,
          liftUntil: undefined, rootUntil: undefined,
          knockbackImmuneUntil: 0,
          ...(isPhill ? {} : {
            knockbackVx: ux * COUNTER_KNOCKBACK_SPEED,
            knockbackVy: uy * COUNTER_KNOCKBACK_SPEED,
            knockbackUntil: pnow + KNOCKBACK_DURATION,
          }),
        };
      }),
    }));
    // クリティカル反撃(ヘッドショット): 弾いたジャンプ敵へ。aiPhase 解除済みでダメージが通る。
    const cBase = getActiveGun(bp)?.damage ?? 12;
    for (const hit of parriedEnemyIds) {
      const e = useGameStore.getState().enemies.find(en => en.id === hit.id);
      if (!e) continue;
      const boss = isBossType(e.type);
      // ★v0.25.3591(社長指示): 刃を弾いたパリィは**HP 0・体勢は通常どおり**。damageEnemy は体勢
      // (applyBossPostureDamage)を**ダメージ量とは無関係に**適用するので、量だけ0にすればよい。
      const dmg = hit.noDamage ? 0 : counterReplyDamage(cBase, bp, boss ? BOSS_CRIT_DAMAGE_MULT : CRIT_DAMAGE_MULT);
      const ex = e.x + e.width / 2, ey = e.y + e.height / 2;
      // CRIT-UNIFY §9.3(社長裁定F): パリィ反撃は確定クリ。ボスは①の効果(半減+CD2倍+紫蓄積)が
      // damageEnemy側で中央適用される。通常敵は現行クリ規則どおり5秒スタン(ノックバックと併存)。
      const parryKilled = useGameStore.getState().damageEnemy(hit.id, dmg, false, true, false, 'other', 'player', 'counter');
      recordCritHit('guaranteed', boss); // §7-11c(4): カウンター反撃(確定クリ)
      if (!parryKilled && !boss) {
        const stunMs = STUN_DURATION_MS * (bp.stunDurationMult ?? 1);
        useGameStore.getState().stunEnemy(hit.id, useGameStore.getState().gameTime + stunMs);
      }
      if (dmg > 0) fx.spawnDamageNumber(ex, e.y, dmg, true); // 0ダメージの「0」は出さない(刃のパリィ)
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
          // ★v0.25.3721(検収監査・時計の混在): bossStateUntilはgameTime基準のフィールド。
          // 旧Date.now()(絶対時刻≒1.7e12)だと出口判定 newGameTime >= bossStateUntil が永久に
          // 到達せず、**counter-leapが導入以来一度も終わっていなかった**(=パリィ後退が機能せず)。
          bossStateUntil: useGameStore.getState().gameTime + tunables.thorCounterLeapMs,
          aiFromX: tcx, aiFromY: tcy,
          aiTargetX: bpcx + (lx / ll) * tunables.thorOrbitDist,
          aiTargetY: bpcy + (ly / ll) * tunables.thorOrbitDist,
        } : en),
      }));
    }
    // ★PACING_PUZZLE.md §10-14#2(R2)/§10-15#2/#4: フィル(bossState駆動)はこのblastレールの
    // パリィpatch(aiPhase系のみ書く)が効かない=技が止まらず赤も消えなかった。**後追い分岐**として
    // bossState='phill-<move>-recover'+bossScriptQueue:[](天使正規経路angelCounterHitと同じ=台本の
    // 続きを止める)を明示的に書き、G1計測(notifyCounterHit)もここで揃える(blastレール側の
    // notifyMoveCounterだけだとフィル戦がcounterChance計測の母数から抜けるため)。
    for (const hit of parriedEnemyIds) {
      const pe = useGameStore.getState().enemies.find(en => en.id === hit.id);
      if (!pe || pe.type !== 'phillboss') continue;
      const slug = PHILL_MOVE_SLUGS.find(k => (pe.bossState ?? '').startsWith(`phill-${k}`));
      const recoverState = slug ? PHILL_RECOVER_STATE_BY_SLUG[slug] : undefined;
      if (!recoverState) continue; // 未知の州(想定外)は何もしない=安全側
      notifyCounterHit();
      useGameStore.setState(st => ({
        enemies: st.enemies.map(en => en.id === hit.id ? {
          // ★v0.25.3721(検収監査・実バグ級): gameTime基準に修正。旧Date.now()だとrecoverの出口が
          // 永久に来ず、カウンター成立1回でフィルが停止し続けていた(thor分岐の同型バグを写した事故)。
          ...en, bossState: recoverState, bossStateUntil: useGameStore.getState().gameTime + PHILL_COUNTER_RECOVER_MS, bossScriptQueue: [],
        } : en),
      }));
    }
  }
  useGameStore.setState({ pumpkinBlasts: [] });
};

// M67(PACING_PUZZLE.md §6.26-12): グレン(stage-7)専用「血の弧」(boon)が置く血溜まりの床。
// giantDelayedHitsのエントリのうちfloorUntil付き(=既に一度burstで爆発済み)を毎フレーム走査し、
// プレイヤーが接触していればdamagePlayerを呼ぶ(applyContactDamageと全く同じ作法=毎フレーム
// 呼ぶだけで、既存の被弾i-frame=INVULN_MSが自然にスロットルする。専用のDoTタイマーは作らない)。
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
          damageGhostAllyByBossMove(ghostAlly.id, e.damage, (x, y) => fx.spawnBurst(x, y, '#bae6fd', 3), h.x, h.y,
            `floor:${h.moveKey ?? 'giant'}`);
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
      const died = useGameStore.getState().damagePlayer(e.damage, 'グレンの血溜まり', h.x, h.y, undefined, undefined, h.moveKey);
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
    // KILL吹き飛び(死体・SKILL_BUILD_REDESIGN.md §26-2-2): 死体は発砲しない。
    if (isCorpse(enemy)) return;
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

// ---- 弾反射(カウンター家系①)の主語引数化 ----------------------------------------------------
// research/GHOST_PARITY_LEDGER.md §4-1 + 発注A(v0.25.2525・GHOST-REFLECT-MELEE-SUBS)。
// 「窓中に自分へ当たった敵弾を打ち返す」1回分。プレイヤーと守護霊が**同じ1本**を通る
// (BOT_AND_GHOST.md §2.11補足「写すな、共通化しろ」)。差分は主語(窓の宛先)だけ:
//   ghostId 未指定 → プレイヤー(従来と1bitも変わらない: 窓延長+lastCounterSuccessTime+
//                    counter-masterのCDリファンド)。
//   ghostId 指定   → 守護霊(窓=Summon.ghostCounterWindowEnd を同じ COUNTER_EXTEND_PER_HIT で延長。
//                    プレイヤーのシステム値(CD/成立時刻/コンボ/計測)には触らない=除外4)。
// 反射弾の生成(向き反転/速度/×REFLECT_DAMAGE_MULTIPLIER/貫通なし)とボムカウンター化は共有。
// スキル(bomb-counter)の主語は `subject`=守護霊なら計測時ビルドの疑似Player。
const applyCounterReflect = (
  projId: string,
  now: number,
  subject: Player,
  tunables: Pick<CombatTunables, 'grenadeBlastRadius' | 'grenadeBlastDamageMult'>,
  ghostId?: string,
): void => {
  // SKILL_BUILD_REDESIGN.md §28(B7/§28-1) スキル: 弾幕の王(barrage-king) = 反射弾のダメ・体勢削り
  // ×1.5/1.75/2.0(全Lv)。既存の反射倍率(REFLECT_DAMAGE_MULTIPLIER)に加算(乗算)する。
  const bkLv = skillLevel(subject, 'barrage-king');
  const reflectMult = bkLv ? REFLECT_DAMAGE_MULTIPLIER * barrageKingMult(bkLv) : undefined;
  useGameStore.getState().reflectProjectile(projId, reflectMult, ghostId !== undefined ? GHOST_REFLECT_WEAPON_KEY : undefined);
  // §28-1追加: 弾幕の王は反射弾に貫通1を持たせ(全Lv共通)、体勢削り倍率も弾へ載せて命中時に運ぶ
  // (postureMult。damageEnemyの呼び出し側=useGameLoopの命中処理がprojectile.postureMultを読む)。
  if (bkLv) {
    const postureMult = barrageKingMult(bkLv);
    // 社長指示v0.25.3300 弾幕の王 覚醒(Lv3): 反射弾の貫通が無限になる(通常はBARRAGE_KING_PIERCE=1)。
    const bkPierce = bkLv >= 3 ? Number.POSITIVE_INFINITY : BARRAGE_KING_PIERCE;
    useGameStore.setState(state => ({
      projectiles: state.projectiles.map(p => p.id === projId ? { ...p, pierce: bkPierce, postureMult } : p),
    }));
  }
  // スキル: ボムカウンター = 反射弾がランチャー弾化し、命中で GRENADE_* 爆発。
  const bcLv = skillLevel(subject, 'bomb-counter');
  if (bcLv) {
    const bcRadiusMult = [0, 1, 1.15, 1.3][bcLv];
    const bcDmgMult = [0, 1, 1.25, 1.5][bcLv];
    useGameStore.setState(state => ({
      projectiles: state.projectiles.map(p =>
        p.id === projId
          ? { ...p, explodeOnHit: true, explodeRadius: tunables.grenadeBlastRadius * bcRadiusMult, explodeDamageMult: tunables.grenadeBlastDamageMult * bcDmgMult }
          : p
      ),
    }));
  }
  // Each successful reflect refreshes the window so a barrage
  // can be turned back fully. The cooldown still gates a NEW
  // counter trigger once the chain finally lapses.
  if (ghostId === undefined) {
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
        // 覚醒(Lv3・v0.25.3303): 成立後3秒間 全攻撃+30%(成立7箇所共通のパッチ)。
        ...counterMasterAwakenBuffPatch(state.player, state.gameTime),
      }
    }));
    return;
  }
  // 守護霊: 窓の延長だけ同じ規格で行う(ゴーストにCD/成立時刻の帳簿は無い=ghostDriverのlastMeleeAtが
  // スイング間隔を持つ。プレイヤーのCD/コンボ/計測は触らない)。
  useGameStore.setState(state => ({
    summons: state.summons.map(s => s.id === ghostId
      ? { ...s, ghostCounterWindowEnd: Math.max(s.ghostCounterWindowEnd ?? 0, now + COUNTER_EXTEND_PER_HIT) }
      : s),
  }));
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
      // 反射1回分は共有関数(主語=プレイヤー。ghostId未指定=従来と1bit同値)。
      applyCounterReflect(proj.id, now, currentPlayer, tunables);
      reflectedAny = true;
    } else {
      const wasVulnerable = !useGameStore.getState().player.invulnerable;
      const rnMult = redNightActive ? 2 : 1;
      // 叫喚型の強化窓中は通常敵(ボス/screamer以外)の飛び道具ダメージも×SCREAMER_BUFF_MULT。
      const scMult = (screamerBuffUntil > gameTime && proj.ownerType && proj.ownerType !== 'screamer' && !isBossType(proj.ownerType)) ? SCREAMER_BUFF_MULT : 1;
      // G4a/GHOST-BULLET-TECH(§2.9・記録専用): 技キーは**弾自身が持っている**(発射時に
      // createEnemyProjectile が付ける `srcMoveKey`)。旧実装は「giantbat の弾=g-bolt」という
      // 発射元タイプ推定だったが、弾技を全ボスへ広げたので弾のタグを読むだけにする
      // (giantbat 新スクリプトの咆哮弾は同じ 'g-bolt' が載る=旧挙動と同値)。
      const playerDied = useGameStore.getState().damagePlayer(proj.damage * rnMult * scMult, '敵の飛び道具', proj.x + proj.width / 2, proj.y + proj.height / 2, undefined, undefined, proj.srcMoveKey);
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
      // v0.25.2525(発注A・台帳§4-1「弾反射」): 守護霊も**プレイヤーと同じ窓・同じ条件・同じ反射弾生成**で
      // 打ち返す。窓は近接スイング(通常スイング/一閃)起点で開く ghostCounterWindowEnd(=COUNTER_WINDOW)。
      // 反射が成立した弾は当然ダメージにならない(プレイヤーの反射と同じ二択)。
      // 除外1: 停止/スロー/寄りズームは出さない(青い成立層+シェイクのみ=applyGhostReflectCounterFx)。
      // 除外4: 反射弾は 'ghost-reflect' 帰属=プレイヤーの計測を汚さない/ヘイトは'ghost'/SEは距離減衰。
      let ghostReflectedAt: { x: number; y: number } | null = null;
      for (const proj of ghostHits) {
        const liveGhost = useGameStore.getState().summons.find(s => s.id === ghostAlly.id);
        if (!liveGhost) break; // 直前の被弾で解散した=以降の弾は素通り(既存の damageSummon の解散と同じ扱い)
        if (now <= (liveGhost.ghostCounterWindowEnd ?? 0)) {
          // 倍率評価の主語=計測時ビルドの疑似Player(combatActorPlayer)。ビルド無し(旧プロファイル)の
          // 時は本人のプレイヤーで評価する=ghostBuild未搭載でも反射自体は成立する。
          const subject = combatActorPlayer(liveGhost.id) ?? useGameStore.getState().player;
          applyCounterReflect(proj.id, now, subject, tunables, liveGhost.id);
          ghostReflectedAt = { x: liveGhost.x + liveGhost.width / 2, y: liveGhost.y + liveGhost.height / 2 };
          continue;
        }
        damageGhostAllyByBossMove(ghostAlly.id, proj.damage * rnMult, (x, y) => fx.spawnBurst(x, y, '#bae6fd', 3),
          proj.x + proj.width / 2, proj.y + proj.height / 2,
          `proj:${proj.srcMoveKey ?? proj.ownerType ?? 'unknown'}`);
        useGameStore.getState().removeProjectile(proj.id);
      }
      // 成立演出は1フレーム1回(プレイヤー側の reflectedAny と同じ流儀)。SEはゴースト位置で距離減衰。
      if (ghostReflectedAt) {
        const gs = useGameStore.getState();
        const gain = npcSfxDistGain(
          ghostReflectedAt.x, ghostReflectedAt.y,
          gs.player.x + gs.player.width / 2, gs.player.y + gs.player.height / 2,
          gs.camera, gs.gameBounds,
        );
        applyGhostReflectCounterFx(ghostReflectedAt.x, ghostReflectedAt.y, gain, (key, g) => fx.playSfx(key, g));
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
    fx.spawnGlow(pcx, pcy, GLOW_R_L, 'rgba(56,189,248,', tunables.counterReflectSlowMs);
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
 * 含めない)。applyContactDamage内のdashParried判定と共有する正本リスト。
 * v0.25.3050(社長指示「②直して」): M51期の5技の後に足された技(M65/M66/M67のステージ固有技・大技・
 * グレン専用技)の**硬直(recover)**が取りこぼされていた=W7「硬直中の接触=カウンター可」(§6.28-3)の
 * 反撃報酬が単発ダッシュ等と不揃いだった。全g-*-recoverを追加(硬直はダメージを持たない=報酬窓のみ)。
 * 実行中(active/charge)は従来どおり増やさない——g-quad-chargeは社長裁定v0.25.3049で**カウンター不可**
 * (紫線)として確定済み=ここに加えないこと(ghostBossParry.testで機械化済み)。 */
const GIANT_PARRYABLE_PHASES: readonly string[] = [
  'g-dash-charge', 'g-sweep-active',
  'g-stomp-recover', 'g-sweep-recover', 'g-dash-recover', 'g-jump-recover', 'g-bolt-recover',
  // M65(stage-1固有技/大技)・M66(stage-3〜5固有技/大技)の硬直(v0.25.3050)
  'g-bite-recover', 'g-slam-recover', 'g-wing-recover',
  'g-glide-recover', 'g-dive-recover',
  'g-quad-recover', 'g-nova-recover',
  'g-trishot-recover', 'g-sweepbeam-recover',
  // M67(グレン専用技)の硬直(v0.25.3050)
  'g-trijump-recover', 'g-talon-recover', 'g-boon-recover', 'g-reach-recover', 'g-nihil-recover',
  'g-tailslam-recover', // v0.25.3139: 尻尾の叩きつけ→弾連射の硬直=反撃窓
];

/** プレイヤーの接触パリィ(dashParried)が成立しうるフェーズか。applyContactDamage内の3分岐
 * (①jump/g-jump-air ②charge/recover/crouch ③giantbatのGIANT_PARRYABLE_PHASES)の合成述語。
 * ※分岐構造そのもの(①はカウンター窓外でも被弾無し等)は applyContactDamage 側が正本。
 *   あちらの当該分岐を変更したら必ずここも同期すること(逆も然り)。
 *   気絶中(stunUntil)のパリィは接触被弾回避の防御目的なので守護霊側には含めない。 */
/**
 * v0.25.2601(社長裁定「その第三案でいい」): 城ボスの**飛び掛かり中(g-jump-air)のカウンターは
 * 「着地したら当たる位置」に居る時だけ成立する**。
 *
 * なぜ: 空中は「体に触れれば取れる」ため、**着地の赤い円と無関係な位置**(ボスの通り道)でも成立して
 * いた=「見たまんまが当たり判定」(CLAUDE.md 攻撃ヴィジュアルの分類①)に反していた。空中で弾ける
 * こと自体は残す(消すとジャンプが「避ける/食らう」の二択になり、硬直を叩くしか残らなくなる)。
 *
 * 幾何は**着地の爆風判定と1バイトも同じ**(中心=ロック済み着地点 aiTarget+半身、半径=gJumpRadius、
 * 相手の当たり半径を足す)。描画の赤円(pixiScene)も同じフィールドを読むので、**赤い円の中=弾ける**が
 * 厳密に一致する。着地点が未確定(旧セーブ等)の時は従来どおり通す=判定を厳しくするのは
 * 「円の外に居る」と確認できた時だけ。
 */
export const inGiantJumpLandingZone = (
  actorCx: number, actorCy: number, actorRadius: number,
  enemy: Pick<Enemy, 'aiTargetX' | 'aiTargetY' | 'width' | 'height' | 'gJumpRadius'>,
): boolean => {
  if (enemy.aiTargetX === undefined || enemy.aiTargetY === undefined) return true;
  const lx = enemy.aiTargetX + enemy.width / 2;
  const ly = enemy.aiTargetY + enemy.height / 2;
  const r = enemy.gJumpRadius ?? GIANT_JUMP_RADIUS;
  return Math.hypot(actorCx - lx, actorCy - ly) <= r + actorRadius;
};

/**
 * v0.25.3050(社長指示「①直して」): グレンの三連跳び(g-trijump-air)を単発の飛び掛かり(g-jump-air)と
 * 同じ扱いにする——**空中の体当たりは被弾しない**+カウンターは**今の跳びの着地円の中**でだけ成立。
 * 従来は g-trijump-air が空中特例のリストに無く、通り道に触れると生の接触ダメージを受けていた
 * (v0.25.3049監査の発見(a))。幾何は着地の爆風判定と同一: 中心=gTriJumpPts[今のidx](中心座標)、
 * 半径=GLEN_TRIJUMP_RADIUS+相手の当たり半径。着地点が未確定(旧データ等)の時は従来どおり通す
 * (inGiantJumpLandingZoneと同じフェイルオープン)。
 */
export const inGlenTriJumpLandingZone = (
  actorCx: number, actorCy: number, actorRadius: number,
  enemy: Pick<Enemy, 'gTriJumpPts' | 'gTriJumpIdx'>,
): boolean => {
  const idx = enemy.gTriJumpIdx ?? 0;
  const lx = enemy.gTriJumpPts?.[idx * 2];
  const ly = enemy.gTriJumpPts?.[idx * 2 + 1];
  if (lx === undefined || ly === undefined) return true;
  return Math.hypot(actorCx - lx, actorCy - ly) <= GLEN_TRIJUMP_RADIUS + actorRadius;
};

/**
 * v0.25.3052(社長裁定「滑空の案はうで」): 滑空(g-glide-active)も空中族に——**通過中の体当たりは
 * 被弾しない**(ダメージは赤い帯のカプセル爆発+終点の二撃目だけ=図形と判定の厳密一致)。
 * カウンターは**赤い帯の中**に居て触れた時だけ成立(帯の外で巨体の端に触れても弾けない=
 * 「赤い円の中=弾ける」のv2601と同じ考え方の帯版)。幾何は帯の爆発判定と同一:
 * 線分=aiFrom中心→aiTarget中心、半幅=GIANT_GLIDE_HALF_WIDTH+相手の当たり半径。
 * 端点未確定(旧データ等)はフェイルオープン(他の着地円と同じ)。
 */
export const inGiantGlideBand = (
  actorCx: number, actorCy: number, actorRadius: number,
  enemy: Pick<Enemy, 'aiFromX' | 'aiFromY' | 'aiTargetX' | 'aiTargetY' | 'width' | 'height'>,
): boolean => {
  if (enemy.aiFromX === undefined || enemy.aiFromY === undefined
    || enemy.aiTargetX === undefined || enemy.aiTargetY === undefined) return true;
  return distToBandRect(
    { x: actorCx, y: actorCy },
    { x: enemy.aiFromX + enemy.width / 2, y: enemy.aiFromY + enemy.height / 2 },
    { x: enemy.aiTargetX + enemy.width / 2, y: enemy.aiTargetY + enemy.height / 2 },
    GIANT_GLIDE_HALF_WIDTH,
  ) <= actorRadius;
};

/** ※ v0.25.2601: `g-jump-air` はこの述語を通ったうえで **inGiantJumpLandingZone** も要る
 *   (位置条件はこの述語に持たせない=主語の座標を受け取らない純粋なフェーズ判定のまま保つ)。 */
export const isDashParryCounterPhase = (enemy: Pick<Enemy, 'type' | 'aiPhase'>): boolean =>
  enemy.aiPhase === 'jump' || enemy.aiPhase === 'g-jump-air'
  || (enemy.type === 'giantbat' && enemy.aiPhase === 'g-trijump-air') // v0.25.3050: 三連跳びも空中族(着地円条件は呼び出し側=g-jump-airと同じ作法)
  || (enemy.type === 'giantbat' && enemy.aiPhase === 'g-glide-active') // v0.25.3052(案う): 滑空も空中族(帯内条件は呼び出し側)
  || enemy.aiPhase === 'charge' || enemy.aiPhase === 'recover' || enemy.aiPhase === 'crouch'
  || (enemy.type === 'giantbat' && enemy.aiPhase !== undefined && GIANT_PARRYABLE_PHASES.includes(enemy.aiPhase));

/** dashParried成立時の敵側変換(技の中断+攻め手から弾き飛ばすノックバック)。
 * applyContactDamageのプレイヤー経路と守護霊経路(applyGhostBossParry)の両方がこの1本を使う
 * (v0.25.2480でプレイヤー経路のインライン実装をここへ切り出し・挙動同一)。 */
/**
 * カウンターを受けても**技を中断しない**フェーズ(社長指示v0.25.3145「尻尾攻撃、カウンターで中断しないで」)。
 * 尻尾の叩きつけ→弾の連射は「叩きつけたら必ず撃ち切る」1つの技として設計されているので、
 * 途中でカウンターが刺さっても**フェーズを消さない**(=残りの連射が出る)。
 * カウンター自体は従来どおり成立する(ダメージ・確定クリ・ノックバックは入る)——**報酬は消さず、
 * 技の完走だけを守る**。「薙ぎ払いは出し切る」(社長指示v0.25.3106)と同じ思想の、判定側での実装。
 */
const COUNTER_UNINTERRUPTIBLE_PHASES: readonly string[] = [
  'g-tailslam-windup', 'g-tailslam-active', 'g-tailslam-volley', 'g-tailslam-recover',
];

export const dashParriedEnemyPatch = (
  e: Enemy, originX: number, originY: number, pnow: number, gameTimeNow: number,
): Enemy => {
  const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
  // 中断しない技は、フェーズ関連のフィールドを**1つも触らない**で返す(下の一括クリアを免除)。
  const keepPhase = e.aiPhase !== undefined && COUNTER_UNINTERRUPTIBLE_PHASES.includes(e.aiPhase);
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
    // 突進/ジャンプ中断。※ COUNTER_UNINTERRUPTIBLE_PHASES の技だけは技を消さない(社長指示v0.25.3145)。
    ...(keepPhase ? {} : {
      aiPhase: undefined,
      aiPhaseUntil: undefined, aiStartedAt: undefined,
      aiTargetX: undefined, aiTargetY: undefined, aiFromX: undefined, aiFromY: undefined,
      aiReadyAt: gameTimeNow + 1200, // 少し間を空ける(giantbat は gbDashReadyAt 側で管理)
    }),
    // 即時に弾き飛ばし+凍結系/ノックバック無敵を全解除(ジャンプカウンターと同根の対策)。
    // ★中断しない技でも位置は動く(弾き返しの手応えは残す)。帯は溜め開始で焼いた aiFrom→aiTarget を
    //   そのまま使うので、本体が押されても**赤い予告と判定はズレない**(判定の正本は焼いた座標)。
    x: e.x + ux * COUNTER_KNOCKBACK_LAUNCH,
    y: e.y + uy * COUNTER_KNOCKBACK_LAUNCH,
    vx: 0, vy: 0,
    // v0.25.3127: 紫(完全気絶)中は解除しない(上のジャンプ経路と同じ理由・同じ扱い)。
    stunUntil: (e.bossFullStunUntil !== undefined && gameTimeNow < e.bossFullStunUntil)
      ? e.stunUntil : undefined,
    liftUntil: undefined, rootUntil: undefined,
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
  // v0.25.2597: ここは**接触型**(プレイヤー側の対応経路 dashParried は checkPlayerEnemyCollisions=
  // 体が重なっていることが必須)。よって inAttackZone は渡さない=既定の間合い判定が掛かる。
  // これが無いと giantbat の飛び掛かり(g-jump-air)/着地硬直(g-jump-recover)を**どんな距離からでも**
  // 成立させてしまう(社長報告「赤いサークルとかなり離れた位置でカウンターを取っていた」)。
  const claim = peekGhostCounterClaim(nowMs);
  if (!claim) return;
  const state = useGameStore.getState();
  const boss = state.enemies.find(e => e.id === claim.bossId);
  if (!boss || boss.type !== 'giantbat') return; // 他ファミリーの請求はそれぞれのハンドラが消費する
  // v0.25.2601(社長裁定・第三案): 飛び掛かり中は**着地したら当たる位置**に居る時だけ弾ける
  // (プレイヤー側 applyContactDamage の同じ条件と対。幾何は着地の爆風判定と同一)。
  // ここは**消費せずに帰る**=円の外なら請求は残し、着地の爆風側(inBlastGhost経路)の判定に回す
  // (円の外なら爆風にも当たらないので実質は流れるだけ。同フレームの正当な弾きを潰さないため)。
  if (boss.aiPhase === 'g-jump-air' || boss.aiPhase === 'g-trijump-air' || boss.aiPhase === 'g-glide-active') {
    const g = state.summons.find(s => s.kind === 'ghost-ally');
    if (!g) return;
    const gcx = g.x + g.width / 2, gcy = g.y + g.height / 2, gr = Math.max(g.width, g.height) / 2;
    // v0.25.3050: 三連跳びはプレイヤー経路と同じく「今の跳びの着地円」で判定(g-jump-airと同じ作法)。
    // v0.25.3052(案う): 滑空は「赤い帯の中」で判定(同じくプレイヤー経路と対)。
    const inZone = boss.aiPhase === 'g-jump-air'
      ? inGiantJumpLandingZone(gcx, gcy, gr, boss)
      : boss.aiPhase === 'g-trijump-air'
        ? inGlenTriJumpLandingZone(gcx, gcy, gr, boss)
        : inGiantGlideBand(gcx, gcy, gr, boss);
    if (!inZone) return;
  }
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
  const bossContactParries: { id: string; ux: number; uy: number }[] = [];

  playerEnemyCollisions.forEach(enemy => {
    if (wireDashingNow) return;
    // トール(ステージ5裏ボス)専用の攻撃実行中(chase/return以外のbossState)は、通常の接触ダメージを
    // 適用しない=各攻撃(一閃/突き/払い/ジャンプ攻撃)自身の当たり判定/カウンター処理に委ねる
    // (社長指示: 一閃・突きは「もとの当たり判定ではなくライン上のみ」)。
    // ★v0.25.3808(検収監査7巡目 中7)= **裁定待ちの暫定措置**。突進の走り(thor-dash-move)を
    // **除外へ戻した**(=走行中は接触ダメージを与えない)。
    //   経緯: v0.25.3784 でこの除外から `thor-dash-move` を外し(ミゲルに揃えて「当たる」側にした)、
    //   以後 v0.25.3785〜3806 も現状維持で来た。ところが research/THOR_ISSEN_REWORK.md §9-6 は
    //   「(a)当てる を採るなら **①走行中の赤い帯 ②botへの通知 は選択肢ではなく両方要る**。
    //   **1セットを入れないまま当てるくらいなら、当てない方がまだ良い**」と書いており、
    //   ①②はどちらも未実施のまま。つまり実機に載っていたのは
    //   **「細い赤い線しか出ていないのに巨体のAABBが230ms判定を持つ」=「赤くないのに当たる」**で、
    //   CLAUDE.md「攻撃ヴィジュアルの2分類」が唯一妥協しないと書いている禁則そのものだった。
    //   よって**社長裁定が出るまでは設計書自身の言う「まだ良い」側(=当てない)へ置く**。
    //   (a)の裁定が出たら、この行から `thor-dash-move` を外すのと**同時に**①②を入れる。
    // 上の3技(一閃/突き/払い)とジャンプは従来どおり除外=「もとの当たり判定ではなくライン上のみ」
    // (社長指示)を維持する。
    if (enemy.type === 'thor' && enemy.bossState && enemy.bossState !== 'chase' && enemy.bossState !== 'return') return;
    // ジャンプ攻撃で敵が空中(aiPhase==='jump')の間はプレイヤーは被弾しない。
    // カウンター窓中ならカウンター成立=クリティカル反撃(ヘッドショット)を返す。
    // M51: ジャイアント新スクリプトの飛び掛かり滞空(g-jump-air)も同じ扱い(既存'jump'と同義)。
    // v0.25.3050(社長指示①): グレンの三連跳び(g-trijump-air)も空中族に追加——空中は被弾しない+
    // カウンターは今の跳びの着地円の中でだけ(単発の飛び掛かりg-jump-airと同じ扱い。監査v3049の発見(a))。
    // v0.25.3052(社長裁定「滑空の案はうで」): 滑空(g-glide-active)も空中族——通過中の体当たりは
    // research/GHOST_BOSS.md(決闘仕様): 幻影は**接触では削らない**(ENEMY_STATS.damage=0)。
    // damage=0 のまま下の damagePlayer へ落とすと i-frame が立たず(gameStore側は amount>0 でのみ
    // invulnerable を立てる)、重なった毎フレーム被弾SE+赤フラッシュ+赤バーストだけが鳴り続ける
    // (v0.25.3632・成果物監査 重大2)。接触は演出ごと素通りさせる(技のダメージは phantomTick 側)。
    if (isGuardianPhantom(enemy.type)) return;
    // 被弾しない(ダメージ=赤い帯のカプセル爆発+終点二撃目のみ)。カウンターは赤い帯の中でだけ。
    if (enemy.aiPhase === 'jump' || enemy.aiPhase === 'g-jump-air' || enemy.aiPhase === 'g-trijump-air'
      || (enemy.type === 'giantbat' && enemy.aiPhase === 'g-glide-active')) {
      // v0.25.2601(社長裁定・第三案): 城ボスの飛び掛かりは**着地したら当たる位置**でだけ弾ける
      // (赤い着地円=カウンターできる範囲、を一致させる)。空中で被弾しないこと自体は不変。
      // 旧 'jump'(パンプキン等の非ボス)は対象外=従来どおり触れていれば弾ける。
      const pCx = collPlayer.x + collPlayer.width / 2;
      const pCy = collPlayer.y + collPlayer.height / 2;
      const pRad = Math.max(collPlayer.width, collPlayer.height) / 2;
      const jumpZoneOk = enemy.aiPhase === 'g-jump-air'
        ? inGiantJumpLandingZone(pCx, pCy, pRad, enemy)
        : enemy.aiPhase === 'g-trijump-air'
          ? inGlenTriJumpLandingZone(pCx, pCy, pRad, enemy)
          : enemy.aiPhase === 'g-glide-active'
            ? inGiantGlideBand(pCx, pCy, pRad, enemy)
            : true;
      if (counterActiveNow && jumpZoneOk) dashParried.push(enemy.id);
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
    // v0.25.2946(社長裁定「体勢値は削ってあげたら?」): 裏ボス系(裏4体/天使6体/idol=体幹持ち)の
    // **追跡中の体当たり**は、カウンター窓中なら「受け流し」= 無傷+体幹を'heavy'(最大値の0.10)削る。
    // フルカウンター報酬(5倍クリ反撃・攻撃技への成立扱い)は付けない=攻撃ではなく防御の動詞。
    // 削り続ければ体幹ブレイク(紫)で完全に「止まる」= 社長報告「カウンターしても止まらないので食らう」への答え。
    // 連発防止: 被弾と同じi-frame作法(無敵中は成立しない+成立時に無敵を開く)=最短INVULN_MS間隔。
    // W7(溜め/硬直/突進中の体当てカウンター=フル報酬)には触れない(あちらはbossState側の経路)。
    // v0.25.2956(社長報告「ミーミルの体当たりが止まらない。一瞬も止まらない。はじかれもしてない」):
    // 旧条件の連発防止=「プレイヤー無敵中は不成立」は、巨体と重なり続ける状況で受け流しを事実上
    // 不能にしていた——接触被弾のi-frame(700ms)の中にカウンター窓(400ms)が必ず収まるため、
    // **反応でカウンターしても常に無敵中=不成立**(先読みで当てる以外に道がない)。
    // 連発防止はボス側の拘束(rootUntil=900ms)基準へ付け替える: 拘束中の再受け流しだけを禁じ、
    // 被弾直後(無敵中)のカウンターでも受け流しが立つようにする。体幹削りの頻度上限は
    // 旧i-frame基準(700ms)→root基準(900ms)でむしろ厳しくなる=インフレしない。
    const bossParryRooted = enemy.rootUntil !== undefined && gameTime < enemy.rootUntil;
    // ★v0.25.3785(検収監査 重大A): **トールの突進の走り(thor-dash-move)だけは受け流しへ落とさない**。
    // v0.25.3784 で上の除外から thor-dash-move を外した(=接触ダメージをミゲルに揃えた)結果、
    // 同じ forEach の下流にあるこの「ボス接触受け流し」へも突進が流れ込むようになった
    // (isHiddenBoss は 'thor' を含む)。受け流しは rootUntil=900ms を立て、それを useGameLoop の
    // frozen が拾って bossState='chase' にするため、**突進のカウンター(Counter!演出/クリ反撃/
    // counter-leap/弾き返し/専用CD)が丸ごと出ない**。しかも競合順序が固定で不利:
    // ボスtickは**フレーム頭の座標**で重なりを見て、その後に座標を進める/この関数は**進めた後の
    // 座標**で見る ⇒「突進が到達したフレーム」は必ずこちらが先に取る。
    // よって走行中は**接触ダメージだけを通し**、カウンターの解決はトール側(useGameLoop の
    // 共通カウンターブロック=counterReach の宣言表 'hidden:thor-dash-move')の1本に残す。
    // ※v0.25.3808(中7)で上のトール除外へ `thor-dash-move` を戻したため、**今この行はここへ
    //   到達しない**(走行中は forEach の冒頭で return する)。§9-6 が(a)「当てる」で裁定されて
    //   除外を外した瞬間に、この受け流しの横取り(=カウンターが丸ごと消える実バグ)がそのまま
    //   復活するので、**残置する**(消すと裁定と同時に踏み直す)。
    // ★v0.25.3809(検収監査8巡目 重大4): その「残置する」を守るテストが**1本も無かった**
    //   (宣言ごと削除しても全緑=次のデッドコード掃除で必ず消える導火線)。述語を純関数
    //   `shouldSkipBossContactParry` へ出し、`'thor-dash-move'` で true を**値でアサート**する
    //   ことで、到達可能かどうかと無関係に生き続ける形にした。**挙動は1bitも変えていない。**
    const thorDashRunNow = shouldSkipBossContactParry(enemy.type, enemy.bossState);
    if (BOSS_CONTACT_PARRY_ENABLED && counterActiveNow && !bossParryRooted && !thorDashRunNow && isHiddenBoss(enemy.type)) {
      // v0.25.2954(社長指示「体当たりカウンターしたら少しノックバックしてから硬直にして」):
      // 押す向き=プレイヤー→ボス(離れる方向)。ゼロ距離の退避は上向き。
      const pdx = (enemy.x + enemy.width / 2) - (collPlayer.x + collPlayer.width / 2);
      const pdy = (enemy.y + enemy.height / 2) - (collPlayer.y + collPlayer.height / 2);
      const plen = Math.hypot(pdx, pdy);
      bossContactParries.push(plen > 0.001
        ? { id: enemy.id, ux: pdx / plen, uy: pdy / plen }
        : { id: enemy.id, ux: 0, uy: -1 });
      return;
    }
    const damageWasApplied = !collPlayer.invulnerable;
    const rnMelee = redNightActive ? 2 : 1;
    // 叫喚型の強化窓中は通常敵(ボス/screamer以外)の接触ダメージも×SCREAMER_BUFF_MULT。
    const scMelee = (screamerBuffUntil > gameTime && enemy.type !== 'screamer' && !isBossType(enemy.type)) ? SCREAMER_BUFF_MULT : 1;
    // G4a(§2.9・記録専用): 体当たりそのものが技のダメージであるフェーズ(g-dash-charge/g-quad-charge)
    // だけ技キーを付ける(純関数contactDamageMoveKey)。それ以外の接触は従来どおりタグ無し。
    // ※g-glide-activeはv0.25.3052(案う)で空中族へ移動=ここへは到達しない(タグ表は記録専用なので残置)。
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
  // v0.25.2946: 受け流しの反映=体幹削り+プレイヤーi-frame+軽い成立FX(重い演出は使わない=負荷方針)。
  if (bossContactParries.length > 0) {
    const parryNow = Date.now();
    useGameStore.setState(st => ({
      enemies: st.enemies.map(e => {
        const parry = bossContactParries.find(c => c.id === e.id);
        if (!parry) return e;
        const bump = applyBossPostureDamage(e, 'heavy', gameTime);
        // 体幹削り+拘束900ms(v0.25.2949)。vx/vyも止める(トラップのroot付与と同じ作法)。
        // v0.25.2954: 拘束の前に**少しノックバック**(社長指示)。近接カウンターの押し(KNOCKBACK_SPEED
        // 133px/s・280ms減衰)と同じ量。isHiddenBoss はupdateEnemiesのノックバック適用が
        // knockbackShoveUntil(押し道具ガード)を要求するので同期限で開ける。位置スライドは
        // updateEnemies側・拘束(rootUntil)は3コントローラ側=同時に効いて「押されてから固まる」になる。
        return {
          ...e, ...(bump?.patch ?? {}),
          rootUntil: gameTime + BOSS_CONTACT_PARRY_ROOT_MS, vx: 0, vy: 0,
          knockbackVx: parry.ux * KNOCKBACK_SPEED, knockbackVy: parry.uy * KNOCKBACK_SPEED,
          knockbackUntil: parryNow + KNOCKBACK_DURATION,
          knockbackShoveUntil: parryNow + KNOCKBACK_DURATION,
        };
      }),
      player: { ...st.player, invulnerable: true, invulnerableTime: parryNow },
    }));
    const pp = useGameStore.getState().player;
    const ppx = pp.x + pp.width / 2, ppy = pp.y + pp.height / 2;
    fx.playSfx('counter');
    fx.spawnRing(ppx, ppy, 10, 60, 'rgba(56,189,248,0.85)', 3, 260);
    fx.spawnBurst(ppx, ppy, '#38bdf8', 8);
  }
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
    fx.spawnGlow(ppx, ppy, GLOW_R_L, 'rgba(56,189,248,', 360);
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
        // 覚醒(Lv3・v0.25.3303): 成立後3秒間 全攻撃+30%(成立7箇所共通のパッチ)。
        ...counterMasterAwakenBuffPatch(st.player, st.gameTime),
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
      const dashParryKilled = useGameStore.getState().damageEnemy(eid, dmg, false, true, false, 'other', 'player', 'counter');
      recordCritHit('guaranteed', boss); // §7-11c(4): カウンター反撃(確定クリ)
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
