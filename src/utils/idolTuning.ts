// ボスメーカー(BOSS_MAKER.md §2-3): idol の**スキーマ**とレジストリ登録。
// UIはこのスキーマを読んでフォームを自動生成する=**1ボス対応 = テーブル + スキーマを1つ書くだけ**。
// ボスを足すたびにUIを書かない(ここを守らないと14体で破綻する)。
//
// ★社長補足v0.25.2621「一騎打ちのトレーニング場 兼 メーカー。**その場で動かしながら**数字を調整する」:
// 主たる操作は**キーボードで打つことではなく「摘まむ」**(ドラッグでスクラブ / +− ボタン)。
// よって **step(刻み幅)がスキーマの主役**になる。刻みが合っていないとスクラブが使い物にならない。
// 叩き台の刻み: ms=50 / px=10 / 倍率=0.05 / 重み=5 / 個数=1。
import { registerEnemyFireProfile } from './enemyUtils';
import { registerBossTuning, type TuningField, type PlayableAction } from './bossTuning';
import { IDOL_TUNING, IDOL_TUNING_DEFAULTS, IDOL_ALL_MOVES, type IdolMove } from './idolScript';
import { requestIdolMovePlay, requestIdolVerbPlay, getIdolPlayback } from './idolTick';
import type { NeutralVerb } from './bossSkeleton';

const MOVE_LABEL: Record<IdolMove, string> = {
  aim: '狙い撃ち(aim)', fan: '連射扇(fan)', roll: '離脱ローリング(roll)',
  punch: '至近の殴り(punch)', snipe: '狙撃線(snipe)', orb: '追尾弾(orb)',
};

// 技ごとの「図形」欄(判定と描画が同じ値を読むので、ここを動かすと赤い予告も一緒に動く)。
const SHAPE_FIELDS: Partial<Record<IdolMove, TuningField[]>> = {
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
const bulletFields = (m: IdolMove): TuningField[] => {
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
  if (m === 'punch' || m === 'snipe') {
    return [{ path: `moveDamage.${m}`, label: 'ダメージ', group: 'move', section: sec, kind: 'num', min: 0, max: 400, step: 5 }];
  }
  return []; // roll は判定を持たない(離脱のみ)
};

const moveFields = (): TuningField[] => {
  const out: TuningField[] = [];
  for (const m of IDOL_ALL_MOVES) {
    const sec = MOVE_LABEL[m];
    out.push(
      { path: `timing.${m}.windup`, label: '予告', group: 'move', section: sec, kind: 'ms', min: 0, max: 5000, step: 50, hint: '予告が出てから判定まで' },
      { path: `timing.${m}.active`, label: '判定', group: 'move', section: sec, kind: 'ms', min: 0, max: 3000, step: 50 },
      { path: `timing.${m}.recover`, label: '硬直', group: 'move', section: sec, kind: 'ms', min: 0, max: 5000, step: 50, hint: '反撃窓。820ms=近接1発' },
    );
    out.push(...bulletFields(m));       // 予告/判定/硬直の直後=どの技でも同じ位置に弾の項目が並ぶ
    out.push(...(SHAPE_FIELDS[m] ?? []));
  }
  return out;
};

// 台本の重み(距離帯ごとの頻度)。BOSS_MAKER.md §1-4「頻度(重み)…ゾーン別に出す」。
const ZONE_LABEL: Record<string, string> = { melee: '密着(0〜140)', near: '主戦帯(140〜340)', mid: '遠(340〜700)', far: '超遠(700〜)' };
const stringFields = (): TuningField[] =>
  IDOL_TUNING_DEFAULTS.strings.map((s, i) => ({
    path: `strings.${i}.weight`,
    label: s.moves.join('→'),
    group: 'behavior' as const,
    section: `台本の頻度 ${ZONE_LABEL[s.zone] ?? s.zone}`,
    kind: 'num' as const,
    min: 0, max: 200, step: 5,
  }));

const behaviorFields = (): TuningField[] => [
  { path: 'stats.health', label: 'HP', group: 'behavior', section: '基礎値', kind: 'num', min: 500, max: 40000, step: 500 },
  // ★これは**体が触れた時**のダメージ(技のダメージとは別軸)。技ごとの威力は各技のセクションにある
  // (`bullet.*.damage` / `moveDamage.*`)。v0.25.2629で分離するまでは殴り/狙撃線がこの値を流用していた。
  { path: 'stats.damage', label: '接触ダメージ', group: 'behavior', section: '基礎値', kind: 'num', min: 0, max: 999, step: 5, hint: '体が触れた時。技の威力は各技の欄' },
  { path: 'stats.speed', label: '移動速度', group: 'behavior', section: '基礎値', kind: 'pxs', min: 0, max: 600, step: 10 },
  { path: 'phaseHpThreshold', label: 'フェーズ2の閾値', group: 'behavior', section: '基礎値', kind: 'frac', min: 0, max: 1, step: 0.05, hint: 'HP割合' },

  { path: 'neutralBand.min', label: '主戦帯 下限', group: 'behavior', section: '間合い', kind: 'px', min: 0, max: 2000, step: 10 },
  { path: 'neutralBand.max', label: '主戦帯 上限', group: 'behavior', section: '間合い', kind: 'px', min: 0, max: 2000, step: 10 },
  { path: 'zoneEdges.meleeMax', label: '密着帯の上限', group: 'behavior', section: '間合い', kind: 'px', min: 0, max: 2000, step: 10 },
  { path: 'zoneEdges.nearMax', label: '中帯の上限', group: 'behavior', section: '間合い', kind: 'px', min: 0, max: 1500, step: 10 },
  { path: 'zoneEdges.midMax', label: '遠帯の上限', group: 'behavior', section: '間合い', kind: 'px', min: 0, max: 2000, step: 20 },

  { path: 'verbSpeedMult.close', label: '詰める倍率', group: 'behavior', section: '中立の移動', kind: 'frac', min: 0, max: 3, step: 0.05 },
  { path: 'verbSpeedMult.retreat', label: '離れる倍率', group: 'behavior', section: '中立の移動', kind: 'frac', min: 0, max: 3, step: 0.05 },
  { path: 'verbSpeedMult.strafe', label: '並走の倍率', group: 'behavior', section: '中立の移動', kind: 'frac', min: 0, max: 3, step: 0.05 },
  { path: 'neutral.minMs', label: '中立の最短', group: 'behavior', section: '中立の移動', kind: 'ms', min: 0, max: 6000, step: 50 },
  { path: 'neutral.maxMs', label: '中立の最長', group: 'behavior', section: '中立の移動', kind: 'ms', min: 0, max: 8000, step: 50 },

  { path: 'stringLen.p1', label: '段数 P1', group: 'behavior', section: 'ストリングと休符', kind: 'num', min: 1, max: 8, step: 1 },
  { path: 'stringLen.p2', label: '段数 P2', group: 'behavior', section: 'ストリングと休符', kind: 'num', min: 1, max: 8, step: 1 },
  { path: 'rest.p1', label: '休符 P1', group: 'behavior', section: 'ストリングと休符', kind: 'ms', min: 0, max: 5000, step: 50, hint: '0にすると反撃窓が消える' },
  { path: 'rest.p2', label: '休符 P2', group: 'behavior', section: 'ストリングと休符', kind: 'ms', min: 0, max: 5000, step: 50 },
  { path: 'waveDelayMs', label: '第二波の遅れ(P2)', group: 'behavior', section: 'ストリングと休符', kind: 'ms', min: 0, max: 3000, step: 50 },

  { path: 'punish.farMs', label: '遠距離の長居', group: 'behavior', section: '懲罰', kind: 'ms', min: 0, max: 10000, step: 100 },
  { path: 'punish.meleeMs', label: '密着の居座り', group: 'behavior', section: '懲罰', kind: 'ms', min: 0, max: 10000, step: 100 },
  { path: 'punish.sameAngleMs', label: '同角度の長居', group: 'behavior', section: '懲罰', kind: 'ms', min: 0, max: 10000, step: 100 },
  { path: 'sameAngleDeg', label: '同角度とみなす幅', group: 'behavior', section: '懲罰', kind: 'deg', min: 1, max: 180, step: 5 },
];

export const IDOL_TUNING_FIELDS: readonly TuningField[] = [
  ...behaviorFields(), ...stringFields(), ...moveFields(),
];

// ---- 個別再生(社長要望v0.25.2625) --------------------------------------------------------------
// 技6本はスキーマの section(=MOVE_LABEL)と対応させる。移動語彙4つは専用の見出しにまとめる。
export const VERB_SECTION = '動き(単独再生)';
const VERB_LABEL: Record<NeutralVerb, string> = {
  close: '詰める', retreat: '離れる', strafe: '並走', hold: '止まる',
};

export const IDOL_PLAYABLES: readonly PlayableAction[] = [
  ...IDOL_ALL_MOVES.map(m => ({ kind: 'move' as const, key: m, label: MOVE_LABEL[m], section: MOVE_LABEL[m] })),
  ...(['close', 'retreat', 'strafe', 'hold'] as NeutralVerb[])
    .map(v => ({ kind: 'verb' as const, key: v, label: VERB_LABEL[v], section: VERB_SECTION })),
];

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
    playables: IDOL_PLAYABLES,
    onPlay: (a, opts) => {
      if (a.kind === 'move') requestIdolMovePlay(a.key as IdolMove, opts);
      else requestIdolVerbPlay(a.key as NeutralVerb);
    },
    playState: () => getIdolPlayback(),
  });
};
