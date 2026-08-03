// ボスメーカー(BOSS_MAKER.md §2-3): idol の**スキーマ**とレジストリ登録。
// UIはこのスキーマを読んでフォームを自動生成する=**1ボス対応 = テーブル + スキーマを1つ書くだけ**。
// ボスを足すたびにUIを書かない(ここを守らないと14体で破綻する)。
//
// ★社長補足v0.25.2621「一騎打ちのトレーニング場 兼 メーカー。**その場で動かしながら**数字を調整する」:
// 主たる操作は**キーボードで打つことではなく「摘まむ」**(ドラッグでスクラブ / +− ボタン)。
// よって **step(刻み幅)がスキーマの主役**になる。刻みが合っていないとスクラブが使い物にならない。
// 叩き台の刻み: ms=50 / px=10 / 倍率=0.05 / 重み=5 / 個数=1。
import { registerEnemyFireProfile } from './enemyUtils';
import {
  registerBossTuning, type TuningField, type TuningTextField, type PlayableAction,
  type BossScriptApi, type BossScriptOp,
} from './bossTuning';
import {
  IDOL_TUNING, IDOL_TUNING_DEFAULTS, IDOL_ALL_MOVES, IDOL_SHOT_SLOTS,
  idolShotName, idolEnabledShots, isIdolShot,
  type IdolMove, type IdolCoreMove, type IdolShotSlot,
} from './idolScript';
import {
  addScript, removeScript, setScriptZone, setScriptWeight, toggleScript,
  setStep, insertStep, removeStep, moveStep, stepCutoffIndex,
  serializeScripts, parseScripts, replaceScripts, scriptWarnings, SCRIPT_ZONES,
} from './bossScriptEdit';
import { BEHAVIOR_CHOICES, stringLenWarnings } from './bossPresets';
import type { BossZone } from './bossSkeleton';
import { requestIdolMovePlay, requestIdolVerbPlay, getIdolPlayback } from './idolTick';
import type { NeutralVerb } from './bossSkeleton';

const MOVE_LABEL: Record<IdolCoreMove, string> = {
  aim: '狙い撃ち(aim)', fan: '連射扇(fan)', roll: '離脱ローリング(roll)',
  punch: '至近の殴り(punch)', snipe: '狙撃線(snipe)', orb: '追尾弾(orb)',
};

/** 射撃枠の見出し。**固定文字列**にする(社長が付けた名前は `sectionLabel` で後から差し替える)。 */
const shotSection = (m: IdolShotSlot): string => `射撃枠 ${m}`;

// 技ごとの「図形」欄(判定と描画が同じ値を読むので、ここを動かすと赤い予告も一緒に動く)。
const SHAPE_FIELDS: Partial<Record<IdolCoreMove, TuningField[]>> = {
  roll: [{ path: 'shape.rollDist', label: '離脱距離', group: 'move', section: MOVE_LABEL.roll, kind: 'px', min: 0, max: 600, step: 10 }],
  punch: [
    { path: 'shape.punchRange', label: '帯の長さ', group: 'move', section: MOVE_LABEL.punch, kind: 'px', min: 10, max: 400, step: 10 },
    { path: 'shape.punchHalfWidth', label: '帯の半幅', group: 'move', section: MOVE_LABEL.punch, kind: 'px', min: 4, max: 200, step: 10 },
  ],
  snipe: [
    { path: 'shape.snipeRange', label: '線の長さ', group: 'move', section: MOVE_LABEL.snipe, kind: 'px', min: 100, max: 2000, step: 25 },
    { path: 'shape.snipeHalfWidth', label: '線の半幅', group: 'move', section: MOVE_LABEL.snipe, kind: 'px', min: 4, max: 200, step: 10 },
  ],
  fan: [
    { path: 'shape.fanSpreadStep', label: '1本あたりの開き角', group: 'move', section: MOVE_LABEL.fan, kind: 'num', min: 0, max: 1, step: 0.01, hint: 'rad' },
    { path: 'fanCount.p1', label: '本数 P1', group: 'move', section: MOVE_LABEL.fan, kind: 'num', min: 1, max: 15, step: 1 },
    { path: 'fanCount.p2', label: '本数 P2', group: 'move', section: MOVE_LABEL.fan, kind: 'num', min: 1, max: 15, step: 1 },
  ],
  orb: [
    { path: 'shape.orbTurnRate', label: '旋回速度', group: 'move', section: MOVE_LABEL.orb, kind: 'rate', min: 0, max: 8, step: 0.05, hint: '小さいほど密着で振り切れる' },
    { path: 'orbCount.p1', label: '発数 P1', group: 'move', section: MOVE_LABEL.orb, kind: 'num', min: 1, max: 10, step: 1 },
    { path: 'orbCount.p2', label: '発数 P2', group: 'move', section: MOVE_LABEL.orb, kind: 'num', min: 1, max: 10, step: 1 },
  ],
};

/**
 * 弾を撃つ技の「弾の三点セット」(弾速 / 弾のダメージ / 弾の大きさ)。
 *
 * ★**弾のパラメータは技ごとに持つ**(社長指示v0.25.2628)。同じ弾を撃つ技どうしでも共通化しない
 * ——共通化すると「狙い撃ち=速い1発 / 連射扇=遅いが数で押す」のような**技の性格を数字で作り分け
 * られない**(v0.25.2627で aim/fan を1組にしたのが誤り)。
 * 追尾弾(orb)は**速度だけ既存パス `shape.orbSpeed` が正**(値を二重に持たない)。
 * **並び順と項目名は3技で同じ**にする=社長から見て「どの技にも弾の項目が同じ形で並んでいる」。
 */
const bulletFields = (m: IdolCoreMove): TuningField[] => {
  const sec = MOVE_LABEL[m];
  const dmgSize = (base: string): TuningField[] => [
    { path: `${base}.damage`, label: '弾のダメージ', group: 'move', section: sec, kind: 'num', min: 0, max: 200, step: 1 },
    { path: `${base}.size`, label: '弾の大きさ', group: 'move', section: sec, kind: 'px', min: 4, max: 64, step: 2 },
  ];
  if (m === 'aim' || m === 'fan') {
    return [
      { path: `bullet.${m}.speed`, label: '弾速', group: 'move', section: sec, kind: 'pxs', min: 40, max: 1200, step: 20 },
      ...dmgSize(`bullet.${m}`),
    ];
  }
  if (m === 'orb') {
    return [
      { path: 'shape.orbSpeed', label: '弾速', group: 'move', section: sec, kind: 'pxs', min: 20, max: 600, step: 10 },
      ...dmgSize('bullet.orb'),
    ];
  }
  // 弾を撃たない技(帯・線の直接判定)も**自分のダメージを持つ**(社長報告v0.25.2629
  // 「射撃線と殴り はそもそもダメージのパラメータがない」)。旧は接触ダメージ(stats.damage)の流用だった。
  if (m === 'punch') {
    return [
      { path: 'moveDamage.punch', label: 'ダメージ', group: 'move', section: sec, kind: 'num', min: 0, max: 400, step: 5 },
      // エフェクトの速さ(社長要望v0.25.2651「拳とかダメージ判定早いのにエフェクト遅い」)。
      // ★**伸び切る瞬間は判定の瞬間で固定**。ここで変わるのは「いつ動き出すか/どう伸びるか」だけなので、
      //   いくら触っても「絵が当たったのにダメージが無い」side へはズレない。
      { path: 'fx.punchFistLead', label: '拳が動く区間', group: 'move', section: sec, kind: 'frac', min: 0.05, max: 1, step: 0.05, hint: '溜めの後ろ何割で伸ばすか。小さいほど速く見える' },
      { path: 'fx.punchFistEase', label: '拳の伸び方', group: 'move', section: sec, kind: 'num', min: 0.3, max: 3, step: 0.1, hint: '1=等速 / 大=溜めて伸びる / 小=出だしが速い' },
      { path: 'fx.punchFistHoldMs', label: '拳が残る時間', group: 'move', section: sec, kind: 'ms', min: 0, max: 1200, step: 20 },
      // 押し出し(v0.25.2653・社長要望「押しやる殴り」)。**距離で入れる**——「中距離まで押しやる」は
      // 距離の話。速度×時間はコード側で逆算する(`knockbackSpeedFor`)。
      { path: 'moveKnockback.punch.distPx', label: '押し出す距離', group: 'move', section: sec, kind: 'px', min: 0, max: 600, step: 10, hint: '共通の被弾ノックバックは60px' },
      { path: 'moveKnockback.punch.ms', label: '押し出す時間', group: 'move', section: sec, kind: 'ms', min: 60, max: 1200, step: 20, hint: '短いほど鋭く飛ぶ' },
    ];
  }
  if (m === 'snipe') {
    return [{ path: 'moveDamage.snipe', label: 'ダメージ', group: 'move', section: sec, kind: 'num', min: 0, max: 400, step: 5 }];
  }
  return []; // roll は判定を持たない(離脱のみ)
};

const moveFields = (): TuningField[] => {
  const out: TuningField[] = [];
  for (const m of IDOL_ALL_MOVES) {
    const sec = MOVE_LABEL[m];
    out.push(
      { path: `timing.${m}.windup`, label: '予告', group: 'move', section: sec, kind: 'ms', min: 0, max: 5000, step: 50, hint: '予告が出てから判定まで' },
      // §14-4: 「判定」欄はまだ hint が無かったので足す(既存の予告/硬直は既に持っているので触らない)。
      { path: `timing.${m}.active`, label: '判定', group: 'move', section: sec, kind: 'ms', min: 0, max: 3000, step: 50, hint: '当たり判定が出ている時間。0=出た瞬間だけ。' },
      { path: `timing.${m}.recover`, label: '硬直', group: 'move', section: sec, kind: 'ms', min: 0, max: 5000, step: 50, hint: '反撃窓。820ms=近接1発' },
    );
    out.push(...bulletFields(m));       // 予告/判定/硬直の直後=どの技でも同じ位置に弾の項目が並ぶ
    out.push(...(SHAPE_FIELDS[m] ?? []));
  }
  return out;
};

/**
 * 射撃部品の欄(v0.25.2638・社長要望「通常弾/連射の弾幕/ジャブを入れたい」)。
 *
 * **足していない枠は1行も出さない**(`visibleWhen`)。8枠×15欄=120行が常時並ぶと道具として
 * 使えない(社長報告v0.25.2628「大分まだみづらい」の再来)。「＋技を足す」で1枠ずつ現れる。
 * 並び順は**中核6技と同じ**(予告→判定相当→硬直→弾→形)にして、どの技も同じ場所に同じ項目がある状態を保つ。
 */
const shotFields = (): TuningField[] => {
  const out: TuningField[] = [];
  for (const m of IDOL_SHOT_SLOTS) {
    const sec = shotSection(m);
    const on = `shots.${m}.enabled`;
    const f = (
      key: string, label: string, kind: TuningField['kind'],
      min: number, max: number, step: number, hint?: string,
    ): TuningField => ({ path: `shots.${m}.${key}`, label, group: 'move', section: sec, kind, min, max, step, hint, visibleWhen: on });
    out.push(
      f('windup', '予告', 'ms', 0, 5000, 50, '予告が出てから撃つまで'),
      f('recover', '硬直', 'ms', 0, 5000, 50, '反撃窓。820ms=近接1発'),
      f('count', '弾数(1斉射)', 'num', 1, 24, 1),
      f('spreadDeg', '広がり', 'deg', 0, 60, 1, '弾1本あたりの開き角'),
      f('waves', '斉射の回数', 'num', 1, 12, 1, '2以上で連射'),
      f('intervalMs', '斉射の間隔', 'ms', 20, 1500, 10),
      f('waveTurnDeg', '斉射ごとの回転', 'deg', -60, 60, 1, '回る弾幕が作れる'),
      f('speed', '弾速', 'pxs', 40, 1200, 20, 'プレイヤーは104.4px/s'),
      f('damage', '弾のダメージ', 'num', 0, 200, 1),
      f('size', '弾の大きさ', 'px', 4, 64, 2),
      f('homingDeg', '誘導', 'rate', 0, 360, 5, '0=直進。旋回速度(度/秒)'),
      f('aimMode', '狙い方', 'num', 0, 2, 1, '0=撃つ瞬間 1=予告で固定 2=偏差'),
      f('zoneIdx', '出す距離帯', 'num', 0, 3, 1, '0密着 1主戦 2遠 3超遠'),
      f('weight', '頻度(重み)', 'num', 0, 200, 5, '0=台本に出ない(▶では出せる)'),
      // 一番下=「消す」に近い操作なので、うっかり触らない位置へ置く。
      f('enabled', '有効(0で消す)', 'num', 0, 1, 1, '0にするとこの枠は消える'),
    );
  }
  return out;
};

const shotTextFields = (): TuningTextField[] => IDOL_SHOT_SLOTS.map(m => ({
  path: `shotLabels.${m}`,
  label: '名前',
  group: 'move' as const,
  section: shotSection(m),
  maxLen: 12,
  placeholder: idolShotName(m),
  visibleWhen: `shots.${m}.enabled`,
}));

// 距離帯の表示名。台本エディタと共用。
const ZONE_LABEL: Record<string, string> = { melee: '密着(0〜140)', near: '主戦帯(140〜340)', mid: '遠(340〜700)', far: '超遠(700〜)' };

// ★v0.25.2642: 台本の重みは**数値スキーマから外した**。旧実装は `strings.${i}.weight` と
// **添字でパスを作っていた**ので、台本を足す/消すと**パスの指す先がズレる**(2本目を消すと
// 3本目の重みが2本目に化ける)。台本エディタが行ごとに重みを持つ形へ移した。

const behaviorFields = (): TuningField[] => [
  { path: 'stats.health', label: 'HP', group: 'behavior', section: '基礎値', kind: 'num', min: 500, max: 40000, step: 500 },
  // ★これは**体が触れた時**のダメージ(技のダメージとは別軸)。技ごとの威力は各技のセクションにある
  // (`bullet.*.damage` / `moveDamage.*`)。v0.25.2629で分離するまでは殴り/狙撃線がこの値を流用していた。
  { path: 'stats.damage', label: '接触ダメージ', group: 'behavior', section: '基礎値', kind: 'num', min: 0, max: 999, step: 5, hint: '体が触れた時。技の威力は各技の欄' },
  { path: 'stats.speed', label: '移動速度', group: 'behavior', section: '基礎値', kind: 'pxs', min: 0, max: 600, step: 10 },
  { path: 'phaseHpThreshold', label: 'フェーズ2の閾値', group: 'behavior', section: '基礎値', kind: 'frac', min: 0, max: 1, step: 0.05, hint: 'HP割合' },

  // §14-4: 「主戦帯」「密着帯の上限/中帯の上限/遠帯の上限」の hint はまだ無かったので足す。
  { path: 'neutralBand.min', label: '主戦帯 下限', group: 'behavior', section: '間合い', kind: 'px', min: 0, max: 2000, step: 10, hint: 'ボスが保ちたい距離。これより遠いと詰め、近いと離れる。' },
  { path: 'neutralBand.max', label: '主戦帯 上限', group: 'behavior', section: '間合い', kind: 'px', min: 0, max: 2000, step: 10, hint: 'ボスが保ちたい距離。これより遠いと詰め、近いと離れる。' },
  { path: 'zoneEdges.meleeMax', label: '密着帯の上限', group: 'behavior', section: '間合い', kind: 'px', min: 0, max: 2000, step: 10, hint: '距離帯の境目。密着/主戦/遠/超遠の4つに分かれ、どの台本を使うかが決まる。' },
  { path: 'zoneEdges.nearMax', label: '中帯の上限', group: 'behavior', section: '間合い', kind: 'px', min: 0, max: 1500, step: 10, hint: '距離帯の境目。密着/主戦/遠/超遠の4つに分かれ、どの台本を使うかが決まる。' },
  { path: 'zoneEdges.midMax', label: '遠帯の上限', group: 'behavior', section: '間合い', kind: 'px', min: 0, max: 2000, step: 20, hint: '距離帯の境目。密着/主戦/遠/超遠の4つに分かれ、どの台本を使うかが決まる。' },

  { path: 'verbSpeedMult.close', label: '詰める倍率', group: 'behavior', section: '中立の移動', kind: 'frac', min: 0, max: 3, step: 0.05 },
  { path: 'verbSpeedMult.retreat', label: '離れる倍率', group: 'behavior', section: '中立の移動', kind: 'frac', min: 0, max: 3, step: 0.05 },
  { path: 'verbSpeedMult.strafe', label: '並走の倍率', group: 'behavior', section: '中立の移動', kind: 'frac', min: 0, max: 3, step: 0.05 },
  { path: 'neutral.minMs', label: '中立の最短', group: 'behavior', section: '中立の移動', kind: 'ms', min: 0, max: 6000, step: 50 },
  { path: 'neutral.maxMs', label: '中立の最長', group: 'behavior', section: '中立の移動', kind: 'ms', min: 0, max: 8000, step: 50 },

  // §14-4: 「段数」「第二波」の hint はまだ無かったので足す。
  { path: 'stringLen.p1', label: '段数 P1', group: 'behavior', section: 'ストリングと休符', kind: 'num', min: 1, max: 8, step: 1, hint: '1回のストリングで出す技の数。フェーズ2で1段増える。' },
  { path: 'stringLen.p2', label: '段数 P2', group: 'behavior', section: 'ストリングと休符', kind: 'num', min: 1, max: 8, step: 1, hint: '1回のストリングで出す技の数。フェーズ2で1段増える。' },
  { path: 'rest.p1', label: '休符 P1', group: 'behavior', section: 'ストリングと休符', kind: 'ms', min: 0, max: 5000, step: 50, hint: '0にすると反撃窓が消える' },
  { path: 'rest.p2', label: '休符 P2', group: 'behavior', section: 'ストリングと休符', kind: 'ms', min: 0, max: 5000, step: 50 },
  { path: 'waveDelayMs', label: '第二波の遅れ(P2)', group: 'behavior', section: 'ストリングと休符', kind: 'ms', min: 0, max: 3000, step: 50, hint: 'フェーズ2で、同じ技がもう一度追いかけてくる仕組み。避けが2回必要になる。' },

  // §14-4: 「遠距離の長居」「密着の居座り」「同角度の長居」の hint はまだ無かったので足す。
  { path: 'punish.farMs', label: '遠距離の長居', group: 'behavior', section: '懲罰', kind: 'ms', min: 0, max: 10000, step: 100, hint: 'この時間だけ遠くに居続けると、懲罰の技が飛ぶ。' },
  { path: 'punish.meleeMs', label: '密着の居座り', group: 'behavior', section: '懲罰', kind: 'ms', min: 0, max: 10000, step: 100, hint: 'この時間だけ密着し続けると、ボスが離脱する。' },
  { path: 'punish.sameAngleMs', label: '同角度の長居', group: 'behavior', section: '懲罰', kind: 'ms', min: 0, max: 10000, step: 100, hint: '同じ方向に居続けると、並走の向きが反転する(回り込みを読まれる)。' },
  { path: 'sameAngleDeg', label: '同角度とみなす幅', group: 'behavior', section: '懲罰', kind: 'deg', min: 1, max: 180, step: 5 },
];

export const IDOL_TUNING_FIELDS: readonly TuningField[] = [
  ...behaviorFields(), ...moveFields(), ...shotFields(),
];
export const IDOL_TUNING_TEXT_FIELDS: readonly TuningTextField[] = shotTextFields();

// ---- 個別再生(社長要望v0.25.2625) --------------------------------------------------------------
// 技6本はスキーマの section(=MOVE_LABEL)と対応させる。移動語彙4つは専用の見出しにまとめる。
export const VERB_SECTION = '動き(単独再生)';
const VERB_LABEL: Record<NeutralVerb, string> = {
  close: '詰める', retreat: '離れる', strafe: '並走', hold: '止まる',
};

export const IDOL_PLAYABLES: readonly PlayableAction[] = [
  ...IDOL_ALL_MOVES.map(m => ({ kind: 'move' as const, key: m, label: MOVE_LABEL[m], section: MOVE_LABEL[m] })),
  // 射撃枠にも▶を出す。足していない枠は**見出しごと画面に出ない**(欄が全部隠れる)ので、
  // ここに8つ並べておいても余計なボタンは現れない。
  ...IDOL_SHOT_SLOTS.map(m => ({ kind: 'move' as const, key: m, label: '再生', section: shotSection(m) })),
  ...(['close', 'retreat', 'strafe', 'hold'] as NeutralVerb[])
    .map(v => ({ kind: 'verb' as const, key: v, label: VERB_LABEL[v], section: VERB_SECTION })),
];

/**
 * 「＋技を足す」: 空いている射撃枠を1つ有効にする(社長要望「新しい技を入れたい」)。
 * **8枠が上限**(技が多すぎるとプレイヤーが読めない)。埋まっている時は理由を返して何もしない。
 */
export const addIdolShot = (): { ok: boolean; message: string } => {
  const free = IDOL_SHOT_SLOTS.find(m => IDOL_TUNING.shots[m].enabled < 0.5);
  if (!free) return { ok: false, message: `射撃枠は${IDOL_SHOT_SLOTS.length}個までです` };
  IDOL_TUNING.shots[free].enabled = 1;
  return { ok: true, message: `${idolShotName(free)} を足しました(${idolEnabledShots().length}/${IDOL_SHOT_SLOTS.length})` };
};

// ---- ヘルプ(BOSS_MAKER.md §14) ------------------------------------------------------------------
// 節の説明。**文言は仕様書(§14-3)のそのまま**——ここで書き直すと表示と設計書が食い違う。
// キーは実際に画面へ出る `section` 文字列と一致させる(スキーマ駆動=UIはこの辞書を引くだけ)。
// ★roll/punch は MOVE_LABEL が `(roll)`/`(punch)` 付きの表記なので、**そのキーに合わせる**
//   (§14-3本文の見出しは括弧無し表記だが、section文字列と一致しないと該当節に説明が出ない=
//   「作ったのに出ていない」事故になる。CLAUDE.md 攻撃ヴィジュアル節の教訓と同型)。
const SECTION_HELP: Record<string, string> = {
  '基礎値': 'このボスの土台。HP・移動速度と、体が触れた時のダメージ。\n技ごとの威力は各技の欄にある(ここではない)。',
  // §18: 詳細OFFでは px の欄が画面に無いので、px の話をやめて「選ぶ」話に書き換える。
  '間合い': 'ボスが保ちたい距離と、距離帯の境目をまとめて選ぶ。近/中/遠で「どのくらい離れて戦うボスか」が決まる。\n細かい px は裏で決まっている(詳細を開くと出る)。距離帯ごとに出す技が変わる。',
  '中立の移動': '技を出していない間の動き方。詰める/離れる/並走の速さと、次の技までの間。',
  'ストリングと休符': '「手数」=技を何回続けて出すか。「休み」=その後に必ず入る休み。\nこの休みがプレイヤーの攻撃チャンス。短いほど厳しい。\n※台本の段が足りないと、手数を増やしても段数までしか出ない(下の警告に出る)。',
  '懲罰': 'プレイヤーが同じことを続けた時に、ボスが決まった返し技を出す仕組み。\n例: 遠くに居続けたら狙撃線 / 密着し続けたら離脱。「見られている」感を作る。\n厳しいほど早く反応する。',
  '台本': 'どの距離帯で、どの技を、どの順に出すか。ボスの手そのもの。',
  [MOVE_LABEL.aim]: '単発の弾。遠距離の圧の基礎。',
  [MOVE_LABEL.fan]: '扇状に複数発。主戦帯の主力。',
  [MOVE_LABEL.roll]: '判定を持たない移動だけの技。密着から間合いを作り直す。',
  [MOVE_LABEL.punch]: '目の前の帯にダメージ。密着に居座らせないための技。',
  [MOVE_LABEL.snipe]: '細長い帯。まっすぐ下がるだけでは避けられない=横に動かせる技。',
  [MOVE_LABEL.orb]: '追いかけてくる弾。走っても振り切れないので、詰めて内側に入るのが答え。',
  [VERB_SECTION]: '技を出さず、移動だけを見るための再生ボタン。',
  // 射撃枠は section が `射撃枠 s1`.. と枠ごとに違う文字列なので、8枠ぶんを機械的に展開する。
  ...Object.fromEntries(IDOL_SHOT_SLOTS.map(m => [shotSection(m), '画面から足した弾撃ち技。数字を変えると赤い予告の線も一緒に変わる。'])),
};

// ---- 台本エディタ(3便目・v0.25.2642) -----------------------------------------------------------
// 社長要望「技をパズルピースみたいにできる? 遠近中の枠にはめていく」+ 訂正「**台本の数の+-** /
// **技の段は入れ放題**」。UIはボスを知らないまま動くよう、必要な操作をこの1個にまとめて渡す。
//
// ★段に置ける技は**中核6技 + 有効な射撃枠**。射撃枠を足すと自動でここへ現れる
// (2便目と3便目が噛み合う=「ジャブを作って、殴りの後ろに置く」が画面だけで完結する)。
const scriptMoveKeys = (): IdolMove[] => [...IDOL_ALL_MOVES, ...idolEnabledShots()];
const moveLabelOf = (m: IdolMove): string =>
  isIdolShot(m) ? idolShotName(m) : MOVE_LABEL[m].replace(/\(.*\)$/, '');

export const IDOL_SCRIPT_API: BossScriptApi = {
  rows: () => IDOL_TUNING.strings.map(s => ({
    zone: s.zone,
    zoneLabel: ZONE_LABEL[s.zone] ?? s.zone,
    weight: s.weight,
    off: !!s.off,
    moves: s.moves.map(m => ({ key: m, label: moveLabelOf(m) })),
  })),
  moveChoices: () => scriptMoveKeys().map(m => ({ key: m, label: moveLabelOf(m) })),
  zoneChoices: () => SCRIPT_ZONES.map(z => ({ key: z, label: ZONE_LABEL[z] ?? z })),
  cutoff: () => stepCutoffIndex(IDOL_TUNING.stringLen.p1, IDOL_TUNING.stringLen.p2),
  warnings: () => [
    ...scriptWarnings(IDOL_TUNING.strings),
    // ★「手数=多」を選んでも P2 が台本の段数で切り詰められて**並と1ミリも変わらない**、という
    // 無言の空振りを気づける形にする(BOSS_MAKER.md §18-5)。段を足すのは社長が台本エディタでやる。
    ...stringLenWarnings(IDOL_TUNING.stringLen, IDOL_TUNING.strings.filter(s2 => !s2.off).map(s2 => s2.moves.length)),
  ],
  edit: (op: BossScriptOp) => {
    const L = IDOL_TUNING.strings;
    const mv = (k: string): IdolMove | null =>
      (scriptMoveKeys() as string[]).includes(k) ? (k as IdolMove) : null;
    switch (op.t) {
      case 'addScript': {
        // 足す時の1段目は**必ず使える技**にする(空や不明な技で始めない)。
        return addScript(L, 'near', scriptMoveKeys()[0]);
      }
      case 'removeScript': return removeScript(L, op.si);
      case 'setZone': return setScriptZone(L, op.si, op.zone as BossZone);
      case 'setWeight': return setScriptWeight(L, op.si, op.weight);
      case 'toggleScript': return toggleScript(L, op.si);
      case 'setStep': {
        const m = mv(op.move);
        return m ? setStep(L, op.si, op.mi, m) : { ok: false, message: '使えない技です' };
      }
      case 'insertStep': {
        const m = mv(op.move);
        return m ? insertStep(L, op.si, op.mi, m) : { ok: false, message: '使えない技です' };
      }
      case 'removeStep': return removeStep(L, op.si, op.mi);
      case 'moveStep': return moveStep(L, op.si, op.mi, op.dir);
    }
  },
  // 既定と同じなら null=保存もコピーもしない(「触っていない」が一目で分かる)。
  serialize: () => {
    const now = serializeScripts(IDOL_TUNING.strings);
    return now === serializeScripts(IDOL_TUNING_DEFAULTS.strings) ? null : now;
  },
  deserialize: (text: string) => {
    const next = parseScripts(text, scriptMoveKeys());
    if (!next) return false;
    replaceScripts(IDOL_TUNING.strings, next);
    return true;
  },
  reset: () => replaceScripts(IDOL_TUNING.strings, IDOL_TUNING_DEFAULTS.strings),
};

export const registerIdolTuning = (): void => {
  // 弾の性能を「11ボス共通の1行」から**このテーブル**へ差し替える。同じ参照を渡すので、
  // メーカーで数字を変えるとその場で次の弾から反映される。
  // ここに渡すのは**型の既定**(どの技でもない経路から撃たれた時の値)。実際の aim/fan/orb は
  // 発射地点(idolTick)で技ごとの値を明示的に渡す(社長指示v0.25.2628「弾速度とか個別にしないと」)。
  registerEnemyFireProfile('idol', IDOL_TUNING.bullet.aim);
  registerBossTuning({
    bossType: 'idol',
    label: 'アイドル',
    table: IDOL_TUNING as unknown as Record<string, unknown>,
    defaults: IDOL_TUNING_DEFAULTS as unknown as Record<string, unknown>,
    fields: IDOL_TUNING_FIELDS,
    textFields: IDOL_TUNING_TEXT_FIELDS,
    // §18: 行動パターンは「束で選ぶ」を主にする(中身の数値は詳細トグルでのみ出る)。
    choices: BEHAVIOR_CHOICES,
    playables: IDOL_PLAYABLES,
    // 見出しは固定文字列(`射撃枠 s3`)で持ち、表示だけ社長が付けた名前へ差し替える。
    sectionLabel: sec => {
      const slot = IDOL_SHOT_SLOTS.find(m => shotSection(m) === sec);
      return slot ? `${idolShotName(slot)}(${slot})` : sec;
    },
    addMove: addIdolShot,
    scripts: IDOL_SCRIPT_API,
    sectionHelp: SECTION_HELP,
    onPlay: (a, opts) => {
      if (a.kind === 'move') requestIdolMovePlay(a.key as IdolMove, opts);
      else requestIdolVerbPlay(a.key as NeutralVerb);
    },
    playState: () => getIdolPlayback(),
  });
};
