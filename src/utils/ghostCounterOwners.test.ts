// ★判定時置換ミラー(社長裁定2026-08-27・GHOST_PARITY_LEDGER.md ★仕様v2・監査R2/L4):
// ghostDriver が構える機会州(COUNTER_OPPORTUNITY_STATES)の**全数に消費担当があること**の機械検査。
// v3947〜3962で起きた「積んでも消費されず全滅」(担当の無い州)の再発防止。counterReach.test.ts と
// 同じ流儀=新しい技/州を足すと、この表に担当を書くまでテストが落ちて教える。
import { describe, it, expect } from 'vitest';
import { COUNTER_OPPORTUNITY_STATES } from './counterReach';

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
  dash: 'hidden-figure+contact',
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
