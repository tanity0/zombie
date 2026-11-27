// ★刀のタップ=居合の構え(社長指示2026-11-27「刀、タップがいまカウンター窓のみなのに、ナイフ振ってるアニメが流れるので、
// しゃがみにして、背負ってる刀を横にプレイヤーの絵に被せることで鞘に収めた刀を抜刀する構えに見える様にしよう」+「ピタッと止まるイメージ」)。
// 描画だけの純関数(store にも PixiJS にも依存しない)。判定・カウンター窓の長さは store のまま(ここは窓の時刻を読むだけ)。
//   - 入り: 窓が開いた瞬間から KATANA_IAI_ENTER_MS で背中→腰へ(速く出て最後に減速)。体のしゃがみも同じ時刻に着地する。
//   - 収まり: 刀は収まる所でごく小さく行き過ぎて戻る(KATANA_IAI_SETTLE_MS)。その後、窓が閉じるまで 1px も動かさない。
//   - 戻り: 窓が閉じたら KATANA_IAI_EXIT_MS で背中へ(入りより少し重く=ゆっくり出てゆっくり止まる)。戻りきるまでしゃがみのまま。

/** 背中→腰へ移る時間(ms)=体のしゃがみが着地する時刻(同じ1点に揃える)。 */
export const KATANA_IAI_ENTER_MS = 45;
/** 腰→背中へ戻る時間(ms)。入りより少し重く。 */
export const KATANA_IAI_EXIT_MS = 90;
/** 収まる所での行き過ぎ→戻りの時間(ms・1〜2フレーム)。 */
export const KATANA_IAI_SETTLE_MS = 32;

/** 刀モード(刀・村雨)を持っているか。store の isKatanaMode と同じ条件(描画側から store を引かずに使う)。 */
export const katanaIaiEquipped = (subWeapons: readonly string[] | undefined): boolean =>
  !!subWeapons && (subWeapons.includes('katana') || subWeapons.includes('murasame'));

const clamp01 = (t: number): number => Math.max(0, Math.min(1, t));
/** 速く出て最後に減速して止まる。 */
const easeOutCubic = (t: number): number => { const u = 1 - clamp01(t); return 1 - u * u * u; };
/** ゆっくり出てゆっくり止まる(戻りの重さ)。 */
const easeInOutQuad = (t: number): number => { const u = clamp01(t); return u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u); };

const hasWindow = (s: number, e: number): boolean => s > 0 && e > s;

/**
 * 居合の構えの割合(0=背負い・1=腰で構え)。windowStart..windowEnd = カウンターの窓(store の counterWindowStart/End)。
 * 窓が短い(入りの途中で閉じた)時は、その途中の値から戻り始める(跳ばない)。
 */
export const katanaIaiStanceK = (
  now: number, windowStart: number, windowEnd: number, enterMs = KATANA_IAI_ENTER_MS, exitMs = KATANA_IAI_EXIT_MS,
): number => {
  if (!hasWindow(windowStart, windowEnd) || now < windowStart) return 0;
  const enter = (t: number) => easeOutCubic((t - windowStart) / Math.max(1, enterMs));
  if (now <= windowEnd) return enter(now);
  return enter(windowEnd) * (1 - easeInOutQuad((now - windowEnd) / Math.max(1, exitMs)));
};

/**
 * 収まる所での行き過ぎ(0..1・掛ける px は描画側)。入りが終わった瞬間から KATANA_IAI_SETTLE_MS の間だけ、
 * 0→1→0 の山(行き過ぎて戻る)。それ以外は 0(止まっている間は動かさない)。窓が入りより短い時は出さない。
 */
export const katanaIaiSettle = (now: number, windowStart: number, windowEnd: number): number => {
  if (!hasWindow(windowStart, windowEnd)) return 0;
  const t = now - windowStart - KATANA_IAI_ENTER_MS;
  if (t <= 0 || t >= KATANA_IAI_SETTLE_MS || now > windowEnd) return 0;
  return Math.sin(Math.PI * (t / KATANA_IAI_SETTLE_MS));
};

/**
 * 体のしゃがみの浮き(0..1・掛ける px は描画側)。窓が開いた瞬間は上に居て、重力のように加速しながら
 * KATANA_IAI_ENTER_MS で着地する(刀が収まる時刻と同じ)。着地後は 0。
 */
export const katanaIaiDropLift = (now: number, windowStart: number, windowEnd: number): number => {
  if (!hasWindow(windowStart, windowEnd) || now < windowStart || now > windowEnd) return 0;
  const u = clamp01((now - windowStart) / KATANA_IAI_ENTER_MS);
  return 1 - u * u;
};

/** しゃがみの絵を出す間か=窓が開いてから、窓が閉じて刀が背中へ戻りきるまで。 */
export const katanaIaiCrouching = (now: number, windowStart: number, windowEnd: number): boolean =>
  hasWindow(windowStart, windowEnd) && now >= windowStart && now <= windowEnd + KATANA_IAI_EXIT_MS;

/**
 * この振り(meleeSwingAt)が刀のタップ由来か=タップは窓の起点と同じ時刻に振りの時計を打つ。
 * 刀のタップの振りでは、ナイフの振りの絵(しゃがみ→振り上げ・手のナイフ・弧・踏み込み)を出さない。
 */
export const isKatanaTapSwing = (
  subWeapons: readonly string[] | undefined, meleeSwingAt: number, windowStart: number,
): boolean => katanaIaiEquipped(subWeapons) && meleeSwingAt > 0 && windowStart > 0 && Math.abs(meleeSwingAt - windowStart) <= 2;
