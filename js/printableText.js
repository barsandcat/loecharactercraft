import { ATTRIBUTES } from "./cardRender.js";
import { collectCharacterStats } from "./characterStats.js";
import { getTreeLevelOption, getVersionOptions } from "./advancementTree.js";
import { buildEntryParts, getItemDisplayName, getActionCardDisplayName, formatAttributeSummary } from "./displayParts.js";

export function buildPrintableText(state) {
  const stats = collectCharacterStats(state);
  const lines = [];

  lines.push("Character creation");
  lines.push("Race: " + formatPrintableRace(state));
  lines.push("Action Cards: " + formatPrintableActionCardsList(state, state.selectedRace?.ActionCards || []));
  lines.push("Origin: " + formatPrintableOrigin(state));
  lines.push("Profession: " + formatPrintableValue(state.selectedProf?.Name));
  lines.push("Path: " + formatPrintablePath(state));
  lines.push("");

  lines.push("Final stats: " + formatPrintableStats(stats));
  lines.push("");

  lines.push("Level Up Choices");
  const choices = getPrintableLevelUpChoices(state);
  if (!choices.length) {
    lines.push("- None");
  } else {
    choices.forEach((choice, index) => {
      lines.push(
        (index + 1) + ". " +
          choice.treeName + " - Level " + choice.level + ": " +
          formatPrintableValue(choice.selection)
      );
    });
  }

  return lines.join("\n");
}

function getPrintableLevelUpChoices(state) {
  return state.levelUps
    .map((slotState) => {
      if (
        slotState.treeName === null ||
        slotState.level === null ||
        slotState.versionIndex === null
      ) {
        return null;
      }

      const option = getTreeLevelOption(state, slotState.treeName, slotState.level);
      if (!option) {
        return null;
      }

      const versionOptions = getVersionOptions(option);
      const versionOption = versionOptions[slotState.versionIndex];
      if (!versionOption) {
        return null;
      }

      return {
        treeName: option.treeName,
        level: option.level,
        selection: formatEntryForPlainText(state, versionOption.entry),
      };
    })
    .filter(Boolean);
}

function formatEntryForPlainText(state, entry) {
  return formatDisplayPartsForPlainText(buildEntryParts(entry, state.data));
}

function formatPrintableRace(state) {
  if (!state.selectedRace) {
    return "-";
  }

  const details = [];
  if (state.selectedAttributeSet) {
    details.push(formatAttributeSummary(state.selectedAttributeSet));
  }
  if (state.selectedFreeSkill) {
    details.push("Skill: " + state.selectedFreeSkill);
  }

  return details.length
    ? state.selectedRace.Name + " (" + details.join("; ") + ")"
    : state.selectedRace.Name;
}

function formatPrintableOrigin(state) {
  if (!state.selectedOrigin) {
    return "-";
  }

  const details = [
    formatPrintableItemsDetail(state, state.selectedOrigin.Items || []),
    "Brill: " + (state.selectedOrigin.Brill || 0),
  ].filter(Boolean);

  return state.selectedOrigin.Name + " (" + details.join("; ") + ")";
}

function formatPrintablePath(state) {
  if (!state.selectedPath) {
    return "-";
  }

  const details = [
    formatPrintableAttributesDetail(state.selectedPath.Attributes || []),
    formatPrintableItemsDetail(state, state.selectedPath.Items || []),
    formatPrintableActionCardsDetail(state, state.selectedPath.ActionCards || []),
  ].filter(Boolean);

  return details.length
    ? state.selectedPath.Name + " (" + details.join("; ") + ")"
    : state.selectedPath.Name;
}

function formatDisplayPartsForPlainText(parts) {
  return parts
    .map(formatDisplayPartForPlainText)
    .filter(Boolean)
    .join(", ");
}

function formatDisplayPartForPlainText(part) {
  if (!part) {
    return "";
  }

  if (part.cardId !== undefined) {
    return part.card ? getActionCardDisplayName(part.card) : part.cardId;
  }

  if (part.text !== undefined) {
    return part.text + (part.count > 1 ? " x" + part.count : "");
  }

  return "";
}

function formatPrintableValue(value) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function formatPrintableStats(stats) {
  return [
    ...ATTRIBUTES.map((attribute) => attribute + ": " + (stats.attributes[attribute] || 0)),
    "DIV: " + formatPrintableValue(stats.divDie),
    "HP: " + stats.hp,
    "MOB: " + stats.mob,
  ].join(", ");
}

function formatPrintableActionCardsList(state, cardIds) {
  return cardIds.length
    ? cardIds.map((cardId) => formatPrintableActionCard(state, cardId)).join(", ")
    : "-";
}

function formatPrintableAttributesDetail(attributeSets) {
  const attributeBonuses = [];
  attributeSets.forEach((attributeSet) => {
    Object.entries(attributeSet).forEach(([key, value]) => {
      attributeBonuses.push(value + " " + key);
    });
  });

  return attributeBonuses.length ? "Attributes: " + attributeBonuses.join(", ") : "";
}

function formatPrintableItemsDetail(state, itemNames) {
  const items = itemNames
    .map((itemName) => state.data.Items[itemName] || null)
    .filter(Boolean)
    .map(getItemDisplayName);

  if (!items.length) {
    return "";
  }

  return (items.length === 1 ? "Item: " : "Items: ") + items.join(", ");
}

function formatPrintableActionCardsDetail(state, cardIds) {
  if (!cardIds.length) {
    return "";
  }

  return (cardIds.length === 1 ? "Action Card: " : "Action Cards: ") +
    cardIds.map((cardId) => formatPrintableActionCard(state, cardId)).join(", ");
}

function formatPrintableActionCard(state, cardId) {
  const card = state.data.ActionCards[cardId];
  const cardName = getActionCardDisplayName(card);
  return cardName ? cardId + ": " + cardName : cardId;
}
