import { buildItemElement } from "./uiComponents.js";
import { getItemDisplayName } from "./displayParts.js";
import { ITEM_TIERS, ITEM_TYPE_ORDER } from "./constants.js";

let itemDatabase = null;
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
    itemDatabase = createItemDatabase(data);

    populateFilters(itemDatabase);
    itemDatabase.render();
    bindEvents();
  } catch (error) {
    showError("Could not load data.json. " + error.message);
  }
}

function cacheUi() {
  ui.filterName = document.getElementById("filterName");
  ui.filterType = document.getElementById("filterType");
  ui.filterTier = document.getElementById("filterTier");
  ui.filterKeywords = document.getElementById("filterKeywords");
  ui.filterCard = document.getElementById("filterCard");
  ui.sortBy = document.getElementById("sortBy");
  ui.sortOrder = document.getElementById("sortOrder");
  ui.resetFiltersButton = document.getElementById("resetFiltersButton");
  ui.cardList = document.getElementById("cardList");
  ui.errorBanner = document.getElementById("errorBanner");
}

function bindEvents() {
  ui.filterName.addEventListener("input", () => itemDatabase.render());
  ui.filterType.addEventListener("change", () => itemDatabase.render());
  ui.filterTier.addEventListener("change", () => itemDatabase.render());
  ui.filterKeywords.addEventListener("change", () => itemDatabase.render());
  ui.filterCard.addEventListener("change", () => itemDatabase.render());
  ui.sortBy.addEventListener("change", () => itemDatabase.render());
  ui.sortOrder.addEventListener("change", () => itemDatabase.render());
  ui.resetFiltersButton.addEventListener("click", () => {
    ui.filterName.value = "";
    ui.filterType.value = "";
    ui.filterTier.value = "";
    ui.filterKeywords.value = "";
    ui.filterCard.value = "";
    ui.sortBy.value = "name";
    ui.sortOrder.checked = true;
    itemDatabase.render();
  });
}

// Filter controls
function populateFilters(db) {
  const typeCounts = new Map();
  const tierCounts = new Map();
  const keywordCounts = { has: 0, none: 0 };
  const individualKeywordCounts = new Map();
  const cardCounts = { yes: 0, no: 0 };

  db.getAllItems().forEach(({ item }) => {
    if (item.Type) typeCounts.set(item.Type, (typeCounts.get(item.Type) || 0) + 1);

    const tier = item.Tier || "Basic";
    tierCounts.set(tier, (tierCounts.get(tier) || 0) + 1);

    const keywords = item.Keywords || [];
    if (keywords.length > 0) {
      keywordCounts.has++;
      keywords.forEach((kw) => individualKeywordCounts.set(kw, (individualKeywordCounts.get(kw) || 0) + 1));
    } else {
      keywordCounts.none++;
    }

    if (item.Card) cardCounts.yes++;
    else cardCounts.no++;
  });

  ui.filterType.querySelectorAll("option[value]:not([value=''])").forEach((opt) => {
    opt.textContent = opt.value + " (" + (typeCounts.get(opt.value) || 0) + ")";
  });
  ui.filterTier.querySelectorAll("option[value]:not([value=''])").forEach((opt) => {
    opt.textContent = opt.value + " (" + (tierCounts.get(opt.value) || 0) + ")";
  });
  ui.filterKeywords.querySelectorAll("option[value]:not([value=''])").forEach((opt) => {
    opt.textContent = opt.textContent + " (" + (keywordCounts[opt.value] || 0) + ")";
  });
  ui.filterCard.querySelectorAll("option[value]:not([value=''])").forEach((opt) => {
    opt.textContent = opt.textContent + " (" + (cardCounts[opt.value] || 0) + ")";
  });

  // Dynamic options: Keywords
  Array.from(individualKeywordCounts.keys()).sort().forEach((kw) => {
    const opt = document.createElement("option");
    opt.value = kw;
    opt.textContent = kw + " (" + individualKeywordCounts.get(kw) + ")";
    ui.filterKeywords.appendChild(opt);
  });
}

function getActiveFilters() {
  return {
    name: ui.filterName.value.trim() || null,
    type: ui.filterType.value || null,
    tier: ui.filterTier.value || null,
    keywords: ui.filterKeywords.value || null,
    card: ui.filterCard.value || null,
  };
}

// Item database
function createItemDatabase(data) {
  const state = { data, items: null };
  state.items = buildItemCache(data);

  function render() {
    const filters = getActiveFilters();
    const filteredItems = filterItems(state.items, filters);
    const sortedItems = sortItems(filteredItems, ui.sortBy.value, !ui.sortOrder.checked);
    renderItemList(sortedItems);
  }

  function renderItemList(items) {
    ui.cardList.replaceChildren();

    if (items.length === 0) {
      const emptyState = document.createElement("div");
      emptyState.className = "empty-state";
      emptyState.textContent = "No items match the selected filters.";
      ui.cardList.appendChild(emptyState);
      return;
    }

    const list = document.createElement("ul");
    list.className = "item-database-list";

    items.forEach(({ item }) => {
      const li = document.createElement("li");
      li.className = "card-database-item";

      const metaEl = document.createElement("div");
      metaEl.className = "card-database-meta";

      const typeEl = document.createElement("span");
      typeEl.className = "card-meta-tree";
      typeEl.textContent = item.Type || "";
      metaEl.appendChild(typeEl);

      const tierEl = document.createElement("span");
      tierEl.className = "card-meta-lock";
      tierEl.textContent = "Tier: " + (item.Tier || "Basic");
      metaEl.appendChild(tierEl);

      li.appendChild(metaEl);
      const card = item.Card ? data.ActionCards[item.Card] : null;
      li.appendChild(buildItemElement(item, card, null));
      list.appendChild(li);
    });

    ui.cardList.appendChild(list);
  }

  // Data loading
  function buildItemCache(data) {
    return Object.entries(data.Items || {}).map(([itemName, item]) => ({ itemName, item }));
  }

  // Filtering and sorting
  function filterItems(items, filters) {
    return items.filter(({ itemName, item }) => {
      if (filters.name) {
        const q = filters.name.toLowerCase();
        const name = (getItemDisplayName(item) || itemName || "").toLowerCase();
        if (!name.includes(q)) return false;
      }
      if (filters.type && item.Type !== filters.type) return false;
      if (filters.tier && (item.Tier || "Basic") !== filters.tier) return false;
      if (filters.keywords) {
        const keywords = item.Keywords || [];
        const hasKeywords = keywords.length > 0;
        if (filters.keywords === "has" && !hasKeywords) return false;
        else if (filters.keywords === "none" && hasKeywords) return false;
        else if (filters.keywords !== "has" && filters.keywords !== "none") {
          if (!keywords.includes(filters.keywords)) return false;
        }
      }
      if (filters.card === "yes" && !item.Card) return false;
      if (filters.card === "no" && item.Card) return false;
      return true;
    });
  }

  function sortItems(items, sortBy, descending) {
    const sorted = [...items];

    switch (sortBy) {
      case "name":
        sorted.sort((a, b) => {
          const nameA = getItemDisplayName(a.item) || a.itemName || "";
          const nameB = getItemDisplayName(b.item) || b.itemName || "";
          return descending ? nameB.localeCompare(nameA) : nameA.localeCompare(nameB);
        });
        break;
      case "tier":
        sorted.sort((a, b) => {
          const tierDiff = ITEM_TIERS.indexOf(a.item.Tier || "Basic") - ITEM_TIERS.indexOf(b.item.Tier || "Basic");
          if (tierDiff !== 0) return descending ? -tierDiff : tierDiff;
          const nameCmp = getItemDisplayName(a.item).localeCompare(getItemDisplayName(b.item));
          return descending ? -nameCmp : nameCmp;
        });
        break;
      case "type":
        sorted.sort((a, b) => {
          const typeDiff = ITEM_TYPE_ORDER.indexOf(a.item.Type) - ITEM_TYPE_ORDER.indexOf(b.item.Type);
          if (typeDiff !== 0) return descending ? -typeDiff : typeDiff;
          const nameCmp = getItemDisplayName(a.item).localeCompare(getItemDisplayName(b.item));
          return descending ? -nameCmp : nameCmp;
        });
        break;
    }

    return sorted;
  }

  function getAllItems() {
    return state.items;
  }

  return { render, getAllItems };
}

// Error display
function showError(message) {
  ui.errorBanner.textContent = message;
  ui.errorBanner.classList.remove("hidden");
}
