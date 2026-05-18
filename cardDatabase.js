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

const BASIC_PROFESSION = "Basic";

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

  const professions = new Set();
  db.getAllCards().forEach((card) => {
    card._professions.forEach((prof) => professions.add(prof));
  });

  const profSelect = ui.filterProfession;
  // "Basic" first, then the rest sorted
  if (professions.has(BASIC_PROFESSION)) {
    const opt = document.createElement("option");
    opt.value = BASIC_PROFESSION;
    opt.textContent = BASIC_PROFESSION;
    profSelect.appendChild(opt);
    professions.delete(BASIC_PROFESSION);
  }
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

    const professionsByCard = new Map();
    const lockLevelByCard = new Map();

    data.Professions.forEach((profession) => {
      // Scan path cards
      (profession.Paths || []).forEach((path) => {
        (path["Action cards"] || []).forEach((cardId) => {
          if (!professionsByCard.has(cardId)) {
            professionsByCard.set(cardId, []);
          }
          if (!professionsByCard.get(cardId).includes(profession.Name)) {
            professionsByCard.get(cardId).push(profession.Name);
          }
          if (!lockLevelByCard.has(cardId)) {
            lockLevelByCard.set(cardId, 0);
          }
        });
      });

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

    // Race cards get lock level 0
    data.Races.forEach((race) => {
      (race["Action cards"] || []).forEach((cardId) => {
        if (!lockLevelByCard.has(cardId)) {
          lockLevelByCard.set(cardId, 0);
        }
      });
    });

    Object.entries(actionCardsMap).forEach(([cardId, card]) => {
      const professions = professionsByCard.get(cardId) || [];
      const cardWithMeta = {
        ...card,
        _cardId: cardId,
        _professions: professions.length > 0 ? professions : [BASIC_PROFESSION],
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
        const attList = card.Roll.ATT && card.Roll.ATT.length > 0 ? card.Roll.ATT : ["STR", "AGI", "INT", "CHA"];
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
      case "lockLevel":
        sorted.sort((a, b) => {
          const diff = (b._lockLevel || 0) - (a._lockLevel || 0);
          return descending ? diff : -diff;
        });
        break;
      case "profession":
        sorted.sort((a, b) => {
          const profA = (a._professions[0] || "");
          const profB = (b._professions[0] || "");
          const cmp = profA.localeCompare(profB);
          return descending ? -cmp : cmp;
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

      const profEl = document.createElement("span");
      profEl.className = "card-meta-profession";
      profEl.textContent = card._professions.join(", ");
      metaEl.appendChild(profEl);

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

  return {
    render,
    getAllCards,
  };
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
