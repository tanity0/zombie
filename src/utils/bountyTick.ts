// PACING_PUZZLE.md §6.38「BOUNTY」B1(+B1.5修正バッチ): 賞金首(バス停/馬乗り/鋏/舞妓・変異)の
// コントローラ骨格。idolTick.ts を手本にした純関数群+専用コントローラ(useGameLoop.ts から
// 天使コントローラと同位置で呼ぶ)。B1では技を持たない(dormant→chase追跡+リーシュ+帰巣+滞在1分のみ)。
// 技はB2でbossState機構へ追加する。
//
// レンダラ非依存・store書き込みはidolTick/angelBossTickと同じ「stateを読んでpatchをsetState」流儀。
// 掟(CLAUDE.md「Y方向に何かを動かす時の必須チェック」): 移動は必ず①障害物衝突(resolveBountyMove・
// B1.5-4)→②clampRectToPlayableAreaの順で通す。気絶・拘束・浮き・ノックバック中は移動も状態進行も
// 一切止める(isFrozen・B1.5-2・idolTick.ts:228/236と同型のガード)。
import type { Enemy } from '../types/game';
import { useGameStore, HUNTER_LEAVE_FADE_MS, resolveBountyMove } from '../store/gameStore';
import { clampRectToPlayableArea, type PlayableAreaCtx } from '../world/playableArea';
import { isBountyType, AREA_BASE_DIFFICULTY } from './enemyUtils';
import { effectiveDifficultyArea, lerpAreaTable } from './timeDifficulty';
import { EVENT_BANNER_MS } from './directorTick';
import {
  bossLeashDistancePx, advanceBossDisengageGrace,
  BOSS_LEASH_REGEN_PER_SEC, BOSS_LEASH_RETURN_SPEED_MULT,
} from './bossEngagement';

/**
 * §3「HP: 基準2000(叩き台)×スポーン時の実効難易度倍率」。CONSTANT_STRENGTH_TYPES(=fixed)なので
 * buildEnemy自体は倍率を掛けない(色/距離/時間で自動スケールしない型のため)。ここでスポーン後パッチ
 * として明示的に計算する(AREA_BASE_DIFFICULTYは他の通常敵と同じ表=値の出どころを1つに保つ)。
 */
export const BOUNTY_BASE_HP = 2000;
export const bountyMaxHealth = (area: number, gameTimeMs: number): number =>
  Math.round(BOUNTY_BASE_HP * lerpAreaTable(AREA_BASE_DIFFICULTY, effectiveDifficultyArea(area, gameTimeMs)));

/** 滞在1分(§2)。dormantのまま(=交戦していない)これだけ経つと退場する。gameTime基準(ポーズで進まない)。 */
export const BOUNTY_LINGER_MS = 60000;
/** 交戦の定義(v6 B「純関数化」)のうち「直近○秒以内に被弾」の窓。壁時計(enemy.lastHit=Date.now()基準)。 */
export const BOUNTY_HIT_ENGAGE_MS = 3000;
/** 起床演出(holo-circle 1周)の長さ。v2 C裁定の「約700ms」。 */
export const BOUNTY_WAKE_FX_MS = 700;
/** §6.38 B1.5-7: 手写しをやめEVENT_BANNER_MS(directorTick.ts)を直接参照する(値の出どころを1つに保つ)。
 * B1.5-5: 出現バナー「賞金首出現」はスポーン時(useGameLoop.ts)へ移設=ここでは退場バナーだけが使う。 */
export const BOUNTY_DEPART_BANNER_MS = EVENT_BANNER_MS;
/** 退場フェード+「賞金首は去った」通知の長さ。ハンター立ち去りの既存値を流用(値の出どころを1つに保つ)。 */
export const BOUNTY_DEPART_FADE_MS = HUNTER_LEAVE_FADE_MS;
/** dormant起床の索敵範囲の既定値(叩き台)。= useGameLoop.ts の GIANT_AGGRO_RANGE(380)を流用(§2)。
 * スポーン側が `aggroRange` を明示設定する前提で、ここは未設定時のみのフォールバック。 */
export const BOUNTY_AGGRO_RANGE_DEFAULT = 380;
/** 帰巣「到達した」とみなす残距離(px)。giantbatの帰巣スナップ閾値(gameStore.ts)と同値。 */
const ARRIVE_EPS_PX = 2;

/**
 * 「交戦中」かどうか(§2「dormant=false かつ(距離<リーシュ半径 or 直近3秒以内に被弾)」・純関数)。
 * 距離コンポーネントはリーシュ半径そのもの(bossLeashDistancePx)——ズーム換算しない実距離固定
 * (bossEngagement.tsの裁定をそのまま踏襲。専用の別半径を発明しない)。
 */
export interface BountyEngagedSignals { dormant: boolean; distance: number; msSinceHit: number }
export const bountyEngagedNow = (sig: BountyEngagedSignals, leashRadiusPx: number): boolean =>
  !sig.dormant && (sig.distance < leashRadiusPx || sig.msSinceHit <= BOUNTY_HIT_ENGAGE_MS);

/**
 * 滞在1分が満了したか(gameTime基準)。`lastEngagedAt` 未設定ならスポーン時刻(`spawnedAt`)を起点にする
 * (一度も交戦しないまま1分経てば去る=§2の「1分で会わずにいると去る」)。
 */
export const bountyLingerExpired = (
  gameTime: number, lastEngagedAt: number | undefined, spawnedAt: number | undefined,
): boolean => gameTime - (lastEngagedAt ?? spawnedAt ?? gameTime) >= BOUNTY_LINGER_MS;

/**
 * いま制御すべき賞金首1体を選ぶ(pickActiveIdolと同じ作法)。起きている個体を最優先し、
 * 休眠しかいなければ先頭の1体を返す(通常運用は同時1体なので実質どちらか一方しか居ない)。
 */
export const pickActiveBounty = (enemies: readonly Enemy[]): Enemy | undefined => {
  let dormantOne: Enemy | undefined;
  for (const e of enemies) {
    if (!isBountyType(e.type)) continue;
    if (!e.dormant) return e;
    dormantOne ??= e;
  }
  return dormantOne;
};

const applyPatch = (id: string, patch: Partial<Enemy>): void => {
  if (Object.keys(patch).length === 0) return;
  useGameStore.setState(stt => ({ enemies: stt.enemies.map(e => (e.id === id ? { ...e, ...patch } : e)) }));
};

/**
 * 希望移動量(nx,ny)を「実際に立てる場所」へ解決する。§6.38 B1.5-4(重要・致命級ではないが必須):
 * ①障害物衝突(木/建物/城/街プロップ/病院/武器庫/警察署=resolveBountyMove。城ボスと同じ「当たる」側。
 *   判定はstore側=CLAUDE.md「判定はworld/store側に置く」掟) → ②行ける帯クランプ
 *   (clampRectToPlayableArea・CLAUDE.md「Y方向に何かを動かす時の必須チェック」)、の順で通す。
 */
const resolveMove = (nx: number, ny: number, e: Enemy): { x: number; y: number } => {
  const collided = resolveBountyMove(nx, ny, { width: e.width, height: e.height });
  const st0 = useGameStore.getState();
  const ctx: PlayableAreaCtx = {
    farBackdrop: st0.farBackdrop,
    labTheme: st0.stageTheme === 'lab' && !st0.indoorMode,
    corridorMode: st0.corridorMode,
    m0AdvanceLimitX: st0.m0AdvanceLimitX,
    corridorRunInActive: st0.corridorRunInActive,
  };
  return clampRectToPlayableArea(collided.x, collided.y, e.width, e.height, ctx);
};

/**
 * 気絶・拘束・浮き・ノックバックのいずれかが有効か(§6.38 B1.5-2・致命)。
 * idolTick.ts:228/236の教訓(v0.25.2895)と同型のガード——他の全ボス(裏ボス/天使/idol)は
 * このいずれかの間、移動・状態進行を止めている。bountyTickだけこれを持たず「紫にしても歩き続ける」
 * 実バグになっていた。**体勢崩し→フィニッシュの正規ルート**が通るために必須。
 * bossFullStunUntil/stunUntil/rootUntilはgameTime基準、liftUntil/knockbackUntilはDate.now基準
 * (types/game.tsの既存注記+gameStore.tsの設定箇所に倣う)。
 */
const isFrozen = (bounty: Enemy, newGameTime: number, nowMs: number): boolean =>
  (bounty.bossFullStunUntil !== undefined && newGameTime < bounty.bossFullStunUntil)
  || (bounty.stunUntil !== undefined && newGameTime < bounty.stunUntil)
  || (bounty.rootUntil !== undefined && newGameTime < bounty.rootUntil)
  || (bounty.liftUntil !== undefined && nowMs < bounty.liftUntil)
  || (bounty.knockbackUntil !== undefined && nowMs < bounty.knockbackUntil);

/**
 * 賞金首1体を1tick進める。B1の状態は3つだけ: 休眠(dormant)/追跡(chase)/帰巣(リーシュ発火後)。
 * 技(bossState技)はB2で追加するため、ここでは`bounty-wake`(起床演出)以外のbossStateは書かない。
 * §6.38 B1.5-5: 出現告知(triggerAttention+バナー「賞金首出現」+SE)はスポーン時(呼び出し側=
 * useGameLoop.ts)へ移設した。ここで残すのは**起床演出(holo-circle)の起点**のみ(見た目だけの合図)。
 */
export const runBountyTick = (
  bounty: Enemy,
  newGameTime: number,
  deltaTime: number,
  moveSpeedMult: number,
  nowMs: number,
): void => {
  const player = useGameStore.getState().player;
  const pcx = player.x + player.width / 2, pcy = player.y + player.height / 2;
  const bcx = bounty.x + bounty.width / 2, bcy = bounty.y + bounty.height / 2;
  const dist = Math.hypot(pcx - bcx, pcy - bcy);
  const patch: Partial<Enemy> = {};

  if (bounty.dormant) {
    const ar = bounty.aggroRange ?? BOUNTY_AGGRO_RANGE_DEFAULT;
    if (dist <= ar) {
      // 起床(§2「dormant→交戦」): holo-circleの起点だけ立てる(実際の見た目=pixiSceneが
      // bossState==='bounty-wake'を読んで描く。判定はテスト対象外=描画側の掟どおり)。
      patch.dormant = false;
      patch.bossState = 'bounty-wake';
      patch.bossStateUntil = newGameTime + BOUNTY_WAKE_FX_MS;
      patch.bountyLastEngagedAt = newGameTime;
      patch.bountyDepartAt = undefined;
      applyPatch(bounty.id, patch);
      return;
    }
    // dormantのまま=滞在タイマー判定(交戦していない=毎フレーム経過する)。
    if (bounty.bountyDepartAt === undefined) {
      if (bountyLingerExpired(newGameTime, bounty.bountyLastEngagedAt, bounty.spawnedAt)) {
        patch.bountyDepartAt = newGameTime;
        useGameStore.setState({ eventBannerText: '賞金首は去った', eventBannerUntil: newGameTime + BOUNTY_DEPART_BANNER_MS });
      }
    } else if (newGameTime - bounty.bountyDepartAt >= BOUNTY_DEPART_FADE_MS) {
      // フェード完了=消滅(描画側はbountyDepartAtからの経過でαを落とす)。
      useGameStore.setState(stt => ({ enemies: stt.enemies.filter(e => e.id !== bounty.id) }));
      return;
    }
    applyPatch(bounty.id, patch);
    return;
  }

  // ---- 気絶・拘束・浮き・ノックバックのガード(B1.5-2・致命) ------------------------------------
  // 座標もbossStateも一切書かない(カウンターのノックバック座標を上書きしない)。交戦中とみなして
  // 滞在タイマーだけ更新する(戦っている最中に消えない=既存の「戦闘中リセット」と同じ扱い)。
  if (isFrozen(bounty, newGameTime, nowMs)) {
    applyPatch(bounty.id, { bountyLastEngagedAt: newGameTime });
    return;
  }

  // ---- 起きている: bounty-wake演出の終了 ----------------------------------------------------
  if (bounty.bossState === 'bounty-wake' && newGameTime >= (bounty.bossStateUntil ?? 0)) {
    patch.bossState = undefined;
    patch.bossStateUntil = undefined;
  }

  // ---- 交戦判定+リーシュ(§2/v6 A-3・B-4) ---------------------------------------------------
  const leashRadius = bossLeashDistancePx(bounty.type, false);
  const engaged = bountyEngagedNow({ dormant: false, distance: dist, msSinceHit: nowMs - bounty.lastHit }, leashRadius);
  if (engaged) {
    patch.bountyLastEngagedAt = newGameTime; // 交戦中は毎フレームリセット(§2)
    if (bounty.bossLeashSince !== undefined) patch.bossLeashSince = undefined;
  }

  if (!engaged) {
    // v6 A-3: bossStateが技実行中(=bounty-wake以外の何か)なら待機化を満了まで延期。
    // B1には技が無いので常にfalse(=このフレームは何もしない)——B2で技を足した時に効く条件として先置き。
    const midMove = bounty.bossState !== undefined && bounty.bossState !== 'bounty-wake';
    const grace = advanceBossDisengageGrace(true, bounty.bossLeashSince, newGameTime);
    if (grace.since !== bounty.bossLeashSince) patch.bossLeashSince = grace.since;
    if (grace.ready && !midMove) {
      // 帰巣: 巣(homeX/homeY)へゆっくり歩いて戻りつつ回復(giantbatのリーシュと同じ土管)。
      const hx = bounty.homeX, hy = bounty.homeY;
      if (hx !== undefined && hy !== undefined) {
        const dhx = hx - bounty.x, dhy = hy - bounty.y;
        const dl = Math.hypot(dhx, dhy);
        let nx = bounty.x, ny = bounty.y;
        if (dl > ARRIVE_EPS_PX) {
          const mv = Math.min(bounty.speed * BOSS_LEASH_RETURN_SPEED_MULT * deltaTime * moveSpeedMult, dl);
          nx = bounty.x + (dhx / dl) * mv;
          ny = bounty.y + (dhy / dl) * mv;
        } else {
          nx = hx; ny = hy;
        }
        const clamped = resolveMove(nx, ny, bounty);
        patch.x = clamped.x; patch.y = clamped.y; patch.vx = 0; patch.vy = 0;
        patch.health = Math.min(bounty.maxHealth, bounty.health + BOSS_LEASH_REGEN_PER_SEC * deltaTime);
        const arrivedNow = Math.hypot(hx - clamped.x, hy - clamped.y) <= ARRIVE_EPS_PX;
        if (arrivedNow) {
          patch.dormant = true;
          patch.bountyLastEngagedAt = newGameTime; // 新しい1分(§2「接敵が切れて巣に戻ったら新しい1分」)
          patch.bountyDepartAt = undefined;
          patch.bossLeashSince = undefined;
        }
      } else {
        // homeX/homeYが未設定(スポーン側の不備・防御的フォールバック): 現在地をそのまま巣として即帰巣扱い。
        patch.dormant = true;
        patch.bountyLastEngagedAt = newGameTime;
        patch.bossLeashSince = undefined;
      }
      applyPatch(bounty.id, patch);
      return;
    }
  }

  // ---- 追跡(chase): プレイヤーへ直進。B1に技は無いのでこれが唯一の移動語彙。 --------------------
  if (dist > 1) {
    const ux = (pcx - bcx) / dist, uy = (pcy - bcy) / dist;
    const spd = bounty.speed * deltaTime * moveSpeedMult;
    const clamped = resolveMove(bounty.x + ux * spd, bounty.y + uy * spd, bounty);
    patch.x = clamped.x; patch.y = clamped.y; patch.vx = ux * bounty.speed; patch.vy = uy * bounty.speed;
  }

  applyPatch(bounty.id, patch);
};

// ---------------------------------------------------------------------------------------------
// 抑止ゲート(§2「出さない条件」・v6 F裁定)。B1では**用意してテストするだけ**——実際の producer
// (eventGateOkへの相乗り)配線はB4(社長発注)。デバッグ出現(`?bountynow=1`)はこのゲートを経由しない
// (「デバッグのみ」なので意図的にバイパス=検証を止めない)。
// ---------------------------------------------------------------------------------------------
export interface BountySpawnBlockInput {
  bossFightNow: boolean;   // ボス戦中(施設ロックと同じ土管)
  activeEvent: boolean;    // 囲い/救助等のイベント中
  hiddenBossAlive: boolean; // 裏ボス(mimir等)存命中
  redNightActive: boolean; // 紅き夜中
  area: number;            // 憲法第4条: 初心者ゾーン(エリア0-1)では出さない
  storyBossOnly: boolean;  // storyBossOnlyステージ(ストーリー専用進行)
  labTheme: boolean;       // 研究所スキン(v6 B-5)
  corridorMode: boolean;   // 廊下モード(v6 B-5)
  tutorialStage: boolean;  // チュートリアル(farBackdrop==='tutorial')
}
export const bountySpawnBlocked = (input: BountySpawnBlockInput): boolean =>
  input.bossFightNow || input.activeEvent || input.hiddenBossAlive || input.redNightActive
  || input.area <= 1 || input.storyBossOnly || input.labTheme || input.corridorMode || input.tutorialStage;
