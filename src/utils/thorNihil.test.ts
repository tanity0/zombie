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
// ★v0.25.3806: 弾き返しの行き先は純関数へ切り出した(値をここで固定する)。
// ★v0.25.3808: **束縛(Enemy/Player から引数を組む所)まで**純関数へ入れた(重大2)。
// ★v0.25.3809: 共通層の**分岐そのもの**(counterLeapOrigin/counterLeapTarget)と
// **帯の文脈の組み立て**(thorPlayableAreaCtx)まで純関数へ出した(8巡目 重大1/3・低9)。
import {
  thorDashPushbackTarget, thorDashPushbackFromEnemy,
  counterLeapOrigin, counterLeapTarget, thorPlayableAreaCtx,
} from './thorDashPushback';
import { HIDDEN_THOR_TUNING as HB_TH } from './hiddenBossScript';
import { LAB_CORRIDOR_Y_LIMIT_PX as LAB_Y } from '../world/labWalls';
import { CORRIDOR_BOTTOM_LIMIT } from '../world/playableArea';
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

/**
 * `startRe` に当たった行から、**対応する閉じ括弧の行の手前**までを返す(括弧の深さで数える)。
 *
 * ★v0.25.3808(検収監査7巡目 低11): `blockAfter` の終端は「最初に `};` に**見える**行」だったので、
 * 本体の途中にオブジェクトの閉じを1つ作るだけでブロックが縮み、**以降の禁止検査(「ここには
 * 書かない」の類)がブロックの外へ落ちて見えなくなる**=禁じた書き方をその下に足せば緑を通った。
 * 深さで数えれば、余分な `}` を足すことは**コンパイルが通らない**ので同じ細工ができない。
 * ※対象は `codeLines` 済み(コメント行を除いた)本文で、括弧を含む文字列リテラルは
 *   走査対象の関数に無い(在れば `expect` 側の本数が合わなくなって気づく)。
 */
const braceBlockAfter = (lines: string[], startRe: RegExp): string[] => {
  const i = lines.findIndex(l => startRe.test(l));
  if (i < 0) return [];
  const depthOf = (l: string) => (l.match(/\{/g)?.length ?? 0) - (l.match(/\}/g)?.length ?? 0);
  // 宣言が複数行(引数リストや型注釈で改行する)場合があるので、**最初に深さが1以上になった行**を
  // 本体の開き括弧とみなし、そこから深さが0へ戻るまでを本体とする。
  let depth = 0, bodyStart = -1;
  for (let j = i; j < lines.length; j++) {
    depth += depthOf(lines[j]);
    if (bodyStart < 0) { if (depth > 0) bodyStart = j + 1; continue; }
    if (depth <= 0) return lines.slice(bodyStart, j);
  }
  return [];
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
// ★v0.25.3806(検収監査6巡目 重大1): **弾き返しが出す値そのもの**を固定する。
//
// 前巡まで、この節はソース走査(=その字面が在るか)しか持っていなかった。監査が実測したところ、
// **①弾き返し量のゼロ化(`* 0`) ②符号反転(前へ引き寄せる) ③`aiFrom` を弾き返し位置へ書いて
// 150pxテレポート ④内側の `thorCounterHit(...)` を丸ごと削除(Counter!演出・クリ反撃・
// counter-leap・専用CDが全部消える)** の4変異が**すべて緑を通った**。
// ①②は字面が残るので走査では原理的に取れない ⇒ **行き先計算を純関数
// (`thorDashPushbackTarget`)へ切り出し、方向・距離・クランプ結果を値でアサートする**
// (CLAUDE.md 実装精度の規律4)。③④は走査へ**禁止(aiFrom)と必須(内側の呼び出し)**を足して落とす。
// =================================================================================================
/** トールの戦場(ステージ5)= 帯クランプがどれも当たらない**store の状態**(§9-8 の事実メモ)。 */
const OPEN_STATE = {
  farBackdrop: 'field', stageTheme: 'forest', corridorMode: false, corridorRunInActive: false,
};
/** 同じものを `PlayableAreaCtx` として見た形(下段の純関数=`thorDashPushbackTarget` は ctx を受ける)。 */
const OPEN_AREA = thorPlayableAreaCtx(OPEN_STATE);
const PUSH = 150; // = ANGEL_COMMON_TUNING.dashCounterPushbackPx(値の出どころは配線側のテストで固定)

// =================================================================================================
// ★v0.25.3809(検収監査8巡目 低9): 「行ける帯」の文脈の**組み立て**も純関数へ引き取った。
// 前巡は配線側で4フィールドを1つずつ書いており、走査が見ていたのは `labTheme:` の1行だけだったので、
// **残り3つを定数へ差し替える**変異が緑を通った(監査が実測)。トールの戦場では実質 no-op なので
// 実機影響は出ないが、同じ純関数が他ボスへ横展開された瞬間に効く。
// =================================================================================================
describe('★「行ける帯」の文脈の組み立て(thorPlayableAreaCtx)= 4フィールドが全部 state から来る', () => {
  it('★4フィールドすべてが state から流れる(1つでも定数に差し替えると値が変わる)', () => {
    const ctx = thorPlayableAreaCtx({
      farBackdrop: 'city', stageTheme: 'lab', corridorMode: true, corridorRunInActive: true,
    });
    expect(ctx.farBackdrop, 'farBackdrop を state から取っていない').toBe('city');
    expect(ctx.labTheme, "labTheme が stageTheme === 'lab' から来ていない").toBe(true);
    expect(ctx.corridorMode, 'corridorMode を state から取っていない').toBe(true);
    expect(ctx.corridorRunInActive, 'corridorRunInActive を state から取っていない').toBe(true);
  });
  it('★偽装した状態と本物の状態が同じ ctx にならない(=どのフィールドも飾りではない)', () => {
    const real = { farBackdrop: 'city', stageTheme: 'lab', corridorMode: true, corridorRunInActive: true };
    for (const faked of [
      { ...real, farBackdrop: 'field' }, { ...real, stageTheme: 'forest' },
      { ...real, corridorMode: false }, { ...real, corridorRunInActive: false },
    ]) {
      expect(thorPlayableAreaCtx(faked)).not.toEqual(thorPlayableAreaCtx(real));
    }
  });
  it('m0AdvanceLimitX は null 固定(M0の透明壁は裏ボス戦に存在しない=旧配線と同値)', () => {
    expect(thorPlayableAreaCtx(OPEN_STATE).m0AdvanceLimitX).toBe(null);
    expect(OPEN_AREA.labTheme).toBe(false);
  });
});

// =================================================================================================
// ★v0.25.3809(検収監査8巡目 重大1/3): **共通層の分岐そのもの**を純関数へ出した。
//
// 前巡は共通層(`thorCounterHit`)に
//   `patch.aiTargetX = opts?.aimAt ? opts.aimAt.x : 既定式`
// と三項で書いてあり、走査が見られるのは「`opts?.aimAt` という字面が在るか」までだった。
// ⇒ **三項の両側を既定式にする**(=渡された行き先を読むフリだけして捨てる)変異が緑を通った
//    = **150pxの弾き返しが消え、ボスは常に後退ジャンプの既定位置へ着地する**(監査が実測)。
// `aiFrom` 側は輪をかけて弱く、共通層が書いた後に**呼び出し側が上書きする順序契約**の上に
// 立っていたので、**代入を呼び出しの前へ移すだけで全緑**だった。
// ⇒ 分岐を両方ここへ出し、**渡した座標がそのまま返ることを値でアサート**する(字面ガードは不要になる)。
// =================================================================================================
describe('★counter-leap の起点/到達点(counterLeapOrigin / counterLeapTarget)= 引数がそのまま出る', () => {
  it('★aimAt を渡したら**その座標がそのまま**返る(三項の両側を既定式にする細工はここで落ちる)', () => {
    // 既定式が返すはずの値とは**別の点**を渡す=「読むフリだけして捨てた」時に必ず食い違う。
    const got = counterLeapTarget({ x: 350, y: -25 }, 500, 0, 400, 0, 216);
    expect(got).toEqual({ x: 350, y: -25 });
    const def = counterLeapTarget(undefined, 500, 0, 400, 0, 216);
    expect(def, '既定式と渡した座標が同じ=このアサートが効いていない').not.toEqual(got);
  });
  it('aimAt が無い時の既定=プレイヤーから見てボスが居る向きへ distPx(後退ジャンプ・旧実装と同値)', () => {
    expect(counterLeapTarget(undefined, 500, 0, 400, 0, 216)).toEqual({ x: 500 - 216, y: 0 });
    expect(counterLeapTarget(undefined, 0, 0, 300, 400, 100).x).toBeCloseTo(60, 9);
    expect(counterLeapTarget(undefined, 0, 0, 300, 400, 100).y).toBeCloseTo(80, 9);
    // 重なっている(方向が作れない)時は0除算しない=プレイヤー中心そのもの(旧実装と同値)。
    expect(counterLeapTarget(undefined, 7, 9, 7, 9, 216)).toEqual({ x: 7, y: 9 });
  });
  it('★fromAt を渡したら**その座標がそのまま**返る(順序契約の代わり=斬り抜け経路の起点)', () => {
    const got = counterLeapOrigin({ x: 1234, y: -56 }, 400, 0);
    expect(got).toEqual({ x: 1234, y: -56 });
    expect(counterLeapOrigin(undefined, 400, 0), '既定と渡した座標が同じ').not.toEqual(got);
  });
  it('fromAt が無い時の既定=フレーム頭のボス中心(=テレポートしない・慣性MUST)', () => {
    expect(counterLeapOrigin(undefined, 400, 33)).toEqual({ x: 400, y: 33 });
  });
  it('★到達点の距離は distPx がそのまま効く(ゼロ化・係数掛けはここで落ちる)', () => {
    expect(counterLeapTarget(undefined, 500, 0, 400, 0, 0)).toEqual({ x: 500, y: 0 });
    expect(counterLeapTarget(undefined, 500, 0, 400, 0, 432)).toEqual({ x: 68, y: 0 });
  });
});

describe('★弾き返しの行き先(純関数 thorDashPushbackTarget)= §4-1 受け入れ条件3の値', () => {
  it('★プレイヤー中心から**来た方向へ** pushbackPx ぶん退けた点を返す(ゼロ化も符号反転もここで落ちる)', () => {
    // 突進は左(x=0)から右(x=100)へ走ってきた。プレイヤーは x=500 に居る。
    // ⇒ ボスは「来た方向」= 左へ 150px 退く = x=350。
    const r = thorDashPushbackTarget({
      fromX: 0, fromY: 0, toX: 100, toY: 0, pcx: 500, pcy: 0,
      pushbackPx: PUSH, bossW: 140, bossH: 140, area: OPEN_AREA,
    });
    expect(r.x, '弾き返し量がゼロ化されている/向きが逆(前へ引き寄せている)').toBe(500 - PUSH);
    expect(r.y).toBe(0);
    // 逆向き(右→左に走ってきた)なら、退く先も逆になる。
    const rev = thorDashPushbackTarget({
      fromX: 100, fromY: 0, toX: 0, toY: 0, pcx: 500, pcy: 0,
      pushbackPx: PUSH, bossW: 140, bossH: 140, area: OPEN_AREA,
    });
    expect(rev.x).toBe(500 + PUSH);
  });

  it('★退く距離は**厳密に** pushbackPx(斜めでも短くならない=正規化している証明)', () => {
    const r = thorDashPushbackTarget({
      fromX: 0, fromY: 0, toX: 300, toY: 400, pcx: 1000, pcy: 1000, // 進行方向 (0.6, 0.8)
      pushbackPx: PUSH, bossW: 140, bossH: 140, area: OPEN_AREA,
    });
    expect(Math.hypot(r.x - 1000, r.y - 1000)).toBeCloseTo(PUSH, 9);
    expect(r.x).toBeCloseTo(1000 - 0.6 * PUSH, 9);
    expect(r.y).toBeCloseTo(1000 - 0.8 * PUSH, 9);
  });

  it('★弾き返し量を変えると行き先も同じだけ動く(定数が飾りになっていない)', () => {
    const at = (push: number) => thorDashPushbackTarget({
      fromX: 0, fromY: 0, toX: 100, toY: 0, pcx: 500, pcy: 0,
      pushbackPx: push, bossW: 140, bossH: 140, area: OPEN_AREA,
    }).x;
    expect(at(0)).toBe(500);       // 0を渡した時だけプレイヤー中心と同じになる
    expect(at(300)).toBe(200);
    expect(at(PUSH) - at(0)).toBe(-PUSH);
  });

  it('起点と到達点が同じ(方向が作れない)時はプレイヤー中心を返す(0除算しない・旧実装と同値)', () => {
    const r = thorDashPushbackTarget({
      fromX: 42, fromY: 42, toX: 42, toY: 42, pcx: 500, pcy: 300,
      pushbackPx: PUSH, bossW: 140, bossH: 140, area: OPEN_AREA,
    });
    expect(r).toEqual({ x: 500, y: 300 });
  });

  it('★行き先は「行ける帯」(clampRectToPlayableArea)を通っている=帯の外を返さない', () => {
    // 研究所(lab)は上下が LAB_CORRIDOR_Y_LIMIT_PX に固定される帯。矩形の下端まで帯の内側へ
    // 収める計算(clampRectToPlayableArea)なので、帯の外へ弾き返そうとすると**中心が ±LAB_Y で止まる**。
    const bossH = 140;
    const outside = thorDashPushbackTarget({
      fromX: 0, fromY: 5000, toX: 0, toY: 0, pcx: 0, pcy: LAB_Y + 400, // 上へ走ってきた=下へ弾く
      pushbackPx: PUSH, bossW: 140, bossH, area: { ...OPEN_AREA, labTheme: true },
    });
    // 矩形の下端まで帯の内側へ収まる=中心は ±LAB_CORRIDOR_Y_LIMIT_PX ちょうどで止まる。
    expect(outside.y, '帯クランプを通していない(生の座標をそのまま返している)').toBe(LAB_Y);
    // 帯の内側で完結する場合はクランプが効かない(=無条件に潰していない)ことも見る。
    const inside = thorDashPushbackTarget({
      fromX: 0, fromY: 100, toX: 0, toY: 0, pcx: 0, pcy: 0,
      pushbackPx: 10, bossW: 140, bossH, area: { ...OPEN_AREA, labTheme: true },
    });
    expect(inside.y).toBe(10);
  });
});

// =================================================================================================
// ★v0.25.3808(検収監査7巡目 重大2): **束縛**の値を固定する。
// 前巡は「純関数の内側」だけを値で固めていたので、**そこへ何を束縛するか**は無検査だった:
//  ①`fromX/fromY` と `toX/toY` を入れ替える ⇒ 進行方向が逆 ⇒ ボスがプレイヤーの**向こう側へ150px前進**
//  ②`bossW/bossH` に 0 を渡す ⇒ 帯クランプが点で効く(巨体が帯からはみ出る)
//  ③帯の文脈を偽装する(`labTheme: false` を素通し等)⇒ クランプが飾りになる
// のどれも**全緑**を通った。よって `Enemy`/`Player` から引数を組む所を
// `thorDashPushbackFromEnemy` へ引き取り、**ここで値としてアサートする**。
// =================================================================================================
describe('★弾き返しの束縛(thorDashPushbackFromEnemy)= Enemy/Player から引数を組む所も値で固める', () => {
  /** 中心 (bcx,bcy)・寸法 w×h・突進 from→to を持つボス。 */
  const bossAt = (bcx: number, bcy: number, w: number, h: number,
    dash?: { fromX: number; fromY: number; toX: number; toY: number }) => ({
    x: bcx - w / 2, y: bcy - h / 2, width: w, height: h,
    aiFromX: dash?.fromX, aiFromY: dash?.fromY, aiTargetX: dash?.toX, aiTargetY: dash?.toY,
  });
  /** 中心 (pcx,pcy)・寸法 w×h のプレイヤー。 */
  const playerAt = (pcx: number, pcy: number, w = 32, h = 48) =>
    ({ x: pcx - w / 2, y: pcy - h / 2, width: w, height: h });

  it('★進行方向は from→to(入れ替えるとプレイヤーの向こう側へ前進する=ここで落ちる)', () => {
    // 左(x=0)から右(x=100)へ走ってきた。プレイヤーは x=500。⇒ 来た方向=左へ150px = x=350。
    const r = thorDashPushbackFromEnemy(
      bossAt(400, 0, 140, 140, { fromX: 0, fromY: 0, toX: 100, toY: 0 }),
      playerAt(500, 0), OPEN_STATE, PUSH,
    );
    expect(r.x, 'from/to を入れ替えている(=プレイヤーの向こう側へ前進する)').toBe(500 - PUSH);
    expect(r.y).toBe(0);
    // 実際に入れ替えた時の値=「間違いの側」も名指しで固定しておく(取り違えが同じ値にならない証明)。
    expect(500 + PUSH).not.toBe(500 - PUSH);
  });

  it('★弾き返しの基準はプレイヤーの**中心**(左上を渡すと半身ぶんズレる=ここで落ちる)', () => {
    const pw = 32, ph = 48;
    const r = thorDashPushbackFromEnemy(
      bossAt(400, 700, 140, 140, { fromX: 0, fromY: 0, toX: 100, toY: 0 }),
      playerAt(500, 700, pw, ph), OPEN_STATE, PUSH,
    );
    expect(r.x).toBe(500 - PUSH);
    expect(r.y, 'プレイヤーの左上(y=700-ph/2)を基準にしている').toBe(700);
  });

  it('★矩形の寸法はボスの当たり判定(0を渡すと結果が変わる=ここで落ちる)', () => {
    // 寸法が結果に効く帯を選ぶ: 洋館通路(corridorMode)の下限 `CORRIDOR_BOTTOM_LIMIT` は
    // **矩形の上端(top-left y)**へ効くので、中心は `下限 + 高さ/2` で止まる=高さが値に出る。
    // (研究所の上下クランプは中心基準なので高さが消える=寸法ゼロの細工を検出できない。)
    const h = 140;
    const CORRIDOR_STATE = { ...OPEN_STATE, corridorMode: true };
    const r = thorDashPushbackFromEnemy(
      bossAt(0, 900, 140, h, { fromX: 0, fromY: 5000, toX: 0, toY: 0 }), // 上へ走ってきた=下へ弾く
      playerAt(0, 800), CORRIDOR_STATE, PUSH,
    );
    expect(r.y, 'ボスの寸法(height)を渡していない').toBe(CORRIDOR_BOTTOM_LIMIT + h / 2);
    // 寸法ゼロの「間違いの側」と同じ値にならないこと(=このアサートが効いている証明)。
    const zeroSized = thorDashPushbackTarget({
      fromX: 0, fromY: 5000, toX: 0, toY: 0, pcx: 0, pcy: 800,
      pushbackPx: PUSH, bossW: 0, bossH: 0, area: thorPlayableAreaCtx(CORRIDOR_STATE),
    });
    expect(zeroSized.y).toBe(CORRIDOR_BOTTOM_LIMIT);
    expect(zeroSized.y).not.toBe(r.y);
  });

  it('★帯の文脈はそのまま通す(偽装すると帯の外を返す=ここで落ちる)', () => {
    const args = [
      bossAt(0, LAB_Y + 800, 140, 140, { fromX: 0, fromY: 5000, toX: 0, toY: 0 }),
      playerAt(0, LAB_Y + 400),
    ] as const;
    const inLab = thorDashPushbackFromEnemy(args[0], args[1], { ...OPEN_STATE, stageTheme: 'lab' }, PUSH);
    const faked = thorDashPushbackFromEnemy(args[0], args[1], OPEN_STATE, PUSH);
    expect(inLab.y).toBe(LAB_Y);
    expect(faked.y, '帯の文脈が結果に効いていない(=クランプが飾りになっている)').not.toBe(inLab.y);
  });

  it('突進の起点/到達点が無い時はボスの現在中心で埋める(方向が作れない=プレイヤー中心を返す)', () => {
    const r = thorDashPushbackFromEnemy(bossAt(123, 456, 140, 140), playerAt(500, 300), OPEN_STATE, PUSH);
    expect(r).toEqual({ x: 500, y: 300 });
  });

  it('★弾き返し量はそのまま効く(ゼロ化するとプレイヤー中心に戻る)', () => {
    const b = bossAt(400, 0, 140, 140, { fromX: 0, fromY: 0, toX: 100, toY: 0 });
    expect(thorDashPushbackFromEnemy(b, playerAt(500, 0), OPEN_STATE, 0).x).toBe(500);
    expect(thorDashPushbackFromEnemy(b, playerAt(500, 0), OPEN_STATE, 300).x).toBe(200);
  });
});

// =================================================================================================
// ★v0.25.3798(検収監査5巡目 重大1)+ v0.25.3806(6巡目 重大1): 配線側の固定。
// v0.25.3785 重大D=「`thorDashCounterHit` が `aiFrom` だけを差し替えていたので、counter-leap の
// **到達点が弾き返しの有無で1pxも変わらなかった**(=150pxの弾き返しが1pxも効いていなかった)」。
// ここで見るのは**値ではなく配線**(どこへ書くか/何を呼ぶか/何を書かないか)だけ。
// 値の不変条件は上の純関数の describe が持つ(役割を混ぜない)。
// =================================================================================================
describe('★突進のカウンター(弾き返し)の配線の不変条件(§5-2 ★弾き返しの効かせ方/やること③)', () => {
  const text = Object.values(LOOP_SOURCES)[0] ?? '';
  const lines = codeLines(text);
  // ★v0.25.3808(7巡目 低11): 終端を「最初の `};` に見える行」で取るのをやめ、**括弧の深さ**で数える
  // (本体の途中にオブジェクトの閉じを1つ作るだけでブロックが縮み、以降の禁止検査が見えなくなった)。
  const dashBody = () => braceBlockAfter(lines, /const thorDashCounterHit = \(/);
  const commonBody = () => braceBlockAfter(lines, /const thorCounterHit = \(/);

  it('★この層は `patch` を**1つも書かない**(=行き先を後段で捨てる/上書きする細工が構造的に不可能)', () => {
    const body = dashBody();
    expect(body.length, 'thorDashCounterHit の本体を走査できていない(走査そのものが壊れた)')
      .toBeGreaterThan(3);
    // ★7巡目 重大1/3の直しの本体。旧実装は「共通層を呼ぶ → patch.aiTargetX/Y を上書きする」という
    // **順序契約**だった:
    //  ・重大1= 共通層は自分で aiTargetX/Y を書くので、**呼び出しを2行下げるだけ**で弾き返しが消える。
    //  ・重大3= 走査が「`placed.` を使う代入が在るか」しか見ないので、**直後にもう1本足して捨てる**
    //    (`patch.aiTargetX = pcx;`)だけで緑を通る。
    // ⇒ 行き先を引数(aimAt)で渡す形にして、この層からは patch への代入を**全廃**した。
    //   代入が0本なら、順序も上書きも唯一性も**議論が起きない**。
    const writes = body.filter(l => /patch\.[A-Za-z]+\s*=(?!=)/.test(l));
    expect(
      writes.length,
      'thorDashCounterHit が patch を書いている。この層は「共通層を aimAt 付きで呼ぶ」だけの薄い層で、'
      + '**patch への代入は共通層(thorCounterHit)の1箇所に集約**されている(順序契約を作らないため)。'
      + `\n走査=\n${writes.map(b => b.trim()).join('\n')}`,
    ).toBe(0);
  });

  it('★行き先は純関数(thorDashPushbackFromEnemy)へ**boss と player を渡して**出す=束縛も配線に残さない', () => {
    const body = dashBody();
    expect(body.length, 'thorDashCounterHit の本体を走査できていない(走査そのものが壊れた)')
      .toBeGreaterThan(3);
    // ★7巡目 重大2: 前巡は8引数を配線側で組んでいたので、`from`/`to` の入れ替え・寸法ゼロ・
    // 帯の文脈の偽装が**全部ここで**でき、純関数の値テストを素通りした。束縛ごと純関数へ入れ、
    // 配線に残るのは「boss と player を渡す」だけにする(値の不変条件は上の describe が持つ)。
    const calls = body.filter(l => /thorDashPushbackFromEnemy\(/.test(l));
    expect(
      calls.length,
      '弾き返しの行き先を純関数(thorDashPushbackFromEnemy)で出していない(または複数回呼んでいる)。'
      + `\n走査=\n${body.map(b => b.trim()).join('\n')}`,
    ).toBe(1);
    // ★v0.25.3809(8巡目 低9): 「行ける帯」の文脈は**組み立てごと純関数へ入れた**ので、配線には
    // `pst` を**そのまま渡す**1語しか残らない(前巡は4フィールドを1つずつ書いており、走査が
    // 見ていたのは `labTheme:` の1行だけ ⇒ 残り3つを定数へ差し替える変異が緑を通った)。
    expect(
      calls[0],
      '引数が (boss, player, pst, …) ではない。取り違えると進行方向が逆・基準点が入れ替わる/'
      + '文脈をフィールド単位で組み立て直すと、そこで偽装できる(組み立ては thorPlayableAreaCtx が持つ)。',
    ).toMatch(/thorDashPushbackFromEnemy\(\s*boss\s*,\s*player\s*,\s*pst\s*,/);
    // 文脈のフィールドを配線側で組み直していないこと(=偽装の面積がゼロである証明)。
    for (const f of ['labTheme', 'farBackdrop', 'corridorMode', 'm0AdvanceLimitX', 'corridorRunInActive']) {
      expect(
        body.some(l => new RegExp(`${f}\\s*:`).test(l)),
        `「行ける帯」の文脈を配線側で組み立て直している(${f})。組み立ては純関数 thorPlayableAreaCtx の1箇所。`,
      ).toBe(false);
    }
    // 弾き返し量は既存の合流点(ミゲル/ウリと共有)から**そのまま**渡す=新しい定数も係数も足さない。
    // (`AN_C.dashCounterPushbackPx * 0` のような細工はこの正規表現で落ちる。)
    expect(
      body.some(l => /,\s*AN_C\.dashCounterPushbackPx\s*\)/.test(l)),
      '弾き返し量が既存の dashCounterPushbackPx から**そのまま**渡されていない'
      + '(係数を掛ける/別の定数へ差し替える細工を含む)',
    ).toBe(true);
  });

  it('★共通層の起点/到達点は**純関数の戻り値をそのまま**書く(分岐を層の中に残さない)', () => {
    const body = commonBody();
    expect(body.length, 'thorCounterHit の本体を走査できていない(走査そのものが壊れた)')
      .toBeGreaterThan(10);
    // ★v0.25.3809(8巡目 重大1/3)の直しの本体。前巡はここに
    //   `patch.aiTargetX = opts?.aimAt ? opts.aimAt.x : 既定式`
    // と三項で書いてあり、走査は「`opts?.aimAt` という字面が在るか」しか見られなかった。
    // ⇒ **三項の両側を既定式にする**変異(=渡された行き先を読むフリだけして捨てる)が緑を通った。
    // 分岐を純関数へ出したので、ここで見るのは「純関数を **opts を渡して**呼び、その戻り値を
    // **そのまま**代入しているか」だけ。**値の不変条件は上の describe が持つ。**
    const originCalls = body.filter(l => /counterLeapOrigin\(/.test(l));
    const targetCalls = body.filter(l => /counterLeapTarget\(/.test(l));
    expect(originCalls.length, 'counterLeapOrigin の呼び出しが1本ではない').toBe(1);
    expect(targetCalls.length, 'counterLeapTarget の呼び出しが1本ではない').toBe(1);
    expect(
      originCalls[0],
      '共通層が渡された起点(fromAt)を純関数へ渡していない=斬り抜け経路の起点が既定へ戻る',
    ).toMatch(/counterLeapOrigin\(\s*opts\?\.fromAt\s*,\s*bcx\s*,\s*bcy\s*\)/);
    expect(
      targetCalls[0],
      '共通層が渡された行き先(aimAt)を純関数へ渡していない=突進の弾き返しが1pxも効かない',
    ).toMatch(/counterLeapTarget\(\s*opts\?\.aimAt\s*,\s*pcx\s*,\s*pcy\s*,\s*bcx\s*,\s*bcy\s*,\s*HB_TH\.orbit\.distPx\s*\)/);
    // 代入は「戻り値をそのまま」の各1本だけ(2本あると「後の行が勝つ」=順序契約が復活する)。
    const EXPECT: Record<string, RegExp> = {
      aiFromX: /patch\.aiFromX = leapFrom\.x;/, aiFromY: /patch\.aiFromY = leapFrom\.y;/,
      aiTargetX: /patch\.aiTargetX = leapTo\.x;/, aiTargetY: /patch\.aiTargetY = leapTo\.y;/,
    };
    for (const f of ['aiFromX', 'aiFromY', 'aiTargetX', 'aiTargetY'] as const) {
      const writes = body.filter(l => new RegExp(`patch\\.${f}\\s*=(?!=)`).test(l));
      expect(
        writes.length,
        `共通層(thorCounterHit)の patch.${f} への代入が1本ではない。`
        + `\n走査=\n${writes.map(b => b.trim()).join('\n')}`,
      ).toBe(1);
      expect(
        writes[0],
        `patch.${f} が純関数の戻り値そのものではない(=層の中に分岐/加工が戻っている)`,
      ).toMatch(EXPECT[f]);
    }
  });

  it('★内側で共通の `thorCounterHit(...)` を必ず呼ぶ(削ると Counter!/クリ反撃/counter-leap/専用CD が全部消える)', () => {
    const body = dashBody();
    expect(body.length, 'thorDashCounterHit の本体を走査できていない(走査そのものが壊れた)')
      .toBeGreaterThan(3);
    // この層は「共通の反応 + 弾き返しの上書き」の薄い層。共通の呼び出しを外すと、演出も
    // 反撃ダメージも counter-leap も突進の専用CD(thorDashReadyAt)も**まとめて消える**のに、
    // 弾き返しの走査(aiTarget を書く)は通ったままになる=無音の穴。
    const inner = body.filter(l => /(^|[^A-Za-z])thorCounterHit\(/.test(l));
    expect(
      inner.length,
      '`thorCounterHit(hitX, hitY, ghost)` の呼び出しが本体に無い(または増えている)。'
      + '突進のカウンターは**共通の反応をそのまま積んだ上で行き先だけ差し替える**層である。'
      + `\n走査=\n${body.map(b => b.trim()).join('\n')}`,
    ).toBe(1);
    expect(inner[0], '共通の反応へ守護霊(ghost)を渡していない=守護霊が取ると演出が変わる')
      .toMatch(/thorCounterHit\(\s*hitX\s*,\s*hitY\s*,\s*ghost\s*,/);
    // ★v0.25.3808(7巡目 重大1/3): 行き先は**この呼び出しの引数として**渡す。純関数を呼んだのに
    // `aimAt` へ載せない(=結果を捨てる)と、共通層は既定の後退ジャンプへ着地して弾き返しが消える。
    expect(
      body.some(l => /aimAt:\s*thorDashPushbackFromEnemy\(/.test(l)),
      '純関数の結果を `aimAt` として共通層へ渡していない=弾き返しが1pxも効かない'
      + '(v0.25.3785 重大D の再発)。'
      + `\n走査=\n${body.map(b => b.trim()).join('\n')}`,
    ).toBe(true);
  });

  it('★`thorDashCounterHit(` の呼び出しは**3本**(プレイヤー/守護霊/到達カプセル)', () => {
    // ★v0.25.3799(検収監査6巡目 重大1): 旧テストは「`st === 'thor-dash-move'` と
    // `thorDashCounterHit(` が**同じ行**にある行数=2」で固めていた。ところが3本目
    // (=到達フレームの斬り抜けカプセル経路)は `thor-dash-move` ハンドラの**中**から呼ぶので
    // 同一行に現れず、**3本目を thorCounterHit へ戻す変異が緑を通っていた**
    // (=斬り抜けの間合いで取ったカウンターだけ弾き返しが消える)。よって**呼び出し総数**で固定する。
    const callIdx: number[] = [];
    lines.forEach((l, i) => { if (/thorDashCounterHit\(/.test(l)) callIdx.push(i); });
    const calls = callIdx.map(i => lines[i]);
    expect(
      calls.length,
      '突進専用層(thorDashCounterHit)の呼び出し本数が増減した。内訳は'
      + '**①共通カウンターブロックのプレイヤー経路 ②同・守護霊(ゴースト)経路 ③到達フレームの'
      + '斬り抜けカプセル経路**の3本。1本でも thorCounterHit へ戻すと、その間合いで取った'
      + 'カウンターだけ弾き返し(§4-1 受け入れ条件3)が消える。'
      + `\n走査=\n${calls.map(b => b.trim()).join('\n')}`,
    ).toBe(3);
    // 内訳の証明①②: `st === 'thor-dash-move'` で振り分ける2本(守護霊だけが gFire を渡す)。
    const dispatch = calls.filter(l => /st === 'thor-dash-move'/.test(l));
    expect(dispatch.length, "共通カウンターブロックの振り分け(st === 'thor-dash-move' の行)が2本ではない").toBe(2);
    expect(dispatch.filter(l => /gFire/.test(l)).length, '守護霊経路(gFire を渡す方)が1本ではない').toBe(1);
    expect(dispatch.filter(l => !/gFire/.test(l)).length, 'プレイヤー経路が1本ではない').toBe(1);
    // ★内訳③(v0.25.3806・検収監査6巡目 低7): 旧テストは3本目を「総数 − 振り分け = 1」の**差分**で
    // 推定していたので、**振り分け以外の場所へ1本足しつつ到達カプセルの1本を消す**と
    // 総数3・差分1のまま緑になった。よって3本目は**斬り抜けのブロックを名指しで切り出して**見る。
    // ブロック=「斬り抜けカプセルの始点を決めた所(`const sx = dnx, sy = dny;`)から、
    //   ゴースト側の同じカプセル判定(`applyGhostAllyCapsuleHit(sx, …)`)の手前まで」。
    const capsuleBlock = blockAfter(lines, /const sx = dnx, sy = dny;/, /applyGhostAllyCapsuleHit\(sx/);
    expect(capsuleBlock.length, '斬り抜けカプセルのブロックを走査できていない(走査そのものが壊れた)')
      .toBeGreaterThan(3);
    // 帯の判定とカウンター窓の分岐が同じブロックに在ること(=切り出した場所が本当に「そこ」である証明)。
    expect(capsuleBlock.some(l => /distToBandRect\(/.test(l)), '斬り抜けの帯の判定がブロックの中に無い').toBe(true);
    expect(capsuleBlock.some(l => /counterWindowEnd/.test(l)), 'カウンター窓を見る分岐がブロックの中に無い').toBe(true);
    expect(
      capsuleBlock.filter(l => /thorDashCounterHit\(/.test(l)).length,
      '斬り抜けの帯+カウンター窓の分岐から thorDashCounterHit を呼ぶ1本が無い(3本目)。',
    ).toBe(1);
    // ★v0.25.3809(8巡目 重大3): 斬り抜け経路の起点は**引数(fromAt)で渡す**。前巡は
    // 「呼んでから `patch.aiFromX/Y = dnx/dny` を上書きする」順序契約で、**代入を呼び出しの前へ
    // 移すだけで全緑**だった(3経路のうち斬り抜けだけが壊れる=実機で最も気づかれにくい)。
    expect(
      capsuleBlock.some(l => /thorDashCounterHit\(.*undefined\s*,\s*\{\s*x:\s*dnx\s*,\s*y:\s*dny\s*\}\s*\)/.test(l)),
      '斬り抜けの起点(このフレームで実際に居る場所=dnx/dny)を fromAt として渡していない。'
      + '渡さないと counter-leap の起点がフレーム頭のボス中心へ戻り、1フレームだけ後ろへ跳ぶ。'
      + `\n走査=\n${capsuleBlock.map(b => b.trim()).join('\n')}`,
    ).toBe(true);
    // ★このブロックで**共通層(thorCounterHit)を直接呼んではいけない**。呼ぶと総数3を保ったまま
    // 「斬り抜けの間合いで取ったカウンターだけ弾き返しが消える」(§4-1 受け入れ条件3が片肺になる)。
    expect(
      capsuleBlock.filter(l => /(^|[^A-Za-z])thorCounterHit\(/.test(l)).length,
      '斬り抜けのブロックが共通層(thorCounterHit)を直接呼んでいる=この間合いのカウンターだけ'
      + '弾き返しが出ない。突進の成立は必ず突進専用層(thorDashCounterHit)を通す。'
      + `\n走査=\n${capsuleBlock.map(b => b.trim()).join('\n')}`,
    ).toBe(0);
    // ①②と③は別の場所=重なっていないこと(同じ1本を二重に数えていない証明)。
    expect(dispatch.length + capsuleBlock.filter(l => /thorDashCounterHit\(/.test(l)).length).toBe(3);
  });
});

// =================================================================================================
// ★v0.25.3809(検収監査8巡目 重大2): **走査の単位を「関数の本体」から `useGameLoop.ts` 全域へ広げる。**
//
// 前巡までの禁止検査は `thorDashCounterHit` の**本体だけ**を見ていたので、監査が実測したとおり
//  ①**呼び出し側**で `thorDashCounterHit(...); patch.aiTargetX = pcx;` と足す
//  ②層の中でも `Object.assign(patch, { aiTargetX: pcx })` と書く(`patch.\w+ =` に掛からない)
// のどちらも緑を通った=**「この層は patch を書かない」を守っても、行き先は外から上書きできた。**
//
// ⇒ `patch.aiFromX/aiFromY/aiTargetX/aiTargetY` への代入を**全域で数え、許可リストで本数を固定する**。
//   許可リスト=**共通層の1組(純関数の戻り値)+ 各州の照準ロック**。1本でも増えれば必ずここで落ちる。
//   併せて **`Object.assign(patch` は全域で禁止(0本)**=数えられない書き方を作らせない。
//
// ※このリストは `useGameLoop.ts` 全域(裏ボス4体+トール)を覆う。**他ボスの技を足す時もここへ1行**
//   足すこと(手間だが、「行き先を後から上書きする」構造を二度と作らせないための本数固定)。
// =================================================================================================
/** `patch.ai(From|Target)(X|Y)` へ代入してよい**行の形**と本数(useGameLoop.ts 全域・合計41本)。 */
const AI_WRITE_LEDGER: { where: string; match: RegExp; count: number }[] = [
  { where: '★共通層(thorCounterHit)の counter-leap 起点=counterLeapOrigin の戻り値',
    match: /^patch\.aiFromX = leapFrom\.x; patch\.aiFromY = leapFrom\.y;$/, count: 1 },
  { where: '★共通層(thorCounterHit)の counter-leap 到達点=counterLeapTarget の戻り値',
    match: /^patch\.aiTargetX = leapTo\.x; patch\.aiTargetY = leapTo\.y;$/, count: 1 },
  { where: '裏ボス共通ダッシュ(beginHiddenDash)の到達点=方向×走行距離',
    match: /^patch\.aiTargetX = bcx \+ bs\.dashDirX \* travel; patch\.aiTargetY = bcy \+ bs\.dashDirY \* travel;$/, count: 1 },
  { where: '各州の照準ロック: 起点=フレーム頭のボス中心(bcx/bcy)',
    match: /^patch\.aiFromX = bcx; patch\.aiFromY = bcy;/, count: 11 },
  { where: '各州の照準ロック: 到達点=ロックした狙い点(aim)',
    match: /^patch\.aiTargetX = aim\.x; patch\.aiTargetY = aim\.y;/, count: 6 },
  { where: '帯を張る技の起点X(ヨルムンガルドのコイル/トールの払い)',
    match: /^patch\.aiFromX = aim\.x - tx0 \* \(H/, count: 2 },
  { where: '帯を張る技の起点Y(同上)', match: /^patch\.aiFromY = aim\.y - ty0 \* \(H/, count: 2 },
  { where: '帯を張る技の終点X(同上)', match: /^patch\.aiTargetX = aim\.x \+ tx0 \* \(H/, count: 2 },
  { where: '帯を張る技の終点Y(同上)', match: /^patch\.aiTargetY = aim\.y \+ ty0 \* \(H/, count: 2 },
  { where: '方向×レンジで置く到達点X(一閃×2/突き/バックステップ/旋回ステップ)',
    match: /^patch\.aiTargetX = bcx \+ [^;]+;$/, count: 5 },
  { where: '方向×レンジで置く到達点Y(同上)', match: /^patch\.aiTargetY = bcy \+ [^;]+;$/, count: 5 },
  { where: 'ミーミルのレーザーの追尾照準(stepped)',
    match: /^patch\.aiTargetX = stepped\.x; patch\.aiTargetY = stepped\.y;$/, count: 1 },
  { where: '突進の弱いホーミング再照準(nax/nay)',
    match: /^patch\.aiTargetX = nax; patch\.aiTargetY = nay;$/, count: 1 },
  { where: 'トールの突き溜め中の遅延追従照準(naimX/naimY)',
    match: /^patch\.aiTargetX = naimX; patch\.aiTargetY = naimY;/, count: 1 },
];

describe('★行き先(aiFrom/aiTarget)を書いてよい場所の台帳(useGameLoop.ts 全域・8巡目 重大2)', () => {
  const text = Object.values(LOOP_SOURCES)[0] ?? '';
  const lines = codeLines(text);
  const writes = lines.map(l => l.trim())
    .filter(l => /patch\.(aiFromX|aiFromY|aiTargetX|aiTargetY)\s*=(?!=)/.test(l));

  it('走査そのものが壊れていない(代入行を見つけられている)', () => {
    expect(writes.length).toBeGreaterThan(20);
  });

  it('★代入行はすべて台帳のどれかに当てはまる(=知らない形の書き込みが1本も無い)', () => {
    const unknown = writes.filter(l => !AI_WRITE_LEDGER.some(s => s.match.test(l)));
    expect(
      unknown.length,
      '台帳に無い形で aiFrom/aiTarget を書いている。**呼び出し側で行き先を上書きする**細工'
      + '(`thorDashCounterHit(...); patch.aiTargetX = pcx;`)はここで落ちる。'
      + '正当な追加なら AI_WRITE_LEDGER へ1行足すこと。'
      + `\n走査=\n${unknown.join('\n')}`,
    ).toBe(0);
  });

  it('★台帳の各行の本数が合っている(1本でも増減したら落ちる=本数固定)', () => {
    for (const s of AI_WRITE_LEDGER) {
      const hit = writes.filter(l => s.match.test(l));
      expect(hit.length, `${s.where}: 本数が違う\n走査=\n${hit.join('\n')}`).toBe(s.count);
    }
    const total = AI_WRITE_LEDGER.reduce((a, s) => a + s.count, 0);
    expect(writes.length, `代入の総数が台帳の合計(${total})と違う`).toBe(total);
  });

  it('★`Object.assign(patch …)` は全域で禁止(数えられない書き方を作らせない)', () => {
    const sneaky = lines.filter(l => /Object\.assign\(\s*patch/.test(l));
    expect(
      sneaky.length,
      '`Object.assign(patch, { aiTargetX: … })` は `patch.\\w+ =` の走査に掛からないので、'
      + '上の台帳を素通りして行き先を上書きできる。patch への書き込みは必ず `patch.<field> =` で書くこと。'
      + `\n走査=\n${sneaky.map(l => l.trim()).join('\n')}`,
    ).toBe(0);
  });
});

// =================================================================================================
// ★v0.25.3798(検収監査5巡目 重大2): v0.25.3793 の唯一のコード変更(中3=ノックバック凍結中に
// `aiStartedAt` も繰り下げる)に回帰テストが無かった。この1行が消えても全テストが緑=**解除の瞬間に
// イージング曲線上を凍結時間ぶんワープする**(慣性MUST違反)が黙って復活する。
// =================================================================================================
// ★訂正(v0.25.3799・検収監査6巡目 重大2): 旧コメントは「凍結中に進んではいけない時計は**3本セット**」と
// **閉じた集合**として宣言していたが、これは事実として誤り。`kbOnlyStop` の枝は `boss.type === 'thor'` の
// 中ではなく**裏ボス4体が共有する枝**で、この枝を通る州のうち burst / radial / skadi-ice / skadi-blade は
// **`bossBurstNextAt`(絶対時刻)** を読んで次弾を撃つのに繰り下げていない=**4本目**がある
// (鞭/バッシュでミーミル/ヨルムンガルド/スカジの連射中を押すと、凍結が明けた瞬間に1発が間隔を
// 無視して飛ぶ)。**トールには出ない**ので本バッチ由来の回帰ではなく、直すかどうかは裏ボス3体の
// 挙動が変わる仕様変更=**research/THOR_ISSEN_REWORK.md §9-11 で社長裁定待ち**。
// よってここで固めるのは**トールの突進が読む時計3本**に限る(集合を閉じない)。
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
    // ★**トールの突進が読む時計は3本**(bossStateUntil / bossNextActionAt / aiStartedAt)。
    // 1本でも欠けると「解除の瞬間に突進の何かが飛ぶ」。
    // ※これは**トールの突進についての集合**であって、この枝を通る全州の集合ではない
    //   (裏ボス3体の連射が読む bossBurstNextAt は繰り下げていない=上のコメントの4本目)。
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
