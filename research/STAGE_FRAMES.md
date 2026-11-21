# 横長画面の左右の枠(ステージの風景オブジェクト)— GPT 発注用の仕様

## 0. 社長の言葉(そのまま・2026-11-21)
「全ステージに、横長画面の時に違和感がない様に、画面左右にステージに関係する風景オブジェクトを表示して、枠っぽく使えば、無駄な横幅を誤魔化せると思う。例えば、森なら木や枝葉っぱのシルエットなど。他のステージなら柱や建物、、、これをGPTに作成させたい。各ステージごとに一番違和感なく、風景としてもランクアップさせれる提案をください」
「7は🌳だと思うけど?」「ex2は無し。」

## 0-1. 「ではない」条件
- 横長(PC・タブレット横持ち)の時だけ出す。スマホ縦は1pxも変えない(CLAUDE.md「PC版の作業はスマホを1pxも動かさない」)。
- 判定・湧き・カメラ・ズームには一切関係しない(見た目だけ)。
- EX2(変異した洋館跡)は枠なし。ステージ6/EX(洋館)は既存の柱の列が枠になっているので原則なし(加えるならカーテンだけ)。

## 1. 共通の仕様(全ステージ)
- **形式**: 透明背景の PNG。**左用と右用は別の絵**(鏡写しにしない=作り物っぽさを避ける)。
- **寸法**: 縦 1440 × 横 約 520 px(1枚)。上下に少しはみ出す部分(上から垂れる枝・下の草/瓦礫)を含めてよい。
- **画風**: ゲームと同じ HD-2D 調のドット絵(スクショを参照として渡す)。
- **明暗**: 前景の暗いシルエット。真っ黒の切り絵ではなく、そのステージの主光源が**縁にだけ**当たる(リムライト)。
- **抜け方**: 画面の外側(端)が一番濃く、内側(ゲーム画面側)へ向かって**不規則な輪郭で透明へ抜ける**。内側の 1/3 はほぼ透明。
- **入れないもの**: 文字・人物・ロゴ・看板の読める文字。
- **ゲーム側の扱い(実装メモ)**: 手前の層として置き、歩くと少しだけずれる(視差)。軽くぼかす(被写界深度)。ステージに入る時だけ読み込む(遅延組)。

## 2. ステージごとのモチーフ
| ステージ | 左 | 右 | 縁の光 |
|---|---|---|---|
| 洞窟(訓練) | 鍾乳石の垂れた岩壁、手前のごつごつした岩 | 岩の割れ目と滴る水、別形の鍾乳石 | 奥からの冷たい光 |
| 1 狂い咲きの森 | 苔むした太い幹と垂れる枝葉・つる | 細い幹の群れ、シダ、下に紫の花 | 青白い月光 |
| 2 研究所跡 | 崩れたコンクリ柱と垂れた配線 | 割れた機材棚の端、管、絡むツタ | 緑の培養槽の光 |
| 3 医療科学センター(昼) | 崩れた石造りの家の壁の角とツタ | 石畳の縁の瓦礫、傾いた街灯 | 暖かい日差し |
| 4 封鎖地域 | 凍った岩と雪をかぶった枯れ枝 | 有刺鉄線の柵の柱、凍った岩 | 冷たい月光 |
| 5 軍本部 | 木の杭のバリケードと土嚢 | 曲がった鉄骨、破れた布 | 赤い火と焦げた空 |
| 6・EX 古い洋館 | (原則なし)上から垂れる重いカーテン | 同左(別の形) | 蝋燭 |
| 7 逆探知地点 | 焦げた幹の枯れ木と垂れた枝 | 別形の枯れ木、低い茂み | 橙のもやの照り返し |
| EX2 | なし | なし | — |

## 3. GPT への指示文(英語・スクショを添えて1枚ずつ)
共通の頭(毎回):
> Create a transparent-background PNG, 520×1440 px, pixel-art in the same HD-2D style as the attached game screenshot. It is a FOREGROUND FRAME for the {LEFT|RIGHT} edge of a wide screen: dark silhouette objects that are densest at the outer {left|right} edge and break up irregularly into full transparency toward the inner side (the inner third almost empty). Not a flat black cut-out: the shapes are dark but catch {RIM LIGHT} only on their edges. Slightly overhang the top and bottom. No text, no people, no logos. Do not mirror the other side's design.

ステージごとの続き({LEFT}/{RIGHT} と {RIM LIGHT} は §2 の表から):
- 洞窟: "Cave wall with hanging stalactites and jagged foreground rocks; cool light coming from deep inside the cave."
- 1 森: "Thick mossy tree trunk with drooping leafy branches and vines" / "a cluster of thin trunks, ferns, purple flowers at the bottom"; cool blue-white moonlight.
- 2 研究所跡: "Broken concrete pillar with exposed rebar and dangling cables" / "edge of a smashed equipment shelf, pipes, creeping ivy"; eerie green specimen-tank light.
- 3 医療科学センター(昼): "Corner of a crumbling stone house wall with ivy" / "rubble at the edge of cobblestones and a tilted street lamp"; warm daylight, shadows blue-grey (not black).
- 4 封鎖地域: "Frozen rocks and snow-laden dead branches" / "barbed-wire fence post and icy rocks"; cold moonlight.
- 5 軍本部: "Wooden stake barricade and sandbags" / "bent steel girder and torn cloth"; red firelight under a scorched sky.
- 6・EX 洋館(任意): "Heavy velvet curtain hanging from the top" (別形を左右で); candlelight.
- 7 逆探知地点: "Charred dead tree trunk with hanging branches" / "another dead tree and low brush"; orange haze glow.

## 4. 素材が届いた後(実装の段取り)
- `public/` へ原盤として置き、台帳を更新(`npm run assets:ledger`)・CREDITS.md に1行。
- 横長の時だけ表示する層を足す(スマホ縦は描かない)。`node scripts/phone-guard.mjs check` と `node scripts/pc-guard.mjs check` を回す。
- ステージに入る時だけ読む(遅延組)。1枚 約3MB(520×1440×4)×2=1ステージ約6MB。
