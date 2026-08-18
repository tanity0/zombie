// ボスメーカー: 裏ボス4体(ミーミル/ヨルムンガルド/スカジ/トール)の**▸個別再生の要求箱**。
//
// 置き場所は idolTick.ts の pendingPlay / bountyTick.ts の pendingBountyPlay / angelBossTick.ts の
// pendingAngelPlay と同型: パネル(React)はコントローラのローカル変数を持てないので、**モジュール変数の
// 要求箱**を経由し、tickが引き取る。裏ボス4体はコントローラが `useGameLoop.ts` の inline ブロックに
// あるため、要求箱だけを**store非依存の葉**として切り出してある(パネル=`tools/bossmaker` と
// コントローラ=`hooks/useGameLoop` の両方から見えるようにするため)。
//
// ★この箱は BossMakerPanel からしか書かれない=**通常プレイでは常に null**(毎フレームの追加費用は
//   bool 2つの比較だけ。裏ボス4体の実プレイ挙動は1バイトも変わらない)。
//
// ★掟(v0.25.3563で確立): 技の**遷移コードを複製しない**。裏ボスの「技を始める」部分は既に
//   `beginMimirMove` / `beginJormungandMove` / `beginSkadiMove` / `beginThorMove` / `beginThorJump`
//   の束へ切り出されており、**実戦の抽選と▸の再生が同じ1本を通る**。条件(距離帯・CD・重みの抽選)は
//   呼び出し側に残る=▸は条件をバイパスして begin* を直接叩ける(部屋は訓練場)。
//   写すと「メーカーでは出るのに実戦で出ない(逆も)」が静かに生まれる。

/** ▸で再生できる技のキー(パネルのボタンと1対1)。 */
export type HiddenMoveKey =
  | 'mi-bite' | 'mi-laser' | 'mi-dash' | 'mi-burst' | 'mi-radial'
  | 'jo-coil' | 'jo-dash' | 'jo-burst' | 'jo-radial'
  | 'sk-ice' | 'sk-blade' | 'sk-cage' | 'sk-dash' | 'sk-burst' | 'sk-radial'
  | 'th-issen' | 'th-tsuki' | 'th-harai' | 'th-jump';

/**
 * どのボスがどの技を持つか。**パネルの playables と、再生時の取り違え防止の両方がこれを読む**
 * (1つの出どころ=「ボタンは出ているのに何も起きない」を原理的に作らない)。
 */
export const HIDDEN_MOVES_BY_TYPE: Readonly<Record<string, readonly HiddenMoveKey[]>> = {
  mimir: ['mi-bite', 'mi-laser', 'mi-dash', 'mi-burst', 'mi-radial'],
  jormungand: ['jo-coil', 'jo-dash', 'jo-burst', 'jo-radial'],
  skadi: ['sk-ice', 'sk-blade', 'sk-cage', 'sk-dash', 'sk-burst', 'sk-radial'],
  thor: ['th-issen', 'th-tsuki', 'th-harai', 'th-jump'],
};

/**
 * 「この型は裏ボスコントローラ(useGameLoop の hiddenBoss ブロック)が動かす型か」。
 * ボスメーカーの部屋は store の `hiddenBoss` を立てない(§2-5 部屋の掃除)ので、部屋側の判定に使う。
 * 技の表と同じ1つの出どころから引く=**4体の一覧が2箇所に増えない**。
 */
export const isHiddenControllerBoss = (type: string): boolean =>
  Object.prototype.hasOwnProperty.call(HIDDEN_MOVES_BY_TYPE, type);

interface HiddenPlayRequest { move: HiddenMoveKey; solo: boolean; loop: boolean }
let pendingHiddenPlay: HiddenPlayRequest | null = null;
/** 単独再生の実行中(=停止中でも tick を進めてよい)。技が終わったら false へ戻る。 */
let hiddenSoloActive = false;
/** ループ再生中の技(null=1回で止まる)。 */
let hiddenLoopMove: HiddenMoveKey | null = null;

/**
 * 技を1つだけ再生する。solo=停止中でもこの技が終わるまで進めて、終わったらまた止まる。
 * ループ中の技をもう一度押した時は**ループだけを止める**(進行中の技は最後まで再生してから止まる)
 * ——賞金首/天使と同じ扱い。停止中に絵が技の途中で凍りつくのを避けるため。
 */
export const requestHiddenBossMovePlay = (move: HiddenMoveKey, opts?: { solo?: boolean; loop?: boolean }): void => {
  if (hiddenLoopMove === move) { hiddenLoopMove = null; return; }
  pendingHiddenPlay = { move, solo: opts?.solo ?? false, loop: opts?.loop ?? false };
};
/** 停止中でも tick を回す必要があるか(useGameLoop のポーズ判定が読む)。 */
export const hiddenBossPlaybackActive = (): boolean => hiddenSoloActive || pendingHiddenPlay !== null;
/** 画面表示用(どの技をループ中か)。verbは裏ボスには無いので常に null。 */
export const getHiddenBossPlayback = (): { verb: string | null; loop: string | null } =>
  ({ verb: null, loop: hiddenLoopMove });
/**
 * 全部消す(ラン開始時のリセット経路)。★状態オブジェクトの生成関数へ副作用として入れてはいけない
 * ——`useRef(create…())` の引数は毎レンダー評価されるので、パネルが再描画するたびに要求箱が空になり
 * 「▸を押しても技が1フレームで止まる」になる(idolTick.ts v0.25.2625の実バグ)。
 */
export const clearHiddenBossPlayback = (): void => {
  pendingHiddenPlay = null; hiddenSoloActive = false; hiddenLoopMove = null;
};

/**
 * 要求箱の引き取り。**始めたら true**(その1フレームは通常の分岐を飛ばす)。
 * 引数の `start` はコントローラの begin* 束への入口(=実戦と同じ1本)。
 */
export const takeHiddenBossPlay = (
  type: string, start: (move: HiddenMoveKey) => void,
): boolean => {
  if (pendingHiddenPlay === null) return false;
  const req = pendingHiddenPlay;
  pendingHiddenPlay = null;
  if (!(HIDDEN_MOVES_BY_TYPE[type] ?? []).includes(req.move)) {
    clearHiddenBossPlayback(); // 別のボスの技キー(取り違え)。握り潰さず再生状態ごと消す。
    return false;
  }
  hiddenSoloActive = req.solo;
  hiddenLoopMove = req.loop ? req.move : null;
  start(req.move);
  return true;
};

/**
 * 単独再生の立ち下がり。**chaseへ戻ったら終わり**(ループONなら次フレームにもう一度)。
 * コントローラが状態機械の**前後2回**呼ぶ=2重の保険:
 *  - 前(ブロック冒頭): 気絶/カウンター/割り込みで技が消された時の受け皿。これが無いと
 *    hiddenSoloActive が立ちっぱなしになり **⏸(停止)が二度と効かなくなる**。
 *  - 後(状態機械の直後): 技がchaseへ戻ったそのフレームで終える=停止中に余分な1フレームだけ歩かない。
 * ('return' は画面外/帰巣の州。コントローラが chase と同一視するのでここでも同じ扱いにする。)
 */
export const settleHiddenBossPlayback = (bossState: string | undefined): void => {
  if (!hiddenSoloActive || pendingHiddenPlay !== null) return;
  const st = bossState ?? 'chase';
  if (st !== 'chase' && st !== 'return') return;
  if (hiddenLoopMove !== null) pendingHiddenPlay = { move: hiddenLoopMove, solo: true, loop: true };
  else hiddenSoloActive = false;
};
