import { PROB_EN_DIFFICULTIES, computeSuccessDist, bandProb, pct, avgSuccesses, computeAppliedModifiers } from "./probability.js";

export const ATTRIBUTES = ["STR", "AGI", "INT", "CHA"];

export function normalizeRollMode(mode) {
  return mode === "Sum" || mode === "Lowest" ? mode : "Highest";
}

export function getRollAttributeList(roll) {
  return roll.ATT && roll.ATT.length > 0 ? roll.ATT : ATTRIBUTES;
}

export function getRollAttributeDice(attrs, attList, mode) {
  if (mode === "Sum") {
    return attList.reduce((sum, att) => sum + (attrs[att] || 0), 0);
  }
  if (mode === "Lowest") {
    return attList.reduce((min, att) => Math.min(min, attrs[att] || 0), Number.POSITIVE_INFINITY);
  }
  return attList.reduce((max, att) => Math.max(max, attrs[att] || 0), 0);
}

export function getRollAttributeSelection(attrs, attList, mode) {
  if (mode === "Sum") {
    return null;
  }
  const targetValue = getRollAttributeDice(attrs, attList, mode);
  const usedAtt = attList.find((att) => (attrs[att] || 0) === targetValue);
  return usedAtt ? { attribute: usedAtt, value: targetValue } : null;
}

export function appendFormattedText(parent, text) {
  const pattern = /\{([^}]+)\}|\[([^\]]+)\]/g;
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parent.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    if (match[1] !== undefined) {
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
    } else if (match[2] !== undefined) {
      const keywordName = match[2].trim();
      if (keywordName) {
        const keywordEl = document.createElement("em");
        keywordEl.className = "keyword-token";
        keywordEl.textContent = keywordName;
        parent.appendChild(keywordEl);
      } else {
        parent.appendChild(document.createTextNode(match[0]));
      }
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parent.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

export function appendDifficultyIcon(parent, difficulty) {
  const iconEl = document.createElement("img");
  iconEl.className = "action-card-inline-icon";
  iconEl.src = "icons/" + encodeURIComponent(String(difficulty)) + ".svg";
  iconEl.alt = "Difficulty " + difficulty;
  parent.appendChild(iconEl);
}

export function appendDisplayParts(parent, parts, separator = ", ") {
  parts.forEach((part, index) => {
    if (index > 0) {
      parent.appendChild(document.createTextNode(separator));
    }
    appendDisplayPart(parent, part);
  });
}

export function appendDisplayPart(parent, part) {
  if (!part) return;

  if (typeof part.render === "function") {
    part.render(parent);
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

export function buildTokenPart(text, kind) {
  return { text, kind };
}

export function appendRollModifiers(parent, modifiers) {
  modifiers.forEach((mod) => {
    const sign = mod.Dice > 0 ? "+" : "";
    const dieWord = Math.abs(mod.Dice) === 1 ? "die" : "dice";
    const prefix = mod.against ? "against " : "";
    parent.appendChild(document.createTextNode(", " + sign + mod.Dice + " " + dieWord + ": " + prefix));
    appendDisplayParts(
      parent,
      mod.Triggers.map((trigger) => buildTokenPart(trigger, "keyword"))
    );
  });
}

export function buildFoldedEffectText(text, className = "") {
  const effectEl = document.createElement("div");
  effectEl.className = "folded-effect-text" + (className ? " " + className : "");
  appendFormattedText(effectEl, text);
  return effectEl;
}

export function buildRollElement(roll, attrs = null, keywordCounts = null) {
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
  appendFormattedText(rollLineEl, rollText);

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

  const attDice = attrs ? getRollAttributeDice(attrs, attList, mode) : 0;
  if (attDice > 0) {
    const appliedMods = (keywordCounts && roll.Modifiers)
      ? computeAppliedModifiers(roll.Modifiers, keywordCounts)
      : [];
    const modDiceTotal = appliedMods.reduce((sum, m) => sum + m.totalDice, 0);
    const effectiveDice = Math.max(0, attDice + modDiceTotal);

    const avgWrap = document.createElement("span");
    avgWrap.className = "action-card-prob";
    avgWrap.appendChild(document.createTextNode(" ("));

    if (roll.Difficulty != null) {
      const dist = computeSuccessDist(effectiveDice, roll.Difficulty);
      const avgSucc = avgSuccesses(dist);
      avgWrap.appendChild(document.createTextNode(avgSucc.toFixed(1)));
      const avgIcon = document.createElement("img");
      avgIcon.className = "action-card-inline-icon";
      avgIcon.src = "icons/successes.svg";
      avgIcon.alt = "successes";
      avgWrap.appendChild(avgIcon);
    } else {
      PROB_EN_DIFFICULTIES.forEach((d, di) => {
        if (di > 0) {
          avgWrap.appendChild(document.createTextNode(", "));
        }
        appendDifficultyIcon(avgWrap, d);
        avgWrap.appendChild(document.createTextNode(": "));
        const dist = computeSuccessDist(effectiveDice, d);
        const avgSucc = avgSuccesses(dist);
        avgWrap.appendChild(document.createTextNode(avgSucc.toFixed(1)));
        const avgIcon = document.createElement("img");
        avgIcon.className = "action-card-inline-icon";
        avgIcon.src = "icons/successes.svg";
        avgIcon.alt = "successes";
        avgWrap.appendChild(avgIcon);
      });
    }

    avgWrap.appendChild(document.createTextNode(")"));

    const tooltip = document.createElement("div");
    tooltip.className = "action-card-prob-tooltip";
    const totalLine = document.createElement("div");
    totalLine.className = "action-card-prob-tooltip-total";
    totalLine.textContent = "Rolling " + effectiveDice + " dice";
    tooltip.appendChild(totalLine);
    if (mode === "Sum") {
      attList.forEach((att) => {
        const line = document.createElement("div");
        line.textContent = att + ": " + (attrs[att] || 0);
        tooltip.appendChild(line);
      });
    } else {
      const usedAtt = getRollAttributeSelection(attrs, attList, mode);
      if (usedAtt) {
        const line = document.createElement("div");
        line.textContent = usedAtt.attribute + ": " + usedAtt.value;
        tooltip.appendChild(line);
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
    avgWrap.appendChild(tooltip);
    rollLineEl.appendChild(avgWrap);
  }

  return rollLineEl;
}

export function buildActionCardElement(cardId, card, attrs = null, keywordCounts = null, showNoteWarning = false) {
  const wrapper = document.createElement("div");
  wrapper.className = "action-card-full";

  const idBox = document.createElement("div");
  idBox.className = "action-card-id " + (card.Type === "Reaction" ? "is-reaction" : "is-action");
  idBox.textContent = cardId;
  wrapper.appendChild(idBox);

  const body = document.createElement("div");
  body.className = "action-card-body";

  const nameRowEl = document.createElement("div");
  nameRowEl.className = "action-card-name-row";
  
  const sunMoonEl = document.createElement("div");
  sunMoonEl.className = "action-card-sun-moon";
  
  let hasSunMoon = false;
  
  if (card.Sun && card.Sun > 0) {
    const sunIcon = document.createElement("img");
    sunIcon.className = "action-card-inline-icon";
    sunIcon.src = "icons/sun.svg";
    sunIcon.alt = "Sun";
    sunMoonEl.appendChild(sunIcon);
    
    const sunText = document.createElement("span");
    sunText.textContent = card.Sun;
    sunMoonEl.appendChild(sunText);
    
    hasSunMoon = true;
  }
  
  if ((card.Sun && card.Sun > 0) && (card.Moon && card.Moon > 0)) {
    sunMoonEl.appendChild(document.createTextNode(" "));
  }
  
  if (card.Moon && card.Moon > 0) {
    const moonIcon = document.createElement("img");
    moonIcon.className = "action-card-inline-icon";
    moonIcon.src = "icons/moon.svg";
    moonIcon.alt = "Moon";
    sunMoonEl.appendChild(moonIcon);
    
    const moonText = document.createElement("span");
    moonText.textContent = card.Moon;
    sunMoonEl.appendChild(moonText);
    
    hasSunMoon = true;
  }
  
  if (hasSunMoon) {
    nameRowEl.appendChild(sunMoonEl);
  }
  
  const nameEl = document.createElement("div");
  nameEl.className = "action-card-name";
  nameEl.textContent = card.DisplayName || card.Name;
  nameRowEl.appendChild(nameEl);

  const backSunMoonEl = document.createElement("div");
  backSunMoonEl.className = "action-card-back-sun-moon";
  
  let hasBackSunMoon = false;
  
  if (card.BackSun && card.BackSun > 0) {
    const sunIcon = document.createElement("img");
    sunIcon.className = "action-card-inline-icon";
    sunIcon.src = "icons/sun.svg";
    sunIcon.alt = "Sun";
    backSunMoonEl.appendChild(sunIcon);
    
    const sunText = document.createElement("span");
    sunText.textContent = card.BackSun;
    backSunMoonEl.appendChild(sunText);
    
    hasBackSunMoon = true;
  }
  
  if ((card.BackSun && card.BackSun > 0) && (card.BackMoon && card.BackMoon > 0)) {
    backSunMoonEl.appendChild(document.createTextNode(" "));
  }
  
  if (card.BackMoon && card.BackMoon > 0) {
    const moonIcon = document.createElement("img");
    moonIcon.className = "action-card-inline-icon";
    moonIcon.src = "icons/moon.svg";
    moonIcon.alt = "Moon";
    backSunMoonEl.appendChild(moonIcon);
    
    const moonText = document.createElement("span");
    moonText.textContent = card.BackMoon;
    backSunMoonEl.appendChild(moonText);
    
    hasBackSunMoon = true;
  }
  
  if (hasBackSunMoon) {
    nameRowEl.appendChild(backSunMoonEl);
  }
  
  body.appendChild(nameRowEl);

  const metaParts = [
    ...(card.Keywords || []).map((keyword) => buildTokenPart(keyword, "keyword")),
  ];
  if (card.Condition) {
    metaParts.push({
      render: (parent) => appendFormattedText(parent, card.Condition),
    });
  }
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
    body.appendChild(buildRollElement(card.Roll, attrs, keywordCounts));

    if (card.Roll.Successes) {
      const sortedKeys = Object.keys(card.Roll.Successes).sort((a, b) => Number(b) - Number(a));
      const rollMode = normalizeRollMode(card.Roll.Mode);
      const rollATTList = getRollAttributeList(card.Roll);
      const attDice = attrs ? getRollAttributeDice(attrs, rollATTList, rollMode) : 0;

      if (attDice > 0) {
        const sortedNum = sortedKeys.map(Number);
        const appliedMods = (keywordCounts && card.Roll.Modifiers)
          ? computeAppliedModifiers(card.Roll.Modifiers, keywordCounts)
          : [];
        const modDiceTotal = appliedMods.reduce((sum, m) => sum + m.totalDice, 0);
        const effectiveDice = Math.max(0, attDice + modDiceTotal);

        let appendProbLabel;
        if (card.Roll.Difficulty != null) {
          const dist = computeSuccessDist(effectiveDice, card.Roll.Difficulty);
          appendProbLabel = (parent, i) => {
            parent.appendChild(document.createTextNode("(" + pct(bandProb(dist, sortedNum, i)) + ")"));
          };
        } else {
          const dists = PROB_EN_DIFFICULTIES.map((d) => computeSuccessDist(effectiveDice, d));
          appendProbLabel = (parent, i) => {
            parent.appendChild(document.createTextNode("("));
            PROB_EN_DIFFICULTIES.forEach((d, di) => {
              if (di > 0) {
                parent.appendChild(document.createTextNode(", "));
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
          appendFormattedText(outEl, card.Roll.Successes[key]);
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
          if (rollMode === "Sum") {
            rollATTList.forEach((att) => {
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
      } else {
        sortedKeys.forEach((key) => {
          const outEl = document.createElement("div");
          outEl.className = "action-card-outcome";
          outEl.appendChild(document.createTextNode(key + ": "));
          appendFormattedText(outEl, card.Roll.Successes[key]);
          body.appendChild(outEl);
        });
      }
    }
  }

  if (card.Front) {
    const frontEl = document.createElement("div");
    frontEl.className = "action-card-desc";
    appendFormattedText(frontEl, card.Front);
    body.appendChild(frontEl);
  }

  const hasNote = showNoteWarning && Boolean(card.Note);
  const hasWarning = showNoteWarning && Boolean(card.Warning);

  if (card.Back || hasNote || hasWarning) {
    const boxEl = document.createElement("div");
    boxEl.className = "folded-effect-text action-card-back";

    if (card.Back) {
      const backTextEl = document.createElement("div");
      appendFormattedText(backTextEl, card.Back);
      boxEl.appendChild(backTextEl);
    }
    if (hasNote) {
      const noteEl = document.createElement("div");
      noteEl.className = "action-card-note";
      appendFormattedText(noteEl, card.Note);
      boxEl.appendChild(noteEl);
    }
    if (hasWarning) {
      const warningEl = document.createElement("div");
      warningEl.className = "action-card-warning";
      appendFormattedText(warningEl, card.Warning);
      boxEl.appendChild(warningEl);
    }
    
    body.appendChild(boxEl);
  }

  wrapper.appendChild(body);
  return wrapper;
}
