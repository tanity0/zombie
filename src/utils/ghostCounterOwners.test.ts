// ★判定時置換ミラー(社長裁定2026-08-27・GHOST_PARITY_LEDGER.md ★仕様v2・監査R2/L4):
// ghostDriver が構える機会州(COUNTER_OPPORTUNITY_STATES)の**全数に消費担当があること**の機械検査。
// v3947〜3962で起きた「積んでも消費されず全滅」(担当の無い州)の再発防止。counterReach.test.ts と
// 同じ流儀=新しい技/州を足すと、この表に担当を書くまでテストが落ちて教える。
import { describe, it, expect } from 'vitest';
import { COUNTER_OPPORTUNITY_STATES } from './counterReach';
import { IMPACT_AT_WINDUP_END_BOSS_STATES, impactAtWindupEnd } from './ghostCounterAim';

/**
 * 州 → 消費担当(GHOST_PARITY_LEDGER.md ★仕様v2「★州→担当の対応表」の写し)。
 *  - hidden-figure : useGameLoop 裏ボスブロック(hiddenReachOverlapNowの守護霊再評価)
 *  - capsule       : applyGhostAllyCapsuleHit(判定時置換・useGameLoopの各州ハンドラ)
 *  - blast         : combatTick の爆風請求消費(着地AoE=pumpkinBlasts)
 *  - bounty-figure : bountyTick カウンターブロック(inCounterReachの守護霊再評価)
 *  - contact       : tryGhostContactParry(接触受け流し・useGameLoopの敵→summon接触)
 *  - angel         : angelBossTick takeGhostAngelCounter(bodyOverlapの守護霊再評価)
 */
const CLAIM_OWNERS: Record<string, string> = {
  // ★検収1巡(中7・実態の注記): dashの到達フレームは競合順序(ボスtick=フレーム頭の座標/接触=移動後の
  // 座標)により**接触受け流しが先に請求を消費**する=実効の主担当はcontact(プレイヤー側も同型の順序)。
  // hidden-figureは「突進の経路上に居るがまだ接触していない」フレームを拾う従担当。
  dash: 'contact(先着)+hidden-figure',
  'thor-dash-move': 'hidden-figure+capsule', // 接触はshouldSkipで除外(フル報酬側=hidden-figureが担当)
  'issen-dash': 'capsule',
  tsuki: 'capsule',
  harai: 'capsule',
  'jump-attack': 'blast+contact',      // 着地AoE=爆風経路+滞空の体当たり=接触受け流し
  'jump-attack-air': 'blast+contact',
  'bm-charge': 'bounty-figure',        // 接触はshouldSkipで除外(フル報酬側=bounty-figureが担当)
  'bm-whip360': 'bounty-figure',
  'mk-spin': 'bounty-figure',
  leap: 'contact',                     // 鋏: プレイヤーも接触受け流しで取る州(v3949)と同型
  'leap-air': 'contact',
  'mdash-move': 'angel',
  tate: 'angel',
  sweep: 'angel',
  downslash: 'angel',
  thrust: 'angel',
  'ring-active': 'angel',
  'ring-spin': 'angel',
};

describe('守護霊カウンター: 機会州の全数に消費担当がある(担当の無い州を作らない)', () => {
  it('COUNTER_OPPORTUNITY_STATES の全州が担当表に載っている', () => {
    for (const st of COUNTER_OPPORTUNITY_STATES) {
      expect(CLAIM_OWNERS[st], `州 '${st}' に消費担当が無い(仕様v2の表とこのテストへ担当を書くこと)`).toBeTruthy();
    }
  });
  it('担当表に機会州リストに無い州が紛れていない(表の腐り防止)', () => {
    for (const st of Object.keys(CLAIM_OWNERS)) {
      expect(COUNTER_OPPORTUNITY_STATES.includes(st), `表の '${st}' は機会州リストに無い`).toBe(true);
    }
  });
});

// ★検収1巡(重2/重3/重5): 着弾逆算(構え)の対象=宣言表の予告だけ、の固定。
// 表の各予告は「終了と同時に始まる判定」があり、その判定の州が担当表に載っていること
// (=積んだ請求を拾う消費口が実在すること)を機械検査する。
describe('着弾逆算の宣言表(IMPACT_AT_WINDUP_END_BOSS_STATES)', () => {
  const FOLLOW_UP: Record<string, string> = {
    'issen-windup': 'issen-dash',
    'tsuki-windup': 'tsuki',
    'harai-windup': 'harai',
    'bm-whip360-windup': 'bm-whip360',
    'mk-spin-windup': 'mk-spin',
  };
  it('表の全予告に「終了と同時の判定州」があり、それが機会州(=担当表の検査対象)に載っている', () => {
    for (const w of IMPACT_AT_WINDUP_END_BOSS_STATES) {
      const follow = FOLLOW_UP[w];
      expect(follow, `予告 '${w}' の後続判定州がこのテストの表に無い`).toBeTruthy();
      expect(COUNTER_OPPORTUNITY_STATES.includes(follow), `後続州 '${follow}' が機会州リストに無い=消費口が無い`).toBe(true);
    }
  });
  it('終わりに着弾しない予告・消費担当の無い予告は表に載せない(早振り/棒立ちの再発防止)', () => {
    // トールjump(着地は+360ms後)/突進(到達に依存)/ミーミルのレーザー(紫=カウンター不可)/
    // idolの全予告(消費担当なし)。載せると重2/重3(検収1巡)がそのまま戻る。
    for (const w of ['jump-windup', 'thor-dash-windup', 'laser-windup',
      'idol-snipe-windup', 'idol-punch-windup', 'idol-nade', 'idol-roll']) {
      expect(impactAtWindupEnd(w), `'${w}' は着弾逆算の対象にしてはいけない`).toBe(false);
    }
  });
});
