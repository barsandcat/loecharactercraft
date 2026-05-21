export const PROB_EN_DIFFICULTIES = [6, 8, 10];

export function computeSuccessDist(numDice, difficulty) {
  const p0 = (difficulty - 1) / 12;
  const p1 = Math.max(0, 12 - difficulty) / 12;
  const p2 = 1 / 12;
  const maxS = 2 * numDice;
  let dp = new Float64Array(maxS + 1);
  dp[0] = 1.0;
  for (let i = 0; i < numDice; i++) {
    const next = new Float64Array(maxS + 1);
    for (let s = 0; s <= maxS; s++) {
      if (dp[s] === 0) continue;
      next[s]     += dp[s] * p0;
      if (s + 1 <= maxS) next[s + 1] += dp[s] * p1;
      if (s + 2 <= maxS) next[s + 2] += dp[s] * p2;
    }
    dp = next;
  }
  return dp;
}

function probAtLeast(dist, k) {
  if (k <= 0) return 1;
  let sum = 0;
  for (let s = Math.max(0, k); s < dist.length; s++) sum += dist[s];
  return sum;
}

export function bandProb(dist, sortedNumKeys, index) {
  const lo = sortedNumKeys[index];
  const hi = index > 0 ? sortedNumKeys[index - 1] : null;
  return probAtLeast(dist, lo) - (hi !== null ? probAtLeast(dist, hi) : 0);
}

export function pct(p) { return Math.round(p * 100) + "%"; }

export function avgSuccesses(dist) {
  let sum = 0;
  for (let s = 0; s < dist.length; s++) {
    sum += s * dist[s];
  }
  return sum;
}

export function computeAppliedModifiers(modifiers, keywordCounts) {
  const applied = [];
  for (const mod of modifiers) {
    let bestTrigger = null;
    let bestCount = 0;
    for (const trigger of mod.Triggers) {
      const count = keywordCounts.get(trigger) || 0;
      if (count > bestCount) {
        bestCount = count;
        bestTrigger = trigger;
      }
    }
    if (bestTrigger && bestCount > 0) {
      applied.push({ trigger: bestTrigger, count: bestCount, totalDice: mod.Dice * bestCount });
    }
  }
  return applied;
}
