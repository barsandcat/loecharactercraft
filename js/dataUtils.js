export function normalizeForMatch(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function resolvePrimaryTreeName(professionName, trees) {
  if (trees.has(professionName)) return professionName;

  const normalizedProfession = normalizeForMatch(professionName);
  let bestMatch = null;
  trees.forEach((_, treeName) => {
    const normalizedTree = normalizeForMatch(treeName);
    if (
      normalizedProfession.startsWith(normalizedTree) ||
      normalizedTree.startsWith(normalizedProfession)
    ) {
      if (!bestMatch || normalizedTree.length > normalizeForMatch(bestMatch).length) {
        bestMatch = treeName;
      }
    }
  });
  return bestMatch || professionName;
}
