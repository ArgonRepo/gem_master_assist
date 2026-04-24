(function(global) {
  const { COLS, ROWS, MAX_ROWS, calcScore } = global.GemConstants;

  class Simulator {
    simulateTurn(board, gemId, targetCol) {
      const b = board.clone();
      const steps = [];

      b.moveGem(gemId, targetCol);
      steps.push({ phase: 'move', snapshot: this._snapshot(b) });

      b.pushHiddenRow();
      steps.push({ phase: 'push', snapshot: this._snapshot(b) });

      const settleResult = this.settle(b);
      steps.push(...settleResult.steps);

      const isGameOver = b.getMaxHeight() > ROWS;

      return {
        board: b,
        score: settleResult.score,
        eliminatedCount: settleResult.eliminatedCount,
        comboCount: settleResult.comboCount,
        isGameOver,
        steps,
      };
    }

    settle(board) {
      let totalScore = 0;
      let totalEliminated = 0;
      let totalRowsEliminated = 0;
      const steps = [];

      this._applyGravityWithSteps(board, steps);

      while (true) {
        const completeRows = [];
        for (let r = 0; r < MAX_ROWS; r++) {
          if (board.isRowComplete(r)) completeRows.push(r);
        }
        if (completeRows.length === 0) break;

        const toEliminate = new Set();
        for (const r of completeRows) {
          for (let c = 0; c < COLS; c++) {
            const id = board.grid[r][c];
            if (id != null) toEliminate.add(id);
          }
        }

        const queue = [];
        for (const id of toEliminate) {
          const gem = board.gems.get(id);
          if (gem && gem.isColorful) queue.push(gem);
        }
        while (queue.length > 0) {
          const gem = queue.shift();
          const neighbors = this._getNeighborGems(board, gem);
          for (const n of neighbors) {
            if (!toEliminate.has(n.id)) {
              toEliminate.add(n.id);
              if (n.isColorful) queue.push(n);
            }
          }
        }

        const rowScore = calcScore(completeRows.length);
        totalScore += rowScore;
        totalRowsEliminated += completeRows.length;
        totalEliminated += toEliminate.size;

        // Pre-eliminate snapshot for animation
        const preEliminateBoard = board.clone();
        for (const id of toEliminate) {
          const gem = preEliminateBoard.gems.get(id);
          if (gem) gem.isEliminating = true;
        }
        steps.push({ phase: 'pre-eliminate', snapshot: preEliminateBoard });

        // Actual elimination
        for (const id of toEliminate) {
          board.removeGem(id);
        }
        steps.push({ phase: 'eliminate', snapshot: this._snapshot(board) });

        this._applyGravityWithSteps(board, steps);
      }

      return {
        score: totalScore,
        eliminatedCount: totalEliminated,
        comboCount: totalRowsEliminated,
        steps,
      };
    }

    _applyGravityWithSteps(board, steps) {
      let moved = true;
      while (moved) {
        moved = false;
        const sortedGems = [...board.gems.values()].sort((a, b) => a.row - b.row);
        for (const gem of sortedGems) {
          if (gem.row === 0) continue; 
          const belowRow = gem.row - 1;
          let canFall = true;
          for (let c = gem.col; c < gem.col + gem.width; c++) {
            if (board.grid[belowRow][c] !== null) {
              canFall = false;
              break;
            }
          }
          if (canFall) {
            for (let c = gem.col; c < gem.col + gem.width; c++) {
              board.grid[gem.row][c] = null;
            }
            gem.row -= 1;
            for (let c = gem.col; c < gem.col + gem.width; c++) {
              board.grid[gem.row][c] = gem.id;
            }
            moved = true;
          }
        }
        if (moved) {
          steps.push({ phase: 'gravity-step', snapshot: this._snapshot(board) });
        }
      }
    }

    _getNeighborGems(board, gem) {
      const neighbors = new Set();
      for (let c = gem.col; c < gem.col + gem.width; c++) {
        const upGem = board.getGemAt(gem.row + 1, c);
        if (upGem) neighbors.add(upGem);
        const downGem = board.getGemAt(gem.row - 1, c);
        if (downGem) neighbors.add(downGem);
      }
      if (gem.col > 0) {
        const leftGem = board.getGemAt(gem.row, gem.col - 1);
        if (leftGem) neighbors.add(leftGem);
      }
      if (gem.col + gem.width < COLS) {
        const rightGem = board.getGemAt(gem.row, gem.col + gem.width);
        if (rightGem) neighbors.add(rightGem);
      }
      return [...neighbors];
    }

    _snapshot(board) {
      return board.clone();
    }
  }

  global.GemSimulator = Simulator;

})(window);
