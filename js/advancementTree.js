import { LEVEL_UP_SLOTS } from "./constants.js";
import { resolvePrimaryTreeName } from "./dataUtils.js";

// Shared walk over the level-up slots. Both callers below need to recompute the
// same tree/version option chain per slot; `autoSelect` picks whether the walk
// also fills in slots that have exactly one possible option (a `dry run` vs. a
// mutating pass), so the two behaviors can't silently drift apart.
function walkLevelUpSlots(state, { autoSelect }) {
  const levelUpMeta = [];
  const priorSelectedOptions = [];
  let unlocked = state.selectedProf !== null;

  for (let slotIndex = 0; slotIndex < LEVEL_UP_SLOTS; slotIndex += 1) {
    const slotNumber = slotIndex + 1;
    const slotState = state.levelUps[slotIndex];
    const treeOptions = unlocked
      ? getAvailableLevelUpOptions(state, slotIndex, priorSelectedOptions)
      : [];

    let selectedTree =
      treeOptions.find(
        (option) =>
          slotState.treeName === option.treeName && slotState.level === option.level
      ) || null;

    if (!selectedTree && autoSelect) {
      if (treeOptions.length === 1) {
        selectedTree = treeOptions[0];
        slotState.treeName = selectedTree.treeName;
        slotState.level = selectedTree.level;
        slotState.basicUpgradeFamily = null;
      } else {
        slotState.treeName = null;
        slotState.level = null;
        slotState.versionIndex = null;
        slotState.basicUpgradeFamily = null;
      }
    }

    const versionOptions = selectedTree ? getVersionOptions(selectedTree) : [];

    if (autoSelect && selectedTree && versionOptions.length === 1) {
      slotState.versionIndex = 0;
    }

    const selectedVersion = selectedTree
      ? versionOptions.find((option) => option.index === slotState.versionIndex) || null
      : null;

    if (autoSelect) {
      if (selectedTree && !selectedVersion && versionOptions.length !== 1) {
        slotState.versionIndex = null;
        slotState.basicUpgradeFamily = null;
      } else if (!selectedTree) {
        slotState.versionIndex = null;
        slotState.basicUpgradeFamily = null;
      }
    }

    const isComplete = Boolean(selectedTree && selectedVersion);
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

    if (isComplete) {
      priorSelectedOptions.push(selectedTree);
    }

    unlocked = unlocked && isComplete;
  }

  return levelUpMeta;
}

export function tryAutoSelect(state) {
  walkLevelUpSlots(state, { autoSelect: true });
}

export function refreshLevelUpStates(state) {
  return walkLevelUpSlots(state, { autoSelect: false });
}

export function getAvailableLevelUpOptions(state, slotIndex, priorSelectedOptions) {
  const slotNumber = slotIndex + 1;
  const treeNames = getAccessibleAdvancementTreeNames(state);
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

export function getSelectedAdvancementEntries(state, levelUps = state.levelUps) {
  const entries = [];

  levelUps.forEach((slotState, slotIndex) => {
    if (
      slotState.treeName === null ||
      slotState.level === null ||
      slotState.versionIndex === null
    ) {
      return;
    }

    const option = getTreeLevelOption(state, slotState.treeName, slotState.level);
    if (!option) {
      return;
    }

    const versionOptions = getVersionOptions(option);
    if (
      slotState.versionIndex >= 0 &&
      slotState.versionIndex < versionOptions.length
    ) {
      entries.push({ slotIndex, entry: versionOptions[slotState.versionIndex].entry });
    }
  });

  return entries;
}

export function buildSelectedByTree(state) {
  const selectedByTree = {};

  state.levelUps.forEach((slotState) => {
    if (
      slotState.treeName === null ||
      slotState.level === null ||
      slotState.versionIndex === null
    ) {
      return;
    }

    const option = getTreeLevelOption(state, slotState.treeName, slotState.level);
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

export function getAccessibleAdvancementTreeNames(state) {
  if (!state.selectedProf) {
    return [];
  }

  const treeNames = [];
  const primaryTreeName = resolvePrimaryTreeName(state.selectedProf.Name, state.trees);

  if (state.trees.has(primaryTreeName)) {
    treeNames.push(primaryTreeName);
  }

  state.selectedProf.AdvancementTrees.forEach((treeName) => {
    if (state.trees.has(treeName) && !treeNames.includes(treeName)) {
      treeNames.push(treeName);
    }
  });

  return treeNames;
}

export function isAdvancementLevelUnlocked(level, takenLevels, slotNumber) {
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

export function getTreeLevelOption(state, treeName, level) {
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

export function getVersionOptions(treeLevelOption) {
  return treeLevelOption.versions.map((entry, index) => ({
    index,
    entry,
  }));
}
