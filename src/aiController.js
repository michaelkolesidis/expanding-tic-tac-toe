import { AI_MOVE_MIN_DELAY } from './constants.js';
import { getBestMove } from './aiEngine.js';
import { cloneBoard } from './state.js';

export function createAiController(state, { onMove }) {
  let worker = createWorker();
  let workerAvailable = Boolean(worker);

  function maybeMove() {
    if (
      state.gameMode !== 'ai' ||
      state.currentPlayer !== state.aiPlayer ||
      state.isGameOver ||
      state.aiThinking
    ) {
      return;
    }

    triggerMove();
  }

  function triggerMove() {
    if (state.aiThinking || state.isGameOver) return;

    state.aiThinking = true;
    const startedAt = performance.now();
    const requestId = ++state.aiMoveRequestId;
    const payload = {
      board: cloneBoard(state.boardData),
      size: state.size,
      winTarget: state.winTarget,
      aiPlayer: state.aiPlayer,
    };

    if (workerAvailable && worker) {
      worker.onmessage = (event) => scheduleMove(event.data.move, startedAt, requestId);
      worker.onerror = () => {
        workerAvailable = false;
        terminateWorker();
        runMainThreadAi(payload, startedAt, requestId);
      };
      worker.postMessage(payload);
    } else {
      setTimeout(() => runMainThreadAi(payload, startedAt, requestId), 50);
    }
  }

  function scheduleMove(move, startedAt, requestId) {
    const wait = Math.max(0, AI_MOVE_MIN_DELAY - (performance.now() - startedAt));

    setTimeout(() => {
      if (requestId !== state.aiMoveRequestId) return;
      state.aiThinking = false;
      if (!move || state.isGameOver || state.currentPlayer !== state.aiPlayer) return;
      onMove(move[0], move[1], true);
    }, wait);
  }

  function runMainThreadAi(payload, startedAt, requestId) {
    if (state.isGameOver) {
      state.aiThinking = false;
      return;
    }

    const move = getBestMove(payload.board, payload.size, payload.winTarget, payload.aiPlayer);
    scheduleMove(move, startedAt, requestId);
  }

  function restartWorker() {
    terminateWorker();
    worker = createWorker();
    workerAvailable = Boolean(worker);
  }

  function cancelPendingMove() {
    state.aiThinking = false;
    state.aiMoveRequestId += 1;
  }

  function terminateWorker() {
    worker?.terminate();
    worker = null;
  }

  return {
    maybeMove,
    triggerMove,
    restartWorker,
    cancelPendingMove,
  };
}

function createWorker() {
  try {
    return new Worker(new URL('./aiWorker.js', import.meta.url), { type: 'module' });
  } catch (error) {
    console.warn('Web Worker unavailable, falling back to main-thread AI.', error);
    return null;
  }
}
