(function(global) {
  const { COLS, ROWS } = global.GemConstants;
  const Simulator = global.GemSimulator;
  const simulator = new Simulator();

  /**
   * Maximum lookahead depth.
   * Depth-1: always full sim (with known hidden row push).
   * Depth-2+: fast sim WITHOUT hidden row push (unknown future rows).
   * Each deeper level is discounted since uncertainty grows.
   */
  const MAX_DEPTH = 4;
  // depth-2 hit rate ~76%, depth-3 ~30%. Discount reflects risk-adjusted value,
  // not raw hit probability — a 30% chance at 3x payoff is still worth betting
  // at safe heights. The deepSearchWeight handles height-based risk scaling.
  const DEPTH_DISCOUNT = [1.0, 1.0, 0.7, 0.5, 0.35];
  const DEPTH_PRUNE = [Infinity, Infinity, 15, 8, 5];
  const DEBUG = false;

  class Advisor {
    analyze(board) {
      const results = [];
      const allMoves = this._getAllMoves(board);

      for (const move of allMoves) {
        // Depth-1: full simulation with known hidden row
        const sim = simulator.simulateTurn(board, move.gemId, move.targetCol);
        const evalResult = this._evaluateWithLookahead(sim, board);

        results.push({
          gemId: move.gemId,
          gemRow: move.gemRow,
          gemCol: move.gemCol,
          gemWidth: move.gemWidth,
          targetCol: move.targetCol,
          direction: move.targetCol < move.gemCol ? '←' : '→',
          distance: Math.abs(move.targetCol - move.gemCol),
          sim,
          eval: evalResult.total,
          reasons: evalResult.reasons,
        });
      }

      results.sort((a, b) => b.eval - a.eval);

      // Debug: log top 5 candidates
      if (DEBUG) {
        console.group('📊 策略分析结果 (Top 5)');
        results.slice(0, 5).forEach((r, i) => {
          console.log(`#${i+1} [eval=${r.eval.toFixed(1)}] 第${r.gemRow+1}行 ${r.gemWidth}格宽 列${r.gemCol+1}→列${r.targetCol+1} | 得分:${r.sim.score} 消除:${r.sim.comboCount}行 | ${r.reasons.join('; ')}`);
        });
        console.groupEnd();
      }

      return results;
    }

    _getAllMoves(board) {
      const moves = [];
      for (const gem of board.gems.values()) {
        const validCols = board.getValidMoves(gem.id);
        for (const targetCol of validCols) {
          moves.push({
            gemId: gem.id,
            gemRow: gem.row,
            gemCol: gem.col,
            gemWidth: gem.width,
            targetCol,
          });
        }
      }
      return moves;
    }

    /**
     * Iterative Deepening Evaluation
     * 
     * Strategy philosophy:
     *   1. If this move scores immediately → great, evaluate and bonus.
     *   2. If not → search deeper (up to MAX_DEPTH) to find the earliest
     *      turn where a scoring opportunity exists.
     *   3. Closer scoring opportunities are worth exponentially more than
     *      distant ones (via discount factor).
     *   4. Safety (height/holes) is always a secondary tiebreaker.
     *
     * The "best future path" is found via recursive search:
     *   At each depth, try all moves on the resulting board (no hidden row
     *   push since future rows are unknown), find the max score, and
     *   propagate it back discounted.
     */
    _evaluateWithLookahead(sim, originalBoard) {
      if (sim.isGameOver) return { total: -Infinity, reasons: ['操作后会导致宝石触顶 Game Over'] };


      const afterBoard = sim.board;
      const beforeHeight = originalBoard.getMaxHeight();
      const reasons = [];
      let total = 0;

      // === Immediate Score (Depth-1) — dominant factor ===
      const immediateScore = sim.score;
      total += immediateScore * 100;

      if (immediateScore > 0) {
        const comboWaves = sim.comboWaves || 1;
        if (comboWaves > 1) {
          reasons.push(`🔥 触发 ${comboWaves} 波连锁消除！总计消除 ${sim.comboCount} 行，得分 +${immediateScore}`);
          total += comboWaves * 50;
        } else if (sim.comboCount > 1) {
          reasons.push(`✨ 同时消除 ${sim.comboCount} 行，得分 +${immediateScore}`);
        } else {
          reasons.push(`消除 1 行，得分 +${immediateScore}`);
        }
      }

      // Colorful gem bonus
      const colorfulBonus = sim.colorfulBonusCount || 0;
      if (colorfulBonus > 0) {
        total += colorfulBonus * 30;
        reasons.push(`🌈 彩色宝石连锁，额外清除 ${colorfulBonus} 个宝石`);
      }

      // Combo construction is the ONLY way to reduce net height (1-row elimination
      // just breaks even against the push). Weight must stay high at ALL heights
      // to encourage layout→combo sequences. Only at height ROWS-1 (one push from
      // death), use a minimal weight as tiebreaker instead of blind selection.
      const afterHeight = sim.board.getMaxHeight();
      const deepSearchWeight = afterHeight >= ROWS - 1 ? 10 : 80;

      if (deepSearchWeight > 0) {
        // When we already score, deep lookahead is only a MINOR tiebreaker.
        // When we don't score, it's the PRIMARY decision factor.
        if (immediateScore === 0) {
          const futureResult = this._deepSearch(afterBoard, 2);
          if (futureResult.score > 0) {
            const discountedBonus = futureResult.score * DEPTH_DISCOUNT[futureResult.depth] * deepSearchWeight;
            total += discountedBonus;

            const depthLabel = futureResult.depth === 2 ? '下一步' : `${futureResult.depth - 1} 步后`;
            reasons.push(`🧠 预判布局：${depthLabel}可消除 ${futureResult.comboCount} 行，预期得分 +${futureResult.score}`);
          }
        } else if (immediateScore <= 8) {
          const futureResult = this._deepSearch(afterBoard, 2);
          if (futureResult.score > 0) {
            const tieWeight = Math.min(deepSearchWeight, 10);
            const discountedBonus = futureResult.score * DEPTH_DISCOUNT[futureResult.depth] * tieWeight;
            total += discountedBonus;

            const depthLabel = futureResult.depth === 2 ? '下一步' : `${futureResult.depth - 1} 步后`;
            reasons.push(`🧠 且${depthLabel}还可继续消除 ${futureResult.comboCount} 行`);
          }
        }
      }
      // When immediateScore > 8 (multi-row combo), no lookahead — already a great result

      // === Safety Evaluation ===
      const maxH = afterBoard.getMaxHeight();

      // Bonus for height reduction (prefer moves that actively lower the board)
      const heightReduction = beforeHeight - maxH;
      if (heightReduction > 0) {
        // In danger zone, height reduction becomes critically important
        const reductionWeight = maxH >= ROWS - 2 ? 80 : 20;
        total += heightReduction * reductionWeight;
      }

      if (maxH >= ROWS - 1) {
        // Heavy penalty at critical height — but not enough to override multi-row combos,
        // which actively reduce height and should still be executed.
        total -= 2000;
        reasons.push(`⚠️ 极度危险！高度 ${maxH}/${ROWS}，生存优先`);
      } else if (maxH >= ROWS - 2) {
        total -= 800;
        reasons.push(`⚠️ 高度偏高 (${maxH}/${ROWS})，需要警惕`);
      } else {
        total += (ROWS - maxH) * 5;
        if (immediateScore === 0 && reasons.length === 0) {
          reasons.push(`高度安全 (${maxH}/${ROWS})`);
        }
      }

      // Holes penalty
      const holes = afterBoard.getHoleCount();
      total -= holes * 15;
      if (holes > 3) {
        reasons.push(`结构松散，有 ${holes} 个空洞`);
      }

      // Near-complete rows bonus
      const potentialInfo = afterBoard.getPotentialRowsWeighted();
      total += potentialInfo.score * 8;
      if (potentialInfo.nearComplete > 0 && immediateScore === 0 && reasons.length <= 1) {
        reasons.push(`构建了 ${potentialInfo.nearComplete} 行接近满行的阵型`);
      }

      if (reasons.length === 0) reasons.push('综合评估最优');

      return { total, reasons };
    }

    /**
     * Recursive deep search — finds the BEST scoring opportunity across
     * all depths (2 ~ MAX_DEPTH), not just the earliest.
     *
     * At each depth, try all legal moves (WITHOUT hidden row push since
     * future rows are unknown). Collect scoring results AND continue
     * searching deeper to compare discounted values.
     *
     * Returns the option with the highest discounted value:
     *   discounted = score × DEPTH_DISCOUNT[depth]
     *
     * @returns {{ score: number, comboCount: number, depth: number }}
     */
    _deepSearch(board, currentDepth) {
      if (currentDepth > MAX_DEPTH) return { score: 0, comboCount: 0, depth: currentDepth };

      const moves = this._getAllMoves(board);
      if (moves.length === 0) return { score: 0, comboCount: 0, depth: currentDepth };

      // Try all moves at this depth
      let bestAtThisDepth = { score: 0, comboCount: 0, depth: currentDepth };
      const nonScoringResults = [];

      for (const move of moves) {
        const sim = simulator.simulateTurnFast(board, move.gemId, move.targetCol, true);
        if (sim.isGameOver) continue;

        if (sim.score > bestAtThisDepth.score) {
          bestAtThisDepth = { score: sim.score, comboCount: sim.comboCount, depth: currentDepth };
        }

        if (sim.score === 0) {
          nonScoringResults.push({ move, board: sim.board, safety: this._quickSafety(sim.board) });
        }
      }

      // Also search deeper — don't stop just because this depth scored
      const pruneCount = DEPTH_PRUNE[currentDepth] || 5;
      nonScoringResults.sort((a, b) => b.safety - a.safety);
      const candidates = nonScoringResults.slice(0, pruneCount);

      let bestDeeper = { score: 0, comboCount: 0, depth: currentDepth + 1 };
      for (const candidate of candidates) {
        const result = this._deepSearch(candidate.board, currentDepth + 1);
        if (result.score > bestDeeper.score) {
          bestDeeper = result;
        }
      }

      // Compare discounted values: this depth vs deeper depths
      const thisDiscounted = bestAtThisDepth.score * DEPTH_DISCOUNT[currentDepth];
      const deepDiscounted = bestDeeper.score * DEPTH_DISCOUNT[bestDeeper.depth];

      if (thisDiscounted >= deepDiscounted && bestAtThisDepth.score > 0) {
        return bestAtThisDepth;
      }
      return bestDeeper;
    }

    /**
     * Quick board safety heuristic for pruning.
     * Higher = better board state to explore deeper.
     */
    _quickSafety(board) {
      const maxH = board.getMaxHeight();
      const holes = board.getHoleCount();
      const potential = board.getPotentialRowsWeighted();
      return (ROWS - maxH) * 10 + potential.score * 5 - holes * 8;
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
