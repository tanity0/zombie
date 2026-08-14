// ボス戦テストメニュー(社長依頼2026-07-31)。タイトル画面の入口から開く**開発チャネル用**オーバーレイ。
// 実ステージへ既存の強制出現パラメータ付きで出撃する(仕組みは utils/bossTest.ts のコメント参照)。
// 出撃=ページ再読込(location遷移)なのでReact状態はこの画面を開いている間だけ=プレイ中コストゼロ。
// ※アプリ配布(最終形)ではこの入口ごと非表示にする想定(TitleScreen側の1フラグで消せる)。
import React, { useState } from 'react';
import {
  BOSS_TEST_ENTRIES, bossTestQuery, bossMakerQuery,
  type BossTestEntry, type BossTestGhostMode,
} from '../../utils/bossTest';
import { enemyDeathLabel } from '../../store/gameStore';
import { getStage } from '../../data/campaign';

const CLASSES = [
  { key: 'warrior', label: 'ウォリアー' },
  { key: 'mage', label: 'メイジ' },
  { key: 'rogue', label: 'ローグ' },
  { key: 'necromancer', label: 'ネクロ' },
] as const;

// 出撃方式の注記(何がどう出るか)。パラメータの実挙動(useGameLoop)に合わせた説明文。
const PARAM_NOTE: Record<BossTestEntry['param'], string> = {
  bossnow: '近くへ即出現',
  idolnow: '強制召喚',
  gateboss: '拘束サークル+即発動',
  castlenow: '城へ即出現(移動あり)',
  bountynow: '700〜1000px先へdormant出現(§6.38 B1)',
};

// 社長報告v0.25.2852「ボス戦モードが守護霊必須になっててソロで戦えない」: **なし(ソロ)を先頭に足す**。
// `null` = 召喚しない。`bossTestQuery` は元から `ghostMode` が falsy なら ?ghost を付けない作りなので、
// URL側の対応は不要(型が `BossTestGhostMode | null` を許している)。
const GHOST_MODES: readonly { key: BossTestGhostMode | null; label: string; note: string }[] = [
  { key: null, label: 'なし', note: 'ソロ' },
  { key: 'own', label: '守護霊', note: '自分' },
  { key: 'random', label: '守護霊(有志)', note: 'ランダム' },
  { key: 'top', label: '守護霊(猛者)', note: '評点上位20%' },
];

interface Props { onClose?: () => void }

const BossTestMenu: React.FC<Props> = ({ onClose }) => {
  const [cls, setCls] = useState<string>('warrior');
  const [ghostMode, setGhostMode] = useState<BossTestGhostMode | null>('own');
  const [ghostlog, setGhostlog] = useState(false);

  const sortie = (e: BossTestEntry): void => {
    window.location.search = bossTestQuery(e, { characterClass: cls, ghostMode, ghostlog });
  };

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/75 px-4 py-6"
      onClick={ev => ev.stopPropagation()}
    >
      <div className="flex max-h-full w-full max-w-md flex-col overflow-hidden border border-purple-400/40 bg-[#0b0a12]/95">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <h2 className="text-[13px] font-bold tracking-[0.18em] text-white" style={{ borderBottom: '1px solid rgba(168,85,247,0.6)' }}>
            ボス戦テスト
          </h2>
          {/* ツールページの根として出す時は閉じ先が無い(v0.25.2862)。 */}
          {onClose && <button className="px-2 py-1 text-[12px] text-white/60" onClick={onClose}>閉じる</button>}
        </div>
        <div className="px-4 pb-2 text-[10px] leading-relaxed text-white/45">
          実ステージへ直行してボスが即出現します(環境・サークル・雑魚は本物)。選ぶと再読込して出撃。
        </div>
        {/* ボスメーカー(BOSS_MAKER.md §3): 入口はここに1項目だけ足す。本編の導線からは入れない。 */}
        <div className="px-4 pb-3">
          <button
            className="w-full border border-emerald-400/50 bg-emerald-500/10 px-3 py-2 text-left"
            // 別ページ(開発用ツール)へ飛ぶ。BOSS_MAKER.md §19-5-b。
            // `/zombie/` を直書きしない: pages.yml は `--base=/zombie/v2/` の v2 線も合成デプロイ
            // しているので、直書きすると v2 で 404 になる。
            // v0.25.2862: このメニュー自体がボスメーカーのページに載ったので、別ページへ飛ばず
            // 同じページのクエリを差し替えるだけでよい(強制出現フラグは読込時定数=再読込は必要)。
            onClick={() => { window.location.search = bossMakerQuery({ characterClass: cls, ghostMode: null, ghostlog: false }); }}
          >
            <div className="text-[12px] font-bold text-emerald-300">ボスメーカー(調整部屋)</div>
            <div className="text-[10px] text-white/50">
              一騎打ちの訓練場。無敵・湧きなし・方眼。数字を画面で回してその場で反映 → コピーで共有。
            </div>
          </button>
        </div>
        {/* クラスとトグル */}
        <div className="flex flex-wrap items-center gap-1 px-4 pb-2">
          {CLASSES.map(c => (
            <button
              key={c.key}
              className={`px-2 py-1 text-[11px] ${cls === c.key ? 'bg-purple-500/40 text-white' : 'bg-white/5 text-white/55'}`}
              onClick={() => setCls(c.key)}
            >{c.label}</button>
          ))}
        </div>
        <div className="px-4 pb-2">
          <div className="mb-1 text-[10px] text-white/45">同行する霊</div>
          <div className="grid grid-cols-4 gap-1">
            {GHOST_MODES.map(mode => (
              <button
                key={mode.key ?? 'none'}
                type="button"
                className={`px-1 py-1.5 text-center ${ghostMode === mode.key ? 'bg-sky-500/35 text-white' : 'bg-white/5 text-white/50'}`}
                onClick={() => setGhostMode(mode.key)}
              >
                <span className="block text-[10px] font-semibold">{mode.label}</span>
                <span className="block text-[8px] text-white/45">{mode.note}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 pb-2 text-[11px] text-white/70">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={ghostlog} onChange={ev => setGhostlog(ev.target.checked)} />
            被弾ログ(console)
          </label>
        </div>
        {/* ボス一覧 */}
        <div className="overflow-y-auto overscroll-contain touch-pan-y px-4 pb-4">
          {BOSS_TEST_ENTRIES.map(e => {
            const stage = getStage(e.stageId);
            return (
              <button
                key={`${e.boss}-${e.stageId}-${e.param}`}
                className="mt-1 flex w-full items-baseline justify-between gap-2 bg-white/5 px-3 py-2 text-left hover:bg-purple-500/25"
                onClick={() => sortie(e)}
              >
                <span className="text-[12px] font-bold text-white/90">{enemyDeathLabel(e.boss)}</span>
                <span className="shrink-0 text-[10px] text-white/45">
                  {stage?.locationTitle ?? e.stageId}・{PARAM_NOTE[e.param]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default BossTestMenu;
