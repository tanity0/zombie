import { describe, it, expect } from 'vitest';
// ソースを**テキストとして**読む(Viteの ?raw)。pixiScene.ts 側の定数は export されていないので
// import では取れない。node:fs は tsconfig.app に node 型が無く typecheck が通らないためこちらを使う。
import angelBossTickSrc from './angelBossTick.ts?raw';
import pixiSceneSrc from '../pixi/pixiScene.ts?raw';
import useGameLoopSrc from '../hooks/useGameLoop.ts?raw';
import mimirLaserTrackSrc from './mimirLaserTrack.ts?raw';

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
  // --- 天使: ミゲル/ウリ(剣・v0.25.2885の初版ぶん) ---
  ['angelBossTick', 'MIGUEL_HARAI_ACTIVE_MS', 'MIGUEL_HARAI_ACTIVE_MS'],
  ['angelBossTick', 'MIGUEL_HARAI_WINDUP_MS', 'MIGUEL_HARAI_WINDUP_MS'],
  ['angelBossTick', 'MIGUEL_HARAI_HALF_WIDTH', 'MIGUEL_HARAI_VIS_HALFWIDTH'],
  ['angelBossTick', 'URI_SWEEP_ACTIVE_MS', 'URI_SWEEP_ACTIVE_MS'],
  ['angelBossTick', 'URI_SWEEP_WINDUP_MS', 'URI_SWEEP_WINDUP_MS_VIS'],
  ['angelBossTick', 'URI_DOWNSLASH_ACTIVE_MS', 'URI_DOWNSLASH_ACTIVE_MS'],
  ['angelBossTick', 'URI_DOWNSLASH_WINDUP_MS', 'URI_DOWNSLASH_WINDUP_MS_VIS'],
  // --- 天使: ラフィ/スリィエル/アクラシエル(v0.25.2893で拡張) ---
  ['angelBossTick', 'RAFI_SWEEP_WINDUP_MS', 'RAFI_SWEEP_WINDUP_MS_VIS'],
  ['angelBossTick', 'SURIEL_SWEEP_WINDUP_MS', 'SURIEL_SWEEP_WINDUP_MS_VIS'],
  ['angelBossTick', 'SURIEL_SWEEP_ACTIVE_MS', 'SURIEL_SWEEP_ACTIVE_MS_VIS'],
  ['angelBossTick', 'SURIEL_RINGSHOT_BEAM_WINDUP_MS', 'SURIEL_RINGSHOT_BEAM_WINDUP_MS_VIS'],
  ['angelBossTick', 'SURIEL_RINGSHOT_ACTIVE_MS', 'SURIEL_RINGSHOT_ACTIVE_MS_VIS'],
  ['angelBossTick', 'SURIEL_RINGSPIN_ACTIVE_MS', 'SURIEL_RINGSPIN_ACTIVE_MS_VIS'],
  ['angelBossTick', 'SURIEL_BEAM_HALF_WIDTH', 'THIN_BEAM_VIS_HALFWIDTH'],
  ['angelBossTick', 'ACRASIEL_SPIKE_WINDUP_MS', 'ACRASIEL_SPIKE_WINDUP_MS_VIS'],
  ['angelBossTick', 'ACRASIEL_SPIKE_ACTIVE_MS', 'ACRASIEL_SPIKE_ACTIVE_MS_VIS'],
  ['angelBossTick', 'ACRASIEL_SPIKE_RANGE_PX', 'ACRASIEL_SPIKE_RANGE_VIS'],
  ['angelBossTick', 'ACRASIEL_BURST_ACTIVE_MS', 'ACRASIEL_BURST_ACTIVE_MS_VIS'],
  ['angelBossTick', 'ACRASIEL_BURST_RADIUS', 'ACRASIEL_BURST_RADIUS_VIS'],
  ['angelBossTick', 'ACRASIEL_SPEAR_WINDUP_MS', 'ACRASIEL_SPEAR_WINDUP_MS_VIS'],
  ['angelBossTick', 'ACRASIEL_GAZE_WINDUP_MS', 'ACRASIEL_GAZE_WINDUP_MS_VIS'],
  // --- 裏ボス: ミーミル/トール/ヨルムンガルド(useGameLoop側・v0.25.2893で拡張) ---
  ['mimirLaserTrack', 'MIMIR_LASER_WINDUP_MS', 'MIMIR_LASER_WINDUP_MS'],
  ['useGameLoop', 'MIMIR_LASER_FIRE_MS', 'MIMIR_LASER_FIRE_MS'],
  ['useGameLoop', 'MIMIR_LASER_RANGE', 'MIMIR_LASER_VIS_RANGE'],
  ['useGameLoop', 'MIMIR_LASER_HALF_WIDTH', 'MIMIR_LASER_VIS_HALFWIDTH'],
  ['useGameLoop', 'MIMIR_BITE_WINDUP_MS', 'MIMIR_BITE_WINDUP_MS_VIS'],
  ['useGameLoop', 'JORM_COIL_WINDUP_MS', 'JORM_COIL_WINDUP_MS_VIS'],
  ['useGameLoop', 'THOR_ISSEN_WINDUP_MS', 'THOR_ISSEN_WINDUP_MS'],
  ['useGameLoop', 'THOR_ISSEN_DASH_MS', 'THOR_ISSEN_DASH_MS'],
  ['useGameLoop', 'THOR_ISSEN_HALF_WIDTH', 'THOR_ISSEN_VIS_HALFWIDTH'],
  ['useGameLoop', 'THOR_HARAI_WINDUP_MS', 'THOR_HARAI_WINDUP_MS'],
  ['useGameLoop', 'THOR_HARAI_ACTIVE_MS', 'THOR_HARAI_ACTIVE_MS'],
  ['useGameLoop', 'THOR_HARAI_HALF_WIDTH', 'THOR_HARAI_VIS_HALFWIDTH'],
  ['useGameLoop', 'THOR_TSUKI_WINDUP_MS', 'THOR_TSUKI_WINDUP_MS'],
  ['useGameLoop', 'THOR_TSUKI_MS', 'THOR_TSUKI_MS'],
  ['useGameLoop', 'THOR_TSUKI_HALF_WIDTH', 'THOR_TSUKI_VIS_HALFWIDTH'],
  ['useGameLoop', 'THOR_JUMP_RADIUS', 'THOR_JUMP_RADIUS'],
];

describe('ボスの判定側と描画側の手写し定数が一致していること', () => {
  it.each(PAIRS)('%s.%s(判定) と pixiScene.%s(描画) が同値', (srcKey, logicName, viewName) => {
    const a = constValue(SOURCES[srcKey], logicName);
    const b = constValue(pixiSceneSrc, viewName);
    // null は「定数が消えた/式に変わった」。単一ソース化(import化)したならこの表から行を消すこと。
    expect(a, `${srcKey}.ts の ${logicName} が見つからない`).not.toBeNull();
    expect(b, `pixiScene.ts の ${viewName} が見つからない`).not.toBeNull();
    expect(b, `${logicName}=${a} と ${viewName}=${b} がズレている`).toBe(a);
  });

  it('★振り(ACTIVE)は予告(WINDUP)より必ず短い=溜めてから振る形が崩れていない', () => {
    for (const [act, wind] of [
      ['MIGUEL_HARAI_ACTIVE_MS', 'MIGUEL_HARAI_WINDUP_MS'],
      ['URI_SWEEP_ACTIVE_MS', 'URI_SWEEP_WINDUP_MS'],
      ['URI_DOWNSLASH_ACTIVE_MS', 'URI_DOWNSLASH_WINDUP_MS'],
    ]) {
      expect(constValue(angelBossTickSrc, act)!, act).toBeLessThan(constValue(angelBossTickSrc, wind)!);
    }
  });

  it('★単一ソース化済みの定数は描画側に手写しリテラルが残っていない', () => {
    // v0.25.2893 で import 化した2つ。リテラル宣言が復活したら二重管理への逆行なので落とす。
    expect(pixiSceneSrc).not.toMatch(/const\s+MIMIR_BITE_RADIUS_VIS\s*=\s*\d+\s*;/);
    expect(pixiSceneSrc).not.toMatch(/const\s+ACRASIEL_WARP_TELEGRAPH_MS_VIS\s*=/);
  });
});
