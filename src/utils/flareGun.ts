// フレアガン(flare-gun)サブウェポン: ダメージ無しの火炎弾を近接攻撃時に進行方向へ発射し、
// 着弾点が3秒間「召喚と同じ範囲」の敵を引き付ける(PACING_PUZZLE.md §6.6 バッチM29)。
// 引き付けは既存の召喚ターゲット解決(resolveEnemyTarget)へ「疑似召喚」として乗せる方式
// (=召喚と完全に同じ効き方。通常敵380px=ALCHEMY_AGGRO_RANGE・ボスはBOSS_SUMMON_AGGROの
// 既存規則のまま。専用のヘイト機構は新設しない)。発射は gameStore.triggerCounter(近接スイング)、
// 寿命の回収と合流は useGameLoop/updateEnemies/combatTick、描画は pixiScene(読むだけ)。

// --- 調整用定数(§6.6 確定値+叩き台) ---
export const FLARE_GUN_CD_MS_BY_LEVEL: readonly number[] = [0, 9000, 7000, 5000]; // index=level(1..3)。社長指定(v0.25.1740で5/4/3→9/7/5秒)
export const FLARE_GUN_DURATION_MS = 3000; // 着弾点が敵を引き付ける時間(社長指定=3秒)
export const FLARE_GUN_FLIGHT_MS = 350;    // 発射→着弾の飛翔時間(見た目のみ・叩き台)

// 発射済みのフレア1個。firedAt→landAt=飛翔(見た目のみ・引き付け無し)、landAt→until=着弾中(引き付け有効)。
export interface FlareGunFlare {
  id: string;
  fromX: number;  // 発射点(プレイヤー中心)
  fromY: number;
  x: number;      // 着弾点(発射点+進行方向×ハンドガン距離)
  y: number;
  firedAt: number; // gameTime(ms)
  landAt: number;  // = firedAt + FLARE_GUN_FLIGHT_MS
  until: number;   // = landAt + FLARE_GUN_DURATION_MS
}

// resolveEnemyTarget に渡せる疑似召喚の形(Summon の構造的部分型。kind='normal'のみ対象になる)。
export interface FlarePseudoSummon {
  kind: 'normal';
  x: number;
  y: number;
  width: number;
  height: number;
}

// 着弾済み・生存中のフレアを疑似召喚へ変換(副作用なし)。飛翔中(landAt前)は引き付けない。
// 中心が着弾点に一致するよう width/height=2 の極小矩形にする(resolveEnemyTarget は中心を使う)。
export const activeFlareTargets = (
  flares: readonly FlareGunFlare[],
  gameTime: number,
): FlarePseudoSummon[] => {
  const out: FlarePseudoSummon[] = [];
  for (const f of flares) {
    if (gameTime >= f.landAt && gameTime < f.until) {
      out.push({ kind: 'normal', x: f.x - 1, y: f.y - 1, width: 2, height: 2 });
    }
  }
  return out;
};

// 寿命切れ(until 経過)のフレアを取り除く(副作用なし)。変化がなければ同じ配列を返す=store 書き込みの間引き用。
export const pruneFlares = (
  flares: readonly FlareGunFlare[],
  gameTime: number,
): readonly FlareGunFlare[] => {
  if (flares.length === 0) return flares;
  const alive = flares.filter(f => gameTime < f.until);
  return alive.length === flares.length ? flares : alive;
};
