// 通常エンディング「軍本部／聴取記録」の確定稿(統合正本7.2 / 一括制作指示書5章)。
// 一言一句変更しない。サブ達成状況によって本文を変えない(全プレイヤー共通)。
// 演出(統合正本7.3): 最終行「名前は」→暗転→画面中央に PHILL のみ(ルビ・括弧・音声なし)
// →スタッフロール→メインメニューへ。表示は components/EndingScreen.tsx。

export interface EndingLine {
  speaker: string;
  text: string;
}

export const ENDING_HEADER = '［軍本部／聴取記録］';

export const ENDING_SCRIPT: EndingLine[] = [
  { speaker: '記録官', text: '本名は' },
  { speaker: '女', text: 'ノラ' },
  { speaker: '記録官', text: 'グレンと名乗っていた男は、研究所主任グレアム・ケスラーか' },
  { speaker: 'ノラ', text: 'はい' },
  { speaker: '記録官', text: '研究所の資料から、感染の起点はグレンだったと断定したが？' },
  { speaker: 'ノラ', text: 'はい' },
  { speaker: '記録官', text: 'なぜそのまま研究所を後にした？' },
  { speaker: 'ノラ', text: '研究を止められるわけにはいかなかった' },
  { speaker: '記録官', text: '洋館の保存槽にいた男を戻すためか。彼は？' },
  { speaker: 'ノラ', text: 'グレンの息子。そして私の婚約者' },
  { speaker: '記録官', text: '名前は' },
];

// 暗転後に画面中央へ出す語(これだけ。追加説明・ルビ・括弧書きは置かない)。
export const ENDING_FINAL_WORD = 'PHILL';
