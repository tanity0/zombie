// ★ボスストップとプレイヤーの死の止め(research/HITSTOP.md §2-8・§3・§6・社長「プレイヤーやボス倒した時にも参考のヒットストップスローはいい感じに入れて」)。
// 桜井政博『大事なところはストップ!』の「止め→スローで等速へ戻す」を、既にある演出(アテンション・討伐のスロー・死亡の寄りとスロー)の
// 並びの直しで出す。新しい止めは足さない(ボス)。判定・ダメージには触れない純関数だけ(store と useGameLoop が読む)。

// ---- ボスを倒した一撃 ----

/** 撃破の一撃の瞬間、アテンションのカメラ(パン・寄り)が動き出すのを遅らせる長さ(ms・叩き台)。その間は画面もカメラも止まったまま。 */
export const BOSS_KILL_CAMERA_HOLD_MS = 250;
/** ボス級の撃破の白い閃光の濃さ(叩き台・旧 0.32)。 */
export const BOSS_KILL_FLASH_ALPHA = 0.55;
/** 討伐の一瞬のスロー(既存の値: 倍率・長さ・最も遅い所の保持)。 */
export const BOSS_KILL_SLOW = { scale: 0.35, ms: 520, holdMs: 90 } as const;

/**
 * 討伐のスローを、全体の止め(アテンションの時間停止)が明けた時に始まるよう張り直す長さ。
 * startKillFxCinematic と同じ型(スローの長さ=止め+戻り・保持=止めの長さ)。止めの後の形(保持 90ms→520ms で等速へ)は今のまま。
 * stopLeftMs=今から止めが明けるまで(0 以下なら今のスローのまま)。
 */
export const bossKillSlowAfterStop = (stopLeftMs: number): { scale: number; durationMs: number; holdMs: number } => {
  const s = Math.max(0, stopLeftMs);
  return { scale: BOSS_KILL_SLOW.scale, durationMs: s + BOSS_KILL_SLOW.ms, holdMs: s + BOSS_KILL_SLOW.holdMs };
};

/** 全体の止めを書く時、走っている止めを縮めない(長い方を採る)。 */
export const longerHitstopUntil = (prevUntil: number, nextUntil: number): number => Math.max(prevUntil, nextUntil);

// ---- プレイヤーが倒れた瞬間 ----

/** 致命の当たりの全体の止めの最短(ms・叩き台)。段の止め(70/120/190)より長い方を採る。継続ダメージで倒れた時も張る。 */
export const PLAYER_FATAL_STOP_MS = 240;

/**
 * 被弾の全体の止めが明ける時刻。今の規則(実ダメージ・HP>0 の時だけ・継続ダメージとレバーガードで受け切った時は張らない・長い方を採る)に、
 * 「とどめの一撃(被弾前 HP>0 → 被弾後 HP0)は PLAYER_FATAL_STOP_MS 以上」を足す。とどめは継続ダメージでも・レバーガードでも張る。
 * HP0 の後(死亡演出中)の被弾には張らない(今のまま)。
 */
export const playerHurtStopUntil = (
  prevUntil: number, now: number,
  o: { amount: number; prevHealth: number; newHealth: number; dot: boolean; leverGuardFull: boolean; tierStopMs: number },
): number => {
  if (!(o.amount > 0) || !(o.prevHealth > 0)) return prevUntil;
  const fatal = o.newHealth <= 0;
  let until = prevUntil;
  if (!o.dot && !o.leverGuardFull) until = Math.max(until, now + Math.max(0, o.tierStopMs));
  if (fatal) until = Math.max(until, now + PLAYER_FATAL_STOP_MS);
  return until;
};

/**
 * 死亡演出(寄り・スロー・結果画面への期限)を、致命の止めが明けてから数える長さ。stopLeftMs=今から止めが明けるまで。
 * 寄りとスローは「最も遅い・最も寄った所の保持」を止めの分だけ延ばし、止めの後の形は今のまま(削られない)。結果画面の期限も同じだけ後ろ。
 */
export const playerDeathTimeline = (
  stopLeftMs: number,
  base: { zoomMs: number; zoomHoldMs: number; slowMs: number; slowHoldMs: number; resultMs: number },
): { zoomMs: number; zoomHoldMs: number; slowMs: number; slowHoldMs: number; resultMs: number } => {
  const s = Math.max(0, stopLeftMs);
  return {
    zoomMs: base.zoomMs + s, zoomHoldMs: base.zoomHoldMs + s,
    slowMs: base.slowMs + s, slowHoldMs: base.slowHoldMs + s,
    resultMs: base.resultMs + s,
  };
};
