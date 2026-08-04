import { ATTRIBUTES } from "./cardRender.js";
import { DICE_PROGRESSION, BASIC_UPGRADE_FAMILIES } from "./constants.js";
import { getSelectedAdvancementEntries } from "./advancementTree.js";

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
    basicUpgradeSlots: [],
  };

  if (selection.selectedRace) {
    applyRace(state.data, stats, selection.selectedRace, selection.selectedAttributeSet);
  }
  if (selection.selectedFreeSkill) {
    incrementCountMap(stats.skillCounts, [selection.selectedFreeSkill]);
  }

  if (selection.selectedOrigin) {
    incrementCountMap(stats.keywordCounts, selection.selectedOrigin.Keywords || []);
    (selection.selectedOrigin.Items || []).forEach((item) => addItem(state.data, stats, item));
    stats.brill += selection.selectedOrigin.Brill || 0;
  }

  if (selection.selectedProf) {
    incrementCountMap(stats.keywordCounts, selection.selectedProf.Keywords || []);
  }

  if (selection.selectedPath) {
    applyEntry(state.data, stats, selection.selectedPath);
  }

  getSelectedAdvancementEntries(state, selection.levelUps).forEach(({ slotIndex, entry }) => {
    const isBasicDuplicate = applyEntry(state.data, stats, entry);
    incrementCountMap(stats.skillCounts, entry.Skills || []);

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

export function applyRace(data, stats, race, attributes) {
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
  (race.ActionCards || []).forEach((action) => addAction(data, stats, action));
}

export function applyEntry(data, stats, entry) {
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

  (entry.Items || []).forEach((item) => addItem(data, stats, item));

  let sawBasicDuplicate = false;
  (entry.ActionCards || []).forEach((action) => {
    if (addAction(data, stats, action)) {
      sawBasicDuplicate = true;
    }
  });
  return sawBasicDuplicate;
}

export function addItem(data, stats, itemName) {
  const itemObj = data.Items[itemName];
  if (!itemObj) {
    console.warn('Item not found:', itemName);
    return;
  }

  const key = itemName + "::" + itemObj.Type;
  if (!stats.items.has(key)) {
    stats.items.set(key, itemObj);
  }
}

function upgradeActionSlot(stats, card, cardId) {
  const current = stats.actions.get(card.Front.Name);
  if (!current || card.Level > current.Level) {
    stats.actions.set(card.Front.Name, { ...card, _cardId: cardId });
  }
}

export function addAction(data, stats, cardId) {
  const card = data.ActionCards[cardId];
  if (!card) {
    return false;
  }
  const current = stats.actions.get(card.Front.Name);
  const isBasicDuplicate = Boolean(current && card.Level === current.Level && BASIC_UPGRADE_CARD_IDS.has(cardId));
  upgradeActionSlot(stats, card, cardId);
  return isBasicDuplicate;
}

export function applyManualBasicUpgrade(data, stats, cardId) {
  const card = data.ActionCards[cardId];
  if (!card) {
    return;
  }
  upgradeActionSlot(stats, card, cardId);
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
