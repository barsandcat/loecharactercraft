export const LEVEL_UP_SLOTS = 12;
export const DICE_PROGRESSION = ["D4", "D6", "D8", "D10", "D12", "D12+D4", "D20", "D20+D6"];
export const ACTION_CATEGORIES = ["Offensive", "Defensive", "Support"];
export const ITEM_TYPE_ORDER = ["Head", "Chest", "Hand", "Feet", "Small"];

// Canonical order for the basic-action-upgrade bit encoding in stateCodec.js —
// can be extended but never reordered without bumping the URL format version.
export const BASIC_UPGRADE_FAMILIES = [
  { name: "Bash", maxCardId: "B14" },
  { name: "Shoot", maxCardId: "B16" },
  { name: "Endurance", maxCardId: "B02" },
  { name: "Dodge", maxCardId: "B05" },
  { name: "Combat Insight", maxCardId: "B08" },
  { name: "Command", maxCardId: "B11" },
];

export const SKILL_SLOTS = 3;

// Index-aligned with state.itemSlots — which item Type each of the 10 slots accepts.
export const ITEM_SLOT_TYPES = ["Head", "Chest", "Hand", "Hand", "Hand", "Feet", "Small", "Small", "Small", "Small"];

// Index-aligned with state.actionSlots — which categories each of the 10
// hotbar slots accepts, and the getFilledLevelCount() threshold that unlocks it.
export const ACTION_SLOT_RULES = [
  { categories: ["Offensive"], unlockAt: 0 },
  { categories: ["Defensive"], unlockAt: 0 },
  { categories: ["Offensive", "Support"], unlockAt: 0 },
  { categories: ["Defensive", "Support"], unlockAt: 0 },
  { categories: ["Offensive", "Support"], unlockAt: 0 },
  { categories: ["Defensive", "Support"], unlockAt: 0 },
  { categories: ["Offensive", "Support"], unlockAt: 1 },
  { categories: ["Defensive", "Support"], unlockAt: 3 },
  { categories: ["Offensive", "Defensive", "Support"], unlockAt: 5 },
  { categories: ["Offensive", "Defensive", "Support"], unlockAt: 7 },
];
