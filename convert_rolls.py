import json
import re

ATT_ATTRS = {'STR', 'AGI', 'INT', 'CHA'}


def parse_old_roll(description):
    """Parse old roll format into new Roll dict. Returns None if not parseable."""
    if not description.startswith('Roll '):
        return None

    rest = description[5:]

    # First ATT
    m = re.match(r'^(STR|AGI|INT|CHA)', rest)
    if not m:
        return None
    att_list = [m.group(1)]
    rest = rest[m.end():]

    # Additional ATTs via "and", "or", or comma (only if followed by another ATT)
    while True:
        m = re.match(r'^\s+(?:and|or)\s+(STR|AGI|INT|CHA)', rest)
        if m:
            att_list.append(m.group(1))
            rest = rest[m.end():]
            continue
        m = re.match(r'^,\s*(STR|AGI|INT|CHA)(?=\s|$|,|;)', rest)
        if m:
            att_list.append(m.group(1))
            rest = rest[m.end():]
            continue
        break

    # DIV flag
    div = False
    m = re.match(r'^,\s*DIV\b', rest)
    if m:
        div = True
        rest = rest[m.end():]

    # Difficulty
    difficulty = None
    m = re.match(r'^\s*\[(\d+|EN)\]', rest)
    if m:
        diff_val = m.group(1)
        if diff_val != 'EN':
            difficulty = int(diff_val)
        rest = rest[m.end():]

    # Reject if there's leftover content that isn't modifiers
    if rest and not re.match(r'^[;,]\s*[+-]', rest) and not re.match(r'^\s*$', rest):
        return None

    # Parse modifiers
    modifiers = []
    if rest:
        rest = re.sub(r'^[;,]\s*', '', rest).strip()
        if rest:
            # Split on comma/semicolon that precedes a +/- modifier
            mod_parts = re.split(r'\s*[;,]\s*(?=[+-]\d)', rest)
            for part in mod_parts:
                part = part.strip()
                m = re.match(r'^([+-]\d+)\s*:\s*(.+)$', part)
                if not m:
                    return None
                dice = int(m.group(1))
                triggers = [t.strip() for t in m.group(2).split(',')]
                modifiers.append({"Dice": dice, "Triggers": triggers})

    roll = {}
    if div:
        roll["DIV"] = True
    roll["ATT"] = att_list
    if difficulty is not None:
        roll["Difficulty"] = difficulty
    if modifiers:
        roll["Modifiers"] = modifiers
    return roll


def convert_card(card):
    desc = card.get('CardDescription')
    if desc is None:
        return card, None

    if not desc.startswith('Roll'):
        new_key, new_val = 'Front', desc
    else:
        roll = parse_old_roll(desc)
        if roll is not None:
            new_key, new_val = 'Roll', roll
        else:
            new_key, new_val = 'Front', desc

    # Rebuild dict replacing CardDescription in-place to preserve key order
    new_card = {}
    for k, v in card.items():
        if k == 'CardDescription':
            new_card[new_key] = new_val
        else:
            new_card[k] = v
    return new_card, (new_key, desc)


def main():
    path = r'data.json'
    with open(path, encoding='utf-8') as f:
        data = json.load(f)

    cards = data['ActionCards']
    converted_to_roll = []
    converted_to_front = []

    for card_id, card in cards.items():
        new_card, info = convert_card(card)
        cards[card_id] = new_card
        if info:
            new_key, original = info
            if new_key == 'Roll':
                converted_to_roll.append((card_id, original))
            else:
                converted_to_front.append((card_id, original))

    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Converted to Roll ({len(converted_to_roll)}):")
    for card_id, desc in converted_to_roll:
        print(f"  {card_id}: {desc!r}")

    print(f"\nConverted to Front ({len(converted_to_front)}):")
    for card_id, desc in converted_to_front:
        print(f"  {card_id}: {desc!r}")


if __name__ == '__main__':
    main()
