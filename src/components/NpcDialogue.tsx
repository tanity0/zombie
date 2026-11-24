import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useGameStore, shiftSkillProcFeed } from '../store/gameStore';
import { spritePath } from '../utils/spriteLoader';
import { useHudLandscape } from './HudScale';
import { slowLineVisibleChars } from '../utils/slowLine';
import { SKILLS, skillIcon } from '../data/campaign';
import { useSkillIconSheet } from '../utils/useSkillIconSheet';
import { skillIconStyle, hasSkillIcon, skillSingleIconName } from '../data/skillIcons';
import { nextSkillProcWake, skillProcAlive, skillProcLeaving, isTechProcKey, isTechSecretKey, newestSkillProcId } from '../utils/skillProcFeed';
import { BRAWLER_TECH_NAMES, type BrawlerTechDir } from '../data/brawlerTechNames';
import type { SkillKey } from '../types/game';
import { isFollowToggleLineText } from '../data/npcLines';
import { playSfx } from '../audio/audioManager';
import {
  COMMS_ACCENT_MS, COMMS_COMPANION_FADE_MS,
  commsEntranceKind, commsEntranceSound, commsEntranceTiming, commsRowsShift,
  commsSpeakerKey, shouldHideCompanionOnEntrance, shouldPlayCommsEntrance,
} from '../utils/commsEntrance';
import { playCommsEntrance, playCommsExit } from './commsMotionAnim';
import { PROJ_ON } from '../utils/projFlag';
import { setHudAvoidRect } from '../utils/hudAvoidRects';
import { computeViewport } from '../utils/viewport';

// 話者名 → 立ち絵のベースパス(spritePathの`${base}-0`)+枠幅。セリフ表示時に上半身(バスト)を出す。
// 用語(社長決定v0.25.1851): この左上のモデル付き吹き出し=**「会話」**。会話は必ずモデル入り
// (モデルが大きい場合は半身)。新しい会話話者を足す時はここに立ち絵を必ず登録する。
// ※モデル無しの帯バナー(紅き月・変異体が興奮し始めた等)=「通信」で別系統(eventBanner)。
// boxW=表示幅(横に広い素材は文字被り防止で広げる)。護衛軍人はpixiSceneのESCORT_SPRITE_BASEと同じ対応(index 0..7)。
// frame=立ち姿に使うコマ(社長指示v0.25.1854「会話の立ち姿は全員、足閉じてる方の絵」):
// 護衛3コマ歩きは1=足閉じ(通過姿勢)/shooterは0/medic-walk(4コマ)は2/futariはバストアップ=0のみ。
// imgH=表示高さ(既定64)。
// NPC8人(出撃している護衛8人)は全表示0.9倍(社長指示v0.25.1859・0.8→0.9)=会話立ち絵imgH58(64×0.9)・枠36。
// sheet=横並びのシート(`${base}.png`)からコマ frame を切り出す時のコマ数(社長支給の歩きシート2026-10-07)。
// 軍人8人は歩きシートの1コマ目=足が閉じた通過姿勢(旧3コマの「足閉じ」と同じ役)。
const NPC_PORTRAIT: Record<string, { base: string; boxW: number; frame: number; imgH?: number; sheet?: number }> = {
  'エドガー': { base: 'npc/edgar-walk', boxW: 36, frame: 1, imgH: 58, sheet: 8 },
  'ジョセフ': { base: 'npc/joseph-walk', boxW: 36, frame: 1, imgH: 58, sheet: 16 },
  'エリザベス': { base: 'npc/elizabeth-walk', boxW: 36, frame: 1, imgH: 58, sheet: 8 },
  '武蔵': { base: 'npc/musashi-walk', boxW: 36, frame: 1, imgH: 58, sheet: 8 },
  'ムハンマド': { base: 'npc/muhammad-walk', boxW: 36, frame: 1, imgH: 58, sheet: 16 },
  'チェン': { base: 'npc/chen-walk', boxW: 36, frame: 1, imgH: 58, sheet: 8 },
  'ローレン': { base: 'npc/lauren-walk', boxW: 36, frame: 1, imgH: 58, sheet: 16 },
  'フェイザー': { base: 'npc/phaser-walk', boxW: 36, frame: 1, imgH: 58, sheet: 8 },
  // 二人組(クエストNPC)。話者名=社長命名(v0.25.1719): グレン(男)/ミラ(女) → 専用バストアップ
  // (社長素材v0.25.1716・sprites/npc/futari-*-0.png=頭〜胸の切り出し)。肩まで入る=枠広め(v0.25.1719)。
  'グレン': { base: 'npc/futari-man', boxW: 62, frame: 0 },
  'ミラ': { base: 'npc/futari-woman', boxW: 62, frame: 0 },
  // チュートリアル随行(社長指示v0.25.1849「グレッグたちの通信にもモデル表示」):
  // グレッグ=軍人(レスキューのヘルメット兵=rescue/shooter・92x120=縦長) / ジュン=衛生兵
  // (npc/medic-walk 78x64=横長のためboxW広め)。
  // shooterは0=足閉じ・1=足開き(4倍拡大で確認・v0.25.1856修正。ゲーム内静止コマ0とも一致)。
  // グレッグ(2026-10-11 ヘルメット兵の歩きシート6コマへ差し替え): 両足が着く1コマ目(ゲーム内の立ち止まりと同じ)。
  'グレッグ': { base: 'rescue/shooter-walk', boxW: 40, frame: 1, sheet: 6 },
  // 変異後グレン(M7咆哮用・社長指示v0.25.2073「会話アイコンは変異後の頭部分だけ」):
  // glen-boss.png の頭部クロップ+背景透過(art-src/glen-head.mjs生成)。表示名は「グレン」のまま、
  // npcDialogue.portrait='グレン(変異)' のオーバーライドでこのエントリを引く。
  'グレン(変異)': { base: 'npc/glen-mutant-head', boxW: 46, frame: 0, imgH: 52 },
  // ジュン(2026-10-11 歩きシート6コマへ差し替え): 足閉じ=2(ゲーム内の立ち止まりと同じコマ)。体の可視幅は約46px=boxW据え置き。
  'ジュン': { base: 'npc/medic-walk', boxW: 46, frame: 2, sheet: 6 },
};

// 横並びシートから1コマを切り出して、旧立ち絵と同じ置き方(足元=上から2行分・中央)で出す。
// コマ幅は読み込んだ画像の実寸から決める(シートの寸法を二重に持たない)。読み込み前は幅0=出ない。
const SheetPortrait = ({ src, frames, frame, h, alt }: { src: string; frames: number; frame: number; h: number; alt: string }) => {
  const [fw, setFw] = useState(0);
  return (
    <div
      style={{
        position: 'absolute', left: '50%', top: 42, transform: 'translate(-50%, -100%)',
        width: fw, height: h, overflow: 'hidden',
      }}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        onLoad={e => { const im = e.currentTarget; if (im.naturalHeight > 0) setFw((h * im.naturalWidth) / im.naturalHeight / frames); }}
        style={{
          position: 'absolute', top: 0, left: -fw * frame,
          height: h, width: 'auto', maxWidth: 'none', imageRendering: 'pixelated',
        }}
      />
    </div>
  );
};

// slow の行(ステージ4のジュンの離脱の一言・research/JUN_ESCORT.md): 文字をゆっくり送り、三点リーダで一度止まる
// (道中の同じ文言と出し方で区別する)。三点リーダは間をおいてから出す=言い淀み。この小さな部品だけが再描画する。
// ★送りは**描画の周期(rAF)**で、表示開始からの経過時間から文字数を出す(utils/slowLine・コード監査2026-10-23 UI B-2③)。
// 旧: 1文字ごとの setTimeout の鎖=重い時にタイマーが後回しにされると「名前だけ出て本文が空」で止まった。
// 速さ・溜めは旧実装と同じ(slowLine.test が旧実装の時刻と突き合わせている)。裏タブで rAF が止まった時の保険に粗いタイマーも併走。
const SlowLine = ({ text }: { text: string }) => {
  const [n, setN] = useState(0);
  useEffect(() => {
    const chars = Array.from(text);
    const t0 = performance.now();
    let raf = 0;
    let shown = 0;
    let finished = false;
    const update = () => {
      if (finished) return;
      const k = slowLineVisibleChars(chars, performance.now() - t0);
      if (k !== shown) { shown = k; setN(k); }
      if (k >= chars.length) { finished = true; window.cancelAnimationFrame(raf); window.clearInterval(iv); }
    };
    const loop = () => { update(); if (!finished) raf = window.requestAnimationFrame(loop); };
    const iv = window.setInterval(update, 250);
    setN(0);
    raf = window.requestAnimationFrame(loop);
    return () => { finished = true; window.cancelAnimationFrame(raf); window.clearInterval(iv); };
  }, [text]);
  const chars = Array.from(text);
  return (
    <span className="text-white/90">
      {chars.slice(0, n).join('')}
      {/* 未表示の文字は透明で場所だけ取る(箱の大きさが文字送りで伸び縮みしない)。 */}
      <span style={{ opacity: 0 }}>{chars.slice(n).join('')}</span>
    </span>
  );
};

/** スキルの絵(単体ファイル→1枚シート→絵文字の順・RunHud と同じ引き方)。 */
const SkillProcIcon = ({ k }: { k: SkillKey }) => {
  const sheet = useSkillIconSheet();
  const single = skillSingleIconName(k);
  if (single) return <img src={spritePath(single)} alt="" className="w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} draggable={false} />;
  const st = sheet && hasSkillIcon(k) ? skillIconStyle(k, sheet.url, 20, sheet) : null;
  return st ? <span style={st} aria-hidden /> : <span className="text-[13px] leading-none">{skillIcon(k)}</span>;
};

/**
 * 格闘の技の行の絵=入れた向きへ進む楔(打撃の軌跡の形・先が太く、後ろへ細く引く)。上=構え/下=大踏み潰し/左=気功/右=飛び蹴り。
 * 向きだけでなく、技ごとに一画だけ違う: 構え=楔の根元に受けの横線/大踏み潰し=楔の先に地面の線/気功=楔の先に弾の丸/飛び蹴り=楔だけ。
 * 秘奥義は4本の楔が中心から四方へ開く(4つを出し切った先)。技ごとの絵の素材は無いので SVG で描く。
 * 色は格闘の白金(BrawlerHitCount と同じ)、秘奥義だけ炸裂の青白。
 */
const TECH_DIR_DEG: Record<Exclude<BrawlerTechDir, 'all' | 'chain'>, number> = { up: 0, right: 90, down: 180, left: 270 };
// 上向きの楔(先 y=2.5・尾 y=17)。**先の側が太く、後ろへ細く引く**=動いた跡の形(太い側へ進んで見える)。向きは回して作る。
const TECH_WEDGE = 'M10 2.5 L12.9 6.8 L10 17 L7.1 6.8 Z';
const TECH_INK = 'rgba(8,10,14,0.9)';
const TechProcIcon = ({ dir }: { dir: BrawlerTechDir }) => {
  if (dir === 'all') {
    return (
      <svg viewBox="0 0 20 20" className="w-full h-full" aria-hidden style={{ overflow: 'visible', filter: 'drop-shadow(0 0 2.5px rgba(125,211,252,0.95))' }}>
        {[0, 90, 180, 270].map(d => (
          <path key={d} d="M10 0.8 L11.7 6.6 L10 8.6 L8.3 6.6 Z" transform={`rotate(${d} 10 10)`} fill="#d8f1ff" stroke="rgba(4,18,30,0.9)" strokeWidth="0.9" strokeLinejoin="round" style={{ paintOrder: 'stroke' }} />
        ))}
      </svg>
    );
  }
  const stroke = { stroke: TECH_INK, strokeWidth: 1.1, strokeLinejoin: 'round' as const, style: { paintOrder: 'stroke' as const } };
  if (dir === 'chain') {
    // ★自動の続き(research/BRAWLER.md §34・空中投げ/蹴り上げからのスープレックス): 入れた向きは無い=楔は出さず、上の行から下りて右へ折れる続きの線だけ(字下げ)。
    return (
      <svg viewBox="0 0 20 20" className="w-full h-full" aria-hidden style={{ overflow: 'visible' }}>
        <path d="M7.2 1.5 H8.8 V11.2 H16.5 V12.8 H7.2 Z" fill="#fbf6ea" {...stroke} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" className="w-full h-full" aria-hidden style={{ overflow: 'visible' }}>
      <g transform={`rotate(${TECH_DIR_DEG[dir]} 10 10)`} fill="#fbf6ea">
        <path d={TECH_WEDGE} {...stroke} />
        {/* 構え: 根元に横線(足を据えて受ける)。 */}
        {dir === 'up' && <path d="M4.5 17.8 H15.5 V19.2 H4.5 Z" {...stroke} />}
        {/* 大踏み潰し: 先に地面の線(踏み抜く先)。 */}
        {dir === 'down' && <path d="M3.5 0.6 H16.5 V2 H3.5 Z" {...stroke} />}
        {/* 気功: 先に弾の丸。 */}
        {dir === 'left' && <circle cx="10" cy="2.2" r="2.4" {...stroke} />}
      </g>
    </svg>
  );
};
/** 技の行の左端の印の色。レア度の段に見えないよう、普通のスキルの印より一段沈める(技は運で起きる物ではない)。秘奥義だけ立てる。 */
const TECH_MARK_COLOR = 'rgba(241,230,200,0.45)';
const TECH_SECRET_MARK_COLOR = 'rgba(125,211,252,1)';

/** レア度の色(左端の細い印)。RunHud のスキル欄の縁と同じ色=同じスキルだと結び付く。 */
const PROC_RARITY_COLOR: Record<'normal' | 'rare' | 'super', string> = {
  normal: 'rgba(148,163,184,0.75)', rare: 'rgba(192,132,252,0.9)', super: 'rgba(252,211,77,0.95)',
};

/**
 * スキルが効いた瞬間の表示(社長指示2026-11-01「スキル発動時は通信欄下に表示したい」→「効いた瞬間に新しく出す」)。
 * 通信(会話)の板の下に、絵+名前の行を積む(新しい物が下)。並び・数え方・消える時刻は utils/skillProcFeed。
 * - 会話の板とは別の層に見せる: 板を敷かず、左端にレア度の細い印+縁取り文字。絵は立ち絵の列、名前は会話の本文の列に揃える。
 * - 入る: 左から慣性つきで滑り込み、少し行き過ぎて戻る。同じ瞬間に効いた行は時間差で入る。最新の行の絵は一度ふくらむ。
 * - 消える: 左へ引っ込みながら行の高さを畳む=下の行は跳ばずに詰まる(上限超えで押し出された行も同じ動き)。
 * - 同じスキルがまた効くと、行は増えずに「×N」が増え、絵がふくらみ直す。
 * - 一時停止の間は動きも時計も止める(再開時に止めていた分だけ先送り)。
 * 購読は発動の時だけ変わる配列と一時停止の真偽だけ=毎フレーム描き直さない。描き直しは時刻の境目で1回ずつ。
 */
/** 行の段の位置が、行そのものの増減で変わった時の動き(会話の板の出入りの時は呼び手が渡す shift を使う)。 */
const PROC_ROWS_SHIFT_DEFAULT = { ms: 300, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' };
const SkillProcRows = ({ align, boxSig, boxShift }: { align: number; boxSig: string; boxShift: { ms: number; easing: string } }) => {
  const feed = useGameStore(s => s.skillProcFeed);
  const paused = useGameStore(s => s.isPaused || s.showUpgradeMenu);
  const [, wake] = useState(0);
  const pausedAtRef = useRef<number | null>(null);
  // 会話の板が出る/消えると行の塊の位置が変わる=跳ばずに慣性つきで移る(前の位置から今の位置へ・FLIP)。
  // 板の出入りで変わった時は板と同じ尺・曲線(入り=板の移動 / 消え=ease-in・社長指示2026-11-17の監査是正)、
  // 行の増減で変わった時は今どおり 300ms。位置は「配置の位置」(動きの途中の transform を除いた位置)で覚え、
  // 動きの途中で次の変化が来ても、今見えている位置から続けて動く(跳ばない)。
  const boxRef = useRef<HTMLDivElement | null>(null);
  const prevTopRef = useRef<number | null>(null);
  const prevSigRef = useRef(boxSig);
  const shiftAnimRef = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    const el = boxRef.current;
    const sigChanged = prevSigRef.current !== boxSig;
    prevSigRef.current = boxSig;
    if (!el) { prevTopRef.current = null; return; }
    const r = el.getBoundingClientRect();
    const scale = el.offsetHeight > 0 && r.height > 0 ? r.height / el.offsetHeight : 1;
    const tf = getComputedStyle(el).transform;
    const cur = tf && tf !== 'none' ? new DOMMatrixReadOnly(tf).m42 : 0; // 動きの途中の縦のずれ(要素の座標)
    const layoutTop = r.top - cur * scale;
    const prev = prevTopRef.current;
    prevTopRef.current = layoutTop;
    if (prev === null || Math.abs(prev - layoutTop) < 1 || typeof el.animate !== 'function') return;
    const from = (prev - layoutTop) / scale + cur; // 今見えている位置
    const t = sigChanged ? boxShift : PROC_ROWS_SHIFT_DEFAULT;
    shiftAnimRef.current?.cancel();
    shiftAnimRef.current = el.animate(
      [{ transform: `translateY(${from.toFixed(1)}px)` }, { transform: 'translateY(0px)' }],
      { duration: t.ms, easing: t.easing },
    );
  });
  useEffect(() => {
    if (paused) { if (pausedAtRef.current === null) pausedAtRef.current = Date.now(); return; }
    if (pausedAtRef.current !== null) { const ms = Date.now() - pausedAtRef.current; pausedAtRef.current = null; shiftSkillProcFeed(ms); return; }
    const t = nextSkillProcWake(feed, Date.now());
    if (t === null) return;
    const id = window.setTimeout(() => wake(n => n + 1), Math.max(0, t - Date.now()) + 16);
    return () => window.clearTimeout(id);
  });
  const now = pausedAtRef.current ?? Date.now();
  const rows = feed.filter(e => skillProcAlive(e, now));
  if (rows.length === 0) return null;
  const newestId = newestSkillProcId(rows); // いま効いた行(入った時・数が増えた時)を明るく
  const playState = paused ? 'paused' : 'running';
  return (
    <div ref={boxRef} className="flex flex-col items-start" style={{ margin: '6px 0' }}>
      {rows.map(e => {
        const leaving = skillProcLeaving(e, now);
        const sinceIn = now - e.at - e.delay;
        const tech = isTechProcKey(e.key) ? BRAWLER_TECH_NAMES[e.key] : null;
        const secret = isTechSecretKey(e.key); // 秘奥義・殺陣(刀)
        const markColor = tech ? (secret ? TECH_SECRET_MARK_COLOR : TECH_MARK_COLOR) : PROC_RARITY_COLOR[SKILLS[e.key as SkillKey].rarity];
        // 名前の色はスキルと同じ(技かどうかは絵=向きの楔で分かる)。秘奥義だけ炸裂の青。古い行は沈める(今どおり)。
        const newest = e.id === newestId;
        const nameColor = !newest ? 'rgba(186,200,214,0.78)' : secret ? 'rgba(125,211,252,1)' : 'rgba(224,242,254,1)';
        return (
          <div
            key={e.id}
            className={`skill-proc-row flex items-center ${leaving ? 'is-out' : ''}`}
            style={{
              // 入る動きは「入ってから経った時間」ぶん進めた所から(描き直しで頭から再生し直さない)。
              animationDelay: leaving ? "0ms" : `${Math.round(-sinceIn)}ms`, // 同時に効いた行の時間差(正)も、入ってから経った分(負)もここで
              animationPlayState: playState,
              paddingLeft: 4,
            }}
          >
            <span className="skill-proc-mark self-stretch" style={{ background: markColor, ...(secret ? { width: 3 } : null) }} />
            <span className="relative shrink-0 flex items-center justify-center" style={{ width: align - 8, height: 20 }}>
              <span
                key={e.hits}
                className={`relative w-5 h-5 flex items-center justify-center ${tech ? '' : 'overflow-hidden'} ${e.id === newestId || e.hits > 1 ? 'skill-proc-pop' : ''}`}
                style={{ animationPlayState: playState }}
              >{tech
                // 技の絵は古い行で名前と一緒に沈む(絵だけ浮かせない)。
                ? <span className="block transition-opacity duration-300" style={{ width: 20, height: 20, opacity: newest ? 1 : 0.6 }}><TechProcIcon dir={tech.dir} /></span>
                : <SkillProcIcon k={e.key as SkillKey} />}</span>
            </span>
            <span
              // 秘奥義は滅多に出ない見せ場=字を大きく・重く(光らせず、縁を青黒で締める)。他の行は今どおり。
              className={`${secret ? 'text-[13px] font-extrabold' : 'text-[11px] font-bold tracking-wide'} gt-outline whitespace-nowrap transition-colors duration-300`}
              style={{ color: nameColor, ...(secret ? { letterSpacing: '0.08em', ['--gt-ink' as string]: 'rgba(4,18,30,0.95)' } : null) }}
            >
              {tech ? tech.name : SKILLS[e.key as SkillKey].name}
              {e.hits > 1 && (tech
                // 技の回数は格闘の数字の系(ヒット数の表示と同じ字・白金)。スキルの ×N(琥珀)と色を混ぜない。
                ? <span key={e.hits} className="skill-proc-pop inline-block ml-1.5 text-[11px] font-semibold tabular-nums leading-none" style={{ animationPlayState: playState, fontFamily: '"Rajdhani", var(--uf-jp), sans-serif', color: newest ? '#fbf6ea' : nameColor }}>×{e.hits}</span>
                : <span key={e.hits} className="skill-proc-pop inline-block ml-1 text-[10px] text-amber-200/95" style={{ animationPlayState: playState }}>×{e.hits}</span>)}
            </span>
          </div>
        );
      })}
    </div>
  );
};

type NpcLine = { name: string; text: string; until: number; portrait?: string; slow?: boolean };
const portraitOf = (npc: NpcLine | null) => (npc ? NPC_PORTRAIT[npc.portrait ?? npc.name] : undefined);

/**
 * 会話の板1枚(立ち絵+名前+本文)。HUD の会話と、ショップの中の軍人の返事(ShopMenu)が同じ物を使う。
 * phraseWrap=句読点の所でだけ折る(語の途中「引き返しま/すからね。」で折らない)。幅に入り切らない時だけ途中でも折る。
 * HUD の会話は今どおり(渡さない)=スマホの HUD は変えない。
 */
export const NpcLinePill = ({ npc, phraseWrap }: { npc: NpcLine; phraseWrap?: boolean }) => {
  // 話者の立ち絵(あれば)。portrait指定があれば名前より優先(例: 変異後グレンの頭部)。
  const portrait = portraitOf(npc);
  const portraitBase = portrait?.base;
  const portraitBoxW = portrait?.boxW ?? 40;
  return (
      /* 枠なし・上半身絵と文字を同一の右フェード背景に。高さは文字に合わせ、上半身絵は上にはみ出してOK。 */
      <div
        className="glass-pill flex items-stretch gap-1.5 py-1.5 pl-1.5 text-[13px] leading-snug gt-solid"
        style={{ paddingRight: 44, overflow: 'visible' }}
      >
        {portraitBase && (
          // バストは背景の高さ(=文字)に対して背が高く、下端を背景下端に合わせて上へはみ出させる。
          <div className="relative self-stretch shrink-0" style={{ width: portraitBoxW }}>
            {portrait?.sheet ? (
              <SheetPortrait key={portraitBase} src={spritePath(portraitBase)} frames={portrait.sheet} frame={portrait.frame} h={portrait.imgH ?? 64} alt={npc.name} />
            ) : (
              <img
                src={spritePath(`${portraitBase}-${portrait?.frame ?? 0}`)}
                alt={npc.name}
                draggable={false}
                style={{
                  position: 'absolute',
                  left: '50%',
                  // 足元を「上から2行分」の位置に固定(社長指示v0.25.2072・会話UI共通)。
                  // 旧: bottom:0=箱の下端揃えのため、文字数で箱が伸びると立ち絵が上下に動いて目障りだった。
                  top: 42,
                  transform: 'translate(-50%, -100%)',
                  height: portrait?.imgH ?? 64,
                  width: 'auto',
                  maxWidth: 'none',
                  imageRendering: 'pixelated',
                }}
              />
            )}
          </div>
        )}
        <div className="self-center" style={phraseWrap ? { whiteSpace: 'normal', wordBreak: 'keep-all', overflowWrap: 'anywhere' } : { whiteSpace: 'normal', wordBreak: 'break-word' }}>
          {/* 会話は名前の後に一度改行(社長指示v0.25.2069・会話UI共通=OP射撃シーン側も同じ)。 */}
          <span className="block font-bold text-amber-300/95 gt-outline">{npc.name}</span>
          {npc.slow ? <SlowLine key={npc.until} text={npc.text} /> : <span className="text-white/90">{npc.text}</span>}
        </div>
      </div>
  );
};

/** PC のせり上がりで箱の左端に灯す縦線の色(会話の名前と同じ琥珀=amber-300)。 */
const COMMS_ACCENT_AMBER = 'rgb(252, 211, 77)';

/**
 * 会話の板の「入り」と「消え」(社長指示2026-11-17「中段くらいから箱ごと、フェードインさせる。一旦全部」)。
 * 入り方は utils/commsEntrance.commsEntranceKind で決める(会話の最初の1行だけ大きく動かし、続き・ゆっくり話す行は小さく)。
 * - fly(スマホの最初の1行): 枠の中段・画面の中心寄りから斜めに定位置へ。速く出て減速し、着地で少し行き過ぎて戻る。
 *   不透明度は移動とは別の時計で先に上がる。
 * - rise(PC の横長の最初の1行): 定位置の少し下からせり上がる(中段から落とさない)。箱の左端に全高の縦線を白→琥珀で一度灯す。
 * - fly / rise の間、スキル発動の行が入りの時点で無かった時だけ、行の包みを伏せて最後に現す(板より先に見せない)。
 * - ゆっくり話す行(slow)も最初の1行なら fly / rise(尺だけ長い)。
 * - continue(同じ話者が消えてすぐの行): 定位置の少し下から短く。fade(ゆっくり話す行の続き): 移動なしのフェードだけ。
 * - 音は最初の1行だけ(立ち絵を差し替えた行は鳴らさない)。
 * - 消え: leaving になったら上へ少し流れながら薄れ、消え切ったら onGone(呼び手が板を外す)。消え始める時刻は今どおり。
 * 動きは Web Animations の transform/opacity だけ=React は毎フレーム描き直さない・レイアウトも動かさない。
 * 出発点は描く前(useLayoutEffect)に定位置を測って決める=一瞬定位置に見えてから跳ぶことは無い。押下は今どおり素通し。
 */
/** 前の行が消えた時刻と、その行の話者(続きの行かどうかの判定に使う)。 */
type CommsPrev = { hiddenAt: number; speaker: string | null };

const CommsBox = ({ line, leaving, landscape, prevRef, companionRef, onGone, children }: {
  line: NpcLine;
  leaving: boolean;
  landscape: boolean;
  prevRef: React.RefObject<CommsPrev>;
  companionRef: React.RefObject<HTMLDivElement | null>;
  onGone: () => void;
  children: React.ReactNode;
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const accentRef = useRef<HTMLSpanElement | null>(null);
  // 入りは作られた時の1度だけ(呼び手が入りごとに key を替えて作り直す)。行の中身は作られた時の物で決める。
  const firstLineRef = useRef(line);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== 'function') return;
    const first = firstLineRef.current;
    const anims0: Animation[] = [];
    const prev = prevRef.current ?? { hiddenAt: -Infinity, speaker: null };
    const kind = commsEntranceKind(performance.now() - prev.hiddenAt, prev.speaker, commsSpeakerKey(first), !!first.slow, landscape);
    // ゆっくり話す行の最初の1行は同じ動きを長い尺で。
    const { moveMs } = commsEntranceTiming(!!first.slow);
    // スキル発動の行: 入りの時点で既に見えていれば伏せない。無い所から増える分だけ、板が寄り切るまで伏せて最後に現す。
    const comp = companionRef.current;
    if (comp && typeof comp.animate === 'function' && shouldHideCompanionOnEntrance(kind, comp.offsetHeight > 0)) {
      anims0.push(comp.animate([
        { opacity: 0, offset: 0 },
        { opacity: 0, offset: (moveMs - COMMS_COMPANION_FADE_MS) / moveMs, easing: 'ease-out' },
        { opacity: 1, offset: 1 },
      ], { duration: moveMs }));
    }
    // 箱の動きは共通部品(commsMotion)。枠=HUD の入れ物(会話の置き場の基準)。
    const anims: Animation[] = [
      ...anims0,
      ...playCommsEntrance(el, kind, { slow: !!first.slow, frameEl: el.parentElement?.offsetParent as HTMLElement | null }),
    ];
    if (kind === 'rise') {
      const ac = accentRef.current;
      if (ac && typeof ac.animate === 'function') {
        // 板が定位置へ寄り切る頃に、立ち絵側の縁を一度灯す(白く点いて琥珀へ冷めながら消える)。
        anims.push(ac.animate([
          { opacity: 0, backgroundColor: '#ffffff', boxShadow: '0 0 6px rgba(255,255,255,0.9)' },
          { opacity: 1, backgroundColor: '#ffffff', boxShadow: '0 0 6px rgba(255,255,255,0.9)', offset: 0.2 },
          { opacity: 1, backgroundColor: COMMS_ACCENT_AMBER, boxShadow: `0 0 6px ${COMMS_ACCENT_AMBER}`, offset: 0.65 },
          { opacity: 0, backgroundColor: COMMS_ACCENT_AMBER, boxShadow: `0 0 6px ${COMMS_ACCENT_AMBER}` },
        ], { duration: COMMS_ACCENT_MS, delay: 160, easing: 'ease-out' }));
      }
    }
    if (commsEntranceSound(kind, !!first.portrait)) {
      // 「ピッ」に「ザ」を重ねる(2つとも既存素材の流用・audioManager の comms-open / comms-open-static)。
      playSfx('comms-open');
      playSfx('comms-open-static');
    }
    return () => { for (const a of anims) a.cancel(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 入りは作られた時の1度だけ
  }, []);
  const onGoneRef = useRef(onGone);
  useLayoutEffect(() => { onGoneRef.current = onGone; });
  useLayoutEffect(() => {
    if (!leaving) return;
    const el = ref.current;
    if (!el || typeof el.animate !== 'function') { onGoneRef.current(); return; }
    const a = playCommsExit(el);
    if (!a) { onGoneRef.current(); return; }
    a.onfinish = () => onGoneRef.current();
    return () => { a.onfinish = null; a.cancel(); };
  }, [leaving]);
  return (
    <div ref={ref} data-comms-entrance style={{ position: 'relative' }}>
      {children}
      {landscape && (
        <span
          ref={accentRef}
          aria-hidden
          // 板の上端から下端までの全高(スキル発動の行の左の短い印と見分ける)。
          style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, borderRadius: 1, opacity: 0, pointerEvents: 'none' }}
        />
      )}
    </div>
  );
};

// NPCリアルタイムセリフのHUD表示(時間停止なし・軽量)。表示位置はアテンションバナーと同じ左上ゾーンで、
// 優先度は「コンボ > アテンション > NPCセリフ」。コンボ/バナーの有無に応じて下へずらして重ならないようにする。
// 毎フレーム再描画しないよう、狭いセレクタ(派生プリミティブ)で購読する。
export const NpcDialogue = () => {
  // ショップが開いている間の「連れて歩く」の返事は、ショップのパネルの中に出す(ShopMenu)。ここでは出さない
  // (HUD の会話はショップの暗幕の下で読めず、PC の 720px ではパネルの縁と重なっていた)。閉じたら残りの尺だけここに出る。
  const npc = useGameStore(s => (s.showShopMenu && s.npcDialogue && isFollowToggleLineText(s.npcDialogue.text) ? null : s.npcDialogue));
  const comboActive = useGameStore(s => s.meleeFinishComboCount >= 2 && s.meleeFinishComboUntil >= s.gameTime); // HUD の COMBO(スキルが読むコンボの回数)と同じ条件
  const bannerActive = useGameStore(s => !!s.eventBannerText && s.eventBannerUntil >= s.gameTime);
  const landscape = useHudLandscape();
  // ?proj=1 段階6: 画面の縁の矢印が会話窓を避けるよう、窓の矩形(論理座標)を測って置く(5回/秒・描画は読むだけ)。?proj=0 は測らない。
  const outerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!PROJ_ON) return;
    const measure = () => {
      const el = outerRef.current;
      const root = el?.closest('.game-frame') as HTMLElement | null;
      if (!el || !root) { setHudAvoidRect('npcDialogue', null); return; }
      const rr = root.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      if (b.width <= 0 || b.height <= 0 || rr.width <= 0) { setHudAvoidRect('npcDialogue', null); return; }
      const sc = computeViewport(rr.width, rr.height).scale || 1;
      setHudAvoidRect('npcDialogue', { left: (b.left - rr.left) / sc, top: (b.top - rr.top) / sc, right: (b.right - rr.left) / sc, bottom: (b.bottom - rr.top) / sc });
    };
    measure();
    const id = window.setInterval(measure, 200);
    return () => { window.clearInterval(id); setHudAvoidRect('npcDialogue', null); };
  }, []);
  const hasProc = useGameStore(s => s.skillProcFeed.length > 0); // 会話が無くてもスキル発動は同じ位置に出す
  // 入りの回数(社長指示2026-11-17)。板が消えている所から現れた時だけ増える=出たまま次の行へ替わる時は飛ばし直さず文字だけ替える。
  // 前回の描画の値から決める(React の「前の描画の情報を保つ」型=effect を挟まず、同じ描画で入りが始まる)。
  const shown = !!npc;
  const [prevShown, setPrevShown] = useState(false);
  const [entryKey, setEntryKey] = useState(0);
  // 消え切るまで最後の行を残す(消えの動きの間だけ。消え始める時刻=store が行を外した時刻は今どおり)。
  const [held, setHeld] = useState<NpcLine | null>(null);
  if (shown !== prevShown) {
    setPrevShown(shown);
    if (shouldPlayCommsEntrance(prevShown, shown)) setEntryKey(k => k + 1);
  }
  if (npc && npc !== held) setHeld(npc);
  // 前の行が消えた時刻と話者(続きの行かどうかの判定に使う)。一度も出ていない間は -Infinity / null=最初の行は必ず大きく入る。
  const prevRef = useRef<CommsPrev>({ hiddenAt: -Infinity, speaker: null });
  const lastLineRef = useRef<NpcLine | null>(null);
  const wasShownRef = useRef(false);
  useEffect(() => { if (npc) lastLineRef.current = npc; }, [npc]);
  useEffect(() => {
    if (wasShownRef.current && !shown) {
      prevRef.current = { hiddenAt: performance.now(), speaker: lastLineRef.current ? commsSpeakerKey(lastLineRef.current) : null };
    }
    wasShownRef.current = shown;
  }, [shown]);
  const procWrapRef = useRef<HTMLDivElement | null>(null);
  const line = npc ?? held;
  if (!line && !hasProc) return null;
  const topPx = 132 + (comboActive ? 58 : 0) + (bannerActive ? 58 : 0);
  const portraitBoxW = portraitOf(line)?.boxW ?? 40;
  // スキル発動の行の名前を会話の本文の列に揃える(板の左余白6+立ち絵の幅+隙間6+印2)。
  const procAlign = 6 + portraitBoxW + 6 + 2;
  // 板の出入りの合図(スキル発動の行の段が、板の出入りで動いた時に板と同じ尺で動くため)。
  const boxSig = line ? `box${entryKey}` : 'none';
  const boxShift = commsRowsShift(!!line, !!line?.slow);
  return (
    <div
      ref={outerRef}
      data-phone-guard-skip // 会話は乱数で文言と長さが変わる=スマホの回帰チェック(scripts/phone-guard.mjs)の対象外
      className="absolute text-left"
      // PC の横長は画面の下(字幕の位置)へ。視線の落ち着く所・HUD の隙間に浮かせない(クリエイティブ監査 #10)。
      style={landscape ? {
        bottom: 28,
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: 520,
      } : {
        top: `calc(max(env(safe-area-inset-top), 8px) + ${topPx}px)`,
        left: 'max(env(safe-area-inset-left), 18px)',
        transition: 'top 300ms cubic-bezier(0.22, 1, 0.36, 1)', // 会話の入りと同じ曲線(社長指示2026-11-17の監査是正)
        maxWidth: 'min(calc(66vw / var(--hud-s, 1)), 300px)',
      }}
    >
      {/* PC の横長は会話が画面の一番下=下に置く場所が無いので、行は会話の上に積む(下揃えの入れ物の中で上へ伸びる=会話は動かない)。 */}
      {/* 包みは配置を変えない(余白は中の行が持つ)。会話の入りで行が無い所から増える時だけ、この包みごと伏せて最後に現す。 */}
      {landscape && <div ref={procWrapRef}><SkillProcRows align={procAlign} boxSig={boxSig} boxShift={boxShift} /></div>}
      {line && (
        <CommsBox
          key={entryKey}
          line={line}
          leaving={!npc}
          landscape={landscape}
          prevRef={prevRef}
          companionRef={procWrapRef}
          onGone={() => setHeld(null)}
        >
          <NpcLinePill npc={line} />
        </CommsBox>
      )}
      {!landscape && <div ref={procWrapRef}><SkillProcRows align={procAlign} boxSig={boxSig} boxShift={boxShift} /></div>}
    </div>
  );
};
