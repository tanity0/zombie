import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useGameStore, shiftSkillProcFeed } from '../store/gameStore';
import { spritePath } from '../utils/spriteLoader';
import { useHudLandscape } from './HudScale';
import { slowLineVisibleChars } from '../utils/slowLine';
import { SKILLS, skillIcon } from '../data/campaign';
import { useSkillIconSheet } from '../utils/useSkillIconSheet';
import { skillIconStyle, hasSkillIcon, skillSingleIconName } from '../data/skillIcons';
import { nextSkillProcWake, skillProcAlive, skillProcLeaving, isTechProcKey, newestSkillProcId } from '../utils/skillProcFeed';
import { BRAWLER_TECH_NAMES, type BrawlerTechDir } from '../data/brawlerTechNames';
import type { SkillKey } from '../types/game';
import { isFollowToggleLineText } from '../data/npcLines';

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
const TECH_DIR_DEG: Record<Exclude<BrawlerTechDir, 'all'>, number> = { up: 0, right: 90, down: 180, left: 270 };
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
const SkillProcRows = ({ align }: { align: number }) => {
  const feed = useGameStore(s => s.skillProcFeed);
  const paused = useGameStore(s => s.isPaused || s.showUpgradeMenu);
  const [, wake] = useState(0);
  const pausedAtRef = useRef<number | null>(null);
  // 会話の板が出る/消えると行の塊の位置が変わる=跳ばずに慣性つきで移る(前の位置から今の位置へ)。
  const boxRef = useRef<HTMLDivElement | null>(null);
  const prevTopRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) { prevTopRef.current = null; return; }
    const top = el.getBoundingClientRect().top;
    const prev = prevTopRef.current;
    prevTopRef.current = top;
    if (prev === null || Math.abs(prev - top) < 1) return;
    el.style.transition = 'none';
    el.style.transform = `translateY(${prev - top}px)`;
    void el.offsetHeight; // 前の位置を一度描かせてから戻す
    el.style.transition = 'transform 300ms cubic-bezier(0.22, 1, 0.36, 1)';
    el.style.transform = 'translateY(0)';
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
        const secret = e.key === 'tech:secret';
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
  const hasProc = useGameStore(s => s.skillProcFeed.length > 0); // 会話が無くてもスキル発動は同じ位置に出す
  if (!npc && !hasProc) return null;
  const topPx = 132 + (comboActive ? 58 : 0) + (bannerActive ? 58 : 0);
  const portraitBoxW = portraitOf(npc)?.boxW ?? 40;
  // スキル発動の行の名前を会話の本文の列に揃える(板の左余白6+立ち絵の幅+隙間6+印2)。
  const procAlign = 6 + portraitBoxW + 6 + 2;
  return (
    <div
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
        transition: 'top 0.25s ease',
        maxWidth: 'min(calc(66vw / var(--hud-s, 1)), 300px)',
      }}
    >
      {/* PC の横長は会話が画面の一番下=下に置く場所が無いので、行は会話の上に積む(下揃えの入れ物の中で上へ伸びる=会話は動かない)。 */}
      {landscape && <SkillProcRows align={procAlign} />}
      {npc && <NpcLinePill npc={npc} />}
      {!landscape && <SkillProcRows align={procAlign} />}
    </div>
  );
};
