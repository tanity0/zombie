// 資料室「特殊変異体」の棚(社長指示2026-11-16「ボス全種にバックストーリー」)。
// 文章量が多い個体たちなので、棚には顔アイコンだけを並べ、倒した個体をタップすると本文を開く。
// 顔は作戦室の地図・一時停止の地図と同じ部品(BossHeadFace)。並びと開き具合は utils/bossStoryArchive.ts(純関数)。
// クリエイティブ監査(2026-11-16)の指摘12件を反映(影の描き方・裏ボスの差・未読の点・押した時・中央寄せ等)。
// 描くだけ: 倒した記録は呼び出し側が資料室を開いた時に1回読んで渡す(store の購読はしない)。
import React, { useId } from 'react';
import { BossFaceDefs, BossHeadFace, bossFaceRimArc, BOSS_FACE_RIM, BOSS_FACE_RIM_PATROL } from './BossHeadFace';
import { spritePath } from '../utils/spriteLoader';
import { bossStoryShownName, splitBossStoryName, type BossStoryCell, type BossStoryGroupView } from '../utils/bossStoryArchive';
import { KENKI_TINT_RGB, type KenkiArchiveRow, type KenkiArchiveView } from '../utils/kenkiArchive';

// 明朝の役割(index.css --type-world・research/UIUX_PROPOSAL.md P17)。SVG の文字は class が効かない所があるので変数を直に引く。
const SERIF = 'var(--type-world)';
// 押した時(クリエイティブ監査2026-11-16 #10): 四角は光らせず、弧を濃く・顔をわずかに沈める。押す80ms/離す160ms(ease-out)。
const PRESS_T = 'duration-[160ms] ease-out group-active:duration-[80ms]';

/** 丸い顔1つ(svg)。未討伐は絵を暗く・色を抜き・ぼかした影(輪郭と目の位置がかすかに分かる程度)。 */
const StoryFace: React.FC<{ cell: BossStoryCell; px: number }> = ({ cell, px }) => {
  const idBase = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const S = 64, c = S / 2, r = 24, rimR = 28.5;
  const patrol = cell.entry.group === '徘徊';
  const hidden = cell.entry.group === '深層変異体'; // 裏ボスだけ刻み2本(監査 #4)
  const face = cell.face;
  let inner: React.ReactNode;
  if (face && cell.unlocked) {
    inner = <BossHeadFace idBase={idBase} clipId={`${idBase}-c`} x={c} y={c} r={r} sprite={face.sprite} crop={face.crop} />;
  } else if (face) {
    const k = r / (face.crop.r * face.crop.h);
    inner = (
      <>
        <clipPath id={`${idBase}-c`}><circle cx={c} cy={c} r={r} /></clipPath>
        <circle cx={c} cy={c} r={r} fill="#0d0c12" />
        <image href={spritePath(face.sprite)} x={c - face.crop.u * face.crop.w * k} y={c - face.crop.v * face.crop.h * k}
          width={face.crop.w * k} height={face.crop.h * k} clipPath={`url(#${idBase}-c)`} preserveAspectRatio="none"
          filter={`url(#${idBase}-shade)`} />
        <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(7,6,13,0.9)" strokeWidth={2.2} />
      </>
    );
  } else {
    // 切り抜きの表に無い絵の個体: 暗い丸(未討伐は顔の有る影と同じ地)。開いていれば紋のような細い内円+名の頭文字。
    inner = (
      <>
        <circle cx={c} cy={c} r={r} fill={cell.unlocked ? '#14131a' : '#0d0c12'} />
        {cell.unlocked && (
          <>
            <circle cx={c} cy={c} r={19} fill="none" stroke="#e9bd79" strokeOpacity={0.25} strokeWidth={0.6} />
            <text x={c} y={c + 5} textAnchor="middle" fontSize={14} fill="#e9bd79" fillOpacity={0.45} style={{ fontFamily: SERIF }}>
              {cell.entry.name.slice(0, 1)}
            </text>
          </>
        )}
        <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(7,6,13,0.9)" strokeWidth={2.2} />
      </>
    );
  }
  const rimO = cell.unlocked ? (patrol ? 0.95 : 0.72) : 0.22;
  const tickTop = c - rimR - 3.5;
  return (
    <svg viewBox={`0 0 ${S} ${S}`} width={px} height={px} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      <BossFaceDefs idBase={idBase}>
        {/* 未討伐の影: 色を抜き → 0.18倍に落とし → 少しぼかす(不透明度は1のまま)。 */}
        <filter id={`${idBase}-shade`} colorInterpolationFilters="sRGB">
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncR type="linear" slope={0.18} />
            <feFuncG type="linear" slope={0.18} />
            <feFuncB type="linear" slope={0.18} />
          </feComponentTransfer>
          <feGaussianBlur stdDeviation={1.3} />
        </filter>
      </BossFaceDefs>
      <g className={`transition-transform ${PRESS_T} group-active:scale-[0.96]`} style={{ transformBox: 'view-box', transformOrigin: `${c}px ${c}px` }}>
        {inner}
      </g>
      <g stroke={patrol ? BOSS_FACE_RIM_PATROL : BOSS_FACE_RIM} fill="none"
        className={`[stroke-opacity:var(--rim-o)] group-active:[stroke-opacity:1] transition-[stroke-opacity] ${PRESS_T}`}
        style={{ ['--rim-o' as string]: rimO } as React.CSSProperties}>
        <path d={bossFaceRimArc(c, c, rimR)} strokeWidth={1.2} strokeLinecap="round" />
        {hidden ? (
          <>
            <line x1={c - 2} y1={c - rimR} x2={c - 2} y2={tickTop} strokeWidth={1.2} />
            <line x1={c + 2} y1={c - rimR} x2={c + 2} y2={tickTop} strokeWidth={1.2} />
          </>
        ) : (
          <line x1={c} y1={c - rimR} x2={c} y2={tickTop} strokeWidth={1.2} />
        )}
      </g>
    </svg>
  );
};

/** 孫悟空のレベルの色を文字へ(控えめ=少し透かす)。色なし(Lv1・他の枠)は undefined=元の文字色のまま。 */
const kenkiTextColor = (tint: KenkiArchiveRow['tint'], a: number): string | undefined =>
  tint ? `rgba(${KENKI_TINT_RGB[tint]}, ${a})` : undefined;

/** 棚の名前: 末尾の括弧書き(「(変異体)」等)だけ薄く。文字列そのものは台帳のまま(孫悟空は倒した時の名前)。 */
const ShelfName: React.FC<{ cell: BossStoryCell }> = ({ cell }) => {
  const { name, tint } = bossStoryShownName(cell);
  const { main, suffix } = splitBossStoryName(name);
  return <span style={{ color: kenkiTextColor(tint, 0.75) }}>{main}{suffix && <span className="text-white/40">{suffix}</span>}</span>;
};

/** 孫悟空の討伐の記録: 倒した相手を1行ずつ(体得した技はその下)・最後に次の技。本文とは罫線で分ける。 */
const KenkiRecord: React.FC<{ kenki: KenkiArchiveView }> = ({ kenki }) => {
  if (kenki.rows.length === 0 && !kenki.nextArt) return null;
  return (
    <>
      <div className="my-3 h-px bg-amber-200/15" aria-hidden="true" />
      <div className="mb-1.5 text-[10px] tracking-[0.1em] text-amber-200/60">討伐の記録</div>
      <ul className="space-y-1 text-[12px] leading-snug">
        {kenki.rows.map(r => (
          <li key={r.lv}>
            <span className="type-world font-semibold text-white/85" style={{ color: kenkiTextColor(r.tint, 0.8) }}>{r.name}</span>
            <span className="text-white/45"> ― 討伐</span>
            {r.art && <div className="pl-3 text-amber-100/75">『{r.art}』を体得</div>}
          </li>
        ))}
      </ul>
      {kenki.nextArt && <p className="mt-2 text-[11px] text-white/45">次の相手を倒すと『{kenki.nextArt}』を体得</p>}
    </>
  );
};

/**
 * 棚: 小見出しごとに顔を4列(狭い画面でも4列のまま収まる寸法)。割り切れない最後の行は中央寄せ(flex-wrap+中央揃え)。
 * 未討伐は押せない。倒して未読の枠は刻みの先に点。
 */
export const BossStoryShelf: React.FC<{ groups: BossStoryGroupView[]; onOpen: (key: string) => void }> = ({ groups, onOpen }) => (
  <div className="space-y-3">
    {groups.map(g => {
      const px = g.group === '深層変異体' ? 64 : 56; // 裏ボスだけ大きく(監査 #4)
      return (
        <div key={g.group}>
          <div className="mb-1 flex items-center gap-1.5 text-[10px] tracking-[0.08em] text-white/45">
            <span className="h-px w-3 shrink-0 bg-white/45" aria-hidden="true" />
            {g.group}
          </div>
          <div className="flex flex-wrap justify-center gap-y-2">
            {g.cells.map(cell => {
              const faceBox = (
                <div className="relative" style={{ width: px, height: px }}>
                  <StoryFace cell={cell} px={px} />
                  {cell.unread && (
                    <span className="ui-acc-bg absolute left-1/2 h-1 w-1 -translate-x-1/2 rounded-full" style={{ top: -6 }} aria-label="未読" />
                  )}
                </div>
              );
              return cell.unlocked ? (
                <button
                  key={cell.entry.key}
                  type="button"
                  onClick={() => onOpen(cell.entry.key)}
                  className="group flex w-1/4 min-w-0 flex-col items-center rounded-none px-0.5 py-1 [-webkit-tap-highlight-color:transparent] sm:w-1/6"
                >
                  {faceBox}
                  <span className="mt-0.5 w-full truncate text-center text-[10px] font-semibold text-white/80"><ShelfName cell={cell} /></span>
                </button>
              ) : (
                <div key={cell.entry.key} className="flex w-1/4 min-w-0 flex-col items-center px-0.5 py-1 sm:w-1/6">
                  {faceBox}
                  <span className="mt-0.5 w-full truncate text-center text-[10px] text-white/20">—</span>
                </div>
              );
            })}
          </div>
        </div>
      );
    })}
  </div>
);

/** 本文の中身(外枠・ポータルは呼び出し側=資料室の他のモーダルと同じ包みで出す)。顔を左、区分名と名前を右に縦、罫線の下に本文。 */
export const BossStoryBody: React.FC<{ cell: BossStoryCell; onClose: () => void }> = ({ cell, onClose }) => (
  <div className="px-4 py-5">
    <div className="flex items-center gap-3">
      <div className="shrink-0"><StoryFace cell={cell} px={72} /></div>
      <div className="min-w-0">
        <div className="mb-1 text-[10px] tracking-[0.1em] text-amber-200/70">特殊変異体・{cell.entry.group}</div>
        <h3 className="type-world text-lg font-semibold text-amber-100" style={{ color: kenkiTextColor(bossStoryShownName(cell).tint, 0.8) }}>
          {bossStoryShownName(cell).name}
        </h3>
      </div>
    </div>
    <div className="my-3 h-px bg-amber-200/15" aria-hidden="true" />
    {cell.entry.body.length > 0 ? (
      <div className="space-y-2 text-[13px] leading-relaxed text-white/85">
        {cell.entry.body.map((line, i) => <p key={i}>{line}</p>)}
      </div>
    ) : (
      <p className="text-[13px] text-white/40">記録はまだない。</p>
    )}
    {cell.kenki && <KenkiRecord kenki={cell.kenki} />}
    <button
      type="button"
      onClick={onClose}
      className="sticky bottom-2 mt-4 w-full rounded-none bg-[#1a1426]/95 px-3 py-2 text-[12px] font-semibold text-white/85 backdrop-blur-sm"
    >
      閉じる
    </button>
  </div>
);
