import { describe, it, expect } from 'vitest';
import {
  bossBehindFadeApplies, BOSS_BEHIND_MIN_SPRITE_W_MULT,
  postZoomScreenY, postZoomLocalY, postZoomFadeAlpha,
  computeGroundBandLayout, groundStripT, GROUND_STRIP_REF_COUNT, GROUND_STRIP_COUNT,
  worldGapBandHeight,
} from './renderSpec';
import { ENEMY_STATS } from '../utils/enemyUtils';
import { PLAYER_HITBOX } from '../store/gameStore';
import { ZOOM_MIN_ABS } from '../utils/cameraZoom';

// ==== v0.25.2615: 「裏回り透け」の適用範囲(社長報告「どこにいても影しかない…当たり判定だけ
// あって透明だから何もできずにやられる」の再発防止) ====
//
// pixiScene.BOSS_SPRITE_FIT の w(絵の幅に対する当たり判定幅の比)の**複製**。
// pixiScene.ts は PixiJS を import するのでテストから読めない=ここへ写して持つ
// (bossTelegraph.AOE_TELEGRAPH_AUDIT と同じ確立済みの作法)。
// **掟: pixiScene の BOSS_SPRITE_FIT を動かしたらここも直す。** 当たり判定の幅そのものは
// ENEMY_STATS から実物を読むので、そちら側のズレは自動で検知できる。
const FIT_W: Record<string, number> = {
  mimir: 0.55, jormungand: 0.91, skadi: 0.92, thor: 0.50,
  miguel: 0.50, jibril: 0.50, rafi: 0.50, uri: 0.50, suriel: 0.50, acrasiel: 0.55,
  idol: 0.42,
};
const spriteW = (type: string): number => ENEMY_STATS[type as keyof typeof ENEMY_STATS].width / FIT_W[type];

// 透けを掛ける側=自機を隠しうる巨体 / 掛けない側=人型サイズ。
const APPLIES = ['mimir', 'jormungand', 'skadi', 'thor'];
const EXCLUDED = ['idol', 'acrasiel', 'miguel', 'jibril', 'rafi', 'uri', 'suriel'];

describe('bossBehindFadeApplies — 自機を隠せない絵には透けを掛けない', () => {
  it('巨体4体には掛かる(従来どおり=救済の意図を保存)', () => {
    for (const t of APPLIES) {
      expect(bossBehindFadeApplies(spriteW(t), PLAYER_HITBOX), `${t}(${Math.round(spriteW(t))}px)`).toBe(true);
    }
  });

  it('【本件の再発防止】人型サイズ7体には掛からない(idolを含む)', () => {
    for (const t of EXCLUDED) {
      expect(bossBehindFadeApplies(spriteW(t), PLAYER_HITBOX), `${t}(${Math.round(spriteW(t))}px)`).toBe(false);
    }
  });

  it('閾値は「谷」の中にある(4.29倍と10.0倍の間)=どちらの側にも余裕がある', () => {
    const excludedMax = Math.max(...EXCLUDED.map(t => spriteW(t) / PLAYER_HITBOX));
    const appliesMin = Math.min(...APPLIES.map(t => spriteW(t) / PLAYER_HITBOX));
    expect(excludedMax).toBeLessThan(BOSS_BEHIND_MIN_SPRITE_W_MULT);
    expect(appliesMin).toBeGreaterThan(BOSS_BEHIND_MIN_SPRITE_W_MULT);
    // 谷が十分広い(閾値が片側に寄っていない)ことも固定する。
    expect(appliesMin / excludedMax).toBeGreaterThan(2);
  });

  it('閾値は自機の大きさ基準(絶対値のベタ書きではない)', () => {
    // 自機が2倍の大きさになれば、境界も2倍になる。
    const w = spriteW('thor');
    expect(bossBehindFadeApplies(w, PLAYER_HITBOX)).toBe(true);
    expect(bossBehindFadeApplies(w, PLAYER_HITBOX * 2)).toBe(false);
  });

  it('境界値(ちょうど7倍)は適用側', () => {
    expect(bossBehindFadeApplies(PLAYER_HITBOX * BOSS_BEHIND_MIN_SPRITE_W_MULT, PLAYER_HITBOX)).toBe(true);
    expect(bossBehindFadeApplies(PLAYER_HITBOX * BOSS_BEHIND_MIN_SPRITE_W_MULT - 0.01, PLAYER_HITBOX)).toBe(false);
  });
});

// ==== §6.37 FIELD-WIDE-ZOOM: post-zoom 変換(PACING_PUZZLE.md §6.37) ====
// 受け入れ条件1(恒等)・3(zoom=ZOOM_MIN_ABSで帯が1/ZOOM_MIN_ABS倍)・
// 「帯上部の代表点でalpha=1.0かつマスク境界の外」を機械検査する。

describe('postZoomScreenY / postZoomLocalY — post-zoom 変換の恒等・往復', () => {
  it('恒等(zoom=1・offsetY=0)では localY===screenY(旧来の「ローカルY=スクリーンY」前提と一致)', () => {
    for (const l of [-500, -1, 0, 1, 66, 240, 900]) {
      expect(postZoomScreenY(l, 1, 0)).toBe(l);
      expect(postZoomLocalY(l, 1, 0)).toBe(l);
    }
  });

  it('往復が恒等: postZoomLocalY(postZoomScreenY(L,z,o),z,o) === L (任意のzoom/offset)', () => {
    for (const zoom of [1, 0.7, ZOOM_MIN_ABS, 1.05]) {
      for (const offsetY of [0, 240, -50, -20]) {
        for (const L of [-600, 0, 90, 800]) {
          const s = postZoomScreenY(L, zoom, offsetY);
          expect(postZoomLocalY(s, zoom, offsetY)).toBeCloseTo(L, 9);
        }
      }
    }
  });
});

describe('postZoomFadeAlpha — 地平線/手前フェードの post-zoom 化', () => {
  const threshold = 90; // 画面Y(固定・地平線フェードの開始線を模した値)
  const fadePx = 120;   // HORIZON_ACTOR_FADE_PX 相当

  it('恒等(zoom=1・offsetY=0)では旧来の clamp((L-threshold)/fadePx,0,1) と厳密一致', () => {
    for (const L of [-100, 0, 90, 150, 210, 5000]) {
      const expected = Math.max(0, Math.min(1, (L - threshold) / fadePx));
      expect(postZoomFadeAlpha(L, 1, 0, threshold, fadePx)).toBeCloseTo(expected, 12);
    }
  });

  it('【受け入れ条件3】zoom=ZOOM_MIN_ABSで帯(alpha=0→1に上がるまでのワールド距離)が1/ZOOM_MIN_ABS倍に広がる', () => {
    // 恒等時にalpha=0→1へちょうど遷移するワールド距離 = fadePx。
    // zoom=ZOOM_MIN_ABSでの同じ遷移に必要なワールド距離は fadePx/ZOOM_MIN_ABS になるはず。
    const offsetAtMin = 240; // worldGroupのpivot平行移動を模した固定オフセット(centerY*(1-zoom)相当)
    // alpha=0の境界(L0)とalpha=1の境界(L1)をそれぞれ二分探索的にではなく、閉形式で求める:
    // screenY = L*zoom+offset が threshold の時 alpha=0、threshold+fadePx の時 alpha=1。
    const L0 = postZoomLocalY(threshold, ZOOM_MIN_ABS, offsetAtMin);
    const L1 = postZoomLocalY(threshold + fadePx, ZOOM_MIN_ABS, offsetAtMin);
    const widthAtMinZoom = L1 - L0;
    expect(widthAtMinZoom).toBeCloseTo(fadePx / ZOOM_MIN_ABS, 9);
    expect(widthAtMinZoom).toBeCloseTo(fadePx * (1 / ZOOM_MIN_ABS), 9);
  });

  it('【受け入れ条件3の実例】zoom=1では見えなかった位置が、zoom=ZOOM_MIN_ABSで alpha=1.0 になる(帯が広がって見える)', () => {
    const offsetAtMin = 240;
    // zoom=1で完全に不可視(alpha=0、thresholdより十分手前=小さいL)だった位置。
    const L = threshold - fadePx * 3;
    expect(postZoomFadeAlpha(L, 1, 0, threshold, fadePx)).toBe(0);
    // 同じワールド位置 L が、引いた(ZOOM_MIN_ABS)状態では見える(alpha>0、上限で1.0に届く例も検査)。
    const alphaAtMinZoom = postZoomFadeAlpha(L, ZOOM_MIN_ABS, offsetAtMin, threshold, fadePx);
    expect(alphaAtMinZoom).toBeGreaterThan(0);
  });

  it('【帯上部の代表点】zoom=ZOOM_MIN_ABSで、帯の外側(alpha=1安定域)の代表点は alpha=1.0 ちょうど', () => {
    const offsetAtMin = 240;
    // alpha=1に達するちょうどのローカルY(境界)より、さらに奥(手前側)の代表点を取る。
    const L1 = postZoomLocalY(threshold + fadePx, ZOOM_MIN_ABS, offsetAtMin);
    const representative = L1 + 50; // 境界よりさらに手前=alpha=1が安定しているはずの代表点
    expect(postZoomFadeAlpha(representative, ZOOM_MIN_ABS, offsetAtMin, threshold, fadePx)).toBe(1);
  });

  it('【受け入れ条件3・マスク境界の外】同じ代表点が、post-zoom追従させたworldFadeMaskの境界の外(可視側)に来る', () => {
    // pixiScene.syncWorldFadeMaskZoom と同じ式(position.y=postZoomLocalY(refY,z,o)・height=postZoomLocalY(refH,z,0))で
    // マスクをズーム追従させたと仮定し、「そのマスクが完全不透明になる境界のローカルY」を同じ式で求める。
    // マスクは対象(アクター)と同じ post-zoom 変換を経るので、alpha=1.0の代表点が境界の外側(可視側)に来るはず
    // (=v0.25.1882の教訓「マスクだけ別変換にしない」が壊れていないことの数値的裏付け)。
    const offsetAtMin = 240;
    const fullYScreen = threshold + fadePx; // マスクが完全不透明になる固定スクリーンY(zeroY+FADE_PX相当)
    const maskFullLocalY = postZoomLocalY(fullYScreen, ZOOM_MIN_ABS, offsetAtMin);
    const representative = postZoomLocalY(fullYScreen, ZOOM_MIN_ABS, offsetAtMin) + 50;
    // 代表点はマスクの「完全可視になるローカルY」以降(=マスクに切られない側)にある。
    expect(representative).toBeGreaterThan(maskFullLocalY);
    // かつ alpha も 1.0(前のテストと同じ式で再確認=alphaとマスクが同じ結論になっている)。
    expect(postZoomFadeAlpha(representative, ZOOM_MIN_ABS, offsetAtMin, threshold, fadePx)).toBe(1);
  });

  // 指摘9: これまでの段はすべて zoom<=1(寄せなし〜最大引き)。待機ズーム(punch/idle)は zoom>1 かつ
  // centerY*(1-zoom) が負(worldGroupが画面中央より上へ寄る)になる唯一の段なので、符号違いの回帰を検査する。
  it('【指摘9】zoom=1.05(待機ズーム)・offsetY=-20(=centerY*(1-z)が負)でもフェード/マスクが破綻しない', () => {
    const zoom = 1.05;
    const offsetY = -20;
    // 往復恒等(この段固有の値でも成り立つ)。
    for (const L of [-600, 0, 90, 800]) {
      const s = postZoomScreenY(L, zoom, offsetY);
      expect(postZoomLocalY(s, zoom, offsetY)).toBeCloseTo(L, 9);
    }
    // フェードは単調(0→1)で [0,1] の範囲に収まる(符号反転で逆走したり範囲外に出たりしない)。
    let prevAlpha = -1;
    for (const L of [-400, -100, 0, 90, 150, 210, 400, 5000]) {
      const a = postZoomFadeAlpha(L, zoom, offsetY, threshold, fadePx);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
      expect(a).toBeGreaterThanOrEqual(prevAlpha);
      prevAlpha = a;
    }
    // マスク境界(postZoomLocalYで同じzoom/offsetYへ追従させた場合)の外側は alpha=1 で一致する
    // (=マスクと alpha が同じ結論になる。v0.25.1882の教訓の zoom>1 側の裏付け)。
    const fullYScreen = threshold + fadePx;
    const maskFullLocalY = postZoomLocalY(fullYScreen, zoom, offsetY);
    const representative = maskFullLocalY + 50;
    expect(postZoomFadeAlpha(representative, zoom, offsetY, threshold, fadePx)).toBe(1);
  });
});

describe('computeGroundBandLayout / groundStripT — 床の縦延長(「本数追加」方式)', () => {
  const farH = 150;
  const screenH = 800;

  it('【受け入れ条件1】恒等(overscan=1)では旧来値(top=farH・bottom=screenH相当・本数=72・stripH=groundH/72)と一致', () => {
    const layout = computeGroundBandLayout(farH, screenH, 1);
    expect(layout.top).toBe(farH);
    expect(layout.bottom).toBeCloseTo(screenH, 9);
    expect(layout.stripCount).toBe(GROUND_STRIP_REF_COUNT);
    expect(layout.stripH).toBeCloseTo((screenH - farH) / GROUND_STRIP_REF_COUNT, 9);
  });

  it('overscan=1/ZOOM_MIN_ABS(=2.5)で本数が72→180になり、下端がgroundH×2.5ぶん延長される', () => {
    const overscan = 1 / ZOOM_MIN_ABS;
    const layout = computeGroundBandLayout(farH, screenH, overscan);
    expect(layout.stripCount).toBe(180);
    // 上端は不変(「床を地平線より上に描かない」= top は farH のまま)。
    expect(layout.top).toBe(farH);
    const groundH = screenH - farH;
    expect(layout.bottom).toBeCloseTo(farH + groundH * overscan, 6);
    // stripH の値そのものは overscan に関わらず不変(定義域不変)。
    expect(layout.stripH).toBeCloseTo((screenH - farH) / GROUND_STRIP_REF_COUNT, 9);
  });

  it('groundStripT は旧来の72本の範囲(i=0..71)で旧来の式 i/71 と1ビットも変わらない', () => {
    for (const i of [0, 1, 36, 71]) {
      expect(groundStripT(i)).toBeCloseTo(i / (GROUND_STRIP_REF_COUNT - 1), 12);
    }
  });

  it('延長分(i=72..179)は同じ式のまま t が1を超えて連続的に伸びる(負にはならずMath.powが安全)', () => {
    expect(groundStripT(72)).toBeGreaterThan(1);
    expect(groundStripT(179)).toBeCloseTo(179 / 71, 9);
    // 単調増加(段差が無い=継ぎ目が無い)。
    let prev = -Infinity;
    for (let i = 0; i <= 179; i++) {
      const t = groundStripT(i);
      expect(t).toBeGreaterThan(prev);
      prev = t;
    }
  });
});

// ==== §6.37 監査指摘4: layers.ts のストリップ本数ハードコード(180)を renderSpec の導出定数へ ====
// layers.ts は GROUND_STRIP_COUNT を renderSpec.ts から import するだけ(=一致は import 時点で構造的に
// 保証される)。ここでは①現在のZOOM_MIN_ABSでの実値が意図どおり180であること、②式が
// 「ZOOM_MIN_ABSを下げる(=より引く)ほど本数が増える」逆比例の関係になっていることを固定する。
describe('GROUND_STRIP_COUNT — 床ストリップ本数の導出(ZOOM_MIN_ABSからの一括算出・指摘4)', () => {
  it('GROUND_STRIP_COUNT = round(GROUND_STRIP_REF_COUNT / ZOOM_MIN_ABS) と厳密一致(現在値=180)', () => {
    expect(GROUND_STRIP_COUNT).toBe(Math.round(GROUND_STRIP_REF_COUNT / ZOOM_MIN_ABS));
    expect(GROUND_STRIP_COUNT).toBe(180);
  });

  it('ZOOM_MIN_ABSを下げる(より強く引く)ほど本数は増える(逆比例)', () => {
    const countFor = (zoomMinAbs: number) => Math.round(GROUND_STRIP_REF_COUNT / zoomMinAbs);
    expect(countFor(0.3)).toBeGreaterThan(countFor(0.4));
    expect(countFor(0.2)).toBeGreaterThan(countFor(0.3));
  });
});

// ==== §6.37 監査指摘5: 床の下接合の不変条件 ====
// 「床帯の下端は、post-zoom変換後、常に画面下端(screenH)以上まで届く」ことを、farHの取りうる全実値
// (M0=0.26h 〜 M2/lab=0.415h 相当。ステージごとの farBackdropHeight() の実比率)× z=ZOOM_MIN_ABS(絶対
// 最大引き)で固定する。破れると「引いた時に床と遠景の間に隙間(黒帯)が見える」バグになる。
describe('床の下接合(bottom*z + centerY*(1-z) >= screenH)— farHの全実値 × z=ZOOM_MIN_ABS(指摘5)', () => {
  const screenH = 876; // 論理画面高(縦持ち基準)
  const centerY = screenH / 2; // worldGroupのpivotは画面中央(zoom時の平行移動=centerY*(1-z)相当)
  const farHFracs = [0.26, 0.30, 0.38, 0.415]; // 実ステージの farBackdropHeight() 比率(M0/中間/最大級)

  it.each(farHFracs)('farH = %s × screenH で、bottom*z + centerY*(1-z) >= screenH が成り立つ', (frac) => {
    const farH = screenH * frac;
    const overscan = 1 / ZOOM_MIN_ABS;
    const layout = computeGroundBandLayout(farH, screenH, overscan);
    const z = ZOOM_MIN_ABS;
    const screenBottom = layout.bottom * z + centerY * (1 - z);
    expect(screenBottom).toBeGreaterThanOrEqual(screenH - 1e-6);
  });
});

// ==== §6.37 v4 上接合「隙間埋め帯」(PACING_PUZZLE.md §6.37-2 v4) ====
// worldGapBandHeight: 森帯の直上に静的に確保する帯の高さ。恒等(minZoom=1)では0(隙間が無い=帯不要)、
// 最深ズーム(ZOOM_MIN_ABS)では「帯の上端のpost-zoomスクリーンYがちょうどfarHへ届く」ことを検査する
// (床の下接合テストと対になる、上接合の不変条件)。
describe('worldGapBandHeight — 隙間埋め帯の静的な高さ(上接合・§6.37 v4)', () => {
  const screenH = 876;
  const centerY = screenH / 2;
  const farHFracs = [0.26, 0.30, 0.38, 0.415];

  it('恒等(minZoom=1)では高さ0(等倍では隙間そのものが無い=帯は不要)', () => {
    for (const frac of farHFracs) {
      expect(worldGapBandHeight(screenH * frac, screenH, 1)).toBe(0);
    }
  });

  it.each(farHFracs)('farH = %s × screenH で、最深ズーム(ZOOM_MIN_ABS)で帯上端のpost-zoom screenYがfarHにちょうど届く(上接合)', (frac) => {
    const farH = screenH * frac;
    const H = worldGapBandHeight(farH, screenH, ZOOM_MIN_ABS);
    const top = farH - H;
    const z = ZOOM_MIN_ABS;
    const offsetY = centerY * (1 - z);
    const screenTop = postZoomScreenY(top, z, offsetY);
    expect(screenTop).toBeCloseTo(farH, 6);
  });

  it('ZOOM_MIN_ABSを下げる(より強く引く)ほど帯の高さは大きくなる(引きが深いほど隙間が広がる)', () => {
    const farH = screenH * 0.3;
    const hAt04 = worldGapBandHeight(farH, screenH, 0.4);
    const hAt03 = worldGapBandHeight(farH, screenH, 0.3);
    expect(hAt03).toBeGreaterThan(hAt04);
  });

  it('高さは常に非負(farHがcenterYを超える異常系でも0クランプ)', () => {
    expect(worldGapBandHeight(screenH * 0.9, screenH, ZOOM_MIN_ABS)).toBeGreaterThanOrEqual(0);
  });
});
