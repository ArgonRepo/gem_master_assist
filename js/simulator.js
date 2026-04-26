(function(global) {
  const { COLS, ROWS, MAX_ROWS, calcScore } = global.GemConstants;

  class Simulator {
    simulateTurn(board, gemId, targetCol) {
      const b = board.clone();
      const steps = [];

      // Phase 1: Move gem
      b.moveGem(gemId, targetCol);
      steps.push({ phase: 'move', snapshot: this._snapshot(b) });

      // Phase 2: Gravity + eliminate BEFORE hidden row push
      const settleResult1 = this.settle(b);
      steps.push(...settleResult1.steps);

      // Phase 3: Push hidden row
      b.pushHiddenRow();
      steps.push({ phase: 'push', snapshot: this._snapshot(b) });

      // Phase 4: Gravity + eliminate AFTER hidden row push
      const settleResult2 = this.settle(b);
      steps.push(...settleResult2.steps);

      // Combine results from both settle phases
      const totalRows = settleResult1.comboCount + settleResult2.comboCount;
      const totalScore = calcScore(totalRows);
      const isGameOver = b.getMaxHeight() >= ROWS;

      return {
        board: b,
        score: totalScore,
        eliminatedCount: settleResult1.eliminatedCount + settleResult2.eliminatedCount,
        comboCount: totalRows,
        comboWaves: settleResult1.comboWaves + settleResult2.comboWaves,
        colorfulBonusCount: settleResult1.colorfulBonusCount + settleResult2.colorfulBonusCount,
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


      return {
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

      // Phase 1: Gravity + eliminate BEFORE hidden row push
      const sr1 = this.settleFast(b);

      // Phase 2: Push hidden row (if known)
      let sr2 = { score: 0, comboCount: 0, comboWaves: 0, colorfulBonusCount: 0 };
      if (!skipPush) {
        b.pushHiddenRow();
        // Phase 3: Gravity + eliminate AFTER hidden row push
        sr2 = this.settleFast(b);
      }

      const totalRows = sr1.comboCount + sr2.comboCount;
      const isGameOver = b.getMaxHeight() >= ROWS;
      return {
        board: b,
        score: calcScore(totalRows),
        comboCount: totalRows,
        comboWaves: sr1.comboWaves + sr2.comboWaves,
        colorfulBonusCount: sr1.colorfulBonusCount + sr2.colorfulBonusCount,
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
