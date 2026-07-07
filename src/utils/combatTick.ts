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

import type { Player } from '../types/game';
import type { SfxKey } from '../audio/audioManager';
import {
  isBossType, isHiddenBoss, resolveEnemyTarget, getEnemyFireProfile, createEnemyProjectile,
} from './enemyUtils';
import { ALCHEMY_AGGRO_RANGE } from './summonUtils';
import { getActiveGun } from './weaponUtils';
import { checkCollision, checkPlayerEnemyCollisions, checkProjectilePlayerCollisions } from './collisionUtils';
import {
  useGameStore, isSeekerActive, skillLevel, skillCritMult, skillOutgoingDamageMult, enemyDeathLabel,
  ENEMY_ATTACK_SPEED_MULT, SCREAMER_BUFF_MULT, MINE_DAMAGE,
  COUNTER_EXTEND_PER_HIT, COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG,
  MELEE_FINISH_SLOW_MS, MELEE_FINISH_SLOW_HOLD_MS,
  KNOCKBACK_DURATION, COUNTER_KNOCKBACK_LAUNCH, COUNTER_KNOCKBACK_SPEED,
  PLAYER_KNOCKBACK_SPEED, PLAYER_KNOCKBACK_MS,
  CRIT_DAMAGE_MULT, BOSS_CRIT_DAMAGE_MULT,
} from '../store/gameStore';

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
    if (Math.hypot(bpcx - b.x, bpcy - b.y) <= b.radius + pr) {
      if (counterActive) {
        // カウンター成立は無敵中でも弾く(=確実にノックバック+クリ反撃)。
        // ※以前は !invulnerable を前提にしていたため、被弾i-frame中だとパリィが
        //   丸ごとスキップされ「カウンターしたのにノックバックしない」が起きていた。
        parriedEnemyIds.push({ id: b.enemyId, bx: b.x, by: b.y });
      } else if (!bp.invulnerable) {
        const blastEnemyType = useGameStore.getState().enemies.find(e => e.id === b.enemyId)?.type;
        const died = useGameStore.getState().damagePlayer(b.damage, `${enemyDeathLabel(blastEnemyType ?? '')}の落下攻撃`);
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
  }
  if (parriedEnemyIds.length > 0) {
    const pnow = Date.now();
    // 通常カウンター(弾反射)と同じ演出: 「Counter!」表示＋カウンターSE＋ヒットインパクト＋コンボ。
    fx.addMeleeFinishCombo(1);
    fx.playSfx('counter');
    fx.spawnGlow(bpcx, bpcy, 95, 'rgba(56,189,248,', 360);
    fx.triggerHitImpact(COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG);
    fx.spawnRing(bpcx, bpcy, 14, 135, 'rgba(56,189,248,0.9)', 3, 360);
    fx.spawnBurst(bpcx, bpcy, '#38bdf8', 14);
    fx.spawnCallout(bpcx, bpcy - 12, 'Counter!', '#e0f2ff', { bg: 0x2563eb, holdMs: MELEE_FINISH_SLOW_HOLD_MS, duration: MELEE_FINISH_SLOW_MS });
    useGameStore.setState(st => ({
      // 弾いた直後は敵がプレイヤーに重なっている(着地)ので、通常接触ダメージで被弾しないよう
      // 短い無敵(i-frame)を付与。これで「カウンターしたのに被弾」を防ぐ。
      player: { ...st.player, invulnerable: true, invulnerableTime: pnow, lastCounterSuccessTime: pnow },
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
      const critMult = skillCritMult(bp, boss ? BOSS_CRIT_DAMAGE_MULT : CRIT_DAMAGE_MULT);
      const dmg = Math.max(1, Math.round(cBase * critMult * skillOutgoingDamageMult(bp) * (bp.equipBonus?.damageMult ?? 1)));
      const ex = e.x + e.width / 2, ey = e.y + e.height / 2;
      useGameStore.getState().damageEnemy(hit.id, dmg);
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

// ② 発火プロファイルを持つ敵の発砲(投射物追加)。ボス(裏ボス)/シーカー中の非表示等は
// 従来どおり除外。ストアから毎回フレッシュに読み直す(updateEnemiesが直前で書き換えているため)。
// now は呼び出し元が捕捉した Date.now() をそのまま渡す(この後の別コード=プロップ衝突判定でも
// 同じ now を参照しているため、ここで独自に Date.now() し直すと僅かにズレる可能性があるのを回避)。
export const applyEnemyFire = (now: number): void => {
  const liveEnemies = useGameStore.getState().enemies;
  const livePlayer = useGameStore.getState().player;
  const liveGameTime = useGameStore.getState().gameTime;
  const firedIds: string[] = [];
  const liveSummonsForFire = useGameStore.getState().summons;
  liveEnemies.forEach(enemy => {
    // 裏ボスの発砲(3連発/全方位16発)は専用コントローラが直接撃つので汎用ループからは除外。
    if (isHiddenBoss(enemy.type)) return;
    // Stunned enemies are frozen — they can't spit projectiles either.
    if (enemy.stunUntil !== undefined && liveGameTime < enemy.stunUntil) return;
    // 特殊行動中(ジャンプ/ダッシュの溜め・動作中)は発砲しない(giantbat の弾/ジャンプ/ダッシュを排他に)。
    if (enemy.aiPhase) return;
    const profile = getEnemyFireProfile(enemy);
    if (!profile) return;
    // 発砲間隔も攻撃倍速で短縮(1/MULT)=より速く撃つ。1.0で従来等速。
    if (now - enemy.lastShot < profile.interval / ENEMY_ATTACK_SPEED_MULT) return;
    // 錬金術: aggro内の通常召喚を撃つ。いなければ従来どおりプレイヤー。
    // シーカー: 半透明中は通常敵(ボス/死神/イベントボス級を除く)はプレイヤーを撃たない。
    const playerHidden = isSeekerActive(livePlayer, liveGameTime) && !isBossType(enemy.type);
    const tgt = resolveEnemyTarget(enemy, livePlayer, liveSummonsForFire, ALCHEMY_AGGRO_RANGE, playerHidden);
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
          lastCounterSuccessTime: now
        }
      }));
    } else {
      const wasVulnerable = !useGameStore.getState().player.invulnerable;
      const rnMult = redNightActive ? 2 : 1;
      // 叫喚型の強化窓中は通常敵(ボス/screamer以外)の飛び道具ダメージも×SCREAMER_BUFF_MULT。
      const scMult = (screamerBuffUntil > gameTime && proj.ownerType && proj.ownerType !== 'screamer' && !isBossType(proj.ownerType)) ? SCREAMER_BUFF_MULT : 1;
      const playerDied = useGameStore.getState().damagePlayer(proj.damage * rnMult * scMult, '敵の飛び道具', proj.x + proj.width / 2, proj.y + proj.height / 2);
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
  // "Counter!" only when a bullet was actually reflected (once per frame).
  if (reflectedAny) {
    fx.addMeleeFinishCombo(1);
    fx.playSfx('counter');
    const pcx = player.x + player.width / 2;
    const pcy = player.y + player.height / 2;
    fx.spawnGlow(pcx, pcy, 95, 'rgba(56,189,248,', tunables.counterReflectSlowMs);
    // カウンター: ストップ→(後で)揺れ+寄りズーム(社長指示)。ダンス中はストップ抜きで即時。
    fx.triggerHitImpact(COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG);
    fx.spawnRing(pcx, pcy, 14, 135, 'rgba(56,189,248,0.9)', 3, tunables.counterReflectSlowMs);
    fx.spawnBurst(pcx, pcy, '#38bdf8', 14);
    fx.spawnCallout(pcx, pcy - 12, 'Counter!', '#e0f2ff', { bg: 0x2563eb, holdMs: MELEE_FINISH_SLOW_HOLD_MS, duration: MELEE_FINISH_SLOW_MS });
  }
};

// ④ 地雷。踏むと即破壊(999ダメージ扱い)+緑の飛沫。無敵中でなければプレイヤーへ MINE_DAMAGE。
export const applyMineDamage = (fx: CombatEffects): void => {
  const currentPlayerForMine = useGameStore.getState().player;
  const mineHit = useGameStore.getState().breakableProps.find(prop =>
    prop.type === 'mine' && checkCollision(currentPlayerForMine, prop)
  );
  if (!mineHit) return;
  const broken = useGameStore.getState().damageBreakableProp(mineHit.id, 999);
  const fxX = mineHit.footX;
  const fxY = mineHit.footY - mineHit.height * 0.5;
  fx.spawnEggFluidSplash(fxX, fxY, 1.28);
  if (broken && !currentPlayerForMine.invulnerable) {
    const playerDied = useGameStore.getState().damagePlayer(MINE_DAMAGE, '地雷', fxX, fxY);
    fx.playSfx('bomb');
    fx.spawnFlash('rgba(239,68,68,0.18)', 180);
    if (playerDied) {
      fx.triggerPlayerDeath(
        currentPlayerForMine.x + currentPlayerForMine.width / 2,
        currentPlayerForMine.y + currentPlayerForMine.height / 2
      );
    }
  }
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
  const wpImmune = collPlayer;
  const wireDashingNow = Date.now() < wpImmune.wireDashUntil || !!wpImmune.wireStuckEnemyId;
  // 突進(ダッシュ)カウンター: 突進中(aiPhase==='charge')の敵にカウンター窓中で接触すると弾く
  // (無傷＋敵へのダメージ無し＋2倍ノックバックで突進中断)。ジャンプ着地と同じ「弾き」挙動。
  const counterActiveNow = Date.now() <= wpImmune.counterWindowEnd;
  const dashParried: string[] = [];

  playerEnemyCollisions.forEach(enemy => {
    if (wireDashingNow) return;
    // トール(ステージ5裏ボス)専用の攻撃実行中(chase/return以外のbossState)は、通常の接触ダメージを
    // 適用しない=各攻撃(一閃/突き/払い/ジャンプ攻撃)自身の当たり判定/カウンター処理に委ねる
    // (社長指示: 一閃・突きは「もとの当たり判定ではなくライン上のみ」)。
    if (enemy.type === 'thor' && enemy.bossState && enemy.bossState !== 'chase' && enemy.bossState !== 'return') return;
    // ジャンプ攻撃で敵が空中(aiPhase==='jump')の間はプレイヤーは被弾しない。
    // カウンター窓中ならカウンター成立=クリティカル反撃(ヘッドショット)を返す。
    if (enemy.aiPhase === 'jump') {
      if (counterActiveNow) dashParried.push(enemy.id);
      return;
    }
    // 突進(charge)/ジャンプの着地硬直(recover)/溜め(crouch)も、カウンター窓中は弾く。
    // パンプキンは空中で重なる窓が一瞬→着地直後は recover で「その場硬直(痺れ)」になり拾えなかったため、
    // recover/crouch も対象にして広い猶予で確実にノックバック+クリ反撃する。
    if ((enemy.aiPhase === 'charge' || enemy.aiPhase === 'recover' || enemy.aiPhase === 'crouch') && counterActiveNow) {
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
    const playerDied = useGameStore.getState().damagePlayer(enemy.damage * rnMelee * scMelee, enemyDeathLabel(enemy.type), enemy.x + enemy.width / 2, enemy.y + enemy.height / 2);
    if (damageWasApplied) {
      fx.playSfx('player-damage');
      fx.spawnFlash('rgba(239,68,68,0.22)', 200);
      fx.spawnBurst(
        collPlayer.x + collPlayer.width / 2,
        collPlayer.y + collPlayer.height / 2,
        '#ef4444',
        6
      );
    }
    if (playerDied) {
      fx.triggerPlayerDeath(
        collPlayer.x + collPlayer.width / 2,
        collPlayer.y + collPlayer.height / 2
      );
    }
  });
  if (dashParried.length > 0) {
    const pnow = Date.now();
    const ppx = collPlayer.x + collPlayer.width / 2, ppy = collPlayer.y + collPlayer.height / 2;
    // 通常カウンターと同じ演出: 「Counter!」表示＋カウンターSE＋ヒットインパクト＋コンボ。
    fx.addMeleeFinishCombo(1);
    fx.playSfx('counter');
    fx.spawnGlow(ppx, ppy, 95, 'rgba(56,189,248,', 360);
    fx.triggerHitImpact(COUNTER_HITSTOP_MS, COUNTER_SHAKE_MS, COUNTER_SHAKE_MAG, COUNTER_ZOOM_MAG);
    fx.spawnRing(ppx, ppy, 14, 135, 'rgba(56,189,248,0.9)', 3, 360);
    fx.spawnBurst(ppx, ppy, '#38bdf8', 14);
    fx.spawnCallout(ppx, ppy - 12, 'Counter!', '#e0f2ff', { bg: 0x2563eb, holdMs: MELEE_FINISH_SLOW_HOLD_MS, duration: MELEE_FINISH_SLOW_MS });
    useGameStore.setState(st => ({
      // 弾いた直後は突進してきた敵が重なっているので、短い無敵で次フレームの接触被弾を防ぐ。
      player: { ...st.player, invulnerable: true, invulnerableTime: pnow, lastCounterSuccessTime: pnow },
      enemies: st.enemies.map(e => {
        if (!dashParried.includes(e.id)) return e;
        const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
        // ジャンプ同様、突進中の敵はプレイヤーに重なって向きが潰れることがある。
        // 距離が小さいときは突進してきた向き(aiFrom→現在)の逆=「来た方へ弾き返す」を使う。
        let ndx = ecx - ppx, ndy = ecy - ppy;
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
          aiReadyAt: st.gameTime + 1200, // 少し間を空ける(giantbat は gbDashReadyAt 側で管理)
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
      }),
    }));
    // クリティカル反撃(ヘッドショット): aiPhase を解除済みなのでダメージが通る(ジャンプ中無敵を回避)。
    // 威力は装備中の銃ダメージ基準 × クリ倍率(通常×1.5 / ボス×5)× スキル/装備補正。
    const counterBase = getActiveGun(collPlayer)?.damage ?? 12;
    let counterKill = false;
    for (const eid of dashParried) {
      const e = useGameStore.getState().enemies.find(en => en.id === eid);
      if (!e) continue;
      const boss = isBossType(e.type);
      const critMult = skillCritMult(collPlayer, boss ? BOSS_CRIT_DAMAGE_MULT : CRIT_DAMAGE_MULT);
      const dmg = Math.max(1, Math.round(counterBase * critMult * skillOutgoingDamageMult(collPlayer) * (collPlayer.equipBonus?.damageMult ?? 1)));
      const ex = e.x + e.width / 2, ey = e.y + e.height / 2;
      counterKill = useGameStore.getState().damageEnemy(eid, dmg) || counterKill;
      fx.spawnDamageNumber(ex, e.y, dmg, true); // 金色クリ表示
      fx.spawnRing(ex, ey, 8, 46, 'rgba(253,224,71,0.95)', 3, 300);
      fx.spawnBurst(ex, ey, '#fde047', 10);
      fx.spawnGlow(ex, ey, 34, 'rgba(253,224,71,', 240);
    }
    fx.playSfx('headshot'); // ヘッドショット反撃音(Counter SE と重ねる)
    void counterKill;
  }
};
