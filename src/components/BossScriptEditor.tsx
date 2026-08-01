// ボスメーカーの**台本エディタ**(BOSS_MAKER.md §11・3便目 v0.25.2642)。
//
// 社長要望(v0.25.2632):
//   > これ技をパズルピースみたいにできる? / で、遠近中の枠にはめていく。**台本の数の+-** /
//   > **技の段は入れ放題**
//
// 形: **1本の台本 = 1行のチップの並び**。チップを押すとその段のメニューが開き、
//     「差し替え / 後ろに足す / 消す / ←→で入れ替え」ができる。
//   ・**+/− は台本の本数**(社長の言い方どおり)。段は行内の「＋」で好きなだけ足せる。
//   ・**フェーズ上限で切られる段は薄く表示**(社長要望「書いたのに出ない」を目で分かるように)。
//
// ★このコンポーネントは**ボスを一切知らない**。操作は全部 `entry.scripts`(BossScriptApi)経由なので、
// ボスを足す側がそれを1個宣言すればこの画面がそのまま生える(スキーマ駆動フォームと同じ考え方)。
//
// ★React再描画の規律(CLAUDE.md): store を購読しない。親が `bump` で再描画を促す。
import { useState } from 'react';
import type { BossScriptApi } from '../utils/bossTuning';

const chip = 'shrink-0 rounded px-2 py-1 text-[11px] leading-none';

export const BossScriptEditor = ({ api, onChanged, note }: {
  api: BossScriptApi;
  /** 編集後に呼ぶ(親が保存と再描画をする)。 */
  onChanged: (message: string) => void;
  note?: string;
}) => {
  // 開いている段のメニュー("si:mi")。1つだけ開く=画面を食わない。
  const [open, setOpen] = useState<string | null>(null);

  const rows = api.rows();
  const moves = api.moveChoices();
  const zones = api.zoneChoices();
  const cut = api.cutoff();
  const warns = api.warnings();

  const run = (fn: () => { ok: boolean; message: string }) => {
    const r = fn();
    onChanged(r.message);
    if (r.ok) setOpen(null);
  };

  return (
    <div className="mb-1 rounded bg-white/[0.05] px-1.5 py-1.5">
      <div className="mb-1 flex items-center gap-1">
        <span className="text-[12px] font-bold text-emerald-300/90">台本</span>
        <span className="text-[9px] text-white/40">
          P1は{cut.p1}段 / P2は{cut.p2}段まで出る(それ以降は薄く表示)
        </span>
        <button
          className={`${chip} ml-auto bg-sky-500/85 font-bold text-black`}
          onClick={() => run(() => api.edit({ t: 'addScript' }))}
        >＋台本</button>
      </div>

      {rows.map((r, si) => (
        <div key={si} className="mb-1 rounded bg-black/30 px-1.5 py-1">
          {/* 1行目: 距離帯 + 重み + 台本を消す */}
          <div className="mb-1 flex items-center gap-1">
            <select
              className="h-6 shrink-0 rounded bg-black/50 px-1 text-[10px] text-white outline-none"
              value={r.zone}
              onChange={e => run(() => api.edit({ t: 'setZone', si, zone: e.target.value }))}
            >
              {zones.map(z => <option key={z.key} value={z.key}>{z.label}</option>)}
            </select>
            <span className="text-[10px] text-white/50">重み</span>
            <button
              className={`${chip} bg-white/10 text-white/80`}
              onClick={() => run(() => api.edit({ t: 'setWeight', si, weight: r.weight - 5 }))}
            >−</button>
            <span className={`w-8 text-center font-mono text-[11px] ${r.weight === 0 ? 'text-white/30' : 'text-white'}`}>{r.weight}</span>
            <button
              className={`${chip} bg-white/10 text-white/80`}
              onClick={() => run(() => api.edit({ t: 'setWeight', si, weight: r.weight + 5 }))}
            >＋</button>
            <button
              className={`${chip} ml-auto bg-white/10 text-white/50`}
              title="この台本を消す"
              onClick={() => run(() => api.edit({ t: 'removeScript', si }))}
            >✕</button>
          </div>

          {/* 2行目: 段のチップ。押すとメニューが開く */}
          <div className="flex flex-wrap items-center gap-1">
            {r.moves.map((m, mi) => {
              const dead = mi >= cut.p2;                 // P2でも届かない=絶対に出ない
              const p1only = !dead && mi >= cut.p1;      // P2でだけ出る
              const key = `${si}:${mi}`;
              return (
                <div key={key} className="relative">
                  <button
                    className={`${chip} ${dead ? 'bg-white/5 text-white/25 line-through'
                      : p1only ? 'bg-white/10 text-white/55' : 'bg-emerald-500/80 text-black'}`}
                    onClick={() => setOpen(open === key ? null : key)}
                    title={dead ? 'フェーズ上限の外=出ない' : p1only ? 'Phase2でだけ出る' : ''}
                  >{mi + 1}. {m.label}</button>
                  {open === key && (
                    <div className="absolute left-0 top-full z-10 mt-0.5 w-[190px] rounded bg-black/95 p-1 ring-1 ring-emerald-400/40">
                      <div className="mb-1 flex gap-1">
                        <button className={`${chip} flex-1 bg-white/10 text-white/80`}
                          onClick={() => run(() => api.edit({ t: 'moveStep', si, mi, dir: -1 }))}>←</button>
                        <button className={`${chip} flex-1 bg-white/10 text-white/80`}
                          onClick={() => run(() => api.edit({ t: 'moveStep', si, mi, dir: 1 }))}>→</button>
                        <button className={`${chip} flex-1 bg-white/10 text-white/50`}
                          onClick={() => run(() => api.edit({ t: 'removeStep', si, mi }))}>消す</button>
                      </div>
                      <div className="mb-0.5 text-[9px] text-white/40">この段を差し替え</div>
                      <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
                        {moves.map(mo => (
                          <button key={mo.key}
                            className={`${chip} ${mo.key === m.key ? 'bg-emerald-500/80 text-black' : 'bg-white/10 text-white/80'}`}
                            onClick={() => run(() => api.edit({ t: 'setStep', si, mi, move: mo.key }))}
                          >{mo.label}</button>
                        ))}
                      </div>
                      <div className="mb-0.5 mt-1 text-[9px] text-white/40">後ろに足す</div>
                      <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
                        {moves.map(mo => (
                          <button key={mo.key} className={`${chip} bg-sky-500/25 text-sky-100`}
                            onClick={() => run(() => api.edit({ t: 'insertStep', si, mi, move: mo.key }))}
                          >＋{mo.label}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {warns.length > 0 && (
        <div className="mt-1 text-[9px] leading-tight text-amber-300/80">
          {warns.map(w => <div key={w}>⚠ {w}</div>)}
        </div>
      )}
      {note && <div className="mt-1 truncate text-[10px] text-white/70">{note}</div>}
    </div>
  );
};
