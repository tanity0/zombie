/**
 * 「賞金首」チュートリアル(tutorials.ts の 'bounty')の発火条件。
 * 賞金首が初めて現れた時、その出現のアテンション(カメラが寄って戻る)が**終わり切って**操作が戻った瞬間に、端末で1度だけ出す
 * (既読は loadSeenForGate)。ステージ1の1周目(強制の賞金首)も同じ。
 * ほかのポップアップ・メニュー・会話・アテンションの間は出さない(重ねない)。1周目の「守護霊」は交戦時に出る=
 * こちらが開いている間はあちらが待つ(あちらもポップアップが閉じるまで待つ作り)。
 */
export interface BountyTutorialGate {
  /** この出撃で賞金首が出現し、まだチュートリアルの判定を済ませていない。 */
  pending: boolean;
  /** 賞金首の出現アテンションが、まだ発火待ち(出現演出の950msの間)。 */
  attentionQueued: boolean;
  /** アテンション(どの演出でも)の最中。 */
  attentionActive: boolean;
  /** 場に賞金首が居る(出現した個体が既に居なくなっていたら出さない)。 */
  bountyPresent: boolean;
  /** 端末で既読か。 */
  seen: boolean;
  popupOpen: boolean;
  menuOpen: boolean;
  /** NPCの会話(表示中・待ち行列)がある。流れ切ってから出す。 */
  dialogueActive: boolean;
}

export const shouldShowBountyTutorial = (g: BountyTutorialGate): boolean =>
  g.pending && !g.seen && g.bountyPresent && !g.attentionQueued && !g.attentionActive && !g.popupOpen && !g.menuOpen && !g.dialogueActive;

/** 待ちを捨てるか(既読になった/アテンションが終わったのに賞金首が居ない)。捨てないと次の出撃の頭で誤って出る。 */
export const dropBountyTutorialPending = (g: BountyTutorialGate): boolean =>
  g.pending && (g.seen || (!g.bountyPresent && !g.attentionQueued && !g.attentionActive));
