import { buildActionCardElement, getRollAttributeList } from "./cardRender.js";
import { resolvePrimaryTreeName } from "./dataUtils.js";

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
const ITEM_CARD_TREE = "Item Cards";

let cardDatabase = null;
const ui = {};

init();

// Startup
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
  ui.filterName = document.getElementById("filterName");
  ui.filterTree = document.getElementById("filterTree");
  ui.filterType = document.getElementById("filterType");
  ui.filterCategory = document.getElementById("filterCategory");
  ui.filterRollType = document.getElementById("filterRollType");
  ui.filterATT = document.getElementById("filterATT");
  ui.filterKeywords = document.getElementById("filterKeywords");
  ui.filterModifier = document.getElementById("filterModifier");
  ui.filterTarget = document.getElementById("filterTarget");
  ui.sortBy = document.getElementById("sortBy");
  ui.sortOrder = document.getElementById("sortOrder");
  ui.resetFiltersButton = document.getElementById("resetFiltersButton");
  ui.cardList = document.getElementById("cardList");
  ui.errorBanner = document.getElementById("errorBanner");
}

function bindEvents() {
  ui.filterName.addEventListener("input", () => cardDatabase.render());
  ui.filterTree.addEventListener("change", () => cardDatabase.render());
  ui.filterType.addEventListener("change", () => cardDatabase.render());
  ui.filterCategory.addEventListener("change", () => cardDatabase.render());
  ui.filterRollType.addEventListener("change", () => cardDatabase.render());
  ui.filterATT.addEventListener("change", () => cardDatabase.render());
  ui.filterKeywords.addEventListener("change", () => cardDatabase.render());
  ui.filterModifier.addEventListener("change", () => cardDatabase.render());
  ui.filterTarget.addEventListener("change", () => cardDatabase.render());
  ui.sortBy.addEventListener("change", () => cardDatabase.render());
  ui.sortOrder.addEventListener("change", () => cardDatabase.render());
  ui.resetFiltersButton.addEventListener("click", () => {
    ui.filterName.value = "";
    ui.filterTree.value = "";
    ui.filterType.value = "";
    ui.filterCategory.value = "";
    ui.filterRollType.value = "";
    ui.filterATT.value = "";
    ui.filterKeywords.value = "";
    ui.filterModifier.value = "";
    ui.filterTarget.value = "";
    ui.sortBy.value = "tree";
    ui.sortOrder.checked = true;
    cardDatabase.render();
  });
}

// Filter controls
function populateFilters(db) {
  const treeCounts = new Map();
  const typeCounts = new Map();
  const categoryCounts = new Map();
  const rollTypeCounts = { div: 0, regular: 0, none: 0 };
  const attCounts = new Map();
  const negatives = new Set();
  const modifierCounts = new Map();
  const keywordCounts = { has: 0, none: 0 };
  const individualKeywordCounts = new Map();
  const targetCounts = new Map();

  db.getAllCards().forEach((card) => {
    treeCounts.set(card._tree, (treeCounts.get(card._tree) || 0) + 1);

    if (card.Front.Type) typeCounts.set(card.Front.Type, (typeCounts.get(card.Front.Type) || 0) + 1);
    if (card.Front.Category) categoryCounts.set(card.Front.Category, (categoryCounts.get(card.Front.Category) || 0) + 1);

    const rollType = getCardRollTypeCategory(card);
    rollTypeCounts[rollType]++;

    getCardAttributes(card).forEach((att) => attCounts.set(att, (attCounts.get(att) || 0) + 1));

    const allKeywords = getCardAllKeywords(card);
    const hasKeywords = allKeywords.length > 0;
    if (hasKeywords) {
      keywordCounts.has++;
      allKeywords.forEach((kw) => individualKeywordCounts.set(kw, (individualKeywordCounts.get(kw) || 0) + 1));
    } else {
      keywordCounts.none++;
    }

    getCardNegativeModifiers(card).forEach((t) => negatives.add(t));
    getCardModifiers(card).forEach((t) => modifierCounts.set(t, (modifierCounts.get(t) || 0) + 1));

    getCardTargets(card).forEach((target) => targetCounts.set(target, (targetCounts.get(target) || 0) + 1));
  });
  negatives.forEach((t) => modifierCounts.delete(t));

  ui.filterKeywords.querySelectorAll("option[value]:not([value=''])").forEach((opt) => {
    opt.textContent = opt.textContent + " (" + (keywordCounts[opt.value] || 0) + ")";
  });

  // Static options: update text with counts
  ui.filterType.querySelectorAll("option[value]:not([value=''])").forEach((opt) => {
    opt.textContent = opt.value + " (" + (typeCounts.get(opt.value) || 0) + ")";
  });
  ui.filterCategory.querySelectorAll("option[value]:not([value=''])").forEach((opt) => {
    opt.textContent = opt.value + " (" + (categoryCounts.get(opt.value) || 0) + ")";
  });
  ui.filterRollType.querySelectorAll("option[value]:not([value=''])").forEach((opt) => {
    opt.textContent = opt.textContent + " (" + (rollTypeCounts[opt.value] || 0) + ")";
  });
  ui.filterATT.querySelectorAll("option[value]:not([value=''])").forEach((opt) => {
    opt.textContent = opt.value + " (" + (attCounts.get(opt.value) || 0) + ")";
  });

  // Dynamic options: Keywords
  Array.from(individualKeywordCounts.keys()).sort().forEach((kw) => {
    const opt = document.createElement("option");
    opt.value = kw;
    opt.textContent = kw + " (" + individualKeywordCounts.get(kw) + ")";
    ui.filterKeywords.appendChild(opt);
  });

  // Dynamic options: Tree
  const treeSelect = ui.filterTree;
  const addTreeOption = (name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name + " (" + (treeCounts.get(name) || 0) + ")";
    treeSelect.appendChild(opt);
  };
  if (treeCounts.has(BASIC_TREE)) addTreeOption(BASIC_TREE);
  Array.from(treeCounts.keys()).filter((n) => n !== BASIC_TREE).sort().forEach(addTreeOption);

  // Dynamic options: Modifier
  Array.from(modifierCounts.keys()).sort().forEach((modifier) => {
    const opt = document.createElement("option");
    opt.value = modifier;
    opt.textContent = modifier + " (" + modifierCounts.get(modifier) + ")";
    ui.filterModifier.appendChild(opt);
  });

  // Dynamic options: Target
  Array.from(targetCounts.keys()).sort().forEach((target) => {
    const opt = document.createElement("option");
    opt.value = target;
    opt.textContent = target + " (" + targetCounts.get(target) + ")";
    ui.filterTarget.appendChild(opt);
  });
}

function getActiveFilters() {
  return {
    name: ui.filterName.value.trim() || null,
    tree: ui.filterTree.value || null,
    type: ui.filterType.value || null,
    category: ui.filterCategory.value || null,
    rollType: ui.filterRollType.value || null,
    att: ui.filterATT.value || null,
    keywords: ui.filterKeywords.value || null,
    modifier: ui.filterModifier.value || null,
    target: ui.filterTarget.value || null,
  };
}

// Filter helper functions to eliminate duplication
function getCardRollTypeCategory(card) {
  const frontHasRoll = Boolean(card.Front.Roll);
  const backHasRoll = card.Back && Boolean(card.Back.Roll);
  const hasRoll = frontHasRoll || backHasRoll;
  const hasDIV = (frontHasRoll && card.Front.Roll.DIV) || (backHasRoll && card.Back.Roll.DIV);
  if (!hasRoll) return "none";
  if (hasDIV) return "div";
  return "regular";
}

function getCardAttributes(card) {
  const attributes = new Set();
  if (card.Front.Roll) {
    getRollAttributeList(card.Front.Roll).forEach((att) => attributes.add(att));
  }
  if (card.Back && card.Back.Roll) {
    getRollAttributeList(card.Back.Roll).forEach((att) => attributes.add(att));
  }
  return Array.from(attributes);
}

// Item cards' Requires field states the item's own equip prerequisite, not a
// thematic keyword the card carries — including it here would pollute the
// keyword filter with entries that don't describe the card itself.
function getCardAllKeywords(card) {
  const isItemCard = card._cardId.startsWith("i");
  const keywords = [...(card.Front.Keywords || []), ...(isItemCard ? [] : card.Front.Requires || [])];
  if (card.Back) {
    keywords.push(...(card.Back.Keywords || []), ...(isItemCard ? [] : card.Back.Requires || []));
  }
  return keywords;
}

function getCardModifiers(card) {
  const modifiers = new Set();
  if (card.Front.Roll && card.Front.Roll.Modifiers) {
    card.Front.Roll.Modifiers.forEach((mod) => {
      if (!mod.against && mod.Dice >= 0) {
        mod.Triggers.forEach((t) => modifiers.add(t));
      }
    });
  }
  if (card.Back && card.Back.Roll && card.Back.Roll.Modifiers) {
    card.Back.Roll.Modifiers.forEach((mod) => {
      if (!mod.against && mod.Dice >= 0) {
        mod.Triggers.forEach((t) => modifiers.add(t));
      }
    });
  }
  return Array.from(modifiers);
}

function getCardNegativeModifiers(card) {
  const negatives = new Set();
  if (card.Front.Roll && card.Front.Roll.Modifiers) {
    card.Front.Roll.Modifiers.forEach((mod) => {
      if (mod.against) return;
      if (mod.Dice < 0) {
        mod.Triggers.forEach((t) => negatives.add(t));
      }
    });
  }
  if (card.Back && card.Back.Roll && card.Back.Roll.Modifiers) {
    card.Back.Roll.Modifiers.forEach((mod) => {
      if (mod.against) return;
      if (mod.Dice < 0) {
        mod.Triggers.forEach((t) => negatives.add(t));
      }
    });
  }
  return Array.from(negatives);
}

function getCardTargets(card) {
  const targets = new Set();
  if (card.Front.Target) targets.add(card.Front.Target);
  if (card.Back && card.Back.Target) targets.add(card.Back.Target);
  return Array.from(targets);
}

function cardHasModifier(card, modifier) {
  const frontHasMod = card.Front.Roll && card.Front.Roll.Modifiers && card.Front.Roll.Modifiers.some((mod) => !mod.against && mod.Triggers.includes(modifier));
  const backHasMod = card.Back && card.Back.Roll && card.Back.Roll.Modifiers && card.Back.Roll.Modifiers.some((mod) => !mod.against && mod.Triggers.includes(modifier));
  return frontHasMod || backHasMod;
}

// Card database
function createCardDatabase(data) {
  const trees = new Map(data.AdvancementTrees.map((tree) => [tree.Name, tree]));

  const state = { data, trees, cards: null };
  state.cards = buildCardCache(data, trees);

  // Rendering
  function render() {
    const filters = getActiveFilters();
    const filteredCards = filterCards(state.cards, filters);
    const sortedCards = sortCards(filteredCards, ui.sortBy.value, !ui.sortOrder.checked);
    renderCardList(sortedCards);
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
      treeEl.className = "card-meta-tree";
      treeEl.textContent = card._tree;
      metaEl.appendChild(treeEl);

      const lockEl = document.createElement("span");
      lockEl.className = "card-meta-lock";
      lockEl.textContent = "Level: " + card._lockLevel;
      metaEl.appendChild(lockEl);

      li.appendChild(metaEl);
      li.appendChild(buildActionCardElement(card._cardId, card, null, null));
      list.appendChild(li);
    });

    ui.cardList.appendChild(list);
  }

  // Data loading
  function buildCardCache(data, trees) {
    const cards = [];
    const actionCardsMap = data.ActionCards || {};
    const treeByCard = new Map();
    const lockLevelByCard = new Map();

    // Path cards: assign to profession's primary tree at lock level 0
    data.Professions.forEach((profession) => {
      const primaryTreeName = resolvePrimaryTreeName(profession.Name, trees);
      (profession.Paths || []).forEach((path) => {
        (path.ActionCards || []).forEach((cardId) => {
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
          (entry.ActionCards || []).forEach((cardId) => {
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
      const isItemCard = cardId.startsWith("i");
      const tree = isBasic ? BASIC_TREE : isItemCard ? ITEM_CARD_TREE : (treeByCard.get(cardId) || BASIC_TREE);
      cards.push({
        ...card,
        _cardId: cardId,
        _tree: tree,
        _lockLevel: (isBasic || isItemCard) ? 0 : (lockLevelByCard.get(cardId) ?? 0),
      });
    });

    return cards;
  }

  // Filtering and sorting
  function filterCards(cards, filters) {
    return cards.filter((card) => {
      if (filters.name) {
        const q = filters.name.toLowerCase();
        const names = [
          card.Front.Name,
          card.Front.DisplayName,
          card.Back && card.Back.Name,
          card.Back && card.Back.DisplayName,
        ];
        if (!names.some((n) => n && n.toLowerCase().includes(q))) return false;
      }
      if (filters.tree && card._tree !== filters.tree) return false;
      if (filters.type && card.Front.Type !== filters.type) return false;
      if (filters.category && card.Front.Category !== filters.category) return false;
      if (filters.rollType && getCardRollTypeCategory(card) !== filters.rollType) return false;
      if (filters.att && !getCardAttributes(card).includes(filters.att)) return false;
      if (filters.keywords) {
        const allKeywords = getCardAllKeywords(card);
        const hasKeywords = allKeywords.length > 0;
        if (filters.keywords === "has" && !hasKeywords) return false;
        else if (filters.keywords === "none" && hasKeywords) return false;
        else if (filters.keywords !== "has" && filters.keywords !== "none") {
          if (!hasKeywords || !allKeywords.includes(filters.keywords)) return false;
        }
      }
      if (filters.modifier && !cardHasModifier(card, filters.modifier)) return false;
      if (filters.target && !getCardTargets(card).includes(filters.target)) return false;
      return true;
    });
  }

  function sortCards(cards, sortBy, descending) {
    const sorted = [...cards];

    switch (sortBy) {
      case "name":
        sorted.sort((a, b) => {
          const nameA = a.Front.DisplayName || a.Front.Name || "";
          const nameB = b.Front.DisplayName || b.Front.Name || "";
          return descending ? nameB.localeCompare(nameA) : nameA.localeCompare(nameB);
        });
        break;
      case "lockLevel":
        sorted.sort((a, b) => {
          const lockDiff = (a._lockLevel || 0) - (b._lockLevel || 0);
          if (lockDiff !== 0) return descending ? -lockDiff : lockDiff;
          const nameCmp = (a.Front.Name || "").localeCompare(b.Front.Name || "");
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

  function getAllCards() {
    return state.cards;
  }

  return { render, getAllCards };
}

// Error display
function showError(message) {
  ui.errorBanner.textContent = message;
  ui.errorBanner.classList.remove("hidden");
}
