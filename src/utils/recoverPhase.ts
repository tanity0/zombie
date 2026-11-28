// ★技後の硬直相の綴りの規則(§16-H H-4(a))。enemyClocks(行動の時計の凍結)と brawlerCombo(格闘の固まりで止める相)が
// 同じ規則を引くための小さな葉(両者は互いを import できない=循環になるため、ここへ置いた)。
/**
 * ★技後の硬直相か(§16-H H-4(a))。名前の配列ではなく**綴りの規則**で見る——
 * 相は `-recover` で終わるのが全型共通の作法で、例外だけを下の集合に置く。
 * `*-retreat`(後退)は移動であって硬直ではないので**含めない**。
 */
const RECOVER_HOLD_EXTRA: ReadonlySet<string> = new Set([
  'recover',      // パンプキン/ハンター系のジャンプ着地硬直
  // ※'z-stagger' は160msのよろけ=2発目の溜め(狙い直してすぐ噛む・2026-10-14)。硬直ではないのでここに入れない。
  //   入れると、よろけの160msが「硬直」と数えられ、その間その敵の行動の時計(技のCD・chaffMoveAt 等)が据え置かれる。
  'b-release',    // batの掴みを「一拍留まる」
]);
export const isRecoverHoldPhase = (phase: string | undefined): boolean =>
  phase !== undefined && (phase.endsWith('-recover') || RECOVER_HOLD_EXTRA.has(phase));
