export function createCharacterBuilder({ data, ui, onStateChange = () => {} }) {
  const LEVEL_UP_SLOTS = 12;
  const ATTRIBUTES = ["STR", "AGI", "INT", "CHA"];
  const DICE_PROGRESSION = ["D4", "D6", "D8", "D10", "D12", "D12+D4", "D20", "D20+D6"];

  const state = {
    data,
    trees: new Map(data["Advancement Trees"].map((tree) => [tree.Name, tree])),
    selectedRace: null,
    selectedAttributeSet: null,
    selectedOrigin: null,
    selectedProf: null,
    selectedPath: null,
    levelUps: createEmptyLevelUps(),
  };

  function createLevelUpState() {
    return {
      treeName: null,
      level: null,
      versionIndex: null,
    };
  }

  function createEmptyLevelUps() {
    return Array.from({ length: LEVEL_UP_SLOTS }, () => createLevelUpState());
  }

  function resetBuild() {
    resetSelectionState();
    closeSelector();
    commitSelection();
  }

  function randomBuild() {
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

    resetSelectionState();

    const race = pick(state.data.Races);
    state.selectedRace = race;
    const attrs = race.Attributes;
    state.selectedAttributeSet = attrs.length ? pick(attrs) : null;

    state.selectedOrigin = pick(state.data.Origins);

    const prof = pick(state.data.Professions);
    state.selectedProf = prof;
    const paths = prof.Paths;
    state.selectedPath = paths.length ? pick(paths) : null;

    commitSelection();
  }

  function serializeState() {
    const attrIndex = state.selectedRace && state.selectedAttributeSet
      ? state.selectedRace.Attributes.indexOf(state.selectedAttributeSet)
      : null;

    const lu = state.levelUps.map((slot) =>
      slot.treeName !== null && slot.level !== null && slot.versionIndex !== null
        ? [slot.treeName, slot.level, slot.versionIndex]
        : null
    );
    while (lu.length > 0 && lu[lu.length - 1] === null) {
      lu.pop();
    }

    const compact = {
      r: state.selectedRace ? state.selectedRace.Name : null,
      ai: attrIndex !== null && attrIndex !== -1 ? attrIndex : null,
      o: state.selectedOrigin ? state.selectedOrigin.Name : null,
      p: state.selectedProf ? state.selectedProf.Name : null,
      pa: state.selectedPath ? state.selectedPath.Name : null,
      lu: lu.length > 0 ? lu : null,
    };

    try {
      const json = JSON.stringify(compact);
      return btoa(encodeURIComponent(json).replace(/%([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))));
    } catch (_) {
      return null;
    }
  }

  function deserializeState(encoded) {
    try {
      const json = decodeURIComponent(
        atob(encoded).split("").map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("")
      );
      return JSON.parse(json);
    } catch (_) {
      return null;
    }
  }

  function notifyStateChange() {
    onStateChange(serializeState());
  }

  function resetSelectionState() {
    state.selectedRace = null;
    state.selectedAttributeSet = null;
    state.selectedOrigin = null;
    state.selectedProf = null;
    state.selectedPath = null;
    state.levelUps = createEmptyLevelUps();
  }

  function commitSelection() {
    tryAutoSelect();
    notifyStateChange();
    render();
  }

  function restoreStateFromEncoded(encoded) {
    const compact = deserializeState(encoded);
    if (!compact) {
      console.warn("Could not restore state from URL hash.");
      return false;
    }

    resetSelectionState();

    if (compact.r) {
      state.selectedRace = state.data.Races.find((race) => race.Name === compact.r) || null;
      if (state.selectedRace && compact.ai !== null) {
        state.selectedAttributeSet = state.selectedRace.Attributes[compact.ai] || null;
      }
    }

    if (compact.o) {
      state.selectedOrigin = state.data.Origins.find((origin) => origin.Name === compact.o) || null;
    }

    if (compact.p) {
      state.selectedProf = state.data.Professions.find((profession) => profession.Name === compact.p) || null;
      if (state.selectedProf && compact.pa) {
        state.selectedPath = state.selectedProf.Paths.find((path) => path.Name === compact.pa) || null;
      }
    }

    if (compact.lu) {
      compact.lu.forEach((entry, index) => {
        if (entry && index < LEVEL_UP_SLOTS) {
          state.levelUps[index] = {
            treeName: entry[0],
            level: entry[1],
            versionIndex: entry[2],
          };
        }
      });
    }

    commitSelection();
    return true;
  }

  function render() {
    const levelMeta = refreshLevelUpStates();
    renderControls(levelMeta);
    renderSummary();
    renderTrees(levelMeta);
  }

  function renderControls(levelMeta) {
    const container = ui.controlsPanel;
    container.replaceChildren();

    const attrOptions = state.selectedRace ? state.selectedRace.Attributes : [];
    const pathOptions = state.selectedProf ? state.selectedProf.Paths : [];

    container.appendChild(singleChoiceGrid({
      label: "Race",
      main: state.selectedRace ? state.selectedRace.Name : "Choose race",
      detail: state.selectedRace
        ? raceDetail(state.selectedRace)
        : state.data.Races.length + " available options",
      complete: Boolean(state.selectedRace),
      onClick: () => openSelector({
        title: "Choose Race",
        options: state.data.Races,
        getOptionContent: describeRaceOption,
        onSelect: selectRace,
        isSelected: (option) => state.selectedRace === option,
      }),
    }));

    container.appendChild(singleChoiceGrid({
      label: "Attributes",
      main: state.selectedAttributeSet ? formatAttributeSummary(state.selectedAttributeSet) : "Choose attributes",
      detail: !state.selectedRace
        ? "Pick a race first."
        : attrOptions.length + " available spread" + (attrOptions.length === 1 ? "" : "s"),
      complete: Boolean(state.selectedAttributeSet),
      empty: !state.selectedAttributeSet,
      disabled: !state.selectedRace || attrOptions.length <= 1,
      onClick: () => openSelector({
        title: "Choose Attributes",
        options: attrOptions,
        getOptionContent: describeAttributeOption,
        onSelect: selectAttr,
        isSelected: (option) => state.selectedAttributeSet === option,
      }),
    }));

    container.appendChild(singleChoiceGrid({
      label: "Origin",
      main: state.selectedOrigin ? state.selectedOrigin.Name : "Choose origin",
      detail: state.selectedOrigin
        ? summarizeEntry(state.selectedOrigin) || "No changes"
        : state.data.Origins.length + " available options",
      complete: Boolean(state.selectedOrigin),
      onClick: () => openSelector({
        title: "Choose Origin",
        options: state.data.Origins,
        getOptionContent: describeEntryOption,
        onSelect: selectOrigin,
        isSelected: (option) => state.selectedOrigin === option,
      }),
    }));

    container.appendChild(singleChoiceGrid({
      label: "Profession",
      main: state.selectedProf ? state.selectedProf.Name : "Choose profession",
      detail: state.selectedProf
        ? summarizeEntry(state.selectedProf) || "No changes"
        : state.data.Professions.length + " available options",
      complete: Boolean(state.selectedProf),
      onClick: () => openSelector({
        title: "Choose Profession",
        options: state.data.Professions,
        getOptionContent: describeProfessionOption,
        onSelect: selectProfession,
        isSelected: (option) => state.selectedProf === option,
      }),
    }));

    container.appendChild(singleChoiceGrid({
      label: "Path",
      main: state.selectedPath ? state.selectedPath.Name : "Choose path",
      detail: !state.selectedProf
        ? "Pick a profession first."
        : state.selectedPath
          ? summarizeEntry(state.selectedPath) || "No changes"
          : pathOptions.length + " available options",
      complete: Boolean(state.selectedPath),
      empty: !state.selectedPath,
      disabled: !state.selectedProf || pathOptions.length <= 1,
      onClick: () => openSelector({
        title: "Choose Path",
        options: pathOptions,
        getOptionContent: describeEntryOption,
        onSelect: selectPath,
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
            openSelector({
              kicker: "Level Up " + slotMeta.slotNumber,
              title: "Choose Level-Up Tree",
              description: "Select which tree level to spend this slot on.",
              options: slotMeta.treeOptions,
              getOptionContent: describeTreeLevelOption,
              onSelect: (option) => selectLevelUpTree(slotMeta.slotIndex, option),
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
          main: slotMeta.selectedVersion
            ? summarizeEntry(slotMeta.selectedVersion.entry) || "No changes"
            : "Choose reward",
          detail: !slotMeta.selectedTree
            ? "Choose a tree level first."
            : slotMeta.versionOptions.length + " available reward" + (slotMeta.versionOptions.length === 1 ? "" : "s"),
          disabled: !slotMeta.selectedTree || slotMeta.versionOptions.length <= 1,
          accent: slotMeta.selectedVersion !== null,
          empty: slotMeta.selectedVersion === null,
          onClick: () =>
            openSelector({
              kicker: "Level Up " + slotMeta.slotNumber,
              title: "Choose Reward",
              description: "Pick the reward version for this tree level.",
              options: slotMeta.versionOptions,
              getOptionContent: describeVersionOption,
              onSelect: (option) => selectLevelUpVersion(slotMeta.slotIndex, option),
              isSelected: (option) =>
                Boolean(slotMeta.selectedVersion && slotMeta.selectedVersion.index === option.index),
            }),
        },
      }));
    });
  }

  function renderSummary() {
    const container = ui.summaryPanel;
    container.replaceChildren();

    if (
      !state.selectedRace &&
      !state.selectedOrigin &&
      !state.selectedProf &&
      !state.selectedPath &&
      getFilledLevelCount() === 0
    ) {
      container.appendChild(
        createEmptyState(
          "Start by choosing a race, origin, and profession. Your attributes, items, keywords, and actions will appear here as the build comes together."
        )
      );
      return;
    }

    const stats = collectCharacterStats();

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

    const keywordSummary = formatKeywordSummary(stats.keywordCounts);
    if (keywordSummary) {
      container.appendChild(createListSection("Keywords", [keywordSummary]));
    }

    const skillSummary = formatKeywordSummary(stats.skillCounts);
    if (skillSummary) {
      container.appendChild(createListSection("Skills (max 3)", [skillSummary]));
    }

    // Create items section grouped by type, with Passive and Effect
    const items = Array.from(stats.items.values());
    if (items.length) {
      const itemsSection = document.createElement("section");
      itemsSection.className = "summary-card";

      const itemsTitle = document.createElement("h3");
      itemsTitle.textContent = "Items";
      itemsSection.appendChild(itemsTitle);

      const itemsByType = new Map();
      items.forEach((item) => {
        const type = item.Type;
        if (!itemsByType.has(type)) {
          itemsByType.set(type, []);
        }
        itemsByType.get(type).push(item);
      });

      const itemTypeOrder = ["Head", "Chest", "Hand", "Feet", "Small"];
      const sortedTypes = Array.from(itemsByType.keys()).sort((a, b) => {
        const indexA = itemTypeOrder.indexOf(a);
        const indexB = itemTypeOrder.indexOf(b);

        if (indexA !== -1 || indexB !== -1) {
          if (indexA === -1) return 1;
          if (indexB === -1) return -1;
          return indexA - indexB;
        }

        return a.localeCompare(b);
      });

      sortedTypes.forEach((type) => {
        const typeGroup = document.createElement("div");
        typeGroup.className = "action-category-group";

        const typeTitle = document.createElement("h4");
        typeTitle.className = "action-category-title";
        typeTitle.textContent = type;
        typeGroup.appendChild(typeTitle);

        const itemsList = document.createElement("ul");
        itemsList.className = "list-block";

        itemsByType
          .get(type)
          .sort((a, b) => a.DisplayName.localeCompare(b.DisplayName))
          .forEach((item) => {
            const itemLi = document.createElement("li");
            itemLi.className = "list-item";

            const nameDiv = document.createElement("div");
            nameDiv.className = "item-name";
            let itemText = item.DisplayName;
            if (item.Passive) {
              itemText += " (" + item.Passive + ")";
            }
            nameDiv.textContent = itemText;
            itemLi.appendChild(nameDiv);

            const effectDiv = document.createElement("div");
            effectDiv.className = "item-effect";
            effectDiv.textContent = item.Effect || "None";
            itemLi.appendChild(effectDiv);

            itemsList.appendChild(itemLi);
          });

        typeGroup.appendChild(itemsList);
        itemsSection.appendChild(typeGroup);
      });

      container.appendChild(itemsSection);
    }

    if (stats.actions.size) {
      const actionSection = document.createElement("section");
      actionSection.className = "summary-card";

      const actionTitle = document.createElement("h3");
      actionTitle.textContent = "Action Cards";
      actionSection.appendChild(actionTitle);

      if (stats.freeUpgrades > 0) {
        const upgradeChip = document.createElement("div");
        upgradeChip.className = "free-upgrades-chip";
        upgradeChip.textContent = stats.freeUpgrades + " free upgrade" + (stats.freeUpgrades > 1 ? "s" : "") + " available";
        actionSection.appendChild(upgradeChip);
      }

      const cardsByCategory = {
        Offensive: [],
        Defensive: [],
        Support: [],
      };

      Array.from(stats.actions.values()).forEach((card) => {
        const category = cardsByCategory[card.Category] ? card.Category : "Offensive";
        const cardType = card.Type === "Reaction" ? "Reaction" : "Action";
        const label = formatActionCardLabel(card._cardId, card);

        cardsByCategory[category].push({
          label,
          cardId: card._cardId,
          type: cardType,
        });
      });

      ["Offensive", "Defensive", "Support"].forEach((category) => {
        const cards = cardsByCategory[category];
        if (cards.length > 0) {
          const categoryGroup = document.createElement("div");
          categoryGroup.className = "action-category-group";

          const categoryTitle = document.createElement("h4");
          categoryTitle.className = "action-category-title";
          categoryTitle.textContent = category;
          categoryGroup.appendChild(categoryTitle);

          const actionList = document.createElement("ul");
          actionList.className = "action-list";

          cards.forEach((cardData) => {
            const li = document.createElement("li");
            li.className = "action-list-item";

            const row = document.createElement("div");
            row.className = "action-card-row";

            const idBox = document.createElement("div");
            idBox.className = "action-card-id";
            if (cardData.type === "Action") {
              idBox.classList.add("is-action");
            } else if (cardData.type === "Reaction") {
              idBox.classList.add("is-reaction");
            }
            idBox.textContent = cardData.cardId;
            row.appendChild(idBox);

            const labelBox = document.createElement("div");
            labelBox.className = "action-card-label";
            labelBox.textContent = cardData.label;
            row.appendChild(labelBox);

            li.appendChild(row);
            actionList.appendChild(li);
          });

          categoryGroup.appendChild(actionList);
          actionSection.appendChild(categoryGroup);
        }
      });

      container.appendChild(actionSection);
    }
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

    const treeNames = getAccessibleAdvancementTreeNames();
    if (!treeNames.length) {
      container.appendChild(
        createEmptyState("This profession does not expose any advancement trees.")
      );
      return;
    }

    const selectedByTree = buildSelectedByTree();
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

          versionLine.textContent = summarizeEntry(entry) || "No changes";
          versionList.appendChild(versionLine);
        });

        levelBlock.appendChild(versionList);
        card.appendChild(levelBlock);
      });

      container.appendChild(card);
    });
  }

  function singleChoiceGrid(config) {
    const grid = document.createElement("div");
    grid.className = "choice-grid";
    grid.appendChild(
      createChoiceButton({
        label: config.label,
        main: config.main,
        detail: config.detail,
        onClick: config.onClick,
        disabled: config.disabled,
        empty: config.empty,
        accent: config.complete,
      })
    );
    return grid;
  }

  function dualChoiceGrid(config) {
    const grid = document.createElement("div");
    grid.className = "choice-grid two-up";
    grid.appendChild(createChoiceButton(config.firstButton));
    grid.appendChild(createChoiceButton(config.secondButton));
    return grid;
  }

  function createChoiceButton(config) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-button";
    if (config.empty) {
      button.classList.add("is-empty");
    }
    if (config.accent) {
      button.classList.add("is-accent");
    }
    button.disabled = Boolean(config.disabled);

    if (!button.disabled && typeof config.onClick === "function") {
      button.addEventListener("click", config.onClick);
    }

    const label = document.createElement("span");
    label.className = "choice-label";
    label.textContent = config.label;
    button.appendChild(label);

    const main = document.createElement("span");
    main.className = "choice-main";
    main.textContent = config.main;
    button.appendChild(main);

    const detail = document.createElement("span");
    detail.className = "choice-detail";
    detail.textContent = config.detail || "";
    button.appendChild(detail);

    return button;
  }

  function createStatCard(label, value, limit) {
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

  function createListSection(title, items) {
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
      li.textContent = item;
      list.appendChild(li);
    });

    section.appendChild(list);
    return section;
  }

  function createEmptyState(text) {
    const box = document.createElement("div");
    box.className = "empty-state";
    box.textContent = text;
    return box;
  }

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
        title.textContent = content.title;
        button.appendChild(title);

        if (content.detail) {
          const detail = document.createElement("div");
          detail.className = "option-detail";
          detail.textContent = content.detail;
          button.appendChild(detail);
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

  function selectRace(race) {
    const raceChanged = state.selectedRace !== race;
    state.selectedRace = race;

    if (raceChanged) {
      state.selectedAttributeSet = null;
      const attrOptions = race.Attributes;
      if (attrOptions.length === 1) {
        state.selectedAttributeSet = attrOptions[0];
      }
    }

    commitSelection();
  }

  function selectAttr(attr) {
    state.selectedAttributeSet = attr;
    commitSelection();
  }

  function selectOrigin(origin) {
    state.selectedOrigin = origin;
    commitSelection();
  }

  function selectProfession(profession) {
    const professionChanged = state.selectedProf !== profession;
    state.selectedProf = profession;

    if (professionChanged) {
      state.selectedPath = null;
      const pathOptions = profession.Paths;
      if (pathOptions.length === 1) {
        state.selectedPath = pathOptions[0];
      }
      state.levelUps = createEmptyLevelUps();
    }

    commitSelection();
  }

  function selectPath(path) {
    state.selectedPath = path;
    commitSelection();
  }

  function selectLevelUpTree(slotIndex, treeLevelOption) {
    const slot = state.levelUps[slotIndex];
    slot.treeName = treeLevelOption.treeName;
    slot.level = treeLevelOption.level;
    slot.versionIndex = null;
    commitSelection();
  }

  function selectLevelUpVersion(slotIndex, versionOption) {
    state.levelUps[slotIndex].versionIndex = versionOption.index;
    commitSelection();
  }

  function tryAutoSelect() {
    const priorSelectedOptions = [];
    let unlocked = state.selectedProf !== null;

    for (let slotIndex = 0; slotIndex < LEVEL_UP_SLOTS; slotIndex += 1) {
      const slotState = state.levelUps[slotIndex];
      const treeOptions = unlocked
        ? getAvailableLevelUpOptions(slotIndex, priorSelectedOptions)
        : [];

      let selectedTree =
        treeOptions.find(
          (option) =>
            slotState.treeName === option.treeName && slotState.level === option.level
        ) || null;

      if (!selectedTree) {
        if (treeOptions.length === 1) {
          selectedTree = treeOptions[0];
          slotState.treeName = selectedTree.treeName;
          slotState.level = selectedTree.level;
        } else {
          slotState.treeName = null;
          slotState.level = null;
          slotState.versionIndex = null;
        }
      }

      let selectedVersion = null;

      if (selectedTree) {
        const versionOptions = getVersionOptions(selectedTree);
        if (versionOptions.length === 1) {
          slotState.versionIndex = 0;
        }

        selectedVersion =
          versionOptions.find((option) => option.index === slotState.versionIndex) || null;

        if (!selectedVersion && versionOptions.length !== 1) {
          slotState.versionIndex = null;
        }
      } else {
        slotState.versionIndex = null;
      }

      const isComplete = Boolean(selectedTree && selectedVersion);
      if (isComplete) {
        priorSelectedOptions.push(selectedTree);
      }

      unlocked = unlocked && isComplete;
    }
  }

  function refreshLevelUpStates() {
    const levelUpMeta = [];
    const priorSelectedOptions = [];
    let unlocked = state.selectedProf !== null;

    for (let slotIndex = 0; slotIndex < LEVEL_UP_SLOTS; slotIndex += 1) {
      const slotNumber = slotIndex + 1;
      const slotState = state.levelUps[slotIndex];
      const treeOptions = unlocked
        ? getAvailableLevelUpOptions(slotIndex, priorSelectedOptions)
        : [];

      const selectedTree =
        treeOptions.find(
          (option) =>
            slotState.treeName === option.treeName && slotState.level === option.level
        ) || null;

      const versionOptions = selectedTree ? getVersionOptions(selectedTree) : [];
      const selectedVersion = selectedTree
        ? versionOptions.find((option) => option.index === slotState.versionIndex) || null
        : null;
      const isComplete = Boolean(selectedTree && selectedVersion);

      if (isComplete) {
        priorSelectedOptions.push(selectedTree);
      }

      levelUpMeta.push({
        slotIndex,
        slotNumber,
        unlocked,
        treeOptions,
        selectedTree,
        versionOptions,
        selectedVersion,
        isComplete,
      });

      unlocked = unlocked && isComplete;
    }

    return levelUpMeta;
  }

  function getAvailableLevelUpOptions(slotIndex, priorSelectedOptions) {
    const slotNumber = slotIndex + 1;
    const treeNames = getAccessibleAdvancementTreeNames();
    const takenLevelsByTree = new Map();

    priorSelectedOptions.forEach((option) => {
      if (!takenLevelsByTree.has(option.treeName)) {
        takenLevelsByTree.set(option.treeName, new Set());
      }
      takenLevelsByTree.get(option.treeName).add(option.level);
    });

    const options = [];
    treeNames.forEach((treeName) => {
      const tree = state.trees.get(treeName);
      if (!tree) {
        return;
      }

      const takenLevels = takenLevelsByTree.get(treeName) || new Set();
      Object.keys(tree.Levels)
        .map((value) => Number(value))
        .sort((a, b) => a - b)
        .forEach((level) => {
          if (takenLevels.has(level)) {
            return;
          }

          if (isAdvancementLevelUnlocked(level, takenLevels, slotNumber)) {
            options.push({
              treeName,
              level,
              versions: tree.Levels[String(level)],
            });
          }
        });
    });

    return options;
  }

  function getAccessibleAdvancementTreeNames() {
    if (!state.selectedProf) {
      return [];
    }

    const treeNames = [];
    const primaryTreeName = resolvePrimaryTreeName(state.selectedProf.Name);

    if (state.trees.has(primaryTreeName)) {
      treeNames.push(primaryTreeName);
    }

    state.selectedProf["Advancement Trees"].forEach((treeName) => {
      if (state.trees.has(treeName) && !treeNames.includes(treeName)) {
        treeNames.push(treeName);
      }
    });

    return treeNames;
  }

  function resolvePrimaryTreeName(professionName) {
    if (state.trees.has(professionName)) {
      return professionName;
    }

    const normalizedProfession = normalizeName(professionName);
    let bestMatch = null;

    state.trees.forEach((_, treeName) => {
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

  function isAdvancementLevelUnlocked(level, takenLevels, slotNumber) {
    if (level === 1) {
      return true;
    }
    if (level === 2 || level === 3) {
      return takenLevels.has(1);
    }
    if (level === 4) {
      return takenLevels.has(3);
    }
    if (level === 5) {
      return takenLevels.has(3) && slotNumber > 4;
    }
    if (level === 6) {
      return takenLevels.has(5);
    }
    if (level === 7) {
      return takenLevels.has(5) && slotNumber > 6;
    }
    if (level === 8) {
      return takenLevels.has(7);
    }
    return false;
  }

  function getSelectedAdvancementEntries() {
    const entries = [];

    state.levelUps.forEach((slotState) => {
      if (
        slotState.treeName === null ||
        slotState.level === null ||
        slotState.versionIndex === null
      ) {
        return;
      }

      const option = getTreeLevelOption(slotState.treeName, slotState.level);
      if (!option) {
        return;
      }

      const versionOptions = getVersionOptions(option);
      if (
        slotState.versionIndex >= 0 &&
        slotState.versionIndex < versionOptions.length
      ) {
        entries.push(versionOptions[slotState.versionIndex].entry);
      }
    });

    return entries;
  }

  function getTreeLevelOption(treeName, level) {
    const tree = state.trees.get(treeName);
    if (!tree) {
      return null;
    }

    const versions = tree.Levels[String(level)];
    if (!versions) {
      return null;
    }

    return {
      treeName,
      level,
      versions,
    };
  }

  function getVersionOptions(treeLevelOption) {
    return treeLevelOption.versions.map((entry, index) => ({
      index,
      entry,
    }));
  }

  function collectCharacterStats() {
    const stats = {
      attributes: Object.fromEntries(ATTRIBUTES.map((attribute) => [attribute, 0])),
      mob: 0,
      hp: 0,
      divDie: null,
      brill: 0,
      keywordCounts: new Map(),
      skillCounts: new Map(),
      items: new Map(),
      actions: new Map(),
      freeUpgrades: 0,
    };

    if (state.selectedRace) {
      applyRace(stats, state.selectedRace, state.selectedAttributeSet);
    }

    if (state.selectedOrigin) {
      incrementCountMap(stats.keywordCounts, state.selectedOrigin.Keywords || []);
      (state.selectedOrigin.Items || []).forEach((item) => addItem(stats, item));
      stats.brill += state.selectedOrigin.Brill || 0;
    }

    if (state.selectedProf) {
      incrementCountMap(stats.keywordCounts, state.selectedProf.Keywords || []);
    }

    if (state.selectedPath) {
      applyEntry(stats, state.selectedPath);
    }

    getSelectedAdvancementEntries().forEach((entry) => {
      applyEntry(stats, entry);
      incrementCountMap(stats.skillCounts, entry.Skills || []);
    });
    return stats;
  }

  function incrementCountMap(map, values) {
    values.forEach((value) => {
      map.set(value, (map.get(value) || 0) + 1);
    });
  }

  function addItem(stats, itemName) {
    const itemObj = state.data.Items[itemName];
    if (!itemObj) {
      console.warn('Item not found:', itemName);
      return;
    }

    // Extract keywords from items and add to common keyword pool
    if (itemObj.Keywords) {
      incrementCountMap(stats.keywordCounts, itemObj.Keywords);
    }

    const key = itemName + "::" + itemObj.Type;
    if (!stats.items.has(key)) {
      stats.items.set(key, itemObj);
    }
  }

  function addAction(stats, cardId) {
    const card = state.data["Action Cards"][cardId];
    if (!card) {
      return;
    }
    const current = stats.actions.get(card.Name);
    if (!current) {
      stats.actions.set(card.Name, { ...card, _cardId: cardId });
    } else if (card.Level === current.Level) {
      stats.freeUpgrades += 1;
    } else if (card.Level > current.Level) {
      stats.actions.set(card.Name, { ...card, _cardId: cardId });
    }
  }

  function applyRace(stats, race, attributes) {
    if (attributes) {
      Object.keys(attributes).forEach((key) => {
        stats.attributes[key] += attributes[key];
      });
    }

    stats.mob = race.MOB || 0;
    stats.hp = race.HP || 0;
    stats.divDie = race.DIV || null;
    incrementCountMap(stats.keywordCounts, race.Keywords || []);
    incrementCountMap(stats.skillCounts, race.Skills || []);
    (race["Action cards"] || []).forEach((action) => addAction(stats, action));
  }

  function applyEntry(stats, entry) {
    (entry.Attributes || []).forEach((attributeSet) => {
      Object.keys(attributeSet).forEach((key) => {
        stats.attributes[key] += attributeSet[key];
      });
    });

    stats.mob += entry.MOB || 0;
    stats.hp += entry.HP || 0;
    stats.brill += entry.Brill || 0;
    incrementCountMap(stats.keywordCounts, entry.Keywords || []);

    const divValue = entry.DIV;
    if (divValue === "Upgrade") {
      stats.divDie = upgradeDivDie(stats.divDie);
    } else if (divValue) {
      stats.divDie = divValue;
    }

    (entry.Items || []).forEach((item) => addItem(stats, item));
    (entry["Action cards"] || []).forEach((action) => addAction(stats, action));
  }

  function upgradeDivDie(divDie) {
    const currentIndex = DICE_PROGRESSION.indexOf(divDie);
    if (currentIndex === -1 || currentIndex === DICE_PROGRESSION.length - 1) {
      return divDie;
    }
    return DICE_PROGRESSION[currentIndex + 1];
  }

  function buildSelectedByTree() {
    const selectedByTree = {};

    state.levelUps.forEach((slotState) => {
      if (
        slotState.treeName === null ||
        slotState.level === null ||
        slotState.versionIndex === null
      ) {
        return;
      }

      const option = getTreeLevelOption(slotState.treeName, slotState.level);
      if (!option) {
        return;
      }

      if (!selectedByTree[option.treeName]) {
        selectedByTree[option.treeName] = {};
      }
      selectedByTree[option.treeName][option.level] = slotState.versionIndex;
    });

    return selectedByTree;
  }

  function summarizeEntry(entry) {
    const parts = [];

    (entry.Attributes || []).forEach((attributeSet) => {
      Object.entries(attributeSet).forEach(([key, value]) => {
        parts.push(value + " " + key);
      });
    });

    if (entry.HP) {
      parts.push(entry.HP + " HP");
    }
    if (entry.MOB) {
      parts.push(entry.MOB + " MOB");
    }
    if (entry.Brill) {
      parts.push(entry.Brill + " Brill");
    }

    const divValue = entry.DIV;
    if (divValue === "Upgrade") {
      parts.push("DIV Upgrade");
    } else if (divValue) {
      parts.push("DIV " + divValue);
    }

    parts.push(...(entry.Keywords || []));
    parts.push(...(entry.Skills || []));

    (entry.Items || []).forEach((itemName) => {
      const itemObj = state.data.Items[itemName];
      if (itemObj) {
        parts.push(itemObj.DisplayName + " (" + itemObj.Type + ")");
      }
    });

    (entry["Action cards"] || []).forEach((action) => {
      parts.push(formatActionCardLabel(action));
    });

    return parts.join(", ");
  }

  function raceDetail(race) {
    const extras = [];
    const keywords = (race.Keywords || []).join(", ");
    if (keywords) {
      extras.push(keywords);
    }
    extras.push("MOB: " + (race.MOB || 0));
    extras.push("HP: " + (race.HP || 0));
    extras.push("DIV: " + (race.DIV || "-"));
    return extras.join(", ");
  }

  function formatAttributeSummary(attributeSet) {
    return ATTRIBUTES.map((key) => key + " " + (attributeSet[key] || 0)).join(", ");
  }

  function formatActionCardLabel(cardId, card) {
    if (!card) {
      card = state.data["Action Cards"][cardId];
    }
    if (!card) {
      return "";
    }
    const displayName = card.DisplayName || card.Name;
    const desc = card.CardDescription ? " (" + card.CardDescription + ")" : ' (????)';
    return displayName + desc;
  }

  function describeRaceOption(race) {
    return {
      title: race.Name,
      detail: raceDetail(race),
    };
  }

  function describeAttributeOption(attributeSet) {
    return {
      title: formatAttributeSummary(attributeSet),
      detail: "Race attribute spread",
    };
  }

  function describeEntryOption(entry) {
    return {
      title: entry.Name,
      detail: summarizeEntry(entry) || "No changes",
    };
  }

  function describeProfessionOption(profession) {
    const details = [];
    const summary = summarizeEntry(profession);
    if (summary) {
      details.push(summary);
    }
    if (profession.Paths.length) {
      details.push("Paths: " + profession.Paths.map((path) => path.Name).join(", "));
    }
    const accessibleTrees = [];
    const primaryTree = resolvePrimaryTreeName(profession.Name);
    if (state.trees.has(primaryTree)) {
      accessibleTrees.push(primaryTree);
    }
    profession["Advancement Trees"].forEach((treeName) => {
      if (!accessibleTrees.includes(treeName)) {
        accessibleTrees.push(treeName);
      }
    });
    if (accessibleTrees.length) {
      details.push("Trees: " + accessibleTrees.join(", "));
    }
    return {
      title: profession.Name,
      detail: details.join("\n"),
    };
  }

  function describeTreeLevelOption(option) {
    return {
      title: option.treeName + " - Level " + option.level,
      detail: option.versions
        .map((entry) => summarizeEntry(entry) || "No changes")
        .join("\nOR\n"),
    };
  }

  function describeVersionOption(option) {
    return {
      title: summarizeEntry(option.entry) || "No changes",
      detail: "",
    };
  }

  function formatKeywordSummary(keywordCounts) {
    if (!keywordCounts.size) {
      return "";
    }

    return Array.from(keywordCounts.keys())
      .sort((a, b) => a.localeCompare(b))
      .map((keyword) => {
        const count = keywordCounts.get(keyword);
        return count > 1 ? keyword + " x" + count : keyword;
      })
      .join(", ");
  }

  function getFilledLevelCount() {
    return state.levelUps.reduce((count, slotState) => {
      return count + (slotState.treeName !== null && slotState.versionIndex !== null ? 1 : 0);
    }, 0);
  }

  return {
    closeSelector,
    randomBuild,
    render,
    resetBuild,
    restoreStateFromEncoded,
    serializeState,
  };
}
