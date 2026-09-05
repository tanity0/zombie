import { isTrueBossType, isBossType, isBiteExemptType } from './enemyUtils';
import { describe, it, expect } from 'vitest';
import {
  BITE_DEFAULT, BITE_BY_TYPE, biteSpecFor, bitePhaseOf, biteProgress,
  biteLungeFrac, bitePointFrom, biteReachRect, isInBiteRect, isBiteSubject,
  biteWallRect, BITE_WALL_W, BITE_WALL_H, isBiteWallOpen, biteBodyOverlapsPlayer, canStartBite,
  isBiteInterruptedByMove, isBodySlamNow, isBiteFrozen, biteBlinkOn,
  BITE_BOSS_RECOVER_MS,
} from './enemyBite';
import type { Enemy } from '../types/game';

// ★全敵共通の噛みつき(PACING_PUZZLE.md §12)の不変条件。
// 守るのは3つ。どれか1つでも崩れると文法が壊れる:
//  1. 発火の30pxと判定の30pxは**同じ1つの数**(社長「あくまで当たり判定は30px範囲ね」)。
//  2. 判定は**予告した点**で取り、敵の実位置は見ない(壁際で赤と判定がズレない)。
//  3. 踏み込みは**絵**であって判定を伸ばさない。
const at = (biteAt: number | undefined): Pick<Enemy, 'type' | 'biteAt'> =>
  ({ type: 'zombie', biteAt } as Pick<Enemy, 'type' | 'biteAt'>);

describe('噛みつきの台帳', () => {
  it('社長指定の叩き台がそのまま入っている(30px / 300ms / 200ms / 踏み込み30px)', () => {
    expect(BITE_DEFAULT.rangePx).toBe(30);
    expect(BITE_DEFAULT.windupMs).toBe(300);
    expect(BITE_DEFAULT.biteMs).toBe(200);
    expect(BITE_DEFAULT.lungePx).toBe(30); // 社長裁定2026-08-25「30PX移動してくる」(旧20px)
    expect(BITE_DEFAULT.windupMs + BITE_DEFAULT.biteMs).toBe(500); // 社長「500msかけて」
  });

  it('★紫=カウンター不可(社長裁定2026-08-25「噛みつきはやはり紫にする」)', () => {
    // 当初は条件付きの赤(「あまりに簡単になったら紫にする」)。その条件が引かれた。
    // ★判定と絵の点滅色は必ず一対。ここを true に戻す時は pixiScene の biteTint も赤へ戻すこと。
    expect(BITE_DEFAULT.counterable).toBe(false);
  });

  it('今は全敵が既定値(敵ごとの上書きは空)=調整はこの表へ足していく', () => {
    expect(Object.keys(BITE_BY_TYPE)).toEqual([]);
    expect(biteSpecFor('zombie')).toEqual(BITE_DEFAULT);
    expect(biteSpecFor('werewolf')).toEqual(BITE_DEFAULT);
  });
});

describe('噛みつきの区間(300ms溜め → 200ms噛み)', () => {
  it('未発火は none / 溜め / 噛み / 終わったら none(境界を固定)', () => {
    expect(bitePhaseOf(at(undefined), 1000)).toBe('none');
    expect(bitePhaseOf(at(0), 1000)).toBe('none');
    // ★v0.25.3932: 溜め300(この中で2回点滅)→ 噛み200 の通し500ms。
    expect(bitePhaseOf(at(1000), 1000)).toBe('windup');   // 0ms
    expect(bitePhaseOf(at(1000), 1299)).toBe('windup');   // 299ms
    expect(bitePhaseOf(at(1000), 1300)).toBe('bite');     // 300ms=噛みへ
    expect(bitePhaseOf(at(1000), 1499)).toBe('bite');     // 499ms
    expect(bitePhaseOf(at(1000), 1500)).toBe('none');     // 500ms=終了
  });

  it('進捗は0..1にクランプされる(赤い点滅と絵の2拍が同じ値を見る)', () => {
    expect(biteProgress(at(1000), 1000)).toBeCloseTo(0);
    expect(biteProgress(at(1000), 1250)).toBeCloseTo(0.5); // 通し500msの半分
    expect(biteProgress(at(1000), 9999)).toBeCloseTo(1);
    expect(biteProgress(at(undefined), 1000)).toBe(0);
  });
});

describe('踏み込みの見た目(★プレイヤーの踏み込みとは逆の形)', () => {
  it('ゆっくり出て、噛む瞬間に伸び切る(溜め終わりで半分・最後に1)', () => {
    expect(biteLungeFrac(at(1000), 1000)).toBeCloseTo(0);
    // 溜めは ease-in: 中間(150ms)ではまだ 1/8 しか出ていない=「じわっと」
    expect(biteLungeFrac(at(1000), 1150)).toBeLessThan(0.2);
    expect(biteLungeFrac(at(1000), 1300)).toBeCloseTo(0.5); // 溜め終わり=半分
    expect(biteLungeFrac(at(1000), 1500)).toBeCloseTo(1);   // 噛み切って伸び切る
  });

  it('★単調増加(引っ込んでから出る、のような不自然な動きをしない)', () => {
    let prev = -1;
    for (let t = 0; t <= 500; t += 10) {
      const f = biteLungeFrac(at(1000), 1000 + t);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
  });
});

describe('★判定の四角(社長2026-08-25「プレイヤーが居る側にだけ30px伸ばす」)', () => {
  const box = { cx: 0, cy: 0, w: 100, h: 50 }; // 社長の例: 100×50 の敵

  it('上にプレイヤーが居れば上へ30px伸び、下左右は伸びない', () => {
    const r = biteReachRect(box, 0, -200, 30);
    expect(r).toEqual({ x: -50, y: -55, w: 100, h: 80 }); // 高さ50→80(上へだけ)
  });

  it('右にプレイヤーが居れば右へだけ伸びる', () => {
    const r = biteReachRect(box, 200, 0, 30);
    expect(r).toEqual({ x: -50, y: -25, w: 130, h: 50 });
  });

  it('左・下も同じ(伸びるのは1辺だけ)', () => {
    expect(biteReachRect(box, -200, 0, 30)).toEqual({ x: -80, y: -25, w: 130, h: 50 });
    expect(biteReachRect(box, 0, 200, 30)).toEqual({ x: -50, y: -25, w: 100, h: 80 });
  });

  it('斜めは寄っている方の軸で決める(|dx| と |dy| の大きい方)', () => {
    expect(biteReachRect(box, 100, 10, 30).w).toBe(130);  // 横寄り=横へ
    expect(biteReachRect(box, 10, 100, 30).h).toBe(80);   // 縦寄り=縦へ
  });

  it('★体の大きい敵ほど自然に遠くまで届く(中心距離ではなく体の縁から測るため)', () => {
    // ゾンビ相当(幅20×高36の帯)と、その2倍の体。どちらも縁から30px先まで届く。
    const small = biteReachRect({ cx: 0, cy: 0, w: 20, h: 36 }, 0, -100, 30);
    const big = biteReachRect({ cx: 0, cy: 0, w: 40, h: 72 }, 0, -100, 30);
    expect(-small.y).toBe(18 + 30);  // 小さい体: 半分の高さ18 + 30
    expect(-big.y).toBe(36 + 30);    // 大きい体: 半分の高さ36 + 30
  });

  // ★v0.25.3912: 判定は**プレイヤーの体(矩形)**が四角に重なるか。中心点ではない
  // (中心点だと「体で押し出される」仕様と食い違い、構造的に一生当たらない)。
  const pl = (cx: number, cy: number) => ({ x: cx - 14, y: cy - 14, width: 28, height: 28 });

  it('★焼いた四角にプレイヤーの体が重なれば当たり、外へ逃げれば空振り(境界を固定)', () => {
    const r = biteReachRect(box, 0, -200, 30);   // 上へ30px伸びた四角(y: -55 〜 +25)
    expect(isInBiteRect(r, pl(0, -68))).toBe(true);  // 体の下端が1px入っている=当たる
    expect(isInBiteRect(r, pl(0, -70))).toBe(false); // 体ごと外=空振り
    expect(isInBiteRect(r, pl(0, 0))).toBe(true);    // 体の中
    expect(isInBiteRect(r, pl(90, -30))).toBe(false); // 横は伸びていないので外
  });

  it('★押し出されて敵に接している時は、必ず攻撃の四角に重なる(「一生当たらない」の再発検知器)', () => {
    // 「通れない箱」=敵の当たり判定そのもの。プレイヤーはそこへ体で押し出されて止まる。
    // その状態(体の右端が敵の左端にちょうど接する)で、攻撃の四角に重なっていること。
    const eb = { x: -50, y: -25, width: 100, height: 50 };
    const pcx = eb.x - 14, pcy = 0;               // 押し出されて接した位置
    const r = biteReachRect({ cx: 0, cy: 0, w: eb.width, h: eb.height }, pcx, pcy, 30);
    expect(isInBiteRect(r, pl(pcx, pcy))).toBe(true);
  });
});

describe('踏み込みの見た目の点(絵だけに使う)', () => {
  it('噛む点=敵の中心からプレイヤー方向へ lungePx だけ進んだ所', () => {
    const p = bitePointFrom(0, 0, 100, 0, 20);
    expect(p.x).toBeCloseTo(20);
    expect(p.y).toBeCloseTo(0);
    // 斜めでも距離は lungePx のまま
    const q = bitePointFrom(0, 0, 100, 100, 20);
    expect(Math.hypot(q.x, q.y)).toBeCloseTo(20);
  });

  it('プレイヤーと同座標なら敵の位置に落とす(0除算で飛ばない)', () => {
    expect(bitePointFrom(50, 50, 50, 50, 20)).toEqual({ x: 50, y: 50 });
  });

  it('踏み込みの点は絵のためのもの(判定はこれを使わない)', () => {
    // 判定は上の四角。ここは「絵がどこまで出るか」を決めるだけ。
    const bp = bitePointFrom(0, 0, 45, 0, 20);
    expect(Math.hypot(bp.x, bp.y)).toBeCloseTo(20);
  });
});

// ★社長報告2026-08-25「ゾンビは相変わらずぶつかるだけで攻撃される」。
// 真因=ゾンビは近接範囲に入ると必ず 'zpause'→'zrush' に入るのに、旧実装は
// 「aiPhase が付いている=技の最中」として噛みつきの対象から外していた
// =**接触ダメージのまま一度も噛みつきに乗らなかった**。
describe('★接近リズム(zpause/zrush)は技ではない=噛みつきの対象(v0.25.3912)', () => {
  const notBoss = () => false;
  const zombie = (aiPhase?: string) => ({
    type: 'zombie' as const, aiPhase, damage: 10, reaperChaser: undefined,
  } as Parameters<typeof isBiteSubject>[0]);

  it('zpause / zrush は噛みつきの対象(=接触ダメージを持たない)', () => {
    expect(isBiteSubject(zombie('zpause'), notBoss)).toBe(true);
    expect(isBiteSubject(zombie('zrush'), notBoss)).toBe(true);
  });

  it('技(突進/飛びかかり)は従来どおり体当たりが本体=対象外', () => {
    expect(isBiteSubject(zombie('charge'), notBoss)).toBe(false);
    expect(isBiteSubject(zombie('jump'), notBoss)).toBe(false);
  });

  it('技を持たない個体は従来どおり対象', () => {
    expect(isBiteSubject(zombie(undefined), notBoss)).toBe(true);
  });
});

// ★社長裁定2026-08-25「攻撃の当たり判定はプレイヤーは歩いて入れる。重なる。(予告線と同じ)
// あくまで、敵を貫通しないための壁判定は固定」。
// v0.25.3912 の失敗=壁を「敵の当たり判定そのもの」にしたため、プレイヤーが攻撃の四角の中に
// 立っていられず「ぶつかりに行かないと当たらない」状態になった。
describe('★壁の箱と攻撃の箱を分ける(v0.25.3913)', () => {
  const small = { x: 0, y: 0, width: 36, height: 36 };   // ゾンビ相当
  const large = { x: 0, y: 0, width: 120, height: 120 }; // 大型相当

  // ★v0.25.3922(社長報告「ボスに壁判定が無いかも?」): 固定サイズをやめ、体の大きさに比例させた。
  // 固定だと巨体では足元の点にしか壁が無く、素通しに見えるため。
  it('雑魚の壁は従来と同じ大きさのまま(係数はそう選んである)', () => {
    const w = biteWallRect(small);              // ゾンビ相当 36×36
    expect(w.width).toBeCloseTo(BITE_WALL_W, 0); // 36×0.66 = 23.8 ≒ 24
    expect(w.height).toBeCloseTo(BITE_WALL_H, 0); // 36×0.40 = 14.4 ≒ 14
  });

  it('★巨体は壁も大きくなる(素通しにならない)', () => {
    const w = biteWallRect(large);              // 120×120
    expect(w.width).toBeGreaterThan(BITE_WALL_W * 2);
    expect(w.height).toBeGreaterThan(BITE_WALL_H * 2);
  });

  it('小さい敵でも下限を割らない', () => {
    const w = biteWallRect({ x: 0, y: 0, width: 10, height: 10 });
    expect(w.width).toBe(BITE_WALL_W);
    expect(w.height).toBe(BITE_WALL_H);
  });

  it('壁は足元(当たり判定の下辺)の中央に置く', () => {
    const w = biteWallRect(small);
    expect(w.x + w.width / 2).toBe(small.x + small.width / 2);
    expect(w.y + w.height).toBe(small.y + small.height); // 下辺=足元
  });

  it('★歩いて入れる: 壁に一切触れずに攻撃の四角と重なれる場所がある(これが無いと一生当たらない)', () => {
    const cx = small.x + small.width / 2, cy = small.y + small.height / 2;
    // プレイヤーは敵の左側。攻撃の四角=敵の当たり判定を左へ30px伸ばしたもの。
    const r = biteReachRect({ cx, cy, w: small.width, h: small.height }, cx - 200, cy, 30);
    const wall = biteWallRect(small);
    // 壁の左端よりさらに左(=押し出されない位置)に立つ。
    const player = { x: wall.x - 28, y: cy - 14, width: 28, height: 28 };
    const touchesWall = player.x < wall.x + wall.width && player.x + player.width > wall.x
      && player.y < wall.y + wall.height && player.y + player.height > wall.y;
    expect(touchesWall).toBe(false);        // 壁には触れていない=歩ける
    expect(isInBiteRect(r, player)).toBe(true); // それでも攻撃の四角には重なっている
  });
});

// ★社長裁定2026-08-25(台本の確定形):
// 「30PXで反応、30PX移動してくる、この際、**壁判定は通過可能になり、当たり判定の瞬間に
//  被っていたらダメージ**、壁判定に戻す。で繰り返せば?」
// 「すると、**赤く光った敵がプレイヤーにかぶさってくる形**になる。絵としてわかりやすくなる」
describe('★噛みつきの台本(v0.25.3914)', () => {
  const zom = (biteAt?: number) => ({ type: 'zombie' as const, biteAt });

  it('台本の間は壁が開く(=覆いかぶされる)。終われば壁は戻る', () => {
    const e = zom(1000);
    expect(isBiteWallOpen(e, 1000)).toBe(true);   // 溜め開始(踏み込みも始まる)
    expect(isBiteWallOpen(e, 1400)).toBe(true);   // 噛みの最中
    expect(isBiteWallOpen(e, 1500)).toBe(false);  // 台本終了=壁が戻る
    expect(isBiteWallOpen(zom(undefined), 1000)).toBe(false); // 構えていない時は常に壁
  });

  it('★判定は「噛みの瞬間に敵の体とプレイヤーが重なっているか」だけ(専用の四角を持たない)', () => {
    const enemyBox = { x: 0, y: 0, width: 36, height: 36 };
    expect(biteBodyOverlapsPlayer(enemyBox, { x: 20, y: 20, width: 28, height: 28 })).toBe(true);
    expect(biteBodyOverlapsPlayer(enemyBox, { x: 36, y: 0, width: 28, height: 28 })).toBe(false); // 接しているだけ=外
    expect(biteBodyOverlapsPlayer(enemyBox, { x: 200, y: 0, width: 28, height: 28 })).toBe(false);
  });

  it('踏み込みは溜めでじわり→噛みで伸び切る(慣性・CLAUDE.md「加減速のない動きは禁止」)', () => {
    const e = zom(1000);                                 // biteAt=0 は「構えていない」の意味なので使わない
    expect(biteLungeFrac(e, 1000)).toBe(0);
    expect(biteLungeFrac(e, 1150)).toBeLessThan(0.25);   // 溜め中盤=まだ出ていない(ease-in)
    expect(biteLungeFrac(e, 1300)).toBeCloseTo(0.5);     // 溜め終わり=半分
    expect(biteLungeFrac(e, 1500)).toBe(1);              // 噛みの瞬間=伸び切る
  });
});

// ★社長指示2026-08-29「ゾンビはダッシュ中が噛みつきで」。
// v0.25.3919(zrush中は構えない=止まる→噛む→走る)の逆転: 噛みつきは突進(zrush)が運ぶ。
// 歩き・停止(zpause)では構えない=「止まった瞬間に噛む」は出ない。
describe('★ゾンビはダッシュ(zrush)中だけ噛みつきを構える(2026-08-29)', () => {
  const base = { type: 'zombie' as const, biteAt: undefined, biteReadyAt: 0, rootUntil: undefined, stunUntil: undefined };
  it('zrush(突進)中は構える', () => {
    expect(canStartBite({ ...base, aiPhase: 'zrush' }, 1000)).toBe(true);
  });
  it('停止(zpause)中と歩き接近中は構えない', () => {
    expect(canStartBite({ ...base, aiPhase: 'zpause' }, 1000)).toBe(false);
    expect(canStartBite({ ...base, aiPhase: undefined }, 1000)).toBe(false);
  });
  it('ゾンビ以外はフェーズ無しでも従来どおり構える', () => {
    expect(canStartBite({ ...base, type: 'skeleton', aiPhase: undefined }, 1000)).toBe(true);
  });
});

// ★社長報告2026-08-25「通常時の当たり判定が消えて、噛みつき仕様になった敵と、なってない敵がいるね」
// 「パンプキンとか突っ込むとまだダメージ食らうな」。真因=噛みつきの除外に `isBossType` を流用しており、
// この表は**HPバー等の別目的**でエリート"雑魚"(パンプキン/削岩型/大コウモリ/実験体3/ハンター)まで
// 含んでいた。専用の `isTrueBossType` へ切り替えた(v0.25.3920)。
describe('★噛みつきの除外は死神と幻影だけ(v0.25.3921)', () => {
  it('エリート雑魚は噛みつきの対象(=触れただけでは痛くない)', () => {
    for (const t of ['pumpkin', 'driller', 'logger', 'giantbat', 'lab-zombie-3', 'hunter'] as const) {
      expect(isBiteExemptType(t)).toBe(false);
    }
  });
  it('★ボスと賞金首も噛みつきの対象(社長裁定2026-08-25「賞金首もボスと同様の枠組み」)', () => {
    for (const t of ['jormungand', 'mimir', 'thor', 'skadi', 'miguel', 'idol', 'phillboss',
      'bounty-melee', 'bounty-ranged'] as const) {
      expect(isBiteExemptType(t)).toBe(false);
    }
  });
  it('死神(無敵の徘徊体)と幻影(自前の近接を持つ)だけ除外', () => {
    expect(isBiteExemptType('reaper')).toBe(true);
    expect(isBiteExemptType('guardian-phantom')).toBe(true);
  });
  it('ボス・賞金首の硬直(CD)は雑魚より長い=技の合間のつなぎ', () => {
    expect(biteSpecFor('jormungand').recoverMs).toBe(BITE_BOSS_RECOVER_MS);
    expect(biteSpecFor('bounty-melee').recoverMs).toBe(BITE_BOSS_RECOVER_MS);
    expect(biteSpecFor('zombie').recoverMs).toBeLessThan(BITE_BOSS_RECOVER_MS);
    expect(isTrueBossType('jormungand')).toBe(true); // CDの切替はこの述語で決まる
  });
  // ★社長2026-08-25「技というのは**体をぶつけに行く技**ね」
  // 「**体とは切り離された技** 例えば刃飛ばすとか、剣で斬る とかの時は、通常通り」
  // ⇒ 接触ダメージが戻るのは体当たり系だけ。刃・弾・レーザーの最中は触れても痛くない(=噛みつき仕様のまま)。
  it('★接触ダメージが戻るのは「体をぶつけに行く技」だけ', () => {
    const j = (bossState?: string) => ({
      type: 'jormungand' as const, aiPhase: undefined, bossState, damage: 20,
    } as Parameters<typeof isBiteSubject>[0]);
    expect(isBiteSubject(j('chase'), isBiteExemptType)).toBe(true);       // 追いかけているだけ
    expect(isBiteSubject(j(undefined), isBiteExemptType)).toBe(true);     // 州なし
    expect(isBiteSubject(j('dash'), isBiteExemptType)).toBe(false);       // 突進=体当たりが技本体
    expect(isBiteSubject(j('jump-attack'), isBiteExemptType)).toBe(false); // 飛び掛かり=同上
    // ★体から切り離された技は「通常通り」=触れても痛くない
    expect(isBiteSubject(j('laser-fire'), isBiteExemptType)).toBe(true);
    expect(isBiteSubject(j('volley'), isBiteExemptType)).toBe(true);
    expect(isBiteSubject(j('harai'), isBiteExemptType)).toBe(true);       // 剣で斬る
  });

  it('★ただし技を出している最中は噛みつきを構え始めない(噛みつきは技の合間のつなぎ)', () => {
    const base = { type: 'skeleton' as const, biteAt: undefined, biteReadyAt: 0, rootUntil: undefined, stunUntil: undefined, aiPhase: undefined };
    expect(canStartBite({ ...base, bossState: 'chase' }, 1000)).toBe(true);
    expect(canStartBite({ ...base, bossState: undefined }, 1000)).toBe(true);
    expect(canStartBite({ ...base, bossState: 'laser-fire' }, 1000)).toBe(false);
    expect(canStartBite({ ...base, bossState: 'harai' }, 1000)).toBe(false);
  });
  it('★HPバー等の「ボス扱い」(isBossType)は1bitも変えていない=エリート雑魚は今もボス扱い', () => {
    for (const t of ['pumpkin', 'driller', 'logger', 'giantbat', 'lab-zombie-3', 'hunter'] as const) {
      expect(isBossType(t)).toBe(true);
    }
  });
});

// ★社長報告2026-08-25「丸いサークル系の予告技が、本体にしかダメージ判定がなくなっちゃってるかも。
// 赤い判定の中にいるのに、本体とずれた位置に立ってると食らわない」。
// 真因=噛みつきの踏み込みが `updateEnemies` の敵ループで早期returnして位置を書くため、
// 構えた直後に技へ入るとその敵のAIが丸ごと飛ばされ、**着地爆発/踏み鳴らしの円が push されない**。
describe('★技が始まったら噛みつきは中断する(v0.25.3924)', () => {
  it('技(着地・踏み鳴らし・レーザー等)の最中は中断対象', () => {
    expect(isBiteInterruptedByMove({ aiPhase: 'g-stomp-windup', bossState: undefined })).toBe(true);
    expect(isBiteInterruptedByMove({ aiPhase: 'jump', bossState: undefined })).toBe(true);
    expect(isBiteInterruptedByMove({ aiPhase: undefined, bossState: 'laser-fire' })).toBe(true);
  });
  it('接近リズムと追跡は中断しない(噛みつきが成立する状態)', () => {
    expect(isBiteInterruptedByMove({ aiPhase: 'zpause', bossState: undefined })).toBe(false);
    expect(isBiteInterruptedByMove({ aiPhase: 'zrush', bossState: undefined })).toBe(false);
    expect(isBiteInterruptedByMove({ aiPhase: undefined, bossState: 'chase' })).toBe(false);
    expect(isBiteInterruptedByMove({ aiPhase: undefined, bossState: undefined })).toBe(false);
  });
});

// ★v0.25.3925(監査で発覚): 「体をぶつけに行く技」の表は、`enemyMotion` の貫通表(地上物をすり抜けるか)
// **とは別物**。実際に4つ漏れていて、赤い帯/予告を出しているのに接触ダメージだけ消えていた
// =CLAUDE.md の絶対禁止「赤いのに当たらない」。
describe('★体当たり技の表の漏れ(v0.25.3925)', () => {
  it('トールの突進・ミゲルの踏み込み・賞金首の突進/飛び掛かりは体当たり技', () => {
    for (const bs of ['thor-dash-move', 'mdash-move', 'bm-charge', 'leap-air'] as const) {
      expect(isBodySlamNow({ aiPhase: undefined, bossState: bs })).toBe(true);
    }
  });
  it('貫通表にある体当たり技も従来どおり体当たり技', () => {
    expect(isBodySlamNow({ aiPhase: 'charge', bossState: undefined })).toBe(true);
    expect(isBodySlamNow({ aiPhase: 'jump', bossState: undefined })).toBe(true);
    expect(isBodySlamNow({ aiPhase: undefined, bossState: 'issen-dash' })).toBe(true);
  });
  it('体から切り離された技は体当たり技ではない(触れても痛くない)', () => {
    for (const bs of ['laser-fire', 'harai', 'volley', 'lance'] as const) {
      expect(isBodySlamNow({ aiPhase: undefined, bossState: bs })).toBe(false);
    }
  });
  // ★検収監査2巡目(A)(v0.25.3948): 逆向きの差分——貫通表に居るが「体をぶつけに行く技」ではないもの。
  // 偶像の離脱ローリングは逃げる移動。表の流用で「触れたら痛い+受け流し可」になっていた穴を塞ぐ。
  it('憲法: 偶像の離脱ローリング(idol-roll)は体当たり技ではない(貫通はするが武器ではない)', () => {
    expect(isBodySlamNow({ aiPhase: undefined, bossState: 'idol-roll' })).toBe(false);
  });
});

// ★v0.25.3925(監査で発覚): 構え**始め**しか止める効果を見ておらず、構えた後に気絶/拘束/持ち上げ/
// 眠りが入っても噛みつきは走り切っていた=「止める効果」の意味そのものが壊れていた。
describe('★止まっている敵は噛まない(構え始めと中断で同じ述語・v0.25.3925)', () => {
  const at = (o: Record<string, unknown>) => ({
    rootUntil: undefined, stunUntil: undefined, liftUntil: undefined, dormant: undefined, ...o,
  } as Parameters<typeof isBiteFrozen>[0]);
  it('気絶・拘束・持ち上げ・眠りは「止まっている」', () => {
    expect(isBiteFrozen(at({ stunUntil: 2000 }), 1000)).toBe(true);
    expect(isBiteFrozen(at({ rootUntil: 2000 }), 1000)).toBe(true);
    expect(isBiteFrozen(at({ liftUntil: 2000 }), 1000)).toBe(true);
    expect(isBiteFrozen(at({ dormant: true }), 1000)).toBe(true);
  });
  it('期限が切れていれば止まっていない', () => {
    expect(isBiteFrozen(at({ stunUntil: 500 }), 1000)).toBe(false);
    expect(isBiteFrozen(at({}), 1000)).toBe(false);
  });
  it('★眠っている敵は構え始めない(壁越しに眠ったまま噛む経路を塞ぐ)', () => {
    const base = { type: 'skeleton' as const, biteAt: undefined, biteReadyAt: 0, rootUntil: undefined, stunUntil: undefined,
      liftUntil: undefined, aiPhase: undefined, bossState: undefined };
    expect(canStartBite({ ...base, dormant: true }, 1000)).toBe(false);
    expect(canStartBite({ ...base, dormant: false }, 1000)).toBe(true);
  });
});

// ★社長裁定2026-08-26「やはり噛みつき、溜め300msの間に2回点滅にまとめで」。
// 一度は「モーションの手前に予告(lead)を足す」形にしたが(v0.25.3931)、溜めの中に2回まとめる形で確定。
describe('★点滅は溜めの中で2回(v0.25.3932)', () => {
  const z = { type: 'zombie' as const, biteAt: 1000 };
  it('明→暗→明→暗 の2回(溜めを2等分し各回の前半が明側)', () => {
    const w = BITE_DEFAULT.windupMs;                          // 300ms
    expect(biteBlinkOn(z, 1000 + w * 0.10)).toBe(true);  // 1回目 明
    expect(biteBlinkOn(z, 1000 + w * 0.40)).toBe(false); // 1回目 暗
    expect(biteBlinkOn(z, 1000 + w * 0.60)).toBe(true);  // 2回目 明
    expect(biteBlinkOn(z, 1000 + w * 0.90)).toBe(false); // 2回目 暗
  });
  it('★噛みの区間では光らない(そこは動きだけで読ませる)', () => {
    expect(biteBlinkOn(z, 1000 + BITE_DEFAULT.windupMs + 10)).toBe(false);
    expect(biteBlinkOn(z, 1000 + 5000)).toBe(false); // 台本の外
  });
});

