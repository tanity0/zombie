// ボスメーカー(BOSS_MAKER.md §2-3 / §6 フェーズ4・第3弾): **天使6体のスキーマ**とレジストリ登録。
//
// UIはこのスキーマを読んでフォームを自動生成する=**1ボス対応 = テーブル + スキーマを1つ書くだけ**
// (ここを守らないと14体で破綻する)。パネルは1行も書かない。
//
// 刻み幅(step)の叩き台は idolTuning.ts / bountyTuning.ts に倣う: ms=50 / px=10 / 倍率=0.05 / 個数=1。
//
// ★「6体共通」と書いてある欄は `common.*`(angelScript.ts の ANGEL_COMMON_TUNING)を指す。
//   実体は6体で1個なので、**どのボスの画面で動かしても6体全員に効く**。複製してボスごとに分けると
//   挙動の構造が変わる=仕様変更なので、共有のままにしてある(ヘルプにもその旨を書く)。
//
// ここに**無い**もの(=まだ画面から触れない・BOSS_MAKER.md §6の次バッチ):
//  - 技の**抽選**(距離帯・重み・フェーズ別の出し分け): miguelScript/jibrilScript/rafiScript/
//    uriScript/surielScript/acrasielScript.ts が正本(store非依存の別の葉)。第1弾の三段突き/射撃
//    サイクルと同じ扱いで、テーブル化には持ち主側の分解が要る。
//  - アリーナの幾何(半径300・縁のマージン): 拘束サークル(useGameLoop)と共有する「場」の寸法。
//  - 旧実装(`?<boss>script=0`)専用の値: フォールバックは変更前の姿を保つのが役目。
//
// ★v0.25.3567: ▸個別再生を配線した。実体は angelBossTick.ts の requestAngelMovePlay(idol/賞金首の
//   同名の口と同型)。技の開始は実戦と**同じ begin* の束**を通るので、ここで並べたキーは
//   「見た目だけ動く別経路」にはならない。
import { registerBossTuning, type TuningField, type PlayableAction } from './bossTuning';
import { requestAngelMovePlay, getAngelPlayback, ANGEL_MOVES_BY_TYPE, type AngelMoveKey } from '../../utils/angelBossTick';
import {
  ANGEL_MIGUEL_TUNING, ANGEL_MIGUEL_TUNING_DEFAULTS,
  ANGEL_JIBRIL_TUNING, ANGEL_JIBRIL_TUNING_DEFAULTS,
  ANGEL_RAFI_TUNING, ANGEL_RAFI_TUNING_DEFAULTS,
  ANGEL_URI_TUNING, ANGEL_URI_TUNING_DEFAULTS,
  ANGEL_SURIEL_TUNING, ANGEL_SURIEL_TUNING_DEFAULTS,
  ANGEL_ACRASIEL_TUNING, ANGEL_ACRASIEL_TUNING_DEFAULTS,
  ANGEL_PHILL_TUNING, ANGEL_PHILL_TUNING_DEFAULTS,
} from '../../utils/angelScript';

// 欄を作る小道具(section を毎行書かないためだけのもの。意味は素の TuningField と同じ)。
const mk = (section: string, group: 'behavior' | 'move') =>
  (path: string, label: string, kind: TuningField['kind'],
    min: number, max: number, step: number, hint?: string): TuningField =>
    ({ path, label, group, section, kind, min, max, step, hint });

// 共通の言い回し(idolTuning.ts / bountyTuning.ts と同じ文言に揃える)。
const HINT_WINDUP = '予告が出てから判定まで';
const HINT_RECOVER = '反撃窓。820ms=近接1発';
const HINT_SHARED = '★天使6体で共通(1つ動かすと6体全員に効く)';
const HINT_ACTIVE = '当たり判定が出ている時間';

/** 気絶明けの欄は6体とも同じ(行動パターンの節へ1行だけ足す)。 */
const stunField = (section: string): TuningField =>
  mk(section, 'behavior')('common.stunNextActionMs', '気絶明けの間', 'ms', 0, 10000, 100, `紫(完全気絶)から戻った後、次の技までの待ち。${HINT_SHARED}`);

// ================================================================================================
// ミゲル(miguel)
// ================================================================================================
const MG_SEC = { move: '動き', harai: '払い→縦払い(mg-harai)', volley: '弾幕(mg-volley)', dash: '踏み込み(mg-dash)' };

const miguelFields = (): TuningField[] => {
  const mv = mk(MG_SEC.move, 'behavior');
  const hr = mk(MG_SEC.harai, 'move');
  const vl = mk(MG_SEC.volley, 'move');
  const ds = mk(MG_SEC.dash, 'move');
  return [
    mv('orbit.speed', '旋回の速さ', 'pxs', 0, 400, 10, '中心のまわりを回る速さ。プレイヤーは104.4px/s'),
    mv('slowWalk.ms', 'ゆっくり歩く時間', 'ms', 0, 8000, 50, 'たまに歩みを緩める(読ませる間)'),
    mv('slowWalk.mult', 'ゆっくり歩く倍率', 'frac', 0, 1, 0.05, '旋回の速さに掛ける'),
    mv('slowWalk.minGapMs', 'ゆっくり歩く間隔 下限', 'ms', 0, 20000, 100),
    mv('slowWalk.maxGapMs', 'ゆっくり歩く間隔 上限', 'ms', 0, 20000, 100),
    mv('meleeDash.ms', '殴られた後の加速 時間', 'ms', 0, 5000, 50, '殴られた直後だけ回りが速くなる'),
    mv('meleeDash.mult', '殴られた後の加速 倍率', 'frac', 1, 5, 0.05),
    mv('common.counterLeapMs', 'カウンター後の後退', 'ms', 0, 2000, 20, `弾かれた時に飛び退く時間。${HINT_SHARED}`),
    stunField(MG_SEC.move),

    hr('harai.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    hr('harai.active', '振り', 'ms', 10, 2000, 10, HINT_ACTIVE),
    hr('harai.tateRecover', '硬直(縦払いの後)', 'ms', 0, 5000, 50, HINT_RECOVER),
    hr('harai.range', '帯の長さ', 'px', 10, 600, 10, '赤い帯=判定。絵もこの値で描く'),
    hr('harai.halfWidth', '帯の半幅', 'px', 4, 200, 10, '赤い帯=判定。絵もこの値で描く'),
    hr('lunge.standoffPx', '踏み込みの手前距離', 'px', 0, 400, 10, '帯の中点から何px手前に立つか'),
    hr('lunge.maxPx', '踏み込みの上限', 'px', 0, 600, 10, '大きすぎると突進に見える'),
    hr('common.lungeLeadMs', '踏み込みの先行時間', 'ms', 0, 1000, 20, `溜めの最後のこの時間から足を出す。${HINT_SHARED}(ミゲル/ウリ)`),

    vl('volley.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    vl('volley.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    vl('common.burst.shots', '発数', 'num', 1, 12, 1, `${HINT_SHARED}(ミゲル弾幕/ウリ雷弾)`),
    vl('common.burst.gapMs', '発の間隔', 'ms', 50, 3000, 50, `${HINT_SHARED}(ミゲル/ジブリル/ウリ)`),

    ds('dash.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    ds('dash.moveMs', '走る時間', 'ms', 50, 2000, 10, '短いほど鋭く飛び込む'),
    ds('dash.strikeMs', '斬り抜けの判定', 'ms', 10, 2000, 10, HINT_ACTIVE),
    ds('dash.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    ds('dash.cdMs', 'クールダウン', 'ms', 0, 30000, 500, '短いほど頻繁に踏み込む'),
    ds('common.dashCounterPushbackPx', 'カウンター時に弾く距離', 'px', 0, 600, 10, `素通り事故の防止。${HINT_SHARED}(ミゲル/ウリ)`),
  ];
};

const MG_HELP: Record<string, string> = {
  [MG_SEC.move]: '中心のまわりを回りながら間合いを計る剣の天使。回る速さと「たまにゆっくり歩く」が読みどころを作る。',
  [MG_SEC.harai]: '横に払ってから縦に振り下ろす2段。溜めの終わりに**踏み込む**(判定は動かない=動くのは本体だけ)。',
  [MG_SEC.volley]: '距離が空いた時の弾。発数と間隔は6体共通の設定を読む。',
  [MG_SEC.dash]: '一直線に飛び込んで斬り抜ける。カウンターすると来た方向へ弾き返す(素通り事故の対策)。',
};

// ================================================================================================
// ジブリル(jibril)
// ================================================================================================
const JB_SEC = {
  move: '動き', volley: '連射(jb-volley)', lantern: 'ランタン(jb-lantern)',
  consecrate: '聖別(jb-consecrate)', lance: 'ランス(jb-lance)', warp: '転移(jb-warp)',
};

const jibrilFields = (): TuningField[] => {
  const mv = mk(JB_SEC.move, 'behavior');
  const vl = mk(JB_SEC.volley, 'move');
  const ln = mk(JB_SEC.lantern, 'move');
  const cs = mk(JB_SEC.consecrate, 'move');
  const lc = mk(JB_SEC.lance, 'move');
  const wp = mk(JB_SEC.warp, 'move');
  return [
    mv('retreat.speed', '後退の速さ', 'pxs', 0, 400, 10, '常にプレイヤーから離れる。プレイヤーは104.4px/s'),
    mv('retreat.fastMult', '後退の加速 倍率', 'frac', 1, 5, 0.05, '被弾が溜まると速くなる'),
    mv('retreat.hitsFaster', '加速に要る被弾数', 'num', 0, 30, 1),
    mv('warp.hits', '転移に要る被弾数', 'num', 1, 50, 1, 'この回数殴られると転移で逃げる'),
    stunField(JB_SEC.move),

    vl('volley.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    vl('volley.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    vl('volley.shots', '発数', 'num', 1, 12, 1, '奇数発目=狙い弾 / 偶数発目=全方位'),
    vl('volley.omniBullets', '全方位の弾数', 'num', 1, 24, 1, '偶数発目に撒く数'),
    vl('common.burst.gapMs', '発の間隔', 'ms', 50, 3000, 50, `${HINT_SHARED}(ミゲル/ジブリル/ウリ)`),

    ln('lantern.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    ln('lantern.ms', '置き続ける時間', 'ms', 0, 15000, 100, 'この間ずっと火を置く'),
    ln('lantern.fireGapMs', '火を置く間隔', 'ms', 50, 5000, 50),
    ln('lantern.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    ln('fire.telegraphMs', '火が燃え出すまで', 'ms', 0, 5000, 50, '置いてから判定が出るまで(避ける時間)'),
    ln('fire.lifeMs', '火の寿命', 'ms', 0, 10000, 100),
    ln('fire.damage', '火のダメージ', 'num', 0, 200, 1),
    ln('fire.radius', '火の半径', 'px', 4, 200, 10, '赤い円=判定'),

    cs('consecrate.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    cs('consecrate.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    cs('consecrate.cdMs', 'クールダウン', 'ms', 0, 30000, 500),
    cs('consecrate.ringRadius', 'リングの半径', 'px', 20, 600, 10, '自分を中心に火を並べる輪'),
    cs('consecrate.fireCount', '火の数', 'num', 1, 16, 1, '隙間が1箇所だけ空く'),

    lc('lance.count', 'ランタンの本数', 'num', 1, 8, 1),
    lc('lance.intervalMs', '射出の間隔', 'ms', 100, 5000, 50),
    lc('lance.lanternSpeed', 'ランタンの速さ', 'pxs', 40, 2000, 20, '★旋回率と対で見る(片方だけ動かすと軌道が変わる)'),
    lc('lance.turnRate', '追従の旋回上限', 'frac', 0.05, 8, 0.05, 'rad/s。小さいほど振り切りやすい'),
    lc('lance.minWindup', '最短の溜め', 'ms', 0, 3000, 20, '縁に早く着いてもこれ未満では撃たない'),
    lc('lance.windupCapMs', '溜めの安全上限', 'ms', 500, 20000, 100, '縁に着けなくてもここで全弾発射'),
    lc('lance.beamMs', 'ビームの時間', 'ms', 20, 2000, 20, HINT_ACTIVE),
    lc('lance.halfWidth', 'ビームの半幅', 'px', 4, 200, 2, '赤い線=判定'),
    lc('lance.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),

    wp('warp.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    wp('warp.recover', '硬直', 'ms', 0, 5000, 50, 'この技だけ硬直の床(820ms)を掛けていない(判定を持たない移動のため)'),
  ];
};

const JB_HELP: Record<string, string> = {
  [JB_SEC.move]: '下がりながら撃つ天使。殴られた数が溜まると速くなり、やがて転移で逃げる。',
  [JB_SEC.volley]: '狙い弾と全方位を交互に撃つ5連射。間隔は6体共通の設定。',
  [JB_SEC.lantern]: '足場を焼く火を置き続ける。**設置中も体当たりカウンターで止められる**(既に置いた火は残る)。',
  [JB_SEC.consecrate]: '自分のまわりに火の輪を作り、隙間1箇所へ誘導する(Phase2専用)。',
  [JB_SEC.lance]: 'ランタンが縁へ飛び、その間を赤い線で結ぶ。着いたら線ごとレーザー。**速さと旋回率は対で動かす**。',
  [JB_SEC.warp]: '縁に張り付いた時/殴られ過ぎた時の逃げ。ダメージ判定は無い。',
};

// ================================================================================================
// ラフィ(rafi)
// ================================================================================================
const RF_SEC = { move: '動き', bone: '骨刃(rf-bone)', jump: '跳びかかり(rf-jump)', sweep: '薙ぎ(rf-sweep)', roll: 'ロール台本(rf-roll)' }; // roll=★v0.25.3592

const rafiFields = (): TuningField[] => {
  const mv = mk(RF_SEC.move, 'behavior');
  const bn = mk(RF_SEC.bone, 'move');
  const jp = mk(RF_SEC.jump, 'move');
  const sw = mk(RF_SEC.sweep, 'move');
  const rl = mk(RF_SEC.roll, 'move');
  return [
    mv('chase.speed', '追いかける速さ', 'pxs', 0, 400, 10, 'プレイヤーは104.4px/s'),
    mv('step.ms', '横ステップの時間', 'ms', 0, 2000, 20),
    mv('step.speed', '横ステップの速さ', 'pxs', 0, 1200, 20),
    mv('step.minGapMs', 'ステップ間隔 下限', 'ms', 0, 10000, 100),
    mv('step.maxGapMs', 'ステップ間隔 上限', 'ms', 0, 10000, 100),
    mv('step.minGapMsP2', 'ステップ間隔 下限(後半)', 'ms', 0, 10000, 100, 'HPが減ってからの値'),
    mv('step.maxGapMsP2', 'ステップ間隔 上限(後半)', 'ms', 0, 10000, 100, 'HPが減ってからの値'),
    stunField(RF_SEC.move),

    bn('bone.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    bn('bone.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    bn('bone.count', '本数', 'num', 1, 20, 1),
    bn('bone.gapMs', '飛ばす間隔', 'ms', 50, 3000, 50),
    bn('bone.ringMin', '出る輪の半径 下限', 'px', 0, 600, 10, 'プレイヤーの周囲この距離から内向きに飛ぶ'),
    bn('bone.ringMax', '出る輪の半径 上限', 'px', 0, 600, 10),
    bn('bone.delayMs', '刃が動き出すまで', 'ms', 0, 5000, 50, '置いてから飛ぶまでの間(避ける時間)'),

    jp('jump.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    jp('jump.ms', '滞空', 'ms', 50, 3000, 20, '飛び上がってから着地するまで'),
    jp('jump.radius', '着地円の半径', 'px', 10, 400, 10, '赤い円=判定。伸ばしたら予告も伸ばす'),
    jp('jump.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    jp('jump.maxRejumps', 'カウンター後の跳び直し', 'num', 0, 5, 1, '弾かれた時に何回まで跳び直すか'),

    sw('sweep.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    sw('sweep.active', '振り', 'ms', 10, 2000, 10, HINT_ACTIVE),
    sw('sweep.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    sw('sweep.cdMs', 'クールダウン', 'ms', 0, 30000, 500),
    sw('sweep.range', '帯の長さ', 'px', 10, 600, 10, '赤い帯=判定'),
    sw('sweep.halfWidth', '帯の半幅', 'px', 4, 200, 10, '赤い帯=判定'),

    rl('roll.rollMs', 'ロールの所要', 'ms', 100, 2000, 20),
    rl('roll.rollDist', 'ロールの距離', 'px', 40, 500, 10),
    rl('quickblades.windup', '刃2連射の予告', 'ms', 0, 5000, 50, '頭で狙い固定=追尾しない'),
    rl('quickblades.count', '本数', 'num', 1, 8, 1),
    rl('quickblades.gapMs', '発の間隔', 'ms', 0, 1000, 20),
    rl('quickblades.launchDelayMs', '刃が動き出すまで', 'ms', 0, 2000, 50, '骨刃(1000ms)より短い=高速の正体'),
    rl('quickblades.sideOffsetPx', '脇のずらし', 'px', 0, 200, 10, '左右の刃の出る位置'),
    rl('quickblades.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
  ];
};

const RF_HELP: Record<string, string> = {
  [RF_SEC.move]: '真っ直ぐ詰めながら時々横へ跳ぶ天使。後半はステップの間隔が短くなる。',
  [RF_SEC.bone]: 'プレイヤーを囲む輪から内向きに刃が飛ぶ。置いてから飛ぶまでの間が避けどころ。',
  [RF_SEC.jump]: '着地点に円。**円から歩いて出られる予告か**が公平の物差し(半径を伸ばしたら予告も伸ばす)。',
  [RF_SEC.sweep]: '後半で増える前方の帯。クールダウンで頻度を決める。',
  [RF_SEC.roll]: '近距離台本(v0.25.3592): バックロールで距離を空け、脇から骨刃2本を短い遅延で高速射出。抽選の重みはrafiScript側(未テーブル化)。',
};

// ================================================================================================
// ウリ(uri)
// ================================================================================================
const UR_SEC = {
  move: '動き', sweep: '大薙ぎ(ur-sweep)', downslash: '振り下ろし(ur-downslash)',
  thrust: '踏み込み突き(ur-thrust)', bolt: '雷弾(ur-bolt)',
};

const uriFields = (): TuningField[] => {
  const sw = mk(UR_SEC.sweep, 'move');
  const dn = mk(UR_SEC.downslash, 'move');
  const th = mk(UR_SEC.thrust, 'move');
  const bl = mk(UR_SEC.bolt, 'move');
  return [
    stunField(UR_SEC.move),

    sw('sweep.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    sw('sweep.active', '振り', 'ms', 10, 2000, 10, HINT_ACTIVE),
    sw('sweep.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    sw('sweep.range', '帯の長さ', 'px', 10, 600, 10, '赤い帯=判定。始点は内径ぶん前(懐は安全)'),
    sw('sweep.halfWidth', '帯の半幅', 'px', 4, 200, 10, '赤い帯=判定'),
    sw('lunge.standoffPx', '踏み込みの手前距離', 'px', 0, 400, 10, '帯の始点(内径)から何px手前に立つか'),
    sw('lunge.maxFrac', '踏み込みの上限(内径比)', 'frac', 0, 1, 0.05, '内径の何割まで詰めるか。1に近いと懐が消える'),
    sw('common.lungeLeadMs', '踏み込みの先行時間', 'ms', 0, 1000, 20, `溜めの最後のこの時間から足を出す。${HINT_SHARED}(ミゲル/ウリ)`),

    dn('downslash.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    dn('downslash.active', '振り', 'ms', 10, 2000, 10, HINT_ACTIVE),
    dn('downslash.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    dn('downslash.range', '帯の長さ', 'px', 10, 600, 10, '赤い帯=判定'),
    dn('downslash.halfWidth', '帯の半幅', 'px', 4, 200, 5, '細長いのがこの技の性格'),

    th('thrust.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    th('thrust.moveMs', '走る時間', 'ms', 50, 2000, 10, '短いほど鋭く踏み込む'),
    th('thrust.strikeMs', '突きの判定', 'ms', 10, 2000, 10, HINT_ACTIVE),
    th('thrust.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    th('thrust.range', '帯の長さ', 'px', 10, 600, 10, '赤い帯=判定'),
    th('thrust.halfWidth', '帯の半幅', 'px', 4, 200, 10),
    th('common.dashCounterPushbackPx', 'カウンター時に弾く距離', 'px', 0, 600, 10, `素通り事故の防止。${HINT_SHARED}(ミゲル/ウリ)`),

    bl('bolt.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    bl('bolt.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    bl('common.burst.shots', '発数', 'num', 1, 12, 1, `${HINT_SHARED}(ミゲル弾幕/ウリ雷弾)`),
    bl('common.burst.gapMs', '発の間隔', 'ms', 50, 3000, 50, `${HINT_SHARED}(ミゲル/ジブリル/ウリ)`),
  ];
};

const UR_HELP: Record<string, string> = {
  [UR_SEC.move]: '大剣の天使。**懐(内径の内側)が安全**という主題を、技の寸法で作っている。',
  [UR_SEC.sweep]: '内径の外だけを薙ぐ帯。踏み込みの上限を内径の半分に抑えてあるのは、詰めた後も懐を残すため。',
  [UR_SEC.downslash]: '前方の細長い帯。横へ避ける技。',
  [UR_SEC.thrust]: '一直線に踏み込んで突く。カウンターすると来た方向へ弾き返す(素通り事故の対策)。',
  [UR_SEC.bolt]: '距離が空いた時の弾。発数と間隔は6体共通の設定を読む。',
};

// ================================================================================================
// スリィエル(suriel)
// ================================================================================================
const SR_SEC = {
  move: '動きと環', ringshot: '環の射出(sr-ringshot)', ringspin: '環の回転斬(sr-ringspin)',
  sweep: '本体の薙ぎ(sr-sweep)', gaze: '凝視(sr-gaze)',
};

const surielFields = (): TuningField[] => {
  const mv = mk(SR_SEC.move, 'behavior');
  const rs = mk(SR_SEC.ringshot, 'move');
  const rp = mk(SR_SEC.ringspin, 'move');
  const sw = mk(SR_SEC.sweep, 'move');
  const gz = mk(SR_SEC.gaze, 'move');
  return [
    mv('ring.hoverOffsetX', '環の待機位置 X', 'px', -200, 200, 2, '本体からのずれ(判定なし)'),
    mv('ring.hoverOffsetY', '環の待機位置 Y', 'px', -300, 300, 4, 'マイナス=頭上'),
    mv('ring.returnSpeed', '環が戻る速さ', 'pxs', 20, 2000, 20),
    mv('ring.deployThreshold', '展開とみなす距離', 'px', 0, 200, 2, 'これ以上頭上から離れていたら「展開中」'),
    mv('ring.ring2OffsetPx', '2本目の間隔(後半)', 'px', 0, 200, 2, 'HPが減ると環が2つになる'),
    stunField(SR_SEC.move),

    rs('ringshot.moveMs', '環が回り込む時間', 'ms', 50, 5000, 50, '相手の反対側へ回る=挟む形を作る'),
    rs('ringshot.beamWindup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    rs('ringshot.active', 'ビームの時間', 'ms', 10, 2000, 10, HINT_ACTIVE),
    rs('ringshot.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    rs('beam.range', 'ビームの長さ', 'px', 100, 4000, 50, '赤い線=判定'),
    rs('beam.halfWidth', 'ビームの半幅', 'px', 4, 200, 2, '赤い線=判定'),

    rp('ringspin.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    rp('ringspin.active', '回している時間', 'ms', 10, 2000, 10, HINT_ACTIVE),
    rp('ringspin.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    rp('ringspin.radius', '円の半径', 'px', 20, 600, 10, '赤い円=判定。伸ばしたら予告も伸ばす'),

    sw('sweep.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    sw('sweep.active', '振り', 'ms', 10, 2000, 10, HINT_ACTIVE),
    sw('sweep.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    sw('sweep.range', '帯の長さ', 'px', 10, 600, 10, '赤い帯=判定'),
    sw('sweep.halfWidth', '帯の半幅', 'px', 4, 200, 10),

    gz('gaze.windup', '予告', 'ms', 0, 5000, 50, `${HINT_WINDUP}(終わりに弾を1発)`),
    gz('gaze.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
  ];
};

const SR_HELP: Record<string, string> = {
  [SR_SEC.move]: '頭上の環を飛ばして戦う天使。環が離れている間だけ使える技がある(展開の判定はこの節の値)。',
  [SR_SEC.ringshot]: '環が相手の反対側へ回り込み、本体との間をビームで結ぶ=挟む技。後半は2本になる。',
  [SR_SEC.ringspin]: '自分中心の円=近接拒否。**円から歩いて出られる予告か**が公平の物差し。',
  [SR_SEC.sweep]: '本体の前方の帯。近づかれた時の答え。',
  [SR_SEC.gaze]: '単眼から弾を1発。溜めの終わりに撃つ。',
};

// ================================================================================================
// アクラシエル(acrasiel)
// ================================================================================================
const AC_SEC = {
  move: '動き', spike: '放射棘(ac-spike)', spear: '結晶の槍(ac-spear)',
  warp: '転移(ac-warp)', burst: '爆発(ac-burst)', gaze: '凝視(ac-gaze)',
};

const acrasielFields = (): TuningField[] => {
  const sp = mk(AC_SEC.spike, 'move');
  const sr = mk(AC_SEC.spear, 'move');
  const wp = mk(AC_SEC.warp, 'move');
  const bs = mk(AC_SEC.burst, 'move');
  const gz = mk(AC_SEC.gaze, 'move');
  return [
    stunField(AC_SEC.move),

    sp('spike.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    sp('spike.active', '判定', 'ms', 10, 2000, 10, HINT_ACTIVE),
    sp('spike.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    sp('spike.range', '棘の長さ', 'px', 10, 800, 10, '赤い帯=判定。8方向のうち隙間が空く'),
    sp('spike.halfWidth', '棘の半幅', 'px', 4, 200, 10),

    sr('spear.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    sr('spear.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    sr('spear.count', '本数', 'num', 1, 16, 1),
    sr('spear.range', '置く距離', 'px', 10, 800, 10, '自分から何px離れた輪に置くか'),
    sr('spear.detonateMs', '起爆までの時間', 'ms', 100, 8000, 50, '置いてから爆ぜるまで(避ける時間)'),
    sr('spear.radius', '爆発の半径', 'px', 10, 400, 10, '赤い円=判定。伸ばしたら起爆までも伸ばす'),

    wp('warp.windup', '消えるまでの溜め', 'ms', 0, 5000, 50, HINT_WINDUP),
    wp('warp.telegraphMs', '着地の予告', 'ms', 0, 5000, 50, '★赤円が見えてから実行まで。半径÷104.4px/s 以上にする'),
    wp('warp.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    wp('warp.impactRadius', '着地の衝撃 半径', 'px', 10, 400, 10, '赤い円=判定。伸ばしたら予告も伸ばす'),

    bs('burst.windup', '予告', 'ms', 0, 5000, 50, `${HINT_WINDUP}。★半径÷104.4px/s 以上にする`),
    bs('burst.active', '判定', 'ms', 10, 2000, 10, HINT_ACTIVE),
    bs('burst.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    bs('burst.radius', '大円の半径', 'px', 20, 600, 10, '赤い円=判定。伸ばしたら予告も伸ばす'),

    gz('gaze.windup', '予告', 'ms', 0, 5000, 50, `${HINT_WINDUP}(終わりに弾を1発)`),
    gz('gaze.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
  ];
};

const AC_HELP: Record<string, string> = {
  [AC_SEC.move]: '脚が無く、その場から動かない天使(移動手段は転移だけ)。',
  [AC_SEC.spike]: '8方向へ棘。隙間の方向へ抜ける技(隙間の数はHPで変わる)。',
  [AC_SEC.spear]: '周囲に槍を置き、少し置いてから一斉に爆ぜる。置いてから爆ぜるまでが避けどころ。',
  [AC_SEC.warp]: '消えて別の場所へ。着地点に赤い円が出る=**円から歩いて出られる予告時間**を必ず残す。',
  [AC_SEC.burst]: '自分中心の大円。半径が大きいぶん、予告も長くないと避けられない。',
  [AC_SEC.gaze]: '単眼から弾を1発。溜めの終わりに撃つ。',
};

// ================================================================================================
// フィル(phillboss・PACING_PUZZLE.md §10-17・angelBossTickの7人目=バッチ2)
// ================================================================================================
const PH_SEC = {
  lightrain: '祝福(ph-lightrain)', lancefan: '光槍の扇(ph-lancefan)',
  wingslash: '羽斬り(ph-wingslash)', wingthrust: '羽突き(ph-wingthrust)', wingcombo: '羽連撃(ph-wingcombo)',
  summon: '召喚(ph-summon)', goldring: '金環(ph-goldring)',
  judgment: '裁きの光=羽根の檻★必須(ph-judgment)', cage: '(檻の中身・単独抽選なし)(ph-cage)',
  meteor: 'エルデの流星(ph-meteor)', ringtoss: '光輪投げ(ph-ringtoss)', dive: '急降下(ph-dive)',
  feathershot: '羽根散弾(ph-feathershot)',
};

const HINT_REQUIRED = '★カウンター必須(避け切れない。カウンターで無効化+反撃)。同時に1つ・前回の成立/被弾から一定間隔。';

const phillFields = (): TuningField[] => {
  const lr = mk(PH_SEC.lightrain, 'move');
  const lf = mk(PH_SEC.lancefan, 'move');
  const ws = mk(PH_SEC.wingslash, 'move');
  const wt = mk(PH_SEC.wingthrust, 'move');
  const wc = mk(PH_SEC.wingcombo, 'move');
  const sm = mk(PH_SEC.summon, 'move');
  const gr = mk(PH_SEC.goldring, 'move');
  const jd = mk(PH_SEC.judgment, 'move');
  const cg = mk(PH_SEC.cage, 'move');
  const mt = mk(PH_SEC.meteor, 'move');
  const rt = mk(PH_SEC.ringtoss, 'move');
  const dv = mk(PH_SEC.dive, 'move');
  const fs = mk(PH_SEC.feathershot, 'move');
  return [
    lr('lightrain.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    lr('lightrain.shotCount', '柱の本数', 'num', 1, 12, 1, '時間差で降ってくる光柱の数'),
    lr('lightrain.shotGapMs', '柱の間隔', 'ms', 20, 2000, 20),
    lr('lightrain.radius', '柱の半径', 'px', 10, 300, 10, '赤い円=判定'),
    lr('lightrain.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    lr('lightrain.cdMs', 'クールダウン', 'ms', 0, 30000, 500, '大技(叩き台10秒)'),

    lf('lancefan.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    lf('lancefan.shotsPerVolley', '1回の本数', 'num', 1, 12, 1),
    lf('lancefan.volleys', '回数', 'num', 1, 6, 1, '扇を撃つ回数'),
    lf('lancefan.volleyGapMs', '回の間隔', 'ms', 50, 3000, 50),
    lf('lancefan.spreadDeg', '扇の開き', 'deg', 0, 180, 5),
    lf('lancefan.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),

    ws('wingslash.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    ws('wingslash.active', '振り', 'ms', 10, 2000, 10, HINT_ACTIVE),
    ws('wingslash.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    ws('wingslash.range', '帯の長さ', 'px', 10, 600, 10, '赤い帯=判定'),
    ws('wingslash.halfWidth', '帯の半幅', 'px', 4, 200, 10),

    wt('wingthrust.windup', '予告', 'ms', 0, 5000, 50, `${HINT_WINDUP}(ディレイ持ち=長め)`),
    wt('wingthrust.active', '突き', 'ms', 10, 2000, 10, HINT_ACTIVE),
    wt('wingthrust.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    wt('wingthrust.range', '帯の長さ', 'px', 10, 600, 10, '赤い帯=判定'),
    wt('wingthrust.halfWidth', '帯の半幅', 'px', 4, 200, 10),

    wc('wingcombo.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    wc('wingcombo.active1', '1撃目', 'ms', 10, 2000, 10, HINT_ACTIVE),
    wc('wingcombo.gapMs', '2撃目のディレイ', 'ms', 0, 2000, 20),
    wc('wingcombo.active2', '2撃目', 'ms', 10, 2000, 10, HINT_ACTIVE),
    wc('wingcombo.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    wc('wingcombo.range', '帯の長さ', 'px', 10, 600, 10, '赤い帯=判定(2撃とも同じ帯)'),
    wc('wingcombo.halfWidth', '帯の半幅', 'px', 4, 200, 10),

    sm('summon.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    sm('summon.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),

    gr('goldring.windup', '予告', 'ms', 0, 5000, 50, `${HINT_WINDUP}。★半径÷104.4px/s 以上にする`),
    gr('goldring.active', '判定', 'ms', 10, 2000, 10, HINT_ACTIVE),
    gr('goldring.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    gr('goldring.radius', '大円の半径', 'px', 20, 600, 10, '赤い円=判定。外へ逃げるのが正解'),
    gr('goldring.cdMs', 'クールダウン', 'ms', 0, 30000, 500, '大技(叩き台10秒)'),

    jd('judgment.trackMs', '追尾する時間', 'ms', 500, 8000, 50, `${HINT_REQUIRED}(≥2秒推奨)`),
    jd('judgment.active', '判定', 'ms', 10, 2000, 10, HINT_ACTIVE),
    jd('judgment.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    jd('judgment.radius', '固定後の円の半径', 'px', 10, 300, 10, '赤い円=判定(固定の瞬間に1回)'),
    jd('judgment.cdMs', 'クールダウン', 'ms', 0, 30000, 500, '個別CD(叩き台10秒)。cage との共通4秒間隔は別枠'),

    cg('cage.trackMs', '閉じるまでの時間', 'ms', 500, 8000, 50, `${HINT_REQUIRED}中心は溜め開始でロック(以後追尾しない)`),
    cg('cage.active', '判定', 'ms', 10, 2000, 10, HINT_ACTIVE),
    cg('cage.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    cg('cage.startRadius', '初期半径', 'px', 20, 600, 10, '★可視短辺×0.45が上限(ズーム引きで自動クランプ)'),
    cg('cage.closeRadius', '閉じ切った半径', 'px', 10, 300, 10, '赤い円=実際の判定'),
    cg('cage.cdMs', 'クールダウン', 'ms', 0, 30000, 500, '個別CD(叩き台10秒)。judgment との共通4秒間隔は別枠'),

    mt('meteor.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    mt('meteor.count', '発数', 'num', 1, 12, 1),
    mt('meteor.gapMs', '発の間隔', 'ms', 20, 2000, 20),
    mt('meteor.turnRateDeg', '誘導の旋回速度', 'num', 0, 360, 5, '度/秒。大きいほど曲がる'),
    mt('meteor.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),

    rt('ringtoss.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    rt('ringtoss.outMs', '往路', 'ms', 10, 2000, 10, HINT_ACTIVE),
    rt('ringtoss.backMs', '復路', 'ms', 10, 2000, 10, HINT_ACTIVE),
    rt('ringtoss.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    rt('ringtoss.range', '帯の長さ', 'px', 10, 900, 10, '赤い帯=判定(往復とも)'),
    rt('ringtoss.halfWidth', '帯の半幅', 'px', 4, 200, 10),

    dv('dive.windup', '追尾する時間', 'ms', 0, 5000, 50, '影マーカーが足元を追う(判定なし)'),
    dv('dive.fallMs', '落下', 'ms', 50, 2000, 10),
    dv('dive.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    dv('dive.radius', '着地円の半径', 'px', 10, 400, 10, '赤い円=判定。伸ばしたら追尾時間も伸ばす'),

    fs('feathershot.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    fs('feathershot.count', '本数', 'num', 1, 12, 1, '扇状に飛ぶ羽根の枚数'),
    fs('feathershot.spreadDeg', '扇の開き', 'deg', 0, 180, 5),
    fs('feathershot.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
  ];
};

const PH_HELP: Record<string, string> = {
  [PH_SEC.lightrain]: 'プレイヤー周辺に小円の赤予告→時間差で光柱が落ちる大技。',
  [PH_SEC.lancefan]: '5本扇の光弾を2回撃つ(共通赤弾=打ち返し可)。',
  [PH_SEC.wingslash]: '大振りの横薙ぎ帯(近接)。',
  [PH_SEC.wingthrust]: '細長い帯の刺突。溜めが長め(ディレイ持ち)。',
  [PH_SEC.wingcombo]: '左右の羽で2連斬り。2撃目にディレイがある。',
  [PH_SEC.summon]: 'EX雑魚を2〜3体召喚(同時上限3)。',
  [PH_SEC.goldring]: '頭上の金環→本体中心の大円AoE。外へ走って逃げるのが正解。',
  [PH_SEC.judgment]: '足元を追尾する赤円→固定の瞬間に光柱。避け切れない=カウンター必須。',
  [PH_SEC.cage]: '全方位から羽根の輪が閉じる。中心は溜め開始でロック(逃げ場なし)=カウンター必須。',
  [PH_SEC.meteor]: '誘導する光球4発(共通赤弾=打ち返し可)。',
  [PH_SEC.ringtoss]: '頭上の光輪を直線に投げ、往復とも帯判定。',
  [PH_SEC.dive]: '急上昇→追尾する影マーカー→急降下+着地円。',
  [PH_SEC.feathershot]: '羽根を扇状に飛ばす専用飛翔体(打ち返し対象外=避ける系)。',
};

// ================================================================================================
// ▸個別再生(社長指示「技再生ボタンは必須」)
// ================================================================================================
// section は**数値欄と同じ見出し文字列**にする(UIはsectionで突き合わせるので、ここがズレると
// 「見出しはあるのに▸が別の場所に出る」になる)。1つの節に1つなら見出しの右に▸が出る。
const play = (key: AngelMoveKey, label: string, section: string): PlayableAction =>
  ({ kind: 'move', key, label, section });

const MG_PLAYABLES: readonly PlayableAction[] = [
  play('mg-harai', '払い→縦払い', MG_SEC.harai),
  play('mg-volley', '弾幕', MG_SEC.volley),
  play('mg-dash', '踏み込み', MG_SEC.dash),
];
const JB_PLAYABLES: readonly PlayableAction[] = [
  play('jb-volley', '連射', JB_SEC.volley),
  play('jb-lantern', 'ランタン', JB_SEC.lantern),
  play('jb-consecrate', '聖別', JB_SEC.consecrate),
  play('jb-lance', 'ランス', JB_SEC.lance),
  play('jb-warp', '転移', JB_SEC.warp),
];
const RF_PLAYABLES: readonly PlayableAction[] = [
  play('rf-bone', '骨刃', RF_SEC.bone),
  play('rf-jump', '跳びかかり', RF_SEC.jump),
  play('rf-sweep', '薙ぎ', RF_SEC.sweep),
  play('rf-roll', 'ロール台本', RF_SEC.roll), // ★v0.25.3592
];
const UR_PLAYABLES: readonly PlayableAction[] = [
  play('ur-sweep', '大薙ぎ', UR_SEC.sweep),
  play('ur-downslash', '振り下ろし', UR_SEC.downslash),
  play('ur-thrust', '踏み込み突き', UR_SEC.thrust),
  play('ur-bolt', '雷弾', UR_SEC.bolt),
];
const SR_PLAYABLES: readonly PlayableAction[] = [
  play('sr-ringshot', '環の射出', SR_SEC.ringshot),
  play('sr-ringspin', '環の回転斬', SR_SEC.ringspin),
  play('sr-sweep', '本体の薙ぎ', SR_SEC.sweep),
  play('sr-gaze', '凝視', SR_SEC.gaze),
];
const AC_PLAYABLES: readonly PlayableAction[] = [
  play('ac-spike', '放射棘', AC_SEC.spike),
  play('ac-spear', '結晶の槍', AC_SEC.spear),
  play('ac-warp', '転移', AC_SEC.warp),
  play('ac-burst', '爆発', AC_SEC.burst),
  play('ac-gaze', '凝視', AC_SEC.gaze),
];
const PH_PLAYABLES: readonly PlayableAction[] = [
  play('ph-lightrain', '祝福', PH_SEC.lightrain),
  play('ph-lancefan', '光槍の扇', PH_SEC.lancefan),
  play('ph-wingslash', '羽斬り', PH_SEC.wingslash),
  play('ph-wingthrust', '羽突き', PH_SEC.wingthrust),
  play('ph-wingcombo', '羽連撃', PH_SEC.wingcombo),
  play('ph-summon', '召喚', PH_SEC.summon),
  play('ph-goldring', '金環', PH_SEC.goldring),
  play('ph-judgment', '裁きの光', PH_SEC.judgment),
  play('ph-cage', '羽根の檻', PH_SEC.cage),
  play('ph-meteor', 'エルデの流星', PH_SEC.meteor),
  play('ph-ringtoss', '光輪投げ', PH_SEC.ringtoss),
  play('ph-dive', '急降下', PH_SEC.dive),
  play('ph-feathershot', '羽根散弾', PH_SEC.feathershot),
];

/** ▸を押した時の実行(6体で同じ1本。ボス側の要求箱へ渡すだけ)。 */
const onAngelPlay = (a: PlayableAction, opts: { solo: boolean; loop: boolean }): void => {
  requestAngelMovePlay(a.key as AngelMoveKey, opts);
};

/**
 * 「並べたボタン」と「ボス側が実際に始められる技」が食い違っていないかの検算材料
 * (angelTuning.test.ts が突き合わせる。押しても何も起きないボタンを作らないため)。
 */
export const ANGEL_PLAYABLES_BY_TYPE: Readonly<Record<string, readonly PlayableAction[]>> = {
  miguel: MG_PLAYABLES,
  jibril: JB_PLAYABLES,
  rafi: RF_PLAYABLES,
  uri: UR_PLAYABLES,
  suriel: SR_PLAYABLES,
  acrasiel: AC_PLAYABLES,
  phillboss: PH_PLAYABLES,
};
export { ANGEL_MOVES_BY_TYPE };

// ================================================================================================
// 登録
// ================================================================================================
export const ANGEL_MIGUEL_FIELDS: readonly TuningField[] = miguelFields();
export const ANGEL_JIBRIL_FIELDS: readonly TuningField[] = jibrilFields();
export const ANGEL_RAFI_FIELDS: readonly TuningField[] = rafiFields();
export const ANGEL_URI_FIELDS: readonly TuningField[] = uriFields();
export const ANGEL_SURIEL_FIELDS: readonly TuningField[] = surielFields();
export const ANGEL_ACRASIEL_FIELDS: readonly TuningField[] = acrasielFields();
export const ANGEL_PHILL_FIELDS: readonly TuningField[] = phillFields();

/**
 * ★hasPhase2 は**6体とも宣言しない**(=P2ボタンを出さない)。
 * 理由(実在確認の掟): 天使のフェーズは各tickが**毎フレーム HP から計算して bossPhase を上書きする**
 * (`phaseForHealth(...)` → `patch.bossPhase = phase`)。P2 ボタンは `bossPhase: 2` を書くだけなので、
 * 押しても次の1フレームで元に戻る=**押しても何も起きないボタン**になる。
 * 後半の型を見たい時は既存の **HP40%**(しきい値は0.5〜0.6)、アクラシエルのPhase3は **瀕死** で到達する
 * ——舞妓(bounty-maiko)と同じ扱い(v0.25.3563の裁定)。
 * ※フェーズを bossPhase で持つ設計に変えるなら、その時にここへ `hasPhase2: true` を足す。
 */
export const registerAngelTuning = (): void => {
  // 表示名はカットイン台帳(bossCutin.ts)に揃える(名称統一バッチ・社長指示v0.25.3443)。
  registerBossTuning({
    bossType: 'miguel', label: 'ミゲル',
    table: ANGEL_MIGUEL_TUNING as unknown as Record<string, unknown>,
    defaults: ANGEL_MIGUEL_TUNING_DEFAULTS as unknown as Record<string, unknown>,
    fields: ANGEL_MIGUEL_FIELDS, sectionHelp: MG_HELP,
    playables: MG_PLAYABLES, onPlay: onAngelPlay, playState: getAngelPlayback,
  });
  registerBossTuning({
    bossType: 'jibril', label: 'ジブリル',
    table: ANGEL_JIBRIL_TUNING as unknown as Record<string, unknown>,
    defaults: ANGEL_JIBRIL_TUNING_DEFAULTS as unknown as Record<string, unknown>,
    fields: ANGEL_JIBRIL_FIELDS, sectionHelp: JB_HELP,
    playables: JB_PLAYABLES, onPlay: onAngelPlay, playState: getAngelPlayback,
  });
  registerBossTuning({
    bossType: 'rafi', label: 'ラフィ',
    table: ANGEL_RAFI_TUNING as unknown as Record<string, unknown>,
    defaults: ANGEL_RAFI_TUNING_DEFAULTS as unknown as Record<string, unknown>,
    fields: ANGEL_RAFI_FIELDS, sectionHelp: RF_HELP,
    playables: RF_PLAYABLES, onPlay: onAngelPlay, playState: getAngelPlayback,
  });
  registerBossTuning({
    bossType: 'uri', label: 'ウリ',
    table: ANGEL_URI_TUNING as unknown as Record<string, unknown>,
    defaults: ANGEL_URI_TUNING_DEFAULTS as unknown as Record<string, unknown>,
    fields: ANGEL_URI_FIELDS, sectionHelp: UR_HELP,
    playables: UR_PLAYABLES, onPlay: onAngelPlay, playState: getAngelPlayback,
  });
  registerBossTuning({
    bossType: 'suriel', label: 'スリィエル',
    table: ANGEL_SURIEL_TUNING as unknown as Record<string, unknown>,
    defaults: ANGEL_SURIEL_TUNING_DEFAULTS as unknown as Record<string, unknown>,
    fields: ANGEL_SURIEL_FIELDS, sectionHelp: SR_HELP,
    playables: SR_PLAYABLES, onPlay: onAngelPlay, playState: getAngelPlayback,
  });
  registerBossTuning({
    bossType: 'acrasiel', label: 'アクラシエル',
    table: ANGEL_ACRASIEL_TUNING as unknown as Record<string, unknown>,
    defaults: ANGEL_ACRASIEL_TUNING_DEFAULTS as unknown as Record<string, unknown>,
    fields: ANGEL_ACRASIEL_FIELDS, sectionHelp: AC_HELP,
    playables: AC_PLAYABLES, onPlay: onAngelPlay, playState: getAngelPlayback,
  });
  // PACING_PUZZLE.md §10-17(フィル・バッチ2・16体目=7人目)。hasPhase2は宣言しない(上のコメントと
  // 同じ理由=bossPhaseは毎フレームHPから再計算される。P2到達はHP40%ボタンで足りる)。
  registerBossTuning({
    bossType: 'phillboss', label: 'フィル',
    table: ANGEL_PHILL_TUNING as unknown as Record<string, unknown>,
    defaults: ANGEL_PHILL_TUNING_DEFAULTS as unknown as Record<string, unknown>,
    fields: ANGEL_PHILL_FIELDS, sectionHelp: PH_HELP,
    playables: PH_PLAYABLES, onPlay: onAngelPlay, playState: getAngelPlayback,
  });
};
