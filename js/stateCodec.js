import {
  LEVEL_UP_SLOTS,
  BASIC_UPGRADE_FAMILIES,
  SKILL_SLOTS,
  ITEM_SLOT_TYPES,
  ACTION_SLOT_RULES,
  MAX_ADDED_ITEMS,
} from "./constants.js";
import { collectCharacterStats, matchesSkillTarget, getItemNameById } from "./characterStats.js";

const ADDED_ITEMS_COUNT_BITS = Math.max(1, Math.ceil(Math.log2(MAX_ADDED_ITEMS + 1)));

export function createEmptyLevelUps() {
  return Array.from({ length: LEVEL_UP_SLOTS }, () => ({
    treeName: null,
    level: null,
    versionIndex: null,
    basicUpgradeFamily: null,
  }));
}

export function getRaceAttributeOptions(race) {
  const attributeSets = race?.Attributes;

  if (attributeSets && typeof attributeSets === "object") {
    return Object.entries(attributeSets)
      .sort(([leftId], [rightId]) => Number(leftId) - Number(rightId))
      .map(([, attributeSet]) => attributeSet);
  }

  return [];
}

export function getRaceFreeSkills(race) {
  const freeSkills = race?.FreeSkills;

  if (freeSkills && typeof freeSkills === "object") {
    return Object.entries(freeSkills)
      .sort(([leftId], [rightId]) => Number(leftId) - Number(rightId))
      .map(([, skill]) => skill);
  }

  return [];
}

export function getOptionByIndex(options, index) {
  return options[index] || null;
}

export function serializeStateV3(selection, data, trees) {
  const widths = getV3EncodingWidths(data);
  const fixedBits = getTotalBitsV3(widths);

  // Capped defensively here too — the UI already enforces MAX_ADDED_ITEMS,
  // but the wire format must never trust that alone.
  const addedItems = (selection.addedItems || []).slice(0, MAX_ADDED_ITEMS);
  const totalBits = fixedBits + widths.addedItemCountBits + addedItems.length * widths.addedItem;
  const bytes = new Uint8Array(Math.ceil(totalBits / 8));
  let offset = 0;

  const writeValue = (value, bits) => {
    for (let bitIndex = 0; bitIndex < bits; bitIndex += 1) {
      const bitPosition = offset + bitIndex;
      const byteIndex = Math.floor(bitPosition / 8);
      const bitOffsetInByte = bitPosition % 8;
      if ((value >> bitIndex) & 1) {
        bytes[byteIndex] |= 1 << bitOffsetInByte;
      }
    }
    offset += bits;
  };

  writeValue(encodeV1Id(selection.selectedRace?.Id), widths.race);
  writeValue(
    encodeV1Id(getSelectionIdFromMap(selection.selectedRace?.Attributes, selection.selectedAttributeSet)),
    widths.attribute
  );
  writeValue(
    encodeV1Id(getSelectionIdFromMap(selection.selectedRace?.FreeSkills, selection.selectedFreeSkill)),
    widths.freeSkill
  );
  writeValue(encodeV1Id(selection.selectedOrigin?.Id), widths.origin);
  writeValue(encodeV1Id(selection.selectedProf?.Id), widths.profession);
  writeValue(encodeV1Id(selection.selectedPath?.Id), widths.path);

  selection.levelUps.forEach((slot) => {
    const tree = slot.treeName ? trees.get(slot.treeName) : null;
    const treeId = tree?.Id ?? null;
    const levelValue = slot.level !== null ? slot.level : 0;
    const optionId = slot.treeName !== null && slot.level !== null && slot.versionIndex !== null
      ? getTreeLevelOptionId(tree, slot.level, slot.versionIndex)
      : null;
    const familyIndex = slot.basicUpgradeFamily
      ? BASIC_UPGRADE_FAMILIES.findIndex((family) => family.name === slot.basicUpgradeFamily)
      : -1;
    const familyId = familyIndex >= 0 ? familyIndex + 1 : 0;

    writeValue(encodeV1Id(treeId), widths.tree);
    writeValue(encodeV1Id(levelValue), widths.level);
    writeValue(encodeV1Id(optionId), widths.option);
    writeValue(familyId, widths.basicUpgradeFamily);
  });

  // Slot overrides reference a pool entry by *position*, never by a persisted
  // long-term id — the pool is rebuilt identically (same deterministic walk)
  // on decode from the already-resolved race/origin/profession/path/levelUps
  // fields above, so position N always means "whatever this exact build's
  // Nth pool entry currently is." collectCharacterStats accepts `selection`
  // directly here since it already has the `.data`/`.trees` shape of a full
  // state object (character.js always calls this with the live state). Uses
  // the capped `addedItems` (not `selection.addedItems`) so the pool it
  // builds always agrees with what gets written below.
  const stats = collectCharacterStats({ ...selection, addedItems });

  selection.skillSlots.forEach((override) => {
    writeValue(
      encodeSlotOverride(override, stats.skillPool, (entry, target) => matchesSkillTarget(entry.source, target)),
      widths.skillSlot
    );
  });
  selection.itemSlots.forEach((override) => {
    writeValue(
      encodeSlotOverride(override, stats.itemPool, (entry, target) => entry.itemName === target.itemName),
      widths.itemSlot
    );
  });
  selection.actionSlots.forEach((override) => {
    writeValue(
      encodeSlotOverride(override, stats.actionPool, (entry, target) => entry.cardName === target.cardName),
      widths.actionSlot
    );
  });

  writeValue(addedItems.length, widths.addedItemCountBits);
  addedItems.forEach((itemName) => {
    writeValue(data.Items[itemName]?.Id ?? 0, widths.addedItem);
  });

  return "v3." + encodeBytesToBase64Url(bytes);
}

export function deserializeState(encoded, data, trees) {
  if (!encoded) {
    return null;
  }

  if (encoded.startsWith("v3.")) {
    const decoded = decodeV3State(encoded.slice(3), data);
    return decoded ? resolveV3Patch(decoded, data, trees) : null;
  }

  if (encoded.startsWith("v2.")) {
    const decoded = decodeV2State(encoded.slice(3), data);
    return decoded ? resolveV2Patch(decoded, data) : null;
  }

  if (encoded.startsWith("v1:")) {
    const decoded = decodeV1State(encoded.slice(3), data);
    return decoded ? resolveV1Patch(decoded, data) : null;
  }

  let legacy;
  try {
    const decoded = atob(encoded);
    const json = decodeURIComponent(
      decoded.split("").map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("")
    );
    legacy = JSON.parse(json);
  } catch (_) {
    return null;
  }

  return resolveLegacyPatch(legacy, data);
}

function resolveV1Patch(compact, data) {
  const patch = {
    selectedRace: null,
    selectedAttributeSet: null,
    selectedFreeSkill: null,
    selectedOrigin: null,
    selectedProf: null,
    selectedPath: null,
    levelUps: createEmptyLevelUps(),
  };

  patch.selectedRace = data.Races.find((race) => race.Id === compact.raceId) || null;
  if (patch.selectedRace) {
    patch.selectedAttributeSet = getAttributeSetById(patch.selectedRace, compact.attributeId);
    patch.selectedFreeSkill = getFreeSkillById(patch.selectedRace, compact.freeSkillId);
  }

  patch.selectedOrigin = data.Origins.find((origin) => origin.Id === compact.originId) || null;
  patch.selectedProf = data.Professions.find((profession) => profession.Id === compact.professionId) || null;
  if (patch.selectedProf) {
    patch.selectedPath = patch.selectedProf.Paths.find((path) => path.Id === compact.pathId) || null;
  }

  const levelUps = Array.isArray(compact.levelUps) ? compact.levelUps : [];
  levelUps.forEach((levelUp, index) => {
    if (!levelUp || index >= LEVEL_UP_SLOTS) {
      return;
    }

    const tree = data.AdvancementTrees.find((entry) => entry.Id === levelUp.treeId) || null;
    if (!tree) {
      return;
    }

    const versionIndex = findTreeLevelVersionIndex(tree, levelUp.level, levelUp.optionId);
    patch.levelUps[index] = {
      treeName: tree.Name,
      level: levelUp.level || null,
      versionIndex: versionIndex !== null ? versionIndex : null,
      basicUpgradeFamily: null,
    };
  });

  return patch;
}

function resolveV2Patch(compact, data) {
  const patch = {
    selectedRace: null,
    selectedAttributeSet: null,
    selectedFreeSkill: null,
    selectedOrigin: null,
    selectedProf: null,
    selectedPath: null,
    levelUps: createEmptyLevelUps(),
  };

  patch.selectedRace = data.Races.find((race) => race.Id === compact.raceId) || null;
  if (patch.selectedRace) {
    patch.selectedAttributeSet = getAttributeSetById(patch.selectedRace, compact.attributeId);
    patch.selectedFreeSkill = getFreeSkillById(patch.selectedRace, compact.freeSkillId);
  }

  patch.selectedOrigin = data.Origins.find((origin) => origin.Id === compact.originId) || null;
  patch.selectedProf = data.Professions.find((profession) => profession.Id === compact.professionId) || null;
  if (patch.selectedProf) {
    patch.selectedPath = patch.selectedProf.Paths.find((path) => path.Id === compact.pathId) || null;
  }

  const levelUps = Array.isArray(compact.levelUps) ? compact.levelUps : [];
  levelUps.forEach((levelUp, index) => {
    if (!levelUp || index >= LEVEL_UP_SLOTS) {
      return;
    }

    const tree = data.AdvancementTrees.find((entry) => entry.Id === levelUp.treeId) || null;
    if (!tree) {
      return;
    }

    const versionIndex = findTreeLevelVersionIndex(tree, levelUp.level, levelUp.optionId);
    patch.levelUps[index] = {
      treeName: tree.Name,
      level: levelUp.level || null,
      versionIndex: versionIndex !== null ? versionIndex : null,
      basicUpgradeFamily: levelUp.basicUpgradeFamily || null,
    };
  });

  return patch;
}

function resolveV3Patch(compact, data, trees) {
  const patch = {
    selectedRace: null,
    selectedAttributeSet: null,
    selectedFreeSkill: null,
    selectedOrigin: null,
    selectedProf: null,
    selectedPath: null,
    levelUps: createEmptyLevelUps(),
  };

  patch.selectedRace = data.Races.find((race) => race.Id === compact.raceId) || null;
  if (patch.selectedRace) {
    patch.selectedAttributeSet = getAttributeSetById(patch.selectedRace, compact.attributeId);
    patch.selectedFreeSkill = getFreeSkillById(patch.selectedRace, compact.freeSkillId);
  }

  patch.selectedOrigin = data.Origins.find((origin) => origin.Id === compact.originId) || null;
  patch.selectedProf = data.Professions.find((profession) => profession.Id === compact.professionId) || null;
  if (patch.selectedProf) {
    patch.selectedPath = patch.selectedProf.Paths.find((path) => path.Id === compact.pathId) || null;
  }

  const levelUps = Array.isArray(compact.levelUps) ? compact.levelUps : [];
  levelUps.forEach((levelUp, index) => {
    if (!levelUp || index >= LEVEL_UP_SLOTS) {
      return;
    }

    const tree = data.AdvancementTrees.find((entry) => entry.Id === levelUp.treeId) || null;
    if (!tree) {
      return;
    }

    const versionIndex = findTreeLevelVersionIndex(tree, levelUp.level, levelUp.optionId);
    patch.levelUps[index] = {
      treeName: tree.Name,
      level: levelUp.level || null,
      versionIndex: versionIndex !== null ? versionIndex : null,
      basicUpgradeFamily: levelUp.basicUpgradeFamily || null,
    };
  });

  // addedItems decodes directly from stable Ids (no pool dependency), but —
  // unlike the slot-override codes below — it must resolve BEFORE the pool
  // rebuild, since it's an *input* to pool construction (collectCharacterStats
  // reads selection.addedItems), not an output derived from the pool.
  patch.addedItems = (compact.addedItemIds || [])
    .map((itemId) => getItemNameById(data, itemId))
    .filter(Boolean);

  // Only now that race/origin/profession/path/levelUps/addedItems are
  // resolved can the pool be rebuilt identically to how the live UI computes
  // it, so each slot's wire-format pool index can be translated back into a
  // stable name/provenance target — this dependency order (base selections
  // first, slot arrays second) is required, not incidental.
  const stats = collectCharacterStats({ data, trees, ...patch });

  patch.skillSlots = decodeSlotArray(compact.skillSlotCodes, stats.skillPool, (entry) => entry.source);
  patch.itemSlots = decodeSlotArray(compact.itemSlotCodes, stats.itemPool, (entry) => ({ itemName: entry.itemName }));
  patch.actionSlots = decodeSlotArray(compact.actionSlotCodes, stats.actionPool, (entry) => ({ cardName: entry.cardName }));

  return patch;
}

function resolveLegacyPatch(compact, data) {
  const patch = {
    selectedRace: null,
    selectedAttributeSet: null,
    selectedFreeSkill: null,
    selectedOrigin: null,
    selectedProf: null,
    selectedPath: null,
    levelUps: createEmptyLevelUps(),
  };

  if (compact.r) {
    patch.selectedRace = data.Races.find((race) => race.Name === compact.r) || null;
    if (patch.selectedRace && compact.ai !== null) {
      patch.selectedAttributeSet = getOptionByIndex(getRaceAttributeOptions(patch.selectedRace), compact.ai);
    }
    if (patch.selectedRace && compact.fi != null) {
      patch.selectedFreeSkill = getOptionByIndex(getRaceFreeSkills(patch.selectedRace), compact.fi);
    }
  }

  if (compact.o) {
    patch.selectedOrigin = data.Origins.find((origin) => origin.Name === compact.o) || null;
  }

  if (compact.p) {
    patch.selectedProf = data.Professions.find((profession) => profession.Name === compact.p) || null;
    if (patch.selectedProf && compact.pa) {
      patch.selectedPath = patch.selectedProf.Paths.find((path) => path.Name === compact.pa) || null;
    }
  }

  if (compact.lu) {
    compact.lu.forEach((entry, index) => {
      if (entry && index < LEVEL_UP_SLOTS) {
        patch.levelUps[index] = {
          treeName: entry[0],
          level: entry[1],
          versionIndex: entry[2],
          basicUpgradeFamily: null,
        };
      }
    });
  }

  return patch;
}

function decodeV1State(encoded, data) {
  const bytes = decodeBase64Url(encoded);
  const widths = getV1EncodingWidths(data);
  const totalBits = getTotalBits(widths);

  if (bytes.length * 8 < totalBits) {
    return null;
  }

  let offset = 0;
  const readValue = (bits) => {
    let value = 0;
    for (let bitIndex = 0; bitIndex < bits; bitIndex += 1) {
      const bitPosition = offset + bitIndex;
      const byteIndex = Math.floor(bitPosition / 8);
      const bitOffsetInByte = bitPosition % 8;
      if (byteIndex < bytes.length && (bytes[byteIndex] & (1 << bitOffsetInByte))) {
        value |= 1 << bitIndex;
      }
    }
    offset += bits;
    return value;
  };

  const raceId = decodeV1Id(readValue(widths.race));
  const attributeId = decodeV1Id(readValue(widths.attribute));
  const freeSkillId = decodeV1Id(readValue(widths.freeSkill));
  const originId = decodeV1Id(readValue(widths.origin));
  const professionId = decodeV1Id(readValue(widths.profession));
  const pathId = decodeV1Id(readValue(widths.path));

  const levelUps = [];
  for (let index = 0; index < LEVEL_UP_SLOTS; index += 1) {
    const treeId = decodeV1Id(readValue(widths.tree));
    // decodeV1Id returns null (not 0) for a raw value <= 0, but the only consumer
    // below checks `level > 0`, which is false for both null and 0 — so reusing
    // the nullable-id decoder here is behavior-preserving.
    const level = decodeV1Id(readValue(widths.level));
    const optionId = decodeV1Id(readValue(widths.option));

    if (treeId !== null && level > 0 && optionId !== null) {
      const tree = data.AdvancementTrees.find((entry) => entry.Id === treeId) || null;
      const versionIndex = tree ? findTreeLevelVersionIndex(tree, level, optionId) : null;
      levelUps.push({
        treeId,
        level,
        optionId,
        versionIndex,
      });
    } else {
      levelUps.push(null);
    }
  }

  return {
    raceId,
    attributeId,
    freeSkillId,
    originId,
    professionId,
    pathId,
    levelUps,
  };
}

function decodeV2State(encoded, data) {
  const bytes = decodeBase64Url(encoded);
  const widths = getV2EncodingWidths(data);
  const totalBits = getTotalBitsV2(widths);

  if (bytes.length * 8 < totalBits) {
    return null;
  }

  let offset = 0;
  const readValue = (bits) => {
    let value = 0;
    for (let bitIndex = 0; bitIndex < bits; bitIndex += 1) {
      const bitPosition = offset + bitIndex;
      const byteIndex = Math.floor(bitPosition / 8);
      const bitOffsetInByte = bitPosition % 8;
      if (byteIndex < bytes.length && (bytes[byteIndex] & (1 << bitOffsetInByte))) {
        value |= 1 << bitIndex;
      }
    }
    offset += bits;
    return value;
  };

  const raceId = decodeV1Id(readValue(widths.race));
  const attributeId = decodeV1Id(readValue(widths.attribute));
  const freeSkillId = decodeV1Id(readValue(widths.freeSkill));
  const originId = decodeV1Id(readValue(widths.origin));
  const professionId = decodeV1Id(readValue(widths.profession));
  const pathId = decodeV1Id(readValue(widths.path));

  const levelUps = [];
  for (let index = 0; index < LEVEL_UP_SLOTS; index += 1) {
    const treeId = decodeV1Id(readValue(widths.tree));
    const level = decodeV1Id(readValue(widths.level));
    const optionId = decodeV1Id(readValue(widths.option));
    const familyId = readValue(widths.basicUpgradeFamily);
    const basicUpgradeFamily = familyId > 0 ? (BASIC_UPGRADE_FAMILIES[familyId - 1]?.name ?? null) : null;

    if (treeId !== null && level > 0 && optionId !== null) {
      const tree = data.AdvancementTrees.find((entry) => entry.Id === treeId) || null;
      const versionIndex = tree ? findTreeLevelVersionIndex(tree, level, optionId) : null;
      levelUps.push({
        treeId,
        level,
        optionId,
        versionIndex,
        basicUpgradeFamily,
      });
    } else {
      levelUps.push(null);
    }
  }

  return {
    raceId,
    attributeId,
    freeSkillId,
    originId,
    professionId,
    pathId,
    levelUps,
  };
}

function decodeV3State(encoded, data) {
  const bytes = decodeBase64Url(encoded);
  const widths = getV3EncodingWidths(data);
  const totalBits = getTotalBitsV3(widths);

  if (bytes.length * 8 < totalBits) {
    return null;
  }

  let offset = 0;
  const readValue = (bits) => {
    let value = 0;
    for (let bitIndex = 0; bitIndex < bits; bitIndex += 1) {
      const bitPosition = offset + bitIndex;
      const byteIndex = Math.floor(bitPosition / 8);
      const bitOffsetInByte = bitPosition % 8;
      if (byteIndex < bytes.length && (bytes[byteIndex] & (1 << bitOffsetInByte))) {
        value |= 1 << bitIndex;
      }
    }
    offset += bits;
    return value;
  };

  const raceId = decodeV1Id(readValue(widths.race));
  const attributeId = decodeV1Id(readValue(widths.attribute));
  const freeSkillId = decodeV1Id(readValue(widths.freeSkill));
  const originId = decodeV1Id(readValue(widths.origin));
  const professionId = decodeV1Id(readValue(widths.profession));
  const pathId = decodeV1Id(readValue(widths.path));

  const levelUps = [];
  for (let index = 0; index < LEVEL_UP_SLOTS; index += 1) {
    const treeId = decodeV1Id(readValue(widths.tree));
    const level = decodeV1Id(readValue(widths.level));
    const optionId = decodeV1Id(readValue(widths.option));
    const familyId = readValue(widths.basicUpgradeFamily);
    const basicUpgradeFamily = familyId > 0 ? (BASIC_UPGRADE_FAMILIES[familyId - 1]?.name ?? null) : null;

    if (treeId !== null && level > 0 && optionId !== null) {
      const tree = data.AdvancementTrees.find((entry) => entry.Id === treeId) || null;
      const versionIndex = tree ? findTreeLevelVersionIndex(tree, level, optionId) : null;
      levelUps.push({
        treeId,
        level,
        optionId,
        versionIndex,
        basicUpgradeFamily,
      });
    } else {
      levelUps.push(null);
    }
  }

  const skillSlotCodes = [];
  for (let index = 0; index < widths.skillSlotCount; index += 1) {
    skillSlotCodes.push(readValue(widths.skillSlot));
  }
  const itemSlotCodes = [];
  for (let index = 0; index < widths.itemSlotCount; index += 1) {
    itemSlotCodes.push(readValue(widths.itemSlot));
  }
  const actionSlotCodes = [];
  for (let index = 0; index < widths.actionSlotCount; index += 1) {
    actionSlotCodes.push(readValue(widths.actionSlot));
  }

  // Variable-length section: unlike every field above (statically sized from
  // `data` alone), how many bits this needs depends on the count value just
  // read from the payload itself, so it needs its own guard here rather than
  // relying on the single upfront totalBits check, which only covers the
  // fixed-width prefix above.
  const addedItemCount = readValue(widths.addedItemCountBits);
  const addedItemsBits = addedItemCount * widths.addedItem;
  if (offset + addedItemsBits > bytes.length * 8) {
    return null; // corrupted/truncated count — fail closed
  }
  const addedItemIds = [];
  for (let index = 0; index < addedItemCount; index += 1) {
    addedItemIds.push(readValue(widths.addedItem));
  }

  return {
    raceId,
    attributeId,
    freeSkillId,
    originId,
    professionId,
    pathId,
    levelUps,
    skillSlotCodes,
    itemSlotCodes,
    actionSlotCodes,
    addedItemIds,
  };
}

function getV1EncodingWidths(data) {
  const maxEncodedId = (values) => {
    const maxValue = values.reduce((current, value) => Math.max(current, value ?? 0), 0);
    return Math.max(1, Math.ceil(Math.log2(maxValue + 2)));
  };

  const scoreIds = data.Races.map((race) => race.Id ?? 0);
  const attributeIds = data.Races.flatMap((race) => Object.keys(race.Attributes || {}).map((id) => Number(id)));
  const freeSkillIds = data.Races.flatMap((race) => Object.keys(race.FreeSkills || {}).map((id) => Number(id)));
  const originIds = data.Origins.map((origin) => origin.Id ?? 0);
  const professionIds = data.Professions.map((profession) => profession.Id ?? 0);
  const pathIds = data.Professions.flatMap((profession) => profession.Paths.map((path) => path.Id ?? 0));
  const treeIds = data.AdvancementTrees.map((tree) => tree.Id ?? 0);
  const optionIds = data.AdvancementTrees.flatMap((tree) =>
    Object.values(tree.Levels || {}).flatMap((options) => options.map((option) => option.Id ?? 0))
  );

  return {
    race: maxEncodedId(scoreIds),
    attribute: maxEncodedId(attributeIds),
    freeSkill: maxEncodedId(freeSkillIds),
    origin: maxEncodedId(originIds),
    profession: maxEncodedId(professionIds),
    path: maxEncodedId(pathIds),
    tree: maxEncodedId(treeIds),
    level: Math.max(1, Math.ceil(Math.log2(9))),
    option: maxEncodedId(optionIds),
    levelUps: LEVEL_UP_SLOTS,
  };
}

function getV2EncodingWidths(data) {
  return {
    ...getV1EncodingWidths(data),
    // Fixed, code-defined constant (not data-dependent, unlike every other width
    // above) — must stay outside getV1EncodingWidths's dynamic-cardinality system.
    basicUpgradeFamily: Math.max(1, Math.ceil(Math.log2(BASIC_UPGRADE_FAMILIES.length + 1))),
  };
}

function getV3EncodingWidths(data) {
  // Bounds computed live from `data` (not hardcoded today's numbers) so this
  // self-adjusts if data.json's shape ever changes, rather than silently
  // under-sizing — the same philosophy getV1EncodingWidths already applies
  // to race/tree/option ids.
  const allLevelOptions = data.AdvancementTrees.flatMap((tree) => Object.values(tree.Levels || {}).flat());
  const allPaths = data.Professions.flatMap((profession) => profession.Paths);

  const skillPoolBound = 2 + 1 + LEVEL_UP_SLOTS * maxArrayLength(allLevelOptions, (option) => option.Skills);
  const itemPoolBound = 2
    + maxArrayLength(data.Origins, (origin) => origin.Items)
    + maxArrayLength(allPaths, (path) => path.Items)
    + MAX_ADDED_ITEMS; // the pool can now also hold added items
  const actionPoolBound = 2
    + maxArrayLength(data.Races, (race) => race.ActionCards)
    + maxArrayLength(allPaths, (path) => path.ActionCards)
    + LEVEL_UP_SLOTS * maxArrayLength(allLevelOptions, (option) => option.ActionCards)
    + MAX_ADDED_ITEMS; // each added item can grant one card

  const maxItemId = Object.values(data.Items).reduce((max, item) => Math.max(max, item.Id ?? 0), 0);

  return {
    ...getV2EncodingWidths(data),
    skillSlotCount: SKILL_SLOTS,
    itemSlotCount: ITEM_SLOT_TYPES.length,
    actionSlotCount: ACTION_SLOT_RULES.length,
    skillSlot: Math.max(1, Math.ceil(Math.log2(skillPoolBound))),
    itemSlot: Math.max(1, Math.ceil(Math.log2(itemPoolBound))),
    actionSlot: Math.max(1, Math.ceil(Math.log2(actionPoolBound))),
    addedItemCountBits: ADDED_ITEMS_COUNT_BITS,
    addedItem: Math.max(1, Math.ceil(Math.log2(maxItemId + 1))),
  };
}

function maxArrayLength(items, getArray) {
  return items.reduce((max, item) => Math.max(max, (getArray(item) || []).length), 0);
}

function getTotalBits(widths) {
  return widths.race + widths.attribute + widths.freeSkill + widths.origin + widths.profession + widths.path
    + widths.levelUps * (widths.tree + widths.level + widths.option);
}

function getTotalBitsV2(widths) {
  return getTotalBits(widths) + widths.levelUps * widths.basicUpgradeFamily;
}

function getTotalBitsV3(widths) {
  return getTotalBitsV2(widths)
    + widths.skillSlotCount * widths.skillSlot
    + widths.itemSlotCount * widths.itemSlot
    + widths.actionSlotCount * widths.actionSlot;
}

function encodeSlotOverride(override, pool, matches) {
  if (!override) {
    return 0; // auto
  }
  if (override.cleared) {
    return 1;
  }
  const poolIndex = pool.findIndex((entry) => matches(entry, override.target));
  // A stale target (no longer in the pool) encodes as auto, matching the live
  // resolver's own degrade-to-auto behavior for the same situation.
  return poolIndex >= 0 ? poolIndex + 2 : 0;
}

function decodeSlotArray(codes, pool, extractTarget) {
  return (codes || []).map((code) => {
    if (code === 0) {
      return null;
    }
    if (code === 1) {
      return { cleared: true };
    }
    const entry = pool[code - 2];
    return entry ? { target: extractTarget(entry) } : null;
  });
}

function encodeV1Id(id) {
  return id === null || id === undefined ? 0 : id;
}

function decodeV1Id(value) {
  return value <= 0 ? null : value;
}

function encodeBytesToBase64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(normalized + padding);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function getSelectionIdFromMap(options, selection) {
  if (!options || typeof options !== "object" || !selection) {
    return null;
  }

  for (const [id, value] of Object.entries(options)) {
    if (value === selection) {
      return Number(id);
    }
  }

  return null;
}

function getAttributeSetById(race, id) {
  if (!race?.Attributes || id === null || id === undefined) {
    return null;
  }

  return race.Attributes[String(id)] || race.Attributes[id] || null;
}

function getFreeSkillById(race, id) {
  if (!race?.FreeSkills || id === null || id === undefined) {
    return null;
  }

  return race.FreeSkills[String(id)] || race.FreeSkills[id] || null;
}

function findTreeLevelVersionIndex(tree, level, optionId) {
  if (!tree?.Levels || !tree.Levels[String(level)]) {
    return null;
  }

  const options = tree.Levels[String(level)];
  const optionIndex = options.findIndex((option) => option.Id === optionId);
  return optionIndex >= 0 ? optionIndex : null;
}

function getTreeLevelOptionId(tree, level, versionIndex) {
  if (!tree?.Levels || !tree.Levels[String(level)]) {
    return null;
  }

  const option = tree.Levels[String(level)][versionIndex];
  return option?.Id ?? null;
}
