// research/HERO_DOG.md(社長指示2026-10-15): スキル「英雄」の相棒の犬。
// 「犬が常時ついてくるようになり、近くの敵に噛みつき、敵のヘイトを取る(体力は100固定)。
//  死ぬと消えるが、10秒後に自動復活。これもHP満タン時のみ。」
// ここは純関数と定数だけ(store 非依存・テスト対象)。配線は gameStore.updateHeroDog / updateSummons。

import type { Enemy, Summon } from '../types/game';
import { isCorpse, isUntouchable, isReaperFamily, isTerminalReaper, isBodyWallBoss } from './enemyUtils';

export const HERO_DOG_HP = 100;             // 固定(レベル・強化・難易度で変えない)
export const HERO_DOG_BITE_DAMAGE = 8;      // 仮値(犬はヘイト役。実機で絞る)
export const HERO_DOG_BITE_RANGE = 44;      // 噛む間合い(錬金術召喚の接触と同じ)
export const HERO_DOG_BITE_INTERVAL_MS = 600;
export const HERO_DOG_RESPAWN_MS = 10000;   // 死んでから戻るまで(gameTime基準=ポーズ中は進まない)
export const HERO_DOG_HUNT_RANGE = 300;     // 主人からこの距離内の敵を狙う
export const HERO_DOG_LEASH = 380;          // 主人からこれより離れない(越えたら戻る)
// 「横に付く」= 主人の向きの後ろ斜め(HEEL_OFFSET)が定位置。主人が歩けば並走し、止まれば横で止まる。
export const HERO_DOG_HEEL_OFFSET_X = 48;   // 主人の向きと反対側(後ろ)へ
export const HERO_DOG_HEEL_OFFSET_Y = 14;   // 少し手前(足元側)
export const HERO_DOG_HEEL_GAP = 22;        // 定位置からこの距離内なら止まる
export const HERO_DOG_HEEL_START = 50;      // 止まっている犬が再び動き出す、定位置からの距離(不感帯=主人の1歩で向き直らない)
export const HERO_DOG_SPEED = 109;          // 最低速度(= PLAYER_BASE_SPEED(87)×1.25)。実際は主人の実効速度×1.15 まで上がる(heroDogSpeedFor)
export const HERO_DOG_SPEED_MAX = HERO_DOG_SPEED * 1.8; // 上限(スケボーには追いつかない=降りれば追いつく)
/** 犬の速度: 主人の実効移動速度(英雄・ランナー・装備込み)×1.15 と最低速度の大きい方。主人に置いて行かれない。 */
export const heroDogSpeedFor = (playerEffectiveSpeed: number | undefined): number =>
  Math.min(HERO_DOG_SPEED_MAX, Math.max(HERO_DOG_SPEED, (playerEffectiveSpeed ?? 0) * 1.15));
export const HERO_DOG_ACCEL = HERO_DOG_SPEED / 0.15; // 蹴り出しは速い(0.15秒で最高速)
export const HERO_DOG_DECEL = HERO_DOG_SPEED / 0.35; // 止まる時は滑る(0.35秒)
export const HERO_DOG_LUNGE_SPEED = HERO_DOG_SPEED * 1.6; // 噛む瞬間の跳び付き(速度の衝撃)
export const HERO_DOG_W = 30;
export const HERO_DOG_H = 22;
export const HERO_DOG_HATE_MS = 5000;       // 噛まれた雑魚・強個体が犬を追う時間(噛むたび更新)。守護霊の GHOST_MOB_HATE_MS と同じ5秒
export const HERO_DOG_LEAVE_MS = 700;       // HPが満タンでなくなって走り去る時間(薄れながら主人から離れる)
export const HERO_DOG_ENTRY_DIST = 260;     // 現れる時は主人からこの距離の外から走り込む(最寄りの敵と反対側)
export const HERO_DOG_FLINCH_PX = 26;       // 被弾でダメージ源と反対へ跳ね退く距離(体長の半分=見える量)
export const HERO_DOG_FLINCH_MS = 140;
export const HERO_DOG_DEATH_HOLD_MS = 1600; // 倒れ絵を保つ時間(雑魚の死体より早く消えない)
export const HERO_DOG_DEATH_FADE_MS = 1200; // その後薄れる時間
export const HERO_DOG_LUNGE_MS = 110;       // 跳び付きから噛みが届くまで(跳んで→噛む。噛んでから跳ばない)
// 社長指示2026-10-15「イヌが出てる時、拾うだけの犬が出ないようにして」: 英雄の犬が居る間、サブウェポン「ドッグ」の拾い物は
// 英雄の犬が走って取りに行く(拾うだけの犬=dogFetch 効果は出さない)。綱(LEASH)は無視して取りに行く。
export const HERO_DOG_FETCH_ARRIVE_PX = 26;     // 拾い物にこの距離まで寄ったら「着いた」(=回収)
export const HERO_DOG_FETCH_TIMEOUT_MS = 3000;  // 着けなくてもこの時間で回収(安全網)
export const HERO_DOG_FETCH_RETURN_MS = 400;    // 回収からCD開始までの一拍

export const isHeroDog = (s: Pick<Summon, 'kind'>): boolean => s.kind === 'hero-dog';
/** 去っている最中(HPが満タンでなくなった=走り去りながら薄れる)。噛まない・当たらない。 */
export const isHeroDogLeaving = (s: Pick<Summon, 'kind' | 'expiresAt'>): boolean =>
  s.kind === 'hero-dog' && s.expiresAt !== undefined;

export type HeroDogPresence = 'spawn' | 'leave' | 'keep' | 'none';
/**
 * 毎フレームの「居る/居ない」。
 * - 英雄が効いていて(スキル所持+HP満タン)犬が居ない → 復活待ちでなければ 'spawn'
 * - 英雄が効いていて犬が居る → 'keep'(去りかけていても呼び戻す=呼び手が expiresAt を消す)
 * - 英雄が効いていなくて犬が居る(まだ去っていない) → 'leave'
 */
export const heroDogPresence = (i: {
  heroActive: boolean; hasDog: boolean; dogLeaving: boolean; respawnAt?: number; gameTime: number;
}): HeroDogPresence => {
  if (i.heroActive) {
    if (i.hasDog) return 'keep';
    return (i.respawnAt === undefined || i.gameTime >= i.respawnAt) ? 'spawn' : 'none';
  }
  return i.hasDog && !i.dogLeaving ? 'leave' : 'none';
};

/**
 * 現れる位置: 主人から ENTRY_DIST 離れた所(最寄りの敵と反対側。敵が居なければ左)。
 * そこから主人の横へ走り込む(=出現の慣性は走り込みで付く・地面から湧かない)。
 */
export const heroDogEntryPoint = (
  playerCx: number, playerCy: number, nearestEnemy: { cx: number; cy: number } | null, playerFacing: 1 | -1 = 1,
): { cx: number; cy: number } => {
  let dx = -playerFacing, dy = 0; // 敵が居なければ主人の背中側から
  if (nearestEnemy) {
    const ex = playerCx - nearestEnemy.cx, ey = playerCy - nearestEnemy.cy;
    const d = Math.hypot(ex, ey);
    if (d > 0.001) { dx = ex / d; dy = ey / d; }
  }
  return { cx: playerCx + dx * HERO_DOG_ENTRY_DIST, cy: playerCy + dy * HERO_DOG_ENTRY_DIST * 0.6 };
};

/** 「横に付く」定位置(主人の向きの後ろ斜め)。 */
export const heroDogHeelPoint = (playerCx: number, playerCy: number, playerFacing: 1 | -1): { cx: number; cy: number } =>
  ({ cx: playerCx - playerFacing * HERO_DOG_HEEL_OFFSET_X, cy: playerCy + HERO_DOG_HEEL_OFFSET_Y });

/** 犬を作る(cx,cy=犬の中心)。見た目の参照元(reusedType)は使わない(描画は kind で分岐)。 */
export const buildHeroDog = (cx: number, cy: number, now: number): Summon => ({
  id: `hero-dog-${now}-${Math.random().toString(36).slice(2, 7)}`,
  x: cx - HERO_DOG_W / 2,
  y: cy - HERO_DOG_H / 2,
  width: HERO_DOG_W,
  height: HERO_DOG_H,
  vx: 0,
  vy: 0,
  speed: HERO_DOG_SPEED,
  health: HERO_DOG_HP,
  maxHealth: HERO_DOG_HP,
  damage: HERO_DOG_BITE_DAMAGE,
  kind: 'hero-dog',
  reusedType: 'zombie',
  level: 1,
  createdAt: now,
  lastHit: 0,
  // persistent は付けない(警察署の使役ペット判定 `summons.some(s => s.persistent)` を潰さない)。
  // 錬金術の召喚が犬を消さないのは summonAlchemy 側が kind==='hero-dog' を保持する。
});

export type HeroDogTargetLike = Pick<Enemy, 'id' | 'x' | 'y' | 'width' | 'height' | 'type' | 'health' | 'corpseUntil' | 'bossState' | 'reaperChaser'>;

/** 犬が噛める相手か(死体・昇天中・死神(終端以外)・英雄(中立)は噛まない)。 */
export const heroDogCanBite = (e: HeroDogTargetLike): boolean =>
  e.health > 0 && !isCorpse(e) && !isUntouchable(e) && !isBodyWallBoss(e.type) // 英雄(中立)=mutant-hero/mutant-liberty の両型
  && !(isReaperFamily(e.type) && !isTerminalReaper(e));

/**
 * 狙い。噛み始めた相手(preferredId)は、噛める限り・主人から HUNT_RANGE 内に居る限り変えない(粘着=標的のちらつき防止)。
 * 居なければ、主人から HUNT_RANGE 内で犬に一番近い噛める敵。
 */
export const pickHeroDogTarget = <T extends HeroDogTargetLike>(
  dogCx: number, dogCy: number, playerCx: number, playerCy: number, enemies: readonly T[], preferredId?: string,
): T | null => {
  // 取得は HUNT_RANGE(300)・手放しは LEASH(380)=境界で狙う/戻るが反転しない(ヒステリシス)。
  const inRange = (e: T, r: number) => {
    const cx = e.x + e.width / 2, cy = e.y + e.height / 2;
    return (cx - playerCx) ** 2 + (cy - playerCy) ** 2 <= r * r;
  };
  const inHunt = (e: T) => inRange(e, HERO_DOG_HUNT_RANGE);
  if (preferredId !== undefined) {
    const p = enemies.find(e => e.id === preferredId);
    if (p && heroDogCanBite(p) && inRange(p, HERO_DOG_LEASH)) return p;
  }
  let best: T | null = null;
  let bestD2 = Infinity;
  for (const e of enemies) {
    if (!heroDogCanBite(e) || !inHunt(e)) continue;
    const cx = e.x + e.width / 2, cy = e.y + e.height / 2;
    const d2 = (cx - dogCx) ** 2 + (cy - dogCy) ** 2;
    if (d2 < bestD2) { bestD2 = d2; best = e; }
  }
  return best;
};

export interface HeroDogStep { x: number; y: number; vx: number; vy: number; }
/**
 * 1フレームの移動(慣性つき)。
 * - 狙いが有れば敵の中心へ(噛める間合いの少し内側で止まる)。主人から LEASH より離れていたら狙いを捨てて戻る。
 * - 無ければ主人の横(HEEL_GAP)へ。止まっている犬は主人が HEEL_START より離れるまで動かない(不感帯)。
 * - leaving(去る)なら主人から離れる向きへ走り続ける。
 * 速度は目標速度へ寄せる: 蹴り出し HERO_DOG_ACCEL / 止まる・緩める HERO_DOG_DECEL(非対称)。木との解決は呼び手。
 */
export const stepHeroDog = (
  dog: Pick<Summon, 'x' | 'y' | 'width' | 'height' | 'vx' | 'vy' | 'speed'>,
  playerCx: number, playerCy: number,
  target: { cx: number; cy: number } | null,
  dt: number,
  leaving = false,
  // ドッグの拾い物へ走る(英雄の犬が代行)。敵の狙いより優先・綱を無視・拾い物のすぐ手前で止まる。
  fetch: { cx: number; cy: number } | null = null,
  // 主人の向き(定位置=背中側)。去る時の向き(leaveDir・単位ベクトル。未指定=主人から離れる向き)。
  playerFacing: 1 | -1 = 1,
  leaveDir: { x: number; y: number } | null = null,
): HeroDogStep => {
  const cx = dog.x + dog.width / 2, cy = dog.y + dog.height / 2;
  let vx = dog.vx ?? 0, vy = dog.vy ?? 0;
  const v0 = Math.hypot(vx, vy);
  let wantVx = 0, wantVy = 0;
  if (leaving) {
    let ax = leaveDir ? leaveDir.x : cx - playerCx, ay = leaveDir ? leaveDir.y : cy - playerCy;
    const ad = Math.hypot(ax, ay);
    if (ad < 0.001) { ax = -playerFacing; ay = 0; } else { ax /= ad; ay /= ad; }
    wantVx = ax * dog.speed; wantVy = ay * dog.speed;
  } else {
    const dPlayer = Math.hypot(playerCx - cx, playerCy - cy);
    const useFetch = fetch !== null;
    const useTarget = !useFetch && target !== null && dPlayer <= HERO_DOG_LEASH;
    const heel = heroDogHeelPoint(playerCx, playerCy, playerFacing);
    const gx = useFetch ? fetch.cx : useTarget ? target.cx : heel.cx;
    const gy = useFetch ? fetch.cy : useTarget ? target.cy : heel.cy;
    const stopped = v0 < 1;
    const stopAt = useFetch ? HERO_DOG_FETCH_ARRIVE_PX * 0.5 : useTarget ? HERO_DOG_BITE_RANGE * 0.75 : (stopped ? HERO_DOG_HEEL_START : HERO_DOG_HEEL_GAP);
    const dx = gx - cx, dy = gy - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > stopAt) {
      // 止まる手前では目標速度を落とす(到着で急停止しない)
      const slow = Math.min(1, (dist - ((useTarget || useFetch) ? stopAt : HERO_DOG_HEEL_GAP)) / 40);
      wantVx = (dx / dist) * dog.speed * slow;
      wantVy = (dy / dist) * dog.speed * slow;
    }
  }
  const wantV = Math.hypot(wantVx, wantVy);
  const rate = wantV > v0 ? HERO_DOG_ACCEL : HERO_DOG_DECEL;
  const maxDv = rate * dt;
  const ddx = wantVx - vx, ddy = wantVy - vy;
  const dd = Math.hypot(ddx, ddy);
  if (dd <= maxDv) { vx = wantVx; vy = wantVy; }
  else { vx += (ddx / dd) * maxDv; vy += (ddy / dd) * maxDv; }
  return { x: dog.x + vx * dt, y: dog.y + vy * dt, vx, vy };
};

// ---- 倒れ絵(描画専用の控え・守護霊の GhostDeathPose と同じ型) ----
// 犬の実体は死亡と同時に summons から消える(damageSummon の filter)ので、倒れた姿はここからレンダラが描く。
// 判定・挙動には一切使わない。
export interface HeroDogDeathPose {
  x: number; y: number; width: number; height: number; // 死亡フレームの矩形
  facing: 1 | -1;    // 向き(-1=左)
  fromX?: number;    // ダメージ源のx(倒れる向き=源と反対)
  atMs: number;      // 死亡時刻(Date.now)
}
let heroDogDeathPoseRec: HeroDogDeathPose | null = null;
export const heroDogDeathPose = (): HeroDogDeathPose | null => heroDogDeathPoseRec;
export const setHeroDogDeathPose = (p: HeroDogDeathPose | null): void => { heroDogDeathPoseRec = p; };
