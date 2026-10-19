// ステージ2(屋外ラボ廊下)の「這う塊」(社長指示2026-10-19「ステージ2の敵追加。アイドルがいる側の入り口に
// スタンバイ。通路を遮る様に配置しており、ゆっくり追いかけてくる。画面外でも追いかける。すごくゆっくり」
// +追加「この敵は、通常の敵も攻撃します。10体取り込むと、昇天して消えます。(アテンションは無し)
// プレイヤーはすり抜けられず、手で押しつぶされると大きく吹っ飛ばされます。ダメージは大きめ。即死では無い」)。
//
// **敵(Enemy)ではない**独立したワールドの存在。倒せないものを敵配列に入れると、自動照準・誘導・近接・ドロップ・
// 撃破集計・湧き上限などに全部巻き込まれるため。弾・近接・爆発は素通りする(ここには当たらない)。
// 塊が壁になるのはプレイヤーだけ(雑魚は塊をすり抜けてよい)。
// ★通路の塞ぎ方(社長決定2026-10-19「bで、ただし上下にも移動する」): 当たり判定は廊下(帯±200)を大きく塞ぐ奥行き300の箱。
//   見たまま=当たる範囲にするため、塊は**1体を大きく**描く(社長「これ一体で、でかくしてほしい。5倍くらい」)。
//   絵の胴の幅=元の1体(165)の5倍、当たり判定の幅=その0.9倍。絵の足元=箱の下辺、絵の背丈(約290)≈箱の奥行き(300)。
//   塊の y はプレイヤーの y を追う(上下は速め・慣性つき)=フェイントで逆側の隙間へ回り込めば抜けられる。
//   ★壁・プロップは塊を止めない(肉が床を這って乗り越える)。奥行き300の箱は帯の中の壁の列(|y|≈24〜78)を必ず跨ぐので、
//   止めると一歩も進めなくなるため。プレイヤーを押す時の行き先の確認には壁・プロップを使う(挟み込まない)。
//
// ここは判定と状態機械だけを持つ純関数(renderer-agnostic・PixiJS非依存・store非依存)。
// 配線(store/敵配列/被ダメージの経路)は `utils/labCrawlerTick.ts`、絵は `pixi/pixiScene.ts`。
import { footRect, rectsOverlap, resolveAabb, segmentBlocked, type Rect } from './obstacles';
import { LAB_VISION_RANGE } from '../utils/labStealth'; // 研究所の休眠敵と同じ視界(新しい数値を作らない)
import { clampRectToPlayableArea, isRectInPlayableArea, type PlayableAreaCtx } from './playableArea';

// ---- 寸法・速さ ------------------------------------------------------------------------------
/** 出現位置: スタート(原点)からアイドルの方へこの距離。 */
export const CRAWLER_START_DIST_PX = 600;
/** 絵の胴の表示幅(px)。元の1体(165)の5倍(社長「5倍くらい」)。 */
export const CRAWLER_ART_BODY_DISPLAY_W = 165 * 5;
/** 当たり判定の幅(足元基準の箱)=描いた胴の幅の0.9倍(胴の両端の腕・管の先は通り抜ける程度)。 */
export const CRAWLER_HIT_W = Math.round(CRAWLER_ART_BODY_DISPLAY_W * 0.9);
/**
 * 当たり判定の奥行き(足元から上へ)。帯(±200=幅400)を大きく塞ぎ、塊が帯の真ん中にいる時に上下それぞれ約50の隙間を残す
 * (社長決定2026-10-19)。描画はこの箱と同じ広がりの肉の溜まりを床に敷く=見たまま当たる。
 */
export const CRAWLER_HIT_H = 300;
/** 本体の絵の胴の幅 ÷ 判定の幅(描画が使う)。 */
export const CRAWLER_ART_W_PER_HIT_W = CRAWLER_ART_BODY_DISPLAY_W / CRAWLER_HIT_W;
/**
 * 本体の絵の足元: 箱の下辺(=足元 y)からこれだけ奥。0=絵の下端が箱の下辺。絵の背丈(130画素×倍率2.23≈290)が箱の奥行き300と
 * ほぼ同じなので、絵の上端≈箱の上辺(差約10px)。
 */
export const CRAWLER_BODY_FOOT_UP_PX = 0;
/**
 * 起きる進み具合(社長指示2026-10-19「順路を20%くらい進む(資料がゴールとした時に)と、動き始めます。その時アテンションイベント」)。
 * 順路=スタート(原点)→ゴール資料の廊下の1本道。資料の向きへ進んだx距離 ÷ 資料までのx距離 がこの値以上で起きる。一度起きたら戻らない。
 */
export const CRAWLER_WAKE_PROGRESS = 0.2;
/** 横の最高速度(px/秒)。プレイヤー約104・ゾンビ42 に対して「すごくゆっくり」。 */
export const CRAWLER_MAX_SPEED = 18;
/** 近くに居る時の突進(社長2026-10-19「近くにいるとすごいスピードでおいかけてきて」)。箱の縁からプレイヤーまでこの距離以内で、横の最高速度が RUSH まで上がる(プレイヤーの素の速さより速い)。 */
export const CRAWLER_RUSH_RANGE_PX = 320;
export const CRAWLER_RUSH_SPEED = 135;
/** 突進の時の加減速の時定数(秒)。遠い時より速く寄る。 */
export const CRAWLER_RUSH_TAU_S = 0.35;
/** 縦の最高速度(px/秒)。プレイヤーの y を追う(社長決定「上下にも移動する」・約70)。 */
export const CRAWLER_MAX_SPEED_Y = 70;
/** 縦の追い方: 高さの差(px)×これ を目標の縦速度にする(最高 CRAWLER_MAX_SPEED_Y)。差が詰まるほどゆっくり寄る。 */
export const CRAWLER_Y_GAIN = 1.6;
/** 横の速度を目標へ寄せる時定数(秒)=慣性。走り出し・止まりがこの尺で滑らかになる。 */
export const CRAWLER_ACCEL_TAU_S = 0.8;
/** 縦の時定数(秒)。横より短いが、フェイントで逆側へ回り込める程度に遅れる。 */
export const CRAWLER_ACCEL_TAU_Y_S = 0.5;
/** 向きを変えるのは、プレイヤーが中心からこれ以上反対側へ出た時だけ(その場でパタパタしない)。 */
export const CRAWLER_FACE_HYST_PX = 24;

// ---- 攻撃(手で押しつぶす) -------------------------------------------------------------------
/**
 * 叩きつける円の中心 = 塊の中心から、向いている方へこの距離(縦は手のひらが地面に着く高さ=箱の下辺から CRAWLER_SLAM_HAND_UP_PX)。
 * 攻撃シート(6688×130)の手が地面に着くコマ7〜8で、土埃の出る手のひらは胴の中心から前へ約97〜159画素
 * (中心≈125画素)=表示で約280px。円はそこを中心に置く。
 */
export const CRAWLER_SLAM_FWD_PX = 280;
/** 手のひらが地面に着く高さ: 絵の下端(=箱の下辺)から約15画素=表示で約33px奥。 */
export const CRAWLER_SLAM_HAND_UP_PX = 33;
/**
 * 叩きつける円の半径(=赤い予告の半径=判定)。手のひらが地面に着く範囲(土埃の広がり±55画素)と、伸ばした爪の先(胴の中心から
 * 約195画素=表示約435px)までを含む。箱の横に接して立つプレイヤーには、箱の中ほどの高さまで当たる。
 */
export const CRAWLER_SLAM_RADIUS = 230; // 155→230(社長2026-10-19「攻撃範囲もっと広く」)
/** 歩きシートのコマ数(lab-crawler-walk.png 4800×130・1コマ400px)。 */
export const CRAWLER_WALK_FRAMES = 12;
/** 攻撃シートのコマ数(lab-crawler-attack.png 6688×130・1コマ418px)。 */
export const CRAWLER_ATTACK_FRAMES = 16;
/** 手が地面に着くコマ(0始まり)。最初の土埃が出るコマ(新しい攻撃シートでも同じ7=実測)。ここ=当たる瞬間。 */
export const CRAWLER_ATTACK_IMPACT_FRAME = 7;
/** 溜め(振り上げ)= コマ0〜6 の7コマぶん。巨体らしく遅め。 */
export const CRAWLER_WINDUP_MS = 620; // 980→620(社長2026-10-19「攻撃もっと早めて」)。コマの比(CRAWLER_WINDUP_FRAME_MS)で割り付ける
/** 戻り = コマ7〜15 の9コマぶん(叩きつけ・土埃が舞って収まるまで)。 */
export const CRAWLER_RECOVER_MS = 600; // 900→600(同上)
/** 次の攻撃までの間(戻りが終わってから)。 */
export const CRAWLER_COOLDOWN_MS = 1200; // 2500→1200(同上)
/**
 * 叩きつけのダメージ(プレイヤー)。「大きめ・即死ではない」。基準HP120の1/3。
 * 比較: ステージ2で一番重い一撃=研究所の大型(lab-zombie-3)の跳び36・アイドルの拳/狙撃30、
 * 英雄の跳び28・パンプキン16。これらより一段上。即死させる仕組みは持たない(通常の被ダメージ)。
 */
export const CRAWLER_SLAM_DAMAGE = 40; // 旧・固定値(参照用)。実際はプレイヤーの最大体力 × CRAWLER_SLAM_DAMAGE_FRAC
/** 叩きつけのダメージ=プレイヤーの最大体力の50%(社長2026-10-19「二発喰らうと死ぬ(つまり50%)」)。1発では倒れない(満タンから)。 */
export const CRAWLER_SLAM_DAMAGE_FRAC = 0.5;
export const crawlerSlamDamage = (playerMaxHealth: number): number => Math.max(1, Math.ceil(Math.max(1, playerMaxHealth) * CRAWLER_SLAM_DAMAGE_FRAC));
/** 叩きつけの吹き飛び(距離px・尺ms)。既存最大(英雄の突き260px)・重い被弾の段(約200px)より大きい。 */
export const CRAWLER_SLAM_KB = { distPx: 300, ms: 520 } as const;
/** この数だけ取り込むと昇天する。 */
export const CRAWLER_ABSORB_TO_ASCEND = 10;
/**
 * 取り込まれた敵の絵の尺(判定なし)。当たった瞬間に手の下で潰れ(CRAWLER_ABSORB_CRUSH_MS)、戻りの手に合わせて
 * 引きずり込まれ(残り約900ms)、塊の縁の下へ沈んで隠れる。
 */
export const CRAWLER_ABSORB_CRUSH_MS = 160;
export const CRAWLER_ABSORB_MS = CRAWLER_ABSORB_CRUSH_MS + 900;
/** 昇天(崩れて床へ沈み、取り込んだ数だけの光が1つずつ昇って消える)の尺。この間は判定なし(通れる・攻撃しない)。 */
export const CRAWLER_ASCEND_MS = 2900; // 最後(10番目)の光が昇り切る 450+9×140+1050=2770 より少し長く
/**
 * 絵の縮尺の基準=各シートの「1コマの胴の実測幅」(不透明画素の外接幅のコマ平均・シートの画素)。
 * 表示幅(CRAWLER_HIT_W×CRAWLER_ART_W_PER_HIT_W)÷これ がそのシートの倍率=どちらのシートも画面で同じ大きさに見える。
 * ★素材を差し替えたら測り直す。
 *   歩き: lab-crawler-walk.png 4800×130・12コマ×400(2026-10-19差し替え・胴の外接幅の平均370・山の高さ約112。旧2576×70は197)。
 *   攻撃: lab-crawler-attack.png 6688×130・16コマ×418(2026-10-19差し替え・山の高さ約107〜117=歩きと同じ画素の細かさ)。
 *     外接幅(約392)は振り上げた腕と土埃を含むので使わず、山の高さが揃うことから**歩きと同じ倍率**にする(370)。
 *     旧2576×50は151。
 */
export const CRAWLER_WALK_ART_BODY_W = 370;
export const CRAWLER_ATTACK_ART_BODY_W = 370;
/**
 * 歩きシートの中のランタン(目覚めると灯る)の位置。コマの下端中央からのずれ(シートの画素・素材は左向き)。
 * コマ0で実測(歩くとコマごとに数px揺れるが、灯りは柔らかい光なので1組で足りる)。★素材を差し替えたら測り直す。
 */
export const CRAWLER_LANTERNS_WALK_ART: readonly { x: number; y: number }[] = [
  { x: 26, y: -86 }, { x: 7, y: -69 }, { x: 21, y: -44 }, { x: 35, y: -38 },
];

export type LabCrawlerState = 'move' | 'windup' | 'recover' | 'ascend';

/** 取り込まれて吸い寄せられている最中の敵(絵だけ・判定なし)。 */
export interface CrawlerAbsorbing {
  id: string; type: string;
  /** 取り込まれた瞬間の足元(中心x・足y)と判定の寸法。 */
  x: number; y: number; w: number; h: number;
  at: number; // gameTime
}

export interface LabCrawler {
  /** 起きているか。起きるまでは動かない・攻撃しない(壁としてはプレイヤーを通さない)。 */
  awake: boolean;
  /** ゴール資料のx(起きる条件の順路の終点)。 */
  goalX: number;
  /** 足元(箱の下辺の中心)。 */
  x: number; y: number;
  vx: number; vy: number;
  facingLeft: boolean;
  state: LabCrawlerState;
  /** 今の状態に入った時刻(gameTime)。 */
  stateAt: number;
  /** 溜め中: 当たる時刻(=溜めの終わり)。 */
  hitAt: number;
  /** 溜め開始の時点で地面に固定した叩きつけの円(後から追わない)。 */
  slamX: number; slamY: number;
  /** この時刻以降に次の攻撃を始めてよい。 */
  nextAttackAt: number;
  absorbed: number;
  absorbing: CrawlerAbsorbing[];
  /** プレイヤーに押し止められて前へ進めていない(描画が「もがく」コマ送りに使う・判定には使わない)。 */
  pressing: boolean;
}

/** 塊の当たり判定(足元基準)。 */
export const crawlerRect = (c: Pick<LabCrawler, 'x' | 'y'>): Rect => footRect(c.x, c.y, CRAWLER_HIT_W, CRAWLER_HIT_H);
/** 箱の中心。 */
export const crawlerCenter = (c: Pick<LabCrawler, 'x' | 'y'>): { x: number; y: number } => ({ x: c.x, y: c.y - CRAWLER_HIT_H / 2 });
/** 箱の縁からプレイヤーの箱までの隙間(重なっていれば0)。 */
export const crawlerGapToPlayer = (c: Pick<LabCrawler, 'x' | 'y'>, p: Rect): number => {
  const r = crawlerRect(c);
  const gx = Math.max(0, r.x - (p.x + p.width), p.x - (r.x + r.width));
  const gy = Math.max(0, r.y - (p.y + p.height), p.y - (r.y + r.height));
  return Math.hypot(gx, gy);
};
/** 突進中か(プレイヤーが箱の縁から CRAWLER_RUSH_RANGE_PX 以内)。 */
export const crawlerRushing = (c: Pick<LabCrawler, 'x' | 'y'>, p: Rect): boolean => crawlerGapToPlayer(c, p) <= CRAWLER_RUSH_RANGE_PX;
/** 本体の絵の足元(肉の溜まりの上・箱の中心より少し奥)。 */
export const crawlerBodyFoot = (c: Pick<LabCrawler, 'x' | 'y'>): { x: number; y: number } => ({ x: c.x, y: c.y - CRAWLER_BODY_FOOT_UP_PX });
/** 今の向きで叩きつけたら円がどこへ落ちるか(絵の手のひらが地面に着く所)。 */
export const crawlerSlamCenter = (c: Pick<LabCrawler, 'x' | 'y' | 'facingLeft'>): { x: number; y: number } =>
  ({ x: c.x + (c.facingLeft ? -1 : 1) * CRAWLER_SLAM_FWD_PX, y: c.y - CRAWLER_SLAM_HAND_UP_PX });
/** 昇天中は判定が無い(通れる・攻撃しない)。 */
export const crawlerSolid = (c: Pick<LabCrawler, 'state'>): boolean => c.state !== 'ascend';

/**
 * プレイヤーが順路(原点→ゴール資料)をどこまで進んだか(0〜)。x方向だけを見る(廊下の1本道)。資料と逆へ進むと負。
 */
export const crawlerRouteProgress = (playerCx: number, goalX: number): number =>
  Math.abs(goalX) < 1e-6 ? 0 : playerCx / goalX;
/** 起きる条件①(順路の CRAWLER_WAKE_PROGRESS 以上)。 */
export const crawlerShouldWake = (playerCx: number, goalX: number): boolean =>
  crawlerRouteProgress(playerCx, goalX) >= CRAWLER_WAKE_PROGRESS;
/**
 * 起きる条件②(社長指示2026-10-19「近寄っても目覚める」): プレイヤーが近づいた。研究所の休眠敵と同じ視界(LAB_VISION_RANGE)。
 * 距離は**塊の箱の縁から**測る(箱が大きいので、中心から測ると帯の縁を通って起こさずに抜けられる)。壁越しでは起きない。
 * ①②どちらか先に満たした方で起きる。
 */
export const crawlerSeesPlayer = (c: Pick<LabCrawler, 'x' | 'y'>, playerCx: number, playerCy: number, obstacles: readonly Rect[]): boolean => {
  const r = crawlerRect(c);
  const nx = Math.max(r.x, Math.min(r.x + r.width, playerCx)), ny = Math.max(r.y, Math.min(r.y + r.height, playerCy));
  const dx = playerCx - nx, dy = playerCy - ny;
  if (dx * dx + dy * dy > LAB_VISION_RANGE * LAB_VISION_RANGE) return false;
  return !segmentBlocked(playerCx, playerCy, nx, ny, obstacles as Rect[]);
};

/**
 * 出現位置: 原点からアイドルの方向へ `CRAWLER_START_DIST_PX`、箱の中心が廊下の中央(y=0)。
 * 壁・プロップは塊を止めない(肉が乗り越える)ので寄せない。
 * `goalX` はゴール資料のx(未指定=アイドルの点対称=資料の位置。labIdolSpotForDoc の逆)。
 */
export const createLabCrawler = (
  idol: { x: number; y: number },
  goalX: number = -idol.x,
): LabCrawler => {
  const dir = idol.x >= 0 ? 1 : -1;
  return {
    awake: false, goalX,
    x: dir * CRAWLER_START_DIST_PX, y: CRAWLER_HIT_H / 2,
    vx: 0, vy: 0,
    facingLeft: dir > 0, // 原点(スタート)の方を向いて待つ
    state: 'move', stateAt: 0, hitAt: 0, slamX: 0, slamY: 0,
    nextAttackAt: 0,
    absorbed: 0, absorbing: [],
    pressing: false,
  };
};

/** 叩きつけの的の候補(プレイヤー or 取り込める雑魚)。r=当たりの半径(円に触れたら当たり)。 */
export interface CrawlerTarget {
  id: string; isPlayer: boolean;
  cx: number; cy: number; r: number;
  /** 取り込みの絵のための寸法(雑魚のみ使う)。 */
  type?: string; footY?: number; w?: number; h?: number;
}

export interface CrawlerStepInput {
  gameTime: number;
  /** 秒。 */
  dt: number;
  player: Rect;
  /** 叩きつけの的の候補。**取り込めない敵(ボス級・名前付き等)は呼び出し側で外しておく**。プレイヤーも含める。 */
  targets: readonly CrawlerTarget[];
  /** 塊の周りの壁・プロップの矩形。 */
  obstacles: readonly Rect[];
  playable: PlayableAreaCtx;
  /**
   * プレイヤーの移動を塞ぐ壁のうち、`obstacles` 以外(噛みつき敵の足元の壁など)。塊がプレイヤーを押し出す時、
   * 押し先がこれらに重なるなら押さずに塊の方が止まる(プレイヤーを挟み込まない)。
   */
  playerBlockers?: readonly Rect[];
  /** 起きるのを待たせる(別のアテンションが出ている間など)。条件を満たしたまま次のステップで起きる。 */
  wakeBlocked?: boolean;
}

export interface CrawlerStepResult {
  /** 次の状態。昇天し終えたら null。 */
  next: LabCrawler | null;
  /** このステップで叩きつけた円(当たる瞬間)。無ければ null。 */
  slam: { x: number; y: number; radius: number } | null;
  /** このステップで取り込んだ敵の id。 */
  absorbIds: string[];
  /** 這ってきた塊にプレイヤーが押される量(押し先が壁・帯の外なら塊の方が止まり、0)。 */
  playerPush: { dx: number; dy: number } | null;
  /** このステップで起きた(呼び出し側がアテンションを出す)。 */
  woke: boolean;
}

const inSlam = (sx: number, sy: number, t: Pick<CrawlerTarget, 'cx' | 'cy' | 'r'>): boolean =>
  Math.hypot(t.cx - sx, t.cy - sy) <= CRAWLER_SLAM_RADIUS + t.r;

/**
 * 1ステップ進める(純関数)。順序: ①状態遷移(溜め→叩きつけ→戻り→間/昇天)②移動(慣性・壁・帯・プレイヤー)。
 */
export const stepLabCrawler = (c: LabCrawler, inp: CrawlerStepInput): CrawlerStepResult => {
  const t = inp.gameTime;
  const dt = Math.max(0, inp.dt);
  let n: LabCrawler = { ...c, absorbing: c.absorbing.filter(a => t - a.at < CRAWLER_ABSORB_MS) };
  let slam: CrawlerStepResult['slam'] = null;
  const absorbIds: string[] = [];
  // ---- ⓪ 待機: 起きるまでは何もしない(動かない・攻撃しない)。壁としての当たりは呼び出し側(プレイヤーの移動)が持つ。 ----
  if (!n.awake) {
    const pcx0 = inp.player.x + inp.player.width / 2, pcy0 = inp.player.y + inp.player.height / 2;
    if (!inp.wakeBlocked && (crawlerShouldWake(pcx0, n.goalX) || crawlerSeesPlayer(n, pcx0, pcy0, inp.obstacles))) {
      return { next: { ...n, awake: true, stateAt: t, nextAttackAt: t }, slam: null, absorbIds, playerPush: null, woke: true };
    }
    return { next: { ...n, vx: 0, vy: 0 }, slam: null, absorbIds, playerPush: null, woke: false };
  }

  // ---- ① 状態遷移 ----
  if (n.state === 'ascend') {
    if (t - n.stateAt >= CRAWLER_ASCEND_MS) return { next: null, slam: null, absorbIds, playerPush: null, woke: false };
  } else if (n.state === 'windup') {
    if (t >= n.hitAt) {
      // 当たる瞬間: 溜め開始で固定した円の中の雑魚を取り込む(プレイヤーへの当たりは呼び出し側=被ダメージの経路)。
      slam = { x: n.slamX, y: n.slamY, radius: CRAWLER_SLAM_RADIUS };
      const absorbing = [...n.absorbing];
      for (const tg of inp.targets) {
        if (tg.isPlayer) continue;
        if (!inSlam(n.slamX, n.slamY, tg)) continue;
        absorbIds.push(tg.id);
        absorbing.push({ id: tg.id, type: tg.type ?? '', x: tg.cx, y: tg.footY ?? tg.cy, w: tg.w ?? tg.r * 2, h: tg.h ?? tg.r * 2, at: n.hitAt });
      }
      n = { ...n, state: 'recover', stateAt: n.hitAt, absorbed: n.absorbed + absorbIds.length, absorbing };
    }
  }
  if (n.state === 'recover' && t - n.stateAt >= CRAWLER_RECOVER_MS) {
    const end = n.stateAt + CRAWLER_RECOVER_MS;
    n = n.absorbed >= CRAWLER_ABSORB_TO_ASCEND
      ? { ...n, state: 'ascend', stateAt: end }
      : { ...n, state: 'move', stateAt: end, nextAttackAt: end + CRAWLER_COOLDOWN_MS };
  }

  const pc = { x: inp.player.x + inp.player.width / 2, y: inp.player.y + inp.player.height / 2 };
  // 向き: 動いている間だけプレイヤーの方へ(攻撃中・昇天中は固定)。
  if (n.state === 'move') {
    const cc = crawlerCenter(n);
    if (pc.x < cc.x - CRAWLER_FACE_HYST_PX && !n.facingLeft) n = { ...n, facingLeft: true };
    else if (pc.x > cc.x + CRAWLER_FACE_HYST_PX && n.facingLeft) n = { ...n, facingLeft: false };
  }
  // 攻撃の開始: 手の届く範囲(前方の円)にプレイヤーか雑魚が入ったら。両方居れば近い方(=どちらでも溜めは同じ)。
  if (n.state === 'move' && t >= n.nextAttackAt) {
    const s = crawlerSlamCenter(n);
    const inReach = inp.targets.some(tg => inSlam(s.x, s.y, tg));
    if (inReach) n = { ...n, state: 'windup', stateAt: t, hitAt: t + CRAWLER_WINDUP_MS, slamX: s.x, slamY: s.y };
  }

  // ---- ② 移動(慣性) ----
  // 横: プレイヤーの方へ最高 18px/秒。縦: プレイヤーの高さ(帯の中)へ最高 70px/秒(差に比例して寄る)。軸ごとに慣性。
  let tvx = 0, tvy = 0;
  if (n.state === 'move') {
    const cc = crawlerCenter(n);
    const dx = pc.x - cc.x;
    if (Math.abs(dx) > 1) tvx = Math.sign(dx) * (crawlerRushing(n, inp.player) ? CRAWLER_RUSH_SPEED : CRAWLER_MAX_SPEED);
    tvy = Math.max(-CRAWLER_MAX_SPEED_Y, Math.min(CRAWLER_MAX_SPEED_Y, (pc.y - cc.y) * CRAWLER_Y_GAIN));
  }
  const rushNow = n.state === 'move' && crawlerRushing(n, inp.player);
  const kx = dt > 0 ? 1 - Math.exp(-dt / (rushNow ? CRAWLER_RUSH_TAU_S : CRAWLER_ACCEL_TAU_S)) : 0;
  const ky = dt > 0 ? 1 - Math.exp(-dt / CRAWLER_ACCEL_TAU_Y_S) : 0;
  let vx = Math.max(-CRAWLER_RUSH_SPEED, Math.min(CRAWLER_RUSH_SPEED, n.vx + (tvx - n.vx) * kx));
  let vy = Math.max(-CRAWLER_MAX_SPEED_Y, Math.min(CRAWLER_MAX_SPEED_Y, n.vy + (tvy - n.vy) * ky));

  let playerPush: CrawlerStepResult['playerPush'] = null;
  let pressing = false;
  if (dt > 0 && (vx !== 0 || vy !== 0)) {
    const from = crawlerRect(n);
    // 壁・プロップでは止まらない(肉が乗り越える)。帯の中には収める。
    const r2 = clampRectToPlayableArea(from.x + vx * dt, from.y + vy * dt, CRAWLER_HIT_W, CRAWLER_HIT_H, inp.playable);
    let moved: Rect = { ...from, x: r2.x, y: r2.y };
    // 昇天中は判定が無い=プレイヤーとは関わらない。
    if (crawlerSolid(n) && rectsOverlap(moved, inp.player)) {
      // 這ってきた塊がプレイヤーに重なった: プレイヤーを押し出す。押し先が壁・帯の外なら塊の方を止める。
      const pushed = resolveAabb(inp.player, [moved]);
      const pRect: Rect = { ...inp.player, x: pushed.x, y: pushed.y };
      const pOk = isRectInPlayableArea(pRect.x, pRect.y, pRect.width, pRect.height, inp.playable)
        && !inp.obstacles.some(o => rectsOverlap(pRect, o))
        && !(inp.playerBlockers ?? []).some(o => rectsOverlap(pRect, o));
      if (pOk) {
        playerPush = { dx: pushed.x - inp.player.x, dy: pushed.y - inp.player.y };
      } else {
        // 塊を止める: プレイヤーの箱から押し戻す。押し戻した先が壁・帯の外なら、動く前の位置に留まる。
        const back = resolveAabb(moved, [inp.player]);
        const backRect: Rect = { ...moved, x: back.x, y: back.y };
        const backOk = isRectInPlayableArea(back.x, back.y, CRAWLER_HIT_W, CRAWLER_HIT_H, inp.playable);
        moved = backOk ? backRect : from;
        pressing = n.state === 'move';
      }
    }
    const nx = moved.x + CRAWLER_HIT_W / 2, ny = moved.y + CRAWLER_HIT_H;
    // 実際に進んだ分を速度にする(壁やプレイヤーに当たって止まった勢いを貯め込まない)。
    vx = (nx - n.x) / dt; vy = (ny - n.y) / dt;
    n = { ...n, x: nx, y: ny };
  }
  n = { ...n, vx, vy, pressing };
  return { next: n, slam, absorbIds, playerPush, woke: false };
};

// ---- 見え方(絵だけ・判定なし) ------------------------------------------------------------------
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut3 = (v: number): number => 1 - (1 - clamp01(v)) ** 3;
const easeIn2 = (v: number): number => clamp01(v) ** 2;

/**
 * 溜めの各コマの尺(ms・コマ0〜6)。振り上げの頂点ほど長く溜める(クリエイティブ監査2026-10-19)。合計=CRAWLER_WINDUP_MS。
 * 実際の溜めの長さ(hitAt−stateAt)が違っても、この比で割り付ける=手が着くコマ(7)の頭=当たる時刻は動かない。
 */
export const CRAWLER_WINDUP_FRAME_MS = [57, 57, 70, 82, 95, 114, 145] as const; // 合計620(旧980の比のまま縮めた)
/** 戻り: 手が着いたコマ7をこの尺だけ止めてから、残り8コマを早送り(合計=CRAWLER_RECOVER_MS)。 */
export const CRAWLER_IMPACT_HOLD_MS = 130;

/** 溜め・戻りの攻撃コマ(0〜15)。溜め=コマ0〜6(頂点ほど長い)、戻り=コマ7(着地で止める)〜15。手が着くコマ7の頭=当たる時刻。 */
export const crawlerAttackFrame = (c: Pick<LabCrawler, 'state' | 'stateAt' | 'hitAt'>, gameTime: number): number | null => {
  if (c.state === 'windup') {
    const total = CRAWLER_WINDUP_FRAME_MS.reduce((a, b) => a + b, 0);
    const el = clamp01((gameTime - c.stateAt) / Math.max(1, c.hitAt - c.stateAt)) * total;
    let acc = 0;
    for (let i = 0; i < CRAWLER_WINDUP_FRAME_MS.length; i++) {
      acc += CRAWLER_WINDUP_FRAME_MS[i];
      if (el < acc) return i;
    }
    return CRAWLER_ATTACK_IMPACT_FRAME - 1;
  }
  if (c.state === 'recover') {
    const el = Math.max(0, gameTime - c.stateAt);
    if (el < CRAWLER_IMPACT_HOLD_MS) return CRAWLER_ATTACK_IMPACT_FRAME;
    const rest = CRAWLER_ATTACK_FRAMES - CRAWLER_ATTACK_IMPACT_FRAME - 1; // コマ8〜15
    const u = clamp01((el - CRAWLER_IMPACT_HOLD_MS) / (CRAWLER_RECOVER_MS - CRAWLER_IMPACT_HOLD_MS));
    return CRAWLER_ATTACK_IMPACT_FRAME + 1 + Math.min(rest - 1, Math.floor(u * rest));
  }
  return null;
};

/** 赤い予告の進行(0→1)。溜め開始=0(出る)、当たる時刻=1(消え切る)。溜め以外は null(出さない)。 */
export const crawlerTelegraphProg = (c: Pick<LabCrawler, 'state' | 'stateAt' | 'hitAt'>, gameTime: number): number | null => {
  if (c.state !== 'windup') return null;
  if (gameTime >= c.hitAt) return null;
  return clamp01((gameTime - c.stateAt) / Math.max(1, c.hitAt - c.stateAt));
};

/**
 * 昇天の見え方(経過ms→)。浮かせない(社長決定2026-10-19): 光の柱が差し(beam)、体が崩れて床へ沈み(sink=0→1)、
 * 縁が光り(flare)、最後に消える(alpha)。どれも加減速つき(慣性)。取り込んだ数の光は crawlerAscendSoul。
 */
export const crawlerAscendLook = (sinceMs: number): { alpha: number; beam: number; flare: number; sink: number } => {
  const T = CRAWLER_ASCEND_MS;
  const beamIn = easeOut3(sinceMs / 700);
  const beamOut = 1 - easeIn2((sinceMs - T * 0.8) / (T * 0.2));
  const flare = easeOut3((sinceMs - 200) / 700) * (1 - easeIn2((sinceMs - T * 0.55) / (T * 0.3)));
  return {
    alpha: 1 - easeIn2((sinceMs - T * 0.6) / (T * 0.35)),
    beam: beamIn * beamOut,
    flare,
    // 崩れ方: 最初は踏みとどまり、だんだん速く床へ沈む(ease-in)。
    sink: easeIn2((sinceMs - 250) / (T * 0.7)),
  };
};

/** 取り込んだ数の光: 最初の光が昇り始める時刻・次の光までの間・1つが昇り切るまで(ms)。 */
export const CRAWLER_SOUL_START_MS = 450;
export const CRAWLER_SOUL_GAP_MS = 140;
export const CRAWLER_SOUL_RISE_MS = 1050;
/** 昇る高さ(px)。 */
export const CRAWLER_SOUL_RISE_PX = 170;
/**
 * 取り込んだ i 番目の光(0始まり)の見え方。まだ/もう見えない時は null。少しずつ時間差で1つずつ昇る。
 * ふわっと灯り、加速しながら昇り(慣性)、上で薄れて消える。
 */
export const crawlerAscendSoul = (i: number, sinceMs: number): { rise: number; alpha: number; scale: number } | null => {
  const u = (sinceMs - CRAWLER_SOUL_START_MS - i * CRAWLER_SOUL_GAP_MS) / CRAWLER_SOUL_RISE_MS;
  if (u < 0 || u >= 1) return null;
  return {
    rise: CRAWLER_SOUL_RISE_PX * u ** 1.7,
    alpha: easeOut3(u / 0.18) * (1 - easeIn2((u - 0.55) / 0.45)),
    scale: 1 - 0.35 * u,
  };
};

/**
 * 取り込まれる敵の見え方(経過ms→)。①当たった瞬間に手の下で潰れる(縦に沈む・塊の方へ倒れる)
 * ②戻りの手に合わせて塊へ引きずり込まれる(k=0→1・加減速つき)③縮まずに塊の縁の下へ沈んで隠れる(sink=0→1)。
 */
export const crawlerAbsorbLook = (sinceMs: number): { k: number; squashY: number; tilt: number; sink: number; alpha: number } => {
  const crush = easeOut3(sinceMs / CRAWLER_ABSORB_CRUSH_MS);
  const u = clamp01((sinceMs - CRAWLER_ABSORB_CRUSH_MS) / (CRAWLER_ABSORB_MS - CRAWLER_ABSORB_CRUSH_MS));
  const k = u * u * (3 - 2 * u); // 引きずりの出だしは重く、途中で速く、縁で緩む
  return {
    k,
    squashY: 1 - 0.38 * crush,   // 叩き潰された(縦に沈む)
    tilt: 0.55 * crush,          // 塊の方へ倒れる(呼び出し側が向きを掛ける)
    sink: easeIn2((u - 0.35) / 0.65), // 引きずられながら縁の下へ沈む
    alpha: 1 - easeIn2((u - 0.92) / 0.08),
  };
};
