// PACING_PUZZLE.md §10-20 EX舞台の洋館通路化: EX(stage-ex1)専用の「広間」定数+純関数。
// M6(stage-6)のcorridorProjection/playableAreaの挙動には一切触れない――EXだけが読む拡張分を
// ここに集約する(CLAUDE.md「配線ロジックは純関数に切り出してテスト」)。renderer非依存(no PixiJS import)。
//
// 背景(§10-20#5・社長の言葉): 「通常の通路をズームアップしたかのような見せ方。通路にズームインして、
// 敵もプレイヤーもスケールは保ったままにすることで、戦うフィールドは広がるのに、ほかの要素はそのまま」。
// ⇒ 通路の絵(床/壁/柱/天井)だけをS倍して描く(pixi/corridorLayer.ts)。移動可能帯の横クランプも
// **同じ補間値tから**広がる(6巡目#3: 絵のS倍とクランプの拡幅が別式だとズレる)。

import { CORRIDOR_LATERAL_CLAMP } from '../utils/corridorProjection';

// §10-20#2: 全長の北端。corridorは元々北の上限が無い(横と南端のみ)ため、EXだけこの絶対クランプを足す。
export const EX_NORTH_LIMIT_Y = -6000;

// §10-20#5: 広間のスケール倍率(叩き台=S=2.0。実機調整前提=触る時は社長裁定を得ること)。
export const EX_HALL_SCALE = 2.0;

// §10-20#5 実装規約: 「±170と柱位置はコード上非結合(±170は手合わせ値)なので、広間のクランプ値も
// 絵に手合わせで決める(±170×Sで自動一致とはしない)」。ここでは叩き台としてS基準の値を初期値に置く
// (実機調整は社長裁定で更新)。
export const EX_HALL_LATERAL_CLAMP = CORRIDOR_LATERAL_CLAMP * EX_HALL_SCALE; // 340

// 広間の遷移幅(px)。「広間の手前±数百px」の叩き台=CLAUDE.md「動きの絶対ルール:慣性」
// (加減速なしの切り替え=急変は禁止)を満たすための連続補間の帯。
export const EX_HALL_TRANSITION_PX = 400;

export interface ExHallZone {
  /** 広間の南端y(値が大きい=手前側)。t=1完了地点(南から進入する場合)。 */
  southY: number;
  /** 広間の北端y(値が小さい=奥側)。 */
  northY: number;
}

// §10-20#6: 関所(スリィエル)広間=y-3000±700。
export const EX_SURIEL_HALL: ExHallZone = { southY: -2300, northY: -3700 };
// §10-20#7: フィル広間=y-4800〜-6000。
export const EX_PHILL_HALL: ExHallZone = { southY: -4800, northY: -6000 };
export const EX_HALL_ZONES: ExHallZone[] = [EX_SURIEL_HALL, EX_PHILL_HALL];

// 関所(スリィエル)の発火/結界のy(§10-20#3・#4)。
export const EX_SURIEL_TRIGGER_Y = -2800; // (a)発火: プレイヤーyがこれ以下で1回だけスポーン
export const EX_SURIEL_NORTH_LOCK_Y = EX_SURIEL_HALL.northY; // (c)結界: 存命中はこれより奥へ進めない
export const EX_SURIEL_SOUTH_LOCK_Y = EX_SURIEL_HALL.southY; // 5巡目#1: 南も同時に締める(退路封鎖)

// フィルの出現/南封鎖のy(§10-20#7・#5末尾)。
export const EX_PHILL_TRIGGER_Y = -5000; // 旧・深度9000は廃止
export const EX_PHILL_SOUTH_LOCK_Y = EX_PHILL_HALL.southY; // 出現と同時に南端を閉鎖(開放は不要=終幕直結)

// --- §10-20#5 検収監査#1(3巡目・v3753): hallS(y)を「smoothstepをN本の線形サブ区間で近似した
// 区分線形関数」として1箇所(ブレークポイント表)で定義し、exHallScaleT(絵/クランプ)とexHallTravel
// (床/柱/灯/奥壁の流速)の**両方がこの同じ表から導出される**ようにする。
//
// 経緯: 2巡目でランプを純粋な線形(smoothstepではない)にしたところ、dS/dyがランプ入口で0→定数へ
// 跳ぶ形になり、CLAUDE.md「動きの絶対ルール:慣性」(等速で始まり瞬間停止する動きの禁止)に抵触すると
// 指摘された(ランプ通過は徒歩で約1.7秒=十分に知覚される)。一方でexHallTravelの閉じた式
// (oSegmentIntegral)は「区間内でhallSがa→bへ線形に変化する」場合にしか成り立たない。
// ⇒ 400pxのランプ全体を1本の線形区間として扱うのをやめ、**N本(既定32・16〜64の範囲)の短い線形
// サブ区間**へ分割し、各サブ区間の両端でsmoothstepを標本化する。これでsmoothstepの見た目(ease)を
// 1/N²精度で保ちながら、個々のサブ区間は線形=閉じた式がそのまま使え、打ち消しは構造的に厳密なまま。
// ブレークポイントは定数(EX_HALL_ZONES等)からのみ決まるので初期化時に1回だけ構築すれば足りる。
export const EX_HALL_RAMP_SUBSEGMENTS = 32; // 叩き台(16〜64の範囲・実機調整は社長裁定)

const smoothstepCurve = (t: number): number => t * t * (3 - 2 * t);

/** hallSのブレークポイント(y降順=南→北)。yとyの間はhallSが線形に変化するとみなす。 */
interface ExHallBreakpoint { y: number; hallS: number; }

const buildExHallBreakpoints = (zones: ExHallZone[], subsegments: number): ExHallBreakpoint[] => {
  const pts: ExHallBreakpoint[] = [{ y: 0, hallS: 1 }]; // スタート地点(常に通路幅)
  for (const z of zones) {
    const tInStart = z.southY + EX_HALL_TRANSITION_PX;
    if (pts[pts.length - 1].y > tInStart) pts.push({ y: tInStart, hallS: 1 }); // 広間手前の平坦区間
    // ランプイン(南→広間・frac 0→1をsmoothstepで標本化)。frac=0の点は直前のhallS=1点と共有する。
    for (let i = 1; i <= subsegments; i++) {
      const frac = i / subsegments;
      pts.push({ y: tInStart - EX_HALL_TRANSITION_PX * frac, hallS: 1 + (EX_HALL_SCALE - 1) * smoothstepCurve(frac) });
    }
    pts.push({ y: z.northY, hallS: EX_HALL_SCALE }); // 広間の内部(南端→北端・平坦=S)
    // ランプアウト(広間→北・frac 1→0をsmoothstepで標本化。i=subsegmentsでy=northY-TRANSITION_PXへ到達)。
    for (let i = 1; i <= subsegments; i++) {
      const frac = 1 - i / subsegments;
      pts.push({ y: z.northY - EX_HALL_TRANSITION_PX * (i / subsegments), hallS: 1 + (EX_HALL_SCALE - 1) * smoothstepCurve(frac) });
    }
  }
  return pts;
};

const EX_HALL_BREAKPOINTS = buildExHallBreakpoints(EX_HALL_ZONES, EX_HALL_RAMP_SUBSEGMENTS);

/**
 * 広間スケールの補間値t(0=通常通路幅・1=広間フル幅)。yから連続に求める純関数。
 * §10-20#5 6巡目#3の不変条件: **絵のS倍(pixi/corridorLayer.ts)と横クランプの拡幅(playableArea.ts)は
 * 必ずこの1つの値から導くこと**(呼び出し側を分けない)。下記exHallTravel(O(y))とも**同じ
 * ブレークポイント表**から導く(検収監査#1・3巡目=同一の区分線形関数であることが受け入れ条件)。
 * §10-20#5「南の膜が閉じる時点(戦闘開始=EX_SURIEL_TRIGGER_Y)でt=1が完了していること」は、
 * 遷移帯の終端(南端ちょうど)がトリガーyより手前(南)にあることで満たされる
 * (南端-2300 > トリガー-2800 なので、トリガー到達時点で既にt=1)。
 */
export const exHallScaleT = (y: number, zones: ExHallZone[] = EX_HALL_ZONES): number => {
  const pts = zones === EX_HALL_ZONES ? EX_HALL_BREAKPOINTS : buildExHallBreakpoints(zones, EX_HALL_RAMP_SUBSEGMENTS);
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1], p1 = pts[i]; // p0.y > p1.y
    if (y <= p0.y && y >= p1.y) {
      const frac = p0.y === p1.y ? 0 : (p0.y - y) / (p0.y - p1.y);
      const hallS = p0.hallS + (p1.hallS - p0.hallS) * frac;
      // EX_HALL_SCALE=1(広間無効化)でゼロ除算→NaNが横クランプ経由でプレイヤー座標へ伝播するのを防ぐ
      return EX_HALL_SCALE <= 1 ? 0 : (hallS - 1) / (EX_HALL_SCALE - 1);
    }
  }
  return 0; // どの区間にも属さない(スタート手前 or 定義域より奥)=平坦(通常通路幅)
};

/** 広間スケールt(0..1)から移動可能帯の横クランプ(world px)を導く。絵のS倍と同じtを共有する。 */
export const exHallLateralClampFromT = (t: number): number =>
  CORRIDOR_LATERAL_CLAMP + (EX_HALL_LATERAL_CLAMP - CORRIDOR_LATERAL_CLAMP) * t;

/** yから直接、移動可能帯の横クランプ(world px)を返す(exHallScaleTのショートハンド)。 */
export const exHallLateralClamp = (y: number, zones: ExHallZone[] = EX_HALL_ZONES): number =>
  exHallLateralClampFromT(exHallScaleT(y, zones));

// --- §10-20#5 検収監査#1: O(y) = ∫₀^y dy'/hallS(y') の区分解析解 -------------------------------
// 各サブ区間はhallSがa→bへ線形に変化する短い区間なので、積分は閉じた式で書ける:
//   区間の長さL・hallSがa→bへ線形に変化する場合の積分 = a===b ? L/a : L·ln(b/a)/(b-a)
// hallS>0が常に成り立つため1/hallSは常に正=Oはyが負へ進むほど単調に増える(経路に依存しない、
// yだけの純関数)。
const oSegmentIntegral = (length: number, a: number, b: number): number =>
  a === b ? length / a : length * Math.log(b / a) / (b - a);

const EX_HALL_O_SEGMENTS = EX_HALL_BREAKPOINTS; // exHallScaleTと**同じ表**(検収監査#1・3巡目の核心)

/**
 * O(y) = ∫₀^y dy'/hallS(y') の閉じた式(§10-20#5検収監査#1)。yのみに依存する純関数=経路非依存
 * (再基準化・ワープ弁・インスタンス積算状態は一切不要)。corridorLayerへ渡すtravel(-player.y相当)を
 * この値に置き換えることで、container.scale(=hallS×zoom)の拡大とここでの流速の割引きが正確に
 * 打ち消し合い、広間内でも床/柱/灯/奥壁すべての見かけの流速が常にzoomのみに比例する
 * (=アクターの画面移動速度と一致=足が滑らない・受け入れ条件)。exHallScaleTと**同じブレークポイント
 * 表**から導出するため、両者の間に評価点以外のズレは生じない。
 */
export const exHallTravel = (y: number, zones: ExHallZone[] = EX_HALL_ZONES): number => {
  if (y >= 0) return -y;
  const pts = zones === EX_HALL_ZONES ? EX_HALL_O_SEGMENTS : buildExHallBreakpoints(zones, EX_HALL_RAMP_SUBSEGMENTS);
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1], p1 = pts[i]; // p0.y > p1.y
    if (y <= p1.y) { acc += oSegmentIntegral(p0.y - p1.y, p0.hallS, p1.hallS); continue; }
    // p1.y < y <= p0.y: このサブ区間の途中で終わる。
    const frac = (p0.y - y) / (p0.y - p1.y);
    const hallSAtY = p0.hallS + (p1.hallS - p0.hallS) * frac;
    acc += oSegmentIntegral(p0.y - y, p0.hallS, hallSAtY);
    return acc;
  }
  const lastY = pts.length ? pts[pts.length - 1].y : 0;
  acc += lastY - y; // 定義済み区間より更に奥(北)=平坦(hallS=1)の尾部
  return acc;
};

// §10-20#2(「奥壁もO(-6300)で同じ空間に置ける」): 奥壁のworld固定位置(北端-6000の300px奥)。
// exHallTravelへそのまま渡せば、床/柱/灯と同じO空間の値になる。
export const EX_BACK_WORLD_Y = EX_NORTH_LIMIT_Y - 300; // -6300
