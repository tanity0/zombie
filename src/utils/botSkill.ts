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
  /**
   * 「囲まれた」と判断して退避する周囲の敵数。**大きいほど囲まれても粘る**。
   *
   * **v0.25.2364で向きを反転**(社長指示v0.25.2358「上手い=捌く速さを含む」の未消化ぶん)。
   * 旧値は novice 5 → master 2 で、「小さいほど早く危険を察知する=上手い」と書いていたが、
   * 挙動としては **`retreatHpFrac` と全く同じ「上手いほど早く逃げる」**だった。盤面には常時5〜10体
   * いるので、**master は敵2体で退避=ほぼ常に逃げている**状態になり、実測で撃破数が最下位だった
   * (M49実装後の計測: novice 77 / casual 28 / skilled 38 / **master 27**)。
   * `retreatHpFrac`→`disengageHp` は反転させたのに、**同じ誤りがここに残っていた**。
   * **casual=3 は据え置き**(既存の実測値と比較できなくなるため=段階表の基準)。
   */
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
  /**
   * ★v0.25.3554: カウンターで**ボスの受け流し可能フェーズ**(`isDashParryCounterPhase`)まで見るか。
   * 旧実装のカウンター検知は jump / charge / 弾の**3種類しか見ておらず**、城ボスの `g-*` 系や
   * ジャイアントの受け流し可能フェーズが**1つも見えていなかった**(回避側で v0.25.2432 に直した
   * 「赤を一切避けない人だった」と同じ穴がカウンター側に残っていた)。
   * 段階差は「試行確率」ではなく**見えている脅威の広さ**で付ける。
   */
  seesBossCounterPhases: boolean;
  /**
   * ★v0.25.3618(社長指示「マスターはカウンターを積極的に狙いに行って。全部カウンターする勢いで。
   * (もちろんCDの制約の中で)」): 脅威を1件ずつ追跡・1脅威1抽選する人間モデルをやめ、
   * **毎フレーム最良の脅威を取り直し、CDが明けていれば即撃つ**(counterEager)。master のみ true。
   */
  counterEager?: boolean;
  /**
   * ★v0.25.3780(社長裁定「マスターとスキルドは覚える」・research/THOR_ISSEN_REWORK.md §8-4):
   * トールの**紫の円(無の境地)の中では近接を振らない**を学習しているか。
   * true = master/skilled(円の中に居る間は振らずに待つ/離れる) / false = novice/casual(踏んで食らう)。
   * **止める対象は「振ること」だけ**で、紫の円は回避脅威には足さない(立っているだけなら安全)。
   * 判定と半径は `thorNihil.botHoldsMeleeForNihil()`(=必中の引き金と同じ定数)を読む。
   * `seesBossCounterPhases` と同じ「段ごとの真偽ダイヤル」= 新しい仕組みを発明しない。
   */
  respectsNihilCircle: boolean;
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
  // ★v0.25.3554(社長指示「基本どのレベルでもある程度は避けて。マスターは積極的にカウンターを取る。
  // どの攻撃も。スキルドもそれなりにカウンター取りつつ避けつつ」):
  //  - **回避は全段階に入れる**(旧: novice/casual は dodge:'none' + dodgeStrength:0 = **回避処理が
  //    丸ごと無効**で、弾も突進も着弾予告も一切避けなかった=社長報告「敵の弾に一切反応できてない」)。
  //    段階差は**避ける種類**(projectile→all)と**強さ**(0.25→1.0)で付ける。
  //  - **カウンターの見える範囲**を `seesBossCounterPhases` で刻む(skilled/master のみ、ボスの
  //    受け流し可能フェーズまで見る)。counterChance(試行確率)は従来どおり。
  novice:  { reactionMs: 500, counterChance: 0.25, dodge: 'projectile', targeting: 'nearest', surroundCount: 2, disengageHp: 0.5, dodgeStrength: 0.25,
             engageDist: 200, dodgeVsAttack: 0.5,  avoidContactDist: 0,   meleeVsDanger: true,  warpReact: false, upgradePolicy: 'random', seesBossCounterPhases: false,
             respectsNihilCircle: false },
  casual:  { reactionMs: 250, counterChance: 0.65, dodge: 'projectile', targeting: 'nearest', surroundCount: 3, disengageHp: 0.4, dodgeStrength: 0.45,
             engageDist: 260, dodgeVsAttack: 0.5,  avoidContactDist: 0,   meleeVsDanger: true,  warpReact: false, upgradePolicy: 'random', seesBossCounterPhases: false,
             respectsNihilCircle: false },
  skilled: { reactionMs: 150, counterChance: 0.85, dodge: 'all',        targeting: 'threat',  surroundCount: 5, disengageHp: 0.3, dodgeStrength: 0.7,
             engageDist: 340, dodgeVsAttack: 0.4,  avoidContactDist: 160, meleeVsDanger: false, warpReact: true,  upgradePolicy: 'greedy', seesBossCounterPhases: true,
             respectsNihilCircle: true },
  // ★master の surroundCount 8→5(v0.25.3560・社長報告「混戦になると自分から突っ込んで行ってる」)。
  // 事実として: 8 は v0.25.2364 の裁定「上手いほど囲まれても粘る」(当時の実測で退避が早いほど
  // masterの撃破数が最下位になった)に由来する。現時点の実機では「8体まで退避しない」が
  // 突っ込み死の主因になっているため 5(skilledと同値)へ下げる。単調性(上位ほど≧)は維持。
  master:  { reactionMs: 80,  counterChance: 1.0,  dodge: 'all',        targeting: 'optimal', surroundCount: 5, disengageHp: 0.2, dodgeStrength: 1,
             engageDist: 420, dodgeVsAttack: 0.25, avoidContactDist: 160, meleeVsDanger: false, warpReact: true,  upgradePolicy: 'greedy', seesBossCounterPhases: true,
             counterEager: true, // ★v0.25.3618: 全部カウンターする勢い(CD内で)
             respectsNihilCircle: true }, // ★v0.25.3780: トールの紫円の中では振らない(§8-4)
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
  // 'aoe' = **ボスの予告(赤い円/帯)**(v0.25.2432)。既存の 'jump'(汎用ジャンプ着地)/'charge'(汎用突進)は
  // `aiPhase==='jump'|'charge'` しか見ておらず、城ボスの `g-*` 系・連続ジャンプ・グレンの遅延ダメージ・
  // トール/天使の `bossState` 系を**1つも見ていなかった**(=ボットは赤を一切避けない人だった)。
  kind: 'projectile' | 'jump' | 'charge' | 'contact' | 'aoe';
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
  // 'aoe'(ボスの赤い予告)は**何かしら避ける段階なら全部が対象**(v0.25.2432)。
  // 「赤い円の外へ出る」は回避の中で最も基本的な行為で、段階で刻む意味が薄いため
  // (既存の 'projectile'/'aoe' の切り分けはそのまま=既存段階の挙動は1つも変えていない)。
  if (kind === 'aoe') return true;
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

// --- ボスの予告(赤い円/帯)からの回避(v0.25.2432) -------------------------------------------
// 掟: **新しい判定を発明しない。** 描画(pixiScene)と当たり判定(gameStore)が読んでいるのと
// **同じ Enemy のフィールド**だけを見る(`gStompRadius`/`gJumpRadius`/`gTriJumpPts`/
// `giantDelayedHits`/`aiFromX,aiTargetX`)。ここで独自に半径や角度を計算し直すと、
// 「ボットだけが違う場所を危険だと思っている」という第3の真実が生まれる。
//
// 半幅だけは例外で、技ごとの正確な値(GIANT_SWEEP_HALF_WIDTH 等)は gameStore にあり、
// この純関数層から参照すると依存が重くなる。**回避は安全側に広めで構わない**(判定と厳密に
// 一致する必要があるのは「赤い絵」の方であって、避ける側は余裕を持って外へ出ればよい)ので、
// 代表値を1つ置く。
export const DODGE_BAND_HALF_WIDTH = 64;   // 帯技の危険幅(安全側の代表値)
export const DODGE_CIRCLE_DEFAULT_R = 100; // 半径がEnemyに載っていない円技の代表値
// v0.25.4085(赤円全数監査#8): グレンの三連跳びの実半径は110(gameStoreのGLEN_TRIJUMP_RADIUS)。
// 代表値100で避けると**実円の10px内側に立つ**=安全側ではない逆転が起きていた。gameStoreは
// 循環import(gameStore→thorNihil→botSkill)で参照できないため同値をここに置き、
// botSkill.test.ts が両者の一致を機械固定する(ズレたらテストが落ちる)。
export const DODGE_GLEN_TRIJUMP_R = 110;
export const DODGE_AOE_MARGIN = 40;        // 円/帯の縁からこれだけ余分に外へ出たい

// v0.25.2529(BOT_AND_GHOST.md §2.12 要件7): 守護霊側の予告台帳(ghostTelegraph.ts)が
// **同じ式**で追加の予告図形を作れるよう export しただけ(呼び出し側・挙動は完全に不変)。
/** 円の危険域から放射状に逃げる。中に居る/縁に近いほど weight が大きい。 */
export const circleThreat = (pcx: number, pcy: number, cx: number, cy: number, r: number): DodgeThreat | null => {
  const dx = pcx - cx, dy = pcy - cy;
  const d = Math.hypot(dx, dy);
  const danger = r + DODGE_AOE_MARGIN;
  if (d >= danger) return null;
  const [ux, uy] = d < 0.0001 ? [1, 0] : norm(dx, dy);
  return { kind: 'aoe', ux, uy, weight: Math.max(0, 1 - d / Math.max(1, danger)) };
};

/** 帯(線分)の危険域から直交方向へ逃げる。(circleThreatと同じ理由で export・挙動不変) */
export const bandThreat = (
  pcx: number, pcy: number, fx: number, fy: number, tx: number, ty: number, halfWidth: number,
): DodgeThreat | null => {
  const vx = tx - fx, vy = ty - fy;
  const len2 = vx * vx + vy * vy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((pcx - fx) * vx + (pcy - fy) * vy) / len2)) : 0;
  const nx = fx + vx * t, ny = fy + vy * t;   // 線分上の最近点
  const dx = pcx - nx, dy = pcy - ny;
  const d = Math.hypot(dx, dy);
  const danger = halfWidth + DODGE_AOE_MARGIN;
  if (d >= danger) return null;
  // 帯の外へは**直交方向**が最短。線の上に乗っている時は進行方向の直交へ適当に退く。
  const [ux, uy] = d < 0.0001
    ? (len2 > 0 ? norm(-vy, vx) : [1, 0] as [number, number])
    : norm(dx, dy);
  return { kind: 'aoe', ux, uy, weight: Math.max(0, 1 - d / Math.max(1, danger)) };
};

/**
 * その敵が今出している**全ての予告**から逃げる向きを集める(0個〜複数個)。
 * 円: 踏み鳴らし / 飛び掛かりの着地 / 連続ジャンプの残り着地点 / 遅延ダメージの円 /
 *     裏ボス・天使の飛び掛かり着地。
 * 帯: 溜め中/実行中に `aiFrom→aiTarget` を持つ技すべて(薙ぎ払い/突進/噛みつき/のしかかり/
 *     滑空/翼撃/掃射ビーム/届く手…) と 遅延ダメージのカプセル。
 */
export const telegraphDodge = (pcx: number, pcy: number, e: Enemy): DodgeThreat[] => {
  const out: DodgeThreat[] = [];
  const push = (t: DodgeThreat | null) => { if (t) out.push(t); };
  const ph = e.aiPhase ?? '';
  const bs = e.bossState ?? '';
  const ecx = e.x + e.width / 2, ecy = e.y + e.height / 2;

  // --- 円 ---
  if (ph === 'g-stomp-windup') push(circleThreat(pcx, pcy, ecx, ecy, e.gStompRadius ?? DODGE_CIRCLE_DEFAULT_R));
  if (ph === 'g-jump-windup' || ph === 'g-jump-air') {
    push(circleThreat(pcx, pcy, (e.aiTargetX ?? e.x) + e.width / 2, (e.aiTargetY ?? e.y) + e.height / 2,
      e.gJumpRadius ?? DODGE_CIRCLE_DEFAULT_R));
  }
  if (ph === 'g-trijump-windup' || ph === 'g-trijump-air') {
    // 着地済みの点は危険ではない(描画と同じ「残りだけ」の考え方)。
    const pts = e.gTriJumpPts ?? [];
    const from = ph === 'g-trijump-air' ? (e.gTriJumpIdx ?? 0) : 0;
    for (let i = from; i * 2 + 1 < pts.length; i++) push(circleThreat(pcx, pcy, pts[i * 2], pts[i * 2 + 1], DODGE_GLEN_TRIJUMP_R));
  }
  if (bs === 'jump-windup' || bs === 'jump-attack') {
    // v0.25.4085(赤円全数監査#8): トール/ラフィの跳びの aiTargetX/Y は**既に中心座標**
    // (着地爆発がその値をそのまま爆心に使う=useGameLoop.ts thor-jump / angelBossTick rafi jump)。
    // 旧実装の +width/2 は半身ぶん回避円がズレ、実円の一部が回避円の外に出ていた。
    // 半径は代表値100のまま(実半径70より広い=安全側で正しい向き)。
    push(circleThreat(pcx, pcy, e.aiTargetX ?? ecx, e.aiTargetY ?? ecy, DODGE_CIRCLE_DEFAULT_R));
  }
  for (const h of e.giantDelayedHits ?? []) {
    if (h.capsule) push(bandThreat(pcx, pcy, h.capsule.fx, h.capsule.fy, h.capsule.tx, h.capsule.ty, h.capsule.halfWidth));
    else push(circleThreat(pcx, pcy, h.x, h.y, h.radius));
  }

  // --- 帯(溜め中/実行中で始点・終点を持つ技すべて) ---
  // ★v0.25.3818(社長裁定 §9-6「突進の走行中の体当たり」= (B)「当てる」の条件②): トールの突進の**走り**(`thor-dash-move`)を
  // 帯脅威へ足す。走行中は巨体の AABB が接触ダメージを持つ(`combatTick.applyContactDamage` の
  // トール除外から外れている)のに、旧リストは `-windup` と明示3州しか拾っていなかったため
  // **ボットには走りが見えていなかった**=避けられなかった。描画側の赤い帯(条件①)と対で入れる。
  const banded = (ph.startsWith('g-') && (ph.endsWith('-windup') || ph.endsWith('-active') || ph.endsWith('-charge')))
    || bs.endsWith('-windup') || bs === 'harai' || bs === 'issen-dash' || bs === 'tsuki'
    || bs === 'thor-dash-move';
  if (banded && e.aiFromX !== undefined && e.aiTargetX !== undefined) {
    push(bandThreat(pcx, pcy, e.aiFromX, e.aiFromY ?? e.y, e.aiTargetX, e.aiTargetY ?? e.y, DODGE_BAND_HALF_WIDTH));
  }
  return out;
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
    // ボスの予告(赤い円/帯)。1体が同時に複数の危険域を出しうる(連続ジャンプの3円/遅延ダメージ)。
    for (const t of telegraphDodge(pcx, pcy, e)) {
      if (dodgeHandles(profile.dodge, t.kind)) { sx += t.ux * t.weight; sy += t.uy * t.weight; total += t.weight; }
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
