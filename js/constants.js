window.GemConstants = {
  COLS: 8,
  ROWS: 10,
  MAX_ROWS: 14,
  GEM_WIDTHS: [1, 2, 3, 4],
  GEM_COLORS: [
    '#5B9BD5', '#70AD47', '#ED7D31', '#FFC000',
    '#A855F7', '#EC4899', '#06B6D4', '#F43F5E',
    '#8B5CF6', '#10B981', '#F59E0B', '#3B82F6',
  ],
  WEIGHTS: {
    immediateScore: 0.40,
    heightSafety:   0.30,
    potential:      0.20,
    holes:          0.10,
  },
  calcScore: function(rowCount) {
    if (rowCount <= 0) return 0;
    const basePts = rowCount * 8; // each row = 8 cells = 8 pts
    const multiplier = 1 + Math.max(0, rowCount - 1) * 0.5;
    return basePts * multiplier;
  }
};
