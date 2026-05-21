import { createCharacterBuilder } from "./character.js";

const ui = {};
let builder = null;
let pendingBuildAction = null;

init();

// Startup
async function init() {
  cacheUi();
  for (const panel of [ui.controlsPanel, ui.summaryPanel, ui.treesPanel]) {
    const box = document.createElement("div");
    box.className = "empty-state";
    box.textContent = "Loading...";
    panel.replaceChildren(box);
  }

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
    ui.newBuildButton.disabled = false;
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
    showError(
      "Could not load data.json. If you opened this file directly from disk, serve the folder over HTTP or open the GitHub Pages version instead. " +
        error.message
    );
  }
}

function cacheUi() {
  ui.newBuildButton = document.getElementById("newBuildButton");
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
  ui.confirmOverlay = document.getElementById("confirmOverlay");
  ui.confirmClose = document.getElementById("confirmClose");
  ui.confirmCancel = document.getElementById("confirmCancel");
  ui.confirmAccept = document.getElementById("confirmAccept");
}

function bindEvents() {
  ui.newBuildButton.addEventListener("click", openNewBuild);
  ui.resetButton.addEventListener("click", () => requestBuildConfirmation(() => builder.resetBuild()));
  ui.randomButton.addEventListener("click", () => requestBuildConfirmation(() => builder.randomBuild()));
  ui.copyLinkButton.addEventListener("click", copyLink);
  ui.selectorClose.addEventListener("click", () => builder.closeSelector());
  ui.selectorOverlay.addEventListener("click", (event) => {
    if (event.target === ui.selectorOverlay) {
      builder.closeSelector();
    }
  });
  ui.confirmClose.addEventListener("click", closeConfirmDialog);
  ui.confirmCancel.addEventListener("click", closeConfirmDialog);
  ui.confirmAccept.addEventListener("click", confirmPendingBuildAction);
  ui.confirmOverlay.addEventListener("click", (event) => {
    if (event.target === ui.confirmOverlay) {
      closeConfirmDialog();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (isConfirmDialogOpen()) {
        closeConfirmDialog();
        return;
      }
      builder.closeSelector();
    }
  });
}

// URL and clipboard
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

function openNewBuild() {
  const newBuildUrl = new URL(window.location.href);
  newBuildUrl.hash = "";
  window.open(newBuildUrl.toString(), "_blank", "noopener");
}

// Confirmation dialog
function requestBuildConfirmation(action) {
  if (builder.isBuildEmpty()) {
    action();
    return;
  }

  pendingBuildAction = action;
  ui.confirmOverlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
  ui.confirmAccept.focus();
}

function confirmPendingBuildAction() {
  const action = pendingBuildAction;
  closeConfirmDialog();
  if (action) {
    action();
  }
}

function closeConfirmDialog() {
  pendingBuildAction = null;
  ui.confirmOverlay.classList.add("hidden");
  document.body.style.overflow = "";
}

function isConfirmDialogOpen() {
  return !ui.confirmOverlay.classList.contains("hidden");
}

// Error banner
function showError(message) {
  ui.errorBanner.textContent = message;
  ui.errorBanner.classList.remove("hidden");
}

function clearError() {
  ui.errorBanner.textContent = "";
  ui.errorBanner.classList.add("hidden");
}
