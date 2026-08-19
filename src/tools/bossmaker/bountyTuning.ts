// ボスメーカー(BOSS_MAKER.md §2-3 / §6 フェーズ4): **賞金首4種のスキーマ**とレジストリ登録。
//
// UIはこのスキーマを読んでフォームを自動生成する=**1ボス対応 = テーブル + スキーマを1つ書くだけ**
// (ここを守らないと14体で破綻する)。パネルは1行も書かない。
//
// 刻み幅(step)の叩き台は idolTuning.ts に倣う: ms=50 / px=10 / 倍率=0.05 / 個数=1。
// ★例外は突進の速度倍率(9倍)だけ——0.05刻みでは9まで摘まめないので 0.5 にしてある(その場に注記)。
//
// ここに**無い**もの(=まだ画面から触れない・BOSS_MAKER.md §6の次バッチ):
//  - 三段突き(bountyTriple.ts)と中立射撃のサイクル(bountyShots.ts): 別の「依存ゼロの葉」が正で、
//    派生値(合計尺・rad換算)を持つため、テーブル化には持ち主側の分解が要る。硬直だけ載せてある。
//  - レーザーの寸法/溜め/発射時間: **ミーミル本体と同じ値・同じ描画経路**なので、ここだけ可変にすると
//    「赤いのに当たらない」になる(バス停専用のダメージ/硬直/CDだけ載せてある)。
//  - HP(BOUNTY_BASE_HP)と中立時間(BOUNTY_NEUTRAL_MS): 4体で1つの値を共有しているため、
//    分けると挙動の構造が変わる=仕様変更。社長裁定が要る。
//
// ★v0.25.3563(社長報告「ボスメーカーの上に並んでるメニュー群が効いてない」): ▶個別再生を配線した。
// 実体は bountyTick.ts の requestBountyMovePlay(idolTick.ts の同名の口と同型)。技の開始は実戦と
// **同じ begin* の束**を通るので、ここで並べたキーは「見た目だけ動く別経路」にはならない。
import { registerBossTuning, type TuningField, type PlayableAction } from './bossTuning';
import {
  requestBountyMovePlay, getBountyPlayback, BOUNTY_MOVES_BY_TYPE, type BountyMoveKey,
} from '../../utils/bountyTick';
import {
  BOUNTY_RANGED_TUNING, BOUNTY_RANGED_TUNING_DEFAULTS,
  BOUNTY_MELEE_TUNING, BOUNTY_MELEE_TUNING_DEFAULTS,
  BOUNTY_BALANCE_TUNING, BOUNTY_BALANCE_TUNING_DEFAULTS,
  BOUNTY_MAIKO_TUNING, BOUNTY_MAIKO_TUNING_DEFAULTS,
} from '../../utils/bountyScript';

// 欄を作る小道具(section を毎行書かないためだけのもの。意味は素の TuningField と同じ)。
const mk = (section: string, group: 'behavior' | 'move') =>
  (path: string, label: string, kind: TuningField['kind'],
    min: number, max: number, step: number, hint?: string): TuningField =>
    ({ path, label, group, section, kind, min, max, step, hint });

// 共通の言い回し(idolTuning.ts と同じ文言に揃える=ボスが変わっても同じ意味で読める)。
const HINT_WINDUP = '予告が出てから判定まで';
const HINT_RECOVER = '反撃窓。820ms=近接1発';

// ================================================================================================
// バス停(bounty-ranged)
// ================================================================================================
const BR_SEC = { kite: '間合い', push: '押しのけ(br-push)', shot: '通常射撃(弾)', laser: 'レーザー(紫・カウンター不可)', escort: '取り巻き召喚', triple: '三段突(br-triple)' };

const rangedFields = (): TuningField[] => {
  const kite = mk(BR_SEC.kite, 'behavior');
  const push = mk(BR_SEC.push, 'move');
  const shot = mk(BR_SEC.shot, 'move');
  const laser = mk(BR_SEC.laser, 'move');
  const escort = mk(BR_SEC.escort, 'move');
  const triple = mk(BR_SEC.triple, 'move');
  return [
    kite('kite.min', '引き撃ち帯 下限', 'px', 0, 2000, 10, 'これより近いと後退する'),
    kite('kite.max', '引き撃ち帯 上限', 'px', 0, 2000, 10, 'これより遠いと詰める'),
    kite('push.pickRange', '押しのけを出す距離', 'px', 0, 600, 10, 'これより近づかれたら押しのけ'),

    push('push.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    push('push.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    push('push.damage', 'ダメージ', 'num', 0, 200, 1),
    push('push.reach', '帯の長さ', 'px', 10, 400, 10),
    push('push.halfWidth', '帯の半幅', 'px', 4, 200, 10),
    push('push.kb.distPx', '押し出す距離', 'px', 0, 600, 10, '共通の被弾ノックバックは60px'),
    push('push.kb.ms', '押し出す時間', 'ms', 60, 1200, 20, '短いほど鋭く飛ぶ'),

    shot('shot.speed', '弾速', 'pxs', 40, 1200, 20, 'プレイヤーは104.4px/s'),
    shot('shot.damage', '弾のダメージ', 'num', 0, 200, 1),
    shot('shot.size', '弾の大きさ', 'px', 4, 64, 2),
    shot('signTipPx', '標識の先端(弾の出る位置)', 'px', 0, 400, 10, '構えの絵の先端と発射地点が同じ値'),

    laser('laser.damage', 'ダメージ', 'num', 0, 200, 1, '本家(ミーミル)は42'),
    laser('laser.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    laser('laser.cdMs', 'クールダウン', 'ms', 0, 30000, 500, '短いほど頻繁に撃つ'),

    escort('escort.count', '呼ぶ人数', 'num', 0, 8, 1, '交戦開始に1回だけ。再召喚なし'),

    triple('triple.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
  ];
};

const BR_HELP: Record<string, string> = {
  [BR_SEC.kite]: '遠くから撃つボス。この帯を保つように前後する。近づかれたら押しのけて距離を作り直す。',
  [BR_SEC.push]: '密着への答えその1。標識を薙いで押し返す(カウンター可)。',
  [BR_SEC.shot]: '中立で撃ち続ける普通の弾。型(単発/扇/溜め)の切替そのものはまだ画面から触れない。',
  [BR_SEC.laser]: 'ミーミルから輸入した大技。**紫=カウンターできない**。寸法と溜めは本家と完全に同じで、\nここで触れるのは威力・硬直・頻度だけ(寸法を変えると本家と食い違うため)。',
  [BR_SEC.escort]: '交戦が始まった時に一度だけ雑魚を呼ぶ。',
  [BR_SEC.triple]: '密着への答えその2(バックロール→三段突き)。溜め・帯・段のタイミングはまだ画面から触れない。',
};

// ================================================================================================
// 馬乗り(bounty-melee)
// ================================================================================================
const BM_SEC = { range: '間合い', charge: '突進(bm-charge)', whip: '360度ムチ(bm-whip360)', combo: '3段コンボ(bm-combo)', snipe: '懲罰狙撃(bm-snipe)' };

const meleeFields = (): TuningField[] => {
  const rng = mk(BM_SEC.range, 'behavior');
  const ch = mk(BM_SEC.charge, 'move');
  const wp = mk(BM_SEC.whip, 'move');
  const cb = mk(BM_SEC.combo, 'move');
  const sn = mk(BM_SEC.snipe, 'move');
  return [
    rng('meleeMax', '密着とみなす距離', 'px', 0, 600, 10, 'これより近いとコンボ帯'),
    rng('farMs', '遠距離の長居', 'ms', 0, 10000, 100, 'この時間だけ遠くに居続けると懲罰狙撃が飛ぶ'),

    ch('charge.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    ch('charge.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    ch('charge.maxMs', '突進の打ち切り', 'ms', 200, 8000, 50, '届かなくてもこの時間で止まる'),
    // ★叩き台の 0.05 刻みは「9倍」を摘まむには細かすぎるので 0.5 にしてある(意図的な例外)。
    ch('charge.speedMult', '突進の速さ(倍率)', 'frac', 1, 20, 0.5, '通常移動の何倍で走るか'),
    ch('charge.reach', '狙う距離', 'px', 100, 1500, 10, '突進の目標地点までの長さ'),

    wp('whip360.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    wp('whip360.active', '振り抜き', 'ms', 50, 3000, 50, '慣性で1周する時間'),
    wp('whip360.radius', '届く半径', 'px', 20, 600, 10, '赤い円=判定。伸ばしたら予告も伸ばす'),
    wp('whip360.damage', 'ダメージ', 'num', 0, 200, 1),

    cb('combo.windup.0', '予告 1段目', 'ms', 0, 5000, 50, HINT_WINDUP),
    cb('combo.windup.1', '予告 2段目', 'ms', 0, 5000, 50, HINT_WINDUP),
    cb('combo.windup.2', '予告 3段目', 'ms', 0, 5000, 50, '遅い段=読ませて避けさせる'),
    cb('combo.damage.0', 'ダメージ 1段目', 'num', 0, 200, 1),
    cb('combo.damage.1', 'ダメージ 2段目', 'num', 0, 200, 1),
    cb('combo.damage.2', 'ダメージ 3段目', 'num', 0, 200, 1),
    cb('combo.stepRecover', '段の間の硬直', 'ms', 0, 3000, 50, '1・2段目の後だけ。短い=カウンター可'),
    cb('combo.finishRecover', '終端の硬直', 'ms', 0, 5000, 50, '確定パニッシュ窓。ここが見せ場'),
    cb('combo.range', '帯の長さ', 'px', 10, 600, 10),
    cb('combo.halfWidth', '帯の半幅', 'px', 4, 200, 10),
    cb('combo.kb.distPx', '押し出す距離(終段)', 'px', 0, 600, 10),
    cb('combo.kb.ms', '押し出す時間(終段)', 'ms', 60, 1200, 20),

    sn('snipe.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    sn('snipe.active', '判定', 'ms', 0, 3000, 50, '当たり判定が出ている時間'),
    sn('snipe.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    sn('snipe.damage', 'ダメージ', 'num', 0, 200, 1),
    sn('snipe.range', '線の長さ', 'px', 100, 2000, 25),
    sn('snipe.halfWidth', '線の半幅', 'px', 4, 200, 10),
  ];
};

const BM_HELP: Record<string, string> = {
  [BM_SEC.range]: '密着で殴り、離れると狙撃で呼び戻すボス。「近寄らざるを得ない」を作る2つの距離。',
  [BM_SEC.charge]: '狼から輸入した突進。溜めて一直線に走る。走り終わりに360度ムチへ繋がる。',
  [BM_SEC.whip]: '自分中心の円。**円から歩いて出られる予告か**が公平の物差し(半径を伸ばしたら予告も伸ばす)。',
  [BM_SEC.combo]: '速→速→遅の3段。最後だけ遅くして読ませ、終わりに長い硬直=反撃どころを作る。',
  [BM_SEC.snipe]: '遠くに居座ると飛んでくる細長い帯。まっすぐ下がるだけでは避けられない=横に動かせる技。',
};

// ================================================================================================
// 鋏(bounty-balance)
// ================================================================================================
const BB_SEC = {
  range: '間合い', sweep: '薙ぎ払い(bb-sweep)',
  triple: '薙ぎ3連発(bb-triple)', // ★v0.25.3580
  rollCombo: 'ロール台本(bb-rollcombo)', // ★v0.25.3581
  leap: '跳びかかり(leap)',
};

const balanceFields = (): TuningField[] => {
  const rng = mk(BB_SEC.range, 'behavior');
  const sw = mk(BB_SEC.sweep, 'move');
  const tr = mk(BB_SEC.triple, 'move');
  const rc = mk(BB_SEC.rollCombo, 'move');
  const lp = mk(BB_SEC.leap, 'move');
  return [
    rng('nearMax', '近いとみなす距離', 'px', 0, 800, 10, 'これより近い=薙ぎ払い / 遠い=跳びかかり'),

    sw('sweep.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    sw('sweep.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    sw('sweep.damage', 'ダメージ', 'num', 0, 200, 1),
    sw('sweep.range', '帯の長さ', 'px', 10, 600, 10, '3連発もこの長さを共有する'),
    sw('sweep.halfWidth', '帯の半幅', 'px', 4, 200, 10),

    tr('sweepTriple.chance', '3連発を引く確率', 'num', 0, 1, 0.05, '取り掛かり時の抽選。0=常に単発 / 1=常に3連発'),
    tr('sweepTriple.windup.0', '予告(1発目)', 'ms', 0, 5000, 50, HINT_WINDUP),
    tr('sweepTriple.windup.1', '予告(2発目)', 'ms', 0, 5000, 50),
    tr('sweepTriple.windup.2', '予告(3発目)', 'ms', 0, 5000, 50),
    tr('sweepTriple.stepRecover', '発間の切り返し', 'ms', 0, 2000, 50, 'この間に向きを取り直す'),
    tr('sweepTriple.damage', 'ダメージ(1発あたり)', 'num', 0, 200, 1),
    tr('sweepTriple.halfWidth', '帯の半幅', 'px', 4, 200, 10, '単発より少し狭い'),
    tr('sweepTriple.range', '帯の長さ', 'px', 10, 600, 10, '単発(250)とは別の値'), // ★v0.25.3582

    rc('rollCombo.chance', '台本を引く確率', 'num', 0, 1, 0.05, '取り掛かりで最初に判定。残りを単発/3連発で分ける'),
    rc('rollCombo.rollMs', 'バックロールの所要', 'ms', 100, 2000, 20),
    rc('rollCombo.rollDist', 'バックロールの距離', 'px', 40, 500, 10),
    rc('rollCombo.shotWindup', '高速弾の予告', 'ms', 0, 2000, 50, '頭で狙い固定=追尾しない'),
    rc('rollCombo.shotRecover', '発射後の間', 'ms', 0, 2000, 50, 'この後そのまま飛びかかりの溜めへ'),
    rc('rollCombo.shot.speed', '弾速(px/s)', 'num', 100, 1200, 20, '通常のバス停弾は260'),
    rc('rollCombo.shot.damage', '弾ダメージ', 'num', 0, 200, 1),

    lp('leap.windup', '予告(縮み溜め)', 'ms', 0, 6000, 50, HINT_WINDUP),
    lp('leap.airMs', '滞空', 'ms', 100, 4000, 50, '飛び上がってから着地するまで'),
    lp('leap.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    lp('leap.damage', 'ダメージ', 'num', 0, 200, 1),
    lp('leap.radius', '着地円の半径', 'px', 10, 400, 10, '赤い円=判定。伸ばしたら予告も伸ばす'),
  ];
};

const BB_HELP: Record<string, string> = {
  [BB_SEC.range]: '近づけば薙ぎ、離れれば跳んでくる。どちらの帯にも居場所がないのがこのボスの圧。',
  [BB_SEC.sweep]: '目の前の帯。密着に居座らせないための技。取り掛かりで単発/3連発を抽選する。',
  [BB_SEC.triple]: '薙ぎの3連発版(v0.25.3580)。帯が少し狭い代わりに2-3発目が早い。締めの硬直と帯の長さは単発と共有。',
  [BB_SEC.rollCombo]: '近距離台本(v0.25.3581): バックロールで距離を空け→高速弾を1発→そのまま飛びかかり。弾の見た目は共通の赤い二重丸。',
  [BB_SEC.leap]: 'パンプキンから輸入した跳躍。着地点は予告の時点で固定=歩いて円の外へ出れば避けられる。',
};

// ================================================================================================
// 舞妓(bounty-maiko)
// ================================================================================================
const MK_SEC = { range: '間合いと型', nag: '毬の薙ぎ(mk-naginata)', spin: '毬回し(mk-spin)', suiu: '水鳥乱舞(mk-suiu)', boom: '手毬打ち(mk-boom)' };

const maikoFields = (): TuningField[] => {
  const rng = mk(MK_SEC.range, 'behavior');
  const ng = mk(MK_SEC.nag, 'move');
  const sp = mk(MK_SEC.spin, 'move');
  const su = mk(MK_SEC.suiu, 'move');
  const bm = mk(MK_SEC.boom, 'move');
  return [
    rng('nearMax', '近いとみなす距離', 'px', 0, 800, 10, 'これより近い=毬の薙ぎ'),
    rng('farMin', '手毬打ちの間合い', 'px', 0, 2000, 10, 'これより遠いと手毬打ち'),
    rng('phaseHpFrac', '型Bへ切り替わるHP', 'frac', 0, 1, 0.05, 'HP割合。1回だけ切り替わる'),
    rng('reposeMs', '型切替の舞い直し', 'ms', 0, 3000, 50, '短い硬直・無敵なし'),

    ng('naginata.windup.0', '予告(型A・速)', 'ms', 0, 5000, 50, '2択からランダム=変則ディレイ'),
    ng('naginata.windup.1', '予告(型A・遅)', 'ms', 0, 5000, 50, '2択からランダム=変則ディレイ'),
    ng('naginata.windup1.0', '予告(型B1段・速)', 'ms', 0, 5000, 50),
    ng('naginata.windup1.1', '予告(型B1段・遅)', 'ms', 0, 5000, 50),
    ng('naginata.windup2.0', '予告(型B2段・速)', 'ms', 0, 5000, 50),
    ng('naginata.windup2.1', '予告(型B2段・遅)', 'ms', 0, 5000, 50),
    ng('naginata.stepRecover', '段の間の硬直', 'ms', 0, 3000, 50, '型Bの1段目→2段目'),
    ng('naginata.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
    ng('naginata.damage', 'ダメージ', 'num', 0, 200, 1),
    ng('naginata.range', '帯の長さ', 'px', 10, 600, 10),
    ng('naginata.halfWidth', '帯の半幅', 'px', 4, 200, 10),

    sp('spin.windup.0', '予告(速)', 'ms', 0, 5000, 50, '2択からランダム'),
    sp('spin.windup.1', '予告(遅)', 'ms', 0, 5000, 50, '2択からランダム'),
    sp('spin.active', '回している時間', 'ms', 50, 3000, 50),
    sp('spin.radius', '円の半径', 'px', 20, 600, 10, '赤い円=判定。伸ばしたら予告も伸ばす'),
    sp('spin.lungePx', '踏み込む距離', 'px', 0, 600, 10, '回したまま前進する。0だと中距離で当たらない'),
    sp('spin.damage', 'ダメージ', 'num', 0, 200, 1),
    sp('spin.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),

    su('suiu.hopInterval.0', 'ホップ間隔(速)', 'ms', 100, 4000, 50, '各ホップの予告時間そのもの'),
    su('suiu.hopInterval.1', 'ホップ間隔(遅)', 'ms', 100, 4000, 50, '各ホップの予告時間そのもの'),
    su('suiu.travelMs', '着地直前の移動', 'ms', 0, 2000, 20),
    su('suiu.radius', '着地円の半径', 'px', 10, 400, 10, '赤い円=判定。伸ばしたら間隔も伸ばす'),
    su('suiu.finalRadiusMult', '最終段の円の倍率', 'frac', 1, 4, 0.05),
    su('suiu.offsetRange', '着地点のばらつき', 'px', 0, 400, 10, 'プレイヤー位置からのズレ幅'),
    su('suiu.damage', 'ダメージ', 'num', 0, 200, 1),
    su('suiu.recover', '硬直', 'ms', 0, 6000, 50, HINT_RECOVER),

    bm('boom.windup', '予告', 'ms', 0, 5000, 50, HINT_WINDUP),
    bm('boom.outMs', '往路の時間', 'ms', 50, 3000, 20, '距離はそのままで縮めると速くなる'),
    bm('boom.backMs', '復路の時間', 'ms', 50, 3000, 20),
    bm('boom.range', '飛ぶ距離', 'px', 100, 2000, 10),
    bm('boom.hitRadius', '毬の当たり半径', 'px', 4, 200, 10, '毬の絵に揃える'),
    bm('boom.damage', 'ダメージ', 'num', 0, 200, 1),
    bm('boom.recover', '硬直', 'ms', 0, 5000, 50, HINT_RECOVER),
  ];
};

const MK_HELP: Record<string, string> = {
  [MK_SEC.range]: '型A(HP多)と型B(HP少)で手が変わるボス。距離で薙ぎ/回し/手毬打ちを撃ち分ける。',
  [MK_SEC.nag]: '基本の帯。予告が**2択のランダム**なので、同じ技でも待ちの長さが毎回変わる(変則ディレイ)。',
  [MK_SEC.spin]: '自分中心の円を回しながら踏み込む。踏み込みを0にすると中距離で構造的に当たらなくなる。',
  [MK_SEC.suiu]: '型B専用の大技。3連の着地円。半径を広げたらホップ間隔も伸ばす(歩いて出られる時間を残す)。',
  [MK_SEC.boom]: '遠距離のブーメラン。距離と時間の比が速さになる(時間を縮めすぎると毬が読めなくなる)。',
};

// ================================================================================================
// ▶個別再生(v0.25.3563・社長指示「技再生ボタンは必須」)
// ================================================================================================
// section は**数値欄と同じ見出し文字列**にする(UIはsectionで突き合わせるので、ここがズレると
// 「見出しはあるのに▶が別の場所に出る」になる)。1つの節に1つなら見出しの右に▶が出て、
// 2つ以上なら節を開いた中に並ぶ(パネル側の既存の作法。ここでは何も足していない)。
const play = (key: BountyMoveKey, label: string, section: string): PlayableAction =>
  ({ kind: 'move', key, label, section });

const BR_PLAYABLES: readonly PlayableAction[] = [
  play('br-push', '押しのけ', BR_SEC.push),
  play('br-laser', 'レーザー', BR_SEC.laser),
  // 台本(ロール→三段突き)と、三段突きだけ。実戦では近距離が台本・中距離が直行なので、
  // **どちらの入り方も見られるように2つ出す**(距離条件は再生時にバイパスされる)。
  play('br-roll', 'ロール→三段突き', BR_SEC.triple),
  play('br-triple', '三段突きだけ', BR_SEC.triple),
];
const BM_PLAYABLES: readonly PlayableAction[] = [
  play('bm-charge', '突進(→ムチ)', BM_SEC.charge),
  play('bm-whip360', 'ムチだけ', BM_SEC.whip),
  play('bm-combo', '3段コンボ', BM_SEC.combo),
  play('bm-snipe', '懲罰狙撃', BM_SEC.snipe),
];
const BB_PLAYABLES: readonly PlayableAction[] = [
  play('bb-sweep', '薙ぎ払い', BB_SEC.sweep),
  play('bb-triple', '薙ぎ3連発', BB_SEC.triple), // ★v0.25.3580
  play('bb-rollcombo', 'ロール台本', BB_SEC.rollCombo), // ★v0.25.3581
  play('bb-leap', '跳びかかり', BB_SEC.leap),
];
const MK_PLAYABLES: readonly PlayableAction[] = [
  // 毬の薙ぎは**いまの型に従う**(型A=単発 / 型B=2連)。型は HP40% ボタンで切り替える。
  play('mk-naginata', '毬の薙ぎ', MK_SEC.nag),
  play('mk-spin', '毬回し', MK_SEC.spin),
  play('mk-suiu', '水鳥乱舞', MK_SEC.suiu),
  play('mk-boom', '手毬打ち', MK_SEC.boom),
];

/** ▶を押した時の実行(4体で同じ1本。ボス側の要求箱へ渡すだけ)。 */
const onBountyPlay = (a: PlayableAction, opts: { solo: boolean; loop: boolean }): void => {
  requestBountyMovePlay(a.key as BountyMoveKey, opts);
};

/**
 * 「並べたボタン」と「ボス側が実際に始められる技」が食い違っていないかの検算材料
 * (bountyTuning.test.ts が突き合わせる。押しても何も起きないボタンを作らないため)。
 */
export const BOUNTY_PLAYABLES_BY_TYPE: Readonly<Record<string, readonly PlayableAction[]>> = {
  'bounty-ranged': BR_PLAYABLES,
  'bounty-melee': BM_PLAYABLES,
  'bounty-balance': BB_PLAYABLES,
  'bounty-maiko': MK_PLAYABLES,
};
export { BOUNTY_MOVES_BY_TYPE };

// ================================================================================================
// 登録
// ================================================================================================
export const BOUNTY_RANGED_FIELDS: readonly TuningField[] = rangedFields();
export const BOUNTY_MELEE_FIELDS: readonly TuningField[] = meleeFields();
export const BOUNTY_BALANCE_FIELDS: readonly TuningField[] = balanceFields();
export const BOUNTY_MAIKO_FIELDS: readonly TuningField[] = maikoFields();

/** ボスメーカーへ賞金首4種を登録する(BossMakerPanel が起動時に1回呼ぶ)。 */
export const registerBountyTuning = (): void => {
  // 表示名はカットイン台帳(bossCutin.ts)に揃える(名称統一バッチ・社長指示v0.25.3443)。
  registerBossTuning({
    bossType: 'bounty-ranged', label: 'バス停(変異)',
    table: BOUNTY_RANGED_TUNING as unknown as Record<string, unknown>,
    defaults: BOUNTY_RANGED_TUNING_DEFAULTS as unknown as Record<string, unknown>,
    fields: BOUNTY_RANGED_FIELDS, sectionHelp: BR_HELP,
    // hasPhase2 は宣言しない=賞金首4体はフェーズを bossPhase で持たないので P2 ボタンを出さない
    // (舞妓の型Bだけは bossPhase を使うが、切替はHP閾値方式=HP40%ボタンで到達する。§7も参照)。
    playables: BR_PLAYABLES, onPlay: onBountyPlay, playState: getBountyPlayback,
  });
  registerBossTuning({
    bossType: 'bounty-melee', label: '馬乗り(変異)',
    table: BOUNTY_MELEE_TUNING as unknown as Record<string, unknown>,
    defaults: BOUNTY_MELEE_TUNING_DEFAULTS as unknown as Record<string, unknown>,
    fields: BOUNTY_MELEE_FIELDS, sectionHelp: BM_HELP,
    playables: BM_PLAYABLES, onPlay: onBountyPlay, playState: getBountyPlayback,
  });
  registerBossTuning({
    bossType: 'bounty-balance', label: '鋏(変異)',
    table: BOUNTY_BALANCE_TUNING as unknown as Record<string, unknown>,
    defaults: BOUNTY_BALANCE_TUNING_DEFAULTS as unknown as Record<string, unknown>,
    fields: BOUNTY_BALANCE_FIELDS, sectionHelp: BB_HELP,
    playables: BB_PLAYABLES, onPlay: onBountyPlay, playState: getBountyPlayback,
  });
  registerBossTuning({
    bossType: 'bounty-maiko', label: '舞妓(変異)',
    table: BOUNTY_MAIKO_TUNING as unknown as Record<string, unknown>,
    defaults: BOUNTY_MAIKO_TUNING_DEFAULTS as unknown as Record<string, unknown>,
    fields: BOUNTY_MAIKO_FIELDS, sectionHelp: MK_HELP,
    playables: MK_PLAYABLES, onPlay: onBountyPlay, playState: getBountyPlayback,
  });
};
