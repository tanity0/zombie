// 訓練(M0)「移動」チュートリアルの発火条件。**M0は毎出撃で出る**(社長指示v0.25.2266)ことと、
// 台帳(src/data/tutorials.ts)の体裁を固定する。
import { describe, it, expect } from 'vitest';
import { shouldShowMoveTutorial, M0_MOVE_TUTORIAL_AT_MS, nextM0Beat, m0AdvanceLimit, M0_BEATS, M0_PRACTICE_COUNT, type M0Beat } from './m0Tutorial';
import { AREA_THRESHOLDS } from './enemyUtils';
import { TUTORIAL_MOVE_X_MIN_PX, COUNTER_WINDOW, COUNTER_COOLDOWN } from '../store/gameStore';
import { TUTORIALS, getTutorial } from '../data/tutorials';

const OPEN = { shownThisRun: false, popupOpen: false, menuOpen: false };

describe('shouldShowMoveTutorial', () => {
  it('待ち時間を過ぎたら出す', () => {
    expect(shouldShowMoveTutorial({ ...OPEN, gameTimeMs: M0_MOVE_TUTORIAL_AT_MS })).toBe(true);
  });

  it('待ち時間の前は出さない(開幕の登場演出とぶつけない)', () => {
    expect(shouldShowMoveTutorial({ ...OPEN, gameTimeMs: M0_MOVE_TUTORIAL_AT_MS - 1 })).toBe(false);
  });

  // **M0はチュートリアルステージなので毎出撃で出す**(社長指示v0.25.2266)。
  // 見るのは「この出撃で出したか」だけで、端末の既読(zombie:tutorialsSeen)は見ない。
  // v0.25.2264で端末既読ゲートを入れたのは取り違えだった。この2件がその撤回を固定する。
  it('同じ出撃で2回目は出さない(連発防止)', () => {
    expect(shouldShowMoveTutorial({ ...OPEN, shownThisRun: true, gameTimeMs: 9999 })).toBe(false);
  });

  it('端末で表示済みでも次の出撃では出る(M0は毎回)', () => {
    // 端末既読は引数に無い=そもそも参照しない設計。新しい出撃では shownThisRun=false から始まる。
    expect(shouldShowMoveTutorial({ ...OPEN, gameTimeMs: 9999 })).toBe(true);
  });

  it('他ポップアップ/メニューが開いている間は出さない(UIを重ねない)', () => {
    expect(shouldShowMoveTutorial({ ...OPEN, popupOpen: true, gameTimeMs: 9999 })).toBe(false);
    expect(shouldShowMoveTutorial({ ...OPEN, menuOpen: true, gameTimeMs: 9999 })).toBe(false);
  });
});

// CLAUDE.md「チュートリアルの作り方」= 本文台帳が唯一の出どころ。全件がその形を満たすことを機械化する。
describe('台帳の体裁(全チュートリアル共通)', () => {
  it('全件に題・本文・出典があり、idが重複しない', () => {
    for (const t of TUTORIALS) {
      expect(t.title.length, t.id).toBeGreaterThan(0);
      expect(t.lines.length, t.id).toBeGreaterThan(0);
      expect(t.where.length, t.id).toBeGreaterThan(0);
    }
    expect(new Set(TUTORIALS.map(t => t.id)).size).toBe(TUTORIALS.length);
  });

  // 手本(img)は原則必須。**手本待ち**のものだけをここに明示列挙する(黙って抜けないように)。
  // 'detour-poi'(寄り道POI・§6.24-UX 裁定c): 実機収録は後日社長が用意する取り決めなので、
  // 当面はテキストのみで成立する構成。手本が入ったらこの配列から外すこと。
  const AWAITING_SAMPLE: string[] = ['detour-poi', 'stage1-guide'];
  it('全件に手本(img)が付いている(手本待ちの明示列挙を除く)', () => {
    for (const t of TUTORIALS) {
      if (AWAITING_SAMPLE.includes(t.id)) continue;
      expect(t.img, `${t.id} に手本が無い`).toBeTruthy();
    }
  });

  // 「本文に数値を書かない」(後でバランス調整した時に文面が嘘にならないようにする)。
  // px/秒/m などの単位つき数値が本文に混ざっていないことを見る。
  it('本文に単位つきの数値を書いていない', () => {
    for (const t of TUTORIALS) {
      const body = t.lines.join('');
      expect(body, `${t.id} の本文に数値がある`).not.toMatch(/\d+\s*(px|ピクセル|秒|ms|m)\b/);
    }
  });

  it('移動チュートリアルは台帳から引ける', () => {
    expect(getTutorial('move')?.title).toBe('移動');
  });
});

// --- 教習ビート(TUTORIAL_STAGE.md「M0 チュートリアル進行案」・社長裁定v0.25.2286〜2291) ---
const beatGate = (over: Partial<Parameters<typeof nextM0Beat>[0]> = {}): Parameters<typeof nextM0Beat>[0] => ({
  playerX: 0, playerLevel: 1, popupOpen: false, menuOpen: false,
  // 既定=「会話が終わり、台本の敵は片付いている」状態。位置ビートの検査をこれで邪魔しない。
  convoDone: true, scriptedEnemyAlive: false, scriptedWaveRemaining: 0,
  fired: new Set<M0Beat>(), ...over,
});

describe('nextM0Beat(教習ビートの発火)', () => {
  it('開幕の会話が終わるまでは何も出さない(会話→戦闘を途切れさせない)', () => {
    expect(nextM0Beat(beatGate({ convoDone: false }))).toBeNull();
  });

  it('会話が終わっても、関門まで歩かないと射撃は始まらない(倒した直後に次が来ない=一拍)', () => {
    expect(nextM0Beat(beatGate({ playerX: 0, convoDone: true }))).toBeNull();
    expect(nextM0Beat(beatGate({ playerX: 800, convoDone: true }))?.id).toBe('shoot');
  });

  // 1体ずつ出すので、倒した直後は一瞬「敵0体」になる。そこで次のビートを出してしまうと
  // 練習が1体で打ち切られる(社長指示v0.25.2300「3体ずつ・一気に出さずに順番に」)。
  it('練習の残りがある間は、敵0体の一瞬でも次へ進まない', () => {
    const fired = new Set<M0Beat>(['shoot']);
    expect(nextM0Beat(beatGate({ playerX: 1000, fired, scriptedEnemyAlive: false, scriptedWaveRemaining: 2 }))).toBeNull();
    expect(nextM0Beat(beatGate({ playerX: 1000, fired, scriptedEnemyAlive: false, scriptedWaveRemaining: 0 }))?.id).toBe('melee');
  });

  it('台本の敵が生きている間は次(近接)へ進まない', () => {
    const fired = new Set<M0Beat>(['shoot']);
    expect(nextM0Beat(beatGate({ playerX: 1000, fired, scriptedEnemyAlive: true }))).toBeNull();
    expect(nextM0Beat(beatGate({ playerX: 1000, fired, scriptedEnemyAlive: false }))?.id).toBe('melee');
  });

  it('順に進めば定義順に出る', () => {
    const fired = new Set<M0Beat>();
    const order: M0Beat[] = [];
    for (const playerX of [800, 1000, 1150, 1300, 1450, 1500, 3000, 3160]) {
      const beat = nextM0Beat(beatGate({ playerX, fired }));
      if (beat) { order.push(beat.id); fired.add(beat.id); }
    }
    expect(order).toEqual(['shoot', 'melee', 'crit', 'finish', 'counter', 'area', 'hunter', 'ammo']);
  });

  it('ポップアップ/メニューが開いている間は出さない(重ねない)', () => {
    expect(nextM0Beat(beatGate({ playerX: 800, popupOpen: true }))).toBeNull();
    expect(nextM0Beat(beatGate({ playerX: 800, menuOpen: true }))).toBeNull();
  });

  it('一度出したビートは二度と出さない', () => {
    expect(nextM0Beat(beatGate({ playerX: 1000, fired: new Set<M0Beat>(['shoot']) }))?.id).not.toBe('shoot');
  });

  it('走り抜けて複数が同時に条件を満たしても、定義順に1つずつ出る', () => {
    const fired = new Set<M0Beat>();
    const order: M0Beat[] = [];
    for (let i = 0; i < 10; i++) {
      const beat = nextM0Beat(beatGate({ playerX: 3200, fired })); // いきなり最奥(クリ未解禁)
      if (!beat) break;
      order.push(beat.id); fired.add(beat.id);
    }
    expect(order).toEqual(['shoot', 'melee', 'crit', 'finish', 'counter', 'area', 'hunter', 'ammo']);
  });

  // 社長指摘v0.25.2314「攻撃、近接、クリティカル、キル、カウンターが畳み掛けすぎ。
  // 一個ずつ丁寧に終わらせてから次に行って」。5本とも自分の関門と自分の練習を持つ。
  it('5つの教習はそれぞれ別の場所・別の練習(畳み掛けない)', () => {
    for (const id of ['shoot', 'melee', 'crit', 'finish', 'counter'] as const) {
      const b = M0_BEATS.find(x => x.id === id)!;
      expect(b.gateX, `${id} に関門が無い`).toBeDefined();
      expect(b.spawn, `${id} に練習の敵が無い`).toBeDefined();
    }
    const gates = M0_BEATS.filter(b => b.gateX !== undefined).map(b => b.gateX!);
    expect(new Set(gates).size, '関門が同じ場所に重なっている').toBe(gates.length);
  });

  it('教習は前の教習を片付けてから始まる(鎖でつないである)', () => {
    expect(M0_BEATS.find(b => b.id === 'melee')!.requires).toBe('shoot');
    expect(M0_BEATS.find(b => b.id === 'crit')!.requires).toBe('melee');
    expect(M0_BEATS.find(b => b.id === 'finish')!.requires).toBe('crit');
    expect(M0_BEATS.find(b => b.id === 'counter')!.requires).toBe('finish');
    for (const id of ['crit', 'finish', 'counter'] as const) {
      expect(M0_BEATS.find(b => b.id === id)!.afterEnemyCleared, id).toBe(true);
    }
  });

  it('近接教習ではクリが出ない/クリ・キル教習では出る(体力と演習で作り分ける)', () => {
    const melee = M0_BEATS.find(b => b.id === 'melee')!;
    expect(melee.critDrill).toBeUndefined();
    expect(melee.spawn!.meleeHits!).toBeLessThan(3); // 3発目(クリ)へ届く前に落ちる
    for (const id of ['crit', 'finish'] as const) {
      const b = M0_BEATS.find(x => x.id === id)!;
      expect(b.critDrill, id).toBe(true);
      expect(b.spawn!.meleeHits!, id).toBeGreaterThan(3); // クリの後も生きていて仕留められる
    }
  });

  // 卵が先か鶏が先か: 説明の発火条件を「クリが出たら」にすると**敵が湧く前にクリ待ち**になり、
  // その教習が永久に始まらない(関門も残るのでソフトロック)。ビートは関門で始めて敵を出し、
  // **説明だけ**を後ろへずらす。
  it('クリ教習は関門で始まり、説明だけを後回しにする(クリ待ちで止まらない)', () => {
    const crit = M0_BEATS.find(b => b.id === 'crit')!;
    expect(crit.popupAfterCrit).toBe(true);
    const fired = new Set<M0Beat>(['shoot', 'melee']);
    expect(nextM0Beat(beatGate({ playerX: crit.gateX!, fired }))?.id).toBe('crit');
  });

  it('レベルが上がったら成長を出す(位置ではなく成長で決まる)', () => {
    const fired = new Set<M0Beat>(['shoot', 'melee', 'crit', 'finish', 'counter']);
    expect(nextM0Beat(beatGate({ playerX: 1300, playerLevel: 2, fired }))?.id).toBe('levelup');
  });

  // ここが本命の網。敵を倒さずに走り抜けるとレベルが上がらないので、levelup が未発火のまま
  // 後続を塞ぐと area/hunter/ammo が二度と出ない(=チュートリアルが進行不能になる)。
  it('レベルが上がらないまま奥へ行っても、後続(区域/ハンター/弾薬)が塞がれない', () => {
    const fired = new Set<M0Beat>(['shoot', 'melee', 'crit', 'finish', 'counter']);
    expect(nextM0Beat(beatGate({ playerX: 1500, playerLevel: 1, fired }))?.id).toBe('area');
    fired.add('area');
    expect(nextM0Beat(beatGate({ playerX: 3000, playerLevel: 1, fired }))?.id).toBe('hunter');
    fired.add('hunter');
    expect(nextM0Beat(beatGate({ playerX: 3160, playerLevel: 1, fired }))?.id).toBe('ammo');
  });

  it('デンジャーまで来たら成長は見送る(今さら落ち着いた説明を割り込ませない)', () => {
    const fired = new Set<M0Beat>(['shoot', 'melee', 'crit', 'finish', 'counter', 'area']);
    expect(nextM0Beat(beatGate({ playerX: 3000, playerLevel: 2, fired }))?.id).toBe('hunter');
  });
});

describe('M0_BEATS の不変条件', () => {
  it('全ビートの本文が台帳にある(idの綴り違いをここで殺す)', () => {
    for (const b of M0_BEATS) expect(getTutorial(b.tutorial), b.id).toBeTruthy();
  });

  it('近接は必ず近接ビートで解禁される(それまで振れない=社長指示v0.25.2293の封印)', () => {
    expect(M0_BEATS.find(b => b.id === 'melee')!.unlock).toBe('melee');
    // 近接より前のビートで解禁してしまうと、教わる前に振れてしまう。
    const meleeIdx = M0_BEATS.findIndex(b => b.id === 'melee');
    for (let i = 0; i < meleeIdx; i++) expect(M0_BEATS[i].unlock, M0_BEATS[i].id).toBeUndefined();
  });

  it('射撃と近接には掛け声が付いている(説明より先に、状況の理由を言う)', () => {
    for (const id of ['shoot', 'melee'] as const) {
      expect(M0_BEATS.find(b => b.id === id)!.callouts?.length, id).toBeGreaterThan(0);
    }
  });

  it('位置ビートのxは単調増加(一本道で順に踏める)', () => {
    const xs = M0_BEATS.filter(b => b.atX !== undefined).map(b => b.atX!);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
  });

  // ここがズレると「区域が変わる」と言った瞬間に区域が変わらない(=説明が嘘になる)。
  it('区域の説明は「研究」入場、ハンターは「デンジャー」入場と一致する', () => {
    expect(M0_BEATS.find(b => b.id === 'area')!.atX).toBe(AREA_THRESHOLDS[0]);
    expect(M0_BEATS.find(b => b.id === 'hunter')!.atX).toBe(AREA_THRESHOLDS[1]);
  });

  // レベルは「敵を倒さなければ永久に上がらない」=条件が満たされないまま残りうる唯一の型。
  // 会話の終了・敵の掃討は必ず起きるので見送りxは要らない。
  it('レベルだけで決まるビートには必ず見送りxがある(後続を永久に塞がない)', () => {
    for (const b of M0_BEATS) {
      if (b.atLevel !== undefined && b.atX === undefined) expect(b.expireAfterX, b.id).toBeDefined();
    }
  });

  // 前提が無いと afterEnemyCleared が開幕(敵0体)で即成立し、近接が射撃を追い越す。
  it('「前の結果で始まる」ビートには前提ビートがある', () => {
    for (const b of M0_BEATS) {
      if (b.afterEnemyCleared) expect(b.requires, b.id).toBeDefined();
    }
  });

  it('封印を解くビートより先に、それを使う教習が出ない(近接を使う教習は近接の後)', () => {
    const idx = (id: M0Beat) => M0_BEATS.findIndex(b => b.id === id);
    for (const id of ['crit', 'finish', 'counter'] as const) {
      expect(idx(id), id).toBeGreaterThan(idx('melee'));
    }
  });

  it('練習を伴う教習は複数体(既定3体)を順に出す', () => {
    for (const id of ['shoot', 'melee', 'counter'] as const) {
      const b = M0_BEATS.find(x => x.id === id)!;
      expect(b.spawn, id).toBeDefined();
      expect(b.spawn!.count ?? M0_PRACTICE_COUNT, id).toBeGreaterThanOrEqual(3);
    }
  });

  // 社長指摘v0.25.2299「近接フィニッシュとカウンターがごっちゃになってる」。
  // ここを機械化しておかないと、文章の直しが失われたことに気づけない(実際 v0.25.2299 の
  // 本文修正はファイルに入っておらず、混ざったままの文が残っていた)。
  it('カウンターの本文にフィニッシュの内容(気絶・一撃)を混ぜない', () => {
    const body = getTutorial('m0-counter')!.lines.join('');
    expect(body).not.toMatch(/気絶|一撃|仕留/);
    expect(body).toMatch(/弾/); // 弾き返しの話であること
  });

  it('フィニッシュ/クリティカルの本文に弾き返しの内容を混ぜない', () => {
    for (const id of ['m0-finish', 'm0-crit'] as const) {
      expect(getTutorial(id)!.lines.join(''), id).not.toMatch(/弾き返|撃ち抜/);
    }
  });

  it('カウンターとフィニッシュは別の手本を使う(同じ動画を指さない)', () => {
    expect(getTutorial('m0-counter')!.img).not.toBe(getTutorial('m0-finish')!.img);
  });

  it('カウンターの相手は遠距離型(弾が飛んでこないと弾き返す教習にならない)', () => {
    expect(M0_BEATS.find(b => b.id === 'counter')!.spawn!.type).toBe('plant');
  });

  it('カウンターは近接より後(敵の攻撃モーションを一度見せてから教える)', () => {
    const idx = (id: M0Beat) => M0_BEATS.findIndex(b => b.id === id);
    expect(idx('shoot')).toBeLessThan(idx('melee'));
    expect(idx('melee')).toBeLessThan(idx('counter'));
  });
});

describe('m0AdvanceLimit(関門=ここより先へ進めない前線)', () => {
  it('未発火のうち最初の関門を返す。全部済めば制限なし', () => {
    expect(m0AdvanceLimit(new Set(), false)).toBe(800);
    expect(m0AdvanceLimit(new Set<M0Beat>(['shoot']), false)).toBe(1000);
    expect(m0AdvanceLimit(new Set<M0Beat>(['shoot', 'melee']), false)).toBe(1150);
    expect(m0AdvanceLimit(new Set<M0Beat>(['shoot', 'melee', 'crit']), false)).toBe(1300);
    expect(m0AdvanceLimit(new Set<M0Beat>(['shoot', 'melee', 'crit', 'finish']), false)).toBe(1450);
    expect(m0AdvanceLimit(new Set<M0Beat>(['shoot', 'melee', 'crit', 'finish', 'counter']), false)).toBeNull();
  });

  // 社長報告v0.25.2301「最初の移動チュートリアルの移動できる範囲が狭すぎる」。
  // 最初の関門は「開幕の会話が流れ切るまで歩ける距離」が要る。近すぎると会話中に壁で足踏みになる。
  it('最初の関門は左端から十分離れている(会話中に壁へ当たらない)', () => {
    expect(m0AdvanceLimit(new Set(), false)! - TUTORIAL_MOVE_X_MIN_PX).toBeGreaterThanOrEqual(800);
  });

  // 区域の説明より先に戦闘教習を終わらせる(順序が逆になると「奥は危険」の回収が壊れる)。
  it('関門は全て区域境界(1500)より手前にある', () => {
    for (const b of M0_BEATS) {
      if (b.gateX !== undefined) expect(b.gateX, b.id).toBeLessThan(AREA_THRESHOLDS[0]);
    }
  });

  // 社長指摘v0.25.2305「近接チュートリアル、移動可能距離が短すぎる」。
  // 関門の役目は「戦う前に先へ行かせない」ことであって、戦闘中に狭い箱へ閉じ込めることではない。
  it('戦闘中(練習の敵が居る間)は壁を外す=自由に動ける', () => {
    expect(m0AdvanceLimit(new Set<M0Beat>(['shoot']), true)).toBeNull();
    expect(m0AdvanceLimit(new Set<M0Beat>(['shoot']), false)).not.toBeNull();
  });

  // 壁が外れている間に先へ走られても、順序が壊れないこと(鎖=requires で塞いである)。
  it('壁が無い状態で最奥へ走っても、前のビートが済むまで先のビートは出ない', () => {
    const fired = new Set<M0Beat>(['shoot']);           // 近接がまだ
    for (const id of ['area', 'hunter', 'ammo'] as const) {
      const b = M0_BEATS.find(x => x.id === id)!;
      expect(b.requires, id).toBeDefined();
    }
    // 最奥(3200)に居ても、練習中(敵が生きている)なら何も出ない。
    expect(nextM0Beat(beatGate({ playerX: 3200, fired, scriptedEnemyAlive: true }))).toBeNull();
  });

  // 社長指摘v0.25.2307「クリティカル演出出る前にチュートリアルポップアップでちゃってる」。
  // 待ちは「演出が出切る」と「次の一振りが出る前」の間に挟まっている必要がある。
  // 上限を割ると、崩した相手をフィニッシュで倒してから「崩れた相手にもう一度近接」と説明する羽目になる。
  it('クリティカルの説明は、演出の後・次の近接が出せるより前に出す', () => {
    const d = M0_BEATS.find(b => b.id === 'crit')!.delayMs!;
    expect(d).toBeGreaterThanOrEqual(520);                          // クリの演出(数字/リング)が出切る
    expect(d).toBeLessThan(COUNTER_WINDOW + COUNTER_COOLDOWN);      // 次の近接(820ms)より前
  });

  it('関門は単調増加(戻る前線を作らない)', () => {
    const gates = M0_BEATS.filter(b => b.gateX !== undefined).map(b => b.gateX!);
    for (let i = 1; i < gates.length; i++) expect(gates[i]).toBeGreaterThan(gates[i - 1]);
  });

  // 関門つきビートの前提が「出ないことがありうるビート」だと、壁が永久に残ってソフトロックする。
  it('関門つきビートの前提は、関門つきビート(=必ず順に消化される)だけ', () => {
    const gated = new Set(M0_BEATS.filter(b => b.gateX !== undefined).map(b => b.id));
    for (const b of M0_BEATS) {
      if (b.gateX !== undefined && b.requires) expect(gated.has(b.requires), b.id).toBe(true);
    }
  });

  it('クリティカルが一度も出なくても全ての関門を通過できる(ソフトロックしない)', () => {
    const fired = new Set<M0Beat>();
    for (let i = 0; i < 12; i++) {
      const limit = m0AdvanceLimit(fired, false);
      if (limit === null) break;
      const beat = nextM0Beat(beatGate({ playerX: limit, fired, scriptedEnemyAlive: false }));
      if (!beat) throw new Error(`関門 ${limit} で進めなくなった(発火できるビートが無い)`);
      fired.add(beat.id);
    }
    expect(m0AdvanceLimit(fired, false)).toBeNull();
  });
});

// 社長指示v0.25.2319: 弾を拾う教習(id:'ammo')に来るまで、ランダムな弾薬ドロップは出さない。
// 偶然の拾得で弾が増えると「弾が尽きたから近接へ切り替える」という台本の筋が壊れるため、
// 解禁は必ずこのビートに紐づける(=台本の順序そのものを不変条件として固定する)。
describe('M0 弾薬ドロップの解禁(社長指示v0.25.2319)', () => {
  it("解禁ビートは 'ammo' ただ1つ", () => {
    const unlockers = M0_BEATS.filter(b => b.unlock === 'ammo');
    expect(unlockers.map(b => b.id)).toEqual(['ammo']);
  });

  it('射撃・近接の教習は弾薬解禁より前にある(弾が尽きる筋を偶然に壊されない)', () => {
    const idx = (id: M0Beat) => M0_BEATS.findIndex(b => b.id === id);
    const ammoIdx = idx('ammo');
    expect(ammoIdx).toBeGreaterThan(-1);
    for (const before of ['shoot', 'melee', 'finish', 'counter'] as M0Beat[]) {
      const i = idx(before);
      if (i === -1) continue; // 台本から消えた要素は不問(存在する時だけ順序を縛る)
      expect(i, `${before} は ammo より前`).toBeLessThan(ammoIdx);
    }
  });
});
