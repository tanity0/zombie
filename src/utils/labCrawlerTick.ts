// ステージ2の「這う塊」の配線(store を読んで書く)。判定と状態機械は world/labCrawler.ts の純関数、
// 取り込める敵の述語は utils/crawlerAbsorb.ts、攻撃を受ける代理は utils/labCrawlerProxy.ts。
// ここは「純関数へ渡す材料を集め、結果を store へ書く」だけ。
//
// 第2版(research/LAB_CRAWLER.md §4):
// - 代理の Enemy に入ったダメージを塊の hp から引き、HP0 で昇天(崩れて沈み光が昇る)。代理は毎フレーム塊に合わせる。
// - 資料を拾った(labEscapeAt)ら、アテンションが空き次第、塊をプレイヤーの前方(画面のすぐ外)へ回り込ませてアテンション。
//   以後の速さ=プレイヤーの今の歩きの速さ×1.1。
// - 塊の箱が重なった廊下の壁・遮蔽プロップを壊す(store の labBrokenObstacles=正本。破片・土煙・揺れ)。
//
// - プレイヤーへの当たり: 既存の爆風の経路(pumpkinBlasts → combatTick.applyPumpkinBlastDamage)へ円で積む。
//   =無敵時間・盾(範囲攻撃扱い)・カウンター・吹き飛び(壁と帯の解決はプレイヤーの移動の鎖)を全部そのまま通る。
// - 雑魚への当たり: 取り込む=敵配列から黙って外す(撃破の集計・ドロップ・経験値・クエストの撃破数に入れない)。
import { useGameStore, ENEMY_REMOVE_CAUSE, knockbackSpeedFor, playerEnemyBodyBlockers, ATTENTION_IN_MS } from '../store/gameStore';
import { labWallsInRegion, labPropsInRegion, wallRect, propRect } from '../world/labWalls';
import {
  stepLabCrawler, crawlerCenter, crawlerSlamDamage, crawlerGapToPlayer, CRAWLER_SLAM_KB, type CrawlerTarget,
  applyCrawlerDamage, crawlerChaseSpawn, crawlerObstacleHits, crawlerSolid, crawlerRect, CRAWLER_CHASE_SPEED_MULT, crawlerFacingEdgeX, LAB_ESCAPE_BANNER_TEXT, CRAWLER_VANISH_MS, type LabCrawler,
} from '../world/labCrawler';
import { CRAWLER_PROXY_ID, crawlerProxyDamage, crawlerProxyWanted, syncCrawlerProxyInEnemies } from './labCrawlerProxy';
import { zoomedViewportBounds } from './cameraZoom';
import { GAME_SPEED } from '../config/gameSpeed';
import type { LabBrokenObstacle } from '../world/labWalls';
import type { Rect } from '../world/obstacles';
import { isCrawlerAbsorbable } from './crawlerAbsorb';
import type { PlayableAreaCtx } from '../world/playableArea';
import { npcSfxDistGain } from './npcSfx';

/**
 * 塊の音(社長指示2026-10-19「音をつける」)。audioManager はここで import しない(ヘッドレス縛り)=呼び出し側が渡す。
 * 既存の素材から当てた: 目覚め=zombie-growl(うめき)/叩きつけ=heavy-impact/取り込み=jump-land(湿った潰れる音の素材は無い・代用)/
 * 昇天=phill-skylight(天の光の静かな音)。距離で音量を落とす(護衛NPCと同じ npcSfxDistGain・画面外は無音)。
 */
export type LabCrawlerSfxKey = 'zombie-growl' | 'heavy-impact' | 'jump-land' | 'phill-skylight' | 'boss-death' | 'boss-appear' | 'skadi-ice' | 'decoy-zap'
  | 'crawler-windup' | 'crawler-appear';
export type LabCrawlerSfx = (key: LabCrawlerSfxKey, gain: number) => void;
/** 体を引きずる音のループ(社長支給2026-10-19)。0..1 の音量を毎フレーム渡す(呼び手=audioManager.setCrawlerDrag)。 */
export type LabCrawlerDrag = (gain: number) => void;
/** 引きずる音: 箱の縁からこの距離までは最大、DRAG_SILENT_PX で無音(社長「近いと流れてくる。遠いと小さくなり、鳴らなくなる」)。 */
const DRAG_FULL_PX = 200;
const DRAG_SILENT_PX = 1200;
/** 引きずる音の音量(純関数): 距離×這う速さ。止まっている(待機・攻撃中)は無音、昇天中も無音。 */
export const crawlerDragGain = (gapPx: number, speed: number, ascending: boolean): number => {
  if (ascending || speed < 2) return 0;
  const dist = gapPx <= DRAG_FULL_PX ? 1 : Math.max(0, 1 - (gapPx - DRAG_FULL_PX) / (DRAG_SILENT_PX - DRAG_FULL_PX));
  const move = Math.min(1, 0.4 + speed / 60);
  return dist * move;
};
/** 目覚めのうめきはアテンションで画面に映すので、距離に関係なくこの音量で鳴らす。 */
const WAKE_SFX_GAIN = 0.8;

/**
 * 叩きつけの爆風に付ける持ち主の名札。第2版では代理の Enemy の id と同じ文字列(CRAWLER_PROXY_ID)=
 * 爆風をカウンターすると反撃は代理(=塊)に入る。死因の表示(enemyDeathLabel)はどちらでも「死体の塊」。
 */
export const LAB_CRAWLER_BLAST_OWNER = CRAWLER_PROXY_ID;
/** 敵の候補を集める範囲(塊の中心から・px)。手の届く範囲より十分広く。 */
const TARGET_SCAN_PX = 700;
/** 壁・プロップを集める範囲(塊の箱の周り・px)。 */
const OBSTACLE_PAD_PX = 700;
/**
 * プレイヤーからこの距離より遠い叩きつけは爆風を積まない(当たらないうえ、重い衝撃音と土煙が画面外で鳴るだけ)。
 * 雑魚の取り込みは距離に関係なく起きる。
 */
const SLAM_BLAST_NEAR_PX = 900;
/** 叩きつけの揺れ(既存の triggerShake)。プレイヤーとの距離で弱め、この距離で0。 */
const SLAM_SHAKE_MS = 360;
const SLAM_SHAKE_MAG = 12; // 5倍の巨体の叩きつけ=重く
const SLAM_SHAKE_FALLOFF_PX = 1400;
/** 叩きつけの揺れの強さ(距離で直線的に弱める・純関数)。 */
export const crawlerSlamShakeMag = (distPx: number): number =>
  SLAM_SHAKE_MAG * Math.max(0, 1 - distPx / SLAM_SHAKE_FALLOFF_PX);

/** 壁・プロップが壊れた時の揺れ(距離で弱める・この距離で0)。叩きつけより軽く短い。 */
const BREAK_SHAKE_MS = 260;
const BREAK_SHAKE_MAG = 7;
const BREAK_SHAKE_FALLOFF_PX = 1100;
export const crawlerBreakShakeMag = (distPx: number): number =>
  BREAK_SHAKE_MAG * Math.max(0, 1 - distPx / BREAK_SHAKE_FALLOFF_PX);
/** 倒れた瞬間の揺れ。 */
const DEATH_SHAKE_MS = 900;
/** 倒した瞬間の一拍: 時間の止まり(ms)と、面した縁への寄り(+50%)。 */
export const DEATH_BEAT_STOP_MS = 520;
const DEATH_BEAT_ZOOM_MAG = 0.5;
const DEATH_SHAKE_MAG = 10;

/** 追跡の速さ(px/秒)=プレイヤーの今の歩きの速さ(MOVE_SPEED_MULT 前)×ゲームのテンポ×1.1(純関数)。 */
export const crawlerChaseSpeedFor = (walkMoveSpeed: number, gameSpeed: number = GAME_SPEED): number =>
  Math.max(0, walkMoveSpeed) * gameSpeed * CRAWLER_CHASE_SPEED_MULT;

/** 塊の周りの壁・プロップ(壊れていない物)を、壊す判定の候補として集める。 */
const obstaclesAround = (c: Pick<LabCrawler, 'x' | 'y'>, pad: number): { walls: ReturnType<typeof labWallsInRegion>; props: ReturnType<typeof labPropsInRegion> } => {
  const cc = crawlerCenter(c);
  const minX = cc.x - pad, maxX = cc.x + pad, minY = cc.y - pad, maxY = cc.y + pad;
  return { walls: labWallsInRegion(minX, minY, maxX, maxY), props: labPropsInRegion(minX, minY, maxX, maxY) };
};

/** 壊れる物を集める(壁・プロップの id・足元・種類)。 */
const collectBreaks = (c: LabCrawler, gameTime: number, revealAt?: number): LabBrokenObstacle[] => {
  if (!c.awake || !crawlerSolid(c)) return [];
  const { walls, props } = obstaclesAround(c, 600);
  const cand = [
    ...walls.map(w => ({ id: w.id, rect: wallRect(w), kind: 'wall' as const, x: w.footX, y: w.footY, variant: undefined as number | undefined })),
    ...props.map(pr => ({ id: pr.id, rect: propRect(pr), kind: 'prop' as const, x: pr.footX, y: pr.footY, variant: pr.variant as number | undefined })),
  ];
  const hit = new Set(crawlerObstacleHits(c, cand));
  return cand.filter(o => hit.has(o.id)).map(o => ({
    id: o.id, kind: o.kind, x: o.x, y: o.y, at: gameTime,
    dir: o.x >= c.x ? 1 : -1, // 塊から物への向きに倒れる(クリエイティブ監査#6)
    ...(o.variant !== undefined ? { variant: o.variant } : {}),
    ...(revealAt !== undefined ? { revealAt } : {}),
  }));
};

/**
 * プロップの種類ごとの破片(クリエイティブ監査#8)。lab-props/lab-prop2-r{row}-c{col}(variant=0..11・r1c1から横に数える)を目で見て分けた。
 * terminal=端末・制御盤・配電箱 / glass=ガラス管・ガラス戸棚 / capsule=培養カプセル / liquid=薬液の樽 / metal=台車・アーム。壁は石。★素材を差し替えたら見直す。
 */
export type LabDebrisKind = 'stone' | 'terminal' | 'glass' | 'capsule' | 'liquid' | 'metal';
const PROP_DEBRIS: readonly LabDebrisKind[] = [
  'terminal', 'terminal', 'terminal', 'glass',
  'metal', 'liquid', 'glass', 'terminal',
  'terminal', 'metal', 'capsule', 'capsule',
];
export const labDebrisKind = (b: Pick<LabBrokenObstacle, 'kind' | 'variant'>): LabDebrisKind =>
  b.kind === 'wall' ? 'stone' : PROP_DEBRIS[(b.variant ?? 0) % PROP_DEBRIS.length] ?? 'metal';
/**
 * 破片・火花・液の色(クリエイティブ監査2巡目#18): 各プロップの絵から拾った色を一段暗く・彩度を落とした物(UIの原色を使わない)。
 * shards=飛ぶ破片 / accent=火花・しぶき(少数) / stain=床に残る染み(描画側=pixiScene が読む・無い種類は染み無し) / smoke=土煙の色。
 */
export const LAB_DEBRIS_PALETTE: Record<LabDebrisKind, { shards: readonly string[]; accent?: string; stain?: number; smoke: number }> = {
  stone: { shards: ['#6f6a62', '#4f4b46', '#857f75'], smoke: 0x8a8378 },
  terminal: { shards: ['#77726a', '#56524c', '#4b6b52'], accent: '#b29d52', smoke: 0x7e7a72 },
  glass: { shards: ['#7a929a', '#9fb1b5', '#5f7378'], accent: '#c3d0d2', smoke: 0x7f8a8b },
  capsule: { shards: ['#7a929a', '#5f7378'], accent: '#4f8783', stain: 0x2f4b49, smoke: 0x7a8584 },
  liquid: { shards: ['#736d66', '#57524c'], accent: '#5a7a3b', stain: 0x2e4221, smoke: 0x7a7b70 },
  metal: { shards: ['#6a645f', '#78594a', '#4d4a47'], accent: '#a3845b', smoke: 0x7d776f },
};
/** 崩れの尺(実時間ms・壁=重く長く/プロップ=軽く短く)。描画(pixiScene の崩れ)と、着地の土煙・音の時刻が同じ値を読む。 */
export const LAB_WALL_CRUMBLE_MS = 760;
export const LAB_PROP_CRUMBLE_MS = 430;

type FxStore = ReturnType<typeof useGameStore.getState>;
/**
 * 低く横長に広がる柔らかい土煙(クリエイティブ監査2巡目#8/#9: 点の粒・白い真円のリングの代わり)。
 * 足元の左右へ数個の煙を少しずつずらして置き、外へゆっくり流れながら広がって薄れる。
 */
const spawnLowSmoke = (gs: FxStore, x: number, y: number, halfW: number, tint: number, opts?: { alpha?: number; duration?: number; n?: number }): void => {
  const n = opts?.n ?? 3;
  for (let k = 0; k < n; k++) {
    for (const side of [-1, 1] as const) {
      const off = side * halfW * (0.1 + (k / Math.max(1, n - 1)) * 0.7);
      const w0 = 40 + halfW * 0.35, w1 = 90 + halfW * 0.9;
      gs.spawnSmoke(x + off, y - 4 - k * 3, w0, w1, tint, {
        alpha: (opts?.alpha ?? 0.42) * (1 - k * 0.15), duration: (opts?.duration ?? 1300) + k * 160 + Math.random() * 200,
        hRatio: 0.3, driftX: side * (18 + k * 10), driftY: -4,
      });
    }
  }
};
/** 揺らぎつきの音量(毎回同じに聞こえないように・クリエイティブ監査2巡目#17)。 */
const jitter = (g: number): number => g * (0.85 + Math.random() * 0.3);
/** 壊れる音の間引き(実時間・クリエイティブ監査#10)。割れた瞬間の音と着地の音で別に数える。 */
const BREAK_SFX_MIN_GAP_MS = 250;
let lastBreakSfxAt = 0;
let lastLandSfxAt = 0;
/** 割れた瞬間(クリエイティブ監査2巡目#7): 破片と短い音だけ。土煙と小さな衝撃音は着地の時刻(崩れの尺の後)。 */
const playBreakMoment = (gs: FxStore, breaks: readonly LabBrokenObstacle[], sfx: LabCrawlerSfx | undefined, gain: (b: LabBrokenObstacle) => number): void => {
  for (const b of breaks) {
    const kind = labDebrisKind(b);
    const pal = LAB_DEBRIS_PALETTE[kind];
    const wall = b.kind === 'wall';
    gs.spawnRubble(b.x, b.y - (wall ? 24 : 18), wall ? 14 : 12, wall ? 140 : 90, pal.shards);
    if (pal.accent) gs.spawnBurst(b.x, b.y - 26, pal.accent, wall ? 6 : 9);
  }
  const nowR = Date.now();
  if (sfx && nowR - lastBreakSfxAt >= BREAK_SFX_MIN_GAP_MS) {
    lastBreakSfxAt = nowR;
    // 一番重い物の音を1つ(壁>端末>鉄>ガラス・カプセル>薬液)。叩きつけ(heavy-impact 満量)と聞き分けられるよう小さめ・種類で素材を変える。
    const order: LabDebrisKind[] = ['stone', 'terminal', 'metal', 'glass', 'capsule', 'liquid'];
    const b0 = [...breaks].sort((a, c) => order.indexOf(labDebrisKind(a)) - order.indexOf(labDebrisKind(c)))[0];
    const g = gain(b0);
    const k0 = labDebrisKind(b0);
    if (k0 === 'stone') sfx('heavy-impact', jitter(g * 0.6));
    else if (k0 === 'terminal') { sfx('heavy-impact', jitter(g * 0.22)); sfx('decoy-zap', jitter(g * 0.4)); }
    else if (k0 === 'glass' || k0 === 'capsule') sfx('skadi-ice', jitter(g * 0.45));
    else if (k0 === 'liquid') sfx('jump-land', jitter(g * 0.5));
    else sfx('heavy-impact', jitter(g * 0.3));
  }
};
/** 着地(倒れ切った時刻): 低く横に這う土煙・液の飛沫・小さな衝撃音・揺れ(壁が強め・プロップは小さく)。 */
const playBreakLanding = (gs: FxStore, breaks: readonly LabBrokenObstacle[], sfx: LabCrawlerSfx | undefined, gain: (b: LabBrokenObstacle) => number, nearestPx: number): void => {
  for (const b of breaks) {
    const kind = labDebrisKind(b);
    const pal = LAB_DEBRIS_PALETTE[kind];
    const wall = b.kind === 'wall';
    spawnLowSmoke(gs, b.x + (b.dir ?? 0) * (wall ? 20 : 12), b.y, wall ? 90 : 50, pal.smoke, { alpha: wall ? 0.45 : 0.36, n: wall ? 3 : 2 });
    if (kind === 'liquid' || kind === 'capsule') gs.spawnBurst(b.x + (b.dir ?? 0) * 24, b.y - 6, pal.accent ?? '#4f8783', 8, b.dir ?? 0, -0.2);
  }
  const anyWall = breaks.some(b => b.kind === 'wall');
  const mag = anyWall ? crawlerBreakShakeMag(nearestPx) : Math.min(3.5, crawlerBreakShakeMag(nearestPx));
  if (mag > 0.3) gs.triggerShake(BREAK_SHAKE_MS, mag);
  const nowR = Date.now();
  if (sfx && nowR - lastLandSfxAt >= BREAK_SFX_MIN_GAP_MS) {
    lastLandSfxAt = nowR;
    const b0 = breaks.find(b => b.kind === 'wall') ?? breaks[0];
    sfx(anyWall ? 'heavy-impact' : 'jump-land', jitter(gain(b0) * (anyWall ? 0.28 : 0.22)));
  }
};
/** 資料を拾った後の帯の文言(この経路だけ・クリエイティブ監査#5)。定数の正本は world/labCrawler.LAB_ESCAPE_BANNER_TEXT。 */
export const LAB_ESCAPE_BANNER = LAB_ESCAPE_BANNER_TEXT;
/** 回り込みのアテンションでカメラが塊へ着くまで(=注目点へ寄る尺)。現れる演出・壊れる絵と音をここへ揃える(クリエイティブ監査#4・2巡目#2)。 */
const CHASE_REVEAL_DELAY_MS = ATTENTION_IN_MS;
/**
 * カメラが着いてから「出てきた」の一押し(boss-appear)まで(唸りの途中に重ねない・2巡目#3)。
 * 社長支給の登場音(crawler-appear・約1.4秒で頂点→引く)を着いた時刻に鳴らすので、頂点に重ねず引き際へずらした(1200→1800)。
 */
const CHASE_STINGER_AFTER_ARRIVAL_MS = 1800;
/** 登場音(crawler-appear)の音量。アテンションで映すので距離で弱めない。 */
const APPEAR_SFX_GAIN = 1;
/** 倒れた時: 天の光の音を地響き(boss-death)の後へずらす(実時間ms・クリエイティブ監査#15)。 */
const DEATH_SKYLIGHT_DELAY_MS = 450;
/** 進みながら溜める間の、前の縁から地面を擦る土煙の間隔(ゲーム時間ms・2巡目#1)。 */
const SCRAPE_EVERY_MS = 90;
let lastScrapeAt = -Infinity;

export const runLabCrawlerTick = (gameTime: number, dtSec: number, sfx?: LabCrawlerSfx, drag?: LabCrawlerDrag): void => {
  const st = useGameStore.getState();
  let c = st.labCrawler;
  if (!c) {
    // 昇天し終えた/置かない出撃: 代理が残っていれば外す。
    if (st.enemies.some(e => e.id === CRAWLER_PROXY_ID)) useGameStore.setState(s => ({ enemies: s.enemies.filter(e => e.id !== CRAWLER_PROXY_ID) }));
    drag?.(0);
    return;
  }
  const p = st.player;
  const pRect: Rect = { x: p.x, y: p.y, width: p.width, height: p.height };
  const pcx = p.x + p.width / 2, pcy = p.y + p.height / 2;
  const gainAt = (x: number, y: number): number => npcSfxDistGain(x, y, pcx, pcy, st.camera, st.gameBounds);
  const playable: PlayableAreaCtx = {
    farBackdrop: st.farBackdrop, labTheme: true, corridorMode: false, m0AdvanceLimitX: null, corridorRunInActive: false,
  };

  // ---- ① 代理に入ったダメージを塊の体力から引く(HP0で昇天) ----
  let died = false;
  if (crawlerProxyWanted(c)) {
    const dmg = crawlerProxyDamage(c, st.enemies.find(e => e.id === CRAWLER_PROXY_ID));
    if (dmg > 0) {
      const r = applyCrawlerDamage(c, dmg, gameTime);
      c = r.next; died = r.died;
    }
  }

  // ---- ② 資料を拾った: 塊がプレイヤーの前方(画面のすぐ外)から出てくる(アテンションが空くのを待つ) ----
  let chaseAt: { x: number; y: number } | null = null;
  if (!died && st.labEscapeAt > 0 && !c.chasing && st.attention === null) {
    const dir = c.goalX >= 0 ? 1 : -1;
    const vb = zoomedViewportBounds(st.camera, st.gameBounds, st.viewZoom);
    const viewEdge = dir > 0 ? vb.right - pcx : pcx - vb.left; // 見えている端までの距離(ズーム込み)
    const nc = crawlerChaseSpawn(c, pRect, viewEdge, playable, gameTime);
    if (nc) { c = nc; chaseAt = crawlerCenter(nc); }
  }

  // ---- ③ 状態機械・移動(出てきたフレーム・倒れたフレームは動かさない) ----
  let res: ReturnType<typeof stepLabCrawler> = { next: c, slam: null, absorbIds: [], playerPush: null, woke: false };
  if (!chaseAt && !died) {
    const cc = crawlerCenter(c);
    const targets: CrawlerTarget[] = [];
    if (p.health > 0) targets.push({ id: 'player', isPlayer: true, cx: pcx, cy: pcy, r: Math.max(p.width, p.height) / 2 });
    for (const e of st.enemies) {
      const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
      if (Math.abs(ecx - cc.x) > TARGET_SCAN_PX || Math.abs(ecy - cc.y) > TARGET_SCAN_PX) continue;
      if (!isCrawlerAbsorbable(e)) continue; // ボス級(代理を含む)・名前付き等は取り込まない
      targets.push({ id: e.id, isPlayer: false, cx: ecx, cy: ecy, r: Math.max(e.width, e.height) / 2, type: e.type, footY: e.y + e.height, w: e.width, h: e.height });
    }
    const minX = cc.x - OBSTACLE_PAD_PX, maxX = cc.x + OBSTACLE_PAD_PX, minY = cc.y - OBSTACLE_PAD_PX, maxY = cc.y + OBSTACLE_PAD_PX;
    const obstacles = [...labWallsInRegion(minX, minY, maxX, maxY).map(wallRect), ...labPropsInRegion(minX, minY, maxX, maxY).map(propRect)];
    // 別のアテンションが出ている間は起きるのを待たせる(アテンションは同時に1つ=後から来た方は捨てられるため)。
    // 塊がプレイヤーを押す時の行き先の確認に、プレイヤーの移動が見ている敵の体の壁(噛みつき敵の足元など)も渡す。
    const playerBlockers = playerEnemyBodyBlockers(st.enemies, st.gameTime, p.x, p.y);
    res = stepLabCrawler(c, {
      gameTime, dt: dtSec, player: pRect, targets, obstacles, playable, playerBlockers, wakeBlocked: st.attention !== null,
      chaseSpeed: crawlerChaseSpeedFor(p.walkMoveSpeed ?? p.effectiveMoveSpeed ?? p.speed),
    });
  }
  const nc = res.next;
  // 昇天の間は鳴らさない。沈んで消える間は、滑りの終わりまでゆっくり絞る(2巡目#13)。
  if (drag) {
    if (!nc) drag(0);
    else if (nc.state === 'vanish') {
      const u = Math.min(1, Math.max(0, (gameTime - nc.stateAt) / CRAWLER_VANISH_MS));
      drag(crawlerDragGain(crawlerGapToPlayer(nc, pRect), Math.max(30, Math.hypot(nc.vx, nc.vy)), false) * (1 - u) * (1 - u));
    } else drag(crawlerDragGain(crawlerGapToPlayer(nc, pRect), Math.hypot(nc.vx, nc.vy), !crawlerSolid(nc)));
  }

  // ---- ④ 箱が重なった壁・プロップを壊す(起きている間・資料の前も後も) ----
  const breaks = nc ? collectBreaks(nc, gameTime, chaseAt ? Date.now() + CHASE_REVEAL_DELAY_MS : undefined) : [];

  const absorbed = new Set(res.absorbIds);
  for (const id of absorbed) ENEMY_REMOVE_CAUSE.set(id, 'crawlerAbsorb'); // 消失ログ用(撃破ではない)
  const slam = res.slam;
  const blastNear = !!slam && Math.hypot(pcx - slam.x, pcy - slam.y) <= SLAM_BLAST_NEAR_PX;
  const proxyOwner = crawlerProxyWanted(c); // 叩きつけた瞬間に代理が居る=カウンターの反撃が塊に入る

  // ---- ⑤ store へ書く(塊・代理・取り込み・押し出し・爆風・壊れた壁) ----
  useGameStore.setState(s => {
    const enemiesAfterAbsorb = absorbed.size > 0 ? s.enemies.filter(e => !absorbed.has(e.id)) : s.enemies;
    const enemies = syncCrawlerProxyInEnemies(enemiesAfterAbsorb, nc);
    return {
      labCrawler: nc,
      ...(enemies !== s.enemies ? { enemies: enemies as typeof s.enemies } : {}),
      ...(res.playerPush ? { player: { ...s.player, x: s.player.x + res.playerPush.dx, y: s.player.y + res.playerPush.dy } } : {}),
      ...(breaks.length > 0 ? { labBrokenObstacles: [...s.labBrokenObstacles, ...breaks] } : {}),
      ...(slam && blastNear ? {
        pumpkinBlasts: [...s.pumpkinBlasts, {
          x: slam.x, y: slam.y, radius: slam.radius, damage: crawlerSlamDamage(s.player.maxHealth),
          enemyId: proxyOwner ? CRAWLER_PROXY_ID : LAB_CRAWLER_BLAST_OWNER, moveKey: 'crawler-slam',
          kbSpeed: knockbackSpeedFor(CRAWLER_SLAM_KB.distPx, CRAWLER_SLAM_KB.ms), kbMs: CRAWLER_SLAM_KB.ms,
          // 吹き飛ぶ向き=塊から離れる向き(叩きつけの円の中心ではない=手の手前に居ても塊へ押し込まない)。
          pushFrom: crawlerCenter(c),
        }],
      } : {}),
    };
  });

  // ---- ⑥ 演出・音(書いた後に。アテンションは store の set を呼ぶため) ----
  const gs = useGameStore.getState();
  if (res.woke && nc) {
    // 起きた瞬間のアテンション(社長指示2026-10-19)。既存の「現地へカメラアテンション」の素の型(カットイン無し)=
    // 救助イベントの発生(useGameLoop の triggerAttention(rx, ry))と同じ。時間は止まり(hitstop)、カメラが塊へ寄って戻る。
    const wc = crawlerCenter(nc);
    gs.triggerAttention(wc.x, wc.y);
    sfx?.('zombie-growl', WAKE_SFX_GAIN);
    sfx?.('crawler-appear', APPEAR_SFX_GAIN); // 社長支給の登場音(2026-10-19「登場時も鳴らす」)
  }
  if (chaseAt && nc) {
    // 資料を拾った後(第2版): 前から出てきた塊へアテンション(起きた時と同じ型)。目覚めと手触りを変える(クリエイティブ監査#3・2巡目#2/#3):
    // 寄り始めは遠い低い地響き(音だけ・揺れは弱く)。カメラが着いた時刻に、唸り・重い衝撃(距離で弱めない)・破片・横に這う土煙・揺れ12を
    // まとめて出し(壁の崩れと同じ時刻)、着いてから約1.2秒後に一押し(boss-appear)。
    gs.triggerAttention(chaseAt.x, chaseAt.y);
    sfx?.('heavy-impact', 0.18);
    gs.triggerShake(320, 2);
    const r = crawlerRect(nc);
    const frontX = nc.facingLeft ? r.x + 40 : r.x + r.width - 40;
    const footY = r.y + r.height;
    setTimeout(() => {
      const g2 = useGameStore.getState();
      sfx?.('zombie-growl', WAKE_SFX_GAIN);
      sfx?.('crawler-appear', APPEAR_SFX_GAIN); // 社長支給の登場音(カメラが着く時刻=唸りと同じ所)
      sfx?.('heavy-impact', 0.85);
      g2.spawnRubble(frontX, footY - 20, 18, 220, LAB_DEBRIS_PALETTE.stone.shards);
      spawnLowSmoke(g2, frontX, footY - 4, 200, 0x9b8a6e, { alpha: 0.5, duration: 1600 });
      g2.triggerShake(420, 12);
    }, CHASE_REVEAL_DELAY_MS);
    if (sfx) setTimeout(() => sfx('boss-appear', 0.7), CHASE_REVEAL_DELAY_MS + CHASE_STINGER_AFTER_ARRIVAL_MS);
  }
  if (breaks.length > 0) {
    // 壁・プロップが崩れる(②派手さの絵=判定なし)。割れた瞬間=破片と短い音、倒れ切った時刻=土煙と小さな衝撃音・揺れ(2巡目#7)。
    // 回り込みで壊れた物は、カメラが着く時刻まで絵も音も待たせる(壁を割って出てくる所を見せる・音は注目点の音量=距離で弱めない)。
    const reveal = breaks[0].revealAt;
    const gain = (b: LabBrokenObstacle) => (reveal !== undefined ? 0.85 : gainAt(b.x, b.y));
    const nearest = Math.min(...breaks.map(b => Math.hypot(b.x - pcx, b.y - pcy)));
    const startIn = reveal !== undefined ? Math.max(0, reveal - Date.now()) : 0;
    const crumbleMs = breaks.some(b => b.kind === 'wall') ? LAB_WALL_CRUMBLE_MS : LAB_PROP_CRUMBLE_MS;
    const moment = () => playBreakMoment(useGameStore.getState(), breaks, sfx, gain);
    const landing = () => playBreakLanding(useGameStore.getState(), breaks, sfx, gain, reveal !== undefined ? 0 : nearest);
    if (startIn > 0) setTimeout(moment, startIn); else moment();
    setTimeout(landing, startIn + crumbleMs);
  }
  if (nc && nc.state === 'windup' && nc.slamMoving && Math.abs(nc.vx) > 20 && gameTime - lastScrapeAt >= SCRAPE_EVERY_MS) {
    // 進みながら溜める間(2巡目#1): 前の縁から地面を擦る土煙と、後ろに残る引きずり跡(暗く細長い煙)。
    lastScrapeAt = gameTime;
    const r = crawlerRect(nc);
    const dir = nc.facingLeft ? -1 : 1;
    const fx = dir > 0 ? r.x + r.width - 30 : r.x + 30;
    const fy = r.y + r.height - 6;
    gs.spawnSmoke(fx, fy, 50, 140, 0x8f8068, { alpha: 0.4, duration: 900, hRatio: 0.28, driftX: -dir * 30, driftY: -6 });
    gs.spawnSmoke(fx - dir * 40, fy + 2, 90, 120, 0x2e2822, { alpha: 0.3, duration: 1800, hRatio: 0.1 });
  }
  if (nc && nc.state === 'windup' && (c.state !== 'windup' || nc.stateAt !== c.stateAt)) {
    // 叩きつけの溜めが始まった瞬間(プレイヤー狙いも雑魚狙いも): 社長支給の「攻撃してくる直前の音」(素材の0.8秒目から=頂点が手の着く頃)。
    // 距離で弱める(画面外の雑魚狙いは無音=npcSfxDistGain)。
    const wg = gainAt(nc.slamX, nc.slamY);
    if (wg > 0.01) sfx?.('crawler-windup', wg);
  }
  if (slam) {
    const mag = crawlerSlamShakeMag(Math.hypot(pcx - slam.x, pcy - slam.y));
    if (mag > 0.3) gs.triggerShake(SLAM_SHAKE_MS, mag);
    // 重い衝撃(爆風の経路の共通の衝撃音は塊の時だけ鳴らさない=ここで距離つきで鳴らす)。
    sfx?.('heavy-impact', gainAt(slam.x, slam.y));
  }
  if (absorbed.size > 0 && slam) sfx?.('jump-land', gainAt(slam.x, slam.y) * 0.9);
  if (nc && nc.state === 'vanish' && c.state !== 'vanish') {
    // ゴール手前で沈んで消え始めた(2巡目#13): 遠ざかる唸り(低く小さく)・沈む切り口の線に沿った低い土煙・弱い揺れ。
    const r = crawlerRect(nc);
    const footY = r.y + r.height;
    sfx?.('zombie-growl', Math.max(0.12, gainAt(r.x + r.width / 2, footY) * 0.35));
    for (let k = 0; k < 5; k++) gs.spawnSmoke(r.x + r.width * (0.1 + k * 0.2), footY - 2, 90, 200, 0x6f6658, { alpha: 0.38, duration: 1500 + k * 120, hRatio: 0.22, driftY: -3 });
    gs.triggerShake(500, 3);
  }
  if (died && nc) {
    // HP0(第2版・社長「HP0で倒せる(崩れて昇る)」): 崩れて沈み、光が昇る(昇天の見せ方)+地響き。撃破の集計・報酬は無い。
    // 倒した瞬間に一拍(社長指示2026-10-20「倒した時、一拍入れる」): 時間を DEATH_BEAT_STOP_MS だけ止め、面した縁へ寄る
    // (カウンター/処刑と同じ triggerHitImpact=止め→スローで等速へ→揺れは止めの後)。止めの間は崩れも止まって見え、明けてから崩れが始まる。
    // ※長いアテンション(時間停止+パン)は使わない: 昇天はゲーム時間で進むので、2秒以上止めると崩れる所が見えないまま戻ってしまう。
    // 土煙の出どころはプレイヤーに面した縁の内側(体の中心は画面の外になりやすい・クリエイティブ監査#14)。白い輪は出さない(2巡目#9)。
    const r = crawlerRect(nc);
    const edgeX = crawlerFacingEdgeX(nc, pcx);
    gs.triggerHitImpact(DEATH_BEAT_STOP_MS, DEATH_SHAKE_MS, DEATH_SHAKE_MAG * Math.max(0.35, 1 - Math.abs(edgeX - pcx) / 1600),
      DEATH_BEAT_ZOOM_MAG, edgeX, r.y + r.height * 0.55);
    spawnLowSmoke(gs, edgeX, r.y + r.height - 6, 160, 0xa8977a, { alpha: 0.5, duration: 1700 });
    gs.spawnRubble(edgeX, r.y + r.height - 30, 14, 180, LAB_DEBRIS_PALETTE.stone.shards);
    sfx?.('boss-death', Math.max(0.35, gainAt(edgeX, r.y + r.height / 2)));
    const g = Math.max(0.25, gainAt(edgeX, r.y + r.height / 2));
    if (sfx) setTimeout(() => sfx('phill-skylight', g), DEATH_BEAT_STOP_MS + DEATH_SKYLIGHT_DELAY_MS); // 一拍の後、崩れ始めてから
  }
  // 「出口まで戻れ」の帯は、回り込みのアテンションが戻ってから出す(クリエイティブ監査#5)。
  if (gs.labEscapeBannerPending && gs.attention === null && !chaseAt && (!nc || nc.chasing || !crawlerSolid(nc))) {
    useGameStore.setState({ labEscapeBannerPending: false, eventBannerText: LAB_ESCAPE_BANNER, eventBannerUntil: gs.gameTime + 3500 });
  }
};
