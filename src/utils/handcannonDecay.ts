// ハンドキャノン(handgun-t2-handcannon・UNIQUE_WEAPONS.md §13-1)の連続命中減衰。
//
// 社長仕様: 「同じ敵へ連続してダメージを与えるほど、その敵への威力が段階的に低下する。
// リロード完了で減衰リセット。雑魚を次々狙うほど強く、同一ボスを撃ち続けると弱くなる」。
// 数値(叩き台・§13-1): 1命中ごとに-20%・下限40%(1/0.8/0.6/0.4/0.4/0.4)。**敵ごとに独立**。
//
// ★未決 #U12「"連続"の解釈」(社長裁定待ち・UNIQUE_WEAPONS.md §9/§13-1):
//   (a) リロードまでの累計 — 別の敵に当てても、その敵自身のカウンタは減らない/リセットしない。
//       reload完了で全部まとめてリセット。**既定**(社長仕様「雑魚を次々狙うほど強く」の素直な読み)。
//   (b) 直前の命中対象が同じ時だけ積む — 違う敵に当てた瞬間、直前の対象の連続もリセットされる。
// 定数1つ(HANDCANNON_DECAY_INTERPRETATION)で切り替えられる形にしてある(両方試せる)。
//
// critDecay.ts(銃クリ減衰)と同じ流儀: 純関数+モジュール台帳(レンダラ非依存・ヘッドレステスト可)。
// 台帳は resetHandcannonDecay() で全消去(resetGame / リロード完了から呼ぶ)。

export type HandcannonDecayInterpretation = 'a' | 'b';
// ★裁定が出るまでの切り替え点はこの1行だけ。'b'に書き換えれば挙動が変わる
// (handcannonDamageMultOnHitの既定引数がここを読む。呼び出し側=useGameLoop.tsは変更不要)。
export const HANDCANNON_DECAY_INTERPRETATION: HandcannonDecayInterpretation = 'a';

export const HANDCANNON_DECAY_STEP = 0.20;       // 1命中ごとの威力低下
export const HANDCANNON_DECAY_FLOOR_MULT = 0.40; // 威力倍率の下限(=4発目以降)

// 解釈(a): 敵ごとに独立した「これまでの連続命中回数」。reload完了(resetHandcannonDecay)でのみ全消去。
const perEnemyHits = new Map<string, number>(); // enemyId -> この命中より前の命中回数
const LEDGER_CAP = 300; // critDecay.tsと同じFIFO上限(肥大化防止)

// 解釈(b): 「直前に命中した敵」だけを覚える共有ストリーク(敵が変われば0から)。
let streakEnemyId: string | null = null;
let streakHits = 0;

/** ラン開始・リロード完了で呼ぶ(台帳を丸ごとクリア=「敵ごとに独立」した記憶を一括で捨てる)。 */
export const resetHandcannonDecay = (): void => {
  perEnemyHits.clear();
  streakEnemyId = null;
  streakHits = 0;
};

const multForPriorHits = (hits: number): number =>
  Math.max(HANDCANNON_DECAY_FLOOR_MULT, 1 - HANDCANNON_DECAY_STEP * hits);

/**
 * 命中1回ぶんの処理: ①この命中に適用するダメージ倍率(更新前の回数で決まる。初手は必ず1.0)を返し、
 * ②台帳を進める。`interpretation`は既定でHANDCANNON_DECAY_INTERPRETATIONを見る
 * (テストから(a)/(b)を明示的に切り替えられるように引数化してある)。
 */
export const handcannonDamageMultOnHit = (
  enemyId: string,
  interpretation: HandcannonDecayInterpretation = HANDCANNON_DECAY_INTERPRETATION,
): number => {
  if (interpretation === 'b') {
    const priorHits = streakEnemyId === enemyId ? streakHits : 0;
    streakEnemyId = enemyId;
    streakHits = priorHits + 1;
    return multForPriorHits(priorHits);
  }
  const priorHits = perEnemyHits.get(enemyId) ?? 0;
  if (!perEnemyHits.has(enemyId) && perEnemyHits.size >= LEDGER_CAP) {
    const oldest = perEnemyHits.keys().next().value;
    if (oldest !== undefined) perEnemyHits.delete(oldest);
  }
  perEnemyHits.set(enemyId, priorHits + 1);
  return multForPriorHits(priorHits);
};

/**
 * 敵の消滅時の掃除(メモリ掃除のみ・挙動には無関係)。消滅経路が複数(キル/画面外リサイクル/上限
 * カリング)あるため、1箇所で個別に拾おうとせず「生きている敵のIDに無いものを捨てる」形にする
 * (敵IDはDate.now()+乱数で使い回されないので誤爆の心配は無い)。解釈(a)の台帳だけが対象
 * (解釈(b)はエントリ1つだけなので肥大化しない)。
 */
export const pruneHandcannonDecay = (aliveEnemyIds: ReadonlySet<string>): void => {
  for (const id of perEnemyHits.keys()) {
    if (!aliveEnemyIds.has(id)) perEnemyHits.delete(id);
  }
};

/** テスト/デバッグ用: 現在の敵の連続命中回数を覗く(解釈(a)専用・無ければ0)。 */
export const peekHandcannonHits = (enemyId: string): number => perEnemyHits.get(enemyId) ?? 0;
