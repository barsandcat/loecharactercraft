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
    const isBasicDuplicate = applyEntry(state.data, stats, entry, { kind: "levelUp", slotIndex });
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
  return stats;
}

export function buildPreviewStatsForSelection(state, overrides = {}) {
  return buildActionCardPreviewStats(collectCharacterStats(state, createSelectionPreview(state, overrides)));
}

export function buildActionCardPreviewStats(stats) {
  const keywordCounts = new Map(stats.keywordCounts);
  for (const itemObj of stats.items.values()) {
    incrementCountMap(keywordCounts, itemObj.Keywords || []);
  }
  for (const [skill, count] of stats.skillCounts) {
    keywordCounts.set(skill, (keywordCounts.get(skill) || 0) + count);
  }
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

export function getEligibleItemPouchForSlot(pouch, slotIndex) {
  const type = ITEM_SLOT_TYPES[slotIndex];
  return pouch.filter((entry) => entry.item.Type === type);
}

export function getEligibleActionPouchForSlot(pouch, slotIndex) {
  const rule = ACTION_SLOT_RULES[slotIndex];
  return pouch.filter((entry) => rule.categories.includes(normalizeActionCategory(entry.card.Front.Category)));
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

// Priority for the hotbar's auto-fill when the pool has more eligible cards
// than slots. Whether the card is a weak roll for this build dominates (e.g.
// Bash vs Shoot resolves by which one this character's attributes actually
// make worthwhile) — a basic-family card not yet at its max tier is only a
// secondary tie-break among cards that are equally weak or equally strong,
// never an independent override that could preempt the roll-fit check (two
// same-tier-status basics, like two un-upgraded basics, must still be able
// to be told apart by build fit).
function actionEntryPriority(entry, previewStats) {
  const weak = isWeakRollForBuild(entry.card, previewStats.attributes, previewStats.keywordCounts);
  let notAtMaxTier = 0;
  if (entry.source.kind === "race") {
    const family = BASIC_UPGRADE_FAMILIES.find((candidate) => candidate.name === entry.cardName);
    const atMaxTier = Boolean(family) && entry.card._cardId === family.maxCardId;
    notAtMaxTier = atMaxTier ? 0 : 1;
  }
  return (weak ? 2 : 0) + notAtMaxTier;
}

export function resolveActionSlots(state, stats) {
  const filledLevelCount = getFilledLevelCount(state);
  const previewStats = buildActionCardPreviewStats(stats);
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
