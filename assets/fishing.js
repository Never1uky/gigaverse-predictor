/**
 * Gigaverse Fishing Predictor + Advisor — public API (pure, no chrome).
 * Board: 4×4 Dendren Pond. Fish: orthogonal Manhattan 1|2. Cards: 3×3 vs bobber.
 */
export {
  GRID_SIZE,
  GRID_CELLS,
  PATTERN_SIZE,
  asInt,
  asFinite,
  isInBounds,
  cellToPos,
  posToCell,
  parseBoardPosition,
  manhattan,
  isAxisAligned,
  isValidStep,
  stepDistance,
  getReachableCells,
  getReachableCellNumbers,
  allBoardCells,
  legalBobberCells,
  localCellToOffset,
} from "./fishing-grid.js";

export {
  SENSITIVE_KEY_RE,
  isFishingActionName,
  isFishingUrl,
  safeJsonKeys,
  looksLikeCombatPayload,
  looksLikeFishingPayload,
  walk,
  fishingParentScore,
  extractFishPosition,
  extractBobberPosition,
  extractFocus,
  extractFishingIds,
  normalizeSpellCard,
  extractFishingHand,
  redactForLog,
  isActiveFishingSession,
  visibleFishingOverlay,
} from "./fishing-parse.js";

export {
  applyPattern,
  patternAscii,
  cellOutcomeOnBoard,
  scoreCardAtBobber,
  chooseFishingAdvice,
  formatCardAdvice,
  formatAdviceLine,
  recommendCard,
  cellOutcome,
  scoreCard,
} from "./fishing-advisor.js";

export {
  detectMode,
  predictFishing,
  movementFingerprint,
  makeSessionId,
  applyFishPosition,
  applyBobberPosition,
  emptySession,
  shouldOpenNewSession,
  sessionShouldEnd,
  summarizeFishingStats,
  renderAsciiGrid,
} from "./fishing-session.js";

export { detectFishingBoard } from "./community.js";
