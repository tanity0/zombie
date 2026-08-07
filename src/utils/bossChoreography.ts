/**
 * ボスの攻撃を単発抽選ではなく、前の技が次の技を成立させる短い台本へ変換する。
 * 先頭は抽選済みの始動技。Phase1は学習しやすい2手、後半は3手を基本にする。
 */
import { BOSS_STRING_REST_MS } from './bossTelegraph';
export type ChoreographyBoss =
  | 'giant' | 'glen' | 'mimir' | 'jormungand' | 'skadi' | 'thor'
  | 'miguel' | 'jibril' | 'rafi' | 'uri' | 'suriel' | 'acrasiel';

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
};

export const planBossChoreography = (boss: ChoreographyBoss, opening: string, phase: number): string[] => {
  const table = boss === 'giant' ? GIANT : boss === 'glen' ? GLEN : SCRIPTS[boss];
  return trimForPhase(table[opening] ?? [opening], phase);
};

/**
 * 台本途中は一息で次へつなぎ、締めだけ必ず2発ぶんの反撃時間を残す。
 * 「連携の圧」と「小休止」を同じ関数から全ボスへ配るため、個別コントローラ側で
 * 900/1700msを複製しない。
 */
export const choreographyRecoverMs = (normalRecoverMs: number, hasFollowup: boolean): number =>
  hasFollowup ? Math.min(normalRecoverMs, 300) : Math.max(normalRecoverMs, BOSS_STRING_REST_MS);
