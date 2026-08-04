import { resolvePrimaryTreeName } from "./dataUtils.js";
import {
  buildActionCardPreviews,
  buildItemPreviews,
  buildPreviewStatsForSelection,
  buildLevelUpPreview,
} from "./characterStats.js";
import {
  buildEntryParts,
  buildRaceDetailParts,
  formatAttributeSummary,
  getItemDisplayName,
  getActionCardDisplayName,
} from "./displayParts.js";
import { appendDisplayParts } from "./displayPartsDom.js";

export function describeVersionOption(state, option, slotIndex) {
  const actionCards = buildActionCardPreviews(
    state.data,
    option.entry.ActionCards || [],
    buildPreviewStatsForSelection(state, {
      levelUps: buildLevelUpPreview(state, slotIndex, { versionIndex: option.index }),
    })
  );
  return {
    renderTitle: (parent) =>
      appendDisplayParts(parent, buildEntryParts(option.entry, state.data, { excludeActionCards: true })),
    actionCards,
  };
}

export function describeTreeLevelOption(state, option) {
  const versionParts = option.versions
    .map((entry) => buildEntryParts(entry, state.data))
    .filter((parts) => parts.length);
  return {
    title: option.treeName + " - Level " + option.level,
    renderDetail: (parent) => {
      versionParts.forEach((parts, index) => {
        if (index > 0) {
          parent.appendChild(document.createElement("br"));
          parent.appendChild(document.createTextNode("OR"));
          parent.appendChild(document.createElement("br"));
        }
        appendDisplayParts(parent, parts);
      });
    },
  };
}

export function describeEntryOption(state, entry, previewStats = null) {
  const items = buildItemPreviews(state.data, entry.Items || []);
  const actionCards = buildActionCardPreviews(state.data, entry.ActionCards || [], previewStats);
  return {
    title: entry.Name,
    renderDetail: (parent) =>
      appendDisplayParts(parent, buildEntryParts(entry, state.data, { excludeActionCards: true, excludeItems: true })),
    items,
    actionCards,
  };
}

export function describeProfessionOption(state, profession) {
  const summaryParts = buildEntryParts(profession, state.data);
  const accessibleTrees = [];
  const primaryTree = resolvePrimaryTreeName(profession.Name, state.trees);
  if (state.trees.has(primaryTree)) {
    accessibleTrees.push(primaryTree);
  }
  profession.AdvancementTrees.forEach((treeName) => {
    if (!accessibleTrees.includes(treeName)) {
      accessibleTrees.push(treeName);
    }
  });
  return {
    title: profession.Name,
    renderDetail: (parent) => {
      let hasLine = false;
      if (summaryParts.length) {
        appendDisplayParts(parent, summaryParts);
        hasLine = true;
      }
      if (profession.Paths.length) {
        if (hasLine) {
          parent.appendChild(document.createElement("br"));
        }
        parent.appendChild(
          document.createTextNode("Paths: " + profession.Paths.map((path) => path.Name).join(", "))
        );
        hasLine = true;
      }
      if (accessibleTrees.length) {
        if (hasLine) {
          parent.appendChild(document.createElement("br"));
        }
        parent.appendChild(document.createTextNode("Trees: " + accessibleTrees.join(", ")));
      }
    },
  };
}

export function describeRaceOption(state, race) {
  return {
    title: race.Name,
    renderDetail: (parent) => appendDisplayParts(parent, buildRaceDetailParts(race)),
  };
}

export function describeAttributeOption(attributeSet) {
  return {
    title: formatAttributeSummary(attributeSet),
    detail: "Race attribute spread",
  };
}

export function describeFreeSkillOption(skill) {
  return {
    title: skill,
  };
}

export function describeBasicUpgradeFamilyOption(state, family, previewStats) {
  return {
    title: family.name,
    actionCards: buildActionCardPreviews(state.data, [family.maxCardId], previewStats),
  };
}

export function describeSkillSlotOption(option) {
  if (option.__clear) {
    return { title: "Clear Slot", detail: "Return this skill to the pouch." };
  }
  return { title: option.skill };
}

export function describeItemSlotOption(option) {
  if (option.__clear) {
    return { title: "Clear Slot", detail: "Return this item to the pouch." };
  }
  return {
    title: getItemDisplayName(option.item),
    items: [option.item],
  };
}

export function describeActionSlotOption(state, option, previewStats) {
  if (option.__clear) {
    return { title: "Clear Slot", detail: "Return this action card to the pouch." };
  }
  return {
    title: getActionCardDisplayName(option.card),
    actionCards: buildActionCardPreviews(state.data, [option.card._cardId], previewStats),
  };
}
