import React from 'react';
import { playSfx } from '../audio/audioManager';
import './pageHeader.css';

// 画面の見出しの部品(research/UIUX_PROPOSAL.md P5「戻るの型を1つに」)。
// 左=「‹ 戻る」と縦線 / 真ん中=明朝の題字と英字の小注記 / 右=空ける。作戦室の外の全画面がこの1つを使う
// (装備・強化・開発施設・資料室・守護霊・変異体対策室・オプション・作戦地域・任務詳細・ロール選択・排出一覧・射撃練習場)。
// - 戻るの音(ui-back)はここで鳴らす=呼び出し側は鳴らさない。押した時の動き(慣性)も1つ(pageHeader.css)。
// - overlay: 絵を全面に敷く画面(ロール選択・射撃練習場)用。同じ形のまま、帯の地だけ絵へ溶ける暗いグラデにする。
// - isolate: 下の画面全体が押せる場面(射撃練習場=どこを押しても撃つ)で、見出しのタップを下へ渡さない。
// - 音のボタンは置かない(作戦室の下段・オプション・一時停止に在る)。

/** 左の戻る(見出しの外で使う時=入れ子の一覧へ戻る等も、同じ形・同じ動き)。 */
export const BackButton: React.FC<{ onBack: () => void; label?: string; className?: string }> = ({ onBack, label = '戻る', className }) => (
  <button
    type="button"
    className={`page-hdr-back${className ? ` ${className}` : ''}`}
    aria-label={label}
    data-nav-back
    onClick={() => { playSfx('ui-back'); onBack(); }}
  >
    <span className="page-hdr-chev" aria-hidden><i /></span>
    <span className="page-hdr-label">{label}</span>
  </button>
);

const PageHeader: React.FC<{
  title: string;
  /** 英字の小注記(LOADOUT 等)。題字の下に添えるだけ。 */
  en?: string;
  /** 題字の下の短い一言(その画面で知っておくべき事だけ。無ければ出さない)。英字の注記と同じ1行に並べる=見出しの高さは変えない。 */
  note?: string;
  /** 中身に名前がある画面(任務詳細・作戦地域)。題字を小さな札に落とし、主役を中身の地名へ譲る。 */
  quiet?: boolean;
  onBack?: () => void;
  overlay?: boolean;
  isolate?: boolean;
  sticky?: boolean;
}> = ({ title, en, note, quiet, onBack, overlay, isolate, sticky = true }) => (
  <header
    className={`page-hdr${overlay ? ' is-overlay' : ''}${sticky && !overlay ? ' is-sticky' : ''}${quiet ? ' is-quiet' : ''}`}
    onClick={isolate ? e => e.stopPropagation() : undefined}
    onPointerDown={isolate ? e => e.stopPropagation() : undefined}
  >
    {/* 中の箱: 横長(PC)では全画面で同じ幅にそろえる(=「戻る」の x が画面ごとにずれない)。縦持ちは帯いっぱい。 */}
    <div className="page-hdr-in">
      {onBack ? <BackButton onBack={onBack} /> : <span className="page-hdr-back is-empty" aria-hidden />}
      <span className="page-hdr-rule" aria-hidden />
      <div className="page-hdr-title">
        <h1 className="type-world">{title}</h1>
        {(en || note) && (
          <div className="page-hdr-sub">
            {en && <span className="page-hdr-en type-note">{en}</span>}
            {note && <span className="page-hdr-note">{note}</span>}
          </div>
        )}
      </div>
    </div>
  </header>
);

export default PageHeader;
