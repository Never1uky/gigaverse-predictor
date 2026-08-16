const BURN_RING_ID = 901;
const LIFE_STEAL_RING_ID = 904;
const DEFAULT_BURN_TICK = 1;
const DEFAULT_BURN_ON_WIN_STACKS = 1;
const MAX_BURN_STACKS = 2;
const DEFAULT_ON_WIN_DAMAGE = 2;
const DEFAULT_LIFESTEAL = 2;

const DOT_WORDS = ["burn", "burning", "on fire", "bleed", "bleeding", "poison", "poisoned", "ignite", "ignited"];

function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function blobOf(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).toLowerCase();
  }
  if (Array.isArray(value)) return value.map(blobOf).join(" ");
  if (typeof value === "object") {
    try {
      return JSON.stringify(value).toLowerCase();
    } catch {
      return "";
    }
  }
  return "";
}

function itemIds(item) {
  if (item == null || typeof item !== "object") {
    const n = asNumber(item);
    return n != null ? [n] : [];
  }
  const keys = ["id", "ID_CID", "docId", "UINT256_CID", "abilityId", "itemId", "gameItemId"];
  const out = [];
  for (const key of keys) {
    const n = asNumber(item[key]);
    if (n != null) out.push(n);
    if (typeof item[key] === "string") {
      const m = item[key].match(/(\d+)/);
      if (m) out.push(Number(m[1]));
    }
  }
  return out;
}

function pushUnique(list, value) {
  if (value == null) return;
  if (Array.isArray(value)) {
    for (const v of value) pushUnique(list, v);
    return;
  }
  list.push(value);
}

function collectPlayerItems(player) {
  const items = [];
  if (!player || typeof player !== "object") return items;
  const keys = [
    "abilities",
    "abilityIds",
    "ability",
    "loadout",
    "equipment",
    "status",
    "statuses",
    "statusEffects",
    "buffs",
    "debuffs",
    "effects",
    "burn",
    "Burn"
  ];
  for (const key of keys) {
    if (key in player) pushUnique(items, player[key]);
  }
  return items;
}

function stacksFrom(item) {
  if (item == null) return null;
  if (typeof item === "number" && Number.isFinite(item)) return item > 0 ? item : null;
  if (typeof item !== "object") return null;
  for (const key of ["stacks", "stack", "count", "amount", "value", "selectedVal1", "current", "burn"]) {
    const n = asNumber(item[key]);
    if (n != null && n > 0) return n;
  }
  return null;
}

function looksLike(blob, words) {
  return words.some((w) => blob.includes(w));
}

function statusKind(blob) {
  if (looksLike(blob, ["burn", "burning", "on fire", "ignite", "ignited"])) return "burn";
  if (looksLike(blob, ["bleed", "bleeding"])) return "bleed";
  if (looksLike(blob, ["poison", "poisoned"])) return "poison";
  if (blob.includes("weak")) return "weak";
  if (blob.includes("vulnerable")) return "vulnerable";
  return null;
}

function parseStatusEntry(raw) {
  const blob = blobOf(raw);
  const kind = statusKind(blob);
  if (!kind) return null;
  const stacks = stacksFrom(raw) ?? 1;
  return {
    kind,
    stacks: Math.min(MAX_BURN_STACKS, Math.max(1, stacks)),
    amountPerTick: DEFAULT_BURN_TICK
  };
}

function parseOurStatuses(player, events) {
  const statuses = { burn: null, bleed: null, poison: null };
  for (const item of collectPlayerItems(player)) {
    const parsed = parseStatusEntry(item);
    if (!parsed) continue;
    const prev = statuses[parsed.kind];
    if (!prev || parsed.stacks > prev.stacks) statuses[parsed.kind] = parsed;
  }
  if (player && typeof player === "object") {
    const directBurn = asNumber(player.burn) ?? asNumber(player.Burn) ?? asNumber(player.BURN);
    if (directBurn != null && directBurn > 0) {
      statuses.burn = {
        kind: "burn",
        stacks: Math.min(MAX_BURN_STACKS, directBurn),
        amountPerTick: DEFAULT_BURN_TICK
      };
    }
  }
  if (Array.isArray(events)) {
    for (const ev of events) {
      const blob = blobOf(ev);
      if (!looksLike(blob, DOT_WORDS)) continue;
      const parsed = parseStatusEntry(ev) ?? parseStatusEntry(blob);
      if (!parsed) continue;
      const playerId = asNumber(ev?.playerId);
      if (playerId === 1) continue;
      const prev = statuses[parsed.kind];
      if (!prev || parsed.stacks > prev.stacks) statuses[parsed.kind] = parsed;
    }
  }
  return statuses;
}

function matchEnemyAbility(item) {
  const ids = itemIds(item);
  const blob = blobOf(item);
  const ability = {
    ids,
    blob,
    burnOnPaperWin: false,
    lifestealOnWin: false,
    onWin: null,
    extraDamage: null
  };
  if (ids.includes(BURN_RING_ID) || blob.includes("burn ring")) {
    ability.burnOnPaperWin = true;
  }
  if (ids.includes(LIFE_STEAL_RING_ID) || blob.includes("life steal") || blob.includes("lifesteal")) {
    ability.lifestealOnWin = true;
  }
  if (blob.includes("burn") && (blob.includes("shield") || blob.includes("paper"))) {
    ability.burnOnPaperWin = true;
  }
  if (blob.includes("burn") || blob.includes("ignite") || blob.includes("on fire")) {
    ability.burnOnPaperWin = true;
  }
  if (blob.includes("onwin") || blob.includes("on_win") || blob.includes("on win")) {
    const move = blob.includes("paper") || blob.includes("shield")
      ? "paper"
      : blob.includes("rock") || blob.includes("sword")
        ? "rock"
        : blob.includes("scissor") || blob.includes("spell")
          ? "scissor"
          : null;
    const amount = stacksFrom(item) ?? DEFAULT_ON_WIN_DAMAGE;
    ability.onWin = { move, amount };
    if (move === "paper" && blob.includes("burn")) ability.burnOnPaperWin = true;
  }
  return ability;
}

function parseEnemyAbilities(player, events) {
  const abilities = {
    ids: [],
    burnOnPaperWin: false,
    burnOnWinAmount: DEFAULT_BURN_ON_WIN_STACKS,
    lifestealOnWin: false,
    lifestealAmount: DEFAULT_LIFESTEAL,
    onWin: {},
    raw: []
  };
  for (const item of collectPlayerItems(player)) {
    const matched = matchEnemyAbility(item);
    abilities.raw.push(matched);
    for (const id of matched.ids) {
      if (!abilities.ids.includes(id)) abilities.ids.push(id);
    }
    if (matched.burnOnPaperWin) abilities.burnOnPaperWin = true;
    if (matched.lifestealOnWin) abilities.lifestealOnWin = true;
    if (matched.onWin?.move) {
      abilities.onWin[matched.onWin.move] = matched.onWin.amount;
    }
  }
  if (Array.isArray(events)) {
    for (const ev of events) {
      const blob = blobOf(ev);
      if (blob.includes("burn") && (blob.includes("shield") || blob.includes("paper") || blob.includes("applystatus") || blob.includes("apply_status") || blob.includes("apply status"))) {
        abilities.burnOnPaperWin = true;
      }
      if (blob.includes("burn") && (blob.includes("win") || blob.includes("won"))) {
        abilities.burnOnPaperWin = true;
      }
      if (looksLike(blob, ["lifesteal", "life steal"])) abilities.lifestealOnWin = true;
    }
  }
  return abilities;
}

function collectAbilityContext(response) {
  const body = response ?? {};
  const data = body.data ?? body;
  const run = data.run ?? {};
  const events = data.events;
  const players = Array.isArray(run.players) ? run.players : [];
  const enemyAbilities = parseEnemyAbilities(players[1], events);
  const ourStatuses = parseOurStatuses(players[0], events);
  return {
    enemyAbilities,
    ourStatuses,
    burnOnPaperWin: enemyAbilities.burnOnPaperWin,
    enemyLoadout: {
      abilityIds: enemyAbilities.ids,
      burnOnPaperWin: enemyAbilities.burnOnPaperWin,
      lifestealOnWin: enemyAbilities.lifestealOnWin
    }
  };
}

export {
  BURN_RING_ID,
  DEFAULT_BURN_ON_WIN_STACKS,
  DEFAULT_BURN_TICK,
  DEFAULT_LIFESTEAL,
  DEFAULT_ON_WIN_DAMAGE,
  LIFE_STEAL_RING_ID,
  MAX_BURN_STACKS,
  blobOf,
  collectAbilityContext,
  parseEnemyAbilities,
  parseOurStatuses
};
