import { buildActionCardElement, buildTokenPart } from "./cardRender.js";
import { getItemDisplayName, getActionCardDisplayName } from "./displayParts.js";

export function appendDisplayParts(parent, parts, previewStats = null, separator = ", ") {
  parts.forEach((part, index) => {
    if (index > 0) {
      parent.appendChild(document.createTextNode(separator));
    }
    appendDisplayPart(parent, part, previewStats);
  });
}

export function appendDisplayPart(parent, part, previewStats = null) {
  if (!part) {
    return;
  }

  if (typeof part.render === "function") {
    part.render(parent);
    return;
  }

  if (part.itemInline !== undefined) {
    appendInlineItemDetails(parent, part.itemInline);
    return;
  }

  if (part.cardId !== undefined) {
    if (part.card) {
      parent.appendChild(createActionCardMention(part.cardId, part.card, previewStats));
    } else {
      parent.appendChild(document.createTextNode(part.cardId));
    }
    return;
  }

  if (part.kind === "keyword" || part.kind === "skill") {
    const tokenEl = document.createElement("em");
    tokenEl.className = part.kind === "skill" ? "skill-token" : "keyword-token";
    tokenEl.textContent = part.text;
    parent.appendChild(tokenEl);
    if (part.count > 1) {
      parent.appendChild(document.createTextNode(" x" + part.count));
    }
    return;
  }

  parent.appendChild(document.createTextNode(part.text));
}

export function appendCountSummary(parent, counts, kind) {
  const wrapper = document.createElement("span");
  const parts = Array.from(counts.keys())
    .sort((a, b) => a.localeCompare(b))
    .map((text) => ({
      text,
      kind,
      count: counts.get(text),
    }));
  appendDisplayParts(wrapper, parts);
  parent.appendChild(wrapper);
}

export function appendInlineItemDetails(parent, item) {
  parent.appendChild(document.createTextNode(getItemDisplayName(item)));

  const details = [];
  if (item.Passive) {
    details.push({ text: item.Passive });
  }
  (item.Keywords || []).forEach((keyword) => {
    details.push(buildTokenPart(keyword, "keyword"));
  });

  if (details.length) {
    parent.appendChild(document.createTextNode(" ("));
    appendDisplayParts(parent, details);
    parent.appendChild(document.createTextNode(")"));
  }
}

export function createActionCardMention(cardId, card, previewStats = null) {
  const span = document.createElement("span");
  span.className = "action-card-mention";
  span.textContent = getActionCardDisplayName(card);

  const tooltipEl = document.createElement("div");
  tooltipEl.className = "action-card-mention-tooltip";
  tooltipEl.appendChild(
    buildActionCardElement(
      cardId,
      card,
      previewStats ? previewStats.attributes : null,
      previewStats ? previewStats.keywordCounts : null
    )
  );
  span.appendChild(tooltipEl);

  return span;
}
