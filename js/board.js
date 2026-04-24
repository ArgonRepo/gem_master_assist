(function(global) {
  const { COLS, MAX_ROWS } = global.GemConstants;

  let _nextId = 1;
  
  global.GemBoardUtils = {
    resetIdCounter: function() { _nextId = 1; }
  };

  class Gem {
    constructor(id, row, col, width, isColorful = false) {
      this.id = id;
      this.row = row;
      this.col = col;
      this.width = width;
      this.isColorful = isColorful;
    }
    clone() {
      return new Gem(this.id, this.row, this.col, this.width, this.isColorful);
    }
  }

  class Board {
    constructor() {
      this.grid = Array.from({ length: MAX_ROWS }, () => Array(COLS).fill(null));
      this.gems = new Map();
      this.hiddenRow = []; // [{col, width, isColorful}]
      this.score = 0;
    }

    canPlace(row, col, width, excludeGemId = null) {
      if (col < 0 || col + width > COLS || row < 0 || row >= MAX_ROWS) return false;
      for (let c = col; c < col + width; c++) {
        const occupant = this.grid[row][c];
        if (occupant !== null && occupant !== excludeGemId) return false;
      }
      return true;
    }

    addGem(row, col, width, isColorful = false) {
      if (!this.canPlace(row, col, width)) return null;
      const gem = new Gem(_nextId++, row, col, width, isColorful);
      this.gems.set(gem.id, gem);
      for (let c = col; c < col + width; c++) {
        this.grid[row][c] = gem.id;
      }
      return gem;
    }

    removeGem(gemId) {
      const gem = this.gems.get(gemId);
      if (!gem) return;
      for (let c = gem.col; c < gem.col + gem.width; c++) {
        if (this.grid[gem.row]?.[c] === gemId) {
          this.grid[gem.row][c] = null;
        }
      }
      this.gems.delete(gemId);
    }

    getValidMoves(gemId) {
      const gem = this.gems.get(gemId);
      if (!gem) return [];
      const { row, col: origCol, width } = gem;

      // Temporarily remove gem from grid
      for (let c = origCol; c < origCol + width; c++) this.grid[row][c] = null;

      // Find contiguous empty region containing original position
      let left = origCol;
      while (left > 0 && this.grid[row][left - 1] === null) left--;
      let right = origCol + width - 1;
      while (right < COLS - 1 && this.grid[row][right + 1] === null) right++;

      const moves = [];
      for (let c = left; c <= right - width + 1; c++) {
        if (c !== origCol) moves.push(c);
      }

      // Restore gem
      for (let c = origCol; c < origCol + width; c++) this.grid[row][c] = gemId;
      return moves;
    }

    moveGem(gemId, targetCol) {
      const gem = this.gems.get(gemId);
      if (!gem) return false;
      for (let c = gem.col; c < gem.col + gem.width; c++) this.grid[gem.row][c] = null;
      gem.col = targetCol;
      for (let c = gem.col; c < gem.col + gem.width; c++) this.grid[gem.row][c] = gem.id;
      return true;
    }

    getMaxHeight() {
      for (let r = MAX_ROWS - 1; r >= 0; r--) {
        for (let c = 0; c < COLS; c++) {
          if (this.grid[r][c] !== null) return r + 1;
        }
      }
      return 0;
    }

    isRowComplete(row) {
      if (row < 0 || row >= MAX_ROWS) return false;
      for (let c = 0; c < COLS; c++) {
        if (this.grid[row][c] === null) return false;
      }
      return true;
    }

    getRowFillCount(row) {
      let count = 0;
      for (let c = 0; c < COLS; c++) {
        if (this.grid[row][c] !== null) count++;
      }
      return count;
    }

    getGemAt(row, col) {
      const id = this.grid[row]?.[col];
      return id != null ? this.gems.get(id) : null;
    }

    pushHiddenRow() {
      for (let r = MAX_ROWS - 1; r >= 1; r--) {
        for (let c = 0; c < COLS; c++) {
          this.grid[r][c] = this.grid[r - 1][c];
        }
      }
      for (let c = 0; c < COLS; c++) this.grid[0][c] = null;
      for (const gem of this.gems.values()) gem.row += 1;

      for (const entry of this.hiddenRow) {
        const gem = new Gem(_nextId++, 0, entry.col, entry.width, entry.isColorful);
        this.gems.set(gem.id, gem);
        for (let c = entry.col; c < entry.col + entry.width; c++) {
          this.grid[0][c] = gem.id;
        }
      }
      this.hiddenRow = [];
    }

    clone() {
      const b = new Board();
      b.grid = this.grid.map(row => [...row]);
      for (const [id, gem] of this.gems) b.gems.set(id, gem.clone());
      b.hiddenRow = this.hiddenRow.map(e => ({ ...e }));
      b.score = this.score;
      return b;
    }

    getHoleCount() {
      let holes = 0;
      for (let c = 0; c < COLS; c++) {
        let foundGem = false;
        for (let r = MAX_ROWS - 1; r >= 0; r--) {
          if (this.grid[r][c] !== null) foundGem = true;
          else if (foundGem) holes++;
        }
      }
      return holes;
    }

    getPotentialRowsWeighted() {
      let score = 0;
      let nearComplete = 0;
      const maxH = this.getMaxHeight();
      for (let r = 0; r < maxH; r++) {
        const fill = this.getRowFillCount(r);
        const missing = COLS - fill;
        if (missing === 1) {
          score += 3; // Very close to elimination
          nearComplete++;
        } else if (missing === 2) {
          score += 1; // Moderate potential
          nearComplete++;
        }
      }
      return { score, nearComplete };
    }
  }

  global.GemBoard = Board;
  global.Gem = Gem;

})(window);
