import { BOARD_PADDING, CELL_GAP, CELL_SIZE } from './constants.js';

export function createUi({ onCellClick }) {
  let boardScale = 1;
  let fitGridSize = 3;

  const elements = {
    board: document.getElementById('board'),
    viewport: document.getElementById('game-viewport'),
    status: document.getElementById('status'),
    instruction: document.getElementById('instruction'),
    btnMulti: document.getElementById('btn-multi'),
    btnReset: document.getElementById('btn-reset'),
    btnAi: document.getElementById('btn-ai'),
    rulesPanel: document.getElementById('rules-panel'),
    dontShowRules: document.getElementById('dont-show-rules'),
    closeRules: document.getElementById('close-rules'),
  };

  function drawBoard(state, preview = null) {
    const gridSize = preview ? state.size + 2 : state.size;
    fitGridSize = state.expansionMode ? state.size + 2 : gridSize;
    elements.board.classList.add('dom-board');
    elements.board.style.gridTemplateColumns = `repeat(${gridSize}, var(--cell-size))`;
    elements.board.replaceChildren();

    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const { cellData, isGhost } = getCellRenderData(state, preview, row, col);
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cell';
        cell.setAttribute('aria-label', cellData ? `${cellData} at ${row + 1}, ${col + 1}` : `Empty cell ${row + 1}, ${col + 1}`);

        if (cellData) {
          cell.textContent = cellData;
          cell.classList.add(cellData.toLowerCase());
        }

        if (isGhost) cell.classList.add('ghost');
        if (state.winningPath?.some(([winRow, winCol]) => winRow === row && winCol === col)) {
          cell.classList.add('win');
        }
        if (state.expansionMode && !isGhost) cell.classList.add('animating');

        const isPlayable =
          !state.isGameOver &&
          !state.expansionMode &&
          !preview &&
          !isGhost &&
          !cellData &&
          !(state.gameMode === 'ai' && state.currentPlayer === state.aiPlayer);

        cell.disabled = !isPlayable;
        if (isPlayable) {
          cell.addEventListener('click', () => onCellClick(row, col));
        }

        elements.board.appendChild(cell);
      }
    }

    requestAnimationFrame(() => {
      scaleBoardToFit();
      positionExpandButtons(state.size);
    });
  }

  function scaleBoardToFit() {
    if (!elements.board || !elements.viewport) return;

    const naturalWidth = fitGridSize * CELL_SIZE + (fitGridSize - 1) * CELL_GAP + BOARD_PADDING * 2;
    const naturalHeight = naturalWidth;
    const viewportWidth = elements.viewport.clientWidth * 0.92;
    const viewportHeight = elements.viewport.clientHeight * 0.92;
    const nextScale = Math.min(viewportWidth / naturalWidth, viewportHeight / naturalHeight, 1);
    boardScale = Number.isFinite(nextScale) ? Math.max(0.1, nextScale) : 1;

    elements.viewport.style.setProperty('--cell-size', `${CELL_SIZE * boardScale}px`);
    elements.viewport.style.setProperty('--cell-gap', `${CELL_GAP * boardScale}px`);
    elements.viewport.style.setProperty('--board-padding', `${BOARD_PADDING * boardScale}px`);
  }

  function positionExpandButtons(size) {
    if (!elements.board || !elements.viewport) return;

    const boardRect = elements.board.getBoundingClientRect();
    const viewportRect = elements.viewport.getBoundingClientRect();

    const cellSize = CELL_SIZE * boardScale;
    const gap = CELL_GAP * boardScale;
    const padding = BOARD_PADDING * boardScale;

    const centerX = boardRect.left - viewportRect.left + boardRect.width / 2;
    const centerY = boardRect.top - viewportRect.top + boardRect.height / 2;
    const expandedCells = size + 2;
    const expandedPixels = expandedCells * cellSize + (expandedCells - 1) * gap + padding * 2;
    const half = expandedPixels / 2;
    const left = centerX - half + padding;
    const right = centerX + half - padding - cellSize;
    const top = centerY - half + padding;
    const bottom = centerY + half - padding - cellSize;

    const positions = {
      tl: { left, top },
      tr: { left: right, top },
      bl: { left, top: bottom },
      br: { left: right, top: bottom },
    };

    for (const corner of Object.keys(positions)) {
      const button = document.querySelector(`.expand-trigger.${corner}`);
      if (!button) continue;
      button.style.left = `${positions[corner].left}px`;
      button.style.top = `${positions[corner].top}px`;
      button.style.right = 'auto';
      button.style.bottom = 'auto';
    }
  }

  function updateStatus(state) {
    document.body.classList.toggle('turn-x', state.currentPlayer === 'X');
    document.body.classList.toggle('turn-o', state.currentPlayer === 'O');
    elements.status.textContent = `${state.currentPlayer} to play`;
    elements.status.style.color = state.currentPlayer === 'X' ? 'var(--player-x)' : 'var(--player-o)';
    elements.status.style.transform = 'scale(1)';
  }

  function showWinner(state) {
    document.body.classList.add('game-over');
    elements.status.textContent = `Player ${state.currentPlayer} Wins!`;
    elements.status.style.color = 'var(--win)';
    elements.status.style.transform = 'scale(1.2)';
  }

  function showDrawPrompt(state) {
    fitGridSize = state.size + 2;
    elements.status.textContent = 'Draw! Expand Board';
    elements.status.style.color = state.currentPlayer === 'X' ? 'var(--player-x)' : 'var(--player-o)';
    requestAnimationFrame(() => {
      scaleBoardToFit();
      setExpansionControlsVisible(true);
      positionExpandButtons(state.size);
    });
  }

  function updateInstruction(target, animate = false) {
    elements.instruction.innerHTML = `<span id="instruction-number">${target}</span> in a row to win.`;
    const number = document.getElementById('instruction-number');
    if (!animate || !number) return;

    number.classList.remove('changed');
    void number.offsetWidth;
    number.classList.add('changed');
    setTimeout(() => number.classList.remove('changed'), 2000);
  }

  function updateModeButtons(gameMode) {
    const isMultiActive = gameMode === 'multi';
    const isAiActive = gameMode === 'ai';

    elements.btnMulti.classList.toggle('active-mode', isMultiActive);
    elements.btnMulti.disabled = isMultiActive;
    elements.btnAi.classList.toggle('active-mode', isAiActive);
    elements.btnAi.disabled = isAiActive;
  }

  function setExpansionControlsVisible(visible) {
    document
      .querySelectorAll('.expand-trigger')
      .forEach((button) => {
        button.classList.toggle('visible', visible);
        button.disabled = !visible;
        button.setAttribute('aria-hidden', String(!visible));
      });
  }

  function resetVisualState() {
    document.body.classList.remove('game-over');
    setExpansionControlsVisible(false);
    elements.status.style.transform = 'scale(1)';
  }

  function showExpansionPreview(corner, state, preview) {
    elements.board.style.transformOrigin = `${corner === 'tl' || corner === 'bl' ? '0%' : '100%'} ${
      corner === 'tl' || corner === 'tr' ? '0%' : '100%'
    }`;
    drawBoard(state, preview);
  }

  function configureRulesPanel() {
    elements.closeRules.addEventListener('click', () => {
      if (elements.dontShowRules.checked) localStorage.setItem('hideRules', '1');
      elements.rulesPanel.hidden = true;
    });

    elements.rulesPanel.hidden = Boolean(localStorage.getItem('hideRules'));
  }

  return {
    elements,
    drawBoard,
    scaleBoardToFit,
    positionExpandButtons,
    updateStatus,
    showWinner,
    showDrawPrompt,
    updateInstruction,
    updateModeButtons,
    setExpansionControlsVisible,
    resetVisualState,
    showExpansionPreview,
    configureRulesPanel,
  };
}

function getCellRenderData(state, preview, row, col) {
  if (!preview) {
    return {
      cellData: state.boardData[row]?.[col] ?? '',
      isGhost: false,
    };
  }

  const sourceRow = row - preview.rowOffset;
  const sourceCol = col - preview.colOffset;
  const isExistingCell =
    sourceRow >= 0 &&
    sourceRow < state.size &&
    sourceCol >= 0 &&
    sourceCol < state.size;

  return {
    cellData: isExistingCell ? state.boardData[sourceRow][sourceCol] : '',
    isGhost: !isExistingCell,
  };
}
