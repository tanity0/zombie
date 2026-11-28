// 本編の徘徊の孫悟空(拳鬼=guardian-phantom / phantomUnique 'brawler')の「2分で跳んで帰る」。判定と絵の曲線だけの純関数(store/PixiJS 非依存)。
//
// 社長の言葉: 「孫悟空も2分で帰るようにして」「戦闘開始から2分後もジャンプして帰る」。
// - 数え始め=出会った瞬間(名乗り=useGameLoop の kenkiPatrolStep 'intro')。gameTime で数える=ポーズ中は進まない。
// - 交戦中でも帰る。ただし技の最中(殴っている途中)は、その技が終わってから跳ぶ。
// - 撃破扱いにしない(報酬・体得なし)。その出撃では二度と出ない(新しい出撃=「もう一度」ではまた出られる)。
// - 強制出現(?brawlerphantomnow=1・対策室)は名乗りを通らない=数え始めが無い=帰らない。
// 跳び去り: その場で沈み込む(溜め) → 踏み切って上へ跳ぶ → 拡大しながら透けて空へ消える(城ボスの飛び去りと同じ「大きくなる=空へ上がった」の読み)。

/** 名乗りから帰るまで(gameTime・ms)。確認用に ?kenkileave=<秒> で短縮できる(呼び手)。 */
export const KENKI_LEAVE_AFTER_MS = 120_000;
/** 沈み込み(溜め)の長さ(ms)。 */
export const KENKI_LEAVE_CROUCH_MS = 380;
/** 踏み切りから消え切るまで(ms)。 */
export const KENKI_LEAVE_RISE_MS = 760;
/** 跳び去り全体の長さ(ms)。これが過ぎたら enemies から外す。 */
export const KENKI_LEAVE_TOTAL_MS = KENKI_LEAVE_CROUCH_MS + KENKI_LEAVE_RISE_MS;
/** 上へ跳ぶ高さ(px・絵だけ)。大きく見せる(CLAUDE.md「動きは大きく」)。 */
export const KENKI_LEAVE_LIFT_PX = 260;
/** 消える時の拡大(=カメラに近づく=空へ上がった)。 */
export const KENKI_LEAVE_ZOOM_MAX = 1.9;
/** 沈み込みの最後に下がる量(px・位置の移動だけ=歪みではない)。 */
export const KENKI_LEAVE_SINK_PX = 5;
/** 溜めの震え(px)。 */
export const KENKI_LEAVE_SHAKE_PX = 1.4;

export type KenkiLeaveStep = 'none' | 'start' | 'leaving' | 'gone';

/**
 * 毎フレームの判定。
 * - metAt: 名乗った時刻(gameTime)。未定義=まだ会っていない/強制出現=数えない。
 * - leaveAt: 跳び去りを始めた時刻(gameTime)。未定義=まだ。
 * - busy: 技の最中(段・技・踏み込み・跳びかかり・予備動作・固まり)。true の間は始めない(終わってから跳ぶ)。
 */
export const kenkiLeaveStep = (i: { metAt: number | undefined; leaveAt: number | undefined; now: number; afterMs: number; busy: boolean }): KenkiLeaveStep => {
  if (i.leaveAt !== undefined) return i.now - i.leaveAt >= KENKI_LEAVE_TOTAL_MS ? 'gone' : 'leaving';
  if (i.metAt === undefined || !Number.isFinite(i.metAt)) return 'none';
  if (i.now - i.metAt < Math.max(0, i.afterMs)) return 'none';
  return i.busy ? 'none' : 'start';
};

/** ?kenkileave=<秒> の値を ms に(不正・負は既定)。 */
export const kenkiLeaveAfterMs = (sec: number | null | undefined): number =>
  sec !== null && sec !== undefined && Number.isFinite(sec) && sec >= 0 ? sec * 1000 : KENKI_LEAVE_AFTER_MS;

export interface KenkiLeavePose {
  phase: 'crouch' | 'rise';
  /** 0..1 の進み(その相の中)。 */
  k: number;
  /** 上への持ち上げ(px・正=上)。沈み込みの間は負(少し下がる)。 */
  liftPx: number;
  /** 震えの強さ(px)。 */
  shakePx: number;
  /** 絵の拡大。 */
  zoom: number;
  /** 絵の濃さ(0..1)。 */
  alpha: number;
}

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/** 跳び去りを始めてからの経過(ms)→絵の形。慣性: 沈み込みは加速して沈み、踏み切りで最速、上空で減速しつつ消える。 */
export const kenkiLeavePose = (elapsedMs: number): KenkiLeavePose => {
  const t = Math.max(0, elapsedMs);
  if (t < KENKI_LEAVE_CROUCH_MS) {
    const k = t / KENKI_LEAVE_CROUCH_MS;
    return { phase: 'crouch', k, liftPx: -KENKI_LEAVE_SINK_PX * k * k, shakePx: KENKI_LEAVE_SHAKE_PX * (0.4 + 0.6 * k), zoom: 1, alpha: 1 };
  }
  const k = clamp01((t - KENKI_LEAVE_CROUCH_MS) / KENKI_LEAVE_RISE_MS);
  const up = 1 - Math.pow(1 - k, 3);             // 踏み切りが一番速く、上空で減速
  const zk = k * k * (3 - 2 * k);                  // 拡大は踏み切り直後はゆっくり→中ほどで伸びる→消え際で緩む
  const fade = clamp01((k - 0.25) / 0.75);         // 跳び上がってから透け始める
  return {
    phase: 'rise', k,
    liftPx: -KENKI_LEAVE_SINK_PX * (1 - up) + KENKI_LEAVE_LIFT_PX * up,
    shakePx: 0,
    zoom: 1 + (KENKI_LEAVE_ZOOM_MAX - 1) * zk,
    alpha: 1 - fade * fade * (3 - 2 * fade),
  };
};

// ---- 汎用の幻影(guardian-phantom・phantomUnique なし)も同じ「2分で跳んで帰る」(社長指示2026-11-28「幻影も制限時間ある方がいいかも」) ----
// 仕組みは孫悟空と共有する(Enemy の kenkiMetAt / kenkiLeaveAt・判定 kenkiLeaveStep・絵 kenkiLeavePose)。名前が孫悟空専用に読めるので汎用名の別名を置く。
/** 幻影(孫悟空・汎用の幻影)の跳び去りの判定(= kenkiLeaveStep)。 */
export const phantomLeaveStep = kenkiLeaveStep;
/** 幻影(孫悟空・汎用の幻影)の跳び去りの絵の形(= kenkiLeavePose)。 */
export const phantomLeavePose = kenkiLeavePose;
/** 幻影が出会ってから帰るまで(= KENKI_LEAVE_AFTER_MS)。 */
export const PHANTOM_LEAVE_AFTER_MS = KENKI_LEAVE_AFTER_MS;

/**
 * 汎用の幻影の「出会った瞬間」(2分の数え始め)か。
 * - 名乗りのアテンション(出現の約1秒後にカメラが寄る)が控えている間は数え始めない=アテンションが出てから数える。
 * - アテンションが控えていない(出た・無かった)なら、姿が画面に入っている最初のフレームで数え始める。
 * - 練習ラン(変異体対策室)は帰らない=数え始めない。もう数えている/跳び去り中も false。
 */
export const genericPhantomMeetNow = (i: {
  practice: boolean; metAt: number | undefined; leaveAt: number | undefined; attentionPending: boolean; onScreen: boolean;
}): boolean =>
  !i.practice && i.metAt === undefined && i.leaveAt === undefined && !i.attentionPending && i.onScreen;

/** 跳び去りの間の体のコマ(既存の格闘の2コマ): 沈み込み=しゃがみ(-ready)/跳び上がり=振り上げ(-swing)。 */
export const phantomLeaveTex = (elapsedMs: number): 'ready' | 'swing' =>
  kenkiLeavePose(elapsedMs).phase === 'crouch' ? 'ready' : 'swing';
