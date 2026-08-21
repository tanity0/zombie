// research/THOR_ISSEN_REWORK.md §1(無の境地・必中一閃)と §8-4(ボット)の受け入れ条件を機械化する。
//
// ここで固めているのは「配線側の誤りだけがすり抜ける」を防ぐための不変条件:
//  ①紫円の半径が**1つの定数**から来ている(絵・引き金・ボットの3箇所で複製していない)
//  ②引き金は**近接スイング専用の打刻のエッジ**で見る(カウンター演出やショップでは立たない)
//  ③**時計を混ぜない**(絶対時刻の比較をしていない=打刻が進んだかどうかだけを見る)
//  ④必中フラグは**有無だけ**で判定する(時刻を比較しない=v0.25.3784の off-by-one の再発防止)
import { describe, it, expect } from 'vitest';
import {
  THOR_NIHIL_STATE, thorNihilRadius, stampMeleeSwingCommit, isInsideNihilCircle,
  meleeSwingCommitted, shouldTriggerGuaranteedIssen, isGuaranteedIssenNow, botHoldsMeleeForNihil,
} from './thorNihil';
import { HIDDEN_THOR_TUNING as HB_TH } from './hiddenBossScript';
import { botSkillProfile } from './botSkill';
import type { Enemy } from '../types/game';

const R = HB_TH.issen.nihilRadius;

// ★v0.25.3785(検収監査 中F): 配線側(useGameLoop.ts)をソース走査して不変条件を機械化する。
// ソースは vite の ?raw で読む(このリポジトリは @types/node を入れていないので node:fs は使わない。
// meleeSwingCommit.test.ts / ghostTelegraph.test.ts と同じ作法)。
const LOOP_SOURCES = import.meta.glob<string>(
  ['../hooks/useGameLoop.ts'],
  { query: '?raw', import: 'default', eager: true },
);

// 判定に使う最小限だけを持つ「敵」。botHoldsMeleeForNihil は Pick で受けるのでこれで足りる。
const thorAt = (x: number, y: number, bossState: string) =>
  ({ type: 'thor', bossState, x: x - 20, y: y - 20, width: 40, height: 40 }) as unknown as Enemy;

describe('州名と半径の出どころ(§1-1 受け入れ条件3)', () => {
  it('州名は issen-nihil(接尾辞 -windup を付けない=語尾ルールで「カウンター可」と誤答させない)', () => {
    expect(THOR_NIHIL_STATE).toBe('issen-nihil');
    expect(THOR_NIHIL_STATE.endsWith('-windup')).toBe(false);
    expect(THOR_NIHIL_STATE.endsWith('-recover')).toBe(false);
  });
  it('★紫円の半径は台帳の1定数(issen.nihilRadius)から来る=片方だけ動く実装ではない', () => {
    expect(thorNihilRadius()).toBe(HB_TH.issen.nihilRadius);
  });
  it('ボスメーカーで半径を動かすと、引き金の域もボットの「振らない」域も同時に動く(複製していない証明)', () => {
    const orig = HB_TH.issen.nihilRadius;
    try {
      HB_TH.issen.nihilRadius = 40;
      // 引き金側: 半径40の外(50px)では立たない
      expect(shouldTriggerGuaranteedIssen({
        bossState: THOR_NIHIL_STATE, bcx: 0, bcy: 0, pcx: 50, pcy: 0,
        prevCommitAt: 100, curCommitAt: 200, alreadyFired: false,
      })).toBe(false);
      // ボット側: 同じ50pxで「振らない」も解除される
      expect(botHoldsMeleeForNihil(botSkillProfile('master'), 50, 0, [thorAt(0, 0, THOR_NIHIL_STATE)])).toBe(false);
      HB_TH.issen.nihilRadius = 400;
      expect(shouldTriggerGuaranteedIssen({
        bossState: THOR_NIHIL_STATE, bcx: 0, bcy: 0, pcx: 50, pcy: 0,
        prevCommitAt: 100, curCommitAt: 200, alreadyFired: false,
      })).toBe(true);
      expect(botHoldsMeleeForNihil(botSkillProfile('master'), 50, 0, [thorAt(0, 0, THOR_NIHIL_STATE)])).toBe(true);
    } finally {
      HB_TH.issen.nihilRadius = orig;
    }
  });
});

describe('打刻(stampMeleeSwingCommit)とエッジ(§1-3「時計を混ぜない」)', () => {
  it('打刻は meleeSwingCommitAt だけを書き換える(他のフィールドは触らない)', () => {
    const p = { meleeSwingCommitAt: 0, meleeSwingAt: 111, counterWindowEnd: 222 };
    const n = stampMeleeSwingCommit(p, 999);
    expect(n).toEqual({ meleeSwingCommitAt: 999, meleeSwingAt: 111, counterWindowEnd: 222 });
    expect(p.meleeSwingCommitAt).toBe(0); // 元は破壊しない
  });
  it('エッジ=前フレームから進んだ時だけ真(絶対時刻の比較をしない)', () => {
    expect(meleeSwingCommitted(1_700_000_000_000, 1_700_000_000_016)).toBe(true);
    expect(meleeSwingCommitted(1_700_000_000_016, 1_700_000_000_016)).toBe(false); // 同じ振りを2度読まない
    expect(meleeSwingCommitted(1_700_000_000_016, 1_700_000_000_000)).toBe(false);
  });
  it('未スイング(0)は打刻とみなさない', () => {
    expect(meleeSwingCommitted(0, 0)).toBe(false);
  });
});

describe('必中一閃の引き金(§1-3 受け入れ条件1/2/7)', () => {
  const base = {
    bossState: THOR_NIHIL_STATE, bcx: 0, bcy: 0, pcx: R - 10, pcy: 0,
    prevCommitAt: 1000, curCommitAt: 1016, alreadyFired: false,
  };
  it('紫円の内側で振った、その tick で立つ', () => {
    expect(shouldTriggerGuaranteedIssen(base)).toBe(true);
  });
  it('紫円の外側で振っても立たない(300ms満了後に通常の赤予告へ進む)', () => {
    expect(shouldTriggerGuaranteedIssen({ ...base, pcx: R + 10 })).toBe(false);
  });
  it('円の境界ちょうどは内側(プレイヤーの中心で見る=自機半径は足さない)', () => {
    expect(shouldTriggerGuaranteedIssen({ ...base, pcx: R })).toBe(true);
    expect(isInsideNihilCircle(0, 0, R, 0, R)).toBe(true);
    expect(isInsideNihilCircle(0, 0, R + 0.1, 0, R)).toBe(false);
  });
  it('★振っていなければ立たない=カウンター成立(markMeleeSwingFx)や武器庫サークルでは発動しない', () => {
    // カウンター成立/ショップは meleeSwingCommitAt を**書かない**ので、打刻は前フレームのまま進まない。
    expect(shouldTriggerGuaranteedIssen({ ...base, curCommitAt: base.prevCommitAt })).toBe(false);
  });
  it('紫の州でなければ立たない(赤予告中に振っても必中にはならない=裁定1の後半)', () => {
    for (const st of ['issen-windup', 'issen-dash', 'issen-recover', 'tsuki-windup', 'chase', undefined]) {
      expect(shouldTriggerGuaranteedIssen({ ...base, bossState: st }), String(st)).toBe(false);
    }
  });
  it('1つの無の境地から発動できるのは1回(2重発火の防止)', () => {
    expect(shouldTriggerGuaranteedIssen({ ...base, alreadyFired: true })).toBe(false);
  });
});

describe('必中の「カウンターされない」窓(§1-3 受け入れ条件5/9/10)', () => {
  it('フラグが立っている間は真(★時刻を比較しない)', () => {
    expect(isGuaranteedIssenNow(2000)).toBe(true);
    expect(isGuaranteedIssenNow(1)).toBe(true);
  });
  it('通常の一閃(フラグ未設定/0)では閉じない=従来どおりカウンターできる', () => {
    expect(isGuaranteedIssenNow(undefined)).toBe(false);
    expect(isGuaranteedIssenNow(0)).toBe(false);
  });
  // ★v0.25.3784(検収監査 重大3)の再発防止。旧実装は `gameTime < issenGuaranteedUntil` の排他で、
  // フラグの値が `bossStateUntil` と同値だったため、**州の最終フレーム**(帯判定がまだ走る最後の1回)
  // だけ必中が切れていた。COUNTER_WINDOW(400ms) > dashMs(280ms) なので引き金の振りが開けた窓は
  // まだ開いており、「必中で被弾したうえに Counter! も出る」になっていた。
  it('★州の最終フレーム(gameTime が issen-dash の終了時刻に達したフレーム)でもカウンターされない', () => {
    const dashStart = 10_000;
    const dashMs = HB_TH.issen.dashMs;
    const flag = dashStart + dashMs;          // 実装が入れる値(= bossStateUntil と同値)
    const lastFrameGameTime = dashStart + dashMs; // 「州が終わる」と判定されるフレームの時刻
    // 旧実装(gameTime < flag)ならここが false=カウンターが通ってしまっていた。
    expect(lastFrameGameTime < flag).toBe(false);
    expect(isGuaranteedIssenNow(flag)).toBe(true);
  });
  it('★フラグを落とすのは「州を抜ける所」だけ=落とせば通常どおりカウンターできる', () => {
    expect(isGuaranteedIssenNow(0)).toBe(false);
  });
});

// =================================================================================================
// ★v0.25.3785(検収監査 中F): 「必中フラグの上限を外したので、落とし忘れたら**永久に必中**」を
// 支えているのは配線側の**1行**だけで、不変条件がどこにも無かった。
// `bossState = 'issen-dash'` の代入が1箇所増えた瞬間に「通常の一閃が永久にカウンター不能」という
// **無音の穴**が開く。そこで meleeSwingCommit.test.ts と同じ型——**代入箇所をソース走査して、
// 1件ずつ「フラグを書くのか / 書かないなら理由」を宣言させる**——で機械化する。
// =================================================================================================
interface DashSite {
  /** どこ(何をしている代入か)。 */
  where: string;
  /** その代入と同じブロックで `issenGuaranteedUntil` を書くか。 */
  writesFlag: boolean;
  /** 書かないなら理由(必須)。 */
  why?: string;
}
/** `bossState = 'issen-dash'` を書いている場所の台帳(**ソース順**)。 */
const ISSEN_DASH_SITES: readonly DashSite[] = [
  { where: '必中一閃(issen-nihil の紫円の中で近接を振った=引き金)', writesFlag: true },
  {
    where: '通常の一閃(issen-windup の赤500msが明けた)', writesFlag: false,
    why: '通常の一閃は必中ではない(§5-2 受け入れ条件3=従来どおりカウンターできる)。'
      + '直前の beginThorMove が 0 へ落としているので、書かない=立っていない が保証される',
  },
];
/** `issenGuaranteedUntil` を**書いている**場所の台帳(**ソース順**)。読み取りは含めない。 */
const FLAG_WRITE_SITES: readonly { where: string; raises: boolean }[] = [
  { where: 'frozen(罠のroot/紫の完全気絶/気絶/浮き/ワープ)で issen-dash から chase へ落ちる', raises: false },
  { where: 'beginThorMove(一閃の開始=前の一閃のフラグが残っていたら落とす)', raises: false },
  { where: '必中一閃の発動(★唯一フラグを立てる場所)', raises: true },
  { where: '通常の一閃がカウンターで中断された', raises: false },
  { where: 'issen-dash が最後まで走り切った(硬直/chaseへ抜ける)', raises: false },
];

/** コメント行を除いた本文だけを返す(宣言の走査でコメントの言及を数えないため)。 */
const codeLines = (text: string): string[] =>
  text.split('\n').filter(l => {
    const t = l.trim();
    return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
  });

/**
 * `startRe` に当たった行の**次の行**から、`endRe` に当たる行の**手前**までを返す(=ブロックの中身)。
 * 「同じブロックの中に◯◯が書かれているか」を見るための最小限のスライサ
 * (n行窓だと隣のブロックを拾う/ブロックが伸びると窓から落ちる、の両方を避ける)。
 */
const blockAfter = (lines: string[], startRe: RegExp, endRe: RegExp): string[] => {
  const i = lines.findIndex(l => startRe.test(l));
  if (i < 0) return [];
  const rel = lines.slice(i + 1).findIndex(l => endRe.test(l));
  return rel < 0 ? [] : lines.slice(i + 1, i + 1 + rel);
};

describe('★必中フラグ(issenGuaranteedUntil)の配線の不変条件(§5-2 やること②)', () => {
  const text = Object.values(LOOP_SOURCES)[0] ?? '';
  const lines = codeLines(text);

  it('useGameLoop.ts を読めている(走査そのものが壊れていない)', () => {
    expect(text.length).toBeGreaterThan(1000);
    expect(text).toContain('issenGuaranteedUntil');
  });

  it("★`bossState = 'issen-dash'` の代入が1件残らず台帳に宣言されている(1箇所増えたらここで落ちる)", () => {
    const sites: string[][] = [];
    lines.forEach((l, i) => {
      // 窓は**同じ代入ブロック**を見る幅だけ(コメント除去後の8行)。広げると隣の州のハンドラを拾う。
      if (/bossState\s*=\s*'issen-dash'/.test(l)) sites.push(lines.slice(i, i + 8));
    });
    expect(
      sites.length,
      '一閃のダッシュへ入る経路が増減した。ISSEN_DASH_SITES へ「その経路はフラグを立てるのか/'
      + '立てないなら理由」を書き足すこと(落とし忘れ=通常の一閃が永久にカウンター不能、の再発防止)。',
    ).toBe(ISSEN_DASH_SITES.length);
    sites.forEach((block, i) => {
      const site = ISSEN_DASH_SITES[i];
      expect(
        block.some(l => /issenGuaranteedUntil\s*=(?!=)/.test(l)), // 読み取り(isGuaranteedIssenNow)は数えない
        `${site.where}: 宣言=${site.writesFlag ? '書く' : '書かない'} と実装が食い違っている`,
      ).toBe(site.writesFlag);
    });
  });

  it('★フラグを書く場所も1件残らず宣言されている(落とす経路を消したらここで落ちる)', () => {
    const writes = lines.filter(l => /issenGuaranteedUntil\s*=(?!=)/.test(l));
    expect(
      writes.length,
      'issenGuaranteedUntil の書き込み箇所が増減した。FLAG_WRITE_SITES を更新すること。'
      + `\n走査=\n${writes.map(w => w.trim()).join('\n')}`,
    ).toBe(FLAG_WRITE_SITES.length);
    writes.forEach((w, i) => {
      const site = FLAG_WRITE_SITES[i];
      // 立てるのは1箇所だけ。他は必ず `= 0`(落とす)。
      expect(/=\s*0\s*;/.test(w), `${site.where}`).toBe(!site.raises);
    });
    expect(FLAG_WRITE_SITES.filter(s => s.raises).length, 'フラグを立てる場所は1箇所だけ').toBe(1);
  });

  it('★立てないと宣言した経路には理由が書かれている(黙って外さない)', () => {
    for (const s of ISSEN_DASH_SITES) {
      if (s.writesFlag) continue;
      expect((s.why ?? '').length, `${s.where} に理由が無い`).toBeGreaterThan(3);
    }
  });

  it('★frozen で issen-dash から抜けた時もフラグを落とす(ハンドラが二度と走らない経路)', () => {
    expect(text).toContain("if (frozenSt === 'issen-dash') patch.issenGuaranteedUntil = 0;");
  });
});

// ★v0.25.3785(検収監査 中E): 突進の専用CD(thorDashReadyAt)は「突進が潰れた」**全経路**で立てる。
// カウンター(thorCounterHit)と硬直明けだけでは、frozen(罠のroot/紫の完全気絶/気絶+ノックバック/
// ワープ)で潰された時に打刻が漏れ、**トラップ等で潰し続けると連発できた**。
describe('★突進の専用CD(thorDashReadyAt)を打刻する経路(§4)', () => {
  const text = Object.values(LOOP_SOURCES)[0] ?? '';
  const lines = codeLines(text);

  it('打刻は4経路(カウンター一括/硬直明け/?thorscript=0のchase復帰/★frozen中断)', () => {
    const stamps = lines.filter(l => /thorDashReadyAt\s*=(?!=)/.test(l));
    expect(
      stamps.length,
      '突進のCD打刻の箇所が増減した。潰れる経路を増やしたら打刻も足すこと(連発の再発防止)。'
      + `\n走査=\n${stamps.map(s => s.trim()).join('\n')}`,
    ).toBe(4);
    for (const s of stamps) expect(s, s.trim()).toContain('HB_TH.dash.cdMs');
  });

  it('★frozen で突進が中断された時も打刻する(3州すべて)', () => {
    expect(text).toContain(
      "if (frozenSt === 'thor-dash-windup' || frozenSt === 'thor-dash-move' || frozenSt === 'thor-dash-recover')",
    );
  });
});

// =================================================================================================
// ★v0.25.3794(検収監査5巡目 重大1): **実機から消えた挙動そのもの**を固定する。
// v0.25.3785 重大D=「`thorDashCounterHit` が `aiFrom` だけを差し替えていたので、counter-leap の
// **到達点が弾き返しの有無で1pxも変わらなかった**(=150pxの弾き返しが1pxも効いていなかった)」。
// 直したのに**リポジトリ全体で1本も固めていなかった**ので、同じ形へ戻っても全テストが緑になる。
// あわせて、共通カウンターブロックから突進専用層へ**振り分ける配線**(2経路)も固める
// (CLAUDE.md 実装精度の規律4「テストされていたのは純関数だけで、配線側の誤りは全部すり抜けた」)。
// =================================================================================================
describe('★突進のカウンター(弾き返し)の配線の不変条件(§5-2 ★弾き返しの効かせ方/やること③)', () => {
  const text = Object.values(LOOP_SOURCES)[0] ?? '';
  const lines = codeLines(text);

  it('★弾き返しは**到達点**(patch.aiTargetX/Y)へ書く=`aiFrom` だけを書く形に戻したらここで落ちる', () => {
    const body = blockAfter(lines, /const thorDashCounterHit = \(/, /^\s*\};\s*$/);
    expect(body.length, 'thorDashCounterHit の本体を走査できていない(走査そのものが壊れた)')
      .toBeGreaterThan(3);
    // トールは全技共通の反応(counter-leap=aiFrom→aiTarget の補間)を積むので、**到達点**を
    // 差し替えないと弾き返しは1pxも効かない(起点だけ動かしても終点が同じなら同じ場所へ着く)。
    expect(
      body.some(l => /patch\.aiTargetX\s*=(?!=)/.test(l)),
      '弾き返しの到達点(patch.aiTargetX)を書いていない=150pxが効かない(v0.25.3785 重大Dの再発)',
    ).toBe(true);
    expect(
      body.some(l => /patch\.aiTargetY\s*=(?!=)/.test(l)),
      '弾き返しの到達点(patch.aiTargetY)を書いていない=150pxが効かない(v0.25.3785 重大Dの再発)',
    ).toBe(true);
    // 弾き返し量は既存の合流点(ミゲル/ウリと共有)から引く=新しい定数を作らない。
    expect(
      body.some(l => /dashCounterPushbackPx/.test(l)),
      '弾き返し量が既存の dashCounterPushbackPx から来ていない',
    ).toBe(true);
  });

  it("★`st === 'thor-dash-move'` を突進専用層へ振り分ける行が**2本**ある(プレイヤー経路・守護霊経路)", () => {
    const branches = lines.filter(l => /st === 'thor-dash-move'/.test(l) && /thorDashCounterHit\(/.test(l));
    expect(
      branches.length,
      '走行中の突進を thorDashCounterHit へ振り分ける行が増減した。共通カウンターブロックには'
      + '**プレイヤー経路と守護霊(ゴースト)経路の2本**があり、片方だけ thorCounterHit のままだと'
      + 'その経路でだけ弾き返し(§4-1 受け入れ条件3)が消える。'
      + `\n走査=\n${branches.map(b => b.trim()).join('\n')}`,
    ).toBe(2);
    // 守護霊経路だけが GhostCounterFire(gFire)を渡す=2本が別経路であることの証明。
    expect(branches.filter(l => /gFire/.test(l)).length, '守護霊経路(gFire を渡す方)が1本ではない').toBe(1);
    expect(branches.filter(l => !/gFire/.test(l)).length, 'プレイヤー経路が1本ではない').toBe(1);
  });
});

// =================================================================================================
// ★v0.25.3794(検収監査5巡目 重大2): v0.25.3793 の唯一のコード変更(中3=ノックバック凍結中に
// `aiStartedAt` も繰り下げる)に回帰テストが無かった。この1行が消えても全テストが緑=**解除の瞬間に
// イージング曲線上を凍結時間ぶんワープする**(慣性MUST違反)が黙って復活する。
// =================================================================================================
describe('★ノックバック"だけ"で止まっている間の時計の繰り下げ(§5-2 周辺・慣性MUST)', () => {
  const text = Object.values(LOOP_SOURCES)[0] ?? '';
  const lines = codeLines(text);

  it('★kbOnlyStop の枝で `aiStartedAt` も同じ kbDtMs だけ繰り下げる(突進の位置補間の基準)', () => {
    const body = blockAfter(lines, /if \(kbOnlyStop\) \{/, /^\s*\} else \{\s*$/);
    expect(body.length, 'kbOnlyStop の枝を走査できていない(走査そのものが壊れた)').toBeGreaterThan(1);
    expect(
      body.some(l => /patch\.aiStartedAt\s*=(?!=)/.test(l) && /kbDtMs/.test(l)),
      'kbOnlyStop の枝で aiStartedAt を繰り下げていない。トールの突進(thor-dash-move)だけが位置の'
      + '補間を aiStartedAt 基準で回しているので、bossStateUntil / bossNextActionAt だけを繰り下げると'
      + '**解除の瞬間にイージング曲線上を凍結時間ぶんワープ**する(慣性MUST違反=v0.25.3793 中3の再発)。',
    ).toBe(true);
    // 凍結中に進んではいけない時計は3本セット。1本でも欠けると「解除の瞬間に何かが飛ぶ」。
    for (const f of ['bossStateUntil', 'bossNextActionAt', 'aiStartedAt']) {
      expect(
        body.some(l => new RegExp(`patch\\.${f}\\s*=(?!=)`).test(l) && /kbDtMs/.test(l)),
        `${f} が kbDtMs ぶん繰り下げられていない`,
      ).toBe(true);
    }
  });
});

describe('ボット(§8-4 受け入れ条件1/2/3/4)', () => {
  const nihilThor = [thorAt(0, 0, THOR_NIHIL_STATE)];
  it('master / skilled は紫円の内側で近接を振らない', () => {
    for (const s of ['master', 'skilled'] as const) {
      expect(botHoldsMeleeForNihil(botSkillProfile(s), R - 10, 0, nihilThor), s).toBe(true);
    }
  });
  it('novice / casual の挙動は1つも変わらない(常に振る=完全なno-op)', () => {
    for (const s of ['novice', 'casual'] as const) {
      expect(botHoldsMeleeForNihil(botSkillProfile(s), R - 10, 0, nihilThor), s).toBe(false);
    }
  });
  it('円の外へ出た/紫が明けた後は従来どおり振る', () => {
    expect(botHoldsMeleeForNihil(botSkillProfile('master'), R + 10, 0, nihilThor)).toBe(false);
    expect(botHoldsMeleeForNihil(botSkillProfile('master'), R - 10, 0, [thorAt(0, 0, 'issen-windup')])).toBe(false);
    expect(botHoldsMeleeForNihil(botSkillProfile('master'), R - 10, 0, [])).toBe(false);
  });
  it('トール以外のボスが同じ位置に居ても止めない(type でゲートしている)', () => {
    const notThor = [{ ...thorAt(0, 0, THOR_NIHIL_STATE), type: 'mimir' } as unknown as Enemy];
    expect(botHoldsMeleeForNihil(botSkillProfile('master'), R - 10, 0, notThor)).toBe(false);
  });
  it('ダイヤルの段の単調性(上位ほど≧)を壊していない', () => {
    const v = (s: 'novice' | 'casual' | 'skilled' | 'master') =>
      (botSkillProfile(s).respectsNihilCircle ? 1 : 0);
    expect(v('novice')).toBeLessThanOrEqual(v('casual'));
    expect(v('casual')).toBeLessThanOrEqual(v('skilled'));
    expect(v('skilled')).toBeLessThanOrEqual(v('master'));
  });
});
