/**
 * ★瀕死の赤い縁取り(LowHpVignette)と心音の「鼓動の速さ」を体力で決める(社長裁定2026-10-16・まとめHTML C3「ピンチの赤点滅が
 * 分かりづらい」→「はい」: 縁の滲みを濃く・脈を鼓動に合わせて速く(HPが減るほど速い)・心音を小さく)。
 * 段(tier)は 0=瀕死でない / 1=HP20以下 / 2=HP12以下 / 3=HP6以下。段ごとに 1拍の周期(ms)と心音の再生速度を返す。
 * 等間隔にしない(900→700→520)=追い詰められるほど詰まる。純関数(実装精度の規律4)。
 */
export const LOW_HP_THRESHOLD = 20;

export const lowHpTier = (health: number): 0 | 1 | 2 | 3 => {
  if (health <= 0 || health > LOW_HP_THRESHOLD) return 0;
  if (health <= 6) return 3;
  if (health <= 12) return 2;
  return 1;
};

/** 心音の素材(heartbeat.mp3)の1拍=約1410ms。目の鼓動はこれに**従わせる**(クリエイティブ監査#1: 画面と音の心臓が別のテンポで打たない)。 */
export const HEARTBEAT_SAMPLE_MS = 1410;
/** 心音ループの再生速度(=鼓動の速さ)。段で速く。1.35倍(約+5半音)までに留める=追い詰められた重さが抜けない範囲(監査#2は社長へ)。 */
export const LOW_HP_HEART_RATE: Record<0 | 1 | 2 | 3, number> = { 0: 1, 1: 1, 2: 1.18, 3: 1.35 };
/** 目の鼓動の周期(ms)=音の1拍 ÷ 再生速度(1410 / 1195 / 1044)。等間隔にしない。 */
export const LOW_HP_PULSE_MS: Record<1 | 2 | 3, number> = {
  1: Math.round(HEARTBEAT_SAMPLE_MS / LOW_HP_HEART_RATE[1]),
  2: Math.round(HEARTBEAT_SAMPLE_MS / LOW_HP_HEART_RATE[2]),
  3: Math.round(HEARTBEAT_SAMPLE_MS / LOW_HP_HEART_RATE[3]),
};
/**
 * 「ドクン」の形(二拍・休止)のキー。ms は拍の頭からの時刻、o は CSS 側の不透明度。
 * 画面の縁の鼓動(lowHpBeatStops)と、血の覚醒の光・体の赤の鼓動(lowHpBeatShape)が**同じ形**を読む(1本の定義)。
 */
export const LOW_HP_BEAT_KEYS: readonly { ms: number; o: number }[] = [
  { ms: 0, o: 0.24 }, { ms: 55, o: 0.68 }, { ms: 170, o: 0.28 }, { ms: 300, o: 0.60 }, { ms: 440, o: 0.24 },
];

/**
 * 「ドクン」の形は ms で固定し、段で縮むのは休止だけ(監査#4: 等比縮小にしない。速い心拍は収縮より休止が縮む)。
 * 返り値は CSS keyframes の百分率(周期に対する位置)。0=低→55ms 1拍目の山→170ms 谷→300ms 2拍目の山(弱)→440ms 低、以後休止。
 */
export const lowHpBeatStops = (periodMs: number): { p: number; o: number }[] => {
  const pct = (ms: number) => Math.min(99.9, (ms / periodMs) * 100);
  return [
    ...LOW_HP_BEAT_KEYS.map((k, i) => ({ p: i === 0 ? 0 : pct(k.ms), o: k.o })),
    { p: 100, o: 0.24 },
  ];
};

/**
 * 拍の頭からの経過 ms(phaseMs)を 0..1 の拍の強さへ(0=底・1=1拍目の山)。同じ形(LOW_HP_BEAT_KEYS)を
 * 山=1・底=0 へ正規化し、キーの間は smoothstep でつなぐ(折れ線の角が出ない=動き始め・動き終わりに加減速)。
 * 最後のキー(440ms)より後は休止=0。DOM を使わない描画用(PixiJS の光・体の赤が読む)。
 */
export const lowHpBeatShape = (phaseMs: number): number => {
  const keys = LOW_HP_BEAT_KEYS;
  const lo = keys[0].o;
  const hi = Math.max(...keys.map(k => k.o));
  const norm = (o: number) => (o - lo) / (hi - lo);
  if (!(phaseMs > 0)) return 0;
  for (let i = 1; i < keys.length; i++) {
    if (phaseMs < keys[i].ms) {
      const a = keys[i - 1], b = keys[i];
      const k = (phaseMs - a.ms) / (b.ms - a.ms);
      const e = k * k * (3 - 2 * k);
      return norm(a.o) + (norm(b.o) - norm(a.o)) * e;
    }
  }
  return 0;
};
