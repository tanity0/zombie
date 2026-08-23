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
import { CORRIDOR_CFG, projectCorridorPillars, type CorridorConfig } from '../utils/corridorProjection';

// ゲーム内背景用の幾何(v0.25.2113): ?corridor=1プレビューはfootYr=1.55(視点が低い=近景が画面外まで
// 続く)だが、ゲームはm0カメラ=プレイヤーが画面中央(0.5H)に立つ。中央の行でカーペット半幅が
// 移動クランプ(±170world px)を覆うs≒0.45になるようfootYrを再調整(footYr=horizonYr+(0.5-horizonYr)/0.45)。
// 消失点はv0.25.2138(社長指示「もう少し上に」)で0.30→0.26へ。footYrも上式で連動(0.744→0.793)=
// プレイヤー行のカーペット幅とクランプの一致は不変。プレビュー側のCORRIDOR_CFGは不変。
// PACING_PUZZLE.md §10-20#5/#11(EX舞台の洋館通路化): pixiScene.tsが「プレイヤー足元の画面Y」の
// 支点を計算する時にfootYrを写さず参照できるようexportする(値を2箇所に持たない=ズレ防止)。
export const CFG: CorridorConfig = { ...CORRIDOR_CFG, horizonYr: 0.26, footYr: 0.793 };
// 横移動対応(v0.25.2113): 通路はworld x=0に固定し、pixiSceneがカメラx分だけcontainerを逆シフトする。
// その際に黒背景が切れないよう左右に持たせる余白(px)。クランプ±170×ズーム+余裕。
export const CORRIDOR_BG_X_OVERSCAN = 420;
// ★2026-08-22: 遠方フェード2枚(床側/天井側)を消失点で重ねる幅。0にすると2枚の端が
// 非整数境界でぶつかり、**倍率と無関係に画面の26%へ横一直線の切れ目**が出る(社長報告)。
export const DARK_SEAM_OVERLAP_PX = 3;

// ★切り分け用スイッチ(2026-08-22・社長の「どこに居ても同じ高さで切れる」の犯人特定用)。
// 消失点(画面の26%)には**4つのもの**が重なっている。1つずつ消して線が残るかを見る。
//   ?nodark=1  … 遠方フェード(床側/天井側の暗幕)を消す
//   ?nomesh=1  … 床メッシュと天井メッシュを消す(=通路の床と天井が丸ごと消える)
//   ?noback=1  … 奥壁(ステンドグラス)を消す
//   ?nopillar=1… 柱と壁灯を消す
// **どれかで線が消えたら、それが犯人**。複数同時指定も可。実機で1回試すためだけのもので、
// 既定では全て off(挙動は1つも変わらない)。
const qFlag = (k: string): boolean =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get(k) === '1';
export const CORRIDOR_DEBUG = {
  noDark: qFlag('nodark'),
  noMesh: qFlag('nomesh'),
  noBack: qFlag('noback'),
  noPillar: qFlag('nopillar'),
  noBg: qFlag('nobg'),
};
// 通路テクスチャ一覧(ensureLoadedと共有)。
export const CORRIDOR_TEXTURE_NAMES = [
  'floor', 'ceiling', 'floor-goal',
  'pillar-left', 'pillar-right',
  'pillar-left-blur', 'pillar-right-blur',
  'pillar-left-farblur', 'pillar-right-farblur',
  'back', 'back-farblur',
  'candle', 'candle-blur', 'candle-farblur',
] as const;
// 出撃ローディング用の先読み(v0.25.2122・社長報告「ローディング終わっても画像が読み込み終わってない」):
// PixiStageがstage-6出撃時にawaitし、ローディング解除(rendererReady)の条件に含める。
// 同一URL(M())のAssetsキャッシュに乗るため、ensureLoaded側は即時解決になる。
export const preloadCorridorTextures = async (onEach?: () => void): Promise<void> => {
  await Promise.all(CORRIDOR_TEXTURE_NAMES.map(async (n) => {
    try { await Assets.load(M(`${n}.png`)); } catch { /* 個別失敗は無視 */ } finally { onEach?.(); }
  }));
};
// 壁灯/燭台の縦プロポーション補正(v0.25.2115・社長報告「蝋燭の火が見当たらない」):
// footYr 1.55→0.744の幾何再調整で「足元→消失点」のスパンが約1/2.8に縮んだのに、灯りの高さ
// (GLOW_Y_R×柱の描画高)は柱基準のままだったため、炎が消失点より上=天井メッシュの裏に飛んで
// 見えなくなっていた。灯り・燭台・グロー半径はスパン比で縮めて壁の中腹に戻す。
const LAMP_SPAN_SCALE = (CFG.footYr - CFG.horizonYr) / (CORRIDOR_CFG.footYr - CORRIDOR_CFG.horizonYr); // ≒0.355
// 灯り専用の距離フェード(v0.25.2115): 共通のfade=(s-0.12)/0.5は旧幾何(可視帯s=0.3〜1.5)前提。
// 新幾何では画面に映る壁の帯がs≒0.10〜0.5のため、ほぼ全灯がフェード圏=見えなかった(実測α0〜0.36)。
// 可視帯で明るくなる曲線に灯りだけ差し替える(柱/床のフェードは承認済みの見た目なので触らない)。
const LAMP_FADE_S0 = 0.06;    // このsで灯りが出始める
const LAMP_FADE_RANGE = 0.18; // s0+rangeで全開
const LAMP_INSET = 0.86;      // 灯りを通路の内側へ寄せる率(1=柱ライン。柱の縁から覗かせる)
const GLOW_MAX_R_FRAC = 0.11; // 壁灯グロー半径の上限(画面高比・v0.25.2149負荷対策=近距離の大玉加算を抑える)
const BACK_FARBLUR_WEIGHT = 0.3; // 奥壁の強ブラー版の配合上限(v0.25.2127。1=旧=泥の塊化)

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
// ステージ6のゴール床(社長指示v0.25.2132「床の一部をこの床に・4000px付近」): 通常床と同寸1254×1254の
// ハッチ付きタイル(floor-goal)を、床タイル境界に揃えた1枚ぶんの帯[GOAL_START, GOAL_START+520)にだけ
// 重ねて描く(専用の小メッシュ・行の縁=world固定位置なので境界が正確、通常床と紋様が連続する)。
// gameStore.CORRIDOR_GOAL_Y は現在 **-3390**(「到達時にハッチと重なる補正済み」= 帯の中心3900から
// 手前へ510pxずらした確定値)。旧コメントの「-3900=帯の中心と一致」は補正前の記述(v0.25.2893で訂正)。
const GOAL_TILE_START = 3640;              // ハッチ床タイルの手前端(world前進量。520の倍数=タイル境界)
const GOAL_TILE_LEN = FLOOR_REPEAT;        // 1タイルぶん
const GOAL_ROWS = 24;                      // ゴール床メッシュの分割(帯1枚ぶんなので床本体より少なくて良い)
const BACK_DEPTH = 4200;   // 奥壁(ステンドグラス窓)の固定奥行き(M6=常にこの値。EXは下記exBackTravel参照)
// PACING_PUZZLE.md §10-20#2(3巡目#6): 壁灯/燭台の表示範囲はBACK_DEPTHに紐づけたままにせず、現行の
// 相対値(=M6の固定BACK_DEPTHから求めた値)へ切り離す。EXの奥壁がworld固定化されて動的な値になっても
// 灯りが順に消える副作用が起きない(M6はこの定数がBACK_DEPTH-300と数値上完全に一致=1バイトも変わらない)。
const LAMP_MAX_DEPTH = BACK_DEPTH - 300;
const BACK_ALPHA = 0.9;    // 奥壁の不透明度(距離フォグに沈めない=光る目標物)
// v0.25.2099: back.pngはシーン全体の絵で、壁の実体はキャンバス上18%〜下91.5%の帯だけ(上下は黒虚空)。
// ソース矩形でこの帯だけ切り出して描く。上下の黒虚空を含めない=柱の高さと乖離しない。
const BACK_SRC_TOP_R = 0.18;   // 壁コンテンツの上端(素材高比・計測値)
const BACK_SRC_BOT_R = 0.915;  // 壁コンテンツの下端(同)
const BACK_H_MULT = 1.40;      // 壁コンテンツの表示高=柱の高さ×この倍率(旧1.36はキャンバス全高基準)
const BACK_GLASS_CY = 0.45;    // ガラス(窓)中心の高さ(切り出し後コンテンツ高の上からの比率・月明かりのアンカー)
// PACING_PUZZLE.md §10-20#2(EX舞台の洋館通路化): 奥壁world固定化に伴う破綻防止。
const EX_BACK_MIN_D = 300;          // dの下限(北端クランプで実際にはこれ未満にならないが二重の安全弁)。
// ★灯りが奥壁を突き抜ける件の修正(社長報告2026-08-23「EXだけ、一番上の壁の行き止まりで、蝋燭は
// ここまでのはずなのに、光だけさらに奥の方にも配置されてしまう」)で、奥壁の深さを updateWallLamps
// からも引く必要が出たため、updateBack の中にあった式をここへ1本化した(2箇所で別々に計算しない)。
const backWallDepth = (travel: number, opts?: CorridorLayerFrameOpts): number =>
  (opts?.isEx && opts.exBackTravel != null)
    ? Math.max(EX_BACK_MIN_D, opts.exBackTravel - travel)
    : BACK_DEPTH;
// 奥壁の手前どれだけで灯りを打ち切るか。M6の LAMP_MAX_DEPTH = BACK_DEPTH - 300 と同じ 300 を使う
// (新しい数字を作らない)。この手前 LAMP_CUT_FADE_PX でフェードして消える=パッと消えない(慣性MUST)。
const LAMP_BACK_MARGIN_PX = 300;
const LAMP_CUT_FADE_PX = 300;
const EX_BACK_MAX_FINAL_H_MULT = 1.6; // ★4巡目#7: 最終合成後(投影×広間S×worldズーム)の表示高キャップ(画面高比・叩き台)。

/** pixiScene.tsから毎フレーム渡すEX(stage-ex1)固有の描画オプション(§10-20#2/#8/#11)。省略時=M6と1バイトも変わらない。 */
export interface CorridorLayerFrameOpts {
  /** trueならEX固有分岐(奥壁のworld固定+ハッチ床の抑止)を有効化。 */
  isEx?: boolean;
  /** EXの奥壁を置くtravel-space位置(北端-6000の300px奥。exHallTravel(EX_BACK_WORLD_Y)。§10-20#2)。
   *  isEx時のみ参照。★検収監査#1(2巡目・v3752): 第一引数のtravelがO(y)(exHallTravel)へ置き換わった
   *  ことで、奥壁もこの**同じO空間**の値を渡せばよくなった(旧exBackRawTravelの分離は不要になり廃止)。 */
  exBackTravel?: number;
  /** container側で既に掛けている最終合成スケール(広間S×worldズーム)。奥壁の破綻防止キャップの
   *  計算にだけ使う(container自体へは二重に掛けない・4巡目#7)。 */
  exDispScaleForCap?: number;
}
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
  private goalFloor: MeshStrip | null = null; // ゴール床(ハッチ)のオーバーレイ(v0.25.2132)
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

  // プール(柱の本数=CFG.count*2 に合わせて生成)。
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

  // 洋館素材の遅延ロード(初回 update で1度だけ走る)。stage-6出撃ではPixiStageが
  // preloadCorridorTextures を await 済み=Assetsキャッシュから即時解決(v0.25.2122)。
  private ensureLoaded(): void {
    if (this.loading || this.ready) return;
    this.loading = true;
    const names = CORRIDOR_TEXTURE_NAMES;
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
      // ゴール床(ハッチ)は床本体の直上に重ねる(v0.25.2132)。UVは[0,1]のクランプ=1枚きり(repeatにしない)。
      if (this.tex['floor-goal']) {
        this.goalFloor = makeStripMesh(this.tex['floor-goal'], GOAL_ROWS);
        this.container.addChildAt(this.goalFloor.mesh, this.container.getChildIndex(this.floor.mesh) + 1);
      }
    }
    if (this.tex['ceiling']) {
      this.ceil = makeStripMesh(this.tex['ceiling'], CEIL_ROWS);
      this.container.addChildAt(this.ceil.mesh, this.floor ? this.container.getChildIndex(this.floor.mesh) + (this.goalFloor ? 2 : 1) : 1);
    }
    // ④ 遠方フェードはメッシュの上・壁灯/柱の下。
    this.container.addChild(this.floorDark, this.ceilDark);
    // ⑥ 奥壁+月明かり(壁灯より上・柱より下の重なりでも良いが、プレビュー順=壁灯→奥壁→柱に合わせ、
    //    壁灯プールを先に addChild する buildPools の前に置く=奥壁は壁灯の上)。
    //    実際の z 調整は buildPools 側で行う。
  }

  private buildPools(): void {
    const n = CFG.count * 2; // 左右ペア×本数
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
    // 重なり順(先=奥): 奥壁 → 柱 → 壁灯(燭台→グロー)。
    // v0.25.2115: 壁灯を柱より【手前】へ変更。新幾何(footYr 0.744)では奥行きが圧縮され、
    // 灯りの投影位置が隣の柱とほぼ重なる=柱の裏に完全に隠れて見えなかった(社長報告)。
    // 燭台は「柱の前に立つ燭台」として柱の上に描く(プレビューの「壁の奥の灯り」とは重なりが変わる)。
    this.container.addChild(this.backSharp, this.backBlur, this.moonWindow, this.moonShaft, this.moonFloor);
    mkPool(this.pillarBlur, [0.5, 1], false);
    mkPool(this.pillarSharp, [0.5, 1], false);
    mkPool(this.candleSharp, [0.5, 1], false);
    mkPool(this.candleBlur, [0.5, 1], false);
    // グローは焼き済みの暖色放射テクスチャを渡す(v0.25.2143修正: 未渡し=Texture.EMPTY(1px)のまま
    // 生成されており、updateWallLampsも位置/α/スケールしか触らないため光が一度も描かれていなかった。
    // 社長報告「蝋燭の光源がいなくなってるまま」の真因)。
    mkPool(this.glowMain, [0.5, 0.5], true, this.glowTex ?? undefined);
    mkPool(this.glowCore, [0.5, 0.5], true, this.glowTex ?? undefined);
    mkPool(this.glowFloor, [0.5, 0.5], true, this.glowTex ?? undefined);
  }

  resize(_W: number, _H: number): void {
    // メッシュ/スプライトの寸法は update で毎フレーム画面サイズから再計算するので、ここは何もしない
    // (寸法は W/H を直接引数で受ける)。
  }

  update(travel: number, W: number, H: number, now: number, opts?: CorridorLayerFrameOpts): void {
    this.ensureLoaded();
    // 背景は常に全画面+横オーバースキャン(v0.25.2113: 横移動でcontainerごと逆シフトするため、
    // シフトしても黒背景の切れ目が出ないよう左右に余白を持たせる)。
    // ★社長報告2026-08-22「上に行かなくても、距離が離れるだけで出てくる。つまりズームアウトで
    // 必ず出てくる」= **これが決定打**。通路背景の container には
    // `dispScale =(広間スケール)×(ワールドズーム)` が掛かるため、**ズームアウトで dispScale < 1**
    // になると、ローカル [0,H] 固定だったこの黒背景が**画面より小さく縮み、端が線として見えていた**。
    // 横には元から ±420px の余白があったのに、**縦だけ余白ゼロ**だったのが原因。
    // 実測: dispScale=0.40 のとき bg が覆うのは画面 322〜? だけで、その外側は素の描画面が出る。
    // 対処: **縦にも画面1つ分ずつ余白を持たせる**(上下 CORRIDOR_BG_Y_OVERSCAN=H)。
    //   合成後の高さ = (H + 2H) × dispScale。最小 dispScale(=ZOOM_MIN_ABS 0.40 × 広間1.0)でも
    //   3H × 0.40 = 1.2H > H で画面を覆い切る。支点が足元(画面の約64%)に寄っている分も吸収する。
    // ※遠方フェード(floorDark/ceilDark)はグラデの分布が変わると演出が変わるので**広げない**。
    //   その外側はこの bg の単色(0x0a0709=遠方の闇と同色)が受け持つ。
    this.bg.visible = !CORRIDOR_DEBUG.noBg; // ★切り分け用(?nobg=1)
    const bgOverscanY = H; // 上下それぞれ画面1つ分
    this.bg.position.set(-CORRIDOR_BG_X_OVERSCAN, -bgOverscanY);
    this.bg.width = W + CORRIDOR_BG_X_OVERSCAN * 2;
    this.bg.height = H + bgOverscanY * 2;
    const horizonY = H * CFG.horizonYr;
    if (!this.ready) return;

    this.updateFloor(travel, W, H);
    this.updateGoalFloor(travel, W, H, opts);
    this.updateCeiling(travel, W, H);
    // ④ 遠方フェード配置。bgと同じ横オーバースキャン(v0.25.2132: カメラのプレイヤー追従で
    // containerごと横シフトしても黒グラデの縁(=v0.25.2124の「四角い黒い切れ目」の正体)が画面に入らない)。
    // ★社長報告2026-08-22「どこに居ても、コンボが表示される高さ辺りが必ず切れている」の修正。
    // 実測: 切れ目は画面の27.1%、horizonY(=H*0.26)の位置に**倍率と無関係に固定**で出ていた。
    // 正体は消失点の「継ぎ目」3つが同じ一行に重なっていたこと——
    //   ① floorDark(上端でα=1)と ceilDark(下端でα=1)が **horizonY ちょうどで接していた**
    //   ② その horizonY が **非整数**(H=844 なら 219.44)なので、2枚のスプライトの端が
    //      半端なピクセルになり、間に隙間/濃淡のムラが出る(res:1/3 の縮小で更に目立つ)
    //   ③ 床メッシュが `horizonY + 1` から始まる=**1px の素抜け**が同じ行にある
    // 対処: **境界を整数へ丸め、2枚を DARK_SEAM_OVERLAP_PX だけ重ねる**。
    // αの最大値・グラデの形・色は1つも変えていない(=「遠くが闇に沈む」演出は不変)。
    const hy = Math.round(horizonY);
    this.floorDark.visible = !CORRIDOR_DEBUG.noDark;
    this.ceilDark.visible = !CORRIDOR_DEBUG.noDark;
    this.floorDark.position.set(-CORRIDOR_BG_X_OVERSCAN, hy - DARK_SEAM_OVERLAP_PX);
    this.floorDark.width = W + CORRIDOR_BG_X_OVERSCAN * 2;
    this.floorDark.height = H - hy + DARK_SEAM_OVERLAP_PX;
    this.ceilDark.position.set(-CORRIDOR_BG_X_OVERSCAN, 0);
    this.ceilDark.width = W + CORRIDOR_BG_X_OVERSCAN * 2;
    this.ceilDark.height = hy + DARK_SEAM_OVERLAP_PX;

    this.updateWallLamps(travel, W, H, now, opts);
    this.updateBack(travel, W, H, opts);
    this.updatePillars(travel, W, H);
  }

  // 床(Mode-7): 画面の各行の奥行き d を逆算し、床テクスチャの該当行を台形メッシュへ写す。
  private updateFloor(travel: number, W: number, H: number): void {
    if (!this.floor) return;
    this.floor.mesh.visible = !CORRIDOR_DEBUG.noMesh; // ★切り分け用(?nomesh=1)
    if (CORRIDOR_DEBUG.noMesh) return;
    const { positions, uvs, geom } = this.floor;
    const horizonY = H * CFG.horizonYr;
    const footY0 = H * CFG.footYr;
    const denom = footY0 - horizonY;
    for (let i = 0; i < FLOOR_ROWS; i++) {
      const t = i / (FLOOR_ROWS - 1);
      // ★2026-08-22: 旧 `horizonY + 1` は消失点に **1px の素抜け**(床も天井も無い行)を作っていた。
      // 天井メッシュは horizonY ちょうどまで来ているので、床も horizonY から始めて隙間を閉じる。
      // s のゼロ割は下行の `Math.max(0.02, …)` が従来どおり吸収する(挙動不変)。
      const y = horizonY + (H - horizonY) * t; // 消失点から画面下端まで
      const s = Math.max(0.02, (y - horizonY) / denom);
      const d = CFG.focal * (1 / s - 1);
      const fw = 2 * W * CFG.aisleHalfXr * s * FLOOR_W_MULT;
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

  // ゴール床(ハッチ)のオーバーレイ(v0.25.2132): 床本体と同じ投影式で、world固定の帯
  // [GOAL_TILE_START, +520) にだけテクスチャ1枚を張る。行の縁をworld座標で切るので
  // タイル境界が正確=通常床(境界も520の倍数)と紋様が連続し、差し替えたように見える。
  private updateGoalFloor(travel: number, W: number, H: number, opts?: CorridorLayerFrameOpts): void {
    if (!this.goalFloor) return;
    // PACING_PUZZLE.md §10-20#8(★監査#5②): EXはハッチ床タイル(travel3640〜4160)を貼らない
    // (動線-3000→-5000で必ず踏み、通常ステージの帰還ハッチと紛らわしい絵になるため)。
    if (opts?.isEx) { this.goalFloor.mesh.visible = false; return; }
    const goalEnd = GOAL_TILE_START + GOAL_TILE_LEN;
    // カリング: 完全に通過した(タイル奥端がカメラ背後の描画限界より手前)/遠すぎて見えない、は非表示。
    const dFar = goalEnd - travel;
    const visible = dFar > -CFG.focal * 0.75 && (GOAL_TILE_START - travel) < BACK_DEPTH;
    this.goalFloor.mesh.visible = visible;
    if (!visible) return;
    const { positions, uvs, geom } = this.goalFloor;
    const horizonY = H * CFG.horizonYr;
    const footY0 = H * CFG.footYr;
    for (let i = 0; i < GOAL_ROWS; i++) {
      const t = i / (GOAL_ROWS - 1);
      const w = goalEnd - GOAL_TILE_LEN * t;          // 行のworld位置(i=0が奥端→手前端へ)
      const d = Math.max(-CFG.focal * 0.75, w - travel); // カメラ背後はs発散前にクランプ(画面外下へ)
      const s = CFG.focal / (CFG.focal + d);
      const y = horizonY + (footY0 - horizonY) * s;
      const fw = 2 * W * CFG.aisleHalfXr * s * FLOOR_W_MULT;
      const lx = W / 2 - fw / 2;
      const rx = W / 2 + fw / 2;
      const base = i * 4;
      positions[base + 0] = lx; positions[base + 1] = y;
      positions[base + 2] = rx; positions[base + 3] = y;
      uvs[base + 0] = 0; uvs[base + 1] = t;           // v: 奥端=0(素材の上端が奥)→手前端=1
      uvs[base + 2] = 1; uvs[base + 3] = t;
    }
    geom.getBuffer('aPosition').update();
    geom.getBuffer('aUV').update();
  }

  // 天井(Mode-7): 床の上下反転。消失点より上の帯に張る。横は中央1/CEIL_SCALE幅を使用。
  private updateCeiling(travel: number, W: number, H: number): void {
    if (!this.ceil) return;
    this.ceil.mesh.visible = !CORRIDOR_DEBUG.noMesh; // ★切り分け用(?nomesh=1)
    if (CORRIDOR_DEBUG.noMesh) return;
    const { positions, uvs, geom } = this.ceil;
    const horizonY = H * CFG.horizonYr;
    const ceilY0 = H * CEIL_Y0_R;
    const denomC = horizonY - ceilY0;
    const ceilRepeat = FLOOR_REPEAT * CEIL_SCALE;
    const uL = 0.5 - 0.5 / CEIL_SCALE;
    const uR = 0.5 + 0.5 / CEIL_SCALE;
    for (let i = 0; i < CEIL_ROWS; i++) {
      const t = i / (CEIL_ROWS - 1);
      const y = horizonY * t; // 画面上端(手前)→ 消失点(奥)
      const s = Math.max(0.02, (horizonY - y) / denomC);
      const d = CFG.focal * (1 / s - 1);
      const fw = 2 * W * CFG.aisleHalfXr * s * FLOOR_W_MULT;
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
  private updateWallLamps(travel: number, W: number, H: number, now: number, opts?: CorridorLayerFrameOpts): void {
    if (CORRIDOR_DEBUG.noPillar) { // ★切り分け用(?nopillar=1): 柱と同じ列に並ぶ壁灯も一緒に消す
      for (const sp of this.candleSharp) sp.visible = false;
      for (const sp of this.candleBlur) sp.visible = false;
      for (const g of this.glowMain) g.visible = false;
      for (const g of this.glowCore) g.visible = false;
      for (const g of this.glowFloor) g.visible = false;
      return;
    }
    const lamps = projectCorridorPillars(travel + CFG.spacing / 2, W, H, CFG);
    const tSec = now / 1000;
    // ★奥壁より奥の灯りを出さない(社長報告2026-08-23)。
    // LAMP_MAX_DEPTH は BACK_DEPTH から作った【定数】なので、M6(奥壁=固定4200)では常に壁の300px手前で
    // 正しく止まる。しかし**EXの奥壁はworld固定=近づくと迫ってくる**(backWallDepth)ため、
    // backD が LAMP_MAX_DEPTH(3900)を下回った瞬間から、深さ backD〜3900 の灯りが**壁の裏**に居座る。
    // 行き止まり(backD→EX_BACK_MIN_D=300)ではほぼ全部が壁の向こうになり、しかもグローは奥壁より後に
    // addChild されている=壁の上から加算で塗られるので「光だけ奥に続く」に見えていた。
    // ⇒ 打ち切りを**実際の奥壁の深さに追随**させる。ハードに消すと灯りがパッと消えるので
    //   (慣性MUST・旧コメントが定数化で避けようとした副作用そのもの)、手前 LAMP_CUT_FADE_PX で減光する。
    const backD = backWallDepth(travel, opts);
    const lampCutDepth = Math.min(LAMP_MAX_DEPTH, backD - LAMP_BACK_MARGIN_PX);
    const candleTex = this.tex['candle'];
    for (let i = 0; i < this.candleSharp.length; i++) {
      const cs = this.candleSharp[i], cb = this.candleBlur[i];
      const gm = this.glowMain[i], gc = this.glowCore[i], gf = this.glowFloor[i];
      const m = lamps[i];
      const active = m && m.depth >= 60 && m.depth <= lampCutDepth;
      if (!active) { for (const s of [cs, cb, gm, gc, gf]) s.visible = false; continue; }
      // 灯り専用フェード(新幾何の可視帯に合わせる。詳細はLAMP_FADE_*のコメント)。
      const sVal = CFG.focal / (CFG.focal + m.depth);
      // 奥壁の手前 LAMP_CUT_FADE_PX で 1→0 へ落とす。燭台とグローの**両方**に同じ係数を掛ける
      // (片方だけ残ると「蝋燭は無いのに光だけある」という今回の症状の別型になる)。
      const cutFade = Math.max(0, Math.min(1, (lampCutDepth - m.depth) / LAMP_CUT_FADE_PX));
      const lampFade = Math.max(0, Math.min(1, (sVal - LAMP_FADE_S0) / LAMP_FADE_RANGE)) * cutFade;
      // わずかに通路の内側へ寄せる(柱の縁から灯りが覗く位置・v0.25.2115)。
      const lampX = W / 2 + (m.x - W / 2) * LAMP_INSET;

      // 燭台(光源の実体・炎がグロー中心に一致する高さで床に立てる)。
      const hc = m.h * CANDLE_H_R * LAMP_SPAN_SCALE;
      const wN = dofNear(m.depth), wF = dofFar(m.depth);
      const dofC = Math.max(wN, wF);
      if (candleTex && candleTex.width > 0) {
        const k = hc / candleTex.height;
        cs.texture = candleTex;
        cs.position.set(lampX, m.y);
        cs.scale.set(k);
        cs.alpha = lampFade * (1 - dofC);
        cs.visible = dofC < 0.98 && cs.alpha > 0.01;
        const blurTex = this.tex[wF > wN ? 'candle-farblur' : 'candle-blur'];
        const pad = wF > wN ? FAR_BLUR_PAD : BLUR_PAD;
        if (blurTex && blurTex.width > 0) {
          const kb = hc / candleTex.height; // 表示スケール(ブラー版はpadぶん大きい・contentは同寸)
          cb.texture = blurTex;
          cb.position.set(lampX, m.y + pad * kb); // padの内側に content があるので足元を下げて一致
          cb.scale.set(kb);
          cb.alpha = lampFade * dofC;
          cb.visible = dofC > 0.02 && cb.alpha > 0.01;
        } else cb.visible = false;
      } else { cs.visible = false; cb.visible = false; }

      // 火の揺らぎ(世界位置位相の2重サイン)。世界位置基準=循環しても連続。
      const worldPos = m.depth + travel;
      const flick = 0.78 + 0.14 * Math.sin(tSec * 7.3 + worldPos * 0.013) + 0.08 * Math.sin(tSec * 11.7 + worldPos * 0.021);
      // 負荷対策(v0.25.2149・社長報告「重くなった」): v0.25.2143でグローが実際に描かれるようになり、
      // 近距離の大玉(半径~74px級)×最大14灯の加算オーバードロー=ベンチのG12 FAIL帯に入っていた。
      // 半径を画面高比でキャップ(塗り面積を約半減)+足元照り返し(横長の大面積加算)を廃止。
      const r = Math.min(m.h * 0.22 * LAMP_SPAN_SCALE * (0.96 + 0.06 * flick), H * GLOW_MAX_R_FRAC);
      const ly = m.y - m.h * GLOW_Y_R * LAMP_SPAN_SCALE;
      const gt = this.glowTex!;
      const gd = gt.width || 256;
      // 本体グロー。★visible は無条件trueにしない(v0.25.3842): 上の cutFade で α が0まで落ちるので、
      // 加算スプライトを0αのまま描き続けない=「絵が薄く残る」定型(ENGINEERING_NOTES §0)を作らない。
      gm.position.set(lampX, ly); gm.scale.set((r * 2) / gd); gm.alpha = lampFade * 0.85 * flick; gm.visible = gm.alpha > 0.004;
      // 明るい芯。
      gc.position.set(lampX, ly); gc.scale.set((r * 0.8) / gd); gc.alpha = Math.min(1, lampFade * 0.9 * flick); gc.visible = gc.alpha > 0.004;
      // 足元の照り返しは廃止(v0.25.2149負荷対策)。プールは残すが常時非表示。
      gf.visible = false;
    }
  }

  // ⑥ 奥壁(ステンドグラス窓)+月明かり。壁の帯だけを切り出したサブテクスチャを常に遠方=farblurとクロスフェード。
  private updateBack(travel: number, W: number, H: number, opts?: CorridorLayerFrameOpts): void {
    if (CORRIDOR_DEBUG.noBack) { // ★切り分け用(?noback=1)
      this.backSharp.visible = this.backBlur.visible = false;
      this.moonWindow.visible = this.moonShaft.visible = this.moonFloor.visible = false;
      return;
    }
    const bt = this.backSharpFrame;
    if (!bt || bt.width <= 0) { this.backSharp.visible = false; this.backBlur.visible = false;
      this.moonWindow.visible = this.moonShaft.visible = this.moonFloor.visible = false; return; }
    // PACING_PUZZLE.md §10-20#2: M6は従来どおり「プレイヤー前方へ無限後退」する固定奥行き(BACK_DEPTH)。
    // EXだけ、奥壁をworld固定(北端-6000の300px奥=exBackTravel)へ切り替える(近づくと実際に迫ってくる壁)。
    // ★検収監査#1(2巡目・v3752): travel(第一引数)がexHallTravel=O(y)へ置き換わったため、奥壁の
    // exBackTravelも同じO空間の値(exHallTravel(EX_BACK_WORLD_Y))を渡せばよい=素のtravelを別扱い
    // する必要が無くなった(旧rawTravelForBackの分離は廃止)。
    const backD = backWallDepth(travel, opts); // 式は backWallDepth に1本化(updateWallLamps も同じ値を引く)
    const s = CFG.focal / (CFG.focal + backD);
    const horizonY = H * CFG.horizonYr;
    const footY = horizonY + (H * CFG.footYr - horizonY) * s;
    let bh = H * CFG.pillarHr * s * BACK_H_MULT; // 壁コンテンツの表示高(柱の高さ基準)
    // ★4巡目#7: この上限は最終合成後の表示スケール(投影×広間S×worldズーム)に対して適用する
    // (bh自体=投影段階の値なので、container側のexDispScaleForCapを掛けた見かけ高で判定する)。
    if (opts?.isEx && opts.exDispScaleForCap) {
      const capH = H * EX_BACK_MAX_FINAL_H_MULT;
      const finalH = bh * opts.exDispScaleForCap;
      if (finalH > capH) bh *= capH / finalH;
    }
    const bw = (bt.width / this.backSrcH) * bh;             // 幅=切り出し後アスペクト従属=歪みなし
    const k = bh / this.backSrcH;                          // srcH*k = bh
    // 奥壁のDOF配合(v0.25.2127・社長報告「この黒い影なに?」): 幾何再調整(footYr 0.744)で奥壁の
    // 表示が小さくなり、26px焼き込みブラー版をw≒0.9で被せると「黒い泥の塊」になっていた(実測bisectで確定)。
    // ブラーの寄与を大きく下げ、シャープ主体+うっすら霞む程度に。
    const w = dofFar(backD) * BACK_FARBLUR_WEIGHT;
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
    if (CORRIDOR_DEBUG.noPillar) { // ★切り分け用(?nopillar=1): 柱を全部隠す
      for (const sp of this.pillarSharp) sp.visible = false;
      for (const sp of this.pillarBlur) sp.visible = false;
      return;
    }
    const pillars = projectCorridorPillars(travel, W, H, CFG);
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
