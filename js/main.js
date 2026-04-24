(function(global) {
  const { COLS, ROWS } = global.GemConstants;
  const Board = global.GemBoard;
  const { resetIdCounter } = global.GemBoardUtils;
  const Simulator = global.GemSimulator;
  const Advisor = global.GemAdvisor;
  const Renderer = global.GemRenderer;

  const board = new Board();
  const simulator = new Simulator();
  const advisor = new Advisor();
  const renderer = new Renderer();

  let currentResults = [];
  let history = []; 

  function init() {
    renderer.init();
    renderer.renderBoard(board);

    // Action buttons
    document.getElementById('analyze-btn').addEventListener('click', analyze);
    document.getElementById('execute-btn').addEventListener('click', executeMove);
    document.getElementById('reset-btn').addEventListener('click', resetBoard);

    // Drag-to-draw callback
    renderer.onGemCreated = (type, row, startCol, width) => {
      saveHistory();
      if (type === 'board') {
        board.addGem(row, startCol, width, false);
      } else if (type === 'hidden') {
        // Check if space is available
        const occupied = new Set();
        for (const e of board.hiddenRow) {
          for (let c = e.col; c < e.col + e.width; c++) occupied.add(c);
        }
        let canPlace = true;
        for (let c = startCol; c < startCol + width; c++) {
          if (occupied.has(c)) canPlace = false;
        }
        if (canPlace) {
          board.hiddenRow.push({ col: startCol, width, isColorful: false });
        }
      }
      renderer.renderBoard(board);
      updateStatus();
    };

    // Left click to delete
    renderer.onGemClick = (id, type) => {
      saveHistory();
      if (type === 'board') {
        board.removeGem(id);
      } else if (type === 'hidden') {
        board.hiddenRow = board.hiddenRow.filter(e => e.col !== id);
      }
      renderer.highlightedMove = null;
      renderer.renderBoard(board);
      updateStatus();
    };

    // Right click to toggle color
    renderer.onGemRightClick = (id, type) => {
      saveHistory();
      if (type === 'board') {
        const gem = board.gems.get(id);
        if (gem) gem.isColorful = !gem.isColorful;
      } else if (type === 'hidden') {
        const entry = board.hiddenRow.find(e => e.col === id);
        if (entry) entry.isColorful = !entry.isColorful;
      }
      renderer.renderBoard(board);
    };

    // Hover/Select move
    renderer.onSelectMove = (move) => {
      renderer.renderMovePreview(board, move);
    };
    renderer.onHoverMove = (move) => {
      renderer.renderMovePreview(board, move);
    };

    updateStatus();
  }

  function saveHistory() {
    history.push(board.clone());
    if (history.length > 30) history.shift();
  }

  function analyze() {
    const btn = document.getElementById('analyze-btn');
    btn.disabled = true;
    btn.textContent = '分析中...';

    setTimeout(() => {
      currentResults = advisor.analyze(board);
      renderer.renderResults(currentResults, advisor);
      if (currentResults.length > 0) {
        renderer.renderMovePreview(board, currentResults[0]);
        document.getElementById('execute-btn').disabled = false;
      }
      btn.disabled = false;
      btn.textContent = '🔍 分析策略';
    }, 50);
  }

  function executeMove() {
    if (currentResults.length === 0) return;

    const best = currentResults[0];
    saveHistory();

    board.moveGem(best.gemId, best.targetCol);
    board.pushHiddenRow();
    simulator.settle(board);
    board.score += best.sim.score;

    currentResults = [];
    renderer.highlightedMove = null;
    document.getElementById('results-panel').innerHTML = '<div class="no-results">执行完成，请填入新的隐藏行并继续</div>';
    document.getElementById('execute-btn').disabled = true;

    renderer.renderBoard(board);
    updateStatus();

    if (board.getMaxHeight() > ROWS) {
      alert('⚠️ Game Over! 宝石超过了顶部。');
    }
  }

  function resetBoard() {
    if (!confirm('确定要清空棋盘吗？')) return;
    saveHistory();
    resetIdCounter();
    board.grid = Array.from({ length: 14 }, () => Array(COLS).fill(null));
    board.gems.clear();
    board.hiddenRow = [];
    board.score = 0;
    currentResults = [];
    renderer.highlightedMove = null;
    renderer.gemColorMap.clear();
    document.getElementById('results-panel').innerHTML = '';
    document.getElementById('execute-btn').disabled = true;
    renderer.renderBoard(board);
    updateStatus();
  }

  function updateStatus() {
    const height = board.getMaxHeight();
    const gemCount = board.gems.size;
    document.getElementById('status-score').textContent = board.score;
    document.getElementById('status-height').textContent = `${height}/${ROWS}`;
    document.getElementById('status-gems').textContent = gemCount;

    const heightEl = document.getElementById('status-height');
    heightEl.classList.toggle('danger', height >= ROWS - 2);
    heightEl.classList.toggle('warning', height >= ROWS - 4 && height < ROWS - 2);
  }

  document.addEventListener('DOMContentLoaded', init);

})(window);
