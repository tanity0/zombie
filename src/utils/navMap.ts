// メニュー操作の「画面ごとの地図」の純関数(research/MENU_NAV.md v2/v3)。DOM も React も読まない=ユニットテストで固定する。
// 配線(DOM の走査・フォーカス・スクロール)は utils/menuNav.ts、絵は components/NavCursor.tsx・NavPrompt.tsx。
//
// 用語:
//  - 並び(group): list=上下 / row=左右 / grid=幾何(行=同じ高さ)。宣言の無い押せる物は「1つだけの並び(single)」。
//  - 層(layer): 画面(data-nav-screen)か窓(data-nav-modal)。候補は今の層の中だけ。
//  - 端: 並びの中で進む先が無い。折り返さない。その向きに別の並び/押せる物があれば幾何で一番近い物へ出る(v4)。何も無い時だけ小さくぶつかる。

export type NavDir = 'up' | 'down' | 'left' | 'right';
export interface NavRect { x: number; y: number; w: number; h: number }
export type NavGroupKind = 'list' | 'row' | 'grid' | 'single';
export type NavInputKind = 'key' | 'pad';

// ---- 位置で一番近い物(従来の矢印移動。宣言の無い画面・並びの外への行き先) ----

/** 今の矩形から dir の向きで一番近い候補の番号(無ければ -1)。主軸の距離 + 横ずれ×2 が最小のもの。 */
export const pickNeighbor = (from: NavRect, cands: readonly NavRect[], dir: NavDir): number => {
  const cx = from.x + from.w / 2, cy = from.y + from.h / 2;
  let best = -1, bestScore = Infinity;
  cands.forEach((r, i) => {
    const px = r.x + r.w / 2, py = r.y + r.h / 2;
    const dx = px - cx, dy = py - cy;
    let main: number, cross: number;
    if (dir === 'down') { main = dy; cross = Math.abs(dx); }
    else if (dir === 'up') { main = -dy; cross = Math.abs(dx); }
    else if (dir === 'right') { main = dx; cross = Math.abs(dy); }
    else { main = -dx; cross = Math.abs(dy); }
    if (main <= 4) return; // その向きに無い(同じ行/列のわずかなずれは除く)
    const score = main + cross * 2;
    if (score < bestScore) { bestScore = score; best = i; }
  });
  return best;
};

// ---- list / row の中 ----

export type ListStep = { type: 'move'; index: number } | { type: 'edge' } | { type: 'out' };

/**
 * list/row の中で dir の向きの次の押せる物へ。押せない物(focusable=false)は飛ばす。
 * list は上下・row は左右だけが並びの中の動き(それ以外の向きは 'out'=並びの外へ)。進む先が無ければ 'edge'(折り返さない)。
 */
export const stepInList = (focusable: readonly boolean[], cur: number, dir: NavDir, kind: 'list' | 'row'): ListStep => {
  const delta = kind === 'list' ? (dir === 'down' ? 1 : dir === 'up' ? -1 : 0) : (dir === 'right' ? 1 : dir === 'left' ? -1 : 0);
  if (delta === 0) return { type: 'out' };
  for (let i = cur + delta; i >= 0 && i < focusable.length; i += delta) if (focusable[i]) return { type: 'move', index: i };
  return { type: 'edge' };
};

// ---- grid(幾何) ----

export interface GridCell { rect: NavRect; focusable: boolean }

/** 行(同じ高さに並ぶ物)でまとめる。戻り値=行ごとの番号の列(上から下・各行は左から右)。列数の宣言は使わない(画面幅で変わる)。 */
export const gridRows = (cells: readonly GridCell[]): number[][] => {
  const cy = (i: number) => cells[i].rect.y + cells[i].rect.h / 2;
  const cx = (i: number) => cells[i].rect.x + cells[i].rect.w / 2;
  const order = cells.map((_, i) => i).sort((a, b) => cy(a) - cy(b) || cx(a) - cx(b));
  const rows: number[][] = [];
  let ref = -1;
  for (const i of order) {
    // 先頭の物の高さの半分以内に中心がある物は同じ行
    if (ref >= 0 && Math.abs(cy(i) - cy(ref)) < Math.min(cells[i].rect.h, cells[ref].rect.h) / 2) rows[rows.length - 1].push(i);
    else { rows.push([i]); ref = i; }
  }
  rows.forEach(r => r.sort((a, b) => cx(a) - cx(b)));
  return rows;
};

/**
 * grid の中の1歩。戻り値=移動先の番号、無ければ -1(端)。
 * 左右=同じ行の隣(押せない枠は飛ばす)/ 上下=次の行で横位置が一番近い物(その行に押せる物が無ければさらに次の行)。
 */
export const stepInGrid = (cells: readonly GridCell[], cur: number, dir: NavDir): number => {
  const rows = gridRows(cells);
  const r = rows.findIndex(row => row.includes(cur));
  if (r < 0) return -1;
  const cx = (i: number) => cells[i].rect.x + cells[i].rect.w / 2;
  if (dir === 'left' || dir === 'right') {
    const row = rows[r];
    const p = row.indexOf(cur);
    const d = dir === 'right' ? 1 : -1;
    for (let k = p + d; k >= 0 && k < row.length; k += d) if (cells[row[k]].focusable) return row[k];
    return -1;
  }
  const d = dir === 'down' ? 1 : -1;
  for (let k = r + d; k >= 0 && k < rows.length; k += d) {
    let best = -1, bestDx = Infinity;
    for (const i of rows[k]) {
      if (!cells[i].focusable) continue;
      const dx = Math.abs(cx(i) - cx(cur));
      if (dx < bestDx) { bestDx = dx; best = i; }
    }
    if (best >= 0) return best;
  }
  return -1;
};

// ---- 並びの外へ / 1歩の総合 ----

export interface NavItemInfo { group: number; rect: NavRect; focusable: boolean }
export interface NavGroupInfo { kind: NavGroupKind }
export type NavStep = { type: 'move'; index: number; cross: boolean } | { type: 'bump' };

/**
 * 今の物(cur)から dir へ1歩。items は DOM の順。
 *  - 並びの中の動き(list/row の軸・grid の全方向)を先に試す。
 *  - 並びの軸と直角の向き(list の左右・row の上下・single の全方向)と、★並びの端(v4: 端は外へ出る)は「並びの外」=
 *    別の並びのうち、その向きに幾何で一番近い物へ。折り返しはしない。
 *    入る位置は entryOf(その並びで覚えている物)があればそれ、無ければ幾何で一番近い物。
 *  - 外にも何も無い時だけ 'bump'(ぶつかって止まる)。
 */
export const navStep = (
  items: readonly NavItemInfo[], groups: readonly NavGroupInfo[], cur: number, dir: NavDir,
  entryOf?: (group: number) => number | undefined,
): NavStep => {
  const it = items[cur];
  if (!it) return { type: 'bump' };
  const kind = groups[it.group]?.kind ?? 'single';
  const members: number[] = [];
  items.forEach((x, i) => { if (x.group === it.group) members.push(i); });
  if (kind === 'list' || kind === 'row') {
    const r = stepInList(members.map(i => items[i].focusable), members.indexOf(cur), dir, kind);
    if (r.type === 'move') return { type: 'move', index: members[r.index], cross: false };
  } else if (kind === 'grid') {
    const cells: GridCell[] = members.map(i => ({ rect: items[i].rect, focusable: items[i].focusable }));
    const k = stepInGrid(cells, members.indexOf(cur), dir);
    if (k >= 0) return { type: 'move', index: members[k], cross: false };
  }
  // 並びの外へ
  const outs: number[] = [];
  items.forEach((x, i) => { if (x.group !== it.group && x.focusable) outs.push(i); });
  const j = pickNeighbor(it.rect, outs.map(i => items[i].rect), dir);
  if (j < 0) return { type: 'bump' };
  let target = outs[j];
  const e = entryOf?.(items[target].group);
  if (e !== undefined && items[e]?.focusable && items[e].group === items[target].group) target = e;
  return { type: 'move', index: target, cross: true };
};

// ---- 層に入った時の最初の物 ----

export interface InitialCand { key: string; focusable: boolean; isDefault: boolean; /** 宣言した並び(list/row/grid)の中の物か */ inGroup?: boolean }
/**
 * 覚えている物 → data-nav-default → 最初の並びの先頭(宣言した並びがあればその先頭=ヘッダの戻る等の単独の物より先)→ 最初の押せる物。無ければ -1。
 */
export const chooseInitial = (cands: readonly InitialCand[], remembered?: string): number => {
  if (remembered !== undefined) {
    const i = cands.findIndex(c => c.key === remembered && c.focusable);
    if (i >= 0) return i;
  }
  const d = cands.findIndex(c => c.isDefault && c.focusable);
  if (d >= 0) return d;
  const g = cands.findIndex(c => c.inGroup && c.focusable);
  if (g >= 0) return g;
  return cands.findIndex(c => c.focusable);
};

// ---- 覚える ----

/** 物の名前: data-nav-id があればそれ、無ければ並びの中の番号。 */
export const itemKey = (navId: string | null | undefined, indexInGroup: number): string => (navId ? `id:${navId}` : `#${indexInGroup}`);
/** 画面の「最後に選んだ物」に入れる完全な名前(並びの名前を前に付ける=並びをまたいで衝突しない)。 */
export const fullKey = (group: string, key: string): string => `${group}/${key}`;

/**
 * 画面キーごとに {最後に選んだ物, 並びごとの最後に選んだ物} を覚える(ラン中だけ・保存しない)。
 * 画面に入る時=最後に選んだ物、並びに入る時=その並びの最後の物。
 */
export class NavMemory {
  private screens = new Map<string, { last?: string; groups: Map<string, string> }>();
  remember(screen: string, group: string, key: string): void {
    let s = this.screens.get(screen);
    if (!s) { s = { groups: new Map() }; this.screens.set(screen, s); }
    s.last = fullKey(group, key);
    if (group) s.groups.set(group, key);
  }
  recallScreen(screen: string): string | undefined { return this.screens.get(screen)?.last; }
  recallGroup(screen: string, group: string): string | undefined { return this.screens.get(screen)?.groups.get(group); }
  clear(): void { this.screens.clear(); }
}

// ---- 戻る ----

/** 戻るの優先: 内側の層から見て、最初に戻る候補を持つ層の先頭の物。layers は内側→外側。 */
export const pickBackByLayer = <T>(layersInnerToOuter: readonly (readonly T[])[]): T | null => {
  for (const l of layersInnerToOuter) if (l.length > 0) return l[0];
  return null;
};

// ---- 決定の誤爆よけ(層が替わった直後・OS リピート) ----

/** 層(画面/窓/メニュー文脈)に入ってから、決定を無視する時間。 */
export const NAV_CONFIRM_GUARD_MS = 350;
export interface ConfirmGuard { since: number; blocked: readonly string[] }
/** 何も守っていない状態(起動時)。 */
export const openConfirmGuard = (): ConfirmGuard => ({ since: -1e9, blocked: [] });
/** 層に入った瞬間。その時に押されていた決定の入力(キーの code・'pad')は、離すまで決定に使わない。 */
export const enterConfirmGuard = (now: number, held: readonly string[]): ConfirmGuard => ({ since: now, blocked: [...held] });
/** 決定の入力が離された。 */
export const releaseConfirm = (g: ConfirmGuard, id: string): ConfirmGuard =>
  g.blocked.includes(id) ? { since: g.since, blocked: g.blocked.filter(x => x !== id) } : g;
/** いま id の決定を使ってよいか(層に入って 350ms 以内、または入った時から押しっぱなしなら不可)。 */
export const confirmAllowed = (g: ConfirmGuard, now: number, id: string): boolean =>
  now - g.since >= NAV_CONFIRM_GUARD_MS && !g.blocked.includes(id);
export const isConfirmCode = (code: string): boolean => code === 'Enter' || code === 'NumpadEnter' || code === 'Space';
/** OS のキーリピートは決定にも戻る(Esc)にも使わない。 */
export const discardsRepeat = (code: string, repeat: boolean): boolean => repeat && (isConfirmCode(code) || code === 'Escape');

// ---- 入力の種類 ----

/** keydown が本物のキーボードか(パッドの B/Start が合成する Esc で表記が反転しない)。本物なら 'key'、合成なら null(変えない)。 */
export const navInputKindOf = (e: { isTrusted: boolean }): NavInputKind | null => (e.isTrusted ? 'key' : null);

/** PlayStation 系のパッドか(gamepad.id に 054c / DualSense / Wireless Controller 等)。 */
export const isPlayStationPad = (id: string | undefined): boolean => !!id && /054c|dualsense|dualshock|wireless controller|playstation/i.test(id);

// ---- 押しっぱなしの繰り返し(持ち主は menuNav だけ) ----

export const NAV_REPEAT_FIRST_MS = 320;
export const NAV_REPEAT_MS = 110;
export interface RepeatState { dir: NavDir | null; nextAt: number }
export const initRepeat = (): RepeatState => ({ dir: null, nextAt: 0 });
/**
 * 押されている向き(無ければ null)と今の時刻から、今動くべきかを決める。向きが変わった/新しく押した=すぐ動き、
 * 次は 320ms 後。以後は 110ms ごと。fresh=この押下で最初の1回。
 */
export const stepRepeat = (s: RepeatState, dir: NavDir | null, now: number): { fire: boolean; fresh: boolean; state: RepeatState } => {
  if (!dir) return { fire: false, fresh: false, state: { dir: null, nextAt: 0 } };
  if (dir !== s.dir) return { fire: true, fresh: true, state: { dir, nextAt: now + NAV_REPEAT_FIRST_MS } };
  if (now >= s.nextAt) return { fire: true, fresh: false, state: { dir, nextAt: now + NAV_REPEAT_MS } };
  return { fire: false, fresh: false, state: s };
};

// ---- 案内(画面右下の1行) ----

export type PromptStyle = 'key' | 'pad' | 'padps';
export interface PromptItem { keys: string[]; verb: string }
export interface PromptSpec { hasBack: boolean; backLabel?: string; hasTabs: boolean }
/** 使っている機器に合わせた案内。その画面に無い操作(戻る・タブ)は出さない。 */
export const promptItems = (style: PromptStyle, spec: PromptSpec): PromptItem[] => {
  const k = style === 'key' ? { ok: 'Enter', back: 'Esc', l: 'Q', r: 'E' }
    : style === 'padps' ? { ok: '×', back: '○', l: 'L1', r: 'R1' }
      : { ok: 'A', back: 'B', l: 'LB', r: 'RB' };
  const out: PromptItem[] = [{ keys: [k.ok], verb: '決定' }];
  if (spec.hasBack) out.push({ keys: [k.back], verb: spec.backLabel || '戻る' });
  if (spec.hasTabs) out.push({ keys: [k.l, k.r], verb: '切替' });
  return out;
};

// ---- スクロール ----

/**
 * 選んだ物(itemStart..itemEnd)を見える範囲(visStart..visEnd)へ入れるための動かす量(正=後ろへ送る)。
 * visStart/visEnd は「枠の見える範囲から sticky/fixed の物が覆う帯を引いた残り」。
 * lookahead=先読みの余白(次の1行ぶん)。見える範囲に収まらない大きな物は先頭を揃える。
 */
export const revealDelta = (visStart: number, visEnd: number, itemStart: number, itemEnd: number, lookahead: number): number => {
  const size = visEnd - visStart;
  if (size <= 0) return 0;
  const len = itemEnd - itemStart;
  if (len >= size) return itemStart - visStart; // 入り切らない=先頭を揃える
  const la = Math.max(0, Math.min(lookahead, (size - len) / 2));
  if (itemStart - la < visStart) return itemStart - la - visStart;
  if (itemEnd + la > visEnd) return itemEnd + la - visEnd;
  return 0;
};

/** cubic-bezier(x1,y1,x2,y2) の ease 関数(t∈[0,1] → 進み具合)。スクロールの尺 220ms・曲線 (.2,.7,.3,1)。 */
export const cubicBezier = (x1: number, y1: number, x2: number, y2: number): ((t: number) => number) => {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (s: number) => ((ax * s + bx) * s + cx) * s;
  const Y = (s: number) => ((ay * s + by) * s + cy) * s;
  const dX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let s = t;
    for (let i = 0; i < 8; i++) { // ニュートン法
      const e = X(s) - t;
      if (Math.abs(e) < 1e-5) return Y(s);
      const d = dX(s);
      if (Math.abs(d) < 1e-6) break;
      s -= e / d;
    }
    let lo = 0, hi = 1; s = t; // 外れた時は二分法
    for (let i = 0; i < 24; i++) { const x = X(s); if (Math.abs(x - t) < 1e-5) break; if (x < t) lo = s; else hi = s; s = (lo + hi) / 2; }
    return Y(s);
  };
};
export const NAV_SCROLL_MS = 220;
export const navScrollEase = cubicBezier(0.2, 0.7, 0.3, 1);
