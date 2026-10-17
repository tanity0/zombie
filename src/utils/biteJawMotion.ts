// 噛みつき(上下顎)のモーション曲線。純関数=描画から切り離してテストできる形にする。
//
// ★社長指示v0.25.3468「噛みつきのモーション。ゆっくり閉じるのが変。ブルブル顎が震えて、一気にガツンと
//   噛んで、噛んだ時は反動で少し浮いてまた閉じる。こういう自然な動きもリサーチしてから組み込んで。」
//
// ● 現実の顎はどう動くか(観察の要点)
//   1. **捕食の直前、口は開いたまま止まっている。**大型捕食者は開口をキープして狙いを定め、筋の張力で
//      小刻みに震える(=溜め)。開き続けながらジワジワ閉じる動きは現実には無い。
//   2. **閉じは一瞬。**顎は加速しながら閉じ切る(等速で閉じない)。閉じ切る直前が一番速い。
//   3. **噛んだ瞬間に反動が出る。**歯が当たって運動エネルギーが跳ね返り、**わずかに開き直してから
//      減衰して閉じる**。同時に頭部そのものが衝撃で少し浮く(持ち上がる)。
//   アニメーションの言葉に直すと「アンティシペーション(溜め)→ 急加速のアクション → オーバーシュート
//   →ダンピング(減衰して収まる)」。旧実装は windup 全体をかけて `1 - u³` で閉じており、
//   **1のキープが無く・2が緩く・3が無い**ので「ゆっくり閉じる」に見えていた。
//
// ● 使い方: 呼び出し側(pixiScene)は
//     `const f = biteJawFrame(u, after)` → `open`(顎の開き 0=閉じ切り / 1=全開)と
//     `liftPx`(噛んだ反動で持ち上がる量)を使う。震え(ブルブル)は既存の windupTremorPx が担当。
//   **判定は一切変わらない**(絵だけ)。判定が出るのは従来どおり u=1 の瞬間。

/** 開いたまま止まって震えている割合(windupのこの割合までは全開でキープ)。 */
export const BITE_HOLD_FRAC = 0.86;
/** 噛む直前にさらに開く量(溜め=アンティシペーション)。 */
export const BITE_GAPE_OVERSHOOT = 1.08;
/** 「さらに開く」に使う、残り区間の割合(残りは閉じに使う=閉じは一瞬)。 */
export const BITE_GAPE_UP_FRAC = 0.35;
/** 噛んだ反動で開き直す量(全開に対する割合)。 */
export const BITE_REBOUND_OPEN = 0.22;
/** 反動の頂点(噛んだ後の区間に対する割合)。 */
export const BITE_REBOUND_PEAK_FRAC = 0.22;
/** 噛んだ衝撃で浮く量(px)。 */
export const BITE_LIFT_PX = 7;

export interface BiteJawFrame {
  /** 顎の開き。1=全開(素材の直径いっぱい)/0=閉じ切り。溜めで1をわずかに超える。 */
  open: number;
  /** 噛んだ衝撃で持ち上がる量(px・上方向。噛む前は0)。 */
  liftPx: number;
}

/**
 * @param u     溜め(windup)の進行 0→1。1で噛み切る(=ダメージの瞬間)。
 * @param after 噛み切った後の進行 0→1(BITE_SNAP_MS に対する割合)。u<1 の間は 0 を渡す。
 */
export const biteJawFrame = (u: number, after: number): BiteJawFrame => {
  const uu = Math.max(0, Math.min(1, u));
  const aa = Math.max(0, Math.min(1, after));

  if (uu < 1) {
    // ① 開いたままキープ(震えは呼び出し側)。
    if (uu < BITE_HOLD_FRAC) return { open: 1, liftPx: 0 };
    const t = (uu - BITE_HOLD_FRAC) / (1 - BITE_HOLD_FRAC); // 0→1(最後のわずかな区間)
    if (t < BITE_GAPE_UP_FRAC) {
      // ② 噛む直前に**さらに開く**(溜め)。減速しながら開き切る=ease-out。
      const p = t / BITE_GAPE_UP_FRAC;
      return { open: 1 + (BITE_GAPE_OVERSHOOT - 1) * (1 - (1 - p) * (1 - p)), liftPx: 0 };
    }
    // ③ 一気にガツン。加速しながら閉じる=ease-in(閉じ切る直前が一番速い)。
    const p = (t - BITE_GAPE_UP_FRAC) / (1 - BITE_GAPE_UP_FRAC);
    return { open: BITE_GAPE_OVERSHOOT * (1 - p * p * p), liftPx: 0 };
  }

  // ④ 噛んだ後: 反動で少し開き直し(速く)→ 減衰して閉じる(ゆっくり)。頭は衝撃で浮いて戻る。
  const openBack = aa < BITE_REBOUND_PEAK_FRAC
    ? BITE_REBOUND_OPEN * (aa / BITE_REBOUND_PEAK_FRAC)                      // 弾かれて開く(速い)
    : BITE_REBOUND_OPEN * Math.pow(1 - (aa - BITE_REBOUND_PEAK_FRAC) / (1 - BITE_REBOUND_PEAK_FRAC), 2); // 減衰して閉じる
  const lift = BITE_LIFT_PX * (1 - aa) * Math.max(0, 1 - aa / 0.6);
  return { open: openBack, liftPx: lift };
};
