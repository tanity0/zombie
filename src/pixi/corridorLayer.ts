// ステージ6(古い洋館・奥行き通路)の遠景レイヤー(Pixi本実装)。プレビュー
// (src/components/MansionCorridorPreview.tsx)の canvas2D 描画を PixiJS へ移植したもの。
// 投影式は純関数 src/utils/corridorProjection.ts を共有し、プレビューと同じ「見た目」を再現する。
//
// 描画のみ・ゲームロジック非干渉(CLAUDE.md 描画/ロジック分離): このクラスは store を一切書かず、
// pixiScene が corridorMode の間だけ update(travel, W, H, now) を毎フレーム呼ぶ。travel は
// pixiScene が player.y から算出して渡す(= CORRIDOR_TRAVEL_OFFSET - player.y)。
//
// 構成(奥→手前=下から上の重なり):
//   ① 黒背景(全画面)  ② 床(Mode-7メッシュ)  ③ 天井(Mode-7メッシュ)
//   ④ 遠方フェード(床/天井を闇へ沈める縦グラデ・叩き台)  ⑤ 壁灯(燭台+暖色グロー・加算)
//   ⑥ 奥壁(ステンドグラス窓)+月明かり(加算)  ⑦ 柱(左右ペア・被写界深度クロスフェード)
//
// 数値は全て叩き台=実機調整前提(プレビューと同値。ここで勝手に変えない・社長裁定で更新)。
// 天井定数はプレビュー v0.25.2098 の最新値(CEIL_SCALE=2.25 / フェード(s-0.02)/0.16)を採用。

import { Container, Mesh, MeshGeometry, Sprite, Texture, Rectangle, Assets } from 'pixi.js';
import { CORRIDOR_CFG, projectCorridorPillars } from '../utils/corridorProjection';

// --- 洋館素材のパス(プレビューと同じキャッシュバスター付き) ---------------------------------
// 同名ファイルを差し替えて更新するため、バージョン付き ?v= を必ず付ける(v0.25.2097 の教訓)。
const MV = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
const M = (f: string) => `${import.meta.env.BASE_URL}sprites/mansion/${f}?v=${encodeURIComponent(MV)}`;

// --- プレビュー由来の叩き台定数(意味はプレビューのコメント参照) --------------------------------
const CEIL_Y0_R = -0.75;   // d=0の天井ライン(画面高比)
const CEIL_SCALE = 2.25;   // 天井タイル拡大率(社長指示v0.25.2098: 1.5→2.25)。縦=リピート×倍率 / 横=中央1/倍率幅
const CANDLE_FLAME_YR = 0.027; // 炎の中心(素材高の上からの比率)
const GLOW_Y_R = 0.40;         // グロー中心の高さ(柱の高さ比・足元から)
const CANDLE_H_R = GLOW_Y_R / (1 - CANDLE_FLAME_YR); // ≒0.411(炎=グロー中心に一致する燭台高)
const BLUR_PAD = 24;       // 近距離ブラー版の余白(make-blur.mjsのpadと一致)
const FAR_BLUR_PAD = 40;   // 遠方ブラー版の余白(同)
const FLOOR_REPEAT = 520;  // 床テクスチャ縦1枚ぶんの前進量(world px)
const FLOOR_W_MULT = 1.0;  // 床の横幅=柱中心間ちょうど
const BACK_DEPTH = 4200;   // 奥壁(ステンドグラス窓)の固定奥行き
const BACK_ALPHA = 0.9;    // 奥壁の不透明度(距離フォグに沈めない=光る目標物)
// v0.25.2099: back.pngはシーン全体の絵で、壁の実体はキャンバス上18%〜下91.5%の帯だけ(上下は黒虚空)。
// ソース矩形でこの帯だけ切り出して描く。上下の黒虚空を含めない=柱の高さと乖離しない。
const BACK_SRC_TOP_R = 0.18;   // 壁コンテンツの上端(素材高比・計測値)
const BACK_SRC_BOT_R = 0.915;  // 壁コンテンツの下端(同)
const BACK_H_MULT = 1.40;      // 壁コンテンツの表示高=柱の高さ×この倍率(旧1.36はキャンバス全高基準)
const BACK_GLASS_CY = 0.45;    // ガラス(窓)中心の高さ(切り出し後コンテンツ高の上からの比率・月明かりのアンカー)
// 被写界深度クロスフェード(事前ブラー方式・ランタイムぼかしゼロ)。
const dofNear = (d: number): number => Math.min(0.9, Math.max(0, Math.min(1, (300 - d) / 400)));  // 手前: d=300で0 → d=-100で1
const dofFar = (d: number): number => Math.min(0.9, Math.max(0, Math.min(1, (d - 1000) / 1400))); // 遠方: d=1000で0 → d=2400で1

// Mode-7メッシュの分割数(多いほど滑らか・重いが1メッシュ描画なので安い)。叩き台。
const FLOOR_ROWS = 64;
const CEIL_ROWS = 48;

type MeshStrip = { mesh: Mesh; geom: MeshGeometry; positions: Float32Array; uvs: Float32Array };

export class CorridorLayer {
  // pixiScene が stage へ addChild する(screen座標=カメラ非依存)。
  readonly container = new Container();

  private loading = false;
  private ready = false;
  private tex: Record<string, Texture> = {};

  // 背景・メッシュ・遠方フェード
  private bg = new Sprite(Texture.WHITE);
  private floor: MeshStrip | null = null;
  private ceil: MeshStrip | null = null;
  private floorDark = new Sprite(Texture.WHITE); // 床の遠方を闇へ(横グラデ・叩き台=プレビューのper-row fade近似)
  private ceilDark = new Sprite(Texture.WHITE);  // 天井の遠方を闇へ
  private darkTexTop: Texture | null = null;    // 上=不透明黒→下=透明(床用)
  private darkTexBottom: Texture | null = null; // 上=透明→下=不透明黒(天井用)

  // 奥壁(ステンドグラス窓)+月明かり。素材の「壁の帯」だけを切り出したサブテクスチャを使う(v0.25.2099)。
  private backSharp = new Sprite(Texture.EMPTY);
  private backBlur = new Sprite(Texture.EMPTY);
  private backSharpFrame: Texture | null = null;   // back.png の壁帯だけ
  private backFarblurFrame: Texture | null = null; // back-farblur.png の壁帯だけ(padオフセット)
  private backSrcH = 1; // 切り出した帯の高さ(px・スケール計算に使う)
  private moonTex: Texture | null = null;
  private moonWindow = new Sprite(Texture.WHITE);
  private moonShaft = new Sprite(Texture.WHITE);
  private moonFloor = new Sprite(Texture.WHITE);

  // プール(柱の本数=CORRIDOR_CFG.count*2 に合わせて生成)。
  private glowTex: Texture | null = null; // 暖色の放射グラデ(壁灯)
  private pillarSharp: Sprite[] = [];
  private pillarBlur: Sprite[] = [];
  private candleSharp: Sprite[] = [];
  private candleBlur: Sprite[] = [];
  private glowMain: Sprite[] = [];
  private glowCore: Sprite[] = [];
  private glowFloor: Sprite[] = [];

  constructor() {
    this.container.eventMode = 'none';
    this.container.visible = false;

    // ① 黒背景(全画面)。プレビューの上=#0a0709 / 下=#0d0a0e はほぼ同色なので単色で代用(叩き台)。
    this.bg.tint = 0x0a0709;
    this.bg.anchor.set(0, 0);
    this.container.addChild(this.bg);

    // ④ 遠方フェード用の縦グラデを焼く。
    this.darkTexTop = bakeVerticalGradient(true);
    this.darkTexBottom = bakeVerticalGradient(false);
    this.floorDark.texture = this.darkTexTop;
    this.ceilDark.texture = this.darkTexBottom;
    this.floorDark.tint = 0x000000;
    this.ceilDark.tint = 0x000000;

    // ⑤ 壁灯の暖色グロー / 月明かりの冷色グローを焼く(1枚を使い回す=加算drawのみで安い)。
    this.glowTex = bakeRadialGlow([
      [0, 'rgba(255,214,150,0.9)'],
      [0.25, 'rgba(255,178,96,0.5)'],
      [0.6, 'rgba(255,140,60,0.16)'],
      [1, 'rgba(255,120,40,0)'],
    ]);
    this.moonTex = bakeRadialGlow([
      [0, 'rgba(200,220,255,0.85)'],
      [0.3, 'rgba(170,200,255,0.4)'],
      [0.65, 'rgba(140,180,255,0.12)'],
      [1, 'rgba(120,160,255,0)'],
    ]);
    for (const s of [this.moonWindow, this.moonShaft, this.moonFloor]) {
      s.texture = this.moonTex;
      s.anchor.set(0.5, 0.5);
      s.blendMode = 'add';
    }

    // 奥壁スプライト(足元アンカー)。
    this.backSharp.anchor.set(0.5, 1);
    this.backBlur.anchor.set(0.5, 1);
  }

  // 洋館素材の遅延ロード(初回 update で1度だけ走る)。既存の preload フローには乗せない
  // (=corridorMode に入った時だけ読む)。読み込み中/失敗中は bg のみ描く。
  private ensureLoaded(): void {
    if (this.loading || this.ready) return;
    this.loading = true;
    const names = [
      'floor', 'ceiling',
      'pillar-left', 'pillar-right',
      'pillar-left-blur', 'pillar-right-blur',
      'pillar-left-farblur', 'pillar-right-farblur',
      'back', 'back-farblur',
      'candle', 'candle-blur', 'candle-farblur',
    ];
    void Promise.all(names.map(async (n) => {
      try {
        const t = await Assets.load<Texture>(M(`${n}.png`));
        this.tex[n] = t;
      } catch { /* 個別失敗は無視(その素材だけ描かない) */ }
    })).then(() => {
      // 床/天井は縦リピート(Mode-7スクロール)=wrap repeat + linear。
      for (const n of ['floor', 'ceiling']) {
        const t = this.tex[n];
        if (t) { t.source.addressMode = 'repeat'; t.source.scaleMode = 'linear'; }
      }
      // 詳細イラスト調の素材は linear。
      for (const n of names) { const t = this.tex[n]; if (t) t.source.scaleMode = 'linear'; }
      this.buildBackFrames();
      this.buildMeshes();
      this.buildPools();
      this.ready = true;
    });
  }

  // 奥壁の「壁の帯」(黒虚空を除く)をソース矩形で切り出したサブテクスチャを作る(1度だけ・v0.25.2099)。
  private buildBackFrames(): void {
    const b = this.tex['back'];
    if (b && b.source) {
      const texW = b.source.width, texH = b.source.height;
      const srcY = texH * BACK_SRC_TOP_R;
      const srcH = texH * (BACK_SRC_BOT_R - BACK_SRC_TOP_R);
      this.backSrcH = srcH;
      this.backSharpFrame = new Texture({ source: b.source, frame: new Rectangle(0, srcY, texW, srcH) });
      const bf = this.tex['back-farblur'];
      if (bf && bf.source) {
        // ブラー版はpadぶん大きいキャンバス=同じ帯をpadオフセットで切り出す(src幅はシャープ幅texW)。
        this.backFarblurFrame = new Texture({ source: bf.source, frame: new Rectangle(FAR_BLUR_PAD, FAR_BLUR_PAD + srcY, texW, srcH) });
      }
    }
  }

  private buildMeshes(): void {
    if (this.floor || this.ceil) return;
    if (this.tex['floor']) {
      this.floor = makeStripMesh(this.tex['floor'], FLOOR_ROWS);
      // 床/天井は遠方フェード(floorDark/ceilDark)の下=先に addChild。
      this.container.addChildAt(this.floor.mesh, 1);
    }
    if (this.tex['ceiling']) {
      this.ceil = makeStripMesh(this.tex['ceiling'], CEIL_ROWS);
      this.container.addChildAt(this.ceil.mesh, this.floor ? 2 : 1);
    }
    // ④ 遠方フェードはメッシュの上・壁灯/柱の下。
    this.container.addChild(this.floorDark, this.ceilDark);
    // ⑥ 奥壁+月明かり(壁灯より上・柱より下の重なりでも良いが、プレビュー順=壁灯→奥壁→柱に合わせ、
    //    壁灯プールを先に addChild する buildPools の前に置く=奥壁は壁灯の上)。
    //    実際の z 調整は buildPools 側で行う。
  }

  private buildPools(): void {
    const n = CORRIDOR_CFG.count * 2; // 左右ペア×本数
    const mkPool = (arr: Sprite[], anchor: [number, number], additive: boolean, tex?: Texture) => {
      for (let i = 0; i < n; i++) {
        const s = new Sprite(tex ?? Texture.EMPTY);
        s.anchor.set(anchor[0], anchor[1]);
        if (additive) s.blendMode = 'add';
        s.visible = false;
        arr.push(s);
        this.container.addChild(s);
      }
    };
    // 重なり順(先=奥): 壁灯(燭台→グロー)→ 奥壁 → 柱。
    mkPool(this.candleSharp, [0.5, 1], false);
    mkPool(this.candleBlur, [0.5, 1], false);
    mkPool(this.glowMain, [0.5, 0.5], true);
    mkPool(this.glowCore, [0.5, 0.5], true);
    mkPool(this.glowFloor, [0.5, 0.5], true);
    // 奥壁(壁灯の上・柱の下)。
    this.container.addChild(this.backSharp, this.backBlur, this.moonWindow, this.moonShaft, this.moonFloor);
    // 柱(最前)。
    mkPool(this.pillarBlur, [0.5, 1], false);
    mkPool(this.pillarSharp, [0.5, 1], false);
  }

  resize(_W: number, _H: number): void {
    // メッシュ/スプライトの寸法は update で毎フレーム画面サイズから再計算するので、ここは何もしない
    // (寸法は W/H を直接引数で受ける)。
  }

  update(travel: number, W: number, H: number, now: number): void {
    this.ensureLoaded();
    // 背景は常に全画面。
    this.bg.width = W; this.bg.height = H;
    const horizonY = H * CORRIDOR_CFG.horizonYr;
    if (!this.ready) return;

    this.updateFloor(travel, W, H);
    this.updateCeiling(travel, W, H);
    // ④ 遠方フェード配置。
    this.floorDark.position.set(0, horizonY);
    this.floorDark.width = W; this.floorDark.height = H - horizonY;
    this.ceilDark.position.set(0, 0);
    this.ceilDark.width = W; this.ceilDark.height = horizonY;

    this.updateWallLamps(travel, W, H, now);
    this.updateBack(W, H);
    this.updatePillars(travel, W, H);
  }

  // 床(Mode-7): 画面の各行の奥行き d を逆算し、床テクスチャの該当行を台形メッシュへ写す。
  private updateFloor(travel: number, W: number, H: number): void {
    if (!this.floor) return;
    const { positions, uvs, geom } = this.floor;
    const horizonY = H * CORRIDOR_CFG.horizonYr;
    const footY0 = H * CORRIDOR_CFG.footYr;
    const denom = footY0 - horizonY;
    for (let i = 0; i < FLOOR_ROWS; i++) {
      const t = i / (FLOOR_ROWS - 1);
      const y = horizonY + 1 + (H - horizonY - 1) * t; // 消失点直下から画面下端まで
      const s = Math.max(0.02, (y - horizonY) / denom);
      const d = CORRIDOR_CFG.focal * (1 / s - 1);
      const fw = 2 * W * CORRIDOR_CFG.aisleHalfXr * s * FLOOR_W_MULT;
      const lx = W / 2 - fw / 2;
      const rx = W / 2 + fw / 2;
      // 前進で紋様が手前へ流れるようV軸を反転(叩き台・repeat wrap)。
      const v = -(d + travel) / FLOOR_REPEAT;
      const base = i * 4; // 2頂点×(x,y)
      positions[base + 0] = lx; positions[base + 1] = y;
      positions[base + 2] = rx; positions[base + 3] = y;
      uvs[base + 0] = 0; uvs[base + 1] = v;
      uvs[base + 2] = 1; uvs[base + 3] = v;
    }
    geom.getBuffer('aPosition').update();
    geom.getBuffer('aUV').update();
  }

  // 天井(Mode-7): 床の上下反転。消失点より上の帯に張る。横は中央1/CEIL_SCALE幅を使用。
  private updateCeiling(travel: number, W: number, H: number): void {
    if (!this.ceil) return;
    const { positions, uvs, geom } = this.ceil;
    const horizonY = H * CORRIDOR_CFG.horizonYr;
    const ceilY0 = H * CEIL_Y0_R;
    const denomC = horizonY - ceilY0;
    const ceilRepeat = FLOOR_REPEAT * CEIL_SCALE;
    const uL = 0.5 - 0.5 / CEIL_SCALE;
    const uR = 0.5 + 0.5 / CEIL_SCALE;
    for (let i = 0; i < CEIL_ROWS; i++) {
      const t = i / (CEIL_ROWS - 1);
      const y = horizonY * t; // 画面上端(手前)→ 消失点(奥)
      const s = Math.max(0.02, (horizonY - y) / denomC);
      const d = CORRIDOR_CFG.focal * (1 / s - 1);
      const fw = 2 * W * CORRIDOR_CFG.aisleHalfXr * s * FLOOR_W_MULT;
      const lx = W / 2 - fw / 2;
      const rx = W / 2 + fw / 2;
      const v = -(d + travel) / ceilRepeat;
      const base = i * 4;
      positions[base + 0] = lx; positions[base + 1] = y;
      positions[base + 2] = rx; positions[base + 3] = y;
      uvs[base + 0] = uL; uvs[base + 1] = v;
      uvs[base + 2] = uR; uvs[base + 3] = v;
    }
    geom.getBuffer('aPosition').update();
    geom.getBuffer('aUV').update();
  }

  // ⑤ 壁灯(柱と柱の中間・左右の壁ライン上): 柱の投影を半間隔ずらして流用=同じ循環に乗る。
  private updateWallLamps(travel: number, W: number, H: number, now: number): void {
    const lamps = projectCorridorPillars(travel + CORRIDOR_CFG.spacing / 2, W, H);
    const tSec = now / 1000;
    const candleTex = this.tex['candle'];
    for (let i = 0; i < this.candleSharp.length; i++) {
      const cs = this.candleSharp[i], cb = this.candleBlur[i];
      const gm = this.glowMain[i], gc = this.glowCore[i], gf = this.glowFloor[i];
      const m = lamps[i];
      const active = m && m.depth >= 60 && m.depth <= BACK_DEPTH - 300;
      if (!active) { for (const s of [cs, cb, gm, gc, gf]) s.visible = false; continue; }

      // 燭台(光源の実体・炎がグロー中心に一致する高さで床に立てる)。
      const hc = m.h * CANDLE_H_R;
      const wN = dofNear(m.depth), wF = dofFar(m.depth);
      const dofC = Math.max(wN, wF);
      if (candleTex && candleTex.width > 0) {
        const k = hc / candleTex.height;
        cs.texture = candleTex;
        cs.position.set(m.x, m.y);
        cs.scale.set(k);
        cs.alpha = m.fade * (1 - dofC);
        cs.visible = dofC < 0.98 && cs.alpha > 0.01;
        const blurTex = this.tex[wF > wN ? 'candle-farblur' : 'candle-blur'];
        const pad = wF > wN ? FAR_BLUR_PAD : BLUR_PAD;
        if (blurTex && blurTex.width > 0) {
          const kb = hc / candleTex.height; // 表示スケール(ブラー版はpadぶん大きい・contentは同寸)
          cb.texture = blurTex;
          cb.position.set(m.x, m.y + pad * kb); // padの内側に content があるので足元を下げて一致
          cb.scale.set(kb);
          cb.alpha = m.fade * dofC;
          cb.visible = dofC > 0.02 && cb.alpha > 0.01;
        } else cb.visible = false;
      } else { cs.visible = false; cb.visible = false; }

      // 火の揺らぎ(世界位置位相の2重サイン)。世界位置基準=循環しても連続。
      const worldPos = m.depth + travel;
      const flick = 0.78 + 0.14 * Math.sin(tSec * 7.3 + worldPos * 0.013) + 0.08 * Math.sin(tSec * 11.7 + worldPos * 0.021);
      const r = m.h * 0.22 * (0.96 + 0.06 * flick);
      const ly = m.y - m.h * GLOW_Y_R;
      const gt = this.glowTex!;
      const gd = gt.width || 256;
      // 本体グロー。
      gm.position.set(m.x, ly); gm.scale.set((r * 2) / gd); gm.alpha = m.fade * 0.85 * flick; gm.visible = true;
      // 明るい芯。
      gc.position.set(m.x, ly); gc.scale.set((r * 0.8) / gd); gc.alpha = Math.min(1, m.fade * 0.9 * flick); gc.visible = true;
      // 足元の照り返し(横長に潰した同グロー・弱め)。
      gf.position.set(m.x, m.y); gf.scale.set((r * 2.2) / gd, (r * 0.7) / gd); gf.alpha = m.fade * 0.3 * flick; gf.visible = true;
    }
  }

  // ⑥ 奥壁(ステンドグラス窓)+月明かり。壁の帯だけを切り出したサブテクスチャを常に遠方=farblurとクロスフェード。
  private updateBack(W: number, H: number): void {
    const bt = this.backSharpFrame;
    if (!bt || bt.width <= 0) { this.backSharp.visible = false; this.backBlur.visible = false;
      this.moonWindow.visible = this.moonShaft.visible = this.moonFloor.visible = false; return; }
    const s = CORRIDOR_CFG.focal / (CORRIDOR_CFG.focal + BACK_DEPTH);
    const horizonY = H * CORRIDOR_CFG.horizonYr;
    const footY = horizonY + (H * CORRIDOR_CFG.footYr - horizonY) * s;
    const bh = H * CORRIDOR_CFG.pillarHr * s * BACK_H_MULT; // 壁コンテンツの表示高(柱の高さ基準)
    const bw = (bt.width / this.backSrcH) * bh;             // 幅=切り出し後アスペクト従属=歪みなし
    const k = bh / this.backSrcH;                          // srcH*k = bh
    const w = dofFar(BACK_DEPTH);
    // シャープ版(足元アンカー)。
    this.backSharp.texture = bt;
    this.backSharp.position.set(W / 2, footY);
    this.backSharp.scale.set(k);
    this.backSharp.alpha = BACK_ALPHA * (1 - w);
    this.backSharp.visible = this.backSharp.alpha > 0.01;
    // 強ブラー版(同じ帯をpadオフセットで切り出し済み=位置/スケールはシャープと同一)。
    if (this.backFarblurFrame) {
      this.backBlur.texture = this.backFarblurFrame;
      this.backBlur.position.set(W / 2, footY);
      this.backBlur.scale.set(k);
      this.backBlur.alpha = BACK_ALPHA * w;
      this.backBlur.visible = this.backBlur.alpha > 0.01;
    } else this.backBlur.visible = false;
    // 月明かり: ①窓グロー ②手前下への光条 ③床の光溜まり(すべて切り出し後の bh/bw 基準)。
    const by = footY - bh;
    const glassCy = by + bh * BACK_GLASS_CY;
    const mSize = this.moonTex!.width || 256;
    this.moonWindow.position.set(W / 2, glassCy);
    this.moonWindow.scale.set((bh * 0.6) / mSize);
    this.moonWindow.alpha = 0.55; this.moonWindow.visible = true;
    // 光条: プレビュー drawImage(top-left=(W/2-bw*0.45, glassCy), size=(bw*0.9, bh*1.6)) → 中心へ換算。
    this.moonShaft.position.set(W / 2, glassCy + bh * 0.8);
    this.moonShaft.scale.set((bw * 0.9) / mSize, (bh * 1.6) / mSize);
    this.moonShaft.alpha = 0.2; this.moonShaft.visible = true;
    // 床の光溜まり: top-left=(W/2-bw*0.7, footY-bh*0.12), size=(bw*1.4, bh*0.32) → 中心へ換算。
    this.moonFloor.position.set(W / 2, footY + bh * 0.04);
    this.moonFloor.scale.set((bw * 1.4) / mSize, (bh * 0.32) / mSize);
    this.moonFloor.alpha = 0.26; this.moonFloor.visible = true;
  }

  // ⑦ 柱(奥→手前)。距離フェードは alpha、被写界深度はシャープ+ブラーのクロスフェード。
  private updatePillars(travel: number, W: number, H: number): void {
    const pillars = projectCorridorPillars(travel, W, H);
    for (let i = 0; i < this.pillarSharp.length; i++) {
      const sharp = this.pillarSharp[i], blur = this.pillarBlur[i];
      const p = pillars[i];
      if (!p) { sharp.visible = false; blur.visible = false; continue; }
      const sharpTex = this.tex[p.side < 0 ? 'pillar-left' : 'pillar-right'];
      if (!sharpTex || sharpTex.width <= 0) { sharp.visible = false; blur.visible = false; continue; }
      const wN = dofNear(p.depth), wF = dofFar(p.depth);
      const dof = Math.max(wN, wF);
      const useFar = wF > wN;
      const k = p.h / sharpTex.height;
      // シャープ版(足元アンカー)。
      sharp.texture = sharpTex;
      sharp.position.set(p.x, p.y);
      sharp.scale.set(k);
      sharp.alpha = p.fade * (1 - dof);
      sharp.visible = dof < 0.98 && sharp.alpha > 0.01;
      // ブラー版(padぶん大きい・content同寸=足元をpad分下げて一致)。
      const suffix = useFar ? 'farblur' : 'blur';
      const blurTex = this.tex[`pillar-${p.side < 0 ? 'left' : 'right'}-${suffix}`];
      const pad = useFar ? FAR_BLUR_PAD : BLUR_PAD;
      if (blurTex && blurTex.width > 0) {
        blur.texture = blurTex;
        blur.position.set(p.x, p.y + pad * k);
        blur.scale.set(k);
        blur.alpha = p.fade * dof;
        blur.visible = dof > 0.02 && blur.alpha > 0.01;
      } else blur.visible = false;
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
    // 自前で焼いたテクスチャは source ごと破棄。
    for (const t of [this.darkTexTop, this.darkTexBottom, this.glowTex, this.moonTex]) {
      try { t?.destroy(true); } catch { /* ignore */ }
    }
    // 切り出しフレームは Assets キャッシュの source を共有するので source は残す(false)。
    for (const t of [this.backSharpFrame, this.backFarblurFrame]) {
      try { t?.destroy(false); } catch { /* ignore */ }
    }
  }
}

// --- ヘルパ -------------------------------------------------------------------------------------

// 台形ストリップ用のメッシュ(rows行×2列)を作る。positions/uvs は毎フレーム書き換える(参照を返す)。
function makeStripMesh(texture: Texture, rows: number): MeshStrip {
  const positions = new Float32Array(rows * 2 * 2); // 各行2頂点×(x,y)
  const uvs = new Float32Array(rows * 2 * 2);
  const indices = new Uint32Array((rows - 1) * 6);
  for (let i = 0; i < rows - 1; i++) {
    const tl = i * 2, tr = i * 2 + 1, bl = (i + 1) * 2, br = (i + 1) * 2 + 1;
    const o = i * 6;
    indices[o + 0] = tl; indices[o + 1] = tr; indices[o + 2] = bl;
    indices[o + 3] = tr; indices[o + 4] = br; indices[o + 5] = bl;
  }
  const geom = new MeshGeometry({ positions, uvs, indices });
  const mesh = new Mesh({ geometry: geom, texture });
  mesh.eventMode = 'none';
  return { mesh, geom, positions, uvs };
}

// 縦の線形グラデ(黒→透明)を焼いて Texture 化する。opaqueAtTop=true: 上が不透明黒・下が透明。
function bakeVerticalGradient(opaqueAtTop: boolean): Texture {
  const cv = document.createElement('canvas');
  cv.width = 4; cv.height = 256;
  const g = cv.getContext('2d');
  if (g) {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    const a0 = opaqueAtTop ? 1 : 0;
    const a1 = opaqueAtTop ? 0 : 1;
    grad.addColorStop(0, `rgba(0,0,0,${a0})`);
    grad.addColorStop(1, `rgba(0,0,0,${a1})`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
  }
  return Texture.from(cv);
}

// 放射グラデ(中心→外へフェード)を焼いて Texture 化する(加算合成で使う光素材)。
function bakeRadialGlow(stops: [number, string][]): Texture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    for (const [o, c] of stops) grad.addColorStop(o, c);
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
  }
  return Texture.from(cv);
}
