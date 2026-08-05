// ボスの「予告(windup)の長さ」と「硬直(recover)の長さ」を、**プレイヤー側の実測値から機械的に
// 導く**ための物差し(純関数のみ・レンダラ/store非依存)。
//
// 背景(v0.25.2609 ボス動き横断監査): 本作には**無敵付きの汎用回避(ローリング)が存在しない**。
// 汎用の防御動詞は次の2つだけで、ここが全てのボス設計の基準系になる:
//   ① 歩いて避ける = PLAYER_BASE_SPEED(87) × GAME_SPEED(1.2) = **104.4 px/s**
//   ② カウンター    = 窓 COUNTER_WINDOW(400ms) + CD COUNTER_COOLDOWN(420ms) = **1サイクル 820ms**
// エルデンリング資料(research/ELDEN_RING_BOSS_PATTERNS.md §1-6)の基準系「ロール無敵0.42〜0.45秒」は
// 本作に存在しないため、ERの秒数をそのまま写すと理不尽になる。この2つへ換算してから写す。
//
// 値の複製について: PLAYER_BASE_SPEED / GAME_SPEED / COUNTER_* は gameStore.ts / config にあるが、
// ここは**純関数レイヤ(store非依存)**なので import せず値を複製する(moveReaction.ts の
// MELEE_RADIUS_MIRROR / GIANT_STOMP_RADIUS_MIRROR と同じ確立済みの作法)。値がズレないことは
// bossTelegraph.test.ts が実体を import して機械的に検証する。

/** プレイヤーの実効歩行速度(px/s)。= PLAYER_BASE_SPEED(87) × GAME_SPEED(1.2)。 */
export const PLAYER_WALK_PX_PER_SEC = 104.4;

/** プレイヤーの近接/カウンター1サイクル(ms)。= COUNTER_WINDOW(400) + COUNTER_COOLDOWN(420)。 */
export const PLAYER_ATTACK_CYCLE_MS = 820;

/**
 * 換算式②(自己中心AoEの予告下限): 半径 radiusPx の円から**歩いて**出るのに要る最小ms。
 * 予告(赤い図形が出ている時間)がこれ未満なら、**見てから歩いても構造的に避けられない**=理不尽。
 * 逆に「避けさせたくない/カウンターさせたい技」は意図的にこれ未満にしてよい(その場合は
 * 必ずコメントで意図を明記する)。
 * 注: プレイヤー半径は呼び出し側で足す(自機サイズが場面で変わるため、ここでは素の式だけを持つ)。
 */
export const minWindupMs = (radiusPx: number): number => (radiusPx / PLAYER_WALK_PX_PER_SEC) * 1000;

/**
 * 換算式③(硬直=パニッシュ窓の下限): 本作の「1発」= PLAYER_ATTACK_CYCLE_MS(820ms)。
 * ER資料 §1-2(ミドラ=設計の見本)の「ほぼ全コンボ後に**1〜2秒の確定パニッシュ窓**」を本作へ写すと
 * **1発=0.9秒 / 2発=1.7秒**になる。硬直がこの床を下回る技は「硬直がある」と言いながら
 * **プレイヤーが1発も入れられない**=休符が存在しないのと同じ(監査で天使/裏ボスの大半が該当した)。
 */
export const BOSS_RECOVER_FLOOR_MS = 900;

/** ストリング(連段)終端の休符=2発ぶん。※ストリング機構はバッチ3以降。ここでは定数だけ先に置く。 */
export const BOSS_STRING_REST_MS = 1700;

/**
 * 硬直msに下限(BOSS_RECOVER_FLOOR_MS)を敷く。**定数の宣言側で包む**ことで、
 * 元の数字を履歴として残したまま床を1箇所で保証する(呼び出し箇所を増やさない)。
 * 例: `const URI_BOLT_RECOVER_MS = withRecoverFloor(500); // → 900`
 */
export const withRecoverFloor = (ms: number): number => Math.max(BOSS_RECOVER_FLOOR_MS, ms);

/**
 * ★未決(社長検討中の予告演出「赤ラインの中をなぞる色塗りがメーターのように溜まる」)の土台。
 * 予告の進捗を 0..1 で返す純関数。描画側(pixiScene)が敵の aiStartedAt / bossStateUntil から
 * そのまま呼べる形にしてある(**この関数を使う配線自体はまだ入れていない**=演出の採否は社長判断)。
 * startMs/endMs が不正(未設定・逆順)な時は 0 を返す=描画が壊れない安全側。
 */
export const telegraphProgress01 = (nowMs: number, startMs: number | undefined, endMs: number | undefined): number => {
  if (startMs === undefined || endMs === undefined || endMs <= startMs) return 0;
  return Math.max(0, Math.min(1, (nowMs - startMs) / (endMs - startMs)));
};

/**
 * 自己中心AoE(=「歩いて円から出る」以外に避けようが無い技)の予告監査表。
 * escapeMs = プレイヤーが**危険域の位置を知ってから実行までに使える時間**(予告が出ている時間)。
 * ここに載せた技は bossTelegraph.test.ts が `escapeMs >= minWindupMs(radiusPx)` を機械的に検査する。
 *
 * 掟: **新しい自己中心AoEを足したらこの表にも足す**(CLAUDE.md「教訓は即機械化」)。
 * 表に載せないのは「線/帯/カプセル技」(横へ歩けば抜けられるので半径の式が当たらない)と、
 * 「リング上に個別の弾を置く技」(隙間を通るので円ではない=skadiの氷結の檻/jibrilの聖別)。
 */
export interface AoeTelegraphEntry {
  name: string;
  escapeMs: number;
  radiusPx: number;
  /** 意図的に下限未満にしている技(密着への懲罰など)。設定時は検査を免除し、理由を必ず書く。 */
  intentionallyUnavoidable?: string;
}

// 値は各実装ファイルの定数の**複製**(このレイヤはstore/hook非依存を保つためimportしない)。
// 元の定数を動かしたらここも直すこと(既存の THOR_PHASE_HP_THRESHOLDS と同じ重複管理の慣例)。
export const AOE_TELEGRAPH_AUDIT: readonly AoeTelegraphEntry[] = [
  // --- 合格しているもの(回帰防止のために載せる) ---
  // angelBossTick.ts: ACRASIEL_SPEAR_DETONATE_MS=2000 / ACRASIEL_SPEAR_RADIUS=92
  { name: 'acrasiel-spear(結晶の槍・遅延起爆)', escapeMs: 2000, radiusPx: 92 },
  // useGameLoop.ts: THOR_JUMP_WINDUP_MS=700 + THOR_JUMP_MS=360(着地円は溜め開始から出る) / THOR_JUMP_RADIUS=70
  { name: 'thor-jump(着地爆風)', escapeMs: 1060, radiusPx: 70 },
  // angelBossTick.ts: RAFI_JUMP_WINDUP_MS=700 + RAFI_JUMP_MS=360 / RAFI_JUMP_RADIUS=70
  { name: 'rafi-jump(着地爆風)', escapeMs: 1060, radiusPx: 70 },
  // angelBossTick.ts: ACRASIEL_WARP_TELEGRAPH_MS(v0.25.2609で800→1000へ是正) / ACRASIEL_WARP_IMPACT_RADIUS=92
  // 旧800msでは83.5pxしか歩けず半径92pxから**構造的に**出られなかった(監査で発見・換算式②違反)。
  { name: 'acrasiel-warp(転移衝撃)', escapeMs: 1000, radiusPx: 92 },

  // --- 下限未満だが「意図」として据え置くもの(v0.25.2609では直さず記録に留める) ---
  // useGameLoop.ts: MIMIR_BITE_WINDUP_MS=700 / MIMIR_BITE_RADIUS=GRENADE_BLAST_RADIUS=92 → 必要881ms
  {
    name: 'mimir-bite(群体の噛みつき)', escapeMs: 700, radiusPx: 92,
    intentionallyUnavoidable: '密着帯(<=200px)専用の懲罰技=「張り付き続けたら噛まれる」を教える技。'
      + '城ボスの踏み鳴らし(密着でstomp重み50)と同じ思想。範囲外へ歩くのではなく間合いを空ける動機付けが役目。',
  },
  // angelBossTick.ts: SURIEL_RINGSPIN_WINDUP_MS=800 / SURIEL_RINGSPIN_RADIUS=92 → 必要881ms
  {
    name: 'suriel-ringspin(近接拒否の回転)', escapeMs: 800, radiusPx: 92,
    intentionallyUnavoidable: '「近接拒否」=密着帯(<=140px)に居ることそのものへの懲罰技(§6.28-18)。'
      + '不足は81msで、密着から一歩でも動いていれば抜けられる。役目が「密着を許さない」なので据え置く。',
  },
  // angelBossTick.ts: ACRASIEL_BURST_WINDUP_MS=1200 / ACRASIEL_BURST_RADIUS=140 → 必要1341ms
  {
    name: 'acrasiel-burst(大円)', escapeMs: 1200, radiusPx: 140,
    intentionallyUnavoidable: '不足141ms(必要値の89%)。アクラシエルは脚が無く(speed:0)自分から間合いを'
      + '詰められないため、大円は「近寄り過ぎるな」の唯一の担い手。★未決: 社長裁定待ち(1400msへ延ばすか、'
      + '半径を125pxへ縮めるかの二択。判定と赤円は同じ定数なのでどちらでも図形と判定は一致する)。',
  },
] as const;
