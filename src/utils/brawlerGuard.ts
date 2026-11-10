// ★格闘の構え(カウンター)が成立した時の効果の決め(research/BRAWLER.md §12-3d・社長指示2026-11-10)。純関数だけ。
//  - 受けた相手が雑魚 → その瞬間に大踏み潰しを代金なしで出す(構えはそこで終わる)。
//  - 雑魚より上(強個体・ボス級・浮かない区分)/相手が分からない → 今の効果に加えて自分が大きくノックバック(構えは続く)。
//  - 間引きに掛かる受け(毎フレーム来る受けの2回目以降)・持続ダメージ → どちらも出さない。
//  - 撃ち続ける光線を受けた → その光線を中断させる(持ち主の更新が「技の終わり」の処理を自分で呼ぶ。下の表)。
// 区分は格闘の当たりと同じ物差し(brawlerCombo の brawlerLiftClass / brawlerComboClass)。ここで作り直さない。
import type { Enemy, EnemyType } from '../types/game';
import { brawlerComboClass, brawlerLiftClass } from './brawlerCombo';

/** 同じ受けとして間引く間隔(ms・実時間)。光線など毎フレーム来る受けの絵・音・効果はこの間隔に1度。 */
export const BRAWLER_GUARD_THROTTLE_MS = 140;
/** 雑魚より上を受けた時に自分が押される距離(px)。格闘のステップ(100px)より大きく=間合いが切れる。 */
export const BRAWLER_GUARD_KNOCK_PX = 150;
/** 押される長さ(ms・ゲーム内の時間)。加速→減速の1山(格闘のステップと同じ形)。 */
export const BRAWLER_GUARD_KNOCK_MS = 280;
/** 相手の位置が自分と重なっている(向きが取れない)とみなす距離(px)。 */
export const BRAWLER_GUARD_KNOCK_MIN_DIST = 8;

/** 受けた相手(分かる範囲で)。id=個体 / type=型(個体が見つからない時の区分に使う)。 */
export interface BrawlerGuardSource { id?: string; type?: EnemyType }
/** 区分。null=浮かない区分(終端の死神)/ undefined=相手が分からない。 */
export type BrawlerGuardClass = 'mob' | 'strong' | 'boss' | null | undefined;
export type BrawlerGuardOutcome = 'stomp' | 'knockback' | 'none';

type ClassEnemy = Pick<Enemy, 'id' | 'type' | 'colorTier' | 'reaperChaser'>;

/** 受けた相手1件の区分。個体が居ればその個体(赤い個体=強個体・終端の死神=null)、居なければ型、どちらも無ければ不明。 */
export const brawlerGuardSourceClass = (src: BrawlerGuardSource, enemies: readonly ClassEnemy[]): BrawlerGuardClass => {
  const e = src.id !== undefined ? enemies.find(en => en.id === src.id) : undefined;
  if (e) return brawlerLiftClass(e);
  return src.type !== undefined ? brawlerComboClass(src.type) : undefined;
};

/**
 * 成立の効果。
 *  - throttled(間引きに掛かった受け)・dot(持続ダメージ)= 'none'。
 *  - 受けた相手が全員雑魚 = 'stomp'。
 *  - それ以外(強個体・ボス級・浮かない区分・不明が1件でも混じる/相手が1件も無い)= 'knockback'(ハメを残さない側)。
 */
export const brawlerGuardOutcome = (o: { throttled: boolean; dot?: boolean; classes: readonly BrawlerGuardClass[] }): BrawlerGuardOutcome => {
  if (o.throttled || o.dot) return 'none';
  return o.classes.length > 0 && o.classes.every(c => c === 'mob') ? 'stomp' : 'knockback';
};

/**
 * 押される向き(長さ1)。相手から離れる向き → 相手が重なっていれば受けた点から離れる向き → それも取れなければ向いている方の逆。
 */
export const brawlerGuardKnockDir = (
  pc: { x: number; y: number }, from: { x: number; y: number } | null, hit: { x: number; y: number },
  facing: { x: number; y: number } | null | undefined,
): { x: number; y: number } => {
  for (const q of [from, hit]) {
    if (!q) continue;
    const dx = pc.x - q.x, dy = pc.y - q.y, d = Math.hypot(dx, dy);
    if (d >= BRAWLER_GUARD_KNOCK_MIN_DIST) return { x: dx / d, y: dy / d };
  }
  const fl = facing ? Math.hypot(facing.x, facing.y) : 0;
  return facing && fl > 1e-6 ? { x: -facing.x / fl, y: -facing.y / fl } : { x: -1, y: 0 };
};

// ---------------------------------------------------------------------------------------------
// 光線の中断(社長指示2026-11-10「光線防いだら中断させたい。じゃないと必ず食らって意味ない」)
// ---------------------------------------------------------------------------------------------
/**
 * ★構えで受けると中断する光線の表(=撃ち続けている間、毎フレーム判定が出る光線)。
 *  field/state = 撃っている最中の状態 / moves = その光線の被弾の技キー(damagePlayer の damageSourceMove)/
 *  rest = 中断で移る先(その型の「普通に終わった時」と同じ処理。持ち主の更新が takeBrawlerBeamCut を満了の条件へ足している)。
 * 新しい光線を足したら: ①ここへ1行 ②その更新の満了の条件へ takeBrawlerBeamCut を足す(brawlerGuard.test.ts が漏れを止める)。
 * ※1回の命中で終わる光線(城ボスの三連射・天使の槍など pumpkinBlasts の beam 印)は撃ち続けない=中断するものが無いので載せない。
 */
export const BRAWLER_CUT_BEAMS: readonly { field: 'bossState' | 'aiPhase'; state: string; moves: readonly string[]; who: string; rest: string }[] = [
  { field: 'bossState', state: 'laser-fire', moves: ['mimir-laser', 'br-laser'], who: 'ミーミル/バス停のレーザー', rest: 'laser-recover(ミーミルの旧挙動は chase)' },
  { field: 'bossState', state: 'wheel-fire', moves: ['mimir-wheel'], who: 'ミーミルの回る光輪', rest: 'wheel-recover' },
  { field: 'bossState', state: 'ring-active', moves: ['suriel-ring'], who: 'スリエルの環の射出', rest: 'ring-recover' },
  { field: 'bossState', state: 'idol-snipe', moves: ['idol-snipe'], who: 'アイドルの狙撃', rest: 'idol-snipe-recover' },
  { field: 'bossState', state: 'bm-snipe', moves: ['bm-snipe'], who: '賞金首(近接)の懲罰狙撃', rest: 'bm-snipe-recover' },
  { field: 'aiPhase', state: 'g-sweepbeam-active', moves: ['g-sweepbeam'], who: '城ボス(ステージ5)の掃射', rest: 'g-sweepbeam-recover' },
];
const BEAM_MOVES = new Set(BRAWLER_CUT_BEAMS.flatMap(b => b.moves));

/** その被弾の技キーは撃ち続ける光線か(damagePlayer 経由の受け=光線の縁が体に触れた時)。 */
export const isBrawlerBeamMove = (moveKey: string | undefined): boolean => moveKey !== undefined && BEAM_MOVES.has(moveKey);

/** その敵はいま光線を撃っている最中か(=中断してよい状態)。溜め・休み・気絶の間は false。 */
export const isBrawlerBeamFiring = (e: Pick<Enemy, 'bossState' | 'aiPhase'>): boolean =>
  BRAWLER_CUT_BEAMS.some(b => (b.field === 'bossState' ? e.bossState : e.aiPhase) === b.state);

/**
 * 中断する相手の id。beam=光線の受け(盾としての受け kind 'beam' か、上の技キー)の時だけ。
 * 受けた相手のうち、個体が分かればその個体・分からなければ同じ型で、いま光線を撃っている最中の1体。居なければ null(=中断しない)。
 */
export const brawlerBeamCutTarget = (
  beam: boolean, sources: readonly BrawlerGuardSource[],
  enemies: readonly (Pick<Enemy, 'id' | 'type' | 'bossState' | 'aiPhase'>)[],
): string | null => {
  if (!beam) return null;
  for (const s of sources) {
    const e = s.id !== undefined
      ? enemies.find(en => en.id === s.id)
      : s.type !== undefined ? enemies.find(en => en.type === s.type && isBrawlerBeamFiring(en)) : undefined;
    if (e && isBrawlerBeamFiring(e)) return e.id;
  }
  return null;
};

/** 中断の合図が生きている長さ(ms・ゲーム内の時間)。持ち主の更新はふつう同じフレームか次のフレームに読む。 */
export const BRAWLER_BEAM_CUT_GRACE_MS = 300;
/** 合図(受けた時刻 at)は、いま(gameTime)の光線に対するものか。古い合図(その光線が別の理由で先に終わった)は次の光線を切らない。 */
export const brawlerBeamCutValid = (at: number, gameTime: number): boolean => Math.abs(gameTime - at) <= BRAWLER_BEAM_CUT_GRACE_MS;

/**
 * 受けた相手のうち、位置が引ける1体(押される向きの基準)。個体が分かればその個体、型だけなら同じ型で一番近い1体。居なければ null。
 * (ミーミルのレーザーの被弾などは型だけが届く=型で引かないと「相手から離れる向き」が取れない。)
 */
export const brawlerGuardSourceEnemy = <E extends Pick<Enemy, 'id' | 'type' | 'x' | 'y' | 'width' | 'height'>>(
  sources: readonly BrawlerGuardSource[], enemies: readonly E[], pc: { x: number; y: number },
): E | null => {
  for (const s of sources) {
    if (s.id !== undefined) {
      const e = enemies.find(en => en.id === s.id);
      if (e) return e;
    }
    if (s.type !== undefined) {
      let best: E | null = null, bd = Infinity;
      for (const en of enemies) {
        if (en.type !== s.type) continue;
        const d = Math.hypot(en.x + en.width / 2 - pc.x, en.y + en.height / 2 - pc.y);
        if (d < bd) { bd = d; best = en; }
      }
      if (best) return best;
    }
  }
  return null;
};

/**
 * スローで「進まなかった」実時間(ms)。simDtSec=このフレームにゲーム内で進んだ秒 / scale=スローの倍率(0<scale≤1・1=等速)。
 * 構えで押される動き(器の時計は実時間)が、成立のスローの間も決めた距離を押され切るように、期限をこの分だけ後ろへずらす。
 */
export const slowLostMs = (simDtSec: number, scale: number): number =>
  scale >= 1 || !(scale > 0) ? 0 : Math.max(0, simDtSec) * 1000 * (1 / scale - 1);
/**
 * 押される動きの器の期限(実時間)を、スローで進まなかった分だけ後ろへずらした値。
 * ずらした後も「いまから器の長さ」を超えない(=押しの始まりが後ろへ逃げない)。受けた回は、ループがスローの掛かる前の刻みで
 * 移動を呼ぶことがある(その回の刻みは等速・こちらが読む倍率はもうスロー)ので、そのずれで押しの出だしが遅れないように頭を打つ。
 */
export const brawlerPushUntil = (until: number, now: number, ms: number, simDtSec: number, scale: number): number =>
  Math.min(until + slowLostMs(simDtSec, scale), now + Math.max(0, ms));
