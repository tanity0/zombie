// ボス戦テストメニュー(社長依頼2026-07-31)。タイトル画面の入口から開く**開発チャネル用**オーバーレイ。
// 実ステージへ既存の強制出現パラメータ付きで出撃する(仕組みは utils/bossTest.ts のコメント参照)。
// 出撃=ページ再読込(location遷移)なのでReact状態はこの画面を開いている間だけ=プレイ中コストゼロ。
// ※アプリ配布(最終形)ではこの入口ごと非表示にする想定(TitleScreen側の1フラグで消せる)。
import React, { useState } from 'react';
import {
  BOSS_TEST_ENTRIES, bossTestQuery, bossMakerQuery, BOSS_MAKER_BOSSES, BOSS_MAKER_CASTLE_STAGES,
  type BossTestEntry, type BossTestGhostMode,
} from '../../utils/bossTest';
import { VS_ENTRIES, vsQuery } from '../../utils/vsTest';
import { enemyDeathLabel } from '../../store/gameStore';
import { bossCutinName } from '../../data/bossCutin';
import { glenForm2CutinPayload } from '../../utils/attentionCutin';
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
  phantomnow: '近くへ即出現(決闘・research/GHOST_BOSS.md)',
  phillnow: '前方へ即出現(EXボス「フィル(変異体)」・PACING_PUZZLE.md §10)',
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
  // BOSS_MAKER.md §21-4: 弾ゼロ(撃てない=近接とカウンターだけ)。1対1は常にこれで出す。
  const [noAmmo, setNoAmmo] = useState(false);

  const sortie = (e: BossTestEntry): void => {
    window.location.search = bossTestQuery(e, { characterClass: cls, ghostMode, ghostlog, noAmmo });
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
        {/* ★社長報告2026-09-23「敵テスターがスクロールできない」: **本文まるごと**を1つのスクロール域にする。
            旧実装は「ボス一覧だけ」がスクロールし、その上(ボスメーカー/1対1/クラス/守護霊/トグル)は
            固定だった。1対1の節(15行)が増えて**固定部だけで画面を越え**、下が見えないまま掴めなくなった。
            `min-h-0` が要る: flex の子は既定で縮まないので、これが無いと `overflow-y-auto` が効かない。
            見出しは外に置いたまま=**何の画面かは常に見えている**。 */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y">
        <div className="px-4 pb-2 text-[10px] leading-relaxed text-white/45">
          実ステージへ直行してボスが即出現します(環境・サークル・雑魚は本物)。選ぶと再読込して出撃。
        </div>
        {/* ボスメーカー(BOSS_MAKER.md §3): 入口はここ。本編の導線からは入れない。
            v0.25.3558(フェーズ4・第1弾): 相手を選べるようにした=ボタン1つ=1体(押した相手で部屋を立てる)。
            別ページへは飛ばず同じページのクエリを差し替えるだけ(強制出現フラグは読込時定数=再読込は必要)。 */}
        <div className="px-4 pb-3">
          <div className="mb-1 text-[10px] text-white/45">
            ボスメーカー(調整部屋)— 一騎打ちの訓練場。無敵・湧きなし・方眼。数字を画面で回してその場で反映。
          </div>
          <div className="grid grid-cols-2 gap-1">
            {BOSS_MAKER_BOSSES.filter(b => b !== 'giantbat').map(b => (
              <button
                key={b}
                className="border border-emerald-400/50 bg-emerald-500/10 px-2 py-2 text-left text-[12px] font-bold text-emerald-300"
                onClick={() => {
                  window.location.search = bossMakerQuery({ characterClass: cls, ghostMode: null, ghostlog: false }, b);
                }}
              >
                {bossCutinName(b) ?? enemyDeathLabel(b)}
              </button>
            ))}
          </div>
          {/* ★城ボス(社長指摘2026-09-25「ボスメーカーに城ボスたちがいない」)。
              **1つの型(giantbat)でステージごとに別人**——絵も台本も stageId で決まるので、
              上の並びに1つ置くと1体しか立たない。**ステージごとに1つ**並べ、部屋もそのステージで立てる。 */}
          <div className="mt-2 mb-1 text-[10px] text-white/45">
            城ボス — 同じ型でステージごとに別人(絵も技もステージで決まる)。部屋はそのステージで立つ。
          </div>
          <div className="grid grid-cols-3 gap-1">
            {BOSS_MAKER_CASTLE_STAGES.map(sid => (
              <button
                key={sid}
                className="border border-emerald-400/50 bg-emerald-500/10 px-2 py-2 text-left text-[12px] font-bold text-emerald-300"
                onClick={() => {
                  window.location.search = bossMakerQuery({ characterClass: cls, ghostMode: null, ghostlog: false }, 'giantbat', sid);
                }}
              >
                <span className="block">{bossCutinName('giantbat', sid) ?? '?'}</span>
                <span className="block text-[8px] font-normal text-emerald-300/45">{getStage(sid)?.name ?? sid}</span>
              </button>
            ))}
            {/* ★グレン第二形態(社長指摘2026-09-26「ボスメーカーに第二形態がいない」)。本編では形態1を倒すと
                別個体として湧くので、部屋では最初からその個体を立てる。 */}
            {BOSS_MAKER_CASTLE_STAGES.includes('stage-7') && (
              <button
                key="stage-7-form2"
                className="border border-emerald-400/50 bg-emerald-500/10 px-2 py-2 text-left text-[12px] font-bold text-emerald-300"
                onClick={() => {
                  window.location.search = bossMakerQuery({ characterClass: cls, ghostMode: null, ghostlog: false }, 'giantbat', 'stage-7', true);
                }}
              >
                <span className="block">{glenForm2CutinPayload().name}</span>
                <span className="block text-[8px] font-normal text-emerald-300/45">{getStage('stage-7')?.name ?? 'stage-7'}</span>
              </button>
            )}
          </div>
        </div>
        {/* BOSS_MAKER.md §21(1対1の間合い): 弾ゼロで相手1体だけと向き合う枠。挙動とカウンターの確認用。
            専用の部屋は作らず、実ステージへ出て湧きだけを止める(§21-1)。 */}
        <div className="px-4 pb-3">
          <div className="mb-1 text-[10px] text-white/45">
            1対1 — 弾ゼロ・湧きなし・進行を書かない。倒すと同じ相手がまた出る。
            ※死神とハンターは制御機(発見/撤退/増援/使者の召喚)が湧きと一緒に止まる=その分だけ本物ではない。
          </div>
          <div className="grid grid-cols-3 gap-1">
            {VS_ENTRIES.map(v => (
              <button
                key={v.key}
                className="border border-amber-400/50 bg-amber-500/10 px-2 py-2 text-left text-[11px] font-bold text-amber-200"
                onClick={() => { window.location.search = vsQuery(v, cls, true); }}
              >
                {/* ★名前は台帳(enemyDeathLabel)から引く=ここで名前を作らない。
                    ただし台帳に行が無い型は「変異体」に落ちて見分けが付かないので、
                    内部の型名も小さく添える(開発用の一覧なのでこれで足りる)。 */}
                <span className="block">{enemyDeathLabel(v.type)}{v.note ? `（${v.note}）` : ''}</span>
                <span className="block text-[8px] font-normal text-amber-200/45">{v.type}</span>
              </button>
            ))}
          </div>
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
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={noAmmo} onChange={ev => setNoAmmo(ev.target.checked)} />
            弾ゼロ
          </label>
        </div>
        {/* ボス一覧 */}
        <div className="px-4 pb-4">
          {BOSS_TEST_ENTRIES.map(e => {
            const stage = getStage(e.stageId);
            return (
              <button
                key={`${e.boss}-${e.stageId}-${e.param}`}
                className="mt-1 flex w-full items-baseline justify-between gap-2 bg-white/5 px-3 py-2 text-left hover:bg-purple-500/25"
                onClick={() => sortie(e)}
              >
                {/* 名称統一バッチ(社長指示v0.25.3443): 城ボスは型が全部giantbatなので、ステージ別の呼び名は台帳(bossCutin.ts)を
                    第一候補に引く(TitleScreenのモード表示v0.25.3166と同型)。台帳に無い=「?」。 */}
                <span className="text-[12px] font-bold text-white/90">{bossCutinName(e.boss, e.stageId) ?? enemyDeathLabel(e.boss)}</span>
                <span className="shrink-0 text-[10px] text-white/45">
                  {stage?.locationTitle ?? e.stageId}・{PARAM_NOTE[e.param]}
                </span>
              </button>
            );
          })}
        </div>
        </div>
      </div>
    </div>
  );
};

export default BossTestMenu;
