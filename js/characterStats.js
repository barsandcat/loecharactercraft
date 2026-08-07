import { ATTRIBUTES, getRollAttributeList, getRollAttributeDice, normalizeRollMode } from "./cardRender.js";
import { computeAppliedModifiers } from "./probability.js";
import {
  DICE_PROGRESSION,
  BASIC_UPGRADE_FAMILIES,
  ACTION_CATEGORIES,
  SKILL_SLOTS,
  ITEM_SLOT_TYPES,
  ACTION_SLOT_RULES,
} from "./constants.js";
import { getSelectedAdvancementEntries, getFilledLevelCount } from "./advancementTree.js";
import { resolveLoadoutSlots } from "./loadoutSlots.js";

const BASIC_UPGRADE_CARD_IDS = new Set(BASIC_UPGRADE_FAMILIES.map((family) => family.maxCardId));

export function collectCharacterStats(state, selection = state) {
  const stats = {
    attributes: Object.fromEntries(ATTRIBUTES.map((attribute) => [attribute, 0])),
    mob: 0,
    hp: 0,
    divDie: null,
    brill: 0,
    keywordCounts: new Map(),
    skillCounts: new Map(),
    items: new Map(),
    actions: new Map(),
    actionPool: [],
    itemPool: [],
    skillPool: [],
    basicUpgradeSlots: [],
  };

  if (selection.selectedRace) {
    applyRace(state.data, stats, selection.selectedRace, selection.selectedAttributeSet, { kind: "race" });
  }
  if (selection.selectedFreeSkill) {
    incrementCountMap(stats.skillCounts, [selection.selectedFreeSkill]);
    stats.skillPool.push({ skill: selection.selectedFreeSkill, source: { kind: "freeSkill" } });
  }

  if (selection.selectedOrigin) {
    incrementCountMap(stats.keywordCounts, selection.selectedOrigin.Keywords || []);
    (selection.selectedOrigin.Items || []).forEach((item) => addItem(state.data, stats, item, { kind: "origin" }));
    stats.brill += selection.selectedOrigin.Brill || 0;
  }

  if (selection.selectedProf) {
    incrementCountMap(stats.keywordCounts, selection.selectedProf.Keywords || []);
  }

  if (selection.selectedPath) {
    applyEntry(state.data, stats, selection.selectedPath, { kind: "path" });
  }

  getSelectedAdvancementEntries(state, selection.levelUps).forEach(({ slotIndex, entry }) => {
    const level = selection.levelUps[slotIndex].level;
    const isBasicDuplicate = applyEntry(state.data, stats, entry, { kind: "levelUp", slotIndex, level });
    incrementCountMap(stats.skillCounts, entry.Skills || []);
    (entry.Skills || []).forEach((skill) => {
      stats.skillPool.push({ skill, source: { kind: "levelUp", slotIndex } });
    });

    if (isBasicDuplicate) {
      const chosenName = selection.levelUps[slotIndex]?.basicUpgradeFamily ?? null;
      const chosenFamily = chosenName
        ? BASIC_UPGRADE_FAMILIES.find((family) => family.name === chosenName) || null
        : null;
      if (chosenFamily) {
        applyManualBasicUpgrade(state.data, stats, chosenFamily.maxCardId);
      }
      stats.basicUpgradeSlots.push({ slotIndex, chosenFamily });
    }
  });

  (selection.addedItems || []).forEach((itemName) => {
    addItem(state.data, stats, itemName, { kind: "added" });
  });

  // Any pool item with a Card grants that card into actionPool, regardless of
  // source or the item's own equip status — matches every other action-card
  // source (race/path/levelUp already enter actionPool unconditionally; equip
  // status is a downstream/hotbar-only concern, not a pool-membership rule).
  // itemTier is carried along so actionEntryPriority can rank it without a
  // second lookup back into the item pool.
  stats.itemPool.forEach((entry) => {
    if (entry.item.Card) {
      addAction(state.data, stats, entry.item.Card, { kind: "itemCard", itemTier: entry.item.Tier || "Basic" });
    }
  });

  return stats;
}

export function buildPreviewStatsForSelection(state, overrides = {}) {
  return buildActionCardPreviewStats(state, collectCharacterStats(state, createSelectionPreview(state, overrides)));
}

// Only items/skills actually resolved into an equipped slot contribute their
// keywords to dice-roll math — a granted-but-pouched item or skill is not
// active. Uses the same resolver (and the same stale-target self-healing) as
// the item/skill slot panels themselves, so this always agrees with what's
// actually shown equipped on screen.
export function buildActionCardPreviewStats(state, stats) {
  const keywordCounts = new Map(stats.keywordCounts);

  resolveItemSlots(state, stats).slots.forEach((slotResult) => {
    if (slotResult.entry) {
      incrementCountMap(keywordCounts, slotResult.entry.item.Keywords || []);
    }
  });

  resolveSkillSlots(state, stats).slots.forEach((slotResult) => {
    if (slotResult.entry) {
      keywordCounts.set(slotResult.entry.skill, (keywordCounts.get(slotResult.entry.skill) || 0) + 1);
    }
  });

  return {
    attributes: { ...stats.attributes },
    keywordCounts,
  };
}

export function createSelectionPreview(state, overrides = {}) {
  return {
    selectedRace: overrides.selectedRace !== undefined ? overrides.selectedRace : state.selectedRace,
    selectedAttributeSet: overrides.selectedAttributeSet !== undefined ? overrides.selectedAttributeSet : state.selectedAttributeSet,
    selectedFreeSkill: overrides.selectedFreeSkill !== undefined ? overrides.selectedFreeSkill : state.selectedFreeSkill,
    selectedOrigin: overrides.selectedOrigin !== undefined ? overrides.selectedOrigin : state.selectedOrigin,
    selectedProf: overrides.selectedProf !== undefined ? overrides.selectedProf : state.selectedProf,
    selectedPath: overrides.selectedPath !== undefined ? overrides.selectedPath : state.selectedPath,
    levelUps: overrides.levelUps !== undefined ? overrides.levelUps : state.levelUps,
    addedItems: state.addedItems,
  };
}

export function buildLevelUpPreview(state, slotIndex, slotPatch) {
  return state.levelUps.map((slot, index) => (
    index === slotIndex ? { ...slot, ...slotPatch } : { ...slot }
  ));
}

export function buildActionCardPreviews(data, cardIds, previewStats = null) {
  return (cardIds || [])
    .map((cardId) => {
      const card = data.ActionCards[cardId];
      if (!card) {
        return null;
      }
      return previewStats
        ? { cardId, card, previewStats }
        : { cardId, card };
    })
    .filter(Boolean);
}

export function buildItemPreviews(data, itemNames) {
  return (itemNames || [])
    .map((itemName) => data.Items[itemName] || null)
    .filter(Boolean);
}

export function applyRace(data, stats, race, attributes, source) {
  if (attributes) {
    Object.keys(attributes).forEach((key) => {
      stats.attributes[key] += attributes[key];
    });
  }

  stats.mob = race.MOB || 0;
  stats.hp = race.HP || 0;
  stats.divDie = race.DIV || null;
  incrementCountMap(stats.keywordCounts, race.Keywords || []);
  incrementCountMap(stats.skillCounts, race.Skills || []);
  (race.ActionCards || []).forEach((action) => addAction(data, stats, action, source));
}

export function applyEntry(data, stats, entry, source) {
  (entry.Attributes || []).forEach((attributeSet) => {
    Object.keys(attributeSet).forEach((key) => {
      stats.attributes[key] += attributeSet[key];
    });
  });

  stats.mob += entry.MOB || 0;
  stats.hp += entry.HP || 0;
  stats.brill += entry.Brill || 0;
  incrementCountMap(stats.keywordCounts, entry.Keywords || []);

  const divValue = entry.DIV;
  if (divValue === "Upgrade") {
    stats.divDie = upgradeDivDie(stats.divDie);
  } else if (divValue) {
    stats.divDie = divValue;
  }

  (entry.Items || []).forEach((item) => addItem(data, stats, item, source));

  let sawBasicDuplicate = false;
  (entry.ActionCards || []).forEach((action) => {
    if (addAction(data, stats, action, source)) {
      sawBasicDuplicate = true;
    }
  });
  return sawBasicDuplicate;
}

export function addItem(data, stats, itemName, source) {
  const itemObj = data.Items[itemName];
  if (!itemObj) {
    console.warn('Item not found:', itemName);
    return;
  }

  const key = itemName + "::" + itemObj.Type;
  if (!stats.items.has(key)) {
    stats.items.set(key, itemObj);
    stats.itemPool.push({ itemName, item: itemObj, source });
  }
}

// Live state stores added items by name; the URL wire format stores them by
// the stable numeric Id data.json gives every item, so decoding needs this
// reverse lookup.
export function getItemNameById(data, itemId) {
  const entry = Object.entries(data.Items).find(([, item]) => item.Id === itemId);
  return entry ? entry[0] : null;
}

function upgradeActionSlot(stats, card, cardId, source) {
  const current = stats.actions.get(card.Front.Name);
  if (!current) {
    const stored = { ...card, _cardId: cardId };
    stats.actions.set(card.Front.Name, stored);
    stats.actionPool.push({ cardName: card.Front.Name, card: stored, source });
    return;
  }
  if (card.Level > current.Level) {
    const stored = { ...card, _cardId: cardId };
    stats.actions.set(card.Front.Name, stored);
    const poolEntry = stats.actionPool.find((entry) => entry.cardName === card.Front.Name);
    if (poolEntry) {
      poolEntry.card = stored;
    }
  }
}

export function addAction(data, stats, cardId, source) {
  const card = data.ActionCards[cardId];
  if (!card) {
    return false;
  }
  const current = stats.actions.get(card.Front.Name);
  const isBasicDuplicate = Boolean(current && card.Level === current.Level && BASIC_UPGRADE_CARD_IDS.has(cardId));
  upgradeActionSlot(stats, card, cardId, source);
  return isBasicDuplicate;
}

export function applyManualBasicUpgrade(data, stats, cardId) {
  const card = data.ActionCards[cardId];
  if (!card) {
    return;
  }
  upgradeActionSlot(stats, card, cardId, { kind: "basicUpgrade" });
}

export function getEligibleBasicUpgradeFamilies(data, stats) {
  return BASIC_UPGRADE_FAMILIES.filter((family) => {
    const current = stats.actions.get(family.name);
    const maxLevel = data.ActionCards[family.maxCardId]?.Level;
    return !current || current.Level < maxLevel;
  });
}

export function upgradeDivDie(divDie) {
  const currentIndex = DICE_PROGRESSION.indexOf(divDie);
  if (currentIndex === -1 || currentIndex === DICE_PROGRESSION.length - 1) {
    return divDie;
  }
  return DICE_PROGRESSION[currentIndex + 1];
}

export function incrementCountMap(map, values) {
  values.forEach((value) => {
    map.set(value, (map.get(value) || 0) + 1);
  });
}

export function matchesSkillTarget(source, target) {
  if (!target || !source || target.kind !== source.kind) {
    return false;
  }
  return target.kind === "levelUp" ? target.slotIndex === source.slotIndex : true;
}

function normalizeActionCategory(category) {
  return ACTION_CATEGORIES.includes(category) ? category : "Offensive";
}

export function resolveSkillSlots(state, stats) {
  const slots = Array.from({ length: SKILL_SLOTS }, () => ({ locked: false, matches: () => true }));
  return resolveLoadoutSlots({
    pool: stats.skillPool,
    slots,
    overrides: state.skillSlots,
    matchesTarget: (entry, target) => matchesSkillTarget(entry.source, target),
  });
}

export function resolveItemSlots(state, stats) {
  const slots = ITEM_SLOT_TYPES.map((type) => ({
    locked: false,
    matches: (entry) => entry.item.Type === type,
  }));
  return resolveLoadoutSlots({
    pool: stats.itemPool,
    slots,
    overrides: state.itemSlots,
    matchesTarget: (entry, target) => entry.itemName === target.itemName,
  });
}

// Takes any array of item-pool entries — the full pool (slot pickers, so a
// slot can offer reassigning something already equipped elsewhere) or just
// the pouch (the pouch browser) — filtering logic doesn't care which.
export function getEligibleItemsForSlot(items, slotIndex) {
  const type = ITEM_SLOT_TYPES[slotIndex];
  return items.filter((entry) => entry.item.Type === type);
}

// Same as getEligibleItemsForSlot, for action-card pool entries.
export function getEligibleActionsForSlot(cards, slotIndex) {
  const rule = ACTION_SLOT_RULES[slotIndex];
  return cards.filter((entry) => rule.categories.includes(normalizeActionCategory(entry.card.Front.Category)));
}

// A card is a weak fit for the build if its Front roll, computed against the
// character's current attributes/keywords, nets 2 dice or fewer (0 included —
// Math.max floors negative modifier totals at 0). Cards with no Front roll
// (pure utility/passive) are never judged weak by this rule. Reuses the exact
// math behind each card's on-screen "(N successes)" preview (cardRender.js /
// probability.js) so this yardstick matches what the player already sees.
function isWeakRollForBuild(card, attrs, keywordCounts) {
  const roll = card.Front?.Roll;
  if (!roll) {
    return false;
  }
  const attList = getRollAttributeList(roll);
  const mode = normalizeRollMode(roll.Mode);
  const attDice = getRollAttributeDice(attrs, attList, mode);
  const appliedMods = roll.Modifiers ? computeAppliedModifiers(roll.Modifiers, keywordCounts) : [];
  const modDiceTotal = appliedMods.reduce((sum, mod) => sum + mod.totalDice, 0);
  const effectiveDice = Math.max(0, attDice + modDiceTotal);
  return effectiveDice <= 2;
}

// Highest level a level-up slot can be — matches advancementTree.js's
// isAdvancementLevelUnlocked, which already hardcodes this same ceiling
// (mirrors cardDatabase.js's LOCK_LEVEL_MAP doing the same).
const MAX_ADVANCEMENT_LEVEL = 8;

// Priority for the hotbar's auto-fill when the pool has more eligible cards
// than slots. Whether the card is a weak roll for this build (see
// isWeakRollForBuild) is the dominant, primary split — e.g. Bash vs Shoot
// resolves by which one this character's attributes actually make
// worthwhile, regardless of provenance. Provenance only breaks ties *within*
// the weak/non-weak group (applied to both groups identically, so a weak
// path card still ranks above a weak un-upgraded basic if a weak card ever
// becomes unavoidable):
//   0 — path cards, a basic-family card at its max tier, an item card
//       granted by an Uncommon/Rare/Quest item, or a level-up card (level-up
//       cards are further ranked among themselves — see actionEntrySubRank)
//   1 — an item card granted by a Basic/Common item
//   2 — a basic-family card not yet at its max tier
function actionEntryPriority(entry, previewStats) {
  const weak = isWeakRollForBuild(entry.card, previewStats.attributes, previewStats.keywordCounts);
  return (weak ? 1 : 0) * 100 + actionEntryTierRank(entry) * 10 + actionEntrySubRank(entry);
}

function actionEntryTierRank(entry) {
  switch (entry.source.kind) {
    case "path":
    case "levelUp":
      return 0;
    case "race": {
      const family = BASIC_UPGRADE_FAMILIES.find((candidate) => candidate.name === entry.cardName);
      const atMaxTier = Boolean(family) && entry.card._cardId === family.maxCardId;
      return atMaxTier ? 0 : 2;
    }
    case "itemCard": {
      const isHighItemTier = ["Uncommon", "Rare", "Quest"].includes(entry.source.itemTier);
      return isHighItemTier ? 0 : 1;
    }
    default:
      return 2;
  }
}

// Tie-break within tier 0: a level-up card granted later in the tree ranks
// above one granted earlier. Path cards, maxed-out basics, and high-tier
// item cards are treated as being at least as good as the latest possible
// level-up pick (subRank 0), so this refinement only ever reorders level-up
// cards relative to each other — it never displaces those other tier-0
// entries, since none of them can score better than 0 here.
function actionEntrySubRank(entry) {
  if (entry.source.kind === "levelUp" && typeof entry.source.level === "number") {
    return MAX_ADVANCEMENT_LEVEL - entry.source.level;
  }
  return 0;
}

export function resolveActionSlots(state, stats) {
  const filledLevelCount = getFilledLevelCount(state);
  const previewStats = buildActionCardPreviewStats(state, stats);
  const slots = ACTION_SLOT_RULES.map((rule) => ({
    locked: filledLevelCount < rule.unlockAt,
    matches: (entry) => rule.categories.includes(normalizeActionCategory(entry.card.Front.Category)),
  }));
  return resolveLoadoutSlots({
    pool: stats.actionPool,
    slots,
    overrides: state.actionSlots,
    matchesTarget: (entry, target) => entry.cardName === target.cardName,
    priority: (entry) => actionEntryPriority(entry, previewStats),
  });
}
