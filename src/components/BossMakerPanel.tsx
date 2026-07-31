// ボスメーカーの調整フォーム(BOSS_MAKER.md §1-4/§1-5)。
//
// ★社長補足v0.25.2621「**一騎打ちのトレーニング場 兼 メーカー**。その場で動かしながら数字を調整する」:
// これは設定画面ではなく**戦いながら回す道具**。よって主たる操作は「打つ」ではなく「**摘まむ**」。
//   ① 値の上を左右にドラッグ = スクラブ(指1本で回せる。モバイルでソフトキーボードが出ない)
//   ② +/− ボタン(1タップで刻む・押しっぱなしで連続)
//   ③ 直接入力は**副**(タップで開く。開いている間だけ移動入力を殺す=useGameControls側で実装)
//
// ★React再描画の規律(CLAUDE.md): このコンポーネントは **store を毎フレーム購読しない**。
// 毎フレーム変わる表示(状態名/距離/経過ms)は BossMakerLive.tsx へ隔離してある。
// ここが再描画されるのは「数値を触った時」「トグルを押した時」だけ。
import { useCallback, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import type { Enemy } from '../types/game';
import {
  getBossTuning, getAtPath, setAtPath, clampField, changedPaths, resetTuning,
  formatTuningText, parseTuningText, UNIT_SUFFIX, type TuningField,
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

// ---- 1つの数値欄(スクラブ + ± + 直接入力) ------------------------------------------------------
const NumberScrub = ({ field, value, changed, onChange }: {
  field: TuningField; value: number; changed: boolean; onChange: (v: number) => void;
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
    <div className="flex items-center gap-1 py-[1px]">
      <div className="min-w-0 flex-1 truncate text-[10px] text-white/60" title={field.hint ?? field.path}>{field.label}</div>
      <button
        className="h-6 w-6 shrink-0 rounded bg-white/10 text-[13px] leading-none text-white/80 active:bg-white/25"
        onPointerDown={() => holdStart(-1)} onPointerUp={holdEnd} onPointerLeave={holdEnd} onPointerCancel={holdEnd}
        aria-label={`${field.label} を減らす`}
      >−</button>
      {editing ? (
        <input
          autoFocus type="number" inputMode="decimal" value={draft}
          className="h-6 w-[64px] shrink-0 rounded bg-black/60 px-1 text-right font-mono text-[11px] text-white outline-none ring-1 ring-emerald-400"
          onChange={ev => setDraft(ev.target.value)}
          onBlur={() => { const n = Number(draft); if (Number.isFinite(n)) apply(n); setEditing(false); }}
          onKeyDown={ev => {
            if (ev.key === 'Enter') { const n = Number(draft); if (Number.isFinite(n)) apply(n); setEditing(false); }
            if (ev.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        <div
          className={`h-6 w-[64px] shrink-0 cursor-ew-resize select-none rounded px-1 text-right font-mono text-[11px] leading-6 ${changed ? 'bg-amber-500/25 text-amber-200' : 'bg-black/40 text-white'}`}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          title="左右にドラッグで増減 / タップで直接入力"
        >{fmt(value, step)}</div>
      )}
      <button
        className="h-6 w-6 shrink-0 rounded bg-white/10 text-[13px] leading-none text-white/80 active:bg-white/25"
        onPointerDown={() => holdStart(1)} onPointerUp={holdEnd} onPointerLeave={holdEnd} onPointerCancel={holdEnd}
        aria-label={`${field.label} を増やす`}
      >＋</button>
      <div className="w-7 shrink-0 text-[9px] text-white/40">{UNIT_SUFFIX[field.kind]}</div>
    </div>
  );
};

// ---- グループ(左上=行動パターン / 右上=技) ------------------------------------------------------
const FieldGroup = ({ fields, table, defaults, onChange }: {
  fields: TuningField[]; table: Record<string, unknown>; defaults: Record<string, unknown>;
  onChange: (path: string, v: number) => void;
}) => {
  const sections = useMemo(() => {
    const m = new Map<string, TuningField[]>();
    for (const f of fields) { const a = m.get(f.section) ?? []; a.push(f); m.set(f.section, a); }
    return [...m.entries()];
  }, [fields]);
  return (
    <>
      {sections.map(([sec, fs]) => (
        <div key={sec} className="mb-1">
          <div className="mb-[2px] text-[10px] font-bold text-emerald-300/90">{sec}</div>
          {fs.map(f => (
            <NumberScrub
              key={f.path} field={f}
              value={getAtPath(table, f.path) ?? 0}
              changed={getAtPath(table, f.path) !== getAtPath(defaults, f.path)}
              onChange={v => onChange(f.path, v)}
            />
          ))}
        </div>
      ))}
    </>
  );
};

// ---- 本体 --------------------------------------------------------------------------------------
export const BossMakerPanel = () => {
  const active = useGameStore(s => s.bossMaker.active);
  const invincible = useGameStore(s => s.bossMaker.invincible);
  const paused = useGameStore(s => s.bossMaker.paused);
  const showHitbox = useGameStore(s => s.bossMaker.showHitbox);
  const setBossMaker = useGameStore(s => s.setBossMaker);
  const [, bump] = useState(0);
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(true);
  const bossType = 'idol'; // フェーズ1はアイドル1体(BOSS_MAKER.md §6)
  const entry = getBossTuning(bossType);

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

  if (!active || !entry) return null;

  const changed = changedPaths(entry).length;
  const behavior = entry.fields.filter(f => f.group === 'behavior');
  const moves = entry.fields.filter(f => f.group === 'move');

  const btn = 'rounded px-2 py-1 text-[10px] font-bold';
  const on = 'bg-emerald-500/80 text-black';
  const off = 'bg-white/10 text-white/70';

  const patchBoss = (fn: (e: Enemy) => Partial<Enemy>) => {
    useGameStore.setState(s => ({ enemies: s.enemies.map(e => (e.type === bossType ? { ...e, ...fn(e) } : e)) }));
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] select-none">
      {/* 上部中央: 開閉と全体トグル */}
      <div className="pointer-events-auto absolute left-1/2 top-1 flex -translate-x-1/2 gap-1 rounded bg-black/70 p-1">
        <button className={`${btn} ${off}`} onClick={() => setOpen(o => !o)}>{open ? '隠す' : 'メーカー'}</button>
        <button className={`${btn} ${invincible ? on : off}`} onClick={() => setBossMaker({ invincible: !invincible })}>無敵</button>
        <button className={`${btn} ${paused ? on : off}`} onClick={() => setBossMaker({ paused: !paused })}>停止</button>
        <button className={`${btn} ${showHitbox ? on : off}`} onClick={() => setBossMaker({ showHitbox: !showHitbox })}>判定</button>
      </div>

      {open && (
        <>
          {/* 左上: 行動パターン */}
          <div className="pointer-events-auto absolute left-1 top-9 max-h-[72vh] w-[210px] overflow-y-auto rounded bg-black/75 p-1.5">
            <div className="mb-1 flex items-center justify-between">
              <div className="text-[11px] font-bold text-white">行動パターン</div>
              <BossMakerLive bossType={bossType} />
            </div>
            <FieldGroup fields={behavior} table={entry.table} defaults={entry.defaults} onChange={onChange} />
            <div className="mt-1 flex flex-wrap gap-1">
              <button className={`${btn} ${off}`} onClick={() => patchBoss(e => ({ health: Math.max(1, Math.round(e.maxHealth * 0.4)) }))}>HP40%</button>
              <button className={`${btn} ${off}`} onClick={() => patchBoss(() => ({ bossPhase: 2 }))}>P2</button>
              <button className={`${btn} ${off}`} onClick={() => patchBoss(() => ({ health: 1 }))}>瀕死</button>
              <button className={`${btn} ${off}`} onClick={() => {
                const p = useGameStore.getState().player;
                patchBoss(() => ({ x: p.x, y: p.y - 300 }));
              }}>位置戻す</button>
            </div>
          </div>

          {/* 右上: 技ごと */}
          <div className="pointer-events-auto absolute right-1 top-9 max-h-[72vh] w-[210px] overflow-y-auto rounded bg-black/75 p-1.5">
            <div className="mb-1 text-[11px] font-bold text-white">技({entry.label})</div>
            <FieldGroup fields={moves} table={entry.table} defaults={entry.defaults} onChange={onChange} />
          </div>

          {/* 下部中央: コピー/貼り戻し/リセット */}
          <div className="pointer-events-auto absolute bottom-1 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded bg-black/75 p-1">
            <span className="px-1 text-[10px] text-amber-300">変更 {changed}</span>
            <button
              className={`${btn} bg-emerald-500/80 text-black`}
              onClick={async () => {
                const txt = formatTuningText(entry, APP_VERSION);
                try { await navigator.clipboard.writeText(txt); setNote('コピーしました'); }
                catch { window.prompt('コピーしてください', txt); setNote(''); }
              }}
            >コピー</button>
            <button
              className={`${btn} ${off}`}
              onClick={async () => {
                let txt = '';
                try { txt = await navigator.clipboard.readText(); } catch { txt = window.prompt('貼り付け') ?? ''; }
                if (!txt) return;
                const r = parseTuningText(entry, txt);
                setNote(r.errors.length ? r.errors[0] : `${r.applied}件を反映`);
                bump(n => n + 1);
              }}
            >貼り戻し</button>
            <button className={`${btn} ${off}`} onClick={() => { resetTuning(entry); setNote('既定へ戻しました'); bump(n => n + 1); }}>リセット</button>
            {note && <span className="px-1 text-[10px] text-white/70">{note}</span>}
          </div>
        </>
      )}
    </div>
  );
};
