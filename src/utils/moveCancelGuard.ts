// ★「次の技は前の技をキャンセルしない」規則の**機械化**(社長裁定v0.25.3518)。
//
// 社長の言葉: 「全ボスで、次の技は前の技をキャンセルしないってルールあった方がいい気がする。
// モーションも合わせて出来るまで次は出ない」。
//
// 調査(v0.25.3516)の結論: これは**既に構造としてそうなっている**。3系統(裏ボス=useGameLoop /
// 賞金首=bountyTick / 城ボス=gameStoreのaiPhase)とも、技の抽選口が `bossState === 'chase'`
// (城ボスは待機aiPhase)で塞がれ、次の抽選時刻は**前の技の硬直が明ける瞬間に初めて**セットされる。
// ただし**それを保証する仕組みが無い**——状態機械は3ファイルに手書きで40本近くあり、新しい技を
// 1本足す時にガードを書き忘れれば静かに破れる。このプロジェクトで繰り返し起きてきた事故の型
// (同じ規則を複数の実装経路に書いて1つ取りこぼす)そのもの。
//
// そこでこのモジュールは、**観測した状態名の並びから違反を検出する純関数**を提供する。
// 挙動は1ミリも変えない(見るだけ)。テストがボスを回してこれに食わせる。
//
// 前提にしている命名規約(3系統で共通): `<move>-windup` / `<move>` / `<move>-recover`。
//   例) `br-triple-windup` → move='br-triple' phase='windup'
//       `g-sweep-active`   → move='g-sweep'   phase='active'
//       `idol-roll-recover`→ move='idol-roll' phase='recover'
// 中立(技を出していない)は `chase` / `return` / `idle` / undefined。

/** 技の段階。`active` は「判定が出ている実行中」。 */
export type MovePhase = 'windup' | 'active' | 'recover';

export interface MovePhaseRef {
  /** 技の識別子(状態名から段階の接尾辞を取り除いたもの)。 */
  move: string;
  phase: MovePhase;
}

/** 技を出していない状態(ここから次の技を選ぶのが正しい入口)。 */
const NEUTRAL_STATES = new Set(['chase', 'return', 'idle', 'dormant', 'spawn', 'wake', 'stun', 'lift']);

export const isNeutralMoveState = (state: string | null | undefined): boolean =>
  state === null || state === undefined || state === '' || NEUTRAL_STATES.has(state);

/**
 * 状態名を「技」と「段階」に割る。中立・解釈できない名前は null。
 * `-active` は付く実装と付かない実装(接尾辞なし=実行中)の両方があるので、どちらも `active` に寄せる。
 */
export const parseMovePhase = (state: string | null | undefined): MovePhaseRef | null => {
  if (isNeutralMoveState(state)) return null;
  const s = state as string;
  if (s.endsWith('-windup')) return { move: s.slice(0, -'-windup'.length), phase: 'windup' };
  if (s.endsWith('-recover')) return { move: s.slice(0, -'-recover'.length), phase: 'recover' };
  if (s.endsWith('-active')) return { move: s.slice(0, -'-active'.length), phase: 'active' };
  // 接尾辞なし(例: `g-sweep` 実行中 / `idol-roll`)= 実行中とみなす。
  return { move: s, phase: 'active' };
};

/**
 * 直前の状態→今の状態の遷移が「**次の技が前の技をキャンセルした**」に当たるか。
 * 当たるなら理由の文字列、当たらないなら null。
 *
 * 違反の定義(社長の規則をそのまま機械にしたもの):
 *   **別の技の windup が、前の技の windup / active の途中から始まった。**
 * = 溜め中・実行中の技を、次の技が上書きした状態。
 *
 * 違反にしないもの(いずれも「次の技」ではない):
 *  - 中立(chase等)を挟んでいる → 正しい入口。
 *  - 同じ技の中の段階遷移(windup→active→recover)。
 *  - **硬直(recover)から次の技へ** → 前の技は出し切っている(連携=コンボの正規形)。
 *  - **技 → 中立**(カウンター成立・体勢崩し・気絶などによる中断)。これはプレイヤーが崩した結果で、
 *    「次の技」ではない。社長の規則の対象外(v3128の掟・紫の中断は残す、と整合)。
 */
/**
 * ★**設計された連携**の申告表。ここに載っている遷移だけは違反にしない。
 *
 * なぜ許可制にするか: 状態名だけからは「前の技が**終わって**次へ繋いだ」のか
 * 「**途中で切って**次を始めた」のかが区別できない。連携は前者だが、機械には同じに見える。
 * そこで**連携は明示的に申告する**ことにした——申告が無い遷移は全部違反。
 * これなら「新しい技を足した時に前の技を切ってしまった」は必ず落ち、
 * 本物の連携は1行足せば通る(=そのとき理由をここに残すことになる)。
 *
 * キーは `前の技 -> 次の技`。値は**なぜ切っていないと言えるのか**の説明。
 */
export const ALLOWED_MOVE_CHAINS: Readonly<Record<string, string>> = {
  'br-roll -> br-triple':
    'バス停の近距離の台本「バックロール→三段突き」(社長指示v0.25.3519)。'
    + 'ロールは**攻撃ではない移動**で、持ち時間(BR_ROLL_MS)を使い切った時にだけ次へ渡す'
    + '=途中で切っていない。押しのけと並ぶ「密着への2通りの答え」の片方として設計されたもの。',
  'bm-charge -> bm-whip360':
    '馬乗りの「突進→360度ムチ」(社長指示v0.25.3473「ダッシュ後に360度、ムチ振り攻撃」)。'
    + '突進は**目標へ着いた/持ち時間を使い切った**時にだけ次へ渡す(bountyTick: dl<=2 || 時間切れ)'
    + '=途中で切っていない。1つの連続した動作として設計されたもの。',
  'mk-backroll -> mk-boom':
    '舞妓の近距離台本「バックロール→手毬打ち」(社長指示v0.25.3584)。ロールは**攻撃ではない移動**で、'
    + '持ち時間(backRoll.rollMs)を使い切った時にだけ次へ渡す=途中で切っていない(br-roll等と同じ型)。',
  'bb-backroll -> bb-quickshot':
    '鋏の近距離台本「バックロール→高速弾→飛びかかり」(社長指示v0.25.3581)。ロールは**攻撃ではない移動**で、'
    + '持ち時間(rollCombo.rollMs)を使い切った時にだけ次へ渡す=途中で切っていない'
    + '(バス停の br-roll -> br-triple と同じ型)。弾の後の飛びかかりは recover→windup なので申告不要。',
  'bm-combo3 -> bm-whip360':
    '馬乗りの統合台本「3段コンボの締め=360度ムチ」(社長指示v0.25.3571「三段攻撃の最後に360度、'
    + 'の台本に統合」)。3段目の斬りはwindupの持ち時間を使い切った瞬間に命中(hitCapsule)を適用して'
    + 'から次へ渡す=途中で切っていない。360側の予告(赤円)を挟むのでカウンター文法もそのまま。',
};

export const moveCancelViolation = (
  prevState: string | null | undefined, nextState: string | null | undefined,
): string | null => {
  const prev = parseMovePhase(prevState);
  const next = parseMovePhase(nextState);
  if (prev === null || next === null) return null;
  if (prev.move === next.move) return null;
  if (next.phase !== 'windup') return null;
  if (prev.phase === 'recover') return null;
  if (ALLOWED_MOVE_CHAINS[`${prev.move} -> ${next.move}`] !== undefined) return null;
  return `${prev.move}(${prev.phase}) → ${next.move}(windup): 前の技を出し切る前に次の技が始まった`;
};

export interface MoveCancelWatch {
  /** 1体ぶんの状態を1tick観測する。違反があればその理由を返す(同時に内部へも溜める)。 */
  observe(id: string, state: string | null | undefined): string | null;
  /** これまでに見つかった違反(重複は畳む)。 */
  violations(): string[];
}

/**
 * 複数体を同時に見張る観測器。テストが毎tick `observe(enemy.id, enemy.bossState ?? enemy.aiPhase)`
 * を呼ぶだけでよい。**状態を持つのはここだけ**で、判定そのものは上の純関数(=単体でテストできる)。
 */
export const createMoveCancelWatch = (): MoveCancelWatch => {
  const last = new Map<string, string | null | undefined>();
  const found = new Set<string>();
  return {
    observe(id, state) {
      const prev = last.get(id);
      last.set(id, state);
      if (!last.has(id) && prev === undefined) return null;
      const v = moveCancelViolation(prev, state);
      if (v !== null) found.add(v);
      return v;
    },
    violations: () => [...found],
  };
};
