/**
 *    ai.js
 *    Expanding Tic-Tac-Toe AI Engine
 *
 *    Algorithm: Iterative Deepening Minimax with Alpha-Beta Pruning
 *    ----------------------------------------------------------------
 *    The AI uses a combination of well-known game-tree search techniques:
 *
 *    Minmax
 *    Classic adversarial search that assumes both players play optimally.
 *    The AI (maximiser) tries to maximise the score; the human (minimiser)
 *    tries to minimise it.
 *
 *    Alpha-Beta Pruning
 *    An optimisation that cuts off branches that cannot possibly influence
 *    the final decision. This allows the AI to search roughly twice as deep
 *    as plain minimax in the same time budget.
 *
 *    Iterative deepening depth-first search
 *    The AI searches depth 1, then 2, then 3, … until the time budget
 *    expires. The best move from the previous iteration guides move ordering
 *    in the next, making each iteration much cheaper. If time runs out
 *    mid-search, the last *complete* depth's best move is returned -> the AI
 *    always has a valid answer.
 *
 *    Transposition Table (Zobrist hashing)
 *    Many board positions can be reached by different move sequences. A hash
 *    map (transposition table) caches previously evaluated positions so they
 *    are never evaluated twice. Zobrist hashing produces a fast, collision-
 *    resistant 32-bit key for every board state.
 *
 *    Move ordering
 *    Moves closer to existing pieces are tried first (they are almost always
 *    stronger). The best move from the previous iterative-deepening pass is
 *    always tried first. Good ordering makes alpha-beta cut off ~90 % of the
 *    tree.
 *
 *    Threat-based static evaluation
 *    When the search reaches its depth limit (or time budget), a heuristic
 *    evaluates the board by counting "threats": consecutive runs of the same
 *    player's pieces with open ends. Longer runs and more open ends are worth
 *    exponentially more.  The human's threats are subtracted from the AI's.
 *
 *    Immediate Win/Block
 *    Before the full search, the AI scans for any move that wins immediately
 *    or blocks the human from winning on the next move. This is O(moves) and
 *    essentially free.
 *
 *    Web Worker Interface
 *    --------------------
 *    When this file is loaded as a Web Worker (self !== window) it listens for
 *    a postMessage with { board, size, winTarget, aiPlayer } and responds with
 *    { move: [r, c] }.
 *
 *    When loaded as a normal <script> it exposes getBestMove() globally so the
 *    main thread can call it directly as a fallback (browsers that block workers
 *    from file:// URLs, etc.).
 */

// Worker Entry Point
if (typeof self !== 'undefined' && typeof window === 'undefined') {
  // Running inside a Web Worker
  self.onmessage = function (e) {
    const { board, size, winTarget, aiPlayer } = e.data;
    const move = getBestMove(board, size, winTarget, aiPlayer);
    self.postMessage({ move });
  };
}

// Main AI Function
function getBestMove(board, size, winTarget, aiPlayer) {
  const human = aiPlayer === 'X' ? 'O' : 'X';

  // Time budget in milliseconds
  const TIME_BUDGET_MS = 1200;
  const startTime = Date.now();
  let timeUp = false;

  // Flat board for speed (avoid 2-D array indexing overhead)
  // flat[r * size + c]  →  '' | 'X' | 'O'
  const flat = new Array(size * size);
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) flat[r * size + c] = board[r][c];

  const idx = (r, c) => r * size + c;
  const inBounds = (r, c) => r >= 0 && r < size && c >= 0 && c < size;

  const DIRS = [
    [0, 1], // horizontal
    [1, 0], // vertical
    [1, 1], // diagonal ↘
    [1, -1], // diagonal ↙
  ];

  // Zobrist hashing
  // Pre-generate random 32-bit integers for each (cell, player) pair.
  // XOR them together to get a board hash that updates in O(1) per move.
  const zobristX = new Int32Array(size * size);
  const zobristO = new Int32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    zobristX[i] = (Math.random() * 0xffffffff) | 0;
    zobristO[i] = (Math.random() * 0xffffffff) | 0;
  }

  // Build initial hash from the current board state
  let boardHash = 0;
  for (let i = 0; i < flat.length; i++) {
    if (flat[i] === aiPlayer) boardHash ^= zobristX[i];
    else if (flat[i] === human) boardHash ^= zobristO[i];
  }

  // Transposition table: Map<hash, {depth, flag, score, bestMove}>
  // flag: 0 = exact, 1 = lower-bound (alpha), 2 = upper-bound (beta)
  const tt = new Map();

  // Win detection
  // Checks whether `player` has already won on the flat board.
  // O(size²) -> called only at root and in terminal checks.
  function hasWon(player) {
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (flat[idx(r, c)] !== player) continue;
        for (const [dr, dc] of DIRS) {
          let count = 1;
          for (let i = 1; i < winTarget; i++) {
            const nr = r + dr * i,
              nc = c + dc * i;
            if (inBounds(nr, nc) && flat[idx(nr, nc)] === player) count++;
            else break;
          }
          if (count >= winTarget) return true;
        }
      }
    }
    return false;
  }

  // Checks whether the last move at (r,c) by `player` won the game.
  // Much faster than hasWon() -> only checks lines through (r,c).
  function checkWinAt(r, c, player) {
    for (const [dr, dc] of DIRS) {
      let count = 1;
      for (let i = 1; i < winTarget; i++) {
        const nr = r + dr * i,
          nc = c + dc * i;
        if (inBounds(nr, nc) && flat[idx(nr, nc)] === player) count++;
        else break;
      }
      for (let i = 1; i < winTarget; i++) {
        const nr = r - dr * i,
          nc = c - dc * i;
        if (inBounds(nr, nc) && flat[idx(nr, nc)] === player) count++;
        else break;
      }
      if (count >= winTarget) return true;
    }
    return false;
  }

  // Move Generation
  // Candidate moves are empty cells that have at least one occupied neighbour.
  // This dramatically reduces the branching factor on large boards while never
  // missing a relevant move. Falls back to all empty cells if the board is
  // empty or the neighbour filter returns nothing.
  function getMoves() {
    const moves = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (flat[idx(r, c)]) continue;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const nr = r + dr,
              nc = c + dc;
            if (inBounds(nr, nc) && flat[idx(nr, nc)]) {
              moves.push([r, c]);
              dr = dc = 2; // break both inner loops
            }
          }
        }
      }
    }
    if (moves.length === 0) {
      // Fallback: board is empty or fully surrounded -> return all empties
      for (let r = 0; r < size; r++)
        for (let c = 0; c < size; c++) if (!flat[idx(r, c)]) moves.push([r, c]);
    }
    return moves;
  }

  // Static evaluation (heuristic)

  // Scores a run of `count` pieces with `openEnds` free ends.
  // Values are tuned so that:
  //  - An immediate win is worth more than any non-terminal position
  //  - A "4 in a row open both ends" forces a win next move
  //  - Double threats (two separate winning threats) are very valuable
  function scoreRun(count, openEnds) {
    if (openEnds === 0) return 0; // dead end -> worthless
    if (count >= winTarget) return 1e7; // terminal (shouldn't appear in eval)

    const gap = winTarget - count; // how many more pieces needed
    if (gap === 1) {
      return openEnds === 2 ? 100000 : 10000; // one move from win
    }
    if (gap === 2) {
      return openEnds === 2 ? 3000 : 500;
    }
    if (gap === 3) {
      return openEnds === 2 ? 200 : 30;
    }
    return openEnds * 5;
  }

  // Full heuristic evaluation of the flat board from the AI's perspective.
  // Scans every cell in every direction, accumulating threat scores for both
  // players.  Human threats are subtracted from AI threats.
  function evaluate() {
    let aiScore = 0,
      humanScore = 0;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const owner = flat[idx(r, c)];
        if (!owner) continue;

        for (const [dr, dc] of DIRS) {
          // Only start a run at its leftmost / topmost cell to avoid counting
          // the same run multiple times.
          const pr = r - dr,
            pc = c - dc;
          if (inBounds(pr, pc) && flat[idx(pr, pc)] === owner) continue;

          let count = 0;
          let nr = r,
            nc = c;
          while (inBounds(nr, nc) && flat[idx(nr, nc)] === owner) {
            count++;
            nr += dr;
            nc += dc;
          }

          let openEnds = 0;
          const backR = r - dr,
            backC = c - dc;
          if (inBounds(backR, backC) && flat[idx(backR, backC)] === '')
            openEnds++;
          if (inBounds(nr, nc) && flat[idx(nr, nc)] === '') openEnds++;

          const s = scoreRun(count, openEnds);
          if (owner === aiPlayer) aiScore += s;
          else humanScore += s;
        }
      }
    }

    return aiScore - humanScore;
  }

  // Minimax with alpha-beta + transposition table
  /**
   * @param {number} depth    Remaining depth to search
   * @param {number} alpha    Best score the maximiser is guaranteed
   * @param {number} beta     Best score the minimiser is guaranteed
   * @param {boolean} maxing  True when it is the AI's turn
   * @param {number} lastR    Row of the last move (for fast win check)
   * @param {number} lastC    Col of the last move
   * @param {string} lastP    Player who just moved
   * @returns {number}        Score of the position
   */
  function minimax(depth, alpha, beta, maxing, lastR, lastC, lastP) {
    // Time guard -> abort search if budget exceeded
    if ((depth & 3) === 0 && Date.now() - startTime > TIME_BUDGET_MS) {
      timeUp = true;
      return evaluate();
    }

    // Terminal: did the last move win?
    if (lastR !== -1 && checkWinAt(lastR, lastC, lastP)) {
      const dist = depth === 0 ? 1 : depth;
      return lastP === aiPlayer ? 1e7 - dist : -1e7 + dist;
    }

    // Depth limit -> static evaluation
    if (depth === 0) return evaluate();

    // Transposition table lookup
    const ttEntry = tt.get(boardHash);
    if (ttEntry && ttEntry.depth >= depth) {
      if (ttEntry.flag === 0) return ttEntry.score;
      if (ttEntry.flag === 1 && ttEntry.score > alpha) alpha = ttEntry.score;
      if (ttEntry.flag === 2 && ttEntry.score < beta) beta = ttEntry.score;
      if (alpha >= beta) return ttEntry.score;
    }

    const moves = getMoves();
    if (moves.length === 0) return 0; // full board draw (shouldn't happen -> expansion prevents it)

    // Move ordering: score each candidate move quickly and sort descending
    // so the most promising moves are searched first (improves α-β cutoffs).
    const scored = moves.map(([r, c]) => {
      const player = maxing ? aiPlayer : human;
      flat[idx(r, c)] = player;
      const s = evaluate();
      flat[idx(r, c)] = '';
      // Bias toward the centre and toward existing pieces (already guaranteed
      // by getMoves) -> a small positional bonus for cells nearer the middle.
      const dr = r - (size - 1) / 2;
      const dc = c - (size - 1) / 2;
      const centrality = -Math.sqrt(dr * dr + dc * dc);
      return { r, c, score: s + centrality };
    });

    // For the maximiser, sort high-to-low; for minimiser, sort low-to-high
    if (maxing) scored.sort((a, b) => b.score - a.score);
    else scored.sort((a, b) => a.score - b.score);

    // If the TT had a best move from a previous search, try it first
    if (ttEntry && ttEntry.bestMove) {
      const [br, bc] = ttEntry.bestMove;
      const existingIdx = scored.findIndex((m) => m.r === br && m.c === bc);
      if (existingIdx > 0) {
        const [best] = scored.splice(existingIdx, 1);
        scored.unshift(best);
      }
    }

    let bestScore = maxing ? -Infinity : Infinity;
    let bestMove = null;
    const originalAlpha = alpha;

    for (const { r, c } of scored) {
      if (timeUp) break;

      const player = maxing ? aiPlayer : human;
      const z = player === aiPlayer ? zobristX[idx(r, c)] : zobristO[idx(r, c)];
      flat[idx(r, c)] = player;
      boardHash ^= z;

      const score = minimax(depth - 1, alpha, beta, !maxing, r, c, player);

      flat[idx(r, c)] = '';
      boardHash ^= z;

      if (maxing) {
        if (score > bestScore) {
          bestScore = score;
          bestMove = [r, c];
        }
        if (score > alpha) alpha = score;
      } else {
        if (score < bestScore) {
          bestScore = score;
          bestMove = [r, c];
        }
        if (score < beta) beta = score;
      }

      if (alpha >= beta) break; // α-β cut-off
    }

    // Store result in transposition table
    let flag = 0; // exact
    if (bestScore <= originalAlpha)
      flag = 2; // upper-bound (failed low)
    else if (bestScore >= beta) flag = 1; // lower-bound (failed high)
    tt.set(boardHash, { depth, flag, score: bestScore, bestMove });

    return bestScore;
  }

  // Iterative deepening driver
  const allMoves = getMoves();
  if (allMoves.length === 0) return null;
  if (allMoves.length === 1) return allMoves[0];

  // Immediate win check
  for (const [r, c] of allMoves) {
    flat[idx(r, c)] = aiPlayer;
    const win = checkWinAt(r, c, aiPlayer);
    flat[idx(r, c)] = '';
    if (win) return [r, c];
  }

  // Immediate block check (human would win next move)
  for (const [r, c] of allMoves) {
    flat[idx(r, c)] = human;
    const win = checkWinAt(r, c, human);
    flat[idx(r, c)] = '';
    if (win) return [r, c];
  }

  // Iterative deepening minimax
  let bestMove = allMoves[0];
  let maxDepth = size <= 5 ? 8 : size <= 7 ? 6 : 4;

  for (let depth = 1; depth <= maxDepth && !timeUp; depth++) {
    let depthBest = null;
    let depthBestScore = -Infinity;

    // Score all moves at this depth
    const scoredMoves = [];
    for (const [r, c] of allMoves) {
      if (timeUp) break;
      const z = zobristX[idx(r, c)];
      flat[idx(r, c)] = aiPlayer;
      boardHash ^= z;

      const score = minimax(
        depth - 1,
        -Infinity,
        Infinity,
        false,
        r,
        c,
        aiPlayer,
      );

      flat[idx(r, c)] = '';
      boardHash ^= z;

      scoredMoves.push({ r, c, score });

      if (score > depthBestScore) {
        depthBestScore = score;
        depthBest = [r, c];
      }

      // Instant win found -> no need to search deeper
      if (score >= 1e7) break;
    }

    if (!timeUp && depthBest) {
      bestMove = depthBest;

      // Re-sort allMoves for next iteration (move ordering)
      scoredMoves.sort((a, b) => b.score - a.score);
      allMoves.length = 0;
      for (const { r, c } of scoredMoves) allMoves.push([r, c]);
    }
  }

  return bestMove;
}
