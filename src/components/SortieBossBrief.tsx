// 出撃前のボス一覧(社長指示2026-11-02「スタートボタン押した時に、モンハンみたいに出現予定のボスたちを?で表示。
// 出会ったら名前を表示」)。START を押すと出て、少し待つか画面を押すとそのまま出撃する。戻る/Esc で取り消し。
// 並び・「出会った」の判定は utils/sortieBossRoster.ts(この部品は描くだけ)。
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getStage } from '../data/campaign';
import { enemyDeathLabel } from '../store/gameStore';
import { bossIconSrc } from '../utils/bossIcon';
import { PixelIcon } from './PixelIcon';
import type { SortieBoss, SortieBossKind } from '../utils/sortieBossRoster';
import { secretPoiDefsForStage, type SecretPoiDef } from '../world/secretPois';
import { isSecretPoiFound } from '../data/progress';
import { spritePath } from '../utils/spriteLoader';

/** 自動で出撃するまでの時間。押せばすぐ出る。 */
export const SORTIE_BRIEF_HOLD_MS = 2800;
/** 出た直後に押しても受けない時間(START の二度押しで一覧が飛ばないように)。 */
const INPUT_LOCK_MS = 350;
/** 退場の尺(沈みながら暗く抜けてから出撃する)。 */
const EXIT_MS = 240;

// 区分の呼び名は変異体対策室の棚と同じ言葉(MAIN / GATE / 賞金首 / 徘徊 / DEEP)。
const KIND_LABEL: Record<SortieBossKind, string> = {
  stage: 'MAIN', gate: 'GATE', bounty: '賞金首', mutant: '徘徊', deep: 'DEEP',
};
const LEAD_KINDS: readonly SortieBossKind[] = ['stage', 'gate'];
const REST_KINDS: readonly SortieBossKind[] = ['bounty', 'mutant', 'deep'];

/** 一覧の中では「(変異)」「(変異体)」を外す(並べると同じ語の連打になる)。 */
const shortName = (b: SortieBoss): string =>
  (b.label ?? enemyDeathLabel(b.bossType)).replace(/[(（]変異体?[)）]$/, '');

const JP_FONT: React.CSSProperties = { fontFamily: 'var(--uf-jp), sans-serif' };

const Tile: React.FC<{ b: SortieBoss; size: number; delay: number; lead: boolean; qDur: number; qDelay: number }> = ({ b, size, delay, lead, qDur, qDelay }) => {
  const icon = b.known ? bossIconSrc(b.bossType, b.iconStageId) : null;
  return (
    <div
      className={`${lead ? 'sortie-brief-lead' : 'sortie-brief-tile'} min-w-0 text-center ${b.known ? '' : 'is-unknown'}`}
      style={{ animationDelay: `${delay}ms`, width: size + 24 }}
    >
      <div
        className={`mx-auto flex items-end justify-center overflow-hidden border ${b.known
          ? 'border-purple-200/30 bg-purple-400/[0.08]'
          : 'border-white/[0.09]'}`}
        style={{
          width: size, height: size,
          ...(b.known ? {} : { background: 'radial-gradient(circle at 50% 62%, rgba(120,70,170,0.10), rgba(0,0,0,0.35) 72%)', boxShadow: 'inset 0 0 14px rgba(0,0,0,0.9)' }),
        }}
      >
        {icon
          ? <img src={icon} alt="" draggable={false} className="object-contain" style={{ maxHeight: size - 4, maxWidth: size - 4, imageRendering: 'pixelated' }} />
          : <span
              className="sortie-brief-q flex h-full w-full items-center justify-center font-bold text-white/30"
              style={{ fontSize: Math.round(size * 0.4), animationDuration: `${qDur}ms`, animationDelay: `${qDelay}ms` }}
            >?</span>}
      </div>
      <div className="mt-1 flex h-4 items-center justify-center">
        {b.known
          ? <span className={`truncate font-semibold tracking-tight text-white/85 ${lead ? 'text-[12px]' : 'text-[10px]'}`} style={JP_FONT}>{shortName(b)}</span>
          : <span className="block h-px w-5 bg-white/20" />}
      </div>
    </div>
  );
};

/** 隠しPOIの札(research/HIDDEN_POI.md §5)。見つけた場所だけ絵と名前、まだの場所は「?」。ボスの札と同じ寸法・同じ読み方。 */
// compact=背の低い画面(iPhone SE 等)。札を小さくして1行に収め、名前は出さない(一覧が画面からはみ出さない・品質監査A-5)。
const SecretTile: React.FC<{ d: SecretPoiDef; found: boolean; size: number; compact: boolean; delay: number; qDur: number; qDelay: number }> = ({ d, found, size, compact, delay, qDur, qDelay }) => (
  <div className={`sortie-brief-tile min-w-0 text-center ${found ? '' : 'is-unknown'}`} style={{ animationDelay: `${delay}ms`, width: compact ? Math.round(size * 1.25) + 4 : Math.round(size * 1.25) + 16 }}>
    {/* 札は絵の比率(約1.25:1)。発見済みは絵そのものに縁があるので枠を外す。縮小なので pixelated にしない(潰れて読めない・監査#12)。 */}
    <div
      className={`mx-auto flex items-center justify-center overflow-hidden ${found ? '' : 'border border-white/[0.09]'}`}
      style={{
        width: Math.round(size * 1.25), height: size,
        ...(found ? {} : { background: 'radial-gradient(circle at 50% 62%, rgba(150,110,70,0.10), rgba(0,0,0,0.35) 72%)', boxShadow: 'inset 0 0 14px rgba(0,0,0,0.9)' }),
      }}
    >
      {found
        ? <img src={spritePath(d.texture)} alt="" draggable={false} className="object-contain" style={{ maxHeight: size, maxWidth: Math.round(size * 1.25) }} />
        : <span className="sortie-brief-q flex h-full w-full items-center justify-center font-bold text-white/30" style={{ fontSize: Math.round(size * 0.4), animationDuration: `${qDur}ms`, animationDelay: `${qDelay}ms` }}>?</span>}
    </div>
    {!compact && (
      <div className="mt-1 flex h-4 items-center justify-center">
        {found
          ? <span className="truncate text-[10px] font-semibold tracking-tight text-white/85" style={JP_FONT}>{d.name}</span>
          : <span className="block h-px w-5 bg-white/20" />}
      </div>
    )}
  </div>
);
/** 背の低い画面か(出た時に1回だけ見る)。 */
const isShortScreen = (): boolean => typeof window !== 'undefined' && window.innerHeight < 760;

interface Props {
  stageId: string;
  roster: readonly SortieBoss[];
  onDone: () => void;
  onCancel: () => void;
}

export const SortieBossBrief: React.FC<Props> = ({ stageId, roster, onDone, onCancel }) => {
  const [leaving, setLeaving] = useState(false);
  const shownAt = useRef(performance.now());
  // 自動の出撃・押しての出撃・取り消しが重なっても1回だけ。退場の動きの後に呼ぶ。
  const doneRef = useRef(false);
  const exitTimer = useRef<number | null>(null);
  const leave = useRef<(go: boolean) => void>(() => {});
  leave.current = (go: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    setLeaving(true);
    exitTimer.current = window.setTimeout(() => (go ? onDone() : onCancel()), EXIT_MS);
  };
  // 退場の途中で外された(画面が変わった等)時は、出撃も取り消しも呼ばない。
  useEffect(() => () => { if (exitTimer.current != null) window.clearTimeout(exitTimer.current); }, []);
  const unlocked = () => performance.now() - shownAt.current >= INPUT_LOCK_MS;

  useEffect(() => {
    const t = window.setTimeout(() => leave.current(true), SORTIE_BRIEF_HOLD_MS);
    const onKey = (e: KeyboardEvent) => {
      const go = e.key === 'Enter' || e.key === ' ';
      const back = e.key === 'Escape' || e.key === 'Backspace';
      if (!go && !back) return;
      e.preventDefault(); e.stopPropagation();
      if (back) leave.current(false);
      else if (unlocked()) leave.current(true);
    };
    window.addEventListener('keydown', onKey, true);
    return () => { window.clearTimeout(t); window.removeEventListener('keydown', onKey, true); };
  }, []);

  // 「?」の明滅は札ごとに周期と位相をずらす(全部が同時に瞬かない)。描き直しで変わらないよう1回だけ決める。
  const qTiming = useMemo(() => roster.map(() => ({ dur: 2100 + Math.round(Math.random() * 900), delay: -Math.round(Math.random() * 2500) })), [roster]);

  // 隠しPOI(ステージ1・3・4・5のみ)。発見済みは年表の記録で引く(出た時に1回だけ読む)。
  const secrets = useMemo(() => secretPoiDefsForStage(stageId).map(d => ({ d, found: isSecretPoiFound(stageId, d.id) })), [stageId]);
  const secretCompact = useMemo(isShortScreen, []);
  const secretTiming = useMemo(() => secrets.map(() => ({ dur: 2100 + Math.round(Math.random() * 900), delay: -Math.round(Math.random() * 2500) })), [secrets]);
  const stage = getStage(stageId);
  const known = roster.filter(b => b.known).length;
  const lead = roster.filter(b => LEAD_KINDS.includes(b.kind));
  const rows = REST_KINDS.map(k => ({ kind: k, list: roster.filter(b => b.kind === k) })).filter(r => r.list.length > 0);
  const idx = (b: SortieBoss) => roster.indexOf(b);
  let restN = 0;

  return (
    <div
      data-testid="sortie-boss-brief"
      // パッド/キーの操作対象をこの一覧に閉じる(裏のキャラ選択の START・戻るを押させない)。A=出撃 / B=戻る。
      data-nav-modal="sortie-brief"
      className={`sortie-brief fixed inset-0 z-[60] flex flex-col justify-center select-none ${leaving ? 'is-leaving' : ''}`}
      style={{
        background: 'linear-gradient(to bottom, rgba(6,5,10,0.93) 0%, #06050a 30%, #06050a 100%)',
        paddingLeft: 'max(env(safe-area-inset-left), 16px)',
        paddingRight: 'max(env(safe-area-inset-right), 16px)',
        ['--sb-exit' as string]: `${EXIT_MS}ms`,
      }}
      onPointerDown={() => { if (unlocked()) leave.current(true); }}
    >
      {/* 下の画面の「戻る」と同じ位置。ここでは取り消し(キャラ選択へ戻る)。 */}
      <button
        type="button"
        data-testid="sortie-brief-back"
        data-nav-back
        onPointerDown={e => e.stopPropagation()}
        onClick={() => leave.current(false)}
        className="absolute z-10 h-9 px-2.5 rounded-none bg-black/45 text-white/85 flex items-center gap-1 active:bg-black/65"
        style={{ top: 'max(env(safe-area-inset-top), 12px)', left: 'max(env(safe-area-inset-left), 12px)' }}
        aria-label="戻る"
      >
        <PixelIcon name="chevron-left" size={16} /><span className="text-[12px]">戻る</span>
      </button>

      <div className="sortie-brief-panel mx-auto w-full max-w-[520px] landscape:max-w-[720px]">
        <div className="sortie-brief-head flex items-end justify-between gap-3 border-b border-purple-200/15 pb-2">
          <div className="min-w-0">
            <div className="text-[10px] tracking-[0.32em] text-purple-200/55" style={JP_FONT}>{stage?.locationTitle ?? ''}</div>
            <div className="truncate text-[19px] font-bold leading-tight text-white" style={JP_FONT}>{stage?.name ?? ''}</div>
          </div>
          <div className="shrink-0 pb-0.5 text-[11px] text-white/50" style={JP_FONT}>
            確認済み <span className="text-[16px] font-bold tabular-nums text-white/90">{known}</span>
            <span className="text-[13px] tabular-nums text-white/50"> / {roster.length}</span>
          </div>
        </div>

        {lead.length > 0 && (
          <div className="mt-4 flex justify-center gap-6">
            {lead.map((b, i) => (
              <div key={b.encounterKey} className="flex flex-col items-center">
                <div className="sortie-brief-lead mb-1 text-[10px] tracking-[0.24em] text-purple-200/60" style={{ animationDelay: `${120 + i * 110}ms` }}>{KIND_LABEL[b.kind]}</div>
                <Tile b={b} size={84} lead delay={120 + i * 110} qDur={qTiming[idx(b)].dur} qDelay={qTiming[idx(b)].delay} />
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 space-y-3">
          {rows.map(r => {
            const rowStart = 360 + restN * 40;
            restN += r.list.length;
            return (
              <div key={r.kind}>
                <div className="sortie-brief-tile mb-1 text-[10px] tracking-[0.24em] text-purple-200/50" style={{ animationDelay: `${rowStart}ms` }}>{KIND_LABEL[r.kind]}</div>
                <div className="flex flex-wrap gap-x-1 gap-y-2">
                  {r.list.map((b, j) => (
                    <Tile key={b.encounterKey} b={b} size={52} lead={false} delay={rowStart + j * 40} qDur={qTiming[idx(b)].dur} qDelay={qTiming[idx(b)].delay} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {secrets.length > 0 && (() => {
          const rowStart = 360 + restN * 40;
          return (
            <div className="mt-3">
              <div className="sortie-brief-tile mb-1 flex items-baseline justify-between text-[10px] tracking-[0.24em] text-amber-100/50" style={{ animationDelay: `${rowStart}ms` }}>
                <span style={JP_FONT}>隠れ処</span>
                <span className="tracking-normal text-white/45 tabular-nums" style={JP_FONT}>{secrets.filter(x => x.found).length} / {secrets.length}</span>
              </div>
              {/* 大きい札は4枚ずつ(7=4+3 / 8=4+4)に揃える=端数の行が偶然に見えない(監査#11)。小さい札は1行。 */}
              <div className="grid gap-x-1 gap-y-2" style={{ gridTemplateColumns: `repeat(${secretCompact ? secrets.length : 4}, max-content)` }}>
                {secrets.map((x, j) => (
                  <SecretTile key={x.d.id} d={x.d} found={x.found} size={secretCompact ? 28 : 52} compact={secretCompact} delay={rowStart + j * 40} qDur={secretTiming[j].dur} qDelay={secretTiming[j].delay} />
                ))}
              </div>
            </div>
          );
        })()}

        {/* 出撃までの残り(押せばすぐ出る)。 */}
        <button
          type="button"
          data-testid="sortie-brief-go"
          data-nav-default
          onPointerDown={e => e.stopPropagation()}
          onClick={() => { if (unlocked()) leave.current(true); }}
          className="mt-4 flex w-full items-center gap-2 py-2"
        >
          <span className="text-[10px] tracking-[0.24em] text-purple-200/60" style={JP_FONT}>出撃</span>
          <span className="block h-[2px] flex-1 overflow-hidden bg-white/10">
            <span className="sortie-brief-bar block h-full bg-purple-200/75" style={{ animationDuration: `${SORTIE_BRIEF_HOLD_MS}ms` }} />
          </span>
        </button>
      </div>
    </div>
  );
};

export default SortieBossBrief;
