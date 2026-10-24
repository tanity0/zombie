import { useEffect, useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { spritePath } from '../utils/spriteLoader';
import { useHudLandscape } from './HudScale';
import { slowLineVisibleChars } from '../utils/slowLine';

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

// NPCリアルタイムセリフのHUD表示(時間停止なし・軽量)。表示位置はアテンションバナーと同じ左上ゾーンで、
// 優先度は「コンボ > アテンション > NPCセリフ」。コンボ/バナーの有無に応じて下へずらして重ならないようにする。
// 毎フレーム再描画しないよう、狭いセレクタ(派生プリミティブ)で購読する。
export const NpcDialogue = () => {
  const npc = useGameStore(s => s.npcDialogue);
  const comboActive = useGameStore(s => s.meleeHitComboCount >= 2 && s.meleeHitComboUntil >= s.gameTime); // HUD の COMBO(近接ヒット表示)と同じ条件
  const bannerActive = useGameStore(s => !!s.eventBannerText && s.eventBannerUntil >= s.gameTime);
  const landscape = useHudLandscape();
  if (!npc) return null;
  const topPx = 132 + (comboActive ? 58 : 0) + (bannerActive ? 58 : 0);
  // 話者の立ち絵(あれば)。portrait指定があれば名前より優先(例: 変異後グレンの頭部)。
  const portrait = NPC_PORTRAIT[npc.portrait ?? npc.name];
  const portraitBase = portrait?.base;
  const portraitBoxW = portrait?.boxW ?? 40;
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
      {/* 枠なし・上半身絵と文字を同一の右フェード背景に。高さは文字に合わせ、上半身絵は上にはみ出してOK。 */}
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
        <div className="self-center" style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
          {/* 会話は名前の後に一度改行(社長指示v0.25.2069・会話UI共通=OP射撃シーン側も同じ)。 */}
          <span className="block font-bold text-amber-300/95 gt-outline">{npc.name}</span>
          {npc.slow ? <SlowLine key={npc.until} text={npc.text} /> : <span className="text-white/90">{npc.text}</span>}
        </div>
      </div>
    </div>
  );
};
