import { PROB_DICE, PROB_EN_DIFFICULTIES, computeSuccessDist, probAtLeast, bandProb, pct, computeAppliedModifiers } from "./probability.js";

export function createCharacterBuilder({ data, ui, onStateChange = () => {} }) {
  const LEVEL_UP_SLOTS = 12;
  const ATTRIBUTES = ["STR", "AGI", "INT", "CHA"];
  const DICE_PROGRESSION = ["D4", "D6", "D8", "D10", "D12", "D12+D4", "D20", "D20+D6"];

  const state = {
    data,
    trees: new Map(data["Advancement Trees"].map((tree) => [tree.Name, tree])),
    selectedRace: null,
    selectedAttributeSet: null,
    selectedFreeSkill: null,
    selectedOrigin: null,
    selectedProf: null,
    selectedPath: null,
    levelUps: createEmptyLevelUps(),
  };

  let cardWidthObserver = null;

  function render() {
    const levelMeta = refreshLevelUpStates();
    renderControls(levelMeta);
    renderSummary();
    renderTrees(levelMeta);
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
    const freeSkills = getRaceFreeSkills(race);
    state.selectedFreeSkill = freeSkills.length ? pick(freeSkills) : null;

    state.selectedOrigin = pick(state.data.Origins);

    const prof = pick(state.data.Professions);
    state.selectedProf = prof;
    const paths = prof.Paths;
    state.selectedPath = paths.length ? pick(paths) : null;

    commitSelection();
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
      if (state.selectedRace && compact.fi != null) {
        state.selectedFreeSkill = getRaceFreeSkills(state.selectedRace)[compact.fi] || null;
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

  function isBuildEmpty() {
    return (
      !state.selectedRace &&
      !state.selectedOrigin &&
      !state.selectedProf &&
      !state.selectedPath &&
      getFilledLevelCount() === 0
    );
  }

  function commitSelection() {
    tryAutoSelect();
    onStateChange(serializeState());
    render();
  }

  function serializeState() {
    const attrIndex = state.selectedRace && state.selectedAttributeSet
      ? state.selectedRace.Attributes.indexOf(state.selectedAttributeSet)
      : null;
    const freeSkillIndex = state.selectedRace && state.selectedFreeSkill
      ? getRaceFreeSkills(state.selectedRace).indexOf(state.selectedFreeSkill)
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
      fi: freeSkillIndex !== null && freeSkillIndex !== -1 ? freeSkillIndex : null,
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

  function resetSelectionState() {
    state.selectedRace = null;
    state.selectedAttributeSet = null;
    state.selectedFreeSkill = null;
    state.selectedOrigin = null;
    state.selectedProf = null;
    state.selectedPath = null;
    state.levelUps = createEmptyLevelUps();
  }

  function createEmptyLevelUps() {
    return Array.from({ length: LEVEL_UP_SLOTS }, () => ({ treeName: null, level: null, versionIndex: null }));
  }

  function getRaceFreeSkills(race = state.selectedRace) {
    return Array.isArray(race?.FreeSkills) ? race.FreeSkills : [];
  }

  function getFilledLevelCount() {
    return state.levelUps.reduce((count, slotState) => {
      return count + (slotState.treeName !== null && slotState.versionIndex !== null ? 1 : 0);
    }, 0);
  }

  function selectRace(race) {
    const raceChanged = state.selectedRace !== race;
    state.selectedRace = race;

    if (raceChanged) {
      state.selectedAttributeSet = null;
      state.selectedFreeSkill = null;
      const attrOptions = race.Attributes;
      if (attrOptions.length === 1) {
        state.selectedAttributeSet = attrOptions[0];
      }
    }

    commitSelection();
  }

  function selectAttributeSet(attr) {
    state.selectedAttributeSet = attr;
    commitSelection();
  }

  function selectFreeSkill(skill) {
    state.selectedFreeSkill = skill;
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

  function getSelectedAdvancementEntries(levelUps = state.levelUps) {
    const entries = [];

    levelUps.forEach((slotState) => {
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

  function collectCharacterStats(selection = state) {
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

    if (selection.selectedRace) {
      applyRace(stats, selection.selectedRace, selection.selectedAttributeSet);
    }
    if (selection.selectedFreeSkill) {
      incrementCountMap(stats.skillCounts, [selection.selectedFreeSkill]);
    }

    if (selection.selectedOrigin) {
      incrementCountMap(stats.keywordCounts, selection.selectedOrigin.Keywords || []);
      (selection.selectedOrigin.Items || []).forEach((item) => addItem(stats, item));
      stats.brill += selection.selectedOrigin.Brill || 0;
    }

    if (selection.selectedProf) {
      incrementCountMap(stats.keywordCounts, selection.selectedProf.Keywords || []);
    }

    if (selection.selectedPath) {
      applyEntry(stats, selection.selectedPath);
    }

    getSelectedAdvancementEntries(selection.levelUps).forEach((entry) => {
      applyEntry(stats, entry);
      incrementCountMap(stats.skillCounts, entry.Skills || []);
    });
    return stats;
  }

  function buildActionCardPreviewStats(stats) {
    const keywordCounts = new Map(stats.keywordCounts);
    for (const itemObj of stats.items.values()) {
      incrementCountMap(keywordCounts, itemObj.Keywords || []);
    }
    for (const [skill, count] of stats.skillCounts) {
      keywordCounts.set(skill, (keywordCounts.get(skill) || 0) + count);
    }
    return {
      attributes: { ...stats.attributes },
      keywordCounts,
    };
  }

  function createSelectionPreview(overrides = {}) {
    return {
      selectedRace: overrides.selectedRace !== undefined ? overrides.selectedRace : state.selectedRace,
      selectedAttributeSet: overrides.selectedAttributeSet !== undefined ? overrides.selectedAttributeSet : state.selectedAttributeSet,
      selectedFreeSkill: overrides.selectedFreeSkill !== undefined ? overrides.selectedFreeSkill : state.selectedFreeSkill,
      selectedOrigin: overrides.selectedOrigin !== undefined ? overrides.selectedOrigin : state.selectedOrigin,
      selectedProf: overrides.selectedProf !== undefined ? overrides.selectedProf : state.selectedProf,
      selectedPath: overrides.selectedPath !== undefined ? overrides.selectedPath : state.selectedPath,
      levelUps: overrides.levelUps !== undefined ? overrides.levelUps : state.levelUps,
    };
  }

  function buildPreviewStatsForSelection(overrides = {}) {
    return buildActionCardPreviewStats(collectCharacterStats(createSelectionPreview(overrides)));
  }

  function buildLevelUpPreview(slotIndex, slotPatch) {
    return state.levelUps.map((slot, index) => (
      index === slotIndex ? { ...slot, ...slotPatch } : { ...slot }
    ));
  }

  function buildActionCardPreviews(cardIds, previewStats = null) {
    return (cardIds || [])
      .map((cardId) => {
        const card = state.data["Action Cards"][cardId];
        if (!card) {
          return null;
        }
        return previewStats
          ? { cardId, card, previewStats }
          : { cardId, card };
      })
      .filter(Boolean);
  }

  function buildItemPreviews(itemNames) {
    return (itemNames || [])
      .map((itemName) => state.data.Items[itemName] || null)
      .filter(Boolean);
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

  function addItem(stats, itemName) {
    const itemObj = state.data.Items[itemName];
    if (!itemObj) {
      console.warn('Item not found:', itemName);
      return;
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

  function incrementCountMap(map, values) {
    values.forEach((value) => {
      map.set(value, (map.get(value) || 0) + 1);
    });
  }

  function upgradeDivDie(divDie) {
    const currentIndex = DICE_PROGRESSION.indexOf(divDie);
    if (currentIndex === -1 || currentIndex === DICE_PROGRESSION.length - 1) {
      return divDie;
    }
    return DICE_PROGRESSION[currentIndex + 1];
  }

  function renderControls(levelMeta) {
    const container = ui.controlsPanel;
    container.replaceChildren();

    const attrOptions = state.selectedRace ? state.selectedRace.Attributes : [];
    const freeSkillOptions = getRaceFreeSkills();
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
      onClick: () => openSelector({
        title: "Choose Race",
        options: state.data.Races,
        getOptionContent: describeRaceOption,
        onSelect: selectRace,
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
        onClick: () => openSelector({
          title: "Choose Attributes",
          options: attrOptions,
          getOptionContent: describeAttributeOption,
          onSelect: selectAttributeSet,
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
        onClick: () => openSelector({
          title: "Choose Skill",
          options: freeSkillOptions,
          getOptionContent: describeFreeSkillOption,
          onSelect: selectFreeSkill,
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
        ? (parent) => appendDisplayParts(parent, buildEntryParts(state.selectedOrigin))
        : null,
      complete: Boolean(state.selectedOrigin),
      onClick: () => openSelector({
        title: "Choose Origin",
        options: state.data.Origins,
        getOptionContent: (option) =>
          describeEntryOption(option, buildPreviewStatsForSelection({ selectedOrigin: option })),
        onSelect: selectOrigin,
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
        ? (parent) => appendDisplayParts(parent, buildEntryParts(state.selectedProf))
        : null,
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
          ? ""
          : pathOptions.length + " available options",
      renderDetail: state.selectedPath
        ? (parent) => appendDisplayParts(parent, buildEntryParts(state.selectedPath))
        : null,
      complete: Boolean(state.selectedPath),
      empty: !state.selectedPath,
      disabled: !state.selectedProf || pathOptions.length === 0,
      onClick: () => openSelector({
        title: "Choose Path",
        options: pathOptions,
        getOptionContent: (option) =>
          describeEntryOption(option, buildPreviewStatsForSelection({ selectedPath: option })),
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
          main: slotMeta.selectedVersion ? "" : "Choose reward",
          renderMain: slotMeta.selectedVersion
            ? (parent) => appendDisplayParts(parent, buildEntryParts(slotMeta.selectedVersion.entry))
            : null,
          detail: !slotMeta.selectedTree
            ? "Choose a tree level first."
            : slotMeta.versionOptions.length + " available reward" + (slotMeta.versionOptions.length === 1 ? "" : "s"),
          disabled: !slotMeta.selectedTree || slotMeta.versionOptions.length === 0,
          accent: slotMeta.selectedVersion !== null,
          empty: slotMeta.selectedVersion === null,
          onClick: () =>
            openSelector({
              kicker: "Level Up " + slotMeta.slotNumber,
              title: "Choose Reward",
              description: "Pick the reward version for this tree level.",
              options: slotMeta.versionOptions,
              getOptionContent: (option) => describeVersionOption(option, slotMeta.slotIndex),
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

    if (isBuildEmpty()) {
      container.appendChild(
        createEmptyState(
          "Start by choosing a race, origin, and profession. Your attributes, items, keywords, and actions will appear here as the build comes together."
        )
      );
      return;
    }

    const stats = collectCharacterStats();
    const actionCardPreviewStats = buildActionCardPreviewStats(stats);
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

    if (stats.keywordCounts.size) {
      container.appendChild(createListSection("Keywords", [{
        render: (parent) => appendCountSummary(parent, stats.keywordCounts, "keyword"),
      }]));
    }

    if (stats.skillCounts.size) {
      container.appendChild(createListSection("Skills (max 3)", [{
        render: (parent) => appendCountSummary(parent, stats.skillCounts, "skill"),
      }]));
    }

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
          .sort((a, b) => getItemDisplayName(a).localeCompare(getItemDisplayName(b)))
          .forEach((item) => {
            const itemLi = document.createElement("li");
            itemLi.className = "action-list-item";
            itemLi.appendChild(buildItemElement(item));

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
        cardsByCategory[category].push({ cardId: card._cardId, card });
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

          cards.forEach(({ cardId, card }) => {
            const li = document.createElement("li");
            li.className = "action-list-item";
            li.appendChild(
              buildActionCardElement(
                cardId,
                card,
                actionCardPreviewStats.attributes,
                actionCardPreviewStats.keywordCounts
              )
            );
            actionList.appendChild(li);
          });

          categoryGroup.appendChild(actionList);
          actionSection.appendChild(categoryGroup);
        }
      });

      container.appendChild(actionSection);

      if (!cardWidthObserver) {
        const syncCardWidth = () => {
          const firstCard = ui.summaryPanel.querySelector('.action-card-full');
          if (firstCard) {
            document.documentElement.style.setProperty('--action-card-width', firstCard.offsetWidth + 'px');
          }
        };
        requestAnimationFrame(syncCardWidth);
        cardWidthObserver = new ResizeObserver(syncCardWidth);
        cardWidthObserver.observe(ui.summaryPanel);
      }
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
    const actionCardPreviewStats = buildActionCardPreviewStats(collectCharacterStats());
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

          renderEntryToElement(versionLine, entry, actionCardPreviewStats);
          versionList.appendChild(versionLine);
        });

        levelBlock.appendChild(versionList);
        card.appendChild(levelBlock);
      });

      container.appendChild(card);
    });
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

  function singleChoiceGrid(config) {
    const grid = document.createElement("div");
    grid.className = "choice-grid";
    grid.appendChild(
      createChoiceButton({
        label: config.label,
        main: config.main,
        detail: config.detail,
        renderMain: config.renderMain,
        renderDetail: config.renderDetail,
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
    grid.className = "choice-grid " + (config.className || "two-up");
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
    if (typeof config.renderMain === "function") {
      config.renderMain(main);
    } else {
      main.textContent = config.main || "";
    }
    button.appendChild(main);

    const detail = document.createElement("span");
    detail.className = "choice-detail";
    if (typeof config.renderDetail === "function") {
      config.renderDetail(detail);
    } else {
      detail.textContent = config.detail || "";
    }
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
      if (item && typeof item.render === "function") {
        item.render(li);
      } else {
        li.textContent = item;
      }
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

  function buildActionCardElement(cardId, card, attrs = null, keywordCounts = null) {
    const wrapper = document.createElement("div");
    wrapper.className = "action-card-full";

    const idBox = document.createElement("div");
    idBox.className = "action-card-id " + (card.Type === "Reaction" ? "is-reaction" : "is-action");
    idBox.textContent = cardId;
    wrapper.appendChild(idBox);

    const body = document.createElement("div");
    body.className = "action-card-body";

    const nameEl = document.createElement("div");
    nameEl.className = "action-card-name";
    nameEl.textContent = card.DisplayName || card.Name;
    body.appendChild(nameEl);

    const metaParts = [
      ...(card.Keywords || []).map((keyword) => buildTokenPart(keyword, "keyword")),
    ];
    if (card.Condition) metaParts.push({ text: card.Condition });
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
        const sortedNum = sortedKeys.map(Number);
        const rollMode = normalizeRollMode(card.Roll.Mode);
        const rollATTList = getRollAttributeList(card.Roll);
        const attDice = attrs
          ? getRollAttributeDice(attrs, rollATTList, rollMode)
          : 0;
        const baseDice = attDice > 0 ? attDice : PROB_DICE;
        const appliedMods = (keywordCounts && card.Roll.Modifiers)
          ? computeAppliedModifiers(card.Roll.Modifiers, keywordCounts)
          : [];
        const modDiceTotal = appliedMods.reduce((sum, m) => sum + m.totalDice, 0);
        const effectiveDice = Math.max(0, baseDice + modDiceTotal);
        let appendProbLabel;
        if (card.Roll.Difficulty != null) {
          const dist = computeSuccessDist(effectiveDice, card.Roll.Difficulty);
          appendProbLabel = (parent, i) => {
            parent.appendChild(document.createTextNode("(" + pct(bandProb(dist, sortedNum, i)) + ")"));
          };
        } else {
          const dists = PROB_EN_DIFFICULTIES.map(d => computeSuccessDist(effectiveDice, d));
          appendProbLabel = (parent, i) => {
            parent.appendChild(document.createTextNode("("));
            PROB_EN_DIFFICULTIES.forEach((d, di) => {
              if (di > 0) {
                parent.appendChild(document.createTextNode(" "));
              }
              appendDifficultyIcon(parent, d);
              parent.appendChild(document.createTextNode(":" + pct(bandProb(dists[di], sortedNum, i))));
            });
            parent.appendChild(document.createTextNode(")"));
          };
        }
        for (let i = 0; i < sortedKeys.length; i++) {
          const key = sortedKeys[i];
          const outEl = document.createElement("div");
          outEl.className = "action-card-outcome";
          outEl.appendChild(document.createTextNode(key + ": "));
          appendIconTextContent(outEl, card.Roll.Successes[key]);
          outEl.appendChild(document.createTextNode(" "));

          const probWrap = document.createElement("span");
          probWrap.className = "action-card-prob";
          appendProbLabel(probWrap, i);

          const tooltip = document.createElement("div");
          tooltip.className = "action-card-prob-tooltip";
          const totalLine = document.createElement("div");
          totalLine.className = "action-card-prob-tooltip-total";
          totalLine.textContent = "Rolling " + effectiveDice + " dice";
          tooltip.appendChild(totalLine);
          if (attrs) {
            if (rollMode === "Sum") {
              rollATTList.forEach(att => {
                const line = document.createElement("div");
                line.textContent = att + ": " + (attrs[att] || 0);
                tooltip.appendChild(line);
              });
            } else {
              const usedAtt = getRollAttributeSelection(attrs, rollATTList, rollMode);
              if (usedAtt) {
                const line = document.createElement("div");
                line.textContent = usedAtt.attribute + ": " + usedAtt.value;
                tooltip.appendChild(line);
              }
            }
          }
          for (const m of appliedMods) {
            const sign = m.totalDice > 0 ? "+" : "";
            const dieWord = Math.abs(m.totalDice) === 1 ? "die" : "dice";
            const countLabel = m.count > 1 ? " ×" + m.count : "";
            const line = document.createElement("div");
            line.textContent = m.trigger + countLabel + ": " + sign + m.totalDice + " " + dieWord;
            tooltip.appendChild(line);
          }
          probWrap.appendChild(tooltip);
          outEl.appendChild(probWrap);
          body.appendChild(outEl);
        }
      }
    }

    if (card.Front) {
      const frontEl = document.createElement("div");
      frontEl.className = "action-card-desc";
      appendIconTextContent(frontEl, card.Front);
      body.appendChild(frontEl);
    }

    if (card.Back) {
      body.appendChild(buildFoldedEffectText(card.Back, "action-card-back"));
    }

    wrapper.appendChild(body);
    return wrapper;
  }

  function createActionCardMention(cardId, card, previewStats = null) {
    const span = document.createElement("span");
    span.className = "action-card-mention";
    span.textContent = getActionCardDisplayName(card);

    const tooltipEl = document.createElement("div");
    tooltipEl.className = "action-card-mention-tooltip";
    tooltipEl.appendChild(
      buildActionCardElement(
        cardId,
        card,
        previewStats ? previewStats.attributes : null,
        previewStats ? previewStats.keywordCounts : null
      )
    );
    span.appendChild(tooltipEl);

    return span;
  }

  function renderEntryToElement(element, entry, previewStats = null) {
    const parts = buildEntryParts(entry, {
      inlineItemDetails: true,
      includeActionCardMentions: true,
    });

    if (!parts.length) {
      return;
    }

    element.replaceChildren();
    appendDisplayParts(element, parts, previewStats);
  }

  function normalizeRollMode(mode) {
    return mode === "Sum" || mode === "Lowest" ? mode : "Highest";
  }

  function getRollAttributeList(roll) {
    return roll.ATT && roll.ATT.length > 0 ? roll.ATT : ATTRIBUTES;
  }

  function getRollAttributeDice(attrs, attList, mode) {
    if (mode === "Sum") {
      return attList.reduce((sum, att) => sum + (attrs[att] || 0), 0);
    }
    if (mode === "Lowest") {
      return attList.reduce((min, att) => Math.min(min, attrs[att] || 0), Number.POSITIVE_INFINITY);
    }
    return attList.reduce((max, att) => Math.max(max, attrs[att] || 0), 0);
  }

  function getRollAttributeSelection(attrs, attList, mode) {
    if (mode === "Sum") {
      return null;
    }
    const targetValue = getRollAttributeDice(attrs, attList, mode);
    const usedAtt = attList.find((att) => (attrs[att] || 0) === targetValue);
    return usedAtt
      ? { attribute: usedAtt, value: targetValue }
      : null;
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
    appendIconTextContent(rollLineEl, rollText);
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

  function buildItemDetailsElement(item) {
    const detailsEl = document.createElement("div");
    detailsEl.className = "item-details";

    const nameEl = document.createElement("div");
    nameEl.className = "item-name action-card-name";
    appendIconTextContent(nameEl, getItemDisplayName(item));
    detailsEl.appendChild(nameEl);

    if (item.Passive) {
      const passiveEl = document.createElement("div");
      passiveEl.className = "item-passive";
      appendIconTextContent(passiveEl, item.Passive);
      detailsEl.appendChild(passiveEl);
    }

    const keywords = item.Keywords || [];
    if (keywords.length) {
      const keywordsEl = document.createElement("div");
      keywordsEl.className = "item-keywords action-card-meta";
      appendDisplayParts(
        keywordsEl,
        keywords.map((keyword) => buildTokenPart(keyword, "keyword"))
      );
      detailsEl.appendChild(keywordsEl);
    }

    return detailsEl;
  }

  function buildItemElement(item) {
    const wrapper = document.createElement("div");
    wrapper.className = "item-preview";
    wrapper.appendChild(buildItemDetailsElement(item));
    wrapper.appendChild(buildFoldedEffectText(item.Effect || "None", "item-effect"));
    return wrapper;
  }

  function buildFoldedEffectText(text, className = "") {
    const effectEl = document.createElement("div");
    effectEl.className = "folded-effect-text" + (className ? " " + className : "");
    appendIconTextContent(effectEl, text);
    return effectEl;
  }

  function appendIconTextContent(parent, text) {
    const iconPattern = /\{([^}]+)\}/g;
    let lastIndex = 0;
    let match;
    while ((match = iconPattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parent.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }
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
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      parent.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
  }

  function appendDifficultyIcon(parent, difficulty) {
    const iconEl = document.createElement("img");
    iconEl.className = "action-card-inline-icon";
    iconEl.src = "icons/" + encodeURIComponent(String(difficulty)) + ".svg";
    iconEl.alt = "Difficulty " + difficulty;
    parent.appendChild(iconEl);
  }

  function appendDisplayParts(parent, parts, previewStats = null, separator = ", ") {
    parts.forEach((part, index) => {
      if (index > 0) {
        parent.appendChild(document.createTextNode(separator));
      }
      appendDisplayPart(parent, part, previewStats);
    });
  }

  function appendDisplayPart(parent, part, previewStats = null) {
    if (!part) {
      return;
    }

    if (typeof part.render === "function") {
      part.render(parent);
      return;
    }

    if (part.cardId !== undefined) {
      if (part.card) {
        parent.appendChild(createActionCardMention(part.cardId, part.card, previewStats));
      } else {
        parent.appendChild(document.createTextNode(part.cardId));
      }
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

  function appendCountSummary(parent, counts, kind) {
    const wrapper = document.createElement("span");
    const parts = Array.from(counts.keys())
      .sort((a, b) => a.localeCompare(b))
      .map((text) => ({
        text,
        kind,
        count: counts.get(text),
      }));
    appendDisplayParts(wrapper, parts);
    parent.appendChild(wrapper);
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

  function appendInlineItemDetails(parent, item) {
    parent.appendChild(document.createTextNode(getItemDisplayName(item)));

    const details = [];
    if (item.Passive) {
      details.push({ text: item.Passive });
    }
    (item.Keywords || []).forEach((keyword) => {
      details.push(buildTokenPart(keyword, "keyword"));
    });

    if (details.length) {
      parent.appendChild(document.createTextNode(" ("));
      appendDisplayParts(parent, details);
      parent.appendChild(document.createTextNode(")"));
    }
  }

  function buildRaceDetailParts(race) {
    const parts = [];
    (race.Keywords || []).forEach((keyword) => {
      parts.push(buildTokenPart(keyword, "keyword"));
    });
    parts.push({ text: "MOB: " + (race.MOB || 0) });
    parts.push({ text: "HP: " + (race.HP || 0) });
    parts.push({ text: "DIV: " + (race.DIV || "-") });
    return parts;
  }

  function buildEntryParts(
    entry,
    {
      excludeActionCards = false,
      excludeItems = false,
      inlineItemDetails = false,
      includeActionCardMentions = false,
    } = {}
  ) {
    const parts = [];

    (entry.Attributes || []).forEach((attributeSet) => {
      Object.entries(attributeSet).forEach(([key, value]) => {
        parts.push({ text: value + " " + key });
      });
    });

    if (entry.HP) {
      parts.push({ text: entry.HP + " HP" });
    }
    if (entry.MOB) {
      parts.push({ text: entry.MOB + " MOB" });
    }
    if (entry.Brill) {
      parts.push({ text: entry.Brill + " Brill" });
    }

    const divValue = entry.DIV;
    if (divValue === "Upgrade") {
      parts.push({ text: "DIV Upgrade" });
    } else if (divValue) {
      parts.push({ text: "DIV " + divValue });
    }

    (entry.Keywords || []).forEach((keyword) => {
      parts.push(buildTokenPart(keyword, "keyword"));
    });
    (entry.Skills || []).forEach((skill) => {
      parts.push(buildTokenPart(skill, "skill"));
    });

    if (!excludeItems) {
      (entry.Items || []).forEach((itemName) => {
        const itemObj = state.data.Items[itemName];
        if (itemObj) {
          parts.push(
            inlineItemDetails
              ? { render: (parent) => appendInlineItemDetails(parent, itemObj) }
              : { text: getItemDisplayName(itemObj) }
          );
        }
      });
    }

    if (!excludeActionCards) {
      (entry["Action cards"] || []).forEach((cardId) => {
        const card = state.data["Action Cards"][cardId];
        if (includeActionCardMentions) {
          parts.push({ cardId, card: card || null });
        } else {
          parts.push({ text: getActionCardDisplayName(card) });
        }
      });
    }

    return parts;
  }

  function describeRaceOption(race) {
    return {
      title: race.Name,
      renderDetail: (parent) => appendDisplayParts(parent, buildRaceDetailParts(race)),
    };
  }

  function describeAttributeOption(attributeSet) {
    return {
      title: formatAttributeSummary(attributeSet),
      detail: "Race attribute spread",
    };
  }

  function describeFreeSkillOption(skill) {
    return {
      title: skill,
      detail: "Free racial skill",
    };
  }

  function describeProfessionOption(profession) {
    const summaryParts = buildEntryParts(profession);
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
    return {
      title: profession.Name,
      renderDetail: (parent) => {
        let hasLine = false;
        if (summaryParts.length) {
          appendDisplayParts(parent, summaryParts);
          hasLine = true;
        }
        if (profession.Paths.length) {
          if (hasLine) {
            parent.appendChild(document.createElement("br"));
          }
          parent.appendChild(
            document.createTextNode("Paths: " + profession.Paths.map((path) => path.Name).join(", "))
          );
          hasLine = true;
        }
        if (accessibleTrees.length) {
          if (hasLine) {
            parent.appendChild(document.createElement("br"));
          }
          parent.appendChild(document.createTextNode("Trees: " + accessibleTrees.join(", ")));
        }
      },
    };
  }

  function describeEntryOption(entry, previewStats = null) {
    const items = buildItemPreviews(entry.Items || []);
    const actionCards = buildActionCardPreviews(entry["Action cards"] || [], previewStats);
    return {
      title: entry.Name,
      renderDetail: (parent) =>
        appendDisplayParts(parent, buildEntryParts(entry, { excludeActionCards: true, excludeItems: true })),
      items,
      actionCards,
    };
  }

  function describeTreeLevelOption(option) {
    const versionParts = option.versions
      .map((entry) => buildEntryParts(entry))
      .filter((parts) => parts.length);
    return {
      title: option.treeName + " - Level " + option.level,
      renderDetail: (parent) => {
        versionParts.forEach((parts, index) => {
          if (index > 0) {
            parent.appendChild(document.createElement("br"));
            parent.appendChild(document.createTextNode("OR"));
            parent.appendChild(document.createElement("br"));
          }
          appendDisplayParts(parent, parts);
        });
      },
    };
  }

  function describeVersionOption(option, slotIndex) {
    const actionCards = buildActionCardPreviews(
      option.entry["Action cards"] || [],
      buildPreviewStatsForSelection({
        levelUps: buildLevelUpPreview(slotIndex, { versionIndex: option.index }),
      })
    );
    return {
      renderTitle: (parent) => appendDisplayParts(parent, buildEntryParts(option.entry)),
      actionCards,
    };
  }

  function formatAttributeSummary(attributeSet) {
    return ATTRIBUTES.map((key) => key + " " + (attributeSet[key] || 0)).join(", ");
  }

  function getItemDisplayName(item) {
    return item.DisplayName || "";
  }

  function getActionCardDisplayName(card) {
    return card ? card.DisplayName || card.Name : "";
  }

  return {
    closeSelector,
    isBuildEmpty,
    randomBuild,
    render,
    resetBuild,
    restoreStateFromEncoded,
    serializeState,
  };
}
