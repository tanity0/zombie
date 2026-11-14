// ★UI の時計を「描画の周期」にも乗せる(コード監査2026-10-23 UI B-2 / SIM S-3・社長承認)。
//
// なぜ要るか: 重い時、ブラウザは `setTimeout` を後回しにする(描画=rAF と入力を先に回す)。
// UI の送り(死亡→結果画面・レベルアップの窓・銘打ちの送り・帯やカットインの消し)がタイマーだけで動いていると、
// **描画は回っているのに UI だけが止まる**(社長実機「死んでも終わらない」「通信の文字送りが止まる」)。
//
// やり方: 期限を実時間(performance.now)で持ち、**rAF の毎フレームで期限を見る**+保険としてタイマーも張る。
// 先に来た方が1回だけ発火する(もう片方は取り消す)。尺はタイマーと同じ=見え方は変わらない。
// タブが裏に回って rAF が止まっている間はタイマー側が拾う(従来どおり)。

export interface RafTimeoutEnv {
  now: () => number;
  raf: (cb: () => void) => number;
  caf: (id: number) => void;
  setT: (cb: () => void, ms: number) => number;
  clearT: (id: number) => void;
}

const browserEnv = (): RafTimeoutEnv => ({
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  raf: cb => (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(() => cb()) : 0),
  caf: id => { if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(id); },
  setT: (cb, ms) => window.setTimeout(cb, ms),
  clearT: id => window.clearTimeout(id),
});

/** 期限に達したか(純関数)。 */
export const rafDeadlineReached = (nowMs: number, dueMs: number): boolean => nowMs >= dueMs;

/**
 * `setTimeout(fn, delayMs)` の置き換え。rAF とタイマーの早い方で1回だけ `fn` を呼ぶ。
 * 返り値は取り消し関数(`clearTimeout` の代わり)。
 */
export const rafTimeout = (fn: () => void, delayMs: number, env: RafTimeoutEnv = browserEnv()): (() => void) => {
  const due = env.now() + Math.max(0, delayMs);
  let done = false;
  let rafId = 0;
  let timerId = 0;
  const fire = () => {
    if (done) return;
    done = true;
    env.caf(rafId);
    env.clearT(timerId);
    fn();
  };
  const tick = () => {
    if (done) return;
    if (rafDeadlineReached(env.now(), due)) { fire(); return; }
    rafId = env.raf(tick);
  };
  rafId = env.raf(tick);
  timerId = env.setT(fire, Math.max(0, delayMs));
  return () => {
    if (done) return;
    done = true;
    env.caf(rafId);
    env.clearT(timerId);
  };
};
