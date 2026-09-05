// 通常エンディング「軍本部／聴取記録」(社長編集稿2026-08-29採用=v0.25.4063で差し替え。
// 前稿=2026-07-25稿(v0.25.2191)はgit履歴参照。
// 旧稿=統合正本7.2/D-10はgit履歴参照)。一言一句変更しない。サブ達成状況によって本文を変えない(全プレイヤー共通)。
// 演出(v0.25.4065/4066): 最終行の後、その場で「成し得なかった」+ルビの the/ONE だけが残り
// 順番に消える(ONE最後)→爆撃がフィルへ直撃(フィナーレ)。「the ONE」タイトル画面は廃止
// (社長指示2026-08-29)。表示は components/EndingScreen.tsx。

export interface EndingLine {
  speaker: string;
  text: string;
  /** 小さく添える英語ルビ(社長指示2026-08-29「最後のノラのセリフだけ、自然な英語の感じで小さく
   *  英語のルビふれる?」)。現在は最終行のみ。word相で the/ONE が残る仕込みになる自然な英文。 */
  en?: string;
}

export const ENDING_HEADER = '［軍本部／聴取記録］';

export const ENDING_SCRIPT: EndingLine[] = [
  { speaker: '記録官', text: 'ミラは偽名だな。本名は' },
  { speaker: 'ミラ', text: 'ノラ・ソレル' },
  { speaker: '記録官', text: 'グレンと名乗っていた男は、研究所主任グレアム・ケスラー。研究所の感染は、彼の発症が起点' },
  { speaker: 'ノラ', text: '……はい' },
  { speaker: '記録官', text: '研究の起点となったのは、フィル・ケスラー。グレアムの息子で、あなたの婚約者、そしてPHILL研究の発起人' },
  { speaker: 'ノラ', text: 'そうです' },
  { speaker: '記録官', text: '対変異体部隊の四名は、正式採用前の最終試験体。四名の蘇生成功後、軍はPHILLを正式採用した' },
  { speaker: 'ノラ', text: 'はい' },
  { speaker: '記録官', text: 'その後、フィルは自ら戦地へ志願し、負傷。グレアムは規定量を超えた再生処置を行い、細胞増殖は停止しなかった' },
  { speaker: 'ノラ', text: '他に方法がなかった' },
  { speaker: '記録官', text: '対変異体部隊へ接触した目的は、変異したグレアムを止めさせるため' },
  { speaker: 'ノラ', text: 'そうです' },
  { speaker: '記録官', text: 'フィルの救命を継続した理由は' },
  { speaker: 'ノラ', text: '彼は戦争だらけの世界を、本気で救おうとした' },
  { speaker: 'ノラ', text: 'こんな事、あの人にしか成し得なかった', en: 'He was the only ONE who could.' },
];

// word相でその場に残す語(最終台詞の結び)。the/ONE と共に順番に消えて、フィナーレ(直撃)へ。
export const ENDING_FINAL_WORD = '成し得なかった';
