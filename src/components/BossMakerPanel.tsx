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
import { useCallback, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import type { Enemy } from '../types/game';
import {
  getBossTuning, getAtPath, setAtPath, clampField, changedPaths, resetTuning,
  formatTuningText, parseTuningText, UNIT_SUFFIX, type TuningField, type BossTuningEntry,
} from '../utils/bossTuning';
import { registerIdolTuning } from '../utils/idolTuning';
import { BossMakerLive } from './BossMakerLive';

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
const NumberScrub = ({ field, value, changed, pinned, withSection, onChange, onPin }: {
  field: TuningField; value: number; changed: boolean;
  pinned?: boolean;
  /** ピン行のように**文脈が無い場所**では見出し名も出す(「予告」だけだとどの技か分からない)。 */
  withSection?: boolean;
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
    <div className="flex items-center gap-1 py-[2px]">
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
  );
};

// ---- 記憶(localStorage)。開閉・タブ・ピン・シートの段はすべて端末に覚える -----------------------
const OPEN_KEY = 'bossmaker.open.v1';
const PIN_KEY = 'bossmaker.pins.v1';
const SNAP_KEY = 'bossmaker.snap.v1';
const TAB_KEY = 'bossmaker.tab.v1';
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
const SectionList = ({ group, entry, open, toggle, pins, onChange, onPin, onPlay, playState, bump }: {
  group: 'behavior' | 'move';
  entry: BossTuningEntry;
  open: Set<string>;
  toggle: (sec: string) => void;
  pins: Set<string>;
  onChange: (path: string, v: number) => void;
  onPin: (path: string) => void;
  onPlay: (key: string) => void;
  playState: { verb: string | null; loop: string | null };
  bump: number;
}) => {
  // セクションの並び = スキーマの出現順 + 欄を持たない再生専用セクション(移動語彙)を末尾へ。
  const sections = useMemo(() => {
    const m = new Map<string, TuningField[]>();
    for (const f of entry.fields) if (f.group === group) {
      const a = m.get(f.section) ?? []; a.push(f); m.set(f.section, a);
    }
    for (const p of entry.playables ?? []) {
      if (group === 'behavior' && !m.has(p.section) && !entry.fields.some(f => f.section === p.section)) m.set(p.section, []);
    }
    return [...m.entries()];
    // bump は「値が変わったら要点表示を作り直す」ため(依存に入れないと畳んだ見出しが古いまま)。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, group, bump]);

  return (
    <>
      {sections.map(([sec, fs]) => {
        const isOpen = open.has(sec);
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
                  <span className="truncate text-[12px] font-bold text-emerald-300/90">{sec}</span>
                </div>
                {!isOpen && fs.length > 0 && (
                  <div className="truncate pl-3 font-mono text-[10px] text-white/40">{summarize(fs, entry.table)}</div>
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
                {fs.map(f => (
                  <NumberScrub
                    key={f.path} field={f}
                    value={getAtPath(entry.table, f.path) ?? 0}
                    changed={getAtPath(entry.table, f.path) !== getAtPath(entry.defaults, f.path)}
                    pinned={pins.has(f.path)}
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

// ---- シートの段(3段) ---------------------------------------------------------------------------
type Snap = 'closed' | 'half' | 'full';
const HANDLE_PX = 34;                       // 閉じている時に残る高さ(つまみ+タブの帯)
const snapPx = (s: Snap, vh: number): number =>
  s === 'closed' ? HANDLE_PX : s === 'half' ? Math.round(vh * 0.46) : Math.round(vh * 0.88);
/** 高さから一番近い段を選ぶ(離した瞬間の確定)。 */
const nearestSnap = (px: number, vh: number): Snap => {
  const cands: Snap[] = ['closed', 'half', 'full'];
  let best: Snap = 'half', bd = Infinity;
  for (const c of cands) { const d = Math.abs(snapPx(c, vh) - px); if (d < bd) { bd = d; best = c; } }
  return best;
};

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
  const [sheet, setSheet] = useState<Snap>(() => {
    const v = loadStr(SNAP_KEY, bossType, 'half');
    return v === 'closed' || v === 'full' ? v : 'half';
  });
  const [loop, setLoop] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ y: number; h: number } | null>(null);

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

  const togglePin = useCallback((path: string) => {
    setPins(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else {
        if (next.size >= MAX_PINS) { setNote(`ピンは${MAX_PINS}個まで`); return prev; }
        next.add(path);
      }
      saveSet(PIN_KEY, bossType, next);
      return next;
    });
  }, []);

  const setTabSaved = useCallback((t: 'behavior' | 'move') => { saveStr(TAB_KEY, bossType, t); setTab(t); }, []);
  const setSheetSaved = useCallback((s: Snap) => { saveStr(SNAP_KEY, bossType, s); setSheet(s); }, []);

  const onChange = useCallback((path: string, v: number) => {
    if (!entry) return;
    setAtPath(entry.table, path, v);
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
  }, [entry]);

  // 再生(社長要望v0.25.2625): 押した1つだけを実行。停止中なら硬直明けでまた止まる。
  const play = useCallback((key: string) => {
    if (!entry?.onPlay) return;
    const a = (entry.playables ?? []).find(p => p.key === key);
    if (!a) return;
    entry.onPlay(a, { solo: useGameStore.getState().bossMaker.paused, loop });
    bump(n => n + 1);
  }, [entry, loop]);

  // ---- つまみのドラッグ。**ドラッグ中は state を触らない**(DOMを直接動かす=再描画ゼロ) ----------
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
    const vh = window.innerHeight;
    const h = Math.max(HANDLE_PX, Math.min(vh * 0.92, d.h + (d.y - e.clientY)));
    el.style.height = `${h}px`;
  };
  const onHandleUp = () => {
    const d = dragRef.current, el = sheetRef.current;
    dragRef.current = null;
    if (!d || !el) return;
    const vh = window.innerHeight;
    const h = el.getBoundingClientRect().height;
    el.style.transition = '';
    el.style.height = '';
    // 動かしていない(タップ)なら段を1つ進める=つまみを叩くだけで開け閉めできる。
    const next = Math.abs(h - d.h) < 6
      ? (sheet === 'closed' ? 'half' : sheet === 'half' ? 'full' : 'closed')
      : nearestSnap(h, vh);
    setSheetSaved(next);
  };

  if (!active || !entry) return null;

  const changed = changedPaths(entry).length;
  const playState = entry.playState?.() ?? { verb: null, loop: null };
  const pinFields = entry.fields.filter(f => pins.has(f.path));

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
          <div className="w-1 shrink-0" />
          <button className={`${ico} ${off}`} onClick={() => setAllSecs(false)} title="全部畳む" aria-label="全部畳む">⇧</button>
          <button className={`${ico} ${off}`} onClick={() => setAllSecs(true)} title="全部開く" aria-label="全部開く">⇩</button>
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

      {/* ── ボトムシート: つまみをドラッグして 閉じる/半分/全画面 ── */}
      <div
        ref={sheetRef}
        className="pointer-events-auto absolute bottom-0 left-0 right-0 flex flex-col rounded-t-xl bg-black/85 backdrop-blur-sm transition-[height] duration-150"
        style={{ height: `${sheet === 'closed' ? HANDLE_PX : sheet === 'half' ? 46 : 88}${sheet === 'closed' ? 'px' : 'vh'}` }}
      >
        {/* ③ ピン行: **シートを閉じても残る**(これを回しながら戦う)。シートの上に浮かせる。 */}
        {pinFields.length > 0 && (
          <div className="pointer-events-auto absolute bottom-full left-0 right-0 mb-1 px-1">
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

        {/* つまみ(ドラッグ=無段階、タップ=次の段へ) */}
        <div
          className="flex shrink-0 cursor-ns-resize touch-none items-center justify-center py-1"
          onPointerDown={onHandleDown} onPointerMove={onHandleMove} onPointerUp={onHandleUp} onPointerCancel={onHandleUp}
          title="ドラッグで 閉じる/半分/全画面"
          aria-label="シートのつまみ"
        >
          <div className="h-1 w-12 rounded-full bg-white/40" />
          <span className="ml-2 text-[10px] text-white/40">
            {sheet === 'closed' ? '閉' : sheet === 'half' ? '半' : '全'}
          </span>
        </div>

        {sheet !== 'closed' && (
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
              <SectionList
                group={tab} entry={entry} open={openSecs} toggle={toggleSec} pins={pins}
                onChange={onChange} onPin={togglePin} onPlay={play} playState={playState} bump={rev}
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
                  setNote(r.errors.length ? r.errors[0] : `${r.applied}件を反映`);
                  bump(n => n + 1);
                }}
              >貼り戻し</button>
              <button
                className="rounded bg-white/10 px-2 py-1.5 text-[11px] font-bold text-white/75"
                onClick={() => { resetTuning(entry); setNote('既定へ戻しました'); bump(n => n + 1); }}
              >リセット</button>
              {note && <span className="truncate text-[10px] text-white/70">{note}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
