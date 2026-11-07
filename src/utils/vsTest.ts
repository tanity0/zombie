// 1対1の間合い(BOSS_MAKER.md §21)。**開発用の枠**——弾ゼロで敵1体だけと向き合い、
// 挙動とカウンターの効き方を見るためのもの(社長依頼2026-09-23「銃弾ゼロで、敵と1:1になれる場面が
// ほしい。挙動やカウンター挙動などをチェックしたい。本編には要らない機能。」)。
//
// ★専用の部屋は作らない。**実ステージへ出て湧きだけを止める**(`?nospawn=1`=既存)。
//   人工の部屋はテスト結果ごと偽物になる前例があるため(§21-1)。
//
// このモジュールは**純関数だけ**(台帳+URLの読み書き)。出現と再出現は useGameLoop、
// 表示と遷移は tools/bossmaker/BossTestMenu.tsx。
import type { EnemyType } from '../types/game';
import { ENEMY_VARIANT_SETS, spriteVariantIndex } from './enemyVariant';
import type { LabZombieSex } from './labZombieSex';

/** 出撃先。森(平地)=非lab・非corridorで、既存のボス戦テストと同じ扱いの場。 */
export const VS_STAGE = 'stage-1';

/** 倒してから次の1体が出るまで。 */
export const VS_RESPAWN_MS = 1500;

/** 出現距離(プレイヤーから)。画面内で、出現が見える範囲。 */
export const VS_SPAWN_DIST_MIN = 380;
export const VS_SPAWN_DIST_MAX = 500;

/**
 * ★★**1対1枠で「素の湧き」だと本物にならない型の初期化**
 * (社長報告2026-09-24「**なんか死神に当たり判定無いし、人形も出してこなくなっちゃった**」)。
 *
 * 死神は `spawnEnemyAt('reaper')` だけでは **`reaperChaser` が立たない**ので `isTerminalReaper` が
 * false のままになり、**2つ同時に壊れる**:
 * ① **プレイヤーの攻撃の対象から外れる**——直線帯・朱雀の爆風・狩人の近接・POI爆撃はどれも
 *    `isReaperFamily(type) && !isTerminalReaper(e)` で弾く(本来は「気配の横切り等、戦闘対象でない
 *    死神」を除くための述語)。**=当たり判定が無いように見える。**
 * ② **本体ブロック(鐘・使者の召喚・専用移動)が丸ごと走らない**——入口が
 *    `enemies.filter(isTerminalReaper)` なので、1体も居ない扱いになる。**=人形が1体も出ない。**
 *
 * ★**値は持たない**(`REAPER2_CONFIG` を呼び手が渡す)。台帳を二重に持つと本編と枠でズレる。
 * `null` = 素の湧きのままでよい型。
 */
export interface VsBodyInit {
  reaperChaser: true;
  health: number;
  maxHealth: number;
  damage: number;
  speed: number;
}

export const vsBodyInit = (
  type: EnemyType,
  cfg: { bodyHealth: number; bodyContactDamage: number; bodySpeedMult: number },
  playerSpeed: number,
): VsBodyInit | null => (type === 'reaper'
  ? {
    reaperChaser: true,
    health: cfg.bodyHealth,
    maxHealth: cfg.bodyHealth,
    damage: cfg.bodyContactDamage,
    speed: playerSpeed * cfg.bodySpeedMult,
  }
  : null);

export interface VsEntry {
  /** URLに載る名前(`?vs=`)。型名か、変種を持つ型は `型-添字`。 */
  key: string;
  type: EnemyType;
  /** `ENEMY_VARIANT_SETS[type]` の添字。undefined=変種を指定しない(IDのハッシュ任せ)。 */
  variantIndex?: number;
  /** 一覧に出す注記。**敵の名前は enemyDeathLabel から引く**(ここに名前を書き写さない)。 */
  note?: string;
  /** 出撃先(未指定=`VS_STAGE`=森)。**その型が本来いる場で立てる**(研究所ゾンビ=研究所)。 */
  stage?: string;
  /** 研究所ゾンビLv1の見た目(男女は敵IDの偶奇で決まる=`utils/labZombieSex.ts`)。 */
  labSex?: LabZombieSex;
}

/**
 * 1対1で出せる相手。
 *
 * ★載せる基準: **既存の「ボス戦テスト」(`BOSS_TEST_ENTRIES`)に無く、`spawnEnemyAt` で森に出せる型**。
 *   ボス16体はあちらが1体ずつ出せるので重複させない(§21-3)。
 * ★**変種を持つ型は変種ごとに1行**。絵が違うと攻撃シートのコマ数も違う(bat-female 6 / bat-male 7)ので、
 *   片方しか見られないと確認にならない。
 * ★研究所ゾンビ(`lab-zombie-1/2/3`)は**研究所(ステージ2)で立てる**(社長指摘2026-09-26
 *   「ボスメーカーに研究所の敵達がいない」)。森では場が違う(休眠・視界・起床が研究所の作り)。
 *   Lv1 は男女で絵が違う(歩きのシートも別)ので**男女を別の行**にする。
 * ★載せていない型と理由:
 *   - `hangedman` = 死神の技が呼ぶ据え物であって、単体で向かってくる相手ではない。
 *   - `giantbat` ほかボス16体 = 既存のボス戦テストにある。
 */
export const VS_ENTRIES: readonly VsEntry[] = [
  // ENEMY_VARIANT_SETS.bat = ['bat-male', 'bat-female'](順序=添字)
  { key: 'bat-0', type: 'bat', variantIndex: 0, note: '雄' },
  { key: 'bat-1', type: 'bat', variantIndex: 1, note: '雌' },
  // ENEMY_VARIANT_SETS.skeleton = ['skeleton-female', 'skeleton-male']
  { key: 'skeleton-0', type: 'skeleton', variantIndex: 0, note: '女' },
  { key: 'skeleton-1', type: 'skeleton', variantIndex: 1, note: '男' },
  { key: 'zombie', type: 'zombie' },
  { key: 'plant', type: 'plant' },
  { key: 'ghost', type: 'ghost' },
  { key: 'werewolf', type: 'werewolf' },
  { key: 'screamer', type: 'screamer' },
  { key: 'driller', type: 'driller' },
  { key: 'logger', type: 'logger' },
  { key: 'lich', type: 'lich' },
  { key: 'pumpkin', type: 'pumpkin' },
  { key: 'hunter', type: 'hunter' },
  { key: 'reaper', type: 'reaper' },
  { key: 'lab-zombie-1-f', type: 'lab-zombie-1', note: '女', stage: 'stage-2', labSex: 'female' },
  { key: 'lab-zombie-1-m', type: 'lab-zombie-1', note: '男', stage: 'stage-2', labSex: 'male' },
  { key: 'lab-zombie-2', type: 'lab-zombie-2', stage: 'stage-2' },
  { key: 'lab-zombie-3', type: 'lab-zombie-3', stage: 'stage-2' },
];

/** `?vs=` を読む純関数(未知/未指定は null=通常のラン)。window非依存。 */
export const parseVsEntry = (search: string): VsEntry | null => {
  const raw = new URLSearchParams(search).get('vs');
  if (!raw) return null;
  return VS_ENTRIES.find(e => e.key === raw) ?? null;
};

/** `?noammo=1` か。1対1の枠に限らず、既存のボス戦テストからも使える。 */
export const parseNoAmmo = (search: string): boolean =>
  new URLSearchParams(search).get('noammo') === '1';

/** いまの読込の1対1の相手(ページ読込時のURLが真実=強制出現フラグと同じ作法)。 */
export const vsEntryOfRun = (): VsEntry | null =>
  parseVsEntry(typeof window === 'undefined' ? '' : window.location.search);

/** いまの読込が弾ゼロか。 */
export const isNoAmmoRun = (): boolean =>
  parseNoAmmo(typeof window === 'undefined' ? '' : window.location.search);

/**
 * 狙った変種になるIDを作る。
 *
 * 変種は**敵IDのハッシュ**で決まる(`spriteVariantIndex`)ので、出したい絵に当たるまで
 * 接尾辞を足して合わせる。IDの一意性は保たれる(元のIDに文字を足すだけ)。
 * ★変種を持たない型・添字が範囲外の時は**元のIDをそのまま返す**(触らない)。
 */
export const idForVariant = (baseId: string, type: string, wantIndex: number | undefined): string => {
  if (wantIndex === undefined) return baseId;
  const set = ENEMY_VARIANT_SETS[type];
  if (!set || set.length <= 1) return baseId;
  const want = Math.max(0, Math.min(set.length - 1, Math.floor(wantIndex)));
  if (spriteVariantIndex(baseId, set.length) === want) return baseId;
  // 接尾辞を1文字ずつ伸ばす。ハッシュは31進なので数文字で必ず全ての剰余に当たる。
  for (let n = 1; n <= 64; n++) {
    const id = `${baseId}v${n}`;
    if (spriteVariantIndex(id, set.length) === want) return id;
  }
  return baseId;   // 当たらなかった(理論上ここへは来ない)。絵が違うだけなので落とさない。
};

/** 出撃URLのクエリ部。ボス戦テストと同じ作法(smoke=1でタイトル/メニューを飛ばす)。 */
export const vsQuery = (e: VsEntry, characterClass: string, noAmmo: boolean): string => {
  const p = new URLSearchParams();
  p.set('smoke', '1');
  p.set('stage', e.stage ?? VS_STAGE);
  p.set('nospawn', '1');
  p.set('vs', e.key);
  if (noAmmo) p.set('noammo', '1');
  p.set('class', characterClass);
  p.set('retry', '1');
  return `?${p.toString()}`;
};

/**
 * 出撃時の残弾。弾ゼロの回は**全プールを0**にする(§21-4)。
 * ★武器そのものは取り上げない——持ち替えの挙動もHUDの枯渇表示も、そのまま見たいため。
 */
export const vsStartAmmo = <T extends Record<string, number>>(initial: T, noAmmo: boolean): T =>
  noAmmo ? (Object.fromEntries(Object.keys(initial).map(k => [k, 0])) as T) : initial;
