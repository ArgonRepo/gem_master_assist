(function(global) {
  const { ROWS, WEIGHTS } = global.GemConstants;
  const Simulator = global.GemSimulator;
  const simulator = new Simulator();

  class Advisor {
    analyze(board) {
      const results = [];
      for (const gem of board.gems.values()) {
        const validCols = board.getValidMoves(gem.id);
        for (const targetCol of validCols) {
          const sim = simulator.simulateTurn(board, gem.id, targetCol);
          const evalScore = this.evaluate(sim, board);
          results.push({
            gemId: gem.id,
            gemRow: gem.row,
            gemCol: gem.col,
            gemWidth: gem.width,
            targetCol,
            direction: targetCol < gem.col ? '←' : '→',
            distance: Math.abs(targetCol - gem.col),
            sim,
            eval: evalScore.total,
            reasons: evalScore.reasons,
          });
        }
      }
      results.sort((a, b) => b.eval - a.eval);
      return results;
    }

    evaluate(sim, originalBoard) {
      if (sim.isGameOver) return { total: -Infinity, reasons: ['操作后会导致宝石触顶 Game Over'] };

      const afterBoard = sim.board;
      const immediateScore = sim.score;

      const maxH = afterBoard.getMaxHeight();
      const heightScore = (ROWS - maxH) * 10; 

      const potentialScore = afterBoard.getPotentialRows() * 15;
      const holeScore = -afterBoard.getHoleCount() * 8;

      const total = (
        immediateScore * WEIGHTS.immediateScore * 5 +
        heightScore * WEIGHTS.heightSafety +
        potentialScore * WEIGHTS.potential +
        holeScore * WEIGHTS.holes
      );

      const reasons = [];
      if (immediateScore > 0) reasons.push(`消除 ${sim.comboCount} 行，直接得分 +${immediateScore}`);
      if (maxH < ROWS - 2) reasons.push(`高度安全 (当前高度 ${maxH}/${ROWS})`);
      if (potentialScore > 0) reasons.push(`构建了有潜力的连击阵型`);
      if (holeScore === 0) reasons.push(`下方没有产生空洞`);
      else if (holeScore > -20) reasons.push(`结构较为紧凑`);
      
      if (reasons.length === 0) reasons.push(`综合评估最优`);

      return { total, reasons };
    }

    describeMove(move) {
      const from = `第${move.gemRow + 1}行 列${move.gemCol + 1}`;
      const widthStr = `${move.gemWidth}格宽`;
      const to = `列${move.targetCol + 1}`;
      const dir = move.direction;
      return `${from} 的${widthStr}宝石 ${dir} 移至${to}`;
    }
  }

  global.GemAdvisor = Advisor;

})(window);
