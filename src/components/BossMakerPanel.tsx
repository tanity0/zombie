// ボスメーカーの調整UI(BOSS_MAKER.md §1-4/§1-5)。
//
// ★社長補足v0.25.2621「**一騎打ちのトレーニング場 兼 メーカー**。その場で動かしながら数字を調整する」:
// これは設定画面ではなく**戦いながら回す道具**。よって主たる操作は「打つ」ではなく「**摘まむ**」。
//   ① 値の上を左右にドラッグ = スクラブ(指1本で回せる。モバイルでソフトキーボードが出ない)
//   ② +/− ボタン(1タップで刻む・押しっぱなしで連続)
//   ③ 直接入力は**副**(タップで開く。開いている間だけ移動入力を殺す=useGameControls側で実装)
//
// ★レイアウト作り直し(社長指示v0.25.2628・iPhone縦持ちの実機スクショで判明した破綻):
// 旧「左右に浮かぶ2枚の板」は**PC的なレイアウト**で、縦持ちスマホでは
//   ・上部ボタン列が1文字ずつ縦に潰れる ・左右の板が重なる ・ゲームHUDとも重なる
//   ・画面の3/4が板で埋まり**戦いが見えない**(道具として本末転倒)
// が同時に起きていた。よって:
//   ① **ボトムシート**(つまみをドラッグして 閉じる/半分/全画面 の3段。半分の時は上半分にゲームが見える)
//   ② **タブ**で「行動パターン」「技」を切替え、常に1枚だけ=横幅を丸ごと使う
//   ③ **ピン留め**(調整中の1〜3項目だけシートを閉じても下端に残る=それを回しながら戦える)
//   ④ 部屋ではゲームHUDを消す(トグルで戻せる)
//   ⑤ 上部は**アイコン+横スクロール**
//
// ★React再描画の規律(CLAUDE.md): このコンポーネントは **store を毎フレーム購読しない**。
// 毎フレーム変わる表示(状態名/距離/経過ms)は BossMakerLive.tsx へ隔離してある。
// ここが再描画されるのは「数値を触った時」「トグルを押した時」だけ。
// **シートのドラッグ中は state を更新しない**(DOMのstyleを直接動かし、離した時に1回だけ確定する)。
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import type { Enemy } from '../types/game';
import {
  getBossTuning, getAtPath, setAtPath, clampField, changedPaths, resetTuning,
  formatTuningText, parseTuningText, saveTuning, applySavedTuning, clearSavedTuning,
  getTextAtPath, setTextAtPath, fieldVisible,
  choiceApplicable, matchedOption, matchedOptionLabel, choiceValues,
  UNIT_SUFFIX, type TuningField, type TuningTextField, type TuningChoiceField, type BossTuningEntry,
} from '../utils/bossTuning';
import { hiddenPaths } from '../utils/bossPresets';
import { registerIdolTuning } from '../utils/idolTuning';
import { BossMakerLive } from './BossMakerLive';
import { BossScriptEditor } from './BossScriptEditor';

registerIdolTuning(); // フェーズ1はアイドル1体(BOSS_MAKER.md §6)

const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

/** 刻み幅から表示桁数を決める(0.05刻みなら小数2桁)。 */
const fmt = (v: number, step: number): string => {
  if (step >= 1) return String(Math.round(v));
  const d = Math.max(0, Math.ceil(-Math.log10(step)));
  return v.toFixed(d);
};
/** 刻みへスナップ(浮動小数の誤差を残さない)。 */
const snap = (v: number, step: number): number => Math.round(v / step) * step;

// ---- 1つの数値欄(スクラブ + ± + 直接入力 + ピン) ------------------------------------------------
const NumberScrub = ({ field, value, changed, pinned, withSection, help, onChange, onPin }: {
  field: TuningField; value: number; changed: boolean;
  pinned?: boolean;
  /** ピン行のように**文脈が無い場所**では見出し名も出す(「予告」だけだとどの技か分からない)。 */
  withSection?: boolean;
  /** §14 ヘルプON時だけ hint を欄の下へ本文として出す(未指定/false=出さない=ピン行はこれまで通り)。 */
  help?: boolean;
  onChange: (v: number) => void;
  onPin?: () => void;
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const drag = useRef<{ x: number; base: number; moved: boolean } | null>(null);
  const repeat = useRef<number | null>(null);
  const step = field.step ?? 1;

  const apply = (v: number) => onChange(clampField(field, snap(v, step)));

  // スクラブ: 横4pxで1刻み(細かすぎず粗すぎない叩き台)。
  const onDown = (e: React.PointerEvent) => {
    if (editing) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, base: value, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) < 3) return;
    d.moved = true;
    apply(d.base + Math.round(dx / 4) * step);
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) { setDraft(fmt(value, step)); setEditing(true); } // 動かさずに離した=タップ=直接入力
  };

  const holdStart = (dir: 1 | -1) => {
    apply(value + dir * step);
    let n = 0;
    const t = window.setInterval(() => { n += 1; apply(getNow() + dir * step * (n > 8 ? 5 : 1)); }, 90);
    repeat.current = t;
  };
  // 連続押し中は最新値から刻む(親の再描画を待たない)。
  const latest = useRef(value); latest.current = value;
  const getNow = () => latest.current;
  const holdEnd = () => { if (repeat.current !== null) { window.clearInterval(repeat.current); repeat.current = null; } };

  return (
    <div className="py-[2px]">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1 truncate text-[11px] text-white/70" title={field.hint ?? field.path}>
          {withSection && <span className="text-white/40">{field.section}・</span>}{field.label}
        </div>
        <button
          className="h-7 w-7 shrink-0 rounded bg-white/10 text-[15px] leading-none text-white/80 active:bg-white/25"
          onPointerDown={() => holdStart(-1)} onPointerUp={holdEnd} onPointerLeave={holdEnd} onPointerCancel={holdEnd}
          aria-label={`${field.label} を減らす`}
        >−</button>
        {editing ? (
          <input
            autoFocus type="number" inputMode="decimal" value={draft}
            className="h-7 w-[68px] shrink-0 rounded bg-black/60 px-1 text-right font-mono text-[12px] text-white outline-none ring-1 ring-emerald-400"
            onChange={ev => setDraft(ev.target.value)}
            onBlur={() => { const n = Number(draft); if (Number.isFinite(n)) apply(n); setEditing(false); }}
            onKeyDown={ev => {
              if (ev.key === 'Enter') { const n = Number(draft); if (Number.isFinite(n)) apply(n); setEditing(false); }
              if (ev.key === 'Escape') setEditing(false);
            }}
          />
        ) : (
          <div
            className={`h-7 w-[68px] shrink-0 cursor-ew-resize select-none touch-none rounded px-1 text-right font-mono text-[12px] leading-7 ${changed ? 'bg-amber-500/25 text-amber-200' : 'bg-black/40 text-white'}`}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            title="左右にドラッグで増減 / タップで直接入力"
          >{fmt(value, step)}</div>
        )}
        <button
          className="h-7 w-7 shrink-0 rounded bg-white/10 text-[15px] leading-none text-white/80 active:bg-white/25"
          onPointerDown={() => holdStart(1)} onPointerUp={holdEnd} onPointerLeave={holdEnd} onPointerCancel={holdEnd}
          aria-label={`${field.label} を増やす`}
        >＋</button>
        <div className="w-6 shrink-0 text-[9px] text-white/40">{UNIT_SUFFIX[field.kind]}</div>
        {onPin && (
          <button
            className={`h-7 w-7 shrink-0 rounded text-[12px] leading-none ${pinned ? 'bg-amber-400 text-black' : 'bg-white/10 text-white/50'}`}
            onClick={onPin}
            title="下端に残して、戦いながら回す"
            aria-label={`${field.label} をピン留め`}
          >📌</button>
        )}
      </div>
      {/* §14-2②: ヘルプON時だけ、欄の下へ hint を本文として出す(PCホバーの title 頼みをやめる=§14-1)。 */}
      {help && field.hint && (
        <div className="pl-0.5 text-[10px] leading-snug text-sky-200/70">{field.hint}</div>
      )}
    </div>
  );
};

// ---- 束で選ぶ欄(BOSS_MAKER.md §18・v0.25.2819) --------------------------------------------------
// 社長指示「行動などについて数字が細かすぎて使いづらい。主要な数字だけ入れる仕様にしたい」。
// 行動の値は大半が**単独では決められない**(現行値は束で辻褄が合っている)ので、**束のまま選ばせる**。
// ★選択の状態は保存しない——**いまの数値がどの束と一致するか**を引き直して点灯させる
// (`matchedOption`)。数値を直接いじれる経路が何本あっても表示が実態とズレない。
const ChoiceRow = ({ field, table, help, onPick }: {
  field: TuningChoiceField;
  table: Record<string, unknown>;
  help?: boolean;
  onPick: (optionKey: string) => void;
}) => {
  const current = matchedOption(table, field);
  return (
    <div className="py-[3px]">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1 truncate text-[11px] text-white/70" title={field.hint}>{field.label}</div>
        {/* どれとも一致しない=「カスタム」。詳細で数字を直接触った/古い保存を読んだ時に出る。 */}
        {current === null && <div className="shrink-0 text-[10px] text-amber-300">カスタム</div>}
      </div>
      <div className="mt-0.5 flex gap-1">
        {field.options.map(o => (
          <button
            key={o.key}
            className={`flex-1 rounded py-1.5 text-[12px] font-bold ${current === o.key ? 'bg-emerald-500/85 text-black' : 'bg-white/10 text-white/70'}`}
            onClick={() => onPick(o.key)}
          >{o.label}</button>
        ))}
      </div>
      {help && field.hint && (
        <div className="pl-0.5 pt-0.5 text-[10px] leading-snug text-sky-200/70">{field.hint}</div>
      )}
    </div>
  );
};

// ---- 1つの文字欄(技の名前だけ・v0.25.2638) ------------------------------------------------------
// 数値欄と違って「摘まむ」操作が無いので普通の入力にする。**入力中は移動キーを殺す**必要があるが、
// それは useGameControls 側が「入力欄にフォーカスがあるか」で見ているので、ここは素の input でよい。
const TextRow = ({ field, value, onChange }: {
  field: TuningTextField; value: string; onChange: (v: string) => void;
}) => (
  <div className="flex items-center gap-1 py-[2px]">
    <div className="min-w-0 flex-1 truncate text-[11px] text-white/70">{field.label}</div>
    <input
      type="text" value={value} maxLength={field.maxLen ?? 16} placeholder={field.placeholder}
      className="h-7 w-[140px] shrink-0 rounded bg-black/40 px-1.5 text-[12px] text-white outline-none focus:ring-1 focus:ring-emerald-400"
      onChange={ev => onChange(ev.target.value)}
    />
  </div>
);

// ---- 記憶(localStorage)。開閉・タブ・ピン・シートの高さ・ヘルプはすべて端末に覚える -----------------
const OPEN_KEY = 'bossmaker.open.v1';
const PIN_KEY = 'bossmaker.pins.v1';
// ★シートの高さは v0.25.2655 で3段スナップ(閉/半/全)から**連続px**へ変えたので**新しいキー**にする
// (旧キーの 'half'/'full' は数値として読めない=事故る。読めない値は既定へフォールバックする作法で
// 実質互換は保つが、キー自体は分けて古い値を誤読しないようにする)。
const SHEET_PX_KEY = 'bossmaker.sheetpx.v1';
const TAB_KEY = 'bossmaker.tab.v1';
// §14 ヘルプのON/OFF(既定OFF=普段は邪魔にならない)。
const HELP_KEY = 'bossmaker.help.v1';
// §18 詳細表示のON/OFF(既定OFF=社長指示「表示しない」)。ONで束の中身の生数字が全部出る。
// ★逃げ道として必ず要る: 貼り戻し・古い保存で**どの束とも一致しない中間値**に入りうるので、
// 詳細が無いとその状態で触れなくなる(=道具が壊れる)。
const DETAIL_KEY = 'bossmaker.detail.v1';
export const MAX_PINS = 3; // 多すぎると画面を食う(社長指示「2〜3個」)

const loadSet = (key: string, boss: string): Set<string> => {
  try {
    const raw = localStorage.getItem(`${key}.${boss}`);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch { return new Set<string>(); }
};
const saveSet = (key: string, boss: string, set: Set<string>): void => {
  try { localStorage.setItem(`${key}.${boss}`, JSON.stringify([...set])); } catch { /* 保存できなくても動く */ }
};
const loadStr = (key: string, boss: string, fallback: string): string => {
  try { return localStorage.getItem(`${key}.${boss}`) ?? fallback; } catch { return fallback; }
};
const saveStr = (key: string, boss: string, v: string): void => {
  try { localStorage.setItem(`${key}.${boss}`, v); } catch { /* 保存できなくても動く */ }
};

/** 畳んでいる時に見出しへ出す要点(先頭3欄)。「どれを開けばいいか」が分かるように。 */
const summarize = (fs: TuningField[], table: Record<string, unknown>): string =>
  fs.slice(0, 3).map(f => {
    const v = getAtPath(table, f.path) ?? 0;
    return `${f.label}${fmt(v, f.step ?? 1)}${UNIT_SUFFIX[f.kind]}`;
  }).join(' ');

// ---- タブ1枚ぶんの中身。**セクション単位で開閉**する --------------------------------------------
const SectionList = ({ group, entry, open, toggle, pins, hidden, choices, onChange, onChoice, onText, onPin, onPlay, playState, bump, help }: {
  group: 'behavior' | 'move';
  entry: BossTuningEntry;
  open: Set<string>;
  toggle: (sec: string) => void;
  pins: Set<string>;
  /** §18 簡易表示で隠すパス(詳細ONなら空)。**束が持つパスから派生**=手書きリストを二重管理しない。 */
  hidden: Set<string>;
  /** §18 このボスで出せる束(チップ)。 */
  choices: readonly TuningChoiceField[];
  onChange: (path: string, v: number) => void;
  onChoice: (field: TuningChoiceField, optionKey: string) => void;
  onText: (path: string, v: string) => void;
  onPin: (path: string) => void;
  onPlay: (key: string) => void;
  playState: { verb: string | null; loop: string | null };
  bump: number;
  /** §14 ヘルプがONか。ON時だけ見出しの説明・欄のhintを本文として出す(既定OFF)。 */
  help: boolean;
}) => {
  // セクションの並び = スキーマの出現順 + 欄を持たない再生専用セクション(移動語彙)を末尾へ。
  // ★`fieldVisible` を通す=**足していない射撃枠は見出しごと消える**(欄が0本なら Map に入らない)。
  const sections = useMemo(() => {
    const m = new Map<string, TuningField[]>();
    for (const f of entry.fields) {
      if (f.group !== group || !fieldVisible(entry.table, f) || hidden.has(f.path)) continue;
      const a = m.get(f.section) ?? []; a.push(f); m.set(f.section, a);
    }
    // ★§18: **束のチップが属する節は、欄が0本でも必ず生やす。** 簡易表示では間合い/中立の移動/
    // ストリングと休符/懲罰の欄が全部隠れるので、これが無いと**見出しごと消えてチップの置き場が無くなる**。
    for (const c of choices) if (c.group === group && !m.has(c.section)) m.set(c.section, []);
    for (const p of entry.playables ?? []) {
      if (group === 'behavior' && !m.has(p.section) && !entry.fields.some(f => f.section === p.section)) m.set(p.section, []);
    }
    return [...m.entries()];
    // bump は「値が変わったら要点表示を作り直す」ため(依存に入れないと畳んだ見出しが古いまま)。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, group, bump, hidden, choices]);

  return (
    <>
      {sections.map(([sec, fs]) => {
        const isOpen = open.has(sec);
        const chs = choices.filter(c => c.group === group && c.section === sec);
        const texts = (entry.textFields ?? []).filter(t => t.section === sec && fieldVisible(entry.table, t));
        const plays = (entry.playables ?? []).filter(p => p.section === sec);
        const single = plays.length === 1 ? plays[0] : null;
        const active = single !== null && (playState.verb === single.key || playState.loop === single.key);
        return (
          <div key={sec} className="mb-1 rounded bg-white/[0.05]">
            <div className="flex items-center gap-1 px-1.5">
              <button className="min-w-0 flex-1 py-1.5 text-left" onClick={() => toggle(sec)}>
                <div className="flex items-center gap-1">
                  {/* 開閉の印は細い三角(▸/▾)。**再生ボタンの塗り三角(▶)と見間違えない**ため。 */}
                  <span className="text-[10px] text-white/40">{isOpen ? '▾' : '▸'}</span>
                  <span className="truncate text-[12px] font-bold text-emerald-300/90">{entry.sectionLabel?.(sec) ?? sec}</span>
                </div>
                {/* 畳んだ見出しの要点。★簡易表示では欄が0本なので、**選択名を出す**
                    (値から作ると空欄になり、今より情報が減る)。束と欄が両方ある時は両方出す。 */}
                {!isOpen && (chs.length > 0 || fs.length > 0) && (
                  <div className="truncate pl-3 font-mono text-[10px] text-white/40">
                    {[
                      ...chs.map(c => `${c.label}:${matchedOptionLabel(entry.table, c)}`),
                      ...(fs.length > 0 ? [summarize(fs, entry.table)] : []),
                    ].join(' ')}
                  </div>
                )}
              </button>
              {single && (
                <button
                  className={`shrink-0 rounded px-2.5 py-1 text-[13px] leading-none ${active ? 'bg-emerald-400 text-black' : 'bg-white/15 text-white/80'}`}
                  onClick={ev => { ev.stopPropagation(); onPlay(single.key); }}
                  title="この技/動きだけを再生"
                  aria-label={`${single.label} を再生`}
                >▶</button>
              )}
            </div>
            {/* §14-2①: ヘルプON時だけ、見出しの直下に節の説明を出す(畳んでいても見える=中を開く前の目印)。 */}
            {help && entry.sectionHelp?.[sec] && (
              <div className="whitespace-pre-line px-1.5 pb-1 text-[10px] leading-snug text-sky-200/80">
                {entry.sectionHelp[sec]}
              </div>
            )}
            {isOpen && (
              <div className="px-1.5 pb-1.5">
                {/* 欄を持たない再生専用セクション(移動語彙)は、ここへボタンを並べる。 */}
                {plays.length > 1 && (
                  <div className="mb-1 flex flex-wrap gap-1">
                    {plays.map(p => {
                      const on = playState.verb === p.key || playState.loop === p.key;
                      return (
                        <button
                          key={p.key}
                          className={`rounded px-2.5 py-1.5 text-[11px] ${on ? 'bg-emerald-400 text-black' : 'bg-white/15 text-white/80'}`}
                          onClick={() => onPlay(p.key)}
                          aria-label={`${p.label} を再生`}
                        >▶ {p.label}</button>
                      );
                    })}
                  </div>
                )}
                {/* 束のチップは節の先頭(主役)。数値欄はその下=詳細を開いた時だけ並ぶ。 */}
                {chs.map(c => (
                  <ChoiceRow
                    key={c.key} field={c} table={entry.table} help={help}
                    onPick={k => onChoice(c, k)}
                  />
                ))}
                {texts.map(t => (
                  <TextRow
                    key={t.path} field={t}
                    value={getTextAtPath(entry.table, t.path) ?? ''}
                    onChange={v => onText(t.path, v)}
                  />
                ))}
                {fs.map(f => (
                  <NumberScrub
                    key={f.path} field={f}
                    value={getAtPath(entry.table, f.path) ?? 0}
                    changed={getAtPath(entry.table, f.path) !== getAtPath(entry.defaults, f.path)}
                    pinned={pins.has(f.path)}
                    help={help}
                    onChange={v => onChange(f.path, v)}
                    onPin={() => onPin(f.path)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
};

// ---- シートの高さ(連続値・社長実機報告v0.25.2655で3段スナップから変更) -----------------------------
// 経緯: 全画面(旧 88vh)にすると**上端がツールバー(実測70〜90px)の下に潜り**、つまみが掴めず
// 「大きさを変えられない」「上に戻れない(実際はスクロール先頭だが先頭行がツールバーの裏で見えない)」
// という事故になった。3段固定ではこの食い違いを吸収できないので、**上限を実測で動的にクランプする
// 連続pxドラッグ**へ変える。
const HANDLE_PX = 40;                       // 閉じている時に残る高さ(つまみの帯。掴みやすく少し厚くした)
const SHEET_MARGIN_PX = 8;                  // ツールバー(+ピン行)の下に余す最小の隙間
const SHEET_DEFAULT_FRAC = 0.46;            // 初回(保存が無い時)の既定=旧「半分」相当

// ---- 本体 --------------------------------------------------------------------------------------
export const BossMakerPanel = () => {
  const active = useGameStore(s => s.bossMaker.active);
  const invincible = useGameStore(s => s.bossMaker.invincible);
  const paused = useGameStore(s => s.bossMaker.paused);
  const showHitbox = useGameStore(s => s.bossMaker.showHitbox);
  const hideHud = useGameStore(s => s.bossMaker.hideHud);
  const setBossMaker = useGameStore(s => s.setBossMaker);
  const [rev, bump] = useState(0);
  const [note, setNote] = useState('');
  const bossType = 'idol'; // フェーズ1はアイドル1体(BOSS_MAKER.md §6)
  const entry = getBossTuning(bossType);

  const [openSecs, setOpenSecs] = useState<Set<string>>(() => loadSet(OPEN_KEY, bossType));
  const [pins, setPins] = useState<Set<string>>(() => loadSet(PIN_KEY, bossType));
  const [tab, setTab] = useState<'behavior' | 'move'>(() => (loadStr(TAB_KEY, bossType, 'move') === 'behavior' ? 'behavior' : 'move'));
  // §14 ヘルプ(既定OFF)。既存の🛡⏸⬚🔁👁と同じ作法=localStorageへ端末に覚える(loadStr/saveStr流用)。
  const [help, setHelp] = useState<boolean>(() => loadStr(HELP_KEY, bossType, '0') === '1');
  // §18 詳細(束の中身の生数字)。既定OFF。
  const [detail, setDetail] = useState<boolean>(() => loadStr(DETAIL_KEY, bossType, '0') === '1');
  const [sheetPx, setSheetPxState] = useState<number>(() => {
    const raw = Number(loadStr(SHEET_PX_KEY, bossType, ''));
    // 読めない(空/非数値=旧キーの 'half' 等を誤って踏んだ場合も含む)なら既定へフォールバック。
    return Number.isFinite(raw) && raw > 0 ? raw : Math.round(window.innerHeight * SHEET_DEFAULT_FRAC);
  });
  const [loop, setLoop] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const pinRowRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ y: number; h: number } | null>(null);
  // タップで閉じた時に「直前の開き高さ」へ戻すための記憶(閉じている間は更新しない)。
  const lastOpenPxRef = useRef<number>(sheetPx > HANDLE_PX + 1 ? sheetPx : Math.round(window.innerHeight * SHEET_DEFAULT_FRAC));

  // ---- §18 束(チップ) ---------------------------------------------------------------------------
  // ★そのボスが持っていないパスを含む束は出さない(`setAtPath` は無い場所へ黙って false を返すので、
  // 出すと「押しても効かず永久にカスタム表示」という無言の故障になる)。
  const choices = useMemo(
    () => (entry?.choices ?? []).filter(c => choiceApplicable(entry!.table, c)),
    [entry],
  );
  // 簡易表示で隠すパス。★**束から派生させる**(手書きリストを別に持つと束を1つ足した日にズレる)。
  // 詳細ONなら空=これまでどおり全部出る。束を宣言していないボスは何も隠さない。
  const hidden = useMemo(
    () => (detail || choices.length === 0 ? new Set<string>() : hiddenPaths(choices)),
    [detail, choices],
  );

  const toggleSec = useCallback((sec: string) => {
    setOpenSecs(prev => {
      const next = new Set(prev);
      if (next.has(sec)) next.delete(sec); else next.add(sec);
      saveSet(OPEN_KEY, bossType, next);
      return next;
    });
  }, []);
  const setAllSecs = useCallback((all: boolean) => {
    if (!entry) return;
    const secs = new Set<string>();
    if (all) {
      for (const f of entry.fields) secs.add(f.section);
      for (const p of entry.playables ?? []) secs.add(p.section);
    }
    saveSet(OPEN_KEY, bossType, secs);
    setOpenSecs(secs);
  }, [entry]);

  /**
   * ★**枠は「いま画面に出ているピン」で数える。**
   * `pins` の生の数で数えると、簡易表示で隠れている欄のピン(端末に残った古いピン)が枠を食い、
   * **ピン行は空なのに「ピンは3個まで」で新しく打てない**という詰みになる
   * (解除ボタンは隠れた欄とピン行にしか無いので、簡易表示からは外せない)。
   */
  const visiblePinCount = useCallback((set: Set<string>): number => (
    entry ? entry.fields.filter(f => set.has(f.path) && fieldVisible(entry.table, f) && !hidden.has(f.path)).length : set.size
  ), [entry, hidden]);

  const togglePin = useCallback((path: string) => {
    setPins(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else {
        if (visiblePinCount(prev) >= MAX_PINS) { setNote(`ピンは${MAX_PINS}個まで`); return prev; }
        next.add(path);
      }
      saveSet(PIN_KEY, bossType, next);
      return next;
    });
  }, [visiblePinCount]);

  const setTabSaved = useCallback((t: 'behavior' | 'move') => { saveStr(TAB_KEY, bossType, t); setTab(t); }, []);
  const setHelpSaved = useCallback((v: boolean) => { saveStr(HELP_KEY, bossType, v ? '1' : '0'); setHelp(v); }, []);
  const setDetailSaved = useCallback((v: boolean) => { saveStr(DETAIL_KEY, bossType, v ? '1' : '0'); setDetail(v); }, []);


  // ---- シートの高さの上限(社長実機報告v0.25.2655) ------------------------------------------------
  // **ツールバー(+出ていればピン行)の高さを実測**して引く。決め打ち定数にしないのは、safe-area・
  // 折り返し・ピンの本数で毎回変わるため(これを決め打ちにしたのが今回の事故の本質)。
  const clampBounds = useCallback((): { min: number; max: number } => {
    const toolbarH = toolbarRef.current?.getBoundingClientRect().height ?? 0;
    const pinH = pinRowRef.current?.getBoundingClientRect().height ?? 0;
    const max = Math.max(HANDLE_PX, window.innerHeight - toolbarH - pinH - SHEET_MARGIN_PX);
    return { min: HANDLE_PX, max };
  }, []);

  /** 高さを確定する(クランプ+保存+state更新の1本化)。ドラッグ「中」はここを通さない(DOM直操作)。 */
  const setSheetPx = useCallback((px: number) => {
    const { min, max } = clampBounds();
    const next = Math.min(Math.max(Math.round(px), min), max);
    if (next > min + 1) lastOpenPxRef.current = next; // 開いた高さだけ記憶(閉タップの戻り先)
    saveStr(SHEET_PX_KEY, bossType, String(next));
    setSheetPxState(next);
  }, [clampBounds]);

  // 初回描画後 + リサイズ/回転 + ピンの本数が変わった時に**現在の高さを上限内へ再クランプ**する。
  // ★これが今回のバグの直し所そのもの: 上限を実測してから、はみ出ていれば詰め直す。
  // useLayoutEffect=ペイント前に直すので「一瞬だけツールバーへ潜る」ちらつきを避ける。
  useLayoutEffect(() => {
    const reclamp = () => {
      const { min, max } = clampBounds();
      setSheetPxState(prev => {
        const next = Math.min(Math.max(prev, min), max);
        if (next === prev) return prev;
        saveStr(SHEET_PX_KEY, bossType, String(next));
        const el = sheetRef.current;
        if (el) el.style.height = `${next}px`;
        return next;
      });
    };
    reclamp();
    window.addEventListener('resize', reclamp);
    return () => window.removeEventListener('resize', reclamp);
  }, [clampBounds, pins]);

  // ---- 自動保存(社長要望v0.25.2631「毎回やり直すのは無理」) --------------------------------------
  // ★**適用は部屋の中だけ**。数値テーブルは本編と同じ実体なので、部屋を出る時は**必ず既定へ戻す**
  // (戻さないと調整値が本編のボスに乗る)。入る=適用 / 出る=リセット を対にして useEffect で持つ。
  // 保存はまとめ書き(スクラブ中は毎フレーム値が動くので、止まってから1回だけ書く)。
  // ★宣言はリセットの useEffect **より前**に置く。理由は下の flushSave のコメント。
  const saveTimer = useRef<number | null>(null);
  const saveSoon = useCallback(() => {
    if (!entry) return;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { saveTimer.current = null; saveTuning(entry); }, 400);
  }, [entry]);
  /** 書き残しがあれば今すぐ書く(何も待っていなければ何もしない)。 */
  const flushSave = useCallback(() => {
    if (saveTimer.current === null || !entry) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
    saveTuning(entry);
  }, [entry]);

  useEffect(() => {
    if (!active || !entry) return;
    applySavedTuning(entry);
    bump(n => n + 1);
    return () => {
      // ★**必ず「書き残しを流してから」既定へ戻す。** 逆順だと、既定へ戻した後に走る保存が
      // 「差分ゼロ」を書くことになり、`saveTuning` が**保存キーごと削除**する(=それまでの調整が
      // 全部消える)。旧実装はクリーンアップの宣言順の都合でこの逆順になっていた。
      // まとめ書きは400msなので、**触った直後に部屋を出る**と必ず踏む。チップは1タップで決まる=
      // 「押してすぐ出る」が普通の操作になるため、露出が桁違いに増える。
      flushSave();
      resetTuning(entry);
    };
  }, [active, entry, flushSave]);

  useEffect(() => () => {
    // 画面を閉じる瞬間に書き残しがあれば流し込む(まとめ書きの取りこぼし防止)。
    // 上のクリーンアップが先に走って既に流し終えていれば、ここは何もしない。
    flushSave();
  }, [flushSave]);

  const onChange = useCallback((path: string, v: number) => {
    if (!entry) return;
    setAtPath(entry.table, path, v);
    saveSoon();
    // 基礎値(HP/与ダメ/速度)は生きている個体へ即反映する(数字を打った瞬間に効く=受け入れ条件1)。
    if (path.startsWith('stats.')) {
      const t = entry.table as { stats: { health: number; damage: number; speed: number } };
      useGameStore.setState(s => ({
        enemies: s.enemies.map(e => e.type !== bossType ? e : {
          ...e, maxHealth: t.stats.health, damage: t.stats.damage, speed: t.stats.speed,
          health: Math.min(e.health, t.stats.health),
        }),
      }));
    }
    bump(n => n + 1);
  }, [entry, saveSoon]);

  /**
   * §18 束を1つ当てる。★**既存の onChange と同じ道を通す**(setAtPath → saveSoon → bump)。
   * `saveSoon()` を通らないと**保存されないまま退室時の `resetTuning` で消え**、次に入ると
   * 全部「まん中」に戻る(BOSS_MAKER.md §18-7-4)。
   * ※束は `stats.*` を1つも持たない(テストで固定)ので、生きている個体へのHP等の反映は要らない。
   */
  const applyChoice = useCallback((field: TuningChoiceField, optionKey: string) => {
    if (!entry) return;
    const byPath = new Map(entry.fields.map(f => [f.path, f]));
    for (const [path, v] of Object.entries(choiceValues(field, optionKey))) {
      const f = byPath.get(path);
      setAtPath(entry.table, path, f ? clampField(f, v) : v);
    }
    // ★チップは**1タップで決まる**操作なので、まとめ書き(400ms)にしない。
    // 「押してすぐ部屋を出る」が普通の導線なので、待つと保存の窓を毎回踏む。
    if (saveTimer.current !== null) { window.clearTimeout(saveTimer.current); saveTimer.current = null; }
    saveTuning(entry);
    setNote(`${field.label} = ${field.options.find(o => o.key === optionKey)?.label ?? optionKey}`);
    bump(n => n + 1);
  }, [entry]);

  const onText = useCallback((path: string, v: string) => {
    if (!entry) return;
    setTextAtPath(entry.table, path, v);
    saveSoon();
    bump(n => n + 1);
  }, [entry, saveSoon]);

  /** 「＋技を足す」(v0.25.2638): 空いている射撃枠を1つ有効にして、その見出しを開いておく。 */
  const addMove = useCallback(() => {
    if (!entry?.addMove) return;
    const before = new Set(entry.fields.filter(f => fieldVisible(entry.table, f)).map(f => f.section));
    const r = entry.addMove();
    setNote(r.message);
    if (r.ok) {
      const fresh = entry.fields.filter(f => fieldVisible(entry.table, f)).map(f => f.section).find(s => !before.has(s));
      if (fresh) {
        setOpenSecs(prev => {
          const next = new Set(prev).add(fresh);
          saveSet(OPEN_KEY, bossType, next);
          return next;
        });
      }
      setTabSaved('move');
      saveSoon();
    }
    bump(n => n + 1);
  }, [entry, saveSoon, setTabSaved]);

  // 再生(社長要望v0.25.2625): 押した1つだけを実行。停止中なら硬直明けでまた止まる。
  const play = useCallback((key: string) => {
    if (!entry?.onPlay) return;
    const a = (entry.playables ?? []).find(p => p.key === key);
    if (!a) return;
    entry.onPlay(a, { solo: useGameStore.getState().bossMaker.paused, loop });
    bump(n => n + 1);
  }, [entry, loop]);

  // ---- つまみのドラッグ。**ドラッグ中は state を触らない**(DOMを直接動かす=再描画ゼロ) ----------
  // 上限は毎回 clampBounds() で実測し直す(ドラッグ開始時にツールバー/ピン行の高さが変わっている
  // 可能性があるため=固定値を握ったままにしない)。
  const onHandleDown = (e: React.PointerEvent) => {
    const el = sheetRef.current;
    if (!el) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { y: e.clientY, h: el.getBoundingClientRect().height };
    el.style.transition = 'none';
  };
  const onHandleMove = (e: React.PointerEvent) => {
    const d = dragRef.current, el = sheetRef.current;
    if (!d || !el) return;
    const { min, max } = clampBounds();
    const h = Math.max(min, Math.min(max, d.h + (d.y - e.clientY)));
    el.style.height = `${h}px`;
  };
  const onHandleUp = () => {
    const d = dragRef.current, el = sheetRef.current;
    dragRef.current = null;
    if (!d || !el) return;
    const { min } = clampBounds();
    const h = el.getBoundingClientRect().height;
    el.style.transition = '';
    el.style.height = '';
    // 動かしていない(タップ)なら「閉じる ⇄ 直前の開き高さ」をトグル(ドラッグが主・タップは副)。
    if (Math.abs(h - d.h) < 6) {
      setSheetPx(d.h <= min + 1 ? lastOpenPxRef.current : min);
    } else {
      setSheetPx(h);
    }
  };

  if (!active || !entry) return null;

  const changed = changedPaths(entry).length;
  const playState = entry.playState?.() ?? { verb: null, loop: null };
  // 消した射撃枠がピン行に残り続けないよう、ピンも表示条件を通す。
  // ★§18: 詳細OFFの間は**隠した欄のピンも出さない**(社長指示「表示しない」)。端末に残っている
  // 古いピン(`bossmaker.pins.v1.idol`)が生数字を出し続けるのを防ぐ。ピン自体は消さない=詳細ONで戻る。
  const pinFields = entry.fields.filter(f => pins.has(f.path) && fieldVisible(entry.table, f) && !hidden.has(f.path));

  // シートの開閉状態と目盛り表示(段が連続値になったので「閉/半/全」の代わりに%を出す)。
  const { min: sheetMin, max: sheetMax } = clampBounds();
  const sheetIsOpen = sheetPx > sheetMin + 1;
  const sheetPct = sheetMax > sheetMin ? Math.round(((sheetPx - sheetMin) / (sheetMax - sheetMin)) * 100) : 0;

  const ico = 'flex h-8 w-8 shrink-0 items-center justify-center rounded text-[14px] leading-none';
  const on = 'bg-emerald-500/85 text-black';
  const off = 'bg-white/10 text-white/75';

  const patchBoss = (fn: (e: Enemy) => Partial<Enemy>) => {
    useGameStore.setState(s => ({ enemies: s.enemies.map(e => (e.type === bossType ? { ...e, ...fn(e) } : e)) }));
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] select-none">
      {/* ── 上端の固定行: ライブ表示 + アイコン列(横スクロール) ── */}
      <div
        ref={toolbarRef}
        className="pointer-events-auto absolute left-0 right-0 top-0 bg-gradient-to-b from-black/85 to-black/0 px-1 pb-2"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 4px)' }}
      >
        <div className="mb-1 flex items-center gap-2">
          <BossMakerLive bossType={bossType} />
          <div className="ml-auto shrink-0 text-[10px] text-amber-300">変更 {changed}</div>
        </div>
        {/* ⑤ アイコン + 横スクロール(縦持ちで潰れないように文字を持たせない) */}
        <div className="flex gap-1 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
          <button className={`${ico} ${invincible ? on : off}`} onClick={() => setBossMaker({ invincible: !invincible })} title="無敵" aria-label="無敵">🛡</button>
          <button className={`${ico} ${paused ? on : off}`} onClick={() => setBossMaker({ paused: !paused })} title="ボスの時間を止める" aria-label="停止">⏸</button>
          <button className={`${ico} ${showHitbox ? on : off}`} onClick={() => setBossMaker({ showHitbox: !showHitbox })} title="当たり判定" aria-label="判定">⬚</button>
          <button className={`${ico} ${loop ? on : off}`} onClick={() => setLoop(l => !l)} title="再生を繰り返す" aria-label="ループ">🔁</button>
          <button className={`${ico} ${hideHud ? on : off}`} onClick={() => setBossMaker({ hideHud: !hideHud })} title="ゲームHUDを消す" aria-label="HUD">👁</button>
          {/* §14 ヘルプ。既存トグルと同じ見た目・同じ作法(localStorageへ端末記憶)。既定OFF。 */}
          <button className={`${ico} ${help ? on : off}`} onClick={() => setHelpSaved(!help)} title="ヘルプ(用語の説明)" aria-label="ヘルプ">？</button>
          {/* §18 詳細: 束の中身の生数字を出す(既定OFF)。中間値に入った時の逃げ道。 */}
          {choices.length > 0 && (
            <button className={`${ico} ${detail ? on : off}`} onClick={() => setDetailSaved(!detail)} title="詳細(束の中身の数字)" aria-label="詳細">⚙</button>
          )}
          <div className="w-1 shrink-0" />
          <button className={`${ico} ${off}`} onClick={() => setAllSecs(false)} title="全部畳む" aria-label="全部畳む">⇧</button>
          <button className={`${ico} ${off}`} onClick={() => setAllSecs(true)} title="全部開く" aria-label="全部開く">⇩</button>
          {entry.addMove && (
            <button
              className={`${ico} bg-sky-500/85 !w-auto px-2 text-[10px] font-bold text-black`}
              onClick={addMove} title="射撃の技を1つ足す"
            >＋技</button>
          )}
          <div className="w-1 shrink-0" />
          <button className={`${ico} ${off} !w-auto px-2 text-[10px] font-bold`} onClick={() => patchBoss(e => ({ health: Math.max(1, Math.round(e.maxHealth * 0.4)) }))}>HP40%</button>
          <button className={`${ico} ${off} !w-auto px-2 text-[10px] font-bold`} onClick={() => patchBoss(() => ({ bossPhase: 2 }))}>P2</button>
          <button className={`${ico} ${off} !w-auto px-2 text-[10px] font-bold`} onClick={() => patchBoss(() => ({ health: 1 }))}>瀕死</button>
          <button
            className={`${ico} ${off} !w-auto px-2 text-[10px] font-bold`}
            onClick={() => { const p = useGameStore.getState().player; patchBoss(() => ({ x: p.x, y: p.y - 300 })); }}
          >位置</button>
        </div>
      </div>

      {/* ── ボトムシート: つまみをドラッグして高さを変える(社長実機報告v0.25.2655で連続px化) ── */}
      <div
        ref={sheetRef}
        className="pointer-events-auto absolute bottom-0 left-0 right-0 flex flex-col rounded-t-xl bg-black/85 backdrop-blur-sm transition-[height] duration-150"
        style={{ height: `${sheetPx}px` }}
      >
        {/* ③ ピン行: **シートを閉じても残る**(これを回しながら戦う)。シートの上に浮かせる。
            ★このピン行の高さも clampBounds() が引いている(全画面まで上げてもツールバーへ潜らない)。 */}
        {pinFields.length > 0 && (
          <div ref={pinRowRef} className="pointer-events-auto absolute bottom-full left-0 right-0 mb-1 px-1">
            <div className="rounded-lg bg-black/80 px-1.5 py-0.5">
              {pinFields.map(f => (
                <NumberScrub
                  key={f.path} field={f}
                  value={getAtPath(entry.table, f.path) ?? 0}
                  changed={getAtPath(entry.table, f.path) !== getAtPath(entry.defaults, f.path)}
                  pinned withSection
                  onChange={v => onChange(f.path, v)}
                  onPin={() => togglePin(f.path)}
                />
              ))}
            </div>
          </div>
        )}

        {/* つまみ(常に表示・掴みやすく厚め)。ドラッグ=無段階、タップ=閉じる⇄直前の高さ。 */}
        <div
          className="flex shrink-0 cursor-ns-resize touch-none items-center justify-center py-2"
          onPointerDown={onHandleDown} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp}
          title="ドラッグで高さを変える / タップで閉じる⇄戻す"
          aria-label="シートのつまみ"
        >
          <div className="h-1.5 w-14 rounded-full bg-white/40" />
          <span className="ml-2 text-[10px] text-white/40">{sheetIsOpen ? `${sheetPct}%` : '閉'}</span>
        </div>

        {sheetIsOpen && (
          <>
            {/* ② タブ(スキーマの group からそのまま作る=ボスを足しても手書きしない) */}
            <div className="flex shrink-0 gap-1 px-1.5 pb-1">
              {([['behavior', '行動パターン'], ['move', `技(${entry.label})`]] as const).map(([g, label]) => (
                <button
                  key={g}
                  className={`flex-1 rounded py-1.5 text-[12px] font-bold ${tab === g ? 'bg-emerald-500/85 text-black' : 'bg-white/10 text-white/70'}`}
                  onClick={() => setTabSaved(g)}
                >{label}</button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-1.5">
              {/* 台本エディタは「行動パターン」タブの先頭(=ボスの手そのものなので一番上)。 */}
              {tab === 'behavior' && entry.scripts && (
                <BossScriptEditor
                  api={entry.scripts}
                  note={note}
                  onChanged={m => { setNote(m); saveSoon(); bump(n => n + 1); }}
                  help={help ? entry.sectionHelp?.['台本'] : undefined}
                />
              )}
              <SectionList
                group={tab} entry={entry} open={openSecs} toggle={toggleSec} pins={pins}
                hidden={hidden} choices={choices} onChoice={applyChoice}
                onChange={onChange} onText={onText} onPin={togglePin} onPlay={play} playState={playState} bump={rev}
                help={help}
              />
            </div>

            {/* 下端: コピー/貼り戻し/リセット */}
            <div
              className="flex shrink-0 items-center gap-1 px-1.5 pt-1"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 4px)' }}
            >
              <button
                className="rounded bg-emerald-500/85 px-2 py-1.5 text-[11px] font-bold text-black"
                onClick={async () => {
                  const txt = formatTuningText(entry, APP_VERSION);
                  try { await navigator.clipboard.writeText(txt); setNote('コピーしました'); }
                  catch { window.prompt('コピーしてください', txt); setNote(''); }
                }}
              >コピー</button>
              <button
                className="rounded bg-white/10 px-2 py-1.5 text-[11px] font-bold text-white/75"
                onClick={async () => {
                  let txt = '';
                  try { txt = await navigator.clipboard.readText(); } catch { txt = window.prompt('貼り付け') ?? ''; }
                  if (!txt) return;
                  const r = parseTuningText(entry, txt);
                  saveTuning(entry);
                  setNote(r.errors.length ? r.errors[0] : `${r.applied}件を反映`);
                  bump(n => n + 1);
                }}
              >貼り戻し</button>
              <button
                className="rounded bg-white/10 px-2 py-1.5 text-[11px] font-bold text-white/75"
                onClick={() => {
                  resetTuning(entry);
                  clearSavedTuning(entry.bossType); // 保存も消す=次に入った時も既定から
                  setNote('既定へ戻しました(保存も削除)');
                  bump(n => n + 1);
                }}
              >リセット</button>
              {note && <span className="truncate text-[10px] text-white/70">{note}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
