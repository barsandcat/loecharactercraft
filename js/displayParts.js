import { ATTRIBUTES } from "./cardRender.js";
import { buildTokenPart } from "./cardRender.js";

/**
 * @typedef {Object} DisplayPart
 * A part is exactly one of:
 *  - { render: (parent: HTMLElement) => void }        — escape hatch, pre-built DOM
 *  - { cardId: string, card: object|null }             — action-card mention
 *  - { itemInline: object }                             — item rendered with inline details
 *  - { text: string, kind: "keyword"|"skill", count?: number } — token part (see buildTokenPart)
 *  - { text: string }                                   — plain text
 */

export function buildEntryParts(
  entry,
  data,
  {
    excludeActionCards = false,
    excludeItems = false,
    inlineItemDetails = false,
    includeActionCardMentions = false,
  } = {}
) {
  const parts = [];

  (entry.Attributes || []).forEach((attributeSet) => {
    Object.entries(attributeSet).forEach(([key, value]) => {
      parts.push({ text: value + " " + key });
    });
  });

  if (entry.HP) {
    parts.push({ text: entry.HP + " HP" });
  }
  if (entry.MOB) {
    parts.push({ text: entry.MOB + " MOB" });
  }
  if (entry.Brill) {
    parts.push({ text: entry.Brill + " Brill" });
  }

  const divValue = entry.DIV;
  if (divValue === "Upgrade") {
    parts.push({ text: "DIV Upgrade" });
  } else if (divValue) {
    parts.push({ text: "DIV " + divValue });
  }

  (entry.Keywords || []).forEach((keyword) => {
    parts.push(buildTokenPart(keyword, "keyword"));
  });
  (entry.Skills || []).forEach((skill) => {
    parts.push(buildTokenPart(skill, "skill"));
  });

  if (!excludeItems) {
    (entry.Items || []).forEach((itemName) => {
      const itemObj = data.Items[itemName];
      if (itemObj) {
        parts.push(
          inlineItemDetails
            ? { itemInline: itemObj }
            : { text: getItemDisplayName(itemObj) }
        );
      }
    });
  }

  if (!excludeActionCards) {
    (entry.ActionCards || []).forEach((cardId) => {
      const card = data.ActionCards[cardId];
      if (includeActionCardMentions) {
        parts.push({ cardId, card: card || null });
      } else {
        parts.push({ text: getActionCardDisplayName(card) });
      }
    });
  }

  return parts;
}

export function buildRaceDetailParts(race) {
  const parts = [];
  (race.Keywords || []).forEach((keyword) => {
    parts.push(buildTokenPart(keyword, "keyword"));
  });
  parts.push({ text: "MOB: " + (race.MOB || 0) });
  parts.push({ text: "HP: " + (race.HP || 0) });
  parts.push({ text: "DIV: " + (race.DIV || "-") });
  return parts;
}

export function getItemDisplayName(item) {
  return item.DisplayName || "";
}

export function getActionCardDisplayName(card) {
  return card ? card.Front.DisplayName || card.Front.Name : "";
}

export function formatAttributeSummary(attributeSet) {
  return ATTRIBUTES.map((key) => key + " " + (attributeSet[key] || 0)).join(", ");
}
