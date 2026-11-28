// カウンター成立域の宣言表(★v0.25.5043: counterReach.ts から**表だけ**を切り出した依存ゼロの葉)。
// 読み方・育て方・完全性の検査は counterReach.ts の冒頭と counterReach.test.ts を見る(ここは値の置き場)。
// 守護霊の記録(playerTraits → counterOpportunity)はこの葉だけを読む=技の寸法表(idolScript 等)への循環を作らない。

/**
 * 成立域の形。'none' = **紫=カウンター不可**の技(赤い予告を持たない/裁定で不可と決めたもの)。
 *
 * ★'circle-or-body'(v0.25.3812): **円と体は包含関係にない別集合**なので、'body' を 'circle' へ
 * 差し替えると「赤い円が出た=体当てで取れなくなる」という**経路の置換**になる。赤い予告を
 * 成立域へ**足す**のが目的の州(=着地円が離れた場所に出る技)は、この2つを OR で足す。
 */
export type CounterReachKind = 'body' | 'band' | 'circle' | 'circle-or-body' | 'none';

export const COUNTER_REACH_DECL: Readonly<Record<string, CounterReachKind>> = {
  // ---- 賞金首 バス停(bounty-ranged) ----
  'bounty:br-push-windup': 'band',        // 押しのけ=帯 82×34(監査 C-1)
  'bounty:br-push-recover': 'body',
  'bounty:br-triple-windup': 'band',      // 三段突き=帯 300×34 ×3本(監査 B-1)
  'bounty:br-triple-recover': 'body',
  // ---- 賞金首 馬乗り(bounty-melee) ----
  'bounty:bm-charge-windup': 'body',      // 突進=流星ライン(図形reachは持たない。実行中に接触で取れる=監査D)
  'bounty:bm-charge': 'body',
  'bounty:bm-charge-recover': 'body',
  'bounty:bm-whip360-windup': 'circle',   // 360度ムチ=自分中心円 r=170(v0.25.3571で是正済み)
  'bounty:bm-whip360': 'circle',
  'bounty:bm-combo1-windup': 'band',      // 3段コンボ=帯 130×28(監査 C-2)
  'bounty:bm-combo2-windup': 'band',
  'bounty:bm-combo3-windup': 'band',
  'bounty:bm-combo1-recover': 'body',
  'bounty:bm-combo2-recover': 'body',
  'bounty:bm-combo3-recover': 'body',
  // ★懲罰狙撃=**紫=カウンター不可**(社長裁定 v0.25.3591「狙撃は避けるだけの技にしようかな」)。
  // 予告(帯900×40)は紫で描く=色文法v0.25.2961(赤=カウンター可 / 紫=不可)。溜め中は成立しない。
  'bounty:bm-snipe-windup': 'none',
  'bounty:bm-snipe-recover': 'body',      // 硬直は従来どおり(避け切った後のパニッシュ窓)
  // ---- 賞金首 鋏(bounty-balance) ----
  'bounty:bb-sweep-windup': 'band',       // 薙ぎ払い=帯 250×40(監査 C-3)
  'bounty:bb-sweep-recover': 'body',
  'bounty:bb-triple1-windup': 'band',     // 薙ぎ3連発=帯 200×30(監査 C-4)
  'bounty:bb-triple2-windup': 'band',
  'bounty:bb-triple3-windup': 'band',
  'bounty:bb-triple1-recover': 'body',
  'bounty:bb-triple2-recover': 'body',
  'bounty:bb-quickshot-windup': 'body',   // 高速弾=弾(赤い図形なし)。弾自体は弾反射で返せる
  'bounty:bb-quickshot-recover': 'body',
  'bounty:leap-windup': 'circle',         // 跳びかかり=着地円 r=110(監査 B-4)
  'bounty:leap-recover': 'body',
  // ---- 賞金首 舞妓(bounty-maiko) ----
  'bounty:mk-naginata-windup': 'band',    // 毬の薙ぎ=帯 140×30(v0.25.3585)
  'bounty:mk-naginata1-windup': 'band',
  'bounty:mk-naginata2-windup': 'band',
  'bounty:mk-naginata-recover': 'body',
  'bounty:mk-naginata1-recover': 'body',
  'bounty:mk-naginata2-recover': 'body',
  'bounty:mk-spin-windup': 'circle',      // 毬回し=自分中心円 r=180(v0.25.3585)
  'bounty:mk-spin': 'circle',
  'bounty:mk-spin-recover': 'body',
  'bounty:mk-suiu-windup': 'body',        // 乱舞の入り(ホップ前=まだ着地円が無い)
  'bounty:mk-suiu-hop1': 'circle',        // 水鳥乱舞=現在ホップの着地円(v0.25.3585)
  'bounty:mk-suiu-hop2': 'circle',
  'bounty:mk-suiu-hop3': 'circle',        // 最終段だけ大円(finalRadiusMult)
  'bounty:mk-suiu-recover': 'body',
  'bounty:mk-boom-windup': 'body',        // 手毬打ちの溜め(毬はまだ手元)
  'bounty:mk-boom-out': 'circle',         // 飛んでいる毬の円 r=30(監査 A-5「打ち返す」)
  'bounty:mk-boom-back': 'circle',
  'bounty:mk-boom-recover': 'body',

  // ---- 守護霊ボス「幻影」(research/GHOST_BOSS.md) ----
  // ★v6で `gp:*` の宣言は**全撤去**した。裁定「予告無し・全て同じ」により幻影の攻撃は
  // プレイヤーと同じ即発(windup/recover が存在しない)=**取る対象が無い**ので、
  // カウンターは幻影には成立しない(仕様)。弾の打ち返しだけは共通の赤い二重丸で従来どおり効く。

  // ---- 裏ボス4体(useGameLoop.ts) ----
  'hidden:aim-burst': 'body',             // 弾3連=弾(赤い図形なし。走り込んで体で取るのが設計意図)
  'hidden:aim-radial': 'body',
  'hidden:dash-windup': 'body',           // 突進=流星ライン(実行中 'dash' に接触で取れる)
  'hidden:dash': 'body',
  'hidden:dash-recover': 'body',
  'hidden:laser-windup': 'body',          // レーザーは紫だが「発射直前だけ体当てで壊せる」専用機構(§6.33)
  'hidden:laser-recover': 'body',
  'hidden:wheel-recover': 'body',         // 紫の車輪の硬直(溜め/発射は紫=カウンター不可=載せない)
  'hidden:lattice-recover': 'body',       // 氷の格子の硬直(溜めは紫=カウンター不可=載せない)
  'hidden:bite-windup': 'circle',         // ミーミル 群体の噛みつき=自分中心円 r=216(監査 B-3)
  'hidden:bite-recover': 'body',
  'hidden:coil-windup': 'band',           // ヨルムンガルド うねり=帯 310×40(監査 B-2)
  'hidden:coil-recover': 'body',
  'hidden:cage-windup': 'body',           // 氷結の檻=設置系(§5「要裁定」なので触らない)
  'hidden:cage-recover': 'body',
  'hidden:burst-recover': 'body',
  'hidden:radial-recover': 'body',
  'hidden:skadi-ice-recover': 'body',
  'hidden:skadi-blade-recover': 'body',
  // ---- トール(★v0.25.3780・research/THOR_ISSEN_REWORK.md §8-2) ----
  // 社長裁定「赤いのにカウンターできないは聞くまでもなく直すでしょ」。トールだけは
  // `hiddenBossCounterableNow` が `boss.type !== 'thor'` で**この表を素通り**しており、
  // 溜め中は「体の重なり」でしか成立しなかった(=赤い帯の中に居ても取れない)。
  // 除外を撤去して他ボスと同じ宣言表に乗せ、**赤い予告の図形=成立域**へ揃える。
  'hidden:issen-nihil': 'none',           // ★紫=無の境地。円の中でも体が重なっても成立しない(§1-1)
  // 寸法の書き方は「長さ×**全幅**(半幅N)」で統一する(v0.25.3784: 旧コメントは 310×80 で、
  // halfWidth=80 の意味だったが「全幅80」と誤読できた)。
  'hidden:issen-windup': 'band',          // 一閃=帯 310×160(半幅80。ロック済みの aiFrom→aiTarget)
  'hidden:issen-recover': 'body',
  'hidden:tsuki-windup': 'band',          // 突き=帯 300×30(半幅15。**毎フレーム引き直す**=遅延追従する狙い)
  'hidden:tsuki-recover': 'body',
  'hidden:harai-windup': 'band',          // 払い=帯 310×80(半幅40。ロック済みの並行ライン)
  'hidden:harai-recover': 'body',
  // ★飛び掛かり=**着地円を足した**(★v0.25.3810 で `'body'` → `'circle'`。v0.25.3812 で
  // `'circle-or-body'` へ訂正・§9-12)。社長の包括裁定(§8-2)「赤いのにカウンターできないは
  // **聞くまでもなく**直すでしょ」に該当する件——赤い塗り(`0xff2a2a`)+赤い縁の着地円を描いている
  // (`pixiScene.ts` の `showLandingCircle`)のに、宣言だけ `'body'`=体に当てないと取れなかった。
  // **円でも取れるようになった(体当ての経路はそのまま)**=赤い円を成立域へ**足した**。
  // ※v0.25.3810 の `'circle'` は**置換**で、円と体は包含関係にない別集合なので「体当てで取る」経路を
  //   消していた(着地点はヘイト次第で守護霊の足元にロックされるため、実害があった)。
  // 円の式は同じ着地円を持つラフィ('rafi:jump-windup')・賞金首('bounty:leap-windup')と同型
  // (中心=ロック済みの着地点 `aiTarget` / 半径=`HB_TH.jump.radius`。新しい数字は作っていない)。
  // ★`?thorscript=0`(台本OFF)は着地点がロックされておらず赤い円も描かれないので `'body'` へ落ちる
  //  (`ctx.landingLocked`。§5-8)。
  'hidden:jump-windup': 'circle-or-body',
  'hidden:jump-recover': 'body',
  // ★突進の溜め=**赤い流星ラインを描いているのに、線の上では取れず体に当てないと取れない**。
  // 裏ボスdash/ミゲル踏み込みと同型(全突進が 'body')という理由で据え置いているが、これは
  // **トール2「赤いのにカウンターできない」と同じクラスの件**= **§9-3 で社長裁定待ち**
  // (推薦は 'body' 据え置き側だが、**結論として読まないこと**)。
  'hidden:thor-dash-windup': 'body',
  // ★v0.25.3785(検収監査 中H): 走り(thor-dash-move)も表へ載せた。裏ボスの突進は実行中の州('dash')が
  // 載っているのに、トールの走りだけが表の外で生の rectsOverlap で解決されていた=§5-2の狙い
  // (トールも他ボスと同じ表へ乗せる)から外れる唯一の州だった。宣言は裏ボス 'hidden:dash' と同じ 'body'
  // (流星ラインは判定を持つ図形ではない=判定は突進の体そのもの)なので**成立域は1pxも変わらない**。
  'hidden:thor-dash-move': 'body',
  'hidden:thor-dash-recover': 'body',

  // ---- 天使(州名が6体で衝突するので boss.type をキーにする) ----
  'rafi:sweep': 'band',                   // ラフィ 薙ぎ=帯 310×40(監査 B-6。ミゲル/ウリ/スリィエルと同型)
  'rafi:jump-windup': 'circle',           // ラフィ 跳びかかり=着地円 r=70(監査 B-5)
  'acrasiel:warp-in': 'circle',           // アクラシエル 転移衝撃=赤円(監査 A-4。従来は分岐が無かった)

  // ---- idol(idolTick.ts) ----
  'idol:idol-punch-windup': 'band',       // 拳=帯 90×30(監査 C-5。毎フレーム今のプレイヤー方向へ引き直す帯)
  'idol:idol-punch-recover': 'body',
  // ★狙撃=**紫=カウンター不可**(馬乗りの懲罰狙撃と同じ裁定・同じ輸入元)。
  'idol:idol-snipe-windup': 'none',
  'idol:idol-snipe-recover': 'body',
  'idol:idol-rest': 'body',
  // 残りのidolの技(連射/扇/追尾弾/離脱ロール/手榴弾/射撃8枠)は**赤い図形を持たない**=体の重なりのまま。
  // 弾は弾反射で返せる/ロールは移動/手榴弾は転がる物。密着してターンを奪うのがidolの設計意図(§6.28-20)。
  'idol:idol-aim-windup': 'body', 'idol:idol-aim-recover': 'body',
  'idol:idol-fan-windup': 'body', 'idol:idol-fan-recover': 'body',
  'idol:idol-roll-windup': 'body', 'idol:idol-roll-recover': 'body',
  'idol:idol-orb-windup': 'body', 'idol:idol-orb-recover': 'body',
  'idol:idol-nade-windup': 'body', 'idol:idol-nade-recover': 'body',
  'idol:idol-s1-windup': 'body', 'idol:idol-s1-recover': 'body',
  'idol:idol-s2-windup': 'body', 'idol:idol-s2-recover': 'body',
  'idol:idol-s3-windup': 'body', 'idol:idol-s3-recover': 'body',
  'idol:idol-s4-windup': 'body', 'idol:idol-s4-recover': 'body',
  'idol:idol-s5-windup': 'body', 'idol:idol-s5-recover': 'body',
  'idol:idol-s6-windup': 'body', 'idol:idol-s6-recover': 'body',
  'idol:idol-s7-windup': 'body', 'idol:idol-s7-recover': 'body',
  'idol:idol-s8-windup': 'body', 'idol:idol-s8-recover': 'body',
};
