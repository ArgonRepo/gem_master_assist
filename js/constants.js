window.GemConstants = {
  COLS: 8,
  ROWS: 10,
  MAX_ROWS: 14,
  GEM_WIDTHS: [1, 2, 3, 4],
  calcScore: function(rowCount) {
    if (rowCount <= 0) return 0;
    const basePts = rowCount * 8; // each row = 8 cells = 8 pts
    const multiplier = 1 + Math.max(0, rowCount - 1) * 0.5;
    return basePts * multiplier;
  }
};
