(function(global) {
  const { COLS, ROWS } = global.GemConstants;

  class Renderer {
    constructor() {
      this.boardEl = null;
      this.hiddenRowEl = null;
      this.gemColorMap = new Map(); 
      this.highlightedMove = null; 

      // Drag state
      this.isDragging = false;
      this.dragStartNode = null; 
      this.dragCurrentNode = null;

      // Animation state
      this.previewInterval = null;

      // Callbacks
      this.onGemCreated = null; 
      this.onGemClick = null;   
      this.onGemRightClick = null; 
      
      this._onSelectMove = null;
      this._onHoverMove = null;
      this.onPreviewClick = null;
    }

    playAnimation(steps, onComplete) {
      this.stopAnimation();
      let stepIdx = 0;
      
      const renderNextStep = () => {
        if (stepIdx >= steps.length) {
          this.stopAnimation();
          if (onComplete) onComplete();
          return;
        }
        const step = steps[stepIdx];
        this.renderBoard(step.snapshot);
        stepIdx++;
      };

      // Render first step immediately, then interval
      renderNextStep();
      this.previewInterval = setInterval(renderNextStep, 600);
    }

    stopAnimation() {
      if (this.previewInterval) {
        clearInterval(this.previewInterval);
        this.previewInterval = null;
      }
    }

    init() {
      this.boardEl = document.getElementById('board-grid');
      this.hiddenRowEl = document.getElementById('hidden-row-grid');

      // Global mouseup to cancel dragging if released outside
      document.addEventListener('mouseup', () => {
        if (this.isDragging) {
          this._finishDrag();
        }
      });
      // Prevent default context menu on grids
      this.boardEl.addEventListener('contextmenu', e => e.preventDefault());
      this.hiddenRowEl.addEventListener('contextmenu', e => e.preventDefault());
    }

    renderBoard(board) {
      this.boardEl.innerHTML = '';
      
      for (let r = ROWS - 1; r >= 0; r--) {
        const rowEl = document.createElement('div');
        rowEl.className = 'board-row';

        let c = 0;
        while (c < COLS) {
          const gemId = board.grid[r][c];
          if (gemId !== null) {
            const gem = board.gems.get(gemId);
            if (gem && gem.col === c) {
              const gemEl = this._createGemElement(gem, 'board');
              rowEl.appendChild(gemEl);
              c += gem.width;
              continue;
            }
          }
          
          const cellEl = this._createEmptyCell(r, c, 'board');
          rowEl.appendChild(cellEl);
          c++;
        }
        this.boardEl.appendChild(rowEl);
      }
      this.renderHiddenRow(board);
    }

    renderHiddenRow(board) {
      this.hiddenRowEl.innerHTML = '';
      const occupied = new Set();
      for (const entry of board.hiddenRow) {
        for (let c = entry.col; c < entry.col + entry.width; c++) occupied.add(c);
      }

      let c = 0;
      while (c < COLS) {
        const entry = board.hiddenRow.find(e => e.col === c);
        if (entry) {
          const mockGem = { id: entry.col, width: entry.width, isColorful: entry.isColorful };
          const gemEl = this._createGemElement(mockGem, 'hidden');
          this.hiddenRowEl.appendChild(gemEl);
          c += entry.width;
        } else {
          const cellEl = this._createEmptyCell(0, c, 'hidden');
          this.hiddenRowEl.appendChild(cellEl);
          c++;
        }
      }
    }

    _createEmptyCell(row, col, type) {
      const cellEl = document.createElement('div');
      cellEl.className = 'cell empty-cell';
      cellEl.dataset.row = row;
      cellEl.dataset.col = col;
      cellEl.dataset.type = type;

      // Mouse events for drag-to-draw
      cellEl.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // Only left click
        this.isDragging = true;
        this.dragStartNode = { row, col, type };
        this.dragCurrentNode = { row, col, type };
        this._updateDragVisuals();
      });

      cellEl.addEventListener('mouseenter', () => {
        if (!this.isDragging) return;
        if (this.dragStartNode && this.dragStartNode.type === type && this.dragStartNode.row === row) {
          this.dragCurrentNode = { row, col, type };
          this._updateDragVisuals();
        }
      });

      return cellEl;
    }

    _finishDrag() {
      if (!this.isDragging || !this.dragStartNode || !this.dragCurrentNode) {
        this.isDragging = false;
        return;
      }
      
      const startCol = Math.min(this.dragStartNode.col, this.dragCurrentNode.col);
      const endCol = Math.max(this.dragStartNode.col, this.dragCurrentNode.col);
      const width = Math.min(4, endCol - startCol + 1); // Max width 4
      
      if (this.onGemCreated) {
        this.onGemCreated(this.dragStartNode.type, this.dragStartNode.row, startCol, width);
      }
      
      this.isDragging = false;
      this.dragStartNode = null;
      this.dragCurrentNode = null;
      this._updateDragVisuals(); // Clear visuals
    }

    _updateDragVisuals() {
      document.querySelectorAll('.drag-highlight').forEach(el => el.classList.remove('drag-highlight'));
      
      if (!this.isDragging || !this.dragStartNode || !this.dragCurrentNode) return;
      
      const type = this.dragStartNode.type;
      const row = this.dragStartNode.row;
      const startCol = Math.min(this.dragStartNode.col, this.dragCurrentNode.col);
      const endCol = Math.min(startCol + 3, Math.max(this.dragStartNode.col, this.dragCurrentNode.col)); 

      const container = type === 'board' ? this.boardEl : this.hiddenRowEl;
      
      for (let c = startCol; c <= endCol; c++) {
        const cell = container.querySelector(`.empty-cell[data-row="${row}"][data-col="${c}"]`);
        if (cell) cell.classList.add('drag-highlight');
      }
    }

    _createGemElement(gem, type) {
      const el = document.createElement('div');
      el.className = 'cell gem';
      if (type === 'hidden') el.classList.add('hidden-gem');
      el.style.setProperty('--gem-width', gem.width);

      if (gem.isColorful) {
        el.classList.add('colorful');
      }

      if (gem.isEliminating) {
        el.classList.add('eliminating');
      }

      if (this.highlightedMove && this.highlightedMove.gemId === gem.id) {
        el.classList.add('highlight-source');
      }

      // Interactions
      el.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        if (e.button === 0) { 
          if (this.onGemClick) this.onGemClick(gem.id, type);
        } else if (e.button === 2) { 
          e.preventDefault();
          if (this.onGemRightClick) this.onGemRightClick(gem.id, type);
        }
      });
      el.addEventListener('mouseenter', (e) => {
        if (e.buttons === 1) {
          if (this.onGemClick) this.onGemClick(gem.id, type);
        }
      });
      el.addEventListener('contextmenu', e => e.preventDefault());

      return el;
    }

    renderMovePreview(board, move) {
      this.highlightedMove = move ? { gemId: move.gemId, targetCol: move.targetCol } : null;
      this.renderBoard(board);

      if (move) {
        const gem = board.gems.get(move.gemId);
        if (!gem) return;
        const visualRow = ROWS - 1 - gem.row;
        const rowEls = this.boardEl.querySelectorAll('.board-row');
        if (rowEls[visualRow]) {
          const targetEl = document.createElement('div');
          targetEl.className = 'move-target';
          targetEl.style.setProperty('--gem-width', gem.width);
          targetEl.style.left = `calc(${move.targetCol} * (var(--cell-size) + 2px))`;
          targetEl.textContent = move.direction === '←' ? '◁' : '▷';
          rowEls[visualRow].style.position = 'relative';
          rowEls[visualRow].appendChild(targetEl);
        }
      }
    }

    renderResults(results, advisor) {
      const panel = document.getElementById('results-panel');
      panel.innerHTML = '';

      if (results.length === 0) {
        panel.innerHTML = '<div class="no-results">没有可用的移动操作</div>';
        return;
      }

      const best = results[0];
      const bestEl = document.createElement('div');
      bestEl.className = 'best-move';
      
      const reasonsHtml = best.reasons ? best.reasons.map(r => `<li>${r}</li>`).join('') : '';

      bestEl.innerHTML = `
        <div class="best-move-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
          最佳推荐操作
        </div>
        <div class="best-move-desc">
          <strong>${advisor.describeMove(best)}</strong>
          <ul style="margin-top: 8px; padding-left: 16px; color: var(--text-secondary); font-size: 13px;">
            ${reasonsHtml}
          </ul>
        </div>
        <div class="best-move-stats" style="margin-top: 12px; border-top: 1px solid var(--border); padding-top: 8px;">
          <span class="stat">最终得分 <strong>+${best.sim.score}</strong></span>
          <span class="stat">消除 <strong>${best.sim.comboCount}行</strong></span>
          <span class="stat">安全高度 <strong>${best.sim.board.getMaxHeight()}/${ROWS}</strong></span>
          ${best.sim.isGameOver ? '<span class="stat danger">⚠ Game Over</span>' : ''}
        </div>
        <button class="action-btn" id="preview-btn" style="margin-top: 16px; width: 100%; justify-content: center;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
          演示效果
        </button>
      `;
      
      // Ensure hover events only work if not previewing, but that logic will be in main.js
      bestEl.addEventListener('mouseenter', () => {
        if (this._onHoverMove) this._onHoverMove(best);
      });
      bestEl.addEventListener('mouseleave', () => {
        if (this._onHoverMove) this._onHoverMove(null);
      });

      panel.appendChild(bestEl);

      const previewBtn = document.getElementById('preview-btn');
      previewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onPreviewClick) this.onPreviewClick(best, previewBtn);
      });
    }

    set onSelectMove(fn) { this._onSelectMove = fn; }
    set onHoverMove(fn) { this._onHoverMove = fn; }
  }

  global.GemRenderer = Renderer;

})(window);
