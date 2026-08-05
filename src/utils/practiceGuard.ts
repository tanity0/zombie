// 練習ラン(ボスラッシュ)で「本編の進行を1つも動かさない」ための関所。BOSS_MAKER.md §20-6。
//
// ★なぜ書き込み側に散らさず、ここで1回止めるのか(品質監査 v0.25.2856 の致命1)
// 「勝利処理を塞げばよい」は**全く足りなかった**。実コードを読むと、練習で汚れる書き込みは
// 少なくとも**12箇所**あり、しかもその筆頭は勝利画面を経由しない:
//   - 城ボスが**死んだ瞬間**に `markCastleBossCleared` → `syncQuestStageClear` →
//     `markStageCleared` まで到達する(stage-3/4/5 は `forced:false` なので無条件で通る)
//   - **トール討伐で小烏丸が恒久解禁**
//   - リザルトで**ゴールド加算・資料室解放・ハイスコア更新・掘削記録追加**
//   - 守護霊プロファイルへの反映と**オンライン送信**
//   - **次ランの開始ランク**が変わる(=本編の難易度が動く)
//   - ラン中の 自己最深 / 区域到達 / 拠点解放 / クエスト進捗
// これらに `if (練習) return;` を12個置くと、**今日は塞げても明日足された書き込みが漏れる**。
// このプロジェクトは「同じ動作が複数経路に分かれていて1つ書き忘れる」事故を繰り返している。
//
// ⇒ **練習ランは localStorage への書き込みを丸ごと止める**(=「練習は何も残さない」を定義そのものにする)。
//    受け入れ条件「練習ラン前後の localStorage 差分がゼロ」と**同じ物**をここで実現しているので、
//    後から書き込みが増えても**既定で塞がれている**。
//
// 例外(許可リスト)は**プレイヤーの設定だけ**。練習中に音量やグラフィック設定をいじった時に、
// それだけ巻き添えで消えるのは筋が違うため。進行(`zombie.progress.*`)や記録類は**全て止める**。
import { PRACTICE_RUN } from './bossPractice';

/** 練習中でも保存してよいキー = プレイヤーの設定。進行・記録は1つも入れない。 */
export const PRACTICE_WRITE_ALLOWLIST: readonly string[] = [
  'zombie:speed',      // ゲーム速度(config/gameSpeed.ts)
  'zombie:gfx:bloom',  // ブルームON/OFF(config/graphics.ts)
  'zombie:renderer',   // レンダラ選択(config/renderer.ts)
];

export const isPracticeWritable = (key: string): boolean => PRACTICE_WRITE_ALLOWLIST.includes(key);

let installed = false;

/**
 * 練習ランなら localStorage の書き込みを封じる。**起動時に1回だけ**呼ぶ(`bootstrap.ts`)。
 * 読み取りは一切触らない(装備・スキル・設定はそのまま効く=本番と同じビルドで練習できる)。
 *
 * ※呼ぶ場所: React を描く前。ラン中の書き込みは全てそれより後なので間に合う。
 */
export const installPracticeGuard = (): void => {
  if (installed || !PRACTICE_RUN) return;
  installed = true;
  try {
    const store = window.localStorage;
    const setItem = store.setItem.bind(store);
    const removeItem = store.removeItem.bind(store);
    const clear = store.clear.bind(store);
    Object.defineProperties(store, {
      setItem: {
        configurable: true,
        value: (key: string, value: string) => { if (isPracticeWritable(key)) setItem(key, value); },
      },
      removeItem: {
        configurable: true,
        value: (key: string) => { if (isPracticeWritable(key)) removeItem(key); },
      },
      clear: { configurable: true, value: () => { /* 練習中の全消しは通さない */ void clear; } },
    });
  } catch {
    // 差し替えられない環境でも起動は止めない(その場合は書き込みが通る=従来どおり)。
  }
};
