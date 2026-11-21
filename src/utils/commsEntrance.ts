/**
 * 会話(通信)の板の「入り」と「消え」(社長指示2026-11-17「中段くらいから箱ごと、フェードインさせる。一旦全部」)。
 * 視線はキャラに乗っているので、左上の板は出ても気づかれない → 会話の最初の1行だけ、画面の中段から板ごと定位置へ寄せて目を引く。
 * 続きの行・ゆっくり話す行は動きを小さくして、全部が同じ強さで飛ばないようにする(均質にしない)。
 * 描画は CSS の transform/opacity だけ(NpcDialogue)。ここは「どの入り方か」「音を鳴らすか」「どこから出るか」の純関数だけを置く。
 */

/**
 * 入り方。fly=中段から斜めに飛び込む(スマホ) / rise=定位置の少し下からせり上がる(PC の横長) /
 * continue=続きの行(小さく) / fade=ゆっくり話す行の続き(移動なし)。ゆっくり話す行も、会話の最初の1行なら fly / rise(尺だけ長い)。
 */
export type CommsEntranceKind = 'fly' | 'rise' | 'continue' | 'fade';

/** 同じ話者の行が、前の行が消えてからこの時間内に出たら「続き」(同じ会話の2行目以降)。話者が替わったら最初の1行の扱い。 */
export const COMMS_CONTINUE_WINDOW_MS = 1500;

/** 飛び込み・せり上がりの移動。速く出て、定位置の手前で減速して止まる(慣性)。 */
export const COMMS_MOVE_MS = 650;
export const COMMS_MOVE_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
/** 飛び込み・せり上がりの不透明度(移動とは別の時計)。 */
export const COMMS_FADE_IN_MS = 280;
/** ゆっくり話す行の最初の1行は、同じ動きを長い尺で(言い淀む行が速く飛び込まないように)。 */
export const COMMS_SLOW_MOVE_MS = 900;
export const COMMS_SLOW_FADE_IN_MS = 500;
/** 消え(上へ少し流れながら薄れる)の曲線。 */
export const COMMS_EXIT_EASING = 'ease-in';
/** 板が外れた後、下(PC は上)のスキル発動の行が詰まる動き(動き出しも止まりも滑らかに)。 */
export const COMMS_ROWS_CLOSE_MS = 260;
export const COMMS_ROWS_CLOSE_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';
/** スマホの飛び込みは着地で少し行き過ぎて戻る。行き過ぎる量(px)と、行き過ぎに届く時点(移動の尺に対する割合)。 */
export const COMMS_OVERSHOOT_PX = 3;
export const COMMS_OVERSHOOT_AT = 0.78;
/** 飛び込みの出発点を、定位置の横位置から画面の中心寄りへずらす量(px)=斜めに寄せる。 */
export const COMMS_FLY_SIDE_SHIFT_PX = 24;
/** PC のせり上がり: 定位置のこれだけ下から。 */
export const COMMS_RISE_PX = 50;
/** 続きの行: 定位置のこれだけ下から、短く。 */
export const COMMS_CONTINUE_PX = 8;
export const COMMS_CONTINUE_MS = 180;
/** ゆっくり話す行: 移動なしのフェードだけ。 */
export const COMMS_SLOW_FADE_MS = 400;
/** 消え: 上へ少し流れながら薄れる(動き出しはゆっくり=ease-in)。 */
export const COMMS_EXIT_MS = 200;
export const COMMS_EXIT_RISE_PX = 5;
/** スマホの飛び込み中、下のスキル発動の行は伏せておき、最後のこの時間で現す(板より先に見えないように)。 */
export const COMMS_COMPANION_FADE_MS = 150;
/** PC のせり上がりで箱の左端に灯す縦線の明滅(白→琥珀)。 */
export const COMMS_ACCENT_MS = 300;
/** 最低限の移動量(枠の高さに対する割合)。定位置が中段に近くても「動いた」と分かる距離は取る。 */
export const COMMS_ENTRANCE_MIN_TRAVEL = 0.35;

/**
 * 入りを出すか。板が消えている所から現れた時だけ(前の行が出たまま次の行へ替わる時は文字だけ替える)。
 */
export const shouldPlayCommsEntrance = (wasShown: boolean, isShown: boolean): boolean => !wasShown && isShown;

/** 話者の見分け。名前と、立ち絵の上書き(変異後グレン等)の両方が同じなら同じ話者。 */
export const commsSpeakerKey = (line: { name: string; portrait?: string }): string => `${line.name}\u0000${line.portrait ?? ''}`;

/**
 * どの入り方か。
 * @param sinceHiddenMs 前の行が消えてからの時間(一度も出ていなければ Infinity)
 * @param prevSpeaker 前の行の話者(commsSpeakerKey・一度も出ていなければ null)
 * @param speaker この行の話者(commsSpeakerKey)
 * @param slow ゆっくり話す行(npc.slow)
 * @param landscape 横長(PC・タブレットの横持ち)
 */
export const commsEntranceKind = (
  sinceHiddenMs: number, prevSpeaker: string | null, speaker: string, slow: boolean, landscape: boolean,
): CommsEntranceKind => {
  const continued = prevSpeaker !== null && prevSpeaker === speaker && sinceHiddenMs < COMMS_CONTINUE_WINDOW_MS;
  if (continued) return slow ? 'fade' : 'continue';
  return landscape ? 'rise' : 'fly';
};

/** 飛び込み・せり上がりの尺(移動・不透明度)。ゆっくり話す行は長く。 */
export const commsEntranceTiming = (slow: boolean): { moveMs: number; fadeMs: number } =>
  slow ? { moveMs: COMMS_SLOW_MOVE_MS, fadeMs: COMMS_SLOW_FADE_IN_MS } : { moveMs: COMMS_MOVE_MS, fadeMs: COMMS_FADE_IN_MS };

/**
 * 板が出入りした時の、スキル発動の行の段の動き(位置の変化を前の位置から慣性つきで移す=FLIP)。
 * 板が入る時は板と同じ移動の尺・曲線、板が外れた時は COMMS_ROWS_CLOSE_MS・COMMS_ROWS_CLOSE_EASING。
 */
export const commsRowsShift = (boxPresent: boolean, slow: boolean): { ms: number; easing: string } =>
  boxPresent ? { ms: commsEntranceTiming(slow).moveMs, easing: COMMS_MOVE_EASING } : { ms: COMMS_ROWS_CLOSE_MS, easing: COMMS_ROWS_CLOSE_EASING };

/** 入りの時にスキル発動の行を伏せるか。入りの時点で既に行が見えていれば伏せない(行が無い所から増える分だけ、板より先に見せない)。 */
export const shouldHideCompanionOnEntrance = (kind: CommsEntranceKind, companionVisible: boolean): boolean =>
  (kind === 'fly' || kind === 'rise') && !companionVisible;

/** 入りの音を鳴らすか。会話の最初の1行(fly / rise)だけ。立ち絵を差し替えた行(変異後グレン等)は鳴らさない。 */
export const commsEntranceSound = (kind: CommsEntranceKind, portraitOverride: boolean): boolean =>
  (kind === 'fly' || kind === 'rise') && !portraitOverride;

/**
 * 入りの出発点=定位置からの縦のずれ(px・画面の座標)。板の上端が枠の中段に来る所から出る。
 * 定位置が中段より上なら下から上へ、下なら上から下へ動く。
 * 中段との差が小さい時は、向きはそのままで最低限の移動量(枠の高さ×COMMS_ENTRANCE_MIN_TRAVEL)を取る。
 * @returns 出発点の translateY(正=定位置より下から出る)
 */
export const commsEntranceOffsetPx = (frameTop: number, frameH: number, restTop: number): number => {
  if (!(frameH > 0)) return 0;
  const toMid = frameTop + frameH * 0.5 - restTop;
  const min = frameH * COMMS_ENTRANCE_MIN_TRAVEL;
  if (Math.abs(toMid) >= min) return toMid;
  return toMid < 0 ? -min : min;
};

/** 飛び込みの出発点の横のずれ(px・画面の座標)。板の中心が枠の中心より左なら右へ(中心寄り)、右なら左へ。 */
export const commsEntranceSideShiftPx = (boxCenterX: number, frameCenterX: number): number =>
  boxCenterX < frameCenterX ? COMMS_FLY_SIDE_SHIFT_PX : boxCenterX > frameCenterX ? -COMMS_FLY_SIDE_SHIFT_PX : 0;
