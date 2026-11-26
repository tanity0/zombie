// 雨の場面の雷の描画(社長指示2026-11-26「雷も入れて」)。★描くだけ・演出だけ(当たり判定もダメージも持たない=派手さの絵)。
// いつ落ちるか・明滅の曲線・稲妻の形・雷鳴の鳴らし方は utils/weatherThunder.ts(純関数)。
//
// 部品(どれも使い回し・新しい素材ファイルは無い=コードで焼く/描く):
//   1. 空の稲光 … 画面の上から地平線までの縦のグラデーション1枚と、稲妻の根元の柔らかい光だまり1枚(どちらも加算)。
//      画面の層(世界の手前)に置く=遠景の絵が空を塗っていても必ず光る(森の木も一緒に照らされる)。
//   2. 稲妻の筋 … Graphics 1枚(加算)。遠景の手前・世界の奥(worldGroup の奥)に置く=手前の森・地面に隠れ、空にだけ走る。
//      落ちた瞬間に1回だけ描き直し、あとは濃さだけ動かす(毎フレームの作り直しはしない)。
//   3. 世界の照り返し … 画面いっぱいの白1枚(加算・薄く)。地面・敵・プレイヤーに一瞬冷たい白が当たる。
//      赤い予告・弾が読めなくならない薄さ(加算なので赤は赤のまま明るくなるだけ)。
// 影を落とす光は足さない(このプロジェクトで高いのは投影影を落とす光だけ=CLAUDE.md の実測)。

import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { getSoftGlowTexture } from './lighting';
import {
  planThunderStrike, thunderNextGapMs, thunderFlash, thunderBoltAlpha, thunderBoltShape, thunderDurationMs, thunderSoundCue,
  THUNDER_FIRST_MS_MIN, THUNDER_FIRST_MS_MAX, THUNDER_RETRY_MS_MIN, THUNDER_RETRY_MS_MAX, THUNDER_MIN_RAIN,
  type ThunderStrike, type ThunderSoundCue,
} from '../utils/weatherThunder';

/** 空の稲光の色・濃さ(加算)。 */
const SKY_TINT = 0xcfdcff;
const SKY_ALPHA = 0.5;
/** 稲妻の根元の空の光だまり。 */
const POOL_TINT = 0xdde6ff;
const POOL_ALPHA = 0.45;
/** 稲妻の芯と暈の色・太さ(画面 px。近い雷ほど太い)。 */
const BOLT_CORE = 0xf4f8ff;
const BOLT_GLOW = 0xa9c2ff;
const BOLT_CORE_W_NEAR = 2.6, BOLT_CORE_W_FAR = 1.4;
const BOLT_GLOW_W_NEAR = 10, BOLT_GLOW_W_FAR = 5;
/** 世界の照り返し(画面いっぱいの冷たい白・加算)。控えめ〜中程度。 */
const WORLD_TINT = 0xdfe8ff;
const WORLD_ALPHA = 0.15;

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

let skyGradTex: Texture | null = null;
/** 空の稲光の縦グラデーション(上ほど明るく、地平線で 0)。1回だけ焼く。 */
const getSkyGradTexture = (): Texture => {
  if (skyGradTex) return skyGradTex;
  const c = document.createElement('canvas');
  c.width = 4; c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.6)');
  g.addColorStop(0.85, 'rgba(255,255,255,0.25)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 128);
  skyGradTex = Texture.from(c);
  return skyGradTex;
};

export interface ThunderHost {
  /** 演出の時計(ms・Date.now 系)。 */
  now: number;
  /** 雨が降っている(雨の層が出ている)か。 */
  raining: boolean;
  /** 今の雨の強さ(utils/weatherWet の時刻表の値)。 */
  rainLevel: number;
  /** 新しく落とせない場面(ボスの出現・カットイン・アテンション・会話・一時停止)。鳴るはずの雷鳴もこの間は鳴らさない。 */
  blocked: boolean;
  /** 画面の寸法(stage の座標)。 */
  screenW: number;
  screenH: number;
  /** 地平線(空と森の境)の y(stage の座標)。 */
  horizonY: number;
}

export class WeatherThunderLayer {
  /** 稲妻の層(遠景の手前・worldGroup の奥に置く)。 */
  readonly skyRoot = new Container();
  /** 画面の層に置く物(空の稲光・光だまり・世界の照り返し)。 */
  readonly frontRoot = new Container();
  private worldLight = new Sprite(Texture.WHITE);
  private sky = new Sprite(getSkyGradTexture());
  private pool = new Sprite(getSoftGlowTexture());
  private bolt = new Graphics();
  private nextAt = -1;
  private strike: ThunderStrike | null = null;
  private strikeAt = 0;
  private sound: { at: number; cue: ThunderSoundCue } | null = null;
  private drawnFor: ThunderStrike | null = null;
  /** 雷鳴を鳴らす口(PixiStage が audio へ繋ぐ。無ければ鳴らさない)。 */
  onSound: ((cue: ThunderSoundCue) => void) | null = null;

  constructor() {
    this.skyRoot.label = 'weatherThunderSky';
    this.skyRoot.eventMode = 'none';
    for (const sp of [this.sky, this.pool, this.worldLight]) { sp.blendMode = 'add'; sp.visible = false; sp.eventMode = 'none'; }
    this.sky.tint = SKY_TINT;
    this.pool.tint = POOL_TINT;
    this.pool.anchor.set(0.5);
    this.worldLight.tint = WORLD_TINT;
    this.worldLight.label = 'weatherThunderWorld';
    this.bolt.blendMode = 'add';
    this.bolt.visible = false;
    this.skyRoot.addChild(this.bolt);
    this.frontRoot.label = 'weatherThunderFront';
    this.frontRoot.eventMode = 'none';
    this.frontRoot.addChild(this.worldLight, this.sky, this.pool);
  }

  /** 開発用: 今すぐ落とす(ヘッドレスの撮影)。 */
  debugStrike(now: number, near = true): void {
    this.begin(now, near ? 0.05 : 0.85);
  }

  private begin(now: number, forceDist?: number): void {
    const s = planThunderStrike(Math.random);
    if (forceDist !== undefined) { s.dist = forceDist; s.bolt = true; }
    this.strike = s;
    this.strikeAt = now;
    const cue = thunderSoundCue(s, Math.random);
    this.sound = { at: now + cue.delayMs, cue };
  }

  sync(h: ThunderHost): void {
    const now = h.now;
    if (!h.raining) {
      this.nextAt = -1;
      this.sound = null;
    } else {
      if (this.nextAt < 0) this.nextAt = now + rand(THUNDER_FIRST_MS_MIN, THUNDER_FIRST_MS_MAX);
      if (now - this.nextAt > 60000) this.nextAt = now + rand(THUNDER_RETRY_MS_MIN, THUNDER_RETRY_MS_MAX); // タブ復帰で一気に落とさない
      if (now >= this.nextAt) {
        if (h.blocked || h.rainLevel < THUNDER_MIN_RAIN || this.strike) {
          this.nextAt = now + rand(THUNDER_RETRY_MS_MIN, THUNDER_RETRY_MS_MAX);
        } else {
          this.begin(now);
          this.nextAt = now + thunderNextGapMs(Math.random);
        }
      }
    }
    if (this.sound && now >= this.sound.at) {
      if (!h.blocked) this.onSound?.(this.sound.cue); // ボスの出現・アテンション等に重なった雷鳴は鳴らさない
      this.sound = null;
    }
    const s = this.strike;
    const t = now - this.strikeAt;
    if (!s || t > thunderDurationMs(s)) {
      this.strike = null;
      this.sky.visible = false; this.pool.visible = false; this.bolt.visible = false; this.worldLight.visible = false;
      return;
    }
    const near = 1 - s.dist;
    const f = thunderFlash(t, s);
    const hy = Math.max(h.screenH * 0.12, Math.min(h.screenH * 0.85, h.horizonY));
    // 1. 空の稲光(上ほど明るい・地平線で消える)。
    this.sky.visible = f > 0.004;
    this.sky.position.set(0, 0);
    this.sky.width = h.screenW;
    this.sky.height = hy * 1.08;
    this.sky.alpha = SKY_ALPHA * f;
    // 2. 稲妻の筋(落ちた瞬間に1回だけ描く)と根元の光だまり。
    const ba = thunderBoltAlpha(t, s);
    if (s.bolt) {
      const top = hy * (0.02 + 0.3 * s.dist); // 遠い雷は空の低い所だけを走る
      const bottom = hy; // 地平線まで(手前の森に隠れる所は隠れる)
      const x0 = s.boltX * h.screenW;
      if (this.drawnFor !== s) {
        this.drawnFor = s;
        const shape = thunderBoltShape(s.seed, x0, top, bottom, h.screenW);
        const cw = BOLT_CORE_W_FAR + (BOLT_CORE_W_NEAR - BOLT_CORE_W_FAR) * near;
        const gw = BOLT_GLOW_W_FAR + (BOLT_GLOW_W_NEAR - BOLT_GLOW_W_FAR) * near;
        const g = this.bolt;
        g.clear();
        const line = (pts: number[], w: number, color: number, alpha: number) => {
          g.moveTo(pts[0], pts[1]);
          for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
          g.stroke({ width: w, color, alpha, join: 'round', cap: 'round' });
        };
        line(shape.main, gw, BOLT_GLOW, 0.35);
        for (const b of shape.branches) line(b, gw * 0.55, BOLT_GLOW, 0.25);
        line(shape.main, cw, BOLT_CORE, 1);
        for (const b of shape.branches) line(b, cw * 0.6, BOLT_CORE, 0.8);
      }
      this.bolt.visible = ba > 0.004;
      this.bolt.alpha = ba;
      this.pool.visible = f > 0.004;
      this.pool.position.set(x0, top + (bottom - top) * 0.3);
      const ps = h.screenW * (0.55 + 0.45 * near);
      this.pool.width = ps; this.pool.height = ps * 0.8;
      this.pool.alpha = POOL_ALPHA * f;
    } else {
      this.bolt.visible = false;
      this.pool.visible = false;
    }
    // 3. 世界の照り返し(画面いっぱい・薄く)。
    this.worldLight.visible = f > 0.004;
    this.worldLight.width = h.screenW;
    this.worldLight.height = h.screenH;
    this.worldLight.alpha = WORLD_ALPHA * f;
  }

  destroy(): void {
    if (!this.skyRoot.destroyed) this.skyRoot.destroy({ children: true });
    if (!this.frontRoot.destroyed) this.frontRoot.destroy({ children: true });
  }
}
