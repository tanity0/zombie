// BOT_AND_GHOST.md §2.18「追補: 抜けカードの裁定」(社長裁定2026-07-31)。
// バッチGHOST-CMD-2A: **隙コマンド**(気絶/技後硬直/カウンター成立直後に「詰めて叩く」か「撃つ」か)の
// **共通部品**。計測(playerTraits.ts)と消費(ghostDriver.ts)が**同じ関数**で窓を判定する
// (bossStyleSlotKeyと同じ流儀=ズレ防止。片方だけ判定を書き換えると記録と再生が食い違うため)。
//
// 掟(発注仕様§5):
// - **気絶/硬直の判定を発明しない**。stun は既存の気絶述語の式そのまま
//   (weaponUtils.pickTargetのisStunned / meleeExecute.resolveStunnedMeleeHitの成立条件と同じ:
//   `stunUntil !== undefined && gameTime < stunUntil`)。**完全気絶(紫)も同じ式で入る**——
//   gameStore の紫発火が `{ bossFullStunUntil: until, stunUntil: until }` を同時に打つため
//   (gameStore.ts の bossCrit ブロック)、専用の追加判定は要らない。
// - recover は既存の**語尾流儀**(bossScript.isBossCounterableNowApproxと同じ出どころ):
//   aiPhase/bossState の語尾 `-recover`(giantの`g-*-recover`・裏ボス/天使のrecover系)+
//   旧来の素の `aiPhase === 'recover'`。
// - afterCounter だけは新しい時計を1つ置く(発注仕様§1の叩き台=成立から1200ms・export定数)。
//   プレイヤー側の錨点=player.lastCounterSuccessTime / ゴースト側=Summon.ghostLastCounterAt
//   (どちらも Date.now 基準)。
//
// 純関数のみ(store/React/PixiJS非依存)=ヘッドレスでテスト可能。
import type { Enemy } from '../types/game';
import type { MicroBin3Dist } from './microRhythm'; // research/AI_HUMANIZE.md B3(§4⑦の保存形)

/** 隙(punish window)の文脈。3つで1機構(§2.18追補「1つの機構で計測・再生」)。 */
export type PunishContext = 'stun' | 'recover' | 'afterCounter';

/**
 * 文脈の**優先順**(消費側で複数の窓が同時に開いた時に、どの袋のモードで動くかの決定順)。
 * 計測側は文脈ごとに独立して票を入れる(=この順は使わない)。
 */
export const PUNISH_CONTEXTS: readonly PunishContext[] = ['stun', 'recover', 'afterCounter'];

/** モード。'rush'=詰めて叩く / 'shoot'=撃つ(従来の間合い管理のまま)。 */
export type PunishMode = 'rush' | 'shoot';

/**
 * 記録が無い(n=0/欠損)時のデフォルト=**詰めて叩く**(社長裁定「そのベストは数値がなければ
 * いいと思うんだけど、数値があるのに決めつけて動かすのはやめたい」)。数値が付いた瞬間から記録が勝つ。
 */
export const PUNISH_DEFAULT_MODE: PunishMode = 'rush';

/** カウンター成立直後の追撃窓の長さ(ms・叩き台=発注仕様§1)。 */
export const PUNISH_AFTER_COUNTER_MS = 1200;

// ---- 窓の判定(計測・消費で共有) ----------------------------------------------------------------

/** 気絶中か(既存の気絶述語の式そのまま。完全気絶(紫)は stunUntil も同時に打たれるので同式で入る)。 */
export const isBossStunnedNow = (e: Pick<Enemy, 'stunUntil'>, gameTime: number): boolean =>
  e.stunUntil !== undefined && gameTime < e.stunUntil;

/** 技後硬直中か(既存の語尾流儀=isBossCounterableNowApproxのrecover側だけを取り出したもの)。 */
export const isBossRecoverNowApprox = (
  aiPhase: string | undefined,
  bossState: string | undefined,
): boolean => {
  const ph = aiPhase ?? '';
  const bs = bossState ?? '';
  return ph.endsWith('-recover') || bs.endsWith('-recover') || ph === 'recover';
};

/** カウンター成立直後の追撃窓の中か(打刻はDate.now基準)。未成立(0/undefined)は常にfalse。 */
export const isAfterCounterWindow = (lastCounterAtMs: number | undefined, nowMs: number): boolean => {
  if (lastCounterAtMs === undefined || lastCounterAtMs <= 0) return false;
  const since = nowMs - lastCounterAtMs;
  return since >= 0 && since < PUNISH_AFTER_COUNTER_MS;
};

/** 3文脈の窓が開いているか(全部まとめて1回で)。boss=null(交戦相手なし)はstun/recoverが閉じる。 */
export type PunishOpenFlags = Record<PunishContext, boolean>;

export const punishWindowsOpen = (
  boss: Pick<Enemy, 'stunUntil' | 'aiPhase' | 'bossState'> | null,
  gameTime: number,
  lastCounterAtMs: number | undefined,
  nowMs: number,
): PunishOpenFlags => ({
  stun: boss !== null && isBossStunnedNow(boss, gameTime),
  recover: boss !== null && isBossRecoverNowApprox(boss.aiPhase, boss.bossState),
  afterCounter: isAfterCounterWindow(lastCounterAtMs, nowMs),
});

/** 消費側: いま従うべき文脈(PUNISH_CONTEXTSの順で最初に開いているもの)。無ければnull。 */
export const activePunishContext = (open: PunishOpenFlags): PunishContext | null =>
  PUNISH_CONTEXTS.find(c => open[c]) ?? null;

// ---- 計測(1エピソード1票の状態機械) ------------------------------------------------------------

/** 文脈ごとの票(rush=窓中に近接ダメージが出た / shoot=出なかった)。 */
export type PunishTally = Record<PunishContext, { rush: number; shoot: number }>;

/** 進行中の窓(文脈ごと)。meleeAtOpen=窓が開いた瞬間の近接与ダメ累計(区間差分の起点)。 */
export interface PunishEpisodeState {
  open: Record<PunishContext, boolean>;
  meleeAtOpen: Record<PunishContext, number>;
}

export const createPunishTally = (): PunishTally => ({
  stun: { rush: 0, shoot: 0 },
  recover: { rush: 0, shoot: 0 },
  afterCounter: { rush: 0, shoot: 0 },
});

export const createPunishEpisodeState = (): PunishEpisodeState => ({
  open: { stun: false, recover: false, afterCounter: false },
  meleeAtOpen: { stun: 0, recover: 0, afterCounter: 0 },
});

/**
 * 毎tick1回。窓の開閉をエッジ検知し、**閉じた瞬間に1票**入れる(1エピソード1票)。
 * 票の決め方=**窓中の近接与ダメージ(botTelemetry.damageDealt.melee)の区間差分 > 0** なら 'rush'、
 * 0 なら 'shoot'(発注仕様§2。新しいnotify配線を作らない=毎tick取れるスカラーの差分で見る)。
 * meleeTotal は呼び出し側が渡す累計値(スカラー=コピー。生きた参照は持たない=実装精度の規律3)。
 */
export const stepPunishEpisodes = (
  st: PunishEpisodeState,
  tally: PunishTally,
  open: PunishOpenFlags,
  meleeTotal: number,
): void => {
  for (const ctx of PUNISH_CONTEXTS) {
    const was = st.open[ctx];
    const now = open[ctx];
    if (now && !was) {
      st.open[ctx] = true;
      st.meleeAtOpen[ctx] = meleeTotal;
    } else if (!now && was) {
      st.open[ctx] = false;
      const delta = meleeTotal - st.meleeAtOpen[ctx];
      if (delta > 0) tally[ctx].rush += 1;
      else tally[ctx].shoot += 1;
    }
  }
};

/**
 * セッション確定時: まだ開いている窓を全て畳んで票にする(moveReaction.endMoveReactionsが
 * 開いているエピソードを畳むのと同じ流儀=区間の途中で交戦が切れても観測を捨てない)。
 */
export const closePunishEpisodes = (
  st: PunishEpisodeState,
  tally: PunishTally,
  meleeTotal: number,
): void => {
  stepPunishEpisodes(st, tally, { stun: false, recover: false, afterCounter: false }, meleeTotal);
};

// ---- プロファイル側(保存形とEMA混合) ------------------------------------------------------------

/** 文脈ごとの保存形。n=票の累計 / rushRate='rush'票の割合(残り=shoot)。 */
export interface PunishStat { n: number; rushRate: number }

/** 疎な辞書(観測した文脈だけ入る)。旧プロファイルには無い=欠損可。 */
export type PunishProfile = Partial<Record<PunishContext, PunishStat>>;

/**
 * セッション集計をEMA(α)でプロファイルへ混ぜる(**dodgeDir(blendDodgeDirStat)と同じ数式**を
 * 文脈ごとに適用: 初記録=サンプルそのまま・2回目以降はEMA・nは累計)。
 * 票が1つも無い文脈は前回値を維持する。全文脈が0票なら prev をそのまま返す(欠損なら欠損のまま)。
 */
export const blendPunishProfile = (
  prev: PunishProfile | undefined,
  tally: PunishTally,
  alpha: number,
): PunishProfile | undefined => {
  let next: PunishProfile | undefined;
  for (const ctx of PUNISH_CONTEXTS) {
    const n = tally[ctx].rush + tally[ctx].shoot;
    if (n <= 0) continue;
    const sample = tally[ctx].rush / n;
    const before = prev?.[ctx];
    const merged: PunishStat = (!before || before.n <= 0)
      ? { n, rushRate: sample }
      : { n: before.n + n, rushRate: before.rushRate * (1 - alpha) + sample * alpha };
    next = { ...(next ?? prev ?? {}), [ctx]: merged };
  }
  return next ?? prev;
};

/** 消費側: その文脈の記録(欠損=undefined=デフォルトへ)を {n, rate} 形へ。 */
export const punishModeStat = (
  punish: PunishProfile | undefined,
  ctx: PunishContext,
): { n: number; rate: number } | undefined => {
  const s = punish?.[ctx];
  return s === undefined ? undefined : { n: s.n, rate: s.rushRate };
};

// =================================================================================================
// research/AI_HUMANIZE.md B3(§4⑦「硬直パニッシュの速さ」)。**この枠内で**録る=recover窓の定義
// (isBossRecoverNowApprox・上と共通)も、窓の開閉判定(stepPunishEpisodes)も新規に発明しない。
// 追加するのは「recover窓が開いてから最初の振り(swungThisTick)までのms」を3ビンへ積むだけの
// 解像度上げ(既存のstun/afterCounter文脈には掛けない=発注仕様どおりrecoverのみ)。
// =================================================================================================
/** 3ビンの叩き台しきい値(§4⑦「即/普通/様子見」)。★検収是正(中5・事実に反するコメントの訂正):
 * これは**値の複製**である(punishWindow.tsの外=microRhythmReplay.tsのサンプリング側
 * PUNISH_FAST_MS/PUNISH_NORMAL_MSと同じ150/500msを、循環import回避のため別ファイルに独立定義して
 * いる)。「複製ではない」は誤り——ズレると録り(このファイルの3ビン境界)と写し(サンプリング側の
 * 値の範囲)の境界が食い違う。値の一致はmicroRhythmReplay.test.tsの一致テストで機械検査する。 */
export const PUNISH_SPEED_FAST_MS = 150;   // 叩き台
export const PUNISH_SPEED_NORMAL_MS = 500; // 叩き台

/** 計測中の状態(recover窓の開き時刻+初振り検知)。セッション単位でplayerTraits.Sessionが1個持つ。 */
export interface PunishSpeedState {
  open: boolean;
  openAt: number;
  swung: boolean;
}
export const createPunishSpeedState = (): PunishSpeedState => ({ open: false, openAt: 0, swung: false });

/** 集計(recoverだけの3ビン)。 */
export interface PunishSpeedTally { n: number; fast: number; normal: number; slow: number }
export const createPunishSpeedTally = (): PunishSpeedTally => ({ n: 0, fast: 0, normal: 0, slow: 0 });

/**
 * 毎tick1回。recover窓のエッジ(punishWindowsOpenの'recover'フラグ)を検知し、開いている間に
 * 最初の振り(swungThisTick)が来た時点で「開き→振り」の遅れmsを1ビンへ積む。窓が閉じるまで
 * 一度も振らなかった回は数えない(=硬直中に何もしなかった=このノブの対象外。仕様どおり)。
 */
export const stepPunishSpeed = (
  st: PunishSpeedState, tally: PunishSpeedTally, recoverOpen: boolean, swungThisTick: boolean, gameTime: number,
): void => {
  if (recoverOpen && !st.open) { st.open = true; st.openAt = gameTime; st.swung = false; }
  else if (!recoverOpen && st.open) { st.open = false; st.swung = false; }
  if (st.open && swungThisTick && !st.swung) {
    st.swung = true;
    const lag = gameTime - st.openAt;
    tally.n += 1;
    if (lag < PUNISH_SPEED_FAST_MS) tally.fast += 1;
    else if (lag < PUNISH_SPEED_NORMAL_MS) tally.normal += 1;
    else tally.slow += 1;
  }
};

/** セッション確定時: プロファイルへ焼く形(MicroBin3Dist)へ。0件はundefined(前回値を保つ)。 */
export const foldPunishSpeed = (tally: PunishSpeedTally): MicroBin3Dist | undefined =>
  tally.n > 0 ? { n: tally.n, rate0: tally.fast / tally.n, rate1: tally.normal / tally.n } : undefined;
