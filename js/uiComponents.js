import { appendFormattedText, buildTokenPart } from "./cardRender.js";
import { buildEntryParts, getItemDisplayName } from "./displayParts.js";
import { appendDisplayParts, createActionCardMention } from "./displayPartsDom.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function createSvgElement(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  Object.keys(attrs).forEach((key) => el.setAttribute(key, attrs[key]));
  return el;
}

// Outline-only shapes (no fill) distinguishing item tiers — drawn as real SVG
// geometry rather than CSS clip-path, since clip-path can only cut a filled
// background, not produce a hollow stroke.
const TIER_SHAPES = {
  basic: () => createSvgElement("circle", { cx: 5, cy: 5, r: 4 }),
  common: () => createSvgElement("polygon", { points: "5,1 1,9 9,9" }),
  uncommon: () => createSvgElement("rect", { x: 1, y: 1, width: 8, height: 8 }),
  rare: () => createSvgElement("polygon", { points: "5,0.5 9.5,5 5,9.5 0.5,5" }),
  quest: () => createSvgElement("polygon", {
    points: "5,0.3 6.13,3.53 9.76,3.53 6.82,5.66 7.94,9 5,6.87 2.06,9 3.18,5.66 0.24,3.53 3.87,3.53",
  }),
};

function buildTierIcon(tier) {
  const tierName = tier || "Basic";
  const shape = TIER_SHAPES[tierName.toLowerCase()] || TIER_SHAPES.basic;
  const svg = createSvgElement("svg", { viewBox: "0 0 10 10", class: "item-tier-icon" });
  svg.appendChild(shape());
  const titleEl = createSvgElement("title", {});
  titleEl.textContent = tierName + " tier";
  svg.appendChild(titleEl);
  return svg;
}

export function singleChoiceGrid(config) {
  const grid = document.createElement("div");
  grid.className = "choice-grid";
  grid.appendChild(
    createChoiceButton({
      label: config.label,
      main: config.main,
      detail: config.detail,
      renderMain: config.renderMain,
      renderDetail: config.renderDetail,
      onClick: config.onClick,
      disabled: config.disabled,
      empty: config.empty,
      accent: config.complete,
      locked: config.locked,
    })
  );
  return grid;
}

export function dualChoiceGrid(config) {
  const grid = document.createElement("div");
  grid.className = "choice-grid " + (config.className || "two-up");
  grid.appendChild(createChoiceButton(config.firstButton));
  grid.appendChild(createChoiceButton(config.secondButton));
  return grid;
}

export function createChoiceButton(config) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "choice-button";
  if (config.empty) {
    button.classList.add("is-empty");
  }
  if (config.accent) {
    button.classList.add("is-accent");
  }
  if (config.locked) {
    button.classList.add("is-locked");
  }
  button.disabled = Boolean(config.disabled) || Boolean(config.locked);

  if (!button.disabled && typeof config.onClick === "function") {
    button.addEventListener("click", config.onClick);
  }

  const label = document.createElement("span");
  label.className = "choice-label";
  label.textContent = config.label;
  button.appendChild(label);

  const main = document.createElement("span");
  main.className = "choice-main";
  if (typeof config.renderMain === "function") {
    config.renderMain(main);
  } else {
    main.textContent = config.main || "";
  }
  button.appendChild(main);

  const detail = document.createElement("span");
  detail.className = "choice-detail";
  if (typeof config.renderDetail === "function") {
    config.renderDetail(detail);
  } else {
    detail.textContent = config.detail || "";
  }
  button.appendChild(detail);

  return button;
}

export function renderEntryToElement(element, entry, data, previewStats = null) {
  const parts = buildEntryParts(entry, data, {
    inlineItemDetails: true,
    includeActionCardMentions: true,
  });

  if (!parts.length) {
    return;
  }

  element.replaceChildren();
  appendDisplayParts(element, parts, previewStats);
}

export function buildItemElement(item, card = null, previewStats = null) {
  const wrapper = document.createElement("div");
  wrapper.className = "item-preview";
  wrapper.appendChild(buildItemDetailsElement(item));
  wrapper.appendChild(buildItemEffectElement(item, card, previewStats));
  return wrapper;
}

// The referenced card (if any) is prepended before the effect text, as a
// hoverable mention with the same action-card tooltip used in advancement
// trees. "None" is only shown when there's neither an effect nor a card —
// a card reference alone already conveys what the item does.
function buildItemEffectElement(item, card, previewStats) {
  const effectEl = document.createElement("div");
  effectEl.className = "folded-effect-text item-effect";

  if (card) {
    effectEl.appendChild(createActionCardMention(item.Card, card, previewStats, { showId: true }));
    if (item.Effect) {
      effectEl.appendChild(document.createTextNode(" "));
    }
  }

  if (item.Effect) {
    appendFormattedText(effectEl, item.Effect);
  } else if (!card) {
    appendFormattedText(effectEl, "None");
  }

  return effectEl;
}

export function buildItemDetailsElement(item) {
  const detailsEl = document.createElement("div");
  detailsEl.className = "item-details";

  const nameRowEl = document.createElement("div");
  nameRowEl.className = "item-name-row";
  nameRowEl.appendChild(buildTierIcon(item.Tier));

  const nameEl = document.createElement("div");
  nameEl.className = "item-name";
  appendFormattedText(nameEl, getItemDisplayName(item));
  nameRowEl.appendChild(nameEl);

  detailsEl.appendChild(nameRowEl);

  if (item.Passive) {
    const passiveEl = document.createElement("div");
    passiveEl.className = "item-passive";
    appendFormattedText(passiveEl, item.Passive);
    detailsEl.appendChild(passiveEl);
  }

  const keywords = item.Keywords || [];
  if (keywords.length) {
    const keywordsEl = document.createElement("div");
    keywordsEl.className = "item-keywords action-card-meta";
    appendDisplayParts(
      keywordsEl,
      keywords.map((keyword) => buildTokenPart(keyword, "keyword"))
    );
    detailsEl.appendChild(keywordsEl);
  }

  return detailsEl;
}

export function createListSection(title, items) {
  const section = document.createElement("section");
  section.className = "summary-card";

  const heading = document.createElement("h3");
  heading.textContent = title;
  section.appendChild(heading);

  const list = document.createElement("ul");
  list.className = "list-block";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "list-item";
    if (item && typeof item.render === "function") {
      item.render(li);
    } else {
      li.textContent = item;
    }
    list.appendChild(li);
  });

  section.appendChild(list);
  return section;
}

export function createStatCard(label, value, limit) {
  const card = document.createElement("div");
  card.className = "stat-card";

  const numericValue = parseFloat(value);
  if (limit !== undefined && !isNaN(numericValue) && numericValue > limit) {
    card.classList.add("is-over-limit");
  }

  const statValue = document.createElement("div");
  statValue.className = "stat-value";
  statValue.textContent = value;
  card.appendChild(statValue);

  const statLabel = document.createElement("div");
  statLabel.className = "stat-label";
  statLabel.textContent = label;
  card.appendChild(statLabel);

  return card;
}

export function createEmptyState(text) {
  const box = document.createElement("div");
  box.className = "empty-state";
  box.textContent = text;
  return box;
}
