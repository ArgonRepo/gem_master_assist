(function(global) {
  const { COLS, MAX_ROWS } = global.GemConstants;

  class GameLogger {
    constructor() {
      this.turns = [];
      this.currentTurn = null;
      this.turnNumber = 0;
      this.gameStartTime = null;
    }

    reset() {
      this.turns = [];
      this.currentTurn = null;
      this.turnNumber = 0;
      this.gameStartTime = new Date().toISOString();
    }

    // Serialize a board into a plain object for JSON export
    _snapshotBoard(board) {
      const gems = [];
      for (const gem of board.gems.values()) {
        gems.push({
          id: gem.id,
          row: gem.row,
          col: gem.col,
          width: gem.width,
          isColorful: gem.isColorful
        });
      }
      // Build a visual grid (row 0 = bottom)
      const visual = [];
      const maxH = board.getMaxHeight();
      for (let r = maxH - 1; r >= 0; r--) {
        let line = '';
        for (let c = 0; c < COLS; c++) {
          line += board.grid[r][c] !== null ? '■' : '·';
        }
        visual.push(`R${String(r + 1).padStart(2, '0')}|${line}|`);
      }

      // Bottom 2 rows gem width stats (for stability analysis)
      const bottomGems = gems.filter(g => g.row <= 1);
      const bottomAvgWidth = bottomGems.length > 0
        ? parseFloat((bottomGems.reduce((s, g) => s + g.width, 0) / bottomGems.length).toFixed(2))
        : 0;
      const bottomW1Count = bottomGems.filter(g => g.width === 1).length;

      return {
        height: maxH,
        score: board.score,
        gemCount: board.gems.size,
        holes: board.getHoleCount(),
        bottomAvgWidth,
        bottomW1Count,
        gems,
        hiddenRow: board.hiddenRow.map(e => ({ col: e.col, width: e.width, isColorful: e.isColorful })),
        visual
      };
    }

    // Called when user clicks "分析策略"
    logAnalysis(board, results, advisor) {
      this.turnNumber++;
      this.currentTurn = {
        turn: this.turnNumber,
        timestamp: new Date().toISOString(),
        boardBefore: this._snapshotBoard(board),
        totalCandidates: results.length,
        // Top 10 candidates with full detail
        top10: results.slice(0, 10).map((r, rank) => ({
          rank: rank + 1,
          description: advisor.describeMove(r),
          gemId: r.gemId,
          gemRow: r.gemRow,
          gemCol: r.gemCol,
          gemWidth: r.gemWidth,
          targetCol: r.targetCol,
          direction: r.direction,
          distance: r.distance,
          eval: r.eval === -Infinity ? '-Infinity' : parseFloat(r.eval.toFixed(2)),
          simScore: r.sim.score,
          simComboCount: r.sim.comboCount,
          simComboWaves: r.sim.comboWaves,
          simColorfulBonus: r.sim.colorfulBonusCount,
          simIsGameOver: r.sim.isGameOver,
          simAfterHeight: r.sim.board.getMaxHeight(),
          simAfterHoles: r.sim.board.getHoleCount(),
          simAfterBottomAvgWidth: (() => {
            const bg = []; for (const g of r.sim.board.gems.values()) { if (g.row <= 1) bg.push(g); }
            return bg.length > 0 ? parseFloat((bg.reduce((s,g) => s+g.width, 0) / bg.length).toFixed(2)) : 0;
          })(),
          reasons: r.reasons
        })),
        // Summary of all dead-end moves
        deadEndCount: results.filter(r => r.eval === -Infinity).length,
        chosen: null,
        boardAfter: null
      };
    }

    // Called when user clicks "执行"
    logExecution(board, best) {
      if (!this.currentTurn) return;

      this.currentTurn.chosen = {
        description: `第${best.gemRow + 1}行 列${best.gemCol + 1} ${best.gemWidth}格宽 → 列${best.targetCol + 1}`,
        eval: best.eval === -Infinity ? '-Infinity' : parseFloat(best.eval.toFixed(2)),
        simScore: best.sim.score,
        simComboCount: best.sim.comboCount,
        reasons: best.reasons
      };
      this.currentTurn.boardAfter = this._snapshotBoard(board);

      this.turns.push(this.currentTurn);
      this.currentTurn = null;
    }

    // Called on game over
    logGameOver(board) {
      if (this.currentTurn) {
        this.currentTurn.boardAfter = this._snapshotBoard(board);
        this.currentTurn.gameOver = true;
        this.turns.push(this.currentTurn);
        this.currentTurn = null;
      }
    }

    // Export full game log as JSON
    export() {
      const data = {
        version: 'v3-constant-weight-with-survival-patch',
        exportTime: new Date().toISOString(),
        gameStartTime: this.gameStartTime,
        totalTurns: this.turns.length,
        finalScore: this.turns.length > 0 ? this.turns[this.turns.length - 1].boardAfter?.score ?? 0 : 0,
        turns: this.turns
      };
      return JSON.stringify(data, null, 2);
    }

    // Trigger download
    download() {
      const json = this.export();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `game_log_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }

  global.GameLogger = GameLogger;

})(window);
