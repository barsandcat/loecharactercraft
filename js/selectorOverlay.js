import { createEmptyState, buildItemElement } from "./uiComponents.js";
import { buildActionCardElement } from "./cardRender.js";

export function createSelectorOverlay(ui) {
  function openSelector(config) {
    ui.selectorKicker.textContent = config.kicker || "Choose Option";
    ui.selectorTitle.textContent = config.title || "Options";
    ui.selectorDescription.textContent = config.description || "";
    ui.selectorDescription.classList.toggle("hidden", !config.description);
    ui.selectorOptions.replaceChildren();

    if (!config.options.length) {
      ui.selectorOptions.appendChild(
        createEmptyState("No options are available here yet.")
      );
    } else {
      config.options.forEach((option) => {
        const content = config.getOptionContent(option);
        const isSelected = Boolean(config.isSelected && config.isSelected(option));
        const button = document.createElement("button");
        button.type = "button";
        button.className = "option-card";
        if (isSelected) {
          button.classList.add("active");
        }

        button.addEventListener("click", () => {
          config.onSelect(option);
          closeSelector();
        });

        const title = document.createElement("div");
        title.className = "option-title";
        if (typeof content.renderTitle === "function") {
          content.renderTitle(title);
        } else {
          title.textContent = content.title || "";
        }
        button.appendChild(title);

        if (typeof content.renderDetail === "function" || content.detail) {
          const detail = document.createElement("div");
          detail.className = "option-detail";
          if (typeof content.renderDetail === "function") {
            content.renderDetail(detail);
          } else {
            detail.textContent = content.detail;
          }
          button.appendChild(detail);
        }

        if (content.items && content.items.length) {
          const itemsEl = document.createElement("div");
          itemsEl.className = "option-items";
          content.items.forEach((item) => {
            itemsEl.appendChild(buildItemElement(item));
          });
          button.appendChild(itemsEl);
        }

        if (content.actionCards && content.actionCards.length) {
          const cardsEl = document.createElement("div");
          cardsEl.className = "option-action-cards";
          content.actionCards.forEach(({ cardId, card, previewStats }) => {
            cardsEl.appendChild(
              buildActionCardElement(
                cardId,
                card,
                previewStats ? previewStats.attributes : null,
                previewStats ? previewStats.keywordCounts : null
              )
            );
          });
          button.appendChild(cardsEl);
        }

        ui.selectorOptions.appendChild(button);
      });
    }

    ui.selectorOverlay.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    ui.selectorClose.focus();
  }

  function closeSelector() {
    ui.selectorOverlay.classList.add("hidden");
    document.body.style.overflow = "";
  }

  return { openSelector, closeSelector };
}
