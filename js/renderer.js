(function(global) {
  const { COLS, ROWS } = global.GemConstants;

  class Renderer {
    constructor() {
      this.boardEl = null;
      this.hiddenRowEl = null;
      this.highlightedMove = null; 

      // Drag state
      this.isDragging = false;
      this.dragStartNode = null; 
      this.dragCurrentNode = null;

      // Animation state
      this.previewInterval = null;
      this.renderedGems = new Map(); // Track gem DOM elements by ID
      this.renderedHiddenGems = new Map();

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
      
      // Clear highlights when animation starts
      this.highlightedMove = null;
      document.querySelectorAll('.move-target').forEach(el => el.remove());
      
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

      // Create the static background grids once
      this._createStaticGrid(this.boardEl, ROWS, 'board');
      this._createStaticGrid(this.hiddenRowEl, 1, 'hidden');

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

    _createStaticGrid(container, rows, type) {
      container.innerHTML = '';
      // Create empty cell grid (bottom row is 0, top is ROWS-1)
      for (let r = rows - 1; r >= 0; r--) {
        const rowEl = document.createElement('div');
        rowEl.className = 'board-row';
        for (let c = 0; c < COLS; c++) {
          rowEl.appendChild(this._createEmptyCell(r, c, type));
        }
        container.appendChild(rowEl);
      }
    }

    renderBoard(board) {
      // Reconcile board gems
      const currentIds = new Set(board.gems.keys());

      // 1. Remove gems that no longer exist
      for (const [id, el] of this.renderedGems.entries()) {
        if (!currentIds.has(id)) {
          // If it was animating elimination, wait, else remove immediately
          if (!el.classList.contains('eliminating')) {
             el.remove();
          } else {
             // Let the animation finish before removing
             setTimeout(() => el.remove(), 500); 
          }
          this.renderedGems.delete(id);
        }
      }

      // 2. Update existing or create new gems
      for (const gem of board.gems.values()) {
        let el = this.renderedGems.get(gem.id);
        if (!el) {
          el = this._createGemElement(gem, 'board');
          this.boardEl.appendChild(el);
          this.renderedGems.set(gem.id, el);
        }
        
        // Update CSS coordinates for smooth transition
        el.style.setProperty('--col', gem.col);
        el.style.setProperty('--row', gem.row);
        
        // Handle visual states
        if (gem.isEliminating) {
          el.classList.add('eliminating');
        } else {
          el.classList.remove('eliminating');
        }

        if (this.highlightedMove && this.highlightedMove.gemId === gem.id) {
          el.classList.add('highlight-source');
        } else {
          el.classList.remove('highlight-source');
        }
      }

      this.renderHiddenRow(board);
    }

    renderHiddenRow(board) {
      // The hidden row uses pseudo-gems that don't have permanent IDs in the same way,
      // but they are simple enough to reconcile by their column.
      const currentCols = new Set(board.hiddenRow.map(e => e.col));

      // Remove old
      for (const [col, el] of this.renderedHiddenGems.entries()) {
        if (!currentCols.has(col)) {
          el.remove();
          this.renderedHiddenGems.delete(col);
        }
      }

      // Update/Create
      for (const entry of board.hiddenRow) {
        let el = this.renderedHiddenGems.get(entry.col);
        if (!el) {
          const mockGem = { id: 'h' + entry.col, col: entry.col, row: 0, width: entry.width, isColorful: entry.isColorful };
          el = this._createGemElement(mockGem, 'hidden');
          this.hiddenRowEl.appendChild(el);
          this.renderedHiddenGems.set(entry.col, el);
        }
        el.style.setProperty('--col', entry.col);
        el.style.setProperty('--row', 0);
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
      el.dataset.id = gem.id;

      if (gem.isColorful) {
        el.classList.add('colorful');
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

      // Remove any existing move targets
      document.querySelectorAll('.move-target').forEach(el => el.remove());

      if (move) {
        const gem = board.gems.get(move.gemId);
        if (!gem) return;
        
        const targetEl = document.createElement('div');
        targetEl.className = 'move-target';
        targetEl.style.setProperty('--gem-width', gem.width);
        
        // Position it absolutely on the board grid
        targetEl.style.left = `calc(10px + ${move.targetCol} * (var(--cell-size) + var(--gap)))`;
        targetEl.style.bottom = `calc(10px + ${gem.row} * (var(--cell-size) + var(--gap)))`;
        targetEl.textContent = move.direction === '←' ? '◁' : '▷';
        
        this.boardEl.appendChild(targetEl);
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
