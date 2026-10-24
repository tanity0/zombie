// ステージ4: 衛生兵ジュンの同行・離脱・変身(research/JUN_ESCORT.md §1)の判定。純関数だけ(PixiJS/store を import しない)。
//
// 流れ:
//   ① 出撃: ステージ4の通常の進軍NPC(4人)と一緒に出撃し、**最初からプレイヤーについて歩く**(社長指示2026-10-19
//      「ジュンは最初からプレイヤーについてくる。拠点解放には行かない。」)。拠点へは向かわず、拠点の滞在・解放・駐留に数えない
//      (隊の4人だけで拠点が進む)。ついて歩く動きは拠点の駐留兵の「ついてくる」(utils/escortFollow stepEscortFollow=慣性つき)を流用。
//      戦い方・狙われる・倒れる/起こされる・台詞は他の進軍NPCと同じ配線のまま。
//   ② 離脱: 城ボスの時刻に城の足元へ着くよう逆算して(距離÷歩く速さ)、「変な感じがする…」と言って隊を外れ、一拍おいて
//      城ボスがいつも出る場所(城)へ歩いて行く。隊(escorts)からは外れる=戦わない・狙われない・倒れない・台詞も出ない。
//      倒れていたら起き上がってから離脱する。画面下のぼけの帯では少し待つ。
//   ③ 変身: 城ボスが出る瞬間、カメラがジュンへ向き(素のアテンション=時間停止)、ゆっくり倒れ、城ボスが城の位置に現れる。
//      そのまま通常のボスのアテンション(カットイン)へ。置き直しは画面に見えている所では起こさない。
//   ジュンが居ない(隊に居ない・名簿に無い)時は、城ボスは従来どおり出る。
import { JUN_ESCORT_INDEX, JUN_NAME, JUN_COLLAPSE_LINE } from '../data/junEscortLines';
import type { JunDeparture } from '../types/game';
import type { EscortFollowState } from './escortFollow';

/** ジュンが加わるステージ。 */
export const JUN_ESCORT_STAGE_ID = 'stage-4';
/** 隊の中のジュンの id(描画のスプライトも離脱後まで同じ id で引き継ぐ)。 */
export const JUN_ESCORT_ID = 'escort-jun';

export const isJunEscort = (e: { soldierIndex: number }): boolean => e.soldierIndex === JUN_ESCORT_INDEX;

/**
 * このランの名簿にジュンを加えるか。ステージ4の、通常の進軍NPC(4人)が出る出撃だけ。
 * normalRoster=false(チュートリアルの随行・練習ラン・ボス戦テスト・ストーリーボス・ラボ/屋内など護衛が出ない出撃)と
 * 洋館再訪(城ボスが出ない=変身の流れが閉じない)では加えない。
 */
export const junJoinsRun = (i: { stageId: string; normalRoster: boolean; revisit: boolean }): boolean =>
  i.stageId === JUN_ESCORT_STAGE_ID && i.normalRoster && !i.revisit;

// ---- ① 同行(プレイヤーについて歩く) -----------------------------------------------------------------------------
/**
 * ジュンが今フレーム「ついてくる」で動くか。ジュンは拠点の解放状態に関係なく、出撃の最初からずっとついてくる
 * (拠点の駐留兵の「連れて歩く」の切り替え・担当区域の判定は見ない=ジュンは駐留兵ではない)。
 * ウェルカムの輪が出ている間だけは、他の進軍NPCと同じく出撃地点で待つ(輪の中の敵は撃つ)。
 */
export const junFollowsPlayer = (i: { isJun: boolean; welcomeHold: boolean }): boolean => i.isJun && !i.welcomeHold;

/**
 * 進軍NPCの「ついてくる/帰る」の状態機械の代わりにジュンが使う答え(stepFollowMachine と同じ形)。
 * 常に follow・見送り無し・「ついてき始めた」の台詞も無し(出撃の一言=sortie がその役)。
 */
export const junFollowMachine = (): { state: EscortFollowState; pauseUntil: undefined; started: false } =>
  ({ state: 'follow', pauseUntil: undefined, started: false });

/**
 * 拠点の滞在(dwell)・解放に数えるか。ジュンは数えない=ジュンが拠点の円に立っていても解放は進まない
 * (隊の人数・拠点の解放の進み方は4人のまま)。
 */
export const countsForBaseCapture = (e: { soldierIndex: number }): boolean => !isJunEscort(e);

/**
 * ジュンの拠点の名札。どの拠点の id とも一致しない=「その拠点の担当」を baseId で引く既存の配線(駐留・遠方の通信・確保の全快・
 * ボットの付き添い先・区画の担当)にジュンは入らない。蹴り飛ばしの候補は「拠点表に居ない兵士=区画を問わない」の既存の扱いになる
 * (ジュンはいつもプレイヤーの隣に居る=プレイヤーの区画の兵士)。
 */
export const JUN_BASE_ID = 'jun-follow';
/**
 * 護衛のループで「担当拠点」が要る所に渡す、ジュンの仮の拠点(自分の足元・解放済み扱い=前進・苦戦の通信・巡回の枝に入らない)。
 * 滞在・解放は countsForBaseCapture が別に止める。
 */
export const junPseudoBase = (pos: { x: number; y: number }): { id: string; x: number; y: number; status: 'captured' } =>
  ({ id: JUN_BASE_ID, x: pos.x, y: pos.y, status: 'captured' });

/**
 * ジュンの「拠点の近く」(医師団はどこに…)の対象=いちばん近い未解放の拠点(nearDist 以内)。
 * ジュンは担当の拠点へ向かわないので、自分の担当ではなく「プレイヤーと歩いていて近づいた拠点」で言う。
 */
export const junNearOpenBase = <B extends { x: number; y: number; status: string }>(
  pos: { x: number; y: number }, bases: readonly B[], nearDist: number,
): B | null => {
  let best: B | null = null, bd = nearDist;
  for (const b of bases) {
    if (b.status !== 'open') continue;
    const d = Math.hypot(pos.x - b.x, pos.y - b.y);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
};

/**
 * 「置いていかれそう」(待って…置いていかないで…): ついてくるジュンがプレイヤーから離された時に一度。
 * 離された=足元どうしの距離が JUN_LEFT_BEHIND_PX を超えた瞬間。JUN_LEFT_BEHIND_REARM_PX まで追いついたら次に備える(ヒステリシス)。
 * 間隔(同じ一言の連発防止)は台詞の CD(JUN_LEFT_BEHIND_CD_MS)が受け持つ。
 */
export const JUN_LEFT_BEHIND_PX = 380;
export const JUN_LEFT_BEHIND_REARM_PX = 200;
export const JUN_LEFT_BEHIND_CD_MS = 30_000;
export const junLeftBehindStep = (distPx: number, prevFar: boolean): { far: boolean; speakNow: boolean } => {
  if (prevFar) return { far: distPx > JUN_LEFT_BEHIND_REARM_PX, speakNow: false };
  const far = distPx > JUN_LEFT_BEHIND_PX;
  return { far, speakNow: far };
};

// ---- 歩き(慣性つき) --------------------------------------------------------------------------------------
/** 歩き出し/止まりの加速度(px/s²)。進軍NPCの歩きの速さへ約0.6秒で乗り、目的地の手前で同じ加速度で減速して止まる。 */
export const JUN_WALK_ACCEL = 120;
const ARRIVE_EPS = 1.5;

export interface JunWalkInput {
  x: number; y: number; speed: number;
  targetX: number; targetY: number;
  dtSec: number;
  /** 歩きの最高速(px/s)。 */
  vmax: number;
  accel?: number;
  /** 最終の行き先までの道のり(回り込みの経由点へ向かう時。減速はこの長さで掛ける=経由点で止まらない)。 */
  remainingPx?: number;
}
export interface JunWalkOutput { x: number; y: number; speed: number; dirX: number; dirY: number; arrived: boolean }
/**
 * 目的地へ1フレーム歩く。加速→巡航→手前で減速して止まる(慣性MUST: パッと動き出す/瞬間に止まるはしない)。
 * 減速は「今の速さで止まれる距離」(v²/2a)から逆算=行き過ぎない。
 */
export const stepJunWalk = (i: JunWalkInput): JunWalkOutput => {
  const a = i.accel ?? JUN_WALK_ACCEL;
  const dx = i.targetX - i.x, dy = i.targetY - i.y;
  const d = Math.hypot(dx, dy);
  if (d <= ARRIVE_EPS) {
    const through = (i.remainingPx ?? d) > d + ARRIVE_EPS; // 経由点の上=速さを保って次へ
    return { x: i.targetX, y: i.targetY, speed: through ? i.speed : 0, dirX: 0, dirY: 0, arrived: !through };
  }
  const ux = dx / d, uy = dy / d;
  const want = Math.min(i.vmax, Math.sqrt(2 * a * Math.max(d, i.remainingPx ?? d)));
  const dv = a * Math.max(0, i.dtSec);
  const speed = i.speed < want ? Math.min(want, i.speed + dv) : Math.max(want, i.speed - dv);
  const step = Math.min(d, speed * Math.max(0, i.dtSec));
  if (d - step <= ARRIVE_EPS) {
    // 経由点(道のりがまだ残る)は速さを保ったまま通り過ぎる。最終の行き先だけ止まる。
    const through = (i.remainingPx ?? d) > d + ARRIVE_EPS;
    return { x: i.targetX, y: i.targetY, speed: through ? speed : 0, dirX: ux, dirY: uy, arrived: !through };
  }
  return { x: i.x + ux * step, y: i.y + uy * step, speed, dirX: ux, dirY: uy, arrived: false };
};

// ---- ② 離脱 ----------------------------------------------------------------------------------------------
/**
 * 城ボスの出現時刻のどれだけ前に隊を離れるか(社長指示2026-10-19「城ボス出現の少し前にジュンは自然と離脱」)。
 * 城まで歩いて着く時間から逆算する(城ボスの時刻に城の足元へ着く)。下限=少し前(40秒)・上限=離れすぎない(120秒)。
 */
export const JUN_DEPART_LEAD_MIN_MS = 40_000;
export const JUN_DEPART_LEAD_MAX_MS = 120_000;
/** 一言を言ってから、その場で止まり、向きを変えて歩き出すまで(一言の文字送りぶん+0.8秒の間)。 */
export const JUN_DEPART_WALK_DELAY_MS = 1_500;
/** 逆算の余白(障害物で回り込む・加速のぶん)。 */
const JUN_DEPART_LEAD_MARGIN_MS = 5_000;
/** 離れる前の一言(道中の「一緒にいる」と同じ文言)と区別するため、道中の同じ一言をこれだけ前から止める。 */
export const JUN_COMPANION_QUIET_BEFORE_MS = 30_000;
/** 起き上がってから離脱するまでの間(起き上がりの動き=自力でも1.4秒が見えてから)。 */
export const JUN_DEPART_AFTER_RISE_MS = 1_500;

/** 城の足元まで歩く時間から離脱のリード(ms)を出す。 */
export const junDepartLeadMs = (distPx: number, vmaxPxPerS: number): number => {
  const walkMs = vmaxPxPerS > 0 ? (Math.max(0, distPx) / vmaxPxPerS) * 1000 : JUN_DEPART_LEAD_MAX_MS;
  const accelMs = vmaxPxPerS > 0 ? (vmaxPxPerS / JUN_WALK_ACCEL) * 1000 : 0;
  const lead = walkMs + accelMs + JUN_DEPART_WALK_DELAY_MS + JUN_DEPART_LEAD_MARGIN_MS;
  return Math.max(JUN_DEPART_LEAD_MIN_MS, Math.min(JUN_DEPART_LEAD_MAX_MS, lead));
};
/** 道中の「変な感じがする…」(一緒にいる)を止める時刻に入ったか(離脱の一言で初めて聞かせる)。 */
export const junCompanionQuiet = (directorTimeMs: number, castleMinMs: number, leadMs: number): boolean =>
  directorTimeMs >= castleMinMs - leadMs - JUN_COMPANION_QUIET_BEFORE_MS;

export interface JunDepartDueInput {
  /** ジュンが隊(escorts)に居る。 */
  junInSquad: boolean;
  /** 城ボスを出す経路が生きている(城ボスの出現条件のうち時刻以外=ダンス試験/物語ボス/EX/訓練/再訪/湧き止め等でない)。 */
  castleRouteOk: boolean;
  castleSpawned: boolean;
  /** ディレクターの時計(城ボスの時刻と同じ時計)。 */
  directorTimeMs: number;
  /** 城ボスの出現時刻(CASTLE_BOSS_MIN_TIME_MS)。 */
  castleMinMs: number;
  /** 城ボスの出現条件が今満ちている(強制出現も含む)。満ちていれば時刻に関わらず離脱へ。 */
  castleReady: boolean;
  /** 離脱のリード(junDepartLeadMs=城まで歩く時間から逆算)。 */
  leadMs: number;
}
/** 離脱の時刻が来たか(城ボスの時刻 − 歩いて着く時間)。 */
export const junDepartDue = (i: JunDepartDueInput): boolean =>
  i.junInSquad && i.castleRouteOk && !i.castleSpawned
  && (i.castleReady || i.directorTimeMs >= i.castleMinMs - i.leadMs);

export interface JunDepartReadyInput {
  downed: boolean;
  /** 最後に起き上がってからの時間(ms)。一度も倒れていなければ null。 */
  sinceRiseMs: number | null;
  /** 被弾の滑り・しゃがみの最中。 */
  busy: boolean;
  /** 蹴り飛ばしに割り当てられている最中。 */
  kicking: boolean;
  /** ピントの合う帯に居る(または画面外・待ちすぎ)=junFocusOk。 */
  focusOk: boolean;
}
/** 今その場で離脱できる体勢か(倒れていたら起き上がった後に離脱する・画面下のぼけの帯では少し待つ)。 */
export const junDepartReady = (i: JunDepartReadyInput): boolean =>
  !i.downed && !i.busy && !i.kicking && i.focusOk && (i.sinceRiseMs === null || i.sinceRiseMs >= JUN_DEPART_AFTER_RISE_MS);

/**
 * ピントの合う帯(描画の被写界深度=tilt-shift のくっきりした帯・pixiScene の TILT_SHIFT_BAND と同じ中心)。
 * 離脱の一言と歩き出しは、ぼけていない所で見せる(画面下のぼけの帯では少し待つ)。
 */
export const JUN_FOCUS_BAND_CENTER = 0.54;
export const JUN_FOCUS_BAND_HALF = 0.2;
/** ぼけの帯で待つ上限(これを過ぎたら離れる=城ボスの時刻を守る)。 */
export const JUN_FOCUS_WAIT_MAX_MS = 10_000;
/** 世界のY → 画面の高さに対する割合(カメラ=画面の左上・ズームは画面の中心まわり)。 */
export const worldToScreenYFrac = (worldY: number, cameraY: number, viewH: number, zoom: number): number =>
  ((worldY - cameraY) - viewH / 2) * zoom / Math.max(1, viewH) + 0.5;
export const junFocusOk = (i: { onScreen: boolean; screenYFrac: number; waitedMs: number }): boolean =>
  !i.onScreen || Math.abs(i.screenYFrac - JUN_FOCUS_BAND_CENTER) <= JUN_FOCUS_BAND_HALF || i.waitedMs >= JUN_FOCUS_WAIT_MAX_MS;

/**
 * 歩いて行く先=城ボスがいつも出る場所の足元。城ボスは城の座標(castle.x, castle.y)を左上にして出る(useGameLoop の
 * spawnEnemyAt('giantbat', castle.x, castle.y))ので、その当たり箱の下辺の中央。bossW/bossH=城ボスの当たり箱の寸法。
 */
export const castleBossFootPoint = (castle: { x: number; y: number }, bossW: number, bossH: number): { x: number; y: number } =>
  ({ x: castle.x + bossW / 2, y: castle.y + bossH });

// ---- ③ 城ボスの出し方 --------------------------------------------------------------------------------------
/**
 * 城ボスの出現条件が満ちた時に、どの道で出すか。**ジュンが画面に映っている間は、置き直しも強制の変身もしない(待つ)**。
 *  - legacy: ジュンが関わらない=従来どおり(城に魔法陣で出て、少し後にカットイン)。
 *  - hold: まだ出さない(ジュンが隊に居て離脱待ち/画面に映ったまま歩いている途中/画面外の点から入って来る途中/別のアテンション中)。
 *  - relocate: 歩き途中のジュンを「城へ向かう道の上で、画面の外のいちばん城寄りの点」へ置き直す(そこから歩いて入って来る)。
 *              ジュンが画面外・城の足元が画面内の時に1回。全体の上限(長め)を過ぎてもまだ着かない時は、画面外に居る瞬間にもう一度。
 *  - collapse: ジュンへのアテンション→倒れる→変身を始める(着いている/ジュンも城の足元も画面外=足元へ置いても見えない)。
 *  - busy: 変身の最中(城ボスの出現は変身の流れが出す)。
 */
export type JunCastleRoute = 'legacy' | 'hold' | 'relocate' | 'collapse' | 'busy';
/** 全体の上限(城ボスを止め続けない)。過ぎたら、ジュンが画面外に居る瞬間に置き直す(画面に映っている間はやはり待つ)。 */
export const JUN_HOLD_LONG_CAP_MS = 60_000;
export interface JunCastleRouteInput {
  junInSquad: boolean;
  phase: JunDeparture['phase'] | null;
  /** 歩いている途中のジュンが画面に見えている。 */
  junOnScreen: boolean;
  /** 城ボスが出る場所(城の足元)が画面に見えている。 */
  targetOnScreen: boolean;
  /** 既に一度、画面外の点へ置き直した。 */
  relocated: boolean;
  /** 城ボスの条件が満ちてから待っている時間(ms)。 */
  holdMs: number;
  /** 別のアテンション(カメラの寄り)が出ている。 */
  attentionBusy: boolean;
}
export const junCastleRoute = (i: JunCastleRouteInput): JunCastleRoute => {
  if (i.phase === 'collapsing' || i.phase === 'vanishing') return 'busy';
  if (i.phase === null) return i.junInSquad ? 'hold' : 'legacy';
  if (i.attentionBusy) return 'hold';
  if (i.phase === 'waiting') return 'collapse';
  // 歩いている途中: 画面に映っている間は何もしない(置き直しが見えてしまう)。
  if (i.junOnScreen) return 'hold';
  if (!i.targetOnScreen) return 'collapse'; // どちらも画面外=足元へ置いても見えない
  if (!i.relocated) return 'relocate';
  return i.holdMs >= JUN_HOLD_LONG_CAP_MS ? 'relocate' : 'hold';
};

/**
 * 置き直し先: 城へ向かう道(ジュン→城の足元)の上で、画面の外にある、いちばん城寄りの点。
 * 城の足元が画面外ならその足元。道が全部画面内なら、道をジュンの後ろへ延ばした先の画面外の点。
 * visible=その点が画面(+余白)に見えているか。
 */
export const junRelocatePoint = (
  from: { x: number; y: number }, target: { x: number; y: number }, visible: (x: number, y: number) => boolean, stepPx = 12,
): { x: number; y: number } => {
  if (!visible(target.x, target.y)) return { x: target.x, y: target.y };
  const dx = from.x - target.x, dy = from.y - target.y;
  const L = Math.hypot(dx, dy);
  const ux = L > 0 ? dx / L : 0, uy = L > 0 ? dy / L : 1;
  for (let s = stepPx; s <= L + 6000; s += stepPx) {
    const x = target.x + ux * s, y = target.y + uy * s;
    if (!visible(x, y)) return { x, y };
  }
  return { x: from.x, y: from.y };
};

// ---- ③ 倒れる→変身の時間割(アテンションの開始=実時間 0) ---------------------------------------------------
/** カメラが寄り切ってから倒れ始めるまでの間(立ったまま、こちらに見られている一拍)。 */
export const JUN_COLLAPSE_BEAT_MS = 500;
/** ゆっくり倒れる尺(倒れの3コマを長く)。 */
export const JUN_FALL_MS = 1_800;
/** 倒れ切ってから変身するまでの間(動かない体を見せる)。 */
export const JUN_LIE_MS = 600;
/** 変身の瞬間に体が消える尺(城ボスの出現の閃光の中でフェードアウト)。 */
export const JUN_VANISH_MS = 320;
/** アテンションのホールドが変身より先に明けないための余白。 */
const JUN_HOLD_MARGIN_MS = 400;
/** 倒れのコマの切り替え(fallK)。 */
export const JUN_FALL_FRAME1_AT = 0.3;
export const JUN_FALL_FRAME2_AT = 0.75;

/** 変身の時刻(アテンション開始からの実時間ms)。 */
export const junTransformAtMs = (attnInMs: number): number => attnInMs + JUN_COLLAPSE_BEAT_MS + JUN_FALL_MS + JUN_LIE_MS;
/** 素のアテンションのホールド延長(変身の瞬間まで時間停止とカメラの寄りが続く)。 */
export const junAttentionExtraHoldMs = (attnInMs: number, attnHoldMs: number): number =>
  Math.max(0, junTransformAtMs(attnInMs) - attnInMs - attnHoldMs + JUN_HOLD_MARGIN_MS);

export interface JunCollapseView {
  /** 倒れている度合い 0..1(重力=ease-in: ゆっくり崩れ始めて、地面へ向けて速くなる)。 */
  fallK: number;
  /** 倒れのコマ(-1=まだ立っている=歩きシートの立ちコマ / 0..2=倒れの3コマ)。 */
  frame: -1 | 0 | 1 | 2;
  /** 地面に着いた(倒れ切った)。 */
  landed: boolean;
  /** 変身の時刻を過ぎた。 */
  transformDue: boolean;
}
/** 倒れる途中の見え方(描画とループが同じ答えを使う)。 */
export const junCollapseView = (elapsedMs: number, attnInMs: number): JunCollapseView => {
  const t = (elapsedMs - attnInMs - JUN_COLLAPSE_BEAT_MS) / JUN_FALL_MS;
  const transformDue = elapsedMs >= junTransformAtMs(attnInMs);
  if (t < 0) return { fallK: 0, frame: -1, landed: false, transformDue };
  const p = Math.min(1, t);
  const fallK = p * p;
  const frame: 0 | 1 | 2 = fallK < JUN_FALL_FRAME1_AT ? 0 : fallK < JUN_FALL_FRAME2_AT ? 1 : 2;
  return { fallK, frame, landed: t >= 1, transformDue };
};
/** 変身で消えていく体の透明度(1→0・ease-out=最初に大きく抜けて閃光に溶ける)。 */
export const junVanishAlpha = (sinceVanishMs: number): number => {
  const u = Math.max(0, Math.min(1, sinceVanishMs / JUN_VANISH_MS));
  return (1 - u) * (1 - u);
};

/**
 * 倒れていく間の「位置」の動き(絵はそのまま=歪みではない・慣性)。単位は倒れの絵のテクスチャpx(描画が表示倍率を掛ける)。
 *  - 0コマ目(かがみ)の間: 膝が抜けるように少しずつ沈み(最大3px)、左右に一度ふらつく。
 *  - 2コマ目の直前: わずかに前へ倒れ込む(最大2px)。
 *  - 着地: 1.5px 跳ねて止まる。
 * forward=向いている側へ+ / down=下へ+。
 */
export const JUN_FALL_SINK_PX = 3;
export const JUN_FALL_SWAY_PX = 2.2;
export const JUN_FALL_LEAN_PX = 2;
export const JUN_FALL_BOUNCE_PX = 1.5;
export const JUN_FALL_BOUNCE_MS = 200;
export const junCollapseMotion = (elapsedMs: number, attnInMs: number): { forward: number; down: number } => {
  const t = (elapsedMs - attnInMs - JUN_COLLAPSE_BEAT_MS) / JUN_FALL_MS;
  if (t < 0) return { forward: 0, down: 0 };
  if (t >= 1) {
    const e = (t - 1) * JUN_FALL_MS;
    const b = e < JUN_FALL_BOUNCE_MS ? Math.sin(Math.PI * e / JUN_FALL_BOUNCE_MS) * (1 - e / JUN_FALL_BOUNCE_MS) : 0;
    return { forward: 0, down: b > 0 ? -JUN_FALL_BOUNCE_PX * b : 0 };
  }
  const k = t * t;
  if (k < JUN_FALL_FRAME1_AT) {
    const u = k / JUN_FALL_FRAME1_AT; // 0コマ目の中の進み 0..1
    const sink = JUN_FALL_SINK_PX * u * u * (3 - 2 * u);
    const sway = JUN_FALL_SWAY_PX * Math.sin(2 * Math.PI * u) * Math.sin(Math.PI * u);
    return { forward: sway, down: sink };
  }
  if (k >= JUN_FALL_FRAME2_AT - 0.15 && k < JUN_FALL_FRAME2_AT) {
    const u = (k - (JUN_FALL_FRAME2_AT - 0.15)) / 0.15;
    return { forward: JUN_FALL_LEAN_PX * u * u, down: 0 };
  }
  return { forward: 0, down: 0 };
};

/**
 * 倒れの絵の足元合わせ(テクスチャpx・向いている側へ+)を、倒れの度合い k に沿って**連続で**補間する(コマの段差で跳ばない)。
 * コマの頭(k1=1コマ目・k2=2コマ目に替わる所)で、そのコマの足元合わせ(後ろ足を揃える量)に届く。
 */
export const MEDIC_FALL_SHIFT_PX: readonly [number, number, number] = [0, 10, 14];
export const medicFallShiftPx = (k: number, k1: number, k2: number): number => {
  const [s0, s1, s2] = MEDIC_FALL_SHIFT_PX;
  const c = Math.max(0, Math.min(1, k));
  if (c <= k1) return s0 + (s1 - s0) * (c / Math.max(1e-6, k1));
  if (c <= k2) return s1 + (s2 - s1) * ((c - k1) / Math.max(1e-6, k2 - k1));
  return s2;
};

// ---- 道筋(城・木・散布物の当たり箱を回り込む) ------------------------------------------------------------------
/**
 * ジュンの体(足元アンカー)の当たり箱。進軍NPCと同じ ESCORT_BODY_SIZE(28)の正方形=足元から上へ28・左右へ14。
 * 道筋の計算は「足元の点」で行うので、障害物の箱をこの体の分だけ膨らませる(箱に体が触れない足元の範囲)。
 */
export const JUN_BODY_HALF_W = 14;
export const JUN_BODY_H = 28;
export interface PathRect { x: number; y: number; width: number; height: number }
interface Box { x0: number; y0: number; x1: number; y1: number }
const inflateForBody = (r: PathRect): Box => ({
  x0: r.x - JUN_BODY_HALF_W, x1: r.x + r.width + JUN_BODY_HALF_W,
  y0: r.y, y1: r.y + r.height + JUN_BODY_H,
});
const inside = (b: Box, x: number, y: number, eps = 0.01): boolean =>
  x > b.x0 + eps && x < b.x1 - eps && y > b.y0 + eps && y < b.y1 - eps;
/** 線分 a→b が箱の内部を通るか(縁をなぞるのは可)。Liang–Barsky。 */
const segmentHitsBox = (ax: number, ay: number, bx: number, by: number, b: Box): boolean => {
  const eps = 0.5;
  const x0 = b.x0 + eps, x1 = b.x1 - eps, y0 = b.y0 + eps, y1 = b.y1 - eps;
  if (x0 >= x1 || y0 >= y1) return false;
  const dx = bx - ax, dy = by - ay;
  let t0 = 0, t1 = 1;
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  if (!clip(-dx, ax - x0) || !clip(dx, x1 - ax) || !clip(-dy, ay - y0) || !clip(dy, y1 - ay)) return false;
  return t1 - t0 > 1e-6;
};

/**
 * 行き先が障害物(体ぶん膨らませた箱)の中にある時は、いちばん近い縁の外へ出した点にする
 * (城ボスの足元は城の当たり箱のすぐ下=体の頭が城に掛かるので、数px下の「着ける足元」へ)。
 */
export const junReachableGoal = (target: { x: number; y: number }, rects: readonly PathRect[]): { x: number; y: number } => {
  let g = { x: target.x, y: target.y };
  for (const r of rects) {
    const b = inflateForBody(r);
    if (!inside(b, g.x, g.y)) continue;
    const cands = [
      { x: g.x, y: b.y1 + 1, d: b.y1 - g.y }, { x: g.x, y: b.y0 - 1, d: g.y - b.y0 },
      { x: b.x0 - 1, y: g.y, d: g.x - b.x0 }, { x: b.x1 + 1, y: g.y, d: b.x1 - g.x },
    ].sort((p, q) => p.d - q.d);
    g = { x: cands[0].x, y: cands[0].y };
  }
  return g;
};

/**
 * 次に向かう点(回り込みの経由点)。行き先への直線が障害物を横切る時は、箱の角(体ぶん+余白の外側)を通る最短の道を選ぶ
 * (点=自分・行き先・各箱の4つの角の可視グラフで最短路)。道が無い時は行き先へ直接(押し戻しで滑る)。
 * remaining=行き先までの道のりの長さ(減速は道のり全体で掛ける=経由点で止まらない)。
 */
export const junNextWaypoint = (
  pos: { x: number; y: number }, goal: { x: number; y: number }, rects: readonly PathRect[], margin = 6,
): { x: number; y: number; remaining: number; detour: boolean } => {
  const boxes = rects.map(inflateForBody);
  const clear = (ax: number, ay: number, bx: number, by: number) => !boxes.some(b => segmentHitsBox(ax, ay, bx, by, b));
  const direct = Math.hypot(goal.x - pos.x, goal.y - pos.y);
  if (clear(pos.x, pos.y, goal.x, goal.y)) return { x: goal.x, y: goal.y, remaining: direct, detour: false };
  const nodes: { x: number; y: number }[] = [pos, goal];
  for (const b of boxes) {
    for (const [x, y] of [[b.x0 - margin, b.y0 - margin], [b.x1 + margin, b.y0 - margin], [b.x0 - margin, b.y1 + margin], [b.x1 + margin, b.y1 + margin]]) {
      if (!boxes.some(o => inside(o, x, y))) nodes.push({ x, y });
    }
  }
  const n = nodes.length;
  const dist = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  dist[0] = 0;
  for (let it = 0; it < n; it++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || dist[u] === Infinity) break;
    if (u === 1) break;
    done[u] = true;
    for (let v = 0; v < n; v++) {
      if (done[v] || v === u) continue;
      const w = Math.hypot(nodes[v].x - nodes[u].x, nodes[v].y - nodes[u].y);
      if (dist[u] + w >= dist[v]) continue;
      if (!clear(nodes[u].x, nodes[u].y, nodes[v].x, nodes[v].y)) continue;
      dist[v] = dist[u] + w; prev[v] = u;
    }
  }
  if (dist[1] === Infinity) return { x: goal.x, y: goal.y, remaining: direct, detour: false };
  let step = 1;
  while (prev[step] !== 0 && prev[step] !== -1) step = prev[step];
  return { x: nodes[step].x, y: nodes[step].y, remaining: dist[1], detour: step !== 1 };
};

/** 城の当たり箱に体が接しているか(着いた判定: 押し戻されて行き先の手前で止まっていても、城に接していれば着いた)。 */
export const junTouchesRect = (foot: { x: number; y: number }, r: PathRect, tol = 1.5): boolean => {
  const bx0 = foot.x - JUN_BODY_HALF_W, bx1 = foot.x + JUN_BODY_HALF_W, by0 = foot.y - JUN_BODY_H, by1 = foot.y;
  return bx1 >= r.x - tol && bx0 <= r.x + r.width + tol && by1 >= r.y - tol && by0 <= r.y + r.height + tol;
};
/** 城の足元に着いたとみなす距離(城に接している時)。 */
export const JUN_ARRIVE_TOUCH_DIST = 32;

// ---- 倒れる時の通信 -------------------------------------------------------------------------------------
/**
 * 倒れ始めの瞬間に通信の箱へ出す行(社長指示2026-10-20「通信でジュンが い、意識が… と言いながら倒れる」)。
 * 待ち行列に積まず、その場で差し替える(アテンション中は通信の時計が凍る=倒れる間ずっと出ていて、明けてから尺が張り直される)。
 * 待ち行列に残っていたジュンの行は捨てる(倒れた後に普段の台詞が出ないように)。
 */
export const junCollapseDialogue = <Q extends { name: string }>(
  gameTime: number, queue: readonly Q[], lineMs: number, slowExtraMs: number,
): { npcDialogue: { name: string; text: string; until: number; slow: true }; npcDialogueQueue: Q[] } => ({
  npcDialogue: { name: JUN_NAME, text: JUN_COLLAPSE_LINE, until: gameTime + lineMs + slowExtraMs, slow: true },
  npcDialogueQueue: queue.filter(l => l.name !== JUN_NAME),
});
