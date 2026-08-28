// 敵モーション動物園(開発用ビューア・v0.25.2903 / タブ化 v0.25.2911)。
// **何もない空間で敵がうろうろするだけ**(社長指示「素直に何もないところにうろうろさせるだけ」)。
// タブ: 雑魚 / ステージ(城ボスのステージ別絵) / ゲート(天使6体) / 裏(裏ボス4体+idol)。
//
// 本編に一切依存しない: importするのは
//   ・enemyMotion.ts  = 歩行モーションの正本(pixiSceneと同じ表・同じ式=雑魚と城ボスは本編と一致)
//   ・enemyUtils.ENEMY_STATS = 実際の移動速度・判定寸法
//   ・renderSpec.enemyFootBox = 実際の描画枠(雑魚は本編と同じ大きさ比で並ぶ)
//   ・spriteLoader.spritePath = 内容ハッシュ付きのアセットURL
// 描画は DOM の <img> + CSS transform(image-rendering: pixelated)。
//
// ★ボスの注意: 本編のボス(裏/天使/idol)は専用コントローラ駆動で歩行モーションの対象外。
// ここで付けている動きは**鑑賞用の仮モーション**(絵の雰囲気を見るためのもの)で本編には影響しない。
// 城ボス(ステージタブ)だけは GIANTBAT_MOTION_BY_BACKDROP=本編と同じ表を読む。
import {
  enemyMotionSpecAt, enemyMotionPose, ENEMY_TURN_MS, GIANTBAT_MOTION_BY_BACKDROP,
  type EnemyMotionSpec,
} from '../pixi/enemyMotion';
import { ENEMY_STATS } from '../utils/enemyUtils';
import { enemyFootBox } from '../pixi/renderSpec';
import { spritePath } from '../utils/spriteLoader';
import type { Enemy, EnemyType } from '../types/game';

interface CastEntry {
  tex: string;            // public/sprites/ 配下のファイル名
  label: string;
  type?: EnemyType;       // 雑魚: ENEMY_STATS/enemyFootBox/モーション表を引くキー
  variantIdx?: number;    // batの男女枝
  spec?: EnemyMotionSpec; // 指定があれば表より優先(ボスの鑑賞用モーション)
  targetH?: number;       // 指定があれば「表示高さを固定」(ボス=本編は帯基準サイズのため枠が使えない)
  speed?: number;         // 指定があれば移動速度を上書き(world px/s)
}

// 鑑賞用の仮モーション(ボス向け・本編非接続)。
const B_WALK: EnemyMotionSpec = { kind: 'walk', bobPx: 1.2, rockRad: 0.028, sqAmp: 0.025, strideHz: 1.4, uneven: 0.3, faceMove: false };
const B_HEAVY: EnemyMotionSpec = { kind: 'heavy', bobPx: 1.6, rockRad: 0.030, sqAmp: 0.035, strideHz: 1.1, uneven: 0.25, faceMove: false };
const B_HOVER: EnemyMotionSpec = { kind: 'hover', bobPx: 2.4, rockRad: 0.014, sqAmp: 0, strideHz: 0.5, uneven: 0, faceMove: false };

const ZAKO: CastEntry[] = [
  { type: 'bat', variantIdx: 0, tex: 'bat-male', label: '徘徊者 (bat・男)' },
  { type: 'bat', variantIdx: 1, tex: 'bat-female', label: '鳥頭骨 (bat・女)' },
  { type: 'skeleton', variantIdx: 0, tex: 'skeleton-female', label: '四つ這いの獣 (skeleton・女)' },
  { type: 'skeleton', variantIdx: 1, tex: 'skeleton-male', label: '四つ這いの獣 (skeleton・男)' },
  { type: 'zombie', tex: 'zombie-common', label: '巨躯 (zombie)' },
  { type: 'plant', tex: 'plant-common', label: '花の玉座 (plant)' },
  { type: 'ghost', tex: 'ghost-common', label: '卵の花嫁 (ghost)' },
  { type: 'werewolf', tex: 'werewolf-common', label: '自転車 (werewolf)' },
  { type: 'pumpkin', tex: 'pumpkin-common', label: '蜘蛛の機械足 (pumpkin)' },
  { type: 'driller', tex: 'driller-common', label: 'ドリル腕の作業員 (driller)' },
  { type: 'logger', tex: 'reaper-common', label: '伐採人=チェーンソーの死神 (logger)' },
  { type: 'lich', tex: 'lich-common', label: '機械死体 (lich)' },
  { type: 'screamer', tex: 'screamer-common', label: '絶叫 (screamer)' },
  { type: 'hunter', tex: 'hunter', label: '棺桶巨人 (hunter)' },
  { type: 'reaper', tex: 'reaper-common', label: '襤褸外套 (reaper)' },
  { type: 'lab-zombie-1', tex: 'lab-zombie/lab-zombie-lv1-male', label: '研究所Lv1' },
  { type: 'lab-zombie-2', tex: 'lab-zombie/lab-zombie-lv2', label: '研究所Lv2' },
  { type: 'lab-zombie-3', tex: 'lab-zombie/lab-zombie-lv3', label: '研究所Lv3' },
];

// 城ボス: ステージ別の絵と、本編と同じステージ別モーション(GIANTBAT_MOTION_BY_BACKDROP)。
const giantbatDefault = enemyMotionSpecAt('giantbat', 0);
const STAGE_BOSSES: CastEntry[] = [
  { tex: 'atlas-px2/giantbat', label: '馬ぐるま (ステージ1)', spec: giantbatDefault, targetH: 300, speed: 55 },
  { tex: 'stage3-enemies/giantbat', label: '群体の四足獣 (ステージ3)', spec: giantbatDefault, targetH: 300, speed: 55 },
  { tex: 'stage4-enemies/giantbat', label: '凍てつく巨躯 (ステージ4)', spec: GIANTBAT_MOTION_BY_BACKDROP.snow, targetH: 300, speed: 55 },
  { tex: 'stage5-enemies/giantbat', label: '兵士の融合体 (ステージ5)', spec: GIANTBAT_MOTION_BY_BACKDROP.stage5, targetH: 320, speed: 55 },
  { tex: 'glen-boss', label: 'グレン (ステージ7)', spec: GIANTBAT_MOTION_BY_BACKDROP.stage7, targetH: 340, speed: 50 },
];

const GATE_BOSSES: CastEntry[] = [
  { tex: 'miguel', label: 'ミゲル', spec: B_WALK, targetH: 300, speed: 60 },
  { tex: 'jibril', label: 'ジブリル', spec: B_WALK, targetH: 300, speed: 55 },
  { tex: 'rafi', label: 'ラフィ', spec: B_WALK, targetH: 300, speed: 60 },
  { tex: 'uri', label: 'ウリ', spec: B_WALK, targetH: 300, speed: 60 },
  { tex: 'suriel', label: 'スリィエル', spec: B_HOVER, targetH: 320, speed: 40 },
  { tex: 'acrasiel', label: 'アクラシエル', spec: B_HOVER, targetH: 320, speed: 0 },
];

const HIDDEN_BOSSES: CastEntry[] = [
  { tex: 'mimir', label: 'ミーミル', spec: B_HOVER, targetH: 340, speed: 35 },
  { tex: 'jormungand', label: 'ヨルムンガルド', spec: B_HOVER, targetH: 340, speed: 45 },
  { tex: 'skadi', label: 'スカジ', spec: B_HEAVY, targetH: 320, speed: 45 },
  { tex: 'thor', label: 'トール', spec: B_WALK, targetH: 300, speed: 60 },
  { tex: 'idol', label: '偶像', spec: B_WALK, targetH: 280, speed: 70 },
  // PACING_PUZZLE.md §10(EXボス「フィル(変異体)」・バッチ1): isHiddenBoss編入=このタブが同じ扱い。
  { tex: 'phill', label: 'フィル(変異体)', spec: B_HOVER, targetH: 320, speed: 40 },
];

const TABS: { key: string; label: string; cast: CastEntry[] }[] = [
  { key: 'zako', label: '雑魚', cast: ZAKO },
  { key: 'stage', label: 'ステージ', cast: STAGE_BOSSES },
  { key: 'gate', label: 'ゲート', cast: GATE_BOSSES },
  { key: 'hidden', label: '裏', cast: HIDDEN_BOSSES },
];

const VIEW_SCALE = 1.7;   // 雑魚: 本編の描画枠(px)→画面(px)の倍率
const MARGIN = 90;
const TURN_MIN_MS = 1800;
const TURN_MAX_MS = 5200;

interface ZooEntity {
  spec: EnemyMotionSpec;
  speed: number;
  el: HTMLImageElement;
  labelEl: HTMLDivElement;
  drawW: number; drawH: number;
  x: number; y: number;
  heading: number;
  nextTurnAt: number;
  seed: number;
  face: number; faceFrom: number; faceAt: number;
}

const field = document.getElementById('field')!;
const tabsEl = document.getElementById('tabs')!;
const W = () => window.innerWidth;
const H = () => window.innerHeight;
let entities: ZooEntity[] = [];

const buildTab = (cast: CastEntry[]): void => {
  field.innerHTML = '';
  entities = [];
  cast.forEach((c, i) => {
    const el = document.createElement('img');
    el.className = 'zoo-e';
    el.src = spritePath(c.tex);
    const labelEl = document.createElement('div');
    labelEl.className = 'zoo-label';
    labelEl.textContent = c.label;
    field.appendChild(el);
    field.appendChild(labelEl);
    const stats = c.type ? ENEMY_STATS[c.type] : undefined;
    const ent: ZooEntity = {
      spec: c.spec ?? enemyMotionSpecAt(c.type ?? 'bat', c.variantIdx ?? 0),
      speed: (c.speed ?? stats?.speed ?? 40) * VIEW_SCALE,
      el, labelEl, drawW: 0, drawH: 0,
      x: MARGIN + Math.random() * Math.max(1, W() - MARGIN * 2),
      y: MARGIN + 40 + Math.random() * Math.max(1, H() - MARGIN * 2 - 40),
      heading: Math.random() * Math.PI * 2,
      nextTurnAt: 0,
      seed: i * 1.7 + 0.3,
      face: 1, faceFrom: 1, faceAt: -1e9,
    };
    el.onload = () => {
      let s: number;
      if (c.targetH !== undefined) {
        // ボス: 本編は帯(AABB)基準の特殊サイズ計算のため枠が流用できない→表示高さ固定で鑑賞。
        s = c.targetH / el.naturalHeight;
      } else {
        // 雑魚: 本編と同じ contain-fit(枠は enemyFootBox=判定×視覚スケール)。
        const st = ENEMY_STATS[c.type!];
        const fb = enemyFootBox({ type: c.type!, width: st.width, height: st.height, x: 0, y: 0 } as Enemy);
        s = Math.min(fb.boxW / el.naturalWidth, fb.boxH / el.naturalHeight) * VIEW_SCALE;
      }
      ent.drawW = el.naturalWidth * s;
      ent.drawH = el.naturalHeight * s;
      el.style.width = `${ent.drawW}px`;
    };
    entities.push(ent);
  });
};

// タブバー
let activeKey = 'zako';
const renderTabs = (): void => {
  tabsEl.innerHTML = '';
  for (const t of TABS) {
    const b = document.createElement('button');
    b.textContent = t.label;
    if (t.key === activeKey) b.className = 'on';
    b.onclick = () => { activeKey = t.key; buildTab(t.cast); renderTabs(); };
    tabsEl.appendChild(b);
  }
};
renderTabs();
buildTab(ZAKO);

let prev = performance.now();
const tick = (now: number) => {
  const dt = Math.min(0.1, (now - prev) / 1000);
  prev = now;
  for (const ent of entities) {
    // ---- うろうろ(ランダム徘徊+画面端で反射) ----
    if (ent.speed > 0) {
      if (now >= ent.nextTurnAt) {
        ent.heading += (Math.random() - 0.5) * Math.PI * (0.6 + Math.random());
        ent.nextTurnAt = now + TURN_MIN_MS + Math.random() * (TURN_MAX_MS - TURN_MIN_MS);
      }
      ent.x += Math.cos(ent.heading) * ent.speed * dt;
      ent.y += Math.sin(ent.heading) * ent.speed * 0.6 * dt; // 縦は少し潰す(見下ろし風)
      if (ent.x < MARGIN) { ent.x = MARGIN; ent.heading = Math.PI - ent.heading; }
      if (ent.x > W() - MARGIN) { ent.x = W() - MARGIN; ent.heading = Math.PI - ent.heading; }
      if (ent.y < MARGIN + 40) { ent.y = MARGIN + 40; ent.heading = -ent.heading; }
      if (ent.y > H() - MARGIN * 0.5) { ent.y = H() - MARGIN * 0.5; ent.heading = -ent.heading; }
    }
    const vx = ent.speed > 0 ? Math.cos(ent.heading) * ent.speed : 0;

    // ---- 歩行ポーズ(共有関数=雑魚と城ボスは本編と同じ式) ----
    const pose = enemyMotionPose(ent.spec, ent.seed, now, 1);

    // ---- 振り向き(横向き素材だけ・ENEMY_TURN_MSで捻る) ----
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
