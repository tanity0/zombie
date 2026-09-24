import { isTrueBossType, isBossType, isBiteExemptType, isGuardianPhantom, ENEMY_STATS } from './enemyUtils';
import { describe, it, expect } from 'vitest';
import {
  BITE_DEFAULT, BITE_BY_TYPE, biteSpecFor, bitePhaseOf, biteProgress,
  biteLungeFrac, bitePointFrom, biteReachRect, isInBiteRect, isBiteSubject,
  biteWallRect, BITE_WALL_W, BITE_WALL_H, isBiteWallOpen, biteBodyOverlapsPlayer, canStartBite,
  isBiteInterruptedByMove, isBodySlamNow, isBiteFrozen, biteBlinkOn,
  BITE_BOSS_RECOVER_MS,
  canZombieRushBite,
  biteBlinkTintFor,
  isBiteResolveDue,
  BITE_CONTACT_DIST_PX, BITE_LUNGE_CAP_PX, biteLungeDistanceAtFire,
} from './enemyBite';
import { enemyContactBox, playerHitbox } from './collisionUtils';
import { setEnemyArtAspect } from '../pixi/renderSpec';
import type { Enemy, EnemyType } from '../types/game';

// ★全敵共通の噛みつき(PACING_PUZZLE.md §12)の不変条件。
// 守るのは3つ。どれか1つでも崩れると文法が壊れる:
//  1. 発火の30pxと判定の30pxは**同じ1つの数**(社長「あくまで当たり判定は30px範囲ね」)。
//  2. 判定は**予告した点**で取り、敵の実位置は見ない(壁際で赤と判定がズレない)。
//  3. 踏み込みは**絵**であって判定を伸ばさない。
// ★§16-D(社長指示2026-09-19)でzombie型のwindupMs/lungeMsが既定値から差し替わった(300→600・
// lungeMs新設300)、続いて§16-E(社長指示2026-09-19「構えて一瞬止まる」)でskeleton型にも
// lungeMs:180(=120msの静止)が足された。この汎用曲線(§12の噛みつきアルゴリズムそのもの)を
// 確かめるヘルパーは**bat型**(BITE_BY_TYPEに上書きが無い=BITE_DEFAULTそのまま)を使う。
// zombie固有のlungeMs挙動・skeleton固有のlungeMs挙動は、それぞれ専用の describe ブロック(下)で
// 別に検査する。
const at = (biteAt: number | undefined): Pick<Enemy, 'type' | 'biteAt'> =>
  ({ type: 'bat', biteAt } as Pick<Enemy, 'type' | 'biteAt'>);

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

  // ★v0.25.4453: 型の一覧を固定する形をやめた。この表は**「調整はここへ足していく」**前提の台帳なので、
  // 一覧を縛ると**台帳を使うたびにテストが落ちる**(実際 v0.25.4447 のリッチ追加で落ちた)。
  // 縛るべきは「**書いていない型は既定値のまま**」という不変条件の方。
  it('表に書いていない型は既定値のまま(=上書きは明示した型だけに効く)', () => {
    // ★skeletonは§16-Eでlungemsが足されたのでこの一覧から外した(検証は専用describeブロックで行う)。
    // ★pumpkinも v0.25.4645(強個体3種の溜め600ms)で表へ入ったので外した。
    for (const t of ['werewolf', 'bat', 'ghost'] as const) {
      expect(BITE_BY_TYPE[t], t).toBeUndefined();
      expect(biteSpecFor(t), t).toEqual(BITE_DEFAULT);
    }
  });

  it('表に書いた型は、書いた項目だけが既定値から差し替わる', () => {
    for (const [type, over] of Object.entries(BITE_BY_TYPE)) {
      expect(biteSpecFor(type as EnemyType)).toEqual({ ...BITE_DEFAULT, ...over });
    }
  });

  // ★過去の裁定は事実として: 社長指示2026-09-16で一時 10_000ms(10秒に1回)にしていたが、
  // それは§16(雑魚の「詰めさせない技」)を足す前の暫定。今回のバッチで社長裁定「4は戻して様子見」
  // により600msへ復帰した(PACING_PUZZLE.md §16-8)。
  it('★ゾンビの噛みつきは600msへ復帰した(社長裁定2026-09-16「4は戻して様子見」)', () => {
    expect(biteSpecFor('zombie').recoverMs).toBe(600);
    // ★§16-D(社長指示2026-09-19)でwindupMs 300→600・lungeMs新設300も上書きされている。
    expect(biteSpecFor('zombie')).toEqual({ ...BITE_DEFAULT, recoverMs: 600, windupMs: 600, lungeMs: 300 });
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

// ★PACING_PUZZLE.md §16-D(社長指示2026-09-19「距離詰めてから噛みつくまでに0.3秒の停止を入れて」)。
// ゾンビだけ windupMs 300→600・lungeMs新設300。踏み込みはlungeMs(300ms)で走り切り、
// 残りの300ms(=windupMs−lungeMs)は完全に静止してから噛む(biteMs/lungePx/recoverMsは不変)。
describe('★§16-D ゾンビの噛みつき「詰めたあとの停止」', () => {
  const z = (biteAt: number | undefined): Pick<Enemy, 'type' | 'biteAt'> =>
    ({ type: 'zombie', biteAt } as Pick<Enemy, 'type' | 'biteAt'>);
  const spec = biteSpecFor('zombie'); // move/aiPhase無し=§12の噛みつきそのもの

  it('D-4受け入れ条件1: 台帳はwindupMs600/lungeMs300/biteMs200/lungePx30/recoverMs600(変えていない値の確認込み)', () => {
    expect(spec.windupMs).toBe(600);
    expect(spec.lungeMs).toBe(300);
    expect(spec.biteMs).toBe(200);       // 変えない
    expect(spec.lungePx).toBe(30);       // 変えない
    expect(spec.recoverMs).toBe(600);    // 変えない
  });

  it('D-4受け入れ条件1: 踏み込みは300msで走り切る(溜め終わり=半分)', () => {
    expect(biteLungeFrac(z(1000), 1000)).toBeCloseTo(0);
    expect(biteLungeFrac(z(1000), 1150)).toBeLessThan(0.2);   // ease-in中盤=じわっと
    expect(biteLungeFrac(z(1000), 1300)).toBeCloseTo(0.5);    // lungeMs=300で走り切る
  });

  it('D-4受け入れ条件1: 300ms〜600ms(windupMs)は完全に静止する(0.5のまま動かない)', () => {
    expect(biteLungeFrac(z(1000), 1301)).toBeCloseTo(0.5);
    expect(biteLungeFrac(z(1000), 1450)).toBeCloseTo(0.5);
    expect(biteLungeFrac(z(1000), 1599)).toBeCloseTo(0.5);
  });

  it('D-4受け入れ条件1: windupMs(600ms)を過ぎたら噛みへ入り、800msで伸び切る', () => {
    expect(biteLungeFrac(z(1000), 1600)).toBeCloseTo(0.5); // 噛みの入口=段差なし
    expect(biteLungeFrac(z(1000), 1700)).toBeGreaterThan(0.5);
    expect(biteLungeFrac(z(1000), 1800)).toBeCloseTo(1);   // windupMs+biteMs=噛み切る
  });

  it('★単調増加(静止区間を含めても後退しない)', () => {
    let prev = -1;
    for (let t = 0; t <= 800; t += 10) {
      const f = biteLungeFrac(z(1000), 1000 + t);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
  });

  it('D-4受け入れ条件2: 紫の予告が消え切る瞬間(windupMs+biteMs=800ms)=噛みが当たる瞬間(掟③)が一致する', () => {
    expect(bitePhaseOf(z(1000), 1799)).toBe('bite');
    expect(bitePhaseOf(z(1000), 1800)).toBe('none');   // 予告消え切り
    expect(biteProgress(z(1000), 1800)).toBeCloseTo(1); // 進捗も同じ瞬間に1
    expect(biteLungeFrac(z(1000), 1800)).toBeCloseTo(1); // 踏み込みも同じ瞬間に伸び切る=命中点
    expect(isBiteResolveDue(z(1000), 1799)).toBe(false);
    expect(isBiteResolveDue(z(1000), 1800)).toBe(true);
  });

  it('D-4受け入れ条件3: 他の型(ゴースト/リッチ/研究所Lv1等)は1ビットも変わらない(lungeMs未指定)', () => {
    // ★skeletonは§16-Eでlungemsが足されたのでこの一覧から外した(検証は専用describeブロックで行う)。
    for (const t of ['ghost', 'lab-zombie-3', 'bat', 'werewolf'] as const) {
      const s = biteSpecFor(t);
      expect(s.lungeMs, t).toBeUndefined();
      expect(s.windupMs, t).toBe(BITE_DEFAULT.windupMs);
      expect(s).toEqual({ ...BITE_DEFAULT, ...(BITE_BY_TYPE[t] ?? {}) });
    }
    // リッチはrecoverMsだけ上書き=windupMs/lungeMsは既定のまま。
    expect(biteSpecFor('lich')).toEqual({ ...BITE_DEFAULT, recoverMs: 3000 });
  });

  it('D-4受け入れ条件4: zombie-double(z-bite1/z-bite2)は変わらない(lungeMs=自分のwindupMsで打ち消し済み)', () => {
    const specD1 = biteSpecFor('zombie', 'zombie-double', 'z-bite1');
    const specD2 = biteSpecFor('zombie', 'zombie-double', 'z-bite2');
    expect(specD1.windupMs).toBe(220);
    expect(specD1.lungeMs).toBe(220); // = windupMs(自分のぶんで型のlungeMs:300を打ち消す)
    expect(specD2.windupMs).toBe(300);
    expect(specD2.lungeMs).toBe(300); // = windupMs
    const e1 = { type: 'zombie' as const, biteAt: 1000, chaffMove: 'zombie-double' as const, aiPhase: 'z-bite1' as const };
    const e2 = { type: 'zombie' as const, biteAt: 1000, chaffMove: 'zombie-double' as const, aiPhase: 'z-bite2' as const };
    // 静止区間が無い=溜め終わり(windupMs)でちょうど0.5(従来どおり段差なし・止まらず伸びる)。
    expect(biteLungeFrac(e1, 1000 + specD1.windupMs)).toBeCloseTo(0.5, 5);
    expect(biteLungeFrac(e2, 1000 + specD2.windupMs)).toBeCloseTo(0.5, 5);
  });
});

// ★PACING_PUZZLE.md §16-E E-3(社長指示2026-09-19「武器を構えて一瞬止まる、を雑魚モーションには
// 差し込んでみよう」)。骸骨だけ止まる拍が無かったので`lungeMs: 180`を足した(=120msの静止)。
// windupMs(300)・lungePx・biteMs・recoverMsは変えていない(同じ300msの内訳を割るだけ)。
describe('★§16-E 骸骨の噛みつき「構えて一瞬止まる」', () => {
  const sk = (biteAt: number | undefined): Pick<Enemy, 'type' | 'biteAt'> =>
    ({ type: 'skeleton', biteAt } as Pick<Enemy, 'type' | 'biteAt'>);
  const spec = biteSpecFor('skeleton'); // move/aiPhase無し=§12の噛みつきそのもの

  it('E-5受け入れ条件4: 台帳はwindupMs300/lungeMs180/biteMs200/lungePx30/recoverMs600(変えていない値の確認込み)', () => {
    expect(spec.windupMs).toBe(300);       // 変えない
    expect(spec.lungeMs).toBe(180);
    expect(spec.biteMs).toBe(200);         // 変えない
    expect(spec.lungePx).toBe(BITE_DEFAULT.lungePx); // 変えない
    expect(spec.recoverMs).toBe(BITE_DEFAULT.recoverMs); // 変えない(§12既定のまま)
    expect(spec.windupMs + spec.biteMs).toBe(500); // 総尺は不変(BITE_DEFAULTと同じ500ms)
  });

  it('踏み込みは180msで走り切る(溜め終わり=半分)', () => {
    expect(biteLungeFrac(sk(1000), 1000)).toBeCloseTo(0);
    expect(biteLungeFrac(sk(1000), 1090)).toBeLessThan(0.2);   // ease-in中盤=じわっと
    expect(biteLungeFrac(sk(1000), 1180)).toBeCloseTo(0.5);    // lungeMs=180で走り切る
  });

  it('180ms〜300ms(windupMs)は完全に静止する(0.5のまま動かない=120msの静止)', () => {
    expect(biteLungeFrac(sk(1000), 1181)).toBeCloseTo(0.5);
    expect(biteLungeFrac(sk(1000), 1240)).toBeCloseTo(0.5);
    expect(biteLungeFrac(sk(1000), 1299)).toBeCloseTo(0.5);
  });

  it('windupMs(300ms)を過ぎたら噛みへ入り、500msで伸び切る', () => {
    expect(biteLungeFrac(sk(1000), 1300)).toBeCloseTo(0.5); // 噛みの入口=段差なし
    expect(biteLungeFrac(sk(1000), 1400)).toBeGreaterThan(0.5);
    expect(biteLungeFrac(sk(1000), 1500)).toBeCloseTo(1);   // windupMs+biteMs=噛み切る
  });

  it('★単調増加(静止区間を含めても後退しない)', () => {
    let prev = -1;
    for (let t = 0; t <= 500; t += 10) {
      const f = biteLungeFrac(sk(1000), 1000 + t);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
  });

  it('E-5受け入れ条件3: 紫の予告が消え切る瞬間(windupMs+biteMs=500ms)=噛みが当たる瞬間(掟③)が一致する', () => {
    expect(bitePhaseOf(sk(1000), 1499)).toBe('bite');
    expect(bitePhaseOf(sk(1000), 1500)).toBe('none');   // 予告消え切り
    expect(biteProgress(sk(1000), 1500)).toBeCloseTo(1); // 進捗も同じ瞬間に1
    expect(biteLungeFrac(sk(1000), 1500)).toBeCloseTo(1); // 踏み込みも同じ瞬間に伸び切る=命中点
  });

  it('★技(skel-bite)にも同じwindupMsのまま伝わる(windupMsが同じ300msなのでlungeMsの割り方も同じ)', () => {
    // ★設計書に明記が無かったので設計者が決めた箇所: §16-Dのzombie-doubleは1発目のwindupMs(220)が
    // 型のlungeMs(300)より短くなる壊れた値になるため、BITE_BY_PHASEで打ち消してあった。
    // skel-biteはwindupMsが§12既定と同じ300msなので、その打ち消しは不要=そのままlungeMs:180が効く。
    const specMove = biteSpecFor('skeleton', 'skel-bite');
    expect(specMove.windupMs).toBe(300);
    expect(specMove.lungeMs).toBe(180);
  });
});

// ★§16-A「『行き過ぎて戻る』は撤回」(社長指摘2026-09-17「攻撃モーションがビヨンビヨンしてて
// 気持ち悪い」)。旧「2発目はeaseOutBackでオーバーシュート」は撤回され、z-bite2もz-bite1・§12の
// 噛みつき全般と同じ、1.0を超えない素直なease-outになった。
describe('★§16-A「行き過ぎて戻る」の撤回: z-bite2もオーバーシュートしない', () => {
  const atZ2 = (biteAt: number | undefined): Pick<Enemy, 'type' | 'biteAt' | 'chaffMove' | 'aiPhase'> =>
    ({ type: 'zombie', biteAt, chaffMove: 'zombie-double', aiPhase: 'z-bite2' } as Pick<Enemy, 'type' | 'biteAt' | 'chaffMove' | 'aiPhase'>);
  const spec = biteSpecFor('zombie', 'zombie-double', 'z-bite2'); // windup300/bite200(§16-8)

  it('z-bite2は噛み区間を通して1.0を超えない(オーバーシュートしない)', () => {
    let maxF = 0;
    for (let t = 0; t <= spec.windupMs + spec.biteMs; t += 5) {
      maxF = Math.max(maxF, biteLungeFrac(atZ2(1000), 1000 + t));
    }
    expect(maxF).toBeLessThanOrEqual(1.0);
  });

  it('噛み終わり(windup+biteMs)でちょうど1.0(伸び切って止まる)', () => {
    expect(biteLungeFrac(atZ2(1000), 1000 + spec.windupMs + spec.biteMs)).toBeCloseTo(1, 5);
  });

  it('溜め終わり(windupMs)は0.5から始まる(z-bite1・§12と同じ形。連続=段差なし)', () => {
    expect(biteLungeFrac(atZ2(1000), 1000 + spec.windupMs)).toBeCloseTo(0.5, 5);
  });

  it('z-bite2とz-bite1は同じease-out曲線を使う(専用の分岐が無いことの検知器)', () => {
    const atZ1 = (biteAt: number) =>
      ({ type: 'zombie', biteAt, chaffMove: 'zombie-double', aiPhase: 'z-bite1' } as Pick<Enemy, 'type' | 'biteAt' | 'chaffMove' | 'aiPhase'>);
    const spec1 = biteSpecFor('zombie', 'zombie-double', 'z-bite1');
    let maxF = 0;
    for (let t = 0; t <= spec1.windupMs + spec1.biteMs; t += 5) {
      maxF = Math.max(maxF, biteLungeFrac(atZ1(1000), 1000 + t));
    }
    expect(maxF).toBeLessThanOrEqual(1.0);
  });

  it('★受け入れ条件1: §12の噛みつき(chaffMove未定義)は1.0を超えない(§16の技だけの変更である証拠)', () => {
    let maxF = 0;
    for (let t = 0; t <= 500; t += 5) {
      maxF = Math.max(maxF, biteLungeFrac(at(1000), 1000 + t));
    }
    expect(maxF).toBeLessThanOrEqual(1.0);
  });
});

// ★§16-A「踏み込みの終点」(社長指摘2026-09-17「敵の攻撃が突っ立ってても届かなくなった」)。
//
// ★設計者の規則ミス(2026-09-17)を訂正: 旧規則「`lungePx`単独が接触距離を超えないこと」(=固定の
// 踏み込み距離)は、踏み込みが接触距離ちょうどから始まる場合しか正しくなかった。実際には
// bat/skeletonは100px圏で発火するので、旧`lungePx`(接触距離ぎりぎり)のままだと**遠くから出すと
// 大きく手前で止まっていた**(bat: 100px発火で40px手前/skeleton: 26px手前)。
//
// 訂正後の規則: 踏み込みは「固定距離」ではなく「接触距離まで詰める距離」。発火の瞬間に
// `踏み込み距離 = (その時の中心間距離 − 接触距離)` を計算して焼く(上限つき)。
// ⇒終点は常に接触距離。届かないことも、通り抜けることも起きない。
describe('★踏み込みの終点は常に接触距離(届かない・通り抜けるが起きない)', () => {
  // 実測アスペクト(texH/texW。PNGのIHDRから読んだ値=derivation源はBITE_CONTACT_DIST_PXのコメント)。
  setEnemyArtAspect('default:zombie', 640 / 464);
  setEnemyArtAspect('default:bat', 512 / 368);
  setEnemyArtAspect('default:skeleton', 512 / 452);

  const mkEnemy = (type: 'zombie' | 'bat' | 'skeleton', w: number, h: number): Enemy =>
    ({ id: 'x', type, x: 0, y: 0, width: w, height: h } as unknown as Enemy);
  // ★★2026-09-20の訂正: ここは長らく `PLAYER_HITBOX`(28) を手写ししていたが、
  // **命中判定が実際に見るのは `playerHitbox`(箱の2/3=19px)** である。半幅を4.5px大きく
  // 見積もっていたため、**骸骨は縦から来ると原理的に当たらない**(余裕−1.7px)のに
  // このテストは緑のままだった=素通りする網。⇒ 実物の関数を通す。
  const PLAYER_BOX = { x: 0, y: 0, width: 28, height: 28 }; // PLAYER_HITBOX(gameStore.ts)
  const PH = playerHitbox(PLAYER_BOX);
  const PLAYER_W = PH.width, PLAYER_H = PH.height;
  /** 終点は「重なる限界」からこれだけ内側に居ること。終点の実測ばらつきは±10px級なので、
   * 2px級の余裕は無いのと同じ(社長報告「攻撃が届いてない」の直接の原因)。 */
  const CONTACT_MARGIN_PX = 4;

  const cases: { type: 'zombie' | 'bat' | 'skeleton'; w: number; h: number; move?: NonNullable<Enemy['chaffMove']>; aiPhase?: Enemy['aiPhase'] }[] = [
    { type: 'zombie', w: 36, h: 36, move: 'zombie-double', aiPhase: 'z-bite1' },
    { type: 'zombie', w: 36, h: 36, move: 'zombie-double', aiPhase: 'z-bite2' },
    { type: 'bat', w: 26, h: 26, move: 'bat-grab' },
    { type: 'skeleton', w: 31, h: 31, move: 'skel-bite' },
  ];

  // ★保険の既定値(BiteSpec.lungePxのフォールバック。`biteLungePx`が焼かれていない場合だけ使われる)
  // は、従来どおり「密着(中心間距離≈0)から発火しても接触距離を下回る」安全側の固定値のままである
  // ことを確認する(§12の噛みつき等、動的計算を経由しない経路の最終防波堤)。
  it.each(cases)('$type $aiPhase$move: 保険の既定lungePxは接触距離(体の半幅の和)の最小値を下回る', ({ type, w, h, move, aiPhase }) => {
    const box = enemyContactBox(mkEnemy(type, w, h));
    const halfWxSum = box.width / 2 + PLAYER_W / 2;
    const halfHySum = box.height / 2 + PLAYER_H / 2;
    const contactDist = Math.min(halfWxSum, halfHySum); // どの向きから踏み込んでも安全な下限
    const spec = biteSpecFor(type, move, aiPhase);
    expect(spec.lungePx).toBeLessThan(contactDist);
  });

  // ★★本命の不変条件(2026-09-20 追加): **踏み込みの終点が、重なる限界より内側にあること**。
  // 縦と横を**別々に**見る——帯は横より縦が短いので、min を取らずに片側だけ見ると穴が残る。
  it.each(cases)('$type $aiPhase$move: 踏み込みの終点は縦にも横にも余裕をもって重なる', ({ type, w, h }) => {
    const box = enemyContactBox(mkEnemy(type, w, h));
    const limitX = box.width / 2 + PLAYER_W / 2;
    const limitY = box.height / 2 + PLAYER_H / 2;
    const contact = BITE_CONTACT_DIST_PX[type];
    expect(limitX - contact, `${type}: 横の余裕`).toBeGreaterThanOrEqual(CONTACT_MARGIN_PX);
    expect(limitY - contact, `${type}: 縦の余裕`).toBeGreaterThanOrEqual(CONTACT_MARGIN_PX);
  });

  // ★本題: 発火時の中心間距離がどれだけでも、動的計算(`biteLungeDistanceAtFire`)の終点が
  // 「届かない/通り抜ける」を起こさないこと。40/70/100/150/200pxの5種で確かめる
  // (bat/skeletonの発火距離100px・旧lungePxが実際に破綻していた距離を含む)。
  const FIRE_DISTS_PX = [40, 70, 100, 150, 200];
  const TYPES: ('zombie' | 'bat' | 'skeleton')[] = ['zombie', 'bat', 'skeleton'];

  for (const type of TYPES) {
    describe(`${type}`, () => {
      it.each(FIRE_DISTS_PX)('発火距離%ipx: 終点の中心間距離が接触距離を下回らない(通り抜けない)', (distAtFire) => {
        const lunge = biteLungeDistanceAtFire(type, distAtFire);
        const endpointDist = distAtFire - lunge;
        // 厳密な不等号ではなく「接触距離未満に落ちない」= 通り抜けない(僅かな浮動小数誤差は許容)。
        expect(endpointDist).toBeGreaterThanOrEqual(BITE_CONTACT_DIST_PX[type] - 1e-6);
        // 踏み込みは前進のみ(後退しない)。
        expect(lunge).toBeGreaterThanOrEqual(0);
        // 上限を超えない(飛びすぎない)。
        expect(lunge).toBeLessThanOrEqual(BITE_LUNGE_CAP_PX[type]);
      });

      it.each(FIRE_DISTS_PX.filter(d => d - BITE_CONTACT_DIST_PX[type] <= BITE_LUNGE_CAP_PX[type]))(
        '発火距離%ipx(上限内=届く範囲): 終点がちょうど接触距離に一致する(届かない・通り抜けるが起きない)',
        (distAtFire) => {
          const lunge = biteLungeDistanceAtFire(type, distAtFire);
          const endpointDist = distAtFire - lunge;
          expect(endpointDist).toBeCloseTo(BITE_CONTACT_DIST_PX[type], 5);
        },
      );

      it('発火距離が上限より遠い場合は上限で頭打ちになる(届かないが、通り抜けもしない)', () => {
        const farDist = BITE_CONTACT_DIST_PX[type] + BITE_LUNGE_CAP_PX[type] + 50;
        const lunge = biteLungeDistanceAtFire(type, farDist);
        expect(lunge).toBeCloseTo(BITE_LUNGE_CAP_PX[type], 5);
        expect(farDist - lunge).toBeGreaterThan(BITE_CONTACT_DIST_PX[type]); // 届いていない(通り抜けてもいない)
      });

      it('密着(距離0)から発火しても踏み込み距離は0(後ろへは進まない)', () => {
        expect(biteLungeDistanceAtFire(type, 0)).toBe(0);
      });
    });
  }
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
    expect(isBiteSubject(zombie('zpause'), notBoss, 1000)).toBe(true);
    expect(isBiteSubject(zombie('zrush'), notBoss, 1000)).toBe(true);
  });

  it('技(突進/飛びかかり)は従来どおり体当たりが本体=対象外', () => {
    expect(isBiteSubject(zombie('charge'), notBoss, 1000)).toBe(false);
    expect(isBiteSubject(zombie('jump'), notBoss, 1000)).toBe(false);
  });

  it('技を持たない個体は従来どおり対象', () => {
    expect(isBiteSubject(zombie(undefined), notBoss, 1000)).toBe(true);
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
  // ★§16-D/§16-Eでzombie/skeletonのwindup/lungeMsが既定から差し替わったので、汎用アルゴリズムの
  // 確認はbat(既定のまま)で行う(zombie固有・skeleton固有の停止挙動はそれぞれ別describeで検査)。
  const zom = (biteAt?: number) => ({ type: 'bat' as const, biteAt });

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
    expect(canStartBite({ ...base, aiPhase: 'zrush' }, 1000, 1000)).toBe(true);
  });
  it('停止(zpause)中と歩き接近中は構えない', () => {
    expect(canStartBite({ ...base, aiPhase: 'zpause' }, 1000, 1000)).toBe(false);
    expect(canStartBite({ ...base, aiPhase: undefined }, 1000, 1000)).toBe(false);
  });
  it('ゾンビ以外はフェーズ無しでも従来どおり構える', () => {
    expect(canStartBite({ ...base, type: 'skeleton', aiPhase: undefined }, 1000, 1000)).toBe(true);
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
  it('ボス・賞金首の硬直(CD)は既定の雑魚より長い=技の合間のつなぎ', () => {
    expect(biteSpecFor('jormungand').recoverMs).toBe(BITE_BOSS_RECOVER_MS);
    expect(biteSpecFor('bounty-melee').recoverMs).toBe(BITE_BOSS_RECOVER_MS);
    // ★ゾンビは§16のバッチで600msへ復帰した(既定値と同じ=もう例外ではない。上のdescribe参照)ので、
    // werewolfと同じ扱いで比較できる。
    expect(biteSpecFor('werewolf').recoverMs).toBeLessThan(BITE_BOSS_RECOVER_MS);
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
    expect(isBiteSubject(j('chase'), isBiteExemptType, 1000)).toBe(true);       // 追いかけているだけ
    expect(isBiteSubject(j(undefined), isBiteExemptType, 1000)).toBe(true);     // 州なし
    expect(isBiteSubject(j('dash'), isBiteExemptType, 1000)).toBe(false);       // 突進=体当たりが技本体
    expect(isBiteSubject(j('jump-attack'), isBiteExemptType, 1000)).toBe(false); // 飛び掛かり=同上
    // ★体から切り離された技は「通常通り」=触れても痛くない
    expect(isBiteSubject(j('laser-fire'), isBiteExemptType, 1000)).toBe(true);
    expect(isBiteSubject(j('volley'), isBiteExemptType, 1000)).toBe(true);
    expect(isBiteSubject(j('harai'), isBiteExemptType, 1000)).toBe(true);       // 剣で斬る
  });

  it('★ただし技を出している最中は噛みつきを構え始めない(噛みつきは技の合間のつなぎ)', () => {
    const base = { type: 'skeleton' as const, biteAt: undefined, biteReadyAt: 0, rootUntil: undefined, stunUntil: undefined, aiPhase: undefined };
    expect(canStartBite({ ...base, bossState: 'chase' }, 1000, 1000)).toBe(true);
    expect(canStartBite({ ...base, bossState: undefined }, 1000, 1000)).toBe(true);
    expect(canStartBite({ ...base, bossState: 'laser-fire' }, 1000, 1000)).toBe(false);
    expect(canStartBite({ ...base, bossState: 'harai' }, 1000, 1000)).toBe(false);
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
  // ★§16-3(ゾンビzrushの体当たり)を足した時にPickへ `type`/`aiPhaseUntil`/`biteAt` が増えたので、
  // 既存呼び出しに `type`(非zombieのボス型=zrush特例に触れない)を明示する(検収監査で発覚)。
  it('トールの突進・ミゲルの踏み込み・賞金首の突進/飛び掛かりは体当たり技', () => {
    for (const bs of ['thor-dash-move', 'mdash-move', 'bm-charge', 'leap-air'] as const) {
      expect(isBodySlamNow({ type: 'thor', aiPhase: undefined, bossState: bs }, 1000)).toBe(true);
    }
  });
  it('貫通表にある体当たり技も従来どおり体当たり技', () => {
    expect(isBodySlamNow({ type: 'thor', aiPhase: 'charge', bossState: undefined }, 1000)).toBe(true);
    expect(isBodySlamNow({ type: 'thor', aiPhase: 'jump', bossState: undefined }, 1000)).toBe(true);
    expect(isBodySlamNow({ type: 'thor', aiPhase: undefined, bossState: 'issen-dash' }, 1000)).toBe(true);
  });
  it('体から切り離された技は体当たり技ではない(触れても痛くない)', () => {
    for (const bs of ['laser-fire', 'harai', 'volley', 'lance'] as const) {
      expect(isBodySlamNow({ type: 'thor', aiPhase: undefined, bossState: bs }, 1000)).toBe(false);
    }
  });
  // ★検収監査2巡目(A)(v0.25.3948): 逆向きの差分——貫通表に居るが「体をぶつけに行く技」ではないもの。
  // 偶像の離脱ローリングは逃げる移動。表の流用で「触れたら痛い+受け流し可」になっていた穴を塞ぐ。
  it('憲法: 偶像の離脱ローリング(idol-roll)は体当たり技ではない(貫通はするが武器ではない)', () => {
    expect(isBodySlamNow({ type: 'idol', aiPhase: undefined, bossState: 'idol-roll' }, 1000)).toBe(false);
  });
});

// PACING_PUZZLE.md §16-3「追尾の終わり際」(§16-8b手順5): ゾンビのzrush(2倍速追尾)はzrush開始
// から1600ms未満だけ体当たり判定を持つ。1600ms以降・またbiteAtが立っている間は体当たりを持たない
// (噛みの判定に譲る=二重ダメージ源を作らない)。
describe('★ゾンビzrushの「追尾の終わり際」(§16-3・体当たり判定の窓)', () => {
  const zrush = (aiPhaseUntil: number, biteAt?: number) =>
    ({ type: 'zombie' as const, aiPhase: 'zrush' as const, aiPhaseUntil, biteAt, bossState: undefined });
  it('zrush開始から1600ms未満は体当たり判定を持つ', () => {
    // 開始=aiPhaseUntil-2000。gameTime=開始+1599。
    const startedAt = 10_000;
    expect(isBodySlamNow(zrush(startedAt + 2000), startedAt + 1599)).toBe(true);
  });
  it('1600ms以降は体当たり判定を持たない(§12の噛みに譲る)', () => {
    const startedAt = 10_000;
    expect(isBodySlamNow(zrush(startedAt + 2000), startedAt + 1600)).toBe(false);
  });
  it('biteAtが立っている間(噛みの構え〜実行中)は1600ms未満でも体当たり判定を持たない', () => {
    const startedAt = 10_000;
    expect(isBodySlamNow(zrush(startedAt + 2000, startedAt + 500), startedAt + 600)).toBe(false);
  });
  it('zpause中(zrushではない)は体当たり判定を持たない', () => {
    expect(isBodySlamNow({ type: 'zombie', aiPhase: 'zpause', aiPhaseUntil: 5000, biteAt: undefined, bossState: undefined }, 4000)).toBe(false);
  });
  it('ゾンビ以外の型はこの分岐を通らない(既存のボス表がそのまま効く)', () => {
    expect(isBodySlamNow({ type: 'werewolf', aiPhase: 'zrush', aiPhaseUntil: 2000, biteAt: undefined, bossState: undefined }, 100)).toBe(false);
  });
  it('★貫通は付けない: zrushはisPassThroughPhaseの表に入っていない(木・壁を貫通しない)', () => {
    // isBodySlamNow=trueでも、貫通表(isPassThroughPhase)は別概念のまま(§16-3「2つの概念を分けて書く」)。
    const startedAt = 10_000;
    expect(isBodySlamNow(zrush(startedAt + 2000), startedAt + 1000)).toBe(true);
    // enemyMotion.ts のisPassThroughPhase('zrush')がfalseであることは同ファイルのテストで別途担保。
  });
});

// PACING_PUZZLE.md §16-8b手順5申し送り: bitePhaseOf/isBiteResolveDue/biteLungeFrac が aiPhase を
// 受け取るようになった(検収監査で発覚した実装上の必須修正・enemyBite.tsの土台の完成)。
// これが無いと、ゾンビ2連の1発目(z-bite1=220/160/40)が既定値(300/200/40のうち300/200)で
// 解決してしまい、2発目のlungePxも40のまま(z-bite2本来の60が出ない)。
describe('★ゾンビ2連の尺はaiPhaseで2段目に重なる(z-bite1≠z-bite2≠既定値)', () => {
  const e1 = { type: 'zombie' as const, biteAt: 1000, chaffMove: 'zombie-double' as const, aiPhase: 'z-bite1' as const };
  const e2 = { type: 'zombie' as const, biteAt: 1000, chaffMove: 'zombie-double' as const, aiPhase: 'z-bite2' as const };
  it('z-bite1は220(溜め)+160(噛み)=380msで解決する(既定の500msではない)', () => {
    expect(isBiteResolveDue(e1, 1000 + 379)).toBe(false);
    expect(isBiteResolveDue(e1, 1000 + 380)).toBe(true);
  });
  it('z-bite2は300(溜め)+200(噛み)=500msで解決する', () => {
    expect(isBiteResolveDue(e2, 1000 + 499)).toBe(false);
    expect(isBiteResolveDue(e2, 1000 + 500)).toBe(true);
  });
  it('bitePhaseOfもaiPhaseで正しい区間を返す(z-bite1のwindupは220ms)', () => {
    expect(bitePhaseOf(e1, 1000 + 219)).toBe('windup');
    expect(bitePhaseOf(e1, 1000 + 220)).toBe('bite');
    expect(bitePhaseOf(e1, 1000 + 379)).toBe('bite');
    expect(bitePhaseOf(e1, 1000 + 380)).toBe('none');
  });
});

// ★v0.25.3925(監査で発覚): 構え**始め**しか止める効果を見ておらず、構えた後に気絶/拘束/持ち上げ/
// 眠りが入っても噛みつきは走り切っていた=「止める効果」の意味そのものが壊れていた。
describe('★止まっている敵は噛まない(構え始めと中断で同じ述語・v0.25.3925)', () => {
  const at = (o: Record<string, unknown>) => ({
    rootUntil: undefined, stunUntil: undefined, liftUntil: undefined, dormant: undefined, ...o,
  } as Parameters<typeof isBiteFrozen>[0]);
  it('気絶・拘束・持ち上げ・眠りは「止まっている」', () => {
    expect(isBiteFrozen(at({ stunUntil: 2000 }), 1000, 1000)).toBe(true);
    expect(isBiteFrozen(at({ rootUntil: 2000 }), 1000, 1000)).toBe(true);
    expect(isBiteFrozen(at({ liftUntil: 2000 }), 1000, 1000)).toBe(true);
    expect(isBiteFrozen(at({ dormant: true }), 1000, 1000)).toBe(true);
  });
  it('期限が切れていれば止まっていない', () => {
    expect(isBiteFrozen(at({ stunUntil: 500 }), 1000, 1000)).toBe(false);
    expect(isBiteFrozen(at({}), 1000, 1000)).toBe(false);
  });
  it('★眠っている敵は構え始めない(壁越しに眠ったまま噛む経路を塞ぐ)', () => {
    const base = { type: 'skeleton' as const, biteAt: undefined, biteReadyAt: 0, rootUntil: undefined, stunUntil: undefined,
      liftUntil: undefined, aiPhase: undefined, bossState: undefined };
    expect(canStartBite({ ...base, dormant: true }, 1000, 1000)).toBe(false);
    expect(canStartBite({ ...base, dormant: false }, 1000, 1000)).toBe(true);
  });
});

// ★社長裁定2026-08-26「やはり噛みつき、溜め300msの間に2回点滅にまとめで」。
// 一度は「モーションの手前に予告(lead)を足す」形にしたが(v0.25.3931)、溜めの中に2回まとめる形で確定。
describe('★点滅は溜めの中で2回(v0.25.3932)', () => {
  // ★§16-Dでzombieのwindup既定が300→600になったので、BITE_DEFAULT.windupMsをそのまま比較に
  // 使うこのテストはskeletonで行う。★§16-Eでskeletonにlungemsが足されたが、biteBlinkOnは
  // spec.windupMsだけを見る(lungeMsは踏み込みの見た目=biteLungeFracだけが読む)ので、
  // skeletonのwindupMsが300のまま=このテストは影響を受けない。
  const z = { type: 'skeleton' as const, biteAt: 1000 };
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

describe('★立ち止まり明けのダッシュ噛みつき(社長指示2026-09-16)', () => {
  const z = (over: Record<string, unknown> = {}) =>
    ({ type: 'zombie', biteAt: 0, biteReadyAt: 0, ...over }) as never;

  it('ゾンビは距離もaiPhaseも見ずに構えられる(停止そのものが引き金)', () => {
    expect(canZombieRushBite(z(), 10_000, 10_000)).toBe(true);
    expect(canZombieRushBite(z({ aiPhase: 'zpause' }), 10_000, 10_000)).toBe(true);
  });
  it('ゾンビ以外は対象外', () => {
    expect(canZombieRushBite(z({ type: 'hunter' }), 10_000, 10_000)).toBe(false);
  });
  it('★止める効果は必ず効く(気絶/拘束/持ち上げ/眠り)——ここを緩めると棒立ちの敵が噛んでくる', () => {
    expect(canZombieRushBite(z({ stunUntil: 11_000 }), 10_000, 10_000)).toBe(false);
    expect(canZombieRushBite(z({ rootUntil: 11_000 }), 10_000, 10_000)).toBe(false);
    expect(canZombieRushBite(z({ liftUntil: 11_000 }), 10_000, 10_000)).toBe(false);
    expect(canZombieRushBite(z({ dormant: true }), 10_000, 10_000)).toBe(false);
  });
  it('硬直中と二重構えは弾く', () => {
    expect(canZombieRushBite(z({ biteReadyAt: 10_500 }), 10_000, 10_000)).toBe(false);
    expect(canZombieRushBite(z({ biteAt: 9_900 }), 10_000, 10_000)).toBe(false);
  });
  // ★この it は canZombieRushBite の**硬直ゲートの一般的な挙動**を、硬直が数サイクルぶん長い
  // 仮の例(hypothetical)で確かめるもの。実際の recoverMs は §16 のバッチで600msへ復帰した
  // (現在は毎回の停止明けで噛める=下の「600msに1回」のdescribeが実態を検査する)。
  // ここは値そのものではなく「明けるまでは空振り・明けたら必ず構える」という一般規則の検証。
  it('★「立ち止まったら必ず」は**硬直が明けている時だけ**(canZombieRushBiteの硬直ゲート・一般則)', () => {
    const resolveAt = 10_000;                        // 前の噛みが終わった
    const readyAt = resolveAt + 10_000;              // 硬直明け(仮に10秒だった場合の例)
    const cycleMs = 1000 + 2000;                     // 停止1秒 + 突進2秒
    // 次の停止明け(3秒後)では**まだ硬直中**=空振りになる
    expect(canZombieRushBite(z({ biteReadyAt: readyAt }), resolveAt + cycleMs, resolveAt + cycleMs)).toBe(false);
    // 硬直が明けた後の停止明けでは必ず構える
    expect(canZombieRushBite(z({ biteReadyAt: readyAt }), readyAt + 1, readyAt + 1)).toBe(true);
    // (仮に)10秒 ÷ 3秒サイクル ⇒ 噛めるのは約3回に1回、という比の例
    expect(Math.ceil(10_000 / cycleMs)).toBe(4);
  });
});

describe('★溜め中の点滅の色(社長裁定2026-09-16「紫」)', () => {
  it('全敵とも紫(ゾンビも例外ではない)', () => {
    expect(biteBlinkTintFor('zombie')).toBe(0x9333ea);
    expect(biteBlinkTintFor('werewolf')).toBe(0x9333ea);
    expect(biteBlinkTintFor('jormungand')).toBe(0x9333ea);
  });
  it('★紫=カウンター不可と一対であること(色と判定は必ず揃える)', () => {
    expect(biteSpecFor('zombie').counterable).toBe(false);
    expect(BITE_DEFAULT.counterable).toBe(false);
    // 色を赤へ動かす時は counterable も一緒に見直す、という約束をここで機械化しておく。
    expect(biteBlinkTintFor('zombie') === 0x9333ea).toBe(!BITE_DEFAULT.counterable);
  });
});

/**
 * ★★社長報告2026-09-19「skeletonが攻撃してこない」の**真因**の回帰
 * (実機の `?debug=1` が `STUN` を出したのに**残り時間が空だった**ことから判明)。
 *
 * `liftUntil`(近接フィニッシュの浮き)は **`Date.now()`** で書かれる(`gameStore.ts` の3箇所とも
 * `liftUntil: now + MELEE_STUN_LIFT_MS`)。ところが `isBiteFrozen` は **`gameTime`** と比べていた。
 * `gameTime` は出撃からの経過ms(35秒なら約35,000)、`Date.now()` は約1.77e12。
 * ⇒ **一度でも浮かされた個体は以後ずっと「凍結」扱い**になり、**二度と噛まない・技も出さない**。
 */
describe('★liftUntil は Date.now 系。gameTime と比べない(v0.25.45xx・真因)', () => {
  const NOW = 1_770_000_000_000;   // 実際の Date.now() の桁
  const GT = 35_000;               // 出撃から35秒
  const lifted = (until: number) => ({ liftUntil: until }) as unknown as Parameters<typeof isBiteFrozen>[0];

  it('浮きが明けていれば凍結しない(★これが偽だと一生噛まなくなる)', () => {
    expect(isBiteFrozen(lifted(NOW - 1), GT, NOW)).toBe(false);
  });

  it('浮いている間だけ凍結する', () => {
    expect(isBiteFrozen(lifted(NOW + 420), GT, NOW)).toBe(true);
  });

  it('★gameTime を渡したら常に凍結してしまう=時計を混ぜてはいけないことの明示', () => {
    // 旧実装と同じ比較(gameTime < liftUntil)。**明けているのに true** になるのが事故の正体。
    expect(GT < NOW - 1).toBe(true);
  });
});

// ★★**「重なっただけで痛い」敵の全一覧**(社長報告2026-09-25「重なっただけでダメージを受ける敵が
// まだ残っていそう。削岩機や死神。他にもいるかも？」)。
//
// 接触ダメージは `combatTick.applyContactDamage` の1箇所でしか入らず、そこは
// **`isBiteSubject` が true の敵を丸ごと飛ばす**。つまり「重なっただけで痛い」= `isBiteSubject` が false。
// ここを表にして固定しておけば、**次に誰かが増えた/減った時にテストが止める**。
describe('★重なっただけで痛い敵(接触ダメージが残っている型)', () => {
  const ALL: EnemyType[] = ['bat', 'skeleton', 'zombie', 'plant', 'ghost', 'werewolf', 'pumpkin', 'driller',
    'logger', 'giantbat', 'reaper', 'hangedman', 'lich', 'lab-zombie-1', 'lab-zombie-2', 'lab-zombie-3',
    'mimir', 'jormungand', 'skadi', 'thor', 'miguel', 'jibril', 'rafi', 'uri', 'suriel', 'acrasiel',
    'idol', 'hunter', 'screamer', 'bounty-ranged', 'bounty-melee', 'bounty-balance', 'bounty-maiko',
    'guardian-phantom', 'phillboss'];
  // ★`applyContactDamage` の門を**そのまま写す**(v0.25.4646 で是正)。
  // `isBiteSubject` だけを見ていた旧版は**幻影を「痛い」側に数えていた**——実際の接触ループは
  // その手前で `isGuardianPhantom` を明示 return しており(research/GHOST_BOSS.md「幻影は接触では
  // 削らない」)、`ENEMY_STATS['guardian-phantom'].damage` も 0。**社長質問2026-09-25
  // 「幻影も触れたら痛いの？」で発覚。**述語を1つだけ見て「門」を語らない。
  const restingContact = (t: EnemyType): boolean => {
    if (isGuardianPhantom(t)) return false;                    // 接触ループの先頭で素通り
    if ((ENEMY_STATS[t]?.damage ?? 0) <= 0) return false;      // 0ダメージは痛くない
    return !isBiteSubject({ type: t, damage: ENEMY_STATS[t].damage } as unknown as Enemy, isBiteExemptType, 0);
  };

  it('平時に触れて痛いのは 死神 / 使者 の2型だけ(ここが増えたら社長へ報告)', () => {
    expect(ALL.filter(restingContact)).toEqual(['reaper', 'hangedman']);
  });

  // ★幻影は `isBiteExemptType`(=噛みつき台本に乗せない)には入っているが、**接触では削らない**。
  // 「噛みつきの対象外」と「触れたら痛い」は別の話——ここを混ぜたのが v0.25.4643 の誤報だった。
  it('幻影は噛みつきの対象外だが、触れても痛くない(自前の技だけで削る)', () => {
    expect(isBiteExemptType('guardian-phantom')).toBe(true);
    expect(ENEMY_STATS['guardian-phantom'].damage).toBe(0);
    expect(restingContact('guardian-phantom')).toBe(false);
  });

  it('削岩型・伐採人・蜘蛛・ハンター・城ボスは平時に触れても痛くない(噛みつき台本へ移行済み)', () => {
    for (const t of ['driller', 'logger', 'pumpkin', 'hunter', 'giantbat', 'lab-zombie-3'] as EnemyType[]) {
      expect(restingContact(t), t).toBe(false);
    }
  });

  // ★接触ダメージが戻るのは「**体をぶつけに行く技**」の最中だけ(社長2026-08-25)。
  // ここが「重なっただけで痛い」に見える2つ目の道なので、一緒に固定しておく。
  it('体をぶつけに行く技の最中だけは、どの型でも触れて痛い', () => {
    for (const ph of ['charge', 'jump', 'g-dash-charge', 'g-jump-air', 'g-glide-active']) {
      expect(restingContactWithPhase('driller', ph), ph).toBe(true);
    }
    expect(restingContactWithPhase('driller', 'driller-thrust-active')).toBe(false);
  });
  function restingContactWithPhase(t: EnemyType, aiPhase: string): boolean {
    return !isBiteSubject({ type: t, damage: 10, aiPhase } as unknown as Enemy, isBiteExemptType, 0);
  }
});

// ★★強個体3種の溜め(社長裁定2026-09-25「推薦で」・v0.25.4645)。
// 社長報告「削岩機…重なっただけでダメージ食らってる気がする」の正体は**接触ダメージではなく
// 溜めが0.3秒しかないこと**だった(平時に触れて痛いのは死神/使者/幻影の3型だけ=上のテストが固定)。
describe('★強個体3種(蜘蛛/削岩型/伐採人)の噛みつきの溜め', () => {
  const TIER: EnemyType[] = ['pumpkin', 'driller', 'logger'];

  it('溜めは600ms・踏み込みは先頭300msで走り切る(=詰めてから0.3秒止まってから噛む)', () => {
    for (const t of TIER) {
      const sp = biteSpecFor(t);
      expect(sp.windupMs, t).toBe(600);
      expect(sp.lungeMs, t).toBe(300);
      expect(sp.windupMs - (sp.lungeMs ?? sp.windupMs), `${t} の静止`).toBe(300);
    }
  });

  it('★ゾンビと同じ形(§16-Dの型をそのまま借りている)', () => {
    const z = biteSpecFor('zombie');
    for (const t of TIER) {
      const sp = biteSpecFor(t);
      expect([sp.windupMs, sp.lungeMs], t).toEqual([z.windupMs, z.lungeMs]);
    }
  });

  it('噛み・間合い・CD・踏み込み距離は既定のまま(溜めだけを動かした)', () => {
    for (const t of TIER) {
      const sp = biteSpecFor(t);
      expect([sp.biteMs, sp.rangePx, sp.recoverMs, sp.lungePx], t)
        .toEqual([BITE_DEFAULT.biteMs, BITE_DEFAULT.rangePx, BITE_DEFAULT.recoverMs, BITE_DEFAULT.lungePx]);
    }
  });

  it('区分で固まっている(強個体は3型とも同じ・雑魚は既定のまま)', () => {
    for (const t of ['bat', 'werewolf', 'ghost'] as EnemyType[]) {
      expect(biteSpecFor(t).windupMs, t).toBe(BITE_DEFAULT.windupMs);
    }
  });
});
