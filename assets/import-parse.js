/**
 * Pure helpers for popup multi-file import (no chrome).
 */

export function isLiveFightsQaPayload(parsed) {
  return Boolean(
    parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      Array.isArray(parsed.runs) &&
      parsed.meta &&
      !Array.isArray(parsed.moves)
  );
}

/** Extract move rows from Export JSON / Full shapes. */
export function extractMovesFromParsed(parsed) {
  if (Array.isArray(parsed)) return { moves: parsed, reason: null };
  if (parsed && typeof parsed === "object") {
    if (isLiveFightsQaPayload(parsed)) {
      return { moves: null, reason: "live_fights_qa" };
    }
    if (Array.isArray(parsed.moves)) return { moves: parsed.moves, reason: null };
  }
  return { moves: null, reason: "bad_shape" };
}

export function looksLikeCommunityText(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return false;
  if (raw.startsWith("[")) {
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) && arr.some((r) => r && (r.kind === "combat" || r.kind === "fishing"));
    } catch {
      return false;
    }
  }
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      const row = JSON.parse(t);
      return Boolean(row && (row.kind === "combat" || row.kind === "fishing"));
    } catch {
      return false;
    }
  }
  return false;
}

/** Dedupe move rows by id across multiple files (first wins). */
export function mergeMovesById(moveLists) {
  const seen = new Set();
  const out = [];
  for (const list of moveLists) {
    if (!Array.isArray(list)) continue;
    for (const move of list) {
      if (!move || typeof move !== "object") continue;
      const id = move.id != null ? String(move.id) : null;
      if (id) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      out.push(move);
    }
  }
  return out;
}
