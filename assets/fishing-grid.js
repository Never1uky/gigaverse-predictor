/**
 * Pond grid helpers (pure, no chrome).
 * Dendren default is 4×4; pier is 3×3. Pass `size` (3 or 4) — do not assume 4 everywhere.
 */
export const GRID_SIZE = 4;
export const GRID_CELLS = 16;
export const PATTERN_SIZE = 3;
export const PIER_SIZE = 3;
export const PIER_CELLS = 9;
export const DENDREN_SIZE = 4;
export const DENDREN_CELLS = 16;

export function sizeForBoard(board) {
  if (board === 3) return 3;
  if (board === 4) return 4;
  return 4;
}

export function asInt(value) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

export function asFinite(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

export function isInBounds(p, size = GRID_SIZE) {
  const max = size - 1;
  return Boolean(
    p &&
      Number.isInteger(p.x) &&
      Number.isInteger(p.y) &&
      p.x >= 0 &&
      p.x <= max &&
      p.y >= 0 &&
      p.y <= max,
  );
}

export function cellToPos(cell, size = GRID_SIZE) {
  const max = size * size;
  if (!Number.isInteger(cell) || cell < 1 || cell > max) return null;
  const i = cell - 1;
  return { x: i % size, y: Math.floor(i / size) };
}

export function posToCell(p, size = GRID_SIZE) {
  if (!isInBounds(p, size)) return null;
  return p.y * size + p.x + 1;
}

/**
 * API pair [x, y] is 1-indexed: x = column left→right, y = row top→bottom.
 * Convert to internal 0-indexed {x,y}; cell = y*size + x + 1.
 * Arrays with length !== 2 (e.g. lastMovePath [4]) are not coordinates.
 */
export function parseApiCoordPair(raw, size = GRID_SIZE) {
  if (!Array.isArray(raw) || raw.length !== 2) {
    return { pos: null, cell: null, diagnostic: Array.isArray(raw) ? "path_not_xy" : "not_pair" };
  }
  const a = asInt(raw[0]);
  const b = asInt(raw[1]);
  if (a == null || b == null) return { pos: null, cell: null, diagnostic: "not_int_pair" };
  const pos = { x: a - 1, y: b - 1 };
  if (!isInBounds(pos, size)) return { pos: null, cell: null, diagnostic: `out_of_bounds:${a},${b}` };
  return { pos, cell: posToCell(pos, size), diagnostic: null };
}

/** Parse {x,y}|{col,row}|[x,y] 1-indexed|cell 1..N|cell 0..N-1 → {x,y} or diagnostic. */
export function parseBoardPosition(value, size = GRID_SIZE) {
  const maxCell = size * size;
  if (value == null) return { pos: null, cell: null, diagnostic: "null" };
  if (Array.isArray(value)) return parseApiCoordPair(value, size);
  if (typeof value === "object") {
    const x = asInt(value.x ?? value.col ?? value.column);
    const y = asInt(value.y ?? value.row);
    if (x == null || y == null) return { pos: null, cell: null, diagnostic: "missing_xy" };
    const p = { x, y };
    if (!isInBounds(p, size)) return { pos: null, cell: null, diagnostic: `out_of_bounds:${x},${y}` };
    return { pos: p, cell: posToCell(p, size), diagnostic: null };
  }
  const n = asInt(value);
  if (n == null) return { pos: null, cell: null, diagnostic: "not_a_coord" };
  if (n >= 1 && n <= maxCell) return { pos: cellToPos(n, size), cell: n, diagnostic: null };
  if (n >= 0 && n <= maxCell - 1) {
    const cell = n + 1;
    return { pos: cellToPos(cell, size), cell, diagnostic: null };
  }
  return { pos: null, cell: null, diagnostic: `cell_out_of_range:${n}` };
}

/**
 * Parse when board size is unknown: 4×4 if cell>9 or x/y>2, else try `preferredSize`.
 */
export function parseBoardPositionAuto(value, preferredSize = null) {
  if (value == null) return { pos: null, cell: null, diagnostic: "null", size: null };
  if (Array.isArray(value)) {
    if (value.length !== 2) return { pos: null, cell: null, diagnostic: "path_not_xy", size: null };
    const a = asInt(value[0]);
    const b = asInt(value[1]);
    if (a == null || b == null) return { pos: null, cell: null, diagnostic: "not_int_pair", size: null };
    const size = a > 3 || b > 3 ? 4 : preferredSize === 3 ? 3 : 4;
    const parsed = parseApiCoordPair(value, size);
    return { ...parsed, size };
  }
  if (typeof value === "object") {
    const x = asInt(value.x ?? value.col ?? value.column);
    const y = asInt(value.y ?? value.row);
    if (x == null || y == null) return { pos: null, cell: null, diagnostic: "missing_xy", size: null };
    const size = x > 2 || y > 2 ? 4 : preferredSize === 3 ? 3 : 4;
    const parsed = parseBoardPosition(value, size);
    return { ...parsed, size };
  }
  const n = asInt(value);
  if (n == null) return { pos: null, cell: null, diagnostic: "not_a_coord", size: null };
  if (n >= 10 && n <= 16) {
    const parsed = parseBoardPosition(n, 4);
    return { ...parsed, size: 4 };
  }
  const size = preferredSize === 3 ? 3 : 4;
  const parsed = parseBoardPosition(n, size);
  return { ...parsed, size };
}

export function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function isAxisAligned(a, b) {
  return a.x === b.x || a.y === b.y;
}

export function isValidStep(from, to, size = GRID_SIZE) {
  if (!isInBounds(from, size) || !isInBounds(to, size)) return false;
  if (from.x === to.x && from.y === to.y) return false;
  if (!isAxisAligned(from, to)) return false;
  const d = manhattan(from, to);
  return d === 1 || d === 2;
}

export function stepDistance(from, to, size = GRID_SIZE) {
  if (!isValidStep(from, to, size)) return null;
  return manhattan(from, to);
}

export function getReachableCells(position, distance, size = GRID_SIZE) {
  if (!isInBounds(position, size) || (distance !== 1 && distance !== 2)) return [];
  const out = [];
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const next = { x: position.x + dx * distance, y: position.y + dy * distance };
    if (isInBounds(next, size) && manhattan(position, next) === distance) out.push(next);
  }
  return out;
}

export function getReachableCellNumbers(position, distance, size = GRID_SIZE) {
  return getReachableCells(position, distance, size)
    .map((p) => posToCell(p, size))
    .filter((c) => c != null);
}

export function allBoardCells(size = GRID_SIZE) {
  const out = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) out.push({ x, y, cell: posToCell({ x, y }, size) });
  }
  return out;
}

/**
 * Legal bobber cells (Dendren 4×4). Assumption: 1 Focus = 1 orthogonal step (Manhattan).
 * focusRemaining null → all cells, unconstrained.
 */
export function legalBobberCells(currentBobber, focusRemaining, size = DENDREN_SIZE) {
  const all = allBoardCells(size);
  if (currentBobber == null || !isInBounds(currentBobber, size)) {
    return { cells: all, unconstrained: focusRemaining == null, assumption: true };
  }
  if (focusRemaining == null) return { cells: all, unconstrained: true, assumption: true };
  const budget = Math.max(0, Math.floor(focusRemaining));
  return {
    cells: all.filter((c) => manhattan(currentBobber, c) <= budget),
    unconstrained: false,
    assumption: true,
  };
}

export function localCellToOffset(cell) {
  if (!Number.isInteger(cell) || cell < 1 || cell > 9) return null;
  const i = cell - 1;
  return { dx: (i % 3) - 1, dy: Math.floor(i / 3) - 1 };
}
