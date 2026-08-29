import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

// iOSのラバーバンド対策(社長指示2026-08-29「出撃のページ以外がまだヘッダーとか動く」):
// stickyヘッダーは通常スクロール中は固定だが、iOSは容器の**縁で引っ張る**と内容ごと跳ねる
// (=ヘッダーも動いて見える)。縁での縦ドラッグだけ preventDefault してバウンスを殺す。
// - 縁以外の通常スクロールは素通し(スクロール感は不変)。ピンチは触らない。
// - 横主軸のドラッグは丸ごと殺す(社長実機2026-08-29「中身を横に引っ張ると大きくズレる」。
//   途中に本当に横へ動ける容器がある時だけ素通し)。
// - 内側に別のスクロール容器(シート等)がありそちらがまだ動ける時も素通し(奪わない)。
// - 内容が収まっている画面は上下とも縁=縦ドラッグ全部が死ぬ=完全に固定(それが望みの挙動)。
// ★続きインジケータ(社長指示2026-08-29「続きがあるやつは、あるのがわかる様に小さい下矢印」):
// 下にまだ内容がある時だけ、容器の底に小さな下矢印を出す(sticky bottom+高さ0=レイアウト不干渉・
// pointer-events:none)。底に着くとフェードで消える。内容が全部収まる画面には最初から出ない。
// 再判定はscroll/resize/内容変化(MutationObserver)時のみ=毎フレーム処理なし(メニュー/オーバーレイ限定)。
// ※UI監査2026-08-29でメニュー外(ショップ/強化/リザルト/更新情報/チュートリアル等)へも展開するため
//   MissionSelect.tsx から共有部品に切り出した(挙動は不変)。
const NoBounceScroller: React.FC<{ className?: string; style?: React.CSSProperties; children: React.ReactNode; moreColor?: string; onClick?: React.MouseEventHandler<HTMLDivElement> }> =
  ({ className, style, children, moreColor, onClick }) => {
    const ref = useRef<HTMLDivElement | null>(null);
    const start = useRef<{ x: number; y: number } | null>(null);
    const [hasMore, setHasMore] = useState(false);
    useEffect(() => {
      const el = ref.current;
      if (!el) return;
      const check = () => setHasMore(el.scrollHeight - el.clientHeight - el.scrollTop > 4);
      check();
      el.addEventListener('scroll', check, { passive: true });
      window.addEventListener('resize', check);
      // フォント/画像の遅延到着で高さが変わるケースの拾い直し(数回だけ・常駐タイマーなし)。
      const t1 = window.setTimeout(check, 300);
      const t2 = window.setTimeout(check, 1200);
      const mo = new MutationObserver(check);
      mo.observe(el, { childList: true, subtree: true });
      return () => {
        el.removeEventListener('scroll', check);
        window.removeEventListener('resize', check);
        window.clearTimeout(t1); window.clearTimeout(t2);
        mo.disconnect();
      };
    }, []);
    useEffect(() => {
      const el = ref.current;
      if (!el) return;
      const onStart = (e: TouchEvent) => {
        start.current = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
      };
      const onMove = (e: TouchEvent) => {
        const s = start.current;
        if (!s || e.touches.length !== 1) return;
        const dx = e.touches[0].clientX - s.x;
        const dy = e.touches[0].clientY - s.y;
        if (Math.abs(dy) <= Math.abs(dx)) {
          // ★横主軸は殺す(このスクローラは縦専用。v4068の touch-action: pan-y のJS版=
          // touch-actionが効かない環境への保険)。
          let hn: Element | null = e.target as Element | null;
          while (hn && hn !== el) {
            const hh = hn as HTMLElement;
            if (hh.scrollWidth > hh.clientWidth + 1) {
              const ox = getComputedStyle(hh).overflowX;
              if (ox === 'auto' || ox === 'scroll') return; // 横に動ける内側容器=奪わない
            }
            hn = hn.parentElement;
          }
          e.preventDefault();
          return;
        }
        // 内側のスクロール容器がその向きへまだ動けるなら奪わない
        let node: Element | null = e.target as Element | null;
        while (node && node !== el) {
          const h = node as HTMLElement;
          if (h.scrollHeight > h.clientHeight + 1) {
            const oy = getComputedStyle(h).overflowY;
            if (oy === 'auto' || oy === 'scroll') {
              const nTop = h.scrollTop <= 0;
              const nBot = h.scrollTop + h.clientHeight >= h.scrollHeight - 1;
              if ((dy > 0 && !nTop) || (dy < 0 && !nBot)) return;
            }
          }
          node = node.parentElement;
        }
        const atTop = el.scrollTop <= 0;
        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
        if ((dy > 0 && atTop) || (dy < 0 && atBottom)) e.preventDefault();
      };
      el.addEventListener('touchstart', onStart, { passive: true });
      el.addEventListener('touchmove', onMove, { passive: false });
      return () => { el.removeEventListener('touchstart', onStart); el.removeEventListener('touchmove', onMove); };
    }, []);
    return (
      <div ref={ref} className={className} style={style} onClick={onClick}>
        {children}
        <div
          className="ds-scroll-more"
          style={{ opacity: hasMore ? 1 : 0, color: moreColor ?? 'rgba(216, 180, 254, 0.85)' }}
          aria-hidden="true"
        >
          <ChevronDown size={15} />
        </div>
      </div>
    );
  };

export default NoBounceScroller;
