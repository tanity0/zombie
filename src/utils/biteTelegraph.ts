/**
 * ★雑魚の「軽い攻撃」の予告を流星ラインにする(社長指示2026-09-17
 * 「**雑魚の軽い攻撃の予告は赤ラインの流星にする**」/ 色分けは社長承認2026-09-17「提案通りで」)。
 *
 * ここまでの雑魚の予告は「**本体が光るだけ**」(§12の噛みつき=紫の点滅 / §16の技=赤の加算グロー)で、
 * **どの方角の、どの点を狙われているのかが画面に1つも出ていなかった**。ボス側には既に流星ライン
 * (溜めと同期して伸び、技の出始めに描き切り、根元から消え、**消え切った瞬間が判定**)があるので、
 * その文法をそのまま雑魚へ降ろす。
 *
 * ★色(CLAUDE.md「色と形の文法」・社長承認2026-09-17):
 *   **赤=カウンターできる技**(`BiteSpec.counterable: true`=コウモリの掴み/スケルトンの噛み/ゾンビの2連/
 *   リッチの転移噛み)
 *   **紫=カウンターできない攻撃**(`counterable: false`=§12の噛みつき。本物のボス・城ボスの噛みつきも同じ紫)
 *   **線の形は共通**。出どころは `BiteSpec.counterable` の1箇所=判定と色が必ず一対になる。
 *   描画は雑魚(`isBossType` の外)=地面とアクターの間の層に足元の高さで、ボス=地面の層に腰の高さの従来の線
 *   (`BiteTelegraphLine.mobLine`)。色は両方とも下地=深い血の赤/深い紫・芯=赤系/紫系・**白に近いのは頭の点だけ**、
 *   終点の印は地面に置いた潰れた楕円(縦横比0.45。雑魚は相手の足元=影の位置、ボスは線の終点)。
 *
 * ★線の終点は「**狙っている点**」(CLAUDE.md 攻撃ヴィジュアルの2分類①=判定に揃える)。
 * 終点 = 発火時の敵の中心 + 向き × (踏み込み距離 + 接触距離)。
 * 踏み込み距離は `biteLungeDistanceAtFire`(=発火時の中心間距離 − 接触距離)で焼かれているので、
 * **この終点は「発火の瞬間にプレイヤーが立っていた点」と厳密に一致する**(§16の3体)。
 * 踏み込みを焼かない敵(§12の既定)でも、敵は `lungePx` ぶん前へ出て体が重なったら当たりなので、
 * **その先は安全**=終点は同じ式で正しい。
 *
 * ★「赤いのに当たらない/赤くないのに当たる」を作らないための線引き: これは**線**であって
 * **面ではない**。危険域の広さは主張せず、「**この方角の、この点に、この瞬間に来る**」だけを言う。
 */
import type { Enemy } from '../types/game';
import {
  biteSpecFor, bitePhaseOf, biteLungeFrac, biteLungeDistanceAtFire, BITE_CONTACT_DIST_PX, type BiteSpec,
} from './enemyBite';
import { enemyContactBox } from './collisionUtils';
import { isBossType } from './enemyUtils';
import {
  ZOMBIE_STANCE_MS, ZOMBIE_WINDUP_MS, ZOMBIE_STAGGER_MS, SKELETON_ARC_MS,
  CHAFF_BLINK_ON_MS, CHAFF_BLINK_OFF_MS, CHAFF_BLINK_COUNT, zombieStanceDirOf,
} from './chaffMoves';
import { ESCORT_BODY_SIZE } from './escortHealth';
import { biteFxRect } from './biteFxHit';

/** プレイヤーの当たり判定の半幅(PLAYER_HITBOX=28 の半分)。enemyBite.ts の接触距離の導出と同じ値。 */
const PLAYER_HALF_PX = 14;

/**
 * 接触距離(=この距離まで詰めれば体が重なる)。§16の3体は実測から置いた台帳の値
 * (`BITE_CONTACT_DIST_PX`)、それ以外は当たり判定の箱から同じ式で導く
 * (どの向きから来ても安全側=短い方の軸を採る)。
 */
export const biteContactDistPx = (e: Enemy): number => {
  const known = (BITE_CONTACT_DIST_PX as Partial<Record<Enemy['type'], number>>)[e.type];
  if (known !== undefined) return known;
  const b = enemyContactBox(e);
  return Math.min(b.width, b.height) / 2 + PLAYER_HALF_PX;
};

/**
 * ★描く区間を両端で切り詰める(クリエイティブ監査2026-09-17 #1/#2)。
 * 予告の線は**アクターより下の層**(groundLayer)に描かれるので、切り詰めないと
 * **前の3〜4割が敵の絵の下に潜り、最後に残る部分がプレイヤーの絵の下に隠れる**。
 * ボスの線は数百pxあるので端が隠れても平気だったが、雑魚の線は全長65〜125pxしかなく、
 * **一番大事な「消え切る瞬間」が見えない**=予告として機能しない。
 * ⇒ **手前は敵の体の前縁から / 奥はプレイヤーの絵の手前で**終える。
 * **情報(方角と時刻)は1つも変わらない**——見えている区間だけを実際に見える所へ寄せる。
 */
/** プレイヤーの絵の半幅ぶん手前で終える(絵の下に潜らせない)。※地面の層で描く線(ボス)の値。 */
const TRIM_NEAR_PLAYER_PX = 26;
/** 切り詰めた後に最低限残す長さ(密着で発火しても線が消滅しないように)。※地面の層で描く線(ボス)の値。 */
const MIN_DRAWN_PX = 24;
/**
 * ★雑魚の線(`mobLine`)は描画側で**足元の高さ**へ写して引く(クリエイティブ監査2026-10-23 2巡目 #3:
 * 腰の高さの線はプレイヤーの銃身の延長=レーザーサイトに、スケルトンでは胴を縦断する槍に見えた)。
 * 写す量=攻撃側は自分の箱の底辺まで(`footFromOff`)、相手は当たり判定の底辺=足元・影の位置まで(`footToOff`)。
 * **判定の中心(tx/ty)は変えない**——描く位置だけ足元へ写す。切り詰め(攻撃側の輪郭の外から引く)も描画側が
 * 実際の絵の大きさ(遠近スケール込み)で決めるので、下の dfx〜dty はボスの線(地面の層・腰の高さ)だけが使う。
 */

export interface BiteTelegraphLine {
  /** 始点(=発火時の敵の中心。踏み込みで敵が動いても線は動かない)。**描くのは dfx/dfy から**。 */
  fx: number; fy: number;
  /** 終点(=狙っている点)。**描くのは dtx/dty まで**。 */
  tx: number; ty: number;
  /** 実際に描く区間(両端を切り詰めたもの)。 */
  dfx: number; dfy: number; dtx: number; dty: number;
  /**
   * ★噛みのエフェクトの絵と判定の四角(utils/biteFxHit)の中心。既定は終点(tx,ty)と同じ。
   * ゾンビ2連の1発目だけ、構えで焼いた向きの**前方へずらし、四角の後ろの端をゾンビの前の端に揃える**
   * (品質監査2026-10-23 A-1: 向きを固めた後、終点中心の四角がゾンビの後ろ・横まで覆い、裏へ回っても噛まれていた)。
   */
  fxX: number; fyY: number;
  /** 溜め〜噛みの通し進捗 0..1。**1=判定の瞬間**(ここで線が消え切る)。 */
  prog: number;
  /** 描き切る位置(=溜めの割合)。溜めが終わる=踏み込みが始まる瞬間に線が満ちる。 */
  drawFrac: number;
  /** 判定までの残り(ms)。中断の検知に使う(dashLineTick の remainMs)。 */
  remainMs: number;
  /**
   * ★脈(明滅)の時計(クリエイティブ監査 #3/#11)。壁時計 `now` のままだと
   * ①周期690msに対し雑魚の技は380〜620ms=**1周しない**ので、発火した時刻の位相で
   * **毎回ちがう濃さ**になる ②全敵が同じ時計なので**20体が完全に同期して明滅**する
   * (呼吸は `stablePhase(e.id)` でわざわざ位相をずらしているのに線だけ揃う)。
   * ⇒ **その攻撃自身の経過時間**を時計にする。どの個体もどの回も同じ明るさの曲線を辿り、
   * 発火が違えば自然にバラける。本体の点滅(`biteBlinkOn`)と同じ `biteAt` 基準=拍が揃う。
   */
  pulseAt: number;
  /** 噛み(実行)の長さ(ms)。中断された時の残光の尺に使う(ボスの320msは雑魚には長すぎる)。 */
  biteMs: number;
  /** カウンターできるか。**true=赤 / false=紫**(色の出どころはここ1箇所)。 */
  counterable: boolean;
  /** ★流星が出た時刻(gameTime)。**=溜めの始まり**(赤い予告の掟②)。 */
  startAt: number;
  /** ★流星が消え切る時刻(gameTime)。**=当たる時刻**(赤い予告の掟③)。`prog` はこの2点の間の割合。 */
  hitAt: number;
  /** ★向きが固まる時刻(gameTime)。ゾンビ1発目=構えの頭 / それ以外=発火+溜め(判定の向きが狙いを追わなくなる瞬間)。 */
  lockAt: number;
  /** ★向きが固まる瞬間に終点の印で合図するか(前段の無い噛み=false)。 */
  lockCue: boolean;
  /** ★軍人を狙っている噛みか(描画は同じ赤のまま細く・薄く、終点の印は軍人の足元)。 */
  targetsEscort: boolean;
  /** ★強調(1=通常)。ゾンビ2連の2発目は「まだ終わっていない」と伝えるため1より大きい(描画は終点の印を2回打つ)。 */
  emphasis: number;
  /**
   * ★雑魚の描き方か。`isBossType` の外=true(地面とアクターの間の層に、足元の高さで引く・pixiScene の mobMeteor)/
   * `isBossType`=false(地面の層に腰の高さの従来の線・dfx〜dty を使う)。
   */
  mobLine: boolean;
  /** 攻撃側の中心(fx,fy)から足元(箱の底辺)までの縦の距離。描画が線を足元へ写すのに使う。 */
  footFromOff: number;
  /** 狙っている点(tx,ty)から相手の足元(当たり判定の底辺=影の位置)までの縦の距離。 */
  footToOff: number;
}

/** ゾンビ2連の2発目(よろけ〜噛み2)の強調。 */
export const BITE_SECOND_EMPHASIS = 1.35;

/**
 * ★流星の時間窓(社長指示2026-10-23「ゾンビとスケルトンの技、流星予告入れたい」+同日「カウンターできないものは
 * 別に予告いらない。あとは推薦で」)。
 *
 * 旧: 線は**噛み(`biteAt`)が立ってから**しか出ていなかった。ところがゾンビ2連の1発目は
 * `biteAt` の前に**構え(z-red-pause・1秒)**が、2発目の前に**よろけ(z-stagger・160ms=2発目の溜め)**が、
 * スケルトンの噛みは**回り込み(s-arc)**があり、そこが技の溜めの本体。
 * ⇒ **溜めの始まりから赤が出ていない区間**があった(掟②違反)。
 *
 * ⇒ 流星は **startAt=溜めの始まり → hitAt=当たる時刻** の1本の窓で出す。時刻は全部シミュの状態から引く
 * (描画側で推測しない):
 *  - startAt(出る): ゾンビ1発目=構えの頭(`chaffBlinkAt − ZOMBIE_WINDUP_MS`)/ ゾンビ2発目=よろけの頭
 *    (z-stagger 中は `aiPhaseUntil − ZOMBIE_STAGGER_MS`、z-bite2 では `biteAt − ZOMBIE_STAGGER_MS`)/
 *    スケルトン=**回り込みの頭**(`chaffMoveAt`=体の赤の点滅と同じ錨。しゃがみは色なし=形で読む)/
 *    それ以外(§12の噛みつき・コウモリ等)=`biteAt`。
 *  - drawAt(線が満ちる=体の区切り): ゾンビ1発目=赤の点滅の頭(`chaffBlinkAt`=反って固まった瞬間)/
 *    ゾンビ2発目=発火(よろけの明け)/ スケルトン=体の赤の点滅が終わる時刻(回り込みの頭+点滅2回ぶん)/
 *    それ以外=発火+溜め(従来どおり)。満ちた後は命中まで根元から消えていく=**残っている赤の量=残り時間**。
 *  - lockAt(向きが固まる=判定の向きが動かなくなる時刻): ゾンビ1発目=**構えの頭**(構えに入った瞬間の向きで噛む・
 *    裏へ回れば避けられる)/ それ以外=発火+溜め(溜めの間は判定の向きが狙いを追い、噛みの実行で固まる・gameStore)。
 *  - hitAt(消え切る)= 発火 + 溜め + 噛み = `isBiteResolveDue` が真になる時刻(=判定の瞬間)。
 * ★多段は段ごと(掟③): 2発目は自分のよろけの頭から自分の命中まで=1発目の窓と混ぜない。
 */
interface MeteorWindow { startAt: number; drawAt: number; lockAt: number; hitAt: number; lockCue: boolean }

/** スケルトンの線が満ちるまで=体の赤の点滅2回ぶん(chaffMoveBlinkStrength と同じ拍)。 */
const SKELETON_DRAW_MS = (CHAFF_BLINK_ON_MS + CHAFF_BLINK_OFF_MS) * CHAFF_BLINK_COUNT;

const biteWindowFromFire = (
  startAt: number, fireAt: number, spec: BiteSpec, drawAt?: number, lockAt?: number, lockCue = true,
): MeteorWindow => ({
  startAt,
  drawAt: Math.min(drawAt ?? fireAt + spec.windupMs, fireAt + spec.windupMs),
  lockAt: lockAt ?? fireAt + spec.windupMs,
  hitAt: fireAt + spec.windupMs + spec.biteMs,
  lockCue,
});

/** 噛みが立っている(`biteAt>0`)間の窓。 */
const firedBiteWindow = (e: Enemy, spec: BiteSpec): MeteorWindow => {
  const biteAt = e.biteAt ?? 0;
  if (e.type === 'zombie' && e.chaffMove === 'zombie-double' && e.aiPhase === 'z-bite1' && e.chaffBlinkAt !== undefined) {
    const st = Math.min(biteAt, e.chaffBlinkAt - ZOMBIE_WINDUP_MS);
    return biteWindowFromFire(st, biteAt, spec, Math.min(biteAt, e.chaffBlinkAt), st);
  }
  if (e.type === 'zombie' && e.chaffMove === 'zombie-double' && e.aiPhase === 'z-bite2') {
    // よろけ(z-stagger)の頭は状態に残っていないので、発火(=よろけの明け)から尺ぶん戻す(ずれは1フレーム以内)。
    return biteWindowFromFire(biteAt - ZOMBIE_STAGGER_MS, biteAt, spec, biteAt);
  }
  if (e.type === 'skeleton' && e.chaffMove === 'skel-bite' && e.aiPhase === 's-bite' && e.chaffMoveAt !== undefined) {
    const st = Math.min(biteAt, e.chaffMoveAt);
    return biteWindowFromFire(st, biteAt, spec, st + SKELETON_DRAW_MS);
  }
  // 前段の無い噛み(§12の噛みつき・コウモリ等): 向きが固まる合図は出さない(形は従来どおり)。
  return biteWindowFromFire(biteAt, biteAt, spec, undefined, undefined, false);
};

/**
 * 噛みが**まだ立っていない**溜め(ゾンビの構え・よろけ / スケルトンの回り込み)の窓と、その技の spec。
 * 発火の時刻は状態機械の期限から決まる(z-red-pause・z-stagger=`aiPhaseUntil` / s-arc=`aiStartedAt`+回り込み)。
 * どれでもなければ null(★スケルトンのしゃがみ=色なしで形だけ読ませる・社長「推薦で」2026-10-23)。
 */
export const preBiteMeteorWindow = (e: Enemy): (MeteorWindow & { spec: BiteSpec }) | null => {
  if (e.biteAt !== undefined && e.biteAt > 0) return null;
  if (e.type === 'zombie' && e.aiPhase === 'z-red-pause' && e.aiPhaseUntil !== undefined) {
    const spec = biteSpecFor('zombie', 'zombie-double', 'z-bite1');
    const blinkAt = e.chaffBlinkAt ?? e.aiPhaseUntil - ZOMBIE_STANCE_MS + ZOMBIE_WINDUP_MS;
    const st = blinkAt - ZOMBIE_WINDUP_MS;
    return { ...biteWindowFromFire(st, e.aiPhaseUntil, spec, blinkAt, st), spec };
  }
  if (e.type === 'zombie' && e.aiPhase === 'z-stagger' && e.aiPhaseUntil !== undefined) {
    const spec = biteSpecFor('zombie', 'zombie-double', 'z-bite2');
    return { ...biteWindowFromFire(e.aiPhaseUntil - ZOMBIE_STAGGER_MS, e.aiPhaseUntil, spec, e.aiPhaseUntil), spec };
  }
  if (e.type === 'skeleton' && e.aiPhase === 's-arc') {
    const arcAt = e.aiStartedAt ?? e.chaffMoveAt;
    if (arcAt === undefined) return null;
    const spec = biteSpecFor('skeleton', 'skel-bite');
    return { ...biteWindowFromFire(arcAt, arcAt + SKELETON_ARC_MS, spec, arcAt + SKELETON_DRAW_MS), spec };
  }
  return null;
};

/** 線の幾何(始点・向き・届く長さ)から、両端を切り詰めた描く区間を作る(噛み・溜めの両方で同じ作法)。 */
const lineGeometry = (
  fx: number, fy: number, dirX: number, dirY: number, contact: number, reach: number,
): Pick<BiteTelegraphLine, 'fx' | 'fy' | 'tx' | 'ty' | 'dfx' | 'dfy' | 'dtx' | 'dty'> => {
  // 手前=敵の箱の半径(接触距離からプレイヤーの半幅を引いた残り)。奥=プレイヤーの絵の半幅。
  // 足して全長を超える(=密着で発火した)時は、**比率を保ったまま両方を縮める**
  // (片方だけ削ると線が敵側/プレイヤー側へ偏って、方角が読めなくなる)。
  const trimNear0 = Math.max(0, contact - PLAYER_HALF_PX);
  const trimFar0 = TRIM_NEAR_PLAYER_PX;
  const room = Math.max(0, reach - MIN_DRAWN_PX);
  const shrink = trimNear0 + trimFar0 > room ? room / Math.max(0.001, trimNear0 + trimFar0) : 1;
  const tn = trimNear0 * shrink, tf = trimFar0 * shrink;
  return {
    fx, fy,
    tx: fx + dirX * reach, ty: fy + dirY * reach,
    dfx: fx + dirX * tn, dfy: fy + dirY * tn,
    dtx: fx + dirX * (reach - tf), dty: fy + dirY * (reach - tf),
  };
};

/** 窓から時刻の欄(prog/drawFrac/remainMs/pulseAt)を作る。 */
const meteorTiming = (
  w: MeteorWindow, gameTime: number,
): Pick<BiteTelegraphLine, 'prog' | 'drawFrac' | 'remainMs' | 'pulseAt' | 'startAt' | 'hitAt' | 'lockAt' | 'lockCue'> => {
  const span = Math.max(1, w.hitAt - w.startAt);
  return {
    prog: Math.max(0, Math.min(1, (gameTime - w.startAt) / span)),
    drawFrac: Math.max(0.01, Math.min(0.99, (w.drawAt - w.startAt) / span)),
    remainMs: Math.max(0, w.hitAt - gameTime),
    // 脈の時計=**その攻撃自身の経過**(監査#3)。溜めの頭から数える=相が変わっても拍が途切れない。
    pulseAt: gameTime - w.startAt,
    startAt: w.startAt, hitAt: w.hitAt, lockAt: w.lockAt, lockCue: w.lockCue,
  };
};

/** ゾンビ2連の2発目(よろけ〜噛み2)か。 */
const isSecondBite = (e: Enemy): boolean =>
  e.type === 'zombie' && (e.aiPhase === 'z-stagger' || (e.chaffMove === 'zombie-double' && e.aiPhase === 'z-bite2'));

export const biteTelegraphLine = (e: Enemy, gameTime: number): BiteTelegraphLine | null => {
  // ★リッチの転移噛み(§16-C)は線を出さない: 当たるのは**ワープ先**(lichBlinkAtX/Y の赤い円が予告)で、
  //   biteDirX/Y はワープ元の古い向き=ここで線を引くと「ワープ元に赤」「赤いのに当たらない」になる
  //   (§16-C「ワープ元には赤を1本も描かない」・品質監査2026-10-23 2巡目 A-1)。
  if (e.chaffMove === 'lich-blink') return null;
  const phase = bitePhaseOf(e, gameTime);
  if (phase === 'none') return null;
  const dirX = e.biteDirX, dirY = e.biteDirY;
  if (dirX === undefined || dirY === undefined) return null;
  const spec = biteSpecFor(e.type, e.chaffMove, e.aiPhase);
  const total = spec.windupMs + spec.biteMs;
  if (total <= 0) return null;
  const lp = e.biteLungePx ?? spec.lungePx;
  // 踏み込みで既に進んだぶんを引き戻して、**発火時の中心**を復元する(線を世界に固定するため。
  // 新しい状態を持たずに済む=`biteLungeFrac` が同じ曲線を知っている)。
  const frac = biteLungeFrac(e, gameTime);
  const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
  const fx = ecx - dirX * lp * frac, fy = ecy - dirY * lp * frac;
  const contact = biteContactDistPx(e);
  const geo = lineGeometry(fx, fy, dirX, dirY, contact, lp + contact);
  const fxc = e.type === 'zombie' && e.chaffMove === 'zombie-double' && e.aiPhase === 'z-bite1'
    ? zombieFirstBiteFxCenter(fx, fy, dirX, dirY, lp, contact)
    : { x: geo.tx, y: geo.ty };
  return {
    ...geo,
    fxX: fxc.x, fyY: fxc.y,
    ...meteorTiming(firedBiteWindow(e, spec), gameTime),
    biteMs: spec.biteMs,
    counterable: spec.counterable,
    emphasis: isSecondBite(e) ? BITE_SECOND_EMPHASIS : 1,
    mobLine: !isBossType(e.type),
    footFromOff: e.height / 2,
    targetsEscort: e.biteAimEscortId !== undefined,
    footToOff: e.biteAimEscortId !== undefined ? ESCORT_BODY_SIZE / 2 : PLAYER_HALF_PX,
  };
};

/**
 * ★ゾンビ1発目の噛みの四角(エフェクトの絵=判定)の中心。発火時の中心(fx,fy)から焼いた向き(dir)へ、
 * 「踏み込み(lp)+体の半分(接触距離−プレイヤーの半幅)」進んだ点=**ゾンビの前の端**に、四角の**後ろの端**を揃える。
 * 後ろの端=四角の4隅のうち dir 方向の内積が最小の点(向きが斜めでも四角がゾンビの後ろへはみ出さない)。
 */
export const zombieFirstBiteFxCenter = (
  fx: number, fy: number, dirX: number, dirY: number, lp: number, contact: number,
): { x: number; y: number } => {
  const r = biteFxRect('zombie-double', 0, 0, dirX >= 0);
  const front = lp + Math.max(0, contact - PLAYER_HALF_PX);
  if (!r) return { x: fx + dirX * (lp + contact), y: fy + dirY * (lp + contact) };
  const back = Math.min(
    r.x * dirX + r.y * dirY, (r.x + r.w) * dirX + r.y * dirY,
    r.x * dirX + (r.y + r.h) * dirY, (r.x + r.w) * dirX + (r.y + r.h) * dirY,
  );
  const t = front - back;
  return { x: fx + dirX * t, y: fy + dirY * t };
};

/** 狙いの点(世界座標)。 */
export interface AimPoint { x: number; y: number }

/**
 * ★雑魚の狙い(状態機械の `apx/apy` と同じ式): 軍人を追っている(`targetEscortId`)なら、その軍人が
 * 狙える候補(`escortAggroCandidates`=見えていて倒れていない)に居る時だけ軍人の体の中心。それ以外は実プレイヤー。
 */
export const chaffAimPoint = (
  e: Pick<Enemy, 'targetEscortId'>, player: AimPoint, escortCands: readonly { id: string; x: number; y: number }[],
): AimPoint & { escort: boolean } => {
  if (e.targetEscortId !== undefined) {
    const c = escortCands.find(k => k.id === e.targetEscortId);
    if (c) return { x: c.x, y: c.y, escort: true };
  }
  return { x: player.x, y: player.y, escort: false };
};

/**
 * ★噛みが立つ前の溜め(ゾンビの構え・よろけ / スケルトンのしゃがみ・回り込み)の流星(社長指示2026-10-23)。
 * 向きと長さは「**いま発火したら焼かれる値**」(=状態機械が発火の瞬間に焼く式と同じ: 向き=狙いへ /
 * 踏み込み=`biteLungeDistanceAtFire`)。発火の瞬間に `biteTelegraphLine` へ切り替わっても線が跳ばない。
 * **時刻は `preBiteMeteorWindow`**(シミュの期限から)。描画は `biteTelegraphLine` と同じキーで続けて描く
 * (=1本の流星が溜めの頭から命中まで途切れない)。
 */
export const preBiteTelegraphLine = (
  e: Enemy, gameTime: number, aim: AimPoint, aimIsEscort = false,
): BiteTelegraphLine | null => {
  const w = preBiteMeteorWindow(e);
  if (!w || gameTime >= w.hitAt) return null;
  if (e.type !== 'zombie' && e.type !== 'skeleton') return null;
  const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
  const d = Math.hypot(aim.x - ecx, aim.y - ecy);
  const bl = Math.max(0.001, d);
  // ★ゾンビの構え(z-red-pause)は、構えに入った瞬間に焼いた向き(stanceDirX/Y)のまま=追わない(状態機械と同じ)。
  const stance = e.type === 'zombie' && e.aiPhase === 'z-red-pause' ? zombieStanceDirOf(e) : null;
  const dirX = stance ? stance.x : (aim.x - ecx) / bl, dirY = stance ? stance.y : (aim.y - ecy) / bl;
  const contact = biteContactDistPx(e);
  const lp = biteLungeDistanceAtFire(e.type, bl);
  const geo = lineGeometry(ecx, ecy, dirX, dirY, contact, lp + contact);
  return {
    ...geo,
    fxX: geo.tx, fyY: geo.ty,
    ...meteorTiming(w, gameTime),
    biteMs: w.spec.biteMs,
    counterable: w.spec.counterable,
    emphasis: isSecondBite(e) ? BITE_SECOND_EMPHASIS : 1,
    mobLine: true,
    footFromOff: e.height / 2,
    targetsEscort: aimIsEscort,
    footToOff: aimIsEscort ? ESCORT_BODY_SIZE / 2 : PLAYER_HALF_PX,
  };
};

/** 群れの中で通常の強さで描く雑魚の噛みの線の本数(プレイヤーに近い順・社長「推薦で」2026-10-23)。 */
export const MOB_METEOR_FULL_COUNT = 3;
/** 順位の境目のヒステリシス(px)。前フレームで上位だった線は、この距離ぶん近いものとして並べる(境目でちらつかない)。 */
export const MOB_METEOR_RANK_HYSTERESIS_PX = 24;

/**
 * ★群れの強弱の順位(純関数)。`d`=**敵の中心とプレイヤーの距離**。近い順に `count` 本を「通常の強さ」に選ぶ。
 * 前フレームで選ばれていた線(`prevFull`)はヒステリシスぶん有利=同じくらいの距離の2体が入れ替わり続けない。
 * 出る/消える時刻・形は変えない(描画が濃さ・太さを1段落とすだけ)。
 */
export const rankMobMeteors = (
  items: readonly { key: string; d: number }[], prevFull: ReadonlySet<string>,
  count: number = MOB_METEOR_FULL_COUNT, hysteresisPx: number = MOB_METEOR_RANK_HYSTERESIS_PX,
): Set<string> => {
  const sorted = [...items].sort((a, b) =>
    (a.d - (prevFull.has(a.key) ? hysteresisPx : 0)) - (b.d - (prevFull.has(b.key) ? hysteresisPx : 0))
    || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return new Set(sorted.slice(0, Math.max(0, count)).map(x => x.key));
};
