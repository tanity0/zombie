// ステージ2の変異塊の「代理の Enemy」(research/LAB_CRAWLER.md §4・第2版。社長2026-10-19「当たり判定も通常の敵のように追加。HPは37564」)。
//
// 塊の本体は store の labCrawler(world/labCrawler.ts)で、敵配列の外にいる。弾・近接・爆発・サブウェポン・仲間の攻撃は
// 全部「敵配列の Enemy」に当たる作りなので、**攻撃を受ける窓口だけ**を敵配列に1体置く:
//   - 位置・箱=塊の当たり判定(毎フレーム合わせる)。動かない(移動AIは updateEnemies が素通し)。描かない(pixiScene が除く)。
//   - 体力=塊の hp + 大きな下駄(CRAWLER_PROXY_HP_PAD)。どの経路の「撃破」(経験値・ドロップ・撃破数・クエスト・死体)にも
//     届かないよう、代理の体力は0にならない。前のフレームに書いた値からの減りを、このフレームに当たったダメージとして塊の hp から引く。
//   - 区分はボス級(enemyUtils.isBossType)=ノックバック・気絶(フィニッシュの即死)・爆弾の一掃・塊の取り込みの対象外。
//     体勢値は持たない。「ボス戦」(ENGAGEABLE)には入れない。接触ダメージ0(combatTick が素通し)。fixed=上限の間引き・距離の回収で消さない。
//   - 待機中(起きる前)は置かない=開幕に自動の狙いが眠っている塊へ吸われない(起きるまでは撃てない壁のまま)。
//
// ここは純関数だけ(store 非依存)。配線は utils/labCrawlerTick.ts。
import type { Enemy } from '../types/game';
import { crawlerRect, crawlerSolid, CRAWLER_HP, CRAWLER_HIT_W, CRAWLER_HIT_H, type LabCrawler } from '../world/labCrawler';

/** 代理の id(=叩きつけの爆風の持ち主の名札 LAB_CRAWLER_BLAST_OWNER と同じ文字列。死因の表示がどちらでも「変異塊」になる)。 */
export const CRAWLER_PROXY_ID = 'lab-crawler';
/** 代理の体力の下駄。1フレームにこれ以上のダメージは入らない(=代理は撃破されない)。 */
export const CRAWLER_PROXY_HP_PAD = 1_000_000;

/** 代理を置くべきか: 起きていて判定がある間だけ(待機中・昇天中は置かない)。 */
export const crawlerProxyWanted = (c: LabCrawler | null): c is LabCrawler => !!c && c.awake && crawlerSolid(c);

/** 代理として書く体力(塊の hp + 下駄)。 */
export const crawlerProxyHealth = (c: Pick<LabCrawler, 'hp'>): number => CRAWLER_PROXY_HP_PAD + Math.max(0, c.hp);

/**
 * 前のフレームに書いた体力からの減り=このフレームに代理へ入ったダメージ(0以上)。
 * 代理が居ない(一掃などで消された)・回復した(体力が増えた)時は0=当たっていない扱い(次のフレームに作り直す/書き直す)。
 */
export const crawlerProxyDamage = (c: Pick<LabCrawler, 'hp'>, proxy: Pick<Enemy, 'health'> | undefined): number => {
  if (!proxy || !Number.isFinite(proxy.health)) return 0;
  return Math.max(0, crawlerProxyHealth(c) - proxy.health);
};

/**
 * 代理の Enemy を塊に合わせて作る/書き直す。前の代理(prev)の記録(lastHit 等の被弾の打刻・ヘイトのバケツ)は残し、
 * 位置・箱・体力と「動かない・止まらない」に関わる欄だけを毎回上書きする(ノックバック・気絶・拘束・技の状態は持たせない)。
 */
export const buildCrawlerProxy = (c: LabCrawler, prev?: Enemy): Enemy => {
  const r = crawlerRect(c);
  return {
    ...(prev ?? { lastHit: 0, lastShot: 0 }),
    id: CRAWLER_PROXY_ID,
    type: 'lab-crawler',
    x: r.x, y: r.y, width: CRAWLER_HIT_W, height: CRAWLER_HIT_H,
    vx: 0, vy: 0,
    speed: 0, damage: 0, experienceValue: 0,
    health: crawlerProxyHealth(c),
    maxHealth: CRAWLER_PROXY_HP_PAD + CRAWLER_HP,
    fixed: true,
    lastHit: prev?.lastHit ?? 0,
    lastShot: prev?.lastShot ?? 0,
    knockbackUntil: undefined, knockbackVx: undefined, knockbackVy: undefined, knockbackShoveUntil: undefined,
    hitStunUntil: undefined, stunUntil: undefined, rootUntil: undefined, liftUntil: undefined,
    aiPhase: undefined, aiPhaseUntil: undefined, biteAt: undefined, dormant: undefined,
    corpseUntil: undefined, escortToss: undefined,
  };
};

/**
 * 敵配列の中の代理を塊に合わせる(純関数)。置くべきなら作る/書き直す、置かないなら取り除く。変化が無ければ同じ配列を返す。
 */
export const syncCrawlerProxyInEnemies = (enemies: readonly Enemy[], c: LabCrawler | null): readonly Enemy[] => {
  const idx = enemies.findIndex(e => e.id === CRAWLER_PROXY_ID);
  if (!crawlerProxyWanted(c)) return idx < 0 ? enemies : enemies.filter(e => e.id !== CRAWLER_PROXY_ID);
  const next = buildCrawlerProxy(c, idx >= 0 ? enemies[idx] : undefined);
  if (idx < 0) return [...enemies, next];
  const out = enemies.slice();
  out[idx] = next;
  return out;
};

/**
 * ダメージの数字を出す位置(描画だけ・判定なし・クリエイティブ監査#12)。攻撃の経路は数字を「敵の箱の中心の上辺」や当たった所に出すが、
 * 塊の箱は幅約740で縦持ちの画面より広く、プレイヤーが縁で戦っていると中心は画面の外になる=数字が見えない。
 * x はプレイヤーに面した縁の内側 70〜160px でばらす(真上に重なる時は塊の側へずらす)。y は当たった高さを見える範囲に収めて使う。
 * 呼び手(store の spawnDamageNumber)は**代理に当たった数字だけ**を通す(isCrawlerDamageNumber)。
 * view を渡すと、x を見えている範囲の HUD の帯の内側へ収める(crawlerDmgNumberViewX・2巡目#11)。
 */
export const CRAWLER_DMG_NUMBER_EDGE_INSET_PX = 70;
export const CRAWLER_DMG_NUMBER_EDGE_SPREAD_PX = 90;
/** 画面の左右の HUD の帯(画面px・2巡目#11): 数字の x はこの内側に収める(右=ボタン・ゲージの列/左=余白)。 */
export const CRAWLER_DMG_NUMBER_HUD_RIGHT_PX = 90;
export const CRAWLER_DMG_NUMBER_HUD_LEFT_PX = 40;
/** 見えている範囲の左右(ワールド座標)から、HUD の帯を除いた x の範囲。ズーム(引き=zoom<1)で帯の幅もワールドでは広がる。 */
export const crawlerDmgNumberViewX = (
  camera: { x: number }, viewport: { width: number }, zoom: number,
): { left: number; right: number } => {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const cx = camera.x + viewport.width / 2;
  const half = viewport.width / 2 / z;
  return { left: cx - half + CRAWLER_DMG_NUMBER_HUD_LEFT_PX / z, right: cx + half - CRAWLER_DMG_NUMBER_HUD_RIGHT_PX / z };
};
export const crawlerDamageNumberAt = (
  x: number, y: number, c: LabCrawler | null, playerCx: number, playerCy: number, rand: number = 0.5,
  view?: { left: number; right: number },
): { x: number; y: number } => {
  if (!crawlerProxyWanted(c)) return { x, y };
  const r = crawlerRect(c);
  const inset = CRAWLER_DMG_NUMBER_EDGE_INSET_PX + Math.max(0, Math.min(1, rand)) * CRAWLER_DMG_NUMBER_EDGE_SPREAD_PX;
  let nx = playerCx >= r.x + r.width ? r.x + r.width - inset
    : playerCx <= r.x ? r.x + inset
    : Math.max(r.x + CRAWLER_DMG_NUMBER_EDGE_INSET_PX, Math.min(r.x + r.width - CRAWLER_DMG_NUMBER_EDGE_INSET_PX, x));
  // プレイヤーの真上に重なる時は塊の側(箱の中心の向き)へずらす(自分の頭の数字と読み違えない)。
  if (Math.abs(nx - playerCx) < 40) nx += (r.x + r.width / 2 >= playerCx ? 1 : -1) * (40 - Math.abs(nx - playerCx));
  // 見えている範囲から HUD の帯を除いた内側に収める(縁が画面の外・HUD の下に潜る時)。
  if (view && view.left < view.right) nx = Math.max(view.left, Math.min(view.right, nx));
  const ny = Math.max(playerCy - 240, Math.min(playerCy + 160, Math.max(r.y + 20, Math.min(r.y + r.height - 20, y))));
  return { x: nx, y: ny };
};

/**
 * その数字が代理に当たった数字か(クリエイティブ監査#13・品質監査A5)。enemyId があればそれで決める。
 * enemyId を渡さない経路(近接・カウンター等)は、代理の箱の「中心の x・上辺 / 中心」に出された数字だけを代理の物とみなす
 * (=その経路が敵の位置として使う点。箱の中に居る別の雑魚の数字は寄せない)。
 */
export const isCrawlerDamageNumber = (x: number, y: number, c: LabCrawler | null, enemyId: string | undefined): boolean => {
  if (!crawlerProxyWanted(c)) return false;
  if (enemyId !== undefined) return enemyId === CRAWLER_PROXY_ID;
  const r = crawlerRect(c);
  const cx = r.x + r.width / 2;
  return Math.abs(x - cx) < 1.5 && (Math.abs(y - r.y) < 1.5 || Math.abs(y - (r.y + r.height / 2)) < 1.5);
};

/**
 * 当たった手応えの絵(斬撃・血・破裂・クリティカルの輪・カウンターの輪・着弾の火)の出どころ(品質監査A3)。
 * 敵の位置として「箱の中心」を渡してくる経路が多いので、**代理の箱の中心に出された絵だけ**を、プレイヤーに面した縁の
 * 少し内側(プレイヤーの高さ)へ寄せる。それ以外の点はそのまま(null)。
 */
export const CRAWLER_FX_EDGE_INSET_PX = 28;
export const crawlerCenterFxPoint = (
  x: number, y: number, c: LabCrawler | null, playerCx: number, playerCy: number,
): { x: number; y: number } | null => {
  if (!crawlerProxyWanted(c)) return null;
  const r = crawlerRect(c);
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  if (Math.abs(x - cx) >= 1.5 || Math.abs(y - cy) >= 1.5) return null;
  const nx = playerCx >= r.x + r.width ? r.x + r.width - CRAWLER_FX_EDGE_INSET_PX
    : playerCx <= r.x ? r.x + CRAWLER_FX_EDGE_INSET_PX
    : Math.max(r.x + CRAWLER_FX_EDGE_INSET_PX, Math.min(r.x + r.width - CRAWLER_FX_EDGE_INSET_PX, playerCx));
  const ny = Math.max(r.y + 10, Math.min(r.y + r.height - 10, playerCy));
  return { x: nx, y: ny };
};
