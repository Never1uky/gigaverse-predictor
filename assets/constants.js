const MOVE_UI_LABELS = {
  rock: "Sword",
  paper: "Shield",
  scissor: "Spell"
};
const MOVE_ORDER = ["rock", "paper", "scissor"];
const RPS_BEATS = {
  rock: "scissor",
  paper: "rock",
  scissor: "paper"
};
const RPS_COUNTER = {
  rock: "paper",
  paper: "scissor",
  scissor: "rock"
};
export {
  MOVE_ORDER as M,
  RPS_BEATS as R,
  MOVE_UI_LABELS as a,
  RPS_COUNTER as b
};
