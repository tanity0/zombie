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

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/**
 * 広間スケールの補間値t(0=通常通路幅・1=広間フル幅)。yから連続に求める純関数。
 * §10-20#5 6巡目#3の不変条件: **絵のS倍(pixi/corridorLayer.ts)と横クランプの拡幅(playableArea.ts)は
 * 必ずこの1つの値から導くこと**(呼び出し側を分けない)。
 * 遷移帯=広間の南端の手前EX_HALL_TRANSITION_PX(t:0→1)。北端の先も同じ幅で対称に扱う
 * (退出方向の急変を避ける=CLAUDE.md慣性則。実装時確認「帯が縮む向きの移動でスナップさせない」の対策)。
 * ★検収監査#1(2巡目・v3752): ランプは**線形**(旧: smoothstep)。下記exHallTravel(O(y))の閉じた式が
 * 「区間内でhallSがa→bへ線形に変化する」前提で導出されているため、hallS(=exHallScaleTから導く値)の
 * 形自体を線形に揃えないと、床の見かけの流速(container.scale側)とO(y)の打ち消し合いが遷移帯の途中で
 * ズレる(=線形でない形だと閉じた式が成立しない)。線形ランプでも位置(値)は連続=CLAUDE.md慣性則が
 * 禁じる「パッと切り替わる」瞬間移動ではない(速度の折れはあるが位置の跳躍は無い)。
 * §10-20#5「南の膜が閉じる時点(戦闘開始=EX_SURIEL_TRIGGER_Y)でt=1が完了していること」は、
 * 遷移帯の終端(南端ちょうど)がトリガーyより手前(南)にあることで満たされる
 * (南端-2300 > トリガー-2800 なので、トリガー到達時点で既にt=1)。
 */
export const exHallScaleT = (y: number, zones: ExHallZone[] = EX_HALL_ZONES): number => {
  for (const z of zones) {
    if (y <= z.southY && y >= z.northY) return 1; // 広間の内部=フル
    if (y > z.southY && y <= z.southY + EX_HALL_TRANSITION_PX) {
      // 南から進入(手前→奥へ進む向き)。
      return clamp01((z.southY + EX_HALL_TRANSITION_PX - y) / EX_HALL_TRANSITION_PX);
    }
    if (y < z.northY && y >= z.northY - EX_HALL_TRANSITION_PX) {
      // 北から退出(奥→更に奥/次の通路へ進む向き。フィル広間の北端=EX_NORTH_LIMIT_Yなのでここは通常
      // 到達しないが、スリィエル広間の北端は通路区間へ抜けるため対称に扱う)。
      return clamp01((y - (z.northY - EX_HALL_TRANSITION_PX)) / EX_HALL_TRANSITION_PX);
    }
  }
  return 0; // 広間の外(通常通路)
};

/** 広間スケールt(0..1)から移動可能帯の横クランプ(world px)を導く。絵のS倍と同じtを共有する。 */
export const exHallLateralClampFromT = (t: number): number =>
  CORRIDOR_LATERAL_CLAMP + (EX_HALL_LATERAL_CLAMP - CORRIDOR_LATERAL_CLAMP) * t;

/** yから直接、移動可能帯の横クランプ(world px)を返す(exHallScaleTのショートハンド)。 */
export const exHallLateralClamp = (y: number, zones: ExHallZone[] = EX_HALL_ZONES): number =>
  exHallLateralClampFromT(exHallScaleT(y, zones));

// --- §10-20#5 検収監査#1(2巡目・v3752): O(y) = ∫₀^y dy'/hallS(y') の区分解析解 ---------------------
// hallSは区分線形(定数区間+線形ランプ)なので、各区間の積分は閉じた式で書ける:
//   区間の長さL・区間内でhallSがa→bへ線形に変化する場合の積分 = a===b ? L/a : L·ln(b/a)/(b-a)
// hallS>0が常に成り立つため1/hallSは常に正=Oはyが負へ進むほど単調に増える(経路に依存しない、
// yだけの純関数。単純な「travel/hallS(現在地)」は絶対値の大きいtravelを終始割るため遷移帯で
// 導関数が負になり得たが、積分にはその問題が無い)。
const oSegmentIntegral = (length: number, a: number, b: number): number =>
  a === b ? length / a : length * Math.log(b / a) / (b - a);

/** y0>y1の1区間。hallSはy0でa・y1でbの値を取り、その間を線形に変化する(a===bなら平坦区間)。 */
interface ExHallOSegment { y0: number; y1: number; a: number; b: number; }

const buildExHallOSegments = (zones: ExHallZone[]): ExHallOSegment[] => {
  const segs: ExHallOSegment[] = [];
  let cursor = 0; // y=0(スタート)から南→北の順に区間を積み上げる
  for (const z of zones) {
    const tInStart = z.southY + EX_HALL_TRANSITION_PX;
    if (cursor > tInStart) segs.push({ y0: cursor, y1: tInStart, a: 1, b: 1 }); // 広間の手前=平坦(hallS=1)
    segs.push({ y0: tInStart, y1: z.southY, a: 1, b: EX_HALL_SCALE });          // 南から進入するランプ
    segs.push({ y0: z.southY, y1: z.northY, a: EX_HALL_SCALE, b: EX_HALL_SCALE }); // 広間の内部(平坦=S)
    const tOutEnd = z.northY - EX_HALL_TRANSITION_PX;
    segs.push({ y0: z.northY, y1: tOutEnd, a: EX_HALL_SCALE, b: 1 });           // 北へ退出するランプ
    cursor = tOutEnd;
  }
  return segs; // cursorより奥(北)は呼び出し側でhallS=1の尾部として扱う
};

const EX_HALL_O_SEGMENTS = buildExHallOSegments(EX_HALL_ZONES);

/**
 * O(y) = ∫₀^y dy'/hallS(y') の閉じた式(§10-20#5検収監査#1・2巡目)。yのみに依存する純関数=経路非依存
 * (再基準化・ワープ弁・インスタンス積算状態は一切不要)。corridorLayerへ渡すtravel(-player.y相当)を
 * この値に置き換えることで、container.scale(=hallS×zoom)の拡大とここでの流速の割引きが正確に
 * 打ち消し合い、広間内でも床/柱/灯/奥壁すべての見かけの流速が常にzoomのみに比例する
 * (=アクターの画面移動速度と一致=足が滑らない・受け入れ条件)。
 */
export const exHallTravel = (y: number, zones: ExHallZone[] = EX_HALL_ZONES): number => {
  if (y >= 0) return -y;
  const segs = zones === EX_HALL_ZONES ? EX_HALL_O_SEGMENTS : buildExHallOSegments(zones);
  let acc = 0;
  for (const seg of segs) {
    if (y <= seg.y1) { acc += oSegmentIntegral(seg.y0 - seg.y1, seg.a, seg.b); continue; }
    // y1 < y <= y0: この区間の途中で終わる(区間の残りは未消費のまま関数を抜ける)。
    const hallSAtY = seg.a + (seg.b - seg.a) * ((seg.y0 - y) / (seg.y0 - seg.y1));
    acc += oSegmentIntegral(seg.y0 - y, seg.a, hallSAtY);
    return acc;
  }
  const lastY1 = segs.length ? segs[segs.length - 1].y1 : 0;
  acc += lastY1 - y; // 定義済み区間より更に奥(北)=平坦(hallS=1)の尾部
  return acc;
};

// §10-20#2(検収監査#1・2巡目「奥壁もO(-6300)で同じ空間に置ける」): 奥壁のworld固定位置
// (北端-6000の300px奥)。exHallTravelへそのまま渡せば、床/柱/灯と同じO空間の値になる。
export const EX_BACK_WORLD_Y = EX_NORTH_LIMIT_Y - 300; // -6300
