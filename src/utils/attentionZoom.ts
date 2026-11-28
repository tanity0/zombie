// アテンション(ボス出現の紹介・討伐の見届け)で、小さめの相手の時だけカメラを少し寄せる倍率
// (社長指示2026-11-14「守護霊や幻影など、小さめの敵は、イベント時、カメラ少し寄って」)。
// 判定はここ1本(純関数・レンダラ非依存)。store が attention.zoomIn に載せ、pixiScene が読んで寄せるだけ。
//
// 「小さめ」は**型の一覧**で決める(ATTENTION_SMALL_TYPES)。
//   ★大きさからの自動判定は試して捨てた(2026-11-14・実測): store が持つ寸法(判定の箱×描画倍率 enemyFootBox /
//   BOSS_SPRITE_FIT)から出す絵の高さは、賞金首で 129 と出るのに実際の絵は画面の半分近い大きさ(別の描画経路で
//   箱より大きく描いている)=「小さい」と誤判定して寄ってしまった。描画の実寸は pixi 側にしか無いので、一覧にする。
//   実測した描画の高さ(等倍のワールドpx・getBounds): 幻影 約47 / アイドル 約159 / ラフィ 約168 / 賞金首(バス停) 約240〜400。
// 大型(isLargeForZoom=文脈ズームで引く型)は一覧に関係なく絶対に寄らない(念のための二重の柵)。

import type { Enemy, EnemyType } from '../types/game';
import { BOSS_SPRITE_FIT } from '../pixi/renderSpec';
import { isLargeForZoom } from './cameraZoom';
import { isBossType } from './enemyUtils';

/** 小さめの相手の時の寄り倍率(叩き台・実機で詰める)。 */
export const ATTENTION_SMALL_ZOOM_IN = 1.25;
/** 寄る型。幻影(守護霊ボス)=孫悟空(固有の幻影 phantomUnique='brawler')も同じ型。 */
export const ATTENTION_SMALL_TYPES: ReadonlySet<EnemyType> = new Set<EnemyType>(['guardian-phantom']);
/** 出現の紹介で、注目点から対象のボスを探す半径(ワールドpx)。注目点は対象の絵の中心か帯の中心。 */
export const ATTENTION_SUBJECT_RADIUS = 160;

export type AttentionSubject = Pick<Enemy, 'type'>;

/** アテンションの寄り倍率。対象なし/一覧に無い/大型 → undefined(=寄らない・今と1bitも同じ)。 */
export const attentionZoomFor = (e: AttentionSubject | null | undefined): number | undefined => {
  if (!e) return undefined;
  if (isLargeForZoom(e.type) || !ATTENTION_SMALL_TYPES.has(e.type)) return undefined;
  return ATTENTION_SMALL_ZOOM_IN;
};

/**
 * 出現の紹介(カットイン付きのアテンション)の注目点 (x, y) にいるボス級の敵。
 * 帯の中心と絵の中心のうち近い方で測り、半径内で一番近い1体。居なければ null。
 */
export const findAttentionSubject = <E extends Pick<Enemy, 'type' | 'x' | 'y' | 'width' | 'height' | 'health'>>(
  enemies: readonly E[],
  x: number, y: number, radius: number = ATTENTION_SUBJECT_RADIUS,
): E | null => {
  let best: E | null = null;
  let bestD2 = radius * radius;
  for (const e of enemies) {
    if (!isBossType(e.type) || e.health <= 0) continue;
    const bx = e.x + e.width / 2, by = e.y + e.height / 2;
    let d2 = (bx - x) * (bx - x) + (by - y) * (by - y);
    const fit = BOSS_SPRITE_FIT[e.type];
    if (fit) {
      const spriteW = e.width / fit.w, spriteH = spriteW * fit.aspect;
      const ax = bx + (0.5 - fit.cx) * spriteW, ay = by + (0.5 - fit.cy) * spriteH;
      d2 = Math.min(d2, (ax - x) * (ax - x) + (ay - y) * (ay - y));
    }
    if (d2 <= bestD2) { bestD2 = d2; best = e; }
  }
  return best;
};

/**
 * 寄りの包絡線(0..1)。カメラのパン(useGameLoop)と同じ smoothstep で in で 0→1、out で 1→0。
 * el=アテンション開始からの実時間ms、outStart=戻り始めの時刻(in+hold+cutin)。
 */
export const attentionZoomEnvelope = (el: number, inMs: number, outStart: number, outMs: number): number => {
  const sm = (t: number) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };
  const inK = sm(el / Math.max(1, inMs));
  const outK = el > outStart ? sm((el - outStart) / Math.max(1, outMs)) : 0;
  return inK * (1 - outK);
};

/**
 * 「等倍に見せる」アテンション(attention.zoomToUnity)の寄り倍率(社長指示2026-11-19「ステージ１の廃病院と二人組へのアテンション
 * カメラワーク、ちゃんと等倍にみえるようにカメラをズームして」)。base=今のカメラ倍率(寄りパンチ・アテンションの寄りを除いた積)。
 * 引いている(base<1)時だけ 1/base を返す=掛けると画面上の倍率がちょうど1.0。既に等倍以上なら 1(引きはしない)。
 */
/**
 * 等倍に見せる寄り(zoomToUnity)の効きの残り(1=全部効く・0=素のアテンションと同じ)。attention.unityRelease(0..1)が無ければ 1。
 * ステージ7のグレンの変身の場面の寄りを、そのまま出現の紹介へ継ぐ時だけ unityRelease を 0→1 へ動かす(useGameLoop)。
 */
export const attentionUnityKeep = (a: { unityRelease?: number }): number => {
  const r = a.unityRelease;
  if (r === undefined || !Number.isFinite(r)) return 1;
  return 1 - Math.max(0, Math.min(1, r));
};

export const attentionUnityZoom = (base: number): number => {
  if (!(base > 0) || base >= 1) return 1;
  return 1 / Math.max(0.05, base);
};
