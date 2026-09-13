// 援護射撃(support-sniper)サブウェポン: 「移動中のみ進むCD」と「出現点(狙う敵→プレイヤーの
// 延長線が画面縁と交わる点)」の判定を純関数に閉じ込める(CLAUDE.md「実装精度の規律」4)。
// CD進行/発射・NPC生成・弾生成の配線は useGameLoop、NPCのスライド描画は pixiScene(読むだけ)。
// 仕様の正は PACING_PUZZLE.md §6.5(バッチM28)。

// --- 調整用定数(§6.5 確定値+叩き台) ---
export const SUPPORT_SNIPER_CD_MS_BY_LEVEL: readonly number[] = [0, 6000, 5000, 4000]; // index=level(1..3)。社長指定(v0.25.1726: 実地テスト#2で突出→5/4/3→6/5/4秒に調整)
export const SUPPORT_SNIPER_SLIDE_IN_MS = 250;   // スライドイン(登場→発射まで)
export const SUPPORT_SNIPER_SLIDE_OUT_MS = 350;  // スライドアウト(発射→消滅。向きは変えず後退)
export const SUPPORT_SNIPER_SLIDE_START_OUT = 30; // スライド開始点=縁の外側この距離(px・叩き台)
export const SUPPORT_SNIPER_INSET = 60;           // 発射位置=縁の内側この距離(px・叩き台。上縁でも絵が見える程度)

// 画面縁に出現するNPC(同時に1人のみ)。x/y=「狙う敵→プレイヤー」延長線と画面縁の交点。
// スライドの始点/終点は描画側が dir と定数(START_OUT/INSET)から導出する(状態は増やさない)。
export interface SupportSniperNpcState {
  id: number;
  x: number;            // 画面縁の交点(ワールド座標)
  y: number;
  dirX: number;         // NPCの向き(狙う敵の方向・単位ベクトル。スライドはこの軸で前進/後退)
  dirY: number;
  // 絵=「この出撃で護衛に出ていない軍人NPC」からランダム(社長訂正v0.25.1727: プレイアブル4クラス
  // ではなくエドガー等の軍人)。BASE_SOLDIERS名簿のindex(pixiScene の ESCORT_SPRITE_BASE と同じ対応)。
  soldierIndex: number;
  spawnedAt: number;    // gameTime(ms)。spawnedAt+SLIDE_IN_MS で発射
  firedAt: number;      // 0=未発射。>0=発射時刻(+SLIDE_OUT_MS で消滅)
  targetEnemyId: string;
  // GHOST-SUBS-FINAL(v0.25.2563): 呼んだ主語(守護霊のsummon.id)。undefined=プレイヤー(従来と同じ)。
  // 弾の倍率評価(buildSupportSniperShot の主語)と、狙いを失った時の持ち替え基準点に使う。
  // NPC枠自体は「同時1人」の世界の枠のまま(センサー地雷の盤面と同じ流儀)=呼び出しは早い者勝ちで、
  // 埋まっている間はもう一方のタイマーが満タン保持で待つ(既存の待ち規則をそのまま使う)。
  ownerGhostId?: string;
  /** ★O-3b-2(research/SAME_ARENA.md §3-d-4): 幻影が呼んだNPCか。true の間だけ標的=プレイヤー・
   * 撃つ弾は紫(noCounter)。未設定/false=従来どおり(プレイヤー/守護霊が呼び、敵を狙う)。 */
  hostile?: boolean;
}

// 登場NPCの選定: 軍人名簿(0..soldierCount-1)から「この出撃で護衛に出ている軍人(deployedIndices)」を
// 除いてランダム。rareIndex(フェイザー=レア枠)は護衛抽選と同じくレア性を保つため既定プールから除外する。
// 保険(理論上到達しない=8人中護衛は4人): プールが空なら非出撃全員→それも空なら名簿全体から選ぶ。
export const pickSupportSniperSoldier = (
  deployedIndices: readonly number[],
  soldierCount: number,
  rareIndex: number | null,
  rng: () => number = Math.random,
): number => {
  const deployed = new Set(deployedIndices);
  let pool: number[] = [];
  for (let i = 0; i < soldierCount; i++) {
    if (!deployed.has(i) && i !== rareIndex) pool.push(i);
  }
  if (pool.length === 0) {
    for (let i = 0; i < soldierCount; i++) if (!deployed.has(i)) pool.push(i);
  }
  if (pool.length === 0) pool = Array.from({ length: soldierCount }, (_, i) => i);
  const idx = Math.max(0, Math.min(pool.length - 1, Math.floor(rng() * pool.length)));
  return pool[idx];
};

export interface SupportSniperTickInput {
  deltaMs: number;        // このフレームの経過(ms・timeScale適用後)
  isMoving: boolean;      // プレイヤーが移動中か
  hasEnemy: boolean;      // 狙える敵がいるか
  cdRemainingMs: number;  // 残りCD(ms)。0=満タン(発射可)
  cooldownMs: number;     // レベル別CD(SUPPORT_SNIPER_CD_MS_BY_LEVEL)
}

export interface SupportSniperTickResult {
  cdRemainingMs: number;
  fire: boolean; // true ならこのフレームでNPCを出して発射シーケンス開始
}

// 1フレーム分のCD判定(副作用なし)。
// - 移動中のみCDが減る。停止中は保持(リセットしない)。
// - CDが尽きても敵がいなければ撃たず満タン(0)のまま保持し、移動中に敵が現れたら即発射。
// - レベルアップ等でCDが縮んだ場合は残りを新CDへクランプ(装備直後の初期値もここで吸収)。
export const computeSupportSniperTick = ({
  deltaMs,
  isMoving,
  hasEnemy,
  cdRemainingMs,
  cooldownMs,
}: SupportSniperTickInput): SupportSniperTickResult => {
  let cd = Math.min(cdRemainingMs, cooldownMs);
  if (!isMoving) return { cdRemainingMs: cd, fire: false };
  cd = Math.max(0, cd - deltaMs);
  if (cd > 0) return { cdRemainingMs: cd, fire: false };
  if (!hasEnemy) return { cdRemainingMs: 0, fire: false }; // 満タン保持
  return { cdRemainingMs: cooldownMs, fire: true };
};

export interface ViewRect { left: number; top: number; right: number; bottom: number }

// 出現点: 「狙う敵→プレイヤー」の延長線(プレイヤーから敵と反対の方向)が画面縁(view)と交わる点。
// jitterRad で射線を少し回転(±少しランダム=§6.5叩き台。乱数は呼び出し元が渡す=純関数維持)。
// 返り値の dirX/dirY はNPCの向き(=敵の方向)。プレイヤーが view の外など縮退時は null。
export const computeSupportSniperEntry = (
  enemyX: number, enemyY: number,
  playerX: number, playerY: number,
  view: ViewRect,
  jitterRad = 0,
): { x: number; y: number; dirX: number; dirY: number } | null => {
  // 縁へ向かう方向 = 敵→プレイヤー(敵から遠い側)。敵とプレイヤーが同座標なら下方向へ(縮退の保険)。
  let dx = playerX - enemyX;
  let dy = playerY - enemyY;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) { dx = 0; dy = 1; } else { dx /= len; dy /= len; }
  if (jitterRad !== 0) {
    const c = Math.cos(jitterRad), s = Math.sin(jitterRad);
    const rx = dx * c - dy * s;
    const ry = dx * s + dy * c;
    dx = rx; dy = ry;
  }
  // レイ (playerX,playerY) + t*(dx,dy) と矩形縁の交点(最小の正のt)。
  let t = Infinity;
  if (dx > 1e-6) t = Math.min(t, (view.right - playerX) / dx);
  else if (dx < -1e-6) t = Math.min(t, (view.left - playerX) / dx);
  if (dy > 1e-6) t = Math.min(t, (view.bottom - playerY) / dy);
  else if (dy < -1e-6) t = Math.min(t, (view.top - playerY) / dy);
  if (!Number.isFinite(t) || t < 0) return null;
  return { x: playerX + dx * t, y: playerY + dy * t, dirX: -dx, dirY: -dy };
};

// ★O-3b-2(research/SAME_ARENA.md §3-d-4・社長裁定「そのままプレイヤーに、プレイヤーから一番
// 遠い隅から tier1のマグナム仕様」): 幻影版の出現点。プレイヤー版(上のcomputeSupportSniperEntry=
// 狙う敵の反対側の縁)とは出現点の決め方だけが違う——狙う相手(=プレイヤー)から**画面の4隅の中で
// 最も遠い隅**を選ぶ(遠くから飛んでくるので弾が長く見える=読んで避けられる)。
// 向き(dirX/dirY)はNPCが撃つ方向=その隅からプレイヤーへ。
export const computeSupportSniperFarCorner = (
  playerX: number, playerY: number,
  view: ViewRect,
): { x: number; y: number; dirX: number; dirY: number } => {
  const corners = [
    { x: view.left, y: view.top },
    { x: view.right, y: view.top },
    { x: view.left, y: view.bottom },
    { x: view.right, y: view.bottom },
  ];
  let best = corners[0];
  let bestDist = -Infinity;
  for (const c of corners) {
    const d = Math.hypot(c.x - playerX, c.y - playerY);
    if (d > bestDist) { bestDist = d; best = c; }
  }
  const dx = playerX - best.x;
  const dy = playerY - best.y;
  const len = Math.max(0.001, Math.hypot(dx, dy));
  return { x: best.x, y: best.y, dirX: dx / len, dirY: dy / len };
};
