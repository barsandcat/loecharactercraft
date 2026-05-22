import { PROB_EN_DIFFICULTIES, computeSuccessDist, bandProb, pct, avgSuccesses, computeAppliedModifiers } from "./probability.js";

export const ATTRIBUTES = ["STR", "AGI", "INT", "CHA"];

// Action card rendering
export function buildActionCardElement(cardId, card, attrs = null, keywordCounts = null) {
  const front = card.Front || {};
  const back = card.Back || null;

  const wrapper = document.createElement("div");
  wrapper.className = "action-card-full";

  const idBox = document.createElement("div");
  idBox.className = "action-card-id " + (front.Type === "Reaction" ? "is-reaction" : "is-action");
  idBox.textContent = cardId;
  wrapper.appendChild(idBox);

  const body = document.createElement("div");
  body.className = "action-card-body";



  // Render front
  renderCardContent(body, front, {
    attrs,
    keywordCounts,
    containerClassName: "action-card-desc",
    textClassName: "action-card-desc",
    noteClassName: "action-card-note",
    warningClassName: "action-card-warning",
    headerElementClass: "",
  });

  // Render back
  renderCardContent(body, back, {
    attrs,
    keywordCounts,
    containerClassName: "folded-effect-text action-card-back",
    textClassName: "action-card-text",
    noteClassName: "action-card-note",
    warningClassName: "action-card-warning",
    headerElementClass: "action-card-back-text",
  });

  wrapper.appendChild(body);
  return wrapper;
}

export function buildRollElement(roll, attrs = null, keywordCounts = null, headerElementClass = "") {
  const rollLineEl = document.createElement("div");
  rollLineEl.className = "action-card-roll" + (headerElementClass ? " " + headerElementClass : "");
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

function renderCardContent(parent, block, options = {}) {
  const {
    attrs,
    keywordCounts,
    containerClassName,
    textClassName,
    noteClassName,
    warningClassName,
    headerElementClass,
  } = options;

  const roll = block?.Roll || null;
  const text = block?.Text || null;
  const note = block?.Note || null;
  const warning = block?.Warning || null;

  if (!roll && !text && !note && !warning) {
    return;
  }

  const container = document.createElement("div");
  container.className = containerClassName;

  // Render Name, Sun/Moon header
  const hasName = block?.DisplayName || block?.Name;
  const hasSun = block?.Sun > 0;
  const hasMoon = block?.Moon > 0;
  if (hasName || hasSun || hasMoon) {
    const nameRowEl = document.createElement("div");
    nameRowEl.className = "action-card-name-row" + (headerElementClass ? " " + headerElementClass : "");

    const sunMoonEl = document.createElement("div");
    sunMoonEl.className = "action-card-sun-moon" + (headerElementClass ? " " + headerElementClass : "");
    if (hasSun) {
      appendSunMoonIcon(sunMoonEl, block.Sun, "sun");
      if (hasMoon) sunMoonEl.appendChild(document.createTextNode(" "));
    }
    if (hasMoon) {
      appendSunMoonIcon(sunMoonEl, block.Moon, "moon");
    }
    if (hasSun || hasMoon) nameRowEl.appendChild(sunMoonEl);

    if (hasName) {
      const nameEl = document.createElement("div");
      nameEl.className = "action-card-name" + (headerElementClass ? " " + headerElementClass : "");
      nameEl.textContent = block.DisplayName || block.Name;
      nameRowEl.appendChild(nameEl);
    }

    container.appendChild(nameRowEl);
  }

  // Render Keywords and Condition
  const hasKeywords = block?.Keywords && block.Keywords.length > 0;
  const hasRequires = block?.Requires && block.Requires.length > 0;
  const hasCondition = block?.Condition;
  if (hasKeywords || hasRequires || hasCondition) {
    const metaEl = document.createElement("div");
    metaEl.className = "action-card-meta" + (headerElementClass ? " " + headerElementClass : "");
    const metaParts = [];
    if (hasKeywords) {
      metaParts.push(...block.Keywords.map((keyword) => buildTokenPart(keyword, "keyword")));
    }
    if (hasRequires) {
      // Add Requires keywords as a single render part, joined by " and "
      metaParts.push({
        render: (parent) => {
          parent.appendChild(document.createTextNode("Requires "));
          block.Requires.forEach((req, index) => {
            if (index > 0) {
              parent.appendChild(document.createTextNode(" and "));
            }
            const tokenEl = document.createElement("em");
            tokenEl.className = "keyword-token";
            tokenEl.textContent = req;
            parent.appendChild(tokenEl);
          });
        },
      });
    }
    if (hasCondition) {
      metaParts.push({
        render: (parent) => appendFormattedText(parent, block.Condition),
      });
    }
    appendDisplayParts(metaEl, metaParts);
    container.appendChild(metaEl);
  }

  // Render Target
  if (block?.Target) {
    const targetEl = document.createElement("div");
    targetEl.className = "action-card-target" + (headerElementClass ? " " + headerElementClass : "");
    targetEl.textContent = block.Target;
    container.appendChild(targetEl);
  }

  // Render Text
  if (text) {
    text.forEach((textItem) => {
      const textEl = document.createElement("div");
      textEl.className = textClassName;
      appendFormattedText(textEl, textItem);
      container.appendChild(textEl);
    });
  }

  // Render Roll + Outcomes
  if (roll) {
    container.appendChild(buildRollElement(roll, attrs, keywordCounts, headerElementClass));

    if (roll.Successes) {
      const sortedKeys = Object.keys(roll.Successes).sort((a, b) => Number(b) - Number(a));
      const rollMode = normalizeRollMode(roll.Mode);
      const rollATTList = getRollAttributeList(roll);
      const attDice = attrs ? getRollAttributeDice(attrs, rollATTList, rollMode) : 0;

      if (attDice > 0) {
        const sortedNum = sortedKeys.map(Number);
        const appliedMods = (keywordCounts && roll.Modifiers)
          ? computeAppliedModifiers(roll.Modifiers, keywordCounts)
          : [];
        const modDiceTotal = appliedMods.reduce((sum, m) => sum + m.totalDice, 0);
        const effectiveDice = Math.max(0, attDice + modDiceTotal);

        let appendProbLabel;
        if (roll.Difficulty != null) {
          const dist = computeSuccessDist(effectiveDice, roll.Difficulty);
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
          outEl.className = "action-card-outcome" + (headerElementClass ? " " + headerElementClass : "");
          outEl.appendChild(document.createTextNode(key + ": "));
          appendFormattedText(outEl, roll.Successes[key]);
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
          container.appendChild(outEl);
        }
      } else {
        sortedKeys.forEach((key) => {
          const outEl = document.createElement("div");
          outEl.className = "action-card-outcome" + (headerElementClass ? " " + headerElementClass : "");
          outEl.appendChild(document.createTextNode(key + ": "));
          appendFormattedText(outEl, roll.Successes[key]);
          container.appendChild(outEl);
        });
      }
    }
  }

  // Render Note
  if (note) {
    const noteEl = document.createElement("div");
    noteEl.className = noteClassName;
    appendFormattedText(noteEl, note);
    container.appendChild(noteEl);
  }

  // Render Warning
  if (warning) {
    const warningEl = document.createElement("div");
    warningEl.className = warningClassName;
    appendFormattedText(warningEl, warning);
    container.appendChild(warningEl);
  }

  parent.appendChild(container);
}

export function buildFoldedEffectText(text, className = "") {
  const effectEl = document.createElement("div");
  effectEl.className = "folded-effect-text" + (className ? " " + className : "");
  appendFormattedText(effectEl, text);
  return effectEl;
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

// Roll attribute resolution
export function getRollAttributeSelection(attrs, attList, mode) {
  if (mode === "Sum") {
    return null;
  }
  const targetValue = getRollAttributeDice(attrs, attList, mode);
  const usedAtt = attList.find((att) => (attrs[att] || 0) === targetValue);
  return usedAtt ? { attribute: usedAtt, value: targetValue } : null;
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

export function getRollAttributeList(roll) {
  return roll.ATT && roll.ATT.length > 0 ? roll.ATT : ATTRIBUTES;
}

export function normalizeRollMode(mode) {
  return mode === "Sum" || mode === "Lowest" ? mode : "Highest";
}

// Text and icon rendering
function appendSunMoonIcon(parent, value, iconName) {
  if (!value || value <= 0) return false;
  const icon = document.createElement("img");
  icon.className = "action-card-inline-icon";
  icon.src = "icons/" + iconName + ".svg";
  icon.alt = iconName.charAt(0).toUpperCase() + iconName.slice(1);
  parent.appendChild(icon);
  const text = document.createElement("span");
  text.textContent = value;
  parent.appendChild(text);
  return true;
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

function appendDisplayParts(parent, parts, separator = ", ") {
  parts.forEach((part, index) => {
    if (index > 0) {
      parent.appendChild(document.createTextNode(separator));
    }
    appendDisplayPart(parent, part);
  });
}

function appendDisplayPart(parent, part) {
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

export function appendDifficultyIcon(parent, difficulty) {
  const iconEl = document.createElement("img");
  iconEl.className = "action-card-inline-icon";
  iconEl.src = "icons/" + encodeURIComponent(String(difficulty)) + ".svg";
  iconEl.alt = "Difficulty " + difficulty;
  parent.appendChild(iconEl);
}

export function buildTokenPart(text, kind) {
  return { text, kind };
}
