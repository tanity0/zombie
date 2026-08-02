export type CoopRole = 'host' | 'guest';

/** 接続の状態。ゲーム側はこれを毎フレーム読んでよい(同期・軽い・例外を投げない)。 */
export type CoopStatus =
  | 'off'          // 無効(?online=0 / 基盤未設定 / 初期化失敗)
  | 'advertising'  // 募集中(まだ誰も来ていない)
  | 'connecting'   // 相手が来た。接続を確立中
  | 'connected'    // 疎通した。バイト列を運べる
  | 'closed';      // 終了(理由は onClosed で通知済み)

export type CoopCloseReason =
  | 'peer-left'      // 相手が抜けた/落ちた
  | 'timeout'        // 確立できなかった
  | 'version'        // ビルドのバージョンが違う
  | 'local'          // こちらから閉じた(ボス撃破・死亡・撤退)
  | 'error';         // それ以外(内部で握りつぶした結果)

/** 募集の内容。**中身の意味をオンライン層は知らない**(一致判定にしか使わない)。 */
export interface CoopAd {
  /** ビルドの識別子。違えば繋がない(毎日pushするプロジェクトなので必須)。 */
  buildVersion: string;
  /** 突き合わせ用の不透明なラベル(ゲーム側が作る。例: ステージとボスを表す短い文字列)。 */
  matchKey: string;
  /** 一覧に出す表示用の短い文字列(オンライン層は中身を検証だけして解釈しない)。 */
  label: string;
}

export interface CoopOpenRoom {
  roomId: string;
  label: string;
  matchKey: string;
  /** 募集が立ってからの経過(ms)。古い部屋を避けるのに使う。 */
  ageMs: number;
}

/**
 * 1秒ごとに更新される接続統計。同じオブジェクトが再利用されるため、呼び出し側は書き換えない。
 * lastReceivedAtMs はゲームデータをまだ受信していない間は 0。
 */
export interface CoopStats {
  rttMs: number;
  bytesSent: number;
  bytesReceived: number;
  messagesSent: number;
  messagesReceived: number;
  lastReceivedAtMs: number;
  maintenanceOpen: boolean;
}

export interface CoopSession {
  readonly role: CoopRole;
  status(): CoopStatus;

  /** 状態や入力を送る。**到達保証なし・順序保証なし**(毎フレーム投げる用)。 */
  sendUnreliable(data: Uint8Array): void;
  /** 制御を送る。**到達保証あり・順序保証あり**(開始・終了・合意など)。 */
  sendReliable(data: Uint8Array): void;

  /** 受信。戻り値は購読解除。 */
  onMessage(cb: (data: Uint8Array, channel: 'unreliable' | 'reliable') => void): () => void;
  /** 相手が入って疎通した瞬間(status が 'connected' になった時)。 */
  onPeerJoined(cb: () => void): () => void;
  /** 終了。**必ず1回だけ呼ばれる**。ゲーム側はここでAIへ戻す(何もしなくてよい設計にする)。 */
  onClosed(cb: (reason: CoopCloseReason) => void): () => void;

  /** 往復遅延の実測(ms)。まだ測れていなければ -1。 */
  rttMs(): number;

  /** キャッシュ済み統計。同じオブジェクトを返すので、値は呼んだその場で読み取る。 */
  stats(): CoopStats;

  close(reason: CoopCloseReason): void;
}

export interface CoopApi {
  /** 使える状態か(?online=0・未設定・初期化失敗なら false)。**同期・例外なし**。 */
  enabled(): boolean;

  /**
   * ホスト: 手伝いを募集する。**部屋を立てた時点で resolve**(相手を待たない)。
   * 失敗したら null(ゲームは何事もなく続く)。
   */
  advertise(ad: CoopAd): Promise<CoopSession | null>;

  /** ゲスト: 入れる部屋を探す。失敗したら空配列。 */
  listOpen(matchKey: string, buildVersion: string): Promise<CoopOpenRoom[]>;

  /** ゲスト: 入る。失敗したら null。 */
  join(roomId: string): Promise<CoopSession | null>;
}
