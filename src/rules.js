import {
  FIRST_EXPANDED_WIN_TARGET,
  LATER_EXPANDED_WIN_TARGET,
  WIN_DIRECTIONS,
} from './constants.js';
import { createBoard } from './state.js';

export function getNextPlayer(player) {
  return player === 'X' ? 'O' : 'X';
}

export function isBoardFull(boardData) {
  return boardData.every((row) => row.every(Boolean));
}

export function checkWin(boardData, size, winTarget, row, col) {
  const player = boardData[row]?.[col];
  if (!player) return null;

  for (const [dr, dc] of WIN_DIRECTIONS) {
    const path = [[row, col]];

    for (const direction of [1, -1]) {
      for (let step = 1; step < winTarget; step++) {
        const nextRow = row + dr * step * direction;
        const nextCol = col + dc * step * direction;

        if (
          nextRow < 0 ||
          nextRow >= size ||
          nextCol < 0 ||
          nextCol >= size ||
          boardData[nextRow][nextCol] !== player
        ) {
          break;
        }

        path.push([nextRow, nextCol]);
      }
    }

    if (path.length >= winTarget) return path;
  }

  return null;
}

export function expandBoard(state, corner) {
  const rowOffset = corner === 'tl' || corner === 'tr' ? 2 : 0;
  const colOffset = corner === 'tl' || corner === 'bl' ? 2 : 0;
  const nextSize = state.size + 2;
  const nextBoard = createBoard(nextSize);

  for (let row = 0; row < state.size; row++) {
    for (let col = 0; col < state.size; col++) {
      nextBoard[row + rowOffset][col + colOffset] = state.boardData[row][col];
    }
  }

  state.boardData = nextBoard;
  state.size = nextSize;
  state.draws += 1;
  state.winTarget =
    state.draws === 1 ? FIRST_EXPANDED_WIN_TARGET : LATER_EXPANDED_WIN_TARGET;
  state.currentPlayer = getNextPlayer(state.currentPlayer);
  state.expansionMode = true;
}

export function getPreviewOffsets(corner) {
  return {
    rowOffset: corner === 'tl' || corner === 'tr' ? 2 : 0,
    colOffset: corner === 'tl' || corner === 'bl' ? 2 : 0,
  };
}
