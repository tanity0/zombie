// ボスメーカー(BOSS_MAKER.md §2-3 / §6 フェーズ4・第4弾): **裏ボス4体のスキーマ**とレジストリ登録。
//
// UIはこのスキーマを読んでフォームを自動生成する=**1ボス対応 = テーブル + スキーマを1つ書くだけ**
// (ここを守らないと14体で破綻する)。パネルは1行も書かない。
//
// 刻み幅(step)の叩き台は idolTuning.ts / bountyTuning.ts / angelTuning.ts に倣う:
// ms=50 / px=10 / 倍率=0.05 / 個数=1。
//
// ★「4体共通」と書いてある欄は `common.*`(hiddenBossScript.ts の HIDDEN_COMMON_TUNING)を指す。
//   実体は4体で1個なので、**どのボスの画面で動かしても4体全員に効く**。複製してボスごとに分けると
//   挙動の構造が変わる=仕様変更なので、共有のままにしてある(ヘルプにもその旨を書く)。
//
// ここに**無い**もの(=まだ画面から触れない・BOSS_MAKER.md §6の次バッチ):
//  - 技の**抽選**(距離帯・重み・フェーズ別の出し分け・連携の台本): mimirScript / jormungandScript /
//    skadiScript / thorScript / bossChoreography が正本(store非依存の別の葉)。
//  - **レーザーの寸法/溜め**: `mimirLaserTrack.ts` が正本で、バス停(bounty-ranged)と共有している。
//    賞金首パネルのレーザー節と同じ切り分けで、ここでも触れるのは威力・硬直・揺れだけ。
//  - **氷塊/氷刃の飛翔体そのもの**(半径/速度/寿命)と**場の値**(出現深度・帰巣・召喚ヘイト距離)。
//  - 旧実装(`?<boss>script=0`)専用の抽選確率。
import { registerBossTuning, type TuningField, type PlayableAction } from './bossTuning';
import {
  requestHiddenBossMovePlay, getHiddenBossPlayback, HIDDEN_MOVES_BY_TYPE, type HiddenMoveKey,
} from '../../utils/hiddenBossPlayback';
import {
  HIDDEN_MIMIR_TUNING, HIDDEN_MIMIR_TUNING_DEFAULTS,
  HIDDEN_JORMUNGAND_TUNING, HIDDEN_JORMUNGAND_TUNING_DEFAULTS,
  HIDDEN_SKADI_TUNING, HIDDEN_SKADI_TUNING_DEFAULTS,
  HIDDEN_THOR_TUNING, HIDDEN_THOR_TUNING_DEFAULTS,
} from '../../utils/hiddenBossScript';

// 欄を作る小道具(section を毎行書かないためだけのもの。意味は素の TuningField と同じ)。
const mk = (section: string, group: 'behavior' | 'move') =>
  (path: string, label: string, kind: TuningField['kind'],
    min: number, max: number, step: number, hint?: string): TuningField =>
    ({ path, label, group, section, kind, min, max, step, hint });

// 共通の言い回し(idolTuning.ts / bountyTuning.ts / angelTuning.ts と同じ文言に揃える)。
const HINT_WINDUP = '予告が出てから判定まで';
const HINT_RECOVER = '反撃窓。820ms=近接1発';
const HINT_ACTIVE = '当たり判定が出ている時間';
const HINT_SHARED = '★裏ボス4体で共通(1つ動かすと4体全員に効く)';

/** 「次の技までの間」は4体とも同じ(行動パターンの節へ足す)。 */
const neutralFields = (section: string, withMax: boolean): TuningField[] => {
  const mv = mk(section, 'behavior');
  const out = [
    mv('common.actionMinMs', '次の技までの間 下限', 'ms', 0, 10000, 100, `技が終わってから次を選ぶまで。${HINT_SHARED}`),
  ];
  if (withMax) out.push(mv('common.actionMaxMs', '次の技までの間 上限', 'ms', 0, 15000, 100, `${HINT_SHARED}。台帳(フェーズ別の間)がある時はそちらが優先`));
  out.push(mv('common.turnResponse', '追いかけの慣性', 'frac', 0.2, 10, 0.05, `小さいほど慣性が大きい(ぬるっと曲がる)。${HINT_SHARED}`));
  return out;
};

/** 突進(mimir/jormungand/skadi で同じ実体)。3体のパネルに同じパスで載せる。 */
const dashFields = (section: string): TuningField[] => {
  const ds = mk(section, 'move');
  return [
    ds('common.dash.windup', '予告', 'ms', 0, 5000, 50, `${HINT_WINDUP}。${HINT_SHARED}`),
    ds('common.dash.ms', '走る時間', 'ms', 50, 3000, 50, `短いほど鋭く飛び込む。${HINT_SHARED}`),
    ds('common.dash.speedMult', '走る速さ 倍率', 'frac', 1, 10, 0.05, `歩行速度の何倍で突っ込むか。${HINT_SHARED}`),
    ds('common.dash.backstepMult', '溜め中の後退り 倍率', 'frac', 0, 2, 0.05, `溜めながら少し下がる速さ。${HINT_SHARED}`),
    ds('common.dash.homing', '突進中の弱い追尾', 'frac', 0, 1, 0.01, `1フレームごとに狙いへ寄る量。${HINT_SHARED}`),
    ds('common.dash.recover', '硬直', 'ms', 0, 5000, 50, `${HINT_RECOVER}。${HINT_SHARED}`),
  ];
};

// ================================================================================================
// ミーミル(mimir)
// ================================================================================================
const MI_SEC = {
  move: '動き', burst: '弾3連(mi-burst)', radial: '全方位(mi-radial)', dash: '突進(mi-dash)',
  bite: '群体の噛みつき(mi-bite)', laser: 'レーザー(mi-laser)',
};

const mimirFields = (): TuningField[] => {
  const bu = mk(MI_SEC.burst, 'move');
  const ra = mk(MI_SEC.radial, 'move');
  const bi = mk(MI_SEC.bite, 'move');
  const la = mk(MI_SEC.laser, 'move');
  return [
    ...neutralFields(MI_SEC.move, true),

    bu('common.aimBurstMs', '予告(立ち止まり)', 'ms', 0, 5000, 50, `${HINT_WINDUP}。${HINT_SHARED}`),
    bu('common.burstShots', '発数', 'num', 1, 12, 1, HINT_SHARED),
    bu('common.burstGapMs', '発の間隔', 'ms', 50, 3000, 50, HINT_SHARED),
    bu('burstRecover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),

    ra('common.aimRadialMs', '予告(立ち止まり)', 'ms', 0, 5000, 50, `${HINT_WINDUP}。${HINT_SHARED}`),
    ra('common.radialCount', '弾数(1周ぶん)', 'num', 4, 40, 1, HINT_SHARED),
    ra('radialRecover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),

    ...dashFields(MI_SEC.dash),

    bi('bite.windup', '予告', 'ms', 0, 5000, 50, `${HINT_WINDUP}。赤い円=判定(半径は体格から決まる固定値)`),
    bi('bite.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    bi('bite.cdMs', 'クールダウン', 'ms', 0, 30000, 500, '短いほど頻繁に噛む'),

    la('laser.damage', 'ダメージ', 'num', 0, 200, 1, '直撃したときの威力'),
    la('laser.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    la('laser.shakeMag', '発射中の揺れ', 'num', 0, 30, 1, '画面シェイクの振幅(演出のみ)'),
  ];
};

const MI_HELP: Record<string, string> = {
  [MI_SEC.move]: '深層域の巨大な眼。真っ直ぐ追いながら、間合いに応じて弾・突進・噛みつき・レーザーを選ぶ。',
  [MI_SEC.burst]: '立ち止まって狙い撃つ3連発。発数と間隔は4体共通の設定を読む。',
  [MI_SEC.radial]: '立ち止まって全方位へ一斉射。隙間を抜けて詰める技。',
  [MI_SEC.dash]: '溜めながら少し下がってから一直線に突っ込む。突進中も体当たりカウンターで止められる。',
  [MI_SEC.bite]: '本体直下の群体が一斉に噛む密着専用の円。**赤い円の半径は体格から決まる固定値**(bodyCenteredAoe.tsが正本)で、ここでは触れない。',
  [MI_SEC.laser]: '追尾する赤い線が溜まり、ロックしてから太い光線。**寸法と溜めは mimirLaserTrack.ts が正本**(バス停のレーザーと共有)なので、ここで触れるのは威力・硬直・揺れだけ。',
};

// ================================================================================================
// ヨルムンガルド(jormungand)
// ================================================================================================
const JO_SEC = {
  move: '動き', burst: '3-way扇(jo-burst)', radial: '螺旋の全方位(jo-radial)',
  dash: '突進(jo-dash)', coil: 'うねり(jo-coil)',
};

const jormungandFields = (): TuningField[] => {
  const bu = mk(JO_SEC.burst, 'move');
  const ra = mk(JO_SEC.radial, 'move');
  const co = mk(JO_SEC.coil, 'move');
  return [
    ...neutralFields(JO_SEC.move, true),

    bu('common.aimBurstMs', '予告(立ち止まり)', 'ms', 0, 5000, 50, `${HINT_WINDUP}。${HINT_SHARED}`),
    bu('burst.volleys', '扇を撃つ回数', 'num', 1, 20, 1, '1回=3発の扇。5回で計15発'),
    bu('burst.gapMs', '扇の間隔', 'ms', 50, 3000, 50),
    bu('burst.fanSpread', '扇の開き', 'frac', 0, 1.5, 0.01, 'rad。左右へ広がる角度(0.18≈10°)'),
    bu('burst.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),

    ra('common.aimRadialMs', '予告(立ち止まり)', 'ms', 0, 5000, 50, `${HINT_WINDUP}。${HINT_SHARED}`),
    ra('common.radialCount', '弾数(1周ぶん)', 'num', 4, 40, 1, HINT_SHARED),
    ra('radial.volleys', '撃つ回数', 'num', 1, 20, 1, '1周を何回繰り返すか'),
    ra('radial.gapMs', '周の間隔', 'ms', 50, 3000, 50),
    ra('radial.spin', '1周ごとの回転', 'frac', 0, 1, 0.01, 'rad。毎回ずらすので螺旋になる(0=同じ形の重ね撃ち)'),
    ra('radial.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),

    ...dashFields(JO_SEC.dash),

    co('coil.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    co('coil.active', '判定', 'ms', 10, 2000, 10, HINT_ACTIVE),
    co('coil.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    co('coil.cdMs', 'クールダウン', 'ms', 0, 30000, 500),
    co('coil.range', '帯の長さ', 'px', 10, 800, 10, '赤い帯=判定。既定はトールの払いと同値'),
    co('coil.halfWidth', '帯の半幅', 'px', 4, 200, 10, '赤い帯=判定'),
  ];
};

const JO_HELP: Record<string, string> = {
  [JO_SEC.move]: '深層域の巨蛇。弾幕の量で押すボスで、後半は近接の「うねり」が増える。',
  [JO_SEC.burst]: '狙いを追う3発の扇を続けて撃つ。密度はここの回数と間隔で決まる。',
  [JO_SEC.radial]: '全方位を何度も撃ちながら少しずつ回す=螺旋。回転を0にすると同じ隙間が続く(避け方が変わる)。',
  [JO_SEC.dash]: '一直線に突っ込む。値は4体共通(ミーミル/スカジと同じ実体)。',
  [JO_SEC.coil]: '近接専用の薙ぎ。長さ/半幅の既定はトールの払いと同値だが、**ここを動かしてもトールは変わらない**(別の欄)。',
};

// ================================================================================================
// スカジ(skadi)
// ================================================================================================
const SK_SEC = {
  move: '動き', ice: '氷塊(sk-ice)', blade: '氷の刃(sk-blade)', cage: '氷結の檻(sk-cage)',
  burst: '弾3連(sk-burst)', radial: '全方位(sk-radial)', dash: '突進(sk-dash)',
};

const skadiFields = (): TuningField[] => {
  const ic = mk(SK_SEC.ice, 'move');
  const bl = mk(SK_SEC.blade, 'move');
  const ca = mk(SK_SEC.cage, 'move');
  const bu = mk(SK_SEC.burst, 'move');
  const ra = mk(SK_SEC.radial, 'move');
  return [
    ...neutralFields(SK_SEC.move, true),

    ic('preWindup', '設置前の予告', 'ms', 0, 3000, 50, `${HINT_WINDUP}。★氷塊と氷の刃で共通`),
    ic('ice.count', '個数', 'num', 1, 20, 1),
    ic('ice.gapMs', '置く間隔', 'ms', 50, 5000, 50),
    ic('ice.telegraphMs', '起爆までの時間', 'ms', 100, 8000, 50, '置いてから爆ぜるまで(避ける時間)。★氷結の檻の氷塊も同じ値を読む'),
    ic('ice.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),

    bl('blade.count', '個数', 'num', 1, 20, 1),
    bl('blade.gapMs', '置く間隔', 'ms', 50, 5000, 50),
    bl('blade.delayMs', '刃が飛ぶまで', 'ms', 0, 5000, 50, '置いてから発射までの間(避ける時間)'),
    bl('blade.ringMin', '出る輪の半径 下限', 'px', 0, 600, 10, '狙った相手の周囲この距離に置く'),
    bl('blade.ringMax', '出る輪の半径 上限', 'px', 0, 600, 10),
    bl('blade.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),

    ca('cage.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    ca('cage.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    ca('cage.cdMs', 'クールダウン', 'ms', 0, 30000, 500),
    ca('cage.ringRadius', 'リングの半径', 'px', 20, 600, 10, '相手を中心に氷塊を並べる輪'),
    ca('cage.count', '氷塊の数', 'num', 1, 20, 1, '隙間が1箇所だけ空く'),

    bu('common.aimBurstMs', '予告(立ち止まり)', 'ms', 0, 5000, 50, `${HINT_WINDUP}。${HINT_SHARED}`),
    bu('common.burstShots', '発数', 'num', 1, 12, 1, HINT_SHARED),
    bu('common.burstGapMs', '発の間隔', 'ms', 50, 3000, 50, HINT_SHARED),
    bu('burstRecover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),

    ra('common.aimRadialMs', '予告(立ち止まり)', 'ms', 0, 5000, 50, `${HINT_WINDUP}。${HINT_SHARED}`),
    ra('common.radialCount', '弾数(1周ぶん)', 'num', 4, 40, 1, HINT_SHARED),
    ra('radialRecover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),

    ...dashFields(SK_SEC.dash),
  ];
};

const SK_HELP: Record<string, string> = {
  [SK_SEC.move]: '氷の死王。足場を潰す設置技が主で、後半に「氷結の檻」で逃げ道を1つに絞ってくる。',
  [SK_SEC.ice]: '相手の足元へ氷塊を置き、少し置いてから起爆する。置いてから爆ぜるまでが避けどころ。',
  [SK_SEC.blade]: '周囲の輪の上に刃を置き、少し置いてから内向きに発射する。刃の速さ/寿命はゲーム側の共通値で、ここでは触れない。',
  [SK_SEC.cage]: '相手を囲む輪に氷塊を並べ、1箇所だけ隙間を空ける(Phase3専用)。起爆までの時間は氷塊の設定を読む。',
  [SK_SEC.burst]: '立ち止まって狙い撃つ3連発。発数と間隔は4体共通の設定。',
  [SK_SEC.radial]: '立ち止まって全方位へ一斉射。',
  [SK_SEC.dash]: '一直線に突っ込む。値は4体共通(ミーミル/ヨルムンガルドと同じ実体)。',
};

// ================================================================================================
// トール(thor)
// ================================================================================================
const TH_SEC = {
  move: '動きと間合い', backstep: 'バックステップ', orbitStep: '旋回ステップ', slowWalk: 'ゆっくり歩き',
  issen: '一閃(th-issen)', tsuki: '突き(th-tsuki)', harai: '払い(th-harai)', jump: '飛び掛かり(th-jump)',
  dash: '突進(th-dash)',
};

const thorFields = (): TuningField[] => {
  const mv = mk(TH_SEC.move, 'behavior');
  const bs = mk(TH_SEC.backstep, 'behavior');
  const os = mk(TH_SEC.orbitStep, 'behavior');
  const sw = mk(TH_SEC.slowWalk, 'behavior');
  const is = mk(TH_SEC.issen, 'move');
  const ts = mk(TH_SEC.tsuki, 'move');
  const ha = mk(TH_SEC.harai, 'move');
  const jp = mk(TH_SEC.jump, 'move');
  const dh = mk(TH_SEC.dash, 'move');
  return [
    mv('orbit.distPx', '旋回する距離', 'px', 50, 800, 10, '中心間の目標距離。既定216=ハンドガン射程176+40(=撃たれにくい間合い)'),
    mv('orbit.approachSlack', '接近⇄旋回の余裕', 'px', 0, 400, 10, 'この幅の中では切り替えない(ハンチング防止)'),
    mv('orbit.speedMult', '旋回の速さ 倍率', 'frac', 0, 2, 0.05, '自分の速さに掛ける'),
    mv('orbit.radiusCorrect', '旋回半径の戻し', 'frac', 0, 20, 0.5, '大きいほど素早く目標距離へ戻る'),
    mv('approachSpeed', '接近の速さ', 'pxs', 0, 400, 5, 'プレイヤーは104.4px/s(既定43.5=プレイヤー基準速度の半分)'),
    mv('retreatSpeed', '後ずさりの速さ', 'pxs', 0, 400, 5, '旋回距離より近づかれた時'),
    mv('counterLeapMs', 'カウンター後の後退', 'ms', 0, 2000, 20, '弾かれた時に飛び退く時間'),
    ...neutralFields(TH_SEC.move, false),

    bs('backstep.minIntervalMs', '間隔 下限', 'ms', 0, 20000, 100, '近づかれている間だけ発火する'),
    bs('backstep.maxIntervalMs', '間隔 上限', 'ms', 0, 20000, 100),
    bs('backstep.distPx', '下がる距離', 'px', 0, 400, 10),
    bs('backstep.ms', '所要時間', 'ms', 20, 2000, 20, '短いほど鋭く跳ぶ'),

    os('orbitStep.minIntervalMs', '間隔 下限', 'ms', 0, 20000, 100, '旋回の適正距離にいる間だけ発火する'),
    os('orbitStep.maxIntervalMs', '間隔 上限', 'ms', 0, 20000, 100),
    os('orbitStep.distPx', '進む距離', 'px', 0, 400, 10, '接線方向へ弾む'),
    os('orbitStep.ms', '所要時間', 'ms', 20, 2000, 20),

    sw('slowWalk.ms', '続く時間', 'ms', 0, 10000, 100, 'たまに歩みを緩める(読ませる間)'),
    sw('slowWalk.mult', '速さ 倍率', 'frac', 0, 1, 0.05, '接近/後退/旋回のどれにも掛かる'),
    sw('slowWalk.minIntervalMs', '間隔 下限', 'ms', 0, 20000, 100),
    sw('slowWalk.maxIntervalMs', '間隔 上限', 'ms', 0, 20000, 100),

    // ★一閃は2段(research/THOR_ISSEN_REWORK.md §1)。▸の粒度は「一閃=1本」のまま=押すと**紫から**再生される。
    is('issen.nihilMs', '無の境地(紫)の時間', 'ms', 0, 3000, 50, '段1。紫の円を出すだけ(ダメージなし・カウンター不可)。この後に赤の予告が来る'),
    is('issen.nihilRadius', '無の境地(紫)の半径', 'px', 20, 600, 10, '**紫の円の絵・必中の引き金・ボットが振るのを止める範囲**が同時に動く。円の中で近接を振ると必中一閃'),
    is('issen.windup', '予告', 'ms', 0, 6000, 50, `${HINT_WINDUP}。段2(赤)。紫300+赤500=読み時間800ms`),
    is('issen.dashMs', '走る時間', 'ms', 20, 2000, 20, '終着点まで一気に移動する時間'),
    is('issen.range', 'ラインの長さ', 'px', 10, 800, 10, '赤い帯=判定。終着点までの距離'),
    is('issen.halfWidth', 'ラインの半幅', 'px', 4, 200, 5, '赤い帯=判定'),
    is('issen.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),

    ts('tsuki.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    ts('tsuki.ms', '判定', 'ms', 10, 2000, 10, HINT_ACTIVE),
    ts('tsuki.range', '帯の長さ', 'px', 10, 800, 10, '赤い帯=判定。本体は動かない(間合いだけ伸びる)'),
    ts('tsuki.halfWidth', '帯の半幅', 'px', 4, 200, 5, '細長いのがこの技の性格'),
    ts('tsuki.trackFrac', '溜め中の追従', 'frac', 0, 2, 0.05, 'プレイヤー速度に対する狙いの追従。小さいほど動けば外せる'),
    ts('tsuki.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),

    ha('harai.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    ha('harai.active', '判定', 'ms', 10, 2000, 10, HINT_ACTIVE),
    ha('harai.range', '帯の長さ', 'px', 10, 800, 10, '赤い帯=判定'),
    ha('harai.halfWidth', '帯の半幅', 'px', 4, 200, 10, '赤い帯=判定'),
    ha('harai.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),

    jp('jump.windup', '予告', 'ms', 0, 5000, 50, `${HINT_WINDUP}。着地円はここから出る`),
    jp('jump.ms', '滞空', 'ms', 50, 3000, 20, '飛び上がってから着地するまで'),
    jp('jump.radius', '着地円の半径', 'px', 10, 400, 10, '赤い円=判定。伸ばしたら予告も伸ばす'),
    jp('jump.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    jp('jump.triggerHits', '発火する被弾数', 'num', 1, 20, 1, '画面外からこの回数撃たれると間合いを詰める'),
    jp('jump.triggerWindowMs', '被弾を数える時間', 'ms', 500, 30000, 500),

    dh('dash.windup', '予告', 'ms', 0, 5000, 50, `${HINT_WINDUP}。赤い流星ライン(カウンター可)`),
    dh('dash.moveMs', '走る時間', 'ms', 50, 2000, 10, '短いほど鋭く踏み込む'),
    dh('dash.strikeMs', '斬り抜けの判定', 'ms', 10, 2000, 10, `${HINT_ACTIVE}。カプセルの寸法は払いの帯を流用する`),
    dh('dash.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    dh('dash.cdMs', 'クールダウン', 'ms', 0, 30000, 500, 'この技だけの再使用待ち'),
  ];
};

const TH_HELP: Record<string, string> = {
  [TH_SEC.move]: '鬼刀の武人。弾もダッシュも使わず、間合いを保ちながら刀3種で勝負する。旋回距離が戦いの骨格。',
  [TH_SEC.backstep]: '近づかれている間、たまに後ろへ跳ぶ。攻撃サイクルとは独立(次の技の時刻はずれない)。',
  [TH_SEC.orbitStep]: '適正距離を保っている間、たまに接線方向へ弾む。等速の円運動に緩急を付ける役。',
  [TH_SEC.slowWalk]: 'たまに歩みを緩める。接近/後退/旋回のどれにも一律で掛かる一時的な減速。',
  [TH_SEC.issen]: '**必ず2段**で出る。①無の境地=紫の円(何も起きない。ただし**この円の中で近接を振ると即・必中の一閃**が来る)'
    + '②一閃=赤いラインを引いてそのライン上だけを斬る(従来どおりカウンター可)。**赤い帯=判定**なので長さ/半幅を動かしたら予告も見直す。',
  [TH_SEC.tsuki]: '本体は動かず間合いだけが伸びる細い突き。溜め中の追従を上げるほど避けにくくなる。',
  [TH_SEC.harai]: 'ロックした並行ライン上を薙ぐ。横へ抜ける技。',
  [TH_SEC.jump]: '画面外から撃たれ続けた時の答え。着地点に赤い円=**円から歩いて出られる予告か**が公平の物差し。',
  [TH_SEC.dash]: 'ミゲル型の踏み込み突進。カウンターすると**来た方向へ弾き返す**(素通り事故の対策・ミゲル/ウリと共有の設定)。',
};

// ================================================================================================
// ▸個別再生(社長指示「技再生ボタンは必須」)
// ================================================================================================
// section は**数値欄と同じ見出し文字列**にする(UIはsectionで突き合わせるので、ここがズレると
// 「見出しはあるのに▸が別の場所に出る」になる)。1つの節に1つなら見出しの右に▸が出る。
const play = (key: HiddenMoveKey, label: string, section: string): PlayableAction =>
  ({ kind: 'move', key, label, section });

const MI_PLAYABLES: readonly PlayableAction[] = [
  play('mi-burst', '弾3連', MI_SEC.burst),
  play('mi-radial', '全方位', MI_SEC.radial),
  play('mi-dash', '突進', MI_SEC.dash),
  play('mi-bite', '噛みつき', MI_SEC.bite),
  play('mi-laser', 'レーザー', MI_SEC.laser),
];
const JO_PLAYABLES: readonly PlayableAction[] = [
  play('jo-burst', '3-way扇', JO_SEC.burst),
  play('jo-radial', '螺旋の全方位', JO_SEC.radial),
  play('jo-dash', '突進', JO_SEC.dash),
  play('jo-coil', 'うねり', JO_SEC.coil),
];
const SK_PLAYABLES: readonly PlayableAction[] = [
  play('sk-ice', '氷塊', SK_SEC.ice),
  play('sk-blade', '氷の刃', SK_SEC.blade),
  play('sk-cage', '氷結の檻', SK_SEC.cage),
  play('sk-burst', '弾3連', SK_SEC.burst),
  play('sk-radial', '全方位', SK_SEC.radial),
  play('sk-dash', '突進', SK_SEC.dash),
];
const TH_PLAYABLES: readonly PlayableAction[] = [
  play('th-issen', '一閃', TH_SEC.issen),
  play('th-tsuki', '突き', TH_SEC.tsuki),
  play('th-harai', '払い', TH_SEC.harai),
  play('th-jump', '飛び掛かり', TH_SEC.jump),
  play('th-dash', '突進', TH_SEC.dash),
];

/** ▸を押した時の実行(4体で同じ1本。ボス側の要求箱へ渡すだけ)。 */
const onHiddenPlay = (a: PlayableAction, opts: { solo: boolean; loop: boolean }): void => {
  requestHiddenBossMovePlay(a.key as HiddenMoveKey, opts);
};

/**
 * 「並べたボタン」と「ボス側が実際に始められる技」が食い違っていないかの検算材料
 * (hiddenBossTuning.test.ts が突き合わせる。押しても何も起きないボタンを作らないため)。
 */
export const HIDDEN_PLAYABLES_BY_TYPE: Readonly<Record<string, readonly PlayableAction[]>> = {
  mimir: MI_PLAYABLES,
  jormungand: JO_PLAYABLES,
  skadi: SK_PLAYABLES,
  thor: TH_PLAYABLES,
};
export { HIDDEN_MOVES_BY_TYPE };

// ================================================================================================
// 登録
// ================================================================================================
export const HIDDEN_MIMIR_FIELDS: readonly TuningField[] = mimirFields();
export const HIDDEN_JORMUNGAND_FIELDS: readonly TuningField[] = jormungandFields();
export const HIDDEN_SKADI_FIELDS: readonly TuningField[] = skadiFields();
export const HIDDEN_THOR_FIELDS: readonly TuningField[] = thorFields();

/**
 * ★hasPhase2 は**4体とも宣言しない**(=P2ボタンを出さない)。
 * 理由(実在確認の掟・BOSS_MAKER.md §6-1の判定手順どおりコードで確かめた): 裏ボスコントローラは
 * **毎フレーム HP からフェーズを計算して `patch.bossPhase` を上書きする**
 * (`useGameLoop.ts`「裏ボス4体共通のHP段階トラッカー」→ `mimirPhaseForHealth` 等 → `patch.bossPhase`)。
 * P2 ボタンは `bossPhase: 2` を書くだけなので、押しても**次の1フレームで元へ戻る=効かないボタン**になる。
 * 後半の型は既存の **HP40%** ボタンで到達できる:
 *   ミーミル/ヨルムンガルド Phase2 = HP60%以下 / スカジ Phase2 = 70%以下・Phase3 = 35%以下 /
 *   トール Phase2 = 60%以下・Phase3 = 40%以下(`THOR_PHASE_HP_THRESHOLDS = [0.6, 0.4]`)。
 * ——舞妓(bounty-maiko)・天使6体と同じ扱い(v0.25.3563/3567の裁定)。
 * ※フェーズを bossPhase で持つ設計に変えるなら、その時にここへ `hasPhase2: true` を足す。
 */
export const registerHiddenBossTuning = (): void => {
  // 表示名はカットイン台帳(bossCutin.ts)に揃える(名称統一バッチ・社長指示v0.25.3443)。
  registerBossTuning({
    bossType: 'mimir', label: 'ミーミル',
    table: HIDDEN_MIMIR_TUNING as unknown as Record<string, unknown>,
    defaults: HIDDEN_MIMIR_TUNING_DEFAULTS as unknown as Record<string, unknown>,
    fields: HIDDEN_MIMIR_FIELDS, sectionHelp: MI_HELP,
    playables: MI_PLAYABLES, onPlay: onHiddenPlay, playState: getHiddenBossPlayback,
  });
  registerBossTuning({
    bossType: 'jormungand', label: 'ヨルムンガルド',
    table: HIDDEN_JORMUNGAND_TUNING as unknown as Record<string, unknown>,
    defaults: HIDDEN_JORMUNGAND_TUNING_DEFAULTS as unknown as Record<string, unknown>,
    fields: HIDDEN_JORMUNGAND_FIELDS, sectionHelp: JO_HELP,
    playables: JO_PLAYABLES, onPlay: onHiddenPlay, playState: getHiddenBossPlayback,
  });
  registerBossTuning({
    bossType: 'skadi', label: 'スカジ',
    table: HIDDEN_SKADI_TUNING as unknown as Record<string, unknown>,
    defaults: HIDDEN_SKADI_TUNING_DEFAULTS as unknown as Record<string, unknown>,
    fields: HIDDEN_SKADI_FIELDS, sectionHelp: SK_HELP,
    playables: SK_PLAYABLES, onPlay: onHiddenPlay, playState: getHiddenBossPlayback,
  });
  registerBossTuning({
    bossType: 'thor', label: 'トール',
    table: HIDDEN_THOR_TUNING as unknown as Record<string, unknown>,
    defaults: HIDDEN_THOR_TUNING_DEFAULTS as unknown as Record<string, unknown>,
    fields: HIDDEN_THOR_FIELDS, sectionHelp: TH_HELP,
    playables: TH_PLAYABLES, onPlay: onHiddenPlay, playState: getHiddenBossPlayback,
  });
};
