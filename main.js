let size = 3,
  winTarget = 3,
  boardData = [],
  currentPlayer = 'X',
  isGameOver = !1,
  draws = 0,
  gameMode = 'multi',
  aiPlayer = 'O',
  aiThinking = !1,
  expansionMode = !1,
  winningPath = null,
  aiWorker = null,
  workerAvailable = !1;
try {
  ((aiWorker = new Worker('ai.js')), (workerAvailable = !0));
} catch (e) {
  console.warn('Web Worker unavailable, falling back to main-thread AI.', e);
}

function computeCellSize(e) {
  let t = document.getElementById('game-viewport');
  if (!t) return 55;
  let a = 0.92 * t.clientWidth,
    r = 0.92 * t.clientHeight,
    n = e;
  return Math.max(
    28,
    Math.min(
      55,
      Math.floor(
        Math.min((a - (n - 1) * 8 - 24) / n, (r - (n - 1) * 8 - 24) / n),
      ),
    ),
  );
}

function applyCellSize() {
  document.documentElement.style.setProperty('--cell-size', '55px');
}

function scaleBoardToFit() {
  let board = document.getElementById('board');
  let viewport = document.getElementById('game-viewport');
  if (!board || !viewport) return;

  // reset first so we measure real size
  board.style.transform = 'scale(1)';

  let boardRect = board.getBoundingClientRect();
  let vpWidth = viewport.clientWidth * 0.92;
  let vpHeight = viewport.clientHeight * 0.92;

  let scale = Math.min(
    vpWidth / boardRect.width,
    vpHeight / boardRect.height,
    1, // never upscale
  );

  board.style.transform = `scale(${scale})`;
  board.style.transformOrigin = 'center center';
}

function positionExpandButtons() {
  let board = document.getElementById('board'),
    viewport = document.getElementById('game-viewport');
  if (!board || !viewport) return;

  let boardRect = board.getBoundingClientRect();
  let vpRect = viewport.getBoundingClientRect();
  let scale = board.getBoundingClientRect().width / board.offsetWidth;

  // Always position buttons outside the expanded (size+2) board dimensions
  let baseCell =
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        '--cell-size',
      ),
    ) || 55;

  let cellSize = baseCell * scale;
  let gap = 8 * scale;
  let padding = 12 * scale;

  // Center of the current board in viewport-relative coords
  let cx = boardRect.left - vpRect.left + boardRect.width / 2;
  let cy = boardRect.top - vpRect.top + boardRect.height / 2;

  // Half-size of what the expanded board would be
  let expandedCells = size + 2;
  let expandedPx =
    expandedCells * cellSize + (expandedCells - 1) * gap + padding * 2;
  let half = expandedPx / 2;

  let btnSize = cellSize;
  let margin = gap; // small gap between expanded board edge and button

  let positions = {
    tl: {
      left: cx - half - margin - btnSize,
      top: cy - half - margin - btnSize,
    },
    tr: { left: cx + half + margin, top: cy - half - margin - btnSize },
    bl: { left: cx - half - margin - btnSize, top: cy + half + margin },
    br: { left: cx + half + margin, top: cy + half + margin },
  };

  for (let g of ['tl', 'tr', 'bl', 'br']) {
    let m = document.querySelector(`.expand-trigger.${g}`);
    if (m) {
      m.style.left = positions[g].left + 'px';
      m.style.top = positions[g].top + 'px';
      m.style.right = 'auto';
      m.style.bottom = 'auto';
    }
  }
}

function init() {
  ((boardData = Array(size)
    .fill(null)
    .map(() => Array(size).fill(''))),
    applyCellSize(),
    drawBoard(),
    maybeAIMove());
}

function drawBoard(e = null) {
  let t = e ? size + 2 : size,
    a = document.getElementById('board');
  a.style.gridTemplateColumns = `repeat(${t}, var(--cell-size))`;
  a.innerHTML = '';
  for (let r = 0; r < t; r++)
    for (let n = 0; n < t; n++) {
      let i = document.createElement('div');
      i.className = 'cell';
      let l = '',
        o = !1;
      if (e) {
        let s = r - e.rOff,
          d = n - e.cOff;
        s >= 0 && s < size && d >= 0 && d < size
          ? (l = boardData[s][d])
          : (o = !0);
      } else l = boardData[r]?.[n] ?? '';
      l && ((i.textContent = l), i.classList.add(l.toLowerCase()));
      o && i.classList.add('ghost');
      winningPath &&
        winningPath.some(([e, t]) => e === r && t === n) &&
        i.classList.add('win');
      expansionMode && i.classList.add('animating');
      !isGameOver &&
        !e &&
        r < size &&
        n < size &&
        (i.onclick = () => makeMove(r, n));
      a.appendChild(i);
    }
  requestAnimationFrame(() => {
    scaleBoardToFit();
    positionExpandButtons();
  });
}

function updateModeButtons() {
  document
    .getElementById('btn-multi')
    .classList.toggle('active-mode', gameMode === 'multi');
  document
    .getElementById('btn-ai')
    .classList.toggle('active-mode', gameMode === 'ai');
}

function setMode(e) {
  ((gameMode = e), reset());
}

function makeMove(e, t) {
  if (isGameOver || boardData[e][t]) return;
  boardData[e][t] = currentPlayer;
  let a = checkWin(e, t);
  if (a) {
    (endGame(a), drawBoard());
    return;
  }
  let r = boardData.every((e) => e.every((e) => '' !== e));
  if ((drawBoard(), r)) {
    triggerExpansionPhase();
    return;
  }
  ((currentPlayer = 'X' === currentPlayer ? 'O' : 'X'), updateStatus());
  'ai' === gameMode && currentPlayer === aiPlayer && triggerAIMove();
}

function maybeAIMove() {
  'ai' !== gameMode ||
    currentPlayer !== aiPlayer ||
    isGameOver ||
    aiThinking ||
    triggerAIMove();
}

function triggerAIMove() {
  aiThinking ||
    isGameOver ||
    ((aiThinking = !0),
    workerAvailable && aiWorker
      ? ((aiWorker.onmessage = (e) => {
          aiThinking = !1;
          let { move: t } = e.data;
          t && !isGameOver && makeMove(t[0], t[1]);
        }),
        (aiWorker.onerror = () => {
          ((workerAvailable = !1),
            (aiThinking = !1),
            setTimeout(() => {
              ((aiThinking = !0), runMainThreadAI());
            }, 50));
        }),
        aiWorker.postMessage({ board: boardData, size, winTarget, aiPlayer }))
      : setTimeout(runMainThreadAI, 50));
}

function runMainThreadAI() {
  if (isGameOver) {
    aiThinking = !1;
    return;
  }
  let e = boardData.map((e) => [...e]),
    t = getBestMove(e, size, winTarget, aiPlayer);
  if (((aiThinking = !1), !t)) {
    console.warn('AI found no move');
    return;
  }
  let [a, r] = t;
  if (boardData[a][r]) {
    console.warn('AI chose occupied cell');
    return;
  }
  makeMove(a, r);
}

function checkWin(e, t) {
  let a = boardData[e][t];
  for (let [r, n] of [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ]) {
    let i = [[e, t]];
    for (let [l, o] of [
      [r, n],
      [-r, -n],
    ])
      for (let s = 1; s < winTarget; s++) {
        let d = e + l * s,
          c = t + o * s;
        if (d >= 0 && d < size && c >= 0 && c < size && boardData[d][c] === a)
          i.push([d, c]);
        else break;
      }
    if (i.length >= winTarget) return i;
  }
  return null;
}

function endGame(e) {
  ((isGameOver = !0),
    (winningPath = e),
    document.body.classList.add('game-over'));
  let t = document.getElementById('status');
  ((t.textContent = `Player ${currentPlayer} Wins!`),
    (t.style.color = 'var(--win)'),
    (t.style.transform = 'scale(1.2)'),
    drawBoard());
}

function triggerExpansionPhase() {
  expansionMode = !0;

  let e = document.getElementById('status');
  e.textContent = 'Draw! Expand Board';
  e.style.color = currentPlayer === 'X' ? 'var(--player-x)' : 'var(--player-o)';

  requestAnimationFrame(() => {
    scaleBoardToFit(); 

    document
      .querySelectorAll('.expand-trigger')
      .forEach((btn) => btn.classList.add('visible'));

    positionExpandButtons(); 
  });
}

function doExpand(e) {
  let t = 'tl' === e || 'tr' === e ? 2 : 0,
    a = 'tl' === e || 'bl' === e ? 2 : 0,
    r = size + 2,
    n = Array(r)
      .fill(null)
      .map(() => Array(r).fill(''));
  for (let i = 0; i < size; i++)
    for (let l = 0; l < size; l++) n[i + t][l + a] = boardData[i][l];
  ((boardData = n),
    (size = r),
    (winTarget = 1 == ++draws ? 4 : 5),
    (currentPlayer = 'X' === currentPlayer ? 'O' : 'X'));
  document
    .querySelectorAll('.expand-trigger')
    .forEach((e) => e.classList.remove('visible'));
  let o = document.getElementById('instruction');
  if (
    o &&
    (o.innerHTML = `<span id="instruction-number">${winTarget}</span> in a row to win.`)
  );
  ((expansionMode = !1), applyCellSize(), updateStatus(), drawBoard());
  setTimeout(() => {
    document
      .querySelectorAll('.cell')
      .forEach((e) => e.classList.remove('animating'));
  }, 1e3);
  requestAnimationFrame(() => positionExpandButtons());
  if (workerAvailable && aiWorker) {
    aiWorker.terminate();
    try {
      aiWorker = new Worker('ai.js');
    } catch (s) {
      workerAvailable = !1;
    }
  }
  maybeAIMove();
}

function showPreview(e) {
  let t = document.getElementById('board');
  t.style.transformOrigin = `${'tl' === e || 'bl' === e ? '0%' : '100%'} ${'tl' === e || 'tr' === e ? '0%' : '100%'}`;
  drawBoard({
    rOff: 'tl' === e || 'tr' === e ? 2 : 0,
    cOff: 'tl' === e || 'bl' === e ? 2 : 0,
  });
}

function hidePreview() {
  isGameOver || drawBoard();
}

function updateStatus() {
  let e = document.getElementById('status');
  document.body.className = 'X' === currentPlayer ? 'turn-x' : 'turn-o';
  ((e.textContent = `${currentPlayer} to play`),
    (e.style.color =
      'X' === currentPlayer ? 'var(--player-x)' : 'var(--player-o)'),
    (e.style.transform = 'scale(1)'));
}

function reset() {
  ((size = 3),
    (winTarget = 3),
    (draws = 0),
    (currentPlayer = 'X'),
    (isGameOver = !1),
    (winningPath = null),
    (aiThinking = !1),
    (expansionMode = !1));
  document.body.classList.remove('game-over');
  document
    .querySelectorAll('.expand-trigger')
    .forEach((e) => e.classList.remove('visible'));
  document.getElementById('status').style.transform = 'scale(1)';
  let e = document.getElementById('instruction');
  if (
    e &&
    (e.innerHTML = '<span id="instruction-number">3</span> in a row to win.')
  );
  if (workerAvailable && aiWorker) {
    aiWorker.terminate();
    try {
      aiWorker = new Worker('ai.js');
    } catch (t) {
      workerAvailable = !1;
    }
  }
  (updateStatus(), updateModeButtons(), init());
}

window.addEventListener('resize', () => {
  scaleBoardToFit();
  positionExpandButtons();
});

document.addEventListener('DOMContentLoaded', () => {
  for (let e of ['tl', 'tr', 'bl', 'br']) {
    let t = document.querySelector(`.expand-trigger.${e}`);
    t &&
      (t.addEventListener('mouseenter', () => showPreview(e)),
      t.addEventListener('mouseleave', () => hidePreview()),
      t.addEventListener('click', () => doExpand(e)),
      t.addEventListener(
        'touchstart',
        (t) => {
          (t.preventDefault(), doExpand(e));
        },
        { passive: !1 },
      ));
  }
  document
    .getElementById('btn-multi')
    .addEventListener('click', () => setMode('multi'));
  document.getElementById('btn-reset').addEventListener('click', () => reset());
  document
    .getElementById('btn-ai')
    .addEventListener('click', () => setMode('ai'));
  document.addEventListener('keydown', (e) => {
    'INPUT' !== e.target.tagName &&
      'TEXTAREA' !== e.target.tagName &&
      ('Space' === e.code || 'Enter' === e.code) &&
      (e.preventDefault(), reset());
  });

  updateModeButtons();
  init();
});
