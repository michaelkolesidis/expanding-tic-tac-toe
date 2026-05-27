import { AI_PLAYER, INITIAL_SIZE, INITIAL_WIN_TARGET } from './constants.js';

export function createGameState() {
  return {
    size: INITIAL_SIZE,
    winTarget: INITIAL_WIN_TARGET,
    boardData: createBoard(INITIAL_SIZE),
    currentPlayer: 'X',
    isGameOver: false,
    draws: 0,
    gameMode: 'multi',
    aiPlayer: AI_PLAYER,
    aiThinking: false,
    expansionMode: false,
    winningPath: null,
    aiMoveRequestId: 0,
  };
}

export function resetGameState(state) {
  state.size = INITIAL_SIZE;
  state.winTarget = INITIAL_WIN_TARGET;
  state.boardData = createBoard(INITIAL_SIZE);
  state.currentPlayer = 'X';
  state.isGameOver = false;
  state.draws = 0;
  state.aiThinking = false;
  state.expansionMode = false;
  state.winningPath = null;
  state.aiMoveRequestId += 1;
}

export function createBoard(size) {
  return Array.from({ length: size }, () => Array(size).fill(''));
}

export function cloneBoard(board) {
  return board.map((row) => [...row]);
}
