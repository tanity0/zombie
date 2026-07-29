// BOT_AND_GHOST.md §2.8 G2.5(ヘイト): ボスが技の狙いをロックする瞬間に「プレイヤー」と「ゴースト」の
// どちらを狙うかを決める純関数群。レンダラ/store非依存(rankAssessor.tsと同じ配置方針=src/utils)。
//
// ヘイト値=直近6秒の与ダメージ(1秒バケツ×6・rankAssessor.tsのSoftenStateと同じ「短い窓を固定本数の
// バケツで近似する」軽量パターンを踏襲)。累計にしない理由(仕様書に明記): ゴーストはスキル倍率を
// 持たずDPSで恒常的に負けるため、累計では一生タンクになれない。
//
// 実装上の差異(SoftenStateとの違い): SoftenStateは毎フレームdtを蓄積してバケツを回転させるのに対し、
// ここは絶対gameTimeから「1000ms刻みの絶対バケツ番号」を直接算出する。理由は、加算(ダメージが入った
// 瞬間)も評価(技の狙いロック時)もどちらも毎フレームではなくイベント駆動だから(仕様: 「評価は技の
// 狙いロック時のみ」)。dtステップを毎フレーム誰かが回し続ける必要が無く、古いバケツはインデックスの
// 比較だけで自然に読み捨てられる(CLAUDE.mdのevent-only/boundedの方針に合う)。ウィンドウの意味
// (直近6秒・1秒粒度)自体はSoftenStateと同一。
export const HATE_WINDOW_MS = 6000;
export const HATE_BUCKETS = 6;
export const HATE_BUCKET_MS = HATE_WINDOW_MS / HATE_BUCKETS; // 1000ms
export const HATE_STICKY_MULT = 1.3; // 現ターゲットへの粘着(僅差の入れ替わり=パタパタを防ぐ)

export type HateSide = 'player' | 'ghost';

export interface HateBucket {
  idx: number; // 絶対バケツ番号(= floor(gameTime / HATE_BUCKET_MS))
  dmg: number; // そのバケツ内の与ダメージ合計
}

// 復帰フラグ(受け入れ条件6): `?bosshate=0` で全ボス旧挙動(常にプレイヤー)へ完全フォールバック。
export const BOSS_HATE_ENABLED =
  typeof window === 'undefined' || new URLSearchParams(window.location.search).get('bosshate') !== '0';

/** 対象ボス(giantbat/idol/天使6体)かどうか。damageEnemy側のヘイト集計をこの型だけに限定するための
 * ゲート(全敵にバケツ配列を持たせて無駄なメモリ/計算を払わない)。トール/通常敵は既存の
 * resolveEnemyTarget が既にゴーストを見るのでここには含めない(仕様どおり不変)。 */
const HATE_TRACKED_BOSS_TYPES = new Set<string>([
  'giantbat', 'idol', 'miguel', 'jibril', 'rafi', 'uri', 'suriel', 'acrasiel',
]);
export const isHateTrackedBossType = (t: string): boolean => HATE_TRACKED_BOSS_TYPES.has(t);

/** 1秒バケツへダメージを加算する(gameTimeから絶対バケツ番号を算出。dmg<=0は無変化で同一参照を返す)。 */
export const addHateDamage = (
  buckets: readonly HateBucket[] | undefined,
  gameTime: number,
  dmg: number,
): HateBucket[] => {
  if (!(dmg > 0)) return buckets ? [...buckets] : [];
  const list = buckets ? [...buckets] : [];
  const idx = Math.floor(gameTime / HATE_BUCKET_MS);
  const slot = idx % HATE_BUCKETS;
  const existing = list[slot];
  list[slot] = existing && existing.idx === idx ? { idx, dmg: existing.dmg + dmg } : { idx, dmg };
  return list;
};

/** 直近6秒ぶんの合計(窓外の古いバケツ=idxがズレたものは自然に無視される)。 */
export const hateTotal = (buckets: readonly HateBucket[] | undefined, gameTime: number): number => {
  if (!buckets || buckets.length === 0) return 0;
  const nowIdx = Math.floor(gameTime / HATE_BUCKET_MS);
  const minIdx = nowIdx - HATE_BUCKETS + 1;
  let sum = 0;
  for (const b of buckets) {
    if (b && b.idx >= minIdx && b.idx <= nowIdx) sum += b.dmg;
  }
  return sum;
};

export interface HatePoint { x: number; y: number }

export interface PickHateSideInput {
  enemyCenter: HatePoint;
  player: HatePoint;
  ghost: HatePoint | null; // null = ゴースト不在(仕様5: 常にプレイヤー)
  playerHateBuckets: readonly HateBucket[] | undefined;
  ghostHateBuckets: readonly HateBucket[] | undefined;
  gameTime: number;
  currentTarget: HateSide | undefined; // 直前の狙いロックで選ばれていた側(粘着の基準)
}

/**
 * 技の狙いロック時に呼ぶ: プレイヤーとゴーストのどちらを狙うかを1つ返す純関数。
 * - ゴースト不在 → 常に 'player'(仕様5=完全に旧挙動。ヘイト計算そのものをスキップ)。
 * - `?bosshate=0` → 常に 'player'(受け入れ条件6の復帰フラグ)。
 * - 両者の直近6秒ダメージが0(開幕等) → 近い方。
 * - それ以外 → 直近6秒ダメージが多い方。現ターゲット側には HATE_STICKY_MULT の粘着。
 */
export const pickHateSide = (input: PickHateSideInput): HateSide => {
  if (!BOSS_HATE_ENABLED) return 'player';
  const { enemyCenter, player, ghost, playerHateBuckets, ghostHateBuckets, gameTime, currentTarget } = input;
  if (!ghost) return 'player';
  const pHate = hateTotal(playerHateBuckets, gameTime);
  const gHate = hateTotal(ghostHateBuckets, gameTime);
  if (pHate <= 0 && gHate <= 0) {
    const dp = (player.x - enemyCenter.x) ** 2 + (player.y - enemyCenter.y) ** 2;
    const dg = (ghost.x - enemyCenter.x) ** 2 + (ghost.y - enemyCenter.y) ** 2;
    return dg < dp ? 'ghost' : 'player';
  }
  const pScore = currentTarget === 'player' ? pHate * HATE_STICKY_MULT : pHate;
  const gScore = currentTarget === 'ghost' ? gHate * HATE_STICKY_MULT : gHate;
  return gScore > pScore ? 'ghost' : 'player';
};

export interface ResolvedHateAim { x: number; y: number; side: HateSide }

/**
 * 各ボスの狙いロック箇所で使う便利関数: pickHateSideの結果に応じた中心座標とsideの両方を返す。
 * 呼び出し側は戻り値のx/yをpcx/pcyの代わりに読み、sideを敵の`hateTarget`へ書き戻して次回の
 * 粘着判定に使う(BOT_AND_GHOST.md §2.8「現ターゲットに×1.3の粘着」)。
 */
export const resolveHateAimTarget = (input: PickHateSideInput): ResolvedHateAim => {
  const side = pickHateSide(input);
  const point = side === 'ghost' && input.ghost ? input.ghost : input.player;
  return { x: point.x, y: point.y, side };
};

// ---- ボス側の呼び出しヘルパ(実装バッチ・§2.8 G2.5) --------------------------------------------
// 各ボスの windup 開始点はいずれも「敵本体(hateバケツ/現ターゲットを持つ)」「プレイヤー中心点」
// 「その瞬間の summons 一覧(ghost-ally を探す)」「gameTime」の4つしか要らない。呼び出し側
// (gameStore.ts / useGameLoop.ts / angelBossTick.ts)で毎回 summons.find(...) を書かせると
// 3ファイルへ同じグルーコードが散るので、ここに1箇所へ集約する(構造的ダックタイピングのみで
// Enemy/Player/Summon型そのものはimportしない=このファイルのstore非依存方針を保つ)。

/** damageEnemy/windupロック双方が読む最小限の敵形状。 */
export interface BossHateEnemyLike {
  id: string;
  x: number; y: number; width: number; height: number;
  hatePlayerBuckets?: readonly HateBucket[];
  hateGhostBuckets?: readonly HateBucket[];
  hateTarget?: HateSide;
}

/** summons 配列からゴーストを拾うための最小限の形(Summon型のダックタイピング)。 */
export interface BossHateGhostLike {
  x: number; y: number; width: number; height: number;
  kind: string;
  ghostBossId?: string;
}

/**
 * 各ボスのwindup開始点(beginGiantMove/beginGiantStageMove/beginGlenMove/beginIdolMove/
 * 天使の各begin系)から呼ぶ最上位ヘルパ。「このボスに紐づいているゴースト」をsummons一覧から
 * 探し出し、中心座標化してpickHateSide/resolveHateAimTargetへ渡すところまで一括で行う。
 * 呼び出し側は戻り値のx/yをpcx/pcyの代わりに読み、side を敵の`hateTarget`パッチへ書き戻す。
 */
export const resolveBossHateAim = (
  enemy: BossHateEnemyLike,
  player: HatePoint, // 中心座標(呼び出し側で x+width/2 済みのものを渡す=pcx/pcy)
  summons: readonly BossHateGhostLike[],
  gameTime: number,
): ResolvedHateAim => {
  const enemyCenter: HatePoint = { x: enemy.x + enemy.width / 2, y: enemy.y + enemy.height / 2 };
  const boundGhost = summons.find(s => s.kind === 'ghost-ally' && s.ghostBossId === enemy.id);
  const ghost: HatePoint | null = boundGhost
    ? { x: boundGhost.x + boundGhost.width / 2, y: boundGhost.y + boundGhost.height / 2 }
    : null;
  return resolveHateAimTarget({
    enemyCenter, player, ghost,
    playerHateBuckets: enemy.hatePlayerBuckets, ghostHateBuckets: enemy.hateGhostBuckets,
    gameTime, currentTarget: enemy.hateTarget,
  });
};
