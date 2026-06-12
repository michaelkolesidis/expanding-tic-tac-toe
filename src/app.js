import { EXPANSION_CORNERS, INITIAL_WIN_TARGET } from './constants.js';
import { createAiController } from './aiController.js';
import { checkWin, expandBoard, getNextPlayer, getPreviewOffsets, isBoardFull } from './rules.js';
import { createGameState, resetGameState } from './state.js';
import { createUi } from './ui.js';

export function startApp() {
  const state = createGameState();
  let ui;
  let ai;

  function makeMove(row, col, isAiMove = false) {
    if (state.isGameOver || state.boardData[row]?.[col]) return;
    if (state.expansionMode) return;
    if (state.gameMode === 'ai' && state.currentPlayer === state.aiPlayer && !isAiMove) return;

    state.boardData[row][col] = state.currentPlayer;

    const winningPath = checkWin(state.boardData, state.size, state.winTarget, row, col);
    if (winningPath) {
      state.isGameOver = true;
      state.winningPath = winningPath;
      ui.showWinner(state);
      ui.drawBoard(state);
      return;
    }

    if (isBoardFull(state.boardData)) {
      ui.drawBoard(state);
      triggerExpansionPhase();
      return;
    }

    state.currentPlayer = getNextPlayer(state.currentPlayer);
    ui.updateStatus(state);
    ui.drawBoard(state);
    ai.maybeMove();
  }

  function triggerExpansionPhase() {
    state.expansionMode = true;
    ui.showDrawPrompt(state);
  }

  function doExpand(corner) {
    if (!state.expansionMode || state.isGameOver) return;

    expandBoard(state, corner);
    ui.setExpansionControlsVisible(false);
    ui.updateInstruction(state.winTarget, true);
    ui.updateStatus(state);
    ui.drawBoard(state);
    ai.restartWorker();

    setTimeout(() => {
      state.expansionMode = false;
      ui.drawBoard(state);
      ai.maybeMove();
    }, 1000);
  }

  function reset() {
    ai.cancelPendingMove();
    resetGameState(state);
    ui.resetVisualState();
    ui.updateInstruction(INITIAL_WIN_TARGET);
    ai.restartWorker();
    ui.updateStatus(state);
    ui.updateModeButtons(state.gameMode);
    ui.drawBoard(state);
    ai.maybeMove();
  }

  function setMode(mode) {
    if (state.gameMode === mode) return;

    state.gameMode = mode;
    reset();
  }

  function bindEvents() {
    for (const corner of EXPANSION_CORNERS) {
      const trigger = document.querySelector(`.expand-trigger.${corner}`);
      if (!trigger) continue;

      trigger.addEventListener('mouseenter', () => {
        if (!state.expansionMode || state.isGameOver) return;
        ui.showExpansionPreview(corner, state, getPreviewOffsets(corner));
      });
      trigger.addEventListener('mouseleave', () => {
        if (!state.isGameOver && state.expansionMode) ui.drawBoard(state);
      });
      trigger.addEventListener('click', () => doExpand(corner));
      trigger.addEventListener(
        'touchstart',
        (event) => {
          event.preventDefault();
          doExpand(corner);
        },
        { passive: false },
      );
    }

    ui.elements.btnMulti.addEventListener('click', () => setMode('multi'));
    ui.elements.btnReset.addEventListener('click', reset);
    ui.elements.btnAi.addEventListener('click', () => setMode('ai'));

    document.addEventListener('keydown', (event) => {
      const tagName = event.target.tagName;
      if ((tagName === 'INPUT' || tagName === 'TEXTAREA') || !['Space', 'Enter'].includes(event.code)) return;
      event.preventDefault();
      reset();
    });

    window.addEventListener('resize', () => {
      ui.scaleBoardToFit();
      ui.positionExpandButtons(state.size);
    });
  }

  ui = createUi({ onCellClick: makeMove });
  ai = createAiController(state, { onMove: makeMove });

  bindEvents();
  ui.configureRulesPanel();
  ui.updateStatus(state);
  ui.updateModeButtons(state.gameMode);

  document.fonts.ready.finally(() => {
    ui.drawBoard(state);
    ai.maybeMove();
  });
}
