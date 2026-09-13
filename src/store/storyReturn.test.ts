import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from './gameStore';

const placeReturnCircleOnPlayer = (dwellMs = 0, revealedAt?: number) => {
  useGameStore.setState(state => ({
    returnCircle: {
      x: state.player.x + state.player.width / 2,
      y: state.player.y + state.player.height / 2,
      radius: 95,
      dwellMs,
      ...(revealedAt === undefined ? {} : { revealedAt }),
    },
  }));
};

describe('通常ストーリーの帰還確認', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame('warrior');
    useGameStore.setState({
      gameWon: false,
      finaleDefeated: true,
      corridorMode: false,
      storyReturnPromptVisible: false,
      isPaused: false,
    });
    placeReturnCircleOnPlayer();
  });

  it('ゴール内に居続けても自動帰還せず、離指要求で確認を開く', () => {
    useGameStore.getState().updateReturnPhase(10);
    expect(useGameStore.getState().gameWon).toBe(false);

    expect(useGameStore.getState().requestStoryReturnPrompt()).toBe(true);
    expect(useGameStore.getState().storyReturnPromptVisible).toBe(true);
    expect(useGameStore.getState().isPaused).toBe(true);
  });

  it('「いいえ」は再開、「はい」は即帰還完了', () => {
    useGameStore.getState().requestStoryReturnPrompt();
    useGameStore.getState().answerStoryReturnPrompt(false);
    expect(useGameStore.getState().storyReturnPromptVisible).toBe(false);
    expect(useGameStore.getState().isPaused).toBe(false);
    expect(useGameStore.getState().gameWon).toBe(false);
    expect(useGameStore.getState().returnCircle).not.toBeNull();

    useGameStore.getState().requestStoryReturnPrompt();
    useGameStore.getState().answerStoryReturnPrompt(true);
    expect(useGameStore.getState().storyReturnPromptVisible).toBe(false);
    expect(useGameStore.getState().gameWon).toBe(true);
    expect(useGameStore.getState().returnCircle).toBeNull();
  });

  it('ゴール外では確認を開かない', () => {
    useGameStore.setState(state => ({ player: { ...state.player, x: state.player.x + 500 } }));
    expect(useGameStore.getState().requestStoryReturnPrompt()).toBe(false);
    expect(useGameStore.getState().storyReturnPromptVisible).toBe(false);
  });
});

// ★社長指示2026-08-26「ステージ6のゴールは話したらすぐ帰還しますか?になるタイプに揃える」(v0.25.3956)
describe('M6洋館通路のゴール=離指で即confirm(EXは対象外)', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame('warrior');
    // M6通路: ボス討伐条件なし(finaleDefeated=false)でもゴールで確認が出る。
    useGameStore.setState({
      gameWon: false, finaleDefeated: false, corridorMode: true,
      storyReturnPromptVisible: false, isPaused: false, gameTime: 10_000,
    });
    placeReturnCircleOnPlayer(0, 0); // revealedAt=0=フェードは十分昔に完了済み
  });

  it('ゴール(フェード完了後)で離指要求→確認が開く', () => {
    expect(useGameStore.getState().requestStoryReturnPrompt()).toBe(true);
    expect(useGameStore.getState().storyReturnPromptVisible).toBe(true);
  });

  it('ゴールがまだフェードイン中は開かない(滞在タイマーと同じ扱い)', () => {
    placeReturnCircleOnPlayer(0, 9_900); // revealedAt=9900・gameTime=10000=フェード(700ms)未完
    expect(useGameStore.getState().requestStoryReturnPrompt()).toBe(false);
  });

  it('未告知(revealedAt無し=まだ透明)のゴールでは開かない', () => {
    placeReturnCircleOnPlayer(0);
    expect(useGameStore.getState().requestStoryReturnPrompt()).toBe(false);
  });
});

describe('既存の帰還ホールド', () => {
  beforeEach(() => {
    useGameStore.getState().resetGame('warrior');
    useGameStore.setState({ gameWon: false, finaleDefeated: false, corridorMode: false });
    placeReturnCircleOnPlayer();
  });

  it('イベント帰還は従来どおり3秒で完了する', () => {
    useGameStore.getState().updateReturnPhase(3.1);
    expect(useGameStore.getState().gameWon).toBe(true);
  });

  it('洋館通路は従来どおり5秒で完了する', () => {
    useGameStore.setState({ corridorMode: true, gameTime: 10_000 });
    placeReturnCircleOnPlayer(0, 0);
    useGameStore.getState().updateReturnPhase(4.9);
    expect(useGameStore.getState().gameWon).toBe(false);
    useGameStore.getState().updateReturnPhase(0.2);
    expect(useGameStore.getState().gameWon).toBe(true);
  });
});
