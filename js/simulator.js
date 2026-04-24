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
        comboWaves: settleResult.comboWaves,
        colorfulBonusCount: settleResult.colorfulBonusCount,
        isGameOver,
        steps,
      };
    }

    settle(board) {
      let totalEliminated = 0;
      let totalRowsEliminated = 0;
      let comboWaves = 0;
      let colorfulBonusCount = 0; // Extra gems eliminated via colorful chain reactions
      const steps = [];

      this._applyGravityWithSteps(board, steps);

      while (true) {
        const completeRows = [];
        for (let r = 0; r < MAX_ROWS; r++) {
          if (board.isRowComplete(r)) completeRows.push(r);
        }
        if (completeRows.length === 0) break;

        comboWaves++;

        // Collect gems in complete rows
        const rowGemIds = new Set();
        for (const r of completeRows) {
          for (let c = 0; c < COLS; c++) {
            const id = board.grid[r][c];
            if (id != null) rowGemIds.add(id);
          }
        }

        // Expand via colorful gem chain reactions
        const toEliminate = new Set(rowGemIds);
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

        // Count colorful bonus (gems eliminated beyond the complete rows)
        colorfulBonusCount += (toEliminate.size - rowGemIds.size);

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

      // Score is computed ONCE using total rows (simultaneous and chain score identically)
      const totalScore = calcScore(totalRowsEliminated);

      return {
        score: totalScore,
        eliminatedCount: totalEliminated,
        comboCount: totalRowsEliminated,
        comboWaves,
        colorfulBonusCount,
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

    /**
     * Fast simulation — no animation snapshots, used for depth-2 lookahead.
     * Optionally skips pushHiddenRow (for second-step prediction where hidden row is unknown).
     */
    simulateTurnFast(board, gemId, targetCol, skipPush) {
      const b = board.clone();
      b.moveGem(gemId, targetCol);
      if (!skipPush) b.pushHiddenRow();
      const settleResult = this.settleFast(b);
      const isGameOver = b.getMaxHeight() > ROWS;
      return {
        board: b,
        score: settleResult.score,
        comboCount: settleResult.comboCount,
        comboWaves: settleResult.comboWaves,
        colorfulBonusCount: settleResult.colorfulBonusCount,
        isGameOver,
      };
    }

    settleFast(board) {
      let totalEliminated = 0;
      let totalRowsEliminated = 0;
      let comboWaves = 0;
      let colorfulBonusCount = 0;

      this._applyGravityFast(board);

      while (true) {
        const completeRows = [];
        for (let r = 0; r < MAX_ROWS; r++) {
          if (board.isRowComplete(r)) completeRows.push(r);
        }
        if (completeRows.length === 0) break;

        comboWaves++;
        const rowGemIds = new Set();
        for (const r of completeRows) {
          for (let c = 0; c < COLS; c++) {
            const id = board.grid[r][c];
            if (id != null) rowGemIds.add(id);
          }
        }

        const toEliminate = new Set(rowGemIds);
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

        colorfulBonusCount += (toEliminate.size - rowGemIds.size);
        totalRowsEliminated += completeRows.length;
        totalEliminated += toEliminate.size;

        for (const id of toEliminate) {
          board.removeGem(id);
        }
        this._applyGravityFast(board);
      }

      return {
        score: calcScore(totalRowsEliminated),
        comboCount: totalRowsEliminated,
        comboWaves,
        colorfulBonusCount,
      };
    }

    _applyGravityFast(board) {
      let moved = true;
      while (moved) {
        moved = false;
        const sortedGems = [...board.gems.values()].sort((a, b) => a.row - b.row);
        for (const gem of sortedGems) {
          if (gem.row === 0) continue;
          const belowRow = gem.row - 1;
          let canFall = true;
          for (let c = gem.col; c < gem.col + gem.width; c++) {
            if (board.grid[belowRow][c] !== null) { canFall = false; break; }
          }
          if (canFall) {
            for (let c = gem.col; c < gem.col + gem.width; c++) board.grid[gem.row][c] = null;
            gem.row -= 1;
            for (let c = gem.col; c < gem.col + gem.width; c++) board.grid[gem.row][c] = gem.id;
            moved = true;
          }
        }
      }
    }

    _snapshot(board) {
      return board.clone();
    }
  }

  global.GemSimulator = Simulator;

})(window);
