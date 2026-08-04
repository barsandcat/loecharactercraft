import {
  createEmptyLevelUps,
  getRaceAttributeOptions,
  getRaceFreeSkills,
  serializeStateV1,
  deserializeState,
} from "./stateCodec.js";
import { tryAutoSelect, refreshLevelUpStates, getTreeLevelOption, getVersionOptions } from "./advancementTree.js";
import { buildPrintableText as buildPrintableTextModule } from "./printableText.js";
import { describeVersionOption } from "./selectorDescriptors.js";
import { createSelectorOverlay } from "./selectorOverlay.js";
import { createPanelRenderer } from "./panelRenderer.js";

export function createCharacterBuilder({ data, ui, onStateChange = () => {} }) {
  const state = {
    data,
    trees: new Map(data.AdvancementTrees.map((tree) => [tree.Name, tree])),
    selectedRace: null,
    selectedAttributeSet: null,
    selectedFreeSkill: null,
    selectedOrigin: null,
    selectedProf: null,
    selectedPath: null,
    levelUps: createEmptyLevelUps(),
  };

  const selectorOverlay = createSelectorOverlay(ui);
  const panelRenderer = createPanelRenderer({
    state,
    ui,
    callbacks: {
      openSelector: selectorOverlay.openSelector,
      isBuildEmpty,
      selectRace,
      selectAttributeSet,
      selectFreeSkill,
      selectOrigin,
      selectProfession,
      selectPath,
      selectLevelUpTree,
      selectLevelUpVersion,
    },
  });

  // Build lifecycle
  function render() {
    const levelMeta = refreshLevelUpStates(state);
    panelRenderer.renderControls(levelMeta);
    panelRenderer.renderSummary();
    panelRenderer.renderTrees(levelMeta);
  }

  function resetBuild() {
    resetSelectionState();
    selectorOverlay.closeSelector();
    commitSelection();
  }

  function randomBuild() {
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

    resetSelectionState();

    const race = pick(state.data.Races);
    state.selectedRace = race;
    const attrs = getRaceAttributeOptions(race);
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
    const patch = deserializeState(encoded, state.data, state.trees);
    if (!patch) {
      console.warn("Could not restore state from URL hash.");
      return false;
    }

    state.selectedRace = patch.selectedRace;
    state.selectedAttributeSet = patch.selectedAttributeSet;
    state.selectedFreeSkill = patch.selectedFreeSkill;
    state.selectedOrigin = patch.selectedOrigin;
    state.selectedProf = patch.selectedProf;
    state.selectedPath = patch.selectedPath;
    state.levelUps = patch.levelUps;

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
    tryAutoSelect(state);
    onStateChange(serializeState());
    render();
  }

  function serializeState() {
    try {
      return serializeStateV1(state, state.data, state.trees);
    } catch (_) {
      return null;
    }
  }

  function buildPrintableText() {
    return buildPrintableTextModule(state);
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

  // Selection
  function selectRace(race) {
    const raceChanged = state.selectedRace !== race;
    state.selectedRace = race;

    if (raceChanged) {
      state.selectedAttributeSet = null;
      state.selectedFreeSkill = null;
      const attrOptions = getRaceAttributeOptions(race);
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
    return openRewardSelectorIfNeeded(slotIndex);
  }

  // Skips straight to the reward step after a tree pick when there's a real
  // choice to make (a single reward is already auto-selected by tryAutoSelect).
  function openRewardSelectorIfNeeded(slotIndex) {
    const slot = state.levelUps[slotIndex];
    if (slot.versionIndex !== null) {
      return false;
    }

    const treeLevelOption = getTreeLevelOption(state, slot.treeName, slot.level);
    const versionOptions = treeLevelOption ? getVersionOptions(treeLevelOption) : [];
    if (versionOptions.length <= 1) {
      return false;
    }

    selectorOverlay.openSelector({
      kicker: "Level Up " + (slotIndex + 1),
      title: "Choose Reward",
      description: "Pick the reward version for this tree level.",
      options: versionOptions,
      getOptionContent: (option) => describeVersionOption(state, option, slotIndex),
      onSelect: (option) => selectLevelUpVersion(slotIndex, option),
      isSelected: () => false,
    });
    return true;
  }

  function selectLevelUpVersion(slotIndex, versionOption) {
    state.levelUps[slotIndex].versionIndex = versionOption.index;
    commitSelection();
  }

  function getFilledLevelCount() {
    return state.levelUps.reduce((count, slotState) => {
      return count + (slotState.treeName !== null && slotState.versionIndex !== null ? 1 : 0);
    }, 0);
  }

  return {
    buildPrintableText,
    closeSelector: selectorOverlay.closeSelector,
    isBuildEmpty,
    randomBuild,
    render,
    resetBuild,
    restoreStateFromEncoded,
    serializeState,
  };
}
