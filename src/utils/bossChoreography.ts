/**
 * ボスの攻撃を単発抽選ではなく、前の技が次の技を成立させる短い台本へ変換する。
 * 先頭は抽選済みの始動技。Phase1は学習しやすい2手、後半は3手を基本にする。
 */
import { BOSS_STRING_REST_MS } from './bossTelegraph';
export type ChoreographyBoss =
  | 'giant' | 'glen' | 'mimir' | 'jormungand' | 'skadi' | 'thor'
  | 'miguel' | 'jibril' | 'rafi' | 'uri' | 'suriel' | 'acrasiel' | 'phillboss';

const trimForPhase = (moves: readonly string[], phase: number): string[] =>
  moves.slice(0, phase <= 1 ? 2 : 3);

const GIANT: Record<string, readonly string[]> = {
  stomp: ['stomp', 'jump', 'sweep'], sweep: ['sweep', 'bolt', 'dash'],
  jump: ['jump', 'sweep', 'stomp'], dash: ['dash', 'stomp', 'bolt'],
  bolt: ['bolt', 'dash', 'stomp'], bite: ['bite', 'jump', 'slam'],
  slam: ['slam', 'bolt', 'dash'], glide: ['glide', 'bolt', 'dive'],
  dive: ['dive', 'sweep', 'bolt'], quaddash: ['quaddash', 'stomp', 'nova'],
  nova: ['nova', 'dash', 'stomp'], wing: ['wing', 'bolt', 'sweepbeam'],
  sweepbeam: ['sweepbeam', 'dash', 'stomp'],
};

const GLEN: Record<string, readonly string[]> = {
  stomp: ['stomp', 'talon', 'reach'], sweep: ['sweep', 'boon', 'trijump'],
  jump: ['jump', 'talon', 'reach'], dash: ['dash', 'reach', 'talon'],
  bolt: ['bolt', 'reach', 'trijump'], trijump: ['trijump', 'stomp', 'talon'],
  talon: ['talon', 'dash', 'reach'], boon: ['boon', 'sweep', 'trijump'],
  reach: ['reach', 'bolt', 'nihil'], nihil: ['nihil', 'trijump', 'talon'],
};

const SCRIPTS: Record<Exclude<ChoreographyBoss, 'giant' | 'glen'>, Record<string, readonly string[]>> = {
  mimir: {
    dash: ['dash', 'bite', 'burst'], bite: ['bite', 'burst', 'laser'],
    radial: ['radial', 'laser', 'dash'], burst: ['burst', 'dash', 'bite'], laser: ['laser', 'dash', 'bite'],
  },
  jormungand: {
    dash: ['dash', 'coil', 'burst'], coil: ['coil', 'burst', 'radial'],
    burst: ['burst', 'radial', 'dash'], radial: ['radial', 'dash', 'coil'],
  },
  skadi: {
    ice: ['ice', 'dash', 'blade'], blade: ['blade', 'burst', 'ice'],
    dash: ['dash', 'ice', 'blade'], burst: ['burst', 'radial', 'blade'],
    radial: ['radial', 'dash', 'ice'], cage: ['cage', 'burst', 'radial'],
  },
  thor: {
    issen: ['issen', 'harai', 'tsuki'], tsuki: ['tsuki', 'issen', 'harai'],
    harai: ['harai', 'tsuki', 'issen'], jump: ['jump', 'harai', 'tsuki'],
    // ★research/THOR_ISSEN_REWORK.md §4(社長裁定2026-08-21「突進足して。で、突 突 を付けて」):
    // 新技「突進」の起点にだけ台本を1本足す。**既存4起点(issen/tsuki/harai/jump)は1文字も変えない**
    // ——起点は既に4本すべて埋まっていて、突き起点に新台本を置くと既存の `['tsuki','issen','harai']` を
    // 潰すことになる(社長が避けていたのはこの上書き)。3手なので trimForPhase(Phase1=2/Phase2+=3)の
    // 枠内に収まる=長さの特例もフェーズ条件も要らない。
    // ★この「枠内に収まるので特例は要らない」という推論は **§9-13 が『見落としていた』と認定した当のもの**
    // (Phase1 は先頭2手に切られるので `['dash','tsuki']`=**社長指定の「突 突」が HPバーの最初の4割で
    // 出ない**)。**research/THOR_ISSEN_REWORK.md §9-13 で社長裁定待ち**(推薦=突進の台本だけ
    // 長さの特例でPhase1も3手)。**結論として読まないこと**——裁定が出たらここが動く。
    dash: ['dash', 'tsuki', 'tsuki'],
  },
  miguel: {
    dash: ['dash', 'harai', 'volley'], harai: ['harai', 'volley', 'dash'], volley: ['volley', 'dash', 'harai'],
  },
  jibril: {
    lantern: ['lantern', 'volley', 'consecrate'], consecrate: ['consecrate', 'volley', 'lantern'],
    volley: ['volley', 'lantern', 'consecrate'],
  },
  rafi: {
    bone: ['bone', 'jump', 'sweep'], jump: ['jump', 'bone', 'sweep'], sweep: ['sweep', 'bone', 'jump'],
  },
  uri: {
    sweep: ['sweep', 'downslash', 'thrust'], downslash: ['downslash', 'thrust', 'bolt'],
    thrust: ['thrust', 'sweep', 'downslash'], bolt: ['bolt', 'thrust', 'downslash'],
  },
  suriel: {
    ringshot: ['ringshot', 'sweep', 'gaze'], sweep: ['sweep', 'gaze', 'ringshot'],
    gaze: ['gaze', 'ringshot', 'sweep'], ringspin: ['ringspin', 'ringshot', 'sweep'],
  },
  acrasiel: {
    spike: ['spike', 'spear', 'warp'], spear: ['spear', 'warp', 'burst'],
    warp: ['warp', 'burst', 'gaze'], burst: ['burst', 'spike', 'spear'], gaze: ['gaze', 'warp', 'burst'],
  },
  // フィル(§10・バッチ2): 開幕連携は最小1本(社長指示「開幕連携は最小1本でよい」・PACING_PUZZLE.md
  // §10タスク項6)。近接3技どうし・弾/範囲技どうしを軽く繋ぐだけの叩き台(調整は実機で)。
  phillboss: {
    wingslash: ['wingslash', 'wingthrust', 'wingcombo'],
    wingthrust: ['wingthrust', 'wingcombo', 'wingslash'],
    wingcombo: ['wingcombo', 'wingslash', 'lancefan'],
    lancefan: ['lancefan', 'meteor', 'goldring'],
    lightrain: ['lightrain', 'goldring', 'ringtoss'],
    goldring: ['goldring', 'ringtoss', 'lightrain'],
    meteor: ['meteor', 'lancefan', 'ringtoss'],
    ringtoss: ['ringtoss', 'wingthrust', 'meteor'],
    // ★v0.25.3741(社長指示「召喚→急降下を台本化。どちらも単発では出さない」): 雑魚を呼んだら
    // 本人が天に消えて急降下で戻る2手固定(phase2でも2手のまま)。diveの単独行は削除
    // (単発抽選もphillScript側でfalse=急降下はこの連携経由でしか出ない)。
    summon: ['summon', 'dive'],
    feathershot: ['feathershot', 'meteor', 'wingthrust'],
    // ★judgment/cage(カウンター必須)はこの表に載せない=`table[opening] ?? [opening]`のフォールバックで
    // 「自分自身1つだけ」になる(planBossChoreographyのslice(1)で連携キューは常に空)。§10-14#7の
    // 「同時に1つ・4秒間隔」ゲートはpickPhillMove側が持つため、台本連携でそれをバイパスさせない。
  },
};

export const planBossChoreography = (
  boss: ChoreographyBoss, opening: string, phase: number,
  // v0.25.3033(glen専用・社長裁定): 台本(キュー)は抽選のreadyゲートを通らないため、ここで濾さないと
  // 禁止技が連携経由で漏れる。①reach(触手)は「通常弾3連発の直後のみ」(g-bolt-burst終端の専用予約)
  // =**連携表からは常に除外** ②nihil/trijumpは第二形態専属(裁定1い)=glenBigMoves=falseなら除外。
  opts?: { glenBigMoves?: boolean },
): string[] => {
  const table = boss === 'giant' ? GIANT : boss === 'glen' ? GLEN : SCRIPTS[boss];
  let moves: readonly string[] = table[opening] ?? [opening];
  if (boss === 'glen') {
    moves = moves.filter((m, i) => i === 0
      || (m !== 'reach' && (opts?.glenBigMoves === true || (m !== 'nihil' && m !== 'trijump'))));
  }
  return trimForPhase(moves, phase);
};

/**
 * 台本途中は一息で次へつなぎ、締めだけ必ず2発ぶんの反撃時間を残す。
 * 「連携の圧」と「小休止」を同じ関数から全ボスへ配るため、個別コントローラ側で
 * 900/1700msを複製しない。
 */
export const choreographyRecoverMs = (normalRecoverMs: number, hasFollowup: boolean): number =>
  hasFollowup ? Math.min(normalRecoverMs, 300) : Math.max(normalRecoverMs, BOSS_STRING_REST_MS);
