import { LEVEL_UP_SLOTS } from "./constants.js";

export function createEmptyLevelUps() {
  return Array.from({ length: LEVEL_UP_SLOTS }, () => ({ treeName: null, level: null, versionIndex: null }));
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

export function serializeStateV1(selection, data, trees) {
  const widths = getV1EncodingWidths(data);
  const totalBits = getTotalBits(widths);
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

    writeValue(encodeV1Id(treeId), widths.tree);
    // levelValue is always a non-negative integer (0 for an empty slot), so the
    // nullable-id encoding is safe to reuse here instead of a separate encoder.
    writeValue(encodeV1Id(levelValue), widths.level);
    writeValue(encodeV1Id(optionId), widths.option);
  });

  return "v1:" + encodeBytesToBase64Url(bytes);
}

export function deserializeState(encoded, data, trees) {
  if (!encoded) {
    return null;
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
    };
  });

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

function getTotalBits(widths) {
  return widths.race + widths.attribute + widths.freeSkill + widths.origin + widths.profession + widths.path
    + widths.levelUps * (widths.tree + widths.level + widths.option);
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
