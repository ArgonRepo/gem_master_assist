(function(global) {
  const { COLS, ROWS, MAX_ROWS } = global.GemConstants;
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
  let isPreviewing = false;

  function init() {
    renderer.init();
    renderer.renderBoard(board);

    // Action buttons
    document.getElementById('analyze-btn').addEventListener('click', analyze);
    document.getElementById('execute-btn').addEventListener('click', executeMove);
    document.getElementById('reset-btn').addEventListener('click', resetBoard);

    // Drag-to-draw callback
    renderer.onGemCreated = (type, row, startCol, width) => {
      if (isPreviewing) return;
      saveHistory();
      if (type === 'board') {
        board.addGem(row, startCol, width, false);
      } else if (type === 'hidden') {
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
      if (isPreviewing) return;
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
      if (isPreviewing) return;
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

    renderer.onHoverMove = (move) => {
      if (isPreviewing) return;
      renderer.renderMovePreview(board, move);
    };

    renderer.onPreviewClick = (best, btn) => {
      if (isPreviewing) {
        // Exit preview
        isPreviewing = false;
        renderer.stopAnimation();
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg> 演示效果`;
        btn.classList.remove('danger-outline');
        renderer.renderMovePreview(board, best);
      } else {
        // Start preview
        isPreviewing = true;
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg> 退出演示`;
        btn.classList.add('danger-outline');
        
        // Ensure steps exist
        if (!best.sim.steps || best.sim.steps.length === 0) {
          console.warn("No animation steps available.");
          return;
        }
        renderer.playAnimation(best.sim.steps, () => {
          isPreviewing = false;
          btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg> 演示效果`;
          btn.classList.remove('danger-outline');
          renderer.renderMovePreview(board, best);
        });
      }
    };

    updateStatus();
  }

  function saveHistory() {
    history.push(board.clone());
    if (history.length > 30) history.shift();
  }

  function analyze() {
    if (isPreviewing) return;
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
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon"><path d="m15 5 4 4"/><path d="M13 7 8.7 2.7a2.41 2.41 0 0 0-3.4 0L2.7 5.3a2.41 2.41 0 0 0 0 3.4L7 13"/><path d="m8 6 2-2"/><path d="m2 22 5.5-5.5"/><path d="m11.1 14.1 4.2-4.2c.8-.8 2.3-.8 3.1 0l3 3c.8.8.8 2.3 0 3.1l-4.2 4.2c-.8.8-2.3.8-3.1 0l-3-3c-.8-.8-.8-2.3 0-3.1Z"/></svg> 分析策略`;
    }, 50);
  }

  function executeMove() {
    if (isPreviewing) return;
    if (currentResults.length === 0) return;

    const best = currentResults[0];
    saveHistory();

    // Correct game order: move → settle → push hidden → settle again
    board.moveGem(best.gemId, best.targetCol);
    simulator.settle(board);      // Gravity + eliminate BEFORE push
    board.pushHiddenRow();
    simulator.settle(board);      // Gravity + eliminate AFTER push
    board.score += best.sim.score;

    currentResults = [];
    document.getElementById('results-panel').innerHTML = '<div class="no-results">执行完成，请填入新的隐藏行并继续</div>';
    document.getElementById('execute-btn').disabled = true;

    renderer.renderMovePreview(board, null);
    updateStatus();

    if (board.getMaxHeight() > ROWS) {
      alert('⚠️ Game Over! 宝石超过了顶部。');
    }
  }

  function resetBoard() {
    if (isPreviewing) return;
    if (!confirm('确定要清空棋盘吗？')) return;
    saveHistory();
    resetIdCounter();
    board.grid = Array.from({ length: MAX_ROWS }, () => Array(COLS).fill(null));
    board.gems.clear();
    board.hiddenRow = [];
    board.score = 0;
    currentResults = [];
    renderer.highlightedMove = null;
    // Clear tracked gem DOM elements
    for (const el of renderer.renderedGems.values()) el.remove();
    renderer.renderedGems.clear();
    for (const el of renderer.renderedHiddenGems.values()) el.remove();
    renderer.renderedHiddenGems.clear();
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
