// ステージ2の「這う塊」の配線(store を読んで書く)。判定と状態機械は world/labCrawler.ts の純関数、
// 取り込める敵の述語は utils/crawlerAbsorb.ts。ここは「純関数へ渡す材料を集め、結果を store へ書く」だけ。
//
// - プレイヤーへの当たり: 既存の爆風の経路(pumpkinBlasts → combatTick.applyPumpkinBlastDamage)へ円で積む。
//   =無敵時間・盾(範囲攻撃扱い)・カウンター・吹き飛び(壁と帯の解決はプレイヤーの移動の鎖)を全部そのまま通る。
// - 雑魚への当たり: 取り込む=敵配列から黙って外す(撃破の集計・ドロップ・経験値・クエストの撃破数に入れない)。
import { useGameStore, ENEMY_REMOVE_CAUSE, knockbackSpeedFor, playerEnemyBodyBlockers } from '../store/gameStore';
import { labWallsInRegion, labPropsInRegion, wallRect, propRect } from '../world/labWalls';
import {
  stepLabCrawler, crawlerCenter, crawlerSlamDamage, crawlerGapToPlayer, CRAWLER_SLAM_KB, type CrawlerTarget,
} from '../world/labCrawler';
import { isCrawlerAbsorbable } from './crawlerAbsorb';
import type { PlayableAreaCtx } from '../world/playableArea';
import { npcSfxDistGain } from './npcSfx';

/**
 * 塊の音(社長指示2026-10-19「音をつける」)。audioManager はここで import しない(ヘッドレス縛り)=呼び出し側が渡す。
 * 既存の素材から当てた: 目覚め=zombie-growl(うめき)/叩きつけ=heavy-impact/取り込み=jump-land(湿った潰れる音の素材は無い・代用)/
 * 昇天=phill-skylight(天の光の静かな音)。距離で音量を落とす(護衛NPCと同じ npcSfxDistGain・画面外は無音)。
 */
export type LabCrawlerSfxKey = 'zombie-growl' | 'heavy-impact' | 'jump-land' | 'phill-skylight';
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

/** 叩きつけの爆風に付ける持ち主の名札(敵配列には居ない=カウンターされても反撃は誰にも入らない)。 */
export const LAB_CRAWLER_BLAST_OWNER = 'lab-crawler';
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

export const runLabCrawlerTick = (gameTime: number, dtSec: number, sfx?: LabCrawlerSfx, drag?: LabCrawlerDrag): void => {
  const st = useGameStore.getState();
  const c = st.labCrawler;
  if (!c) return;
  const p = st.player;
  const pRect = { x: p.x, y: p.y, width: p.width, height: p.height };
  const pcx = p.x + p.width / 2, pcy = p.y + p.height / 2;
  const cc = crawlerCenter(c);
  const targets: CrawlerTarget[] = [];
  if (p.health > 0) targets.push({ id: 'player', isPlayer: true, cx: pcx, cy: pcy, r: Math.max(p.width, p.height) / 2 });
  for (const e of st.enemies) {
    const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
    if (Math.abs(ecx - cc.x) > TARGET_SCAN_PX || Math.abs(ecy - cc.y) > TARGET_SCAN_PX) continue;
    if (!isCrawlerAbsorbable(e)) continue;
    targets.push({ id: e.id, isPlayer: false, cx: ecx, cy: ecy, r: Math.max(e.width, e.height) / 2, type: e.type, footY: e.y + e.height, w: e.width, h: e.height });
  }
  const minX = cc.x - OBSTACLE_PAD_PX, maxX = cc.x + OBSTACLE_PAD_PX, minY = cc.y - OBSTACLE_PAD_PX, maxY = cc.y + OBSTACLE_PAD_PX;
  const obstacles = [...labWallsInRegion(minX, minY, maxX, maxY).map(wallRect), ...labPropsInRegion(minX, minY, maxX, maxY).map(propRect)];
  const playable: PlayableAreaCtx = {
    farBackdrop: st.farBackdrop, labTheme: true, corridorMode: false, m0AdvanceLimitX: null, corridorRunInActive: false,
  };
  // 別のアテンションが出ている間は起きるのを待たせる(アテンションは同時に1つ=後から来た方は捨てられるため)。
  // 塊がプレイヤーを押す時の行き先の確認に、プレイヤーの移動が見ている敵の体の壁(噛みつき敵の足元など)も渡す。
  const playerBlockers = playerEnemyBodyBlockers(st.enemies, st.gameTime, p.x, p.y);
  const res = stepLabCrawler(c, { gameTime, dt: dtSec, player: pRect, targets, obstacles, playable, playerBlockers, wakeBlocked: st.attention !== null });
  {
    const nc = res.next;
    drag?.(nc ? crawlerDragGain(crawlerGapToPlayer(nc, pRect), Math.hypot(nc.vx, nc.vy), nc.state === 'ascend') : 0);
  }

  if (res.woke) {
    // 起きた瞬間のアテンション(社長指示2026-10-19)。既存の「現地へカメラアテンション」の素の型(カットイン無し)=
    // 救助イベントの発生(useGameLoop の triggerAttention(rx, ry))と同じ。時間は止まり(hitstop)、カメラが塊へ寄って戻る。
    const wc = crawlerCenter(res.next ?? c);
    useGameStore.setState({ labCrawler: res.next });
    useGameStore.getState().triggerAttention(wc.x, wc.y);
    sfx?.('zombie-growl', WAKE_SFX_GAIN);
    return;
  }
  const absorbed = new Set(res.absorbIds);
  for (const id of absorbed) ENEMY_REMOVE_CAUSE.set(id, 'crawlerAbsorb'); // 消失ログ用(撃破ではない)
  const slam = res.slam;
  const blastNear = !!slam && Math.hypot(pcx - slam.x, pcy - slam.y) <= SLAM_BLAST_NEAR_PX;
  const gainAt = (x: number, y: number): number => npcSfxDistGain(x, y, pcx, pcy, st.camera, st.gameBounds);
  if (slam) {
    const mag = crawlerSlamShakeMag(Math.hypot(pcx - slam.x, pcy - slam.y));
    if (mag > 0.3) useGameStore.getState().triggerShake(SLAM_SHAKE_MS, mag);
    // 重い衝撃(爆風の経路の共通の衝撃音は塊の時だけ鳴らさない=ここで距離つきで鳴らす)。
    sfx?.('heavy-impact', gainAt(slam.x, slam.y));
  }
  if (absorbed.size > 0 && slam) sfx?.('jump-land', gainAt(slam.x, slam.y) * 0.9);
  if (res.next?.state === 'ascend' && c.state !== 'ascend') sfx?.('phill-skylight', Math.max(0.25, gainAt(cc.x, cc.y)));
  useGameStore.setState(s => ({
    labCrawler: res.next,
    ...(absorbed.size > 0 ? { enemies: s.enemies.filter(e => !absorbed.has(e.id)) } : {}),
    ...(res.playerPush ? { player: { ...s.player, x: s.player.x + res.playerPush.dx, y: s.player.y + res.playerPush.dy } } : {}),
    ...(slam && blastNear ? {
      pumpkinBlasts: [...s.pumpkinBlasts, {
        x: slam.x, y: slam.y, radius: slam.radius, damage: crawlerSlamDamage(s.player.maxHealth),
        enemyId: LAB_CRAWLER_BLAST_OWNER, moveKey: 'crawler-slam',
        kbSpeed: knockbackSpeedFor(CRAWLER_SLAM_KB.distPx, CRAWLER_SLAM_KB.ms), kbMs: CRAWLER_SLAM_KB.ms,
        // 吹き飛ぶ向き=塊から離れる向き(叩きつけの円の中心ではない=手の手前に居ても塊へ押し込まない)。
        pushFrom: crawlerCenter(c),
      }],
    } : {}),
  }));
};
