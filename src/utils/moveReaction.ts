// BOT_AND_GHOST.md §2.9 G4a(1): 技への反応表(per-move reactions)の判定中核。**計測のみ・記録専用**で、
// ゲームの挙動・判定・数値には一切影響しない(呼び出し側=playerTraits.tsのセッションからだけ使われる)。
// komaLog.ts/playerTraits.tsと同じ流儀: 純関数+小さな状態オブジェクト。store/React/PixiJS非依存。
//
// 単位=「暴露」(§2.9(1)): ボスの技が1回解決する(=技のエピソードが1回終わる)たび、プレイヤーが
// その技の狙い対象(ヘイトのロック対象) or 危険域内に居たなら1暴露。結果は3分類・優先順位
// **counter > hit > dodge**:
//  - counter: その技の間にカウンター成立(成立7箇所=counterMaster.tsのリファンド呼び出し箇所と同じ)
//  - hit: その技のダメージを食らった(damagePlayerのdamageSourceMoveタグ経由)
//  - dodge: 暴露されたが無傷(上2つ以外の残り)
//
// 実装メモ(計測上の解釈・挙動には無関係):
//  - 計測はゴースト不在ラン限定(playerTraits側のゲート)なので、狙いをロックする技(aimed)の
//    ロック対象は常にプレイヤー=技が解決した時点で暴露1と数える。自己中心でロックを持たない技
//    (g-stomp/g-nova)だけ「危険域内に居たか」を溜め(windup/active)中の距離で判定する。
//  - エピソード終了後も MOVE_REACTION_LINGER_MS の間は「残響」として保持する: 遅延起爆
//    (giantDelayedHits)や飛翔中の咆哮弾など、技のフェーズが終わった後に届くダメージ/反射カウンター
//    をその技に帰属させるため。残響を過ぎて届いた分(例: グレンの血溜まり床の踏み直し)は数えない。
//  - counterのマークは「開いているエピソード全部(無ければ残響中のエピソード)」= §2.9の文言どおり
//    時間窓の帰属(その技"の間"に成立)。hitは技キー付きなのでキー一致で帰属する。
//  - counter/hit が付いたエピソードは暴露も真にする(危険域サンプリングの取りこぼし防止。
//    当たった/構えて弾いた=その技と関わったことが確定しているため)。
import type { Enemy } from '../types/game';

// ---- 技キーの台帳(G2.5のボス×技表=DEVELOPMENT_LOG v0.25.2448 の名称に揃える) -------------------
// G4a対象=城ボス系(giantbat: 通常5技+ステージ技+グレン技)+トール(4技)。G4b(天使/idol/裏ボス)は対象外。
export const MOVE_REACTION_KEYS = [
  'g-stomp', 'g-sweep', 'g-jump', 'g-dash', 'g-bolt',
  'g-trijump', 'g-bite', 'g-slam', 'g-glide', 'g-dive', 'g-quad', 'g-nova', 'g-wing', 'g-sweepbeam',
  'g-talon', 'g-boon', 'g-reach', 'g-nihil',
  'thor-issen', 'thor-tsuki', 'thor-harai', 'thor-jump',
] as const;
export type MoveReactionKey = (typeof MOVE_REACTION_KEYS)[number];
const MOVE_KEY_SET: ReadonlySet<string> = new Set(MOVE_REACTION_KEYS);

/** エピソード終了後もこのms間はhit/counterの帰属先として残す(遅延起爆・飛翔中の弾の着弾を拾う)。 */
export const MOVE_REACTION_LINGER_MS = 2000;

// 自己中心技(狙いロックを持たない)の危険域判定用の複製値。store非依存を保つためgameStore.tsからは
// importせず同じ値を複製する(playerTraits.tsのMELEE_RADIUS_MIRRORと同じ確立済みの作法)。
// g-stompは溜め開始時にステージ倍率込みの実半径が enemy.gStompRadius へ確定するのでそちらを優先。
const GIANT_STOMP_RADIUS_MIRROR = 92;   // = gameStore.GIANT_STOMP_RADIUS
const GIANT_NOVA_RADIUS_END_MIRROR = 400; // = gameStore.GIANT_NOVA_RADIUS_END(輪の最大半径)

// 判定に必要な最小限のEnemyフィールド(テストを軽くするためのPick)。
export type MoveReactionEnemy = Pick<
  Enemy, 'id' | 'type' | 'aiPhase' | 'bossState' | 'x' | 'y' | 'width' | 'height' | 'gStompRadius'
>;

// 自己中心技: 暴露=「この技のこのフェーズ中に半径内へ居たか」。それ以外の技は全てaimed
// (ロック対象=プレイヤー)なので技の解決そのものが暴露になる。
const SELF_EXPOSURE: Partial<Record<MoveReactionKey, {
  phases: readonly string[];
  radius: (e: MoveReactionEnemy) => number;
}>> = {
  'g-stomp': { phases: ['g-stomp-windup'], radius: e => e.gStompRadius ?? GIANT_STOMP_RADIUS_MIRROR },
  'g-nova': { phases: ['g-nova-windup', 'g-nova-active'], radius: () => GIANT_NOVA_RADIUS_END_MIRROR },
};

// ---- 技キーの導出(純関数) ---------------------------------------------------------------------
// giantbat: aiPhase 'g-<move>-...' → 'g-<move>'(例: g-quad-breath-windup → g-quad / g-nihil-chant1 → g-nihil)。
// thor: bossState → thor-issen/tsuki/harai/jump(counter-leap/backstep/orbit-step/chase等は技ではない=null)。
// 名前が他ボスと衝突する状態('harai'等はミゲルも使う)があるため必ずtypeでゲートする。
const GIANT_MOVE_RE = /^g-([a-z]+)/;
const THOR_STATE_TO_MOVE: Readonly<Record<string, MoveReactionKey>> = {
  'issen-windup': 'thor-issen', 'issen-dash': 'thor-issen', 'issen-recover': 'thor-issen',
  'tsuki-windup': 'thor-tsuki', 'tsuki': 'thor-tsuki', 'tsuki-recover': 'thor-tsuki',
  'harai-windup': 'thor-harai', 'harai': 'thor-harai', 'harai-recover': 'thor-harai',
  'jump-windup': 'thor-jump', 'jump-attack': 'thor-jump', 'jump-recover': 'thor-jump',
};

export const moveKeyForEnemy = (
  e: Pick<MoveReactionEnemy, 'type' | 'aiPhase' | 'bossState'>,
): MoveReactionKey | null => {
  if (e.type === 'giantbat' && e.aiPhase) {
    const m = GIANT_MOVE_RE.exec(e.aiPhase);
    if (m) {
      const key = `g-${m[1]}`;
      if (MOVE_KEY_SET.has(key)) return key as MoveReactionKey;
    }
    return null; // 旧スクリプト(?giantscript=0)のwindup/charge等はg-接頭辞が無い=計測対象外
  }
  if (e.type === 'thor' && e.bossState) return THOR_STATE_TO_MOVE[e.bossState] ?? null;
  return null;
};

// 接触ダメージの技キー導出(combatTick.applyContactDamage用): 「体当たりそのものが技のダメージ」の
// フェーズだけ技に帰属させる(突進中/滑空の通過中)。溜め(windup)中や技なし歩行中に体へ触れた
// 被弾は従来どおりの汎用接触=技キーなし。
export const contactDamageMoveKey = (
  e: Pick<MoveReactionEnemy, 'type' | 'aiPhase'>,
): MoveReactionKey | undefined => {
  if (e.type !== 'giantbat') return undefined;
  if (e.aiPhase === 'g-dash-charge') return 'g-dash';
  if (e.aiPhase === 'g-quad-charge') return 'g-quad';
  if (e.aiPhase === 'g-glide-active') return 'g-glide';
  return undefined;
};

// ---- エピソード状態機械 -----------------------------------------------------------------------
export interface MoveEpisode {
  enemyId: string;
  moveKey: MoveReactionKey;
  exposed: boolean;
  countered: boolean;
  hit: boolean;
}
interface PendingEpisode extends MoveEpisode { lingerUntil: number }

export interface MoveReactionTally { exposures: number; counters: number; hits: number }

export interface MoveReactionState {
  open: Record<string, MoveEpisode>;               // enemyId → 進行中のエピソード
  pending: PendingEpisode[];                        // 終了直後の残響(linger)中エピソード
  tally: Partial<Record<MoveReactionKey, MoveReactionTally>>; // セッション集計(確定済みエピソード)
}

export const createMoveReactionState = (): MoveReactionState => ({ open: {}, pending: [], tally: {} });

const foldEpisode = (st: MoveReactionState, ep: MoveEpisode): void => {
  if (!ep.exposed) return; // 暴露なし(遠くで自己中心技が空振り等)は数えない
  const t = st.tally[ep.moveKey] ?? (st.tally[ep.moveKey] = { exposures: 0, counters: 0, hits: 0 });
  t.exposures += 1;
  if (ep.countered) t.counters += 1;       // 優先順位: counter > hit > dodge
  else if (ep.hit) t.hits += 1;
};

const closeEpisode = (st: MoveReactionState, enemyId: string, gameTime: number): void => {
  const ep = st.open[enemyId];
  if (!ep) return;
  delete st.open[enemyId];
  st.pending.push({ ...ep, lingerUntil: gameTime + MOVE_REACTION_LINGER_MS });
};

/** 毎tick1回(playerTraitsのセッションtickから)。エピソードの開閉・自己中心技の暴露・残響の確定を行う。 */
export const stepMoveReactions = (
  st: MoveReactionState,
  enemies: readonly MoveReactionEnemy[],
  player: { x: number; y: number; width: number; height: number },
  gameTime: number,
): void => {
  const pcx = player.x + player.width / 2;
  const pcy = player.y + player.height / 2;
  const pr = Math.max(player.width, player.height) / 2;
  const seen = new Set<string>();
  for (const e of enemies) {
    if (e.type !== 'giantbat' && e.type !== 'thor') continue;
    seen.add(e.id);
    const key = moveKeyForEnemy(e);
    const cur = st.open[e.id];
    if (cur && cur.moveKey !== key) closeEpisode(st, e.id, gameTime); // 技の切り替わり(連携含む)=前の技を確定へ
    if (key && !st.open[e.id]) {
      st.open[e.id] = {
        enemyId: e.id, moveKey: key,
        exposed: SELF_EXPOSURE[key] === undefined, // aimed技はロック対象=プレイヤー(ゴースト不在ラン)=即暴露
        countered: false, hit: false,
      };
    }
    const ep = st.open[e.id];
    if (ep && !ep.exposed) {
      const self = SELF_EXPOSURE[ep.moveKey];
      if (self && e.aiPhase !== undefined && self.phases.includes(e.aiPhase)) {
        const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;
        if (Math.hypot(pcx - ecx, pcy - ecy) <= self.radius(e) + pr) ep.exposed = true;
      }
    }
  }
  // 追跡中の敵が消えた(撃破/リサイクル)=エピソードを閉じて残響へ
  for (const id of Object.keys(st.open)) {
    if (!seen.has(id)) closeEpisode(st, id, gameTime);
  }
  // 残響が切れたエピソードを確定
  if (st.pending.length > 0) {
    const still: PendingEpisode[] = [];
    for (const p of st.pending) {
      if (gameTime >= p.lingerUntil) foldEpisode(st, p);
      else still.push(p);
    }
    st.pending = still;
  }
};

/** カウンター成立(成立7箇所)の通知。開いているエピソード全部(無ければ残響中)にマークする。 */
export const markMoveReactionCounter = (st: MoveReactionState): void => {
  const open = Object.values(st.open);
  const targets: MoveEpisode[] = open.length > 0 ? open : st.pending;
  for (const ep of targets) { ep.countered = true; ep.exposed = true; }
};

/** 技キー付き被弾(damageSourceMove)の通知。キー一致の開いているエピソード(無ければ残響中の最新)にマークする。 */
export const markMoveReactionHit = (st: MoveReactionState, moveKey: string): void => {
  for (const ep of Object.values(st.open)) {
    if (ep.moveKey === moveKey) { ep.hit = true; ep.exposed = true; return; }
  }
  for (let i = st.pending.length - 1; i >= 0; i--) {
    const ep = st.pending[i];
    if (ep.moveKey === moveKey) { ep.hit = true; ep.exposed = true; return; }
  }
  // どのエピソードにも一致しない(残響切れの床ダメージ等)=数えない(実装メモ参照)
};

/** セッション終了時: 開いている/残響中のエピソードを全て確定して集計を返す。 */
export const endMoveReactions = (st: MoveReactionState): MoveReactionState['tally'] => {
  for (const id of Object.keys(st.open)) {
    foldEpisode(st, st.open[id]);
    delete st.open[id];
  }
  for (const p of st.pending) foldEpisode(st, p);
  st.pending = [];
  return st.tally;
};

// ---- プロファイル側のEMA更新 -------------------------------------------------------------------
export interface MoveReactionStat { n: number; counterRate: number; hitRate: number }
/** 保存形。キーはMoveReactionKeyだが、localStorage由来の未知キーも壊さないようstringで持つ。 */
export type MoveReactionTable = Partial<Record<string, MoveReactionStat>>;

/**
 * セッション集計をEMA(α)でプロファイル表へ混ぜる。技ごとに: 初記録(n=0/未登録)はサンプルそのまま、
 * 2回目以降は既存6ノブと同じ per-session EMA。nは暴露回数の累計(n<3フォールバック用=G4b消費側)。
 */
export const blendMoveReactionTable = (
  prev: MoveReactionTable,
  tally: MoveReactionState['tally'],
  alpha: number,
): MoveReactionTable => {
  let changed = false;
  const next: MoveReactionTable = { ...prev };
  for (const key of Object.keys(tally)) {
    const t = tally[key as MoveReactionKey];
    if (!t || t.exposures <= 0) continue;
    changed = true;
    const counterSample = t.counters / t.exposures;
    const hitSample = t.hits / t.exposures;
    const p = prev[key];
    next[key] = (!p || p.n <= 0)
      ? { n: t.exposures, counterRate: counterSample, hitRate: hitSample }
      : {
        n: p.n + t.exposures,
        counterRate: p.counterRate * (1 - alpha) + counterSample * alpha,
        hitRate: p.hitRate * (1 - alpha) + hitSample * alpha,
      };
  }
  return changed ? next : prev;
};
