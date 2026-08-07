import { ATTRIBUTES, buildActionCardElement } from "./cardRender.js";
import {
  ITEM_SLOT_TYPES,
  ACTION_SLOT_RULES,
  MAX_ADDED_ITEMS,
  SKILL_SLOT_LABELS,
  ITEM_SLOT_LABELS,
  ACTION_SLOT_LABELS,
} from "./constants.js";
import { getRaceAttributeOptions, getRaceFreeSkills } from "./stateCodec.js";
import {
  getAccessibleAdvancementTreeNames,
  buildSelectedByTree,
  isAdvancementLevelUnlocked,
} from "./advancementTree.js";
import {
  collectCharacterStats,
  buildActionCardPreviewStats,
  buildPreviewStatsForSelection,
  resolveSkillSlots,
  resolveItemSlots,
  resolveActionSlots,
} from "./characterStats.js";
import { buildRaceDetailParts, buildEntryParts, formatAttributeSummary, getItemDisplayName } from "./displayParts.js";
import { appendDisplayParts, appendCountSummary } from "./displayPartsDom.js";
import {
  describeRaceOption,
  describeAttributeOption,
  describeFreeSkillOption,
  describeEntryOption,
  describeProfessionOption,
  describeTreeLevelOption,
  describeVersionOption,
} from "./selectorDescriptors.js";
import {
  singleChoiceGrid,
  dualChoiceGrid,
  createListSection,
  createStatCard,
  createEmptyState,
  buildItemElement,
  renderEntryToElement,
} from "./uiComponents.js";

export function createPanelRenderer({ state, ui, callbacks }) {
  function renderControls(levelMeta) {
    const container = ui.controlsPanel;
    container.replaceChildren();

    const stats = collectCharacterStats(state);
    const attrOptions = state.selectedRace ? getRaceAttributeOptions(state.selectedRace) : [];
    const freeSkillOptions = getRaceFreeSkills(state.selectedRace);
    const pathOptions = state.selectedProf ? state.selectedProf.Paths : [];

    container.appendChild(singleChoiceGrid({
      label: "Race",
      main: state.selectedRace ? state.selectedRace.Name : "Choose race",
      detail: state.selectedRace
        ? ""
        : state.data.Races.length + " available options",
      renderDetail: state.selectedRace
        ? (parent) => appendDisplayParts(parent, buildRaceDetailParts(state.selectedRace))
        : null,
      complete: Boolean(state.selectedRace),
      onClick: () => callbacks.openSelector({
        title: "Choose Race",
        options: state.data.Races,
        getOptionContent: (option) => describeRaceOption(state, option),
        onSelect: callbacks.selectRace,
        isSelected: (option) => state.selectedRace === option,
      }),
    }));

    container.appendChild(dualChoiceGrid({
      className: "three-one",
      firstButton: {
        label: "Attributes",
        main: state.selectedAttributeSet ? formatAttributeSummary(state.selectedAttributeSet) : "Choose attributes",
        detail: !state.selectedRace
          ? "Pick a race first."
          : attrOptions.length + " available spread" + (attrOptions.length === 1 ? "" : "s"),
        accent: Boolean(state.selectedAttributeSet),
        empty: !state.selectedAttributeSet,
        disabled: !state.selectedRace || attrOptions.length === 0,
        onClick: () => callbacks.openSelector({
          title: "Choose Attributes",
          options: attrOptions,
          getOptionContent: describeAttributeOption,
          onSelect: callbacks.selectAttributeSet,
          isSelected: (option) => state.selectedAttributeSet === option,
        }),
      },
      secondButton: {
        label: "Skill",
        main: state.selectedFreeSkill
          ? state.selectedFreeSkill
          : freeSkillOptions.length
            ? "Choose skill"
            : "Unavaliable",
        detail: !state.selectedRace
          ? "Pick a race first."
          : freeSkillOptions.length
            ? freeSkillOptions.length + " option" + (freeSkillOptions.length === 1 ? "" : "s")
            : "",
        accent: Boolean(state.selectedFreeSkill),
        empty: freeSkillOptions.length > 0 && !state.selectedFreeSkill,
        disabled: freeSkillOptions.length === 0,
        onClick: () => callbacks.openSelector({
          title: "Choose Skill",
          options: freeSkillOptions,
          getOptionContent: describeFreeSkillOption,
          onSelect: callbacks.selectFreeSkill,
          isSelected: (option) => state.selectedFreeSkill === option,
        }),
      },
    }));

    container.appendChild(singleChoiceGrid({
      label: "Origin",
      main: state.selectedOrigin ? state.selectedOrigin.Name : "Choose origin",
      detail: state.selectedOrigin
        ? ""
        : state.data.Origins.length + " available options",
      renderDetail: state.selectedOrigin
        ? (parent) => appendDisplayParts(parent, buildEntryParts(state.selectedOrigin, state.data))
        : null,
      complete: Boolean(state.selectedOrigin),
      onClick: () => callbacks.openSelector({
        title: "Choose Origin",
        options: state.data.Origins,
        getOptionContent: (option) =>
          describeEntryOption(state, option, buildPreviewStatsForSelection(state, { selectedOrigin: option })),
        onSelect: callbacks.selectOrigin,
        isSelected: (option) => state.selectedOrigin === option,
      }),
    }));

    container.appendChild(singleChoiceGrid({
      label: "Profession",
      main: state.selectedProf ? state.selectedProf.Name : "Choose profession",
      detail: state.selectedProf
        ? ""
        : state.data.Professions.length + " available options",
      renderDetail: state.selectedProf
        ? (parent) => appendDisplayParts(parent, buildEntryParts(state.selectedProf, state.data))
        : null,
      complete: Boolean(state.selectedProf),
      onClick: () => callbacks.openSelector({
        title: "Choose Profession",
        options: state.data.Professions,
        getOptionContent: (option) => describeProfessionOption(state, option),
        onSelect: callbacks.selectProfession,
        isSelected: (option) => state.selectedProf === option,
      }),
    }));

    container.appendChild(singleChoiceGrid({
      label: "Path",
      main: state.selectedPath ? state.selectedPath.Name : "Choose path",
      detail: !state.selectedProf
        ? "Pick a profession first."
        : state.selectedPath
          ? ""
          : pathOptions.length + " available options",
      renderDetail: state.selectedPath
        ? (parent) => appendDisplayParts(parent, buildEntryParts(state.selectedPath, state.data))
        : null,
      complete: Boolean(state.selectedPath),
      empty: !state.selectedPath,
      disabled: !state.selectedProf || pathOptions.length === 0,
      onClick: () => callbacks.openSelector({
        title: "Choose Path",
        options: pathOptions,
        getOptionContent: (option) =>
          describeEntryOption(state, option, buildPreviewStatsForSelection(state, { selectedPath: option })),
        onSelect: callbacks.selectPath,
        isSelected: (option) => state.selectedPath === option,
      }),
    }));

    levelMeta.forEach((slotMeta) => {
      container.appendChild(dualChoiceGrid({
        firstButton: {
          label: "Tree",
          main: slotMeta.selectedTree
            ? slotMeta.selectedTree.treeName + " L" + slotMeta.selectedTree.level
            : "Choose level up",
          detail: !slotMeta.unlocked
            ? "Locked for now."
            : slotMeta.treeOptions.length + " available option" + (slotMeta.treeOptions.length === 1 ? "" : "s"),
          disabled: !slotMeta.unlocked || slotMeta.treeOptions.length === 0,
          accent: slotMeta.selectedTree !== null,
          empty: slotMeta.selectedTree === null,
          onClick: () =>
            callbacks.openSelector({
              kicker: "Level Up " + slotMeta.slotNumber,
              title: "Choose Level-Up Tree",
              description: "Select which tree level to spend this slot on.",
              options: slotMeta.treeOptions,
              getOptionContent: (option) => describeTreeLevelOption(state, option),
              onSelect: (option) => callbacks.selectLevelUpTree(slotMeta.slotIndex, option),
              isSelected: (option) =>
                Boolean(
                  slotMeta.selectedTree &&
                    slotMeta.selectedTree.treeName === option.treeName &&
                    slotMeta.selectedTree.level === option.level
                ),
            }),
        },
        secondButton: {
          label: "Reward",
          main: slotMeta.selectedVersion ? "" : "Choose reward",
          renderMain: slotMeta.selectedVersion
            ? (parent) => appendDisplayParts(parent, buildEntryParts(slotMeta.selectedVersion.entry, state.data))
            : null,
          detail: !slotMeta.selectedTree
            ? "Choose a tree level first."
            : slotMeta.versionOptions.length + " available reward" + (slotMeta.versionOptions.length === 1 ? "" : "s"),
          disabled: !slotMeta.selectedTree || slotMeta.versionOptions.length === 0,
          accent: slotMeta.selectedVersion !== null,
          empty: slotMeta.selectedVersion === null,
          onClick: () =>
            callbacks.openSelector({
              kicker: "Level Up " + slotMeta.slotNumber,
              title: "Choose Reward",
              description: "Pick the reward version for this tree level.",
              options: slotMeta.versionOptions,
              getOptionContent: (option) => describeVersionOption(state, option, slotMeta.slotIndex),
              onSelect: (option) => callbacks.selectLevelUpVersion(slotMeta.slotIndex, option),
              isSelected: (option) =>
                Boolean(slotMeta.selectedVersion && slotMeta.selectedVersion.index === option.index),
            }),
        },
      }));

      const basicUpgradeSlot = stats.basicUpgradeSlots.find((slot) => slot.slotIndex === slotMeta.slotIndex);
      if (basicUpgradeSlot) {
        container.appendChild(singleChoiceGrid({
          label: "Basic Upgrade",
          main: basicUpgradeSlot.chosenFamily
            ? "Upgraded: " + basicUpgradeSlot.chosenFamily.name
            : "Select basic to upgrade",
          detail: "This reward duplicates a basic action you already have at its top tier.",
          complete: Boolean(basicUpgradeSlot.chosenFamily),
          empty: !basicUpgradeSlot.chosenFamily,
          onClick: () => callbacks.openBasicUpgradePickerForSlot(slotMeta.slotIndex),
        }));
      }
    });

    state.addedItems.forEach((itemName) => {
      const item = state.data.Items[itemName];
      container.appendChild(singleChoiceGrid({
        label: "Added Item",
        main: item ? getItemDisplayName(item) : itemName,
        detail: "Click to remove from your build.",
        complete: true,
        onClick: () => callbacks.removeAddedItem(itemName),
      }));
    });

    container.appendChild(singleChoiceGrid({
      label: "Items",
      main: "Add Item",
      detail: state.addedItems.length >= MAX_ADDED_ITEMS
        ? "Maximum of " + MAX_ADDED_ITEMS + " added items reached."
        : "Browse available items and add one to your build.",
      disabled: state.addedItems.length >= MAX_ADDED_ITEMS,
      onClick: () => callbacks.openAddItemSelector(),
    }));
  }

  function renderSummary() {
    const container = ui.summaryPanel;
    container.replaceChildren();

    if (callbacks.isBuildEmpty()) {
      container.appendChild(
        createEmptyState(
          "Start by choosing a race, origin, and profession. Your attributes, items, keywords, and actions will appear here as the build comes together."
        )
      );
      return;
    }

    const stats = collectCharacterStats(state);
    const actionCardPreviewStats = buildActionCardPreviewStats(state, stats);
    const allKeywordCounts = actionCardPreviewStats.keywordCounts;

    const attributeCard = document.createElement("section");
    attributeCard.className = "summary-card";
    const attributeTitle = document.createElement("h3");
    attributeTitle.textContent = "Attributes & Stats";
    attributeCard.appendChild(attributeTitle);

    const attributeGroup = document.createElement("div");
    attributeGroup.className = "summary-stat-group";

    const attributeGrid = document.createElement("div");
    attributeGrid.className = "stat-grid";
    const ATTRIBUTE_LIMIT = 6;
    ATTRIBUTES.forEach((attribute) => {
      attributeGrid.appendChild(
        createStatCard(attribute, String(stats.attributes[attribute] || 0), ATTRIBUTE_LIMIT)
      );
    });
    attributeGroup.appendChild(attributeGrid);
    attributeCard.appendChild(attributeGroup);

    const statGroup = document.createElement("div");
    statGroup.className = "summary-stat-group";

    const statGrid = document.createElement("div");
    statGrid.className = "stat-grid";
    statGrid.appendChild(createStatCard("MOB", String(stats.mob), 10));
    statGrid.appendChild(createStatCard("HP", String(stats.hp), 16));
    statGrid.appendChild(createStatCard("DIV", stats.divDie || "-"));
    statGrid.appendChild(createStatCard("Brill", String(stats.brill)));
    statGroup.appendChild(statGrid);
    attributeCard.appendChild(statGroup);
    container.appendChild(attributeCard);

    if (allKeywordCounts.size) {
      container.appendChild(createListSection("Keywords", [{
        render: (parent) => appendCountSummary(parent, allKeywordCounts, "keyword"),
      }]));
    }

    container.appendChild(buildSlotSection({
      title: "Skills",
      resolved: resolveSkillSlots(state, stats),
      slotLabel: (slotIndex) => SKILL_SLOT_LABELS[slotIndex],
      slotMain: (entry) => entry.skill,
      onClick: (slotIndex) => callbacks.openSkillPickerForSlot(slotIndex),
      onPouchClick: () => callbacks.openSkillPouch(),
    }));

    container.appendChild(buildItemSlotSection({
      title: "Items",
      resolved: resolveItemSlots(state, stats),
      slotLabel: (slotIndex) => ITEM_SLOT_LABELS[slotIndex],
      onClick: (slotIndex) => callbacks.openItemPickerForSlot(slotIndex),
      onPouchClick: () => callbacks.openItemPouch(),
      previewStats: actionCardPreviewStats,
    }));

    container.appendChild(buildSlotSection({
      title: "Action Card Hotbar",
      resolved: resolveActionSlots(state, stats),
      slotLabel: (slotIndex) => ACTION_SLOT_LABELS[slotIndex],
      renderOccupiedContent: (entry) =>
        buildActionCardElement(entry.card._cardId, entry.card, actionCardPreviewStats.attributes, actionCardPreviewStats.keywordCounts),
      listLayout: true,
      lockedDetail: (slotIndex) => {
        const unlockAt = ACTION_SLOT_RULES[slotIndex].unlockAt;
        return "Locked — needs " + unlockAt + " level-up" + (unlockAt === 1 ? "" : "s") + ".";
      },
      onClick: (slotIndex) => callbacks.openActionPickerForSlot(slotIndex),
      onPouchClick: () => callbacks.openActionPouch(),
    }));
  }

  function buildSlotSectionHeader(title, pouchCount, onPouchClick) {
    const header = document.createElement("div");
    header.className = "summary-card-header";
    const heading = document.createElement("h3");
    heading.textContent = title;
    header.appendChild(heading);

    const clickable = pouchCount > 0 && Boolean(onPouchClick);
    const pouchCountEl = document.createElement(clickable ? "button" : "span");
    pouchCountEl.className = "pouch-count";
    pouchCountEl.textContent = pouchCount + " in pouch";
    if (clickable) {
      pouchCountEl.type = "button";
      pouchCountEl.addEventListener("click", onPouchClick);
    }
    header.appendChild(pouchCountEl);
    return header;
  }

  // One slot's row: the FULL existing element (buildItemElement /
  // buildActionCardElement, same as before this feature existed) wrapped in a
  // plain clickable button when occupied; a compact choice-button for
  // empty/locked slots, or for systems with no rich rendering (skills).
  // Every unlocked slot is clickable regardless of occupancy — the picker now
  // offers every eligible pool entry (including ones equipped elsewhere), not
  // just the pouch, and gracefully shows "no options" if truly nothing fits.
  function renderSlotRow({
    slotResult,
    slotIndex,
    slotLabel,
    slotMain,
    lockedDetail,
    onClick,
    renderOccupiedContent,
  }) {
    const occupied = Boolean(slotResult.entry);
    const locked = slotResult.reason === "locked";

    if (occupied && renderOccupiedContent) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "slot-full-button";

      const label = document.createElement("div");
      label.className = "slot-full-label";
      label.textContent = slotLabel(slotIndex);
      button.appendChild(label);

      button.appendChild(renderOccupiedContent(slotResult.entry));
      button.addEventListener("click", () => onClick(slotIndex));
      return button;
    }

    return singleChoiceGrid({
      label: slotLabel(slotIndex),
      main: occupied && slotMain
        ? slotMain(slotResult.entry)
        : locked
          ? "Locked"
          : "Empty",
      detail: locked && lockedDetail ? lockedDetail(slotIndex) : "",
      complete: occupied,
      empty: !occupied && !locked,
      locked,
      onClick: () => onClick(slotIndex),
    });
  }

  // Shared renderer for the Skills/Action-Card-Hotbar slot grids — a header
  // with a pouch count, then one row per slot in a single list/grid. Items
  // uses buildItemSlotSection instead, which groups slots into columns.
  function buildSlotSection({
    title,
    resolved,
    slotLabel,
    slotMain,
    lockedDetail,
    onClick,
    renderOccupiedContent,
    listLayout,
    onPouchClick,
  }) {
    const { slots, pouch } = resolved;

    const section = document.createElement("section");
    section.className = "summary-card";
    section.appendChild(buildSlotSectionHeader(title, pouch.length, onPouchClick));

    const list = document.createElement("div");
    list.className = listLayout ? "slot-list" : "slot-grid";
    slots.forEach((slotResult, slotIndex) => {
      list.appendChild(renderSlotRow({
        slotResult, slotIndex, slotLabel, slotMain, lockedDetail, onClick, renderOccupiedContent,
      }));
    });
    section.appendChild(list);

    return section;
  }

  // Items get a dedicated grouped layout instead of one long list, to cut
  // down on vertical space: a top row of two columns (3 Hand slots on the
  // left, Head/Chest/Feet on the right) plus a bottom row of the 4 Small
  // slots — grouped from ITEM_SLOT_TYPES rather than hardcoded indices, so it
  // stays correct if the slot layout ever changes.
  function buildItemSlotSection({ title, resolved, slotLabel, onClick, onPouchClick, previewStats }) {
    const { slots, pouch } = resolved;

    const section = document.createElement("section");
    section.className = "summary-card";
    section.appendChild(buildSlotSectionHeader(title, pouch.length, onPouchClick));

    const renderOne = (slotIndex) => renderSlotRow({
      slotResult: slots[slotIndex],
      slotIndex,
      slotLabel,
      renderOccupiedContent: (entry) => buildItemElement(
        entry.item,
        entry.item.Card ? state.data.ActionCards[entry.item.Card] : null,
        previewStats
      ),
      onClick,
    });

    const handIndexes = [];
    const armorIndexes = [];
    const smallIndexes = [];
    ITEM_SLOT_TYPES.forEach((type, slotIndex) => {
      if (type === "Hand") {
        handIndexes.push(slotIndex);
      } else if (type === "Small") {
        smallIndexes.push(slotIndex);
      } else {
        armorIndexes.push(slotIndex);
      }
    });

    const columns = document.createElement("div");
    columns.className = "item-slot-columns";

    const handColumn = document.createElement("div");
    handColumn.className = "item-slot-column";
    handIndexes.forEach((slotIndex) => handColumn.appendChild(renderOne(slotIndex)));
    columns.appendChild(handColumn);

    const armorColumn = document.createElement("div");
    armorColumn.className = "item-slot-column";
    armorIndexes.forEach((slotIndex) => armorColumn.appendChild(renderOne(slotIndex)));
    columns.appendChild(armorColumn);

    section.appendChild(columns);

    const smallRow = document.createElement("div");
    smallRow.className = "item-slot-small-row";
    smallIndexes.forEach((slotIndex) => smallRow.appendChild(renderOne(slotIndex)));
    section.appendChild(smallRow);

    return section;
  }

  function renderTrees(levelMeta) {
    const container = ui.treesPanel;
    container.replaceChildren();
    if (!state.selectedProf) {
      container.appendChild(
        createEmptyState(
          "No profession selected yet. Choose a profession to reveal its primary tree and any extra advancement trees."
        )
      );
      return;
    }

    const treeNames = getAccessibleAdvancementTreeNames(state);
    if (!treeNames.length) {
      container.appendChild(
        createEmptyState("This profession does not expose any advancement trees.")
      );
      return;
    }

    const selectedByTree = buildSelectedByTree(state);
    const actionCardPreviewStats = buildActionCardPreviewStats(state, collectCharacterStats(state));
    treeNames.forEach((treeName, index) => {
      const tree = state.trees.get(treeName);
      if (!tree) {
        return;
      }

      const card = document.createElement("article");
      card.className = "tree-card";

      const titleRow = document.createElement("div");
      titleRow.className = "tree-title-row";

      const title = document.createElement("h3");
      title.textContent = treeName;
      titleRow.appendChild(title);

      const type = document.createElement("div");
      type.className = "tree-type";
      type.textContent = index === 0 ? "Primary tree" : "Additional tree";
      titleRow.appendChild(type);

      card.appendChild(titleRow);

      const picked = selectedByTree[treeName] || {};
      const taken = new Set(Object.keys(picked).map((value) => Number(value)));
      const allLevels = Object.keys(tree.Levels)
        .map((value) => Number(value))
        .sort((a, b) => a - b);

      const available = new Set();
      const simulatedTaken = new Set();
      allLevels.forEach((level) => {
        if (taken.has(level)) {
          simulatedTaken.add(level);
        } else if (isAdvancementLevelUnlocked(level, simulatedTaken, 1)) {
          available.add(level);
        }
      });

      allLevels.forEach((level) => {
        const levelBlock = document.createElement("section");
        levelBlock.className = "tree-level";

        if (picked[level] !== undefined) {
          levelBlock.classList.add("selected");
        } else if (available.has(level)) {
          levelBlock.classList.add("available");
        } else {
          levelBlock.classList.add("unavailable");
        }

        const header = document.createElement("div");
        header.className = "tree-level-header";
        const name = document.createElement("span");
        name.textContent = "Level " + level;
        header.appendChild(name);

        const badge = document.createElement("span");
        badge.textContent =
          picked[level] !== undefined
            ? "Selected"
            : available.has(level)
              ? "Available"
              : "Locked";
        header.appendChild(badge);
        levelBlock.appendChild(header);

        const versionList = document.createElement("div");
        versionList.className = "tree-version-list";

        tree.Levels[String(level)].forEach((entry, versionIndex) => {
          const versionLine = document.createElement("div");
          versionLine.className = "tree-version";

          if (picked[level] === versionIndex) {
            versionLine.classList.add("selected");
          }

          renderEntryToElement(versionLine, entry, state.data, actionCardPreviewStats);
          versionList.appendChild(versionLine);
        });

        levelBlock.appendChild(versionList);
        card.appendChild(levelBlock);
      });

      container.appendChild(card);
    });
  }

  return { renderControls, renderSummary, renderTrees };
}
