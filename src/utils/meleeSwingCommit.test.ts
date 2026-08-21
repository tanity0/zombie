// research/THOR_ISSEN_REWORK.md §1-3 の**規則**を機械化する:
// 「プレイヤーの近接スイングが確定する箇所**すべて**に専用の打刻(`commitMeleeSwing()`)を打つ」。
//
// なぜ件数を固定するのか(発注仕様の言葉のまま):
//   「行番号で列挙した4件は現時点の実例であって仕様ではない——将来ナイフ系の武器や新しい振り方が
//    増えたら、**そこにも打つのが規則**(打ち忘れは『新しい武器だけ必中一閃が出ない』という
//    **無音の穴**になる)」。
//
// ★v0.25.3784(検収監査 中4)で分かった穴: 旧テストは **`commitMeleeSwing()` の呼び出し口の件数**
// しか数えていなかった。だから「打刻を**書いていない**振り方」は原理的に検知できず、実際に
// `triggerKatanaDash`(刀/村雨のスワイプ一閃=プレイヤーの近接攻撃そのもの)が丸ごと抜けていても
// テストは緑のままだった(=刀装備だとスワイプ一閃だけ紫円の中で安全に振れた)。
//
// そこで検査を **「振り方を作る側」から**引き直す:
//   プレイヤーの近接の振り方は、必ず `counterWindowEnd` / `meleeSwingAt` / `katanaDashUntil` の
//   どれかを書く(カウンター窓を開く・スイング演出を出す・一閃ダッシュを始める)。
//   ⇒ **この3フィールドを書く場所を全部列挙し、1件ずつ「打刻するのか / しないなら理由」を宣言させる。**
//   新しい振り方を足すと必ずどれかを書くので、宣言が足りずにここが落ちる=人に問える。
import { describe, it, expect } from 'vitest';

// ソースは vite の ?raw で読む(このリポジトリは @types/node を入れていないので node:fs は使わない。
// ghostTelegraph.test.ts と同じ作法)。
const SOURCES = import.meta.glob<string>(
  ['../store/gameStore.ts'],
  { query: '?raw', import: 'default', eager: true },
);

/** 「振り方を作る側」の目印になるフィールド(どれかを書かずに近接の振りは作れない)。 */
const SWING_FIELDS = ['counterWindowEnd', 'meleeSwingAt', 'katanaDashUntil'] as const;
type SwingField = typeof SWING_FIELDS[number];

interface WriteSite {
  field: SwingField;
  /** どこ(何をしている set か)。 */
  where: string;
  /** その場所で `commitMeleeSwing()` を打つか。 */
  stamped: boolean;
  /** 打たないなら理由(必須)。 */
  why?: string;
}

/**
 * ★3フィールドを書いている場所の台帳(**ソース順**)。ここが「振り方の全部」で、
 * `stamped: true` の集合が打刻の集合。**打刻の集合 ⊆ 書く場所の集合** を宣言で固定する。
 */
const WRITE_SITES: readonly WriteSite[] = [
  { field: 'counterWindowEnd', where: 'プレイヤー初期状態(0)', stamped: false, why: '初期化=振っていない' },
  { field: 'meleeSwingAt', where: 'プレイヤー初期状態(0)', stamped: false, why: '初期化=振っていない' },
  {
    field: 'counterWindowEnd', where: '武器庫サークルでショップを開く', stamped: false,
    why: '§1-3が名指しで「打たない」と決めた経路(近接を振っていないのに窓だけ開く)',
  },
  { field: 'counterWindowEnd', where: '刀(katanaMode)の通常近接', stamped: true },
  { field: 'counterWindowEnd', where: '鞭(whipMode)の通常近接', stamped: true },
  {
    field: 'meleeSwingAt', where: 'ナイフ(通常近接スイープ)のスイング演出', stamped: false,
    why: '同じ set の counterWindowEnd 側で1回打刻する(1つの振りで2フィールド書くだけ)',
  },
  { field: 'counterWindowEnd', where: 'ナイフ(通常近接スイープ)', stamped: true },
  { field: 'katanaDashUntil', where: '刀/村雨のスワイプ一閃(triggerKatanaDash)', stamped: true },
  {
    field: 'counterWindowEnd', where: '被弾でカウンター窓を閉じる(damagePlayer)', stamped: false,
    why: '閉じる側=振っていない',
  },
  {
    field: 'counterWindowEnd', where: '四神舞のタップ/フリック(openCounterWindow)', stamped: false,
    why: '弾反射の構えであって近接スイングではない',
  },
  {
    field: 'meleeSwingAt', where: 'markMeleeSwingFx(カウンター成立の演出)', stamped: false,
    why: '§1-3「カウンター成立(青演出)では必中一閃を出さない」=別の打刻',
  },
  { field: 'counterWindowEnd', where: 'resetGame(0へ戻す)', stamped: false, why: 'リセット' },
  { field: 'meleeSwingAt', where: 'resetGame(0へ戻す)', stamped: false, why: 'リセット' },
];

/**
 * この3フィールドを**書かずに**打刻する経路(=振り方の目印を持たない近接)。
 * 現時点はスラッシャー追撃だけ(既存の近接ヒットから連鎖する追撃で、窓も演出も再度は開かない)。
 */
const STAMPS_WITHOUT_FIELD_WRITE = ['スラッシャー追撃(applySlasherChainStrike)'];

/** ソースから3フィールドの**書き込み**を出現順に拾う(読み取り・コメントは拾わない)。 */
const scanWrites = (text: string): SwingField[] => {
  const out: SwingField[] = [];
  for (const raw of text.split('\n')) {
    const t = raw.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;
    for (const f of SWING_FIELDS) {
      // `field:` (オブジェクトリテラル) / `field =` (代入) だけを書き込みとみなす。
      // `player.counterWindowEnd` のような読みは後ろに : / = が来ないので拾われない。
      const re = new RegExp(`\\b${f}\\s*[:=](?!=)`, 'g');
      const hits = t.match(re);
      if (hits) for (let i = 0; i < hits.length; i++) out.push(f);
    }
  }
  return out;
};

describe('近接スイング確定の打刻(commitMeleeSwing)を「振り方を作る側」から検査する', () => {
  const text = Object.values(SOURCES)[0] ?? '';

  it('gameStore.ts を読めている(走査そのものが壊れていない)', () => {
    expect(text.length).toBeGreaterThan(1000);
    expect(text).toContain('commitMeleeSwing');
  });

  it('★3フィールド(counterWindowEnd/meleeSwingAt/katanaDashUntil)を書く場所が1件残らず台帳に宣言されている', () => {
    const scanned = scanWrites(text);
    const declared = WRITE_SITES.map(s => s.field);
    expect(
      scanned,
      '近接の振り方は必ずこの3フィールドのどれかを書く。増減したら WRITE_SITES へ「その場所は打刻するのか/'
      + 'しないなら理由」を書き足すこと(新しい振り方に打刻を足し忘れる=無音の穴、の再発防止)。'
      + `\n走査=${scanned.join(',')}\n台帳=${declared.join(',')}`,
    ).toEqual(declared);
  });

  it('★台帳で stamped:true と宣言した件数 + フィールドを書かない経路 = 実際の呼び出し口の数', () => {
    const calls = text.match(/get\(\)\.commitMeleeSwing\(\)/g) ?? [];
    const stamped = WRITE_SITES.filter(s => s.stamped);
    expect(
      calls.length,
      `台帳の打刻: ${stamped.map(s => s.where).join(' / ')}`
      + ` + フィールドを書かない経路: ${STAMPS_WITHOUT_FIELD_WRITE.join(' / ')}`,
    ).toBe(stamped.length + STAMPS_WITHOUT_FIELD_WRITE.length);
  });

  it('打刻しないと宣言した場所には必ず理由が書かれている(黙って外さない)', () => {
    for (const s of WRITE_SITES) {
      if (s.stamped) continue;
      expect((s.why ?? '').length, `${s.where}(${s.field})に理由が無い`).toBeGreaterThan(3);
    }
  });

  it('★刀のスワイプ一閃(triggerKatanaDash)が打刻している(v0.25.3784の穴そのもの)', () => {
    // 型宣言(interface)ではなく**実装**を切り出す。
    const impl = text.indexOf('triggerKatanaDash: (dirX, dirY, ghostId) => {');
    expect(impl, 'triggerKatanaDash の実装が見つからない(走査が壊れている)').toBeGreaterThan(0);
    const dash = text.slice(impl);
    const body = dash.slice(0, dash.indexOf('\n  },'));
    expect(body).toContain('katanaDashUntil');
    expect(body, 'triggerKatanaDash はプレイヤーの近接攻撃そのもの=打刻が要る').toContain('commitMeleeSwing()');
  });

  it('打刻を書く実装は1本だけ(store のアクション定義=純関数 stampMeleeSwingCommit へ委譲)', () => {
    const defs = text.match(/commitMeleeSwing:\s*\(\)\s*=>\s*\{/g) ?? [];
    expect(defs.length).toBe(1);
    expect(text).toContain('stampMeleeSwingCommit(state.player, Date.now())');
  });

  it('★カウンター成立の演出(markMeleeSwingFx)と混ざっていない=別の打刻であることの証明', () => {
    // markMeleeSwingFx は meleeSwingAt(描画用)だけを書き、meleeSwingCommitAt は書かない。
    const fxDef = /markMeleeSwingFx:\s*\(\)\s*=>\s*\{\s*\n\s*set\(state => \(\{ player: \{ \.\.\.state\.player, meleeSwingAt: Date\.now\(\) \} \}\)\);/;
    expect(fxDef.test(text)).toBe(true);
  });
});
