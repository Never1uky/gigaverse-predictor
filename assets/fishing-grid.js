/**
 * 4×4 Dendren Pond grid helpers (pure, no chrome).
 */
export const GRID_SIZE = 4;
export const GRID_CELLS = 16;
export const PATTERN_SIZE = 3;

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

export function isInBounds(p) {
  return Boolean(
    p &&
      Number.isInteger(p.x) &&
      Number.isInteger(p.y) &&
      p.x >= 0 &&
      p.x <= 3 &&
      p.y >= 0 &&
      p.y <= 3,
  );
}

export function cellToPos(cell) {
  if (!Number.isInteger(cell) || cell < 1 || cell > 16) return null;
  const i = cell - 1;
  return { x: i % 4, y: Math.floor(i / 4) };
}

export function posToCell(p) {
  if (!isInBounds(p)) return null;
  return p.y * 4 + p.x + 1;
}

/** Parse {x,y}|{col,row}|cell 1..16|cell 0..15 → {x,y} or diagnostic. */
export function parseBoardPosition(value) {
  if (value == null) return { pos: null, cell: null, diagnostic: "null" };
  if (typeof value === "object" && !Array.isArray(value)) {
    const x = asInt(value.x ?? value.col ?? value.column);
    const y = asInt(value.y ?? value.row);
    if (x == null || y == null) return { pos: null, cell: null, diagnostic: "missing_xy" };
    const p = { x, y };
    if (!isInBounds(p)) return { pos: null, cell: null, diagnostic: `out_of_bounds:${x},${y}` };
    return { pos: p, cell: posToCell(p), diagnostic: null };
  }
  const n = asInt(value);
  if (n == null) return { pos: null, cell: null, diagnostic: "not_a_coord" };
  if (n >= 1 && n <= 16) return { pos: cellToPos(n), cell: n, diagnostic: null };
  if (n >= 0 && n <= 15) {
    const cell = n + 1;
    return { pos: cellToPos(cell), cell, diagnostic: null };
  }
  return { pos: null, cell: null, diagnostic: `cell_out_of_range:${n}` };
}

export function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function isAxisAligned(a, b) {
  return a.x === b.x || a.y === b.y;
}

export function isValidStep(from, to) {
  if (!isInBounds(from) || !isInBounds(to)) return false;
  if (from.x === to.x && from.y === to.y) return false;
  if (!isAxisAligned(from, to)) return false;
  const d = manhattan(from, to);
  return d === 1 || d === 2;
}

export function stepDistance(from, to) {
  if (!isValidStep(from, to)) return null;
  return manhattan(from, to);
}

export function getReachableCells(position, distance) {
  if (!isInBounds(position) || (distance !== 1 && distance !== 2)) return [];
  const out = [];
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const next = { x: position.x + dx * distance, y: position.y + dy * distance };
    if (isInBounds(next) && manhattan(position, next) === distance) out.push(next);
  }
  return out;
}

export function getReachableCellNumbers(position, distance) {
  return getReachableCells(position, distance)
    .map(posToCell)
    .filter((c) => c != null);
}

export function allBoardCells() {
  const out = [];
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) out.push({ x, y, cell: posToCell({ x, y }) });
  }
  return out;
}

/**
 * Legal bobber cells. Assumption: 1 Focus = 1 orthogonal step (Manhattan).
 * focusRemaining null → all 16, unconstrained.
 */
export function legalBobberCells(currentBobber, focusRemaining) {
  const all = allBoardCells();
  if (currentBobber == null || !isInBounds(currentBobber)) {
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
