// ボットの「上手さ」を段階式にする層(社長指示v0.25.2338)。
//
// 狙い: **プレイヤーの腕前を段階で再現する**。ペルソナ(何をしたがるか=standard/kiter/boar…)とは
// 直交した軸で、「どれだけ速く反応し、どれだけ避け、どれだけ賢く狙うか」だけをここで決める。
// これができると、サブクエの閾値・ガチャの収入曲線・エリア難易度を**推測ではなく実測**で詰められる。
//
// 設計の掟:
// - この層は**純関数だけ**(store/React/PixiJS非依存)。ヘッドレスでテストできる。
// - **既定(casual)は現状の挙動と同値**。既存のボットラン/テストの結果を動かさない。
// - ペルソナの設計意図は壊さない(例: rusher=「カウンターしない低スキル再現」は段階を上げても
//   カウンターしない)。段階は**ペルソナが持つ能力の質**を上下させるだけで、能力を増やさない。
import type { Enemy, Projectile, InputState } from '../types/game';

/** 腕前の段階。casual = 現状のボット相当(既定)。 */
export type BotSkill = 'novice' | 'casual' | 'skilled' | 'master';
export const BOT_SKILLS: BotSkill[] = ['novice', 'casual', 'skilled', 'master'];
export const DEFAULT_BOT_SKILL: BotSkill = 'casual';

/** 回避の段階。上の段は下の段を含む。 */
export type DodgeLevel = 'none' | 'projectile' | 'aoe' | 'all';
/** 標的選択の段階。 */
export type TargetingMode = 'nearest' | 'weakest' | 'threat' | 'optimal';

export interface BotSkillProfile {
  /** 脅威検知から行動までの遅延(ms)。人間の反応速度。 */
  reactionMs: number;
  /** 検知1回あたりのカウンター試行確率(0..1)。人間の見逃し。 */
  counterChance: number;
  /** どこまで避けるか。 */
  dodge: DodgeLevel;
  /** 誰を狙うか。 */
  targeting: TargetingMode;
  /** 「囲まれた」と判断する周囲の敵数。**小さいほど早く危険を察知する**。 */
  surroundCount: number;
  /**
   * この割合を下回ったら交戦を切り上げる(旧 retreatHpFrac・PACING_PUZZLE.md §6.25改訂で置換)。
   * **旧フィールドは向きが逆だった**(master=0.5=上手いほど早く逃げる=退避側に偏っていた)。
   * このゲームの「上手い」は捌く速さを含むため、**上手いほど粘る**(master=0.2)へ反転させてある。
   */
  disengageHp: number;
  /** 回避入力の強さ(0..1)。1=脅威から全力で離れる。低い段は迷って半端に動く。 */
  dodgeStrength: number;
  /** どこまで敵を追って倒しに行くか(px)。§6.25改訂「攻撃側のダイヤル」。 */
  engageDist: number;
  /** 回避と攻撃が競合した時の優先度(0=攻撃優先 / 1=回避優先)。§6.25改訂。 */
  dodgeVsAttack: number;
  /** 危険な敵(§6.25 M49-1)に対して保つ最低距離(px)。0=距離を意識しない。 */
  avoidContactDist: number;
  /** 危険な敵に対しても近接(カウンター)を試みるか。false=危険敵には近接を諦める(M49-2)。 */
  meleeVsDanger: boolean;
  /** 敵のワープ(瞬間移動)を検知して離れるか(M49-3)。 */
  warpReact: boolean;
  /** レベルアップ時の強化選択ポリシー(M49-4)。 */
  upgradePolicy: 'random' | 'greedy';
}

// 段階表(叩き台・実機とソークで調整する)。
// **casual は現状のボット(standardのCOUNTER_REACTION_PROFILES=250ms/0.65、SURROUND_COUNT=3、
// 回避なし、最寄り狙い)と同値**にしてある。ここを動かすと既存の実測値と比較できなくなる。
// avoidContactDist/meleeVsDanger/warpReact/upgradePolicy は novice/casual で明示的に no-op 値
// (0/true/false/random)を入れてあり、**この4つは本バッチでnovice/casualの挙動を変えない**。
// disengageHp/engageDist/dodgeVsAttack は §6.25改訂で新設された「攻撃側のダイヤル」で、
// 旧 retreatHpFrac(novice/casual=0=退避しない)の反転を含め、novice/casualにも実測値が入る
// (novice>casualの逆転を正すための意図的な変更・PACING_PUZZLE.md ★未決参照)。
export const BOT_SKILL_PROFILES: Record<BotSkill, BotSkillProfile> = {
  novice:  { reactionMs: 500, counterChance: 0.25, dodge: 'none',       targeting: 'nearest', surroundCount: 5, disengageHp: 0.5, dodgeStrength: 0,
             engageDist: 200, dodgeVsAttack: 0.5,  avoidContactDist: 0,   meleeVsDanger: true,  warpReact: false, upgradePolicy: 'random' },
  casual:  { reactionMs: 250, counterChance: 0.65, dodge: 'none',       targeting: 'nearest', surroundCount: 3, disengageHp: 0.4, dodgeStrength: 0,
             engageDist: 260, dodgeVsAttack: 0.5,  avoidContactDist: 0,   meleeVsDanger: true,  warpReact: false, upgradePolicy: 'random' },
  skilled: { reactionMs: 150, counterChance: 0.85, dodge: 'projectile', targeting: 'threat',  surroundCount: 3, disengageHp: 0.3, dodgeStrength: 0.7,
             engageDist: 340, dodgeVsAttack: 0.4,  avoidContactDist: 160, meleeVsDanger: false, warpReact: true,  upgradePolicy: 'greedy' },
  master:  { reactionMs: 80,  counterChance: 1.0,  dodge: 'all',        targeting: 'optimal', surroundCount: 2, disengageHp: 0.2, dodgeStrength: 1,
             engageDist: 420, dodgeVsAttack: 0.25, avoidContactDist: 160, meleeVsDanger: false, warpReact: true,  upgradePolicy: 'greedy' },
};

export const botSkillProfile = (skill: BotSkill = DEFAULT_BOT_SKILL): BotSkillProfile =>
  BOT_SKILL_PROFILES[skill] ?? BOT_SKILL_PROFILES[DEFAULT_BOT_SKILL];

/** 文字列(URLパラメータ等)を安全に段階へ。未知の値は既定へ落とす。 */
export const parseBotSkill = (v: string | null | undefined): BotSkill =>
  (BOT_SKILLS as string[]).includes(v ?? '') ? (v as BotSkill) : DEFAULT_BOT_SKILL;

// ---------------------------------------------------------------------------
// 回避(dodge): 「避けられる攻撃は避ける」。カウンター(反撃)とは別系統で、**位置で避ける**。

/** 回避の対象になる脅威と、そこから逃げる向き。 */
export interface DodgeThreat {
  kind: 'projectile' | 'jump' | 'charge' | 'contact';
  /** 逃げるべき単位ベクトル。 */
  ux: number;
  uy: number;
  /** 危険度(0..1)。近い/速いほど大きい。合成時の重みになる。 */
  weight: number;
}

/** 弾を避け始める距離(px)。カウンター判定(160)より広く取る=避ける方が早く動き出す。 */
export const DODGE_PROJECTILE_DIST = 220;
/** 着弾/突進を避け始める距離(px)。 */
export const DODGE_AOE_DIST = 240;
/** 着弾点から離れたい最小距離(px)。 */
export const DODGE_AOE_SAFE_R = 120;

const norm = (x: number, y: number): [number, number] => {
  const l = Math.hypot(x, y);
  return l < 0.0001 ? [0, 0] : [x / l, y / l];
};

/**
 * 飛んでくる弾から「横に逃げる」向きを出す。正面に対して直角へ、弾の進行方向と逆側へ。
 * 真後ろへ下がっても弾速には勝てないので、**必ず横に外す**のが正解になる。
 */
export const projectileDodge = (pcx: number, pcy: number, p: Projectile): DodgeThreat | null => {
  if (!p.hostile) return null;
  const cx = p.x + p.width / 2, cy = p.y + p.height / 2;
  const dx = pcx - cx, dy = pcy - cy;
  const d = Math.hypot(dx, dy);
  if (d >= DODGE_PROJECTILE_DIST || d < 0.0001) return null;
  // 自分へ近づいているか(離れていく弾は無視)。
  const closing = p.direction.x * (dx / d) + p.direction.y * (dy / d);
  if (closing <= 0.2) return null;
  // 弾の進行方向に対する自分の横ずれ量。ずれている側へさらに逃げる(戻る方向へ行かない)。
  const [hx, hy] = norm(p.direction.x, p.direction.y);
  const cross = (-hy) * dx + hx * dy; // 左法線との内積の符号で「どちら側に居るか」
  const sign = cross >= 0 ? 1 : -1;
  const ux = -hy * sign, uy = hx * sign;
  return { kind: 'projectile', ux, uy, weight: Math.max(0, 1 - d / DODGE_PROJECTILE_DIST) * closing };
};

/**
 * ジャンプ攻撃の着地点(AoE)から放射状に逃げる向き。着地円の外へ出るのが正解。
 */
export const jumpDodge = (pcx: number, pcy: number, e: Enemy): DodgeThreat | null => {
  if (e.aiPhase !== 'jump') return null;
  const tx = e.aiTargetX ?? e.x, ty = e.aiTargetY ?? e.y;
  const dx = pcx - tx, dy = pcy - ty;
  const d = Math.hypot(dx, dy);
  if (d >= DODGE_AOE_DIST) return null;
  const [ux, uy] = d < 0.0001 ? [1, 0] : norm(dx, dy); // 真上に居るなら適当な向きへ退く
  return { kind: 'jump', ux, uy, weight: Math.max(0, 1 - d / Math.max(1, DODGE_AOE_SAFE_R)) };
};

/**
 * 突進してくる敵の進行線から横へ外れる向き。正面から下がらず、線から降りる。
 */
export const chargeDodge = (pcx: number, pcy: number, e: Enemy): DodgeThreat | null => {
  if (e.aiPhase !== 'charge') return null;
  const hvx = e.vx ?? 0, hvy = e.vy ?? 0;
  const [hx, hy] = norm(hvx, hvy);
  if (hx === 0 && hy === 0) return null;
  const tpx = pcx - e.x, tpy = pcy - e.y;
  const d = Math.hypot(tpx, tpy);
  if (d >= DODGE_AOE_DIST || d < 0.0001) return null;
  const dot = hx * (tpx / d) + hy * (tpy / d);
  if (dot < 0.3) return null; // 自分へ向いていない突進は避けない
  const cross = (-hy) * tpx + hx * tpy;
  const sign = cross >= 0 ? 1 : -1;
  return { kind: 'charge', ux: -hy * sign, uy: hx * sign, weight: Math.max(0, 1 - d / DODGE_AOE_DIST) * dot };
};

/**
 * その段階が扱える脅威か。**'contact' は 'all'(=master)だけが扱う**(§6.25 M49-1)。
 * 接触脅威は「カウンター(近接)」ではなく「回避(位置取り)」専用の脅威種別であり、
 * 'aoe' 段(着弾/突進のみ)には含めない設計(接触で死ぬ相手にカウンターへ向かうのは自殺行為のため)。
 */
export const dodgeHandles = (level: DodgeLevel, kind: DodgeThreat['kind']): boolean => {
  if (level === 'none') return false;
  if (kind === 'contact') return level === 'all';
  if (level === 'all') return true;
  if (level === 'projectile') return kind === 'projectile';
  return kind !== 'projectile'; // 'aoe' = 着弾/突進のみ
};

// M49-1(§6.25): 接触脅威の認識。「危険」はプレイヤー最大HPに対する割合で判定する
// (固定ダメージ閾値にしない=装備/レベルで自動追従させるため)。
/** 接触ダメージがこの割合(プレイヤー最大HP比)以上なら「危険」とみなす(=5発以内で死ぬ敵)。 */
export const CONTACT_DANGER_HP_FRAC = 0.2;
/** 接触脅威を避け始める距離(px)。既存 DODGE_AOE_DIST=240 より少し外。 */
export const DODGE_CONTACT_DIST = 260;

/** 接触ダメージが危険域(プレイヤー最大HPの CONTACT_DANGER_HP_FRAC 以上)の敵か。 */
export const isContactDangerous = (e: Enemy, maxHealth: number): boolean =>
  maxHealth > 0 && (e.damage ?? 0) >= maxHealth * CONTACT_DANGER_HP_FRAC;

/**
 * 危険な接触型の敵から離れる向き(既存 jumpDodge/chargeDodge と同じ流儀=敵から離れる方向)。
 * `maxHealth` を渡さない(0)呼び出しは常に null(=既存呼び出し元は完全な no-op)。
 */
export const contactDodge = (pcx: number, pcy: number, e: Enemy, maxHealth: number): DodgeThreat | null => {
  if (!isContactDangerous(e, maxHealth)) return null;
  const dx = pcx - e.x, dy = pcy - e.y;
  const d = Math.hypot(dx, dy);
  if (d >= DODGE_CONTACT_DIST) return null;
  const [ux, uy] = d < 0.0001 ? [1, 0] : norm(dx, dy);
  return { kind: 'contact', ux, uy, weight: Math.max(0, 1 - d / DODGE_CONTACT_DIST) };
};

/**
 * すべての脅威を集めて1本の回避ベクトルへ合成する。
 * 戻り値 null = 避けるものが無い(呼び出し側は通常の行動へ進む)。
 * `maxHealth`(既定0)は M49-1 の接触脅威判定にのみ使う。**省略時(0)は契約ダメージ閾値が
 * 常に不成立になる**ため、既存の呼び出し元(引数を渡していないテスト等)は完全に不変。
 */
export const dodgeVector = (
  profile: BotSkillProfile,
  pcx: number, pcy: number,
  enemies: readonly Enemy[],
  projectiles: readonly Projectile[],
  maxHealth = 0,
): { x: number; y: number } | null => {
  if (profile.dodge === 'none' || profile.dodgeStrength <= 0) return null;
  let sx = 0, sy = 0, total = 0;
  for (const p of projectiles) {
    if (!dodgeHandles(profile.dodge, 'projectile')) break;
    const t = projectileDodge(pcx, pcy, p);
    if (t) { sx += t.ux * t.weight; sy += t.uy * t.weight; total += t.weight; }
  }
  for (const e of enemies) {
    for (const t of [jumpDodge(pcx, pcy, e), chargeDodge(pcx, pcy, e), contactDodge(pcx, pcy, e, maxHealth)]) {
      if (t && dodgeHandles(profile.dodge, t.kind)) { sx += t.ux * t.weight; sy += t.uy * t.weight; total += t.weight; }
    }
  }
  if (total <= 0) return null;
  const [ux, uy] = norm(sx, sy);
  if (ux === 0 && uy === 0) return null;
  return { x: ux * profile.dodgeStrength, y: uy * profile.dodgeStrength };
};

// ---------------------------------------------------------------------------
// M49-3(§6.25): ワープ(瞬間移動)追従。前tickからの移動量が異常に大きい敵を検知し、離れる。
// 前tickの敵位置は呼び出し側が持つ外部状態(既存 CounterThreatState/RusherTrackState と同じ流儀)。

/**
 * 「瞬間移動した」とみなす1tickあたりの移動量(px)。死神の520pxワープは確実に拾い、
 * 通常移動(最速の敵でも speed×dt)では絶対に届かない値(botSkill.test.ts で不変条件として固定)。
 */
export const WARP_DETECT_PX = 300;

/** ワープ追従の外部状態。ラン単位で1つ保持し、毎tick同じ参照を渡すこと。 */
export interface WarpTrackState {
  lastPos: Map<string, { x: number; y: number }>;
  detectedAt: Map<string, number>; // 敵id → 検知したgameTime(反応遅延の起点)
}
export const createWarpTrackState = (): WarpTrackState => ({ lastPos: new Map(), detectedAt: new Map() });

/**
 * 検知後、敵がもう動いていなくてもこの時間は「ワープ直後」として反応し続ける猶予(ms)。
 * **これが無いと1tick限りの検知になり、reactionMs(最大500ms)経過を待つ前に「動かなくなった」
 * 判定で検知が消えてしまう**(反応遅延の途中でワープ前の位置が上書きされ続けるため)。
 */
const WARP_ALERT_MS = 1000;

/**
 * このtickでワープした敵を検知し、そこから離れる向きを返す(反応遅延=profile.reactionMs)。
 * `profile.warpReact===false` の段は検知(位置追跡)だけ行い、反応(戻り値)は常に null。
 */
export const warpDodge = (
  profile: BotSkillProfile,
  state: WarpTrackState,
  gameTime: number,
  pcx: number, pcy: number,
  enemies: readonly Enemy[],
): { x: number; y: number } | null => {
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  const seen = new Set<string>();
  for (const e of enemies) {
    seen.add(e.id);
    const prevPos = state.lastPos.get(e.id);
    const prevDetectedAt = state.detectedAt.get(e.id);
    state.lastPos.set(e.id, { x: e.x, y: e.y });
    const moved = prevPos ? Math.hypot(e.x - prevPos.x, e.y - prevPos.y) : 0;
    if (prevPos && moved >= WARP_DETECT_PX) {
      if (prevDetectedAt === undefined) state.detectedAt.set(e.id, gameTime); // 新規検知(既に検知中なら上書きしない)
    } else if (prevDetectedAt !== undefined && gameTime - prevDetectedAt >= WARP_ALERT_MS) {
      state.detectedAt.delete(e.id); // 猶予切れ=通常の敵として扱う
    }
    if (!profile.warpReact) continue;
    const detectedAt = state.detectedAt.get(e.id);
    if (detectedAt === undefined) continue;
    if (gameTime - detectedAt < profile.reactionMs) continue; // 反応遅延中
    const dx = pcx - e.x, dy = pcy - e.y;
    const d = Math.hypot(dx, dy);
    if (d < bestD) {
      bestD = d;
      best = d < 0.0001 ? { x: 1, y: 0 } : { x: dx / d, y: dy / d };
    }
  }
  // 画面外/討伐で消えた敵の記録を掃除(メモリリーク防止)。
  for (const id of Array.from(state.lastPos.keys())) {
    if (!seen.has(id)) { state.lastPos.delete(id); state.detectedAt.delete(id); }
  }
  return best;
};

// ---------------------------------------------------------------------------
// §6.25改訂: 攻撃側ダイヤル dodgeVsAttack。回避と攻撃(近接/カウンター)が同tickで競合した時の
// 優先度。**profile.dodge==='none' なら hasDodge は常に false になるため、novice/casual は
// この関数が常に false を返す=既存の攻撃判断を一切変えない(no-op)。**
export const dodgeOverridesAttack = (
  profile: BotSkillProfile,
  hasDodge: boolean,
  rand: () => number = Math.random,
): boolean => hasDodge && rand() < profile.dodgeVsAttack;

/** 回避ベクトルを InputState へ。しきい値未満の成分は倒さない(斜めのブレを抑える)。 */
export const dodgeToInput = (v: { x: number; y: number }, deadzone = 0.35): InputState => ({
  up: v.y < -deadzone,
  down: v.y > deadzone,
  left: v.x < -deadzone,
  right: v.x > deadzone,
});

// ---------------------------------------------------------------------------
// 標的選択(targeting): 「最短コスパで倒す」

const enemyDist = (pcx: number, pcy: number, e: Enemy): number => Math.hypot(e.x - pcx, e.y - pcy);

/** 敵1体の「今すぐ倒す価値」。大きいほど優先。表示にもゲーム判定にも使わない純粋な内部指標。 */
export const targetScore = (
  mode: TargetingMode, pcx: number, pcy: number, e: Enemy, gameTime: number,
): number => {
  const d = Math.max(1, enemyDist(pcx, pcy, e));
  const hp = Math.max(1, e.health ?? 1);
  const stunned = (e.stunUntil ?? 0) > gameTime;
  switch (mode) {
    case 'nearest':
      return -d;
    case 'weakest':
      // 近くて瀕死のものから片付ける。
      return -(d * hp);
    case 'threat': {
      // 今まさに攻撃してくる相手を先に潰す。
      // **距離は sqrt で効かせる**: 距離をそのまま割ると近さが支配的になり、目の前で跳んでいる敵より
      // 一歩近い雑魚を選んでしまう(実測で判明)。移動は「どうせ動く」ので線形のコストではない。
      const attacking = e.aiPhase === 'jump' || e.aiPhase === 'charge' ? 2 : 1;
      return (attacking * (stunned ? 2 : 1)) / Math.sqrt(d);
    }
    case 'optimal':
    default: {
      // コスパ = 「倒しやすさ × 危険度 ÷ 移動コスト」。スタン中は処刑が一番安いので最優先。
      // 距離は threat と同じ理由で sqrt。体力も sqrt(=倒す手数の目安)。
      const attacking = e.aiPhase === 'jump' || e.aiPhase === 'charge' ? 2.5 : 1;
      const execute = stunned ? 3 : 1;
      return (attacking * execute) / (Math.sqrt(d) * Math.sqrt(hp));
    }
  }
};

/** 段階に応じて狙う敵を1体選ぶ。敵が居なければ undefined。 */
export const pickTarget = (
  mode: TargetingMode, pcx: number, pcy: number, enemies: readonly Enemy[], gameTime: number,
): Enemy | undefined => {
  let best: Enemy | undefined;
  let bestScore = -Infinity;
  for (const e of enemies) {
    const s = targetScore(mode, pcx, pcy, e, gameTime);
    if (s > bestScore) { bestScore = s; best = e; }
  }
  return best;
};

/** HPが交戦切り上げライン(disengageHp)を割ったか(段階ごとの粘り強さ)。 */
export const shouldRetreatForHp = (profile: BotSkillProfile, health: number, maxHealth: number): boolean =>
  profile.disengageHp > 0 && maxHealth > 0 && health / maxHealth <= profile.disengageHp;
