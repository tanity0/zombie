// 四神舞(リズム)サブウェポンの定数。リズム判定・四神技の数値は多くが未確定のため、
// 仮値には TODO を明記して実機調整できるようにする(勝手に確定しない方針)。
import type { RhythmArrow, ShijinGod } from '../types/game';

// --- リズム ---------------------------------------------------------------
export const RHYTHM_INTERVAL_MS = 500;        // サークル間隔(0.5秒 = 120BPM)
export const RHYTHM_LEAD_MS = 600;            // モード開始〜最初のジャストまでの猶予
// BGM(120BPM)の拍頭に対する補正(ms)。pulse-grid の currentTime=0 が拍頭からズレている場合に調整。
export const RHYTHM_MUSIC_OFFSET_MS = 0;
export const RHYTHM_SUCCESS_WINDOW_MS = 180;  // 成功判定幅(±ms)。ほんの少し甘めに調整
export const RHYTHM_JUST_WINDOW_MS = 75;      // ジャスト判定幅(±ms)。演出区別+少し甘め
export const RHYTHM_INPUT_DEBOUNCE_MS = 90;   // 連続入力の最短間隔(多重判定防止)
// フリックは「触れてから振り終わるまで」の所要時間ぶん遅れて確定するため、その遅延を差し引いて
// 判定し(=指が動き始めた瞬間で見る)、さらにフリックだけ少しだけ判定窓を広げる。
export const RHYTHM_FLICK_EXTRA_WINDOW_MS = 55;
// フリックは「触れてから離すまで」の接触区間のどこかにジャストが入っていれば成功(離す瞬間は不問)。
// 区間が長すぎる場合の上限(長押ししっぱなしで何でも成功になるのを防ぐ)。
export const RHYTHM_FLICK_MAX_CONTACT_MS = 700;
export const RHYTHM_ENTER_IDLE_MS = 600;      // 停止からリズムモード開始までの時間
// リズム終了はこの時間「動き続けた」場合のみ(短いフリックのドラッグ/スライドでは抜けない)。
export const RHYTHM_EXIT_MOVE_MS = 320;        // TODO: 歩いて抜けたと見なすまでの時間
export const RHYTHM_START_INVULN_MS = 600;    // TODO: 開始直後の無敵(仮値0.6s)
// フリック=盾バッシュ風スライド。プレイヤーがフリック方向へ短く滑って攻撃する。
export const SHIJIN_SLIDE_DISTANCE = 58;       // TODO: 滑る距離(盾バッシュ50相当)
export const SHIJIN_SLIDE_MS = 150;            // TODO: 滑りの所要時間
export const RHYTHM_PROMPT_LEN = 4;           // 1パターンの矢印数(全部で4)
export const SHIJIN_FINISH_COUNT = 4;         // 四神技4回成功で全体フィニッシュ
export const RHYTHM_ARROWS: RhythmArrow[] = ['up', 'down', 'left', 'right'];
// ランダムな4矢印プロンプトを生成(1本目=四神決定)。
export const randomRhythmPrompt = (): RhythmArrow[] =>
  Array.from({ length: 4 }, () => RHYTHM_ARROWS[Math.floor(Math.random() * RHYTHM_ARROWS.length)]);
// フリックのベクトル → 主軸の矢印。
export const arrowFromDir = (x: number, y: number): RhythmArrow =>
  Math.abs(x) >= Math.abs(y) ? (x >= 0 ? 'right' : 'left') : (y >= 0 ? 'down' : 'up');
// 表示用: 矢印グリフと四神の和名(コマンドUI/オーバーレイで使用)。
export const ARROW_GLYPH: Record<RhythmArrow, string> = { up: '↑', down: '↓', left: '←', right: '→' };

// リズムゲーム風の太いドット絵矢印(7x7)。上向きを基準に90°回転で4方向。Pixiオーバーレイと
// HUD(左上コマンド)の両方で同じ形を使う。
const RHYTHM_ARROW_UP: number[][] = [
  '...X...',
  '..XXX..',
  '.XXXXX.',
  'XXXXXXX',
  '..XXX..',
  '..XXX..',
  '..XXX..',
].map(row => row.split('').map(c => (c === 'X' ? 1 : 0)));
const rotateArrowCW = (m: number[][]): number[][] => m.map((row, i) => row.map((_, j) => m[m.length - 1 - j][i]));
export const RHYTHM_ARROW_GRID: Record<RhythmArrow, number[][]> = {
  up: RHYTHM_ARROW_UP,
  right: rotateArrowCW(RHYTHM_ARROW_UP),
  down: rotateArrowCW(rotateArrowCW(RHYTHM_ARROW_UP)),
  left: rotateArrowCW(rotateArrowCW(rotateArrowCW(RHYTHM_ARROW_UP))),
};
export const SHIJIN_JP: Record<ShijinGod, string> = { suzaku: '朱雀', genbu: '玄武', seiryu: '青龍', byakko: '白虎' };
// 技を連続で出した回数(godSuccess)で変わるミラーボールの色。0白/1青/2緑/3赤、4でフィニッシュ=虹。
export const RHYTHM_STAGE_COLORS = [0xffffff, 0x3b82f6, 0x22c55e, 0xef4444];
export const RHYTHM_FINISH_RAINBOW_MS = 950;  // フィニッシュ時の虹色演出の長さ
export const RHYTHM_BALL_DIAM = 30;           // 頭上ミラーボールの表示直径(px)
// フィニッシュの虹(順番に巡回して虹色に見せる)。
export const RHYTHM_RAINBOW_PALETTE = [0xff3b30, 0xff9500, 0xffcc00, 0x34c759, 0x00c7be, 0x007aff, 0xaf52de];
// 1本目の矢印 → 四神(上=朱雀/下=玄武/左=青龍/右=白虎)。
export const SHIJIN_BY_ARROW: Record<RhythmArrow, ShijinGod> = {
  up: 'suzaku',
  down: 'genbu',
  left: 'seiryu',
  right: 'byakko',
};
// ミラーボールのコンボ段階色(段階が上がるほど暖色→白熱)。コンボ数から導出。
export const RHYTHM_COMBO_STAGE_COLORS = [0x60a5fa, 0x34d399, 0xfbbf24, 0xf97316, 0xf43f5e, 0xffffff];
export const rhythmComboStage = (combo: number): number =>
  Math.max(0, Math.min(RHYTHM_COMBO_STAGE_COLORS.length - 1, Math.floor(combo / 4)));

// --- 通常リズム入力(控えめ。コンボで威力は伸ばさない) -------------------
// タップ(ジャスト): 近接ナイフ範囲(MELEE_RADIUS)内の敵を強制ノックバック。
export const RHYTHM_TAP_DAMAGE = 4;           // TODO: タップの軽ダメージ(主目的はノックバック)
export const RHYTHM_TAP_KNOCKBACK_MULT = 3.4; // タップの強制ノックバック(強め)
// フリック(ジャスト): 盾バッシュ風に滑りながら方向攻撃。
export const RHYTHM_FLICK_RANGE = 130;        // TODO: フリック方向攻撃の射程
export const RHYTHM_FLICK_HALF_W = 34;        // TODO: フリック方向攻撃の帯半幅
export const RHYTHM_FLICK_DAMAGE = 12;        // TODO: バッシュのダメージ
export const RHYTHM_FLICK_KNOCKBACK_MULT = 7.2; // バッシュの強ノックバック(2倍に増強)

// --- 四神技(すべて近接フィニッシュ可・数値TODO) -------------------------
// 朱雀: 近場最大3体を「グレネードランチャー(rifle-t3)」相当の範囲爆破。手榴弾(heavy-grenade)ではない。
// 半径・演出時間はランチャーの爆発(GRENADE_BLAST_RADIUS=92 / GRENADE_LAUNCHER_EXPLOSION_EFFECT_MS)に合わせる
// ため、useGameLoop 側でランチャー定数を直接流用する(ここでは威力と対象数のみ)。
export const SUZAKU_MAX_TARGETS = 3;
export const SUZAKU_BLAST_DAMAGE = 48;        // TODO: グレネードランチャー相当の威力(実機調整)
// 玄武: 上下左右へプレイヤー幅程度の十字直線。
export const GENBU_LINE_LENGTH = 260;         // TODO
export const GENBU_LINE_HALF_W = 18;          // プレイヤー幅程度
export const GENBU_DAMAGE = 30;               // TODO
// 青龍: 斜めX字の直線。
export const SEIRYU_LINE_LENGTH = 260;        // TODO
export const SEIRYU_LINE_HALF_W = 18;
export const SEIRYU_DAMAGE = 30;              // TODO
// 白虎: 5秒間、0.5秒ごとにハンドガン射程内の近い敵を1体斬る(最大10回)。
export const BYAKKO_DURATION_MS = 5000;
export const BYAKKO_INTERVAL_MS = 500;
export const BYAKKO_MAX_HITS = 10;            // 5s ÷ 0.5s = 10
export const BYAKKO_RANGE = 200;              // TODO: ハンドガン射程くらい
export const BYAKKO_DAMAGE = 16;              // TODO
// 全体フィニッシュ: 画面内の雑魚は近接フィニッシュ、ボスは即死でなく大ダメージ。
export const SHIJIN_FINISH_BOSS_DAMAGE = 120; // TODO: ボスへの近接フィニッシュ相当大ダメージ
export const SHIJIN_FINISH_SCREEN_MARGIN = 180; // 画面内判定の余白(EFFECT_VIEWPORT_MARGIN相当)

// --- 演出: リズム中の画面暗転 / タップ発光 -------------------------------
export const RHYTHM_DIM_ALPHA = 0.42;         // リズム中の地面暗転の濃さ(さらに暗く)
export const RHYTHM_DIM_EASE = 0.16;          // 暗転フェードの追従(フレーム毎)
export const RHYTHM_TAP_GLOW_MS = 200;        // タップ発光の持続
export const RHYTHM_TAP_GLOW_ALPHA = 0.18;    // タップ発光の最大強さ(少し光る)
