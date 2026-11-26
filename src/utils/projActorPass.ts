// 投影の段階2「動くもの」の純関数(PixiJS を読まない・描画の写像だけ)。
// 設計書: research/PERSPECTIVE_PROJECTION.md §3-5(3-5c 置き方・3-5g 湧きの一時のフェード・3-5i フェードの例外・
// 3-5j 透け・3-5k 作る物1/2/4/5/6/11)。`?proj=1` の時だけ pixiScene が使う(既定では1ビットも使われない)。
// ゲームの判定(当たり・カウンターの半径・攻撃範囲・移動・湧き・回収)には一切関与しない。

import { brawlerEnemyClass } from './brawlerCombo';
import { isTerminalReaper, OFFSCREEN_SPAWN_MARGIN } from './enemyUtils';
import { regionEdgeFade, type RegionRect } from './regionEdgeFade';
import type { EnemyType } from '../types/game';
import type { ProjLiftKind } from './projLift';

// ---- 役の表(§3-5k 作る物2・1本) ----

/**
 * 体の部品の役。
 * - body: 足元を支点に相似(k)で写す(体・体に付く武器や光・リムライトの縁・足元の小さな輪)
 * - shadow: 足元の影(付け根=足元の投影点・大きさ=本体の倍率)=後掛けでは body と同じ相似
 * - hud: 頭上の読ませる物=平行移動だけ(大きさは変えない・方針②)
 * - telegraph: 予告=動かさない(段階4)
 * - fx: 演出=動かさない(段階3/5)
 * - trail: 残像=その絵が今置かれている world の点を投影して置く(今の足元を支点に写さない)。大きさは その点の s ÷ 持ち主の d
 */
export type ProjActorRole = 'body' | 'shadow' | 'hud' | 'telegraph' | 'fx' | 'trail';

/** 部品の名札 → 役(後掛けはこの表だけを読む)。名札は ActorView のフィールド名か、作る所で付ける登録名。 */
export const PROJ_ACTOR_ROLES = {
  // view.container の子(体)
  // atkArt(物理の攻撃の絵)=体の相似が既定(体に付く物=銃・溜めの蔓の輪など)。ただし判定の帯に沿って体から離れて地面を伸びる/
  // 地面の点に出る絵(触手・翼・爪・噛みつきの顎・偶像の拳・城ボスの薙ぎの蔓・翼・砲・氷塊と粒・滑空の枝)は、体の相似だと
  // 縦の詰めの差だけ投影済みの赤い帯から外れる(体から北へ 150px で 20〜45px)=pixiScene が描く時に写す(根元=体の相似・
  // 先や置く点=地面の点の投影・projAtkSeg/projAtkPt)。描く時に写した物は同じフレームの後掛けを通らない(projFxSave の印)。
  sprite: 'body', hitFlash: 'body', reticle: 'body', atkArt: 'body', glenParts: 'body', alchemyRocks: 'body',
  // グレンの「無」の円の絵(判定と同寸・中心=狙い点)の格子メッシュ=描く時に頂点ごとに投影(後掛けで動かさない=summonTornado と同じ扱い)。
  atkArtGround: 'telegraph',
  phillBack: 'body', featherC: 'body', rim: 'body', avatarPart: 'body',
  // 物に地面の明るさを写す加算の写し(objShade の twin・label 'objShadeLight')。後掛けの後に本体から写される=後掛けでは動かさない
  // (projPostView が飛ばす)。寄りの遠近では体として扱う。
  objShadeTwin: 'body',
  heroFog: 'body', heroFog2: 'body', heroMotes: 'body',
  // 主人公の入れ物の子(9つ)
  playerKatanaBack: 'body', playerSkateboard: 'body', playerKintoun: 'body', playerBloodRim: 'body',
  playerKnife: 'body', playerKnifeSlash: 'body', playerKnifeTrail: 'body', playerMeleeWpn: 'body', playerFirstAidBag: 'body',
  // 入れ物の外に置く体の絵(projAttach で持ち主に登録する)
  light: 'body', phillFront: 'body', rescueBody: 'body', rescueSwing: 'body',
  // 体に付く別スプライトの絵=体。敵: 銃口の閃光・ジブリルのランタン・賞金首の武器・鞭のロープ・鋏・剣先の光・旗の先の光・天使の目・ホロ・
  // 英雄の旗と剣・英雄の昇天の白い体・スリィエルの環・幻影の目/ナイフの振り/銃口の閃光・刀の切れ目。味方: 守護霊のナイフ・武器・装飾パーツ、
  // レア召喚の頭上の棺。入れ物の外の物は projAttach で持ち主へ登録し、入れ物の子は projTag で名札を付ける。
  attachedArt: 'body',
  // レア召喚の竜巻(吸い込む距離に合わせた範囲の絵)=段階4で予告と同じ「描く時に投影」側へ(足元に寝かせた四角の格子メッシュ・後掛けで動かさない)。
  summonTornado: 'telegraph',
  // 名前の札・叫喚の強化の印=頭上UI(平行移動だけ)。
  nameLabel: 'hud',
  // 影
  airRing: 'shadow', airGroundShadow: 'shadow',
  // 頭上UI
  overlay: 'hud', headMark: 'hud',
  // 予告(段階4まで動かさない)
  tele: 'telegraph', overlayTop: 'telegraph', rings: 'telegraph', bands: 'telegraph', bandSlices: 'telegraph',
  clawMarks: 'telegraph', shockwaves: 'telegraph', spikeThrust: 'telegraph', burstFrag: 'telegraph',
  dashWind: 'telegraph', coilBody: 'telegraph',
  // 演出(段階3=体の相似で動かす・§3-7j の1)
  slash: 'fx', breathRope: 'fx', airStreaks: 'fx', playerAirStreaks: 'fx',
  // 残像(記録した自分の world の点に置く絵): 英雄の残像・格闘の残像
  heroTrail: 'trail', brawlerGhost: 'trail',
  // 格闘の構えの光(体に重ねる)
  brawlerAura: 'body',
} as const satisfies Record<string, ProjActorRole>;

export type ProjActorPartKey = keyof typeof PROJ_ACTOR_ROLES;

export const projActorRole = (key: ProjActorPartKey): ProjActorRole => PROJ_ACTOR_ROLES[key];

/**
 * 段階5「高さ」(research/PERSPECTIVE_PROJECTION.md §3-8e・作る物2): 部品の名札ごとの高さの付き方の既定。
 * 今の描き方で「本体と一緒に − h されているか」で決める(体の絵・手の武器・体の光=body/地面の輪・影・予告=ground/
 * 名前の札・頭上マーク=H に高さを含む頭上の物=hudWithH/浮きの筋=streak)。同じ名札でも物ごとに違う所は
 * pixiScene の projLiftTag で物ごとに上書きする(例: 主人公の体力の線=hudNoH・敵の体力バー=ground)。
 */
export const PROJ_ACTOR_LIFTED = {
  sprite: 'body', hitFlash: 'body', reticle: 'ground', atkArt: 'body', atkArtGround: 'ground', glenParts: 'body', alchemyRocks: 'body',
  // avatarPart=ground: 生きたアバター部品は ?proj=0 で歩きの上下 bob(δ=d)だけで上がり、跳び・浮き・跳ねでは上がらない
  // (pixiScene の syncAvatarPartLayer の位置)=A では割り戻し0(段階5・Z9 を確かめた)。
  phillBack: 'body', featherC: 'body', rim: 'body', avatarPart: 'ground', objShadeTwin: 'body',
  heroFog: 'ground', heroFog2: 'ground', heroMotes: 'ground', // 足元の霧と粒=地面に残る(跳ぶと霧は消える・?proj=0 で体の高さと一緒に上がらない)
  playerKatanaBack: 'body', playerSkateboard: 'body', playerKintoun: 'body', playerBloodRim: 'body',
  playerKnife: 'body', playerKnifeSlash: 'body', playerKnifeTrail: 'body', playerMeleeWpn: 'body', playerFirstAidBag: 'body',
  light: 'body', phillFront: 'body', rescueBody: 'body', rescueSwing: 'body', attachedArt: 'body',
  summonTornado: 'ground', nameLabel: 'hudWithH', airRing: 'ground', airGroundShadow: 'ground',
  overlay: 'ground', headMark: 'hudWithH',
  tele: 'ground', overlayTop: 'ground', rings: 'ground', bands: 'ground', bandSlices: 'ground',
  clawMarks: 'ground', shockwaves: 'ground', spikeThrust: 'ground', burstFrag: 'ground', dashWind: 'ground', coilBody: 'ground',
  slash: 'body', breathRope: 'body', airStreaks: 'streak', playerAirStreaks: 'streak',
  heroTrail: 'ground', brawlerGhost: 'ground', brawlerAura: 'body',
} as const satisfies Record<ProjActorPartKey, ProjLiftKind>;

export const projActorLift = (key: ProjActorPartKey): ProjLiftKind => PROJ_ACTOR_LIFTED[key];

/** 後掛けがその役に何をするか: 相似で写す/平行移動だけ/動かさない。 */
export type ProjMove = 'similar' | 'translate' | 'none' | 'own';
export const projRoleMove = (r: ProjActorRole): ProjMove =>
  // 段階3(§3-7j の1・C1): 演出(斬撃の弧・冷気ブレス・空中の筋)は持ち主の体の相似で動かす(この関数は ?proj=1 の後掛けだけが読む)。
  r === 'body' || r === 'shadow' || r === 'fx' ? 'similar' : r === 'hud' ? 'translate' : r === 'trail' ? 'own' : 'none';

// ---- 後掛けの相似(§3-5c 型②・§10 B17) ----

/** 変換の箱(位置と倍率)。回転・傾き・反転の符号は掛け算で保つ(箱には入れない)。 */
export interface ProjXf { x: number; y: number; sx: number; sy: number }

/**
 * 足元 F を支点に、F → P・寸法 k 倍の相似を箱に掛ける: 位置 = P + k·(位置 − F)・倍率 *= k(符号=反転はそのまま)。
 */
export const projSimilarInto = (xf: ProjXf, fx: number, fy: number, px: number, py: number, k: number): ProjXf => {
  xf.x = px + k * (xf.x - fx);
  xf.y = py + k * (xf.y - fy);
  xf.sx *= k;
  xf.sy *= k;
  return xf;
};

/** 相似の逆(ボスの裏回りのピクセルの確認・裏ボスの影の付け根の world 戻し・§3-5j): 旧い座標の点 = F + (点 − P)/k。 */
export const projSimilarInverseInto = (
  fx: number, fy: number, px: number, py: number, k: number, x: number, y: number, out: { x: number; y: number },
): { x: number; y: number } => {
  const kk = Math.abs(k) > 1e-9 ? k : 1e-9;
  out.x = fx + (x - px) / kk; out.y = fy + (y - py) / kk;
  return out;
};
export const projSimilarInverse = (
  fx: number, fy: number, px: number, py: number, k: number, x: number, y: number,
): { x: number; y: number } => projSimilarInverseInto(fx, fy, px, py, k, x, y, { x: 0, y: 0 });

/**
 * 頭上の読ませる物の平行移動(方針②・§3-5c): 基準点 H を P + (s/b)·(H − F) へ移す量(大きさは変えない)。
 * b = その物のずらしに旧い倍率が掛かっていたらその倍率、掛かっていなければ 1。
 */
export const projHudDeltaInto = (
  fx: number, fy: number, px: number, py: number, s: number, b: number, hx: number, hy: number, out: { dx: number; dy: number },
): { dx: number; dy: number } => {
  const r = s / (Math.abs(b) > 1e-9 ? b : 1e-9);
  out.dx = px + r * (hx - fx) - hx; out.dy = py + r * (hy - fy) - hy;
  return out;
};
export const projHudDelta = (
  fx: number, fy: number, px: number, py: number, s: number, b: number, hx: number, hy: number,
): { dx: number; dy: number } => projHudDeltaInto(fx, fy, px, py, s, b, hx, hy, { dx: 0, dy: 0 });

/** 後掛けの k(§3-5c): 投影の s を、描く関数が掛けていた旧い倍率 d で割り戻す。 */
export const projActorK = (s: number, d: number): number => s / (Math.abs(d) > 1e-9 ? d : 1e-9);

/**
 * ★#22「フィルと使者の遠近の例外」(裁定済み2026-11-22=A): 'A'=ほかと同じ s/'B'=位置だけ投影し大きさは 1(控え)。
 * フィルの d=1 なので A では k=s。ここ1か所で切り替わる(フィルの k の出どころはこの関数だけ)。
 */
export const PROJ_PHILL_SIZE_MODE: 'A' | 'B' = 'A';

/** フィルの後掛けの k(d=フィルの旧い倍率=今は1)。 */
export const projPhillK = (s: number, d: number, mode: 'A' | 'B' = PROJ_PHILL_SIZE_MODE): number =>
  mode === 'A' ? projActorK(s, d) : projActorK(1, d);

// ---- 研究所の変異塊の大きさの頭打ち(描画だけ・判定=当たり・取り込みは world のまま) ----

/** 変異塊の描く倍率がここまでは投影の s そのまま(主人公の近く・北の奥=今のまま)。 */
export const PROJ_CRAWLER_SCALE_KNEE = 1.3;
/** 変異塊の描く倍率の上限(南の手前で s が 3〜4 に伸びても、ここへ漸近して止まる)。 */
export const PROJ_CRAWLER_SCALE_CAP = 2.0;

/**
 * 倍率の頭打ち(滑らかに): s ≤ knee はそのまま、knee を越えると cap へ指数で漸近する(knee で値も傾きも連続=急に大きさが変わらない・
 * 単調に増え cap を越えない)。cap ≤ knee なら min(s, cap)。
 */
export const projSoftCapScale = (s: number, knee: number, cap: number): number => {
  if (!(s > knee)) return s;
  const room = cap - knee;
  if (!(room > 0)) return Math.min(s, cap);
  return cap - room * Math.exp(-(s - knee) / room);
};

/** 変異塊の描く倍率(投影の s → 頭打ちした倍率)。 */
export const projCrawlerScale = (s: number): number => projSoftCapScale(s, PROJ_CRAWLER_SCALE_KNEE, PROJ_CRAWLER_SCALE_CAP);

/**
 * 後掛けに渡す旧い倍率 d(k = s/d が頭打ちした倍率になる d)。足元の位置は投影のまま(床に立つ)で、大きさだけ頭打ちする。
 */
export const projCrawlerLooseD = (s: number): number => {
  const k = projCrawlerScale(s);
  return k > 1e-9 ? s / k : 1;
};

// ---- フェードの例外(§3-5i の1・本体と影で同じ表) ----

export interface ProjFadeTypeFlags { phill: boolean; hangedman: boolean; hiddenBoss: boolean }

/** その型に掛ける項(true=掛ける)。フィル=両方免除/使者=地平線だけ免除/裏ボス=手前だけ免除/それ以外=両方掛ける。 */
export const projFadeTermsInto = (
  phill: boolean, hangedman: boolean, hiddenBoss: boolean, out: { horizon: boolean; fore: boolean },
): { horizon: boolean; fore: boolean } => {
  out.horizon = !(phill || hangedman);
  out.fore = !(phill || hiddenBoss);
  return out;
};
export const projFadeTerms = (t: ProjFadeTypeFlags): { horizon: boolean; fore: boolean } =>
  projFadeTermsInto(t.phill, t.hangedman, t.hiddenBoss, { horizon: true, fore: true });

/**
 * 動く物の位置の法則のフェード(投影後のYで1回だけ・§3-5i の1): domain(定義域と描く距離のフェード=全員)×
 * 地平線(掛ける型だけ)×手前(掛ける型だけ)。horizon・fore は投影後のYで引いた値を渡す。
 */
export const projActorPosFade = (
  domain: number, horizon: number, fore: number, terms: { horizon: boolean; fore: boolean },
): number => {
  if (!(domain > 0)) return 0;
  return domain * (terms.horizon ? horizon : 1) * (terms.fore ? fore : 1);
};

// ---- 湧き・回収の一時のフェード(§3-5g・作る物6) ----

/** 叩き台: 旧い画面の矩形の外 OFFSCREEN_SPAWN_MARGIN(=湧く位置)で 0。 */
export const PROJ_SPAWN_FADE_PX = OFFSCREEN_SPAWN_MARGIN;

/**
 * 旧い画面の矩形(store と同じ zoomedViewportBounds)の縁で 1・外へ margin 離れた所(湧く位置)で 0・間は smoothstep。
 * 矩形の中は 1。描画だけの一時の措置(段階6=★#9 で湧き・回収を投影の画面内に揃えた時に外す)。
 */
export const projSpawnEdgeAlpha = (x: number, y: number, view: RegionRect, margin: number = PROJ_SPAWN_FADE_PX): number => {
  const m = Math.max(0, margin);
  return regionEdgeFade(x, y, { left: view.left - m, top: view.top - m, right: view.right + m, bottom: view.bottom + m }, m);
};

/**
 * 湧きのフェードを掛ける区分か(§10 B23): 区分が雑魚・強個体の敵だけ。ボス級(brawlerEnemyClass の 'boss')と
 * 終端(深奥チェイサーの死神=isTerminalReaper)は掛けない(カットイン/アテンションで登場を見せる)。
 */
export const projSpawnFadeApplies = (e: { type: EnemyType; colorTier?: string; isNamed?: boolean; reaperChaser?: boolean }): boolean =>
  !isTerminalReaper(e) && brawlerEnemyClass(e) !== 'boss';

// ---- 透け(§3-5j) ----

/** 重なり用の投影後の主人公の箱(seeThroughPlayerProj): cx=P.x・footY=P.y・halfW=s·boxW/2・top=P.y−s·boxH。 */
export const projSeeThroughBox = (
  px: number, py: number, s: number, boxW: number, boxH: number,
): { cx: number; footY: number; halfW: number; top: number } => ({
  cx: px, footY: py, halfW: (s * boxW) / 2, top: py - s * boxH,
});

// ---- 後掛けの保存の作り置き(§3-5k 作る物1: 配列も要素も作り置き・毎フレームの確保を増やさない) ----

export interface ProjSavedXf<T> { obj: T | null; x: number; y: number; sx: number; sy: number; alpha: number }

/** 保存の箱の作り置き(要素の object を毎フレーム作らない)。push は空き箱を返し、clear は長さだけ戻す。 */
export class ProjSavePool<T> {
  private items: ProjSavedXf<T>[] = [];
  private n = 0;
  get length(): number { return this.n; }
  push(obj: T, x: number, y: number, sx: number, sy: number, alpha: number): ProjSavedXf<T> {
    let it = this.items[this.n];
    if (!it) { it = { obj: null, x: 0, y: 0, sx: 1, sy: 1, alpha: 1 }; this.items[this.n] = it; }
    it.obj = obj; it.x = x; it.y = y; it.sx = sx; it.sy = sy; it.alpha = alpha;
    this.n++;
    return it;
  }
  at(i: number): ProjSavedXf<T> { return this.items[i]; }
  /** 戻した後に呼ぶ(参照を外して長さを 0 に)。 */
  clear(): void {
    for (let i = 0; i < this.n; i++) this.items[i].obj = null;
    this.n = 0;
  }
  /** 作り置きの箱の数(テスト用=確保が増えていないかを見る)。 */
  get capacity(): number { return this.items.length; }
}

/**
 * 後掛けで子に掛ける alpha の倍率(§3-5i の1・予告の濃さは world のまま=社長側の答え 2026-11-22)。
 * - ownFade(=TELEGRAPH_OWN_FADE・既定)では、描く関数が体・頭上UI・演出に投影後のYのフェードを掛け済み、予告は予告自身の
 *   world の位置のフェードを掛け済み。後掛けは湧きの一時のフェード spawnA を予告以外に掛けるだけ(予告は 1=?proj=0 と同じ)。
 * - ownFade=false(?telefade=0)では、入れ物の alpha から位置のフェードを外し、子ごとに掛ける: 予告=posW・それ以外=投影後のYのフェード posP × spawnA。
 *   段階4(§10 B20 を閉じた)から、呼び手は posW に「予告自身の投影後のYのフェード」(projTelegraphFade)を渡す。
 */
export const projChildAlphaMul = (
  role: ProjActorRole, ownFade: boolean, posW: number, posP: number, spawnA: number,
): number => {
  if (role === 'telegraph') return ownFade ? 1 : posW;
  return (ownFade ? 1 : posP) * spawnA;
};
