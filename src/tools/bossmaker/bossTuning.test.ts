import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  registerBossTuning, getBossTuning, getAtPath, setAtPath, clampField, changedPaths,
  resetTuning, formatTuningText, parseTuningText, deepCloneTuning,
  saveTuning, loadTuningDiff, applySavedTuning, clearSavedTuning, tuningDiff,
  getTextAtPath, setTextAtPath, fieldVisible,
  type BossTuningEntry, type TuningField,
} from './bossTuning';
import { registerIdolTuning, addIdolShot, IDOL_TUNING_FIELDS, IDOL_PLAYABLES, VERB_SECTION } from './idolTuning';
import {
  requestIdolMovePlay, requestIdolVerbPlay, idolPlaybackActive, getIdolPlayback, clearIdolPlayback,
  IDOL_WINDUP_STATES, IDOL_RECOVER_STATES,
} from '../../utils/idolTick';
import { IDOL_TUNING, IDOL_TUNING_DEFAULTS, IDOL_SHOT_SLOTS, idolEnabledShots } from '../../utils/idolScript';
import { getEnemyFireProfile } from '../../utils/enemyUtils';
import type { Enemy } from '../../types/game';

const FIELDS: TuningField[] = [
  { path: 'a.b', label: 'AB', group: 'behavior', section: 'S', kind: 'ms', min: 0, max: 1000, step: 50 },
  { path: 'c', label: 'C', group: 'move', section: 'T', kind: 'px', min: 0, max: 100, step: 10 },
];
const makeEntry = (): BossTuningEntry => {
  const table = { a: { b: 100 }, c: 20 };
  return { bossType: 'test', label: 'テスト', table, defaults: deepCloneTuning(table), fields: FIELDS };
};

describe('パス読み書き', () => {
  it('入れ子の数値を読める / 数値でない場所は undefined', () => {
    const e = makeEntry();
    expect(getAtPath(e.table, 'a.b')).toBe(100);
    expect(getAtPath(e.table, 'c')).toBe(20);
    expect(getAtPath(e.table, 'a')).toBeUndefined();
    expect(getAtPath(e.table, 'nope.x')).toBeUndefined();
  });
  it('既存のキーにしか書かない(打ち間違いで新しいキーを生やさない)', () => {
    const e = makeEntry();
    expect(setAtPath(e.table, 'a.b', 7)).toBe(true);
    expect(getAtPath(e.table, 'a.b')).toBe(7);
    expect(setAtPath(e.table, 'a.zzz', 7)).toBe(false);
    expect(setAtPath(e.table, 'nope.x', 7)).toBe(false);
    expect((e.table as { a: Record<string, unknown> }).a.zzz).toBeUndefined();
  });
  it('NaN/Infinity は書かない', () => {
    const e = makeEntry();
    expect(setAtPath(e.table, 'c', Number.NaN)).toBe(false);
    expect(setAtPath(e.table, 'c', Number.POSITIVE_INFINITY)).toBe(false);
    expect(getAtPath(e.table, 'c')).toBe(20);
  });
  it('書き換えは同じ参照の入れ子オブジェクトへ反映される(再exportが効く仕掛けの根拠)', () => {
    const e = makeEntry();
    const nested = (e.table as { a: { b: number } }).a;
    setAtPath(e.table, 'a.b', 55);
    expect(nested.b).toBe(55);
  });
});

describe('clampField / changedPaths / resetTuning', () => {
  it('範囲へ丸める', () => {
    expect(clampField(FIELDS[0], -5)).toBe(0);
    expect(clampField(FIELDS[0], 5000)).toBe(1000);
    expect(clampField(FIELDS[0], 250)).toBe(250);
  });
  it('既定から変わった欄だけ拾う', () => {
    const e = makeEntry();
    expect(changedPaths(e)).toEqual([]);
    setAtPath(e.table, 'c', 30);
    expect(changedPaths(e)).toEqual(['c']);
  });
  it('リセットで既定へ戻る(テーブルの参照は保つ)', () => {
    const e = makeEntry();
    const nested = (e.table as { a: { b: number } }).a;
    setAtPath(e.table, 'a.b', 999);
    setAtPath(e.table, 'c', 99);
    resetTuning(e);
    expect(changedPaths(e)).toEqual([]);
    expect(nested.b).toBe(100); // 同じオブジェクトのまま戻っている
  });
});

describe('コピー → 貼り戻し(受け入れ条件4: 往復できる)', () => {
  it('変更なしのテキストはその旨を含む', () => {
    const e = makeEntry();
    expect(formatTuningText(e, 'v0')).toContain('既定値から変更なし');
  });
  it('変更した欄に * と既定値が付く', () => {
    const e = makeEntry();
    setAtPath(e.table, 'c', 50);
    const txt = formatTuningText(e, 'v0');
    expect(txt).toContain('* C = 50px');
    expect(txt).toContain('既定 20px');
    expect(txt).toContain('  AB = 100ms'); // 変えていない欄は * が付かない
  });
  it('貼り戻すと同じ状態に戻る(往復)', () => {
    const e = makeEntry();
    setAtPath(e.table, 'a.b', 350);
    setAtPath(e.table, 'c', 40);
    const txt = formatTuningText(e, 'v0');
    resetTuning(e);
    expect(changedPaths(e)).toEqual([]);
    const r = parseTuningText(e, txt);
    expect(r.errors).toEqual([]);
    expect(r.applied).toBe(2);
    expect(getAtPath(e.table, 'a.b')).toBe(350);
    expect(getAtPath(e.table, 'c')).toBe(40);
  });
  it('貼り戻しは「既定へ戻してから差分を当てる」=貼る前の余計な変更が残らない', () => {
    const e = makeEntry();
    const txt = formatTuningText(e, 'v0'); // 変更なしの状態をコピー
    setAtPath(e.table, 'c', 90);
    parseTuningText(e, txt);
    expect(changedPaths(e)).toEqual([]);
  });
  it('別のボスのテキストは拒否する', () => {
    const e = makeEntry();
    const other = { ...makeEntry(), bossType: 'other' };
    const r = parseTuningText(e, formatTuningText(other, 'v0'));
    expect(r.applied).toBe(0);
    expect(r.errors[0]).toContain('別のボス');
  });
  it('壊れたテキストは弾く', () => {
    const e = makeEntry();
    expect(parseTuningText(e, 'ただの文章').errors).toHaveLength(1);
  });
  it('貼り戻しでも範囲へ丸める(壊れた数字で壊れない)', () => {
    const e = makeEntry();
    const r = parseTuningText(e, `--- machine (paste-back) ---\n{"boss":"test","changed":{"c":99999}}`);
    expect(r.applied).toBe(1);
    expect(getAtPath(e.table, 'c')).toBe(100);
  });
});

describe('レジストリ + idolのスキーマ', () => {
  beforeEach(() => { registerIdolTuning(); });

  it('idolが登録され、テーブルは実体と同じ参照(画面の変更がゲームへ直に効く)', () => {
    const e = getBossTuning('idol');
    expect(e).toBeDefined();
    expect(e?.table).toBe(IDOL_TUNING as unknown as Record<string, unknown>);
    expect(e?.defaults).toBe(IDOL_TUNING_DEFAULTS as unknown as Record<string, unknown>);
  });

  it('全ての欄がテーブルの実在する数値を指している(スキーマの打ち間違い検知)', () => {
    const bad = IDOL_TUNING_FIELDS.filter(f => getAtPath(IDOL_TUNING, f.path) === undefined);
    expect(bad.map(f => f.path)).toEqual([]);
  });

  it('全ての欄が既定値側にも実在する(差分表示が壊れない)', () => {
    const bad = IDOL_TUNING_FIELDS.filter(f => getAtPath(IDOL_TUNING_DEFAULTS, f.path) === undefined);
    expect(bad.map(f => f.path)).toEqual([]);
  });

  it('欄のパスが重複していない', () => {
    const paths = IDOL_TUNING_FIELDS.map(f => f.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('★スクラブ操作の前提: 全ての欄に刻み幅(step)がある', () => {
    // 社長補足「その場で動かしながら調整」=主操作はドラッグと+−。stepが無い欄は摘まめない。
    const noStep = IDOL_TUNING_FIELDS.filter(f => f.step === undefined || f.step <= 0);
    expect(noStep.map(f => f.path)).toEqual([]);
  });

  it('★刻み幅が範囲に対して細かすぎない(端から端まで200手以内で回せる)', () => {
    const tooFine = IDOL_TUNING_FIELDS.filter(f => {
      if (f.min === undefined || f.max === undefined || !f.step) return false;
      return (f.max - f.min) / f.step > 200;
    });
    expect(tooFine.map(f => `${f.path}(${f.min}〜${f.max} 刻み${f.step})`)).toEqual([]);
  });

  it('既定値が全ての欄の範囲(min/max)の中にある', () => {
    const out = IDOL_TUNING_FIELDS.filter(f => {
      const v = getAtPath(IDOL_TUNING_DEFAULTS, f.path);
      if (v === undefined) return true;
      return (f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max);
    });
    expect(out.map(f => f.path)).toEqual([]);
  });

  it('技6本ぶんの秒数3種(予告/判定/硬直)が漏れなくある', () => {
    for (const m of ['aim', 'fan', 'roll', 'punch', 'snipe', 'orb']) {
      for (const k of ['windup', 'active', 'recover']) {
        expect(IDOL_TUNING_FIELDS.some(f => f.path === `timing.${m}.${k}`), `timing.${m}.${k}`).toBe(true);
      }
    }
  });

  it('idolのコピー→貼り戻しが往復する(実データで)', () => {
    const e = getBossTuning('idol')!;
    setAtPath(e.table, 'timing.snipe.windup', 1500);
    setAtPath(e.table, 'neutralBand.max', 400);
    const txt = formatTuningText(e, 'v0');
    resetTuning(e);
    const r = parseTuningText(e, txt);
    expect(r.errors).toEqual([]);
    expect(getAtPath(e.table, 'timing.snipe.windup')).toBe(1500);
    expect(getAtPath(e.table, 'neutralBand.max')).toBe(400);
    resetTuning(e); // 後片付け
    expect(changedPaths(e)).toEqual([]);
  });
});

describe('registerBossTuning', () => {
  it('登録して引ける / 未登録は undefined', () => {
    registerBossTuning(makeEntry());
    expect(getBossTuning('test')?.label).toBe('テスト');
    expect(getBossTuning('nobody')).toBeUndefined();
  });
});

// ==== 個別再生(社長要望v0.25.2625)。スキーマ駆動であること=UIがボスを知らないこと ====
describe('個別再生: スキーマから生成できる形になっている', () => {
  beforeEach(() => { registerIdolTuning(); clearIdolPlayback(); });

  it('技6本 + 移動語彙4つのボタンが宣言されている', () => {
    const moves = IDOL_PLAYABLES.filter(p => p.kind === 'move').map(p => p.key).sort();
    // 中核6技 + 射撃枠8つ(v0.25.2638)。射撃枠は**足していなければ見出しごと画面に出ない**ので、
    // ここに8つ並んでいても余計なボタンは現れない。
    expect(moves).toEqual([
      'aim', 'fan', 'orb', 'punch', 'roll',
      's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8',
      'snipe',
    ]);
    const verbs = IDOL_PLAYABLES.filter(p => p.kind === 'verb').map(p => p.key).sort();
    expect(verbs).toEqual(['close', 'hold', 'retreat', 'strafe']);
  });

  it('技のボタンは「その技のスキーマ見出し」に紐づく(UIが見出しへ▶を置ける)', () => {
    const sections = new Set(IDOL_TUNING_FIELDS.map(f => f.section));
    for (const p of IDOL_PLAYABLES.filter(x => x.kind === 'move')) {
      expect(sections.has(p.section), `${p.key} の見出し ${p.section} がスキーマに無い`).toBe(true);
    }
  });

  it('移動語彙は専用の見出しにまとまる(欄を持たない再生専用セクション)', () => {
    const verbs = IDOL_PLAYABLES.filter(p => p.kind === 'verb');
    expect(verbs.every(p => p.section === VERB_SECTION)).toBe(true);
    expect(IDOL_TUNING_FIELDS.some(f => f.section === VERB_SECTION)).toBe(false);
  });

  it('レジストリに onPlay / playState が繋がっている', () => {
    const e = getBossTuning('idol');
    expect(typeof e?.onPlay).toBe('function');
    expect(typeof e?.playState).toBe('function');
    expect(e?.playables?.length).toBe(6 + 8 + 4); // 中核6 + 射撃8枠 + 移動語彙4
  });
});

describe('個別再生: 要求箱の振る舞い', () => {
  beforeEach(() => { clearIdolPlayback(); });

  it('技を要求すると「停止中でもtickを進めてよい」状態になる', () => {
    expect(idolPlaybackActive()).toBe(false);
    requestIdolMovePlay('snipe', { solo: true, loop: false });
    expect(idolPlaybackActive()).toBe(true);
  });

  it('移動語彙は同じものを2回押すと解除(トグル)', () => {
    requestIdolVerbPlay('strafe');
    expect(idolPlaybackActive()).toBe(true);
    clearIdolPlayback();
    expect(getIdolPlayback().verb).toBeNull();
  });

  it('clearIdolPlayback で全部消える(ラン開始時のリセット経路)', () => {
    requestIdolMovePlay('orb', { solo: true, loop: true });
    clearIdolPlayback();
    expect(idolPlaybackActive()).toBe(false);
    expect(getIdolPlayback()).toEqual({ verb: null, loop: null });
  });
});

// v0.25.2627(社長報告「これ速さの項目がない」): 狙い撃ち/連射扇の弾速がメーカーに出ていなかった。
// 原因は敵弾の性能が enemyUtils の「11ボス共通の1行」にあり、ボスの数値テーブルに無かったこと。
// v0.25.2628(社長指示「弾速度とか個別にしないと」): **弾は技ごと**。同じ弾を撃つ技どうしでも
// 共通化しない(共通だと技の性格を数字で作り分けられない)。
describe('弾の性能がテーブルに載っている(社長報告「速さの項目がない」)', () => {
  beforeEach(() => { registerIdolTuning(); });

  it('アイドルの弾は enemyUtils の上書きとして登録され、テーブル(aim=型の既定)と同じ参照を指す', () => {
    const e = { type: 'idol' } as unknown as Enemy;
    const profile = getEnemyFireProfile(e);
    expect(profile).toBe(IDOL_TUNING.bullet.aim); // 同一参照=メーカーの変更がその場で効く
  });

  it('既定値は従来の共通行と同値(技ごとに分けても挙動が変わっていない)', () => {
    for (const m of ['aim', 'fan'] as const) {
      expect(IDOL_TUNING.bullet[m].speed, m).toBe(320);
      expect(IDOL_TUNING.bullet[m].damage, m).toBe(20);
      expect(IDOL_TUNING.bullet[m].size, m).toBe(16);
    }
    expect(IDOL_TUNING.bullet.orb.damage).toBe(20);
    expect(IDOL_TUNING.bullet.orb.size).toBe(16);
  });

  it('上書きの無いボスは従来どおりの共通行を返す(他ボスは1バイトも変わらない)', () => {
    const mimir = getEnemyFireProfile({ type: 'mimir' } as unknown as Enemy);
    expect(mimir).toEqual({ interval: 99999, range: 99999, speed: 320, damage: 20, size: 16 });
  });

  it('★掟: 弾の項目は技ごとに分かれている(共通の1組を作らない)', () => {
    const paths = (getBossTuning('idol')?.fields ?? []).map((f: TuningField) => f.path);
    expect(paths).toContain('bullet.aim.speed');
    expect(paths).toContain('bullet.fan.speed');
    // 共通の1組(旧v0.25.2627の形)へ戻していないこと
    expect(paths).not.toContain('bullet.speed');
  });

  it('★弾を撃つ3技(aim/fan/orb)は、同じ並び順で 弾速→弾のダメージ→弾の大きさ を持つ', () => {
    const fields = getBossTuning('idol')?.fields ?? [];
    for (const sec of ['狙い撃ち(aim)', '連射扇(fan)', '追尾弾(orb)']) {
      const labels = fields.filter((f: TuningField) => f.section === sec).map((f: TuningField) => f.label);
      const i = labels.indexOf('弾速');
      expect(i, sec).toBeGreaterThanOrEqual(0);
      expect(labels.slice(i, i + 3), sec).toEqual(['弾速', '弾のダメージ', '弾の大きさ']);
      // 予告/判定/硬直の直後に来る=どの技でも同じ位置
      expect(labels.slice(0, 3), sec).toEqual(['予告', '判定', '硬直']);
    }
  });

  // v0.25.2629(社長報告「射撃線と殴り はそもそもダメージのパラメータがない」)
  it('★掟: 判定を持つ技はすべて自分のダメージを持つ(接触ダメージの流用をしない)', () => {
    const fields = getBossTuning('idol')?.fields ?? [];
    for (const sec of ['至近の殴り(punch)', '狙撃線(snipe)']) {
      const labels = fields.filter((f: TuningField) => f.section === sec).map((f: TuningField) => f.label);
      expect(labels, sec).toContain('ダメージ');
    }
    // 既定は現行の実効値(接触ダメージ30の流用)=欄を足しても挙動は変わらない
    expect(IDOL_TUNING.moveDamage.punch).toBe(30);
    expect(IDOL_TUNING.moveDamage.snipe).toBe(30);
  });

  it('接触ダメージ(stats.damage)は技のダメージとは別物として残る', () => {
    const f = (getBossTuning('idol')?.fields ?? []).find((x: TuningField) => x.path === 'stats.damage');
    expect(f?.label).toBe('接触ダメージ'); // 画面で「技の威力」と区別が付くこと
    expect(f?.section).toBe('基礎値');
  });

  it('弾を撃たない技(roll/punch/snipe)には弾の項目を出さない', () => {
    const fields = getBossTuning('idol')?.fields ?? [];
    for (const sec of ['離脱ローリング(roll)', '至近の殴り(punch)', '狙撃線(snipe)']) {
      const labels = fields.filter((f: TuningField) => f.section === sec).map((f: TuningField) => f.label);
      expect(labels, sec).not.toContain('弾速');
    }
  });
});


// ============================================================================================
// 自動保存(社長要望v0.25.2631「毎回やり直すのは無理」)
//
// ★最重要の掟: **復元は「部屋の中だけ」**。数値テーブルは**本編と同じ実体**なので、
// 部屋を出る時に既定へ戻さないと**社長の調整値が本編のボスに乗る**。
// 「入る=適用 / 出る=リセット」が対になっていることをここで固定する。
// ============================================================================================
describe('自動保存: 部屋の中だけ復元し、出る時は必ず既定へ戻る', () => {
  // node環境には localStorage が無いので最小のスタブを差す(実装は try/catch 済み)。
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as unknown as Storage;
    registerIdolTuning();
    resetTuning(getBossTuning('idol')!);
  });

  const entry = () => getBossTuning('idol')!;

  it('変えた項目だけが保存される(既定と同じ値は保存しない)', () => {
    setAtPath(entry().table, 'timing.aim.windup', 1200);
    saveTuning(entry());
    const diff = loadTuningDiff('idol');
    expect(diff).toEqual({ 'timing.aim.windup': 1200 });
  });

  it('保存 → 既定へ戻す → 適用 で、保存した値が返ってくる(往復)', () => {
    setAtPath(entry().table, 'timing.aim.windup', 1200);
    setAtPath(entry().table, 'bullet.fan.speed', 600);
    saveTuning(entry());

    resetTuning(entry()); // 部屋を出た状態
    expect(getAtPath(entry().table, 'timing.aim.windup')).toBe(IDOL_TUNING_DEFAULTS.timing.aim.windup);

    const applied = applySavedTuning(entry()); // もう一度入った
    expect(applied).toBe(2);
    expect(getAtPath(entry().table, 'timing.aim.windup')).toBe(1200);
    expect(getAtPath(entry().table, 'bullet.fan.speed')).toBe(600);
  });

  it('★掟: 部屋を出たら(resetTuning)本編のテーブルは既定に戻る=調整値が本編へ漏れない', () => {
    setAtPath(entry().table, 'stats.health', 20000);
    setAtPath(entry().table, 'moveDamage.punch', 200);
    saveTuning(entry());

    resetTuning(entry()); // 退室時に BossMakerPanel の useEffect クリーンアップが呼ぶもの

    expect(changedPaths(entry())).toEqual([]);          // 1つも変更が残っていない
    expect(IDOL_TUNING.stats.health).toBe(IDOL_TUNING_DEFAULTS.stats.health);
    expect(IDOL_TUNING.moveDamage.punch).toBe(IDOL_TUNING_DEFAULTS.moveDamage.punch);
    // 保存自体は残る(次に入った時に復元できる)
    expect(loadTuningDiff('idol')).not.toBeNull();
  });

  it('★掟: 適用は必ず「既定へ戻してから」(前回の残りが混ざらない)', () => {
    // 保存には windup だけが入っている状態を作る
    setAtPath(entry().table, 'timing.aim.windup', 1200);
    saveTuning(entry());
    // その後、保存していない別項目を手で汚す(前回の残り相当)
    setAtPath(entry().table, 'timing.fan.windup', 2000);

    applySavedTuning(entry());

    expect(getAtPath(entry().table, 'timing.aim.windup')).toBe(1200);            // 保存ぶんは戻る
    expect(getAtPath(entry().table, 'timing.fan.windup'))
      .toBe(IDOL_TUNING_DEFAULTS.timing.fan.windup);                            // 保存に無い汚れは消える
  });

  it('変更をすべて戻して保存すると、保存キーごと消える(綺麗に空へ)', () => {
    setAtPath(entry().table, 'timing.aim.windup', 1200);
    saveTuning(entry());
    expect(loadTuningDiff('idol')).not.toBeNull();
    resetTuning(entry());
    saveTuning(entry());
    expect(loadTuningDiff('idol')).toBeNull();
  });

  it('保存を消せる(リセットボタン)', () => {
    setAtPath(entry().table, 'timing.aim.windup', 1200);
    saveTuning(entry());
    clearSavedTuning('idol');
    expect(loadTuningDiff('idol')).toBeNull();
    expect(applySavedTuning(entry())).toBe(0);
  });

  it('壊れた保存・知らない項目・範囲外は落ちずに無視/丸められる', () => {
    store.set('bossmaker.tuning.v1.idol', '{ ここは壊れたJSON');
    expect(applySavedTuning(entry())).toBe(0);
    store.set('bossmaker.tuning.v1.idol', JSON.stringify({ 'まだ無い項目': 1, 'timing.aim.windup': 999999 }));
    const applied = applySavedTuning(entry());
    expect(applied).toBe(1); // 知らない項目は無視
    const f = IDOL_TUNING_FIELDS.find(x => x.path === 'timing.aim.windup')!;
    expect(getAtPath(entry().table, 'timing.aim.windup')).toBe(f.max); // 範囲外は丸める
  });

  it('保存の中身は「差分」= 項目が増えても古い保存が壊れない', () => {
    setAtPath(entry().table, 'timing.aim.windup', 1200);
    expect(tuningDiff(entry())).toEqual({ 'timing.aim.windup': 1200 });
  });
});

// ==== 射撃部品まわり(v0.25.2638): 表示条件・名前・「＋技を足す」 ====
describe('表示条件(visibleWhen)と名前欄', () => {
  const makeShotEntry = (): BossTuningEntry => {
    const table = { on: 0, v: 10, name: '' };
    return {
      bossType: 'shot-test', label: 'テスト', table, defaults: deepCloneTuning(table),
      fields: [
        { path: 'on', label: '有効', group: 'move', section: 'S', kind: 'num', min: 0, max: 1, step: 1, visibleWhen: 'on' },
        { path: 'v', label: 'ヒミツ', group: 'move', section: 'S', kind: 'px', min: 0, max: 100, step: 1, visibleWhen: 'on' },
      ],
      textFields: [{ path: 'name', label: '名前', group: 'move', section: 'S', maxLen: 8 }],
    };
  };

  it('0なら隠れ、0以外なら出る(条件が無い欄は常に出る)', () => {
    const e = makeShotEntry();
    expect(fieldVisible(e.table, e.fields[1])).toBe(false);
    setAtPath(e.table, 'on', 1);
    expect(fieldVisible(e.table, e.fields[1])).toBe(true);
    expect(fieldVisible(e.table, { })).toBe(true);
  });

  it('隠れている欄はコピーの平文に出ない(画面と貼り付け文が食い違わない)', () => {
    const e = makeShotEntry();
    expect(formatTuningText(e, 'vX')).not.toContain('ヒミツ');
    setAtPath(e.table, 'on', 1);
    expect(formatTuningText(e, 'vX')).toContain('ヒミツ');
  });

  it('名前は文字として往復する(コピー→貼り戻しで元に戻る)', () => {
    const e = makeShotEntry();
    setAtPath(e.table, 'on', 1);
    setTextAtPath(e.table, 'name', 'ジャブ');
    setAtPath(e.table, 'v', 42);
    const txt = formatTuningText(e, 'vX');
    expect(txt).toContain('ジャブ');

    const e2 = makeShotEntry();
    const r = parseTuningText(e2, txt);
    expect(r.errors).toEqual([]);
    expect(getTextAtPath(e2.table, 'name')).toBe('ジャブ');
    expect(getAtPath(e2.table, 'v')).toBe(42);
    expect(getAtPath(e2.table, 'on')).toBe(1);
  });

  it('名前が既定のままなら機械用に labels を出さない(古い貼り付け文もそのまま読める)', () => {
    const e = makeShotEntry();
    setAtPath(e.table, 'on', 1);
    expect(formatTuningText(e, 'vX')).not.toContain('labels');
    // labels が無い旧形式でもエラーにしない。
    expect(parseTuningText(makeShotEntry(), formatTuningText(e, 'vX')).errors).toEqual([]);
  });

  it('リセットは名前も既定へ戻す(部屋を出た時に名前だけ残らない)', () => {
    const e = makeShotEntry();
    setAtPath(e.table, 'on', 1);
    setTextAtPath(e.table, 'name', 'ジャブ');
    resetTuning(e);
    expect(getAtPath(e.table, 'on')).toBe(0);
    expect(getTextAtPath(e.table, 'name')).toBe('');
  });

  it('文字は「既にキーがある場所」にしか書かない', () => {
    const e = makeShotEntry();
    expect(setTextAtPath(e.table, 'name', 'x')).toBe(true);
    expect(setTextAtPath(e.table, 'nope', 'x')).toBe(false);
    expect(setTextAtPath(e.table, 'v', 'x')).toBe(false); // 数値の場所へ文字を書かない
  });
});

describe('＋技を足す(addIdolShot)', () => {
  beforeEach(() => {
    for (const m of IDOL_SHOT_SLOTS) IDOL_TUNING.shots[m].enabled = IDOL_TUNING_DEFAULTS.shots[m].enabled;
  });
  afterEach(() => {
    for (const m of IDOL_SHOT_SLOTS) IDOL_TUNING.shots[m].enabled = IDOL_TUNING_DEFAULTS.shots[m].enabled;
  });

  it('空いている枠を先頭から1つずつ有効にし、8枠で打ち止め', () => {
    for (let i = 0; i < IDOL_SHOT_SLOTS.length; i++) {
      expect(addIdolShot().ok, `${i + 1}枠目`).toBe(true);
      expect(idolEnabledShots()).toHaveLength(i + 1);
    }
    const over = addIdolShot();
    expect(over.ok).toBe(false);
    expect(over.message).toContain('8');
    expect(idolEnabledShots()).toHaveLength(8);
  });

  it('足した枠の欄がスキーマ上で見えるようになる(＋を押すと画面に現れる)', () => {
    const e = getBossTuning('idol');
    if (!e) throw new Error('idol 未登録');
    const shotFields = e.fields.filter(f => f.path.startsWith('shots.s1.'));
    expect(shotFields.length).toBeGreaterThan(0);
    expect(shotFields.every(f => !fieldVisible(e.table, f))).toBe(true);
    addIdolShot();
    expect(shotFields.every(f => fieldVisible(e.table, f))).toBe(true);
  });

  it('見出しは社長が付けた名前で表示される', () => {
    const e = getBossTuning('idol');
    if (!e) throw new Error('idol 未登録');
    expect(e.sectionLabel?.('射撃枠 s1')).toBe('射撃1(s1)');
    IDOL_TUNING.shotLabels.s1 = 'ジャブ';
    expect(e.sectionLabel?.('射撃枠 s1')).toBe('ジャブ(s1)');
    IDOL_TUNING.shotLabels.s1 = '';
  });
});

describe('射撃枠の州名が漏れなく一覧に入っている(予告/硬直の演出が付く)', () => {
  it('8枠すべての windup / recover が州の一覧にある', () => {
    for (const m of IDOL_SHOT_SLOTS) {
      expect(IDOL_WINDUP_STATES).toContain(`idol-${m}-windup`);
      expect(IDOL_RECOVER_STATES).toContain(`idol-${m}-recover`);
    }
  });
});

// ==== 台本エディタの往復(3便目・v0.25.2642) ====
//
// ★ここが守る一番大事なこと: **部屋を出たら本編の台本が既定へ戻る**。台本はゲームが毎フレーム読む
// 実体なので、戻し忘れると調整中の台本が本編のボスに乗る(数値と同じ事故を台本でも起こさない)。
describe('台本エディタ(BossScriptApi)', () => {
  const api = () => {
    const e = getBossTuning('idol');
    if (!e?.scripts) throw new Error('idol の台本APIが未登録');
    return { e, s: e.scripts };
  };
  afterEach(() => { const { e } = api(); resetTuning(e); });

  it('既定では serialize が null(触っていないことが一目で分かる)', () => {
    const { s } = api();
    expect(s.serialize()).toBeNull();
  });

  it('段に置ける技 = 中核6技 + 有効な射撃枠(2便目と噛み合う)', () => {
    const { s } = api();
    expect(s.moveChoices().map(m => m.key)).toEqual(['aim', 'fan', 'roll', 'punch', 'snipe', 'orb']);
    addIdolShot();
    IDOL_TUNING.shotLabels.s1 = 'ジャブ';
    const after = s.moveChoices();
    expect(after.map(m => m.key)).toContain('s1');
    expect(after.find(m => m.key === 's1')?.label).toBe('ジャブ');
    IDOL_TUNING.shotLabels.s1 = '';
    IDOL_TUNING.shots.s1.enabled = 0;
  });

  it('★「何かの後に撃つジャブ」が画面の操作だけで作れる', () => {
    const { s } = api();
    addIdolShot();                                   // ＋技 → 射撃枠s1
    const si = s.rows().length;
    s.edit({ t: 'addScript' });                      // ＋台本
    s.edit({ t: 'setStep', si, mi: 0, move: 'punch' });   // 1段目=殴り
    s.edit({ t: 'insertStep', si, mi: 0, move: 's1' });   // 2段目=ジャブ
    expect(s.rows()[si].moves.map(m => m.key)).toEqual(['punch', 's1']);
    IDOL_TUNING.shots.s1.enabled = 0;
  });

  it('編集するとゲームが読む配列そのものが変わる(参照が切れない)', () => {
    const { s } = api();
    const live = IDOL_TUNING.strings;
    s.edit({ t: 'setWeight', si: 0, weight: 123 });
    expect(IDOL_TUNING.strings).toBe(live);
    expect(live[0].weight).toBe(123);
    expect(s.serialize()).not.toBeNull();
  });

  it('コピー→貼り戻しで台本まで戻る', () => {
    const { e, s } = api();
    s.edit({ t: 'setWeight', si: 0, weight: 77 });
    s.edit({ t: 'insertStep', si: 0, mi: 0, move: 'snipe' });
    const txt = formatTuningText(e, 'vX');
    expect(txt).toContain('## 台本');
    const before = s.serialize();

    resetTuning(e);
    expect(s.serialize()).toBeNull();          // いったん既定へ
    const r = parseTuningText(e, txt);
    expect(r.errors).toEqual([]);
    expect(s.serialize()).toBe(before);
  });

  it('toggleScript(BOSS_MAKER.md §15)の往復: コピー→貼り戻しでon/offが戻る', () => {
    const { e, s } = api();
    const r = s.edit({ t: 'toggleScript', si: 0 });
    expect(r.ok).toBe(true);
    expect(s.rows()[0].off).toBe(true);
    const txt = formatTuningText(e, 'vX');
    const before = s.serialize();

    resetTuning(e);
    expect(s.rows()[0].off).toBe(false);        // 既定へ戻すとonに戻る
    const p = parseTuningText(e, txt);
    expect(p.errors).toEqual([]);
    expect(s.serialize()).toBe(before);
    expect(s.rows()[0].off).toBe(true);          // 貼り戻すとoffが復元される
  });

  it('★リセットで既定へ戻る(部屋を出た時に本編へ持ち出さない)', () => {
    const { e, s } = api();
    s.edit({ t: 'addScript' });
    s.edit({ t: 'setWeight', si: 0, weight: 0 });
    expect(IDOL_TUNING.strings.length).toBe(IDOL_TUNING_DEFAULTS.strings.length + 1);
    resetTuning(e);
    expect(IDOL_TUNING.strings).toEqual(IDOL_TUNING_DEFAULTS.strings);
  });

  it('最後の1本/1段は消せない(ボスが何もしなくなる状態を作らせない)', () => {
    const { s } = api();
    while (IDOL_TUNING.strings.length > 1) s.edit({ t: 'removeScript', si: 0 });
    expect(s.edit({ t: 'removeScript', si: 0 }).ok).toBe(false);
    while (IDOL_TUNING.strings[0].moves.length > 1) s.edit({ t: 'removeStep', si: 0, mi: 0 });
    expect(s.edit({ t: 'removeStep', si: 0, mi: 0 }).ok).toBe(false);
    expect(IDOL_TUNING.strings[0].moves.length).toBe(1);
  });

  it('フェーズ上限を返す(「書いたのに出ない」段を薄く出すため)', () => {
    const { s } = api();
    expect(s.cutoff()).toEqual({ p1: IDOL_TUNING.stringLen.p1, p2: IDOL_TUNING.stringLen.p2 });
  });

  it('★重みの欄は数値スキーマから消えている(添字パスのズレ事故の再発防止)', () => {
    // 旧実装は `strings.0.weight` のように**添字**でパスを作っていたので、台本を1本消すと
    // 以降の重みが1つずつ手前の台本に化けていた。台本が可変になった以上、添字パスは持たない。
    expect(IDOL_TUNING_FIELDS.some(f => f.path.startsWith('strings.'))).toBe(false);
  });
});

// ==== ヘルプ(§14)の宛先が実在すること ====
//
// ★この機能そのものが「説明があるのに見えていなかった」事故の後始末なので、
// **説明の宛先が実在しない**(= またしても見えない)を機械で潰しておく。
// 節の見出し文字列は `MOVE_LABEL`(例 '至近の殴り(punch)')が正で、
// うっかり短い名前で書くと**そのセクションだけ永遠に説明が出ない**。
describe('節の説明(sectionHelp)の宛先', () => {
  it('★説明のキーが全部、実在する見出しである(出ない説明を作らない)', () => {
    const e = getBossTuning('idol');
    if (!e?.sectionHelp) throw new Error('idol の sectionHelp が未登録');
    const real = new Set<string>([
      ...e.fields.map(f => f.section),
      ...(e.textFields ?? []).map(f => f.section),
      ...(e.playables ?? []).map(p => p.section),
      '台本',   // 台本エディタは fields を持たない専用の節
    ]);
    const dead = Object.keys(e.sectionHelp).filter(k => !real.has(k));
    expect(dead, `実在しない見出しへの説明: ${dead.join(', ')}`).toEqual([]);
  });

  it('説明が空文字でない(キーだけ作って中身を忘れない)', () => {
    const e = getBossTuning('idol');
    for (const [k, v] of Object.entries(e?.sectionHelp ?? {})) {
      expect(v.trim().length, `${k} の説明が空`).toBeGreaterThan(0);
    }
  });
});
