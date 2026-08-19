// サブクエストの純関数(research/SUBQUESTS.md テスト節):
// マッチ判定(kind×イベント)・補充(2枠・固定順・クリア済みスキップ)・累計加算・
// hunter-surviveのリセット・★報酬1回きり(達成した枠は判定対象から外れる)。
import { describe, it, expect } from 'vitest';
import {
  applySubquestEvent, subquestNextProgress, refillStageSubquests, toRunEntries,
  emptyStageState, type SubquestEvent, type SubquestKillEvent,
} from './subquests';
import { SUBQUESTS, subquestsForStage, subquestById, SUBQUEST_SLOTS, type SubquestDef } from '../data/subquests';

const def = (id: string): SubquestDef => {
  const d = subquestById(id);
  if (!d) throw new Error(`台帳に無いid: ${id}`);
  return d;
};
const kill = (k: SubquestKillEvent): SubquestEvent => ({ type: 'kill', kill: k });

describe('マッチ判定(kind × イベント)', () => {
  const normal = def('sq-1-1');   // kill-normal 25体
  const blue = def('sq-1-2');     // kill-tier blue 5体
  const rescue = def('sq-1-3');   // rescue 2回
  const bounty = def('sq-1-6');   // miniboss 1体
  const wanted = def('sq-1-7');   // wanted 1体
  const colored = def('sq-3-2');  // kill-colored 10体
  const horde = def('sq-3-5');    // horde-kills 10体
  const rednight = def('sq-3-4'); // rednight-kills 5体
  const lab2 = def('sq-2-2');     // kill-lab Lv2 15体
  const hunter = def('sq-4-3');   // hunter-survive 20秒

  it('kill-normal は「色なし・非ボス・非賞金首・非宿敵」だけ数える', () => {
    expect(subquestNextProgress(normal, 0, kill({}))).toBe(1);
    expect(subquestNextProgress(normal, 0, kill({ colorTier: 'blue' }))).toBe(0);
    expect(subquestNextProgress(normal, 0, kill({ isBoss: true }))).toBe(0);
    expect(subquestNextProgress(normal, 0, kill({ isBounty: true, isBoss: true }))).toBe(0);
    expect(subquestNextProgress(normal, 0, kill({ isNamed: true }))).toBe(0);
  });

  it('kill-tier は指定色のみ / kill-colored は色付きなら何でも', () => {
    expect(subquestNextProgress(blue, 2, kill({ colorTier: 'blue' }))).toBe(3);
    expect(subquestNextProgress(blue, 2, kill({ colorTier: 'red' }))).toBe(2);
    expect(subquestNextProgress(colored, 0, kill({ colorTier: 'red' }))).toBe(1);
    expect(subquestNextProgress(colored, 0, kill({}))).toBe(0);
  });

  it('kill-lab はLv一致のみ', () => {
    expect(subquestNextProgress(lab2, 0, kill({ labLevel: 2 }))).toBe(1);
    expect(subquestNextProgress(lab2, 0, kill({ labLevel: 1 }))).toBe(0);
    expect(subquestNextProgress(lab2, 0, kill({}))).toBe(0);
  });

  it('miniboss=賞金首 / wanted=宿敵', () => {
    expect(subquestNextProgress(bounty, 0, kill({ isBounty: true, isBoss: true }))).toBe(1);
    expect(subquestNextProgress(bounty, 0, kill({ isNamed: true }))).toBe(0);
    expect(subquestNextProgress(wanted, 0, kill({ isNamed: true }))).toBe(1);
    expect(subquestNextProgress(wanted, 0, kill({ isBounty: true }))).toBe(0);
  });

  it('在中系(horde / 紅き夜)は「その最中のキル」なら型を問わず数える', () => {
    expect(subquestNextProgress(horde, 0, kill({ hordeActive: true }))).toBe(1);
    expect(subquestNextProgress(horde, 0, kill({}))).toBe(0);
    expect(subquestNextProgress(rednight, 0, kill({ redNightActive: true, colorTier: 'blue' }))).toBe(1);
    expect(subquestNextProgress(rednight, 0, kill({}))).toBe(0);
  });

  it('★1キルが複数クエストに同時に効いてよい(小14: 重複カウント許容)', () => {
    const ev = kill({ colorTier: 'purple', isNamed: true });
    const res = applySubquestEvent([{ id: 'sq-1-5', progress: 0 }, { id: 'sq-1-7', progress: 0 }], ev);
    // 紫クエは+1、宿敵クエは目標1なので即達成
    expect(res.active.find(e => e.id === 'sq-1-5')?.progress).toBe(1);
    expect(res.clearedNow.map(d => d.id)).toEqual(['sq-1-7']);
  });

  it('救助イベントは rescue だけを進める', () => {
    expect(subquestNextProgress(rescue, 0, { type: 'rescue' })).toBe(1);
    expect(subquestNextProgress(normal, 0, { type: 'rescue' })).toBe(0);
  });

  it('hunter-survive は「連続秒」の絶対値で、キル/救助では動かない', () => {
    expect(subquestNextProgress(hunter, 0, { type: 'hunter-seconds', seconds: 12.9 })).toBe(12);
    expect(subquestNextProgress(hunter, 12, kill({}))).toBe(12);
    expect(subquestNextProgress(hunter, 12, { type: 'rescue' })).toBe(12);
    // 目標を超えても target で頭打ち(達成判定は applySubquestEvent 側)
    expect(subquestNextProgress(hunter, 12, { type: 'hunter-seconds', seconds: 999 })).toBe(hunter.target);
  });

  it('★hunter-survive は追跡が切れたら0へ戻る(累計ではない)', () => {
    const res = applySubquestEvent([{ id: 'sq-4-3', progress: 15 }], { type: 'hunter-seconds', seconds: 0 });
    expect(res.changed).toBe(true);
    expect(res.active[0].progress).toBe(0);
    expect(res.clearedNow).toEqual([]);
  });
});

describe('累計と達成(報酬1回きり)', () => {
  it('キルのたびに累計され、目標に届いた瞬間だけ clearedNow に出る', () => {
    let active = [{ id: 'sq-1-2', progress: 3 }]; // 青5体のうち3体
    let r = applySubquestEvent(active, kill({ colorTier: 'blue' }));
    expect(r.clearedNow).toEqual([]);
    expect(r.active[0].progress).toBe(4);
    active = r.active;
    r = applySubquestEvent(active, kill({ colorTier: 'blue' }));
    expect(r.clearedNow.map(d => d.id)).toEqual(['sq-1-2']);
    // ★達成した枠は active から外れる=以後の判定対象ではない
    expect(r.active).toEqual([]);
  });

  it('★同じクエストで報酬が2度出ない(達成後に同じイベントを流しても clearedNow は空)', () => {
    const first = applySubquestEvent([{ id: 'sq-1-7', progress: 0 }], kill({ isNamed: true }));
    expect(first.clearedNow.length).toBe(1);
    const second = applySubquestEvent(first.active, kill({ isNamed: true }));
    expect(second.clearedNow).toEqual([]);
    expect(second.changed).toBe(false);
  });

  it('進捗が動かないイベントでは changed=false(保存を呼ばない)', () => {
    const r = applySubquestEvent([{ id: 'sq-1-2', progress: 1 }], kill({ colorTier: 'red' }));
    expect(r.changed).toBe(false);
  });

  it('台帳から消えたidは黙って落とす', () => {
    const r = applySubquestEvent([{ id: 'sq-gone', progress: 3 }], kill({}));
    expect(r.changed).toBe(true);
    expect(r.active).toEqual([]);
  });
});

describe('補充(出撃時・2枠・固定順)', () => {
  it('新規は order の先頭2件が入る', () => {
    const next = refillStageSubquests(emptyStageState(), 'stage-1');
    expect(next.active.map(e => e.id)).toEqual(['sq-1-1', 'sq-1-2']);
    expect(next.active.every(e => e.progress === 0)).toBe(true);
    expect(SUBQUEST_SLOTS).toBe(2);
  });

  it('クリア済みは飛ばし、進行中の進捗は保つ(ラン跨ぎの累計)', () => {
    const next = refillStageSubquests(
      { cleared: ['sq-1-1', 'sq-1-2'], active: [{ id: 'sq-1-3', progress: 1 }] },
      'stage-1'
    );
    expect(next.active.map(e => e.id)).toEqual(['sq-1-3', 'sq-1-4']);
    expect(next.active[0].progress).toBe(1); // レスキュー1回ぶんは残る
  });

  it('★hunter-survive の進捗だけは出撃で0へ戻る(連続N秒はラン跨ぎで持ち越さない)', () => {
    const next = refillStageSubquests(
      { cleared: ['sq-4-1', 'sq-4-2'], active: [{ id: 'sq-4-3', progress: 18 }] },
      'stage-4'
    );
    expect(next.active[0].id).toBe('sq-4-3');
    expect(next.active[0].progress).toBe(0);
  });

  it('クリア済みが active に残っていても除去される(達成→次回入れ替え)', () => {
    const next = refillStageSubquests(
      { cleared: ['sq-1-1'], active: [{ id: 'sq-1-1', progress: 25 }, { id: 'sq-1-2', progress: 2 }] },
      'stage-1'
    );
    expect(next.active.map(e => e.id)).toEqual(['sq-1-2', 'sq-1-3']);
  });

  it('プールを全消化したら active は空(=表示ごと消える)', () => {
    const all = subquestsForStage('stage-2').map(d => d.id);
    const next = refillStageSubquests({ cleared: all, active: [] }, 'stage-2');
    expect(next.active).toEqual([]);
    expect(toRunEntries(next.active)).toEqual([]);
  });

  it('台帳の無いステージでは何も補充されない', () => {
    expect(refillStageSubquests(emptyStageState(), 'stage-7').active).toEqual([]);
  });

  it('残り1件しか無ければ1件だけ(枠を無理に埋めない)', () => {
    const ids = subquestsForStage('stage-6').map(d => d.id);
    const next = refillStageSubquests({ cleared: ids.slice(0, ids.length - 1), active: [] }, 'stage-6');
    expect(next.active.map(e => e.id)).toEqual([ids[ids.length - 1]]);
  });
});

describe('表示行の変換', () => {
  it('達成済みは done=true で残り、進捗は target 止まり', () => {
    const rows = toRunEntries([{ id: 'sq-1-1', progress: 999 }], [def('sq-1-2')]);
    expect(rows[0].done).toBe(false);
    expect(rows[0].progress).toBe(def('sq-1-1').target);
    expect(rows[1].done).toBe(true);
    expect(rows[1].progress).toBe(def('sq-1-2').target);
    expect(rows[1].label).toContain(String(def('sq-1-2').target));
  });

  it('台帳の全定義が表示行へ変換できる(labelの差し込み漏れが無い)', () => {
    for (const q of SUBQUESTS) {
      const [row] = toRunEntries([{ id: q.id, progress: 0 }]);
      expect(row.label).not.toContain('{n}');
      expect(row.rewardGold).toBe(q.rewardGold);
    }
  });
});
