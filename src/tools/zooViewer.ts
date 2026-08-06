// 敵モーション動物園(開発用ビューア・v0.25.2903)。
// **何もない空間で敵がうろうろするだけ**(社長指示「素直に何もないところにうろうろさせるだけの方がいい」)。
//
// 本編に一切依存しない: importするのは
//   ・enemyMotion.ts  = 歩行モーションの正本(pixiSceneと同じ表・同じ式=見た目が本編と一致する)
//   ・enemyUtils.ENEMY_STATS = 実際の移動速度・判定寸法
//   ・renderSpec.enemyFootBox = 実際の描画枠(本編と同じ大きさ比で並ぶ)
//   ・spriteLoader.spritePath = 内容ハッシュ付きのアセットURL
// 描画は DOM の <img> + CSS transform(image-rendering: pixelated)。16体なら60fpsで余裕。
import { enemyMotionSpecAt, enemyMotionPose, ENEMY_TURN_MS, type EnemyMotionSpec } from '../pixi/enemyMotion';
import { ENEMY_STATS } from '../utils/enemyUtils';
import { enemyFootBox } from '../pixi/renderSpec';
import { spritePath } from '../utils/spriteLoader';
import type { Enemy, EnemyType } from '../types/game';

// 並べる面々(見た目の名前で管理)。texはpublic/sprites/配下のファイル名。
// pumpkin/giantbatは全ステージ共通絵が無いので既定(森)のドット絵を使う。
const CAST: { type: EnemyType; variantIdx: number; tex: string; label: string }[] = [
  { type: 'bat', variantIdx: 0, tex: 'bat-male', label: '徘徊者 (bat・男)' },
  { type: 'bat', variantIdx: 1, tex: 'bat-female', label: '鳥頭骨 (bat・女)' },
  { type: 'skeleton', variantIdx: 0, tex: 'skeleton-female', label: '四つ這いの獣 (skeleton・女)' },
  { type: 'skeleton', variantIdx: 1, tex: 'skeleton-male', label: '四つ這いの獣 (skeleton・男)' },
  { type: 'zombie', variantIdx: 0, tex: 'zombie-common', label: '巨躯 (zombie)' },
  { type: 'plant', variantIdx: 0, tex: 'plant-common', label: '花の玉座 (plant)' },
  { type: 'ghost', variantIdx: 0, tex: 'ghost-common', label: '卵の花嫁 (ghost)' },
  { type: 'werewolf', variantIdx: 0, tex: 'werewolf-common', label: '自転車 (werewolf)' },
  { type: 'pumpkin', variantIdx: 0, tex: 'pumpkin-common', label: '蜘蛛の機械足 (pumpkin)' },
  { type: 'lich', variantIdx: 0, tex: 'lich-common', label: '機械死体 (lich)' },
  { type: 'screamer', variantIdx: 0, tex: 'screamer-common', label: '絶叫 (screamer)' },
  { type: 'hunter', variantIdx: 0, tex: 'hunter', label: '棺桶巨人 (hunter)' },
  { type: 'reaper', variantIdx: 0, tex: 'reaper-common', label: '襤褸外套 (reaper)' },
  { type: 'giantbat', variantIdx: 0, tex: 'atlas-px2/giantbat', label: '城ボス (giantbat)' },
  { type: 'lab-zombie-1', variantIdx: 0, tex: 'lab-zombie/lab-zombie-lv1-male', label: '研究所Lv1' },
  { type: 'lab-zombie-2', variantIdx: 0, tex: 'lab-zombie/lab-zombie-lv2-male', label: '研究所Lv2' },
  { type: 'lab-zombie-3', variantIdx: 0, tex: 'lab-zombie/lab-zombie-lv3', label: '研究所Lv3' },
];

const VIEW_SCALE = 1.7;   // 本編の描画枠(px)→画面(px)の倍率。全員同率=大きさの比は本編どおり
const MARGIN = 90;        // 画面端の折り返しマージン
const TURN_MIN_MS = 1800; // 進行方向を変えるまでの最短/最長
const TURN_MAX_MS = 5200;

interface ZooEntity {
  spec: EnemyMotionSpec;
  speed: number;          // 実速度(world px/s)×VIEW_SCALE
  el: HTMLImageElement;
  labelEl: HTMLDivElement;
  drawW: number; drawH: number;
  x: number; y: number;   // 足元(画面px)
  heading: number;
  nextTurnAt: number;
  seed: number;
  face: number; faceFrom: number; faceAt: number; // 振り向き(本編と同じENEMY_TURN_MSで捻る)
}

const field = document.getElementById('field')!;
const W = () => window.innerWidth;
const H = () => window.innerHeight;
const entities: ZooEntity[] = [];

CAST.forEach((c, i) => {
  const stats = ENEMY_STATS[c.type];
  // 本編と同じ描画枠(視覚スケール込み)を借りる。x/yは枠寸法の計算に関与しないのでダミー。
  const fb = enemyFootBox({ type: c.type, width: stats.width, height: stats.height, x: 0, y: 0 } as Enemy);
  const el = document.createElement('img');
  el.className = 'zoo-e';
  el.src = spritePath(c.tex);
  const labelEl = document.createElement('div');
  labelEl.className = 'zoo-label';
  labelEl.textContent = c.label;
  field.appendChild(el);
  field.appendChild(labelEl);
  const ent: ZooEntity = {
    spec: enemyMotionSpecAt(c.type, c.variantIdx),
    speed: stats.speed * VIEW_SCALE,
    el, labelEl, drawW: 0, drawH: 0,
    x: MARGIN + Math.random() * Math.max(1, W() - MARGIN * 2),
    y: MARGIN + 40 + Math.random() * Math.max(1, H() - MARGIN * 2 - 40),
    heading: Math.random() * Math.PI * 2,
    nextTurnAt: 0,
    seed: i * 1.7 + 0.3,
    face: 1, faceFrom: 1, faceAt: -1e9,
  };
  el.onload = () => {
    // 本編と同じ contain-fit: 枠(boxW×boxH)に収める倍率×表示倍率。
    const s = Math.min(fb.boxW / el.naturalWidth, fb.boxH / el.naturalHeight) * VIEW_SCALE;
    ent.drawW = el.naturalWidth * s;
    ent.drawH = el.naturalHeight * s;
    el.style.width = `${ent.drawW}px`;
  };
  entities.push(ent);
});

let prev = performance.now();
const tick = (now: number) => {
  const dt = Math.min(0.1, (now - prev) / 1000);
  prev = now;
  for (const ent of entities) {
    // ---- うろうろ(ランダム徘徊+画面端で反射) ----
    if (now >= ent.nextTurnAt) {
      ent.heading += (Math.random() - 0.5) * Math.PI * (0.6 + Math.random());
      ent.nextTurnAt = now + TURN_MIN_MS + Math.random() * (TURN_MAX_MS - TURN_MIN_MS);
    }
    const vx = Math.cos(ent.heading) * ent.speed;
    ent.x += vx * dt;
    ent.y += Math.sin(ent.heading) * ent.speed * 0.6 * dt; // 縦は少し潰す(見下ろし風)
    if (ent.x < MARGIN) { ent.x = MARGIN; ent.heading = Math.PI - ent.heading; }
    if (ent.x > W() - MARGIN) { ent.x = W() - MARGIN; ent.heading = Math.PI - ent.heading; }
    if (ent.y < MARGIN + 40) { ent.y = MARGIN + 40; ent.heading = -ent.heading; }
    if (ent.y > H() - MARGIN * 0.5) { ent.y = H() - MARGIN * 0.5; ent.heading = -ent.heading; }

    // ---- 本編と同じ歩行ポーズ(共有関数) ----
    const pose = enemyMotionPose(ent.spec, ent.seed, now, 1);

    // ---- 振り向き(本編と同じ: 横向き素材だけ・ENEMY_TURN_MSで捻る) ----
    let faceMul = 1;
    if (ent.spec.faceMove) {
      const toRight = ent.spec.faceRight ? 1 : -1;
      const want = vx > 12 ? toRight : vx < -12 ? -toRight : ent.face;
      if (want !== ent.face) { ent.faceFrom = ent.face; ent.face = want; ent.faceAt = now; }
      const t = Math.min(1, (now - ent.faceAt) / ENEMY_TURN_MS);
      faceMul = ent.faceFrom + (ent.face - ent.faceFrom) * t;
      if (faceMul === 0) faceMul = 0.02;
    }

    ent.el.style.zIndex = String(Math.round(ent.y));
    ent.el.style.transform =
      `translate(${ent.x - ent.drawW / 2}px, ${ent.y - ent.drawH - pose.bob}px) ` +
      `rotate(${pose.rot}rad) scale(${faceMul * pose.sqX}, ${pose.sqY})`;
    ent.labelEl.style.transform = `translate(${ent.x}px, ${ent.y + 4}px) translateX(-50%)`;
  }
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);
