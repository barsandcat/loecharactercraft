import { buildActionCardElement } from "./cardRender.js";

const LOCK_LEVEL_MAP = {
  1: 1,
  2: 2,
  3: 2,
  4: 3,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
};

const BASIC_TREE = "Basic";

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

    populateFilters(cardDatabase);
    cardDatabase.render();
    bindEvents();
  } catch (error) {
    showError("Could not load data.json. " + error.message);
  }
}

function cacheUi() {
  ui.filterTree = document.getElementById("filterTree");
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
  ui.filterTree.addEventListener("change", () => cardDatabase.render());
  ui.filterType.addEventListener("change", () => cardDatabase.render());
  ui.filterCategory.addEventListener("change", () => cardDatabase.render());
  ui.filterRollType.addEventListener("change", () => cardDatabase.render());
  ui.filterATT.addEventListener("change", () => cardDatabase.render());
  ui.filterModifier.addEventListener("change", () => cardDatabase.render());
  ui.sortBy.addEventListener("change", () => cardDatabase.render());
  ui.sortOrder.addEventListener("change", () => cardDatabase.render());
  ui.resetFiltersButton.addEventListener("click", () => {
    ui.filterTree.value = "";
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
  const negatives = new Set();
  const modifiers = new Set();
  db.getAllCards().forEach((card) => {
    if (card.Roll && card.Roll.Modifiers) {
      card.Roll.Modifiers.forEach((mod) => {
        if (mod.Dice < 0) {
          mod.Triggers.forEach((trigger) => negatives.add(trigger));
        } else {
          mod.Triggers.forEach((trigger) => modifiers.add(trigger));
        }
      });
    }
  });
  negatives.forEach((trigger) => modifiers.delete(trigger));

  const modifierSelect = ui.filterModifier;
  Array.from(modifiers).sort().forEach((modifier) => {
    const option = document.createElement("option");
    option.value = modifier;
    option.textContent = modifier;
    modifierSelect.appendChild(option);
  });

  const treeNames = new Set();
  db.getAllCards().forEach((card) => treeNames.add(card._tree));

  const treeSelect = ui.filterTree;
  // "Basic" first, then the rest sorted
  if (treeNames.has(BASIC_TREE)) {
    const opt = document.createElement("option");
    opt.value = BASIC_TREE;
    opt.textContent = BASIC_TREE;
    treeSelect.appendChild(opt);
    treeNames.delete(BASIC_TREE);
  }
  Array.from(treeNames).sort().forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    treeSelect.appendChild(option);
  });
}

function createCardDatabase(data) {
  const trees = new Map(data["Advancement Trees"].map((tree) => [tree.Name, tree]));

  const state = { data, trees, cards: null };
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
    const treeByCard = new Map();
    const lockLevelByCard = new Map();

    // Path cards: assign to profession's primary tree at lock level 0
    data.Professions.forEach((profession) => {
      const primaryTreeName = resolvePrimaryTreeName(profession.Name, trees);
      (profession.Paths || []).forEach((path) => {
        (path["Action cards"] || []).forEach((cardId) => {
          if (!treeByCard.has(cardId)) {
            treeByCard.set(cardId, primaryTreeName);
            lockLevelByCard.set(cardId, 0);
          }
        });
      });
    });

    // Tree cards: assign directly by tree name
    trees.forEach((tree, treeName) => {
      Object.entries(tree.Levels || {}).forEach(([levelStr, versions]) => {
        const level = Number(levelStr);
        const lockLevel = LOCK_LEVEL_MAP[level] || 0;
        (versions || []).forEach((entry) => {
          (entry["Action cards"] || []).forEach((cardId) => {
            if (!treeByCard.has(cardId)) {
              treeByCard.set(cardId, treeName);
              lockLevelByCard.set(cardId, lockLevel);
            }
          });
        });
      });
    });

    Object.entries(actionCardsMap).forEach(([cardId, card]) => {
      const isBasic = cardId.startsWith("B");
      const tree = isBasic ? BASIC_TREE : (treeByCard.get(cardId) || BASIC_TREE);
      cards.push({
        ...card,
        _cardId: cardId,
        _tree: tree,
        _lockLevel: isBasic ? 0 : (lockLevelByCard.get(cardId) ?? 0),
      });
    });

    return cards;
  }

  function resolvePrimaryTreeName(professionName, trees) {
    if (trees.has(professionName)) return professionName;

    const normalizedProfession = normalizeName(professionName);
    let bestMatch = null;
    trees.forEach((_, treeName) => {
      const normalizedTree = normalizeName(treeName);
      if (
        normalizedProfession.startsWith(normalizedTree) ||
        normalizedTree.startsWith(normalizedProfession)
      ) {
        if (!bestMatch || normalizedTree.length > normalizeName(bestMatch).length) {
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
      if (filters.tree && card._tree !== filters.tree) return false;
      if (filters.type && card.Type !== filters.type) return false;
      if (filters.category && card.Category !== filters.category) return false;
      if (filters.rollType) {
        const hasRoll = Boolean(card.Roll);
        const hasDIV = hasRoll && card.Roll.DIV;
        if (filters.rollType === "div" && !hasDIV) return false;
        if (filters.rollType === "regular" && (!hasRoll || hasDIV)) return false;
        if (filters.rollType === "none" && hasRoll) return false;
      }
      if (filters.att) {
        if (!card.Roll) return false;
        const attList = card.Roll.ATT && card.Roll.ATT.length > 0 ? card.Roll.ATT : ["STR", "AGI", "INT", "CHA"];
        if (!attList.includes(filters.att)) return false;
      }
      if (filters.modifier) {
        if (!card.Roll || !card.Roll.Modifiers) return false;
        if (!card.Roll.Modifiers.some((mod) => mod.Triggers.includes(filters.modifier))) return false;
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
      case "lockLevel":
        sorted.sort((a, b) => {
          const lockDiff = (a._lockLevel || 0) - (b._lockLevel || 0);
          if (lockDiff !== 0) return descending ? -lockDiff : lockDiff;
          const nameCmp = (a.Name || "").localeCompare(b.Name || "");
          if (nameCmp !== 0) return descending ? -nameCmp : nameCmp;
          const levelDiff = (a.Level || 0) - (b.Level || 0);
          return descending ? -levelDiff : levelDiff;
        });
        break;
      case "tree":
        sorted.sort((a, b) => {
          const cmp = a._tree.localeCompare(b._tree);
          if (cmp !== 0) return descending ? -cmp : cmp;
          const lockDiff = (a._lockLevel || 0) - (b._lockLevel || 0);
          return descending ? -lockDiff : lockDiff;
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

      const metaEl = document.createElement("div");
      metaEl.className = "card-database-meta";

      const treeEl = document.createElement("span");
      treeEl.className = "card-meta-profession";
      treeEl.textContent = card._tree;
      metaEl.appendChild(treeEl);

      const lockEl = document.createElement("span");
      lockEl.className = "card-meta-lock";
      lockEl.textContent = "Level: " + card._lockLevel;
      metaEl.appendChild(lockEl);

      li.appendChild(metaEl);
      li.appendChild(buildActionCardElement(card._cardId, card));
      list.appendChild(li);
    });

    ui.cardList.appendChild(list);
  }

  return { render, getAllCards };
}

function getActiveFilters() {
  return {
    tree: ui.filterTree.value || null,
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
