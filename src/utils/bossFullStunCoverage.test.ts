import { describe, it, expect } from 'vitest';
import { applyBossPostureDamage } from './bossPosture';
import type { Enemy } from '../types/game';

// 紫の完全気絶(ポスチャーブレイク=`bossFullStunUntil`)中は、**どのボスも攻撃を止める**。
//
// ★このテストが在る理由(v0.25.2892の実バグ):
// ボスの状態機械は**4つのファイルに分かれて**いる。裏ボス4体・天使6体・城ボス系は紫を見ていたのに、
// **アイドルだけ見ていなかった**(v0.25.2613 で状態機械を useGameLoop から idolTick.ts へ移設した
// 時に落ちた)。結果、リティクルは紫になるのに弾を撃ち続けていた。
// CLAUDE.md の教訓「同じ"動作"を持つ全員に付ける。1経路だけ書くと必ず取りこぼす」の実例なので、
// **経路ごとに紫を見ているか**をソース走査で機械化する(ghostTelegraph.test.ts と同じ流儀)。
//
// ソースは vite の ?raw で読む(このリポジトリは @types/node を入れていないので node:fs は使わない)。
const SOURCES = import.meta.glob<string>(
  ['../store/gameStore.ts', './angelBossTick.ts', '../hooks/useGameLoop.ts', './idolTick.ts'],
  { query: '?raw', import: 'default', eager: true },
);

const srcOf = (suffix: string): string => {
  const key = Object.keys(SOURCES).find(k => k.endsWith(suffix));
  if (!key) throw new Error(`走査対象が見つからない: ${suffix}(パスが変わったらこのテストも直す)`);
  return SOURCES[key];
};

describe('紫(完全気絶)を全てのボス制御経路が見ていること', () => {
  // [ファイル, その経路が担当するボス, 何本の状態機械がそこに在るか(=最低この回数は判定が要る)]
  const ROUTES: [string, string, number][] = [
    ['angelBossTick.ts', '天使6体(ミゲル/ジブリル/ラフィ/ウリ/スリィエル/アクラシエル)', 6],
    ['useGameLoop.ts', '裏ボス4体(ミーミル/ヨルムンガルド/スカジ/トール)', 1],
    ['idolTick.ts', 'アイドル', 1],
  ];

  it.each(ROUTES)('%s(%s)が bossFullStunUntil を見ている', (file, _who, minChecks) => {
    const src = srcOf(file);
    // ★**実際の判定式**を数える(識別子だけを数えると、コメントに名前を書いただけで通ってしまう)。
    // 3経路とも同じ形 `x.bossFullStunUntil !== undefined && <now> < x.bossFullStunUntil` で書いてある。
    const hits = src.match(/bossFullStunUntil !== undefined/g)?.length ?? 0;
    expect(hits, `${file} に bossFullStunUntil の判定が無い=そのボスは紫でも攻撃してくる`)
      .toBeGreaterThanOrEqual(minChecks);
  });

  it('★城ボス系(gameStore の汎用tick)は stunUntil の早期returnで止まる', () => {
    // こちらだけ経路が違う: 紫の発火が `bossFullStunUntil` と `stunUntil` を**同時に**打つので、
    // 汎用tickの気絶ゲート(aiPhaseごとリセットして早期return)がそのまま効く。
    // その前提=「紫を打つ側が stunUntil も一緒に立てる」が崩れたら、城ボス/グレンが紫でも
    // 技を出し続けるようになるため、bossPosture.ts 側で固定する(下のテスト)。
    const src = srcOf('gameStore.ts');
    expect(src).toMatch(/enemy\.stunUntil !== undefined && gameTime < enemy\.stunUntil/);
  });
});

// v0.25.2895(バッチ2「ボス制御経路間の整合性修正」): 紫(bossFullStunUntil)と同じ形で、
// 共有メカニクス(トラップ拘束/クリ黄色窓の移動半減/行ける帯クランプ)が一部経路にだけ実装されて
// いない穴を塞いだ。紫の時と同じくソース走査で機械化する(実装精度の規律6「教訓は即機械化」)。
describe('トラップ拘束(rootUntil)を全てのボス制御経路が見ていること', () => {
  const FILES = ['gameStore.ts', 'useGameLoop.ts', 'angelBossTick.ts', 'idolTick.ts'];

  it.each(FILES)('%s に rootUntil の判定がある', (file) => {
    const src = srcOf(file);
    const hits = src.match(/rootUntil !== undefined/g)?.length ?? 0;
    expect(hits, `${file} に rootUntil の判定が無い=そのボスはトラップ中でも動く/攻撃する`)
      .toBeGreaterThanOrEqual(1);
  });
});

describe('クリ黄色窓の移動半減(bossSlowMult)を全てのボス制御経路が使っていること', () => {
  const ROUTES: [string, number][] = [
    ['gameStore.ts', 1],
    ['useGameLoop.ts', 1],
    ['angelBossTick.ts', 6],
    ['idolTick.ts', 1],
  ];

  it.each(ROUTES)('%s に bossSlowMult の呼び出しが%d件以上ある', (file, minCalls) => {
    const src = srcOf(file);
    const hits = src.match(/bossSlowMult\(/g)?.length ?? 0;
    expect(hits, `${file} の移動速度にbossSlowMultが掛かっていない=クリ黄色窓中の移動半減が効かない`)
      .toBeGreaterThanOrEqual(minCalls);
  });
});

describe('「行ける帯」のクランプ(clampRectToPlayableArea)を天使/アイドルが通っていること', () => {
  it.each(['idolTick.ts', 'angelBossTick.ts'])('%s が clampRectToPlayableArea を呼んでいる', (file) => {
    const src = srcOf(file);
    const hits = src.match(/clampRectToPlayableArea\(/g)?.length ?? 0;
    expect(hits, `${file} がclampRectToPlayableAreaを通っていない=プレイヤーの行けない場所へボスが出る`)
      .toBeGreaterThanOrEqual(1);
  });
});

describe('紫の発火は stunUntil も同時に立てる(城ボス系が止まる前提)', () => {
  it('applyBossPostureDamage が bossFullStunUntil と stunUntil を同じ値で打つ', () => {
    // 城ボス/グレンは汎用tickの `stunUntil` ゲートで止まるので、**この同時発火が唯一の担保**。
    // 片方だけになったら城ボスが紫でも技を出し続ける=ここで落とす。
    const boss = {
      type: 'giantbat', maxHealth: 1000, bossPosture: 0.0001,
    } as unknown as Enemy;
    const r = applyBossPostureDamage(boss, 'counter', 1000);
    expect(r?.triggered, 'ポスチャー0で紫が発火すること').toBe(true);
    expect(r?.patch.bossFullStunUntil).toBeDefined();
    expect(r?.patch.stunUntil).toBe(r?.patch.bossFullStunUntil);
  });
});
