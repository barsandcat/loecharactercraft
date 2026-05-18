// Shared constants
const ATTRIBUTES = ["STR", "AGI", "INT", "CHA"];
const LOCK_LEVEL_MAP = {
  1: 0,
  2: 1,
  3: 1,
  4: 2,
  5: 4,
  6: 5,
  7: 6,
  8: 7,
};

let cardDatabase = null;
const ui = {};

init();

async function init() {
  cacheUi();
  try {
    const response = await fetch("data.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Request failed with status " + response.status + ".");
    }

    const data = await response.json();
    cardDatabase = createCardDatabase(data);
    
    // Populate filter dropdowns
    populateFilters(cardDatabase);
    
    // Initial render
    cardDatabase.render();
    
    // Bind events
    bindEvents();
  } catch (error) {
    showError("Could not load data.json. " + error.message);
  }
}

function cacheUi() {
  ui.filterProfession = document.getElementById("filterProfession");
  ui.filterType = document.getElementById("filterType");
  ui.filterCategory = document.getElementById("filterCategory");
  ui.filterRollType = document.getElementById("filterRollType");
  ui.filterATT = document.getElementById("filterATT");
  ui.filterModifier = document.getElementById("filterModifier");
  ui.sortBy = document.getElementById("sortBy");
  ui.sortOrder = document.getElementById("sortOrder");
  ui.resetFiltersButton = document.getElementById("resetFiltersButton");
  ui.cardList = document.getElementById("cardList");
  ui.errorBanner = document.getElementById("errorBanner");
}

function bindEvents() {
  ui.filterProfession.addEventListener("change", () => cardDatabase.render());
  ui.filterType.addEventListener("change", () => cardDatabase.render());
  ui.filterCategory.addEventListener("change", () => cardDatabase.render());
  ui.filterRollType.addEventListener("change", () => cardDatabase.render());
  ui.filterATT.addEventListener("change", () => cardDatabase.render());
  ui.filterModifier.addEventListener("change", () => cardDatabase.render());
  ui.sortBy.addEventListener("change", () => cardDatabase.render());
  ui.sortOrder.addEventListener("change", () => cardDatabase.render());
  ui.resetFiltersButton.addEventListener("click", () => {
    ui.filterProfession.value = "";
    ui.filterType.value = "";
    ui.filterCategory.value = "";
    ui.filterRollType.value = "";
    ui.filterATT.value = "";
    ui.filterModifier.value = "";
    ui.sortBy.value = "name";
    ui.sortOrder.checked = true;
    cardDatabase.render();
  });
}

function populateFilters(db) {
  // Get all unique modifiers
  const modifiers = new Set();
  db.getAllCards().forEach((card) => {
    if (card.Roll && card.Roll.Modifiers) {
      card.Roll.Modifiers.forEach((mod) => {
        mod.Triggers.forEach((trigger) => {
          modifiers.add(trigger);
        });
      });
    }
  });

  const modifierSelect = ui.filterModifier;
  Array.from(modifiers).sort().forEach((modifier) => {
    const option = document.createElement("option");
    option.value = modifier;
    option.textContent = modifier;
    modifierSelect.appendChild(option);
  });

  // Populate profession filter
  const professions = new Set();
  db.getAllCards().forEach((card) => {
    if (card._professions) {
      card._professions.forEach((prof) => {
        professions.add(prof);
      });
    }
  });

  const profSelect = ui.filterProfession;
  Array.from(professions).sort().forEach((profession) => {
    const option = document.createElement("option");
    option.value = profession;
    option.textContent = profession;
    profSelect.appendChild(option);
  });
}

function createCardDatabase(data) {
  const trees = new Map(data["Advancement Trees"].map((tree) => [tree.Name, tree]));
  
  const state = {
    data,
    trees,
    cards: null,
  };
  
  // Build cards after state is initialized
  state.cards = buildCardCache(data, trees);

  function render() {
    const filters = getActiveFilters();
    const filteredCards = filterCards(state.cards, filters);
    const sortedCards = sortCards(filteredCards, ui.sortBy.value, !ui.sortOrder.checked);
    renderCardList(sortedCards);
  }

  function getAllCards() {
    return state.cards;
  }

  function buildCardCache(data, trees) {
    const cards = [];
    const actionCardsMap = data["Action Cards"] || {};

    // Build profession cache
    const professionsByCard = new Map();
    const lockLevelByCard = new Map();

    data.Professions.forEach((profession) => {
      const primaryTreeName = resolvePrimaryTreeName(profession.Name, trees);
      const accessibleTrees = [];

      if (trees.has(primaryTreeName)) {
        accessibleTrees.push(primaryTreeName);
      }

      (profession["Advancement Trees"] || []).forEach((treeName) => {
        if (!accessibleTrees.includes(treeName)) {
          accessibleTrees.push(treeName);
        }
      });

      accessibleTrees.forEach((treeName) => {
        const tree = trees.get(treeName);
        if (!tree) return;

        Object.entries(tree.Levels || {}).forEach(([levelStr, versions]) => {
          const level = Number(levelStr);
          const lockLevel = LOCK_LEVEL_MAP[level] || 0;

          (versions || []).forEach((entry) => {
            const cardIds = entry["Action cards"] || [];
            cardIds.forEach((cardId) => {
              if (!professionsByCard.has(cardId)) {
                professionsByCard.set(cardId, []);
              }
              if (!professionsByCard.get(cardId).includes(profession.Name)) {
                professionsByCard.get(cardId).push(profession.Name);
              }

              if (!lockLevelByCard.has(cardId)) {
                lockLevelByCard.set(cardId, lockLevel);
              } else {
                lockLevelByCard.set(cardId, Math.min(lockLevelByCard.get(cardId), lockLevel));
              }
            });
          });
        });
      });
    });

    // Also check race cards
    data.Races.forEach((race) => {
      (race["Action cards"] || []).forEach((cardId) => {
        if (!lockLevelByCard.has(cardId)) {
          lockLevelByCard.set(cardId, 0);
        }
      });
    });

    Object.entries(actionCardsMap).forEach(([cardId, card]) => {
      const cardWithMeta = {
        ...card,
        _cardId: cardId,
        _professions: professionsByCard.get(cardId) || [],
        _lockLevel: lockLevelByCard.get(cardId) || 0,
      };
      cards.push(cardWithMeta);
    });

    return cards;
  }

  function resolvePrimaryTreeName(professionName, trees) {
    if (trees.has(professionName)) {
      return professionName;
    }

    const normalizedProfession = normalizeName(professionName);
    let bestMatch = null;

    trees.forEach((_, treeName) => {
      const normalizedTree = normalizeName(treeName);
      if (
        normalizedProfession.startsWith(normalizedTree) ||
        normalizedTree.startsWith(normalizedProfession)
      ) {
        if (
          !bestMatch ||
          normalizedTree.length > normalizeName(bestMatch).length
        ) {
          bestMatch = treeName;
        }
      }
    });

    return bestMatch || professionName;
  }

  function normalizeName(value) {
    return value.toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function filterCards(cards, filters) {
    return cards.filter((card) => {
      if (filters.profession && !card._professions.includes(filters.profession)) {
        return false;
      }
      if (filters.type && card.Type !== filters.type) {
        return false;
      }
      if (filters.category && card.Category !== filters.category) {
        return false;
      }
      if (filters.rollType) {
        const hasRoll = Boolean(card.Roll);
        const hasDIV = hasRoll && card.Roll.DIV;
        if (filters.rollType === "div" && !hasDIV) return false;
        if (filters.rollType === "regular" && (!hasRoll || hasDIV)) return false;
        if (filters.rollType === "none" && hasRoll) return false;
      }
      if (filters.att) {
        if (!card.Roll) return false;
        const attList = getRollAttributeList(card.Roll);
        if (!attList.includes(filters.att)) return false;
      }
      if (filters.modifier) {
        if (!card.Roll || !card.Roll.Modifiers) return false;
        const hasModifier = card.Roll.Modifiers.some((mod) =>
          mod.Triggers.includes(filters.modifier)
        );
        if (!hasModifier) return false;
      }
      return true;
    });
  }

  function sortCards(cards, sortBy, descending) {
    const sorted = [...cards];
    
    switch (sortBy) {
      case "name":
        sorted.sort((a, b) => {
          const nameA = a.DisplayName || a.Name || "";
          const nameB = b.DisplayName || b.Name || "";
          return descending ? nameB.localeCompare(nameA) : nameA.localeCompare(nameB);
        });
        break;
      case "level":
        sorted.sort((a, b) => {
          const diff = (b.Level || 0) - (a.Level || 0);
          return descending ? diff : -diff;
        });
        break;
      case "lockLevel":
        sorted.sort((a, b) => {
          const diff = (b._lockLevel || 0) - (a._lockLevel || 0);
          return descending ? diff : -diff;
        });
        break;
    }
    
    return sorted;
  }

  function renderCardList(cards) {
    ui.cardList.replaceChildren();

    if (cards.length === 0) {
      const emptyState = document.createElement("div");
      emptyState.className = "empty-state";
      emptyState.textContent = "No action cards match the selected filters.";
      ui.cardList.appendChild(emptyState);
      return;
    }

    const list = document.createElement("ul");
    list.className = "card-database-list";

    cards.forEach((card) => {
      const li = document.createElement("li");
      li.className = "card-database-item";
      li.appendChild(buildCardElement(card));
      list.appendChild(li);
    });

    ui.cardList.appendChild(list);
  }

  return {
    render,
    getAllCards,
  };
}

function buildCardElement(card) {
  const wrapper = document.createElement("div");
  wrapper.className = "action-card-full";

  const idBox = document.createElement("div");
  idBox.className = "action-card-id " + (card.Type === "Reaction" ? "is-reaction" : "is-action");
  idBox.textContent = card._cardId;
  wrapper.appendChild(idBox);

  const body = document.createElement("div");
  body.className = "action-card-body";

  const nameEl = document.createElement("div");
  nameEl.className = "action-card-name";
  nameEl.textContent = card.DisplayName || card.Name;
  body.appendChild(nameEl);

  // Profession and Level info
  if (card._professions && card._professions.length > 0) {
    const metaInfo = document.createElement("div");
    metaInfo.className = "card-meta-info";
    metaInfo.textContent = "Professions: " + card._professions.join(", ");
    body.appendChild(metaInfo);
  }

  if (card._lockLevel !== undefined) {
    const lockInfo = document.createElement("div");
    lockInfo.className = "card-meta-info";
    lockInfo.textContent = "Lock Level: " + card._lockLevel;
    body.appendChild(lockInfo);
  }

  const metaParts = [
    ...(card.Keywords || []).map((keyword) => buildTokenPart(keyword, "keyword")),
  ];
  if (card.Condition) {
    metaParts.push({
      render: (parent) => appendFormattedText(parent, card.Condition),
    });
  }
  if (metaParts.length) {
    const metaEl = document.createElement("div");
    metaEl.className = "action-card-meta";
    appendDisplayParts(metaEl, metaParts);
    body.appendChild(metaEl);
  }

  if (card.Target) {
    const targetEl = document.createElement("div");
    targetEl.className = "action-card-target";
    targetEl.textContent = card.Target;
    body.appendChild(targetEl);
  }

  if (card.Roll) {
    body.appendChild(buildRollElement(card.Roll));

    if (card.Roll.Successes) {
      const sortedKeys = Object.keys(card.Roll.Successes).sort((a, b) => Number(b) - Number(a));
      sortedKeys.forEach((key) => {
        const outEl = document.createElement("div");
        outEl.className = "action-card-outcome";
        outEl.appendChild(document.createTextNode(key + ": "));
        appendFormattedText(outEl, card.Roll.Successes[key]);
        body.appendChild(outEl);
      });
    }
  }

  if (card.Front) {
    const frontEl = document.createElement("div");
    frontEl.className = "action-card-desc";
    appendFormattedText(frontEl, card.Front);
    body.appendChild(frontEl);
  }

  if (card.Back) {
    body.appendChild(buildFoldedEffectText(card.Back, "action-card-back"));
  }

  wrapper.appendChild(body);
  return wrapper;
}

function buildRollElement(roll) {
  const rollLineEl = document.createElement("div");
  rollLineEl.className = "action-card-roll";
  const mode = normalizeRollMode(roll.Mode);
  const hasSpecificATT = roll.ATT && roll.ATT.length > 0;
  const attList = getRollAttributeList(roll);
  let rollText;
  if (mode === "Sum") {
    rollText = "Roll for " + attList.join(" and ");
  } else if (mode === "Lowest") {
    if (hasSpecificATT) {
      rollText = "Roll for the lowest of " + attList.join(" or ");
    } else {
      rollText = "Roll the lowest ATT";
    }
  } else if (hasSpecificATT) {
    rollText = "Roll for " + attList.join(" or ");
  } else {
    rollText = "Roll the highest ATT";
  }
  if (roll.DIV) rollText += " and DIV";
  appendFormattedText(rollLineEl, rollText);
  const diffBadge = document.createElement("span");
  diffBadge.className = "action-card-difficulty";
  const diffIcon = document.createElement("img");
  const difficultyIconName = roll.Difficulty != null ? String(roll.Difficulty) : "en";
  diffIcon.className = "action-card-difficulty-icon";
  diffIcon.src = "icons/" + encodeURIComponent(difficultyIconName) + ".svg";
  diffIcon.alt = roll.Difficulty != null ? "Difficulty " + roll.Difficulty : "Enemy difficulty";
  diffBadge.appendChild(diffIcon);
  rollLineEl.appendChild(diffBadge);
  if (roll.Modifiers && roll.Modifiers.length) {
    appendRollModifiers(rollLineEl, roll.Modifiers);
  }
  return rollLineEl;
}

function normalizeRollMode(mode) {
  return mode === "Sum" || mode === "Lowest" ? mode : "Highest";
}

function getRollAttributeList(roll) {
  return roll.ATT && roll.ATT.length > 0 ? roll.ATT : ATTRIBUTES;
}

function buildFoldedEffectText(text, className = "") {
  const effectEl = document.createElement("div");
  effectEl.className = "folded-effect-text" + (className ? " " + className : "");
  appendFormattedText(effectEl, text);
  return effectEl;
}

function appendFormattedText(parent, text) {
  const pattern = /\{([^}]+)\}|\[([^\]]+)\]/g;
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parent.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    
    if (match[1] !== undefined) {
      // Icon: {iconName}
      const iconName = match[1].trim();
      if (iconName) {
        const iconEl = document.createElement("img");
        iconEl.className = "action-card-inline-icon";
        iconEl.src = "icons/" + encodeURIComponent(iconName) + ".svg";
        iconEl.alt = iconName;
        parent.appendChild(iconEl);
      } else {
        parent.appendChild(document.createTextNode(match[0]));
      }
    } else if (match[2] !== undefined) {
      // Keyword: [keywordName]
      const keywordName = match[2].trim();
      if (keywordName) {
        const keywordEl = document.createElement("em");
        keywordEl.className = "keyword-token";
        keywordEl.textContent = keywordName;
        parent.appendChild(keywordEl);
      } else {
        parent.appendChild(document.createTextNode(match[0]));
      }
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parent.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

function appendDisplayParts(parent, parts, separator = ", ") {
  parts.forEach((part, index) => {
    if (index > 0) {
      parent.appendChild(document.createTextNode(separator));
    }
    appendDisplayPart(parent, part);
  });
}

function appendDisplayPart(parent, part) {
  if (!part) {
    return;
  }

  if (typeof part.render === "function") {
    part.render(parent);
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

function buildTokenPart(text, kind) {
  return { text, kind };
}

function appendRollModifiers(parent, modifiers) {
  modifiers.forEach((mod) => {
    const sign = mod.Dice > 0 ? "+" : "";
    const dieWord = Math.abs(mod.Dice) === 1 ? "die" : "dice";
    parent.appendChild(document.createTextNode(", " + sign + mod.Dice + " " + dieWord + ": "));
    appendDisplayParts(
      parent,
      mod.Triggers.map((trigger) => buildTokenPart(trigger, "keyword"))
    );
  });
}

function getActiveFilters() {
  return {
    profession: ui.filterProfession.value || null,
    type: ui.filterType.value || null,
    category: ui.filterCategory.value || null,
    rollType: ui.filterRollType.value || null,
    att: ui.filterATT.value || null,
    modifier: ui.filterModifier.value || null,
  };
}

function showError(message) {
  ui.errorBanner.textContent = message;
  ui.errorBanner.classList.remove("hidden");
}
