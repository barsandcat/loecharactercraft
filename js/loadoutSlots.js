// Shared slot-assignment resolver used identically by the skill, item, and
// action-card hotbar loadout systems (and by stateCodec.js for encode/decode).
// See the loadout-slots plan for the full algorithm rationale; in short:
// explicit assignments always win where they target something real, and
// every other unlocked slot auto-fills from whatever's left in the pool once
// explicit claims are set aside — if a slot's usual default gets explicitly
// pinned to a different slot, this slot backfills with the next best
// available entry instead of going empty.
//
// pool: array of opaque entries, in first-appearance acquisition order.
// slots: array (same length as overrides), each { locked: boolean, matches: (entry) => boolean }.
//   A locked slot is excluded from every step as if absent — it never claims a
//   pool entry and never hides one from the pouch.
// overrides: array (same length), each null | { target }.
// matchesTarget(poolEntry, target): identity-equality check for this system.
//
const DEFAULT_PRIORITY = () => 0;

// Maximum bipartite matching (Kuhn's / augmenting-path algorithm) between
// unclaimed pool entries and slots that don't already have a winning explicit
// assignment, so the default table always fills as many of the *remaining*
// slots as the (pool, slots) graph allows — naive first-fit can strand a slot
// empty even when a full assignment exists (e.g. a flexible slot greedily
// consumes an entry that a later, equally-eligible slot also needed).
// Processing pool entries in priority order (ties broken by pool index, for
// determinism) means a failed match only ever displaces a lower-priority
// entry, never a higher-priority one — see the loadout-slots plan for the
// full proof. claimedPoolIndexes/winningSlotIndexes remove explicitly-spoken-
// for entries and slots from contention entirely, so this table can never
// suggest a pool entry that some other slot already explicitly won.
function computeFixedDefaultBySlot(pool, slots, priority = DEFAULT_PRIORITY, claimedPoolIndexes = new Set(), winningSlotIndexes = new Set()) {
  const slotCount = slots.length;
  const eligibleSlotIndexes = [];
  slots.forEach((slot, slotIndex) => {
    if (!slot.locked && !winningSlotIndexes.has(slotIndex)) {
      eligibleSlotIndexes.push(slotIndex);
    }
  });

  const matchPoolBySlotIndex = new Array(slotCount).fill(null);

  const order = pool
    .map((_, poolIndex) => poolIndex)
    .filter((poolIndex) => !claimedPoolIndexes.has(poolIndex));
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

// Returns { slots: [{ entry, poolIndex, reason }], pouch: [entry] }.
// `reason` is one of "locked" | "assigned" | "auto" | "empty".
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

  // Pass 2: fixed default table for every slot that ISN'T winning an explicit
  // claim, computed from the pool with explicitly-claimed entries removed —
  // so a slot robbed of its usual default backfills with whatever's next
  // best, rather than needing the robbing slot's own override to change.
  const claimedPoolIndexes = new Set(winningSlotByPoolIndex.keys());
  const winningSlotIndexes = new Set(winningSlotByPoolIndex.values());
  const fixedDefaultBySlot = computeFixedDefaultBySlot(pool, slots, priority, claimedPoolIndexes, winningSlotIndexes);

  // Pass 3: resolve each slot's final occupant.
  const result = new Array(slotCount);
  const occupiedPoolIndexes = new Set();

  slots.forEach((slot, slotIndex) => {
    if (slot.locked) {
      result[slotIndex] = { entry: null, poolIndex: null, reason: "locked" };
      return;
    }

    const explicitIndex = explicitPoolIndexBySlot[slotIndex];
    if (explicitIndex !== null && winningSlotByPoolIndex.get(explicitIndex) === slotIndex) {
      result[slotIndex] = { entry: pool[explicitIndex], poolIndex: explicitIndex, reason: "assigned" };
      occupiedPoolIndexes.add(explicitIndex);
      return;
    }

    // Either no override, or an explicit target that's stale (not in the pool)
    // or lost the tie-break — both fall through to the fixed default, which by
    // construction never points at a pool index some other slot already won.
    const defaultIndex = fixedDefaultBySlot[slotIndex];
    if (defaultIndex !== null) {
      result[slotIndex] = { entry: pool[defaultIndex], poolIndex: defaultIndex, reason: "auto" };
      occupiedPoolIndexes.add(defaultIndex);
      return;
    }

    result[slotIndex] = { entry: null, poolIndex: null, reason: "empty" };
  });

  const pouch = pool.filter((_, poolIndex) => !occupiedPoolIndexes.has(poolIndex));

  return { slots: result, pouch };
}
