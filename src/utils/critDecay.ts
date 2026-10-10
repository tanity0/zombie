// ★銃クリティカルの減衰(社長裁定2026-08-26・PACING_PUZZLE.md §13-3e)。
//
// 社長の言葉:
//   「クリティカル率にも減衰効果を持たせるのは? 初手の手触りは良くしておいて、撃ち続けると減る。」
//   「命中ベースの方がいいね ただ下限が1秒は早すぎるので、少し調整したい」(→0.5秒窓の刻み上限で採用)
//   「敵全体にも入れたくて、武器を切り替えると戻る。(スイッチの有用性)」「ちなみに、敵毎にだよね?」
//
// 仕様(確定):
//   - **命中ベース+時間の上限**: 同じ相手への命中が続く間、「命中があった0.5秒窓ごとに−1%」
//     (1つの窓で何発当てても−1%まで=どんな連射銃でも減衰は最速−2%/秒)。
//   - 最大−10%。下限1%(ただし元のクリ率が1%未満の武器はそのまま=下限で「上がる」ことはない)。
//   - **敵個体ごと**に記憶。相手を変えればフル。
//   - **武器を切り替えると戻る**(スイッチの有用性)。同じ敵でも武器キーが変われば減衰0から。
//   - 回復: 当てていない間+1%/0.5秒(遅延計算=次の命中時にまとめて戻す)。
//     ⇒ 発射間隔が0.5秒以上の銃(マグナム/スナイパー/ポンプ式等)は回復が追いつき**実質減衰しない**
//       =単発高クリの性格は保たれる。減るのは手数銃(ハンドガン系/オートショット)だけ。
//   - 対象: プレイヤーの直接武器の銃(isDirectGunWeaponKey)と、幻影の銃(SAME_ARENA対称)。
//     近接・サブウェポン・味方系(escort/ghost-gun/タレット)は対象外。
//   - 時計: gameTime(ポーズ中に回復しない)。
//
// 純関数+モジュール台帳(レンダラ非依存・ヘッドレステスト可)。台帳は resetCritDecay() で全消去
// (resetGame から呼ぶ)。上限件数FIFO(ENEMY_REMOVE_CAUSEと同じ作法)。

export const CRIT_DECAY_STEP = 0.01;      // 1窓ごとの減衰
export const CRIT_DECAY_WINDOW_MS = 500;  // 窓の長さ(=減衰の時間上限・回復の刻み)
export const CRIT_DECAY_MAX = 0.10;       // 最大減衰
export const CRIT_DECAY_FLOOR = 0.01;     // 減衰後の下限(元がこれ未満ならそのまま)

export interface CritDecayState {
  decay: number;        // 現在の減衰量(0〜CRIT_DECAY_MAX)
  windowStart: number;  // 現在の窓の開始(gameTime ms)
  lastHitAt: number;    // 最後の命中(gameTime ms)
  weaponKey: string;    // この減衰を積んだ武器(変わったらリセット=スイッチの有用性)
}

const ledger = new Map<string, CritDecayState>();
const LEDGER_CAP = 300;

export const resetCritDecay = (): void => { ledger.clear(); };

/** テスト/デバッグ用: 現在の減衰量を覗く(無ければ0)。 */
export const peekCritDecay = (key: string): number => ledger.get(key)?.decay ?? 0;

/**
 * 命中1回ぶんの処理: ①この命中に適用するクリ率(減衰込み)を返し、②台帳を進める。
 * 適用は「更新前」の減衰(=初手は必ずフル)。
 * @param key 攻撃者×敵個体のキー(例: `p:${enemyId}` / `phantom:${phantomId}`)
 * @param chance 減衰前の実効クリ率(ソフトキャップ・敵補正まで済んだ値)
 */
export const critDecayOnHit = (
  key: string, weaponKey: string, nowMs: number, chance: number,
): number => {
  let s = ledger.get(key);
  if (s === undefined || s.weaponKey !== weaponKey) {
    // 初手 or 武器切り替え=フルから(この命中には減衰なし)。
    if (s === undefined && ledger.size >= LEDGER_CAP) {
      const k = ledger.keys().next().value;
      if (k !== undefined) ledger.delete(k);
    }
    ledger.set(key, { decay: 0, windowStart: nowMs, lastHitAt: nowMs, weaponKey });
    return chance;
  }
  const gap = nowMs - s.lastHitAt;
  if (gap >= CRIT_DECAY_WINDOW_MS) {
    // 撃っていなかった時間ぶん回復(+1%/0.5秒)。窓も仕切り直す。
    const recovered = Math.floor(gap / CRIT_DECAY_WINDOW_MS) * CRIT_DECAY_STEP;
    s = { ...s, decay: Math.max(0, s.decay - recovered), windowStart: nowMs, lastHitAt: nowMs };
  } else {
    // 連射の継続中: 窓を跨いだ命中でだけ−1%(同じ窓の中の連打は積まない)。
    const bumped = nowMs - s.windowStart >= CRIT_DECAY_WINDOW_MS;
    s = {
      ...s,
      decay: bumped ? Math.min(CRIT_DECAY_MAX, s.decay + CRIT_DECAY_STEP) : s.decay,
      windowStart: bumped ? nowMs : s.windowStart,
      lastHitAt: nowMs,
    };
  }
  ledger.set(key, s);
  // 適用は更新後の値ではなく…ではない: 窓を跨いだ瞬間の命中から新しい減衰が効く(上のbumped込み)。
  // 下限: 元のクリ率が下限未満(PHILL=0%等)なら触らない=減衰で「上がる」ことはない。
  if (chance <= CRIT_DECAY_FLOOR) return chance;
  return Math.max(CRIT_DECAY_FLOOR, chance - s.decay);
};
