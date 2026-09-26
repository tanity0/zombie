// ダイナミック・カメラワーク(research/CINEMATIC_CAMERA.md v2・社長承認2026-09-14「はい」)。
// 寄りズームのイベント(KILL/処刑・カウンター成立・死亡・救急/救援)に**演目ごとのキーフレーム台本**を与える純関数。
// 出力は既存のパンチズーム(zoomDecay=hold→ramp の包絡線)に掛ける**倍率と構図**だけ。判定・座標・HUD・zwarp(斜め)の入力は不変。
// pixiScene は読むだけ(CLAUDE.md「PixiJS only draws」)。数値は叩き台=実機で絞る。
export type CineKind = 'kill' | 'execute' | 'counter' | 'death' | 'rescue';
/** 重なりの優先順(高い方が割り込む。同じ/低い新イベントは捨てる)。execute=ボス/致命の処刑(v0.25.4296・別台本)。 */
export const CINE_PRIORITY: Readonly<Record<CineKind, number>> = { death: 4, execute: 3, kill: 2, counter: 1, rescue: 0 };
export interface CineEvent {
  kind: CineKind;
  startAt: number;   // Date.now(実時間・zoomStart と同じ時計)
  endAt: number;
  hasTarget: boolean;
  targetX: number;   // 相手(世界座標)。KILL=倒した敵 / カウンター=成立位置 / 死亡=自機
  targetY: number;
  // 構図の側(v0.25.4298 監査1/4): **開始時に確定して保持**(処刑の跳びつきで自機が相手座標へ動いても毎フレーム反転しない)。
  // 0=相手が自機と同じ位置(死亡・自傷)=側が決まらない→描画側は zwarp の奥側で代用する。
  sideX: 1 | -1 | 0;
  sideY: 1 | -1 | 0;
  // 割り込み(進行中に高い順位が入った)時の持ち越し: 前の演目のその瞬間の実効倍率(zoomMag 比)。新台本はここから始める(慣性MUST・監査2)。
  startFrac?: number;
  /** 幻影→**自分**の致命(v0.25.4306 §8-8)。カメラの台本は execute のままだが、VFXは死亡と同じ扱いにする
   *  (自分が殺された瞬間に逆光+ワイプ+シャッターの祝祭を出さない)。 */
  onPlayer?: boolean;
}
/** 台本を適用できる範囲。full=全部 / cutPush=ズーム引き中(pan が効かない)=カット+押し込みだけ / pushOnly=訓練・通路・EX=押し込みだけ */
export type CineMode = 'full' | 'cutPush' | 'pushOnly';
export interface CineCamera {
  zoomFrac: number;   // zoomMag に掛ける(1=台本なし)。KILL: カット70%→押し込み100%。カウンター: 112%→100%のばね。死亡: 60→100%をじり寄る
  orbitFrac: number;  // 横滑り(画面幅比・符号は呼び手が奥側で決める)。full 以外は0
  thirds: boolean;    // 相手を三分割線へ(自機と相手の内分点を寄り先にする)。full 以外は false
  outPow: number;     // 戻りの形: 共有包絡線(easeOut)に掛ける冪。1=そのまま / >1=保ってから速く落ちる(硬く切る) / <1=来た時より遅く帰る
  pushNorm: number;   // 押し込みの進み(0=カット直後 … 1=寄り切り)。近景の板が「寄ると前景は速く大きくなる」を読む(v0.25.4297)
}
// クリエイティブ監査(v0.25.4295・1巡)の反映: 押し込みに距離を持たせる(85→70%)/押し込みと横滑りを重ねて経路を1本に/
// 横滑りは長く怠く・押し込みは短く鋭く(尺で性格を分ける)/カウンターの行き過ぎを見える量に/振りは速く出てゆっくり戻る/
// 死亡は着いて止めてから来た時より遅く帰る。
// ---- KILL/処刑 ----
                                             // (0.7→0.5→**0.2**。v0.25.4313 社長「押し込みが切っても違いがわからない。もう少し数値広げて」)
export const CINE_KILL_ORBIT_FRAC = 0.14;    // 横滑り(画面幅比・v0.25.4301: 0.08→0.14)
export const CINE_KILL_ORBIT_START_MS = 200; // 押し込みの後半から重ねて滑り出す(終点と始点を同じ瞬間にしない=速度0の角を作らない)
export const CINE_KILL_ORBIT_MS = 260;       // 長く怠く(押し込みより長い)。t=460 で到達=斜め(zwarp)がほどけ切る頃に合わせる
export const CINE_KILL_OUT_POW = 1;
// ---- 処刑(致命=ボス級・forceMaximumZoom)・v0.25.4296: 長い保持と二拍目 ----
export const CINE_EXEC_ORBIT_FRAC = 0.18;     // v0.25.4301: 0.10→0.18
export const CINE_EXEC_ORBIT_START_MS = 250;
export const CINE_EXEC_ORBIT_MS = 420;        // 長く怠く
export const CINE_EXEC_OUT_POW = 0.8;         // 来た時より少し遅く帰る
// ---- カウンター成立 ----
export const CINE_COUNTER_OVERSHOOT = 0.22;  // 122%→100%(v0.25.4301: 0.12→0.22。2倍ズームで+11%)
export const CINE_COUNTER_IN_MS = 70;
export const CINE_COUNTER_ORBIT_FRAC = 0.09; // 逆側へ1拍(v0.25.4301: 0.05→0.09)
export const CINE_COUNTER_ORBIT_OUT_MS = 60; // 速く出て
export const CINE_COUNTER_ORBIT_BACK_MS = 180; // ゆっくり戻る
export const CINE_COUNTER_OUT_POW = 3;       // 硬く切る(保ってから速く落ちる)
// ---- 死亡 ----
export const CINE_DEATH_FROM_FRAC = 0.6;
export const CINE_DEATH_IN_MS = 900;         // 保持1150の前に着いて 250ms 止める
export const CINE_DEATH_OUT_POW = 0.6;       // 来た時より遅く帰る
// ---- 三分割(画面上の置き場所・v0.25.4296 クリエイティブ監査6) ----
export const CINE_THIRDS_X_FRAC = 1 / 6;   // 相手を縦の三分割線(中央から画面幅の1/6)へ
export const CINE_THIRDS_Y_FRAC = 1 / 8;   // 縦は控えめ(上下の副作用を避ける)
export const CINE_FRAME_MARGIN_FRAC = 0.14; // 自機が枠内に残る余白(画面比)
// ---- 近景の板(§6・v0.25.4296) ----
export const CINE_PLATE_W_FRAC = 0.40;     // 縁の何割を覆うか(小さいと「無い」と同じ。v0.25.4301: 0.32→0.40)
export const CINE_PLATE_TILT_RAD = 0.21;   // 幹≈12°(台形の奥側へ寝かせる。v0.25.4297: 霧とは別の値=派生値にしない)
export const CINE_PLATE_FOG_TILT_RAD = 0.035; // 霧≈2°(ほぼ水平)
export const CINE_PLATE_PUSH_SCALE = 0.07;  // 寄り切りで板が何割大きくなるか(前景は寄ると速く動く)
export const CINE_PLATE_NEAR_MARGIN_FRAC = CINE_PLATE_W_FRAC + 0.06; // 自機側の余白=板の内縁+0.06(=0.46)。斬っている自機が板の裏に隠れない
export const CINE_PLATE_ALPHA = 0.95;      // v0.25.4301: 0.85→0.95
export const CINE_PLATE_IN_MS = 220;
export const CINE_PLATE_DRIFT_FRAC = 0.03; // 保持中に奥側へ流れる量(横滑りの逆=視差)
export const CINE_PLATE_BLUR_PX = 7;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOutCubic = (u: number) => 1 - (1 - u) ** 3;
const easeInQuad = (u: number) => u * u;
const smoothstep = (u: number) => u * u * (3 - 2 * u);
// (押し込み削除で未使用になったため撤去) const easeInOutCubic = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2);
// 行き過ぎて止まる(back)。板の滑り込みに使う=慣性MUST。
const easeOutBack = (u: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (u - 1) ** 3 + c1 * (u - 1) ** 2; };

/**
 * モード(§2-6)。**pan が効くかは「演目の最大寄り(base × (1 + zoomMag))」で決める**。
 * panLimit = (1 − 1/zoom) × 画面半分 の zoom は寄り込み(punch)込みの毎フレーム値なので、カットの瞬間に 1 未満でも
 * 押し込みで 1 を超えた所から横滑り・三分割は自然に効き始める(限界が 0 から育つ=それ自体が慣性)。板は画面空間で無関係。
 * よって縮小(cutPush)にするのは**最大まで寄っても 1 に届かない時だけ**(巨大ボス遠距離 0.40×2.0=0.8 など)。
 * 経緯: v0.25.4298 までは寄り込み前の base で判定=群衆戦・ボス戦の処刑が全部縮小モード(実機「何も変わっていない」の真因)。
 * v0.25.4300 でカット時点の値に、v0.25.4301 でカットを 0.5/0.4 へ広げたのに合わせて最大寄りの値に(通常ボス 0.7×1.4=0.98 が
 * 縮小へ戻るのを避ける)。`kind` は将来の演目別の例外用に残す(今は全演目同じ)。
 */
export const cineModeFor = (pushOnly: boolean, baseZoom: number, zoomMag: number, _kind: CineKind): CineMode => {
  if (pushOnly) return 'pushOnly';
  const atPeak = baseZoom * (1 + Math.max(0, zoomMag));
  return atPeak < 1 ? 'cutPush' : 'full';
};

/**
 * 部品スイッチ(タイトル画面/URL)を台本の出力へ掛ける。**台本そのものは触らない**=切り分けで挙動が二重に変わらない。
 * - `push` 0 = 押し込み無し(カットの瞬間に100%寄る)。0.5 = 半分。1 = 台本どおり。
 * - `orbit` は横滑りの倍率。`thirds` false で構図を切る。
 */
// ★押し込み・三分割は削除したのでツマミも無い(社長指示2026-09-16)。残るのは横滑りだけ。
export const applyCineKnobs = (cam: CineCamera, knobs: { orbit: number }): CineCamera => {
  if (knobs.orbit === 1) return cam;
  return { ...cam, orbitFrac: cam.orbitFrac * knobs.orbit };
};

export const cineCameraAt = (kind: CineKind, tMs: number, mode: CineMode, startFrac?: number): CineCamera => {
  const t = Math.max(0, tMs);
  const full = mode === 'full';
  // 割り込み時の持ち越し: カット/開始の倍率を前の演目の実効値から始める(1フレームで20%引くような pop を作らない)。
  const from = (def: number) => (startFrac !== undefined && Number.isFinite(startFrac) ? Math.max(def, Math.min(1.2, startFrac)) : def);
  switch (kind) {
    // ★押し込み(カット倍率から最大まで寄っていく動き)は**削除**(社長指示2026-09-16
    // 「押し込みは削除」「**一番悪さしてたのは押し込みだった**」)。命中した瞬間に最大まで寄り切る。
    // 三分割の構図も**削除**(同指示)=相手は常に画面の中央に来る。
    case 'kill': {
      const ou = clamp01((t - CINE_KILL_ORBIT_START_MS) / CINE_KILL_ORBIT_MS);
      return { zoomFrac: 1, orbitFrac: full ? CINE_KILL_ORBIT_FRAC * smoothstep(ou) : 0, thirds: false,
        outPow: CINE_KILL_OUT_POW, pushNorm: 1 };
    }
    case 'execute': {
      // 旧: 一拍目(60→92%)→止め→二拍目(92→100%)。これも押し込みなので削除。横滑りだけ残す。
      const ou = clamp01((t - CINE_EXEC_ORBIT_START_MS) / CINE_EXEC_ORBIT_MS);
      return { zoomFrac: 1, orbitFrac: full ? CINE_EXEC_ORBIT_FRAC * smoothstep(ou) : 0, thirds: false,
        outPow: CINE_EXEC_OUT_POW, pushNorm: 1 };
    }
    case 'counter': {
      const u = clamp01(t / CINE_COUNTER_IN_MS);
      const zoomFrac = 1 + CINE_COUNTER_OVERSHOOT * (1 - easeOutCubic(u));
      // 逆側へ1拍: 速く出て(60ms・ease-out)、ゆっくり戻る(180ms・ease-out)=往復を対称にしない
      const t1 = t - CINE_COUNTER_IN_MS;
      let orbit = 0;
      if (t1 > 0) {
        orbit = t1 < CINE_COUNTER_ORBIT_OUT_MS
          ? -CINE_COUNTER_ORBIT_FRAC * easeOutCubic(t1 / CINE_COUNTER_ORBIT_OUT_MS)
          : -CINE_COUNTER_ORBIT_FRAC * (1 - easeOutCubic(clamp01((t1 - CINE_COUNTER_ORBIT_OUT_MS) / CINE_COUNTER_ORBIT_BACK_MS)));
      }
      return { zoomFrac, orbitFrac: full ? orbit : 0, thirds: false, outPow: CINE_COUNTER_OUT_POW, pushNorm: 1 };
    }
    case 'death': {
      // 止まらずにじり寄る(ease-in)→保持(DEATH_ZOOM_HOLD_MS までの残り)で止める→来た時より遅く帰る(outPow<1)
      const u = clamp01(t / CINE_DEATH_IN_MS);
      const f0 = Math.min(1, from(CINE_DEATH_FROM_FRAC));
      return { zoomFrac: f0 + (1 - f0) * easeInQuad(u), orbitFrac: 0, thirds: false, outPow: CINE_DEATH_OUT_POW, pushNorm: easeInQuad(u) };
    }
    case 'rescue':
    default:
      return { zoomFrac: 1, orbitFrac: 0, thirds: false, outPow: 1, pushNorm: 1 };
  }
};

/** 新しい演目を受け付けるか(優先順)。進行中(now<endAt)より低い/同じ順位は捨てる。 */
export const cineAccepts = (current: CineEvent | null, kind: CineKind, now: number): boolean =>
  !current || now >= current.endAt || CINE_PRIORITY[kind] > CINE_PRIORITY[current.kind];


/**
 * 三分割=**画面上の置き場所**で決める(v0.25.4296・クリエイティブ監査6): 相手を縦の三分割線(自機の反対側)へ置き、
 * 自機が枠内(余白 CINE_FRAME_MARGIN_FRAC)に残る範囲でクランプする。距離比(0.65)だと近接キルで中央寄せと区別がつかず、
 * 遠距離で自機が縁へ出ていた。返り値=寄り先(世界座標。この点が画面中央に来る)。
 */
export const thirdsAim = (input: {
  px: number; py: number; tx: number; ty: number; zoom: number; screenW: number; screenH: number;
  nearMarginFrac?: number; // 自機側(板のある縁)の余白。板を出す演目では CINE_PLATE_NEAR_MARGIN_FRAC を渡す(v0.25.4297・監査12)
  sideX?: 1 | -1; sideY?: 1 | -1; // 開始時に確定した側(cineEvent)。未指定なら今の位置関係で決める
}): { x: number; y: number; sideX: 1 | -1 } => {
  const { px, py, tx, ty, screenW, screenH } = input;
  const zoom = Math.max(0.001, input.zoom);
  const sideX: 1 | -1 = input.sideX ?? (tx >= px ? 1 : -1);
  const sideY: 1 | -1 = input.sideY ?? (ty >= py ? 1 : -1);
  let ax = tx - (sideX * screenW * CINE_THIRDS_X_FRAC) / zoom;
  let ay = ty - (sideY * screenH * CINE_THIRDS_Y_FRAC) / zoom;
  // 自機の画面位置=中央+(自機−寄り先)×zoom。枠内(余白)に収まるよう寄り先を戻す。自機側の余白だけ広く取れる(板の裏に隠さない)。
  const nearMargin = input.nearMarginFrac ?? CINE_FRAME_MARGIN_FRAC;
  const limY = screenH / 2 - screenH * CINE_FRAME_MARGIN_FRAC;
  const psx = (px - ax) * zoom, psy = (py - ay) * zoom;
  // 自機は相手の反対側(−sideX)へ出る。その側の限界=中央から (0.5 − nearMargin)×W。相手側へ出る稀な場合は通常の余白。
  const limNear = screenW / 2 - screenW * nearMargin;
  const limFar = screenW / 2 - screenW * CINE_FRAME_MARGIN_FRAC;
  const limX = Math.sign(psx) === -sideX ? limNear : limFar;
  if (Math.abs(psx) > limX) ax = px - (Math.sign(psx) * limX) / zoom;
  if (Math.abs(psy) > limY) ay = py - (Math.sign(psy) * limY) / zoom;
  return { x: ax, y: ay, sideX };
};

/** 近景の板の滑り込み(0→1・行き過ぎて止まる)。 */
export const cinePlateIn = (tMs: number): number => (tMs <= 0 ? 0 : tMs >= CINE_PLATE_IN_MS ? 1 : easeOutBack(tMs / CINE_PLATE_IN_MS));
/** 板を出す演目か(処刑2種と死亡。カウンターは短いので出さない・§6-1)。 */
export const cinePlateKinds: ReadonlySet<CineKind> = new Set<CineKind>(['kill', 'execute', 'death']);

/** 構図の側を開始時に決める(相手が自機と同じ位置なら 0=決まらない)。 */
export const cineSideOf = (px: number, py: number, tx: number, ty: number): { sideX: 1 | -1 | 0; sideY: 1 | -1 | 0 } => ({
  sideX: Math.abs(tx - px) < 1 ? 0 : tx > px ? 1 : -1,
  sideY: Math.abs(ty - py) < 1 ? 0 : ty > py ? 1 : -1,
});
