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
  thorDashPushbackTarget, thorDashPushbackFromEnemy, thorDashLineShift,
  counterLeapOrigin, counterLeapTarget, counterLeapPos, thorPlayableAreaCtx,
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
// ★v0.25.3810(9巡目 重大3): `combatTick.ts` にも counter-leap の**複製実装**があり、
// 台帳(useGameLoop.ts しか走査しない)の外だったので `* 0`・符号反転がどちらも全緑だった。
// 走査対象へ追加する。
const COMBAT_SOURCES = import.meta.glob<string>(
  ['./combatTick.ts'],
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

  // ★v0.25.3991(社長報告「無の境地に、近接当てても一閃即発動してこない」): 引き金B=
  // 本人の近接が**当たった**(Enemy.meleeHitAt)なら円の外からでも発動。リーチの長い近接
  // (刀の一閃154px+/鞭)は当てた瞬間の自機中心が円200pxの外にあり、Aだけでは発動しなかった。
  describe('引き金B: 当てたら発動(v0.25.3991)', () => {
    // 円の外(pcx=R+150)+振りのエッジは前フレームで済んでいる(prev===cur)=Aは立たない状態。
    const hitBase = {
      ...base, pcx: R + 150, prevCommitAt: 1016, curCommitAt: 1016,
      meleeHitAt: 5000, nowGameTime: 5016, nowMs: 1400,
    };
    it('本人の近接が当たった直後(受付100ms内)は円の外でも立つ', () => {
      expect(shouldTriggerGuaranteedIssen(hitBase)).toBe(true);
    });
    it('ヒット打刻が古い(100ms超)なら立たない', () => {
      expect(shouldTriggerGuaranteedIssen({ ...hitBase, nowGameTime: 5200 })).toBe(false);
    });
    it('本人が直近で振っていない(守護霊/分身のヒット打刻だけ)なら立たない', () => {
      expect(shouldTriggerGuaranteedIssen({ ...hitBase, nowMs: 1016 + 701 })).toBe(false);
      expect(shouldTriggerGuaranteedIssen({ ...hitBase, curCommitAt: 0, prevCommitAt: 0 })).toBe(false);
    });
    it('紫の州でなければ立たない(Bも州ゲートの内側)', () => {
      expect(shouldTriggerGuaranteedIssen({ ...hitBase, bossState: 'issen-windup' })).toBe(false);
    });
    it('発動済みなら立たない(Bも1回制限の内側)', () => {
      expect(shouldTriggerGuaranteedIssen({ ...hitBase, alreadyFired: true })).toBe(false);
    });
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

// =================================================================================================
// ★v0.25.3810(検収監査9巡目 重大1): **弾き返しを実際に運ぶ計算**=`counter-leap` の補間。
//
// 9巡かけて固めたのは「到達点を**書く**所」だけで、**それを読んでボスを動かす枝**
// (`st === 'counter-leap'`)には値テストも走査も1本も無かった。監査の実測:
//  ・到達点を読むのをやめて `const tx = bcx, ty = bcy;` にする → **全緑**
//  ・補間の直後に `patch.x = fx - boss.width/2;` を1行足して起点に固定する → **全緑**
// ⇒ **ボスが1pxも動かない**(= v0.25.3785 重大D の完全再現)が、**ワンライナーで**戻せた。
// 補間そのものを純関数(`counterLeapPos`)へ出し、ここで**値として**固定する。
// =================================================================================================
describe('★counter-leap の補間(counterLeapPos)= 弾き返しを実際に運ぶ計算(9巡目 重大1)', () => {
  const FROM = { x: 400, y: -20 }, TO = { x: 250, y: 60 };

  it('★t=0 は起点そのもの / t=1 は到達点そのもの(到達点を捨てるとここで落ちる)', () => {
    expect(counterLeapPos(FROM, TO, 0)).toEqual(FROM);
    expect(counterLeapPos(FROM, TO, 1)).toEqual(TO);
    // 起点と到達点が別の点である=このアサートが効いている証明(両端が同値なら何も検出できない)。
    expect(FROM).not.toEqual(TO);
  });

  it('★中間は起点と到達点の間で単調に進む(起点/到達点へ固定する細工はここで落ちる)', () => {
    const xs = [0, 0.25, 0.5, 0.75, 1].map(t => counterLeapPos(FROM, TO, t).x);
    const ys = [0, 0.25, 0.5, 0.75, 1].map(t => counterLeapPos(FROM, TO, t).y);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i], `x が t=${i} で進んでいない(起点or到達点へ固定されている)`).toBeLessThan(xs[i - 1]);
      expect(ys[i], `y が t=${i} で進んでいない`).toBeGreaterThan(ys[i - 1]);
    }
    // 半分の時点は**ちょうど中点**。★v0.25.3818 で ease(`airHopEase01`=smootherstep)を入れたが、
    // smootherstep は左右対称で ease(0.5)=0.5 なので、**この行は裁定後も動かない**。
    expect(counterLeapPos(FROM, TO, 0.5)).toEqual({ x: 325, y: 20 });
  });

  // ★v0.25.3818(社長裁定 §9-10「等速の線形補間(慣性MUST違反)」=(b)「ease を入れる」): 150px の弾き返しが**等速で運ばれない**ことを
  // 値で固定する。等速へ戻す変異(`airHopEase01(` を消す)は、下の t=0.25 / 0.75 で必ず落ちる
  // (t=0.5 は smootherstep が対称なので中点のまま=あの1行だけでは等速と区別できない)。
  describe('★慣性(§9-10「等速の線形補間(慣性MUST違反)」裁定(b)・v0.25.3818)= 加速→減速で運ぶ', () => {
    const A = { x: 0, y: 0 }, B = { x: 1000, y: 0 };
    it('★t=0.25 は距離の25%より手前 / t=0.75 は75%より先(=等速ではない)', () => {
      // smootherstep: 0.25 → 0.103515625 / 0.75 → 0.896484375(airHopEase01 の値そのもの)。
      expect(counterLeapPos(A, B, 0.25).x).toBeCloseTo(103.515625, 6);
      expect(counterLeapPos(A, B, 0.75).x).toBeCloseTo(896.484375, 6);
      // 等速(=250 / 750)から離れていること。この2行が等速回帰の検出器。
      expect(counterLeapPos(A, B, 0.25).x).toBeLessThan(250);
      expect(counterLeapPos(A, B, 0.75).x).toBeGreaterThan(750);
    });
    it('★両端は動かない(到達点・所要時間・判定は1pxも変わっていないことの証明)', () => {
      expect(counterLeapPos(A, B, 0)).toEqual(A);
      expect(counterLeapPos(A, B, 1)).toEqual(B);
    });
    it('★始まりと終わりは遅い(=両端で速度0。1フレームぶんの進みで比べる)', () => {
      const step = 1 / 60;
      const head = counterLeapPos(A, B, step).x - counterLeapPos(A, B, 0).x;
      const mid = counterLeapPos(A, B, 0.5 + step).x - counterLeapPos(A, B, 0.5).x;
      const tail = counterLeapPos(A, B, 1).x - counterLeapPos(A, B, 1 - step).x;
      expect(head).toBeLessThan(mid);
      expect(tail).toBeLessThan(mid);
    });
  });

  it('t は 0〜1 へ丸める(呼び出し側の clamp が消えても端で暴れない)', () => {
    expect(counterLeapPos(FROM, TO, -3)).toEqual(FROM);
    expect(counterLeapPos(FROM, TO, 9)).toEqual(TO);
  });

  it('★150px の弾き返しは「到達点まで運ばれる」(=距離が縮まない)', () => {
    // 起点=ボスの現在位置 / 到達点=弾き返し先。t=1 で**到達点に一致**するので、
    // 「補間が運ぶ距離」は起点→到達点の距離そのもの(途中で割り引かれない)。
    const end = counterLeapPos({ x: 0, y: 0 }, { x: 150, y: 0 }, 1);
    expect(Math.hypot(end.x, end.y)).toBe(150);
  });
});

describe('★弾き返しの行き先(純関数 thorDashPushbackTarget)= §4-1 受け入れ条件3の値', () => {
  it('★ボスの現在中心から**来た方向へ** pushbackPx ぶん退けた点を返す(ゼロ化も符号反転もここで落ちる)', () => {
    // 突進は左(x=0)から右(x=100)へ走ってきた。ボスは今 x=500 に居る(§9-6c: 起点=ボスの現在中心)。
    // ⇒ ボスは「来た方向」= 左へ 150px 退く = x=350。
    const r = thorDashPushbackTarget({
      fromX: 0, fromY: 0, toX: 100, toY: 0, originX: 500, originY: 0,
      pushbackPx: PUSH, bossW: 140, bossH: 140, area: OPEN_AREA,
    });
    expect(r.x, '弾き返し量がゼロ化されている/向きが逆(前へ引き寄せている)').toBe(500 - PUSH);
    expect(r.y).toBe(0);
    // 逆向き(右→左に走ってきた)なら、退く先も逆になる。
    const rev = thorDashPushbackTarget({
      fromX: 100, fromY: 0, toX: 0, toY: 0, originX: 500, originY: 0,
      pushbackPx: PUSH, bossW: 140, bossH: 140, area: OPEN_AREA,
    });
    expect(rev.x).toBe(500 + PUSH);
  });

  it('★退く距離は**厳密に** pushbackPx(斜めでも短くならない=正規化している証明)', () => {
    const r = thorDashPushbackTarget({
      fromX: 0, fromY: 0, toX: 300, toY: 400, originX: 1000, originY: 1000, // 進行方向 (0.6, 0.8)
      pushbackPx: PUSH, bossW: 140, bossH: 140, area: OPEN_AREA,
    });
    expect(Math.hypot(r.x - 1000, r.y - 1000)).toBeCloseTo(PUSH, 9);
    expect(r.x).toBeCloseTo(1000 - 0.6 * PUSH, 9);
    expect(r.y).toBeCloseTo(1000 - 0.8 * PUSH, 9);
  });

  it('★弾き返し量を変えると行き先も同じだけ動く(定数が飾りになっていない)', () => {
    const at = (push: number) => thorDashPushbackTarget({
      fromX: 0, fromY: 0, toX: 100, toY: 0, originX: 500, originY: 0,
      pushbackPx: push, bossW: 140, bossH: 140, area: OPEN_AREA,
    }).x;
    expect(at(0)).toBe(500);       // 0を渡した時だけ起点(ボスの現在中心)と同じになる
    expect(at(300)).toBe(200);
    expect(at(PUSH) - at(0)).toBe(-PUSH);
  });

  it('起点と到達点が同じ(方向が作れない)時は起点(ボスの現在中心)を返す(0除算しない)', () => {
    const r = thorDashPushbackTarget({
      fromX: 42, fromY: 42, toX: 42, toY: 42, originX: 500, originY: 300,
      pushbackPx: PUSH, bossW: 140, bossH: 140, area: OPEN_AREA,
    });
    expect(r).toEqual({ x: 500, y: 300 });
  });

  it('★行き先は「行ける帯」(clampRectToPlayableArea)を通っている=帯の外を返さない', () => {
    // 研究所(lab)は上下が LAB_CORRIDOR_Y_LIMIT_PX に固定される帯。矩形の下端まで帯の内側へ
    // 収める計算(clampRectToPlayableArea)なので、帯の外へ弾き返そうとすると**中心が ±LAB_Y で止まる**。
    const bossH = 140;
    const outside = thorDashPushbackTarget({
      fromX: 0, fromY: 5000, toX: 0, toY: 0, originX: 0, originY: LAB_Y + 400, // 上へ走ってきた=下へ弾く
      pushbackPx: PUSH, bossW: 140, bossH, area: { ...OPEN_AREA, labTheme: true },
    });
    // 矩形の下端まで帯の内側へ収まる=中心は ±LAB_CORRIDOR_Y_LIMIT_PX ちょうどで止まる。
    expect(outside.y, '帯クランプを通していない(生の座標をそのまま返している)').toBe(LAB_Y);
    // 帯の内側で完結する場合はクランプが効かない(=無条件に潰していない)ことも見る。
    const inside = thorDashPushbackTarget({
      fromX: 0, fromY: 100, toX: 0, toY: 0, originX: 0, originY: 0,
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
describe('★弾き返しの束縛(thorDashPushbackFromEnemy)= Enemy から引数を組む所も値で固める', () => {
  /** 中心 (bcx,bcy)・寸法 w×h・突進 from→to を持つボス。 */
  const bossAt = (bcx: number, bcy: number, w: number, h: number,
    dash?: { fromX: number; fromY: number; toX: number; toY: number }) => ({
    x: bcx - w / 2, y: bcy - h / 2, width: w, height: h,
    aiFromX: dash?.fromX, aiFromY: dash?.fromY, aiTargetX: dash?.toX, aiTargetY: dash?.toY,
  });

  it('★進行方向は from→to(入れ替えるとボスの向こう側へ前進する=ここで落ちる)', () => {
    // 左(x=0)から右(x=100)へ走ってきた。ボスは今 x=500。⇒ 来た方向=左へ150px = x=350。
    const r = thorDashPushbackFromEnemy(
      bossAt(500, 0, 140, 140, { fromX: 0, fromY: 0, toX: 100, toY: 0 }), OPEN_STATE, PUSH,
    );
    expect(r.x, 'from/to を入れ替えている(=来た方向と逆へ前進する)').toBe(500 - PUSH);
    expect(r.y).toBe(0);
    // 実際に入れ替えた時の値=「間違いの側」も名指しで固定しておく(取り違えが同じ値にならない証明)。
    expect(500 + PUSH).not.toBe(500 - PUSH);
  });

  it('★§9-6c: 弾き返しの基準は**ボスの現在中心**(プレイヤー位置は結果に一切効かない)', () => {
    // 社長裁定2026-08-30=推薦(a)。守護霊がプレイヤーから離れた場所で取っても
    // 「来た方向へ150px下がる」が必ず成立する=**プレイヤーの座標は式に入らない**。
    const boss = bossAt(500, 0, 140, 140, { fromX: 0, fromY: 0, toX: 100, toY: 0 });
    expect(thorDashPushbackFromEnemy(boss, OPEN_STATE, PUSH)).toEqual({ x: 500 - PUSH, y: 0 });
    // ボスの中心が動けば行き先も同じだけ動く(=基準がボスであることの証明)。
    const moved = bossAt(900, 40, 140, 140, { fromX: 0, fromY: 0, toX: 100, toY: 0 });
    expect(thorDashPushbackFromEnemy(moved, OPEN_STATE, PUSH)).toEqual({ x: 900 - PUSH, y: 40 });
    // 旧実装(プレイヤー中心基準)なら、ボスをどこへ動かしても同じ点を返していた=その退行はここで落ちる。
    expect(thorDashPushbackFromEnemy(moved, OPEN_STATE, PUSH).x)
      .not.toBe(thorDashPushbackFromEnemy(boss, OPEN_STATE, PUSH).x);
  });

  it('★基準はボスの**中心**(左上を渡すと半身ぶんズレる=ここで落ちる)', () => {
    const w = 140, h = 140;
    const r = thorDashPushbackFromEnemy(
      bossAt(500, 700, w, h, { fromX: 0, fromY: 0, toX: 100, toY: 0 }), OPEN_STATE, PUSH,
    );
    expect(r.x).toBe(500 - PUSH);
    expect(r.y, 'ボスの左上(y=700-h/2)を基準にしている').toBe(700);
  });

  it('★矩形の寸法はボスの当たり判定(0を渡すと結果が変わる=ここで落ちる)', () => {
    // 寸法が結果に効く帯を選ぶ: 洋館通路(corridorMode)の下限 `CORRIDOR_BOTTOM_LIMIT` は
    // **矩形の上端(top-left y)**へ効くので、中心は `下限 + 高さ/2` で止まる=高さが値に出る。
    // (研究所の上下クランプは中心基準なので高さが消える=寸法ゼロの細工を検出できない。)
    const h = 140;
    const CORRIDOR_STATE = { ...OPEN_STATE, corridorMode: true };
    const r = thorDashPushbackFromEnemy(
      bossAt(0, 800, 140, h, { fromX: 0, fromY: 5000, toX: 0, toY: 0 }), // 上へ走ってきた=下へ弾く
      CORRIDOR_STATE, PUSH,
    );
    expect(r.y, 'ボスの寸法(height)を渡していない').toBe(CORRIDOR_BOTTOM_LIMIT + h / 2);
    // 寸法ゼロの「間違いの側」と同じ値にならないこと(=このアサートが効いている証明)。
    const zeroSized = thorDashPushbackTarget({
      fromX: 0, fromY: 5000, toX: 0, toY: 0, originX: 0, originY: 800,
      pushbackPx: PUSH, bossW: 0, bossH: 0, area: thorPlayableAreaCtx(CORRIDOR_STATE),
    });
    expect(zeroSized.y).toBe(CORRIDOR_BOTTOM_LIMIT);
    expect(zeroSized.y).not.toBe(r.y);
  });

  it('★帯の文脈はそのまま通す(偽装すると帯の外を返す=ここで落ちる)', () => {
    const boss = bossAt(0, LAB_Y + 400, 140, 140, { fromX: 0, fromY: 5000, toX: 0, toY: 0 });
    const inLab = thorDashPushbackFromEnemy(boss, { ...OPEN_STATE, stageTheme: 'lab' }, PUSH);
    const faked = thorDashPushbackFromEnemy(boss, OPEN_STATE, PUSH);
    expect(inLab.y).toBe(LAB_Y);
    expect(faked.y, '帯の文脈が結果に効いていない(=クランプが飾りになっている)').not.toBe(inLab.y);
  });

  it('突進の起点/到達点が無い時はボスの現在中心で埋める(方向が作れない=ボス中心を返す)', () => {
    const r = thorDashPushbackFromEnemy(bossAt(123, 456, 140, 140), OPEN_STATE, PUSH);
    expect(r).toEqual({ x: 123, y: 456 });
  });

  it('★弾き返し量はそのまま効く(ゼロ化するとボスの現在中心に戻る)', () => {
    const b = bossAt(500, 0, 140, 140, { fromX: 0, fromY: 0, toX: 100, toY: 0 });
    expect(thorDashPushbackFromEnemy(b, OPEN_STATE, 0).x).toBe(500);
    expect(thorDashPushbackFromEnemy(b, OPEN_STATE, 300).x).toBe(200);
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
  const commonBody = () => braceBlockAfter(lines, /const thorCounterHit = \(/);
  /** 突進のカウンター=共通層を `aimAt` 付きで呼ぶ**その1行**の形(3経路とも同じ束縛)。 */
  const DASH_AIM = /aimAt: thorDashPushbackFromEnemy\(boss, useGameStore\.getState\(\), AN_C\.dashCounterPushbackPx\)/;

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

  // ===============================================================================================
  // ★v0.25.3810(検収監査9巡目 重大2): **中間層 `thorDashCounterHit` を廃した。**
  //
  // あの層は受け取った `fromAt` を共通層へ**素通しするだけ**で、テストは「呼び出し側」と「共通層」の
  // 両端しか見ていなかった ⇒ 監査の実測で
  //  ・仮引数を `_fromAt` にリネームして転送行を削る → **全緑・typecheck通過**
  //  ・転送時に `fromAt: fromAt ? { x: bcx, y: bcy } : undefined` へ書き換える → **全緑**
  // =**斬り抜けカプセル経路の起点だけが黙って壊れる**(8巡目 重大3の完全再現)。
  // 層を1枚減らせば素通しの検査そのものが要らなくなるので、**3つの呼び出し側が共通層を直接呼ぶ**。
  // ===============================================================================================
  it('★中間層(thorDashCounterHit)は**存在しない**(素通しの層を作らない)', () => {
    const decl = lines.filter(l => /const thorDashCounterHit\s*=/.test(l));
    expect(
      decl.length,
      '中間層 `thorDashCounterHit` が復活している。この層は `fromAt` を素通しするだけで、'
      + '**素通しをやめる変異(仮引数のリネーム+転送行の削除)が全テスト緑を通る**(9巡目 重大2)。'
      + '突進の3経路は共通層(thorCounterHit)を `aimAt` 付きで直接呼ぶこと。',
    ).toBe(0);
  });

  it('★突進の成立は3経路とも共通層を `aimAt` 付きで呼ぶ(プレイヤー/守護霊/到達カプセル)', () => {
    // ★v0.25.3799(6巡目 重大1)の教訓を引き継ぐ: 3本目(到達フレームの斬り抜けカプセル経路)は
    // `thor-dash-move` ハンドラの**中**から呼ぶので振り分けの行には現れない ⇒ **総数**で固定する。
    const aimCalls = lines.filter(l => DASH_AIM.test(l));
    expect(
      aimCalls.length,
      '弾き返し付きのカウンター(共通層を `aimAt` 付きで呼ぶ行)の本数が増減した。内訳は'
      + '**①共通カウンターブロックのプレイヤー経路 ②同・守護霊(ゴースト)経路 ③到達フレームの'
      + '斬り抜けカプセル経路**の3本。1本でも `aimAt` を落とすと、その間合いで取ったカウンターだけ'
      + '弾き返し(§4-1 受け入れ条件3)が消える。'
      + `\n走査=\n${aimCalls.map(b => b.trim()).join('\n')}`,
    ).toBe(3);
    // 3本とも**共通層の呼び出しの引数として**渡っている(純関数を呼んだのに結果を捨てる細工の排除)。
    for (const l of aimCalls) {
      expect(l, '`aimAt` が thorCounterHit の引数として渡っていない(結果を捨てている)')
        .toMatch(/thorCounterHit\(/);
    }
    // 内訳①②: `st === 'thor-dash-move'` で振り分ける2本(守護霊だけが gFire を渡す)。
    const dispatch = aimCalls.filter(l => /st === 'thor-dash-move'/.test(l));
    expect(dispatch.length, "共通カウンターブロックの振り分け(st === 'thor-dash-move' の行)が2本ではない").toBe(2);
    expect(dispatch.filter(l => /gFire/.test(l)).length, '守護霊経路(gFire を渡す方)が1本ではない').toBe(1);
    expect(dispatch.filter(l => !/gFire/.test(l)).length, 'プレイヤー経路が1本ではない').toBe(1);
    // ★内訳③(v0.25.3806・6巡目 低7): 3本目は**斬り抜けのブロックを名指しで切り出して**見る
    // (「総数 − 振り分け = 1」の差分推定だと、別の場所へ1本足しつつ到達カプセルの1本を消せば通る)。
    // ブロック=「斬り抜けカプセルの始点を決めた所(`const sx = dnx, sy = dny;`)から、
    //   ゴースト側の同じカプセル判定(`applyGhostAllyCapsuleHit(sx, …)`)の手前まで」。
    const capsuleBlock = blockAfter(lines, /const sx = dnx, sy = dny;/, /applyGhostAllyCapsuleHit\(sx/);
    expect(capsuleBlock.length, '斬り抜けカプセルのブロックを走査できていない(走査そのものが壊れた)')
      .toBeGreaterThan(3);
    // 帯の判定とカウンター窓の分岐が同じブロックに在ること(=切り出した場所が本当に「そこ」である証明)。
    expect(capsuleBlock.some(l => /distToBandRect\(/.test(l)), '斬り抜けの帯の判定がブロックの中に無い').toBe(true);
    // v0.25.3926: カウンター成立の判定は `isCounterActive`(窓は [start, end]=刃が出ている間だけ)に一本化された。
    expect(capsuleBlock.some(l => /isCounterActive|counterWindowEnd/.test(l)), 'カウンター窓を見る分岐がブロックの中に無い').toBe(true);
    const capsuleCalls = capsuleBlock.filter(l => DASH_AIM.test(l));
    expect(
      capsuleCalls.length,
      '斬り抜けの帯+カウンター窓の分岐から「共通層を aimAt 付きで呼ぶ」1本が無い(3本目)。',
    ).toBe(1);
    // ★v0.25.3809(8巡目 重大3): 斬り抜け経路の起点は**引数(fromAt)で渡す**。旧実装は
    // 「呼んでから `patch.aiFromX/Y = dnx/dny` を上書きする」順序契約で、**代入を呼び出しの前へ
    // 移すだけで全緑**だった(3経路のうち斬り抜けだけが壊れる=実機で最も気づかれにくい)。
    // ★v0.25.3810(9巡目 重大2): 中間層が消えたので、`fromAt` は**この行の中で**共通層へ渡る
    // (素通しの層が無い=転送を削る/加工する余地そのものが無い)。
    expect(
      capsuleCalls[0],
      '斬り抜けの起点(このフレームで実際に居る場所=dnx/dny)を fromAt として渡していない。'
      + '渡さないと counter-leap の起点がフレーム頭のボス中心へ戻り、1フレームだけ後ろへ跳ぶ。'
      + `\n走査=\n${capsuleBlock.map(b => b.trim()).join('\n')}`,
    ).toMatch(/fromAt:\s*\{\s*x:\s*dnx\s*,\s*y:\s*dny\s*\}/);
    // ★このブロックで**`aimAt` 無しの共通層呼び出し**をしてはいけない(=弾き返しが消える)。
    const bare = capsuleBlock.filter(l => /(^|[^A-Za-z])thorCounterHit\(/.test(l) && !DASH_AIM.test(l));
    expect(
      bare.length,
      '斬り抜けのブロックが `aimAt` 無しで共通層を呼んでいる=この間合いのカウンターだけ'
      + '弾き返しが出ない(§4-1 受け入れ条件3が片肺になる)。'
      + `\n走査=\n${bare.map(b => b.trim()).join('\n')}`,
    ).toBe(0);
    // ①②と③は別の場所=重なっていないこと(同じ1本を二重に数えていない証明)。
    expect(dispatch.length + capsuleCalls.length).toBe(3);
  });

  // ===============================================================================================
  // ★v0.25.3810(検収監査9巡目 重大1): **弾き返しを実際に運ぶ枝**(`st === 'counter-leap'`)の固定。
  //
  // 9巡かけて固めたのは「到達点を**書く**所」だけで、**それを読んでボスを動かす補間**は無検査だった。
  // 監査の実測: ①到達点を読むのをやめて `const tx = bcx, ty = bcy;` にする → 全緑
  //             ②補間の直後に `patch.x = fx - boss.width/2;` を足して起点に固定する → 全緑
  // ⇒ **ボスが1pxも動かない**(v0.25.3785 重大D の完全再現)が、ワンライナーで戻せた。
  // 補間を純関数(`counterLeapPos`・値は上の describe が持つ)へ出し、ここでは
  // 「**到達点を読んでいるか**」「**代入が各1本で純関数の戻り値そのものか**」だけを見る。
  // ===============================================================================================
  it('★counter-leap の枝が到達点を読み、位置は純関数(counterLeapPos)の戻り値そのもの', () => {
    // 枝=`} else if (st === 'counter-leap') {` から**次の州の枝**の手前まで。
    const leap = blockAfter(lines, /\} else if \(st === 'counter-leap'\) \{/, /\} else if \(st === '/);
    expect(leap.length, "counter-leap の枝を走査できていない(走査そのものが壊れた)").toBeGreaterThan(4);
    // ①起点と到達点は**ボスの aiFrom/aiTarget から**引く(`const tx = bcx, ty = bcy;` にする変異を落とす)。
    expect(
      leap.some(l => /const fx = boss\.aiFromX \?\? bcx, fy = boss\.aiFromY \?\? bcy;/.test(l)),
      'counter-leap の起点が boss.aiFromX/aiFromY から来ていない',
    ).toBe(true);
    expect(
      leap.some(l => /const tx = boss\.aiTargetX \?\? bcx, ty = boss\.aiTargetY \?\? bcy;/.test(l)),
      '★counter-leap の**到達点を読んでいない**(=弾き返し先を捨てている ⇒ ボスが1pxも動かない)。'
      + `\n走査=\n${leap.map(b => b.trim()).join('\n')}`,
    ).toBe(true);
    // ②補間は純関数を1回だけ呼ぶ(起点・到達点・t をそのまま渡す)。
    const posCalls = leap.filter(l => /counterLeapPos\(/.test(l));
    expect(posCalls.length, 'counterLeapPos の呼び出しが1本ではない').toBe(1);
    expect(
      posCalls[0],
      '補間へ渡す起点/到達点/進捗が (fx,fy) → (tx,ty) → t ではない(取り違えると逆方向へ運ぶ)',
    ).toMatch(/counterLeapPos\(\s*\{ x: fx, y: fy \}\s*,\s*\{ x: tx, y: ty \}\s*,\s*t\s*\)/);
    // ③位置の代入は各1本だけ(2本あると「後の行が勝つ」=起点へ固定する1行を足す変異が通る)。
    const EXPECT: Record<string, RegExp> = {
      x: /^patch\.x = leapPos\.x - boss\.width \/ 2;$/,
      y: /^patch\.y = leapPos\.y - boss\.height \/ 2;$/,
    };
    for (const f of ['x', 'y'] as const) {
      const writes = leap.map(l => l.trim()).filter(l => new RegExp(`^patch\\.${f}\\s*=(?!=)`).test(l));
      expect(
        writes.length,
        `counter-leap の枝の patch.${f} への代入が1本ではない。`
        + '**直後にもう1本足して起点へ固定する**変異(9巡目 重大1の②)はここで落ちる。'
        + `\n走査=\n${writes.join('\n')}`,
      ).toBe(1);
      expect(
        writes[0],
        `patch.${f} が純関数の戻り値そのものではない(=枝の中に補間/加工が戻っている)`,
      ).toMatch(EXPECT[f]);
    }
  });
});

// =================================================================================================
// ★v0.25.3809(検収監査8巡目 重大2): **走査の単位を「関数の本体」から `useGameLoop.ts` 全域へ広げる。**
//
// 前巡までの禁止検査は突進専用の中間層の**本体だけ**を見ていたので、監査が実測したとおり
//  ①**呼び出し側**で `<層>(...); patch.aiTargetX = pcx;` と足す
//  ②層の中でも `Object.assign(patch, { aiTargetX: pcx })` と書く(`patch.\w+ =` に掛からない)
// のどちらも緑を通った=**「この層は patch を書かない」を守っても、行き先は外から上書きできた。**
//
// ⇒ `patch.aiFromX/aiFromY/aiTargetX/aiTargetY` への代入を**全域で数え、許可リストで本数を固定する**。
//
// ★v0.25.3810(検収監査9巡目 重大4/5)で**台帳そのものを作り直した。** 前巡の版は
// 「1本でも増えれば必ずここで落ちる」と書いてあったが、**それは事実ではなかった**——監査は
// 4通りの抜け道を実測して緑を通している:
//  (i)  **未アンカーのパターン**(`match: /^patch\.aiFromX = bcx; patch\.aiFromY = bcy;/` のように
//       末尾を閉じていない)⇒ **既存の許可行の同じ行の末尾へ足す**と、**行**単位で数えているので総数が変わらない。
//  (ii) **緩い正規表現**(`/^patch\.aiTargetX = bcx \+ [^;]+;$/`)⇒ 中身を
//       `bcx + 0 * (元の式)` へ差し替えても同じパターンに当たる(=行き先をボス中心へ潰せる)。
//  (iii)**エイリアス**(`const pw = patch; pw.aiTargetX = …`)⇒ `patch.` で始まらないので走査に掛からない。
//  (iv) **ブラケット記法**(`patch['aiTargetX'] = …`)⇒ 同上。
// ⇒ 直した点は4つ:
//  ①**数える単位を「行」から「代入」へ**変えた(1行を `;` で割ってから数える)。行末への追記は
//    総数を増やすので必ず落ちる。
//  ②**全パターンを完全アンカー**(`^…$`)し、**`[^;]+` を実体の式へ書き下した**(係数の差し込みが落ちる)。
//  ③**別名束ね(`= patch;` / `= patch,`)を全域で0本**にした(エイリアス経由の書き込みを作らせない)。
//  ④**ブラケット記法(`patch[`)を全域で0本**にした。
//
// ★それでも「必ず落ちる」とは書かない(9巡目 重大4/5・言葉を実測の範囲に合わせる)。
//   この台帳が捕まえるのは **`patch` という名前のオブジェクトへ、`patch.<既知の4フィールド> = …` の
//   形で書く代入**である。**捕まえられない形は残っている**——例えば
//   `Object.defineProperty` / `structuredClone` 経由 / `patch` を関数へ渡して中で書く /
//   `enemies` 配列を直接書き換える、といった経路は数の外にある。
//   **「素朴な追加・行末への追記・別名・ブラケットは捕まえる。それ以外の間接的な書き方は捕まえない。」**
//
// ※このリストは `useGameLoop.ts` 全域(裏ボス4体+トール)を覆う。**他ボスの技を足す時もここへ1行**
//   足すこと(手間だが、「行き先を後から上書きする」構造を二度と作らせないための本数固定)。
// =================================================================================================
/**
 * `patch.ai(From|Target)(X|Y)` へ**代入**してよい形と本数(useGameLoop.ts 全域・**合計64本**)。
 * ★単位は**行ではなく代入**(`;` で割った後の1文)。★全て完全アンカー(`^…$`)=部分一致で通さない。
 */
const AI_WRITE_LEDGER: { where: string; match: RegExp; count: number }[] = [
  { where: '★共通層(thorCounterHit)の counter-leap 起点=counterLeapOrigin の戻り値',
    match: /^patch\.aiFromX = leapFrom\.x$/, count: 1 },
  { where: '★同上(Y)', match: /^patch\.aiFromY = leapFrom\.y$/, count: 1 },
  { where: '★共通層(thorCounterHit)の counter-leap 到達点=counterLeapTarget の戻り値',
    match: /^patch\.aiTargetX = leapTo\.x$/, count: 1 },
  { where: '★同上(Y)', match: /^patch\.aiTargetY = leapTo\.y$/, count: 1 },
  { where: '裏ボス共通ダッシュ(beginHiddenDash)の到達点X=方向×走行距離',
    match: /^patch\.aiTargetX = bcx \+ bs\.dashDirX \* travel$/, count: 1 },
  { where: '同上(Y)', match: /^patch\.aiTargetY = bcy \+ bs\.dashDirY \* travel$/, count: 1 },
  { where: '各州の照準ロック: 起点X=フレーム頭のボス中心(bcx)',
    match: /^patch\.aiFromX = bcx$/, count: 11 },
  { where: '各州の照準ロック: 起点Y=フレーム頭のボス中心(bcy)',
    match: /^patch\.aiFromY = bcy$/, count: 11 },
  { where: '各州の照準ロック: 到達点X=ロックした狙い点(aim.x)',
    match: /^patch\.aiTargetX = aim\.x$/, count: 6 },
  { where: '各州の照準ロック: 到達点Y=ロックした狙い点(aim.y)',
    match: /^patch\.aiTargetY = aim\.y$/, count: 6 },
  // ---- 帯を張る技(ヨルムンガルドのコイル / トールの払い)= 狙い点を中心に前後へ半分ずつ ----
  { where: 'コイルの帯: 起点X', match: /^patch\.aiFromX = aim\.x - tx0 \* \(HB_JO\.coil\.range \/ 2\)$/, count: 1 },
  { where: 'コイルの帯: 起点Y', match: /^patch\.aiFromY = aim\.y - ty0 \* \(HB_JO\.coil\.range \/ 2\)$/, count: 1 },
  { where: 'コイルの帯: 終点X', match: /^patch\.aiTargetX = aim\.x \+ tx0 \* \(HB_JO\.coil\.range \/ 2\)$/, count: 1 },
  { where: 'コイルの帯: 終点Y', match: /^patch\.aiTargetY = aim\.y \+ ty0 \* \(HB_JO\.coil\.range \/ 2\)$/, count: 1 },
  { where: '払いの帯: 起点X', match: /^patch\.aiFromX = aim\.x - tx0 \* \(HB_TH\.harai\.range \/ 2\)$/, count: 1 },
  { where: '払いの帯: 起点Y', match: /^patch\.aiFromY = aim\.y - ty0 \* \(HB_TH\.harai\.range \/ 2\)$/, count: 1 },
  { where: '払いの帯: 終点X', match: /^patch\.aiTargetX = aim\.x \+ tx0 \* \(HB_TH\.harai\.range \/ 2\)$/, count: 1 },
  { where: '払いの帯: 終点Y', match: /^patch\.aiTargetY = aim\.y \+ ty0 \* \(HB_TH\.harai\.range \/ 2\)$/, count: 1 },
  // ---- 方向×レンジで置く到達点(★v0.25.3810: `[^;]+` をやめて式を書き下した=係数の差し込みが落ちる) ----
  { where: '一閃(台本ON)の到達点X', match: /^patch\.aiTargetX = bcx \+ \(ddx0 \/ ddl0\) \* HB_TH\.issen\.range$/, count: 1 },
  { where: '一閃(台本ON)の到達点Y', match: /^patch\.aiTargetY = bcy \+ \(ddy0 \/ ddl0\) \* HB_TH\.issen\.range$/, count: 1 },
  { where: '一閃(?thorscript=0)の到達点X', match: /^patch\.aiTargetX = bcx \+ \(gdx \/ gdl\) \* HB_TH\.issen\.range$/, count: 1 },
  { where: '一閃(?thorscript=0)の到達点Y', match: /^patch\.aiTargetY = bcy \+ \(gdy \/ gdl\) \* HB_TH\.issen\.range$/, count: 1 },
  { where: '突きの到達点X', match: /^patch\.aiTargetX = bcx \+ \(ddx \/ ddl\) \* HB_TH\.tsuki\.range$/, count: 1 },
  { where: '突きの到達点Y', match: /^patch\.aiTargetY = bcy \+ \(ddy \/ ddl\) \* HB_TH\.tsuki\.range$/, count: 1 },
  { where: 'バックステップの到達点X', match: /^patch\.aiTargetX = bcx \+ \(rx \/ rl\) \* HB_TH\.backstep\.distPx$/, count: 1 },
  { where: 'バックステップの到達点Y', match: /^patch\.aiTargetY = bcy \+ \(ry \/ rl\) \* HB_TH\.backstep\.distPx$/, count: 1 },
  { where: '旋回ステップの到達点X', match: /^patch\.aiTargetX = bcx \+ tux \* HB_TH\.orbitStep\.distPx$/, count: 1 },
  { where: '旋回ステップの到達点Y', match: /^patch\.aiTargetY = bcy \+ tuy \* HB_TH\.orbitStep\.distPx$/, count: 1 },
  // ---- 追尾/再照準 ----
  { where: 'ミーミルのレーザーの追尾照準X(stepped)', match: /^patch\.aiTargetX = stepped\.x$/, count: 1 },
  { where: '同上(Y)', match: /^patch\.aiTargetY = stepped\.y$/, count: 1 },
  { where: '突進の弱いホーミング再照準X(nax)', match: /^patch\.aiTargetX = nax$/, count: 1 },
  { where: '同上(Y)', match: /^patch\.aiTargetY = nay$/, count: 1 },
  { where: 'トールの突き溜め中の遅延追従照準X(naimX)', match: /^patch\.aiTargetX = naimX$/, count: 1 },
  { where: '同上(Y)', match: /^patch\.aiTargetY = naimY$/, count: 1 },
  // ---- ★§9-9(社長裁定2026-08-30=推薦(b)・v0.25.4088): ノックバック凍結中に滑った分だけ
  //      突進の線を**平行移動**する(純関数 thorDashLineShift の戻り値をそのまま書く)。
  //      **4本セット**(起点/到達点のXY)で1つの平行移動=どれか1本でも欠けると線が曲がる。
  { where: '§9-9 突進の線の平行移動: 起点X', match: /^patch\.aiFromX = shifted\.fromX$/, count: 1 },
  { where: '§9-9 同上(起点Y)', match: /^patch\.aiFromY = shifted\.fromY$/, count: 1 },
  { where: '§9-9 同上(到達点X)', match: /^patch\.aiTargetX = shifted\.toX$/, count: 1 },
  { where: '§9-9 同上(到達点Y)', match: /^patch\.aiTargetY = shifted\.toY$/, count: 1 },
];

/** 行末コメントを落として `;` で割り、**1代入=1要素**にする(★v0.25.3810・行末への追記対策)。 */
const assignments = (lines: string[]): string[] =>
  lines.flatMap(l => l.replace(/\/\/.*$/, '').split(';'))
    .map(s => s.trim())
    .filter(s => /patch\.(aiFromX|aiFromY|aiTargetX|aiTargetY)\s*=(?!=)/.test(s));

describe('★行き先(aiFrom/aiTarget)を書いてよい場所の台帳(useGameLoop.ts 全域・9巡目 重大4/5で作り直し)', () => {
  const text = Object.values(LOOP_SOURCES)[0] ?? '';
  const lines = codeLines(text);
  const writes = assignments(lines);

  it('走査そのものが壊れていない(代入を見つけられている)', () => {
    expect(writes.length).toBeGreaterThan(40);
  });

  it('★代入はすべて台帳のどれかに**完全一致**する(=知らない形の書き込みが1本も無い)', () => {
    const unknown = writes.filter(l => !AI_WRITE_LEDGER.some(s => s.match.test(l)));
    expect(
      unknown.length,
      '台帳に無い形で aiFrom/aiTarget を書いている。**呼び出し側で行き先を上書きする**細工'
      + '(`thorCounterHit(...); patch.aiTargetX = pcx;`)も、**既存の許可行の行末へ足す**細工も、'
      + '**既存の式へ係数を差し込む**細工(`bcx + 0 * (元の式)`)もここで落ちる。'
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

  // ★v0.25.3810(9巡目 重大4): 監査の実測で緑を通った残り2形。どちらも「`patch.` で始まらないので
  // 台帳の走査に掛からない」書き方=**数えられない入口**なので、全域で0本にする。
  it('★`patch` の別名束ね(`= patch;` / `= patch,`)は全域で禁止(エイリアス経由の上書き)', () => {
    const alias = lines.filter(l => /=\s*patch\s*[;,)]/.test(l));
    expect(
      alias.length,
      '`const pw = patch; pw.aiTargetX = …` は台帳を素通りして行き先を上書きできる(監査が実測)。'
      + `\n走査=\n${alias.map(l => l.trim()).join('\n')}`,
    ).toBe(0);
  });

  it('★ブラケット記法(`patch[`)は全域で禁止', () => {
    const bracket = lines.filter(l => /patch\s*\[/.test(l));
    expect(
      bracket.length,
      "`patch['aiTargetX'] = …` は台帳を素通りして行き先を上書きできる(監査が実測)。"
      + `\n走査=\n${bracket.map(l => l.trim()).join('\n')}`,
    ).toBe(0);
  });

  // ★v0.25.3810(9巡目 低10): 弾き返し量の出どころ(`AN_C`)を**別名で覆って0にする**変異が緑だった。
  // `AN_C` は import された台帳(ミゲル/ウリと共有の合流点)であって、再束縛してよい名前ではない。
  it('★`AN_C` の再束縛は禁止(押し量をローカルで0に差し替える細工)', () => {
    const rebind = lines.filter(l => /(?:const|let|var)\s+(?:\{[^}]*\})?\s*AN_C\b/.test(l) || /^\s*AN_C\s*=(?!=)/.test(l));
    expect(
      rebind.length,
      '`AN_C` を再束縛している(`const AN_C = { dashCounterPushbackPx: 0 }` 等)。弾き返し量は'
      + '**import した合流点(ANGEL_COMMON_TUNING)そのもの**から渡すこと。'
      + `\n走査=\n${rebind.map(l => l.trim()).join('\n')}`,
    ).toBe(0);
    // 逆側の証明: import は1本ある(=この検査が「AN_C が消えた」状態で空振りしていない)。
    expect(lines.filter(l => /import \{ ANGEL_COMMON_TUNING as AN_C \}/.test(l)).length).toBe(1);
  });
});

// =================================================================================================
// ★v0.25.3810(検収監査9巡目 重大3): **`combatTick.ts` にも counter-leap の複製実装があった。**
//
// `applyPumpkinBlastDamage`(パリィされたジャンプ着地→トールの後退)が、起点と到達点を
// **共通層と同じ既定式で直書き**していて、台帳(`useGameLoop.ts` しか走査しない)の外にあった。
// 監査の実測: **`* 0` にする / 符号を反転する → どちらも全緑**(=パリィ後の後退が消える/逆へ跳ぶ)。
// さらに §9-10(ease)や §9-6c(起点)が裁定された時に**片方だけ直って挙動が割れる**。
// ⇒ 実装を `counterLeapOrigin` / `counterLeapTarget` へ寄せ(**値は1つも変わっていない**)、
//    このファイルも台帳の走査対象に入れる。
//
// ※`combatTick` は `patch.<field> =` ではなく**オブジェクトリテラルのフィールド**で書くので、
//   台帳の形も `aiFromX: …` になる(useGameLoop の台帳とは別表=書き方が違うため)。
// =================================================================================================
const COMBAT_TICK_AI_LEDGER: { where: string; match: RegExp; count: number }[] = [
  { where: '★トールのパリィ後退: counter-leap の起点=counterLeapOrigin の戻り値',
    match: /^aiFromX: leapFrom\.x, aiFromY: leapFrom\.y,$/, count: 1 },
  { where: '★同・到達点=counterLeapTarget の戻り値',
    match: /^aiTargetX: leapTo\.x, aiTargetY: leapTo\.y,$/, count: 1 },
  { where: 'ノックバック解除時の後片付け(照準を捨てる=undefined で消す)',
    match: /^aiTargetX: undefined, aiTargetY: undefined, aiFromX: undefined, aiFromY: undefined,$/, count: 2 },
];

describe('★combatTick.ts の counter-leap も同じ純関数から出す(9巡目 重大3)', () => {
  const text = Object.values(COMBAT_SOURCES)[0] ?? '';
  const lines = codeLines(text);

  it('combatTick.ts を読めている(走査そのものが壊れていない)', () => {
    expect(text.length).toBeGreaterThan(1000);
  });

  it('★起点/到達点は純関数(counterLeapOrigin / counterLeapTarget)を通す=既定式を直書きしない', () => {
    const originCalls = lines.filter(l => /counterLeapOrigin\(/.test(l));
    const targetCalls = lines.filter(l => /counterLeapTarget\(/.test(l));
    expect(originCalls.length, 'counterLeapOrigin の呼び出しが1本ではない').toBe(1);
    expect(targetCalls.length, 'counterLeapTarget の呼び出しが1本ではない').toBe(1);
    expect(originCalls[0], '起点にボスの現在中心(tcx/tcy)を渡していない')
      .toMatch(/counterLeapOrigin\(undefined, tcx, tcy\)/);
    expect(
      targetCalls[0],
      '到達点の引数が (プレイヤー中心, ボス中心, 旋回距離) ではない。'
      + '取り違えると後退の向き・距離が変わる(§9-10 / §9-6c の裁定時に片方だけ動く原因にもなる)。',
    ).toMatch(/counterLeapTarget\(undefined, bpcx, bpcy, tcx, tcy, tunables\.thorOrbitDist\)/);
  });

  it('★aiFrom/aiTarget を書く場所が台帳のとおり(複製の既定式が戻ったらここで落ちる)', () => {
    const writes = lines.map(l => l.replace(/\/\/.*$/, '').trim())
      .filter(l => /(aiFromX|aiFromY|aiTargetX|aiTargetY)\s*:/.test(l));
    const unknown = writes.filter(l => !COMBAT_TICK_AI_LEDGER.some(s => s.match.test(l)));
    expect(
      unknown.length,
      'combatTick.ts が台帳に無い形で aiFrom/aiTarget を書いている。'
      + '**既定式の直書きへ戻す**細工(`bpcx + (lx / ll) * … * 0` 等)はここで落ちる。'
      + `\n走査=\n${unknown.join('\n')}`,
    ).toBe(0);
    for (const s of COMBAT_TICK_AI_LEDGER) {
      expect(writes.filter(l => s.match.test(l)).length, `${s.where}: 本数が違う`).toBe(s.count);
    }
    expect(writes.length).toBe(COMBAT_TICK_AI_LEDGER.reduce((a, s) => a + s.count, 0));
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

// =================================================================================================
// ★v0.25.3818(社長裁定 §9-10「等速の線形補間(慣性MUST違反)」=(b)): `issen-dash`(280ms・通常/必中の両方)の位置補間にも慣性を入れた。
// `counterLeapPos` は純関数なので**値**で固定できるが(上の describe)、一閃の補間は
// `useGameLoop.ts` の州の枝に直書きされているので、ここはソース走査で固定する。
// 守りたいのは2つだけ:
//  ① 位置に掛かる `t` が **ease を通っている**(等速へ戻す変異=`airHopEase01(` を外す、で落ちる)
//  ② **当たり判定の帯は `t` を読まない**(=ease を入れてもヒットのタイミング・範囲が動かない証明)
// =================================================================================================
describe('★一閃(issen-dash)の位置補間に慣性が入っている(§9-10「等速の線形補間(慣性MUST違反)」裁定(b)・v0.25.3818)', () => {
  const text = Object.values(LOOP_SOURCES)[0] ?? '';
  const lines = codeLines(text);
  const body = blockAfter(lines, /\} else if \(st === 'issen-dash'\) \{/, /\} else if \(st === 'harai'\) \{/);

  it('useGameLoop.ts の issen-dash の枝を読めている(走査そのものが壊れていない)', () => {
    expect(body.length).toBeGreaterThan(10);
  });

  it('★位置は ease を通した t で補間する(等速へ戻すとここで落ちる)', () => {
    const eased = body.filter(l => /const et = airHopEase01\(t\)/.test(l));
    expect(eased.length, 'issen-dash の枝に `const et = airHopEase01(t)` が無い(=等速に戻っている)').toBe(1);
    const posWrites = body.filter(l => /patch\.(x|y) = \(f[xy] \+ \(t[xy] - f[xy]\) \*/.test(l));
    expect(posWrites.length, 'patch.x / patch.y の補間が2本ではない').toBe(2);
    for (const l of posWrites) {
      expect(l, `位置補間が生の t を掛けている(慣性が抜けている): ${l.trim()}`).toMatch(/\* et\)/);
    }
  });

  it('★当たり判定の帯は t を1つも読まない(=ease を入れても必中の280msのヒットが動かない証明)', () => {
    const band = body.filter(l => /distToBandRect\(/.test(l));
    expect(band.length, 'issen-dash の帯判定が1本ではない').toBe(1);
    // 帯は「焼き付けた始点(fx,fy)→終着点(tx,ty)」で、進行度(t / et)も現在位置(patch.x)も読まない。
    expect(band[0]).toMatch(/\{ x: fx, y: fy \}, \{ x: tx, y: ty \}, HB_TH\.issen\.halfWidth/);
    expect(band[0]).not.toMatch(/\bet\b|\bt\b\s*[*)]/);
  });
});

describe('★§9-9 線ごと平行移動(thorDashLineShift)= 社長裁定2026-08-30 推薦(b)', () => {
  const LINE = { fromX: 0, fromY: 0, toX: 400, toY: 0 };
  const AREA = OPEN_AREA;

  it('滑っていない(実位置=補間位置)なら線は1pxも動かない', () => {
    // t=0.5 の補間位置(smootherstep は対称なので中点)。
    const r = thorDashLineShift(LINE, 200, 0, 0.5, 140, 140, AREA);
    expect(r).toEqual(LINE);
  });

  it('★横へ滑った分だけ**両端**が同じだけ動く(=平行移動。向きと長さが変わらない)', () => {
    // t=0.5 の補間位置は (200,0)。実位置が (200,90) = 真下へ90px滑った。
    const r = thorDashLineShift(LINE, 200, 90, 0.5, 140, 140, AREA);
    expect(r).toEqual({ fromX: 0, fromY: 90, toX: 400, toY: 90 });
    // 向き(from→to)と長さは不変=「線ごと平行移動」であって曲げていない。
    expect(Math.hypot(r.toX - r.fromX, r.toY - r.fromY))
      .toBeCloseTo(Math.hypot(LINE.toX - LINE.fromX, LINE.toY - LINE.fromY), 9);
  });

  it('★進行方向にもズレていれば同じだけ動く(残り距離は保たれる=ワープしない)', () => {
    const r = thorDashLineShift(LINE, 260, 0, 0.5, 140, 140, AREA);
    expect(r).toEqual({ fromX: 60, fromY: 0, toX: 460, toY: 0 });
    // 平行移動後の「今の補間位置」は実位置と一致する=解除の瞬間に戻らない(これが§9-9の目的)。
    const easeHalf = 0.5; // smootherstep(0.5) = 0.5
    expect(r.fromX + (r.toX - r.fromX) * easeHalf).toBe(260);
  });

  it('★自己補正: 一度平行移動したら、同じ実位置では次のフレームに動かない(蓄積しない)', () => {
    const once = thorDashLineShift(LINE, 200, 90, 0.5, 140, 140, AREA);
    const twice = thorDashLineShift(once, 200, 90, 0.5, 140, 140, AREA);
    expect(twice).toEqual(once);
  });

  it('★到達点は「行ける帯」を通す(押し出しで帯の外へ出た線をそのまま走らせない)', () => {
    // 研究所(lab)の帯は上下が ±LAB_CORRIDOR_Y_LIMIT_PX。帯の外へ平行移動しようとすると到達点が止まる。
    const lab = { ...OPEN_AREA, labTheme: true };
    const r = thorDashLineShift(LINE, 200, LAB_Y + 500, 0.5, 140, 140, lab);
    expect(r.toY, '到達点が帯クランプを通っていない').toBe(LAB_Y);
    // 起点は補間のアンカーなので素通し(位置そのものは突進ハンドラが毎フレームクランプする)。
    expect(r.fromY).toBe(LAB_Y + 500);
  });

  it('進捗の端(t=0 / t=1)でも補間位置が起点・到達点に一致する(ズレを作らない)', () => {
    expect(thorDashLineShift(LINE, 0, 0, 0, 140, 140, AREA)).toEqual(LINE);
    expect(thorDashLineShift(LINE, 400, 0, 1, 140, 140, AREA)).toEqual(LINE);
    // 範囲外の t を渡しても内側で 0..1 に丸める(呼び出し側の clamp が消えても暴れない)。
    expect(thorDashLineShift(LINE, 400, 0, 1.8, 140, 140, AREA)).toEqual(LINE);
    expect(thorDashLineShift(LINE, 0, 0, -0.4, 140, 140, AREA)).toEqual(LINE);
  });
});
