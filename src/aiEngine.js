export function getBestMove(board, size, winTarget, aiPlayer) {
  const human = aiPlayer === 'X' ? 'O' : 'X';
  const timeBudgetMs = 1200;
  const startTime = Date.now();
  let timeUp = false;

  const flat = new Array(size * size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) flat[index(row, col)] = board[row][col];
  }

  function index(row, col) {
    return row * size + col;
  }

  function inBounds(row, col) {
    return row >= 0 && row < size && col >= 0 && col < size;
  }

  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  const zobristX = new Int32Array(size * size);
  const zobristO = new Int32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    zobristX[i] = (Math.random() * 0xffffffff) | 0;
    zobristO[i] = (Math.random() * 0xffffffff) | 0;
  }

  let boardHash = 0;
  for (let i = 0; i < flat.length; i++) {
    if (flat[i] === aiPlayer) boardHash ^= zobristX[i];
    else if (flat[i] === human) boardHash ^= zobristO[i];
  }

  const transpositionTable = new Map();

  function checkWinAt(row, col, player) {
    for (const [dr, dc] of directions) {
      let count = 1;

      for (let step = 1; step < winTarget; step++) {
        const nextRow = row + dr * step;
        const nextCol = col + dc * step;
        if (inBounds(nextRow, nextCol) && flat[index(nextRow, nextCol)] === player) count++;
        else break;
      }

      for (let step = 1; step < winTarget; step++) {
        const nextRow = row - dr * step;
        const nextCol = col - dc * step;
        if (inBounds(nextRow, nextCol) && flat[index(nextRow, nextCol)] === player) count++;
        else break;
      }

      if (count >= winTarget) return true;
    }

    return false;
  }

  function getMoves() {
    const moves = [];

    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if (flat[index(row, col)]) continue;

        let hasNeighbor = false;
        for (let dr = -1; dr <= 1 && !hasNeighbor; dr++) {
          for (let dc = -1; dc <= 1 && !hasNeighbor; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nextRow = row + dr;
            const nextCol = col + dc;
            hasNeighbor = inBounds(nextRow, nextCol) && Boolean(flat[index(nextRow, nextCol)]);
          }
        }

        if (hasNeighbor) moves.push([row, col]);
      }
    }

    if (moves.length === 0) {
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          if (!flat[index(row, col)]) moves.push([row, col]);
        }
      }
    }

    return moves;
  }

  function scoreRun(count, openEnds) {
    if (openEnds === 0) return 0;
    if (count >= winTarget) return 1e7;

    const gap = winTarget - count;
    if (gap === 1) return openEnds === 2 ? 100000 : 10000;
    if (gap === 2) return openEnds === 2 ? 3000 : 500;
    if (gap === 3) return openEnds === 2 ? 200 : 30;
    return openEnds * 5;
  }

  function evaluate() {
    let aiScore = 0;
    let humanScore = 0;

    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const owner = flat[index(row, col)];
        if (!owner) continue;

        for (const [dr, dc] of directions) {
          const prevRow = row - dr;
          const prevCol = col - dc;
          if (inBounds(prevRow, prevCol) && flat[index(prevRow, prevCol)] === owner) continue;

          let count = 0;
          let nextRow = row;
          let nextCol = col;

          while (inBounds(nextRow, nextCol) && flat[index(nextRow, nextCol)] === owner) {
            count++;
            nextRow += dr;
            nextCol += dc;
          }

          let openEnds = 0;
          if (inBounds(prevRow, prevCol) && flat[index(prevRow, prevCol)] === '') openEnds++;
          if (inBounds(nextRow, nextCol) && flat[index(nextRow, nextCol)] === '') openEnds++;

          const score = scoreRun(count, openEnds);
          if (owner === aiPlayer) aiScore += score;
          else humanScore += score;
        }
      }
    }

    return aiScore - humanScore;
  }

  function minimax(depth, alpha, beta, maxing, lastRow, lastCol, lastPlayer) {
    if ((depth & 3) === 0 && Date.now() - startTime > timeBudgetMs) {
      timeUp = true;
      return evaluate();
    }

    if (lastRow !== -1 && checkWinAt(lastRow, lastCol, lastPlayer)) {
      const distance = depth === 0 ? 1 : depth;
      return lastPlayer === aiPlayer ? 1e7 - distance : -1e7 + distance;
    }

    if (depth === 0) return evaluate();

    const tableEntry = transpositionTable.get(boardHash);
    if (tableEntry && tableEntry.depth >= depth) {
      if (tableEntry.flag === 0) return tableEntry.score;
      if (tableEntry.flag === 1 && tableEntry.score > alpha) alpha = tableEntry.score;
      if (tableEntry.flag === 2 && tableEntry.score < beta) beta = tableEntry.score;
      if (alpha >= beta) return tableEntry.score;
    }

    const moves = getMoves();
    if (moves.length === 0) return 0;

    const scoredMoves = moves.map(([row, col]) => {
      const player = maxing ? aiPlayer : human;
      flat[index(row, col)] = player;
      const score = evaluate();
      flat[index(row, col)] = '';
      const centerRowDelta = row - (size - 1) / 2;
      const centerColDelta = col - (size - 1) / 2;
      const centrality = -Math.sqrt(centerRowDelta * centerRowDelta + centerColDelta * centerColDelta);
      return { row, col, score: score + centrality };
    });

    scoredMoves.sort((a, b) => (maxing ? b.score - a.score : a.score - b.score));

    if (tableEntry?.bestMove) {
      const [bestRow, bestCol] = tableEntry.bestMove;
      const existingIndex = scoredMoves.findIndex((move) => move.row === bestRow && move.col === bestCol);
      if (existingIndex > 0) {
        const [best] = scoredMoves.splice(existingIndex, 1);
        scoredMoves.unshift(best);
      }
    }

    let bestScore = maxing ? -Infinity : Infinity;
    let bestMove = null;
    const originalAlpha = alpha;

    for (const { row, col } of scoredMoves) {
      if (timeUp) break;

      const player = maxing ? aiPlayer : human;
      const hash = player === aiPlayer ? zobristX[index(row, col)] : zobristO[index(row, col)];
      flat[index(row, col)] = player;
      boardHash ^= hash;

      const score = minimax(depth - 1, alpha, beta, !maxing, row, col, player);

      flat[index(row, col)] = '';
      boardHash ^= hash;

      if (maxing) {
        if (score > bestScore) {
          bestScore = score;
          bestMove = [row, col];
        }
        if (score > alpha) alpha = score;
      } else {
        if (score < bestScore) {
          bestScore = score;
          bestMove = [row, col];
        }
        if (score < beta) beta = score;
      }

      if (alpha >= beta) break;
    }

    let flag = 0;
    if (bestScore <= originalAlpha) flag = 2;
    else if (bestScore >= beta) flag = 1;
    transpositionTable.set(boardHash, { depth, flag, score: bestScore, bestMove });

    return bestScore;
  }

  const allMoves = getMoves();
  if (allMoves.length === 0) return null;
  if (allMoves.length === 1) return allMoves[0];

  for (const [row, col] of allMoves) {
    flat[index(row, col)] = aiPlayer;
    const win = checkWinAt(row, col, aiPlayer);
    flat[index(row, col)] = '';
    if (win) return [row, col];
  }

  for (const [row, col] of allMoves) {
    flat[index(row, col)] = human;
    const win = checkWinAt(row, col, human);
    flat[index(row, col)] = '';
    if (win) return [row, col];
  }

  let bestMove = allMoves[0];
  const maxDepth = size <= 5 ? 8 : size <= 7 ? 6 : 4;

  for (let depth = 1; depth <= maxDepth && !timeUp; depth++) {
    let depthBest = null;
    let depthBestScore = -Infinity;
    const scoredMoves = [];

    for (const [row, col] of allMoves) {
      if (timeUp) break;

      const hash = zobristX[index(row, col)];
      flat[index(row, col)] = aiPlayer;
      boardHash ^= hash;

      const score = minimax(depth - 1, -Infinity, Infinity, false, row, col, aiPlayer);

      flat[index(row, col)] = '';
      boardHash ^= hash;

      scoredMoves.push({ row, col, score });

      if (score > depthBestScore) {
        depthBestScore = score;
        depthBest = [row, col];
      }

      if (score >= 1e7) break;
    }

    if (!timeUp && depthBest) {
      bestMove = depthBest;
      scoredMoves.sort((a, b) => b.score - a.score);
      allMoves.length = 0;
      for (const { row, col } of scoredMoves) allMoves.push([row, col]);
    }
  }

  return bestMove;
}
