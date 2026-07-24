// 通常エンディング「軍本部／聴取記録」(社長編集稿2026-07-25採用=v0.25.2191で差し替え。
// 旧稿=統合正本7.2/D-10はgit履歴参照)。一言一句変更しない。サブ達成状況によって本文を変えない(全プレイヤー共通)。
// 演出(社長指定v0.25.2191): 最終行→暗転で「成し得なかった」だけが画面に残りフェードアウト→
// 入れ替わりに「the ONE」がフェードイン→スタッフロール→メインメニューへ。表示は components/EndingScreen.tsx。

export interface EndingLine {
  speaker: string;
  text: string;
}

export const ENDING_HEADER = '［軍本部／聴取記録］';

export const ENDING_SCRIPT: EndingLine[] = [
  { speaker: '記録官', text: 'ミラは偽名だな。本名は' },
  { speaker: 'ミラ', text: 'ノラ・ソレル' },
  { speaker: '記録官', text: 'グレンと名乗っていた男は、研究所主任グレアム・ケスラー。研究所の感染は、彼の発症が起点' },
  { speaker: 'ノラ', text: '……はい' },
  { speaker: '記録官', text: '研究の起点となったのは、フィル・ケスラー。グレアムの息子で、あなたの婚約者、そしてPHILL研究の発起人だな' },
  { speaker: 'ノラ', text: 'そうです' },
  { speaker: '記録官', text: '対変異体部隊の四名は、正式採用前の最終試験体。四名の蘇生成功後、軍はPHILLを正式採用した' },
  { speaker: 'ノラ', text: 'はい' },
  { speaker: '記録官', text: 'その後、フィル自ら志願し戦地で負傷。グレアムは規定量を超えた再生処置を行ったが細胞増殖が安定しなかった' },
  { speaker: 'ノラ', text: '他に方法がなかった' },
  { speaker: '記録官', text: '対変異体部隊へ接触した目的は、変異したグレアムを止めさせるため？' },
  { speaker: 'ノラ', text: 'そうです…謝りたい' },
  { speaker: '記録官', text: '最後に、なぜそこまでしてフィルを救おうとした？' },
  { speaker: 'ノラ', text: '彼は戦争だらけの世界を、本気で救おうとした' },
  { speaker: 'ノラ', text: 'こんな事、あの人にしか成し得なかった' },
];

// 暗転時に画面中央へ残す語(最終台詞の結び)。フェードアウト後、入れ替わりに「the ONE」がフェードイン。
export const ENDING_FINAL_WORD = '成し得なかった';
