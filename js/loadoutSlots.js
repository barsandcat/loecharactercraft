// Shared "no cascade" slot-assignment resolver used identically by the skill,
// item, and action-card hotbar loadout systems (and by stateCodec.js for
// encode/decode). See the loadout-slots plan for the full algorithm rationale;
// in short: explicit assignments always win where they target something real,
// auto slots get an override-independent "fixed positional default," and a
// slot whose default gets claimed elsewhere by an explicit assignment simply
// goes empty — nothing ever reflows to fill the gap.
//
// pool: array of opaque entries, in first-appearance acquisition order.
// slots: array (same length as overrides), each { locked: boolean, matches: (entry) => boolean }.
//   A locked slot is excluded from every step as if absent — it never claims a
//   pool entry and never hides one from the pouch.
// overrides: array (same length), each null | { cleared: true } | { target }.
// matchesTarget(poolEntry, target): identity-equality check for this system.
//
const DEFAULT_PRIORITY = () => 0;

// Maximum bipartite matching (Kuhn's / augmenting-path algorithm) between pool
// entries and eligible slots, so the default table always fills as many slots
// as the (pool, slots) graph allows — naive first-fit can strand a slot empty
// even when a full assignment exists (e.g. a flexible slot greedily consumes
// an entry that a later, equally-eligible slot also needed). Processing pool
// entries in priority order (ties broken by pool index, for determinism)
// means a failed match only ever displaces a lower-priority entry, never a
// higher-priority one — see the loadout-slots plan for the full proof.
function computeFixedDefaultBySlot(pool, slots, priority = DEFAULT_PRIORITY) {
  const slotCount = slots.length;
  const eligibleSlotIndexes = [];
  slots.forEach((slot, slotIndex) => {
    if (!slot.locked) {
      eligibleSlotIndexes.push(slotIndex);
    }
  });

  const matchPoolBySlotIndex = new Array(slotCount).fill(null);

  const order = pool.map((_, poolIndex) => poolIndex);
  order.sort((a, b) => {
    const diff = priority(pool[a], a) - priority(pool[b], b);
    return diff !== 0 ? diff : a - b;
  });

  function tryAugment(poolIndex, visited) {
    for (const slotIndex of eligibleSlotIndexes) {
      if (visited.has(slotIndex) || !slots[slotIndex].matches(pool[poolIndex])) {
        continue;
      }
      visited.add(slotIndex);
      const occupant = matchPoolBySlotIndex[slotIndex];
      if (occupant === null || tryAugment(occupant, visited)) {
        matchPoolBySlotIndex[slotIndex] = poolIndex;
        return true;
      }
    }
    return false;
  }

  order.forEach((poolIndex) => tryAugment(poolIndex, new Set()));

  const fixedDefaultBySlot = new Array(slotCount).fill(null);
  matchPoolBySlotIndex.forEach((poolIndex, slotIndex) => {
    fixedDefaultBySlot[slotIndex] = poolIndex;
  });
  return fixedDefaultBySlot;
}

// Returns { slots: [{ entry, poolIndex, reason, stolenBySlot? }], pouch: [entry] }.
// `reason` is one of "locked" | "cleared" | "assigned" | "auto" | "stolen" | "empty".
//
// priority(entry, poolIndex): optional, lower = higher priority. Used only to
// break ties in the pass-2 default table below when the pool has more
// eligible entries than slots can hold — it never affects explicit overrides.
// Defaults to a constant (all entries tie, so ties fall back to pool-append
// order, i.e. today's behavior).
export function resolveLoadoutSlots({ pool, slots, overrides, matchesTarget, priority }) {
  const slotCount = overrides.length;

  // Pass 1: resolve each slot's explicit target (if any) to a pool index, then
  // tie-break conflicting claims on the same pool index (lowest slot index wins
  // — normal setters should never let this happen, but decoded/hand-edited
  // state must not be trusted to maintain that invariant).
  const explicitPoolIndexBySlot = new Array(slotCount).fill(null);
  overrides.forEach((override, slotIndex) => {
    if (slots[slotIndex].locked) {
      return;
    }
    if (override && override.target !== undefined) {
      const poolIndex = pool.findIndex((entry) => matchesTarget(entry, override.target));
      if (poolIndex !== -1) {
        explicitPoolIndexBySlot[slotIndex] = poolIndex;
      }
    }
  });

  const winningSlotByPoolIndex = new Map();
  explicitPoolIndexBySlot.forEach((poolIndex, slotIndex) => {
    if (poolIndex === null) {
      return;
    }
    const currentWinner = winningSlotByPoolIndex.get(poolIndex);
    if (currentWinner === undefined || slotIndex < currentWinner) {
      winningSlotByPoolIndex.set(poolIndex, slotIndex);
    }
  });

  // Pass 2: fixed positional default table — computed once from (pool, eligible
  // slots, priority) only, never from the override array. This is what makes
  // "no cascade" hold: an override change can never change what this table
  // says.
  const fixedDefaultBySlot = computeFixedDefaultBySlot(pool, slots, priority);

  // Pass 3: resolve each slot's final occupant.
  const result = new Array(slotCount);
  const occupiedPoolIndexes = new Set();

  slots.forEach((slot, slotIndex) => {
    if (slot.locked) {
      result[slotIndex] = { entry: null, poolIndex: null, reason: "locked" };
      return;
    }

    const override = overrides[slotIndex];
    if (override && override.cleared) {
      result[slotIndex] = { entry: null, poolIndex: null, reason: "cleared" };
      return;
    }

    const explicitIndex = explicitPoolIndexBySlot[slotIndex];
    if (explicitIndex !== null && winningSlotByPoolIndex.get(explicitIndex) === slotIndex) {
      result[slotIndex] = { entry: pool[explicitIndex], poolIndex: explicitIndex, reason: "assigned" };
      occupiedPoolIndexes.add(explicitIndex);
      return;
    }

    // Either no override, or an explicit target that's stale (not in the pool)
    // or lost the tie-break — both fall through to the fixed default.
    const defaultIndex = fixedDefaultBySlot[slotIndex];
    if (defaultIndex !== null && winningSlotByPoolIndex.get(defaultIndex) === undefined) {
      result[slotIndex] = { entry: pool[defaultIndex], poolIndex: defaultIndex, reason: "auto" };
      occupiedPoolIndexes.add(defaultIndex);
      return;
    }

    if (defaultIndex !== null) {
      result[slotIndex] = { entry: null, poolIndex: null, reason: "stolen", stolenBySlot: winningSlotByPoolIndex.get(defaultIndex) };
      return;
    }

    result[slotIndex] = { entry: null, poolIndex: null, reason: "empty" };
  });

  const pouch = pool.filter((_, poolIndex) => !occupiedPoolIndexes.has(poolIndex));

  return { slots: result, pouch };
}
