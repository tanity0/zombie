// ★鞭の普通の振りの見た目(社長 2026-11-20「鞭はちゃんと鞭っぽくしならせてから叩きつける感じに」「そのためにまっすぐの絵にしてあるので」
//   「悪魔城ドラキュラとか参考にして」「鞭振るときのプレイヤーの動きはナイフの逆で、振り上げから しゃがみ へ」)。
// 判定(前隙 MELEE_WINDUP_MS の後に解く・帯の長さ/幅・ダメージ)は何も変えない=ここは絵の形だけを決める純関数(store にも描画にも依存しない)。
//  - 鞭(まっすぐの絵をロープで曲げる): ①引く=体の後ろへ持ち上げる(頭の上を通る) ②溜め=後ろで少し垂れて止まる
//    ③打ち出し=手元から先端へほどけて加速 ④パチン=前隙の終わり(=当たる瞬間)にまっすぐ伸び切って一拍止まる ⑤戻り=たるんで縮み消える。
//  - 体: ナイフ(しゃがみ→立ち上がって振る)の逆=振り上げ(伸び上がり・後ろへ反る)→パチンの瞬間にしゃがみの底。
// 数値は叩き台(実機で詰める)。
import { whipOverheadProgress, whipOverheadProgressVel, criticalSpringStep, WHIP_OVERHEAD_MS, WHIP_OVERHEAD_RISE_FRAC } from './whipSwing'; // ボスの叩きつけの進み(判定と同じ1本)

/** パチンの後、まっすぐ伸び切って止まる長さ(ms)。 */
export const WHIP_ROPE_CRACK_HOLD_MS = 90;
/** 戻り(たるんで縮み消える)の長さ(ms)。 */
export const WHIP_ROPE_RETRACT_MS = 200;
/** 鞭のロープの点の数(手元の柄を含む)。 */
export const WHIP_ROPE_POINTS = 16;
/** 前隙の中の区切り(割合): 引き終わり・溜め終わり(=打ち出しの始まり)。 */
export const WHIP_ROPE_PULL_END = 0.35;
export const WHIP_ROPE_HOLD_END = 0.6;

/** ロープ全体の長さ(ms)。 */
export const whipRopeTotalMs = (windupMs: number): number => windupMs + WHIP_ROPE_CRACK_HOLD_MS + WHIP_ROPE_RETRACT_MS;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
const smooth = (t: number): number => t * t * (3 - 2 * t);
const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** 手元からの割合 u(0..1)の所の向き(rad・振りの向き=0・+は「下」側)。止まっている時の垂れ(前へ下がって垂れている)。 */
const restAngle = (u: number): number => 0.5 + 0.6 * u;
/**
 * ★3連撃の3段目の引きの量(見え方の監査 A7「3段目が正面に見えない」)。1=普通の引き。これより大きいほど手元を大きく後ろ上へ引き、
 * 鞭を頭上の後ろへまっすぐ振りかぶる(パチンの時刻は変えない)。描く側はこれが 1 より大きい振りを「縦の面」(y=高さ・頭上)で描く。
 */
export const WHIP_ROPE_FINISH_PULL = 1.45;

/**
 * ★転がる輪(rolling loop・社長指示2026-11-26「鞭のしなりをもっとぐにゃっと150度ぐらい曲げてほしい。そこから円を描くように伸びるんじゃなくて、
 * そのまま伸びていく感じ。鞭の動きをできるだけリアルに再現したい」)。
 * 打ち出しで手元が前へ出ると、縄は体の外で約150度折り返して細長いU字(ヘアピン)になる。折れ目は縄に沿って先端へ加速しながら転がり、
 *  - 折れ目より手元側=手元の向き(lean・パチンへ向けて 0=狙いの向きへ戻る)へまっすぐ並ぶ
 *  - 折れ目より先端側=折り返し(WHIP_LOOP_TURN_RAD・輪の側)へまっすぐ
 * 折れ目は先へ行くほど締まって速くなり、先端から抜けた瞬間(=前隙の終わり=判定の時刻)に縄がまっすぐ伸び切る=パチン。
 * その後は先端が大きく跳ね返り、波が先端へ抜けながらすぐにたるみ始める(止まって見せない・いきなり倒れない)。
 * 縄全体を回して払う(円弧を描く)動きは使わない。
 */
export const WHIP_LOOP_TURN_RAD = (150 * Math.PI) / 180;
/**
 * 転がる間の折り返しの角度(rad)。折れ目が先へ出るほど(先端側が短くなるほど)2本を寄せて細い輪(ヘアピン)のまま転がす
 * (2本が開いたまま並ぶと二股=Y字に見える・クリエイティブ監査2巡目 #3)。
 */
export const WHIP_LOOP_TURN_ROLL_RAD = (168 * Math.PI) / 180;
/** 3段目の折り返し(深く折る・#6)。 */
export const WHIP_LOOP_TURN_FIN_RAD = (162 * Math.PI) / 180;
/** 前隙の中の区切り(割合): 折れを作り始める(手元側が前へ返り始める)。 */
export const WHIP_LOOP_FORM_START = 0.45;
/** 前隙の中の区切り(割合): 折れができ上がって転がり始める(=前隙の約6割)。ここから当たる時刻まで、折れが見えている。 */
export const WHIP_LOOP_ROLL_START = 0.6;
/** 3段目: 折れを早めに作り始め、深く・ゆっくり作ってから(ROLL_START まで)一気に伸ばす(当たる時刻は同じ・#6)。 */
export const WHIP_LOOP_FIN_FORM_START = 0.38;
export const WHIP_LOOP_FIN_ROLL_START = 0.74;
/** 折れができ上がった時の位置(縄の長さに対する割合)。体の外で折れる(体に隠れない)。 */
export const WHIP_LOOP_START_AT = 0.36;
/** 上下の向き(縦の向き)の振りで折れ目を足す量(縄の長さの割合・|sin(向き)| を掛ける)。奥行きは短く写り体に重なるので、さらに外で折る。 */
export const WHIP_LOOP_START_UP_EXTRA = 0.1;
/** 3段目の折れの出だしの位置(頭の上の前で折る)。 */
export const WHIP_LOOP_FIN_START_AT = 0.5;
/** 3段目の縦の面を横へ倒す角度(rad・上下の向きで掛かり切る・|sin(向き)| を掛ける)。上下の向きでも頭上の折れが体の横に見える(#5)。 */
export const WHIP_LOOP_FIN_TILT_RAD = (68 * Math.PI) / 180;
/**
 * 上下の向きの振りで、折れを作る時に手元側を横へ寝かせる角度(rad・|sin(向き)| を掛ける)。U字が画面の横へ出る(頭の後ろに隠れない・
 * 縦につぶれない・#5)。折れ目が先へ転がるほど 0 へ戻り、パチンで狙いの向きへまっすぐ。
 */
export const WHIP_LOOP_VERTICAL_LEAN_RAD = (42 * Math.PI) / 180;
/** 3段目: 折れを作る時に手元側を頭上へ立てる角度(rad・縦の面で前から上へ)。折れは頭の上の前にでき、振り下ろしながら伸びる。 */
export const WHIP_LOOP_FIN_LEAN_RAD = (40 * Math.PI) / 180;
/** 折れ目の曲がりの長さ(縄の長さに対する割合): 転がり始め → 抜ける時。曲がりを短い区間に集めつつ、丸い頭が見える長さ。 */
export const WHIP_LOOP_WIDTH_START = 0.2;
export const WHIP_LOOP_WIDTH_END = 0.06;
/** 折れ目の進み = 線形の割合×q + (1-割合)×q^冪。出だしは遅く、先端で一番速い(慣性・等速にしない)。 */
export const WHIP_LOOP_ROLL_LINEAR = 0.25;
export const WHIP_LOOP_ACCEL_POW = 1.7;
/** 3段目: 出だしをもっと粘り、最後に一気に伸ばす冪。 */
export const WHIP_LOOP_FIN_ACCEL_POW = 2.4;
/** 先端側が溜めの形から張ったまっすぐの折り返しへ移るまで(前隙の割合・折れを作り始めてから)。 */
export const WHIP_LOOP_TAUT_SPAN = 0.3;
/** 溜めの向き(rad・1・2段目=体の後ろ寄り・輪の側。真後ろでなく横へ逃がす=体に重ならない)。 */
export const WHIP_ROPE_HOLD_RAD = (128 * Math.PI) / 180;
/** 溜めの形の垂れ(rad・先端・手元から先へ垂れて、先端が一番遅れる)。 */
export const WHIP_ROPE_HOLD_CURL = 0.45;
/** 3段目(頭上)の溜めの垂れの掛け。 */
export const WHIP_ROPE_FINISH_CURL_K = 0.5;
/** 3段目(頭上)の溜めの向き(rad・縦の面で前から測る=約112度=頭上高く、少し後ろ)。打ち出しで頭上の前へ折り返しながら前へ落ちてくる。 */
export const WHIP_ROPE_FINISH_HOLD_RAD = 1.95;
/** 3段目(頭上)の溜めで手元を持ち上げる高さ(px・引きの量を掛ける前)。 */
export const WHIP_ROPE_FINISH_HAND_RAISE = 34;
/**
 * 引きの遅れ(引きの割合・先端)。手が先に動き、縄は根元から順に引きずられて曲がる=先端ほど遅れて動き出す(棒のように回らない・#1)。
 * 先端は引きの割合のこれだけ後から動き出し、引き終わりで溜めの形に追いつく。
 */
export const WHIP_ROPE_PULL_DELAY = 0.55;
/** 振り抜けで先端が前(払う向き)へ流れる量(rad・先端)。 */
export const WHIP_ROPE_FOLLOW_FLOW = 0.7;
/**
 * パチンの後、先端が手前(輪の側)へ跳ね返る量(rad・先端の区間の折れ)と、折れる所(縄の長さの割合)・山までの長さ・収まるまでの長さ(ms)。
 * 先端が縄の長さの1〜2割ぶん戻る(#4: この縮尺で読める大きさ)。
 */
export const WHIP_CRACK_RECOIL = 1.75;
export const WHIP_CRACK_RECOIL_AT = 0.8;
export const WHIP_CRACK_RECOIL_PEAK_MS = 34;
export const WHIP_CRACK_RECOIL_MS = 150;
/** パチンの後、手元から先端へ抜けていく波の強さ(rad)と、先端を抜けるまでの長さ(ms)。 */
export const WHIP_CRACK_WAVE = 0.45;
export const WHIP_CRACK_WAVE_MS = 150;
/** パチンの後のたるみ(rad・先端)。鳴った直後から張った縄が緩んで垂れ始め、戻りの終わりまで重さで加速しながら垂れる(いきなり倒れない)。 */
export const WHIP_ROPE_SLACK = 0.35;
export const WHIP_ROPE_DROOP = 1.3;

export interface WhipRopeShape {
  /** 手元(柄の握り)の位置のずれ(px・振りの向きの座標=x 前・y 下)。 */
  handX: number; handY: number;
  /** 手元から先端までの各点の向き(rad・振りの向き=0)。長さ=区間の数。 */
  angles: number[];
  /** 長さの掛け(1=射程ちょうど)。 */
  lenK: number;
  /** 濃さ(0..1)。 */
  alpha: number;
  /** どの段か(撮影・テスト用)。 */
  phase: 'pull' | 'hold' | 'lash' | 'crack' | 'retract' | 'done';
}

/**
 * 転がっている間の折れ目の真ん中の位置(縄に沿った割合)と曲がりの長さ。q=転がりの割合(0..1・転がり始め→前隙の終わり)。
 * q=0 で体の外(startAt)・q=1 で先端の外(全部まっすぐ)。p=折れ目の進み(0..1・加速)。
 */
export const whipLoopAt = (q: number, startAt = WHIP_LOOP_START_AT, pow = WHIP_LOOP_ACCEL_POW): { center: number; width: number; p: number } => {
  const c = clamp01(q);
  const p = WHIP_LOOP_ROLL_LINEAR * c + (1 - WHIP_LOOP_ROLL_LINEAR) * c ** pow;
  const width = WHIP_LOOP_WIDTH_START + (WHIP_LOOP_WIDTH_END - WHIP_LOOP_WIDTH_START) * p;
  const c1 = 1 + WHIP_LOOP_WIDTH_END / 2;
  return { center: startAt + (c1 - startAt) * p, width, p };
};
/** 折れ目より手元側=a1・先=a2(短い区間 width で折れる=ヘアピン)。 */
const loopAngle = (u: number, center: number, width: number, a1: number, a2: number): number =>
  a1 + (a2 - a1) * smooth(clamp01((u - center) / width + 0.5));

/**
 * ★向きごとの輪の作り方(描く側が狙いの向き・払い・段から決める・クリエイティブ監査2巡目 #2/#5)。
 * 体の絵(足元から体の高さぶんの縦長の箱)を避け、どの向きでもU字が画面に見えるように:
 *  - 横寄りの向き(左右・斜め): 輪は画面の手前(下)側=体の箱の外(足元より前)へ折る(lag=+1。形の座標の +y が画面の下)。
 *  - 上下の向き: 輪は画面の横へ(払いの来る側)。折れを作る時に手元側を横へ寝かせ(lean)、U字を体の横に出す。
 *  - 3段目(頭上・縦の面): 手元側を頭上へ立てて(lean<0=上)頭の上の前で折り、先端側は前へ垂らす(lag=+1=下へ折り返す)。
 * aim=狙いの向き(rad・画面の y は下が正)。sweep=払い(符号つき・0=正面)。pull>1=3段目。
 */
export const whipLoopPose = (aim: number, sweep: number, pull: number): { lag: 1 | -1; lean: number; startAt: number; tilt: number } => {
  const v = Math.abs(Math.sin(aim));
  if (pull > 1) {
    return { lag: 1, lean: -WHIP_LOOP_FIN_LEAN_RAD, startAt: WHIP_LOOP_FIN_START_AT, tilt: WHIP_LOOP_FIN_TILT_RAD * v };
  }
  if (v < 0.8) return { lag: 1, lean: 0, startAt: WHIP_LOOP_START_AT + WHIP_LOOP_START_UP_EXTRA * v, tilt: 0 };
  const side = Math.cos(aim) >= 0 ? 1 : -1; // 描く側が形の y に掛ける符号と同じ
  const lag: 1 | -1 = sweep ? (side * -Math.sign(sweep) > 0 ? 1 : -1) : 1;
  const k = (v - 0.8) / 0.2; // 縦に寄るほど大きく寝かせる
  return { lag, lean: lag * WHIP_LOOP_VERTICAL_LEAN_RAD * smooth(clamp01(0.4 + 0.6 * k)), startAt: WHIP_LOOP_START_AT + WHIP_LOOP_START_UP_EXTRA * v, tilt: 0 };
};

/**
 * 経過 el(ms・指を離した瞬間から)の鞭の形。windupMs=前隙(=パチンの時刻=判定の時刻)。
 * 前隙の終わり(el=windupMs)で必ずまっすぐ(全区間の向き0・長さ1・手元のずれ0)=判定の帯と鞭の本体が重なる。
 * lag=輪を作る側(この形の座標での符号・+1/-1・0=-1 と同じ)。lean=折れを作る時の手元側の向き(rad・転がるほど 0 へ)。
 * pull>1=3段目(頭上へ大きく振りかぶる。描く側は縦の面=y を高さとして描く。溜めは常に上=y の負)。
 * ①引く: 手が先に後ろへ動き、縄は根元から順に引きずられて曲がる(先端が一番遅れる・減速して止まる)
 * ②溜め: 後ろ(輪の側)で垂れて止まる(先だけ揺れる)
 * ③打ち出し: 手元側が前へ返って体の外で約150度のヘアピンに折れ(FORM_START→ROLL_START)、折れ目が先端へ加速して転がる。
 *    転がる間は2本を寄せて細い輪のまま進む。手元も前へ戻る
 * ④パチン: まっすぐ伸び切る→先端が大きく跳ね返り、波が先端へ抜け、すぐにたるみ始める ⑤戻り: 重さで垂れながら縮み消える。
 */
export const whipRopeShape = (
  el: number, windupMs: number, segs = WHIP_ROPE_POINTS - 1, pull = 1, lag = 0, startAt = WHIP_LOOP_START_AT, lean = 0,
): WhipRopeShape => {
  const W = Math.max(1, windupMs);
  const pk = Math.max(1, pull);
  const fin = pk > 1;
  const side = lag > 0 ? 1 : -1; // 輪を作る側
  const holdSide = fin ? -1 : side; // 溜めの側(3段目は頭上=上)
  const restSide = fin ? 1 : side; // 振る前の垂れの側(3段目は下へ垂れている)
  // 引いた手元(後ろ・溜めの側)。3段目(頭上)は腕を頭の上へ振り上げる=手元を高く(縦の面の y の負=上)、後ろへは少しだけ。
  const hX = (fin ? -6 : -10) * pk, hY = (fin ? WHIP_ROPE_FINISH_HAND_RAISE : 12) * pk * holdSide;
  const curl = WHIP_ROPE_HOLD_CURL * (fin ? WHIP_ROPE_FINISH_CURL_K : 1);
  const base = fin ? WHIP_ROPE_FINISH_HOLD_RAD : WHIP_ROPE_HOLD_RAD;
  const rest = (u: number): number => restSide * restAngle(u);
  // 溜めの形: 後ろ寄り(溜めの側)へ、手元から先へ垂れて先端が一番遅れる。3段目は頭上高く。
  const holdA = (u: number): number => holdSide * (base + curl * u ** 1.5);
  const us = Array.from({ length: segs }, (_, i) => (i + 0.5) / segs);
  if (el >= whipRopeTotalMs(W)) return { handX: 0, handY: 0, angles: us.map(() => 0), lenK: 0.65, alpha: 0, phase: 'done' };
  const pullEnd = W * WHIP_ROPE_PULL_END;
  if (el < pullEnd) {
    // ①引く: 手が先に動き(早めに着く)、縄は根元から順に遅れて引きずられる(先端ほど遅れて動き出し、減速して溜めに着く)。
    const t = clamp01(el / pullEnd);
    const ph = easeOutCubic(clamp01(t * 1.35));
    return {
      handX: hX * ph, handY: hY * ph,
      angles: us.map(u => {
        const d = WHIP_ROPE_PULL_DELAY * u ** 0.85; // 動き出し(先端ほど遅い)
        const e = 1 - (1 - WHIP_ROPE_PULL_DELAY) * (1 - u); // 着き(根元は早く着き、先端は引き終わりに追いつく)
        const p = easeInOut(clamp01((t - d) / Math.max(1e-6, e - d)));
        return rest(u) + (holdA(u) - rest(u)) * p;
      }),
      lenK: 1, alpha: 1, phase: 'pull',
    };
  }
  const formAt = W * (fin ? WHIP_LOOP_FIN_FORM_START : WHIP_LOOP_FORM_START);
  const rollAt = W * (fin ? WHIP_LOOP_FIN_ROLL_START : WHIP_LOOP_ROLL_START);
  if (el < formAt) {
    // ②溜め: 後ろで先がまだ揺れている(根元から先へ波が流れる・溜めの終わりへ向けて収まる)。
    const h = (el - pullEnd) / Math.max(1e-6, formAt - pullEnd);
    return {
      handX: hX, handY: hY,
      angles: us.map(u => holdA(u) + 0.3 * u * u * Math.sin(h * Math.PI) * Math.cos(Math.PI * (u - h))),
      lenK: 1, alpha: 1, phase: 'hold',
    };
  }
  if (el < W) {
    // ③打ち出し。先端側は溜めの形から張ったまっすぐの折り返しへ(taut)。手元は前へ戻る(加減速)。
    // 3段目は振り上げた手を折れができる間に下ろし切る(手元が顔の前に残って縄が頭に重ならない)。
    const hk = 1 - smooth(clamp01((el - formAt) / ((fin ? rollAt : W) - formAt)));
    const taut = smooth(clamp01((el - formAt) / (W * WHIP_LOOP_TAUT_SPAN)));
    const turn0 = fin ? WHIP_LOOP_TURN_FIN_RAD : WHIP_LOOP_TURN_RAD;
    const pow = fin ? WHIP_LOOP_FIN_ACCEL_POW : WHIP_LOOP_ACCEL_POW;
    // 折れの形(手元側の向き a1・先端側の向き a2)。先端側は溜めの形から張った折り返しへ移る。
    const shape = (center: number, width: number, a1: number, turn: number): number[] => {
      const a2 = a1 + side * turn;
      return us.map(u => loopAngle(u, center, width, a1, holdA(u) + (a2 - holdA(u)) * taut));
    };
    let angles: number[];
    if (el < rollAt) {
      // 折れを作る: 手元側が溜めの向きから前(lean)へ返り、体の外(startAt)にヘアピンができる(止まった所から動き出して着く)。
      const k = smooth((el - formAt) / (rollAt - formAt));
      const { center, width } = whipLoopAt(0, startAt, pow);
      const tgt = shape(center, width, lean, turn0);
      angles = us.map((u, i) => holdA(u) * (1 - k) + tgt[i] * k);
    } else {
      // 転がる: 折れ目が先端へ加速して進み、締まっていく。手元側は lean から狙いの向きへ戻り、2本は寄って細い輪のまま進む。
      const { center, width, p } = whipLoopAt((el - rollAt) / (W - rollAt), startAt, pow);
      const turn = turn0 + (Math.max(turn0, WHIP_LOOP_TURN_ROLL_RAD) - turn0) * smooth(clamp01(p / 0.35));
      angles = shape(center, width, lean * (1 - smooth(p)), turn);
    }
    return { handX: hX * hk, handY: hY * hk, angles, lenK: 1, alpha: 1, phase: 'lash' };
  }
  // ④パチン〜⑤戻り(1本の式で続ける=継ぎ目で止まらない)。
  const post = el - W;
  if (post === 0) return { handX: 0, handY: 0, angles: us.map(() => 0), lenK: 1, alpha: 1, phase: 'crack' };
  // 跳ね返り: 先端の区間が輪の側へ大きく折れ返ってから(山 WHIP_CRACK_RECOIL_PEAK_MS)、減速して伸び戻る。
  const recEnv = post < WHIP_CRACK_RECOIL_PEAK_MS
    ? Math.sin((Math.PI / 2) * (post / WHIP_CRACK_RECOIL_PEAK_MS))
    : 1 - smooth(clamp01((post - WHIP_CRACK_RECOIL_PEAK_MS) / (WHIP_CRACK_RECOIL_MS - WHIP_CRACK_RECOIL_PEAK_MS)));
  const rec = side * WHIP_CRACK_RECOIL * recEnv;
  // 波: 手元から先端へ抜けていく(抜けるほど弱く)。先端側は少し不規則に。
  const s = post / WHIP_CRACK_WAVE_MS;
  const wa = -side * WHIP_CRACK_WAVE * smooth(clamp01(post / 15)) * (1 - clamp01(s / 1.6));
  // たるみ: 鳴った直後から張った縄が緩み、重さで加速しながら垂れていく(戻りの終わりまで1本の式・いきなり倒れない)。
  const postAll = WHIP_ROPE_CRACK_HOLD_MS + WHIP_ROPE_RETRACT_MS;
  const fall = clamp01(post / postAll);
  const slack = WHIP_ROPE_SLACK * smooth(clamp01(post / 110)) + WHIP_ROPE_DROOP * fall ** 1.7;
  const rt = clamp01((post - WHIP_ROPE_CRACK_HOLD_MS) / WHIP_ROPE_RETRACT_MS);
  const r = easeInOut(rt);
  // 振り抜け: 跳ね返りの後、払った勢いで先端が輪と逆の側へ流れてから垂れる。
  const flow = -side * WHIP_ROPE_FOLLOW_FLOW * (fin ? 0.5 : 1) * Math.sin(Math.PI * clamp01((post - 40) / 220)) * smooth(clamp01((post - 40) / 60));
  const droopSide = fin ? 1 : restSide; // 垂れる側(3段目は下へ)
  return {
    handX: 0, handY: 0,
    angles: us.map(u => {
      const x = u - s;
      const wave = wa * Math.sin((2 * Math.PI * x) / 0.24 + 0.7 * Math.sin(9 * u)) * Math.exp(-((x / 0.13) ** 2));
      const tip = smooth(clamp01((u - WHIP_CRACK_RECOIL_AT) / 0.1 + 0.5));
      return rec * tip + wave + droopSide * slack * (0.15 + u ** 1.5) + flow * u ** 1.6;
    }),
    lenK: 1 - 0.35 * r, alpha: 1 - r ** 1.5, phase: post < WHIP_ROPE_CRACK_HOLD_MS ? 'crack' : 'retract',
  };
};

/**
 * 形 → 点の並び(振りの向きの座標・手元=原点+ずれ)。len=射程(px)。gripFrac=絵の左端から握りまでの割合(握りより手前の柄は手元の向きのまま後ろへ)。
 * 点は絵の左端(柄の端)から右端(先端)まで。全長 = len / (tipFrac - gripFrac)。
 */
export const whipRopePoints = (
  shape: WhipRopeShape, len: number, gripFrac: number, tipFrac: number,
): { x: number; y: number }[] => {
  const segs = shape.angles.length;
  const L = len * shape.lenK;
  const seg = L / segs;
  const total = L / Math.max(1e-6, tipFrac - gripFrac);
  const handle = total * gripFrac, tail = total * (1 - tipFrac);
  const a0 = shape.angles[0] ?? 0, aN = shape.angles[segs - 1] ?? 0;
  const pts: { x: number; y: number }[] = [{ x: shape.handX - Math.cos(a0) * handle, y: shape.handY - Math.sin(a0) * handle }];
  let x = shape.handX, y = shape.handY;
  pts.push({ x, y });
  for (const a of shape.angles) { x += Math.cos(a) * seg; y += Math.sin(a) * seg; pts.push({ x, y }); }
  pts.push({ x: x + Math.cos(aN) * tail, y: y + Math.sin(aN) * tail });
  return pts;
};

/** 3段目(縦の面)を横へ倒す最大の角度(rad)。上下の向きの振りで掛かり切る(描く側が |sin(向き)| を掛ける)。 */
export const WHIP_FINISH_PLANE_TILT_RAD = (35 * Math.PI) / 180;
/** ★普通の振り(whiprope)の縄の点の数(手元の柄を含む)。転がる輪を滑らかに曲げるため、張った縄(WHIP_ROPE_POINTS)より細かい。 */
export const WHIP_LOOP_ROPE_POINTS = 40;
/**
 * ★普通の振りの縄の点列(根元の柄の端→先端・振りの向きの座標)。x=前・y=横(地面の上・+=形の座標の「下」側)・h=高さ(上が+)。
 * overhead=3段目(頭上): 輪を縦の面で転がす=形の y を高さにする(y の負=上)。それ以外は地面の面(h=0)。
 * tilt=縦の面を横へ倒す角度(rad・3段目だけ。描く側が上下の向きほど大きくする)。
 * 描く側: 地面の点 = 手元 + x·前 + y·横、高さ h を持ち上げる(新方式 proj は projLiftPointInto・旧方式は画面の y から引く)。
 */
export const whipSwingRopePoints = (
  el: number, windupMs: number, len: number, gripFrac: number, tipFrac: number, opts: { lag?: number; pull?: number; segs?: number; tilt?: number; startAt?: number; lean?: number } = {},
): { pts: { x: number; y: number; h: number }[]; alpha: number; phase: WhipRopeShape['phase'] } => {
  const pull = opts.pull ?? 1;
  const shape = whipRopeShape(el, windupMs, opts.segs ?? WHIP_LOOP_ROPE_POINTS - 1, pull, opts.lag ?? 0, opts.startAt, opts.lean ?? 0);
  const overhead = pull > 1;
  // 縦の面を横へ倒す(tilt rad)。上下の向きの振りで輪が平たくつぶれないように(形の y の一部を横へ逃がす)。
  const ts = Math.sin(opts.tilt ?? 0), tc = Math.cos(opts.tilt ?? 0);
  const pts = whipRopePoints(shape, len, gripFrac, tipFrac).map(p => (overhead ? { x: p.x, y: p.y * ts, h: -p.y * tc } : { x: p.x, y: p.y, h: 0 }));
  return { pts, alpha: shape.alpha, phase: shape.phase };
};

/** 払いの振り抜け(パチンの後に勢いで流れる量)の、打ち出しの尺に対する時定数の割合。流れる量 = 振れ幅 × 0.45。 */
export const WHIP_ROPE_SWEEP_FOLLOW_K = 0.225;
/**
 * ★3連撃の払い(社長指示2026-11-26「絵は左右に振りつつ正面を」)。鞭全体の向きのずれ(rad)。sweep=振れ幅(符号つき・0=正面へまっすぐ)。
 * 引く間に払いの始まりの側へ回り込み(減速して止まる)→ 溜めはそのまま → 打ち出しで加速しながら払い、パチン(el=windupMs)でちょうど 0
 * (=判定の帯の向きでまっすぐ)→ その時の速さのまま振り抜け、減速して止まる(慣性・瞬間停止しない)。
 */
export const whipRopeSweepOffset = (el: number, windupMs: number, sweep: number): number => {
  if (!sweep) return 0;
  const W = Math.max(1, windupMs);
  if (el < W * WHIP_ROPE_PULL_END) return -sweep * easeOutCubic(clamp01(el / (W * WHIP_ROPE_PULL_END)));
  if (el < W * WHIP_ROPE_HOLD_END) return -sweep;
  const lash = W * (1 - WHIP_ROPE_HOLD_END);
  if (el < W) { const q = clamp01((el - W * WHIP_ROPE_HOLD_END) / lash); return -sweep * (1 - q * q); }
  const tau = lash * WHIP_ROPE_SWEEP_FOLLOW_K;
  const v = (2 * sweep) / lash; // パチンの瞬間の回る速さ(rad/ms)
  return v * tau * (1 - Math.exp(-(el - W) / tau));
};

/** 3段目のしなり(赤い軌跡)が振りかぶりで回り込む量(rad・狙いの向きから頭上の後ろへ)。 */
export const WHIP_FINISH_BACK_RAD = 2.3;
/** 3段目のパチンの後、勢いで行き過ぎてから狙いの向きへ戻る時定数(ms)。行き過ぎの量 = 回る速さ × これ / e。 */
export const WHIP_FINISH_FOLLOW_TAU_MS = 12;
/**
 * ★3連撃の3段目の振りかぶり(見え方の監査 A7「3段目が正面に見えない(溜めが1段目と同じS字)」)。しなり全体の向きのずれ(rad)。
 * sign=頭上へ回る向き(+1/-1・画面の上を通る側)。引く間に頭上の後ろ(WHIP_FINISH_BACK_RAD)へ回り込んで止まる(減速)→ 溜めはそのまま →
 * 打ち出しで加速しながら頭上を越えて振り下ろし、パチン(el=windupMs)でちょうど 0(=判定の帯の向き)→ 勢いで少し行き過ぎて戻る(慣性・瞬間停止しない)。
 */
export const whipFinishSweepOffset = (el: number, windupMs: number, sign: number): number => {
  if (!sign) return 0;
  const W = Math.max(1, windupMs), B = WHIP_FINISH_BACK_RAD * Math.sign(sign);
  if (el < W * WHIP_ROPE_PULL_END) return -B * easeOutCubic(clamp01(el / (W * WHIP_ROPE_PULL_END)));
  if (el < W * WHIP_ROPE_HOLD_END) return -B;
  const lash = W * (1 - WHIP_ROPE_HOLD_END);
  if (el < W) { const q = clamp01((el - W * WHIP_ROPE_HOLD_END) / lash); return -B * (1 - q * q); }
  const v = (2 * B) / lash, t = el - W;
  return v * t * Math.exp(-t / WHIP_FINISH_FOLLOW_TAU_MS);
};

export interface WhipBodyPose {
  /** 体の絵: 'swing'=振り上げの絵 / 'ready'=しゃがみの絵 / null=差し替えない。 */
  pose: 'swing' | 'ready' | null;
  /** 横・縦の伸び縮み(1=そのまま)。 */
  sqX: number; sqY: number;
  /** 傾き(向き face を掛けて使う・+=前へ)。rad。 */
  lean: number;
}

/**
 * 体の動き(ナイフの逆=振り上げ→しゃがみ)。el=指を離してから(ms)。前隙の終わり(=パチン=当たる瞬間)がしゃがみの底。
 * 振り上げは伸び上がって後ろへ反る(減速して止まる)→打ち出しで加速して沈み、パチンで底→戻りは慣性つきで立ち姿へ。
 */
export const whipBodyPose = (el: number, windupMs: number, recoverMs = WHIP_ROPE_CRACK_HOLD_MS + WHIP_ROPE_RETRACT_MS, holdMs = 0): WhipBodyPose => {
  const W = Math.max(1, windupMs);
  if (el < 0 || el >= W + holdMs + recoverMs) return { pose: null, sqX: 1, sqY: 1, lean: 0 };
  // 伸び上がり(up=1)としゃがみ(down=1)の量。
  let up = 0, down = 0;
  if (el < W * WHIP_ROPE_HOLD_END) up = easeOutCubic(clamp01(el / (W * WHIP_ROPE_PULL_END)));
  else if (el < W) {
    const q = clamp01((el - W * WHIP_ROPE_HOLD_END) / (W * (1 - WHIP_ROPE_HOLD_END)));
    const qq = q * q; // 加速して沈む
    up = 1 - qq; down = qq;
  } else if (holdMs > 0) {
    // ★3段目の後の隙(utils/whipCombo の whipComboBodyRecover): 振り抜いた底で粘り、重さを持ってゆっくり立ち上がる(動き始めも終わりも加減速)。
    down = el < W + holdMs ? 1 : 1 - easeInOut(clamp01((el - W - holdMs) / Math.max(1, recoverMs)));
  } else down = 1 - easeOutCubic(clamp01((el - W) / recoverMs));
  return {
    pose: el < W ? 'swing' : 'ready',
    sqX: 1 - 0.07 * up + 0.12 * down,
    sqY: 1 + 0.12 * up - 0.18 * down,
    lean: -0.2 * up + 0.24 * down,
  };
};

// ---- ★鞭の絡め取り→振り回し→投げの見た目(research/WHIP_FOLLOWUP.md §8・見え方の監査 2026-11-25)。判定は utils/whipSwing のまま=ここは絵の形だけ。 ----

/**
 * 手元→掴んだ敵へ張った縄の形(whipRopePoints にそのまま渡せる形)。両端は手と敵に留めたまま、真ん中を回転と逆向きへ弓なりに遅らせる。
 * bow=たわみの強さ(rad・0=まっすぐ)。dir=回る向き(+1=角度が増える向き)。縄の座標は x=手→敵・y=その左手(+90°)なので、
 * 動く向きは +dir・遅れる側は -dir。角度は cos で前半と後半が打ち消し合う=先端は必ず敵の位置に着く(長さは lenK で合わせる)。
 */
export const whipTetherShape = (bow: number, dir: 1 | -1, alpha = 1, segs = WHIP_ROPE_POINTS - 1): WhipRopeShape => {
  const angles = Array.from({ length: segs }, (_, i) => -dir * bow * Math.cos(Math.PI * (i + 0.5) / segs));
  const sumCos = angles.reduce((s, a) => s + Math.cos(a), 0);
  return { handX: 0, handY: 0, angles, lenK: segs / Math.max(1e-6, sumCos), alpha, phase: 'crack' };
};

/** 振り回しのたわみ(rad)。回り出し(加速中)ほど遅れて大きくたわみ、最高速で張る(わずかに震える)。angVelFrac=今の角速度/最高の角速度。 */
export const whipTetherBow = (angVelFrac: number, tMs: number): number => {
  const slack = 1 - clamp01(angVelFrac);
  return 0.95 * slack ** 1.3 + 0.025 * Math.sin(tMs * 0.031);
};

/** 放した後、線の先が手元へ巻き戻る長さ(ms)。 */
export const WHIP_TETHER_RETRACT_MS = 150;
/** 放した瞬間のたるみの下限(rad・張っていた縄が手を離れて緩む)。 */
export const WHIP_TETHER_RELEASE_SLACK = 0.28;
/** 放した後、縄の先が回っていた勢いのまま進み続ける時定数(ms)。進む量は勢い×これで頭打ちになり、巻き戻りに飲まれる。 */
export const WHIP_TETHER_COAST_TAU_MS = 40;
/** 放した後、回った円に沿った軌跡が消えきるまで(ms)。尾から縮みながら薄れる(1フレームで消さない)。 */
export const WHIP_TRAIL_FADE_MS = 140;
/** 放した後の軌跡: 長さの掛け(尾から縮む)と濃さの掛け。消えたら null。 */
export const whipTrailFade = (elMs: number): { spanK: number; alphaK: number } | null => {
  if (!(elMs >= 0) || elMs >= WHIP_TRAIL_FADE_MS) return null;
  const u = elMs / WHIP_TRAIL_FADE_MS;
  return { spanK: 1 - u * u, alphaK: (1 - u) * (1 - u) };
};
/**
 * 巻き戻りの進み k(0..1・ease-in=加速しながら戻る)。先端の位置 = 手 + (放した先 - 手) × (1 - k)。終わったら null。
 * たわみは放した瞬間が一番大きく(張っていた縄が緩む=bow0 と下限の大きい方)、戻るほど張る(手元へ引き込まれてまっすぐになる)。
 * thick=縄の太さの掛け(短くなるほど細く=素材を短い長さへ押し込んで塊に見せない)。
 */
export const whipTetherRetract = (elMs: number, bow0 = 0): { k: number; bow: number; alpha: number; thick: number } | null => {
  if (!(elMs >= 0) || elMs >= WHIP_TETHER_RETRACT_MS) return null;
  const u = elMs / WHIP_TETHER_RETRACT_MS;
  const k = u * u;
  return { k, bow: Math.max(Math.abs(bow0), WHIP_TETHER_RELEASE_SLACK) * (1 - u) ** 1.5, alpha: 1 - u ** 3, thick: 0.55 + 0.45 * (1 - k) };
};

/**
 * 放した後の縄の先の位置(手元からの相対・world px)。rel0=放した瞬間の手元→先・vRel=その時の先の速さ(手元に対する・px/ms)。
 * 先は放した瞬間の速さのまま進み出し(勢いの持ち越し=放した瞬間に止まらない)、手元へ加速しながら巻き戻る(whipTetherRetract の k)。
 */
export const whipTetherRetractTip = (
  elMs: number, rel0x: number, rel0y: number, vRelX: number, vRelY: number,
): { x: number; y: number } | null => {
  const rt = whipTetherRetract(elMs);
  if (!rt) return null;
  const c = WHIP_TETHER_COAST_TAU_MS * (1 - Math.exp(-Math.max(0, elMs) / WHIP_TETHER_COAST_TAU_MS));
  const keep = 1 - rt.k;
  return { x: (rel0x + vRelX * c) * keep, y: (rel0y + vRelY * c) * keep };
};

/** 掴んだ瞬間、振りの鞭(まっすぐ伸び切った形)から縄へ引き継ぐ長さ(ms)。 */
export const WHIP_TETHER_ENTRY_MS = 140;
/**
 * 掴んだ直後の引き継ぎ(0..1・止まった所から動き出し、前寄りに速く、減速して着く)。0=振りの鞭の伸び切った形(届く距離ぶん・地面の高さ・まっすぐ=パチンで止まっている)
 * /1=手→掴んだ敵の体へ張った縄。先は敵の向きのまま届く距離から敵の体まで縮み(巻き付く)、たわみ・高さも同じ割合で入る。
 * 速さ = 12u(1-u)^2 =出だし0(パチンで止まっていた先がいきなり速く動かない)・着き0。
 */
export const whipTetherEntry = (tMs: number): number => {
  const u = clamp01(tMs / WHIP_TETHER_ENTRY_MS);
  return u * u * (6 - 8 * u + 3 * u * u);
};

/** 光の縁の濃さ(0..1)。回る速さの割合が最高速に近い時だけ出る(回り出し・掴んだ瞬間は出ない)。 */
export const whipTetherGlowK = (angVelFrac: number): number => {
  const q = clamp01((angVelFrac - 0.8) / 0.2);
  return q * q;
};

/** 投げた敵の高さの山(px)=体の絵の高さ × これ(上下の限り付き)。 */
export const WHIP_FLY_LIFT_K = 0.55;
export const WHIP_FLY_LIFT_MIN_PX = 34;
export const WHIP_FLY_LIFT_MAX_PX = 78;
/** 途中で当たって着いた時、宙から地面へ落ちる長さ(ms)。 */
export const WHIP_FLY_DROP_MS = 110;
/** 途中で当たって着いた時、絵が当たった所へ止まるまでの時定数(ms・臨界減衰=着いた時の速さを持ち越して減速して止まる)。 */
export const WHIP_FLY_STOP_TAU_MS = 30;
/** 放した瞬間の曲がり(回っていた勢い→投げた向きの直進)が抜ける時定数(ms)。 */
export const WHIP_FLY_BLEND_TAU_MS = 45;
/** 飛び上がりの立ち上がり(ms)。地面で回っていた体の上下の速さを0から入れる(放した瞬間に上へ跳ねない)。 */
export const WHIP_FLY_RISE_TAU_MS = 30;

/** 投げた敵の高さの山(px)。 */
export const whipFlyPeakPx = (bodyH: number): number =>
  Math.max(WHIP_FLY_LIFT_MIN_PX, Math.min(WHIP_FLY_LIFT_MAX_PX, bodyH * WHIP_FLY_LIFT_K));

/**
 * 飛ぶ高さ(px・描画だけ)。放してから t ms・最大距離に着く時刻 T ms(判定の whipThrowDurationMs)で 0 に戻る放物線。
 * 途中で当たった(landAt<T)時は、その時の高さから重さで落ちて WHIP_FLY_DROP_MS で地面へ。
 */
export const whipFlyLiftPx = (tMs: number, flyMs: number, peakPx: number, landAtMs?: number): number => {
  const T = Math.max(1, flyMs);
  // 放物線に立ち上がりを掛ける(出だしの上への速さ0=地面で回っていた体が、放した瞬間に上へ跳ねない)。着く時刻は同じ。
  const arc = (x: number): number => {
    if (!(x > 0)) return 0;
    const q = clamp01(x / T);
    return peakPx * 4 * q * (1 - q) * (1 - Math.exp(-x / WHIP_FLY_RISE_TAU_MS));
  };
  if (landAtMs === undefined || landAtMs >= T || tMs <= landAtMs) return arc(tMs);
  // 途中で当たった: 着いた時の高さと上下の速さを持ち越し、重さで WHIP_FLY_DROP_MS に地面へ(上っていた最中なら、少し上ってから落ちる)。
  const h0 = arc(landAtMs);
  const vh = arc(landAtMs + 0.5) - arc(landAtMs - 0.5); // px/ms
  return whipLiftFallPx(tMs - landAtMs, h0, vh, WHIP_FLY_DROP_MS);
};
/**
 * 宙から地面へ落ちる高さ(px)。高さ h0・上下の速さ vh(px/ms・上が正)を持ち越し、重さで D ms に地面へ(上っていた最中なら、少し上ってから落ちる)。
 * 下りが速く、重さ無しでも D より前に地面へ着く時は、そのままの速さで地面へ。
 */
export const whipLiftFallPx = (sMs: number, h0: number, vh: number, D: number): number => {
  const s = sMs;
  const g = (2 * (h0 + vh * D)) / (D * D); // D で地面に着く重さ(px/ms²)
  if (g <= 0) {
    const end = vh < 0 ? h0 / -vh : 0;
    return s >= end ? 0 : Math.max(0, h0 + vh * s);
  }
  return s >= D ? 0 : Math.max(0, h0 + vh * s - 0.5 * g * s * s);
};

/**
 * 絵の上の飛んだ距離(px)。判定(出だし v0 から減速して最大距離で 4 割の速さ)と違い、絵は最大距離でちょうど止まるように減速する
 * (=最大距離で急停止せず、着地の後に地面を擦って滑って止まる)。判定より少し遅れて進む(遅れの最大は最大距離の約 1 割)。
 */
export const whipFlyVisualDist = (tMs: number, v0: number, maxDist: number): number => {
  if (!(tMs > 0) || !(v0 > 0) || !(maxDist > 0)) return 0;
  const Tv = (2 * maxDist) / v0; // s
  const t = Math.min(Tv, tMs / 1000);
  return Math.min(maxDist, v0 * t - (v0 * v0 / (4 * maxDist)) * t * t);
};

/**
 * 絵のずれ(px・投げた向きに沿う・負=判定より後ろ)。logicalD=判定の距離。
 * 最大距離で着いた('max')=絵は自分の式のまま滑って止まる。途中で当たって着いた('hit')=着いた時のずれを短く戻す(当たって止まる)。
 */
export const whipFlyOffset = (o: {
  tMs: number; v0: number; maxDist: number; logicalD: number; landAtMs?: number; landKind?: 'max' | 'hit'; landD?: number;
}): number => {
  // 着いた後は(着いたフレームも)着いた距離で見る(前のフレームの判定の距離のままだと、着いたフレームだけ1歩ぶん前へ跳ぶ)。
  if (o.landAtMs === undefined || o.landKind === undefined || o.tMs < o.landAtMs) {
    return Math.min(0, whipFlyVisualDist(o.tMs, o.v0, o.maxDist) - o.logicalD);
  }
  const landD = o.landD ?? o.logicalD;
  if (o.landKind === 'max') return Math.min(0, whipFlyVisualDist(o.tMs, o.v0, o.maxDist) - landD);
  // 途中で当たった: 着いた時の絵の遅れ off0 と絵の速さ vL を持ち越し、臨界減衰で当たった所へ止まる(速さが1フレームで0にならない)。
  // 速いまま当たると少しだけ当たった所の先へめり込んでから戻る(最大 vL×τ/e)。
  const off0 = Math.min(0, whipFlyVisualDist(o.landAtMs, o.v0, o.maxDist) - landD);
  const vL = whipFlyVisualSpeed(o.landAtMs, o.v0, o.maxDist) / 1000; // px/ms
  const s = o.tMs - o.landAtMs;
  const tau = WHIP_FLY_STOP_TAU_MS;
  return (off0 + (vL + off0 / tau) * s) * Math.exp(-s / tau);
};

/**
 * 放した瞬間の曲がり(world px)。判定は投げた向きへ直進するが、体は回っていた勢い(放した瞬間の速さ)のまま動き出し、
 * WHIP_FLY_BLEND_TAU_MS ほどで投げた向きの直進へ曲がって乗る(放した瞬間に向きと速さが跳ばない)。rv=放した瞬間の速さ − 直進の速さ(px/s)。
 * 出だしの速さの差が rv・ずれの最大は |rv|×τ/e(1周0.45秒の最高速で真後ろへ投げた時で約42px)で、その後0へ戻る。
 */
export const whipFlyReleaseBlend = (tMs: number, rvx: number, rvy: number): { x: number; y: number } => {
  if (!(tMs > 0)) return { x: 0, y: 0 };
  const k = (tMs / 1000) * Math.exp(-tMs / WHIP_FLY_BLEND_TAU_MS);
  return { x: rvx * k, y: rvy * k };
};

/** 投げた敵の絵(描画の whipFly が持つ値)。 */
export interface WhipFlyView {
  tMs: number; v0: number; maxDist: number; flyMs: number; ux: number; uy: number; logicalD: number;
  landAt?: number; landKind?: 'max' | 'hit'; landD?: number; rvx?: number; rvy?: number;
}
/** 投げた敵の絵のずれ(world px・判定の位置から)と高さ(px)。描画と計測が同じ1本を使う。 */
export const whipFlyViewOffset = (f: WhipFlyView, bodyH: number): { dx: number; dy: number; lift: number } => {
  const off = whipFlyOffset({ tMs: f.tMs, v0: f.v0, maxDist: f.maxDist, logicalD: f.logicalD, landAtMs: f.landAt, landKind: f.landKind, landD: f.landD });
  const b = whipFlyReleaseBlend(f.tMs, f.rvx ?? 0, f.rvy ?? 0);
  return { dx: f.ux * off + b.x, dy: f.uy * off + b.y, lift: whipFlyLiftPx(f.tMs, f.flyMs, whipFlyPeakPx(bodyH), f.landAt) };
};

/** 投げた敵の後ろへ伸ばす風の筋の長さ=絵の上の今の速さ × これ(秒)。速いほど長く、減速で縮む。 */
export const WHIP_THROW_STREAK_LEN_S = 0.11;
/** 着弾の瞬間から、筋が先(敵の側)から尾へ向けて消えきるまで(ms)。 */
export const WHIP_THROW_STREAK_OUT_MS = 170;

/** 絵の上の飛んだ距離が d になる時刻(ms・whipFlyVisualDist の逆)。 */
export const whipFlyVisualTimeAt = (d: number, v0: number, maxDist: number): number => {
  if (!(d > 0) || !(v0 > 0) || !(maxDist > 0)) return 0;
  const q = Math.min(1, d / maxDist);
  return ((2 * maxDist) / v0) * (1 - Math.sqrt(1 - q)) * 1000;
};
/** 絵の上の今の速さ(px/s)。最大距離でちょうど 0。 */
export const whipFlyVisualSpeed = (tMs: number, v0: number, maxDist: number): number => {
  if (!(v0 > 0) || !(maxDist > 0)) return 0;
  const Tv = (2 * maxDist) / v0;
  return Math.max(0, v0 * (1 - Math.max(0, tMs) / 1000 / Tv));
};

/**
 * 投げた敵の後ろの風の筋(派手さの絵・判定なし)。投げた向きに沿う距離(放した点から・px)で、尾 tailD と先 headD・濃さの掛け alpha を返す。
 * 先=敵の体の今の位置(headNow・絵の上)。飛んでいる間は尾が速さぶん後ろ(放した点より後ろへは出さない=手元にかぶらない)。
 * 着弾(landAtMs)の後は尾をその場に残し、先が加速しながら尾へ縮んで消える(WHIP_THROW_STREAK_OUT_MS)。消えたら null。
 */
export const whipThrowStreak = (o: {
  tMs: number; v0: number; maxDist: number; headNow: number; landAtMs?: number; landD?: number;
}): { tailD: number; headD: number; alpha: number } | null => {
  const lenAt = (t: number, head: number): number => Math.max(0, Math.min(head, whipFlyVisualSpeed(t, o.v0, o.maxDist) * WHIP_THROW_STREAK_LEN_S));
  if (o.landAtMs === undefined || o.tMs <= o.landAtMs) {
    const head = Math.max(0, o.headNow);
    return { tailD: head - lenAt(o.tMs, head), headD: head, alpha: 1 };
  }
  const u = (o.tMs - o.landAtMs) / WHIP_THROW_STREAK_OUT_MS;
  if (u >= 1) return null;
  const headLand = Math.max(0, Math.min(whipFlyVisualDist(o.landAtMs, o.v0, o.maxDist), o.landD ?? Infinity));
  const tail = headLand - lenAt(o.landAtMs, headLand);
  const head = Math.max(tail, o.headNow);
  return { tailD: tail, headD: tail + (head - tail) * (1 - u * u), alpha: 1 - 0.5 * u };
};

// ---- ★ボスの叩きつけの見た目(社長指示2026-11-26「ボスは振り回しではなく、反対側に頭上を弧を描いて叩きつけ」)。判定=地面の上の位置は store(utils/whipSwing)。 ----
// ここは描画だけの高さと体の回り・プレイヤーの体の動き。高さ = 山 × sin(π s)(s=弧の進み・頭上で山)。
// 回り = 進む向きへ横倒しまで(±90°未満・大きい体ほど小さく)。叩きつけた後は横倒しのまま一拍 → 短い方へ戻りながら少し跳ねて起き上がる
// (見え方の監査 A5「丸1回転はコミカルで重さを打ち消す」)。絵の伸縮はしない。
/** 山の下限(px)。 */
export const WHIP_OVERHEAD_PEAK_MIN_PX = 40;
/** 頭上を越える時、ボスの絵の一番下とプレイヤーの頭の間に空ける量(px)。 */
export const WHIP_OVERHEAD_CLEAR_PX = 14;
/** 叩きつけた後、横倒しのまま留まる(ms)と、起き上がる長さ(ms)。 */
export const WHIP_OVERHEAD_LAND_HOLD_MS = 150;
export const WHIP_OVERHEAD_STANDUP_MS = 420;
/** 起き上がる時の跳ね(ボスの絵の高さ × これ・px の下限と上限)。 */
export const WHIP_OVERHEAD_STANDUP_HOP_K = 0.07;
export const WHIP_OVERHEAD_STANDUP_HOP_MIN_PX = 6;
export const WHIP_OVERHEAD_STANDUP_HOP_MAX_PX = 22;
/** 回りの上限(rad): 絵の高さ ROT_SMALL_H 以下で ROT_SMALL・ROT_BIG_H 以上で ROT_BIG(その間は直線)。 */
export const WHIP_OVERHEAD_ROT_SMALL = 1.4;
export const WHIP_OVERHEAD_ROT_BIG = 0.7;
export const WHIP_OVERHEAD_ROT_SMALL_H = 140;
export const WHIP_OVERHEAD_ROT_BIG_H = 360;
/** 弧の間、プレイヤーや周りを隠さないよう透かす量(頭上で 1-これ・掴んだ時と叩きつけで不透明)。 */
export const WHIP_OVERHEAD_SEE_THROUGH = 0.42;
/** 途中で放した時、回りが正立へ戻る時定数(ms・臨界減衰=回っていた勢いのまま寄って止まる)。 */
export const WHIP_OVERHEAD_RELEASE_ROT_TAU_MS = 70;

/** 回りの上限(rad・正)。bossH=ボスの絵の高さ(px)。 */
export const whipOverheadRotMax = (bossH: number): number => {
  const k = clamp01((bossH - WHIP_OVERHEAD_ROT_SMALL_H) / (WHIP_OVERHEAD_ROT_BIG_H - WHIP_OVERHEAD_ROT_SMALL_H));
  return WHIP_OVERHEAD_ROT_SMALL + (WHIP_OVERHEAD_ROT_BIG - WHIP_OVERHEAD_ROT_SMALL) * k;
};
/**
 * 弧の山(px)。頭上(s=0.5・回り=上限の半分)でボスの絵の一番下がプレイヤーの頭(playerH)を CLEAR_PX 越える高さ。
 * 体の中心で回すので、回った絵の一番下は中心から hh|cos r| + hw|sin r| 下(hh,hw=絵の高さ・幅の半分)。
 * centerAbove=絵の中心が足元(地面の点)からどれだけ上か(足元が絵の下端なら hh・裏ボスのように絵の中ほどが足元なら小さい)。
 * capPx=上限(可視域の上端から決める・無ければ Infinity)。上限が下限より低ければ下限。
 */
export const whipOverheadPeakPx = (playerH: number, bossH: number, bossW: number, rotMax: number, capPx = Infinity, centerAbove = bossH / 2): number => {
  const hh = Math.max(0, bossH) / 2, hw = Math.max(0, bossW) / 2, r = rotMax / 2;
  const below = hh * Math.abs(Math.cos(r)) + hw * Math.abs(Math.sin(r)) - centerAbove; // 頭上で絵の一番下が足元(地面の点+山)より下へ出る量
  const need = Math.max(WHIP_OVERHEAD_PEAK_MIN_PX, playerH + WHIP_OVERHEAD_CLEAR_PX + below);
  return Math.max(WHIP_OVERHEAD_PEAK_MIN_PX, Math.min(need, capPx));
};
/** 弧の高さ(px・描画だけ)。掴んだ時と叩きつけた時は0・頭上で山。 */
export const whipOverheadLiftPx = (tMs: number, peakPx: number, ms = WHIP_OVERHEAD_MS): number =>
  peakPx * Math.sin(Math.PI * whipOverheadProgress(tMs, ms));
/** 弧の高さの速さ(px/ms・上が正)。 */
export const whipOverheadLiftVel = (tMs: number, peakPx: number, ms = WHIP_OVERHEAD_MS): number =>
  peakPx * Math.PI * Math.cos(Math.PI * whipOverheadProgress(tMs, ms)) * whipOverheadProgressVel(tMs, ms);
/** 弧の間の体の回り(rad)。side=+1 で時計回り(画面で右へ運ぶ向き)。弧の進みに比例して上限(横倒し)まで=叩きつける瞬間が一番速く回る。 */
export const whipOverheadRot = (tMs: number, side: 1 | -1, rotMax: number, ms = WHIP_OVERHEAD_MS): number =>
  side * rotMax * whipOverheadProgress(tMs, ms);
/** 弧の間の回る速さ(rad/ms)。 */
export const whipOverheadRotVel = (tMs: number, side: 1 | -1, rotMax: number, ms = WHIP_OVERHEAD_MS): number =>
  side * rotMax * whipOverheadProgressVel(tMs, ms);
/** 弧の間の濃さ(掴んだ時と叩きつけで1・頭上で 1-SEE_THROUGH)。 */
export const whipOverheadAlpha = (tMs: number, ms = WHIP_OVERHEAD_MS): number =>
  1 - WHIP_OVERHEAD_SEE_THROUGH * Math.sin(Math.PI * whipOverheadProgress(tMs, ms));
/** 回る向き: 画面で右へ運ぶなら +1(時計回り)・左へなら -1。ほぼ真上下へ運ぶ時は face(今向いている向き)。 */
export const whipOverheadSide = (fromX: number, toX: number, face: number): 1 | -1 =>
  Math.abs(toX - fromX) > 6 ? (toX > fromX ? 1 : -1) : face >= 0 ? 1 : -1;
/** 起き上がりの跳ね(px)。 */
export const whipOverheadHopPx = (bossH: number): number =>
  Math.max(WHIP_OVERHEAD_STANDUP_HOP_MIN_PX, Math.min(WHIP_OVERHEAD_STANDUP_HOP_MAX_PX, bossH * WHIP_OVERHEAD_STANDUP_HOP_K));
/**
 * 叩きつけてから el ms の回り(rad)と高さ(px)。横倒し(side×rotMax)のまま一拍 → 短い方(来た向きの逆)へ戻りながら少し跳ねて起き上がる。
 * 戻りは加速→減速(速さは両端で0)・跳ねは戻りの間の1山。終わったら正立・地面。
 */
export const whipOverheadAfterSlam = (elMs: number, side: 1 | -1, rotMax: number, hopPx: number): { rot: number; lift: number } => {
  if (!(elMs >= 0) || elMs < WHIP_OVERHEAD_LAND_HOLD_MS) return { rot: side * rotMax, lift: 0 };
  const k = (elMs - WHIP_OVERHEAD_LAND_HOLD_MS) / WHIP_OVERHEAD_STANDUP_MS;
  if (k >= 1) return { rot: 0, lift: 0 };
  return { rot: side * rotMax * (1 - smooth(k)), lift: hopPx * Math.sin(Math.PI * Math.min(1, k * 1.15)) };
};
/** 叩きつけの絵が終わるまで(ms)。 */
export const whipOverheadAfterSlamMs = (): number => WHIP_OVERHEAD_LAND_HOLD_MS + WHIP_OVERHEAD_STANDUP_MS;
/**
 * 途中で放した(死亡・会話・カットイン・鞭を外した・瞬間移動)時の el ms 後。高さは放した時の高さと上下の速さを持ち越して重さで地面へ、
 * 回りは放した時の角度と回る速さから一番近い正立へ臨界減衰で寄る(瞬間に地面へ落ちたり正立へ跳んだりしない)。
 * h0=高さ(px)・vh=上下の速さ(px/ms)・r0=回り(rad)・w0=回る速さ(rad/ms)。
 */
export const whipOverheadAfterDrop = (elMs: number, h0: number, vh: number, r0: number, w0: number): { lift: number; rot: number } => {
  const D = WHIP_FLY_DROP_MS * Math.sqrt(Math.max(1, h0 / 40));
  const lift = whipLiftFallPx(Math.max(0, elMs), Math.max(0, h0), vh, D);
  const target = Math.round(r0 / (2 * Math.PI)) * 2 * Math.PI;
  const sp = criticalSpringStep(r0, w0 * 1000, target, Math.max(0, elMs), WHIP_OVERHEAD_RELEASE_ROT_TAU_MS);
  return { lift, rot: sp.x - target };
};

/** 叩きつけた後、しゃがみの底から立ち姿へ戻る長さ(ms)。 */
export const WHIP_OVERHEAD_BODY_RECOVER_MS = 420;
/**
 * ★叩きつけの間のプレイヤーの体(見え方の監査 A1「体が静止して念動力に見える」)。普通の振りの体(whipBodyPose)と同じ絵と型:
 * 持ち上げ=振り上げの絵('swing')で伸び上がって後ろへ反る(減速して止まる)→ 振り下ろし=加速して沈む → 叩きつけの瞬間にしゃがみの底('ready')
 * → 慣性つきで立ち姿へ。tMs=掴んでから・slamElMs=叩きつけてから(まだなら null)。
 */
export const whipOverheadBodyPose = (tMs: number, ms = WHIP_OVERHEAD_MS, slamElMs: number | null = null): WhipBodyPose => {
  const T = Math.max(1, ms);
  let up = 0, down = 0, pose: WhipBodyPose['pose'];
  if (slamElMs !== null) {
    if (!(slamElMs >= 0) || slamElMs >= WHIP_OVERHEAD_BODY_RECOVER_MS) return { pose: null, sqX: 1, sqY: 1, lean: 0 };
    down = 1 - easeOutCubic(slamElMs / WHIP_OVERHEAD_BODY_RECOVER_MS);
    pose = 'ready';
  } else {
    const a = T * WHIP_OVERHEAD_RISE_FRAC;
    if (tMs < a) up = easeOutCubic(clamp01(tMs / (a * 0.6)));
    else { const q = clamp01((tMs - a) / (T - a)); const qq = q * q; up = 1 - qq; down = qq; }
    pose = 'swing';
  }
  return { pose, sqX: 1 - 0.08 * up + 0.14 * down, sqY: 1 + 0.14 * up - 0.2 * down, lean: -0.26 * up + 0.3 * down };
};
/**
 * 叩きつけの間のプレイヤーの向き(+1=右・-1=左)。頭上を越えるまでは掴んだ側を向いて担ぎ上げ、越えたら着地点の側へ向き直って叩きつける。
 * 叩きつけた後も着地点の側。ほぼ真上下へ運ぶ時は face のまま。
 */
export const whipOverheadFace = (s: number, pivX: number, fromX: number, toX: number, face: 1 | -1): 1 | -1 => {
  const x = s < 0.5 ? fromX : toX;
  return Math.abs(x - pivX) > 6 ? (x > pivX ? 1 : -1) : face;
};

// ---- ★掴んだ瞬間の「掴んだ！」の寄り(社長指示2026-11-26「掴んだ時、少し長めにストップして、その敵に一瞬少し寄りズーム 掴んだ！って感じにしたい」)。描画だけ。 ----
/** 寄る量(倍率の上乗せ・0.2=1.2倍)。 */
export const WHIP_GRAB_ZOOM_MAG = 0.2;
/** 寄り切るまで(ms・加速→減速)。 */
export const WHIP_GRAB_ZOOM_IN_MS = 110;
/** 寄り切ったまま止める長さ(ms)。寄り+止め=掴んだ瞬間の止め(store の WHIP_GRAB_HITSTOP_MS)と同じ頃。 */
export const WHIP_GRAB_ZOOM_HOLD_MS = 90;
/** 戻り(ms・加速→減速)。合計 = 寄り+止め+戻り。 */
export const WHIP_GRAB_ZOOM_OUT_MS = 320;
/** 寄りの間、掴んだ敵を画面の中央へ寄せる割合(1=真ん中まで)。寄りの量に比例して出入りする。 */
export const WHIP_GRAB_ZOOM_AIM_FRAC = 0.6;
/** 寄りの全体の長さ(ms)。 */
export const WHIP_GRAB_ZOOM_TOTAL_MS = WHIP_GRAB_ZOOM_IN_MS + WHIP_GRAB_ZOOM_HOLD_MS + WHIP_GRAB_ZOOM_OUT_MS;
/** 掴んでからの壁時計 tMs の寄りの割合(0..1)。0 より前・終わった後は 0。倍率の上乗せ = これ × WHIP_GRAB_ZOOM_MAG。 */
export const whipGrabZoomAt = (tMs: number): number => {
  if (!(tMs >= 0)) return 0;
  if (tMs < WHIP_GRAB_ZOOM_IN_MS) return smooth(tMs / WHIP_GRAB_ZOOM_IN_MS);
  const o = tMs - WHIP_GRAB_ZOOM_IN_MS - WHIP_GRAB_ZOOM_HOLD_MS;
  if (o < 0) return 1;
  if (o >= WHIP_GRAB_ZOOM_OUT_MS) return 0;
  return 1 - smooth(o / WHIP_GRAB_ZOOM_OUT_MS);
};

/**
 * ★鞭の振りの赤いしなり(whipsnare・素材 fx/whip-smear-0..2)を出すか(社長指示2026-11-26「赤い斬撃は一旦削除 合ってない」)。
 * 一旦止める=false。戻す時は true にするだけ(出す所=store の beginMeleeSwing・描く所=pixiScene.drawWhipSnareSprite はそのまま)。
 * しなりは鞭の本体(縄 whiprope)の曲がりで見せる(whipRopeShape)。馬乗りの鞭の振り(別の絵)は対象外。
 */
export const WHIP_SNARE_FX_ENABLED: boolean = false;
