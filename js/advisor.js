(function(global) {
  const { COLS, ROWS, WEIGHTS } = global.GemConstants;
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

    /**
     * Layered priority evaluation system:
     * Priority 1 (highest): Chain combo — multi-wave eliminations with gravity cascades
     * Priority 2: Colorful gem bonus — extra eliminations via colorful chain reactions
     * Priority 3: Row elimination — any rows cleared at all
     * Priority 4 (lowest): Safety — height control, hole avoidance, near-complete rows
     *
     * Each layer contributes to a weighted total, but higher-priority layers
     * have exponentially more weight so they always dominate.
     */
    evaluate(sim, originalBoard) {
      if (sim.isGameOver) return { total: -Infinity, reasons: ['操作后会导致宝石触顶 Game Over'] };

      const afterBoard = sim.board;
      const reasons = [];
      let total = 0;

      // === LAYER 1: Immediate Score (from actual eliminations) ===
      // This is the most important factor — direct points earned.
      // Chain combos naturally produce higher scores via the calcScore formula:
      //   N rows → (N*8) * (1 + (N-1)*0.5)
      // So 2-row chains already get 1.5x multiplier, 3-row gets 2.0x, etc.
      const immediateScore = sim.score;
      total += immediateScore * 100; // Dominant weight

      if (immediateScore > 0) {
        const comboWaves = sim.comboWaves || 1;
        if (comboWaves > 1) {
          reasons.push(`🔥 触发 ${comboWaves} 波连锁消除！总计消除 ${sim.comboCount} 行，得分 +${immediateScore}`);
          // Extra bonus for chain combos (multi-wave is strategically superior)
          total += comboWaves * 50;
        } else if (sim.comboCount > 1) {
          reasons.push(`✨ 同时消除 ${sim.comboCount} 行，得分 +${immediateScore}`);
        } else {
          reasons.push(`消除 1 行，得分 +${immediateScore}`);
        }
      }

      // === LAYER 2: Colorful Gem Bonus ===
      // Extra gems destroyed via colorful chain reactions (beyond what complete rows cover)
      const colorfulBonus = sim.colorfulBonusCount || 0;
      if (colorfulBonus > 0) {
        total += colorfulBonus * 30;
        reasons.push(`🌈 彩色宝石连锁，额外清除 ${colorfulBonus} 个宝石`);
      }

      // === LAYER 3: Safety — Height Control ===
      const maxH = afterBoard.getMaxHeight();
      const heightScore = (ROWS - maxH);
      
      if (maxH >= ROWS - 1) {
        // Critical danger: about to game over
        total -= 500;
        reasons.push(`⚠️ 极度危险！高度 ${maxH}/${ROWS}，即将触顶`);
      } else if (maxH >= ROWS - 2) {
        total -= 200;
        reasons.push(`⚠️ 高度偏高 (${maxH}/${ROWS})，需要警惕`);
      } else {
        total += heightScore * 5;
        if (immediateScore === 0) {
          reasons.push(`高度安全 (${maxH}/${ROWS})`);
        }
      }

      // === LAYER 4: Board Quality — Holes & Potential ===
      const holes = afterBoard.getHoleCount();
      total -= holes * 15; // Holes are bad: they block gravity cascades
      if (holes > 3) {
        reasons.push(`结构松散，有 ${holes} 个空洞`);
      }

      // Near-complete rows (potential future eliminations)
      const potentialInfo = afterBoard.getPotentialRowsWeighted();
      total += potentialInfo.score * 8;
      if (potentialInfo.nearComplete > 0 && immediateScore === 0) {
        reasons.push(`构建了 ${potentialInfo.nearComplete} 行接近满行的阵型`);
      }

      if (reasons.length === 0) reasons.push('综合评估最优');

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
