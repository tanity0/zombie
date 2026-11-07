import { describe, it, expect } from 'vitest';
// ソースを**テキストとして**読む(Viteの ?raw)。pixiScene.ts 側の定数は export されていないので
// import では取れない。node:fs は tsconfig.app に node 型が無く typecheck が通らないためこちらを使う。
import angelBossTickSrc from './angelBossTick.ts?raw';
import pixiSceneSrc from '../pixi/pixiScene.ts?raw';
import useGameLoopSrc from '../hooks/useGameLoop.ts?raw';
import mimirLaserTrackSrc from './mimirLaserTrack.ts?raw';
// v0.25.3566(ボスメーカー横展開・第3弾): 天使6体の技の数値は**テーブル1箇所**が正本になった。
// 値そのものは import で読めるので、天使ぶんは正規表現ではなく実体で検算する(下の describe)。
import {
  ANGEL_MIGUEL_TUNING as MG_T, ANGEL_RAFI_TUNING as RF_T,
  ANGEL_URI_TUNING as UR_T, ANGEL_SURIEL_TUNING as SR_T, ANGEL_ACRASIEL_TUNING as AC_T,
} from './angelScript';
// v0.25.3573(第4弾): 裏ボス4体も同じ形になった(テーブル1箇所を判定も描画も読む)。
import {
  HIDDEN_COMMON_TUNING as HB_C, HIDDEN_MIMIR_TUNING as HB_MI,
  HIDDEN_JORMUNGAND_TUNING as HB_JO, HIDDEN_SKADI_TUNING as HB_SK, HIDDEN_THOR_TUNING as HB_TH,
} from './hiddenBossScript';

// ボスの技タイミング/寸法は、**判定側と描画側で同名(または_VIS付き)の定数が手写しで二重管理**
// されている(該当箇所に「一致」コメントの掟あり)。
//   ゲームロジック: src/utils/angelBossTick.ts(天使6体) / src/hooks/useGameLoop.ts(裏ボス4体)
//   描画:           src/pixi/pixiScene.ts
// 片方だけ直すと「予告/振りの絵と判定がズレる」= CLAUDE.md「赤いのに当たらない/赤くないのに
// 当たる」に直結する。実際に起きた事故:
//   ・v0.25.2885: 剣2倍速で両側の修正が必要と判明(このテストの初版)
//   ・v0.25.2893: ミーミル噛みつき(92 vs 216)とアクラシエル転移予告(800 vs 1000)が**実バグ**として
//     発見された(どちらも判定側の是正が描画側の手写しに届いていなかった)。全ペアへ拡張した。
// 修正の第一選択は**export+importで単一ソース化**(その定数はこの表から消してよい)。
// 二重管理を残す場合は必ずこの表に足すこと。

/** `const NAME = 123;` の 123 を取り出す。見つからなければ null(=定数が消えた/改名された/式に変わった)。 */
const constValue = (src: string, name: string): number | null => {
  const m = src.match(new RegExp(`\\bconst\\s+${name}\\s*=\\s*(\\d+)\\s*;`));
  return m ? Number(m[1]) : null;
};

const SOURCES = {
  angelBossTick: angelBossTickSrc,
  useGameLoop: useGameLoopSrc,
  mimirLaserTrack: mimirLaserTrackSrc, // §6.33でレーザー定数の正本がここへ移動(v0.25.2982でテスト追従)
} as const;

// [ロジック側ファイル, ロジック側の定数名, 描画側(pixiScene)の定数名]
const PAIRS: [keyof typeof SOURCES, string, string][] = [
  // --- 天使6体は v0.25.3566 で**手写しが消えた**(angelScript.ts のテーブルを判定も描画も読む)。
  //     この表の掟どおり行を外し、代わりに下の describe で「実体の値」と「ミラーの再発」を見張る。
  // --- 裏ボス: ミーミル/トール/ヨルムンガルド(useGameLoop側・v0.25.2893で拡張) ---
  // ★ミーミルのレーザー4定数(WINDUP/FIRE/RANGE/HALF_WIDTH)は **mimirLaserTrack.ts の1箇所に集約され、
  //   pixiSceneは手写しではなくimportで読む**ようになった(v0.25.3130前後)。手写しが存在しない=
  //   この表で見張る対象が無い(見張ろうとすると「pixiSceneに定数が見つからない」で必ず落ちる)。
  //   ここを4行残したままだったため、このテストは**ずっと4件failのまま**だった(v0.25.3461で撤去)。
  //   同型の再発防止: importで共有した定数は、この表から必ず外すこと。
  // --- 裏ボス4体も v0.25.3573 で**手写しが消えた**(hiddenBossScript.ts のテーブルを判定も描画も読む)。
  //     天使と同じくこの表の掟どおり12行を外し、下の describe で「実体の値」と「ミラーの再発」を見張る。
];

// ★表が空=「見張るべき二重管理がもう無い」(第一選択の単一ソース化が全部済んだ状態)。
// 新しく手写しを増やしたら必ず PAIRS へ足すこと。it.each は空配列を受け付けないので describe ごと畳む。
describe.skipIf(PAIRS.length === 0)('ボスの判定側と描画側の手写し定数が一致していること(手写しが残っている間だけ)', () => {
  it.each(PAIRS)('%s.%s(判定) と pixiScene.%s(描画) が同値', (srcKey, logicName, viewName) => {
    const a = constValue(SOURCES[srcKey], logicName);
    const b = constValue(pixiSceneSrc, viewName);
    // null は「定数が消えた/式に変わった」。単一ソース化(import化)したならこの表から行を消すこと。
    expect(a, `${srcKey}.ts の ${logicName} が見つからない`).not.toBeNull();
    expect(b, `pixiScene.ts の ${viewName} が見つからない`).not.toBeNull();
    expect(b, `${logicName}=${a} と ${viewName}=${b} がズレている`).toBe(a);
  });
});

describe('天使/裏ボスに共通の形の見張り', () => {
  it('★振り(ACTIVE)は予告(WINDUP)より必ず短い=溜めてから振る形が崩れていない', () => {
    // 天使ぶんはテーブルの実体で見る(正規表現より確実。期待している関係は初版から同じ)。
    for (const [label, act, wind] of [
      ['ミゲル 払い', MG_T.harai.active, MG_T.harai.windup],
      ['ウリ 大薙ぎ', UR_T.sweep.active, UR_T.sweep.windup],
      ['ウリ 振り下ろし', UR_T.downslash.active, UR_T.downslash.windup],
    ] as const) {
      expect(act, label).toBeLessThan(wind);
    }
  });

  it('★単一ソース化済みの定数は描画側に手写しリテラルが残っていない', () => {
    // v0.25.2893 で import 化した2つ。リテラル宣言が復活したら二重管理への逆行なので落とす。
    expect(pixiSceneSrc).not.toMatch(/const\s+MIMIR_BITE_RADIUS_VIS\s*=\s*\d+\s*;/);
    expect(pixiSceneSrc).not.toMatch(/const\s+ACRASIEL_WARP_TELEGRAPH_MS_VIS\s*=/);
  });
});

// =================================================================================================
// 天使6体(v0.25.3566・ボスメーカー横展開・第3弾)
// =================================================================================================
// 手写しの二重管理そのものを**無くした**ので、見張る対象が「同値か」から「単一ソースのままか」へ
// 変わった。①描画側にミラー定数が復活していないこと ②テーブルを実際に読んでいること
// ③まだ手写しが残っている数少ない箇所(T6細ビームの太さ/ジャンプ溜めの縦縮み)が同値であること。
describe('天使6体は単一ソース(angelScript.ts のテーブルを判定も描画も読む)', () => {
  // 復活したら落とす(=第一選択の「単一ソース化」から二重管理へ逆行させない)。
  const GONE = [
    'MIGUEL_HARAI_WINDUP_MS', 'MIGUEL_HARAI_ACTIVE_MS', 'MIGUEL_HARAI_VIS_HALFWIDTH',
    'RAFI_SWEEP_WINDUP_MS_VIS', 'URI_SWEEP_WINDUP_MS_VIS', 'URI_SWEEP_ACTIVE_MS',
    'URI_DOWNSLASH_WINDUP_MS_VIS', 'URI_DOWNSLASH_ACTIVE_MS',
    'SURIEL_SWEEP_WINDUP_MS_VIS', 'SURIEL_SWEEP_ACTIVE_MS_VIS',
    'SURIEL_RINGSHOT_BEAM_WINDUP_MS_VIS', 'SURIEL_RINGSHOT_ACTIVE_MS_VIS',
    'SURIEL_RINGSPIN_ACTIVE_MS_VIS', 'SURIEL_RINGSPIN_WINDUP_MS_VIS', 'SURIEL_GAZE_WINDUP_MS_VIS',
    'ACRASIEL_SPIKE_WINDUP_MS_VIS', 'ACRASIEL_SPIKE_ACTIVE_MS_VIS', 'ACRASIEL_SPIKE_RANGE_VIS',
    'ACRASIEL_BURST_ACTIVE_MS_VIS', 'ACRASIEL_BURST_RADIUS_VIS',
    'ACRASIEL_SPEAR_WINDUP_MS_VIS', 'ACRASIEL_GAZE_WINDUP_MS_VIS',
  ];
  it.each(GONE)('pixiScene に %s の手写しリテラルが無い', (name) => {
    expect(constValue(pixiSceneSrc, name), `${name} が手写しへ逆行している`).toBeNull();
  });

  it('描画側(pixiScene)がテーブルを import している', () => {
    expect(pixiSceneSrc).toMatch(/from '\.\.\/utils\/angelScript'/);
  });

  it('判定側(angelBossTick)がテーブルを import している', () => {
    expect(angelBossTickSrc).toMatch(/from '\.\/angelScript'/);
  });

  // まだ手写しが残っている箇所(理由つき)。ここは従来どおり同値を見張る。
  it('T6細ビームの描画半太さ=スリィエルの判定半太さ(1つの絵を2体で共用しているため手写しのまま)', () => {
    expect(constValue(pixiSceneSrc, 'THIN_BEAM_VIS_HALFWIDTH')).toBe(SR_T.beam.halfWidth);
  });
  // v0.25.3573: 共用していた「飛び掛かりの溜め」の手写し(THOR_JUMP_WINDUP_MS_VIS)は消え、
  // 描画はトールのテーブル(HB_TH.jump.windup)を読むようになった。絵を共用している以上、
  // **ラフィの判定側の溜めと既定が揃っていること**が引き続きの不変条件。
  it('飛び掛かりの溜め=ラフィとトールで既定が揃っている(1つの絵を2体で共用しているため)', () => {
    expect(constValue(pixiSceneSrc, 'THOR_JUMP_WINDUP_MS_VIS'), '手写しへ逆行している').toBeNull();
    expect(HB_TH.jump.windup).toBe(RF_T.jump.windup);
  });

  // 流用で作った既定値(別の欄として持っている=画面で片方だけ動かせる)。**既定は揃っている**こと。
  it('流用の既定値が揃っている(ミゲル払い⇔ウリ突き / 払いの振り⇔踏み込みの斬り抜け)', () => {
    expect(UR_T.thrust.range, 'ウリ突きの帯の長さ=ミゲル払いと同じ既定').toBe(MG_T.harai.range);
    expect(UR_T.thrust.halfWidth, 'ウリ突きの半幅=ミゲル払いと同じ既定').toBe(MG_T.harai.halfWidth);
    expect(MG_T.dash.strikeMs, '踏み込みの斬り抜け=払いの振りと同じ既定').toBe(MG_T.harai.active);
    expect(AC_T.spear.radius, '結晶の槍の半径=転移衝撃と同じ既定').toBe(AC_T.warp.impactRadius);
  });
});

// =================================================================================================
// 裏ボス4体(v0.25.3573・ボスメーカー横展開・第4弾)
// =================================================================================================
// 天使と同じく手写しの二重管理そのものを**無くした**ので、見張る対象は
// ①描画側にミラー定数が復活していないこと ②両側がテーブルを読んでいること ③流用の既定が揃っていること。
describe('裏ボス4体は単一ソース(hiddenBossScript.ts のテーブルを判定も描画も読む)', () => {
  const GONE_HIDDEN = [
    'THOR_ISSEN_WINDUP_MS', 'THOR_ISSEN_DASH_MS', 'THOR_ISSEN_VIS_HALFWIDTH',
    'THOR_HARAI_WINDUP_MS', 'THOR_HARAI_ACTIVE_MS', 'THOR_HARAI_VIS_HALFWIDTH',
    'THOR_TSUKI_WINDUP_MS', 'THOR_TSUKI_MS', 'THOR_TSUKI_VIS_HALFWIDTH',
    'THOR_JUMP_RADIUS', 'THOR_JUMP_WINDUP_MS_VIS',
    'MIMIR_BITE_WINDUP_MS_VIS', 'JORM_COIL_WINDUP_MS_VIS', 'JORM_COIL_ACTIVE_MS_VIS',
    'SKADI_PRE_WINDUP_MS_VIS', 'SKADI_CAGE_WINDUP_MS_VIS', 'BOSS_DASH_WINDUP_MS_VIS',
  ];
  it.each(GONE_HIDDEN)('pixiScene に %s の手写しリテラルが無い', (name) => {
    expect(constValue(pixiSceneSrc, name), `${name} が手写しへ逆行している`).toBeNull();
  });

  it('描画側(pixiScene)がテーブルを import している', () => {
    expect(pixiSceneSrc).toMatch(/from '\.\.\/utils\/hiddenBossScript'/);
  });

  it('判定側(useGameLoop)がテーブルを import している', () => {
    expect(useGameLoopSrc).toMatch(/from '\.\.\/utils\/hiddenBossScript'/);
  });

  it('★振り(ACTIVE)は予告(WINDUP)より必ず短い=溜めてから振る形が崩れていない', () => {
    for (const [label, act, wind] of [
      ['トール 払い', HB_TH.harai.active, HB_TH.harai.windup],
      ['トール 突き', HB_TH.tsuki.ms, HB_TH.tsuki.windup],
      ['ヨルムンガルド うねり', HB_JO.coil.active, HB_JO.coil.windup],
    ] as const) {
      expect(act, label).toBeLessThan(wind);
    }
  });

  it('4体で共有している値は同じ実体(複製されていない)', () => {
    expect(HB_MI.common).toBe(HB_C);
    expect(HB_JO.common).toBe(HB_C);
    expect(HB_SK.common).toBe(HB_C);
    expect(HB_TH.common).toBe(HB_C);
  });
});
