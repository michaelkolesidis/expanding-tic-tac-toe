import { getBestMove } from './aiEngine.js';

self.onmessage = (event) => {
  const { board, size, winTarget, aiPlayer } = event.data;
  self.postMessage({
    move: getBestMove(board, size, winTarget, aiPlayer),
  });
};
