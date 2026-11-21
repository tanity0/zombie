// ★弾を撃つ絵(花が閉じる→撃つ→開く)の**尺の正本**(社長支給2026-09-21
// 「プラントの弾攻撃(**蕾になるのを早く流して、閉じたら弾が発射するイメージ**)」)。
//
// PixiJS非依存の純関数=ヘッドレスでテストできる(CLAUDE.md 実装精度の規律4)。
// **視覚と発射時刻の出どころを1本にする**ため、閉じる尺(`PLANT_CLOSE_MS`)は
// 描画(`pixiScene`)と発射(`combatTick`)の**両方がここから引く**。
//
// ★**発射の拍は今までと1msも変えていない**。従来は「前の発射から interval 経ったら即撃つ」
// だったのを、「**interval − 閉じる尺** で閉じ始め、**interval ちょうどで撃つ**」に置き換えた。
// ⇒ 弾が出る時刻は従来と同じ。**閉じ切った瞬間に弾が出る**という見え方だけが増える。
// (唯一の差: 射程外から入ってきて即撃てる状態の時は、閉じる尺ぶん遅れて撃つ。
//  これは「赤が無いのに当たる」を作らないための、望ましい側のズレ。)

/**
 * 蕾になるまでの尺(ms)。**叩き台**——社長の言葉は「**早く流して**」。
 * `?plantclose=` で実機から触れる(`pixiScene` 側でツマミを噛ませてある)。
 */
export const PLANT_CLOSE_MS = 260;
/** 撃った後、花が開き直る尺(ms)。閉じるより**ゆっくり**戻す(慣性MUST: 加減速のない動きは禁止)。 */
export const PLANT_OPEN_MS = 460;

/**
 * ★**閉じ切った蕾のまま待つ尺**(ms)。弾はこの**後ろ端**で出る。
 * 60fpsで5コマぶん=「閉じた」と読める最小限。`?plantbud=` で触れる。
 */
export const PLANT_BUD_HOLD_MS = 90;

/** 加速しながら閉じる(ease-in)=「早く流す」の実体。終端で一番速い。 */
const easeInClose = (t: number): number => t * t;
/** 減速しながら開く(ease-out)。開き切る所でふわりと止まる。 */
const easeOutOpen = (t: number): number => 1 - (1 - t) * (1 - t);

/**
 * 花のコマ番号を返す。`null` = 立ち絵のまま(開いたまま待っている)。
 *
 * ★**時計は1本だけ**(`shotWindupAt` からの経過ms)。閉じ→撃つ→開く を1本の位相で描く。
 * 2本にすると「撃った時刻」と「閉じ始めた時刻」の継ぎ目でコマが跳ねる。
 *
 * @param frames       シートのコマ数(0=開いた花 … frames-1=閉じた蕾)
 * @param sinceCloseMs 閉じ始めてからの経過ms(閉じ始めていなければ `null`)
 * @param closeMs      閉じる尺(この終わりで弾が出る)
 * @param openMs       開き直す尺
 *
 * ★**閉じ切るコマ(frames-1)は、弾が出る瞬間にちょうど終わる**
 * (赤い予告の掟③「消え切る時刻 = 当たる時刻」と同じ考え方を、弾の発射に当てたもの)。
 */
export const plantShotFrame = (
  frames: number,
  sinceCloseMs: number | null,
  closeMs: number = PLANT_CLOSE_MS,
  openMs: number = PLANT_OPEN_MS,
  budHoldMs: number = PLANT_BUD_HOLD_MS,
): number | null => {
  if (frames <= 1 || sinceCloseMs === null || sinceCloseMs < 0) return null;
  const last = frames - 1;
  // ①閉じている間。撃つ瞬間(sinceClose === closeMs)にちょうど最後のコマを抜ける。
  if (closeMs > 0 && sinceCloseMs < closeMs) {
    // ★**蕾で一拍持たせる**。加速だけで閉じ切ると、蕾のコマが実測 **17ms(60fpsで1コマ)**しか
    // 出ず、「**閉じたら発射**」の肝心の絵が見えない。閉じ際は速く、**閉じ切った所で溜める**。
    const hold = Math.min(budHoldMs, closeMs * 0.5);
    const shut = closeMs - hold;                       // ここまでで閉じ切る
    if (sinceCloseMs >= shut) return last;             // 蕾のまま、弾が出るのを待つ
    return Math.min(last, Math.max(0, Math.floor(easeInClose(sinceCloseMs / shut) * frames)));
  }
  // ②撃った後、開き直る間。閉じ切った姿から開いた姿へ戻る。
  const openT = sinceCloseMs - closeMs;
  if (openMs > 0 && openT < openMs) {
    return Math.min(last, Math.max(0, Math.round(last * (1 - easeOutOpen(openT / openMs)))));
  }
  return null;   // 開いたまま=立ち絵
};

/**
 * ★**閉じ直しの猶予**。閉じ始めてからこれ以上経っていたら、その溜めは**古い**とみなして
 * 閉じ直す。射程外へ出て戻ってきた時に「閉じる絵を出さずにいきなり撃つ」のを防ぐための網。
 */
export const PLANT_CLOSE_GRACE_MS = 200;

export const plantCloseStartAt = (lastShotMs: number, intervalMs: number, closeMs: number = PLANT_CLOSE_MS): number =>
  lastShotMs + Math.max(0, intervalMs - closeMs);

/**
 * ★この型は「閉じてから撃つ」か。今はプラントだけ。
 * 絵(`ENEMY_SHOT_SHEETS`)ではなく**型**で見る——絵が無い状態で溜めだけ入ると、
 * 「何も起きていないのに撃つのが遅れる」という**見えない弱体化**になるため。
 */
export const usesShotWindup = (type: string): boolean => type === 'plant';

