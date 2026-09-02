// research/AI_HUMANIZE.md B2 ★未決#14(社長裁定2026-09-02=推薦(a))の実装。
//
// ## 何のためのファイルか
// 「州→その瞬間の実図形」を返す**葉モジュール**。天使7州(miguel:harai-windup/tate-windup、
// uri:sweep-windup/downslash-windup、suriel:sweep-windup/ring-spin-windup/ring-beam-windup)と
// 城ボス9州(g-stomp/g-sweep/g-slam/g-glide/g-dive/g-wing/g-trishot/g-reach/g-tailslam の各-windup)の
// 図形は、旧実装では**呼び出し側(gameStore.ts/angelBossTick.ts)のローカル閉包**でその場だけ組まれており、
// `ghostDriver`(B2再生側)から取得できなかった(gameStoreはimport不可=循環import=起動全損の既知の地雷)。
//
// ## 依存の軽い葉(store を import しない・habitEpisode.ts と同じ理由)
// gameStore.ts はこのファイルを import する側(9個の寸法定数をここから取り、再exportする)なので、
// このファイルは gameStore.ts を import しない。
//
// ## 寸法定数(★城ボス9州ぶん。手本=bountyDims.ts)
// 社長発注(#14の作り方)は「GIANT_STOMP_RADIUS / GIANT_SWEEP_HALF_WIDTH / GIANT_SLAM_HALF_WIDTH /
// GIANT_GLIDE_HALF_WIDTH / GIANT_DIVE_RADIUS / GIANT_WING_RADIUS / GIANT_TRISHOT_HALF_WIDTH /
// GLEN_REACH_HALF_WIDTH / GLEN_TAILSLAM_HALF_WIDTH」の9個。実装時に判明した追加分(§1-0「数値の複製禁止」
// を守るために不可避): 三連射(trishot)の帯は半幅だけでなく**開き角+長さ**も要るため、
// GIANT_TRISHOT_SPREAD_RAD / GIANT_TRISHOT_LENGTH も同じ理由でここへ移す(値は不変・置き場所だけの移動。
// 実装報告に明記=★未決ではなく実装上の穴埋め)。伸びる触手(g-reach)は Enemy.gReachShots に
// 発射済みの帯(fx/fy/tx/ty)がそのまま残っているため追加定数は不要(下記参照)。
import type { Enemy } from '../types/game';
import type { CounterReachShape } from './counterReach';
// 天使の寸法はangelScript.tsの可変テーブルから直接引く(葉として安全=counterReach.tsと同じ前例。
// importはdeepClone/bossTelegraphのみ=循環importの心配が無い)。
import {
  ANGEL_MIGUEL_TUNING, ANGEL_URI_TUNING, ANGEL_SURIEL_TUNING,
} from './angelScript';
const ANGEL_MIGUEL_HARAI_HALF_WIDTH = ANGEL_MIGUEL_TUNING.harai.halfWidth;
const ANGEL_URI_SWEEP_HALF_WIDTH = ANGEL_URI_TUNING.sweep.halfWidth;
const ANGEL_URI_DOWNSLASH_HALF_WIDTH = ANGEL_URI_TUNING.downslash.halfWidth;
const ANGEL_SURIEL_SWEEP_HALF_WIDTH = ANGEL_SURIEL_TUNING.sweep.halfWidth;
const ANGEL_SURIEL_RINGSPIN_RADIUS = ANGEL_SURIEL_TUNING.ringspin.radius;
const ANGEL_SURIEL_BEAM_RANGE = ANGEL_SURIEL_TUNING.beam.range;
const ANGEL_SURIEL_BEAM_HALF_WIDTH = ANGEL_SURIEL_TUNING.beam.halfWidth;

export const GIANT_STOMP_RADIUS = 130;
export const GIANT_SWEEP_HALF_WIDTH = 40;    // = THOR_HARAI_HALF_WIDTH
export const GIANT_SLAM_HALF_WIDTH = 90;
export const GIANT_GLIDE_HALF_WIDTH = 40;
export const GIANT_DIVE_RADIUS = 220;        // 地面のT5フェードイン円(実行=着弾は瞬時)
export const GIANT_WING_RADIUS = 380;
export const GIANT_TRISHOT_HALF_WIDTH = 50;
export const GIANT_TRISHOT_LENGTH = 320;
export const GIANT_TRISHOT_SPREAD_RAD = Math.PI / 5; // 左右の帯の開き角(36°)
export const GLEN_REACH_HALF_WIDTH = 28;            // 設計書どおり(半幅28)
export const GLEN_TAILSLAM_HALF_WIDTH = 46;    // 帯の半幅(尻尾の太さぶん。sweepの40より少し太い)

/** ①declared 17州(bounty/thor)・②live 16州(天使7+城ボス9)・③body-only 1州の**live 16州だけ**を
 * 対象にする(declared/body-onlyは既存 counterReachShapeFor / {kind:'body'} で足りる)。 */
export const LIVE_EPISODE_KEYS: readonly string[] = [
  'miguel:harai-windup', 'miguel:tate-windup',
  'uri:sweep-windup', 'uri:downslash-windup',
  'suriel:sweep-windup', 'suriel:ring-spin-windup', 'suriel:ring-beam-windup',
  'giantbat:g-stomp-windup', 'giantbat:g-sweep-windup', 'giantbat:g-slam-windup',
  'giantbat:g-glide-windup', 'giantbat:g-dive-windup', 'giantbat:g-wing-windup',
  'giantbat:g-trishot-windup', 'giantbat:g-reach-windup', 'giantbat:g-tailslam-windup',
];

const band1 = (fx: number, fy: number, tx: number, ty: number, halfWidth: number): CounterReachShape =>
  ({ kind: 'band', bands: [{ fx, fy, tx, ty, halfWidth }] });

/**
 * 州→その瞬間の実図形(live 16州専用)。**寸法は必ずこのファイルの定数を読む**
 * (判定側=gameStore.ts/angelBossTick.tsも同じ定数を再exportして使うので、複製ではなく単一の出どころ)。
 * 対象外の州(declared/body-only/不明)は null(呼び出し側=habitEpisode.shapeForEpisodeReplay が
 * declared/body-onlyを別に解決する)。
 *
 * `enemy` はこの技を出している本人(Enemy)。材料は全て Enemy が既に持っている値
 * (aiFromX/aiFromY/aiTargetX/aiTargetY・x/y/width/height・gStompRadius・gReachShots 等の個体値)。
 * ★記録側の呼び出しは、その tick でまだ enemy へ書き戻していないローカル更新(例: g-reach の
 * 発射済み本数)がある場合、呼び出し側が `{ ...enemy, gReachShots: shots }` のように**スナップショットを
 * 合成してから**渡すこと(gameStore.ts の呼び出し箇所を参照)。
 */
export const episodeShapeFor = (enemyType: string, state: string, enemy: Enemy): CounterReachShape | null => {
  const ecx = enemy.x + enemy.width / 2, ecy = enemy.y + enemy.height / 2;
  const key = `${enemyType}:${state}`;
  switch (key) {
    // ---- 天使(§2-8確定事項#14・今日から可能) ----
    case 'miguel:harai-windup':
    case 'miguel:tate-windup':
      // angelBossTick.ts の habitBand と同一式(MG_T.harai.halfWidthはtate-windupにも流用=旧実装どおり)。
      return band1(
        enemy.aiFromX ?? ecx, enemy.aiFromY ?? ecy, enemy.aiTargetX ?? ecx, enemy.aiTargetY ?? ecy,
        ANGEL_MIGUEL_HARAI_HALF_WIDTH,
      );
    case 'uri:sweep-windup':
      return band1(enemy.aiFromX ?? ecx, enemy.aiFromY ?? ecy, enemy.aiTargetX ?? ecx, enemy.aiTargetY ?? ecy, ANGEL_URI_SWEEP_HALF_WIDTH);
    case 'uri:downslash-windup':
      return band1(enemy.aiFromX ?? ecx, enemy.aiFromY ?? ecy, enemy.aiTargetX ?? ecx, enemy.aiTargetY ?? ecy, ANGEL_URI_DOWNSLASH_HALF_WIDTH);
    case 'suriel:sweep-windup':
      return band1(enemy.aiFromX ?? ecx, enemy.aiFromY ?? ecy, enemy.aiTargetX ?? ecx, enemy.aiTargetY ?? ecy, ANGEL_SURIEL_SWEEP_HALF_WIDTH);
    case 'suriel:ring-spin-windup':
      // 自分中心(軸退化)。中心はスリィエル本体(scx,scy=ecx,ecy)。
      return { kind: 'circle', cx: ecx, cy: ecy, radius: ANGEL_SURIEL_RINGSPIN_RADIUS };
    case 'suriel:ring-beam-windup': {
      // angelBossTick.ts の surielRingBeamBands と同一式。Phase2はring2(2本目)も列挙する(検収是正・中1)。
      const rbfx = enemy.aiFromX ?? ecx, rbfy = enemy.aiFromY ?? ecy;
      const rbtx0 = enemy.aiTargetX ?? ecx, rbty0 = enemy.aiTargetY ?? ecy;
      let rbdx = rbtx0 - rbfx, rbdy = rbty0 - rbfy;
      const rbdl = Math.hypot(rbdx, rbdy) || 1; rbdx /= rbdl; rbdy /= rbdl;
      const rbex = rbfx + rbdx * ANGEL_SURIEL_BEAM_RANGE, rbey = rbfy + rbdy * ANGEL_SURIEL_BEAM_RANGE;
      const bands = [{ fx: rbfx, fy: rbfy, tx: rbex, ty: rbey, halfWidth: ANGEL_SURIEL_BEAM_HALF_WIDTH }];
      if (enemy.ring2X !== undefined && enemy.ring2Y !== undefined) {
        let d2x = rbtx0 - enemy.ring2X, d2y = rbty0 - enemy.ring2Y;
        const dl2 = Math.hypot(d2x, d2y) || 1; d2x /= dl2; d2y /= dl2;
        const e2x = enemy.ring2X + d2x * ANGEL_SURIEL_BEAM_RANGE, e2y = enemy.ring2Y + d2y * ANGEL_SURIEL_BEAM_RANGE;
        bands.push({ fx: enemy.ring2X, fy: enemy.ring2Y, tx: e2x, ty: e2y, halfWidth: ANGEL_SURIEL_BEAM_HALF_WIDTH });
      }
      return { kind: 'band', bands };
    }

    // ---- 城ボス(#14の作り方どおり。寸法はこのファイル上の定数) ----
    case 'giantbat:g-stomp-windup':
      // 自分中心(軸退化)。半径はwindup開始時に確定したgStompRadius(未確定はフォールバック定数)。
      return { kind: 'circle', cx: ecx, cy: ecy, radius: enemy.gStompRadius ?? GIANT_STOMP_RADIUS };
    case 'giantbat:g-sweep-windup':
      return band1(enemy.aiFromX ?? ecx, enemy.aiFromY ?? ecy, enemy.aiTargetX ?? ecx, enemy.aiTargetY ?? ecy, GIANT_SWEEP_HALF_WIDTH);
    case 'giantbat:g-slam-windup':
      return band1(enemy.aiFromX ?? ecx, enemy.aiFromY ?? ecy, enemy.aiTargetX ?? ecx, enemy.aiTargetY ?? ecy, GIANT_SLAM_HALF_WIDTH);
    case 'giantbat:g-glide-windup': {
      // gameStore.ts の g-glide-windup と同一式(フォールバックは enemy.x/y=左上・+width/2ぶんは
      // フォールバックの有無に関わらず常に足す=旧実装どおり)。
      const gfx = enemy.aiFromX ?? enemy.x, gfy = enemy.aiFromY ?? enemy.y;
      const gtx = enemy.aiTargetX ?? enemy.x, gty = enemy.aiTargetY ?? enemy.y;
      return band1(
        gfx + enemy.width / 2, gfy + enemy.height / 2,
        gtx + enemy.width / 2, gty + enemy.height / 2,
        GIANT_GLIDE_HALF_WIDTH,
      );
    }
    case 'giantbat:g-dive-windup': {
      const dtx = enemy.aiTargetX ?? enemy.x, dty = enemy.aiTargetY ?? enemy.y;
      return { kind: 'circle', cx: dtx + enemy.width / 2, cy: dty + enemy.height / 2, radius: GIANT_DIVE_RADIUS };
    }
    case 'giantbat:g-wing-windup':
      // 自分中心(軸退化)。中心=溜め開始位置(aiFromX/Y。無ければ現在地)。
      return { kind: 'circle', cx: enemy.aiFromX ?? ecx, cy: enemy.aiFromY ?? ecy, radius: GIANT_WING_RADIUS };
    case 'giantbat:g-trishot-windup': {
      const tfx = enemy.aiFromX ?? ecx, tfy = enemy.aiFromY ?? ecy;
      const ttx = enemy.aiTargetX ?? ecx, tty = enemy.aiTargetY ?? ecy;
      const tdl = Math.hypot(ttx - tfx, tty - tfy) || 1;
      const tux = (ttx - tfx) / tdl, tuy = (tty - tfy) / tdl;
      const cosS = Math.cos(GIANT_TRISHOT_SPREAD_RAD), sinS = Math.sin(GIANT_TRISHOT_SPREAD_RAD);
      const leftX = tux * cosS - tuy * sinS, leftY = tux * sinS + tuy * cosS;
      const rightX = tux * cosS + tuy * sinS, rightY = -tux * sinS + tuy * cosS;
      const leftTx = tfx + leftX * GIANT_TRISHOT_LENGTH, leftTy = tfy + leftY * GIANT_TRISHOT_LENGTH;
      const rightTx = tfx + rightX * GIANT_TRISHOT_LENGTH, rightTy = tfy + rightY * GIANT_TRISHOT_LENGTH;
      return {
        kind: 'band',
        bands: [
          { fx: tfx, fy: tfy, tx: leftTx, ty: leftTy, halfWidth: GIANT_TRISHOT_HALF_WIDTH },
          { fx: tfx, fy: tfy, tx: rightTx, ty: rightTy, halfWidth: GIANT_TRISHOT_HALF_WIDTH },
        ],
      };
    }
    case 'giantbat:g-reach-windup': {
      // Enemy.gReachShots に発射済みの本数ぶん fx/fy/tx/ty が残っている(gameStore.tsのshots配列と
      // 同じデータ)ので、追加の寸法定数なしに全本を列挙できる(数値の複製が発生しない)。
      const shots = enemy.gReachShots ?? [];
      const bands = shots
        .filter((sh): sh is typeof sh & { fx: number; fy: number; tx: number; ty: number } =>
          sh.fired === true && sh.fx !== undefined && sh.fy !== undefined && sh.tx !== undefined && sh.ty !== undefined)
        .map(sh => ({ fx: sh.fx, fy: sh.fy, tx: sh.tx, ty: sh.ty, halfWidth: GLEN_REACH_HALF_WIDTH }));
      if (bands.length > 0) return { kind: 'band', bands };
      // 1本もまだ発射していない(windup立ち上がり直後)は、表示用フォールバック(aiTarget)で1本立てる
      // (gameStore.ts の rBands フォールバックと同一)。
      const rft = enemy.aiTargetX ?? ecx, rfy = enemy.aiTargetY ?? ecy;
      return { kind: 'band', bands: [{ fx: ecx, fy: ecy, tx: rft, ty: rfy, halfWidth: GLEN_REACH_HALF_WIDTH }] };
    }
    case 'giantbat:g-tailslam-windup':
      return band1(enemy.aiFromX ?? ecx, enemy.aiFromY ?? ecy, enemy.aiTargetX ?? ecx, enemy.aiTargetY ?? ecy, GLEN_TAILSLAM_HALF_WIDTH);

    default:
      return null; // declared/body-only/不明(呼び出し側=habitEpisode.tsが別に解決)
  }
};

/**
 * §2-8確定事項#7(A10): 軸(circle/bodyの差角の基準)。**band系の位置取りには使われない**
 * (habitPos の band 分岐は帯自身の fx/fy/tx/ty だけで測る=軸は無関係)ので、正確な値が要るのは
 * circle系4州(g-stomp/g-dive/g-wing/suriel:ring-spin)だけ。他は安全な既定(自分中心・退化)を返す。
 * ★g-dive だけは自分中心ではない(着地円は本体から離れた位置に出る)ため、記録側(gameStore.ts の
 * settleGiantHabit呼び出し。aiFromX/aiTargetXの明示上書きなし=settleEpisode内の生フォールバックに
 * 委ねている)と同じ式=`enemy.aiFromX ?? ecx` / `enemy.aiTargetX ?? ecx` をそのまま使う。
 */
export const episodeAxisFor = (
  enemyType: string, state: string, enemy: Enemy,
): { fromX: number; fromY: number; toX: number; toY: number } => {
  const ecx = enemy.x + enemy.width / 2, ecy = enemy.y + enemy.height / 2;
  const key = `${enemyType}:${state}`;
  if (key === 'giantbat:g-dive-windup') {
    return {
      fromX: enemy.aiFromX ?? ecx, fromY: enemy.aiFromY ?? ecy,
      toX: enemy.aiTargetX ?? ecx, toY: enemy.aiTargetY ?? ecy,
    };
  }
  // g-stomp/g-wing/suriel:ring-spin(自分中心・軸退化) + それ以外(band系=未使用)は
  // 全て「退化した軸」を返しておけば安全側(habitPosのangleDiffOverPiが0を返す=posB=0)。
  return { fromX: ecx, fromY: ecy, toX: ecx, toY: ecy };
};
