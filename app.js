import { createCharacterBuilder } from "./character.js";

const ui = {};
let builder = null;

init();

async function init() {
  cacheUi();
  renderLoadingState();

  try {
    const response = await fetch("data.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Request failed with status " + response.status + ".");
    }

    const data = await response.json();
    builder = createCharacterBuilder({
      data,
      ui,
      onStateChange: syncUrlHash,
    });

    bindEvents();
    setLoadStatus(
      data.Races.length +
        " races | " +
        data.Professions.length +
        " professions | " +
        data["Advancement Trees"].length +
        " trees"
    );
    ui.resetButton.disabled = false;
    ui.randomButton.disabled = false;
    ui.copyLinkButton.disabled = false;
    clearError();

    const encodedState = location.hash.slice(1);
    const restored = encodedState ? builder.restoreStateFromEncoded(encodedState) : false;
    if (!restored) {
      builder.render();
      syncUrlHash(builder.serializeState());
    }
  } catch (error) {
    setLoadStatus("Data unavailable");
    showError(
      "Could not load data.json. If you opened this file directly from disk, serve the folder over HTTP or open the GitHub Pages version instead. " +
        error.message
    );
  }
}

function cacheUi() {
  ui.loadStatus = document.getElementById("loadStatus");
  ui.randomButton = document.getElementById("randomButton");
  ui.copyLinkButton = document.getElementById("copyLinkButton");
  ui.resetButton = document.getElementById("resetButton");
  ui.errorBanner = document.getElementById("errorBanner");
  ui.controlsPanel = document.getElementById("controlsPanel");
  ui.summaryPanel = document.getElementById("summaryPanel");
  ui.treesPanel = document.getElementById("treesPanel");
  ui.selectorOverlay = document.getElementById("selectorOverlay");
  ui.selectorKicker = document.getElementById("selectorKicker");
  ui.selectorTitle = document.getElementById("selectorTitle");
  ui.selectorDescription = document.getElementById("selectorDescription");
  ui.selectorOptions = document.getElementById("selectorOptions");
  ui.selectorClose = document.getElementById("selectorClose");
}

function bindEvents() {
  ui.resetButton.addEventListener("click", () => builder.resetBuild());
  ui.randomButton.addEventListener("click", () => builder.randomBuild());
  ui.copyLinkButton.addEventListener("click", copyLink);
  ui.selectorClose.addEventListener("click", () => builder.closeSelector());
  ui.selectorOverlay.addEventListener("click", (event) => {
    if (event.target === ui.selectorOverlay) {
      builder.closeSelector();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      builder.closeSelector();
    }
  });
}

function renderLoadingState() {
  ui.controlsPanel.replaceChildren(createEmptyState("Loading builder data..."));
  ui.summaryPanel.replaceChildren(createEmptyState("Loading character board..."));
  ui.treesPanel.replaceChildren(createEmptyState("Loading advancement trees..."));
}

function createEmptyState(text) {
  const box = document.createElement("div");
  box.className = "empty-state";
  box.textContent = text;
  return box;
}

function syncUrlHash(encoded) {
  history.replaceState(null, "", encoded ? "#" + encoded : location.pathname + location.search);
}

function copyLink() {
  syncUrlHash(builder.serializeState());
  navigator.clipboard.writeText(location.href).then(() => {
    const original = ui.copyLinkButton.textContent;
    ui.copyLinkButton.textContent = "Copied!";
    window.setTimeout(() => {
      ui.copyLinkButton.textContent = original;
    }, 1800);
  }).catch((error) => {
    showError("Could not copy link. " + (error && error.message ? error.message : "Clipboard access failed."));
  });
}

function setLoadStatus(text) {
  ui.loadStatus.textContent = text;
}

function showError(message) {
  ui.errorBanner.textContent = message;
  ui.errorBanner.classList.remove("hidden");
}

function clearError() {
  ui.errorBanner.textContent = "";
  ui.errorBanner.classList.add("hidden");
}
