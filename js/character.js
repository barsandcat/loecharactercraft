import {
  createEmptyLevelUps,
  getRaceAttributeOptions,
  getRaceFreeSkills,
  serializeStateV3,
  deserializeState,
} from "./stateCodec.js";
import {
  tryAutoSelect,
  refreshLevelUpStates,
  getTreeLevelOption,
  getVersionOptions,
  getFilledLevelCount,
} from "./advancementTree.js";
import { buildPrintableText as buildPrintableTextModule } from "./printableText.js";
import {
  describeVersionOption,
  describeBasicUpgradeFamilyOption,
  describeSkillSlotOption,
  describeItemSlotOption,
  describeActionSlotOption,
} from "./selectorDescriptors.js";
import {
  collectCharacterStats,
  buildActionCardPreviewStats,
  getEligibleBasicUpgradeFamilies,
  resolveSkillSlots,
  resolveItemSlots,
  resolveActionSlots,
  getEligibleItemPouchForSlot,
  getEligibleActionPouchForSlot,
} from "./characterStats.js";
import { SKILL_SLOTS, ITEM_SLOT_TYPES, ACTION_SLOT_RULES } from "./constants.js";
import { createSelectorOverlay } from "./selectorOverlay.js";
import { createPanelRenderer } from "./panelRenderer.js";

function createEmptySlots(count) {
  return new Array(count).fill(null);
}

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
    skillSlots: createEmptySlots(SKILL_SLOTS),
    itemSlots: createEmptySlots(ITEM_SLOT_TYPES.length),
    actionSlots: createEmptySlots(ACTION_SLOT_RULES.length),
  };

  // Slot indices already auto-offered a basic-upgrade picker this session, so a
  // dismissed offer doesn't immediately re-pop on the next unrelated action —
  // the per-slot button remains available regardless.
  let acknowledgedBasicUpgradeSlots = new Set();

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
      openBasicUpgradePickerForSlot,
      openSkillPickerForSlot,
      openItemPickerForSlot,
      openActionPickerForSlot,
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
    state.skillSlots = patch.skillSlots || createEmptySlots(SKILL_SLOTS);
    state.itemSlots = patch.itemSlots || createEmptySlots(ITEM_SLOT_TYPES.length);
    state.actionSlots = patch.actionSlots || createEmptySlots(ACTION_SLOT_RULES.length);

    commitSelection();
    return true;
  }

  function isBuildEmpty() {
    return (
      !state.selectedRace &&
      !state.selectedOrigin &&
      !state.selectedProf &&
      !state.selectedPath &&
      getFilledLevelCount(state) === 0
    );
  }

  function commitSelection() {
    tryAutoSelect(state);
    onStateChange(serializeState());
    render();
    offerNextBasicUpgradeIfNew();
  }

  function offerNextBasicUpgradeIfNew() {
    const stats = collectCharacterStats(state);
    const nextNew = stats.basicUpgradeSlots
      .filter((slot) => !slot.chosenFamily)
      .map((slot) => slot.slotIndex)
      .find((slotIndex) => !acknowledgedBasicUpgradeSlots.has(slotIndex));

    if (nextNew === undefined) {
      return;
    }

    acknowledgedBasicUpgradeSlots.add(nextNew);
    openBasicUpgradePickerForSlot(nextNew);
  }

  function serializeState() {
    try {
      return serializeStateV3(state, state.data, state.trees);
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
    state.skillSlots = createEmptySlots(SKILL_SLOTS);
    state.itemSlots = createEmptySlots(ITEM_SLOT_TYPES.length);
    state.actionSlots = createEmptySlots(ACTION_SLOT_RULES.length);
    acknowledgedBasicUpgradeSlots = new Set();
  }

  // Skill slots can pin a specific level-up slot's grant (or the free-skill
  // pick) by provenance, not by name — so unlike item/action slots (identity =
  // a stable name), a skill pin can silently start pointing at a *different*
  // skill if the thing it points at changes underneath it without being
  // cleared. Clear any pin whose target matches the given predicate whenever
  // that provenance is directly edited.
  function clearSkillSlotsMatching(predicate) {
    state.skillSlots = state.skillSlots.map((override) => (
      override && override.target && predicate(override.target) ? null : override
    ));
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
      clearSkillSlotsMatching((target) => target?.kind === "freeSkill");
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
      clearSkillSlotsMatching((target) => target?.kind === "levelUp");
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
    slot.basicUpgradeFamily = null;
    acknowledgedBasicUpgradeSlots.delete(slotIndex);
    clearSkillSlotsMatching((target) => target?.kind === "levelUp" && target.slotIndex === slotIndex);
    commitSelection();
    openRewardSelectorIfNeeded(slotIndex);
  }

  // Skips straight to the reward step after a tree pick when there's a real
  // choice to make (a single reward is already auto-selected by tryAutoSelect).
  function openRewardSelectorIfNeeded(slotIndex) {
    const slot = state.levelUps[slotIndex];
    if (slot.versionIndex !== null) {
      return;
    }

    const treeLevelOption = getTreeLevelOption(state, slot.treeName, slot.level);
    const versionOptions = treeLevelOption ? getVersionOptions(treeLevelOption) : [];
    if (versionOptions.length <= 1) {
      return;
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
  }

  function selectLevelUpVersion(slotIndex, versionOption) {
    const slot = state.levelUps[slotIndex];
    slot.versionIndex = versionOption.index;
    slot.basicUpgradeFamily = null;
    acknowledgedBasicUpgradeSlots.delete(slotIndex);
    clearSkillSlotsMatching((target) => target?.kind === "levelUp" && target.slotIndex === slotIndex);
    commitSelection();
  }

  function selectBasicUpgradeForSlot(slotIndex, family) {
    state.levelUps[slotIndex].basicUpgradeFamily = family.name;
    commitSelection();
  }

  function openBasicUpgradePickerForSlot(slotIndex) {
    const stats = collectCharacterStats(state);
    const eligibleFamilies = getEligibleBasicUpgradeFamilies(state.data, stats);
    const previewStats = buildActionCardPreviewStats(stats);

    selectorOverlay.openSelector({
      kicker: "Level Up " + (slotIndex + 1),
      title: "Choose Basic Upgrade",
      description: "This reward duplicates a basic action you already have at its top tier — pick a different basic to upgrade instead.",
      options: eligibleFamilies,
      getOptionContent: (family) => describeBasicUpgradeFamilyOption(state, family, previewStats),
      onSelect: (family) => selectBasicUpgradeForSlot(slotIndex, family),
      isSelected: (family) => state.levelUps[slotIndex].basicUpgradeFamily === family.name,
    });
  }

  function selectSkillSlot(slotIndex, override) {
    state.skillSlots[slotIndex] = override;
    commitSelection();
  }

  function openSkillPickerForSlot(slotIndex) {
    const stats = collectCharacterStats(state);
    const { slots, pouch } = resolveSkillSlots(state, stats);
    const options = slots[slotIndex].entry ? [{ __clear: true }, ...pouch] : pouch;

    selectorOverlay.openSelector({
      title: "Choose Skill",
      description: "Pick a skill from your pouch to fill this slot.",
      options,
      getOptionContent: (option) => describeSkillSlotOption(option),
      onSelect: (option) => selectSkillSlot(slotIndex, option.__clear ? { cleared: true } : { target: option.source }),
      isSelected: () => false,
    });
  }

  function selectItemSlot(slotIndex, override) {
    state.itemSlots[slotIndex] = override;
    commitSelection();
  }

  function openItemPickerForSlot(slotIndex) {
    const stats = collectCharacterStats(state);
    const { slots, pouch } = resolveItemSlots(state, stats);
    const eligiblePouch = getEligibleItemPouchForSlot(pouch, slotIndex);
    const options = slots[slotIndex].entry ? [{ __clear: true }, ...eligiblePouch] : eligiblePouch;

    selectorOverlay.openSelector({
      title: "Choose Item",
      description: "Pick an item from your pouch to fill this slot.",
      options,
      getOptionContent: (option) => describeItemSlotOption(option),
      onSelect: (option) =>
        selectItemSlot(slotIndex, option.__clear ? { cleared: true } : { target: { itemName: option.itemName } }),
      isSelected: () => false,
    });
  }

  function selectActionSlot(slotIndex, override) {
    state.actionSlots[slotIndex] = override;
    commitSelection();
  }

  function openActionPickerForSlot(slotIndex) {
    const stats = collectCharacterStats(state);
    const { slots, pouch } = resolveActionSlots(state, stats);
    const eligiblePouch = getEligibleActionPouchForSlot(pouch, slotIndex);
    const previewStats = buildActionCardPreviewStats(stats);
    const options = slots[slotIndex].entry ? [{ __clear: true }, ...eligiblePouch] : eligiblePouch;

    selectorOverlay.openSelector({
      kicker: "Hotbar Slot " + (slotIndex + 1),
      title: "Choose Action Card",
      description: "Pick an action card from your pouch to fill this slot.",
      options,
      getOptionContent: (option) => describeActionSlotOption(state, option, previewStats),
      onSelect: (option) =>
        selectActionSlot(slotIndex, option.__clear ? { cleared: true } : { target: { cardName: option.cardName } }),
      isSelected: () => false,
    });
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
