// 風(社長要望v0.25.2646「たまに風で揺らめかせられる？」)。
//
// **時刻だけから決まる純関数**にしてある(状態を持たない)。理由:
//  ・描画は毎フレーム「いまの風」を引くだけでよく、**シミュレーション側に状態を増やさない**
//    (CLAUDE.md: PixiJSは描くだけ / storeに毎フレームの書き込みを増やさない)。
//  ・純関数なので**テストで性格を固定できる**(常時吹きっぱなしにならない、等)。
//
// ★将来の横展開: 「木や花が風にたなびく」(research/LIGHT_REWORK.md §4-1)も**同じ風**を引けば、
// 炎と草木が**同じ瞬間に同じ向きへ**動く。別々の揺れにすると世界が嘘になるので、風は1本にする。

/** 決定的な擬似乱数(0..1)。整数の「何回目の突風か」を入れる。 */
const hash01 = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** 突風の周期(ms)。この長さに1回、どこかで突風が起きる。 */
export const GUST_PERIOD_MS = 7200;
/** 突風1回の長さ(ms)。 */
export const GUST_MS = 1700;
/** 常時の微風の振れ幅(突風に対する比)。0=完全に止まる。 */
export const BREEZE_AMP = 0.14;

/**
 * いまの風(-1..1 くらい)。負=左へ / 正=右へ。
 *
 * ★**突風は世界で共通**(seedに依らない)。全部の炎が**同じ瞬間に同じ向き**へ倒れることで
 * 「風が吹いた」に見える。**微風だけ seed でずらす**(揃いすぎると機械的に見えるため)。
 *
 * @param nowMs 経過時間(ms)。`performance.now()` 相当でよい(見た目だけなのでスロー演出の影響は不問)。
 * @param seed  対象ごとの種(座標など)。微風の位相だけに効く。
 */
export const windAt = (nowMs: number, seed = 0): number => {
  // --- 常時の微風: ゆっくり2周期を合成(単調なサインに見せない) ---
  const breeze = BREEZE_AMP * (
    0.62 * Math.sin(nowMs / 1450 + seed * 0.7)
    + 0.38 * Math.sin(nowMs / 830 + seed * 1.9)
  );

  // --- 突風: 周期ごとに「いつ・どちらへ・どれくらい」を決定的に抽選 ---
  const period = Math.floor(nowMs / GUST_PERIOD_MS);
  const start = hash01(period) * (GUST_PERIOD_MS - GUST_MS);
  const t = nowMs - period * GUST_PERIOD_MS - start;
  let gust = 0;
  if (t >= 0 && t < GUST_MS) {
    const u = t / GUST_MS;
    // 立ち上がりが速く、抜けが遅い(実際の突風の形)。sin の山を前へ寄せる。
    const shape = Math.sin(Math.PI * Math.pow(u, 0.72));
    const dir = hash01(period + 0.37) < 0.5 ? -1 : 1;
    const strength = 0.55 + 0.45 * hash01(period + 0.71);
    gust = shape * shape * dir * strength;   // 二乗で「たまに強く」を作る(弱い突風は目立たない)
  }
  return breeze + gust;
};

/** 突風が起きている最中か(演出の追加トリガ用。いまは火の粉の流れに使う)。 */
export const isGusting = (nowMs: number): boolean => {
  const period = Math.floor(nowMs / GUST_PERIOD_MS);
  const start = hash01(period) * (GUST_PERIOD_MS - GUST_MS);
  const t = nowMs - period * GUST_PERIOD_MS - start;
  return t >= 0 && t < GUST_MS;
};
