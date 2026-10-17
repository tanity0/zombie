// メニュー操作の案内(research/MENU_NAV.md v2/v3 §案内)。App に1つだけ。画面右下に1行: [Enter] 決定 | [Esc] 戻る。
// キー/パッドを使っている間だけ出る(スマホ=html.kbnav が付かない=何も描かない)。その画面に無い操作は出さない。
// 表示は使っている機器に合わせる(キーボード=Enter/Esc/Q/E、パッド=A/B/LB/RB、PlayStation 系=×/○/L1/R1)。
// 置き場所: 既定=右下 / 画面の根の data-nav-prompt-pos="left"=左下(タイトル)/ 画面の data-nav-prompt-slot があればそこへ入れる(DS ホームのフッタ行)。
// 書体・動詞の色は画面の CSS 変数(--nav-font / --nav-prompt-dim)を継ぐ。
// 購読は「選択が変わった時/機器が変わった時」だけ(menuNav が変わった時だけ新しい参照を渡す)=毎フレームの再レンダなし。
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import './navCursor.css';
import { subscribePrompt, getPromptSnapshot, type PromptSnapshot } from '../utils/menuNav';
import { promptItems } from '../utils/navMap';

const NavPrompt = (): React.ReactElement | null => {
  const snap = useSyncExternalStore(subscribePrompt, getPromptSnapshot, getPromptSnapshot);
  // 消える間(120ms)も中身を保つため、最後に出した内容を覚えておく
  const shownOnce = useRef<PromptSnapshot | null>(null);
  if (snap.visible) shownOnce.current = snap;
  useEffect(() => {
    document.documentElement.classList.toggle('navprompt-on', snap.visible);
    return () => { document.documentElement.classList.remove('navprompt-on'); };
  }, [snap.visible]);
  const s = shownOnce.current;
  if (!s) return null;
  const inSlot = !!(s.slot && s.slot.isConnected);
  const style = { '--nav-font': s.font, '--nav-prompt-dim': s.dim } as React.CSSProperties;
  const el = (
    <div
      className={`nav-prompt${inSlot ? ' nav-prompt--slot' : ''}${snap.visible ? ' is-on' : ''}`}
      data-nav-ui data-pos={s.pos} data-style={s.style} aria-hidden="true" style={style}
    >
      {promptItems(s.style, { hasBack: s.hasBack, backLabel: s.backLabel, hasTabs: s.hasTabs }).map(it => (
        <span key={it.verb} className="nav-prompt-item">
          <span className="nav-prompt-keys">{it.keys.map(k => <span key={k} className="nav-prompt-key">{k}</span>)}</span>
          <span>{it.verb}</span>
        </span>
      ))}
    </div>
  );
  return inSlot ? createPortal(el, s.slot as HTMLElement) : el;
};

export default NavPrompt;
