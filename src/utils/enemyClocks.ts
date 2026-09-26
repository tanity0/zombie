// ★PACING_PUZZLE.md §16-H(社長指示2026-09-19「硬直中は全ての時計が止まる」)。
//
// 規則(1文): **敵が「硬直」にいる間、その敵の攻撃・行動の時計は1msも進まない。硬直が明けた
// 瞬間に、その時点を0としてCDが始まる。**
//
// ★方式(§16-H H-3・v1の「毎フレーム dtMs を足す」は破棄済み。復活させないこと):
//   ①硬直に**入った瞬間**に、行動の時計を「残り(期限型)/経過(始点型)」へ畳んで預かる。
//   ②硬直**中**は、その預かりから **毎フレーム絶対値で書き直す**(= `いまの時刻 + 残り`)。
//     **足し算を1度もしない**ので、`updateEnemies(deltaTime * MOVE_SPEED_MULT)` と
//     `gameTime += deltaTime*1000` の 1.2倍ズレ(H-1④)・丸め・二重加算・順序依存が全部消える。
//   ③硬直が**明けた瞬間**に同じ式でもう一度書き直し、預かりを捨てる。
//   ⇒ 「入った時の残り == 明けた後の残り」が不変条件(受け入れ条件がそのままテストになる)。
//
// ★外から書かれた時計は**相手が勝つ**。預かった値は「自分が最後に書いた値」と一致する間だけ
// 自分のもので、誰かが別の値を書いたら(例: 気絶リセットの `aiReadyAt = gameTime + 300`、
// 賞金首/天使コントローラが硬直中に押し出す `bossNextActionAt`)その新しい値から預かり直す。
// これが無いと、硬直中に書かれた新しいCDを硬直明けの書き戻しが**消してしまう**。
import type { Enemy, EnemyClockStash } from '../types/game';
import { isEnemyAttacking } from './combatFeel';

/** 期限型(`*Until`/`*ReadyAt`=残りで測る)か、始点型(`*At`=経過で測る)か。 */
export type ClockKind = 'deadline' | 'start';
/** gameTime系か Date.now系か(混ぜると slow-mo/ポーズで量が合わない)。 */
export type ClockBase = 'game' | 'now';

export interface EnemyClockEntry {
  /** Enemy のフィールド名。`map: true` なら値(Record)を全部畳む。 */
  field: string;
  kind: ClockKind;
  base: ClockBase;
  /** `Partial<Record<..., number>>` 型のフィールド(`gStageReadyAt` 等)。 */
  map?: boolean;
  /** 0 を「未設定」の合図に使うフィールド(`biteAt`)。 */
  zeroIsUnset?: boolean;
  /**
   * ★除外2(相依存): **この相の間だけ**、このフィールドは「硬直そのものの期限」なので触らない。
   * 外し忘れると硬直が永久に明けない(=パンプキンが着地したまま二度と立たない)。
   */
  excludeWhen?: (e: Enemy) => boolean;
}

/**
 * ★技後の硬直相か(§16-H H-4(a))。名前の配列ではなく**綴りの規則**で見る——
 * 相は `-recover` で終わるのが全型共通の作法で、例外だけを下の集合に置く。
 * `*-retreat`(後退)は移動であって硬直ではないので**含めない**。
 */
const RECOVER_HOLD_EXTRA: ReadonlySet<string> = new Set([
  'recover',      // パンプキン/ハンター系のジャンプ着地硬直
  'z-stagger',    // ゾンビ赤2連の1発目→2発目の間のよろけ
  'b-release',    // batの掴みを「一拍留まる」
]);
export const isRecoverHoldPhase = (phase: string | undefined): boolean =>
  phase !== undefined && (phase.endsWith('-recover') || RECOVER_HOLD_EXTRA.has(phase));

/**
 * ★「凍結か?」の述語(§16-H H-3)。**実装が実際に止めている条件と同じ式**にする——
 * フィールドが立っている=凍結、にすると技を実行中の個体まで凍り、溜めが終わらず赤い予告が
 * 止まったままになる(2026-09-17に直した事故の再来)。
 *
 * 含める: (a)技後の硬直相 (b)噛みつき直後の硬直 (c)被弾硬直 (d)気絶/紫 (e)拘束・持ち上げ。
 * 含めない: (f)ノックバック(社長裁定2026-09-19=「銃撃では攻撃は何も止まらない」と揃える)。
 */
export const isEnemyFrozenForClocks = (e: Enemy, gameTime: number, nowMs: number): boolean => {
  // committed = 中断不可の実行中(空中ジャンプ・ダッシュ突進)。updateEnemies と同じ定義。
  const committed = e.aiPhase === 'jump' || e.aiPhase === 'charge';
  // (d)紫(完全気絶)は committed でも止まる。
  if (e.bossFullStunUntil !== undefined && gameTime < e.bossFullStunUntil) return true;
  // (d)気絶
  if (!committed && e.stunUntil !== undefined && gameTime < e.stunUntil) return true;
  // (e)拘束(技の発動中はすり抜ける=updateEnemies の `&& !enemy.aiPhase` と同じ)
  if (e.rootUntil !== undefined && gameTime < e.rootUntil && e.aiPhase === undefined) return true;
  // (e)持ち上げ(Date.now系)
  if (!committed && e.liftUntil !== undefined && nowMs < e.liftUntil) return true;
  // (c)被弾硬直(攻撃中スーパーアーマー=技を出している個体は止まらない・Date.now系)
  if (!committed && e.hitStunUntil !== undefined && nowMs < e.hitStunUntil
    && !isEnemyAttacking(e, gameTime)) return true;
  // (b)噛みつき直後の硬直(§16の技は専用の硬直相を持つので掛けない=updateEnemies と同じ式)
  if (!committed && e.chaffMove === undefined
    && e.biteRecoverUntil !== undefined && gameTime < e.biteRecoverUntil) return true;
  // (a)技後の硬直相(雑魚の aiPhase / ボスの bossState)。
  // ★**「留まっている間」だけ**(H-4 (a)「…/ `b-release` の留まり / …」)。`b-release` は
  // 留まり(`aiPhaseUntil` まで)が明けた後も同じ相のまま**後ずさる**——そこは移動であって硬直では
  // ないので凍らせない。他の `-recover` 相は期限切れと同じフレームに次の相へ移るので、この
  // 追加条件は1bitも効かない(b-release だけに効く)。
  if (isRecoverHoldPhase(e.aiPhase)
    && (e.aiPhaseUntil === undefined || gameTime < e.aiPhaseUntil)) return true;
  if (isRecoverHoldPhase(e.bossState)
    && (e.bossStateUntil === undefined || gameTime < e.bossStateUntil)) return true;
  return false;
};

/**
 * ★台帳(§16-H H-3)。**名前だけの配列にしない**——同じ名前が場面によって「行動の時計」にも
 * 「硬直の期限」にもなるため、相依存の除外(`excludeWhen`)を持つ行にする。
 *
 * ★ここに**入れないもの**(理由つき):
 *  - 除外1(硬直そのものの期限): `stunUntil` / `bossFullStunUntil` / `hitStunUntil` /
 *    `biteRecoverUntil` / `rootUntil` / `liftUntil` / `knockbackUntil`。入れると硬直が明けない。
 *  - 除外3(予告済みの命中予約): `giantDelayedHits[].fireAt/bornAt` / `lanceLanterns[].estFireAt` /
 *    acrasielSpears の `fireAt` / `punisherPendingAt` / `glenVolleyAt` / `bossBurstNextAt` /
 *    `gpPendingSwingAt`。ずらすと**赤が消えたのに当たる**(★★赤い予告の掟③破り)。
 *    ★`lichWarpAt`(§16-B B-5の転移予約)も同じ理由でここ: **硬直(b)の終わりを待ち時間として
 *    予約済み**(`gameTime + BITE_RECOVER_STILL_MS` を硬直の開始と同じフレームに書く)なので、
 *    据え置くと硬直ぶんを二重に数えて転移が毎回350ms遅れる。気絶/拘束/持ち上げでは取り消される。
 *  - 行動の時計ではないもの: プレイヤー由来の状態異常(`burnUntil`/`iceSlowUntil`/`gravitySlowUntil`/
 *    `bossSlowUntil`/`bombPunishUntil`/`ghostHateUntil`)・DoTの打刻(`lastBurnTickAt`/
 *    `lastSpikeHitAt`/`lastFireHitAt`)・体勢値/DR/無敵の窓(`bossPostureLockUntil`/
 *    `bossPostureLastDamageAt`/`bossStopDrLastAt`/`bossStopDrImmuneUntil`/`knockbackImmuneUntil`/
 *    `knockbackShoveUntil`/`acrasielCounterLockUntil`/`issenGuaranteedUntil`)・描画専用の打刻
 *    (`lastContactAttackAt`/`meleeHitAt`/`gpSwingAt`/`gpShotAt`/`bossPhaseFlashUntil`/
 *    `giantPhaseFlashUntil`/`lichWarpDoneAt`)・進行/退場の管理(`corpseUntil`/`spawnedAt`/
 *    `bountyLastEngagedAt`/`bountyDepartAt`/`hunterLeavingAt`/`lastCounteredAt`/`lastRangedShotAt`)。
 */
export const ENEMY_ACTION_CLOCKS: readonly EnemyClockEntry[] = [
  // ---- 雑魚・共通 ------------------------------------------------------------------------------
  // ★除外2: `recover` 系の相にいる間は、これ自体が硬直(a)の期限。
  { field: 'aiPhaseUntil', kind: 'deadline', base: 'game', excludeWhen: e => isRecoverHoldPhase(e.aiPhase) },
  { field: 'aiReadyAt', kind: 'deadline', base: 'game' },
  { field: 'biteReadyAt', kind: 'deadline', base: 'game' },
  { field: 'chaffMoveCdUntil', kind: 'deadline', base: 'game' },
  { field: 'drillerRetreatUntil', kind: 'deadline', base: 'game' },
  { field: 'screamNextAt', kind: 'deadline', base: 'game' },
  { field: 'eggLayAt', kind: 'deadline', base: 'game' },
  { field: 'hunterWanderNextAt', kind: 'deadline', base: 'game' },
  { field: 'biteAt', kind: 'start', base: 'game', zeroIsUnset: true },
  { field: 'chaffMoveAt', kind: 'start', base: 'game' },
  { field: 'aiStartedAt', kind: 'start', base: 'game' },
  { field: 'zombieWalkRampAt', kind: 'start', base: 'game' },
  // ---- 城ボス(ジャイアント/グレン) ------------------------------------------------------------
  { field: 'gbJumpReadyAt', kind: 'deadline', base: 'game' },
  { field: 'gbDashReadyAt', kind: 'deadline', base: 'game' },
  { field: 'gStompReadyAt', kind: 'deadline', base: 'game' },
  { field: 'gSweepReadyAt', kind: 'deadline', base: 'game' },
  { field: 'gJumpReadyAt', kind: 'deadline', base: 'game' },
  { field: 'gDashReadyAt', kind: 'deadline', base: 'game' },
  { field: 'gBoltReadyAt', kind: 'deadline', base: 'game' },
  { field: 'gTailVolleyAt', kind: 'deadline', base: 'game' },
  { field: 'gStageReadyAt', kind: 'deadline', base: 'game', map: true },
  { field: 'gGlenReadyAt', kind: 'deadline', base: 'game', map: true },
  // ---- ボス共通(裏ボス4体/天使6体/トール/賞金首4体/アイドル) --------------------------------
  // ★除外2: `-recover` の州にいる間は、これ自体が硬直(a)の期限。
  { field: 'bossStateUntil', kind: 'deadline', base: 'game', excludeWhen: e => isRecoverHoldPhase(e.bossState) },
  { field: 'bossNextActionAt', kind: 'deadline', base: 'game' },
  { field: 'bossOpeningHoldAt', kind: 'deadline', base: 'game' },
  { field: 'bossWindupStartAt', kind: 'start', base: 'game' },
  { field: 'acrasielStateAt', kind: 'start', base: 'game' },
  { field: 'mDashReadyAt', kind: 'deadline', base: 'game' },
  { field: 'jConsecrateReadyAt', kind: 'deadline', base: 'game' },
  { field: 'rSweepReadyAt', kind: 'deadline', base: 'game' },
  { field: 'mimirBiteReadyAt', kind: 'deadline', base: 'game' },
  { field: 'mimirLaserReadyAt', kind: 'deadline', base: 'game' },
  { field: 'jormCoilReadyAt', kind: 'deadline', base: 'game' },
  { field: 'skadiCageReadyAt', kind: 'deadline', base: 'game' },
  { field: 'thorDashReadyAt', kind: 'deadline', base: 'game' },
  // ---- 守護霊ボス「幻影」 ----------------------------------------------------------------------
  { field: 'gpParryCdUntil', kind: 'deadline', base: 'game' },
  { field: 'gpLastSubUseAt', kind: 'start', base: 'now' },
];

/** 浮動小数の一致判定(自分が書いた値かどうかの照合用)。 */
const EPS = 1e-6;

interface SlotResult { rem: number; next: number; mine: boolean }

/**
 * 1スロット(スカラー or マップの1キー)の解決。
 * `held` が「自分が最後に書いた値」と一致すればそれを持ち越し、違えば**今の値から預かり直す**。
 */
const resolveSlot = (
  cur: number, kind: ClockKind, t: number, prevT: number, held: number | undefined,
): SlotResult => {
  if (held !== undefined) {
    const expected = kind === 'deadline' ? prevT + held : prevT - held;
    if (Math.abs(cur - expected) <= EPS) {
      return { rem: held, next: kind === 'deadline' ? t + held : t - held, mine: true };
    }
  }
  const rem = kind === 'deadline' ? cur - t : t - cur;
  return { rem, next: cur, mine: false };
};

/**
 * ★毎フレーム1回、**全ての敵**に対して呼ぶ(`updateEnemies` の前処理)。返り値は差分パッチ
 * (変更が無ければ null)。凍結中は時計を据え置き、明けた瞬間に「その時点 + 残り」で書き直す。
 */
export const tickEnemyClockFreeze = (
  e: Enemy, gameTime: number, nowMs: number,
): Partial<Enemy> | null => {
  const frozen = isEnemyFrozenForClocks(e, gameTime, nowMs);
  const stash = e.frozenClocks;
  if (!frozen && stash === undefined) return null;
  const prevG = stash?.gAt ?? gameTime;
  const prevN = stash?.nAt ?? nowMs;
  const rem: Record<string, number> = {};
  const patch: Record<string, unknown> = {};

  for (const entry of ENEMY_ACTION_CLOCKS) {
    if (entry.excludeWhen !== undefined && entry.excludeWhen(e)) continue;
    const t = entry.base === 'game' ? gameTime : nowMs;
    const prevT = entry.base === 'game' ? prevG : prevN;
    const raw = (e as unknown as Record<string, unknown>)[entry.field];
    if (entry.map) {
      if (raw === undefined || raw === null || typeof raw !== 'object') continue;
      const src = raw as Record<string, number | undefined>;
      let out: Record<string, number | undefined> | undefined;
      for (const k of Object.keys(src)) {
        const cur = src[k];
        if (typeof cur !== 'number') continue;
        const key = `${entry.field}.${k}`;
        const r = resolveSlot(cur, entry.kind, t, prevT, stash?.rem[key]);
        if (frozen) rem[key] = r.rem;
        if (r.mine && r.next !== cur) {
          out = out ?? { ...src };
          out[k] = r.next;
        }
      }
      if (out !== undefined) patch[entry.field] = out;
      continue;
    }
    if (typeof raw !== 'number') continue;
    if (entry.zeroIsUnset === true && raw === 0) continue;
    const key = entry.field;
    const r = resolveSlot(raw, entry.kind, t, prevT, stash?.rem[key]);
    if (frozen) rem[key] = r.rem;
    if (r.mine && r.next !== raw) patch[key] = r.next;
  }

  const nextStash: EnemyClockStash | undefined = frozen
    ? { gAt: gameTime, nAt: nowMs, rem } : undefined;
  patch.frozenClocks = nextStash;
  return patch as Partial<Enemy>;
};

// =================================================================================================
// ★Enemy に無い時計(§16-H H-3「コントローラのモジュール状態」)。台帳は届かないので、
// 各コントローラが自分の状態を1本のフックで預ける。仕組みは上と完全に同じ(絶対値で書き直す)。
// =================================================================================================

/** モジュール状態の1本の時計。`get`/`set` で持ち主の中身を読み書きする。 */
export interface ModuleClockSlot {
  key: string;
  kind: ClockKind;
  base: ClockBase;
  get: () => number | undefined;
  set: (v: number) => void;
}

/** 預かり袋の置き場(各コントローラの state に `clockFreeze?:` として持たせる)。 */
export interface ModuleClockHolder {
  clockFreeze?: EnemyClockStash;
}

/**
 * ★コントローラのモジュール状態版。`frozen` は `isEnemyFrozenForClocks` の結果をそのまま渡す
 * (述語を各所で作り直さない)。凍結中は据え置き、明けた瞬間に書き直して預かりを捨てる。
 */
export const tickModuleClockFreeze = (
  holder: ModuleClockHolder, slots: readonly ModuleClockSlot[],
  frozen: boolean, gameTime: number, nowMs: number,
): void => {
  const stash = holder.clockFreeze;
  if (!frozen && stash === undefined) return;
  const prevG = stash?.gAt ?? gameTime;
  const prevN = stash?.nAt ?? nowMs;
  const rem: Record<string, number> = {};
  for (const slot of slots) {
    const cur = slot.get();
    if (typeof cur !== 'number') continue;
    const t = slot.base === 'game' ? gameTime : nowMs;
    const prevT = slot.base === 'game' ? prevG : prevN;
    const r = resolveSlot(cur, slot.kind, t, prevT, stash?.rem[slot.key]);
    if (frozen) rem[slot.key] = r.rem;
    if (r.mine && r.next !== cur) slot.set(r.next);
  }
  holder.clockFreeze = frozen ? { gAt: gameTime, nAt: nowMs, rem } : undefined;
};
