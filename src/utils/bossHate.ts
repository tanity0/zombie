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
import type { HateSideKey } from '../types/game';
export const HATE_WINDOW_MS = 6000;
export const HATE_BUCKETS = 6;
export const HATE_BUCKET_MS = HATE_WINDOW_MS / HATE_BUCKETS; // 1000ms
export const HATE_STICKY_MULT = 1.3; // 現ターゲットへの粘着(僅差の入れ替わり=パタパタを防ぐ)

// research/ESCORT_TARGETED.md §5: ボスの狙いの相手は 'player' / 'ghost'(守護霊) / `escort:<id>`(進軍NPC)の3択以上。
// 型の本体は types/game.ts の HateSideKey(Enemy.hateTarget と同じ型・store非依存の葉)。
export type HateSide = HateSideKey;

/** 進軍NPCを指す HateSide を作る/読む(座標を引く箇所は 'ghost' の二択ではなくこの2本で3択に分ける)。 */
export const escortHateSide = (escortId: string): HateSide => `escort:${escortId}`;
export const escortIdOfSide = (side: HateSide | undefined): string | undefined =>
  side !== undefined && side.startsWith('escort:') ? side.slice('escort:'.length) : undefined;

export interface HateBucket {
  idx: number; // 絶対バケツ番号(= floor(gameTime / HATE_BUCKET_MS))
  dmg: number; // そのバケツ内の与ダメージ合計
}

// 復帰フラグ(受け入れ条件6): `?bosshate=0` で全ボス旧挙動(常にプレイヤー)へ完全フォールバック。
export const BOSS_HATE_ENABLED =
  typeof window === 'undefined' || new URLSearchParams(window.location.search).get('bosshate') !== '0';

/** 守護霊と共闘できる全ボスかどうか。damageEnemy側のヘイト集計をこの型だけに限定するための
 * ゲート(全敵にバケツ配列を持たせて無駄なメモリ/計算を払わない)。 */
const HATE_TRACKED_BOSS_TYPES = new Set<string>([
  'giantbat', 'idol', 'miguel', 'jibril', 'rafi', 'uri', 'suriel', 'acrasiel',
  'mimir', 'jormungand', 'skadi', 'thor',
  'phillboss', // PACING_PUZZLE.md §10(EXボス「フィル(変異体)」): 守護霊と共闘できるボスに編入
  // ★v0.25.3971(社長報告「賞金首が守護霊を狙わない」): v3949で賞金首にも守護霊を召喚するように
  // なったのに、ヘイト対象表に未編入だった(バケツが積まれず bountyTick も常にプレイヤー狙いだった)。
  'bounty-ranged', 'bounty-melee', 'bounty-balance', 'bounty-maiko',
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

// ---- research/ESCORT_TARGETED.md §5: 「ダメージの割合+近さ」(プレイヤー/守護霊/進軍NPC 全員共通) -------------
/** 近さの点の重み(叩き台)。 */
export const HATE_NEAR_WEIGHT = 0.6;
/** 近さの点: この距離以遠で0 → この距離以内で1(直線)。 */
export const HATE_NEAR_FAR_PX = 600;
export const HATE_NEAR_FULL_PX = 160;
export const hateNearRamp = (d: number): number =>
  Math.max(0, Math.min(1, (HATE_NEAR_FAR_PX - d) / (HATE_NEAR_FAR_PX - HATE_NEAR_FULL_PX)));

/** ボスの狙いの候補になる進軍NPC(画面内で倒れていない軍人。呼び手=gameStore の提供関数が絞って渡す)。 */
export interface HateEscortCandidate {
  id: string;
  /** 体の中心。 */
  x: number; y: number;
  /** 移動速度(px/s)。偏差撃ち(idolTick)が使う。 */
  vx?: number; vy?: number;
  /** 足元のy(火の設置=ジブリルの足元)。 */
  footY?: number;
}

export interface PickHateTargetInput {
  enemyCenter: HatePoint;
  player: HatePoint;
  ghost: HatePoint | null;
  escorts: readonly HateEscortCandidate[];
  playerHateBuckets: readonly HateBucket[] | undefined;
  ghostHateBuckets: readonly HateBucket[] | undefined;
  escortHateBuckets: Readonly<Record<string, readonly HateBucket[]>> | undefined;
  gameTime: number;
  currentTarget: HateSide | undefined;
}

/**
 * 技の狙いロック時に呼ぶ: プレイヤー/守護霊/進軍NPCのうち誰を狙うかを1つ返す純関数(§5)。
 * - ボスのヘイトを持たない(守護霊も進軍NPCも居ない)→ 'player'(旧挙動・計算スキップ)。
 * - `?bosshate=0` → 常に 'player'。
 * - 全員の直近6秒ダメージが0(開幕等)→ **粘着なしで一番近い相手**(今と同じ。同距離はプレイヤー)。
 * - それ以外 → 点数 = ダメージの割合(dmg_i/Σdmg)+ HATE_NEAR_WEIGHT × 近さの点。今の相手には ×HATE_STICKY_MULT。
 *   いちばん高い相手。同点は先に並べた方(プレイヤー → 守護霊 → 進軍NPC)。
 */
export const pickHateTarget = (input: PickHateTargetInput): HateSide => {
  if (!BOSS_HATE_ENABLED) return 'player';
  const { enemyCenter, player, ghost, escorts, gameTime, currentTarget } = input;
  if (!ghost && escorts.length === 0) return 'player';
  const cands: { side: HateSide; x: number; y: number; hate: number }[] = [
    { side: 'player', x: player.x, y: player.y, hate: hateTotal(input.playerHateBuckets, gameTime) },
  ];
  if (ghost) cands.push({ side: 'ghost', x: ghost.x, y: ghost.y, hate: hateTotal(input.ghostHateBuckets, gameTime) });
  for (const e of escorts) {
    cands.push({ side: escortHateSide(e.id), x: e.x, y: e.y, hate: hateTotal(input.escortHateBuckets?.[e.id], gameTime) });
  }
  const sum = cands.reduce((a, c) => a + c.hate, 0);
  let best = cands[0];
  if (sum <= 0) {
    let bd = (best.x - enemyCenter.x) ** 2 + (best.y - enemyCenter.y) ** 2;
    for (let i = 1; i < cands.length; i++) {
      const d = (cands[i].x - enemyCenter.x) ** 2 + (cands[i].y - enemyCenter.y) ** 2;
      if (d < bd) { bd = d; best = cands[i]; }
    }
    return best.side;
  }
  let bestScore = -Infinity;
  for (const c of cands) {
    const d = Math.hypot(c.x - enemyCenter.x, c.y - enemyCenter.y);
    let score = c.hate / sum + HATE_NEAR_WEIGHT * hateNearRamp(d);
    if (currentTarget === c.side) score *= HATE_STICKY_MULT;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best.side;
};

/** 軍人が狙いの相手に選ばれた時の付帯情報(座標以外に偏差撃ち・足元の火が読む)。 */
export interface ResolvedEscortAim { id: string; vx: number; vy: number; footY: number }

export interface ResolvedHateAim { x: number; y: number; side: HateSide; escort?: ResolvedEscortAim }

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
  hateEscortBuckets?: Readonly<Record<string, readonly HateBucket[]>>;
  hateTarget?: HateSide;
}

/** summons 配列からゴーストを拾うための最小限の形(Summon型のダックタイピング)。 */
export interface BossHateGhostLike {
  x: number; y: number; width: number; height: number;
  kind: string;
  ghostBossId?: string;
}

// ---- 進軍NPCの候補の提供口 ------------------------------------------------------------------------
// 全ボスの狙いロック箇所(約50)は同じ resolveBossHateAim / resolveBossLockedHateAim を通る。軍人の一覧(画面内・
// 倒れていない)は store が持つので、この葉モジュールは store を import せず、store が起動時に提供関数を差し込む
// (循環import禁止)。未登録(テスト等)は空=従来どおりプレイヤー/守護霊の二択。明示で渡せば提供関数より優先する。
export interface HateEscortSource {
  /** 画面内(ズーム込みの可視域ぴったり)で倒れていない軍人=狙いの候補。 */
  inView: readonly HateEscortCandidate[];
  /** 倒れていない軍人すべて(画面外含む)。技の途中で画面外へ出ても「ロックした相手」を引ける。 */
  alive: readonly HateEscortCandidate[];
}
const NO_ESCORTS: HateEscortSource = { inView: [], alive: [] };
let hateEscortProvider: (() => HateEscortSource) | null = null;
export const setHateEscortProvider = (fn: (() => HateEscortSource) | null): void => { hateEscortProvider = fn; };
const currentEscorts = (explicit?: HateEscortSource): HateEscortSource => explicit ?? hateEscortProvider?.() ?? NO_ESCORTS;

const guardCenter = (g: BossHateGhostLike): HatePoint => ({ x: g.x + g.width / 2, y: g.y + g.height / 2 });

/**
 * 各ボスのwindup開始点(beginGiantMove/beginGiantStageMove/beginGlenMove/beginIdolMove/
 * 天使の各begin系)から呼ぶ最上位ヘルパ。「このボスに紐づいているゴースト」をsummons一覧から
 * 探し出し、画面内の進軍NPCと合わせて pickHateTarget へ渡すところまで一括で行う。
 * 呼び出し側は戻り値のx/yをpcx/pcyの代わりに読み、side を敵の`hateTarget`パッチへ書き戻す。
 */
export const resolveBossHateAim = (
  enemy: BossHateEnemyLike,
  player: HatePoint, // 中心座標(呼び出し側で x+width/2 済みのものを渡す=pcx/pcy)
  summons: readonly BossHateGhostLike[],
  gameTime: number,
  escorts?: HateEscortSource,
): ResolvedHateAim => {
  const enemyCenter: HatePoint = { x: enemy.x + enemy.width / 2, y: enemy.y + enemy.height / 2 };
  const boundGhost = summons.find(s => s.kind === 'ghost-ally' && s.ghostBossId === enemy.id);
  const ghost: HatePoint | null = boundGhost ? guardCenter(boundGhost) : null;
  const cand = currentEscorts(escorts).inView;
  const side = pickHateTarget({
    enemyCenter, player, ghost, escorts: cand,
    playerHateBuckets: enemy.hatePlayerBuckets, ghostHateBuckets: enemy.hateGhostBuckets,
    escortHateBuckets: enemy.hateEscortBuckets,
    gameTime, currentTarget: enemy.hateTarget,
  });
  return aimOfSide(side, player, ghost, cand);
};

const aimOfSide = (
  side: HateSide, player: HatePoint, ghost: HatePoint | null, escorts: readonly HateEscortCandidate[],
): ResolvedHateAim => {
  if (side === 'ghost' && ghost) return { x: ghost.x, y: ghost.y, side };
  const id = escortIdOfSide(side);
  if (id !== undefined) {
    const e = escorts.find(c => c.id === id);
    if (e) return { x: e.x, y: e.y, side, escort: { id, vx: e.vx ?? 0, vy: e.vy ?? 0, footY: e.footY ?? e.y } };
  }
  return { x: player.x, y: player.y, side: 'player' };
};

/**
 * 技開始時に確定した `hateTarget` の相手を、技の途中でも同じ側のまま追うためのヘルパ。
 * ヘイト値は再評価しないので、連射・足元設置・弱追尾の途中で狙いが左右へ揺れない。
 * 守護霊が帰還/死亡して消えた場合・軍人が倒れた/居なくなった場合だけプレイヤーへ安全に戻す
 * (軍人は画面外へ出ても倒れていなければ追う=技の途中で相手が変わらない)。
 */
export const resolveBossLockedHateAim = (
  enemy: BossHateEnemyLike,
  player: HatePoint,
  summons: readonly BossHateGhostLike[],
  escorts?: HateEscortSource,
): ResolvedHateAim => {
  const boundGhost = summons.find(s => s.kind === 'ghost-ally' && s.ghostBossId === enemy.id);
  if (enemy.hateTarget === 'ghost' && boundGhost) {
    return {
      x: boundGhost.x + boundGhost.width / 2,
      y: boundGhost.y + boundGhost.height / 2,
      side: 'ghost',
    };
  }
  const eid = escortIdOfSide(enemy.hateTarget);
  if (eid !== undefined) {
    const e = currentEscorts(escorts).alive.find(c => c.id === eid);
    if (e) return { x: e.x, y: e.y, side: escortHateSide(eid), escort: { id: eid, vx: e.vx ?? 0, vy: e.vy ?? 0, footY: e.footY ?? e.y } };
  }
  return { x: player.x, y: player.y, side: 'player' };
};
